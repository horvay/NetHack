class_name MenuDialog
extends ModalCard
## NetHack menus (select_menu). PICK_NONE shows information, PICK_ONE picks
## on click, PICK_ANY toggles rows with optional counts and confirms. Item
## rows show art. Classic keys: letters toggle/pick, digits build a count,
## Enter confirms, Esc cancels. Long menus get a search box.

const PICK_NONE := 0
const PICK_ONE := 1
const PICK_ANY := 2

var screen: GameScreen
var request: Dictionary
var how := 0
var rows: Array[ItemRow] = []
## selector -> count (-1 = all)
var picks: Dictionary = {}
var search: LineEdit
var transfer := false
## A shopkeeper's "Pay for which items?" bill: rows carry prices.
var paying := false
var _pending_count := ""
var _list: VBoxContainer
var _summary: Label

const TRANSFER_HEADINGS := {
	"ground.pickup": ["Pick up", "From the floor into your pack"],
	"container.takeOut": ["Take out", "From the container into your pack"],
	"container.putIn": ["Put in", "From your pack into the container"],
	"drop": ["Drop", "From your pack onto the floor"],
}


func setup(game_screen: GameScreen, p_request: Dictionary) -> void:
	screen = game_screen
	request = p_request
	how = int(request.get("how", 0))
	var items: Array = request.get("items", [])
	card_width = 700.0
	var prompt := str(request.get("prompt", "")).strip_edges()
	if prompt == "":
		# ? or * at "What do you want to eat?": NetHack titles that item
		# list with nothing; the question it came from says what it's for.
		var asked := screen.state.last_question().get_slice("[", 0).strip_edges()
		if how == PICK_ONE and asked.to_lower().begins_with("what do you want to"):
			prompt = asked
		else:
			prompt = "Choose" if how != PICK_NONE else "Information"
	var hint := ""
	match how:
		PICK_ONE:
			hint = "Click a choice or press its letter."
		PICK_ANY:
			hint = "Select any number, then confirm. Type a number before a letter to take only that many."
	var purpose := str(request.get("purpose", ""))
	var lower_prompt := prompt.to_lower()
	# NetHack's options menu: picking toggles each option (or asks for its
	# value); counts mean nothing there.
	var options_menu := lower_prompt.begins_with("set what options")
	if lower_prompt.begins_with("loot which"):
		hint = "Pick the containers to open, then confirm."
	if options_menu:
		hint = "Pick the options to change, then confirm: each one picked is toggled, or asks for its new value."
	var transfer_key := purpose if TRANSFER_HEADINGS.has(purpose) else ("drop" if lower_prompt.contains("drop") and not lower_prompt.contains("type") and how == PICK_ANY else "")
	transfer = transfer_key != "" and how == PICK_ANY
	paying = how == PICK_ANY and lower_prompt.begins_with("pay for which")
	if paying:
		card_width = 760.0
		set_title("Pay the shopkeeper", "Choose what to buy. Anything you don't pay for stays on your bill.")
	elif transfer:
		var heading: Array = TRANSFER_HEADINGS[transfer_key]
		card_width = 820.0
		set_title(heading[0], heading[1] + "   ·   select items, adjust stack sizes, then confirm")
	else:
		set_title(prompt, hint)
	if items.size() > 12 and how != PICK_NONE:
		search = LineEdit.new()
		search.placeholder_text = "Search…"
		search.custom_minimum_size = Vector2(0, 40)
		search.text_changed.connect(_filter)
		body.add_child(search)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(660, clampi(items.size() * 46 + 10, 80, 560))
	body.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 2)
	scroll.add_child(_list)
	var magic: Dictionary = screen.state.magic_rows.get(str(request.get("menu_id", "")), {})
	if not magic.is_empty():
		_build_magic(magic, items)
	else:
		for entry in items:
			_add_entry(entry)
	match how:
		PICK_NONE:
			add_footer_button("Close  Esc", _cancel, true)
		PICK_ONE:
			add_footer_button("Cancel  Esc", _cancel)
		PICK_ANY:
			_summary = Label.new()
			_summary.theme_type_variation = "CaptionLabel"
			_summary.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			footer.add_child(_summary)
			var toggle_hint := Label.new()
			toggle_hint.text = "Arrows + Space pick  ·  " if not GamepadRouter.active else ""
			toggle_hint.theme_type_variation = "CaptionLabel"
			footer.add_child(toggle_hint)
			footer.move_child(toggle_hint, _summary.get_index())
			# Not in "what type of items?" menus: there, selecting everything
			# includes "Auto-select every relevant item" and acts at once.
			# Nor in the options menu: it would flip every option at once.
			if not _is_type_menu(lower_prompt) and not options_menu:
				add_footer_button("Select all", _select_all.bind(true))
			add_footer_button("Clear", _clear)
			add_footer_button("Cancel  Esc", _cancel)
			var confirm_text := "Pay  Enter" if paying else (("%s  Enter" % TRANSFER_HEADINGS[transfer_key][0]) if transfer else "Confirm  Enter")
			add_footer_button(confirm_text, _confirm, true)
	# Preselected entries (MENU_ITEMFLAGS_SELECTED).
	for row in rows:
		if int(row.item.get("itemflags", 0)) & 0x1:
			_toggle(row, true)
	_update_summary()


