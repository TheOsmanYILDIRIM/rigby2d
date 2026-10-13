// SPDX-License-Identifier: MIT
// Project files, art import (PSD / PNG) and game export (JSON + packed atlas).
// File access goes through the Tauri fs plugin; PNG coding uses the webview's canvas.

import { mkdir, readFile, readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { readPsd } from 'ag-psd';

import { transform } from '../core/math.js';
import { Pose } from '../core/pose.js';
import { Skeleton, makeAttachment, makeSlot, uniqueName } from '../core/model.js';
import { cropCanvas } from './images.js';
import { pack } from './pack.js';

const IMAGE_DIR = 'images';

// ---- paths ------------------------------------------------------------------------------------

const SEP = /[\\/]/;

export function dirname(path) {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i < 0 ? '.' : path.slice(0, i) || path.slice(0, 1);
}

export function basename(path) {
  return path.split(SEP).pop();
}

export function stem(path) {
  const base = basename(path);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

export function withExtension(path, ext) {
  const dir = dirname(path);
  const name = `${stem(path)}.${ext}`;
  return dir === '.' && !SEP.test(path) ? name : joinPath(dir, name);
}

export function joinPath(dir, rel) {
  const sep = dir.includes('\\') ? '\\' : '/';
  const parts = rel.split(SEP).filter(Boolean);
  return [dir.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

// ---- PNG coding -------------------------------------------------------------------------------

export async function decodeImage(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export async function encodePng(canvas) {
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

async function loadImage(path) {
  return decodeImage(await readFile(path));
}

// ---- projects ---------------------------------------------------------------------------------

/** Loads a `.rigby` project and its images. Returns { doc, warnings } (e.g. missing images). */
export async function openProject(path, images) {
  const json = await readTextFile(path).catch((e) => {
    throw new Error(`reading ${path}: ${e}`);
  });
  const doc = Skeleton.fromJson(json);
  const dir = dirname(path);
  const loaded = new Map();
  const warnings = [];
  if (doc.atlas) {
    // An exported file: cut regions back out of the atlas.
    const sheet = await loadImage(joinPath(dir, doc.atlas.image)).catch((e) => {
      throw new Error(`loading atlas ${doc.atlas.image}: ${e}`);
    });
    for (const r of doc.atlas.regions) loaded.set(r.name, cropCanvas(sheet, r.x, r.y, r.width, r.height));
  }
  for (const asset of doc.images) {
    if (!asset.path) continue;
    try {
      loaded.set(asset.name, await loadImage(joinPath(dir, asset.path)));
    } catch (e) {
      warnings.push(`${asset.path}: ${e}`);
    }
  }
  images.clear();
  for (const [name, canvas] of loaded) images.insert(name, canvas);
  return { doc, warnings };
}

function sanitize(name) {
  return Array.from(name, (c) => (/[\p{L}\p{N}_-]/u.test(c) ? c : '_')).join('');
}

/** Saves the project JSON and writes every image into an `images/` folder next to it. */
export async function saveProject(path, doc, images) {
  const imgDir = joinPath(dirname(path), IMAGE_DIR);
  await mkdir(imgDir, { recursive: true });
  for (const asset of doc.images) {
    const canvas = images.get(asset.name);
    if (!canvas) continue;
    const file = `${sanitize(asset.name)}.png`;
    await writeFile(joinPath(imgDir, file), await encodePng(canvas)).catch((e) => {
      throw new Error(`writing image ${file}: ${e}`);
    });
    asset.path = `${IMAGE_DIR}/${file}`;
  }
  doc.atlas = null;
  await writeTextFile(path, doc.toJson()).catch((e) => {
    throw new Error(`writing ${path}: ${e}`);
  });
}

/** Exports `<name>.json` plus a packed `<name>.png` atlas. Returns the atlas path. */
export async function exportForGames(path, doc, images) {
  const used = [...new Set(doc.slots.flatMap((s) => s.attachments.map((a) => a.image)))].sort();
  const items = used.map((name) => {
    const canvas = images.get(name);
    if (!canvas) throw new Error(`image '${name}' is missing`);
    return { name, width: canvas.width, height: canvas.height, canvas };
  });
  const { width, height, regions } = pack(items);
  const sheet = document.createElement('canvas');
  sheet.width = width;
  sheet.height = height;
  const ctx = sheet.getContext('2d');
  for (const r of regions) ctx.drawImage(items.find((i) => i.name === r.name).canvas, r.x, r.y);
  const atlasPath = withExtension(path, 'png');
  await writeFile(atlasPath, await encodePng(sheet)).catch((e) => {
    throw new Error(`writing ${atlasPath}: ${e}`);
  });
  const out = doc.clone();
  out.images = [];
  out.atlas = { image: basename(atlasPath), width, height, regions };
  for (const a of out.animations) a.prune();
  await writeTextFile(path, out.toJson()).catch((e) => {
    throw new Error(`writing ${path}: ${e}`);
  });
  return atlasPath;
}

// ---- import -----------------------------------------------------------------------------------

function uniqueImageName(doc, images, base) {
  base = base.trim() || 'image';
  return uniqueName(base, (n) => images.contains(n) || doc.images.some((i) => i.name === n));
}

/** Adds an image and a slot showing it on `bone`, placed at `world` position in the setup pose. */
function addImageSlot(doc, images, base, canvas, bone, world, visible) {
  const name = uniqueImageName(doc, images, base);
  const { width: w, height: h } = canvas;
  images.insert(name, canvas);
  doc.images.push({ name, path: null, width: w, height: h });
  const setup = new Pose(doc);
  const local = setup.world[bone].inverse().apply(world);
  const att = makeAttachment(name, name, transform(local[0], local[1], 0), w, h);
  const slot = makeSlot(doc.uniqueSlotName(name), bone, att);
  if (!visible) slot.attachment = null;
  doc.slots.push(slot);
}

/** Flattens PSD layer groups into pixel layers, bottom-most first. */
function pixelLayers(children, parentHidden = false, out = []) {
  for (const layer of children ?? []) {
    const hidden = parentHidden || !!layer.hidden;
    if (layer.children) pixelLayers(layer.children, hidden, out);
    else if (layer.canvas) out.push({ layer, hidden });
  }
  return out;
}

/**
 * Imports every pixel layer of a PSD as an image + slot on the root bone, keeping layout.
 * The canvas' bottom-center becomes the origin. Returns the number of layers imported.
 */
export async function importPsd(path, doc, images) {
  const bytes = await readFile(path);
  const psd = readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  const cw = psd.width;
  const ch = psd.height;
  let count = 0;
  // ag-psd lists layers bottom-most first, which matches slot draw order (back to front).
  for (const { layer, hidden } of pixelLayers(psd.children)) {
    const left = layer.left ?? 0;
    const top = layer.top ?? 0;
    const l = Math.max(0, left);
    const t = Math.max(0, top);
    const r = Math.max(0, Math.min(cw, layer.right ?? left + layer.canvas.width));
    const b = Math.max(0, Math.min(ch, layer.bottom ?? top + layer.canvas.height));
    if (r <= l || b <= t) continue;
    const crop = document.createElement('canvas');
    crop.width = r - l;
    crop.height = b - t;
    const ctx = crop.getContext('2d');
    ctx.globalAlpha = layer.opacity ?? 1;
    ctx.drawImage(layer.canvas, left - l, top - t);
    const cx = (l + r) * 0.5 - cw * 0.5;
    const cy = ch - (t + b) * 0.5;
    addImageSlot(doc, images, layer.name ?? 'layer', crop, 0, [cx, cy], !hidden);
    count++;
  }
  if (count === 0) throw new Error('no pixel layers found');
  if (doc.name === 'untitled') doc.name = stem(path);
  return count;
}

/** Imports PNG files as slots on `bone`, laid out side by side above the origin. */
export async function importPngs(paths, bone, doc, images) {
  let x = 0;
  for (const p of paths) {
    const canvas = await loadImage(p).catch((e) => {
      throw new Error(`loading ${p}: ${e}`);
    });
    const { width: w, height: h } = canvas;
    addImageSlot(doc, images, stem(p), canvas, bone, [x + w * 0.5, h * 0.5], true);
    x += w + 10;
  }
  return paths.length;
}

