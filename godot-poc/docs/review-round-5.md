# Godot front end review, round 5

Date: 2026-10-17. Scope: everything in `godot-poc/` after the round-4 fix pass, plus the fixture-loader lines in `src/allmain.c` and the two new fixtures (`electron-poc/test/scenarios/status/life-saving-lava.json`, `object/wand-of-wishing.json`).

The lenses are the same as round 4:
1. Functional parity with Electron (`electron-poc/src/ux`, `src/shared`, `src/renderer.js`).
2. UX quality, from the UI code and the screenshots of the full run that finished at 19:22 (20 scenarios, all PASS, no errors in any `godot.log`). Every source file is older than that run, so the screenshots show the current code.
3. Architecture and correctness. This round looks hardest at the round-4 changes.

**How the findings were checked**
- Read-only review. Nothing was built or run.
- Every finding was checked against the code. UX findings were also checked against the screenshots named in them.
- Engine claims were checked in NetHack's source in this repository: `include/rm.h` (door masks), `src/lock.c` (`doforce`, the locked-door message), `src/dig.c` (the dig direction list), `src/zap.c` (`makewish`), `src/objnam.c` (`readobjnam`).
- Godot API claims were checked in `.tools/godot-cpp/gdextension/extension_api.json`, and in the strings of the Linux Godot 4.7.2 binary in `.tools/`.
- The Electron parity sweep listed Electron's user-facing features and searched `game/` for each one. Only gaps confirmed by several searches are reported.
- Paths are relative to `godot-poc/project/` unless they start with `electron-poc/`, `src/`, `include/` or `docs/`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 2 high, 4 medium, 9 low (15 in total).

The two most serious problems:
- The message feed's invisible 760×230 hit box swallows map clicks and the mouse wheel. Its own click does nothing (H1).
- On a first run under Linux, Reduced motion is switched on, which turns off the game's animation (H2).

---

## Round-4 verification

- **M1 (sequence type-ahead): partly fixed.**
  - Done: player keys, map clicks, pad input and a save call `cancel_automation()` (`input/input_router.gd:85,196`, `input/gamepad_router.gd:60,98`, `game/game_screen.gd:148`). The armour runner answers only item questions (`input_router.gd:386-393`).
  - Not done: the prompt still isn't marked as used when Godot sends to it (L1). Follow-ups still run inside the prompt event. `save_failed` still drops a close without a word (`main.gd:104`). The status says a queued panel is cancelled; `_open_when_ready` isn't (L1).
  - New problem: the cancel now also fires on input that does nothing, and it is silent (M1).
- **M2 (pad reaches neighbour and lock actions): fixed.** `ui/dialogs/command_palette.gd:68-70`; `locked_door/02-palette-lock-actions.png`. Small leftovers are in L3.
- **M3 (text window search): fixed.** `ui/dialogs/text_window_dialog.gd:28-36,71-118`. `ui_panels/10-character-sheet-search.png` shows the match highlighted.
- **M4 (drag and drop): partly fixed.**
  - Containers are fixed: `ui/dialogs/container_screen.gd:141,169-188`, and `containers/05-dragging-scroll.png` shows the target pane lit.
  - Equipment drags work only from the list of the slot already open (L5).
  - Electron's ground panel, named in M4, still has no Godot counterpart (M3).
