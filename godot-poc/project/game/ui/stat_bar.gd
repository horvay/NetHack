class_name StatBar
extends Control
## A resource bar that animates: the fill eases to its new value while a
## pale "ghost" segment lingers to show how much was just lost.

var fill_color := UiTheme.HP
var label_prefix := "HP"
var value := 0.0
var max_value := 1.0
var _shown := 0.0
var _ghost := 0.0
var _ghost_delay := 0.0
var _pulse := 0.0


func _init(color := UiTheme.HP, prefix := "HP") -> void:
	fill_color = color
	label_prefix = prefix
	custom_minimum_size = Vector2(220, 22)


func set_values(new_value: float, new_max: float) -> void:
	new_max = maxf(new_max, 1.0)
	if new_value < value:
		_ghost = maxf(_ghost, _shown)
		_ghost_delay = 0.45
	value = new_value
	max_value = new_max
	queue_redraw()


func _process(delta: float) -> void:
	var target := clampf(value / max_value, 0.0, 1.0)
	var changed := false
	if not is_equal_approx(_shown, target):
		_shown = lerpf(_shown, target, minf(1.0, delta * 9.0))
		if absf(_shown - target) < 0.002:
			_shown = target
		changed = true
	if _ghost_delay > 0.0:
		_ghost_delay -= delta
	elif _ghost > _shown:
		_ghost = maxf(_shown, _ghost - delta * 0.6)
		changed = true
	var low := target < 0.3
	if low:
		_pulse += delta * 5.0
		changed = true
	if changed:
		queue_redraw()


func _draw() -> void:
	var rect := Rect2(Vector2.ZERO, size)
	var radius := 5
	_draw_round(rect, Color(0, 0, 0, 0.6), radius)
	var inner := rect.grow(-2)
	if _ghost > _shown:
		_draw_round(Rect2(inner.position, Vector2(inner.size.x * _ghost, inner.size.y)), Color(1, 0.92, 0.7, 0.55), radius - 1)
	var fraction := clampf(_shown, 0.0, 1.0)
	if fraction > 0.0:
		var color := fill_color
		if fraction < 0.3 and label_prefix == "HP":
			color = fill_color.lerp(UiTheme.HP_LOW, 0.5 + 0.5 * sin(_pulse))
		var bar := Rect2(inner.position, Vector2(maxf(inner.size.x * fraction, 4.0), inner.size.y))
		_draw_round(bar, color.darkened(0.25), radius - 1)
		_draw_round(Rect2(bar.position, Vector2(bar.size.x, bar.size.y * 0.5)), color.lightened(0.08), radius - 1)
	var text := "%s  %d / %d" % [label_prefix, int(value), int(max_value)]
	var font := UiTheme.bold_font()
	var font_size := 15
	var text_size := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	var at := Vector2((size.x - text_size.x) / 2.0, (size.y + font.get_ascent(font_size) - font.get_descent(font_size)) / 2.0)
	draw_string_outline(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, 4, Color(0, 0, 0, 0.8))
	draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color.WHITE)


func _draw_round(rect: Rect2, color: Color, radius: int) -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(maxi(radius, 0))
	style.anti_aliasing = true
	draw_style_box(style, rect)
