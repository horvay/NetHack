# Godot front end review, round 3

Date: 2026-10-17. Scope: everything in `godot-poc/` plus the Godot-only (`NH_BRIDGE_EXTENDED`) parts of `electron-poc/shim-bridge/nh-shim-bridge.c` and the fixture lines in `src/allmain.c`, after the round-2 fix pass.

The lenses are the same as rounds 1 and 2:
1. Functional parity with Electron (`electron-poc/src/ux`, `src/shared`, `src/renderer.js`).
2. UX quality, from the screenshots of the latest full run (17 scenarios, `test-output/`, 17:43–17:46) and the UI code.
3. Architecture and correctness: threading, lifecycle, signals, GDScript pitfalls, type-ahead, spoilers, and Electron's event stream.

**How the findings were checked**
- Read-only review. Nothing was built or run.
- Every finding was checked against the code. UX findings were also checked against the screenshots named in them.
- Engine claims were checked in NetHack's own source in this repository: `src/invent.c` (`getobj`), `src/do_name.c` (`docallcmd`, `call_ok`), `src/pray.c` (`dosacrifice`), `src/apply.c` (`doapply`, `dorub`), `src/wield.c`, `src/cmd.c` (`domouseaction`), `src/zap.c` (`makewish`), `src/end.c` (`done`), `include/objects.h`. Bridge claims were checked in `nh-shim-bridge.c` (`shim_yn_function`, `shim_select_menu`, `shim_get_ext_cmd`).
- The uncommitted diff of `nh-shim-bridge.c` against `HEAD` was read in full. Every Godot addition is behind `bridge_extended_events()`. The only change to Electron's stream is the fixture-only `vision_full_recalc` in `src/allmain.c`, which round 2 already recorded.
- Paths are relative to `godot-poc/project/` unless they start with `extension/`, `docs/`, `electron-poc/`, `src/` or `include/`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 2 high, 4 medium, 11 low (17 in total). In the round-2 verification, 8 items marked fixed are only partly fixed, and one fix (L3) introduced a new bug for number_pad players.

---

## Round-2 verification

These hold up in the code: H1 (the alternate weapon stays in hand, and swap is offered only when there is an alternate), H3, H4 (`small_window/02-inventory.png` and `03-equipment.png` read cleanly at 1280×720), M1, M2 (forked children `_exit`, and `stop()` gives up after 5 s), M5, M6, M8, M10, M11 (the status tooltips no longer give cures), M13, M15, M16, M17, L1, L2, L4, L5, L6, L8, L9, L11 and L12.

**Fixed only in part, or with a new problem:**

| # | What's still wrong |
|---|---|
| H2 | The listed panels now pass unhandled keys to the GUI. The two dialogs players see most, NetHack's menus and questions, were not covered: arrows pick items there and Enter cancels. See H2 below. |
| M3 | Actor step slides (`world/actor_layer.gd:149-151`) and teleport blinks (`:142-146`) still animate with Reduced motion on. See L4. |
| M4 | Closing the window during a wish answers the wish prompt with Esc, which throws the wish away. NetHack's own hangup save keeps it. The reason round 2 gave for leaving the hangup input ("Godot answers open questions safely") doesn't hold for wishes. See M1. |
| M7 | The item picker's search box can't be typed into: every key goes to NetHack first, and a letter that matches an item uses that item. See H2. |
| M9 | Landings are now held back during a replay. Batches still end at every drained frame (`state/game_state.gd:243-253`), so a burst that straddles two frames still plays part of its timeline. See L4. |
| M12 | Kick, chat and untrap now wait for the direction prompt. Unlock still sends `"a" + tool letter` in one burst (`input/cell_actions.gd:110`, `ui/action_bar.gd:156,165`). See H1. |
| M14 | The umask is restored when the game ends. While a game runs, Godot still works under NetHack's 0117 mask. See L7. |
| L3 | vi-keys players are fixed. Under number_pad, the direction digit itself is stripped, so `last_direction` is never set. See L1. |
| L7 | Reset and option logging are fixed. There is still no separate switch for game sounds. See L11. |
| L10 | `start()` still calls `drain()` after `App.start_game` has built the new screen (`extension/src/nethack_core.cpp:142`). Still not reachable from the UI. See L8. |

