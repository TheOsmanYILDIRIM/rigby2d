// SPDX-License-Identifier: MIT OR Apache-2.0
// Touch-friendly frame navigation and two-pose interpolation on Rigby2D's real keyframe tracks.
export function mobileStepFrame(app, delta) {
  const fps = app.doc.settings?.fps || 30;
  if (!Number.isFinite(fps) || fps <= 0) return false;
  if (app.mode !== 'animate' || !app.currentAnimation()) {
    app.setStatus('Animasyon moduna geç ve bir animasyon oluştur.');
    return false;
  }
  app.playing = false;
  app.discardPending?.('frame changed');
  const current = Math.max(0, Math.round(app.time * fps));
  const target = Math.max(0, current + delta);
  const anim = app.currentAnimation();
  // The upstream stepFrame clamps to animation.duration, making Next appear broken
  // at the last frame. Extend the clip only when advancing beyond its length.
  if (target / fps > anim.duration) anim.duration = target / fps;
  app.setTime(target / fps);
  app.setStatus(`Kare ${target} / ${Math.round(anim.duration*fps)}`);
  return true;
}

const fields = ['x','y','rotation','scale_x','scale_y','shear_x','shear_y'];
const copyLocal = t => Object.fromEntries(fields.map(k=>[k,t[k]??(k.startsWith('scale')?1:0)]));
export function makeTwoPoseMotion({ keyBoneTransform }) {
  let start = null;
  return {
    begin(app) {
      if (app.mode!=='animate'||!app.currentAnimation()) {
        app.setStatus('Önce Animasyon moduna geç.');return false;
      }
      app.playing=false;
      const frame=Math.round(app.time*(app.doc.settings?.fps||30));
      start={frame,names:app.doc.bones.map(b=>b.name),locals:app.pose().local.map(copyLocal)};
      start.locals.forEach((t,i)=>keyBoneTransform(app,i,t));
      app.setStatus(`Başlangıç F${frame} kaydedildi. Sonraki kareye git, kemikleri hedef poza getir, Bitiş'e bas.`);
      app.changed();
      return true;
    },
    end(app) {
      if (!start||app.mode!=='animate'||!app.currentAnimation()) {
        app.setStatus('Önce Başlangıç düğmesine bas.');return false;
      }
      const fps=app.doc.settings?.fps||30,frame=Math.round(app.time*fps);
      if(frame<=start.frame){app.setStatus(`Bitiş karesi F${start.frame} sonrasında olmalı.`);return false;}
      if(start.names.length!==app.doc.bones.length||start.names.some((n,i)=>n!==app.doc.bones[i].name)){
        app.setStatus('Rig değişti; başlangıç pozunu yeniden seç.');start=null;return false;
      }
      app.playing=false;
      const target=app.pose().local.map(copyLocal);
      const at=app.time;
      app.time=start.frame/fps;
      try{start.locals.forEach((t,i)=>keyBoneTransform(app,i,t));}
      finally {app.time=at;}
      target.forEach((t,i)=>keyBoneTransform(app,i,t));
      const anim=app.currentAnimation();
      anim.duration=Math.max(anim.duration,frame/fps);
      app.changed();
      app.setStatus(`F${start.frame} → F${frame} arası hareket oluşturuldu. Rigby2D ara pozları otomatik hesaplar.`);
      start=null;
      return true;
    },
    get startFrame(){return start?.frame??null;}
  };
}
