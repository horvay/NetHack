# Godot front end review, round 8

Date: 2026-10-17. Scope: everything in `godot-poc/` after the round-7 fix pass, looking hardest at the round-7 changes:
- the sequence engine: the class-row fallback in `_pick_rows`, `on_end` and `_finish_sequence` (every exit path, re-entrancy, `cancel_automation`), `_skip_optional`;
- the container screen's `_batch` / `_batch_done` / `_batch_ended`, the refusal fallback and the empty-pane labels;
- the bridge's `hero_pile_signature` and pile resend in `shim_get_nh_event` (extended mode only);
- `NETHACKOPTIONS=@file`, `_write_rc`, `REQUIRED_OPTIONS` and `Settings.nethack_options`;
- the title's Recover flow (tool check, set-aside and restore);
- the equipment quiver rule, strip scroll and gem filter; `_forces_locks`; Kick danger and the context menu's danger colours; the feed's covered/dimmed wake; the Settings refit;
- the new fixtures (`container/single-class-mixed-buc-box-on-hero`, `ground/heavy-pile-near-burdened`, `monster/visible-newt-east`), the new `partial_pickup` scenario, and the changes to `containers`, `travel_and_transfer`, `crash_recovery`, `safety` and `descent`.

The lenses are the same as round 7:
1. Functional parity with Electron (`electron-poc/src/ux`, `src/shared`, `src/renderer.js`, `src/main`).
2. UX quality, from the UI code and the screenshots of the full run that just finished (22 scenarios, all PASS). No source file is newer than that run, so the screenshots show the current code.
3. Architecture and correctness.

**How the findings were checked**
- Read-only review. Nothing was built or run.
- Every finding was checked against the code. UX findings were also checked against the screenshots named in them.
- Engine claims were checked in NetHack's source in this repository:
  - `src/pickup.c` (`query_category`, `menu_loot`, `in_or_out_menu`, `lift_object`), `src/hack.c` (`pickup_checks`), `src/do.c` (`menu_drop`).
  - `src/cfgfiles.c` (`rcfile`, `fopen_config_file`), `src/earlyarg.c` (`-no-nethackrc`), `src/options.c` (`initoptions_finish`), `src/restore.c` (`restgamestate`), `include/flag.h`, `include/global.h` (`BUFSZ`).
  - `src/allmain.c` (`moveloop_core` order), `src/files.c` (`restore_saved_game`, `docompress_file`), `util/recover.c`.
  - `src/objnam.c` (wielded-item phrasing), `src/lock.c` (`u_have_forceable_weapon`), `include/objects.h`.
- Bridge claims were checked in `electron-poc/shim-bridge/nh-shim-bridge.c`. The `containers` event log (`test-output/containers/events.jsonl`, events 754-804) was used to confirm the menus NetHack showed for the single-class box.
- Paths are relative to `godot-poc/project/` unless they start with `electron-poc/`, `src/`, `util/`, `include/`, `tests/run.sh` or `docs/`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 0 high, 1 medium, 9 low (10 in total).

The most serious problems:
- When NetHack asks a question in the middle of "Pick up all" or "Take all", the floor or container screen closes for good. When NetHack refuses without asking (levitating, full pack), the screen says nothing at all (M1).
- `NETHACKOPTIONS=@file` silently falls back to `~/.nethackrc` with none of Godot's options if the file can't be opened or its path is 128 characters or longer. Restored saves keep their own `menustyle` (L2).
- A failed recovery of a run that crashed in this session drops the checkpoint from the list, and the next game start deletes it, because `recover` always exits 0 (L4).

---

## Round-7 verification

