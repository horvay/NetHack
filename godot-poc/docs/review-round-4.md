# Godot front end review, round 4

Date: 2026-10-17. Scope: everything in `godot-poc/` plus the Godot-only (`NH_BRIDGE_EXTENDED`) parts of `electron-poc/shim-bridge/nh-shim-bridge.c` and the fixture lines in `src/allmain.c`, after the round-3 fix pass.

The lenses are the same as rounds 1 to 3:
1. Functional parity with Electron (`electron-poc/src/ux`, `src/shared`, `src/renderer.js`).
2. UX quality, from the screenshots of the latest full run (17 scenarios, `test-output/`, 18:15–18:17) and the UI code.
3. Architecture and correctness. This round looks hardest at round 3's new input engine: `InputRouter.send_sequence`, `will_answer`, and how they interact with `run_equipment_steps`, `save_from_anywhere` and the player's own keys.

**How the findings were checked**
- Read-only review. Nothing was built or run.
- Every finding was checked against the code. UX findings were also checked against the screenshots named in them.
- Engine claims were checked in NetHack's own source in this repository: `src/cmd.c` (`parse`, `readchar_core`, `yn_function`, `paranoid_ynq`, `do_fight`), `src/do_wear.c` (`dotakeoff`, `better_not_take_that_off`), `src/lock.c` (`pick_lock`), `src/zap.c` (`makewish`), `src/read.c` (`do_genocide`), `src/display.c` (`waslit`), `include/objects.h`.
- Bridge claims were checked in `nh-shim-bridge.c` (`shim_cb` for `shim_nhgetch`, `shim_nh_poskey`, `shim_get_ext_cmd`; `pop_key_blocking_with_status`) and `extension/src/nethack_core.cpp` (`drain`).
- The uncommitted diff of `nh-shim-bridge.c` against `HEAD` was read in full. Every Godot addition is still behind `bridge_extended_events()`. The vision map reports remembered light only from `waslit`, which NetHack sets only for squares the hero has seen (`src/display.c:967`), so it reveals nothing about unexplored rooms.
- Paths are relative to `godot-poc/project/` unless they start with `extension/`, `docs/`, `electron-poc/`, `src/` or `include/`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 0 high, 4 medium, 11 low (15 in total). In the round-3 verification, 6 items marked fixed are only partly fixed. The most serious problem is in the new input engine: follow-up steps can still type ahead into a prompt that a queued key or the close-window save has taken (M1).

---

## Round-3 verification

These hold up in the code: H1 for single commands (every `#`-command, Unlock, the alternate-weapon chain and look-up wait for the matching question), M1 (closing the window during a wish asks first, `main.gd:185-193`), M3 (`ui/mini_map.gd:125-133`), M4 (`equipment_swaps/04-two-handed-blocked.png` shows the dimmed row and the reason inline), L1, L4, L5, L6, L7, L9 (`run_lifecycle/08-quit-end.png`), L10 (three context buttons plus "More…") and the game-sounds switch from L11.

Round 3 left genocide out of M1. That is fine: NetHack's own hangup also declines a genocide (`src/read.c:2672,2875`), so Godot matches it.

**Fixed only in part, or with a new problem:**

| # | What's still wrong |
|---|---|
| H1 | Single sequences are sound. Follow-up steps (the alternate-weapon chain, every step after the first in `run_equipment_steps`) fire on a command prompt that may already be taken, and `save_from_anywhere` runs alongside them. See M1. The new test's assertion is weak (L9). |
| H2 | `QuestionDialog` is fixed. `ContextMenu.handle_key` still returns `true` for every key (`ui/dialogs/context_menu.gd:73-81`), which the round-3 fix asked to change (L3). In multi-pick menus the highlight starts on the first row, but Enter and Space confirm the menu instead of pressing it (L2). No keyboard-only pass was added to `travel_and_transfer` (L9). |
| M2 | Only the first half landed: `GameState` forgets the death on `done.survived`. `App` still never reacts to survival, so a close request made while dying stays pending for the rest of the run (L4). |
| L2 | The unidentified tsurugi, "long samurai sword" (`include/objects.h:282`), is still missing from `TWO_HANDED_WORDS` (`ui/dialogs/equipment_screen.gd:396-398`). Its identified name is listed. |
| L3 | `will_answer` covers item, menu and direction answers. It doesn't cover the extended-command prompt, so every `#` command sent from a button still builds a palette and plays its sound (L1). |
| L11 | The minimap size setting named in L11's evidence (`electron-poc/src/ux/settings-store.js`) is still missing; `game/settings.gd:8-22` has no such field. The fix line only asked for the sound switch, so this may have been dropped by accident. |

