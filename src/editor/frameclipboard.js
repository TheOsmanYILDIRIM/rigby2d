// SPDX-License-Identifier: MIT OR Apache-2.0
// Mobile frame-level skeletal clipboard. Data stays in memory; no PNG or atlas is created.

const fields = ['x','y','rotation','scale_x','scale_y','shear_x','shear_y'];
const clone = t => Object.fromEntries(fields.map(k => [k, t[k] ?? (k.startsWith('scale') ? 1 : 0)]));
const hasBoneKeys = anim => anim?.bones?.some(t => ['rotate','translate','scale','shear','translateX','translateY','scaleX','scaleY'].some(c => t[c]?.length)) ?? false;

export function seedInitialPose(app, {keyBoneTransform}) {
  if (app.mode !== 'animate') return false;
  const anim = app.currentAnimation();
  if (!anim || hasBoneKeys(anim)) return false;
  const at = app.time;
  try {
    app.time = 0;
    for (let i=0;i<app.doc.bones.length;i++) keyBoneTransform(app,i,clone(app.doc.bones[i].setup));
  } finally { app.time=at; }
  app.changed();
  app.setStatus('Initial rig pose saved at frame 0; Auto Key will save later bone edits.');
  return true;
}

export function createFrameClipboard({keyBoneTransform,setSlotAttachment,ensureAnimation}) {
  let stored = null;
  return {
    copy(app) {
      if (app.mode !== 'animate') { app.setStatus('Switch to Animate to copy a frame'); return false; }
      const p = app.pose();
      stored = {
        names:app.doc.bones.map(b=>b.name),
        transforms:p.local.map(clone),
        attachments:[...p.attachment],
        frame:Math.round(app.time*(app.doc.settings?.fps||30)),
      };
      app.setStatus(`Copied rig pose from frame ${stored.frame}`);
      return true;
    },
    paste(app) {
      if (!stored || app.mode !== 'animate') { app.setStatus('Copy a pose in Animate mode first'); return false; }
      if (app.playing) { app.playing=false; app.changed(); }
      if (stored.names.length !== app.doc.bones.length || stored.names.some((n,i)=>n!==app.doc.bones[i].name)) {
        app.setStatus('Skeleton changed; cannot paste a pose onto different bones'); return false;
      }
      ensureAnimation(app);
      app.pending.clear();
      stored.transforms.forEach((t,i)=>keyBoneTransform(app,i,clone(t)));
      stored.attachments.forEach((name,i)=> {
        if (i<app.doc.slots.length && app.pose().attachment[i] !== name) setSlotAttachment(app,i,name);
      });
      app.changed();
      const frame=Math.round(app.time*(app.doc.settings?.fps||30));
      app.setStatus(`Pasted rig pose from frame ${stored.frame} to frame ${frame}; keyframes written`);
      return true;
    },
    get canPaste(){return stored!==null;},
  };
}
