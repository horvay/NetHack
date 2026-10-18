class_name MusicDirector
extends Node
## The game's music (MiniMax Music 3 pieces, godot-poc/tools/music):
##   - a theme for each part of the dungeon (the Mines, Minetown, Sokoban,
##     the Oracle, Medusa, the Castle, Gehennom, the quest home of each role,
##     the Planes...), a calm take while exploring and a tense one while
##     hostiles are close, crossfaded;
##   - shops, temples and throne rooms (rooms NetHack announces on entry)
##     have their own themes while it's calm;
##   - short stingers: level up, a prayer answered, an artifact in the pack,
##     a new branch, death, ascension;
##   - the title screen, the tombstone and the ascension have their pieces;
##   - the music ducks under NetHack's windows and questions and fades in.
## Every theme is a whole piece with an opening and an ending; when one ends
## another take of it follows, crossfaded. A track with no music yet falls
## back to the area's, then the dungeon's.

const MANIFEST := "res://assets/music/music.json"
const FADE := 3.0
const DUCK_DB := -8.0
const STINGER_DUCK_DB := -12.0
## How long it stays tense after the last hostile left sight (s).
const CALM_AFTER := 7.0
const TENSE_RANGE := 6
const ARTIFACTS := ["Excalibur", "Stormbringer", "Mjollnir", "Cleaver", "Grimtooth", "Orcrist", "Sting", "Magicbane",
	"Frost Brand", "Fire Brand", "Dragonbane", "Demonbane", "Werebane", "Grayswandir", "Giantslayer", "Ogresmasher",
	"Trollsbane", "Vorpal Blade", "Snickersnee", "Sunsword", "Orb of Detection", "Heart of Ahriman", "Sceptre of Might",
	"Palantir of Westernesse", "Staff of Aesculapius", "Magic Mirror of Merlin", "Eyes of the Overworld",
	"Mitre of Holiness", "Longbow of Diana", "Master Key of Thievery", "Tsurugi of Muramasa",
	"Platinum Yendorian Express Card", "Orb of Fate", "Eye of the Aethiopica"]
const QUEST_ROLES := {"Arc": "arc", "Bar": "bar", "Cav": "cav", "Hea": "hea", "Kni": "kni", "Mon": "mon", "Pri": "pri",
	"Ran": "ran", "Rog": "rog", "Sam": "sam", "Tou": "tou", "Val": "val", "Wiz": "wiz"}

var settings: Settings
## Track id -> its takes (res:// paths).
var library: Dictionary = {}
## The track asked for, and the one playing (after fallbacks); "" for none.
var wanted := ""
var current := ""
## Stingers played this run, in order (tests and diagnostics).
var stingers: Array[String] = []
var tense := false

var _players: Array[AudioStreamPlayer] = []
var _active := 0
var _stinger: AudioStreamPlayer
var _take := {}
var _duck_db := 0.0
var _stinger_until := 0.0
var _screen: GameScreen
var _last_hostile := -1000.0
var _branches_seen := {}
var _artifacts_seen := {}
var _praying := 0
## The pack seen once (a continued game may start with an artifact).
var _inventory_known := false
var _rules: Array = []
var _prayer_answered := RegEx.create_from_string("(?i)is well-pleased|is pleased|is satisfied|hopeful feeling|reconciliation|you feel much better|shimmering light|golden glow")


func _ready() -> void:
	name = "MusicDirector"
	_ensure_bus()
	for i in 2:
		var player := AudioStreamPlayer.new()
		player.bus = "Music"
		player.volume_db = -80.0
		player.finished.connect(_on_finished.bind(player))
		add_child(player)
		_players.append(player)
	_stinger = AudioStreamPlayer.new()
	_stinger.bus = "Music"
	add_child(_stinger)
	var file := FileAccess.open(MANIFEST, FileAccess.READ)
	if file:
		var parsed: Variant = JSON.parse_string(file.get_as_text())
		if parsed is Dictionary:
			library = (parsed as Dictionary).get("tracks", {})
	_rules = [
		[RegEx.create_from_string("(?i)welcome to experience level"), "sting-levelup"],
		[RegEx.create_from_string("(?i)^you die\\.\\.\\."), "sting-death"],
	]
	apply_settings()