func _add_entry(entry: Dictionary) -> void:
	var selector := int(entry.get("selector", 0))
	if selector == 0:
		var header := Label.new()
		header.text = str(entry.get("text", ""))
		var is_heading := int(entry.get("attr", 0)) != 0
		header.add_theme_font_override("font", UiTheme.heading_font() if is_heading else UiTheme.body_font())
		header.add_theme_font_size_override("font_size", 17 if is_heading else 18)
		header.add_theme_color_override("font_color", UiTheme.GOLD if is_heading else UiTheme.INK)
		header.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		header.custom_minimum_size = Vector2(620, 0)
		if is_heading:
			var spacer := Control.new()
			spacer.custom_minimum_size = Vector2(0, 4)
			_list.add_child(spacer)
		_list.add_child(header)
		return
	var row := ItemRow.new()
	row.setup_menu_entry(entry)
	row.custom_minimum_size = Vector2(0, 50 if transfer else 44)
	if transfer:
		var stack := RegEx.create_from_string("^(\\d+) ").search(str(entry.get("text", "")))
		if stack:
			row.set_stack(int(stack.get_string(1)))
	if how == PICK_ANY:
		row.set_checkable(true)
	if how == PICK_NONE:
		row.disabled = true
	row.pressed.connect(_on_row_pressed.bind(row))
	_list.add_child(row)
	rows.append(row)


func _on_row_pressed(row: ItemRow) -> void:
	var selector := char(int(row.item.get("selector", 0)))
	if how == PICK_ONE:
		screen.send_keys(_pending_count + selector)
		close()
	elif how == PICK_ANY:
		_toggle(row, not row.selected)


func _toggle(row: ItemRow, on: bool) -> void:
	var selector := char(int(row.item.get("selector", 0)))
	row.selected = on
	if on:
		var count := int(_pending_count) if _pending_count != "" else -1
		picks[selector] = count
		row.set_count(count if count > 0 else 0)
	else:
		picks.erase(selector)
		row.set_count(0)
	_pending_count = ""
	_update_summary()


func _update_summary() -> void:
	if not _summary:
		return
	if paying:
		var chosen := 0
		var bill := 0
		for row in rows:
			var cost := ItemText.price(row.item)
			bill += cost
			if picks.has(char(int(row.item.get("selector", 0)))):
				chosen += cost
		var gold := screen.state.status.number(StatusModel.Field.GOLD)
		_summary.text = "Paying %d of %d zm  ·  you have %d zm" % [chosen, bill, gold]
		_summary.add_theme_color_override("font_color", UiTheme.BAD if chosen > gold else UiTheme.INK_DIM)
		return
	_summary.text = "%d selected" % picks.size() if not picks.is_empty() else "Nothing selected"


