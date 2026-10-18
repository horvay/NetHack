class_name EquipmentScreen
extends Control
## Paper doll: the hero in the middle, every equipment slot around them.
## Pick a slot to see what is there and what in the pack could go there;
## equip or remove in one click, or drag an item from the list onto any slot
## it fits (a weapon onto the quiver, a ring onto the other hand). Armor goes through the bridge's
## equipment-change command, which handles cloak layering for you.

signal closed

const SLOTS := {
	"armor.helm": {"label": "Helm", "mask": 0x4, "side": "left"},
	"armor.cloak": {"label": "Cloak", "mask": 0x2, "side": "left"},
	"armor.body": {"label": "Body armor", "mask": 0x1, "side": "left"},
	"armor.shirt": {"label": "Shirt", "mask": 0x40, "side": "left"},
	"armor.gloves": {"label": "Gloves", "mask": 0x10, "side": "left"},
	"armor.boots": {"label": "Boots", "mask": 0x20, "side": "left"},
	"amulet": {"label": "Amulet", "mask": 0x10000, "side": "right"},
	"eyes": {"label": "Eyewear", "mask": 0x80000, "side": "right"},
	"ring.left": {"label": "Left ring", "mask": 0x20000, "side": "right"},
	"ring.right": {"label": "Right ring", "mask": 0x40000, "side": "right"},
	"armor.shield": {"label": "Shield", "mask": 0x8, "side": "right"},
	"mainHand": {"label": "Main hand", "mask": 0x100, "side": "bottom"},
	"alternate": {"label": "Alternate weapon", "mask": 0x400, "side": "bottom"},
	"quiver": {"label": "Quiver", "mask": 0x200, "side": "bottom"},
}

var screen: GameScreen
var selected_slot := "mainHand"
var _card: PanelContainer
var _left: VBoxContainer
var _right: VBoxContainer
var _bottom: HBoxContainer
var _detail: VBoxContainer
var _stats: VBoxContainer
var _portrait: TextureRect
## Everything wearable or wieldable in the pack, to drag onto a slot or the
## hero (Electron's pack list beside the doll).
var _strip: HFlowContainer
var _strip_title: Label


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
	_card.custom_minimum_size = Vector2(minf(1480.0, view.x - 48.0), minf(820.0, view.y - 120.0))
	center.add_child(_card)
	var outer := VBoxContainer.new()
	outer.add_theme_constant_override("separation", 12)
	_card.add_child(outer)
	var header := HBoxContainer.new()
	outer.add_child(header)
	var title := Label.new()
	title.text = "Equipment"
	title.theme_type_variation = "HeaderLabel"
	title.add_theme_font_size_override("font_size", 32)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var hint := Label.new()
	hint.text = "Pick a slot to change it"
	hint.theme_type_variation = "CaptionLabel"
	header.add_child(hint)
	var close_button := Button.new()
	close_button.text = "Close  Esc"
	close_button.focus_mode = Control.FOCUS_ALL
	close_button.pressed.connect(close)
	header.add_child(close_button)

	var row := HBoxContainer.new()
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 22)
	outer.add_child(row)
	var doll := VBoxContainer.new()
	doll.add_theme_constant_override("separation", 14)
	row.add_child(doll)
	var doll_row := HBoxContainer.new()
	doll_row.add_theme_constant_override("separation", 18)
	doll.add_child(doll_row)
	_left = VBoxContainer.new()
	_left.add_theme_constant_override("separation", 8)
	doll_row.add_child(_left)
	var portrait_frame := PanelContainer.new()
	var pf := UiTheme.panel_style(Color("07080c"), Color(UiTheme.GOLD, 0.3), 14, 1, 0)
	portrait_frame.add_theme_stylebox_override("panel", pf)
	doll_row.add_child(portrait_frame)
	_portrait = TextureRect.new()
	_portrait.custom_minimum_size = Vector2(300, 470)
	_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	portrait_frame.add_child(_portrait)
	_right = VBoxContainer.new()
	_right.add_theme_constant_override("separation", 8)
	doll_row.add_child(_right)
	_bottom = HBoxContainer.new()
	_bottom.add_theme_constant_override("separation", 8)
	_bottom.alignment = BoxContainer.ALIGNMENT_CENTER
	doll.add_child(_bottom)
	_strip_title = _caption("From your pack: drag onto a slot or onto yourself")
	doll.add_child(_strip_title)
	# At most two rows show; a big pack scrolls (pad focus follows).
	var strip_scroll := ScrollContainer.new()
	strip_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	strip_scroll.follow_focus = true
	strip_scroll.custom_minimum_size = Vector2(0, 2 * 70 + 6)
	doll.add_child(strip_scroll)
	_strip = HFlowContainer.new()
	_strip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_strip.add_theme_constant_override("h_separation", 6)
	_strip.add_theme_constant_override("v_separation", 6)
	strip_scroll.add_child(_strip)
	# A drop on the hero picks the slot the item belongs in.
	_portrait.mouse_filter = Control.MOUSE_FILTER_STOP
	_portrait.tooltip_text = "Drop an item here to put it where it belongs"
	_portrait.set_drag_forwarding(Callable(), _can_drop_on_hero, _drop_on_hero)

	var side := VBoxContainer.new()
	side.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	side.add_theme_constant_override("separation", 12)
	row.add_child(side)
	_stats = VBoxContainer.new()
	side.add_child(_stats)
	var detail_panel := PanelContainer.new()
	detail_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_panel.add_theme_stylebox_override("panel", UiTheme.panel_style(Color("0c0d13"), Color(1, 1, 1, 0.06), 10, 1, 0))
	side.add_child(detail_panel)
	_detail = VBoxContainer.new()
	_detail.add_theme_constant_override("separation", 6)
	detail_panel.add_child(_detail)
	screen.state.inventory_changed.connect(_rebuild)
	screen.state.status_changed.connect(_rebuild_stats)
	_rebuild()
	_rebuild_stats()


