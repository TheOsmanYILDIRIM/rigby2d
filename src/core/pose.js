// SPDX-License-Identifier: MIT
// Evaluated skeleton state: local and world transforms of every bone, slot state, mesh
// deformation, draw order and IK constraints.

import { keyIndexAt, sample } from './animation.js';
import { Affine, cloneTransform, lerp, lerpTransform, toAffine, wrapDegrees } from './math.js';
import { vertexCount } from './model.js';

const DEG = Math.PI / 180;
const angleOf = (v) => Math.atan2(v[1], v[0]) / DEG;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);

/**
 * A mutable pose for a skeleton. Create it with `new Pose(skeleton)`, apply animations, then
 * call `updateWorld` before reading world transforms or vertices.
 *
 * `local` holds the animated local transforms; `applied` holds them after constraints (IK) and is
 * what `world` is computed from.
 */
export class Pose {
  constructor(sk) {
    this.setToSetup(sk);
  }

  /** Resets everything to the setup pose and recomputes world transforms. */
  setToSetup(sk) {
    this.local = sk.bones.map((b) => cloneTransform(b.setup));
    this.inherit = sk.bones.map((b) => b.inherit ?? 'normal');
    this.attachment = sk.slots.map((s) => s.attachment);
    this.color = sk.slots.map((s) => s.color.slice());
    this.dark = sk.slots.map((s) => (s.dark ? s.dark.slice() : null));
    this.drawOrder = sk.slots.map((_, i) => i);
    /** Deform deltas keyed by `${slot}/${attachment name}`. */
    this.deform = new Map();
    this.ik = sk.ik.map((c) => ({
      mix: c.mix,
      softness: c.softness,
      bendPositive: c.bendPositive,
      compress: c.compress,
      stretch: c.stretch,
    }));
    this.applied = [];
    this.world = [];
    this.updateWorld(sk);
  }

  /** Applies `anim` at `time` on top of the current pose, blended by `alpha` (1 = fully). */
  apply(sk, anim, time, alpha) {
    const hold = alpha >= 0.5;
    for (const t of anim.bones) {
      const bone = sk.bones[t.bone];
      if (!bone) continue;
      const setup = bone.setup;
      const target = cloneTransform(this.local[t.bone]);
      const v = (ch) => sample(t[ch], time);
      let s;
      if ((s = v('rotate')) !== undefined) target.rotation = setup.rotation + s;
      if ((s = v('translate')) !== undefined) [target.x, target.y] = [setup.x + s[0], setup.y + s[1]];
      if ((s = v('translateX')) !== undefined) target.x = setup.x + s;
      if ((s = v('translateY')) !== undefined) target.y = setup.y + s;
      if ((s = v('scale')) !== undefined) [target.scale_x, target.scale_y] = [setup.scale_x * s[0], setup.scale_y * s[1]];
      if ((s = v('scaleX')) !== undefined) target.scale_x = setup.scale_x * s;
      if ((s = v('scaleY')) !== undefined) target.scale_y = setup.scale_y * s;
      if ((s = v('shear')) !== undefined) [target.shear_x, target.shear_y] = [setup.shear_x + s[0], setup.shear_y + s[1]];
      if ((s = v('shearX')) !== undefined) target.shear_x = setup.shear_x + s;
      if ((s = v('shearY')) !== undefined) target.shear_y = setup.shear_y + s;
      if (hold && (s = v('inherit')) !== undefined) this.inherit[t.bone] = s;
      this.local[t.bone] = lerpTransform(this.local[t.bone], target, alpha);
    }
    for (const t of anim.slots) {
      const i = t.slot;
      if (i >= this.attachment.length) continue;
      let s;
      if (hold && (s = sample(t.attachment, time)) !== undefined) this.attachment[i] = s;
      const color = this.color[i].slice();
      let dark = this.dark[i] ? this.dark[i].slice() : null;
      if ((s = sample(t.color, time)) !== undefined) color.splice(0, 4, ...s);
      if ((s = sample(t.rgb, time)) !== undefined) color.splice(0, 3, ...s);
      if ((s = sample(t.alpha, time)) !== undefined) color[3] = s;
      if ((s = sample(t.rgba2, time)) !== undefined) {
        color.splice(0, 4, ...s.slice(0, 4));
        dark = s.slice(4, 7);
      }
      if ((s = sample(t.rgb2, time)) !== undefined) {
        color.splice(0, 3, ...s.slice(0, 3));
        dark = s.slice(3, 6);
      }
      this.color[i] = this.color[i].map((c, k) => lerp(c, color[k], alpha));
      if (dark) this.dark[i] = (this.dark[i] ?? dark).map((c, k) => lerp(c, dark[k], alpha));
    }
    for (const t of anim.deform) {
      const k = sample(t.keys, time);
      if (!k) continue;
      const slot = sk.slots[t.slot];
      const att = slot && sk.attachment(t.slot, t.attachment, t.skin ?? sk.skin);
      if (!att) continue;
      const source = sk.meshSource(t.slot, att) ?? att;
      const n = deformLength(source);
      const deltas = new Float64Array(n);
      for (let j = 0; j < k.vertices.length && k.offset + j < n; j++) deltas[k.offset + j] = k.vertices[j];
      const key = `${t.slot}/${t.attachment}`;
      const prev = this.deform.get(key);
      this.deform.set(key, prev && alpha < 1 ? prev.map((p, j) => lerp(p, deltas[j], alpha)) : deltas);
    }
    if (hold && anim.drawOrder.length) {
      const i = keyIndexAt(anim.drawOrder, time);
      if (i >= 0) this.drawOrder = applyDrawOrder(sk.slots.length, anim.drawOrder[i].value);
    }
    for (const t of anim.ik) {
      const state = this.ik[t.constraint];
      if (!state) continue;
      const i = keyIndexAt(t.keys, time);
      if (i < 0) continue;
      const a = t.keys[i];
      const b = t.keys[i + 1];
      const frac = b && b.time > a.time && a.curve !== 'stepped' ? (time - a.time) / (b.time - a.time) : 0;
      const num = (field, def) => {
        const va = a.value[field] ?? def;
        const vb = b ? (b.value[field] ?? def) : va;
        return lerp(va, vb, frac);
      };
      state.mix = lerp(state.mix, num('mix', 1), alpha);
      state.softness = lerp(state.softness, num('softness', 0), alpha);
      if (hold) {
        state.bendPositive = a.value.bendPositive ?? true;
        state.compress = a.value.compress ?? false;
        state.stretch = a.value.stretch ?? false;
      }
    }
  }

