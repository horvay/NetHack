class_name DialogHost
extends CanvasLayer
## Shows the right UI for whatever NetHack is waiting for and hosts the
## player-opened panels (inventory, equipment, palette, history...).
##
## Modal dialogs own the keyboard while open. Direction, map-target and
## "press a key" waits are non-modal hint banners: the map stays clickable
## and classic keys keep flowing to NetHack.

var screen: GameScreen
var root: Control
var active: Control
var active_request: Dictionary = {}
var banner: PanelContainer
var banner_label: Label
var banner_chips: HBoxContainer
var _target_hint := ""


static func _strip_symbol(text: String) -> String:
	var found := RegEx.create_from_string("^\\S\\s{2,}(.+)$").search(text.strip_edges())
	return found.get_string(1) if found else text.strip_edges()
## A cell to pick automatically when the next map-target prompt opens
## (set by "Look closely" on a cell).
var pending_target := Vector2i(-1, -1)
var _queued_windows: Array[Dictionary] = []


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	layer = 20
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = UiTheme.theme()
	add_child(root)
	_build_banner()
	screen.state.request_changed.connect(_on_request)
	screen.state.question_answered.connect(_note_answer)
	screen.state.text_window_shown.connect(_on_text_window)
	screen.state.autodescribe.connect(func(text: String) -> void:
		if banner.visible and str(active_request.get("kind", "")) == "map_target":
			banner_label.text = _target_hint + "\n" + _strip_symbol(text)
			banner.reset_size()
			banner.offset_left = -banner.size.x / 2.0
			banner.offset_right = banner.size.x / 2.0)


## A dialog answering NetHack's current request is open (not just an
## "Are you sure?" card).
func _request_dialog_open() -> bool:
	return is_instance_valid(active) and not active.is_queued_for_deletion() and active.has_meta("request_dialog")


func owns_input() -> bool:
	return (is_instance_valid(active) and not active.is_queued_for_deletion()) or blocking_modal() != null


## An "Are you sure?" card on top of everything: it handles its own keys.
func blocking_modal() -> Node:
	for node in get_tree().get_nodes_in_group("blocking_modal"):
		if not node.is_queued_for_deletion():
			return node
	return null


## Asks before a dangerous action (Settings > Ask before dangerous actions).
func confirm_action(action: Dictionary, run: Callable) -> void:
	if str(action.get("danger", "")) == "" or not Motion.confirm_dangerous():
		run.call()
		return
	var confirm := ConfirmDialog.new()
	confirm.setup("%s?" % str(action.get("label", "Do it")), "Are you sure? You can turn these questions off in Settings.", str(action.get("label", "Yes")), run)
	root.add_child(confirm)
	GamepadRouter.focus_dialog.call_deferred(confirm)


func _input(event: InputEvent) -> void:
	if blocking_modal() != null or not owns_input():
		return
	if event is InputEventKey and event.pressed:
		if active.has_method("handle_key") and active.handle_key(event):
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_ESCAPE:
			if active.has_method("close"):
				active.close()
			get_viewport().set_input_as_handled()


## A transfer screen hidden while NetHack asks something in the middle of
## its moves ("trouble lifting… Continue?"); it comes back when the
## question closes.
var _suspended: Control
var _reveal_pending := false


func _reveal_transfer_screen() -> void:
	_reveal_pending = false
	if is_instance_valid(active) and not active.is_queued_for_deletion() and not active.visible:
		active.visible = true
		_dim_feed(true)
		GamepadRouter.focus_dialog.call_deferred(active)


