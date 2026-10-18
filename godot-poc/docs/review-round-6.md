# Godot front end review, round 6

Date: 2026-10-17. Scope: everything in `godot-poc/` after the round-5 fix pass, looking hardest at the round-5 changes (message feed hit test, settings seeding and fullscreen, automation cancel and `answer_pending`, settings reset, the floor-and-pack screen, crash checkpoints on the title, palette and bar lock follow-ups, the equipment pack strip, test sandboxing and the new or changed scenarios).

The lenses are the same as round 5:
1. Functional parity with Electron (`electron-poc/src/ux`, `src/shared`, `src/renderer.js`).
2. UX quality, from the UI code and the screenshots of the full run that finished at 20:08 (21 scenarios, all PASS; the only logged error is the settings parse error `crash_recovery` provokes on purpose). Every source file is older than that run, so the screenshots show the current code.
3. Architecture and correctness.

**How the findings were checked**
- Read-only review. Nothing was built or run.
- Every finding was checked against the code. UX findings were also checked against the screenshots named in them.
- Engine claims were checked in NetHack's source in this repository: `sys/unix/unixunix.c` (`getlock`, `veryold`, `eraseoldlocks`), `sys/unix/unixmain.c` (`MAXPLAYERS` becomes `gl.locknum`), `playground/sysconf` (`MAXPLAYERS=10`), `util/recover.c` (level-0 layout, `create_savefile`), `src/pickup.c` (`pickup`, `doshimgroundtransfer`, `doshimcontainertransfer`, `direct_ground_common_checks`), `src/hack.c` (`check_capacity`), `src/lock.c` (`u_have_forceable_weapon`). Bridge claims were checked in `electron-poc/shim-bridge/nh-shim-bridge.c`.
- The Electron parity sweep listed Electron's user-facing features and searched `game/` for each one with several terms. Only gaps confirmed that way are reported.
- Paths are relative to `godot-poc/project/` unless they start with `electron-poc/`, `src/`, `sys/`, `util/`, `include/`, `playground/`, `tests/run.sh` or `docs/`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 3 high, 3 medium, 7 low (13 in total).

The three most serious problems:
- The message feed still catches clicks and the wheel over most of its 760×230 box, because every line is a full-width strip. A click there now opens the History panel instead of moving the hero (H1).
- NetHack deletes a crash checkpoint by itself the next time any game starts. The title offers "Recover", but pressing the focused "Continue" destroys the crashed run first (H2).
- "Pick up all", "Take all" and multi-item moves in the floor and container screens cost one turn per stack. NetHack's own menus cost one turn for the lot. The floor screen is now what the bar's "Pick up" opens (H3).

---

## Round-5 verification

