# Godot front end review, round 11

Date: 2026-10-18. Scope: everything in `godot-poc/` after the round-10 fix pass, looking hardest at that pass and the two fixes made right after it:
- the bridge's new `"default"` field on opened `shim_yn_function` (extended mode only), `GameState._open_question`, and `QuestionDialog` preferring `request.default` (focus, Enter, Space and Esc compared with tty);
- `Settings.nethack_options` order, the owned-option filter, `NetHackSession.REQUIRED_OPTIONS` and the Settings note;
- `ContainerScreen._check_batch` (declined names, "×N" grouping, refusal lines);
- the tests `safety._toggle_option`, `partial_pickup` (no-flash check), `gamepad_play` (Enter at the engraving question) and the new `gray_stones`;
- `docs/bridge-protocol.md` §3.11 and §9.6, and the BIBLE's extended-feature list and decision log;
- the post-round changes: `ItemText.icon` for items whose glyph is withheld, `TileResolver._public_appearance_asset` for gray stones, and `TerrainLayer` drawing the hero's square from the pile snapshot.

The lenses are the same as round 10:
1. Functional parity with Electron.
2. UX quality, from the UI code and the screenshots (25 scenarios, all PASS).
3. Architecture and correctness.

**How the findings were checked**
- Read-only review. Nothing was built or run.
- Every finding was checked against the code. UX findings were also checked against the screenshots named in them, except L5, which no screenshot shows (it says so).
- Screenshots opened: `partial_pickup/02`, `03`; `gamepad_play/06`; `safety/01`, `02`; `gray_stones/01`, `02`, `03`; `world_first_look/07`.
- Engine claims were checked in NetHack's source in this repository:
  - `src/cmd.c` (`yn_function` 5536-5648, `paranoid_ynq`), `win/tty/topl.c` (`tty_yn_function` 366-475), `src/pline.c` (`impossible` 584-616), `src/do_wear.c:2279-2296` (ring finger), `src/engrave.c:1142`, `src/shk.c:2122`;
  - `src/options.c` (`parseoptions` 507-541, `duplicate_opt_detection` 6783-6787, `doset` 8922-8972), `src/cfgfiles.c:1920-1975`;
  - `src/pickup.c` (`lift_object` 1770-1797, pickup loops 789-791 and 895-906), `src/do.c` (`dropz` 822-858), `src/invent.c` (`delobj_core` 1438-1459, `useupf` 4836-4856), `src/eat.c:570`, `src/display.c` (`see_nearby_objects` 1617-1645, `newsym_force` 1904-1912, `show_glyph` change test 2056).
- Bridge claims were checked in `electron-poc/shim-bridge/nh-shim-bridge.c`, against `git diff` for what is new. The gray-stone glyph withholding is not in the diff: it is older shared code and applies in both modes.
- `strings` on `project/bin/libnethack_core.so` finds the new `"default"` key. Electron's `nh-shim-bridge` binary (23:39:09) is newer than the bridge source (23:36:44).
- Event logs: every `shim_yn_function` with a `default` in `test-output/*/events.jsonl`, plus the notes in `test-output/gray_stones/godot.log` and `partial_pickup/godot.log`.
- File times: the full run went from 23:39:58 to 23:45:04. `item_text.gd` (23:44:57), `tile_resolver.gd` (23:45:08) and `terrain_layer.gd` (23:46:53) changed during or after it. Only `gray_stones` (23:47:03) ran with all three changes.
- Paths are relative to `godot-poc/project/` unless they start with `electron-poc/`, `src/`, `win/`, `include/`, `docs/` or `BIBLE.md`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 0 high, 1 medium, 7 low (8 in total).

The most serious problem:
- At the classic `P` question "Which ring-finger, Right or Left?", the starting focus is a Cancel button that sends Esc. So Enter, Esc, a click on Cancel and pad B all make NetHack print "Program in disorder!" (M1).

---

## Round-10 verification