  /** Recomputes world transforms from local transforms, then applies constraints. */
  updateWorld(sk) {
    this.applied = this.local.map(cloneTransform);
    this.computeWorld(sk);
    const order = sk.ik.map((c, i) => i).sort((x, y) => sk.ik[x].order - sk.ik[y].order);
    for (const i of order) {
      const c = sk.ik[i];
      if (c.skinRequired && !this.skinActive(sk, (skin) => skin.ik.includes(i))) continue;
      this.solveIk(sk, c, this.ik[i]);
    }
  }

  skinActive(sk, has) {
    const skin = sk.skin ? sk.findSkin(sk.skin) : null;
    return !!skin && has(skin);
  }

  computeWorld(sk) {
    this.world.length = sk.bones.length;
    sk.bones.forEach((b, i) => {
      const local = toAffine(this.applied[i]);
      this.world[i] = b.parent === null ? local : inheritWorld(this.world[b.parent], local, this.inherit[i]);
    });
  }

  /** Rotates (and optionally stretches) the constrained bones so the chain reaches the target. */
  solveIk(sk, c, state) {
    const mix = state.mix;
    if (mix <= 0 || !c.bones.length) return;
    const target = this.world[c.target].apply([0, 0]);
    const parentSign = (b) => {
      const p = sk.bones[b].parent;
      return p !== null && this.world[p].determinant() < 0 ? -1 : 1;
    };
    const aim = (b, from, tip) => {
      const delta = wrapDegrees(angleOf(sub(target, from)) - angleOf(sub(tip, from)));
      this.applied[b].rotation += delta * mix * parentSign(b);
    };
    if (c.bones.length === 1) {
      const b = c.bones[0];
      const w = this.world[b];
      const origin = w.apply([0, 0]);
      aim(b, origin, w.apply([1, 0]));
      const boneLen = sk.bones[b].length * len([w.a, w.b]);
      const dist = len(sub(target, origin));
      if (boneLen > 1e-4 && ((state.compress && dist < boneLen) || (state.stretch && dist > boneLen))) {
        const s = (dist / boneLen - 1) * mix + 1;
        this.applied[b].scale_x *= s;
        if (c.uniform) this.applied[b].scale_y *= s;
      }
      this.computeWorld(sk);
      return;
    }
    const [p, ch] = c.bones;
    let P = this.world[p].apply([0, 0]);
    let C = this.world[ch].apply([0, 0]);
    const tip = this.world[ch].apply([sk.bones[ch].length, 0]);
    const a = len(sub(C, P));
    const bLen = len(sub(tip, C));
    if (a < 1e-4 || bLen < 1e-4) {
      aim(p, P, C.some((v, k) => v !== P[k]) ? C : this.world[p].apply([1, 0]));
      this.computeWorld(sk);
      return;
    }
    let d = len(sub(target, P));
    if (state.stretch && d > a + bLen) {
      const s = (d / (a + bLen) - 1) * mix + 1;
      this.applied[p].scale_x *= s;
      if (c.uniform) this.applied[p].scale_y *= s;
      this.computeWorld(sk);
      P = this.world[p].apply([0, 0]);
      C = this.world[ch].apply([0, 0]);
      return this.finishTwoBone(sk, p, ch, target, mix, state, parentSign);
    }
    const soft = state.softness;
    if (soft > 0 && d > a + bLen - soft) d = a + bLen - soft * Math.exp(-(d - (a + bLen - soft)) / soft);
    d = Math.min(Math.max(d, Math.abs(a - bLen) + 1e-6), a + bLen - 1e-6);
    const cosA = Math.min(1, Math.max(-1, (a * a + d * d - bLen * bLen) / (2 * a * d)));
    const A = Math.acos(cosA) / DEG;
    // A mirrored chain bends the other way on screen.
    const bend = (state.bendPositive ? 1 : -1) * (this.world[p].determinant() < 0 ? -1 : 1);
    const desired = angleOf(sub(target, P)) - bend * A;
    const delta = wrapDegrees(desired - angleOf(sub(C, P)));
    this.applied[p].rotation += delta * mix * parentSign(p);
    this.computeWorld(sk);
    this.finishTwoBone(sk, p, ch, target, mix, state, parentSign);
  }

