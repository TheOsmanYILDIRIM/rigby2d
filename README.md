<p align="center">
  <img src="docs/logo.png" alt="Rigby2D logo" width="128" height="128">
</p>

<h1 align="center">Rigby2D</h1>

<p align="center">
  <strong>Open-source 2D skeletal animation editor for games.</strong><br>
  Import your art, draw bones, keyframe animations, export JSON + a texture atlas.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey">
  <img alt="Built with Tauri" src="https://img.shields.io/badge/built%20with-Tauri%202-24c8db">
  <img alt="Node 20+" src="https://img.shields.io/badge/node-%3E%3D20-339933">
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
</p>

<p align="center">
  <img src="docs/screenshot.jpg" alt="Rigby2D editor with the sample robot: bone hierarchy, viewport, inspector and dopesheet" width="800">
</p>

## Features

- **Art import** — PSD files (every pixel layer becomes a part, layout preserved) or individual PNGs.
- **Rigging** — draw bone chains directly in the viewport, reparent, attach images to bones, reorder draw order.
- **Animation** — Setup and Animate modes; posing a bone in Animate mode sets keys automatically.
- **Dopesheet** — drag keys in time, linear / ease-in / ease-out / ease-in-out / stepped curves, image-swap keys.
- **Undo / redo** for every edit, with unsaved-change tracking.
- **Standard skeleton JSON, no proprietary project file** — opens and saves the widely used skeleton `.json` format (3.8; 4.x experimental) with meshes, weights, skins, IK, events, deform and draw-order keys. *Save* writes `.json` + an `images/` folder; *Export* writes `.json` + a packed `.atlas` and `.png` for game runtimes.
- **Runtime included** — a small dependency-free JavaScript runtime (`src/core`) to play exported animations in your game.
- **Sample character** — *File ▸ New sample (robot)* gives you a rigged, animated character to explore.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) 20 or newer
- Tauri's system prerequisites for your OS — see <https://tauri.app/start/prerequisites/>
  - **Windows:** Microsoft C++ Build Tools ("Desktop development with C++") and WebView2 (preinstalled on Windows 10/11)
  - **macOS:** Xcode Command Line Tools
  - **Linux:** WebKitGTK and build essentials

### Run

```bash
git clone https://github.com/jaisurya-dev-art/rigby2d.git
cd rigby
npm install
npm run dev
```

### Build a release

```bash
npm run build
```

The app is written to `src-tauri/target/release/` and the installer to `src-tauri/target/release/bundle/`.

### Test

```bash
npm test
```

## Using Rigby2D

1. **Import art:** *File ▸ Import PSD…* or *File ▸ Import PNG images…*
2. **Draw bones:** press <kbd>B</kbd> and drag in the viewport. Select a bone first to chain children from it.
3. **Attach images:** select an image and choose its *Bone* in the inspector.
4. **Animate:** press <kbd>Tab</kbd> for Animate mode, move the time cursor, pose bones. Keys are set as you edit.
5. **Save:** *File ▸ Save* writes `name.json` plus an `images/` folder. Reopen it any time with *File ▸ Open*.
6. **Export:** *File ▸ Export JSON + atlas…* writes `name.json`, `name.atlas` and `name.png` for game runtimes.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| <kbd>R</kbd> / <kbd>G</kbd> / <kbd>S</kbd> / <kbd>B</kbd> | Rotate / move / scale / create bone tool |
| <kbd>Tab</kbd> | Toggle Setup ↔ Animate mode |
| <kbd>Space</kbd> | Play / pause |
| <kbd>K</kbd> | Key the selection at the current frame |
| <kbd>←</kbd> / <kbd>→</kbd> | Previous / next frame |
| <kbd>F</kbd> | Frame everything |
| <kbd>Del</kbd> | Delete selected key, bone or slot |
| Middle / right drag, wheel | Pan, zoom |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> | Undo / redo |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | Save / save as |
| <kbd>Ctrl</kbd>+<kbd>O</kbd> / <kbd>Ctrl</kbd>+<kbd>E</kbd> | Open / export |

## Playing animations in your game

Copy `src/core/` into your project (no dependencies) and render the quads with any 2D renderer:

```js
import { AnimationState, Pose, parseAtlas, readSkeletonJson } from './core/index.js';

const { skeleton } = readSkeletonJson(JSON.parse(jsonText), 'hero'); // name.json
const atlas = parseAtlas(atlasText); // name.atlas: pages and region rectangles
const pose = new Pose(skeleton);
const state = new AnimationState();
state.play(skeleton, 'walk', true, 0.2); // loop, 0.2 s crossfade

function frame(dt) {
  state.update(dt);
  state.apply(skeleton, pose);
  for (const quad of pose.quads(skeleton)) {
    // quad.positions: 4 world-space corners (TL, TR, BR, BL), Y up
    // quad.attachment.image: region name in the atlas (meshes: quad.kind === 'mesh', use quad.triangles/uvs)
    // quad.color: RGBA tint
  }
}
```

### File format

Rigby2D has no project format of its own: everything is standard skeleton JSON. Bones are listed so
parents come first, slots are in draw order, attachments live in skins, and animations hold bone,
slot, deform, draw-order, IK and event timelines with keys relative to the setup pose. Images are
either loose files in the skeleton's `images` folder or regions of a `.atlas` texture atlas.

## Project structure

```
src/core/       Runtime: data model, skeleton JSON + atlas I/O, pose evaluation, IK, playback
src/editor/     Editor UI: viewport, hierarchy, inspector, timeline, import/export
src-tauri/      Native desktop shell (window + file dialog/fs plugins only)
test/           node:test suites
docs/           Logo and screenshots
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup,
coding style and pull request process.

## License

[MIT](LICENSE) © 2026 [jaisurya-dev-art](https://github.com/jaisurya-dev-art)

## Disclaimer

Rigby2D is an independent open-source project. It is not affiliated with, endorsed by, or sponsored by Esoteric Software LLC. Spine is a trademark of Esoteric Software LLC. Rigby2D's support for the skeleton JSON and atlas file formats exists for interoperability and was implemented clean-room from publicly available documentation; no Esoteric Software code or assets are used.
