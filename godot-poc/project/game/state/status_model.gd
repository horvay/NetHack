class_name StatusModel
extends RefCounted
## The hero's status line, assembled from shim_status_update events.
## Field ids follow NetHack's enum statusfields (include/botl.h).

enum Field {
	TITLE = 0, STR, DX, CO, IN, WI, CH, ALIGN, SCORE, CAP, GOLD, ENE, ENEMAX, XP, AC, HD,
	TIME, HUNGER, HP, HPMAX, LEVELDESC, EXP, CONDITION, WEAPON, ARMOR, TERRAIN, VERS,
}
const FLUSH := -1
const RESET := -2

## Condition bits (BL_MASK_*), in display order, with player-facing labels.
const CONDITIONS := [
	[0x00000002, "blind", "Blind"], [0x00000008, "conf", "Confused"], [0x00400000, "stun", "Stunned"],
	[0x00000400, "hallu", "Hallucinating"], [0x00008000, "parlyz", "Paralyzed"], [0x00020000, "sleeping", "Asleep"],
	[0x08000000, "unconsc", "Unconscious"], [0x00100000, "stone", "Turning to stone"], [0x00040000, "slime", "Turning to slime"],
	[0x00200000, "strngl", "Strangled"], [0x00000080, "foodpois", "Food poisoning"], [0x01000000, "termill", "Terminally ill"],
	[0x00000010, "deaf", "Deaf"], [0x00000200, "grab", "Grabbed"], [0x00000800, "held", "Held"],
	[0x20000000, "holding", "Holding"], [0x04000000, "trapped", "Trapped"], [0x02000000, "tethered", "Tethered"],
	[0x00002000, "inlava", "In lava"], [0x00800000, "submerged", "Underwater"], [0x00004000, "lev", "Levitating"],
	[0x00000040, "fly", "Flying"], [0x00010000, "ride", "Riding"], [0x00001000, "icy", "On ice"],
	[0x00080000, "slippery", "Slippery fingers"], [0x10000000, "woundedl", "Wounded legs"], [0x00000020, "elf_iron", "Iron burns"],
	[0x00000100, "glowhands", "Glowing hands"], [0x00000001, "bareh", "Bare-handed"], [0x00000004, "busy", "Busy"],
]
## Conditions that threaten death if ignored; the HUD stresses these.
const DEADLY := ["stone", "slime", "strngl", "foodpois", "termill", "inlava"]

var values: Dictionary = {}
var colors: Dictionary = {}
var percents: Dictionary = {}
var condition_mask := 0
var revision := 0
var _pending := false


## Returns true when a complete status update is ready (on flush).
func apply(event: Dictionary) -> bool:
	var field := int(event.get("field", -99))
	if field == FLUSH or field == RESET:
		if _pending or field == RESET:
			_pending = false
			revision += 1
			return true
		return false
	if field == Field.CONDITION:
		condition_mask = int(event.get("conditionMask", 0))
	else:
		values[field] = str(event.get("value", "")).strip_edges()
	colors[field] = int(event.get("color", 0))
	percents[field] = int(event.get("percent", 0))
	_pending = true
	return false


func text(field: int) -> String:
	var value := str(values.get(field, ""))
	if field == Field.GOLD:
		# Gold arrives as "\G<glyph>:<amount>"; keep the amount.
		var colon := value.rfind(":")
		return value.substr(colon + 1) if colon >= 0 else value
	if field == Field.LEVELDESC:
		return value.strip_edges()
	return value


func number(field: int, fallback := 0) -> int:
	var digits := text(field)
	if field == Field.STR and digits.contains("/"):
		return 18
	return int(digits) if digits.is_valid_int() else fallback


func hp() -> int: return number(Field.HP)
func hp_max() -> int: return number(Field.HPMAX, 1)
func energy() -> int: return number(Field.ENE)
func energy_max() -> int: return number(Field.ENEMAX, 1)
func turn() -> int: return number(Field.TIME)


func title() -> String:
	return text(Field.TITLE)


func hunger() -> String:
	return text(Field.HUNGER)


func encumbrance() -> String:
	return text(Field.CAP)


func active_conditions() -> Array:
	var list := []
	for entry in CONDITIONS:
		if condition_mask & int(entry[0]):
			list.append({"id": entry[1], "label": entry[2], "deadly": DEADLY.has(entry[1])})
	return list
