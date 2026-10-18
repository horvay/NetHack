extends Scenario
## The hard container cases (bridge fixtures):
##   1. a large box and a chest on one square: #loot asks which (NetHack's
##      own menu), the box's screen opens, "Take all" moves its three stacks
##      in one command and one turn, and "Partial stacks…" really gives
##      NetHack's own menus (not the same screen again);
##   2. a confused hero: #loot runs once, never a second time behind the
##      player's back (confusion's random parts are rolled once, as in tty);
##   3. a carried cursed bag of holding (not known to be cursed): applying
##      it rolls its losses once; taking three things out is one more
##      command, not another apply;
##   4. a bag of holding put into a bag of holding blows up, as in NetHack:
##      a turn passes and the screen closes with NetHack's words;
##   5. a heavily loaded hero takes all from a box: the light dagger moves,
##      the splint mails stay, and the status says why in plain words;
##   6. a box and a chest both picked at "Loot which containers?": the box's
##      screen, then the chest's once it closes.


func run() -> void:
	await _box_and_chest()
	await _restart("container/confused-box-on-hero")
	await _confused()
	await _restart("container/carried-cursed-bag-of-holding")
	await _cursed_bag()
	await _restart("container/two-bags-of-holding")
	await _bag_explodes()
	await _restart("container/heavy-box-near-burdened")
	await _heavy_box()
	await _restart("container/box-and-chest-on-hero")
	await _both_picked()


func _restart(fixture: String) -> void:
	if is_instance_valid(game) and game.dialogs.active is ModalCard:
		await press(KEY_ESCAPE)
	session.stop_game()
	await wait_for_game_end(10.0)
	if app.has_node("EndScreen"):
		app.get_node("EndScreen").queue_free()
	await start_fixture("Brunhild-Val-Hum-Fem-Law", fixture)
	await press(KEY_ESCAPE)


func _loot() -> void:
	await type_text("#")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("promptPurpose") == "prompt.extendedCommand" and e.get("lifecycle") == "opened", "extended command")
	await type_text("loot")
	await press(KEY_ENTER, 13)


func _box_and_chest() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "container/box-and-chest-on-hero")
	await press(KEY_ESCAPE)
	mark()
	await _loot()
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_select_menu", "Loot which containers?")
	await get_tree().create_timer(0.3).timeout
	var which := game.dialogs.active as MenuDialog
	if not expect(which != null and str(which.request.get("prompt", "")).to_lower().contains("loot which"), "NetHack asks which container (its own menu)"):
		return
	await screenshot("loot-which")
	for row in which.rows:
		if str(row.item.get("text", "")).contains("large box"):
			await click_control(row)
	await press(KEY_ENTER, 13)
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ContainerScreen:
		await get_tree().process_frame
	var view := game.dialogs.active as ContainerScreen
	if not expect(view != null and view.contents.size() == 3, "the large box's screen opens with its three stacks"):
		return
	var turn := game.state.status.number(StatusModel.Field.TIME)
	var before := game.state.inventory.size()
	mark()
	var since := events.size()
	await click_control(_footer_button(view, "Take all"))
	deadline = Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and (view._busy or game.state.inventory.size() < before + 3):
		await get_tree().process_frame
	await get_tree().create_timer(0.4).timeout
	var transfers := events.slice(since).filter(func(e: Dictionary) -> bool: return str(e.get("name", "")) == "shim_container_transfer_confirmed")
	note("take all: %d transfers, T %d -> %d, status %s" % [transfers.size(), turn, game.state.status.number(StatusModel.Field.TIME), view._status.text])
	expect(game.state.inventory.size() == before + 3, "Take all moved the three stacks (%d -> %d)" % [before, game.state.inventory.size()])
	expect(transfers.size() == 1, "in one command (%d)" % transfers.size())
	expect(game.state.status.number(StatusModel.Field.TIME) <= turn + 1, "and one turn")
	await screenshot("box-emptied")
	# Partial stacks…: NetHack's own menus, all the way.
	await click_control(_footer_button(view, "Partial stacks"))
	var asked := await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_select_menu", "NetHack's loot menu")
	await get_tree().create_timer(0.3).timeout
	var native := game.dialogs.active as MenuDialog
	if expect(native != null and str(native.request.get("prompt", "")).to_lower().contains("loot which"), "Partial stacks… shows NetHack's own Loot which containers?"):
		for row in native.rows:
			if str(row.item.get("text", "")).contains("large box"):
				await click_control(row)
		await press(KEY_ENTER, 13)
		await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_select_menu" and int(e.get("window", 0)) > 0, "Do what with the large box?")
		await get_tree().create_timer(0.4).timeout
		var what := game.dialogs.active as MenuDialog
		expect(what != null and str(what.request.get("prompt", "")).to_lower().contains("do what with"), "then NetHack's own Do what with…? menu, not the screen again (%s)" % [what.request.get("prompt", "") if what else game.dialogs.active])
		await screenshot("partial-native")
		await press(KEY_ESCAPE)
		await wait_for_command_prompt()
	expect(not asked.is_empty(), "NetHack's menu came")


