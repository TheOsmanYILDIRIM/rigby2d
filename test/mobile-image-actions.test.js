import test from 'node:test';
import assert from 'node:assert/strict';
import { imageUsage, removeImportedImage } from '../src/editor/imageactions.js';

function make() {
 const slot={bone:0,attachment:'front',attachments:[{name:'front',image:'front.png'},{name:'back',image:'back.png'}]};
 const doc={images:[{name:'front.png'},{name:'back.png'}],slots:[slot],skins:[]};
 const app={mode:'setup',doc,images:{map:new Map([['front.png',1],['back.png',2]])},
   changed(){this.changedCalled=true;},deselect(){this.deselected=true;},setStatus(s){this.status=s;}};
 return app;
}
test('deletes only the selected imported PNG and attached image while preserving other layers',()=>{
 const app=make();
 assert.equal(imageUsage(app.doc,'front.png'),1);
 assert.equal(removeImportedImage(app,'front.png',{confirm:false}),true);
 assert.deepEqual(app.doc.images.map(x=>x.name),['back.png']);
 assert.deepEqual(app.doc.slots[0].attachments.map(x=>x.name),['back']);
 assert.equal(app.doc.slots[0].attachment,'back');
 assert.equal(app.images.map.has('front.png'),false);
 assert.equal(app.deselected,true);
});
test('deleting images in Animate mode is prohibited',()=>{
 const app=make();app.mode='animate';
 assert.equal(removeImportedImage(app,'front.png',{confirm:false}),false);
 assert.equal(app.doc.images.length,2);
});
test('unknown image cannot be removed',()=>{
 const app=make();
 assert.equal(removeImportedImage(app,'nonexistent.png',{confirm:false}),false);
});
