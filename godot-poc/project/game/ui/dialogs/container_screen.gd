class_name ContainerScreen
extends ModalCard
## A container (or the floor under the hero) and your pack side by side.
## Select items on either side and move them across (double-click moves one
## at once, or drag rows to the other pane: a selected row carries the whole
## selection). A container moves one stack or several by one direct
## transfer (one turn); the floor moves one by a direct ground transfer and
## several through NetHack's own , or D in one turn, the rows picked by
## objectId. Partial stacks use NetHack's own menus.

const ROW_HEIGHT := 50

var screen: GameScreen
var container: Dictionary = {}
var session_id := ""
var contents: Array = []
var _left: VBoxContainer
var _right: VBoxContainer
var _left_title: Label
var _status: Label
var _move_out: Button
var _move_in: Button
var _selected_out: Dictionary = {}
var _selected_in: Dictionary = {}
var _queue: Array = []
var _busy := false
## Pane frames by the move that drops into them, lit up during a drag.
var _frames := {}
## "container", or "ground" for the floor under the hero.
var source := "container"
## The two moves: out of the container/floor into the pack, and back.
var OUT := "container-to-inventory"
var IN := "inventory-to-container"
var _cell := Vector2i(-1, -1)
var _current: Array = []
var _take_all_button: Button


## The floor under the hero and the pack (Electron's ground-items panel).
func setup_ground(game_screen: GameScreen) -> void:
	source = "ground"
	OUT = "ground-to-inventory"
	IN = "inventory-to-ground"
	_cell = game_screen.state.map.hero
	setup(game_screen, {"displayName": "floor"}, {"items": game_screen.state.map.pile(_cell)}, "")
	game_screen.state.pile_changed.connect(func(cell: Vector2i) -> void:
		if cell == _cell:
			_apply_snapshot({"items": screen.state.map.pile(_cell)}))


## container: {objectId, displayName}; snapshot: shim_container_contents_snapshot
func setup(game_screen: GameScreen, p_container: Dictionary, snapshot: Dictionary, p_session: String) -> void:
	screen = game_screen
	# NetHack's questions during a move hide this screen instead of closing it.
	set_meta("keep_under_requests", true)
	container = p_container
	session_id = p_session
	card_width = 1240.0
	var name := str(container.get("displayName", "container"))
	var heading := "Pick up and drop" if source == "ground" else name.substr(0, 1).to_upper() + name.substr(1)
	set_title(heading, "Select items (or type a pack letter), then move them across. Double-click or drag one across to move it right away.")
	var panes := HBoxContainer.new()
	panes.add_theme_constant_override("separation", 16)
	body.add_child(panes)
	_left_title = Label.new()
	_left = _pane(panes, _left_title, IN)
	var right_title := Label.new()
	right_title.text = "YOUR PACK"
	_right = _pane(panes, right_title, OUT)
	_status = Label.new()
	_status.theme_type_variation = "CaptionLabel"
	_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(_status)
	add_footer_button("Partial stacks…", _classic)
	_take_all_button = add_footer_button("Pick up all" if source == "ground" else "Take all", _take_all)
	_move_out = add_footer_button(_verb_out(), _take_selected, true)
	_move_in = add_footer_button(_verb_in(), _put_selected, true)
	var close_button := add_footer_button("Close  Esc", close)
	set_meta("safe_focus", close_button)
	screen.state.container_contents.connect(_on_contents)
	screen.state.inventory_changed.connect(_on_world_changed)
	screen.state.pile_changed.connect(func(_cell: Vector2i) -> void: _on_world_changed())
	screen.state.direct_result.connect(_on_result)
	screen.state.request_changed.connect(func(_r: Dictionary) -> void: _next())
	# Questions NetHack asked during a batch, and the player's No.
	screen.state.question_answered.connect(func(query: String, key: String) -> void:
		if not _batch_check.is_empty() and key in ["n", "q", char(27)]:
			(_batch_check.declined as Array).append(query)
			if key != "n":
				_batch_check["stopped"] = true)  # q / Esc stops the whole pickup
	_apply_snapshot(snapshot)


