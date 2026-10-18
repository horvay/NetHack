class_name GamepadRouter
extends Node
## Controller play. In the world: left stick moves in 8 directions (hold
## to keep walking), the D-pad in 4, A does the main thing where you stand
## (stairs, pick up, open...), B cancels, X opens the pack, Y the command
## palette, Start the game menu, Back the map overview, bumpers zoom (or go
## up/down in a direction prompt), hold the right trigger to run, click the
## right stick to look around. In dialogs the D-pad/stick move focus, A
## presses, B backs out.

const DEADZONE := 0.5
const REPEAT := 0.16

var screen: GameScreen
var _stick := Vector2.ZERO
var _repeat := 0.0
var _run_held := false
var _look_armed := true
static var active := false
## The player switched between the pad and the keyboard or mouse (hints
## follow whichever was used last).
signal pad_mode_changed(pad: bool)


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	name = "GamepadRouter"


func _input(event: InputEvent) -> void:
	if event is InputEventKey or event is InputEventMouseButton:
		if active and event.is_pressed():
			active = false
			pad_mode_changed.emit(false)
		return
	if not (event is InputEventJoypadButton or event is InputEventJoypadMotion):
		return
	# Stick noise alone doesn't count as picking the pad up.
	if not active and (event is InputEventJoypadButton or absf((event as InputEventJoypadMotion).axis_value) > 0.5):
		active = true
		pad_mode_changed.emit(true)
	# Track the sticks and triggers always, so nothing is stale after a dialog.
	if event is InputEventJoypadMotion:
		var motion := event as InputEventJoypadMotion
		match motion.axis:
			JOY_AXIS_LEFT_X:
				_stick.x = motion.axis_value
			JOY_AXIS_LEFT_Y:
				_stick.y = motion.axis_value
			JOY_AXIS_TRIGGER_RIGHT:
				_run_held = motion.axis_value > 0.5
	if screen.dialogs.owns_input():
		_dialog_input(event)
		return
	if event is InputEventJoypadMotion:
		return
	var button := event as InputEventJoypadButton
	if not button.pressed:
		return
	get_viewport().set_input_as_handled()
	# Only buttons that act in the world stop a running action (looking at
	# the pack, the palette or the map doesn't).
	# (Steps, A and R3 cancel inside, once they know they send something.)
	if button.button_index == JOY_BUTTON_B:
		screen.input_router.cancel_automation()
	match button.button_index:
		JOY_BUTTON_DPAD_UP: _step(Vector2i(0, -1))
		JOY_BUTTON_DPAD_DOWN: _step(Vector2i(0, 1))
		JOY_BUTTON_DPAD_LEFT: _step(Vector2i(-1, 0))
		JOY_BUTTON_DPAD_RIGHT: _step(Vector2i(1, 0))
		JOY_BUTTON_A: _primary()
		JOY_BUTTON_B: screen.send_keycode(27)
		JOY_BUTTON_X: screen.input_router.open_ui("inventory")
		JOY_BUTTON_Y: screen.input_router.open_ui("palette")
		JOY_BUTTON_START: screen.input_router.open_ui("game_menu")
		JOY_BUTTON_RIGHT_STICK:
			if screen.state.is_waiting_for_command():
				screen.input_router.cancel_automation()
				screen.input_router.send_command(";")
		JOY_BUTTON_BACK: screen.world.toggle_overview()
		JOY_BUTTON_LEFT_SHOULDER:
			if screen.state.request.get("kind") == "direction":
				screen.send_keys("<")
			else:
				screen.world.zoom_out()
		JOY_BUTTON_RIGHT_SHOULDER:
			if screen.state.request.get("kind") == "direction":
				screen.send_keys(">")
			else:
				screen.world.zoom_in()


