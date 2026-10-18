class_name TerrainPainter
extends RefCounted
## Paints the dungeon's floors, corridors and walls as 32 px pixel art at
## startup, with variants per kind so no two rooms look tiled. Palette follows
## ASSET_GENERATION.md: slate floors, cool gray stone walls, warm highlights.

const SIZE := 32

const FLOOR := Color("5b5650")
const FLOOR_MORTAR := Color("3e3a35")
const MOSS := Color("46573f")
const CORRIDOR := Color("4b4237")
const PEBBLE := Color("6b5f51")
const WALL_TOP := Color("2b2e39")
const WALL_RIM := Color("8a8fa0")
const BRICK := Color("454b5c")
const BRICK_MORTAR := Color("17181e")
const BRICK_WARM := Color("8c7b62")

static var _shared: TerrainPainter

var floors: Array[Texture2D] = []
var corridors: Array[Texture2D] = []
var wall_tops: Array[Texture2D] = []
var wall_faces: Array[Texture2D] = []
## Staircases, painted so up and down read apart at a glance: up rises
## toward warm light, down drops into darkness.
var stairs_up: Texture2D
var stairs_down: Texture2D
## Edge overlays keyed "n"/"s"/"e"/"w".
var rims: Dictionary = {}
var shadows: Dictionary = {}
var _rng := RandomNumberGenerator.new()


static func shared() -> TerrainPainter:
	if _shared == null:
		_shared = TerrainPainter.new()
		_shared.paint_all()
	return _shared


func paint_all() -> void:
	_rng.seed = 0x5eed
	for i in 10:
		floors.append(_texture(_paint_floor(i)))
	for i in 6:
		corridors.append(_texture(_paint_corridor()))
	for i in 4:
		wall_tops.append(_texture(_paint_wall_top()))
	for i in 6:
		wall_faces.append(_texture(_paint_wall_face()))
	stairs_up = _texture(_paint_stairs(true))
	stairs_down = _texture(_paint_stairs(false))
	for side in ["n", "s", "e", "w"]:
		rims[side] = _texture(_paint_rim(side))
		shadows[side] = _texture(_paint_shadow(side))


## Stable per-cell variant choice.
static func pick(list: Array, pos: Vector2i) -> Texture2D:
	var h := hash(pos.x * 73856093 ^ pos.y * 19349663)
	return list[absi(h) % list.size()]


func _texture(image: Image) -> Texture2D:
	return ImageTexture.create_from_image(image)


func _image() -> Image:
	return Image.create_empty(SIZE, SIZE, false, Image.FORMAT_RGBA8)


func _jitter(color: Color, amount: float) -> Color:
	var j := _rng.randf_range(-amount, amount)
	return Color(clampf(color.r + j, 0, 1), clampf(color.g + j, 0, 1), clampf(color.b + j * 1.1, 0, 1), color.a)


# --- floors ----------------------------------------------------------------------

func _paint_floor(variant: int) -> Image:
	var img := _image()
	img.fill(FLOOR_MORTAR)
	var slabs: Array[Rect2i] = []
	match variant % 5:
		0, 1:
			slabs = [Rect2i(0, 0, 32, 32)]
		2:
			slabs = [Rect2i(0, 0, 32, 16), Rect2i(0, 16, 32, 16)]
		3:
			slabs = [Rect2i(0, 0, 16, 32), Rect2i(16, 0, 16, 32)]
		4:
			slabs = [Rect2i(0, 0, 20, 32), Rect2i(20, 0, 12, 32)]
	for slab in slabs:
		_paint_slab(img, slab)
	if _rng.randf() < 0.45:
		_paint_crack(img)
	for i in _rng.randi_range(0, 3):
		var p := Vector2i(_rng.randi_range(2, 29), _rng.randi_range(2, 29))
		img.set_pixelv(p, FLOOR.lightened(0.18))
	if _rng.randf() < 0.3:
		_paint_moss(img)
	if _rng.randf() < 0.25:
		_paint_stain(img)
	return img


func _paint_slab(img: Image, rect: Rect2i) -> void:
	var tone := _jitter(FLOOR, 0.025)
	var inner := Rect2i(rect.position, rect.size - Vector2i(1, 1))
	for y in range(inner.position.y, inner.end.y):
		for x in range(inner.position.x, inner.end.x):
			var c := _jitter(tone, 0.010)
			if y == inner.position.y or x == inner.position.x:
				c = c.lightened(0.05)
			elif y == inner.end.y - 1 or x == inner.end.x - 1:
				c = c.darkened(0.08)
			img.set_pixel(x, y, c)


