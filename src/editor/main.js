// SPDX-License-Identifier: MIT OR Apache-2.0
// Rigby2D: open-source 2D skeletal animation for games, films and interactive experiences.
// Copyright (c) 2026 jaisurya-dev-art and Rigby2D contributors

import { WORKSPACES, has } from './workspaces.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit, listen } from '@tauri-apps/api/event';
import { Skeleton } from '../core/model.js';
import { EV_SYNC, EV_CONTROL, EV_CLOSED, PANELS, panelLabel } from './dock.js';

import './style.css';
import { App, Mode, saveSetting } from './app.js';
import { ACTIONS, PRESETS, shortcutLabel } from './keymap.js';
import { installKeyboard, isTyping, runAction } from './keys.js';
import { openRenderDialog } from './renderui.js';
import { openAutoRig, openRetarget } from './rigui.js';
import { startAudio, stopAudio } from './audio.js';
import { memoryFs } from './platform.js';
import * as edit from './edit.js';
import * as toolbar from './toolbar.js';
import * as tree from './tree.js';
import * as inspector from './inspector.js';
import { GraphEditor } from './graph.js';
import { Dopesheet, deleteSelectedKeys, renderControls, keySelectionIndices, applyKeySelection } from './timeline.js';
import { Viewport } from './viewport.js';
import { closeMenu, h, isMenuOpen, popupMenu, widgetState } from './widgets.js';
import * as log from './log.js';
import { toggleLogWindow, windowOpen as logOpen } from './logwindow.js';
import { Scripts } from './scripting/scriptui.js';
import { createTutorials } from './tutorials/index.js';
import { openAiConnect } from './aiconnect.js';

const app = new App();
// Errors anywhere in the editor, and status messages, go to the log (View ▸ Log).
log.installCapture(app);
const scripts = new Scripts(app);
const inTauri = '__TAURI_INTERNALS__' in window;
const $ = (sel) => document.querySelector(sel);

// ---- detached timeline window -----------------------------------------------------------------
// The timeline can pop out into a real OS window (panel.html), e.g. onto a second monitor. This
// window stays the source of truth; the two keep in sync over Tauri events (see dock.js).

// Open detached panel windows, by id (see dock.js PANELS). The editor is the single authority; a
// change here broadcasts to every open window, and each window forwards its shortcuts back here.
const detachedWindows = new Map();
const geomUnlisten = new Map();
let panelsReady = false;
let lastSync = '';
let lastSentDoc = null;

const anyDetached = () => detachedWindows.size > 0;

const geomKey = (id) => `rigby.panel.${id}.geom`;

// Where the user last left a panel window (logical px). Null when never detached or unreadable.
function loadGeom(id) {
  try {
    const g = JSON.parse(globalThis.localStorage?.getItem(geomKey(id)) ?? 'null');
    return g && [g.x, g.y, g.w, g.h].every(Number.isFinite) ? g : null;
  } catch {
    return null;
  }
}

// Persist a panel window's position and size as the user moves/resizes it, so it reopens the same.
async function trackGeom(id, win) {
  const save = async () => {
    try {
      const sf = await win.scaleFactor();
      const p = await win.outerPosition();
      const s = await win.innerSize();
      saveSetting(geomKey(id), JSON.stringify({ x: Math.round(p.x / sf), y: Math.round(p.y / sf), w: Math.round(s.width / sf), h: Math.round(s.height / sf) }));
    } catch {
      // Geometry is a convenience; ignore if the window info isn't available.
    }
  };
  const stops = await Promise.all([win.onMoved(save), win.onResized(save)]);
  geomUnlisten.set(id, () => { for (const stop of stops) stop(); });
}

async function detachPanel(id) {
  if (!inTauri || !PANELS[id] || detachedWindows.has(id)) return;
  const { label, width, height } = PANELS[id];
  detachedWindows.set(id, null);
  panelsReady = false;
  lastSync = '';
  lastSentDoc = null;
  $('#app').classList.add(`detached-${id}`);
  const opts = { url: `panel.html?panel=${id}`, title: `Rigby2D - ${label}`, width, height, minWidth: 320, minHeight: 200 };
  // Reopen where the user last left this panel (possibly on another monitor). With nothing saved,
  // the OS places it on the editor's own monitor; drag it anywhere once and it sticks from then on.
  const saved = loadGeom(id);
  if (saved) Object.assign(opts, { width: saved.w, height: saved.h, x: saved.x, y: saved.y });
  const win = new WebviewWindow(panelLabel(id), opts);
  detachedWindows.set(id, win);
  trackGeom(id, win);
  win.once('tauri://error', (e) => {
    app.setStatus(`Could not open the ${label} window: ${e.payload}`);
    dockPanel(id);
  });
  app.setStatus(`${label} popped out to its own window. Close it to dock it back.`);
}

