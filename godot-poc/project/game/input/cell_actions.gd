class_name CellActions
extends RefCounted
## What the hero can do with a map cell, as NetHack key sequences. Every
## action is a real classic command (the same keys a veteran would type), so
## NetHack stays the authority on whether it works.

const DIRECTION_KEYS := {
	Vector2i(-1, 0): "h", Vector2i(1, 0): "l", Vector2i(0, -1): "k", Vector2i(0, 1): "j",
	Vector2i(-1, -1): "y", Vector2i(1, -1): "u", Vector2i(-1, 1): "b", Vector2i(1, 1): "n",
}
const UNLOCK_TOOLS := ["skeleton key", "key", "lock pick", "credit card"]


static func direction_key(delta: Vector2i) -> String:
	return DIRECTION_KEYS.get(delta, "")


## Each action: {id, label, keys, primary(bool)}.
static func for_cell(state: GameState, cell: Vector2i) -> Array[Dictionary]:
	var actions: Array[Dictionary] = []
	var c := state.map.cell(cell)
	if c.is_empty():
		return actions
	var hero := state.map.hero
	var delta := cell - hero
	var adjacent := absi(delta.x) <= 1 and absi(delta.y) <= 1 and delta != Vector2i.ZERO
	var dir := state.direction_key(delta)
	var tags: Array = []
	# On the hero's square the object layer is only as fresh as NetHack's
	# last redraw of it (none after a drop, eating floor food, a corpse
	# rotting away); the pile snapshot there is always current.
	var on_hero := delta == Vector2i.ZERO
	for list_key in ["actionAffordances", "backgroundActionAffordances"] + ([] if on_hero else ["objectLayerActionAffordances"]):
		for tag in c.get(list_key, []):
			tags.append(str(tag))
	if on_hero:
		for item in state.map.pile(cell):
			for tag in item.get("actionAffordances", []):
				tags.append(str(tag))
	var has := func(tag: String) -> bool: return tags.has(tag)
	var actor := str(c.get("actorId", ""))
	var info := Terrain.classify(c)

	if delta == Vector2i.ZERO:
		var pile := state.map.pile(cell)
		if Terrain.STAIRS.has(info.cmap):
			var down: bool = info.cmap in [26, 28, 30, 32]
			var ladder: bool = info.cmap in [27, 28, 31, 32]
			if not down and state.map.depth <= 1 and state.map.dnum == 0:
				# Climbing out of level 1 ends the run: never the easy default.
				var leave := _act("stairs", "Leave the dungeon (ends the run)", "<", false)
				leave["danger"] = "serious"
				actions.append(leave)
			else:
				var noun := "ladder" if ladder else "stairs"
				actions.append(_act("stairs", ("Go down the " if down else "Go up the ") + noun, ">" if down else "<", true))
		if not pile.is_empty():
			# Several known stacks open the floor-and-pack screen; one goes up
			# at once with NetHack's own , (which asks nothing for one item).
			if pile.size() >= 2 and cell == state.map.hero:
				actions.append(_act("pickup", "Pick up…", "", true))
			else:
				actions.append(_act("pickup", "Pick up", ",", true))
		var container: bool = has.call("container") or has.call("box") or has.call("chest") or has.call("bag") or has.call("sack")
		for item in pile:
			for word in ["box", "chest", "bag", "sack"]:
				if str(item.get("displayName", "")).contains(word):
					container = true
		if container:
			actions.append(_act("loot", "Open container", "#loot\n", true))
			actions.append(_act("force", "Force its lock", "#force\n", false))
			actions.append(_act("untrap-here", "Check it for traps", "#untrap\n", false))
			actions.append(_act("tip", "Tip it out", "#tip\n", false))
		for item in pile:
			if str(item.get("publicClass", "")) == "food" or str(item.get("objectClass", "")) == "%":
				var eat := _act("eat-floor", "Eat from the floor", "e", false)
				eat["danger"] = "caution"
				actions.append(eat)
				break
		if info.cmap == 35:
			actions.append(_act("sit", "Sit on the throne", "#sit\n", false))
		if has.call("fixture.fountain"):
			actions.append(_act("quaff-fountain", "Drink from fountain", "q", false))
			actions.append(_act("dip-fountain", "Dip into fountain", "#dip\n", false))
		if has.call("fixture.sink"):
			actions.append(_act("quaff-sink", "Drink from sink", "q", false))
		if has.call("fixture.altar") or info.cmap == 33:
			actions.append(_act("drop-altar", "Drop items to learn if they are blessed", "D", false))
			actions.append(_act("offer", "Offer a sacrifice", "#offer\n", false))
			var pray := _act("pray", "Pray", "#pray\n", false)
			pray["danger"] = "caution"
			actions.append(pray)
		if info.kind in [Terrain.Kind.FLOOR, Terrain.Kind.CORRIDOR]:
			actions.append(_act("engrave", "Engrave here", "E", false))
		if str(c.get("engravingText", "")) != "" or info.cmap in [21, 24]:
			actions.append(_act("read-here", "Read the engraving", ":", false))
		actions.append(_act("look-here", "Look here", ":", false))
		actions.append(_act("search", "Search around", "s", false))
		var rest := _act("rest", "Rest a while", state.count_prefix(20) + "s", false)
		actions.append(rest)
		return actions

	if adjacent and dir != "":
		if actor != "" and actor != "hero":
			if has.call("monster.pet") or has.call("pet") or has.call("monster.attitude.tame"):
				actions.append(_act("swap", "Swap places", dir, true))
				actions.append(_dir_act("chat", "Chat", "#chat\n", dir, false))
			elif has.call("monster.attitude.peaceful") or has.call("monster.shopkeeper"):
				if has.call("monster.shopkeeper") and _has_unpaid(state):
					var owed := _bill_total(state)
					actions.append(_act("pay", "Pay the shopkeeper" + (" (%d zm)" % owed if owed > 0 else ""), "p", true))
				actions.append(_dir_act("chat", "Chat", "#chat\n", dir, not has.call("monster.shopkeeper") or not _has_unpaid(state)))
				var attack := _act("attack", "Attack", "F" + dir, false)
				attack["danger"] = "serious"
				actions.append(attack)
			else:
				actions.append(_act("attack", "Attack", "F" + dir, true))
				actions.append(_dir_act("chat", "Chat", "#chat\n", dir, false))
		if has.call("door.closed") or info.kind == Terrain.Kind.DOOR_CLOSED:
			actions.append(_dir_act("open", "Open door", "o", dir, true))
			var tool := _unlock_tool(state)
			if not tool.is_empty():
				actions.append(_dir_act("unlock", "Unlock with " + str(tool.name), "a" + str(tool.letter), dir, false))
			actions.append(_dir_act("kick", "Kick door", char(4), dir, false))
		elif has.call("door.open") or info.kind == Terrain.Kind.DOOR_OPEN:
			actions.append(_dir_act("close", "Close door", "c", dir, false))
		if has.call("trap.known"):
			actions.append(_dir_act("untrap", "Disarm trap", "#untrap\n", dir, false))
		# Things worth a kick: a sink, a boulder, a box or chest.
		var kickable := ""
		if has.call("fixture.sink"):
			kickable = "Kick the sink"
		elif str(c.get("semanticName", "")).contains("boulder"):
			kickable = "Kick the boulder"
		else:
			for item in state.map.pile(cell):
				var name := str(item.get("displayName", "")).to_lower()
				if name.contains("box") or name.contains("chest"):
					kickable = "Kick the %s" % ("chest" if name.contains("chest") else "box")
		if kickable == "" and not actions.any(func(a: Dictionary) -> bool: return a.id == "kick"):
			# Kick toward any neighbouring square (Electron's "Kick toward
			# cell"): NetHack's ^D decides what happens there.
			kickable = "Kick" if actor == "" else "Kick it"
		if kickable != "":
			var kick := _dir_act("kick", kickable, char(4), dir, false)
			if actor != "" and actor != "hero" and (has.call("monster.attitude.peaceful") or has.call("monster.pet") or has.call("monster.shopkeeper") or has.call("pet")):
				kick["danger"] = "serious"
			elif kickable == "Kick":
				# Walls and rock hurt; kicking empty air can strain a muscle
				# (src/dokick.c).
				kick["danger"] = "caution"
			actions.append(kick)
		if actor == "" and Terrain.is_walkable(info.kind):
			actions.append(_act("step", "Step here", dir, actions.is_empty()))
	if not adjacent:
		actions.append(_act("travel", "Travel here", "", actions.is_empty()))
	actions.append(_act("look", "Look closely", "", false))
	return actions


