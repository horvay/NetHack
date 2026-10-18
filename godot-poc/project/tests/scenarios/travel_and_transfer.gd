extends Scenario
## Click-to-travel and the transfer screens, through real input:
##   1. left-click a distant floor square: NetHack's own travel walks there;
##   2. D (drop several): category menu, then the drop screen — drop the
##      dagger and ONE of two food rations using the stack stepper;
##   3. , (pick up): the pickup screen — take everything back.


func run() -> void:
	await start_game("Brunhild-Val-Hum-Fem-Law", "1001")
	await press(KEY_ESCAPE)
	var start := game.state.map.hero
	var target := _floor_cell_away_from(start, 3)
	expect(target.x >= 0, "found a floor square to travel to")
	mark()
	await click_cell(target)
	await wait_for_named("bridge_map_click_accepted")
	await wait_for_command_prompt()
	note("travel %s -> %s (clicked %s)" % [start, game.state.map.hero, target])
	expect(game.state.map.hero == target, "click-to-travel reached the clicked square, at %s" % game.state.map.hero)
	await screenshot("after-travel")

	var food_before := _quantity_of("food ration")
	expect(food_before >= 2, "Valkyrie carries food rations (%d)" % food_before)
	mark()
	# NetHack's own D menus (typed D opens the floor-and-pack screen, tested in
	# classic_keys_screens; "Partial stacks…" reaches these).
	game.send_keys("D")
	var categories := await _wait_menu()
	await screenshot("drop-categories")
	var menu := game.dialogs.active as MenuDialog
	for row in menu.rows:
		if str(row.item.get("text", "")).to_lower().contains("all types"):
			row.pressed.emit()
	menu._confirm()
	var drop_menu := await _wait_menu()
	menu = game.dialogs.active as MenuDialog
	expect(menu != null and menu.transfer, "the second drop menu is shown as a transfer screen")
	for row in menu.rows:
		var text := str(row.item.get("text", "")).to_lower()
		if text.contains("dagger") or text.contains("food ration"):
			row.pressed.emit()
			if text.contains("food ration"):
				row.quantity_spin.value = 1
	await screenshot("drop-screen")
	menu._confirm()
	await wait_for_command_prompt()
	expect(_quantity_of("dagger") == 0, "dagger dropped")
	expect(_quantity_of("food ration") == food_before - 1, "exactly one food ration dropped (have %d)" % _quantity_of("food ration"))

	mark()
	# NetHack's own pickup list (shops and Partial stacks… use it; typed ,
	# opens the floor-and-pack screen, tested in classic_keys_screens).
	game.send_keys(",")
	await _wait_menu()
	menu = game.dialogs.active as MenuDialog
	expect(menu != null and menu.transfer, "pickup is shown as a transfer screen")
	await screenshot("pickup-screen")
	# Keyboard only: arrows move the highlight, Space toggles the row under
	# it, Enter confirms (as in tty).
	for i in 6:
		await get_tree().process_frame
	var picked := {}
	for step in [KEY_DOWN, KEY_UP]:
		await press(step)
		var focused := get_viewport().gui_get_focus_owner()
		if focused is ItemRow and menu.rows.has(focused):
			picked[str(focused.item.get("text", ""))] = true
		await press(KEY_SPACE, 32)
	note("toggled with the keyboard: %s" % [picked.keys()])
	expect(picked.size() == 2, "arrows reached both rows")
	var chosen := menu.rows.filter(func(r: ItemRow) -> bool: return r.selected)
	expect(chosen.size() == 2, "Space toggled both highlighted rows (%d selected)" % chosen.size())
	await screenshot("pickup-keyboard")
	# Enter on a focused footer button presses that button (Clear), it
	# doesn't confirm the menu; then , selects everything again.
	for node in menu.footer.get_children():
		if node is Button and (node as Button).text.begins_with("Clear"):
			(node as Button).grab_focus()
	await press(KEY_ENTER, 13)
	await get_tree().create_timer(0.2).timeout
	expect(is_instance_valid(menu) and game.dialogs.active == menu and menu.rows.all(func(r: ItemRow) -> bool: return not r.selected), "Enter on Clear cleared the picks and kept the menu open")
	get_viewport().gui_release_focus()
	await type_text(",")
	await press(KEY_ENTER, 13)
	await wait_for_command_prompt()
	expect(_quantity_of("dagger") == 1, "dagger picked back up")
	expect(_quantity_of("food ration") == food_before, "food rations back to %d" % food_before)
	await screenshot("after-pickup")

	# The single-item picker's count stepper drops part of a stack (like 1d).
	var before := _quantity_of("food ration")
	mark()
	await type_text("d")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("drop"), "drop question")
	await get_tree().create_timer(0.2).timeout
	var picker := game.dialogs.active as QuestionDialog
	var ration_row: ItemRow = null
	if picker:
		# (find_children can't match script classes: filter Buttons.)
		for node in picker.find_children("*", "Button", true, false):
			if node is ItemRow and ItemText.display_name((node as ItemRow).item).contains("food ration"):
				ration_row = node
	if not expect(ration_row != null and ration_row.quantity_spin.visible, "the food ration stack offers a count"):
		await press(KEY_ESCAPE)
		await wait_for_command_prompt()
	else:
		ration_row.quantity_spin.value = 1
		await screenshot("drop-count")
		await click_control(ration_row)
		await wait_for_command_prompt()
		await get_tree().create_timer(0.2).timeout
		expect(_quantity_of("food ration") == before - 1, "exactly one food ration dropped (have %d of %d)" % [_quantity_of("food ration"), before])


	# The floor-and-pack screen (Electron's ground items panel): the bar's
	# Pick up opens it over the known pile; drag a pack row onto the floor,
	# then Pick up all.
	# A second stack on the floor (classic d): two stacks open the screen,
	# one would go up at once with ,.
	var dagger_letter := ""
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("dagger"):
			dagger_letter = char(int(item.get("selector", 0)))
	mark()
	await type_text("d")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("drop"), "drop question")
	await type_text(dagger_letter)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	note("pile here: %s" % [game.state.map.pile(game.state.map.hero).map(func(i: Dictionary) -> String: return str(i.get("displayName", "")))])
	var pickup: Button = null
	for child in game.hud.action_bar._context_box.get_children():
		if child is Button and str(child.text).begins_with("Pick up") and not child.is_queued_for_deletion():
			pickup = child
	if expect(pickup != null and pickup.text == "Pick up…", "the bar offers Pick up… over two stacks (%s)" % (pickup.text if pickup else "")):
		await click_control(pickup)
		await get_tree().create_timer(0.4).timeout
		var floor_view := game.dialogs.active as ContainerScreen
		if expect(floor_view != null and floor_view.source == "ground", "Pick up opens the floor-and-pack screen"):
			await screenshot("floor-screen")
			var pack_rations: ItemRow = null
			for child in floor_view._right.get_children():
				if child is ItemRow and ItemText.display_name((child as ItemRow).item).contains("food ration"):
					pack_rations = child
			if expect(pack_rations != null, "the pack pane lists the food rations"):
				var rations := _quantity_of("food ration")
				await drag_between(pack_rations.get_global_rect().get_center(), floor_view._left.get_parent().get_global_rect().get_center(), "dragging-to-floor")
				var until := Time.get_ticks_msec() + 10000
				while Time.get_ticks_msec() < until and _quantity_of("food ration") == rations:
					await get_tree().process_frame
				expect(_quantity_of("food ration") == 0, "dragging the rations onto the floor dropped them")
				await get_tree().create_timer(0.3).timeout
				await screenshot("after-floor-drop")
			# Two stacks, one turn: NetHack's own pickup does them together.
			var since := events.size()
			for node in floor_view.footer.get_children():
				if node is Button and (node as Button).text.begins_with("Pick up all"):
					await click_control(node)
			var until2 := Time.get_ticks_msec() + 10000
			while Time.get_ticks_msec() < until2 and not (floor_view.contents.is_empty() and _quantity_of("dagger") == 1):
				await get_tree().process_frame
			expect(_quantity_of("dagger") == 1 and _quantity_of("food ration") == before, "Pick up all took everything back (%d daggers, %d rations)" % [_quantity_of("dagger"), _quantity_of("food ration")])
			expect(events_named("shim_ground_transfer_rejected").is_empty(), "no ground transfer was refused")
			await wait_for_command_prompt()
			var commands := commands_run(0, since).map(func(e: Dictionary) -> String: return char(int(e.get("keycode", 0))))
			# (The menu's letters show up as keys too; only one command ran.)
			expect(commands.count(",") == 1 and events_named("shim_ground_transfer_accepted", since).is_empty() and events_named("bridge_command_prompt", since).size() == 1, "two stacks went up in one NetHack pickup, one turn (%s)" % [commands])
			expect(game.dialogs.active == floor_view, "the floor screen stayed open (no NetHack menu flashed up)")
			await screenshot("floor-picked-up")
			# Select two pack rows and Drop: one NetHack D, one turn.
			for word in ["dagger", "food ration"]:
				for child in floor_view._right.get_children():
					if child is ItemRow and ItemText.display_name((child as ItemRow).item).contains(word) and not child.is_queued_for_deletion():
						await click_control(child)
						break
			var drop_since := events.size()
			for node in floor_view.footer.get_children():
				if node is Button and (node as Button).text.begins_with("Drop 2"):
					await click_control(node)
			var until3 := Time.get_ticks_msec() + 10000
			while Time.get_ticks_msec() < until3 and not (_quantity_of("dagger") == 0 and _quantity_of("food ration") == 0):
				await get_tree().process_frame
			await wait_for_command_prompt()
			var drop_keys := commands_run(0, drop_since).map(func(e: Dictionary) -> String: return char(int(e.get("keycode", 0))))
			expect(_quantity_of("dagger") == 0 and _quantity_of("food ration") == 0 and drop_keys.count("D") == 1 and events_named("bridge_command_prompt", drop_since).size() == 1, "Drop 2 dropped both in one NetHack D (%s)" % [drop_keys])
			await get_tree().create_timer(0.3).timeout
			expect(floor_view.contents.size() == 2, "the floor pane lists them (%d)" % floor_view.contents.size())
			await screenshot("floor-dropped-two")
			await press(KEY_ESCAPE)


func _wait_menu() -> Dictionary:
	return await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_select_menu", "a menu")


func _quantity_of(word: String) -> int:
	var total := 0
	for item in game.state.inventory:
		if ItemText.display_name(item).to_lower().contains(word):
			total += int(item.get("quantity", 1))
	return total


func _floor_cell_away_from(from: Vector2i, distance: int) -> Vector2i:
	var best := Vector2i(-1, -1)
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			var cell := Vector2i(x, y)
			var info := Terrain.classify(game.state.map.cell(cell))
			if info.kind != Terrain.Kind.FLOOR or str(game.state.map.cell(cell).get("actorId", "")) != "":
				continue
			if not game.state.map.cell(cell).has("cmapIndex"):
				continue
			var d := maxi(absi(x - from.x), absi(y - from.y))
			if d == distance:
				return cell
	return best
