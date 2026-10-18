class_name TerrainLayer
extends Node2D
## Draws everything on the map that does not move: painted floors, corridors
## and walls, contact shadows, feature art (doors, stairs, altars...), traps
## and objects. Monsters and the hero are ActorLayer sprites; liquids are
## LiquidLayer; beams and explosions are EffectLayer.

const TILE := 32
const PILE_BADGE_COLOR := Color(0.95, 0.82, 0.5, 0.9)

var state: GameState
var resolver := TileResolver.shared()
var painter := TerrainPainter.shared()
## Per-cell Terrain kind, rebuilt on each redraw.
var kinds := PackedInt32Array()
## Terrain.classify result per cell, rebuilt on each redraw.
var infos: Array = []
var liquid_cells: Array[Vector2i] = []
var glow_cells: Array[Dictionary] = []
var high_contrast := false
## Cells whose object isn't drawn yet: a replayed throw lands there later.
var held_back: Dictionary = {}

signal painted


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST


func refresh() -> void:
	queue_redraw()


func kind_at(pos: Vector2i) -> int:
	if not MapModel.in_bounds(pos) or kinds.is_empty():
		return Terrain.Kind.NONE
	return kinds[MapModel.index_of(pos)]


func _classify_all() -> void:
	kinds.resize(MapModel.WIDTH * MapModel.HEIGHT)
	infos.resize(kinds.size())
	for i in kinds.size():
		var cell: Variant = state.map.cells[i]
		var info: Dictionary = Terrain.classify(cell) if cell != null else {"kind": Terrain.Kind.NONE, "cmap": -1}
		infos[i] = info
		kinds[i] = info.kind


func _draw() -> void:
	if state == null:
		return
	_classify_all()
	liquid_cells.clear()
	glow_cells.clear()
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			_draw_ground(Vector2i(x, y))
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			_draw_contents(Vector2i(x, y))
	if high_contrast:
		_draw_overlays()
	painted.emit()


## Accessibility (high contrast): bright wall edges, and outlines around
## creatures (red hostile, green tame). Symbols live in SymbolLayer.
func _draw_overlays() -> void:
	for y in MapModel.HEIGHT:
		for x in MapModel.WIDTH:
			var pos := Vector2i(x, y)
			var cell := state.map.cell(pos)
			if cell.is_empty():
				continue
			var rect := _rect(pos)
			var kind := kind_at(pos)
			if kind == Terrain.Kind.WALL:
				draw_rect(rect, Color(1, 1, 1, 0.14))
				draw_rect(rect.grow(-1), Color(1.0, 0.97, 0.85, 0.9), false, 2.0)
			elif kind == Terrain.Kind.DOOR_CLOSED or kind == Terrain.Kind.DOOR_OPEN:
				draw_rect(rect.grow(-2), Color(1.0, 0.8, 0.35, 0.9), false, 2.0)
			elif str(cell.get("actorId", "")) != "" and str(cell.get("actorId", "")) != "hero":
				draw_rect(rect.grow(-1), Color(1.0, 0.4, 0.3, 0.85) if not (int(cell.get("glyphFlags", 0)) & 0x10) else Color(0.4, 1.0, 0.5, 0.85), false, 2.0)


func _rect(pos: Vector2i) -> Rect2:
	return Rect2(pos * TILE, Vector2(TILE, TILE))


func _draw_ground(pos: Vector2i) -> void:
	var kind := kind_at(pos)
	var rect := _rect(pos)
	match kind:
		Terrain.Kind.NONE, Terrain.Kind.STONE:
			return
		Terrain.Kind.WALL:
			_draw_wall(pos, rect)
			return
		Terrain.Kind.CORRIDOR:
			draw_texture_rect(TerrainPainter.pick(painter.corridors, pos), rect, false)
		Terrain.Kind.WATER, Terrain.Kind.LAVA:
			liquid_cells.append(pos)
			return
		Terrain.Kind.AIR:
			return
		Terrain.Kind.ICE:
			draw_texture_rect(TerrainPainter.pick(painter.floors, pos), rect, false, Color(0.75, 0.95, 1.15))
		_:
			draw_texture_rect(TerrainPainter.pick(painter.floors, pos), rect, false)
	# Walls cast soft contact shadows onto the ground beside them.
	if kind_at(pos + Vector2i.UP) == Terrain.Kind.WALL:
		draw_texture_rect(painter.shadows["n"], rect, false)
	if kind_at(pos + Vector2i.LEFT) == Terrain.Kind.WALL:
		draw_texture_rect(painter.shadows["w"], rect, false)
	if kind_at(pos + Vector2i.RIGHT) == Terrain.Kind.WALL:
		draw_texture_rect(painter.shadows["e"], rect, false)


func _draw_wall(pos: Vector2i, rect: Rect2) -> void:
	var below := kind_at(pos + Vector2i.DOWN)
	if Terrain.is_walkable(below):
		draw_texture_rect(TerrainPainter.pick(painter.wall_faces, pos), rect, false)
		return
	draw_texture_rect(TerrainPainter.pick(painter.wall_tops, pos), rect, false)
	if Terrain.is_walkable(kind_at(pos + Vector2i.UP)):
		draw_texture_rect(painter.rims["n"], rect, false)
	if Terrain.is_walkable(kind_at(pos + Vector2i.LEFT)):
		draw_texture_rect(painter.rims["w"], rect, false)
	if Terrain.is_walkable(kind_at(pos + Vector2i.RIGHT)):
		draw_texture_rect(painter.rims["e"], rect, false)