func _confused() -> void:
	expect(game.state.status.active_conditions().any(func(c: Dictionary) -> bool: return str(c.label).to_lower().begins_with("conf")), "the hero is confused")
	var since := events.size()
	await _loot()
	# NetHack rolls confusion's random parts; whatever it does, Godot runs
	# #loot once.
	var deadline := Time.get_ticks_msec() + 10000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ContainerScreen and not (game.state.is_waiting_for_command() and events.size() > since + 5):
		await get_tree().process_frame
	await get_tree().create_timer(1.0).timeout
	var loots := events.slice(since).filter(func(e: Dictionary) -> bool: return str(e.get("name", "")) == "bridge_extcmd_answer")
	var said := game.state.messages.entries.map(func(e: Dictionary) -> String: return str(e.text))
	note("confused #loot: %d extended commands; screen %s; said %s" % [loots.size(), game.dialogs.active is ContainerScreen, said.slice(maxi(0, said.size() - 3))])
	expect(loots.size() == 1, "#loot ran once (%d)" % loots.size())
	# (Confusion may make NetHack find nothing to loot; with this seed it
	# opens the box.)
	if expect(game.dialogs.active is ContainerScreen, "the screen opened for the confused hero"):
		expect((game.dialogs.active as ContainerScreen).contents.size() == 2, "the screen lists the box's contents")
	await screenshot("confused-loot")


func _cursed_bag() -> void:
	var bag := {}
	for item in game.state.inventory:
		if ItemText.display_name(item).contains("bag"):
			bag = item
	if not expect(not bag.is_empty(), "the hero carries the bag"):
		return
	var since := events.size()
	await type_text("a")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("apply"), "what to apply")
	await type_text(char(int(bag.get("selector", 0))))
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ContainerScreen:
		await get_tree().process_frame
	var view := game.dialogs.active as ContainerScreen
	if not expect(view != null, "applying the cursed bag opened the screen"):
		return
	await get_tree().create_timer(0.4).timeout
	note("in the bag after opening: %d" % view.contents.size())
	if view.contents.size() < 3:
		note("the bag ate too much to test a three-stack move")
		return
	var before := game.state.inventory.size()
	# (Each click re-renders the list: find the row afresh every time.)
	for i in 3:
		var rows: Array = view._left.get_children().filter(func(c: Node) -> bool: return c is ItemRow and not c.is_queued_for_deletion())
		await click_control(rows[i])
	expect(view._selected_out.size() == 3, "three bag rows selected (%d)" % view._selected_out.size())
	await click_control(view._move_out)
	deadline = Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and (view._busy or game.state.inventory.size() < before + 3):
		await get_tree().process_frame
	await get_tree().create_timer(0.4).timeout
	var applies := events.slice(since).filter(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("apply"))
	expect(game.state.inventory.size() == before + 3, "three stacks came out (%d -> %d)" % [before, game.state.inventory.size()])
	expect(applies.size() == 1, "the bag was applied once, so its losses were rolled once (%d)" % applies.size())
	await screenshot("cursed-bag-after")


func _open_carried(word: String, index := 0) -> ContainerScreen:
	var bags: Array = game.state.inventory.filter(func(i: Dictionary) -> bool: return ItemText.display_name(i).contains(word))
	if bags.size() <= index:
		return null
	await type_text("a")
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("lifecycle") == "opened" and str(e.get("query", "")).to_lower().contains("apply"), "what to apply")
	await type_text(char(int(bags[index].get("selector", 0))))
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ContainerScreen:
		await get_tree().process_frame
	await get_tree().create_timer(0.3).timeout
	return game.dialogs.active as ContainerScreen


