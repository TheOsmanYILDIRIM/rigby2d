// SPDX-License-Identifier: MIT
// Binary skeleton files (".skel"), format 4.3. Converts between the binary encoding and the
// skeleton JSON object structure, so all other code works with one representation.
//
// The layout was determined clean-room by comparing paired JSON and binary exports of the same
// skeleton (black-box observation of exported data). Only features present in those samples are
// supported; anything else stops with a clear error instead of producing a guessed encoding.
// Supported: header, bones, slots, IK constraints, the default skin with region and mesh
// attachments, events, and animations with bone, slot attachment/rgba, IK, draw order and event
// timelines.
//
// Encoding: big-endian floats/ints; varints (7 bits per byte, low bits first; signed values are
// zig-zag encoded); strings are a varint byte length + 1 (0 = null) then UTF-8; "ref" strings are
// a varint index + 1 into a shared string table (0 = null).

import { VERSION_FIELD } from './interop.js';

const INHERIT = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection'];
const BLEND = ['normal', 'additive', 'multiply', 'screen'];
/** Bone timeline type ids, timeline names and value counts. */
const BONE_TIMELINES = [
  ['rotate', 1],
  ['translate', 2],
  ['translatex', 1],
  ['translatey', 1],
  ['scale', 2],
  ['scalex', 1],
  ['scaley', 1],
  ['shear', 2],
  ['shearx', 1],
  ['sheary', 1],
];
const SLOT_ATTACHMENT = 0;
const SLOT_RGBA = 1;
const ATTACHMENT_REGION = 0;
const ATTACHMENT_MESH = 2;
const FLAG_PATH = 0x10;
const FLAG_WEIGHTED = 0x80;
const CURVE_LINEAR = 0;
const CURVE_STEPPED = 1;
const CURVE_BEZIER = 2;
const DEFAULT_BONE_COLOR = '9b9b9bff';
/** Constraint and animation sections whose encoding is not known yet (always empty here). */
const UNKNOWN_ANIMATION_SECTIONS = 5;

class Unsupported extends Error {
  constructor(what) {
    super(`${what} is not supported in .skel files yet; use skeleton JSON for this skeleton`);
    this.name = 'Unsupported';
  }
}

// ---- reading ----------------------------------------------------------------------------------

class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.p = 0;
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.strings = [];
    this.dec = new TextDecoder();
  }
  check(n) {
    if (this.p + n > this.b.length) throw new Error('unexpected end of .skel data');
  }
  byte() {
    this.check(1);
    return this.b[this.p++];
  }
  bool() {
    return this.byte() !== 0;
  }
  float() {
    this.check(4);
    const v = this.v.getFloat32(this.p);
    this.p += 4;
    return shortestFloat(v);
  }
  uint() {
    this.check(4);
    const v = this.v.getUint32(this.p);
    this.p += 4;
    return v;
  }
  varint(positive = true) {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = this.byte();
      result |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80 && shift < 35);
    return positive ? result >>> 0 : (result >>> 1) ^ -(result & 1);
  }
  string() {
    const n = this.varint();
    if (n === 0) return null;
    if (n === 1) return '';
    this.check(n - 1);
    const s = this.dec.decode(this.b.subarray(this.p, this.p + n - 1));
    this.p += n - 1;
    return s;
  }
  ref() {
    const i = this.varint();
    if (i === 0) return null;
    if (i > this.strings.length) throw new Error('invalid string reference in .skel data');
    return this.strings[i - 1];
  }
  color() {
    return this.uint().toString(16).padStart(8, '0');
  }
}

/** The shortest decimal that encodes back to the same 32-bit float. */
function shortestFloat(v) {
  if (!Number.isFinite(v) || v === 0) return v === 0 ? 0 : v;
  for (let digits = 6; digits <= 9; digits++) {
    const d = +v.toPrecision(digits);
    if (Math.fround(d) === v) return d;
  }
  return v;
}

const isSkel = (bytes) => bytes.length > 9 && bytes[8] > 1 && bytes[8] < 64;

