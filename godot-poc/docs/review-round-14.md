# Godot front end review, round 14

Date: 2026-10-18. Scope: the commits `b4984227d` to `d9335f68d` (`git log b4984227d^..d9335f68d`), the purpose-built screens that replace NetHack's plain menus and text windows:
- **Menus:**
  - `ChoiceScreen` (#name, #terrain, `/`);
  - `ItemPickScreen` (getobj `?`/`*` lists, `/` "something you're carrying", identify, `A`);
  - the prayer facts on `QuestionDialog`.
- **Documents:** `CharacterSheet` (^X), `CodexScreen` (`\`), `OverviewScreen` (^O), `RecordScreen` (conduct, chronicle, lore), `BestiaryScreen` (#vanquished, #genocided) and `ShopLedgerScreen` (price quotes, Iu, Ix).
- **Routing:**
  - `DialogHost._on_request` order, `_document_screen`, `next_menu_title`;
  - the travel chips and the #terrain banner;
  - the new `I * [ = " ( )` keys in `InputRouter`;
  - the "Your bill" button in `InventoryScreen`.
- **State and art:** `GameState.next_menu_title` and `skill_ready`, and the removal of `Terrain.BACKGROUND_CMAPS`.
- **Tests:** `choice_menus`, `item_picks`, `identify_pick`, `bestiary`, `travel_picker`, `shop_ledger`, `documents`, `classic_keys_screens`, `status_onset` (prayer), `item_appearances`.

Some files named in the brief were not in this range:
- The C changes it mentions (`src/weapon.c` skill extras and slots, `src/spell.c` spell school) are in `378554c97`, the commit before the range. `SpellsScreen`, `SkillsScreen`, `tile_resolver.gd` and `menu_dialog.gd` have no changes in the range either. They were read where the new code depends on them, but they weren't reviewed line by line.
- The range has no Electron code changes, only `assets/tiles/manifest.json` and three new fixture JSONs.
- Two commits landed while this review ran: `99a3862ec` (O options page) and `277d46db9` (help menu as tiles). They aren't reviewed here. They insert `OptionsScreen` into `_on_request` and a help menu into `ChoiceScreen.MENUS`, so line numbers below follow the working tree at `277d46db9`.

The lenses:
1. Correctness against NetHack: each screen should answer NetHack's menu as tty would, and no routing rule should catch another menu or text window.
2. UX quality, from the code and the screenshots.
3. Architecture: duplication, fragile string matching, dead code and test gaps.

**How the findings were checked**
- This was a read-only review. Nothing was built, run or edited, apart from writing this file.
- Every finding was checked against the code. Claims about NetHack were checked against the C source here:
  - `src/invent.c`:
    - `getobj` 1915–2000 (`?`/`*` lists, `force_invmenu`);
    - `display_pickinv` 3190–3420 and its return at 3440–3475 (Esc gives `'\033'`);
    - `menu_identify` 2655–2690 (`n == -2` on Esc), `identify_pack` 2752–2786;
    - `dounpaid` 3730–3850, `xprname` 2936–2990, `currency` and `currencies[]` 1521–1554.
  - `src/pickup.c`: `query_objlist`'s `SIGNAL_ESCAPE` at 1219–1222.
  - `win/tty/wintty.c`: Esc in a menu (1606–1615) and `tty_select_menu` returning -1 when cancelled (2777–2816).
  - `src/pager.c`: the `/` menu and its group accelerators (1700–1810).
  - `src/do_name.c`: `docallcmd` (498–600) and its group accelerators.
  - `src/cmd.c`: `doterrain` (1139–1171), `dotravel` (5380–5410).
  - `src/detect.c`: `reveal_terrain` (2355–2410), `browse_map` (106–118).
  - `src/insight.c`: `N_times` (360–380), `enlightenment` (385–460), `one_characteristic` (845–920), `list_vanquished` (2850–2935), `list_genocided` (3050–3125), the chronicle title (2570).
  - `src/dungeon.c`: `print_mapseen` (3530–3700), `TAB`/`PREFIX` (3490–3496).
  - `src/o_init.c`: `dodiscovered` (770–870), `doclassdisco` (1040–1120).
  - `src/shk.c`: `doinvbill` (4240–4290), `price_quote` (5430–5480).
  - `src/pray.c`: `critically_low_hp` (116–155), `in_trouble` (197–260).
- Bridge claims were checked in `electron-poc/shim-bridge/nh-shim-bridge.c`:
  - `shim_add_menu` (4304–4330), which drops the group accelerator;
  - `shim_select_menu` (4085–4180), where Esc returns 0;
  - the item `ownership` field (3167–3169).
- Screenshots opened:
  - `choice_menus/01`;
  - `item_picks/03`;
  - `identify_pick/01`;
  - `bestiary/01`;
  - `shop_ledger/02`;
  - `travel_picker/01`;
  - `documents/04`;
  - `status_onset/05`.
- `test-output/` was being rewritten by concurrent runs during the review:
  - `choice_menus` was regenerated at 04:04 with the help-menu step from `277d46db9`.
  - The other folders date from 03:40 to 03:56, after `d9335f68d` (03:57 commit time, 03:55 for the previous two).
- Paths are relative to `godot-poc/project/` unless they start with `electron-poc/`, `src/`, `win/`, `docs/` or `BIBLE.md`.

**Counts:** 0 blocker, 1 high, 7 medium, 9 low (17 in total).

The most serious problems:
- Enter on a pick-one item list picks the first item, so `r ?` then Enter reads the first scroll. In tty, Enter there picks nothing and NetHack asks again (H1).
- Esc in any of NetHack's pick menus returns "nothing picked", not "cancelled". Declining an identify re-prompts five times, telling the player to "use ESC to decline", and Esc on a `?` list goes back to the question instead of "Never mind." (M1).
- ^O loses every branch name once the hero has seen two levels of a branch, and folds the Gnomish Mines into the Dungeons column (M2).

---

## High

### H1. Enter on a pick-one item list uses the first item

**Area:** `ItemPickScreen.handle_key` (`ui/dialogs/item_pick_screen.gd:245-250`), `setup` (`:94-95`), `DialogHost._show` → `GamepadRouter.focus_dialog`.

What happens:
- `setup` declares `slots[0]` the dialog's `safe_focus`, and `_show` focuses it for every dialog (`ui/dialog_host.gd:120`, `input/gamepad_router.gd:180-183`).
- In a pick-one menu, `handle_key` returns `false` for Enter so that "the focused slot" gets it. `InventorySlot` is a `Button`, so Godot's `ui_accept` presses it, and `_on_slot` sends that slot's letter (`:186-192`).
- tty is different:
  - Enter in a pick-one menu with nothing selected commits an empty choice (`win/tty/wintty.c:1618-1620`).
  - `display_pickinv` then returns `'\0'` (`src/invent.c:3474`), and `getobj` loops back to "What do you want to read? [gh or ?*]" (`:1980-1984`).
  - The bridge does the same: Enter with nothing typed returns 0 (`nh-shim-bridge.c:4126`).
- So only Godot turns Enter into "use the first item". The BIBLE rule for safe focus is "A must never confirm by accident" (`gamepad_router.gd:170-171`), and a pack slot isn't a safe answer.
- `ChoiceScreen` does the same when nothing is preselected (`ui/dialogs/choice_screen.gd:90-94`): Enter at `C` names "a monster", and Enter at `/` picks "something on the map". The effect there is harmless, but it still isn't tty's behaviour.

**Failure scenario:** a Wizard with three unidentified scrolls presses `r`, then `?` to see them, then Enter to back out, as she would in tty. Godot sends `g`. She reads the first scroll, an unknown scroll of amnesia, and forgets her map and spells.

**Fix:**
- In pick-one item menus, focus the Cancel button, or no slot, so that Enter sends `\n`, as tty does.
- Let arrow keys and the stick move into the grid explicitly.
- In `ChoiceScreen`, focus a tile only when NetHack preselected it; otherwise Enter sends `\n`.
- Test: `r ?` then Enter. Assert that no turn passed and the "What do you want to read?" question is back.

---

## Medium

### M1. Esc in NetHack's pick menus means "nothing picked", not "cancelled": identify can't be declined, and a `?` list doesn't back out

**Area:** bridge `shim_select_menu` (`electron-poc/shim-bridge/nh-shim-bridge.c:4125`), exposed by `ItemPickScreen._cancel` (`ui/dialogs/item_pick_screen.gd:232-236`).

What happens:
- tty's `select_menu` returns -1 for Esc (`win/tty/wintty.c:1606-1615`, `2795-2799`). The bridge returns 0, the same as Enter with nothing picked.
- NetHack tells the two apart in several places:
  - **Identify.** `query_objlist` turns -1 into -2 under `SIGNAL_ESCAPE` (`src/pickup.c:1219-1222`), and `menu_identify` stops on -2 (`src/invent.c:2678-2679`). On 0 it prints "Choose an item; use ESC to decline." and asks again, up to five times, then prints "That's enough tries!" (`:2683-2687`).
  - **Item lists.** `display_pickinv` returns `'\033'` for -1 and `'\0'` for 0 (`:3474`). `getobj` prints "Never mind." and gives up on `'\033'`, and asks the question again on `'\0'` (`:1980-1990`).
- `classic_keys_screens.gd:69-70` describes "Esc closes the list and returns to the question (as in tty)". That isn't tty: there one Esc on the list cancels the whole command.
- The bridge is shared, so Electron behaves the same. This predates the range, but the new screens put a "Cancel  Esc" button on identify where it can't work.

**Failure scenario:** a hero reads a scroll of identify to identify one thing, and wants to keep the charge for later. She presses "Cancel  Esc". NetHack says "Choose an item; use ESC to decline." and the grid comes back. Esc four more times ends with "That's enough tries!".

**Fix:**
- In the bridge, return -1 when the answer queue gives 27 and nothing has been selected. Keep `"cancelled":true` in the answer event.
- Check Electron's menu callers for anything that relies on 0.
- Correct the comment in `classic_keys_screens`.
- Tests: Esc on the identify grid prints no "Choose an item" line. Esc on `e *` returns to the command prompt in one key, with "Never mind.".

### M2. ^O loses the branch names and merges branches once a branch has two levels

**Area:** `OverviewScreen._parse` (`ui/dialogs/overview_screen.gd:56-64`).

What happens:
- A branch heading is recognised only if it ends with ":".
- NetHack writes "The Dungeons of Doom:" only while the hero has reached a single level of that branch. After that it writes "The Dungeons of Doom: levels 1 to 4", or "…: levels N up to M" for branches that build up (`src/dungeon.c:3550-3562`).
- That heading then matches no rule:
  - Before any level it is dropped, so the column is titled "THE DUNGEON".
  - After a level it is appended to that level's `details` (`:61-62`).
- `documents` only runs ^O on depth 1 (`test-output/documents/04-overview.png`), where the heading still ends with ":".

**Failure scenario:** a hero on Mines level 4 (Dungeons levels 1–3 seen, Mines 3–4) presses ^O. The first column is "THE DUNGEON". It lists levels 1–3, then 3 and 4 again, with "The Gnomish Mines: levels 3 to 4" as a detail line under Dungeons level 3. "You are here" lands in the wrong column.

**Fix:**
- Treat any unindented line that isn't a "Level N:" line as a branch heading, and take the name before ": levels". The heading also comes as an `add_menu_heading` row with the heading attribute, which is a better signal.
- Add a deep test on a fixture at Mines depth 2 or more.

### M3. `/` "something you're carrying" can be titled with an old question

**Area:** `ItemPickScreen.setup` (`ui/dialogs/item_pick_screen.gd:68-79`), `GameState._last_question` (`state/game_state.gd:94-99`, `319-321`).

What happens:
- For an untitled menu, the title comes from `last_question()` when it starts with "what do you want to". Only after that does it use `next_menu_title`, which `ChoiceScreen` set to "Look up which item?".
- `_last_question` is the last yes/no question of the whole game. It is never cleared, so `/` → `i` takes whatever getobj question came last.
- `item_picks` part 1 runs `/ i` before any other question, so it passes.

**Failure scenario:** the hero drinks a potion (`q`, "What do you want to drink? [fg or ?*]"), then a few turns later presses `/` and picks "something you're carrying". The grid is titled "What do you want to drink?", with the hint "Click an item or press its letter.". The player backs out, afraid of drinking something, although the menu only looks things up.

**Fix:**
- Prefer `next_menu_title` when it is set.
- Use `last_question` only while that question is the request just answered (getobj's `?`/`*`). For example, clear `_last_question` at the command prompt, as `next_menu_title` is.
- Test: `q` then Esc, then `/ i`. The title must be "Look up which item?".

### M4. NetHack's group accelerators are dropped: `/ y`, `/ n`, `C y`, `C n` and the lootabc keys do nothing

**Area:** bridge `shim_add_menu` (`electron-poc/shim-bridge/nh-shim-bridge.c:4308`, the `(void)va_int_arg` is the group accelerator), `ChoiceScreen.handle_key` (`ui/dialogs/choice_screen.gd:160-174`).

What happens:
- NetHack gives these menus hidden accelerators "to keep backwards compatibility with the old y|n behavior" (`src/pager.c:1714-1728`):
  - `/`: `y` for "something on the map", `n` for "something else". With `lootabc`, `/` and `?` instead, plus `m M o O t T E`.
  - #name: `C` monster, `y` particular object, `n` type in inventory, `,` floor, `\` discoveries, `l` annotation (`src/do_name.c:521-547`).
- The bridge drops the accelerator in `shim_add_menu`, so neither the select loop (`:4085-4180`) nor Godot knows about it.
- `ChoiceScreen.handle_key` swallows every key that isn't a row's selector (`return true`). Nothing happens, and no message says why.
- With `lootabc` on, the shown selectors become `a b c…`, and the documented `/` and `?` keys are the only "classic" ones left.

**Failure scenario:** a veteran types `/` `y` (or `;`-style `/ y .`) to look at a monster. The tile screen stays open and the `y` does nothing. Same for `C n` to call a potion type.

**Fix:**
- Send the accelerator as `groupAccelerator` on each row, and make the bridge's select loop accept it: select every row whose accelerator matches, as tty does.
- In `ChoiceScreen`, answer with the row's selector when its accelerator is typed.
- Test: `/ y` reaches the map target, and `C n` reaches "What do you want to call?".

### M5. `-` doesn't answer "bare hands" in a pick-one item list

**Area:** `ItemPickScreen._build` (`ui/dialogs/item_pick_screen.gd:109-117`), `handle_key` (`:257-267`).

What happens:
- The `-` row (bare hands, fingertip, nothing) becomes a footer button and isn't in `slots`.
- In `handle_key`, a typed `-` matches no slot. The only `-` rule is "clear all" for pick-any menus, so in a pick-one menu the key is swallowed.
- In tty, `-` selects that row (`src/invent.c:3311-3316`), and `getobj` returns `&hands_obj`.

**Failure scenario:** the hero presses `w`, `?`, sees her weapons, and types `-` to fight bare-handed. Nothing happens until she clicks "Your bare hands  -", whose own label tells her `-` is the key.

**Fix:** in pick-one menus that have a `-` row, send `-` and close, as the footer button does. Add the key to `item_picks` part 3.

### M6. The prayer card gets NetHack's low-HP rule wrong and calls ordinary statuses "troubles"

**Area:** `QuestionDialog._build_prayer_facts` (`ui/dialogs/question_dialog.gd:297-328`).

- **HP.**
  - The card says "Hit points low" when `hp < 5 or hp * 7 < hp_max` (`:302`).
  - NetHack's major trouble is `curhp <= 5 || curhp * divisor <= maxhp`. The divisor is 5 at XL 1–5, 6 at 6–13, 7 at 14–21, 8 at 22–29 and 9 at 30. Max HP is capped at 15 × XL (`src/pray.c:116-155`, used at `:220`).
  - So the card misses exactly the cases where praying would heal: HP 5 at any level, and HP 12–13 of 80 at XL 8. There it says "You see no trouble on yourself."
- **Statuses.**
  - Every "deadly" or "serious" status badge is listed in red as a trouble (`:304-306`). That includes Stressed, Strained, Trapped, Grabbed, Held, Underwater and Asleep (`ui/status_effects.gd:23-46`), none of which is a prayer trouble (`src/pray.c:197-260`).
  - Hungry is a minor trouble (TROUBLE_HUNGRY) and isn't listed.
  - `status_onset/05-pray-question.png` shows "Troubles you can see: Blind, Confused." in red on turn 6. Praying there for minor troubles with the starting prayer timeout angers the god. The red framing invites exactly that prayer.
- The BIBLE forbids hidden information. A trouble list built from NetHack's internal thresholds is close to that line, and this one is also inaccurate.

**Failure scenario:** an XL 8 Samurai at 13 of 80 HP reads "You see no trouble on yourself." and doesn't pray. NetHack would have counted that as major trouble and healed her.

**Fix:**
- Drop the "trouble" judgement. Show facts the player can read anyway: "HP 13 of 80", the status badges as they are (neutral colour), and the last prayer from the log.
- If a trouble line is kept, compute it with `critically_low_hp`'s rule and limit it to NetHack's actual trouble list.

### M7. NetHack's `I` is gone: Ix can't be reached, and the "Your bill" button hides bagged unpaid goods

**Area:** `InputRouter._handle_key` (`input/input_router.gd:84-90`), `InventoryScreen._rebuild` (`ui/dialogs/inventory_screen.gd:178-187`), `ShopLedgerScreen` "used".

What happens:
- Typed `I` now opens Godot's inventory, so NetHack's `I` (dotypeinv) can't be reached by key. That loses:
  - `Iu` (bill);
  - `Ix` (used-up charges);
  - `IB`/`IU`/`IC`/`IX` (by BUC).
- The replacement for `Iu` is the "Your bill" button, shown only when a top-level pack item has `ownership.state == "unpaid"`. The bridge sets that from `otmp->unpaid` of the item itself (`nh-shim-bridge.c:3167-3169`). The button is therefore hidden when:
  - the only unpaid goods are inside the hero's own sack: NetHack's Iu lists them under "Unpaid Bagged/Boxed items" (`src/invent.c:3781-3815`);
  - the hero owes only for used-up goods (Ix), for example after eating an unpaid food ration.
- Nothing ever sends `Ix`, so `ShopLedgerScreen`'s "used" layout is unreachable.

**Failure scenario:** a hero puts two unpaid scrolls into her sack and eats an unpaid apple. The inventory shows no bill button, `I` opens the inventory, and she has no way to see what she owes before `p`.

**Fix:**
- Keep `I` as NetHack's command, so the class menu (and `u`, `x`) appears. Alternatively, give the inventory "Unpaid" and "Used up" entries that send `Iu` and `Ix` whenever NetHack would list something there.
- The bridge could send `hasUnpaidContents` on containers, and a debit/used-up count.
- Test: ledger "used" after eating an unpaid item, and bagged unpaid goods.

---

## Low

### L1. `BestiaryScreen` doesn't parse "(twice)" and "(thrice)" for unique monsters

- `N_times` writes "once", "twice", "thrice", or "%ld times" (`src/insight.c:360-380`).
- The pattern `^(.+) \((\d+|twice|thrice|once) times?\)$` (`ui/dialogs/bestiary_screen.gd:55`) requires " time(s)" after every word, so "the Wizard of Yendor (twice)" stays the name.
- The card then reads "Wizard of Yendor (twice)" with no ×2 and no art.
- **Fix:** `^(.+) \((?:(\d+) times|(once|twice|thrice))\)$`.

### L2. Shop ledger parsing: hallucinated currency, "the contents of", and option-dependent formats

**Area:** `ShopLedgerScreen.kind_of` and `_parse` (`ui/dialogs/shop_ledger_screen.gd:17-30`, `64-96`).

- **Hallucinated currency.** While hallucinating, `currency()` picks from `currencies[]` (`src/invent.c:1521-1553`). Several of those are more than one word ("Altarian Dollars", "credit chits", "Triganic Pus").
  - Both patterns end in `\d+ \S+$`, so those rows fail.
  - On the bill they become class headings, and the Total row becomes a heading too.
  - In the price list they are dropped.
  - Prices always read "zm", even while NetHack is saying "Altarian Dollars".
- **"the contents of".** The price list strips "the contents of " (`:65`). A sack whose contents are for sale then shows as "a sack, 120 zm", as if the sack itself cost 120.
- **Recognition depends on options.**
  - `Iu` is recognised only by a first line starting "Unpaid ", which needs `sortpack` (`src/invent.c:3760-3765`). Without it, the bill falls back to the plain reader.
  - The "(There are N more unpaid objects on the floor.)" line (`:3843-3846`) becomes a heading.
- **Fix:**
  - Match the price as `(\d+) .+$`, and keep NetHack's currency words.
  - Keep "The contents of" in the row name.
  - Recognise the bill by its `* - Total:` row alone, and keep non-row lines as notes.

### L3. `CharacterSheet` for a potion or wand of enlightenment shows empty cards and numbers NetHack didn't write

- `enlightenment()` always titles its window "<Name> the <Rank>'s attributes:" (`src/insight.c:397-403`). Magic enlightenment (potion, wand, throne) has no Background, Basics or Characteristics sections (`:405-423`).
- `CharacterSheet` still draws:
  - an empty "BACKGROUND" card (`ui/dialogs/character_sheet.gd:90`);
  - an empty "CHARACTERISTICS" panel;
  - HP, energy, AC and gold tiles taken from the status line (`:140-150`).
- The class comment says "Nothing is added to what ^X says".
- **Fix:** draw the portrait, tiles and bars only when the text has those sections. Otherwise show the sections as cards.

### L4. `` ` `` (discoveries by class) never opens the codex

- `CodexScreen.recognises` wants a first line starting "Discoveries" (`ui/dialogs/codex_screen.gd:20`).
- `` ` `` writes "Discovered weapons in order of discovery", or opens with an "Unique items or Relics" or "Artifacts" heading (`src/o_init.c:1046-1088`). So it gets the plain reader, although the class comment says `` ` `` is covered.
- **Fix:** also accept "Discovered " and those headings, or correct the comment.

### L5. The #terrain banner and travel chips

**Area:** `DialogHost._on_request` "map_target" (`ui/dialog_host.gd:280-298`), `_show_banner` (`:393`).

- **#terrain wording.** The banner always says "with monsters and things out of the way". The second and third views keep traps, or traps and objects (`src/cmd.c:1142-1153`, `src/detect.c:2390-2404`). "Showing underlying terrain only..." (explore and wizard mode) gets the generic "Choose a spot" banner.
- **Travel chips.**
  - Labels repeat ("Fountain", "Fountain") with nothing to tell them apart.
  - Chips are `FOCUS_NONE`, so a gamepad can't reach them, though the pad hint offers "Pick a spot with the stick, or a place:".
- **Fix:**
  - Build the #terrain banner from NetHack's own "Showing … only..." line.
  - Add direction and distance to repeated travel labels ("Fountain, 8 east").
  - Give the pad a way to cycle the chips (bumpers), or drop "or a place" from its hint.

### L6. Option-dependent menus fall to the wrong screen

- **`force_invmenu`.** NetHack adds "* - (list everything)" or "? - (list likely candidates)" to every getobj menu (`src/invent.c:3395-3420`). `ItemPickScreen.routes` needs every row to be a pack item, so these menus never reach the item grid.
- **"Name or call".** For #name a particular object, the menu's title is "What do you want to name?" (`:1973-1975`), the same as `docallcmd`. `ChoiceScreen.menu_for` then catches it and shows the pack as text tiles headed "Name or call".
- **Traditional menus.** At "What kinds of thing do you want to drop?", `i` shows an untitled list (`src/pickup.c:227-229`). The grid calls it "Choose an item", with "Click an item or press its letter.", although picking does nothing there.
- **Fix:**
  - Let `routes` accept the `*`/`?` extra rows as buttons.
  - Make `menu_for` require the docallcmd row texts, not just the prompt.
  - For PICK_ONE lists outside getobj, say "Your pack" with no call to action.

### L7. Pick-any keys differ from tty

**Area:** `ItemPickScreen._toggle` and `handle_key` (`ui/dialogs/item_pick_screen.gd:194-205`, `254-267`).

- A count typed before a letter that is already picked deselects the item. In tty it sets the count and keeps the item picked.
- `.` (select all), `@` (invert) and `~` (invert page) are missing. `,` selects all rather than the page, which is fine for one page.
- Esc while a count is being typed cancels the whole menu. tty only drops the count (`win/tty/wintty.c:1606-1616`).
- **Fix:** match tty for these keys. Esc with a pending count clears the count.

### L8. String matching where the core already knows

- Routing is decided by text in several places:
  - the travel and #terrain banners by the last three messages (`ui/dialog_host.gd:280`, `290`);
  - six document screens by their first lines (`_document_screen`, `:329-360`);
  - `ChoiceScreen` by prompt prefix;
  - `ItemPickScreen.routes` by prompt words ("drop", "pay for", "what type"…).
- The core has the facts:
  - `iflags.getloc_travelmode` and `iflags.terrainmode` are set around these getpos calls (`src/cmd.c:5387`, `src/detect.c:114`);
  - the bridge already tags menus with a purpose through `emit_native_menu_context` (for example `disclosure.finalInventory`, `skill.rows`).
- **Fix:**
  - Tag `map_target` with `getposPurpose` (travel, terrain).
  - Tag documents with a purpose (`enlightenment`, `discoveries`, `overview`, `vanquished`, `genocided`, `bill`, `usedup`, `pricequote`, `conduct`, `chronicle`).
  - Route on those tags, and keep the text checks only as a fallback for older cores.

### L9. Duplication, dead entries and test gaps

- **Duplication.**
  - Six document screens repeat the same "any key closes" `handle_key` (bestiary, ledger, record, character sheet, codex, overview).
  - They also repeat the scroll and gold-heading builders.
  - A small `DocumentCard` base would hold these.
- **Dead entries.** `ChoiceScreen.MENUS` has a "legacy" row (`ui/dialogs/choice_screen.gd:22`) that matches no #terrain row. The wizard row is "legend of base-36 levl[][].typ codes".
- **Paths no scenario reaches:**
  - Enter or Esc on a pick-one list (H1, M1);
  - declining identify (M1);
  - ^O beyond depth 1 (M2);
  - `/ i` after another question (M3);
  - accelerators (M4);
  - `-` in the wield list (M5);
  - #genocided;
  - vanquished with class headings or uniques;
  - the price list and the used-up ledger;
  - travel chips on a pad.
- **Weak assertion.** `identify_pick`'s "Confirm answers" (`tests/scenarios/identify_pick.gd:47`) passes when a "next" grid is still open. It never checks that the picked item was identified.

---

## Already better than tty (keep these)

- Pack menus show the inventory's own slots, with art, BUC, enchantment and where each item is worn. The full name of the item under the pointer is spelled out (`item_picks/03`, `identify_pick/01`).
- The bill puts each unpaid item next to its art and price, and shows the total against the hero's gold (`shop_ledger/02`).
- #vanquished folds plurals into one card per species with ×N (`bestiary/01`).
- Travel offers the stairs as a one-click destination (`travel_picker/01`).
- `C` shows its six choices with art and NetHack's own words and letters (`choice_menus/01`).

---

## Status (fix pass, 2026-10-18)

| Finding | Status |
|---|---|
| H1 Enter picks the first item | Fixed: pick-one grids and choice tiles start on Cancel (or NetHack's preselected tile); Enter with nothing focused sends `\n`, so NetHack asks again (`item_picks` 4) |
| M1 Esc is "nothing picked" | Fixed in the bridge: Esc returns -1 as tty. Electron's four `!return` checks now read `return > 0`. Identify is declined at once (`identify_pick`), `e *` Esc says "Never mind." |
| M2 ^O branch headings | Fixed: any unindented non-level line (or NetHack's heading attribute) is a branch, named before ": levels"; an orphaned icon row no longer leaks (`overview_branches`, Mines' End fixture) |
| M3 old question as title | Fixed: `next_menu_title` wins; the last question is forgotten at the command prompt (`item_picks` 6) |
| M4 group accelerators | Fixed: the bridge keeps each row's accelerator (`groupAccelerator`) and its select loop accepts it as tty; ChoiceScreen answers it (`choice_menus` 6: `/ y`, `C n`) |
| M5 `-` for bare hands | Fixed (`item_picks` 5) |
| M6 prayer card | Fixed: plain facts only (HP x of y, current states, last prayer), no trouble judgement, neutral colour |
| M7 `I` | Fixed: `I` is NetHack's again (class menu, `u`, `x`, B/U/C/X); "Your bill" stays in the inventory (`classic_keys_screens`). Bagged-unpaid detection still open (needs a bridge field) |
| L1 twice/thrice | Fixed |
| L2 ledger parsing | Fixed: currency words kept, "the contents of" kept, bill recognised by its Total row, other lines as notes |
| L3 enlightenment sheet | Fixed: portrait, tiles and bars only when NetHack wrote those sections |
| L4 `` ` `` codex | Fixed: "Discovered …" and the unique/artifact headings open it |
| L5 terrain/travel | Fixed: banner uses NetHack's "Showing … only" line; repeated travel chips say how far and which way; the pad hint no longer offers chips it can't reach |
| L6 option-dependent menus | Fixed: force_invmenu's `*`/`?` rows are buttons; ChoiceScreen requires its own rows ("What do you want to name?" for one object falls through); untitled lists say "Your pack" |
| L7 pick-any keys | Fixed: count on a picked item sets the count, `.` all, `@`/`~` invert, Esc drops a pending count |
| L8 tags instead of text | Open: route on `getposPurpose` / document purposes from the core |
| L9 duplication, tests | Partly: dead "legacy" row gone, identify asserts the identification; new tests cover H1, M1–M5. DocumentCard base still open |

Electron: `test:architecture` and `menu-metadata-comparison-test.js` fail with and without these changes (stale tests from 2026-09).
