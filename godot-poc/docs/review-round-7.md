# Godot front end review, round 7

Date: 2026-10-17. Scope: everything in `godot-poc/` after the round-6 fix pass, looking hardest at the round-6 changes:
- the message feed's word-only hit test and hover-to-wake;
- crash checkpoint protection, setting saves aside, and the title's Recover flow;
- the sequence engine additions (`pick_ids`, `pick_text`, optional steps, the `will_answer` loop) and the cancel fixes;
- the one-turn batch moves in the floor and container screens;
- `open_ground`, the pickup label, and Kick on any neighbouring square;
- the equipment quiver rule and pack strip chips;
- the settings leftovers, `_forces_locks`, per-scenario expected errors, and the changed scenarios.

The lenses are the same as round 6:
1. Functional parity with Electron (`electron-poc/src/ux`, `src/shared`, `src/renderer.js`).
2. UX quality, from the UI code and the screenshots of the full run that finished at 20:42 (21 scenarios, all PASS). No source file is newer than that run, so the screenshots show the current code.
3. Architecture and correctness.

**How the findings were checked**
- Read-only review. Nothing was built or run.
- Every finding was checked against the code. UX findings were also checked against the screenshots named in them.
- Engine claims were checked in NetHack's source in this repository:
  - `src/pickup.c`: `pickup`, `lift_object`, `doloot_core`, `do_loot_cont`, `use_container`, `in_or_out_menu`, `menu_loot`, `query_category`.
  - `src/do.c` (`menu_drop`), `src/dokick.c` (`kick_dumb`, `kick_ouch`), `src/lock.c` (`u_have_forceable_weapon`), `src/display.c` (`show_glyph`).
  - `src/options.c` and `src/cfgfiles.c` (how the config file is read), `include/flag.h` (which options are saved with the game), `src/u_init.c`, `include/objects.h`.
  - `sys/unix/unixunix.c` (`veryold` under `INSURANCE`).
- Bridge claims were checked in `electron-poc/shim-bridge/nh-shim-bridge.c`. The event logs of the run (`test-output/containers/events.jsonl`, `test-output/travel_and_transfer/events.jsonl`) were used to confirm which menus NetHack actually showed.
- Paths are relative to `godot-poc/project/` unless they start with `electron-poc/`, `src/`, `sys/`, `include/`, `util/`, `tests/run.sh` or `docs/`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 1 high, 3 medium, 6 low (10 in total).

The most serious problems:
- When NetHack's "what type of objects?" menu has no "All types" row, a multi-stack move in the container screen does nothing. Sometimes the screen also stays locked at "Moving 2 stacks…" (H1). This happens with a single-class stash with mixed blessed/uncursed knowledge, which is common.
- After a floor batch pickup, the screen and the map model assume everything went up, even when NetHack refused part or all of it (M1).
- "Recover anyway" hides the newer save before recovering. If recovery then fails, the save is gone from the title (M2).
- The player's own `~/.nethackrc` changes Godot games and test runs. It can switch off the full menus the batch engine depends on (M3).

---

## Round-6 verification

