extends Scenario
## The whole life of a run through the real UI: title screen, character
## creation (pick a Wizard by clicking), play, save and exit with S, the
## "your hero rests" screen, Continue from the title, then quit through
## #quit — NetHack's closing questions are answered by the chronicle and
## the end screen shows the disclosed possessions and conduct.

const NAME := "GodotLifeTest"


func run() -> void:
	_remove_old_save()
	app.show_title()
	await screenshot("title")
	app.show_character_creation()
	await get_tree().process_frame
	var creation := app.title as CharacterCreation
	expect(creation != null, "character creation opens")
	creation._pick("role", "Wiz")
	creation._pick("race", "Elf")
	creation.name_field.text = NAME
	creation.selection.name = NAME
	creation.seed_field.text = "4242"
	creation._refresh()
	await screenshot("creation-wizard")
	mark()
	creation._begin()
	game = app.game
	await wait_for_command_prompt()
	expect(game.state.character.get("role") == "Wiz", "began as a Wizard")
	await press(KEY_ESCAPE)
	for key in [KEY_RIGHT, KEY_DOWN]:
		await press(key)
		await wait_for_command_prompt()
	await screenshot("playing")

	# Save and exit with the classic S key.
	await type_text("S")
	var really := await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("query", "")).to_lower().contains("save"), "save confirmation")
	expect(not really.is_empty(), "NetHack asks to confirm saving")
	await screenshot("save-question")
	await type_text("y")
	var saved := await wait_for_game_end(20.0)
	expect(saved.get("reason") == "exit", "save ends the run cleanly")
	await screenshot("saved", 1.4)
	var end := app.get_node_or_null("EndScreen") as EndScreen
	expect(end != null and end.outcome == "saved", "end screen recognises a save, got %s" % (end.outcome if end else "none"))
	var saves := app.session.catalog().saves()
	expect(saves.any(func(s: Dictionary) -> bool: return s.name == NAME), "the save appears in the save catalog")
	end.queue_free()

	# Continue from the title screen.
	app.show_title()
	await screenshot("title-continue")
	mark()
	var save: Dictionary = saves.filter(func(s: Dictionary) -> bool: return s.name == NAME)[0]
	expect(save.character.get("role") == "Wiz", "save catalog reads the hero's role from the save: %s" % save.character)
	app.continue_game(save)
	game = app.game
	await wait_for_command_prompt()
	expect(game.state.messages.entries.any(func(e: Dictionary) -> bool: return str(e.text).to_lower().contains("welcome back")), "NetHack welcomes the hero back")
	await screenshot("continued")

	# Quit; the chronicle answers the closing questions.
	await type_text("#")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("promptPurpose") == "prompt.extendedCommand" and e.get("lifecycle") == "opened", "extended command prompt")
	await type_text("quit")
	await press(KEY_ENTER)
	await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("query", "")).contains("Really quit"), "quit confirmation")
	await type_text("y")
	var ended := await wait_for_game_end(30.0)
	expect(ended.get("reason") == "exit", "quit ends the run")
	await screenshot("quit-end", 1.6)
	end = app.get_node_or_null("EndScreen") as EndScreen
	expect(end != null and end.outcome == "quit", "end screen shows a quit")
	var chronicle: Dictionary = game.state.chronicle
	expect(chronicle.has("possessions") and not (chronicle.possessions as Array).is_empty(), "possessions were disclosed: %s" % [chronicle.keys()])
	expect(chronicle.has("conduct"), "conduct was disclosed")
	expect(end._record.has("points"), "the final score comes from NetHack's xlogfile record (%s)" % [end._record])
	var tab_names: Array = end._tabs.get_children().map(func(b: Button) -> String: return b.text)
	expect(tab_names.has("Full log") and not tab_names.has("Last moments"), "a quit shows the full log but no last moments: %s" % [tab_names])
	for button in end._tabs.get_children():
		if button.text == "Full log":
			await click_control(button)
	await screenshot("quit-full-log", 0.4)


func _remove_old_save() -> void:
	for save in app.session.catalog().saves():
		if save.name == NAME:
			DirAccess.remove_absolute(save.path)
