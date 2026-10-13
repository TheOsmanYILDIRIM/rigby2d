// SPDX-License-Identifier: MIT
// Editor state, history and document commands.

import { Pose } from '../core/pose.js';
import { Skeleton } from '../core/model.js';
import { remEuclid } from '../core/state.js';
import * as edit from './edit.js';
import { Images } from './images.js';
import * as io from './io.js';
import * as platform from './platform.js';
import * as sample from './sample.js';

export const FPS = 30;

/** Setup: edits change the setup (rest) pose. Animate: edits create keyframes at the current time. */
export const Mode = Object.freeze({ Setup: 'setup', Animate: 'animate' });

export const TOOLS = [
  { id: 'rotate', label: '⟳ Rotate', key: 'R' },
  { id: 'move', label: '✥ Move', key: 'G' },
  { id: 'scale', label: '⤢ Scale', key: 'S' },
  { id: 'create', label: '🦴 Create bone', key: 'B' },
];

/** Snaps a time to the frame grid. */
export function snap(t) {
  return Math.round(t * FPS) / FPS;
}

// Selection is null, { bone: index } or { slot: index }.
export const selBone = (sel) => (sel && sel.bone !== undefined ? sel.bone : null);
export const selSlot = (sel) => (sel && sel.slot !== undefined ? sel.slot : null);

// Dopesheet tracks: { bone, channel }, { slot, channel }, { deform }, { ik }, { drawOrder } or { events }.
// Keys: { track, index }.
export const trackId = (t) => {
  if (t.deform !== undefined) return `d${t.deform}`;
  if (t.ik !== undefined) return `k${t.ik}`;
  if (t.drawOrder) return 'o';
  if (t.events) return 'e';
  if (t.slot !== undefined) return `s${t.slot}:${t.channel ?? 'attachment'}`;
  return `b${t.bone}:${t.channel}`;
};
export const keyEquals = (a, b) => !!a && !!b && a.index === b.index && trackId(a.track) === trackId(b.track);

const errorText = (e) => (e && e.message) || String(e);

export class App {
  constructor() {
    this.doc = new Skeleton();
    this.path = null;
    /** Where Ctrl+S writes without asking: { path, fs }, or null. */
    this.saveTarget = null;
    this.images = new Images();
    this.sel = null;
    this.mode = Mode.Setup;
    this.tool = 'rotate';
    /** Screen offset of the world origin from the viewport center, and zoom. */
    this.view = { panX: 0, panY: 200, zoom: 1 };
    this.anim = null;
    this.time = 0;
    this.playing = false;
    this.looping = true;
    this.selectedKey = null;
    this.status = 'Welcome to Rigby2D. File ▸ New sample to explore, or import a PSD / PNGs.';
    this.showBones = true;
    this.frameRequest = false;
    /** Bumped on every state change so panels know to refresh. */
    this.version = 0;
    this.history = { undo: [], redo: [] };
    /** JSON of the last committed document state, used to coalesce edits into undo steps. */
    this.baseline = this.doc.toJson();
    this.saved = this.baseline;
    this.docJson = this.baseline;
    this.committedVersion = 0;
  }

  changed() {
    this.version++;
  }

  setStatus(text) {
    this.status = text;
    this.changed();
  }

  /** Replaces the document (new/open/sample) and resets editor state. */
  loadDocument(doc, path) {
    this.anim = doc.animations.length ? 0 : null;
    this.doc = doc;
    this.path = path;
    this.sel = null;
    this.selectedKey = null;
    this.time = 0;
    this.playing = false;
    this.history = { undo: [], redo: [] };
    this.docJson = this.baseline = this.saved = doc.toJson();
    this.frameRequest = true;
    this.changed();
  }

  dirty() {
    return this.docJson !== this.saved;
  }

  currentAnimation() {
    return this.anim === null ? undefined : this.doc.animations[this.anim];
  }

