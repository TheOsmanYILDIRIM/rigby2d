// SPDX-License-Identifier: MIT
// Bottom panel: animation list, transport controls and the dopesheet.

import { Animation, CHANNELS, resort } from '../core/animation.js';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, LINEAR, STEPPED, cloneCurve, isBezier } from '../core/curve.js';
import { uniqueName } from '../core/model.js';
import { FPS, Mode, keyEquals, selBone, selSlot, snap } from './app.js';
import * as edit from './edit.js';
import { dragValue, h, popupMenu, select, textField } from './widgets.js';

const GUTTER = 170;
const ROW = 20;
const RULER = 22;

/** Transport and animation controls (rebuilt when the app changes). */
export function renderControls(app, el) {
  const anim = app.currentAnimation();
  const names = app.doc.animations.map((a, i) => [i, a.name]);
  const play = h('button', { disabled: app.anim === null, title: 'Play / pause (Space)', onclick: () => app.togglePlay() }, app.playing ? '⏸' : '▶');
  el.replaceChildren(
    ...[
      names.length
        ? select(names, app.anim ?? 0, (i) => {
            app.anim = i;
            app.time = 0;
            app.selectedKey = null;
            app.changed();
          })
        : h('span', { class: 'weak' }, '(no animation)'),
      h(
        'button',
        {
          onclick: () => {
            app.doc.animations.push(new Animation(uniqueName('animation', (n) => app.doc.animations.some((a) => a.name === n)), 1));
            app.anim = app.doc.animations.length - 1;
            app.mode = Mode.Animate;
            app.time = 0;
            app.changed();
          },
        },
        '＋ New',
      ),
      anim
        ? [
            textField(
              anim.name,
              (v) => {
                anim.name = v;
                app.changed();
              },
              { width: '110px' },
            ),
            h('span', null, 'Length'),
            dragValue(
              anim.duration,
              (v) => {
                anim.duration = v;
                app.changed();
              },
              { speed: 0.01, min: 1 / FPS, max: 600, suffix: ' s', decimals: 2 },
            ),
            h(
              'button',
              {
                title: 'Delete animation',
                onclick: () => {
                  app.doc.animations.splice(app.anim, 1);
                  app.anim = app.doc.animations.length ? 0 : null;
                  app.selectedKey = null;
                  app.changed();
                },
              },
              '🗑',
            ),
          ]
        : null,
      h('span', { class: 'vsep' }),
      h(
        'button',
        {
          title: 'Go to start',
          onclick: () => {
            app.time = 0;
            app.playing = false;
            app.changed();
          },
        },
        '⏮',
      ),
      h('button', { title: 'Previous frame (←)', onclick: () => app.stepFrame(-1) }, '◀'),
      play,
      h('button', { title: 'Next frame (→)', onclick: () => app.stepFrame(1) }, '▶|'),
      h(
        'label',
        null,
        h('input', {
          type: 'checkbox',
          checked: app.looping,
          onchange: (e) => {
            app.looping = e.target.checked;
            app.changed();
          },
        }),
        ' Loop',
      ),
      h('span', { class: 'mono' }, `frame ${String(Math.round(app.time * FPS)).padStart(3, ' ')}  ${app.time.toFixed(2)}s`),
      h('span', { class: 'vsep' }),
      h('button', { disabled: app.mode !== Mode.Animate, onclick: () => edit.keySelection(app) }, '◆ Key (K)'),
    ]
      .flat()
      .filter(Boolean),
  );
}

