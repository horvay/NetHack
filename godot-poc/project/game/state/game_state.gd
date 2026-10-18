class_name GameState
extends RefCounted
## Client model of one running game, built only from bridge events.
##
## Owns the map, status, message log, inventory and the *request*: what the
## game is currently waiting for (a command, a direction, a yes/no answer, a
## line of text, an extended command, a menu choice, or any key). The UI
## renders the request; answering it sends keys back through NetHackSession.

signal map_changed
signal level_changed(depth: int)
signal hero_moved(from: Vector2i, to: Vector2i)
signal status_changed
signal message_added(entry: Dictionary)
## A skill can be advanced (NetHack's "You feel more confident in your
## weapon skills."), until a skills menu shows nothing to advance.
signal skill_ready_changed(ready: bool)
var skill_ready := false
var skill_ready_kind := ""
signal inventory_changed
signal request_changed(request: Dictionary)
signal text_window_shown(window: Dictionary)
signal game_over(info: Dictionary)
## A typed command (equipment, transfer, terrain) was refused; reason is
## player-facing text from the bridge.
signal command_refused(reason: String)
signal ending_started
## Life saved: the run goes on after all.
signal ending_cancelled
signal extcmd_catalog_changed
signal spells_changed
## A batch held NetHack animation beats (thrown objects, beams, explosions,
## multi-step travel): frames of {cells: {index: event}, hero: Vector2i}.
signal animation_ready(frames: Array)
## Latest container contents from shim_container_contents_snapshot.
signal container_contents(snapshot: Dictionary)
## A typed command's result: family (e.g. "container_transfer"), stage
## ("accepted", "queued", "confirmed", "rejected") and the event.
signal direct_result(family: String, stage: String, event: Dictionary)
## While NetHack asks for a position, its description of the cursor cell.
signal autodescribe(text: String)
## A position pick finished: what NetHack said about the picked cell.
signal getpos_result(lines: Array, cell: Vector2i)
signal pile_changed(cell: Vector2i)
## NetHack showed what lies on the hero's square ("Things that are here").
signal pile_shown(lines: Array, feature: String)

enum WindowType { MESSAGE = 1, STATUS = 2, MAP = 3, MENU = 4, TEXT = 5, PERMINVENT = 6 }

var map := MapModel.new()
var status := StatusModel.new()
var messages := MessageLog.new()
## A title for the next item menu NetHack leaves untitled, from the choice
## that led to it ("Look up which item?"); cleared at the command prompt.
var next_menu_title := ""
var inventory: Array = []
var inventory_revision := 0
var extcmd_catalog: Array = []
var request: Dictionary = {"kind": "busy"}
var character: Dictionary = {}
var seed := ""
## Continued from a save (its seed can't reproduce the dungeon).
var restored := false
## Messages before the first command prompt (start-up problems).
var start_messages: Array[String] = []
## The game reached its first command prompt.
var prompted := false
## How many spells the hero knows (shim_spell_availability); -1 = unknown.
var known_spells := -1
## NetHack's direction keys in its own order: W NW N NE E SE S SW down up.
## Changes to digits when the number_pad option is on.
var dirchars := "hykulnjb><"
var number_pad := false
## Where NetHack's map cursor sits while it asks for a position (getpos).
var cursor := Vector2i(-1, -1)
## Direction of the hero's last move or fight command (for feedback).
var last_direction := Vector2i.ZERO
signal cursor_moved(cell: Vector2i)
var dying := false
var ended := false
## True from NetHack's done() until the process exits (unless life-saved).
var ending := false
## Latest end diagnostics: phase, how, reason, killer, moves, depth...
var end_info: Dictionary = {}
## Disclosure collected at the end: section -> Array[String]
var chronicle: Dictionary = {}
## True once the player confirmed "Really save?" — the run ended by saving.
var save_confirmed := false
## Set when the app saves on its own (closing the window): answer
## NetHack's "Really save?" with yes.
var auto_confirm_save := false
## The bridge refused to start this game (exit code).
var start_failed_code := 0
var _last_question := ""


## NetHack's last question ("What do you want to eat? [fg or ?*]").
func last_question() -> String:
	return _last_question
var _map_dirty := false
var _in_getpos := false
var _getpos_buffer: Array[String] = []
## Cells printed since the last delay_output, and the beats so far.
var _segment: Dictionary = {}
var _frames: Array = []

## menuId -> {kind: "spell"|"skill", rows: Array} from the bridge's typed rows
var magic_rows: Dictionary = {}

