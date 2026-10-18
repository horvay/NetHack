class_name TileResolver
extends RefCounted
## Maps a map cell (a shim_print_glyph event) to tile art ids.
##
## Port of electron-poc/src/shared/tile-assets.js mappedAssetIdForCell and
## baseTileIdForCell, including its no-spoiler rules: an unidentified object
## (semanticKnown == false) only ever resolves through its public appearance
## or class icon, never through hidden identity art.

const TILES_JSON := "res://assets/tiles/tiles.json"
const TILE_DIR := "res://assets/tiles/"

const SEMANTIC_ALIASES := {
	"arrow trap": "arrow-trap", "engraving in a room": "engraving", "engraving in a corridor": "engraving",
	"engraving": "engraving", "food": "food-ration", "gold piece": "coin-pile", "gold pieces": "coin-pile",
	"crude ring mail": "orcish-ring-mail", "crude dagger": "orcish-dagger",
}
const PET_ALIASES := {
	"little dog": "little-dog-pet", "dog": "dog", "large dog": "large-dog", "kitten": "kitten-pet", "pony": "pony-pet",
}
const SPELLBOOK_APPEARANCES := [
	"parchment", "vellum", "ragged", "dog-eared", "mottled", "stained", "cloth", "leathery", "white", "pink", "red", "orange",
	"yellow", "velvet", "light-green", "dark-green", "turquoise", "cyan", "light-blue", "dark-blue", "indigo", "magenta",
	"purple", "violet", "tan", "plaid", "light-brown", "dark-brown", "gray", "wrinkled", "dusty", "bronze", "copper",
	"silver", "gold", "glittering", "shining", "dull", "thin", "thick", "checkered", "plain", "paperback", "papyrus",
]
const ROLE_CODES := {
	"Arc": "archeologist", "Bar": "barbarian", "Cav": "caveman", "Hea": "healer", "Kni": "knight", "Mon": "monk",
	"Pri": "priest", "Ran": "ranger", "Rog": "rogue", "Sam": "samurai", "Tou": "tourist", "Val": "valkyrie", "Wiz": "wizard",
}
const RACE_CODES := {"Hum": "human", "Dwa": "dwarf", "Elf": "elf", "Gno": "gnome", "Orc": "orc"}
const GENDER_CODES := {"Mal": "male", "Fem": "female"}
const ROLE_NAME_ALIASES := {
	"arc": "archeologist", "archeologist": "archeologist", "archaeologist": "archeologist",
	"bar": "barbarian", "barbarian": "barbarian", "cav": "caveman", "caveman": "caveman", "cavewoman": "cavewoman",
	"hea": "healer", "healer": "healer", "kni": "knight", "knight": "knight", "mon": "monk", "monk": "monk",
	"pri": "priest", "priest": "priest", "priestess": "priestess", "ran": "ranger", "ranger": "ranger",
	"rog": "rogue", "rogue": "rogue", "sam": "samurai", "samurai": "samurai", "tou": "tourist", "tourist": "tourist",
	"val": "valkyrie", "valkyrie": "valkyrie", "wiz": "wizard", "wizard": "wizard",
}
## NetHack's gem appearances (objects.h, GEM_CLASS descriptions).
const GEM_COLOURS := ["white", "red", "orange", "yellow", "yellowish brown", "green", "blue", "violet", "black"]
const APPEARANCE_CLASS_NOUNS := {"+": "spellbook", "/": "wand", "!": "potion", "=": "ring", "\"": "amulet", "*": "gem"}
const CLASS_NAMES := {
	"+": "spellbook", "/": "wand", "!": "potion", "=": "ring", "\"": "amulet", "*": "gem", "?": "scroll", ")": "weapon",
	"[": "armor", "(": "tool", "$": "gold", "`": "boulder", "_": "iron chain", "0": "heavy iron ball",
}
const CLASS_FALLBACK_ASSETS := {
	"+": "spellbook-class-icon", "/": "wand-class-icon", "!": "potion-class-icon", "=": "ring-class-icon",
	"\"": "amulet-class-icon", "*": "gem-class-icon", "?": "scroll-class-icon", ")": "weapon-class-icon",
	"[": "armor-class-icon", "(": "tool-class-icon", "$": "coin-pile", "`": "boulder", "_": "iron-chain", "0": "heavy-iron-ball",
}
const OVERLAY_CATEGORIES := ["traps-hazards", "player-pets-identity", "player-combo-avatars", "common-early-monsters", "objects-inventory"]

