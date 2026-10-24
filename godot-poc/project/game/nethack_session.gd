class_name NetHackSession
extends Node
## One NetHack game at a time, run in process by the NetHackCore extension.
##
## Wraps NetHackCore with the playground, character, seed and lock handling
## the game needs, and re-emits bridge events (the shim bridge protocol,
## see docs/bridge-protocol.md and docs/ui-protocol-v2.md).

signal event_received(event: Dictionary)
signal game_ended(result: Dictionary)
## Every event of this frame has been delivered.
signal events_drained

const DEFAULT_OPTIONS := "!tutorial,!tips,time,showexp,showscore,runmode:walk"
const ESC := 27

var core: Node
var playground: String = _resolve_playground()
## Tests only: a bridge fixture scenario id (godot-poc/tests/fixtures),
## run on the fixture-enabled core. Empty for real games.
var fixture_id := ""
## Tests only: extra fixture switches (e.g. NH_SHIM_TEST_SHOP_PAYMENT_SCENE),
## also run on the fixture-enabled core.
var fixture_env := {}


## The NetHack data directory (nhdat, sysconf, symbols, saves, scores).
## In the source tree: the repository's playground. In an exported build: a
## per-user copy in user://playground, made on first run from the template
## shipped next to the executable.
static func _resolve_playground() -> String:
	var dev := ProjectSettings.globalize_path("res://").path_join("../../playground").simplify_path()
	# Tests (tests/run.sh): a throwaway playground with the game data only,
	# so test runs never touch the player's saves, scores or crash files.
	var isolated := OS.get_environment("NH_GODOT_PLAYGROUND")
	if isolated != "":
		if not FileAccess.file_exists(isolated.path_join("nhdat")):
			_fresh_playground(dev, isolated)
		return isolated
	if OS.has_feature("editor") or FileAccess.file_exists(dev.path_join("nhdat")):
		return dev
	var user := ProjectSettings.globalize_path("user://playground")
	# A new app version brings new game data: refresh it (never saves or
	# scores) when the stamp differs.
	var version := str(ProjectSettings.get_setting("application/config/version", "dev"))
	var stamp := user.path_join(".data-version")
	if not FileAccess.file_exists(user.path_join("nhdat")) or FileAccess.get_file_as_string(stamp) != version:
		var template := OS.get_executable_path().get_base_dir().path_join("playground")
		_copy_tree(template, user, true)
		var file := FileAccess.open(stamp, FileAccess.WRITE)
		if file:
			file.store_string(version)
	return user


## A playground with NetHack's data and empty score files, nothing else.
static func _fresh_playground(from: String, to: String) -> void:
	DirAccess.make_dir_recursive_absolute(to.path_join("save"))
	for file in ["nhdat", "sysconf", "symbols", "license"]:
		if FileAccess.file_exists(from.path_join(file)):
			DirAccess.copy_absolute(from.path_join(file), to.path_join(file))
	for file in PLAYER_FILES:
		FileAccess.open(to.path_join(file), FileAccess.WRITE)


## Copies game data; refresh replaces data files too. Saves and score
## files are never overwritten.
const PLAYER_FILES := ["record", "logfile", "xlogfile", "perm", "livelog", "paniclog"]


static func _copy_tree(from: String, to: String, refresh := false) -> void:
	DirAccess.make_dir_recursive_absolute(to)
	var dir := DirAccess.open(from)
	if dir == null:
		push_error("NetHack data not found at %s" % from)
		return
	for file in dir.get_files():
		var exists := FileAccess.file_exists(to.path_join(file))
		if not exists or (refresh and not PLAYER_FILES.has(file)):
			DirAccess.copy_absolute(from.path_join(file), to.path_join(file))
	for sub in dir.get_directories():
		if sub != "save":
			_copy_tree(from.path_join(sub), to.path_join(sub), refresh)
		else:
			DirAccess.make_dir_recursive_absolute(to.path_join(sub))


## A NetHack helper program (e.g. "recover"): from the source tree's util/,
## or shipped next to the executable / the core library. "" if missing.
static func find_tool(name: String) -> String:
	for candidate in [
		ProjectSettings.globalize_path("res://").path_join("../../util/" + name).simplify_path(),
		OS.get_executable_path().get_base_dir().path_join(name),
		ProjectSettings.globalize_path("res://bin/" + name),
	]:
		if FileAccess.file_exists(candidate):
			return candidate
	return ""


