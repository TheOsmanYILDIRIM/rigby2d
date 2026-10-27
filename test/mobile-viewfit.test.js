import test from 'node:test';
import assert from 'node:assert/strict';
import { fitZoom } from '../src/editor/viewfit.js';

test('a 4096 pixel PNG fits a 360x700 mobile viewport without resizing the image', () => {
  const zoom=fitZoom(360,700,4096,4096);
  assert.ok(zoom<0.05);
  assert.ok(4096*zoom <= 360*0.8 + 0.001);
  assert.ok(4096*zoom <= 700*0.8 + 0.001);
});
test('multiple oversized imported PNGs also fit in the canvas', () => {
  const zoom=fitZoom(390,600,12288,2048);
  assert.ok(zoom>0 && zoom<0.05);
  assert.ok(12288*zoom <= 390*0.8+0.001);
});
test('small skeleton zoom is capped and bounds are safe', () => {
  assert.equal(fitZoom(400,800,1,1),20);
  assert.ok(Number.isFinite(fitZoom(0,0,0,0)));
});
