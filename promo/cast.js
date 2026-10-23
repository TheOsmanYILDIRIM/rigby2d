// SPDX-License-Identifier: MIT OR Apache-2.0
// The promo's characters: Rigbytron (with its real animations), the same art as loose PSD-style
// layers, that art rigged by AutoRig, and a wave made with the same core API the MCP tools use.
// Characters are drawn by Rigby2D's own WebGL renderer into one shared canvas, placed anywhere on
// screen at any size, then composited into the frame.

import { Animation, setKey } from '../src/core/animation.js';
import { autoRig } from '../src/core/autorig.js';
import { EASE_IN_OUT } from '../src/core/curve.js';
import { toAffine } from '../src/core/math.js';
import { Pose } from '../src/core/pose.js';
import { WebGLRenderer } from '../src/webgl/renderer.js';
import { Images } from '../src/editor/images.js';
import { openProject } from '../src/editor/io.js';
import { animationBounds } from '../src/editor/output.js';
import { memoryFs } from '../src/editor/platform.js';
import { looseLayers } from '../src/editor/tutorials/practice.js';

const identity = (u, v, out) => ((out[0] = u), (out[1] = v), out);

export class Cast {
  async load() {
    this.images = new Images();
    const blob = await (await fetch('/branding/rigbytron/rigbytron.rigby')).blob();
    const { doc } = await openProject('rigbytron.rigby', memoryFs([new File([blob], 'rigbytron.rigby')]), this.images);
    this.rigbytron = doc;
    // A wave, keyed like an AI assistant would with batch_edit: the right arm up, the forearm swinging.
    const wave = new Animation('wave', 2);
    const key = (bone, ch, t, v) => setKey(wave.boneTimelineMut(doc.boneIndex(bone))[ch], t, v, EASE_IN_OUT);
    key('upperarm_r', 'rotate', 0, 0);
    key('upperarm_r', 'rotate', 0.4, 110);
    key('upperarm_r', 'rotate', 1.6, 110);
    key('upperarm_r', 'rotate', 2, 0);
    for (let i = 0; i <= 6; i++) key('forearm_r', 'rotate', 0.4 + i * 0.2, i % 2 ? 35 : -10);
    key('forearm_r', 'rotate', 2, 0);
    key('head', 'rotate', 0, 0);
    key('head', 'rotate', 0.6, -8);
    key('head', 'rotate', 1.6, -8);
    key('head', 'rotate', 2, 0);
    doc.animations.push(wave);
    // The same art as loose layers (a PSD import), and those layers rigged by AutoRig.
    this.layers = looseLayers(doc);
    this.rigged = looseLayers(doc);
    autoRig(this.rigged, (name) => {
      if (this.images.alphaAt(name, 0, 0) === null) return null;
      const s = this.images.map.get(name);
      return { width: s.canvas.width, height: s.canvas.height, data: s.alpha };
    });
    const b = animationBounds(
      doc,
      doc.animations.findIndex((a) => a.name === 'hold'),
      30,
    );
    this.bounds = { x0: b[0], y0: b[1], x1: b[2], y1: b[3] };
    return this;
  }

  /** Sets up the shared WebGL canvas for frames of `width` × `height`. */
  attach(width, height) {
    if (this.canvas?.width === width && this.canvas?.height === height) return;
    this.canvas = new OffscreenCanvas(width, height);
    this.gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer = new WebGLRenderer(this.gl);
    this.textures = new Map();
  }

  lookup(name) {
    const canvas = this.images.get(name);
    if (!canvas) return null;
    let e = this.textures.get(name);
    if (!e) {
      e = {
        tex: this.renderer.createTexture(canvas),
        trim: [0, 0, 1, 1],
        map: identity,
      };
      this.textures.set(name, e);
    }
    return e;
  }

  /** The pose of `doc` at `time` in animation `name` (looping), or the setup pose. */
  pose(doc, name = null, time = 0) {
    const pose = new Pose(doc);
    const anim = name ? doc.animations.find((a) => a.name === name) : null;
    if (anim) {
      pose.apply(doc, anim, anim.duration > 0 ? ((time % anim.duration) + anim.duration) % anim.duration : 0, 1);
      pose.updateWorld(doc);
    }
    return pose;
  }

