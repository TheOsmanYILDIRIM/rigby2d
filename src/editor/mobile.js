// SPDX-License-Identifier: MIT OR Apache-2.0
// Avenox mobile interface for the upstream Rigby2D skeletal editor.
// The upstream skeleton, IK, weighted meshes and animation document remain authoritative.

import { popupMenu } from './widgets.js';
import * as edit from './edit.js';

const MEDIA = '(max-width: 850px), (pointer: coarse) and (max-width: 1024px)';
const PANELS = ['canvas', 'tree', 'inspector', 'timeline'];

function makeButton(label, title, handler, className = '') {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.title = title;
  el.setAttribute('aria-label', title);
  el.addEventListener('click', handler);
  return el;
}

function installGestures(app, viewport, state) {
  const canvas = viewport.canvas;
  const pointers = new Map();
  let pinch = null;
  let lastPan = null;
  const location = (event) => {
    const r = canvas.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  };
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const length = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function stopPress() {
    viewport.press = null;
    viewport.drag = null;
    viewport.panning = null;
    viewport.meshPress = false;
  }
  function updatePinch() {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    const mid = midpoint(a, b);
    const span = Math.max(8, length(a, b));
    if (pinch === null) { pinch = { mid, span }; return; }
    const old = app.view.zoom;
    const zoom = Math.min(20, Math.max(0.05, old * span / pinch.span));
    const ratio = zoom / old;
    const rx = pinch.mid.x - viewport.width / 2 - app.view.panX;
    const ry = pinch.mid.y - viewport.height / 2 - app.view.panY;
    app.view.panX += mid.x - pinch.mid.x + rx * (1 - ratio);
    app.view.panY += mid.y - pinch.mid.y + ry * (1 - ratio);
    app.view.zoom = zoom;
    pinch = { mid, span };
    app.changed();
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (!state.active || event.pointerType !== 'touch') return;
    pointers.set(event.pointerId, location(event));
    if (pointers.size > 1) {
      stopPress();
      lastPan = null;
      pinch = null;
      updatePinch();
      event.stopImmediatePropagation();
      event.preventDefault();
    } else if (state.pan) {
      lastPan = location(event);
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }, { capture: true, passive: false });
  canvas.addEventListener('pointermove', (event) => {
    if (!state.active || event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return;
    const next = location(event);
    pointers.set(event.pointerId, next);
    if (pointers.size >= 2) {
      stopPress();
      updatePinch();
      event.stopImmediatePropagation();
      event.preventDefault();
    } else if (state.pan && lastPan !== null) {
      app.view.panX += next.x - lastPan.x;
      app.view.panY += next.y - lastPan.y;
      lastPan = next;
      app.changed();
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }, { capture: true, passive: false });
  function finish(event) {
    if (event.pointerType !== 'touch') return;
    const wasGesture = state.active && (pinch !== null || state.pan);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) lastPan = null;
    if (wasGesture) {
      stopPress();
      event.stopImmediatePropagation();
    }
  }
  canvas.addEventListener('pointerup', finish, true);
  canvas.addEventListener('pointercancel', finish, true);
  window.addEventListener('blur', () => { pointers.clear(); pinch = null; lastPan = null; });
}

export function installMobileEditor(app, viewport, { onKey, onAutoRig, onRetarget } = {}) {
  const root = document.getElementById('app');
  if (!root) throw new Error('Rigby2D #app element missing');
  const query = window.matchMedia(MEDIA);
  const state = { active: false, panel: 'canvas', pan: false };
  const header = document.createElement('header');
  header.id = 'avenox-mobile-header';
  const brand = document.createElement('span');
  brand.className = 'avenox-mobile-brand';
  brand.textContent = 'AVENOX 2D · Mobile';

  const fileMenu = document.createElement('div');
  fileMenu.id = 'avenox-mobile-filemenu';
  fileMenu.hidden = true;
  fileMenu.setAttribute('role', 'menu');
  const openMenu = makeButton('☰ Dosya', 'Dosya seçeneklerini göster', () => { fileMenu.hidden = !fileMenu.hidden; });
  const mode = makeButton('Rig modu', 'Rig / animasyon modu', () => { app.toggleMode(); refresh(); });
  const undo = makeButton('↶', 'Geri al', () => app.undo());
  const redo = makeButton('↷', 'İleri al', () => app.redo());
  const more = makeButton('⋮ Komutlar', 'Tüm masaüstü menü komutları', () => { fileMenu.hidden = true; showDesktopCommands(); });
  header.append(brand, openMenu, more, mode, undo, redo);

  const commands = [
    ['📂 Proje aç', () => app.openDialog()],
    ['💾 Kaydet', () => app.save(false)],
    ['📑 Farklı kaydet', () => app.save(true)],
    ['📥 PNG içe aktar', () => app.importImages()],
    ['🧩 PSD içe aktar', () => app.importPsd()],
    ...(onAutoRig ? [['🦴 AutoRig', onAutoRig]] : []),
    ...(onRetarget ? [['↔ Animasyon aktar', onRetarget]] : []),
    ['📤 İskelet JSON dışa aktar', () => app.exportSkeletonJson(app.saveVersion())],
    ['🗑 Seçili kemik / slot sil', () => { if(app.mode==='setup') { edit.deleteSelection(app); app.changed(); } else app.setStatus('Switch to SETUP before deleting'); }],
  ];
  for (const [title, callback] of commands) {
    fileMenu.append(makeButton(title, title, () => {
      fileMenu.hidden = true;
      try { Promise.resolve(callback()).catch(e => app.setStatus(e?.message || String(e))); }
      catch (e) { app.setStatus(e?.message || String(e)); }
    }));
  }

  const tools = document.createElement('div');
  tools.id = 'avenox-mobile-tools';
  const toolButtons = new Map();
  for (const [id, label] of [['pose','✋ Poz'],['create','🦴 Kemik'],['rotate','⟳ Döndür'],['translate','✥ Taşı'],['scale','⤢ Ölçek'],['shear','⧄ Eğme']]) {
    const btn = makeButton(label, label, () => { app.tool = id; app.changed(); state.pan = false; refresh(); });
    toolButtons.set(id, btn);
    tools.append(btn);
  }
  const pan = makeButton('✥ Kaydır', 'Tek parmakla tuvali kaydır', () => { state.pan = !state.pan; refresh(); });
  const zoom = (factor) => { app.view.zoom = Math.max(.05, Math.min(20, app.view.zoom * factor)); app.changed(); };
  tools.append(
    pan,
    makeButton('−', 'Uzaklaştır', () => zoom(0.8)),
    makeButton('⊡', 'İskeleti sığdır', () => { app.frameRequest = true; app.changed(); }),
    makeButton('+', 'Yakınlaştır', () => zoom(1.25)),
  );

  const transport = document.createElement('div');
  transport.id = 'avenox-mobile-transport';
  const prev = makeButton('⟵ Kare', 'Önceki animasyon karesi', () => app.stepFrame(-1));
  const play = makeButton('▶ Oynat', 'Animasyonu oynat veya duraklat', () => { app.togglePlay(); refresh(); });
  const next = makeButton('Kare ⟶', 'Sonraki animasyon karesi', () => app.stepFrame(1));
  const key = makeButton('◆ Key', 'Seçime keyframe ekle', () => onKey?.());
  transport.append(prev, play, next, key);

  const nav = document.createElement('nav');
  nav.id = 'avenox-mobile-bottom';
  nav.setAttribute('aria-label', 'Mobil düzenleyici panelleri');
  const navButtons = new Map();
  for (const [id, symbol, label] of [['canvas','▧','Tuval'],['tree','♧','İskelet'],['inspector','≡','Özellik'],['timeline','◷','Zaman']]) {
    const btn = makeButton(symbol + '\n' + label, label + ' paneline geç', () => setPanel(id));
    btn.setAttribute('role', 'tab');
    navButtons.set(id, btn);
    nav.append(btn);
  }
  root.append(header, fileMenu, tools, transport, nav);

  // Expose every original desktop command: File / Edit / View / Scripts / Help.
  // Keep command implementations in upstream menubar, rather than duplicate them.
  function showDesktopCommands() {
    const categories = [...document.querySelectorAll('#menubar .menu-title')]
      .filter(button => button.textContent.trim());
    popupMenu(Math.max(4, window.innerWidth - 280), 54, categories.map(button=>({
      label: button.textContent.trim(),
      action: () => button.click(),
    })));
  }

  // Long-press invokes the very same contextmenu events as a desktop right click.
  // A multi-touch gesture or movement never opens a menu.
  const holdCleanup = [];
  function longPress(target, callback) {
    let timer = null, start = null, captured = null, fired = false;
    const clear = () => { if(timer!==null) globalThis.clearTimeout(timer); timer=null; };
    const down = e => {
      if(!state.active || e.pointerType!=='touch' || !e.isPrimary) { clear(); return; }
      clear(); fired=false; captured=e.pointerId; start={x:e.clientX,y:e.clientY};
      timer=globalThis.setTimeout(()=>{
        timer=null; fired=true;
        callback({x:start.x,y:start.y,target:e.target});
        globalThis.navigator?.vibrate?.(15);
      },550);
    };
    const move = e => {
      if(e.pointerId!==captured) { clear(); return; }
      if(start && Math.hypot(e.clientX-start.x,e.clientY-start.y)>12) clear();
    };
    const finish=e=>{
      if(e.pointerId===captured){ clear(); captured=null; }
      if(fired){ e.preventDefault(); e.stopImmediatePropagation(); fired=false; }
    };
    const menu=e=>{ if(state.active){ e.preventDefault(); } };
    target.addEventListener('pointerdown',down,{capture:true});
    target.addEventListener('pointermove',move,{capture:true});
    target.addEventListener('pointerup',finish,{capture:true});
    target.addEventListener('pointercancel',finish,{capture:true});
    target.addEventListener('contextmenu',menu);
    holdCleanup.push(()=>{ clear(); target.removeEventListener('pointerdown',down,true);target.removeEventListener('pointermove',move,true);target.removeEventListener('pointerup',finish,true);target.removeEventListener('pointercancel',finish,true);target.removeEventListener('contextmenu',menu);});
  }
  const tree = document.getElementById('tree');
  if(tree) longPress(tree,({x,y,target})=>{
    const row=target.closest?.('.row');
    if(!row) return;
    row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:x,clientY:y}));
  });
  longPress(viewport.canvas,({x,y})=>{
    const pos=viewport.eventPos({clientX:x,clientY:y});
    const hit=viewport.hitTest(app.pose(),pos);
    if(hit) app.select(hit);
    popupMenu(x,y,[
      {label: 'Select object',disabled:!hit,action:()=>hit&&app.select(hit)},
      {label: 'Delete selected bone / slot',disabled:!hit||app.mode!=='setup',action:()=>{edit.deleteSelection(app);app.changed();}},
      {label: 'Open properties',disabled:!hit,action:()=>setPanel('inspector')},
      {label: 'Open image list / skeleton',action:()=>setPanel('tree')},
      {label: 'Fit view',action:()=>{app.frameRequest=true;app.changed();}},
    ]);
  });

  function setPanel(name) {
    if (!PANELS.includes(name)) return;
    state.panel = name;
    fileMenu.hidden = true;
    refresh();
  }
  function refresh() {
    root.dataset.mobilePanel = state.panel;
    root.dataset.mobilePan = String(state.pan);
    for (const [id, btn] of navButtons) {
      const active = state.panel === id;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    }
    for (const [id, btn] of toolButtons) btn.classList.toggle('active', id === app.tool && !state.pan);
    pan.classList.toggle('active', state.pan);
    mode.textContent = app.mode === 'animate' ? 'Animasyon' : 'Rig modu';
    play.textContent = app.playing ? '⏸ Duraklat' : '▶ Oynat';
    key.disabled = app.mode !== 'animate' || typeof onKey !== 'function';
  }
  function applyMedia() {
    state.active = query.matches || new URLSearchParams(window.location.search).get('mobile') === '1';
    root.classList.toggle('mobile-layout', state.active);
    if (!state.active) { state.pan = false; fileMenu.hidden = true; }
    refresh();
  }
  query.addEventListener?.('change', applyMedia);
  applyMedia();
  installGestures(app, viewport, state);
  let revision = -1;
  const interval = window.setInterval(() => {
    if (!state.active) return;
    if (revision !== app.version || app.playing) { revision = app.version; refresh(); }
  }, 200);
  return { setPanel, getState: () => ({ ...state }), dispose: () => { window.clearInterval(interval); holdCleanup.forEach(fn=>fn()); query.removeEventListener?.('change', applyMedia); } };
}
