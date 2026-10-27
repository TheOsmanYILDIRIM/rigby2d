// SPDX-License-Identifier: MIT OR Apache-2.0
// Browser-free touch editor contract tests (no production editor changes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMobileEditor } from '../src/editor/mobile.js';

class FakeElement {
  constructor(tag='div') {
    this.tag=tag; this.children=[]; this.dataset={}; this.hidden=false;
    this.listeners=new Map(); this.attrs={}; this.classes=new Set();
    this.classList={
      toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),
      contains:name=>this.classes.has(name),
    };
  }
  append(...items){this.children.push(...items);}
  setAttribute(name,value){this.attrs[name]=value;}
  addEventListener(name,fn){
    if(!this.listeners.has(name))this.listeners.set(name,[]);
    this.listeners.get(name).push(fn);
  }
  removeEventListener(name,fn){this.listeners.set(name,(this.listeners.get(name)||[]).filter(x=>x!==fn));}
  dispatch(name,props={}){
    const event={pointerType:'touch',pointerId:1,clientX:40,clientY:40,
      preventDefault(){},stopImmediatePropagation(){},...props};
    for(const fn of this.listeners.get(name)||[])fn(event);
  }
  click(){this.dispatch('click',{pointerType:'mouse'});}
  getBoundingClientRect(){return{left:0,top:0,width:400,height:600};}
}
function setup(){
  const root=new FakeElement(),canvas=new FakeElement('canvas');
  globalThis.document={
    getElementById:id=>id==='app'?root:null,
    createElement:tag=>new FakeElement(tag),
  };
  globalThis.window={
    location:{search:''},
    matchMedia:()=>({matches:true,addEventListener(){},removeEventListener(){}}),
    addEventListener(){},setInterval(){return 1;},clearInterval(){},
  };
  const app={
    mode:'setup',tool:'rotate',playing:false,version:1,anim:0,
    view:{panX:0,panY:0,zoom:1},
    changed(){this.version++;},
    toggleMode(){this.mode=this.mode==='setup'?'animate':'setup';this.changed();},
    togglePlay(){this.playing=!this.playing;this.changed();},
    stepFrame(n){this.step=n;this.changed();},
    undo(){},redo(){},openDialog(){},save(){},importImages(){},importPsd(){},
    exportSkeletonJson(){},saveVersion(){return '4.3';},
    setStatus(msg){this.status=msg;},
  };
  const viewport={canvas,width:400,height:600,press:null,drag:null,panning:null,meshPress:false};
  const control=installMobileEditor(app,viewport,{onKey(){}});
  return{root,canvas,app,viewport,control};
}
test('mobile rig tools, panels, playback and setup mode',()=>{
  const{root,app,control}=setup();
  assert.equal(root.classList.contains('mobile-layout'),true);
  const [header,,tools,transport,nav]=root.children;
  assert.equal(nav.children.length,4);
  nav.children[1].click();
  assert.equal(control.getState().panel,'tree');
  nav.children[2].click();
  assert.equal(root.dataset.mobilePanel,'inspector');
  tools.children[1].click();
  assert.equal(app.tool,'create');
  header.children[3].click();
  assert.equal(app.mode,'animate');
  transport.children[1].click();
  assert.equal(app.playing,true);
  control.dispose();
});
test('single-finger pan and pinch zoom do not commit skeleton drags',()=>{
  const{canvas,app,viewport,root}=setup();
  root.children[2].children[6].click();
  canvas.dispatch('pointerdown',{pointerId:1,clientX:10,clientY:10});
  canvas.dispatch('pointermove',{pointerId:1,clientX:40,clientY:50});
  assert.equal(app.view.panX,30);
  assert.equal(app.view.panY,40);
  canvas.dispatch('pointerup',{pointerId:1});
  root.children[2].children[6].click();
  canvas.dispatch('pointerdown',{pointerId:10,clientX:80,clientY:120});
  canvas.dispatch('pointerdown',{pointerId:11,clientX:160,clientY:120});
  canvas.dispatch('pointermove',{pointerId:11,clientX:220,clientY:120});
  assert.ok(app.view.zoom>1.2);
  assert.equal(viewport.press,null);
  assert.equal(viewport.drag,null);
});

test('mobile Animate enables Auto Key and shows active frame for key saving',()=>{
 const {root,app,control}=setup();
 const [header,,tools,transport]=root.children;
 header.children[3].click();
 assert.equal(app.mode,'animate');
 assert.equal(app.autoKey,true);
 assert.equal(transport.children[4].textContent,'● Auto Key');
 assert.equal(transport.children[4].disabled,false);
 transport.children[4].click();
 assert.equal(app.autoKey,false);
 transport.children[4].click();
 assert.equal(app.autoKey,true);
 app.time=0.5; app.changed();
 transport.children[3].click();
 assert.equal(transport.children[3].textContent,'◆ Key F15');
 control.dispose();
});