The round-2 "found while fixing" claim, that every item command now answers only the questions NetHack actually asks, is true for single-key commands. It is not true for item actions built on extended commands. See H1.

---

## High

### H1. Extended-command item actions and Unlock still type the item letter ahead

**Severity:** high. Greg flagged type-ahead as the key lesson of round 2, and one case is reachable on turn 1. **Area:** input, classic keys.

**What's wrong**
- `InputRouter.send_item_command` sends any keys that start with `#` in one burst (`input/input_router.gd:406-407`). These item actions all start with `#`:
  - "Call this kind of item…": `"#name\no" + letter` (`input/item_actions.gd:109`)
  - "Offer on the altar": `"#offer\n" + letter` (`:97`)
  - "Rub": `"#rub\n" + letter` (`:78,83`)
  - "Dip it into…", "Name this item…" and "Move to another letter…" (`:61,108,110`). These three are safe today, because their `getobj` always asks.
- NetHack skips the item question in these cases, so the letter runs as a new command:
  - **Call this kind:** the `o` branch of `docallcmd` uses `getobj("call", call_ok, GETOBJ_NOFLAGS)` (`src/do_name.c`). `call_ok` excludes object types that have no description. With nothing callable in the pack, `getobj` prints "You don't have anything to call." and returns without asking (`src/invent.c:1912-1914`). A starting Valkyrie's spear, dagger, small shield and food rations all lack descriptions (`include/objects.h`). The action is listed for every item (`small_window/02-inventory.png`). "Call this kind…" on the dagger (letter `b`) therefore steps the hero south-west, or attacks whatever stands there.
  - **Offer:** `dosacrifice` refuses while Confused or Stunned, before asking for an item (`src/pray.c:1864-1866`). With a corpse on the altar, the typed letter answers `floorfood`'s "There is a … here; sacrifice it? [ynq]" first. Letter `y` sacrifices the wrong corpse, and letter `q` cancels.
  - **Rub:** `dorub` refuses without hands (`src/apply.c:1789-1792`).
  - **Unlock:** `doapply` refuses without hands or when Overtaxed (`src/apply.c:4219-4224`). `send_with_direction` then counts the `command` request as the skipped item question (`input_router.gd:482-484`), so the direction also stays armed for the next prompt.
  - **Set as alternate:** `set_alternate` and `_alternate_rewield` send `"w" + letter` (`input_router.gd:304,318`). `dowield` refuses polymorphed forms that can't wield (`src/wield.c:368-371`). This one is rare.
- `send_with_answers` can't fix this as it stands. A `#` command first raises an `extcmd` request, and `_on_request_for_chain` clears the chain on any kind other than `yn` or `menu` (`input_router.gd:451-454`).

**Fix**
- Write one step runner that the item, direction and answer helpers all share. It takes a command plus ordered answers, each tagged with the request kind it answers: `menu`, `yn` (empty choices only), or `direction`. It lets `busy` and the command's own `extcmd` prompt pass. It sends an answer only when NetHack asks the matching kind, and drops the rest otherwise.
- Use it for:
  - `"#name\n"` → menu `o` → item letter
  - `"#offer\n"`, `"#rub\n"` and `"#dip\n"` → item letter
  - Unlock: `"a"` → item letter → direction
  - `set_alternate`: `"w"` → item letter
- Add the Valkyrie case to `inventory_equipment`: "Call this kind of item…" on the dagger must leave the hero in place.

### H2. In NetHack's menus and questions, arrows pick items, Enter cancels, and the search box types into the game

**Severity:** high. These keys perform actions the player didn't choose, in the two most common dialogs. **Area:** input, dialogs, round-2 H2 and M7.