func _show(dialog: Control) -> void:
	if is_instance_valid(active) and not active.is_queued_for_deletion() and active != dialog:
		if active.has_meta("keep_under_requests") and dialog.has_meta("request_dialog"):
			_suspended = active
			_suspended.visible = false
			_reveal_pending = false
		else:
			active.queue_free()
			if is_instance_valid(_suspended) and dialog != _suspended:
				_suspended.queue_free()
				_suspended = null
	active = dialog
	root.add_child(dialog)
	# A starting focus for keyboard and pad (dialogs that focus a field
	# themselves keep it).
	GamepadRouter.focus_dialog.call_deferred(dialog)
	if dialog.has_signal("closed"):
		dialog.closed.connect(_on_dialog_closed.bind(dialog))
	screen.hud.inspector.hide_card()
	# NetHack's own questions keep the feed readable: it may hold the context.
	var large := dialog is InventoryScreen or dialog is EquipmentScreen or (dialog is ModalCard and (dialog as ModalCard).card_width >= 700.0)
	_dim_feed(large and not dialog.has_meta("request_dialog"))


## Large panels cover the message feed's corner: fade it back so the two
## never fight for attention.
func _dim_feed(on: bool) -> void:
	screen.hud.feed.dimmed = on


func _on_dialog_closed(dialog: Control) -> void:
	if active == dialog:
		active = null
		_dim_feed(false)
		if dialog == _suspended:
			_suspended = null
		elif is_instance_valid(_suspended) and not _suspended.is_queued_for_deletion():
			# The question is answered: the transfer screen takes the input
			# back, but shows only once NetHack has nothing more to ask
			# (another question right after would make it flash).
			active = _suspended
			_suspended = null
			_reveal_pending = true
			return
	if not _queued_windows.is_empty() and not owns_input():
		_on_text_window.call_deferred(_queued_windows.pop_front())


# --- game requests -----------------------------------------------------------------

