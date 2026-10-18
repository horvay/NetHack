extends Scenario
## Whatever is on a square is drawn the same with or without the hero on it
## (bridge fixture: the hero standing in an open door in a horizontal wall,
## an empty doorway two squares east). NetHack sends the hero as the top
## glyph there and the door as the background: the door art must still be
## drawn under her. Likewise a sleeping newt in a known pit: the pit is drawn
## under it.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "door/hero-in-open-door")
	await press(KEY_ESCAPE)
	game.world.set_zoom_index(WorldView.ZOOMS.size() - 1)
	await settle_camera()
	await get_tree().create_timer(2.5).timeout
	var hero := game.state.map.hero
	var cell := game.state.map.cell(hero)
	var info := Terrain.classify(cell)
	note("hero cell: background %s / %s -> kind %d" % [cell.get("backgroundSemanticName", ""), cell.get("backgroundGlyph", ""), info.kind])
	expect(info.kind == Terrain.Kind.DOOR_OPEN, "the hero's square is known to be an open door (%d)" % info.kind)
	var layer: TerrainLayer = game.world.terrain
	expect(layer._feature_asset(hero, info) == "open-horizontal-door", "the open-door art is drawn under her (%s)" % layer._feature_asset(hero, info))
	var pit_pos := hero + Vector2i(-2, 1)
	var pit_cell := game.state.map.cell(pit_pos)
	var pit_info := Terrain.classify(pit_cell)
	note("newt's square: %s -> cmap %d" % [pit_cell.get("backgroundSemanticName", ""), pit_info.cmap])
	expect(pit_info.cmap >= 49 and pit_info.cmap <= 73, "the pit under the newt is known as a trap (%d)" % pit_info.cmap)
	await screenshot("hero-in-open-door")
	# Step off (down), then look at the empty door.
	await press(KEY_DOWN)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.4).timeout
	var door_cell := game.state.map.cell(hero)
	var door_info := Terrain.classify(door_cell)
	expect(layer._feature_asset(hero, door_info) == "open-horizontal-door", "the same art once she steps off (%s)" % layer._feature_asset(hero, door_info))
	await screenshot("open-door-empty")
