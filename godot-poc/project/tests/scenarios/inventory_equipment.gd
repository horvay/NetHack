extends Scenario
## Deep path through the pack and the paper doll: open the inventory with
## the classic i key, select by letter, use the primary action with Enter
## (wield the dagger), then take off the shield from the equipment screen;
## a selected item's action key (/ for the spear) runs that action.


func run() -> void:
	await start_game("Brunhild-Val-Hum-Fem-Law", "1001")
	await press(KEY_ESCAPE)  # dismiss the opening lore
	await type_text("i")
	expect(game.dialogs.active is InventoryScreen, "i opens the inventory screen")
	await screenshot("inventory")
	var dagger := _item_named("dagger")
	expect(not dagger.is_empty(), "Valkyrie carries a dagger")
	await type_text(char(int(dagger.get("selector", 98))))
	await screenshot("dagger-selected")
	mark()
	await press(KEY_ENTER)
	await wait_for_command_prompt()
	var wielded := _item_named("dagger")
	expect(int(wielded.get("wornMask", 0)) & 0x100, "Enter swapped the alternate dagger into the main hand: %s" % wielded.get("text", ""))
	game.input_router.open_ui("equipment")
	await screenshot("equipment")
	var screen := game.dialogs.active as EquipmentScreen
	expect(screen != null, "equipment screen opens")
	var shield := screen.item_in("armor.shield")
	expect(not shield.is_empty(), "shield shows in its slot")
	screen.selected_slot = "armor.shield"
	screen._rebuild()
	await screenshot("shield-slot")
	mark()
	screen._direct("takeOff", int(shield.get("objectId", 0)), "", "")
	await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("name", "")).begins_with("shim_equipment_change_"), "equipment change result")
	await wait_for_command_prompt()
	expect(not ItemText.is_worn(_item_named("shield")), "shield taken off through the typed equipment command")
	await screenshot("after-takeoff")

	# Alternate weapon with a weapon in hand and no alternate (the case that
	# used to leave the hero bare-handed): wield the dagger alone, then make
	# the spear the alternate. The dagger must stay in hand.
	# Setup: x (spear in hand, dagger alternate), w- (bare hands), then w the
	# dagger (wielding the alternate swaps, leaving no alternate).
	for keys in ["x", "w-", "w" + char(int(_item_named("dagger").get("selector", 0)))]:
		mark()
		game.send_keys(keys)
		await wait_for_command_prompt()
	note("before: %s / %s" % [_item_named("dagger").get("text", ""), _item_named("spear").get("text", "")])
	expect(int(_item_named("dagger").get("wornMask", 0)) & 0x100 and not ItemText.is_worn(_item_named("spear")), "the dagger is in hand and the spear in the pack")
	game.input_router.open_ui("equipment")
	var screen2 := game.dialogs.active as EquipmentScreen
	screen2.selected_slot = "alternate"
	screen2._rebuild()
	await screenshot("alternate-slot")
	screen2._equip("alternate", _item_named("spear"))
	# Three steps: w spear, x, w dagger.
	var deadline := Time.get_ticks_msec() + 20000
	while Time.get_ticks_msec() < deadline and not (int(_item_named("spear").get("wornMask", 0)) & 0x400 and int(_item_named("dagger").get("wornMask", 0)) & 0x100):
		await get_tree().process_frame
	await wait_for_command_prompt()
	note("after: %s / %s" % [_item_named("dagger").get("text", ""), _item_named("spear").get("text", "")])
	expect(int(_item_named("spear").get("wornMask", 0)) & 0x400, "the spear is the alternate weapon: %s" % _item_named("spear").get("text", ""))
	expect(int(_item_named("dagger").get("wornMask", 0)) & 0x100, "the dagger stayed in hand: %s" % _item_named("dagger").get("text", ""))
	await screenshot("alternate-set")

	# Look it up with its key: select the spear by letter, then / (NetHack's
	# / then "something in your inventory", then the item).
	var spear := _item_named("spear")
	await type_text("i")
	await type_text(char(int(spear.get("selector", 0))))
	var panel := game.dialogs.active as InventoryScreen
	expect(panel != null and panel.selected.get("objectId") == spear.get("objectId"), "the spear's letter selects it")
	await screenshot("spear-selected")
	mark()
	await type_text("/")
	expect(not game.dialogs.active is InventoryScreen, "/ ran Look it up (the inventory closed)")
	var shown := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_putstr" and str(e.get("text", "")).to_lower().contains("spear"), "the spear's description")
	expect(not shown.is_empty(), "Look it up shows NetHack's entry for the spear")
	await get_tree().create_timer(0.4).timeout
	await screenshot("lookup")
	for i in 3:
		if game.dialogs.owns_input():
			await press(KEY_ESCAPE)
			await get_tree().create_timer(0.2).timeout
	await wait_for_command_prompt(5.0)

	# "Call this kind of item" on a fully known dagger: NetHack asks nothing
	# ("You don't have anything to call"), so the letter must not be typed.
	var known_dagger := _item_named("dagger")
	var call := {}
	for action in ItemActions.for_item(known_dagger, game.state):
		if action.id == "call":
			call = action
	var since := events.size()
	var hero_before := game.state.map.hero
	mark()
	# The answers are automatic: no question or menu may flash up meanwhile.
	var flashed := []
	var watch := func(node: Node) -> void:
		if node is QuestionDialog or node is MenuDialog:
			flashed.append(node.get_class())
	get_tree().node_added.connect(watch)
	game.input_router.send_item_command(str(call.keys))
	await get_tree().create_timer(1.0).timeout
	get_tree().node_added.disconnect(watch)
	expect(flashed.is_empty(), "no dialog flashed up for the automatic answers (%d)" % flashed.size())
	var letter := int(known_dagger.get("selector", 0))
	var typed := commands_run(letter, since)
	note("call: %s" % [events_named("shim_raw_print", since).map(func(e: Dictionary) -> String: return str(e.get("text", "")))])
	expect(typed.is_empty(), "the dagger's letter wasn't typed as a command (%d times)" % typed.size())
	for i in 3:
		if game.dialogs.owns_input():
			await press(KEY_ESCAPE)
			await get_tree().create_timer(0.2).timeout


func _item_named(word: String) -> Dictionary:
	for item in game.state.inventory:
		if ItemText.display_name(item).to_lower().contains(word):
			return item
	return {}