func _ready() -> void:
	modulate.a = 0.0
	create_tween().tween_property(self, "modulate:a", 1.0, 0.15)


func item_in(slot: String) -> Dictionary:
	var mask := int(SLOTS[slot].mask)
	for item in screen.state.inventory:
		if int(item.get("wornMask", 0)) & mask:
			return item
	return {}


func _rebuild() -> void:
	var avatar := TileResolver.shared().player_avatar_id(screen.state.character)
	_portrait.texture = TileResolver.shared().portrait(avatar)
	for box in [_left, _right, _bottom]:
		for child in box.get_children():
			child.queue_free()
	for slot in SLOTS:
		var info: Dictionary = SLOTS[slot]
		var button := _slot_button(slot, info)
		match str(info.side):
			"left": _left.add_child(button)
			"right": _right.add_child(button)
			_: _bottom.add_child(button)
	_show_slot(selected_slot)
	for child in _strip.get_children():
		child.queue_free()
	# Gems and stones only matter as sling ammunition.
	var slinging: bool = str(item_in("mainHand").get("text", "")).to_lower().contains("sling") or selected_slot == "quiver"
	for item in screen.state.inventory:
		if ItemText.is_worn(item) or best_slot(item) == "":
			continue
		if str(item.get("publicClass", "")) == "gem" and not slinging:
			continue
		var chip := Button.new()
		chip.icon = ItemText.icon(item, screen.state)
		chip.expand_icon = true
		chip.add_theme_constant_override("icon_max_width", 36)
		chip.vertical_icon_alignment = VERTICAL_ALIGNMENT_TOP
		# The letter and a short name under the icon (pad players get no
		# tooltips).
		var base := str(item.get("semanticName", "")) if item.get("semanticKnown", true) else ""
		if base == "":
			base = ItemText.short_name(item).trim_prefix("uncursed ").trim_prefix("blessed ").trim_prefix("cursed ")
		chip.text = "%s · %s" % [char(int(item.get("selector", 32))), base]
		chip.alignment = HORIZONTAL_ALIGNMENT_CENTER
		chip.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		chip.clip_text = true
		chip.add_theme_font_size_override("font_size", 13)
		chip.custom_minimum_size = Vector2(132, 70)
		chip.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		chip.focus_mode = Control.FOCUS_ALL
		chip.tooltip_text = "%s  (%s)" % [ItemText.sentence(ItemText.display_name(item)), SLOTS[best_slot(item)].label]
		chip.set_meta("item_id", int(item.get("objectId", 0)))
		chip.pressed.connect(func() -> void:
			selected_slot = best_slot(item)
			_rebuild())
		chip.set_drag_forwarding(_drag_item.bind(item), Callable(), Callable())
		_strip.add_child(chip)
	_strip_title.visible = _strip.get_children().any(func(c: Node) -> bool: return not c.is_queued_for_deletion())


