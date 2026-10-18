# Plain NetHack menus to replace with purpose-built screens

Survey of 2026-10-18 (Greg: "all of these old just basic menus… we could probably make a better UX"). Built in rank order; status is tracked in the BIBLE decision log.

I found 30 NetHack menus and text windows a player can meet in normal play that still use the generic dialogs. Below they are ranked by how often a typical player sees them. Two of them are bugs.

## Key findings

- **Spell sorting is broken in Godot.** NetHack adds a `+` "[sort spells]" row to the `+` menu (`src/spell.c:2152`). `MenuDialog._build_magic` builds rows only from the typed `spell.rows`, so that row never appears. `handle_key` then swallows the `+` key (`menu_dialog.gd:293-297`). The sort menu (`spellsortmenu`, `spell.c:1976`) can't be reached.
- **The `*` / `?` item menus lose their verb.** `getobj` passes an empty title to `display_pickinv` unless `force_invmenu` is set (`invent.c:1972-1979`). MenuDialog shows "Choose" instead of "What do you want to eat?".
- **Text windows carry no tag at all.** ^X, #conduct, discoveries, #chronicle, #vanquished, price quotes and quest text arrive as untagged `putstr` lines or untitled read-only menus. Godot can only recognise them by their first line. `shim_native_menu_context` already exists, but only the next `start_menu` uses it (bridge `nh-shim-bridge.c:329`). One small, gated change would fix this: attach a pending context to the next `display_nhwindow` too, then tag each call site.
- **Already covered by other screens:** #enhance (SkillsScreen), the end-of-game disclosures (EndChronicle), "Things that are here" (pile peek), "Do what with the box?" (ContainerScreen redirect). Outside wizard mode, #enhance advances one skill and closes (`weapon.c:1370-1438`). Reopening SkillsScreen when rows still show `canAdvance` would help.
- **Some items on your list are not menus.** Pray, #ride, `_` travel, `;` farlook and #annotate are yes/no questions, direction or map-target banners, line prompts or feed messages. They are still listed where a screen would help.

## Ranked table

How often a player sees each one is my estimate. "Ready" means the data already reaches Godot. "Text parse" means it does, but only as text Godot would have to parse.

