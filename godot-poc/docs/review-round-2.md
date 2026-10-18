# Godot front end review, round 2

Date: 2026-10-17. Scope: everything in `godot-poc/` plus the Godot-only (`NH_BRIDGE_EXTENDED`) parts of `electron-poc/shim-bridge/nh-shim-bridge.c`, after the round-1 fix pass.

The review has the same three lenses as round 1:
1. Functional parity with Electron (`electron-poc/src/ux`, `src/shared`, `src/renderer.js`, `src/main`).
2. UX quality, from all screenshots of the latest full run (16 scenarios, `test-output/`) and the UI code.
3. Architecture and correctness: the C core, the GDExtension, the bridge additions and the GDScript.

**How the findings were checked**
- Read-only review. Nothing was built or run. Each finding was checked against the code, and the UX findings also against the screenshots named in them.
- A test run was rewriting `test-output/` while the review started. Every screenshot cited here comes from the finished run (15:47–15:54).
- Engine claims were checked in NetHack's own source (`src/wield.c`, `sys/libnh/libnhmain.c`, `src/files.c`, `src/Makefile`).
- Paths are relative to `godot-poc/project/` unless they start with `extension/`, `docs/`, `electron-poc/`, `src/` or `sys/`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 4 high, 17 medium, 12 low (33 in total). Round-1 verification found 10 items that are only partly fixed. None of the items marked fixed made things worse.

---

## Round-1 verification

Most fixes hold up. These are verified correct: 1 (Esc on item prompts sends Esc), 2, 4, 6 (beats are recorded and replayed; see item 13 for the leftovers), 7, 8, 9, 12, 14, 15, 16, 18, 20, 21, 23, 24, 27, 28, 29, 33, 34, 35, 37, 38, 39, 40, 41, 44, 47, 49, 50, 51 (one edge case in L11), 52, 56–62, 64, 66.

**Not fully fixed, though marked fixed:**

| # | What's still wrong |
|---|---|
| 3 | A start that `NetHackCore.start()` refuses (`ERR_ALREADY_IN_USE`, `ERR_FILE_BAD_PATH`) still only calls `push_error` (`main.gd:94-95`). No `game_ended` follows, so the player is left on a dead game screen. NetHack's `error()` path (`exit(1)`, for example after declining "Old game in progress") is shown as "crashed". See M5. |
| 5 | The app saves on close only when the game is at the command prompt (`game_screen.gd:117-122`). Everywhere else, including the end-of-game questions, the only choice is "Quit without saving". `auto_confirm_save` and `_quit_after_save` are never reset. See M4. |
| 11 | No hint is driven by the input device: `GamepadRouter.active` is only used to move focus (`ui/dialog_host.gd:69`). Every banner and card says "Esc", "Click" or "press hykulnjb". Text prompts can't be answered from a pad. See M16. |
| 13 | "Reduced motion" gates only card scale-in, actor hops, lunges, bob and camera shake. Floaters, sparks, the vignette pulse, the level fade and banner, the HUD stat pulse, zoom and overview tweens, the actor removal squash and the beat replay all still play. See M3. |
| 22 | The recursive mutex is in. The PREDELETE join timeout is not: `stop()` still does a plain `join_game_thread()` (`extension/src/nethack_core.cpp:190`). See M2. |
| 25 | The type-ahead is fixed, but "Change armor" (take off outer layers, then wear), "Compare with equipped" and correct two-handed blocking are still missing. The alternate-weapon flow now has a worse bug. See H1 and M6. |
| 26 | The action bar is fixed. The command palette still highlights "Leave the dungeon (ends the run)" as its first, default row, without the danger flag. See M1. |
| 32 | The item picker still has no search box and no count stepper (`ui/dialogs/question_dialog.gd:146-197`). See M7. |
| 46 | The code now emits `bridge_start_failed` without a `bridge_exit`. `docs/bridge-protocol.md:214-219` still says "Godot core: always", and `bridge_start_failed` is documented nowhere. See L12. |
| 10 / 36 | The UI now scales, and `small_window` exists, but at 1280×720 the text is unreadable and the scenario passes anyway. See H4. |

The "partly fixed" items 19, 36, 42 and 43 are as round 1 describes them. One addition to 43: `extension/core/nhcore.c:210` also skips `dlb_cleanup` on `error()`→`exit(1)`.

---

## High

### H1. "Set as alternate weapon" disarms the hero

