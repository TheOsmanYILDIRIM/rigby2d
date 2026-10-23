// SPDX-License-Identifier: MIT OR Apache-2.0
// The promo's scenes. Each is { id, duration, draw(ctx, S, t, cast) } with t in seconds from the
// scene's start; every cut lands on the 120 BPM grid (BEAT). Layouts adapt to landscape (16:9) and
// vertical (9:16) stages. The characters, their animations, the AutoRig result and the wave are
// real Rigby2D data drawn by Rigby2D's renderer.

import { BRAND, card, chip, clamp, easeBack, easeInOut, easeOut, headline, inOut, lerp, roundRect, span, text, typed } from './engine.js';

/** Landscape or vertical value. */
const pick = (S, land, vert) => (S.vertical ? vert : land);

/** A caption line under the action, in and out with the scene. */
function caption(ctx, S, str, t, start, end) {
  const k = inOut(t, start, end, 0.4, 0.35);
  if (k <= 0) return;
  const size = pick(S, 34, 40) * S.u;
  const y = pick(S, S.H * 0.93, S.H * 0.9);
  ctx.save();
  ctx.font = `600 ${size}px ${BRAND.font}`;
  const w = ctx.measureText(str).width + 48 * S.u;
  ctx.globalAlpha = k * 0.85;
  ctx.fillStyle = BRAND.bg0;
  roundRect(ctx, S.cx - w / 2, y - size * 1.05, w, size * 1.55, size * 0.775);
  ctx.fill();
  ctx.restore();
  text(ctx, str, S.cx, y, {
    size,
    weight: 600,
    color: BRAND.sub,
    align: 'center',
    alpha: k,
  });
}

/** The scene's tag chip and headline, top of the frame. */
function title(ctx, S, tag, line, t, end) {
  const y = pick(S, S.H * 0.12, S.H * 0.09);
  chip(ctx, S, tag, pick(S, S.W * 0.07, S.cx), y, t, 0.1, end, {
    align: pick(S, 'left', 'center'),
  });
  headline(ctx, S, line, pick(S, S.W * 0.07, S.cx), y + pick(S, 92, 108) * S.u, t, 0.3, end, { size: pick(S, 64, 70) * S.u, align: pick(S, 'left', 'center') });
}

// ---- 1 · intro --------------------------------------------------------------------------------

const intro = {
  id: 'intro',
  duration: 6,
  draw(ctx, S, t, cast) {
    const appear = easeBack(span(t, 0.1, 1.1));
    const out = 1 - easeOut(span(t, 5.5, 6));
    const h = pick(S, S.H * 0.66, S.H * 0.42) * (0.85 + 0.15 * appear);
    const placed = cast.place(pick(S, S.W * 0.32, S.cx), pick(S, S.H * 0.53, S.H * 0.36), h);
    cast.clear();
    cast.draw(cast.rigbytron, cast.pose(cast.rigbytron, 'hold', t), placed, [1, 1, 1, clamp(appear) * out]);
    cast.composite(ctx);
    const tx = pick(S, S.W * 0.56, S.cx);
    const align = pick(S, 'left', 'center');
    const y = pick(S, S.H * 0.47, S.H * 0.7);
    const k = easeOut(span(t, 1.0, 1.6)) * out;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.font = `800 ${pick(S, 150, 132) * S.u}px ${BRAND.font}`;
    const w = ctx.measureText('Rigby').width;
    const full = w + ctx.measureText('2D').width;
    const x0 = align === 'center' ? tx - full / 2 : tx;
    text(ctx, 'Rigby', x0, y + (1 - k) * 30 * S.u, {
      size: pick(S, 150, 132) * S.u,
      weight: 800,
    });
    text(ctx, '2D', x0 + w, y + (1 - k) * 30 * S.u, {
      size: pick(S, 150, 132) * S.u,
      weight: 800,
      color: BRAND.accent,
    });
    ctx.restore();
    headline(ctx, S, 'Open-source 2D skeletal animation', tx, y + pick(S, 80, 84) * S.u, t, 1.8, 5.8, { size: pick(S, 46, 44) * S.u, align, weight: 600, color: BRAND.sub });
    const chips = ['Games', 'Film', 'AI'];
    chips.forEach((c, i) => {
      const cx = align === 'center' ? S.cx + (i - 1) * 170 * S.u : tx + i * 170 * S.u + 70 * S.u;
      chip(ctx, S, c, cx, y + pick(S, 170, 180) * S.u, t, 2.8 + i * 0.25, 5.8, {
        color: [BRAND.accent, '#7a63d6', '#2f9f8f'][i],
        size: 30,
      });
    });
  },
};