func _on_request(request: Dictionary) -> void:
	var kind := str(request.get("kind", ""))
	_hide_banner()
	# Answered by the game screen itself a moment from now: don't flash it.
	var answered := screen.input_router.will_answer(request)
	if _reveal_pending and (answered or kind == "command"):
		_reveal_transfer_screen()
	if answered:
		return
	if screen.state.ending:
		# The end chronicle answers NetHack's closing questions itself.
		if _request_dialog_open():
			active.close()
		return
	# Any open request dialog is stale once NetHack moves on.
	if _request_dialog_open() and active_request != request:
		active.close()
	active_request = request
	if kind == "yn" and screen.state.auto_confirm_save and str(request.get("query", "")).to_lower().contains("really save"):
		screen.send_keys("y")
		return
	if _native_loot:
		# NetHack's own loot menu was asked for (Partial stacks…, or the
		# screen couldn't open): it lasts until NetHack is back at the
		# command prompt after showing something.
		if kind == "command" and _native_loot_seen:
			_native_loot = false
		elif kind != "command":
			_native_loot_seen = true
	if kind == "menu" and _loot_menu_to_screen(request):
		return
	if kind == "menu" and str(screen.state.magic_rows.get(str(request.get("menu_id", "")), {}).get("kind", "")) == "spell":
		# NetHack's spell menus (Z, +, reordering): the spellbook screen.
		var spells := SpellsScreen.new()
		spells.set_meta("request_dialog", true)
		spells.setup(screen, request, screen.state.magic_rows[str(request.get("menu_id", ""))])
		_show(spells)
		return
	if kind == "menu" and str(screen.state.magic_rows.get(str(request.get("menu_id", "")), {}).get("kind", "")) == "skill":
		# NetHack's #enhance: the skills screen.
		var skills := SkillsScreen.new()
		skills.set_meta("request_dialog", true)
		skills.setup(screen, request, screen.state.magic_rows[str(request.get("menu_id", ""))])
		_show(skills)
		return
	if kind == "command":
		screen.state.next_menu_title = ""
	if kind == "menu" and ItemPickScreen.routes(request, screen.state):
		# A menu of items from the pack: the inventory's item grid.
		var pick := ItemPickScreen.new()
		pick.set_meta("request_dialog", true)
		pick.setup(screen, request)
		_show(pick)
		return
	if kind == "menu" and not ChoiceScreen.menu_for(request).is_empty():
		# #name, #terrain, / look: their choices as tiles.
		var choice := ChoiceScreen.new()
		choice.set_meta("request_dialog", true)
		choice.setup(screen, request)
		_show(choice)
		return
	match kind:
		"yn":
			var dialog := QuestionDialog.new()
			dialog.set_meta("request_dialog", true)
			dialog.setup(screen, request)
			_show(dialog)
		"line":
			var dialog := LineDialog.new()
			dialog.set_meta("request_dialog", true)
			dialog.setup(screen, request)
			_show(dialog)
		"extcmd":
			var dialog := CommandPalette.new()
			dialog.set_meta("request_dialog", true)
			dialog.setup(screen, "extcmd")
			_show(dialog)
		"menu":
			if _is_document(request):
				var lines := []
				for item in request.get("items", []):
					lines.append({"text": str(item.get("text", "")), "attr": int(item.get("attr", 0))})
				var reader: ModalCard = _document_screen(lines)
				if reader == null:
					reader = TextWindowDialog.new()
					(reader as TextWindowDialog).setup({"lines": lines})
				reader.set_meta("request_dialog", true)
				# NetHack waits for a key to dismiss a read-only menu.
				reader.closed.connect(func() -> void:
					if screen.state.request.get("kind") == "menu":
						screen.send_keys(" "))
				_show(reader)
				return
			var dialog := MenuDialog.new()
			dialog.set_meta("request_dialog", true)
			dialog.setup(screen, request)
			_show(dialog)
		"direction":
			var keys := screen.state.dirchars.substr(0, 8)
			var query := str(request.get("query", "")).strip_edges()
			if query == "" or query.begins_with("Choose a direction"):
				query = "Which direction?"
			var raw := str(request.get("query", ""))
			var offered := screen.state.offered_directions(raw)
			var how := GamepadRouter.hint("Click toward it, or press %s / arrows" % keys, "Point with the stick  ·  A here  ·  bumpers up/down  ·  B cancel")
			if offered != "":
				# Only what NetHack listed ("[>]"): name just those.
				how = GamepadRouter.hint("Works toward %s: press %s" % [screen.input_router._direction_words(offered), " ".join(Array(offered.to_utf8_buffer()).map(func(c: int) -> String: return char(c)))],
					"Works toward %s  ·  B cancel" % screen.input_router._direction_words(offered))
			var chips := [["Up  <", "<"], ["Here  .", "."], ["Down  >", ">"]].filter(func(chip: Array) -> bool: return screen.state.offers_direction(raw, chip[1]))
			chips.append([GamepadRouter.hint("Cancel  Esc", "Cancel  B"), char(27)])
			_show_banner("%s   %s" % [query.trim_suffix(":"), how], chips)
		"map_target":
			if MapModel.in_bounds(pending_target):
				var cell := pending_target
				pending_target = Vector2i(-1, -1)
				screen.state.note_target(cell)
				screen.send_map_click(cell)
			elif screen.state.messages.recent(3).any(func(m: Dictionary) -> bool: return str(m.get("text", "")) == "Where do you want to travel to?"):
				# _ travel: the places the hero knows on this level, one click
				# each (NetHack's < > _ keys still jump the cursor).
				_target_hint = GamepadRouter.hint("Travel where?  Click a spot, or pick a place:", "Travel where?  Pick a spot with the stick, or a place:")
				var chips: Array = []
				for place in travel_destinations().slice(0, 6):
					var cell: Vector2i = place[1]
					chips.append([place[0], func() -> void: screen.send_map_click(cell)])
				chips.append([GamepadRouter.hint("Cancel  Esc", "Cancel  B"), char(27)])
				_show_banner(_target_hint, chips)
			elif screen.state.messages.recent(3).any(func(m: Dictionary) -> bool: return str(m.get("text", "")).begins_with("Showing known terrain")):
				# #terrain: NetHack shows the level as remembered until a key.
				_target_hint = GamepadRouter.hint("Showing the terrain you remember, with monsters and things out of the way.  Esc to return.",
					"Showing the terrain you remember.  B to return.")
				_show_banner(_target_hint, [[GamepadRouter.hint("Return  Esc", "Return  B"), char(27)]])
			else:
				_target_hint = GamepadRouter.hint("Choose a spot on the map.  Click it, or move the cursor with direction keys and press . or ,  —  Esc to cancel.",
					"Choose a spot on the map.  Move with the stick, A to pick it  —  B to cancel.")
				_show_banner(_target_hint)
		"key":
			_show_banner(GamepadRouter.hint("Press any key to continue.", "Press A to continue."))