## Where an item goes when dropped on the hero: the main hand for weapons,
## else the first free slot it fits (a ring takes a free hand), else the
## first it fits. "" when it fits nowhere.
func best_slot(item: Dictionary) -> String:
	var fits: Array[String] = []
	for slot in SLOTS:
		var id := int(item.get("objectId", 0))
		if _candidates(slot).any(func(c: Dictionary) -> bool: return int(c.get("objectId", 0)) == id):
			fits.append(slot)
	if fits.is_empty():
		return ""
	# Ammunition and thrown missiles go to the quiver (as in Electron),
	# never into the hand in place of the weapon.
	if fits.has("quiver") and is_missile(item):
		return "quiver"
	if fits.has("mainHand"):
		return "mainHand"
	for slot in fits:
		if item_in(slot).is_empty():
			return slot
	return fits[0]


func _can_drop_on_hero(at: Vector2, data: Variant) -> bool:
	return data is Dictionary and data.has("nh_equip_item") and best_slot(data.nh_equip_item) != "" \
		and _can_drop(at, data, best_slot(data.nh_equip_item))


func _drop_on_hero(at: Vector2, data: Variant) -> void:
	_drop(at, data, best_slot(data.nh_equip_item))


func _slot_button(slot: String, info: Dictionary) -> Button:
	var item := item_in(slot)
	var button := Button.new()
	button.focus_mode = Control.FOCUS_ALL
	button.custom_minimum_size = Vector2(250, 62) if info.side != "bottom" else Vector2(330, 62)
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.expand_icon = false
	button.icon = ItemText.icon(item, screen.state) if not item.is_empty() else null
	button.add_theme_constant_override("icon_max_width", 44)
	button.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	if item.is_empty():
		button.text = "%s\n— empty —" % info.label
		button.add_theme_color_override("font_color", UiTheme.INK_FAINT)
	else:
		button.text = "%s\n%s" % [info.label, ItemText.short_name(item)]
		button.add_theme_color_override("font_color", ItemText.name_color(item) if ItemText.beatitude(item) != "" else UiTheme.INK)
	button.add_theme_font_size_override("font_size", 16)
	button.clip_text = true
	if slot == selected_slot:
		button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("2a2414"), Color(UiTheme.GOLD, 0.8), 8))
	button.pressed.connect(func() -> void:
		selected_slot = slot
		_rebuild())
	button.set_drag_forwarding(Callable(), _can_drop.bind(slot), _drop.bind(slot))
	button.set_meta("slot", slot)
	return button


## Why this item can't go into this slot now ("" when it can), or null
## when it doesn't fit there at all.
func _drop_refusal(slot: String, item: Dictionary) -> Variant:
	var id := int(item.get("objectId", 0))
	if not _candidates(slot).any(func(c: Dictionary) -> bool: return int(c.get("objectId", 0)) == id):
		return null
	var why := _blocker(slot)
	if why == "" and slot == "mainHand" and is_two_handed(item) and not item_in("armor.shield").is_empty():
		why = "Take off your shield first: this weapon needs both hands."
	return why


func _drag_item(_at: Vector2, item: Dictionary) -> Variant:
	var preview := TextureRect.new()
	preview.texture = ItemText.icon(item, screen.state)
	preview.custom_minimum_size = Vector2(48, 48)
	preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	preview.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	set_drag_preview(preview)
	return {"nh_equip_item": item}


func _can_drop(_at: Vector2, data: Variant, slot: String) -> bool:
	return data is Dictionary and data.has("nh_equip_item") and _drop_refusal(slot, data.nh_equip_item) is String and _drop_refusal(slot, data.nh_equip_item) == ""


func _drop(_at: Vector2, data: Variant, slot: String) -> void:
	selected_slot = slot
	_equip(slot, data.nh_equip_item)


