class_name OverviewScreen
extends ModalCard
## NetHack's dungeon overview (^O, #overview) as a map of the hero's journey:
## a column per branch (Dungeons of Doom, Gnomish Mines…), a row per level
## the hero has been to, its features as icons (shops, temples and altars,
## fountains, thrones…) beside NetHack's own sentence, the player's notes,
## and "You are here" in gold. Only what the overview says. Any key closes.

const FEATURE_ICONS := [["shop", "shopkeeper"], ["temple", "altar"], ["altar", "altar"], ["throne", "throne"],
	["fountain", "fountain"], ["sink", "sink"], ["grave", "grave"], ["tree", "tree"], ["oracle", "fountain"],
	["portal", "magic-portal"], ["stairs", "branch-stairs-down"], ["ladder", "branch-ladder-down"]]

var screen: GameScreen
var branches: Array = []  # [{name, levels: [{depth, text, here, details: Array}]}]


## The overview: a branch heading, then "Level N:" lines.
static func recognises(lines: Array) -> bool:
	var level := RegEx.create_from_string("^\\s*Level \\d+:")
	for line in lines.slice(0, 4):
		if level.search(str(line.get("text", ""))) != null:
			return true
	return false


func setup(game_screen: GameScreen, lines: Array) -> void:
	screen = game_screen
	_parse(lines)
	card_width = clampf(360.0 * branches.size() + 60.0, 520.0, 1500.0)
	set_title("Dungeon overview", "The places you have been, as you remember them.")
	_build()
	var close_button := add_footer_button("Close  Esc", close)
	set_meta("safe_focus", close_button)


func _parse(lines: Array) -> void:
	var level_re := RegEx.create_from_string("^\\s*Level (\\d+):\\s*(.*)$")
	var branch: Dictionary = {}
	var level: Dictionary = {}
	for line in lines:
		var raw := str(line.get("text", ""))
		var text := raw.strip_edges()
		if text == "":
			continue
		var m := level_re.search(raw)
		if m:
			if branch.is_empty():
				branch = {"name": "", "levels": []}
				branches.append(branch)
			var rest := m.get_string(2)
			var here := rest.contains("<- You are here") or rest.contains("<- You were here") or rest.contains("<- You left from here")
			rest = RegEx.create_from_string("\\s*<- You (are|were|left from) here\\.?").sub(rest, "", true).strip_edges()
			level = {"depth": int(m.get_string(1)), "text": rest, "here": here, "details": []}
			(branch.levels as Array).append(level)
			continue
		# A branch heading: unindented ("The Dungeons of Doom:", or once two
		# levels are known "The Gnomish Mines: levels 3 to 4"), or NetHack's
		# heading attribute.
		if not raw.begins_with(" ") and (text.contains(":") or int(line.get("attr", 0)) != 0):
			branch = {"name": text.get_slice(":", 0).strip_edges(), "levels": []}
			branches.append(branch)
			level = {}
			continue
		if not level.is_empty():
			(level.details as Array).append(text)
		elif not branch.is_empty():
			branch["name"] = str(branch.name) + " " + text


func _build() -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	body.add_child(row)
	for branch in branches:
		var column := VBoxContainer.new()
		column.custom_minimum_size = Vector2(340, 0)
		column.add_theme_constant_override("separation", 6)
		row.add_child(column)
		var heading := Label.new()
		heading.text = str(branch.name).to_upper() if str(branch.name) != "" else "THE DUNGEON"
		heading.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		heading.add_theme_font_override("font", UiTheme.heading_font())
		heading.add_theme_font_size_override("font_size", 16)
		heading.add_theme_color_override("font_color", UiTheme.GOLD)
		column.add_child(heading)
		var scroll := ScrollContainer.new()
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		scroll.custom_minimum_size = Vector2(0, mini(560, 74 * (branch.levels as Array).size() + 10))
		column.add_child(scroll)
		var list := VBoxContainer.new()
		list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		list.add_theme_constant_override("separation", 6)
		scroll.add_child(list)
		for level in branch.levels:
			list.add_child(_level_row(level))


func _level_row(level: Dictionary) -> Control:
	var here: bool = level.here
	var panel := PanelContainer.new()
	panel.name = "Level_%d" % int(level.depth)
	panel.set_meta("level", level)
	var style := UiTheme.panel_style(Color(UiTheme.GOLD, 0.14) if here else Color(1, 1, 1, 0.04), Color(UiTheme.GOLD, 0.9) if here else Color(1, 1, 1, 0.1), 10, 2 if here else 1, 0)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	panel.add_theme_stylebox_override("panel", style)
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 10)
	panel.add_child(line)
	var depth := Label.new()
	depth.text = str(int(level.depth))
	depth.custom_minimum_size = Vector2(34, 0)
	depth.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	depth.add_theme_font_override("font", UiTheme.heading_font())
	depth.add_theme_font_size_override("font_size", 24)
	depth.add_theme_color_override("font_color", UiTheme.GOLD if here else UiTheme.INK_DIM)
	line.add_child(depth)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.add_theme_constant_override("separation", 2)
	line.add_child(words)
	var all_text := (str(level.text) + " " + " ".join(level.details)).to_lower()
	var icons := HBoxContainer.new()
	icons.add_theme_constant_override("separation", 4)
	var resolver := TileResolver.shared()
	var shown := {}
	for pair in FEATURE_ICONS:
		if all_text.contains(pair[0]) and resolver.has_asset(pair[1]) and not shown.has(pair[1]):
			shown[pair[1]] = true
			var icon := TextureRect.new()
			icon.custom_minimum_size = Vector2(28, 28)
			icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			icon.texture = resolver.texture(pair[1])
			icon.tooltip_text = pair[0].capitalize()
			icons.add_child(icon)
	if here:
		var you := Label.new()
		you.text = "You are here"
		you.add_theme_font_override("font", UiTheme.bold_font())
		you.add_theme_font_size_override("font_size", 14)
		you.add_theme_color_override("font_color", UiTheme.GOLD)
		icons.add_child(you)
	if icons.get_child_count() > 0:
		words.add_child(icons)
	else:
		icons.free()
	for text in [str(level.text)] + (level.details as Array):
		if str(text).strip_edges() == "":
			continue
		var label := Label.new()
		label.text = str(text)
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.add_theme_font_size_override("font_size", 15)
		label.add_theme_color_override("font_color", UiTheme.INK)
		words.add_child(label)
	return panel


func handle_key(event: InputEventKey) -> bool:
	# (Shift, Ctrl and the like alone don't count as a key.)
	if event.pressed and not event.echo and not event.keycode in [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META, KEY_CAPSLOCK]:
		close()
	return true