/** Rows of the dopesheet for the current animation: [{ track, label }]. */
function tracks(app, anim) {
  const out = [];
  for (const tl of anim.bones) {
    const name = app.doc.bones[tl.bone]?.name ?? `#${tl.bone}`;
    for (const channel of CHANNELS) {
      if (tl[channel].length) out.push({ track: { bone: tl.bone, channel }, label: `${name} · ${channel}` });
    }
  }
  for (const tl of anim.slots) {
    if (tl.attachment.length) out.push({ track: { slot: tl.slot }, label: `${app.doc.slots[tl.slot]?.name ?? `#${tl.slot}`} · image` });
  }
  return out;
}

function trackKeys(anim, track) {
  if (track.slot !== undefined) return anim.slotTimeline(track.slot)?.attachment;
  return anim.boneTimeline(track.bone)?.[track.channel];
}

/** Applies `f(key)` to one key, re-sorting afterwards. Returns the key's new index. */
function withKey(anim, key, f) {
  const keys = trackKeys(anim, key.track);
  const k = keys?.[key.index];
  if (!k) return null;
  f(k);
  return resort(keys, key.index);
}

export function deleteSelectedKey(app) {
  const key = app.selectedKey;
  app.selectedKey = null;
  const anim = app.currentAnimation();
  if (!key || !anim) return;
  const keys = trackKeys(anim, key.track);
  if (keys && key.index < keys.length) keys.splice(key.index, 1);
  anim.prune();
  app.changed();
}

function keyFill(selected, curve) {
  if (selected) return 'rgb(255,190,60)';
  if (curve === STEPPED) return 'rgb(200,120,255)';
  if (isBezier(curve)) return 'rgb(120,220,140)';
  return 'rgb(230,230,230)';
}

export class Dopesheet {
  constructor(app, scroller, canvas) {
    this.app = app;
    this.scroller = scroller;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.keyRects = [];
    this.layout = null;
    this.press = null;
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', () => (this.press = null));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  draw() {
    const app = this.app;
    const anim = app.currentAnimation();
    const empty = this.scroller.parentElement.querySelector('.empty');
    empty.hidden = !!anim;
    this.scroller.hidden = !anim;
    if (!anim) return;

    const rows = tracks(app, anim);
    const duration = Math.max(anim.duration, 1 / FPS);
    const width = Math.max(1, this.scroller.clientWidth);
    const height = Math.max(RULER + Math.max(rows.length, 1) * ROW + 6, this.scroller.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgb(30,30,30)';
    ctx.fillRect(0, 0, width, height);

    const trackLeft = GUTTER;
    const trackW = Math.max(10, width - 12 - trackLeft);
    const timeToX = (t) => trackLeft + (t / duration) * trackW;
    this.layout = { trackLeft, trackW, duration };

    // Ruler with frame ticks.
    ctx.fillStyle = 'rgb(45,45,45)';
    ctx.fillRect(0, 0, width, RULER);
    const frames = Math.round(duration * FPS);
    const pxPerFrame = trackW / (duration * FPS);
    const labelEvery = [1, 2, 5, 10, 15, 30, 60].find((n) => n * pxPerFrame >= 34) ?? 120;
    ctx.strokeStyle = 'rgb(120,120,120)';
    ctx.lineWidth = 1;
    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgb(170,170,170)';
    ctx.beginPath();
    for (let f = 0; f <= frames; f++) {
      const x = Math.round(timeToX(f / FPS)) + 0.5;
      const major = f % labelEvery === 0;
      if (major || pxPerFrame >= 5) {
        ctx.moveTo(x, RULER - (major ? 10 : 5));
        ctx.lineTo(x, RULER);
      }
      if (major) ctx.fillText(String(f), x + 2, 2);
    }
    ctx.stroke();

    // Rows.
    const selectedBone = selBone(app.sel);
    const selectedSlot = selSlot(app.sel);
    this.keyRects = [];
    rows.forEach(({ track, label }, r) => {
      const y = RULER + r * ROW;
      const highlight = (track.bone !== undefined && track.bone === selectedBone) || (track.slot !== undefined && track.slot === selectedSlot);
      if (r % 2 === 1 || highlight) {
        ctx.fillStyle = highlight ? 'rgb(55,50,40)' : 'rgb(34,34,34)';
        ctx.fillRect(0, y, width, ROW);
      }
      ctx.font = '12px system-ui, "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgb(200,200,200)';
      ctx.fillText(label, 8, y + ROW / 2, GUTTER - 14);
      (trackKeys(anim, track) ?? []).forEach((k, index) => {
        const c = [timeToX(k.time), y + ROW / 2];
        const key = { track, index };
        diamond(ctx, c, 5.5, keyFill(keyEquals(app.selectedKey, key), k.curve));
        this.keyRects.push({ x0: c[0] - 6, x1: c[0] + 6, y0: c[1] - 7, y1: c[1] + 7, key, time: k.time });
      });
    });
    ctx.strokeStyle = 'rgb(60,60,60)';
    ctx.beginPath();
    ctx.moveTo(trackLeft + 0.5, 0);
    ctx.lineTo(trackLeft + 0.5, height);
    ctx.stroke();

    // Time cursor.
    const cx = timeToX(Math.min(app.time, duration));
    ctx.strokeStyle = 'rgb(255,90,70)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.stroke();
  }

  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  hit(p) {
    return this.keyRects.find((k) => p[0] >= k.x0 && p[0] <= k.x1 && p[1] >= k.y0 && p[1] <= k.y1) ?? null;
  }

  xToTime(x) {
    const { trackLeft, trackW, duration } = this.layout;
    return Math.min(duration, Math.max(0, ((x - trackLeft) / trackW) * duration));
  }

  onPointerDown(e) {
    if (!this.layout) return;
    const app = this.app;
    const p = this.pos(e);
    if (e.button === 2) {
      const hit = this.hit(p);
      if (hit) {
        app.selectedKey = hit.key;
        app.time = hit.time;
        app.changed();
      }
      if (app.selectedKey) this.contextMenu(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.press = { pos: p, started: false, onKey: false };
  }

  onPointerMove(e) {
    if (!this.press || !(e.buttons & 1)) return;
    const app = this.app;
    const p = this.pos(e);
    if (!this.press.started) {
      if (Math.hypot(p[0] - this.press.pos[0], p[1] - this.press.pos[1]) <= 3) return;
      // Remember whether this drag started on a key; the key moves away from the press point.
      const hit = this.hit(this.press.pos);
      this.press.started = true;
      this.press.onKey = !!hit;
      app.selectedKey = hit ? hit.key : null;
    }
    app.playing = false;
    app.mode = Mode.Animate;
    const t = snap(this.xToTime(p[0]));
    const anim = app.currentAnimation();
    if (this.press.onKey && app.selectedKey && anim) {
      const idx = withKey(anim, app.selectedKey, (k) => (k.time = t));
      if (idx !== null) app.selectedKey = { track: app.selectedKey.track, index: idx };
    }
    app.time = t;
    app.changed();
  }

  onPointerUp(e) {
    if (e.button !== 0 || !this.press) return;
    const app = this.app;
    if (!this.press.started) {
      const p = this.press.pos;
      const hit = this.hit(p);
      if (hit) {
        app.selectedKey = hit.key;
        app.time = hit.time;
      } else {
        app.selectedKey = null;
        app.time = snap(this.xToTime(p[0]));
      }
      app.playing = false;
      app.mode = Mode.Animate;
      app.changed();
    }
    this.press = null;
  }

  contextMenu(x, y) {
    const app = this.app;
    const setCurve = (curve) => () => {
      const anim = app.currentAnimation();
      if (anim && app.selectedKey) withKey(anim, app.selectedKey, (k) => (k.curve = cloneCurve(curve)));
      app.changed();
    };
    popupMenu(x, y, [
      { label: 'Linear', action: setCurve(LINEAR) },
      { label: 'Ease in-out', action: setCurve(EASE_IN_OUT) },
      { label: 'Ease in', action: setCurve(EASE_IN) },
      { label: 'Ease out', action: setCurve(EASE_OUT) },
      { label: 'Stepped', action: setCurve(STEPPED) },
      'separator',
      { label: 'Delete key', action: () => deleteSelectedKey(app) },
    ]);
  }
}

function diamond(ctx, c, r, fill) {
  ctx.beginPath();
  ctx.moveTo(c[0], c[1] - r);
  ctx.lineTo(c[0] + r, c[1]);
  ctx.lineTo(c[0], c[1] + r);
  ctx.lineTo(c[0] - r, c[1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();
}