- **H1 (feed hit box): partly fixed.** The empty space above the lines now lets clicks and the wheel through (`ui/message_feed.gd:35-43`), and a line click opens the history (`ui/hud.gd:57`). But each line is a 760-pixel-wide strip, so once the feed holds a few messages most of the box still catches input (H1 below).
- **H2 (reduced motion on Linux): fixed.** `game/settings.gd:43-44` seeds it only on `== 1`. `world_first_look.gd:12` asserts animations are on in a fresh user directory.
- **M1 (cancel on input that does nothing): mostly fixed.** The mouse cancels only inside the sending branch (`input/input_router.gd:209`). The keyboard cancels after its early returns (`:85`). The pad cancels only on world buttons (`input/gamepad_router.gd:63-64`). A cancelled run says so (`input_router.gd:413-414`). Leftovers are in L1.
- **M2 (Reset to defaults): fixed.** The card is rebuilt in place and everything is re-applied (`ui/dialogs/settings_screen.gd:136-155`). `ui_panels/05-settings-after-reset.png` shows the rebuilt card, and `ui_panels.gd:66-84` checks that keys don't reach the game.
- **M3 (floor-and-pack screen): fixed as asked.** `ui/dialogs/container_screen.gd:37-46,251-252,269-275`, `game/nethack_session.gd:299-302`, `ui/dialog_host.gd:379-389`, `travel_and_transfer/08…11-*.png`. It brings a turn-cost problem with it (H3) and some small flaws (M2, L3).
- **M4 (crash checkpoints on the title): fixed as asked.** The title names the hero and the time, newest first, and a "Crashed runs" card offers Recover and Discard (`ui/title_screen.gd:83-90,154-189`, `game/save_catalog.gd:150-198`, `crash_recovery/01…03-*.png`). But NetHack deletes the checkpoint on the next game start (H2), recovering can overwrite a newer save (M1), and two runs can still look identical (L2).
- **L1 (prompt counts as open after a send): fixed.** `answer_pending` is set in `game/game_screen.gd:83-95` and cleared on every request (`state/game_state.gd:288`). `cancel_automation` clears a queued panel (`input_router.gd:410`). Two input paths still read the raw request kind (L1).
- **L2 (Enter on a footer button): fixed.** `ui/dialogs/menu_dialog.gd:253-255`.
- **L3 (lock follow-up flaws): fixed.** The palette lists lock actions first and hides "Open door" (`ui/dialogs/command_palette.gd:68-74`). It shows readable keys: `^D` and `af` in `locked_door/02-palette-lock-actions.png`. Force needs a wielded weapon (`ui/action_bar.gd:209`), and restored history lines are skipped (`:173`). The weapon check is looser than NetHack's (L5).
- **L4 (direction banner keys): fixed.** `ui/dialog_host.gd:179-184`.
- **L5 (equipment drag sources): fixed.** Pack strip and hero drop target (`ui/dialogs/equipment_screen.gd:112-121,169-214`, `equipment_swaps/04-dragging-onto-hero.png`). Ammunition goes to the wrong slot (M3).
- **L6 (settings leftovers): fixed.** The read error shows on the title (`main.gd:49-50`, `crash_recovery/05-settings-unreadable.png`). Changed settings relabel the bar (`game/game_screen.gd:61-62`). "Everything" autopickup exists (`settings.gd:107-109`). Small leftovers are in L5.
- **L7 (pack letters in containers): fixed for the pack pane.** `container_screen.gd:306-317`. The container and floor rows have no letters (L3).
- **L8 (fullscreen, minimum size): fixed.** `main.gd:29,182-193`, `settings_screen.gd:36-39`, `small_window.gd:39-46`.
- **L9 (test gaps, real data): fixed.** `tests/run.sh:52-59` sandboxes `XDG_DATA_HOME` and the playground, and `game/nethack_session.gd:35-39,57-63` honours it. `wish_close` uses keys and the real close notification (`wish_close.gd:24-34,59`). `locked_door` drives the pad through the palette and hovers the card (`locked_door.gd:52-64,107-111`). New gaps are in L7.
- **Found along the way (context buttons relabelled in place): holds.** `action_bar.gd:80-84,257-259`.

---

## High

### H1. The message feed still eats map clicks and the wheel over most of its box, and a click now opens a panel

**Area:** mouse play, HUD (round-5 H1 follow-up).

- `_has_point` now accepts a point only over a line (`ui/message_feed.gd:35-43`). But a line is a `Label` with `custom_minimum_size = Vector2(740, 0)` inside a 760-pixel-wide `VBoxContainer` (`:141`, `:22-23`). Its rectangle, and so its hit area, is the full 760 pixels, however short the text.
- Seven lines plus the scroll hint fill about 190 of the box's 230 pixels. After the first few turns of a game, roughly 85% of the old box still catches input. Only a thin strip at the top lets input through.
  - `locked_door/04-unlock-question.png`: "Whammm!!" is about 90 pixels of text with a 760-pixel hit strip.
  - `descent/08-feed-scrolled-back.png`: seven full-width strips from y 815 to 985.
- Faded lines (alpha 0.45 when idle, `:168`) catch input the same way, though the player sees the map through them.
- What the player gets, on map cells below and to the left of the hero (the camera centres the hero, so these are three or more rows down and up to nine columns left):
  - A click to move or travel opens the **History panel**, a modal (`:50-51`, `hud.gd:57`). In round 5 the same click did nothing; now it pops a panel the player didn't ask for.
  - The wheel scrolls the feed instead of zooming.
  - During "Where do you want to travel to?" or a `;` look, a click on those cells opens the history instead of picking the cell.
