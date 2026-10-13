// SPDX-License-Identifier: MIT
// The skeleton data model and its JSON file format.

import { Animation, makeKey } from './animation.js';
import { LINEAR, cloneCurve } from './curve.js';
import { identityTransform } from './math.js';

/** Current file format identifier written to every file. */
export const FORMAT = 'rigby/1';

export class LoadError extends Error {
  constructor(kind, message) {
    super(kind === 'json' ? `invalid JSON: ${message}` : `invalid skeleton: ${message}`);
    this.name = 'LoadError';
    this.kind = kind;
  }
}

/** @returns {{name:string, parent:number|null, length:number, setup:object}} */
export function makeBone(name, parent, setup, length) {
  return { name, parent, length, setup };
}

/** A draw-order entry attached to a bone, holding one or more swappable attachments. */
export function makeSlot(name, bone, attachment) {
  return { name, bone, attachments: [attachment], attachment: attachment.name, color: [1, 1, 1, 1] };
}

/** A textured quad positioned relative to its slot's bone. */
export function makeAttachment(name, image, offset, width, height) {
  return { name, image, offset, width, height };
}

export function findAttachment(slot, name) {
  return slot.attachments.find((a) => a.name === name);
}

/** A complete rig: bones, slots with their image attachments, and animations. */
export class Skeleton {
  constructor() {
    this.format = FORMAT;
    this.name = 'untitled';
    /** Bones ordered so that every parent comes before its children. Bone 0 is the root. */
    this.bones = [makeBone('root', null, identityTransform(), 0)];
    /** Slots in draw order (first is drawn at the back). */
    this.slots = [];
    /** @type {Animation[]} */
    this.animations = [];
    /** Source images used by attachments (editor projects): { name, path, width, height }. */
    this.images = [];
    /** Packed texture atlas (exported files): { image, width, height, regions }. */
    this.atlas = null;
  }

  static fromJson(json) {
    let obj;
    try {
      obj = JSON.parse(json);
    } catch (e) {
      throw new LoadError('json', e.message);
    }
    const sk = Skeleton.fromObject(obj);
    const err = sk.validate();
    if (err) throw new LoadError('invalid', err);
    return sk;
  }

  /** Builds a skeleton from parsed JSON, filling defaults. Throws LoadError on bad types. */
  static fromObject(o) {
    try {
      return readSkeleton(o);
    } catch (e) {
      if (e instanceof LoadError) throw e;
      throw new LoadError('json', e.message);
    }
  }

  toObject() {
    return writeSkeleton(this);
  }

  toJson() {
    return JSON.stringify(this.toObject(), null, 2);
  }

  clone() {
    return Skeleton.fromObject(this.toObject());
  }

  /** Checks structural invariants (parent ordering and index ranges). Returns an error or null. */
  validate() {
    if (this.bones.length === 0) return 'skeleton has no bones';
    for (let i = 0; i < this.bones.length; i++) {
      const p = this.bones[i].parent;
      if (p !== null && p >= i) return `bone '${this.bones[i].name}' must come after its parent`;
    }
    for (const s of this.slots) {
      if (s.bone >= this.bones.length) return `slot '${s.name}' references missing bone ${s.bone}`;
    }
    for (const a of this.animations) {
      for (const t of a.bones) {
        if (t.bone >= this.bones.length) return `animation '${a.name}' references missing bone ${t.bone}`;
      }
      for (const t of a.slots) {
        if (t.slot >= this.slots.length) return `animation '${a.name}' references missing slot ${t.slot}`;
      }
    }
    return null;
  }

  boneIndex(name) {
    const i = this.bones.findIndex((b) => b.name === name);
    return i < 0 ? null : i;
  }

  slotIndex(name) {
    const i = this.slots.findIndex((s) => s.name === name);
    return i < 0 ? null : i;
  }

  animation(name) {
    return this.animations.find((a) => a.name === name);
  }