## drops: the move that dropping onto this pane makes.
func _pane(parent: HBoxContainer, title: Label, drops: String) -> VBoxContainer:
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(column)
	title.add_theme_font_override("font", UiTheme.heading_font())
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", UiTheme.GOLD)
	column.add_child(title)
	var frame := PanelContainer.new()
	frame.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 8, 2, 0))
	_frames[drops] = frame
	column.add_child(frame)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(580, 520)
	scroll.set_drag_forwarding(Callable(), _can_drop.bind(drops), _drop)
	frame.add_child(scroll)
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 2)
	scroll.add_child(list)
	return list


func _apply_snapshot(snapshot: Dictionary) -> void:
	contents = snapshot.get("items", [])
	_render()


func _on_contents(snapshot: Dictionary) -> void:
	var box: Dictionary = snapshot.get("container", {})
	if int(box.get("objectId", -1)) == int(container.get("objectId", -2)):
		_apply_snapshot(snapshot)


## The pack or the floor changed: a stolen or destroyed container closes the
## screen (the next move would only be refused).
func _on_world_changed() -> void:
	if not is_instance_valid(self) or is_queued_for_deletion():
		return
	if not _busy and not _container_exists():
		_container_gone()
		return
	_render()


func _verb_out() -> String:
	return "Pick up" if source == "ground" else "Take out"


func _verb_in() -> String:
	return "Drop" if source == "ground" else "Put in"


func _render() -> void:
	_left_title.text = "ON THE FLOOR" if source == "ground" else "IN THE %s" % str(container.get("displayName", "container")).to_upper().trim_prefix("A ").trim_prefix("AN ")
	_fill(_left, contents, _selected_out, OUT)
	# (A carried container isn't offered for putting into itself.)
	var box_id := int(container.get("objectId", -1)) if source == "container" else -1
	# A container takes wielded, alternate and quivered things (NetHack
	# unwields them); worn armor and accessories stay on.
	var offered := screen.state.inventory.filter(func(i: Dictionary) -> bool:
		return int(i.get("objectId", 0)) != box_id and not (ItemText.is_worn_gear(i) if source == "container" else ItemText.is_worn(i)))
	_fill(_right, offered, _selected_in, IN)
	if contents.is_empty():
		var empty := Label.new()
		empty.text = "Nothing here." if source == "ground" else "Empty."
		empty.theme_type_variation = "CaptionLabel"
		_left.add_child(empty)
	if _right.get_child_count() == 0:
		var none := Label.new()
		var carrying := screen.state.inventory.any(func(i: Dictionary) -> bool: return int(i.get("objectId", 0)) != box_id)
		none.text = ("Nothing to %s (what you wear stays on you)." if carrying else "Nothing to %s.") % ("drop" if source == "ground" else "put in")
		none.theme_type_variation = "CaptionLabel"
		_right.add_child(none)
	_move_out.disabled = _selected_out.is_empty() or _busy
	_take_all_button.disabled = contents.is_empty() or _busy
	_move_in.disabled = _selected_in.is_empty() or _busy
	_move_out.text = "%s %d" % [_verb_out(), _selected_out.size()] if not _selected_out.is_empty() else _verb_out()
	_move_in.text = "%s %d" % [_verb_in(), _selected_in.size()] if not _selected_in.is_empty() else _verb_in()


