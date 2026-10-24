class_name Scenario
extends Node
## Base class for deep-path scenario tests (see BIBLE.md, "Testing doctrine").
##
## A scenario drives the real game through real NetHack and waits on the
## bridge events it produces. Override run(); call fail()/expect() to record
## failures. The runner (tests/run_scenario.gd) reports and sets the exit code.

const DEFAULT_TIMEOUT := 20.0

var app: App
var session: NetHackSession
var game: GameScreen
var events: Array[Dictionary] = []
var failures: Array[String] = []
var ended_results: Array[Dictionary] = []
var output_dir := ""
var screenshots: Array[String] = []

var _cursor := 0


## Boots the real application (main.tscn) and records every engine event.
func setup(p_output_dir: String) -> void:
	output_dir = p_output_dir
	app = (load("res://main.tscn") as PackedScene).instantiate()
	add_child(app)
	session = app.session
	session.event_received.connect(func(event: Dictionary) -> void: events.append(event))
	session.game_ended.connect(func(result: Dictionary) -> void: ended_results.append(result))


## Starts a full game screen the way the title screen does.
func start_game(character: String, seed: String) -> GameScreen:
	mark()
	game = app.start_game(character, seed)
	await wait_for_command_prompt()
	return game


## Starts a game on a bridge fixture scenario (godot-poc/tests/fixtures):
## a real NetHack game whose level, ground and pack were set up for the test.
## fixture_env adds the bridge's older scene switches (NH_SHIM_TEST_*).
func start_fixture(character: String, scenario_id: String, fixture_env := {}) -> GameScreen:
	if not FileAccess.file_exists("res://bin/libnethack_core_fixtures.so"):
		fail("the fixture core is missing: run extension/build.sh --fixtures")
		return null
	session.fixture_id = scenario_id
	session.fixture_env = fixture_env
	mark()
	game = app.start_game(character, "424242")
	session.fixture_id = ""
	session.fixture_env = {}
	if scenario_id != "":
		var loaded := await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("name", "")).begins_with("bridge_test_scenario_"), "the fixture scenario")
		expect(loaded.get("name") == "bridge_test_scenario_loaded", "fixture %s loaded (%s)" % [scenario_id, loaded])
	await wait_for_command_prompt()
	return game


## Clicks the centre of a control with real mouse events (double = a
## double-click: two clicks, the second flagged as such).
func click_control(control: Control, double := false) -> void:
	var at := control.get_global_rect().get_center()
	await click_at(at)
	if double:
		for pressed in [true, false]:
			var event := InputEventMouseButton.new()
			event.button_index = MOUSE_BUTTON_LEFT
			event.position = at
			event.global_position = at
			event.pressed = pressed
			event.double_click = pressed
			Input.parse_input_event(event)
			await get_tree().process_frame


## Presses a key through Godot's input pipeline, exactly like a player.
func press(keycode: Key, unicode := 0, shift := false, ctrl := false) -> void:
	for pressed in [true, false]:
		var event := InputEventKey.new()
		event.keycode = keycode
		event.physical_keycode = keycode
		event.unicode = unicode if pressed else 0
		event.shift_pressed = shift
		event.ctrl_pressed = ctrl
		event.pressed = pressed
		Input.parse_input_event(event)
		await get_tree().process_frame


## Types characters as key presses (letters, digits, punctuation).
func type_text(text: String) -> void:
	for i in text.length():
		var ch := text[i]
		var code := ch.unicode_at(0)
		var keycode: Key = OS.find_keycode_from_string(ch.to_upper()) if ch.to_upper() != ch.to_lower() else OS.find_keycode_from_string(ch)
		await press(keycode, code, ch != ch.to_lower())


## Keys NetHack ran as commands since an event index (keycode 0 = any). The
## bridge logs every key it reads as bridge_command; one that answered a
## question is followed by its *_answer event and isn't counted.
func commands_run(keycode: int, since: int) -> Array:
	var run := []
	for i in range(since, events.size()):
		var e: Dictionary = events[i]
		if e.get("name") != "bridge_command" or (keycode != 0 and int(e.get("keycode", 0)) != keycode):
			continue
		var next := str(events[i + 1].get("name", "")) if i + 1 < events.size() else ""
		if not next.ends_with("_answer"):
			run.append(e)
	return run


## Clicks at a screen position with a real mouse event.
func click_at(position: Vector2, button := MOUSE_BUTTON_LEFT) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = position
	motion.global_position = position
	Input.parse_input_event(motion)
	await get_tree().process_frame
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = button
		event.position = position
		event.global_position = position
		event.pressed = pressed
		Input.parse_input_event(event)
		await get_tree().process_frame


