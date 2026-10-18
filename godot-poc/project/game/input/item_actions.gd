class_name ItemActions
extends RefCounted
## What the hero can do with an inventory item, as classic NetHack keys
## (command letter + the item's letter). The first action is the primary
## one (double-click / Enter). NetHack still decides whether it works.
##
## Each action: {id, label, keys, danger ("", "caution", "serious"),
## needs_count (bool), equipment (Dictionary for a typed equipment-change)}.

const RING_SLOTS := ["ring.left", "ring.right"]


static func for_item(item: Dictionary, state: GameState) -> Array[Dictionary]:
	var actions: Array[Dictionary] = []
	var sel := char(int(item.get("selector", 0)))
	var tokens: Array = item.get("actionAffordances", [])
	var cls := str(item.get("publicClass", "other"))
	var text := ItemText.display_name(item).to_lower()
	var worn := ItemText.is_worn(item)
	var note := ItemText.state_note(item).to_lower()
	var has := func(token: String) -> bool: return tokens.has(token)
	var mask := int(item.get("wornMask", 0))
	var add := func(id: String, label: String, keys: String, danger := "", extra := {}) -> void:
		# Once equipped, an item keeps its uses (a wielded lamp is still
		# applied and rubbed, a worn T-shirt read), minus putting it where
		# it already is; and no action twice.
		if worn and id in ["wield", "wear", "puton"]:
			return
		if mask & 0x200 and id == "quiver":
			return
		if actions.any(func(a: Dictionary) -> bool: return a.id == id):
			return
		var action := {"id": id, "label": label, "keys": keys, "danger": danger}
		action.merge(extra)
		actions.append(action)

	if worn:
		if mask & 0x200:
			add.call("fire", "Fire", "f")
			add.call("unquiver", "Empty quiver", "Q-")
		elif mask & 0x400:
			add.call("swap", "Swap to this weapon", "x")
			add.call("throw", "Throw…", "t" + sel)
		elif mask & 0x100:
			# Enter must never disarm the hero: swapping (when there is an
			# alternate) or a cancellable throw come first, putting away last.
			var has_alternate := state != null and state.inventory.any(func(i: Dictionary) -> bool: return int(i.get("wornMask", 0)) & 0x400)
			if has_alternate:
				add.call("swap", "Swap with alternate weapon", "x")
			add.call("throw", "Throw…", "t" + sel)
			add.call("unwield", "Put away (bare hands)", "w-")
		elif cls in ["ring", "amulet"] or text.contains("blindfold") or text.contains("lenses") or text.contains("towel"):
			add.call("remove", "Remove", "R" + sel)
		else:
			add.call("takeoff", "Take off", "T" + sel)
	# What the item does, equipped or not.
	match cls:
		"weapon":
			add.call("wield", "Wield", "w" + sel)
			if _is_missile(text):
				add.call("quiver", "Ready in quiver", "Q" + sel)
			add.call("throw", "Throw…", "t" + sel)
		"armor":
			add.call("wear", "Wear", "W" + sel, "", {"equipment": {"action": "wearArmor"}})
		"food":
			add.call("eat", "Open and eat" if text.contains("tin") else "Eat", "e" + sel, "caution" if _risky_food(text) else "")
		"potion":
			add.call("quaff", "Drink", "q" + sel)
			add.call("throw", "Throw…", "t" + sel)
			add.call("dip", "Dip it into…", "#dip\n" + sel)
		"scroll":
			add.call("read", "Read", "r" + sel)
		"spellbook":
			add.call("study", "Study", "r" + sel)
		"wand":
			add.call("zap", "Zap…", "z" + sel)
			add.call("engrave", "Engrave with it", "E" + sel)
		"ring":
			add.call("puton", "Put on", "P" + sel)
		"amulet":
			add.call("puton", "Put on", "P" + sel)
		"tool":
			add.call("apply", _apply_label(text), "a" + sel)
			if text.contains("blindfold") or text.contains("lenses") or text.contains("towel"):
				add.call("puton", "Put on", "P" + sel)
			if _is_rubbable(text):
				add.call("rub", "Rub", "#rub\n" + sel, "caution" if text.contains("stone") else "")
		"gem":
			add.call("quiver", "Ready in quiver (sling ammo)", "Q" + sel)
			add.call("throw", "Throw…", "t" + sel)
			if _is_rubbable(text):
				add.call("rub", "Rub", "#rub\n" + sel, "caution")
		"coin":
			add.call("flip", "Flip a coin", "a" + sel)
	if has.call("apply") and not actions.any(func(a: Dictionary) -> bool: return a.id == "apply"):
		add.call("apply", _apply_label(text), "a" + sel)
	if (has.call("read") or text.contains("t-shirt") or text.contains("hawaiian shirt") or text.contains("apron")) and not actions.any(func(a: Dictionary) -> bool: return a.id in ["read", "study"]):
		add.call("read", "Read", "r" + sel)
	if has.call("wield") and cls != "weapon":
		add.call("wield", "Hold in hands", "w" + sel)
	if text.contains("unpaid") or text.contains("for sale"):
		actions.push_front({"id": "pay", "label": "Pay for it", "keys": "p", "danger": ""})
	if _is_invokable(text):
		add.call("invoke", "Invoke its power", "V" + sel, "caution")
	if state and _on_altar(state) and (cls == "food" and text.contains("corpse") or text.contains("amulet of yendor")):
		add.call("offer", "Offer on the altar", "#offer\n" + sel, "caution")
	# Weapons in hand or quiver can be dropped too; worn armor can't.
	if not worn or int(item.get("wornMask", 0)) & (0x100 | 0x200 | 0x400):
		var quantity := int(item.get("quantity", 1))
		add.call("drop", "Drop", "d" + sel, "", {"needs_count": quantity > 1, "quantity": quantity})
	if cls == "wand":
		add.call("break", "Break it (dangerous)", "a" + sel, "serious")
	# Engraving works with blades, rings, gems and tools too (scratching).
	if cls in ["weapon", "ring", "gem", "tool"] and not worn:
		add.call("engrave", "Engrave with it…", "E" + sel)
	add.call("lookup", "Look it up", "/", "", {"answers": ["i", sel]})
	add.call("name", "Name this item…", "#name\ni" + sel)
	add.call("call", "Call this kind of item…", "#name\no" + sel)
	add.call("adjust", "Move to another letter…", "#adjust\n" + sel)
	# A wielded tool (a lamp, a pick-axe) is in hand to be used: its use is
	# the primary action, not throwing it.
	if mask & 0x100 and cls != "weapon":
		for i in actions.size():
			if actions[i].id == "apply":
				actions.push_front(actions.pop_at(i))
				break
	return actions