- **H1 (no "All types" row): fixed.** `_pick_rows` picks every class row when "All types" is missing (`game/input/input_router.gd:529-541`), and the filter regex covers every non-class row `query_category` can add (`src/pickup.c:1338-1437`, including "Just picked up: …"). The event log shows the menu with A, a "Scrolls" row, U and X, the `a` sent, then both scrolls picked by letter in one `#loot` (events 779-804). `on_end` replaces the signal-order check (`ui/dialogs/container_screen.gd:273,278-287`). `containers/10-single-class-box-emptied.png` shows the box empty and the buttons usable.
- **On `on_end` and `_finish_sequence`:** every exit path reaches it: the command prompt (`input_router.gd:465-467`), a pick that fits nothing (`:475-478`), something unexpected (`:489`), `cancel_automation` (`:418`), and a new sequence (`:448`). State is cleared before `then` and `on_end` run, so a `then` that starts a new sequence (`_alternate_swap`) is safe. Only a game that ends mid-sequence never calls it, and the screen dies with the game anyway. One leftover is in L5.
- **M1 (pile assumed moved): fixed.** The signature covers id and quantity of every seen object (`electron-poc/shim-bridge/nh-shim-bridge.c:2864-2874`). It is checked only in extended mode (`:3717-3731`), so Electron's stream is unchanged. A level change can't send a false report (`:3720` compares the level), an empty pile is still reported (`:3724`), and objects that become seen change the signature. It can't spam: one check per `moveloop_core` pass, and an event only on change. One timing gap is in L1, and a stale display is in L6.
- **M2 (failed recovery hides the save): fixed.** The tool is checked first (`ui/title_screen.gd:149-151`), and the save is put back on failure (`:166-169`, `game/save_catalog.gd:220-224`). `crash_recovery.gd:139-151` covers it. A new data-loss path is in L4.
- **M3 (`~/.nethackrc`): fixed for new games.** `NETHACKOPTIONS=@<file>` makes NetHack read that file and skip `~/.nethackrc` (`src/cfgfiles.c:1934-1941`). Sysconf is read separately and still applies. `run.sh` sandboxes `HOME` (`tests/run.sh:55-56`), and `safety.gd:16-31` proves a hostile rc no longer applies. The fallbacks and restored saves are in L2.
- **L1 (feed wakes under panels): fixed.** `ui/message_feed.gd:187` checks `dimmed` and `covered`. `ui/hud.gd:58` wires `covered`.
- **L2 (Kick and danger): fixed.** Caution on plain kicks (`input/cell_actions.gd:136-143`), and danger colours in the context menu (`ui/dialogs/context_menu.gd:45-52`). `look_and_minimap/04-pet-context-menu.png` shows "Kick it" in red.
- **L3 (name lists): fixed as stated.** Quiver choice from `equipmentSlots` (`ui/dialogs/equipment_screen.gd:540-544`), which the bridge sets from `is_ammo` (`nh-shim-bridge.c:3025`). New names in `_forces_locks` (`ui/action_bar.gd:174`). A wording gap is in L7.
- **L4 (strip without limit): fixed.** Two rows, then it scrolls (`equipment_screen.gd:115-125`). Gems and stones show only with a sling or the Quiver slot (`:179-185`). `equipment_swaps/06-dragging-to-quiver.png` looks right.
- **L5 (small leftovers): fixed.** The Settings rows refit (`ui/dialogs/settings_screen.gd:12-22,55`, `small_window/06-settings.png`). The comments are right and the "loot it?" step is gone (`container_screen.gd:265-268`). The optional-step code it used is still there (L8).
- **L6 (tests): fixed as stated.** `crash_recovery.gd:52-65` clicks the switch, and `travel_and_transfer.gd:166-181` drops two stacks with one `D`. In `descent` the new check proves the pointer's motion reached the map, not the click (L9).
- **Also: fixed.** "Nothing to drop (worn and wielded things stay on you)." (`travel_and_transfer/12-floor-dropped-two.png`) and "Empty." (`containers/07-box-emptied.png`).

---

## Medium

### M1. NetHack's side of a batch is invisible: a question closes the screen for good, and a refusal says nothing

**Area:** floor-and-pack and container screens (round-7 H1 and M1), UX.

