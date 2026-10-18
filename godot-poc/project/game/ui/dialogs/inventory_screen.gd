class_name InventoryScreen
extends Control
## The pack, as a modern RPG inventory: categories, an item grid and a
## detail panel with everything the hero knows and every action. Classic
## letters select items; double-click or Enter uses the selected item.

signal closed

const CATEGORIES := [
	["all", "All"], ["equipped", "Equipped"], ["weapons", "Weapons"], ["armor", "Armor"],
	["consumables", "Food, potions & scrolls"], ["magic", "Magic"], ["tools", "Tools"], ["gems", "Gems & stones"], ["other", "Other"],
]

var screen: GameScreen
var category := "all"
var selected: Dictionary = {}
var _grid: GridContainer
var _tabs: VBoxContainer
var _detail: VBoxContainer
var _slots: Array[InventorySlot] = []
var _count_spin: SpinBox
var _card: PanelContainer
var _search: LineEdit
var _popup: PanelContainer


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.theme()
	var dim := ColorRect.new()
	dim.color = Color(0.0, 0.0, 0.02, 0.62)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	_card = PanelContainer.new()
	_card.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0.045, 0.048, 0.064, 0.98), Color(UiTheme.GOLD, 0.4), 14, 1, 40))
	var view := screen.get_viewport().get_visible_rect().size
	_card.custom_minimum_size = Vector2(minf(1480.0, view.x - 48.0), minf(800.0, view.y - 120.0))
	center.add_child(_card)
	var outer := VBoxContainer.new()
	outer.add_theme_constant_override("separation", 12)
	_card.add_child(outer)
	outer.add_child(_build_header())
	var row := HBoxContainer.new()
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 18)
	outer.add_child(row)
	_tabs = VBoxContainer.new()
	_tabs.custom_minimum_size = Vector2(250, 0)
	_tabs.add_theme_constant_override("separation", 4)
	row.add_child(_tabs)
	var middle := VBoxContainer.new()
	middle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	middle.add_theme_constant_override("separation", 10)
	row.add_child(middle)
	_search = LineEdit.new()
	_search.placeholder_text = "Search your pack…   ( / )"
	_search.custom_minimum_size = Vector2(0, 42)
	_search.text_changed.connect(func(_t: String) -> void: _rebuild())
	middle.add_child(_search)
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	middle.add_child(scroll)
	_grid = GridContainer.new()
	_grid.columns = 7
	_grid.add_theme_constant_override("h_separation", 8)
	_grid.add_theme_constant_override("v_separation", 8)
	scroll.add_child(_grid)
	var legend := Label.new()
	legend.text = "Band: where it is on you   ·   B / U / C: blessed, uncursed, cursed   ·   +2 / −1: enchantment   ·   Drag onto another to swap letters   ·   Right-click for every action"
	legend.theme_type_variation = "CaptionLabel"
	middle.add_child(legend)
	var detail_panel := PanelContainer.new()
	detail_panel.custom_minimum_size = Vector2(420, 0)
	detail_panel.add_theme_stylebox_override("panel", UiTheme.panel_style(Color("0c0d13"), Color(1, 1, 1, 0.06), 10, 1, 0))
	row.add_child(detail_panel)
	_detail = VBoxContainer.new()
	_detail.add_theme_constant_override("separation", 8)
	detail_panel.add_child(_detail)
	screen.state.inventory_changed.connect(_rebuild)
	_rebuild()


func _build_header() -> Control:
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 18)
	var title := Label.new()
	title.text = "Inventory"
	title.theme_type_variation = "HeaderLabel"
	title.add_theme_font_size_override("font_size", 32)
	header.add_child(title)
	var facts := Label.new()
	facts.name = "Facts"
	facts.theme_type_variation = "CaptionLabel"
	facts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	facts.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	header.add_child(facts)
	# In a shop with unpaid things: NetHack's bill (Iu), as the ledger.
	var bill := Button.new()
	bill.name = "BillButton"
	bill.focus_mode = Control.FOCUS_ALL
	bill.visible = false
	bill.pressed.connect(func() -> void:
		close()
		screen.send_keys("Iu"))
	header.add_child(bill)
	var hint := Label.new()
	hint.text = "Click to inspect  ·  Double-click or Enter to use  ·  Letters select"
	hint.theme_type_variation = "CaptionLabel"
	hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	header.add_child(hint)
	var close_button := Button.new()
	close_button.text = "Close  Esc"
	close_button.focus_mode = Control.FOCUS_ALL
	close_button.pressed.connect(close)
	header.add_child(close_button)
	return header


