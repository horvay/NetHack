class_name CharacteristicBar
extends Control
## A characteristic (3–25, strength 18/xx) as a bar.

var value_text := ""


func _ready() -> void:
	custom_minimum_size = Vector2(180, 16)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


## 3..25 as 0..1; 18/01..18/** sits between 18 and 19.
func fraction() -> float:
	var v := 0.0
	if value_text.contains("/"):
		var extra := value_text.get_slice("/", 1)
		v = 18.0 + (1.0 if extra == "**" else int(extra) / 100.0)
	else:
		v = float(int(value_text))
	return clampf((v - 3.0) / 22.0, 0.0, 1.0)


func _draw() -> void:
	var track := Rect2(Vector2(0, 4), Vector2(size.x, 9))
	draw_rect(track, Color(1, 1, 1, 0.07))
	var f := fraction()
	var color := UiTheme.GOOD if f > 0.6 else (UiTheme.GOLD if f > 0.35 else UiTheme.WARN)
	draw_rect(Rect2(track.position, Vector2(track.size.x * f, track.size.y)), color)