static var _shared: TileResolver

var assets: Dictionary = {}
var tile_map: Dictionary = {}
var _textures: Dictionary = {}
## asset_for_cell results by cell signature: a glyph's art never changes.
var _memo: Dictionary = {}
var _slug_regex := RegEx.create_from_string("[^a-z0-9]+")
var _scroll_label_regex := RegEx.create_from_string("^scroll\\s+labeled\\s+(.+)$")


static func shared() -> TileResolver:
	if _shared == null:
		_shared = TileResolver.new()
		_shared.load_library(TILES_JSON)
	return _shared


func load_library(path: String) -> void:
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if data is Dictionary:
		assets = data.get("assets", {})
		tile_map = data.get("tileMap", {})


func has_asset(asset_id: String) -> bool:
	return asset_id != "" and assets.has(asset_id)


func texture(asset_id: String) -> Texture2D:
	if asset_id == "" or not assets.has(asset_id):
		return null
	if not _textures.has(asset_id):
		_textures[asset_id] = load(TILE_DIR + asset_id + ".png")
	return _textures[asset_id]


func portrait(asset_id: String) -> Texture2D:
	if not assets.has(asset_id):
		return null
	var path := TILE_DIR + asset_id + (".portrait.png" if assets[asset_id].get("portrait", false) else ".png")
	return load(path)


func category(asset_id: String) -> String:
	return str(assets.get(asset_id, {}).get("category", ""))


func slugify(name: Variant) -> String:
	var text := str(name if name != null else "").to_lower()
	text = _slug_regex.sub(text, "-", true)
	return text.trim_prefix("-").trim_suffix("-")


# --- player avatars ----------------------------------------------------------------

## character: {role, race, gender} as NetHack codes ("Val") or names.
func player_parts(character: Dictionary) -> Dictionary:
	return {
		"role": _combo_part(character.get("role", ""), ROLE_CODES),
		"race": _combo_part(character.get("race", ""), RACE_CODES),
		"gender": _combo_part(character.get("gender", ""), GENDER_CODES),
	}


func _combo_part(value: Variant, codes: Dictionary) -> String:
	var raw := str(value).strip_edges()
	return codes.get(raw, slugify(raw))


func player_avatar_id(character: Dictionary) -> String:
	var parts := player_parts(character)
	if parts.role != "" and parts.race != "" and parts.gender != "":
		var combo := "%s-%s-%s-avatar" % [parts.race, parts.role, parts.gender]
		if has_asset(combo):
			return combo
	if parts.role != "":
		var candidates: Array[String] = []
		if parts.role == "caveman" and parts.gender == "female":
			candidates.append("cavewoman-role-avatar")
		if parts.role == "priest" and parts.gender == "female":
			candidates.append("priestess-role-avatar")
		candidates.append(parts.role + "-role-avatar")
		for candidate in candidates:
			if has_asset(candidate):
				return candidate
	return "hero-avatar" if has_asset("hero-avatar") else ""


func is_player_cell(cell: Dictionary) -> bool:
	if cell.get("actorId") == "hero":
		return true
	var kind := str(cell.get("semanticKind", "")).to_lower()
	if kind != "":
		return kind == "player" or kind == "hero"
	if int(cell.get("glyph", -1)) == 725:
		return true
	return _cell_char(cell) == "@" and not cell.has("glyph")


