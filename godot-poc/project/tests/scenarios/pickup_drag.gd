extends Scenario
## Dragging from the floor into the pack (real mouse, real game from a
## bridge fixture): each stack lands in the pack, and the screen redraws
## once or twice for the move however many updates NetHack sends (it used
## to rebuild every row about 12 times in one frame: a visible hitch).


func run() -> void:
	await start_fixture("Drag-Val-Hum-Fem-Law", "ground/pickup-pile-on-hero")
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.4).timeout
	for child in game.hud.action_bar._context_box.get_children():
		if child is Button and str(child.text).begins_with("Pick up") and not child.is_queued_for_deletion():
			await click_control(child)
			break
	await get_tree().create_timer(0.6).timeout
	var view := game.dialogs.active as ContainerScreen
	if not expect(view != null and view.contents.size() == 3, "the floor screen lists the three stacks"):
		return
	await screenshot("floor")
	for round in 3:
		var item: Dictionary = view.contents[0]
		var id := int(item.get("objectId", 0))
		var row: Control = view._left.get_child(0)
		var renders := view.renders
		mark()
		await drag_between(row.get_global_rect().get_center(), view._right.get_global_rect().get_center())
		var deadline := Time.get_ticks_msec() + 5000
		while Time.get_ticks_msec() < deadline and not (game.state.inventory.any(func(i: Dictionary) -> bool: return int(i.get("objectId", 0)) == id) and not view._busy):
			await get_tree().process_frame
		await get_tree().create_timer(0.3).timeout
		expect(game.state.inventory.any(func(i: Dictionary) -> bool: return int(i.get("objectId", 0)) == id), "%s went into the pack" % item.get("displayName", id))
		expect(view.renders - renders <= 3, "the screen redrew %d times for the move" % (view.renders - renders))
	expect(view.contents.is_empty(), "the floor is empty (%d left)" % view.contents.size())
	await screenshot("all-picked-up")
