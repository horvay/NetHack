class_name WorldView
extends Node2D
## The living dungeon: terrain, liquids, actors, fog of war and effects,
## followed by a smooth camera. Rebuilds at most once per frame, however many
## map events arrived.

signal cell_clicked(cell: Vector2i, button: int)
signal cell_hovered(cell: Vector2i)

const TILE := 32
const ZOOMS := [0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]

var state: GameState
var terrain: TerrainLayer
var liquids: Node2D
var glow: EffectLayer
var actors: ActorLayer
var fog: ColorRect
var symbols: SymbolLayer
## Overview only: a pulsing marker so the hero is found at a glance.
var beacon: Node2D
var effects: EffectLayer
## Normal-blend layer for floating combat text (effects is additive).
var floaters: EffectLayer
var camera: Camera2D
var hover_marker: Node2D
var reticle: Node2D
var compass: Node2D
var engulf: Sprite2D
var _engulf_time := 0.0

var _dirty := true
var _vision_image: Image
var _vision_texture: ImageTexture
var _zoom_index := 4
var _shake := 0.0
var _hovered := Vector2i(-1, -1)
var _overview := false


var _anim_serial := 0
var _anim_nodes: Array[Node] = []


func setup(game_state: GameState) -> void:
	state = game_state
	state.map_changed.connect(func() -> void: _dirty = true)
	state.animation_ready.connect(_play_animation)
	state.level_changed.connect(_on_level_changed)

	terrain = TerrainLayer.new()
	terrain.state = state
	add_child(terrain)

	liquids = Node2D.new()
	var liquid_material := ShaderMaterial.new()
	liquid_material.shader = load("res://game/world/liquid.gdshader")
	liquids.material = liquid_material
	liquids.draw.connect(_draw_liquids)
	add_child(liquids)

	glow = EffectLayer.new()
	glow.state = state
	var add_material := CanvasItemMaterial.new()
	add_material.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	glow.material = add_material
	add_child(glow)
	terrain.painted.connect(func() -> void:
		glow.set_ambient(terrain.glow_cells)
		liquids.queue_redraw())

	actors = ActorLayer.new()
	actors.state = state
	add_child(actors)

	_vision_image = Image.create_empty(MapModel.WIDTH, MapModel.HEIGHT, false, Image.FORMAT_RGB8)
	_vision_texture = ImageTexture.create_from_image(_vision_image)
	fog = ColorRect.new()
	fog.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fog.size = Vector2(MapModel.WIDTH * TILE, MapModel.HEIGHT * TILE)
	var fog_material := ShaderMaterial.new()
	fog_material.shader = load("res://game/world/fog.gdshader")
	fog_material.set_shader_parameter("vision_tex", _vision_texture)
	fog_material.set_shader_parameter("map_cells", Vector2(MapModel.WIDTH, MapModel.HEIGHT))
	fog.material = fog_material
	add_child(fog)
	var stairs := StairsBadges.new()
	stairs.terrain = terrain
	stairs.state = state
	add_child(stairs)
	symbols = SymbolLayer.new()
	symbols.state = state
	add_child(symbols)
	beacon = Node2D.new()
	beacon.visible = false
	beacon.z_index = 6
	beacon.draw.connect(_draw_beacon)
	add_child(beacon)

	hover_marker = Node2D.new()
	hover_marker.draw.connect(_draw_hover)
	add_child(hover_marker)
	reticle = Node2D.new()
	reticle.draw.connect(_draw_reticle)
	reticle.visible = false
	add_child(reticle)
	compass = Node2D.new()
	compass.draw.connect(_draw_compass)
	compass.visible = false
	add_child(compass)
	state.request_changed.connect(func(request: Dictionary) -> void:
		reticle.visible = str(request.get("kind", "")) == "map_target"
		reticle.queue_redraw()
		compass.visible = str(request.get("kind", "")) == "direction"
		compass.queue_redraw())
	state.cursor_moved.connect(func(cell: Vector2i) -> void:
		if reticle.visible:
			reticle.queue_redraw()
			camera.position = _clamped_camera_target(Vector2(cell * TILE)))

	effects = EffectLayer.new()
	effects.state = state
	var beam_material := CanvasItemMaterial.new()
	beam_material.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	effects.material = beam_material
	add_child(effects)
	floaters = EffectLayer.new()
	floaters.state = state
	add_child(floaters)
	actors.actor_vanished.connect(func(_id: String, cell: Vector2i, texture: Texture2D, was_visible: bool) -> void:
		if was_visible:
			effects.puff(cell, texture))

	engulf = Sprite2D.new()
	engulf.visible = false
	engulf.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	add_child(engulf)

	camera = Camera2D.new()
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 7.0
	add_child(camera)
	camera.make_current()
	if App.instance:
		_zoom_index = clampi(App.instance.settings.default_zoom, 0, ZOOMS.size() - 1)
	_apply_zoom(false)
	apply_settings()


