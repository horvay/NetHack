class_name ActionBar
extends HBoxContainer
## The bottom bar: context actions for where the hero stands (stairs, piles,
## fountains...) first, then the always-useful verbs. Every button shows its
## classic key, so the mouse teaches the keyboard.

var screen: GameScreen
var _context_box: HBoxContainer
var _buttons: Dictionary = {}

const ALWAYS := [
	{"id": "inventory", "label": "Inventory", "key": "i", "ui": "inventory"},
	{"id": "equipment", "label": "Equipment", "key": "", "ui": "equipment"},
	{"id": "cast", "label": "Cast", "key": "Z", "keys": "Z"},
	{"id": "spells", "label": "Spells", "key": "+", "keys": "+"},
	{"id": "search", "label": "Search", "key": "s", "keys": "s"},
	{"id": "rest", "label": "Rest", "key": "", "keys": "s"},
	{"id": "look", "label": "Look", "key": ";", "ui": "look"},
	{"id": "map", "label": "Map", "key": "Tab", "ui": "overview"},
	{"id": "commands", "label": "Commands", "key": "#", "ui": "palette"},
	{"id": "menu", "label": "Menu", "key": "Esc", "ui": "game_menu"},
]


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	anchor_left = 0.5
	anchor_right = 0.5
	anchor_top = 1.0
	anchor_bottom = 1.0
	grow_horizontal = Control.GROW_DIRECTION_BOTH
	offset_top = -74
	offset_bottom = -18
	alignment = BoxContainer.ALIGNMENT_CENTER
	add_theme_constant_override("separation", 6)
	_context_box = HBoxContainer.new()
	_context_box.add_theme_constant_override("separation", 6)
	add_child(_context_box)
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(10, 0)
	add_child(spacer)
	for spec in ALWAYS:
		if spec.id == "search":
			_add_mode_button()
		var button := _make_button(spec.label, _hint_key(spec), false)
		button.pressed.connect(_on_pressed.bind(spec))
		add_child(button)
		_buttons[spec.id] = button
		if spec.id == "rest":
			_add_rest_count()
	# Spell buttons only for heroes who know a spell.
	var show_spells := func() -> void:
		var known := screen.state.known_spells != 0
		_buttons["cast"].visible = known
		_buttons["spells"].visible = known
	screen.state.spells_changed.connect(show_spells)
	show_spells.call()
	screen.state.request_changed.connect(func(_r: Dictionary) -> void: _refresh_context())
	screen.state.map_changed.connect(_refresh_context)
	screen.state.message_added.connect(_on_message)
	screen.state.hero_moved.connect(func(_f: Vector2i, _t: Vector2i) -> void: lock_actions.clear())


## The pad buttons for the bar's verbs (the rest have none).
const PAD_KEYS := {"inventory": "X", "commands": "Y", "menu": "Start", "map": "Back", "look": "R3"}


func _hint_key(spec: Dictionary) -> String:
	return str(PAD_KEYS.get(spec.id, "")) if GamepadRouter.active else str(spec.key)


## Shows the keyboard's keys or the pad's buttons, whichever is in use.
func relabel() -> void:
	for spec in ALWAYS:
		var button: Button = _buttons.get(spec.id)
		if button:
			var key := _hint_key(spec)
			button.text = spec.label if key == "" or not Motion.key_hints() else "%s  %s" % [spec.label, key]
	# Context buttons are relabelled in place: rebuilding them here would
	# swallow the very click that switched back from the pad.
	for button in _context_box.get_children():
		if button is Button and button.has_meta("action_label"):
			button.text = _context_text(str(button.get_meta("action_label")), str(button.get_meta("action_keys")))


func _context_text(label: String, keys: String) -> String:
	var hint := keys if keys.length() == 1 and keys.unicode_at(0) >= 32 and not GamepadRouter.active else ""
	return label if hint == "" or not Motion.key_hints() else "%s  %s" % [label, hint]


func _make_button(text: String, key: String, primary: bool) -> Button:
	var button := Button.new()
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(0, 50)
	button.text = text if key == "" or not Motion.key_hints() else "%s  %s" % [text, key]
	button.add_theme_font_size_override("font_size", 17)
	if primary:
		button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("2a2414"), Color(UiTheme.GOLD, 0.8)))
		button.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.2))
	return button