- **L1 (palette flash for `#` commands): fixed.** `input_router.gd:478-495`. `containers.gd` counts CommandPalette nodes during the `#loot` fallback.
- **L2 (multi-pick menus): fixed as described.** Space toggles the arrowed row (`ui/dialogs/menu_dialog.gd:242-252`, `travel_and_transfer/05-pickup-keyboard.png`). A related keyboard trap remains (L2).
- **L3 (context menu keys): fixed.** `ui/dialogs/context_menu.gd:81-85`. `look_and_minimap.gd` asserts Down and Enter.
- **L4 (close while dying, then life-saved): fixed.** `state/game_state.gd:240-245`, `main.gd:105-108`, and the `life_saving` scenario.
- **L5 (modifier keys dismiss text): fixed.** `text_window_dialog.gd:151-153`. `ui_panels.gd` asserts Shift.
- **L6 (listed directions only): fixed.** `game_state.gd:429-445`, `world/world_view.gd:548-551`, `ui/dialog_host.gd:180`, `descent/03-dig-refused-click.png`. The banner hint still lists all eight keys (L4).
- **L7 (pad labels on the bar): fixed.** `ui/action_bar.gd:66-81`, `gamepad_play/03-pad-safe-stairs.png`.
- **L8 (long samurai sword): fixed.** `ui/dialogs/equipment_screen.gd:444`.
- **L9 (missing scenarios): mostly fixed.** All six passes exist. Some drive internals where the feature lives (L9).
- **L10 (feed scrollback): fixed** (`ui/message_feed.gd:54-58`, `descent/08-feed-scrolled-back.png`). The feed's hit box is a new problem (H1).
- **L11 (settings gaps):**
  - Fixed: Locked-door suggestions, Minimap size (`ui/mini_map.gd:34-43`, `ui/hud.gd:238-239`), the ground on the hero card (`locked_door/04-hero-card-ground.png`), and the notice when saving fails (`ui/dialogs/settings_screen.gd:149-151`).
  - Following the OS reduced-motion setting is wrong when the OS gives no answer (H2).
  - The settings-read error is never shown (L6).
- **Found along the way:** all hold.
  - The DialogHost guard: `dialog_host.gd:50-55,129,133`.
  - Fixture doors. `D_LOCKED` alone is right: `include/rm.h:236-237`. `src/lock.c:859-875` reports any door without `D_CLOSED`, open, broken or no-door as locked.
  - The new fixture object types (`src/allmain.c` diff).
  - Lock follow-ups come first on the bar: `action_bar.gd:207-216`, `locked_door/01-locked-door-actions.png`.
  - The wish-close wording: a blank wish reaches `readobjnam`'s random-object path (`src/zap.c:6359-6380`, `src/objnam.c:4943-4958`).

---

## High

### H1. The message feed's empty rectangle eats map clicks and the wheel, and its own click does nothing

**Area:** mouse play, HUD (round-4 L10 follow-up).

- The feed is a fixed 760×230 `VBoxContainer` at the bottom left (`ui/message_feed.gd:19-26`), with `MOUSE_FILTER_PASS` (`:28`). Godot hit-tests a control by its whole rectangle, not by the lines inside it. That includes the empty space above the newest few lines.
- `_gui_input` accepts every left click and every wheel step in that rectangle (`:33-45`). Map clicks and zoom live in `InputRouter._unhandled_input` (`input/input_router.gd:20-28,176-190`), so they never see these events.
- The map runs under that rectangle whenever the level extends to the lower left of the hero. In `descent/08-feed-scrolled-back.png`, the left room's bottom row sits inside it (y 758-790).
- What the player gets:
  - Click-to-move and click-to-travel do nothing on those cells, with no feedback.
  - The wheel there scrolls the feed instead of zooming, even when only two message lines are showing (`locked_door/03-unlock-question.png`).
  - Hovering those map cells pops the feed's tooltip, "Click: the full history (F2)" (`:30`).
- The click the tooltip promises is dead. `history_requested` is emitted (`:38`), but nothing in the project connects to it (a search for `history_requested` finds only those two lines). So the click is swallowed and nothing opens.
- **Fix:**
  - In `_gui_input`, accept only events whose position falls inside a shown line (`_lines` and `_back_hint` global rects). Let everything else pass, so the router gets it.
  - Connect `feed.history_requested` to `input_router.open_ui("history")` in `Hud.setup`.
  - Test, in `descent` or `look_and_minimap`: click a known map cell under the feed's empty top area and assert travel starts. Click a feed line and assert `HistoryPanel` opens.

### H2. On a first run under Linux, Reduced motion is switched on

**Area:** settings, first impression (round-4 L11).

