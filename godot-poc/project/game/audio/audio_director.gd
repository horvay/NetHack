class_name AudioDirector
extends Node
## Plays the game: footsteps as the hero moves, blows and whiffs from combat
## messages, a wound when HP drops, coins and chimes for pickups, wood for
## doors, a descending rush between levels, level-up fanfares, magic for
## zaps, UI ticks for every button, under a low dungeon ambience.

const VOICES := 8

var screen: GameScreen
var bank := SoundBank.shared()
var _players: Array[AudioStreamPlayer] = []
var _next := 0
var _ambience: AudioStreamPlayer
var _drip_timer := 6.0
var _last_hp := -1
var _rules: Array = []
## How many times each sound played (tests and diagnostics).
var played: Dictionary = {}


func attach(game_screen: GameScreen) -> void:
	screen = game_screen
	name = "AudioDirector"
	screen.add_child(self)
	for i in VOICES:
		var player := AudioStreamPlayer.new()
		add_child(player)
		_players.append(player)
	_ambience = AudioStreamPlayer.new()
	_ambience.stream = bank.streams["ambience"]
	_ambience.volume_db = -14.0
	add_child(_ambience)
	_ambience.play()
	_rules = [
		[RegEx.create_from_string("(?i)^you (kill|destroy)|(dies|is killed|is destroyed)!?$"), "kill", -2.0],
		[RegEx.create_from_string("(?i)^you (hit|smite|bite|kick|strike|bash)"), "hit", -3.0],
		[RegEx.create_from_string("(?i)^you miss"), "miss", -4.0],
		[RegEx.create_from_string("(?i)\\b\\d+ gold pieces?\\b|^you (find|pick up) .*gold"), "gold", -4.0],
		[RegEx.create_from_string("^[a-zA-Z\\$] - "), "pickup", -5.0],
		[RegEx.create_from_string("(?i)door (opens|closes)|^wham+!|the door crashes open|you break open the lock"), "door", -3.0],
		[RegEx.create_from_string("(?i)welcome to experience level"), "sa2_xplevelup", -6.0],
		[RegEx.create_from_string("(?i)goodbye level|you feel more experienced"), "pickup", -8.0],
		[RegEx.create_from_string("(?i)squeak"), "se_squeak_C", -4.0],
	]
	screen.state.hero_moved.connect(func(from: Vector2i, _to: Vector2i) -> void:
		if from.x >= 0:
			play("step", -9.0, randf_range(0.85, 1.15)))
	screen.state.message_added.connect(_on_message)
	screen.state.status_changed.connect(_on_status)
	screen.state.level_changed.connect(func(_d: int) -> void: play("stairs", -4.0))
	screen.state.animation_ready.connect(_on_animation)
	get_tree().node_added.connect(_on_node_added)


## Nothing may still be playing when the app quits (the audio server would
## keep the stream alive past shutdown).
func _exit_tree() -> void:
	for player in _players:
		player.stop()
		player.stream = null
	if _ambience:
		_ambience.stop()
		_ambience.stream = null


func play(id: String, volume_db := 0.0, pitch := 1.0) -> void:
	if not bank.streams.has(id):
		return
	var interface := id.begins_with("ui_")
	if not interface and App.instance and not App.instance.settings.game_sounds:
		return
	played[id] = int(played.get(id, 0)) + 1
	var player := _players[_next]
	_next = (_next + 1) % _players.size()
	player.stream = bank.streams[id]
	player.volume_db = volume_db
	player.pitch_scale = pitch
	player.play()


func _on_message(entry: Dictionary) -> void:
	if entry.get("history", false):
		return
	var text := str(entry.text)
	for rule in _rules:
		if (rule[0] as RegEx).search(text):
			play(rule[1], rule[2], randf_range(0.92, 1.08))
			return


func _on_status() -> void:
	var hp := screen.state.status.hp()
	if _last_hp >= 0 and hp < _last_hp:
		play("hurt", -2.0, randf_range(0.9, 1.05))
	_last_hp = hp


## Beams and explosions get magic; flying objects a whoosh.
func _on_animation(frames: Array) -> void:
	var beam := false
	var thrown := false
	for frame in frames:
		for index in frame.cells:
			var event: Dictionary = frame.cells[index]
			var cmap: Variant = event.get("cmapIndex")
			if cmap != null and int(cmap) >= 74 and int(cmap) != 87:
				beam = true
			elif cmap == null and str(event.get("actorId", "")) == "" and str(event.get("semanticKind", "")) in ["object", "item"]:
				thrown = true
	if beam:
		play("zap", -4.0, randf_range(0.9, 1.1))
	elif thrown:
		play("miss", -6.0, randf_range(1.2, 1.4))


func _on_node_added(node: Node) -> void:
	# Interface sounds can be turned off on their own (Settings).
	if node is BaseButton:
		(node as BaseButton).pressed.connect(func() -> void:
			if _ui_sounds():
				play("ui_click", -6.0, randf_range(0.97, 1.03)))
	elif (node is ModalCard or node is InventoryScreen or node is EquipmentScreen) and _ui_sounds():
		play("ui_open", -6.0)


func _ui_sounds() -> bool:
	return App.instance == null or App.instance.settings.interface_sounds


func _process(delta: float) -> void:
	if _ambience and App.instance:
		_ambience.stream_paused = not App.instance.settings.game_sounds
	_drip_timer -= delta
	if _drip_timer <= 0.0:
		_drip_timer = randf_range(5.0, 14.0)
		play("drip", -18.0, randf_range(0.8, 1.25))
