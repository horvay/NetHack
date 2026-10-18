extends Scenario
## A real fight and how it feels: rest until a hostile creature shows up,
## close in by clicking it, then attack with F + direction until it falls.
## Checks the hero's attack lunges, hit/miss/kill sounds, floating damage
## when the hero is hurt, and captures the fight.

const MAX_ROUNDS := 160


func run() -> void:
	await start_game("Brunhild-Val-Hum-Fem-Law", "2718")
	await press(KEY_ESCAPE)
	# One step first, so footsteps are heard whatever the fight does.
	for delta in GameState.DIRECTION_ORDER:
		var next: Vector2i = game.state.map.hero + delta
		var c := game.state.map.cell(next)
		if str(c.get("actorId", "")) == "" and Terrain.is_walkable(Terrain.classify(c).kind):
			await _do(game.state.direction_key(delta))
			break
	var fought := false
	var killed := false
	var shots := 0
	for round in MAX_ROUNDS:
		await _clear_prompts()
		var foe := _nearest_hostile()
		if foe.x < 0:
			await _do("20s")
			continue
		var delta := foe - game.state.map.hero
		if absi(delta.x) <= 1 and absi(delta.y) <= 1:
			fought = true
			await _do("F" + game.state.direction_key(delta))
			if shots < 2:
				await screenshot("fight-%d" % shots, 0.25)
				shots += 1
			# Whoever lands the last blow (the pet often does): NetHack also
			# reads the wall clock (moon phase, night), so a seed can play
			# out differently at another hour.
			if _recent_message_matches("(?i)^you (kill|destroy)|is killed!|is destroyed!"):
				killed = true
				break
		else:
			mark()
			await click_cell(foe)
			await wait_for_command_prompt(10.0)
	note("fought=%s killed=%s turn=%d hp=%d/%d" % [fought, killed, game.state.status.turn(), game.state.status.hp(), game.state.status.hp_max()])
	expect(fought, "met a hostile creature and fought it")
	var audio := game.get_node("AudioDirector") as AudioDirector
	note("sounds played: %s" % audio.played)
	expect(int(audio.played.get("step", 0)) > 0, "footsteps played")
	expect(int(audio.played.get("hit", 0)) + int(audio.played.get("miss", 0)) + int(audio.played.get("kill", 0)) > 0, "combat sounds played")
	if killed:
		await screenshot("victory")
	expect(killed, "the foe the Valkyrie fought was killed")


func _do(keys: String) -> void:
	mark()
	game.send_keys(keys)
	await wait_for_command_prompt(15.0)


## Answers anything NetHack asks mid-fight conservatively.
func _clear_prompts() -> void:
	for i in 5:
		var kind := str(game.state.request.get("kind", ""))
		if kind in ["command", "busy"]:
			return
		if kind == "yn":
			game.send_keys("n" if str(game.state.request.get("choices", "")).contains("n") else "y")
		else:
			game.send_keycode(27)
		await get_tree().create_timer(0.2).timeout


func _nearest_hostile() -> Vector2i:
	var hero := game.state.map.hero
	var best := Vector2i(-1, -1)
	var best_d := 999
	for id in game.state.map.actors():
		var cell: Vector2i = game.state.map.actors()[id]
		var c := game.state.map.cell(cell)
		var tags: Array = c.get("actionAffordances", [])
		if int(c.get("glyphFlags", 0)) & 0x10 or tags.has("monster.attitude.peaceful") or tags.has("monster.shopkeeper"):
			continue
		if not game.state.map.is_visible(cell):
			continue
		var d := maxi(absi(cell.x - hero.x), absi(cell.y - hero.y))
		if d < best_d:
			best_d = d
			best = cell
	return best


func _recent_message_matches(pattern: String) -> bool:
	var re := RegEx.create_from_string(pattern)
	for entry in game.state.messages.recent(4):
		if re.search(str(entry.text)):
			return true
	return false
