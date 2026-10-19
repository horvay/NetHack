extends Scenario
## Polymorph shows on the hero (real game from a bridge fixture): quaffing a
## potion of polymorph turns the hero into a monster; the map sprite, the HUD
## portrait and the character sheet show that monster, and the hero's own
## portrait comes back with their form.


func run() -> void:
	await start_fixture("Poly-Val-Hum-Fem-Law", "status/polymorph-potion")
	await press(KEY_ESCAPE)
	var resolver := TileResolver.shared()
	var own := resolver.player_avatar_id(game.state.character)
	expect(game.hud.portrait_asset == own, "the HUD shows the hero (%s)" % game.hud.portrait_asset)
	var form := ""
	for attempt in 3:
		await _quaff_polymorph()
		form = str(game.state.map.cell(game.state.map.hero).get("heroForm", ""))
		note("quaff %d: form '%s', HD %d" % [attempt, form, game.state.status.number(StatusModel.Field.HD)])
		if form != "":
			break
	if not expect(form != "", "a potion of polymorph turned the hero into a monster"):
		return
	var asset := resolver.asset_for_semantic_name(form, "monster")
	expect(asset != "" and asset != own, "%s has a tile (%s)" % [form, asset])
	expect(game.world.actors.actors.hero.asset == asset, "the map shows the hero as %s (%s)" % [form, game.world.actors.actors.hero.asset])
	expect(game.hud.portrait_asset == asset, "the HUD portrait is the %s (%s)" % [form, game.hud.portrait_asset])
	expect(game.hud._stat_labels["Lv"].text.begins_with("HD "), "the HUD shows hit dice (%s)" % game.hud._stat_labels["Lv"].text)
	await screenshot("polymorphed")
	mark()
	game.send_keys(char(24))  # ^X
	await get_tree().create_timer(1.0).timeout
	expect(game.dialogs.active is CharacterSheet, "^X opens the character sheet (%s)" % game.dialogs.active)
	await screenshot("character-sheet")
	for i in 3:
		if game.dialogs.owns_input():
			await press(KEY_ESCAPE)
			await get_tree().create_timer(0.2).timeout

	# Back in their own form (#monster isn't needed: wait out the polymorph).
	for i in 60:
		if game.state.map.cell(game.state.map.hero).get("heroForm", "") == "":
			break
		mark()
		game.send_keys("20s")
		await wait_for_command_prompt(10.0)
		for j in 3:
			if game.dialogs.owns_input():
				await press(KEY_ESCAPE)
				await get_tree().create_timer(0.2).timeout
	if expect(game.state.map.cell(game.state.map.hero).get("heroForm", "") == "", "the polymorph wore off (turn %s)" % game.state.status.text(StatusModel.Field.TIME)):
		expect(game.world.actors.actors.hero.asset == own and game.hud.portrait_asset == own, "the hero's own look is back (%s, %s)" % [game.world.actors.actors.hero.asset, game.hud.portrait_asset])
		expect(game.hud._stat_labels["Lv"].text == "Lv 1", "the HUD shows the experience level again (%s)" % game.hud._stat_labels["Lv"].text)
		await screenshot("own-form")


func _quaff_polymorph() -> void:
	var potion := ""
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("polymorph"):
			potion = char(int(item.selector))
	if potion == "":
		return
	mark()
	game.send_keys("q")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and e.get("name") != "bridge_command_prompt", "quaff question")
	game.send_keys(potion)
	for i in 4:
		await get_tree().create_timer(0.4).timeout
		if game.dialogs.owns_input():
			await press(KEY_ESCAPE)
	await wait_for_command_prompt(5.0)
	await get_tree().create_timer(0.5).timeout