// ---- 2 · AutoRig --------------------------------------------------------------------------------

const autorig = {
  id: 'autorig',
  duration: 12,
  draw(ctx, S, t, cast) {
    title(ctx, S, 'AutoRig', 'Layers in. Rig out.', t, 11.7);
    // The PSD: a layer list that the layers fly out of.
    const cw = pick(S, 400, 620) * S.u;
    const ch = pick(S, 540, 300) * S.u;
    const cx = pick(S, S.W * 0.07, S.cx - cw / 2);
    const cy = pick(S, S.H * 0.34, S.H * 0.19);
    const ck = inOut(t, 0.4, 7.2, 0.5, 0.5);
    const names = cast.layers.slots.map((s) => s.name);
    if (ck > 0) {
      const inner = card(ctx, S, cx, cy, cw, ch, ck, 'character.psd');
      const rows = pick(S, names.length, 4);
      names.slice(0, rows).forEach((n, i) => {
        const k = easeOut(span(t, 0.7 + i * 0.12, 1.1 + i * 0.12)) * ck;
        const ry = inner.y + (22 + i * pick(S, 46, 46)) * S.u;
        ctx.save();
        ctx.globalAlpha = k;
        ctx.fillStyle = 'rgba(143,182,236,0.12)';
        roundRect(ctx, inner.x + 18 * S.u, ry, inner.w - 36 * S.u, 36 * S.u, 6 * S.u);
        ctx.fill();
        ctx.restore();
        text(ctx, `▤  ${n}`, inner.x + 34 * S.u, ry + 25 * S.u, {
          size: 21 * S.u,
          weight: 600,
          color: BRAND.sub,
          alpha: k,
        });
      });
      if (!S.vertical) {
        const bx = inner.x + 18 * S.u;
        const by = inner.y + inner.h - 64 * S.u;
        const press = span(t, 4.4, 4.7);
        const pulse = 1 + 0.06 * Math.sin(t * 9) * span(t, 3.4, 4.4) * (1 - press);
        ctx.save();
        ctx.globalAlpha = ck * easeOut(span(t, 2.8, 3.2));
        ctx.translate(bx + (inner.w - 36 * S.u) / 2, by + 22 * S.u);
        ctx.scale(pulse * (1 - 0.05 * Math.sin(press * Math.PI)), pulse * (1 - 0.05 * Math.sin(press * Math.PI)));
        roundRect(ctx, -(inner.w - 36 * S.u) / 2, -22 * S.u, inner.w - 36 * S.u, 44 * S.u, 8 * S.u);
        ctx.fillStyle = BRAND.accent;
        ctx.fill();
        ctx.restore();
        text(ctx, 'Generate rig', bx + (inner.w - 36 * S.u) / 2, by + 30 * S.u, {
          size: 22 * S.u,
          weight: 700,
          align: 'center',
          alpha: ck * easeOut(span(t, 2.8, 3.2)),
        });
      }
    }
    // The character: layers fly in, bones grow through them, then it comes alive.
    const placed = cast.place(pick(S, S.W * 0.66, S.cx), pick(S, S.H * 0.56, S.H * 0.66), pick(S, S.H * 0.7, S.H * 0.5));
    const alive = span(t, 7.4, 7.8);
    if (alive < 1) {
      const n = cast.layers.slots.length;
      cast.drawLayers(ctx, placed, (i) => {
        const k = easeInOut(span(t, 1.4 + i * 0.18, 2.6 + i * 0.18));
        const from = [-(S.W * 0.45 + i * 30 * S.u), -S.H * 0.25 + (i - n / 2) * 40 * S.u];
        return {
          dx: from[0] * (1 - k),
          dy: from[1] * (1 - k),
          rot: (1 - k) * (i % 2 ? 25 : -25),
          alpha: clamp(k * 2) * (1 - alive),
          scale: lerp(0.6, 1, k),
        };
      });
    }
    // Procedural life once rigged: breathe, look around, wave the free arm.
    const life = Math.max(0, t - 7.6);
    const pose = cast.pose(cast.rigged);
    if (life > 0) {
      const bump = (name, deg) => {
        const i = cast.rigged.boneIndex(name);
        if (i !== null && i >= 0) pose.local[i].rotation += deg;
      };
      const k = easeOut(span(life, 0, 0.8));
      bump('chest', Math.sin(life * 2.4) * 5 * k);
      bump('head', Math.sin(life * 2.4 + 0.8) * 9 * k);
      bump('upperarm_l', Math.sin(life * 3.2) * 18 * k);
      bump('forearm_l', Math.sin(life * 3.2 + 1) * 22 * k);
      pose.updateWorld(cast.rigged);
    }
    if (alive > 0) {
      cast.clear();
      cast.draw(cast.rigged, pose, placed, [1, 1, 1, alive * (1 - easeOut(span(t, 11.6, 12)))]);
      cast.composite(ctx);
    }
    const boneK = inOut(t, 4.7, 9.2, 0.2, 0.9);
    if (boneK > 0) {
      ctx.save();
      ctx.globalAlpha = boneK;
      cast.drawBones(ctx, cast.rigged, pose, placed, (i, n) => easeOut(span(t, 4.7 + (i / n) * 2.2, 5.0 + (i / n) * 2.2)));
      ctx.restore();
    }
    caption(ctx, S, 'One click: bones, meshes and IK, from your layer names.', t, 7.8, 11.8);
  },
};

