// SPDX-License-Identifier: MIT OR Apache-2.0
// Move a setup-pose pivot and rebind attachments/mesh vertices to keep PNGs stationary.
// Existing animation keys may need review after changing the setup skeleton.
import { Pose } from '../core/pose.js';
import { toAffine } from '../core/math.js';

export function shiftBonePivotKeepArtwork(app, bone, dx, dy) {
 const sk=app.doc;
 if(app.mode!=='setup'||!sk.bones[bone]||!Number.isFinite(dx)||!Number.isFinite(dy))return false;
 if(bone===0){app.setStatus('Root pivot cannot be edited');return false;}
 if(dx===0&&dy===0)return true;
 const oldPose=new Pose(sk);
 const oldWorld=oldPose.world[bone];
 const oldSetup=sk.bones[bone].setup;
 sk.bones[bone].setup={...oldSetup,x:oldSetup.x+dx,y:oldSetup.y+dy};
 const afterPose=new Pose(sk);
 const compensation=afterPose.world[bone].inverse().mul(oldWorld);
 // Art is defined relative to bone coordinates. Update inverse-bind data as
 // the bone moves, rather than moving the art or raster itself.
 const visited=new Set();
 const attachmentEntries=[];
 for(let i=0;i<sk.slots.length;i++){
   for(const a of sk.slots[i].attachments)attachmentEntries.push({att:a,slot:i});
   for(const skin of sk.skins)
     for(const e of skin.slots.filter(e=>e.slot===i))
       for(const a of e.attachments)attachmentEntries.push({att:a,slot:i});
 }
 for(const {att,slot} of attachmentEntries) {
   const source=sk.meshSource(slot,att)??att;
   if(att.type==='region'&&sk.slots[slot].bone===bone) {
     att.offset=compensation.mul(toAffine(att.offset)).decompose();
   }
   if(source.type!=='mesh'||visited.has(source))continue;
   visited.add(source);
   if(source.weights) {
     for(const vertex of source.weights) for(const weight of vertex) {
       if(weight.bone===bone){
         const [x,y]=compensation.apply([weight.x,weight.y]);
         weight.x=x;weight.y=y;
       }
     }
   } else if(sk.slots[slot].bone===bone&&source.vertices) {
     for(let j=0;j+1<source.vertices.length;j+=2) {
       const [x,y]=compensation.apply([source.vertices[j],source.vertices[j+1]]);
       source.vertices[j]=x;source.vertices[j+1]=y;
     }
   }
 }
 // Preserve direct child bone joints in the same world locations.
 for(const child of sk.children(bone))
   sk.bones[child].setup=compensation.mul(toAffine(sk.bones[child].setup)).decompose();
 app.setStatus('Pivot repositioned without shifting setup artwork. Review existing animated poses after rig edits.');
 app.changed();
 return true;
}
