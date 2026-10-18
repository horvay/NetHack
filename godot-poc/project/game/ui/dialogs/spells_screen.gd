class_name SpellsScreen
extends ModalCard
## NetHack's spell menus (Z to cast, + to view and reorder) as a grid of
## spell cards: the spell's art, its school, level, Pw cost (greyed when the
## hero hasn't the Pw), a failure bar and how well it is remembered.
##
## NetHack still does everything: a card (or its classic letter) answers
## NetHack's menu, so casting, reordering ("swap a with…": NetHack's second
## menu comes back here) and sorting (+, NetHack's own sort menu) all go
## through NetHack. Esc closes.

var screen: GameScreen
var request: Dictionary = {}
var rows: Array = []
var mode := "view"  # "cast", "view", "swap"
var _answered := false
var _sort_selector := ""


func setup(game_screen: GameScreen, p_request: Dictionary, magic: Dictionary) -> void:
	screen = game_screen
	request = p_request
	rows = magic.get("rows", [])
	var prompt := str(request.get("prompt", ""))
	var lower := prompt.to_lower()
	mode = "cast" if lower.contains("cast") else ("swap" if lower.contains("swap") else "view")
	# NetHack's "[sort spells]" row (view mode, two spells or more).
	for item in request.get("items", []):
		if str(item.get("text", "")).to_lower().contains("sort spells") and int(item.get("selector", 0)) > 0:
			_sort_selector = char(int(item.get("selector", 0)))
	card_width = 1100.0
	match mode:
		"cast":
			set_title("Cast a spell", "Pw %d of %d. Click a spell or press its letter." % [screen.state.status.energy(), screen.state.status.energy_max()])
		"swap":
			set_title("Reorder spells", prompt.strip_edges() + "  (pick the spell to swap places with)")
		_:
			set_title("Spellbook", "The spells you know. Click one to move it to another letter.")
	_build()
	if _sort_selector != "":
		add_footer_button("Sort…  %s" % _sort_selector, func() -> void: _answer(_sort_selector))
	var close_button := add_footer_button("Close  Esc", _cancel)
	set_meta("safe_focus", close_button)


func _build() -> void:
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 10)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(0, mini(560, 96 * int(ceil(rows.size() / 2.0)) + 10))
	scroll.add_child(grid)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(scroll)
	if rows.is_empty():
		var none := Label.new()
		none.text = "You don't know any spells."
		none.theme_type_variation = "CaptionLabel"
		body.add_child(none)
	for row in rows:
		grid.add_child(_spell_card(row))


func _spell_card(row: Dictionary) -> Control:
	var name := str(row.get("name", ""))
	var selector := str(row.get("selector", ""))
	var pw := int(row.get("pwCost", 0))
	var failure := int(row.get("failure", 0))
	var short_of_pw := mode == "cast" and pw > screen.state.status.energy()
	var button := Button.new()
	button.name = "Spell_%s" % name.replace(" ", "_")
	button.set_meta("spell", row)
	button.custom_minimum_size = Vector2(530, 86)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_stylebox_override("normal", UiTheme.button_style(Color(1, 1, 1, 0.04), Color(1, 1, 1, 0.1), 10))
	button.pressed.connect(func() -> void: _answer(selector))
	var line := HBoxContainer.new()
	line.set_anchors_preset(Control.PRESET_FULL_RECT)
	line.offset_left = 10
	line.offset_right = -12
	line.add_theme_constant_override("separation", 12)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(line)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(56, 56)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	icon.texture = _icon_for(name)
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if short_of_pw:
		icon.modulate = Color(1, 1, 1, 0.4)
	line.add_child(icon)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.alignment = BoxContainer.ALIGNMENT_CENTER
	words.add_theme_constant_override("separation", 2)
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	line.add_child(words)
	var title := Label.new()
	title.text = "%s   %s" % [name.substr(0, 1).to_upper() + name.substr(1), selector] if not GamepadRouter.active else name.substr(0, 1).to_upper() + name.substr(1)
	title.add_theme_font_override("font", UiTheme.bold_font())
	title.add_theme_font_size_override("font_size", 19)
	title.add_theme_color_override("font_color", UiTheme.INK_DIM if short_of_pw else UiTheme.INK)
	words.add_child(title)
	var facts := Label.new()
	var school := str(row.get("school", ""))
	facts.text = "%sLevel %d   ·   %d Pw%s   ·   %s" % [(school.capitalize() + "   ·   ") if school != "" else "", int(row.get("level", 0)), pw,
		"  (not enough)" if short_of_pw else "", "memory " + str(row.get("status", ""))]
	facts.add_theme_font_size_override("font_size", 14)
	facts.add_theme_color_override("font_color", UiTheme.BAD if short_of_pw else UiTheme.INK_DIM)
	words.add_child(facts)
	var bar := SpellFailureBar.new()
	bar.failure = failure
	words.add_child(bar)
	return button


func _icon_for(name: String) -> Texture2D:
	var resolver := TileResolver.shared()
	# The spellbook's art (class-checked: "protection" is also a ring).
	var id := resolver.asset_for_cell({"char": "+", "semanticKind": "object", "semanticName": name, "semanticKnown": true})
	if id == "" or not resolver.has_asset(id):
		id = "spellbook-class-icon"
	return resolver.texture(id) if resolver.has_asset(id) else null


func _answer(selector: String) -> void:
	if selector == "" or _answered:
		return
	_answered = true
	screen.send_keys(selector)
	close()


func _cancel() -> void:
	if not _answered:
		_answered = true
		screen.send_keycode(27)
	close()


func handle_key(event: InputEventKey) -> bool:
	if event.keycode == KEY_ESCAPE:
		_cancel()
		return true
	var typed := InputRouter.key_to_nethack(event)
	if typed == "":
		return false
	if typed == _sort_selector:
		_answer(typed)
		return true
	for row in rows:
		if str(row.get("selector", "")) == typed:
			_answer(typed)
			return true
	return false