func _paint_crack(img: Image) -> void:
	var p := Vector2i(_rng.randi_range(4, 27), _rng.randi_range(4, 27))
	for i in _rng.randi_range(5, 11):
		if p.x < 0 or p.y < 0 or p.x >= SIZE or p.y >= SIZE:
			break
		img.set_pixelv(p, FLOOR_MORTAR.lightened(0.05))
		p += Vector2i(_rng.randi_range(-1, 1), 1 if _rng.randf() < 0.6 else 0)


func _paint_moss(img: Image) -> void:
	var center := Vector2i([0, 15, 16, 31][_rng.randi_range(0, 3)], _rng.randi_range(3, 28))
	for i in _rng.randi_range(4, 9):
		var p := center + Vector2i(_rng.randi_range(-2, 2), _rng.randi_range(-2, 2))
		if p.x >= 0 and p.y >= 0 and p.x < SIZE and p.y < SIZE:
			img.set_pixelv(p, _jitter(MOSS, 0.04))


func _paint_stain(img: Image) -> void:
	var center := Vector2(_rng.randf_range(6, 26), _rng.randf_range(6, 26))
	var radius := _rng.randf_range(3.0, 6.0)
	for y in SIZE:
		for x in SIZE:
			var d := Vector2(x, y).distance_to(center)
			if d < radius:
				img.set_pixel(x, y, img.get_pixel(x, y).darkened(0.12 * (1.0 - d / radius)))


# --- corridors -------------------------------------------------------------------

func _paint_corridor() -> Image:
	var img := _image()
	for y in SIZE:
		for x in SIZE:
			img.set_pixel(x, y, _jitter(CORRIDOR, 0.022))
	for i in _rng.randi_range(5, 9):
		var size := Vector2i(_rng.randi_range(2, 4), _rng.randi_range(2, 3))
		var at := Vector2i(_rng.randi_range(1, SIZE - size.x - 1), _rng.randi_range(1, SIZE - size.y - 2))
		var tone := _jitter(PEBBLE, 0.05)
		for y in size.y:
			for x in size.x:
				img.set_pixel(at.x + x, at.y + y, tone.lightened(0.12) if y == 0 else tone)
		for x in size.x:
			img.set_pixel(at.x + x, at.y + size.y, CORRIDOR.darkened(0.35))
	return img


# --- stairs ----------------------------------------------------------------------

const STEP_TOP := Color("9b948a")
const STEP_RISER := Color("5a554d")
const STAIR_LIGHT := Color("f2c46a")


func _paint_stairs(up: bool) -> Image:
	var img := _paint_floor(0)
	var steps := 5
	if up:
		# Steps climbing away from the viewer: each one narrower and higher,
		# lit from the opening above.
		for i in steps:
			var depth := float(i) / steps
			var inset := 3 + i * 2
			var y0 := 27 - i * 5
			var light := lerpf(0.0, 0.55, depth)
			for x in range(inset, SIZE - inset):
				for y in range(y0 - 2, y0 + 1):
					img.set_pixel(x, y, _jitter(STEP_TOP.lerp(STAIR_LIGHT, light), 0.015))
				for y in range(y0 + 1, mini(y0 + 4, SIZE)):
					img.set_pixel(x, y, _jitter(STEP_RISER.lerp(STAIR_LIGHT, light * 0.5), 0.015))
			img.set_pixel(inset, y0 - 2, STEP_TOP.lightened(0.3))
		# Warm light spilling from the top.
		for x in range(11, 21):
			for y in range(2, 6):
				var a := 1.0 - absf(x - 15.5) / 6.0
				img.set_pixel(x, y, img.get_pixel(x, y).lerp(STAIR_LIGHT.lightened(0.2), clampf(a * 0.9, 0.0, 1.0)))
	else:
		# A dark opening in the floor with steps going down into shadow.
		var hole := Rect2i(4, 4, 24, 24)
		for x in range(hole.position.x - 1, hole.end.x + 1):
			for y in range(hole.position.y - 1, hole.end.y + 1):
				img.set_pixel(x, y, BRICK_MORTAR.darkened(0.2))
		for i in steps:
			var depth := float(i) / steps
			var y0 := hole.position.y + 2 + i * 5
			var inset := hole.position.x + 1 + i
			var shade := lerpf(0.0, 0.85, depth)
			for x in range(inset, hole.end.x - 1 - i):
				for y in range(y0, mini(y0 + 2, hole.end.y)):
					img.set_pixel(x, y, _jitter(STEP_TOP.darkened(shade), 0.012))
				for y in range(y0 + 2, mini(y0 + 5, hole.end.y)):
					img.set_pixel(x, y, _jitter(STEP_RISER.darkened(shade + 0.1), 0.012))
		# A cold rim around the opening.
		for x in range(hole.position.x - 1, hole.end.x + 1):
			img.set_pixel(x, hole.position.y - 2, Color("7f93b8"))
		for y in range(hole.position.y - 1, hole.end.y + 1):
			img.set_pixel(hole.position.x - 2, y, Color("4f5d78"))
			img.set_pixel(hole.end.x + 1, y, Color("4f5d78"))
	return img