**Severity:** high. **Area:** equipment, parity.

**What's wrong**
- `EquipmentScreen._equip("alternate")` sends `w`+letter, then `x` once the wield is done (`ui/dialogs/equipment_screen.gd:320-326`).
- NetHack only moves the old main weapon into the alternate slot when the `pushweapon` option is on (`src/wield.c:456-457`). `Settings.nethack_options()` never sets it (`settings.gd:65-77`).
- So with a spear in hand and no alternate, `w dagger` puts the spear back in the pack and `x` then swaps the dagger into the alternate slot. The hero ends up bare-handed. If an alternate existed, the old alternate ends up in hand instead.
- The `inventory_equipment` scenario misses this because it empties the hands with `w-` first (`tests/scenarios/inventory_equipment.gd:42-58`; screenshot `06-alternate-slot.png` shows "Main hand — empty —").
- Related: the main-hand slot always offers "Swap with alternate weapon" (`equipment_screen.gd:277`), even with no alternate. `x` then also leaves the hero bare-handed. Electron hides swap without an alternate (`electron-poc/src/shared/inventory-action-service.js:329-338`).

**Fix**
- Remember the old main weapon, then chain `w new` → `x` → `w old` through `InputRouter.send_then`. Alternatively add `pushweapon` to the options and keep the current two steps.
- Offer swap only when an item has `wornMask & 0x400`.
- Extend the scenario: set an alternate while a weapon is in hand.

### H2. Settings, Equipment, Container, Save picker and Help can't be used from the keyboard

**Severity:** high (classic keyboard players are the core audience). **Area:** input, dialogs.

**What's wrong**
- These `handle_key` functions return `true` for every key:
  - `ui/dialogs/settings_screen.gd:139-142`
  - `ui/dialogs/equipment_screen.gd:383-386`
  - `ui/dialogs/container_screen.gd:194-202`
  - `ui/dialogs/save_picker.gd:52-55`
  - `ui/dialogs/help_screen.gd:210-221`
  - the tail of `InventoryScreen.handle_key`
- `DialogHost._input` then marks the event handled before Godot's GUI sees it (`ui/dialog_host.gd:56-57`). `TitleScreen._input` marks every key handled for any open modal, whatever `handle_key` returns (`ui/title_screen.gd:163-168`).
- Result: Tab, the arrow keys, Space and Enter never reach the focused control. A keyboard player can't toggle a setting, pick an equipment slot, choose any save but the newest, or run any inventory action except the primary one.
- Electron's panels are all keyboard-navigable (`electron-poc/src/ux/equipment-screen.js:1033,1082,1272`, `focus-layer.js`).

**Fix**
- Return `false` for keys a panel doesn't handle itself, so Godot's focus navigation works.
- In `TitleScreen._input`, mark the event handled only when `handle_key` returns `true`.
- Give every panel an initial focus (reuse `GamepadRouter.focus_dialog`), and add a keyboard-only pass through Settings and Equipment to a scenario.

### H3. With number_pad on, "Step here" and "Swap places" arm a count instead of moving

**Severity:** high for number_pad players. **Area:** input, classic keys.

**What's wrong**
- `CellActions` sets the keys of the step and swap actions to the bare direction key (`input/cell_actions.gd:92,116`). Under number_pad that key is a digit.
- `run_cell_action` sends it through `InputRouter.send_command`, which puts `n` in front of any keys starting with a digit (`input/input_router.gd:248-249`).
- So `"6"` becomes `"n6"`: NetHack arms a count of 6, nothing moves, and the player's next command runs six times.
- The same happens for any context action whose keys start with a direction digit. The pad's A button reaches it through `GamepadRouter._primary` (`input/gamepad_router.gd:116-118`).

**Fix:** add the `n` prefix only for real counts. Mark rest and search actions with a `count` field, and leave direction keys alone.

### H4. At 1280×720 the interface text is unreadable

**Severity:** high (round-1 item 10 was high, and its fix produces this). **Area:** UX, layout.

**What's wrong**
- `project.godot` renders a 1920×1080 canvas and shrinks it to the window (`canvas_items`, `expand`). At 1280×720 every font is drawn at about 67% of its size.
- In `small_window/02-inventory.png`, `03-equipment.png` and `06-settings.png` the body text is about 10–11 px and word spaces collapse: "Swapwithalternateweapon", "Namethis item…", "Alwaysshow the full status", "Callthiskindofitem…".
- The scenario passes regardless, which goes against the BIBLE's rule that assertions alone never pass a UI test.

