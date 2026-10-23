// SPDX-License-Identifier: MIT OR Apache-2.0
// Promo video engine: brand palette, easing, layout that adapts to 16:9 or 9:16, and drawing
// helpers for kinetic type, cards and chips. Scenes (scenes.js) are pure functions of time, so any
// frame can be rendered in any order and every render is identical.

export const BRAND = {
  bg0: '#08101f',
  bg1: '#11234a',
  accent: '#5a8fd6',
  accentHi: '#8fb6ec',
  text: '#ffffff',
  sub: '#b8cdf0',
  weak: '#7f93b8',
  card: 'rgba(16, 28, 54, 0.92)',
  cardLine: 'rgba(143, 182, 236, 0.22)',
  good: '#7ee08a',
  warm: '#f2b45a',
  font: "'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif",
  mono: "'Cascadia Mono', 'Consolas', ui-monospace, monospace",
};

/** Music grid: 120 BPM, a beat every half second, so cuts land on the beat of most tracks. */
export const BEAT = 0.5;

// ---- easing -----------------------------------------------------------------------------------

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** 0 → 1 as t goes from a to b. */
export const span = (t, a, b) => clamp((t - a) / (b - a));
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const easeInOut = (t) => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** A small overshoot, for things that pop in. */
export const easeBack = (t) => {
  t = clamp(t);
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
/** In over `inDur` from `a`, out over `outDur` ending at `b`: 0..1..0. */
export const inOut = (t, a, b, inDur = 0.4, outDur = 0.4) => Math.min(easeOut(span(t, a, a + inDur)), 1 - easeIn(span(t, b - outDur, b)));

// ---- layout -----------------------------------------------------------------------------------

/**
 * The stage: canvas size and a unit `u` (1 at 1080 px on the short side), plus whether the frame
 * is vertical (9:16 Shorts), so scenes place things for either shape.
 */
export function stage(width, height) {
  const vertical = height > width;
  return {
    W: width,
    H: height,
    u: Math.min(width, height) / 1080,
    vertical,
    cx: width / 2,
    cy: height / 2,
  };
}

// ---- drawing ----------------------------------------------------------------------------------

export function background(ctx, S, t) {
  const g = ctx.createLinearGradient(0, 0, S.W * 0.6, S.H);
  g.addColorStop(0, BRAND.bg1);
  g.addColorStop(1, BRAND.bg0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S.W, S.H);
  // A slow drifting dot grid gives depth without distracting.
  const step = 36 * S.u;
  const ox = (t * 6 * S.u) % step;
  ctx.fillStyle = 'rgba(143, 182, 236, 0.07)';
  for (let y = -step; y < S.H + step; y += step) for (let x = -step; x < S.W + step; x += step) ctx.fillRect(x + ox, y + ox * 0.5, 2 * S.u, 2 * S.u);
  // Soft glow behind the centre.
  const r = ctx.createRadialGradient(S.cx, S.cy, 0, S.cx, S.cy, Math.max(S.W, S.H) * 0.55);
  r.addColorStop(0, 'rgba(90, 143, 214, 0.16)');
  r.addColorStop(1, 'rgba(90, 143, 214, 0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, S.W, S.H);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A UI card with a title bar (three dots and a title), faded/slid by `k` (0..1). */
export function card(ctx, S, x, y, w, h, k, title = '') {
  ctx.save();
  ctx.globalAlpha *= k;
  ctx.translate(0, (1 - k) * 30 * S.u);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 40 * S.u;
  ctx.shadowOffsetY = 12 * S.u;
  roundRect(ctx, x, y, w, h, 16 * S.u);
  ctx.fillStyle = BRAND.card;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.5 * S.u;
  ctx.strokeStyle = BRAND.cardLine;
  ctx.stroke();
  const bar = 38 * S.u;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  roundRect(ctx, x, y, w, bar, 16 * S.u);
  ctx.fill();
  ['#e0605a', '#e2b04a', '#5cc06a'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + (20 + i * 18) * S.u, y + bar / 2, 5.5 * S.u, 0, Math.PI * 2);
    ctx.fill();
  });
  if (title)
    text(ctx, title, x + w / 2, y + bar / 2 + 1 * S.u, {
      size: 15 * S.u,
      color: BRAND.weak,
      weight: 600,
      align: 'center',
      base: 'middle',
    });
  ctx.restore();
  return { x, y: y + bar, w, h: h - bar, k };
}

export function text(ctx, str, x, y, { size = 40, weight = 700, color = BRAND.text, align = 'left', base = 'alphabetic', font = BRAND.font, alpha = 1, spacing = 0 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/**
 * Kinetic headline: words rise and fade in one after another from `start`, and leave together at
 * `end`. Returns the drawn width.
 */
export function headline(ctx, S, str, x, y, t, start, end, { size = 84, color = BRAND.text, align = 'center', weight = 800, stagger = 0.07 } = {}) {
  const words = str.split(' ');
  ctx.save();
  ctx.font = `${weight} ${size}px ${BRAND.font}`;
  const widths = words.map((w) => ctx.measureText(`${w} `).width);
  const total = widths.reduce((a, b) => a + b, 0) - ctx.measureText(' ').width;
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const out = 1 - easeIn(span(t, end - 0.35, end));
  words.forEach((w, i) => {
    const k = easeOut(span(t, start + i * stagger, start + i * stagger + 0.45));
    ctx.globalAlpha = k * out;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(w, cursor, y + (1 - k) * size * 0.45);
    cursor += widths[i];
  });
  ctx.restore();
  return total;
}

/** A rounded label chip ("AutoRig", "Film", …) that pops in at `start`. */
export function chip(ctx, S, label, x, y, t, start, end, { color = BRAND.accent, size = 26, align = 'center' } = {}) {
  const k = easeBack(span(t, start, start + 0.4)) * (1 - easeIn(span(t, end - 0.3, end)));
  if (k <= 0) return;
  ctx.save();
  ctx.font = `700 ${size * S.u}px ${BRAND.font}`;
  const w = ctx.measureText(label).width + 36 * S.u;
  const h = size * S.u * 1.7;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.translate(left + w / 2, y);
  ctx.scale(k, k);
  ctx.globalAlpha = clamp(k);
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 1 * S.u);
  ctx.restore();
}

/** Text typed out at `cps` characters per second from `start`, with a blinking caret. */
export function typed(ctx, str, x, y, t, start, opts = {}) {
  const cps = opts.cps ?? 28;
  const n = Math.floor(clamp((t - start) * cps, 0, str.length));
  const shown = str.slice(0, n);
  text(ctx, shown, x, y, opts);
  if (t >= start && (n < str.length || Math.floor(t * 2) % 2 === 0)) {
    ctx.save();
    ctx.font = `${opts.weight ?? 700} ${opts.size ?? 40}px ${opts.font ?? BRAND.font}`;
    const w = ctx.measureText(shown).width;
    ctx.fillStyle = opts.caret ?? BRAND.accentHi;
    const s = opts.size ?? 40;
    ctx.fillRect(x + w + 2, y - s * 0.8, Math.max(2, s * 0.07), s * 0.95);
    ctx.restore();
  }
  return n >= str.length;
}

/** Fades everything to/from black: in over the first `d` seconds, out over the last `d`. */
export function fade(ctx, S, t, duration, d = 0.3) {
  const k = Math.max(1 - span(t, 0, d), span(t, duration - d, duration));
  if (k <= 0) return;
  ctx.fillStyle = `rgba(5, 9, 18, ${k})`;
  ctx.fillRect(0, 0, S.W, S.H);
}
