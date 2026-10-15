// SPDX-License-Identifier: MIT OR Apache-2.0
// Splash screen: the mascot holds its pose while the editor loads, then slashes outward and the
// lockup is revealed. The animation is a Rigby2D project (branding/mascot) played with the runtime
// and the WebGL renderer. The mascot and lockup artwork are Hoverlabs trademarks (TRADEMARKS.md).

import { emit, listen } from '@tauri-apps/api/event';
import { Window, getCurrentWindow } from '@tauri-apps/api/window';

import { parseAtlas } from '../core/atlas.js';
import { readSkeletonBinary } from '../core/binary.js';
import { readSkeletonJson } from '../core/interop.js';
import { Pose } from '../core/pose.js';
import { AnimationState } from '../core/state.js';
import { WebGLRenderer } from '../webgl/renderer.js';
import skelUrl from '../../branding/mascot/export/rigby2d-mascot.skel?url&no-inline';
import atlasText from '../../branding/mascot/export/rigby2d-mascot.atlas?raw';
import pageUrl from '../../branding/mascot/export/rigby2d-mascot.png?url';
import lockupUrl from '../../branding/rigby2d-lockup-transparent.svg?url';

const inTauri = '__TAURI_INTERNALS__' in window;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The hold pose shows at least this long, so a fast start still reads as a gesture. */
const MIN_HOLD = 1.2;
/** Time from the end of the slash to handing over to the editor. */
const LINGER = 0.7;

const $ = (s) => document.querySelector(s);
const canvas = $('#view');
const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true }) ?? canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
$('#lockup').src = lockupUrl;

let editorReady = false;
let finished = false;

/** Shows the editor window and closes the splash. Safe to call more than once. */
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

if (inTauri) {
  listen('rigby://ready', () => (editorReady = true));
  // The editor may have finished first: ask it to say so again.
  emit('rigby://splash-up').catch(() => {});
  // Closing the splash early still brings up the editor.
  getCurrentWindow()
    .onCloseRequested(async () => {
      if (finished) return;
      finished = true;
      const main = await Window.getByLabel('main');
      await main?.show();
    })
    .catch(() => {});
} else {
  // Opened in a browser: pretend the editor is ready after a moment.
  setTimeout(() => (editorReady = true), 2400);
}

function reveal() {
  $('#lockup').classList.add('reveal');
  $('#note').style.opacity = '0';
}

async function start() {
  if (!gl) throw new Error('WebGL unavailable');
  const bytes = new Uint8Array(await (await fetch(skelUrl)).arrayBuffer());
  const sk = readSkeletonJson(readSkeletonBinary(bytes), 'rigby2d-mascot').skeleton;
  const atlas = parseAtlas(atlasText);
  const page = await createImageBitmap(await (await fetch(pageUrl)).blob(), { premultiplyAlpha: 'none' });
  const renderer = new WebGLRenderer(gl);
  const textures = renderer.atlasTextures(atlas, new Map([[atlas.pages[0].name, page]]));
  const pose = new Pose(sk);
  const state = new AnimationState();

  let phase = 'hold';
  let held = 0;
  let doneAt = null;
  state.addListener({
    event: (_, e) => e.name === 'slash' && reveal(),
    complete: (entry) => {
      if (phase === 'release' && entry.name === 'release') doneAt ??= performance.now();
    },
  });
  state.setAnimation(sk, 0, 'hold', true, 0);

  let last = performance.now();
  function frame(now) {
    try {
      step(now);
    } catch (e) {
      // Never leave the user on a frozen splash: show the lockup and hand over when ready.
      console.error('splash:', e);
      fallback();
      return;
    }
    if (!finished || !inTauri) requestAnimationFrame(frame);
  }

  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    held += dt;
    if (phase === 'hold' && editorReady && held >= MIN_HOLD) {
      phase = 'release';
      state.setAnimation(sk, 0, 'release', false, 0.08);
    }
    if (doneAt !== null && now - doneAt > LINGER * 1000) finish();

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) [canvas.width, canvas.height] = [w, h];
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // The mascot stands at 30% of the width, its height filling about 84% of the window.
    const zoom = (0.84 * canvas.clientHeight) / 1400;
    const cam = { x: (0.5 - 0.3) * (canvas.clientWidth / zoom), y: (0.5 * canvas.clientHeight - 0.06 * canvas.clientHeight) / zoom, zoom: zoom * dpr };
    state.update(sk, dt);
    state.apply(sk, pose);
    renderer.begin(w, h, cam);
    renderer.drawSkeleton(sk, pose, textures);
    renderer.end();
  }
  requestAnimationFrame(frame);
}

/** Static splash: the lockup, handing over as soon as the editor is ready. */
function fallback() {
  reveal();
  const wait = setInterval(() => editorReady && (clearInterval(wait), setTimeout(finish, 600)), 100);
}

if (reducedMotion) {
  fallback();
} else {
  start().catch((e) => {
    console.error('splash:', e);
    fallback();
  });
}

window.rigbySplash = { finish, get editorReady() { return editorReady; } };
