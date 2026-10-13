// SPDX-License-Identifier: MIT
// Evaluated skeleton state: local and world transforms of every bone, plus slot state.

import { sample } from './animation.js';
import { Affine, cloneTransform, lerpTransform, toAffine } from './math.js';
import { findAttachment } from './model.js';

/**
 * A mutable pose for a skeleton. Create it with `new Pose(skeleton)`, apply animations, then
 * call `updateWorld` before reading world transforms or vertices.
 */
export class Pose {
  constructor(sk) {
    this.local = [];
    this.world = [];
    /** Visible attachment name per slot (or null). */
    this.attachment = [];
    this.color = [];
    this.setToSetup(sk);
  }

  /** Resets everything to the setup pose and recomputes world transforms. */
  setToSetup(sk) {
    this.local = sk.bones.map((b) => cloneTransform(b.setup));
    this.attachment = sk.slots.map((s) => s.attachment);
    this.color = sk.slots.map((s) => s.color.slice());
    this.world = sk.bones.map(() => new Affine());
    this.updateWorld(sk);
  }

  /** Applies `anim` at `time` on top of the current pose, blended by `alpha` (1 = fully). */
  apply(sk, anim, time, alpha) {
    for (const t of anim.bones) {
      const bone = sk.bones[t.bone];
      if (!bone) continue;
      const setup = bone.setup;
      const target = cloneTransform(this.local[t.bone]);
      const r = sample(t.rotate, time);
      if (r !== undefined) target.rotation = setup.rotation + r;
      const tr = sample(t.translate, time);
      if (tr !== undefined) {
        target.x = setup.x + tr[0];
        target.y = setup.y + tr[1];
      }
      const sc = sample(t.scale, time);
      if (sc !== undefined) {
        target.scale_x = setup.scale_x * sc[0];
        target.scale_y = setup.scale_y * sc[1];
      }
      this.local[t.bone] = lerpTransform(this.local[t.bone], target, alpha);
    }
    for (const t of anim.slots) {
      if (t.slot >= this.attachment.length) continue;
      if (alpha >= 0.5) {
        const a = sample(t.attachment, time);
        if (a !== undefined) this.attachment[t.slot] = a;
      }
      const c = sample(t.color, time);
      if (c !== undefined) {
        const cur = this.color[t.slot];
        this.color[t.slot] = cur.map((v, i) => v + (c[i] - v) * alpha);
      }
    }
  }

  /** Recomputes world transforms from local transforms. */
  updateWorld(sk) {
    this.world.length = sk.bones.length;
    sk.bones.forEach((b, i) => {
      const local = toAffine(this.local[i]);
      this.world[i] = b.parent === null ? local : this.world[b.parent].mul(local);
    });
  }

  /** World transform of an attachment. */
  attachmentWorld(sk, slot, att) {
    return this.world[sk.slots[slot].bone].mul(toAffine(att.offset));
  }

  /**
   * Visible quads in draw order: { slot, attachment, positions, uvs, color }, with positions and
   * UVs in TL, TR, BR, BL order.
   */
  quads(sk) {
    const out = [];
    sk.slots.forEach((slot, i) => {
      const name = this.attachment[i];
      if (name === null || name === undefined) return;
      const att = findAttachment(slot, name);
      if (!att) return;
      const m = this.attachmentWorld(sk, i, att);
      const hw = att.width * 0.5;
      const hh = att.height * 0.5;
      out.push({
        slot: i,
        attachment: att,
        positions: [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]].map((p) => m.apply(p)),
        uvs: [[0, 0], [1, 0], [1, 1], [0, 1]],
        color: this.color[i],
      });
    });
    return out;
  }
}