func _bag_explodes() -> void:
	# The bag with things in it ("a bag containing 2 items").
	var bags: Array = game.state.inventory.filter(func(i: Dictionary) -> bool: return ItemText.display_name(i).contains("bag"))
	note("bags: %s" % [bags.map(func(i: Dictionary) -> String: return ItemText.display_name(i))])
	var full := bags.find_custom(func(i: Dictionary) -> bool: return not ItemText.display_name(i).contains("empty"))
	var view := await _open_carried("bag", maxi(full, 0))
	if not expect(view != null and view.contents.size() == 2, "the first bag's screen opens with its two things"):
		return
	var other: ItemRow = null
	for child in view._right.get_children():
		if child is ItemRow and str(child._name.text).contains("bag"):
			other = child
	if not expect(other != null, "the other bag is in the pack column"):
		return
	var turn := game.state.status.number(StatusModel.Field.TIME)
	await click_control(other, true)
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and is_instance_valid(view) and game.dialogs.active == view:
		await get_tree().process_frame
	await wait_for_command_prompt()
	await get_tree().create_timer(0.4).timeout
	var said := game.state.messages.entries.map(func(e: Dictionary) -> String: return str(e.text).to_lower())
	note("explosion: T %d -> %d; %s" % [turn, game.state.status.number(StatusModel.Field.TIME), said.slice(maxi(0, said.size() - 3))])
	expect(said.any(func(t: String) -> bool: return t.contains("explosion")), "NetHack's magical explosion happened")
	expect(game.state.status.number(StatusModel.Field.TIME) > turn, "and took a turn")
	expect(not game.dialogs.active is ContainerScreen, "the screen closed with the bag gone")
	var notices := game.hud.feed.find_children("*", "Label", true, false).filter(func(l: Label) -> bool: return l.visible and l.text.to_lower().contains("explosion") and l.text != said[-1])
	note("explosion lines on screen: %d" % notices.size())
	await screenshot("bag-exploded")


func _heavy_box() -> void:
	await game.dialogs.open_container()
	await get_tree().create_timer(0.4).timeout
	var view := game.dialogs.active as ContainerScreen
	if not expect(view != null and view.contents.size() == 3, "the box's screen opens with three stacks"):
		return
	await click_control(_footer_button(view, "Take all"))
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and (view._busy or view._status.text == ""):
		await get_tree().process_frame
	await get_tree().create_timer(0.3).timeout
	note("heavy take all: %s" % view._status.text)
	var partial := RegEx.create_from_string("^([12]) of 3 moved").search(view._status.text)
	expect(partial != null and view._status.text.contains("slow you down"), "some moved, and the status says in plain words why the rest stayed (%s)" % view._status.text)
	expect(view.contents.size() == 3 - (int(partial.get_string(1)) if partial else 0) and view.contents.any(func(i: Dictionary) -> bool: return str(i.get("displayName", "")).contains("splint mail")), "what stayed is still in the box")
	await screenshot("heavy-take-all")


func _both_picked() -> void:
	await _loot()
	await wait_for_event(func(e: Dictionary) -> bool: return e.get("name") == "shim_select_menu", "Loot which containers?")
	await get_tree().create_timer(0.3).timeout
	var which := game.dialogs.active as MenuDialog
	if not expect(which != null, "NetHack asks which containers"):
		return
	for word in ["large box", "chest"]:
		for row in which.rows:
			if str(row.item.get("text", "")).contains(word):
				await click_control(row)
				break
	await press(KEY_ENTER, 13)
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ContainerScreen:
		await get_tree().process_frame
	var first := game.dialogs.active as ContainerScreen
	if not expect(first != null, "the first container's screen opened"):
		return
	var first_name := str(first.container.get("displayName", ""))
	await press(KEY_ESCAPE)
	deadline = Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline and not (game.dialogs.active is ContainerScreen and game.dialogs.active != first):
		await get_tree().process_frame
	var second := game.dialogs.active as ContainerScreen
	note("both picked: %s then %s" % [first_name, second.container.get("displayName", "") if second else "nothing"])
	expect(second != null and str(second.container.get("displayName", "")) != first_name, "then the other container's screen")
	await screenshot("second-container")
	if second:
		await press(KEY_ESCAPE)


func _footer_button(view: ModalCard, label: String) -> Button:
	for child in view.footer.get_children():
		if child is Button and str(child.text).begins_with(label):
			return child
	return null