## window id -> {type, lines: Array[{text, attr}], items, prompt, how}
var windows: Dictionary = {}
var _message_window := 1
var _map_window := 2


func set_character(spec: String) -> void:
	# NetHack -u form: Name-Role-Race-Gender-Align
	var parts := spec.split("-")
	character = {"name": parts[0] if parts.size() > 0 else "", "role": parts[1] if parts.size() > 1 else "",
		"race": parts[2] if parts.size() > 2 else "", "gender": parts[3] if parts.size() > 3 else "",
		"align": parts[4] if parts.size() > 4 else ""}


func apply(event: Dictionary) -> void:
	var event_type := str(event.get("eventType", ""))
	if event_type == "spell.rows" or event_type == "skill.rows":
		var payload: Dictionary = event.get("payload", {})
		var kind := event_type.split(".")[0]
		magic_rows[str(payload.get("menuId", ""))] = {"kind": kind, "rows": payload.get("rows", []), "slots": int(payload.get("slots", -1))}
		if kind == "skill" and not (payload.get("rows", []) as Array).any(func(r: Dictionary) -> bool: return bool(r.get("canAdvance", false))):
			_set_skill_ready(false)
		return
	var name := str(event.get("name", ""))
	if name in INPUT_WAITS:
		_input_wait_seen = true
	var direct := RegEx.create_from_string("^shim_(ground_transfer|container_transfer|container_snapshot|equipment_change|terrain_action)_(accepted|queued|confirmed|rejected)$").search(name)
	if direct:
		direct_result.emit(direct.get_string(1), direct.get_string(2), event)
	if name == "shim_container_contents_snapshot":
		container_contents.emit(event)
	if name.ends_with("_rejected") and name != "bridge_map_click_rejected" and not name.begins_with("shim_container_"):
		var reason := str(event.get("reason", event.get("failureKind", "")))
		if reason != "":
			command_refused.emit(reason)
	match name:
		"shim_spell_availability":
			var count := int(event.get("knownSpellCount", 0))
			if count != known_spells:
				known_spells = count
				spells_changed.emit()
		"bridge_seed":
			# A restored game is reseeded at random: that seed means nothing.
			seed = "" if restored else str(event.get("seed", ""))
		"shim_number_pad":
			number_pad = int(event.get("enabled", 0)) != 0
			var keys := str(event.get("directionKeys", ""))
			if keys.length() >= 8:
				dirchars = keys
		"shim_create_nhwindow":
			_create_window(int(event.get("return", -1)), int(event.get("windowType", 0)))
		"shim_destroy_nhwindow":
			windows.erase(int(event.get("window", -1)))
		"shim_clear_nhwindow":
			_clear_window(int(event.get("window", -1)))
		"shim_display_nhwindow":
			_display_window(int(event.get("window", -1)), int(event.get("blocking", 0)) != 0)
		"shim_print_glyph":
			_print_glyph(event)
			var at := Vector2i(int(event.get("x", -1)), int(event.get("y", -1)))
			if MapModel.in_bounds(at):
				_segment[MapModel.index_of(at)] = event
		"shim_delay_output":
			_frames.append({"cells": _segment, "hero": map.hero})
			_segment = {}
		"shim_ground_pile_snapshot":
			map.set_pile(Vector2i(int(event.get("x", -1)), int(event.get("y", -1))), event.get("items", []))
			pile_changed.emit(Vector2i(int(event.get("x", -1)), int(event.get("y", -1))))
		"shim_curs":
			var at := Vector2i(int(event.get("x", -1)), int(event.get("y", -1)))
			if int(event.get("window", -1)) == _map_window or event.has("actorId"):
				cursor = at
				cursor_moved.emit(at)
			if event.get("actorId") == "hero":
				_move_hero(at)
		"shim_putstr":
			_putstr(event)
		"shim_raw_print", "shim_raw_print_bold":
			if not prompted and _config_error(str(event.get("text", ""))):
				return
			if not prompted:
				# Before the first command prompt: what NetHack says if it
				# refuses to start (shown on the end screen).
				start_messages.append(str(event.get("text", "")))
			_add_message(str(event.get("text", "")), 0)
		"shim_putmsghistory":
			if event.has("text"):
				_log(str(event.get("text", "")), 0, true)
		"shim_status_update":
			if status.apply(event):
				status_changed.emit()
		"shim_update_inventory":
			inventory = event.get("items", [])
			inventory_revision += 1
			inventory_changed.emit()
		"bridge_vision":
			var level_change := map.apply_vision(event)
			if level_change:
				level_changed.emit(map.depth)
			_map_dirty = true
		"shim_start_menu":
			var w := _window(int(event.get("window", -1)))
			w["items"] = []
			w["prompt"] = ""
		"shim_add_menu":
			_window(int(event.get("window", -1)))["items"].append(event)
		"shim_end_menu":
			_window(int(event.get("window", -1)))["prompt"] = str(event.get("prompt", ""))
		"shim_select_menu":
			_open_menu(event)
		"bridge_extcmd_catalog":
			extcmd_catalog = event.get("commands", [])
			extcmd_catalog_changed.emit()
		"bridge_command_prompt":
			if not prompted and not _config_errors.is_empty():
				# One plain line instead of NetHack's raw option-error report.
				_add_message("NetHack didn't understand some Extra NetHack options (Settings): %s" % "; ".join(_config_errors), 0)
				_config_errors.clear()
			prompted = true
			_set_request({"kind": "command", "event": event})
		"bridge_direction_prompt":
			var purpose := str(event.get("promptPurpose", "prompt.direction"))
			var kind := "map_target" if purpose == "prompt.mapTarget" else ("direction" if purpose == "prompt.direction" else "key")
			_set_request({"kind": kind, "query": str(event.get("query", "")), "event": event})
		"shim_yn_function":
			if event.get("lifecycle") == "opened":
				if str(event.get("promptPurpose", "")) != "prompt.direction":
					messages.note(str(event.get("query", "")), status.turn(), "question")
				_open_question(event)
		"shim_getlin":
			if event.get("lifecycle") == "opened":
				messages.note(str(event.get("query", "")), status.turn(), "question")
				_set_request({"kind": "line", "query": str(event.get("query", "")), "event": event})
		"shim_get_ext_cmd":
			if event.get("lifecycle") == "opened":
				_set_request({"kind": "extcmd", "event": event})
		"bridge_key_wait":
			if request.get("kind") == "busy":
				_set_request({"kind": "key", "query": "", "event": event})
		"bridge_start_failed":
			start_failed_code = int(event.get("code", 1))
		"bridge_prompt_answer", "bridge_line_answer", "bridge_extcmd_answer", "bridge_menu_answer", "bridge_direction_answer", "shim_nhgetch", "shim_nh_poskey":
			_note_answer(event)
			_set_request({"kind": "busy"})
		"shim_outrip":
			dying = true
		"shim_native_end_diagnostic":
			end_info.merge(event, true)
			var phase := str(event.get("phase", ""))
			if phase == "done.enter" and not ending:
				ending = true
				ending_started.emit()
			elif phase == "done.survived":
				# Life saved: the run goes on, so nothing of that death stays.
				ending = false
				end_info.clear()
				chronicle.clear()
				ending_cancelled.emit()
		"bridge_exit":
			ended = true
			game_over.emit({"code": int(event.get("code", 0)), "reason": str(event.get("reason", ""))})


