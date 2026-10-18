class_name CharacterCreation
extends CanvasLayer
## Forge a hero: role cards on the left, the hero's portrait and story in
## the middle, race/gender/alignment and name on the right. Only legal
## NetHack combinations can be chosen.

var app: App
var selection := {"role": "Val", "race": "Hum", "gender": "Fem", "align": "Neu", "name": ""}
var root: Control
var role_grid: GridContainer
var portrait: TextureRect
var role_title: Label
var role_blurb: Label
var role_meta: Label
var race_row: HBoxContainer
var gender_row: HBoxContainer
var align_row: HBoxContainer
var name_field: LineEdit
var seed_field: LineEdit
var warning: Label
var _role_buttons: Dictionary = {}


func setup(p_app: App) -> void:
	app = p_app
	selection = CharacterOptions.normalize(selection)
	selection.name = CharacterOptions.random_name(selection.gender)
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.theme = UiTheme.theme()
	add_child(root)
	var backdrop := DungeonBackdrop.new()
	backdrop.tint = Color(0.8, 0.85, 1.0)
	root.add_child(backdrop)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 56)
	root.add_child(margin)
	var outer := VBoxContainer.new()
	outer.add_theme_constant_override("separation", 18)
	margin.add_child(outer)
	var header := HBoxContainer.new()
	outer.add_child(header)
	var title := Label.new()
	title.text = "Choose your hero"
	title.theme_type_variation = "HeaderLabel"
	title.add_theme_font_size_override("font_size", 44)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var back := Button.new()
	back.text = "Back"
	back.custom_minimum_size = Vector2(120, 46)
	back.pressed.connect(func() -> void: app.show_title())
	header.add_child(back)

	var row := HBoxContainer.new()
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 28)
	outer.add_child(row)

	var roles_panel := _panel()
	roles_panel.custom_minimum_size = Vector2(560, 0)
	row.add_child(roles_panel)
	var roles_col := VBoxContainer.new()
	roles_panel.add_child(roles_col)
	roles_col.add_child(_section("Role"))
	role_grid = GridContainer.new()
	role_grid.columns = 3
	role_grid.add_theme_constant_override("h_separation", 10)
	role_grid.add_theme_constant_override("v_separation", 10)
	roles_col.add_child(role_grid)
	for role in CharacterOptions.ROLE_ORDER:
		var button := Button.new()
		# Tall tiles, portrait above the name, filling the role panel.
		button.custom_minimum_size = Vector2(170, 150)
		button.text = CharacterOptions.ROLES[role].label
		button.focus_mode = Control.FOCUS_ALL
		button.add_theme_font_size_override("font_size", 19)
		button.expand_icon = true
		button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		button.vertical_icon_alignment = VERTICAL_ALIGNMENT_TOP
		button.add_theme_constant_override("icon_max_width", 84)
		button.pressed.connect(_pick.bind("role", role))
		role_grid.add_child(button)
		_role_buttons[role] = button

	var middle := VBoxContainer.new()
	middle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	middle.add_theme_constant_override("separation", 8)
	row.add_child(middle)
	portrait = TextureRect.new()
	portrait.size_flags_vertical = Control.SIZE_EXPAND_FILL
	portrait.custom_minimum_size = Vector2(0, 520)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	middle.add_child(portrait)
	role_title = Label.new()
	role_title.theme_type_variation = "HeaderLabel"
	role_title.add_theme_font_size_override("font_size", 34)
	role_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	middle.add_child(role_title)
	role_meta = Label.new()
	role_meta.theme_type_variation = "CaptionLabel"
	role_meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	middle.add_child(role_meta)
	role_blurb = Label.new()
	role_blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	role_blurb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	role_blurb.add_theme_font_size_override("font_size", 20)
	role_blurb.custom_minimum_size = Vector2(420, 0)
	middle.add_child(role_blurb)

	var right_panel := _panel()
	right_panel.custom_minimum_size = Vector2(470, 0)
	row.add_child(right_panel)
	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 12)
	right_panel.add_child(right)
	right.add_child(_section("Race"))
	race_row = HBoxContainer.new()
	race_row.add_theme_constant_override("separation", 6)
	right.add_child(race_row)
	right.add_child(_section("Gender"))
	gender_row = HBoxContainer.new()
	gender_row.add_theme_constant_override("separation", 6)
	right.add_child(gender_row)
	right.add_child(_section("Alignment"))
	align_row = HBoxContainer.new()
	align_row.add_theme_constant_override("separation", 6)
	right.add_child(align_row)
	right.add_child(_section("Name"))
	var name_row := HBoxContainer.new()
	right.add_child(name_row)
	name_field = LineEdit.new()
	name_field.max_length = 24
	name_field.custom_minimum_size = Vector2(0, 48)
	name_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_field.text = selection.name
	name_field.text_changed.connect(func(t: String) -> void:
		selection.name = t
		_check_name())
	name_row.add_child(name_field)
	var dice := Button.new()
	dice.text = "Random"
	dice.tooltip_text = "Pick a random name"
	dice.custom_minimum_size = Vector2(100, 48)
	dice.pressed.connect(func() -> void:
		name_field.text = CharacterOptions.random_name(selection.gender)
		selection.name = name_field.text
		_check_name())
	name_row.add_child(dice)
	right.add_child(_section("Seed (optional)"))
	seed_field = LineEdit.new()
	seed_field.placeholder_text = "Leave empty for a fresh dungeon"
	seed_field.custom_minimum_size = Vector2(0, 44)
	right.add_child(seed_field)
	warning = Label.new()
	warning.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	warning.add_theme_color_override("font_color", UiTheme.WARN)
	right.add_child(warning)
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(spacer)
	var random_hero := Button.new()
	random_hero.text = "Surprise me"
	random_hero.custom_minimum_size = Vector2(0, 46)
	random_hero.pressed.connect(_randomize)
	right.add_child(random_hero)
	var begin := Button.new()
	begin.name = "Begin"
	begin.text = "Begin the descent"
	begin.custom_minimum_size = Vector2(0, 64)
	begin.add_theme_font_override("font", UiTheme.heading_font())
	begin.add_theme_font_size_override("font_size", 24)
	begin.add_theme_stylebox_override("normal", UiTheme.button_style(Color("3a2c12"), UiTheme.GOLD, 10))
	begin.add_theme_stylebox_override("hover", UiTheme.button_style(Color("4d3a17"), UiTheme.GOLD.lightened(0.3), 10))
	begin.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.35))
	begin.pressed.connect(_begin)
	right.add_child(begin)
	_refresh()


