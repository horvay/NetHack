extends Scenario
## Advancing a skill (bridge fixture: a Valkyrie whose long sword skill can
## be advanced; NetHack says "You feel more confident in your weapon
## skills."):
##   1. a gold SKILL READY card with Open skills, and a Skill ready badge on
##      the hero card;
##   2. Open skills shows the skills screen: NetHack's groups, rank pips,
##      long sword ready with an Advance button, the free slots;
##   3. Advance answers NetHack's menu: "You are now more skilled in long
##      sword."; the card and the badge go away.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "skills/long-sword-ready")
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.5).timeout
	expect(game.state.skill_ready, "NetHack's 'more confident' message marked a skill ready")
	var card: Control = null
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and card == null:
		card = game.status_announcer.get_node_or_null("SkillReady")
		await get_tree().process_frame
	if not expect(card != null, "a SKILL READY card is shown"):
		return
	expect(game.hud.conditions_row.get_node_or_null("Status_skill") != null, "and a Skill ready badge on the hero card")
	await get_tree().create_timer(0.4).timeout
	await screenshot("skill-ready-card")
	var open: Button = null
	for b in card.find_children("*", "Button", true, false):
		if (b as Button).text.begins_with("Open skills"):
			open = b
	await click_control(open)
	deadline = Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is SkillsScreen:
		await get_tree().process_frame
	var skills := game.dialogs.active as SkillsScreen
	if not expect(skills != null, "Open skills shows the skills screen"):
		return
	await get_tree().create_timer(0.5).timeout
	var sword: Control = skills.find_child("Skill_long_sword", true, false)
	note("rows: %d, slots %d" % [skills.rows.size(), skills.slots])
	expect(skills.rows.size() > 3 and skills.slots >= 1, "it lists the skills and the free slots")
	expect(skills.rows.any(func(r: Dictionary) -> bool: return str(r.get("group", "")) != ""), "in NetHack's groups")
	if not expect(sword != null and bool((sword.get_meta("skill") as Dictionary).get("canAdvance", false)), "long sword is ready to advance"):
		return
	await screenshot("skills-screen")
	var advance: Button = null
	for b in sword.find_children("*", "Button", true, false):
		if (b as Button).text.begins_with("Advance"):
			advance = b
	mark()
	await click_control(advance)
	var said := await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("text", "")).to_lower().contains("more skilled"), "the advance message")
	expect(not said.is_empty(), "NetHack advanced the skill (%s)" % said.get("text", ""))
	await wait_for_command_prompt()
	await get_tree().create_timer(0.5).timeout
	# NetHack's next #enhance shows nothing to advance: the reminders go.
	await type_text("#")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("promptPurpose") == "prompt.extendedCommand" and e.get("lifecycle") == "opened", "extended command")
	await type_text("enhance")
	await press(KEY_ENTER)
	deadline = Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is SkillsScreen:
		await get_tree().process_frame
	await get_tree().create_timer(0.4).timeout
	expect(not game.state.skill_ready and game.hud.conditions_row.get_node_or_null("Status_skill") == null, "the Skill ready badge is gone")
	await screenshot("skills-after")
	await press(KEY_ESCAPE)
	await wait_for_command_prompt()
