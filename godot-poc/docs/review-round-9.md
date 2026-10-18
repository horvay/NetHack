# Godot front end review, round 9

Date: 2026-10-17. Scope: everything in `godot-poc/` after the round-8 fix pass, looking hardest at the round-8 changes:
- `DialogHost`'s `_suspended` / `keep_under_requests` (`_show`, `_on_dialog_closed`, `owns_input`, Esc while suspended, panels opened while suspended, the screen closing while suspended, focus);
- the container screen's `_batch_check` / `_check_batch` (timing against snapshots, the container path through `_on_contents`), `_batch_ended` calling `_next`, the busy guards;
- the bridge's `check_hero_pile_change` at `get_nh_event` and at command-level `nh_poskey`, and the extended-mode `flags.menu_style` / `rest_on_space` enforcement;
- `-no-nethackrc`, the plain NETHACKOPTIONS string and `NH_GODOT_REST_ON_SPACE` in `NetHackSession`;
- `Settings.extra_options` and its Settings field; `SaveCatalog.recover`; the end screen's route to `TitleScreen._recover`;
- `PilePeek`, `_forces_locks` on `wornMask`, the cleaned sequence engine and its category-menu gate;
- the scenarios `partial_pickup`, `crash_recovery`, `world_first_look`, `ui_panels` and `descent`.

The lenses are the same as round 8:
1. Functional parity with Electron.
2. UX quality, from the UI code and the screenshots of the full run that just finished (22 scenarios, all PASS). No source file is newer than that run.
3. Architecture and correctness.

**How the findings were checked**
- Read-only review. Nothing was built or run.
- Every finding was checked against the code. UX findings were also checked against the screenshots named in them.
- Engine claims were checked in NetHack's source in this repository:
  - `sys/libnh/libnhmain.c` (`nhmain`, `process_options`), `src/earlyarg.c` (`early_options`), `src/cfgfiles.c` (`rcfile`, `fopen_config_file`, `config_error_add`), `src/allmain.c` (`early_init`).
  - `src/cmd.c` (`update_rest_on_space`), `src/options.c` (boolean side effects, `doset`, `initoptions_finish`), `src/restore.c` (`restgamestate`), `include/extern.h`.
  - `src/lock.c` (`u_have_forceable_weapon`), `include/prop.h` (`W_WEP`), `include/display.h` (`MG_PET`), `util/recover.c`.
- The linked core was checked with `nm` and `objdump` on `project/bin/libnethack_core.so` (read-only): `early_options` is called only from unixmain's `main`, which the game never runs.
- Bridge claims were checked in `electron-poc/shim-bridge/nh-shim-bridge.c` and `extension/core/nhcore.c`. Event logs: `test-output/partial_pickup/events.jsonl`, `test-output/descent/godot.log`.
- Paths are relative to `godot-poc/project/` unless they start with `electron-poc/`, `extension/`, `src/`, `sys/`, `util/`, `include/`, `tests/run.sh` or `docs/`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 1 high, 1 medium, 5 low (7 in total).

The most serious problems:
- `-no-nethackrc` does nothing in this build. The in-process main never parses it, so NetHack reads `~/.nethackrc` again. The `safety` scenario can't notice, because Godot's own options override both lines of its hostile rc (H1).
- The bridge resets `flags.rest_on_space` at every command wait, but Space works through a key binding that only `O` changes. After one `O` toggle, Space and the options menu disagree for the rest of the game, and the player can't switch it back (M1).

---

## Round-8 verification

- **M1 (questions close the transfer screen, refusals say nothing): fixed.** `ui/dialog_host.gd:95-104,124-137` hides the screen under a request dialog and brings it back. `partial_pickup/03-after-partial-pickup.png` shows the floor screen back with the two refused mails and "2 of 4 moved." Two leftovers are in L1 and L2.
  - Esc while suspended reaches the question first (`dialog_host.gd:77-86`) and is marked handled.
  - Panels can't open over the question: keys stop at `owns_input` (`input/input_router.gd:21`), the pad checks it (`input/gamepad_router.gd:52`), and the full-rect modal on layer 20 covers the HUD on layer 10.
  - A screen closed while hidden is never restored (`:130`).
