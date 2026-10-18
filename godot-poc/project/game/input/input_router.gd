class_name InputRouter
extends Node
## Routes player input. Classic NetHack keys reach the game whenever no
## dialog owns the keyboard, exactly as typed. On top of that: arrows,
## numpad and Home/End/PgUp/PgDn move; the mouse hovers to inspect,
## left-clicks to move/travel/pick targets and right-clicks for actions.

var screen: GameScreen
var _mouse_cell := Vector2i(-1, -1)

const ARROWS := {KEY_LEFT: "h", KEY_RIGHT: "l", KEY_UP: "k", KEY_DOWN: "j", KEY_HOME: "y", KEY_PAGEUP: "u", KEY_END: "b", KEY_PAGEDOWN: "n"}
const NUMPAD := {KEY_KP_1: "b", KEY_KP_2: "j", KEY_KP_3: "n", KEY_KP_4: "h", KEY_KP_5: ".", KEY_KP_6: "l", KEY_KP_7: "y", KEY_KP_8: "k", KEY_KP_9: "u"}


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	screen.state.request_changed.connect(_on_request_ready)


func _unhandled_input(event: InputEvent) -> void:
	if screen.dialogs.owns_input():
		return
	if event is InputEventKey:
		_handle_key(event as InputEventKey)
	elif event is InputEventMouseMotion:
		_handle_motion(event as InputEventMouseMotion)
	elif event is InputEventMouseButton:
		_handle_button(event as InputEventMouseButton)


# --- keyboard --------------------------------------------------------------------

func _handle_key(event: InputEventKey) -> void:
	if not event.pressed:
		return
	# A key never waits for animation: cut any replay short.
	screen.world.skip_animation()
	var keycode := event.keycode
	# UI shortcuts that have no classic meaning.
	if keycode == KEY_TAB and not event.ctrl_pressed:
		screen.world.toggle_overview()
		get_viewport().set_input_as_handled()
		return
	if keycode == KEY_F1:
		open_ui("help")
		get_viewport().set_input_as_handled()
		return
	if keycode == KEY_F2:
		# (Ctrl+P stays NetHack's own ^P.)
		open_ui("history")
		get_viewport().set_input_as_handled()
		return
	if (keycode == KEY_EQUAL or keycode == KEY_KP_ADD) and event.ctrl_pressed:
		screen.world.zoom_in()
		get_viewport().set_input_as_handled()
		return
	if (keycode == KEY_MINUS or keycode == KEY_KP_SUBTRACT) and event.ctrl_pressed:
		screen.world.zoom_out()
		get_viewport().set_input_as_handled()
		return
	if keycode == KEY_ESCAPE and screen.state.is_waiting_for_command() and not _count_pending:
		open_ui("game_menu")
		get_viewport().set_input_as_handled()
		return
	var text := key_to_nethack(event)
	if text == "":
		return
	if ARROWS.has(keycode) or NUMPAD.has(keycode):
		text = translate_direction(text, screen.state)
	get_viewport().set_input_as_handled()
	# Held keys repeat only while the game is ready for a new command, so
	# holding an arrow walks smoothly without queueing dozens of moves.
	if event.echo and not screen.state.is_waiting_for_command():
		return
	if text == "i" and not _count_pending:
		# The inventory panel, never NetHack's menu: when NetHack is still
		# busy, it opens as soon as the game is ready.
		if screen.state.is_waiting_for_command():
			open_ui("inventory")
			return
		if str(screen.state.request.get("kind", "")) == "busy":
			_open_when_ready = "inventory"
			return
	if text == "D" and not _count_pending and screen.state.is_waiting_for_command():
		# Drop several: the same floor-and-pack screen (NetHack's own D in
		# a shop, where dropping is selling).
		cancel_automation()
		screen.dialogs.open_ground(true)
		return
	if text == "," and not _count_pending and screen.state.is_waiting_for_command():
		# Pick up: the floor-and-pack screen for a known pile of two or more
		# (open_ground sends NetHack's own , for one item or shop goods).
		cancel_automation()
		screen.dialogs.open_ground()
		return
	_note_count(text)
	cancel_automation()
	screen.send_keys(text)


