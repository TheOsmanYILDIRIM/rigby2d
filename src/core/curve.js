// SPDX-License-Identifier: MIT
// Interpolation curves between keyframes.
//
// A curve is serialized exactly as stored: "linear", "stepped" or { bezier: [x1, y1, x2, y2] }
// (cubic bezier with endpoints (0,0) and (1,1)).

export const LINEAR = 'linear';
export const STEPPED = 'stepped';
export const EASE_IN_OUT = Object.freeze({ bezier: Object.freeze([0.42, 0.0, 0.58, 1.0]) });
export const EASE_IN = Object.freeze({ bezier: Object.freeze([0.42, 0.0, 1.0, 1.0]) });
export const EASE_OUT = Object.freeze({ bezier: Object.freeze([0.0, 0.0, 0.58, 1.0]) });

export function isBezier(c) {
  return c !== null && typeof c === 'object' && Array.isArray(c.bezier);
}

/** Returns an independent, normalized copy of a curve (unknown values become linear). */
export function cloneCurve(c) {
  if (c === STEPPED) return STEPPED;
  if (isBezier(c) && c.bezier.length === 4) return { bezier: c.bezier.map(Number) };
  return LINEAR;
}

export function curveEquals(a, b) {
  if (isBezier(a) && isBezier(b)) return a.bezier.every((v, i) => v === b.bezier[i]);
  return a === b;
}

const clamp01 = (t) => Math.min(1, Math.max(0, t));

/** Maps linear progress `t` in [0, 1] to eased progress. */
export function ease(curve, t) {
  t = clamp01(t);
  if (curve === STEPPED) return 0;
  if (isBezier(curve)) {
    const [x1, y1, x2, y2] = curve.bezier;
    return bezierYForX(x1, y1, x2, y2, t);
  }
  return t;
}

function cubic(p1, p2, t) {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

function cubicDerivative(p1, p2, t) {
  const u = 1 - t;
  return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

function bezierYForX(x1, y1, x2, y2, x) {
  x1 = clamp01(x1);
  x2 = clamp01(x2);
  // Newton iterations, falling back to bisection when the slope is too flat.
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = cubic(x1, x2, t) - x;
    if (Math.abs(err) < 1e-5) return cubic(y1, y2, t);
    const d = cubicDerivative(x1, x2, t);
    if (Math.abs(d) < 1e-6) break;
    t = clamp01(t - err / d);
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 30; i++) {
    const v = cubic(x1, x2, t);
    if (Math.abs(v - x) < 1e-5) break;
    if (v < x) lo = t;
    else hi = t;
    t = (lo + hi) * 0.5;
  }
  return cubic(y1, y2, t);
}