- **M1 (Enter never gave NetHack's default): fixed.**
  - The bridge adds `"default"` only in extended mode, only when `def` is a 7-bit character (`nh-shim-bridge.c:3887-3893`). Electron's stream is unchanged.
  - `GameState._open_question` passes it through (`state/game_state.gd:418-420`). `QuestionDialog` prefers it over a "(x)" in the text (`ui/dialogs/question_dialog.gd:31`), styles that button and makes it the starting focus (`:142-144`, `:50-52`). `DialogHost._show` focuses it through `GamepadRouter.focus_dialog` (`ui/dialog_host.gd:112`, `input/gamepad_router.gd:175-189`).
  - **Enter:** it presses the focused button, which is now the default (`question_dialog.gd:260-261`). With the focus outside the dialog, Enter sends the default itself (`:271-273`). This matches tty, where Enter gives `def` (`win/tty/topl.c:472-473`).
  - **Space:** it goes to NetHack as `' '` (`question_dialog.gd:275`), and the bridge turns that into `def` (`nh-shim-bridge.c:3899`). Like tty, Space ignores the highlighted button.
  - **Esc:** it sends `q`, else `n` (`question_dialog.gd:237-245`). That matches tty (`topl.c:464-469`) except when the choices contain neither letter (M1 below).
  - The event logs show the expected defaults: "Do you want to add to the current engraving?" `y`; "Unlock it?" and "…Continue?" `q`; "Really save?" `n`; "Sell it?" `n`.
  - `gamepad_play` asserts the `y` default, "add to the writing" and no "wipe out" (`tests/scenarios/gamepad_play.gd:99-120`). `06-engrave-add-default.png` shows "Yes y" highlighted.
  - The `q` default changes what Enter does inside a pickup. See L1.
- **L1 (option order): fixed.**
  - `parseoptions` handles a comma list right to left, so the leftmost setting is applied last and wins (`src/options.c:507-521`). It also strips any run of `!`, `no` and `no-` prefixes (`:538-541`).
  - `REQUIRED_OPTIONS` (`menustyle:full`) goes first (`game/nethack_session.gd:142,158`). Then come the options Settings owns, the extras, and Godot's other defaults (`game/settings.gd:115-147`).
  - NETHACKOPTIONS is parsed with `from_file` FALSE (`src/cfgfiles.c:1968-1972`), so an extra that repeats an owned option raises no "specified multiple times" error (`src/options.c:6783-6787`).
  - The filter takes `!`, `no` and `no-` (`settings.gd:138`), and `autopickup_exception` still gets through (no word boundary before `_`). The comments and the Settings note (`ui/dialogs/settings_screen.gd:100`) describe the real behaviour. The dead `start_options` comparison is gone (`game_state.gd:427-440`).
- **L2 (only the first declined item was named): fixed for No.** Every declined item is named and repeats are grouped (`ui/dialogs/container_screen.gd:338-350`). `partial_pickup/03-after-partial-pickup.png` reads "2 of 4 moved. You chose to leave a +0 splint mail ×2." The `q` answer is reported wrongly (L1 below).
- **L3 (tests without real input): fixed.**
  - `safety._toggle_option` scrolls the row into view, clicks it, presses Enter and takes screenshots (`tests/scenarios/safety.gd:151-166`).
  - `safety/01` and `02` show NetHack's options menu: letters, values in brackets, the picked row marked, and "'rest_on_space' option toggled on." in the feed.
  - `partial_pickup` counts frames where the floor screen showed while NetHack's questions were open (`partial_pickup.gd:34-45`).
- **L4 (bridge reference gaps): fixed.**
  - §9.6 (`docs/bridge-protocol.md:1758-1783`) covers the hero-pile resend, full menus once per game, worm tails and the question default.
  - The §3.11 gotcha is qualified (`:843-848`), and the BIBLE's extended list includes all of them (`BIBLE.md:45`).
  - The remaining doc gaps are in L7.
- **Post-round fixes:**
  - **Withheld glyphs:** `ItemText.icon` resolves them from the class and the appearance (`ui/item_text.gd:88-112`), and every pack, floor and container icon now has art. `gray_stones` checks that the bridge withholds the glyph. The four stone types look the same, so nothing is given away. The art itself is wrong: L4.
  - **The hero's square:** `TerrainLayer` draws it from the pile snapshot (`world/terrain_layer.gd:167-171`). For a corpse or statue, the pile item's name gives the same art and style as the cell beside it, as far as the code shows. Other actors still use `object_under`. Electron's code is untouched.
  - The action bar still reads the stale layer (L2), and only `gray_stones` ran with this code (L3).

---

## Medium

### M1. Cancelling "Which ring-finger, Right or Left?" makes NetHack print "Program in disorder!"

**Area:** `QuestionDialog._cancel`, `GameScreen._drive_save`, bridge `shim_yn_function` (classic keyboard flow, pad).

- `P` with a ring, and both hands free, asks `yn_function(qbuf, rightleftchars, '\0', TRUE)`. The choices are `"rl"` and there is no default (`src/do_wear.c:2279-2283`).
- `QuestionDialog` finds no `n` or `q`, so it adds a "Cancel Esc" footer button (`question_dialog.gd:47-48`). There is no default button and no "No" button, so Cancel gets the starting focus (`:50-52`).
- **Enter** presses that Cancel button (`:260-261`). Esc, a click on Cancel and pad B do the same. `_cancel` sends keycode 27 when the choices lack `q` and `n` (`:244-245`).
- The bridge returns Esc as it is (`nh-shim-bridge.c:3898`).
- NetHack's core then sees an answer that is not in `"rl"`. It calls `impossible("yn_function() returned '^['; using '^[' instead")`, which prints that line, then "Program in disorder! (Saving and reloading may fix this problem.)" and "Please report these messages to …". It also writes a paniclog entry (`src/cmd.c:5624-5643`, `src/pline.c:584-616`).
- In tty, Esc gives `q`, else `n`, else `def`, and Enter gives `def` (`win/tty/topl.c:464-473`). Here `def` is `'\0'`, so `P` ends quietly (`src/do_wear.c:2284-2286`).
- Closing the window with this question open does the same: `_drive_save` sends 27 (`game/game_screen.gd:189-190`).
- The bridge reference already says to "send ESC only if `choices` contains it" (`docs/bridge-protocol.md:1066`). For `"rl"` no other key cancels, so the client cannot follow that rule.
- No scenario asks this question.
- **Failure scenario:** the player presses `P`, picks a ring, then presses Enter (or Esc) at the finger question to back out. The feed shows three engine-error lines and NetHack suggests saving and reloading.
- **Fix:**
  - In the bridge, map Esc the way tty does when the choices are non-empty and don't contain Esc: `q` if offered, else `n`, else `def` (which may be 0, and NetHack accepts 0). Gate it behind extended mode, or apply it in both modes and run Electron's tests.
  - Correct line 1066 of the reference. NetHack substitutes `def` (or Esc when there is none), not always `n`.
  - Add a scenario: put a ring on with `P`, press Enter at the finger question, and assert there is no "Program in disorder".

---

## Low

### L1. After "Cancel" (`q`) at a lifting question, the floor screen blames NetHack for the rest

**Area:** `ContainerScreen._check_batch` (round-10 L2, and M1's new Enter default).

- Since round 10, Enter at "…Continue? [ynq] (q)" answers `q`, because "Cancel q" is the highlighted default (`partial_pickup/02-lifting-question.png`). Esc already did this.
- `q` stops the whole pickup. `lift_object` returns -1 (`src/pickup.c:1786-1789`), and the pickup loop breaks (`:789-791`).
- `_check_batch` counts the `q` as one declined item (`container_screen.gd:85`). The items NetHack never asked about count as "left beyond the declined ones". No refusal line matches them, so the status ends with "NetHack kept the rest." (`:352-357`).
- **Failure scenario:** in the `partial_pickup` fixture (a dagger and three splint mails), Enter at the first mail question shows "2 of 4 moved. You chose to leave a +0 splint mail. NetHack kept the rest." The player stopped the pickup; NetHack kept nothing.
- The grouped wording "a +0 splint mail ×2" puts an article in front of a count (`03-after-partial-pickup.png`).
- **Fix:**
  - When an answer was `q` or Esc, report the rest as the player's stop: "You stopped the pickup; 1 more left."
  - Write groups as "2 × +0 splint mail".
  - Add a `q` case to `partial_pickup`.

### L2. The action bar still reads the hero square's stale object layer

**Area:** `CellActions.for_cell` (same root cause as the hero-square drawing fix).

- `TerrainLayer` stopped trusting the hero cell's `objectLayer*` fields. `CellActions` still offers "Pick up" when `objectLayerGlyph` is present (`input/cell_actions.gd:49,200-201`), and it still collects `objectLayerActionAffordances` (`:29`).
- NetHack reprints a square only when its glyph changes (`src/display.c:2056`). The hero's glyph doesn't change, so:
  - after a **pickup** the cell is fresh, because pickup forces a redraw (`newsym_force`, `src/pickup.c:903-905`);
  - after a **drop** (`src/do.c:855`), after **eating a floor item to the end** (`src/eat.c:570` → `delobj_core` → `newsym`, `src/invent.c:1459`) and after a corpse **rots away**, the cell stays stale.
- **Failure scenario:** the hero eats the jackal corpse she stands on. The bridge resends the empty pile, so the corpse leaves the map and "Eat from the floor" goes away. "Pick up ," stays on the action bar, and pressing it gets "There is nothing here to pick up."
- The comment at `terrain_layer.gd:168-169` says NetHack doesn't redraw after a pickup. It does; the stale cases are drop, eat and rot.
- **Fix:** on the hero's square, use the pile only. Skip `_has_object_here` and the `objectLayer*` affordances when `cell == hero`, and correct the comment.

### L3. Only one scenario ran the new hero-square drawing, and the corpse check tests the old path

**Area:** testing doctrine (`world_first_look`, `gray_stones`).

- The full run predates the `terrain_layer.gd`, `item_text.gd` and `tile_resolver.gd` changes (see "How the findings were checked"). `world_first_look`, `containers`, `partial_pickup`, `travel_and_transfer`, `inventory_places` and `ui_panels` all draw piles under the hero, and all ran the old code.
- `world_first_look` checks that a corpse looks the same under the hero as beside her through `TerrainLayer.object_under(hero_cell)` (`tests/scenarios/world_first_look.gd:88-93`). The renderer no longer calls that for the hero (`terrain_layer.gd:167-171`), so the check passes whatever the hero path draws.
  - Traced by hand, the new path gives the jackal art (the semantic name maps to `jackal`) and the corpse style (the display name says "corpse"). No test proves it.
- `gray_stones` accepts `gem-class-icon` when `gray-stone` is missing (`gray_stones.gd:15`), so it passes on the fallback art (L4).
- **Fix:**
  - In `world_first_look`, compare `TerrainLayer.pile_item_cell(map.pile(hero)[0])` (asset and `object_style`) with the cell beside the hero.
  - Rerun all scenarios and inspect `world_first_look/07-corpses.png` and `08-pile.png` again.

### L4. Unidentified gray stones are drawn as a rainbow gem

**Area:** art, `TileResolver._public_appearance_asset`.

- The project has no `gray-stone` asset: none in `assets/tiles`, none in `tiles.json`'s `semanticName` map. The gray-stone branch (`world/tile_resolver.gd:319-322`) never runs. Its comment ("a dull rock, not the sparkly gem icon") describes the opposite of what happens.
- `gray_stones/01-gray-stones-in-pack.png` shows four multicolored cut gems under the title "Gray stone". `03-gray-stone-on-floor.png` shows the same gem on the stairs.
- NetHack draws gray stones as a gray `*` so they don't look like gems. Here a loadstone looks like treasure, and gray stones look exactly like unidentified gems.
- **Fix:** generate a `gray-stone` tile under `../ASSET_GENERATION.md`, with Greg's approval as for the newt and the door. As a stopgap, draw `gem-class-icon` desaturated for this appearance. Then make `gray_stones` require the gray art.

### L5. After arrowing off the default answer, two buttons look selected

**Area:** `QuestionDialog` styling (round-10 M1).

- The default answer gets a warm fill and a gold border as its normal style (`question_dialog.gd:142-144`). Focus is drawn as a gold border too (`ui/ui_theme.gd:112-113`).
- **Failure scenario:** at "add to the current engraving?", the player presses → to move from "Yes y" (the default) to "No n". Both buttons now have gold borders. Enter presses No; Space still gives Yes.
- This comes from the code. No screenshot shows the arrowed state: `gamepad_play/06` shows the default while it has the focus.
- **Fix:** mark the default some other way, such as a small "default" caption or a dot, and keep the gold border for focus only. Take a screenshot after one arrow press.

### L6. NetHack's options menu offers "Select all"

**Area:** `MenuDialog` (the classic `O` / `#optionsfull` flow).

- `MenuDialog` adds "Select all" to every pick-any menu except the "what type" menus (`ui/dialogs/menu_dialog.gd:98-101`). `safety/01` and `02` show it on "Set what options?".
- `doset` toggles every picked boolean, then asks for a new value for every picked compound option, one after another (`src/options.c:8926-8972`).
- **Failure scenario:** one click on "Select all" and then Confirm flips about a hundred options at once (`autopickup`, `verbose`, `rest_on_space`, `lit_corridor` …), then starts a long run of compound-option questions.
- tty has the same behaviour behind `.`, but a large button invites the click.
- The hint "Type a number before a letter to take only that many" (`menu_dialog.gd:48`) means nothing in this menu.
- **Fix:** for "Set what options?", hide "Select all" and the count hint.

### L7. The post-round-10 changes aren't recorded

**Area:** `BIBLE.md`, `docs/bridge-protocol.md`.

- The decision log ends at round 10 (`BIBLE.md:213-216`). It doesn't record that items with a withheld glyph get art from their class and appearance, or that the hero's square is drawn from the pile snapshot.
- The "Object layer" section (`docs/bridge-protocol.md:334-345`) doesn't say the layer is only as fresh as the cell's last reprint, or that the hero's cell isn't reprinted after a drop, after eating floor food or when a corpse rots. Both `TerrainLayer` and L2 depend on that rule.
- §9.6 says worm tails carry `actorRole:"tail"`. While the hero hallucinates, they get `actorId:"segment-x-y"` instead (`nh-shim-bridge.c:3386-3392`).
- The roadmap table stops at "Review rounds 2–5" (`BIBLE.md:122-123`).
- **Fix:** add a decision-log line for both changes and the staleness rule to the Object layer section. Note the hallucination case in §9.6. Add rounds 6 to 11 to the roadmap.

---

## Already better than Electron (keep these)

- Rounds 1 to 10's lists still hold.
- Enter, Space and pad A give NetHack's own default at its yes/no questions, as in tty, and the dialog shows which answer that is (`gamepad_play/06-engrave-add-default.png`). Electron never receives the default, because the field is gated to extended mode.
- NetHack's full options menu opens as a searchable list with the current values, and toggles made there stick for the game (`safety/01`, `02`).
- What the player sets in Settings always beats pasted rc options, and the Settings note says so in plain words.
- Unidentified gray stones now have art in the pack, the detail panel, the floor and under the hero. All four types look the same, so the bridge's spoiler guard still holds.
- Right after a drop, the hero's square follows NetHack's real pile: the action bar offers "Pick up ," (`gray_stones/02-gray-stone-under-hero.png`), and the stone shows on the floor once she steps off (`03`).

---

## Status after the fix pass (2026-10-18)

- **M1:**
  - The bridge maps Esc at a `shim_yn_function` the way tty does (`win/tty/topl.c`): `q` if offered, else `n`, else the default. This applies in both modes; Electron's shim was rebuilt.
  - The new `ring_finger` scenario puts on a ring with `P`. It presses Enter, then Esc, at "Which ring-finger, Right or Left?" and checks that `P` ends quietly with no "Program in disorder" and the ring not on. Then `r` puts it on the right hand.
  - `docs/bridge-protocol.md` §4.2 is corrected.
- **L1:**
  - A `q` or Esc during a batch marks it as stopped. The status then reads "You stopped there; N more left." rather than "NetHack kept the rest."
  - Groups read "2 × +0 splint mail".
  - `partial_pickup` now runs a second pickup and presses Enter at the first question (NetHack's default there is `q`). It asserts "0 of 2 moved. You chose to leave a +0 splint mail. You stopped there; 1 more left."
- **L2:** on the hero's square, `CellActions` uses the pile snapshot only, both for "Pick up" and for the object's affordances. The `objectLayer*` fields are ignored there, and the dead `_has_object_here` is removed. The comment in `TerrainLayer` names the real stale cases.
- **L3:** `world_first_look` compares the corpse under the hero through `pile_item_cell(pile[0])`, the path the renderer uses. A full run follows this pass.
- **L4:**
  - A `gray-stone` tile was generated (Qwen on the B70, `tools/art/regen_audit.py`), picked by eye and installed in the shared tileset, with the manifest, tracker and backup updated.
  - `gray_stones` now resolves `gray-stone`. Its screenshots show dull gray pebbles in the pack, the detail panel and on the floor.
- **L5:** the default answer has a warm fill and a small "default" caption, and no gold border. Gold now means focus only (`gamepad_play/06`).
- **L6:** "Set what options?" has no "Select all" and gets its own hint (`safety/01`).
- **L7:**
  - The BIBLE decision log and roadmap (rounds 6–11, art audit) are updated.
  - The protocol's Object layer section now has the staleness rule.
  - §9.6 notes the hallucinating worm tail.
  - The container-snapshot section covers carried containers and containers NetHack has just opened.

**Also in this pass (Greg's play feedback):**
- Every way of opening a container leads to the two-pane screen: `#loot` typed, the palette, Alt-L, applying a carried bag, and the action bar.
  - NetHack still opens the container.
  - `DialogHost._loot_menu_to_screen` answers "do nothing" at its "Do what with…?" menu and opens the screen for that container.
  - The engine's direct container commands accept a carried container, and accept one that `use_container` opened this turn or the last.
- New `loot_redirect` scenario:
  - `#loot` on a box opens the screen without NetHack's menu, and a scroll comes out.
  - Applying a carried sack gives the screen without the sack in the pack column. The dagger goes in by double-click, and two items come out together through NetHack's apply menu.
- Electron's direct-container shim tests pass against the new engine when given a character and line-buffered stdout. As committed, they fail before any container code runs: they start NetHack without a character, and they parse stdout chunks rather than lines.
