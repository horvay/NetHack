class_name RecordScreen
extends ModalCard
## Three of NetHack's documents, each styled for what it is, with NetHack's
## own words:
##   - conduct (#conduct): each voluntary challenge a medal;
##   - chronicle (#chronicle): a timeline of the run, turn by turn;
##   - lore (the opening "It is written in the Book of …"): a parchment;
##   - an Oracle consultation: NetHack's opening line, then the parchment.
## Any key closes it, as NetHack's window.

var kind := ""  # "conduct", "chronicle", "lore"
var entries: Array = []


static func kind_of(lines: Array) -> String:
	if lines.is_empty():
		return ""
	var first := str(lines[0].get("text", "")).strip_edges()
	if first.begins_with("Voluntary challenges"):
		return "conduct"
	if first.begins_with("Logged events") or first.begins_with("Major events"):
		return "chronicle"
	if first.begins_with("It is written in the Book of"):
		return "lore"
	if first.begins_with("The Oracle ") and first.ends_with(":"):
		return "oracle"
	return ""


func setup(lines: Array, p_kind: String) -> void:
	kind = p_kind
	match kind:
		"conduct":
			_conduct(lines)
		"chronicle":
			_chronicle(lines)
		"lore":
			_lore(lines)
		"oracle":
			# NetHack's own opening line ("The Oracle meditates for a moment
			# and then intones:") above the consultation's parchment.
			card_width = 860.0
			set_title("The Oracle", str(lines[0].get("text", "")).strip_edges())
			_parchment(lines.slice(1))
	var close_button := add_footer_button("Continue  Esc" if kind in ["lore", "oracle"] else "Close  Esc", close)
	set_meta("safe_focus", close_button)


func _conduct(lines: Array) -> void:
	card_width = 760.0
	set_title("Conduct", "The challenges you have kept so far.")
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 8)
	body.add_child(grid)
	for line in lines.slice(1):
		var text := str(line.get("text", "")).strip_edges()
		if text == "":
			continue
		entries.append(text)
		var card := PanelContainer.new()
		card.custom_minimum_size = Vector2(350, 52)
		card.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(UiTheme.GOLD, 0.08), Color(UiTheme.GOLD, 0.45), 10, 1, 0))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		card.add_child(row)
		var medal := Label.new()
		medal.text = "✦"
		medal.custom_minimum_size = Vector2(26, 0)
		medal.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		medal.add_theme_font_size_override("font_size", 22)
		medal.add_theme_color_override("font_color", UiTheme.GOLD)
		row.add_child(medal)
		var label := Label.new()
		label.text = text
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.add_theme_font_size_override("font_size", 16)
		row.add_child(label)
		grid.add_child(card)


func _chronicle(lines: Array) -> void:
	card_width = 820.0
	set_title("Chronicle", "The story of this run so far.")
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 4)
	scroll.add_child(list)
	body.add_child(scroll)
	var row_re := RegEx.create_from_string("^\\s*(\\d+):\\s*(.*)$")
	for line in lines.slice(1):
		var m := row_re.search(str(line.get("text", "")))
		if m == null:
			continue
		entries.append({"turn": int(m.get_string(1)), "text": m.get_string(2)})
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 14)
		var turn := Label.new()
		turn.text = "T %s" % m.get_string(1)
		turn.custom_minimum_size = Vector2(90, 0)
		turn.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		turn.add_theme_font_override("font", UiTheme.bold_font())
		turn.add_theme_font_size_override("font_size", 15)
		turn.add_theme_color_override("font_color", UiTheme.GOLD)
		row.add_child(turn)
		var dot := Label.new()
		dot.text = "●"
		dot.add_theme_color_override("font_color", Color(UiTheme.GOLD, 0.6))
		row.add_child(dot)
		var label := Label.new()
		label.text = m.get_string(2)
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.add_theme_font_size_override("font_size", 17)
		row.add_child(label)
		list.add_child(row)
	scroll.custom_minimum_size = Vector2(0, mini(560, 34 * entries.size() + 10))


func _lore(lines: Array) -> void:
	card_width = 860.0
	set_title("")
	title_label.visible = false
	_parchment(lines)


func _parchment(lines: Array) -> void:
	var parchment := PanelContainer.new()
	var style := UiTheme.panel_style(Color("e9dcb8"), Color("8a6a3a"), 6, 3, 0)
	style.content_margin_left = 48
	style.content_margin_right = 48
	style.content_margin_top = 32
	style.content_margin_bottom = 32
	parchment.add_theme_stylebox_override("panel", style)
	body.add_child(parchment)
	var text := Label.new()
	var paragraphs: Array = []
	var current: Array = []
	for line in lines:
		var t := str(line.get("text", "")).strip_edges()
		if t == "":
			if not current.is_empty():
				paragraphs.append(" ".join(current))
				current = []
		else:
			current.append(t)
	if not current.is_empty():
		paragraphs.append(" ".join(current))
	entries = paragraphs
	text.text = "\n\n".join(paragraphs)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	text.add_theme_font_override("font", UiTheme.heading_font())
	text.add_theme_font_size_override("font_size", 21)
	text.add_theme_color_override("font_color", Color("3a2a14"))
	parchment.add_child(text)


func handle_key(event: InputEventKey) -> bool:
	# (Shift, Ctrl and the like alone don't count as a key.)
	if event.pressed and not event.echo and not event.keycode in [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META, KEY_CAPSLOCK]:
		close()
	return true
