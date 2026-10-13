import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Skeleton } from '../src/core/model.js';
import { pack } from '../src/editor/pack.js';
import { robot } from '../src/editor/sample.js';

test('pack places without overlap', () => {
  const items = Array.from({ length: 19 }, (_, k) => ({ name: `i${k}`, width: 10 * (k + 1), height: 7 * (19 - k) }));
  const { width, height, regions } = pack(items);
  regions.forEach((a, i) => {
    assert.ok(a.x + a.width <= width && a.y + a.height <= height);
    for (const b of regions.slice(i + 1)) {
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.ok(!overlap, `${a.name} overlaps ${b.name}`);
    }
  });
});

test('sample is valid and roundtrips', () => {
  const names = new Set();
  const sk = robot({ insertRgba: (name) => names.add(name) });
  assert.equal(Skeleton.fromJson(sk.toJson()).toJson(), sk.toJson());
  assert.ok(sk.slots.every((s) => s.attachments.every((a) => names.has(a.image))));
  assert.deepEqual(sk.animations.map((a) => a.name), ['walk', 'idle']);
});