- The test checks only the top sliver: `descent.gd:106` picks a point 4 pixels below the box's top, which passes as long as one strip is free.
- **Fix:**
  - Hit-test the text, not the label. In `_over_text`, use `label.get_theme_font("font").get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 19).x` as the width for one-line labels; wrapped labels (`get_line_count() > 1`) keep the full width. Or size each label to its text with `SIZE_SHRINK_BEGIN`, and set a wrap width only when the text is longer than 740 pixels.
  - Let faded lines (idle, `modulate.a < 0.6`) pass clicks through until the pointer has rested on them for a moment.
  - Test in `descent`: click a map cell to the right of a short line (for example 400 pixels into the strip of "You fall through...") and assert travel starts and no `HistoryPanel` opens.

### H2. NetHack deletes a crash checkpoint the next time any game starts

**Area:** crash recovery (round-5 M4), engine behaviour.

- The playground's `sysconf` sets `MAXPLAYERS=10` (`playground/sysconf:56`), so NetHack names locks by letter: `alock`, `block`… (`sys/unix/unixmain.c:470-481`).
- On every game start, `getlock` tries the letters in order (`sys/unix/unixunix.c:144-161`). For an existing `<letter>lock.0`, `veryold` returns true when the owner pid is dead, or when the file is three days old or more (`:53-76`). `eraseoldlocks` then deletes every level file and the `.0` file (`:80-99`), and the new game takes that letter.
- A crashed Godot run leaves its lock set under a pid that is dead after a restart. That set is almost always `alock`, the first letter. So the first game started after the restart (Continue, New adventure, or a save from the list) silently destroys the checkpoint that the title is offering.
- The title makes this likely. With any save present, "Continue" is the primary, focused button, and "Recover" is not (`ui/title_screen.gd:80,88-89`). Enter or pad A continues the other hero and erases the crashed one.
- Godot's own cleanup is careful (`game/save_catalog.gd:122-135` keeps dead-pid sets that hold levels), but NetHack doesn't share that care. Within one Godot session the checkpoint survives, because the owner pid is Godot's own and still alive.
- `crash_recovery` can't see this: it copies the run to `zlock` and `ylock` (`tests/scenarios/crash_recovery.gd:29`), letters NetHack never scans with `MAXPLAYERS=10`, and it recovers before starting another game.
- **Fix:**
  - Before any game start (`NetHackSession.start_game`), move every dead-pid lock set that holds level files to a base name `getlock` never tries: the first free letter from `k` to `z`, or a name such as `crash1lock`. `recover` takes any base name, and `lock_sets` already matches `^(.*lock)\.(\d+)$`. Do the same when the title lists checkpoints, so they are safe from the start.
  - Test in `crash_recovery`: put the copy at `alock` (after the running game has finished), start any other game, end it, and assert the checkpoint is still listed and recoverable.

### H3. Moving several stacks in the floor or container screen costs one turn per stack

**Area:** game rules, floor-and-pack screen (round-5 M3) and container screen.

