// SPDX-License-Identifier: MIT
// Left panel: bone tree with slots, and draw order.

import { Mode, selBone, selSlot } from './app.js';
import * as edit from './edit.js';
import { h } from './widgets.js';

export function render(app, el) {
  const treeEl = el.querySelector('.tree');
  const orderEl = el.querySelector('.order');
  const addBtn = el.querySelector('.add-bone');
  addBtn.disabled = app.mode !== Mode.Setup;
  addBtn.onclick = () => edit.addChildBone(app, selBone(app.sel) ?? 0);

  const rows = [];
  const selected = new Set(app.selectedBones());
  const select = (sel) => (e) => app.select(sel, e.ctrlKey || e.metaKey);
  const tree = (bone, depth) => {
    rows.push(
      h(
        'div',
        { class: `row${selected.has(bone) ? ' selected' : ''}`, style: { paddingLeft: `${depth * 14 + 4}px` }, onclick: select({ bone }) },
        `🦴 ${app.doc.bones[bone].name}`,
      ),
    );
    app.doc.slots.forEach((slot, s) => {
      if (slot.bone !== bone) return;
      rows.push(
        h(
          'div',
          { class: `row slot${selSlot(app.sel) === s ? ' selected' : ''}`, style: { paddingLeft: `${depth * 14 + 22}px` }, onclick: select({ slot: s }) },
          `🖼 ${slot.name}`,
        ),
      );
    });
    for (const c of app.doc.children(bone)) tree(c, depth + 1);
  };
  tree(0, 0);
  treeEl.replaceChildren(...rows);

  const n = app.doc.slots.length;
  const move = (from, to) => () => {
    app.doc.moveSlot(from, to);
    app.sel = { slot: to };
    app.changed();
  };
  const order = [];
  for (let i = n - 1; i >= 0; i--) {
    order.push(
      h(
        'div',
        { class: 'order-row' },
        h('button', { class: 'small', disabled: i + 1 >= n, onclick: move(i, i + 1) }, '▲'),
        h('button', { class: 'small', disabled: i === 0, onclick: move(i, i - 1) }, '▼'),
        h('div', { class: `row${selSlot(app.sel) === i ? ' selected' : ''}`, onclick: select({ slot: i }) }, `🖼 ${app.doc.slots[i].name}`),
      ),
    );
  }
  orderEl.replaceChildren(...order);
}
