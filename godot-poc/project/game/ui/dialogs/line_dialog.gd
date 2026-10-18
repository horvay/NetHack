class_name LineDialog
extends ModalCard
## NetHack's getlin: a line of text (names, engravings, wishes, counts).

var screen: GameScreen
var field: LineEdit


func setup(game_screen: GameScreen, request: Dictionary) -> void:
	screen = game_screen
	card_width = 600.0
	_query = str(request.get("query", "")).strip_edges()
	set_title(_query, hint_for(_query))
	# What just happened, for questions that follow a message.
	var recent := screen.state.messages.recent(3)
	if not recent.is_empty():
		var context := Label.new()
		context.text = "\n".join(recent.map(func(e: Dictionary) -> String: return str(e.text)))
		context.theme_type_variation = "CaptionLabel"
		context.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		context.custom_minimum_size = Vector2(560, 0)
		body.add_child(context)
	field = LineEdit.new()
	field.custom_minimum_size = Vector2(560, 46)
	field.max_length = 79
	field.placeholder_text = "Type, then press Enter"
	field.text_submitted.connect(func(_t: String) -> void: _submit())
	body.add_child(field)
	_warning = Label.new()
	_warning.theme_type_variation = "CaptionLabel"
	_warning.add_theme_color_override("font_color", UiTheme.WARN)
	_warning.visible = false
	body.add_child(_warning)
	field.text_changed.connect(func(text: String) -> void:
		var plain := true
		for i in text.length():
			if text.unicode_at(i) < 32 or text.unicode_at(i) > 126:
				plain = false
		_warning.text = "NetHack only reads plain letters: accents and symbols will be dropped."
		_warning.visible = not plain)
	if GamepadRouter.active:
		_build_pad_keyboard()
	add_footer_button("Cancel  Esc", _cancel)
	add_footer_button("OK  Enter", _submit, true)


func _ready() -> void:
	super._ready()
	if _first_key:
		_first_key.grab_focus.call_deferred()
	else:
		field.grab_focus.call_deferred()


var _first_key: Button
var _shift := false


## Pad players type with an on-screen keyboard (D-pad moves, A types), with
## suggestions where a prompt has an obvious answer.
func _build_pad_keyboard() -> void:
	var suggestions := []
	if _query.to_lower().contains("engrave") or _query.to_lower().contains("write in the"):
		suggestions.append("Elbereth")
	if not suggestions.is_empty():
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		body.add_child(row)
		for word in suggestions:
			var chip := Button.new()
			chip.text = word
			chip.custom_minimum_size = Vector2(0, 40)
			chip.pressed.connect(func() -> void: field.text = word)
			row.add_child(chip)
	var grid := GridContainer.new()
	grid.columns = 10
	grid.add_theme_constant_override("h_separation", 4)
	grid.add_theme_constant_override("v_separation", 4)
	body.add_child(grid)
	var keys := []
	for ch in "abcdefghijklmnopqrstuvwxyz0123456789-'":
		keys.append(ch)
	keys.append_array(["Shift", "Space", "Del"])
	for key in keys:
		var button := Button.new()
		button.text = key
		button.custom_minimum_size = Vector2(48 if key.length() == 1 else 96, 44)
		button.focus_mode = Control.FOCUS_ALL
		button.pressed.connect(_pad_key.bind(key, grid))
		grid.add_child(button)
		if _first_key == null:
			_first_key = button


func _pad_key(key: String, grid: GridContainer) -> void:
	match key:
		"Shift":
			_shift = not _shift
			for button in grid.get_children():
				if (button as Button).text.length() == 1:
					(button as Button).text = (button as Button).text.to_upper() if _shift else (button as Button).text.to_lower()
		"Space":
			field.text += " "
		"Del":
			field.text = field.text.substr(0, maxi(0, field.text.length() - 1))
		_:
			field.text += key.to_upper() if _shift else key
	field.caret_column = field.text.length()


var _query := ""
var _warning: Label


## A line of help for the common text prompts.
static func hint_for(query: String) -> String:
	# Syntax help only: what to type, never what is a good idea (no spoilers).
	var q := query.to_lower()
	if q.contains("wish"):
		return "Name the object, with any blessing, enchantment or count you want: \"2 blessed scrolls\"."
	if q.contains("engrave") or q.contains("write in the"):
		return "Type the text to write."
	if q.contains("genocide"):
		return "Name a kind of creature (or a class letter, when asked for a class)."
	if q.begins_with("call ") or q.contains("name ") or q.contains(" name") or q.contains("what do you want to call"):
		return "A name of your own helps you recognise it later. Leave empty to remove the name."
	if q.contains("how many") or q.contains("count"):
		return "Type a number."
	if q.contains("what monster") or q.contains("what type of monster"):
		return "Name a kind of creature."
	return "Type your answer, then press Enter."


func _submit() -> void:
	var text := field.text.strip_edges()
	if text == "" and _query.to_lower().contains("wish"):
		# An empty answer would throw the wish away.
		field.placeholder_text = "A wish is precious — name what you want (Esc to give it up)"
		field.add_theme_color_override("font_placeholder_color", UiTheme.WARN)
		return
	var safe := ""
	for i in text.length():
		var code := text.unicode_at(i)
		if code >= 32 and code <= 126:
			safe += text[i]
	screen.send_keys(safe + "\n")
	close()


func _cancel() -> void:
	screen.send_keycode(27)
	close()


func handle_key(event: InputEventKey) -> bool:
	if event.keycode == KEY_ESCAPE:
		_cancel()
		return true
	return false