func _fill(list: VBoxContainer, items: Array, selected: Dictionary, direction: String) -> void:
	for child in list.get_children():
		list.remove_child(child)
		child.queue_free()
	# Items that moved away are no longer selectable.
	var present := items.map(func(i: Dictionary) -> int: return int(i.get("objectId", 0)))
	for id in selected.keys():
		if not present.has(id):
			selected.erase(id)
	for item in items:
		var id := int(item.get("objectId", 0))
		var row := ItemRow.new()
		if item.has("selector"):
			row.setup_item(item, screen.state)
		else:
			row.setup_menu_entry({"text": str(item.get("displayName", "")), "glyph": item.get("glyph", -1), "glyphChar": item.get("glyphChar", -1),
				"semanticKind": item.get("semanticKind", "object"), "semanticName": item.get("semanticName", ""),
				"semanticKnown": item.get("semanticKnown", true), "semanticAppearance": item.get("semanticAppearance", ""),
				"knownFields": item.get("knownFields", {})})
		row.custom_minimum_size = Vector2(0, ROW_HEIGHT)
		row.set_checkable(true)
		row.selected = selected.has(id)
		row.pressed.connect(func() -> void:
			if selected.has(id):
				selected.erase(id)
			else:
				selected[id] = true
			_render())
		row.set_drag_forwarding(_drag_rows.bind(str(item.get("displayName", ItemText.short_name(item) if item.has("selector") else "")), direction, id, selected), _can_drop.bind(_other(direction)), _drop)
		row.gui_input.connect(func(event: InputEvent) -> void:
			if event is InputEventMouseButton and event.double_click and not _busy:
				selected.erase(id)
				_enqueue([[direction, id]])
				row.accept_event())
		list.add_child(row)


func _other(direction: String) -> String:
	return IN if direction == OUT else OUT


## Dragging a row carries it, or the whole selection when it is selected.
func _drag_rows(_at: Vector2, label: String, direction: String, id: int, selected: Dictionary) -> Variant:
	if _busy:
		return null
	var ids: Array = selected.keys() if selected.has(id) else [id]
	var preview := Label.new()
	preview.text = label if ids.size() == 1 else "%d items" % ids.size()
	preview.add_theme_font_override("font", UiTheme.bold_font())
	preview.add_theme_font_size_override("font_size", 18)
	preview.add_theme_color_override("font_color", UiTheme.GOLD)
	preview.add_theme_stylebox_override("normal", UiTheme.panel_style(Color(0.06, 0.06, 0.09, 0.95), Color(UiTheme.GOLD, 0.6), 8, 1, 12))
	set_drag_preview(preview)
	return {"nh_container_move": direction, "ids": ids}


func _can_drop(_at: Vector2, data: Variant, drops: String) -> bool:
	return data is Dictionary and str(data.get("nh_container_move", "")) == drops and not _busy


func _drop(_at: Vector2, data: Variant) -> void:
	var direction := str(data.nh_container_move)
	var selected := _selected_out if direction == OUT else _selected_in
	for id in data.ids:
		selected.erase(id)
	_enqueue((data.ids as Array).map(func(id: int) -> Array: return [direction, id]))


func _notification(what: int) -> void:
	if what == NOTIFICATION_DRAG_BEGIN or what == NOTIFICATION_DRAG_END:
		var data: Variant = get_viewport().gui_get_drag_data() if what == NOTIFICATION_DRAG_BEGIN else null
		for drops in _frames:
			var lit: bool = data is Dictionary and str(data.get("nh_container_move", "")) == drops
			var style := (_frames[drops] as PanelContainer).get_theme_stylebox("panel") as StyleBoxFlat
			style.border_color = Color(UiTheme.GOLD, 0.7) if lit else Color(0, 0, 0, 0)
			style.bg_color = Color(UiTheme.GOLD, 0.05) if lit else Color(0, 0, 0, 0)


func _take_selected() -> void:
	_enqueue(_selected_out.keys().map(func(id: int) -> Array: return [OUT, id]))
	_selected_out.clear()


func _put_selected() -> void:
	_enqueue(_selected_in.keys().map(func(id: int) -> Array: return [IN, id]))
	_selected_in.clear()


func _take_all() -> void:
	_enqueue(contents.map(func(item: Dictionary) -> Array: return [OUT, int(item.get("objectId", 0))]))


func _enqueue(moves: Array) -> void:
	# Several stacks one way move in one turn, as NetHack's own menus move
	# them: the floor through NetHack's , or D; a container through one
	# direct transfer carrying every id (never reopening it, so a cursed
	# bag's losses stay one roll per open, as in tty).
	if moves.size() >= 2 and moves.all(func(m: Array) -> bool: return m[0] == moves[0][0]) and _queue.is_empty() and not _busy:
		var ids: Array = moves.map(func(m: Array) -> int: return int(m[1]))
		if source == "ground":
			_batch(str(moves[0][0]), ids)
		else:
			# (The bridge takes 257 stacks a command: a bigger stash goes in
			# a few.)
			for start in range(0, ids.size(), 257):
				var part: Array = ids.slice(start, start + 257)
				_queue.append([moves[0][0], part[0], part.slice(1)])
			_next()
		return
	_queue.append_array(moves)
	_next()