func _is_document(request: Dictionary) -> bool:
	if int(request.get("how", 0)) != 0:
		return false
	if not screen.state.magic_rows.get(str(request.get("menu_id", "")), {}).is_empty():
		return false
	for item in request.get("items", []):
		if int(item.get("selector", 0)) != 0 or int(item.get("glyph", -1)) > 0 and ItemText.icon(item, screen.state) != null:
			return false
	return true


func _on_text_window(window: Dictionary) -> void:
	if screen.state.ending:
		return
	if owns_input():
		_queued_windows.append(window)
		return
	var dialog: ModalCard = _document_screen(window.get("lines", []))
	if dialog == null:
		dialog = TextWindowDialog.new()
		(dialog as TextWindowDialog).setup(window)
	_show(dialog)


## NetHack's documents with a screen of their own, recognised by their text
## (^X attributes…); null: the plain reader.
func _document_screen(lines: Array) -> ModalCard:
	if CharacterSheet.recognises(lines):
		var sheet := CharacterSheet.new()
		sheet.setup(screen, lines)
		return sheet
	if CodexScreen.recognises(lines):
		var codex := CodexScreen.new()
		codex.setup(screen, lines)
		return codex
	if OverviewScreen.recognises(lines):
		var overview := OverviewScreen.new()
		overview.setup(screen, lines)
		return overview
	var shop := ShopLedgerScreen.kind_of(lines)
	if shop != "":
		var ledger := ShopLedgerScreen.new()
		ledger.setup(screen, lines, shop)
		return ledger
	var beasts := BestiaryScreen.kind_of(lines)
	if beasts != "":
		var bestiary := BestiaryScreen.new()
		bestiary.setup(lines, beasts)
		return bestiary
	var record := RecordScreen.kind_of(lines)
	if record != "":
		var doc := RecordScreen.new()
		doc.setup(lines, record)
		return doc
	return null


# --- banner ----------------------------------------------------------------------

func _build_banner() -> void:
	banner = PanelContainer.new()
	banner.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0.08, 0.07, 0.04, 0.92), Color(UiTheme.GOLD, 0.6), 10, 1, 16))
	banner.set_anchors_preset(Control.PRESET_CENTER_TOP)
	banner.anchor_left = 0.5
	banner.anchor_right = 0.5
	banner.grow_horizontal = Control.GROW_DIRECTION_BOTH
	banner.offset_top = 22
	banner.mouse_filter = Control.MOUSE_FILTER_PASS
	banner.visible = false
	root.add_child(banner)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	banner.add_child(row)
	banner_label = Label.new()
	banner_label.add_theme_font_size_override("font_size", 19)
	banner_label.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.3))
	banner_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(banner_label)
	banner_chips = HBoxContainer.new()
	banner_chips.add_theme_constant_override("separation", 6)
	row.add_child(banner_chips)


func _show_banner(text: String, chips: Array = []) -> void:
	banner_label.text = text
	for child in banner_chips.get_children():
		child.queue_free()
	for chip in chips:
		var button := Button.new()
		button.text = chip[0]
		button.focus_mode = Control.FOCUS_NONE
		button.custom_minimum_size = Vector2(0, 36)
		if chip[1] is Callable:
			button.pressed.connect(chip[1])
		else:
			var keys: String = chip[1]
			button.pressed.connect(func() -> void:
				if keys == char(27):
					screen.send_keycode(27)
				else:
					screen.send_keys(keys))
		banner_chips.add_child(button)
	banner.visible = true
	banner.reset_size()
	banner.offset_left = -banner.size.x / 2.0
	banner.offset_right = banner.size.x / 2.0
	banner.modulate.a = 0.0
	banner.create_tween().tween_property(banner, "modulate:a", 1.0, 0.15)


