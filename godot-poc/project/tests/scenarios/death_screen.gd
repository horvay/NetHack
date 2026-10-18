extends Scenario
## Dying to monsters, the way a run usually ends (bridge fixture: 3 of 40
## HP between two soldier ants):
##   - the danger alert and its red glow are up while the hero is dying;
##   - once the hero dies, the end screen is clean: no alert, no red glow,
##     no hurt vignette over the report;
##   - the epitaph is NetHack's own words for the death, once
##     ("Killed by a soldier ant", not "Killed by a killed by a ...").

const NAME := "DeathScreen"


func run() -> void:
	await start_fixture(NAME + "-Val-Hum-Fem-Law", "monster/death-by-ants")
	await press(KEY_ESCAPE)
	var danger := game.danger
	expect(danger.panel.visible, "the danger alert is up at %s HP" % game.state.status.hp())
	await screenshot("dying")

	var dying := [false]
	game.state.ending_started.connect(func() -> void: dying[0] = true, CONNECT_ONE_SHOT)
	# Fight until the ants finish the hero (NetHack 5 refuses to search
	# beside a monster).
	for i in 40:
		if dying[0] or not ended_results.is_empty():
			break
		mark()
		game.send_keys("F" + game.state.direction_key(Vector2i(1, 0)))
		await wait_for_command_prompt(5.0)
	expect(dying[0], "the ants killed the hero")
	var ended := await wait_for_game_end(30.0)
	expect(not ended.is_empty(), "the run ended")
	await screenshot("death-screen", 1.4)

	var end := app.get_node_or_null("EndScreen") as EndScreen
	expect(end != null and end.outcome == "died", "the end screen shows a death")
	var layers := game.find_children("*", "CanvasLayer", true, false)
	var shown := layers.filter(func(l: CanvasLayer) -> bool: return l.visible).map(func(l: CanvasLayer) -> String: return str(l.get_path()))
	expect(shown.is_empty(), "no game overlay shows over the end screen: %s" % [shown])
	var epitaph := end._epitaph(game.state.end_info)
	note("epitaph: %s" % epitaph)
	expect(epitaph.begins_with("Killed by a soldier ant"), "the epitaph names the killer: %s" % epitaph)
	expect(epitaph.to_lower().count("killed by") == 1, "the epitaph says \"killed by\" once: %s" % epitaph)
	for save in app.session.catalog().saves():
		if save.name == NAME:
			DirAccess.remove_absolute(save.path)
