// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedInitialPose, createFrameClipboard } from '../src/editor/frameclipboard.js';

function fixture() {
  const keyed = new Map();
  const doc = {bones:[{name:'root',setup:{x:0,y:0,rotation:0}},{name:'arm',setup:{x:10,y:20,rotation:0}}],slots:[],animations:[{bones:[]}] ,settings:{fps:30}};
  const app = {
    doc, mode:'animate', autoKey:true, playing:false, time:0, pending:new Map(),
    status:'', changed(){}, setStatus(s){this.status=s;},
    currentAnimation(){return doc.animations[0];},
    pose() {const f=Math.round(this.time*30);
      return {local:doc.bones.map((b,i)=>({ ...b.setup,...(keyed.get(f)?.[i]||{}) })),attachment:[]};
    },
  };
  const keyBoneTransform=(app,i,t)=>{
    const f=Math.round(app.time*30), m=keyed.get(f)||{};
    m[i]={...t};keyed.set(f,m);
    if (!doc.animations[0].bones.some(x=>x.bone===i))
      doc.animations[0].bones.push({bone:i,rotate:[{time:f/30,value:t.rotation}]});
  };
  const ops={keyBoneTransform,ensureAnimation(){return 0},setSlotAttachment(){}};
  return {app,keyed,ops};
}
test('frame zero rest pose is seeded when no bone timeline exists',()=>{
  const {app,keyed,ops}=fixture();
  assert.equal(seedInitialPose(app,ops),true);
  assert.equal(keyed.get(0)[1].rotation,0);
  assert.equal(seedInitialPose(app,ops),false);
});
test('copy frame 5 and paste as real keyed bone transforms at frame 10',()=>{
  const {app,keyed,ops}=fixture();
  seedInitialPose(app,ops);
  app.time=5/30;
  ops.keyBoneTransform(app,1,{x:10,y:20,rotation:33});
  const clip=createFrameClipboard(ops);
  assert.equal(clip.copy(app),true);
  app.time=10/30;
  assert.equal(clip.paste(app),true);
  assert.equal(keyed.get(10)[1].rotation,33);
  assert.equal(keyed.get(0)[1].rotation,0);
});
test('clipboard refuses setup mode and incompatible rig',()=>{
  const {app,ops}=fixture(),clip=createFrameClipboard(ops);
  app.mode='setup';
  assert.equal(clip.copy(app),false);
  app.mode='animate';
  assert.equal(clip.copy(app),true);
  app.doc.bones[1].name='other';
  assert.equal(clip.paste(app),false);
});