func _process(delta: float) -> void:
	if state == null:
		return
	if _dirty:
		_dirty = false
		_rebuild()
	var hero := actors.hero_node()
	if hero:
		var hero_cell := hero.position / TILE - Vector2(0.5, 0.5)
		(fog.material as ShaderMaterial).set_shader_parameter("hero_cell", hero_cell)
		if not _overview and not reticle.visible:
			# The message feed and action bar weigh on the bottom of the
			# screen: keep the hero a little above centre.
			camera.position = hero.position + Vector2(0, 46.0 / camera.zoom.y)
		if beacon.visible:
			beacon.position = hero.position
			beacon.queue_redraw()
	(fog.material as ShaderMaterial).set_shader_parameter("blind", 1.0 if state.map.blind else 0.0)
	if engulf.visible:
		_engulf_time += delta
		var pulse := 3.4 + sin(_engulf_time * 3.0) * 0.18
		engulf.scale = Vector2(pulse, pulse)
	if _shake > 0.0:
		_shake = maxf(0.0, _shake - delta * 3.5)
		camera.offset = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * _shake * 6.0
	else:
		camera.offset = Vector2.ZERO


func _rebuild() -> void:
	terrain.refresh()
	actors.sync()
	effects.sync_beams()
	_update_vision()
	_sync_engulf()


## Swallowed: NetHack draws the engulfer as a frame of special glyphs
## around the hero; show the creature itself closing around them.
func _sync_engulf() -> void:
	var hero := state.map.hero
	var engulfer := ""
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			var c := state.map.cell(hero + Vector2i(dx, dy))
			var cmap := int(c.get("cmapIndex", -1)) if c.has("cmapIndex") and c.get("cmapIndex") != null else -1
			if (cmap >= 88 and cmap <= 95) or str(c.get("semanticKind", "")) == "engulfment":
				var id := TileResolver.shared().asset_for_semantic_name(c.get("semanticName", ""), "monster")
				if id != "":
					engulfer = id
				elif engulfer == "":
					engulfer = "?"
	var swallowed := engulfer != "" and hero.x >= 0
	engulf.visible = swallowed
	if swallowed:
		engulf.texture = TileResolver.shared().texture(engulfer) if engulfer != "?" else null
		engulf.position = Vector2(hero * TILE) + Vector2(TILE, TILE) * 0.5
		engulf.modulate = Color(1.0, 0.75, 0.75, 0.82)


func _update_vision() -> void:
	var count := MapModel.WIDTH * MapModel.HEIGHT
	var bytes := PackedByteArray()
	bytes.resize(count * 3)
	var vision := state.map.vision
	for i in count:
		var v := vision[i]
		var cell: Variant = state.map.cells[i]
		var explored := cell != null and (str(cell.get("char", " ")) != " " or str(cell.get("semanticKind", "")) not in ["", "unexplored", "nothing"])
		bytes[i * 3] = 255 if v & MapModel.VISION_SEEN else 0
		bytes[i * 3 + 1] = 255 if v & MapModel.VISION_LIT else 0
		bytes[i * 3 + 2] = 255 if explored or v & MapModel.VISION_SEEN else 0
	_vision_image.set_data(MapModel.WIDTH, MapModel.HEIGHT, false, Image.FORMAT_RGB8, bytes)
	_vision_texture.update(_vision_image)


func _draw_liquids() -> void:
	for pos in terrain.liquid_cells:
		var lava := terrain.kind_at(pos) == Terrain.Kind.LAVA
		liquids.draw_rect(Rect2(pos * TILE, Vector2(TILE, TILE)), Color(1.0 if lava else 0.0, 0, 0))


func _clamped_camera_target(target: Vector2) -> Vector2:
	var view := get_viewport_rect().size / camera.zoom
	var map_size := Vector2(MapModel.WIDTH, MapModel.HEIGHT) * TILE
	var result := target
	for axis in 2:
		if view[axis] >= map_size[axis]:
			result[axis] = map_size[axis] / 2.0
		else:
			result[axis] = clampf(target[axis], view[axis] / 2.0 - TILE, map_size[axis] - view[axis] / 2.0 + TILE)
	return result