// ---- 3 · animate & retarget -------------------------------------------------------------------

function timelineCard(ctx, S, x, y, w, h, k, t, anim) {
  const inner = card(ctx, S, x, y, w, h, k, 'Timeline');
  if (k <= 0) return;
  const rows = ['hip · translate', 'chest · rotate', 'head · rotate', 'upperarm_r · rotate', 'forearm_r · rotate'];
  const labelW = 210 * S.u;
  const rowH = (inner.h - 20 * S.u) / rows.length;
  const dur = anim.duration;
  ctx.save();
  ctx.globalAlpha = k;
  rows.forEach((r, i) => {
    const ry = inner.y + 10 * S.u + i * rowH;
    if (i % 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(inner.x, ry, inner.w, rowH);
    }
    text(ctx, r, inner.x + 18 * S.u, ry + rowH / 2 + 7 * S.u, {
      size: 18 * S.u,
      weight: 600,
      color: BRAND.weak,
    });
    const keys = [0, 0.18, 0.37, 0.55, 0.8, 1].filter((_, j) => (i + j) % 2 === 0 || j === 0 || j === 5);
    keys.forEach((f) => {
      const kx = inner.x + labelW + f * (inner.w - labelW - 24 * S.u);
      const ky = ry + rowH / 2;
      const r = 7 * S.u;
      ctx.fillStyle = '#7ee08a';
      ctx.beginPath();
      ctx.moveTo(kx, ky - r);
      ctx.lineTo(kx + r, ky);
      ctx.lineTo(kx, ky + r);
      ctx.lineTo(kx - r, ky);
      ctx.closePath();
      ctx.fill();
    });
  });
  const px = inner.x + labelW + ((t % dur) / dur) * (inner.w - labelW - 24 * S.u);
  ctx.fillStyle = '#e0605a';
  ctx.fillRect(px - 1.5 * S.u, inner.y, 3 * S.u, inner.h);
  ctx.restore();
}

