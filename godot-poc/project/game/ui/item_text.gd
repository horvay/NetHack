class_name ItemText
extends RefCounted
## Presentation helpers for items from inventory snapshots and menu entries:
## clean names, colors by known blessed/cursed status, and art.

const BLESSED := Color("8fd0ff")
const CURSED := Color("ff7a6b")


static func display_name(item: Dictionary) -> String:
	var text := str(item.get("text", item.get("semanticName", "")))
	# Inventory text arrives as "a - a +1 spear (weapon in right hand)".
	var prefix := RegEx.create_from_string("^.\\s-\\s").search(text)
	if prefix:
		text = text.substr(prefix.get_end())
	return text


## First letter upper-cased, everything else untouched. (String.capitalize
## title-cases every word and eats underscores: "potion of see invisible"
## would become "Potion Of See Invisible".)
static func sentence(text: String) -> String:
	return text.substr(0, 1).to_upper() + text.substr(1) if text != "" else text


## A shop price shown in the item's text, or 0: "(unpaid, 5 zorkmids)",
## "(for sale, 5 zorkmids)" or a pay menu's "  5 Zm, a food ration".
static func price(item: Dictionary) -> int:
	var text := str(item.get("text", ""))
	var found := RegEx.create_from_string("(?:unpaid|for sale|contents),\\s*(\\d+)\\s+zorkmids?").search(text)
	if found == null:
		found = RegEx.create_from_string("^\\s*(\\d+)\\s+Zm,\\s").search(text)
	return int(found.get_string(1)) if found else 0


## Item text without a pay menu's leading price ("5 Zm, ").
static func without_price(text: String) -> String:
	var found := RegEx.create_from_string("^\\s*\\d+\\s+Zm,\\s*").search(text)
	return text.substr(found.get_end()) if found else text


## The article-free name with any trailing "(...)" state removed.
static func short_name(item: Dictionary) -> String:
	var text := display_name(item)
	var paren := text.find(" (")
	if paren > 0:
		text = text.substr(0, paren)
	for article in ["a ", "an ", "the "]:
		if text.begins_with(article):
			return text.substr(article.length())
	return text


static func state_note(item: Dictionary) -> String:
	var text := display_name(item)
	var paren := text.find(" (")
	return text.substr(paren + 2).trim_suffix(")") if paren > 0 else ""


static func beatitude(item: Dictionary) -> String:
	var known: Dictionary = item.get("knownFields", {}) if item.get("knownFields") is Dictionary else {}
	if known.has("beatitude"):
		return str(known.beatitude)
	var text := display_name(item)
	for word in ["blessed", "uncursed", "cursed"]:
		if text.contains(word + " ") or text.begins_with(word):
			return word
	return ""


static func name_color(item: Dictionary) -> Color:
	match beatitude(item):
		"blessed":
			return BLESSED
		"cursed":
			return CURSED
	var attr := int(item.get("attr", 0))
	if int(item.get("selector", 0)) == 0 and str(item.get("text", "")) != "":
		return UiTheme.GOLD if attr != 0 else UiTheme.INK_DIM
	return UiTheme.INK


const ICON_KINDS := ["object", "item", "monster", "pet", "corpse", "statue", "boulder", "trap", "hero", "player", "feature", "terrain"]


static func icon(item: Dictionary, state: GameState) -> Texture2D:
	var glyph_char := int(item.get("glyphChar", -1))
	# The bridge withholds the glyph when it would give the object away (an
	# unidentified gray stone: luckstone, loadstone, touchstone and flint
	# each have their own); the class and appearance still say what it looks
	# like.
	var withheld := not item.has("glyph") and glyph_char > 32 and glyph_char < 128 and str(item.get("semanticKind", "")) == "object"
	if not withheld and (not item.has("glyph") or int(item.get("glyph", -1)) < 0):
		return null
	# Menu headers and category rows carry a "nothing" glyph: no art.
	if not ICON_KINDS.has(str(item.get("semanticKind", "")).to_lower()):
		return null
	var cell := {
		"char": char(glyph_char) if glyph_char > 0 and glyph_char < 128 else " ",
		"glyph": int(item.get("glyph", -1)),
		"semanticKind": item.get("semanticKind", "object"),
		"semanticName": item.get("semanticName", ""),
		"semanticKnown": item.get("semanticKnown", true),
		"semanticAppearance": item.get("semanticAppearance", ""),
	}
	if item.has("cmapIndex"):
		cell["cmapIndex"] = item.cmapIndex
	var resolver := TileResolver.shared()
	var id := resolver.asset_for_cell(cell, state.character if state else {})
	if id == "unexplored-stone":
		return null
	return resolver.texture(id)


