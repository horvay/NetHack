class_name EffectLayer
extends Node2D
## Light and motion that is not a map object: glowing beams and explosions
## NetHack draws during zaps, ambient glow for stairs, fountains, altars and
## lava, death puffs, and floating combat text. Drawn above the fog so magic
## and feedback always read clearly.

const TILE := 32

var state: GameState
var _glow_texture: Texture2D
var _spark_texture: Texture2D
var _ambient: Array[Dictionary] = []
var _beam_cells: Dictionary = {}
var _time := 0.0
var _font: Font


func _ready() -> void:
	_glow_texture = _make_radial(64, 1.0)
	_spark_texture = _make_radial(8, 2.5)
	_font = UiTheme.heading_font()


func _make_radial(size: int, power: float) -> Texture2D:
	var img := Image.create_empty(size, size, false, Image.FORMAT_RGBA8)
	var c := (size - 1) / 2.0
	for y in size:
		for x in size:
			var d := clampf(Vector2(x - c, y - c).length() / c, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, pow(1.0 - d, power)))
	return ImageTexture.create_from_image(img)


func set_ambient(glows: Array[Dictionary]) -> void:
	_ambient = glows
	queue_redraw()


## Called on every map change: NetHack draws zaps and explosions as map
## glyphs (cmap 74+), held on screen during delay_output.
func sync_beams() -> void:
	var cells := {}
	for i in state.map.cells.size():
		var cell: Variant = state.map.cells[i]
		if cell == null or not cell.has("cmapIndex") or cell.get("cmapIndex") == null:
			continue
		var cmap := int(cell["cmapIndex"])
		# 74-86 beams and shields, 96+ explosions; 87 is the cursor marker and
		# 88-95 are the swallow frame (drawn by WorldView's engulf view).
		if cmap >= 74 and cmap != 87 and not (cmap >= 88 and cmap <= 95):
			cells[i] = {"cmap": cmap, "color": int(cell.get("color", 7))}
	for i in cells:
		if not _beam_cells.has(i):
			_burst(Vector2i(i % MapModel.WIDTH, i / MapModel.WIDTH), nethack_color(cells[i].color), 6)
	_beam_cells = cells
	queue_redraw()


static func nethack_color(index: int) -> Color:
	var palette := [
		Color("1a1a1a"), Color("e04b3a"), Color("4caf50"), Color("a0703c"), Color("4f7cff"), Color("c050d0"),
		Color("38c0d0"), Color("c8c8c8"), Color("808080"), Color("ff8a3d"), Color("7cff6b"), Color("ffe25c"),
		Color("6aa2ff"), Color("ff6bf0"), Color("8ef7ff"), Color("ffffff"),
	]
	return palette[clampi(index, 0, 15)]


func _process(delta: float) -> void:
	_time += delta
	if not _ambient.is_empty() or not _beam_cells.is_empty():
		queue_redraw()


func _draw() -> void:
	for glow in _ambient:
		var pos: Vector2i = glow.pos
		if state and not state.map.is_explored(pos):
			continue
		var center := Vector2(pos * TILE) + Vector2(16, 16)
		var pulse := 0.5 + 0.5 * sin(_time * 2.0 + pos.x * 0.7 + pos.y)
		match str(glow.kind):
			"stairs":
				_glow(center, 26.0 + pulse * 4.0, Color(1.0, 0.85, 0.5, 0.20 + pulse * 0.08))
			"fountain":
				_glow(center, 30.0, Color(0.4, 0.75, 1.0, 0.22 + pulse * 0.08))
			"altar":
				_glow(center, 34.0, Color(1.0, 0.9, 0.6, 0.18 + pulse * 0.06))
			"lava":
				_glow(center, 44.0, Color(1.0, 0.45, 0.12, 0.28 + pulse * 0.1))
	for i in _beam_cells:
		var pos := Vector2i(i % MapModel.WIDTH, i / MapModel.WIDTH)
		var color := nethack_color(_beam_cells[i].color)
		var center := Vector2(pos * TILE) + Vector2(16, 16)
		_glow(center, 40.0, Color(color, 0.55))
		_glow(center, 14.0, Color(color.lightened(0.6), 0.95))