const animate = {
  id: 'animate',
  duration: 12,
  draw(ctx, S, t, cast) {
    title(ctx, S, 'Animate', 'Keys, curves and IK', t, 5.9);
    title(ctx, S, 'Retarget', 'One animation, every character', t - 6, 5.7);
    const doc = cast.rigbytron;
    const anim = doc.animations.find((a) => a.name === 'release');
    const second = easeOut(span(t, 6.2, 7.2));
    const h = pick(S, S.H * 0.52, S.H * 0.36);
    const k = inOut(t, 0.2, 12, 0.5, 0.4);
    const p1 = cast.place(lerp(pick(S, S.cx, S.cx), pick(S, S.W * 0.33, S.W * 0.3), second), pick(S, S.H * 0.47, S.H * 0.44), h);
    cast.clear();
    cast.draw(doc, cast.pose(doc, 'release', t), p1, [1, 1, 1, k]);
    if (second > 0) {
      // The same animation, retargeted onto a bigger, warmer cousin.
      const p2 = cast.place(lerp(S.W * 1.2, pick(S, S.W * 0.68, S.W * 0.72), second), pick(S, S.H * 0.44, S.H * 0.42), h * 1.25);
      cast.draw(doc, cast.pose(doc, 'release', t + 0.25), p2, [1, 0.78, 0.55, k]);
    }
    cast.composite(ctx);
    const tk = inOut(t, 0.6, 12, 0.5, 0.4);
    timelineCard(ctx, S, pick(S, S.W * 0.08, S.W * 0.05), pick(S, S.H * 0.7, S.H * 0.66), pick(S, S.W * 0.84, S.W * 0.9), pick(S, S.H * 0.2, S.H * 0.17), tk, t, anim);
  },
};

// ---- 4 · film ----------------------------------------------------------------------------------