**What's wrong**
- `DialogHost._input` hands every key to `active.handle_key` before the GUI sees it (`ui/dialog_host.gd:71-80`). `InputRouter.key_to_nethack` turns the arrow keys into `h`, `j`, `k`, `l` (`input/input_router.gd:126-128`). Both prompt dialogs then treat those letters as NetHack keys:
  - `QuestionDialog.handle_key` sends every key to NetHack (`ui/dialogs/question_dialog.gd:243-257`). In "What do you want to drop? [a-j or ?*]", pressing Down drops item `j`. In "Which ring-finger, Right or Left? [rl]", pressing Right puts the ring on the **left** hand.
  - `MenuDialog.handle_key` presses the row whose letter matches (`ui/dialogs/menu_dialog.gd:262-265`). In the spell menu, Down casts spell `j`. In a pickup menu, Down ticks item `j`.
- Both dialogs get a visible starting focus (`dialog_host.gd:90`): the first row in menus, Cancel in item pickers. A keyboard player sees the focus ring, but Enter never presses the focused control:
  - In a PICK_ONE menu, Enter sends Esc (`menu_dialog.gd:242-247`).
  - In an item question, Enter goes to NetHack as `\n`, which `getobj` treats as "Never mind" (`question_dialog.gd:250-254`).
  - In a yes/no question with a default, Enter answers the default, whichever button has focus.
- The item picker's search box (round-2 M7, `question_dialog.gd:184-194`) has no `has_focus()` check, unlike `MenuDialog` (`menu_dialog.gd:225`) and `HelpScreen`. Typing "food" sends `f` to NetHack first. If `f` is an item letter, NetHack drops, quaffs or reads item `f`, and the picker closes. Digits typed into a row's count box also go to NetHack.
- `ContextMenu.handle_key` returns `true` for every key (`ui/dialogs/context_menu.gd:73-81`). Enter, Tab and the arrows do nothing there; only the digits 1–9 work.
- No scenario uses arrows, Enter or the search box in these dialogs. `travel_and_transfer` sets the count box from code and clicks the row (`tests/scenarios/travel_and_transfer.gd:79-81`).

**Fix**
- In `QuestionDialog` and `MenuDialog`:
  - Return `false` for arrows, Tab and Enter when a control has focus, so Godot moves the focus and presses the focused row.
  - Send only printable keys that aren't arrows to NetHack. Keep the classic letters, counts and menu shortcuts.
  - While a `LineEdit` (search or count) has focus, pass every key except Esc to it, as `MenuDialog` already does.
- In `ContextMenu`, return `false` for keys it doesn't use.
- Add a keyboard-only pass to `travel_and_transfer`: arrow down an item picker, press Enter, type in the search box, and check that the right item was used.

---

## Medium

### M1. Closing the window during a wish throws the wish away

**Severity:** medium (rare, but a wish is the most valuable thing in a run). **Area:** lifecycle, data safety (round-2 M4).

**What's wrong**
- `GameScreen._drive_save` answers any `line` request with Esc (`game/game_screen.gd:169-170`). For "For what do you wish?", `makewish` turns Esc into an empty name (`src/zap.c:6360-6361`). The empty name becomes a random object, or "Nothing fitting that description" and a retry. Either way the wish is spent before the save.
- NetHack handles this case itself: on a hangup during the wish prompt it sets `resume_wish`, and the restored game asks for the wish again (`src/zap.c:6353-6356`, `src/allmain.c:330-331`).
- `LineDialog` already refuses an empty wish from the player (`ui/dialogs/line_dialog.gd:136-141`), so the team knows the risk. The close path bypasses that guard.
- Genocide prompts have the same problem: Esc there spends the genocide.

**Fix**
- Preferred: add round-2's extended "hangup" input (NetHack's `hangup(1)`, then wake the pending read). NetHack then saves through its own path, `resume_wish` included.
- Smaller fix: while a `line` request is a wish or a genocide, don't answer it. Show a card ("Finish your wish first, or the game can't be saved") and keep the window open.

### M2. A life-saved death stays on record: a later save is shown as "You died"

**Severity:** medium. The end screen tells the player their run is over when it was saved. **Area:** state, end screen.

