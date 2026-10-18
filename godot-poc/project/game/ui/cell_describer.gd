class_name CellDescriber
extends RefCounted
## Turns a map cell into what the hero knows about it: a title, detail lines
## and the actions that make sense there. Only public fields from the bridge
## are used (displayName, semanticName when known, appearance, creature
## attitude/status/size, feature and engraving text).


static func describe(state: GameState, cell: Vector2i) -> Dictionary:
	var c := state.map.cell(cell)
	if c.is_empty() or not state.map.is_explored(cell):
		return {}
	var title := ""
	var lines: Array[String] = []
	var actor := str(c.get("actorId", ""))
	var kind := str(c.get("semanticKind", "")).to_lower()
	if actor == "hero":
		title = "%s  (you)" % state.character.get("name", "You")
		var t := state.status.title()
		if t != "":
			lines.append(t.strip_edges())
	elif actor != "" or kind in ["monster", "pet"]:
		title = ItemText.sentence(public_name(c))
		var creature: Dictionary = c.get("creaturePublic", {}) if c.get("creaturePublic") is Dictionary else {}
		var facts: Array[String] = []
		if creature.get("attitude", "") != "":
			facts.append(str(creature.attitude))
		if creature.get("size", "") != "":
			facts.append(str(creature.size))
		for s in creature.get("status", []):
			facts.append(str(s))
		if int(c.get("glyphFlags", 0)) & 0x10 and not facts.has("tame"):
			facts.push_front("your pet")
		if not facts.is_empty():
			lines.append(ItemText.sentence(", ".join(facts)))
		if c.has("objectLayerGlyph") or c.has("objectLayerDisplayName"):
			var under := str(c.get("objectLayerDisplayName", c.get("objectLayerSemanticName", "")))
			if under != "":
				lines.append("Standing on " + under)
	elif kind in ["object", "item", "corpse", "statue", "boulder"]:
		title = ItemText.sentence(public_name(c))
		if int(c.get("glyphFlags", 0)) & 0x80:
			lines.append("A pile of several things")
	elif kind == "trap":
		title = ItemText.sentence(public_name(c))
		lines.append("A known trap")
	else:
		title = ItemText.sentence(terrain_name(c))
	var feature := str(c.get("featureDescription", ""))
	if feature != "" and feature.to_lower() != title.to_lower():
		lines.append(ItemText.sentence(feature))
	elif kind not in ["", "terrain", "feature"] and actor != "hero":
		var ground := str(c.get("backgroundSemanticName", ""))
		if ground != "" and ground != "stone" and actor == "":
			lines.append("On " + ground)
	var engraving := str(c.get("engravingText", ""))
	if engraving != "":
		lines.append("Engraved: “%s”" % engraving)
	if not state.map.is_visible(cell) and actor != "hero":
		lines.append("(remembered — out of sight)")
	return {"title": title, "lines": lines, "actions": action_labels(state, cell)}


static func public_name(c: Dictionary) -> String:
	for key in ["displayName"]:
		if str(c.get(key, "")) != "":
			return str(c[key])
	if c.get("semanticKnown", true) == false:
		var appearance := str(c.get("semanticAppearance", ""))
		if appearance != "":
			return appearance
		return "unidentified " + str(TileResolver.CLASS_NAMES.get(str(c.get("char", "")), "object"))
	var name := str(c.get("semanticName", ""))
	return name if name != "" else "something"


static func terrain_name(c: Dictionary) -> String:
	var name := str(c.get("semanticName", ""))
	if name == "" or name == "stone":
		name = str(c.get("backgroundSemanticName", ""))
	match name:
		"dark part of a room":
			return "floor"
		"floor of a room":
			return "floor"
	return name if name != "" else "unknown"


## What the hero stands on ("floor", "a fountain", "doorway"), from the
## map: NetHack's own terrain status field isn't sent in this setup.
static func ground_under_hero(state: GameState) -> String:
	var c := state.map.cell(state.map.hero)
	var feature := str(c.get("featureDescription", ""))
	if feature != "":
		return feature
	var ground := str(c.get("backgroundSemanticName", ""))
	match ground:
		"", "stone":
			return ""
		"dark part of a room", "floor of a room":
			return "floor"
	return ground


## Player-facing verbs for a right-click on this cell.
static func action_labels(state: GameState, cell: Vector2i) -> Array[String]:
	var labels: Array[String] = []
	for action in CellActions.for_cell(state, cell):
		labels.append(action.label)
	return labels
