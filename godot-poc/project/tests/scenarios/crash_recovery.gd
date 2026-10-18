extends Scenario
## Crashed runs on the title screen. A real checkpoint is made by copying
## the lock set of a running game that has changed level (NetHack writes
## level files then), owned by a dead process: the one thing a test can't
## do for real is crash the app.
##   1. the title names the hero and when the run crashed;
##   2. "Crashed runs" lists every checkpoint; Discard (confirmed) deletes one;
##   3. Recover runs NetHack's recover, and Continue brings the hero back
##      on the level they were on.
## expected-error: ConfigFile parse error at user://settings.cfg

const NAME := "Crashy"
const DEAD_PID := 999999


func run() -> void:
	await start_fixture(NAME + "-Val-Hum-Fem-Law", "stairs/down-on-hero")
	await press(KEY_ESCAPE)
	await type_text(">")
	await wait_for_command_prompt()
	expect(game.state.map.depth == 2, "went down to depth 2")
	var catalog := session.catalog()
	var own := ""
	var sets := catalog.lock_sets()
	for base in sets:
		if int(sets[base].pid) == OS.get_process_id():
			own = base
	if not expect(own != "" and not (sets[own].levels as Array).is_empty(), "the running game has level files (%s)" % [sets]):
		return
	# Keep two copies aside while the game runs (its own lock set goes when
	# it ends), then put them under the letters NetHack's lock code uses.
	for copy in ["keepA", "keepB"]:
		for level in [0] + (sets[own].levels as Array):
			DirAccess.copy_absolute(catalog.playground.path_join("%s.%d" % [own, level]), catalog.playground.path_join("%s.%d" % [copy, level]))
	var levels: Array = [0] + (sets[own].levels as Array)
	session.stop_game()
	await wait_for_game_end(10.0)
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	for pair in [["keepA", "alock"], ["keepB", "block"]]:
		for level in levels:
			DirAccess.rename_absolute(catalog.playground.path_join("%s.%d" % [pair[0], level]), catalog.playground.path_join("%s.%d" % [pair[1], level]))
		var file := FileAccess.open(catalog.playground.path_join(pair[1] + ".0"), FileAccess.READ_WRITE)
		file.store_32(DEAD_PID)
		file.close()
	# Another game starts first. NetHack's lock code reaps old sets under
	# its own names (alock, block...); the checkpoints must survive it.
	# NetHack reaps a lock older than three days whatever its owner: age
	# the checkpoints past that, as a crash left over the weekend would be.
	for base in ["alock", "block"]:
		OS.execute("touch", ["-d", "4 days ago", catalog.playground.path_join(base + ".0")])
	# (This game also tries Settings > Space waits a turn, switched on from
	# the title's Settings card.)
	app.show_title()
	await get_tree().create_timer(0.4).timeout
	await click_control(_title_button("Settings"))
	await get_tree().create_timer(0.4).timeout
	var settings_card := _top_card()
	var space_switch: CheckButton = null
	for row in settings_card.find_children("*", "HBoxContainer", true, false):
		if row.get_child_count() > 1 and row.get_child(0) is Label and (row.get_child(0) as Label).text == "Space waits a turn":
			space_switch = row.get_child(1)
	if expect(space_switch != null, "Settings has the Space waits a turn switch"):
		await click_control(space_switch)
		expect(app.settings.rest_on_space, "clicking it switches Space waits a turn on")
	# Extra NetHack options (this front end reads no ~/.nethackrc): no pet.
	var extra_field: LineEdit = null
	for node in settings_card.find_children("*", "LineEdit", true, false):
		extra_field = node
	if expect(extra_field != null, "Settings has the Extra NetHack options field"):
		await click_control(extra_field)
		await type_text("pettype:none")
		expect(app.settings.extra_options == "pettype:none", "typing sets the extra options (%s)" % app.settings.extra_options)
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.3).timeout
	await start_game("Other-Val-Hum-Fem-Law", "5150")
	await press(KEY_ESCAPE)
	var turn_before := game.state.status.number(StatusModel.Field.TIME)
	mark()
	await press(KEY_SPACE, 32)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.2).timeout
	expect(game.state.status.number(StatusModel.Field.TIME) > turn_before, "with Space waits a turn, Space rested (T %d -> %d)" % [turn_before, game.state.status.number(StatusModel.Field.TIME)])
	var pets := 0
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			if int(game.state.map.cell(Vector2i(x, y)).get("glyphFlags", 0)) & 0x10:
				pets += 1
	expect(pets == 0, "Extra options pettype:none reached NetHack: no pet (%d)" % pets)
	app.settings.extra_options = ""
	app.settings.rest_on_space = false
	session.stop_game()
	await wait_for_game_end(10.0)
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	expect(catalog.checkpoints().size() == 2, "both checkpoints survived another game starting (%d)" % catalog.checkpoints().size())

	app.show_title()
	await get_tree().create_timer(0.5).timeout
	var recover := _title_button("Recover " + NAME)
	expect(recover != null, "the title offers Recover %s (%s)" % [NAME, _title_texts()])
	expect(_title_button("Crashed runs") != null, "and Crashed runs")
	await screenshot("title-with-crash")

	# Discard one of the two from the list.
	await click_control(_title_button("Crashed runs"))
	await get_tree().create_timer(0.3).timeout
	var card := _top_card()
	await screenshot("crashed-runs")
	var discard: Button = null
	for node in card.find_children("*", "Button", true, false):
		if (node as Button).text == "Discard":
			discard = node
			break
	if expect(discard != null, "each crashed run can be discarded"):
		await click_control(discard)
		await get_tree().create_timer(0.3).timeout
		var confirm := _top_card()
		expect(confirm is ConfirmDialog, "discarding asks first")
		for node in confirm.find_children("*", "Button", true, false):
			if (node as Button).text == "Discard":
				await click_control(node)
				break
		await get_tree().create_timer(0.4).timeout
		expect(catalog.checkpoints().size() == 1, "one checkpoint left after discarding (%d)" % catalog.checkpoints().size())

	# A newer save of the same hero: recover must not replace it unasked.
	var quit_calls := [0]
	app.quit_handler = func() -> void: quit_calls[0] += 1
	await start_game(NAME + "-Wiz-Elf-Mal-Cha", "777")
	await press(KEY_ESCAPE)
	app.request_quit()
	var deadline := Time.get_ticks_msec() + 20000
	while ended_results.is_empty() and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	ended_results.clear()
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	expect(catalog.saves().any(func(sv: Dictionary) -> bool: return sv.name == NAME), "%s has a newer save" % NAME)
	app.show_title()
	await get_tree().create_timer(0.5).timeout

	# Recover the other and continue it.
	recover = _title_button("Recover " + NAME)
	if expect(recover != null, "still one run to recover"):
		await click_control(recover)
		await get_tree().create_timer(0.3).timeout
		var replace := _top_card()
		expect(replace is ConfirmDialog, "recovering over a newer save asks first")
		await screenshot("replace-save-question")
		await press(KEY_ESCAPE)
		await get_tree().create_timer(0.3).timeout
		expect(catalog.checkpoints().size() == 1, "Esc kept the checkpoint")
		# A recovery that fails must not cost the newer save: make the
		# checkpoint unreadable, choose Recover anyway, and look.
		var level0: String = catalog.playground.path_join(str(catalog.checkpoints()[0].base) + ".0")
		OS.execute("chmod", ["000", level0])
		await click_control(_title_button("Recover " + NAME))
		await get_tree().create_timer(0.3).timeout
		for node in _top_card().find_children("*", "Button", true, false):
			if (node as Button).text == "Recover anyway":
				await click_control(node)
				break
		await get_tree().create_timer(1.0).timeout
		note("failed recovery: %s" % app.title.status_label.text)
		expect(app.title.status_label.text.contains("unchanged") and catalog.saves().any(func(sv: Dictionary) -> bool: return sv.name == NAME), "a failed recovery leaves the newer save listed")
		OS.execute("chmod", ["644", level0])
		app.show_title()
		await get_tree().create_timer(0.4).timeout
		await click_control(_title_button("Recover " + NAME))
		await get_tree().create_timer(0.3).timeout
		for node in _top_card().find_children("*", "Button", true, false):
			if (node as Button).text == "Recover anyway":
				await click_control(node)
				break
		await get_tree().create_timer(1.0).timeout
		expect(app.title.status_label.text.begins_with("Recovered"), "recovered (%s)" % app.title.status_label.text)
		expect(catalog.saves().filter(func(sv: Dictionary) -> bool: return sv.name == NAME).size() == 1, "one save of %s after recovering (the older one set aside)" % NAME)
		var resume := _title_button("Continue")
		if expect(resume != null, "Continue is offered for the recovered hero (%s)" % [_title_texts()]):
			await screenshot("recovered")
			mark()
			await click_control(resume)
			game = app.game
			await wait_for_command_prompt(20.0)
			expect(game.state.map.depth == 2, "the recovered hero is back on depth 2 (%d)" % game.state.map.depth)
			await screenshot("resumed")
	for save in catalog.saves():
		if save.name == NAME:
			DirAccess.remove_absolute(save.path)

	# A settings file that can't be read: the defaults are used, and the
	# title screen says so. (The test runs in its own user directory.)
	var garbage := FileAccess.open(Settings.PATH, FileAccess.WRITE)
	garbage.store_string("[display\nthis is = = not a config")
	garbage.close()
	app.settings = Settings.load_or_default()
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	if is_instance_valid(app.game):
		session.stop_game()
		await wait_for_game_end(10.0)
		if app.has_node("EndScreen"):
			app.get_node("EndScreen").queue_free()
	app.show_title()
	await get_tree().create_timer(0.4).timeout
	expect(app.title.status_label.text.contains("couldn't be read"), "the title says the settings couldn't be read (%s)" % app.title.status_label.text)
	await screenshot("settings-unreadable")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Settings.PATH))


func _title_buttons() -> Array:
	if not is_instance_valid(app.title) or not app.title is TitleScreen:
		return []
	return app.title.menu.get_children().filter(func(c: Node) -> bool: return c is Button and not c.is_queued_for_deletion())


func _title_texts() -> Array:
	return _title_buttons().map(func(b: Button) -> String: return b.text)


func _title_button(prefix: String) -> Button:
	for button in _title_buttons():
		if (button as Button).text.begins_with(prefix):
			return button
	return null


func _top_card() -> Control:
	var children: Array = app.title.root.get_children().filter(func(c: Node) -> bool: return c is ModalCard and not c.is_queued_for_deletion())
	return children[-1] if not children.is_empty() else null