| # | Menu | How often | Now renders as | Proposed screen | Data |
|---|---|---|---|---|---|
| 1 | `,` "Pick up what?" (typed, pile of 2+) | Every few minutes (keyboard) | MenuDialog, transfer variant | Route to ContainerScreen ground mode; shop piles get the same look, driven by menu keys | Ready |
| 2 | `Z` "Choose which spell to cast" | Every few minutes (casters) | MenuDialog with typed spell rows | Spell grid: spell art, school, Pw vs current Pw, failure bar | Ready; school needs bridge |
| 3 | `+` "Currently known spells" | Several per session (casters) | Same | Same grid in view mode: drag to reorder, Sort button (fixes the bug) | Ready |
| 4 | Item menus from `?` / `*` | Several per session | MenuDialog titled "Choose" | InventoryScreen in pick mode, titled with the verb | Ready (verb kept from the question) |
| 5 | `D` type menu + "What would you like to drop?" | A few per game | MenuDialog ×2 | One "Drop several" grid with class/BUC filter chips and stack steppers | Ready |
| 6 | `\` discoveries | Several per game (veterans) | TextWindowDialog | Codex: class tabs, appearance → name cards, called names, prices | Needs bridge (or fragile text parse) |
| 7 | ^O / #overview | A few per game | Reader (read-only menu) | Dungeon tree: branches, levels, feature icons, "you are here", notes | Text parse; bridge better |
| 8 | Identify "What would you like to identify first?" | A few per game | MenuDialog PICK_ANY | Pack grid of unidentified items, with a reveal per result | Ready |
| 9 | `#name` / `C` "What do you want to name?" | Several per game (veterans) | MenuDialog PICK_ONE (6 rows) | Six big choice tiles, each leading to the right picker | Ready |
| 10 | #pray "Are you sure you want to pray?" | A few per game | QuestionDialog | Prayer card: god, visible trouble, last prayer turn | Ready; god name needs bridge or feed parse |
| 11 | ^X attributes | A few per game | Reader | Character sheet (Electron has one: parity gap) | Text parse; tag needs bridge |
| 12 | Opening lore "It is written in the Book of…" | Once per game, every player | TextWindowDialog | Parchment intro with role avatar and god names | Ready |
| 13 | Shop: #chat "Fine goods for sale", `Iu`, `Ix`, pay menu | Each shop visit | TextWindowDialog / MenuDialog "paying" | Shop ledger: art, price, unpaid / used up, total vs gold, Pay | Text parse; bridge better |
| 14 | `/` "What do you want to look at:" + encyclopedia | Occasional | MenuDialog → yes/no → TextWindowDialog | Look-up chooser plus an encyclopedia page with the subject's tile | Ready |
| 15 | `I`, `*` #seeall, `[ = " ( )`, "Do what with X?" | Occasional | MenuDialog (inventory.displayInventory) | `I` opens InventoryScreen filtered; `*` opens EquipmentScreen; item actions use the item card | Ready |
| 16 | #terrain "View which?" | Occasional | MenuDialog PICK_ONE | Three segmented choices, then NetHack's own map view | Ready |
| 17 | #conduct | Occasional | TextWindowDialog | Conduct badges, kept or broken | Text parse |
| 18 | `v` #chronicle | Occasional | TextWindowDialog | Turn timeline with event icons | Text parse; icons need bridge |
| 19 | `O` "Options" | Occasional | MenuDialog PICK_ONE, looping | A "NetHack" tab in Settings | Text parse; bridge better |
| 20 | #vanquished / #genocided | Rare | TextWindowDialog (+ sort menu with `m`) | Bestiary grid of monster tiles with counts | Ready (names → tiles) |
| 21 | `` ` `` "View discoveries for which sort of objects?" | Rare | MenuDialog then text | A tab of the Codex | Same as #6 |
| 22 | #adjust, `?` "Inventory letters used:" | Rare | QuestionDialog grid + MenuDialog | Drag to reorder letters in InventoryScreen | Ready |
| 23 | `m_` "Pick an interesting thing for travel destination" | Rare (`_` itself is the banner) | MenuDialog | Travel picker: known stairs, altars, fountains, shops, items | Ready (MapModel) |
| 24 | Quest messages, Oracle | Rare | TextWindowDialog | Story card in parchment style | Ready; tag needs bridge |
| 25 | `?` "Select one item:" (NetHack help) | Rare (F1 covers it) | MenuDialog | A section of HelpScreen | Ready |
| 26 | "Loot which containers?", "Tip which container?" | Rare | MenuDialog | Container chooser cards, then ContainerScreen | Ready |
| 27 | `A` "What type of things do you want to take off?" | Rare | MenuDialog ×2 | EquipmentScreen in multi-remove mode | Ready |
| 28 | "View known spells list sorted" | Never (bug) | Unreachable | Sort chips on the spellbook screen | Ready |
| 29 | #herecmdmenu / #therecmdmenu | Rare | MenuDialog | Already covered in spirit by Godot's ContextMenu | Ready |
| 30 | Wish help, tribute novels, getpos help | Rare | TextWindowDialog | Keep the reader; give the novel a book style | Ready |

## Per-menu detail

**1. `,` pickup.** `pickup` in `src/pickup.c:677` calls `query_objlist("Pick up what?")` at `pickup.c:779`. A single item is taken without a menu. The bridge tags it `ground.pickup`, and every row has `objectId`, glyph, `knownFields` and `ownership`.
- Typed `,` goes straight to NetHack, because `input_router.gd:75` only intercepts `i`. Only the action bar and the pile peek use `open_ground`.
- **Proposal:** when the pile is known and holds no shop goods, open ContainerScreen ground mode for `,` too. For shop piles, show the same two panes and answer NetHack's menu by `objectId`, using `pick_ids` in the sequence engine. Price tags come from the row text. The `,` key still opens it.

**2–3, 28. Cast and spellbook.** `getspell` in `spell.c:715` and `dovspell` in `spell.c:2021` both call `dospellmenu` (`spell.c:2075`). That function is tagged `spell.rows` (`spell.c:2090`) and sends per-spell rows (`spell.c:2137`): name, selector, level, Pw, failure and retention. The school appears only in the menu text. Reordering runs a second menu, "Reordering spells; swap 'a' with", with the first spell preselected.
- **Proposal:** a grid of spell cards. Each card shows the spell's tile (`force-bolt`, `sleep` and the like exist; `spellbook-class-icon` is the fallback), a school chip, the Pw cost greyed out when current Pw is too low, a failure bar coloured like now, and retention.
- Cast mode: click or letter casts. View mode: drag a card onto another to swap (sends letter, then letter). Sort chips send `+` then the sort letter.
- **Bridge:** add `school` (from `spelltypemnemonic`) to the spell row. This is additive, public, and can be gated.

**4. Item menus from `?` / `*`.** Pressing `?` or `*` at a `getobj` prompt (`invent.c:1963-1979`) opens `display_pickinv` as PICK_ONE with an empty title. QuestionDialog already shows the `?` list inline. The menu still appears when a player types `?` out of habit, or uses `*`.
- **Proposal:** InventoryScreen in pick mode. Title it "Eat what?" using the question Godot just showed. Highlight the items that fit and dim the rest. Keep a Bare-hands chip when `-` is offered.
- The verb could also be tagged in the bridge (`inventory.objectChoice`, reason = word) for safety.

**5. `D` drop several.** `menu_drop` in `do.c:996` first calls `query_category("Drop what type of items?")` (`pickup.c:1235`). Those rows have no glyph, and their identifier is the class symbol. Then it calls `query_objlist("What would you like to drop?")` (`do.c:1086`).
- **Proposal:** one screen. The pack grid has checkboxes, filter chips (class, B/U/C/unknown, just picked up, unpaid) and steppers for stack counts. On confirm, Godot answers the type step with "All types" and picks rows by `objectId`. Class icons: `potion-class-icon`, `weapon-class-icon` and the rest.

**6, 21. Discoveries.** `dodiscovered` (`o_init.c:764`) writes an NHW_TEXT window: "Discoveries, by order…", class headings, and lines such as "* scroll of identify (KIRJE)" or "potion called X (puce)". A leading `*` marks pre-known types, and remembered prices are added (`o_init.c:720`). `doclassdisco` (`o_init.c:891`) asks for the class first. Nothing is tagged.
- **Proposal:** a Codex with one tab per class (class icons). Each entry is a card: appearance art, then the identified name, then the tile. Show the called name and a Rename button (sends `#call` → `d`), a "known from the start" mark, and price chips.
- **Bridge:** a typed `discoveries.rows` event: class, actual name, appearance, called name, pre-known flag, price quote. It is exactly what the list already shows, so nothing is spoiled. `rename_disco` (`o_init.c:1131`, "Pick an object type to name") reuses the Codex in pick mode.

