class_name CommandPalette
extends ModalCard
## Searchable command list. In "ui" mode it lists the curated catalog (with
## categories, keys and danger badges); in "extcmd" mode it answers
## NetHack's extended-command prompt from the live command list.

var screen: GameScreen
var mode := "ui"
var search: LineEdit
var list: VBoxContainer
var entries: Array = []
var _buttons: Array[Button] = []
var _selected := 0

## Most recent first, shared across palette openings.
static var recent: Array[String] = []


func setup(game_screen: GameScreen, p_mode: String) -> void:
	screen = game_screen
	mode = p_mode
	card_width = 640.0
	set_title("Commands" if mode == "ui" else "Extended command", "Type to search. Enter runs the highlighted command." if mode == "ui" else "Type a command name. Enter runs it.")
	search = LineEdit.new()
	search.placeholder_text = "Search commands…"
	search.custom_minimum_size = Vector2(0, 44)
	search.text_changed.connect(_refresh)
	search.text_submitted.connect(func(_t: String) -> void: _run_selected())
	body.add_child(search)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(600, 480)
	body.add_child(scroll)
	list = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 2)
	scroll.add_child(list)
	add_footer_button("Cancel  Esc", _cancel)
	if mode == "extcmd":
		screen.state.extcmd_catalog_changed.connect(func() -> void: _refresh(search.text))
	_refresh("")


func _ready() -> void:
	super._ready()
	search.grab_focus.call_deferred()


func _source() -> Array:
	if mode == "ui":
		if search.text.strip_edges() != "":
			# The curated catalog first, then any other extended command
			# NetHack offers that matches.
			var found := CommandCatalog.search(search.text)
			var covered := {}
			for command in found:
				covered[str(command.get("keys", "")).trim_prefix("#").trim_suffix("\n")] = true
			for command in _extended_matches(search.text):
				if not covered.has(str(command.label)):
					var copy: Dictionary = command.duplicate()
					copy["keys"] = "#" + str(command.keys)
					found.append(copy)
			return found
		var result := []
		# Actions for the hero's own square come first.
		# The hero's square, the squares around it (doors, shopkeepers...) and
		# lock follow-ups: everything the action bar offers, for pad and keys.
		var here: Array = CellActions.for_cell(screen.state, screen.state.map.hero)
		var locks: Array = screen.hud.action_bar.lock_actions
		# The lock follow-ups first; "Open door" would only repeat "locked".
		here = locks + here
		for action in CellActions.neighbour_actions(screen.state):
			if locks.is_empty() or action.id != "open":
				here.append(action)
		for action in here:
			if action.id in ["look-here", "search", "rest"]:
				continue
			result.append({"id": "here-" + str(action.id), "label": action.label, "cat": "Available here", "key": readable_keys(str(action.get("command", action.keys))),
				"keys": action.keys, "danger": str(action.get("danger", "")), "action": action})
		for id in recent:
			for command in CommandCatalog.COMMANDS:
				if command.id == id:
					var copy: Dictionary = command.duplicate()
					copy["cat"] = "Recent"
					result.append(copy)
		for command in CommandCatalog.COMMANDS:
			result.append(command)
		return result
	return _extended_matches(search.text)


const WIZMODECMD := 0x4
const CMD_NOT_AVAILABLE := 0x10
const INTERNALCMD := 0x40


## NetHack's extended commands matching needle: exact name, then name
## prefix, then description. Wizard-mode, internal and unavailable
## commands and the one-character "#"/"?" entries are left out.
func _extended_matches(text: String) -> Array:
	var needle := text.strip_edges().to_lower().trim_prefix("#")
	var ranked := [[], [], []]
	for command in screen.state.extcmd_catalog:
		var name := str(command.get("name", ""))
		var desc := str(command.get("description", ""))
		if name.length() < 2 or int(command.get("flags", 0)) & (WIZMODECMD | CMD_NOT_AVAILABLE | INTERNALCMD):
			continue
		var entry := {"label": name, "desc": desc, "keys": name + "\n", "key": "#" + name}
		if needle == "" or name.to_lower().begins_with(needle):
			ranked[0 if name.to_lower() == needle else 1].append(entry)
		elif desc.to_lower().contains(needle):
			ranked[2].append(entry)
	return ranked[0] + ranked[1] + ranked[2]


