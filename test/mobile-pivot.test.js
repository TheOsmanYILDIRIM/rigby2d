import test from 'node:test';
import assert from 'node:assert/strict';
import { Skeleton, makeBone, makeSlot, makeAttachment } from '../src/core/model.js';
import { transform, toAffine } from '../src/core/math.js';
import { Pose } from '../src/core/pose.js';
import { shiftBonePivotKeepArtwork } from '../src/editor/pivotedit.js';
function fixture(type='region') {
 const doc=new Skeleton();
 const bone=doc.addBone(makeBone('hand',0,transform(20,30),35));
 const child=doc.addBone(makeBone('finger',bone,transform(7,5),12));
 const attachment=makeAttachment('hand','hand',transform(15,12),70,60);
 attachment.type=type;
 doc.slots.push(makeSlot('hand',bone,attachment));
 const app={doc,mode:'setup',changed(){this.changedCount=(this.changedCount||0)+1;},setStatus(s){this.status=s;}};
 return {app,bone,child,attachment};
}
function near(a,b){assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<0.001);}
test('moving a bone pivot preserves region PNG and child world position',()=>{
 const {app,bone,child,attachment}=fixture();
 const old=new Pose(app.doc);
 const img=old.world[bone].mul(toAffine(attachment.offset)).apply([0,0]);
 const kid=old.world[child].apply([0,0]);
 assert.equal(shiftBonePivotKeepArtwork(app,bone,12,-8),true);
 const updated=new Pose(app.doc);
 near(img,updated.world[bone].mul(toAffine(attachment.offset)).apply([0,0]));
 near(kid,updated.world[child].apply([0,0]));
 assert.equal(app.doc.bones[bone].setup.x,32);
});
test('mesh attachments are blocked instead of silently deforming artwork',()=>{
 const {app,bone}=fixture('mesh');
 assert.equal(shiftBonePivotKeepArtwork(app,bone,10,0),false);
 assert.equal(app.doc.bones[bone].setup.x,20);
 assert.ok(app.status.includes('mesh'));
});
test('setup only; no shifting root or animating pivot',()=>{
 const {app,bone}=fixture();
 app.mode='animate';assert.equal(shiftBonePivotKeepArtwork(app,bone,2,3),false);
 app.mode='setup';assert.equal(shiftBonePivotKeepArtwork(app,0,2,3),false);
});