  children(bone) {
    const out = [];
    this.bones.forEach((b, i) => {
      if (b.parent === bone) out.push(i);
    });
    return out;
  }

  /** Returns true if `bone` is `ancestor` or one of its descendants. */
  isDescendant(bone, ancestor) {
    let cur = bone;
    while (cur !== null && cur !== undefined) {
      if (cur === ancestor) return true;
      cur = this.bones[cur].parent;
    }
    return false;
  }

  /** Returns a name based on `base` that no bone uses yet. */
  uniqueBoneName(base) {
    return uniqueName(base, (n) => this.boneIndex(n) !== null);
  }

  uniqueSlotName(base) {
    return uniqueName(base, (n) => this.slotIndex(n) !== null);
  }

  /**
   * Adds a bone, inserting it right after its parent's subtree so ordering stays valid.
   * Returns the new bone's index.
   */
  addBone(bone) {
    let index;
    if (bone.parent === null) {
      index = this.bones.length;
    } else {
      const p = bone.parent;
      index = p + 1;
      while (index < this.bones.length && this.isDescendant(index, p)) index++;
    }
    this.bones.splice(index, 0, bone);
    const remap = (i) => (i >= index ? i + 1 : i);
    this.bones.forEach((b, i) => {
      if (i !== index && b.parent !== null) b.parent = remap(b.parent);
    });
    this.remapBoneRefs(remap);
    return index;
  }

  /** Removes a bone and its descendants, together with their slots and timelines. */
  removeBone(bone) {
    if (bone === 0) return;
    const removed = this.bones.map((_, i) => this.isDescendant(i, bone));
    const newIndex = [];
    let next = 0;
    for (const r of removed) newIndex.push(r ? null : next++);
    this.bones = this.bones.filter((_, i) => !removed[i]);
    for (const b of this.bones) b.parent = b.parent === null ? null : newIndex[b.parent];
    for (let s = this.slots.length - 1; s >= 0; s--) {
      if (removed[this.slots[s].bone]) this.removeSlot(s);
    }
    this.remapBoneRefs((i) => newIndex[i]);
  }

  /** Moves a bone (and its subtree) under a new parent, preserving bone ordering. */
  reparentBone(bone, newParent) {
    if (bone === 0 || this.isDescendant(newParent, bone)) return;
    const all = this.bones.map((_, i) => i);
    const subtree = all.filter((i) => this.isDescendant(i, bone));
    const order = all.filter((i) => !subtree.includes(i));
    let insertAt = order.indexOf(newParent) + 1;
    while (insertAt < order.length && this.isDescendant(order[insertAt], newParent)) insertAt++;
    const newOrder = [...order.slice(0, insertAt), ...subtree, ...order.slice(insertAt)];
    const newIndex = [];
    newOrder.forEach((old, n) => (newIndex[old] = n));
    this.bones[bone].parent = newParent;
    this.bones = newOrder.map((o) => this.bones[o]);
    for (const b of this.bones) if (b.parent !== null) b.parent = newIndex[b.parent];
    this.remapBoneRefs((i) => newIndex[i]);
  }

  removeSlot(slot) {
    this.slots.splice(slot, 1);
    for (const a of this.animations) {
      a.slots = a.slots.filter((t) => t.slot !== slot);
      for (const t of a.slots) if (t.slot > slot) t.slot--;
    }
  }

  /** Moves a slot in draw order from `from` to `to`. */
  moveSlot(from, to) {
    if (from === to || from >= this.slots.length || to >= this.slots.length) return;
    const [s] = this.slots.splice(from, 1);
    this.slots.splice(to, 0, s);
    const map = (i) => {
      if (i === from) return to;
      if (from < to && i > from && i <= to) return i - 1;
      if (to < from && i >= to && i < from) return i + 1;
      return i;
    };
    for (const a of this.animations) for (const t of a.slots) t.slot = map(t.slot);
  }