function dockPanel(id) {
  if (!detachedWindows.has(id)) return;
  const win = detachedWindows.get(id);
  detachedWindows.delete(id);
  const stop = geomUnlisten.get(id);
  if (stop) { stop(); geomUnlisten.delete(id); }
  $('#app').classList.remove(`detached-${id}`);
  if (win) win.destroy().catch(() => {});
  app.changed();
}

/** A change signature over the shared state (so an unchanged frame sends nothing). */
// Change signature over the shared state, derived from the snapshot so new fields are covered
// automatically. docJson is excluded (it is huge and tracked separately) and keys folded in.
function stateSignature(s, keys) {
  return JSON.stringify({ ...s, docJson: undefined, keys });
}

/** Runs a shortcut the detached window forwarded, on the authoritative editor App (undo lives here). */
function runPanelAction(action) {
  runAction(app, action, { viewport, zoomActual, deleteSelectedKeys, closeMenu });
}

/** Adopts the state the detached window sent (document edits as one undo step), without echoing it. */
function applyFromPanel(p) {
  app.applyStateSnapshot(p, { undo: true });
  applyKeySelection(app, p.keys);
  const s = app.snapshotState();
  lastSync = stateSignature(s, keySelectionIndices(app));
  if (p.docJson) lastSentDoc = s.docJson;
}

if (inTauri) {
  listen(EV_CONTROL, (e) => {
    if (!anyDetached()) return;
    const p = e.payload ?? {};
    if (p.ready) {
      // A window is up and asks for the first full state (broadcast reaches every window).
      panelsReady = true;
      lastSync = '';
      lastSentDoc = null;
      return;
    }
    if (p.action) return runPanelAction(p.action);
    applyFromPanel(p);
  });
  listen(EV_CLOSED, (e) => dockPanel(e.payload?.panel));
  // Closing the editor closes the whole program: tear down any detached panel windows too.
  getCurrentWindow().onCloseRequested(() => {
    for (const [, win] of detachedWindows) win?.destroy().catch(() => {});
  });
}

/** Broadcasts the shared editor state to every detached window (per frame; cheap when unchanged). */
function syncPanels() {
  if (!anyDetached() || !panelsReady) return;
  const s = app.snapshotState();
  const keys = keySelectionIndices(app);
  const sig = stateSignature(s, keys);
  const docChanged = s.docJson !== lastSentDoc;
  if (sig === lastSync && !docChanged) return;
  lastSync = sig;
  // Payload is the snapshot itself plus the key selection; the document rides only when it changed.
  const payload = { ...s, keys };
  if (docChanged) lastSentDoc = s.docJson;
  else delete payload.docJson;
  emit(EV_SYNC, payload);
}

// ---- menu bar ---------------------------------------------------------------------------------

const sc = (action) => shortcutLabel(app.keymap, action);

function zoomActual() {
  app.view.panX *= 1 / app.view.zoom;
  app.view.panY *= 1 / app.view.zoom;
  app.view.zoom = 1;
  app.changed();
}