  /** Pose shown in the viewport: setup pose, or the current animation frame in animate mode. */
  pose() {
    const pose = new Pose(this.doc);
    const anim = this.currentAnimation();
    if (this.mode === Mode.Animate && anim) {
      pose.apply(this.doc, anim, this.time, 1);
      pose.updateWorld(this.doc);
    }
    return pose;
  }

  undo() {
    this.syncJson();
    const prev = this.history.undo.pop();
    if (prev === undefined) return;
    this.history.redo.push(this.docJson);
    this.restore(prev);
  }

  redo() {
    this.syncJson();
    const next = this.history.redo.pop();
    if (next === undefined) return;
    this.history.undo.push(this.docJson);
    this.restore(next);
  }

  restore(json) {
    this.doc = Skeleton.fromObject(JSON.parse(json));
    this.docJson = this.baseline = json;
    this.selectedKey = null;
    this.sanitize();
    this.committedVersion = ++this.version;
  }

  syncJson() {
    this.docJson = this.doc.toJson();
  }

  /** Clamps selections that may point past the end of the document after structural edits. */
  sanitize() {
    const b = selBone(this.sel);
    const s = selSlot(this.sel);
    if ((b !== null && b >= this.doc.bones.length) || (s !== null && s >= this.doc.slots.length)) this.sel = null;
    if (this.anim !== null && this.anim >= this.doc.animations.length) {
      this.anim = this.doc.animations.length ? this.doc.animations.length - 1 : null;
    }
  }

  /** Records an undo step once an edit gesture has finished (`busy` while dragging or typing). */
  commitHistory(busy) {
    if (busy || this.committedVersion === this.version) return;
    this.committedVersion = this.version;
    this.syncJson();
    if (this.docJson !== this.baseline) {
      this.history.undo.push(this.baseline);
      this.baseline = this.docJson;
      this.history.redo = [];
      if (this.history.undo.length > 200) this.history.undo.shift();
    }
  }

  /** Opens a .rigby work file, or imports skeleton JSON, from `path` on the file system `fs`. */
  async openFrom(path, fs) {
    try {
      const { doc, warnings, imported } = await io.openProject(path, fs, this.images);
      // Imported files are not work files: the first Save asks where to put the .rigby file.
      this.loadDocument(doc, imported ? null : path);
      this.saveTarget = !imported && fs.reusable ? { path, fs } : null;
      const what = imported ? 'Imported' : 'Opened';
      this.setStatus(warnings.length ? `${what} with warnings: ${warnings.join('; ')}` : `${what} ${path}`);
    } catch (e) {
      this.setStatus(`Could not open ${path}: ${errorText(e)}`);
    }
  }

  async confirmDiscard() {
    this.syncJson();
    if (!this.dirty()) return true;
    return platform.confirmDialog('Discard unsaved changes?', 'Unsaved changes');
  }

  async newDocument() {
    if (!(await this.confirmDiscard())) return;
    this.images.clear();
    this.loadDocument(new Skeleton(), null);
    this.saveTarget = null;
    this.setStatus('New project');
  }

  async newSample() {
    if (!(await this.confirmDiscard())) return;
    this.images.clear();
    this.loadDocument(sample.robot(this.images), null);
    this.saveTarget = null;
    this.mode = Mode.Animate;
    this.playing = true;
    this.setStatus('Sample robot loaded: press Space to play/pause, Tab to switch Setup/Animate');
  }

  async openDialog() {
    if (!(await this.confirmDiscard())) return;
    const picked = await this.guard(() => platform.pickProject());
    if (picked) await this.openFrom(picked.path, picked.fs);
  }

  /** Export format version: the imported file's version, or 4.3 for new work. */
  saveVersion() {
    const v = String(this.doc.header?.version ?? '');
    if (v.startsWith('3.')) return '3.8';
    if (/^4.[0-2](.|$)/.test(v)) return '4.2';
    return '4.3';
  }