## A count typed at the command prompt ("20s"): Esc must cancel it in
## NetHack rather than open the pause menu.
var _count_pending := false
var _open_when_ready := ""


func _note_count(text: String) -> void:
	if screen.state.number_pad:
		# Under number_pad digits move; counts start with n ("n20s").
		_count_pending = text == "n" and screen.state.is_waiting_for_command() or (_count_pending and text.is_valid_int())
	else:
		_count_pending = text.is_valid_int() and (_count_pending or screen.state.is_waiting_for_command())


func _on_request_ready(request: Dictionary) -> void:
	if str(request.get("kind", "")) == "command":
		_typed_extcmd = false
	if _open_when_ready != "" and str(request.get("kind", "")) == "command" and not screen.dialogs.owns_input():
		var name := _open_when_ready
		_open_when_ready = ""
		open_ui(name)


## Arrow/numpad/Home-style keys arrive as vi letters; under number_pad
## NetHack wants its own direction keys instead.
static func translate_direction(text: String, state: GameState) -> String:
	if not state.number_pad or text.length() != 1:
		return text
	var vi := "hykulnjb"
	var index := vi.find(text.to_lower())
	if index < 0:
		return text
	var key := state.dirchars[index]
	# Shift+direction rushes; digits have no capitals, so use the G prefix.
	return key if text == text.to_lower() else "G" + key


## Keys that move focus inside a dialog (never answers: in NetHack's menus
## and questions, letters answer and arrows only move the highlight).
const NAVIGATION_KEYS := [KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_TAB, KEY_PAGEUP, KEY_PAGEDOWN, KEY_HOME, KEY_END]


static func is_navigation(event: InputEventKey) -> bool:
	return event.keycode in NAVIGATION_KEYS


## Translates a key event into the keystrokes classic NetHack expects.
static func key_to_nethack(event: InputEventKey) -> String:
	var keycode := event.keycode
	if ARROWS.has(keycode):
		var dir: String = ARROWS[keycode]
		return dir.to_upper() if event.shift_pressed else dir
	if NUMPAD.has(keycode):
		var dir: String = NUMPAD[keycode]
		return dir.to_upper() if event.shift_pressed and dir != "." else dir
	match keycode:
		KEY_ENTER, KEY_KP_ENTER:
			return "\n"
		KEY_ESCAPE:
			return char(27)
		KEY_BACKSPACE:
			return char(8)
		KEY_DELETE:
			return char(127)
	var unicode := event.unicode
	if event.ctrl_pressed and keycode >= KEY_A and keycode <= KEY_Z:
		return char(keycode - KEY_A + 1)
	if unicode <= 0 or unicode > 126:
		return ""
	if event.alt_pressed:
		return char(unicode | 0x80)
	return char(unicode)


# --- mouse -----------------------------------------------------------------------

func _handle_motion(event: InputEventMouseMotion) -> void:
	var cell := screen.world.cell_at_screen(event.position)
	if cell != _mouse_cell:
		_mouse_cell = cell
		screen.world.set_hovered(cell)
	if MapModel.in_bounds(cell) and screen.state.map.is_explored(cell):
		screen.hud.inspector.show_cell(cell, event.position)
	else:
		screen.hud.inspector.hide_card()


func _handle_button(event: InputEventMouseButton) -> void:
	if not event.pressed:
		return
	match event.button_index:
		MOUSE_BUTTON_WHEEL_UP:
			screen.world.zoom_in()
		MOUSE_BUTTON_WHEEL_DOWN:
			screen.world.zoom_out()
		MOUSE_BUTTON_LEFT:
			click_cell(screen.world.cell_at_screen(event.position))
		MOUSE_BUTTON_RIGHT:
			var cell := screen.world.cell_at_screen(event.position)
			if MapModel.in_bounds(cell) and screen.state.map.is_explored(cell):
				screen.dialogs.open_context_menu(cell, event.position)
	get_viewport().set_input_as_handled()


