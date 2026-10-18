extends Scenario
## Closing the window during a wish (bridge fixture: a wand of wishing):
##   - the app asks first, since saving would answer the wish with nothing;
##   - Cancel keeps the wish open and the game running;
##   - confirming saves the run (the wish is lost) and quits.

const NAME := "Wisher"


func run() -> void:
	for save in app.session.catalog().saves():
		if save.name == NAME:
			DirAccess.remove_absolute(save.path)
	await start_fixture(NAME + "-Val-Hum-Fem-Law", "object/wand-of-wishing")
	await press(KEY_ESCAPE)
	var wand := {}
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("wishing"):
			wand = item
	if not expect(not wand.is_empty(), "the hero carries the wand of wishing"):
		return
	mark()
	# z, then the wand's letter when NetHack asks.
	await type_text("z")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("zap"), "what to zap")
	await type_text(char(int(wand.get("selector", 0))))
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_getlin" and str(e.get("query", e.get("prompt", ""))).to_lower().contains("wish"), "the wish prompt")
	await get_tree().create_timer(0.3).timeout
	expect(game.dialogs.active is LineDialog, "the wish is asked in a text dialog")

	var quit_calls := [0]
	app.quit_handler = func() -> void: quit_calls[0] += 1
	# The window's close button, as the OS sends it.
	get_tree().root.propagate_notification(NOTIFICATION_WM_CLOSE_REQUEST)
	await get_tree().create_timer(0.3).timeout
	var confirm := game.dialogs.blocking_modal() as ConfirmDialog
	expect(confirm != null, "closing during a wish asks first")
	await screenshot("close-during-wish")
	if confirm == null:
		return
	# Cancel: the wish stays open, nothing is saved.
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.3).timeout
	expect(game.dialogs.blocking_modal() == null, "Esc dismissed the question")
	expect(session.is_running() and str(game.state.request.get("kind", "")) == "line", "the wish is still waiting")
	expect(ended_results.is_empty() and quit_calls[0] == 0, "nothing was saved or quit")

	# Close again and confirm: the run is saved and the app quits.
	get_tree().root.propagate_notification(NOTIFICATION_WM_CLOSE_REQUEST)
	await get_tree().create_timer(0.3).timeout
	confirm = game.dialogs.blocking_modal() as ConfirmDialog
	if expect(confirm != null, "asked again on the second close"):
		var go: Button = null
		for node in confirm.find_children("*", "Button", true, false):
			if (node as Button).text.begins_with("Save and quit"):
				go = node
		expect(go != null, "the card offers Save and quit anyway")
		if go:
			await click_control(go)
		# The app answers everything itself while saving: just wait.
		var deadline := Time.get_ticks_msec() + 20000
		while ended_results.is_empty() and Time.get_ticks_msec() < deadline:
			await get_tree().process_frame
		var ended: Dictionary = ended_results.pop_front() if not ended_results.is_empty() else {}
		expect(ended.get("reason") == "exit", "the run was saved (%s)" % [ended])
		expect(quit_calls[0] == 1, "and the app quit")
		expect(app.session.catalog().saves().any(func(s: Dictionary) -> bool: return s.name == NAME), "the save exists")
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	for save in app.session.catalog().saves():
		if save.name == NAME:
			DirAccess.remove_absolute(save.path)