  /** Saves the `.rigby` work file (the complete document and its images in one file). */
  async save(saveAs) {
    let target = saveAs ? null : this.saveTarget;
    if (!target) {
      const name = `${this.doc.name || 'untitled'}.${io.WORKFILE_EXT}`;
      target = await this.guard(() => platform.pickSaveTarget(name, 'Rigby2D work file', io.WORKFILE_EXT, { single: true }));
      if (!target) return;
    }
    try {
      const { warnings } = await io.saveWorkfile(target.path, target.fs, this.doc, this.images);
      await target.fs.finish();
      this.path = target.path;
      this.saveTarget = target.fs.reusable ? target : null;
      this.syncJson();
      this.baseline = this.saved = this.docJson;
      const note = warnings.length ? ` (warnings: ${warnings.join('; ')})` : '';
      this.setStatus(`Saved ${target.path}${note}`);
    } catch (e) {
      this.setStatus(`Save failed: ${errorText(e)}`);
    }
  }

  /** Writes skeleton JSON (.json + .atlas + .png). `version` is "3.8" or "4.2". */
  async exportSkeletonJson(version) {
    const target = await this.guard(() => platform.pickSaveTarget(`${this.doc.name || 'skeleton'}.json`, 'Skeleton JSON', 'json'));
    if (!target) return;
    try {
      const { atlasPath, warnings } = await io.exportSkeletonJson(target.path, target.fs, this.doc, this.images, version);
      await target.fs.finish();
      const note = warnings.length ? ` (warnings: ${warnings.join('; ')})` : '';
      this.setStatus(`Exported skeleton JSON ${version}: ${target.path} and ${atlasPath}${note}`);
    } catch (e) {
      this.setStatus(`Skeleton JSON export failed: ${errorText(e)}`);
    }
  }

  async importPsd() {
    const [file] = (await this.guard(() => platform.pickImportFiles('Photoshop', ['psd'], false))) ?? [];
    if (!file) return;
    try {
      const n = await io.importPsd(file, this.doc, this.images);
      this.frameRequest = true;
      this.setStatus(`Imported ${n} layers from ${file.name}`);
    } catch (e) {
      this.setStatus(`PSD import failed: ${errorText(e)}`);
    }
  }

  async importImages() {
    const files = (await this.guard(() => platform.pickImportFiles('Images', ['png'], true))) ?? [];
    if (!files.length) return;
    try {
      const n = await io.importPngs(files, selBone(this.sel) ?? 0, this.doc, this.images);
      this.frameRequest = true;
      this.setStatus(`Imported ${n} images`);
    } catch (e) {
      this.setStatus(`Image import failed: ${errorText(e)}`);
    }
  }

  /** Runs a dialog/picker, reporting failures in the status bar. */
  async guard(fn) {
    try {
      return await fn();
    } catch (e) {
      this.setStatus(`Dialog failed: ${errorText(e)}`);
      return null;
    }
  }

  toggleMode() {
    if (this.mode === Mode.Setup) {
      edit.ensureAnimation(this);
      this.mode = Mode.Animate;
    } else {
      this.playing = false;
      this.mode = Mode.Setup;
    }
    this.changed();
  }

  togglePlay() {
    this.playing = !this.playing && this.anim !== null;
    if (this.playing) this.mode = Mode.Animate;
    this.changed();
  }

  stepFrame(dir) {
    this.playing = false;
    const dur = this.currentAnimation()?.duration ?? 0;
    this.time = Math.max(0, Math.round(this.time * FPS) + dir) / FPS;
    if (dur > 0) this.time = Math.min(this.time, dur);
    this.changed();
  }

  advancePlayback(dt) {
    if (!this.playing) return;
    const anim = this.currentAnimation();
    if (!anim) {
      this.playing = false;
      return;
    }
    this.time += Math.min(dt, 0.1);
    if (this.time > anim.duration) {
      if (this.looping && anim.duration > 0) {
        this.time = remEuclid(this.time, anim.duration);
      } else {
        this.time = anim.duration;
        this.playing = false;
      }
    }
    this.changed();
  }

  title() {
    const name = this.path ? io.basename(this.path) : 'untitled';
    return `Rigby2D — ${name}${this.dirty() ? ' *' : ''}`;
  }
}