## Called once per drained batch: publish one map change and any beats.
## Events that mean NetHack stopped to wait for the player: an animated
## sequence (a throw, a zap, a run) is complete only then, even when its
## events arrived over several frames.
const INPUT_WAITS := ["bridge_command_prompt", "bridge_key_wait", "shim_yn_function", "shim_getlin",
	"shim_select_menu", "shim_get_ext_cmd", "bridge_direction_prompt"]
var _input_wait_seen := false
var _frames_since := 0


func end_batch() -> void:
	if not _frames.is_empty():
		if _frames_since == 0:
			_frames_since = Time.get_ticks_msec()
		# Hold the beats until NetHack waits for input (or briefly at most).
		if _input_wait_seen or Time.get_ticks_msec() - _frames_since > 400:
			_frames.append({"cells": _segment, "hero": map.hero})
			var frames := _frames
			_frames = []
			_frames_since = 0
			_segment = {}
			animation_ready.emit(frames)
	else:
		_segment = {}
	_input_wait_seen = false
	if _map_dirty:
		_map_dirty = false
		map_changed.emit()


## The player answered one of NetHack's yes/no questions (key as typed).
signal question_answered(query: String, key: String)


func _note_answer(event: Dictionary) -> void:
	if str(event.get("name", "")) == "bridge_prompt_answer" and _last_question != "":
		# (Keycode 0: no answer, as when Esc backs out of "Which ring-finger?".)
		var keycode := int(event.get("keycode", 0))
		question_answered.emit(_last_question, char(keycode) if keycode > 0 else "")
	if str(event.get("name", "")) == "bridge_prompt_answer" and int(event.get("keycode", 0)) == 121 \
			and _last_question.to_lower().contains("really save"):
		save_confirmed = true


