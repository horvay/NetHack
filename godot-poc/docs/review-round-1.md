# Godot front end review, round 1

Date: 2026-10-17. Scope: everything in `godot-poc/` plus the Godot-only additions in `electron-poc/shim-bridge/nh-shim-bridge.c`.

The review has three lenses:
1. Functional parity with Electron.
2. UX quality, from all 61 screenshots in `test-output/` and the UI code.
3. Architecture and correctness, covering the C core, the GDExtension, the bridge additions and the GDScript.

**How the findings were checked**
- Three temporary probe scenarios ran against the real engine. They confirmed items 1, 6 and 17. The probes have since been deleted.
- Paths are relative to `godot-poc/project/` unless they start with `extension/`, `docs/` or `electron-poc/`.
- Line numbers match the files as of the end of the review.
- Some source files (`message_feed.gd`, most of `ui/dialogs/*.gd`, `world/*.gd`) changed while the review ran, after some screenshots were taken. Each screenshot-based finding was rechecked against the current code.

**Counts:** 1 blocker, 14 high, 27 medium, 24 low (66 in total).

## Status after the fix pass (2026-10-17)

- **Fixed (58):** 1–18, 20–35, 37–41, 44, 46, 47, 49–53, 55–62, 64, 66.
- **Partly fixed:**
  - 36 (test gaps): new `containers`, `shopping` and `small_window` scenarios, the level arrival is captured live, Esc on item prompts is in `safety`, quitting mid-game in `run_lifecycle`. Crash recovery has no scenario: a test can't make NetHack crash cleanly (there's no panic command outside wizard mode).
  - 19 (performance): map batching, vision bytes, resolver memo and HUD chip caching are done; terrain chunking is not, since the Xvfb frame cap hides any gain and a real display shows no problem yet.
  - 42 (art): staircases are now painted procedurally like the rest of the terrain (up: steps rising into warm light; down: a dark pit with steps fading into shadow), and carry an up/down badge that stays visible under creatures. The newt and the vertical open door were regenerated on the B70 (`tools/art/regen_sprites.sh`) and installed as Godot-only overrides.
  - 43 (leaks): a stopped game (parked in its input wait, so consistent) now runs NetHack's own teardown (`freedynamicdata`, `dlb_cleanup`, `l_nhcore_done`); an aborted one only closes `nhdat`, as NetHack itself skips teardown when panicking.
- **Deliberately left, with reasons:**
  - 45 (typed commands off the game thread): predates Godot and is shared with Electron; changing it needs a bridge redesign. Rare in practice: typed commands are sent only at the command prompt.
  - 48 (menus over 52 choices): the bridge itself can't distinguish duplicate selectors, so keying picks by row in Godot wouldn't help; no such menu has been seen in play.
  - 54 (rebinding): classic keys are fixed by design; the few Godot-only shortcuts (Tab, F1, F2, Ctrl±) are listed in the field guide.
  - 63 (`node_added` click sounds): kept on purpose, one hook gives every button in the app its sound; the beam access was replaced earlier.
  - 65 (`CellInfo`): `TerrainLayer.infos` already caches the classification per cell; a wider cache waits for a measured need.

---

## Blocker

### 1. Esc or Cancel on an item prompt uses item `q` or `n`

**Severity:** blocker. **Area:** input, prompts.

**What's wrong**
- `QuestionDialog._cancel` (`game/ui/dialogs/question_dialog.gd:141-148`) answers `q` if the choices contain `q`, otherwise `n`, and only otherwise sends Esc.
- For `getobj` prompts ("What do you want to drop? [abcq or ?*]"), `choices` is filled with the hero's inventory letters (`question_dialog.gd:62`, `expand_selectors`).
- So when the pack has an item lettered `q` or `n`, pressing Esc or clicking "Cancel Esc" picks that item. Depending on the prompt, the hero drops, quaffs, reads, eats or zaps it.
- Any hero with 14 or more items has an `n`.

**Evidence:** a probe moved the food rations to letter `q` with `#adjust`, pressed `d`, then Esc. The log read "You drop 2 uncursed food rations."

**Fix**
- The `q`/`n` fallback exists only for real yes/no questions with non-empty `choices` (bridge doc §4.2).
- In `item_mode`, and whenever `raw_choices` is empty, Cancel must send Esc (27).
- Add this exact case to a scenario: an item lettered `q`, then a drop prompt, then Esc.

---

## High

### 2. The seed carries over into later games

**Severity:** high. **Area:** engine lifecycle.

**What's wrong**
- `NetHackCore::start` calls `setenv` for every key it is given and never unsets anything (`extension/src/nethack_core.cpp:106-111`).
- `NetHackSession.start_game` only adds `NH_ELECTRON_CHOSEN_SEED` when a seed is given (`game/nethack_session.gd:32-33`).
- After one seeded game, every later game in the same session uses the same seed: a new game with an empty seed box gets the same dungeon, and a continued save gets a predictable RNG.
- The fixture build has the same flaw with `NH_TEST_SCENARIO`, which the bridge sets process-wide (`nh-shim-bridge.c` around line 4159).

**Fix:** before applying the new environment, have `start()` unset a fixed list of per-game variables (`NH_ELECTRON_CHOSEN_SEED`, `NETHACK_SEED`, `NH_TEST_*`). Alternatively, have GDScript always pass every key, with "" meaning unset.

### 3. A crash, abort or failed start is shown as "Your hero rests" (a save)

**Severity:** high. **Area:** run lifecycle, failure handling.

**What's wrong**
- `EndScreen.setup` sets the outcome to `"saved"` whenever no `how` arrived and the reason isn't `"stopped"` (`game/ui/end_screen.gd:31-32`).
- That covers `reason:"abort"` (panic, contained crash), `"returned"`, a nonzero exit code, and a startup refusal such as a lock conflict. In all of these the player reads "waits at the threshold. Continue from the title screen" when there is nothing to continue.
- When `start_game` fails, `main.gd:86` only calls `push_error`, which leaves a dead game screen.
- Electron has a sticky "Connection lost" failure notice (`electron-poc/src/ux/failure-presentation.js`).

**Fix**
- Classify the outcome by `reason` and `code` first.
- Count a run as "saved" only after the "Really save?" question was answered `y` and the game then exited cleanly (track that answer in `GameState`).
- Add a "the game stopped unexpectedly" outcome that offers `SaveCatalog.checkpoints()`.
- Show an error card and return to the title when a start fails.

