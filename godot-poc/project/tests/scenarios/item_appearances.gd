extends Scenario
## Unidentified items look like what the hero sees (bridge fixture: an
## emerald, green glass, a ruby, a sapphire, a citrine and a luckstone, none
## identified): each gem in its colour, the emerald and the green glass
## alike (both "green gem"), the gray stone a dull pebble; in the pack.


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "object/unidentified-gems")
	await press(KEY_ESCAPE)
	var art: Array = []  # [name, art path] per stack
	for item in game.state.inventory:
		var icon := ItemText.icon(item, game.state)
		art.append([ItemText.display_name(item), icon.resource_path if icon else ""])
	note("art: %s" % [art])
	var glass: Array = art.filter(func(a: Array) -> bool: return str(a[0]).contains("looking glass"))
	expect(not glass.is_empty() and str(glass[0][1]).contains("mirror"), "the looking glass shows the mirror art (%s)" % [glass])
	var book: Array = art.filter(func(a: Array) -> bool: return str(a[0]).contains("spellbook of healing"))
	var potion: Array = art.filter(func(a: Array) -> bool: return str(a[0]).contains("potion of healing"))
	note("healing: %s / %s" % [book, potion])
	expect(not book.is_empty() and not potion.is_empty() and book[0][1] != potion[0][1], "the spellbook of healing doesn't borrow the potion's art")
	# Unidentified potions, rings, wands, amulets and spellbooks: art for
	# their appearance, never the class icon.
	var magic: Array = art.filter(func(a: Array) -> bool: return RegEx.create_from_string("potion|ring|wand|amulet|spellbook").search(str(a[0])) != null and not str(a[0]).contains("of healing"))
	note("appearances: %s" % [magic])
	expect(magic.size() >= 8 and not magic.any(func(a: Array) -> bool: return str(a[1]).contains("class-icon")), "each unidentified potion, ring, wand, amulet and spellbook has its appearance's art")
	var stones: Array = art.filter(func(a: Array) -> bool: return str(a[0]).contains("gem") or str(a[0]).contains("stone"))
	var greens: Array = art.filter(func(a: Array) -> bool: return str(a[0]).contains("green"))
	expect(greens.size() == 2 and greens[0][1] == greens[1][1] and str(greens[0][1]).contains("green"), "the emerald and the green glass look alike, and green (%s)" % [greens])
	var distinct := {}
	for a in stones:
		distinct[a[1]] = true
	expect(distinct.size() == 5, "five looks for six stones: green twice, red, blue, yellow, gray (%d)" % distinct.size())
	expect(not stones.any(func(a: Array) -> bool: return str(a[1]).contains("gem-class-icon")), "no gem falls back to the generic icon")
	await type_text("i")
	await get_tree().create_timer(0.5).timeout
	await screenshot("gems-in-pack")
