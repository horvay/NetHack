extends Scenario
## Phase 2 deep path: a real game rendered by the real app. Starts a
## Valkyrie, walks with arrow keys through Godot's input pipeline, toggles
## the overview, opens the command palette, runs with the mouse in Run mode
## and rests a chosen number of turns, capturing each view.


func run() -> void:
	# Every scenario runs in a fresh user directory: this is a first run.
	# Animations must be on unless the OS really asks for reduced motion
	# (Linux reports "unknown", which used to switch them off).
	expect(not app.settings.reduced_motion and Motion.enabled(), "a first run keeps animations on")
	await start_game("Brunhild-Val-Hum-Fem-Law", "1001")
	expect(game.world.actors.hero_node() != null, "hero sprite exists")
	await screenshot("start")
	# The opening lore is shown as a reader; any key dismisses it.
	await press(KEY_ESCAPE)
	var start := game.state.map.hero
	for key in [KEY_RIGHT, KEY_RIGHT, KEY_DOWN, KEY_LEFT]:
		await press(key)
		await wait_for_command_prompt()
	note("hero %s -> %s" % [start, game.state.map.hero])
	expect(game.state.map.hero != start, "arrow keys move the hero")
	await screenshot("after-walk")
	await press(KEY_TAB)
	await screenshot("overview", 0.8)
	await press(KEY_TAB)
	game.input_router.open_ui("palette")
	await screenshot("palette")
	await press(KEY_ESCAPE)

	# Mouse players: Run mode rushes toward a click; Rest waits N turns.
	var bar := game.hud.action_bar
	await click_control(bar.mode_button)
	expect(game.input_router.move_mode == "run", "the mode button switches to Run")
	await screenshot("run-mode", 0.3)
	var hero := game.state.map.hero
	var target := Vector2i(-1, -1)
	for x in range(hero.x - 1, -1, -1):
		var info := Terrain.classify(game.state.map.cell(Vector2i(x, hero.y)))
		if info.kind != Terrain.Kind.FLOOR:
			break
		target = Vector2i(x, hero.y)
	if expect(target.x >= 0 and target.x < hero.x - 1, "found floor to the west to run along"):
		mark()
		await click_cell(target)
		await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "bridge_command" and int(e.get("keycode", 0)) == 72, "the rush key H")
		await wait_for_command_prompt()
		note("ran %s -> %s" % [hero, game.state.map.hero])
		expect(game.state.map.hero.x < hero.x - 1, "the hero ran more than one step west")
	await click_control(bar.mode_button)
	await click_control(bar.mode_button)
	expect(game.input_router.move_mode == "walk", "the mode cycles back to Walk")
	bar.rest_count.value = 5
	var turn := game.state.status.turn()
	mark()
	await click_control(bar._buttons["rest"])
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	note("rested from turn %d to %d" % [turn, game.state.status.turn()])
	expect(game.state.status.turn() >= turn + 5, "Rest waited the 5 turns set beside it")

	# The regenerated newt (shared with Electron since 2026-10-17), on the
	# map next to the hero (bridge fixture).
	session.stop_game()
	await wait_for_game_end(10.0)
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "monster/visible-newt-east")
	await press(KEY_ESCAPE)
	var newt_cell := game.state.map.hero + Vector2i(1, 0)
	var newt := game.state.map.cell(newt_cell)
	expect(str(newt.get("semanticName", "")) == "newt", "a newt east of the hero (%s)" % newt.get("semanticName", ""))
	expect(TileResolver.shared().asset_for_semantic_name("newt", "monster") == "newt", "drawn with the newt tile")
	game.world.set_zoom_index(WorldView.ZOOMS.size() - 1)
	await screenshot("newt", 0.6)

	# A corpse looks the same under the hero as beside her (bridge fixture:
	# a jackal corpse on both squares).
	session.stop_game()
	await wait_for_game_end(10.0)
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "ground/corpses-on-and-beside-hero")
	await press(KEY_ESCAPE)
	var beside := game.state.map.cell(game.state.map.hero + Vector2i(1, 0))
	# What the renderer draws under the hero: the top of the pile snapshot.
	var here := game.state.map.pile(game.state.map.hero)
	var under := TerrainLayer.pile_item_cell(here[0]) if not here.is_empty() else {}
	var resolver := TileResolver.shared()
	note("under hero: %s / beside: %s" % [under.get("semanticName", ""), beside.get("semanticName", "")])
	expect(not under.is_empty(), "the bridge reports the corpse under the hero")
	expect(TerrainLayer.object_style(under) == "corpse" and TerrainLayer.object_style(beside) == "corpse", "both are drawn as corpses")
	expect(resolver.asset_for_cell(under) == resolver.asset_for_cell(beside), "with the same art (%s / %s)" % [resolver.asset_for_cell(under), resolver.asset_for_cell(beside)])
	game.world.set_zoom_index(WorldView.ZOOMS.size() - 1)
	await screenshot("corpses", 0.6)

	# A pile shows as a pile: the things under the top item peek out behind
	# it, with a count; an unidentified bag of holding is only "a bag"
	# (bridge fixture: 5 daggers, 11 arrows, an apple and the bag east; one
	# apple south).
	session.stop_game()
	await wait_for_game_end(10.0)
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "ground/pile-east-with-bag")
	await press(KEY_ESCAPE)
	# The hero walks over the pile and back, so it is known.
	await press(KEY_RIGHT)
	await wait_for_command_prompt()
	await press(KEY_LEFT)
	await wait_for_command_prompt()
	var pile_cell := game.state.map.hero + Vector2i(1, 0)
	var pile := game.state.map.pile(pile_cell)
	var names: Array = pile.map(func(i: Dictionary) -> String: return str(i.get("displayName", "")))
	note("pile: %s" % [names])
	expect(pile.size() == 4, "the pile has its 4 stacks (%d)" % pile.size())
	expect(names.has("a bag") and not names.any(func(n: String) -> bool: return n.contains("holding")), "the unidentified bag of holding is only a bag")
	game.world.set_zoom_index(WorldView.ZOOMS.size() - 1)
	await settle_camera()
	await hover_cell(pile_cell)
	await get_tree().create_timer(0.4).timeout
	var card_text := " ".join(game.hud.inspector.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text))
	expect(card_text.contains("a bag") and not card_text.contains("holding"), "the hover card says a bag (%s)" % card_text)
	await screenshot("pile", 0.4)