### 4. Lock cleanup after any game end deletes crash checkpoints

**Severity:** high. **Area:** save safety.

**What's wrong**
- `_on_core_game_ended` always calls `clear_stale_locks()` (`game/nethack_session.gd:91-92`).
- That deletes every lock set owned by Godot's own pid, level files included (`game/save_catalog.gd`, `clear_own_locks`), whatever the end reason was.
- After a panic or a contained crash (`reason:"abort"`), those level files are the only recovery data, and they're gone immediately.

**Fix:** clear our own locks only for a clean `exit` or `stopped`. Keep them for `abort` and panic exit codes so the title screen can offer recovery.

### 5. Closing the window abandons the run without saving

**Severity:** high. **Area:** lifecycle, data safety.

**What's wrong**
- Nothing handles `NOTIFICATION_WM_CLOSE_REQUEST`.
- When Godot quits, `NetHackCore` PREDELETE calls `stop()` (`extension/src/nethack_core.cpp:73-76`), which longjmps out of the game without saving.
- The run survives only as a dead-pid checkpoint, and only if the dev-tree `util/recover` exists.
- A modern game saves or asks on close.

**Fix**
- Set `get_tree().auto_accept_quit = false` and handle the close request.
- If the game is at the command prompt, send `S` and then `y`, and quit once `game_ended` arrives.
- Otherwise show "Save and quit / Quit without saving / Cancel".
- Consider a bridge-extended "hangup save" input that runs NetHack's own hangup save, which works from any prompt.

### 6. Projectiles, zaps and explosions never appear on screen

**Severity:** high. **Area:** world rendering, juice.

**What's wrong**
- NetHack draws a projectile's flight and a beam's path as temporary glyphs separated by `shim_delay_output`, then erases them.
- `NetHackCore::drain` emits every queued line in one frame (`extension/src/nethack_core.cpp`, `drain`).
- `WorldView` rebuilds at most once per frame, from the final state (`game/world/world_view.gd:126-128`).
- Nothing consumes `shim_delay_output` (grep finds no match in `game/`).

**Evidence:** a probe threw a dagger (`tbk`). All 39 events, including three flight positions and their `shim_delay_output` markers, arrived in one frame, so the dagger was drawn only where it landed.
- The same applies to wand beams, breath and explosions, so `EffectLayer.sync_beams` can rarely fire.
- Multi-step runs and travel arrive the same way, so the hero blinks to the destination (`actor_layer.gd:217-223`) instead of walking.
- This undercuts BIBLE's "Juice on everything" ("particles for zaps, spells, explosions and breath").

**Fix**
- In `GameState`, treat `shim_delay_output` as a keyframe boundary.
- Record the temporary-glyph cells between boundaries into an animation timeline: a projectile path, a beam segment set, an explosion frame, or a hero step list.
- Have `WorldView` and `EffectLayer` play the timeline back over about 30-60 ms per keyframe.
- The model stays authoritative and the final state is applied immediately for input purposes. A new key fast-forwards the playback, as the BIBLE requires.

### 7. There is no container transfer screen, though the roadmap marks it done

**Severity:** high. **Area:** parity (containers).

**What's wrong**
- Electron has a two-pane container/inventory panel (`electron-poc/src/renderer.js:6545-6688`, `src/shared/transfer-session.js`).
  - It is driven by the typed `container-snapshot` and `container-transfer` commands and the `shim_container_contents_snapshot` event.
  - It has select-all, letter toggles, drag, auto-picking of "All types", and specific locked/trapped/empty failure messages (`renderer.js:8829-8839`).
- Godot never sends `container-snapshot`, `container-transfer` or `ground-transfer`, and never handles `shim_container_contents_snapshot` (grep finds no match). It only retitles NetHack's take-out/put-in menus (`game/ui/dialogs/menu_dialog.gd:24-29`).
- No scenario covers `#loot`.

**Fix**
- Store container snapshots in `GameState`.
- Add `send_container_snapshot` and `send_container_transfer` to `NetHackSession`.
- Build a `ContainerScreen` that opens on a `container.action` menu purpose, or from the "Open container" cell action.
- Fall back to NetHack's menus when the bridge rejects (locked, shop, cursed bag).
- Keep Godot's per-stack partial counts; Electron can't do those.

### 8. Shop flows are missing, though the roadmap claims "shop bill" is done

**Severity:** high. **Area:** parity (shops).

**What's wrong**
- Grepping for "bill" finds only one palette alias (`game/input/command_catalog.gd`).
- **No prices or totals in pay menus.** Electron shows "selected X zm / total Y zm", a "Pay selected" confirm, and payment-phase messages (`renderer.js:5056-5067, 6726-6757, 6958-6994`).
- **No "Pay shopkeeper (N items)" cell action.** Electron builds it from the `shop.unpaid.owner.<id>` and `monster.shopkeeper.id.<id>` tokens (`electron-poc/src/shared/interaction-model.js:600-609`). Godot offers only Chat and Attack next to a shopkeeper (`game/input/cell_actions.gd`).
- **Sell offers read "Yes / No / All / Cancel".** The `[ynaq]` labels come from the generic `CHOICE_LABELS` (`question_dialog.gd:8-11`) instead of "Accept / Decline / Accept all remaining / Stop selling".
- **The unpaid chip shows no price** (`inventory_screen.gd`, "Unpaid — shop property").

**Fix**
- Detect pay and bill menus in `MenuDialog`, parse "N zorkmids", and show running totals.
- Add a pay action in `CellActions` keyed on the shopkeeper and unpaid tokens.
- Give `QuestionDialog` context labels for sell offers.
- Show unit prices on item cards.

### 9. Direction prompts show no targets and can't be fully answered without a keyboard

**Severity:** high. **Area:** UX, input completeness.

**What's wrong**
- A direction prompt is only a text banner (`game/ui/dialog_host.gd:117`). The reticle is drawn only for `map_target` (`game/world/world_view.gd:86-88`).
- BIBLE: "Direction prompts show targets on the map."
- Clicking a neighbour works, but up and down (dig or zap down, `<`/`>`) need a keyboard. A click on a non-adjacent cell does nothing and gives no feedback (`game/input/input_router.gd:164-169`).
- Gamepad A always sends `.` (`game/input/gamepad_router.gd`, `_primary`).
- The banner says "hjklyubn" even when number_pad is on.
- Electron has a clickable 3×3 compass (`renderer.js:4399-4483`).

