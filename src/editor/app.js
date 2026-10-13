// SPDX-License-Identifier: MIT
// Editor state, history and document commands.

import { ask, open, save } from '@tauri-apps/plugin-dialog';

import { Pose } from '../core/pose.js';
import { Skeleton } from '../core/model.js';
import { remEuclid } from '../core/state.js';
import * as edit from './edit.js';
import { Images } from './images.js';
import * as io from './io.js';
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

// Dopesheet tracks: { bone, channel } or { slot } (attachment track). Keys: { track, index }.
export const trackId = (t) => (t.slot !== undefined ? `s${t.slot}` : `b${t.bone}:${t.channel}`);
export const keyEquals = (a, b) => !!a && !!b && a.index === b.index && trackId(a.track) === trackId(b.track);

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const errorText = (e) => (e && e.message) || String(e);

export class App {
  constructor() {
    this.doc = new Skeleton();
    this.path = null;
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
    this.status = 'Welcome to Rigby. File ▸ New sample to explore, or import a PSD / PNGs.';
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

  async openPath(path) {
    try {
      const { doc, warnings } = await io.openProject(path, this.images);
      this.loadDocument(doc, path);
      this.setStatus(warnings.length ? `Opened with warnings: ${warnings.join('; ')}` : `Opened ${path}`);
    } catch (e) {
      this.setStatus(`Could not open ${path}: ${errorText(e)}`);
    }
  }

  async confirmDiscard() {
    this.syncJson();
    if (!this.dirty()) return true;
    if (!inTauri()) return window.confirm('Discard unsaved changes?');
    return ask('Discard unsaved changes?', { title: 'Unsaved changes', kind: 'warning' });
  }

  async newDocument() {
    if (!(await this.confirmDiscard())) return;
    this.images.clear();
    this.loadDocument(new Skeleton(), null);
    this.setStatus('New project');
  }

  async newSample() {
    if (!(await this.confirmDiscard())) return;
    this.images.clear();
    this.loadDocument(sample.robot(this.images), null);
    this.mode = Mode.Animate;
    this.playing = true;
    this.setStatus('Sample robot loaded: press Space to play/pause, Tab to switch Setup/Animate');
  }

  async openDialog() {
    if (!(await this.confirmDiscard())) return;
    const path = await this.dialog(() => open({ filters: [{ name: 'Rigby project', extensions: ['rigby', 'json'] }] }));
    if (path) await this.openPath(path);
  }

  async save(saveAs) {
    let path = saveAs ? null : this.path;
    if (!path) {
      path = await this.dialog(() =>
        save({ filters: [{ name: 'Rigby project', extensions: ['rigby'] }], defaultPath: `${this.doc.name}.rigby` }),
      );
      if (!path) return;
    }
    try {
      await io.saveProject(path, this.doc, this.images);
      this.path = path;
      this.syncJson();
      this.baseline = this.saved = this.docJson;
      this.setStatus(`Saved ${path}`);
    } catch (e) {
      this.setStatus(`Save failed: ${errorText(e)}`);
    }
  }

  async exportForGames() {
    const path = await this.dialog(() =>
      save({ filters: [{ name: 'Rigby skeleton', extensions: ['json'] }], defaultPath: `${this.doc.name}.json` }),
    );
    if (!path) return;
    try {
      const atlas = await io.exportForGames(path, this.doc, this.images);
      this.setStatus(`Exported ${path} and ${atlas}`);
    } catch (e) {
      this.setStatus(`Export failed: ${errorText(e)}`);
    }
  }

  async importPsd() {
    const path = await this.dialog(() => open({ filters: [{ name: 'Photoshop', extensions: ['psd'] }] }));
    if (!path) return;
    try {
      const n = await io.importPsd(path, this.doc, this.images);
      this.frameRequest = true;
      this.setStatus(`Imported ${n} layers from ${path}`);
    } catch (e) {
      this.setStatus(`PSD import failed: ${errorText(e)}`);
    }
  }

  async importImages() {
    const picked = await this.dialog(() => open({ multiple: true, filters: [{ name: 'Images', extensions: ['png'] }] }));
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (!paths.length) return;
    try {
      const n = await io.importPngs(paths, selBone(this.sel) ?? 0, this.doc, this.images);
      this.frameRequest = true;
      this.setStatus(`Imported ${n} images`);
    } catch (e) {
      this.setStatus(`Image import failed: ${errorText(e)}`);
    }
  }

  /** Runs a native dialog, reporting when the app is not running inside the desktop shell. */
  async dialog(fn) {
    if (!inTauri()) {
      this.setStatus('File dialogs need the desktop app: run `npm run dev`');
      return null;
    }
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
    return `Rigby — ${name}${this.dirty() ? ' *' : ''}`;
  }
}
