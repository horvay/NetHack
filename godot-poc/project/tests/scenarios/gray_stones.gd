extends Scenario
## Unidentified gray stones (bridge fixture: flint, a touchstone, a luckstone
## and a loadstone, none identified). The bridge withholds their glyphs, which
## would tell them apart; they must still show art, the same dull gray stone
## for all four, in the pack, in the detail panel and on the floor.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "object/gray-stone-public-rub-candidates")
	await press(KEY_ESCAPE)
	var stones: Array = game.state.inventory.filter(func(i: Dictionary) -> bool: return ItemText.display_name(i).contains("gray stone"))
	if not expect(stones.size() >= 2, "the pack holds gray stones (%d)" % stones.size()):
		return
	var resolver := TileResolver.shared()
	var want := "gray-stone"
	expect(resolver.has_asset(want), "the tileset has the gray-stone art")
	for stone in stones:
		expect(not stone.has("glyph"), "the bridge withholds the glyph of %s" % ItemText.display_name(stone))
		var icon := ItemText.icon(stone, game.state)
		expect(icon != null and icon == resolver.texture(want), "%s shows the %s art" % [ItemText.display_name(stone), want])

	await type_text("i")
	await get_tree().create_timer(0.4).timeout
	var inventory := game.dialogs.active as InventoryScreen
	if expect(inventory != null, "the inventory opens"):
		for slot in inventory._slots:
			if ItemText.display_name(slot.item).contains("gray stone"):
				await click_control(slot)
				break
		await get_tree().create_timer(0.3).timeout
		await screenshot("gray-stones-in-pack")
		await press(KEY_ESCAPE)
		await get_tree().create_timer(0.3).timeout

	# Drop one: the floor shows the same stone.
	var letter := char(int(stones[0].get("selector", 0)))
	mark()
	await type_text("d")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("drop"), "what to drop")
	await type_text(letter)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.4).timeout
	# Under the hero (NetHack doesn't redraw that square after a drop: the
	# pile snapshot says what lies there).
	var here := game.state.map.pile(game.state.map.hero)
	var asset := resolver.asset_for_cell(TerrainLayer.pile_item_cell(here[0])) if not here.is_empty() else ""
	note("under the hero: %s -> %s" % [here, asset])
	expect(asset == want, "the dropped stone shows the %s art under the hero (%s)" % [want, asset])
	await screenshot("gray-stone-under-hero")
	# And once the hero steps off it.
	var start := game.state.map.hero
	for key in [KEY_RIGHT, KEY_DOWN, KEY_UP, KEY_LEFT]:
		await press(key)
		await wait_for_command_prompt()
		if game.state.map.hero != start:
			break
	var floor_asset := resolver.asset_for_cell(game.state.map.cell(start))
	note("floor cell: %s -> %s" % [game.state.map.cell(start), floor_asset])
	expect(game.state.map.hero != start and floor_asset == want, "and on the floor once the hero steps off (%s)" % floor_asset)
	await screenshot("gray-stone-on-floor")