func _glow(center: Vector2, radius: float, color: Color) -> void:
	draw_texture_rect(_glow_texture, Rect2(center - Vector2(radius, radius), Vector2(radius, radius) * 2.0), false, color)


func _burst(cell: Vector2i, color: Color, count: int) -> void:
	var center := Vector2(cell * TILE) + Vector2(16, 16)
	if not Motion.enabled():
		return
	for i in count:
		var spark := Sprite2D.new()
		spark.texture = _spark_texture
		spark.modulate = color.lightened(0.3)
		spark.position = center
		var material := CanvasItemMaterial.new()
		material.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		spark.material = material
		add_child(spark)
		var dir := Vector2.from_angle(randf() * TAU) * randf_range(10.0, 26.0)
		var tween := spark.create_tween().set_parallel()
		tween.tween_property(spark, "position", center + dir, 0.35).set_ease(Tween.EASE_OUT)
		tween.tween_property(spark, "modulate:a", 0.0, 0.35)
		tween.chain().tween_callback(spark.queue_free)


## Dust puff where a creature vanished (died or left sight).
func puff(cell: Vector2i, texture: Texture2D) -> void:
	if not Motion.enabled():
		return
	var center := Vector2(cell * TILE) + Vector2(16, 14)
	if texture:
		var ghost := Sprite2D.new()
		ghost.texture = texture
		ghost.position = center
		ghost.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		add_child(ghost)
		var tween := ghost.create_tween().set_parallel()
		tween.tween_property(ghost, "position", center + Vector2(0, -10), 0.5)
		tween.tween_property(ghost, "modulate", Color(1, 0.4, 0.3, 0.0), 0.5)
		tween.chain().tween_callback(ghost.queue_free)
	for i in 8:
		var dust := Sprite2D.new()
		dust.texture = _spark_texture
		dust.modulate = Color(0.75, 0.7, 0.62, 0.8)
		dust.position = center + Vector2(randf_range(-6, 6), randf_range(4, 10))
		dust.scale = Vector2.ONE * randf_range(1.2, 2.2)
		add_child(dust)
		var drift := Vector2(randf_range(-14, 14), randf_range(-16, -4))
		var tween := dust.create_tween().set_parallel()
		tween.tween_property(dust, "position", dust.position + drift, 0.55).set_ease(Tween.EASE_OUT)
		tween.tween_property(dust, "modulate:a", 0.0, 0.55)
		tween.chain().tween_callback(dust.queue_free)


## Floating text rising from a cell (damage, healing, status).
func float_text(cell: Vector2i, text: String, color: Color, size := 15) -> void:
	var label := Label.new()
	label.text = text
	label.add_theme_font_override("font", UiTheme.bold_font())
	label.add_theme_font_size_override("font_size", size * 2)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", Color(0.02, 0.01, 0.02, 1.0))
	label.add_theme_constant_override("outline_size", 10)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.size = Vector2(160, 44)
	label.pivot_offset = Vector2(80, 22)
	label.position = Vector2(cell * TILE) + Vector2(16 - 80, -24)
	label.scale = Vector2(0.2, 0.2)
	add_child(label)
	var tween := label.create_tween()
	if not Motion.enabled():
		# Reduced motion: the number appears in place, holds, then goes.
		label.scale = Vector2.ONE * 0.5
		tween.tween_interval(1.1)
		tween.tween_callback(label.queue_free)
		return
	tween.set_parallel()
	tween.tween_property(label, "scale", Vector2.ONE * 0.5, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "position:y", label.position.y - 30, 1.1).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "modulate:a", 0.0, 0.45).set_delay(0.75)
	tween.chain().tween_callback(label.queue_free)