var _batch_running := false


## One NetHack command for several floor stacks: , or D, with the rows
## picked by objectId when NetHack's menus come.
func _batch(direction: String, ids: Array) -> void:
	if not screen.state.is_waiting_for_command():
		return
	var steps: Array = []
	var first := ""
	# (The floor only: containers move several stacks by one direct transfer.)
	first = "," if direction == OUT else "D"
	steps = [{"kind": "menu", "pick_ids": ids}]
	_batch_running = true
	_busy = true
	_batch_check = {"direction": direction, "ids": ids, "serial": screen.state.messages.serial, "declined": []}
	_status.text = "Moving %d stacks…" % ids.size()
	_render()
	screen.input_router.send_sequence(first, steps, _batch_done.bind(direction, ids), _batch_ended)


## However the batch ended; not ok = NetHack's menus didn't offer what we
## asked for, or a question took it elsewhere: nothing assumed moved.
func _batch_ended(ok: bool) -> void:
	if not is_instance_valid(self) or is_queued_for_deletion():
		return
	_batch_running = false
	_busy = false
	if not ok:
		_batch_check = {}
		_status.text = "NetHack didn't move those as asked: use Partial stacks…"
	_render()
	# Moves queued meanwhile (a double-click, letters + Enter) start now.
	_next()


func _batch_done(_direction: String, _ids: Array) -> void:
	if not is_instance_valid(self) or is_queued_for_deletion():
		return
	_batch_running = false
	_busy = false
	_status.text = ""
	# The floor pane follows the bridge's pile snapshots (sent whenever the
	# hero's square changes, emptied included): nothing is assumed moved.
	_check_batch()
	_render()


## What a batch asked for against what NetHack did. When something stayed
## behind, NetHack's own words for that turn say why ("You cannot reach the
## floor.", "Your knapsack cannot accommodate any more items."). Runs when
## the pile (floor) or the container's snapshot is current.
var _batch_check := {}


func _check_batch() -> void:
	if _batch_check.is_empty():
		return
	var asked: Array = _batch_check.ids
	var moving_out: bool = _batch_check.direction == OUT
	var still_here: Array = (contents if moving_out else screen.state.inventory).map(func(i: Dictionary) -> int: return int(i.get("objectId", 0)))
	var left := asked.filter(func(id: int) -> bool: return still_here.has(id))
	if not left.is_empty():
		var moved := "%d of %d moved. " % [asked.size() - left.size(), asked.size()]
		var parts: Array[String] = []
		# Each No to NetHack's question ("much trouble lifting a +0 splint
		# mail. Continue?"), by item.
		var declined: Array = _batch_check.declined
		var names: Array[String] = []
		var item_in := RegEx.create_from_string("(?i)(?:lifting|removing) (.+?)\\.?\\s+continue\\?")
		for query in declined:
			var m := item_in.search(str(query))
			names.append(m.get_string(1) if m else "one")
		# The same item declined twice is grouped: "2 × +0 splint mail".
		var counted := {}
		for name in names:
			counted[name] = int(counted.get(name, 0)) + 1
		names.clear()
		for name in counted:
			# "2 × +0 splint mail", not "a +0 splint mail ×2".
			var bare := RegEx.create_from_string("^(?i)(a|an|the) ").sub(str(name), "")
			names.append(name if counted[name] == 1 else "%d × %s" % [counted[name], bare])
		if not names.is_empty():
			var listed := names[0] if names.size() == 1 else ", ".join(names.slice(0, names.size() - 1)) + " and " + names[-1]
			parts.append("You chose to leave %s." % listed)
		# Anything else NetHack kept without asking: its own reason.
		if left.size() > declined.size() and _batch_check.get("stopped", false):
			# The player stopped the pickup there: NetHack didn't refuse the rest.
			var rest := left.size() - declined.size()
			parts.append("You stopped there; %d more left." % rest)
		elif left.size() > declined.size():
			var said: Array = screen.state.messages.entries.filter(func(e: Dictionary) -> bool: return int(e.get("serial", 0)) > int(_batch_check.serial) and not e.get("note", false))
			var refusal := RegEx.create_from_string("(?i)cannot|can't|could not|not enough|no room|knapsack|reach|too heavy|you have no free")
			var reasons := said.filter(func(e: Dictionary) -> bool: return refusal.search(str(e.text)) != null)
			var words := " ".join((reasons if not reasons.is_empty() or not names.is_empty() else said.slice(maxi(0, said.size() - 1))).map(func(e: Dictionary) -> String: return str(e.text)))
			parts.append(words if words != "" else "NetHack kept the rest.")
		_status.text = moved + " ".join(parts)
	_batch_check = {}