func _ensure_bus() -> void:
	if AudioServer.get_bus_index("Music") >= 0:
		return
	AudioServer.add_bus()
	var index := AudioServer.bus_count - 1
	AudioServer.set_bus_name(index, "Music")
	AudioServer.set_bus_send(index, "Master")


func apply_settings() -> void:
	var index := AudioServer.get_bus_index("Music")
	var volume := settings.music_volume if settings else 0.6
	AudioServer.set_bus_volume_db(index, linear_to_db(maxf(volume, 0.0001)))
	AudioServer.set_bus_mute(index, volume <= 0.0)


## Plays a track (crossfading from whatever plays); "" fades the music out.
func play(id: String) -> void:
	wanted = id
	var resolved := _resolve(id)
	if resolved == current:
		return
	current = resolved
	var old := _players[_active]
	_fade(old, -80.0, FADE, true)
	if resolved == "":
		return
	_active = 1 - _active
	_start(_players[_active], resolved, FADE)


## A short cue over the music, which ducks under it.
func sting(id: String) -> void:
	stingers.append(id)
	var path := _pick(id)
	if path == "":
		return
	_stinger.stream = load(path)
	_stinger.volume_db = 0.0
	_stinger.play()
	_stinger_until = Time.get_ticks_msec() / 1000.0 + _stinger.stream.get_length()


## The track for a game screen, kept up to date as the hero goes.
func follow(screen: GameScreen) -> void:
	_screen = screen
	_branches_seen.clear()
	_artifacts_seen.clear()
	_inventory_known = false
	_last_hostile = -1000.0
	tense = false
	screen.state.message_added.connect(_on_message)
	screen.state.level_changed.connect(_on_level)
	screen.state.inventory_changed.connect(_on_inventory)
	_update()


func unfollow() -> void:
	_screen = null


func _process(_delta: float) -> void:
	if is_instance_valid(_screen):
		_update()
	elif _screen != null:
		_screen = null
	# Duck under NetHack's windows and questions, and under a stinger.
	var duck := 0.0
	if is_instance_valid(_screen) and _screen.dialogs.active != null:
		duck = DUCK_DB
	if Time.get_ticks_msec() / 1000.0 < _stinger_until:
		duck = STINGER_DUCK_DB
	_duck_db = move_toward(_duck_db, duck, _delta * 20.0)
	var bus := AudioServer.get_bus_index("Music")
	var volume := settings.music_volume if settings else 0.6
	AudioServer.set_bus_volume_db(bus, linear_to_db(maxf(volume, 0.0001)) + _duck_db)
	AudioServer.set_bus_mute(bus, volume <= 0.0)


func _update() -> void:
	var state := _screen.state
	if state.ending or state.ended:
		return
	if _branches_seen.is_empty() and state.map.dungeon != "":
		_branches_seen[state.map.dungeon] = true
	var now := Time.get_ticks_msec() / 1000.0
	if _hostile_near(state):
		_last_hostile = now
	tense = now - _last_hostile < CALM_AFTER
	play(track_for(state.map, state.character, tense))


## The music for where the hero is: tense when hostiles are close, else the
## announced room's theme, else the level's or the branch's.
static func track_for(map: MapModel, character: Dictionary, p_tense: bool) -> String:
	var level := map.level
	var depths := map.depth >= 13
	var area := "dungeon"
	var tense_area := "depths-tense" if depths else "dungeon-tense"
	match map.dungeon.trim_prefix("The "):
		"Gnomish Mines":
			area = "minetown" if level.begins_with("minetn") else "mines-calm"
			tense_area = "mines-tense"
		"Sokoban":
			area = "sokoban"
		"Quest":
			area = "quest-" + str(QUEST_ROLES.get(str(character.get("role", "")), "val"))
		"Fort Ludios":
			area = "ludios"
			tense_area = "depths-tense"
		"Gehennom":
			area = "wizard-tower" if map.wizard_tower else "gehennom-calm"
			tense_area = "gehennom-tense"
		"Vlad's Tower":
			area = "vlad"
			tense_area = "gehennom-tense"
		"Elemental Planes":
			area = "astral" if level == "astral" else "planes"
			tense_area = "gehennom-tense"
		_:
			if level.begins_with("oracle"):
				area = "oracle"
			elif level.begins_with("bigrm"):
				area = "bigroom"
			elif level.begins_with("medusa"):
				area = "medusa"
			elif level.begins_with("castle"):
				area = "castle"
			else:
				area = "depths-calm" if depths else "dungeon-calm"
	if p_tense:
		return tense_area
	if map.room != "":
		return map.room
	return area


