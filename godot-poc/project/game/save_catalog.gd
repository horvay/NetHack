class_name SaveCatalog
extends RefCounted
## Saved games, crash checkpoints and lock files in the NetHack playground.
##
## Lock sets are named <base>.0 (holds the owning pid, first 4 bytes) plus
## <base>.<n> level files. A set owned by this process is ours to delete once
## its game has ended or been abandoned (the game runs inside this process,
## so its pid stays alive). A set whose owner died with level data is a
## crash checkpoint: it is offered for recovery, never deleted.

const NAME_PATTERN := "^[A-Za-z0-9_][-A-Za-z0-9_]{0,23}$"
## New heroes: no "-", which NetHack's -uName-Role-Race... spec splits on
## ("Mary-Jane" would read "Jane" as a role).
const NEW_NAME_PATTERN := "^[A-Za-z0-9_][A-Za-z0-9_]{0,23}$"
const ROLES := ["Arc", "Bar", "Cav", "Hea", "Kni", "Mon", "Pri", "Ran", "Rog", "Sam", "Tou", "Val", "Wiz"]

var playground: String

## Lock sets of games that crashed inside this process: their level files
## are the run's only recovery data, so they are kept and offered.
static var preserved_bases: Array[String] = []


func _init(p_playground: String) -> void:
	playground = p_playground


static var _uid := ""


## Whether a process exists. Godot's OS.is_process_running logs an error
## for processes it didn't start (another game's lock owner), so on Linux
## look in /proc instead.
static func _alive(pid: int) -> bool:
	if OS.get_name() == "Linux":
		return DirAccess.dir_exists_absolute("/proc/%d" % pid)
	return OS.is_process_running(pid)


## The user id NetHack prefixes save files with (read once).
static func uid() -> String:
	if _uid == "":
		var output := []
		if OS.execute("id", ["-u"], output) == 0 and not output.is_empty():
			_uid = str(output[0]).strip_edges()
	return _uid


## Saved games: [{name, path, character{role, race, gender, align}, modified}]
func saves() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var dir := DirAccess.open(playground.path_join("save"))
	if dir == null:
		return result
	var prefix := uid()
	var name_re := RegEx.create_from_string(NAME_PATTERN)
	for file in dir.get_files():
		var base := file.trim_suffix(".gz")
		if prefix == "" or not base.begins_with(prefix):
			continue
		var name := base.substr(prefix.length())
		if name_re.search(name) == null:
			continue
		var path := playground.path_join("save").path_join(file)
		if FileAccess.get_file_as_bytes(path).is_empty():
			continue
		result.append({"name": name, "path": path, "character": _character_in(path, name),
			"modified": FileAccess.get_modified_time(path)})
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a.modified > b.modified)
	return result


func _character_in(path: String, name: String) -> Dictionary:
	var bytes := FileAccess.get_file_as_bytes(path)
	if path.ends_with(".gz"):
		bytes = bytes.decompress_dynamic(64 * 1024 * 1024, FileAccess.COMPRESSION_GZIP)
	var text := bytes.get_string_from_ascii() if bytes.size() < 4 else _latin1(bytes)
	var re := RegEx.create_from_string("(%s)-(Hum|Elf|Dwa|Gno|Orc)-(Mal|Fem|Neu)-(Law|Neu|Cha)" % "|".join(ROLES))
	var found := re.search(text, maxi(0, text.find(name)))
	if found == null:
		found = re.search(text)
	if found == null:
		return {"name": name}
	return {"name": name, "role": found.get_string(1), "race": found.get_string(2), "gender": found.get_string(3), "align": found.get_string(4)}


static func _latin1(bytes: PackedByteArray) -> String:
	var chars := PackedStringArray()
	chars.resize(bytes.size())
	for i in bytes.size():
		var b := bytes[i]
		chars[i] = char(b) if b >= 32 and b < 127 else "|"
	return "".join(chars)


## {base: {pid, size, levels: [n...]}}
func lock_sets() -> Dictionary:
	var sets := {}
	var dir := DirAccess.open(playground)
	if dir == null:
		return sets
	var re := RegEx.create_from_string("^(.*lock)\\.(\\d+)$")
	for file in dir.get_files():
		var m := re.search(file)
		if m == null:
			continue
		var base := m.get_string(1)
		var level := int(m.get_string(2))
		if not sets.has(base):
			sets[base] = {"pid": 0, "size": 0, "levels": []}
		if level == 0:
			var f := FileAccess.open(playground.path_join(file), FileAccess.READ)
			if f:
				sets[base].size = f.get_length()
				sets[base].pid = f.get_32() if f.get_length() >= 4 else 0
		else:
			sets[base].levels.append(level)
	return sets


## Deletes the lock set of a game this process ran and has finished with.
func clear_own_locks() -> Array[String]:
	var removed: Array[String] = []
	var own := OS.get_process_id()
	var sets := lock_sets()
	for base in sets:
		if int(sets[base].pid) == own and not preserved_bases.has(base):
			removed.append_array(_delete_set(base, sets[base]))
	# Plain stale locks: owner dead and nothing recoverable inside.
	for base in sets:
		var info: Dictionary = sets[base]
		var pid := int(info.pid)
		if pid > 0 and pid != own and not _alive(pid) and (info.levels as Array).is_empty() and int(info.size) <= 4:
			removed.append_array(_delete_set(base, info))
	return removed


func _delete_set(base: String, info: Dictionary) -> Array[String]:
	var removed: Array[String] = []
	var levels: Array = (info.levels as Array).duplicate()
	levels.append(0)
	for level in levels:
		var file := "%s.%d" % [base, level]
		if DirAccess.remove_absolute(playground.path_join(file)) == OK:
			removed.append(file)
	return removed