**Evidence:** `test-output/descent/02-dig-direction.png`, `spells_and_skills/03-cast-direction.png`.

**Fix**
- While the request is a direction prompt, draw eight clickable chevrons around the hero, mark creatures and doors in those cells, and add clickable `<`, `.` and `>` chips to the banner.
- Map the D-pad, stick and bumpers to directions and up/down.
- Build the banner text from `state.dirchars`.

### 10. The UI doesn't scale to other window sizes

**Severity:** high. **Area:** UX, layout.

**What's wrong**
- `project.godot` sets 1920×1080 with no `window/stretch/mode`.
- The inventory and equipment cards have fixed minimum sizes of 1480×800 and 1480×820 (`game/ui/dialogs/inventory_screen.gd:43`, `equipment_screen.gd:54`).
- The message feed is a fixed 760 px, and the character-creation columns are fixed widths.
- At 1366×768 or 1280×720 these clip; at 4K everything is tiny.
- There is no UI-scale or font-size setting.
- Electron enforces a 960×720 minimum window with a responsive layout (`electron-poc/src/main/window-policy.js`).

**Fix**
- Use `stretch/mode="canvas_items"` with aspect `expand`, size the cards relative to the viewport, and add a UI-scale setting (which also serves as an accessibility font-size control).
- Add a 1280×720 run to the scenario suite.

### 11. Controller play is unsafe and incomplete

**Severity:** high. **Area:** input (gamepad).

**What's wrong**

*Safety and focus*
- **A answers Yes to dangerous questions.** `GamepadRouter._first_focusable` focuses the first button (`gamepad_router.gd:106`). For `ynq` questions that is Yes, so A on "Really attack the peaceful…?", "Are you sure you want to pray?" or "Really quit?" goes through.
- **No focus on open.** No dialog grabs focus when it opens, so the first pad press only moves focus.
- **The stick can stick.** `_stick` is updated only when no dialog is open (`gamepad_router.gd:28-36`). If the stick is released while a dialog is open, the stale vector stays, and the hero keeps walking once the dialog closes (`_process`, lines 59-70).
- **The right trigger repeats.** Every motion event above 0.6 calls `send_command(";")` (line 37). Holding the trigger spams "Finish the current prompt first."

*Hints*
- Every hint is keyboard text ("Esc", "Click to inspect").

*Missing abilities*
- No run.
- No up/down direction.
- No counts.
- No actions on adjacent cells.
- "Press any key" banners can't be cleared with A.

**Evidence:** `gamepad_play/01-03`.

**Fix**
- Focus the safe or default answer when a dialog opens.
- Track stick state regardless of dialogs, and clear it when a dialog opens.
- Edge-trigger the triggers.
- Map A to "any key" during key waits, and add a run modifier and up/down bindings.
- Drive every hint from one input-glyph helper that switches on `GamepadRouter.active`.

### 12. Text windows close on any key and can't be scrolled

**Severity:** high. **Area:** UX (text windows).

**What's wrong**
- `TextWindowDialog.handle_key` closes on every key (`game/ui/dialogs/text_window_dialog.gd:39-43`), so arrows and PgDn dismiss the window instead of scrolling it.
- The height estimate (27 px per line) and the faint scrollbar hide the fact that there is more text.
- **Evidence:** the `^X` character sheet is cut off at "Miscellaneous:" (`ui_panels/07-character-sheet.png`).
- The same dialog shows help pages, lore, discoveries and the dungeon overview.

**Fix**
- Make arrows, PgUp/PgDn and the D-pad scroll; close only on Esc, Enter or Space.
- Show a visible scrollbar and a "more below" fade.

### 13. Settings that do nothing

**Severity:** high (players trust these). **Area:** settings.

**What's wrong**
- `confirm_dangerous` and `show_key_hints` are saved and shown (`game/ui/dialogs/settings_screen.gd:20,28`), but nothing reads them. Grep finds them only in `settings.gd` and `settings_screen.gd`.
- "Reduced motion" only turns off camera shake (`game/world/world_view.gd:233`). Card scale-ins, actor hops and lunges, floaters, the level fade and banner, and feed slides all still play.

**Fix**
- Read `confirm_dangerous` in `InventoryScreen._run` and the palette for `danger` entries.
- Read `show_key_hints` in `ActionBar._make_button` and the palette key labels.
- Gate every tween behind one `Motion.enabled()` helper.

### 14. Too few context actions, and none for neighbouring cells

**Severity:** high. **Area:** UX principle "Visible actions", parity.

**What's wrong**

*Action bar*
- It only queries the hero's own cell (`game/ui/action_bar.gd:76-79`).
- BIBLE: "The current square and adjacent tiles offer their actions (open door…)."
- **Evidence:** `descent/05-level-2-explored.png`. The hero stands next to a closed door, the log shows "That door is closed." five times, and the bar offers nothing.

*Missing cell actions (`game/input/cell_actions.gd`)*
- Eat from the floor.
- Tip, #force or #untrap a container you stand on.
- Kick a sink.
- Drop on an altar to learn blessed/cursed status.
- Engrave here.
- Sit on a throne.
- Kick an adjacent container.
- Pay the shopkeeper.