- Each `ground-transfer` and `container-transfer` is a separate NetHack command that returns `ECMD_TIME` (`src/pickup.c:3205-3209`, `:3315-3320`). The screens queue one per stack (`ui/dialogs/container_screen.gd:230-256`): "Pick up all", "Take all", a multi-row selection or a dragged selection all run N commands.
- NetHack's own way costs one turn for the lot: `pickup()` returns once for every item picked from the `,` menu (`src/pickup.c:904-914`), and `#loot` once for the whole session (`:4164`).
- Evidence: in `travel_and_transfer/08-floor-screen.png` the turn counter reads T7. One drop (T8) and "Pick up all" of two stacks later, `11-floor-picked-up.png` reads T10.
- Nothing stops the queue when a monster shows up. `_next` continues at every command prompt (`:239-256`). "Pick up all" on a ten-item pile beside a soldier ant gives the ant ten rounds of attacks, and the player is never asked.
- This now matters more: the bar's and the pile peek's "Pick up" open this screen (`input/input_router.gd:557-560`, `ui/pile_peek.gd:46-50`, `ui/dialog_host.gd:379-389`). Electron's direct route queues one transfer per selected row too (`electron-poc/src/shared/transfer-session.js:472-487`), but the bar here is to beat Electron.
- **Fix:**
  - Run moves of two or more stacks through NetHack's own menus: `,` (or `#loot` then take out / put in) for pickups, `D` for drops. Select the rows whose `objectId` matches (the bridge sends `objectId` on menu rows, `nh-shim-bridge.c:4085-4088`), then confirm. One command, one turn, and NetHack's own questions ("You have a little trouble lifting…") reach the player.
  - Keep the direct transfer for a single stack: a double-click, or a one-row drag.
  - If the direct path stays for batches, stop the queue as soon as HP drops or a hostile appears in view, and say so in the status line.
  - Test in `travel_and_transfer`: "Pick up all" on a two-stack pile advances the turn counter by one.

---

## Medium

### M1. Recovering a crashed run can overwrite a newer save of the same hero

**Area:** crash recovery, data safety.

- `recover` writes `save/<uid><name>` with `creat()`, which truncates any existing file (`util/recover.c:197-207`, called at `:287`). It never checks first.
- Players reuse names. After a crash, a new game named "Indy" can be played and saved while the old "Indy" checkpoint survives (for example, the crash happened earlier in the same session, so its pid was alive and NetHack skipped its letter). "Recover Indy" then replaces the newer save with the older crashed run, without a word (`ui/title_screen.gd:144-151`, `game/save_catalog.gd:202-214`).
- **Fix:** before `recover`, look for `save/<uid><name>` (and `.gz`). If it exists, ask: "Indy has a saved game from today 21:10. Recovering the crashed run (today 18:59) replaces it." Offer Recover anyway / Keep the save. Or move the existing save aside first (`<name>.bak`) and say so.

### M2. "Pick up" on a single item now takes three clicks and a full-screen card

**Area:** UX, mouse and pad play (round-5 M3 follow-up).

- The bar's "Pick up" used to send `,`, which for a one-item pile picks it up at once. Now it opens the 1240-pixel floor screen for every known pile (`ui/dialog_host.gd:379-389`). The player must press "Pick up all" (or select the row, then "Pick up"), then close the card.
- `travel_and_transfer/08-floor-screen.png`: a whole two-pane card for one food ration.
- The button still reads "Pick up  ," (`input/cell_actions.gd:50`, `ui/action_bar.gd:259`), so it teaches a key that does something else: `,` opens NetHack's list.
- **Fix:** for a pile of one stack, pick it up directly from the bar: one `ground-transfer`, with the refusal sentence in the feed. Open the floor screen for two or more stacks, or from a "More…" entry ("Pick up and drop…") when the player wants to drop as well. Drop the `,` hint from the button when it opens the screen.

### M3. Dropping ammunition on the hero wields it

**Area:** equipment screen (round-5 L5 follow-up), parity.

- `best_slot` returns the main hand for anything that fits it (`ui/dialogs/equipment_screen.gd:192-205`), and every `weapon`-class item fits it (`:418-419`). Arrows, crossbow bolts, darts, shuriken and boomerangs dropped on the portrait, or clicked in the pack strip (`:182-184`), go to the main hand. That replaces the hero's sword with a fistful of arrows, costs a turn, and fights badly.
- Electron sends ammunition and missiles to the quiver (`electron-poc/src/ux/equipment-screen.js:135-137`).
- **Fix:** in `best_slot`, choose the quiver for ammunition and thrown missiles. The bridge's `equipmentSlots` field (`nh-shim-bridge.c:3053-3054`) or the name test Electron uses (`arrow|bolt|dart|shuriken|boomerang`) both work. Test in `equipment_swaps`: drag the arrows onto the hero and assert they are quivered and the sword stays wielded.

---

## Low

### L1. Input-engine leftovers

**Area:** input engine (round-5 M1 and L1 follow-ups).