## While an item is dragged, the slots it fits light up.
func _notification(what: int) -> void:
	if what != NOTIFICATION_DRAG_BEGIN and what != NOTIFICATION_DRAG_END or _left == null:
		return
	var data: Variant = get_viewport().gui_get_drag_data() if what == NOTIFICATION_DRAG_BEGIN else null
	for box in [_left, _right, _bottom]:
		for button in box.get_children():
			var fits: bool = data is Dictionary and data.has("nh_equip_item") and _can_drop(Vector2.ZERO, data, str(button.get_meta("slot", "")))
			button.modulate = Color(1.25, 1.12, 0.8) if fits else (Color(1, 1, 1, 0.55) if data is Dictionary else Color.WHITE)
	var to_hero: bool = data is Dictionary and _can_drop_on_hero(Vector2.ZERO, data)
	_portrait.modulate = Color(1.2, 1.1, 0.85) if to_hero else Color.WHITE


func _show_slot(slot: String) -> void:
	for child in _detail.get_children():
		child.queue_free()
	var info: Dictionary = SLOTS[slot]
	var title := Label.new()
	title.text = str(info.label).to_upper()
	title.add_theme_font_override("font", UiTheme.heading_font())
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", UiTheme.GOLD)
	_detail.add_child(title)
	var current := item_in(slot)
	if current.is_empty():
		_detail.add_child(_caption("Nothing equipped here."))
	else:
		var row := ItemRow.new()
		row.setup_item(current, screen.state)
		row.disabled = true
		_detail.add_child(row)
		for action in _remove_actions(slot, current):
			_detail.add_child(_action_button(action.label, action.run, action.get("danger", "")))
	var candidates := _candidates(slot)
	var blocker := _blocker(slot)
	if blocker != "" and not candidates.is_empty():
		var warning := _caption(blocker)
		warning.add_theme_color_override("font_color", UiTheme.WARN)
		warning.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_detail.add_child(warning)
	var covering := (COVERED_BY.get(slot, []) as Array).filter(func(layer: String) -> bool: return not item_in(layer).is_empty())
	if not covering.is_empty() and not candidates.is_empty():
		var names := covering.map(func(layer: String) -> String: return ItemText.short_name(item_in(layer)))
		var note := _caption("Your %s comes off first and goes back on after." % " and ".join(names))
		note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_detail.add_child(note)
	var empty_text := "No other weapons in your pack." if slot in ["mainHand", "alternate"] else "Nothing in your pack fits here."
	_detail.add_child(_caption("From your pack:" if not candidates.is_empty() else empty_text))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_detail.add_child(scroll)
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(list)
	for item in candidates:
		var row := ItemRow.new()
		row.setup_item(item, screen.state)
		var why := blocker
		if why == "" and slot == "mainHand" and is_two_handed(item) and not item_in("armor.shield").is_empty():
			why = "Take off your shield first: this weapon needs both hands."
		row.tooltip_text = why if why != "" else "Equip " + ItemText.display_name(item)
		row.disabled = why != ""
		row.pressed.connect(_equip.bind(slot, item))
		row.set_drag_forwarding(_drag_item.bind(item), Callable(), Callable())
		list.add_child(row)
		if why != "" and why != blocker:
			# Blocked rows say why in plain view (the slot-wide blocker is
			# already shown above the list).
			row.modulate.a = 0.55
			var reason := _caption(why)
			reason.add_theme_color_override("font_color", UiTheme.WARN)
			reason.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			list.add_child(reason)
		elif why != "":
			row.modulate.a = 0.55


## Why nothing can go into this slot right now (worn layers on top, hands
## full), from what NetHack reports as worn; "" when it is free.
func _blocker(slot: String) -> String:
	var worn := 0
	for item in screen.state.inventory:
		worn |= int(item.get("wornMask", 0))
	match slot:
		"ring.left", "ring.right":
			if worn & 0x20000 and worn & 0x40000:
				return "Both hands already wear a ring. Remove one first."
		"armor.shield":
			var weapon := item_in("mainHand")
			if not weapon.is_empty() and is_two_handed(weapon):
				return "You can't hold a shield while wielding a two-handed weapon."
	return ""


