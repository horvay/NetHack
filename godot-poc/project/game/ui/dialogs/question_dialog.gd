class_name QuestionDialog
extends ModalCard
## NetHack's yn_function: yes/no questions, multiple-choice questions, and
## item questions ("What do you want to eat? [fg or ?*]"), which become a
## picker showing the matching inventory items with their art. The classic
## letter keys work as typed.

const CHOICE_LABELS := {
	"y": "Yes", "n": "No", "q": "Cancel", "a": "All", "l": "Left hand", "r": "Right hand",
	"-": "Nothing / bare hands", "?": "List choices", "*": "Show everything", "#": "Count",
}

var screen: GameScreen
var request: Dictionary
var choices: Array[String] = []
var item_mode := false
var default_choice := ""
var _safe_button: Button
var _labels: Dictionary = CHOICE_LABELS
var _search: LineEdit
var _default_button: Button


func setup(game_screen: GameScreen, p_request: Dictionary) -> void:
	screen = game_screen
	request = p_request
	var parsed := parse(str(request.get("query", "")), str(request.get("choices", "")))
	choices.assign(parsed.choices)
	item_mode = parsed.item_mode
	# NetHack's own default (sent by the bridge) over one written in the text.
	default_choice = str(request.get("default", "")) if str(request.get("default", "")) != "" else parsed.default
	card_width = 640.0 if item_mode else 520.0
	set_title(parsed.question)
	_labels = labels_for(parsed.question)
	if item_mode:
		_build_item_picker(parsed)
	else:
		# A question is a sentence: body type reads better than the
		# heading face, and the card sits below the hero, not on them.
		title_label.add_theme_font_override("font", UiTheme.body_font())
		title_label.add_theme_font_size_override("font_size", 24)
		title_label.add_theme_color_override("font_color", UiTheme.INK)
		center.offset_top = 260
		_build_choices()
	var cancel: Button = null
	# Cancel only when no answer already says "no" (Esc still cancels).
	if item_mode or not (choices.has("n") or choices.has("q")):
		cancel = add_footer_button("Cancel  Esc", _cancel)
	# Enter answers like tty: NetHack's default, else the safe "no".
	var safe: Button = _default_button if _default_button else (_safe_button if _safe_button else cancel)
	if safe:
		set_meta("safe_focus", safe)


## Answer labels that say what each letter does for this question (shop
## offers and bills read very differently from a plain yes/no).
static func labels_for(question: String) -> Dictionary:
	var q := question.to_lower()
	var labels := CHOICE_LABELS.duplicate()
	if q.ends_with("sell it?") or q.contains("sell them?"):
		labels.merge({"y": "Sell", "n": "Don't sell", "a": "Sell all the rest", "q": "Stop selling"}, true)
	elif q.contains("in credit for"):
		labels.merge({"y": "Take the credit", "n": "Don't sell", "a": "Credit for all", "q": "Stop selling"}, true)
	elif q.begins_with("itemized billing"):
		labels.merge({"y": "One item at a time", "n": "Pay for everything", "m": "Choose from a list", "q": "Not now"}, true)
	elif q.ends_with("pay?"):
		labels.merge({"y": "Pay", "n": "Not this one", "q": "Stop paying"}, true)
	return labels


## Splits a NetHack question into its text, selectable letters and extras.
static func parse(query: String, raw_choices: String) -> Dictionary:
	var question := query.strip_edges()
	var default := ""
	var default_regex := RegEx.create_from_string("\\s*\\(([^)]{1})\\)\\s*$")
	var dm := default_regex.search(question)
	if dm:
		default = dm.get_string(1)
		question = question.substr(0, dm.get_start()).strip_edges()
	var bracket := ""
	var bm := RegEx.create_from_string("\\s*\\[([^\\]]*)\\]\\s*$").search(question)
	if bm:
		bracket = bm.get_string(1)
		question = question.substr(0, bm.get_start()).strip_edges()
	elif raw_choices.strip_edges() == "":
		# "Adjust letter to what [d-zA-Z] (? see used letters)?": the
		# choices can sit mid-sentence.
		bm = RegEx.create_from_string("\\s*\\[([^\\]]*)\\]").search(question)
		if bm:
			bracket = bm.get_string(1)
			question = (question.substr(0, bm.get_start()) + question.substr(bm.get_end())).strip_edges()
	var letters: Array[String] = []
	var extras: Array[String] = []
	var item_mode := false
	if raw_choices.strip_edges() != "":
		for ch in raw_choices:
			if ch == "\u001b" or ch == " ":
				continue
			if not letters.has(ch):
				letters.append(ch)
	elif bracket != "":
		item_mode = true
		var parts := bracket.split(" or ", false, 1)
		letters = expand_selectors(parts[0])
		if parts.size() > 1:
			for ch in parts[1].strip_edges():
				extras.append(ch)
	return {"question": question, "choices": letters, "extras": extras, "default": default, "item_mode": item_mode}


static func expand_selectors(text: String) -> Array[String]:
	var result: Array[String] = []
	var s := text.strip_edges().replace(" ", "")
	var i := 0
	while i < s.length():
		var ch := s[i]
		if i + 2 < s.length() and s[i + 1] == "-" and ch != "-":
			var a := ch.unicode_at(0)
			var b := s[i + 2].unicode_at(0)
			for code in range(a, b + 1):
				result.append(char(code))
			i += 3
			continue
		result.append(ch)
		i += 1
	return result