func _semantic_player_avatar(cell: Dictionary) -> String:
	var slug := slugify(cell.get("semanticName", ""))
	if slug == "" or slug == "hero" or slug == "player":
		return ""
	var role: String = ROLE_NAME_ALIASES.get(slug, slug)
	var candidates: Array[String] = []
	if role == "cavewoman":
		candidates = ["cavewoman-role-avatar", "caveman-role-avatar"]
	elif role == "priestess":
		candidates = ["priestess-role-avatar", "priest-role-avatar"]
	else:
		candidates = [role + "-role-avatar"]
	for candidate in candidates:
		if has_asset(candidate):
			return candidate
	return ""


# --- semantic lookup ---------------------------------------------------------------

func _kind_specific(kind_raw: Variant, slug: String) -> String:
	if slug == "":
		return ""
	var kind := str(kind_raw if kind_raw != null else "").to_lower()
	if assets.has(slug):
		var cat := category(slug).to_lower()
		if (kind == "object" or kind == "item") and (cat.contains("object") or cat.contains("inventory")):
			return slug
		if kind == "monster" and cat.contains("monster"):
			return slug
		if (kind == "trap" or kind == "hazard") and (cat.contains("trap") or cat.contains("hazard")):
			return slug
		if (kind == "terrain" or kind == "feature") and cat.contains("terrain"):
			return slug
	if (kind == "object" or kind == "item") and has_asset(slug + "-object"):
		return slug + "-object"
	if (kind == "trap" or kind == "hazard") and has_asset(slug + "-trap"):
		return slug + "-trap"
	return ""


func _is_safe_scroll_label_asset(asset_id: String) -> bool:
	if not assets.has(asset_id):
		return false
	var cat := category(asset_id).to_lower()
	if cat != "" and not (cat.contains("object") or cat.contains("inventory")):
		return false
	var meta: Dictionary = assets[asset_id]
	var text := ("%s %s" % [asset_id, meta.get("name", "")]).to_lower()
	for banned in ["spellbook", "spell book", "book leather", "tool", "gadget", "baton", "relic", "stone", "bone", "device",
			"talisman", "charm", "crystal", "fish", "skull", "map bundle", "gear", "weapon", "armor"]:
		if text.contains(banned):
			return false
	return text.contains("scroll") or text.contains("parchment")


func _scroll_label_asset(name: Variant) -> String:
	var found := _scroll_label_regex.search(str(name if name != null else "").to_lower())
	if found == null:
		return ""
	var label_slug := slugify(found.get_string(1))
	if _is_safe_scroll_label_asset(label_slug):
		return label_slug
	return "scroll-class-icon" if has_asset("scroll-class-icon") else ""


func asset_for_semantic_name(name: Variant, kind: Variant) -> String:
	var text := str(name if name != null else "")
	if text == "":
		return ""
	var slug := slugify(text)
	var label := _scroll_label_asset(text)
	if label != "":
		return label
	var specific := _kind_specific(kind, slug)
	if specific != "":
		return specific
	var mapped: String = str(tile_map.get("semanticName", {}).get(slug, ""))
	if mapped != "":
		return mapped
	var alias: String = SEMANTIC_ALIASES.get(text.to_lower(), "")
	if alias != "" and has_asset(alias):
		return alias
	if (kind == null or str(kind) == "") and has_asset(slug):
		return slug
	return ""


func _class_fallback(ch: String, kind_raw: Variant) -> String:
	var kind := str(kind_raw if kind_raw != null else "").to_lower()
	if kind != "" and kind != "object" and kind != "item":
		return ""
	var id: String = CLASS_FALLBACK_ASSETS.get(ch, "")
	return id if has_asset(id) else ""


func _is_object_kind(kind_raw: Variant) -> bool:
	var kind := str(kind_raw if kind_raw != null else "").to_lower()
	return kind == "" or kind == "object" or kind == "item"


