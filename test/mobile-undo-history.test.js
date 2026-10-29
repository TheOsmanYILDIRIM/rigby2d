// Test the *actual* App history methods, isolated from the browser/Tauri-only imports.
// The extraction is deliberately source-derived so regressions in App.undo/commitHistory are caught.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGestureHistoryCommits} from '../src/editor/historygestures.js';
const source=readFileSync(new URL('../src/editor/app.js',import.meta.url),'utf8');
const first=source.indexOf('  undo() {');
const last=source.indexOf('  /** Opens a .rigby work file',first);
assert.ok(first>=0&&last>first);
const code=source.slice(first,last);
const FakeSkeleton={fromObject:o=>({...o,toSnapshot(){return JSON.stringify({bones:this.bones,settings:this.settings})}})};
const AppHistory=runInNewContext(`(class AppHistory {
 constructor(){
  this.doc={bones:[{name:'root',setup:{x:0}}],settings:{fps:30},toSnapshot(){return JSON.stringify({bones:this.bones,settings:this.settings})}};
  this.baseline=this.doc.toSnapshot();
  this.docJson=this.baseline;this.committedVersion=0;this.version=0;
  this.history={undo:[],redo:[]};this.sel=null;this.anim=null;this.selectedKeys=new Set();this.onion={};
 }
 changed(){this.version++;}
 ${code}
})`,{Skeleton:FakeSkeleton,onion:{followBoneRenames(){}},selBone:()=>null,selSlot:()=>null,FPS:30});
function edit(app,n){app.doc.bones[0].setup.x=n;app.changed();}
test('one history undo call reverses exactly one stored rig snapshot',()=>{
 const app=new AppHistory();
 for(const n of [1,2,3]){edit(app,n);app.commitHistory(false);}
 assert.equal(app.history.undo.length,3);
 app.undo();
 assert.equal(app.doc.bones[0].setup.x,2);
 assert.equal(app.history.undo.length,2);
 assert.equal(app.history.redo.length,1);
 app.redo();
 assert.equal(app.doc.bones[0].setup.x,3);
});
test('without end-of-gesture commits, three separate edits collapse into one undo snapshot',()=>{
 const app=new AppHistory();
 for(const n of [1,2,3]) edit(app,n);
 assert.equal(app.history.undo.length,0);
 app.undo();
 assert.equal(app.doc.bones[0].setup.x,0,'all three edits were incorrectly reverted');
});
test('three independent completed gestures yield three history records without any RAF', async()=>{
 const app=new AppHistory();
 const listeners=new Map();
 const target={addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name){listeners.delete(name)},emit(name){listeners.get(name)?.({type:name})}};
 const dispose=installGestureHistoryCommits(app,target);
 for(const n of [1,2,3]) {
   edit(app,n);
   target.emit('pointerup');
   await Promise.resolve();
 }
 assert.equal(app.history.undo.length,3);
 assert.deepEqual(app.history.undo.map(x=>JSON.parse(x).bones[0].setup.x),[0,1,2]);
 app.undo();
 assert.equal(app.doc.bones[0].setup.x,2);
 assert.equal(app.history.undo.length,2);
 assert.equal(app.history.redo.length,1);
 app.redo();
 assert.equal(app.doc.bones[0].setup.x,3);
 dispose();
});
test('click edits are captured even when pointerup completed before click', async()=>{
 const app=new AppHistory();
 const listeners=new Map();
 const target={addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name){listeners.delete(name)},emit(name){listeners.get(name)?.({type:name})}};
 installGestureHistoryCommits(app,target);
 target.emit('pointerup');await Promise.resolve();
 edit(app,10);
 target.emit('click');await Promise.resolve();
 edit(app,20);
 target.emit('pointerup');target.emit('click');await Promise.resolve();
 assert.deepEqual(app.history.undo.map(x=>JSON.parse(x).bones[0].setup.x),[0,10]);
 app.undo();assert.equal(app.doc.bones[0].setup.x,10);
});
