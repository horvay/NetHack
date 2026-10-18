extends Scenario
## NetHack's O options menu is a settings page (OptionsScreen):
##   1. O shows NetHack's sections with a switch per on/off option and the
##      value of the others;
##   2. flipping "autopickup" changes it in NetHack, and the page comes back
##      with the switch flipped;
##   3. "Show descriptions" adds NetHack's help under each option;
##   4. Esc is done: back at the command prompt.


func _wait_options(since_revision: int) -> OptionsScreen:
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not (game.dialogs.active is OptionsScreen and game.dialogs.active.get_instance_id() != since_revision):
		await get_tree().process_frame
	await get_tree().create_timer(0.4).timeout
	return game.dialogs.active as OptionsScreen


func _option(page: OptionsScreen, name: String) -> Dictionary:
	for section in page.sections:
		for opt in section.options:
			if str(opt.name) == name:
				return opt
	return {}


func run() -> void:
	await start_game("Probe-Val-Hum-Fem-Law", "777")
	await press(KEY_ESCAPE)
	await type_text("O")
	var page := await _wait_options(0)
	if not expect(page != null, "O opens the options page (%s)" % game.dialogs.active):
		return
	var count := 0
	for section in page.sections:
		count += (section.options as Array).size()
	note("sections: %s" % [page.sections.map(func(s: Dictionary) -> String: return "%s (%d)" % [s.heading, (s.options as Array).size()])])
	expect(page.sections.size() >= 2 and count >= 10, "NetHack's sections and options (%d options)" % count)
	var auto := _option(page, "autopickup")
	if not expect(not auto.is_empty() and bool(auto.is_bool), "autopickup is a switch"):
		return
	var was: bool = auto.on
	await screenshot("options")
	var toggle: CheckButton = page.find_child("Opt_autopickup", true, false).find_child("Toggle", true, false)
	await click_control(toggle)
	var again := await _wait_options(page.get_instance_id())
	if expect(again != null, "the page comes back after the change"):
		expect(bool(_option(again, "autopickup").on) != was, "autopickup flipped in NetHack (%s → %s)" % [was, _option(again, "autopickup").on])
		var help: Button = again.find_child("HelpToggle", true, false)
		if expect(help != null, "a Show descriptions button"):
			await click_control(help)
			var described := await _wait_options(again.get_instance_id())
			if expect(described != null and described.help_shown, "descriptions shown"):
				expect(str(_option(described, "autopickup").help) != "", "NetHack's help under autopickup (%s)" % _option(described, "autopickup").help)
				await screenshot("options-described")
				await press(KEY_ESCAPE)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	expect(not game.dialogs.active is OptionsScreen, "Esc is done")
