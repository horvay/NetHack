class_name MessageFeed
extends VBoxContainer
## Recent messages stacked above the action bar. New lines slide in, older
## ones dim, everything fades back when the game goes quiet. The wheel
## scrolls back through recent messages; a click opens the full history.

signal history_requested

const VISIBLE := 7
const IDLE_FADE_AFTER := 9.0

var state: GameState
var _idle := 0.0
var _lines: Array[Label] = []


func setup(game_state: GameState) -> void:
	state = game_state
	set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	anchor_top = 1.0
	anchor_bottom = 1.0
	offset_left = 22
	offset_right = 22 + 760
	offset_bottom = -92
	offset_top = -92 - 230
	alignment = BoxContainer.ALIGNMENT_END
	add_theme_constant_override("separation", 2)
	mouse_filter = Control.MOUSE_FILTER_PASS
	state.message_added.connect(_on_message)
	tooltip_text = "Wheel: earlier messages  ·  Click: the full history  (F2)"


## Only the lines themselves are the feed: the empty rest of its box lets
## clicks and the wheel through to the map below.
## Faded lines (the game went quiet) let everything through until the
## pointer rests on them for a moment, which wakes the feed up.
func _over_text(at: Vector2, even_faded := false) -> bool:
	if modulate.a < 0.6 and not even_faded:
		return false
	for line in _lines + ([_back_hint] if is_instance_valid(_back_hint) else []):
		if is_instance_valid(line) and _text_rect(line).has_point(at):
			return true
	return false


## The part of a line covered by its text: a one-line label is only as wide
## as its words (the label itself spans the whole feed).
static func _text_rect(line: Label) -> Rect2:
	var rect := line.get_global_rect()
	if line.get_line_count() > 1:
		return rect
	var font := line.get_theme_font("font")
	var width := font.get_string_size(line.text, HORIZONTAL_ALIGNMENT_LEFT, -1, line.get_theme_font_size("font_size")).x
	rect.size.x = minf(rect.size.x, (width + 12.0) * line.get_global_transform().get_scale().x)
	return rect


func _has_point(point: Vector2) -> bool:
	return _over_text(get_global_transform() * point)


func _gui_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton and event.pressed):
		return
	match event.button_index:
		MOUSE_BUTTON_LEFT:
			history_requested.emit()
		MOUSE_BUTTON_WHEEL_UP:
			scroll_back(1)
		MOUSE_BUTTON_WHEEL_DOWN:
			scroll_back(-1)
		_:
			return
	accept_event()


## How far the feed is scrolled back from the newest message (the wheel
## over the feed; 0 = live). Older than BACK_LIMIT lines: the history panel.
var back := 0
const BACK_LIMIT := 100


func scroll_back(step: int) -> void:
	var available := _groups(state.messages.recent(BACK_LIMIT)).size()
	back = clampi(back + step, 0, maxi(0, available - VISIBLE))
	_idle = 0.0
	_render(false)


func _on_message(_entry: Dictionary) -> void:
	back = 0
	_render(true)
	_idle = 0.0


## Consecutive repeats of a message as one line: [[entry, count], ...].
static func _groups(entries: Array[Dictionary]) -> Array:
	var groups := []
	for entry in entries:
		if not groups.is_empty() and str(groups[-1][0].text) == str(entry.text):
			groups[-1][1] += 1
		else:
			groups.append([entry, 1])
	return groups


func _render(animate: bool) -> void:
	var groups := _groups(state.messages.recent(BACK_LIMIT if back > 0 else VISIBLE * 4))
	var last := groups.size() - back
	var shown := groups.slice(maxi(0, last - VISIBLE), last)
	# A repeat of the newest line only bumps its count (no new slide-in).
	var repeat: bool = animate and not _lines.is_empty() and not shown.is_empty() and is_instance_valid(_lines[-1]) \
		and _lines[-1].get_meta("base", "") == str(shown[-1][0].text) and int(shown[-1][1]) > int(_lines[-1].get_meta("count", 1))
	# Removed at once (not at the end of the frame), so the old lines never
	# share the layout with the new ones.
	for label in _lines:
		if is_instance_valid(label):
			remove_child(label)
			label.queue_free()
	_lines.clear()
	if is_instance_valid(_back_hint):
		remove_child(_back_hint)
		_back_hint.queue_free()
	for i in shown.size():
		var label := _make_label(shown[i][0], int(shown[i][1]))
		add_child(label)
		_lines.append(label)
		if i == shown.size() - 1 and animate:
			if repeat:
				label.modulate.a = 0.6
				label.create_tween().tween_property(label, "modulate:a", 1.0, 0.15)
			else:
				label.modulate.a = 0.0
				label.create_tween().tween_property(label, "modulate:a", 1.0, 0.18)
	if back > 0:
		_back_hint = Label.new()
		_back_hint.text = "▼  %d newer  —  scroll down to return" % back
		_back_hint.add_theme_font_override("font", UiTheme.italic_font())
		_back_hint.add_theme_font_size_override("font_size", 16)
		_back_hint.add_theme_color_override("font_color", UiTheme.GOLD)
		_back_hint.add_theme_constant_override("outline_size", 6)
		_back_hint.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
		_back_hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_back_hint)
	_restyle()


var _back_hint: Label


func _make_label(entry: Dictionary, count: int) -> Label:
	var label := Label.new()
	label.set_meta("base", entry.text)
	label.set_meta("count", count)
	label.text = entry.text if count == 1 else "%s  ×%d" % [entry.text, count]
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size = Vector2(740, 0)
	label.add_theme_font_size_override("font_size", 19)
	label.add_theme_constant_override("outline_size", 6)
	label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	label.add_theme_color_override("font_color", UiTheme.BAD.lightened(0.15) if entry.urgent else MessageLog.category_color(str(entry.get("category", "info"))))
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func _restyle() -> void:
	var count := _lines.size()
	for i in count:
		# Scrolled back, every line reads at full strength.
		var age := 0 if back > 0 else count - 1 - i
		var target := 1.0 if age == 0 else clampf(0.92 - age * 0.12, 0.35, 1.0)
		_lines[i].self_modulate = Color(1, 1, 1, target)


## Set while a large panel covers the screen: the feed steps back.
var dimmed := false


var _rest := 0.0
## True while a dialog covers the game (set by the HUD): the feed then
## stays asleep under it.
var covered := Callable()


func _process(delta: float) -> void:
	_idle += delta
	var under_dialog: bool = dimmed or (covered.is_valid() and covered.call())
	if modulate.a < 0.6 and not under_dialog and _over_text(get_global_mouse_position(), true):
		_rest += delta
		if _rest > 0.35:
			_idle = 0.0
			modulate.a = 0.7
	else:
		_rest = 0.0
	# While NetHack waits on a question the feed may hold its context: no
	# idle fade then.
	var asking := state != null and not (str(state.request.get("kind", "")) in ["command", "busy", ""])
	var target := 0.15 if dimmed else (0.45 if _idle > IDLE_FADE_AFTER and not asking and back == 0 else 1.0)
	modulate.a = lerpf(modulate.a, target, minf(1.0, delta * 2.0))


## A transient UI hint (not a game message, never logged).
func flash_notice(text: String) -> void:
	var label := Label.new()
	label.text = text
	label.add_theme_font_override("font", UiTheme.italic_font())
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", UiTheme.GOLD)
	label.add_theme_constant_override("outline_size", 6)
	label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(label)
	var tween := label.create_tween()
	tween.tween_interval(2.2)
	tween.tween_property(label, "modulate:a", 0.0, 0.5)
	tween.tween_callback(label.queue_free)
	_idle = 0.0
