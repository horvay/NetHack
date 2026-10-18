class_name CellInspector
extends PanelContainer
## Hover card describing what the player sees at a map cell: the creature,
## the top object, the terrain beneath, and what can be done there.
## Uses only the public names the bridge reports (no spoilers).

var screen: GameScreen
var title: Label
var lines: VBoxContainer
var _cell := Vector2i(-1, -1)


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0.04, 0.045, 0.06, 0.94), UiTheme.LINE, 8, 1, 12))
	visible = false
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	add_child(column)
	title = Label.new()
	title.add_theme_font_override("font", UiTheme.bold_font())
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", UiTheme.GOLD)
	column.add_child(title)
	lines = VBoxContainer.new()
	lines.add_theme_constant_override("separation", 0)
	column.add_child(lines)


func show_cell(cell: Vector2i, screen_position: Vector2) -> void:
	var info := CellDescriber.describe(screen.state, cell)
	if info.is_empty():
		hide_card()
		return
	if cell != _cell:
		_cell = cell
		title.text = info.title
		# Detach old lines now, so the card can shrink this frame.
		for child in lines.get_children():
			lines.remove_child(child)
			child.queue_free()
		for line in info.lines:
			var label := Label.new()
			label.text = line
			label.add_theme_font_size_override("font_size", 16)
			label.add_theme_color_override("font_color", UiTheme.INK_DIM)
			lines.add_child(label)
		var pile := screen.state.map.pile(cell)
		if pile.size() > 1:
			for item in pile.slice(0, 8):
				var row := HBoxContainer.new()
				var art := TextureRect.new()
				art.texture = ItemText.icon(item, screen.state)
				art.custom_minimum_size = Vector2(22, 22)
				art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
				art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
				art.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
				row.add_child(art)
				var name := Label.new()
				name.text = str(item.get("displayName", ""))
				name.add_theme_font_size_override("font_size", 15)
				row.add_child(name)
				lines.add_child(row)
			if pile.size() > 8:
				var more := Label.new()
				more.text = "…and %d more" % (pile.size() - 8)
				more.add_theme_font_size_override("font_size", 14)
				lines.add_child(more)
		if not info.actions.is_empty():
			var hint := Label.new()
			hint.text = GamepadRouter.hint("Right-click: ", "A: ") + ", ".join(info.actions)
			hint.add_theme_font_size_override("font_size", 15)
			hint.add_theme_color_override("font_color", UiTheme.GOLD_DIM.lightened(0.3))
			lines.add_child(hint)
		size = Vector2.ZERO
		reset_size()
	visible = true
	var viewport_size := get_viewport_rect().size
	var at := screen_position + Vector2(22, 18)
	if at.x + size.x > viewport_size.x - 10:
		at.x = screen_position.x - size.x - 18
	if at.y + size.y > viewport_size.y - 10:
		at.y = screen_position.y - size.y - 12
	# Never cover the hero: flip to the pointer's other side.
	var hero := screen.world.screen_of_cell(screen.state.map.hero)
	var hero_rect := Rect2(hero - Vector2(36, 36), Vector2(72, 72))
	if Rect2(at, size).intersects(hero_rect):
		var flipped := Vector2(screen_position.x - size.x - 18, at.y)
		if flipped.x < 10 or Rect2(flipped, size).intersects(hero_rect):
			flipped = Vector2(at.x, screen_position.y - size.y - 12 if hero.y > screen_position.y else screen_position.y + 30)
		at = flipped
	at.x = clampf(at.x, 10.0, maxf(10.0, viewport_size.x - size.x - 10.0))
	at.y = clampf(at.y, 10.0, maxf(10.0, viewport_size.y - size.y - 10.0))
	position = at


## Re-reads the hovered cell after the map changed under the pointer.
func refresh() -> void:
	if not visible or not MapModel.in_bounds(_cell):
		return
	var cell := _cell
	var at := position
	_cell = Vector2i(-1, -1)
	show_cell(cell, at - Vector2(22, 18))


func hide_card() -> void:
	visible = false
	_cell = Vector2i(-1, -1)
