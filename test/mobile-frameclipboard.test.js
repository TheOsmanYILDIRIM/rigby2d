// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { App, Mode } from '../src/editor/app.js';
import { Animation } from '../src/core/animation.js';
import { makeBone } from '../src/core/model.js';
import { transform } from '../src/core/math.js';
import { setBoneLocal } from '../src/editor/edit.js';
import { seedInitialPose, createFrameClipboard } from '../src/editor/frameclipboard.js';

function make() {
  const app = new App();
  app.doc.addBone(makeBone('arm', 0, transform(15, 30, 0), 60));
  app.doc.animations.push(new Animation('walk', 1));
  app.anim = 0;
  app.time = 0;
  app.mode = Mode.Animate;
  app.autoKey = true;
  return app;
}
test('Auto Key animates only the edited frame when the rest pose has a frame-zero key', () => {
  const app = make();
  assert.equal(seedInitialPose(app), true);
  app.time = 5 / 30;
  setBoneLocal(app, 1, {...app.pose().local[1],rotation:35});
  assert.ok(Math.abs(app.pose().local[1].rotation-35)<0.001);
  app.time = 0;
  assert.ok(Math.abs(app.pose().local[1].rotation)<0.001);
  app.time = 5 / 30;
  assert.ok(Math.abs(app.pose().local[1].rotation-35)<0.001);
});
test('frame clipboard pastes evaluated bone poses onto a different frame', () => {
  const app=make();
  seedInitialPose(app);
  app.time=5 / 30;
  setBoneLocal(app,1,{...app.pose().local[1],rotation:28});
  const clip=createFrameClipboard();
  assert.equal(clip.copy(app),true);
  app.time=10 / 30;
  assert.equal(clip.paste(app),true);
  assert.ok(Math.abs(app.pose().local[1].rotation-28)<0.001);
  app.time=0;
  assert.ok(Math.abs(app.pose().local[1].rotation)<0.001);
});
test('copy requires Animate mode and paste rejects changed skeleton',()=>{
  const app=make(); const clip=createFrameClipboard();
  app.mode=Mode.Setup;
  assert.equal(clip.copy(app),false);
  app.mode=Mode.Animate;
  assert.equal(clip.copy(app),true);
  app.doc.bones[1].name='renamed';
  assert.equal(clip.paste(app),false);
});
