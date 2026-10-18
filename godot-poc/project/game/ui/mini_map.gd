class_name MiniMap
extends PanelContainer
## The whole level at a glance: explored terrain, stairs, the hero and the
## creatures in sight. Click a spot to travel there. The explored part fills
## the panel (zoomed up to MAX_CELL px per cell) rather than sitting tiny in
## an 80x21 grid.

const VIEW := Vector2(400, 150)
const SIZES := {"small": 0.7, "medium": 1.0, "large": 1.45}
const MAX_CELL := 12.0
const COLORS := {
	Terrain.Kind.FLOOR: Color("6e675e"), Terrain.Kind.CORRIDOR: Color("514940"), Terrain.Kind.WALL: Color("9aa0b2"),
	Terrain.Kind.DOORWAY: Color("8a7a5e"), Terrain.Kind.DOOR_OPEN: Color("b07a3c"), Terrain.Kind.DOOR_CLOSED: Color("c4863c"),
	Terrain.Kind.WATER: Color("2f6aa6"), Terrain.Kind.LAVA: Color("e0602a"), Terrain.Kind.ICE: Color("9fd8ef"),
	Terrain.Kind.TREE: Color("3f7a3a"), Terrain.Kind.BARS: Color("8090a0"), Terrain.Kind.FEATURE: Color("6e675e"),
	Terrain.Kind.DRAWBRIDGE: Color("8a6a40"), Terrain.Kind.CLOUD: Color("8a8a8a"), Terrain.Kind.AIR: Color("90c0e0"),
}

var screen: GameScreen
var _canvas: Control
var _title: Label
var _image: Image
var _texture: ImageTexture
var _dirty := true
var _pulse := 0.0
## Pixels per map cell, and where cell (0, 0) lands on the canvas.
var _scale := VIEW.x / MapModel.WIDTH
## The canvas size (Settings > Minimap).
var view := VIEW
var _origin := Vector2.ZERO


## Resizes to Settings > Minimap.
func apply_size() -> void:
	var size_name := App.instance.settings.minimap_size if App.instance else "medium"
	view = (VIEW * float(SIZES.get(size_name, 1.0))).round()
	if _canvas:
		_canvas.custom_minimum_size = view
	offset_left = -18 - (view.x + 28)
	offset_right = -18
	reset_size()
	_dirty = true
	size_changed.emit()


## The panel changed size (the level banner keeps below it).
signal size_changed


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0.035, 0.037, 0.05, 0.86), UiTheme.LINE, 10, 1, 16))
	set_anchors_preset(Control.PRESET_TOP_RIGHT)
	anchor_left = 1.0
	anchor_right = 1.0
	offset_right = -18
	offset_top = 16
	apply_size.call_deferred()
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	add_child(column)
	_title = Label.new()
	_title.add_theme_font_override("font", UiTheme.heading_font())
	_title.add_theme_font_size_override("font_size", 14)
	_title.add_theme_color_override("font_color", UiTheme.GOLD_DIM.lightened(0.3))
	column.add_child(_title)
	_canvas = Control.new()
	_canvas.custom_minimum_size = view
	_canvas.clip_contents = true
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	_canvas.tooltip_text = "Click to travel there"
	_canvas.draw.connect(_draw_map)
	_canvas.gui_input.connect(_on_input)
	column.add_child(_canvas)
	_image = Image.create_empty(MapModel.WIDTH, MapModel.HEIGHT, false, Image.FORMAT_RGBA8)
	_texture = ImageTexture.create_from_image(_image)
	screen.state.map_changed.connect(func() -> void: _dirty = true)
	screen.state.status_changed.connect(func() -> void: _dirty = true)


func _process(delta: float) -> void:
	_pulse += delta
	if _dirty:
		_dirty = false
		_rebuild()
	_canvas.queue_redraw()


func _rebuild() -> void:
	var state := screen.state
	_title.text = state.level_name(true).to_upper()
	_image.fill(Color(0, 0, 0, 0))
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			var pos := Vector2i(x, y)
			var cell := state.map.cell(pos)
			if cell.is_empty() or not state.map.is_explored(pos):
				continue
			var info := Terrain.classify(cell)
			var color: Color = COLORS.get(info.kind, Color(0, 0, 0, 0))
			if Terrain.STAIRS.has(info.cmap):
				color = UiTheme.GOLD
			elif info.cmap in [33, 36, 37]:
				color = Color("7fb8ff")
			if not state.map.is_visible(pos) and color.a > 0:
				color = color.darkened(0.45)
			var actor := str(cell.get("actorId", ""))
			if actor != "" and actor != "hero":
				color = Color("5af08c") if int(cell.get("glyphFlags", 0)) & 0x10 else Color("ff5a4a")
			elif str(cell.get("semanticKind", "")) in ["object", "item"] and not cell.has("cmapIndex"):
				color = Color("e8d27a")
			_image.set_pixel(x, y, color)
	_texture.update(_image)
	_fit()


## Frames the explored area (plus a margin) in the panel.
func _fit() -> void:
	var state := screen.state
	var bounds := Rect2i(state.map.hero if state.map.hero.x >= 0 else Vector2i.ZERO, Vector2i.ONE)
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			if state.map.is_explored(Vector2i(x, y)):
				bounds = bounds.expand(Vector2i(x, y)).expand(Vector2i(x + 1, y + 1))
	bounds = bounds.grow(2).intersection(Rect2i(0, 0, MapModel.WIDTH, MapModel.HEIGHT))
	_scale = clampf(minf(view.x / bounds.size.x, view.y / bounds.size.y), view.x / MapModel.WIDTH, MAX_CELL * view.x / VIEW.x)
	_origin = (view - Vector2(bounds.size) * _scale) / 2.0 - Vector2(bounds.position) * _scale


## A map cell's centre on the minimap canvas.
func local_of_cell(cell: Vector2i) -> Vector2:
	return _origin + (Vector2(cell) + Vector2(0.5, 0.5)) * _scale


func _draw_map() -> void:
	_canvas.draw_texture_rect(_texture, Rect2(_origin, Vector2(MapModel.WIDTH, MapModel.HEIGHT) * _scale), false)
	var hero := screen.state.map.hero
	if hero.x >= 0:
		var center := local_of_cell(hero)
		var r := 3.0 + sin(_pulse * 4.0) * 1.0
		_canvas.draw_circle(center, r + 1.5, Color(0, 0, 0, 0.6))
		_canvas.draw_circle(center, r, Color.WHITE)


func _on_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var cell := Vector2i(((event.position - _origin) / _scale).floor())
		# Travel only: a click on or next to the hero would act on that square
		# (stairs, throne, fountain) or step and attack.
		var near := maxi(absi(cell.x - screen.state.map.hero.x), absi(cell.y - screen.state.map.hero.y)) <= 1
		if screen.state.is_waiting_for_command() and screen.state.map.is_explored(cell) and not near:
			screen.send_map_click(cell)
		elif screen.state.request.get("kind") == "map_target":
			screen.send_map_click(cell)