func _on_level_changed(_depth: int) -> void:
	# Fresh level: snap the camera instead of panning across the old map.
	var hero := actors.hero_node()
	if hero:
		camera.reset_smoothing()


## Live display settings: symbols overlay and high contrast.
func apply_settings() -> void:
	var settings := App.instance.settings if App.instance else null
	if settings == null:
		return
	camera.position_smoothing_enabled = not settings.reduced_motion
	symbols.enabled = settings.ascii_overlay
	var fog_material := fog.material as ShaderMaterial
	fog_material.set_shader_parameter("memory_brightness", 0.72 if settings.high_contrast else 0.56)
	fog_material.set_shader_parameter("torch_radius", 5.5 if settings.high_contrast else 3.6)
	terrain.high_contrast = settings.high_contrast
	terrain.refresh()


func shake(strength := 1.0) -> void:
	if App.instance and (not App.instance.settings.screen_shake or App.instance.settings.reduced_motion):
		return
	_shake = maxf(_shake, strength)


func set_zoom_index(index: int) -> void:
	_zoom_index = clampi(index, 0, ZOOMS.size() - 1)
	if not _overview:
		_apply_zoom(true)


func zoom_in() -> void:
	_zoom_index = mini(_zoom_index + 1, ZOOMS.size() - 1)
	_apply_zoom(true)


func zoom_out() -> void:
	_zoom_index = maxi(_zoom_index - 1, 0)
	_apply_zoom(true)


func toggle_overview() -> void:
	_overview = not _overview
	beacon.visible = _overview
	if _overview:
		# Fit what the hero has explored (plus a margin), not the whole
		# 80x21 grid, and never zoom in further than the normal view.
		var bounds := explored_bounds().grow(2)
		var view := get_viewport_rect().size - Vector2(0, 260)
		var fit := minf(view.x / (bounds.size.x * TILE), view.y / (bounds.size.y * TILE))
		fit = minf(fit, float(ZOOMS[_zoom_index]))
		var center := (Vector2(bounds.position) + Vector2(bounds.size) / 2.0) * TILE + Vector2(0, 40.0 / fit)
		if not Motion.enabled():
			camera.zoom = Vector2(fit, fit)
			camera.position = center
			return
		var tween := create_tween().set_parallel()
		tween.tween_property(camera, "zoom", Vector2(fit, fit), 0.35).set_trans(Tween.TRANS_CUBIC)
		tween.tween_property(camera, "position", center, 0.35).set_trans(Tween.TRANS_CUBIC)
	else:
		_apply_zoom(true)


## The explored part of the level, in cells (the hero's cell at least).
func explored_bounds() -> Rect2i:
	var bounds := Rect2i(state.map.hero, Vector2i.ONE)
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			if state.map.is_explored(Vector2i(x, y)):
				bounds = bounds.expand(Vector2i(x, y)).expand(Vector2i(x + 1, y + 1))
	return bounds


func _draw_beacon() -> void:
	var scale := 1.0 / maxf(camera.zoom.x, 0.05)
	var t := fmod(Time.get_ticks_msec() / 1000.0, 1.4) / 1.4
	var radius := (10.0 + 26.0 * t) * scale
	beacon.draw_arc(Vector2.ZERO, radius, 0.0, TAU, 48, Color(1.0, 0.85, 0.4, 1.0 - t), 3.0 * scale)
	beacon.draw_circle(Vector2.ZERO, 6.0 * scale, Color(1.0, 0.85, 0.4, 0.9))


func is_overview() -> bool:
	return _overview


