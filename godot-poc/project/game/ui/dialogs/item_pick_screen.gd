class_name ItemPickScreen
extends ModalCard
## NetHack's menus of items from the pack ("What do you want to eat?" after
## ? or *, / "something you're carrying", "What would you like to identify
## first?", A "What do you want to take off?") as the inventory's own item
## grid: art, letter, B/U/C, enchantment and where it's worn, grouped under
## NetHack's class headings, with the full name of the item under the
## pointer. Pick-one menus answer on a click or the letter; pick-any menus
## toggle and confirm. Esc cancels.

const PICK_ONE := 1
const PICK_ANY := 2

var screen: GameScreen
var request: Dictionary
var how := PICK_ONE
var slots: Array[InventorySlot] = []
var picks := {}  # selector -> count (-1 = all)
var _pending_count := ""
var _detail: Label
var _summary: Label
var _answered := false


## True for a pick-one or pick-any menu whose every choice is an item in the
## pack, other than the screens that have their own (dropping, paying,
## containers, the ground).
static func routes(p_request: Dictionary, state: GameState) -> bool:
	var p_how := int(p_request.get("how", 0))
	if p_how != PICK_ONE and p_how != PICK_ANY:
		return false
	var purpose := str(p_request.get("purpose", ""))
	if purpose.begins_with("container.") or purpose.begins_with("ground.") or purpose in ["item.drop", "item.pay"]:
		return false
	var prompt := str(p_request.get("prompt", "")).to_lower()
	for word in ["drop", "pay for", "put in", "take out", "pick up", "what type", "what kinds"]:
		if prompt.contains(word):
			return false
	var choices := 0
	for row in p_request.get("items", []):
		if int(row.get("selector", 0)) == 0 or int(row.get("selector", 0)) == 45:
			continue  # (headings; "-", bare hands or nothing, is a button)
		if pack_item(row, state).is_empty():
			return false
		choices += 1
	return choices > 0


## The pack item a menu row stands for: by objectId, or (getobj's ? / *
## list carries none) by its letter and NetHack's own words for it.
static func pack_item(row: Dictionary, state: GameState) -> Dictionary:
	var id := int(row.get("objectId", 0))
	var selector := int(row.get("selector", 0))
	var words := "%s - %s" % [char(selector), str(row.get("text", "")).strip_edges()]
	for item in state.inventory:
		if id != 0 and int(item.get("objectId", 0)) == id:
			return item
		if id == 0 and int(item.get("selector", 0)) == selector and str(item.get("text", "")).strip_edges() == words:
			return item
	return {}


func setup(game_screen: GameScreen, p_request: Dictionary) -> void:
	screen = game_screen
	request = p_request
	how = int(request.get("how", PICK_ONE))
	card_width = 980.0
	var title := str(request.get("prompt", "")).strip_edges()
	if title == "":
		# NetHack titles the ? / * item list with nothing: the question it came
		# from (or the choice before it) says what it's for.
		var asked := screen.state.last_question().get_slice("[", 0).strip_edges()
		if asked.to_lower().begins_with("what do you want to"):
			title = asked
		elif screen.state.next_menu_title != "":
			title = screen.state.next_menu_title
		else:
			title = "Choose an item"
	screen.state.next_menu_title = ""
	set_title(title, "Click an item or press its letter." if how == PICK_ONE else "Pick the items, then confirm.")
	_build()
	if how == PICK_ANY:
		_summary = Label.new()
		_summary.theme_type_variation = "CaptionLabel"
		_summary.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		footer.add_child(_summary)
		footer.move_child(_summary, 0)
		add_footer_button("Clear", _clear)
		add_footer_button("Cancel  Esc", _cancel)
		add_footer_button("Confirm  Enter", _confirm, true)
		_update_summary()
	else:
		add_footer_button("Cancel  Esc", _cancel)
	if not slots.is_empty():
		set_meta("safe_focus", slots[0])


