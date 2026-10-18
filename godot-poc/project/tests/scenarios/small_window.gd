extends Scenario
## A 1280x720 window: the HUD, the action bar and the big panels must all
## fit on screen (stretch mode canvas_items keeps the 1920x1080 layout and
## scales it down), and the game stays playable with the keyboard.


func run() -> void:
	get_window().size = Vector2i(1280, 720)
	for i in 10:
		await get_tree().process_frame
	await start_game("Brunhild-Val-Hum-Fem-Law", "1001")
	await press(KEY_ESCAPE)
	var view := get_viewport().get_visible_rect()
	note("window %s, layout %s" % [get_window().size, view.size])
	# Body text (18 px in the layout) must stay readable on screen.
	var scale := get_window().size.y / view.size.y
	note("effective UI scale %.2f: body text %.1f px" % [scale, 18.0 * scale])
	expect(18.0 * scale >= 14.0, "body text is at least 14 px on screen (%.1f)" % (18.0 * scale))
	_fits(game.hud.action_bar, "the action bar")
	_fits(game.hud.hero_card, "the hero card")
	_fits(game.hud.minimap, "the minimap")
	await screenshot("playing")
	var start := game.state.map.hero
	await press(KEY_LEFT)
	await wait_for_command_prompt()
	expect(game.state.map.hero != start, "arrow keys still move the hero")

	for panel in ["inventory", "equipment", "help", "history", "settings"]:
		game.input_router.open_ui(panel)
		for i in 6:
			await get_tree().process_frame
		var active: Control = game.dialogs.active
		var card: Control = active.get("card") if active.get("card") is Control else active.get("_card") if active.get("_card") is Control else active
		_fits(card, panel)
		await screenshot(panel, 0.3)
		await press(KEY_ESCAPE)
		for i in 4:
			await get_tree().process_frame
	# F11 switches fullscreen (NetHack has no F11) and saves the choice.
	await press(KEY_F11)
	await get_tree().create_timer(0.3).timeout
	expect(app.settings.fullscreen and get_window().mode == Window.MODE_FULLSCREEN, "F11 goes fullscreen (mode %d)" % get_window().mode)
	await press(KEY_F11)
	await get_tree().create_timer(0.3).timeout
	expect(not app.settings.fullscreen and get_window().mode != Window.MODE_FULLSCREEN, "F11 again goes back to a window")
	expect(get_window().min_size == Vector2i(1280, 720), "the window can't shrink below 1280x720")
	get_window().size = Vector2i(1920, 1080)


func _fits(control: Control, what: String) -> void:
	var view := get_viewport().get_visible_rect().grow(1)
	var rect := control.get_global_rect()
	expect(view.encloses(rect), "%s fits on screen (%s in %s)" % [what, rect, view])
