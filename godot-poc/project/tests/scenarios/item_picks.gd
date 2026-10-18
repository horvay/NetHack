extends Scenario
## NetHack's menus of pack items are the inventory's item grid
## (ItemPickScreen):
##   1. / then "something you're carrying": "Look up which item?", the
##      pack as slots; a letter answers;
##   2. * at "What do you want to eat?": titled with the question, Esc backs
##      out;
##   3. ? at "What do you want to wield?": "- (bare hands)" is a button;
##   (identify's pick-any grid: identify_pick).


func _wait_pick() -> ItemPickScreen:
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ItemPickScreen:
		await get_tree().process_frame
	await get_tree().create_timer(0.4).timeout
	return game.dialogs.active as ItemPickScreen


func _back_to_prompt() -> void:
	for i in 5:
		if game.state.is_waiting_for_command() and game.dialogs.active == null:
			break
		await press(KEY_ESCAPE)
		await get_tree().create_timer(0.3).timeout
	await wait_for_command_prompt()


func run() -> void:
	await start_game("Probe-Val-Hum-Fem-Law", "777")
	await press(KEY_ESCAPE)

	# 1. / → something you're carrying.
	mark()
	await press(KEY_SLASH, 47)
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ChoiceScreen:
		await get_tree().process_frame
	await get_tree().create_timer(0.3).timeout
	await type_text("i")
	var pick := await _wait_pick()
	if expect(pick != null, "the pack menu is the item grid (%s)" % game.dialogs.active):
		expect(pick.title_label.text == "Look up which item?", "titled for what it's for (%s)" % pick.title_label.text)
		expect(pick.slots.size() == game.state.inventory.size(), "a slot per pack item (%d of %d)" % [pick.slots.size(), game.state.inventory.size()])
		pick.slots[0].grab_focus()
		await screenshot("look-which-item")
		await type_text("a")
		await get_tree().create_timer(0.5).timeout
		expect(not game.dialogs.active is ItemPickScreen, "the letter answers")
	await _back_to_prompt()

	# 2. * at the eat question.
	mark()
	await type_text("e")
	await get_tree().create_timer(0.5).timeout
	await type_text("*")
	pick = await _wait_pick()
	if expect(pick != null, "* at the eat question opens the item grid (%s)" % game.dialogs.active):
		expect(pick.title_label.text.begins_with("What do you want to eat"), "titled with the question (%s)" % pick.title_label.text)
		await screenshot("eat-which-item")
		await press(KEY_ESCAPE)
		await get_tree().create_timer(0.4).timeout
		expect(not game.dialogs.active is ItemPickScreen, "Esc backs out")
	await _back_to_prompt()

	# 3. ? at the wield question: bare hands is a button beside the grid.
	mark()
	await type_text("w")
	await get_tree().create_timer(0.5).timeout
	await type_text("?")
	pick = await _wait_pick()
	if expect(pick != null, "? at the wield question opens the item grid (%s)" % game.dialogs.active):
		var hands: Array = pick.footer.get_children().filter(func(c: Node) -> bool: return c is Button and (c as Button).text.to_lower().contains("hands"))
		expect(hands.size() == 1, "bare hands is a button")
		await screenshot("wield-which-item")
		await press(KEY_ESCAPE)
	await _back_to_prompt()