func _on_pressed(spec: Dictionary) -> void:
	if spec.has("ui"):
		screen.input_router.open_ui(spec.ui)
	elif spec.id == "rest":
		# Rest = search N turns, N from the stepper beside it.
		screen.input_router.send_counted(int(rest_count.value), "s")
	elif spec.has("keys"):
		screen.input_router.send_command(str(spec["keys"]))


const MODES := {"walk": ["Walk", "Clicks travel or step"], "run": ["Run", "Clicks run that way (Shift+direction)"],
	"fight": ["Fight", "The next click attacks that square (F)"]}
var mode_button: Button
var rest_count: SpinBox


## Walk / Run / Fight for mouse and pad players (keyboard players have
## Shift and F).
func _add_mode_button() -> void:
	mode_button = _make_button("", "", false)
	mode_button.custom_minimum_size = Vector2(140, 50)
	mode_button.pressed.connect(func() -> void:
		var order := ["walk", "run", "fight"]
		screen.input_router.move_mode = order[(order.find(screen.input_router.move_mode) + 1) % order.size()])
	add_child(mode_button)
	screen.input_router.move_mode_changed.connect(_show_mode)
	_show_mode.call_deferred(screen.input_router.move_mode)


func _show_mode(mode: String) -> void:
	mode_button.text = "Move: " + str(MODES[mode][0])
	mode_button.tooltip_text = str(MODES[mode][1]) + ". Click to change."
	var color := UiTheme.INK if mode == "walk" else (UiTheme.GOLD if mode == "run" else UiTheme.BAD)
	mode_button.add_theme_color_override("font_color", color)


func _add_rest_count() -> void:
	rest_count = SpinBox.new()
	rest_count.min_value = 1
	rest_count.max_value = 999
	rest_count.value = 20
	rest_count.custom_arrow_step = 5
	rest_count.suffix = "turns"
	rest_count.custom_minimum_size = Vector2(118, 50)
	rest_count.tooltip_text = "How many turns Rest waits: scroll or use the arrows"
	# A stepper, never a text field: it must not take the keyboard from the
	# game (change it with its arrows or the mouse wheel).
	rest_count.focus_mode = Control.FOCUS_NONE
	rest_count.get_line_edit().editable = false
	rest_count.get_line_edit().focus_mode = Control.FOCUS_NONE
	rest_count.get_line_edit().mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(rest_count)


var _last_context_key := ""
const MAX_CONTEXT := 3
## Follow-ups offered after NetHack reports a lock ("This door is locked").
var lock_actions: Array[Dictionary] = []


func _run_action(action: Dictionary) -> void:
	screen.dialogs.confirm_action(action, screen.input_router.run_cell_action.bind(screen.state.map.hero, action))


## A wielded weapon #force accepts (src/lock.c u_have_forceable_weapon):
## not launchers, missiles, whips, flails or unicorn horns.
static func _forces_locks(item: Dictionary) -> bool:
	var text := str(item.get("text", "")).to_lower()
	# Wielded, however NetHack words it ("weapon in", "wielded in",
	# "tethered to"): the wielded bit of wornMask.
	if int(item.get("wornMask", 0)) & 0x100 == 0 or str(item.get("publicClass", "weapon")) not in ["weapon", "tool"]:
		return false
	return RegEx.create_from_string("\\b(bow|yumi|sling|crossbow|arrows?|ya|bolts?|darts?|shuriken|throwing stars?|boomerang|(bull)?whip|flail|grappling hook|rubber hose|unicorn horn)\\b").search(text) == null


static var RESOLVED_LOCK := RegEx.create_from_string("succeed in (picking|unlocking|forcing)|crashes open|you break open|door opens|shatters|totally destroyed|you open the|you unlock")


