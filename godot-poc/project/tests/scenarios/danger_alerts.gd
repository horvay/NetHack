extends Scenario
## Life-or-death states can't be missed (bridge fixture: a Valkyrie fainting
## from hunger, with a food ration):
##   1. a pulsing alert at the top says FAINTING FROM HUNGER, the screen edge
##      glows red, and the alarm sounds once;
##   2. it stays visible over an open panel;
##   3. its Eat button starts NetHack's eat; eating the ration clears it.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "status/fainting-hunger")
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.5).timeout
	var alert: DangerAlert = game.danger
	note("hunger: %s, alerts: %s" % [game.state.status.hunger(), alert.alerts().map(func(a: Dictionary) -> String: return str(a.title))])
	expect(alert.panel.visible and alert.title_label.text == "FAINTING FROM HUNGER", "the alert says FAINTING FROM HUNGER (%s)" % alert.title_label.text)
	expect(alert._glow.visible, "the screen edge glows red")
	var audio = game.get_node("AudioDirector")
	note("deadly states seen: %s" % [alert._seen_at.keys()])
	# Once per deadly state (passing out, "Fainted", is a new one), never
	# again for status updates of the same state.
	expect(int(audio.played.get("alarm", 0)) >= 1 and int(audio.played.get("alarm", 0)) <= alert._seen_at.size(), "the alarm sounded once per deadly state (%d for %d)" % [int(audio.played.get("alarm", 0)), alert._seen_at.size()])
	expect(alert.action_button.visible, "it offers Eat")
	await screenshot("fainting-alert", 0.3)

	# Over an open panel it still shows.
	await type_text("i")
	await get_tree().create_timer(0.4).timeout
	expect(game.dialogs.active is InventoryScreen and alert.panel.visible and alert.layer > game.dialogs.layer, "the alert stays above the open inventory")
	await screenshot("alert-over-inventory", 0.2)
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.3).timeout

	# Eat from the alert: NetHack asks what to eat; the ration.
	mark()
	await click_control(alert.action_button)
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("eat"), "what to eat")
	var ration := ""
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("food ration"):
			ration = char(int(item.get("selector", 0)))
	await type_text(ration)
	var deadline := Time.get_ticks_msec() + 30000
	while Time.get_ticks_msec() < deadline and game.state.status.hunger() in ["Fainting", "Fainted", "Weak"]:
		var request := game.state.request
		if str(request.get("kind", "")) == "yn" and game.dialogs.active is QuestionDialog:
			await type_text("y")
		await get_tree().process_frame
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	note("after eating: %s" % game.state.status.hunger())
	expect(not alert.panel.visible and not alert._glow.visible, "eating cleared the alert")
	await screenshot("after-eating")