function menus() {
  return {
    File: [
      { label: 'New game project', action: () => app.newDocument('game') },
      { label: 'New film project', action: () => app.newDocument('film') },
      { label: 'Open demo (Rigbytron)', action: () => app.openDemo() },
      { label: 'New sample (robot)', action: () => app.newSample() },
      { label: 'Open… (.rigby, or import .json / .skel)', shortcut: 'Ctrl+O', action: () => app.openDialog() },
      'separator',
      { label: 'Save', shortcut: 'Ctrl+S', action: () => app.save(false) },
      { label: 'Save as…', shortcut: 'Ctrl+Shift+S', action: () => app.save(true) },
      'separator',
      { label: 'Import PSD…', action: () => app.importPsd() },
      { label: 'Import PNG images…', action: () => app.importImages() },
      { label: 'AutoRig artwork…', action: () => openAutoRig(app) },
      { label: 'Retarget animations from another character…', action: () => openRetarget(app) },
      ...(has(app, 'audio') ? [{ label: 'Import audio…', action: () => app.importAudio() }] : []),
      // Film renders first; skeleton exports (for game engines) follow in both workspaces.
      ...(has(app, 'render') ? ['separator', { label: 'Render animation… (PNG, WebM, MP4)', action: () => openRenderDialog(app) }, 'separator'] : []),
      { label: 'Export JSON + atlas…', shortcut: 'Ctrl+E', action: () => app.exportSkeletonJson(app.saveVersion()) },
      { label: 'Export as format 3.8…', action: () => app.exportSkeletonJson('3.8') },
      { label: 'Export as format 4.2…', action: () => app.exportSkeletonJson('4.2') },
      { label: 'Export as format 4.3…', action: () => app.exportSkeletonJson('4.3') },
      { label: 'Export .skel + atlas (4.3)…', action: () => app.exportSkeletonBinary() },
      'separator',
      { label: 'Quit', action: () => (inTauri ? getCurrentWindow().close() : window.close()) },
    ],
    Edit: [
      { label: 'Undo', shortcut: sc('edit.undo'), disabled: !app.history.undo.length, action: () => app.undo() },
      { label: 'Redo', shortcut: sc('edit.redo'), disabled: !app.history.redo.length, action: () => app.redo() },
      'separator',
      { label: 'Key changed properties', shortcut: sc('key.changed'), action: () => edit.keyChanged(app) },
      { label: "Key the current tool's property", shortcut: sc('key.tool'), action: () => edit.keyTool(app) },
      { label: 'Key all transforms of the selection', shortcut: sc('key.transforms'), action: () => edit.keyTransforms(app) },
      { label: 'Key everything shown', shortcut: sc('key.shown'), action: () => edit.keyShown(app) },
      'separator',
      { label: 'Deselect', shortcut: sc('select.none'), action: () => app.deselect() },
      { label: 'Delete selection', shortcut: sc('edit.delete'), action: () => edit.deleteSelection(app) },
    ],
    View: [
      h(
        'label',
        { class: 'item' },
        h('input', {
          type: 'checkbox',
          checked: app.showBones,
          onchange: (e) => {
            app.showBones = e.target.checked;
            app.changed();
          },
        }),
        ' Show bones',
      ),
      has(app, 'outputFrame') &&
      h(
        'label',
        { class: 'item' },
        h('input', {
          type: 'checkbox',
          checked: app.showFrame,
          onchange: (e) => {
            app.showFrame = e.target.checked;
            app.changed();
          },
        }),
        ' Show output frame',
      ),
      { label: logOpen() ? 'Hide log' : 'Log', action: () => toggleLogWindow() },
      'separator',
      { label: 'Fit the skeleton in view', shortcut: sc('view.fit'), action: () => (app.frameRequest = true) },
      { label: 'Zoom to 100%', shortcut: sc('view.actual'), action: () => zoomActual() },
      'separator',
      ...[
        ['webgl', 'WebGL'],
        ['canvas', 'Canvas 2D'],
      ].map(([id, label]) => ({
        label: `${app.renderer === id ? '● ' : '○ '}Draw with ${label}`,
        action: () => {
          app.renderer = id;
          saveSetting('rigby.renderer', id);
          app.setStatus(id === 'webgl' && !viewport.glView ? 'WebGL is not available here; drawing with Canvas 2D' : `Viewport drawing: ${label}`);
          app.changed();
        },
      })),
      'separator',
      ...Object.entries(PRESETS).map(([id, p]) => ({
        label: `${app.keymap === id ? '● ' : '○ '}Shortcuts: ${p.label}`,
        action: () => {
          app.setKeymap(id);
          app.setStatus(`Keyboard shortcuts: ${p.label}`);
        },
      })),
    ],
    Scripts: scripts.menu(),
    Help: [
      { label: 'Tutorials…', action: () => tutorials.open() },
      { label: 'Connect an AI assistant…', action: () => openAiConnect() },
      'separator',
      h(
        'div',
        { class: 'help' },
        h('p', null, 'Rigby2D by Hoverlabs: 2D skeletal animation.'),
        h('p', { class: 'weak' }, 'Code: MIT OR Apache-2.0. The Rigby2D and Hoverlabs names and logos are trademarks of Hoverlabs.'),
        h('p', { class: 'weak' }, `Shortcuts: ${PRESETS[app.keymap].label} (change in View)`),
        h('hr'),
        h(
          'table',
          { class: 'keys' },
          ACTIONS.filter(([id]) => sc(id)).map(([id, label]) => h('tr', null, h('td', null, sc(id)), h('td', null, label))),
        ),
        h('hr'),
        h('p', null, 'Click: select · Ctrl+click: add/remove · drag empty space: box select'),
        h('p', null, 'Right or middle drag: pan · Wheel: zoom'),
      ),
    ],
  };
}

