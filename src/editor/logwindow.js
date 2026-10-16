// SPDX-License-Identifier: MIT OR Apache-2.0
// The log window (View ▸ Log): filter by level, search, expand tracebacks, copy, clear.

import { LEVELS, clear, entries, formatEntries, markRead, stamp, subscribe } from './log.js';
import { h } from './widgets.js';

let win = null;
// Expanded tracebacks stay open when the list is redrawn for new entries.
const view = { levels: new Set(['info', 'warn', 'error']), search: '', follow: true, opened: new Set() };

export const windowOpen = () => !!win;

/** Shows or hides the log window. */
export function toggleLogWindow() {
  if (win) closeLogWindow();
  else openLogWindow();
}

export function closeLogWindow() {
  if (!win) return;
  win.unsubscribe();
  markRead(false);
  win.el.remove();
  win = null;
}

export function openLogWindow() {
  if (win) return;
  markRead(true);
  const list = h('div', { class: 'log-list' });
  const count = h('span', { class: 'weak' });
  const levelToggle = (level) =>
    h(
      'label',
      { class: `log-filter log-${level}` },
      h('input', {
        type: 'checkbox',
        checked: view.levels.has(level),
        onchange: (e) => {
          if (e.target.checked) view.levels.add(level);
          else view.levels.delete(level);
          redraw();
        },
      }),
      ` ${level}`,
    );
  const visible = () => {
    const q = view.search.toLowerCase();
    return entries.filter((e) => view.levels.has(e.level) && (!q || `${e.source} ${e.message} ${e.trace ?? ''}`.toLowerCase().includes(q)));
  };
  const row = (e) =>
    e.trace
      ? h(
          'details',
          { class: `log-entry log-${e.level}`, open: view.opened.has(e.id), ontoggle: (ev) => (ev.target.open ? view.opened.add(e.id) : view.opened.delete(e.id)) },
          h('summary', null, ...line(e)),
          h('pre', { class: 'log-trace' }, e.trace),
        )
      : h('div', { class: `log-entry log-${e.level}` }, ...line(e));
  const line = (e) => [h('span', { class: 'log-time' }, stamp(e.time)), h('span', { class: 'log-source' }, e.source), h('span', { class: 'log-message' }, e.message)];
  const redraw = () => {
    const shown = visible();
    list.replaceChildren(...shown.map(row));
    count.textContent = `${shown.length} of ${entries.length}`;
    if (view.follow) list.scrollTop = list.scrollHeight;
  };
  list.addEventListener('scroll', () => (view.follow = list.scrollTop + list.clientHeight >= list.scrollHeight - 4));

  const header = h(
    'div',
    { class: 'float-header' },
    h('b', null, 'Log'),
    h('span', { class: 'float-spacer' }),
    h('button', { title: 'Close', onclick: () => closeLogWindow() }, '✕'),
  );
  const toolbar = h(
    'div',
    { class: 'log-toolbar' },
    ...LEVELS.map(levelToggle),
    h('input', {
      type: 'search',
      placeholder: 'Filter…',
      value: view.search,
      oninput: (e) => {
        view.search = e.target.value;
        redraw();
      },
    }),
    count,
    h('span', { class: 'float-spacer' }),
    h(
      'button',
      {
        title: 'Copy the shown entries, with tracebacks',
        onclick: async (e) => {
          const button = e.currentTarget;
          try {
            await navigator.clipboard.writeText(formatEntries(visible()));
            button.textContent = 'Copied';
          } catch {
            button.textContent = 'Copy failed';
          }
          setTimeout(() => (button.textContent = 'Copy'), 1200);
        },
      },
      'Copy',
    ),
    h('button', { onclick: () => clear() }, 'Clear'),
  );
  const el = h('div', { class: 'float-window log-window' }, header, toolbar, list);
  makeDraggable(el, header);
  document.body.append(el);
  win = {
    el,
    unsubscribe: subscribe(() => redraw()),
  };
  redraw();
}

/** Lets a floating window be moved by its header (it stays inside the editor window). */
export function makeDraggable(el, handle) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, select')) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    handle.setPointerCapture(e.pointerId);
    const move = (m) => {
      el.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, m.clientX - dx))}px`;
      el.style.top = `${Math.max(0, Math.min(window.innerHeight - 30, m.clientY - dy))}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}
