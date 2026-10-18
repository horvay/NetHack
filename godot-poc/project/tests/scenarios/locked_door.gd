extends Scenario
## A locked door to the east and a lock pick in the pack (bridge fixture):
##   1. bumping the door offers "Unlock with lock pick" and "Kick it open" on
##      the action bar, and the same actions in the command palette's
##      "Available here" (how a pad player reaches them);
##   2. Settings > Locked-door suggestions: Off shows none, "With a key"
##      shows them while the hero has a tool;
##   3. Unlock runs a + the pick + the direction, leaves NetHack's own
##      "Unlock it?" to the player, and the door ends up unlocked;
##   4. the detailed hero card says what the hero stands on.


func run() -> void:
	var settings: Settings = app.settings
	var saved_level := settings.contextual_prompts
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "door/locked-door-corridor")
	await press(KEY_ESCAPE)
	var door := game.state.map.hero + Vector2i(1, 0)
	expect(Terrain.classify(game.state.map.cell(door)).kind == Terrain.Kind.DOOR_CLOSED, "a closed door to the east")

	settings.contextual_prompts = "full"
	await _bump()
	var labels := _bar_labels()
	note("bar: %s" % [labels])
	expect(labels.any(func(t: String) -> bool: return t.begins_with("Unlock with")), "the bar offers Unlock with the lock pick")
	expect(labels.any(func(t: String) -> bool: return t.begins_with("Kick it open")), "and Kick it open")
	await screenshot("locked-door-actions")

	await _pad(JOY_BUTTON_Y)
	await get_tree().create_timer(0.3).timeout
	var palette := game.dialogs.active as CommandPalette
	var here: Array = palette.entries.filter(func(e: Dictionary) -> bool: return str(e.get("cat", "")) == "Available here").map(func(e: Dictionary) -> String: return str(e.label))
	note("palette here: %s" % [here])
	expect(here.any(func(t: String) -> bool: return t.begins_with("Unlock with")) and here.has("Kick it open"), "the palette lists the lock actions under Available here")
	var kick_entry: Array = palette.entries.filter(func(e: Dictionary) -> bool: return str(e.label) == "Kick it open")
	expect(not kick_entry.is_empty() and str(kick_entry[0].key) == "^D", "the palette shows Kick's key as ^D (%s)" % [kick_entry[0].key if not kick_entry.is_empty() else ""])
	expect(not here.any(func(t: String) -> bool: return t.begins_with("Open door")), "and not Open door while the lock is known")
	await screenshot("palette-lock-actions")
	await _pad(JOY_BUTTON_B)
	await get_tree().create_timer(0.2).timeout

	settings.contextual_prompts = "off"
	game.hud.action_bar.lock_actions.clear()
	await _bump()
	expect(not _bar_labels().any(func(t: String) -> bool: return t.begins_with("Unlock with") or t.begins_with("Kick it open")), "Off: no lock suggestions")
	settings.contextual_prompts = "essential"
	await _bump()
	expect(_bar_labels().any(func(t: String) -> bool: return t.begins_with("Unlock with")), "With a key: shown while the hero has a lock pick")

	# A pad player kicks it from the palette: Y, the D-pad down to "Kick it
	# open", A. (No keyboard or mouse.)
	await _pad(JOY_BUTTON_Y)
	await get_tree().create_timer(0.3).timeout
	var kick_focused := false
	for i in 20:
		var focus := get_viewport().gui_get_focus_owner()
		if focus is Button and (focus as Button).text.begins_with("Kick it open"):
			kick_focused = true
			break
		await _pad(JOY_BUTTON_DPAD_DOWN)
	if expect(kick_focused, "the D-pad reaches Kick it open in the palette"):
		await screenshot("pad-kick-in-palette")
		mark()
		await _pad(JOY_BUTTON_A)
		var kicked := await wait_for_event(func(e: Dictionary) -> bool:
			var t := str(e.get("text", "")).to_lower()
			return t.contains("whamm") or t.contains("crashes open") or t.contains("kick"), "the kick")
		note("kick: %s" % kicked.get("text", ""))
		expect(not kicked.is_empty(), "A on the palette entry kicked the door")
		await wait_for_command_prompt()
	if not _bar_labels().any(func(t: String) -> bool: return t.begins_with("Unlock with")):
		await _bump()

	# Unlock it from the bar.
	var unlock: Button = null
	await get_tree().create_timer(0.3).timeout
	for child in game.hud.action_bar._context_box.get_children():
		if child is Button and str(child.text).begins_with("Unlock with") and not child.is_queued_for_deletion():
			unlock = child
	if expect(unlock != null, "an Unlock button to press"):
		mark()
		# The first mouse click after pad play must still press the button.
		await click_control(unlock)
		var asked := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_yn_function" and str(e.get("query", "")).to_lower().contains("unlock it"), "NetHack's Unlock it? question")
		expect(not asked.is_empty(), "NetHack asks Unlock it? (answered by the player, not typed ahead)")
		await get_tree().create_timer(0.3).timeout
		await screenshot("unlock-question")
		await type_text("y")
		# Picking a lock takes a few turns; it may need another try.
		var deadline := Time.get_ticks_msec() + 30000
		while Time.get_ticks_msec() < deadline and not game.state.messages.entries.any(func(e: Dictionary) -> bool: return str(e.text).to_lower().contains("succeed in picking")):
			if game.state.is_waiting_for_command():
				await get_tree().create_timer(0.2).timeout
				if game.state.is_waiting_for_command() and not game.state.messages.entries.any(func(e: Dictionary) -> bool: return str(e.text).to_lower().contains("succeed in picking")):
					game.input_router.run_cell_action(game.state.map.hero, _unlock_action())
			var request := game.state.request
			if str(request.get("kind", "")) == "yn" and str(request.get("query", "")).to_lower().contains("unlock it") and game.dialogs.active is QuestionDialog:
				await type_text("y")
			await get_tree().process_frame
		expect(game.state.messages.entries.any(func(e: Dictionary) -> bool: return str(e.text).to_lower().contains("succeed in picking")), "the lock was picked")
		await wait_for_command_prompt()
		await get_tree().create_timer(0.3).timeout
		expect(not _bar_labels().any(func(t: String) -> bool: return t.begins_with("Unlock with") or t.begins_with("Kick it open")), "the lock suggestions are gone once it's picked (%s)" % [_bar_labels()])

	# The detailed hero card names the ground under the hero.
	# Hover the hero card with the mouse to expand it.
	var card_at := game.hud.hero_card.get_global_rect().get_center()
	var hover := InputEventMouseMotion.new()
	hover.position = card_at
	hover.global_position = card_at
	Input.parse_input_event(hover)
	await get_tree().create_timer(0.4).timeout
	var ground: Label = game.hud._detail_labels[StatusModel.Field.TERRAIN]
	note("hero card ground: %s (cell %s)" % [ground.text, game.state.map.cell(game.state.map.hero)])
	expect(ground.text.begins_with("On "), "the hero card says what the hero stands on (%s)" % ground.text)
	await screenshot("hero-card-ground")
	var away := InputEventMouseMotion.new()
	away.position = Vector2(960, 700)
	away.global_position = away.position
	Input.parse_input_event(away)
	settings.contextual_prompts = saved_level