## Drags with a real mouse from one screen position to another, in steps
## (Godot starts a drag after a few pixels of motion with the button held).
## mid: a screenshot name to take while hovering over the target.
func drag_between(from: Vector2, to: Vector2, mid := "") -> void:
	var press_event := InputEventMouseButton.new()
	press_event.button_index = MOUSE_BUTTON_LEFT
	press_event.position = from
	press_event.global_position = from
	press_event.pressed = true
	var hover := InputEventMouseMotion.new()
	hover.position = from
	hover.global_position = from
	Input.parse_input_event(hover)
	await get_tree().process_frame
	Input.parse_input_event(press_event)
	await get_tree().process_frame
	for i in range(1, 13):
		var motion := InputEventMouseMotion.new()
		motion.position = from.lerp(to, i / 12.0)
		motion.global_position = motion.position
		motion.button_mask = MOUSE_BUTTON_MASK_LEFT
		motion.relative = (to - from) / 12.0
		Input.parse_input_event(motion)
		await get_tree().process_frame
	if mid != "":
		await screenshot(mid)
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.position = to
	release.global_position = to
	release.pressed = false
	Input.parse_input_event(release)
	await get_tree().process_frame


## Waits until the smoothed camera stops moving, so a computed screen
## position still covers the same map cell when the click lands.
func settle_camera() -> void:
	var last := Vector2(INF, INF)
	for i in 120:
		var now := game.world.camera.get_screen_center_position()
		if now.distance_to(last) < 0.05:
			return
		last = now
		await get_tree().process_frame


func click_cell(cell: Vector2i, button := MOUSE_BUTTON_LEFT) -> void:
	await settle_camera()
	await click_at(game.world.screen_of_cell(cell), button)


func hover_cell(cell: Vector2i) -> void:
	await settle_camera()
	var motion := InputEventMouseMotion.new()
	motion.position = game.world.screen_of_cell(cell)
	motion.global_position = motion.position
	Input.parse_input_event(motion)
	await get_tree().process_frame


func run() -> void:
	fail("Scenario.run() not overridden")


func fail(message: String) -> void:
	failures.append(message)
	push_error("FAIL: " + message)


func expect(condition: bool, message: String) -> bool:
	if not condition:
		fail(message)
	return condition


func note(message: String) -> void:
	print("  · ", message)


## Lets animations settle, then saves the rendered frame as
## <output>/NN-<label>.png. Every screenshot must be opened and inspected.
func screenshot(label: String, settle_seconds := 0.6) -> String:
	await get_tree().create_timer(settle_seconds).timeout
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	if image == null or image.is_empty():
		note("no rendered frame for %s (headless run)" % label)
		return ""
	var path := output_dir.path_join("%02d-%s.png" % [screenshots.size() + 1, label])
	image.save_png(path)
	screenshots.append(path)
	note("screenshot " + path)
	return path


## Waits for the next event (after previously consumed ones) matching
## predicate. Returns it, or {} after recording a failure on timeout.
func wait_for_event(predicate: Callable, what: String, timeout := DEFAULT_TIMEOUT) -> Dictionary:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000.0)
	while true:
		while _cursor < events.size():
			var event := events[_cursor]
			_cursor += 1
			if predicate.call(event):
				return event
		if Time.get_ticks_msec() > deadline:
			fail("timed out waiting for " + what)
			return {}
		await get_tree().process_frame
	return {}


func wait_for_named(event_name: String, timeout := DEFAULT_TIMEOUT) -> Dictionary:
	return await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == event_name, event_name, timeout)


func wait_for_command_prompt(timeout := DEFAULT_TIMEOUT) -> Dictionary:
	return await wait_for_named("bridge_command_prompt", timeout)


## Waits for the game to end, answering every prompt with Escape (the
## generic "decline" for NetHack's end-of-game questions).
func wait_for_game_end(timeout := DEFAULT_TIMEOUT) -> Dictionary:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000.0)
	var answered := 0
	while ended_results.is_empty():
		while _cursor < events.size():
			var event := events[_cursor]
			_cursor += 1
			if event.get("lifecycle") == "opened" or event.get("name") == "shim_display_nhwindow" and event.get("blocking", 0) != 0:
				# Never Escape a yes/no question: on NetHack's end-of-game
				# questions it means "Program in disorder".
				var choices := str(event.get("choices", ""))
				if event.get("name") == "shim_yn_function" and choices != "":
					session.send_keys("q" if choices.contains("q") else ("n" if choices.contains("n") else "y"))
				else:
					session.send_escape()
				answered += 1
		if Time.get_ticks_msec() > deadline:
			fail("timed out waiting for the game to end (answered %d prompts)" % answered)
			return {}
		await get_tree().process_frame
	return ended_results.pop_front()


## Skips everything consumed so far; later waits only see newer events.
func mark() -> void:
	_cursor = events.size()


func events_named(event_name: String, since := 0) -> Array[Dictionary]:
	var found: Array[Dictionary] = []
	for i in range(since, events.size()):
		if events[i].get("name") == event_name:
			found.append(events[i])
	return found


func hero_position(since := 0) -> Vector2i:
	var position := Vector2i(-1, -1)
	for event in events_named("shim_curs", since):
		if event.get("actorId") == "hero":
			position = Vector2i(int(event["x"]), int(event["y"]))
	return position
