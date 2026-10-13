// SPDX-License-Identifier: MIT
// Editor state, history and document commands.

import { Pose } from '../core/pose.js';
import { loadPreset, savePreset } from './keymap.js';
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
  { id: 'pose', label: '✋ Pose' },
  { id: 'create', label: '🦴 Create' },
  { id: 'rotate', label: '⟳ Rotate' },
  { id: 'translate', label: '✥ Translate' },
  { id: 'scale', label: '⤢ Scale' },
  { id: 'shear', label: '⧄ Shear' },
];


/** Snaps a time to the frame grid. */
export function snap(t) {
  return Math.round(t * FPS) / FPS;
}

// Selection is null, { bone: index } or { slot: index }.
export const selBone = (sel) => (sel && sel.bone !== undefined ? sel.bone : null);
export const selSlot = (sel) => (sel && sel.slot !== undefined ? sel.slot : null);

// Dopesheet tracks: { bone, channel }, { slot, channel }, { deform }, { ik }, { drawOrder } or { events }.

const errorText = (e) => (e && e.message) || String(e);

export class App {
  constructor() {
    this.doc = new Skeleton();
    this.path = null;
    /** Where Ctrl+S writes without asking: { path, fs }, or null. */
    this.saveTarget = null;
    this.images = new Images();
    this.sel = null;
    /** Bottom panel view: 'dopesheet' or 'graph'. */
    this.timelineView = 'dopesheet';
    /** Selected dopesheet keys (the key objects themselves). */
    this.selectedKeys = new Set();
    /** Additionally selected bones (the primary selection is `sel`). */
    this.multi = new Set();
    this.mode = Mode.Setup;
    this.tool = 'rotate';
    /** Keyboard shortcut preset id. */
    this.keymap = loadPreset();
    /** Animate mode: key every edit immediately (on), or keep edits as unkeyed changes (off). */
    this.autoKey = false;
    /** Unkeyed changes in animate mode: bone index -> { channel -> partial local transform }. */
    this.pending = new Map();
    /** Axes for numeric transform values: 'local', 'parent' or 'world'. */
    this.axis = 'parent';
    /** Playback direction: 1 forward, -1 backward. */
    this.playDirection = 1;
    /** Screen offset of the world origin from the viewport center, and zoom. */
    this.view = { panX: 0, panY: 200, zoom: 1 };
    this.anim = null;
    this.time = 0;
    this.playing = false;
    this.looping = true;
    this.selectedKeys.clear();
    this.status = 'Welcome to Rigby2D. File ▸ New sample to explore, or import a PSD / PNGs.';
    this.showBones = true;
    this.frameRequest = false;
    /** Bumped on every state change so panels know to refresh. */
    this.version = 0;
    this.history = { undo: [], redo: [] };
    /** JSON of the last committed document state, used to coalesce edits into undo steps. */
    this.baseline = this.doc.toSnapshot();
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
    this.multi.clear();
    this.pending.clear();
    this.selectedKeys.clear();
    this.time = 0;
    this.playing = false;
    this.history = { undo: [], redo: [] };
    this.docJson = this.baseline = this.saved = doc.toSnapshot();
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
      // Unkeyed changes override the animated values until they are keyed or discarded.
      for (const [bone, channels] of this.pending) {
        if (!pose.local[bone]) continue;
        for (const values of Object.values(channels)) Object.assign(pose.local[bone], values);
      }
      pose.updateWorld(this.doc);
    }
    return pose;
  }

  /** Bones that tools and keying act on: the primary selection plus any additional ones. */
  selectedBones() {
    const out = [...this.multi].filter((b) => b < this.doc.bones.length);
    const primary = selBone(this.sel);
    if (primary !== null && !out.includes(primary)) out.unshift(primary);
    return out;
  }

  /** Selects one item (bone or slot), or toggles a bone in the selection when `add` is true. */
  select(item, add = false) {
    const bone = selBone(item);
    if (add && bone !== null) {
      const bones = new Set(this.selectedBones());
      if (bones.has(bone)) bones.delete(bone);
      else bones.add(bone);
      this.multi = bones;
      this.sel = bones.size ? { bone: bones.has(bone) ? bone : [...bones][0] } : null;
    } else {
      this.sel = item;
      this.multi.clear();
    }
    this.changed();
  }

  deselect() {
    this.sel = null;
    this.multi.clear();
    this.selectedKeys.clear();
    this.changed();
  }

  /** Drops unkeyed changes (they only live until the time, animation or mode changes). */
  discardPending(reason = '') {
    if (!this.pending.size) return;
    this.pending.clear();
    if (reason) this.status = `Unkeyed changes discarded (${reason}). Key them with K or turn on Auto key.`;
    this.changed();
  }

  setKeymap(id) {
    this.keymap = id;
    savePreset(id);
    this.changed();
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
    this.selectedKeys.clear();
    this.sanitize();
    this.committedVersion = ++this.version;
  }

  syncJson() {
    this.docJson = this.doc.toSnapshot();
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
    // Playback only moves the time; it never edits the document, so skip the snapshot.
    if (busy || this.playing || this.committedVersion === this.version) return;
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
    this.setStatus('Sample robot loaded. The Help menu lists the shortcuts.');
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

  /** Writes a binary skeleton (.skel format 4.3 + .atlas + .png). */
  async exportSkeletonBinary() {
    const target = await this.guard(() => platform.pickSaveTarget(`${this.doc.name || 'skeleton'}.skel`, 'Binary skeleton', 'skel'));
    if (!target) return;
    try {
      const { atlasPath, warnings } = await io.exportSkeletonBinary(target.path, target.fs, this.doc, this.images);
      await target.fs.finish();
      const note = warnings.length ? ` (warnings: ${warnings.join('; ')})` : '';
      this.setStatus(`Exported ${target.path} and ${atlasPath}${note}`);
    } catch (e) {
      this.setStatus(`Binary export failed: ${errorText(e)}`);
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
    this.discardPending('mode changed');
    if (this.mode === Mode.Setup) {
      edit.ensureAnimation(this);
      this.mode = Mode.Animate;
    } else {
      this.playing = false;
      this.mode = Mode.Setup;
    }
    this.changed();
  }

  /** Starts playing in `direction` (1 forward, -1 backward), or stops if already playing that way. */
  togglePlay(direction = 1) {
    const stop = this.playing && this.playDirection === direction;
    this.playing = !stop && this.anim !== null;
    this.playDirection = direction;
    if (this.playing) {
      this.discardPending('playback started');
      this.mode = Mode.Animate;
    }
    this.changed();
  }

  stepFrame(dir) {
    this.playing = false;
    this.discardPending('time changed');
    const dur = this.currentAnimation()?.duration ?? 0;
    this.time = Math.max(0, Math.round(this.time * FPS) + dir) / FPS;
    if (dur > 0) this.time = Math.min(this.time, dur);
    this.changed();
  }

  setTime(t) {
    this.playing = false;
    if (Math.abs(t - this.time) > 1e-9) this.discardPending('time changed');
    this.time = Math.max(0, t);
    this.changed();
  }

  /** Key times of the selected bones' timelines (all timelines when nothing is selected). */
  keyTimes() {
    const anim = this.currentAnimation();
    if (!anim) return [];
    const bones = new Set(this.selectedBones());
    const times = new Set();
    for (const tl of anim.bones) {
      if (bones.size && !bones.has(tl.bone)) continue;
      for (const [k, keys] of Object.entries(tl)) if (Array.isArray(keys)) for (const key of keys) times.add(snap(key.time));
    }
    if (!bones.size) {
      for (const tl of anim.slots) for (const keys of Object.values(tl)) if (Array.isArray(keys)) for (const key of keys) times.add(snap(key.time));
      for (const t of anim.deform) for (const key of t.keys) times.add(snap(key.time));
      for (const t of anim.ik) for (const key of t.keys) times.add(snap(key.time));
      for (const key of [...anim.drawOrder, ...anim.events]) times.add(snap(key.time));
    }
    return [...times].sort((a, b) => a - b);
  }

  /** Moves to the next (dir 1) or previous (dir -1) key. */
  stepKey(dir) {
    const now = snap(this.time);
    const times = this.keyTimes();
    const target = dir > 0 ? times.find((t) => t > now + 1e-6) : [...times].reverse().find((t) => t < now - 1e-6);
    if (target !== undefined) this.setTime(target);
  }

  jumpToEnd() {
    const anim = this.currentAnimation();
    if (anim) this.setTime(anim.lastKeyTime());
  }

  advancePlayback(dt) {
    if (!this.playing) return;
    const anim = this.currentAnimation();
    if (!anim) {
      this.playing = false;
      return;
    }
    this.time += Math.min(dt, 0.1) * this.playDirection;
    if (this.time > anim.duration || this.time < 0) {
      if (this.looping && anim.duration > 0) {
        this.time = remEuclid(this.time, anim.duration);
      } else {
        this.time = Math.min(Math.max(this.time, 0), anim.duration);
        this.playing = false;
      }
    }
    this.changed();
  }

  title() {
    const name = this.path ? io.basename(this.path) : 'untitled';
    return `Rigby2D - ${name}${this.dirty() ? ' *' : ''}`;
  }
}
