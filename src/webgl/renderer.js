// SPDX-License-Identifier: MIT
// Reference WebGL renderer for the Rigby2D runtime: draws a posed skeleton with one batched
// vertex buffer, two-color tint and the normal / additive / multiply / screen blend modes.
//
//   const renderer = new WebGLRenderer(gl);
//   const textures = renderer.atlasTextures(parseAtlas(atlasText), pageImages); // or imageTextures
//   // every frame:
//   renderer.begin(width, height, camera);            // camera: { x, y, zoom }
//   renderer.drawSkeleton(skeleton, pose, textures);
//   renderer.end();
//
// Works with WebGL 1 and 2. Clipping attachments are not applied yet.

import { regionPlacement } from '../core/atlas.js';

const FLOATS = 12; // x, y, u, v, light rgba, dark rgb + dark flag
const MAX_VERTICES = 65535;

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec4 a_light;
attribute vec4 a_dark;
uniform mat3 u_projection;
varying vec2 v_uv;
varying vec4 v_light;
varying vec4 v_dark;
void main() {
  v_uv = a_uv;
  v_light = a_light;
  v_dark = a_dark;
  gl_Position = vec4((u_projection * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}`;

// Two-color tint: texture color c maps to light * c + dark * (1 - c). Output is premultiplied.
const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_pma;
varying vec2 v_uv;
varying vec4 v_light;
varying vec4 v_dark;
void main() {
  vec4 t = texture2D(u_texture, v_uv);
  vec3 c = u_pma > 0.5 ? (t.a > 0.0 ? t.rgb / t.a : vec3(0.0)) : t.rgb;
  float a = t.a * v_light.a;
  vec3 rgb = c * v_light.rgb + (1.0 - c) * v_dark.rgb * v_dark.a;
  gl_FragColor = vec4(rgb * a, a);
}`;

/** Blend functions for premultiplied output, by slot blend mode. */
const BLEND = {
  normal: ['ONE', 'ONE_MINUS_SRC_ALPHA'],
  additive: ['ONE', 'ONE'],
  multiply: ['DST_COLOR', 'ONE_MINUS_SRC_ALPHA'],
  screen: ['ONE', 'ONE_MINUS_SRC_COLOR'],
};

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(shader)}`);
  return shader;
}

export class WebGLRenderer {
  /** @param {WebGLRenderingContext | WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`program: ${gl.getProgramInfoLog(program)}`);
    this.program = program;
    this.attributes = ['a_position', 'a_uv', 'a_light', 'a_dark'].map((n) => gl.getAttribLocation(program, n));
    this.uniforms = {
      projection: gl.getUniformLocation(program, 'u_projection'),
      texture: gl.getUniformLocation(program, 'u_texture'),
      pma: gl.getUniformLocation(program, 'u_pma'),
    };
    this.vertices = new Float32Array(MAX_VERTICES * FLOATS);
    this.indices = new Uint16Array(MAX_VERTICES * 3);
    this.vertexBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();
    this.vertexCount = 0;
    this.indexCount = 0;
    this.texture = null;
    this.blend = null;
    this.drawCalls = 0;
    this.drawing = false;
  }

  /** Uploads an image (img, canvas, ImageBitmap…) as a texture. */
  createTexture(image, { pma = false, linear = true, mipmaps = false } = {}) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    const filter = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    const pow2 = (n) => (n & (n - 1)) === 0;
    const canMip = mipmaps && (gl instanceof (globalThis.WebGL2RenderingContext ?? Object) || (pow2(image.width) && pow2(image.height)));
    if (canMip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, canMip ? gl.LINEAR_MIPMAP_LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { texture, width: image.width, height: image.height, pma };
  }

  /**
   * Texture lookup for an atlas: `pageImages` maps page file names to images. Returns a function
   * from image name to a texture entry (or null).
   */
  atlasTextures(atlas, pageImages) {
    const regions = new Map();
    for (const page of atlas.pages) {
      const image = pageImages instanceof Map ? pageImages.get(page.name) : pageImages[page.name];
      if (!image) continue;
      const tex = this.createTexture(image, { pma: page.pma, linear: !page.filter?.[0]?.startsWith('Nearest') });
      const pw = page.width || image.width;
      const ph = page.height || image.height;
      for (const r of page.regions) regions.set(r.index >= 0 ? `${r.name}${r.index}` : r.name, regionEntry(tex, r, pw, ph));
    }
    return (name) => regions.get(name) ?? null;
  }

  /** Texture lookup for loose images: `images` maps image names to images (no trimming). */
  imageTextures(images, options = {}) {
    const entries = new Map();
    for (const [name, image] of images instanceof Map ? images : Object.entries(images)) {
      const tex = this.createTexture(image, options);
      entries.set(name, { tex, trim: [0, 0, 1, 1], map: (u, v, out) => ((out[0] = u), (out[1] = v), out) });
    }
    return (name) => entries.get(name) ?? null;
  }

  /**
   * Starts a frame for a `width` x `height` drawing buffer. The camera centers world point
   * (x, y) with `zoom` pixels per unit; world Y points up.
   */
  begin(width, height, camera = { x: 0, y: 0, zoom: 1 }) {
    const gl = this.gl;
    const sx = (2 * camera.zoom) / width;
    const sy = (2 * camera.zoom) / height;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uniforms.projection, false, new Float32Array([sx, 0, 0, 0, sy, 0, -camera.x * sx, -camera.y * sy, 1]));
    gl.uniform1i(this.uniforms.texture, 0);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    this.texture = null;
    this.blend = null;
    this.drawCalls = 0;
    this.drawing = true;
  }

  end() {
    this.flush();
    this.drawing = false;
  }

  /** Draws every visible region and mesh of a posed skeleton in draw order. */
  drawSkeleton(sk, pose, lookup, { tint = [1, 1, 1, 1] } = {}) {
    const corners = new Float32Array(8);
    const uv = [0, 0];
    for (const i of pose.drawOrder) {
      const slot = sk.slots[i];
      if (!slot) continue;
      const att = pose.slotAttachment(sk, i);
      if (!att) continue;
      const type = att.type ?? 'region';
      if (type !== 'region' && type !== 'mesh' && type !== 'linkedmesh') continue;
      const source = type === 'region' ? att : sk.meshSource(i, att);
      if (!source) continue;
      const entry = lookup(imageName(type === 'region' ? att : att.type === 'linkedmesh' ? att : source));
      if (!entry) continue;
      const c = pose.color[i];
      const ac = att.color ?? [1, 1, 1, 1];
      const light = [c[0] * ac[0] * tint[0], c[1] * ac[1] * tint[1], c[2] * ac[2] * tint[2], c[3] * ac[3] * tint[3]];
      const dark = pose.dark[i];
      this.use(entry.tex, slot.blend ?? 'normal');

      if (type === 'region') {
        // The packed (trimmed) part of the image, as corners of the attachment quad.
        const m = pose.attachmentWorld(sk, i, att);
        const [u0, v0, u1, v1] = entry.trim;
        const hw = att.width / 2;
        const hh = att.height / 2;
        const local = [
          [u0, v0],
          [u1, v0],
          [u1, v1],
          [u0, v1],
        ];
        if (!this.reserve(4, 6)) continue;
        const base = this.vertexCount;
        local.forEach(([u, v], k) => {
          const lx = -hw + u * att.width;
          const ly = hh - v * att.height;
          corners[2 * k] = m.a * lx + m.c * ly + m.tx;
          corners[2 * k + 1] = m.b * lx + m.d * ly + m.ty;
          entry.map(u, v, uv);
          this.vertex(corners[2 * k], corners[2 * k + 1], uv[0], uv[1], light, dark);
        });
        this.index(base, base + 1, base + 2, base, base + 2, base + 3);
      } else {
        const positions = pose.worldVertices(sk, i, att);
        const uvs = source.uvs;
        const tris = source.triangles;
        const n = positions.length / 2;
        if (!this.reserve(n, tris.length)) continue;
        const base = this.vertexCount;
        for (let k = 0; k < n; k++) {
          entry.map(uvs[2 * k], uvs[2 * k + 1], uv);
          this.vertex(positions[2 * k], positions[2 * k + 1], uv[0], uv[1], light, dark);
        }
        for (let k = 0; k < tris.length; k++) this.indices[this.indexCount++] = base + tris[k];
      }
    }
  }

  use(tex, blend) {
    if (this.texture !== tex || this.blend !== blend) {
      this.flush();
      this.texture = tex;
      this.blend = blend;
    }
  }

  /** Makes room for a mesh, flushing if needed. Returns false if it can never fit. */
  reserve(vertices, indices) {
    if (vertices > MAX_VERTICES || indices > this.indices.length) return false;
    if (this.vertexCount + vertices > MAX_VERTICES || this.indexCount + indices > this.indices.length) this.flush();
    return true;
  }

  vertex(x, y, u, v, light, dark) {
    const o = this.vertexCount++ * FLOATS;
    const f = this.vertices;
    f[o] = x;
    f[o + 1] = y;
    f[o + 2] = u;
    f[o + 3] = v;
    f[o + 4] = light[0];
    f[o + 5] = light[1];
    f[o + 6] = light[2];
    f[o + 7] = light[3];
    f[o + 8] = dark ? dark[0] : 0;
    f[o + 9] = dark ? dark[1] : 0;
    f[o + 10] = dark ? dark[2] : 0;
    f[o + 11] = dark ? 1 : 0;
  }

  index(...list) {
    for (const i of list) this.indices[this.indexCount++] = i;
  }

  flush() {
    if (!this.indexCount || !this.texture) {
      this.vertexCount = 0;
      this.indexCount = 0;
      return;
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture.texture);
    gl.uniform1f(this.uniforms.pma, this.texture.pma ? 1 : 0);
    const [src, dst] = BLEND[this.blend] ?? BLEND.normal;
    gl.blendFunc(gl[src], gl[dst]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, this.vertexCount * FLOATS), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices.subarray(0, this.indexCount), gl.DYNAMIC_DRAW);
    const stride = FLOATS * 4;
    const sizes = [2, 2, 4, 4];
    let offset = 0;
    this.attributes.forEach((loc, k) => {
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, sizes[k], gl.FLOAT, false, stride, offset * 4);
      }
      offset += sizes[k];
    });
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    this.drawCalls++;
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteProgram(this.program);
  }
}

/** The image an attachment draws (its path, or name), including a sequence's first frame. */
function imageName(att) {
  return att.image ?? att.name;
}

/**
 * A region's texture entry: `trim` is the packed part of the image in normalized image
 * coordinates (u right, v down) and `map(u, v, out)` turns image coordinates into page UVs,
 * undoing whitespace stripping and rotation.
 */
export function regionEntry(tex, r, pageWidth, pageHeight) {
  const p = regionPlacement(r);
  const ow = Math.max(1, p.originalWidth);
  const oh = Math.max(1, p.originalHeight);
  const { x: dx, y: dy, width: w, height: h } = p.dst;
  // Rotation: the page holds the packed image rotated by -rotate degrees about its center.
  const rad = (-p.rotate * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad) * 1e6) / 1e6;
  const sin = Math.round(Math.sin(rad) * 1e6) / 1e6;
  const cx = p.src.width / 2;
  const cy = p.src.height / 2;
  return {
    tex,
    trim: [dx / ow, dy / oh, (dx + w) / ow, (dy + h) / oh],
    map(u, v, out) {
      // Pixel in the packed image, clamped so UVs never reach neighbouring regions.
      const qx = Math.min(w, Math.max(0, u * ow - dx)) - w / 2;
      const qy = Math.min(h, Math.max(0, v * oh - dy)) - h / 2;
      out[0] = (p.src.x + cx + qx * cos - qy * sin) / pageWidth;
      out[1] = (p.src.y + cy + qx * sin + qy * cos) / pageHeight;
      return out;
    },
  };
}
