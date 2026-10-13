// SPDX-License-Identifier: MIT
// Rigby: open-source 2D skeletal animation editor.
// Copyright (c) 2026 jaisurya-dev-art and Rigby contributors

import { getCurrentWindow } from '@tauri-apps/api/window';

import './style.css';
import { App, Mode, TOOLS } from './app.js';
import * as edit from './edit.js';
import * as hierarchy from './hierarchy.js';
import * as inspector from './inspector.js';
import { Dopesheet, deleteSelectedKey, renderControls } from './timeline.js';
import { Viewport } from './viewport.js';
import { closeMenu, h, isMenuOpen, popupMenu, widgetState } from './widgets.js';

const app = new App();
const inTauri = '__TAURI_INTERNALS__' in window;
const $ = (sel) => document.querySelector(sel);

// ---- menu bar ---------------------------------------------------------------------------------

function menus() {
  return {
    File: [
      { label: 'New', action: () => app.newDocument() },
      { label: 'New sample (robot)', action: () => app.newSample() },
      { label: 'Open…', shortcut: 'Ctrl+O', action: () => app.openDialog() },
      'separator',
      { label: 'Save', shortcut: 'Ctrl+S', action: () => app.save(false) },
      { label: 'Save as…', shortcut: 'Ctrl+Shift+S', action: () => app.save(true) },
      'separator',
      { label: 'Import PSD…', action: () => app.importPsd() },
      { label: 'Import PNG images…', action: () => app.importImages() },
      { label: 'Export for games…', shortcut: 'Ctrl+E', action: () => app.exportForGames() },
      'separator',
      { label: 'Quit', action: () => (inTauri ? getCurrentWindow().close() : window.close()) },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !app.history.undo.length, action: () => app.undo() },
      { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !app.history.redo.length, action: () => app.redo() },
      'separator',
      { label: 'Delete selection', shortcut: 'Del', action: () => edit.deleteSelection(app) },
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
      { label: 'Frame all', shortcut: 'F', action: () => (app.frameRequest = true) },
    ],
    Help: [
      h(
        'div',
        { class: 'help' },
        h('p', null, 'Rigby: open-source 2D skeletal animation (MIT).'),
        h('hr'),
        h('p', null, 'R/G/S/B: rotate, move, scale, create bone'),
        h('p', null, 'Tab: setup ↔ animate   Space: play/pause'),
        h('p', null, 'K: key selection   ←/→: step frame   F: frame all'),
        h('p', null, 'Middle/right drag: pan   Wheel: zoom'),
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
  const tools = h('span', { class: 'tools' });
  const mode = h('button', { class: 'mode', title: 'Toggle setup / animate mode (Tab)', onclick: () => app.toggleMode() });
  bar.replaceChildren(...titles, h('span', { class: 'vsep' }), tools, h('span', { class: 'vsep' }), mode);
  return () => {
    tools.replaceChildren(
      ...TOOLS.map((t) =>
        h(
          'button',
          {
            class: `tool${app.tool === t.id ? ' active' : ''}`,
            title: `Shortcut: ${t.key}`,
            onclick: () => {
              app.tool = t.id;
              app.changed();
            },
          },
          t.label,
        ),
      ),
    );
    mode.textContent = app.mode === Mode.Setup ? 'SETUP' : 'ANIMATE';
    mode.className = `mode ${app.mode}`;
  };
}

// ---- keyboard ---------------------------------------------------------------------------------

const isTyping = (el) =>
  el && ((el.tagName === 'INPUT' && !el.readOnly && !['checkbox', 'radio', 'color'].includes(el.type)) || el.tagName === 'TEXTAREA');

window.addEventListener('keydown', (e) => {
  const cmd = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (cmd) {
    const actions = {
      z: () => (e.shiftKey ? app.redo() : app.undo()),
      y: () => app.redo(),
      s: () => app.save(e.shiftKey),
      o: () => app.openDialog(),
      e: () => app.exportForGames(),
    };
    if (actions[key] && !(isTyping(e.target) && (key === 'z' || key === 'y'))) {
      e.preventDefault();
      closeMenu();
      actions[key]();
    }
    return;
  }
  if (isTyping(e.target) || e.altKey) return;
  if (e.target.tagName === 'SELECT' && !['Tab', 'Escape'].includes(e.key)) return;
  const tool = { r: 'rotate', g: 'move', s: 'scale', b: 'create' }[key];
  const handlers = {
    Tab: () => app.toggleMode(),
    ' ': () => app.togglePlay(),
    k: () => edit.keySelection(app),
    f: () => (app.frameRequest = true),
    Delete: () => (app.selectedKey ? deleteSelectedKey(app) : edit.deleteSelection(app)),
    ArrowLeft: () => app.stepFrame(-1),
    ArrowRight: () => app.stepFrame(1),
    Escape: () => closeMenu(),
  };
  handlers.Backspace = handlers.Delete;
  const handler = tool && !e.shiftKey ? () => ((app.tool = tool), app.changed()) : (handlers[e.key] ?? handlers[key]);
  if (handler && !e.repeat) {
    e.preventDefault();
    handler();
  } else if (handler && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    handler();
  }
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

splitter($('#split-left'), '--left', 'x', 1, 140);
splitter($('#split-right'), '--right', 'x', -1, 200);
splitter($('#split-bottom'), '--bottom', 'y', -1, 120);

// ---- main loop --------------------------------------------------------------------------------

const viewport = new Viewport(app, $('#viewport'));
const dopesheet = new Dopesheet(app, $('#dopesheet'), $('#dopesheet canvas'));
const renderMenuBar = buildMenuBar();

let pointersDown = 0;
window.addEventListener('pointerdown', () => pointersDown++, true);
window.addEventListener('pointerup', () => (pointersDown = Math.max(0, pointersDown - 1)), true);
window.addEventListener('pointercancel', () => (pointersDown = Math.max(0, pointersDown - 1)), true);
window.addEventListener('blur', () => (pointersDown = 0));

/** Panels are rebuilt when the app changes, except while the user is editing a field in them. */
const panels = [
  { el: $('#hierarchy'), render: hierarchy.render, built: -1 },
  { el: $('#inspector .content'), render: inspector.render, built: -1 },
  { el: $('#controls'), render: renderControls, built: -1 },
];

function editingIn(el) {
  const active = document.activeElement;
  return widgetState.dragging || (active && el.contains(active) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName));
}

let lastFrame = performance.now();
let lastTitle = '';

function frame(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  app.advancePlayback(dt);
  app.sanitize();

  viewport.draw();
  dopesheet.draw();
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
