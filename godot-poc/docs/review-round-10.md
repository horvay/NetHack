# Godot front end review, round 10

Date: 2026-10-17. Scope: everything in `godot-poc/` after the round-9 fix pass, looking hardest at the round-9 changes:
- `sys/libnh/libnhmain.c`: the new `-no-nethackrc` / `-nethackrc=FILE` handling (placement against `early_init` and `initoptions`, interaction with `process_options`, effect on Electron);
- `nh-shim-bridge.c`: `godot_menu_style_checked` (once per game, reset per `dlopen`, Electron's stream), and the removed `rest_on_space` write;
- `DialogHost`: `_suspended`, `_reveal_pending`, `_reveal_transfer_screen`, the single `will_answer` call in `_on_request`, and `open_ground` / `open_container` hiding the pile peek;
- `ContainerScreen`: declined-question tracking and `_check_batch` wording; `GameState.question_answered`, `_config_error`, `start_options`; `GameScreen.begin`; `Settings.nethack_options` extra-option filtering;
- the scenarios `safety` (hostile rc with `pettype:none`, `#optionsfull` toggles), `partial_pickup`, `ui_panels` (slider) and `descent`.

The lenses are the same as round 9:
1. Functional parity with Electron.
2. UX quality, from the UI code and the screenshots of the full run (22 scenarios, all PASS; `descent` re-run separately afterwards, PASS). The only source file newer than the run is `tests/scenarios/descent.gd`, which matches its re-run.
3. Architecture and correctness.

**How the findings were checked**
- Read-only review. Nothing was built or run.
- Every finding was checked against the code. UX findings were also checked against the screenshots named in them.
- Engine claims were checked in NetHack's source in this repository:
  - `sys/libnh/libnhmain.c` (`nhmain`, `process_options`), `src/earlyarg.c` (`-no-nethackrc`), `src/cfgfiles.c` (`rcfile`, `config_error_init`, `config_erradd`, `config_error_done`), `src/options.c` (`parseoptions`, `duplicate_opt_detection`, `initoptions_finish`), `include/optlist.h`.
  - `src/cmd.c` (`yn_function`, `update_rest_on_space`, `reset_commands`), `include/hack.h` (`ynq`), `src/engrave.c` (adding to an engraving), `src/shk.c` (`dopay`), `src/pickup.c` (`lift_object`), `src/restore.c` (`restgamestate`).
- The built cores were checked read-only with `strings` and `nm`: both contain the new switch strings, and `godot_menu_style_checked` is a `.bss` variable (fresh on every `dlopen`).
- Bridge claims were checked in `electron-poc/shim-bridge/nh-shim-bridge.c`, `extension/src/nethack_core.cpp` and `electron-poc/src/main/launch-policy.js`. Event logs: `test-output/*/events.jsonl` (every `shim_yn_function` query in the run), `test-output/safety/godot.log`, `test-output/descent/godot.log`.
- Paths are relative to `godot-poc/project/` unless they start with `electron-poc/`, `extension/`, `src/`, `sys/`, `include/`, `docs/` or `BIBLE.md`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 0 high, 1 medium, 4 low (5 in total).

The most serious problem:
- Enter on a NetHack yes/no question never gives NetHack's default answer, because the bridge never sends the default. Godot's Enter answers "No" instead. On "Do you want to add to the current engraving?" (default Yes), one Enter wipes a dust Elbereth on the spot. Round 3 believed this was fixed; it never worked (M1).

---

## Round-9 verification

- **H1 (`-no-nethackrc` ignored): fixed.**
  - The switch is handled after `early_init` (which resets `gc`) and before `initoptions` (`sys/libnh/libnhmain.c:184-199`), as `src/earlyarg.c:268-279` does for tty. `rcfile` then reads `/dev/null` and still applies NETHACKOPTIONS as extra options (`src/cfgfiles.c:1928-1933,1962-1973`).
  - `process_options` still sees the switch and its `-n` case turns the news off (`libnhmain.c:389`). That is harmless: no `news` file ships in the playground.
  - Electron passes only the player spec (`electron-poc/src/main/launch-policy.js:92-93`), so it never reaches this code.
  - `safety` can now fail: the hostile rc carries `pettype:none`, and the scenario checks that the kitten is there (`tests/scenarios/safety.gd:18-30`). It passed.
- **M1 (rest_on_space stuck after `O`): fixed.**
  - The bridge sets full menus once, at the first `nh_poskey` (`nh-shim-bridge.c:3624-3634`), gated on extended mode. The flag lives in `.bss`, and the extension checks that the core really unloads between games (`extension/src/nethack_core.cpp:274-279,335-339`), so the check resets per game.
  - The `rest_on_space` write and `NH_GODOT_REST_ON_SPACE` are gone everywhere.
  - One mismatch remains but is vanilla NetHack. If a save's `rest_on_space` differs from the starting option, `O` shows the save's value while Space follows the starting option, because restoring reads `flags` (`src/restore.c:578-579`) and nothing rebinds Space. tty does the same, so this is not raised.
- **L1 (screen flashes between questions): fixed.**
  - After an answer, the screen takes the input back hidden (`ui/dialog_host.gd:134-147`). It shows on the command prompt or on a request the router answers (`:158-160`).
  - `will_answer` is called once (`:158`). That matters because it clears `_typed_extcmd` (`input/input_router.gd:568-570`).
  - `DialogHost` connects to `request_changed` before the sequence engine does (`game_screen.gd:52,55`, `input_router.gd:453`). So `will_answer` sees a step before it is used.
  - No test asserts the no-flash behaviour (L3).
- **L2 ("why the rest didn't move"): fixed for the tested case.** `partial_pickup/03-after-partial-pickup.png` reads "2 of 4 moved. You chose to leave 2: you have much trouble lifting a +0 splint mail." Other cases are covered in L2 below.
- **L3 (stale pile peek): fixed.** `dialog_host.gd:409,427`. `ui_panels/15-pile-peek-floor-screen.png` shows no peek beside the floor screen, and `partial_pickup` asserts it.
- **L4 (extra-option edge cases): partly fixed.**
  - The `OPTIONS=` prefix is stripped and the owned options are filtered (`game/settings.gd:133-140`).
  - The config-error notice matches NetHack's real output: `" * …"` lines and "N errors in NETHACKOPTIONS." (`src/cfgfiles.c:1605-1606,1630`, `state/game_state.gd:436-440`).
  - However, the premise that Godot's later options win is backwards. NetHack applies the string right to left (L1). Round 9's own L4 example ("the last one wins") had the same mistake.
- **L5 (slider at 100% in the 150% shot): fixed.** `ui_panels.gd:77` sets the slider's `value`, which fires its callback. `05-settings-150.png` shows "150%" on a card drawn at 150%.
- **Descent:** the re-run passed. The click check beside the feed was skipped again ("no explored square beside the line"). That item was left on purpose and is not raised again.

---

## Medium

### M1. Enter on NetHack's questions answers "No", never NetHack's default; on an engraving it wipes Elbereth

**Area:** classic keyboard flows, `QuestionDialog`, bridge `shim_yn_function`.

- In tty, Enter and Space at a `yn_function` question give the caller's default (`def`), and the prompt shows it as "(q)". `src/cmd.c:5536-` passes the bare query to the window port. The tty port adds the `[ynq] (q)` text itself.
- The bridge reads `def` (`electron-poc/shim-bridge/nh-shim-bridge.c:3856`) and uses it only when it receives `\n` or a space itself (`:3880`). It never sends `def` to the client (`:3873`).
  - Every `shim_yn_function` in this run's event logs confirms this: no event has a default field, and no query ends in "(x)" (for example `"You have much trouble lifting a +0 splint mail.  Continue?","choices":"ynq"`).
- `QuestionDialog` looks for the default only in the query text (`ui/dialogs/question_dialog.gd:74-77`), so `default_choice` is always empty.
  - The starting focus therefore falls to the "No" button (`:144-145,48-51`), as in `partial_pickup/02-lifting-question.png`.
  - Enter presses the focused button (`:258-260`), which answers `n`.
  - Space goes to NetHack as `' '` (`:263-273`), and the bridge turns that into the real default. **Space and Enter give different answers to the same question.**
- Where NetHack's default is not `n`, the result differs from tty:
  - "Do you want to add to the current engraving?" `[ynq] (y)` (`src/engrave.c:1142-1143`). tty's Enter adds to the engraving. Godot's Enter answers `n`, and a dust, blood or mark engraving is deleted at once: "You wipe out the message that was written in the dust here." (`src/engrave.c:1150-1165`). A dust Elbereth is gone after one keypress.
  - `m p`: "Itemized billing?" `[ynq m] (q)` (`src/shk.c:2121-2122`). tty's Enter means "not now". Godot's Enter presses `n`, which the dialog labels "Pay for everything" (`question_dialog.gd:63-64`) and which pays the whole bill.
  - Every `ynq()` (default `q`, `include/hack.h:1338`): lock, pickup, wield, trap and other questions. Here `n` and `q` usually both decline, but `n` moves on (to the next item or container) where `q` stops. For example, "Continue?" during a pickup: `n` skips this item and keeps asking, while `q` ends the pickup (`src/pickup.c:1786-1792`).
- Round 3 recorded the opposite: "a yes/no question starts on NetHack's default answer, as Enter does in tty". The comment at `question_dialog.gd:48` says so too. The default-answer styling (`:141-143`) never appears.
- **Fix:**
  - In the bridge, add the default to the opened `shim_yn_function` event in extended mode only (`"default":"q"` when `def` is non-zero, at `nh-shim-bridge.c:3873`). Electron's stream stays byte-identical.
  - Pass it through `GameState._open_question` (`state/game_state.gd:418-419`). Have `QuestionDialog` prefer `request.default` and keep the text parse as a fallback. The existing focus and styling code then does the rest.
  - Add the field to `docs/bridge-protocol.md` §9.
  - Test: engrave in the dust, engrave again on the same square, press Enter at "add to the current engraving?". Assert there is no "wipe out" line, and that the Yes button is marked in the screenshot.

---

## Low

### L1. Extra NetHack options: NetHack applies the string right to left, so the player's text wins and "no…" forms get past the filter

**Area:** `Settings.nethack_options`, `NetHackSession.start_game` (round-9 L4).

- `parseoptions` takes a comma-separated list "in right to left order". It splits off the first element and parses the rest first (`src/options.c:507-521`). The **leftmost** setting is applied last, so it wins.
- Godot builds `extras + Godot's options` (`game/settings.gd:143`) and appends `menustyle:full` at the very end (`game/nethack_session.gd:162`). The comments say Godot's options "after them win" (`settings.gd:130-131`, `nethack_session.gd:139-142`). In fact the player's extras override all of them.
- The owned-option filter is therefore the only guard, and it accepts only a `!` prefix (`settings.gd:137`). NetHack also negates with `no` (`src/options.c:538-541`).
  - Example: Settings > Autopickup "Gold only", and a pasted rc line `OPTIONS=noautopickup,time`. `noautopickup` passes the filter. NetHack applies `…autopickup,pickup_types:$…` first and `noautopickup` last, so autopickup is off while Settings shows "Gold only". The same happens with `norest_on_space`.
  - Non-owned Godot options lose to extras too. For example, `!time` removes the turn counter that the hero card shows.
- `menustyle` is still safe, because the bridge forces full menus once per game anyway.
- Minor: the `line == start_options` test in `_config_error` (`state/game_state.gd:434`, fed by `game_screen.gd:77`) can never match. For NETHACKOPTIONS errors NetHack prints an empty original line (`src/cfgfiles.c:1498,1596-1598`), never the string.
- **Fix:**
  - Put the options Settings owns first (applied last, so they win), then the player's extras, then Godot's other defaults (`!tips`, `time`, `runmode`, `disclose`), which the player may then override on purpose.
  - Widen the filter to `^(?:!|no-?)?(…)`, or drop it once the order makes Settings win.
  - Fix both comments. List the owned options in the Settings note (`ui/dialogs/settings_screen.gd:100`) so a dropped `pickup_types` isn't silent.
  - Remove the dead `start_options` comparison.

### L2. "You chose to leave N" names only the first refused item and blames every leftover on the choice

**Area:** `ContainerScreen._check_batch` (round-9 L2).

- When any answer was No, the status takes its reason from `declined[0]` alone and the count from all leftovers (`ui/dialogs/container_screen.gd:333-337`).
- Example: the player declines "a little trouble lifting j - a +0 dagger" and then a splint mail. The status reads "2 of 4 moved. You chose to leave 2: you have a little trouble lifting a +0 dagger." The mail isn't mentioned.
- Example: one No, plus another item NetHack refused without asking ("…but you cannot lift any more", `src/pickup.c` `lift_object` with a negative result). Both are reported as the player's choice, and NetHack's own refusal line is never used, because the refusal branch runs only when nothing was declined (`:338-344`).
- **Fix:**
  - Name each declined item ("You chose to leave the dagger and the splint mail").
  - When `left.size()` is larger than the number of declined items, add the refusal lines for the rest from the existing branch.

### L3. The new test paths skip real input and screenshots

**Area:** testing doctrine (`safety`, `partial_pickup`).

- `safety._toggle_option` presses rows with `row.pressed.emit()` and confirms with `menu._confirm()` (`tests/scenarios/safety.gd:151-159`), not with clicks or keys.
  - NetHack's options menu, the largest menu in the game and the classic `O` flow, is never captured in a screenshot. No scenario has ever shown it. Its rendering in `MenuDialog` (headings, the long list, compound-option submenus) has never been inspected.
- `partial_pickup` answers the two lifting questions but never checks the round-9 L1 behaviour, that the floor screen stays hidden between them (`partial_pickup.gd:32-38`).
- **Fix:**
  - In `_toggle_option`, use `click_control(row)` and `press(KEY_ENTER)`, and take a screenshot of the options menu.
  - In the `partial_pickup` loop, record whether `floor_view.visible` was ever true while the request was not the command prompt, and assert that it never was.

### L4. The bridge reference misses three extended-mode behaviours and now contradicts one

**Area:** `docs/bridge-protocol.md`, `BIBLE.md` architecture (shared bridge documentation).

- The BIBLE calls `docs/bridge-protocol.md` the full reference (`BIBLE.md:44`). Its §9 (`docs/bridge-protocol.md:1675-1755`) lacks all three of these, and the BIBLE's list of extended features (`BIBLE.md:45`) lacks the first two:
  - the hero-pile resend whenever the pile changes, even when it is now empty, at `get_nh_event` and at the command-level `nh_poskey` (`nh-shim-bridge.c:2886-2903,3621-3622`);
  - the once-per-game `menu_style` reset (`:3624-3634`);
  - worm tails tagged `actorRole:"tail"` (`:3373-3379`).
- §3.11's gotcha says the empty "pile gone" snapshot "is not guaranteed" (`docs/bridge-protocol.md:843-847`). In extended mode it now is guaranteed for the hero's square, and `ContainerScreen` relies on that (`container_screen.gd:307-308`).
- **Fix:** add the three items to §9 and the first two to the BIBLE's list. Qualify the §3.11 gotcha with "in base mode; extended mode always resends the hero's square". Add the `default` field from M1 in the same edit.

---

## Already better than Electron (keep these)

- Rounds 1 to 9's lists still hold.
- A NetHack question in the middle of a multi-stack pickup hides the floor screen and keeps it hidden across back-to-back questions. The screen then comes back with the result and the player's own choice ("2 of 4 moved. You chose to leave 2…", `partial_pickup/02-lifting-question.png`, `03-after-partial-pickup.png`).
- Godot games no longer depend on whatever `~/.nethackrc` a player has, and the test proves it with an option Godot never sets. Option mistakes typed into Settings come back as one plain feed line that names the field to fix.
- Changing `rest_on_space` in NetHack's own options menu now sticks for the game, exactly as in tty, and a scenario checks it both ways.
- The corner pile peek steps aside when the floor screen opens, so the same pile is never listed twice (`ui_panels/15-pile-peek-floor-screen.png`).

---

## Status after the fix pass (2026-10-17)

- **M1:**
  - In extended mode the bridge adds `"default"` (one character) to the opened `shim_yn_function` event when NetHack's caller passed one.
  - `GameState` keeps it on the request. `QuestionDialog` prefers it over a "(x)" in the text, highlights that answer and focuses it, so Enter gives NetHack's default, as Space already did.
  - `gamepad_play` engraves a second time from the keyboard, presses Enter at "Do you want to add to the current engraving?", and asserts the event's `default` is `y`, that the hero adds to the writing, and that nothing is wiped out. `06-engrave-add-default.png` shows Yes highlighted.
  - Both cores and Electron's shim were rebuilt. Electron's stream is unchanged (the field is gated).
- **L1:**
  - `Settings.nethack_options` builds owned options first (applied last, so they win), then the player's extras, then Godot's other defaults, which extras may override on purpose.
  - `NetHackSession` puts `menustyle:full` in front of everything.
  - The filter accepts `!`, `no` and `no-` prefixes and `menu_style`.
  - The comments and the Settings note say what really happens. The dead `start_options` comparison is gone.
- **L2:**
  - Every declined item is named, and repeats are grouped: "2 of 4 moved. You chose to leave a +0 splint mail ×2."
  - Leftovers beyond the declined ones add NetHack's refusal lines, or "NetHack kept the rest." when it said nothing.
  - `partial_pickup` asserts the grouped wording against the number of Noes.
- **L3:**
  - `safety._toggle_option` scrolls the row into view, clicks it, presses Enter, and screenshots NetHack's options menu (`safety/01-options-menu-rest_on_space-0.png`). The menu renders cleanly: letters, values in brackets, the selected row marked.
  - `partial_pickup` counts the frames where the floor screen was visible while NetHack's questions were open, and asserts there were none.
- **L4:**
  - `docs/bridge-protocol.md` §9.6 covers the hero-pile resend, full menus once per game, worm tails, and the question default.
  - §3.11's gotcha is qualified for base mode.
  - The BIBLE's list of extended features includes them.