func _panel() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0.04, 0.042, 0.056, 0.86), Color(UiTheme.GOLD, 0.25), 14, 1, 24))
	return panel


func _section(text: String) -> Label:
	var label := Label.new()
	label.text = text.to_upper()
	label.add_theme_font_override("font", UiTheme.heading_font())
	label.add_theme_font_size_override("font_size", 15)
	label.add_theme_color_override("font_color", UiTheme.GOLD_DIM.lightened(0.25))
	return label


func _pick(field: String, value: String) -> void:
	selection[field] = value
	selection = CharacterOptions.normalize(selection)
	_refresh()


func _refresh() -> void:
	var resolver := TileResolver.shared()
	for role in _role_buttons:
		var button: Button = _role_buttons[role]
		var sample := CharacterOptions.normalize({"role": role, "race": selection.race, "gender": selection.gender})
		button.icon = resolver.texture(resolver.player_avatar_id(sample))
		if role == selection.role:
			button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("2c2414"), Color(UiTheme.GOLD, 0.9), 8))
			button.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.25))
		else:
			button.remove_theme_stylebox_override("normal")
			button.remove_theme_color_override("font_color")
	_fill_choices(race_row, CharacterOptions.RACES.keys(), CharacterOptions.races_for(selection.role), "race", func(k: String) -> String: return CharacterOptions.RACES[k].label)
	_fill_choices(gender_row, CharacterOptions.GENDERS.keys(), CharacterOptions.genders_for(selection.role), "gender", func(k: String) -> String: return CharacterOptions.GENDERS[k])
	_fill_choices(align_row, CharacterOptions.ALIGNS.keys(), CharacterOptions.aligns_for(selection.role, selection.race), "align", func(k: String) -> String: return CharacterOptions.ALIGNS[k])
	var role_info: Dictionary = CharacterOptions.ROLES[selection.role]
	var new_portrait := resolver.portrait(resolver.player_avatar_id(selection))
	if new_portrait != portrait.texture:
		portrait.texture = new_portrait
		portrait.modulate.a = 0.0
		portrait.create_tween().tween_property(portrait, "modulate:a", 1.0, 0.25)
	role_title.text = role_info.label
	role_meta.text = "%s   ·   Difficulty: %s" % [CharacterOptions.describe(selection), role_info.difficulty]
	role_blurb.text = role_info.blurb
	_check_name()


