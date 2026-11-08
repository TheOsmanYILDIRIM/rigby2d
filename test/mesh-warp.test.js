// SPDX-License-Identifier: MIT OR Apache-2.0
// Image-warp contracts: geometry changes, UV/image sample coordinates do not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Skeleton, makeAttachment, makeSlot } from '../src/core/model.js';
import { identityTransform } from '../src/core/math.js';
import { regionToMesh, refineImageQuad } from '../src/editor/meshconvert.js';
import { triangulateMesh, uvAt, warpMoveVertices } from '../src/core/meshgeom.js';

function documentWithLayers() {
  const doc=new Skeleton();
  const original=makeAttachment('reference','reference.png',identityTransform(),120,180);
  const added=makeAttachment('new-piece','new-piece.png',{ ...identityTransform(),x:18,y:-9,scale_x:1.1,scale_y:0.9 },90,130);
  doc.slots.push(makeSlot('reference',0,original),makeSlot('new-piece',0,added));
  return {doc,original,added};
}

test('4x4 PNG warp cage preserves the source reference layer and region artwork at rest',()=>{
  const {doc,original,added}=documentWithLayers();
  const old=JSON.stringify(doc.slots[0]);
  const mesh=regionToMesh(doc,1,added,{segments:3});
  assert.equal(mesh.vertices.length/2,16);
  assert.equal(mesh.uvs.length/2,16);
  assert.equal(mesh.hull,12);
  assert.equal(mesh.triangles.length/3,18);
  assert.equal(mesh.image,'new-piece.png');
  assert.equal(JSON.stringify(doc.slots[0]),old);
  assert.equal(doc.slots[0].attachments[0],original);
  assert.equal(doc.slots[1].attachments[0],mesh);
  for(const value of mesh.uvs)assert.ok(value>=0&&value<=1);
  const pairs=[];for(let i=0;i<mesh.vertices.length;i+=2)pairs.push(mesh.vertices.slice(i,i+2));
  assert.deepEqual(triangulateMesh(pairs,mesh.hull),mesh.triangles);
});

test('moving a local warp node bends the image while leaving every UV and triangle unchanged',()=>{
  const {doc,added}=documentWithLayers();
  const mesh=regionToMesh(doc,1,added,{segments:3});
  const state={points:[],uvs:[],hull:mesh.hull,triangles:mesh.triangles.slice()};
  for(let i=0;i<mesh.vertices.length;i+=2)state.points.push(mesh.vertices.slice(i,i+2));
  for(let i=0;i<mesh.uvs.length;i+=2)state.uvs.push(mesh.uvs.slice(i,i+2));
  const point=state.points[12].slice(); // top-left interior node
  const originalUV=state.uvs[12].slice();
  const moved=warpMoveVertices(state,[12],[12,-7]);
  assert.deepEqual(moved.uvs,state.uvs);
  assert.deepEqual(moved.triangles,state.triangles);
  assert.deepEqual(moved.points[12],[point[0]+12,point[1]-7]);
  assert.deepEqual(state.points[12],point);
  const samplingBefore=uvAt(point,state.points,state.uvs,state.triangles);
  const samplingAfter=uvAt(point,moved.points,moved.uvs,moved.triangles);
  assert.ok(Math.hypot(samplingAfter[0]-samplingBefore[0],samplingAfter[1]-samplingBefore[1])>1e-3);
  assert.deepEqual(moved.uvs[12],originalUV);
});

test('legacy 4-vertex image quad can be refined, but weighted or already-bent quads are preserved',()=>{
  const {doc,added}=documentWithLayers();
  const old=regionToMesh(doc,1,added);
  assert.equal(old.vertices.length/2,4);
  const refined=refineImageQuad(doc,1,old,{segments:3});
  assert.equal(refined.vertices.length/2,16);
  assert.equal(doc.slots[1].attachments[0],refined);
  const again=refineImageQuad(doc,1,refined,{segments:3});
  assert.equal(again,null);
  const bent={...old,vertices:old.vertices.slice()};
  bent.vertices[0]+=10;
  const before=JSON.stringify(bent);
  assert.equal(refineImageQuad(doc,1,bent),null);
  assert.equal(JSON.stringify(bent),before);
  assert.equal(refineImageQuad(doc,1,{...old,weights:[[]]}),null);
  assert.throws(()=>regionToMesh(doc,0,doc.slots[0].attachments[0],{segments:0}),RangeError);
});