func _draw_contents(pos: Vector2i) -> void:
	var cell := state.map.cell(pos)
	if cell.is_empty():
		return
	var rect := _rect(pos)
	var info: Dictionary = infos[MapModel.index_of(pos)]
	var cmap: int = info.cmap
	# Feature art: doors, stairs, altars, fountains...
	var feature := _feature_asset(pos, info)
	if cmap in [25, 26, 29, 30]:
		# Staircases are painted (TerrainPainter): up and down read apart.
		draw_texture_rect(painter.stairs_up if cmap in [25, 29] else painter.stairs_down, rect, false)
		glow_cells.append({"pos": pos, "kind": "stairs"})
	elif feature != "":
		draw_texture_rect(resolver.texture(feature), rect, false)
		if Terrain.STAIRS.has(cmap):
			glow_cells.append({"pos": pos, "kind": "stairs"})
		elif cmap == 37 or cmap == 36:
			glow_cells.append({"pos": pos, "kind": "fountain"})
		elif cmap == 33:
			glow_cells.append({"pos": pos, "kind": "altar"})
	if info.kind == Terrain.Kind.LAVA:
		glow_cells.append({"pos": pos, "kind": "lava"})
	var has_cmap := cell.has("cmapIndex") and cell.get("cmapIndex") != null
	if has_cmap and cmap < 49:
		return  # pure terrain, already drawn
	if has_cmap and cmap >= 74:
		return  # beams, explosions: EffectLayer; swallow frame: engulf view
	if str(cell.get("actorId", "")) != "":
		# Someone stands here: what is under them, drawn just as it is when
		# nobody stands on it. A known trap first (its art is the square's
		# own when the square is empty)…
		if cmap >= 49 and cmap <= 73 and not has_cmap:
			var trap := {"char": str(cell.get("backgroundChar", "^")), "glyph": int(cell.get("backgroundGlyph", -1)), "cmapIndex": cmap,
				"semanticKind": "trap", "semanticName": cell.get("backgroundSemanticName", ""), "semanticKnown": true}
			var trap_art := resolver.asset_for_cell(trap, state.character)
			if trap_art != "":
				draw_texture_rect(resolver.texture(trap_art), rect.grow(-1), false)
		# …then the object under them.
		var under := object_under(cell)
		if str(cell.get("actorId", "")) == "hero":
			# NetHack redraws a square only when its glyph changes, and the
			# hero's doesn't after a drop, eating floor food or a corpse
			# rotting away; the bridge's pile snapshot for it is always
			# current.
			var here := state.map.pile(pos)
			under = pile_item_cell(here[0]) if not here.is_empty() else {}
		if not under.is_empty():
			_draw_object(under, pos, rect, feature)
		return
	if held_back.has(pos):
		return  # a thrown object still in flight in the replay
	_draw_object(cell, pos, rect, feature)


## An object on the floor: corpses on their side over a stain, statues on a
## plinth, the rest as they are; a badge when several things lie here.
func _draw_object(cell: Dictionary, pos: Vector2i, rect: Rect2, feature: String) -> void:
	var main := resolver.asset_for_cell(cell, state.character)
	if main == "" or main == feature:
		return
	var tex := resolver.texture(main)
	if tex == null:
		return
	var pile := state.map.pile(pos)
	var several := int(cell.get("glyphFlags", 0)) & 0x80 != 0 or pile.size() > 1
	if several:
		# Several things lie here: the ones under the top item peek out
		# behind it (or, when the hero hasn't seen them, its shadows).
		_draw_pile_backs(pile, tex, rect)
		rect = Rect2(rect.position + Vector2(-4, 3), rect.size * 0.9)
	match object_style(cell):
		"corpse":
			_draw_corpse(tex, rect)
		"statue":
			_draw_statue(tex, rect)
		_:
			draw_texture_rect(tex, rect.grow(-1), false)
	if several:
		_draw_pile_badge(rect.position + Vector2(4, -3), pile.size())


static func object_style(cell: Dictionary) -> String:
	var kind := str(cell.get("semanticKind", "")).to_lower()
	# Under a creature the bridge reports every object as "object": its name
	# tells a corpse or a statue then.
	var name := (str(cell.get("semanticName", "")) + " " + str(cell.get("displayName", ""))).to_lower()
	if kind == "corpse" or name.contains("corpse"):
		return "corpse"
	if kind == "statue" or int(cell.get("glyphFlags", 0)) & 0x40 or name.contains("statue"):
		return "statue"
	return "plain"