---

## Medium

### M1. Follow-up steps fire on a command prompt that may already be taken

**Severity:** medium. This is type-ahead, the bug class Greg cares most about, but it needs a key or a window close to land within a few frames of a multi-step action. **Area:** input engine, data safety.

**What's wrong**
- `GameState.request` stays `"command"` from the moment Godot sends a key until the bridge reports the answer in a later drain (`state/game_state.gd:227-229,452-453`). Nothing marks the prompt as used when Godot sends to it.
- Follow-ups run synchronously inside the `request_changed` emission for a `bridge_command_prompt`:
  - the sequence's `then` callback (`input/input_router.gd:408-415`), which is how `set_alternate` chains `w`, `x`, `w` (`:279-293`)
  - the next armor step (`_on_equipment_request` → `_next_equipment_step`, `:364-365,350`)
- That prompt may already be consumed by the time Godot sees it. `InputRouter._handle_key` sends keys while NetHack is busy (`:84-85`; only held-key repeats are filtered). The bridge pops a queued key right after it emits `bridge_command_prompt` (`nh-shim-bridge.c`, `shim_nh_poskey`), and `drain` delivers both events in one batch (`extension/src/nethack_core.cpp:355-383`). Godot then reacts to the prompt event before it reads the answer event.
- What goes wrong when it races:
  - The player clicks "Wear" on body armor under a cloak (four steps, `ui/dialogs/equipment_screen.gd:374-391`) and types `d` while the old armor comes off. At the next prompt NetHack reads `d` first and asks "What do you want to drop?". The router's `W` lands in that question ("You don't have that object.", and NetHack asks again, `src/invent.c:2058-2062`). The router then sees an item question with its letter pending and answers it with the new armor's letter (`input_router.gd:359-363`), so the new armor is dropped.
  - Harmless keys break the run too. With an Esc typed during the take-off, the router's `W` is read one prompt later than it expects. At the prompt in between, the new armor isn't worn yet, so `_next_equipment_step` decides NetHack refused (`:336-339`) and stops. The player is left with a bare "What do you want to wear?" question, the cloak off, and no word about why.
- `save_from_anywhere` doesn't stop either runner. It connects `_drive_save` after them (`game/game_screen.gd:147-148`), so at the same prompt the runner sends `W` (or `x`) and `_drive_save` sends `S` (`:157-165`):
  - `S` goes into W's item question, and both handlers then answer the next question: the runner with the letter and `_drive_save` with Esc (`:166-171`).
  - At the next prompt `_drive_save` sees `_save_sent` and gives up (`:158-163`). After `x`, NetHack then asks "Really save?". `auto_confirm_save` is already off, so the player gets the question in a dialog after closing the window.
  - `save_failed` only clears `_quit_after_save` (`main.gd:104`). The close request is dropped without a word.
- The equipment runner still answers any yes/no question with the item letter (`input_router.gd:359-363`), while `will_answer` (`:442`) and `send_sequence` (`:422-423`) only answer item questions (empty `choices`). When a real `[ynq]` question comes up during a step, the dialog shows and the router answers it with a letter at the same moment. `run_equipment_steps` is still a second engine with its own rules. Round 3's fix asked for one runner.

**Fix**
- Mark the prompt as used as soon as Godot sends to it. In `GameScreen.send_keys` (and `send_map_click`), set `state.request` to `{"kind": "busy"}` without emitting a signal, so every `is_waiting_for_command()` check that runs before the next drain refuses.
- Run follow-ups after the batch, not inside the prompt event. Queue the `then` callback and the next armor step, and run them on `events_drained` only if the request is still the same `command` prompt (keep a prompt serial in `GameState`).
- While a sequence or armor run is active, hold the player's keys until it ends, or cancel the run on the first player key and say so in the feed.
- `save_from_anywhere` cancels both runners first (`InputRouter.cancel_runs()`: clear `_sequence`, `_sequence_then`, `_sequence_running`, `_equipment_steps`, `_equipment_running`, `_equipment_letter`).
- On `save_failed`, flash "Couldn't save yet: finish what's on screen and close again."
- Fold `run_equipment_steps` into `send_sequence` (each step is `"W"`/`"T"` + an `item` step, with a check-and-continue `then`), so the yes/no rule lives in one place.
- Test: in `equipment_swaps`, queue a key during a four-step swap and assert the armor ends up worn (or the run reports that it stopped); in `safety`, close the window during a swap and assert the app saves and quits.

