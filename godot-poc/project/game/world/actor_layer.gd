class_name ActorLayer
extends Node2D
## The hero and monsters as animated sprites. Actors are tracked by the
## bridge's stable actorId ("hero", "monster-<m_id>"), so a monster that
## moves glides to its new cell instead of popping, faces where it walks,
## and fades out when it dies or leaves sight.

signal actor_vanished(actor_id: String, cell: Vector2i, texture: Texture2D, was_visible: bool)

const TILE := 32
const MOVE_TIME := 0.13
const PET_RING := Color(0.35, 0.95, 0.55, 0.55)
const PEACEFUL_RING := Color(0.45, 0.7, 1.0, 0.45)
const INVISIBLE_HERO_ALPHA := 0.4

var state: GameState
var resolver := TileResolver.shared()
## actor_id -> {node: Node2D, sprite: Sprite2D, cell: Vector2i, asset: String}
var actors: Dictionary = {}
var _shadow_texture: Texture2D
var _ring_texture: Texture2D
## Pets get a solid double ring, peacefuls a dashed one: told apart by shape,
## not only by green versus blue.
var _pet_ring_texture: Texture2D
var _peaceful_ring_texture: Texture2D
var _time := 0.0


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_shadow_texture = _make_ellipse(Color(0, 0, 0, 0.45), 1.0)
	_ring_texture = _make_ellipse(Color(1, 1, 1, 1), 0.0)
	_pet_ring_texture = _make_ellipse(Color(1, 1, 1, 1), 0.0, false, true)
	_peaceful_ring_texture = _make_ellipse(Color(1, 1, 1, 1), 0.0, true)


func _make_ellipse(color: Color, fill: float, dashed := false, double := false) -> Texture2D:
	var img := Image.create_empty(32, 12, false, Image.FORMAT_RGBA8)
	for y in 12:
		for x in 32:
			var offset := Vector2((x - 15.5) / 15.5, (y - 5.5) / 5.5)
			var d := offset.length()
			var a := 0.0
			if fill > 0.0:
				a = clampf(1.0 - d, 0.0, 1.0)
			else:
				a = clampf(1.0 - absf(d - 0.85) * 6.0, 0.0, 1.0)
				if double:
					a = maxf(a, clampf(1.0 - absf(d - 0.55) * 7.0, 0.0, 1.0) * 0.8)
				if dashed and int(floor((offset.angle() + PI) / (TAU / 12.0))) % 2 == 1:
					a = 0.0
			img.set_pixel(x, y, Color(color.r, color.g, color.b, color.a * a))
	return ImageTexture.create_from_image(img)


static func cell_center(cell: Vector2i) -> Vector2:
	return Vector2(cell * TILE) + Vector2(TILE, TILE) * 0.5


func hero_node() -> Node2D:
	return actors.get("hero", {}).get("node", null)


func actor_at(cell: Vector2i) -> Dictionary:
	for id in actors:
		if actors[id].cell == cell:
			return actors[id]
	return {}


## Reconciles sprites with the map: spawn, move, retexture or remove.
func sync() -> void:
	if state == null:
		return
	var present := state.map.actors()
	if state.map.hero.x >= 0:
		present["hero"] = state.map.hero
	for id in actors.keys():
		if not present.has(id):
			_remove(id)
	for id in present:
		var cell: Vector2i = present[id]
		var map_cell := state.map.cell(cell)
		var asset := ""
		if id == "hero":
			asset = resolver.player_avatar_id(state.character)
			if map_cell.get("actorId") == "hero":
				var form := resolver.hero_form_asset(map_cell)
				if form != "":
					asset = form  # polymorphed hero
		else:
			asset = resolver.asset_for_cell(map_cell, state.character)
		if actors.has(id):
			_update(id, cell, asset, map_cell)
		else:
			_spawn(id, cell, asset, map_cell)