**7. Overview.** `dooverview` (`dungeon.c:3305`) calls `show_overview` (`dungeon.c:3316`) and `print_mapseen` (`dungeon.c:3527`). It is a read-only menu with no title. It contains a branch heading, "Level N: \"note\" <- You are here.", feature sentences (shops, temple to a god, fountains), Oracle / Sokoban solved / castle, and branch stairs. `m` + ^O makes it PICK_ONE, which leads to `query_annotation` (`dungeon.c:2511`).
- **Proposal:** a vertical dungeon tree, one column per branch. Each level row shows feature icons (`altar`, `fountain`, `throne`, `sink`, `grave`, `tree`, `shopkeeper`, `branch-stairs-down`, `magic-portal`), a glowing hero marker, and the note inline with an Edit button (sends `m` then #overview). Uses the "Depth N" wording.
- **Data:** text parse works. A typed `overview.rows` from `print_mapseen` would be safer.

**8. Identify.** `menu_identify` in `invent.c:2655` runs `query_objlist("What would you like to identify first/next?")` as PICK_ANY and loops. Rows carry `objectId`.
- **Proposal:** a pack grid of unidentified items. Don't show how many picks are allowed; that number is hidden. Each name NetHack prints flips its card with a short reveal.

**9. #name / #call.** `docallcmd` (`do_name.c:499`) builds "What do you want to name?" (`do_name.c:550`) with six rows: m, i, o, f, d, a. They lead to getpos, `getobj`, `rename_disco` and `donamelevel` (`dungeon.c:2582`).
- **Proposal:** six large choice tiles with icons (a monster tile, item art, class icon, `pickup-action-icon`, a Codex icon, a map pin). Letters still work. The follow-up opens the matching picker: map target, InventoryScreen pick mode, Codex pick mode, or the line prompt.

**10. Pray.** `dopray` (`pray.c:2199`) asks "Are you sure you want to pray?" (`pray.c:2210`). The bridge tags it only `prompt.question`.
- **Proposal:** a prayer card: the god's name and alignment, troubles the player can see (low HP, Weak, ill, stoned, strangled, all from StatusEffects), and "last prayed on turn N", tracked from the feed. Never show the prayer timeout or luck. Default answer is No.
- **Bridge (optional):** tag `prompt.pray` and send the god name.

**11. ^X attributes.** `doattributes` (`insight.c:2009`) calls `enlightenment` (`insight.c:383`) as a read-only, untitled menu. It has a title line, then sections: "Background:", "Basics:", "Characteristics:", status lines, "Miscellaneous:".
- **Proposal:** a character sheet: avatar (`*-role-avatar`), identity and gods, HP/Pw/AC/gold bars, six stat bars, and status lines grouped with the StatusEffects icons. This also closes the gap with Electron's `character-sheet.js`.
- **Data:** parse by section headers. A tag such as `character.attributes` needs the bridge change above.

**12. Opening lore.** `com_pager("legacy")` (`allmain.c:4537`) goes to `deliver_by_window` (`questpgr.c:439`), an NHW_TEXT window. Godot already logs it as lore (`game_state.gd`).
- **Proposal:** a full-screen parchment that reveals the text, with the role avatar and highlighted god names. Any key continues.

**13. Shops.**
- `price_quote` (`shk.c:5427`, from #chat at `sounds.c:1290`) shows "Fine goods for sale:".
- `dounpaid` (`invent.c:3721`) is reached through `Iu`; `doinvbill` (`shk.c:4218`) through `Ix`.
- `menu_pick_pay_items` (`shk.c:~1680`) gives "Pay for which items?" (`shk.c:1738`). MenuDialog already treats that one as "paying".
- **Proposal:** one shop ledger with Goods here / On your bill / Used up tabs. Each row shows art, name and price; totals sit next to your gold, with Pay. Price-ID notes link to the Codex.
- **Bridge (optional):** typed bill rows with `objectId`, price and used-up flag.

**14. `/` and the encyclopedia.** `do_look` (`pager.c:1673`) builds "What do you want to look at:" (`pager.c:1803`) with nine choices. `checkfile` (`pager.c:830`) asks "More info about "X"?" and opens a text window (`pager.c:1080`). `;` gives a feed message, plus a lookup when Godot's look mode ends verbose.
- **Proposal:** a chooser with large tiles. The encyclopedia page shows the subject's tile (name from the question), the title, and the quote in book type with its source.

**15. `I`, `*`, item actions.**
- `dotypeinv` (`invent.c:3894`) asks "What type of object do you want an inventory of?", then calls `display_inventory`.
- `doprinuse` (`invent.c:4813`) calls `dispinv_with_action` (`invent.c:3005`).
- Picking an item opens `itemactions` (`iactions.c:278`), "Do what with X?" (`iactions.c:706`).
- **Proposal:** `I` opens InventoryScreen with that class filter, and `*` opens EquipmentScreen, the same way `i` opens InventoryScreen now. The item-actions menu shows the item card's verbs.

**16. #terrain.** `doterrain` (`cmd.c:1115`) asks "View which?" with three choices in normal play, the first preselected. Then `reveal_terrain` (`detect.c:2356`) draws NetHack's map and waits at a map target.
- **Proposal:** a small card with three segmented buttons and icons (floor, `arrow-trap`, an object). Then a banner: "Showing known terrain — Esc to return".

**17. #conduct.** `show_conduct` (`insight.c:2089`) writes "Voluntary challenges:" lines. Achievements stay hidden during play on purpose (`insight.c:2252`); keep it that way.
- **Proposal:** a medal per conduct, lit when kept and dim when broken, using NetHack's own sentence as the caption.

**18. #chronicle.** `show_gamelog` (`insight.c:2561`) writes "Logged events:", then " Turn", then "%5ld: text" lines, with spoiler events filtered out.
- **Proposal:** a vertical timeline: turn number, event text, icon.
- **Bridge (optional):** send the event-type flags (`LL_*`), so icons aren't guessed from text.

**19. Options.** `O` runs `doset_simple` (`options.c:8726`), which loops on `doset_simple_menu`. That menu is titled "Options", PICK_ONE, with section headings and rows like "autopickup [X]". Compound options open handler sub-menus or "Set X to what?". `#optionsfull` gives `doset` "Set what options?" (`options.c:8922`), the only case MenuDialog currently special-cases.
- **Proposal:** a NetHack tab in Settings: toggles and dropdowns per section. Options Godot controls (menustyle, number_pad) are locked with a one-line reason.
- **Bridge (later):** typed option rows (name, type, value, choices).

**20. #vanquished / #genocided.** `dovanquished` (`insight.c:2769`) calls `list_vanquished` (`insight.c:2784`): "Vanquished creatures:" with counts and an optional sort menu via `set_vanq_order` (`insight.c:2718`). `dogenocided` (`insight.c:3135`) calls `list_genocided` (`insight.c:3007`).
- **Proposal:** a bestiary grid of monster tiles with ×N badges, grouped by class. Genocided species are crossed out. Sort chips send `m` + the command.

**22. #adjust.** `doorganize` (`invent.c:5054`): `getobj` "adjust", then `doorganize_core` (`invent.c:5141`) asks "Adjust letter to what […]?". QuestionDialog already draws a letter grid. `?` opens `display_used_invlets` (`invent.c:3534`).
- **Proposal:** drag one item onto another slot in InventoryScreen, which sends `#adjust`, then the letter, then the target letter.

**23. Travel.** `dotravel` (`cmd.c:5365`) uses getpos, which is the banner, not a menu. `m_` uses `getpos_menu` (`getpos.c:665`).
- **Proposal:** a destination list for `_`: stairs, ladders, altars, fountains, doors and remembered piles on this level, with icons and distance. Picking one sends `map-click`. The `<`, `>` and `_` keys keep working.

**24. Quest and Oracle.** `deliver_by_window` (`questpgr.c:439`) and `outoracle` (`rumors.c:641`).
- **Proposal:** a story card styled as a vision or letter. A tag (`story.quest`, `story.oracle`) needs the text-window context change.

**25. `?` help.** `dohelp` (`pager.c:2860`), "Select one item:".
- **Proposal:** fold it into HelpScreen as a "NetHack's own pages" section.

**26. Loot and tip choosers.** `doloot_core` (`pickup.c:2187`, "Loot which containers?" at `pickup.c:2267`) and `dotip` (`pickup.c:4450`, menu at `pickup.c:4424`).
- **Proposal:** container cards with art, then ContainerScreen.

**27. `A` take off several.** `menu_remarm` (`do_wear.c:3912`) runs the category menu, then "What do you want to take off?".
- **Proposal:** EquipmentScreen with checkboxes on the paper doll.

**29–30. Minor ones.** #herecmdmenu and #therecmdmenu are already covered by ContextMenu. Wish help (`zap.c:6212`), tribute novels (`files.c:3570`) and the getpos help (`getpos.c:167`) can stay in the reader; give the novel a book style.

## Bridge additions, in order of value

All additive, public, and gated by `NH_BRIDGE_EXTENDED` where Electron's output would change:

1. Carry `shim_native_menu_context` onto the next `display_nhwindow`, and tag the text-window call sites listed above.
2. `discoveries.rows`.
3. `overview.rows`.
4. `school` on spell rows.
5. The getobj verb tag.
6. Typed shop bill rows.
7. Option rows.

## Status (2026-10-18)

| # | Menu | Status |
|---|---|---|
| 1 | `,` pick up | Done: ContainerScreen ground mode (`open_ground`) |
| 2, 3, 28 | Cast, spellbook, sort | Done: SpellsScreen (school from the bridge) |
| 4, 8, 15 | Item menus (`?`/`*`, identify, take off) | Done: ItemPickScreen (`item_picks`, `identify_pick`); `I`/`*` keys open InventoryScreen/EquipmentScreen |
| 5 | `D` drop several | Done: ContainerScreen drop mode (`open_ground(true)`) |
| 6, 21 | Discoveries | Done: CodexScreen (text parse) |
| 7 | Overview | Done: OverviewScreen (text parse) |
| 9, 14, 16 | #name, `/` look, #terrain | Done: ChoiceScreen tiles; #terrain banner (`choice_menus`) |
| 10 | Pray | Done: prayer facts on the question card |
| 11 | ^X | Done: CharacterSheet |
| 12, 17, 18 | Lore, conduct, chronicle | Done: RecordScreen |
| 13 | Shop lists | In progress: ShopLedgerScreen |
| 20 | #vanquished / #genocided | Done: BestiaryScreen (`bestiary`) |
| 23 | Travel | Done: destination chips on the travel banner (`travel_picker`) |
| 19, 22, 24–27, 29, 30 | Options, #adjust, quest/Oracle, help, loot/tip choosers, `A` category, minor | Open |