func _caption(text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.theme_type_variation = "CaptionLabel"
	return label


func _action_button(text: String, callback: Callable, danger := "") -> Button:
	var button := Button.new()
	button.text = text
	button.focus_mode = Control.FOCUS_ALL
	button.custom_minimum_size = Vector2(0, 40)
	if danger != "":
		button.add_theme_color_override("font_color", UiTheme.WARN)
	button.pressed.connect(callback)
	return button


func _remove_actions(slot: String, item: Dictionary) -> Array:
	var sel := char(int(item.get("selector", 0)))
	var id := int(item.get("objectId", 0))
	match slot:
		"mainHand":
			var actions := [{"label": "Put away (fight bare-handed)", "run": func() -> void: _send("w-")}]
			# Swapping with no alternate would just empty the hands.
			if not item_in("alternate").is_empty():
				actions.append({"label": "Swap with alternate weapon", "run": func() -> void: _send("x")})
			return actions
		"alternate":
			return [{"label": "Swap to main hand", "run": func() -> void: _send("x")}]
		"quiver":
			return [{"label": "Fire", "run": func() -> void: _send("f")},
				{"label": "Empty the quiver", "run": func() -> void: _direct("clearQuiver", 0, "quiver", "Q-")}]
		"ring.left", "ring.right", "amulet", "eyes":
			return [{"label": "Remove", "run": func() -> void: _direct("removeAccessory", id, "", "R" + sel)}]
	return [{"label": "Take off", "run": func() -> void: _direct("takeOff", id, "", "T" + sel)}]


func _candidates(slot: String) -> Array:
	var result := []
	for item in screen.state.inventory:
		if ItemText.is_worn(item):
			continue
		var cls := str(item.get("publicClass", ""))
		var text := ItemText.display_name(item).to_lower()
		var fits := false
		match slot:
			"mainHand", "alternate":
				fits = cls == "weapon" or (cls == "tool" and (text.contains("pick-axe") or text.contains("mattock") or text.contains("unicorn horn")))
			"quiver":
				fits = cls in ["weapon", "gem"]
			"ring.left", "ring.right":
				fits = cls == "ring"
			"amulet":
				fits = cls == "amulet"
			"eyes":
				fits = text.contains("blindfold") or text.contains("lenses") or text.contains("towel")
			_:
				fits = cls == "armor" and ArmorSlots.slot_for(item) == slot
		if fits:
			result.append(item)
	return result


func _equip(slot: String, item: Dictionary) -> void:
	var sel := char(int(item.get("selector", 0)))
	var id := int(item.get("objectId", 0))
	match slot:
		"mainHand":
			_direct("wieldMain", id, "mainHand", "w" + sel)
		"alternate":
			# (The follow-up steps live on the router: this screen closes now.)
			if screen.input_router.set_alternate(id):
				close()
		"quiver":
			_direct("quiver", id, "quiver", "Q" + sel)
		"ring.left", "ring.right":
			var hand := "left" if slot == "ring.left" else "right"
			if not screen.state.is_waiting_for_command():
				return
			close()
			screen.session.send_equipment_change("putOnRing", id, slot, hand)
		"amulet", "eyes":
			_send("P" + sel)
		_:
			_change_armor(slot, id)


## Layers worn over each armor slot, outermost first.
const COVERED_BY := {"armor.body": ["armor.cloak"], "armor.shirt": ["armor.cloak", "armor.body"]}


## Wears an armor piece, taking off what is in the way first (the layers on
## top and the piece already in the slot) and putting the outer layers back.
func _change_armor(slot: String, item_id: int) -> void:
	if screen.input_router.run_equipment_steps(armor_steps(screen.state, slot, item_id)):
		close()
	else:
		screen.hud.feed.flash_notice("Finish the current prompt first.")


static func worn_in(state: GameState, slot: String) -> Dictionary:
	var mask := int(SLOTS[slot].mask)
	for item in state.inventory:
		if int(item.get("wornMask", 0)) & mask:
			return item
	return {}


## The T/W steps for wearing item_id in an armor slot (see _change_armor).
static func armor_steps(state: GameState, slot: String, item_id: int) -> Array:
	if not SLOTS.has(slot):
		return [{"wear": true, "id": item_id}]
	var steps := []
	var covering := []
	for layer in COVERED_BY.get(slot, []):
		var worn := worn_in(state, layer)
		if not worn.is_empty():
			covering.append(worn)
			steps.append({"wear": false, "id": int(worn.get("objectId", 0))})
	var current := worn_in(state, slot)
	if not current.is_empty():
		steps.append({"wear": false, "id": int(current.get("objectId", 0))})
	steps.append({"wear": true, "id": item_id})
	covering.reverse()
	for worn in covering:
		steps.append({"wear": true, "id": int(worn.get("objectId", 0))})
	return steps


## Two-handed weapons, by name (NetHack only says "weapon in hands" once one
## is wielded).
const TWO_HANDED_WORDS := ["two-handed", "battle-axe", "double-headed axe", "quarterstaff", "staff", "mattock", "broad pick",
	"halberd", "bardiche", "voulge", "fauchard", "guisarme", "glaive", "lucern hammer", "bec de corbin", "partisan",
	"ranseur", "spetum", "polearm", "poleaxe", "pole cleaver", "pole sickle", "pruning hook", "unicorn horn", "tsurugi", "long samurai sword"]


## Ammunition (the bridge marks it for the quiver: arrows, bolts, ya,
## sling stones) and thrown missiles, which NetHack doesn't class as
## ammunition (darts, shuriken, boomerangs, by any name).
static func is_missile(item: Dictionary) -> bool:
	if (item.get("equipmentSlots", []) as Array).has("quiver"):
		return true
	var text := ItemText.display_name(item).to_lower()
	return RegEx.create_from_string("\\b(arrows?|bolts?|darts?|shuriken|throwing stars?|boomerangs?|ya|rocks?|flint stones?)\\b").search(text) != null


static func is_two_handed(item: Dictionary) -> bool:
	var text := ItemText.display_name(item).to_lower()
	if text.contains("weapon in hands"):
		return true
	for word in TWO_HANDED_WORDS:
		if text.contains(word):
			return true
	return false


## Prefers the bridge's typed equipment-change; NetHack still validates it.
func _direct(action: String, item_id: int, slot: String, _fallback_keys: String) -> void:
	if not screen.state.is_waiting_for_command():
		screen.hud.feed.flash_notice("Finish the current prompt first.")
		return
	close()
	screen.session.send_equipment_change(action, item_id, slot)


func _send(keys: String) -> void:
	if screen.input_router.send_item_command(keys):
		close()


func _rebuild_stats() -> void:
	for child in _stats.get_children():
		child.queue_free()
	var status := screen.state.status
	var grid := GridContainer.new()
	grid.columns = 6
	grid.add_theme_constant_override("h_separation", 26)
	grid.add_theme_constant_override("v_separation", 4)
	_stats.add_child(grid)
	for pair in [["Str", StatusModel.Field.STR], ["Dex", StatusModel.Field.DX], ["Con", StatusModel.Field.CO],
			["Int", StatusModel.Field.IN], ["Wis", StatusModel.Field.WI], ["Cha", StatusModel.Field.CH]]:
		var box := VBoxContainer.new()
		var name := Label.new()
		name.text = pair[0]
		name.theme_type_variation = "CaptionLabel"
		box.add_child(name)
		var value := Label.new()
		value.text = status.text(pair[1])
		value.add_theme_font_override("font", UiTheme.heading_font())
		value.add_theme_font_size_override("font_size", 24)
		box.add_child(value)
		grid.add_child(box)
	var line := Label.new()
	line.text = "Armor class %s   ·   Level %s   ·   %s" % [status.text(StatusModel.Field.AC), status.text(StatusModel.Field.XP), status.text(StatusModel.Field.ALIGN)]
	line.add_theme_color_override("font_color", UiTheme.GOLD)
	_stats.add_child(line)


func handle_key(event: InputEventKey) -> bool:
	if event.keycode == KEY_ESCAPE:
		close()
		return true
	return false


func close() -> void:
	if is_queued_for_deletion():
		return
	closed.emit()
	var tween := create_tween()
	tween.tween_property(self, "modulate:a", 0.0, 0.1)
	tween.tween_callback(queue_free)