## Left-click on the map: move, attack or travel when the game wants a
## command; pick the cell when it wants a map position or direction.
func click_cell(cell: Vector2i) -> void:
	if not MapModel.in_bounds(cell):
		return
	var request := screen.state.request
	var kind := str(request.get("kind", ""))
	if kind == "command" and not screen.state.is_waiting_for_command():
		return  # sent something a moment ago; NetHack hasn't read it yet
	match kind:
		"command":
			if cell == screen.state.map.hero:
				return
			if not screen.state.map.is_explored(cell):
				return
			var delta := cell - screen.state.map.hero
			if absi(delta.x) <= 1 and absi(delta.y) <= 1:
				screen.state.last_direction = delta
			# Only a click that reaches NetHack stops a running action.
			cancel_automation()
			if move_mode != "walk":
				_move_with_mode(delta)
				return
			screen.send_map_click(cell)
		"map_target":
			screen.state.note_target(cell)
			screen.send_map_click(cell)
		"direction":
			# Any click picks the direction it lies in, so a zap or throw can
			# be aimed at a creature further away.
			var delta := cell - screen.state.map.hero
			var dir := "."
			if delta != Vector2i.ZERO:
				var angle := snappedf(Vector2(delta).angle(), PI / 4.0)
				dir = screen.state.direction_key(Vector2i(roundi(cos(angle)), roundi(sin(angle))))
			if dir != "" and not screen.state.offers_direction(str(screen.state.request.get("query", "")), dir):
				# NetHack listed the directions that work ("[>]"): a click
				# elsewhere would only waste the turn.
				screen.hud.feed.flash_notice("Not that way: this only works toward %s." % _direction_words(screen.state.offered_directions(str(screen.state.request.get("query", "")))))
			elif dir != "":
				screen.send_keys(dir)


## "[yulnjbh>]" as words: "down", "north, east or down"...
func _direction_words(keys: String) -> String:
	var words := []
	var names := ["west", "north-west", "north", "north-east", "east", "south-east", "south", "south-west"]
	for ch in keys:
		var index := screen.state.dirchars.find(ch)
		if ch == "<":
			words.append("up")
		elif ch == ">":
			words.append("down")
		elif ch == ".":
			words.append("yourself")
		elif index >= 0 and index < 8:
			words.append(names[index])
	if words.size() <= 1:
		return "".join(words)
	return ", ".join(words.slice(0, words.size() - 1)) + " or " + str(words[-1])


## How a map click moves the hero (the action bar's mode button): "walk"
## travels or steps, "run" rushes toward the click (Shift+direction),
## "fight" attacks the adjacent cell (F + direction) once.
signal move_mode_changed(mode: String)
var move_mode := "walk":
	set(value):
		move_mode = value
		move_mode_changed.emit(value)


func _move_with_mode(delta: Vector2i) -> void:
	var angle := snappedf(Vector2(delta).angle(), PI / 4.0)
	var step := Vector2i(roundi(cos(angle)), roundi(sin(angle)))
	var dir := screen.state.direction_key(step)
	if dir == "":
		return
	if move_mode == "fight":
		move_mode = "walk"
		if absi(delta.x) > 1 or absi(delta.y) > 1:
			screen.hud.feed.flash_notice("Fight works on a neighbouring square.")
			return
		send_command("F" + dir)
	else:
		# Rush: a capital vi key, or G + digit under number_pad.
		send_command(("G" + dir) if screen.state.number_pad else dir.to_upper())


## Sends a command from a button or menu, but only when the game is ready
## for one; otherwise it would be read as an answer to the open prompt.
func send_command(keys: String) -> bool:
	if not screen.state.is_waiting_for_command():
		screen.hud.feed.flash_notice("Finish the current prompt first.")
		return false
	screen.send_keys(keys)
	return true


## A counted command ("20s"): under number_pad digits are directions, so
## NetHack wants the count after n ("n20s").
func send_counted(count: int, keys: String) -> bool:
	return send_command(screen.state.count_prefix(count) + keys)


## Makes an item the alternate weapon while keeping the weapon in hand.
## NetHack (without pushweapon) moves the old weapon to the pack on `w`, so:
## w new -> x (new becomes alternate) -> w old (back in hand). Each step
## waits for the command prompt and checks it really happened.
func set_alternate(object_id: int) -> bool:
	var old_main := 0
	for held in screen.state.inventory:
		if int(held.get("wornMask", 0)) & 0x100:
			old_main = int(held.get("objectId", 0))
	var letter := _letter_of(object_id)
	if letter == "":
		return false
	return send_sequence("w", [{"kind": "item", "keys": letter}], _alternate_swap.bind(object_id, old_main))


