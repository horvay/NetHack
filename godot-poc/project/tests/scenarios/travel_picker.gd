extends Scenario
## _ travel offers the places the hero knows on this level as chips beside
## "Travel where?": the hero steps off the up stairs, presses _, and the
## "Up stairs" chip travels back there.


func run() -> void:
	await start_game("Probe-Val-Hum-Fem-Law", "777")
	await press(KEY_ESCAPE)
	var stairs := game.state.map.hero
	for i in 2:
		game.send_keys("l")
		await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	expect(game.state.map.hero != stairs, "the hero stepped off the stairs (%s → %s)" % [stairs, game.state.map.hero])
	mark()
	await type_text("_")
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not (game.dialogs.banner.visible and game.dialogs.banner_label.text.begins_with("Travel where")):
		await get_tree().process_frame
	await get_tree().create_timer(0.4).timeout
	var chips: Array = game.dialogs.banner_chips.get_children().filter(func(c: Node) -> bool: return c is Button and not c.is_queued_for_deletion())
	note("chips: %s" % [chips.map(func(c: Button) -> String: return c.text)])
	var up: Array = chips.filter(func(c: Button) -> bool: return c.text == "Up stairs")
	if not expect(not up.is_empty(), "an Up stairs chip"):
		return
	await screenshot("travel-where")
	await click_control(up[0])
	await wait_for_command_prompt()
	deadline = Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and game.state.map.hero != stairs:
		await get_tree().process_frame
	expect(game.state.map.hero == stairs, "the chip travels back to the stairs (%s)" % game.state.map.hero)
	await screenshot("back-on-stairs")