## Where the hero can travel on this level, nearest first: [label, cell]
## for each stair, ladder, altar, throne, fountain, sink and grave seen.
const TRAVEL_PLACES := {25: "Up stairs", 26: "Down stairs", 27: "Up ladder", 28: "Down ladder", 29: "Up stairs",
	30: "Down stairs to another branch", 31: "Up ladder", 32: "Down ladder to another branch", 33: "Altar", 34: "Grave", 35: "Throne",
	36: "Sink", 37: "Fountain", 65: "Magic portal"}


func travel_destinations() -> Array:
	var found: Array = []
	var map := screen.state.map
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			var pos := Vector2i(x, y)
			if pos == map.hero or not map.is_explored(pos):
				continue
			var cmap := int(Terrain.classify(map.cell(pos)).get("cmap", -1))
			if TRAVEL_PLACES.has(cmap):
				found.append([TRAVEL_PLACES[cmap], pos, (pos - map.hero).length_squared()])
	found.sort_custom(func(a: Array, b: Array) -> bool: return a[2] < b[2])
	return found


func _hide_banner() -> void:
	banner.visible = false


# --- player-opened panels -----------------------------------------------------------

func open_panel(name: String) -> void:
	if is_instance_valid(active) and not active.is_queued_for_deletion() and not active.has_meta("request_dialog"):
		active.close()
	var panel: Control = null
	match name:
		"palette":
			var palette := CommandPalette.new()
			palette.setup(screen, "ui")
			panel = palette
		"history":
			var history := HistoryPanel.new()
			history.setup(screen)
			panel = history
		"game_menu":
			var menu := GameMenu.new()
			menu.setup(screen)
			panel = menu
		"inventory":
			var inventory := InventoryScreen.new()
			inventory.setup(screen)
			panel = inventory
		"equipment":
			var equipment := EquipmentScreen.new()
			equipment.setup(screen)
			panel = equipment
		"help":
			var help := HelpScreen.new()
			help.setup(screen)
			panel = help
		"settings":
			var settings := SettingsScreen.new()
			settings.setup(screen)
			panel = settings
	if panel:
		_show(panel)


const CONTAINER_WORDS := ["box", "chest", "bag", "sack", "icebox"]
var _container_serial := 0


## NetHack's "Do what with the large box?" menu (#loot typed, Alt-L, the
## palette, applying a carried bag, or the action bar's Open when the
## direct path wanted NetHack to open it first) becomes the two-pane
## screen: NetHack has opened the container (its locks, traps, cat and a
## cursed bag's losses done), Godot answers "do nothing" ("done" when
## opening already took the turn), and once NetHack is back at the command
## prompt the screen opens that container. With several containers picked
## in "Loot which containers?", each one's screen opens after the last
## closes. Two containers with the same name keep NetHack's menu (only it
## knows which one it means).
var _loot_redirect_queue: Array = []
var _native_loot := false
var _native_loot_seen := false
var _loot_prompt := RegEx.create_from_string("(?i)^(?:(?:the |your |\\S+'s )?(.+?) is (?:now )?empty\\.\\s+do what with it\\?|do what with (the |your |\\S+'s )?(.+?)\\?)")


## The pack letter last given at "What do you want to use or apply?".
var _last_applied := ""


func _note_answer(query: String, key: String) -> void:
	if query.to_lower().contains("use or apply"):
		_last_applied = key


## Shows NetHack's own loot menu for the next open (Partial stacks…).
func want_native_loot() -> void:
	_native_loot = true
	_native_loot_seen = false


