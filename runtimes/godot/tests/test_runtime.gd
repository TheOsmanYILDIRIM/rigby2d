# SPDX-License-Identifier: MIT OR Apache-2.0
# Headless tests of the RigbySkeleton2D node against reference results from the JavaScript
# runtime (tests/expected.json). Run:
#   godot --headless --path runtimes/godot --script res://tests/test_runtime.gd
# Exits with code 0 when every check passes, 1 otherwise.
extends SceneTree

const SKEL := "res://demo/rigbytron/rigbytron.skel"
const ATLAS := "res://demo/rigbytron/rigbytron.atlas"

var failures: Array[String] = []
var checks := 0
var callbacks: Array = []
var step := 0


func check(ok: bool, what: String) -> void:
	checks += 1
	if not ok:
		failures.append(what)
		printerr("FAIL: ", what)


func near(a: float, b: float, tolerance: float) -> bool:
	return absf(a - b) <= tolerance * maxf(1.0, maxf(absf(a), absf(b)))


func _initialize() -> void:
	var expected: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/expected.json"))
	check(expected != null, "expected.json is readable")

	var node := RigbySkeleton2D.new()
	node.playing = false
	node.skeleton_file = SKEL
	node.atlas_file = ATLAS
	root.add_child(node)

	# Loading and metadata.
	check(node.get_load_error() == "", "loads without error: " + node.get_load_error())
	check(Array(node.get_animation_names()) == ["hold", "release"], "animation names: %s" % [node.get_animation_names()])
	check(near(node.get_animation_duration("release"), 1.6, 1e-6), "release lasts 1.6 s")
	check(node.get_bone_names().size() == 11, "11 bones")
	check(Array(node.get_event_names()) == ["slash"], "event names")
	check(Array(node.get_skin_names()) == ["default"], "skin names")
	check(node.get_draw_batch_count() > 0, "setup pose draws")

	# Playback, matching the JavaScript runtime frame by frame.
	node.animation_event.connect(func(track, event_name, _i, _f, _s, _a): callbacks.append({"step": step, "track": track, "name": event_name}))
	node.animation_completed.connect(func(track, animation_name): callbacks.append({"step": step, "track": track, "complete": animation_name}))
	var started := []
	node.animation_started.connect(func(track, animation_name): started.append([track, animation_name]))
	check(node.play("release", false, 0.0), "play release")
	check(started == [[0, "release"]], "animation_started fired: %s" % [started])
	check(not node.play("missing", false, 0.0), "unknown animation is refused")

	var frames: Array = expected.frames
	var f := 0
	for s in range(1, int(expected.steps) + 1):
		step = s
		node.advance(expected.dt)
		if f < frames.size() and int(frames[f].step) == s:
			var frame: Dictionary = frames[f]
			for bone in frame.bones:
				var want: Array = frame.bones[bone]
				var got := node.get_bone_transform(bone)
				# Godot axes: Y down, so world (x, y) is (x, -y) and angles flip sign.
				check(near(got.origin.x, want[0], 1e-4) and near(got.origin.y, -want[1], 1e-4), "step %d bone %s position %s, expected (%f, %f)" % [s, bone, got.origin, want[0], -want[1]])
				check(absf(wrapf(rad_to_deg(got.get_rotation()) + want[2], -180.0, 180.0)) < 1e-2, "step %d bone %s rotation %f, expected %f" % [s, bone, -rad_to_deg(got.get_rotation()), want[2]])
			f += 1
	check(f == frames.size(), "all reference frames checked")

	var want_callbacks: Array = expected.events
	check(callbacks.size() == want_callbacks.size(), "callbacks %s, expected %s" % [callbacks, want_callbacks])
	for i in mini(callbacks.size(), want_callbacks.size()):
		var got: Dictionary = callbacks[i]
		var want: Dictionary = want_callbacks[i]
		check(int(got.step) == int(want.step) and got.get("name", "") == want.get("name", "") and got.get("complete", "") == want.get("complete", ""), "callback %d: %s, expected %s" % [i, got, want])

	# Track control.
	check(node.get_current_animation(0) == "release", "current animation")
	check(near(node.get_current_time(0), 1.6, 1e-6), "time after 48 frames")
	check(node.queue(0, "hold", true, 0.2, -1.0), "queue hold")
	node.set_animation_on(1, "hold", true, 0.0)
	node.set_track_alpha(1, 0.5)
	node.advance(0.1)
	check(node.get_current_animation(1) == "hold", "layered track plays")
	node.clear_track(1)
	check(node.get_current_animation(1) == "", "cleared track is empty")
	node.stop()
	check(node.get_current_animation(0) == "", "stop clears every track")

	# Missing files report an error instead of crashing.
	var broken := RigbySkeleton2D.new()
	broken.atlas_file = ATLAS
	broken.skeleton_file = "res://missing.skel"
	root.add_child(broken)
	check(broken.get_load_error() != "", "a missing file reports an error")

	print("%d checks, %d failed" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)