func _alternate_swap(object_id: int, old_main: int) -> void:
	if not _holds(object_id, 0x100):
		return
	send_sequence("x", [], _alternate_rewield.bind(object_id, old_main))


func _alternate_rewield(object_id: int, old_main: int) -> void:
	if old_main <= 0 or not _holds(object_id, 0x400) or _holds(old_main, 0x100):
		return
	var letter := _letter_of(old_main)
	if letter != "":
		send_sequence("w", [{"kind": "item", "keys": letter}])


func _holds(object_id: int, mask: int) -> bool:
	for held in screen.state.inventory:
		if int(held.get("objectId", 0)) == object_id:
			return int(held.get("wornMask", 0)) & mask != 0
	return false


func _letter_of(object_id: int) -> String:
	for held in screen.state.inventory:
		if int(held.get("objectId", 0)) == object_id:
			return char(int(held.get("selector", 0)))
	return ""


## Equipment changes run one after another with the classic keys (T to take
## off, W to wear): NetHack comes back to the command prompt only when each
## one is done, which matters for armor that takes several turns. A step runs
## only if the previous one really happened.
## steps: [{"wear": bool, "id": objectId}]
var _equipment_steps: Array = []
var _equipment_last: Dictionary = {}


func run_equipment_steps(steps: Array) -> bool:
	if not screen.state.is_waiting_for_command() or steps.is_empty():
		return false
	_equipment_steps = steps.duplicate()
	_equipment_last = {}
	if not screen.state.request_changed.is_connected(_on_equipment_request):
		screen.state.request_changed.connect(_on_equipment_request)
	_next_equipment_step()
	return true


var _equipment_letter := ""
var _equipment_running := false


func _next_equipment_step() -> void:
	_equipment_running = false
	if not _equipment_last.is_empty() and _holds(int(_equipment_last.id), 0x7F) != bool(_equipment_last.wear):
		# NetHack refused (cursed, blocked...): its message says why.
		_equipment_steps.clear()
		return
	if _equipment_steps.is_empty():
		return
	var step: Dictionary = _equipment_steps.pop_front()
	_equipment_last = step
	_equipment_letter = _letter_of(int(step.id))
	if _equipment_letter == "":
		_equipment_steps.clear()
		return
	# The letter goes only if NetHack asks which item: with a single choice
	# T just takes it off, and a typed-ahead letter would be a new command.
	_equipment_running = send_command("W" if step.wear else "T")


func _on_equipment_request(request: Dictionary) -> void:
	if not _equipment_running:
		return
	match str(request.get("kind", "")):
		"busy", "":
			pass
		"yn", "menu":
			var item_question := str(request.get("kind", "")) == "menu" or str(request.get("choices", "")) == ""
			if _equipment_letter != "" and item_question:
				var letter := _equipment_letter
				_equipment_letter = ""
				screen.send_keys(letter)
			elif not item_question:
				return  # a real yes/no: the player answers it
		"command":
			_next_equipment_step()
		_:
			# Something else came up: the player takes it from here.
			_equipment_running = false
			_equipment_steps.clear()


## The player acted in the world (a key, a click, the pad) while an automated
## sequence was running: the sequence stops, so its next step can never land
## in whatever the player started. Answers in dialogs don't count.
## Stops the rest of a running multi-step action because the player did
## something that reaches NetHack. Says so in the feed (unless quiet), so a
## half-done swap ("your cloak is off") never goes unexplained.
func cancel_automation(quiet := false) -> void:
	_open_when_ready = ""
	var was_equipment := _equipment_running
	var was_sequence := _sequence_running and (not _sequence.is_empty() or _sequence_then.is_valid())
	if not quiet and (was_equipment or was_sequence):
		screen.hud.feed.flash_notice("Stopped changing equipment partway: check the Equipment screen." if was_equipment else "Stopped the rest of that action.")
	_finish_sequence(false)
	_equipment_steps.clear()
	_equipment_running = false
	_equipment_letter = ""


