extends Scenario
## A pickup NetHack only partly does (bridge fixture: a heavily loaded hero
## on a dagger and three splint mails). "Pick up all" runs NetHack's own pickup;
## NetHack asks about lifting the heavy mail, the player says No, and the
## floor keeps it: the screen and the map follow NetHack's pile, they never
## assume both went up.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "ground/heavy-pile-near-burdened")
	await press(KEY_ESCAPE)
	await get_tree().create_timer(0.4).timeout
	var pickup: Button = null
	for child in game.hud.action_bar._context_box.get_children():
		if child is Button and str(child.text).begins_with("Pick up") and not child.is_queued_for_deletion():
			pickup = child
	if not expect(pickup != null, "the bar offers Pick up over two stacks"):
		return
	await click_control(pickup)
	await get_tree().create_timer(0.4).timeout
	var floor_view := game.dialogs.active as ContainerScreen
	if not expect(floor_view != null and floor_view.contents.size() >= 2, "the floor screen lists the stacks"):
		return
	await screenshot("floor-before")
	mark()
	await click_control(_footer_button(floor_view, "Pick up all"))
	var lifting := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_yn_function" and str(e.get("query", "")).to_lower().contains("lifting"), "NetHack's lifting question")
	var declined := 0
	if expect(not lifting.is_empty(), "NetHack asks about lifting the splint mail (the player answers)"):
		await get_tree().create_timer(0.3).timeout
		await screenshot("lifting-question")
		# No to every lifting question. The floor screen stays out of the way
		# the whole time NetHack is asking (it never flashes between questions).
		var flashed := 0
		var deadline := Time.get_ticks_msec() + 15000
		while Time.get_ticks_msec() < deadline and not game.state.is_waiting_for_command():
			if is_instance_valid(floor_view) and floor_view.visible:
				flashed += 1
			var request := game.state.request
			if str(request.get("kind", "")) == "yn" and str(request.get("query", "")).to_lower().contains("lifting") and game.dialogs.active is QuestionDialog:
				await type_text("n")
				declined += 1
				await get_tree().create_timer(0.2).timeout
			await get_tree().process_frame
		expect(flashed == 0, "the floor screen stayed hidden between NetHack's questions (%d frames shown)" % flashed)
	await get_tree().create_timer(0.4).timeout
	var floor_names: Array = game.state.map.pile(game.state.map.hero).map(func(i: Dictionary) -> String: return str(i.get("displayName", "")))
	note("floor after: %s" % [floor_names])
	expect(floor_names.any(func(n: String) -> bool: return n.contains("splint mail")), "the refused splint mail is still on the floor in Godot's map")
	expect(not floor_names.any(func(n: String) -> bool: return n.contains("dagger")), "and the dagger went up")
	expect(game.state.inventory.any(func(i: Dictionary) -> bool: return ItemText.display_name(i).contains("dagger")), "the dagger is in the pack")
	# NetHack's question hid the floor screen; it is back, follows the pile,
	# and says in NetHack's words what stayed behind.
	expect(is_instance_valid(floor_view) and game.dialogs.active == floor_view and floor_view.visible, "the floor screen came back after the question")
	if is_instance_valid(floor_view):
		expect(floor_view.contents.any(func(i: Dictionary) -> bool: return str(i.get("displayName", "")).contains("splint mail")), "the floor pane still lists the splint mail")
		note("status: %s" % floor_view._status.text)
		var status := floor_view._status.text
		expect(status.contains("You chose to leave") and status.contains("splint mail") and (declined < 2 or status.contains("%d × +0 splint mail" % declined)), "the status line names each splint mail the player left (%d declined: %s)" % [declined, status])
		expect(not floor_view._busy, "the screen is usable")
	expect(not game.hud.pile_peek.visible, "the pile peek no longer shows the old pile")
	await screenshot("after-partial-pickup")

	# Again, and this time Enter at the first question: NetHack's default
	# there is q, which stops the whole pickup. The status says the player
	# stopped it, not that NetHack refused the rest.
	if is_instance_valid(floor_view) and game.dialogs.active == floor_view:
		mark()
		await click_control(_footer_button(floor_view, "Pick up all"))
		var again := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_yn_function" and str(e.get("query", "")).to_lower().contains("lifting"), "the lifting question again")
		if expect(not again.is_empty() and str(again.get("default", "")) == "q", "NetHack asks again, with q as its default (%s)" % again.get("default", "")):
			await get_tree().create_timer(0.3).timeout
			await press(KEY_ENTER, 13)
			await wait_for_command_prompt()
			await get_tree().create_timer(0.5).timeout
			note("status after Enter: %s" % floor_view._status.text)
			expect(floor_view._status.text.contains("You stopped there") and not floor_view._status.text.contains("NetHack kept"), "the status says the player stopped the pickup (%s)" % floor_view._status.text)
			await screenshot("stopped-pickup")


func _footer_button(view: ModalCard, label: String) -> Button:
	for child in view.footer.get_children():
		if child is Button and str(child.text).begins_with(label):
			return child
	return null
