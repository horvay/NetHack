extends Scenario
## The container screen, on a real large box (bridge fixture: an unlocked
## box with a food ration, a cursed dagger, an apple and a potion under the
## hero; the pack holds a tin opener and a scroll of identify):
##   1. the action bar offers "Open container"; clicking it opens the
##      two-pane screen through the bridge's direct snapshot, not #loot;
##   2. select two rows and Take out: both move to the pack;
##   3. double-click the tin opener in the pack: it moves into the box;
##      drag the scroll onto the box's pane: it moves too;
##   4. Take all empties the box, and no NetHack menu opened on the way;
##   5. a locked chest falls back to NetHack's own #loot, which reports the lock.

const FIXTURE := "container/multi-item-transfer-large-box-on-hero"


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", FIXTURE)
	await press(KEY_ESCAPE)
	await settle_camera()
	var open: Button = await _context_button("Open container")
	if not expect(open != null, "the action bar offers Open container"):
		await screenshot("no-open-button")
		return
	await screenshot("box-underfoot")
	var start := events.size()
	# Several stacks move in one direct transfer (one command, one turn: the
	# container is never reopened), and no NetHack menu may show up.
	var menus_shown := [0]
	var count_menus := func(node: Node) -> void:
		if node is MenuDialog or node is QuestionDialog:
			menus_shown[0] += 1
	get_tree().node_added.connect(count_menus)
	await click_control(open)
	var view := await _wait_for_screen()
	if not expect(view != null, "the container screen opened"):
		await screenshot("no-container-screen")
		return
	expect(events_named("shim_container_snapshot_confirmed", start).size() == 1, "contents came from the direct snapshot")
	await screenshot("container-screen")
	expect(view.contents.size() == 4, "the box shows its 4 items (%d)" % view.contents.size())

	# Select the dagger and the food ration, then Take out.
	for word in ["dagger", "food ration"]:
		var row := _row(view._left, word)
		expect(row != null, "box row for " + word)
		if row:
			await click_control(row)
	expect(view._selected_out.size() == 2, "two box rows selected")
	await click_control(view._move_out)
	await _until(func() -> bool: return view.contents.size() == 2 and _carrying("dagger") and _carrying("food ration"), "dagger and food ration in the pack")
	await screenshot("after-take-out")

	# Double-click the tin opener in the pack: straight into the box.
	var opener := _row(view._right, "tin opener")
	expect(opener != null, "pack row for the tin opener")
	if opener:
		await click_control(opener, true)
	await _until(func() -> bool: return _in_box("tin opener") and not _carrying("tin opener"), "the tin opener in the box")
	await screenshot("after-put-in")

	# Drag the scroll from the pack onto the box's pane.
	var scroll_row := _row(view._right, "scroll")
	expect(scroll_row != null, "pack row for the scroll")
	if scroll_row:
		var target: Rect2 = view._left.get_parent().get_global_rect()
		await drag_between(scroll_row.get_global_rect().get_center(), target.get_center(), "dragging-scroll")
	await _until(func() -> bool: return _in_box("scroll") and not _carrying("scroll"), "the dragged scroll in the box")
	await screenshot("after-drag")

	# Classic letters: the dagger's pack letter selects it, Enter puts it in.
	var dagger_letter := ""
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("dagger"):
			dagger_letter = char(int(item.get("selector", 0)))
	if expect(dagger_letter != "", "the dagger has a pack letter"):
		await type_text(dagger_letter)
		expect(view._selected_in.size() == 1, "typing its letter selects the dagger")
		get_viewport().gui_release_focus()
		await press(KEY_ENTER, 13)
		await _until(func() -> bool: return _in_box("dagger") and not _carrying("dagger"), "the dagger put in by letter")

	# Take all.
	var take_all := _footer_button(view, "Take all")
	await click_control(take_all)
	await _until(func() -> bool: return view.contents.is_empty(), "the box emptied")
	expect(_carrying("apple") and _carrying("tin opener") and _carrying("potion") and _carrying("scroll") and _carrying("dagger"), "everything is in the pack")
	await screenshot("box-emptied")
	get_tree().node_added.disconnect(count_menus)
	expect(menus_shown[0] == 0, "no NetHack menu or question showed up on screen (%d)" % menus_shown[0])
	expect(events_named("bridge_command", start).filter(func(e: Dictionary) -> bool: return int(e.get("keycode", 0)) == 35).is_empty(), "no #loot ran behind the screen")
	expect(events_named("shim_container_transfer_confirmed", start).size() == 5, "Take out (2) and Take all were one transfer each, beside the three single moves (%d)" % events_named("shim_container_transfer_confirmed", start).size())
	expect(events_named("shim_container_transfer_rejected", start).is_empty(), "no transfer was refused")
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.4).timeout
	expect(not (game.dialogs.active is ContainerScreen) or not game.dialogs.owns_input(), "Escape closed the screen")
	await screenshot("closed")

	# A locked chest: the direct path is refused, and NetHack's own #loot
	# takes over quietly (it tells the player about the lock itself).
	session.stop_game()
	await wait_for_game_end(10.0)
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "container/locked-chest-unlock-open-context-on-hero")
	await press(KEY_ESCAPE)
	var open_locked: Button = await _context_button("Open container")
	if expect(open_locked != null, "a locked chest still offers Open container"):
		mark()
		# The fallback types "#loot\n" itself: NetHack's extended-command
		# prompt must not flash the command palette up.
		var palettes := [0]
		var count_palette := func(node: Node) -> void:
			if node is CommandPalette:
				palettes[0] += 1
		get_tree().node_added.connect(count_palette)
		await click_control(open_locked)
		await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_container_snapshot_rejected", "the direct snapshot refused")
		await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("text", "")).to_lower().contains("locked"), "NetHack's lock message")
		await get_tree().create_timer(0.4).timeout
		expect(not (game.dialogs.active is ContainerScreen), "no container screen for a locked chest")
		get_tree().node_added.disconnect(count_palette)
		expect(palettes[0] == 0, "the #loot fallback never showed the command palette (%d)" % palettes[0])
		await screenshot("locked-chest")



	# One class of item with mixed blessed/cursed knowledge: NetHack's "what
	# type of objects?" menu has no "All types" row there. Take all must
	# still empty the box in one move, and the screen must stay usable.
	session.stop_game()
	await wait_for_game_end(10.0)
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "container/single-class-mixed-buc-box-on-hero")
	await press(KEY_ESCAPE)
	var open_scrolls: Button = await _context_button("Open container")
	if expect(open_scrolls != null, "the scroll box offers Open container"):
		await click_control(open_scrolls)
		var box_view := await _wait_for_screen()
		if expect(box_view != null and box_view.contents.size() == 2, "the box shows its two scrolls"):
			var loots := events.size()
			await click_control(_footer_button(box_view, "Take all"))
			await _until(func() -> bool: return box_view.contents.is_empty() and _carrying("scroll"), "both scrolls taken")
			await get_tree().create_timer(0.3).timeout
			expect(not box_view._busy and not box_view._status.text.begins_with("Moving"), "the screen is usable again (not stuck on Moving…)")
			expect(events_named("shim_container_transfer_confirmed", loots).size() == 1, "in one transfer")
			await screenshot("single-class-box-emptied")