**What's wrong**
- `GameState` merges every `shim_native_end_diagnostic` into `end_info`. On `done.survived` it only clears `ending` (`state/game_state.gd:230-237`). After an amulet of life saving (or `Die? n` in explore mode), `end_info.how` keeps the death's value (`src/end.c`: `done.enter`, then `done.survived`).
- When that hero later saves, `EndScreen` sees `how >= 0` and shows "died" (`ui/end_screen.gd:33,56-57`). It also lists the earlier death messages as "Last moments", because `EndChronicle` filed them while `ending` was true (`end_chronicle.gd:52-56`).
- A related hole in the close flow: if the window is closed during that dying window, `request_quit` sets `_quit_after_save` and returns, waiting for the run to end (`main.gd:185-187`). The hero survives, so nothing saves and the window stays open. The flag stays set, so the next real death closes the app instead of showing the end screen.

**Fix**
- On `done.survived`, clear `end_info`, `chronicle["final_words"]` and `dying`.
- In `App`, when `ending_started` is followed by survival and `_quit_after_save` is set, run `save_from_anywhere()`.

### M3. Clicking the hero's own dot on the minimap takes the stairs, sits on a throne or attacks

**Severity:** medium (a minimap is for travel, and these are surprising, sometimes irreversible actions). **Area:** mouse input.

**What's wrong**
- `MiniMap._on_input` sends a NetHack map click for any explored cell (`game/ui/mini_map.gd:125-131`). The main map ignores clicks on the hero (`input/input_router.gd:189`). The minimap doesn't.
- NetHack's `domouseaction` runs these for a click on the hero's own square (`src/cmd.c`, after `click_to_cmd`):
  - on stairs: `doup` or `dodown`
  - on a throne: `dosit` (random throne effects, no confirmation)
  - at a fountain or sink: `dodrink`
  - on objects: pick up or loot
  - otherwise: rest a turn
- A click on a neighbouring cell is a step or an attack.
- The hero dot is the brightest, pulsing thing on the minimap. At the minimap's scale (about 4 px per cell, `world_first_look/01-start.png`), hitting the hero's cell or a neighbour by accident is easy.

**Fix:** ignore minimap clicks within one cell of the hero (or flash "Click further away to travel"). Keep NetHack's own click handling for the main map.

### M4. Blocked equipment choices look clickable and give no reason

**Severity:** medium. The screenshot meant to show the block doesn't show it. **Area:** UX, equipment screen.

**What's wrong**
- In `equipment_swaps/04-two-handed-blocked.png`, the quarterstaff row looks like any other: same background, white text. Clicking it does nothing.
- The reason ("Take off your shield first: this weapon needs both hands.") lives only in `tooltip_text` (`ui/dialogs/equipment_screen.gd:228-232`). Keyboard and pad players never see it. Mouse players see it only after hovering.
- `row.disabled = true` changes nothing visible. `ItemRow` draws its text in child Labels (`ui/item_row.gd:50-73`), so the theme's `font_disabled_color` never applies to them.

**Fix**
- Dim disabled `ItemRow`s (modulate the content, use `INK_FAINT` for the name).
- Print the reason under the row. Better: offer the fix as an action ("Take off the shield and wield") through `run_equipment_steps`.

---

## Low

### L1. Under number_pad, move directions are never recorded (introduced by the round-2 L3 fix)

**Area:** feedback, action bar.
- `_note_direction` strips the characters `0123456789nFGgm` from the front (`game/game_screen.gd:90`). Under number_pad, the direction keys are digits, so `F6` or `6` strips to nothing and `last_direction` never changes.
- Lunge and target matching fall back to name guessing. The lock follow-ups fall back to every neighbouring closed door (`ui/action_bar.gd:148-150`).
- **Fix:** strip a count (`n` plus digits) first, then one of `F`, `G`, `g`, `m`, then read the direction character.

### L2. The two-handed list misspells one polearm and misses two weapons

**Area:** equipment (round-2 M6).
- `TWO_HANDED_WORDS` has "pole-sickle". NetHack's unidentified fauchard is "pole sickle" (`include/objects.h:323`).
- "pruning hook" (the unidentified guisarme, `:326`) is missing.
- "unicorn horn" is missing. It is bimanual (`:1013`) and is offered for the main hand (`ui/dialogs/equipment_screen.gd:302`).
- **Fix:** correct the spelling and add both. Better, ask the bridge for the bimanual flag of known object types.