let openTitle = null;

function showMenu(title, button) {
  const r = button.getBoundingClientRect();
  popupMenu(r.left, r.bottom, menus()[title]);
  openTitle = title;
}

function buildMenuBar() {
  const bar = $('#menubar');
  const titles = Object.keys(menus()).map((title) => {
    const btn = h('button', { class: 'menu-title', 'data-tut': `menu:${title}` }, title);
    btn.addEventListener('click', () => {
      if (isMenuOpen() && openTitle === title) {
        closeMenu();
        openTitle = null;
      } else showMenu(title, btn);
    });
    btn.addEventListener('pointerenter', () => {
      if (isMenuOpen() && openTitle !== null && openTitle !== title) showMenu(title, btn);
    });
    return btn;
  });
  const mode = h('button', { class: 'mode', 'data-tut': 'mode', onclick: () => app.toggleMode() });
  // Workspace switcher: which tools the editor shows for this project.
  const tabs = Object.values(WORKSPACES).map((ws) => h('button', { class: 'workspace-tab', 'data-tut': `workspace:${ws.id}`, title: ws.description, onclick: () => app.workspace !== ws.id && app.setWorkspace(ws.id) }, ws.label));
  const switcher = h('div', { class: 'workspaces', 'data-tut': 'workspaces', role: 'tablist', title: 'Workspace' }, tabs);
  bar.replaceChildren(...titles, h('span', { class: 'vsep' }), mode, h('span', { class: 'spacer' }), switcher);
  // Called every frame: touch the DOM only when something shown changed.
  let shown = '';
  return () => {
    const state = `${app.mode}|${app.workspace}|${app.keymap}`;
    if (state === shown) return;
    shown = state;
    mode.textContent = app.mode === Mode.Setup ? 'SETUP' : 'ANIMATE';
    mode.className = `mode ${app.mode}`;
    mode.title = `Switch Setup / Animate${sc('mode.toggle') ? ` (${sc('mode.toggle')})` : ''}`;
    Object.keys(WORKSPACES).forEach((id, i) => {
      tabs[i].className = `workspace-tab${app.workspace === id ? ' active' : ''}`;
      tabs[i].setAttribute('aria-selected', String(app.workspace === id));
    });
  };
}

// ---- panel splitters --------------------------------------------------------------------------

function splitter(el, cssVar, axis, sign, min) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const root = document.documentElement;
    const start = axis === 'x' ? e.clientX : e.clientY;
    const size = parseFloat(getComputedStyle(root).getPropertyValue(cssVar));
    const move = (ev) => {
      const d = (axis === 'x' ? ev.clientX : ev.clientY) - start;
      root.style.setProperty(cssVar, `${Math.max(min, size + sign * d)}px`);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
}

splitter($('#split-right'), '--right', 'x', -1, 220);
splitter($('#split-tree'), '--tree', 'y', 1, 120);
splitter($('#split-bottom'), '--bottom', 'y', -1, 120);

// ---- main loop --------------------------------------------------------------------------------

const viewport = new Viewport(app, $('#viewport'), $('#viewport-gl'));
app.viewport = viewport;
const dopesheet = new Dopesheet(app, $('#dopesheet'), $('#dopesheet canvas'));
const graph = new GraphEditor(app, $('#graph'), $('#graph canvas'));
installKeyboard(app, { viewport, zoomActual, deleteSelectedKeys, closeMenu, isMenuOpen });
const renderMenuBar = buildMenuBar();
const tutorials = createTutorials(app, viewport, { refresh: () => renderNow() });

let pointersDown = 0;
let audioPlaying = false;
/** Element under the last press: its panel must not be rebuilt before the release, or the click is lost. */
let pressTarget = null;
window.addEventListener('pointerdown', (e) => {
  pointersDown++;
  pressTarget = e.target;
}, true);
window.addEventListener('pointerup', () => (pointersDown = Math.max(0, pointersDown - 1)), true);
window.addEventListener('pointercancel', () => (pointersDown = Math.max(0, pointersDown - 1)), true);
window.addEventListener('blur', () => (pointersDown = 0));

/** Panels are rebuilt when the app changes, except while the user is editing a field or pressing in them. */
/**
 * Panels are rebuilt when the app changes. While playing, the time moves every frame: panels that
 * show it (`every`: at most every that many ms) follow it; the others wait for a real change.
 */