## NetHack's getlock (sys/unix/unixunix.c) reaps any lock set it finds
## under its own names (alock, block... with MAXPLAYERS) whose owner is dead,
## so the next game started would delete a crash checkpoint. Move those to
## names getlock never tries ("crash1lock"); recover takes any base name.
func protect_checkpoints() -> void:
	var own := OS.get_process_id()
	var sets := lock_sets()
	var letter := RegEx.create_from_string("^[a-z]lock$")
	for base in sets:
		var info: Dictionary = sets[base]
		var pid := int(info.pid)
		if letter.search(base) == null or (info.levels as Array).is_empty() or pid <= 0 or pid == own or _alive(pid):
			continue
		var n := 1
		while sets.has("crash%dlock" % n) or FileAccess.file_exists(playground.path_join("crash%dlock.0" % n)):
			n += 1
		var safe := "crash%dlock" % n
		for level in [0] + (info.levels as Array):
			DirAccess.rename_absolute(playground.path_join("%s.%d" % [base, level]), playground.path_join("%s.%d" % [safe, level]))


## Crash checkpoints that `recover` can turn back into a save.
func checkpoints() -> Array[Dictionary]:
	protect_checkpoints()
	var result: Array[Dictionary] = []
	var own := OS.get_process_id()
	var sets := lock_sets()
	for base in sets:
		var info: Dictionary = sets[base]
		var pid := int(info.pid)
		var crashed_here := pid == own and preserved_bases.has(base)
		if not crashed_here and (pid <= 0 or pid == own or _alive(pid)):
			continue
		if (info.levels as Array).is_empty():
			continue
		var level0 := playground.path_join(base + ".0")
		var name := _hero_in_lock(level0)
		result.append({"base": base, "levels": info.levels, "modified": FileAccess.get_modified_time(level0),
			"name": name, "character": _character_in(level0, name) if name != "" else {}})
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a.modified > b.modified)
	return result


## The hero of a crashed run: level 0 of the lock set names the save file
## ("save/1000Indy"), as NetHack's recover reads it.
func _hero_in_lock(path: String) -> String:
	# The save path is save/<uid><name>: strip the known uid, so names that
	# start with digits ("007Bond") keep them.
	var found := RegEx.create_from_string("save/" + uid() + "([A-Za-z0-9_-]+)").search(_latin1(FileAccess.get_file_as_bytes(path)))
	if found == null:
		found = RegEx.create_from_string("save/[0-9]*([A-Za-z0-9_-]+)").search(_latin1(FileAccess.get_file_as_bytes(path)))
	return found.get_string(1) if found else ""


## Moves a hero's saves to save/replaced/ (kept, but no longer listed or
## restored): recover writes a fresh save, and NetHack would otherwise
## still restore an older compressed one of the same name.
func set_aside_saves(name: String) -> Array[String]:
	var moved: Array[String] = []
	var aside := playground.path_join("save").path_join("replaced")
	DirAccess.make_dir_recursive_absolute(aside)
	var stamp := str(int(Time.get_unix_time_from_system()))
	for save in saves():
		if str(save.name) == name:
			var file := str(save.path).get_file()
			if DirAccess.rename_absolute(str(save.path), aside.path_join(file + "." + stamp)) == OK:
				moved.append(file + "." + stamp)
	return moved


## Puts saves set aside by set_aside_saves back (a recovery that failed).
func restore_set_aside(moved: Array[String]) -> void:
	var aside := playground.path_join("save").path_join("replaced")
	for stamped in moved:
		var file := stamped.get_basename()  # drops the ".<stamp>"
		DirAccess.rename_absolute(aside.path_join(stamped), playground.path_join("save").path_join(file))


## Throws a crash checkpoint away (its hero can't be recovered after).
func discard_checkpoint(base: String) -> void:
	var sets := lock_sets()
	if sets.has(base):
		_delete_set(base, sets[base])
	preserved_bases.erase(base)


## "today 18:59", "yesterday 09:12" or "Oct 15, 21:40", in local time.
static func when(unix: int) -> String:
	var local := unix + int(Time.get_time_zone_from_system().get("bias", 0)) * 60
	var now := int(Time.get_unix_time_from_system()) + int(Time.get_time_zone_from_system().get("bias", 0)) * 60
	var day := local / 86400
	var today := now / 86400
	var clock := Time.get_time_string_from_unix_time(local).substr(0, 5)
	if day == today:
		return "today " + clock
	if day == today - 1:
		return "yesterday " + clock
	var date := Time.get_datetime_dict_from_unix_time(local)
	var months := ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
	return "%s %d, %s" % [months[int(date.month) - 1], int(date.day), clock]


## Runs NetHack's recover utility; returns the recovered save name or "".
func recover(base: String) -> String:
	var recover_bin := NetHackSession.find_tool("recover")
	if recover_bin == "":
		return ""
	var output := []
	var code := OS.execute(recover_bin, ["-d", playground, base], output, true)
	var text := "\n".join(output)
	# recover exits 0 even when it fails: only its "recovered ... to ..."
	# line counts. Until then the checkpoint stays preserved (a second try
	# may work), and NetHack's own lock code mustn't take it.
	var m := RegEx.create_from_string("recovered \"[^\"]*\" to (\\S+)").search(text)
	if code != 0 or m == null:
		return ""
	preserved_bases.erase(base)
	return m.get_string(1).get_file()


## Marks this process's current lock sets as crash checkpoints.
func preserve_own_locks() -> void:
	var own := OS.get_process_id()
	var sets := lock_sets()
	for base in sets:
		if int(sets[base].pid) == own and not preserved_bases.has(base):
			preserved_bases.append(base)
