extends Scenario
## Going deeper: an Archeologist applies her pick-axe downward and digs a
## hole to dungeon level 2 (level fade, banner, fresh fog of war), then runs
## around exploring with Shift+arrows.



func run() -> void:
	await start_game("Indy-Arc-Dwa-Mal-Law", "4242")
	await press(KEY_ESCAPE)
	await screenshot("level-1")
	var pick := ""
	for item in game.state.inventory:
		if ItemText.display_name(item).to_lower().contains("pick-axe"):
			pick = char(int(item.get("selector", 0)))
	expect(pick != "", "the Archeologist carries a pick-axe")
	# Heroes start on the up stairs, which cannot be dug through: step off.
	for key in [KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_UP]:
		var before := game.state.map.hero
		await press(key)
		await wait_for_command_prompt()
		if game.state.map.hero != before:
			break
	# Dig until the hero falls through; nearby fights interrupt digging, so
	# keep applying the pick-axe like a player would.
	# The arrival (fade and level banner) is captured the moment the level
	# changes, while it is still on screen.
	var arrival := {}
	game.state.level_changed.connect(func(_depth: int) -> void:
		if arrival.is_empty():
			arrival["pending"] = true
			await get_tree().create_timer(0.5).timeout
			await RenderingServer.frame_post_draw
			var path := output_dir.path_join("level-2-arrival.png")
			get_viewport().get_texture().get_image().save_png(path)
			arrival["banner"] = game.hud.level_banner.modulate.a
			arrival["path"] = path, CONNECT_ONE_SHOT)
	for attempt in 8:
		if game.state.map.depth >= 2:
			break
		mark()
		await type_text("a")
		await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("apply"), "apply prompt")
		await type_text(pick)
		await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("dig"), "dig direction prompt")
		if attempt == 0:
			await screenshot("dig-direction")
			# NetHack lists where digging works ("[>]" or "[yulnjbh>]"):
			# only those get chevrons and chips, and a click elsewhere is
			# refused with a notice instead of swinging at thin air.
			var query := str(game.state.request.get("query", ""))
			var offered := game.state.offered_directions(query)
			note("dig offers [%s]" % offered)
			expect(offered.contains(">"), "the dig prompt offers down")
			var chips: Array = game.dialogs.banner_chips.get_children().filter(func(b: Node) -> bool: return not b.is_queued_for_deletion()).map(func(b: Button) -> String: return b.text)
			note("banner chips: %s" % [chips])
			expect(not chips.any(func(t: String) -> bool: return t.begins_with("Up")), "no Up chip when digging up isn't offered")
			expect(game.dialogs.banner_label.text.contains("Works toward down"), "the banner names only the offered direction (%s)" % game.dialogs.banner_label.text)
			for dir in GameState.DIRECTION_ORDER:
				if offered != "" and not offered.contains(game.state.direction_key(dir)):
					var since := events.size()
					await click_cell(game.state.map.hero + dir)
					await get_tree().create_timer(0.2).timeout
					expect(events_named("bridge_command", since).is_empty() and game.state.request.get("kind") == "direction", "a click on a direction NetHack didn't offer sends nothing")
					await screenshot("dig-refused-click")
					break
		await type_text(">")
		await wait_for_command_prompt(30.0)
	while not arrival.has("path"):
		await get_tree().process_frame
	screenshots.append(arrival.path)
	note("screenshot %s (banner opacity %.2f)" % [arrival.path, arrival.banner])
	expect(float(arrival.banner) > 0.5, "the level banner shows on arrival")
	await screenshot("level-2", 2.0)
	expect(game.state.map.depth == 2, "dug through to dungeon level 2")
	for i in 14:
		var before := game.state.map.hero
		for key in [KEY_LEFT, KEY_UP, KEY_RIGHT, KEY_DOWN]:
			await press(key, 0, true)
			await wait_for_command_prompt(10.0)
			if game.state.map.hero != before:
				break
	await screenshot("level-2-explored")
	game.input_router.open_ui("overview")
	await screenshot("level-2-overview", 0.8)

	# The mouse wheel over the message feed scrolls back through recent
	# messages (no modal); a new message returns it to the newest.
	var feed := game.hud.feed
	var said := MessageFeed._groups(game.state.messages.recent(MessageFeed.BACK_LIMIT))
	note("%d message lines so far" % said.size())
	if expect(said.size() > MessageFeed.VISIBLE, "enough messages to scroll back"):
		var over := MessageFeed._text_rect(feed._lines[-1]).get_center()
		feed._idle = 0.0
		await _wheel(over, MOUSE_BUTTON_WHEEL_UP)
		await _wheel(over, MOUSE_BUTTON_WHEEL_UP)
		expect(feed.back == 2, "two wheel steps scroll the feed back two lines (%d)" % feed.back)
		var newest_shown := str(feed._lines[-1].get_meta("base", ""))
		expect(newest_shown == str(said[said.size() - 3][0].text), "the bottom line is now the third newest message")
		expect(not game.dialogs.owns_input(), "scrolling the feed opens no dialog")
		await screenshot("feed-scrolled-back")
		await _wheel(over, MOUSE_BUTTON_WHEEL_DOWN)
		await _wheel(over, MOUSE_BUTTON_WHEEL_DOWN)
		expect(feed.back == 0 and str(feed._lines[-1].get_meta("base", "")) == str(said[-1][0].text), "wheel down returns to the newest")
		# Only the words catch the mouse: to the right of a short line the
		# map gets the wheel and the click (no history panel pops up).
		var shortest: Label = feed._lines[0]
		for line in feed._lines:
			if line.text.length() < shortest.text.length():
				shortest = line
		var text_box: Rect2 = MessageFeed._text_rect(shortest)
		var beside := Vector2(text_box.end.x + 160, text_box.get_center().y)
		# A spot right of some line's words over an explored square, so a
		# click there really travels (zoomed out, the explored level reaches
		# under the feed).
		var zoom_was: int = game.world._zoom_index
		game.world.set_zoom_index(0)
		await settle_camera()
		for line in feed._lines:
			var words: Rect2 = MessageFeed._text_rect(line)
			var x := words.end.x + 40
			while x < line.get_global_rect().end.x - 10:
				var spot := Vector2(x, words.get_center().y)
				var cell := game.world.cell_at_screen(spot)
				if game.state.map.is_explored(cell) and Terrain.is_walkable(Terrain.classify(game.state.map.cell(cell)).kind) and cell != game.state.map.hero:
					beside = spot
					shortest = line
					break
				x += 16
			if game.state.map.is_explored(game.world.cell_at_screen(beside)):
				break
		note("shortest line '%s', clicking at %s" % [shortest.text, beside])
		if expect(not feed._over_text(beside) and shortest.get_global_rect().has_point(beside), "a point right of a short line, inside its strip"):
			var zoom_before: int = game.world._zoom_index
			await _wheel(beside, MOUSE_BUTTON_WHEEL_UP)
			expect(feed.back == 0 and game.world._zoom_index != zoom_before, "the wheel beside a short line zooms the map (%d -> %d)" % [zoom_before, game.world._zoom_index])
			await _wheel(beside, MOUSE_BUTTON_WHEEL_DOWN)
			await settle_camera()
			await settle_camera()
			var expected_cell := game.world.cell_at_screen(beside)
			var click_since := events.size()
			await click_at(beside)
			await get_tree().create_timer(0.3).timeout
			if game.state.map.is_explored(game.world.cell_at_screen(beside)):
				expect(not events_named("bridge_map_click_accepted", click_since).is_empty() or game.world.cell_at_screen(beside) == game.state.map.hero, "the click beside the line travelled on the map")
			else:
				note("no explored square beside the line; the click check is skipped")
			# (Within a cell: the camera may still ease by a fraction of a pixel.)
			var off: Vector2i = game.input_router._mouse_cell - expected_cell
			expect(absi(off.x) <= 1 and absi(off.y) <= 1, "the pointer beside the line reached the map (cell %s, expected %s)" % [game.input_router._mouse_cell, expected_cell])
			expect(not (game.dialogs.active is HistoryPanel and game.dialogs.owns_input()), "a click beside a short line opens no history panel")
			var until := Time.get_ticks_msec() + 10000
			while Time.get_ticks_msec() < until and not game.state.is_waiting_for_command():
				await get_tree().process_frame
		game.world.set_zoom_index(zoom_was)
		# A click on a line opens the full history.
		feed._idle = 0.0
		await click_at(MessageFeed._text_rect(feed._lines[-1]).get_center())
		await get_tree().create_timer(0.3).timeout
		expect(game.dialogs.active is HistoryPanel and game.dialogs.owns_input(), "clicking a feed line opens the message history")
		await screenshot("history-from-feed")
		await press(KEY_ESCAPE)


func _down_stairs() -> Vector2i:
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			var cell := game.state.map.cell(Vector2i(x, y))
			if cell.get("cmapIndex") != null and int(cell.get("cmapIndex", -1)) == 26:
				return Vector2i(x, y)
	return Vector2i(-1, -1)


func _wheel(at: Vector2, button: MouseButton) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = at
	motion.global_position = at
	Input.parse_input_event(motion)
	await get_tree().process_frame
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = button
		event.position = at
		event.global_position = at
		event.pressed = pressed
		event.factor = 1.0
		Input.parse_input_event(event)
		await get_tree().process_frame
