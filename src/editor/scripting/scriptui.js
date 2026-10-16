// SPDX-License-Identifier: MIT OR Apache-2.0
// Scripts in the editor: the script library (kept between sessions), the Scripts menu with the
// tools scripts add, and the script editor window.

import * as log from '../log.js';
import { makeDraggable, openLogWindow } from '../logwindow.js';
import { isDesktop, pickImportFiles } from '../platform.js';
import { h } from '../widgets.js';
import { ScriptHost } from './host.js';
import moduleSource from './rigby.py?raw';

const STORAGE = 'rigby.scripts';

const EXAMPLE = `import rigby

# Scripts edit the open project. A run is one undo step; errors roll it back (see View > Log).
print("Bones:", ", ".join(b.name for b in rigby.bones()))


@rigby.tool("Mirror selected bones", description="Flip the selected bones across X = 0")
def mirror():
    for bone in rigby.selected_bones():
        bone.set(x=-bone.x, rotation=180 - bone.rotation)
`;

/** Pyodide, bundled with the editor and loaded on first use. */
async function loadRuntime() {
  const base = `${import.meta.env.BASE_URL}pyodide/`;
  const { loadPyodide } = await import(/* @vite-ignore */ `${base}pyodide.mjs`);
  return loadPyodide({ indexURL: base });
}

/** Library entries: { name, source, path (desktop file it was added from, or null) }. */
function loadLibrary() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE) ?? '[]');
    return Array.isArray(list) ? list.filter((s) => s && typeof s.name === 'string' && typeof s.source === 'string') : [];
  } catch {
    return [];
  }
}

function saveLibrary(list) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(list));
  } catch (e) {
    log.exception(e, { source: 'scripts', context: 'Could not store the script library' });
  }
}

export class Scripts {
  constructor(app) {
    this.app = app;
    this.library = loadLibrary();
    this.host = new ScriptHost(app, { loadRuntime, moduleSource, onChange: () => this.changed() });
    this.window = null;
  }

  changed() {
    this.window?.refresh();
    this.app.changed();
  }

  /** Loads every library script (re-reading desktop files), registering their tools. */
  async loadAll({ quiet = false } = {}) {
    if (!this.library.length) return;
    await this.refreshFiles();
    let failed = 0;
    for (const s of this.library) if (!(await this.run(s.name, s.source)).ok) failed++;
    if (!quiet || failed) this.app.setStatus(failed ? `${failed} script(s) failed to load (details in View ▸ Log)` : `Loaded ${this.library.length} script(s)`);
  }

  /** Desktop: scripts added from files are re-read, so editing them in another editor works. */
  async refreshFiles() {
    if (!isDesktop) return;
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    for (const s of this.library) {
      if (!s.path) continue;
      try {
        s.source = await readTextFile(s.path);
      } catch (e) {
        log.warn(`Could not re-read ${s.path}: ${log.errorMessage(e)}; using the stored copy`, { source: s.name });
      }
    }
    saveLibrary(this.library);
  }

  async run(name, source) {
    try {
      return await this.host.runScript(name, source);
    } catch (e) {
      // Python itself did not start; the host has logged why.
      this.app.setStatus(`Python could not start: ${log.errorMessage(e)}`);
      return { ok: false, error: log.errorMessage(e) };
    }
  }

  /** Adds or replaces a library script, then runs it. */
  async save(name, source, path = null) {
    const existing = this.library.find((s) => s.name === name);
    if (existing) Object.assign(existing, { source, path: path ?? existing.path });
    else this.library.push({ name, source, path });
    saveLibrary(this.library);
    const r = await this.run(name, source);
    if (r.ok) this.app.setStatus(r.value.length ? `${name}: added ${r.value.join(', ')} to the Scripts menu` : `Ran ${name}`);
    this.changed();
    return r;
  }

  remove(name) {
    this.library = this.library.filter((s) => s.name !== name);
    saveLibrary(this.library);
    this.host.forget(name);
    this.app.setStatus(`Removed script ${name}`);
  }

  async addFiles() {
    const files = await this.app.guard(() => pickImportFiles('Python scripts', ['py'], true));
    if (!files?.length) return;
    for (const f of files) {
      const name = f.name.split(/[\\/]/).pop();
      await this.save(name, new TextDecoder().decode(f.bytes), isDesktop ? f.name : null);
    }
  }

  async reload() {
    await this.host.ready().catch(() => null);
    if (this.host.state !== 'ready') return;
    for (const s of this.library) this.host.forget(s.name);
    await this.loadAll();
  }

