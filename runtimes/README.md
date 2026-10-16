# Rigby2D native runtimes

Engine runtimes for Rigby2D animations, built on one Rust core.

| Folder | What it is | Status |
| --- | --- | --- |
| [`rust/rigby-runtime`](rust/rigby-runtime) | The runtime in Rust: loads skeleton `.json` (3.8, 4.2, 4.3) and binary `.skel` (4.3) with `.atlas`, evaluates poses, constraints and playback, and builds textured, clipped draw batches. No dependencies. | Complete |
| [`rust/rigby-godot`](rust/rigby-godot) | Godot 4.3+ GDExtension: the `RigbySkeleton2D` node. | Preview |
| [`godot`](godot) | Godot addon (`addons/rigby2d`, with [user guide](godot/addons/rigby2d/README.md)), demo scene and tests. | Preview |
| Unity | Planned, on the same Rust core. | Next |

## The Rust core

`rigby-runtime` is a port of the JavaScript runtime in `src/core` with the same behaviour: bones
with every inherit mode, region and mesh attachments with weights and deform keys, linked meshes,
IK (one and two bones, softness, stretch), transform, path, physics and slider constraints, skins,
image sequences, clipping, draw order keys, two-color tint, events, and `AnimationState` with
layered tracks, crossfades and queues.

```rust
use rigby_runtime::{load_skeleton, Atlas, AnimationState, Pose, RegionLookup, RenderOutput};

let data = load_skeleton(&std::fs::read("hero.skel")?)?;
let atlas = Atlas::parse(&std::fs::read_to_string("hero.atlas")?);
let lookup = RegionLookup::new(&data, &atlas);
let (mut pose, mut state, mut out) = (Pose::new(&data), AnimationState::new(), RenderOutput::default());
state.play(&data, "walk", true, 0.2);

// Every frame:
state.update(&data, dt);
state.apply(&data, &mut pose);
for event in state.drain_events() { /* starts, ends, completions, event keys */ }
out.build(&data, &pose, &lookup, [1.0; 4]);
for batch in out.batches() { /* positions, UVs, colors, dark colors, indices for atlas page `batch.page` */ }
```

### Correctness

The Rust runtime must match the JavaScript runtime frame by frame. `tests/golden/generate.mjs`
plays a skeleton with the JavaScript runtime through fixed scenarios (every animation looping, a
crossfade with a layered track and a queued animation, skins) and records bone world matrices,
drawables, draw order and events; `tests/golden.rs` replays them in Rust and compares.

- `tests/golden/rigbytron.golden.json` (checked in) covers the Rigbytron demo.
- Any other skeleton can be checked locally:

  ```bash
  node rigby-runtime/tests/golden/generate.mjs /tmp/golden/hero.golden.json path/to/hero.skel
  RIGBY_GOLDEN_DIR=/tmp/golden cargo test --release -p rigby-runtime --test golden
  ```

  On 16 sample rigs exported as both `.json` and `.skel` (about 3,500 frames, including physics,
  path, transform and slider constraints, meshes, skins, clipping and sequences) every value
  matches within a relative error of 1e-10.

### Performance

Animating one character for one frame (`cargo run --release --example bench -- <skeleton>`,
median of 2,000 frames), against the JavaScript runtime on the same machine:

| Rig | JavaScript | Rust |
| --- | ---: | ---: |
| 67 bones, 276 mesh vertices | 34.7 µs | 7.6 µs |
| 60 bones with physics constraints | 70.5 µs | 19.2 µs |
| 143 bones, 21 transform and path constraints | 76.7 µs | 20.0 µs |

## Building and testing

Needs [Rust](https://rustup.rs) (stable) and, for the Godot tests, Godot 4.3 or newer.

```bash
cd runtimes/rust
cargo test --release --workspace          # unit and golden tests
cargo build --release -p rigby-godot      # the Godot library

# Godot: copy the library into the addon, import the project, run the tests headless.
cp target/release/rigby_godot.dll ../godot/addons/rigby2d/bin/   # .so / .dylib elsewhere
godot --headless --path ../godot --import
godot --headless --path ../godot --script res://tests/test_runtime.gd
```

`runtimes/godot/tests/test_runtime.gd` checks the node against reference results from the
JavaScript runtime (`tests/expected.json`, made by `tests/make_expected.mjs`): bone transforms at
several frames of an animation, event and completion timing, tracks, queues and error handling.
`tests/capture.gd` renders the demo at fixed times into `tests/output/` (run it without
`--headless`).
