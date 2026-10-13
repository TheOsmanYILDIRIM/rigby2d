import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isSkeletonBinary, readSkeletonBinary, writeSkeletonBinary } from '../src/core/binary.js';
import { VERSION_FIELD as V, readSkeletonJson, writeSkeletonJson } from '../src/core/interop.js';
import { robot } from '../src/editor/sample.js';

// A hand-written 4.3 skeleton using every feature the binary encoder supports.
const FIXTURE = {
  skeleton: { hash: 'AAECAwQFBgc', [V]: '4.3.0', x: -10, y: 0, width: 120, height: 200, images: './images/', audio: null },
  bones: [
    { name: 'root' },
    { name: 'hip', parent: 'root', y: 100, color: 'ff0000ff', icon: 'ik' },
    { name: 'upper', parent: 'hip', rotation: -90, length: 50, inherit: 'noScale' },
    { name: 'lower', parent: 'upper', x: 50, length: 50, scaleX: 1.5, shearY: 4 },
    { name: 'target', parent: 'root', x: 30, y: 20 },
  ],
  slots: [
    { name: 'body', bone: 'hip', attachment: 'body', color: '80ff80ff', blend: 'additive' },
    { name: 'leg', bone: 'upper', attachment: 'leg' },
  ],
  constraints: [{ type: 'ik', name: 'leg-ik', target: 'target', bones: ['upper', 'lower'], bendPositive: false }],
  skins: [
    {
      name: 'default',
      attachments: {
        body: { body: { x: 1, y: 2, rotation: 3, width: 40, height: 60 }, 'body-alt': { path: 'body2', width: 40, height: 60, scaleX: 2 } },
        leg: {
          leg: {
            type: 'mesh',
            path: 'legs/leg',
            uvs: [0, 0, 1, 0, 1, 1, 0, 1],
            triangles: [0, 1, 2, 0, 2, 3],
            vertices: [1, 2, 0, 10, 1, 2, 2, 50, 10, 0.5, 3, 0, 10, 0.5, 1, 3, 50, -10, 1, 1, 2, 0, -10, 1],
            hull: 4,
            edges: [0, 2, 2, 4, 4, 6, 6, 0],
            width: 50,
            height: 20,
          },
          flat: { type: 'mesh', uvs: [0, 0, 1, 0, 0, 1], triangles: [0, 1, 2], vertices: [0, 0, 10, 0, 0, 10], hull: 3, edges: [], width: 10, height: 10 },
        },
      },
    },
  ],
  events: { step: { int: 3, float: 0.5, string: 'left' } },
  animations: {
    run: {
      slots: {
        body: {
          attachment: [{ name: 'body-alt' }, { time: 0.5, name: 'body' }, { time: 0.75 }],
          rgba: [{ color: 'ffffffff', curve: [0.1, 1, 0.2, 0.5, 0.1, 1, 0.2, 0.5, 0.1, 1, 0.2, 0.5, 0.1, 1, 0.2, 0.5] }, { time: 0.3, color: '00000080' }],
        },
      },
      bones: {
        hip: {
          rotate: [{ value: 10, curve: 'stepped' }, { time: 0.5, value: -20, curve: [0.6, -20, 0.8, 5] }, { time: 1, value: 5 }],
          translate: [{ x: 1, curve: [0.1, 1, 0.2, 2, 0.1, 0, 0.2, 3] }, { time: 0.4, x: 2, y: 3 }],
          scaley: [{ value: 2 }],
          shear: [{ time: 0.2, x: 5 }],
        },
      },
      ik: { 'leg-ik': [{ mix: 0 }, { time: 0.5, mix: 0.5, softness: 10, stretch: true }, { time: 1, bendPositive: false }] },
      drawOrder: [{ time: 0.25, offsets: [{ slot: 'body', offset: 1 }] }, { time: 0.75 }],
      events: [{ time: 0.1, name: 'step' }, { time: 0.6, name: 'step', int: 7, string: 'right' }],
    },
  },
};

test('binary round trip of the fixture is lossless', () => {
  const bytes = writeSkeletonBinary(structuredClone(FIXTURE));
  assert.ok(isSkeletonBinary(bytes));
  const back = readSkeletonBinary(bytes);
  delete back._strings;
  const near = (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-4;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      return [...keys].every((k) => near(a[k], b[k]));
    }
    return a === b;
  };
  assert.ok(near(back, FIXTURE), JSON.stringify(back).slice(0, 400));
});

test('binary through the document model', () => {
  const { skeleton } = readSkeletonJson(structuredClone(FIXTURE), 'fixture');
  const bytes = writeSkeletonBinary(writeSkeletonJson(skeleton, { version: '4.3', binary: true }).json);
  const again = readSkeletonJson(readSkeletonBinary(bytes), 'fixture').skeleton;
  // Rig data is identical; the header bounds are recomputed and the string table is carried along.
  const rig = (sk) => { const o = sk.toObject(); delete o.header; delete o.extra; return JSON.stringify(o); };
  assert.equal(rig(again), rig(skeleton));
  // Exported JSON never contains binary-only data.
  assert.ok(!JSON.stringify(writeSkeletonJson(again, { version: '4.3' }).json).includes('"_'));
});

test('the sample robot exports to binary', () => {
  const sk = robot({ insertRgba: () => {} });
  const bytes = writeSkeletonBinary(writeSkeletonJson(sk, { version: '4.3', binary: true }).json);
  const back = readSkeletonJson(readSkeletonBinary(bytes), 'robot').skeleton;
  assert.equal(back.bones.length, sk.bones.length);
  assert.equal(back.animations.length, 2);
});

test('unsupported features stop with a clear error', () => {
  const withSkin = structuredClone(FIXTURE);
  withSkin.skins.push({ name: 'armor', attachments: {} });
  assert.throws(() => writeSkeletonBinary(withSkin), /not supported in \.skel/);
  const withPath = structuredClone(FIXTURE);
  withPath.constraints.push({ type: 'path', name: 'p', bones: ['hip'], target: 'body' });
  assert.throws(() => writeSkeletonBinary(withPath), /not supported in \.skel/);
  assert.ok(!isSkeletonBinary(new TextEncoder().encode('{"skeleton":{}}')));
});