/** True when `bytes` look like a binary skeleton (hash, then a version string). */
export function isSkeletonBinary(bytes) {
  if (!isSkel(bytes)) return false;
  const len = bytes[8] - 1;
  const text = new TextDecoder().decode(bytes.subarray(9, 9 + len));
  return /^\d+\.\d+/.test(text);
}

function toBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, '');
}

function fromBase64(text) {
  try {
    const raw = atob(text.padEnd(Math.ceil(text.length / 4) * 4, '='));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * Converts a binary skeleton into the skeleton JSON object structure (4.3 field names). Fields
 * that only exist in the binary encoding are kept under `_`-prefixed keys so they survive edits.
 */
export function readSkeletonBinary(bytes) {
  const r = new Reader(bytes);
  const hash = toBase64(bytes.subarray(0, 8));
  r.p = 8;
  const version = r.string();
  if (!/^4\.3/.test(version ?? '')) throw new Unsupported(`Binary format ${version}`);
  const skeleton = { hash, [VERSION_FIELD]: version, x: r.float(), y: r.float(), width: r.float(), height: r.float() };
  const referenceScale = r.float();
  if (referenceScale !== 100) skeleton.referenceScale = referenceScale;
  const nonessential = r.bool();
  if (nonessential) {
    const fps = r.float();
    if (fps !== 30) skeleton.fps = fps;
    skeleton.images = r.string();
    skeleton.audio = r.string();
  }
  const out = { skeleton, _strings: [] };
  const nStrings = r.varint();
  for (let i = 0; i < nStrings; i++) r.strings.push(r.string());
  out._strings = r.strings.slice();

  // Bones.
  out.bones = [];
  const nBones = r.varint();
  for (let i = 0; i < nBones; i++) {
    const b = { name: r.string() };
    if (i > 0) b.parent = out.bones[r.varint()].name;
    const rotation = r.float();
    const x = r.float();
    const y = r.float();
    const scaleX = r.float();
    const scaleY = r.float();
    const shearX = r.float();
    const shearY = r.float();
    const inherit = INHERIT[r.byte()] ?? 'normal';
    const length = r.float();
    if (length) b.length = length;
    if (rotation) b.rotation = rotation;
    if (x) b.x = x;
    if (y) b.y = y;
    if (scaleX !== 1) b.scaleX = scaleX;
    if (scaleY !== 1) b.scaleY = scaleY;
    if (shearX) b.shearX = shearX;
    if (shearY) b.shearY = shearY;
    if (inherit !== 'normal') b.inherit = inherit;
    if (r.bool()) b.skin = true;
    if (nonessential) {
      const color = r.color();
      if (color !== DEFAULT_BONE_COLOR) b.color = color;
      const icon = r.string();
      if (icon !== null) b.icon = icon;
      // Editor-only values; kept only when they differ from the defaults.
      const iconA = r.float();
      const iconB = r.float();
      const visible = r.bool();
      if (iconA !== 1) b._iconA = iconA;
      if (iconB !== 0) b._iconB = iconB;
      if (!visible) b._visible = false;
    }
    out.bones.push(b);
  }

  // Slots.
  out.slots = [];
  const nSlots = r.varint();
  for (let i = 0; i < nSlots; i++) {
    const s = { name: r.string(), bone: out.bones[r.varint()].name };
    const color = r.color();
    const dark = r.color();
    if (color !== 'ffffffff') s.color = color;
    if (dark !== 'ffffffff') s.dark = dark.slice(0, 6);
    const attachment = r.ref();
    if (attachment !== null) s.attachment = attachment;
    const blend = BLEND[r.byte()] ?? 'normal';
    if (blend !== 'normal') s.blend = blend;
    if (nonessential && !r.bool()) s._visible = false;
    out.slots.push(s);
  }

  // Constraints (IK only).
  out.constraints = [];
  const nConstraints = r.varint();
  for (let i = 0; i < nConstraints; i++) {
    const name = r.string();
    const type = r.byte();
    if (type !== 0) throw new Unsupported(`Constraint type ${type} ('${name}')`);
    const bones = [];
    const n = r.varint();
    for (let k = 0; k < n; k++) bones.push(out.bones[r.varint()].name);
    const target = out.bones[r.varint()].name;
    const flags = r.byte();
    if (flags & ~0x24) throw new Unsupported(`IK constraint options (flags 0x${flags.toString(16)}) on '${name}'`);
    const c = { type: 'ik', name, target, bones };
    if (flags & 0x04) c.bendPositive = false;
    out.constraints.push(c);
  }

  // Skins: the default skin, then named skins.
  out.skins = [{ name: 'default', attachments: readSkin(r, out, nonessential) }];
  if (r.varint() !== 0) throw new Unsupported('Additional skins');

  // Events.
  out.events = {};
  const eventNames = [];
  const nEvents = r.varint();
  for (let i = 0; i < nEvents; i++) {
    const name = r.string();
    const e = {};
    const int = r.varint(false);
    const float = r.float();
    const string = r.string();
    const audio = r.string();
    if (int) e.int = int;
    if (float) e.float = float;
    if (string) e.string = string;
    if (audio !== null) {
      e.audio = audio;
      e.volume = r.float();
      e.balance = r.float();
    }
    out.events[name] = e;
    eventNames.push(name);
  }

  // Animations.
  out.animations = {};
  const nAnimations = r.varint();
  for (let i = 0; i < nAnimations; i++) {
    const name = r.string();
    out.animations[name] = readAnimation(r, out, eventNames);
  }
  if (r.p !== bytes.length) throw new Error(`unexpected data after the animations (${bytes.length - r.p} bytes)`);
  return out;
}

function readSkin(r, out, nonessential) {
  const skin = {};
  const nSlots = r.varint();
  for (let i = 0; i < nSlots; i++) {
    const slot = out.slots[r.varint()].name;
    const atts = (skin[slot] = {});
    const n = r.varint();
    for (let k = 0; k < n; k++) {
      const key = r.ref();
      const flags = r.byte();
      atts[key] = readAttachment(r, flags, key, nonessential);
    }
  }
  return skin;
}

function readAttachment(r, flags, key, nonessential) {
  const type = flags & 0x0f;
  const known = FLAG_PATH | FLAG_WEIGHTED | 0x0f;
  if (flags & ~known) throw new Unsupported(`Attachment options (flags 0x${flags.toString(16)}) on '${key}'`);
  const a = {};
  if (type === ATTACHMENT_REGION) {
    if ((flags & 0xe0) !== 0x80) a._flags = flags;
    if (flags & FLAG_PATH) a.path = r.ref();
    a.rotation = r.float();
    a.x = r.float();
    a.y = r.float();
    a.scaleX = r.float();
    a.scaleY = r.float();
    a.width = r.float();
    a.height = r.float();
    for (const [k, def] of [['rotation', 0], ['x', 0], ['y', 0], ['scaleX', 1], ['scaleY', 1]]) if (a[k] === def) delete a[k];
    return a;
  }
  if (type !== ATTACHMENT_MESH) throw new Unsupported(`Attachment type ${type} ('${key}')`);
  a.type = 'mesh';
  if (flags & FLAG_PATH) a.path = r.ref();
  a.hull = r.varint();
  const count = r.varint();
  a.vertices = [];
  if (flags & FLAG_WEIGHTED) {
    r.varint(); // size hint: bone counts + bone indices
    for (let v = 0; v < count; v++) {
      const n = r.varint();
      a.vertices.push(n);
      for (let k = 0; k < n; k++) a.vertices.push(r.varint(), r.float(), r.float(), r.float());
    }
  } else {
    for (let k = 0; k < count * 2; k++) a.vertices.push(r.float());
  }
  a.uvs = [];
  for (let k = 0; k < count * 2; k++) a.uvs.push(r.float());
  a.triangles = [];
  for (let k = 0; k < 3 * (2 * count - a.hull - 2); k++) a.triangles.push(r.varint());
  const sequence = r.byte();
  if (sequence !== 0) throw new Unsupported(`Mesh sequences ('${key}')`);
  if (nonessential) {
    const ne = r.varint();
    a.edges = [];
    for (let k = 0; k < ne; k++) a.edges.push(r.varint());
    a.width = r.float();
    a.height = r.float();
  }
  return a;
}

/** Reads keys of `n` values; the curve of a segment follows the segment's second key. */
function readCurveKeys(r, frames, read) {
  const keys = [];
  for (let f = 0; f < frames; f++) {
    const key = { time: r.float() };
    const n = read(r, key);
    if (f > 0) {
      const type = r.byte();
      const prev = keys[f - 1];
      if (type === CURVE_STEPPED) prev.curve = 'stepped';
      else if (type === CURVE_BEZIER) {
        prev.curve = [];
        for (let i = 0; i < 4 * n; i++) prev.curve.push(r.float());
      } else if (type !== CURVE_LINEAR) throw new Error(`invalid curve type ${type}`);
    }
    keys.push(key);
  }
  for (const k of keys) if (k.time === 0) delete k.time;
  return keys;
}

function readAnimation(r, out, eventNames) {
  const anim = {};
  r.varint(); // total timeline count
  const nSlots = r.varint();
  for (let i = 0; i < nSlots; i++) {
    const slot = out.slots[r.varint()].name;
    const timelines = ((anim.slots ??= {})[slot] = {});
    const n = r.varint();
    for (let t = 0; t < n; t++) {
      const type = r.byte();
      const frames = r.varint();
      if (type === SLOT_ATTACHMENT) {
        timelines.attachment = [];
        for (let f = 0; f < frames; f++) {
          const time = r.float();
          const name = r.ref();
          const key = {};
          if (time) key.time = time;
          if (name !== null) key.name = name;
          timelines.attachment.push(key);
        }
      } else if (type === SLOT_RGBA) {
        r.varint(); // bezier count
        timelines.rgba = readCurveKeys(r, frames, (rr, key) => {
          key.color = rr.color();
          return 4;
        });
      } else {
        throw new Unsupported(`Slot timeline type ${type}`);
      }
    }
  }
  const nBones = r.varint();
  for (let i = 0; i < nBones; i++) {
    const bone = out.bones[r.varint()].name;
    const timelines = ((anim.bones ??= {})[bone] = {});
    const n = r.varint();
    for (let t = 0; t < n; t++) {
      const type = r.byte();
      const frames = r.varint();
      r.varint(); // bezier count
      const spec = BONE_TIMELINES[type];
      if (!spec) throw new Unsupported(`Bone timeline type ${type}`);
      const [kind, count] = spec;
      const def = kind.startsWith('scale') ? 1 : 0;
      timelines[kind] = readCurveKeys(r, frames, (rr, key) => {
        if (count === 1) {
          const v = rr.float();
          if (v !== def) key.value = v;
        } else {
          const x = rr.float();
          const y = rr.float();
          if (x !== def) key.x = x;
          if (y !== def) key.y = y;
        }
        return count;
      });
    }
  }
  const nIk = r.varint();
  for (let i = 0; i < nIk; i++) {
    const constraint = out.constraints[r.varint()].name;
    const frames = r.varint();
    if (r.varint() !== 0) throw new Unsupported('Curved IK keys');
    const keys = ((anim.ik ??= {})[constraint] = []);
    for (let f = 0; f < frames; f++) {
      const flags = r.byte();
      if (flags & 0xc0) throw new Unsupported('Curved IK keys');
      const key = {};
      const time = r.float();
      if (time) key.time = time;
      if (!(flags & 0x01)) key.mix = 0;
      else if (flags & 0x02) key.mix = r.float();
      if (flags & 0x04) key.softness = r.float();
      if (!(flags & 0x08)) key.bendPositive = false;
      if (flags & 0x10) key.compress = true;
      if (flags & 0x20) key.stretch = true;
      keys.push(key);
    }
  }
  for (let s = 0; s < UNKNOWN_ANIMATION_SECTIONS; s++) {
    if (r.varint() !== 0) throw new Unsupported('Transform, path or physics constraint keys, or deform keys');
  }
  const nDraw = r.varint();
  for (let i = 0; i < nDraw; i++) {
    const key = {};
    const time = r.float();
    if (time) key.time = time;
    const n = r.varint();
    if (n) key.offsets = [];
    for (let k = 0; k < n; k++) key.offsets.push({ slot: out.slots[r.varint()].name, offset: r.varint() | 0 });
    (anim.drawOrder ??= []).push(key);
  }
  if (r.varint() !== 0) throw new Unsupported('An unknown animation section');
  const nEvents = r.varint();
  for (let i = 0; i < nEvents; i++) {
    const key = { time: r.float(), name: eventNames[r.varint()] };
    const int = r.varint(false);
    const float = r.float();
    const def = out.events[key.name] ?? {};
    if (int !== (def.int ?? 0)) key.int = int;
    if (float !== (def.float ?? 0)) key.float = float;
    if (r.bool()) key.string = r.string();
    if (def.audio) {
      key.volume = r.float();
      key.balance = r.float();
    }
    (anim.events ??= []).push(key);
  }
  const color = r.color();
  if (color !== 'ffffffff') anim._color = color;
  return anim;
}

// ---- writing ----------------------------------------------------------------------------------

class Writer {
  constructor(strings) {
    this.buf = new Uint8Array(1 << 16);
    this.p = 0;
    this.enc = new TextEncoder();
    this.strings = strings;
    this.index = new Map();
    strings.forEach((s, i) => {
      if (!this.index.has(s)) this.index.set(s, i);
    });
  }
  ensure(n) {
    if (this.p + n <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.p + n));
    next.set(this.buf);
    this.buf = next;
  }
  byte(v) {
    this.ensure(1);
    this.buf[this.p++] = v & 0xff;
  }
  bool(v) {
    this.byte(v ? 1 : 0);
  }
  bytes(b) {
    this.ensure(b.length);
    this.buf.set(b, this.p);
    this.p += b.length;
  }
  float(v) {
    this.ensure(4);
    new DataView(this.buf.buffer).setFloat32(this.p, v);
    this.p += 4;
  }
  uint(v) {
    this.ensure(4);
    new DataView(this.buf.buffer).setUint32(this.p, v >>> 0);
    this.p += 4;
  }
  varint(v, positive = true) {
    let u = positive ? v >>> 0 : ((v << 1) ^ (v >> 31)) >>> 0;
    do {
      let b = u & 0x7f;
      u >>>= 7;
      if (u) b |= 0x80;
      this.byte(b);
    } while (u);
  }
  string(s) {
    if (s === null || s === undefined) return this.varint(0);
    const b = this.enc.encode(s);
    this.varint(b.length + 1);
    this.bytes(b);
  }
  ref(s) {
    if (s === null || s === undefined) return this.varint(0);
    let i = this.index.get(s);
    if (i === undefined) {
      i = this.strings.length;
      this.strings.push(s);
      this.index.set(s, i);
    }
    this.varint(i + 1);
  }
  color(hex, def = 'ffffffff') {
    const h = (hex ?? def).toLowerCase();
    this.uint(parseInt((h.length === 6 ? `${h}ff` : h).slice(0, 8), 16));
  }
  result() {
    return this.buf.slice(0, this.p);
  }
}

/** Collects every string written as a reference, in the order the writer uses them. */
function collectRefs(json) {
  const refs = [];
  for (const s of json.slots ?? []) if (s.attachment) refs.push(s.attachment);
  for (const skin of json.skins ?? []) {
    for (const atts of Object.values(skin.attachments ?? {})) {
      for (const [key, a] of Object.entries(atts)) {
        refs.push(key);
        if (a.path !== undefined) refs.push(a.path);
      }
    }
  }
  for (const anim of Object.values(json.animations ?? {})) {
    for (const timelines of Object.values(anim.slots ?? {})) for (const k of timelines.attachment ?? []) if (k.name) refs.push(k.name);
  }
  return refs;
}

/**
 * Converts a skeleton JSON object (4.3 field names, e.g. from `writeSkeletonJson(sk, { version:
 * '4.3', binary: true })`) into binary `.skel` bytes. Throws for features the binary encoding
 * does not support yet.
 */
export function writeSkeletonBinary(json) {
  for (const key of ['ik', 'transform', 'path', 'physics']) if (json[key]?.length) throw new Unsupported('A pre-4.3 constraint layout');
  // The string table: keep an imported file's table (so unchanged files encode identically), then
  // add any new references.
  const strings = (json._strings ?? []).slice();
  const known = new Set(strings);
  for (const s of collectRefs(json)) {
    if (!known.has(s)) {
      known.add(s);
      strings.push(s);
    }
  }
  const head = new Writer([]);
  const w = new Writer(strings);
  const sk = json.skeleton ?? {};
  const hash = fromBase64(sk.hash ?? '');
  for (let i = 0; i < 8; i++) head.byte(hash[i] ?? 0);
  head.string(String(sk[VERSION_FIELD] ?? '4.3.0'));
  for (const k of ['x', 'y', 'width', 'height']) head.float(sk[k] ?? 0);
  head.float(sk.referenceScale ?? 100);
  head.bool(true);
  head.float(sk.fps ?? 30);
  head.string(sk.images ?? null);
  head.string(sk.audio ?? null);

  const boneIndex = new Map((json.bones ?? []).map((b, i) => [b.name, i]));
  const slotIndex = new Map((json.slots ?? []).map((s, i) => [s.name, i]));
  const constraintIndex = new Map();

  w.varint(json.bones.length);
  json.bones.forEach((b, i) => {
    w.string(b.name);
    if (i > 0) w.varint(boneIndex.get(b.parent));
    for (const [k, def] of [['rotation', 0], ['x', 0], ['y', 0], ['scaleX', 1], ['scaleY', 1], ['shearX', 0], ['shearY', 0]]) w.float(b[k] ?? def);
    w.byte(Math.max(0, INHERIT.indexOf(b.inherit ?? b.transform ?? 'normal')));
    w.float(b.length ?? 0);
    w.bool(!!b.skin);
    w.color(b.color, DEFAULT_BONE_COLOR);
    w.string(b.icon ?? null);
    w.float(b._iconA ?? 1);
    w.float(b._iconB ?? 0);
    w.bool(b._visible ?? true);
  });

  w.varint((json.slots ?? []).length);
  for (const s of json.slots ?? []) {
    w.string(s.name);
    w.varint(boneIndex.get(s.bone));
    w.color(s.color);
    w.color(s.dark ? `${s.dark.slice(0, 6)}ff` : null);
    w.ref(s.attachment ?? null);
    w.byte(Math.max(0, BLEND.indexOf(s.blend ?? 'normal')));
    w.bool(s._visible ?? true);
  }

  const constraints = json.constraints ?? [];
  w.varint(constraints.length);
  constraints.forEach((c, i) => {
    if (c.type !== 'ik') throw new Unsupported(`'${c.type}' constraints`);
    if ((c.mix ?? 1) !== 1 || c.softness || c.compress || c.stretch || c.uniform || c.skin) {
      throw new Unsupported(`IK constraint options other than bend direction ('${c.name}')`);
    }
    constraintIndex.set(c.name, i);
    w.string(c.name);
    w.byte(0);
    w.varint(c.bones.length);
    for (const b of c.bones) w.varint(boneIndex.get(b));
    w.varint(boneIndex.get(c.target));
    w.byte(0x20 | (c.bendPositive === false ? 0x04 : 0));
  });

  const skins = json.skins ?? [];
  const defaultSkin = skins.find((s) => s.name === 'default') ?? { attachments: {} };
  if (skins.some((s) => s.name !== 'default')) throw new Unsupported('Additional skins');
  const slotsWithAttachments = Object.entries(defaultSkin.attachments ?? {});
  w.varint(slotsWithAttachments.length);
  for (const [slot, atts] of slotsWithAttachments) {
    w.varint(slotIndex.get(slot));
    const entries = Object.entries(atts);
    w.varint(entries.length);
    for (const [key, a] of entries) writeAttachment(w, key, a);
  }
  w.varint(0); // additional skins

  const eventNames = Object.keys(json.events ?? {});
  w.varint(eventNames.length);
  for (const name of eventNames) {
    const e = json.events[name];
    w.string(name);
    w.varint(e.int ?? 0, false);
    w.float(e.float ?? 0);
    w.string(e.string ?? '');
    w.string(e.audio ?? null);
    if (e.audio) {
      w.float(e.volume ?? 1);
      w.float(e.balance ?? 0);
    }
  }

  const animations = Object.entries(json.animations ?? {});
  w.varint(animations.length);
  for (const [name, anim] of animations) {
    w.string(name);
    writeAnimation(w, anim, { boneIndex, slotIndex, constraintIndex, eventNames, events: json.events ?? {} });
  }

  // Header, then the (possibly extended) string table, then the body.
  const table = new Writer([]);
  table.varint(w.strings.length);
  for (const s of w.strings) table.string(s);
  const parts = [head.result(), table.result(), w.result()];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

function writeAttachment(w, key, a) {
  const type = a.type ?? 'region';
  if (type !== 'region' && type !== 'mesh') throw new Unsupported(`'${type}' attachments ('${key}')`);
  if (a.sequence !== undefined) throw new Unsupported(`Sequences ('${key}')`);
  if (a.color && a.color.toLowerCase() !== 'ffffffff') throw new Unsupported(`Attachment colors ('${key}')`);
  if (a.name !== undefined && a.name !== key) throw new Unsupported(`Attachment names that differ from their key ('${key}')`);
  w.ref(key);
  if (type === 'region') {
    let flags = (a._flags ?? 0x80) & ~FLAG_PATH & ~0x0f;
    if (a.path !== undefined) flags |= FLAG_PATH;
    w.byte(flags | ATTACHMENT_REGION);
    if (a.path !== undefined) w.ref(a.path);
    for (const [k, def] of [['rotation', 0], ['x', 0], ['y', 0], ['scaleX', 1], ['scaleY', 1], ['width', 0], ['height', 0]]) w.float(a[k] ?? def);
    return;
  }
  const count = a.uvs.length / 2;
  const weighted = a.vertices.length > a.uvs.length;
  if (a.triangles.length !== 3 * (2 * count - a.hull - 2)) {
    throw new Unsupported(`Meshes whose triangle count is not 2 x vertices - hull - 2 ('${key}')`);
  }
  w.byte((weighted ? FLAG_WEIGHTED : 0) | (a.path !== undefined ? FLAG_PATH : 0) | ATTACHMENT_MESH);
  if (a.path !== undefined) w.ref(a.path);
  w.varint(a.hull);
  w.varint(count);
  if (weighted) {
    let hint = 0;
    for (let i = 0; i < a.vertices.length; ) {
      const n = a.vertices[i];
      hint += 1 + n;
      i += 1 + n * 4;
    }
    w.varint(hint);
    for (let i = 0; i < a.vertices.length; ) {
      const n = a.vertices[i++];
      w.varint(n);
      for (let k = 0; k < n; k++) {
        w.varint(a.vertices[i++]);
        w.float(a.vertices[i++]);
        w.float(a.vertices[i++]);
        w.float(a.vertices[i++]);
      }
    }
  } else {
    for (const v of a.vertices) w.float(v);
  }
  for (const v of a.uvs) w.float(v);
  for (const t of a.triangles) w.varint(t);
  w.byte(0); // no sequence
  const edges = a.edges ?? [];
  w.varint(edges.length);
  for (const e of edges) w.varint(e);
  w.float(a.width ?? 0);
  w.float(a.height ?? 0);
}

/** Writes keys whose segment curves follow the segment's second key. Returns nothing. */
function writeCurveKeys(w, keys, values) {
  keys.forEach((k, f) => {
    w.float(k.time ?? 0);
    for (const v of values(k)) w.float(v);
    if (f > 0) {
      const c = keys[f - 1].curve;
      if (c === 'stepped') w.byte(CURVE_STEPPED);
      else if (Array.isArray(c)) {
        w.byte(CURVE_BEZIER);
        for (const v of c) w.float(v);
      } else w.byte(CURVE_LINEAR);
    }
  });
}

function bezierCount(keys, n) {
  let count = 0;
  for (let f = 0; f + 1 < keys.length; f++) if (Array.isArray(keys[f].curve)) count += n;
  return count;
}

function writeAnimation(w, anim, { boneIndex, slotIndex, constraintIndex, eventNames, events }) {
  for (const key of ['deform', 'attachments', 'transform', 'path', 'physics']) {
    if (anim[key] && Object.keys(anim[key]).length) throw new Unsupported(`'${key}' animation keys`);
  }
  const slots = Object.entries(anim.slots ?? {});
  const bones = Object.entries(anim.bones ?? {});
  const ik = Object.entries(anim.ik ?? {});
  let total = ik.length + (anim.drawOrder?.length ? 1 : 0) + (anim.events?.length ? 1 : 0);
  for (const [, t] of slots) total += Object.keys(t).length;
  for (const [, t] of bones) total += Object.keys(t).length;
  w.varint(total);

  w.varint(slots.length);
  for (const [slot, timelines] of slots) {
    w.varint(slotIndex.get(slot));
    const kinds = Object.entries(timelines);
    w.varint(kinds.length);
    for (const [kind, keys] of kinds) {
      if (kind === 'attachment') {
        w.byte(SLOT_ATTACHMENT);
        w.varint(keys.length);
        for (const k of keys) {
          w.float(k.time ?? 0);
          w.ref(k.name ?? null);
        }
      } else if (kind === 'rgba') {
        w.byte(SLOT_RGBA);
        w.varint(keys.length);
        w.varint(bezierCount(keys, 4));
        keys.forEach((k, f) => {
          w.float(k.time ?? 0);
          w.color(k.color);
          if (f > 0) {
            const c = keys[f - 1].curve;
            if (c === 'stepped') w.byte(CURVE_STEPPED);
            else if (Array.isArray(c)) {
              w.byte(CURVE_BEZIER);
              for (const v of c) w.float(v);
            } else w.byte(CURVE_LINEAR);
          }
        });
      } else {
        throw new Unsupported(`'${kind}' slot keys`);
      }
    }
  }

  w.varint(bones.length);
  for (const [bone, timelines] of bones) {
    w.varint(boneIndex.get(bone));
    const kinds = Object.entries(timelines);
    w.varint(kinds.length);
    for (const [kind, keys] of kinds) {
      const type = BONE_TIMELINES.findIndex(([k]) => k === kind);
      if (type < 0) throw new Unsupported(`'${kind}' bone keys`);
      const n = BONE_TIMELINES[type][1];
      const def = kind.startsWith('scale') ? 1 : 0;
      w.byte(type);
      w.varint(keys.length);
      w.varint(bezierCount(keys, n));
      writeCurveKeys(w, keys, (k) => (n === 1 ? [k.value ?? k.angle ?? def] : [k.x ?? def, k.y ?? def]));
    }
  }

  w.varint(ik.length);
  for (const [name, keys] of ik) {
    w.varint(constraintIndex.get(name));
    w.varint(keys.length);
    w.varint(0);
    for (const k of keys) {
      if (k.curve !== undefined && k.curve !== 'linear') throw new Unsupported('Curved IK keys');
      const mix = k.mix ?? 1;
      let flags = 0;
      if (mix !== 0) flags |= 0x01;
      if (mix !== 1) flags |= 0x02;
      if (k.softness) flags |= 0x04;
      if (k.bendPositive !== false) flags |= 0x08;
      if (k.compress) flags |= 0x10;
      if (k.stretch) flags |= 0x20;
      w.byte(flags);
      w.float(k.time ?? 0);
      if ((flags & 0x03) === 0x03) w.float(mix);
      if (flags & 0x04) w.float(k.softness);
    }
  }

  for (let s = 0; s < UNKNOWN_ANIMATION_SECTIONS; s++) w.varint(0);

  const draw = anim.drawOrder ?? anim.draworder ?? [];
  w.varint(draw.length);
  for (const k of draw) {
    w.float(k.time ?? 0);
    const offsets = k.offsets ?? [];
    w.varint(offsets.length);
    for (const o of offsets) {
      w.varint(slotIndex.get(o.slot));
      w.varint(o.offset >>> 0);
    }
  }
  w.varint(0);

  const keys = anim.events ?? [];
  w.varint(keys.length);
  for (const k of keys) {
    const def = events[k.name] ?? {};
    w.float(k.time ?? 0);
    w.varint(eventNames.indexOf(k.name));
    w.varint(k.int ?? def.int ?? 0, false);
    w.float(k.float ?? def.float ?? 0);
    w.bool(k.string !== undefined);
    if (k.string !== undefined) w.string(k.string);
    if (def.audio) {
      w.float(k.volume ?? def.volume ?? 1);
      w.float(k.balance ?? def.balance ?? 0);
    }
  }
  w.color(anim._color ?? 'ffffffff');
}