func _context_button(label: String) -> Button:
	for i in 60:
		for child in game.hud.action_bar._context_box.get_children():
			if child is Button and str(child.text).begins_with(label) and not child.is_queued_for_deletion():
				await get_tree().create_timer(0.3).timeout
				return child
		await get_tree().process_frame
	return null


func _wait_for_screen() -> ContainerScreen:
	var deadline := Time.get_ticks_msec() + 10000
	while Time.get_ticks_msec() < deadline:
		if game.dialogs.owns_input() and game.dialogs.active is ContainerScreen:
			await get_tree().create_timer(0.3).timeout
			return game.dialogs.active
		await get_tree().process_frame
	return null


func _row(list: VBoxContainer, word: String) -> ItemRow:
	for child in list.get_children():
		if child is ItemRow and not child.is_queued_for_deletion() and child.text.to_lower().contains(word):
			return child
	for child in list.get_children():
		if child is ItemRow and not child.is_queued_for_deletion() and str(child._name.text).to_lower().contains(word):
			return child
	return null


func _footer_button(view: ModalCard, label: String) -> Button:
	for child in view.footer.get_children():
		if child is Button and str(child.text).begins_with(label):
			return child
	return null


func _carrying(word: String) -> bool:
	for item in game.state.inventory:
		if ItemText.display_name(item).to_lower().contains(word):
			return true
	return false


func _in_box(word: String) -> bool:
	var view := game.dialogs.active as ContainerScreen
	if view == null:
		return false
	for item in view.contents:
		if str(item.get("displayName", "")).to_lower().contains(word):
			return true
	return false


func _until(condition: Callable, what: String, timeout := 10.0) -> void:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000.0)
	while not condition.call():
		if Time.get_ticks_msec() > deadline:
			fail("timed out waiting for " + what)
			return
		await get_tree().process_frame