- `Settings.load_or_default` seeds Reduced motion with `bool(DisplayServer.accessibility_should_reduce_animation())` (`game/settings.gd:42-43`).
- That method returns an int, not a bool (`extension_api.json`, `accessibility_should_reduce_animation`, `"type": "int"`). Godot documents 1 for yes, 0 for no and -1 for unknown. In GDScript `bool(-1)` is `true`.
- The Linux Godot 4.7.2 binary has the desktop-portal keys for `color-scheme` and `high-contrast`, but none for reduced motion (`strings .tools/godot` found no `enable-animations` or `reduce-motion`). So on Linux the answer is -1, and every fresh profile starts with Reduced motion on.
- That turns off the actor tweens, lunges, level fade and shake (`Motion.enabled()`, `ui/motion.gd:6-7`). On Greg's own platform, the first game a new player sees has none of the juice the bible asks for.
- Nobody has seen this yet because `user://settings.cfg` already exists on this machine, and the scenarios use it (see L9).
- **Fix:**
  - Use `DisplayServer.call("accessibility_should_reduce_animation") == 1`.
  - Run one scenario with a fresh user directory (see L9) and assert `Motion.enabled()` on Linux.

---

## Medium

### M1. Running automation is cut short by input that does nothing, and the player isn't told

**Area:** input engine (round-4 M1 follow-up).

- `click_cell` calls `cancel_automation()` before it checks anything (`input_router.gd:196`). A click ends the run even when it sends nothing:
  - while NetHack is busy (no branch matches `"busy"`, `:200`)
  - on the hero (`:202-203`)
  - on unexplored rock (`:204-205`)
- The pad cancels on every button (`gamepad_router.gd:60`), including X (pack), Y (palette), Start (menu), Back (map) and the bumpers (zoom), none of which act in the world. The keyboard equivalents (`i` while busy, Tab, F1, F2, Ctrl +/-, Esc) return before the cancel (`input_router.gd:40-64,75-83`), so the two input styles behave differently.
- `cancel_automation()` says nothing (`:405-411`). The round-4 fix asked for a word in the feed.
- Failure case:
  - A mouse player clicks "Wear" on plate mail while wearing a cloak, a four-step chain (`ui/dialogs/equipment_screen.gd:420-437`).
  - While the cloak and the old armour come off over several turns, the player clicks a far spot to travel next. The click sends nothing, because NetHack is busy, but it ends the chain.
  - The cloak stays off, the plate mail stays in the pack, and nothing says why.
  - A pad player gets the same by pressing X to look at the pack while waiting.
- **Fix:**
  - Cancel only where something is actually sent: inside the branches of `click_cell` that send, in `_handle_key` after the early returns (already true), and in the pad's movement and A, B and right-stick branches only.
  - When a cancel cuts a run short, flash "Stopped: <what was running>", for example "Stopped changing armour: your cloak is off."
  - Test, in `equipment_swaps`: during a four-step swap, click the hero (or press pad X) and assert the swap still finishes.

### M2. "Reset to defaults" leaves a Settings card the game doesn't know about

**Area:** dialogs, input safety.

- `SettingsScreen._reset` adds a fresh `SettingsScreen` to the parent and `queue_free`s itself, without `close()` (`ui/dialogs/settings_screen.gd:132-141`).
- `DialogHost.active` still points at the freed card, so `owns_input()` becomes false (`ui/dialog_host.gd:54-55`). The new card is never connected to `_on_dialog_closed`.
- What the player gets with the new card on screen:
  - Arrow keys and `hjkl` walk the hero behind it (`InputRouter._unhandled_input` no longer stops at `owns_input`, `input_router.gd:20-22`). The pad's stick and D-pad do the same.
  - Esc opens the pause menu on top of the Settings card instead of closing it (`input_router.gd:61-64`).
  - Any letter runs as a NetHack command.
- The reset also doesn't apply what it reset:
  - the interface size: `App.apply_ui_scale()` isn't called (`main.gd:132-138`)
  - the volume: `AudioServer` is set only by the slider, `settings_screen.gd:48-50`, and at start-up, `main.gd:27`
  - the zoom: `world.set_zoom_index`
  - After resetting from 150% the card says 100%, but the UI stays at 150% until the window is resized.