### M2. Controller players can't use the neighbour and lock actions

**Severity:** medium. The bible asks for three complete input styles; these are the actions the UI advertises for doors, shopkeepers and pets. **Area:** gamepad, parity of input styles.

**What's wrong**
- The action bar offers actions for neighbouring squares ("Open door ↑", "Unlock with key →", "Pay the shopkeeper", "Chat") and lock follow-ups ("Unlock with key", "Kick it open", "Force the lock") (`ui/action_bar.gd:141-168,174-179`). Its buttons are `FOCUS_NONE` (`:67`) and "More…" opens a mouse popup (`:193-202`).
- The pad reaches none of them:
  - A runs only the first primary action on the hero's own square (`input/gamepad_router.gd:109-126`).
  - The palette's "Available here" section lists only the hero's own square (`ui/dialogs/command_palette.gd:66-70`). Neighbour and lock actions aren't there.
  - The pad has no way to open the cell context menu: only a right-click does (`input/input_router.gd:183-186`).
- After "This door is locked.", a pad player sees "Unlock with key ↑" and "Kick it open ↑" on screen and can't press either. The workaround is palette → Kick, then point the stick, which is exactly the key-memorizing the visible actions exist to avoid.

**Fix**
- Add the neighbour actions and `ActionBar.lock_actions` to the palette's "Available here" section.
- Better: a pad button for the action bar's context group (for example LB+A, or hold A), or let the right stick's click open the context menu for the cell under the look cursor.
- Extend `gamepad_play`: bump a locked door with the stick, then kick it open from the pad.

### M3. NetHack's text windows can't be searched

**Severity:** medium (parity; the long windows are the ones players search). **Area:** parity, text windows.

**What's wrong**
- Electron's document dialog has a "Search/filter" box (`electron-poc/src/renderer.html:432`). It filters lines as you type (`electron-poc/src/renderer.js:3958-3964`), and is cleared and focused each time a window opens.
- Godot's `TextWindowDialog` has only a scroll area and a label (`ui/dialogs/text_window_dialog.gd:6-45`). Every key that doesn't scroll closes it (`:83-85`), so typing isn't possible. NetHack's read-only menus become the same dialog (`ui/dialog_host.gd:150-162`). `MenuDialog`'s search box is only built for menus of more than 12 rows that can be picked from (`ui/dialogs/menu_dialog.gd:63`).
- Affected: `?` help pages, `\` discoveries, `^X`, `#overview`, `#conduct`, the vanquished list. Godot's own manual (F1) is searchable; NetHack's windows aren't.

**Fix**
- Add a filter box to `TextWindowDialog` (`/` focuses it, as in the item picker), with a match count like the manual's.
- With it, close only on Esc, Enter and the pad's B (see L5).

### M4. No drag and drop for gear or containers

**Severity:** medium (parity for mouse players). **Area:** parity, equipment and container screens.

**What's wrong**
- In Electron you drag a pack row onto an equipment slot to equip it, or onto the safe area to take it off (`electron-poc/src/ux/equipment-screen.js:1019,1031`, drop handling `:634-652`). In the container and ground panels you drag rows from one side to the other (`electron-poc/src/renderer.js:6082-6112,6641-6662`).
- Godot has no drag support anywhere: no `_get_drag_data`, `_can_drop_data` or `set_drag_forwarding` under `game/`. The equipment screen takes a click on the slot and then a click on the candidate. The container screen offers double-click and buttons (`ui/dialogs/container_screen.gd`).
- Dragging an item onto a paper doll or into a chest is the first thing a mouse player tries in a game UI like this.

**Fix**
- `ItemRow` and `InventorySlot` return drag data (object id plus a preview of the tile).
- Equipment slots accept rows that `_candidates(slot)` would list, and route the drop to `_equip(slot, item)`, so every safety rule (layers, two-handed, blockers) still applies. Dropping a worn item onto the pack area takes it off.
- The container panes accept rows from the other pane and call the existing take/put paths.
- Add a drag to `equipment_swaps` and `containers`.

---

## Low

### L1. Every `#` command sent from a button builds a hidden palette and plays its sound

