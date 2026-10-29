// SPDX-License-Identifier: MIT OR Apache-2.0
// Dependency-free mobile adapter contracts. Browser/layout tests are separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMobileEditor } from '../src/editor/mobile.js';

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
    this.dataset = {}; this.attrs = {}; this.hidden = false; this.value = '';
    this._text = ''; this.listeners = new Map(); this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(n => this.classes.add(n)),
      remove: (...names) => names.forEach(n => this.classes.delete(n)),
      contains: n => this.classes.has(n),
      toggle: (n, on = !this.classes.has(n)) => { on ? this.classes.add(n) : this.classes.delete(n); return on; },
    };
    this.props = new Map();
    this.style = { setProperty: (k,v) => this.props.set(k,v), removeProperty: k => this.props.delete(k) };
  }
  set className(value) { this.classes = new Set(value.split(/\s+/)); }
  get className() { return [...this.classes].join(' '); }
  set textContent(value) { this._text = String(value); this.children.forEach(c => c.parentNode = null); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  append(...nodes) { for (const n of nodes) { n.remove(); n.parentNode = this; this.children.push(n); } }
  insertBefore(node, before) { node.remove(); node.parentNode = this; this.children.splice(before === null ? this.children.length : this.children.indexOf(before),0,node); }
  replaceChildren(...nodes) { this.children.forEach(n => n.parentNode = null); this.children = []; this._text = ''; this.append(...nodes); }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; } }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  setAttribute(k,v) { this.attrs[k] = String(v); }
  addEventListener(k,fn) { if (!this.listeners.has(k)) this.listeners.set(k,[]); this.listeners.get(k).push(fn); }
  removeEventListener(k,fn) { this.listeners.set(k,(this.listeners.get(k) || []).filter(n => n !== fn)); }
  dispatch(k, props = {}) {
    const e = { type:k, target:this, pointerType:'touch', pointerId:1, isPrimary:true, clientX:40, clientY:40, buttons:1,
      prevented:false, stopped:false, preventDefault(){ this.prevented=true; }, stopImmediatePropagation(){ this.stopped=true; }, ...props };
    for (const fn of this.listeners.get(k) || []) { fn(e); if (e.stopped) break; } return e;
  }
  click() { if (!this.disabled) this.dispatch('click', {pointerType:'mouse'}); }
  dispatchEvent(e) { this.dispatch(e.type,e); return true; }
  blur() { if (document.activeElement === this) document.activeElement = document.body; }
  closest(selector) {
    for (let node=this;node;node=node.parentNode) {
      if (selector.split(',').some(s => {
        s=s.trim(); if(s.startsWith('#'))return node.id === s.slice(1);
        if(s.startsWith('.'))return node.classList.contains(s.slice(1));
        const [tag,cls]=s.split('.');return node.tagName === tag.toUpperCase() && (!cls || node.classList.contains(cls));
      })) return node;
    } return null;
  }
  getBoundingClientRect() { return {left:0,top:0,width:400,height:600}; }
}
function setup({mobile=true, search='', options={}}={}) {
  const body = new Element('body'), root = new Element(); root.id='app'; body.append(root);
  const make=(id,tag='div',parent=root)=>{const node=new Element(tag);node.id=id;parent.append(node);return node;};
  const menubar=make('menubar','nav'),center=make('center'),canvas=make('viewport','canvas',center),viewbar=make('viewbar','div',center);
  const side=make('side'),tree=make('tree','div',side),properties=make('properties','div',side);
  const timeline=make('timeline');make('controls','div',timeline);
  const sheet=make('dopesheet','div',timeline),graphEl=make('graph','div',timeline);
  const sheetCanvas=make('sheet-canvas','canvas',sheet),graphCanvas=make('graph-canvas','canvas',graphEl);
  for(const n of [sheet,graphEl]){n.scrollTop=0;n.scrollLeft=0;n.clientHeight=300;}
  const find=(id,node=body)=>node.id===id?node:node.children.map(n=>find(id,n)).find(Boolean);
  globalThis.document={body,activeElement:body,createElement:tag=>new Element(tag),createComment:()=>new Element('#comment'),getElementById:find};
  const timers=new Map(),intervals=new Map();let next=1;
  const query=new Element();query.matches=mobile;
  const win=new Element();Object.assign(win,{ location:{search},innerHeight:800,innerWidth:400,matchMedia:()=>query,
    setTimeout:fn=>{const id=next++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>{const id=next++;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),
  });globalThis.window=win;
  globalThis.MouseEvent=class {constructor(type,opts){Object.assign(this,{type},opts);}};
  const calls=[];
  const app={mode:'setup',workspace:'game',tool:'rotate',playing:false,version:1,timeVersion:0,time:0,autoKey:false,
    doc:{settings:{fps:30},slots:[]},view:{panX:0,panY:0,zoom:1},history:{undo:[1],redo:[1]},
    title:()=> 'Character.rigby',changed(){this.version++;},setStatus(s){this.status=s;},
    toggleMode(){this.mode=this.mode==='setup'?'animate':'setup';this.changed();},
    togglePlay(){this.playing=!this.playing;this.changed();},stepFrame(n){calls.push(['step',n]);this.changed();},
    undo(){calls.push(['undo']);},redo(){calls.push(['redo']);},openDialog(){calls.push(['open']);},save(v){calls.push(['save',v]);},
    importImages(){calls.push(['png']);},importPsd(){calls.push(['psd']);},pose(){return{};},select(v){this.sel=v;},
  };
  const viewport={canvas,width:400,height:600,press:null,drag:null,panning:null,meshPress:false,eventPos:e=>e,hitTest:()=>({bone:0})};
  const clipboard={canPaste:false,copy(){calls.push(['copy']);this.canPaste=true;},paste(){calls.push(['paste']);}};
  const motion={startFrame:null,begin(){this.startFrame=0;},end(){calls.push(['end']);}};
  const editor=(canvas,scroller)=>({canvas,scroller,press:null,layout:{trackLeft:170,trackW:200},onPointerDown(e){calls.push(['context',e.button]);},fit(){calls.push(['fit-graph']);},onWheel(e){calls.push(['wheel',e.ctrlKey,e.altKey,e.shiftKey,e.deltaY]);}});
  const timelineEditors={dopesheet:editor(sheetCanvas,sheet),graph:editor(graphCanvas,graphEl)};
  const defaults={timelineEditors,onKey:()=>calls.push(['key']),seedInitialPose:()=>calls.push(['seed']),frameClipboard:clipboard,twoPose:motion,
    showPopup:(x,y,items)=>calls.push(['popup',items]),getMenus:()=>({File:[{label:'Save',action:()=>calls.push(['menu-save'])},{label:'Unavailable',disabled:true,action:()=>calls.push(['bad'])}]}),
    actions:[['key.next','Next key'],['edit.delete','Delete selection']],onAction:id=>calls.push(['action',id])};
  const control=installMobileEditor(app,viewport,{...defaults,...options});
  const tick=()=>[...intervals.values()].forEach(fn=>fn());
  return {body,root,canvas,center,menubar,viewbar,tree,properties,app,viewport,control,query,win,timers,intervals,calls,clipboard,motion,find,tick,timelineEditors};
}

test('desktop initializes without temporal-dead-zone errors and preserves native controls',()=>{
  const x=setup({mobile:false});assert.equal(x.root.classList.contains('mobile-layout'),false);
  assert.equal(x.menubar.parentNode,x.root);assert.equal(x.viewbar.parentNode,x.center);x.control.dispose();
});
test('mobile moves the original menu/tools and restores exact order on resize/dispose',()=>{
  const x=setup();assert.equal(x.menubar.parentNode.className,'av-native-menus');
  assert.equal(x.viewbar.parentNode.className,'av-native-tools');
  x.query.matches=false;x.query.dispatch('change');assert.equal(x.root.children[0],x.menubar);
  assert.equal(x.center.children[1],x.viewbar);
  x.query.matches=true;x.query.dispatch('change');x.control.dispose();assert.equal(x.root.children[0],x.menubar);
  assert.equal(x.center.children[1],x.viewbar);assert.equal(x.find('avenox-mobile-bottom'),undefined);
});
test('five panels, expandable preview and invalid navigation',()=>{
  const x=setup();assert.equal(x.find('avenox-mobile-bottom').children.length,5);
  for(const id of ['canvas','tree','inspector','timeline','workspace']){x.find(`av-tab-${id}`).click();assert.equal(x.control.getState().panel,id);}
  x.control.setPanel('bad');assert.equal(x.control.getState().panel,'workspace');
  x.find('av-workspace-close').click();assert.equal(x.control.getState().panel,'timeline');
  x.find('av-expand').click();assert.equal(x.root.dataset.mobileExpanded,'true');x.control.dispose();
});
test('every quick tool and fit is reachable without modifying the document schema',()=>{
  const x=setup();const doc=JSON.stringify(x.app.doc);
  for(const id of ['pose','create','rotate','translate','scale','shear','pivot']){x.find(`av-tool-${id}`).click();assert.equal(x.app.tool,id);}
  x.find('av-fit').click();assert.equal(x.app.frameRequest,true);assert.equal(JSON.stringify(x.app.doc),doc);x.control.dispose();
});
test('frame navigation never invokes history; top history controls remain distinct',()=>{
  const x=setup();x.find('av-prev').click();x.find('av-next').click();assert.deepEqual(x.calls,[['step',-1],['step',1]]);
  x.find('av-undo').click();x.find('av-redo').click();assert.deepEqual(x.calls.slice(-2),[['undo'],['redo']]);x.control.dispose();
});
test('entering Animate seeds once, preserves Auto Key toggle and displays the frame',()=>{
  const x=setup();x.find('av-mode').click();assert.equal(x.app.mode,'animate');assert.equal(x.app.autoKey,true);
  assert.equal(x.calls.filter(c=>c[0]==='seed').length,1);x.tick();assert.equal(x.calls.filter(c=>c[0]==='seed').length,1);
  x.find('av-autokey').click();assert.equal(x.app.autoKey,false);x.app.time=.5;x.app.timeVersion++;x.tick();
  assert.equal(x.find('av-key').title,'Seçili pozu F15 karesine kaydet');x.find('av-key').click();assert.ok(x.calls.some(c=>c[0]==='key'));x.control.dispose();
});
test('clipboard and two-pose availability reflect live state',()=>{
  const x=setup();assert.equal(x.find('av-copy').disabled,true);x.find('av-mode').click();
  assert.equal(x.find('av-paste').disabled,true);x.find('av-copy').click();
  assert.equal(x.find('av-paste').disabled,false);x.find('av-paste').click();
  assert.equal(x.find('av-end-pose').disabled,true);x.find('av-start-pose').click();assert.equal(x.find('av-end-pose').disabled,false);x.control.dispose();
});
test('search uses original command callbacks and respects disabled state',()=>{
  const x=setup();x.control.setPanel('workspace');const s=x.find('av-search');s.value='save';s.dispatch('input');
  const results=x.find('avenox-mobile-workspace').children.find(n=>n.className==='av-search-results');
  assert.equal(results.children.length,1);results.children[0].click();assert.ok(x.calls.some(c=>c[0]==='menu-save'));
  x.control.setPanel('workspace');s.value='unavailable';s.dispatch('input');assert.equal(results.children[0].disabled,true);
  results.children[0].click();assert.ok(!x.calls.some(c=>c[0]==='bad'));x.control.dispose();
});
test('keyboard-only actions call the shared dispatcher, without synthetic key presses',()=>{
  const x=setup();x.control.setPanel('workspace');x.find('av-action-key.next').click();
  assert.deepEqual(x.calls.at(-1),['action','key.next']);assert.equal(x.control.getState().panel,'canvas');x.control.dispose();
});
test('pan and pinch preserve the document; remaining pinch finger cannot start a stray edit',()=>{
  const x=setup();x.find('av-pan').click();x.canvas.dispatch('pointerdown',{clientX:10,clientY:10});
  x.canvas.dispatch('pointermove',{clientX:40,clientY:50});assert.equal(x.app.view.panX,30);assert.equal(x.app.view.panY,40);
  x.canvas.dispatch('pointerup');x.find('av-pan').click();
  x.canvas.dispatch('pointerdown',{pointerId:10,clientX:80,clientY:120});x.canvas.dispatch('pointerdown',{pointerId:11,isPrimary:false,clientX:160,clientY:120});
  x.canvas.dispatch('pointermove',{pointerId:11,clientX:220,clientY:120});assert.ok(x.app.view.zoom>1.2);
  x.canvas.dispatch('pointerup',{pointerId:11});const move=x.canvas.dispatch('pointermove',{pointerId:10,clientX:90});
  assert.equal(move.stopped,true);assert.equal(x.viewport.press,null);x.control.dispose();
});
test('one-finger edit is not intercepted; outside release terminates gestures',()=>{
  const x=setup();const e=x.canvas.dispatch('pointerdown');assert.equal(e.stopped,false);x.canvas.dispatch('pointerup');
  x.find('av-pan').click();x.canvas.dispatch('pointerdown');x.win.dispatch('pointerup');
  const before=x.app.view.panX;x.canvas.dispatch('pointermove',{clientX:90});assert.equal(x.app.view.panX,before);x.control.dispose();
});
test('touch modifiers apply only to editing targets',()=>{
  const x=setup();x.find('av-multi').click();x.find('av-fine').click();x.find('av-alt').click();
  const e=x.win.dispatch('pointerdown',{target:x.canvas});assert.equal(e.ctrlKey,true);assert.equal(e.shiftKey,true);assert.equal(e.altKey,true);
  const outside=x.win.dispatch('pointerdown',{target:x.find('av-search')});assert.equal(outside.ctrlKey,undefined);x.control.dispose();
});
test('long press cancels on a second pointer and all timers/listeners are disposed',()=>{
  const x=setup();x.tree.dispatch('pointerdown');assert.equal(x.timers.size,1);
  x.win.dispatch('pointerdown',{pointerId:2,isPrimary:false});assert.equal(x.timers.size,0);
  x.tree.dispatch('pointerdown');assert.equal(x.timers.size,1);x.control.dispose();assert.equal(x.timers.size,0);assert.equal(x.intervals.size,0);
  assert.equal([...x.win.listeners.values()].flat().length,0);assert.equal([...x.canvas.listeners.values()].flat().length,0);x.control.dispose();
});
test('explicit mobile URL works at desktop width and async errors are visible',async()=>{
  const x=setup({mobile:false,search:'?mobile=1'});assert.equal(x.control.getState().active,true);
  x.app.save=()=>Promise.reject(new Error('Save failed'));x.find('av-save').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(x.app.status,'Save failed');x.control.dispose();
});
test('visual viewport resize follows keyboard height without counteracting page zoom',()=>{
  const x=setup();x.win.visualViewport={height:420,offsetTop:12,scale:1};x.win.dispatch('resize');
  assert.equal(x.root.props.get('--av-height'),'420px');assert.equal(x.root.props.get('--av-top'),'12px');
  x.win.visualViewport.scale=2;x.win.dispatch('resize');assert.equal(x.root.props.get('--av-height'),'800px');x.control.dispose();
});


test('long-press graph and dopesheet call native right-pointer handlers and clear pending drags',()=>{
  const x=setup();
  for(const editor of Object.values(x.timelineEditors)){
    editor.press={started:true};editor.canvas.dispatch('pointerdown');
    const timers=[...x.timers.values()];x.timers.clear();timers.forEach(fn=>fn());
    assert.equal(editor.press,null);assert.deepEqual(x.calls.at(-1),['context',2]);
    editor.canvas.dispatch('pointerup');
  }
  x.control.dispose();
});
test('two-finger timeline scrolling never moves keys or leaves a stale press',()=>{
  const x=setup(),editor=x.timelineEditors.dopesheet,c=editor.canvas;
  c.dispatch('pointerdown',{clientX:80,clientY:100});editor.press={hit:true};
  c.dispatch('pointerdown',{pointerId:2,isPrimary:false,clientX:120,clientY:100});
  assert.equal(editor.press,null);
  c.dispatch('pointermove',{pointerId:2,isPrimary:false,clientX:120,clientY:40});
  assert.equal(editor.scroller.scrollTop,30);
  c.dispatch('pointerup',{pointerId:2});assert.equal(c.dispatch('pointermove',{clientY:20}).stopped,true);
  c.dispatch('pointerup');assert.equal(editor.press,null);x.control.dispose();
});
test('graph zoom, pan and fit buttons use the native graph API',()=>{
  const x=setup();x.app.timelineView='graph';x.app.changed();x.tick();
  x.find('av-graph-time-in').click();assert.deepEqual(x.calls.at(-1),['wheel',true,false,false,-1]);
  x.find('av-graph-left').click();assert.deepEqual(x.calls.at(-1),['wheel',false,true,false,-1]);
  x.find('av-graph-up').click();assert.deepEqual(x.calls.at(-1),['wheel',false,false,true,1]);
  x.find('av-graph-fit').click();assert.deepEqual(x.calls.at(-1),['fit-graph']);x.control.dispose();
});
test('canvas Pan does not disable tree context menus',()=>{
  const x=setup();x.find('av-pan').click();x.tree.dispatch('pointerdown');assert.equal(x.timers.size,1);x.control.dispose();
});
