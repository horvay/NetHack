class_name SkillPips
extends Control
## A skill's rank as five diamonds (Basic … Grand Master; Unskilled is none
## filled): filled up to the current rank, the next rank outlined in gold
## when it can be advanced, a bar after the last one when it is at its peak.

const COUNT := 5

var current := 0  # index in SkillsScreen.RANKS (0 = Unskilled)
var next := -1
var peaked := false


func setup(p_current: int, p_next: int, p_peaked: bool) -> void:
	current = maxi(p_current, 0)
	next = p_next
	peaked = p_peaked
	custom_minimum_size = Vector2(COUNT * 14 + 8, 14)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _draw() -> void:
	for i in COUNT:
		var rank := i + 1
		var c := Vector2(7 + i * 14, 7)
		var points := PackedVector2Array([c + Vector2(0, -6), c + Vector2(6, 0), c + Vector2(0, 6), c + Vector2(-6, 0)])
		if rank <= current:
			draw_colored_polygon(points, UiTheme.GOLD)
		else:
			draw_colored_polygon(points, Color(1, 1, 1, 0.08))
		var outline := points.duplicate()
		outline.append(points[0])
		var edge := Color(UiTheme.GOLD, 1.0) if rank == next else Color(1, 1, 1, 0.25)
		draw_polyline(outline, edge, 2.0 if rank == next else 1.0)
	if peaked:
		var x := 7 + (current - 1) * 14 + 9
		if current >= 1:
			draw_line(Vector2(x, 1), Vector2(x, 13), UiTheme.INK_DIM, 2.0)