func _spawn(id: String, cell: Vector2i, asset: String, map_cell: Dictionary) -> void:
	var node := Node2D.new()
	node.position = cell_center(cell)
	add_child(node)
	var ring := Sprite2D.new()
	ring.texture = _ring_texture
	ring.position = Vector2(0, 11)
	ring.visible = false
	node.add_child(ring)
	var shadow := Sprite2D.new()
	shadow.texture = _shadow_texture
	shadow.position = Vector2(0, 12)
	shadow.scale = Vector2(0.8, 0.8)
	node.add_child(shadow)
	var sprite := Sprite2D.new()
	sprite.position = Vector2(0, -2)
	node.add_child(sprite)
	var entry := {"node": node, "sprite": sprite, "ring": ring, "cell": cell, "asset": "", "phase": randf() * TAU}
	actors[id] = entry
	_apply_look(entry, asset, map_cell)
	node.modulate.a = 0.0
	node.scale = Vector2(0.7, 0.7) if Motion.enabled() else Vector2.ONE
	var tween := node.create_tween().set_parallel()
	tween.tween_property(node, "modulate:a", 1.0, 0.18)
	tween.tween_property(node, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _update(id: String, cell: Vector2i, asset: String, map_cell: Dictionary) -> void:
	var entry: Dictionary = actors[id]
	_apply_look(entry, asset, map_cell)
	if entry.cell == cell:
		return
	var from: Vector2i = entry.cell
	entry.cell = cell
	var walking: Tween = _path_tweens.get(id)
	if walking and walking.is_valid() and walking.is_running():
		return  # a replayed walk is already carrying the actor there
	var node: Node2D = entry.node
	var delta := cell - from
	if delta.x != 0:
		(entry.sprite as Sprite2D).flip_h = delta.x < 0
	var target := cell_center(cell)
	if not Motion.enabled():
		# Reduced motion: no slide, no blink; just be there.
		if entry.has("move_tween") and entry.move_tween and (entry.move_tween as Tween).is_valid():
			(entry.move_tween as Tween).kill()
		node.position = target
		return
	if absi(delta.x) > 2 or absi(delta.y) > 2:
		# Teleport or level-scale jump: blink instead of sliding across the map.
		var blink := node.create_tween()
		blink.tween_property(node, "modulate:a", 0.0, 0.08)
		blink.tween_callback(func() -> void: node.position = target)
		blink.tween_property(node, "modulate:a", 1.0, 0.12)
		return
	if entry.has("move_tween") and entry.move_tween and (entry.move_tween as Tween).is_valid():
		(entry.move_tween as Tween).kill()
	var tween := node.create_tween()
	tween.tween_property(node, "position", target, MOVE_TIME).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	entry.move_tween = tween
	entry.hop = 1.0


func _apply_look(entry: Dictionary, asset: String, map_cell: Dictionary) -> void:
	if asset != entry.asset:
		entry.asset = asset
		var sprite: Sprite2D = entry.sprite
		sprite.texture = resolver.texture(asset)
		# Painted art (hero avatars) is larger than a tile: draw it smoothly at
		# tile size; pixel art stays crisp at 1:1.
		var smooth: bool = resolver.assets.get(asset, {}).get("smooth", false)
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR if smooth else CanvasItem.TEXTURE_FILTER_NEAREST
		var width := float(sprite.texture.get_width()) if sprite.texture else float(TILE)
		var fit := (TILE + 4.0) / width if smooth else 1.0
		sprite.set_meta("fit", fit)
	var flags := int(map_cell.get("glyphFlags", 0))
	var ring: Sprite2D = entry.ring
	var attitude := str((map_cell.get("creaturePublic", {}) as Dictionary).get("attitude", "")) if map_cell.get("creaturePublic") is Dictionary else ""
	if flags & 0x10:
		ring.visible = true
		ring.texture = _pet_ring_texture
		ring.modulate = PET_RING
	elif attitude == "peaceful":
		ring.visible = true
		ring.texture = _peaceful_ring_texture
		ring.modulate = PEACEFUL_RING
	else:
		ring.visible = false
	# Invisible-but-sensed or detected monsters render ghostly; an invisible
	# hero too, shimmering (see _process).
	entry.invisible = map_cell.get("heroInvisible", false) == true
	(entry.sprite as Sprite2D).modulate.a = INVISIBLE_HERO_ALPHA if entry.invisible else (0.55 if flags & (0x04 | 0x08) else 1.0)


func _remove(id: String) -> void:
	var entry: Dictionary = actors[id]
	actors.erase(id)
	var node: Node2D = entry.node
	var visible_now := state.map.is_visible(entry.cell)
	actor_vanished.emit(id, entry.cell, (entry.sprite as Sprite2D).texture, visible_now)
	if not Motion.enabled():
		node.queue_free()
		return
	var tween := node.create_tween().set_parallel()
	tween.tween_property(node, "modulate:a", 0.0, 0.2)
	tween.tween_property(node, "scale", Vector2(1.15, 0.6), 0.2)
	tween.chain().tween_callback(node.queue_free)


func flash(cell: Vector2i, color := Color(1.0, 0.35, 0.3)) -> void:
	var entry := actor_at(cell)
	if entry.is_empty():
		return
	var sprite: Sprite2D = entry.sprite
	var tween := sprite.create_tween()
	sprite.self_modulate = color * 2.2
	tween.tween_property(sprite, "self_modulate", Color.WHITE, 0.25)


## Lunges an actor toward a cell and back (melee attack).
func lunge(actor_id: String, toward: Vector2i) -> void:
	var entry: Dictionary = actors.get(actor_id, {})
	if entry.is_empty() or not Motion.enabled():
		return
	var sprite: Sprite2D = entry.sprite
	var dir := Vector2(toward - (entry.cell as Vector2i)).normalized()
	sprite.set_meta("lunging", true)
	var tween := sprite.create_tween()
	tween.tween_property(sprite, "position", Vector2(0, -2) + dir * 9.0, 0.07).set_ease(Tween.EASE_OUT)
	tween.tween_property(sprite, "position", Vector2(0, -2), 0.12).set_trans(Tween.TRANS_SINE)
	tween.tween_callback(func() -> void: sprite.remove_meta("lunging"))


func _process(delta: float) -> void:
	_time += delta
	for id in actors:
		var entry: Dictionary = actors[id]
		var sprite: Sprite2D = entry.sprite
		var hop: float = entry.get("hop", 0.0)
		if hop > 0.0:
			hop = maxf(0.0, hop - delta / MOVE_TIME)
			entry.hop = hop
		var moving := Motion.enabled()
		var bob := sin(_time * 2.4 + float(entry.phase)) * 0.6 if moving else 0.0
		var hop_offset := -sin((1.0 - hop) * PI) * 3.0 if hop > 0.0 and moving else 0.0
		if not sprite.has_meta("lunging"):
			sprite.position.y = -2.0 + bob + hop_offset
		if entry.get("invisible", false) and moving:
			sprite.modulate.a = INVISIBLE_HERO_ALPHA + 0.12 * sin(_time * 1.7)
		var fit: float = sprite.get_meta("fit", 1.0)
		sprite.scale = Vector2(fit, fit * (1.0 + (0.02 * sin(_time * 2.4 + float(entry.phase)) if moving else 0.0)))


var _path_tweens: Dictionary = {}


## Walks an actor through cells (travel and running arrive as one batch).
func walk_path(actor_id: String, path: Array[Vector2i], step_time: float) -> void:
	var entry: Dictionary = actors.get(actor_id, {})
	if entry.is_empty() or path.size() < 2:
		return
	var node: Node2D = entry.node
	if entry.has("move_tween") and entry.move_tween and (entry.move_tween as Tween).is_valid():
		(entry.move_tween as Tween).kill()
	node.position = cell_center(path[0])
	var tween := node.create_tween()
	for i in range(1, path.size()):
		var delta := path[i] - path[i - 1]
		var sprite: Sprite2D = entry.sprite
		if delta.x != 0:
			tween.tween_callback(func() -> void: sprite.flip_h = delta.x < 0)
		tween.tween_property(node, "position", cell_center(path[i]), step_time)
	entry.move_tween = tween
	_path_tweens[actor_id] = tween


## Snaps every walking actor to where the game says it is.
func finish_path() -> void:
	for id in _path_tweens:
		var tween: Tween = _path_tweens[id]
		if tween and tween.is_valid():
			tween.kill()
		var entry: Dictionary = actors.get(id, {})
		if not entry.is_empty():
			(entry.node as Node2D).position = cell_center(entry.cell)
	_path_tweens.clear()
