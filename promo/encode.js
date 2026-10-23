// SPDX-License-Identifier: MIT OR Apache-2.0
// Renders a cut to MP4: frames drawn by the scenes, encoded to H.264 with WebCodecs, optionally
// with a music track (decoded, trimmed to the cut and faded out) encoded to AAC. No
// requestAnimationFrame: frames render as fast as the encoder takes them, hidden tab or not.

import { encodeAac } from '../src/editor/audio.js';
import { writeMp4 } from '../src/editor/render/mp4.js';
import { background, stage } from './engine.js';
import { cutLength, SCENES } from './scenes.js';

/** Which segment of `cut` is on screen at time `t`, and the time inside its scene. */
export function locate(cut, t) {
  let start = 0;
  for (const g of cut.segments) {
    const len = g.to - g.from;
    if (t < start + len || g === cut.segments.at(-1))
      return {
        scene: SCENES[g.scene],
        time: g.from + Math.min(t - start, len),
        local: t - start,
        len,
      };
    start += len;
  }
  return null;
}

/** Draws frame time `t` of `cut` into `ctx`. */
export function drawFrame(ctx, cut, cast, t) {
  const S = stage(cut.width, cut.height);
  cast.attach(cut.width, cut.height);
  background(ctx, S, t);
  const at = locate(cut, t);
  at.scene.draw(ctx, S, at.time, cast);
  // A short dip at each cut and at the start and end, so segment joins never pop.
  const d = 0.12;
  const k = Math.max(0, 1 - at.local / d, 1 - (at.len - at.local) / d);
  if (k > 0) {
    ctx.fillStyle = `rgba(5, 9, 18, ${Math.min(1, k)})`;
    ctx.fillRect(0, 0, S.W, S.H);
  }
}

/** The music, decoded, cut to `seconds` and faded out over the last two seconds. */
async function musicBuffer(bytes, seconds) {
  const rate = 48000;
  const decoded = await new OfflineAudioContext(2, rate, rate).decodeAudioData(bytes.slice(0));
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(1, Math.max(0, seconds - 2));
  gain.gain.linearRampToValueAtTime(0, seconds);
  src.connect(gain).connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

/**
 * Renders `cut` at `fps` and returns the MP4 bytes. `music` is an ArrayBuffer of any format the
 * browser decodes (MP3, WAV, OGG, …) or null. `progress(done, total)` may return false to stop.
 */
export async function renderCut(cut, cast, { fps = 60, music = null, progress = () => true } = {}) {
  const { width, height } = cut;
  const total = Math.round(cutLength(cut) * fps);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  let description = null;
  let failure = null;
  const frames = [];
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const d = meta?.decoderConfig?.description;
      if (d) description = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
      frames.push({ data, key: chunk.type === 'key', time: chunk.timestamp });
    },
    error: (e) => (failure = e),
  });
  // YouTube's recommended bitrate for 1080p60 is about 12 Mbps; a little more keeps gradients clean.
  const bitrate = Math.round(width * height * fps * 0.12);
  let config = null;
  for (const codec of ['avc1.640033', 'avc1.64002a', 'avc1.4d0033', 'avc1.42e033']) {
    const c = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      avc: { format: 'avc' },
    };
    if ((await VideoEncoder.isConfigSupported(c).catch(() => ({}))).supported) {
      config = c;
      break;
    }
  }
  if (!config) throw new Error(`H.264 at ${width}×${height} is not supported here`);
  encoder.configure(config);
  try {
    for (let i = 0; i < total; i++) {
      if (failure) throw failure;
      drawFrame(ctx, cut, cast, i / fps);
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / fps),
        duration: Math.round(1e6 / fps),
        alpha: 'discard',
      });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 6 && !failure) await new Promise((r) => setTimeout(r, 2));
      if (progress(i + 1, total) === false) return null;
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  frames.sort((a, b) => a.time - b.time);
  const audio = music ? await encodeAac(await musicBuffer(music, total / fps)) : null;
  return writeMp4({ width, height, fps, avcC: description, frames, audio });
}

/** Encodes a canvas as PNG bytes. */
export async function pngOf(canvas) {
  const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/png' }) : await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Saves bytes to promo/out/<name> through the dev server; downloads them when that is not there. */
export async function save(name, bytes) {
  const r = await fetch(`/__promo/save?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    body: bytes,
  }).catch(() => null);
  if (r?.ok) return `promo/out/${name}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes]));
  a.download = name;
  a.click();
  return name;
}