## from_button: the footer button never picks NetHack's "Auto-select every
## relevant item" row; the classic , key selects every row like tty.
func _select_all(from_button := false) -> void:
	for row in rows:
		if row.visible and not (from_button and str(row.item.get("text", "")).begins_with("Auto-select")):
			_toggle(row, true)


func _is_type_menu(lower_prompt: String) -> bool:
	return lower_prompt.contains("what type") or lower_prompt.contains("what kinds")


func _clear() -> void:
	for row in rows:
		_toggle(row, false)


func _confirm() -> void:
	var keys := ""
	for row in rows:
		var selector := char(int(row.item.get("selector", 0)))
		if picks.has(selector):
			var count: int = picks[selector]
			var chosen := row.chosen_quantity()
			if chosen > 0:
				count = chosen
			keys += (str(count) if count > 0 else "") + selector
	screen.send_keys(keys + "\n")
	close()


func _cancel() -> void:
	screen.send_keycode(27)
	close()


func _filter(text: String) -> void:
	var needle := text.strip_edges().to_lower()
	for row in rows:
		row.visible = needle == "" or ItemText.display_name(row.item).to_lower().contains(needle)


## The player moved the highlight with the arrows in this menu.
var _arrowed := false


func handle_key(event: InputEventKey) -> bool:
	if search and search.has_focus():
		if event.keycode == KEY_ESCAPE:
			search.release_focus()
			return true
		if event.keycode == KEY_ENTER and how == PICK_ANY:
			_confirm()
			return true
		return false
	if InputRouter.is_navigation(event):
		_arrowed = true
		return false  # the arrows move the highlight between rows
	# Enter on a highlighted row picks it (PICK_ONE). In a multi-pick menu
	# Enter always confirms, as in tty; Space toggles the row the player
	# arrowed onto (before any arrow, Space confirms as in tty).
	var focused := get_viewport().gui_get_focus_owner()
	var on_row := focused is ItemRow and rows.has(focused)
	if on_row and ((how == PICK_ONE and event.keycode in [KEY_ENTER, KEY_KP_ENTER]) or (how == PICK_ANY and _arrowed and event.keycode == KEY_SPACE)):
		_on_row_pressed(focused as ItemRow)
		return true
	# A focused footer button (Cancel, Clear, Select all...) presses itself.
	if focused is Button and footer.is_ancestor_of(focused) and event.keycode in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE]:
		return false
	var text := InputRouter.key_to_nethack(event)
	if text == "":
		return false
	if text == char(27):
		_cancel()
		return true
	if how == PICK_NONE:
		_cancel()
		return true
	if text == "\n" or (text == " " and how == PICK_ANY):
		if how == PICK_ANY:
			_confirm()
		else:
			_cancel()
		return true
	if text.is_valid_int():
		_pending_count += text
		return true
	if text == "/" and search:
		search.grab_focus()
		return true
	# NetHack's menu shortcuts, unless a row uses that key as its letter.
	if how == PICK_ANY and not _has_selector(text):
		if text in [",", "@", "."]:
			_select_all()
			return true
		if text in ["-", "\\"]:
			_clear()
			return true
	for row in rows:
		if char(int(row.item.get("selector", 0))) == text:
			_on_row_pressed(row)
			return true
	return true


