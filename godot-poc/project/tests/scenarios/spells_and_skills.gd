extends Scenario
## Magic through the real UI: the spellbook (+), casting force bolt with Z
## (pick the spell by clicking it, then a direction), Pw spent, and the
## skills screen (#enhance) built from the bridge's typed rows.


func run() -> void:
	await start_game("Morwen-Wiz-Elf-Fem-Cha", "3141")
	await press(KEY_ESCAPE)
	mark()
	await type_text("+")
	await wait_for_named("shim_select_menu")
	await get_tree().create_timer(0.3).timeout
	var book := game.dialogs.active as SpellsScreen
	expect(book != null and book.title_label.text == "Spellbook", "+ opens the spellbook screen: %s" % (book.title_label.text if book else game.dialogs.active))
	expect(book != null and book.rows.size() >= 1, "the spellbook lists the Wizard's spells")
	expect(book != null and book.rows.all(func(r: Dictionary) -> bool: return str(r.get("school", "")) != ""), "each spell has its school")
	await screenshot("spellbook")
	await press(KEY_ESCAPE)
	await wait_for_command_prompt()

	var pw_before := game.state.status.energy()
	mark()
	await type_text("Z")
	await wait_for_named("shim_select_menu")
	await get_tree().create_timer(0.3).timeout
	var cast := game.dialogs.active as SpellsScreen
	expect(cast != null and cast.mode == "cast", "Z shows the spells to cast from")
	await screenshot("cast-choose")
	var bolt: Control = cast.find_child("Spell_force_bolt", true, false) if cast else null
	expect(bolt != null, "force bolt has a card")
	if bolt:
		await click_control(bolt)
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("promptPurpose") == "prompt.direction" and e.get("lifecycle") == "opened", "direction prompt")
	await screenshot("cast-direction")
	await press(KEY_RIGHT)
	await wait_for_command_prompt()
	note("Pw %d -> %d" % [pw_before, game.state.status.energy()])
	expect(game.state.status.energy() < pw_before, "casting spent power")

	mark()
	await type_text("#")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("promptPurpose") == "prompt.extendedCommand" and e.get("lifecycle") == "opened", "extended command prompt")
	await screenshot("extended-palette")
	await type_text("enhance")
	await press(KEY_ENTER)
	await wait_for_named("shim_select_menu")
	await get_tree().process_frame
	await get_tree().create_timer(0.3).timeout
	var skills := game.dialogs.active as SkillsScreen
	expect(skills != null and skills.title_label.text == "Skills", "#enhance shows the skills screen")
	await screenshot("skills")
	await press(KEY_ESCAPE)
	await wait_for_command_prompt()
