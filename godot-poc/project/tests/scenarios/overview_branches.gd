extends Scenario
## ^O with two branches (fixture: the hero at Mines' End): NetHack heads
## the Mines "The Gnomish Mines: levels N to M"; the overview shows a column
## per branch, each named, with "You are here" in the Mines.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "special/mines-end-overview")
	await press(KEY_ESCAPE)
	mark()
	await press(KEY_O, 0, false, true)
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is OverviewScreen:
		await get_tree().process_frame
	var overview := game.dialogs.active as OverviewScreen
	if not expect(overview != null, "^O opens the overview (%s)" % game.dialogs.active):
		await screenshot("no-overview")
		return
	await get_tree().create_timer(0.5).timeout
	var names: Array = overview.branches.map(func(b: Dictionary) -> String: return str(b.name))
	note("branches: %s" % [overview.branches.map(func(b: Dictionary) -> String: return "%s %s" % [b.name, (b.levels as Array).map(func(l: Dictionary) -> int: return int(l.depth))])])
	expect(names.has("The Gnomish Mines") and names.has("The Dungeons of Doom"), "a column per branch, each named (%s)" % [names])
	var mines: Array = overview.branches.filter(func(b: Dictionary) -> bool: return str(b.name) == "The Gnomish Mines")
	expect(not mines.is_empty() and (mines[0].levels as Array).any(func(l: Dictionary) -> bool: return bool(l.here)), "You are here is in the Mines")
	await screenshot("overview-branches")
	await press(KEY_ESCAPE)
	deadline = Time.get_ticks_msec() + 4000
	while Time.get_ticks_msec() < deadline and game.dialogs.active != null:
		await get_tree().process_frame
	await get_tree().create_timer(0.5).timeout
	expect(game.dialogs.active == null, "Esc closes it")
