extends Scenario
## Where everything is (bridge fixture: a hero wearing something in nearly
## every slot and wielding an oil lamp):
##   1. every equipped item's tile names its place, and "On you" lists them
##      head to toe;
##   2. the detail panel says where in words;
##   3. the wielded lamp keeps its uses: Light it is the primary action and
##      Rub is offered, and rubbing it works.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "equipment/full-kit-wielded-lamp")
	await press(KEY_ESCAPE)
	# Wield the lamp the classic way: w, then its letter.
	var lamp_letter := ""
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("lamp"):
			lamp_letter = char(int(item.get("selector", 0)))
	mark()
	await type_text("w")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("wield"), "what to wield")
	await type_text(lamp_letter)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	await type_text("i")
	await get_tree().create_timer(0.4).timeout
	var inventory := game.dialogs.active as InventoryScreen
	if not expect(inventory != null, "the inventory opens"):
		return
	var tags := {}
	for slot in inventory._slots:
		var place := ItemText.equip_place(slot.item)
		if not place.is_empty():
			tags[ItemText.short_name(slot.item)] = place.tag
	note("tile tags: %s" % [tags])
	var want := {"oil lamp": "Main hand", "helmet": "Helmet", "leather cloak": "Cloak", "chain mail": "Body", "T-shirt": "Shirt",
		"low boots": "Boots", "small shield": "Shield", "ring of protection": "Left ring", "ring of adornment": "Right ring",
		"amulet of reflection": "Amulet", "arrows": "Quiver"}
	for word in want:
		var found := ""
		for name in tags:
			if str(name).contains(word):
				found = tags[name]
		expect(found == want[word], "the %s's tile says %s (%s)" % [word, want[word], found])
	for name in tags:
		expect(not str(name).contains("long sword") and not str(name).contains("food ration"), "carried things have no place band (%s)" % name)
	# "On you", head to toe.
	var rows: Array = inventory._tabs.find_children("*", "Button", true, false).filter(func(b: Button) -> bool: return b.has_meta("place")).map(func(b: Button) -> String: return str(b.get_meta("place")))
	note("on you: %s" % [rows])
	expect(rows.size() == 11 and rows[0] == "Helmet" and rows[-1] == "Boots", "On you lists all 11, helmet first and boots last")
	# Blessed / cursed and the enchantment read at a glance.
	var sword := {}
	var ration := {}
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("long sword"):
			sword = item
		if ItemText.display_name(item).contains("food ration"):
			ration = item
	expect(ItemText.beatitude(sword) == "cursed" and str(ItemText.known_bonus(sword).get("text", "")) == "−1", "the long sword shows C and −1 (%s, %s)" % [ItemText.beatitude(sword), ItemText.known_bonus(sword)])
	expect(ItemText.beatitude(ration) == "blessed" and ItemText.known_bonus(ration).is_empty(), "the food ration shows B and no enchantment")
	await screenshot("inventory-places")

	# The body armor says where it is in words.
	for slot in inventory._slots:
		if ItemText.display_name(slot.item).contains("chain mail"):
			await click_control(slot)
	await get_tree().create_timer(0.3).timeout
	var where := inventory._detail.find_children("*", "Label", true, false).filter(func(l: Label) -> bool: return l.text.begins_with("Worn as body armor"))
	expect(not where.is_empty(), "the chain mail's detail says Worn as body armor")
	await screenshot("chain-mail-detail")

	# The wielded lamp keeps its uses.
	var lamp := {}
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("lamp"):
			lamp = item
	var actions := ItemActions.for_item(lamp, game.state)
	var ids: Array = actions.map(func(a: Dictionary) -> String: return str(a.id))
	note("lamp actions: %s" % [ids])
	expect(ids[0] == "apply", "lighting the wielded lamp is its primary action")
	expect(ids.has("rub") and ids.has("unwield"), "it can still be rubbed, and put away")
	for slot in inventory._slots:
		if int(slot.item.get("objectId", 0)) == int(lamp.get("objectId", -1)):
			await click_control(slot)
	await get_tree().create_timer(0.3).timeout
	await screenshot("lamp-actions")
	var rub: Button = null
	for node in inventory._detail.find_children("*", "Button", true, false):
		if (node as Button).text.begins_with("Rub"):
			rub = node
	if expect(rub != null, "the detail panel offers Rub"):
		mark()
		await click_control(rub)
		var rubbed := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "bridge_command" and int(e.get("keycode", 0)) == int(lamp.get("selector", 0)), "the lamp's letter answering #rub")
		expect(not rubbed.is_empty(), "Rub ran #rub on the wielded lamp")
		await wait_for_command_prompt()
		await screenshot("after-rub")
