extends Scenario
## Classic keys reach the purpose-built screens (bridge fixture: the hero on
## a pile of a dagger and three splint mails, carrying food):
##   1. typed , on a pile of two or more opens the floor-and-pack screen,
##      not NetHack's plain pickup list;
##   2. typed D (drop several) opens the same screen; two splint mails picked
##      in the pack column drop in one go;
##   3. I opens the inventory screen and * the equipment screen, not
##      NetHack's plain lists;
##   4. * at "What do you want to drop?" lists the pack under that question,
##      not under "Choose".


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "ground/heavy-pile-near-burdened")
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.4).timeout
	mark()
	await type_text(",")
	await get_tree().create_timer(0.5).timeout
	var floor_view := game.dialogs.active as ContainerScreen
	expect(floor_view != null and floor_view.source == "ground", ", opens the floor-and-pack screen (%s)" % game.dialogs.active)
	expect(events_named("shim_select_menu").is_empty(), "and NetHack's pickup list never showed")
	await screenshot("comma-floor-screen")
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.3).timeout

	mark()
	await type_text("D")
	await get_tree().create_timer(0.5).timeout
	var drop_view := game.dialogs.active as ContainerScreen
	if expect(drop_view != null and drop_view.source == "ground", "D opens the floor-and-pack screen (%s)" % game.dialogs.active):
		var picked := 0
		for i in 2:
			for child in drop_view._right.get_children():
				if child is ItemRow and not child.is_queued_for_deletion() and str(child._name.text).contains("splint mail") and not child.selected:
					await click_control(child)
					picked += 1
					break
		var on_floor := game.state.map.pile(game.state.map.hero).size()
		await click_control(drop_view._move_in)
		var deadline := Time.get_ticks_msec() + 8000
		while Time.get_ticks_msec() < deadline and game.state.map.pile(game.state.map.hero).size() < on_floor + picked:
			await get_tree().process_frame
		expect(game.state.map.pile(game.state.map.hero).size() == on_floor + 2, "the two splint mails were dropped (%d -> %d)" % [on_floor, game.state.map.pile(game.state.map.hero).size()])
		await screenshot("drop-several")
		await press(KEY_ESCAPE)
		await get_tree().create_timer(0.3).timeout
	for spec in [["I", "InventoryScreen"], ["*", "EquipmentScreen"]]:
		await type_text(spec[0])
		await get_tree().create_timer(0.5).timeout
		var opened := game.dialogs.active
		expect(opened != null and opened.get_script() != null and str(opened.get_script().get_global_name()) == spec[1], "%s opens the %s (%s)" % [spec[0], spec[1], opened])
		await screenshot("key-%s" % ("I" if spec[0] == "I" else "star"))
		await press(KEY_ESCAPE)
		await get_tree().create_timer(0.3).timeout
	mark()
	await type_text("d")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("drop"), "what to drop")
	await get_tree().create_timer(0.3).timeout
	await type_text("*")
	await wait_for_named("shim_select_menu")
	await get_tree().create_timer(0.3).timeout
	# The pack list is the item grid, titled with the question.
	var menu := game.dialogs.active as ItemPickScreen
	note("title: %s" % (menu.title_label.text if menu else "none"))
	expect(menu != null and menu.title_label.text.to_lower().contains("drop"), "the list is the item grid and keeps the question as its title (%s)" % (menu.title_label.text if menu else game.dialogs.active))
	await screenshot("drop-star-list")
	# Esc closes the list and returns to the question (as in tty); Esc again
	# cancels the drop.
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.4).timeout
	if not game.state.is_waiting_for_command():
		await press(KEY_ESCAPE)
	await wait_for_command_prompt()
