extends Scenario
## Reordering the pack by dragging (NetHack's #adjust): in the inventory,
## the food ration (d) dragged onto the spear (a) takes letter a and the
## spear takes d, as NetHack swaps them; the inventory opens again.


func _slot(letter: String) -> InventorySlot:
	for slot in game.dialogs.active.find_children("*", "InventorySlot", true, false):
		if char(int((slot as InventorySlot).item.get("selector", 0))) == letter:
			return slot
	return null


func _letter_of(word: String) -> String:
	for item in game.state.inventory:
		if str(item.get("text", "")).contains(word):
			return char(int(item.get("selector", 0)))
	return ""


func run() -> void:
	await start_game("Probe-Val-Hum-Fem-Law", "777")
	await press(KEY_ESCAPE)
	expect(_letter_of("food ration") == "d" and _letter_of("spear") == "a", "the food ration is d, the spear a")
	await type_text("i")
	await get_tree().create_timer(0.6).timeout
	var food := _slot("d")
	var spear := _slot("a")
	if not expect(food != null and spear != null, "both slots are in the grid"):
		return
	mark()
	await drag_between(food.get_global_rect().get_center(), spear.get_global_rect().get_center(), "dragging")
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and _letter_of("food ration") != "a":
		await get_tree().process_frame
	await get_tree().create_timer(0.8).timeout
	expect(_letter_of("food ration") == "a" and _letter_of("spear") == "d", "NetHack swapped them: food ration a, spear d (%s, %s)" % [_letter_of("food ration"), _letter_of("spear")])
	expect(game.dialogs.active is InventoryScreen, "the inventory is open again (%s)" % game.dialogs.active)
	await screenshot("swapped")