- **Fix:**
  - Rebuild the card in place (clear `body` and `footer` and run `setup` again), or close and reopen through `screen.dialogs.open_panel("settings")`.
  - After a reset, call `App.instance.apply_ui_scale()`, set the bus volume and apply the default zoom.
  - Test, in `ui_panels`: press Reset with the keyboard, press Down, and assert the hero didn't move and the card has focus.

### M3. There is no floor-and-pack screen

**Area:** parity (ground items; round-4 M4 named the ground panel too).

- In Electron, the mouse's "Pick up" opens a two-pane panel, "Ground items" next to "Your inventory" (`electron-poc/src/renderer.js:4136-4173,6597-6614`; opened from the map's pickup action, `:2251-2254,2798-2799`). It offers:
  - "Pick up all (N)"
  - letter toggles
  - drag in both directions, so pack rows can be dropped onto the floor
- Godot's "Pick up" sends `,` and shows NetHack's pickup menu as a list (`input/cell_actions.gd:49-50`, `ui/pile_peek.gd:46-50`, `travel_and_transfer/04-pickup-screen.png`). Dropping is a separate `D` menu.
- The bridge already has the typed command: `ground-transfer`, one object either way (`docs/bridge-protocol.md:1242-1245`). `NetHackSession` has no sender for it (`game/nethack_session.gd:151-286`), and nothing builds a floor pane.
- Godot already has the right screen for this: `ContainerScreen` is the same two-pane design, with drag and lit drop targets.
- **Fix:**
  - Add `NetHackSession.send_ground_transfer(direction, item_id, coord)`.
  - Give `ContainerScreen` a ground source: the left pane from `state.map.pile(hero)`, moves by `ground-transfer`, refresh on `pile_changed`.
  - Open it from the bar's "Pick up" when the pile is known. Keep `,` as NetHack's own menu for keyboard players.
  - Test, in `travel_and_transfer`: drag a pack row onto the floor pane, then "Pick up all".

### M4. The title screen shows crash checkpoints as identical rows

**Area:** UX, first screen.

- `run_lifecycle/01-title.png` shows four "Recover crashed game · The last run ended unexpectedly" buttons, one under the other. The fourth has the focus ring, and "New adventure" is pushed down to fifth place.
- Each checkpoint becomes its own row with the same text (`ui/title_screen.gd:83-84`):
  - Every row is marked primary when there are no saves, so each one grabs focus in turn.
  - `SaveCatalog.checkpoints()` computes `modified` and never uses it (`game/save_catalog.gd:150-164`).
  - There is no way to discard a checkpoint the player doesn't want.
- The player can't tell which hero, which level or which day each row is.
- Electron shows one candidate, "Recover and continue", with a description (`electron-poc/src/renderer.js:8211-8229`).
- These four came from today's development runs. `playground/` holds `alock`, `block`, `clock` and `dlock` sets from 17:43 to 18:59, with identical sizes (see L9).
- **Fix:**
  - Read the hero's name from the `.0` file, where NetHack's `recover` finds it, using the latin-1 scan that `_character_in` already does for saves.
  - Show "Recover Brunhild · today 18:59", newest first.
  - Put older checkpoints under one "Other crashed runs (3)" entry with Recover and Discard.

---

## Low

### L1. A prompt still counts as open after Godot has sent to it

**Area:** input engine (round-4 M1, first fix bullet).

- `GameScreen.send_keys` doesn't touch `state.request` (`game/game_screen.gd:81-85`). The request goes busy only when the bridge's answer event arrives in a later drain (`state/game_state.gd:229-231`).
- Until then, `send_command` and `is_waiting_for_command()` still say yes (`input_router.gd:280-285`). If the router sends a chain's `W` and the player clicks the bar's "Search" in that frame window, the `s` becomes the answer to "What do you want to wear?".
- `_open_when_ready` isn't cleared by `cancel_automation()` (`:405-411`). If the player presses `i` while NetHack is busy and then `d`, the inventory panel pops open at the command prompt that follows the drop.
- **Fix:**
  - In `send_keys` and `send_map_click`, set `state.request = {"kind": "busy"}` without emitting when it was `"command"`.
  - Clear `_open_when_ready` in `cancel_automation()`.

