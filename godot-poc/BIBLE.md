# NetHack Godot Bible

The single source of truth for the Godot front end. Read it before any work in `godot-poc/`. When a decision here changes, edit this file and add a line to the [decision log](#decision-log).

## Vision

A Godot 4 front end for real NetHack that plays like a beautiful modern game. Two bars, both required:

- **Functional parity** with the Electron app in `../electron-poc`: every feature it has, this has.
- **Better in every other way.** The Electron screens are a feature checklist, not a design reference: Greg rates Electron's UX as poor. Design every screen from first principles the way a great modern game would, then check it covers the Electron feature. It should look, move, and feel like a polished modern game, with modern ease of use.

The NetHack rules engine stays authoritative and unmodified in behavior. Every outcome comes from the real game.

## Art direction: lit 2D pixel art

- Use the generated pixel tiles in `../electron-poc/assets/tiles/generated` (monsters, objects, terrain, traps, effects, player avatars). Generate new art under the rules in `../ASSET_GENERATION.md`.
- Pixel art stays crisp: nearest-neighbor filtering and whole-pixel scaling.
- The mood comes from **light**: dynamic 2D lights (the hero's light radius, lit rooms, torches, lava, magic), real darkness in unlit corridors, and remembered-but-unseen tiles drawn dim and desaturated. Fog of war is a shader, not a color swap.
- **Juice** on everything the game reports: movement tweens, attack lunges, hit flashes, floating damage and status text, particles for zaps, spells, explosions and breath, screen shake scaled to impact, smooth panel transitions. Animation never delays input. A queued key skips or fast-forwards pending animation.
- Typography and UI chrome feel like a crafted fantasy RPG: framed panels, readable type at every size, consistent iconography.

## UX principles

- **Visible actions.** The player sees what they can do. Items show verbs ("Drink", "Wear", "Read"). The current square and adjacent tiles offer their actions (open door, pick up pile, descend stairs). Nothing requires memorizing a key.
- **Three input styles, all complete:** keyboard, mouse (click to move or attack, hover for tooltips, right-click for actions), and controller.
- **Classic keys are sacred.** Every NetHack keyboard command and flow works exactly as in classic NetHack (project rule in `../AGENTS.md`). Modern controls are layered on top; they never replace a key.
- **No dead ends.** Every prompt states what it wants and how to back out. Direction prompts show targets on the map. Text prompts offer suggestions where the game allows.
- **Modern RPG layouts:** inventory grid with item cards, equipment paper doll, searchable command palette, readable character sheet, clear feedback when something happens to the hero.
- **No spoilers.** The UI shows only what the player character knows, the same policy as `../electron-poc/docs/ui-protocol-v2.md`.

## Architecture

```
Godot (GDScript UI)
   │  signals / method calls
NetHackCore  (GDExtension, C++ via godot-cpp)
   │  dlopen per game
libnethack_core.so  =  libnh + electron-poc/shim-bridge/nh-shim-bridge.c
   │  shim window callbacks
NetHack engine (src/)
```

- **In-process engine.** The GDExtension loads NetHack as a shared library. There is no subprocess.
- **Shared bridge.** `nh-shim-bridge.c` is compiled into the shared library through a wrapper translation unit and is never forked for Godot. The wrapper renames its `main` and points its `stdin`/`stdout` at in-memory pipes. Godot therefore receives the exact JSON event protocol Electron gets and sends the same command lines; the full reference is `docs/bridge-protocol.md`. Fixes to the bridge benefit both front ends.
- **Extended bridge features (Godot only).** Additions Godot needs live in the shared bridge behind `NH_BRIDGE_EXTENDED=1`, which only `NetHackSession` sets, so Electron's stream is byte-identical. They are: `bridge_vision` (per-cell in-sight/lit map plus depth, sent when it changes), `bridge_key_wait` (NetHack is waiting for a single key), the `map-click` input (decoded in `nh_poskey` into NetHack's own mouse coordinates, so click-to-travel and position picking use NetHack's logic; accepted only while NetHack reads a command or a position), classic control/meta keys (all of 1..255 except ^C and ^Z), the branch name (`dungeon`) on `bridge_vision`, worm tails tagged `actorRole:"tail"`, the hero's pile resent whenever it changes (also when it empties), full menus set once per game, and the `default` answer on yes/no questions (protocol §9.6). New Godot-only bridge behavior follows the same rule: additive, gated, Electron unchanged.
- **Game thread.** NetHack's `nhmain` runs on a dedicated thread and blocks waiting for input. Godot's main thread never blocks on the engine. Events cross back on a queue drained each frame.
- **Exit containment.** NetHack calls `exit()` on game over, quit, save and panic. The shared library is linked with `-Wl,--wrap=exit`; on the game thread, the wrapper ends that thread and reports the exit code instead of killing Godot.
- **Fresh library per game.** NetHack keeps state in globals and cannot start a second game in one load. Each new game does `dlclose` and a fresh `dlopen`, which resets every global. All library threads must be stopped before `dlclose`.
- **Electron stays untouched.** Shared C changes must keep the Electron build and its tests green.

Known hazards:
- The bridge `chdir`s into the playground, which changes Godot's working directory. Use absolute paths in the extension; `res://` paths are unaffected. `nhcore_finish` restores the directory and signal handlers.
- Environment variables (`NETHACKOPTIONS`, `NETHACKDIR`, seeds) apply process-wide.
- The release core takes its seed from `NH_ELECTRON_CHOSEN_SEED`; `NETHACK_SEED` only works in fixture builds.
- Playground locks (`alock.0` plus level files `alock.N`) store the owning pid in `.0`. The game lives inside Godot's process, so after a game ends or is stopped its lock holds a *live* pid. `SaveCatalog.clear_own_locks` deletes only lock sets owned by Godot's own pid (when no game runs) and dead-pid sets with nothing recoverable in them. A dead-pid set with level data is a crash checkpoint: the title screen offers it for `util/recover`, it is never deleted.
- Escape at NetHack's yes/no questions is mapped by the bridge as tty maps it (q, else n, else the default); before 2026-10-18 an Esc NetHack didn't offer printed "Program in disorder".
- NetHack never shows a tombstone or score summary under the shim; the end screen is built from `shim_native_end_diagnostic` plus disclosures collected by `EndChronicle`.
- JSON numbers arrive as floats in GDScript. Convert with `int()` before sending ids back in typed commands.
- `lib/lua/liblua-*.a` is not position-independent; the extension build compiles `lib/lua-5.4.8/src` itself.
- `build.sh` rebuilds `src/libnh.a` from a full clean, like Electron's `build:shim`. Never run the two builds at once.
- NetHack's farewell ("Goodbye … with N points") never prints under the shim (its window port never sets `iflags.window_inited`, so `really_done` stops printing). The shim is shared with Electron, so it stays as is: the end screen reads the score from the run's new `xlogfile` record instead (`NetHackSession._new_xlog_record`).
- GDScript lambdas capture locals by value: collect results from a signal callback into a shared Dictionary, not a reassigned local. A lambda also dies with the object that created it: follow-ups that must outlive a closing dialog live on a long-lived node (`InputRouter.send_then`, `swap_if_wielding`).
- `OS.is_process_running` logs an error for processes Godot didn't start; lock liveness checks read `/proc/<pid>` on Linux (`SaveCatalog._alive`).
- Parsed mouse events move the GUI's hover state but not `Input`'s polled mouse position: hover effects listen to `mouse_entered`/`mouse_exited`, and a child that stops the mouse (`MOUSE_FILTER_STOP`) hides the hover from its parent.
- Fixture scenes that move the hero after vision ran must set `gv.vision_full_recalc` (fixed in `src/allmain.c`, fixture-only code; Electron's fixture streams change accordingly).
- **Never type ahead, even item letters.** NetHack skips questions it doesn't need (`T` with one worn item asks nothing; `#call` with nothing callable just says so), so any key typed ahead runs as a command. Everything goes through `InputRouter.send_sequence`: the command alone, then each answer (item, menu, direction) only when NetHack asks for that kind of thing, a real yes/no left to the player, anything else ending it; an optional follow-up runs at the next command prompt. `send_item_command`, `send_with_direction` and `send_with_answers` build on it; `run_equipment_steps` runs checked T/W sequences (the bridge's typed `takeOff` reports multi-turn doffing as refused). `will_answer` keeps those questions from flashing up as dialogs.
- In NetHack's menus and questions the arrows only move the highlight (an arrow is a vi direction letter, which is an answer); Enter presses the highlighted row or button.
- Godot's built-in `ui_*` actions had no controller bindings: `App._bind_pad_to_ui` adds A and the D-pad/left stick so pads work every dialog.
- GDScript lambdas die with the object that made them: callbacks that outlive a closing dialog are bound methods of the long-lived `InputRouter` (`router.run_cell_action.bind(...)`).

## Playing and testing

- Play: `godot-poc/play.sh` (`--rebuild` to rebuild the engine libraries).
- Test: `godot-poc/tests/run.sh [scenario ...]`, then open every screenshot in `test-output/`. Scenarios that need a staged game (containers, shops) use the fixture core: build it once with `extension/build.sh --fixtures`.
- Exported builds: the playground is copied on first run from a `playground/` folder next to the executable into `user://playground` (saves and scores stay per user); `recover` is looked up in the source tree's `util/`, next to the executable, or in `bin/`. No export preset exists yet.
- Diagnostics: Settings > Diagnostics log writes every bridge event and sent line to `user://diagnostics/<start time>.jsonl`.
- Frame times measured under the test Xvfb are capped near 15 fps by the software display path (an empty scene costs the same); judge performance on a real display.

## Layout

```
godot-poc/
  BIBLE.md                  this file
  extension/build.sh        builds both libraries into project/bin (--fixtures for the test core)
  extension/core/           nhcore.c: hosts the bridge in process (pipes, exit containment, stop)
  extension/src/            NetHackCore node (C++, godot-cpp)
  project/                  the Godot project
  project/game/             game code; NetHackSession wraps NetHackCore; App (main.gd) owns screens
  project/game/state/       GameState: the only place bridge events are interpreted (map, status, log, requests)
  project/game/world/       WorldView: procedural terrain, liquids, actors, fog shader, effects, camera
  project/game/ui/          HUD, dialogs, screens; UiTheme is the one source of fonts, colors, styles
  project/game/input/       InputRouter (keys, mouse), GamepadRouter, CellActions, ItemActions, CommandCatalog
  project/game/audio/       SoundBank (synthesized effects + NetHack's CC clips), AudioDirector
  project/assets/           tiles (tools/sync_tiles.py), sounds (tools/sync_sounds.py), fonts (OFL), manual.txt (tools/clean_guidebook.py)
  docs/bridge-protocol.md   the bridge's full event and input reference
  project/tests/scenarios/  deep-path scenarios, one file each, base class tests/support/scenario.gd
  tests/run.sh              runs scenarios: tests/run.sh [name ...]; imports, compiles every script, renders on a private Xvfb (:97) with dummy audio
  tools/                    asset sync scripts; clean_guidebook.py reflows doc/Guidebook.txt for the in-game manual
  .tools/                   git-ignored: `godot` (Godot 4.7.2 linux x86_64 release zip), `godot-cpp` (tag godot-4.5-stable), `bin/Xvfb` (unpacked from Arch's xorg-server-xvfb, no install needed)
  test-output/              scenario output and screenshots (git-ignored)
```

## Testing doctrine: deep path

Every test enters as high as possible and reaches as low as possible: launch the real Godot project with the real extension, start a real seeded NetHack game, drive real input events (keys, clicks, controller), and assert on what the player sees and on UI state. One test should cross GDScript, the extension, the bridge, and the engine.

- Mock only what a test cannot control: randomness (fixed seed), wall-clock time, and the display when headless.
- Prefer one long scenario that plays through many features over many small tests. Small unit tests of single functions are out of scope.
- Every UI test captures screenshots, and someone opens and inspects every one before the test counts as passing. Assertions alone never pass a UI test. This follows `../TESTING.md`.
- Bridge fixture scenarios (`../electron-poc/test/scenarios`, built with `NH_ELECTRON_TEST_FIXTURES`) can set up hard-to-reach game states for Godot tests as well.

## Roadmap

| Phase | Goal | Status |
|---|---|---|
| 0 Tooling | Godot 4.7.2 and godot-cpp in `.tools/`, extension builds | done |
| 1 Engine link | `NetHackCore` runs games in process, survives game over, restarts cleanly | done: `engine_lifecycle` |
| 2 World | Tile map, camera, lighting and fog of war, message log, status HUD, keyboard play | done: `world_first_look`, `descent`, `look_and_minimap` |
| 3 Dialogs | Character creation, menus, all prompt types, help | done: `run_lifecycle`, `ui_panels`, `spells_and_skills` |
| 4 Parity | Inventory, equipment, ground piles and containers, context actions, item details, shop bill, command palette, settings, end-of-game chronicle, save recovery | done: `inventory_equipment`, `travel_and_transfer`, `run_lifecycle`, `ui_panels` |
| 5 Polish | Animation, particles, shake, transitions, sound, controller | done: `combat_feedback`, `gamepad_play`, `animation_beats` |
| 6 Review round 1 | 66 findings (`docs/review-round-1.md`) | done except the art regeneration (item 42) and the open items listed there: `containers`, `shopping`, `small_window` plus extended scenarios |
| 7 Review rounds 2–5 | 33 + 17 + 15 + 15 findings (`docs/review-round-2.md` to `-5.md`) | done: `equipment_swaps`, `locked_door`, `life_saving`, `wish_close`, `crash_recovery` plus extended scenarios |
| 8 Review rounds 6–13 | `docs/review-round-6.md` to `-13.md`; round 13: 0 high, 1 medium, 9 low | done: `inventory_places`, `danger_alerts`, `partial_pickup`, `gray_stones`, `loot_redirect`, `ring_finger`, `container_cases`, `doorways`, `status_onset`, `item_appearances` plus extended scenarios |
| 9 Art audit | Every tile reviewed by eye (`asset-generation/outputs/audit-2026-10-17/`); flagged ones regenerated on the B70 with `tools/art/regen_audit.py`, picked by eye and checked on the map (`art_gallery`) | in progress: doors, gray stone, 103 high-severity tiles, appearance art (potions, rings, wands, amulets, colour spellbooks) and most status badges installed; texture spellbooks, sticker monsters (E), wrong-class objects (F), medium and low generating |

The parity checklist is the feature set of `../electron-poc/src/ux` and `../electron-poc/src/shared`. Track each feature's Godot status here as it lands.

## Decision log

- **2026-10-17** Greg chose Godot over Electron for performance and game feel. Directory `godot-poc/`, sibling of `electron-poc/`.
- **2026-10-17** Engine linked in process through a GDExtension rather than the bridge subprocess. UI language: GDScript.
- **2026-10-17** Scope is full functional parity with Electron, explicitly not visual parity: "look better, more gamelike, better animations, like an amazing modern game."
- **2026-10-17** UX bar: modern design and ease of use, not just modern visuals. Electron's UX is the floor to beat, never the model.
- **2026-10-17** Art direction: lit 2D pixel art built on the existing generated tiles.
- **2026-10-17** Testing: deep-path integration tests only, mocking only what the test cannot control.
- **2026-10-17** Phase 1 landed: quit (`exit`), stop, and restart all verified in one process; the core library unloads after every game.
- **2026-10-17** Godot-only bridge additions are allowed when gated behind `NH_BRIDGE_EXTENDED=1` (vision, key wait, map clicks, control/meta keys); Electron's output stays identical.
- **2026-10-17** Terrain (floors, corridors, walls) is painted procedurally at startup (`TerrainPainter`) because the generated terrain tiles were flat; features, items and creatures use the generated art.
- **2026-10-17** Sound effects are synthesized at startup (`SoundBank`); NetHack's own CC0/CC-BY clips are used where they fit (attributions copied with them).
- **2026-10-17** Item and cell actions use NetHack's classic keys (NetHack validates everything); armor and ring changes use the bridge's typed `equipment-change` for automatic layering.
- **2026-10-17** Containers open in a two-pane screen through the bridge's direct `container-snapshot`/`container-transfer`; anything the direct path refuses (locked, trapped, several containers, NetHack-only cases) falls back silently to NetHack's own `#loot`, so nothing is revealed early.
- **2026-10-17** Shops: prices come from NetHack's own text (unpaid items, the "Pay for which items?" bill); questions get plain-language answers ("Sell / Don't sell", "Choose from a list").
- **2026-10-17** One level wording everywhere: "Depth N", with the branch in long labels ("Gnomish Mines · Depth 3"); NetHack's own names for special places are kept.
- **2026-10-17** Classic keys: Ctrl+P stays NetHack's ^P (history moved to F2); `i` always opens the inventory panel (queued while NetHack is busy); Esc after a typed count cancels the count; Shift+direction under number_pad sends `G` + digit.
- **2026-10-17** Mouse and pad parity: a Walk/Run/Fight move mode and a Rest turn count on the action bar; Cast/Spells only for heroes who know spells.
- **2026-10-17** The in-game manual is NetHack's Guidebook reflowed at build time (`tools/clean_guidebook.py`), with section navigation and match counts.
- **2026-10-17** Staircases are painted procedurally (`TerrainPainter.stairs_up/down`) with distinct silhouettes, plus a corner badge (`StairsBadges`) drawn above creatures; the generated stairs art made up and down look alike.
- **2026-10-17** Review round 2 (`docs/review-round-2.md`, 33 findings) fixed: alternate weapon keeps the weapon in hand; keyboard focus works in every panel; number_pad steps never become counts; MSDF fonts and a 0.8 minimum UI scale keep 1280x720 readable; dangerous actions confirm everywhere with no keys leaking past; closing the window saves from any prompt; Reduced motion covers every animation; failed starts return to the title with NetHack's words; equipment swaps under cloaks and two-handed checks; item picker search and counts; thrown objects drawn once; controller hints and an on-screen keyboard; container open timeout.
- **2026-10-17** Closing the window saves from anywhere: open questions get their safe answer first (as NetHack's own hangup save does); during the end-of-game questions the run ends normally (score recorded), then the app quits.
- **2026-10-17** Godot-only sprite fixes live in `tools/art/overrides/` (applied by `tools/sync_tiles.py`), generated with `tools/art/regen_sprites.sh` on the B70 (Qwen edit mode, since Krea2 was removed): a yellow newt (the old prompt asked for orange-red) and an open door that reads as a passage. Electron's tileset is unchanged.
- **2026-10-17** Review round 3 (`docs/review-round-3.md`, 17 findings) fixed: one type-ahead-free sequence engine for every multi-step command; arrows never answer NetHack's menus or questions; wishes guarded on close; life saving clears the death; minimap travel only; inline equipment blockers; reduced motion snaps actors; animation beats held to input waits; spoiler-free text hints; umask wrapped; game sounds switch; capped action bar.
- **2026-10-17** Review round 4 (`docs/review-round-4.md`, 4 medium, 11 low) fixed:
  - Any player input cancels running automation (`InputRouter.cancel_automation`).
  - The palette's "Available here" lists neighbour and lock actions, for pad players.
  - Text windows can be searched (`/`).
  - Drag and drop for containers and equipment slots.
  - Extended commands typed by buttons never flash the palette.
  - Pick-several menus: Enter confirms, Space toggles the row the player arrowed onto.
  - The context menu passes navigation keys through.
  - Life saving re-arms a pending close (`ending_cancelled`).
  - Modifier keys never dismiss text.
  - Direction prompts offer only the directions NetHack lists.
  - The action bar shows pad buttons during pad play.
  - Feed scrollback with the mouse wheel.
  - Settings for locked-door suggestions and minimap size.
  - Reduced motion follows the OS on first run.
  - The hero card says what the hero stands on.
  - Settings save errors are reported.
- **2026-10-17** Fixture loader (shared fixture-only code in `src/allmain.c`): locked doors are `D_LOCKED` alone, as in NetHack (with `D_CLOSED` set too they simply opened). `AMULET_OF_LIFE_SAVING` and `WAN_WISHING` are supported. New fixtures: `status/life-saving-lava`, `object/wand-of-wishing`.
- **2026-10-17** Tests that check for type-ahead use `Scenario.commands_run()`. The bridge logs every key it reads as `bridge_command`, answers included, so only keys not followed by an `*_answer` event ran as commands. Waiting for a save must not use `wait_for_game_end`, which auto-answers every prompt since the last `mark()`, stale ones included.
- **2026-10-17** Review round 5 (`docs/review-round-5.md`: 2 high, 4 medium, 9 low) fixed:
  - The message feed only catches clicks on its lines.
  - Linux first runs keep animations on.
  - Only input that reaches NetHack cancels automation, and it says so.
  - Settings reset is rebuilt in place.
  - A floor-and-pack screen built on `ground-transfer`.
  - Named, dated crash checkpoints with Recover and Discard.
  - The command prompt is marked taken on send (`answer_pending`).
  - An equipment pack strip, with a drop target on the hero.
  - Fullscreen (F11) and a minimum window size.
  - Pack letters in containers.
  - Readable palette keys.
- **2026-10-17** Tests run sandboxed: `tests/run.sh` gives every scenario its own `XDG_DATA_HOME` and playground (`NH_GODOT_PLAYGROUND`). Every scenario is a first run, and the player's data is never touched. Engine errors a scenario provokes on purpose are listed in `run.sh` (`expected_errors`).
- **2026-10-17** Review round 6 (`docs/review-round-6.md`: 3 high, 3 medium, 7 low) fixed:
  - The feed hit-tests its words only.
  - Crash checkpoints are moved out of NetHack's lock names before any game starts.
  - Moving several stacks uses NetHack's own `,`, `D` or `#loot` (one turn), with rows picked by `objectId` through the sequence engine (`pick_ids`, `pick_text`, optional steps).
  - Recover asks before replacing a save and sets the old one aside.
  - One stack picks up directly.
  - Ammunition dropped on the hero is quivered.
  - Kick toward any neighbour.
  - Space waits a turn (setting, off).
  - Per-scenario expected errors.
- **2026-10-17** Greg approved the regenerated newt and open door for Electron. They are installed in the shared tileset (`electron-poc/assets/tiles`, manifest sha256, tracker rows, old files in `asset-generation/backups/2026-10-17-godot-regen-newt-door`), and the Godot-only override folder is empty again.
  - The door was flattened to an opaque terrain tile. The newt's residual matte was cleared.
  - Electron draws door glyphs with CSS by policy (`map-presentation-asset-policy-test.js`), so the new door art shows in Godot only.
  - Test runs from before the sandbox were removed from `playground/xlogfile` and `logfile` (backup in `/tmp/nethack-score-backup`).
- **2026-10-17** Review round 7 (1 high, 3 medium, 6 low) fixed:
  - Batches pick class rows when NetHack shows no "All types".
  - Sequences report their end (`on_end`).
  - The bridge resends the hero's pile whenever it changes (extended mode).
  - A failed recovery restores the save.
  - Godot's options live in `playground/godot.nethackrc` (`NETHACKOPTIONS=@file`). The player's `~/.nethackrc` is not read, because the interface depends on `menustyle:full` and its own Settings.
- **2026-10-17** Review round 8 (`docs/review-round-8.md`: 0 high, 1 medium, 9 low) fixed:
  - Transfer screens survive NetHack's questions and report partial moves in NetHack's words.
  - Godot starts NetHack with `-no-nethackrc` plus plain NETHACKOPTIONS, with Settings > Extra NetHack options for anything else.
  - The bridge keeps menus full and rest-on-space per Settings for restored saves (extended mode).
  - Recovery state is cleared only on real success.
- **2026-10-17** Review round 9 (1 high, 1 medium, 5 low) fixed:
  - libnh's main now honours `-no-nethackrc` (it had been ignored, so `~/.nethackrc` was read). The rc decision stands: Godot reads no `.nethackrc`, and Settings > Extra NetHack options replaces it.
  - The bridge sets menus to full once per game and leaves `rest_on_space` alone: NetHack's own Space binding follows the options, and `O` changes stick.
  - Transfer screens stay hidden between consecutive questions.
  - Partial moves say "You chose to leave N" when the player said No.
- **2026-10-17** Review round 10 (1 medium, 4 low) fixed:
  - Enter on a NetHack yes/no question gives NetHack's default (the bridge now sends it), as in tty. Before, Enter answered No, so one Enter at "add to the current engraving?" wiped a dust Elbereth.
  - NETHACKOPTIONS is applied right to left, so the leftmost setting wins: Settings' own options go first, then the player's extras, then Godot's defaults.
  - Partial moves name every item the player chose to leave.
- **2026-10-18** Review rounds 12 and 13 (containers):
  - Godot never makes NetHack open a container twice. The engine keeps an open session (containers `use_container` opened since the hero's last ordinary command) in which the direct commands accept the container even for a confused hero or a cursed bag; a hero confused since the open is refused.
  - Several stacks move by one direct transfer (`moreItemIds`, up to 256 more), one turn, never a reopen, so a cursed bag's losses are rolled once per open, as in tty. A transfer NetHack attempts costs a turn even when NetHack says no; a bag of holding blown up by what went in closes the screen with NetHack's own words.
  - The screen closes when its container is gone (destroyed, stolen), lists wielded, alternate and quivered things for putting in, explains the usual refusals in plain words and quotes NetHack when NetHack itself said no.
  - The bridge marks an Esc it mapped with `"cancelled":true`; Electron counts that as a cancel everywhere.
- **2026-10-18** Play feedback:
  - Negative statuses can't be missed (`StatusEffects`, `StatusAnnouncer`, `StatusScreenEffects`): every status has a tier (mild, serious, deadly), an icon and a plain meaning; a card announces each one as it starts (and a brief "No longer …" when it ends), badges under the hero's stats stay coloured by tier and pulse when serious, and blindness darkens the map, confusion and stunning make it sway, hallucination shifts its colours (motion effects off with reduced motion).
  - A square is drawn the same with or without someone on it: the bridge sends the terrain under a creature as `backgroundCmap`, so doors, traps and engravings under the hero stay drawn.
  - Unidentified gems show their colour (the coloured-glass art covers NetHack's gem colours); potions, rings, wands, amulets and spellbooks get art per appearance as it is generated (`<appearance>-<class>`, e.g. `puce-potion`).
- **2026-10-18** Play feedback and review round 11 (1 medium, 7 low):
  - Opening a container any way at all (#loot typed, Alt-L, the palette, applying a bag from the pack, the action bar) gives the two-pane screen. Typed and applied opens go through NetHack (locks, traps, Schroedinger's cat, a cursed bag's losses and confusion happen as in tty); Godot answers "do nothing" (or "done") at its "Do what with…?" menu and opens the screen for that container. The action bar's Open asks the bridge for the contents directly and only sends NetHack's command when the bridge wants NetHack to open it first. The direct container commands accept carried containers and, for one open session (until the hero's next ordinary command), a container NetHack has opened. Several stacks move in one direct transfer, never a reopen, so a cursed bag's losses are rolled once per open. Godot never runs NetHack's command a second time; when the bridge still refuses, the feed says why and the next open shows NetHack's menu.
  - Items whose glyph the bridge withholds (unidentified gray stones) get art from their class and appearance; gray stones have their own dull-pebble tile.
  - What lies under the hero is read from the pile snapshot, never the hero cell's object layer, which NetHack leaves stale after a drop, eating floor food or a corpse rotting (map and action bar).
  - Esc at a NetHack question maps as in tty (q, else n, else the default), so backing out of "Which ring-finger?" no longer prints "Program in disorder!" (both front ends).
  - A NetHack default answer is marked with a warm fill and a "default" caption; gold borders mean focus only. The options menu has no "Select all".
  - Doors are a front-view family matching the 3/4 brick walls, after Greg's "Terrible door". Godot draws the closed and the two open doors; doorways and broken doors render as floor gaps, so `broken-door` and `no-door-doorway` are for Electron's tile view and tooltips (Electron draws its map doors with CSS).

  - NetHack's small pick-one menus (#name/C "What do you want to name?", #terrain "View which?", / "What do you want to look at:") are ChoiceScreen tiles: art, NetHack's own row text, the row's letter. A click or the letter answers; Enter takes the preselected row; Esc cancels. The #terrain view gets its own banner ("Showing the terrain you remember… Esc to return") instead of the map-target one (`choice_menus`).
  - NetHack's menus of pack items (? / * at an item question, / "something you're carrying", identify, A take-off) are ItemPickScreen: the inventory's own slots under NetHack's class headings, groups flowing side by side, the full name of the item under the pointer. Pick-one answers on a click or letter; pick-any toggles and confirms; "- (bare hands)" is a button. Rows map to pack items by objectId, or, for getobj's untagged list, by letter and NetHack's text. Transfer, pay, container and ground menus keep their own screens (`item_picks`, `identify_pick`).
  - #vanquished and #genocided are BestiaryScreen: a card per species with its tile, ×N, NetHack's class headings and total; genocided species dimmed and marked (`bestiary`).
  - NetHack's shop lists are ShopLedgerScreen: "Fine goods for sale" (prices), Iu (the bill, by NetHack's class headings, total against gold, Pay p) and Ix (used up). The inventory header shows "Your bill · N zm" whenever unpaid things are carried, since the I key opens Godot's inventory and Iu can't be typed (`shop_ledger`).
  - NetHack's O options menu is OptionsScreen: NetHack's sections as cards, a switch per on/off option, the value of the others with a button to change it, NetHack's descriptions on request. Each pick answers NetHack's looping menu; the page reopens where it was scrolled (`options_page`).
  - NetHack's ? help menu is ChoiceScreen tiles (compact, four across), and its pages finally show: the bridge implements `display_file` (it was a no-op in the shim) by reading the dlb file into a text window. Text windows laid out in columns use Noto Sans Mono so NetHack's tables line up (`choice_menus`).
  - Known, pre-existing: Electron's `test:architecture` fails at `test/shared/architecture-modules-test.js` (it calls `PromptRules.isLockedDoorMessage`, which lives in `interaction-model.js`); stale since 2026-09-05, unrelated to the Godot work.
  - An Oracle consultation (the major one; the minor one is a rumour in the feed) is the lore parchment headed by NetHack's own line ("The Oracle meditates for a moment and then intones:"). The fixture loader accepts the Oracle's level (`oracle`).
  - Reordering the pack: drag one inventory slot onto another and NetHack's #adjust gives it that letter (swapping them); the inventory opens again afterwards (`adjust_drag`). Gold keeps its $.
  - Round 14 (`docs/review-round-14.md`): Enter with nothing picked picks nothing and Esc cancels NetHack's menus (-1, as tty, in the bridge, so identify can be declined and `?` lists back out); NetHack's hidden menu keys (`/ y`, `C n`) work; `I` is NetHack's own again (Iu, Ix); the prayer card shows facts, never "troubles".