func _ready() -> void:
	modulate.a = 0.0
	_card.pivot_offset = _card.size / 2.0
	_card.scale = Vector2(0.97, 0.97)
	var tween := create_tween().set_parallel()
	tween.tween_property(self, "modulate:a", 1.0, 0.15)
	tween.tween_property(_card, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _items_in(cat: String) -> Array:
	var result := []
	var needle := _search.text.strip_edges().to_lower() if _search else ""
	for item in screen.state.inventory:
		if _matches(item, cat) and (needle == "" or ItemText.display_name(item).to_lower().contains(needle)):
			result.append(item)
	if cat == "equipped":
		# Head to toe, as on the hero.
		result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(ItemText.equip_place(a).order) < int(ItemText.equip_place(b).order))
	return result


func _matches(item: Dictionary, cat: String) -> bool:
	var cls := str(item.get("publicClass", "other"))
	match cat:
		"all":
			return true
		"equipped":
			return not ItemText.equip_place(item).is_empty()
		"weapons":
			return cls == "weapon"
		"armor":
			return cls == "armor"
		"consumables":
			return cls in ["food", "potion", "scroll"]
		"magic":
			return cls in ["wand", "ring", "amulet", "spellbook"]
		"tools":
			return cls == "tool"
		"gems":
			return cls == "gem"
		"other":
			return cls in ["coin", "other", ""] or cls not in ["weapon", "armor", "food", "potion", "scroll", "wand", "ring", "amulet", "spellbook", "tool", "gem"]
	return true


func _rebuild() -> void:
	var facts: Label = find_child("Facts", true, false)
	var count := screen.state.inventory.size()
	var burden := screen.state.status.encumbrance()
	facts.text = "%d items   ·   ◆ %s gold%s" % [count, screen.state.status.text(StatusModel.Field.GOLD), ("   ·   " + burden) if burden != "" else ""]
	var unpaid := 0
	var owed := 0
	for item in screen.state.inventory:
		var ownership: Variant = item.get("ownership", {})
		if ownership is Dictionary and str(ownership.get("state", "")) == "unpaid":
			unpaid += 1
			owed += ItemText.price(item)
	var bill: Button = find_child("BillButton", true, false)
	bill.visible = unpaid > 0
	bill.text = ("Your bill  ·  %d zm" % owed) if owed > 0 else "Your bill"
	for child in _tabs.get_children():
		child.queue_free()
	for cat in CATEGORIES:
		var n := _items_in(cat[0]).size()
		if n == 0 and cat[0] not in ["all"]:
			continue
		var tab := Button.new()
		tab.focus_mode = Control.FOCUS_ALL
		tab.alignment = HORIZONTAL_ALIGNMENT_LEFT
		tab.custom_minimum_size = Vector2(0, 42)
		tab.text = "%s   %d" % [cat[1], n]
		if cat[0] == category:
			tab.add_theme_stylebox_override("normal", UiTheme.button_style(Color("2a2414"), Color(UiTheme.GOLD, 0.7)))
			tab.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.2))
		tab.pressed.connect(func() -> void:
			category = cat[0]
			_rebuild())
		_tabs.add_child(tab)
	_build_loadout()
	for child in _grid.get_children():
		child.queue_free()
	_slots.clear()
	var items := _items_in(category)
	for item in items:
		var slot := InventorySlot.new()
		slot.setup(item, screen.state)
		# Drag one item onto another: NetHack's #adjust moves (or swaps) the
		# letter. Gold keeps its $.
		slot.reorderable = str(item.get("publicClass", "")) != "coin"
		slot.reorder_requested.connect(_adjust)
		slot.pressed.connect(_select.bind(item))
		slot.activated.connect(func(_s: InventorySlot) -> void: _use_primary())
		slot.gui_input.connect(func(event: InputEvent) -> void:
			if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
				_select(item)
				_open_popup(item, event.global_position))
		slot.mouse_entered.connect(func() -> void:
			if selected.is_empty():
				_show_detail(item))
		_grid.add_child(slot)
		_slots.append(slot)
	if items.is_empty():
		var empty := Label.new()
		empty.text = "Nothing here."
		empty.theme_type_variation = "CaptionLabel"
		_grid.add_child(empty)
	# Keep the selection across inventory updates when the item still exists.
	var keep := {}
	if not selected.is_empty():
		# Only among what the tab and search show: never a hidden item.
		for item in items:
			if int(item.get("objectId", -1)) == int(selected.get("objectId", -2)):
				keep = item
	if keep.is_empty() and not items.is_empty():
		keep = items[0]
	if keep.is_empty():
		selected = {}
		_show_detail({})
	else:
		_select(keep)


