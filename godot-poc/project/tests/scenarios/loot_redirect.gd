extends Scenario
## Opening a container the classic way (bridge fixture: an unlocked large box
## with two scrolls on the hero's square): #loot typed in full. NetHack's
## "Do what with the large box?" menu never shows; the two-pane screen opens
## for that box, lists its contents, and moving a scroll out works. Then a
## sack carried in the pack, applied with a + its letter: the same screen,
## without the sack in the pack column; one item in by double-click, two out
## together (NetHack's own apply menu, answered by the screen).


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "container/single-class-mixed-buc-box-on-hero")
	await press(KEY_ESCAPE)
	var menu_shown := [false]
	var watch := func() -> void:
		if game.dialogs.active is MenuDialog and str((game.dialogs.active as MenuDialog).request.get("prompt", "")).to_lower().contains("do what with"):
			menu_shown[0] = true
	get_tree().process_frame.connect(watch)
	mark()
	await type_text("#")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("promptPurpose") == "prompt.extendedCommand" and e.get("lifecycle") == "opened", "extended command")
	await type_text("loot")
	await press(KEY_ENTER, 13)
	var asked := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_select_menu", "NetHack's loot menu")
	expect(not asked.is_empty(), "NetHack offered its Do what with…? menu")
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ContainerScreen:
		await get_tree().process_frame
	get_tree().process_frame.disconnect(watch)
	var view := game.dialogs.active as ContainerScreen
	expect(view != null, "#loot opened the two-pane container screen")
	expect(not menu_shown[0], "NetHack's Do what with…? menu was never shown")
	if view == null:
		return
	await get_tree().create_timer(0.4).timeout
	note("contents: %s" % [view.contents.map(func(i: Dictionary) -> String: return str(i.get("displayName", "")))])
	expect(view.contents.size() == 2, "the screen lists the box's two scrolls (%d)" % view.contents.size())
	await screenshot("loot-redirected")
	# Take one out with a double-click.
	var row: Control = null
	for child in view._left.get_children():
		if child is ItemRow and not child.is_queued_for_deletion() and str(child._name.text).to_lower().contains("scroll"):
			row = child
			break
	if expect(row != null, "a scroll has a row in the box pane"):
		var before := game.state.inventory.size()
		await click_control(row, true)
		deadline = Time.get_ticks_msec() + 8000
		while Time.get_ticks_msec() < deadline and game.state.inventory.size() == before:
			await get_tree().process_frame
		expect(game.state.inventory.size() == before + 1, "the scroll moved into the pack")
		await get_tree().create_timer(0.3).timeout
		await screenshot("scroll-taken")

	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.3).timeout
	await _carried_sack()


func _carried_sack() -> void:
	session.stop_game()
	await wait_for_game_end(10.0)
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "container/carried-sack-with-items")
	await press(KEY_ESCAPE)
	var sack := {}
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("bag"):
			sack = item
	if not expect(not sack.is_empty(), "the hero carries a sack (shown as a bag)"):
		return
	var menu_shown := [false]
	var watch := func() -> void:
		if game.dialogs.active is MenuDialog and str((game.dialogs.active as MenuDialog).request.get("prompt", "")).to_lower().contains("do what with"):
			menu_shown[0] = true
	get_tree().process_frame.connect(watch)
	mark()
	await type_text("a")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("apply"), "what to apply")
	await type_text(char(int(sack.get("selector", 0))))
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ContainerScreen:
		await get_tree().process_frame
	var view := game.dialogs.active as ContainerScreen
	expect(view != null, "applying the sack opened the two-pane screen")
	expect(not menu_shown[0], "NetHack's Do what with your sack? menu was never shown")
	if view == null:
		get_tree().process_frame.disconnect(watch)
		return
	await get_tree().create_timer(0.4).timeout
	expect(view.contents.size() == 2, "the screen lists the sack's two items (%d)" % view.contents.size())
	expect(_row(view._right, "bag") == null, "the sack itself isn't offered for putting into itself")
	await screenshot("carried-sack")
	# The dagger in, by double-click.
	var dagger := _row(view._right, "dagger")
	if expect(dagger != null, "the pack column lists the dagger"):
		await click_control(dagger, true)
		deadline = Time.get_ticks_msec() + 8000
		while Time.get_ticks_msec() < deadline and view.contents.size() < 3:
			await get_tree().process_frame
		expect(view.contents.size() == 3, "the dagger went into the sack (%d)" % view.contents.size())
	# Two out together: NetHack's apply menu, answered by the screen.
	await get_tree().create_timer(0.3).timeout
	for word in ["scroll", "food ration"]:
		var row := _row(view._left, word)
		if row:
			await click_control(row)
	var before := game.state.inventory.size()
	await click_control(view._move_out)
	deadline = Time.get_ticks_msec() + 10000
	while Time.get_ticks_msec() < deadline and (view._busy or game.state.inventory.size() < before + 2):
		await get_tree().process_frame
	get_tree().process_frame.disconnect(watch)
	note("status: %s" % view._status.text)
	expect(game.state.inventory.size() == before + 2, "the scroll and the ration came out together (%d -> %d)" % [before, game.state.inventory.size()])
	expect(not menu_shown[0], "and NetHack's menu never showed for the batch either")
	expect(game.dialogs.active == view and view.visible, "the screen is back after the batch")
	await get_tree().create_timer(0.3).timeout
	await screenshot("carried-sack-after")


func _row(list: VBoxContainer, word: String) -> ItemRow:
	for child in list.get_children():
		if child is ItemRow and not child.is_queued_for_deletion() and str(child._name.text).to_lower().contains(word):
			return child
	return null