**Area:** UX polish (round-3 L3).
- Buttons and item actions send `#loot\n`, `#pray\n`, `#offer\n`, `#force\n`, `#chat\n`, `#name\n` and the like as one line. NetHack opens its extended-command prompt (`shim_get_ext_cmd` "opened"), and the bridge answers it from the queued text a moment later.
- `will_answer` doesn't cover `extcmd` (`input/input_router.gd:438-442`), so `DialogHost._on_request` builds a `CommandPalette` (`ui/dialog_host.gd:144-148`) and closes it on the next request.
  - Building it plays "ui_open" (`audio/audio_director.gd:117-124`), so a sound plays for a dialog nobody sees.
  - The bridge's catalog event right after "opened" rebuilds the palette's whole list once more (`ui/dialogs/command_palette.gd:39-40`).
  - It also hides the hover card (`dialog_host.gd:93`).
  - If the two events land in different drains, the palette fades in for a frame.
- **Fix:** when `send_command` or `send_sequence` sends `"#name\n"`, remember it; `will_answer` returns true for the next `extcmd` request while that is pending.

### L2. Multi-pick menus highlight a row that Enter can't press

**Area:** keyboard UX (round-3 H2).
- `MenuDialog` declares no safe focus, so `focus_dialog` focuses the first row (`travel_and_transfer/04-pickup-screen.png`: the dagger row has the focus ring).
- In a PICK_ANY menu, Enter and Space confirm the menu whatever has focus (`ui/dialogs/menu_dialog.gd:250-254`). Arrowing to "b - an uncursed food ration" and pressing Enter picks up nothing and closes the menu.
- The pad works, because A arrives as `ui_accept` and presses the row. The keyboard has no key that toggles the highlighted row; only its letter does.
- The round-3 status says "Enter presses the highlighted row or button". That holds for PICK_ONE menus only.
- **Fix:** keep classic Enter for "confirm". Start PICK_ANY menus with the focus on the confirm button (`set_meta("safe_focus", ...)`), so Enter confirms as in tty. Once the player arrows onto a row, Enter and Space toggle that row; on the confirm button they confirm.

### L3. The cell context menu still swallows Enter, arrows and Tab

**Area:** keyboard UX (round-3 H2).
- `ContextMenu.handle_key` returns `true` for every key (`ui/dialogs/context_menu.gd:73-81`). Only Esc and 1–9 work.
- The menu draws a focus ring on its first row (`look_and_minimap/04-pet-context-menu.png`), but Enter doesn't press it, and the arrows don't move it.
- **Fix:** return `false` for keys the menu doesn't use, as round 3 asked.

### L4. A close request made while dying stays armed after life saving

**Area:** lifecycle (round-3 M2, second half).
- `request_quit` during `state.ending` sets `_quit_after_save` and waits for the run to end (`main.gd:194-196`).
- If an amulet of life saving (or "Die? n") saves the hero, nothing in `App` reacts. `GameState` clears its own end state on `done.survived` (`state/game_state.gd:238-242`) but emits no signal. The window stays open after the player closed it.
- `_quit_after_save` stays set, so the next death or save quits the app instead of showing the end screen (`main.gd:200-204`).
- **Fix:** add a `survived` signal to `GameState`. In `App`, when it fires and `_quit_after_save` is set, call `game.save_from_anywhere()`.

### L5. Shift, Ctrl or Alt alone dismiss text windows and NetHack's read-only menus