func _ready() -> void:
	core = ClassDB.instantiate("NetHackCore")
	core.name = "NetHackCore"
	add_child(core)
	core.event_received.connect(func(event: Dictionary) -> void:
		if _diagnostics:
			_diagnostics.store_line(JSON.stringify({"t": Time.get_ticks_msec(), "event": event}))
		event_received.emit(event))
	core.events_drained.connect(func() -> void: events_drained.emit())
	core.game_ended.connect(_on_core_game_ended)


## character is NetHack's -u form, e.g. "Name-Val-Hum-Fem-Law".
## Settings > Keep a diagnostics log: every bridge event and every line
## sent, one JSON object per line, in user://diagnostics/<start time>.jsonl.
var keep_diagnostics := false
var _diagnostics: FileAccess


func _send_line(line: String) -> bool:
	if _diagnostics:
		_diagnostics.store_line(JSON.stringify({"t": Time.get_ticks_msec(), "sent": line}))
	return core.send_line(line)


func _open_diagnostics(character: String, seed: String) -> void:
	_diagnostics = null
	if not keep_diagnostics:
		return
	DirAccess.make_dir_recursive_absolute("user://diagnostics")
	var stamp := Time.get_datetime_string_from_system().replace(":", "-")
	_diagnostics = FileAccess.open("user://diagnostics/%s.jsonl" % stamp, FileAccess.WRITE)
	if _diagnostics:
		_diagnostics.store_line(JSON.stringify({"t": Time.get_ticks_msec(), "start": character, "seed": seed, "options": _start_options}))


var _start_options := ""


## Options the interface depends on, whatever else is set: full menus
## (the transfer screens answer NetHack's menus by objectId).
const REQUIRED_OPTIONS := "menustyle:full"


func start_game(character: String, seed: String = "", options: String = DEFAULT_OPTIONS) -> Error:
	_start_options = options
	_open_diagnostics(character, seed)
	clear_stale_locks()
	# Before NetHack's own lock code can reap a crashed run's checkpoint.
	catalog().protect_checkpoints()
	_ensure_playground_files()
	_xlog_offset = _xlog_size()
	# NetHack reads no rc file (-no-nethackrc, below): the player's
	# ~/.nethackrc would fight the interface (menustyle) and its Settings.
	# The options go as a plain string (no file to fail to open, no length
	# limit). NetHack applies the list right to left, so the leftmost wins:
	# menustyle:full, then Settings, then extra options, then defaults.
	var env := {"NETHACKDIR": playground, "NETHACKOPTIONS": REQUIRED_OPTIONS + "," + options, "NH_BRIDGE_EXTENDED": "1"}
	if seed != "":
		env["NH_ELECTRON_CHOSEN_SEED"] = seed
	core.library_path = ""
	if fixture_id != "" or not fixture_env.is_empty():
		core.library_path = ProjectSettings.globalize_path("res://bin/libnethack_core_fixtures.so")
		env["NH_ELECTRON_TEST_FIXTURES"] = "1"
		env.merge(fixture_env, true)
	if fixture_id != "":
		env["NH_TEST_SCENARIO_ID"] = fixture_id
		# The bridge resolves scenario files from the repository root.
		env["NH_GODOT_WORKDIR"] = ProjectSettings.globalize_path("res://").path_join("../..").simplify_path()
	return core.start(PackedStringArray(["-no-nethackrc", "-u" + character]), env)


func is_running() -> bool:
	return core.is_running()


## Types text into the game exactly as keystrokes ("\n" is Enter). Printable
## runs go as one {"key"} line; control and meta keys as {"keycode"} lines,
## because the bridge's string parser only knows \n \r \t \b escapes.
func send_keys(text: String) -> bool:
	var ok := true
	var run := ""
	for i in text.length():
		var code := text.unicode_at(i)
		if (code >= 32 and code <= 126) or code == 10 or code == 13 or code == 9 or code == 8:
			run += text[i]
			continue
		if run != "":
			ok = _send_line(JSON.stringify({"key": run})) and ok
			run = ""
		ok = send_keycode(code) and ok
	if run != "":
		ok = _send_line(JSON.stringify({"key": run})) and ok
	return ok


## Clicks a map cell (button 1 = travel/select, 2 = secondary). Only valid
## while the game reads a command or a map position.
func send_map_click(cell: Vector2i, button := 1) -> bool:
	return _send_line(JSON.stringify({"type": "map-click", "x": cell.x, "y": cell.y, "button": button}))


func send_keycode(code: int) -> bool:
	return _send_line(JSON.stringify({"keycode": code}))


func send_escape() -> bool:
	return send_keycode(ESC)