const panels = [
  { el: $('#tree'), render: tree.render, built: -1 },
  { el: $('#properties .content'), render: inspector.render, built: -1, every: 200 },
  { el: $('#viewbar'), render: toolbar.render, built: -1 },
  { el: $('#controls'), render: renderControls, built: -1, every: 66 },
];

function editingIn(el) {
  const active = document.activeElement;
  // Keep a panel while a press inside it is held (playback otherwise rebuilds it every frame).
  if (pointersDown > 0 && pressTarget && el.contains(pressTarget)) return true;
  return widgetState.dragging || (active && el.contains(active) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName));
}

let lastFrame = performance.now();
let lastTitle = '';

let lastTime = 0;
let lastAnim = null;

/** Redraws everything at once (the tutorial arena uses it; the frame loop normally does this). */
function renderNow() {
  for (const p of panels) {
    p.built = app.version;
    p.builtTime = app.timeVersion;
    p.render(app, p.el);
  }
  viewport.draw();
  renderMenuBar();
}

/** Sets an element's text only when it differs (the frame loop runs 60 times a second). */
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function frame(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  app.advancePlayback(dt);
  app.sanitize();
  // Audio tracks (Film) start with playback, and restart when the time jumps or loops.
  const jumped = app.playing && (!audioPlaying || app.anim !== lastAnim || app.time < lastTime || app.time - lastTime > 0.25);
  if (jumped && has(app, 'audio') && app.playDirection > 0) startAudio(app.doc, app.currentAnimation()?.name, app.time);
  if (!app.playing && audioPlaying) stopAudio();
  audioPlaying = app.playing && app.playDirection > 0;
  if (app.time !== lastTime || app.anim !== lastAnim) {
    if (!app.playing) app.discardPending(app.anim !== lastAnim ? 'animation changed' : 'time changed');
    lastTime = app.time;
    lastAnim = app.anim;
  }

  viewport.draw();
  const showGraph = app.timelineView === 'graph' && !!app.currentAnimation();
  $('#graph').hidden = !showGraph;
  if (showGraph) {
    $('#dopesheet').hidden = true;
    $('.dopesheet-wrap .empty').hidden = true;
    graph.draw();
  } else {
    dopesheet.draw();
  }
  for (const p of panels) {
    const changed = p.built !== app.version;
    const timeMoved = p.every && p.builtTime !== app.timeVersion && now - (p.builtAt ?? 0) >= p.every;
    if ((changed || timeMoved) && !editingIn(p.el)) {
      p.built = app.version;
      p.builtTime = app.timeVersion;
      p.builtAt = now;
      p.render(app, p.el);
    }
  }
  renderMenuBar();
  setText($('#status-text'), app.status);
  const errors = log.unreadErrors;
  const badge = $('#status-log');
  setText(badge, errors ? `⚠ ${errors} error${errors === 1 ? '' : 's'}` : 'Log');
  badge.classList.toggle('has-errors', errors > 0);
  setText($('#status-info'), `${app.doc.bones.length} bones · ${app.doc.slots.length} slots · ${Math.round(app.view.zoom * 100)}%`);

  app.commitHistory(pointersDown > 0 || isTyping(document.activeElement));
  const title = app.title();
  if (title !== lastTitle) {
    lastTitle = title;
    document.title = title;
    if (inTauri) getCurrentWindow().setTitle(title).catch(() => {});
  }
  syncPanels();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// New users start in the demo project, and are offered the tour once.
app.openDemo(false).then(() => setTimeout(() => tutorials.welcome(), 1200));

// The window starts hidden while the splash screen plays; the splash opens it when done. Show it
// anyway if the splash never does.
if (inTauri) setTimeout(() => getCurrentWindow().show().catch(() => {}), 10000);

// Development builds expose the editor for debugging from the console.
if (import.meta.env.DEV) window.rigby = { app, memoryFs, dopesheet, graph, viewport, scripts, log, tutorials };

// Scripts in the library load in the background, adding their tools to the Scripts menu.
if (scripts.library.length) setTimeout(() => scripts.loadAll({ quiet: true }), 1500);

$('#status-log').addEventListener('click', () => toggleLogWindow());

// Each panel pops out into its own window from the ⧉ button at its top-right (desktop only).
for (const btn of document.querySelectorAll('.panel-detach-btn')) {
  btn.hidden = !inTauri;
  btn.addEventListener('click', () => detachPanel(btn.dataset.panel));
}