- **The pad still cancels on presses that send nothing.** D-pad, A and R3 cancel before they check anything (`input/gamepad_router.gd:63-64`). While NetHack is busy, `_step` sends nothing (`:109-115`), `_primary` returns (`:136-137`) and R3's `send_command` refuses. So a pad player who taps the D-pad mid-swap stops the swap, and nothing moves.
- **A pending follow-up isn't reported.** `was_sequence` requires remaining steps (`input/input_router.gd:412`). After `set_alternate`'s `w` is answered, only `_sequence_then` remains (`:307`), so a key pressed while the wield happens drops the `x` swap and the re-wield in silence: new weapon in hand, old one in the pack, no alternate.
- **Two paths read the raw request kind.** `click_cell` matches `request.kind == "command"` (`:199-213`) and the pad's `_step` does the same (`gamepad_router.gd:110-115`), so neither sees `answer_pending`. A click in the frame after a sequence sends its command still cancels the sequence and sends a map click to a prompt that is no longer the command prompt.
- **Fix:** move the pad's cancel into `_step` and `_primary`, after they decide to send. Count `_sequence_then.is_valid()` in `was_sequence`. In `click_cell` and `_step`, use `is_waiting_for_command()` for the command branch.

### L2. Crashed runs can still look identical

**Area:** title screen (round-5 M4 follow-up).

- `crash_recovery/02-crashed-runs.png` shows two rows that both read "Crashy · today 20:04". Two crashes of one hero in the same minute are rare, but the same hero crashing on different days at a similar time is not, and the rows give nothing else to tell them apart.
- `checkpoints()` already reads the character (`game/save_catalog.gd:164-165`) and the level list, but the rows show neither (`ui/title_screen.gd:162-163`). The title's portrait stays the default Valkyrie while the main button offers "Recover Crashy", a Wizard (`01-title-with-crash.png`).
- `_hero_in_lock` reads the name from the save path with `save/[0-9]*(…)` (`save_catalog.gd:173`), so a hero named "007Bond" loses the digits. `recover` reads the name from its own field after the save path (`util/recover.c:258-270`).
- **Fix:** show "Crashy the Wizard · Depth 2 · today 20:04" (deepest level from `levels`). Use the crashed hero's portrait when "Recover" is the primary button. Strip the known `uid()` prefix instead of all leading digits.

### L3. Floor screen rough edges

**Area:** floor-and-pack screen.