- **A question closes the screen.**
  - Any NetHack request opens a dialog through `_show`, which frees the active dialog (`ui/dialog_host.gd:89-92,136-141`). In the middle of "Pick up all", "You have much trouble lifting a +0 splint mail. Continue?" replaces the floor screen (`partial_pickup/02-lifting-question.png`).
  - After the answer, nothing brings the screen back. `_batch_ended` is a bound method of the freed screen, so `on_end.is_valid()` is false (`game/input/input_router.gd:505`). `partial_pickup/03-after-partial-pickup.png` shows the bare map.
  - The scenario knows: its floor-pane check runs only `if is_instance_valid(floor_view)` (`tests/scenarios/partial_pickup.gd:47-48`), and it never does.
  - The same thing happens to the container screen with "You have a little trouble removing …" during "Take all".
- **A refusal without a question says nothing.**
  - Levitating, `,` prints "You cannot reach the floor." and returns before any menu (`src/hack.c:3848-3869`). The sequence ends at the prompt with `ok`, and `_batch_done` clears the status (`ui/dialogs/container_screen.gd:290-300`). The player pressed "Pick up all", and nothing happened.
  - With a full pack, NetHack stops partway ("Your knapsack cannot accommodate any more items", `src/pickup.c:1758`). The pane updates, but no reason is given.
  - NetHack's sentence goes to the feed, which a large card dims to 0.15 (`ui/dialog_host.gd:101-103`, `ui/message_feed.gd:198`). In `travel_and_transfer/12-floor-dropped-two.png` the feed is barely readable beside the card.
  - A single stack has an answer here: the direct path's refusal shows as a sentence in the status line (`container_screen.gd:328-344`). Two stacks get nothing, so the batch path is worse than the one-stack path.
- **Fix:**
  - Keep a transfer screen open under NetHack's request dialogs: hide it while the question shows and show it again when the question closes. If that is too invasive, have the router reopen it from `on_end` (a router-owned callable, per the BIBLE's lambda hazard).
  - In `_batch_done`, compare the ids that were asked for with the new pile, pack or container. If some didn't move, put that turn's NetHack messages in the status line ("You cannot reach the floor.").
  - Test: `partial_pickup` asserts the floor screen is open again after the No, with the refused mail listed. A levitation fixture asserts the status line explains the refusal.

---

## Low

### L1. A pile change during the monsters' turn shows only after the next command

**Area:** bridge pile resend (round-7 M1).

- The signature check runs in `shim_get_nh_event` (`electron-poc/shim-bridge/nh-shim-bridge.c:3717-3731`). NetHack calls that once, at the top of `moveloop_core` (`src/allmain.c:315`).
- Monsters move (`:342`) and timeouts run (`:403`) after that call, and before `rhack` reads the next command (`:660`). A change in that window is reported only after the player's next command has run. Some examples:
  - an arrow that hit the hero lands underfoot;
  - Glib makes the hero drop the weapon;
  - armor breaks off during a polymorph.
- Until then, the hero card, the bar's "Pick up" and the floor screen use the old pile. If the pile was empty before, the bar offers no "Pick up" for the dropped weapon.
- **Fix:** run the same signature check (still extended mode only) when the bridge emits a command-level input wait, for example in `nh_poskey` handling when `program_state.input_state == commandInp`.

### L2. `NETHACKOPTIONS=@file` has quiet fallbacks, and restored saves keep their own menu style

**Area:** engine options (round-7 M3).

- **The file can be skipped.**
  - If the file can't be opened, NetHack prints "Couldn't open requested config file" and falls through to `~/.nethackrc` (`src/cfgfiles.c:249-283`). Because NETHACKOPTIONS named a file, none of Godot's options apply (`xtraopts = 0`, `:1940`).
  - `_write_rc` ignores a failed open and returns the path anyway (`game/nethack_session.gd:149-156`). If an older file is still there, NetHack reads the previous game's options without saying so.
  - A path of `BUFSZ/2` = 128 characters or more is refused ("nethackrc file name … too long; using default", `src/cfgfiles.c:1951-1959`, `include/global.h:389`). The result is the same: `~/.nethackrc` and no Godot options. An exported build's `user://playground` path is about 70 characters plus the home directory on Linux, and longer on other systems. A long home path or a deep checkout reaches the limit.