func _append_class_noun(appearance: String, noun: String) -> String:
	var text := appearance.strip_edges()
	if text == "" or noun == "":
		return text
	var lower := text.to_lower()
	if noun == "spellbook":
		if lower.contains("spellbook") or lower.contains("spell book") or lower.contains("book"):
			return text
	elif (" " + lower + " ").contains(" " + noun + " "):
		return text
	return text + " " + noun


func _is_spellbook_appearance(name: String, cell: Dictionary) -> bool:
	var text := name.strip_edges()
	if text == "" or not _is_object_kind(cell.get("semanticKind", "")):
		return false
	var ch := _cell_char(cell)
	if ch != "" and ch != "+":
		return false
	var lower := text.to_lower()
	if lower.contains("spellbook") or lower.contains("spell book") or lower.contains("book"):
		return true
	return SPELLBOOK_APPEARANCES.has(slugify(text))


func _appearance_subclass(name: String, kind: Variant, cell: Dictionary) -> String:
	if not _is_object_kind(kind):
		return ""
	var ch := _cell_char(cell)
	var no_class := ch == "" or ch == " "
	var text := " " + name.to_lower() + " "
	var has := func(id: String) -> String: return id if has_asset(id) else ""
	var words := func(list: Array) -> bool:
		for word in list:
			if RegEx.create_from_string("\\b" + word + "\\b").search(text) != null:
				return true
		return false
	if ch == "[" or no_class:
		if words.call(["helmet", "helm", "hat", "cap"]): return has.call("helmet")
		if words.call(["shield", "roundshield", "buckler"]): return has.call("shield")
		if words.call(["gloves?", "gauntlets?"]): return has.call("gloves")
		if words.call(["boots?", "shoes?", "jackboots?"]): return has.call("boots")
		if words.call(["cloak", "cape", "pall", "mantelet", "cope", "smock", "apron", "cloth"]): return has.call("cloak")
		if text.contains("ring mail"):
			var id: String = has.call("ring-mail")
			return id if id != "" else has.call("armor-class-icon")
		if text.contains("chain mail"):
			var id: String = has.call("chain-mail")
			return id if id != "" else has.call("armor-class-icon")
		if words.call(["mail", "armor", "armour", "plate", "scales?", "coat", "jacket", "shirt"]): return has.call("armor-class-icon")
	if ch == ")" or no_class:
		if words.call(["dagger", "knife", "sword", "saber", "axe", "mace", "club", "bow", "arrow", "spear", "lance", "staff",
				"polearm", "flail", "hammer", "crossbow", "dart", "shuriken", "boomerang"]):
			return has.call("weapon-class-icon")
	if ch == "(" or no_class:
		if words.call(["lamp", "lantern", "key", "pick", "bag", "box", "chest", "sack", "whistle", "horn", "flute", "harp",
				"marker", "candle", "mirror", "towel", "blindfold", "tool"]):
			return has.call("tool-class-icon")
	return ""


func _public_appearance_asset(name: String, kind: Variant, cell: Dictionary) -> String:
	if not _is_object_kind(kind):
		return ""
	# Luckstone, loadstone, touchstone and flint all look like "a gray stone"
	# until identified: a dull rock, not the sparkly gem icon.
	if _cell_char(cell) == "*" and name.strip_edges().to_lower() in ["gray", "gray stone", "grey", "grey stone"] and has_asset("gray-stone"):
		return "gray-stone"
	# An unidentified gem looks like its colour ("green gem": an emerald or
	# green glass alike). The coloured glass tiles are plain cut gems in
	# each of NetHack's gem colours.
	if _cell_char(cell) == "*":
		var colour := name.strip_edges().to_lower().trim_suffix(" gem").trim_suffix(" gems")
		var gem_art := "worthless-piece-of-%s-glass" % colour.replace(" ", "-")
		if colour in GEM_COLOURS and has_asset(gem_art):
			return gem_art
	var noun: String = APPEARANCE_CLASS_NOUNS.get(_cell_char(cell), "")
	var visible_name := _append_class_noun(name, noun) if noun != "" else name.strip_edges()
	var semantic_id := asset_for_semantic_name(visible_name if visible_name != "" else name, kind)
	if semantic_id != "":
		var cat := category(semantic_id).to_lower()
		if cat.contains("object") or cat.contains("inventory"):
			return semantic_id
	return _appearance_subclass(visible_name if visible_name != "" else name, kind, cell)


