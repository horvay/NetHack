class_name SymbolLayer
extends Node2D
## Accessibility: NetHack's own symbol for every known cell, large and
## centred, drawn above the creatures and the fog so the hero's @ and every
## monster letter read clearly. Remembered cells are dimmer, as in NetHack.

const TILE := 32
const SIZE := 22

var state: GameState
var enabled := false:
	set(value):
		enabled = value
		visible = value
		queue_redraw()


func _ready() -> void:
	z_index = 5
	visible = enabled
	state.map_changed.connect(func() -> void:
		if enabled:
			queue_redraw())


func _draw() -> void:
	var font := UiTheme.bold_font()
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			var pos := Vector2i(x, y)
			var cell := state.map.cell(pos)
			var ch := str(cell.get("char", " "))
			if cell.is_empty() or ch.strip_edges() == "":
				continue
			var color := EffectLayer.nethack_color(int(cell.get("color", 7))).lightened(0.25)
			if not state.map.is_visible(pos):
				color = color.darkened(0.45)
			var width := font.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, SIZE).x
			var at := Vector2(pos * TILE) + Vector2((TILE - width) / 2.0, TILE / 2.0 + SIZE * 0.36)
			draw_string_outline(font, at, ch, HORIZONTAL_ALIGNMENT_LEFT, -1, SIZE, 6, Color(0, 0, 0, 0.92))
			draw_string(font, at, ch, HORIZONTAL_ALIGNMENT_LEFT, -1, SIZE, color)
