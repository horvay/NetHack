extends Scenario
## Equipment helpers on staged heroes (bridge fixtures):
##   1. body armor under a worn cloak: picking leather armor in the Body armor
##      slot takes the cloak off, swaps the armor, and puts the cloak back on,
##      each step confirmed by NetHack;
##   2. a shield and a two-handed quarterstaff: the staff is offered for the
##      main hand but blocked, with the reason, while the shield is worn;
##   2b. the staff dragged onto the Quiver slot is quivered;
##   3. Take off on the only worn armor: NetHack asks nothing, so no item
##      letter may be typed ahead.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "equipment/body-armor-swap-under-cloak")
	await press(KEY_ESCAPE)
	# The inventory compares a spare armor with the one worn in its place.
	game.input_router.open_ui("inventory")
	await get_tree().create_timer(0.3).timeout
	var inventory0 := game.dialogs.active as InventoryScreen
	inventory0._select(_item("leather armor"))
	expect(inventory0._equipped_rival(_item("leather armor")).get("text", "").contains("splint mail"), "leather armor is compared with the splint mail worn")
	await screenshot("compare", 0.3)
	await press(KEY_ESCAPE)
	game.input_router.open_ui("equipment")
	var screen := game.dialogs.active as EquipmentScreen
	await get_tree().create_timer(0.3).timeout
	# As a player does it: click the Body armor slot, then the leather armor.
	var body_slot: Button = null
	for node in screen._left.get_children():
		if str(node.get_meta("slot", "")) == "armor.body" and not node.is_queued_for_deletion():
			body_slot = node
	await click_control(body_slot)
	await get_tree().create_timer(0.3).timeout
	await screenshot("body-slot")
	var leather := _item("leather armor")
	expect(not leather.is_empty(), "the hero carries leather armor")
	var leather_row: ItemRow = null
	for node in screen._detail.find_children("*", "Button", true, false):
		if node is ItemRow and ItemText.display_name((node as ItemRow).item).contains("leather armor") and not node.is_queued_for_deletion():
			leather_row = node
	expect(leather_row != null, "the Body armor slot lists the leather armor")
	await click_control(leather_row)
	# A click that sends nothing (on the hero, while NetHack works through
	# the swap) must not cut the swap short.
	await get_tree().create_timer(0.15).timeout
	var clicked_hero := not game.dialogs.owns_input()
	if clicked_hero:
		await click_cell(game.state.map.hero)
	note("clicked the hero mid-swap: %s" % clicked_hero)
	var deadline := Time.get_ticks_msec() + 40000
	while Time.get_ticks_msec() < deadline and not (_worn("leather armor") and _worn("cloak") and not _worn("splint mail")):
		await get_tree().process_frame
	await wait_for_command_prompt()
	note("after: %s" % [game.state.inventory.map(func(i: Dictionary) -> String: return str(i.get("text", "")))])
	expect(_worn("leather armor"), "the leather armor is worn")
	expect(not _worn("splint mail"), "the splint mail came off")
	expect(_worn("cloak"), "the cloak went back on")
	game.input_router.open_ui("equipment")
	await get_tree().create_timer(0.4).timeout
	await screenshot("swapped")
	# Drag the splint mail from the pack strip onto the hero: it goes back
	# into the body-armor slot, under the cloak again.
	var doll := game.dialogs.active as EquipmentScreen
	var splint_chip: Button = null
	for chip in doll._strip.get_children():
		if int(chip.get_meta("item_id", 0)) == int(_item("splint mail").get("objectId", -1)):
			splint_chip = chip
	if expect(splint_chip != null, "the pack strip offers the splint mail"):
		expect(doll.best_slot(_item("splint mail")) == "armor.body", "its slot is the body armor")
		await drag_between(splint_chip.get_global_rect().get_center(), doll._portrait.get_global_rect().get_center(), "dragging-onto-hero")
		var until := Time.get_ticks_msec() + 40000
		while Time.get_ticks_msec() < until and not (_worn("splint mail") and _worn("cloak") and not _worn("leather armor")):
			await get_tree().process_frame
		await wait_for_command_prompt()
		expect(_worn("splint mail") and _worn("cloak") and not _worn("leather armor"), "dropping it on the hero put the splint mail back on, cloak on top")
	if game.dialogs.active is EquipmentScreen:
		await press(KEY_ESCAPE)

	session.stop_game()
	await wait_for_game_end(10.0)
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "equipment/offhand-shield-twohanded")
	await press(KEY_ESCAPE)
	game.input_router.open_ui("equipment")
	screen = game.dialogs.active as EquipmentScreen
	screen.selected_slot = "mainHand"
	screen._rebuild()
	await get_tree().create_timer(0.3).timeout
	var staff_row: ItemRow = null
	for node in screen.find_children("*", "Button", true, false):
		if node is ItemRow and ItemText.display_name((node as ItemRow).item).contains("quarterstaff"):
			staff_row = node
	expect(staff_row != null and staff_row.disabled, "the quarterstaff is blocked while the shield is worn")
	expect(staff_row != null and staff_row.tooltip_text.contains("both hands"), "and says why (%s)" % (staff_row.tooltip_text if staff_row else ""))
	await screenshot("two-handed-blocked")
	# Drag the blocked staff onto the Quiver slot instead: the slots it fits
	# light up while it is held (not the main hand), and the drop quivers it.
	var quiver_slot: Button = null
	for node in screen._bottom.get_children():
		if str(node.get_meta("slot", "")) == "quiver" and not node.is_queued_for_deletion():
			quiver_slot = node
	if expect(staff_row != null and quiver_slot != null, "a staff to drag and the quiver slot"):
		# A real drop on the main hand is refused: nothing reaches NetHack.
		var main_slot: Button = null
		for node in screen._bottom.get_children():
			if str(node.get_meta("slot", "")) == "mainHand" and not node.is_queued_for_deletion():
				main_slot = node
		var since := events.size()
		await drag_between(staff_row.get_global_rect().get_center(), main_slot.get_global_rect().get_center())
		await get_tree().create_timer(0.4).timeout
		expect(commands_run(0, since).is_empty() and not str(_item("quarterstaff").get("text", "")).contains("weapon in"), "the main hand refuses the staff while the shield is worn")
		await drag_between(staff_row.get_global_rect().get_center(), quiver_slot.get_global_rect().get_center(), "dragging-to-quiver")
		var until := Time.get_ticks_msec() + 10000
		while Time.get_ticks_msec() < until and not _quivered("quarterstaff"):
			await get_tree().process_frame
		expect(_quivered("quarterstaff"), "the dragged staff is quivered (%s)" % _item("quarterstaff").get("text", ""))
		await wait_for_command_prompt()
		# The arrows (now back in the pack) dropped on the hero go to the
		# quiver, not into the sword hand.
		game.input_router.open_ui("equipment")
		await get_tree().create_timer(0.4).timeout
		var doll2 := game.dialogs.active as EquipmentScreen
		var arrows_chip: Button = null
		for chip in doll2._strip.get_children():
			if int(chip.get_meta("item_id", 0)) == int(_item("arrow").get("objectId", -1)):
				arrows_chip = chip
		if expect(arrows_chip != null, "the pack strip offers the arrows"):
			await drag_between(arrows_chip.get_global_rect().get_center(), doll2._portrait.get_global_rect().get_center())
			var until2 := Time.get_ticks_msec() + 10000
			while Time.get_ticks_msec() < until2 and not _quivered("arrow"):
				await get_tree().process_frame
			await wait_for_command_prompt()
			expect(_quivered("arrow") and str(_item("long sword").get("text", "")).contains("weapon in"), "the arrows went to the quiver and the sword stayed in hand")
	if game.dialogs.active is EquipmentScreen:
		await press(KEY_ESCAPE)

	# Taking off the only worn armor: NetHack doesn't ask which item, so the
	# item letter must not be typed ahead (it would run as a command).
	var shield := _item("small shield")
	game.input_router.open_ui("inventory")
	await get_tree().create_timer(0.3).timeout
	var inventory := game.dialogs.active as InventoryScreen
	inventory._select(shield)
	var take_off := {}
	for action in ItemActions.for_item(shield, game.state):
		if action.id == "takeoff":
			take_off = action
	mark()
	var since := events.size()
	inventory._run(take_off)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	expect(not _worn("small shield"), "the shield came off")
	var stray := commands_run(int(shield.get("selector", 0)), since)
	expect(stray.is_empty(), "the item letter was not typed as a command")


func _item(word: String) -> Dictionary:
	for item in game.state.inventory:
		if ItemText.display_name(item).contains(word):
			return item
	return {}


func _worn(word: String) -> bool:
	var item := _item(word)
	return not item.is_empty() and ItemText.is_worn(item)


## NetHack says "in quiver" for ammo and "at the ready" for anything else.
func _quivered(word: String) -> bool:
	var text := str(_item(word).get("text", ""))
	return text.contains("quiver") or text.contains("at the ready")