**Fix**
- Pick a base size the UI is designed for (1280×720 or 1600×900) and scale *up* from it. Alternatively, set `content_scale_factor` from the window height so text never drops below about 14 px.
- Turn on MSDF (or oversampling) for the body fonts so scaled text stays crisp.
- Make the `small_window` scenario check a minimum effective font size, and look at its screenshots.

---

## Medium

### M1. Danger confirmations are bypassed, and keys leak through them

**Severity:** medium. **Area:** UX safety, input.

**What's wrong**
- **Palette:** "Available here" rows copy only id, label and keys from `CellActions`, not `danger` (`ui/dialogs/command_palette.gd:69`). The palette opens with row 0 highlighted (`:111`), and Enter runs it. On the level-1 up stairs that row is "Leave the dungeon (ends the run)" (`ui_panels/06-palette-sections.png`). It runs with no Godot confirmation, and so do "Pray" and "Eat from the floor".
- **Right-click menu:** `ContextMenu._run` runs actions straight away (`ui/dialogs/context_menu.gd:61-63`), including "Attack" on a peaceful creature (marked `serious`).
- **Leaking keys:** `ConfirmDialog` is added straight to `dialogs.root` by the action bar (`ui/action_bar.gd:132-134`), the palette (`command_palette.gd:182-185`) and the close-window flow (`main.gd:119-123`). It is never `DialogHost.active`, so `owns_input()` is false while it is open. The dialog itself only consumes Esc and Enter (`ui/dialogs/confirm_dialog.gd:23-30`). Every other key, and the whole gamepad, reaches `InputRouter` and NetHack: pressing `h` moves the hero behind the "Are you sure?" card.

**Fix**
- Copy `danger` into palette entries, and never pre-highlight a dangerous row.
- Run context-menu actions through the same confirmation as `ActionBar._run_action`.
- Show `ConfirmDialog` through `DialogHost._show` (or a stacked "modal" slot `owns_input()` respects), and have it consume every key.

### M2. The game thread can hang Godot: forked NetHack children, and no join timeout

**Severity:** medium (high on a system without `/bin/gzip`). **Area:** C core, lifecycle.

**What's wrong**
- The core is built with `COMPRESS="/bin/gzip"` (`src/Makefile:1120`), so every save and restore forks (`src/files.c:1663-1697`). Mail does the same through `child()`.
- If `execv` or the `freopen` in the child fails, the child calls `exit`. The child inherited the thread-local `on_game_thread` flag, so `__wrap_exit` (`extension/core/nhcore.c:120-123`) longjmps *inside the child*, which is a copy of Godot.
  - The child writes a bogus `bridge_exit` into the shared output pipe, so the parent sees game over in the middle of a save.
  - It then joins threads that don't exist in the child (undefined behaviour).
  - The parent blocks in `wait()`. Plain `wait()` can also reap Godot's own `OS.execute` children.
- Round 1's join timeout is missing (`extension/src/nethack_core.cpp:190`). A game thread that never reaches an input wait (this case, or an engine loop) freezes Godot when it quits.

**Fix**
- Record `getpid()` in `nhcore_run`. In `__wrap_exit` and `__wrap_abort`, call `_exit(code)` when the pid differs.
- Better: build the core with `ZLIB_COMP`, which compresses without forking.
- Give the PREDELETE and `stop()` join a timeout that leaks the library instead of hanging.

### M3. "Reduced motion" still leaves most motion on (round-1 item 13)

**Severity:** medium (accessibility setting players rely on). **Area:** settings, juice.

**What's wrong**
- `Motion.enabled()` is read in only four places (`ui/dialogs/modal_card.gd:62`, `world/actor_layer.gd:119,209,229`), plus the camera checks in `world/world_view.gd`.
- Still moving with the setting on:
  - floaters and sparks (`world/effect_layer.gd:115-167`)
  - the hurt vignette pulse (`feedback_director.gd:70-74`)
  - the level fade and the banner (`ui/hud.gd:329-338`)
  - the stat pulse (`hud.gd:267-273`)
  - zoom and overview tweens (`world_view.gd:297-299,329`)
  - the actor removal squash (`actor_layer.gd:184-194`)
  - the beat replay (`world_view.gd:397`)

