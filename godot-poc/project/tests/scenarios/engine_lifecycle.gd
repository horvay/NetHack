extends Scenario
## Phase 1 deep path: real games run in process through the GDExtension, the
## shared bridge, and the NetHack engine, across every way a game can end.
##
##   A  Valkyrie walks around, then quits through #quit: NetHack calls exit(),
##      which must unwind the game thread, not kill Godot.
##   B  A Wizard starts in the same process: globals were reset by reloading
##      the core library. B is abandoned mid-turn with stop_game().
##   C  B's character starts again: the abandoned game's locks were cleared,
##      so NetHack does not report a game already in progress.


func run() -> void:
	await play_and_quit_valkyrie()
	await start_and_abandon_wizard("GodotLinkB-Wiz-Elf-Mal-Cha", "2002", "B")
	await start_and_abandon_wizard("GodotLinkB-Wiz-Elf-Mal-Cha", "3003", "C")


func play_and_quit_valkyrie() -> void:
	note("A: Valkyrie, seed 1001")
	expect(session.start_game("GodotLinkA-Val-Hum-Fem-Law", "1001") == OK, "A: start_game")
	var seed_event := await wait_for_named("bridge_seed")
	expect(seed_event.get("seed") == "1001", "A: seed applied, got %s" % seed_event.get("seed"))
	var welcome := await wait_for_named("shim_raw_print")
	expect(str(welcome.get("text", "")).contains("Valkyrie"), "A: welcome names a Valkyrie: %s" % welcome.get("text"))
	await wait_for_command_prompt()
	expect(status_text().contains("GodotLinkA"), "A: status line shows the hero's name")

	var start := hero_position()
	expect(start.x >= 0, "A: hero position reported")
	var moves := 0
	for direction in "hjklyubn":
		var before := hero_position()
		session.send_keys(direction)
		await wait_for_command_prompt()
		var step := hero_position() - before
		if step != Vector2i.ZERO:
			moves += 1
			expect(absi(step.x) <= 1 and absi(step.y) <= 1, "A: '%s' moved one tile, got %s" % [direction, step])
	note("A: hero moved on %d of 8 steps" % moves)
	expect(moves >= 4, "A: hero walks (moved on %d of 8 steps)" % moves)

	session.send_keys("#")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("promptPurpose") == "prompt.extendedCommand" and e.get("lifecycle") == "opened", "extended command prompt")
	session.send_keys("quit\n")
	var answer := await wait_for_named("bridge_extcmd_answer")
	expect(answer.get("command") == "quit", "A: #quit resolved to quit, got %s" % answer.get("command"))
	var really := await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("query", "")).contains("Really quit"), "Really quit? prompt")
	expect(not really.is_empty(), "A: asked to confirm quitting")
	session.send_keys("y")
	var result := await wait_for_game_end(30.0)
	note("A: ended %s" % result)
	expect(result.get("reason") == "exit", "A: game ended through NetHack's exit(), got %s" % result.get("reason"))
	expect(result.get("unloaded") == true, "A: core library unloaded after the game")
	expect(result.get("error") == "", "A: no core error: %s" % result.get("error"))
	expect(not session.is_running(), "A: session idle after game over")


func start_and_abandon_wizard(character: String, seed: String, label: String) -> void:
	note("%s: Wizard, seed %s" % [label, seed])
	mark()
	expect(session.start_game(character, seed) == OK, "%s: start_game" % label)
	var seed_event := await wait_for_named("bridge_seed")
	expect(seed_event.get("seed") == seed, "%s: seed applied" % label)
	var opening := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_raw_print" or e.get("lifecycle") == "opened" and e.get("name") != "shim_start_menu" and e.get("name") != "shim_end_menu", "welcome or prompt")
	expect(str(opening.get("text", "")).contains("Wizard"), "%s: fresh Wizard game, not a resumed or blocked one: %s" % [label, JSON.stringify(opening).left(200)])
	await wait_for_command_prompt()
	var inventory := last_inventory_names()
	expect(inventory.any(func(item_name: String) -> bool: return item_name.contains("quarterstaff")), "%s: Wizard inventory has a quarterstaff: %s" % [label, inventory])

	session.stop_game()
	var result: Dictionary = await wait_for_game_end(10.0)
	note("%s: ended %s" % [label, result])
	expect(result.get("reason") == "stopped", "%s: abandoned game reports stopped" % label)
	expect(result.get("unloaded") == true, "%s: core library unloaded after stop" % label)
	expect(not (result.get("stale_locks_removed", []) as Array).is_empty(), "%s: abandoned game's locks were cleared" % label)


func status_text() -> String:
	var text := ""
	for event in events_named("shim_status_update"):
		text += str(event.get("value", ""))
	return text


func last_inventory_names() -> Array:
	var updates := events_named("shim_update_inventory")
	if updates.is_empty():
		return []
	var names := []
	for item in updates[-1].get("items", []):
		names.append(str(item.get("displayName", item.get("name", item.get("text", "")))))
	return names
