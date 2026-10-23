// SPDX-License-Identifier: MIT OR Apache-2.0
// The promo studio page: preview and scrub each cut, save stills and the thumbnail, render MP4s.

import { Cast } from './cast.js';
import { drawFrame, locate, pngOf, renderCut, save } from './encode.js';
import { BRAND, background, stage, text } from './engine.js';
import { CUTS, cutLength, SCENES } from './scenes.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const ctx = view.getContext('2d');
const status = (s) => ($('status').textContent = s);
let cast = null;
let music = null;
let playing = false;
let t = 0;

for (const name of Object.keys(CUTS)) $('cut').append(new Option(`${name} (${cutLength(CUTS[name])} s, ${CUTS[name].width}×${CUTS[name].height})`, name));
const cut = () => CUTS[$('cut').value];

function show() {
  const c = cut();
  if (view.width !== c.width || view.height !== c.height) {
    view.width = c.width;
    view.height = c.height;
  }
  drawFrame(ctx, c, cast, t);
  $('time').textContent = `${t.toFixed(2)} s`;
  $('scene').textContent = locate(c, t).scene.id;
  $('scrub').max = cutLength(c);
  $('scrub').value = t;
}

/** The 1280×720 YouTube thumbnail: Rigbytron mid-wave, the logo and a short promise. */
function thumbnail() {
  const canvas = new OffscreenCanvas(1280, 720);
  const g = canvas.getContext('2d');
  const S = stage(1280, 720);
  cast.attach(1280, 720);
  background(g, S, 0);
  const placed = cast.place(400, 380, 600);
  cast.clear();
  cast.draw(cast.rigbytron, cast.pose(cast.rigbytron, 'wave', 0.9), placed);
  cast.composite(g);
  g.font = `800 120px ${BRAND.font}`;
  const w = g.measureText('Rigby').width;
  text(g, 'Rigby', 690, 300, { size: 120, weight: 800 });
  text(g, '2D', 690 + w, 300, { size: 120, weight: 800, color: BRAND.accent });
  text(g, 'Free 2D animation', 694, 390, { size: 54, weight: 800 });
  text(g, 'AutoRig · Film · Games · AI', 694, 450, {
    size: 32,
    weight: 600,
    color: BRAND.sub,
  });
  return canvas;
}

function loop() {
  if (!playing) return;
  const now = performance.now();
  t += (now - loop.last) / 1000;
  loop.last = now;
  if (t >= cutLength(cut())) t = 0;
  show();
  setTimeout(loop, 1000 / 60);
}

$('play').onclick = () => {
  playing = !playing;
  $('play').textContent = playing ? 'Pause' : 'Play';
  loop.last = performance.now();
  loop();
};
$('scrub').oninput = () => {
  t = Number($('scrub').value);
  show();
};
$('cut').onchange = () => {
  t = 0;
  show();
};
$('music').onchange = async () => {
  const f = $('music').files[0];
  music = f ? await f.arrayBuffer() : null;
  status(music ? `Music: ${f.name}` : 'No music');
};
$('frame').onclick = async () => status(`Saved ${await save(`${$('cut').value}-${t.toFixed(2)}s.png`, await pngOf(view))}`);
$('thumb').onclick = async () => status(`Saved ${await save('thumbnail.png', await pngOf(thumbnail()))}`);
$('render').onclick = async () => {
  const name = $('cut').value;
  const started = performance.now();
  const bytes = await renderCut(cut(), cast, {
    music,
    progress: (done, total) => {
      if (done % 30 === 0) status(`Rendering ${name}: ${Math.round((100 * done) / total)}%`);
      return true;
    },
  });
  status(`Saved ${await save(`rigby2d-${name}.mp4`, bytes)} in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  show();
};

// For automation: render a cut from the console or a test (window.promo.render('teaser')).
window.promo = {
  CUTS,
  SCENES,
  seek(name, time) {
    $('cut').value = name;
    t = time;
    show();
  },
  async render(name) {
    $('cut').value = name;
    const bytes = await renderCut(CUTS[name], cast, { music });
    return save(`rigby2d-${name}.mp4`, bytes);
  },
  thumbnail: async () => save('thumbnail.png', await pngOf(thumbnail())),
};

cast = await new Cast().load();
status('Ready');
show();
