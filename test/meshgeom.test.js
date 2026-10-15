import assert from 'node:assert/strict';
import { test } from 'node:test';

import { autoWeights, paintWeights, triangulateMesh, uvAt, weightsAt } from '../src/core/meshgeom.js';

const area = (pts, t) => {
  let a = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [p, q, r] = [pts[t[i]], pts[t[i + 1]], pts[t[i + 2]]];
    a += ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2;
  }
  return a;
};

test('triangulation covers the outline, uses every point and has 2n - h - 2 triangles', () => {
  // Concave L outline (clockwise) with two interior points.
  const pts = [[0, 0], [0, 20], [10, 20], [10, 10], [20, 10], [20, 0], [5, 5], [5, 15]];
  const tris = triangulateMesh(pts, 6);
  assert.equal(tris.length / 3, 2 * pts.length - 6 - 2);
  assert.ok(Math.abs(area(pts, tris) - 300) < 1e-6, 'covers the L exactly, counter-clockwise');
  for (let i = 0; i < pts.length; i++) assert.ok(tris.includes(i), `uses point ${i}`);
});

test('UVs and weights interpolate inside the mesh', () => {
  const pts = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
  const tris = triangulateMesh(pts, 4);
  assert.deepEqual(uvAt([5, 5], pts, uvs, tris).map((v) => +v.toFixed(6)), [0.5, 0.5]);
  assert.deepEqual(uvAt([15, 5], pts, uvs, tris).map((v) => +v.toFixed(6)), [1.5, 0.5]); // extrapolated
  const weights = [[{ bone: 1, weight: 1 }], [{ bone: 2, weight: 1 }], [{ bone: 2, weight: 1 }], [{ bone: 1, weight: 1 }]];
  const w = weightsAt([5, 5], pts, weights, tris);
  assert.deepEqual(w.map((x) => [x.bone, +x.weight.toFixed(3)]).sort(), [[1, 0.5], [2, 0.5]]);
});

test('automatic weights follow the nearest bone; painting adds and removes weight', () => {
  const pts = [[0, 0], [100, 0]];
  const bones = [
    { bone: 1, from: [0, -10], to: [0, 10] },
    { bone: 2, from: [100, -10], to: [100, 10] },
  ];
  const w = autoWeights(pts, bones);
  assert.equal(w[0][0].bone, 1);
  assert.ok(w[0][0].weight > 0.99);
  const changed = paintWeights(pts, w, 2, [0, 0], 20, 0.5);
  assert.deepEqual(changed, [0]);
  const two = w[0].find((x) => x.bone === 2).weight;
  assert.ok(two > 0.4 && two < 0.6, String(two));
  assert.ok(Math.abs(w[0].reduce((s, x) => s + x.weight, 0) - 1) < 1e-9);
  paintWeights(pts, w, 2, [0, 0], 20, 1, true);
  assert.ok(!w[0].some((x) => x.bone === 2));
});
