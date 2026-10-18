extends Scenario
## Negative statuses can't be missed (bridge fixture: a hero a few turns
## from Hungry, with a potion of blindness and one of confusion):
##   1. resting until hunger sets in: a HUNGRY card slides in with its icon
##      and meaning, and a yellow Hungry badge stays under the stats;
##   2. drinking blindness: a BLIND card, an orange pulsing badge, and the map
##      darkens around the middle;
##   3. drinking confusion while blind: a CONFUSED card queued behind any
##      other, and the view sways;
##   4. #pray asks first and shows the hero's hit points and states (blind,
##      confused); No backs out.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "status/near-hungry-with-potions")
	await press(KEY_ESCAPE)
	var announcer: StatusAnnouncer = game.status_announcer
	expect(not _badges().has("Hungry"), "not hungry at the start (%s)" % [_badges()])
	# Rest a few turns (classic count: 20s).
	await type_text("20s")
	var card := await _wait_card("Hungry", 15.0)
	await wait_for_command_prompt()
	if expect(card != null, "a Hungry card was announced"):
		expect(_card_text(card).contains("HUNGRY") and _card_text(card).contains("Eat soon"), "it names hunger and says what it means (%s)" % _card_text(card))
		await screenshot("hungry-announced")
	expect(_badges().has("Hungry"), "a Hungry badge stays on the hero card (%s)" % [_badges()])

	var potions := {}
	for item in game.state.inventory:
		var name := ItemText.display_name(item)
		if name.contains("blindness"):
			potions["blind"] = char(int(item.get("selector", 0)))
		if name.contains("confusion"):
			potions["conf"] = char(int(item.get("selector", 0)))
	await _quaff(potions.get("blind", ""))
	card = await _wait_card("blind", 10.0)
	if expect(card != null, "a Blind card was announced"):
		await get_tree().create_timer(1.2).timeout
		expect(game.status_effects.strength("blind") > 0.9, "the map darkens around the middle (%.2f)" % game.status_effects.strength("blind"))
		await screenshot("blind-announced")
	expect(_badges().has("Blind"), "a Blind badge (%s)" % [_badges()])

	await _quaff(potions.get("conf", ""))
	card = await _wait_card("conf", 12.0)
	if expect(card != null, "a Confused card was announced"):
		await get_tree().create_timer(1.0).timeout
		expect(game.status_effects.strength("sway") > 0.5 or not Motion.enabled(), "the view sways while confused (%.2f)" % game.status_effects.strength("sway"))
		await screenshot("confused-announced")
	await get_tree().create_timer(0.4).timeout
	await screenshot("badges", 0.2)
	note("badges: %s" % [_badges()])
	expect(_badges().has("Confused") and _badges().has("Blind") and _badges().has("Hungry"), "all three badges show")


	mark()
	game.send_keys("#pray\n")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_yn_function" and str(e.get("query", "")).to_lower().contains("pray"), "are you sure you want to pray")
	await get_tree().create_timer(0.3).timeout
	var question := game.dialogs.active as QuestionDialog
	var facts: Node = question.find_child("PrayerFacts", true, false) if question else null
	var said := " ".join(facts.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)) if facts else ""
	note("prayer facts: %s" % said)
	expect(facts != null and said.contains("Blind") and said.contains("Confused"), "the pray question shows the hero's states, as plain facts")
	await screenshot("pray-question")
	await type_text("n")
	await wait_for_command_prompt()

func _quaff(letter: String) -> void:
	if letter == "":
		fail("no potion to quaff")
		return
	await type_text("q")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("drink"), "what to drink")
	await type_text(letter)
	await wait_for_command_prompt()


## The announcement card for a status, once it shows (null if it never does).
func _wait_card(id: String, seconds: float) -> Control:
	var deadline := Time.get_ticks_msec() + int(seconds * 1000.0)
	while Time.get_ticks_msec() < deadline:
		for child in game.status_announcer.get_children():
			if child is Control and str(child.get_meta("status_id", "")) == id and not child.get_meta("ended", false):
				return child
		# NetHack may stop at --More--style questions while resting.
		await get_tree().process_frame
	return null


func _card_text(card: Control) -> String:
	return " ".join(card.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text))


func _badges() -> Array:
	return game.hud.conditions_row.get_children().filter(func(c: Node) -> bool: return not c.is_queued_for_deletion()).map(func(c: Node) -> String:
		var labels: Array = c.find_children("*", "Label", true, false)
		return (labels[0] as Label).text if not labels.is_empty() else "")