  /** `map` returns the new index of a bone, or null if it was removed. */
  remapBoneRefs(map) {
    for (const s of this.slots) s.bone = map(s.bone) ?? 0;
    for (const a of this.animations) {
      a.bones = a.bones.filter((t) => map(t.bone) !== null && map(t.bone) !== undefined);
      for (const t of a.bones) t.bone = map(t.bone);
    }
  }
}

export function uniqueName(base, taken) {
  if (!taken(base)) return base;
  for (let n = 2; ; n++) {
    const name = `${base}${n}`;
    if (!taken(name)) return name;
  }
}

// ---- JSON reading / writing ------------------------------------------------------------------

function num(v, def, what) {
  if (v === undefined || v === null) {
    if (def === undefined) throw new LoadError('json', `missing field \`${what}\``);
    return def;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new LoadError('json', `\`${what}\` must be a number`);
  return v;
}

function index(v, what, optional = false) {
  if ((v === undefined || v === null) && optional) return null;
  if (!Number.isInteger(v) || v < 0) throw new LoadError('json', `\`${what}\` must be a non-negative integer`);
  return v;
}

function str(v, def, what) {
  if (v === undefined || v === null) {
    if (def === undefined) throw new LoadError('json', `missing field \`${what}\``);
    return def;
  }
  if (typeof v !== 'string') throw new LoadError('json', `\`${what}\` must be a string`);
  return v;
}

function arr(v, what) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new LoadError('json', `\`${what}\` must be an array`);
  return v;
}

function vec(v, n, what) {
  if (!Array.isArray(v) || v.length !== n) throw new LoadError('json', `\`${what}\` must have ${n} numbers`);
  return v.map((x) => num(x, undefined, what));
}

function readTransform(o) {
  return {
    x: num(o.x, 0, 'x'),
    y: num(o.y, 0, 'y'),
    rotation: num(o.rotation, 0, 'rotation'),
    scale_x: num(o.scale_x, 1, 'scale_x'),
    scale_y: num(o.scale_y, 1, 'scale_y'),
  };
}

function writeTransform(t) {
  return { x: t.x, y: t.y, rotation: t.rotation, scale_x: t.scale_x, scale_y: t.scale_y };
}

function readKeys(list, what, readValue) {
  return arr(list, what).map((k) => makeKey(num(k.time, undefined, 'time'), readValue(k.value), cloneCurve(k.curve ?? LINEAR)));
}

function writeKeys(keys, writeValue) {
  return keys.map((k) => {
    const out = { time: k.time, value: writeValue(k.value) };
    if (k.curve !== LINEAR) out.curve = cloneCurve(k.curve);
    return out;
  });
}

const readAttachmentName = (v) => (v === null || v === undefined ? null : str(v, undefined, 'value'));