func _next() -> void:
	if _busy or _queue.is_empty():
		_render()
		return
	if not screen.state.is_waiting_for_command():
		# A NetHack question interrupted us: wait for the command prompt.
		_render()
		return
	var move: Array = _queue.pop_front()
	_current = move
	_sent_serial = screen.state.messages.serial
	_busy = true
	_status.text = "Moving…"
	if source == "ground":
		screen.session.send_ground_transfer(move[0], int(move[1]), _cell)
	else:
		screen.session.send_container_transfer(move[0], int(container.get("objectId", 0)), int(move[1]), session_id, move[2] if move.size() > 2 else [])
	_render()


## The message serial when the current move was sent: NetHack's own words
## for that turn come after it.
var _sent_serial := 0


## What NetHack said since the current move was sent.
func _said_since_sent() -> String:
	var said: Array = screen.state.messages.entries.filter(func(e: Dictionary) -> bool: return int(e.get("serial", 0)) > _sent_serial and not e.get("note", false))
	return " ".join(said.map(func(e: Dictionary) -> String: return str(e.text)))


## The container was destroyed (a bag of holding blown up by what went in)
## or taken away: nothing left to show.
var _gone := false


func _container_gone() -> void:
	# (The pack, the pile and the result can each report it: once.)
	if _gone:
		return
	_gone = true
	var said := _said_since_sent()
	close()
	# NetHack's own words are already in the feed; say something only when
	# it said nothing (a bag stolen during the monsters' turn).
	if said == "":
		screen.hud.feed.flash_notice("The %s is gone." % str(container.get("displayName", "container")).to_lower())


func _container_exists() -> bool:
	if source != "container":
		return true
	var id := int(container.get("objectId", -1))
	return screen.state.inventory.any(func(i: Dictionary) -> bool: return int(i.get("objectId", 0)) == id) \
		or screen.state.map.pile(screen.state.map.hero).any(func(i: Dictionary) -> bool: return int(i.get("objectId", 0)) == id)