func _set_request(new_request: Dictionary) -> void:
	answer_pending = false
	var kind := str(new_request.get("kind", ""))
	if kind == "yn":
		_last_question = str(new_request.get("query", ""))
	if kind == "map_target":
		# Lines printed while the cursor moved describe the cursor cell.
		if not _getpos_buffer.is_empty():
			autodescribe.emit(_getpos_buffer[-1])
		_getpos_buffer.clear()
		_in_getpos = true
	elif kind != "busy" and _in_getpos:
		_in_getpos = false
		var lines := _getpos_buffer.duplicate()
		_getpos_buffer.clear()
		for line in lines:
			# "f      a cat (tame kitten)": drop NetHack's map-symbol column.
			_log(DialogHost._strip_symbol(line), 0)
		if not lines.is_empty():
			getpos_result.emit(lines, cursor)
	request = new_request
	request_changed.emit(request)


func _window(id: int) -> Dictionary:
	if not windows.has(id):
		windows[id] = {"id": id, "type": WindowType.MENU, "lines": [], "items": [], "prompt": ""}
	return windows[id]


func _create_window(id: int, type: int) -> void:
	if id < 0:
		return
	windows[id] = {"id": id, "type": type, "lines": [], "items": [], "prompt": ""}
	if type == WindowType.MESSAGE:
		_message_window = id
	elif type == WindowType.MAP:
		_map_window = id


func _clear_window(id: int) -> void:
	if id == _map_window:
		map.reset()
		_map_dirty = true
	elif windows.has(id) and id != _message_window:
		windows[id]["lines"] = []


func _display_window(id: int, _blocking: bool) -> void:
	if not windows.has(id) or id == _message_window or id == _map_window:
		return
	var w: Dictionary = windows[id]
	if (w["lines"] as Array).is_empty():
		return
	var lines: Array = w["lines"]
	for i in lines.size():
		if str(lines[i].get("text", "")).strip_edges().begins_with("Things that are here") and not ending:
			var feature := ""
			for j in i:
				if str(lines[j].get("text", "")).strip_edges() != "":
					feature = str(lines[j].text).strip_edges()
			pile_shown.emit(lines.slice(i + 1), feature)
			w["lines"] = []
			return
	# The opening lore ("It is written in the Book of ...") belongs in the
	# run's history.
	if not lines.is_empty() and str(lines[0].get("text", "")).begins_with("It is written in the Book of"):
		for line in lines:
			messages.note(str(line.get("text", "")), 0, "lore")
	text_window_shown.emit({"id": id, "lines": (w["lines"] as Array).duplicate(), "type": w["type"]})
	w["lines"] = []


func _print_glyph(event: Dictionary) -> void:
	var pos := Vector2i(int(event.get("x", -1)), int(event.get("y", -1)))
	map.set_cell(pos, event)
	if event.get("actorId") == "hero":
		_move_hero(pos)
	_map_dirty = true


func _move_hero(pos: Vector2i) -> void:
	if pos == map.hero:
		return
	var from := map.hero
	map.hero = pos
	hero_moved.emit(from, pos)


func _putstr(event: Dictionary) -> void:
	var id := int(event.get("window", -1))
	var text := str(event.get("text", ""))
	var attr := int(event.get("attr", 0))
	if id == _message_window:
		_add_message(text, attr)
	else:
		_window(id)["lines"].append({"text": text, "attr": attr})


func _set_skill_ready(ready: bool, kind := "") -> void:
	if ready == skill_ready and kind == skill_ready_kind:
		return
	skill_ready = ready
	skill_ready_kind = kind if ready else ""
	skill_ready_changed.emit(ready)


func _add_message(text: String, attr: int) -> void:
	var confident := RegEx.create_from_string("(?i)you feel more confident in your (.+?) skills").search(text)
	if confident:
		_set_skill_ready(true, confident.get_string(1))
	if _in_getpos and text.strip_edges() != "":
		_getpos_buffer.append(text.strip_edges())
		return
	_log(text, attr)


