class_name CharacterOptions
extends RefCounted
## NetHack's legal role/race/gender/alignment combinations and the words
## the creation screen uses to describe them.

const ROLES := {
	"Arc": {"label": "Archeologist", "races": ["Hum", "Dwa", "Gno"], "genders": ["Mal", "Fem"], "aligns": ["Law", "Neu"],
		"blurb": "A scholar of lost places. Quick on their feet, sharp-eyed for traps, and armed with a pick-axe that digs through anything.", "difficulty": "Moderate"},
	"Bar": {"label": "Barbarian", "races": ["Hum", "Orc"], "genders": ["Mal", "Fem"], "aligns": ["Neu", "Cha"],
		"blurb": "A mighty warrior who shrugs off poison and swings a two-handed blade. Simple, brutal, effective.", "difficulty": "Easy"},
	"Cav": {"label": "Caveman", "races": ["Hum", "Dwa", "Gno"], "genders": ["Mal", "Fem"], "aligns": ["Law", "Neu"],
		"blurb": "Strong and hardy, with a club and a sling. Primitive tools, but a body built to endure.", "difficulty": "Moderate"},
	"Hea": {"label": "Healer", "races": ["Hum", "Gno"], "genders": ["Mal", "Fem"], "aligns": ["Neu"],
		"blurb": "A physician with healing potions, a stethoscope and deep pockets. Fragile in a fight, rich in options.", "difficulty": "Hard"},
	"Kni": {"label": "Knight", "races": ["Hum"], "genders": ["Mal", "Fem"], "aligns": ["Law"],
		"blurb": "A sworn warrior with a lance and a loyal pony. Bound by a code of honor the gods will judge.", "difficulty": "Moderate"},
	"Mon": {"label": "Monk", "races": ["Hum"], "genders": ["Mal", "Fem"], "aligns": ["Law", "Neu", "Cha"],
		"blurb": "A martial artist whose bare hands strike fast and hard. Fights best unarmored and knows a spell from day one.", "difficulty": "Easy"},
	"Pri": {"label": "Priest", "races": ["Hum", "Elf"], "genders": ["Mal", "Fem"], "aligns": ["Law", "Neu", "Cha"],
		"blurb": "A servant of the gods who can see whether any item is blessed or cursed. Carries holy water and prayers.", "difficulty": "Moderate"},
	"Ran": {"label": "Ranger", "races": ["Hum", "Elf", "Gno", "Orc"], "genders": ["Mal", "Fem"], "aligns": ["Neu", "Cha"],
		"blurb": "A master archer who kills from afar, wrapped in a cloak that makes them hard to hit.", "difficulty": "Moderate"},
	"Rog": {"label": "Rogue", "races": ["Hum", "Orc"], "genders": ["Mal", "Fem"], "aligns": ["Cha"],
		"blurb": "Cunning and quick, deadly with thrown daggers. Lives by wit rather than armor.", "difficulty": "Moderate"},
	"Sam": {"label": "Samurai", "races": ["Hum"], "genders": ["Mal", "Fem"], "aligns": ["Law"],
		"blurb": "A disciplined swordsman, fast and deadly with the katana. One of the strongest starts in the dungeon.", "difficulty": "Easy"},
	"Tou": {"label": "Tourist", "races": ["Hum"], "genders": ["Mal", "Fem"], "aligns": ["Neu"],
		"blurb": "A wealthy sightseer with a camera, a loud shirt and no idea what's coming. The ultimate challenge.", "difficulty": "Very hard"},
	"Val": {"label": "Valkyrie", "races": ["Hum", "Dwa"], "genders": ["Fem"], "aligns": ["Law", "Neu"],
		"blurb": "A fearless shield-maiden, stealthy and immune to cold. The best hero for your first descent.", "difficulty": "Easiest"},
	"Wiz": {"label": "Wizard", "races": ["Hum", "Elf", "Gno", "Orc"], "genders": ["Mal", "Fem"], "aligns": ["Neu", "Cha"],
		"blurb": "A spellcaster with a force bolt, a cloak of magic resistance and a pack of mysterious wands and rings.", "difficulty": "Moderate"},
}
const RACES := {
	"Hum": {"label": "Human", "aligns": ["Law", "Neu", "Cha"]},
	"Dwa": {"label": "Dwarf", "aligns": ["Law"]},
	"Elf": {"label": "Elf", "aligns": ["Cha"]},
	"Gno": {"label": "Gnome", "aligns": ["Neu"]},
	"Orc": {"label": "Orc", "aligns": ["Cha"]},
}
const GENDERS := {"Mal": "Male", "Fem": "Female"}
const ALIGNS := {"Law": "Lawful", "Neu": "Neutral", "Cha": "Chaotic"}
const ROLE_ORDER := ["Val", "Sam", "Bar", "Mon", "Kni", "Pri", "Wiz", "Ran", "Rog", "Arc", "Cav", "Hea", "Tou"]

const NAMES_FEM := ["Brunhild", "Sigrun", "Astrid", "Isolde", "Morwen", "Elspeth", "Rowan", "Ysolde", "Kestrel", "Thora", "Anwen", "Liriel"]
const NAMES_MAL := ["Aldric", "Bram", "Corwin", "Doran", "Eamon", "Fenris", "Gareth", "Hallam", "Ivor", "Joren", "Kael", "Torvald"]


static func races_for(role: String) -> Array:
	var result := []
	for race in ROLES[role].races:
		if not aligns_for(role, race).is_empty():
			result.append(race)
	return result


static func aligns_for(role: String, race: String) -> Array:
	var result := []
	for align in ROLES[role].aligns:
		if RACES[race].aligns.has(align):
			result.append(align)
	return result


static func genders_for(role: String) -> Array:
	return ROLES[role].genders


## Fixes up a selection so every field is legal, keeping what it can.
static func normalize(selection: Dictionary) -> Dictionary:
	var role: String = selection.get("role", "Val")
	if not ROLES.has(role):
		role = "Val"
	var races := races_for(role)
	var race: String = selection.get("race", races[0])
	if not races.has(race):
		race = races[0]
	var genders := genders_for(role)
	var gender: String = selection.get("gender", genders[0])
	if not genders.has(gender):
		gender = genders[0]
	var aligns := aligns_for(role, race)
	var align: String = selection.get("align", aligns[0])
	if not aligns.has(align):
		align = aligns[0]
	return {"role": role, "race": race, "gender": gender, "align": align, "name": selection.get("name", "")}


static func spec(selection: Dictionary) -> String:
	return "%s-%s-%s-%s-%s" % [selection.name, selection.role, selection.race, selection.gender, selection.align]


static func random_name(gender: String) -> String:
	var pool: Array = NAMES_FEM if gender == "Fem" else NAMES_MAL
	return pool[randi() % pool.size()]


static func describe(selection: Dictionary) -> String:
	return "%s %s %s %s" % [ALIGNS[selection.align], GENDERS[selection.gender].to_lower(), RACES[selection.race].label.to_lower(), ROLES[selection.role].label]