# --- walls -----------------------------------------------------------------------

func _paint_wall_top() -> Image:
	var img := _image()
	for y in SIZE:
		for x in SIZE:
			img.set_pixel(x, y, _jitter(WALL_TOP, 0.02))
	for i in 3:
		var y := _rng.randi_range(4, 28)
		for x in range(_rng.randi_range(0, 10), _rng.randi_range(20, 32)):
			img.set_pixel(x, y, WALL_TOP.lightened(0.07))
	return img


func _paint_wall_face() -> Image:
	var img := _image()
	img.fill(BRICK_MORTAR)
	# Cap: the top edge of the wall seen from above.
	for y in 7:
		for x in SIZE:
			var c := _jitter(WALL_TOP, 0.02)
			if y == 5:
				c = WALL_RIM.darkened(0.15)
			elif y == 6:
				c = WALL_RIM
			img.set_pixel(x, y, c)
	# Brick courses, darker toward the floor.
	var row_top := 7
	var course := 0
	while row_top < SIZE - 2:
		var height := mini(6, SIZE - 2 - row_top)
		var x := -_rng.randi_range(0, 6) if course % 2 == 0 else -_rng.randi_range(6, 11)
		var depth := float(row_top - 7) / 25.0
		while x < SIZE:
			var width := _rng.randi_range(9, 14)
			var tone := _jitter(BRICK, 0.035).darkened(depth * 0.35)
			if _rng.randf() < 0.12:
				tone = tone.lerp(BRICK_WARM, 0.35)
			for by in range(height - 1):
				for bx in range(width - 1):
					var px := x + bx
					if px < 0 or px >= SIZE:
						continue
					var c := _jitter(tone, 0.015)
					if by == 0:
						c = c.lightened(0.12)
					elif by == height - 2:
						c = c.darkened(0.14)
					img.set_pixel(px, row_top + by, c)
			x += width
		row_top += height
		course += 1
	for y in range(SIZE - 2, SIZE):
		for x in SIZE:
			img.set_pixel(x, y, BRICK_MORTAR.darkened(0.3))
	return img


func _paint_rim(side: String) -> Image:
	var img := _image()
	img.fill(Color(0, 0, 0, 0))
	for i in SIZE:
		for t in 2:
			var c := WALL_RIM if t == 0 else WALL_RIM.darkened(0.35)
			c.a = 0.95 if t == 0 else 0.7
			match side:
				"n": img.set_pixel(i, t, c)
				"s": img.set_pixel(i, SIZE - 1 - t, c)
				"w": img.set_pixel(t, i, c)
				"e": img.set_pixel(SIZE - 1 - t, i, c)
	return img


## Soft contact shadow cast onto floor by a neighboring wall.
func _paint_shadow(side: String) -> Image:
	var img := _image()
	var reach := 12 if side == "n" else 6
	var strength := 0.55 if side == "n" else 0.32
	for i in SIZE:
		for t in SIZE:
			var a := 0.0
			if t < reach:
				a = strength * pow(1.0 - float(t) / reach, 1.6)
			var c := Color(0.02, 0.02, 0.04, a)
			match side:
				"n": img.set_pixel(i, t, c)
				"s": img.set_pixel(i, SIZE - 1 - t, c)
				"w": img.set_pixel(t, i, c)
				"e": img.set_pixel(SIZE - 1 - t, i, c)
	return img