## --- Never type ahead --------------------------------------------------------
## NetHack skips questions it doesn't need ("T" with one worn item asks
## nothing; "#call" with nothing to call just says so), and a key typed ahead
## of a skipped question runs as a command. So a command is sent alone and
## each follow-up answer only when NetHack asks for that kind of thing:
##   "item"      an item question (What do you want to ...? [abc or ?*]) or
##               an item menu
##   "direction" a direction prompt
##   "menu"      a menu
## A real yes/no on the way ("eat the food here?") is left to the player;
## the extended-command prompt of a "#cmd\n" command is answered by the
## command's own text. Anything else ends the sequence.
var _sequence: Array = []
## Runs once NetHack is back at the command prompt after a sequence.
var _sequence_then := Callable()
var _sequence_running := false


## on_end(ok: bool) runs however the sequence ends: back at the command
## prompt (ok, after `then`), cut short by an answer that didn't fit, by
## something unexpected, or by the player (not ok).
func send_sequence(first: String, steps: Array, then := Callable(), on_end := Callable()) -> bool:
	if not send_command(first):
		return false
	_finish_sequence(false)
	_sequence = steps.duplicate()
	_sequence_then = then
	_sequence_end = on_end
	_sequence_running = true
	if not screen.state.request_changed.is_connected(_on_request_for_sequence_step):
		screen.state.request_changed.connect(_on_request_for_sequence_step)
	return true


func _on_request_for_sequence_step(request: Dictionary) -> void:
	if not _sequence_running:
		return
	var kind := str(request.get("kind", ""))
	var choices := str(request.get("choices", ""))
	if kind in ["busy", "", "extcmd"]:
		return
	if kind == "command":
		_finish_sequence(true)
		return
	if _sequence.is_empty():
		return  # the player handles whatever NetHack asks next
	if _step_matches(_sequence[0], request):
		var step: Dictionary = _sequence[0]
		if step.has("pick_ids") or step.has("pick_text"):
			var picked := _pick_rows(step, request)
			if picked == "":
				_finish_sequence(false)
				screen.send_keycode(27)
				return
			if not picked.ends_with("*"):
				_sequence.pop_front()
			screen.send_keys(picked.trim_suffix("*"))
			return
		_sequence.pop_front()
		screen.send_keys(str(step.keys))
		return
	if kind == "yn" and choices != "":
		return  # a real yes/no first: the player answers it
	# Something unexpected: no more answers, and no follow-up command.
	_finish_sequence(false)


var _sequence_end := Callable()


func _finish_sequence(ok: bool) -> void:
	var then := _sequence_then
	var on_end := _sequence_end
	var was_running := _sequence_running
	_sequence.clear()
	_sequence_then = Callable()
	_sequence_end = Callable()
	_sequence_running = false
	if ok and then.is_valid():
		then.call()
	if was_running and on_end.is_valid():
		on_end.call(ok)


## A menu step that picks rows by objectId ("pick_ids"), or by words in the
## row ("pick_text": "take something out"). On a "what type of items?"
## menu on the way it picks "All types" and waits for the item menu (the
## result then ends with "*"). "" when nothing in the menu fits.
static func _pick_rows(step: Dictionary, request: Dictionary) -> String:
	var ids: Array = step.get("pick_ids", [])
	var text := str(step.get("pick_text", "")).to_lower()
	var keys := ""
	var all_types := ""
	var classes := ""
	var filters := RegEx.create_from_string("(?i)auto-select|items known to be|items of unknown|unpaid items|used up items|just picked up|all types")
	for row in request.get("items", []):
		var selector := int(row.get("selector", 0))
		if selector <= 0:
			continue
		var row_text := str(row.get("text", "")).to_lower()
		if (not ids.is_empty() and ids.has(int(row.get("objectId", 0)))) or (text != "" and row_text.contains(text)):
			keys += char(selector)
		elif row_text.contains("all types"):
			all_types = char(selector)
		elif int(row.get("objectId", 0)) == 0 and filters.search(row_text) == null:
			# A class row of a "what type of objects?" menu ("Scrolls").
			classes += char(selector)
	var confirm := "\n" if int(request.get("how", 0)) == 2 else ""
	if keys != "":
		return keys + confirm
	if all_types != "" and not ids.is_empty():
		return all_types + confirm + "*"
	# No "All types" row (one class, mixed blessed/cursed knowledge or an
	# unpaid item: src/pickup.c query_category): every class row, which
	# adds no filter; the item menu then picks by objectId. Only in NetHack's
	# "what type of objects/items?" menus.
	var category_menu := str(request.get("prompt", "")).to_lower().contains("what type of")
	if classes != "" and not ids.is_empty() and category_menu:
		return classes + confirm + "*"
	return ""