## A ground-pile item as a map cell, for the resolver.
static func pile_item_cell(item: Dictionary) -> Dictionary:
	var ch := str(item.get("objectClass", ""))
	if ch == "" and int(item.get("glyphChar", 0)) > 32:
		ch = char(int(item.get("glyphChar", 0)))
	var object := {
		"char": ch if ch != "" else " ",
		"semanticKind": item.get("semanticKind", "object"),
		"semanticName": item.get("semanticName", ""),
		"semanticKnown": item.get("semanticKnown", true),
		"semanticAppearance": item.get("semanticAppearance", ""),
		"displayName": item.get("displayName", ""),
		"glyphFlags": 0,
	}
	if item.has("glyph"):
		object["glyph"] = int(item.glyph)
	return object


## The object under a creature or the hero, as a cell of its own (empty
## when nothing lies there).
static func object_under(cell: Dictionary) -> Dictionary:
	if not cell.has("objectLayerGlyph") and not cell.has("objectLayerChar"):
		return {}
	var object := {
		"char": str(cell.get("objectLayerChar", " ")),
		"glyph": int(cell.get("objectLayerGlyph", -1)),
		"semanticKind": cell.get("objectLayerSemanticKind", "object"),
		"semanticName": cell.get("objectLayerSemanticName", ""),
		"semanticKnown": cell.get("objectLayerSemanticKnown", true),
		"semanticAppearance": cell.get("objectLayerSemanticAppearance", ""),
		"displayName": cell.get("objectLayerDisplayName", ""),
		"glyphFlags": int(cell.get("objectLayerGlyphFlags", 0)),
	}
	# The same art as when nobody stands on it: the resolver picks a
	# corpse's or statue's art by kind.
	var style := object_style(object)
	if style != "plain":
		object["semanticKind"] = style
	return object


## A fallen creature: its art on its side, drained of color, over a stain.
func _draw_corpse(tex: Texture2D, rect: Rect2) -> void:
	var center := rect.get_center() + Vector2(0, 4)
	draw_set_transform(center + Vector2(0, 3), 0.0, Vector2(1.0, 0.45))
	draw_circle(Vector2.ZERO, 12.0, Color(0.35, 0.03, 0.02, 0.55))
	draw_set_transform(center, PI / 2.0, Vector2(0.78, 0.78))
	draw_texture_rect(tex, Rect2(Vector2(-16, -16), Vector2(32, 32)), false, Color(0.62, 0.5, 0.48, 0.95))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## A creature turned to stone on a small plinth.
func _draw_statue(tex: Texture2D, rect: Rect2) -> void:
	var base := Rect2(rect.position + Vector2(5, 25), Vector2(22, 5))
	draw_rect(base, Color("5d5f68"))
	draw_rect(Rect2(base.position, Vector2(base.size.x, 1)), Color("8a8d98"))
	draw_texture_rect(tex, rect.grow(-3).grow_side(SIDE_BOTTOM, -3), false, Color(0.78, 0.78, 0.84, 1.0))


## The second and third things of a pile, smaller and darker, offset up and
## to the right behind the top item. Unknown contents: shadows of the top.
func _draw_pile_backs(pile: Array, top: Texture2D, rect: Rect2) -> void:
	var backs: Array[Texture2D] = []
	for item in pile.slice(1, 3):
		var art := ItemText.icon(item, state)
		if art:
			backs.append(art)
	if backs.is_empty():
		backs = [top, top]
	for i in range(backs.size() - 1, -1, -1):
		var step := float(i + 1)
		var size := rect.size * (0.72 - 0.06 * i)
		var at := rect.position + Vector2(rect.size.x - size.x + step * 3.0, -step * 4.0)
		var shade := 0.82 - 0.14 * i if pile.size() > 1 else 0.3
		draw_texture_rect(backs[i], Rect2(at, size), false, Color(shade, shade, shade, 0.97))


## How many things lie here, on a small gold coin at the top right ("+"
## when the hero hasn't seen the pile).
func _draw_pile_badge(origin: Vector2, count: int) -> void:
	var at := origin + Vector2(TILE - 5.5, 5.5)
	draw_circle(at, 5.2, Color(0, 0, 0, 0.7))
	draw_circle(at, 4.4, PILE_BADGE_COLOR)
	var text := str(count) if count > 1 else "+"
	var font := UiTheme.bold_font()
	var size := 8 if text.length() == 1 else 6
	var width := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string(font, at + Vector2(-width / 2.0, size * 0.36), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color("1a1206"))


func _feature_asset(pos: Vector2i, info: Dictionary) -> String:
	var cmap: int = info.cmap
	var kind: int = info.kind
	if Terrain.FEATURE_ASSETS.has(cmap):
		if cmap == 21 or cmap == 24:
			return "engraving"
		return Terrain.FEATURE_ASSETS[cmap]
	match kind:
		Terrain.Kind.DOOR_CLOSED:
			return "closed-door"
		Terrain.Kind.DOOR_OPEN:
			var horizontal_walls := kind_at(pos + Vector2i.LEFT) == Terrain.Kind.WALL or kind_at(pos + Vector2i.RIGHT) == Terrain.Kind.WALL
			return "open-horizontal-door" if horizontal_walls else "open-vertical-door"
		Terrain.Kind.BARS:
			return "iron-bars"
		Terrain.Kind.TREE:
			return "tree"
	return ""