func _appearance_class_fallback(name: String, kind_raw: Variant, cell: Dictionary) -> String:
	var kind := str(kind_raw if kind_raw != null else "").to_lower()
	if kind == "object" and name.to_lower().begins_with("scroll labeled ") and has_asset("scroll-class-icon"):
		return "scroll-class-icon"
	if (kind == "object" or kind == "item") and _is_spellbook_appearance(name, cell) and has_asset("spellbook-class-icon"):
		return "spellbook-class-icon"
	return _class_fallback(_cell_char(cell), kind_raw)


func _corpse_or_statue_subject(cell: Dictionary) -> String:
	var kind := str(cell.get("semanticKind", "")).to_lower()
	var name := str(cell.get("semanticName", "")).strip_edges()
	if name == "" or (kind != "corpse" and kind != "statue"):
		return ""
	var word := kind
	var re := RegEx.create_from_string("^" + word + "\\s+of\\s+(?:an?\\s+|the\\s+)?")
	var stripped := re.sub(name, "", false)
	stripped = stripped.trim_suffix(" " + word).strip_edges()
	return stripped if stripped != "" else name


func _cell_char(cell: Dictionary) -> String:
	return str(cell.get("char", " "))


## Main art for a cell (monster, object, terrain or hero). "" means draw nothing.
func asset_for_cell(cell: Dictionary, character: Dictionary = {}) -> String:
	var key := "%s|%s|%s|%s|%s|%s|%s|%s|%s|%s" % [cell.get("glyph", ""), cell.get("char", ""), cell.get("semanticKind", ""),
		cell.get("semanticName", ""), cell.get("semanticKnown", ""), cell.get("semanticAppearance", ""), cell.get("cmapIndex", ""),
		cell.get("displayName", ""), cell.get("actorId", "") == "hero", character.get("role", "") + character.get("race", "") + character.get("gender", "")]
	var cached: Variant = _memo.get(key)
	if cached != null:
		return cached
	var result := _asset_for_cell(cell, character)
	if _memo.size() > 8192:
		_memo.clear()
	_memo[key] = result
	return result


func _asset_for_cell(cell: Dictionary, character: Dictionary) -> String:
	var ch := _cell_char(cell)
	var has_glyph := cell.has("glyph") and int(cell.get("glyph", -1)) >= 0
	if ch == " " and not has_glyph and str(cell.get("semanticKind", "")) == "" and str(cell.get("semanticName", "")) == "":
		return ""
	var chars: Dictionary = tile_map.get("char", {})
	var glyph_numbers: Dictionary = tile_map.get("glyphNumber", {})
	var kinds: Dictionary = tile_map.get("semanticKind", {})
	var glyph_key := str(int(cell.get("glyph", -1)))
	var kind := str(cell.get("semanticKind", "")).to_lower()

	if is_player_cell(cell):
		for candidate in [player_avatar_id(character) if not character.is_empty() else "", _semantic_player_avatar(cell),
				"hero-avatar", glyph_numbers.get(glyph_key, ""), kinds.get(kind, ""), chars.get(ch, "")]:
			if candidate != "" and has_asset(candidate):
				return candidate
		return ""
	if kind == "engulfment":
		return asset_for_semantic_name(cell.get("semanticName", ""), "monster")

	var hides_name: bool = cell.get("semanticKnown", true) == false
	var name := str(cell.get("semanticName", ""))
	var appearance := str(cell.get("semanticAppearance", ""))
	var candidates: Array = []
	if kind == "pet":
		candidates.append(PET_ALIASES.get(name.to_lower(), ""))
	if hides_name:
		var unknown_name := appearance
		if unknown_name == "" and name.to_lower().begins_with("scroll labeled "):
			unknown_name = name
		if unknown_name != "":
			var id := _scroll_label_asset(unknown_name)
			if id == "":
				id = _public_appearance_asset(unknown_name, cell.get("semanticKind", ""), cell)
			if id == "":
				id = _appearance_class_fallback(unknown_name, cell.get("semanticKind", ""), cell)
			candidates.append(id)
	candidates.append(asset_for_semantic_name(_corpse_or_statue_subject(cell), "monster"))
	if not hides_name:
		candidates.append(asset_for_semantic_name(name, cell.get("semanticKind", "")))
		candidates.append(asset_for_semantic_name(appearance, cell.get("semanticKind", "")))
	if kind == "corpse":
		candidates.append("corpse")
	if kind == "statue":
		candidates.append("statue")
	if cell.has("cmapIndex"):
		candidates.append(glyph_numbers.get(glyph_key, ""))
	candidates.append(_class_fallback(ch, cell.get("semanticKind", "")))
	candidates.append(glyph_numbers.get(glyph_key, ""))
	candidates.append(kinds.get(kind, ""))
	if not (ch == "@"):
		candidates.append(chars.get(ch, ""))
	for candidate in candidates:
		var id := _class_checked(str(candidate), ch, kind)
		if id != "":
			return id
	return ""


