import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileStepFrame,makeTwoPoseMotion} from '../src/editor/mobilemotion.js';
function fixture(){
 const anim={duration:1},keyed=new Map();
 const doc={settings:{fps:30},bones:[{name:'root',setup:{rotation:0}},{name:'arm',setup:{rotation:0}}]};
 const app={doc,time:1,playing:true,mode:'animate',currentAnimation:()=>anim,changed(){},setStatus(s){this.status=s;},discardPending(){},setTime(t){this.time=t;},pose(){return{local:[{rotation:0},{rotation:this.endRotation||0}]}}};
 const ops={keyBoneTransform:(a,i,t)=>{const f=Math.round(a.time*30),v=keyed.get(f)||{};v[i]={...t};keyed.set(f,v);}};
 return {app,anim,keyed,ops};
}
test('frame stepping extends animation beyond previous 1-second limit',()=>{
 const {app,anim}=fixture();mobileStepFrame(app,1);
 assert.equal(Math.round(app.time*30),31);assert.equal(Math.round(anim.duration*30),31);
 mobileStepFrame(app,-1);assert.equal(Math.round(app.time*30),30);
});
test('start and end poses create real keys on separate frames',()=>{
 const {app,keyed,ops}=fixture(),motion=makeTwoPoseMotion(ops);
 app.time=0;assert.equal(motion.begin(app),true);
 app.time=5/30;app.endRotation=45;assert.equal(motion.end(app),true);
 assert.equal(keyed.get(0)[1].rotation,0);
 assert.equal(keyed.get(5)[1].rotation,45);
});