*Lock follow-ups*
- There are no follow-ups to "This door is locked" (unlock / kick / force) or to a locked container (unlock / #force / untrap, then reopen).
- Electron has all of these (`electron-poc/src/shared/interaction-model.js:547-613`, `renderer.js:2218-2280, 2548-2766`).

**Fix**
- Merge the primary action of each of the 8 neighbours into the bar, with the direction shown.
- Extend `CellActions` with the cases above.
- Have `GameState` emit a `locked_obstacle(cell, kind)` signal for lock messages, and let `DialogHost` show a non-modal action card in response.

### 15. Long worms collapse into one jumping sprite

**Severity:** high once worms appear. **Area:** world rendering.

**What's wrong**
- The bridge gives every worm-tail segment the worm's own actorId: `m_at()` returns the worm for its tail cells (`nh-shim-bridge.c:3301-3304`).
- `MapModel.actors()` keeps one position per actorId (`game/state/map_model.gd:120`). So `ActorLayer` shows a single worm sprite that jumps to whichever segment comes last in scan order.
- `TerrainLayer._draw_contents` skips every other segment cell, because they carry an actorId (`terrain_layer.gd`, the `actorId != ""` branch). Those cells are drawn as empty floor.
- Displaced images and other cells where the shown glyph doesn't match `m_at()` hit the same assumption.

**Fix**
- Key actors by actorId plus cell for repeated ids.
- Better: in the extended bridge, emit `actorId` only on the worm's head cell (`mtmp->mx`, `mtmp->my`) and mark tail cells `actorRole:"tail"`; draw tails as static segments.

---

## Medium

### 16. Map clicks can be misread as keys

**Severity:** medium. **Area:** bridge (extended input).

**What's wrong**
- The `map-click` check reads `program_state.input_state` when the line arrives, not when NetHack pops the queued key (`nh-shim-bridge.c` around lines 1250-1271).
- If keys are already queued (a click and a key in the same frame, or two quick clicks), an accepted click can be popped by `yn_function`, `getlin`, a menu or `nhgetch`.
- Those call sites cast the encoded int to `char`, which leaves only the x column: x=46 becomes `.`, x=60 and 62 become `<` and `>`, digits become counts, and x=65-79 become item letters A-O.
- This contradicts `docs/bridge-protocol.md` §9.3 ("can't be misread").

**Fix:** check at pop time. Have every pop site except `nh_poskey` discard click entries and emit `bridge_map_click_dropped`, or keep clicks in their own slot that only `nh_poskey` reads.

### 17. Getpos noise floods the message log, and farlook callouts stack up

**Severity:** medium. **Area:** messages, UX.

**What's wrong**
- Every `shim_raw_print` becomes a game message (`game/state/game_state.gd:113`).
- During `;`, `_` and spell targeting, NetHack's autodescribe prints a line for every cursor step, and these go into the feed and history.
- **Evidence:** a probe ran `;`, moved the cursor four steps and confirmed. The log gained "Pick a monster, object or location.", "wall", "unexplored area ×3" and "can be many things (unexplored area)".
- `FeedbackDirector` treats each getpos keystroke as a "pick", because the request goes busy between keys (`game/feedback_director.gd:30-34`). So every step spawns a callout card, and they pile up overlapping beside the hero, not at the cursor.
- Callouts are pinned in screen space for about 3.75 s, so after travel they cover the hero (`look_and_minimap/03`, `05`).

**Fix**
- While a `map_target` request is open, route `shim_raw_print` to an autodescribe line next to the reticle, not to `MessageLog`.
- Show a callout only for the final farlook answer, keep a single instance anchored to the world cell, and dismiss it on the next command.

### 18. Attack lunges and "miss" floaters hit the wrong creature

**Severity:** medium. **Area:** feedback.

**What's wrong**
- `_last_command_dir` is set only from hero movement (`game/feedback_director.gd:26-28`), so `F` plus a direction isn't known.
- `_nearest_adjacent_monster` returns the first adjacent actor, including the pet.
- **Evidence:** `combat_feedback/01-fight-0.png` says "You miss the newt", but "miss" floats over the little dog.

**Related floater bugs**
- "Level up!" floats twice: once from the status change and once from the message (lines 66 and 111).
- Polymorphing and returning to normal swap HP pools, which shows as huge damage or heal numbers with screen shake.

**Fix**
- Have `InputRouter` record the direction of the last move or `F` key.
- Match the monster name in the message against adjacent actors, and skip tame ones.
- Remove the duplicate level-up floater.
- Ignore HP jumps that come with a polymorph or rehumanize message.

### 19. Per-glyph signals and full rebuilds cause frame hitches

**Severity:** medium. **Area:** performance.

**What's wrong**

*Per-glyph signals*
- `GameState._print_glyph` emits `map_changed` once per glyph (`game/state/game_state.gd:232`).
- `ActionBar` (`action_bar.gd:48`) and `Hud` (`hud.gd:56`) connect to it with `call_deferred`, so a level redraw queues about 1,700 deferred `_refresh_context` calls, each running `CellActions.for_cell`, plus the same number of inspector refreshes.

*Full rebuilds*
- `WorldView._rebuild` (`world_view.gd:147-191`) redraws all 1,680 terrain cells and re-classifies each cell dictionary with string compares.
- It also rebuilds the vision image in GDScript with `str()` calls per cell.
- `EffectLayer.sync_beams` and `MapModel.actors()` (used by `ActorLayer.sync`) each scan all cells.

*Unbounded drain*
- `drain()` has no per-frame budget.

*Smaller per-turn costs*
- `Hud._refresh_conditions` frees and rebuilds its chips on every status flush.
- The cell inspector re-describes the cell on every mouse-motion event.

**Fix**
- Emit one `map_changed(dirty_cells)` per drained batch, for example on `shim_display_nhwindow(map)` or at the end of `drain`, and make every subscriber use a dirty flag.
- Redraw only dirty terrain chunks (for example 16×7 tile chunks as separate CanvasItems).
- Keep a packed per-cell explored/kind cache updated in `set_cell`.
- Track actors incrementally.

### 20. `stop()` can call into the library just after it was unloaded

**Severity:** medium (a crash). **Area:** extension threading.

**What's wrong**
- `stop()` loads `stop_fn` and then calls it (`extension/src/nethack_core.cpp:145-151`).
- Meanwhile, a game ending on its own can store null into `stop_fn` and `dlclose` the library (lines 255-258).
- Quitting right at game over, or the test runner's stop-if-running, can then jump into unmapped code.

**Fix:** keep the stop flag in the extension and pass the core a pointer to it, or hold one mutex across load+call and across null-store+dlclose.

### 21. NetHack installs process-wide signal handlers inside Godot

**Severity:** medium. **Area:** process containment.

**What's wrong**
- While a game runs, NetHack's PANICTRACE and hangup handlers own the process signals:
  - SIGSEGV, SIGBUS, SIGFPE, SIGILL and SIGABRT go to `panictrace_handler`;
  - SIGINT goes to `done1`;
  - SIGHUP goes to `hangup`.
- Ctrl+C in the launching terminal runs "Really quit?" on Godot's main thread and hangs it.
- A Godot crash prints NetHack's "Signal received." instead of Godot's backtrace.
- A SIGSEGV on the game thread longjmps out of the signal handler through `__wrap_abort`, and Godot keeps running on a possibly corrupt heap.

**Fix:** link the core with `-Wl,--wrap=signal,--wrap=sigaction`, make both no-ops for the game, and let Godot own process signals.

### 22. Exit paths can deadlock on the bridge's output mutex

**Severity:** medium. **Area:** C core.

**What's wrong**
- `out_mu` is not recursive.
- If `pline`, `impossible` or `panic` runs while the bridge holds it (for example `xname` inside an inventory emit), the game thread deadlocks on itself.
- `nhcore_run`'s own `bridge_exit` emit has the same risk.
- In process, nothing can then stop the game: PREDELETE's join blocks forever, Godot freezes on quit, and a full input pipe can block `send_line` on the main thread.

**Fix**
- Make `out_mu` recursive, or track its owner in nhcore and release it before emitting `bridge_exit`.
- Give the PREDELETE join a timeout that leaks the library instead of hanging.

### 23. The HUD drops most of the status line

**Severity:** medium. **Area:** parity (status).

**What's wrong**
- The hero card shows HP, Pw, Depth, Lv, AC, gold and turns, plus hunger, encumbrance and conditions (`game/ui/hud.gd:117-124`).
- Missing everywhere in play:
  - Score (and `showscore` isn't in the options)
  - experience points (`showexp` is on but never shown)
  - Str/Dex/Con/Int/Wis/Cha (only on the equipment screen)
  - polymorph HD: the Lv chip goes blank while polymorphed
  - terrain
- NetHack's status-highlight colours are stored (`status_model.gd`, `colors`) but never used.
- Electron has a compact/detailed HUD and a status-based character sheet (`electron-poc/src/shared/status-hud.js`, `src/ux/character-sheet.js`).

**Fix**
- Make the hero card expandable on hover or a key, covering the full field list.
- Show HD in place of Lv when it is set.
- Add `showscore`.
- Build a real character sheet from `StatusModel` instead of raw `^X` text.

### 24. The end screen is thin and sometimes wrong

**Severity:** medium. **Area:** end of game.

**What's wrong**
- No score. No role, race or alignment grid. No final HP, Pw, AC or hunger.
- "Last moments" falls back to the last 12 messages, so a quit shortly after restoring shows "Restoring save file… welcome back" (`run_lifecycle/08-quit-end.png`).
- No full-log tab.
- The saved screen has two buttons that both go to the title (`end_screen.gd`, "Continue later — back to title" and "Title screen").
- Electron shows a tombstone with the score, a full stats grid, every disclosure and the full log (`renderer.js:3472-3613`, `src/ux/final-chronicle.js`).

**Fix**
- Add score and identity fields to `_stats_strip`.
- Add a "Full log" tab built from `MessageLog`.
- Hide "Last moments" for saves and quits.
- Drop the duplicate button.

### 25. Equipment screen: type-ahead bug and missing helpers

**Severity:** medium. **Area:** equipment.

**What's wrong**
- Setting the alternate weapon sends `"w" + sel + "x"` in one burst (`game/ui/dialogs/equipment_screen.gd:288`). If `w` raises any prompt (a cursed weapon already welded, "You are now wielding…" interrupts), the `x` answers it. This breaks bridge gotcha #1 ("never type ahead").
- No blocker hints: cloak over body armor, both ring hands full, two-handed weapon with a shield (Electron: `src/shared/public-blockers.js`).
- No "compare with equipped".
- No "change armor", which removes outer layers first.
- The card overlaps the message feed and truncates text (`inventory_equipment/03-04`).
- The main-hand slot says "Nothing in your pack fits here" while offering "Swap with alternate weapon".

**Fix**
- Send `w` + letter, wait for `bridge_command_prompt`, then send `x`.
- Compute blockers from `wornMask` and disable candidates with the reason.
- Dim or hide the feed while full-screen panels are open.

### 26. "Go up" on dungeon level 1 is styled as the primary action

**Severity:** medium. **Area:** UX safety.

**What's wrong**
- On dungeon level 1 the up stairs leave the dungeon and end the game.
- Yet "Go up <" is a gold primary button (`world_first_look/01`), the default row in the palette (`ui_panels/05`) and the gamepad A action (`game/input/cell_actions.gd`, `gamepad_router.gd`, `_primary`).

**Fix:** on depth 1, label it "Leave the dungeon (ends the run)", give it danger styling, and never make it primary or default.

### 27. `String.capitalize()` turns game text into Title Case

**Severity:** medium (visible everywhere). **Area:** text.

**What's wrong**
- Godot's `capitalize()` title-cases every word: "Weapon In Right Hand", "Tame, Small", "No Door", "Bare Handed Combat", and refusal toasts like "You Can't …".
- Call sites: `inventory_screen.gd` (item name, kind, state note, chips), `cell_describer.gd`, `menu_dialog.gd:266,273`, `hud.gd:74`.

**Fix:** add one `UiText.sentence_case()` helper (first letter only) and use it everywhere.

### 28. The accessibility map defeats its own purpose

**Severity:** medium. **Area:** accessibility.

**What's wrong**
- The NetHack-symbol overlay is drawn at 11 px in the corner of each cell on the terrain layer, under the actor sprites. The hero's `@` and every monster letter are hidden.
- "High contrast" draws darker boxed walls (`game/world/terrain_layer.gd`, `_draw_overlays`).
- **Evidence:** `ui_panels/04-accessibility-map.png`.
- There is no font-size control (see item 10).

**Fix**
- Draw the symbols on a layer above the actors, large and centred.
- Make high contrast brighten edges and walls.
- Add colour-blind-safe pet and peaceful rings: they are distinguished only by green and blue.

### 29. The hover inspector card never shrinks

**Severity:** medium. **Area:** HUD.

**What's wrong**
- `CellInspector.show_cell` calls `queue_free()` on the old lines and then `reset_size()` in the same frame, so the stale children still count toward the size (`game/ui/cell_inspector.gd`).
- The card grows into a large empty box, often over the hero (`travel_and_transfer/01-after-travel.png`, `combat_feedback/03-victory.png`).

**Fix:** `remove_child()` + `free()` the old lines, or call `reset_size()` deferred. Never place the card over the hero's cell.

### 30. Map framing and darkness waste the screen

**Severity:** medium. **Area:** world view.

**What's wrong**
- **Dark corridors and walls.** Remembered corridors are nearly black (`memory_brightness` 0.42 on an already dark texture). Side and bottom walls read as dark slabs (`descent/05`, `06`).
- **Overview fits the wrong thing.** It fits the full 80×21 map, so the explored part covers about 10% of the screen, and the hero has no marker (`world_view.gd:254-261`).
- **Tiny minimap.** It uses 4 px cells in a mostly empty 345×125 panel.
- **HUD covers the map.** The camera centres on the full viewport, so the feed and the action bar cover the bottom of the map.
- **Flat backdrop.** The world sits on flat black while the title and creation screens are textured.

**Fix**
- Brighten memory and corridor textures, and give side walls a lit top cap.
- Fit the overview to the explored bounds, and add a hero beacon.
- Scale the minimap to its panel.
- Clamp the camera to a HUD-safe rectangle.

### 31. Dialog shells and hints are inconsistent

**Severity:** medium. **Area:** UI consistency.

**What's wrong**
- **Three dialog shell implementations.** `ModalCard`, the hand-rolled inventory and equipment cards (each with its own `close()` and tween code), and the transfer variant of `MenuDialog`. They have different sizes, top offsets and button alignment.
- **Many back-out labels.** "Cancel Esc", "Close Esc", "Close", "Done", "Continue", and none at all (context menu, inventory popup).
- **Inconsistent key hints.** They are right-aligned in some places and inline in others, and some show raw sequences such as "#name ia" and "#adjust a" (`inventory_screen.gd:322,369`).
- **Mixed level wording.** Depth, Dlvl and "Dungeon Level" all appear. The level banner ignores the branch name ("Gnomish Mines").

**Fix**
- Make every panel a `ModalCard` variant with a shared footer and back-out row.
- Show a key hint only when it is a single classic key.
- Pick one level term and include the branch.

### 32. Menus and prompts lack modern helpers

**Severity:** medium. **Area:** dialogs.

**What's wrong**
- **Line prompt.** `LineDialog` is a bare field: no recent-message context and no hints for engrave, name or wish.
  - BIBLE asks for "suggestions where the game allows"; Electron shows the last 5 messages plus a placeholder for each prompt type (`renderer.js:4809-4838`).
  - It silently strips non-ASCII characters.
- **Item picker.** It has no search, class filter or count stepper (`question_dialog.gd`).
- **Prompts with no choices and no trailing bracket.** "Adjust letter to what [d-zA-Z] (? see used letters)?" has no `choices`, and its bracket isn't at the end of the query, so the dialog shows only Cancel.
- **Spell and skill screens.**
  - The `+` spell list says "Choose a spell to cast." even though `+` reorders spells (`menu_dialog.gd:244`).
  - The skills screen drops the Fighting/Weapon/Spellcasting group headers and clips rows: it sizes the scroll at 46 px per row while rows are 56 px (`menu_dialog.gd:62,252`).

**Fix**
- Add context and hint text to `LineDialog`, and warn about stripped characters.
- Parse a bracket anywhere in the query.
- Pass the command context into `MenuDialog`.
- Keep the skill group headers, and size the list from the real row height.

### 33. Inventory screen issues

**Severity:** medium. **Area:** inventory.

**What's wrong**
- **Detail panel ignores the search filter.** The kept selection is looked up in the whole inventory, so it shows an item the search hid (`inventory_screen.gd:203-207`, `ui_panels/08`).
- **Misleading tab.** "Food & potions" also includes scrolls.
- **Worn items have no Drop or Throw.** Enter on the wielded weapon puts it away, which is a destructive default (`game/input/item_actions.gd:27-40`).
- **Wrong "Dip" label.** "Dip something into it" sends a bare `#dip`, which then asks what to dip.
- **Text-match actions.** Item actions match English substrings ("key", "bag", "horn") instead of the bridge's `actionAffordances`, which is fragile.

**Fix**
- Search the filtered items for the kept selection, and rename or split the tab.
- Add Throw and Drop for wielded items, and make the primary action for a wielded item non-destructive.
- Fix the Dip flow or label.
- Move to affordance tokens, with text matching as a fallback.

### 34. The command palette shows wizard commands and runs the wrong one

**Severity:** medium. **Area:** palette.

**What's wrong**
- The `#` extended-command palette lists `wiz*` commands with flag `0x4` (`game/ui/dialogs/command_palette.gd:70`). The bridge doc says to hide them in normal play.
- Enter runs the first prefix-or-description match in catalog order, not an exact name match.
- The highlighted row isn't scrolled into view when you use the arrow keys.
- The `#` and `?` pseudo-entries are listed as commands, and the last row is cut off (`spells_and_skills/04`).
- The UI palette never merges the live extended-command list, which Electron does (`renderer.js:1638-1667`).

**Fix**
- Filter on `flags & 0x4`.
- Rank exact name match first, then name prefix, then description.
- Call `ensure_control_visible` on the highlighted row.
- Merge the catalog into the UI palette.

### 35. Classic-key deviations

**Severity:** medium. **Area:** input, "Classic keys are sacred".

**What's wrong**
- **Ctrl+P is replaced.** It opens Godot's history panel instead of NetHack's `^P` (`input_router.gd:45`).
- **`i` depends on timing.** It opens Godot's inventory only when the game is idle. Typed ahead, it reaches NetHack, which opens its own `i` menu (`input_router.gd:71`).
- **Esc after a count digit opens the pause menu.** At the command prompt it opens the pause menu even after a count digit, so it can't cancel a count.
- **Shift+arrow loses the run under number_pad.** `translate_direction` upper-cases a digit, which is a no-op, so the hero just steps (`input_router.gd:87`).

**Fix**
- Keep `^P` for NetHack and open history from F-keys or the HUD.
- Make `i` always open the Godot panel and queue it until the game is idle.
- Pass Esc through to NetHack when a count is pending.
- Under number_pad, send the `G` prefix plus the digit for Shift+direction.

### 36. Testing gaps against the BIBLE's own doctrine

**Severity:** medium. **Area:** tests.

**What's wrong**
- **No Godot log is kept.** `tests/run_scenario.gd` and `run.sh` don't save Godot's stdout or stderr, so `SCRIPT ERROR` and `push_error` output from a passing scenario is lost.
- **The harness answers end-of-game questions with Esc.** `scenario.gd:176-177` sends Esc to those questions, producing four "Program in disorder!" in `engine_lifecycle/events.jsonl`. This is the hazard the BIBLE documents.
- **No scenario covers** containers, shops, recovery, Esc on item prompts, throwing or zapping, window sizes other than 1920×1080, or quitting mid-game.
- **The arrival screenshot misses the transition.** `descent/03-level-2-arrival.png` and `04` are pixel-identical, so the level fade and banner the test means to show never got captured.

**Fix**
- Tee Godot's output to `test-output/<scenario>/godot.log`, and fail on `SCRIPT ERROR` or `ERROR:`.
- Answer end-of-game questions with y/n/q.
- Add scenarios for the items above.

### 37. Packaging and portability are unaddressed

**Severity:** medium. **Area:** distribution.

**What's wrong**
- **Dev-tree paths.** The playground (`game/nethack_session.gd:16`) and `util/recover` (`game/save_catalog.gd`) are resolved through `res://../..`, which doesn't exist in an exported build.
- **Linux-only code.**
  - `SaveCatalog.uid()` shells out to `id -u` every time it lists saves.
  - The extension relies on dlopen and `--wrap`.
- **Unchecked name hyphens.** `NAME_PATTERN` allows `-` in names (`save_catalog.gd:11`), but the `-uName-Role-…` spec splits on `-`. "Mary-Jane" becomes "Mary" with a junk role suffix, and Continue can't find the save.
- Electron copies its playground into user data (`electron-poc/src/main/packaged-runtime.js`).

**Fix**
- Copy the playground to `user://` on first run and ship `recover` next to the core.
- Read the uid once, through `OS`.
- Disallow `-` in names, or pass the role through options instead of the `-u` suffix.

### 38. The vision feed can leak lighting the hero doesn't know

**Severity:** medium (no-spoiler rule). **Area:** bridge (`bridge_vision`).

**What's wrong**
- For remembered cells the lit bit comes from the current `levl.lit`, not from NetHack's memory (`waslit`) (`nh-shim-bridge.c` around line 1002).
- Magic mapping and clairvoyance mark cells seen, so the real lighting of unvisited rooms leaks.
- In-sight cells lit by a carried light (`templit`) are reported dark.
- Vision is de-duplicated on depth and cells only, so a change in blindness or branch with identical cells is never re-sent.

**Fix**
- In sight, report `lit || templit`; otherwise report `waslit`.
- Include `dnum`, `dlevel` and `Blind` in the de-duplication key.

### 39. Message history is thin

**Severity:** medium. **Area:** messages.

**What's wrong**
- No copy to the clipboard.
- The opening lore isn't kept.
- yes/no and getlin questions are never logged.
- No category filters.
- The panel is a fixed 820×600 and reads "1 messages this run".
- Electron has row selection with "Copy selected", the opening chronicle, and logged prompt questions (`electron-poc/src/ux/message-presentation.js`, `src/shared/message-log.js`).

**Fix**
- Make rows selectable and copy through `DisplayServer.clipboard_set`.
- Log the intro text window and prompt queries.
- Add category filter chips, and pluralise the count properly.

### 40. The manual tab is the raw paginated Guidebook

**Severity:** medium. **Area:** help.

**What's wrong**
- Page headers ("NetHack Guidebook 15", 119 of them), justified double spaces and hyphenation splits are shown in a proportional font inside a TextEdit (`game/ui/dialogs/help_screen.gd`, `ui_panels/02`).

**Fix**
- Preprocess the asset: strip headers and form feeds, join hyphenated words, reflow paragraphs.
- Add section navigation and an "n of m" search result count.

### 41. No mouse or controller way to run, fight or enter counts

**Severity:** medium. **Area:** input parity.

**What's wrong**
- Run and fight are keyboard-only (Shift+direction, `F`). Counts are typed only, and "Rest 20s" is fixed.
- Electron has Walk/Run/Fight modes and a 1-999 count field with 5/10/20 presets (`renderer.js:9258-9331`).

**Fix**
- Add a movement-mode toggle (or modifier) for mouse and pad.
- Add a count stepper on Rest/Search and in the palette.

### 42. Art readability problems

**Severity:** medium. **Area:** art.

**What's wrong**
- Up and down stairs share the same grey shape; the up stairs' cyan tint makes them look like a fountain.
- A hero standing on stairs hides them completely.
- The newt reads as a fire salamander.
- The vertical open-door sprite reads as a broken tile.

**Fix:** regenerate under `ASSET_GENERATION.md`, and give stairs a distinct silhouette and a floor marker that stays visible under actors.

---

## Low

### 43. `stop()` leaks memory and a file descriptor per abandoned game

**Area:** C core.
- The stop and panic paths skip `freedynamicdata`, `dlb_cleanup` and the Lua teardown, so a long session leaks the heap, the Lua states and the open `nhdat` fd per abandoned game.
- **Fix:** run the same teardown on the longjmp path.

### 44. `start()` can drop a pending `game_ended`, and two cores can run at once

**Area:** extension.
- `start()` clears `end_pending` (`nethack_core.cpp:120-125`), so an ended game that hasn't been drained yet is lost.
- The `RTLD_NOLOAD` guard is per path, so two `NetHackCore` nodes (or the release and fixture cores) can run together and share cwd, env and signals.
- **Fix:** drain before start, and add a process-wide atomic "core in use" flag.

### 45. Typed-command handlers touch NetHack state off the game thread

**Area:** bridge threading (predates Godot).
- The `stdin_thread` typed-command handlers read and write NetHack globals concurrently with the game thread, and can run after `freedynamicdata` while a game ends.
- An `exit()` on any thread other than the game thread calls the real `exit` and kills Godot.
- **Fix:** marshal typed commands onto the game thread through the key queue.

### 46. Startup failures emit no `bridge_exit`

**Area:** bridge.
- The bridge's early `return 2` paths (chdir failure, fixture errors) emit no `bridge_exit`, which contradicts the doc's "Godot core: always". `game_ended` still fires with `reason:"returned"`.
- **Fix:** emit `bridge_exit` on every return path, or fix the doc.

### 47. `docs/bridge-protocol.md` disagrees with the code

**Area:** docs.
- §7.3 says Ctrl and Meta keys can't be sent, but extended mode allows 1-255 except ^C and ^Z, and §9 doesn't document that range.
- §9.3 says a left click at the command prompt always travels or moves, but an adjacent door click can open NetHack's `therecmdmenu`.
- §9.3 says clicks can't be misread (see item 16).
- **Fix:** update the doc.

### 48. Menus with more than 52 choices

**Area:** menus.
- The bridge generates `a-zA-Z` selectors and caps rows at 512.
- `MenuDialog` keys picks by selector character (`menu_dialog.gd`, `picks`), so duplicate selectors collapse: letter keys reach only the first row, and confirm sends a duplicated selector twice.
- **Fix:** key picks by row index, and warn when the row cap truncates.

### 49. The end screen leaves the game's input live underneath

**Area:** lifecycle.
- `App._on_session_ended` hides the HUD and dialogs but leaves `GameScreen` and its `InputRouter` running under the end screen.
- Tab and the mouse wheel still toggle and zoom the hidden world, and keys go to a dead session.
- **Fix:** free or disable the game screen when the end screen opens.

### 50. A restored game replays sounds and lunges

**Area:** feedback.
- On restore, `shim_putmsghistory` replays old messages as new ones (`game_state.gd`), and `AudioDirector` and `FeedbackDirector` react to them with combat sounds and lunges.
- **Fix:** flag history-restore messages and skip feedback for them.

### 51. Hex seeds are hashed, and the seed is never shown

**Area:** character creation.
- `App.normalize_seed` hashes anything that isn't a decimal, so an Electron `0x…` seed gives a different dungeon (`main.gd:67-71`).
- The effective seed (`state.seed`) is never shown, so a run can't be shared.
- **Fix:** parse hex, and show the seed in the pause menu and on the end screen.

### 52. The Spells button always shows

**Area:** HUD.
- "Spells +" shows even for heroes with no spells (`action_bar.gd:14`), and there is no Cast (Z) button.
- Electron gates its Cast button on `shim_spell_availability`.
- **Fix:** handle `shim_spell_availability` in `GameState` and gate both buttons on it.

### 53. Replay recording and a diagnostics log are missing

**Area:** tooling.
- Electron has input recordings with replay (`src/shared/recording-schema.js`, `src/main/replay-runner.js`) and per-run diagnostic folders (`src/main/diagnostic-log.js`). Godot has neither.
- **Fix:** add an opt-in JSONL dump of bridge events and sent lines under `user://diagnostics/`. This also gives a way to debug item 3.

### 54. Two Tab behaviours and a fixed wheel binding

**Area:** input.
- Tab toggles the overview, while F1 and Ctrl+± are hard-coded with no rebinding UI.
- The mouse wheel always zooms, with no option to scroll the feed instead.
- **Fix:** add a small rebinding table in Settings.

### 55. Level banner and fade timing

**Area:** HUD.
- The level banner sits on HUD layer 10 and peeks out behind modals (`ui_panels/01-02`). It also overlaps the top wall of the map (`world_first_look/02`).
- **Fix:** hide the banner while a modal is open, and anchor it below the minimap's height.

### 56. The Pw bar label overflows

**Area:** HUD.
- The Pw bar is 16 px tall with a 15 px label, while HP is 22 px (`hud.gd:112`, `stat_bar.gd`).
- **Fix:** use one height for both.

### 57. Small HUD wording issues

**Area:** HUD.
- "Rest 20s" reads as 20 seconds.
- "+1" heal floaters have no unit, so they read as XP.
- The pile-peek title is a full sentence in 14 px all-caps Cinzel ("THERE IS A STAIRCASE UP OUT OF THE DUNGEON HERE.", `pile_peek.gd`).
- **Fix:** "Rest ×20", "+1 HP", and use the sentence as body text.

### 58. Title screen

**Area:** title.
- "New adventure — Choose your hero" reads as two commands joined by a dash.
- There is no delete-save option.
- **Fix:** put the detail in a subtitle style, and add delete to `SavePicker`.

### 59. Yes/no question layout

**Area:** dialogs.
- The question is title-sized with no body text, Yes and No are left-aligned, and a redundant "Cancel Esc" sits beside No.
- The card is centred over the hero (`run_lifecycle/04`).
- **Fix:** put the question in body text, right-align the choices, drop Cancel when it equals No, and offset the card.

### 60. Settings sliders show no values

**Area:** settings.
- Neither the zoom nor the volume slider shows its value, and "Done" has no key hint.
- **Fix:** add value labels and a hint.

### 61. Inventory density

**Area:** inventory.
- Four tiny slots sit in about 780×680 px, and the gold equipped dots are never explained.
- **Fix:** use larger slots, and add a legend or tooltip.

### 62. Character creation

**Area:** creation.
- Disabled race and alignment choices only look faded, and the reason is only in a tooltip.
- The role list leaves half of its panel empty.
- **Fix:** show the reason inline, and tighten the layout.

### 63. AudioDirector reads a private field

**Area:** code smell.
- `AudioDirector._check_beams` reads `EffectLayer._beam_cells` directly.
- It also connects to `get_tree().node_added` to attach click sounds to every button in the app.
- **Fix:** have `EffectLayer` emit a `beam_started` signal, and attach UI sounds through the theme or a `UiButton` helper.

### 64. `send_equipment_change` has an unused parameter

**Area:** code smell.
- `send_equipment_change` takes a `state` parameter it never uses (`nethack_session.gd:117`).
- `ItemActions` builds its `equipment` metadata, which `_execute` then ignores except to check that it isn't empty.
- **Fix:** remove the parameter and simplify the path.

### 65. Cells are untyped dictionaries everywhere

**Area:** code smell and performance.
- Every cell is a raw event `Dictionary` read with string keys in many places (`TerrainLayer`, `TileResolver`, `CellActions`, `CellDescriber`, `ActorLayer`, `EffectLayer`), and each reader re-derives things like "explored" and "kind".
- **Fix:** add a small `CellInfo` cache (kind, cmap, explored, actor, flags) computed once in `MapModel.set_cell`. This also covers part of item 19.

### 66. Some message-feed and pause-menu behaviours lack the modern touch

**Area:** UX polish.
- The feed fades to 45% after 9 s idle even while a prompt waits.
- The pause menu has no "Return to title" or "Seed / run info".
- Status chips aren't clickable with explanations (Electron: `src/ux/status-presentation.js`).
- **Fix:** keep the feed at full opacity during prompts, add those pause-menu entries, and add chip tooltips.

---

## Already better than Electron (keep these)

- Partial stack counts in pick-up, drop and transfer menus. Electron's direct transfer only moves whole stacks.
- All classic Ctrl and Meta keys work in extended mode. Electron blocks every Ctrl key except ^D.
- Click-to-travel and position picking use NetHack's own mouse handling (`map-click`).
- Rich spell and skill rows, multiple saves with a crash-checkpoint offer, sound, a minimap with click-to-travel, and the start of controller support.
- End-of-game disclosures are answered without Esc (`EndChronicle`).
- No-spoiler handling of locked and trapped doors and of unidentified item art, apart from the lighting leak in item 38.
