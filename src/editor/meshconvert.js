// SPDX-License-Identifier: MIT OR Apache-2.0
// Region-to-mesh conversion stays independent of the interactive editor/runtime.
import { toAffine } from '../core/math.js';

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

/** Replaces a region attachment with a 4-vertex mesh covering the same image. */
export function regionToMesh(doc, slot, att) {
  const m = toAffine(att.offset);
  const hw = att.width / 2;
  const hh = att.height / 2;
  const corners = [
    [-hw, hh],
    [hw, hh],
    [hw, -hh],
    [-hw, -hh],
  ].map((p) => m.apply(p));
  const mesh = {
    name: att.name,
    type: 'mesh',
    image: att.image,
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    triangles: [0, 1, 2, 0, 2, 3],
    hull: 4,
    vertices: corners.flat(),
    width: att.width,
    height: att.height,
  };
  for (const key of ['color', 'sequence', 'sourceName', 'extra']) if (att[key] !== undefined) mesh[key] = att[key];
  replaceAttachment(doc, att, mesh);
  return mesh;
}