### L2. In pick-several menus, Enter on a focused button confirms the menu

**Area:** keyboard UX.

- In a PICK_ANY menu, Enter, or Space after arrowing, runs `_confirm()` unless the focus is on a row (`ui/dialogs/menu_dialog.gd:248-267`). The footer buttons take focus (`ui/dialogs/modal_card.gd:80`).
- If the player arrows down to "Cancel  Esc" and presses Enter, the selected items are picked up. "Clear" and "Select all" do the same.
- **Fix:** when the focus is a footer `Button`, return `false` so the button presses itself. Keep "Enter confirms" for focus on a row or on nothing.

### L3. Small lock follow-up flaws

**Area:** action bar, palette.

- **The palette's Enter runs "Open door".** It keeps listing "Open door" beside the lock actions, and as Enter's default row (`ui/dialogs/command_palette.gd:68-75`, `locked_door/02-palette-lock-actions.png`). The bar hides it (`ui/action_bar.gd:214-216`).
- **Wrong key hints.** The palette's key column shows raw keystrokes, and control characters disappear: "Kick it open" shows `l`, which walks into the door, and "Unlock with lock pick" shows `afl` (same screenshot).
- **Force without a weapon.** "Force the lock" is offered even when nothing is wielded (`action_bar.gd:197`). NetHack then says "You can't force anything when not wielding a weapon." (`src/lock.c:695-704`).
- **Restored history re-arms the bar.** `_on_message` doesn't skip restored history lines (`action_bar.gd:163`; restored lines carry `history`, `state/game_state.gd:177-179,393-398`). Continuing a save whose history holds "it turns out to be locked" puts "Force the lock" on the bar.
- **Fix:**
  - Hide "Open door" in the palette while lock actions exist.
  - Show keys the way `CommandCatalog` does (`^D l`), or the command key only.
  - Offer Force only with a wielded weapon.
  - Skip `entry.history` in `_on_message`.

### L4. The direction banner still says "press hykulnjb" when only one direction works

**Area:** UX (round-4 L6 follow-up).
- `descent/02-dig-direction.png` reads "In what direction do you want to dig? [>]  Click toward it, or press hykulnjb / arrows". Only `>` works.
- The hint is built from all eight keys (`ui/dialog_host.gd:174-178`). The chevrons and chips already follow NetHack's list.
- **Fix:** when `offered_directions` isn't empty, say "Press > (or the Down chip)". Name the listed directions in words otherwise, as `_direction_words` already does.

### L5. Equipment drag works only from the list of the slot already open

**Area:** parity (round-4 M4).
- The only drag sources are the candidate rows of the selected slot (`ui/dialogs/equipment_screen.gd:270-279`). The screen has no pack list (`equipment_swaps/05-dragging-to-quiver.png`).
- To drag a ring to a ring slot, the player must first click a ring slot, and by then a click on the ring is quicker.
- Electron's equipment screen lists the whole pack beside the doll, with every row draggable. A drop on the hero picks the best slot (`electron-poc/src/ux/equipment-screen.js:1019,1031,1094-1116,634-652`).
- **Fix:** add a compact pack strip of everything wearable or wieldable as a drag source. Make the portrait a drop target that uses `ArmorSlots.slot_for`, or the main hand for weapons.

### L6. Settings leftovers

**Area:** settings.

- **Read errors are never shown.** `Settings.load_error` is set (`game/settings.gd:44-45`), and the comment says the title screen shows it (`:28-29`). Nothing reads it.
- **"Show keys on buttons" doesn't update the bar.** The fixed buttons are relabelled only when the pad mode flips (`ui/action_bar.gd:74-81`, connected at `game/game_screen.gd:60`).
- **No "everything" autopickup.** Electron's "All eligible items" sends `autopickup` with no `pickup_types` (`electron-poc/src/renderer.js:1819`). Godot's "Useful items" is fixed to `$?!/="+` (`settings.gd:101-103`).
- **Fix:**
  - Show `load_error` in the title's status line.
  - Connect `settings.changed` to `action_bar.relabel`.
  - Add an "Everything" choice.

