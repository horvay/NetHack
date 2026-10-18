class_name CommandCatalog
extends RefCounted
## Every command the palette offers, with its classic keys. Picking one types
## exactly those keys into NetHack.

const CATEGORIES := ["Items", "Equipment", "Magic", "Dungeon", "Character", "Game"]

const COMMANDS := [
	{"id": "inventory", "label": "Inventory", "cat": "Items", "key": "i", "ui": "inventory", "aliases": "items carried possessions bag"},
	{"id": "pickup", "label": "Pick up", "cat": "Items", "key": ",", "keys": ",", "aliases": "take grab floor"},
	{"id": "drop", "label": "Drop", "cat": "Items", "key": "d", "keys": "d", "aliases": "leave"},
	{"id": "drop-many", "label": "Drop several", "cat": "Items", "key": "D", "keys": "D", "aliases": "drop multiple types"},
	{"id": "eat", "label": "Eat", "cat": "Items", "key": "e", "keys": "e", "aliases": "food consume corpse"},
	{"id": "quaff", "label": "Drink (quaff)", "cat": "Items", "key": "q", "keys": "q", "aliases": "potion drink fountain"},
	{"id": "read", "label": "Read", "cat": "Items", "key": "r", "keys": "r", "aliases": "scroll spellbook"},
	{"id": "apply", "label": "Apply / use", "cat": "Items", "key": "a", "keys": "a", "aliases": "use tool key lamp unlock"},
	{"id": "zap", "label": "Zap a wand", "cat": "Items", "key": "z", "keys": "z", "aliases": "wand"},
	{"id": "throw", "label": "Throw", "cat": "Items", "key": "t", "keys": "t", "aliases": "toss"},
	{"id": "fire", "label": "Fire quiver", "cat": "Items", "key": "f", "keys": "f", "aliases": "shoot arrows ammunition"},
	{"id": "loot", "label": "Loot a container", "cat": "Items", "key": "#loot", "keys": "#loot\n", "aliases": "box chest bag open container"},
	{"id": "dip", "label": "Dip", "cat": "Items", "key": "#dip", "keys": "#dip\n", "aliases": "dip into potion fountain"},
	{"id": "rub", "label": "Rub", "cat": "Items", "key": "#rub", "keys": "#rub\n", "aliases": "lamp touchstone"},
	{"id": "tip", "label": "Tip a container", "cat": "Items", "key": "#tip", "keys": "#tip\n", "aliases": "empty container"},
	{"id": "force", "label": "Force a lock", "cat": "Items", "key": "#force", "keys": "#force\n", "aliases": "box chest lock"},
	{"id": "name", "label": "Name / call", "cat": "Items", "key": "#name", "keys": "#name\n", "aliases": "call type label"},
	{"id": "adjust", "label": "Adjust letters", "cat": "Items", "key": "#adjust", "keys": "#adjust\n", "aliases": "reorder inventory letters"},
	{"id": "engrave", "label": "Engrave", "cat": "Items", "key": "E", "keys": "E", "aliases": "write elbereth dust"},
	{"id": "equipment", "label": "Equipment", "cat": "Equipment", "key": "", "ui": "equipment", "aliases": "gear paper doll worn"},
	{"id": "wield", "label": "Wield weapon", "cat": "Equipment", "key": "w", "keys": "w", "aliases": "weapon hold"},
	{"id": "swap", "label": "Swap weapons", "cat": "Equipment", "key": "x", "keys": "x", "aliases": "alternate secondary"},
	{"id": "two-weapon", "label": "Two-weapon combat", "cat": "Equipment", "key": "X", "keys": "X", "aliases": "dual wield twoweapon"},
	{"id": "wear", "label": "Wear armor", "cat": "Equipment", "key": "W", "keys": "W", "aliases": "put on armor"},
	{"id": "takeoff", "label": "Take off armor", "cat": "Equipment", "key": "T", "keys": "T", "aliases": "remove armor"},
	{"id": "takeoff-all", "label": "Take off several", "cat": "Equipment", "key": "A", "keys": "A", "aliases": "remove all"},
	{"id": "puton", "label": "Put on ring / amulet", "cat": "Equipment", "key": "P", "keys": "P", "aliases": "accessory blindfold"},
	{"id": "remove", "label": "Remove ring / amulet", "cat": "Equipment", "key": "R", "keys": "R", "aliases": "accessory"},
	{"id": "quiver", "label": "Set quiver", "cat": "Equipment", "key": "Q", "keys": "Q", "aliases": "ready ammunition"},
	{"id": "cast", "label": "Cast a spell", "cat": "Magic", "key": "Z", "keys": "Z", "aliases": "spell magic"},
	{"id": "spells", "label": "Known spells", "cat": "Magic", "key": "+", "keys": "+", "aliases": "spellbook list"},
	{"id": "enhance", "label": "Skills", "cat": "Magic", "key": "#enhance", "keys": "#enhance\n", "aliases": "advance skill training"},
	{"id": "pray", "label": "Pray", "cat": "Magic", "key": "#pray", "keys": "#pray\n", "danger": "caution", "aliases": "god help prayer"},
	{"id": "offer", "label": "Offer sacrifice", "cat": "Magic", "key": "#offer", "keys": "#offer\n", "aliases": "altar sacrifice corpse"},
	{"id": "turn", "label": "Turn undead", "cat": "Magic", "key": "#turn", "keys": "#turn\n", "aliases": "undead"},
	{"id": "invoke", "label": "Invoke artifact", "cat": "Magic", "key": "#invoke", "keys": "#invoke\n", "aliases": "artifact power"},
	{"id": "monster", "label": "Monster ability", "cat": "Magic", "key": "#monster", "keys": "#monster\n", "aliases": "polymorph special"},
	{"id": "search", "label": "Search", "cat": "Dungeon", "key": "s", "keys": "s", "aliases": "hidden door trap"},
	{"id": "rest", "label": "Rest 20 turns", "cat": "Dungeon", "key": "20s", "keys": "s", "count": 20, "aliases": "wait heal search repeat"},
	{"id": "wait", "label": "Wait one turn", "cat": "Dungeon", "key": ".", "keys": ".", "aliases": "rest pass"},
	{"id": "travel", "label": "Travel to…", "cat": "Dungeon", "key": "_", "keys": "_", "aliases": "go to move far"},
	{"id": "open", "label": "Open door", "cat": "Dungeon", "key": "o", "keys": "o", "aliases": "door"},
	{"id": "close", "label": "Close door", "cat": "Dungeon", "key": "c", "keys": "c", "aliases": "door shut"},
	{"id": "kick", "label": "Kick", "cat": "Dungeon", "key": "Ctrl+D", "keys": "\u0004", "aliases": "door break"},
	{"id": "fight", "label": "Fight in a direction", "cat": "Dungeon", "key": "F", "keys": "F", "aliases": "attack force fight"},
	{"id": "down", "label": "Go down", "cat": "Dungeon", "key": ">", "keys": ">", "aliases": "stairs descend ladder"},
	{"id": "up", "label": "Go up", "cat": "Dungeon", "key": "<", "keys": "<", "aliases": "stairs ascend ladder"},
	{"id": "look-here", "label": "Look here", "cat": "Dungeon", "key": ":", "keys": ":", "aliases": "what is here floor"},
	{"id": "farlook", "label": "Look at…", "cat": "Dungeon", "key": ";", "keys": ";", "aliases": "examine identify farlook"},
	{"id": "whatis", "label": "What is a symbol", "cat": "Dungeon", "key": "/", "keys": "/", "aliases": "identify symbol"},
	{"id": "chat", "label": "Chat", "cat": "Dungeon", "key": "#chat", "keys": "#chat\n", "aliases": "talk speak shopkeeper"},
	{"id": "pay", "label": "Pay shopkeeper", "cat": "Dungeon", "key": "p", "keys": "p", "aliases": "shop buy bill"},
	{"id": "sit", "label": "Sit", "cat": "Dungeon", "key": "#sit", "keys": "#sit\n", "aliases": "throne"},
	{"id": "untrap", "label": "Disarm trap", "cat": "Dungeon", "key": "#untrap", "keys": "#untrap\n", "aliases": "trap"},
	{"id": "jump", "label": "Jump", "cat": "Dungeon", "key": "#jump", "keys": "#jump\n", "aliases": "leap"},
	{"id": "ride", "label": "Ride", "cat": "Dungeon", "key": "#ride", "keys": "#ride\n", "aliases": "steed saddle"},
	{"id": "pickup-toggle", "label": "Toggle autopickup", "cat": "Dungeon", "key": "@", "keys": "@", "aliases": "autopickup"},
	{"id": "redo", "label": "Repeat last command", "cat": "Dungeon", "key": "Ctrl+A", "keys": "\u0001", "aliases": "again redo"},
	{"id": "character", "label": "Character sheet", "cat": "Character", "key": "Ctrl+X", "keys": "\u0018", "aliases": "attributes stats"},
	{"id": "conduct", "label": "Conduct", "cat": "Character", "key": "#conduct", "keys": "#conduct\n", "aliases": "challenges"},
	{"id": "overview", "label": "Dungeon overview", "cat": "Character", "key": "Ctrl+O", "keys": "#overview\n", "aliases": "levels visited"},
	{"id": "discoveries", "label": "Discoveries", "cat": "Character", "key": "\\", "keys": "\\", "aliases": "identified known items"},
	{"id": "history", "label": "Message history", "cat": "Character", "key": "F2", "ui": "history", "aliases": "log previous messages"},
	{"id": "help", "label": "Help & guide", "cat": "Game", "key": "F1", "ui": "help", "aliases": "manual keys how to play"},
	{"id": "nethack-help", "label": "NetHack's help menu", "cat": "Game", "key": "?", "keys": "?", "aliases": "classic help"},
	{"id": "whatdoes", "label": "What does a key do", "cat": "Game", "key": "&", "keys": "&", "aliases": "command help"},
	{"id": "settings", "label": "Settings", "cat": "Game", "key": "", "ui": "settings", "aliases": "options preferences volume"},
	{"id": "options", "label": "NetHack options", "cat": "Game", "key": "O", "keys": "O", "aliases": "classic options"},
	{"id": "extended", "label": "Extended command…", "cat": "Game", "key": "#", "keys": "#", "aliases": "hash raw command"},
	{"id": "save", "label": "Save and exit", "cat": "Game", "key": "S", "keys": "S", "danger": "caution", "aliases": "save game quit later"},
	{"id": "quit", "label": "Quit (abandon run)", "cat": "Game", "key": "#quit", "keys": "#quit\n", "danger": "serious", "aliases": "give up end game"},
]


static func search(query: String) -> Array:
	var needle := query.strip_edges().to_lower()
	if needle == "":
		return COMMANDS
	var scored := []
	for command in COMMANDS:
		var label := str(command.label).to_lower()
		var hay := "%s %s %s %s" % [label, command.get("aliases", ""), command.cat.to_lower(), str(command.key).to_lower()]
		var key := str(command.key).to_lower()
		var score := -1
		if label == needle or key == needle:
			score = 0
		elif label.begins_with(needle):
			score = 1
		elif label.contains(needle):
			score = 2
		elif hay.contains(needle):
			score = 3
		if score >= 0:
			scored.append([score, scored.size(), command])
	# Godot's sort isn't stable: the index keeps catalog order within a rank.
	scored.sort_custom(func(a: Array, b: Array) -> bool: return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1]))
	return scored.map(func(entry: Array) -> Dictionary: return entry[2])
