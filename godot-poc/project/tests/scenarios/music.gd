extends Scenario
## The music follows the run (MusicDirector, real games from bridge fixtures):
##   1. the title screen plays the title piece;
##   2. each special place has its theme: the Oracle, the Gnomish Mines,
##      Sokoban, Medusa's island; a shop its own while it's calm;
##   3. hostiles in sight turn the music tense;
##   4. NetHack's windows duck the music;
##   5. stingers: a level gained, an artifact's name in the pack, death;
##   6. the tombstone plays the lament.
## Asserts what the director asks for (`wanted`); once the tracks exist in
## assets/music, also that one plays.


func run() -> void:
	var music := app.music
	app.show_title()
	await get_tree().create_timer(0.3).timeout
	expect(music.wanted == "title", "the title screen plays the title piece (%s)" % music.wanted)
	_expect_playing("title")

	for place in [["special/oracle-consultation", "oracle"], ["special/mines-end-overview", "mines-calm"],
			["special/sokoban-boulder-pit", "sokoban"], ["special/medusa-reflection", "medusa"]]:
		await _fixture(place[0])
		await press(KEY_ESCAPE)
		await _settle()
		expect(music.wanted == place[1] or music.tense, "%s plays %s (%s; level %s, %s)" % [place[0], place[1], music.wanted, game.state.map.level, game.state.map.dungeon])
		_expect_playing(music.wanted)
		await screenshot(place[1])

	await _fixture("", {"NH_SHIM_TEST_SHOP_PAYMENT_SCENE": "sufficient"})
	await press(KEY_ESCAPE)
	await _settle()
	expect(game.state.map.room == "shop", "the hero is in the shop (%s)" % game.state.map.room)
	expect(music.wanted == "shop", "the shop plays its theme (%s)" % music.wanted)
	# NetHack's windows duck the music.
	await type_text("i")
	await get_tree().create_timer(0.8).timeout
	expect(music._duck_db < -4.0, "the inventory ducks the music (%.1f dB)" % music._duck_db)
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.8).timeout
	expect(music._duck_db > -1.0, "closing it brings the music back (%.1f dB)" % music._duck_db)

	# A level gained, then a named artifact picked up.
	await _fixture("object/gain-level-and-named-sword")
	await press(KEY_ESCAPE)
	await _settle()
	expect(music.wanted == "dungeon-calm", "the first level plays the calm dungeon theme (%s)" % music.wanted)
	# When a take ends, the theme goes on with another take.
	if music.library.get("dungeon-calm", []).size() > 1:
		await get_tree().create_timer(3.5).timeout
		var player: AudioStreamPlayer = music._players[music._active]
		var before: String = player.stream.resource_path
		player.seek(player.stream.get_length() - 0.5)
		var deadline := Time.get_ticks_msec() + 5000
		while Time.get_ticks_msec() < deadline and player.stream.resource_path == before:
			await get_tree().process_frame
		expect(player.playing and player.stream.resource_path != before, "after %s ends another take plays (%s)" % [before.get_file(), player.stream.resource_path])
	music.stingers.clear()
	mark()
	game.send_keys("q")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and e.get("name") != "bridge_command_prompt", "quaff question")
	var potion := ""
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("gain level"):
			potion = char(int(item.selector))
	game.send_keys(potion)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	expect(music.stingers.has("sting-levelup"), "gaining a level plays its stinger (%s)" % [music.stingers])
	mark()
	game.send_keys(",")
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	expect(music.stingers.has("sting-artifact"), "Excalibur in the pack plays the artifact stinger (%s)" % [music.stingers])

	# Hostiles turn it tense; the death stings, the tombstone laments.
	await _fixture("monster/death-by-ants")
	await press(KEY_ESCAPE)
	await _settle()
	expect(music.tense and music.wanted == "dungeon-tense", "soldier ants in sight make it tense (%s)" % music.wanted)
	await screenshot("tense")
	for i in 40:
		if game.state.ending or not ended_results.is_empty():
			break
		mark()
		game.send_keys("F" + game.state.direction_key(Vector2i(1, 0)))
		await wait_for_command_prompt(5.0)
	await wait_for_game_end(30.0)
	await get_tree().create_timer(0.5).timeout
	expect(music.stingers.has("sting-death"), "the death plays its stinger (%s)" % [music.stingers])
	expect(music.wanted == "death", "the tombstone plays the lament (%s)" % music.wanted)
	await screenshot("tombstone")
	var end := app.get_node_or_null("EndScreen")
	if end:
		end.queue_free()


## A new game on a fixture, ending the one before.
func _fixture(id: String, env := {}) -> void:
	if is_instance_valid(game) and session.is_running():
		session.stop_game()
		await wait_for_game_end(10.0)
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").free()
	await start_fixture("Music-Val-Hum-Fem-Law", id, env)


func _settle() -> void:
	for i in 10:
		await get_tree().process_frame
	await get_tree().create_timer(0.3).timeout


## With music installed for a track, something plays.
func _expect_playing(id: String) -> void:
	var music := app.music
	if music.library.has(id):
		expect(music.current == id and music._players[music._active].playing, "%s is playing (%s)" % [id, music.current])