func _loot_menu_to_screen(request: Dictionary) -> bool:
	var prompt := str(request.get("prompt", "")).strip_edges()
	var m := _loot_prompt.search(prompt)
	if m == null:
		return false
	if _native_loot:
		_native_loot = false
		return false
	var carried := prompt.to_lower().begins_with("your ") or m.get_string(2).to_lower() == "your "
	var name := (m.get_string(1) if m.get_string(1) != "" else m.get_string(3)).to_lower()
	# "large box named stash", "bag called holding": the pile and the pack
	# name the type.
	name = name.get_slice(" named ", 0).get_slice(" called ", 0)
	var pool := carried_containers() if carried else containers_here()
	var named := pool.filter(func(i: Dictionary) -> bool: return ItemText.display_name(i).to_lower().contains(name))
	if named.size() > 1 and carried and _last_applied != "":
		# Two bags alike in the pack: the one just applied.
		named = named.filter(func(i: Dictionary) -> bool: return char(int(i.get("selector", 0))) == _last_applied)
	if named.size() != 1:
		return false
	var answer := ""
	var next := ""
	for row in request.get("items", []):
		var text := str(row.get("text", "")).to_lower().strip_edges()
		var selector := int(row.get("selector", 0))
		if selector <= 0:
			continue
		if text.contains("do nothing") or text == "done":
			answer = char(selector)
		elif text.contains("next container"):
			next = char(selector)
	if answer == "":
		return false
	# More containers picked: go on to the next one (each gets its screen).
	_loot_redirect_queue.append(named[0])
	screen.send_keys((next if next != "" else answer) + ("\n" if int(request.get("how", 0)) == 2 else ""))
	if _loot_redirect_queue.size() == 1:
		_open_redirected_containers()
	return true


func _open_redirected_containers() -> void:
	var deadline := Time.get_ticks_msec() + 10000
	while not screen.state.is_waiting_for_command() and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().process_frame
	while not _loot_redirect_queue.is_empty() and screen.state.is_waiting_for_command():
		var box: Dictionary = _loot_redirect_queue.pop_front()
		var view: Variant = await open_container(box, true)
		if view is ContainerScreen and not _loot_redirect_queue.is_empty():
			await (view as ContainerScreen).closed
	_loot_redirect_queue.clear()


## NetHack's own way of opening a container: #loot on the floor, apply
## for one in the pack.
func open_natively(box: Dictionary) -> void:
	var held := carried_containers().filter(func(i: Dictionary) -> bool: return int(i.get("objectId", 0)) == int(box.get("objectId", -1)))
	if held.is_empty():
		screen.input_router.send_command("#loot\n")
	else:
		screen.input_router.send_item_command("a" + char(int(held[0].get("selector", 0))))


## Containers in the pack.
func carried_containers() -> Array:
	return screen.state.inventory.filter(func(i: Dictionary) -> bool:
		var name := ItemText.display_name(i).to_lower()
		return int(i.get("objectId", 0)) > 0 and CONTAINER_WORDS.any(func(w: String) -> bool: return name.contains(w)))


## Containers on the hero's square, from the ground pile NetHack showed.
func containers_here() -> Array:
	var found := []
	for item in screen.state.map.pile(screen.state.map.hero):
		var name := str(item.get("displayName", "")).to_lower()
		for word in CONTAINER_WORDS:
			if name.contains(word) and int(item.get("objectId", 0)) > 0:
				found.append(item)
				break
	return found


