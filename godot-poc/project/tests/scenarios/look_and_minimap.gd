extends Scenario
## Looking and navigating with the mouse:
##   ; then click the kitten: NetHack's farlook names it;
##   hover the kitten: the inspector card describes it;
##   right-click the kitten: the context menu offers pet actions;
##   click the minimap: the hero travels there.


func run() -> void:
	await start_game("Brunhild-Val-Hum-Fem-Law", "1001")
	await press(KEY_ESCAPE)
	var pet := _pet_cell()
	expect(pet.x >= 0, "the kitten is on the map")

	await hover_cell(pet)
	await screenshot("hover-pet")
	expect(game.hud.inspector.visible and game.hud.inspector.title.text.to_lower().contains("kitten"), "hover card names the kitten: %s" % game.hud.inspector.title.text)

	mark()
	await type_text(";")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("promptPurpose") == "prompt.mapTarget" and e.get("lifecycle") == "opened", "map target prompt")
	await screenshot("look-target")
	expect(game.world.reticle.visible, "a reticle shows while NetHack asks for a position")
	pet = _pet_cell()
	await click_cell(pet)
	var described := await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("text", "")).to_lower().contains("kitten"), "farlook result naming the kitten")
	expect(not described.is_empty(), "farlook describes the kitten")
	await wait_for_command_prompt()
	await screenshot("look-result")

	pet = _pet_cell()
	await click_cell(pet, MOUSE_BUTTON_RIGHT)
	var menu := game.dialogs.active as ContextMenu
	expect(menu != null, "right-click opens the context menu")
	await screenshot("pet-context-menu")
	if menu:
		# Keyboard: the arrows move between the actions and Enter runs the
		# highlighted one (round-4 L3).
		for i in 4:
			await get_tree().process_frame
		var labels: Array = menu._buttons.map(func(b: Button) -> String: return b.text.replace("\n", " "))
		note("pet actions: %s" % [labels])
		expect(labels.any(func(t: String) -> bool: return t.contains("Kick it")), "any neighbouring square can be kicked, a pet too (with a warning)")
		if menu._buttons.size() >= 2:
			await press(KEY_DOWN)
			expect(get_viewport().gui_get_focus_owner() == menu._buttons[1], "Down moves to the second action")
			await press(KEY_UP)
		var first: Button = menu._buttons[0]
		expect(get_viewport().gui_get_focus_owner() == first, "the first action is highlighted")
		mark()
		var since := events.size()
		await press(KEY_ENTER, 13)
		await get_tree().process_frame
		expect(not is_instance_valid(menu) or menu.is_queued_for_deletion(), "Enter ran the highlighted action (%s)" % labels[0])
		expect(events.size() > since, "and it reached NetHack")
		for i in 3:
			await get_tree().create_timer(0.3).timeout
			if game.state.is_waiting_for_command():
				break
			await press(KEY_ESCAPE)
		await wait_for_command_prompt()

	var start := game.state.map.hero
	var target := Vector2i(-1, -1)
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			var cell := Vector2i(x, y)
			if Terrain.classify(game.state.map.cell(cell)).kind == Terrain.Kind.FLOOR and maxi(absi(x - start.x), absi(y - start.y)) >= 4 and game.state.map.cell(cell).has("cmapIndex"):
				target = cell
	expect(target.x >= 0, "found a far floor square on the minimap")
	var canvas := game.hud.minimap._canvas
	# A minimap click on or next to the hero does nothing (the cells are
	# too small to aim a single step there; it would only steal a turn).
	var near := game.state.map.hero + Vector2i(1, 0)
	var since := events.size()
	await click_at(canvas.get_global_rect().position + game.hud.minimap.local_of_cell(near))
	await get_tree().create_timer(0.3).timeout
	expect(events_named("bridge_map_click_accepted", since).is_empty() and game.state.map.hero == start, "a minimap click next to the hero is ignored")
	mark()
	await click_at(canvas.get_global_rect().position + game.hud.minimap.local_of_cell(target))
	await wait_for_named("bridge_map_click_accepted")
	await wait_for_command_prompt()
	note("minimap travel %s -> %s (target %s)" % [start, game.state.map.hero, target])
	expect(game.state.map.hero != start, "minimap click moved the hero")
	await screenshot("after-minimap-travel")


func _pet_cell() -> Vector2i:
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			var cell := game.state.map.cell(Vector2i(x, y))
			if int(cell.get("glyphFlags", 0)) & 0x10:
				return Vector2i(x, y)
	return Vector2i(-1, -1)