func _refresh(_text: String) -> void:
	for child in list.get_children():
		child.queue_free()
	entries = _source()
	_buttons.clear()
	_selected = 0
	var last_cat := ""
	for i in entries.size():
		var command: Dictionary = entries[i]
		if mode == "ui" and search.text.strip_edges() == "" and str(command.get("cat", "")) != last_cat:
			last_cat = str(command.get("cat", ""))
			var heading := Label.new()
			heading.text = last_cat.to_upper()
			heading.add_theme_font_override("font", UiTheme.heading_font())
			heading.add_theme_font_size_override("font_size", 14)
			heading.add_theme_color_override("font_color", UiTheme.GOLD_DIM.lightened(0.2))
			list.add_child(heading)
		var button := Button.new()
		button.focus_mode = Control.FOCUS_ALL
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.custom_minimum_size = Vector2(0, 40)
		var danger := str(command.get("danger", ""))
		var label := str(command.label)
		if command.has("desc") and command.desc != "":
			label += "  —  " + str(command.desc)
		button.text = label
		button.clip_text = true
		var key := Label.new()
		key.text = str(command.get("key", "")) if mode == "ui" and Motion.key_hints() else ""
		key.add_theme_color_override("font_color", UiTheme.BAD if danger == "serious" else (UiTheme.WARN if danger == "caution" else UiTheme.GOLD_DIM.lightened(0.3)))
		key.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
		key.position = Vector2(-90, -12)
		key.size = Vector2(80, 24)
		key.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		button.add_child(key)
		button.pressed.connect(_run.bind(command))
		list.add_child(button)
		_buttons.append(button)
	# Enter must never run a dangerous command by default.
	while _selected < entries.size() - 1 and str(entries[_selected].get("danger", "")) != "":
		_selected += 1
	_highlight()


func _highlight() -> void:
	for i in _buttons.size():
		var button := _buttons[i]
		if i == _selected:
			button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("2a2414"), Color(UiTheme.GOLD, 0.7)))
			var scroll := list.get_parent() as ScrollContainer
			if scroll:
				scroll.ensure_control_visible.call_deferred(button)
		else:
			button.remove_theme_stylebox_override("normal")


func _run_selected() -> void:
	if mode == "extcmd" and entries.is_empty():
		screen.send_keys(search.text.strip_edges() + "\n")
		close()
		return
	if _selected < entries.size():
		_run(entries[_selected])


## Keys as a player reads them: control characters as ^D, no newline.
static func readable_keys(keys: String) -> String:
	var out := ""
	for ch in keys.replace("\n", ""):
		var code := ch.unicode_at(0)
		out += ("^" + char(code + 64)) if code < 32 else ch
	return out


func _run(command: Dictionary) -> void:
	close()
	if mode == "extcmd":
		screen.send_keys(str(command["keys"]))
		return
	var id := str(command.get("id", ""))
	if id != "" and not id.begins_with("here-"):
		recent.erase(id)
		recent.push_front(id)
		if recent.size() > 6:
			recent.resize(6)
	# Callbacks are bound to the router: this palette is already closing.
	var router := screen.input_router
	if command.has("ui"):
		router.open_ui(str(command.ui))
	elif command.has("action"):
		# A square action runs like the action bar's (containers, travel...).
		screen.dialogs.confirm_action(command.action, router.run_cell_action.bind(screen.state.map.hero, command.action))
	elif command.has("count"):
		router.send_counted(int(command.count), str(command["keys"]))
	else:
		screen.dialogs.confirm_action(command, router.send_command.bind(str(command["keys"])))


func _cancel() -> void:
	if mode == "extcmd":
		screen.send_keycode(27)
	close()


func handle_key(event: InputEventKey) -> bool:
	match event.keycode:
		KEY_ESCAPE:
			_cancel()
			return true
		KEY_DOWN:
			_selected = mini(_selected + 1, entries.size() - 1)
			_highlight()
			return true
		KEY_UP:
			_selected = maxi(_selected - 1, 0)
			_highlight()
			return true
	return false
