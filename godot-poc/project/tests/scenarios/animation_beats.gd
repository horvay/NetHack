extends Scenario
## NetHack's animation beats replayed: a thrown dagger visibly flies (its art
## appears on the cells between hero and landing spot), and click-to-travel
## walks the hero through every step instead of blinking to the end.


func run() -> void:
	await start_game("Brunhild-Val-Hum-Fem-Law", "1001")
	await press(KEY_ESCAPE)
	var frames_seen := []
	game.state.animation_ready.connect(func(frames: Array) -> void: frames_seen.append(frames))

	# Throw the dagger north with classic keys: t, b, k.
	mark()
	await type_text("t")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("throw"), "throw question")
	var dagger := ""
	for item in game.state.inventory:
		if ItemText.display_name(item).to_lower().contains("dagger"):
			dagger = char(int(item.get("selector", 0)))
	await type_text(dagger)
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("promptPurpose") == "prompt.direction", "direction prompt")
	await type_text("h")
	while frames_seen.is_empty():
		await get_tree().process_frame
	await get_tree().create_timer(0.03).timeout
	await RenderingServer.frame_post_draw
	_save_now("dagger-in-flight")
	var objects_in_flight := 0
	for frame in frames_seen[0]:
		for index in frame.cells:
			if str(frame.cells[index].get("semanticKind", "")) == "object":
				objects_in_flight += 1
	note("beats: %d, object cells drawn in flight: %d" % [frames_seen[0].size(), objects_in_flight])
	expect(frames_seen[0].size() >= 2, "the throw arrived as several beats")
	expect(objects_in_flight >= 2, "the dagger was drawn along its path")
	await wait_for_command_prompt()

	# Travel across the room: the hero sprite passes through the middle.
	frames_seen.clear()
	var start := game.state.map.hero
	var target := Vector2i(-1, -1)
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			var c := Vector2i(x, y)
			if Terrain.classify(game.state.map.cell(c)).kind == Terrain.Kind.FLOOR and game.state.map.cell(c).has("cmapIndex") and absi(x - start.x) >= 6 and y == start.y:
				target = c
	expect(target.x >= 0, "found a far floor square in the same row")
	mark()
	await click_cell(target)
	while frames_seen.is_empty():
		await get_tree().process_frame
	await get_tree().create_timer(0.12).timeout
	var hero_node := game.world.actors.hero_node()
	var mid := hero_node.position / 32.0
	await RenderingServer.frame_post_draw
	_save_now("travel-mid-walk")
	note("hero sprite mid-walk at %s (from %s to %s)" % [mid, start, target])
	expect(absf(mid.x - (target.x + 0.5)) > 0.6, "the hero is still walking, not blinked to the end")
	await wait_for_command_prompt()
	await screenshot("travel-arrived")
	expect(game.state.map.hero == target, "travel arrived")

	# Reduced motion: no replay at all; the hero is simply where NetHack put it.
	App.instance.settings.reduced_motion = true
	frames_seen.clear()
	mark()
	await click_cell(start)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.1).timeout
	var at := game.world.actors.hero_node().position / 32.0
	note("reduced motion: hero sprite at %s, hero %s" % [at, game.state.map.hero])
	expect(absf(at.x - (game.state.map.hero.x + 0.5)) < 0.05, "with reduced motion the hero doesn't walk the path")
	App.instance.settings.reduced_motion = false


func _save_now(label: String) -> void:
	var image := get_viewport().get_texture().get_image()
	var path := output_dir.path_join("%02d-%s.png" % [screenshots.size() + 1, label])
	image.save_png(path)
	screenshots.append(path)
	note("screenshot " + path)
