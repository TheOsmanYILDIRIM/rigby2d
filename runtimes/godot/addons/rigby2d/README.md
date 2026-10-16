# Rigby2D for Godot

Play Rigby2D animations in Godot 4.3 or newer with the `RigbySkeleton2D` node. It loads skeleton
exports (binary `.skel` 4.3 or skeleton `.json` 3.8 / 4.2 / 4.3) with their `.atlas`, and plays
them with the Rigby2D runtime written in Rust: meshes and weights, IK, transform, path, physics and
slider constraints, skins, image sequences, clipping, draw order, events, two-color tint and blend
modes, with layered tracks, crossfades and queued animations.

> **Preview.** The Godot runtime is new: try it and report issues. The prebuilt library is for
> Windows x64; on Linux and macOS, build it from source (below).

## Install

**Download** (Windows x64) from the [Releases](https://github.com/jaisurya-dev-art/rigby2d/releases)
page:

- `rigby2d-godot-addon-<version>-windows-x64.zip`: extract it into your Godot project folder (it
  contains `addons/rigby2d`), then restart the Godot editor. `RigbySkeleton2D` appears in the
  *Create New Node* dialog.
- `rigby2d-godot-demo-<version>-windows-x64.zip`: a ready-to-run project with the addon and
  Rigbytron, the Rigby2D mascot. Open its folder in Godot and press *Run*.

The library is not code-signed yet; compare the SHA-256 checksum listed with the release.

**Build from source** (any platform; needs [Rust](https://rustup.rs)):

```bash
cd runtimes/rust
cargo build --release -p rigby-godot
```

This writes `target/release/rigby_godot.dll` (Windows), `librigby_godot.so` (Linux) or
`librigby_godot.dylib` (macOS). Copy `runtimes/godot/addons/rigby2d` into your project and the
library into `addons/rigby2d/bin/`.

## Use

1. Export your skeleton from Rigby2D: *File ▸ Export .skel + atlas (4.3)* (or *Export JSON + atlas*).
   Put the `.skel`/`.json`, the `.atlas` and its page images in your project.
2. Add a `RigbySkeleton2D` node and set *Skeleton File* and *Atlas File*.
3. Pick an *Animation*. It plays in the editor too when *Playing* is on.

Skeleton units are pixels; Y points down as everywhere in Godot (the node converts from the
editor's Y-up space). Scale the node to resize the character.

```gdscript
@onready var hero: RigbySkeleton2D = $Hero

func _ready() -> void:
	hero.animation_event.connect(_on_event)
	hero.play("walk", true, 0.2)                 # track 0, 0.2 s crossfade
	hero.set_animation_on(1, "shoot", false, 0.1) # track 1 layers on top
	hero.queue(0, "idle", true, 0.3, -1.0)        # after walk ends

func _on_event(track: int, event_name: String, int_value: int, float_value: float, string_value: String, audio: String) -> void:
	if event_name == "footstep":
		$Step.play()

func _process(_delta: float) -> void:
	$Gun.transform = hero.get_bone_transform("gun-tip") # follow a bone
```

### Properties

| Property | Description |
| --- | --- |
| `skeleton_file` | `.skel` or skeleton `.json` export. |
| `atlas_file` | Texture atlas; page images load from the same folder. |
| `animation`, `looping` | Animation played on track 0 at start (and when changed). |
| `playing` | Advance animations every frame (off: drive time with `advance()`). |
| `speed` | Playback speed multiplier. |
| `skin` | Skin to show (empty: default skin). |
| `show_bones` | Draw the bones over the skeleton. |

The node's own `modulate`, `visible`, `z_index` and transform apply as usual.

### Methods

| Method | Description |
| --- | --- |
| `play(name, loop, mix)` | Plays on track 0 with a crossfade. Returns false if not found. |
| `set_animation_on(track, name, loop, mix)` | Plays on any track; higher tracks layer over lower ones. |
| `queue(track, name, loop, mix, delay)` | Plays after the current animation (`delay` < 0: when it ends). |
| `clear_track(track)`, `stop()` | Stop a track, or all of them. |
| `set_track_alpha(track, alpha)`, `set_track_time_scale(track, scale)` | Influence and speed of a track. |
| `advance(seconds)` | Moves playback forward and redraws. |
| `get_current_animation(track)`, `get_current_time(track)` | What a track plays. |
| `get_animation_names()`, `get_animation_duration(name)` | Animations. |
| `get_skin_names()`, `get_bone_names()`, `get_event_names()` | Other skeleton data. |
| `get_bone_transform(bone)`, `get_bone_position(bone)` | A bone's current transform in node space. |
| `reset_physics()` | Restarts physics simulation from the current pose. |
| `get_load_error()`, `get_draw_batch_count()` | Diagnostics. |

### Signals

| Signal | When |
| --- | --- |
| `animation_event(track, event_name, int_value, float_value, string_value, audio_path)` | An event key is passed. |
| `animation_started(track, animation_name)` | An animation starts on a track. |
| `animation_completed(track, animation_name)` | An animation reaches its end (every loop when looping). |
| `animation_ended(track, animation_name)` | An animation stops affecting the pose. |

## Notes

- Atlas pages with `pma: true` (premultiplied alpha) are handled; import them with Godot's default
  settings.
- The *screen* blend mode has no exact equivalent in Godot's canvas renderer and is approximated.
  Normal, additive and multiply match the Rigby2D editor.
- The library includes [godot-rust](https://github.com/godot-rust/gdext) (MPL-2.0) for the Godot
  bindings; keep its notice when you distribute the library.
- Rigby2D, Hoverlabs and Rigbytron names and artwork (including the demo character) are trademarks
  of Hoverlabs; see `TRADEMARKS.md` in the Rigby2D repository. The code is MIT OR Apache-2.0.
