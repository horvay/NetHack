extends Scenario
## "Which ring-finger, Right or Left? [rl]" has no yes, no or quit answer
## (bridge fixture: a ring, both hands free). Backing out with Enter or Esc
## must end P quietly, as in tty, never with "Program in disorder!"; r then
## puts the ring on the right hand.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "object/ring-to-put-on")
	await press(KEY_ESCAPE)
	var ring := ""
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("ring of adornment"):
			ring = char(int(item.get("selector", 0)))
	if not expect(ring != "", "the hero carries the ring"):
		return
	for key in [KEY_ENTER, KEY_ESCAPE]:
		mark()
		await type_text("P")
		await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("put on"), "what to put on")
		await type_text(ring)
		await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_yn_function" and str(e.get("query", "")).to_lower().contains("ring-finger"), "which ring-finger")
		await get_tree().create_timer(0.3).timeout
		if key == KEY_ENTER:
			await screenshot("ring-finger-question")
		await press(key, 13 if key == KEY_ENTER else 27)
		await wait_for_command_prompt()
		await get_tree().create_timer(0.3).timeout
		var said := game.state.messages.entries.map(func(e: Dictionary) -> String: return str(e.text).to_lower())
		expect(not said.any(func(t: String) -> bool: return t.contains("program in disorder") or t.contains("yn_function")), "%s at the finger question backs out quietly" % ("Enter" if key == KEY_ENTER else "Esc"))
		expect(not game.state.inventory.any(func(i: Dictionary) -> bool: return int(i.get("wornMask", 0)) & 0x60000), "and the ring is not on")
	mark()
	await type_text("P")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("put on"), "what to put on")
	await type_text(ring)
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_yn_function" and str(e.get("query", "")).to_lower().contains("ring-finger"), "which ring-finger")
	await get_tree().create_timer(0.3).timeout
	await type_text("r")
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	expect(game.state.inventory.any(func(i: Dictionary) -> bool: return int(i.get("wornMask", 0)) & 0x40000), "r puts the ring on the right hand")
