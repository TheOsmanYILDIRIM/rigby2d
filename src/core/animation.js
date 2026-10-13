// SPDX-License-Identifier: MIT
// Animations: keyframed timelines for bones and slots.
//
// Bone timeline values are relative to the setup pose: rotation and translation are added,
// scale is multiplied. A key is { time, value, curve }.

import { LINEAR, ease } from './curve.js';
import { lerp } from './math.js';

/** Bone channels that can be keyed; each is also the timeline property holding its keys. */
export const CHANNELS = ['rotate', 'translate', 'scale'];

export function makeKey(time, value, curve = LINEAR) {
  return { time, value, curve };
}

function copyValue(v) {
  return Array.isArray(v) ? v.slice() : v;
}

function interpolate(a, b, t) {
  if (typeof a === 'number') return lerp(a, b, t);
  if (Array.isArray(a)) return a.map((v, i) => lerp(v, b[i], t));
  return a; // attachment names hold until the next key
}

/** Samples a sorted key list at `time`. Returns `undefined` for an empty list. */
export function sample(keys, time) {
  if (keys.length === 0) return undefined;
  if (time <= keys[0].time) return copyValue(keys[0].value);
  const next = partitionPoint(keys, (k) => k.time <= time);
  if (next >= keys.length) return copyValue(keys[keys.length - 1].value);
  const a = keys[next - 1];
  const b = keys[next];
  const span = b.time - a.time;
  const t = span > 0 ? (time - a.time) / span : 1;
  return interpolate(a.value, b.value, ease(a.curve, t));
}

function partitionPoint(keys, pred) {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pred(keys[mid])) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Inserts or replaces the key at `time` (within half a millisecond), keeping keys sorted.
 * Returns the index of the key.
 */
export function setKey(keys, time, value, curve = LINEAR) {
  const i = keys.findIndex((k) => Math.abs(k.time - time) < 5e-4);
  if (i >= 0) {
    keys[i].value = value;
    return i;
  }
  const at = partitionPoint(keys, (k) => k.time < time);
  keys.splice(at, 0, makeKey(time, value, curve));
  return at;
}

/** Re-sorts keys after a time change, returning the new index of the key formerly at `index`. */
export function resort(keys, index) {
  let i = index;
  const swap = (x, y) => ([keys[x], keys[y]] = [keys[y], keys[x]]);
  while (i > 0 && keys[i - 1].time > keys[i].time) {
    swap(i - 1, i);
    i--;
  }
  while (i + 1 < keys.length && keys[i + 1].time < keys[i].time) {
    swap(i + 1, i);
    i++;
  }
  return i;
}

export class Animation {
  constructor(name = '', duration = 0) {
    this.name = name;
    this.duration = duration;
    /** @type {{bone:number, rotate:any[], translate:any[], scale:any[]}[]} */
    this.bones = [];
    /** @type {{slot:number, attachment:any[], color:any[]}[]} */
    this.slots = [];
  }

  boneTimeline(bone) {
    return this.bones.find((t) => t.bone === bone);
  }

  boneTimelineMut(bone) {
    let tl = this.boneTimeline(bone);
    if (!tl) {
      tl = { bone, rotate: [], translate: [], scale: [] };
      this.bones.push(tl);
    }
    return tl;
  }

  slotTimeline(slot) {
    return this.slots.find((t) => t.slot === slot);
  }

  slotTimelineMut(slot) {
    let tl = this.slotTimeline(slot);
    if (!tl) {
      tl = { slot, attachment: [], color: [] };
      this.slots.push(tl);
    }
    return tl;
  }

  /** Drops empty timelines. */
  prune() {
    this.bones = this.bones.filter((t) => t.rotate.length || t.translate.length || t.scale.length);
    this.slots = this.slots.filter((t) => t.attachment.length || t.color.length);
  }

  /** Time of the last key, useful to suggest a duration. */
  lastKeyTime() {
    let max = 0;
    for (const t of this.bones) for (const ch of CHANNELS) for (const k of t[ch]) max = Math.max(max, k.time);
    for (const t of this.slots) for (const k of [...t.attachment, ...t.color]) max = Math.max(max, k.time);
    return max;
  }
}
