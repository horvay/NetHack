extends Scenario
## The regenerated art on the real map (bridge fixtures art/monsters-N and
## art/objects-N, made from the art audit's installed picks): sleeping,
## peaceful monsters and identified objects around the hero, zoomed in, for
## inspection by eye (ASSET_GENERATION.md: check new art in game). Each
## monster must resolve to the art named after it.

const FIXTURES := ["art/monsters-1", "art/monsters-2", "art/monsters-3", "art/monsters-4", "art/objects-1", "art/objects-2"]


func run() -> void:
	var first := true
	for fixture in FIXTURES:
		if not first:
			session.stop_game()
			await wait_for_game_end(10.0)
			if app.has_node("EndScreen"):
				app.get_node("EndScreen").queue_free()
		first = false
		await start_fixture("Brunhild-Val-Hum-Fem-Law", fixture)
		await press(KEY_ESCAPE)
		var resolver := TileResolver.shared()
		var hero := game.state.map.hero
		var wrong: Array = []
		var seen := 0
		for dy in range(-2, 3):
			for dx in range(-3, 4):
				var cell := game.state.map.cell(hero + Vector2i(dx, dy))
				var kind := str(cell.get("semanticKind", ""))
				if kind != "monster" and kind != "pet":
					continue
				seen += 1
				var name := str(cell.get("semanticName", "")).to_lower().replace(" ", "-")
				var asset := resolver.asset_for_cell(cell)
				if asset != name:
					wrong.append("%s->%s" % [name, asset])
		note("%s: %d monsters, wrong art: %s" % [fixture, seen, wrong])
		expect(wrong.is_empty(), "%s: every monster shows its own art (%s)" % [fixture, wrong])
		game.world.set_zoom_index(WorldView.ZOOMS.size() - 1)
		await settle_camera()
		# (After the level banner has faded.)
		await get_tree().create_timer(2.5).timeout
		await screenshot(fixture.replace("/", "-"), 0.2)