**Fix:** check `Motion.enabled()` at each of these. With reduced motion, keep the information (the damage number, the banner text) and drop the movement (fade in place, no scale, no rise).

### M4. The close-window save flow has holes (round-1 item 5)

**Severity:** medium (data safety). **Area:** lifecycle.

**What's wrong**
- The app saves only at the command prompt (`game_screen.gd:117-122`). At any other prompt it offers only "Quit without saving" (`main.gd:119-123`).
- During the end-of-game questions (`state.ending`), "Quit without saving" calls `stop_game()`. That throws away the death's xlog and score entry.
- `auto_confirm_save` (`state/game_state.gd:75`) is never reset. After one close-request save, a later manual `S` is answered "y" with no question.
- If the save fails, `_quit_after_save` (`main.gd:117`) stays set, and the next game end (a death, say) closes the app instead of showing the end screen.

**Fix**
- Add the extended "hangup save" input round 1 proposed (NetHack's `hangup(1)`, then Esc for the pending read). It saves from any prompt.
- While `state.ending`, wait for the end screen instead of offering to stop.
- Clear both flags when the request returns to `command` without an exit.

### M5. A refused start leaves a dead screen, and `error()` exits read as crashes (round-1 item 3)

**Severity:** medium. **Area:** lifecycle, failure handling.

**What's wrong**
- When `core.start()` returns an error, `App.start_game` only calls `push_error` (`main.gd:94-95`). The new `GameScreen` stays up with no game behind it, and nothing returns to the title.
- NetHack's `error()` path (`sys/share/unixtty.c:473-485`) exits with code 1, for example after declining "There is already a game in progress". `EndScreen` shows that as "crashed" (`ui/end_screen.gd:38`), and the message went to Godot's stdout, where the player never sees it.

**Fix**
- On a start error, free the game screen, return to the title and show an error card with the reason.
- Capture `shim_raw_print` lines from before `bridge_start` (or `error()`'s text) and show them in the failure card.

### M6. Equipment helpers still missing (round-1 item 25)

**Severity:** medium. **Area:** parity (equipment).

**What's wrong**
- **No "Change armor".** Godot disables a candidate with "Take off your cloak first" (`ui/dialogs/equipment_screen.gd:230-252`). For an occupied helm or boots slot it sends `wearArmor` anyway, and NetHack refuses. Electron removes the blocking layers and then wears the new piece (`armorSwapRouteForItem`, `electron-poc/src/shared/inventory-action-service.js:293-322`).
- **No "Compare with equipped".** Grepping `compare` in `ui/dialogs/` finds nothing. Electron: `equipment-screen.js:929,966-973`, `item-presentation.js:224`.
- **Wrong two-handed check.** The shield is blocked only when the weapon text contains "two-handed" (`equipment_screen.gd:248`). That misses the quarterstaff, battle-axe, mattock and polearms, which NetHack marks "(weapon in hands)". There is no reverse check when wielding a two-hander with a shield on.

**Fix**
- Queue `takeOff` (outermost layer first) and then `wearArmor` as typed equipment changes, each waiting for `shim_equipment_change_confirmed`.
- Add a compare block to the inventory detail panel for the item in the same slot.
- Test "weapon in hands" in both directions.

### M7. The item picker has no search and no count (round-1 item 32)

**Severity:** medium. **Area:** dialogs, mouse and pad parity.

**What's wrong**
- `QuestionDialog._build_item_picker` (`ui/dialogs/question_dialog.gd:146-197`) lists rows with no filter field and no count.
- Keyboard players can type `3a`, but mouse and pad players can't throw, drop or quaff part of a stack from a prompt.
- Electron has a filter and count parsing (`electron-poc/src/renderer.js:4800-4805,4857-4875`).

**Fix:** add a search box at 10 or more rows, and a count stepper on stack rows. Send `<count><letter>`.

### M8. "Select all" in the drop-types menu drops everything in two clicks

**Severity:** medium. **Area:** UX safety.

**What's wrong**
- In `D`'s "Drop what type of items?" menu (`travel_and_transfer/02-drop-categories.png`), the footer's "Select all" (`ui/dialogs/menu_dialog.gd:179-182`, also `,`, `@` and `.`) selects `A` "Auto-select every relevant item" together with "All types".
- NetHack then drops every item with no second menu.
- tty can do the same with `,`, but there it isn't a big button beside "Confirm".

**Fix**
- Hide "Select all" in class-filter menus. Detect them by the menu purpose, or by rows having no `objectId`.
- Never auto-include the `A` row. Confirm when `A` plus "All types" is chosen.

### M9. Thrown objects are drawn twice, and beats can split across frames

**Severity:** medium (juice on the most common ranged action). **Area:** world rendering.

**What's wrong**
- `_play_animation` (`world/world_view.gd:397-428`) draws the in-flight sprite while the settled map, already showing the object where it landed, stays drawn.
  - In `animation_beats/01-dagger-in-flight.png` two daggers are on screen: one in flight and one already at the far wall.
  - A monster killed by the missile is likewise already gone before the missile reaches it.
- `drain()` ends a batch at every frame, not at an input wait. A burst that straddles two frames plays a partial timeline, then applies the rest with no animation (`state/game_state.gd:232-241`).

**Fix**
- During replay, hold back the settled object layer, and any removal, for the cells the timeline touches until the replay ends or a key skips it.
- End a batch only at an input wait (`bridge_command_prompt`, `bridge_key_wait`, a prompt opening). Alternatively, emit a batch marker in extended mode.

### M10. The Rest count field takes over the keyboard

**Severity:** medium. **Area:** input, classic keys.

**What's wrong**
- The "20 turns" SpinBox's LineEdit takes focus on click (`ui/action_bar.gd:121`).
- Nothing releases it (no `release_focus` anywhere in `InputRouter` or `ActionBar`), and Godot keeps keyboard focus when the next click lands on the map, which is not a Control.
- Until a modal opens, the GUI eats typed keys before `_unhandled_input`: letters go into the field, and the up and down arrows change the count instead of moving the hero.

**Fix:** release focus on `text_submitted`, on focus-exit clicks and on any map click. Better: make the count a stepper with no text field (Enter or wheel to change) and `FOCUS_NONE`, like the other bar buttons.

### M11. Status-chip tooltips give strategy spoilers

**Severity:** medium (BIBLE: "the UI shows only what the player character knows"; Greg's call). **Area:** no-spoiler policy.

**What's wrong**
- `Hud.CONDITION_HELP` (`ui/hud.gd:282-293`) tells the player cures the character has no reason to know:
  - "eat a lizard corpse or acidic food" for stoning
  - "burn it off (fire)" for sliming
  - "unicorn horn" for illness
- Electron shows no such advice: grepping "lizard" or "unicorn horn" in `electron-poc/src/ux` finds only item-name patterns.

**Fix:** keep the description of what the condition does ("Deadly: you are turning to stone"), and drop the remedies. Or put them behind an opt-in "hints" setting.

### M12. Context actions type their direction ahead

**Severity:** medium. **Area:** bridge protocol use (gotcha 1, "never type ahead").

**What's wrong**
- These actions send the command and its direction in one burst (`input/cell_actions.gd:93,98,104,109,110,114`):
  - Chat: `"#chat\n" + dir`
  - Kick: `char(4) + dir`
  - Unlock: `"a" + letter + dir`
  - Disarm trap: `"#untrap\n" + dir`
- When NetHack refuses before asking for the direction, the direction becomes the next command:
  - `dochat` refuses while strangled, when mute while polymorphed, or underwater.
  - `dokick` refuses with wounded legs. NetHack itself tries to swallow that typed-ahead key with a blocking `--More--`, which the shim doesn't have (gotcha 6).
- The hero then steps (or attacks) toward a peaceful creature, a shopkeeper or a door.
- Electron is no better (a 60 ms timer, `electron-poc/src/renderer.js:2819-2822`). Godot already has the right tool: `InputRouter.send_then`.

**Fix:** send the command alone, and send the direction only when the next request is `direction`. Drop it otherwise.

### M13. Kicking is offered only on doors

**Severity:** medium (parity). **Area:** cell actions.

**What's wrong**
- The neighbour branch of `input/cell_actions.gd:89-117` covers creatures, doors, traps and stepping.
- Electron also offers "Kick sink" (`electron-poc/src/shared/interaction-model.js:562`), kicking an adjacent container (`:596`), and kicking a boulder or statue (`inventory-action-service.js:197`).

**Fix:** offer `char(4) + dir` (via the M12 sequencing) for adjacent sinks, containers and boulders.

### M14. NetHack changes Godot's umask

**Severity:** medium. **Area:** process containment.

**What's wrong**
- `sys/libnh/libnhmain.c:86` calls `umask(0777 & ~FCMASK)`, which is 0117. That applies to the whole Godot process. `nhcore.c` never saves or restores it.
- Every directory Godot creates after the first game start is mode 0660, with no x bit for the owner, so nothing can be created inside it. Examples:
  - `user://diagnostics` the first time it is made on a later start (`nethack_session.gd:236`)
  - Godot's own lazily created cache directories
  - export-time playground subdirectories
- Files also gain group write.

**Fix:** wrap `umask` (`-Wl,--wrap=umask`) with a no-op that returns the current mask, or save it in `nhcore_run` and restore it in `nhcore_finish`.

### M15. The bridge writes events unbuffered, one syscall per character

**Severity:** medium (performance). **Area:** C core.

**What's wrong**
- `nh-shim-bridge.c:4130` sets `_IONBF` on the output stream, and `json_escape` (`:583`) writes with `fputc`.
- In process that is one `write()` per character: hundreds of thousands per full-level redraw. The 128-event deferred flush has nothing to defer.

**Fix:** in `nhcore.c`, before including the bridge, redefine `setvbuf` to a 64 KB full buffer. `emit_event_end` already flushes non-glyph events, and every input wait is preceded by a flush. Electron's stream stays byte-identical.

### M16. Controller play still has no hints and no text entry (round-1 item 11)

**Severity:** medium. **Area:** gamepad.

**What's wrong**
- Every hint is keyboard text:
  - "Click toward it, or press hykulnjb / arrows" (`ui/dialog_host.gd:149`)
  - "Press any key to continue." (`:161`)
  - "Right-click: …" on the inspector card
  - "Esc" on every button
- `LineDialog` (wishes, engraving, naming, `#call`) has no on-screen keyboard or suggestion list, so a pad player can only cancel. A cancelled wish is lost.
- The `GamepadRouter` header comment still says "right trigger looks around". The code makes RT a run modifier and right-stick click the look command (`input/gamepad_router.gd:3-8,38-39,59`).

**Fix**
- Add one `InputGlyphs.hint(action)` helper that switches on `GamepadRouter.active`, and use it for banners, footers and the inspector.
- Give `LineDialog` a pad path: a suggestion list (Elbereth, recent names, common wishes) plus a simple on-screen keyboard.

### M17. Opening a container can wait forever and shows raw bridge reasons

**Severity:** medium. **Area:** containers.

**What's wrong**
- `DialogHost.open_container` loops on `direct_result` with no timeout (`ui/dialog_host.gd:313-317`). Some bridge rejections carry no `sessionId`, so they never match, and the player sees nothing happen. Electron gives up after 12 s (`electron-poc/src/renderer.js:8846`).
- After a rejection it awaits *any* `request_changed`, then calls `send_command("#loot\n")`. If that change was to a prompt, the player gets "Finish the current prompt first." and no loot (`:321-325`).
- Refusals are shown verbatim (`ui/dialogs/container_screen.gd:183-186`), for example "container contents have not been legitimately observed". Electron rewrites them as plain sentences (`renderer.js:8829-8839`).

**Fix**
- Add a timer, then fall back to `#loot`.
- Wait specifically for the next `command` request.
- Map refusal kinds to player sentences.

---

## Low

### L1. The seed shown after Continue is meaningless

**Area:** run info.
- A restored game reports a fresh `bridge_seed` with `source:"system"` (`run_lifecycle/events.jsonl`).
- `GameState` stores it (`state/game_state.gd:125-126`), so the end screen says "Dungeon seed 14278663310430819004" (`run_lifecycle/08-quit-end.png`), and the pause menu offers "Copy seed (share this dungeon)" (`ui/dialogs/game_menu.gd:21-28`). Neither reproduces the dungeon; the run was seeded with 4242.
- **Fix:** keep the seed from the original start in the save catalog, or hide the seed for restored runs.

### L2. Farlook results go into the log with NetHack's glyph prefix

**Area:** messages.
- `_set_request` logs the buffered getpos lines raw (`state/game_state.gd:262-265`). The feed and history show "f      a cat or other feline (tame kitten)" (`look_and_minimap/03-look-result.png`).
- **Fix:** apply `DialogHost._strip_symbol` before `_log`.

### L3. South-east moves and attacks with `n` are never recorded

**Area:** feedback.
- `_note_direction` strips the characters `n`, `F`, `G`, `g`, `m` and the digits from the front (`game_screen.gd:88`). In vi-keys mode the move `n` itself is stripped, so `last_direction` never becomes SE, and lunge and target matching fall back to name guessing.
- **Fix:** strip `n` only under number_pad.

### L4. Lock follow-ups are offered for every adjacent closed door

**Area:** action bar.
- On "This door is locked", `ActionBar._on_message` adds unlock and kick for every neighbouring closed door (`ui/action_bar.gd:144-150`), not the one the hero bumped.
- **Fix:** use `state.last_direction` to pick the door.

### L5. The level banner covers map art on every arrival

**Area:** HUD.
- The banner is fixed at y = 236 (`ui/hud.gd:216`), over the top of the play area. It covers shop stock (`shopping/01-in-the-shop.png`), walls and objects (`combat_feedback/01-fight-0.png`, `world_first_look/02-after-walk.png`, `descent/02-dig-direction.png`).
- **Fix:** draw it in a top band with a dark backing, or fade the map behind it.

### L6. Missing small item actions (parity)

**Area:** items.
- Electron offers:
  - "Look up" (`/i` + letter, `electron-poc/src/shared/inventory-action-service.js:171`)
  - engraving with weapons, tools, gems and rings (`:157`)
  - "Pick up, then wield/wear" for ground items (`:198-200`)
- Godot offers engraving only for wands (`input/item_actions.gd:68`), and its pile card only sends `,`.
- **Fix:** add these to `ItemActions.for_item` and to `PilePeek`.

### L7. Settings gaps

**Area:** settings.
- `Settings.reset_to_defaults` skips `detailed_status` and `keep_diagnostics` (`settings.gd:80-84`).
- Electron has separate switches for interface and game sounds, both off by default (`electron-poc/src/ux/settings-store.js:22`). Godot has one volume slider.
- The diagnostics log omits the NetHack options the game started with (`nethack_session.gd:232-240`; Electron: `src/main/diagnostic-log.js:241`).
- **Fix:** reset every field, split the two sound switches, and log the options.

### L8. Every scenario leaks two objects at exit

**Area:** tests.
- All 15 `godot.log` files end with "WARNING: 2 ObjectDB instances were leaked at exit". `tests/run.sh:54` fails only on `SCRIPT ERROR` or `ERROR:`.
- Likely cause: static caches (`UiTheme._theme`, the fonts, `TileResolver.shared()`).
- **Fix:** clear the statics in an `App` exit hook, and fail the run on leak warnings so new leaks show up.

### L9. Two spoiler and staleness gaps in the extended bridge

**Area:** bridge.
- While hallucinating, worm tails are drawn as random monsters, but `actorRole:"tail"` still says "long worm" (`nh-shim-bridge.c:3328-3330`).
- `bridge_vision` is emitted only at `shim_nhgetch` and `shim_nh_poskey` (`:3553,3573`), so in-sight shading is stale during yes/no, menu and `--More--` waits (for example after "You are blinded by the flash!").
- **Fix:** omit `actorRole` (and `actorId` for tails) while `Hallucination`. Emit vision before the other blocking pops.

### L10. Small core robustness gaps

**Area:** C core, extension.
- **`start()` delivers stale events.** It drains the previous game's events and `game_ended` synchronously, after `App.start_game` has built the new screen (`extension/src/nethack_core.cpp:118`). Stale events reach the new state, and `game_ended` would retire the new screen. Not reachable from today's UI, but fragile.
- **Unwind can corrupt a line.** An unwind while a JSON line is half-written appends `bridge_exit` to it (`extension/core/nhcore.c:207-216`). Write `"\n"` first.
- **A failed `fdopen` hangs the reader.** `nhcore.c:189-194` never closes the raw fds, so the reader never sees EOF.
- **cwd is not restored.** After a fixture game, the working directory stays at `NH_GODOT_WORKDIR` (`nethack_core.cpp:131-138`).
- **Long key lines vanish.** "key" lines over 4 KB are dropped with no event (`nh-shim-bridge.c:2132-2138`).
- **Fix:** handle each as described.

### L11. Environment, seed and data hygiene

**Area:** lifecycle.
- **Developer env leaks into games.** `PER_GAME_ENV` misses `NH_SHIM_NO_CHDIR`, `NH_SHIM_RESET_LOCKS` and `NH_BRIDGE_PROTOCOL_CONTRACT` (`nh-shim-bridge.c:4198,4219,4241`). Unset by prefix instead.
- **Seeds parse surprisingly.**
  - `normalize_seed` passes "0123" through, and `strtoul(…,0)` reads it as octal. "089" is invalid, and the game silently gets a random seed (`bridge_seed_invalid` is ignored). "-5" wraps around.
  - Strip leading zeros and reject negatives (`main.gd:78`).
- **Exported data never refreshes.** The playground copy in `user://` is refreshed only when `nhdat` is missing (`nethack_session.gd:36`), so an app update keeps old data files. Version-stamp the copy.
- **A panic can stall Godot.** The playground sysconf turns on `PANICTRACE_GDB`, so a panic can attach `gdb` to Godot's pid for several seconds. Disable it for the in-process core.

### L12. Docs and stale comments

**Area:** docs.
- `docs/bridge-protocol.md:214-219` (bridge_exit "Godot core: always") contradicts the code, and `bridge_start_failed` is not documented (round-1 item 46).
- `extension/core/nhcore.h:15` still says finish "restores signal handlers".
- The fixture-only `vision_full_recalc` change in `src/allmain.c:3282,4172` is not gated on extended mode, so Electron's fixture runs now emit a different stream. Re-run Electron's fixture suites and note it in the decision log.

---

## Already better than Electron (keep these)

- Round 1's list still holds: partial stack counts, every classic Ctrl and Meta key, NetHack's own map-click handling, no-spoiler door handling, and end-of-game disclosures answered without Esc.
- The container screen moves single items, shows a live "Moving…" state, and falls back silently to `#loot`. Partial stacks go through NetHack's menu.
- The pay dialog shows a running "Paying X of Y zm · you have Z zm" line with an overspend warning (`shopping/02-bill.png`).
- The shopkeeper action bar shows the bill ("Pay the shopkeeper (87 zm)"), and sell offers read "Sell / Don't sell / Sell all the rest / Stop selling".
- The direction prompt has a map compass plus Up, Here and Down chips (`spells_and_skills/03-cast-direction.png`).
- The message history has category filters, the opening lore, logged questions and "Copy shown" (`ui_panels/07-history.png`).
- The end screen has tabs (possessions, attributes, conduct, dungeon, full log) built from NetHack's own disclosures, plus a score from the xlogfile.
- The vision lighting leak from round 1 is closed: `waslit` is used for remembered cells, and the de-dup key includes branch and blindness.

---

## Status after the fix pass (2026-10-17)

**Fixed:** H1–H4, M1–M17, L1–L12, plus the round-1 items listed as not fully fixed (3, 5, 11, 13, 22, 25, 26, 32, 46, 10/36). Tested in `inventory_equipment` (alternate weapon with a weapon in hand, look it up), `ui_panels` (keyboard-only settings, palette danger and key leaks), `small_window` (text size), `safety` (save from a question), `animation_beats` (reduced motion), `containers` (locked chest fallback), `equipment_swaps` (new: swap under a cloak, two-handed blocking, single-item take-off without type-ahead), `travel_and_transfer` (picker counts), `gamepad_play` (pad text entry).

**Found while fixing:** inventory and equipment actions typed item letters ahead of questions NetHack sometimes skips (`T` with one worn item); every item command now answers only the question NetHack actually asks. Godot's `ui_accept` had no pad button, so A never pressed dialog buttons.

**Left, with reasons:**
- M4's "hangup save" bridge input was not needed: Godot answers open questions safely and then saves.
- L6 "pick up, then wield/wear" for ground items: picking up runs NetHack's own menus; a combined action would type ahead into them.
- L11 `PANICTRACE_GDB`: the playground's sysconf is shared with Electron; it only matters after a NetHack panic.

**Electron fixture check (L12):** with the fixture-flavoured Electron shim built from the current bridge, `scenario-loader-contract-test` passes. `direct-ground-transfer-shim-test`, `direct-container-snapshot-locked-shim-test`, `direct-equipment-change-shim-test` and `direct-terrain-action-shim-test` fail the same way on the committed bridge (`git show HEAD:…`). The ground-transfer test kills the bridge as soon as an event's name appears, so it fails on a different assertion each run (a race in the test). None of these failures comes from the Godot changes. Electron's normal shim was rebuilt afterwards.