const film = {
  id: 'film',
  duration: 12,
  draw(ctx, S, t, cast) {
    title(ctx, S, 'Film', 'Made for film and video', t, 11.7);
    const push = easeInOut(span(t, 1.2, 6.5));
    const h = lerp(pick(S, S.H * 0.6, S.H * 0.44), pick(S, S.H * 0.98, S.H * 0.66), push);
    const sy = lerp(pick(S, S.H * 0.54, S.H * 0.5), pick(S, S.H * 0.7, S.H * 0.6), push);
    const k = inOut(t, 0.2, 12, 0.5, 0.4);
    // Lip-sync: a speech envelope drives the head (as the editor keys a mouth control from audio).
    const env = (x) => Math.max(0, Math.sin(x * 9.3) * 0.6 + Math.sin(x * 23.1) * 0.4) * (Math.sin(x * 1.7) > -0.2 ? 1 : 0.15);
    const pose = cast.pose(cast.rigbytron, 'hold', t);
    const head = cast.rigbytron.boneIndex('head');
    pose.local[head].rotation += env(t) * 7 * span(t, 6.5, 7);
    pose.updateWorld(cast.rigbytron);
    const placed = cast.place(pick(S, S.W * 0.6, S.cx), sy, h);
    cast.clear();
    cast.draw(cast.rigbytron, pose, placed, [1, 1, 1, k]);
    cast.composite(ctx);
    // The output frame and recording overlay.
    const fk = inOut(t, 0.8, 11.8, 0.4, 0.4);
    const fw = pick(S, S.W * 0.5, S.W * 0.8);
    const fh = S.vertical ? fw * (16 / 9) * 0.62 : fw * (9 / 16);
    const fx = pick(S, S.W * 0.6, S.cx) - fw / 2;
    const fy = pick(S, S.H * 0.25, S.H * 0.24);
    ctx.save();
    ctx.globalAlpha = fk;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3 * S.u;
    const c = 34 * S.u;
    for (const [x, y, dx, dy] of [
      [fx, fy, 1, 1],
      [fx + fw, fy, -1, 1],
      [fx, fy + fh, 1, -1],
      [fx + fw, fy + fh, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * c, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * c);
      ctx.stroke();
    }
    const frames = Math.floor(t * 24);
    const tc = `00:00:${String(Math.floor(frames / 24)).padStart(2, '0')}:${String(frames % 24).padStart(2, '0')}`;
    ctx.fillStyle = '#e0605a';
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.beginPath();
      ctx.arc(fx + 22 * S.u, fy + 26 * S.u, 7 * S.u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    text(ctx, `REC  ${tc}`, fx + 38 * S.u, fy + 33 * S.u, {
      size: 20 * S.u,
      weight: 700,
      font: BRAND.mono,
      alpha: fk,
    });
    text(ctx, '1920 × 1080 · 24 fps', fx + fw - 14 * S.u, fy + fh - 14 * S.u, {
      size: 18 * S.u,
      weight: 600,
      color: BRAND.sub,
      align: 'right',
      font: BRAND.mono,
      alpha: fk,
    });
    // The audio track, left.
    const wk = inOut(t, 6.2, 11.8, 0.4, 0.4);
    if (wk > 0) {
      const wx = pick(S, S.W * 0.07, S.W * 0.08);
      const wy = pick(S, S.H * 0.52, S.H * 0.79);
      const ww = pick(S, S.W * 0.24, S.W * 0.84);
      const inner = card(ctx, S, wx, wy - 70 * S.u, ww, 150 * S.u, wk, 'dialogue.wav');
      ctx.save();
      ctx.globalAlpha = wk;
      const bars = 36;
      for (let i = 0; i < bars; i++) {
        const v = env(t - 1.2 + i * 0.05);
        const bh = (8 + v * 70) * S.u;
        ctx.fillStyle = i === Math.floor(bars * 0.33) ? '#e0605a' : BRAND.accentHi;
        ctx.fillRect(inner.x + 16 * S.u + (i * (inner.w - 32 * S.u)) / bars, inner.y + inner.h / 2 - bh / 2, Math.max(2, (inner.w - 32 * S.u) / bars - 3 * S.u), bh);
      }
      ctx.restore();
    }
    ['MP4', 'WebM', 'PNG'].forEach((f, i) =>
      chip(ctx, S, f, pick(S, S.W * 0.07 + i * 130 * S.u + 52 * S.u, S.cx + (i - 1) * 150 * S.u), pick(S, S.H * 0.74, S.H * 0.73), t, 7.6 + i * 0.25, 11.7, {
        color: ['#2f9f8f', '#7a63d6', BRAND.accent][i],
      }),
    );
    caption(ctx, S, 'Camera moves, lip-sync, and renders with sound.', t, 7.2, 11.8);
  },
};

// ---- 5 · games ---------------------------------------------------------------------------------

const games = {
  id: 'games',
  duration: 10,
  draw(ctx, S, t, cast) {
    title(ctx, S, 'Games', 'Straight into your game', t, 9.7);
    const k = inOut(t, 0.3, 9.8, 0.5, 0.4);
    const gw = pick(S, S.W * 0.48, S.W * 0.88);
    const gh = pick(S, S.H * 0.56, S.H * 0.38);
    const gx = pick(S, S.W * 0.07, S.W * 0.06);
    const gy = pick(S, S.H * 0.3, S.H * 0.22);
    const inner = card(ctx, S, gx, gy, gw, gh, k, 'Godot 4  ·  RigbySkeleton2D');
    if (k > 0) {
      ctx.save();
      ctx.globalAlpha = k;
      const g = ctx.createLinearGradient(0, inner.y, 0, inner.y + inner.h);
      g.addColorStop(0, '#2b4c7e');
      g.addColorStop(1, '#16253f');
      ctx.fillStyle = g;
      ctx.fillRect(inner.x + 8 * S.u, inner.y + 6 * S.u, inner.w - 16 * S.u, inner.h - 14 * S.u);
      ctx.fillStyle = '#1d3a2a';
      ctx.fillRect(inner.x + 8 * S.u, inner.y + inner.h * 0.82, inner.w - 16 * S.u, inner.h * 0.18 - 8 * S.u);
      // Scrolling ground marks, so the character looks like it moves through a level.
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 12; i++)
        ctx.fillRect(inner.x + ((((i * 90 * S.u - t * 160 * S.u) % (inner.w + 90 * S.u)) + inner.w + 90 * S.u) % (inner.w + 90 * S.u)), inner.y + inner.h * 0.86, 40 * S.u, 4 * S.u);
      ctx.restore();
      const placed = cast.place(inner.x + inner.w * 0.5, inner.y + inner.h * 0.5, inner.h * 0.78);
      cast.clear();
      cast.draw(cast.rigbytron, cast.pose(cast.rigbytron, 'release', t), placed, [1, 1, 1, k]);
      cast.composite(ctx);
    }
    const ck = inOut(t, 1.6, 9.8, 0.5, 0.4);
    const cw = pick(S, S.W * 0.34, S.W * 0.88);
    const code = card(ctx, S, pick(S, S.W * 0.59, S.W * 0.06), pick(S, S.H * 0.38, S.H * 0.64), cw, pick(S, S.H * 0.3, S.H * 0.16), ck, 'player.gd');
    if (ck > 0) {
      const lines = ['var rig = $RigbySkeleton2D', 'rig.play("release", true)', 'rig.animation_event.connect(_on_event)'];
      let at = 2.1;
      lines.forEach((l, i) => {
        typed(ctx, l, code.x + 22 * S.u, code.y + (42 + i * 40) * S.u, t, at, {
          size: 22 * S.u,
          weight: 500,
          font: BRAND.mono,
          color: i === 1 ? BRAND.accentHi : BRAND.sub,
          alpha: ck,
          cps: 34,
        });
        at += l.length / 34 + 0.2;
      });
    }
    caption(ctx, S, 'Export JSON or .skel with an atlas. Fast Rust runtime for Godot 4.', t, 4.6, 9.8);
  },
};

// ---- 6 · AI and scripting ---------------------------------------------------------------------

function bubble(ctx, S, x, y, w, str, k, mine, extra = null) {
  if (k <= 0) return 0;
  ctx.save();
  ctx.font = `500 ${24 * S.u}px ${BRAND.font}`;
  // Wrap to the bubble width.
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(tryLine).width > w - 44 * S.u && line) {
      lines.push(line);
      line = word;
    } else line = tryLine;
  }
  lines.push(line);
  const h = (28 + lines.length * 34 + (extra ? 46 : 0)) * S.u;
  ctx.globalAlpha = k;
  ctx.translate(0, (1 - k) * 20 * S.u);
  roundRect(ctx, x, y, w, h, 18 * S.u);
  ctx.fillStyle = mine ? BRAND.accent : 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.fillStyle = '#fff';
  lines.forEach((l, i) => ctx.fillText(l, x + 22 * S.u, y + (40 + i * 34) * S.u));
  if (extra) {
    ctx.font = `700 ${18 * S.u}px ${BRAND.mono}`;
    const ew = ctx.measureText(extra).width + 26 * S.u;
    roundRect(ctx, x + 22 * S.u, y + h - 50 * S.u, ew, 32 * S.u, 16 * S.u);
    ctx.fillStyle = 'rgba(126,224,138,0.18)';
    ctx.fill();
    ctx.fillStyle = BRAND.good;
    ctx.fillText(extra, x + 35 * S.u, y + h - 28 * S.u);
  }
  ctx.restore();
  return h;
}

