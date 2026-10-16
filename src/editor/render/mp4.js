// SPDX-License-Identifier: MIT OR Apache-2.0
// Minimal MP4 writer for one H.264 video track (length-prefixed NAL units from WebCodecs with
// their avcC configuration). The movie header comes first ("fast start"), so playback can begin
// while the file loads.

const enc = new TextEncoder();

function box(type, ...parts) {
  const size = 8 + parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  v.setUint32(0, size);
  out.set(enc.encode(type), 4);
  let o = 8;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Big-endian fields: [bits, value] pairs (8, 16, 24 or 32 bits). */
function fields(...list) {
  const n = list.reduce((s, [bits]) => s + bits / 8, 0);
  const out = new Uint8Array(n);
  const v = new DataView(out.buffer);
  let o = 0;
  for (const [bits, value] of list) {
    if (bits === 8) v.setUint8(o, value);
    else if (bits === 16) v.setUint16(o, value);
    else if (bits === 24) {
      v.setUint8(o, (value >> 16) & 0xff);
      v.setUint16(o + 1, value & 0xffff);
    } else v.setUint32(o, value >>> 0);
    o += bits / 8;
  }
  return out;
}

const fullBox = (type, version, flags, ...parts) => box(type, fields([8, version], [24, flags]), ...parts);
const MATRIX = fields([32, 0x00010000], [32, 0], [32, 0], [32, 0], [32, 0x00010000], [32, 0], [32, 0], [32, 0], [32, 0x40000000]);

/**
 * Timescale and frame duration that represent `fps` exactly, including the NTSC rates
 * (23.976 = 24000 / 1001, 29.97 = 30000 / 1001).
 */
export function timing(fps) {
  return { timescale: Math.round(fps * 1001), delta: 1001 };
}

/**
 * Builds an MP4 file. `frames` are { data: Uint8Array (AVC length-prefixed), key: boolean };
 * `avcC` is the decoder configuration record from the encoder.
 */
export function writeMp4({ width, height, fps, avcC, frames }) {
  const { timescale, delta } = timing(fps);
  const duration = frames.length * delta;
  const ftyp = box('ftyp', enc.encode('isom'), fields([32, 0x200]), enc.encode('isomiso2avc1mp41'));
  const moovFor = (dataOffset) => {
    const stsd = fullBox(
      'stsd',
      0,
      0,
      fields([32, 1]),
      box(
        'avc1',
        fields([32, 0], [16, 0], [16, 1]), // reserved, data reference index
        fields([16, 0], [16, 0], [32, 0], [32, 0], [32, 0]), // pre-defined and reserved
        fields([16, width], [16, height], [32, 0x00480000], [32, 0x00480000], [32, 0], [16, 1]),
        new Uint8Array(32), // compressor name
        fields([16, 0x18], [16, 0xffff]),
        box('avcC', avcC),
      ),
    );
    const keys = frames.map((f, i) => (f.key ? i + 1 : 0)).filter(Boolean);
    const stbl = box(
      'stbl',
      stsd,
      fullBox('stts', 0, 0, fields([32, 1], [32, frames.length], [32, delta])),
      fullBox('stss', 0, 0, fields([32, keys.length]), ...keys.map((k) => fields([32, k]))),
      fullBox('stsc', 0, 0, fields([32, 1], [32, 1], [32, frames.length], [32, 1])),
      fullBox('stsz', 0, 0, fields([32, 0], [32, frames.length]), ...frames.map((f) => fields([32, f.data.length]))),
      fullBox('stco', 0, 0, fields([32, 1], [32, dataOffset])),
    );
    const minf = box('minf', fullBox('vmhd', 0, 1, fields([16, 0], [16, 0], [16, 0], [16, 0])), box('dinf', fullBox('dref', 0, 0, fields([32, 1]), fullBox('url ', 0, 1))), stbl);
    const mdia = box(
      'mdia',
      fullBox('mdhd', 0, 0, fields([32, 0], [32, 0], [32, timescale], [32, duration], [16, 0x55c4], [16, 0])),
      fullBox('hdlr', 0, 0, fields([32, 0]), enc.encode('vide'), new Uint8Array(12), enc.encode('Rigby2D video\0')),
      minf,
    );
    const tkhd = fullBox('tkhd', 0, 3, fields([32, 0], [32, 0], [32, 1], [32, 0], [32, duration]), new Uint8Array(8), fields([16, 0], [16, 0], [16, 0], [16, 0]), MATRIX, fields([32, width * 65536], [32, height * 65536]));
    const mvhd = fullBox('mvhd', 0, 0, fields([32, 0], [32, 0], [32, timescale], [32, duration], [32, 0x00010000], [16, 0x0100], [16, 0]), new Uint8Array(8), MATRIX, new Uint8Array(24), fields([32, 2]));
    return box('moov', mvhd, box('trak', tkhd, mdia));
  };
  // The sample offsets depend on the movie header's size, which does not depend on them.
  const size = moovFor(0).length;
  const moov = moovFor(ftyp.length + size + 8);
  const dataSize = frames.reduce((s, f) => s + f.data.length, 0);
  const out = new Uint8Array(ftyp.length + moov.length + 8 + dataSize);
  out.set(ftyp, 0);
  out.set(moov, ftyp.length);
  const v = new DataView(out.buffer);
  let o = ftyp.length + moov.length;
  v.setUint32(o, 8 + dataSize);
  out.set(enc.encode('mdat'), o + 4);
  o += 8;
  for (const f of frames) {
    out.set(f.data, o);
    o += f.data.length;
  }
  return out;
}