## Abandons the running game without saving. Blocks until it has unwound.
func stop_game() -> void:
	core.stop()


## Removes lock files this process no longer needs (see SaveCatalog).
func clear_stale_locks() -> Array[String]:
	if core.is_running():
		return []
	return SaveCatalog.new(playground).clear_own_locks()


func catalog() -> SaveCatalog:
	return SaveCatalog.new(playground)


func _on_core_game_ended(result: Dictionary) -> void:
	if _diagnostics:
		_diagnostics.store_line(JSON.stringify({"t": Time.get_ticks_msec(), "ended": result}))
		_diagnostics.close()
		_diagnostics = null
	# A crash leaves NetHack's level files as the only way to recover the run:
	# keep them so the title screen can offer recovery.
	var clean := str(result.get("reason", "")) in ["exit", "stopped"] and int(result.get("code", 0)) == 0
	if not clean:
		catalog().preserve_own_locks()
	result["stale_locks_removed"] = clear_stale_locks() if clean else []
	var record := _new_xlog_record()
	if not record.is_empty():
		result["xlog"] = record
	game_ended.emit(result)


var _xlog_offset := 0


func _xlog_size() -> int:
	var file := FileAccess.open(playground.path_join("xlogfile"), FileAccess.READ)
	return file.get_length() if file else 0


## NetHack's own record of the run that just ended (points, death, turns,
## max depth...), when it wrote one: every finished game does, a save not.
func _new_xlog_record() -> Dictionary:
	var file := FileAccess.open(playground.path_join("xlogfile"), FileAccess.READ)
	if file == null or file.get_length() <= _xlog_offset:
		return {}
	file.seek(_xlog_offset)
	var record := {}
	for line in file.get_as_text().split("\n", false):
		record = {}
		for field in line.split("\t", false):
			var eq := field.find("=")
			if eq > 0:
				record[field.substr(0, eq)] = field.substr(eq + 1)
	return record


var _command_serial := 0


## Sends a typed v2 command (equipment-change, ground-transfer, ...).
## Ids and numbers are integers: the bridge rejects JSON floats.
func send_typed(line_type: String, command_type: String, payload: Dictionary, expected_revision := {}) -> String:
	_command_serial += 1
	var command_id := "gd-%s-%d-%d" % [line_type, _command_serial, Time.get_ticks_msec()]
	var command := {
		"protocol": "nethack-electron-ui/v2",
		"commandType": command_type,
		"commandId": command_id,
		"transactionId": command_id,
		"payload": payload,
	}
	if not expected_revision.is_empty():
		command["expectedRevision"] = expected_revision
	_send_line(JSON.stringify({"type": line_type, "command": command}))
	return command_id


func send_equipment_change(action: String, item_id: int, slot_id: String, hand := "") -> String:
	var payload := {"action": action}
	if item_id > 0:
		payload["itemId"] = item_id
	if slot_id != "":
		payload["slotId"] = slot_id
	if hand != "":
		payload["hand"] = hand
	return send_typed("equipment-change", "equipment.change", payload)


## NetHack expects these score files to exist (it complains at game end
## otherwise). Never overwrites existing scores.
func _ensure_playground_files() -> void:
	DirAccess.make_dir_recursive_absolute(playground.path_join("save"))
	for file in ["record", "logfile", "xlogfile"]:
		var path := playground.path_join(file)
		if not FileAccess.file_exists(path):
			FileAccess.open(path, FileAccess.WRITE).close()


func send_container_snapshot(container_id: int, session_id: String) -> String:
	return send_typed("container-snapshot", "container.snapshot", {"sessionId": session_id, "containerId": container_id})


## Picks up or drops one whole stack at the hero's square (ground-transfer).
func send_ground_transfer(direction: String, item_id: int, cell: Vector2i) -> String:
	_command_serial += 1
	return send_typed("ground-transfer", "ground.transfer", {"direction": direction, "transferId": "gd-xfer-%d" % _command_serial,
		"itemId": item_id, "coord": {"x": cell.x, "y": cell.y}, "count": "all"})


## more_ids: further stacks the same way, moved by the same command in the
## same turn.
func send_container_transfer(direction: String, container_id: int, item_id: int, session_id: String, more_ids: Array = []) -> String:
	_command_serial += 1
	var payload := {"direction": direction, "transferId": "gd-xfer-%d" % _command_serial,
		"sessionId": session_id, "containerId": container_id, "itemId": item_id}
	if not more_ids.is_empty():
		payload["moreItemIds"] = more_ids
	return send_typed("container-transfer", "container.transfer", payload)
