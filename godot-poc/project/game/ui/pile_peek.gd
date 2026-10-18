class_name PilePeek
extends PanelContainer
## A brief, non-blocking card listing what lies where the hero stands, shown
## when NetHack reports "Things that are here". Click it to pick things up.

var screen: GameScreen
var _list: VBoxContainer
var _title: Label
var _tween: Tween


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0.04, 0.042, 0.056, 0.92), Color(UiTheme.GOLD, 0.45), 10, 1, 16))
	set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	anchor_left = 1.0
	anchor_right = 1.0
	anchor_top = 1.0
	anchor_bottom = 1.0
	grow_horizontal = Control.GROW_DIRECTION_BEGIN
	grow_vertical = Control.GROW_DIRECTION_BEGIN
	offset_right = -22
	offset_bottom = -96
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	tooltip_text = "Click to pick up  (,)"
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	add_child(column)
	var title := Label.new()
	_title = title
	title.text = "HERE"
	title.add_theme_font_override("font", UiTheme.heading_font())
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_color", UiTheme.GOLD_DIM.lightened(0.3))
	column.add_child(title)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 2)
	column.add_child(_list)
	screen.state.pile_shown.connect(_show_lines)
	screen.state.hero_moved.connect(func(_f: Vector2i, _t: Vector2i) -> void:
		if visible:
			_hide())
	# The pile under the hero changed (picked up, dropped): the list is stale.
	screen.state.pile_changed.connect(func(cell: Vector2i) -> void:
		if visible and cell == screen.state.map.hero:
			_hide())


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_hide()
		screen.dialogs.open_ground()
		accept_event()


func _show_lines(lines: Array, feature: String = "") -> void:
	# NetHack's sentence ("There is a staircase up here.") reads as body
	# text; a bare heading stays in the small capitals style.
	_title.text = feature if feature != "" else "HERE"
	var sentence := feature != ""
	_title.add_theme_font_override("font", UiTheme.body_font() if sentence else UiTheme.heading_font())
	_title.add_theme_font_size_override("font_size", 16 if sentence else 14)
	_title.add_theme_color_override("font_color", UiTheme.INK_DIM if sentence else UiTheme.GOLD_DIM.lightened(0.3))
	for child in _list.get_children():
		child.queue_free()
	var items := screen.state.map.pile(screen.state.map.hero)
	var shown := 0
	if not items.is_empty():
		for item in items:
			_add_row(ItemText.icon(item, screen.state), str(item.get("displayName", "")))
			shown += 1
	else:
		for line in lines:
			var text := str(line.get("text", "")).strip_edges()
			if text != "":
				_add_row(null, text)
				shown += 1
	if shown == 0:
		return
	visible = true
	modulate.a = 0.0
	if _tween and _tween.is_valid():
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(self, "modulate:a", 1.0, 0.15)
	_tween.tween_interval(4.5)
	_tween.tween_property(self, "modulate:a", 0.0, 0.5)
	_tween.tween_callback(func() -> void: visible = false)


func _add_row(icon: Texture2D, text: String) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var art := TextureRect.new()
	art.texture = icon
	art.custom_minimum_size = Vector2(28, 28)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	row.add_child(art)
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 17)
	row.add_child(label)
	_list.add_child(row)


func _hide() -> void:
	if _tween and _tween.is_valid():
		_tween.kill()
	visible = false