function readSkeleton(o) {
  if (o === null || typeof o !== 'object') throw new LoadError('json', 'expected an object');
  const sk = new Skeleton();
  sk.format = str(o.format, FORMAT, 'format');
  sk.name = str(o.name, '', 'name');
  if (!Array.isArray(o.bones)) throw new LoadError('json', 'missing field `bones`');
  sk.bones = o.bones.map((b) =>
    makeBone(str(b.name, undefined, 'name'), index(b.parent, 'parent', true), readTransform(b), num(b.length, 0, 'length')),
  );
  sk.slots = arr(o.slots, 'slots').map((s) => ({
    name: str(s.name, undefined, 'name'),
    bone: index(s.bone, 'bone'),
    attachments: arr(s.attachments, 'attachments').map((a) =>
      makeAttachment(
        str(a.name, undefined, 'name'),
        str(a.image, undefined, 'image'),
        readTransform(a),
        num(a.width, undefined, 'width'),
        num(a.height, undefined, 'height'),
      ),
    ),
    attachment: s.attachment === undefined || s.attachment === null ? null : str(s.attachment, undefined, 'attachment'),
    color: s.color === undefined ? [1, 1, 1, 1] : vec(s.color, 4, 'color'),
  }));
  sk.animations = arr(o.animations, 'animations').map((a) => {
    const anim = new Animation(str(a.name, undefined, 'name'), num(a.duration, undefined, 'duration'));
    anim.bones = arr(a.bones, 'bones').map((t) => ({
      bone: index(t.bone, 'bone'),
      rotate: readKeys(t.rotate, 'rotate', (v) => num(v, undefined, 'value')),
      translate: readKeys(t.translate, 'translate', (v) => vec(v, 2, 'value')),
      scale: readKeys(t.scale, 'scale', (v) => vec(v, 2, 'value')),
    }));
    anim.slots = arr(a.slots, 'slots').map((t) => ({
      slot: index(t.slot, 'slot'),
      attachment: readKeys(t.attachment, 'attachment', readAttachmentName),
      color: readKeys(t.color, 'color', (v) => vec(v, 4, 'value')),
    }));
    return anim;
  });
  sk.images = arr(o.images, 'images').map((i) => ({
    name: str(i.name, undefined, 'name'),
    path: i.path === undefined || i.path === null ? null : str(i.path, undefined, 'path'),
    width: index(i.width, 'width'),
    height: index(i.height, 'height'),
  }));
  if (o.atlas !== undefined && o.atlas !== null) {
    const a = o.atlas;
    sk.atlas = {
      image: str(a.image, undefined, 'image'),
      width: index(a.width, 'width'),
      height: index(a.height, 'height'),
      regions: arr(a.regions, 'regions').map((r) => ({
        name: str(r.name, undefined, 'name'),
        x: index(r.x, 'x'),
        y: index(r.y, 'y'),
        width: index(r.width, 'width'),
        height: index(r.height, 'height'),
      })),
    };
  }
  return sk;
}

function writeSkeleton(sk) {
  const out = {
    format: sk.format,
    name: sk.name,
    bones: sk.bones.map((b) => {
      const o = { name: b.name };
      if (b.parent !== null) o.parent = b.parent;
      o.length = b.length;
      return Object.assign(o, writeTransform(b.setup));
    }),
    slots: sk.slots.map((s) => {
      const o = {
        name: s.name,
        bone: s.bone,
        attachments: s.attachments.map((a) => ({
          name: a.name,
          image: a.image,
          ...writeTransform(a.offset),
          width: a.width,
          height: a.height,
        })),
      };
      if (s.attachment !== null) o.attachment = s.attachment;
      o.color = s.color.slice();
      return o;
    }),
    animations: sk.animations.map((a) => {
      const o = { name: a.name, duration: a.duration };
      if (a.bones.length) {
        o.bones = a.bones.map((t) => {
          const tl = { bone: t.bone };
          if (t.rotate.length) tl.rotate = writeKeys(t.rotate, (v) => v);
          if (t.translate.length) tl.translate = writeKeys(t.translate, (v) => v.slice());
          if (t.scale.length) tl.scale = writeKeys(t.scale, (v) => v.slice());
          return tl;
        });
      }
      if (a.slots.length) {
        o.slots = a.slots.map((t) => {
          const tl = { slot: t.slot };
          if (t.attachment.length) tl.attachment = writeKeys(t.attachment, (v) => v);
          if (t.color.length) tl.color = writeKeys(t.color, (v) => v.slice());
          return tl;
        });
      }
      return o;
    }),
  };
  if (sk.images.length) {
    out.images = sk.images.map((i) => {
      const o = { name: i.name };
      if (i.path !== null) o.path = i.path;
      o.width = i.width;
      o.height = i.height;
      return o;
    });
  }
  if (sk.atlas) {
    out.atlas = { ...sk.atlas, regions: sk.atlas.regions.map((r) => ({ ...r })) };
  }
  return out;
}