func _on_message(entry: Dictionary) -> void:
	# Lines restored with a saved game's history are not news.
	if entry.get("history", false):
		return
	var text := str(entry.text).to_lower()
	# The lock is dealt with: picked, forced, kicked in, or the door is open.
	if not lock_actions.is_empty() and RESOLVED_LOCK.search(text) != null:
		lock_actions.clear()
		_last_context_key = ""
		_refresh_context()
		return
	if not text.contains("locked"):
		return
	var level := App.instance.settings.contextual_prompts if App.instance else "full"
	var tool := CellActions._unlock_tool(screen.state)
	# Settings > Locked-door suggestions: off, or only with an unlocking tool.
	if level == "off" or (level == "essential" and tool.is_empty()):
		return
	if text.contains("this door is locked") or text.contains("door is locked"):
		lock_actions.clear()
		# The door the hero just bumped, when we know it; else every
		# neighbouring closed door.
		var deltas: Array = GameState.DIRECTION_ORDER
		var bumped: Vector2i = screen.state.last_direction
		if Terrain.classify(screen.state.map.cell(screen.state.map.hero + bumped)).kind == Terrain.Kind.DOOR_CLOSED:
			deltas = [bumped]
		for delta in deltas:
			var cell: Vector2i = screen.state.map.hero + delta
			if Terrain.classify(screen.state.map.cell(cell)).kind == Terrain.Kind.DOOR_CLOSED:
				var dir := screen.state.direction_key(delta)
				if not tool.is_empty():
					lock_actions.append({"id": "lock-unlock", "label": "Unlock with " + str(tool.name), "keys": "a" + str(tool.letter) + dir, "command": "a" + str(tool.letter), "dir": dir, "primary": true})
				lock_actions.append({"id": "lock-kick", "label": "Kick it open", "keys": char(4) + dir, "command": char(4), "dir": dir, "primary": true})
		_last_context_key = ""
		_refresh_context()
	elif text.contains("turns out to be locked") or text.contains("is locked"):
		lock_actions.clear()
		# #force needs a wielded weapon (src/lock.c doforce).
		if screen.state.inventory.any(_forces_locks):
			lock_actions.append({"id": "lock-force", "label": "Force the lock", "keys": "#force\n", "primary": true})
		if not tool.is_empty():
			lock_actions.append({"id": "lock-unlock", "label": "Unlock with " + str(tool.name), "keys": "a" + str(tool.letter) + ".", "command": "a" + str(tool.letter), "dir": ".", "primary": true})
		_last_context_key = ""
		_refresh_context()


func _refresh_context() -> void:
	var state := screen.state
	var actions: Array[Dictionary] = []
	if state.is_waiting_for_command() and state.map.hero.x >= 0:
		# What to do about the lock NetHack just reported comes first; "Open
		# door" would only repeat "This door is locked".
		actions.append_array(lock_actions)
		for action in CellActions.for_cell(state, state.map.hero):
			if action.id in ["stairs", "pickup", "loot", "quaff-fountain", "offer", "read-here", "sit", "eat-floor"]:
				actions.append(action)
		for action in CellActions.neighbour_actions(state):
			if lock_actions.is_empty() or action.id != "open":
				actions.append(action)
	var key := ",".join(actions.map(func(a: Dictionary) -> String: return str(a.id) + str(a.label)))
	if key == _last_context_key:
		return
	_last_context_key = key
	for child in _context_box.get_children():
		child.queue_free()
	# Three context buttons at most; the rest sit behind "More…", so the bar
	# never runs off the screen.
	var overflow: Array[Dictionary] = []
	if actions.size() > MAX_CONTEXT:
		overflow = actions.slice(MAX_CONTEXT - 1)
		actions = actions.slice(0, MAX_CONTEXT - 1)
	if not overflow.is_empty():
		var more := _make_button("More…  %d" % overflow.size(), "", false)
		var popup := PopupMenu.new()
		popup.theme = UiTheme.theme()
		for i in overflow.size():
			popup.add_item(str(overflow[i].label), i)
		popup.id_pressed.connect(func(id: int) -> void: _run_action(overflow[id]))
		more.add_child(popup)
		more.pressed.connect(func() -> void:
			popup.reset_size()
			popup.popup(Rect2i(Vector2i(more.get_screen_position()) - Vector2i(0, popup.size.y + 8), Vector2i.ZERO)))
		_context_box.add_child(more)
	for action in actions:
		var danger := str(action.get("danger", ""))
		var button := _make_button("", "", danger == "")
		button.set_meta("action_label", str(action.label))
		button.set_meta("action_keys", str(action.keys))
		button.text = _context_text(str(action.label), str(action.keys))
		if danger != "":
			button.add_theme_color_override("font_color", UiTheme.BAD if danger == "serious" else UiTheme.WARN)
		button.pressed.connect(func() -> void: _run_action(action))
		_context_box.add_child(button)
		button.modulate.a = 0.0
		button.create_tween().tween_property(button, "modulate:a", 1.0, 0.2)
