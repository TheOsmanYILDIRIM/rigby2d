// SPDX-License-Identifier: MIT OR Apache-2.0
// Rigby2D: open-source 2D skeletal animation for games, films and interactive experiences.
// Copyright (c) 2026 jaisurya-dev-art and Rigby2D contributors

import { getCurrentWindow } from '@tauri-apps/api/window';

import './style.css';
import { App, Mode, saveSetting } from './app.js';
import { ACTIONS, PRESETS, REPEATING, actionFor, actionsFor, comboOf, shortcutLabel } from './keymap.js';
import { memoryFs } from './platform.js';
import * as edit from './edit.js';
import * as toolbar from './toolbar.js';
import * as tree from './tree.js';
import * as inspector from './inspector.js';
import { GraphEditor } from './graph.js';
import { Dopesheet, deleteSelectedKeys, renderControls } from './timeline.js';
import { Viewport } from './viewport.js';
import { closeMenu, h, isMenuOpen, popupMenu, widgetState } from './widgets.js';

const app = new App();
const inTauri = '__TAURI_INTERNALS__' in window;
const $ = (sel) => document.querySelector(sel);

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
      { label: 'New', action: () => app.newDocument() },
      { label: 'Open demo (Rigbytron)', action: () => app.openDemo() },
      { label: 'New sample (robot)', action: () => app.newSample() },
      { label: 'Open… (.rigby, or import .json / .skel)', shortcut: 'Ctrl+O', action: () => app.openDialog() },
      'separator',
      { label: 'Save', shortcut: 'Ctrl+S', action: () => app.save(false) },
      { label: 'Save as…', shortcut: 'Ctrl+Shift+S', action: () => app.save(true) },
      'separator',
      { label: 'Import PSD…', action: () => app.importPsd() },
      { label: 'Import PNG images…', action: () => app.importImages() },
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
    Help: [
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
    const btn = h('button', { class: 'menu-title' }, title);
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
  const mode = h('button', { class: 'mode', onclick: () => app.toggleMode() });
  bar.replaceChildren(...titles, h('span', { class: 'vsep' }), mode);
  return () => {
    mode.textContent = app.mode === Mode.Setup ? 'SETUP' : 'ANIMATE';
    mode.className = `mode ${app.mode}`;
    mode.title = `Switch Setup / Animate${sc('mode.toggle') ? ` (${sc('mode.toggle')})` : ''}`;
  };
}

// ---- keyboard ---------------------------------------------------------------------------------

const isTyping = (el) =>
  el && ((el.tagName === 'INPUT' && !el.readOnly && !['checkbox', 'radio', 'color'].includes(el.type)) || el.tagName === 'TEXTAREA');

/** Runs a keymap action. */
function run(action) {
  const setTool = (tool) => () => {
    app.tool = tool;
    app.changed();
  };
  const handlers = {
    'tool.pose': setTool('pose'),
    'tool.create': setTool('create'),
    'tool.rotate': setTool('rotate'),
    'tool.translate': setTool('translate'),
    'tool.scale': setTool('scale'),
    'tool.shear': setTool('shear'),
    'mode.toggle': () => app.toggleMode(),
    'play.forward': () => app.togglePlay(1),
    'play.backward': () => app.togglePlay(-1),
    'time.start': () => app.setTime(0),
    'time.end': () => app.jumpToEnd(),
    'key.next': () => app.stepKey(1),
    'key.previous': () => app.stepKey(-1),
    'frame.next': () => app.stepFrame(1),
    'frame.previous': () => app.stepFrame(-1),
    'frame.next10': () => app.stepFrame(10),
    'frame.previous10': () => app.stepFrame(-10),
    'loop.toggle': () => {
      app.looping = !app.looping;
      app.setStatus(`Looping ${app.looping ? 'on' : 'off'}`);
    },
    'key.changed': () => edit.keyChanged(app),
    'key.tool': () => edit.keyTool(app),
    'key.transforms': () => edit.keySelection(app),
    'key.shown': () => edit.keyShown(app),
    'autokey.toggle': () => {
      app.autoKey = !app.autoKey;
      app.changed();
    },
    'select.none': () => app.deselect(),
    'view.fit': () => (app.frameRequest = true),
    'view.actual': () => zoomActual(),
    'edit.delete': () => {
      if (viewport.meshTool.deleteSelected() || viewport.shapeTool.deleteSelected()) return;
      if (app.selectedKeys.size) deleteSelectedKeys(app);
      else edit.deleteSelection(app);
    },
    'edit.undo': () => app.undo(),
    'edit.redo': () => app.redo(),
    'file.open': () => app.openDialog(),
    'file.save': () => app.save(false),
    'file.saveAs': () => app.save(true),
    'file.export': () => app.exportSkeletonJson(app.saveVersion()),
    'menu.close': () => closeMenu(),
  };
  handlers[action]?.();
}

window.addEventListener('keydown', (e) => {
  const combo = comboOf(e);
  if (!combo) return;
  let action = actionFor(app.keymap, combo);
  if (!action) return;
  const typing = isTyping(e.target);
  // While typing, only file shortcuts work (text fields keep their own undo, delete, etc.).
  if (typing && !action.startsWith('file.')) return;
  if (e.target.tagName === 'SELECT' && !['mode.toggle', 'menu.close'].includes(action) && !action.startsWith('file.')) return;
  // A key bound to "close menus" closes an open menu; otherwise it runs its other action (deselect).
  if (action === 'menu.close') {
    e.preventDefault();
    if (isMenuOpen()) return closeMenu();
    action = actionsFor(app.keymap, combo).find((a) => a !== 'menu.close');
    if (!action) return;
  }
  if (e.repeat && !REPEATING.has(action)) return;
  e.preventDefault();
  closeMenu();
  run(action);
});

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
const dopesheet = new Dopesheet(app, $('#dopesheet'), $('#dopesheet canvas'));
const graph = new GraphEditor(app, $('#graph'), $('#graph canvas'));
const renderMenuBar = buildMenuBar();

let pointersDown = 0;
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
const panels = [
  { el: $('#tree'), render: tree.render, built: -1 },
  { el: $('#properties .content'), render: inspector.render, built: -1 },
  { el: $('#viewbar'), render: toolbar.render, built: -1 },
  { el: $('#controls'), render: renderControls, built: -1 },
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

function frame(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  app.advancePlayback(dt);
  app.sanitize();
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
    if (p.built !== app.version && !editingIn(p.el)) {
      p.built = app.version;
      p.render(app, p.el);
    }
  }
  renderMenuBar();
  $('#status-text').textContent = app.status;
  $('#status-info').textContent = `${app.doc.bones.length} bones · ${app.doc.slots.length} slots · ${Math.round(app.view.zoom * 100)}%`;

  app.commitHistory(pointersDown > 0 || isTyping(document.activeElement));
  const title = app.title();
  if (title !== lastTitle) {
    lastTitle = title;
    document.title = title;
    if (inTauri) getCurrentWindow().setTitle(title).catch(() => {});
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// New users start in the demo project.
app.openDemo(false);

// The window starts hidden while the splash screen plays; the splash opens it when done. Show it
// anyway if the splash never does.
if (inTauri) setTimeout(() => getCurrentWindow().show().catch(() => {}), 10000);

// Development builds expose the editor for debugging from the console.
if (import.meta.env.DEV) window.rigby = { app, memoryFs, dopesheet, graph, viewport };
