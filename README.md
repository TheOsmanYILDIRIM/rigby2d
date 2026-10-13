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

- **Art import**: PSD files (every pixel layer becomes a part, layout preserved) or individual PNGs.
- **Rigging**: draw bone chains directly in the viewport, reparent, attach images to bones, reorder draw order.
- **Animation**: Setup and Animate modes, pose / rotate / translate / scale / shear tools, key buttons and optional auto key, switchable shortcut presets.
- **Dopesheet and graph editor**: multi-key selection, moving and retiming keys, curve presets, bezier handle editing, image-swap keys.
- **Undo / redo** for every edit, with unsaved-change tracking.
- **`.rigby` work file**: one self-contained file with the whole project and its images (like a `.blend`).
- **Skeleton import/export**: opens and exports the widely used skeleton formats: `.json` (3.8, 4.2, 4.3) and binary `.skel` (4.3), with `.atlas` texture atlases. Meshes, weights, skins, IK, events, deform and draw-order keys round-trip losslessly.
- **Runtime included**: a small dependency-free JavaScript runtime (`src/core`) to play exported animations in your game.
- **Sample character**: *File ▸ New sample (robot)* gives you a rigged, animated character to explore.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) 20 or newer
- Tauri's system prerequisites for your OS, see <https://tauri.app/start/prerequisites/>
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
5. **Save:** *File ▸ Save* writes your work file `name.rigby`. Reopen it any time with *File ▸ Open*.
6. **Export:** *File ▸ Export JSON + atlas…* or *Export .skel + atlas* writes the skeleton plus `name.atlas` and `name.png` for game runtimes. *File ▸ Open* also imports existing `.json` / `.skel` exports.

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

### File formats

- **`.rigby`**: Rigby2D's work file: a ZIP holding `project.json` (the complete document) and
  `images/*.png`. Use it for saving work in progress.
- **Skeleton `.json` / `.skel`**: the interchange formats game runtimes load. Bones are listed so
  parents come first, slots are in draw order, attachments live in skins, and animations hold bone,
  slot, deform, draw-order, IK and event timelines with keys relative to the setup pose. Images
  come from a `.atlas` texture atlas or loose files in the skeleton's `images` folder.
- Binary `.skel` support covers format 4.3 skeletons with IK, transform and path constraints, skins,
  region, mesh, linked mesh, bounding box, path and clipping attachments, and bone, slot, IK,
  transform, deform, draw-order and event keys. Rigs using other features (physics constraints,
  point attachments, image sequences, …) export to `.json` instead.

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

Rigby2D is an independent open-source project. It is not affiliated with, endorsed by, or sponsored by Esoteric Software LLC. Spine is a trademark of Esoteric Software LLC.

Rigby2D reads and writes the skeleton JSON, binary `.skel` and texture atlas file formats solely for interoperability, so that users can work with their own exported files. This support was implemented clean-room:

- **JSON and atlas formats:** implemented from publicly available documentation.
- **Binary `.skel` format:** implemented from the publicly documented binary layout of earlier versions and by comparing JSON and binary exports of the same skeleton (black-box observation of exported data).

No Esoteric Software source code, runtimes, editor files or assets are used or distributed with Rigby2D. Compatibility with files from any particular editor or runtime version is provided as-is and is not guaranteed.
