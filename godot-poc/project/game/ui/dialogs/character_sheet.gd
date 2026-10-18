class_name CharacterSheet
extends ModalCard
## NetHack's ^X (attributes) as a character sheet: the hero's portrait and
## NetHack's own one-line identity, the gods, the basics as tiles (HP,
## energy, armor class, gold), the six characteristics as bars, and every
## other section NetHack writes (status, miscellaneous, and the extra
## sections enlightenment adds) as cards of its own sentences. Nothing is
## added to what ^X says. Any key or Esc closes it, as NetHack's window.

const STAT_ORDER := ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]
const STAT_SHORT := {"strength": "St", "dexterity": "Dx", "constitution": "Co", "intelligence": "In", "wisdom": "Wi", "charisma": "Ch"}

var screen: GameScreen
var title_text := ""
var sections: Array = []  # [{heading, lines: Array[String]}]


## True when these lines are NetHack's attributes text.
static func recognises(lines: Array) -> bool:
	for line in lines.slice(0, 3):
		var text := str(line.get("text", "")).to_lower()
		if text.ends_with("attributes:"):
			return true
	return false


func setup(game_screen: GameScreen, lines: Array) -> void:
	screen = game_screen
	_parse(lines)
	card_width = 1240.0
	set_title(title_text.trim_suffix(":") if title_text != "" else "Attributes", _identity_line())
	_build()
	var close_button := add_footer_button("Close  Esc", close)
	set_meta("safe_focus", close_button)


func _parse(lines: Array) -> void:
	var current: Dictionary = {}
	for line in lines:
		var raw := str(line.get("text", ""))
		var text := raw.strip_edges()
		if text == "":
			continue
		if title_text == "" and text.to_lower().ends_with("attributes:"):
			title_text = text
			continue
		if not raw.begins_with(" ") and text.ends_with(":"):
			current = {"heading": text.trim_suffix(":"), "lines": []}
			sections.append(current)
			continue
		if current.is_empty():
			current = {"heading": "", "lines": []}
			sections.append(current)
		(current.lines as Array).append(text)


func _section(heading: String) -> Array:
	for section in sections:
		if str(section.heading).to_lower() == heading:
			return section.lines
	return []


func _identity_line() -> String:
	for line in _section("background"):
		var m := RegEx.create_from_string("^You are an? (.+)\\.$").search(str(line))
		if m:
			return m.get_string(1).substr(0, 1).to_upper() + m.get_string(1).substr(1)
	return ""


func _build() -> void:
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 16)
	body.add_child(top)
	# Portrait and gods.
	var left := VBoxContainer.new()
	left.custom_minimum_size = Vector2(300, 0)
	left.add_theme_constant_override("separation", 10)
	top.add_child(left)
	var portrait := TextureRect.new()
	portrait.custom_minimum_size = Vector2(300, 220)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	var resolver := TileResolver.shared()
	var avatar := resolver.player_avatar_id(screen.state.character)
	if avatar != "":
		portrait.texture = resolver.portrait(avatar)
	left.add_child(portrait)
	left.add_child(_card("Background", _section("background")))
	# Basics and characteristics.
	var middle := VBoxContainer.new()
	middle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	middle.add_theme_constant_override("separation", 12)
	top.add_child(middle)
	middle.add_child(_basics())
	middle.add_child(_characteristics())
	# The rest, as NetHack wrote it.
	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 10)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(420, 600)
	scroll.add_child(right)
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(scroll)
	for section in sections:
		var heading := str(section.heading).to_lower()
		if heading in ["background", "basics", "characteristics"]:
			continue
		right.add_child(_card(str(section.heading) if str(section.heading) != "" else "Notes", section.lines))


func _card(heading: String, lines: Array) -> Control:
	var panel := PanelContainer.new()
	var style := UiTheme.panel_style(Color(1, 1, 1, 0.04), Color(1, 1, 1, 0.1), 10, 1, 0)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 8
	style.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	panel.add_child(column)
	var title := Label.new()
	title.text = heading.to_upper()
	title.add_theme_font_override("font", UiTheme.heading_font())
	title.add_theme_font_size_override("font_size", 15)
	title.add_theme_color_override("font_color", UiTheme.GOLD)
	column.add_child(title)
	for line in lines:
		var label := Label.new()
		label.text = str(line)
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.add_theme_font_size_override("font_size", 16)
		label.add_theme_color_override("font_color", UiTheme.INK)
		column.add_child(label)
	return panel


