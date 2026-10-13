// SPDX-License-Identifier: MIT
// Right panel: properties of the current selection.

import { identityTransform, transformEquals } from '../core/math.js';
import { BLEND_MODES, INHERIT_MODES, findAttachment, makeAttachment, uniqueName, vertexCount } from '../core/model.js';
import { Mode, selBone, selSlot } from './app.js';
import * as edit from './edit.js';
import { dragValue, h, select, textField } from './widgets.js';

export function render(app, el) {
  const b = selBone(app.sel);
  const s = selSlot(app.sel);
  const content = b !== null ? boneUi(app, b) : s !== null ? slotUi(app, s) : projectUi(app);
  el.replaceChildren(...content.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
}

const row = (label, ...content) => [h('label', null, label), h('div', { class: 'cell' }, ...content)];

function keyMarker(app, bone, channel) {
  if (app.mode !== Mode.Animate) return null;
  const keyed = edit.isKeyed(app, bone, channel);
  return h(
    'span',
    { class: keyed ? 'key on' : 'key', title: keyed ? 'Keyed at this frame' : 'Not keyed at this frame' },
    keyed ? '◆' : '◇',
  );
}

function boneUi(app, b) {
  const setupMode = app.mode === Mode.Setup;
  const bone = app.doc.bones[b];
  const props = [
    ...row(
      'Name',
      textField(bone.name, (name) => {
        if (name && app.doc.boneIndex(name) === null) {
          bone.name = name;
          app.changed();
        }
      }, { disabled: !setupMode }),
    ),
  ];
  if (b === 0) {
    props.push(...row('Parent', '—'));
  } else {
    const options = app.doc.bones.map((x, i) => [i, x.name]).filter(([i]) => !app.doc.isDescendant(i, b));
    props.push(
      ...row(
        'Parent',
        select(options, bone.parent ?? 0, (i) => {
          if (i !== bone.parent) edit.reparentBoneKeepWorld(app, b, i);
        }, { disabled: !setupMode }),
      ),
    );
  }
  props.push(
    ...row(
      'Length',
      dragValue(bone.length, (v) => {
        bone.length = v;
        app.changed();
      }, { speed: 0.5, min: 0, disabled: !setupMode }),
    ),
    ...row(
      'Inherit',
      select(INHERIT_MODES.map((m) => [m, m]), bone.inherit ?? 'normal', (m) => {
        bone.inherit = m;
        app.changed();
      }, { disabled: !setupMode }),
    ),
  );

  const local = app.pose().local[b];
  const field = (key, opts) =>
    dragValue(local[key], (v) => {
      const t = { ...app.pose().local[b], [key]: v };
      if (!transformEquals(t, app.pose().local[b])) edit.setBoneLocal(app, b, t);
    }, opts);
  const pos = { speed: 0.5, decimals: 2 };
  const scl = { speed: 0.01, decimals: 3 };

  return [
    h('h2', null, 'Bone'),
    h('div', { class: 'grid' }, props),
    h('hr'),
    h('strong', null, setupMode ? 'Setup pose' : 'Pose at current frame (edits set keys)'),
    h(
      'div',
      { class: 'grid three' },
      h('label', null, 'Rotation'),
      h('div', { class: 'cell' }, field('rotation', { ...pos, suffix: '°' })),
      keyMarker(app, b, 'rotate') ?? h('span'),
      h('label', null, 'Position'),
      h('div', { class: 'cell' }, field('x', { ...pos, prefix: 'x ' }), field('y', { ...pos, prefix: 'y ' })),
      keyMarker(app, b, 'translate') ?? h('span'),
      h('label', null, 'Scale'),
      h('div', { class: 'cell' }, field('scale_x', { ...scl, prefix: 'x ' }), field('scale_y', { ...scl, prefix: 'y ' })),
      keyMarker(app, b, 'scale') ?? h('span'),
      h('label', null, 'Shear'),
      h('div', { class: 'cell' }, field('shear_x', { ...pos, prefix: 'x ', suffix: '°' }), field('shear_y', { ...pos, prefix: 'y ', suffix: '°' })),
      keyMarker(app, b, 'shear') ?? h('span'),
    ),
    h(
      'div',
      { class: 'buttons' },
      !setupMode ? h('button', { onclick: () => edit.keySelection(app) }, '◆ Key all (K)') : null,
      setupMode ? h('button', { onclick: () => edit.addChildBone(app, b) }, '＋ Child bone') : null,
      setupMode && b !== 0 ? h('button', { onclick: () => edit.deleteSelection(app) }, '🗑 Delete') : null,
    ),
  ];
}

const toHex = (c) => `#${c.slice(0, 3).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
const fromHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

function slotUi(app, s) {
  const setupMode = app.mode === Mode.Setup;
  const slot = app.doc.slots[s];
  const color = h('input', {
    type: 'color',
    value: toHex(slot.color),
    disabled: !setupMode,
    oninput: (e) => {
      slot.color.splice(0, 3, ...fromHex(e.target.value));
      app.changed();
    },
    onchange: (e) => e.target.blur(),
  });
  const alpha = dragValue(slot.color[3], (v) => {
    slot.color[3] = v;
    app.changed();
  }, { speed: 0.005, min: 0, max: 1, decimals: 2, prefix: 'a ', disabled: !setupMode });

  const out = [
    h('h2', null, 'Slot'),
    h(
      'div',
      { class: 'grid' },
      row(
        'Name',
        textField(slot.name, (name) => {
          if (name && app.doc.slotIndex(name) === null) {
            slot.name = name;
            app.changed();
          }
        }, { disabled: !setupMode }),
      ),
      row(
        'Bone',
        select(app.doc.bones.map((x, i) => [i, x.name]), slot.bone, (i) => {
          if (i !== slot.bone) edit.setSlotBoneKeepWorld(app, s, i);
        }, { disabled: !setupMode }),
      ),
      row('Tint', color, alpha),
      row(
        'Blend',
        select(BLEND_MODES.map((m) => [m, m]), slot.blend ?? 'normal', (m) => {
          slot.blend = m;
          app.changed();
        }, { disabled: !setupMode }),
      ),
    ),
    h('hr'),
    h('strong', null, 'Attachments'),
    h('div', { class: 'small weak' }, 'Pick which image is visible. In animate mode this sets a key.'),
  ];

  const visible = app.pose().attachment[s];
  const radio = (value, label) =>
    h(
      'label',
      { class: 'radio' },
      h('input', {
        type: 'radio',
        name: `att-${s}`,
        checked: visible === value,
        onchange: () => edit.setSlotAttachment(app, s, value),
      }),
      ` ${label}`,
    );
  const skinAtts = app.doc.skin ? app.doc.skinAttachments(s, app.doc.skin) : [];
  const names = [...new Set([...skinAtts, ...slot.attachments].map((a) => a.name))];
  out.push(radio(null, '(none)'), ...names.map((n) => radio(n, skinAtts.some((a) => a.name === n) ? `${n}  [${app.doc.skin}]` : n)));
  if (setupMode && app.doc.images.length) {
    out.push(
      select(app.doc.images.map((i) => [i.name, i.name]), undefined, (name) => {
        const img = app.doc.images.find((i) => i.name === name);
        const attName = uniqueName(name, (n) => !!findAttachment(slot, n));
        slot.attachments.push(makeAttachment(attName, name, identityTransform(), img.width, img.height));
        app.changed();
      }, { placeholder: '＋ Add image to this slot…' }),
    );
  }

  const att = visible === null ? undefined : app.doc.attachment(s, visible);
  if (att && !att.offset) {
    const source = app.doc.meshSource(s, att);
    out.push(
      h('hr'),
      h('strong', null, `${att.type}: ${visible}`),
      h(
        'div',
        { class: 'grid' },
        row('Image', att.image),
        source ? row('Vertices', `${vertexCount(source)}${source.weights ? ' (weighted)' : ''}`) : null,
        source?.triangles ? row('Triangles', String(source.triangles.length / 3)) : null,
        att.type === 'linkedmesh' ? row('Parent', `${att.parent}${att.skin ? ` (${att.skin})` : ''}`) : null,
      ),
      h('div', { class: 'small weak' }, 'Mesh editing is not available yet; meshes deform with their bones and deform keys.'),
    );
  }
  if (att && att.offset) {
    const num = (obj, key, opts) =>
      dragValue(obj[key], (v) => {
        obj[key] = v;
        app.changed();
      }, opts);
    const pos = { speed: 0.5, decimals: 2 };
    const scl = { speed: 0.01, decimals: 3 };
    out.push(
      h('hr'),
      h('strong', null, `Image placement: ${visible}`),
      h(
        'div',
        { class: 'grid' },
        row(
          'Image',
          select(app.doc.images.map((i) => [i.name, i.name]), att.image, (name) => {
            att.image = name;
            app.changed();
          }),
        ),
        row('Position', num(att.offset, 'x', { ...pos, prefix: 'x ' }), num(att.offset, 'y', { ...pos, prefix: 'y ' })),
        row('Rotation', num(att.offset, 'rotation', { ...pos, suffix: '°' })),
        row('Scale', num(att.offset, 'scale_x', { ...scl, prefix: 'x ' }), num(att.offset, 'scale_y', { ...scl, prefix: 'y ' })),
        row('Size', num(att, 'width', { ...pos, prefix: 'w ', min: 0 }), num(att, 'height', { ...pos, prefix: 'h ', min: 0 })),
      ),
      h(
        'div',
        { class: 'buttons' },
        h(
          'button',
          {
            onclick: () => {
              const img = app.doc.images.find((i) => i.name === att.image);
              if (img) {
                att.width = img.width;
                att.height = img.height;
                app.changed();
              }
            },
          },
          'Reset size',
        ),
        setupMode
          ? h(
              'button',
              {
                onclick: () => {
                  slot.attachments.splice(slot.attachments.indexOf(att), 1);
                  if (slot.attachment === att.name) slot.attachment = slot.attachments[0]?.name ?? null;
                  app.changed();
                },
              },
              '🗑 Remove image',
            )
          : null,
      ),
    );
  }
  if (setupMode) out.push(h('div', { class: 'buttons' }, h('button', { onclick: () => edit.deleteSelection(app) }, '🗑 Delete slot')));
  return out;
}

function projectUi(app) {
  return [
    h('h2', null, 'Project'),
    h(
      'div',
      { class: 'grid' },
      row(
        'Name',
        textField(app.doc.name, (v) => {
          app.doc.name = v;
          app.changed();
        }),
      ),
    ),
    app.doc.skins.length
      ? h(
          'div',
          { class: 'grid' },
          row(
            'Skin',
            select([['', 'default'], ...app.doc.skins.map((k) => [k.name, k.name])], app.doc.skin ?? '', (name) => {
              app.doc.skin = name || null;
              app.changed();
            }),
          ),
        )
      : null,
    app.doc.header
      ? h('div', { class: 'small weak' }, `Imported from skeleton JSON ${app.doc.header.version ?? ''}. Export again with File ▸ Export skeleton JSON.`)
      : null,
    h('hr'),
    h('strong', null, 'Rig'),
    h('div', null, `${app.doc.bones.length} bones · ${app.doc.slots.length} slots · ${app.doc.skins.length + 1} skins`),
    h('div', null, `${app.doc.ik.length} IK constraints · ${app.doc.events.length} events · ${app.doc.animations.length} animations`),
    ['transform', 'path', 'physics']
      .filter((k) => app.doc.extra[k]?.length)
      .map((k) => h('div', { class: 'small weak' }, `${app.doc.extra[k].length} ${k} constraint(s): kept, not evaluated yet`)),
    h('hr'),
    h('strong', null, `Images (${app.doc.images.length})`),
    app.doc.images.length ? null : h('p', null, 'Use File ▸ Import PSD or Import PNG images to add art.'),
    app.doc.images.map((img) => h('div', null, `${img.name}  (${img.width}×${img.height})`)),
    h('hr'),
    h('strong', null, 'Getting started'),
    h(
      'ol',
      null,
      h('li', null, "Import your character's art (PSD layers or PNG parts)."),
      h('li', null, 'Press B and drag in the canvas to draw bones (select a bone first to chain children).'),
      h('li', null, 'Select an image and set its Bone in the inspector.'),
      h('li', null, 'Press Tab for Animate mode, move the time cursor, pose bones; keys are set automatically.'),
      h('li', null, 'File ▸ Save writes skeleton JSON + images; File ▸ Export writes JSON + a packed atlas for game runtimes.'),
    ),
  ];
}