## "On you": everything worn, wielded or in use, head to toe, each naming
## its place; a click shows it.
func _build_loadout() -> void:
	var on_you: Array = screen.state.inventory.filter(func(i: Dictionary) -> bool: return not ItemText.equip_place(i).is_empty())
	if on_you.is_empty():
		return
	on_you.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(ItemText.equip_place(a).order) < int(ItemText.equip_place(b).order))
	var heading := Label.new()
	heading.text = "ON YOU"
	heading.add_theme_font_override("font", UiTheme.heading_font())
	heading.add_theme_font_size_override("font_size", 14)
	heading.add_theme_color_override("font_color", UiTheme.GOLD_DIM.lightened(0.25))
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 10)
	_tabs.add_child(gap)
	_tabs.add_child(heading)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_tabs.add_child(scroll)
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 0)
	scroll.add_child(list)
	for item in on_you:
		var place := ItemText.equip_place(item)
		var row := Button.new()
		row.flat = true
		row.focus_mode = Control.FOCUS_ALL
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.icon = ItemText.icon(item, screen.state)
		row.expand_icon = false
		row.add_theme_constant_override("icon_max_width", 24)
		row.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		row.clip_text = true
		row.custom_minimum_size = Vector2(0, 26)
		row.add_theme_font_size_override("font_size", 13)
		row.add_theme_constant_override("h_separation", 6)
		# "Body · chain mail"; just the place when the name says it already.
		var base := _base_name(item)
		row.text = str(place.tag) if base.to_lower() == str(place.tag).to_lower() else "%s · %s" % [place.tag, base]
		row.set_meta("place", place.tag)
		# Slim rows: the theme's button padding would push the last ones
		# out of sight.
		for state_name in ["normal", "pressed", "focus"]:
			var slim := StyleBoxEmpty.new()
			slim.set_content_margin_all(2)
			slim.content_margin_left = 4
			row.add_theme_stylebox_override(state_name, slim)
		var hover := UiTheme.button_style(Color("1c1d27"), Color(1, 1, 1, 0.06), 4)
		hover.set_content_margin_all(2)
		hover.content_margin_left = 4
		row.add_theme_stylebox_override("hover", hover)
		row.tooltip_text = "%s\n%s" % [ItemText.display_name(item), place.where]
		row.add_theme_color_override("font_color", UiTheme.INK)
		row.pressed.connect(_select.bind(item))
		list.add_child(row)


## The item's name without blessed/cursed and enchantment, for tight rows.
static func _base_name(item: Dictionary) -> String:
	var name := ItemText.short_name(item)
	for word in ["uncursed ", "blessed ", "cursed "]:
		name = name.trim_prefix(word)
	return RegEx.create_from_string("^[+-]\\d+ ").sub(name, "")


func _select(item: Dictionary) -> void:
	selected = item
	for slot in _slots:
		slot.is_selected = int(slot.item.get("objectId", -1)) == int(item.get("objectId", -2))
	_show_detail(item)


