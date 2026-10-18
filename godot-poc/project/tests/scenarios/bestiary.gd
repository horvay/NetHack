extends Scenario
## #vanquished is a bestiary (BestiaryScreen): fixture with two jackals, a
## newt and a sewer rat around the hero, each at 1 HP, the hero at 300 HP so
## the fight is never close; once they fall,
## #vanquished shows a card per species with its tile, "×2" on the jackals,
## and NetHack's total; any key closes it.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "monster/vanquish-four")
	await press(KEY_ESCAPE)
	for delta in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, -1), Vector2i(0, 1)]:
		for i in 12:
			var there: Vector2i = game.state.map.hero + delta
			if not game.state.map.actors().values().has(there) and i > 0:
				break
			mark()
			game.send_keys(game.state.direction_key(delta))
			await wait_for_command_prompt(10.0)
	await get_tree().create_timer(0.4).timeout
	mark()
	game.send_keys("#vanquished\n")
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is BestiaryScreen:
		await get_tree().process_frame
	var beasts := game.dialogs.active as BestiaryScreen
	if not expect(beasts != null, "#vanquished opens the bestiary (%s)" % game.dialogs.active):
		return
	await get_tree().create_timer(0.5).timeout
	var entries: Array = []
	for g in beasts.groups:
		entries.append_array(g.entries)
	note("vanquished: %s  ·  %s" % [entries, beasts.total_line])
	expect(entries.size() >= 3, "a card per species (%d)" % entries.size())
	var resolver := TileResolver.shared()
	expect(entries.all(func(e: Dictionary) -> bool: return resolver.has_asset(resolver.asset_for_semantic_name(str(e.monster), "monster"))), "every species has its tile")
	var jackals: Array = entries.filter(func(e: Dictionary) -> bool: return str(e.monster) == "jackal")
	expect(not jackals.is_empty() and int(jackals[0].count) == 2, "the jackals count twice (%s)" % [jackals])
	expect(beasts.total_line.contains("creatures vanquished"), "NetHack's total is kept (%s)" % beasts.total_line)
	await screenshot("bestiary")
	await press(KEY_SPACE, 32)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	expect(not game.dialogs.active is BestiaryScreen, "any key closes it")