  finishTwoBone(sk, p, ch, target, mix, state, parentSign) {
    const C = this.world[ch].apply([0, 0]);
    const tip = this.world[ch].apply([Math.max(sk.bones[ch].length, 1e-3), 0]);
    const delta = wrapDegrees(angleOf(sub(target, C)) - angleOf(sub(tip, C)));
    this.applied[ch].rotation += delta * mix * parentSign(ch);
    this.computeWorld(sk);
  }

  /** World transform of a region or point attachment. */
  attachmentWorld(sk, slot, att) {
    return this.world[sk.slots[slot].bone].mul(toAffine(att.offset));
  }

  /** The attachment currently shown in a slot, resolved through the active skin. */
  slotAttachment(sk, slot) {
    return sk.attachment(slot, this.attachment[slot]);
  }

  /** World positions of a mesh-like attachment's vertices as a flat [x, y, ...] array. */
  worldVertices(sk, slot, att) {
    const source = sk.meshSource(slot, att);
    if (!source) return [];
    const deformKey = att.type === 'linkedmesh' && att.deform ? `${slot}/${att.parent}` : `${slot}/${att.name}`;
    const deform = this.deform.get(deformKey);
    const out = [];
    if (source.weights) {
      let k = 0;
      for (const v of source.weights) {
        let x = 0;
        let y = 0;
        for (const w of v) {
          const bx = w.x + (deform ? deform[k] : 0);
          const by = w.y + (deform ? deform[k + 1] : 0);
          k += 2;
          const p = this.world[w.bone].apply([bx, by]);
          x += p[0] * w.weight;
          y += p[1] * w.weight;
        }
        out.push(x, y);
      }
    } else {
      const m = this.world[sk.slots[slot].bone];
      const verts = source.vertices ?? [];
      for (let i = 0; i + 1 < verts.length; i += 2) {
        const p = m.apply([verts[i] + (deform ? deform[i] : 0), verts[i + 1] + (deform ? deform[i + 1] : 0)]);
        out.push(p[0], p[1]);
      }
    }
    return out;
  }