- **L1 (pile change during the monsters' turn): fixed.** `check_hero_pile_change` runs at command-level `nh_poskey` (`electron-poc/shim-bridge/nh-shim-bridge.c:3621-3622`), before the prompt event. A batch's `_check_batch` therefore sees the new pile before the command prompt ends the sequence. The function returns at once outside extended mode (`:2889`), so Electron's stream is unchanged.
- **L2 (rc fallbacks, restored menu style): not fixed for the rc.** The switch is never parsed, so `~/.nethackrc` is read again (H1). The plain NETHACKOPTIONS string itself works: it reaches `parseoptions` as extra options with no length limit (`src/cfgfiles.c:1964-1975`). Restored saves get full menus at every wait (`nh-shim-bridge.c:3629-3630`). The rest-on-space half causes M1.
- **L3 (no way to set other options): fixed.** `crash_recovery` types `pettype:none` into the field, and the next game has no pet. `MG_PET` is `0x10` (`include/display.h:999`), as the test assumes. The field's note says no `.nethackrc` is read, which is false today (H1).
- **L4 (recover exit code, end-screen bypass): fixed.** The regex matches `util/recover.c:151`. `preserved_bases` is cleared only on that line (`game/save_catalog.gd:262-265`). The end screen goes through `TitleScreen._recover` (`ui/end_screen.gd:169-175`).
- **L5 (queued moves never start): fixed.** `_batch_ended` calls `_next()` (`ui/dialogs/container_screen.gd:294`). Double-click, Enter and drag are refused while busy (`:182,195,428`), so nothing can queue during a batch anyway.
- **L6 (stale pile peek): fixed as stated** (`ui/pile_peek.gd:44-46`). It still shows stale rows during a question (L3).
- **L7 (Force the lock wording): fixed.** `ui/action_bar.gd:174-176` tests `W_WEP` (`0x100`, `include/prop.h:110`), and its name list matches the skills `u_have_forceable_weapon` refuses (`src/lock.c:664-674`): flail, launchers, missiles, whip (rubber hose), unicorn horn, ammo.
- **L8 (dead code, class fallback): fixed.** The optional-step code is gone. The class fallback runs only when the prompt contains "what type of" (`input/input_router.gd:540-542`). The menu request carries `prompt` (`state/game_state.gd:413`), and NetHack's only such prompts are `src/do.c:1009` and `src/pickup.c:4054`.
- **L9 (tests):** the newt is shown on the map (`world_first_look/06-newt.png`). Settings at 150% is captured, though its slider is wrong in the picture (L5). The `descent` click check was skipped again in this run ("no explored square beside the line", `test-output/descent/godot.log`). That item was left on purpose and is not raised again.

---

## High

### H1. `-no-nethackrc` is ignored: `~/.nethackrc` is read again, and `safety` can't tell

**Area:** engine options (round-8 L2), the BIBLE's rc decision.

- Godot passes `-no-nethackrc` (`game/nethack_session.gd:170`). NetHack handles that switch only in `early_options` (`src/earlyarg.c:268-279`), which only the tty main calls (`sys/unix/unixmain.c:134`).
- The core runs another main. `extension/core/nhcore.c:180,236` renames the bridge's `main`, which calls `nhmain` (`nh-shim-bridge.c:4320`). That `nhmain` is libnh's (`sys/libnh/libnhmain.c:66`), and it never calls `early_options`. It runs `early_init` → `initoptions` (`:82,184`) → its own `process_options` (`:202`), where `-n…` only switches off the news (`:374-376`).
  - The built library agrees: `objdump` shows the only call to `early_options` is in unixmain's `main`, which the core never runs.
- So `gc.cmdline_rcfile` stays NULL. Because NETHACKOPTIONS is not a file name, `rcfile` reads the default config file first and then applies Godot's string as extra options (`src/cfgfiles.c:1942-1945,1964-1975`). On Unix the default file is `$HOME/.nethackrc` (`:322-330`).
- Godot's options come later, so they win where both set something (menustyle, rest_on_space, autopickup, number_pad). Everything else in a player's rc now applies to Godot games without the player knowing:
  - `BIND=` can remap the `,`, `D`, `#` or item keys that the sequence engine sends.
  - `MSGTYPE=hide` can hide lines the UI reads, such as the lock messages behind `RESOLVED_LOCK` (`ui/action_bar.gd:179`).
  - `!autodescribe` empties the map-target banner's second line (`ui/dialog_host.gd:40-45`).
  - `pickup_types` contradicts Settings > Autopickup > Everything, which sets none (`game/settings.gd:124-126`).
- Round 7's `NETHACKOPTIONS=@file` did keep the rc out (`src/cfgfiles.c:1934-1940`). Round 8 replaced it with a switch this build never reads, so this is a regression.
- **The test can't catch it.** `safety.gd:16-31` writes `OPTIONS=menustyle:traditional,rest_on_space`. Godot's `menustyle:full` and `!rest_on_space` come later and override both, and the bridge enforces menustyle too. The scenario passes whether or not the rc is read.
- Three places now state something false:
  - the comment at `nethack_session.gd:153-156`;
  - the Settings note "this game reads no .nethackrc" (`ui/dialogs/settings_screen.gd:100`);
  - the BIBLE decision log (`BIBLE.md:205`).
- Greg has no `~/.nethackrc` today, so his own games are unaffected. Any player with one is affected.
- **Fix:**
  - In `sys/libnh/libnhmain.c`, before `initoptions()` (`:184`), handle `-no-nethackrc` and `--nethackrc=FILE` the way `src/earlyarg.c:268-279` does (set `gc.cmdline_rcfile`).
    - This must happen after `early_init`: `decl_globals_init` resets `gc`, so a value set from the bridge before `nhmain` would be lost.
    - Electron never passes the switch, so its stream is unchanged. Electron's build and tests still need to pass, as the BIBLE requires for shared C.
  - Make `safety` able to fail: put an option Godot never sets in the hostile rc, for example `OPTIONS=pettype:none`, and assert the Valkyrie's kitten is on the map. `crash_recovery` already checks the opposite with the same flag.
  - If Greg would rather honour the rc (Electron does), say so in the BIBLE and fix the comment, the Settings note and `safety`. Either way, the code and the documents must say the same thing.

---

## Medium

### M1. After an `O` toggle, rest_on_space is stuck: Space and the options menu disagree for the rest of the game

**Area:** bridge enforcement (round-8 L2), classic keyboard flows.

- In NetHack, Space waits because of a key binding. `update_rest_on_space` binds `' '` to "wait" or unbinds it (`src/cmd.c:3521-3541`). The flag alone changes only help listings (`src/cmd.c:2857`, `src/pager.c:2511`).
- The binding is set from the starting options (`src/options.c:7367`) and again whenever the option is toggled (`:5426-5427`). Restoring a save reads `flags` (`src/restore.c:578-579`) but never rebinds.
  - So a restored game already follows Settings for Space, because the binding came from Godot's options at start-up. The bridge's per-turn rewrite of `flags.rest_on_space` (`nh-shim-bridge.c:3628-3632`) doesn't change Space's behaviour at all.
- The rewrite does break the classic `O` flow. Example with Settings > Space waits a turn off:
  1. `O`, select `rest_on_space`. `doset` toggles from the current flag (`src/options.c:8946-8948`), so it turns on and binds Space to "wait".
  2. At the next command wait, the bridge sets the flag back to off without rebinding. Space still rests.
  3. `O` now shows `rest_on_space` as off. Selecting it turns it "on" again, which changes nothing.
  - The player can't make Space stop resting in this game. With the setting on, the mirror case leaves Space unable to rest.
- The same per-turn rewrite also silently undoes an `O` change to `menustyle`. That one is intended, but the player gets no message.
- A Godot-continued save also goes back to tty or Electron with `menu_style` full, because the forced value is saved.
- **Fix:**
  - Drop the bridge's rest_on_space write and `NH_GODOT_REST_ON_SPACE` (`game/nethack_session.gd:158`). The binding already follows Settings.
    - If the flag must match for help text, set it once after a restore and call `update_rest_on_space()` (exported, `include/extern.h:468`).
  - Enforce `menu_style` once after a restore, not at every wait. Alternatively, keep the per-wait check but have Godot say "Menus stay full in this interface" when `O` changes it.
  - Test: `O` → toggle rest_on_space → Space rests → `O` → toggle → Space doesn't rest.

---

## Low

### L1. The transfer screen flashes between two NetHack questions

**Area:** `DialogHost` suspension (round-8 M1), UX.

- `QuestionDialog._answer` sends the key and closes at once (`ui/dialogs/question_dialog.gd:227-229`). `_on_dialog_closed` then makes the hidden screen visible right away (`ui/dialog_host.gd:130-137`), at full opacity, with the feed dimmed and the focus moved.
- The next question comes from the engine thread one or more frames later. `_show` then hides the screen again, and the new card fades in over 0.14 s (`ui/dialogs/modal_card.gd:61-65`).
- This happens in the existing test: NetHack asked "You have much trouble lifting a +0 splint mail. Continue?" twice (`test-output/partial_pickup/events.jsonl`, requests `shim-prompt-r4` and `-r5`). Between the two answers, the 1240-pixel floor screen pops in and out.
- **Fix:** when a request dialog closes with a screen suspended, keep the screen hidden (still `active`, so it keeps the keyboard). Show it on the next request that opens no dialog: the command prompt, or one that `will_answer` covers. A new request dialog would then suspend it again with no flash.

### L2. "Why the rest didn't move" is just the last two log lines

**Area:** container screen `_check_batch` (round-8 M1), UX and test.

- `_check_batch` shows the last two messages since the batch started (`ui/dialogs/container_screen.gd:327-329`).
- In `partial_pickup/03-after-partial-pickup.png` the status reads "2 of 4 moved. You have trouble lifting k - a +0 splint mail. You rebalance your load. Movement is difficult."
  - The first sentence is about a mail that did go up, and the second is about encumbrance.
  - The real reason is that the player said No twice. NetHack's questions are not in the message log, so the status never shows it.
- The test asserts only that the status contains "lifting" (`tests/scenarios/partial_pickup.gd:59`). It passes because of the moved mail's line.
- The single-stack path does better: it maps the bridge's reason to a sentence (`container_screen.gd:388-402`).
- **Fix:**
  - Record the questions the player answered during the batch (query plus answer). When an answer was `n` or `q`, say so: "2 of 4 moved. You chose to leave 2 (much trouble lifting)."
  - Otherwise prefer lines that name a refused item or say "cannot / can't / not enough room", and drop encumbrance lines.
  - Test: assert the status names the refused mail, or says the player left it.

### L3. The pile peek sits beside the floor screen and resurfaces stale during the question

**Area:** HUD `PilePeek` (round-8 L6), UX.

- In `partial_pickup/01-floor-before.png` the peek lists the same four items as the floor screen, next to it.
- In `02-lifting-question.png` the floor screen is hidden, and the peek still lists "a +0 dagger" while the feed just above says "You have a little trouble lifting j - a +0 dagger."
- The peek hides on `hero_moved` and `pile_changed` (`ui/pile_peek.gd:40-46`). The bridge reports pile changes only at turn boundaries (`nh-shim-bridge.c:3621-3622,3755`), and a question in the middle of a pickup comes before either.
- **Fix:** hide the peek whenever a transfer screen opens (`DialogHost.open_ground`, `open_container`). The screen supersedes it, and nothing is left to resurface under a question.

### L4. Edge cases of the Extra NetHack options field

**Area:** `Settings.nethack_options`, `NetHackSession.start_game`.

- `NH_GODOT_REST_ON_SPACE` is `options.split(",").has("rest_on_space")` (`game/nethack_session.gd:158`), and `options` includes the extra options.
  - Example: extras `rest_on_space` with the Settings switch off. NetHack gets `rest_on_space,…,!rest_on_space`, and the last one wins (off). The environment variable still says 1, so the bridge sets the flag on while Space is unbound.
  - This goes away if M1 drops the variable. Otherwise derive it from `Settings.rest_on_space`.
- The note invites pasting "an OPTIONS= line" (`ui/dialogs/settings_screen.gd:100`). A pasted `OPTIONS=fruit:mango,…` turns the first option into `OPTIONS=fruit:mango`.
  - NetHack rejects it ("Unknown option").
  - The error reaches the feed as a raw "config_error_add: …" line among the welcome lines (`src/cfgfiles.c:1575-1580`, `state/game_state.gd:171-176`).
- **Fix:**
  - Strip a leading `OPTIONS=`.
  - Filter the options Godot owns (rest_on_space, number_pad, autopickup) as `menustyle` is filtered, or say in the note that Settings wins for those.
  - Show NetHack's config errors as one plain notice ("NetHack didn't understand: …").

### L5. The 150% Settings screenshot shows the slider at 100%

**Area:** testing doctrine (round-8 L9).

- `ui_panels.gd:69-70` sets `settings.ui_scale = 1.5` and calls `apply_ui_scale()` directly. The slider never moves.
- `ui_panels/05-settings-150.png` therefore shows "Interface size … 100%" on a card drawn at 150%. A player can't reach that state, and the screenshot can't show a fault in the slider's own path, such as the refit called from its callback (`settings_screen.gd:54-58`).
- **Fix:** move the slider itself, by focusing it and pressing Right, or by setting `value` so `value_changed` fires. Then take the screenshot.

---

## Already better than Electron (keep these)

- Rounds 1 to 8's lists still hold.
- A NetHack question in the middle of a move shows on its own, and the floor or container screen comes back with the real result ("2 of 4 moved", `partial_pickup/02-lifting-question.png`, `03-after-partial-pickup.png`). Electron's ground panel has no partial-move report.
- Pile changes during the monsters' turn reach the map, the bar and the floor screen before the next command.
- "Force the lock" follows NetHack's own wield and skill rules: an aklys, two-weaponing and a wielded pick-axe get it; a whip or a bow doesn't.
- Settings has a typed field for any other NetHack option. In Electron the only way is an rc file.
- "Recover this run" on the end screen gets the same tool check, replace question and messages as the title. A failed recovery keeps both the checkpoint and the newer save.

---

## Status after the fix pass (2026-10-17)

**Fixed:**
- **H1:**
  - `sys/libnh/libnhmain.c` now handles `-no-nethackrc` (reads `/dev/null`) and `-nethackrc=FILE`, after `early_init` and before `initoptions`, as `src/earlyarg.c` does for tty. Electron never passes them; its fixture build and its real-app door test still pass, and its normal shim was rebuilt.
  - `safety`'s hostile rc now includes `pettype:none`, an option Godot never sets, and the scenario checks the Valkyrie's kitten is there.
  - The code comment, the Settings note and the BIBLE now match what happens.
- **M1:**
  - The bridge no longer rewrites `rest_on_space`, and `NH_GODOT_REST_ON_SPACE` is gone.
  - Menu style is set to full once per game (restored saves), not at every wait.
  - `safety` toggles `rest_on_space` twice through NetHack's own `#optionsfull` menu and checks that Space rests, then doesn't.
- **L1:** after a question, the transfer screen takes the input back hidden. It shows only when a request comes that opens no dialog (the command prompt, or one the router answers), so two questions in a row no longer flash it.
- **L2:**
  - `GameState.question_answered` records the player's answers during a batch.
  - A No becomes "You chose to leave 2: you have much trouble lifting a +0 splint mail." Otherwise only NetHack lines that say it couldn't are used.
  - `partial_pickup` asserts that wording.
- **L3:** opening a floor or container screen hides the pile peek.
- **L4:**
  - A pasted `OPTIONS=` prefix is stripped.
  - Options Settings owns (`menustyle`, `rest_on_space`, `number_pad`, `autopickup`, `pickup_types`) are dropped from the extra options.
  - NetHack's option-error report before the first prompt becomes one feed line: "NetHack didn't understand some Extra NetHack options (Settings): …".
- **L5:** `ui_panels` moves the Interface size slider itself to 150%.
- **Also:** `descent`'s pointer check settles the camera first. It had failed once in the full run because the zoom was still easing.

**Left:**
- **L4, config-error notice:** not covered by a scenario. A bad option makes NetHack print its report before the game starts. The parsing is the same as the raw-print path the other scenarios exercise.