func _build() -> void:
	# NetHack's class headings ("Weapons", "Comestibles") with their items,
	# the groups flowing side by side.
	var groups: Array = []  # [{heading, rows}]
	for row in request.get("items", []):
		var selector := int(row.get("selector", 0))
		if selector == 0:
			var text := str(row.get("text", "")).strip_edges()
			if text != "":
				groups.append({"heading": text, "rows": []})
			continue
		if selector == 45:
			# "- (bare hands)", "- (nothing)": a button of its own.
			var words := str(row.get("text", "")).strip_edges()
			add_footer_button("%s  -" % (words.substr(0, 1).to_upper() + words.substr(1)), func() -> void:
				if not _answered:
					_answered = true
					screen.send_keys("-")
					close())
			continue
		if groups.is_empty():
			groups.append({"heading": "", "rows": []})
		(groups[-1].rows as Array).append(row)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	var flow := HFlowContainer.new()
	flow.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	flow.add_theme_constant_override("h_separation", 22)
	flow.add_theme_constant_override("v_separation", 10)
	scroll.add_child(flow)
	for group in groups:
		if (group.rows as Array).is_empty():
			continue
		var column := VBoxContainer.new()
		column.add_theme_constant_override("separation", 4)
		flow.add_child(column)
		if str(group.heading) != "":
			var heading := Label.new()
			heading.text = str(group.heading)
			heading.add_theme_font_override("font", UiTheme.heading_font())
			heading.add_theme_font_size_override("font_size", 16)
			heading.add_theme_color_override("font_color", UiTheme.GOLD)
			column.add_child(heading)
		var grid := GridContainer.new()
		grid.columns = mini((group.rows as Array).size(), 9)
		grid.add_theme_constant_override("h_separation", 8)
		grid.add_theme_constant_override("v_separation", 8)
		column.add_child(grid)
		for row in group.rows:
			var item: Dictionary = pack_item(row, screen.state).duplicate()
			item["selector"] = int(row.get("selector", 0))
			var slot := InventorySlot.new()
			slot.name = "Pick_%s" % char(int(item.selector))
			slot.setup(item, screen.state)
			slot.pressed.connect(_on_slot.bind(slot))
			slot.mouse_entered.connect(_describe.bind(item))
			slot.focus_entered.connect(_describe.bind(item))
			grid.add_child(slot)
			slots.append(slot)
			# Preselected entries (MENU_ITEMFLAGS_SELECTED).
			if how == PICK_ANY and int(row.get("itemflags", 0)) & 0x1:
				_toggle(slot, true)
	# Tall enough for what's there (the flow wraps at the card's width).
	var width := 0.0
	var lines := 1
	for group in groups:
		var w := (InventorySlot.SIZE + 8.0) * mini((group.rows as Array).size(), 9) + 22.0
		if (group.rows as Array).is_empty():
			continue
		if width + w > card_width - 40.0 and width > 0.0:
			lines += 1
			width = 0.0
		width += w
		lines += ((group.rows as Array).size() - 1) / 9
	scroll.custom_minimum_size = Vector2(0, clampf(lines * (InventorySlot.SIZE + 40.0), 140.0, 560.0))
	_detail = Label.new()
	_detail.text = " "
	_detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail.add_theme_font_size_override("font_size", 17)
	_detail.add_theme_color_override("font_color", UiTheme.INK)
	body.add_child(_detail)


func _describe(item: Dictionary) -> void:
	_detail.text = "%s  ·  %s" % [char(int(item.get("selector", 0))), ItemText.display_name(item)]


func _on_slot(slot: InventorySlot) -> void:
	if _answered:
		return
	if how == PICK_ONE:
		_answered = true
		screen.send_keys(_pending_count + char(int(slot.item.get("selector", 0))))
		close()
	else:
		_toggle(slot, not slot.is_selected)


func _toggle(slot: InventorySlot, on: bool) -> void:
	var selector := char(int(slot.item.get("selector", 0)))
	slot.is_selected = on
	if on:
		picks[selector] = int(_pending_count) if _pending_count != "" else -1
	else:
		picks.erase(selector)
	_pending_count = ""
	_update_summary()


func _update_summary() -> void:
	if _summary:
		_summary.text = "%d picked" % picks.size() if not picks.is_empty() else "Nothing picked"


func _clear() -> void:
	for slot in slots:
		_toggle(slot, false)


func _confirm() -> void:
	if _answered:
		return
	_answered = true
	var keys := ""
	for slot in slots:
		var selector := char(int(slot.item.get("selector", 0)))
		if picks.has(selector):
			var count: int = picks[selector]
			keys += (str(count) if count > 0 else "") + selector
	screen.send_keys(keys + "\n")
	close()


func _cancel() -> void:
	if not _answered:
		_answered = true
		screen.send_keycode(27)
	close()


func handle_key(event: InputEventKey) -> bool:
	if not event.pressed:
		return true
	if event.keycode == KEY_ESCAPE:
		_cancel()
		return true
	if event.keycode in [KEY_ENTER, KEY_KP_ENTER] and how == PICK_ANY:
		_confirm()
		return true
	# Space and arrows belong to the focused slot.
	if event.keycode in [KEY_SPACE, KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN, KEY_TAB, KEY_ENTER, KEY_KP_ENTER]:
		return false
	var typed := InputRouter.key_to_nethack(event)
	if typed == "":
		return true
	if typed.is_valid_int():
		_pending_count += typed
		return true
	for slot in slots:
		if char(int(slot.item.get("selector", 0))) == typed:
			_on_slot(slot)
			return true
	# NetHack's menu shortcuts in pick-any menus: , all, - none.
	if how == PICK_ANY and typed == ",":
		for slot in slots:
			_toggle(slot, true)
	elif how == PICK_ANY and typed == "-":
		_clear()
	return true
