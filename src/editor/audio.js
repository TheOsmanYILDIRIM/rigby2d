// SPDX-License-Identifier: MIT OR Apache-2.0
// Audio tracks (Film workspace): sounds stored in the work file and placed on an animation at an
// offset. They play with the timeline, drive lip-sync and are mixed into a WAV for renders.

/** Sound name -> { bytes (file data), buffer (decoded AudioBuffer) }. */
export const sounds = new Map();
let context = null;
let playing = [];

export function audioContext() {
  return (context ??= new AudioContext());
}

/** Stores and decodes a sound file. */
export async function addSound(name, bytes) {
  const buffer = await audioContext().decodeAudioData(bytes.slice().buffer);
  sounds.set(name, { bytes, buffer });
  return buffer;
}

/** Validated tracks: { sound, animation, offset (s), volume }. */
export function readAudioTracks(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && typeof t.sound === 'string' && typeof t.animation === 'string')
    .map((t) => ({ sound: t.sound, animation: t.animation, offset: Number.isFinite(t.offset) ? t.offset : 0, volume: Number.isFinite(t.volume) ? Math.max(0, t.volume) : 1 }));
}

export const tracksOf = (doc, animation) => (doc.audio ?? []).filter((t) => t.animation === animation && sounds.get(t.sound)?.buffer);

export function stopAudio() {
  for (const s of playing) {
    try {
      s.stop();
    } catch {
      // already stopped
    }
  }
  playing = [];
}

/** Plays the tracks of `animation` from `time` seconds. */
export function startAudio(doc, animation, time) {
  stopAudio();
  const ctx = audioContext();
  if (ctx.state === 'suspended') ctx.resume();
  for (const t of tracksOf(doc, animation)) {
    const buffer = sounds.get(t.sound).buffer;
    const at = time - t.offset;
    if (at >= buffer.duration) continue;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = t.volume;
    src.connect(gain).connect(ctx.destination);
    if (at >= 0) src.start(0, at);
    else src.start(ctx.currentTime - at);
    playing.push(src);
  }
}

/**
 * Loudness per frame (0..1) of a track over `frames` frames at `fps`: RMS of each frame's samples,
 * scaled so the loudest frame is 1, lightly smoothed. Drives mouth-open lip-sync.
 */
export function frameLevels(track, fps, frames) {
  const buffer = sounds.get(track.sound)?.buffer;
  const out = new Float32Array(frames);
  if (!buffer) return out;
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  for (let f = 0; f < frames; f++) {
    const start = Math.floor((f / fps - track.offset) * rate);
    const end = Math.floor(((f + 1) / fps - track.offset) * rate);
    let sum = 0;
    let n = 0;
    for (let i = Math.max(0, start); i < Math.min(data.length, end); i++, n++) sum += data[i] * data[i];
    out[f] = n ? Math.sqrt(sum / n) * track.volume : 0;
  }
  const max = Math.max(1e-6, ...out);
  for (let f = 0; f < frames; f++) out[f] /= max;
  // Smooth over neighbours so the mouth does not flicker.
  const smooth = out.map((v, f) => (out[Math.max(0, f - 1)] + 2 * v + out[Math.min(frames - 1, f + 1)]) / 4);
  return smooth.map((v) => (v < 0.08 ? 0 : Math.min(1, v * 1.2)));
}

/** The tracks of `animation` mixed over `duration` seconds as a 16-bit stereo WAV, or null. */
export async function mixWav(doc, animation, duration) {
  const tracks = tracksOf(doc, animation);
  if (!tracks.length || duration <= 0) return null;
  const rate = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
  for (const t of tracks) {
    const src = ctx.createBufferSource();
    src.buffer = sounds.get(t.sound).buffer;
    const gain = ctx.createGain();
    gain.gain.value = t.volume;
    src.connect(gain).connect(ctx.destination);
    if (t.offset >= 0) src.start(t.offset);
    else src.start(0, -t.offset);
  }
  const out = await ctx.startRendering();
  const n = out.length;
  const bytes = new Uint8Array(44 + n * 4);
  const v = new DataView(bytes.buffer);
  const text = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, n * 4, true);
  const l = out.getChannelData(0);
  const r = out.getChannelData(1);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true);
    v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 32767, true);
  }
  return bytes;
}