func _fill_choices(row: HBoxContainer, all_keys: Array, allowed: Array, field: String, label_of: Callable) -> void:
	for child in row.get_children():
		child.queue_free()
	for key in all_keys:
		var button := Button.new()
		button.text = label_of.call(key)
		button.custom_minimum_size = Vector2(0, 44)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.focus_mode = Control.FOCUS_ALL
		button.disabled = not allowed.has(key)
		if not allowed.has(key):
			button.tooltip_text = "Not available to this role"
		if selection.get(field) == key:
			button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("2c2414"), Color(UiTheme.GOLD, 0.9), 6))
			button.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.25))
		button.pressed.connect(_pick.bind(field, key))
		row.add_child(button)
	# Why some choices are off, in plain view rather than a tooltip.
	if not _reasons.has(field):
		var caption := Label.new()
		caption.theme_type_variation = "CaptionLabel"
		caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.get_parent().add_child(caption)
		row.get_parent().move_child(caption, row.get_index() + 1)
		_reasons[field] = caption
	var blocked := all_keys.filter(func(k: Variant) -> bool: return not allowed.has(k)).map(func(k: Variant) -> String:
		var word := str(label_of.call(k)).to_lower()
		if field == "race":
			word = ("an " if word.substr(0, 1) in ["a", "e", "i", "o", "u"] else "a ") + word
		return word)
	var who := str(CharacterOptions.ROLES.get(selection.get("role", ""), {}).get("label", "hero"))
	if field == "align":
		# Alignment depends on the race too ("an elven Ranger").
		who = "%s %s" % [str(CharacterOptions.RACES.get(selection.get("race", ""), {}).get("label", "")).to_lower(), who]
	var article := "An" if who.substr(0, 1).to_lower() in ["a", "e", "i", "o", "u"] else "A"
	var caption_label: Label = _reasons[field]
	caption_label.visible = not blocked.is_empty() and field != "role"
	caption_label.text = "%s %s can't be %s." % [article, who.strip_edges(), " or ".join(blocked)] if not blocked.is_empty() else ""


var _reasons := {}


func _check_name() -> bool:
	var name := str(selection.name).strip_edges()
	var begin: Button = root.find_child("Begin", true, false)
	var ok := RegEx.create_from_string(SaveCatalog.NEW_NAME_PATTERN).search(name) != null
	warning.text = ""
	if not ok:
		warning.text = "Names use letters, digits and _ (up to 24)."
	else:
		for save in app.session.catalog().saves():
			if str(save.name) == name:
				warning.text = "A saved game already uses that name. Continue it from the title screen, or choose another name."
				ok = false
	if begin:
		begin.disabled = not ok
	return ok


func _randomize() -> void:
	var role: String = CharacterOptions.ROLE_ORDER[randi() % CharacterOptions.ROLE_ORDER.size()]
	var races := CharacterOptions.races_for(role)
	var genders := CharacterOptions.genders_for(role)
	selection = CharacterOptions.normalize({"role": role, "race": races[randi() % races.size()], "gender": genders[randi() % genders.size()]})
	var aligns := CharacterOptions.aligns_for(selection.role, selection.race)
	selection.align = aligns[randi() % aligns.size()]
	selection.name = CharacterOptions.random_name(selection.gender)
	name_field.text = selection.name
	_refresh()


func _begin() -> void:
	if not _check_name():
		return
	app.start_game(CharacterOptions.spec(selection), seed_field.text.strip_edges())


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_ENTER, KEY_KP_ENTER:
				_begin()
			KEY_ESCAPE:
				app.show_title()
			KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN:
				if name_field.has_focus() or seed_field.has_focus():
					return
				var order := CharacterOptions.ROLE_ORDER
				var index := order.find(selection.role)
				var step: int = {KEY_LEFT: -1, KEY_RIGHT: 1, KEY_UP: -3, KEY_DOWN: 3}[event.keycode]
				_pick("role", order[clampi(index + step, 0, order.size() - 1)])
			_:
				return
		get_viewport().set_input_as_handled()