### L7. The container screen ignores item letters

**Area:** classic keys, parity.
- `ContainerScreen.handle_key` handles only Esc and Enter (`ui/dialogs/container_screen.gd:260-271`), yet the pack pane shows each item's letter (`containers/05-dragging-scroll.png`: g, h, i). Typing `g` does nothing.
- Electron toggles the row with that letter in the focused pane (`electron-poc/src/renderer.js:6523-6543`).
- **Fix:** toggle the row whose selector matches the typed letter, in the pane holding focus (the pack pane by default).

### L8. No fullscreen and no minimum window size

**Area:** parity, game feel.
- `project.godot` sets no window mode or minimum size. Nothing in `game/` toggles fullscreen (no `window_set_mode`, no F11).
- Electron keeps its default menu (View > Toggle Full Screen, F11) and enforces a 960×720 minimum (`electron-poc/src/main.js:56`, `src/main/window-policy.js:1`).
- **Fix:** add F11, which NetHack doesn't use, and a "Fullscreen" switch in Settings > Display. Set `display/window/size/min_*` to 1280×720, the size `small_window` checks.

### L9. Test gaps: internals at key points, and the player's real data

**Area:** testing doctrine.

- **Internals where the feature lives.** New scenarios skip the real input exactly where the fix is:
  - `wish_close` zaps with `send_item_command` (`tests/scenarios/wish_close.gd:24`), closes with `app.request_quit()` rather than `NOTIFICATION_WM_CLOSE_REQUEST` (`:33,46`), and confirms with `go.pressed.emit()` (`:55`).
  - `locked_door` opens the palette with `open_ui` and never runs a lock action from it, though round-4 M2 was about pad players (`locked_door.gd:29-35`). "Kick it open" is never run. The hero card is expanded by calling `_on_card_hover(true)` (`:77`) instead of hovering it.
  - `equipment_swaps` checks the blocked main hand by calling `_can_drop` (`equipment_swaps.gd:71`) rather than dropping on it.
- **The player's real data.** Scenarios use the player's real `user://settings.cfg` (`game/settings.gd:6`) and the repository's shared `playground/` (`game/nethack_session.gd:31-35`):
  - Runs that crashed left the four checkpoints now on the real title screen (M4). Round 4 mentions the wish-close test crashing DialogHost.
  - Test quits and deaths go into the real `xlogfile`: its timestamp, 19:20:48, matches `run_lifecycle/08-quit-end.png`.
  - `small_window` closing Settings with Esc rewrote the player's `settings.cfg` (modified at 19:21:26, during that scenario).
- **Fix:**
  - In `tests/run.sh`, give each scenario a temporary `XDG_DATA_HOME`, which moves `user://` on Linux, and a temporary playground copy, through an override that `_resolve_playground` honours.
  - Drive the pad through the palette in `locked_door` and kick the door open.
  - Send the close notification in `wish_close`.

---

## Already better than Electron (keep these)

- Rounds 1 to 4's lists still hold.
- Text windows search in place, with the match highlighted and Enter or F3 to jump (`ui_panels/10-character-sheet-search.png`). Electron's filter hides the surrounding lines.
- Dig prompts point only where NetHack says digging works, and a click elsewhere is refused in plain words instead of wasting a turn (`descent/03-dig-refused-click.png`).
- Closing the window mid-wish asks first. A close made while dying survives life saving and then saves.
- Container drag carries the whole selection and lights the pane that will receive it (`containers/05-dragging-scroll.png`).
- The hero card names what the hero stands on in NetHack's own words: "On staircase up out of the dungeon" (`locked_door/04-hero-card-ground.png`).
- The fixture loader's locked doors now match NetHack (`D_LOCKED` alone), so Electron's door tests become meaningful once it is rebuilt.

