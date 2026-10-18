extends Scenario
## The player's panels, end to end through real keys:
## the hero card's full status on hover, F1 field guide + manual search, Settings toggles (NetHack symbols and
## high contrast on the live map), the command palette's "Available here"
## and "Recent" sections, message history (F2; Ctrl+P stays NetHack's),
## Esc cancelling a typed count, the character sheet
## (classic Ctrl+X), the inventory's search and right-click actions, and
## the pile peek after dropping things and stepping back onto them.


func run() -> void:
	await start_game("Brunhild-Val-Hum-Fem-Law", "1001")
	await press(KEY_ESCAPE)

	# Hovering the hero card reveals the full status line.
	var card := game.hud.hero_card
	expect(not game.hud.details.visible, "the hero card starts compact")
	var motion := InputEventMouseMotion.new()
	motion.position = card.get_global_rect().get_center()
	motion.global_position = motion.position
	Input.parse_input_event(motion)
	for i in 5:
		await get_tree().process_frame
	expect(game.hud.details.visible, "hovering the hero card shows the full status")
	var strength: Label = game.hud._detail_labels[StatusModel.Field.STR]
	expect(strength.text.begins_with("St "), "attributes are shown (%s)" % strength.text)
	expect(str(game.hud._detail_labels[StatusModel.Field.EXP].text).contains("experience points"), "experience points are shown")
	await screenshot("hero-card-expanded", 0.2)
	motion = InputEventMouseMotion.new()
	motion.position = Vector2(960, 540)
	motion.global_position = motion.position
	Input.parse_input_event(motion)
	for i in 5:
		await get_tree().process_frame
	expect(not game.hud.details.visible, "moving away folds it again")

	await press(KEY_F1)
	var help := game.dialogs.active as HelpScreen
	expect(help != null, "F1 opens the field guide")
	await screenshot("help")
	help._show(HelpScreen.PAGES.size())
	help._find("Elbereth")
	await screenshot("manual-search")
	expect(help._manual.get_line(help._manual.get_caret_line()).to_lower().contains("elbereth"), "manual search jumps to Elbereth")
	await press(KEY_ESCAPE)

	game.input_router.open_ui("settings")
	var settings := game.dialogs.active as SettingsScreen
	expect(settings != null, "settings open")
	await screenshot("settings")
	# Keyboard only: Tab to the first switch, Space flips it, Space flips it back.
	for i in 3:
		await get_tree().process_frame
	var focus: Control = null
	for i in 12:
		focus = get_viewport().gui_get_focus_owner()
		if focus is CheckButton:
			break
		await press(KEY_TAB)
	if expect(focus is CheckButton, "Tab reaches a settings switch (focus: %s)" % [focus]):
		var was: bool = (focus as CheckButton).button_pressed
		await press(KEY_SPACE, 32)
		expect((focus as CheckButton).button_pressed != was, "Space flips the focused switch")
		await press(KEY_SPACE, 32)
		expect((focus as CheckButton).button_pressed == was, "Space flips it back")
	# Reset to defaults from the keyboard: the card is rebuilt in place and
	# keys stay in it (they used to walk the hero behind it).
	# At 150% the rows refit (they scroll), and Close stays on screen. The
	# slider itself is moved, as a player would.
	var size_slider: HSlider = null
	for row in settings.find_children("*", "HBoxContainer", true, false):
		if row.get_child_count() > 1 and row.get_child(0) is Label and (row.get_child(0) as Label).text == "Interface size":
			for child in row.get_children():
				if child is HSlider:
					size_slider = child
	if expect(size_slider != null, "Settings has the Interface size slider"):
		size_slider.value = 150
	await get_tree().create_timer(0.4).timeout
	var close_button: Button = null
	for node in settings.footer.get_children():
		if node is Button and (node as Button).text.begins_with("Close"):
			close_button = node
	expect(close_button != null and get_viewport().get_visible_rect().grow(1).encloses(close_button.get_global_rect()), "at 150%% the Settings card's Close stays on screen")
	await screenshot("settings-150")
	var reset: Button = null
	for node in settings.footer.get_children():
		if node is Button and (node as Button).text.begins_with("Reset"):
			reset = node
	reset.grab_focus()
	await press(KEY_ENTER, 13)
	await get_tree().create_timer(0.3).timeout
	var hero_before := game.state.map.hero
	await press(KEY_DOWN)
	await press(KEY_J, "j".unicode_at(0))
	await get_tree().create_timer(0.3).timeout
	expect(game.state.map.hero == hero_before, "keys don't reach the game after Reset to defaults")
	expect(game.dialogs.active == settings and game.dialogs.owns_input(), "the same Settings card is still the open dialog")
	expect(is_equal_approx(get_window().content_scale_factor, 1.0), "the interface size is applied back to 100%% (%.2f)" % get_window().content_scale_factor)
	await screenshot("settings-after-reset")
	App.instance.settings.ascii_overlay = true
	App.instance.settings.high_contrast = true
	game.world.apply_settings()
	settings.close()
	await screenshot("accessibility-map")
	App.instance.settings.ascii_overlay = false
	App.instance.settings.high_contrast = false
	game.world.apply_settings()

	game.input_router.open_ui("palette")
	var palette := game.dialogs.active as CommandPalette
	expect(palette != null, "palette opens")
	var labels := palette.entries.map(func(e: Dictionary) -> String: return str(e.get("cat", "")))
	expect(labels.has("Available here"), "palette lists actions available here (on the up stairs)")
	var default_row: Dictionary = palette.entries[palette._selected]
	expect(str(default_row.get("danger", "")) == "", "Enter's default row is never a dangerous one (got %s)" % default_row.get("label", ""))
	# A dangerous row asks first, and the game gets no keys while it asks.
	for i in palette.entries.size():
		if str(palette.entries[i].get("id", "")) == "here-stairs":
			palette._run(palette.entries[i])
	await get_tree().process_frame
	var confirm := get_tree().get_first_node_in_group("blocking_modal")
	expect(confirm != null, "Leaving the dungeon asks first")
	var since := events.size()
	await press(KEY_H, 104)
	await get_tree().create_timer(0.3).timeout
	expect(events_named("bridge_command", since).is_empty(), "keys don't reach the game behind the question")
	await screenshot("leave-confirm", 0.2)
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.3).timeout
	game.input_router.open_ui("palette")
	palette = game.dialogs.active as CommandPalette
	for entry in palette.entries:
		if entry.get("id") == "search":
			palette._run(entry)
			break
	await wait_for_command_prompt()
	game.input_router.open_ui("palette")
	palette = game.dialogs.active as CommandPalette
	expect(palette.entries.any(func(e: Dictionary) -> bool: return e.get("cat") == "Recent" and e.get("id") == "search"), "Search shows under Recent")
	await screenshot("palette-sections")
	palette.close()

	await press(KEY_F2)
	expect(game.dialogs.active is HistoryPanel, "F2 opens message history")
	await screenshot("history")
	await press(KEY_ESCAPE)

	# Ctrl+P stays NetHack's own "previous message".
	mark()
	await press(KEY_P, 0, false, true)
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "bridge_command" and int(e.get("keycode", 0)) == 16, "^P reaching NetHack")
	for i in 20:
		await get_tree().process_frame
	if game.dialogs.owns_input():
		await screenshot("ctrl-p")
		await press(KEY_ESCAPE)
	await wait_for_command_prompt()

	# Esc after a count cancels the count in NetHack instead of opening the menu.
	mark()
	await type_text("2")
	await press(KEY_ESCAPE)
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "bridge_command" and int(e.get("keycode", 0)) == 27, "Esc reaching NetHack")
	expect(not (game.dialogs.active is GameMenu and game.dialogs.owns_input()), "Esc after a count does not open the pause menu")
	await wait_for_command_prompt()

	mark()
	await press(KEY_X, 0, false, true)
	await wait_for_named("shim_select_menu")
	await get_tree().process_frame
	await get_tree().create_timer(0.3).timeout
	expect(game.dialogs.active is CharacterSheet, "classic Ctrl+X shows the character sheet")
	await screenshot("character-sheet")
	var sheet := game.dialogs.active as CharacterSheet
	await press(KEY_SHIFT, 0, true)
	expect(game.dialogs.active == sheet and is_instance_valid(sheet), "Shift alone does not dismiss the sheet")
	await press(KEY_ESCAPE)
	await wait_for_command_prompt()

	await type_text("i")
	var inventory := game.dialogs.active as InventoryScreen
	inventory._search.text = "food"
	inventory._rebuild()
	expect(inventory._slots.size() == 1, "inventory search narrows to the food rations")
	inventory._open_popup(inventory._slots[0].item, Vector2(900, 400))
	await screenshot("inventory-search-popup")
	inventory._close_popup()
	inventory.close()
	await get_tree().process_frame

	# Drop two things, step away and back: NetHack lists the pile.
	mark()
	# (NetHack's own D menus, as Partial stacks… reaches them.)
	game.send_keys("D")
	await wait_for_named("shim_select_menu")
	var menu := game.dialogs.active as MenuDialog
	for row in menu.rows:
		if str(row.item.get("text", "")).to_lower().contains("all types"):
			row.pressed.emit()
	menu._confirm()
	await wait_for_named("shim_select_menu")
	menu = game.dialogs.active as MenuDialog
	for row in menu.rows:
		var text := str(row.item.get("text", "")).to_lower()
		if text.contains("dagger") or text.contains("food"):
			row.pressed.emit()
	menu._confirm()
	await wait_for_command_prompt()
	var here := game.state.map.hero
	for key in [KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN]:
		await press(key)
		await wait_for_command_prompt()
		if game.state.map.hero != here:
			var back: Key = {KEY_LEFT: KEY_RIGHT, KEY_RIGHT: KEY_LEFT, KEY_UP: KEY_DOWN, KEY_DOWN: KEY_UP}[key]
			mark()
			await press(back)
			await wait_for_command_prompt()
			break
	await get_tree().create_timer(0.3).timeout
	expect(game.hud.pile_peek.visible, "stepping onto the pile shows the pile peek, not a modal")
	expect(not game.dialogs.owns_input(), "no modal dialog blocks play")
	await screenshot("pile-peek", 0.3)
	# Clicking the pile peek over two stacks opens the floor-and-pack screen.
	await click_control(game.hud.pile_peek)
	await get_tree().create_timer(0.4).timeout
	var floor_view := game.dialogs.active as ContainerScreen
	expect(floor_view != null and floor_view.source == "ground" and floor_view.contents.size() == 2, "the pile peek opens the floor screen with both stacks")
	await screenshot("pile-peek-floor-screen")
	await press(KEY_ESCAPE)