**Area:** UX (round-1 item 12's fix).
- `TextWindowDialog.handle_key` closes on any key it doesn't scroll with (`ui/dialogs/text_window_dialog.gd:83-85`), including a lone modifier press. `DialogHost._input` hands it every pressed key (`ui/dialog_host.gd:74-75`).
- Alt+Tab away from a long help page, or pressing Shift on the way to `?`, closes the window. For read-only menus (`_is_document`), the close also sends NetHack its dismissing space (`dialog_host.gd:158-160`).
- Round 1's fix said: close only on Esc, Enter or Space.
- **Fix:** ignore `KEY_SHIFT`, `KEY_CTRL`, `KEY_ALT`, `KEY_META` and `KEY_CAPSLOCK`. Better, follow round 1: close on Esc, Enter, Space (at the end) and the pad's B.

### L6. Direction prompts point everywhere even when NetHack lists the valid directions

**Area:** UX (no dead ends).
- In `descent/02-dig-direction.png` NetHack asks "In what direction do you want to dig? [>]": only down is valid there. The compass still draws all eight chevrons (`world/world_view.gd:539-557`), and the banner offers "Up <" and "Here ." (`ui/dialog_host.gd:167-174`).
- A click on a plain floor neighbour sends that direction, and the hero swings the pick through thin air (`src/dig.c:1273`). NetHack built that list for this purpose (`src/dig.c:1123-1151`), so showing it reveals nothing.
- **Fix:** when the query ends in a bracketed list, parse it as `QuestionDialog.parse` does. Draw chevrons only for the listed directions, and offer only the listed chips.

### L7. The action bar shows keyboard keys while the player uses a pad

**Area:** gamepad hints (round-2 M16).
- The bar's labels are built once with keyboard keys ("Inventory i", "Commands #", "Menu Esc", `ui/action_bar.gd:65-69`). `gamepad_play/03-pad-safe-stairs.png` shows them during pad play.
- Banners and dialog footers already switch with `GamepadRouter.hint`.
- **Fix:** relabel the bar when `GamepadRouter.active` changes: X for Inventory, Y for Commands, Start for Menu, Back for Map, and no key for the rest.

### L8. The unidentified tsurugi isn't treated as two-handed

**Area:** equipment (round-3 L2).
- `TWO_HANDED_WORDS` has "tsurugi" but not its unidentified name, "long samurai sword" (`include/objects.h:282`, bimanual). With a shield on, the equipment screen offers it as a normal main-hand choice.
- **Fix:** add "long samurai sword", or better, have the bridge send the bimanual flag for known object types.

### L9. Round-3 fixes without a scenario, and one weak assertion

**Area:** testing doctrine.
- No scenario covers:
  - closing the window during a wish (M1)
  - life saving (M2)
  - a minimap click next to the hero (M3)
  - the keyboard-only pass round 3 asked for in `travel_and_transfer` (arrows, Enter, typing in the search box)
  - B on an "Are you sure?" card (L5)
  - the absence of a flashing item dialog (L3)
- The "Call this kind…" check (`tests/scenarios/inventory_equipment.gd:98`) passes when the letter was typed, as long as the hero didn't move. If the cell south-west of the hero is a wall, the letter runs as a move and the test still passes.
- **Fix:** assert `typed.is_empty()` alone. Add the missing passes; the life-saving case can use a fixture with a worn amulet of life saving.

### L10. The message feed can't be scrolled back

**Area:** parity, HUD.
- Electron's log panel keeps the last 100 messages, scrolls ("Exact messages, newest first. Scroll for earlier events", `electron-poc/src/ux/app-shell.js:369-370`, `consequence-feed.js:36,103-104`) and can be resized, with the size saved (`app-shell.js:268-309`, `settings-store.js:20`).
- Godot's feed keeps 7 lines (`ui/message_feed.gd:8,68-70`) and fades after 9 s idle. Anything older needs the F2 history panel, a modal.
- History holds everything, so nothing is lost. The cost is a modal for "what did that say two turns ago?".
- **Fix:** let the mouse wheel over the feed scroll back through recent messages, without opening a modal (today the wheel zooms the map). A height setting is optional.

### L11. Small settings and status gaps

**Area:** parity, settings.
- **Contextual prompts:** Electron has an off/essential/full setting (`electron-poc/src/ux/settings-store.js:14,40`) that controls the locked-door follow-ups. Godot always shows its lock follow-ups (`ui/action_bar.gd:141-168`), with no switch.
- **Motion:** Electron's default, "system", follows the OS reduced-motion preference (`settings-store.js:21,56`). Godot's Reduced motion is a plain switch that starts off (`game/settings.gd:10`).
- **Minimap size:** still missing (see the round-3 table).
- **Terrain chip:** Electron's detailed HUD shows "On: <terrain>" (`electron-poc/src/shared/status-hud.js:194`). Godot parses `StatusModel.Field.TERRAIN` (`state/status_model.gd:8`) and never shows it. This was part of round-1 item 23.
- **Silent failures:** `Settings.save` ignores the result of `file.save(PATH)` (`game/settings.gd:66`), and a failed load quietly falls back to defaults. Electron says so in both cases (`settings-store.js:128,137,145`).
- **Fix:**
  - Add the contextual-prompts setting.
  - Seed Reduced motion from the OS at first run, where Godot exposes it.
  - Show terrain in the detailed hero card.
  - Flash a notice when saving settings fails.

---

## Already better than Electron (keep these)

- Rounds 1 to 3's lists still hold.
- `send_sequence` itself is right: one command, then each answer only when NetHack asks that kind of question. M1 is about what runs around it, not the idea.
- Blocked equipment choices now say why, in place (`equipment_swaps/04-two-handed-blocked.png`).
- The end screen, the level banner and the hero card all use the same "Dungeons of Doom · Depth N" wording.
- The shared bridge diff stays additive and gated, and its vision map reveals nothing the hero hasn't seen.

---

## Status after the fix pass (2026-10-17)

**Fixed:**
- **M1 (sequence type-ahead):** `InputRouter.cancel_automation()` stops any running sequence, equipment chain or queued panel when the player acts: a key, a map click, a pad button or stick step, or a save. The armour runner sends an item letter only to an item question (a menu, or a question with no listed answers); a real yes/no is left to the player.
- **M2:** the command palette's "Available here" lists the neighbour actions (doors, shopkeepers) and the lock follow-ups too, so pad players reach everything the action bar shows. Covered by the new `locked_door` scenario.
- **M3:** NetHack's long text windows have a search box (`/` or Ctrl+F). Matches are highlighted, and Enter or F3 goes to the next one.
- **M4:** drag and drop. Container rows drag to the other pane (a selected row carries the whole selection), and the target pane lights up. Equipment rows drag onto any slot they fit, with the fitting slots lit and the rest dimmed; a blocked slot (a two-hander with a shield on) refuses the drop.
- **L1:** keys that already hold an extended command (`#force\n`) answer NetHack's extended-command prompt, so the palette no longer flashes up or plays its sound.
- **L2:** in pick-several menus Enter still confirms, as in tty. Once the player arrows onto a row, Space toggles it. A footer hint says so.
- **L3:** the cell context menu passes the arrows, Tab, Enter and Space on to its focused row.
- **L4:** `GameState.ending_cancelled` fires on life saving; a close made during the death then saves and quits. New `life_saving` scenario: amulet of life saving plus lava. It fails without the fix.
- **L5:** Shift, Ctrl, Alt, Meta and Caps Lock alone never dismiss a text window. Read-only menus already ignored them.
- **L6:** when a direction prompt lists its directions (`[>]`), only those get chevrons and chips. A click elsewhere is refused with "Not that way: this only works toward down."
- **L7:** the action bar shows the pad's buttons (X, Y, Start, Back, R3) while the pad is in use, and the keys again after a key press.
- **L8:** "long samurai sword" counts as two-handed. Checked against every bimanual weapon in `objects.h`.
- **L9:** new or extended scenarios:
  - `wish_close`: closing during a wish (fixture: wand of wishing)
  - `life_saving`
  - a minimap click next to the hero (`look_and_minimap`)
  - a keyboard-only pickup (`travel_and_transfer`)
  - B on an "Are you sure?" card (`gamepad_play`)
  - no dialog flashing for automatic answers (`inventory_equipment`)
  
  The "Call this kind" check now asserts on `Scenario.commands_run()`, which counts only keys NetHack ran as commands (the bridge also logs answers as `bridge_command`).
- **L10:** the mouse wheel over the message feed scrolls back through the last 100 messages, with a "N newer" hint. A new message returns it to the newest.
- **L11:**
  - Settings > Locked-door suggestions: Always, With a key, or Off (Electron's contextual prompts).
  - Settings > Minimap: Small, Medium or Large. The level banner moves down to stay below it.
  - On first run, Reduced motion follows the OS where Godot reports it.
  - The detailed hero card says what the hero stands on. NetHack's terrain status field isn't sent, so this is read from the map.
  - Failing to save or read the settings now says so.

**Found and fixed along the way:**
- `DialogHost` crashed when a NetHack request arrived while an "Are you sure?" card was up and no other dialog was open (`owns_input()` was true with `active` null). The wish-close test found it.
- The fixture loader built locked doors as `D_CLOSED | D_LOCKED`. NetHack treats any door with `D_CLOSED` as unlocked, so the "locked" door simply opened. It now uses `D_LOCKED` alone, as NetHack does. This touches shared fixture code (`src/allmain.c`); Electron's fixture build gets the fix the next time it is rebuilt.
- The fixture loader learned `AMULET_OF_LIFE_SAVING` and `WAN_WISHING`.
- Lock follow-ups now come first on the bar, hide "Open door" while shown, and clear once the lock is picked, forced or the door opens.
- The wish-close card now says what really happens: a blank wish makes NetHack pick a random object. The button reads "Save and quit anyway".

**Left, with reasons:**
- **L2 alternative:** making Enter toggle rows after arrowing (as the review suggested) would take away tty's "Enter confirms". Space toggles instead.
