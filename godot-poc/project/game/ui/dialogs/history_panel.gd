class_name HistoryPanel
extends ModalCard
## Every message of the run, grouped by turn: searchable, filterable by
## kind, selectable and copyable. Also keeps what the plain feed doesn't:
## the opening lore and every question NetHack asked.

const FILTERS := [["all", "All"], ["combat", "Combat"], ["danger", "Danger"], ["loot", "Loot"],
	["magic", "Magic"], ["speech", "Speech"], ["question", "Questions"], ["lore", "Lore"]]

var screen: GameScreen
var search: LineEdit
var text: RichTextLabel
var scroll: ScrollContainer
var filter := "all"
var _chips: HBoxContainer
var _shown := PackedStringArray()


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	card_width = 900.0
	var count := screen.state.messages.entries.filter(func(e: Dictionary) -> bool: return not e.get("note", false)).size()
	set_title("Message history", "%d message%s this run" % [count, "" if count == 1 else "s"])
	search = LineEdit.new()
	search.placeholder_text = "Search messages…"
	search.custom_minimum_size = Vector2(0, 42)
	search.text_changed.connect(func(_t: String) -> void: _render())
	body.add_child(search)
	_chips = HBoxContainer.new()
	_chips.add_theme_constant_override("separation", 6)
	body.add_child(_chips)
	for spec in FILTERS:
		var chip := Button.new()
		chip.text = spec[1]
		chip.toggle_mode = true
		chip.focus_mode = Control.FOCUS_ALL
		chip.custom_minimum_size = Vector2(0, 34)
		chip.button_pressed = spec[0] == filter
		chip.pressed.connect(func() -> void:
			filter = spec[0]
			for other in _chips.get_children():
				(other as Button).button_pressed = other == chip
			_render())
		_chips.add_child(chip)
	scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(860, clampf(screen.get_viewport().get_visible_rect().size.y - 420.0, 260.0, 600.0))
	body.add_child(scroll)
	text = RichTextLabel.new()
	text.bbcode_enabled = true
	text.fit_content = true
	# Drag to select, Ctrl+C or right-click to copy.
	text.selection_enabled = true
	text.context_menu_enabled = true
	text.custom_minimum_size = Vector2(840, 0)
	text.add_theme_font_override("normal_font", UiTheme.body_font())
	text.add_theme_font_override("bold_font", UiTheme.bold_font())
	text.add_theme_font_override("italics_font", UiTheme.italic_font())
	text.add_theme_font_size_override("normal_font_size", 18)
	text.add_theme_font_size_override("bold_font_size", 15)
	text.add_theme_font_size_override("italics_font_size", 18)
	text.add_theme_color_override("default_color", UiTheme.INK)
	scroll.add_child(text)
	add_footer_button("Copy shown", _copy)
	add_footer_button("Close  Esc", close, true)
	_render()


func _ready() -> void:
	super._ready()
	await get_tree().process_frame
	scroll.scroll_vertical = int(scroll.get_v_scroll_bar().max_value)


func _render() -> void:
	var needle := search.text.strip_edges().to_lower()
	var out := PackedStringArray()
	_shown = PackedStringArray()
	var last_turn := -999
	for entry in screen.state.messages.entries:
		if needle != "" and not str(entry.text).to_lower().contains(needle):
			continue
		if filter != "all" and str(entry.get("category", "info")) != filter:
			continue
		if int(entry.turn) != last_turn:
			last_turn = int(entry.turn)
			out.append("[color=#8f7442][b]TURN %d[/b][/color]" % last_turn if last_turn > 0 else "[color=#8f7442][b]START[/b][/color]")
		var line := str(entry.text).replace("[", "[lb]")
		match str(entry.get("category", "")):
			"question":
				line = "[color=#a39b8a]? %s[/color]" % line
			"lore":
				line = "[i][color=#c9b98f]%s[/color][/i]" % line
			_:
				if entry.urgent:
					line = "[color=#ef5b4c]%s[/color]" % line
		out.append(line)
		_shown.append(str(entry.text))
	text.text = "\n".join(out) if not out.is_empty() else "[color=#6d675d]Nothing matches.[/color]"


## Copies the selection if there is one, else every message shown.
func _copy() -> void:
	var selected := text.get_selected_text()
	DisplayServer.clipboard_set(selected if selected != "" else "\n".join(_shown))
	screen.hud.feed.flash_notice("Copied to the clipboard.")
