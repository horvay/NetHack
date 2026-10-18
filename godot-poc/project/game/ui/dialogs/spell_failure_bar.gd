class_name SpellFailureBar
extends Control
## A spell's chance of failure as a bar: green when it is safe, amber when
## risky, red when it will mostly fail; the percentage beside it.

var failure := 0


func _ready() -> void:
	custom_minimum_size = Vector2(240, 12)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _draw() -> void:
	var color: Color = UiTheme.GOOD if failure < 25 else (UiTheme.WARN if failure < 60 else UiTheme.BAD)
	var track := Rect2(Vector2(0, 3), Vector2(150, 7))
	draw_rect(track, Color(1, 1, 1, 0.08))
	draw_rect(Rect2(track.position, Vector2(track.size.x * clampf(failure / 100.0, 0.0, 1.0), track.size.y)), color)
	draw_string(UiTheme.body_font(), Vector2(160, 11), "%d%% fail" % failure, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, color)