func _apply_zoom(animated: bool) -> void:
	var z: float = ZOOMS[_zoom_index]
	if animated and Motion.enabled():
		create_tween().tween_property(camera, "zoom", Vector2(z, z), 0.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	else:
		camera.zoom = Vector2(z, z)


func cell_at_screen(screen_position: Vector2) -> Vector2i:
	var world := get_canvas_transform().affine_inverse() * screen_position
	return Vector2i(floori(world.x / TILE), floori(world.y / TILE))


func screen_of_cell(cell: Vector2i) -> Vector2:
	return get_canvas_transform() * (Vector2(cell * TILE) + Vector2(TILE, TILE) * 0.5)


func set_hovered(cell: Vector2i) -> void:
	if cell == _hovered:
		return
	_hovered = cell
	hover_marker.queue_redraw()


func _draw_hover() -> void:
	if not MapModel.in_bounds(_hovered) or not state.map.is_explored(_hovered):
		return
	var rect := Rect2(_hovered * TILE, Vector2(TILE, TILE))
	hover_marker.draw_rect(rect.grow(-1), Color(UiTheme.GOLD, 0.10))
	hover_marker.draw_rect(rect.grow(-1), Color(UiTheme.GOLD, 0.75), false, 1.0)


## Animated brackets around NetHack's cursor while it asks for a position.
func _draw_reticle() -> void:
	var cell := state.cursor
	if not MapModel.in_bounds(cell):
		return
	var rect := Rect2(cell * TILE, Vector2(TILE, TILE)).grow(3)
	var color := Color(UiTheme.GOLD, 0.95)
	var arm := 9.0
	for corner in [rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)]:
		var sx := 1.0 if corner.x == rect.position.x else -1.0
		var sy := 1.0 if corner.y == rect.position.y else -1.0
		reticle.draw_line(corner, corner + Vector2(arm * sx, 0), color, 2.0)
		reticle.draw_line(corner, corner + Vector2(0, arm * sy), color, 2.0)
	reticle.draw_rect(rect.grow(-3), Color(UiTheme.GOLD, 0.12))


# --- NetHack's animation beats ------------------------------------------------------
# NetHack draws a thrown object's flight, a beam's path, an explosion or a
# multi-step walk as glyphs separated by delay_output beats, then restores
# the map. The whole sequence arrives in one frame; GameState records the
# beats and this replays them. The final state is already on screen, so a
# key press simply cuts the replay short.

const BEAT := 0.045


func skip_animation() -> void:
	_anim_serial += 1
	_clear_anim_nodes()
	_release_landings()
	actors.finish_path()


func _clear_anim_nodes() -> void:
	for node in _anim_nodes:
		if is_instance_valid(node):
			node.queue_free()
	_anim_nodes.clear()


func _play_animation(frames: Array) -> void:
	# Reduced motion: no replay; the settled map already shows the outcome.
	if not Motion.enabled():
		return
	_anim_serial += 1
	var serial := _anim_serial
	_clear_anim_nodes()
	# The hero's path through the beats (travel, running).
	var path: Array[Vector2i] = []
	for frame in frames:
		var at: Vector2i = frame.hero
		if at.x >= 0 and (path.is_empty() or path[-1] != at):
			path.append(at)
	if path.size() > 1:
		actors.walk_path("hero", path, BEAT * 1.6)
	_hold_back_landings(frames)
	# Cells that show something transient: different from the settled map.
	var shown := {}
	var any_transient := false
	for frame in frames:
		for index in frame.cells:
			var event: Dictionary = frame.cells[index]
			var settled: Variant = state.map.cells[index]
			var same := settled != null and int(settled.get("glyph", -1)) == int(event.get("glyph", -2))
			if same or str(event.get("actorId", "")) != "":
				shown.erase(index)
			else:
				shown[index] = event
				any_transient = true
		if not any_transient:
			continue
		_draw_beat(shown)
		await get_tree().create_timer(BEAT * (2.0 if _is_explosion(shown) else 1.0)).timeout
		if serial != _anim_serial:
			_release_landings()
			return
	_clear_anim_nodes()
	_release_landings()


## A thrown or fired object is already in its landing cell on the settled
## map: keep it out of sight there until the replayed flight arrives.
func _hold_back_landings(frames: Array) -> void:
	var last := {}
	for frame in frames:
		for index in frame.cells:
			var event: Dictionary = frame.cells[index]
			if str(event.get("semanticKind", "")) == "object" and str(event.get("actorId", "")) == "":
				last[int(event.get("glyph", -1))] = Vector2i(index % MapModel.WIDTH, index / MapModel.WIDTH)
	for glyph in last:
		var at: Vector2i = last[glyph]
		for dy in [-1, 0, 1]:
			for dx in [-1, 0, 1]:
				var cell: Vector2i = at + Vector2i(dx, dy)
				if int(state.map.cell(cell).get("glyph", -2)) == glyph:
					terrain.held_back[cell] = true
	if not terrain.held_back.is_empty():
		terrain.refresh()