- **H1 (feed eats map clicks): fixed.** A line catches the mouse only over its words (`ui/message_feed.gd:48-55`), faded lines let everything through (`:37-43`), and resting on the text wakes the feed (`:182-190`). `descent.gd:107-126` wheels and clicks beside the shortest line. `descent/08-feed-scrolled-back.png` looks right. Leftovers are in L1 and L6.
- **H2 (NetHack reaps checkpoints): fixed.** `game/save_catalog.gd:153-167` runs before every start (`game/nethack_session.gd:145`) and on every title listing (`save_catalog.gd:172`). The age reaping it guards against is real: with `INSURANCE` the size check in `veryold` is skipped (`sys/unix/unixunix.c:44-47,53-70`). `crash_recovery.gd:40-67` ages two copies to four days and checks they survive.
- **H3 (one turn per stack): fixed for the normal path.** `ui/dialogs/container_screen.gd:243-291`, `input/input_router.gd:473-519`. `travel_and_transfer/08-floor-screen.png` reads T8 and `11-floor-picked-up.png` reads T10 after one drop and "Pick up all". The `containers` event log shows exactly the menus the engine expects: "Do what with the large box?" then `o`, "Take out what type of objects?" then `a`, "Take out what?" then the letters. New problems are in H1 and M1.
- **M1 (recover overwrites a save): fixed.** The title asks first (`ui/title_screen.gd:146-157`, `crash_recovery/03-replace-save-question.png`, with Cancel focused), and the old save goes to `save/replaced/` (`save_catalog.gd:206-216`). The failure path is in M2.
- **M2 (Pick up on one item): fixed.** `input/cell_actions.gd:49-55`, `ui/dialog_host.gd:379-389`.
- **M3 (ammunition wielded): fixed.** `ui/dialogs/equipment_screen.gd:213-217,528-530`, `equipment_swaps/06-dragging-to-quiver.png`. Name gaps are in L3.
- **L1 (input-engine leftovers): fixed.** The pad cancels only once it sends (`input/gamepad_router.gd:64-65,113-117,146`). A pending follow-up counts as running (`input_router.gd:415`). `click_cell` respects `answer_pending` (`:200-201`).
- **L2 (identical crashed runs): fixed.** The rows and the title name the role (`title_screen.gd:88-92,178-179`), the portrait follows the crashed hero (`crash_recovery/01-title-with-crash.png`), and the uid is stripped exactly (`save_catalog.gd:194-200`).
- **L3 (floor screen rough edges): fixed as stated.** "Pick up all" is disabled on an empty floor (`container_screen.gd:145`, `11-floor-picked-up.png`), and shop and capacity refusals hand over to `,` or `d` (`:322-334`). Floor-row letters were left with a reason; not re-raised.
- **L4 (strip chips): fixed.** Letter and base name (`equipment_screen.gd:181-185`, "h · quarterstaff" in `06-dragging-to-quiver.png`). The caption hides when the strip is empty (`:200`, `small_window/03-equipment.png`). A new layout problem is in L4.
- **L5 (small leftovers): fixed.** `load_error` clears on save (`game/settings.gd:102`). Reset seeds Reduced motion from the OS (`:135`). F11 moves the open switch (`main.gd:189-192`, `ui/dialogs/settings_screen.gd:59-63`). `_forces_locks` exists (`ui/action_bar.gd:170-174`), with name gaps in L3.
- **L6 (parity leftovers): fixed.** Kick on any neighbour, with a warning for pets and peacefuls (`cell_actions.gd:132-140`). "Space waits a turn" (`settings.gd:123-124`). The UX side is in L2, and the rc interaction is in M3. Replay was left with a reason; not re-raised.
- **L7 (test leftovers): fixed.** `equipment_swaps.gd:27-43` clicks the slot and the row. `ui_panels.gd:215-219` clicks the pile peek. `tests/run.sh:62-65` reads `## expected-error:` per scenario, and only `crash_recovery.gd:10` declares one. New gaps are in L6.
- **Left in round 6 (turn count lag after a direct transfer):** unchanged; not re-raised.

---

## High

### H1. A multi-stack move fails when NetHack's category menu has no "All types" row, and the container screen can lock up

**Area:** container screen batch moves (round-6 H3 fix), sequence engine, engine behaviour.

- **What NetHack does.** For "take something out" and "put something in" under menustyle full, `menu_loot` asks "Take out / Put in what type of objects?" with `ALL_TYPES | UNPAID_TYPES | BUCX_TYPES | CHOOSE_ALL | JUSTPICKED` (`src/pickup.c:4055`).
  - `query_category` skips the menu only when there is one class, nothing unpaid and at most one blessed/cursed status (`src/pickup.c:1298`).
  - The "All types" row exists only when there are two or more classes (`show_a`, `src/pickup.c:1323`).
  - So with one class plus two kinds of BUC knowledge, or one class plus an unpaid item, the menu appears with no "All types" row. It lists "Auto-select every relevant item", the class, and rows like "Items known to be Uncursed".
- **Why that is common.**
  - Starting items are BUC-known (`src/u_init.c:1218`), and so is anything dropped on an altar.
  - A sack holding the starting "uncursed scroll of identify" and an unidentified scroll, or holy water next to uncursed potions, hits this case.
  - For a Priest, any single-class container with mixed blessed and uncursed items does.