## Object art drawn for another class is never used: a name can be a ring
## and a potion ("levitation"), and the tile shows one of them. The art
## for this class is "<name>-<noun>" ("levitation-ring"); none: skip.
const CLASS_NOUNS := {"!": "potion", "=": "ring", "/": "wand", "\"": "amulet", "+": "spellbook", "?": "scroll",
	")": "weapon", "[": "armor", "(": "tool", "%": "food", "*": "gem"}


func _class_checked(id: String, ch: String, kind: String) -> String:
	if id == "" or not has_asset(id):
		return ""
	var classes := str(assets[id].get("objectClasses", ""))
	if classes == "" or not CLASS_NOUNS.has(ch) or not (kind == "" or kind == "object" or kind == "item") or classes.contains(ch):
		return id
	var qualified := "%s-%s" % [id, CLASS_NOUNS[ch]]
	return qualified if has_asset(qualified) else ""


func is_overlay(asset_id: String) -> bool:
	if not assets.has(asset_id):
		return false
	var meta: Dictionary = assets[asset_id]
	var label := str(meta.get("workflowLabel", "")).to_lower()
	var workflow := str(meta.get("workflow", "")).to_lower()
	if label.contains("transparent") or RegEx.create_from_string("rem[_-]?back").search(workflow) != null:
		return true
	return OVERLAY_CATEGORIES.has(category(asset_id)) or category(asset_id).begins_with("full-source")


## Floor art drawn under an overlay. Prefers the real background glyph the
## bridge reports (what is actually under a monster/object), then falls back
## to Electron's heuristics.
func base_for_cell(cell: Dictionary, overlay_id: String) -> String:
	if cell.get("backgroundGlyph", -1) != null and int(cell.get("backgroundGlyph", -1)) >= 0 and str(cell.get("backgroundChar", "")) != "":
		var background := {
			"char": str(cell.get("backgroundChar", "")),
			"glyph": int(cell.get("backgroundGlyph")),
			"semanticKind": cell.get("backgroundSemanticKind", "terrain"),
			"semanticName": cell.get("backgroundSemanticName", ""),
			"semanticKnown": cell.get("backgroundSemanticKnown", true),
		}
		var id := asset_for_cell(background)
		if id != "" and id != overlay_id and not is_overlay(id):
			return id
	var ch := _cell_char(cell)
	if ch == " " or overlay_id == "unexplored-stone":
		return ""
	if is_overlay(overlay_id):
		return "lit-corridor" if ch == "#" else "room-floor"
	return ""