func _on_result(family: String, stage: String, event: Dictionary) -> void:
	if family != ("ground_transfer" if source == "ground" else "container_transfer") or not (stage in ["confirmed", "rejected"]) or not _busy:
		return
	if event.has("containerId") and int(event.containerId) != int(container.get("objectId", 0)):
		return
	_busy = false
	var why := str(event.get("reason", "")).to_lower()
	if source == "container" and (why.contains("container is gone") or why.contains("no longer at the hero's square or in the pack")):
		_queue.clear()
		_container_gone()
		return
	if stage == "rejected":
		var reason := why
		_queue.clear()
		# The direct path refuses shops and heavy loads; NetHack's own
		# commands handle both (and dropping is the way out of Overtaxed).
		if source == "ground" and not _current.is_empty() and RegEx.create_from_string("shop|unpaid|sale|carry|capacity|too much|burden|encumbrance|overtax|overload").search(reason) != null:
			var move := _current
			close()
			screen.hud.feed.flash_notice("NetHack's own menu takes it from here.")
			if move[0] == OUT:
				screen.input_router.send_command.call_deferred(",")
			else:
				for item in screen.state.inventory:
					if int(item.get("objectId", 0)) == int(move[1]):
						screen.input_router.send_item_command.call_deferred("d" + char(int(item.get("selector", 0))))
			return
		_status.text = _explain(str(event.get("reason", "")))
	else:
		_status.text = ""
		# Several stacks, some kept back: "2 of 3 moved; <why>".
		var partial := RegEx.create_from_string("^(\\d+) of (\\d+) moved; (.*)$").search(str(event.get("reason", "")))
		if partial:
			_status.text = "%s of %s moved. %s" % [partial.get_string(1), partial.get_string(2), _explain(partial.get_string(3))]
		# The bridge sends no pile snapshot once the floor is empty: drop
		# the picked-up stack here (a later snapshot overrides this).
		if source == "ground" and not _current.is_empty() and _current[0] == OUT:
			var gone := int(_current[1])
			contents = contents.filter(func(i: Dictionary) -> bool: return int(i.get("objectId", 0)) != gone)
			screen.state.map.set_pile(_cell, contents)
			screen.state.pile_changed.emit(_cell)
	_next.call_deferred()


## A refusal for the status line: NetHack's own words when NetHack itself
## said no ("You cannot fit the large box into the sack."), else the
## bridge's reason in plain words.
func _explain(reason: String) -> String:
	var r := reason.to_lower()
	if r.contains("nethack did not move") or r.contains("nethack stopped"):
		var said := _said_since_sent()
		if said != "":
			return said
	return refusal_sentence(reason)


## The bridge's refusal reasons as plain sentences.
static func refusal_sentence(reason: String) -> String:
	var r := reason.to_lower()
	if r.contains("encumbrance"):
		return "Carrying that would slow you down: use Partial stacks… to take it anyway."
	if r.contains("knapsack"):
		return "Your pack is full."
	if r.contains("became confused"):
		return "You're confused now: open it again (NetHack's own menu)."
	if r.contains("carry") or r.contains("capacity") or r.contains("too much"):
		return "You can't carry that much more."
	if r.contains("artifact") or r.contains("cockatrice") or r.contains("normal nethack loot flow"):
		return "That one needs NetHack's own menu: use Partial stacks…"
	if r.contains("no longer") or r.contains("stale"):
		return "That item isn't there any more."
	if r.contains("locked"):
		return "It's locked."
	if r.contains("shop") or r.contains("unpaid") or r.contains("for sale"):
		return "Shop goods go through NetHack's own menu: use Partial stacks…"
	if r.contains("cannot") or r.contains("can't"):
		return "You can't do that right now."
	return "NetHack refused." if reason == "" else ItemText.sentence(reason) + "."


func _classic() -> void:
	close()
	if source == "ground":
		screen.input_router.send_command(",")
	else:
		screen.dialogs.want_native_loot()
		screen.dialogs.open_natively(container)



func handle_key(event: InputEventKey) -> bool:
	if event.keycode == KEY_ESCAPE:
		close()
		return true
	# A pack letter toggles that row, as in NetHack's menus.
	var typed := InputRouter.key_to_nethack(event)
	if typed.length() == 1 and typed.unicode_at(0) > 32 and typed.unicode_at(0) < 127 and not event.ctrl_pressed:
		for item in screen.state.inventory:
			if not ItemText.is_worn(item) and char(int(item.get("selector", 0))) == typed and int(item.get("objectId", 0)) != int(container.get("objectId", -1)):
				var id := int(item.get("objectId", 0))
				if _selected_in.has(id):
					_selected_in.erase(id)
				else:
					_selected_in[id] = true
				_render()
				return true
	# Enter moves the selection unless a button has focus (then it presses it).
	if event.keycode in [KEY_ENTER, KEY_KP_ENTER] and not (get_viewport().gui_get_focus_owner() is Button):
		if _busy:
			return true
		if not _selected_out.is_empty():
			_take_selected()
		elif not _selected_in.is_empty():
			_put_selected()
		return true
	return false
