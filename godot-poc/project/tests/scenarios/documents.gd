extends Scenario
## NetHack's documents get screens of their own:
##   1. ^X (attributes) is a character sheet: portrait, NetHack's identity
##      line, basics tiles, the six characteristics as bars, the other
##      sections as cards; any key closes it;
##   2. \\ (discoveries) is a codex: a tab per class, a card per discovery
##      with its art, name and appearance; a Valkyrie knows her weapons from
##      the start ("runed dagger" is the elven dagger);
##   3. ^O (overview) is a dungeon map with "You are here";
##   4. #conduct shows medals, #chronicle a timeline.


func run() -> void:
	await start_game("Probe-Val-Hum-Fem-Law", "777")
	await press(KEY_ESCAPE)
	mark()
	await press(KEY_X, 0, false, true)
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is CharacterSheet:
		await get_tree().process_frame
	var sheet := game.dialogs.active as CharacterSheet
	if not expect(sheet != null, "^X opens the character sheet (%s)" % game.dialogs.active):
		return
	await get_tree().create_timer(0.5).timeout
	note("identity: %s" % sheet.subtitle_label.text)
	expect(sheet.subtitle_label.text.contains("Valkyrie"), "it opens with NetHack's identity line (%s)" % sheet.subtitle_label.text)
	var stats := 0
	for stat in CharacterSheet.STAT_ORDER:
		if sheet.find_child("Stat_%s" % stat, true, false):
			stats += 1
	expect(stats == 6, "the six characteristics are bars (%d)" % stats)
	expect(sheet.sections.any(func(s: Dictionary) -> bool: return str(s.heading) == "Status"), "the Status section is kept")
	await screenshot("character-sheet")
	await press(KEY_SPACE, 32)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	expect(not game.dialogs.active is CharacterSheet, "any key closes it")

	mark()
	await press(KEY_BACKSLASH, 92)
	deadline = Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is CodexScreen:
		await get_tree().process_frame
	var codex := game.dialogs.active as CodexScreen
	if not expect(codex != null, "\\ opens the discoveries codex (%s)" % game.dialogs.active):
		return
	await get_tree().create_timer(0.5).timeout
	var weapons: Array = codex.groups.filter(func(g: Dictionary) -> bool: return str(g.heading) == "Weapons")
	expect(not weapons.is_empty() and (weapons[0].entries as Array).size() > 5, "a Weapons tab with the Valkyrie's known weapons")
	var dagger: Control = codex.find_child("Disc_elven_dagger", true, false)
	expect(dagger != null and str((dagger.get_meta("entry") as Dictionary).appearance) == "runed dagger" and bool((dagger.get_meta("entry") as Dictionary).preknown), "the elven dagger card says runed dagger, known from the start")
	await screenshot("discoveries")
	await press(KEY_RIGHT)
	await get_tree().create_timer(0.3).timeout
	await screenshot("discoveries-next-tab")
	await press(KEY_ESCAPE)
	await wait_for_command_prompt()

	for spec in [["overview", KEY_O, "OverviewScreen"], ["conduct", 0, "conduct"], ["chronicle", 0, "chronicle"]]:
		mark()
		if spec[1] != 0:
			await press(spec[1], 0, false, true)
		else:
			game.send_keys("#%s\n" % spec[0])
		deadline = Time.get_ticks_msec() + 6000
		while Time.get_ticks_msec() < deadline and not (game.dialogs.active is OverviewScreen or game.dialogs.active is RecordScreen):
			await get_tree().process_frame
		await get_tree().create_timer(0.4).timeout
		var active := game.dialogs.active
		if spec[0] == "overview":
			var here: Control = null
			if active is OverviewScreen:
				for b in (active as OverviewScreen).branches:
					for l in b.levels:
						if l.here:
							here = active.find_child("Level_%d" % int(l.depth), true, false)
			expect(active is OverviewScreen and here != null, "^O shows the dungeon overview with You are here (%s)" % active)
		else:
			expect(active is RecordScreen and (active as RecordScreen).kind == spec[2] and not (active as RecordScreen).entries.is_empty(), "#%s has its own screen with entries (%s)" % [spec[0], active])
		await screenshot(spec[0])
		await press(KEY_ESCAPE)
		await get_tree().create_timer(0.3).timeout
		if not game.state.is_waiting_for_command():
			await press(KEY_ESCAPE)
		await wait_for_command_prompt()