const ai = {
  id: 'ai',
  duration: 12,
  draw(ctx, S, t, cast) {
    title(ctx, S, 'AI', 'Ask Claude to animate', t, 6.6);
    title(ctx, S, 'Python', 'Make your own tools', t - 6.8, 5);
    const k = inOut(t, 0.3, 11.8, 0.5, 0.4);
    const cw = pick(S, S.W * 0.42, S.W * 0.88);
    const chat = card(ctx, S, pick(S, S.W * 0.07, S.W * 0.06), pick(S, S.H * 0.3, S.H * 0.6), cw, pick(S, S.H * 0.5, S.H * 0.3), inOut(t, 0.3, 6.9, 0.5, 0.4), 'Claude');
    const prompt = 'Add a wave animation to rigbytron.rigby';
    const typedK = clamp((t - 0.9) * 22, 0, prompt.length);
    if (t > 0.9) bubble(ctx, S, chat.x + chat.w * 0.18, chat.y + 20 * S.u, chat.w * 0.78, prompt.slice(0, Math.floor(typedK)), inOut(t, 0.9, 6.9, 0.3, 0.4), true);
    bubble(
      ctx,
      S,
      chat.x + 20 * S.u,
      chat.y + pick(S, 150, 140) * S.u,
      chat.w * 0.82,
      "Done: added 'wave' to rigbytron.rigby, 14 keys in one call.",
      inOut(t, 3.4, 6.9, 0.4, 0.4),
      false,
      '✓ batch_edit',
    );
    // The character waves once the assistant has made the animation.
    const placed = cast.place(pick(S, S.W * 0.72, S.cx), pick(S, S.H * 0.55, S.H * 0.38), pick(S, S.H * 0.66, S.H * 0.33));
    const waving = t > 3.8;
    cast.clear();
    cast.draw(cast.rigbytron, cast.pose(cast.rigbytron, waving ? 'wave' : 'hold', waving ? t - 3.8 : t), placed, [1, 1, 1, k]);
    cast.composite(ctx);
    // Python: a custom tool in the Scripts menu.
    const pk = inOut(t, 7, 11.8, 0.5, 0.4);
    const code = card(ctx, S, pick(S, S.W * 0.07, S.W * 0.06), pick(S, S.H * 0.32, S.H * 0.62), cw, pick(S, S.H * 0.42, S.H * 0.25), pk, 'mirror.py');
    if (pk > 0) {
      const lines = [
        'import rigby',
        '',
        '@rigby.tool("Mirror pose")',
        'def mirror():',
        '    for bone in rigby.selected_bones():',
        '        bone.x = -bone.x',
        '        bone.rotation = 180 - bone.rotation',
      ];
      let at = 7.4;
      lines.forEach((l, i) => {
        typed(ctx, l, code.x + 22 * S.u, code.y + (44 + i * 38) * S.u, t, at, {
          size: 22 * S.u,
          weight: 500,
          font: BRAND.mono,
          color: l.startsWith('@') ? BRAND.warm : BRAND.sub,
          alpha: pk,
          cps: 40,
        });
        at += l.length / 40 + 0.08;
      });
    }
    caption(ctx, S, 'Built-in MCP server and Python scripting.', t, 7.6, 11.8);
  },
};

