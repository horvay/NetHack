extends Scenario
## Things that must never go wrong:
##   - Escape on an item question cancels, even with an item lettered q or n;
##   - a seed never carries over into the next game;
##   - closing the window saves the run (and quits once saved);
##   - closing it mid-question declines the question and saves anyway.

const NAME := "GodotSafety"


func run() -> void:
	for save in app.session.catalog().saves():
		if save.name == NAME:
			DirAccess.remove_absolute(save.path)
	# A veteran's ~/.nethackrc must not reach Godot games (this scenario's
	# home is a sandbox): traditional menus would break the transfer
	# screens, and rest_on_space would contradict Settings.
	var rc := FileAccess.open(OS.get_environment("HOME").path_join(".nethackrc"), FileAccess.WRITE)
	rc.store_string("OPTIONS=menustyle:traditional,rest_on_space,pettype:none\n")
	rc.close()
	await start_game(NAME + "-Val-Hum-Fem-Law", "777")
	await press(KEY_ESCAPE)
	# pettype:none is an option Godot never sets: only the rc could remove
	# the Valkyrie's kitten.
	var pets := 0
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			if int(game.state.map.cell(Vector2i(x, y)).get("glyphFlags", 0)) & 0x10:
				pets += 1
	expect(pets > 0, "the player's ~/.nethackrc is not read (its pettype:none didn't apply)")
	var turn_before := game.state.status.number(StatusModel.Field.TIME)
	await press(KEY_SPACE, 32)
	await get_tree().create_timer(0.5).timeout
	expect(game.state.status.number(StatusModel.Field.TIME) == turn_before, "the player's ~/.nethackrc rest_on_space is ignored (Space didn't rest)")
	mark()
	# (NetHack's own D; typed D opens the floor screen: classic_keys_screens.)
	game.send_keys("D")
	var asked := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") in ["shim_select_menu", "shim_yn_function", "shim_getlin"], "D's question")
	expect(asked.get("name") == "shim_select_menu", "D opens a menu: the rc's menustyle:traditional is ignored (%s)" % asked.get("name"))
	await press(KEY_ESCAPE)
	await wait_for_command_prompt()
	# Switching rest_on_space in NetHack's own options menu sticks (the
	# bridge must not reset it).
	for want_rest in [true, false]:
		await _toggle_option("rest_on_space")
		var before := game.state.status.number(StatusModel.Field.TIME)
		await press(KEY_SPACE, 32)
		await get_tree().create_timer(0.6).timeout
		var rested := game.state.status.number(StatusModel.Field.TIME) > before
		expect(rested == want_rest, "after the options menu turns rest_on_space %s, Space %s" % ["on" if want_rest else "off", "rests" if want_rest else "does nothing"])
	var first_seed := game.state.seed
	expect(first_seed == "777", "seeded game uses its seed")

	# Move the food rations to letter q, then cancel a drop with Escape.
	var food := _letter_of("food ration")
	mark()
	await type_text("#")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("promptPurpose") == "prompt.extendedCommand" and e.get("lifecycle") == "opened", "extended command")
	await type_text("adjust")
	await press(KEY_ENTER)
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("adjust"), "adjust which item")
	await type_text(food)
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("to what"), "adjust to what letter")
	await type_text("q")
	await wait_for_command_prompt()
	expect(_letter_of("food ration") == "q", "food rations now sit at letter q")
	var count := _quantity("food ration")
	mark()
	await type_text("d")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("drop"), "drop question")
	await screenshot("drop-question-with-q")
	# Arrows move the highlight; they never answer (Down used to drop j).
	await press(KEY_DOWN)
	await press(KEY_DOWN)
	await get_tree().create_timer(0.3).timeout
	expect(game.dialogs.active is QuestionDialog, "the drop question is still open after the arrow keys")
	await press(KEY_ESCAPE)
	await wait_for_command_prompt()
	expect(_quantity("food ration") == count, "Escape cancelled the drop instead of dropping item q")

	# Close the window mid-game: the app saves, then quits.
	var quit_calls := [0]
	app.quit_handler = func() -> void: quit_calls[0] += 1
	mark()
	app.request_quit()
	var ended := await wait_for_game_end(20.0)
	expect(ended.get("reason") == "exit", "closing saved the run")
	expect(quit_calls[0] == 1, "the app quit after saving")
	expect(app.session.catalog().saves().any(func(s: Dictionary) -> bool: return s.name == NAME), "the save exists")
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()

	# A fresh game right after must not inherit seed 777.
	await start_game("SafetyTwo-Sam-Hum-Mal-Law", "")
	note("second game seed: %s" % game.state.seed)
	expect(game.state.seed != "777", "the earlier seed did not carry over")
	await press(KEY_ESCAPE)

	# Close while NetHack waits on a question: the question is declined and
	# the run saved anyway (as NetHack's own hangup save does), then quit.
	quit_calls[0] = 0
	mark()
	await type_text("d")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("drop"), "drop question")
	app.request_quit()
	var deadline := Time.get_ticks_msec() + 20000
	while ended_results.is_empty() and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	var mid := ended_results.pop_front() if not ended_results.is_empty() else {}
	expect(mid.get("reason") == "exit", "closing mid-question still saved the run (%s)" % [mid])
	expect(quit_calls[0] == 1, "the app quit after saving")
	expect(app.session.catalog().saves().any(func(s: Dictionary) -> bool: return s.name == "SafetyTwo"), "the second hero's save exists")
	await screenshot("saved-from-prompt")
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	for save in app.session.catalog().saves():
		if save.name in [NAME, "SafetyTwo"]:
			DirAccess.remove_absolute(save.path)


func _letter_of(word: String) -> String:
	for item in game.state.inventory:
		if ItemText.display_name(item).to_lower().contains(word):
			return char(int(item.get("selector", 0)))
	return ""


func _quantity(word: String) -> int:
	for item in game.state.inventory:
		if ItemText.display_name(item).to_lower().contains(word):
			return int(item.get("quantity", 1))
	return 0


## NetHack's full options menu (#optionsfull; O shows the short one): pick
## the option's row, confirm, back to the prompt.
func _toggle_option(option: String) -> void:
	mark()
	await type_text("#")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("promptPurpose") == "prompt.extendedCommand" and e.get("lifecycle") == "opened", "extended command")
	await type_text("optionsfull")
	await press(KEY_ENTER, 13)
	for round in 4:
		var menu_event := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") in ["shim_select_menu", "bridge_command_prompt"], "the options menu")
		if menu_event.get("name") == "bridge_command_prompt":
			return
		await get_tree().create_timer(0.3).timeout
		var menu := game.dialogs.active as MenuDialog
		if menu == null:
			return
		var picked := false
		for row in menu.rows:
			if str(row.item.get("text", "")).contains(option):
				# Scroll it into view and click it, as a player would.
				var scroll := menu._list.get_parent() as ScrollContainer
				if scroll:
					scroll.ensure_control_visible(row)
					await get_tree().process_frame
					await get_tree().process_frame
				await click_control(row)
				picked = true
				break
		note("O menu round %d (%s): picked %s" % [round, menu.request.get("prompt", ""), picked])
		await screenshot("options-menu-%s-%d" % [option, round])
		mark()
		if picked:
			await press(KEY_ENTER, 13)
		else:
			await press(KEY_ESCAPE)
	await wait_for_command_prompt()

