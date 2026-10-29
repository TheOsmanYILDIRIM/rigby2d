// Test the *actual* App history methods, isolated from the browser/Tauri-only imports.
// The extraction is deliberately source-derived so regressions in App.undo/commitHistory are caught.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
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
test('three separate pointer gestures each form an undo step even when RAF is throttled',()=>{
 const app=new AppHistory();
 for(const n of [1,2,3]){edit(app,n);}
 // No requestAnimationFrame between gestures; the renderer has not committed history.
 // The app should still preserve the three independent completed gestures.
 assert.equal(app.history.undo.length,3,'separate completed edits must not be coalesced');
 app.undo();
 assert.equal(app.doc.bones[0].setup.x,2);
});
