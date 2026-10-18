class_name MessageLog
extends RefCounted
## Everything NetHack said to the player, oldest first, grouped by turn.

const LIMIT := 2000

## Each entry: {text, turn, attr, serial, urgent}
var entries: Array[Dictionary] = []
var serial := 0

var _urgent_regex := RegEx.create_from_string("(?i)\\b(you die|you feel feverish|you are slowing down|you can't breathe|you are beginning to feel weak|you faint|weak from hunger|stiffening|turning to stone|you are a statue|it bites!|you feel deathly sick|you are frozen|you can't move|you are slowing down)\\b")


## A history-only line (a question NetHack asked, the opening lore): kept
## in the log, never shown in the feed. kind is "question" or "lore".
func note(text: String, turn: int, kind: String) -> void:
	var clean := text.strip_edges()
	if clean == "":
		return
	serial += 1
	entries.append({"text": clean, "turn": turn, "attr": 0, "serial": serial, "urgent": false, "category": kind, "note": true})
	if entries.size() > LIMIT:
		entries = entries.slice(entries.size() - LIMIT)


func add(text: String, turn: int, attr := 0) -> Dictionary:
	var clean := text.strip_edges()
	if clean == "":
		return {}
	serial += 1
	var entry := {"text": clean, "turn": turn, "attr": attr, "serial": serial, "urgent": _urgent_regex.search(clean) != null,
		"category": categorize(clean)}
	entries.append(entry)
	if entries.size() > LIMIT:
		entries = entries.slice(entries.size() - LIMIT)
	return entry


## The last count game messages (history-only notes left out).
func recent(count: int) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var i := entries.size() - 1
	while i >= 0 and result.size() < count:
		if not entries[i].get("note", false):
			result.push_front(entries[i])
		i -= 1
	return result


const CATEGORY_PATTERNS := [
	["danger", "(?i)\\b(you die|you feel weak|weak from hunger|fainting|you are hit|bites!|stings!|hits!|you are burned|you are frozen|poison|you can't move|stiffening)\\b"],
	["combat", "(?i)^(you (hit|miss|kill|destroy|smite|bite|kick)|the .* (hits|misses|bites|is killed|dies)|you are hit)"],
	["loot", "(?i)(^[a-zA-Z$] - |gold pieces?|you see here|there are several objects|you find)"],
	["magic", "(?i)(you feel|glows|shimmers|you hear|zap|spell|magic)"],
	["speech", "(?i)(says|shouts|whispers|\\\"[^\\\"]+\\\")"],
]
static var _category_regexes: Array = []


static func categorize(text: String) -> String:
	if _category_regexes.is_empty():
		for entry in CATEGORY_PATTERNS:
			_category_regexes.append([entry[0], RegEx.create_from_string(entry[1])])
	for entry in _category_regexes:
		if (entry[1] as RegEx).search(text):
			return entry[0]
	return "info"


static func category_color(category: String) -> Color:
	match category:
		"danger":
			return Color("ff8a7a")
		"combat":
			return Color("f0d0b0")
		"loot":
			return Color("f2d27a")
		"magic":
			return Color("c8b4ff")
		"speech":
			return Color("9fd8ff")
	return Color("e9e1cf")