- **What Godot does.**
  - `_pick_rows` finds no `objectId` match and no "all types" row, so it returns "" (`input/input_router.gd:500-519`).
  - The engine then sends Esc and clears the sequence and its follow-up (`:476-481`), so `_batch_done` never runs. NetHack goes back to the command prompt with nothing moved and no turn spent.
- **The screen can lock.**
  - The container screen ends a cut-short batch in its own `request_changed` handler, but only when `not screen.input_router._sequence_running` (`ui/dialogs/container_screen.gd:80-87`). The router clears that flag in its own handler (`input_router.gd:462-464`).
  - The router's handler is connected on the first `send_sequence` of the game (`:450-451`). When the batch is that first sequence, which is exactly the `containers` scenario's situation, the screen's handler runs first and still sees `true`.
  - `_busy` then stays set. The status reads "Moving 2 stacks…" forever, Take out, Take all, Put in and Drop stay disabled (`container_screen.gd:144-146`), and drags are refused (`:194,208`). Only Close and "Partial stacks…" work.
  - In the other order the screen resets silently: the player pressed "Take all", the status flickered, and nothing happened.
- **The same applies to `D`** from the floor screen when the pack holds a single class (rare), and to any batch whose ids are no longer in NetHack's menu.
- **No test sees it.** The `containers` fixture's box always holds several classes, so "All types" is always there.
- **Fix:**
  - In `_pick_rows`, when a category menu has no "All types" row, pick the class rows: every selectable row except "Auto-select…", "Items known to be…", "Items of unknown…", "Unpaid items", "Used up items" and "Items just picked up". Picking a BUC or unpaid row would add a filter (`menu_loot` → `add_valid_menu_class`), while the class rows let every chosen item through, and `pick_ids` still picks the items.
  - Make the end of a batch independent of signal order. Give `send_sequence` an `on_end(ok: bool)` that runs on every ending (command prompt, Esc abort, unexpected request), and use it instead of reading `_sequence_running` in the screen.
  - When a batch ends with nothing moved, say so: "NetHack didn't offer those items; use Partial stacks…".
  - Test in `containers`: a box with two scrolls, one known uncursed and one unknown; "Take all" empties it in one `#loot`.

---

## Medium

### M1. A floor batch pickup assumes everything went up

**Area:** floor-and-pack screen (round-6 H3), map model.

- After `,` returns to the prompt, `_batch_done` removes every selected id from the floor pane and from the map model, then emits `pile_changed` (`container_screen.gd:284-288`). It never checks what NetHack did.
- NetHack picks up less than asked in ordinary situations:
  - The hero can't reach the floor, for example while levitating (`src/pickup.c:715-717`).
  - The pack is full ("Your knapsack cannot accommodate any more items", `:1758`).
  - The player answers No to "You have a little trouble lifting … Continue?" (`:1783`). That question reaches the player, because a real yes/no is left to them (`input_router.gd:489-490`), and the follow-up still runs afterwards.
- Even when the bridge does send a fresh pile, the follow-up filters the refused stack out of it: `contents` is filtered by id after `pile_changed` has already replaced it.
- The bridge won't correct it either.
  - The hero's square is not reprinted after a pickup, because its glyph is still the hero (`src/display.c:2072-2086`).
  - The idle check sends a pile only when none is known yet (`nh-shim-bridge.c:3696`).
  - The `travel_and_transfer` log shows no `shim_ground_pile_snapshot` between the batch `,` (event 384) and the next prompt (418).
- **What the player sees.**
  - The floor pane shows the items gone.
  - The pile peek, the hero card's "stands on" and the bar's "Pick up" use the wrong pile until the hero steps off and back. A levitating hero who presses "Pick up all" is told by the screen that it worked.
- `open_ground` doesn't check reach or burden before offering the screen (`ui/dialog_host.gd:379-389`).
- **Fix:**
  - Don't guess. Have the bridge, behind `NH_BRIDGE_EXTENDED`, send the hero square's pile whenever its object list changed since the last report (a cheap `o_id` signature checked in `shim_get_nh_event`). Electron's stream stays the same. Then drop the manual filter in `_batch_done`.
  - Until then, filter only when the hero's cell no longer shows an object, and otherwise keep the last snapshot.
  - Test: two stacks with the hero near Burdened; answer No to the lifting question; the refused stack stays listed.