func _release_landings() -> void:
	if not terrain.held_back.is_empty():
		terrain.held_back.clear()
		terrain.refresh()


func _is_explosion(shown: Dictionary) -> bool:
	for index in shown:
		var cmap: Variant = shown[index].get("cmapIndex")
		if cmap != null and int(cmap) >= 96:
			return true
	return false


func _draw_beat(shown: Dictionary) -> void:
	_clear_anim_nodes()
	var resolver := TileResolver.shared()
	for index in shown:
		var event: Dictionary = shown[index]
		var cell := Vector2i(index % MapModel.WIDTH, index / MapModel.WIDTH)
		var center := Vector2(cell * TILE) + Vector2(TILE, TILE) * 0.5
		var cmap := int(event.get("cmapIndex", -1)) if event.get("cmapIndex") != null else -1
		var color := EffectLayer.nethack_color(int(event.get("color", 7)))
		if cmap >= 74 and cmap <= 86 or cmap >= 96:
			var streak := Line2D.new()
			streak.width = 7.0 if cmap < 96 else 0.0
			streak.default_color = color.lightened(0.35)
			var dir := Vector2.ZERO
			match cmap:
				74: dir = Vector2(0, 1)
				75: dir = Vector2(1, 0)
				76: dir = Vector2(1, 1)
				77: dir = Vector2(1, -1)
			if dir != Vector2.ZERO:
				streak.points = PackedVector2Array([center - dir * TILE * 0.55, center + dir * TILE * 0.55])
				var add := CanvasItemMaterial.new()
				add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
				streak.material = add
				floaters.add_child(streak)
				_anim_nodes.append(streak)
			var glow := Sprite2D.new()
			glow.texture = effects._glow_texture
			glow.position = center
			var size := 1.6 if cmap >= 96 else 1.0
			glow.scale = Vector2.ONE * size
			glow.modulate = Color(color.lightened(0.2), 0.9)
			var add_glow := CanvasItemMaterial.new()
			add_glow.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
			glow.material = add_glow
			floaters.add_child(glow)
			_anim_nodes.append(glow)
			continue
		# A flying object (or anything else NetHack flashes): its own art.
		var id := resolver.asset_for_cell(event, state.character)
		var tex := resolver.texture(id)
		if tex == null:
			continue
		var sprite := Sprite2D.new()
		sprite.texture = tex
		sprite.position = center
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		sprite.rotation = randf_range(-0.6, 0.6)
		floaters.add_child(sprite)
		_anim_nodes.append(sprite)
		var trail := Sprite2D.new()
		trail.texture = effects._glow_texture
		trail.position = center
		trail.scale = Vector2(0.6, 0.6)
		trail.modulate = Color(1, 0.95, 0.8, 0.35)
		var add_trail := CanvasItemMaterial.new()
		add_trail.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		trail.material = add_trail
		floaters.add_child(trail)
		_anim_nodes.append(trail)


## Direction prompts: a chevron in each of the 8 directions around the hero
## (or only those NetHack lists),
## brighter where something is (a creature, a door), plus the hover cell.
func _draw_compass() -> void:
	var hero := state.map.hero
	if hero.x < 0:
		return
	var center := Vector2(hero * TILE) + Vector2(TILE, TILE) * 0.5
	var query := str(state.request.get("query", ""))
	for dir in GameState.DIRECTION_ORDER:
		# Only the directions NetHack offers, when it lists them ([>]).
		if not state.offers_direction(query, state.direction_key(dir)):
			continue
		var cell: Vector2i = hero + dir
		var c := state.map.cell(cell)
		var interesting: bool = str(c.get("actorId", "")) != "" or Terrain.classify(c).kind in [Terrain.Kind.DOOR_CLOSED, Terrain.Kind.DOOR_OPEN]
		var tip := center + Vector2(dir) * TILE * 0.95
		var normal := Vector2(dir).normalized()
		var side := Vector2(-normal.y, normal.x) * 6.0
		var color := Color(UiTheme.GOLD, 0.95 if interesting else 0.55)
		compass.draw_colored_polygon(PackedVector2Array([tip + normal * 6.0, tip - side, tip + side]), color)
		if interesting:
			compass.draw_rect(Rect2(cell * TILE, Vector2(TILE, TILE)).grow(-1), Color(UiTheme.GOLD, 0.6), false, 1.5)
	compass.draw_arc(center, TILE * 0.62, 0, TAU, 32, Color(UiTheme.GOLD, 0.35), 1.0)
