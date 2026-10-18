class_name StairsBadges
extends Node2D
## A small arrow in the corner of every known staircase or ladder: gold and
## pointing up for the way up, blue and pointing down for the way down.
## Drawn above the creatures, so stairs stay findable with someone on them.

const TILE := 32

var terrain: TerrainLayer
var state: GameState


func _ready() -> void:
	z_index = 4
	terrain.painted.connect(queue_redraw)


func _draw() -> void:
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			var pos := Vector2i(x, y)
			var info: Dictionary = terrain.infos[MapModel.index_of(pos)] if terrain.infos.size() > MapModel.index_of(pos) else {}
			if info.is_empty() or not Terrain.STAIRS.has(int(info.get("cmap", -1))):
				continue
			var down: bool = int(info.cmap) in [26, 28, 30, 32]
			var color := Color("8fc4ff") if down else UiTheme.GOLD
			if not state.map.is_visible(pos):
				color = color.darkened(0.4)
			var corner := Vector2(pos * TILE) + Vector2(TILE - 7, 7)
			var tip := 4.5 if down else -4.5
			# A dark backing triangle, then the coloured arrow inside it.
			draw_colored_polygon(PackedVector2Array([corner + Vector2(0, tip * 1.35), corner + Vector2(-6, -tip * 1.1), corner + Vector2(6, -tip * 1.1)]), Color(0, 0, 0, 0.8))
			draw_colored_polygon(PackedVector2Array([corner + Vector2(0, tip), corner + Vector2(-4.2, -tip * 0.8), corner + Vector2(4.2, -tip * 0.8)]), color)
