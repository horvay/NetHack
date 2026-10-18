class_name MapModel
extends RefCounted
## The current level as NetHack last drew it: one shim_print_glyph event per
## cell, plus the hero position and the per-cell vision NetHack reports.
##
## Cells are only cleared when NetHack clears the map window (level change or
## full redraw); NetHack then reprints everything it remembers.

const WIDTH := 80
const HEIGHT := 21
const VISION_SEEN := 1
const VISION_LIT := 2

## Set of dirty cell indices since the view last consumed them.
var dirty: Dictionary = {}
var cleared := false
var cells: Array = []
## Seen objects per cell index from shim_ground_pile_snapshot (top first).
var piles: Dictionary = {}
var vision := PackedByteArray()
var vision_revision := 0
var hero := Vector2i(-1, -1)
var depth := 0
var dnum := 0
## The branch's name, e.g. "The Gnomish Mines" (bridge_vision, extended).
var dungeon := ""
var dlevel := 0
var blind := false


func _init() -> void:
	reset()


func reset() -> void:
	cells.resize(WIDTH * HEIGHT)
	cells.fill(null)
	vision.resize(WIDTH * HEIGHT)
	vision.fill(0)
	piles.clear()
	dirty.clear()
	cleared = true


static func in_bounds(pos: Vector2i) -> bool:
	return pos.x >= 0 and pos.y >= 0 and pos.x < WIDTH and pos.y < HEIGHT


static func index_of(pos: Vector2i) -> int:
	return pos.y * WIDTH + pos.x


func cell(pos: Vector2i) -> Dictionary:
	if not in_bounds(pos):
		return {}
	var value: Variant = cells[index_of(pos)]
	return value if value != null else {}


func set_cell(pos: Vector2i, event: Dictionary) -> void:
	if not in_bounds(pos):
		return
	cells[index_of(pos)] = event
	dirty[index_of(pos)] = true
	# A reprinted cell without the authoritative flag has no known pile.
	if not event.get("groundPileSnapshotAuthoritative", false):
		piles.erase(index_of(pos))


func is_explored(pos: Vector2i) -> bool:
	var c := cell(pos)
	return not c.is_empty() and (str(c.get("char", " ")) != " " or str(c.get("semanticKind", "")) not in ["", "unexplored", "nothing"])


func is_visible(pos: Vector2i) -> bool:
	return in_bounds(pos) and (vision[index_of(pos)] & VISION_SEEN) != 0


func is_lit(pos: Vector2i) -> bool:
	return in_bounds(pos) and (vision[index_of(pos)] & VISION_LIT) != 0


## Applies a bridge_vision event; returns true when the level changed.
func apply_vision(event: Dictionary) -> bool:
	var text := str(event.get("cells", ""))
	var count: int = min(text.length(), WIDTH * HEIGHT)
	for i in count:
		vision[i] = text.unicode_at(i) - 48
	vision_revision += 1
	blind = event.get("blind", false) == true
	dungeon = str(event.get("dungeon", dungeon))
	var new_depth := int(event.get("depth", depth))
	var new_dnum := int(event.get("dnum", dnum))
	var new_dlevel := int(event.get("dlevel", dlevel))
	var changed := new_depth != depth or new_dnum != dnum or new_dlevel != dlevel
	depth = new_depth
	dnum = new_dnum
	dlevel = new_dlevel
	return changed


func take_dirty() -> Array:
	var result := dirty.keys()
	dirty.clear()
	return result


func take_cleared() -> bool:
	var was := cleared
	cleared = false
	return was


## Monsters currently drawn, keyed by actorId ("monster-<id>").
func actors() -> Dictionary:
	var found := {}
	for i in cells.size():
		var c: Variant = cells[i]
		if c == null:
			continue
		var actor := str(c.get("actorId", ""))
		if actor != "" and actor != "hero":
			found[actor] = Vector2i(i % WIDTH, i / WIDTH)
	return found


func set_pile(pos: Vector2i, items: Array) -> void:
	if not in_bounds(pos):
		return
	if items.is_empty():
		piles.erase(index_of(pos))
	else:
		piles[index_of(pos)] = items


func pile(pos: Vector2i) -> Array:
	return piles.get(index_of(pos), []) if in_bounds(pos) else []