static func primary(item: Dictionary, state: GameState) -> Dictionary:
	var actions := for_item(item, state)
	return actions[0] if not actions.is_empty() else {}


static func _is_missile(text: String) -> bool:
	for word in ["arrow", "dart", "dagger", "knife", "shuriken", "spear", "javelin", "bolt", "rock", "boomerang", "pebble"]:
		if text.contains(word):
			return true
	return false


static func _risky_food(text: String) -> bool:
	return text.contains("corpse") or text.contains("egg") or text.contains("glob")


static func _is_rubbable(text: String) -> bool:
	for word in ["lamp", "lantern", "gray stone", "grey stone", "luckstone", "loadstone", "touchstone", "flint"]:
		if text.contains(word):
			return true
	return false


static func _is_invokable(text: String) -> bool:
	for word in ["amulet of yendor", "crystal ball", "bell of opening", "candelabrum", "book of the dead", "orb of", "eye of the aethiopica", "sceptre of might", "mitre of holiness", "magic mirror", "platinum yendorian", "master key", "eyes of the overworld", "heart of ahriman", "longbow of diana", "tsurugi of muramasa", "staff of aesculapius"]:
		if text.contains(word):
			return true
	return false


static func _apply_label(text: String) -> String:
	var table := [
		["coin", "Flip it"], ["cream pie", "Smear on your face"], ["bullwhip", "Lash"], ["grappling hook", "Grapple"],
		["bag", "Open"], ["sack", "Open"], ["box", "Open"], ["chest", "Open"], ["key", "Unlock / lock"],
		["lock pick", "Pick a lock"], ["credit card", "Pick a lock"], ["tinning kit", "Tin a corpse"],
		["whistle", "Blow"], ["stethoscope", "Listen"], ["mirror", "Look into"], ["candle", "Light / snuff"],
		["lamp", "Light / snuff"], ["lantern", "Light / snuff"], ["camera", "Take a photo"], ["towel", "Wipe yourself"],
		["crystal ball", "Peer into"], ["magic marker", "Write with"], ["figurine", "Set down"], ["unicorn horn", "Use the horn"],
		["horn", "Play"], ["flute", "Play"], ["harp", "Play"], ["drum", "Play"], ["bugle", "Play"], ["bear trap", "Set the trap"],
		["land mine", "Set the trap"], ["pick-axe", "Dig"], ["mattock", "Dig"], ["saddle", "Saddle a steed"], ["leash", "Leash a pet"],
		["blindfold", "Put on / remove"], ["oil", "Light / snuff"], ["bell", "Ring"],
	]
	for pair in table:
		if text.contains(pair[0]):
			return pair[1]
	return "Use"


static func _on_altar(state: GameState) -> bool:
	var info := Terrain.classify(state.map.cell(state.map.hero))
	return info.cmap == 33
