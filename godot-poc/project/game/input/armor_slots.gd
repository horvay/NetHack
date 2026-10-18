class_name ArmorSlots
extends RefCounted
## Which equipment slot a piece of armor occupies, from the bridge's
## equipmentSlots list, falling back to the item's public name.

const WORDS := [
	["armor.cloak", ["cloak", "robe", "cape", "mantle", "apron", "smock", "poncho"]],
	["armor.helm", ["helm", "helmet", "hat", "cap", "cornuthaum", "fedora", "crown"]],
	["armor.gloves", ["gloves", "gauntlets"]],
	["armor.boots", ["boots", "shoes", "sandals"]],
	["armor.shield", ["shield", "buckler"]],
	["armor.shirt", ["shirt", "t-shirt"]],
]


static func slot_for(item: Dictionary) -> String:
	for slot in item.get("equipmentSlots", []):
		if str(slot).begins_with("armor."):
			return str(slot)
	var text := ItemText.display_name(item).to_lower()
	for entry in WORDS:
		for word in entry[1]:
			if text.contains(word):
				return entry[0]
	return "armor.body"
