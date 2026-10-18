class_name GameScreen
extends Node
## One game in progress: the world, the HUD and the dialogs, wired to a
## GameState fed by the NetHackSession. Owns input routing: classic NetHack
## keys go straight to the game whenever no dialog owns them.

signal finished(summary: Dictionary)

var session: NetHackSession
var state := GameState.new()
var danger: DangerAlert
var status_announcer: StatusAnnouncer
var status_effects: StatusScreenEffects
var world: WorldView
var hud: Hud
var dialogs: DialogHost
var input_router: InputRouter
var character_spec := ""


func _init(p_session: NetHackSession) -> void:
	session = p_session


func _ready() -> void:
	# Unknown rock behind the map (see world_backdrop.gdshader).
	var backdrop_layer := CanvasLayer.new()
	backdrop_layer.layer = -10
	add_child(backdrop_layer)
	var backdrop := ColorRect.new()
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var backdrop_material := ShaderMaterial.new()
	backdrop_material.shader = load("res://game/world/world_backdrop.gdshader")
	backdrop.material = backdrop_material
	backdrop_layer.add_child(backdrop)

	world = WorldView.new()
	world.name = "World"
	add_child(world)
	world.setup(state)

	# Created first so the HUD can bind to it; added to the tree below.
	input_router = InputRouter.new()
	input_router.name = "InputRouter"

	hud = Hud.new()
	hud.name = "Hud"
	add_child(hud)
	hud.setup(self)

	dialogs = DialogHost.new()
	dialogs.name = "Dialogs"
	add_child(dialogs)
	dialogs.setup(self)

	add_child(input_router)
	input_router.setup(self)

	var gamepad := GamepadRouter.new()
	add_child(gamepad)
	gamepad.setup(self)
	gamepad.pad_mode_changed.connect(func(_pad: bool) -> void: hud.action_bar.relabel())
	if App.instance:
		App.instance.settings.changed.connect(hud.action_bar.relabel)

	session.event_received.connect(_on_event)
	session.events_drained.connect(state.end_batch)
	state.game_over.connect(_on_game_over)
	FeedbackDirector.new().attach(self)
	EndChronicle.new().attach(self)
	AudioDirector.new().attach(self)
	# Hunger, low HP and deadly states, above everything (even open panels).
	danger = DangerAlert.new()
	add_child(danger)
	danger.setup(self)
	# Every negative status announced when it starts, and felt on the map.
	status_announcer = StatusAnnouncer.new()
	add_child(status_announcer)
	status_announcer.setup(self)
	status_effects = StatusScreenEffects.new()
	add_child(status_effects)
	status_effects.setup(self)


func begin(spec: String, seed := "", options := NetHackSession.DEFAULT_OPTIONS) -> Error:
	character_spec = spec
	state.set_character(spec)
	session.keep_diagnostics = App.instance != null and App.instance.settings.keep_diagnostics
	return session.start_game(spec, seed, options)


func _on_event(event: Dictionary) -> void:
	state.apply(event)


func send_keys(text: String) -> void:
	if state.is_waiting_for_command():
		_note_direction(text)
		input_router.note_sent(text)
		state.answer_pending = true
	session.send_keys(text)


## A map click (travel, or a cell picked for NetHack's cursor).
func send_map_click(cell: Vector2i) -> void:
	if state.is_waiting_for_command():
		state.answer_pending = true
	session.send_map_click(cell, 1)


## Remembers which way a move or fight command points (F/G prefixes, counts).
func _note_direction(text: String) -> void:
	# A count comes off first ("20" in vi-keys, "n20" under number_pad, where
	# digits are directions and n is not a move), then one prefix.
	var keys := text
	if state.number_pad:
		if keys.begins_with("n"):
			keys = keys.substr(1).lstrip("0123456789")
	else:
		keys = keys.lstrip("0123456789")
	if keys.length() > 1 and keys[0] in ["F", "G", "g", "m"]:
		keys = keys.substr(1)
	if keys.length() >= 1:
		var index := state.dirchars.find(keys[0].to_lower() if not state.number_pad else keys[0])
		if index >= 0 and index < 8:
			state.last_direction = GameState.DIRECTION_ORDER[index]


func send_keycode(code: int) -> void:
	session.send_keycode(code)


func _on_game_over(info: Dictionary) -> void:
	finished.emit(info)


## The run is over: hide the game's interface and stop taking input, so
## nothing reaches a finished session behind the end screen.
func retire() -> void:
	hud.visible = false
	dialogs.visible = false
	input_router.set_process_unhandled_input(false)
	var pad := get_node_or_null("GamepadRouter")
	if pad:
		pad.set_process_input(false)
		pad.set_process(false)
	world.visible = false
	# Overlays on their own layers (the danger alert and red glow, the hurt
	# vignette...) don't follow the HUD: hide them so the end screen reads clean.
	for layer in find_children("*", "CanvasLayer", true, false):
		(layer as CanvasLayer).visible = false
	if danger:
		danger.process_mode = Node.PROCESS_MODE_DISABLED


## Saves the run with NetHack's own S command; true if a save was started.
func save_and_quit() -> bool:
	if not state.is_waiting_for_command():
		return false
	state.auto_confirm_save = true
	send_keys("S")
	return true


## Emitted when a save asked for by save_from_anywhere didn't happen.
signal save_failed
var _saving := false
var _save_sent := false


## Saves from wherever NetHack is: each open question gets its safe answer
## (no, quit, Esc) until the command prompt, then S and "Really save?" y.
func save_from_anywhere() -> void:
	if _saving:
		return
	# Nothing automated may answer NetHack's questions while it saves.
	input_router.cancel_automation(true)
	_saving = true
	_save_sent = false
	if not state.request_changed.is_connected(_drive_save):
		state.request_changed.connect(_drive_save)
	_drive_save(state.request)


func _drive_save(request: Dictionary) -> void:
	if not _saving:
		return
	var kind := str(request.get("kind", ""))
	match kind:
		"command":
			if _save_sent:
				# Back at the prompt without exiting: the save didn't happen.
				_saving = false
				state.auto_confirm_save = false
				save_failed.emit()
				return
			_save_sent = true
			save_and_quit()
		"yn":
			var query := str(request.get("query", "")).to_lower()
			if query.contains("really save"):
				return  # DialogHost answers y (auto_confirm_save)
			var choices := str(request.get("choices", ""))
			send_keys("q" if choices.contains("q") else ("n" if choices.contains("n") else char(27)))
		"key":
			send_keys(" ")
		"busy", "":
			pass
		_:
			send_keycode(27)
