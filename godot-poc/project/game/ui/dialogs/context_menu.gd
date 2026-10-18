class_name ContextMenu
extends Control
## Right-click menu for a map cell: what it is, then what you can do there.

signal closed

var screen: GameScreen
var cell: Vector2i
var _panel: PanelContainer
var _buttons: Array[Button] = []


func setup(game_screen: GameScreen, p_cell: Vector2i, actions: Array[Dictionary], at: Vector2) -> void:
	screen = game_screen
	cell = p_cell
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.theme()
	_panel = PanelContainer.new()
	_panel.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0.05, 0.053, 0.07, 0.97), Color(UiTheme.GOLD, 0.5), 8, 1, 18))
	add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 3)
	_panel.add_child(column)
	var info := CellDescriber.describe(screen.state, cell)
	var title := Label.new()
	title.text = str(info.get("title", ""))
	title.add_theme_font_override("font", UiTheme.bold_font())
	title.add_theme_color_override("font_color", UiTheme.GOLD)
	column.add_child(title)
	for line in info.get("lines", []):
		var detail := Label.new()
		detail.text = line
		detail.theme_type_variation = "CaptionLabel"
		column.add_child(detail)
	var sep := HSeparator.new()
	sep.add_theme_constant_override("separation", 6)
	column.add_child(sep)
	for i in actions.size():
		var action: Dictionary = actions[i]
		var button := Button.new()
		button.focus_mode = Control.FOCUS_ALL
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.custom_minimum_size = Vector2(240, 38)
		button.text = "%d   %s" % [i + 1, action.label]
		var danger := str(action.get("danger", ""))
		if danger != "":
			# As on the action bar: red for serious, amber for caution.
			button.add_theme_color_override("font_color", UiTheme.BAD if danger == "serious" else UiTheme.WARN)
			button.tooltip_text = "Asks first" if Motion.confirm_dangerous() else ""
		elif action.primary:
			button.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.25))
		button.pressed.connect(_run.bind(action))
		column.add_child(button)
		_buttons.append(button)
	_panel.reset_size()
	var viewport_size := get_viewport_rect().size if is_inside_tree() else Vector2(1920, 1080)
	_panel.position = Vector2(minf(at.x + 8, viewport_size.x - 280), minf(at.y + 8, viewport_size.y - _panel.size.y - 20))


func _ready() -> void:
	_panel.modulate.a = 0.0
	_panel.create_tween().tween_property(_panel, "modulate:a", 1.0, 0.1)


func _run(action: Dictionary) -> void:
	close()
	screen.dialogs.confirm_action(action, screen.input_router.run_cell_action.bind(cell, action))


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if not _panel.get_global_rect().has_point(event.global_position):
			close()
			accept_event()


func handle_key(event: InputEventKey) -> bool:
	if event.keycode == KEY_ESCAPE:
		close()
		return true
	var index := int(event.keycode - KEY_1)
	if index >= 0 and index < _buttons.size():
		_buttons[index].pressed.emit()
		return true
	# The arrows, Tab, Enter and Space go on to the focused row; any other
	# key is swallowed so it never runs as a command behind the menu.
	if InputRouter.is_navigation(event) or event.keycode in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE]:
		return false
	return true


func close() -> void:
	if is_queued_for_deletion():
		return
	closed.emit()
	queue_free()
