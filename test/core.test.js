import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Animation, makeKey, resort, sample, setKey } from '../src/core/animation.js';
import { EASE_IN_OUT, LINEAR, STEPPED, ease } from '../src/core/curve.js';
import { toAffine, transform } from '../src/core/math.js';
import { Skeleton, makeBone } from '../src/core/model.js';
import { Pose } from '../src/core/pose.js';
import { AnimationState } from '../src/core/state.js';

const close = (a, b) => Math.abs(a - b) < 1e-4;

test('curve endpoints and symmetry', () => {
  assert.ok(Math.abs(ease(EASE_IN_OUT, 0)) < 1e-4);
  assert.ok(close(ease(EASE_IN_OUT, 1), 1));
  assert.ok(Math.abs(ease(EASE_IN_OUT, 0.5) - 0.5) < 1e-3);
  assert.ok(ease(EASE_IN_OUT, 0.25) < 0.25);
  assert.equal(ease(STEPPED, 0.99), 0);
});

test('affine inverse and decompose roundtrip', () => {
  const m = toAffine({ x: 3, y: -2, rotation: 37, scale_x: 2, scale_y: 0.5 });
  const p = m.inverse().apply(m.apply([5, 7]));
  assert.ok(close(p[0], 5) && close(p[1], 7));
  const d = toAffine({ x: 1, y: 2, rotation: -120, scale_x: 1.5, scale_y: 0.75 }).decompose();
  assert.ok(close(d.x, 1) && close(d.y, 2) && close(d.rotation, -120));
  assert.ok(close(d.scale_x, 1.5) && close(d.scale_y, 0.75));
  const r = toAffine(transform(0, 0, 90)).apply([1, 0]);
  assert.ok(close(r[0], 0) && close(r[1], 1), 'rotation is counter-clockwise');
});

const keys = () => [makeKey(0, 0, LINEAR), makeKey(1, 10, STEPPED), makeKey(2, 20, LINEAR)];

test('sampling', () => {
  const k = keys();
  assert.equal(sample(k, -1), 0);
  assert.equal(sample(k, 0.5), 5);
  assert.equal(sample(k, 1.5), 10);
  assert.equal(sample(k, 2), 20);
  assert.equal(sample(k, 9), 20);
  assert.equal(sample([], 1), undefined);
});

test('setKey keeps keys sorted and replaces', () => {
  const k = keys();
  assert.equal(setKey(k, 0.5, 3), 1);
  assert.equal(setKey(k, 0.5, 4), 1);
  assert.equal(k.length, 4);
  assert.equal(k[1].value, 4);
});

test('resort after retime', () => {
  const k = keys();
  k[0].time = 1.5;
  assert.equal(resort(k, 0), 1);
  for (let i = 1; i < k.length; i++) assert.ok(k[i - 1].time <= k[i].time);
});

function chain() {
  const sk = new Skeleton();
  const a = sk.addBone(makeBone('a', 0, transform(), 10));
  sk.addBone(makeBone('b', a, transform(), 10));
  sk.addBone(makeBone('c', 0, transform(), 10));
  return sk;
}

test('addBone keeps parent order', () => {
  const sk = chain();
  sk.addBone(makeBone('a2', sk.boneIndex('a'), transform(), 1));
  assert.equal(sk.validate(), null);
  assert.deepEqual(sk.bones.map((b) => b.name), ['root', 'a', 'b', 'a2', 'c']);
});

test('removeBone removes the subtree', () => {
  const sk = chain();
  sk.removeBone(sk.boneIndex('a'));
  assert.deepEqual(sk.bones.map((b) => b.name), ['root', 'c']);
  assert.equal(sk.bones[1].parent, 0);
  assert.equal(sk.validate(), null);
});

test('reparentBone moves the subtree', () => {
  const sk = chain();
  sk.reparentBone(sk.boneIndex('a'), sk.boneIndex('c'));
  assert.equal(sk.validate(), null);
  assert.equal(sk.bones[sk.boneIndex('a')].parent, sk.boneIndex('c'));
  assert.equal(sk.bones[sk.boneIndex('b')].parent, sk.boneIndex('a'));
});

test('json roundtrip', () => {
  const sk = chain();
  const anim = new Animation('wave', 1);
  setKey(anim.boneTimelineMut(1).rotate, 0.5, 12, EASE_IN_OUT);
  sk.animations.push(anim);
  const back = Skeleton.fromJson(sk.toJson());
  assert.equal(back.toJson(), sk.toJson());
  assert.throws(() => Skeleton.fromJson('{"bones": []}'), /no bones/);
  assert.throws(() => Skeleton.fromJson('not json'), /invalid JSON/);
});

test('world transforms follow the chain and animation', () => {
  const sk = new Skeleton();
  const arm = sk.addBone(makeBone('arm', 0, transform(0, 0, 90), 10));
  const hand = sk.addBone(makeBone('hand', arm, transform(10, 0, 0), 5));
  const anim = new Animation('wave', 1);
  const tl = anim.boneTimelineMut(arm);
  setKey(tl.rotate, 0, 0);
  tl.rotate.push(makeKey(1, -90));

  const pose = new Pose(sk);
  let p = pose.world[hand].apply([0, 0]);
  assert.ok(Math.abs(p[0]) < 1e-4 && close(p[1], 10));
  pose.apply(sk, anim, 1, 1);
  pose.updateWorld(sk);
  p = pose.world[hand].apply([0, 0]);
  assert.ok(close(p[0], 10) && Math.abs(p[1]) < 1e-4);
});

test('looping and crossfade', () => {
  const sk = new Skeleton();
  const b = sk.addBone(makeBone('b', 0, transform(), 1));
  for (const [name, v] of [['a', 10], ['c', 30]]) {
    const anim = new Animation(name, 1);
    setKey(anim.boneTimelineMut(b).rotate, 0, v);
    sk.animations.push(anim);
  }
  const st = new AnimationState();
  const pose = new Pose(sk);
  assert.ok(st.play(sk, 'a', true, 0));
  st.update(2.5);
  st.apply(sk, pose);
  assert.equal(pose.local[b].rotation, 10);

  st.play(sk, 'c', true, 1);
  st.update(0.5);
  st.apply(sk, pose);
  assert.ok(close(pose.local[b].rotation, 20));
  st.update(1);
  st.apply(sk, pose);
  assert.equal(pose.local[b].rotation, 30);
});
