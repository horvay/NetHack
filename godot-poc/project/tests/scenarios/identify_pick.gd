extends Scenario
## Reading a scroll of identify (fixture: unidentified potions, a ring, a
## wand, gems): "What would you like to identify first?" is a pick-any item
## grid (ItemPickScreen); a click picks, Confirm identifies; Esc on the
## second scroll's grid declines at once.


func _wait_pick() -> ItemPickScreen:
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ItemPickScreen:
		await get_tree().process_frame
	await get_tree().create_timer(0.4).timeout
	return game.dialogs.active as ItemPickScreen


func _back_to_prompt() -> void:
	# By state, not events: Esc only while something is open or asked.
	for i in 12:
		if game.state.is_waiting_for_command() and game.dialogs.active == null:
			return
		if game.dialogs.active != null or not game.state.is_waiting_for_command():
			await press(KEY_ESCAPE)
		await get_tree().create_timer(0.3).timeout
	expect(game.state.is_waiting_for_command() and game.dialogs.active == null, "back at the command prompt")


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "object/identify-pack")
	await press(KEY_ESCAPE)
	var scroll: Array = game.state.inventory.filter(func(i: Dictionary) -> bool: return ItemText.display_name(i).contains("identify"))
	if not expect(not scroll.is_empty(), "the fixture carries a scroll of identify"):
		return
	mark()
	await type_text("r")
	await get_tree().create_timer(0.5).timeout
	await type_text(char(int(scroll[0].get("selector", 0))))
	var pick := await _wait_pick()
	if pick == null:
		note("NetHack identified everything at once (no menu this seed): %s" % [game.state.messages.recent(4).map(func(m: Dictionary) -> String: return str(m.get("text", "")))])
		expect(game.state.messages.recent(8).any(func(m: Dictionary) -> bool: return str(m.get("text", "")).contains("potion of")), "the scroll identified the pack")
		return
	expect(pick.how == ItemPickScreen.PICK_ANY and pick.title_label.text.begins_with("What would you like to identify"), "identify is a pick-any grid (%s)" % pick.title_label.text)
	await click_control(pick.slots[0])
	await get_tree().create_timer(0.2).timeout
	expect(pick.slots[0].is_selected and pick.picks.size() == 1, "a click picks")
	await screenshot("identify-picked")
	var before := ItemText.display_name(pick.slots[0].item)
	await press(KEY_ENTER)
	await get_tree().create_timer(0.8).timeout
	var said := game.state.messages.recent(6).map(func(m: Dictionary) -> String: return str(m.get("text", "")))
	note("identified: %s (was %s)" % [said, before])
	expect(said.any(func(t: String) -> bool: return t.contains("potion of")), "Confirm identifies the picked potion (%s)" % [said])
	await _back_to_prompt()
	await screenshot("identified")

	# The second scroll: Esc on the grid declines, as tty (no "Choose an item;
	# use ESC to decline." nagging), back at the command prompt.
	mark()
	await type_text("r")
	await get_tree().create_timer(0.5).timeout
	await type_text(char(int(scroll[0].get("selector", 0))))
	var again := await _wait_pick()
	if again != null:
		await press(KEY_ESCAPE)
		await wait_for_command_prompt()
		await get_tree().create_timer(0.4).timeout
		var lines := game.state.messages.recent(4).map(func(m: Dictionary) -> String: return str(m.get("text", "")))
		expect(not lines.any(func(t: String) -> bool: return t.begins_with("Choose an item")) and not game.dialogs.active is ItemPickScreen, "Esc declines at once (%s)" % [lines])
	else:
		note("the second scroll identified everything at once")