func _bump() -> void:
	mark()
	await press(KEY_RIGHT)
	await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("text", "")).to_lower().contains("locked"), "This door is locked")
	# With a tool in the pack NetHack offers to unlock right away
	# (autounlock): decline, to use the suggestions instead.
	var deadline := Time.get_ticks_msec() + 5000
	while Time.get_ticks_msec() < deadline and not game.state.is_waiting_for_command():
		var request := game.state.request
		if str(request.get("kind", "")) == "yn" and str(request.get("query", "")).to_lower().contains("unlock it"):
			await type_text("n")
		await get_tree().process_frame
	await wait_for_command_prompt()
	await get_tree().create_timer(0.2).timeout


func _bar_labels() -> Array:
	return game.hud.action_bar._context_box.get_children().filter(func(c: Node) -> bool: return c is Button and not c.is_queued_for_deletion()).map(func(c: Button) -> String: return c.text)


func _unlock_action() -> Dictionary:
	for action in game.hud.action_bar.lock_actions:
		if action.id == "lock-unlock":
			return action
	return {}


func _pad(index: JoyButton) -> void:
	for pressed in [true, false]:
		var event := InputEventJoypadButton.new()
		event.button_index = index
		event.pressed = pressed
		Input.parse_input_event(event)
		await get_tree().process_frame