  /**
   * The camera that puts the character's centre at screen point (sx, sy), `height` pixels tall.
   * Returns { cam, zoom, toScreen([x, y]) }.
   */
  place(sx, sy, height) {
    const b = this.bounds;
    const zoom = height / (b.y1 - b.y0);
    const wx = (b.x0 + b.x1) / 2;
    const wy = (b.y0 + b.y1) / 2;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cam = {
      x: wx - (sx - W / 2) / zoom,
      y: wy + (sy - H / 2) / zoom,
      zoom,
    };
    return {
      cam,
      zoom,
      toScreen: ([x, y]) => [(x - cam.x) * zoom + W / 2, H / 2 - (y - cam.y) * zoom],
    };
  }

  /** Clears the shared canvas for a new frame. */
  clear() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Draws a posed skeleton with `place`'s camera; `tint` [r, g, b, a] multiplies its colours. */
  draw(doc, pose, placed, tint = [1, 1, 1, 1]) {
    this.renderer.begin(this.canvas.width, this.canvas.height, placed.cam);
    this.renderer.drawSkeleton(doc, pose, (n) => this.lookup(n), { tint });
    this.renderer.end();
  }

  /** Copies what was drawn into the frame's 2D context. */
  composite(ctx) {
    this.gl.finish();
    ctx.drawImage(this.canvas, 0, 0);
  }

  /**
   * Draws the loose layers in 2D, each moved by `offset(i)` → { dx, dy, rot, alpha, scale } (screen
   * pixels and degrees), so they can fly in from all sides and land exactly in place.
   */
  drawLayers(ctx, placed, offset) {
    const doc = this.layers;
    const pose = new Pose(doc);
    for (const i of pose.drawOrder) {
      const slot = doc.slots[i];
      const att = slot.attachments.find((a) => a.name === pose.attachment[i]);
      if (!att || att.type !== 'region') continue;
      const img = this.images.get(att.image ?? att.name);
      if (!img) continue;
      const m = pose.world[slot.bone].mul(toAffine(att.offset));
      const o = offset(i, doc.slots.length);
      if (o.alpha <= 0) continue;
      const [sx, sy] = placed.toScreen([m.tx, m.ty]);
      ctx.save();
      ctx.globalAlpha *= o.alpha;
      ctx.translate(sx + o.dx, sy + o.dy);
      ctx.rotate((o.rot * Math.PI) / 180);
      ctx.scale(o.scale ?? 1, o.scale ?? 1);
      // World (Y up) to screen (Y down): the image's local axes, scaled by the camera zoom.
      ctx.transform(m.a * placed.zoom, -m.b * placed.zoom, -m.c * placed.zoom, m.d * placed.zoom, 0, 0);
      ctx.scale(1, -1);
      ctx.drawImage(img, -att.width / 2, -att.height / 2, att.width, att.height);
      ctx.restore();
    }
  }

  /** Draws the rig's bones (as in the editor) over a pose, growing in order up to `grown` (0..1 each). */
  drawBones(ctx, doc, pose, placed, grown, color = '#8fb6ec') {
    const bones = doc.bones.map((b, i) => ({ b, i })).filter(({ i }) => i > 0);
    bones.forEach(({ b, i }, n) => {
      const g = grown(n, bones.length);
      if (g <= 0) return;
      const m = pose.world[i];
      const len = Math.max(b.length, 8) * g;
      const [x0, y0] = placed.toScreen([m.tx, m.ty]);
      const [x1, y1] = placed.toScreen(m.apply([len, 0]));
      const w = Math.max(8, Math.min(20, Math.hypot(x1 - x0, y1 - y0) * 0.14));
      const nx = (-(y1 - y0) / Math.max(1, Math.hypot(x1 - x0, y1 - y0))) * w;
      const ny = ((x1 - x0) / Math.max(1, Math.hypot(x1 - x0, y1 - y0))) * w;
      const mx = x0 + (x1 - x0) * 0.2;
      const my = y0 + (y1 - y0) * 0.2;
      ctx.save();
      ctx.globalAlpha *= Math.min(1, g * 1.5);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(90, 143, 214, 0.8)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(mx + nx, my + ny);
      ctx.lineTo(x1, y1);
      ctx.lineTo(mx - nx, my - ny);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x0, y0, w * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}
