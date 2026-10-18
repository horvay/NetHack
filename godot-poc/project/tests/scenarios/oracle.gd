extends Scenario
## An Oracle consultation is a parchment (RecordScreen "oracle"): fixture on
## the Oracle's level, the hero (level 1) beside her with 693 gold; #chat, decline
## the minor consultation (a rumour in the feed), accept the major one, and NetHack's opening line heads the parchment.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "special/oracle-consultation")
	await press(KEY_ESCAPE)
	var hero := game.state.map.hero
	var next_to: Array = game.state.map.actors().values().filter(func(p: Vector2i) -> bool: return absi(p.x - hero.x) <= 1 and absi(p.y - hero.y) <= 1)
	note("beside the hero: %s  ·  gold %d" % [next_to, game.state.status.number(StatusModel.Field.GOLD)])
	if not expect(not next_to.is_empty(), "someone stands beside the hero"):
		await screenshot("no-oracle")
		return
	mark()
	game.send_keys("#chat\n")
	await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("query", "")).begins_with("Talk to whom"), "Talk to whom?")
	await get_tree().create_timer(0.3).timeout
	game.send_keys(game.state.direction_key(next_to[0] - hero))
	var question := await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("name", "")) == "shim_yn_function" and e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("consult"), "the Oracle's offer")
	note("asked: %s" % question.get("query", ""))
	await get_tree().create_timer(0.4).timeout
	# The minor one is a rumour in the feed; the major one is the parchment.
	await type_text("n")
	var major := await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("name", "")) == "shim_yn_function" and e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("major"), "the major consultation")
	note("then: %s" % major.get("query", ""))
	await get_tree().create_timer(0.4).timeout
	await type_text("y")
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and not (game.dialogs.active is RecordScreen and (game.dialogs.active as RecordScreen).kind == "oracle"):
		await get_tree().process_frame
	var page := game.dialogs.active as RecordScreen
	if not expect(page != null and page.kind == "oracle", "the consultation is a parchment (%s)" % game.dialogs.active):
		await screenshot("no-parchment")
		return
	await get_tree().create_timer(0.5).timeout
	expect(page.subtitle_label.text.begins_with("The Oracle"), "NetHack's opening line heads it (%s)" % page.subtitle_label.text)
	expect(not page.entries.is_empty(), "the Oracle's words are there")
	await screenshot("oracle")
	await press(KEY_SPACE, 32)
	await wait_for_command_prompt()
