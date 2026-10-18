# Godot front end review, round 12

Date: 2026-10-18. Scope: everything in `godot-poc/`, looking hardest at the round-11 fix pass:
- the container redirect: `DialogHost._loot_menu_to_screen`, `_open_redirected_container`, `open_container(chosen, from_menu)`, `open_natively`, `carried_containers`, `_native_loot_until`, and the "here, loot it?" auto-`q`;
- `ContainerScreen` for carried containers (`_carried_letter`, batches through apply, `_classic`, the container hidden from the pack column, letter toggles);
- the engine's `direct_container_common_checks` (carried containers, `direct_opened_container_id`/`direct_opened_moves` set in `use_container`), and the bridge's `floor_container_by_public_id` now also searching the pack;
- the bridge's Esc mapping in `shim_yn_function` (both modes), compared with `win/tty/topl.c`;
- `CellActions` on the hero's square, `TerrainLayer.pile_item_cell`;
- `ContainerScreen._check_batch` wording, the `QuestionDialog` default caption, the `MenuDialog` options-menu changes;
- the fixture loader (`src/allmain.c`) now allowing containers in the inventory;
- the tests `loot_redirect`, `ring_finger`, `partial_pickup`, `world_first_look` and `gray_stones`; `docs/bridge-protocol.md` and the BIBLE;
- the new shared art: five door tiles and `gray-stone`, and whether Electron uses the gray stone.

The lenses are the same as round 11:
1. Functional parity with Electron.
2. UX quality, from the code and the screenshots (27 scenarios, all PASS).
3. Architecture and correctness.

**How the findings were checked**
- This was a read-only review. Nothing was built, run or edited.
- Every finding was checked against the code. UX findings were also checked against the screenshots they name.
- Screenshots opened:
  - `loot_redirect/01`–`04`, `ring_finger/01`, `partial_pickup/02`–`04`, `gamepad_play/06`, `safety/01`;
  - `gray_stones/01`–`03`, `world_first_look/03`, `07`, `08`;
  - `locked_door/01`, `05`, `descent/01`, `06`, `containers/09`, `10`.
- The five door PNGs and `gray-stone.png` in `electron-poc/assets/tiles/generated/` were opened directly. Each is 32×32. The doors are opaque; the stone has a transparent background.
- Engine claims were checked in NetHack's source here:
  - `src/pickup.c`: `able_to_loot` 2050, `do_loot_cont` 2097, `doloot_core` 2187–2358, `reverse_loot` 2362–2440, `boh_loss` 2549–2566, `direct_container_common_checks` 2945–3033, `doshimcontainersnapshot` 3236–3266, `doshimcontainertransfer` 3270–3341, `observe_quantum_cat` 3616–3665, `use_container` 3762–4019, `in_or_out_menu` 4189–4291;
  - `src/apply.c:4219-4277`, `src/mkobj.c:321-336` and `1010-1021`, `src/objnam.c:999` and `2388-2400`;
  - `src/cmd.c` (`yn_function` 5536–5648), `win/tty/topl.c:366-475`, `src/invent.c:3950-4000`, `src/o_init.c:1000-1020`, `src/insight.c:3040`, `src/options.c:8922`, `include/prop.h:117-121`, `include/obj.h:337-340`.
- Bridge claims were checked in `electron-poc/shim-bridge/nh-shim-bridge.c`, against `git diff` for what is new. Electron's side was checked in `electron-poc/src/renderer.js`, `src/shared/interaction-model.js`, `src/shared/tile-assets.js` and `src/shared/map-presentation.js`.
- File times:
  - Sources: `src/pickup.c` 00:05:32, `src/allmain.c` 00:06:59, the bridge source 00:14:03.
  - Builds: `libnethack_core.so` 00:15:56, the fixture core 00:16:25, Electron's `nh-shim-bridge` 00:18:56.
  - Art: shared tiles installed 00:19:26–27, Godot's tiles synced 00:19:41–00:20:00.
  - The full run went from 00:21:37 to 00:27:24. No `.gd` file is newer than it, so every screenshot shows the code reviewed here.
  - `zz_perf_probe` is a stale folder from 10-17 and not part of the run.
- Paths are relative to `godot-poc/project/` unless they start with `electron-poc/`, `src/`, `win/`, `include/`, `docs/` or `BIBLE.md`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 1 high, 2 medium, 9 low (12 in total).

