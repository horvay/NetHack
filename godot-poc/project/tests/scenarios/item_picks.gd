extends Scenario
## NetHack's menus of pack items are the inventory's item grid
## (ItemPickScreen):
##   1. / then "something you're carrying": "Look up which item?", the
##      pack as slots; a letter answers;
##   2. * at "What do you want to eat?": titled with the question, Esc backs
##      out;
##   3. ? at "What do you want to wield?": "- (bare hands)" is a button;
##   4. Enter with nothing picked picks nothing (NetHack asks again);
##   5. - at the wield list is bare hands;
##   6. / i after another question keeps "Look up which item?";
##   (identify's pick-any grid: identify_pick).


func _wait_pick() -> ItemPickScreen:
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ItemPickScreen:
		await get_tree().process_frame
	await get_tree().create_timer(0.4).timeout
	return game.dialogs.active as ItemPickScreen


func _back_to_prompt() -> void:
	# By state, not events: Esc only while something is open or asked.
	for i in 12:
		if game.state.is_waiting_for_command() and game.dialogs.active == null:
			return
		if game.dialogs.active != null or not game.state.is_waiting_for_command():
			await press(KEY_ESCAPE)
		await get_tree().create_timer(0.3).timeout
	expect(game.state.is_waiting_for_command() and game.dialogs.active == null, "back at the command prompt")


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

	# 4. Enter with nothing picked picks nothing (tty): NetHack asks again.
	mark()
	var turn := game.state.status.turn()
	await type_text("e")
	await get_tree().create_timer(0.5).timeout
	# (* : with one thing to eat, ? names it in a line rather than a list.)
	await type_text("*")
	pick = await _wait_pick()
	if expect(pick != null, "* at the eat question opens the item grid"):
		await press(KEY_ENTER)
		var asked := await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("name", "")) == "shim_yn_function" and str(e.get("query", "")).begins_with("What do you want to eat"), "the eat question again")
		expect(not asked.is_empty() and game.state.status.turn() == turn, "Enter picked nothing: the question is back, no turn passed")
	await _back_to_prompt()

	# 5. - at the wield list: bare hands.
	mark()
	await type_text("w")
	await get_tree().create_timer(0.5).timeout
	await type_text("?")
	pick = await _wait_pick()
	if expect(pick != null, "? at the wield question opens the item grid"):
		await type_text("-")
		await wait_for_command_prompt()
		await get_tree().create_timer(0.4).timeout
		var said := game.state.messages.recent(3).map(func(m: Dictionary) -> String: return str(m.get("text", "")))
		expect(said.any(func(t: String) -> bool: return t.contains("empty handed") or t.contains("bare hand")), "- chose bare hands (%s)" % [said])
	await _back_to_prompt()

	# 6. After another question, / "something you're carrying" is still
	# "Look up which item?".
	mark()
	await type_text("e")
	await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("query", "")).begins_with("What do you want to eat"), "the eat question")
	await get_tree().create_timer(0.4).timeout
	await press(KEY_ESCAPE)
	await _back_to_prompt()
	await press(KEY_SLASH, 47)
	deadline = Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ChoiceScreen:
		await get_tree().process_frame
	await get_tree().create_timer(0.3).timeout
	await type_text("i")
	pick = await _wait_pick()
	expect(pick != null and pick.title_label.text == "Look up which item?", "the look title, not the old question (%s)" % (pick.title_label.text if pick else "none"))
	await _back_to_prompt()
