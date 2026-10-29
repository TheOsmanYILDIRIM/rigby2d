// SPDX-License-Identifier: MIT OR Apache-2.0
// Mobile workspace. Original panels, menus and document operations remain authoritative.
const MEDIA = '(max-width: 850px), (pointer: coarse) and (max-width: 1024px)';
const PANELS = ['canvas', 'tree', 'inspector', 'timeline', 'workspace'];
const LABELS = { canvas: 'Tuval', tree: 'İskelet', inspector: 'Özellikler', timeline: 'Zaman çizelgesi', workspace: 'Araçlar ve menüler' };
const TOOLS = [['pose','Poz'],['create','Kemik'],['rotate','Döndür'],['translate','Taşı'],['scale','Ölçek'],['shear','Eğme'],['pivot','Pivot']];
const fold = text => String(text).toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');

export function installMobileEditor(app, viewport, options = {}) {
  const { onKey, onAutoRig, onRetarget, onDelete, showPopup, frameClipboard, seedInitialPose, onStep, twoPose, getMenus, actions = [], onAction, timelineEditors = {} } = options;
  const root = document.getElementById('app');
  if (!root) throw new Error('Rigby2D #app element missing');
  const query = window.matchMedia(MEDIA);
  const state = { active: false, panel: 'canvas', pan: false, expanded: false, multi: false, fine: false, alt: false, timelinePan: false };
  const cleanup = [], owned = [], docked = [];
  let disposed = false, previousPanel = 'canvas', lastMode = app.mode, lastWorkspace = null;
  let renderedCommands = [], revision = -1, timeRevision = -1;
  const listen = (el, name, fn, opts) => {
    if (!el) return;
    el.addEventListener(name, fn, opts);
    cleanup.push(() => el.removeEventListener(name, fn, opts));
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (id, label, title, callback) => {
    const node = el('button', '', label);
    node.id = id; node.type = 'button'; node.title = title;
    node.setAttribute('aria-label', title);
    listen(node, 'click', callback);
    return node;
  };
  const report = error => app.setStatus(error?.message || String(error));
  function run(callback, leave = false) {
    if (leave) setPanel('canvas');
    try { Promise.resolve(callback()).catch(report); } catch (error) { report(error); }
  }
  const section = (title, ...children) => {
    const node = el('section', 'av-section');
    node.append(el('h3', '', title), ...children);
    return node;
  };
  const toggle = (node, active) => {
    node.classList.toggle('active', active);
    node.setAttribute('aria-pressed', String(active));
  };

  const header = el('header'); header.id = 'avenox-mobile-header';
  const menuButton = button('av-menu', '☰', 'Proje, dosya, tüm komutlar ve ayarlar', () => setPanel(state.panel === 'workspace' ? previousPanel : 'workspace'));
  const brand = el('div', 'avenox-mobile-brand');
  const projectName = el('span', 'av-project-name', 'AVENOX 2D');
  const subtitle = el('small', '', 'Mobil çalışma alanı'); brand.append(projectName, subtitle);
  const undo = button('av-undo', '↶', 'Geri al — son düzenleme', () => run(() => app.undo()));
  const redo = button('av-redo', '↷', 'Yinele — geri alınan düzenleme', () => run(() => app.redo()));
  const mode = button('av-mode', 'Rig', 'Rig ve animasyon modu arasında geçiş', () => run(() => {
    if (app.mode === 'setup') app.playing = false;
    app.toggleMode(); refresh();
  }));
  header.append(menuButton, brand, undo, redo, mode);

  const tools = el('div'); tools.id = 'avenox-mobile-tools';
  tools.setAttribute('role', 'toolbar'); tools.setAttribute('aria-label', 'Tuval araçları');
  const toolButtons = new Map();
  const chooseTool = id => { state.pan = false; app.tool = id; app.changed(); setPanel('canvas'); };
  for (const [id, label] of TOOLS) {
    const node = button(`av-tool-${id}`, label, `${label} aracı`, () => chooseTool(id));
    toolButtons.set(id, node); tools.append(node);
  }
  const pan = button('av-pan', '✋ Kaydır', 'Tek parmakla görünümü kaydır; model değişmez', () => { state.pan = !state.pan; resetGestures(); refresh(); });
  const fit = button('av-fit', '⊡ Sığdır', 'İskeleti tuvale sığdır', () => { app.frameRequest = true; app.changed(); });
  const zoom = factor => { app.view.zoom = Math.max(0.05, Math.min(20, app.view.zoom * factor)); app.changed(); };
  tools.append(pan, fit, button('av-zoom-out', '−', 'Tuvali uzaklaştır', () => zoom(0.8)), button('av-zoom-in', '+', 'Tuvali yakınlaştır', () => zoom(1.25)));

  const transport = el('div'); transport.id = 'avenox-mobile-transport';
  transport.setAttribute('role', 'toolbar'); transport.setAttribute('aria-label', 'Animasyon oynatma ve kare kaydı');
  const prev = button('av-prev', '◀', 'Önceki ANİMASYON karesi — geri al değildir', () => { run(() => onStep ? onStep(app, -1) : app.stepFrame(-1)); refresh(); });
  const play = button('av-play', '▶', 'Animasyonu oynat veya duraklat', () => { run(() => app.togglePlay()); refresh(); });
  const next = button('av-next', '▶', 'Sonraki ANİMASYON karesi — yinele değildir', () => { run(() => onStep ? onStep(app, 1) : app.stepFrame(1)); refresh(); });
  const frameLabel = el('span', 'av-frame', 'F0');
  const key = button('av-key', '◆ Key', 'Seçimin pozunu bu kareye kaydet', () => run(() => {
    if (app.mode !== 'animate') return app.setStatus('Önce Animasyon moduna geç.');
    app.playing = false; onKey?.(); app.changed(); refresh();
  }));
  transport.append(prev, play, next, frameLabel, key);

  const panelHead = el('div'); panelHead.id = 'avenox-mobile-panelhead';
  const panelTitle = el('strong');
  const expand = button('av-expand', '⤢ Büyüt', 'Paneli büyüt veya tuval önizlemesini göster', () => { state.expanded = !state.expanded; refresh(); });
  panelHead.append(panelTitle, expand, button('av-panel-close', '×', 'Panele ara ver, tuvale dön', () => setPanel('canvas')));

  const workspace = el('section'); workspace.id = 'avenox-mobile-workspace';
  workspace.setAttribute('aria-label', 'Proje, araçlar ve tüm komutlar');
  const workspaceHead = el('div', 'av-workspace-head');
  workspaceHead.append(el('h2', '', 'Çalışma alanı'), button('av-workspace-close', '×', 'Önceki panele dön', () => setPanel(previousPanel)));
  const searchLabel = el('label', 'av-search-label', 'Komut ara'); searchLabel.htmlFor = 'av-search';
  const search = el('input'); search.id = 'av-search'; search.type = 'search'; search.placeholder = 'Save, mesh, key, render…'; search.autocomplete = 'off';
  const results = el('div', 'av-search-results'); results.hidden = true;
  const resultCount = el('p', 'av-search-count'); resultCount.setAttribute('role', 'status');
  const content = el('div', 'av-workspace-content');
  const quick = el('div', 'av-action-grid');
  const quickActions = [
    ['open', 'Proje aç', () => app.openDialog()],
    ['save', 'Kaydet', () => app.save(false)],
    ['save-as', 'Farklı kaydet', () => app.save(true)],
    ['png', 'PNG içe aktar', () => app.importImages()],
    ['psd', 'PSD içe aktar', () => app.importPsd()],
    ...(onAutoRig ? [['autorig', 'AutoRig', onAutoRig]] : []),
    ...(onRetarget ? [['retarget', 'Animasyon aktar', onRetarget]] : []),
  ];
  for (const [id, label, callback] of quickActions) quick.append(button(`av-${id}`, label, label, () => run(callback, true)));
  const nativeMenus = el('div', 'av-native-menus');
  const nativeTools = el('div', 'av-native-tools');
  content.append(section('Proje ve içe aktarma', quick), section('Tüm menüler · Oyun / Film', nativeMenus), section('Araçlar · eksenler · hassas değerler', nativeTools));

  const animation = el('div', 'av-action-grid');
  const autoKey = button('av-autokey', '● Auto Key', 'Düzenlemeleri otomatik keyframe olarak kaydet', () => {
    if (app.mode !== 'animate') return;
    app.autoKey = !app.autoKey;
    if (!app.autoKey && app.pending?.size) app.setStatus('Kare değiştirmeden önce kaydedilmemiş pozu Key ile kaydet.');
    app.changed(); refresh();
  });
  const copy = button('av-copy', 'Pozu kopyala', 'Tüm kemik ve attachment pozunu kopyala', () => { run(() => frameClipboard?.copy(app)); refresh(); });
  const paste = button('av-paste', 'Pozu yapıştır', 'Kopyalanan pozu bu kareye keyframe olarak yapıştır', () => { run(() => frameClipboard?.paste(app)); refresh(); });
  const start = button('av-start-pose', '① Başlangıç', 'Bu kareyi iki pozlu hareketin başlangıcı yap', () => { run(() => twoPose?.begin(app)); refresh(); });
  const end = button('av-end-pose', '② Bitiş', 'Başlangıçtan bu hedef poza hareket oluştur', () => { run(() => twoPose?.end(app)); refresh(); });
  animation.append(autoKey, copy, paste, start, end);
  content.append(section('Animasyon ve poz', animation));

  const modifiers = el('div', 'av-action-grid');
  const multi = button('av-multi', 'Çoklu seçim', 'Dokunmaya Ctrl ekle — çoklu seçim', () => { state.multi = !state.multi; refresh(); });
  const fine = button('av-fine', 'Shift / hassas', 'Dokunmaya Shift ekle — araç destekliyorsa hassas veya aralık seçimi', () => { state.fine = !state.fine; refresh(); });
  const alt = button('av-alt', 'Alt / bağımsız', 'Dokunmaya Alt ekle — bağımsız Bézier tutamacı gibi alternatif işlemler', () => { state.alt = !state.alt; refresh(); });
  const pivot = button('av-rig-fix', 'Rig / pivot düzelt', 'Setup modunda kemiği, PNG yerini koruyarak düzenle', () => run(() => {
    if (app.mode !== 'setup') app.toggleMode();
    const slot = app.sel?.slot;
    if (slot !== undefined && app.doc.slots[slot]) app.select({ bone: app.doc.slots[slot].bone });
    app.tool = 'pivot'; state.pan = false; setPanel('tree');
    app.setStatus('Kemiği seç; tuvalde Pivot ile sürükle. Region PNG yerinde kalır. Weighted mesh için güvenli rebind gerekir.');
    app.changed();
  }));
  modifiers.append(multi, fine, alt, pivot);
  content.append(section('Dokunmatik yardımcılar', modifiers));
  if (onAction && actions.length) {
    const shortcuts = el('details', 'av-shortcuts'); shortcuts.append(el('summary', '', 'Klavyesiz tüm kısayol komutları'));
    const grid = el('div', 'av-action-grid');
    for (const [id, label] of actions) grid.append(button(`av-action-${id}`, label, label, () => run(() => onAction(id), true)));
    shortcuts.append(grid); content.append(shortcuts);
  }
  content.append(el('p', 'av-hint', 'Tuval: iki parmakla yakınlaştır ve kaydır. İskelet / zaman çizelgesi: uzun basarak bağlam menüsünü aç. Tarayıcının desteklemediği masaüstü işlemleri bu arayüzle etkinleşmez.'));
  workspace.append(workspaceHead, searchLabel, search, resultCount, results, content);

  const nav = el('nav'); nav.id = 'avenox-mobile-bottom'; nav.setAttribute('aria-label', 'Mobil çalışma alanları');
  const navButtons = new Map();
  for (const [id, symbol, label] of [['canvas','▧','Tuval'],['tree','♧','İskelet'],['inspector','≡','Özellik'],['timeline','◷','Zaman'],['workspace','⋯','Tümü']]) {
    const node = button(`av-tab-${id}`, `${symbol}\n${label}`, LABELS[id], () => setPanel(id));
    navButtons.set(id, node); nav.append(node);
  }
  owned.push(header, tools, transport, panelHead, workspace, nav);
  root.append(...owned);
  const timeline = document.getElementById('timeline');
  const timelineTools = el('div'); timelineTools.id = 'avenox-timeline-tools';
  timelineTools.setAttribute('role', 'toolbar'); timelineTools.setAttribute('aria-label', 'Zaman çizelgesi gezinme');
  const timelinePan = button('av-timeline-pan', '✋ Kaydır', 'Zaman çizelgesini tek parmakla kaydır; kapalıyken keyframe düzenle', () => { state.timelinePan = !state.timelinePan; resetTimeline(); refresh(); });
  timelineTools.append(timelinePan);
  const graphButtons = [];
  const graphCommand = (kind, delta) => {
    const graph = timelineEditors.graph;
    if (!graph?.layout) return;
    if (kind === 'fit') return graph.fit();
    const r = graph.canvas.getBoundingClientRect(), layout = graph.layout;
    graph.onWheel({ clientX: r.left + layout.trackLeft + layout.trackW / 2,
      clientY: r.top + Math.min(r.height / 2, graph.scroller.clientHeight / 2), deltaY: delta,
      ctrlKey: kind === 'time', altKey: kind === 'pan-time', shiftKey: kind === 'pan-value', preventDefault() {} });
  };
  for (const [id, label, kind, delta] of [
    ['fit', '⊡ Grafik', 'fit', 0], ['time-out', 'Zaman −', 'time', 1], ['time-in', 'Zaman +', 'time', -1],
    ['value-out', 'Değer −', 'value', 1], ['value-in', 'Değer +', 'value', -1],
    ['left', '← Zaman', 'pan-time', -1], ['right', 'Zaman →', 'pan-time', 1],
    ['up', '↑ Değer', 'pan-value', 1], ['down', 'Değer ↓', 'pan-value', -1],
  ]) {
    const node = button(`av-graph-${id}`, label, label, () => run(() => graphCommand(kind, delta)));
    graphButtons.push(node); timelineTools.append(node);
  }
  if (timeline) { timeline.insertBefore(timelineTools, document.getElementById('controls')?.nextSibling || null); owned.push(timelineTools); }


  // Move, never clone, the upstream controls. Restore their exact slots on desktop/dispose.
  function mountNative(active) {
    if (active && !docked.length) {
      for (const [id, target] of [['menubar', nativeMenus], ['viewbar', nativeTools]]) {
        const node = document.getElementById(id);
        if (!node?.parentNode) continue;
        const marker = document.createComment(`mobile:${id}`);
        node.parentNode.insertBefore(marker, node);
        docked.push({ node, marker }); target.append(node);
      }
    } else if (!active) {
      for (const { node, marker } of docked) { marker.parentNode?.insertBefore(node, marker); marker.remove(); }
      docked.length = 0;
    }
  }
  function buildSearch() {
    renderedCommands = [];
    const names = { File: 'Dosya', Edit: 'Düzenle', View: 'Görünüm', Scripts: 'Betikler', Help: 'Yardım' };
    try {
      for (const [category, items] of Object.entries(getMenus?.() || {})) {
        for (const item of items) {
          if (item && typeof item.action === 'function') renderedCommands.push({ label: `${names[category] || category} · ${item.label}`, disabled: !!item.disabled, action: item.action });
        }
      }
      for (const [id, label] of actions) if (onAction) renderedCommands.push({ label: `Kısayol · ${label}`, action: () => onAction(id) });
      lastWorkspace = app.workspace;
    } catch (error) { report(error); }
    filterSearch();
  }
  function filterSearch() {
    const text = fold(search.value.trim()); results.replaceChildren();
    results.hidden = !text; content.hidden = !!text;
    resultCount.textContent = '';
    if (!text) return;
    const matches = renderedCommands.filter(item => fold(item.label).includes(text));
    resultCount.textContent = `${matches.length} komut. Alt menü ve seçenekler için aramayı temizleyip tüm menüleri kullan.`;
    for (const item of matches) {
      const node = el('button', '', item.label); node.type = 'button'; node.disabled = item.disabled;
      node.addEventListener('click', () => run(item.action, true)); results.append(node);
    }
  }
  listen(search, 'input', filterSearch);
  listen(nativeTools, 'click', event => {
    if (event.target.closest?.('button.tool')) { state.pan = false; setPanel('canvas'); }
  });

  function setPanel(name) {
    if (!PANELS.includes(name) || disposed) return;
    const wasWorkspace = state.panel === 'workspace';
    if (name === 'workspace' && !wasWorkspace) previousPanel = state.panel;
    state.panel = name;
    resetGestures(); resetTimeline();
    if (name === 'workspace') { search.value = ''; buildSearch(); }
    if (wasWorkspace && name !== 'workspace' && workspace.contains(document.activeElement)) document.activeElement?.blur?.();
    refresh();
  }
  function refresh() {
    if (disposed) return;
    if (state.active && app.mode === 'animate' && lastMode !== 'animate') {
      app.autoKey = true; seedInitialPose?.(app); app.changed();
    }
    lastMode = app.mode;
    root.dataset.mobilePanel = state.panel;
    root.dataset.mobilePan = String(state.pan);
    root.dataset.mobileExpanded = String(state.expanded);
    root.dataset.mobileMulti = String(state.multi);
    root.dataset.mobileFine = String(state.fine);
    root.dataset.mobileAlt = String(state.alt);
    for (const [id, node] of navButtons) {
      node.classList.toggle('active', state.panel === id);
      node.setAttribute('aria-current', state.panel === id ? 'page' : 'false');
    }
    for (const [id, node] of toolButtons) toggle(node, app.tool === id && !state.pan);
    toggle(pan, state.pan); toggle(multi, state.multi); toggle(fine, state.fine); toggle(alt, state.alt);
    toggle(timelinePan, state.timelinePan);
    for (const node of graphButtons) node.hidden = app.timelineView !== 'graph' || !timelineEditors.graph;
    toggle(menuButton, state.panel === 'workspace');
    mode.textContent = app.mode === 'animate' ? 'Animasyon' : 'Rig';
    toggle(mode, app.mode === 'animate');
    play.textContent = app.playing ? 'Ⅱ' : '▶';
    play.setAttribute('aria-label', app.playing ? 'Animasyonu duraklat' : 'Animasyonu oynat');
    const animating = app.mode === 'animate';
    key.disabled = !animating || typeof onKey !== 'function';
    autoKey.disabled = !animating;
    copy.disabled = !animating || !frameClipboard;
    paste.disabled = !animating || !frameClipboard?.canPaste;
    start.disabled = !animating || !twoPose;
    end.disabled = !animating || !twoPose || twoPose.startFrame == null;
    end.title = twoPose?.startFrame == null ? 'Önce Başlangıç seç' : `Başlangıç F${twoPose.startFrame}; bu hedef pozda bitir`;
    toggle(autoKey, animating && !!app.autoKey);
    autoKey.textContent = app.autoKey ? '● Auto Key açık' : '○ Auto Key kapalı';
    const frame = Math.round((app.time || 0) * (app.doc?.settings?.fps || 30));
    frameLabel.textContent = `F${frame}`; key.title = `Seçili pozu F${frame} karesine kaydet`;
    panelTitle.textContent = LABELS[state.panel];
    expand.textContent = state.expanded ? '▧ Önizle' : '⤢ Büyüt';
    workspace.hidden = state.panel !== 'workspace';
    panelHead.hidden = !['tree', 'inspector', 'timeline'].includes(state.panel);
    subtitle.textContent = [app.workspace === 'film' ? 'Film' : 'Oyun', state.multi ? 'Ctrl açık' : '', state.fine ? 'Shift' : '', state.alt ? 'Alt' : ''].filter(Boolean).join(' · ');
    if (app.history) { undo.disabled = !app.history.undo.length; redo.disabled = !app.history.redo.length; }
    const title = typeof app.title === 'function' ? app.title() : 'AVENOX 2D';
    if (projectName.textContent !== title) { projectName.textContent = title; projectName.title = title; }
    if (state.panel === 'workspace' && lastWorkspace !== app.workspace) buildSearch();
  }

  // Single-touch edits continue through the original viewport. Only pan/pinch are intercepted.
  const pointers = new Map(); let pinch = null, lastPan = null, gesture = false;
  const point = event => { const r = viewport.canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; };
  const stopPress = () => { viewport.press = null; viewport.drag = null; viewport.panning = null; viewport.meshPress = false; };
  function resetGestures() { pointers.clear(); pinch = null; lastPan = null; gesture = false; stopPress(); }
  function updatePinch() {
    const [a, b] = [...pointers.values()]; if (!a || !b) return;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, span = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y));
    if (pinch) {
      const old = app.view.zoom, z = Math.max(0.05, Math.min(20, old * span / pinch.span)), ratio = z / old;
      app.view.panX += mid.x - pinch.mid.x + (pinch.mid.x - viewport.width / 2 - app.view.panX) * (1 - ratio);
      app.view.panY += mid.y - pinch.mid.y + (pinch.mid.y - viewport.height / 2 - app.view.panY) * (1 - ratio);
      app.view.zoom = z; app.changed();
    }
    pinch = { mid, span };
  }
  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  listen(viewport.canvas, 'pointerdown', event => {
    if (!state.active || event.pointerType !== 'touch') return;
    pointers.set(event.pointerId, point(event));
    if (pointers.size > 1) { gesture = true; stopPress(); lastPan = null; pinch = null; updatePinch(); consume(event); }
    else if (state.pan) { gesture = true; lastPan = point(event); consume(event); }
  }, { capture: true, passive: false });
  listen(viewport.canvas, 'pointermove', event => {
    if (!state.active || event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return;
    const next = point(event); pointers.set(event.pointerId, next);
    if (pointers.size >= 2) { stopPress(); updatePinch(); consume(event); }
    else if (gesture) {
      if (state.pan && lastPan) { app.view.panX += next.x - lastPan.x; app.view.panY += next.y - lastPan.y; app.changed(); }
      lastPan = next; consume(event);
    }
  }, { capture: true, passive: false });
  const finish = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    const intercepted = gesture;
    if (pointers.size < 2) pinch = null;
    lastPan = pointers.size === 1 && state.pan ? [...pointers.values()][0] : null;
    if (!pointers.size) gesture = false;
    if (intercepted) { stopPress(); consume(event); }
  };
  // Window bubbling allows the app's capture-phase pointer/history bookkeeping to finish first.
  listen(viewport.canvas, 'pointerup', finish, true); listen(viewport.canvas, 'pointercancel', finish, true);
  listen(window, 'pointerup', finish); listen(window, 'pointercancel', finish);
  listen(window, 'blur', () => { resetGestures(); resetTimeline(); state.multi = state.fine = state.alt = false; refresh(); });

  // Explicit touch modifiers use the very same event properties as desktop Ctrl/Shift.
  const modifyPointer = event => {
    if (!state.active || !['touch', 'pen'].includes(event.pointerType)) return;
    if (!event.target.closest?.('#viewport, #tree, #properties, #dopesheet, #graph, #viewbar')) return;
    if (state.multi) Object.defineProperty(event, 'ctrlKey', { configurable: true, value: true });
    if (state.fine) Object.defineProperty(event, 'shiftKey', { configurable: true, value: true });
    if (state.alt) Object.defineProperty(event, 'altKey', { configurable: true, value: true });
  };
  listen(window, 'pointerdown', modifyPointer, true); listen(window, 'pointermove', modifyPointer, true);

  // The canvases suppress browser scrolling. Two fingers (or explicit Pan mode) scroll
  // the existing scroller without dragging keys; graph zoom remains on its native API.
  const timelineResets = [];
  function resetTimeline() { for (const reset of timelineResets) reset(); }
  for (const editor of Object.values(timelineEditors)) {
    if (!editor?.canvas || !editor.scroller) continue;
    const touches = new Map(); let last = null, intercept = false;
    const reset = () => { touches.clear(); last = null; intercept = false; editor.press = null; };
    timelineResets.push(reset);
    const mid = () => { const ps = [...touches.values()]; return { x: ps.reduce((v, p) => v + p.x, 0) / ps.length, y: ps.reduce((v, p) => v + p.y, 0) / ps.length }; };
    listen(editor.canvas, 'pointerdown', event => {
      if (!state.active || event.pointerType !== 'touch') return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size > 1 || state.timelinePan) { intercept = true; editor.press = null; last = mid(); consume(event); }
    }, { capture: true, passive: false });
    listen(editor.canvas, 'pointermove', event => {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!intercept) return;
      const next = mid();
      if (last) { editor.scroller.scrollTop += last.y - next.y; editor.scroller.scrollLeft += last.x - next.x; }
      last = next; editor.press = null; consume(event);
    }, { capture: true, passive: false });
    const endTouch = event => {
      if (!touches.has(event.pointerId)) return;
      touches.delete(event.pointerId);
      if (intercept) { editor.press = null; consume(event); }
      if (!touches.size) reset(); else last = mid();
    };
    listen(editor.canvas, 'pointerup', endTouch, true); listen(editor.canvas, 'pointercancel', endTouch, true);
    listen(window, 'pointerup', endTouch); listen(window, 'pointercancel', endTouch);
  }

  function longPress(target, callback) {
    if (!target) return;
    let timer = null, start = null, pointer = null, suppressUntil = 0;
    const cancel = () => { if (timer !== null) window.clearTimeout(timer); timer = null; };
    listen(target, 'pointerdown', event => {
      cancel();
      if (!state.active || event.pointerType !== 'touch' || !event.isPrimary || (target === viewport.canvas && state.pan) || (target !== viewport.canvas && state.timelinePan && target.id !== 'tree')) return;
      pointer = event.pointerId; start = { x: event.clientX, y: event.clientY, target: event.target };
      timer = window.setTimeout(() => { timer = null; suppressUntil = Date.now() + 800; stopPress(); callback(start); }, 550);
    }, true);
    listen(window, 'pointerdown', event => { if (timer !== null && event.pointerId !== pointer) cancel(); }, true);
    listen(target, 'pointermove', event => { if (start && (event.pointerId !== pointer || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10)) cancel(); }, true);
    listen(window, 'pointerup', cancel, true); listen(window, 'pointercancel', cancel, true); listen(window, 'blur', cancel);
    listen(target, 'click', event => { if (Date.now() < suppressUntil) { consume(event); suppressUntil = 0; } }, true);
    listen(target, 'contextmenu', event => { if (state.active) event.preventDefault(); });
    cleanup.push(cancel);
  }
  longPress(document.getElementById('tree'), ({ x, y, target }) => {
    target.closest?.('.row')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y, ctrlKey: state.multi, shiftKey: state.fine }));
  });
  for (const id of ['dopesheet', 'graph']) {
    const editor = timelineEditors[id];
    if (editor) longPress(editor.canvas, ({ x, y }) => {
      // These editors open curve menus on right pointerdown, NOT contextmenu.
      editor.press = null;
      editor.onPointerDown({ button: 2, clientX: x, clientY: y, ctrlKey: state.multi, shiftKey: state.fine, altKey: state.alt });
    });
  }
  longPress(viewport.canvas, ({ x, y }) => {
    const hit = viewport.hitTest?.(app.pose(), viewport.eventPos({ clientX: x, clientY: y }));
    if (hit) app.select(hit);
    showPopup?.(x, y, [
      { label: 'Özellikleri aç', disabled: !hit, action: () => setPanel('inspector') },
      { label: 'İskelet / görseller', action: () => setPanel('tree') },
      { label: 'Seçimi sil', disabled: !hit || app.mode !== 'setup', action: () => run(() => { onDelete?.(); app.changed(); }) },
      { label: 'Görünümü sığdır', action: () => { app.frameRequest = true; app.changed(); } },
    ]);
  });
  listen(window, 'keydown', event => {
    if (state.active && event.key === 'Escape' && state.panel === 'workspace') setPanel(previousPanel);
  });
  function updateViewport() {
    const vv = window.visualViewport;
    // Do not counteract accessibility pinch-zoom. Only follow the keyboard/normal viewport.
    const useVisual = vv && Math.abs(vv.scale - 1) < 0.01;
    root.style.setProperty('--av-height', `${useVisual ? vv.height : window.innerHeight}px`);
    root.style.setProperty('--av-top', `${useVisual ? vv.offsetTop : 0}px`);
    document.body.style.setProperty('--av-height', `${useVisual ? vv.height : window.innerHeight}px`);
    document.body.style.setProperty('--av-top', `${useVisual ? vv.offsetTop : 0}px`);
  }
  function applyMedia() {
    state.active = query.matches || new URLSearchParams(window.location.search).get('mobile') === '1';
    root.classList.toggle('mobile-layout', state.active);
    document.body.classList.toggle('avenox-mobile', state.active);
    mountNative(state.active);
    if (!state.active) { state.pan = state.multi = state.fine = state.alt = false; resetGestures(); resetTimeline(); }
    updateViewport(); refresh();
  }
  listen(query, 'change', applyMedia); listen(window, 'resize', updateViewport);
  listen(window.visualViewport, 'resize', updateViewport); listen(window.visualViewport, 'scroll', updateViewport);
  // All gesture state is initialized before desktop/mobile activation (no TDZ on desktop).
  applyMedia();
  const interval = window.setInterval(() => {
    if (!state.active || disposed) return;
    if (revision !== app.version || timeRevision !== app.timeVersion || app.playing) { revision = app.version; timeRevision = app.timeVersion; refresh(); }
  }, 100);
  cleanup.push(() => window.clearInterval(interval));
  return {
    setPanel, getState: () => ({ ...state }),
    dispose() {
      if (disposed) return; disposed = true;
      resetGestures(); resetTimeline(); cleanup.forEach(fn => fn()); mountNative(false); owned.forEach(node => node.remove());
      root.classList.remove('mobile-layout'); document.body.classList.remove('avenox-mobile');
      for (const key of ['mobilePanel', 'mobilePan', 'mobileExpanded', 'mobileMulti', 'mobileFine', 'mobileAlt']) delete root.dataset[key];
      for (const node of [root, document.body]) { node.style.removeProperty('--av-height'); node.style.removeProperty('--av-top'); }
    },
  };
}