func _show_detail(item: Dictionary) -> void:
	for child in _detail.get_children():
		child.queue_free()
	if item.is_empty():
		var empty := Label.new()
		empty.text = "Your pack is empty." if screen.state.inventory.is_empty() else "Select an item."
		empty.theme_type_variation = "CaptionLabel"
		_detail.add_child(empty)
		return
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 14)
	_detail.add_child(top)
	var frame := PanelContainer.new()
	var frame_style := UiTheme.panel_style(Color("08090d"), Color(UiTheme.GOLD, 0.35), 10, 1, 0)
	frame_style.set_content_margin_all(6)
	frame.add_theme_stylebox_override("panel", frame_style)
	top.add_child(frame)
	var icon := TextureRect.new()
	icon.texture = ItemText.icon(item, screen.state)
	icon.custom_minimum_size = Vector2(96, 96)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	frame.add_child(icon)
	var names := VBoxContainer.new()
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(names)
	var name := Label.new()
	name.text = ItemText.sentence(ItemText.short_name(item))
	name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name.add_theme_font_override("font", UiTheme.heading_font())
	name.add_theme_font_size_override("font_size", 22)
	name.add_theme_color_override("font_color", ItemText.name_color(item) if ItemText.beatitude(item) != "" else UiTheme.GOLD)
	names.add_child(name)
	var kind := Label.new()
	kind.text = "%s   ·   letter %s" % [ItemText.sentence(str(item.get("publicClass", "item"))), char(int(item.get("selector", 0)))]
	kind.theme_type_variation = "CaptionLabel"
	names.add_child(kind)
	# Where it is, in plain words ("Worn as body armor"), else NetHack's own
	# note for it.
	var place := ItemText.equip_place(item)
	var note: String = str(place.where) if not place.is_empty() else ItemText.state_note(item)
	if note != "":
		var state_label := Label.new()
		state_label.text = ItemText.sentence(note)
		state_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		state_label.add_theme_color_override("font_color", UiTheme.GOLD)
		names.add_child(state_label)
	var full := Label.new()
	full.text = ItemText.display_name(item)
	full.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	full.add_theme_color_override("font_color", UiTheme.INK_DIM)
	_detail.add_child(full)
	_detail.add_child(_facts_box(item))
	var rival := _equipped_rival(item)
	if not rival.is_empty():
		# Compare with what fills the same place now.
		var compare := Label.new()
		compare.text = "In use now: %s" % ItemText.display_name(rival)
		compare.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		compare.theme_type_variation = "CaptionLabel"
		_detail.add_child(compare)
		_detail.add_child(_facts_box(rival))
	var sep := HSeparator.new()
	_detail.add_child(sep)
	var actions_label := Label.new()
	actions_label.text = "ACTIONS"
	actions_label.add_theme_font_override("font", UiTheme.heading_font())
	actions_label.add_theme_font_size_override("font_size", 14)
	actions_label.add_theme_color_override("font_color", UiTheme.GOLD_DIM.lightened(0.2))
	_detail.add_child(actions_label)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_detail.add_child(scroll)
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 4)
	scroll.add_child(list)
	var actions := ItemActions.for_item(item, screen.state)
	_count_spin = null
	for i in actions.size():
		var action: Dictionary = actions[i]
		var line := HBoxContainer.new()
		line.add_theme_constant_override("separation", 6)
		list.add_child(line)
		var button := Button.new()
		button.focus_mode = Control.FOCUS_ALL
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.custom_minimum_size = Vector2(0, 40)
		button.text = action.label
		if i == 0:
			button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("2a2414"), Color(UiTheme.GOLD, 0.8)))
			button.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.25))
		match str(action.get("danger", "")):
			"caution":
				button.add_theme_color_override("font_color", UiTheme.WARN)
			"serious":
				button.add_theme_color_override("font_color", UiTheme.BAD)
		button.pressed.connect(_run.bind(action))
		line.add_child(button)
		if action.get("needs_count", false):
			_count_spin = SpinBox.new()
			_count_spin.min_value = 1
			_count_spin.max_value = int(action.get("quantity", 1))
			_count_spin.value = int(action.get("quantity", 1))
			_count_spin.custom_minimum_size = Vector2(110, 40)
			_count_spin.tooltip_text = "How many to drop"
			line.add_child(_count_spin)
		var keys := Label.new()
		keys.text = _key_hint(str(action.keys))
		keys.custom_minimum_size = Vector2(70, 0)
		keys.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		keys.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		keys.add_theme_color_override("font_color", UiTheme.INK_FAINT)
		keys.visible = Motion.key_hints()
		line.add_child(keys)


