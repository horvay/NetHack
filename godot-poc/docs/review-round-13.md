# Godot front end review, round 13

Date: 2026-10-18. Scope: everything in `godot-poc/`, looking hardest at the round-12 fix pass:
- **Engine (`src/pickup.c`, `src/cmd.c`):**
  - the open session: `direct_opened_ids`, `direct_container_was_opened`, and `direct_container_note_command` called from `rhack`;
  - `direct_container_common_checks`: confusion is checked only for unopened containers, and engulfed/buried only for floor containers;
  - the multi-item `doshimcontainertransfer` with `container_transfer_add_item`. Compared with tty's `menu_loot` and `in_or_out_menu`.
- **Bridge:** `json_direct_uint_array_field`, `moreItemIds`, and `"cancelled":true` on `bridge_prompt_answer`.
- **Electron:** the renderer's Esc acknowledgement and the gray-stone mapping in `tile-assets.js`.
- **Godot:**
  - `DialogHost`: the loot redirect, its queue, and the native-menu flag;
  - `ContainerScreen`: one-transfer batches, partial wording, `_classic`;
  - `NetHackSession.send_container_transfer`, and `GameState`'s keycode-0 answer.
- **Fixtures:** the fixture loader in `src/allmain.c`, the new container fixtures, and the tests `container_cases`, `containers`, `loot_redirect` and `gray_stones`, plus the `run.sh` Unicode check.
- **Docs:** `docs/bridge-protocol.md` and the BIBLE.

The lenses are the same as round 12:
1. Functional parity with Electron, and that Electron's own behaviour is unchanged or better.
2. UX quality, from the code and the screenshots (28 scenarios, all PASS).
3. Architecture and correctness.

**How the findings were checked**
- This was a read-only review. Nothing was built, run or edited.
- Every finding was checked against the code. UX findings were also checked against the screenshots they name.
- Screenshots opened:
  - `container_cases/01`–`05`;
  - `containers/03`;
  - `loot_redirect/01`, `04`.
- Engine claims were checked in NetHack's source here:
  - `src/pickup.c`:
    - `lift_object` 1714–1810, `doloot_core` 2187–2296, `mbag_explodes` 2500–2519, `do_boh_explosion` 2530–2546, `boh_loss` 2549–2566;
    - the session code 2632–2639 and 2777–2804, `direct_container_common_checks` 2983–3073, `doshimcontainersnapshot` 3275–3306, `doshimcontainertransfer` 3309–3406;
    - `in_container` 3410–3564, `out_container` 3579–3629, `use_container` 3824–4081, `menu_loot` 4120–4249, `in_or_out_menu` 4252–4332.
  - `src/cmd.c`: `rhack` 3664–3800, with the hook at 3786.
  - `include/objects.h`: the gray appearances at 1373 and 1598–1604.
- Bridge claims were checked in `electron-poc/shim-bridge/nh-shim-bridge.c` against `git diff`. Electron's side was checked in:
  - `src/renderer.js`;
  - `src/shared/game-view-state.js`, `transfer-session.js` and `tile-assets.js`;
  - `src/ux/failure-presentation.js`.
- File times:
  - Sources: `src/pickup.c` 00:52:02, `src/cmd.c` 00:52:07, the bridge source and `renderer.js` 00:54:07, `tile-assets.js` 00:54:14, `src/allmain.c` 00:55:20.
  - Builds: `libnethack_core.so` 00:56:29, the fixture core 00:56:58.
  - The full run went from about 01:02:25 to 01:08:36. The first screenshot is at 01:02:44, after the last edit to a `.gd` file in scope (01:02:20).
  - Concurrent work changed things after the run, and none of it is reviewed here:
    - `src/allmain.c` changed again at 01:21:03 (new type and monster ids);
    - the fixture core was rebuilt at 01:21:46;
    - `art_gallery` and the new terrain tiles appeared from 01:17.
  - `zz_perf_probe` is a stale folder from 10-17.
- Paths are relative to `godot-poc/project/` unless they start with `electron-poc/`, `src/`, `include/`, `docs/` or `BIBLE.md`. Line numbers match the files as of this review.