- **Restored games keep the save's flags.** `restgamestate` reads `flags` from the save (`src/restore.c:578-579`), including `menu_style` and `rest_on_space` (`include/flag.h:57,118`). `REQUIRED_OPTIONS` therefore reaches new games only.
  - In development, Godot and Electron share the repository's `playground/` (`electron-poc/src/main/game-process.js:163`). Electron still reads `~/.nethackrc`, so an Electron or tty save made with `menustyle:traditional` keeps traditional menus when continued in Godot.
  - The same is true of Godot saves made before this fix. The batch moves then meet text questions again (round-7 M3).
- **Fix:**
  - Drop the file. Start NetHack with `-no-nethackrc` (`src/earlyarg.c:268-279`, which reads `/dev/null` as the rc), and pass the options as a plain NETHACKOPTIONS string. They are then parsed as extra options (`src/cfgfiles.c:1966-1975`), with no file to fail and no length limit.
  - For restored games, have the bridge force `flags.menu_style = MENU_FULL` once after restore (extended mode only). Otherwise, detect a non-full menu style and send the floor screen's moves through `,` / `D` one stack at a time.

### L3. The player's rc is now ignored, with nothing in its place

**Area:** parity with Electron (round-7 M3 decision).

- The BIBLE records the choice not to read `~/.nethackrc`. Here is a new argument against leaving it there. Electron still honours the rc: it passes only `!tutorial` plus its own options (`electron-poc/src/main/launch-policy.js:94-103`), so NetHack reads `~/.nethackrc` as well.
- In Godot, options that Settings doesn't offer can no longer be set at all: `paranoid_confirmation`, `pickup_burden`, `autoquiver`, `fruit`, `pettype`, `packorder`, `menucolors`, and others. For a veteran these are part of "classic NetHack". `paranoid_confirmation:pray` is also a safety setting.
- **Fix:** add an "Extra NetHack options" text field to Settings > Advanced, written before `REQUIRED_OPTIONS` so `menustyle:full` still wins. Alternatively, offer a one-time import of the rc's `OPTIONS=` lines, minus the ones Godot owns. Record the choice in the BIBLE.

### L4. A failed recovery can delete this session's crash checkpoint, and the end screen bypasses the checks

**Area:** crash recovery (round-7 M2), data safety.

- `util/recover` exits 0 even when a recovery fails: it prints the error and goes on (`util/recover.c:148-159`).
- `SaveCatalog.recover` erases the base from `preserved_bases` on exit code 0 (`game/save_catalog.gd:257-259`), before it checks the "recovered" line.
- For a run that crashed in this process, the checkpoint then:
  - drops out of `checkpoints()`, because it is owned by our pid and is no longer preserved (`:179-181`);
  - is deleted by `clear_own_locks` at the next game start (`:126-128`, `game/nethack_session.gd:162`).
- A transient failure, such as a full disk or a permission problem, therefore loses a run that a second try would have recovered.
- The end screen's "Recover this run" calls `recover` directly (`ui/end_screen.gd:167-174`):
  - It skips the tool check and the "Replace …'s saved game?" question.
  - On failure it only logs `push_warning`, then goes back to the title with no message.
- **Fix:** erase from `preserved_bases` only when the "recovered … to …" line matched. Send the end-screen button through `TitleScreen._recover`, so it gets the same checks and messages.

### L5. A move queued during a batch may never start

**Area:** container screen (round-7 H1).

- While a batch runs, these still enqueue moves:
  - a double-click on a row (`ui/dialogs/container_screen.gd:178-182`);
  - pack letters plus Enter (`:385-402`).
