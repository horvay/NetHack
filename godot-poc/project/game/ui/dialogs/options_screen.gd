class_name OptionsScreen
extends ModalCard
## NetHack's O "Options" menu as a settings page: NetHack's sections as
## cards, each on/off option a switch, each other option its current value
## with a button to change it, NetHack's descriptions (its "show help")
## under the options. Picking one answers NetHack's menu as tty would;
## NetHack toggles it (or asks for the new value) and shows the menu again,
## which reopens here where the player left off. Esc is done.

var screen: GameScreen
var request: Dictionary
var sections: Array = []  # [{heading, options: [{selector, name, value, is_bool, on, note, help}]}]
var help_selector := ""
var help_shown := false
var _answered := false
var _scroll: ScrollContainer
## Where the list was scrolled, kept while NetHack re-shows the menu.
static var _last_scroll := 0


static func recognises(p_request: Dictionary) -> bool:
	if int(p_request.get("how", 0)) != 1 or str(p_request.get("prompt", "")).strip_edges() != "Options":
		return false
	var option := RegEx.create_from_string("^\\S+\\s+\\[.*\\]")
	for row in p_request.get("items", []):
		if int(row.get("selector", 0)) != 0 and option.search(str(row.get("text", "")).strip_edges()) != null:
			return true
	return false


func setup(game_screen: GameScreen, p_request: Dictionary) -> void:
	screen = game_screen
	request = p_request
	_parse()
	card_width = 1000.0
	set_title("Options", "NetHack's own settings. Each change takes effect at once.")
	_build()
	if help_selector != "":
		var help := add_footer_button("Hide descriptions" if help_shown else "Show descriptions", func() -> void: _send(help_selector))
		help.name = "HelpToggle"
	var done := add_footer_button("Done  Esc", _cancel, true)
	set_meta("safe_focus", done)


func _parse() -> void:
	var option := RegEx.create_from_string("^(\\S+)\\s+\\[(.*)\\](.*)$")
	var current: Dictionary = {}
	var last: Dictionary = {}
	for row in request.get("items", []):
		var selector := int(row.get("selector", 0))
		var raw := str(row.get("text", ""))
		var text := raw.strip_edges()
		if selector != 0 and (text == "show help" or text == "hide help"):
			help_selector = char(selector)
			help_shown = text == "hide help"
			continue
		if selector == 0:
			if text == "" or text.begins_with("Use command"):
				continue
			if raw.begins_with("    ") and not last.is_empty():
				last["help"] = text  # NetHack's description of the option above
				continue
			current = {"heading": text, "options": []}
			sections.append(current)
			continue
		var m := option.search(text)
		if m == null:
			continue
		if current.is_empty():
			current = {"heading": "", "options": []}
			sections.append(current)
		var value := m.get_string(2)
		last = {"selector": char(selector), "name": m.get_string(1), "value": value.strip_edges(),
			"is_bool": value == "X" or value == " ", "on": value == "X", "note": m.get_string(3).strip_edges().trim_prefix("(").trim_suffix(")"), "help": ""}
		(current.options as Array).append(last)


func _build() -> void:
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.custom_minimum_size = Vector2(0, 600)
	body.add_child(_scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 14)
	_scroll.add_child(column)
	for section in sections:
		var card := PanelContainer.new()
		var style := UiTheme.panel_style(Color(1, 1, 1, 0.03), Color(1, 1, 1, 0.1), 10, 1, 0)
		style.content_margin_left = 14
		style.content_margin_right = 14
		style.content_margin_top = 10
		style.content_margin_bottom = 12
		card.add_theme_stylebox_override("panel", style)
		column.add_child(card)
		var inner := VBoxContainer.new()
		inner.add_theme_constant_override("separation", 4)
		card.add_child(inner)
		if str(section.heading) != "":
			var heading := Label.new()
			heading.text = str(section.heading).to_upper()
			heading.add_theme_font_override("font", UiTheme.heading_font())
			heading.add_theme_font_size_override("font_size", 15)
			heading.add_theme_color_override("font_color", UiTheme.GOLD)
			inner.add_child(heading)
		var grid := GridContainer.new()
		grid.columns = 2
		grid.add_theme_constant_override("h_separation", 24)
		grid.add_theme_constant_override("v_separation", 4)
		inner.add_child(grid)
		for opt in section.options:
			grid.add_child(_option(opt))
	_scroll.ready.connect(func() -> void: _scroll.set_deferred("scroll_vertical", _last_scroll), CONNECT_ONE_SHOT)


func _option(opt: Dictionary) -> Control:
	var row := HBoxContainer.new()
	row.name = "Opt_%s" % str(opt.name)
	row.custom_minimum_size = Vector2(450, 40)
	row.add_theme_constant_override("separation", 10)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(words)
	var name := Label.new()
	name.text = str(opt.name).replace("_", " ") + (("  (" + str(opt.note) + ")") if str(opt.note) != "" else "")
	name.add_theme_font_size_override("font_size", 16)
	name.add_theme_color_override("font_color", UiTheme.INK)
	words.add_child(name)
	if str(opt.help) != "":
		var help := Label.new()
		help.text = str(opt.help)
		help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		help.add_theme_font_size_override("font_size", 13)
		help.add_theme_color_override("font_color", UiTheme.INK_DIM)
		words.add_child(help)
	if bool(opt.is_bool):
		var toggle := CheckButton.new()
		toggle.name = "Toggle"
		toggle.button_pressed = bool(opt.on)
		toggle.focus_mode = Control.FOCUS_ALL
		toggle.tooltip_text = "%s  (%s)" % [str(opt.name), str(opt.selector)]
		toggle.toggled.connect(func(_on: bool) -> void: _send(str(opt.selector)))
		row.add_child(toggle)
	else:
		var change := Button.new()
		change.name = "Change"
		change.text = "%s  ›" % (str(opt.value) if str(opt.value) != "" else "—")
		change.focus_mode = Control.FOCUS_ALL
		change.tooltip_text = "Change %s  (%s)" % [str(opt.name), str(opt.selector)]
		change.pressed.connect(func() -> void: _send(str(opt.selector)))
		row.add_child(change)
	return row


func _send(selector: String) -> void:
	if _answered:
		return
	_answered = true
	_last_scroll = _scroll.scroll_vertical if _scroll else 0
	screen.send_keys(selector)
	close()


func _cancel() -> void:
	if not _answered:
		_answered = true
		_last_scroll = 0
		screen.send_keycode(27)
	close()


func handle_key(event: InputEventKey) -> bool:
	if not event.pressed:
		return true
	if event.keycode == KEY_ESCAPE:
		_cancel()
		return true
	if event.keycode in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE, KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN, KEY_TAB, KEY_PAGEUP, KEY_PAGEDOWN]:
		return false
	# The classic letters still pick an option.
	var typed := InputRouter.key_to_nethack(event)
	if typed != "" and typed == help_selector:
		_send(typed)
		return true
	for section in sections:
		for opt in section.options:
			if str(opt.selector) == typed:
				_send(typed)
				return true
	return true