## history: restored from a save (no sound, no feedback).
func _log(text: String, attr: int, history := false) -> void:
	var entry := messages.add(text, status.turn(), attr)
	if history and not entry.is_empty():
		entry["history"] = true
	if not entry.is_empty():
		message_added.emit(entry)


func _open_question(event: Dictionary) -> void:
	if str(event.get("promptPurpose", "")) == "prompt.direction":
		_set_request({"kind": "direction", "query": str(event.get("query", "")), "choices": str(event.get("choices", "")), "event": event})
		return
	# "default": the answer Enter gives (the bridge sends NetHack's def).
	_set_request({"kind": "yn", "query": str(event.get("query", "")), "choices": str(event.get("choices", "")),
		"default": str(event.get("default", "")), "purpose": str(event.get("promptPurpose", "")), "event": event})


var _config_errors: Array[String] = []


## NetHack's report of options it couldn't use, printed before the game
## starts: " * Unknown option: foo.", "1 error in NETHACKOPTIONS." Collected into one notice; true when the line was one.
func _config_error(text: String) -> bool:
	var line := text.strip_edges()
	if line == "":
		return false
	if RegEx.create_from_string("^\\d+ errors? (in|on) ").search(line) != null:
		return true
	var item := RegEx.create_from_string("^(?:\\* |config_error_add: )(.*)$").search(line)
	if item:
		_config_errors.append(item.get_string(1).trim_suffix("."))
		return true
	return false


func _open_menu(event: Dictionary) -> void:
	var id := int(event.get("window", -1))
	var w := _window(id)
	_set_request({"kind": "menu", "window": id, "how": int(event.get("how", 0)), "prompt": str(w.get("prompt", "")),
		"items": (w.get("items", []) as Array).duplicate(), "purpose": str(event.get("menuPurpose", "")),
		"menu_id": str(event.get("menuId", "")), "event": event})


const DIRECTION_ORDER := [Vector2i(-1, 0), Vector2i(-1, -1), Vector2i(0, -1), Vector2i(1, -1), Vector2i(1, 0), Vector2i(1, 1), Vector2i(0, 1), Vector2i(-1, 1)]


## The key NetHack currently uses for a step in this direction.
func direction_key(delta: Vector2i) -> String:
	var index := DIRECTION_ORDER.find(delta)
	return dirchars[index] if index >= 0 and index < dirchars.length() else ""


## The direction keys a direction prompt offers when NetHack lists them
## ("In what direction do you want to dig? [yulnjbh>]"); "" when it doesn't
## (any direction goes).
func offered_directions(query: String) -> String:
	var at := query.rfind("[")
	var end := query.rfind("]")
	if at < 0 or end <= at + 1:
		return ""
	var listed := query.substr(at + 1, end - at - 1)
	var known := dirchars + "<>."
	for ch in listed:
		if not known.contains(ch):
			return ""
	return listed


## Whether a direction prompt accepts this key (always, when it lists none).
func offers_direction(query: String, key: String) -> bool:
	var listed := offered_directions(query)
	return listed == "" or listed.contains(key)


## Count prefix: digits are movement under number_pad, so NetHack wants 'n'.
func count_prefix(count: int) -> String:
	return ("n" if number_pad else "") + str(count)


## Records a position the player picked with the mouse (NetHack takes a
## click without moving its cursor there).
func note_target(cell: Vector2i) -> void:
	cursor = cell
	cursor_moved.emit(cell)


## Where the hero is, in one consistent wording: "Depth 3" (short) or
## "Gnomish Mines · Depth 3" (long). Special places NetHack names itself
## ("Home 1", "Fort Ludios", "Astral Plane") keep NetHack's words.
func level_name(long := false) -> String:
	var desc := status.text(StatusModel.Field.LEVELDESC).strip_edges()
	if desc != "" and not desc.begins_with("Dlvl"):
		return desc
	var depth := map.depth
	if depth <= 0 and desc.begins_with("Dlvl"):
		depth = int(desc.trim_prefix("Dlvl:").strip_edges())
	var depth_text := "Depth %d" % depth
	if not long:
		return depth_text
	var branch := map.dungeon.trim_prefix("The ")
	return "%s · %s" % [branch, depth_text] if branch != "" else depth_text


## Set when Godot has sent something to the command prompt that NetHack
## hasn't read yet (its answer event comes a frame later): the prompt is
## taken, so nothing else may be sent to it meanwhile.
var answer_pending := false


func is_waiting_for_command() -> bool:
	return request.get("kind") == "command" and not answer_pending
