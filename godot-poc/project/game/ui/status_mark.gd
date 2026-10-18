class_name StatusMark
extends Control
## A status's icon: its badge art from the tileset when there is one, else a
## round mark in the tier's colour with "!" (deadly), "•" (serious) or "·".

var effect: Dictionary = {}
var _texture: Texture2D


func setup(p_effect: Dictionary, size_px: int) -> void:
	effect = p_effect
	custom_minimum_size = Vector2(size_px, size_px)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var asset := str(effect.get("icon", ""))
	if asset != "" and TileResolver.shared().has_asset(asset):
		_texture = TileResolver.shared().texture(asset)


func _draw() -> void:
	var rect := Rect2(Vector2.ZERO, size)
	if _texture:
		draw_texture_rect(_texture, rect, false)
		return
	var color := StatusEffects.color(effect)
	var center := size / 2.0
	var radius := minf(size.x, size.y) / 2.0 - 1.0
	draw_circle(center, radius, Color(0, 0, 0, 0.55))
	draw_circle(center, radius - 2.0, color)
	var mark := "!" if effect.get("tier") == "deadly" else ("!" if effect.get("tier") == "serious" else "·")
	var font := UiTheme.bold_font()
	var font_size := int(size.y * 0.7)
	var width := font.get_string_size(mark, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	draw_string(font, center + Vector2(-width / 2.0, font_size * 0.36), mark, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color("1a1206"))
