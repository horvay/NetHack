class_name TextWindowDialog
extends ModalCard
## Text NetHack shows in a window (lore, help pages, "things that are here",
## attributes...). The game does not wait on it; any key or click closes it.
## Long texts get a search box ( / or Ctrl+F): matches are highlighted and
## Enter / F3 jumps to the next one.

func setup(window: Dictionary) -> void:
	var lines: Array = window.get("lines", [])
	var longest := 0
	for line in lines:
		longest = maxi(longest, str(line.get("text", "")).length())
	card_width = clampf(longest * 10.5 + 80.0, 460.0, 980.0)
	var title := ""
	var start := 0
	# A leading non-empty line becomes the title when the text has a heading.
	if lines.size() > 2 and str(lines[0].get("text", "")).strip_edges() != "" and str(lines[1].get("text", "")).strip_edges() == "":
		title = str(lines[0].text).strip_edges()
		start = 2
	set_title(title if title != "" else "")
	title_label.visible = title != ""
	var scroll := ScrollContainer.new()
	_scroll = scroll
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_ALWAYS if lines.size() - start > 26 else ScrollContainer.SCROLL_MODE_AUTO
	scroll.custom_minimum_size = Vector2(card_width - 40.0, clampi((lines.size() - start) * 28 + 16, 60, 800))
	body.add_child(scroll)
	if lines.size() - start > 26:
		_search = LineEdit.new()
		_search.placeholder_text = "Search…   ( / )"
		_search.custom_minimum_size = Vector2(0, 40)
		_search.clear_button_enabled = true
		body.add_child(_search)
		body.move_child(_search, scroll.get_index())
		_search.text_changed.connect(func(_t: String) -> void: _find(0))
		_search.text_submitted.connect(func(_t: String) -> void: _find(1))
	var text := RichTextLabel.new()
	_text = text
	text.bbcode_enabled = true
	text.fit_content = true
	text.custom_minimum_size = Vector2(card_width - 60.0, 0)
	text.add_theme_font_override("normal_font", UiTheme.body_font())
	text.add_theme_font_size_override("normal_font_size", 19)
	text.add_theme_color_override("default_color", UiTheme.INK)
	var content := PackedStringArray()
	for i in range(start, lines.size()):
		content.append(str(lines[i].get("text", "")))
	_lines = content
	text.text = _render(-1)
	scroll.add_child(text)
	_more = Label.new()
	_more.text = "More below  ▼   (arrows / Page Down)"
	_more.theme_type_variation = "CaptionLabel"
	_more.add_theme_color_override("font_color", UiTheme.GOLD)
	_more.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(_more)
	scroll.get_v_scroll_bar().value_changed.connect(func(_v: float) -> void: _update_more())
	add_footer_button("Close  Esc", close, true)


var _scroll: ScrollContainer
var _more: Label
var _text: RichTextLabel
var _search: LineEdit
var _lines := PackedStringArray()
var _current := -1


## The text with every match of the search highlighted, the current one
## brighter. NetHack's text is shown literally (brackets escaped).
func _render(current: int) -> String:
	var needle := _search.text.strip_edges().to_lower() if _search else ""
	var out := PackedStringArray()
	for i in _lines.size():
		var line: String = _lines[i]
		if needle == "" or not line.to_lower().contains(needle):
			out.append(line.replace("[", "[lb]"))
			continue
		var built := ""
		var at := 0
		var lower := line.to_lower()
		var colour := "#f2c14e" if i == current else "#8a6d2a"
		while true:
			var found := lower.find(needle, at)
			if found < 0:
				break
			built += line.substr(at, found - at).replace("[", "[lb]")
			built += "[bgcolor=%s][color=#14110c]%s[/color][/bgcolor]" % [colour, line.substr(found, needle.length()).replace("[", "[lb]")]
			at = found + needle.length()
		out.append(built + line.substr(at).replace("[", "[lb]"))
	return "\n".join(out)


## Moves to the first match at or after the current one (step 0) or the
## next one (step 1), wrapping round, and scrolls it into view.
func _find(step: int) -> void:
	var needle := _search.text.strip_edges().to_lower()
	var matches: Array[int] = []
	if needle != "":
		for i in _lines.size():
			if _lines[i].to_lower().contains(needle):
				matches.append(i)
	if matches.is_empty():
		_current = -1
		_search.add_theme_color_override("font_color", UiTheme.BAD if needle != "" else UiTheme.INK)
	else:
		_search.remove_theme_color_override("font_color")
		var from := maxi(_current, 0) + step
		_current = matches[0]
		for i in matches:
			if i >= from:
				_current = i
				break
	_text.text = _render(_current)
	if _current >= 0:
		await get_tree().process_frame
		if is_instance_valid(_text):
			_scroll.scroll_vertical = int(maxf(0.0, _text.get_paragraph_offset(_current) - 60.0))


func _process(_delta: float) -> void:
	_update_more()


func _update_more() -> void:
	if _scroll == null:
		return
	var bar := _scroll.get_v_scroll_bar()
	_more.visible = bar.max_value - bar.page > 4 and bar.value < bar.max_value - bar.page - 4


## Navigation keys scroll; anything else dismisses (and is consumed, so a
## dismissal never doubles as a move).
func handle_key(event: InputEventKey) -> bool:
	var bar := _scroll.get_v_scroll_bar()
	if _search:
		if _search.has_focus():
			if event.keycode == KEY_ESCAPE:
				_search.release_focus()
				return true
			if event.keycode in [KEY_UP, KEY_DOWN, KEY_PAGEUP, KEY_PAGEDOWN]:
				_search.release_focus()
			else:
				return false  # typing stays in the box
		elif event.unicode == "/".unicode_at(0) or (event.keycode == KEY_F and event.ctrl_pressed):
			_search.grab_focus()
			return true
		elif event.keycode == KEY_F3 or (event.keycode == KEY_N and _current >= 0):
			_find(1)
			return true
	# Shift, Ctrl and friends alone never dismiss the text.
	if event.keycode in [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META, KEY_CAPSLOCK, KEY_NUMLOCK]:
		return true
	match event.keycode:
		KEY_DOWN, KEY_J:
			bar.value += 60
		KEY_UP, KEY_K:
			bar.value -= 60
		KEY_PAGEDOWN, KEY_SPACE:
			if event.keycode == KEY_SPACE and not _more.visible:
				close()
			else:
				bar.value += bar.page * 0.9
		KEY_PAGEUP:
			bar.value -= bar.page * 0.9
		KEY_HOME:
			bar.value = 0
		KEY_END:
			bar.value = bar.max_value
		_:
			close()
	return true


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if not card.get_global_rect().has_point(event.global_position):
			close()