The most serious problems:
- When the hero is confused (or engulfed and applying a bag), opening a container makes Godot throw away the menu NetHack offered and run `#loot` or apply a second time. That doubles NetHack's random confusion effects, turn costs and a cursed bag's losses. With two different containers on the square it loops (H1).
- A cursed bag of holding's losses are rolled again for every multi-item move the screen makes. A re-open in the same or next turn skips the roll altogether (M1).

---

## Round-11 verification

- **M1 ("Program in disorder" at the ring-finger question): fixed.**
  - The bridge maps Esc as tty does, in both modes: `q` if offered, else `n`, else the default (`nh-shim-bridge.c:3902-3909`, `win/tty/topl.c:464-470`).
  - `ring_finger/01` shows "Right hand r", "Left hand l" and a focused "Cancel Esc".
  - The event log has `bridge_command` 27, then `bridge_prompt_answer` keycode 0 (`test-output/ring_finger/events.jsonl:133-134`). `P` ends quietly, as in tty (`src/do_wear.c:2282-2286`).
  - Questions with empty choices (`getobj`) are unchanged: `resp && *resp` is false, so Esc still reaches NetHack raw. `QuestionDialog._cancel` sends 27 in item mode (`ui/dialogs/question_dialog.gd:250-251`).
  - One difference from tty remains: when the choices hold a hidden Esc (`"ynq\033a"`, the traditional-menu `I` and `` ` `` prompts), the bridge returns Esc raw, while tty still maps it. Under full menus, which Godot forces, only `src/insight.c:3040` can reach this, and the end chronicle never answers it with Esc.
  - The side effects are in L6 and L8.
- **L1 (`q` blamed on NetHack): fixed.** `partial_pickup/04` reads "0 of 2 moved. You chose to leave a +0 splint mail. You stopped there; 1 more left." `03` reads "You chose to leave 2 × +0 splint mail."
- **L2 (stale object layer on the action bar): fixed.** On the hero's square `CellActions` reads only the pile snapshot (`input/cell_actions.gd:28-37`). `gray_stones/02` offers "Pick up ," right after the drop.
- **L3 (the hero-square path untested): fixed.** `world_first_look` compares `pile_item_cell(pile[0])` with the corpse beside the hero (`tests/scenarios/world_first_look.gd:86-95`), and the full run used the current code.
- **L4 (gray stones drawn as a rainbow gem): fixed in Godot.** `gray_stones/01` and `03` show four identical dull pebbles. Two loose ends remain: the test still accepts the gem fallback (L7), and Electron still draws a gem (L4).
- **L5 (two buttons looked selected): fixed.** The default answer has a warm fill and a small "default" caption. Gold is used only for focus (`gamepad_play/06`, `partial_pickup/02`, `containers/09`).
- **L6 ("Select all" in the options menu): fixed.** `ui/dialogs/menu_dialog.gd:51-56` and `105-107`. `safety/01` has no "Select all" and shows the new hint.
- **L7 (docs): mostly fixed.**
  - The Object-layer staleness rule is in (`docs/bridge-protocol.md:334-340`), and §9.6 covers the hallucinating worm tail.
  - §3.14 and some older Esc advice are stale (L9).
- **Container redirect, the cases that work:**
  - `#loot` typed on a box and apply on a carried sack both open the screen without NetHack's menu (`loot_redirect/01`, `03`).
  - The sack is not listed in its own pack column (`ui/dialogs/container_screen.gd:141-142`), and its letter doesn't toggle it (`:473`).
  - Two identical containers on the square: the redirect declines (`ui/dialog_host.gd:385-386`) and NetHack's menu shows.
  - A container on the square and a carried one with the same name: "your" picks the right pool (`:381-383`). The engine searches the floor first, then the pack, and ids are unique.
  - The static `direct_opened_*` variables aren't saved, and every game gets a fresh `dlopen` (Godot) or a fresh process (Electron), so restoring a save can't carry a stale window.
- **Turn cost compared with tty:**
  - The redirect itself costs what tty costs: 0 when the contents are known; 1 when the snapshot learns them (like tty's `:` look); 1 for the cat or a loss in a shop.
  - Each separate move afterwards is its own turn. tty can mix in and out in one session for one turn. In `loot_redirect/04` the clock reads T3 after one item in and one batch out; tty's `b`/`r` would give T2.
  - This is the round-6 design, so it isn't counted here. It does feed M1.

---

## High

### H1. Confused or engulfed: one open runs NetHack's `#loot` or apply twice, and two containers loop

**Area:** `DialogHost._open_redirected_container` / `open_container` refusal path, engine `direct_container_common_checks`.

How it happens:
1. The player opens a container. NetHack's `#loot` or apply opens it, which runs `use_container` with the cat, the bag's losses and the confusion effects. Godot answers "do nothing" at "Do what with…?" (`ui/dialog_host.gd:373-396`).
2. Godot then asks the direct path for a snapshot. The engine refuses any confused hero before anything else (`src/pickup.c:2963-2966`). It also refuses a carried container while the hero is engulfed or buried (`:2967-2970`, checked before the floor/pack branch).
3. A refusal after a redirect sets `_native_loot_until` and runs `#loot` or apply again (`ui/dialog_host.gd:472-486`). NetHack's whole command runs a second time.

Why that is wrong:
- Confused `#loot` is random before any container is touched (`src/pickup.c:2211-2217`):
  - 5 in 6 times it tries `reverse_loot`, which can drop part of the hero's gold ("Ok, now there is loot here.", `:2380-2397`) or "find old loot".
  - Then, half the time, "Being confused, you find nothing to loot." costs a turn.
- Godot discards the menu NetHack had already offered and rolls all of that again.
- Nothing after `use_container` depends on confusion: `in_container` and `out_container` have no confusion rule. So the refusal protects nothing once NetHack has opened the box.
- `_native_loot_until` is cleared by the next menu of any kind (`ui/dialog_host.gd:374-376`). With two containers on the square, NetHack's "Loot which containers?" menu (`src/pickup.c:2267`) clears it. The following "Do what with…?" is redirected again, refused again, and `#loot` runs again.
- Electron shows NetHack's menu directly, so it has none of this.

**Failure scenarios:**
- A confused Valkyrie with gold stands on a large box and types `#loot`. NetHack passes its confusion rolls and offers the box. Godot closes that menu and sends `#loot` again. This time NetHack says "Being confused, you find nothing to loot." (another turn) or drops some of her gold. She never gets the menu NetHack had already opened.
- The same hero on a large box and a chest: pick the box, the menu is redirected, refused, "Loot which containers?" again, and so on. Every round is another full confused `#loot`, until the confusion wears off or NetHack happens to say it found nothing.
- Engulfed, the hero applies a carried cursed bag of holding. `use_container` rolls the losses twice (`src/pickup.c:3818-3826`).

**Fix:**
- In the engine, when `just_opened` holds, skip the `Confusion` refusal. NetHack's own command already applied the confusion part. Also accept a carried container while engulfed or buried, as `use_container` does.
- In Godot, never re-run NetHack's command after a redirect. If the direct path still refuses, say so in the feed with NetHack's reason, and leave the next `#loot` to show NetHack's own menu.
- Add a confused-hero fixture field and a scenario: confused `#loot` on a box, and on a box plus a chest. Assert exactly one `#loot` per open.

---

## Medium

### M1. A cursed bag of holding: losses rolled again by every batch, and skipped on a quick re-open

**Area:** engine `direct_opened_*` window, `ContainerScreen._batch`, `InputRouter.run_cell_action("loot")`.

- `use_container` rolls a cursed bag's losses each time it runs (`src/pickup.c:3818-3826`). One tty `#loot` or apply session is one roll, however many items move.
- The screen's batches re-enter `use_container`: two or more stacks in one direction run `#loot\n` or `a` plus the bag's letter, then NetHack's menus (`ui/dialogs/container_screen.gd:267-289`). Each batch is a new roll.
- The engine accepts the bag for "this turn or the last": `svm.moves - direct_opened_moves <= 1` (`src/pickup.c:3005-3006`, `:3027`). That window has two side effects:
  - **Skipped roll.** "Open container" on the action bar, context menu or pad calls `open_container()`, which asks for a snapshot directly when one container lies here (`input/input_router.gd:622-623`, `ui/dialog_host.gd:445-457`). Inside the window that is accepted without `use_container`, so no roll. In tty a second `#loot` rolls again.
  - **Window ends mid-screen.** After two single moves (one turn each) the window has passed. The third double-click is refused: "That one needs NetHack's own menu: use Partial stacks…" (`container_screen.gd:435-436`). A slow or burdened hero, who gets fewer actions per turn, can hit this after one move.
- Outside shops `boh_loss` returns 0 even when items vanish, because it returns only the shop price (`src/pickup.c:2549-2566`, `:3596-3611`). So the redirect runs, and these paths are reached, in ordinary play.
- The window lives in shared engine code without a gate, so Electron's direct container commands get it too.

**Failure scenarios:**
- The hero carries a cursed bag of holding with six items and applies it. One roll, and the screen opens. She selects three potions and presses "Take out 3". That is apply again, a second roll, and "The potion of gain level has vanished!" In tty the same three items come out of one session with one roll.
- A floor cursed bag: `#loot` (one roll), close the screen, then click "Open container" in the same turn. The screen opens again with no roll.

**Fix:**
- Replace the moves window with a session token. The engine accepts the opened container until the next command that isn't a direct container command, then clears it.
- Give the engine a multi-item direct transfer: one command, one turn, the way `menu_loot` moves the lot. Batches then never re-enter `use_container`. This also fixes M2's batches.
- Until then, the smallest fix is for the screen to move a magic bag's stacks with single direct transfers while the token holds.
- Add a fixture beatitude for containers (L7) and a scenario that counts loss rolls.

### M2. Two or more containers on the square: "Take all" and multi-moves fail, and "Partial stacks…" reopens the same screen

**Area:** `ContainerScreen._batch`, `ContainerScreen._classic`, `DialogHost._loot_menu_to_screen`.

- With more than one container here, `#loot` first asks "Loot which containers?", a pick-any menu (`src/pickup.c:2245-2280`).
- **Batches fail.**
  - A floor batch sends `#loot\n` and expects "Do what with…?" next (`ui/dialogs/container_screen.gd:276-281`; the comment says "with one container here").
  - The first menu step looks for "take something out" in the container list. `_pick_rows` finds nothing and returns "", so the sequence ends and sends Esc (`input/input_router.gd:472-477`, `512-551`).
  - The status reads "NetHack didn't move those as asked: use Partial stacks…".
- **"Partial stacks…" loops.**
  - `_classic` sets `_native_loot_until` and runs `#loot` (`container_screen.gd:448-454`).
  - The first menu, "Loot which containers?", clears the flag (`ui/dialog_host.gd:374-376`).
  - The player picks the box. Its "Do what with the large box?" is redirected (`:377-396`), and the same screen opens again.
- So on such a square only one-at-a-time double-clicks work. NetHack's own take-out menu, the only way to split a stack, can't be reached.

**Failure scenario:** the hero stands on a large box and a chest and opens the box. "Take all" fails with the Partial-stacks hint. "Partial stacks…" asks which container, then shows the same two-pane screen again.

**Fix:**
- Consume the native flag only on a matching "Do what with…?" menu. Clear it at the next command prompt instead of after 15 seconds.
- Give container batches an optional first step that picks the container's row in "Loot which containers?" by `objectId`. The bridge sends `objectId` on object menu rows (protocol §3.8; picking by id has worked since round 6).
- Add a box-and-chest fixture to `loot_redirect`.

---

## Low

### L1. Schroedinger's box, and a cursed bag after a shop loss, still show NetHack's menu

**Area:** `DialogHost._loot_menu_to_screen`, engine `just_opened`.

- When `use_container` has already spent the turn, the quit row reads "done", not "do nothing" (`src/pickup.c:3883-3886`, `4252`). That happens for Schroedinger's cat (`:3813-3816`) and for a cursed bag that lost shop goods (`:3821-3826`).
- Godot looks only for "do nothing" (`ui/dialog_host.gd:388-392`). It finds no row, so NetHack's own menu shows.
- The engine's Schroedinger exception (`src/pickup.c:3023`) is dead code. `observe_quantum_cat` sets `spe = 0`, so the box is no longer a Schroedinger box once it's open (`:3655`, `:3665`).
- The BIBLE says these cases get the screen (`BIBLE.md:220`).
- **Failure scenario:** the hero `#loot`s the Schroedinger box. The cat message appears, then NetHack's "Do what with the large box?" menu rather than the screen.
- **Fix:**
  - Match "done" as well, or take the last row's `q` selector.
  - Drop the dead Schroedinger clause, or keep it with a comment that says why.
  - Correct the BIBLE line.

### L2. Named or #called floor containers never get the screen from `#loot`

**Area:** `DialogHost._loot_menu_to_screen`, bridge `emit_public_ground_display_name`.

- NetHack's prompt carries the individual name: `yname` → `xname` adds " named …" (`src/objnam.c:999`, `2388-2400`). So the prompt reads "Do what with the large box named stash?".
- The pile snapshot names a floor container by its base type only: "a large box" (`nh-shim-bridge.c:3126-3137`).
- `contains("large box named stash")` matches nothing, so NetHack's menu shows. A bag `#call`ed "holding" ("bag called holding") behaves the same.
- Carried containers work, because their inventory text includes the name.
- **Failure scenario:** the player names her stash box and types `#loot` on it. She gets NetHack's menu every time.
- **Fix:** match on the base type after stripping " named …" and " called …", or have the bridge send the container's `objectId` with the "Do what with…?" menu.

### L3. Picking several containers in "Loot which containers?" opens only the first

**Area:** `DialogHost._loot_menu_to_screen`.

- Godot answers "do nothing" (`q`). For the first container that sets `abort_looting`, and `doloot_core` returns before the next one (`src/pickup.c:3919-3920`, `2272-2278`).
- **Failure scenario:** the player ticks the box and the chest. The box's screen opens. Closing it does nothing more, while tty would go on to the chest.
- **Fix:** remember the remaining picks and open the next screen when the first closes, or answer "loot next container" and redirect each one in turn.

### L4. Electron still draws unidentified gray stones as a cut gem

**Area:** `electron-poc/src/shared/tile-assets.js` (shared tileset parity).

- For an unidentified `*` object, Electron appends the class noun ("gray stone" becomes "gray stone gem", `:160`, `:181-186`). It looks up the slug `gray-stone-gem`, finds nothing, and falls back to `gem-class-icon` (`:246-272`, `:162`).
- Nothing maps "gray stone" to the new `gray-stone` asset. It is in the manifest under `objects-inventory` but not in `tile-map.json`.
- Godot special-cases it (`world/tile_resolver.gd:319-322`).
- **Fix:** in `publicAppearanceAssetId`, map `*` with "gray stone" or "grey stone" to `gray-stone` when the asset exists, and extend `map-presentation-asset-policy-test.js`.

### L5. Two of the five new door tiles are drawn nowhere, and the closed door looks pasted into side walls

**Area:** art, `world/terrain_layer.gd:315-333`, `world/terrain.gd:20-25`.

- Godot draws only `closed-door` and the two open doors. Doorways and broken doors render as floor gaps (`world_first_look/03`, `descent/01`).
- Electron draws every door glyph with CSS (`electron-poc/src/shared/map-presentation.js:12-16`, BIBLE line 197).
- So `broken-door.png` and `no-door-doorway.png` appear on neither map, although the BIBLE lists them as part of the new family (`BIBLE.md:225`).
- Each door tile carries its own light-gray brick frame. In a side wall, which Godot draws as a thin dark strip, the closed door is a bright square between dark wall cells (`descent/06`, the door east of the hero). It still reads as a door.
- **Fix:**
  - Say in the BIBLE that only closed and open doors are used, or use the doorway art.
  - Ask Greg whether side-wall doors need a frame that matches the side walls.

### L6. Electron's cancel bookkeeping still expects keycode 27

**Area:** Electron parity (the bridge's Esc mapping applies in both modes).

- At "[rl]" Electron's cancel plan sends Esc, because the choices are neither fixed nor yes/no (`electron-poc/src/shared/interaction-model.js:52-61`, `301-313`). The bridge now answers keycode 0.
- The renderer rejects keycode 0 (`keycode > 0`, `electron-poc/src/renderer.js:7634-7636`) and logs `prompt.cancellation.acknowledgement-mismatch` (`:7676-7697`).
- Its "answered with Esc" cleanup also keys on 27 (`:7932-7933`), so `clearPromptOwnerState({clearWorkflow:true})` doesn't run.
- Before this change the same cancel printed "Program in disorder", so this is still a net improvement.
- **Fix:** treat a keycode 0 or a mapped `q`/`n` that follows an Esc send as the Esc acknowledgement, or have the bridge add `"cancelled":true` to `bridge_prompt_answer` when it mapped Esc.

### L7. Fixture and test gaps around the new container paths

**Area:** `src/allmain.c` fixture loader, `tests/scenarios/gray_stones.gd`.

- **Random contents.** Carried containers are made with `mksobj(type, TRUE, FALSE)` (`src/allmain.c:3624`, `3756`). For a carried large box, chest, ice box or bag of holding, initialization adds NetHack's own random contents (`src/mkobj.c:1010-1021`, `321-336`) on top of the fixture's list. Sacks start empty only because `moves <= 1`.
- **No cursed containers.** Containers reject `beatitude` (`src/allmain.c:1747-1750`) and always start `cknown` (`:3633`). No fixture can make a cursed bag, a Schroedinger box or a confused hero, which are the cases M1, H1 and L1 depend on.
- **Gem fallback.** `gray_stones` still accepts `gem-class-icon` when `gray-stone` is missing (`gray_stones.gd:15`), which round 11 asked to remove.
- **Fix:**
  - Create inventory containers with `init` off, or clear `cobj` before adding the fixture's contents.
  - Allow `beatitude` on containers and add a confusion field.
  - Require `gray-stone` in the test.

### L8. A keycode-0 answer makes Godot log Unicode errors, and the runner doesn't notice

**Area:** `state/game_state.gd:292-293`, `tests/run.sh:65`.

- `question_answered.emit(_last_question, char(int(keycode)))` builds `char(0)` for the new 0 answer.
- `ring_finger/godot.log` has exactly two "Unicode parsing error … Unexpected NUL character" lines, one for each 0 answer (Enter and Esc). No other scenario log has one.
- `run.sh` only flags lines that start with `ERROR:` or `SCRIPT ERROR`, so the scenario passes.
- **Fix:**
  - Emit "" for keycode 0.
  - Add "Unicode parsing error" to the patterns `run.sh` checks for.

### L9. Stale docs and comments

**Area:** `docs/bridge-protocol.md`, `BIBLE.md`, code comments.

- **§3.14** (`docs/bridge-protocol.md:946-964`) still says snapshots follow a transfer "if the container is on the hero's square" and that "the container must be on the hero's square". Carried containers now get both (`nh-shim-bridge.c:3224-3233`, `1923-1924`).
- **Old Esc advice:**
  - `docs/bridge-protocol.md:1586-1587` says Esc at end-of-game questions triggers "Program in disorder", and `:1611-1612` says not to cancel yes/no questions with Esc. Both are obsolete now that the bridge maps Esc.
  - `BIBLE.md:56` repeats the end-of-game hazard.
  - §4.2 says "as tty" without the hidden-Esc exception noted in the verification above.
- **BIBLE line 220** says the action bar's open goes through NetHack ("NetHack still opens it"). It sends a direct snapshot (M1), and Schroedinger's box doesn't get the screen (L1).
- **Code comments:**
  - `ui/dialog_host.gd:363-367` still says carried containers keep NetHack's menu.
  - The "here, loot it?" auto-`q` (`:175-178`) is dead code: NetHack 3.7's `#loot` has no such question (`src/pickup.c:2245-2295`).
  - `ui/dialogs/container_screen.gd:349` says a twice-declined item "is counted once", but the code groups it as "2 ×".
  - `QuestionDialog._cancel`'s comment (`:245-248`) still describes Esc as harmful.
- **Fix:** update these sections and comments, and delete the dead branch.

---

## Already better than Electron (keep these)

- Rounds 1 to 11's lists still hold.
- `#loot` typed, Alt-L, the palette and applying a carried bag all open the two-pane screen (`loot_redirect/01`, `03`). Electron shows NetHack's raw menu.
- Carried containers get the same screen, and the bag is left out of its own pack column.
- Several stacks move through NetHack's own `#loot` or apply menus in one turn, with the rows picked by id and no menu flashing up (`loot_redirect/04`).
- Esc or Enter at "Which ring-finger?" backs out quietly in both front ends. Godot also labels the hands and focuses Cancel (`ring_finger/01`).
- NetHack's default answer is marked with a fill and a caption, without borrowing the focus style (`gamepad_play/06`, `partial_pickup/02`).
- Unidentified gray stones are a dull pebble everywhere: pack, detail panel, floor and under the hero. Electron shows a cut gem (L4).
- After a stopped or partial pickup, the floor screen says in plain words what moved, what the player left and that they stopped (`partial_pickup/03`, `04`).
- The options menu has no "Select all", and its hint explains what picking an option does (`safety/01`).

---

## Status after the fix pass (2026-10-18)

The container redirect was reworked around one rule: Godot never makes NetHack open a container a second time.

- **H1:**
  - **Engine.** The moves window is replaced by an open session. `use_container` records each container it opens (up to 8). A hook before every command in `rhack` (`direct_container_note_command`, `src/cmd.c`) clears the record at the hero's next command that isn't a direct container command.
  - Inside the session, the direct commands accept the container even when the hero is confused, and accept a cursed magic bag. Confusion is now checked only for containers NetHack hasn't opened. Engulfed or buried heroes are refused only for floor containers.
  - **Godot.** `open_container(box, from_menu=true)` never sends `#loot` or apply again. If the bridge refuses after NetHack has opened the container, the feed says why, and the next open shows NetHack's own menu (`want_native_loot`).
  - New `container_cases` scenario (part 2), with a `confused` hero fixture field: a confused `#loot` runs once (one `bridge_extcmd_answer`) and the screen opens.
- **M1:**
  - A new `moreItemIds` on `container-transfer` moves up to 53 stacks in one command and one turn (engine `container_transfer_add_item`, bridge `json_direct_uint_array_field`). Items that can't move are skipped, and the reason reads "2 of 3 moved; <why>".
  - `ContainerScreen` sends container batches this way. The `#loot` and apply batch path is gone, so a cursed bag is opened, and its losses rolled, once per open.
  - The action bar's Open still asks for a direct snapshot. A cursed bag that NetHack hasn't opened is refused, so NetHack's own open runs; there is no skipped roll.
  - `container_cases` part 3 (a carried cursed bag of holding, not known to be cursed): one apply, then three stacks out in one transfer, with exactly one apply prompt.
  - `containers` now asserts one transfer per batch and no `#loot`.
- **M2:**
  - Floor batches no longer go through NetHack's container menus.
  - The native-menu flag (`_native_loot`) is used up only by a matching "Do what with…?" menu, and is cleared when NetHack comes back to the command prompt after showing something.
  - `container_cases` part 1 (a box and a chest): NetHack's "Loot which containers?", then the box's screen, then "Take all" as one transfer in one turn. "Partial stacks…" then shows NetHack's own "Loot which containers?" and "Do what with the large box?", not the screen again.
- **L1:** the "done" row is accepted as well as "do nothing". The engine's Schroedinger clause is kept, with a comment saying why it no longer applies once the box is open.
- **L2:** " named …" and " called …" are stripped from the prompt's container name.
- **L3:** with several containers picked, Godot answers "next container" when it is offered. Each container's screen opens after the previous one closes.
- **L4:** Electron's `publicAppearanceAssetId` maps an unidentified `*` "gray stone" or "gray" to `gray-stone`. `map-presentation-asset-policy-test.js` has three new assertions (44 pass).
- **L5:** the BIBLE says which door tiles each front end uses. Whether side-wall doors need a frame that matches the side walls is a question for Greg.
- **L6:** when the bridge maps Esc, `bridge_prompt_answer` carries `"cancelled":true`. Electron's renderer treats that as the Esc acknowledgement in both places.
- **L7:**
  - Fixture containers are created without NetHack's random contents.
  - Containers accept `beatitude` and `beatitudeKnown`.
  - The hero has a `confused` field.
  - `gray_stones` requires the gray-stone art: the tile exists, so the test resolves to it.
- **L8:** keycode 0 emits an empty answer, not `char(0)`. `tests/run.sh` now fails on "Unicode parsing error".
- **L9:**
  - `docs/bridge-protocol.md` is updated: §3.14, the DYWYPI and yes/no Esc advice, §4.2 (with `cancelled` and the hidden-Esc case), and the container-snapshot and transfer sections (carried containers, the open session, `moreItemIds`).
  - The BIBLE's Esc gotcha and decision-log lines are corrected.
  - The stale comments are fixed, and the dead "here, loot it?" branch is removed.
- Electron's direct-container shim tests pass against the rebuilt shim, given a character and line-buffered stdout.