static func _act(id: String, label: String, keys: String, primary: bool) -> Dictionary:
	return {"id": id, "label": label, "keys": keys, "primary": primary}


## A command that asks "In what direction?": the direction is sent only
## once NetHack asks (it can refuse first, and a typed-ahead direction would
## then move the hero). keys stays the full classic sequence for display.
static func _dir_act(id: String, label: String, command: String, dir: String, primary: bool) -> Dictionary:
	return {"id": id, "label": label, "keys": command + dir, "command": command, "dir": dir, "primary": primary}


## What the hero's unpaid items cost, from the prices NetHack shows.
static func _bill_total(state: GameState) -> int:
	var total := 0
	for item in state.inventory:
		if ItemText.display_name(item).contains("unpaid"):
			total += ItemText.price(item)
	return total


static func _has_unpaid(state: GameState) -> bool:
	for item in state.inventory:
		var ownership: Variant = item.get("ownership", {})
		if ownership is Dictionary and str(ownership.get("state", "")) == "unpaid":
			return true
		if ItemText.display_name(item).contains("unpaid"):
			return true
	return false


## The single most useful thing to do toward each neighbouring cell
## (open a door, unlock, disarm, pay, chat): shown in the action bar.
static func neighbour_actions(state: GameState) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var arrows := {Vector2i(-1, 0): "←", Vector2i(1, 0): "→", Vector2i(0, -1): "↑", Vector2i(0, 1): "↓",
		Vector2i(-1, -1): "↖", Vector2i(1, -1): "↗", Vector2i(-1, 1): "↙", Vector2i(1, 1): "↘"}
	for delta in arrows:
		var cell: Vector2i = state.map.hero + delta
		for action in for_cell(state, cell):
			if str(action.id) in ["open", "unlock", "untrap", "pay", "chat", "close"] and (action.primary or action.id in ["unlock", "pay"]):
				var copy: Dictionary = action.duplicate()
				copy["label"] = "%s %s" % [action.label, arrows[delta]]
				result.append(copy)
				break
	return result



static func _unlock_tool(state: GameState) -> Dictionary:
	for item in state.inventory:
		var name := str(item.get("semanticName", item.get("text", ""))).to_lower()
		for tool in UNLOCK_TOOLS:
			if name == tool or name.ends_with(" " + tool):
				return {"name": tool, "letter": char(int(item.get("selector", 0)))}
	return {}