func _process(delta: float) -> void:
	if _stick.length() < DEADZONE or screen.dialogs.owns_input():
		_repeat = 0.0
		return
	_repeat -= delta
	if _repeat > 0.0:
		return
	_repeat = REPEAT
	# Snap the stick to the nearest of NetHack's 8 directions.
	var angle := snappedf(_stick.angle(), PI / 4.0)
	var dir := Vector2i(roundi(cos(angle)), roundi(sin(angle)))
	if screen.state.is_waiting_for_command() or screen.state.request.get("kind") in ["direction", "map_target"]:
		_step(dir)


func _step(dir: Vector2i) -> void:
	var key := screen.state.direction_key(dir)
	if key == "":
		return
	var kind := str(screen.state.request.get("kind", ""))
	if kind == "command" and not screen.state.is_waiting_for_command():
		return  # the prompt is already taken
	if kind == "command":
		# A step at the command prompt reaches NetHack: it stops automation.
		screen.input_router.cancel_automation()
	if kind == "command" and _run_held:
		# Run: shifted direction, or the G prefix when digits are directions.
		screen.send_keys(("G" + key) if screen.state.number_pad else key.to_upper())
		_stick = Vector2.ZERO
	elif kind == "command" or kind == "direction" or kind == "map_target":
		screen.send_keys(key)


## A hint for the player's current device: keyboard text, or the pad's.
static func hint(keyboard: String, pad: String) -> String:
	return pad if active else keyboard


## A: the first context action where the hero stands; in a direction or
## position prompt it confirms "here".
func _primary() -> void:
	var kind := str(screen.state.request.get("kind", ""))
	if kind == "key":
		screen.send_keys(" ")
		return
	if kind == "map_target":
		screen.send_keys(".")
		return
	if kind == "direction":
		screen.send_keys(".")
		return
	if not screen.state.is_waiting_for_command():
		return
	screen.input_router.cancel_automation()
	for action in CellActions.for_cell(screen.state, screen.state.map.hero):
		if action.primary and (str(action.keys) != "" or action.id == "pickup"):
			screen.input_router.run_cell_action(screen.state.map.hero, action)
			return
	screen.input_router.send_command("s")


func _dialog_input(event: InputEvent) -> void:
	# An "Are you sure?" card sits on top of everything: it comes first.
	var modal := screen.dialogs.blocking_modal()
	var dialog: Control = modal if modal else (screen.dialogs.active if is_instance_valid(screen.dialogs.active) else null)
	if dialog == null:
		return
	var focused := get_viewport().gui_get_focus_owner()
	if focused == null or not dialog.is_ancestor_of(focused):
		focus_dialog(dialog)
	if event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_B:
		var escape := InputEventKey.new()
		escape.keycode = KEY_ESCAPE
		escape.pressed = true
		if dialog.has_method("handle_key"):
			dialog.handle_key(escape)
		get_viewport().set_input_as_handled()


## Focuses a dialog's safe answer when it declares one (No, Cancel...),
## otherwise its first button: A must never confirm by accident.
## (Untyped: it is often called deferred, after the dialog may be freed.)
static func focus_dialog(target) -> void:
	if not is_instance_valid(target) or not (target is Control) or not (target as Control).is_inside_tree():
		return
	var dialog := target as Control
	var owner := dialog.get_viewport().gui_get_focus_owner()
	if owner and dialog.is_ancestor_of(owner):
		return
	var safe: Variant = dialog.get_meta("safe_focus") if dialog.has_meta("safe_focus") else null
	if safe is Control and is_instance_valid(safe):
		(safe as Control).focus_mode = Control.FOCUS_ALL
		(safe as Control).grab_focus()
		return
	var first := _first_focusable(dialog)
	if first:
		first.grab_focus()


static func _first_focusable(node: Node) -> Control:
	for child in node.get_children():
		if child is BaseButton and (child as Control).is_visible_in_tree() and not (child as BaseButton).disabled:
			(child as Control).focus_mode = Control.FOCUS_ALL
			return child
		var found := _first_focusable(child)
		if found:
			return found
	return null