- `_enqueue` queues them, because `_busy` is set (`:244,247-248`).
- Neither `_batch_done` nor `_batch_ended` calls `_next()` (`:278-300`). Draining depends on the screen's `request_changed` handler (`:80`) running after the router's handler. On a fresh game screen the container screen connects first, sees `_busy`, and returns. The queued move then waits until the player does something else.
- This is the same signal-order trap round 7 H1 removed for `_busy`.
- **Fix:** call `_next()` at the end of `_batch_ended`. Also ignore double-clicks and Enter while `_busy`, as the buttons already do.

### L6. The pile peek lists items that are already in the pack

**Area:** HUD (round-7 M1).

- `PilePeek` builds its rows once, when NetHack shows "Things that are here", and keeps them for about five seconds (`ui/pile_peek.gd:53-85`). It doesn't listen to `pile_changed` (`:40-43`).
- `partial_pickup/03-after-partial-pickup.png` still lists "a +0 dagger" and three splint mails. The feed above it says the dagger and one mail went into the pack.
- **Fix:** on `pile_changed` for the hero's cell, rebuild the rows, or hide the peek.

### L7. "Force the lock" reads the wielded weapon's wording

**Area:** action bar (round-7 L3).

- `_forces_locks` requires "(weapon in" in the item text (`ui/action_bar.gd:170-174`). NetHack words two wielded weapons differently (`src/objnam.c:1571-1606`):
  - a wielded aklys is "(tethered to right hand)";
  - the primary weapon while two-weaponing is "(wielded in right hand)".
- Both can `#force`: the aklys is a club, and two-weaponing changes nothing (`src/lock.c:664-672`, `include/objects.h:381-383`). Neither gets the button.
- The exclusion list also misses the rubber hose, which uses the whip skill (`include/objects.h:374-376`).
- **Fix:** test `wornMask & 0x100` (as `InputRouter._holds` does) instead of the wording. Keep the name exclusions, plus "rubber hose", or better, have the bridge send the weapon skill in extended mode.

### L8. Code leftovers in the sequence engine

**Area:** `game/input/input_router.gd`.

- No step sets `optional` or `query` since round 7. `_skip_optional` (`:567-571`), the `optional` check in `will_answer` (`:584`) and the `query` check in `_step_matches` (`:548-550`) are dead code.
- The class-row fallback picks any selectable row with no `objectId` (`:529-531`). Today that only happens in NetHack's category menus ("Take out what type of objects?", `src/pickup.c:4054`, and "Drop what type of items?", `src/do.c:1009`). If an item menu ever reaches the bridge without ids, the fallback would select every row.
- **Fix:** delete the dead optional-step code. Apply the class fallback only when the menu prompt contains "what type of".

### L9. Test leftovers

**Area:** testing doctrine.

- `partial_pickup` claims that "the screen and the map follow NetHack's pile". The screen check is skipped because the screen is gone (M1). Its last screenshot shows the stale peek (L6) and still counted as inspected.
- The new fixture `monster/visible-newt-east.json` is used by no Godot scenario. Electron's loader test only checks its `expectedPublicFacts`, which the `bridge_test_scenario_loaded` event echoes back (`electron-poc/scripts/scenario-loader-positive-test.js:84-88`). So the approved newt is never shown on a map in a test. Use it in `world_first_look` or `combat_feedback`, with a screenshot.
- The Settings refit at 150% (round-7 L5) has no screenshot. `ui_panels.gd:68-85` sets 1.2, resets, and captures only after the reset.
- `descent.gd:121-123` checks `_mouse_cell`, which proves that a mouse motion reached the map, not the click. Round 7 asked for `bridge_map_click_accepted` or a step.
- **Fix:** after the M1 fix, assert the floor screen reopens with the refused mail listed. Add the newt screenshot and a 150% Settings screenshot. Assert the map click event in `descent`.

---

## Already better than Electron (keep these)

