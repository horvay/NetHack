extends Scenario
## Invisibility shows on the hero (real game from a bridge fixture): after a
## potion of invisibility NetHack draws the floor where the hero stands, so
## the map sprite and the HUD portrait turn ghostly instead; both come back
## when it wears off.


func run() -> void:
	await start_fixture("Ghost-Val-Hum-Fem-Law", "status/invisibility-potion")
	await press(KEY_ESCAPE)
	var hero: Dictionary = game.world.actors.actors.hero
	expect(not game.hud.portrait_invisible and hero.sprite.modulate.a > 0.9, "the hero starts visible (%.2f)" % hero.sprite.modulate.a)
	var potion := ""
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("invisibility"):
			potion = char(int(item.selector))
	mark()
	game.send_keys("q")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and e.get("name") != "bridge_command_prompt", "quaff question")
	game.send_keys(potion)
	await _settle()
	expect(game.state.map.cell(game.state.map.hero).get("heroInvisible", false), "the bridge reports the hero invisible")
	expect(hero.invisible and hero.sprite.modulate.a < 0.6, "the map shows the hero ghostly (%.2f)" % hero.sprite.modulate.a)
	expect(game.hud.portrait_invisible and game.hud.portrait.modulate.a < 0.6, "the HUD portrait fades (%.2f)" % game.hud.portrait.modulate.a)
	await screenshot("invisible")

	# An uncursed potion lasts 6d100+100 turns.
	for i in 40:
		if not game.state.map.cell(game.state.map.hero).get("heroInvisible", false):
			break
		mark()
		game.send_keys("20s")
		await _settle()
	if expect(not game.state.map.cell(game.state.map.hero).get("heroInvisible", false), "the invisibility wore off (turn %s)" % game.state.status.text(StatusModel.Field.TIME)):
		await get_tree().create_timer(0.3).timeout
		expect(not hero.invisible and hero.sprite.modulate.a > 0.9, "the hero is solid again (%.2f)" % hero.sprite.modulate.a)
		expect(not game.hud.portrait_invisible and game.hud.portrait.modulate.a > 0.9, "so is the portrait (%.2f)" % game.hud.portrait.modulate.a)
		await screenshot("visible-again")


func _settle() -> void:
	for i in 4:
		await get_tree().create_timer(0.3).timeout
		if game.dialogs.owns_input():
			await press(KEY_ESCAPE)
	await wait_for_command_prompt(10.0)
	await get_tree().create_timer(0.3).timeout