### M2. "Recover anyway" hides the newer save even when recovery fails

**Area:** crash recovery (round-6 M1), data safety.

- `_recover` moves the hero's saves to `save/replaced/` first (`ui/title_screen.gd:158-159`, `game/save_catalog.gd:206-216`) and only then runs `recover` (`:161`).
- `recover` returns "" when the tool isn't found (`save_catalog.gd:245-247`). That is likely in an exported build: `find_tool` looks in the source tree, next to the executable, and in `bin/` (`game/nethack_session.gd:90-98`), and no export preset ships it yet. It also returns "" when `recover` exits non-zero (`:249-255`).
- **What the player sees.** The title says "That game could not be recovered. Start a new adventure." (`title_screen.gd:162-163`). The newer save no longer appears under Continue or Saved heroes, because `saves()` lists only `save/` (`save_catalog.gd:50-70`). The player has lost both runs, as far as they can tell.
- **Fix:**
  - Check `find_tool("recover")` before asking, and say "Recovery isn't available in this build" if it's missing.
  - If recovery fails after setting saves aside, move them back (`set_aside_saves` already returns the file names) and say "Nothing changed".
  - Test in `crash_recovery`: point recover at a broken checkpoint (delete one level file), choose "Recover anyway", and assert the newer save is still listed.

### M3. The player's `~/.nethackrc` changes Godot games and test runs

**Area:** engine options, sequence engine, testing doctrine.

- NetHack reads `~/.nethackrc` even when `NETHACKOPTIONS` lists options. `NETHACKOPTIONS` is applied on top (`src/options.c:7309-7323`).
- Godot's options never set `menustyle`, and add `rest_on_space` only when the switch is on (`game/settings.gd:108-125`, `game/nethack_session.gd:148`).
- NetHack veterans, the audience for "classic keys are sacred", often have an rc file:
  - `OPTIONS=menustyle:traditional` (or `combination`) turns `,`, `D` and the loot "Do what with…?" into text questions (`src/pickup.c:3867-3885`). The batch engine leaves those to the player as "a real yes/no" (`input_router.gd:489-490`). The player gets raw NetHack prompts in the middle of "Pick up all", and then M1's follow-up reports success.
  - `OPTIONS=rest_on_space` makes Space rest while Settings shows "Space waits a turn" off.
  - `menu_style` and `rest_on_space` are saved with the game (`include/flag.h:57,118`, restored as `gamestate-flags`), so the effect lasts for the whole run.
- `tests/run.sh:55-56` sandboxes `XDG_DATA_HOME` and the playground but not `HOME`, so a developer's rc file changes test results.
- **Fix:**
  - Always pass the options the UI depends on: `menustyle:full`, plus explicit values for every Settings switch (`!rest_on_space` when off).
  - Decide whether the rc file is read at all. NetHack's `--nethackrc=<file>` (`src/cfgfiles.c:252`) can point at an empty or Godot-written file in the playground. If players should keep their rc, offer it as a Settings switch and still force `menustyle:full`. Record the decision in the BIBLE.
  - In `run.sh`, set `HOME` (or the rc path) to the sandbox.

---

## Low

### L1. The feed wakes up under large panels

**Area:** message feed (round-6 H1).

- The hover-to-wake ignores `dimmed`. A big panel sets the feed's target to 0.15 (`ui/message_feed.gd:194`). But if the pointer rests over feed text that the card covers (for example the lower-left of the 1240-wide floor or container card), `_process` jumps the feed to 0.7 every 0.35 s (`:184-188`).
- The parts left uncovered then pulse between about 0.4 and 0.7. In `travel_and_transfer/08-floor-screen.png` the feed shows left of and below the card.
- **Fix:** wake only when `not dimmed` and no dialog owns the input (`screen.dialogs.owns_input()` is reachable through the HUD).

### L2. "Kick" on every square, and the context menu hides danger

**Area:** cell actions (round-6 L6), UX.