---

## Status after the fix pass (2026-10-17)

**Fixed:**
- **H1:** the message feed hit-tests only its lines (`_has_point`). Clicks, the wheel and hovers over its empty box reach the map, and a click on a line opens the history (`history_requested` is now connected). `descent` checks both: the wheel over the empty top zooms the map, and a line click opens `HistoryPanel`.
- **H2:** reduced motion is seeded from the OS only when it answers 1 (yes). Every scenario now runs as a first run (see L9), and `world_first_look` asserts that animations are on.
- **M1:** automation is cancelled only by input that reaches NetHack: a click that sends, keys, and the pad's D-pad, A, B and R3. Pack, palette, menu, map and zoom buttons no longer cancel. A cancelled run says so in the feed. `equipment_swaps` clicks the hero mid-swap; the test fails with the old behaviour.
- **M2:** "Reset to defaults" rebuilds the card in place and re-applies interface size, fullscreen, volume, zoom, minimap and bar labels. `ui_panels` resets from the keyboard and checks that Down and `j` don't move the hero.
- **M3:** a floor-and-pack screen. It is `ContainerScreen` with a ground source, using the bridge's `ground-transfer` (`NetHackSession.send_ground_transfer`). The bar's and the pile peek's "Pick up" open it over a known pile without shop goods; `,` stays NetHack's own menu. It supports drag both ways, Pick up all and pack letters. The bridge sends no snapshot once the floor is empty, so a confirmed pickup also removes the stack locally. Covered in `travel_and_transfer`.
- **M4:** the title shows "Recover <hero>" with "Crashed · today 19:46", newest first, plus a "Crashed runs" card that lists each checkpoint with Recover and Discard (Discard asks first). New `crash_recovery` scenario: it copies a running game's lock set under a dead pid, then discards one checkpoint, recovers the other and continues on depth 2. Esc closes title cards, topmost first.
- **L1:** `GameState.answer_pending` marks the command prompt as taken as soon as Godot sends to it, until NetHack's answer event arrives. `cancel_automation` clears a queued inventory open.
- **L2:** Enter or Space on a focused footer button presses that button (`travel_and_transfer` presses Clear).
- **L3:** the palette lists lock actions first, hides "Open door" while they show, and shows readable keys (`^D`). "Force the lock" is offered only with a wielded weapon, and restored history lines never re-arm the bar.
- **L4:** the direction banner names only the offered directions ("Works toward down: press >").
- **L5:** the equipment screen has a pack strip of every wearable or wieldable item to drag from. The hero portrait is a drop target that picks the slot (main hand for weapons, else the first free slot it fits). `equipment_swaps` drags the splint mail onto the hero and drops the staff on the blocked main hand.
- **L6:**
  - A settings read error is shown on the title (`crash_recovery`).
  - Changed settings relabel the bar.
  - Autopickup gains "Everything".
- **L7:** pack letters toggle rows in the container screen (`containers` puts the dagger in by letter).
- **L8:** F11 and a Settings switch for fullscreen, saved, and a 1280×720 minimum window size (`small_window`).
- **L9:**
  - `tests/run.sh` gives each scenario a throwaway `XDG_DATA_HOME` and playground (`NH_GODOT_PLAYGROUND`), so tests never touch the player's settings, saves, scores or crash files.
  - The five crash checkpoints that earlier test runs had left in `playground/` (the `descent` hero and one dead pid) were removed.
  - `wish_close` zaps with keys, closes with `NOTIFICATION_WM_CLOSE_REQUEST`, and clicks the card.
  - `locked_door` opens the palette with pad Y, reaches "Kick it open" with the D-pad and kicks with A. It hovers the hero card with the mouse.

**Found and fixed along the way:**
- After pad play, the first mouse click on a context button was lost: switching back to keyboard hints rebuilt the buttons between press and release. Context buttons are now relabelled in place.

**Left:**
- Test quits and deaths from runs before the sandbox are still in `playground/xlogfile` and `record`. These are the player's score files, so I didn't edit them.