  /** Scripts menu entries. */
  menu() {
    const state = this.host.state;
    const tools = [...this.host.tools.values()];
    return [
      { label: 'Script editor…', action: () => this.openEditor() },
      { label: 'Add script files (.py)…', action: () => this.addFiles() },
      { label: 'Reload scripts', disabled: !this.library.length, action: () => this.reload() },
      { label: 'Log', action: () => openLogWindow() },
      'separator',
      ...(state === 'loading'
        ? [{ label: 'Starting Python…', disabled: true }]
        : tools.length
          ? tools.map((t) => ({ label: t.label, title: t.description || `From ${t.script}`, disabled: this.host.running, action: () => this.host.runTool(t.id) }))
          : [{ label: this.library.length ? 'No tools: scripts add them with @rigby.tool' : 'No scripts yet: open the Script editor', disabled: true }]),
    ];
  }

  openEditor() {
    if (this.window) return this.window.el.querySelector('textarea').focus();
    this.window = scriptEditor(this);
  }
}

/** The script editor: library on the left, code on the right, Run and Save. */
function scriptEditor(scripts) {
  let current = scripts.library[0]?.name ?? null;
  const name = h('input', { type: 'text', class: 'script-name', spellcheck: false, placeholder: 'script.py' });
  const code = h('textarea', { class: 'script-code', spellcheck: false, wrap: 'off' });
  const list = h('div', { class: 'script-list' });
  const state = h('span', { class: 'weak' });

  const load = (entry) => {
    current = entry?.name ?? null;
    name.value = entry?.name ?? 'new_script.py';
    code.value = entry?.source ?? EXAMPLE;
    draw();
  };
  const fileName = () => {
    const n = name.value.trim() || 'script.py';
    return n.endsWith('.py') ? n : `${n}.py`;
  };
  const busy = (on) => {
    for (const b of el.querySelectorAll('button[data-run]')) b.disabled = on;
  };
  const run = async (save) => {
    busy(true);
    state.textContent = scripts.host.state === 'ready' ? 'Running…' : 'Starting Python…';
    try {
      const n = fileName();
      if (save && current && current !== n) scripts.remove(current);
      const r = save ? await scripts.save(n, code.value) : await scripts.run(n, code.value);
      if (save) current = n;
      if (r.ok && !save) scripts.app.setStatus(`Ran ${n}${r.value.length ? `; tools: ${r.value.join(', ')}` : ''}`);
      state.textContent = r.ok ? 'Done' : `Failed: ${r.error}`;
      if (!r.ok) openLogWindow();
    } finally {
      busy(false);
      draw();
    }
  };
  code.addEventListener('keydown', (e) => {
    // The editor's shortcuts stay out of the code; Tab indents, Ctrl+Enter runs.
    e.stopPropagation();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b } = code;
      code.setRangeText('    ', a, b, 'end');
    }
  });
  name.addEventListener('keydown', (e) => e.stopPropagation());

  const draw = () => {
    list.replaceChildren(
      ...scripts.library.map((s) =>
        h(
          'div',
          { class: `script-item${s.name === current ? ' selected' : ''}`, title: s.path ?? 'Stored in the editor', onclick: () => load(s) },
          h('span', null, s.name),
          h('span', { class: 'weak' }, ` ${[...scripts.host.tools.values()].filter((t) => t.script === s.name).length || ''}`),
        ),
      ),
      h('button', { class: 'script-new', onclick: () => load(null) }, '＋ New script'),
    );
    if (!state.textContent) state.textContent = { idle: 'Python starts on first run', loading: 'Starting Python…', ready: 'Python ready', failed: 'Python failed to start (see Log)' }[scripts.host.state];
  };

  const close = () => {
    el.remove();
    scripts.window = null;
  };
  const header = h('div', { class: 'float-header' }, h('b', null, 'Script editor'), h('span', { class: 'float-spacer' }), h('button', { title: 'Close', onclick: close }, '✕'));
  const el = h(
    'div',
    { class: 'float-window script-window' },
    header,
    h(
      'div',
      { class: 'script-body' },
      list,
      h(
        'div',
        { class: 'script-main' },
        h('div', { class: 'script-bar' }, name, h('span', { class: 'float-spacer' }), state),
        code,
        h(
          'div',
          { class: 'script-bar' },
          h('button', { 'data-run': '', class: 'primary', title: 'Ctrl+Enter', onclick: () => run(false) }, '▶ Run'),
          h('button', { 'data-run': '', title: 'Keep in the library: it loads with the editor and its tools stay in the Scripts menu', onclick: () => run(true) }, 'Save to library'),
          h(
            'button',
            {
              'data-run': '',
              title: 'Remove from the library',
              onclick: () => {
                if (!current) return;
                scripts.remove(current);
                load(scripts.library[0] ?? null);
              },
            },
            'Remove',
          ),
          h('span', { class: 'float-spacer' }),
          h('a', { href: 'https://github.com/jaisurya-dev-art/rigby2d/blob/main/docs/scripting.md', target: '_blank', rel: 'noopener' }, 'API reference'),
        ),
      ),
    ),
  );
  makeDraggable(el, header);
  document.body.append(el);
  load(scripts.library.find((s) => s.name === current) ?? null);
  code.focus();
  return {
    el,
    refresh: () => {
      state.textContent = '';
      draw();
    },
  };
}
