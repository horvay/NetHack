class_name StatusEffects
## Every status the hero can be in, as the player should see it: a name, how
## bad it is, an icon and what it means in plain words. The HUD's badges, the
## onset announcements and the screen effects all read this one table, so a
## negative status is never just a small word on the hero card.
##
## Tiers: "deadly" (will kill if ignored), "serious" (changes how you play
## right now), "mild" (worth knowing), "neutral" (not a problem). Meanings
## say only what the hero can tell (the no-spoiler rule): no cures, except
## that the hungry should eat.

const TIER_ORDER := {"deadly": 0, "serious": 1, "mild": 2, "neutral": 3}
const TIER_COLORS := {"deadly": Color("ff5a4a"), "serious": Color("ff9d3b"), "mild": Color("f2d35b"), "neutral": Color("a9b4c8")}

## id: [label, tier, icon asset ("" = drawn mark), meaning]
const TABLE := {
	# Hunger (NetHack's hunger states).
	"Satiated": ["Satiated", "mild", "", "You are overfull."],
	"Hungry": ["Hungry", "mild", "hunger-badge", "Eat soon, or you will grow weak."],
	"Weak": ["Weak", "serious", "hunger-badge", "Weak from hunger: eat now."],
	"Fainting": ["Fainting", "deadly", "hunger-badge", "You are passing out from hunger: eat now."],
	"Fainted": ["Fainted", "deadly", "hunger-badge", "You have passed out from hunger."],
	# Load.
	"Burdened": ["Burdened", "mild", "burdened-badge", "Carrying a lot: you move more slowly."],
	"Stressed": ["Stressed", "serious", "burdened-badge", "Overloaded: you move much more slowly."],
	"Strained": ["Strained", "serious", "burdened-badge", "Badly overloaded."],
	"Overtaxed": ["Overtaxed", "deadly", "burdened-badge", "You can barely move under this load."],
	"Overloaded": ["Overloaded", "deadly", "burdened-badge", "You can't move under this load."],
	# Conditions (StatusModel.CONDITIONS ids).
	"blind": ["Blind", "serious", "blind-badge", "You can't see: the map shows only what you remember."],
	"conf": ["Confused", "serious", "confused-badge", "Your mind is muddled: you may not go where you mean to."],
	"stun": ["Stunned", "serious", "stunned-badge", "You stagger and reel: your steps go astray."],
	"hallu": ["Hallucinating", "serious", "hallucination-badge", "What you see may not be real."],
	"parlyz": ["Paralyzed", "deadly", "paralyzed-badge", "You can't move."],
	"sleeping": ["Asleep", "serious", "", "You are asleep."],
	"unconsc": ["Unconscious", "serious", "", "You are unconscious."],
	"stone": ["Turning to stone", "deadly", "stoning-badge", "You are turning to stone."],
	"slime": ["Turning to slime", "deadly", "sliming-badge", "You are turning into slime."],
	"strngl": ["Strangled", "deadly", "strangled-badge", "You can't breathe."],
	"foodpois": ["Food poisoning", "deadly", "poisoned-badge", "You are sick from something you ate."],
	"termill": ["Terminally ill", "deadly", "sick-badge", "You are gravely ill."],
	"inlava": ["In lava", "deadly", "", "You are in molten lava."],
	"grab": ["Grabbed", "serious", "", "Something has hold of you."],
	"held": ["Held", "serious", "", "Something is holding you."],
	"trapped": ["Trapped", "serious", "trapped-badge", "You are stuck."],
	"submerged": ["Underwater", "serious", "", "You are underwater."],
	"deaf": ["Deaf", "mild", "deaf-badge", "You can't hear."],
	"tethered": ["Tethered", "mild", "", "You are tied in place."],
	"slippery": ["Slippery fingers", "mild", "slippery-badge", "Your hands are slippery: you may drop what you hold."],
	"woundedl": ["Wounded legs", "mild", "wounded-legs-badge", "Your legs are hurt."],
	"elf_iron": ["Iron burns", "mild", "", "Iron is burning you."],
	"icy": ["On ice", "mild", "", "You are on slippery ice."],
	"lev": ["Levitating", "neutral", "", "You are floating above the floor."],
	"fly": ["Flying", "neutral", "", "You are flying."],
	"ride": ["Riding", "neutral", "", "You are riding."],
	"holding": ["Holding", "neutral", "", "You are holding on to something."],
	"glowhands": ["Glowing hands", "neutral", "", "Your hands are glowing."],
	"bareh": ["Bare-handed", "neutral", "", "You fight bare-handed."],
	"busy": ["Busy", "neutral", "", "You are busy."],
}


## The hero's statuses now, worst first: [{id, label, tier, icon, meaning}].
static func current(status: StatusModel) -> Array:
	var ids: Array = []
	var hunger := status.hunger()
	if hunger != "" and hunger != "Not Hungry":
		ids.append(hunger)
	var burden := status.encumbrance()
	if burden != "":
		ids.append(burden)
	for condition in status.active_conditions():
		ids.append(str(condition.id))
	var list: Array = []
	for id in ids:
		var row: Array = TABLE.get(id, [str(id).capitalize(), "mild", "", ""])
		list.append({"id": id, "label": row[0], "tier": row[1], "icon": row[2], "meaning": row[3]})
	list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return TIER_ORDER[a.tier] < TIER_ORDER[b.tier])
	return list


static func is_negative(effect: Dictionary) -> bool:
	return effect.tier != "neutral"


static func color(effect: Dictionary) -> Color:
	return TIER_COLORS.get(effect.tier, TIER_COLORS.neutral)