- "Pick up all" stays enabled, and focused, on an empty floor (`travel_and_transfer/11-floor-picked-up.png`; `container_screen.gd:71`).
- Floor and container rows have no letters, and typed letters toggle only pack rows (`:306-317`). The rows keep a blank letter column (`08-floor-screen.png`, `containers/05-dragging-scroll.png`).
- In a shop, a pile with no price text (the hero's own items, items not yet seen up close, or a container) opens the screen. Every move is then refused with "Shop goods go through NetHack's own menu" (`dialog_host.gd:381-384`, `container_screen.gd:290-291`; the engine refuses any square in a shop, `src/pickup.c:3044-3047`).
- When the hero is Overtaxed or worse, the engine refuses every direct move, drops included (`src/pickup.c:3032-3035`, `src/hack.c:4403`). NetHack's own `d` allows a drop then, and dropping is the way out. The card says "You can't carry that much more."
- **Fix:** disable "Pick up all" when the floor is empty. Give floor rows NetHack's pickup letters (a, b, c…) when the pack pane doesn't have focus. When the first refusal is a shop or capacity refusal, run the same move through `,` or `d` and say so.

### L4. Pack strip chips are hard to read

**Area:** equipment screen UX.

- The strip shows bare 52-pixel icons with no name or letter (`equipment_screen.gd:174-186`). In `equipment_swaps/05-two-handed-blocked.png` the quarterstaff is a thin brown line. The name is only in a tooltip, which pad players never see.
- With nothing to show, the caption "From your pack: drag onto a slot or onto yourself" sits over an empty row (`small_window/03-equipment.png`).
- **Fix:** add the pack letter as a corner badge and the short name under each chip, or show the focused chip's name in the caption line. Hide the caption when the strip is empty.

### L5. Small leftovers

**Area:** settings, action bar.

- `Settings.load_error` is never cleared (`game/settings.gd:31,46`). After the player saves good settings, every later visit to the title still says they couldn't be read (`main.gd:49-50`).
- "Reset to defaults" sets Reduced motion to off even when the OS asks for reduced motion, which the first run respects (`settings.gd:116-121` against `:43-44`).
- F11 while the Settings card is open doesn't move its Fullscreen switch (`main.gd:188-193`, `settings_screen.gd:36`). The switch then shows the wrong state, and the player's first click on it seems to do nothing.
- "Force the lock" is offered for any "(weapon in" item (`action_bar.gd:209`). NetHack also refuses bows, slings, crossbows, darts, whips, flails and unicorn horns (`src/lock.c:664-674`).
- **Fix:** clear `load_error` on a successful `save()`. Seed Reset's Reduced motion the way the first run does. Refresh the switch on F11 (or have the card listen to `settings.changed`). Mirror `u_have_forceable_weapon` with the item's skill or class.

### L6. Parity leftovers

**Area:** parity (Electron features with no Godot counterpart, found by this round's sweep).

- **Kick toward any neighbouring square.** Electron's cell menu offers "Kick toward cell" on every adjacent square, creatures included (`electron-poc/src/shared/interaction-model.js:683`). Godot offers a kick only for doors, sinks, boulders and boxes, and never when a creature stands there (`input/cell_actions.gd:111,116-128`). Mouse and pad players can't kick a monster or a loose item; Ctrl+D and the palette still can.
- **Space waits a turn in Electron.** Electron turns Space into `.` at the command prompt (`electron-poc/src/renderer.js:9678`). Godot sends a plain space, which tty NetHack ignores unless `rest_on_space` is set, so Godot is the classic one here. A player coming from Electron presses Space and nothing happens.
- **Input recording and replay.** Electron records a run's inputs and replays them (`electron-poc/src/ux/character-creation.js:170`, `src/main/replay-runner.js`). Round 1 (#53) settled for the diagnostics log, which can't be replayed. This is a bug-report tool, not a player feature.
- **Fix:** add "Kick" to the cell menu of every neighbouring square (it is NetHack's `^D` plus the direction; NetHack decides what happens). Offer NetHack's own `rest_on_space` as a Settings switch, "Space waits a turn", off by default so tty behaviour stays. Leave replay for later, but don't list it as done.

### L7. Test leftovers

**Area:** testing doctrine.

- `equipment_swaps` starts its main swap through internals: `screen.selected_slot = …`, `_rebuild()`, `_equip(…)` (`tests/scenarios/equipment_swaps.gd:26-32`). Nothing clicks the Body armor slot or the leather armor row, which is the path a player uses.
- `crash_recovery` uses lock letters NetHack never scans (`crash_recovery.gd:29`), which hides H2.
- `descent` checks only the top sliver of the feed (`descent.gd:106`), which hides H1.
- No scenario checks turn cost (H3) or clicks the pile peek (`ui_panels.gd:187-217` only shows it).
- `tests/run.sh:62` ignores the settings parse error in every scenario, not only in `crash_recovery`. A real settings regression elsewhere would pass.
- **Fix:** add the tests named in H1 to H3. In `equipment_swaps`, click the slot and the candidate row. In `run.sh`, apply `expected_errors` per scenario, for example from a `# expected-error:` line in the scenario file.

---

## Already better than Electron (keep these)

- Rounds 1 to 5's lists still hold.
- Crashed runs are named and dated, newest first, with a confirmed Discard (`crash_recovery/01-title-with-crash.png`, `02-crashed-runs.png`). Electron offers one unnamed candidate.
- Settings reset re-applies every live setting at once and keeps keyboard focus in the card (`ui_panels/05-settings-after-reset.png`).
- Automation that the player cuts short says so in the feed, and only input that reaches NetHack cuts it.
- The palette shows keys a player can read (`^D` for kick) and puts lock follow-ups first, with "Open door" hidden while the lock is known (`locked_door/02-palette-lock-actions.png`).
- Every scenario runs as a first run in its own sandbox, so the suite can never touch the player's saves, scores or settings.

---

## Status after the fix pass (2026-10-17)

**Fixed:**
- **H1:** a feed line catches the mouse only over its words (`MessageFeed._text_rect`; wrapped lines keep their width). A faded feed lets everything through until the pointer rests on its text for a moment. `descent` wheels and clicks right of the shortest line: the map zooms, and no history opens.
- **H2:** `SaveCatalog.protect_checkpoints` moves dead-pid lock sets that hold levels out of NetHack's `<letter>lock` names (to `crash<N>lock`). It runs before every game start and when the title lists checkpoints.
  - Correction to the finding: in this build NetHack reaps a recent dead-pid lock only without `NETWORK`. In practice it skipped `alock` and `block` and took `clock`. It does reap any lock older than three days, so the risk is real after a crash left over a weekend.
  - `crash_recovery` now puts the copies at `alock` and `block`, ages them four days, starts another game, and checks both survive. Without the fix one is reaped.
- **H3:** moves of two or more stacks go through NetHack's own command, which costs one turn. The floor uses `,` or `D`; containers use `#loot` and "take something out" or "put something in". Rows are picked by `objectId` through new sequence steps (`pick_ids`, `pick_text`, an optional `loot it?`). On the way, "All types" is picked automatically. A single stack keeps the direct transfer. No NetHack menu appears on screen: `containers` counts dialogs, and `travel_and_transfer` checks for exactly one `,` command and one command prompt.
- **M1:** recovering over a save of the same hero asks first. "Recover anyway" moves that save to `save/replaced/`. Without that, NetHack kept restoring the older compressed `.gz` save next to `recover`'s new one, which `crash_recovery` caught.
- **M2:** with one known stack, "Pick up" is NetHack's `,` (one item goes up at once). With two or more, the bar shows "Pick up…" with no key hint, and it opens the floor screen.
- **M3:** ammunition and missiles (arrows, bolts, darts, shuriken, boomerangs, ya, sling stones) dropped on the hero go to the quiver. `equipment_swaps` drags the arrows onto the hero.
- **L1:**
  - The pad cancels automation only inside `_step`, `_primary` and R3, once they actually send.
  - A pending follow-up step counts as running.
  - `click_cell` and the pad's `_step` respect `answer_pending`.
  - Pad A works on "Pick up…".
- **L2:** crashed-run rows name the role ("Crashy the Wizard · today 20:04"). The title portrait shows the crashed hero when Recover is the main button. The hero name is read after the known uid, so names starting with digits keep them.
- **L3:**
  - "Pick up all" is disabled on an empty floor.
  - A shop or capacity refusal on the floor screen hands the move to NetHack's own `,` or `d`.
- **L4:** pack-strip chips show the letter and base name ("f · splint mail"), and the caption hides when the strip is empty.
- **L5:**
  - `load_error` clears on a successful save.
  - Reset seeds Reduced motion from the OS.
  - F11 keeps the open Settings switch in step.
  - "Force the lock" mirrors `u_have_forceable_weapon` (no launchers, missiles, whips, flails or unicorn horns).
- **L6:**
  - "Kick" on every neighbouring square, with a warning for pets and peacefuls.
  - Settings > "Space waits a turn" (NetHack's `rest_on_space`, off by default), tested in `crash_recovery`.
- **L7:**
  - `equipment_swaps` clicks the slot and the row.
  - `ui_panels` clicks the pile peek.
  - Expected engine errors are now per scenario: `## expected-error:` lines in the scenario file.
- **Also:** the Settings rows scroll when the window is short.

**Left:**
- **L3, letters for floor rows:** pack letters already toggle pack rows, and giving floor rows a second set of letters would make the same key mean two things depending on focus. Floor rows are reachable by arrows, Tab and the mouse.
- **L6, input replay:** a bug-report tool, not a player feature. Not done, and not listed as done.
- **Hero card turn count:** it lags by one after a direct transfer until NetHack's next status update.