- Rounds 1 to 7's lists still hold.
- Several stacks move in one turn through NetHack's own `#loot`, even when the "what type of objects?" menu has no "All types" row. No NetHack menu flashes up (`containers/10-single-class-box-emptied.png`). Electron queues one direct transfer, and one turn, per stack.
- After a partial pickup, the map, the bar and the hero card follow NetHack's real pile ("Pick up…" for the two mails left in `partial_pickup/03-after-partial-pickup.png`).
- A stray `~/.nethackrc` can't change a new Godot game's menus or the Space key (`safety`).
- A failed recovery keeps the newer save and says "Your saved game is unchanged". Electron's recovery (`electron-poc/src/main/recovery-state.js`) has no replace question.
- Danger is coloured the same in the context menu and on the bar, and it asks first (`look_and_minimap/04-pet-context-menu.png`).
- The equipment strip shows only what fits, hides gems until they can be slung, and scrolls (`equipment_swaps/06-dragging-to-quiver.png`).
- Empty panes explain themselves: "Empty." and "Nothing to drop (worn and wielded things stay on you)." (`containers/07-box-emptied.png`, `travel_and_transfer/12-floor-dropped-two.png`).

---

## Status after the fix pass (2026-10-17)

**Fixed:**
- **M1:**
  - `DialogHost` keeps a transfer screen (meta `keep_under_requests`) hidden under NetHack's question dialogs and shows it again when the question closes. The batch's `on_end` still reaches it.
  - After a batch, the screen compares the ids it asked for with the new pile, pack or container snapshot. When something stayed behind, the status line says "N of M moved." followed by NetHack's own words for that turn.
  - `partial_pickup` checks that the floor screen comes back, lists the refused mail, and shows "2 of 4 moved. You have trouble lifting … splint mail …".
- **L1:** the bridge's hero-pile check (extended mode) also runs at command-level `nh_poskey` waits, so changes during the monsters' turn show before the next command.
- **L2:**
  - Godot now starts NetHack with `-no-nethackrc` and passes the options as a plain NETHACKOPTIONS string (no file to fail, no length limit). `safety`'s hostile `~/.nethackrc` is still ignored.
  - For restored saves, the bridge (extended mode) keeps `flags.menu_style` at full and applies Settings' rest-on-space (`NH_GODOT_REST_ON_SPACE`) at every turn.
- **L3:** Settings > Advanced has an "Extra NetHack options" field (an `OPTIONS=` line). Any `menustyle` in it is dropped, and Godot's own options come after it. `crash_recovery` types `pettype:none` there and checks the next game has no pet.
- **L4:**
  - `preserved_bases` is cleared only when `recover` prints its "recovered … to …" line.
  - The end screen's "Recover this run" goes through `TitleScreen._recover` (tool check, the replace question, messages).
- **L5:**
  - A batch end calls `_next()`, so moves queued meanwhile start.
  - Double-click and Enter are ignored while a move runs.
- **L6:** the pile peek hides when the hero's pile changes.
- **L7:** "Force the lock" checks the wielded bit of `wornMask` (aklys, two-weaponing) and excludes the rubber hose.
- **L8:**
  - The dead optional-step and `query` code is gone.
  - The class-row fallback applies only to "what type of" menus.
- **L9:**
  - `world_first_look` shows the newt fixture on the map (screenshot `newt`).
  - `ui_panels` captures Settings at 150% and checks Close stays on screen.
  - `descent` checks the map click travelled whenever explored map lies beside a feed line, and says when it doesn't.

**Left:**
- **L1 test:** a pile change during the monsters' turn (a missile landing underfoot) has no deterministic fixture yet. The code path is the same check that `partial_pickup` covers at turn start.
- **L2 test:** no scenario forces a restored save that was made with traditional menus. The bridge enforces full menus on every turn.
- **L9, the click in `descent`:** at that point of the run no explored square lies under the feed, even zoomed out. The wheel over the same spot proves that mouse-button events reach the map, since clicks and wheel steps are both handled by `_handle_button`.
