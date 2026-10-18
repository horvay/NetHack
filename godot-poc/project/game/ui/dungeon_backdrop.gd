class_name DungeonBackdrop
extends Control
## Living background for menus: painted flagstones under flickering torch
## light, a slow camera drift, rising embers and a heavy vignette.

const SCALE := 3.0

var torches: Array[Vector2] = []
var tint := Color(1.0, 0.82, 0.62)
var _time := 0.0
var _glow: Texture2D
var _painter := TerrainPainter.shared()


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_glow = _radial()
	torches = [Vector2(0.18, 0.28), Vector2(0.82, 0.24), Vector2(0.62, 0.78), Vector2(0.3, 0.84)]
	var embers := CPUParticles2D.new()
	embers.amount = 70
	embers.lifetime = 7.0
	embers.preprocess = 7.0
	embers.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	embers.emission_rect_extents = Vector2(1100, 20)
	embers.position = Vector2(get_viewport_rect().size.x / 2.0, get_viewport_rect().size.y + 40.0)
	embers.direction = Vector2(0, -1)
	embers.spread = 18.0
	embers.gravity = Vector2(0, -6)
	embers.initial_velocity_min = 30.0
	embers.initial_velocity_max = 70.0
	embers.scale_amount_min = 1.5
	embers.scale_amount_max = 3.5
	embers.color = Color(1.0, 0.62, 0.25, 0.85)
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1.0, 0.7, 0.3, 0.0))
	ramp.add_point(0.15, Color(1.0, 0.6, 0.25, 0.9))
	ramp.set_color(1, Color(0.8, 0.2, 0.05, 0.0))
	embers.color_ramp = ramp
	var material := CanvasItemMaterial.new()
	material.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	embers.material = material
	add_child(embers)
	var vignette := ColorRect.new()
	vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader := ShaderMaterial.new()
	shader.shader = load("res://game/ui/backdrop_vignette.gdshader")
	vignette.material = shader
	add_child(vignette)


func _radial() -> Texture2D:
	var size := 128
	var img := Image.create_empty(size, size, false, Image.FORMAT_RGBA8)
	var c := (size - 1) / 2.0
	for y in size:
		for x in size:
			var d := clampf(Vector2(x - c, y - c).length() / c, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, pow(1.0 - d, 1.8)))
	return ImageTexture.create_from_image(img)


func _process(delta: float) -> void:
	_time += delta
	queue_redraw()


func _draw() -> void:
	var area := get_viewport_rect().size
	var tile := TerrainPainter.SIZE * SCALE
	var drift := Vector2(sin(_time * 0.05) * 40.0, _time * 6.0)
	var origin := Vector2(fposmod(-drift.x, tile) - tile, fposmod(-drift.y, tile) - tile)
	var cols := int(area.x / tile) + 3
	var rows := int(area.y / tile) + 3
	var base_cell := Vector2i(floori(drift.x / tile), floori(drift.y / tile))
	for row in rows:
		for col in cols:
			var cell := base_cell + Vector2i(col, row)
			var texture := TerrainPainter.pick(_painter.floors, cell)
			draw_texture_rect(texture, Rect2(origin + Vector2(col, row) * tile, Vector2(tile, tile)), false, Color(0.42, 0.40, 0.40))
	for i in torches.size():
		var at := torches[i] * area
		var flicker := 0.85 + 0.15 * sin(_time * (6.0 + i) + i * 1.7) * sin(_time * 2.3 + i)
		var radius := 520.0 * flicker
		draw_texture_rect(_glow, Rect2(at - Vector2(radius, radius), Vector2(radius, radius) * 2.0), false, Color(tint, 0.30 * flicker))
