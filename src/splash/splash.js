// SPDX-License-Identifier: MIT OR Apache-2.0
// Splash screen: Rigbytron, the mascot, plays its gesture once (`hold`, then `release`, whose
// `slash` event reveals the lockup), then the editor window opens. The animation is a Rigby2D
// project (branding/rigbytron) played with the runtime and the WebGL renderer. Rigbytron and the
// lockup are Hoverlabs trademarks (TRADEMARKS.md).

import { Window, getCurrentWindow } from '@tauri-apps/api/window';

import { parseAtlas } from '../core/atlas.js';
import { readSkeletonBinary } from '../core/binary.js';
import { readSkeletonJson } from '../core/interop.js';
import { Pose } from '../core/pose.js';
import { AnimationState } from '../core/state.js';
import { WebGLRenderer } from '../webgl/renderer.js';
import skelUrl from '../../branding/rigbytron/export/rigbytron.skel?url&no-inline';
import atlasText from '../../branding/rigbytron/export/rigbytron.atlas?raw';
import pageUrl from '../../branding/rigbytron/export/rigbytron.png?url';
import lockupUrl from '../../branding/rigby2d-lockup-transparent.svg?url';

const inTauri = '__TAURI_INTERNALS__' in window;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Seconds the lockup stays on screen after the animation before the editor opens. */
const LINGER = 0.7;

const $ = (s) => document.querySelector(s);
const canvas = $('#view');
$('#lockup').src = lockupUrl;

let finished = false;

/** Opens the editor window and closes the splash. Safe to call more than once. */
async function finish() {
  if (finished) return;
  finished = true;
  if (!inTauri) return;
  try {
    const main = await Window.getByLabel('main');
    await main?.show();
    await main?.setFocus();
  } finally {
    document.body.classList.add('leaving');
    setTimeout(() => getCurrentWindow().destroy().catch(() => getCurrentWindow().close()), 260);
  }
}

// Closing the splash early still opens the editor.
if (inTauri) {
  getCurrentWindow()
    .onCloseRequested(async () => {
      if (finished) return;
      finished = true;
      const main = await Window.getByLabel('main');
      await main?.show();
    })
    .catch(() => {});
}

function reveal() {
  $('#lockup').classList.add('reveal');
  $('#note').style.opacity = '0';
}

/** Without animation: the lockup alone for a moment. */
function still() {
  reveal();
  setTimeout(finish, 1200);
}

async function play() {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true }) ?? canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
  if (!gl) throw new Error('WebGL unavailable');
  const bytes = new Uint8Array(await (await fetch(skelUrl)).arrayBuffer());
  const sk = readSkeletonJson(readSkeletonBinary(bytes), 'rigbytron').skeleton;
  const atlas = parseAtlas(atlasText);
  const page = await createImageBitmap(await (await fetch(pageUrl)).blob(), { premultiplyAlpha: 'none' });
  const renderer = new WebGLRenderer(gl);
  const textures = renderer.atlasTextures(atlas, new Map([[atlas.pages[0].name, page]]));
  const pose = new Pose(sk);
  const state = new AnimationState();

  state.addListener({
    event: (_, e) => e.name === 'slash' && reveal(),
    complete: (entry) => entry.name === 'release' && setTimeout(finish, LINGER * 1000),
  });
  state.setAnimation(sk, 0, 'hold', false, 0);
  state.addAnimation(sk, 0, 'release', false, 0.08);

  let last = performance.now();
  const draw = () => {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) [canvas.width, canvas.height] = [w, h];
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Rigbytron stands at 30% of the width, feet near the bottom, about 84% of the window tall.
    const zoom = (0.84 * canvas.clientHeight) / 1400;
    const camera = { x: (0.2 * canvas.clientWidth) / zoom, y: (0.44 * canvas.clientHeight) / zoom, zoom: zoom * dpr };
    state.update(sk, dt);
    state.apply(sk, pose);
    renderer.begin(w, h, camera);
    renderer.drawSkeleton(sk, pose, textures);
    renderer.end();
  };
  const loop = () => {
    try {
      draw();
    } catch (e) {
      console.error('splash:', e);
      still();
      return;
    }
    if (!finished || !inTauri) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

if (reducedMotion) still();
else
  play().catch((e) => {
    console.error('splash:', e);
    still();
  });
