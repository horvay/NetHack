class_name BestiaryScreen
extends ModalCard
## NetHack's #vanquished and #genocided lists as a bestiary: a card per
## species with its tile, NetHack's name for it and how many fell (×N);
## NetHack's class headings when it sorts by class; genocided or extinct
## species crossed out. Only what the list says. Any key closes it, as
## NetHack's window.

var kind := ""  # "vanquished" or "genocided"
var groups: Array = []  # [{heading, entries: [{name, count, note, monster}]}]
var total_line := ""


static func kind_of(lines: Array) -> String:
	if lines.is_empty():
		return ""
	var first := str(lines[0].get("text", "")).strip_edges()
	if first.begins_with("Vanquished creatures"):
		return "vanquished"
	if first.ends_with("species:") and (first.begins_with("Genocided") or first.begins_with("Extinct")):
		return "genocided"
	return ""


## The singular a plural species name stands for, as far as the tiles know it
## ("jackals" → "jackal", "dwarves" → "dwarf", "mice" → "mouse").
static func singular(name: String) -> String:
	var resolver := TileResolver.shared()
	var candidates := [name]
	for pair in [["ies", "y"], ["ves", "f"], ["ves", "fe"], ["men", "man"], ["ice", "ouse"], ["eeth", "ooth"], ["es", ""], ["s", ""], ["i", "us"], ["a", "on"], ["ae", "a"]]:
		if name.ends_with(pair[0]):
			candidates.append(name.substr(0, name.length() - str(pair[0]).length()) + str(pair[1]))
	for candidate in candidates:
		var id := resolver.asset_for_semantic_name(candidate, "monster")
		if id != "" and resolver.has_asset(id):
			return candidate
	return name


func setup(lines: Array, p_kind: String) -> void:
	kind = p_kind
	_parse(lines)
	card_width = 1100.0
	var count := 0
	for g in groups:
		count += (g.entries as Array).size()
	set_title(str(lines[0].get("text", "")).strip_edges().trim_suffix(":"), total_line if total_line != "" else "%d species." % count)
	_build()
	var close_button := add_footer_button("Close  Esc", close)
	set_meta("safe_focus", close_button)


func _parse(lines: Array) -> void:
	var counted := RegEx.create_from_string("^(\\d+) (.+)$")
	var times := RegEx.create_from_string("^(.+) \\((?:(\\d+) times|(once|twice|thrice))\\)$")
	var current: Dictionary = {}
	for line in lines.slice(1):
		var raw := str(line.get("text", ""))
		var text := raw.strip_edges()
		if text == "":
			continue
		if text.ends_with(" vanquished.") or text.ends_with(" genocided.") or text.ends_with(" extinct."):
			total_line = text if total_line == "" else total_line + "  ·  " + text
			continue
		# NetHack's class headings ("Dogs and other canines") start at the
		# margin; entries are indented.
		if not raw.begins_with(" ") and not text.begins_with("the ") and not counted.search(text) and not text.begins_with("a ") and not text.begins_with("an "):
			current = {"heading": text, "entries": []}
			groups.append(current)
			continue
		if current.is_empty():
			current = {"heading": "", "entries": []}
			groups.append(current)
		var name := text
		var count := 1
		var note := ""
		var unique := text.begins_with("the ")
		if text.ends_with("(extinct)"):
			note = "extinct"
			name = text.trim_suffix("(extinct)").strip_edges()
		var m := counted.search(name)
		if m:
			count = int(m.get_string(1))
			name = m.get_string(2)
		var t := times.search(name)
		if t:
			name = t.get_string(1)
			count = int(t.get_string(2)) if t.get_string(2) != "" else int({"once": 1, "twice": 2, "thrice": 3}[t.get_string(3)])
			unique = true
		for article in ["the ", "an ", "a "]:
			if name.begins_with(article):
				name = name.substr(article.length())
				break
		var monster := name
		if (count > 1 and not unique) or kind == "genocided":
			monster = singular(name)
		(current.entries as Array).append({"name": name, "count": count, "note": note, "monster": monster})


func _build() -> void:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	scroll.add_child(column)
	var rows := 0
	for group in groups:
		if str(group.heading) != "":
			var heading := Label.new()
			heading.text = str(group.heading)
			heading.add_theme_font_override("font", UiTheme.heading_font())
			heading.add_theme_font_size_override("font_size", 16)
			heading.add_theme_color_override("font_color", UiTheme.GOLD)
			column.add_child(heading)
			rows += 1
		var grid := GridContainer.new()
		grid.columns = 4
		grid.add_theme_constant_override("h_separation", 10)
		grid.add_theme_constant_override("v_separation", 10)
		column.add_child(grid)
		for entry in group.entries:
			grid.add_child(_card(entry))
		rows += ceili((group.entries as Array).size() / 4.0) * 2
	scroll.custom_minimum_size = Vector2(0, clampi(rows * 40 + 10, 120, 620))


func _card(entry: Dictionary) -> Control:
	var panel := PanelContainer.new()
	panel.name = "Beast_%s" % str(entry.monster).replace(" ", "_")
	panel.set_meta("entry", entry)
	panel.custom_minimum_size = Vector2(250, 72)
	var gone := kind == "genocided"
	var style := UiTheme.panel_style(Color(1, 1, 1, 0.04), Color(UiTheme.BAD, 0.5) if gone else Color(1, 1, 1, 0.1), 10, 1, 0)
	style.content_margin_left = 8
	style.content_margin_right = 10
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	panel.add_theme_stylebox_override("panel", style)
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 10)
	panel.add_child(line)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(56, 56)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var resolver := TileResolver.shared()
	var id := resolver.asset_for_semantic_name(str(entry.monster), "monster")
	if id != "" and resolver.has_asset(id):
		icon.texture = resolver.texture(id)
	if gone:
		icon.modulate = Color(0.55, 0.5, 0.5, 0.8)
	line.add_child(icon)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.alignment = BoxContainer.ALIGNMENT_CENTER
	line.add_child(words)
	var title := Label.new()
	# One name per species: "Jackal ×2", not "Jackals ×2".
	var shown := str(entry.monster) if int(entry.count) > 1 or gone else str(entry.name)
	title.text = shown.substr(0, 1).to_upper() + shown.substr(1)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.add_theme_font_override("font", UiTheme.bold_font())
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", UiTheme.INK_DIM if gone else UiTheme.INK)
	words.add_child(title)
	if gone:
		var sub := Label.new()
		sub.text = "Extinct" if str(entry.note) == "extinct" else "Genocided"
		sub.add_theme_font_size_override("font_size", 13)
		sub.add_theme_color_override("font_color", UiTheme.BAD)
		words.add_child(sub)
	elif int(entry.count) > 1:
		var count := Label.new()
		count.text = "×%d" % int(entry.count)
		count.add_theme_font_override("font", UiTheme.heading_font())
		count.add_theme_font_size_override("font_size", 22)
		count.add_theme_color_override("font_color", UiTheme.GOLD)
		line.add_child(count)
	return panel


func handle_key(event: InputEventKey) -> bool:
	# (Shift, Ctrl and the like alone don't count as a key.)
	if event.pressed and not event.echo and not event.keycode in [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META, KEY_CAPSLOCK]:
		close()
	return true