func _build_choices() -> void:
	var grid := HFlowContainer.new()
	grid.alignment = FlowContainer.ALIGNMENT_END
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	body.add_child(grid)
	for ch in choices:
		var label: String = _labels.get(ch, ch)
		var button := Button.new()
		button.theme_type_variation = "ChoiceButton"
		button.focus_mode = Control.FOCUS_ALL
		button.text = "%s   %s" % [label, ch] if label != ch else ch
		button.custom_minimum_size = Vector2(150, 50)
		if ch == default_choice:
			# NetHack's default: a warm fill (gold borders mean focus), and
			# "default" under the label.
			button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("3a2e14"), Color(1, 1, 1, 0.07), 8))
			var caption := Label.new()
			caption.text = "default"
			caption.add_theme_font_size_override("font_size", 11)
			caption.add_theme_color_override("font_color", Color(UiTheme.GOLD, 0.8))
			caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
			caption.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
			caption.grow_horizontal = Control.GROW_DIRECTION_BOTH
			caption.offset_top = -15
			caption.offset_bottom = -1
			button.add_child(caption)
			_default_button = button
		if ch == "n" or (ch == default_choice and default_choice != "y" and _safe_button == null):
			_safe_button = button
		button.pressed.connect(_answer.bind(ch))
		grid.add_child(button)


func _build_item_picker(parsed: Dictionary) -> void:
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(600, mini(440, 60 * maxi(1, choices.size()) + 8))
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 4)
	scroll.add_child(list)
	var by_letter := {}
	for item in screen.state.inventory:
		by_letter[char(int(item.get("selector", 0)))] = item
	var known := choices.filter(func(ch: String) -> bool: return by_letter.has(ch)).size()
	if choices.size() > 12 and known * 2 < choices.size():
		# Mostly free letters ("Adjust letter to what?"): a compact grid of
		# keys, with the ones already in use marked.
		scroll.custom_minimum_size = Vector2(600, 0)
		scroll.get_parent().remove_child(scroll)
		scroll.queue_free()
		var grid := HFlowContainer.new()
		grid.add_theme_constant_override("h_separation", 4)
		grid.add_theme_constant_override("v_separation", 4)
		grid.custom_minimum_size = Vector2(600, 0)
		body.add_child(grid)
		for ch in choices:
			var key := Button.new()
			key.text = ch
			key.custom_minimum_size = Vector2(40, 40)
			key.focus_mode = Control.FOCUS_ALL
			if by_letter.has(ch):
				key.tooltip_text = "In use: " + ItemText.display_name(by_letter[ch])
				key.add_theme_color_override("font_color", UiTheme.GOLD)
			key.pressed.connect(_answer.bind(ch))
			grid.add_child(key)
		for ch in parsed.extras:
			add_footer_button("%s  %s" % [_labels.get(ch, ch), ch], _answer.bind(ch))
		return
	# Long lists get a search box (the classic letters still work).
	if choices.size() >= 10:
		var search := LineEdit.new()
		_search = search
		search.placeholder_text = "Search…   ( / )"
		search.custom_minimum_size = Vector2(0, 40)
		body.add_child(search)
		body.move_child(search, scroll.get_index())
		search.text_changed.connect(func(text: String) -> void:
			var needle := text.strip_edges().to_lower()
			for child in list.get_children():
				if child is ItemRow:
					child.visible = needle == "" or ItemText.display_name((child as ItemRow).item).to_lower().contains(needle))
	for ch in choices:
		var row := ItemRow.new()
		if by_letter.has(ch):
			row.setup_item(by_letter[ch], screen.state)
			# A stack offers a count, like typing 3a (mouse and pad players).
			var quantity := int(by_letter[ch].get("quantity", 1))
			if quantity > 1:
				row.set_stack(quantity)
				row.always_show_quantity = true
		else:
			row.setup_plain(ch, _labels.get(ch, "Choice " + ch))
		row.pressed.connect(_answer_row.bind(row, ch))
		list.add_child(row)
	if choices.is_empty():
		var none := Label.new()
		none.text = "You have nothing suitable — but you can still pick from everything."
		none.theme_type_variation = "CaptionLabel"
		list.add_child(none)
	for ch in parsed.extras:
		add_footer_button("%s  %s" % [_labels.get(ch, ch), ch], _answer.bind(ch))


func _answer_row(row: ItemRow, ch: String) -> void:
	var count := row.chosen_quantity()
	_answer((str(count) if count > 0 else "") + ch)


func _answer(ch: String) -> void:
	screen.send_keys(ch)
	close()


## A cancel answers q or n when a real yes/no question offers them (the
## bridge would map Escape the same way, as tty does). Item questions list
## inventory letters as choices: there q or n would USE an item, so they
## always cancel with Escape.
func _cancel() -> void:
	if item_mode or str(request.get("choices", "")).strip_edges() == "":
		screen.send_keycode(27)
	elif choices.has("q"):
		screen.send_keys("q")
	elif choices.has("n"):
		screen.send_keys("n")
	else:
		screen.send_keycode(27)
	close()


func handle_key(event: InputEventKey) -> bool:
	var focused := get_viewport().gui_get_focus_owner()
	# Typing into the picker's search box stays in the box.
	if focused is LineEdit and is_ancestor_of(focused):
		if event.keycode == KEY_ESCAPE:
			focused.release_focus()
			return true
		return false
	if InputRouter.is_navigation(event):
		return false  # the arrows move the highlight, they never answer
	# Enter presses the highlighted answer; with none, NetHack's default.
	if event.keycode in [KEY_ENTER, KEY_KP_ENTER] and focused is Button and is_ancestor_of(focused):
		return false
	var text := InputRouter.key_to_nethack(event)
	if text == "":
		return false
	if text == char(27):
		_cancel()
		return true
	if text == "/" and _search:
		_search.grab_focus()
		return true
	if text == "\n" and default_choice != "":
		_answer(default_choice)
		return true
	# Classic: any typed key goes to NetHack, which decides if it is valid.
	screen.send_keys(text)
	if choices.has(text) or text in ["?", "*", "-"]:
		close()
	return true