## HP, energy, armor class and gold as tiles, from NetHack's sentences.
func _basics() -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var status := screen.state.status
	var tiles := [
		["Hit points", "%d / %d" % [status.number(StatusModel.Field.HP), status.number(StatusModel.Field.HPMAX)], UiTheme.BAD],
		["Energy", "%d / %d" % [status.energy(), status.energy_max()], UiTheme.ENERGY],
		["Armor class", str(status.number(StatusModel.Field.AC)), UiTheme.INK],
		["Gold", str(status.number(StatusModel.Field.GOLD)), UiTheme.GOLD],
	]
	for t in tiles:
		var panel := PanelContainer.new()
		panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		panel.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(t[2], 0.1), Color(t[2], 0.5), 10, 1, 0))
		var column := VBoxContainer.new()
		column.alignment = BoxContainer.ALIGNMENT_CENTER
		panel.add_child(column)
		var value := Label.new()
		value.text = str(t[1])
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		value.add_theme_font_override("font", UiTheme.bold_font())
		value.add_theme_font_size_override("font_size", 24)
		value.add_theme_color_override("font_color", (t[2] as Color).lightened(0.2))
		column.add_child(value)
		var label := Label.new()
		label.text = str(t[0])
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size", 13)
		label.add_theme_color_override("font_color", UiTheme.INK_DIM)
		column.add_child(label)
		row.add_child(panel)
	var wrap := VBoxContainer.new()
	wrap.add_child(row)
	var extra := _section("basics").filter(func(l: String) -> bool:
		var lower := l.to_lower()
		return not (lower.contains("hit points") or lower.contains("energy points") or lower.contains("armor class") or lower.contains("wallet") or lower.contains("gold")))
	if not extra.is_empty():
		wrap.add_child(_card("Basics", extra))
	return wrap


## The six characteristics as bars ("Your strength is 18/01.").
func _characteristics() -> Control:
	var panel := PanelContainer.new()
	var style := UiTheme.panel_style(Color(1, 1, 1, 0.04), Color(1, 1, 1, 0.1), 10, 1, 0)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 12
	panel.add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	panel.add_child(column)
	var title := Label.new()
	title.text = "CHARACTERISTICS"
	title.add_theme_font_override("font", UiTheme.heading_font())
	title.add_theme_font_size_override("font_size", 15)
	title.add_theme_color_override("font_color", UiTheme.GOLD)
	column.add_child(title)
	var values := {}
	for line in _section("characteristics"):
		var m := RegEx.create_from_string("(?i)your (\\w+) is ([0-9/*]+)").search(str(line))
		if m:
			values[m.get_string(1).to_lower()] = m.get_string(2)
	for stat in STAT_ORDER:
		if not values.has(stat):
			continue
		var row := HBoxContainer.new()
		row.name = "Stat_%s" % stat
		row.add_theme_constant_override("separation", 10)
		var name := Label.new()
		name.text = "%s  %s" % [STAT_SHORT[stat], stat.capitalize()]
		name.custom_minimum_size = Vector2(170, 0)
		name.add_theme_font_size_override("font_size", 16)
		row.add_child(name)
		var bar := CharacteristicBar.new()
		bar.value_text = str(values[stat])
		bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(bar)
		var value := Label.new()
		value.text = str(values[stat])
		value.custom_minimum_size = Vector2(70, 0)
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		value.add_theme_font_override("font", UiTheme.bold_font())
		value.add_theme_font_size_override("font_size", 18)
		row.add_child(value)
		column.add_child(row)
	return panel


func handle_key(event: InputEventKey) -> bool:
	# Any key closes it, as NetHack's window.
	# (Shift, Ctrl and the like alone don't count as a key.)
	if event.pressed and not event.echo and not event.keycode in [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META, KEY_CAPSLOCK]:
		close()
	return true