func _hostile_near(state: GameState) -> bool:
	var map := state.map
	for pos: Vector2i in map.actors().values():
		if not map.is_visible(pos) or maxi(absi(pos.x - map.hero.x), absi(pos.y - map.hero.y)) > TENSE_RANGE:
			continue
		var cell := map.cell(pos)
		if int(cell.get("glyphFlags", 0)) & 0x10:
			continue  # a pet
		var public: Variant = cell.get("creaturePublic")
		if public is Dictionary and str((public as Dictionary).get("attitude", "")) == "peaceful":
			continue
		return true
	return false


func _on_message(entry: Dictionary) -> void:
	var text := str(entry.get("text", ""))
	for rule in _rules:
		if (rule[0] as RegEx).search(text):
			sting(rule[1])
	if text.begins_with("You begin praying"):
		_praying = 12
	elif _praying > 0:
		_praying -= 1
		if _prayer_answered.search(text):
			_praying = 0
			sting("sting-prayer")


func _on_level(_depth: int) -> void:
	var branch := _screen.state.map.dungeon if is_instance_valid(_screen) else ""
	if branch == "" or _branches_seen.has(branch):
		return
	# The first level of the run is no new branch.
	var first := _branches_seen.is_empty()
	_branches_seen[branch] = true
	if not first:
		sting("sting-branch")


func _on_inventory() -> void:
	if not is_instance_valid(_screen):
		return
	var known := _inventory_known
	_inventory_known = true
	for item in _screen.state.inventory:
		var id := str(item.get("objectId", ""))
		if _artifacts_seen.has(id):
			continue
		var text := str(item.get("text", ""))
		for artifact in ARTIFACTS:
			if text.contains(artifact):
				_artifacts_seen[id] = true
				if known:
					sting("sting-artifact")
				return


func _resolve(id: String) -> String:
	if id == "" or library.has(id):
		return id
	# Not generated yet: the area's music, then the dungeon's.
	for fallback in [id.trim_suffix("-tense") + "-calm" if id.ends_with("-tense") else "", "dungeon-calm"]:
		if fallback != "" and library.has(fallback):
			return fallback
	return ""


## A take of a track, a different one each time when it has several.
func _pick(id: String) -> String:
	var takes: Array = library.get(id, [])
	if takes.is_empty():
		return ""
	var next := (int(_take.get(id, randi() % takes.size())) + 1) % takes.size()
	_take[id] = next
	return "res://assets/music/" + str(takes[next])


func _start(player: AudioStreamPlayer, id: String, fade: float) -> void:
	var path := _pick(id)
	if path == "":
		return
	player.stream = load(path)
	player.set_meta("track", id)
	player.volume_db = -40.0
	player.play()
	_fade(player, 0.0, fade, false)


func _fade(player: AudioStreamPlayer, to_db: float, seconds: float, stop_after: bool) -> void:
	var previous: Variant = player.get_meta("fade", null)
	if previous is Tween and (previous as Tween).is_valid():
		(previous as Tween).kill()
	var tween := create_tween()
	player.set_meta("fade", tween)
	tween.tween_property(player, "volume_db", to_db, seconds)
	if stop_after:
		tween.tween_callback(player.stop)


## A take ended: another take of the same track follows.
func _on_finished(player: AudioStreamPlayer) -> void:
	if player == _players[_active] and str(player.get_meta("track", "")) == current and current != "":
		_start(player, current, 1.5)
