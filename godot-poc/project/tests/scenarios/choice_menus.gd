extends Scenario
## NetHack's small pick-one menus are tiles with art (ChoiceScreen):
##   1. C (#name) shows its choices; Esc cancels back to the command prompt;
##   2. clicking "a monster" goes on to NetHack's own map target;
##   3. #terrain preselects the first view; Enter takes it;
##   4. / (look) answers by its letter: "something you're carrying" goes on
##      to NetHack's pack menu.


func _wait_choice(title: String) -> ChoiceScreen:
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ChoiceScreen:
		await get_tree().process_frame
	var choice := game.dialogs.active as ChoiceScreen
	expect(choice != null and choice.title_label.text == title, "%s opens as choice tiles (%s)" % [title, game.dialogs.active])
	await get_tree().create_timer(0.4).timeout
	return choice


func _wait_not_menu(what: String) -> void:
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and str(game.state.request.get("kind", "")) == "menu":
		await get_tree().process_frame
	await get_tree().create_timer(0.3).timeout
	expect(str(game.state.request.get("kind", "")) != "menu" and not game.dialogs.active is ChoiceScreen, "%s (request %s)" % [what, game.state.request.get("kind", "")])


func _back_to_prompt() -> void:
	for i in 3:
		if game.state.is_waiting_for_command():
			break
		await press(KEY_ESCAPE)
		await get_tree().create_timer(0.3).timeout
	await wait_for_command_prompt()


func run() -> void:
	await start_game("Probe-Val-Hum-Fem-Law", "777")
	await press(KEY_ESCAPE)

	# 1. #name: tiles, Esc cancels.
	mark()
	await press(KEY_C, 67, true)
	var choice := await _wait_choice("Name or call")
	if choice == null:
		return
	note("name choices: %s" % [choice.choices.map(func(c: Dictionary) -> String: return "%s %s (%s)" % [c.selector, c.text, c.icon])])
	expect(choice.choices.size() >= 5 and choice.choices.all(func(c: Dictionary) -> bool: return str(c.icon) != ""), "every choice has art")
	await screenshot("name-choices")
	await press(KEY_ESCAPE)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	expect(game.dialogs.active == null or not game.dialogs.active is ChoiceScreen, "Esc cancels back to the command prompt")

	# 2. Clicking "a monster": NetHack asks where.
	mark()
	await press(KEY_C, 67, true)
	choice = await _wait_choice("Name or call")
	var monster: Array = choice.choices.filter(func(c: Dictionary) -> bool: return str(c.text) == "a monster")
	if expect(not monster.is_empty(), "a monster is offered"):
		await click_control(monster[0].button)
		await _wait_not_menu("clicking a monster goes on to NetHack's next step")
		expect(str(game.state.request.get("kind", "")) == "map_target", "NetHack asks where the monster is (%s)" % game.state.request.get("kind", ""))
	await _back_to_prompt()

	# 3. #terrain: the first view is preselected; Enter takes it.
	mark()
	game.send_keys("#terrain\n")
	choice = await _wait_choice("Show terrain")
	if choice != null:
		var lit: Array = choice.choices.filter(func(c: Dictionary) -> bool: return bool(c.preselected))
		expect(lit.size() == 1 and str(lit[0].text).begins_with("known map without monsters, objects"), "the first view is preselected")
		await screenshot("terrain-choices")
		await press(KEY_ENTER)
		await _wait_not_menu("Enter takes the preselected view")
		expect(game.dialogs.banner_label.text.begins_with("Showing the terrain you remember"), "the banner says what the view is (%s)" % game.dialogs.banner_label.text)
		await screenshot("terrain-view")
	await _back_to_prompt()

	# 4. / look: the letter answers.
	mark()
	await press(KEY_SLASH, 47)
	choice = await _wait_choice("Look at")
	if choice != null:
		await screenshot("look-choices")
		var carrying: Array = choice.choices.filter(func(c: Dictionary) -> bool: return str(c.text).begins_with("something you're carrying"))
		if expect(not carrying.is_empty(), "something you're carrying is offered"):
			var letter := str(carrying[0].selector)
			var before := str(game.state.request.get("prompt", ""))
			await press(OS.find_keycode_from_string(letter.to_upper()), letter.unicode_at(0))
			# NetHack goes on to its inventory, another menu.
			var deadline := Time.get_ticks_msec() + 6000
			while Time.get_ticks_msec() < deadline and str(game.state.request.get("prompt", "")) == before:
				await get_tree().process_frame
			await get_tree().create_timer(0.4).timeout
			expect(str(game.state.request.get("prompt", "")) != before and not game.dialogs.active is ChoiceScreen, "its letter answers: NetHack goes on to the pack (%s)" % game.state.request.get("prompt", ""))
			await screenshot("look-carrying")
	await _back_to_prompt()