- "Kick" is offered toward any neighbour, walls and solid rock included (`input/cell_actions.gd:132-140`).
- In NetHack, kicking a wall hurts the hero, can wound their legs and wakes nearby monsters (`src/dokick.c:881-905`). Kicking empty space can strain a muscle (`:865-875`). Godot marks only pets and peacefuls.
- The right-click menu also never shows danger. The action bar colours dangerous actions red or amber (`ui/action_bar.gd:264-270`), but `ContextMenu` colours only the primary action (`ui/dialogs/context_menu.gd:45-47`).
- `look_and_minimap/04-pet-context-menu.png`: "Kick it" on the tame kitten looks exactly like "Chat". The warning appears only after the click.
- **Fix:** style `danger` rows in `ContextMenu` the way the bar does. Mark "Kick" as `caution` toward walls, rock and empty floor ("it may hurt"), or offer it there only from the "More" part of the menu.

### L3. Name lists drift from NetHack

**Area:** action bar, equipment screen (round-6 M3 and L5).

- `_forces_locks` (`ui/action_bar.gd:174`) is meant to mirror `u_have_forceable_weapon` (`src/lock.c:664-672`). It misses:
  - the bullwhip: `\bwhip\b` never matches "bullwhip", the game's only whip, and the Archeologist's starting wielded weapon (`src/u_init.c:44`);
  - ya and yumi (`include/objects.h:153,401`);
  - the grappling hook (flail skill, `:1010`).
  - An Archeologist at a locked box is therefore offered "Force the lock", and NetHack refuses it (`src/lock.c:698`).
- `is_missile` (`ui/dialogs/equipment_screen.gd:528-530`) misses "throwing star", the unidentified shuriken (`include/objects.h:163`). Dropping throwing stars on the hero wields them in place of the weapon.
- **Fix:** decide from data rather than names. The bridge sends `equipmentSlots` per item (`nh-shim-bridge.c:3053-3054`) for the quiver choice. For `#force`, add the weapon skill to the bridge's item fields behind `NH_BRIDGE_EXTENDED`. Otherwise, add the missing names.

### L4. The pack strip has no limit

**Area:** equipment screen (round-6 L4).

- Every unworn item that fits a slot gets a 132×70 chip in an `HFlowContainer` with no scroll (`equipment_screen.gd:115-118,172-199`). That includes every gem, rock and gray stone, because the quiver accepts the `gem` class (`:438-439`).
- The card's 820-unit height is only a minimum (`:60`), so extra rows make it taller than the window.
- About six chips fit in a row. `06-dragging-to-quiver.png` shows one row already reaching the card's bottom edge at 1920×1080, and `small_window/03-equipment.png` shows about one row of room at 1280×720. A mid-game pack with a dozen equippable items and some Mines gems pushes the bottom of the card, and those chips, off-screen. Pad focus can't scroll there.
- **Fix:** put the strip in a `ScrollContainer` capped at two rows, and leave stones and gems out unless a sling is wielded or the Quiver slot is selected.

### L5. Small leftovers

**Area:** settings, comments.

- The Settings card sizes its scroll area once (`ui/dialogs/settings_screen.gd:11-16,31`). Moving "Interface size" to 150% at 1920×1080 leaves a 720-unit-tall view with a card of about 775 units (`ui_panels/04-settings.png`), so Close and Reset get clipped until the card is reopened.
- `container_screen.gd:6-8` still says moves go one stack at a time.
- The `will_answer` doc comment sits on `_skip_optional` (`input_router.gd:544-547`).
- The optional "loot it?" step (`container_screen.gd:268`) can never fire: this NetHack goes straight from `#loot` to "Do what with…?" for one container (`src/pickup.c:2097-2170,2246-2290`, and the `containers` event log). The comment at `input_router.gd:546-547` explains it the wrong way round.
- **Fix:** refit the scroll on the viewport's `size_changed`. Update the comments, and drop the dead step or label it as defensive.

### L6. Test leftovers

**Area:** testing doctrine.

- `crash_recovery.gd:53` turns on "Space waits a turn" by setting `app.settings.rest_on_space` directly. Nothing clicks the Settings switch.
- `descent.gd:121-126` checks only that no History panel opens after the click beside a short line. A click swallowed by nothing at all would also pass. Assert `bridge_map_click_accepted` (or a step).
- No scenario moves several stacks with `D` from the floor screen, picks rows from a single-class category menu (H1), or checks a refused or partial batch (M1).
- **Fix:** add the tests named in H1, M1 and M2. Click the switch in `crash_recovery`. Assert the map click in `descent`.