func _facts_box(item: Dictionary) -> Control:
	var box := HFlowContainer.new()
	box.add_theme_constant_override("h_separation", 6)
	box.add_theme_constant_override("v_separation", 6)
	var known: Dictionary = item.get("knownFields", {}) if item.get("knownFields") is Dictionary else {}
	var chips: Array = []
	var beatitude := ItemText.beatitude(item)
	if beatitude != "":
		chips.append([ItemText.sentence(beatitude), ItemText.BLESSED if beatitude == "blessed" else (ItemText.CURSED if beatitude == "cursed" else UiTheme.INK_DIM)])
	else:
		chips.append(["Blessed/cursed unknown", UiTheme.INK_FAINT])
	if known.has("enchantment"):
		var e := int(known.enchantment)
		chips.append(["%s%d enchantment" % ["+" if e >= 0 else "", e], UiTheme.GOOD if e > 0 else (UiTheme.BAD if e < 0 else UiTheme.INK_DIM)])
	if known.has("charges"):
		chips.append(["Charges: %s" % str(known.charges), UiTheme.ENERGY.lightened(0.3)])
	for key in ["erosion", "corrosion"]:
		if known.has(key) and str(known[key]) != "" and str(known[key]) != "0":
			chips.append([ItemText.sentence(str(known[key])), UiTheme.WARN])
	if known.has("poisoned") and known.poisoned:
		chips.append(["Poisoned", UiTheme.GOOD])
	var ownership: Dictionary = item.get("ownership", {}) if item.get("ownership") is Dictionary else {}
	if str(ownership.get("state", "")) in ["unpaid", "forSale"]:
		var cost := ItemText.price(item)
		chips.append(["Unpaid — %d zorkmids to the shop" % cost if cost > 0 else "Unpaid — shop property", UiTheme.WARN])
	if int(item.get("quantity", 1)) > 1:
		chips.append(["Stack of %d" % int(item.quantity), UiTheme.INK])
	for chip in chips:
		var label := Label.new()
		label.text = chip[0]
		label.add_theme_font_size_override("font_size", 15)
		label.add_theme_color_override("font_color", chip[1])
		var style := UiTheme.button_style(Color(chip[1], 0.10), Color(chip[1], 0.35), 10)
		style.content_margin_top = 2
		style.content_margin_bottom = 2
		label.add_theme_stylebox_override("normal", style)
		box.add_child(label)
	return box


## The classic command key a veteran would press ("e" for "ea"), or nothing
## for extended commands and other multi-key sequences.
## The worn or wielded item this one would replace (same armor slot, or the
## wielded weapon for a weapon); {} if none or if the item is itself in use.
func _equipped_rival(item: Dictionary) -> Dictionary:
	if ItemText.is_worn(item):
		return {}
	var cls := str(item.get("publicClass", ""))
	var slot := ArmorSlots.slot_for(item) if cls == "armor" else ""
	for other in screen.state.inventory:
		if other == item or not ItemText.is_worn(other):
			continue
		if cls == "weapon" and int(other.get("wornMask", 0)) & 0x100:
			return other
		if slot != "" and ArmorSlots.slot_for(other) == slot and str(other.get("publicClass", "")) == "armor":
			return other
	return {}


func _key_hint(keys: String) -> String:
	if keys == "" or keys.begins_with("#") or keys.unicode_at(0) < 32:
		return ""
	return keys.substr(0, 1)


func _use_primary() -> void:
	if selected.is_empty():
		return
	var action := ItemActions.primary(selected, screen.state)
	if not action.is_empty():
		_run(action)


func _run(action: Dictionary) -> void:
	if str(action.get("danger", "")) in ["serious", "caution"] and Motion.confirm_dangerous():
		var confirm := ConfirmDialog.new()
		var detail := "This cannot be undone and may hurt you badly." if action.danger == "serious" else "This can go wrong. NetHack will do exactly what you ask."
		confirm.setup("%s?" % action.label, detail, "Do it", func() -> void: _execute(action))
		add_child(confirm)
		return
	_execute(action)


## NetHack's #adjust: from_item takes to_item's letter (they swap when it's
## taken), then the inventory opens again.
func _adjust(from_item: Dictionary, to_item: Dictionary) -> void:
	if not screen.state.is_waiting_for_command():
		screen.hud.feed.flash_notice("Finish the current prompt first.")
		return
	var from := char(int(from_item.get("selector", 0)))
	var to := char(int(to_item.get("selector", 0)))
	close()
	screen.input_router.send_sequence("#adjust\n", [{"kind": "item", "keys": from}, {"kind": "yn", "keys": to}],
		screen.input_router.open_when_ready.bind("inventory"))  # (not a lambda: this screen is freed by then)


