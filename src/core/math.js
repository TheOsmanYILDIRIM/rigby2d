// SPDX-License-Identifier: MIT
// Minimal 2D math: local transforms and affine matrices.
//
// Rigby uses a Y-up coordinate system with rotations in degrees, counter-clockwise.
// A transform is a plain object { x, y, rotation, scale_x, scale_y }.

const DEG = Math.PI / 180;

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** A transform with translation and rotation (scale 1). */
export function transform(x = 0, y = 0, rotation = 0) {
  return { x, y, rotation, scale_x: 1, scale_y: 1 };
}

export function identityTransform() {
  return transform();
}

export function cloneTransform(t) {
  return { x: t.x, y: t.y, rotation: t.rotation, scale_x: t.scale_x, scale_y: t.scale_y };
}

export function transformEquals(a, b) {
  return a.x === b.x && a.y === b.y && a.rotation === b.rotation && a.scale_x === b.scale_x && a.scale_y === b.scale_y;
}

export function toAffine(t) {
  const s = Math.sin(t.rotation * DEG);
  const c = Math.cos(t.rotation * DEG);
  return new Affine(c * t.scale_x, s * t.scale_x, -s * t.scale_y, c * t.scale_y, t.x, t.y);
}

/** Linear interpolation between two transforms (rotation is not wrapped). */
export function lerpTransform(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    rotation: lerp(a.rotation, b.rotation, t),
    scale_x: lerp(a.scale_x, b.scale_x, t),
    scale_y: lerp(a.scale_y, b.scale_y, t),
  };
}

/** 2D affine matrix mapping (x, y) to (a*x + c*y + tx, b*x + d*y + ty). */
export class Affine {
  constructor(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
  }

  static identity() {
    return new Affine();
  }

  /** `this * rhs`: applies `rhs` first, then `this`. */
  mul(r) {
    return new Affine(
      this.a * r.a + this.c * r.b,
      this.b * r.a + this.d * r.b,
      this.a * r.c + this.c * r.d,
      this.b * r.c + this.d * r.d,
      this.a * r.tx + this.c * r.ty + this.tx,
      this.b * r.tx + this.d * r.ty + this.ty,
    );
  }

  determinant() {
    return this.a * this.d - this.b * this.c;
  }

  inverse() {
    const det = this.determinant();
    if (Math.abs(det) < 1e-12) return new Affine();
    const inv = 1 / det;
    const a = this.d * inv;
    const b = -this.b * inv;
    const c = -this.c * inv;
    const d = this.a * inv;
    return new Affine(a, b, c, d, -(a * this.tx + c * this.ty), -(b * this.tx + d * this.ty));
  }

  apply(p) {
    return [this.a * p[0] + this.c * p[1] + this.tx, this.b * p[0] + this.d * p[1] + this.ty];
  }

  /** Applies only the linear part (no translation), for direction vectors. */
  applyVector(v) {
    return [this.a * v[0] + this.c * v[1], this.b * v[0] + this.d * v[1]];
  }

  /** World rotation of the X axis, in degrees. */
  rotation() {
    return Math.atan2(this.b, this.a) / DEG;
  }

  /** Decomposes into translation, rotation and (possibly negative Y) scale. */
  decompose() {
    const scale_x = Math.sqrt(this.a * this.a + this.b * this.b);
    const scale_y = scale_x > 1e-12 ? this.determinant() / scale_x : 0;
    return { x: this.tx, y: this.ty, rotation: this.rotation(), scale_x, scale_y };
  }
}