## Where an item is on the hero, from NetHack's worn bits (and its own words
## for things in use without a slot): {tag: a few letters for the tile,
## where: a sentence for the detail panel, order: head-to-toe position}.
## Empty for things just carried.
const PLACES := [
	[0x4, "Helmet", "Worn on your head", 0],
	[0x80000, "Eyes", "Worn over your eyes", 1],
	[0x10000, "Amulet", "Worn around your neck", 2],
	[0x2, "Cloak", "Worn as your cloak", 3],
	[0x1, "Body", "Worn as body armor", 4],
	[0x40, "Shirt", "Worn as your shirt, under your armor", 5],
	[0x10, "Gloves", "Worn on your hands", 6],
	[0x20000, "Left ring", "Worn on your left hand", 7],
	[0x40000, "Right ring", "Worn on your right hand", 8],
	[0x100, "Main hand", "Wielded in your hand", 9],
	[0x8, "Shield", "Worn on your arm as a shield", 10],
	[0x400, "Alternate", "Your alternate weapon (x swaps it in)", 11],
	[0x200, "Quiver", "Ready in your quiver for firing or throwing", 12],
	[0x20, "Boots", "Worn on your feet", 13],
	[0x100000, "Saddle", "On your steed", 14],
]


static func equip_place(item: Dictionary) -> Dictionary:
	var mask := int(item.get("wornMask", 0))
	var note := state_note(item).to_lower()
	for place in PLACES:
		if mask & int(place[0]):
			var tag: String = place[1]
			var where: String = place[2]
			match tag:
				"Main hand":
					if EquipmentScreen.is_two_handed(item):
						tag = "Both hands"
						where = "Wielded in both hands"
					elif note.contains("tethered"):
						where = "Wielded, tethered to your hand"
				"Alternate":
					if note.contains("wielded in"):
						# Two-weapon fighting: the alternate is in the other hand.
						tag = "Off hand"
						where = "Wielded in your other hand (two-weapon fighting)"
				"Body":
					if note.contains("embedded"):
						where = "Embedded in your skin"
				"Quiver":
					if note.contains("at the ready"):
						where = "At the ready in your quiver"
			return {"tag": tag, "where": where, "order": int(place[3])}
	# In use without a slot.
	if RegEx.create_from_string("\\blit\\b").search(note) != null:
		return {"tag": "Lit", "where": "Lit and giving light", "order": 20}
	if note.contains("in use"):
		return {"tag": "In use", "where": "In use (%s)" % note, "order": 21}
	if note.contains("chained") or note.contains("attached"):
		return {"tag": "Chained", "where": sentence(note), "order": 22}
	return {}


## The known enchantment ("+2", "-1"; charges for wands and charged tools
## as "4 charges"), or "" when the hero doesn't know it.
static func known_bonus(item: Dictionary) -> Dictionary:
	var known: Dictionary = item.get("knownFields", {}) if item.get("knownFields") is Dictionary else {}
	if known.has("enchantment"):
		var e := int(known.enchantment)
		return {"text": ("+%d" % e) if e >= 0 else ("−%d" % -e), "value": e, "kind": "enchantment"}
	if known.has("charges"):
		return {"text": "(%d)" % int(known.charges), "value": int(known.charges), "kind": "charges"}
	# Older events without knownFields: NetHack's own "+2 long sword".
	var m := RegEx.create_from_string("^(?:an? |\\d+ )?(?:(?:un)?cursed |blessed )?(?:rustproof |fixed |greased )*([+-]\\d+) ").search(display_name(item))
	if m:
		var v := int(m.get_string(1))
		return {"text": ("+%d" % v) if v >= 0 else ("−%d" % -v), "value": v, "kind": "enchantment"}
	return {}


static func is_worn(item: Dictionary) -> bool:
	return int(item.get("wornMask", 0)) != 0


## Worn armor and accessories (NetHack won't stash those); wielded,
## alternate and quivered things it will.
const WORN_GEAR_MASK := 0x1 | 0x2 | 0x4 | 0x8 | 0x10 | 0x20 | 0x40 | 0x10000 | 0x20000 | 0x40000 | 0x80000


static func is_worn_gear(item: Dictionary) -> bool:
	return int(item.get("wornMask", 0)) & WORN_GEAR_MASK != 0
