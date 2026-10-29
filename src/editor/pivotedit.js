// SPDX-License-Identifier: MIT OR Apache-2.0
// Reposition the pivot of a *region* bone without moving its art or child bones.
import { Pose } from '../core/pose.js';
import { toAffine } from '../core/math.js';

const isRegion = a => a.type === 'region';
export function shiftBonePivotKeepArtwork(app, bone, dx, dy) {
  const sk = app.doc;
  if (app.mode !== 'setup' || !sk.bones[bone] || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  if (bone === 0) { app.setStatus('Root pivot cannot be edited'); return false; }
  const targets = sk.slots.map((slot,i)=>({slot,i})).filter(v=>v.slot.bone===bone);
  const attachments = targets.flatMap(({slot,i})=>[
    ...slot.attachments,
    ...sk.skins.flatMap(s=>s.slots.filter(e=>e.slot===i).flatMap(e=>e.attachments))
  ]);
  // Mesh inverse bind coordinates/weights require dedicated rebind; never silently deform PNGs.
  if (attachments.some(a=>!isRegion(a))) {
    app.setStatus('This bone uses a weighted/mesh attachment; pivot rebind is needed before artwork can stay fixed.');
    return false;
  }
  const before = new Pose(sk);
  const oldWorld = before.world[bone];
  sk.bones[bone].setup = { ...sk.bones[bone].setup,
    x:sk.bones[bone].setup.x+dx,y:sk.bones[bone].setup.y+dy };
  const after = new Pose(sk);
  const compensation = after.world[bone].inverse().mul(oldWorld);
  // Old world image = OldBone * OldOffset; NewOffset = NewBone^-1 * OldBone * OldOffset.
  for(const att of attachments) att.offset = compensation.mul(toAffine(att.offset)).decompose();
  for(const child of sk.children(bone)) {
    sk.bones[child].setup = compensation.mul(toAffine(sk.bones[child].setup)).decompose();
  }
  app.changed();
  return true;
}
