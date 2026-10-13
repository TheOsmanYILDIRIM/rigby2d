// SPDX-License-Identifier: MIT
// The canvas: draws the rig and handles pan/zoom, selection and the transform tools.

import { Affine, toAffine, transform } from '../core/math.js';
import { makeBone } from '../core/model.js';
import { Pose } from '../core/pose.js';
import { FPS, Mode, TOOLS, selBone, selSlot } from './app.js';
import * as edit from './edit.js';

const SELECTED = 'rgb(255,170,40)';
const BONE = 'rgb(110,200,230)';
const DRAG_THRESHOLD = 3;

const rgba = (rgb, a) => rgb.replace('rgb(', 'rgba(').replace(')', `,${a})`);

export class Viewport {
  constructor(app, canvas) {
    this.app = app;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 1;
    this.height = 1;
    /** Active tool drag: { kind: 'bone'|'slot'|'create', index, start, last }. */
    this.drag = null;
    this.press = null;
    this.panning = null;
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  toScreen(p) {
    const v = this.app.view;
    return [this.width / 2 + v.panX + p[0] * v.zoom, this.height / 2 + v.panY - p[1] * v.zoom];
  }

  toWorld(p) {
    const v = this.app.view;
    return [(p[0] - this.width / 2 - v.panX) / v.zoom, -(p[1] - this.height / 2 - v.panY) / v.zoom];
  }

  /** World-to-screen as an affine matrix. */
  screenAffine() {
    const v = this.app.view;
    return new Affine(v.zoom, 0, 0, -v.zoom, this.width / 2 + v.panX, this.height / 2 + v.panY);
  }

  eventPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    const w = Math.round(this.width * dpr);
    const h = Math.round(this.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return dpr;
  }

  draw() {
    const app = this.app;
    const dpr = this.resize();
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgb(38,38,38)';
    ctx.fillRect(0, 0, this.width, this.height);

    if (app.frameRequest) {
      this.frameAll();
      app.frameRequest = false;
    }
    this.drawGrid();
    const pose = app.pose();
    this.drawAttachments(pose, dpr);
    if (app.showBones) this.drawBones(pose);
    if (this.drag?.kind === 'create') {
      this.line(this.toScreen(this.drag.start), this.toScreen(this.drag.last), SELECTED, 2);
    }
    this.drawOverlay();
  }

  line(a, b, color, width = 1) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  frameAll() {
    const app = this.app;
    const pose = new Pose(app.doc);
    const pts = pose.quads(app.doc).flatMap((q) => q.positions);
    app.doc.bones.forEach((b, i) => {
      pts.push(pose.world[i].apply([0, 0]));
      pts.push(pose.world[i].apply([b.length, 0]));
    });
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    if (!pts.length || (x1 - x0 < 1 && y1 - y0 < 1)) {
      app.view = { panX: 0, panY: this.height * 0.25, zoom: 1 };
      return;
    }
    const zoom = Math.min(20, Math.max(0.05, Math.min(this.width / Math.max(1, x1 - x0), this.height / Math.max(1, y1 - y0)) * 0.8));
    const cx = (x0 + x1) * 0.5;
    const cy = (y0 + y1) * 0.5;
    app.view = { panX: -cx * zoom, panY: cy * zoom, zoom };
    app.changed();
  }

  drawGrid() {
    const zoom = this.app.view.zoom;
    let step = 50;
    while (step * zoom < 24) step *= 2;
    while (step * zoom > 120) step /= 2;
    const tl = this.toWorld([0, 0]);
    const br = this.toWorld([this.width, this.height]);
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgb(48,48,48)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(tl[0] / step) * step; x <= br[0]; x += step) {
      const sx = Math.round(this.toScreen([x, 0])[0]) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, this.height);
    }
    for (let y = Math.floor(br[1] / step) * step; y <= tl[1]; y += step) {
      const sy = Math.round(this.toScreen([0, y])[1]) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(this.width, sy);
    }
    ctx.stroke();
    const o = this.toScreen([0, 0]);
    this.line([0, o[1]], [this.width, o[1]], 'rgb(90,60,60)');
    this.line([o[0], 0], [o[0], this.height], 'rgb(60,90,60)');
  }

  drawAttachments(pose, dpr) {
    const app = this.app;
    const ctx = this.ctx;
    const screen = this.screenAffine();
    for (const q of pose.quads(app.doc)) {
      const att = q.attachment;
      const img = app.images.tinted(att.image, q.color);
      const pts = q.positions.map((p) => this.toScreen(p));
      if (img && img.width > 0 && img.height > 0) {
        // Image pixel (px, py) -> attachment-local point, then world, then screen.
        const toLocal = new Affine(att.width / img.width, 0, 0, -att.height / img.height, -att.width / 2, att.height / 2);
        const m = screen.mul(pose.attachmentWorld(app.doc, q.slot, att)).mul(toLocal);
        ctx.save();
        ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.tx, dpr * m.ty);
        ctx.globalAlpha = Math.min(1, Math.max(0, q.color[3]));
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      } else {
        this.polygon(pts, null, 'rgb(255,0,200)', 1.5);
      }
      if (selSlot(app.sel) === q.slot) this.polygon(pts, null, SELECTED, 1.5);
    }
  }

  polygon(pts, fill, stroke, width) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  circle(c, r, fill, stroke, width) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  drawBones(pose) {
    const app = this.app;
    app.doc.bones.forEach((b, i) => {
      const selected = selBone(app.sel) === i;
      const color = selected ? SELECTED : BONE;
      const o = this.toScreen(pose.world[i].apply([0, 0]));
      const t = this.toScreen(pose.world[i].apply([b.length, 0]));
      const dir = [t[0] - o[0], t[1] - o[1]];
      const len = Math.hypot(dir[0], dir[1]);
      if (len < 4) {
        this.circle(o, 6, rgba(color, 0.35), color, 1.5);
        return;
      }
      const w = Math.min(12, Math.max(3, len * 0.1));
      const n = [(-dir[1] / len) * w, (dir[0] / len) * w];
      const mid = [o[0] + dir[0] * 0.18, o[1] + dir[1] * 0.18];
      this.polygon([o, [mid[0] + n[0], mid[1] + n[1]], t, [mid[0] - n[0], mid[1] - n[1]]], rgba(color, selected ? 0.55 : 0.3), color, 1.5);
      this.circle(o, w * 0.55, 'rgb(30,30,30)', color, 1.5);
    });
  }

  drawOverlay() {
    const app = this.app;
    let text = 'SETUP';
    if (app.mode === Mode.Animate) {
      text = `ANIMATE · ${app.currentAnimation()?.name ?? ''} · frame ${Math.round(app.time * FPS)}`;
    }
    text += `   ${TOOLS.find((t) => t.id === app.tool)?.label ?? ''}`;
    const ctx = this.ctx;
    ctx.font = '13px system-ui, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgb(200,200,200)';
    ctx.textBaseline = 'top';
    ctx.fillText(text, 10, 8);
    if (app.mode === Mode.Animate) {
      ctx.strokeStyle = 'rgba(255,110,80,0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, this.width - 4, this.height - 4);
    }
  }

  /** Finds the bone or slot under a screen position (bones first, then topmost image). */
  hitTest(pose, pos) {
    const app = this.app;
    if (app.showBones) {
      let best = null;
      app.doc.bones.forEach((b, i) => {
        const o = this.toScreen(pose.world[i].apply([0, 0]));
        const t = this.toScreen(pose.world[i].apply([b.length, 0]));
        const d = distToSegment(pos, o, t);
        const len = Math.hypot(t[0] - o[0], t[1] - o[1]);
        const reach = len < 4 ? 8 : Math.min(12, Math.max(5, len * 0.1));
        if (d <= reach && (best === null || d < best.d)) best = { d, i };
      });
      if (best) return { bone: best.i };
    }
    const world = this.toWorld(pos);
    for (const q of pose.quads(app.doc).reverse()) {
      const att = q.attachment;
      const [lx, ly] = pose.attachmentWorld(app.doc, q.slot, att).inverse().apply(world);
      const { width: w, height: h } = att;
      if (Math.abs(lx) > w * 0.5 || Math.abs(ly) > h * 0.5) continue;
      const img = app.images.get(att.image);
      let opaque = true;
      if (img) {
        const px = Math.min(Math.floor((lx / w + 0.5) * img.width), img.width - 1);
        const py = Math.min(Math.floor((0.5 - ly / h) * img.height), img.height - 1);
        opaque = app.images.alphaAt(att.image, px, py) > 16;
      }
      if (opaque) return { slot: q.slot };
    }
    return null;
  }

  // ---- input --------------------------------------------------------------------------------

  onWheel(e) {
    e.preventDefault();
    const app = this.app;
    const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    const factor = Math.exp(-delta * 0.0015);
    if (Math.abs(factor - 1) <= 1e-4) return;
    const cursor = this.eventPos(e);
    const old = app.view.zoom;
    const zoom = Math.min(20, Math.max(0.05, old * factor));
    const rel = [cursor[0] - this.width / 2 - app.view.panX, cursor[1] - this.height / 2 - app.view.panY];
    app.view.panX += rel[0] - rel[0] * (zoom / old);
    app.view.panY += rel[1] - rel[1] * (zoom / old);
    app.view.zoom = zoom;
    app.changed();
  }

  onPointerDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    document.activeElement?.blur?.();
    const pos = this.eventPos(e);
    if (e.button === 0) {
      this.press = { pos, started: false };
    } else if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      this.panning = pos;
    }
  }

  onPointerMove(e) {
    const app = this.app;
    const pos = this.eventPos(e);
    if (this.panning) {
      app.view.panX += pos[0] - this.panning[0];
      app.view.panY += pos[1] - this.panning[1];
      this.panning = pos;
      app.changed();
    }
    if (this.press && e.buttons & 1) {
      if (!this.press.started && Math.hypot(pos[0] - this.press.pos[0], pos[1] - this.press.pos[1]) > DRAG_THRESHOLD) {
        this.press.started = true;
        this.dragStart(this.press.pos);
      }
      if (this.press.started) this.dragMove(pos);
    }
  }

  onPointerUp(e) {
    if (e.button === 1 || e.button === 2) this.panning = null;
    if (e.button === 0 && this.press) {
      if (this.press.started) this.dragStop();
      else if (e.type === 'pointerup') this.click(this.press.pos);
      this.press = null;
    }
    if (e.type === 'pointercancel') {
      this.panning = null;
      this.press = null;
      this.drag = null;
    }
  }

  click(pos) {
    const app = this.app;
    app.sel = this.hitTest(app.pose(), pos);
    app.selectedKey = null;
    app.changed();
  }

  dragStart(press) {
    const app = this.app;
    const start = this.toWorld(press);
    let kind = null;
    let index = 0;
    if (app.tool === 'create') {
      if (app.mode === Mode.Animate) {
        app.setStatus('Bones can only be created in Setup mode (Tab)');
      } else {
        kind = 'create';
        index = selBone(app.sel) ?? 0;
      }
    } else {
      const hit = this.hitTest(app.pose(), press);
      if (hit) app.sel = hit;
      if (selBone(app.sel) !== null) [kind, index] = ['bone', selBone(app.sel)];
      else if (selSlot(app.sel) !== null) [kind, index] = ['slot', selSlot(app.sel)];
    }
    this.drag = kind ? { kind, index, start, last: start } : null;
    app.changed();
  }

  dragMove(pos) {
    const d = this.drag;
    if (!d) return;
    const world = this.toWorld(pos);
    const pose = this.app.pose();
    if (d.kind === 'bone') this.dragBone(pose, d.index, d.last, world);
    else if (d.kind === 'slot') this.dragSlot(pose, d.index, d.last, world);
    d.last = world;
    this.app.changed();
  }

  dragStop() {
    const d = this.drag;
    this.drag = null;
    if (d?.kind === 'create') this.createBone(this.app.pose(), d.index, d.start, d.last);
    this.app.changed();
  }

  dragBone(pose, b, last, cur) {
    const app = this.app;
    const local = { ...pose.local[b] };
    const parentIdx = app.doc.bones[b].parent;
    const parent = parentIdx === null ? new Affine() : pose.world[parentIdx];
    const origin = pose.world[b].apply([0, 0]);
    switch (app.tool) {
      case 'rotate':
        local.rotation += (parent.determinant() < 0 ? -1 : 1) * angleBetween(origin, last, cur);
        break;
      case 'move': {
        const d = parent.inverse().applyVector([cur[0] - last[0], cur[1] - last[1]]);
        local.x += d[0];
        local.y += d[1];
        break;
      }
      case 'scale': {
        const r = distanceRatio(origin, last, cur);
        local.scale_x *= r;
        local.scale_y *= r;
        break;
      }
      default:
        return;
    }
    edit.setBoneLocal(app, b, local);
  }

  dragSlot(pose, s, last, cur) {
    const app = this.app;
    const name = pose.attachment[s];
    if (name === null || name === undefined) return;
    const boneWorld = pose.world[app.doc.slots[s].bone];
    const att = app.doc.slots[s].attachments.find((a) => a.name === name);
    if (!att) return;
    const center = boneWorld.mul(toAffine(att.offset)).apply([0, 0]);
    switch (app.tool) {
      case 'rotate':
        att.offset.rotation += (boneWorld.determinant() < 0 ? -1 : 1) * angleBetween(center, last, cur);
        break;
      case 'move': {
        const d = boneWorld.inverse().applyVector([cur[0] - last[0], cur[1] - last[1]]);
        att.offset.x += d[0];
        att.offset.y += d[1];
        break;
      }
      case 'scale': {
        const r = distanceRatio(center, last, cur);
        att.offset.scale_x *= r;
        att.offset.scale_y *= r;
        break;
      }
      default:
        break;
    }
    if (app.mode === Mode.Animate) {
      app.status = 'Image placement is part of the setup pose; animate bones to move images over time';
    }
  }

  createBone(pose, parent, start, end) {
    const app = this.app;
    if (Math.hypot(end[0] - start[0], end[1] - start[1]) * app.view.zoom < 4) return;
    const inv = pose.world[parent].inverse();
    const p = inv.apply(start);
    const d = inv.applyVector([end[0] - start[0], end[1] - start[1]]);
    const name = app.doc.uniqueBoneName('bone');
    const setup = transform(p[0], p[1], (Math.atan2(d[1], d[0]) * 180) / Math.PI);
    const i = app.doc.addBone(makeBone(name, parent, setup, Math.hypot(d[0], d[1])));
    app.sel = { bone: i };
    app.setStatus(`Created ${name}: drag again to chain a child bone`);
  }
}

function distToSegment(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const lenSq = ab[0] * ab[0] + ab[1] * ab[1];
  const t = lenSq > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / lenSq)) : 0;
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t));
}

function angleBetween(origin, a, b) {
  const a0 = Math.atan2(a[1] - origin[1], a[0] - origin[0]);
  const a1 = Math.atan2(b[1] - origin[1], b[0] - origin[0]);
  let d = ((a1 - a0) * 180) / Math.PI;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
}

function distanceRatio(origin, a, b) {
  const da = Math.hypot(a[0] - origin[0], a[1] - origin[1]);
  const db = Math.hypot(b[0] - origin[0], b[1] - origin[1]);
  return da < 1 ? 1 : db / da;
}