## Spells and skills get rich rows from the bridge's typed data.
func _build_magic(magic: Dictionary, items: Array) -> void:
	var by_selector := {}
	for entry in items:
		var selector := int(entry.get("selector", 0))
		if selector > 0:
			by_selector[char(selector)] = entry
	card_width = 760.0
	if magic.kind == "spell":
		var prompt := str(request.get("prompt", "")).to_lower()
		var hint := "The spells you know."
		if prompt.contains("cast"):
			hint = "Choose a spell to cast."
		elif how != PICK_NONE:
			hint = "Pick a spell, then the letter to swap it with."
		set_title("Spellbook", hint)
	else:
		set_title("Skills", "Gold skills can be advanced now." if how != PICK_NONE else "Your training in weapons and magic.")
	# NetHack groups skills under headings (Fighting, Weapon, Spellcasting).
	var groups := {}
	var group := ""
	for entry in items:
		var text := str(entry.get("text", ""))
		if int(entry.get("selector", 0)) == 0 and int(entry.get("attr", 0)) != 0 and not text.begins_with(" "):
			group = text.strip_edges()
		elif group != "":
			var name := text.strip_edges()
			var bracket := name.find("[")
			groups[(name.substr(0, bracket) if bracket > 0 else name).strip_edges().to_lower()] = group
	var shown_group := ""
	var headers := 0
	for row_data in magic.rows:
		var row_group: String = groups.get(str(row_data.get("name", "")).strip_edges().to_lower(), "")
		if magic.kind != "spell" and row_group != "" and row_group != shown_group:
			shown_group = row_group
			headers += 1
			var heading := Label.new()
			heading.text = row_group.to_upper()
			heading.add_theme_font_override("font", UiTheme.heading_font())
			heading.add_theme_font_size_override("font_size", 15)
			heading.add_theme_color_override("font_color", UiTheme.GOLD)
			_list.add_child(heading)
		var selector := str(row_data.get("selector", ""))
		var entry: Dictionary = by_selector.get(selector, {"selector": selector.unicode_at(0) if selector != "" else 0, "text": str(row_data.get("name", ""))})
		var row := ItemRow.new()
		row.setup_menu_entry(entry)
		row.custom_minimum_size = Vector2(0, 56)
		if how == PICK_NONE or selector == "":
			row.disabled = true
		var detail := HBoxContainer.new()
		detail.add_theme_constant_override("separation", 12)
		detail.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
		detail.offset_left = -360
		detail.offset_right = -14
		detail.offset_top = -14
		detail.offset_bottom = 14
		detail.alignment = BoxContainer.ALIGNMENT_END
		detail.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(detail)
		if magic.kind == "spell":
			row.setup_plain(selector, ItemText.sentence(str(row_data.get("name", ""))))
			_magic_label(detail, "Level %d" % int(row_data.get("level", 0)), UiTheme.INK_DIM)
			_magic_label(detail, "%d Pw" % int(row_data.get("pwCost", 0)), UiTheme.ENERGY.lightened(0.3))
			var fail := int(row_data.get("failure", 0))
			_magic_label(detail, "%d%% fail" % fail, UiTheme.GOOD if fail < 25 else (UiTheme.WARN if fail < 60 else UiTheme.BAD))
			_magic_label(detail, "memory " + str(row_data.get("status", "")), UiTheme.INK_FAINT)
		else:
			row.setup_plain(selector, ItemText.sentence(str(row_data.get("name", ""))))
			var can := bool(row_data.get("canAdvance", false))
			_magic_label(detail, str(row_data.get("currentRank", "")), UiTheme.INK)
			if can:
				_magic_label(detail, "→ %s" % str(row_data.get("nextRank", "")), UiTheme.GOLD)
				row.add_theme_color_override("font_color", UiTheme.GOLD)
		row.pressed.connect(_on_row_pressed.bind(row))
		_list.add_child(row)
		rows.append(row)
	# Size the list from the real row height (56 px rows, 32 px headings).
	var scroll := _list.get_parent() as ScrollContainer
	if scroll:
		scroll.custom_minimum_size.y = clampf(rows.size() * 58 + headers * 32 + 10, 80, 620)


func _magic_label(box: HBoxContainer, text: String, color: Color) -> void:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_color", color)
	box.add_child(label)


func _has_selector(text: String) -> bool:
	for row in rows:
		if char(int(row.item.get("selector", 0))) == text:
			return true
	return false