static func _step_matches(step: Dictionary, request: Dictionary) -> bool:
	var want := str(step.kind)
	var kind := str(request.get("kind", ""))
	# Items are asked for either as a question or as a pick-one menu.
	return (want == "item" and (kind == "menu" or (kind == "yn" and str(request.get("choices", "")) == ""))) or want == kind


## Set when keys sent at the command prompt already hold an extended
## command's name ("#force\n"): NetHack's extended-command prompt is then
## answered by them, so the palette must not open (or sound) for it.
var _typed_extcmd := false


func note_sent(text: String) -> void:
	var at := text.find("#")
	if at >= 0 and text.find("\n", at) > at + 1:
		_typed_extcmd = true


## Whether this request is about to be answered automatically (so no dialog
## needs to flash up for it).
func will_answer(request: Dictionary) -> bool:
	if str(request.get("kind", "")) == "extcmd" and _typed_extcmd:
		_typed_extcmd = false
		return true
	if _sequence_running and not _sequence.is_empty() and _step_matches(_sequence[0], request):
		return true
	var kind := str(request.get("kind", ""))
	return _equipment_running and _equipment_letter != "" and kind == "yn" and str(request.get("choices", "")) == ""


## An item command ("Ta", "d2a", "#adjust\na", "#name\nia"): see send_sequence.
func send_item_command(keys: String) -> bool:
	if keys.begins_with("#") and keys.contains("\n"):
		var cut := keys.find("\n") + 1
		var command := keys.substr(0, cut)
		var rest := keys.substr(cut)
		if rest == "":
			return send_command(command)
		if command == "#name\n" and rest.length() >= 2:
			# #name asks what kind of thing first (a menu), then the item.
			return send_sequence(command, [{"kind": "menu", "keys": rest.substr(0, 1)}, {"kind": "item", "keys": rest.substr(1)}])
		return send_sequence(command, [{"kind": "item", "keys": rest}])
	if keys.length() < 2 or not keys[0].to_lower() in "abcdefghijklmnopqrstuvwxyz":
		return send_command(keys)
	return send_sequence(keys.substr(0, 1), [{"kind": "item", "keys": keys.substr(1)}])


## A command chain whose answers are menus and items ("/", then "i", then a
## letter).
func send_with_answers(command: String, answers: Array) -> bool:
	var steps := []
	for i in answers.size():
		steps.append({"kind": "menu" if i < answers.size() - 1 else "item", "keys": str(answers[i])})
	return send_sequence(command, steps)


## A command that asks for a direction ("o", "#chat\n", "a" + key letter):
## the item (if any) and the direction go only when NetHack asks for them.
func send_with_direction(command: String, dir: String) -> bool:
	if command.length() == 2 and command[0] == "a":
		return send_sequence("a", [{"kind": "item", "keys": command.substr(1)}, {"kind": "direction", "keys": dir}])
	return send_sequence(command, [{"kind": "direction", "keys": dir}])


func run_cell_action(cell: Vector2i, action: Dictionary) -> void:
	if action.has("dir") and action.has("command"):
		send_with_direction(str(action.command), str(action.dir))
		return
	match str(action.id):
		"travel":
			if screen.state.is_waiting_for_command():
				screen.send_map_click(cell)
		"look":
			if send_command(";"):
				screen.dialogs.pending_target = cell
		"loot":
			screen.dialogs.open_container()
		"pickup":
			if cell == screen.state.map.hero:
				screen.dialogs.open_ground()
			else:
				send_command(str(action.keys))
		_:
			send_command(str(action.keys))


func open_ui(name: String) -> void:
	match name:
		"overview":
			screen.world.toggle_overview()
		"look":
			send_command(";")
		_:
			screen.dialogs.open_panel(name)