// ---- 7 · end card -----------------------------------------------------------------------------

const end = {
  id: 'end',
  duration: 11,
  draw(ctx, S, t, cast) {
    const k = easeOut(span(t, 0.2, 0.9));
    const placed = cast.place(pick(S, S.W * 0.26, S.cx), pick(S, S.H * 0.52, S.H * 0.3), pick(S, S.H * 0.6, S.H * 0.36));
    cast.clear();
    cast.draw(cast.rigbytron, cast.pose(cast.rigbytron, t > 1 ? 'wave' : 'hold', Math.max(0, t - 1)), placed, [1, 1, 1, k]);
    cast.composite(ctx);
    const x = pick(S, S.W * 0.48, S.cx);
    const align = pick(S, 'left', 'center');
    const y = pick(S, S.H * 0.36, S.H * 0.58);
    const big = pick(S, 120, 112) * S.u;
    ctx.save();
    ctx.font = `800 ${big}px ${BRAND.font}`;
    const w = ctx.measureText('Rigby').width;
    const full = w + ctx.measureText('2D').width;
    ctx.restore();
    const x0 = align === 'center' ? x - full / 2 : x;
    text(ctx, 'Rigby', x0, y, { size: big, weight: 800, alpha: k });
    text(ctx, '2D', x0 + w, y, {
      size: big,
      weight: 800,
      color: BRAND.accent,
      alpha: k,
    });
    text(ctx, 'by Hoverlabs', align === 'center' ? x : x0 + 4 * S.u, y + 48 * S.u, {
      size: 26 * S.u,
      weight: 600,
      color: BRAND.weak,
      align,
      alpha: easeOut(span(t, 0.6, 1.2)),
    });
    headline(ctx, S, 'Free and open source', x, y + 130 * S.u, t, 1.0, 99, {
      size: 54 * S.u,
      align,
      weight: 700,
    });
    headline(ctx, S, 'Games · Film · AI · Python', x, y + 196 * S.u, t, 1.5, 99, { size: 34 * S.u, align, weight: 600, color: BRAND.sub });
    // The download link, in a pill.
    const pk = easeBack(span(t, 2.4, 2.9));
    if (pk > 0) {
      const url = 'github.com/jaisurya-dev-art/rigby2d';
      ctx.save();
      ctx.font = `700 ${30 * S.u}px ${BRAND.font}`;
      const pw = ctx.measureText(url).width + 60 * S.u;
      const ph = 64 * S.u;
      const px = align === 'center' ? x - pw / 2 : x;
      const py = y + 250 * S.u;
      ctx.globalAlpha = clamp(pk);
      ctx.translate(px + pw / 2, py + ph / 2);
      ctx.scale(pk, pk);
      roundRect(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
      ctx.fillStyle = BRAND.accent;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(url, 0, 2 * S.u);
      ctx.restore();
    }
    text(ctx, 'Windows  ·  MIT or Apache-2.0  ·  Made with Rigby2D', align === 'center' ? x : x0 + 4 * S.u, y + 370 * S.u, {
      size: 22 * S.u,
      weight: 600,
      color: BRAND.weak,
      align,
      alpha: easeOut(span(t, 3.2, 3.8)),
    });
  },
};

export const SCENES = { intro, autorig, animate, film, games, ai, end };

/**
 * The cuts: lists of { scene, from, to } segments (seconds within the scene), played back to back.
 * The teaser reuses the overview's scenes, so both stay in step when a scene changes.
 */
export const CUTS = {
  overview: {
    width: 1920,
    height: 1080,
    segments: ['intro', 'autorig', 'animate', 'film', 'games', 'ai', 'end'].map((id) => ({ scene: id, from: 0, to: SCENES[id].duration })),
  },
  teaser: {
    width: 1920,
    height: 1080,
    segments: [
      { scene: 'intro', from: 0, to: 5 },
      { scene: 'autorig', from: 1.5, to: 10.5 },
      { scene: 'animate', from: 0, to: 5.5 },
      { scene: 'ai', from: 0.5, to: 6 },
      { scene: 'end', from: 0, to: 5 },
    ],
  },
};
CUTS.short = { width: 1080, height: 1920, segments: CUTS.teaser.segments };

/** Length of a cut in seconds. */
export const cutLength = (cut) => cut.segments.reduce((s, g) => s + (g.to - g.from), 0);