## Opens the two-pane container screen when the bridge can show the contents
## directly; otherwise (locked, trapped, several containers, NetHack-only
## cases) it quietly runs NetHack's own #loot so nothing is revealed early.
## from_menu: NetHack's own #loot or apply has just opened it (its "Do what
## with…?" menu was redirected here). Returns the screen, or null.
func open_container(chosen: Dictionary = {}, from_menu := false) -> ContainerScreen:
	var boxes := containers_here()
	if chosen.is_empty() and (boxes.size() != 1 or not screen.state.is_waiting_for_command()):
		# NetHack asks which container; its "Do what with…?" menu then comes
		# back here (_loot_menu_to_screen).
		screen.input_router.send_command("#loot\n")
		return null
	var box: Dictionary = chosen if not chosen.is_empty() else boxes[0]
	_container_serial += 1
	var session_id := "gd-loot-%d" % _container_serial
	# Lambdas capture locals by value: collect into a shared dictionary.
	var received := {}
	var on_contents := func(event: Dictionary) -> void:
		if str(event.get("sessionId", "")) == session_id:
			received["snapshot"] = event
	# Some refusals carry no sessionId: any snapshot result ends the wait.
	var on_result := func(family: String, stage: String, event: Dictionary) -> void:
		var sid := str(event.get("sessionId", session_id))
		if family == "container_snapshot" and sid == session_id and stage in ["confirmed", "rejected"]:
			received["outcome"] = stage
			received["reason"] = str(event.get("reason", ""))
	screen.state.container_contents.connect(on_contents)
	screen.state.direct_result.connect(on_result)
	screen.session.send_container_snapshot(int(box.get("objectId", 0)), session_id)
	var deadline := Time.get_ticks_msec() + 12000
	while not received.has("outcome") and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	screen.state.container_contents.disconnect(on_contents)
	screen.state.direct_result.disconnect(on_result)
	var snapshot: Dictionary = received.get("snapshot", {})
	if received.get("outcome", "") != "confirmed" or snapshot.is_empty():
		# NetHack's own #loot, once it is back at the command prompt.
		deadline = Time.get_ticks_msec() + 10000
		while not screen.state.is_waiting_for_command() and Time.get_ticks_msec() < deadline:
			await get_tree().process_frame
		if not screen.state.is_waiting_for_command():
			return null
		if from_menu:
			# NetHack has opened it and the direct path still can't take it
			# (overloaded, no hands free…): never run NetHack's command a
			# second time (it would roll its random parts again). Say why;
			# the next open shows NetHack's own menu.
			want_native_loot()
			screen.hud.feed.flash_notice("NetHack's own menu is needed for that one (%s): open it again." % ContainerScreen.refusal_sentence(str(received.get("reason", ""))).trim_suffix("."))
			return null
		# The direct path wants NetHack to open it first (locked, trapped, a
		# cursed bag, a confused hero…): NetHack's own #loot or apply, whose
		# "Do what with…?" menu comes back here.
		open_natively(box)
		return null
	var view := ContainerScreen.new()
	view.setup(screen, snapshot.get("container", box), snapshot, session_id)
	screen.hud.pile_peek._hide()
	_show(view)
	return view


## The floor-and-pack screen for the pile under the hero. NetHack's own
## pickup menu instead when the pile isn't known, or holds shop goods
## (the direct transfer refuses those).
func open_ground(for_drop := false) -> void:
	var items: Array = screen.state.map.pile(screen.state.map.hero)
	var shop := items.any(func(i: Dictionary) -> bool:
		var text := str(i.get("displayName", "")).to_lower()
		return text.contains("for sale") or text.contains("zorkmid") or str(i.get("ownership", {}).get("state", "owned")) != "owned")
	# In a shop dropping is selling: NetHack's own D asks about each price.
	shop = shop or str(screen.state.status.text(StatusModel.Field.TERRAIN)).to_lower().contains("shop")
	if (items.size() < 2 and not for_drop) or shop or not screen.state.is_waiting_for_command():
		screen.input_router.send_command("D" if for_drop else ",")
		return
	var view := ContainerScreen.new()
	view.setup_ground(screen)
	# The screen lists the pile: the corner peek would only repeat it.
	screen.hud.pile_peek._hide()
	_show(view)


func open_context_menu(cell: Vector2i, at: Vector2) -> void:
	var actions := CellActions.for_cell(screen.state, cell)
	if actions.is_empty():
		return
	var menu := ContextMenu.new()
	menu.setup(screen, cell, actions, at)
	_show(menu)