**Counts:** 0 blocker, 0 high, 1 medium, 9 low (10 in total).

The most serious problems:
- Putting a bag of holding into a bag of holding through the screen makes it explode, as in NetHack. The engine then spends no turn and reports a refusal. The screen keeps listing the destroyed bag's contents (M1).
- "Take all" on a container with more than 53 stacks moves nothing and shows a developer message (L1).

---

## Round-12 verification

- **H1 (confused or engulfed: NetHack's command run twice): fixed.**
  - The engine checks confusion only for containers NetHack hasn't opened in this session (`src/pickup.c:3017-3023`). Engulfed or buried heroes are refused only for floor containers (`:3024-3042`).
  - `use_container` records the container after its lock and trap returns (`:3867-3870`). The hook runs before every command in `rhack` (`src/cmd.c:3786`). It clears the session for anything except the two direct container commands (`src/pickup.c:2786-2793`).
  - Direct commands reach `rhack` through `cmdq_add_ec(CQ_CANNED, …)` (`nh-shim-bridge.c:3594`, `3608`), so `func` is the direct command itself and the session survives them. A typed `#loot` arrives as `doextcmd`, so it clears the session before `doloot` records the container again. Map clicks are queued by `parse()` and go through the same dispatch.
  - Godot never re-runs NetHack's command after a redirect (`ui/dialog_host.gd:511-518`).
  - `container_cases` part 2: one `bridge_extcmd_answer`, and the screen opened (`godot.log`). `04-confused-loot` shows the "Confused" tag and the box's two items.
- **M1 (cursed bag rolled per batch): fixed.**
  - One direct transfer carries every id and returns `ECMD_TIME` once (`src/pickup.c:3337-3405`). The bridge parses up to 52 extra ids (`nh-shim-bridge.c:860-886`, `1590-1593`, `1616-1617`).
  - Godot sends one transfer per batch (`ui/dialogs/container_screen.gd:257-263`, `nethack_session.gd:324-330`).
  - `container_cases` part 1: "Take all" was 1 transfer and took T1 to T2. Part 3: three stacks came out of the cursed bag with exactly one apply prompt.
  - Closing the screen and pressing the action bar's Open before any other command still reuses the session without a new roll. That gives no more than keeping the screen open (one tty `#loot` can move everything both ways), so it isn't counted.
  - The remaining edge cases are M1 and L1 below.
- **M2 (box and chest on one square): fixed.**
  - The native-menu flag is used up only by a matching "Do what with…?" menu, and it clears at the next command prompt (`ui/dialog_host.gd:175-183`, `394-396`).
  - In `03-partial-native`, "Partial stacks…" led to NetHack's own "The large box is empty. Do what with it?" menu.
- **L1 ("done" row): fixed** (`ui/dialog_host.gd:413`).
- **L2 (named containers): fixed.** " named …" and " called …" are stripped (`:401`).
- **L3 (several containers picked): implemented** (`:415-437`). Godot answers "loot next container", and each screen opens after the previous one closes. It is untested (L7).
- **L4 (Electron gray stone): fixed for map cells.**
  - A `*` cell named "gray" or "gray stone" resolves to `gray-stone` (`electron-poc/src/shared/tile-assets.js:251-253`), and three new assertions cover it.
  - Only gray stones use "gray" among `*` objects. The "gray" spellbook (`include/objects.h:1373`) is excluded by the `*` check.
- **L5 (door tiles): documented** (`BIBLE.md:225`).
- **L6 (Electron's Esc bookkeeping): partly fixed.**
  - The prompt-cancellation check and `answeredWithEsc` honour `cancelled` (`electron-poc/src/renderer.js:7634-7638`, `7936`).
  - Two other consumers still look for keycode 27 (L3 below).
- **L7 (fixtures): mostly fixed.**
  - Fixture containers are made without NetHack's random contents (`src/allmain.c:3678-3684`).
  - Containers accept `beatitude` and `beatitudeKnown` (`:1788-1794`).
  - The hero has a `confused` field (`:2205-2213`, `3370-3371`). The new bits `0x400000`/`0x800000` don't collide with the other hero fields.
  - `gray_stones` does not require the gray-stone art, although the status says it does (L7 below).
- **L8 (NUL answer): fixed.** Keycode 0 now emits "" (`state/game_state.gd:295`), and `tests/run.sh` checks for "Unicode parsing error". No `godot.log` in the run has one.
- **L9 (docs and comments): fixed.**
  - `docs/bridge-protocol.md` is updated: §3.14 (946–966), §4.2 (1074), the end-of-game Esc note, gotcha 4, and the container commands (1272–1302).
  - The "here, loot it?" branch is gone, and the `QuestionDialog._cancel` comment is corrected (`ui/dialogs/question_dialog.gd:245-248`).
  - New gaps are in L8 and L9 below.

---

## Medium

### M1. A bag of holding that explodes in a direct transfer: no turn, a "refused" result, and a screen that keeps the vanished contents

**Area:** engine `doshimcontainertransfer`, `ContainerScreen` (also any loss of the container while the screen is open).

What happens:
- Putting a bag of holding, a charged wand of cancellation or a bag of tricks (or a container holding one) into a bag of holding blows it up inside `in_container`:
  - its contents scatter or are destroyed, the hero takes d(6,6), and the bag is deleted;
  - `in_container` then returns -1 (`src/pickup.c:3510-3546`, `:3563`).
- The direct path doesn't screen these items out (`:3363-3367`), and that is right: tty allows it too.
- The loop counts -1 as a refusal and stops (`:3377-3381`). When it was the first or only item, `moved` is 0:
  - the result is `rejected` with "NetHack stopped the container transfer";
  - the command returns `ECMD_OK`, so no game time passes (`:3402-3404`).
- tty's `menu_loot` returns `ECMD_TIME` whenever anything was picked (`n_looted = n`, `:4221-4248`), so there the explosion costs a turn. The same goes for items NetHack declines with a 0, such as "You cannot fit the large box into the sack." That is a turn in tty and none here.
- With the container gone, the bridge sends no contents snapshot (`nh-shim-bridge.c:1961-1962`).
- `ContainerScreen` never checks that its container still exists:
  - the left pane keeps the last snapshot (`ui/dialogs/container_screen.gd:117-126`);
  - the status reads "NetHack stopped the container transfer." (`refusal_sentence`, `:433-447`);
  - the next move is refused with "container is no longer at the hero's square or in the pack", shown as "That item isn't there any more." (`:439-440`).
- The same stale screen follows a nymph stealing the carried bag during the monsters' turn after a move.
- The engine half is shared, so Electron's direct transfers behave the same.

**Failure scenario:** the hero carries two unidentified bags, and both are bags of holding. She drags one onto the other's pane.
- NetHack prints "As you put a bag into the bag, you are blasted by a magical explosion!". She loses 20 HP, and her things scatter around her.
- The turn counter doesn't move.
- The screen still lists the six items that were in the bag and says "NetHack stopped the container transfer.". Pressing "Take all" says "That item isn't there any more."

**Fix:**
- Engine:
  - Return `ECMD_TIME` when any item was attempted, as `menu_loot` does, or at least when `in_container` returned -1.
  - Say in the result that the container is gone (a reason or a field).
- Godot:
  - After a container result, and on `inventory_changed` or `pile_changed`, close the screen when its container is neither on the hero's square nor in the pack.
  - Leave NetHack's messages in the feed undimmed.
- Test: a fixture with two bags of holding. Put one into the other, then assert one turn passed and the screen closed.

---

## Low

### L1. More than 53 stacks: "Take all" moves nothing and shows a developer message

**Area:** `ContainerScreen._take_all` and `_enqueue`, the bridge's `moreItemIds` cap.

- The engine and bridge take at most 52 extra ids (`src/pickup.c:2572-2575`, `nh-shim-bridge.c:871-874`, `1590-1593`). That is 53 stacks per command.
- Godot puts every id in one transfer with no cap (`ui/dialogs/container_screen.gd:248-249`, `257-263`).
- The bridge rejects the whole command. `refusal_sentence` has no rule for that reason, so the status reads "MoreItemIds must hold at most 52 unsigned integers."
- tty's "Take out what type? A" takes items until the pack is full, in one turn.
- **Failure scenario:** a late-game stash bag holds 60 different stacks. "Take all" moves none of them and shows the sentence above.
- **Fix:** let the engine accept any number of ids (or a "take all" flag that walks `cobj`), or cap at 53 in Godot and say how many stayed behind. Give the parser's rejection a plain sentence.

### L2. The usual stoppers are reported in jargon or wrongly, and there is no way to accept a heavier load

**Area:** `ContainerScreen.refusal_sentence`, `_on_result`.

- **Heavier load.** The direct paths refuse anything that would raise the hero's burden (`src/pickup.c:2748-2756`, `3157-3165`), where tty would ask "You have a little trouble removing … Continue?" (`:1771-1800`).
  - `refusal_sentence` has no rule for it, so the player reads "Direct transfer would require an encumbrance confirmation."
  - For the floor, the fallback to NetHack's own `,` or `d` triggers on `carry|capacity|too much|burden|…` (`:404`). "Encumbrance" doesn't contain "burden", so a single heavy pickup shows the jargon instead of NetHack's question.
- **Full pack.** "hero's knapsack cannot accommodate any more items" matches "cannot", so it reads "You can't do that right now." (`:445-446`).
- **NetHack said no.** A put-in NetHack declines ("You cannot fit the large box into the sack.", "The stone won't leave your person.") reads "1 of 2 moved. NetHack did not move the selected item."
  - NetHack's own sentence is only in the dimmed feed.
  - Floor batches quote NetHack's words for the same turn (`_check_batch`, `:359-369`).
- **Failure scenario:** a Valkyrie close to Stressed presses "Take all" on a chest. The screen says "3 of 5 moved. Direct transfer would require an encumbrance confirmation." Nothing tells her that "Partial stacks…" would let her say yes.
- **Fix:**
  - Map the reasons: "Carrying that would slow you down: use Partial stacks… to take it anyway.", and "Your pack is full."
  - Add "encumbrance" to the floor fallback.
  - For "did not move", quote NetHack's messages from that turn, as `_check_batch` does.

### L3. Electron: two Esc consumers still expect keycode 27

**Area:** Electron parity (round-12 L6 left these out).

- **Panel transfers.** During an Electron panel transfer, an answer counts as a cancel only for keycode 27 (`electron-poc/src/renderer.js:7882-7895`).
  - A mapped Esc now arrives as `q`, `n` or 0 with `"cancelled":true`.
  - So the transfer session gets `confirmed` ("confirmed by NetHack prompt/menu answer"), and `finishPending` records a success (`src/shared/transfer-session.js:619-622`).
- **Command transactions.** A transaction is failed as "cancelled by player" only for keycode 27 (`src/shared/game-view-state.js:1272-1277`). `src/ux/failure-presentation.js:50` depends on that.
- **Failure scenario:** an Electron pickup goes through NetHack's flow and asks "You have a little trouble lifting a +0 splint mail. Continue? [ynq]". Esc becomes `q`, nothing moves, and Electron records the transfer as confirmed.
- **Fix:** treat `cancelled === true` as Esc in these places, and add an assertion to Electron's transfer tests.

### L4. The open session spans turns, so a hero confused after the open skips confusion

**Area:** engine session (`src/pickup.c:2786-2793`, `3017-3023`).

- The session ends only at the hero's next ordinary command. Each direct move takes a turn, and monsters act in between. Inside the session, confusion is not checked.
- One tty `#loot` is one turn, so confusion can't start in the middle of it. The next `#loot` rolls confusion's effects (`:2211-2217`).
- **Failure scenario:** the hero opens a chest next to an umber hulk. After her first move its gaze confuses her. She goes on moving items with no confusion rolls.
- **Fix:** record whether the hero was confused when `use_container` ran, and refuse a hero who has become confused since. Godot then closes the screen with that reason.

### L5. The pack pane hides quivered ammunition and weapons that NetHack lets you stash

**Area:** `ContainerScreen._render`.

- The pane drops any item with a `wornMask` (`ui/dialogs/container_screen.gd:142`, `ui/item_text.gd:191-192`). The bridge sends `owornmask` (`nh-shim-bridge.c:3543`), which includes the wielded weapon, the alternate weapon and the quiver.
- `in_container` accepts all three. It unwields them or clears the slot (`src/pickup.c:3446-3462`). Only worn armor and accessories are refused (`:3425-3428`).
- The empty-pane text "Nothing to put in (worn and wielded things stay on you)." also shows when the pack is simply empty (`container_cases/04`, `loot_redirect/01`).
- **Failure scenario:** an archer wants to put her quivered arrows in her sack. They aren't listed, and only "Partial stacks…" can do it.
- **Fix:**
  - List wielded, alternate and quivered items with a small tag.
  - Keep worn armor and accessories out.
  - Say "Nothing to put in." when the pack is empty.

### L6. "Loot which containers?" offers counts that NetHack ignores

**Area:** `ui/dialogs/menu_dialog.gd:47-48`.

- Every pick-any menu gets "Type a number before a letter to take only that many." (`container_cases/01`).
- `doloot_core` uses only the picked containers and ignores counts (`src/pickup.c:2271-2274`).
- **Fix:** drop the count sentence for menus whose rows aren't item stacks, starting with "Loot which containers?".

### L7. Test gaps around the new paths

**Area:** `tests/scenarios/container_cases.gd`, `gray_stones.gd`.

- **Untested paths.** No scenario reaches:
  - a partial direct transfer ("N of M moved");
  - a refusal inside a batch;
  - the 53-stack cap;
  - several containers picked in "Loot which containers?" (round-12 L3);
  - a bag-of-holding explosion.

  Every container transfer in the run either fully succeeded or was the locked chest.
- **Weak assertions.**
  - `_confused` passes even if NetHack's confusion roll makes it "find nothing to loot". It counts only the `#loot` commands (`:103-111`). With this seed the screen did open.
  - `_cursed_bag` skips its checks if the bag ate items (`:134-136`).
- **Gray stones.** `gray_stones.gd:15` still falls back to `gem-class-icon` when the gray-stone asset is missing. Round 12 asked for the stone to be required, and its status says it is.
- **Fix:**
  - Add fixtures: a heavy item with a hero near Stressed, a box and chest with both picked, and two bags of holding.
  - Assert that the screen opened in `_confused`.
  - Require `gray-stone`.

### L8. Stale comments and dead code in `ContainerScreen`

- The class comment says several stacks go through `#loot` (`ui/dialogs/container_screen.gd:6-8`).
- The container branches in `_batch_ended` (`:300-301`) and `_batch_done` (`:315-316`) are unreachable: only floor batches call `_batch` (`:259-263`).
- `_on_contents` calls `_check_batch` (`:126`), but only floor batches set it up.
- **Fix:** update the comment and remove the dead branches.

### L9. Docs

- **BIBLE.**
  - Round 12's changes are folded into the round-11 decision line (`BIBLE.md:219-225`). There is no round-12 entry.
  - The roadmap row says rounds 6–11 and doesn't list `container_cases` (`:124`).
- **Protocol §4.5, `moreItemIds`** (`docs/bridge-protocol.md:1284-1287`). It doesn't say that:
  - a transfer where nothing moved takes no time;
  - a -1 from NetHack (a bag explosion) stops the remaining items;
  - the container may be gone, and then no snapshot follows;
  - the result's `itemId` is the first id only;
  - more than 52 extras reject the whole command.
- **Session paragraph** (`:1295-1302`). It reads as if an open session lifts the Schroedinger refusal. It never does: opening simply makes it an ordinary box (`src/pickup.c:3060-3064`).

---

## Already better than Electron (keep these)

- Rounds 1 to 12's lists still hold.
- Several stacks move in one direct transfer, one turn, with no NetHack menu in between. A cursed bag's losses are rolled once per open (`container_cases` part 1: T1 to T2; part 3: one apply).
- With a box and a chest on the square, a typed `#loot` shows NetHack's own picker and then the two-pane screen (`container_cases/01`, `02`).
- "Partial stacks…" always reaches NetHack's own menus, even on that square (`03`).
- A confused `#loot` runs once and opens the screen (`04`).
- A carried cursed bag the hero doesn't know is cursed opens in the screen after one apply, and the bag isn't in its own pack column (`05`).
- Picking several containers opens each one's screen in turn.
- Electron now draws unidentified gray stones as a dull pebble on the map, as Godot does.

---

## Status after the fix pass (2026-10-18)

- **M1:**
  - **Engine.** A direct transfer counts the items it handed to NetHack. Any attempt costs a turn (`ECMD_TIME`), as `menu_loot` does, including when NetHack declines ("You cannot fit the large box into the sack.").
  - When `in_container` blows the bag up (current container cleared, -1), the result ends "the container is gone".
  - **Godot.** `ContainerScreen` closes when its container is gone, on that result, or when the pack or the hero's pile no longer holds it (a theft). NetHack's lines stay in the feed; a notice appears only when NetHack said nothing.
  - **Test.** The new `container_cases` part 4 (two unidentified bags of holding, the hero at 60 HP): putting the empty bag into the other one blows up, takes a turn (T1 to T2) and closes the screen. One explosion line shows.
  - A bridge fix found on the way: with two identical carried bags, the redirect uses the letter just given at "What do you want to use or apply?".
- **L1:**
  - The engine and bridge take up to 256 extra ids.
  - `ContainerScreen` splits larger moves into chunks of 257.
- **L2:**
  - Encumbrance reads "Carrying that would slow you down: use Partial stacks… to take it anyway."
  - A full pack reads "Your pack is full."
  - The floor fallback now also matches "encumbrance".
  - When NetHack itself said no, the status quotes NetHack's lines from that turn.
  - `container_cases` part 5 (a heavy box and a heavily loaded hero): "2 of 3 moved. Carrying that would slow you down: use Partial stacks… to take it anyway."
- **L3:**
  - Electron's panel-transfer check, `game-view-state` and `shim-protocol` normalisation all honour `cancelled`.
  - `command-transaction-lifecycle-test.js` asserts that a mapped Esc fails the transaction as "cancelled by player".
- **L4:** each opened container records whether the hero was confused at the open. A hero confused since then is refused ("hero became confused since opening it"), and the screen says "You're confused now: open it again (NetHack's own menu)."
- **L5:**
  - The pack column hides only worn armor and accessories (`ItemText.is_worn_gear`). Wielded, alternate and quivered things are listed, and their names already say "(in quiver)" or "(weapon in hand)".
  - An empty pack reads "Nothing to put in."
- **L6:** "Loot which containers?" has its own hint, with no counts.
- **L7:**
  - `gray_stones` requires the gray-stone art.
  - `_confused` asserts that the screen opened.
  - New cases: the bag explosion, a partial heavy move, and both containers picked (the chest's screen, then the large box's).
  - The fixture loader accepts `hp`/`maxHp` in v1 scenarios, and any monster or object by its NetHack name (normalised).
- **L8:** the class comment is updated. The dead container branches in `_batch_ended` and `_batch_done`, and the `_check_batch` call on container snapshots, are removed.
- **L9:**
  - BIBLE: round-12 and round-13 decision entries, and roadmap rows 8–9.
  - Protocol: `moreItemIds` (256, partial results, turn cost, explosion), the open session (with the confusion-since-open rule), the corrected Schroedinger sentence, and `backgroundCmap` in §9.6.

**Also:**
- Greg's game was running when the normal core was rebuilt once in this pass. The check now runs on its own before any normal-core build.
- `backgroundCmap`, needed for doors and traps under the hero, is in the fixture core only. Godot falls back to a name table until the normal core is rebuilt, and that table goes once it is.