---

## Already better than Electron (keep these)

- Rounds 1 to 6's lists still hold.
- Moving several stacks costs one turn, through NetHack's own commands, with no NetHack menu flashing up (`travel_and_transfer/08` to `11`: T8 to T10 for a drop and a two-stack pickup). Electron's direct route queues one transfer per row (`electron-poc/src/shared/transfer-session.js:472-487`).
- Crash checkpoints are moved out of NetHack's way before it can reap them, and they survive any number of new games. Electron has no such protection.
- Recovering over a newer save asks first, focuses Cancel, and keeps the old save aside instead of deleting it (`crash_recovery/03-replace-save-question.png`).
- The feed reacts only to its words and lets a faded feed pass clicks through to the map (`descent/08-feed-scrolled-back.png`).
- Pack-strip chips with letter and name, and ammunition dropped on the hero goes to the quiver (`equipment_swaps/06-dragging-to-quiver.png`).
- One stack picks up at once with `,`, and two or more open the floor screen, so the bar never adds clicks to the common case.

---

## Status after the fix pass (2026-10-17)

**Fixed:**
- **H1:**
  - When a "what type of objects?" menu has no "All types" row, the engine picks every class row. Class rows add no filter, and the item menu then picks by `objectId`.
  - `send_sequence` takes an `on_end(ok)` that runs however a sequence ends (prompt, abort, unexpected request, player). The container screen releases a batch through it, whatever order the signals run in, and says so when nothing moved.
  - New fixture `container/single-class-mixed-buc-box-on-hero`. The event log shows the menu with no "All types" row, the "Scrolls" row picked, then both scrolls, in one `#loot`. Without the fix the test fails.
- **M1:**
  - The bridge (extended mode only) fingerprints the hero square's seen objects on every `get_nh_event`. When the fingerprint changes it sends a pile snapshot, an empty one included, even after a window clear has reset the "known" flags.
  - The floor screen no longer assumes a batch moved everything.
  - New `partial_pickup` scenario: a loaded hero says No to NetHack's "trouble lifting" question, and the refused splint mails stay in Godot's pile.
- **M2:**
  - Recover first checks the `recover` tool is there ("Recovery isn't available in this build").
  - A failed recovery puts any set-aside save back ("Your saved game is unchanged").
  - `crash_recovery` makes a checkpoint unreadable and checks the newer save survives.
- **M3:**
  - Godot writes its options to `playground/godot.nethackrc` and passes `NETHACKOPTIONS=@<that file>`, so NetHack never reads the player's `~/.nethackrc`.
  - The options always include `menustyle:full` and an explicit `rest_on_space` / `!rest_on_space`.
  - `run.sh` sandboxes `HOME` too. `safety` plants a hostile rc (`menustyle:traditional,rest_on_space`); `D` must still open a menu, and it doesn't with the old way of passing options.
- **L1:** the feed stays asleep while dimmed or under a dialog.
- **L2:**
  - The context menu colours dangerous rows like the bar does.
  - "Kick" toward walls, rock or empty floor is marked caution.
- **L3:**
  - The quiver choice uses the bridge's `equipmentSlots` (ammunition) plus names for thrown missiles (darts, shuriken and throwing stars, boomerangs).
  - The force-lock list adds bullwhip, ya, yumi and grappling hook.
- **L4:** the pack strip scrolls after two rows, and gems and stones show only with a sling wielded or the Quiver slot open.
- **L5:**
  - The Settings rows refit when the window or interface size changes.
  - Comments fixed.
  - The dead "loot it?" step removed.
- **L6:**
  - `crash_recovery` clicks the "Space waits a turn" switch.
  - `descent` checks that the pointer reached the map.
  - `travel_and_transfer` drops two stacks with one `D`.
- **Also:**
  - The pack pane says "Nothing to drop" when only worn gear remains.
  - The Electron shim was rebuilt from the changed bridge source; its behaviour is the same, because the new code runs only in extended mode.