### L3. NetHack's item prompt flashes on screen during every item action

**Area:** UX polish.
- `DialogHost` connects to `request_changed` before `InputRouter`'s lazily connected handlers. When `send_item_command` or `run_equipment_steps` answers NetHack's "What do you want to …?", the `QuestionDialog` is built and fades in first, then closes on the next request.
- This happens on every Wear, Take off, Drink and similar action.
- **Fix:** expose `InputRouter.will_answer(request)` and have `DialogHost._on_request` skip showing the dialog when the router answers it.

### L4. Motion left over

**Area:** reduced motion, juice (round-2 M3, M9).
- With Reduced motion on, actors still slide 0.13 s per step (`world/actor_layer.gd:149-151`) and fade-blink on teleports (`:142-146`).
- Beat batches still end at every drained frame (`state/game_state.gd:243-253`). A thrown object whose events arrive across two frames replays only part of its flight.
- **Fix:** snap positions when `Motion.enabled()` is false. Hold `_frames` until the next input-wait event (`bridge_command_prompt`, `bridge_key_wait`, or any prompt "opened") before emitting `animation_ready`.

### L5. The pad's B button doesn't cancel "Are you sure?" cards

**Area:** gamepad.
- `GamepadRouter._dialog_input` turns B into Esc through `handle_key` (`input/gamepad_router.gd:136-142`).
- `ConfirmDialog` inherits `ModalCard.handle_key`, which returns `false` (`ui/dialogs/modal_card.gd:101-102`). Over the inventory, the event goes to `InventoryScreen.handle_key`, which swallows it while a `Confirm` child exists (`ui/dialogs/inventory_screen.gd:449-450`).
- A still works, because Cancel has the focus. B, which every other dialog uses to back out, does nothing.
- **Fix:** give `ConfirmDialog` a `handle_key` that closes on Esc, and route B to `blocking_modal()` first.

### L6. Text-prompt hints give strategy advice

**Area:** no-spoiler policy (same policy as round-2 M11).
- `LineDialog.hint_for` (`ui/dialogs/line_dialog.gd:117-131`) tells the player:
  - "Elbereth frightens most monsters. Dust smudges when you fight on it." (`gamepad_play/04-pad-keyboard.png`)
  - "blessed +2 silver dragon scale mail" as the example wish
  - "soldier ant" as the example genocide
- These are community strategy, not something the character knows.
- **Fix:** keep the syntax help ("Name the object, with any blessing, enchantment or count") and use neutral examples ("2 blessed scrolls"), or put the advice behind an opt-in hints setting.

### L7. Godot runs under NetHack's umask while a game is running

**Area:** process containment (round-2 M14).
- `nhcore.c` saves the umask in `nhcore_run` and restores it in `nhcore_finish` (`extension/core/nhcore.c:209,276`). In between, `libnhmain` has set 0117 for the whole process.
- Any directory Godot creates during play gets mode 0660, which has no search bit, so nothing can be created inside it. Godot's lazily created per-shader cache folders are one example.
- **Fix:** wrap `umask` (`-Wl,--wrap=umask`) as a no-op that returns the current mask, as round 2 suggested.

### L8. Core lifecycle leftovers

**Area:** extension.
- When `stop()` times out, `NOTIFICATION_PREDELETE` detaches a game thread that still uses `this` (`extension/src/nethack_core.cpp:104-111`). The thread pushes into the freed `pending_lines`, and it runs code from an extension library that may be unloaded at exit. Leak the object, or keep a static holder alive until the thread ends.
- `start()` still delivers the previous game's undrained events and `game_ended` to the new screen (`:140-142`, round-2 L10). Drain before `App.start_game` builds the screen, or drop stale lines in `start()`.

### L9. The end screen uses a different level wording

**Area:** wording.
- `EndScreen` says "quit on dungeon level 1" (`ui/end_screen.gd:257`, `run_lifecycle/08-quit-end.png`). The stats beside it, and the decision log, say "Depth 1".
- **Fix:** use `state.level_name(true)`.

