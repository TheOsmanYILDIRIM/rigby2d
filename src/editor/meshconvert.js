// SPDX-License-Identifier: MIT OR Apache-2.0
// Region-to-mesh conversion stays independent of the interactive editor/runtime.
import { toAffine } from '../core/math.js';
import { triangulateMesh } from '../core/meshgeom.js';

/** Every list holding attachments (default skin per slot, then named skins). */
function attachmentLists(doc) {
  const lists = doc.slots.map((s) => s.attachments);
  for (const skin of doc.skins) for (const e of skin.slots) lists.push(e.attachments);
  return lists;
}

function replaceAttachment(doc, old, neu) {
  for (const list of attachmentLists(doc)) {
    const i = list.indexOf(old);
    if (i >= 0) list[i] = neu;
  }
}

/** Create perimeter-first grid geometry compatible with Rigby2D's mesh triangulator.
 *  Segments=1 preserves the legacy four-corner quad. Segments=3 gives a 4x4 warp cage.
 */
function gridGeometry(segments, position) {
  if (!Number.isInteger(segments) || segments < 1 || segments > 8) throw new RangeError('Invalid warp grid density');
  const vertices = [], uvs = [];
  const point = (x, y) => {
    const u = x / segments, v = y / segments;
    const p = position(u, v);
    vertices.push(p[0], p[1]);
    uvs.push(u, v);
  };
  for (let x = 0; x <= segments; x++) point(x, 0);
  for (let y = 1; y <= segments; y++) point(segments, y);
  for (let x = segments - 1; x >= 0; x--) point(x, segments);
  for (let y = segments - 1; y >= 1; y--) point(0, y);
  const hull = vertices.length / 2;
  for (let y = 1; y < segments; y++) for (let x = 1; x < segments; x++) point(x, y);
  const pairs = [];
  for (let i = 0; i < vertices.length; i += 2) pairs.push([vertices[i], vertices[i + 1]]);
  const triangles = segments === 1 ? [0, 1, 2, 0, 2, 3] : triangulateMesh(pairs, hull);
  return { vertices, uvs, triangles, hull };
}

/** Turn a region into a mesh with an optional internal warp cage.
 *  Default retains the desktop/legacy four-corner conversion.
 */
export function regionToMesh(doc, slot, att, { segments = 1 } = {}) {
  const m = toAffine(att.offset);
  const geometry = gridGeometry(segments, (u, v) => m.apply([(u - 0.5) * att.width, (0.5 - v) * att.height]));
  const mesh = {
    name: att.name,
    type: 'mesh',
    image: att.image,
    ...geometry,
    width: att.width,
    height: att.height,
  };
  for (const key of ['color', 'sequence', 'sourceName', 'extra']) if (att[key] !== undefined) mesh[key] = att[key];
  replaceAttachment(doc, att, mesh);
  return mesh;
}

/** Upgrade an untouched, unweighted four-corner image quad to a deformable grid.
 *  Intentionally refuses already bent or animated meshes rather than change their art/keys.
 */
export function refineImageQuad(doc, slot, att, { segments = 3 } = {}) {
  if (!att || att.type !== 'mesh' || att.weights || att.hull !== 4 || att.uvs?.length !== 8 || att.vertices?.length !== 8) return null;
  if (doc.animations?.some(anim => anim.deform?.some(d => d.slot === slot && d.attachment === att.name))) return null;
  const expectedUv = [0, 0, 1, 0, 1, 1, 0, 1];
  if (!expectedUv.every((value, i) => Math.abs(att.uvs[i] - value) < 1e-8)) return null;
  const p = [];
  for (let i = 0; i < 8; i += 2) p.push([att.vertices[i], att.vertices[i + 1]]);
  const diagonalError = Math.hypot(p[0][0] + p[2][0] - p[1][0] - p[3][0], p[0][1] + p[2][1] - p[1][1] - p[3][1]);
  const span = Math.max(1, ...p.flat().map(Math.abs));
  if (diagonalError > 1e-6 * span) return null;
  const geometry = gridGeometry(segments, (u, v) => [0, 1].map(k => p[0][k] * (1 - u) * (1 - v) + p[1][k] * u * (1 - v) + p[2][k] * u * v + p[3][k] * (1 - u) * v));
  const updated = { ...att, ...geometry };
  replaceAttachment(doc, att, updated);
  return updated;
}