func _execute(action: Dictionary) -> void:
	var keys := str(action["keys"])
	if action.get("needs_count", false) and _count_spin and int(_count_spin.value) < int(action.get("quantity", 1)):
		keys = keys.substr(0, 1) + str(int(_count_spin.value)) + keys.substr(1)
	if not screen.state.is_waiting_for_command():
		screen.hud.feed.flash_notice("Finish the current prompt first.")
		return
	close()
	var equipment: Dictionary = action.get("equipment", {})
	if not equipment.is_empty() and str(selected.get("publicClass", "")) == "armor":
		# Same as the equipment screen: what's in the way comes off first.
		screen.input_router.run_equipment_steps(EquipmentScreen.armor_steps(screen.state, ArmorSlots.slot_for(selected), int(selected.get("objectId", 0))))
		return
	if action.has("answers"):
		screen.input_router.send_with_answers(keys, action.answers)
		return
	screen.input_router.send_item_command(keys)


func handle_key(event: InputEventKey) -> bool:
	if get_node_or_null("Confirm"):
		return true
	if _search.has_focus():
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_ENTER:
			_search.release_focus()
			return true
		return false
	match event.keycode:
		KEY_ESCAPE:
			if is_instance_valid(_popup):
				_close_popup()
			else:
				close()
			return true
		KEY_SLASH:
			_search.grab_focus()
			return true
		KEY_ENTER, KEY_KP_ENTER:
			# A focused action button gets Enter; otherwise use the item.
			var focused := get_viewport().gui_get_focus_owner()
			var in_actions := focused is Button and (_detail.is_ancestor_of(focused) or (is_instance_valid(_popup) and _popup.is_ancestor_of(focused)))
			if in_actions:
				return false
			_use_primary()
			return true
		KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN:
			_move_selection(event.keycode)
			return true
	var text := InputRouter.key_to_nethack(event)
	if text.length() == 1:
		for item in screen.state.inventory:
			if char(int(item.get("selector", 0))) == text:
				if not _matches(item, category):
					category = "all"
					_rebuild()
				_select(item)
				return true
	# Tab and the like work the focused control.
	return false


## Right-click an item: its actions right where the pointer is.
func _open_popup(item: Dictionary, at: Vector2) -> void:
	_close_popup()
	_popup = PanelContainer.new()
	_popup.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0.05, 0.053, 0.07, 0.98), Color(UiTheme.GOLD, 0.5), 8, 1, 18))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 3)
	_popup.add_child(column)
	var title := Label.new()
	title.text = ItemText.short_name(item)
	title.add_theme_font_override("font", UiTheme.bold_font())
	title.add_theme_color_override("font_color", UiTheme.GOLD)
	column.add_child(title)
	for action in ItemActions.for_item(item, screen.state):
		var button := Button.new()
		button.text = action.label
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.custom_minimum_size = Vector2(230, 36)
		button.focus_mode = Control.FOCUS_ALL
		match str(action.get("danger", "")):
			"caution": button.add_theme_color_override("font_color", UiTheme.WARN)
			"serious": button.add_theme_color_override("font_color", UiTheme.BAD)
		button.pressed.connect(func() -> void:
			_close_popup()
			_run(action))
		column.add_child(button)
	add_child(_popup)
	_popup.reset_size()
	var view := get_viewport_rect().size
	_popup.position = Vector2(minf(at.x + 6, view.x - _popup.size.x - 10), minf(at.y + 6, view.y - _popup.size.y - 10))


func _close_popup() -> void:
	if is_instance_valid(_popup):
		_popup.queue_free()
	_popup = null


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and is_instance_valid(_popup):
		if not _popup.get_global_rect().has_point(event.global_position):
			_close_popup()


func _move_selection(keycode: Key) -> void:
	if _slots.is_empty():
		return
	var index := 0
	for i in _slots.size():
		if _slots[i].is_selected:
			index = i
	match keycode:
		KEY_LEFT: index -= 1
		KEY_RIGHT: index += 1
		KEY_UP: index -= _grid.columns
		KEY_DOWN: index += _grid.columns
	index = clampi(index, 0, _slots.size() - 1)
	_select(_slots[index].item)


func close() -> void:
	if is_queued_for_deletion():
		return
	closed.emit()
	var tween := create_tween()
	tween.tween_property(self, "modulate:a", 0.0, 0.1)
	tween.tween_callback(queue_free)