### L10. Layout edges

**Area:** HUD layout.
- At 1280×720 the hero card covers the room's top-left tiles (`small_window/01-playing.png`). The camera framing doesn't account for the HUD insets.
- The action bar is one `HBoxContainer` with no wrap or overflow handling (`ui/action_bar.gd:27-36`).
  - Two locked doors next to the hero give six context buttons (an "Open door" for each, plus "Unlock" and "Kick it open" for each, `:151-157`) on top of the ten fixed ones.
  - That is wider than 1920 px, and the bar runs off both edges.
- **Fix:**
  - Offset the camera target by the HUD's occupied rectangles.
  - Cap the context group (show the top three, plus a "More…" that opens the context menu), or wrap it into a second row.

### L11. Small parity gaps with Electron settings

**Area:** settings.
- Electron has separate "interface sounds" and "game feedback sounds" switches, both off by default, plus a minimap size (`electron-poc/src/ux/settings-store.js:12-23`).
- Godot has a master volume and an interface-sound switch that is on by default (`game/settings.gd:21`). A player can't silence game sounds while keeping the UI sounds, or the reverse.
- **Fix:** add a game-sound switch, and decide the defaults.

---

## Already better than Electron (keep these)

- Rounds 1 and 2's lists still hold.
- `send_item_command`, `send_with_direction` and `run_equipment_steps` are a sound design. H1 asks for the same idea to cover the remaining paths, not a different one.
- Armor swaps take off the layers on top and put them back on, and the inventory shows the item each one would replace (`equipment_swaps/01-compare.png`).
- The drop-types menu no longer has a "Select all" trap (`travel_and_transfer/02-drop-categories.png`).
- Text entry from a pad has an on-screen keyboard with suggestions (`gamepad_play/04-pad-keyboard.png`).
- Confirmation cards now really block input, and the palette never highlights a dangerous row by default (`ui_panels/07-palette-sections.png`).
- The shared bridge diff is cleanly gated. Map clicks are dropped anywhere but `nh_poskey`, so a click can never become a key.

---

## Status after the fix pass (2026-10-17)

**Fixed:**
- **H1 (type-ahead):** every follow-up answer now goes through one engine, `InputRouter.send_sequence`. A command is sent alone, and each answer (item, menu, direction) goes only when NetHack asks for that kind of thing. A real yes/no question on the way is left to the player, and anything unexpected ends the sequence. Covered paths:
  - `#`-commands (call, name, adjust, offer, rub)
  - Unlock (`a` + key + direction)
  - the alternate-weapon chain
  - look-up
- **H2:** arrows, Tab and Page/Home/End move the highlight in NetHack's menus and questions and never answer them. Enter presses the highlighted row or button; a yes/no question starts on NetHack's default answer, as Enter does in tty. The picker's search box keeps the letters you type, and `/` focuses it.
- **M1:** closing the window during a wish asks first.
- **M2:** life saving clears the recorded death.
- **M3:** the minimap travels only. Clicks on or next to the hero are ignored.
- **M4:** blocked equipment rows are dimmed, with the reason shown inline.
- **L1, L2, L3:** dialogs answered automatically no longer flash up (`InputRouter.will_answer`).
- **L4:** Reduced motion snaps actors into place, and animation beats are held until NetHack waits for input.
- **L5:** B cancels "Are you sure?" cards.
- **L6:** text hints give syntax only.
- **L7:** `umask` is wrapped as a no-op.
- **L9:** "at Dungeons of Doom · Depth N".
- **L10:** at most three context buttons, with "More…" for the rest.
- **L11:** a separate game-sounds switch.
- Also: the deferred `focus_dialog` call was crashing on freed dialogs; fixed.

**Left, with reasons:**
- **L8 (core):** the detached thread after a 5 s stop timeout only happens while the app exits with NetHack stuck outside any input wait. Undrained leftovers at `start()` can't happen from the UI, because every game ends through `game_ended` before a new one starts.
- **L10 camera:** HUD insets at small windows. The hero stays centred and visible; the corners can be covered at 1280×720.
- **L11 defaults:** game and interface sounds stay on by default, by design.
