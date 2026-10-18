extends Scenario
## Controller play with real joypad events: walk with the left stick, open
## the pack with X and back out with B, open the palette with Y and move
## focus with the D-pad, then press A on the level-1 up staircase — which
## must NOT leave the dungeon (that is never a default action).


func run() -> void:
	await start_game("Brunhild-Val-Hum-Fem-Law", "1001")
	await press(KEY_ESCAPE)
	var start := game.state.map.hero
	await _stick(Vector2(-1, 0))
	await get_tree().create_timer(0.5).timeout
	await _stick(Vector2.ZERO)
	await wait_for_command_prompt()
	note("stick walk %s -> %s" % [start, game.state.map.hero])
	expect(game.state.map.hero != start, "the left stick walks the hero")
	var bag: Button = game.hud.action_bar._buttons["inventory"]
	expect(bag.text.ends_with("X") and game.hud.action_bar._buttons["menu"].text.ends_with("Start"), "the action bar shows pad buttons once the pad is used (%s)" % bag.text)

	await _button(JOY_BUTTON_X)
	expect(game.dialogs.active is InventoryScreen, "X opens the pack")
	await screenshot("pad-inventory")
	await _button(JOY_BUTTON_B)
	await get_tree().create_timer(0.2).timeout
	expect(not game.dialogs.owns_input(), "B closes the pack")

	await _button(JOY_BUTTON_Y)
	expect(game.dialogs.active is CommandPalette, "Y opens the command palette")
	await _button(JOY_BUTTON_DPAD_DOWN)
	var focused := get_viewport().gui_get_focus_owner()
	expect(focused != null and game.dialogs.active.is_ancestor_of(focused), "the D-pad moves focus inside the dialog")
	await screenshot("pad-palette")
	await _button(JOY_BUTTON_B)
	await get_tree().create_timer(0.2).timeout

	# Walk back onto the up stairs, then A takes them (NetHack asks first).
	if game.state.map.hero != start:
		mark()
		game.session.send_map_click(start, 1)
		await wait_for_command_prompt()
	_cursor_before_a = events.size()
	# On dungeon level 1 the up stairs lead out of the dungeon: A must never
	# take them by default; it searches instead.
	mark()
	await _button(JOY_BUTTON_A)
	await wait_for_command_prompt()
	var asked := events.slice(_cursor_before_a).any(func(e: Dictionary) -> bool: return e.get("name") == "shim_yn_function")
	expect(not asked, "A on the level-1 stairs does not offer to leave the dungeon")
	expect(game.state.map.depth == 1, "still in the dungeon")
	await screenshot("pad-safe-stairs")

	# The bar's "Leave the dungeon" asks "Are you sure?" first; B on that
	# card backs out and nothing reaches NetHack.
	var leave: Button = null
	for child in game.hud.action_bar._context_box.get_children():
		if child is Button and str(child.text).begins_with("Leave the dungeon"):
			leave = child
	if expect(leave != null, "the stairs offer Leave the dungeon"):
		leave.pressed.emit()
		await get_tree().create_timer(0.2).timeout
		var confirm := game.dialogs.blocking_modal()
		expect(confirm is ConfirmDialog, "leaving asks for confirmation")
		await screenshot("pad-confirm-leave")
		var since := events.size()
		await _button(JOY_BUTTON_B)
		await get_tree().create_timer(0.3).timeout
		expect(game.dialogs.blocking_modal() == null, "B closed the Are you sure? card")
		expect(commands_run(0, since).is_empty() and game.state.map.depth == 1, "and nothing was sent to NetHack")

	# Text from a pad: engrave in the dust (E, then - for fingers), take the
	# "Elbereth" suggestion and confirm, with no keyboard at all.
	mark()
	game.send_keys("E")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("write with"), "write with what")
	game.send_keys("-")
	var line_event := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_getlin", "the engrave text prompt")
	await get_tree().create_timer(0.3).timeout
	var line := game.dialogs.active as LineDialog
	if expect(line != null and line._first_key != null, "the text prompt shows an on-screen keyboard for the pad"):
		var chip: Button = null
		for node in line.find_children("*", "Button", true, false):
			if (node as Button).text == "Elbereth":
				chip = node
		expect(chip != null, "engraving suggests Elbereth")
		await screenshot("pad-keyboard", 0.2)
		if chip:
			chip.grab_focus()
			await _button(JOY_BUTTON_A)
		expect(line.field.text == "Elbereth", "A on the suggestion fills it in (%s)" % line.field.text)
		var ok: Button = null
		for node in line.footer.get_children():
			if node is Button and (node as Button).text.begins_with("OK"):
				ok = node
		ok.grab_focus()
		await _button(JOY_BUTTON_A)
		await wait_for_command_prompt()
		expect(game.state.messages.entries.any(func(e: Dictionary) -> bool: return str(e.text).to_lower().contains("write in the dust")), "the hero wrote in the dust")
		# Again from the keyboard: Enter at "add to the current engraving?"
		# gives NetHack's default (Yes, add), as in tty; it never wipes the
		# Elbereth out.
		mark()
		await type_text("E")
		await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("write with"), "write with what")
		await type_text("-")
		var add := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_yn_function" and str(e.get("query", "")).to_lower().contains("add to the current"), "add to the current engraving?")
		expect(str(add.get("default", "")) == "y", "the bridge sends NetHack's default answer (%s)" % add.get("default", ""))
		await get_tree().create_timer(0.3).timeout
		var question := game.dialogs.active as QuestionDialog
		expect(question != null and question.default_choice == "y", "the question knows its default is Yes")
		await screenshot("engrave-add-default")
		await press(KEY_ENTER, 13)
		await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_getlin", "what to add")
		await get_tree().create_timer(0.2).timeout
		await type_text("x")
		await press(KEY_ENTER, 13)
		await wait_for_command_prompt()
		var said := game.state.messages.entries.map(func(e: Dictionary) -> String: return str(e.text).to_lower())
		expect(said.any(func(t: String) -> bool: return t.contains("add to the writing")), "Enter added to the engraving")
		expect(not said.any(func(t: String) -> bool: return t.contains("wipe out")), "and wiped nothing out")
	# Back on the keyboard: the bar shows the keys again.
	await press(KEY_SHIFT, 0, true)
	expect(game.hud.action_bar._buttons["inventory"].text.ends_with("i"), "a key press brings the keyboard hints back (%s)" % game.hud.action_bar._buttons["inventory"].text)


var _cursor_before_a := 0


func _button(index: JoyButton) -> void:
	for pressed in [true, false]:
		var event := InputEventJoypadButton.new()
		event.button_index = index
		event.pressed = pressed
		Input.parse_input_event(event)
		await get_tree().process_frame


func _stick(value: Vector2) -> void:
	for axis in [[JOY_AXIS_LEFT_X, value.x], [JOY_AXIS_LEFT_Y, value.y]]:
		var event := InputEventJoypadMotion.new()
		event.axis = axis[0]
		event.axis_value = axis[1]
		Input.parse_input_event(event)
	await get_tree().process_frame
