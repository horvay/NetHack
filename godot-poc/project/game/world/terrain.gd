class_name Terrain
extends RefCounted
## Classifies what a map cell stands on, from NetHack's map symbols
## (include/defsym.h). Used to paint floors, walls and liquids procedurally
## and to decide where features, objects and actors sit.

enum Kind { NONE, STONE, WALL, FLOOR, CORRIDOR, DOORWAY, DOOR_OPEN, DOOR_CLOSED, BARS, TREE, WATER, LAVA, ICE, AIR, CLOUD, FEATURE, DRAWBRIDGE }

const CMAP_KINDS := {
	0: Kind.STONE, 1: Kind.WALL, 2: Kind.WALL, 3: Kind.WALL, 4: Kind.WALL, 5: Kind.WALL, 6: Kind.WALL, 7: Kind.WALL,
	8: Kind.WALL, 9: Kind.WALL, 10: Kind.WALL, 11: Kind.WALL, 12: Kind.DOORWAY, 13: Kind.DOOR_OPEN, 14: Kind.DOOR_OPEN,
	15: Kind.DOOR_CLOSED, 16: Kind.DOOR_CLOSED, 17: Kind.BARS, 18: Kind.TREE, 19: Kind.FLOOR, 20: Kind.FLOOR, 21: Kind.FLOOR,
	22: Kind.CORRIDOR, 23: Kind.CORRIDOR, 24: Kind.CORRIDOR, 25: Kind.FEATURE, 26: Kind.FEATURE, 27: Kind.FEATURE,
	28: Kind.FEATURE, 29: Kind.FEATURE, 30: Kind.FEATURE, 31: Kind.FEATURE, 32: Kind.FEATURE, 33: Kind.FEATURE,
	34: Kind.FEATURE, 35: Kind.FEATURE, 36: Kind.FEATURE, 37: Kind.FEATURE, 38: Kind.WATER, 39: Kind.ICE, 40: Kind.LAVA,
	41: Kind.LAVA, 42: Kind.DRAWBRIDGE, 43: Kind.DRAWBRIDGE, 44: Kind.DRAWBRIDGE, 45: Kind.DRAWBRIDGE, 46: Kind.AIR,
	47: Kind.CLOUD, 48: Kind.WATER, 86: Kind.CLOUD,
}
## cmap indices that are dungeon features drawn with art on top of the floor.
const FEATURE_ASSETS := {
	25: "up-stairs", 26: "down-stairs", 27: "ladder-up", 28: "ladder-down", 29: "branch-stairs-up",
	30: "branch-stairs-down", 31: "branch-ladder-up", 32: "branch-ladder-down", 33: "altar", 34: "grave",
	35: "throne", 36: "sink", 37: "fountain", 13: "open-vertical-door", 14: "open-horizontal-door",
	15: "closed-door", 16: "closed-door", 17: "iron-bars", 18: "tree", 21: "engraving", 24: "engraving",
}
const STAIRS := [25, 26, 27, 28, 29, 30, 31, 32]
const WALKABLE := [Kind.FLOOR, Kind.CORRIDOR, Kind.DOORWAY, Kind.DOOR_OPEN, Kind.FEATURE, Kind.ICE, Kind.DRAWBRIDGE, Kind.WATER, Kind.LAVA, Kind.AIR, Kind.CLOUD]

const NAME_KINDS := {
	"stone": Kind.STONE, "doorway": Kind.DOORWAY, "no door": Kind.DOORWAY, "broken door": Kind.DOORWAY,
	"open door": Kind.DOOR_OPEN, "closed door": Kind.DOOR_CLOSED, "iron bars": Kind.BARS, "tree": Kind.TREE,
	"floor of a room": Kind.FLOOR, "dark part of a room": Kind.FLOOR, "corridor": Kind.CORRIDOR,
	"dark corridor": Kind.CORRIDOR, "lit corridor": Kind.CORRIDOR, "water": Kind.WATER, "pool": Kind.WATER,
	"moat": Kind.WATER, "molten lava": Kind.LAVA, "wall of lava": Kind.LAVA, "ice": Kind.ICE, "air": Kind.AIR,
	"cloud": Kind.CLOUD, "poison cloud": Kind.CLOUD,
}
const NAME_FEATURES := {
	"staircase up": 25, "up stairs": 25, "staircase down": 26, "down stairs": 26, "ladder up": 27, "up ladder": 27,
	"ladder down": 28, "down ladder": 28, "branch staircase up": 29, "branch staircase down": 30,
	"branch ladder up": 31, "branch ladder down": 32, "altar": 33, "grave": 34, "opulent throne": 35, "throne": 35,
	"sink": 36, "fountain": 37,
}


## Returns {kind: Kind, cmap: int (-1 if unknown)} for what lies under the cell.
static func classify(cell: Dictionary) -> Dictionary:
	if cell.is_empty():
		return {"kind": Kind.NONE, "cmap": -1}
	if cell.has("cmapIndex") and cell.get("cmapIndex") != null:
		var cmap := int(cell["cmapIndex"])
		if CMAP_KINDS.has(cmap):
			return {"kind": CMAP_KINDS[cmap], "cmap": cmap}
		if cmap >= 49 and cmap <= 73:
			# A trap: it sits on floor (or corridor when drawn with '#' background).
			return {"kind": _kind_from_background(cell, Kind.FLOOR), "cmap": cmap}
		return {"kind": _kind_from_background(cell, Kind.FLOOR), "cmap": cmap}
	# Someone (or something) stands here: the terrain under them. The bridge
	# sends its cmap index (backgroundCmap, extended mode).
	var under := int(cell.get("backgroundCmap", -1))
	if under >= 0:
		if CMAP_KINDS.has(under):
			return {"kind": CMAP_KINDS[under], "cmap": under}
		return {"kind": _kind_from_background(cell, Kind.FLOOR), "cmap": under}
	return {"kind": _kind_from_background(cell, Kind.NONE), "cmap": _background_cmap(cell)}


static func _kind_from_background(cell: Dictionary, fallback: int) -> int:
	var name := str(cell.get("backgroundSemanticName", "")).to_lower()
	if name.contains("wall") and not name.contains("lava"):
		return Kind.WALL
	if NAME_KINDS.has(name):
		return NAME_KINDS[name]
	if NAME_FEATURES.has(name):
		return Kind.FEATURE
	if name.contains("engraving"):
		return Kind.CORRIDOR if str(cell.get("backgroundChar", "")) == "#" else Kind.FLOOR
	if name.contains("drawbridge"):
		return Kind.DRAWBRIDGE
	match str(cell.get("backgroundChar", "")):
		".":
			return Kind.FLOOR
		"#":
			return Kind.CORRIDOR
		"}":
			return Kind.WATER
	if fallback != Kind.NONE:
		return fallback
	# Unknown ground under an object or monster: most likely floor.
	return Kind.FLOOR if str(cell.get("char", " ")) != " " else Kind.NONE


static func _background_cmap(cell: Dictionary) -> int:
	var name := str(cell.get("backgroundSemanticName", "")).to_lower()
	return NAME_FEATURES.get(name, -1)


static func is_walkable(kind: int) -> bool:
	return WALKABLE.has(kind)
