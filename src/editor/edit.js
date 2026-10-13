// SPDX-License-Identifier: MIT
// Document edits shared by the viewport, inspector and hierarchy. In animate mode, bone
// changes are written as keyframes instead of changing the setup pose.

import { Animation, setKey } from '../core/animation.js';
import { LINEAR, STEPPED } from '../core/curve.js';
import { toAffine, transform } from '../core/math.js';
import { makeBone } from '../core/model.js';
import { Pose } from '../core/pose.js';
import { FPS, Mode, selBone, selSlot, snap } from './app.js';

/** Makes sure an animation exists and is selected, creating one if needed. Returns its index. */
export function ensureAnimation(app) {
  if (app.anim !== null && app.anim < app.doc.animations.length) return app.anim;
  if (!app.doc.animations.length) app.doc.animations.push(new Animation('animation', 1));
  app.anim = 0;
  app.changed();
  return 0;
}

const ratio = (v, setup) => (Math.abs(setup) < 1e-6 ? v : v / setup);

function growDuration(anim, time) {
  if (time > anim.duration) anim.duration = time;
}

/** Sets a bone's local transform: the setup pose in setup mode, keys in animate mode. */
export function setBoneLocal(app, bone, t) {
  if (app.mode === Mode.Setup) {
    app.doc.bones[bone].setup = t;
  } else {
    const current = app.pose().local[bone];
    const setup = app.doc.bones[bone].setup;
    const time = snap(app.time);
    const anim = app.doc.animations[ensureAnimation(app)];
    const tl = anim.boneTimelineMut(bone);
    if (Math.abs(t.rotation - current.rotation) > 1e-6) setKey(tl.rotate, time, t.rotation - setup.rotation, LINEAR);
    if (Math.abs(t.x - current.x) > 1e-6 || Math.abs(t.y - current.y) > 1e-6) {
      setKey(tl.translate, time, [t.x - setup.x, t.y - setup.y], LINEAR);
    }
    if (Math.abs(t.scale_x - current.scale_x) > 1e-6 || Math.abs(t.scale_y - current.scale_y) > 1e-6) {
      setKey(tl.scale, time, [ratio(t.scale_x, setup.scale_x), ratio(t.scale_y, setup.scale_y)], LINEAR);
    }
    if (Math.abs(t.shear_x - current.shear_x) > 1e-6 || Math.abs(t.shear_y - current.shear_y) > 1e-6) {
      setKey(tl.shear, time, [t.shear_x - setup.shear_x, t.shear_y - setup.shear_y], LINEAR);
    }
    growDuration(anim, time);
  }
  app.changed();
}

/** Shows an attachment (or none) in a slot: setup value or a stepped key. */
export function setSlotAttachment(app, slot, name) {
  if (app.mode === Mode.Setup) {
    app.doc.slots[slot].attachment = name;
  } else {
    const time = snap(app.time);
    const anim = app.doc.animations[ensureAnimation(app)];
    setKey(anim.slotTimelineMut(slot).attachment, time, name, STEPPED);
    growDuration(anim, time);
  }
  app.changed();
}

/** Keys every channel of the selected bone (or the selected slot's attachment) at the current time. */
export function keySelection(app) {
  if (app.mode !== Mode.Animate) {
    app.setStatus('Switch to Animate mode (Tab) to set keys');
    return;
  }
  const pose = app.pose();
  const time = snap(app.time);
  const b = selBone(app.sel);
  const s = selSlot(app.sel);
  if (b !== null) {
    const cur = pose.local[b];
    const setup = app.doc.bones[b].setup;
    const anim = app.doc.animations[ensureAnimation(app)];
    const tl = anim.boneTimelineMut(b);
    setKey(tl.rotate, time, cur.rotation - setup.rotation, LINEAR);
    setKey(tl.translate, time, [cur.x - setup.x, cur.y - setup.y], LINEAR);
    setKey(tl.scale, time, [ratio(cur.scale_x, setup.scale_x), ratio(cur.scale_y, setup.scale_y)], LINEAR);
    const shear = [cur.shear_x - setup.shear_x, cur.shear_y - setup.shear_y];
    if (tl.shear.length || shear[0] || shear[1]) setKey(tl.shear, time, shear, LINEAR);
    growDuration(anim, time);
    app.setStatus(`Keyed ${app.doc.bones[b].name} at frame ${Math.round(time * FPS)}`);
  } else if (s !== null) {
    setSlotAttachment(app, s, pose.attachment[s]);
  } else {
    app.setStatus('Select a bone or slot to key');
  }
}

export function deleteSelection(app) {
  const b = selBone(app.sel);
  const s = selSlot(app.sel);
  if (b === 0) {
    app.setStatus('The root bone cannot be deleted');
  } else if (b !== null) {
    app.doc.removeBone(b);
    app.sel = null;
  } else if (s !== null) {
    app.doc.removeSlot(s);
    app.sel = null;
  }
  app.selectedKey = null;
  app.changed();
}

/** Adds a child bone under `parent` pointing along the parent's direction. */
export function addChildBone(app, parent) {
  const len = Math.max(app.doc.bones[parent].length, 40);
  const name = app.doc.uniqueBoneName('bone');
  const setup = transform(app.doc.bones[parent].length, 0, 0);
  const i = app.doc.addBone(makeBone(name, parent, setup, len * 0.8));
  app.sel = { bone: i };
  app.changed();
  return i;
}

/** Reparents a bone while keeping it where it is in the world (setup pose). */
export function reparentBoneKeepWorld(app, bone, newParent) {
  if (bone === 0 || app.doc.isDescendant(newParent, bone)) {
    app.setStatus('A bone cannot be parented to itself or its children');
    return;
  }
  const setup = new Pose(app.doc);
  app.doc.bones[bone].setup = setup.world[newParent].inverse().mul(setup.world[bone]).decompose();
  const name = app.doc.bones[bone].name;
  app.doc.reparentBone(bone, newParent);
  const i = app.doc.boneIndex(name);
  if (i !== null) app.sel = { bone: i };
  app.changed();
}

/** Moves a slot to another bone while keeping its attachments in place (setup pose). */
export function setSlotBoneKeepWorld(app, slot, newBone) {
  const setup = new Pose(app.doc);
  const old = setup.world[app.doc.slots[slot].bone];
  const toNew = setup.world[newBone].inverse().mul(old);
  for (const att of app.doc.slots[slot].attachments) att.offset = toNew.mul(toAffine(att.offset)).decompose();
  app.doc.slots[slot].bone = newBone;
  app.changed();
}

/** Returns whether `channel` of `bone` has a key at the current frame. */
export function isKeyed(app, bone, channel) {
  const tl = app.currentAnimation()?.boneTimeline(bone);
  if (!tl) return false;
  const t = snap(app.time);
  return tl[channel].some((k) => Math.abs(k.time - t) < 5e-4);
}
