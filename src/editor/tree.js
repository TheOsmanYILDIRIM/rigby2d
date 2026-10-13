// SPDX-License-Identifier: MIT
// Tree panel: the skeleton (bones, slots and their attachments) plus draw order, skins,
// constraints, events, animations and images, in collapsible sections.

import { Mode, selBone, selSlot } from './app.js';
import * as edit from './edit.js';
import { h } from './widgets.js';

/** Collapsed sections and bones (kept for the session). */
const collapsed = new Set(['images', 'events']);

function section(app, id, title, count, children, actions = null) {
  const open = !collapsed.has(id);
  return h(
    'div',
    { class: 'tree-section' },
    h(
      'div',
      {
        class: 'tree-heading',
        onclick: () => {
          if (open) collapsed.add(id);
          else collapsed.delete(id);
          app.changed();
        },
      },
      h('span', { class: 'twisty' }, open ? '▾' : '▸'),
      h('span', null, title),
      count !== null ? h('span', { class: 'count' }, String(count)) : null,
      actions ? h('span', { class: 'actions', onclick: (e) => e.stopPropagation() }, actions) : null,
    ),
    open ? children : null,
  );
}

function row(label, { depth = 0, selected = false, cls = '', onclick, extra = null, title } = {}) {
  return h(
    'div',
    { class: `row${selected ? ' selected' : ''}${cls ? ` ${cls}` : ''}`, style: { paddingLeft: `${depth * 14 + 4}px` }, onclick, title },
    label,
    extra,
  );
}

export function render(app, el) {
  const doc = app.doc;
  const selected = new Set(app.selectedBones());
  const select = (item) => (e) => app.select(item, e.ctrlKey || e.metaKey);
  const pose = app.pose();

  // Skeleton: bones nested by parent, each bone's slots, each slot's attachments.
  const skeleton = [];
  const visit = (bone, depth) => {
    const kids = doc.children(bone);
    const slots = doc.slots.map((s, i) => [s, i]).filter(([s]) => s.bone === bone);
    const key = `bone:${bone}`;
    const hasChildren = kids.length || slots.length;
    const open = !collapsed.has(key);
    skeleton.push(
      row(`🦴 ${doc.bones[bone].name}`, {
        depth,
        selected: selected.has(bone),
        onclick: select({ bone }),
        extra: hasChildren
          ? h(
              'span',
              {
                class: 'twisty right',
                title: open ? 'Collapse' : 'Expand',
                onclick: (e) => {
                  e.stopPropagation();
                  if (open) collapsed.add(key);
                  else collapsed.delete(key);
                  app.changed();
                },
              },
              open ? '▾' : '▸',
            )
          : null,
      }),
    );
    if (!open) return;
    for (const [slot, i] of slots) {
      skeleton.push(row(`▣ ${slot.name}`, { depth: depth + 1, cls: 'slot', selected: selSlot(app.sel) === i, onclick: select({ slot: i }) }));
      const names = new Set(slot.attachments.map((a) => a.name));
      if (doc.skin) for (const a of doc.skinAttachments(i, doc.skin)) names.add(a.name);
      for (const name of names) {
        const visible = pose.attachment[i] === name;
        skeleton.push(
          row(`${visible ? '📎' : '·'} ${name}`, {
            depth: depth + 2,
            cls: `attachment${visible ? ' visible' : ''}`,
            title: visible ? 'Visible attachment' : 'Click to show this attachment (keys it in Animate mode)',
            onclick: () => {
              app.select({ slot: i });
              edit.setSlotAttachment(app, i, visible ? null : name);
            },
          }),
        );
      }
    }
    for (const c of kids) visit(c, depth + 1);
  };
  visit(0, 0);
  const addBone = h(
    'button',
    { class: 'small', disabled: app.mode !== Mode.Setup, title: 'Add a child bone to the selected bone', onclick: () => edit.addChildBone(app, selBone(app.sel) ?? 0) },
    '＋ Bone',
  );

  // Draw order: front of the list is drawn on top.
  const n = doc.slots.length;
  const move = (from, to) => () => {
    doc.moveSlot(from, to);
    app.select({ slot: to });
  };
  const order = [];
  for (let i = n - 1; i >= 0; i--) {
    order.push(
      h(
        'div',
        { class: 'order-row' },
        h('button', { class: 'small', disabled: i + 1 >= n, onclick: move(i, i + 1), title: 'Draw in front' }, '▲'),
        h('button', { class: 'small', disabled: i === 0, onclick: move(i, i - 1), title: 'Draw behind' }, '▼'),
        row(`▣ ${doc.slots[i].name}`, { selected: selSlot(app.sel) === i, onclick: select({ slot: i }) }),
      ),
    );
  }

  // Skins: the active one shows the dot.
  const skins = [
    row(`${doc.skin ? '○' : '●'} default`, { selected: !doc.skin, onclick: () => ((doc.skin = null), app.changed()) }),
    ...doc.skins.map((s) =>
      row(`${doc.skin === s.name ? '●' : '○'} ${s.name}`, { selected: doc.skin === s.name, onclick: () => ((doc.skin = s.name), app.changed()) }),
    ),
  ];

  // Constraints: IK (evaluated) and others kept from imported files.
  const constraints = [
    ...doc.ik.map((c) => row(`⊸ ${c.name}`, { title: `IK: ${c.bones.map((b) => doc.bones[b].name).join(' → ')} → ${doc.bones[c.target].name}` })),
    ...[...(doc.extra.constraints ?? []).map((e) => [e.data.type, e.data.name]), ...['transform', 'path', 'physics'].flatMap((t) => (doc.extra[t] ?? []).map((c) => [t, c.name]))].map(([type, name]) => {
      const evaluated = type === 'transform' || type === 'path' || type === 'physics';
      return row(`⊸ ${name}`, { cls: evaluated ? '' : 'weak', title: evaluated ? `${type} constraint` : `${type} constraint (kept, not evaluated yet)` });
    }),
  ];

  const animations = doc.animations.map((a, i) =>
    row(`${app.anim === i ? '▶' : '·'} ${a.name}`, {
      selected: app.anim === i,
      onclick: () => {
        app.anim = i;
        app.mode = Mode.Animate;
        app.time = 0;
        app.selectedKeys.clear();
        app.changed();
      },
    }),
  );

  el.replaceChildren(
    h('div', { class: 'tree-scroll scroll' },
      section(app, 'skeleton', doc.name || 'Skeleton', doc.bones.length, skeleton, addBone),
      section(app, 'draworder', 'Draw order', n, order),
      section(app, 'skins', 'Skins', doc.skins.length + 1, skins),
      section(app, 'constraints', 'Constraints', constraints.length, constraints),
      section(app, 'events', 'Events', doc.events.length, doc.events.map((e) => row(`⚑ ${e.name}`))),
      section(app, 'animations', 'Animations', doc.animations.length, animations),
      section(app, 'images', 'Images', doc.images.length, doc.images.map((i) => row(`🖼 ${i.name}`, { title: `${i.width}×${i.height}` }))),
    ),
  );
}