  /**
   * Visible drawables in draw order. Regions: { kind: 'region', slot, attachment, positions,
   * uvs, color, blend } with positions/UVs in TL, TR, BR, BL order. Meshes: { kind: 'mesh', ...,
   * positions (world vertex pairs), uvs (normalized, per vertex), triangles }.
   */
  quads(sk) {
    const out = [];
    for (const i of this.drawOrder) {
      const slot = sk.slots[i];
      if (!slot) continue;
      const att = this.slotAttachment(sk, i);
      if (!att) continue;
      const tint = this.color[i];
      const color = att.color ? tint.map((c, k) => c * att.color[k]) : tint;
      const blend = slot.blend ?? 'normal';
      if (att.type === 'region' || att.type === undefined) {
        const m = this.attachmentWorld(sk, i, att);
        const hw = att.width * 0.5;
        const hh = att.height * 0.5;
        out.push({
          kind: 'region',
          slot: i,
          attachment: att,
          positions: [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]].map((p) => m.apply(p)),
          uvs: [[0, 0], [1, 0], [1, 1], [0, 1]],
          color,
          blend,
        });
      } else if (att.type === 'mesh' || att.type === 'linkedmesh') {
        const source = sk.meshSource(i, att);
        if (!source) continue;
        const flat = this.worldVertices(sk, i, att);
        const positions = [];
        for (let k = 0; k + 1 < flat.length; k += 2) positions.push([flat[k], flat[k + 1]]);
        const uvs = [];
        for (let k = 0; k + 1 < source.uvs.length; k += 2) uvs.push([source.uvs[k], source.uvs[k + 1]]);
        out.push({ kind: 'mesh', slot: i, attachment: att, positions, uvs, triangles: source.triangles, color, blend });
      }
    }
    return out;
  }
}

/** Number of floats a deform key covers for `att` (one x/y pair per vertex or per bone weight). */
function deformLength(att) {
  if (att.weights) return att.weights.reduce((n, v) => n + v.length * 2, 0);
  return (att.vertices?.length ?? vertexCount(att) * 2) | 0;
}

/** Child world transform for the given inherit mode. */
function inheritWorld(parent, local, mode) {
  if (mode === 'normal' || !mode) return parent.mul(local);
  const [tx, ty] = parent.apply([local.tx, local.ty]);
  const linear = new Affine(local.a, local.b, local.c, local.d, 0, 0);
  let m;
  const sx = Math.hypot(parent.a, parent.b);
  const det = parent.determinant();
  switch (mode) {
    case 'onlyTranslation':
      m = linear;
      break;
    case 'noRotationOrReflection': {
      const sy = sx > 1e-12 ? Math.abs(det) / sx : 0;
      m = new Affine(sx, 0, 0, sy, 0, 0).mul(linear);
      break;
    }
    case 'noScale':
    case 'noScaleOrReflection': {
      const ux = sx > 1e-12 ? [parent.a / sx, parent.b / sx] : [1, 0];
      const flip = mode === 'noScale' && det < 0 ? -1 : 1;
      m = new Affine(ux[0], ux[1], -ux[1] * flip, ux[0] * flip, 0, 0).mul(linear);
      break;
    }
    default:
      m = parent.mul(local);
      return m;
  }
  m.tx = tx;
  m.ty = ty;
  return m;
}

/** Slot order for a draw order key: `offsets` move slots relative to their setup index. */
export function applyDrawOrder(count, offsets) {
  const identity = Array.from({ length: count }, (_, i) => i);
  if (!offsets || !offsets.length) return identity;
  const order = new Array(count).fill(-1);
  const unchanged = [];
  let original = 0;
  for (const { slot, offset } of [...offsets].sort((x, y) => x.slot - y.slot)) {
    if (slot >= count) continue;
    while (original < slot) unchanged.push(original++);
    const at = original + offset;
    if (at >= 0 && at < count && order[at] === -1) order[at] = original;
    else unchanged.push(original);
    original++;
  }
  while (original < count) unchanged.push(original++);
  for (let i = count - 1; i >= 0; i--) if (order[i] === -1) order[i] = unchanged.pop();
  return order;
}
