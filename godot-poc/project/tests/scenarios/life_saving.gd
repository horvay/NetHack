extends Scenario
## Closing the window while the hero dies, and an amulet of life saving
## saves them (bridge fixture: the amulet worn, lava to the east):
##   - the close made during the death waits for the run to end;
##   - life saving cancels that ending, and the waiting close then saves the
##     run and quits, instead of staying armed for a later death.

const NAME := "LifeSaver"


func run() -> void:
	for save in app.session.catalog().saves():
		if save.name == NAME:
			DirAccess.remove_absolute(save.path)
	await start_fixture(NAME + "-Val-Hum-Fem-Law", "status/life-saving-lava")
	await press(KEY_ESCAPE)
	expect(game.state.inventory.any(func(i: Dictionary) -> bool: return ItemText.display_name(i).contains("life saving") and ItemText.is_worn(i)), "the amulet of life saving is worn")
	await screenshot("before-the-lava")

	var quit_calls := [0]
	app.quit_handler = func() -> void: quit_calls[0] += 1
	# Close the window the moment the death begins (as a player would on
	# "You die...").
	var closes := [0]
	var close_now := func() -> void:
		closes[0] += 1
		app.request_quit()
	game.state.ending_started.connect(close_now, CONNECT_ONE_SHOT)
	var survived := [false]
	game.state.ending_cancelled.connect(func() -> void: survived[0] = true, CONNECT_ONE_SHOT)
	mark()
	# NetHack won't walk into known lava without the m prefix.
	await type_text("m")
	await press(KEY_RIGHT)
	var deadline := Time.get_ticks_msec() + 15000
	while ended_results.is_empty() and Time.get_ticks_msec() < deadline:
		var request := game.state.request if is_instance_valid(game) else {}
		if str(request.get("kind", "")) == "yn" and str(request.get("query", "")).to_lower().contains("lava"):
			await type_text("y")
		await get_tree().process_frame
	var ended: Dictionary = ended_results.pop_front() if not ended_results.is_empty() else {}
	note("ended: %s" % [ended])
	expect(closes[0] == 1, "the window was closed during the death")
	expect(survived[0], "the amulet saved the hero")
	expect(ended.get("reason") == "exit", "the waiting close saved the run once the hero lived (%s)" % [ended])
	expect(quit_calls[0] == 1, "and then quit")
	expect(app.session.catalog().saves().any(func(s: Dictionary) -> bool: return s.name == NAME), "the save exists")
	expect(not app.has_node("EndScreen"), "no death screen for a hero who lived")
	if app.has_node("EndScreen"):
		await screenshot("unexpected-end-screen")
		app.get_node("EndScreen").queue_free()
	for save in app.session.catalog().saves():
		if save.name == NAME:
			DirAccess.remove_absolute(save.path)
