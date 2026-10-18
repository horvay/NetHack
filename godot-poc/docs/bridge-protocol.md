# NetHack bridge protocol reference

This is the wire protocol between a game client and `nh-shim-bridge`
(`electron-poc/shim-bridge/nh-shim-bridge.c`). The bridge wraps NetHack 5.0's
shim window port (`win/shim/winshim.c`): every window-port callback NetHack
makes becomes a JSON line on the bridge's stdout, and every key the client
writes to stdin is queued for the next NetHack read. The Electron app and the
Godot front end use the same bridge. Godot compiles it unchanged into the
in-process core library (`godot-poc/extension/core/nhcore.c`).

The JSON examples come from real headless games run through the Godot harness
on 2026-10-17, with Godot's float numbers converted back to integers. Field
names and behaviour were checked against the bridge source. Functions are
cited by name rather than line number, because the file is still being
edited.

Status of this document:

- **Base protocol (sections 1 to 8):** what Electron uses today.
- **Extended events (section 9):** opt-in with `NH_BRIDGE_EXTENDED=1`. When
  this was written they were uncommitted working-tree changes still being
  developed, so check them against the source before relying on them.

---

## 1. Transport

### 1.1 Starting a game

- **Executable.** A standalone process (`electron-poc/shim-bridge/nh-shim-bridge`)
  or the Godot in-process core. In Godot, `NetHackCore.start(args, env)` and
  `send_line()` replace spawn and stdin; see
  `godot-poc/project/game/nethack_session.gd`.
- **Arguments.** Pass the character as one NetHack `-u` argument:
  `-uName-Rol-Rac-Gen-Ali`, for example `-uProtoCap-Val-Hum-Fem-Law`. Always
  pass the full form. The bridge's `shim_player_selection` and `shim_askname`
  callbacks do nothing, so nothing is ever asked interactively. With no
  arguments the bridge uses `-uElectron<pid%100000>-Val-Hum-Fem-Law`.
- **Environment variables:**

  | Variable | Effect |
  |---|---|
  | `NETHACKOPTIONS` | NetHack options. If unset, the bridge sets `!tutorial`. Electron always forces `!tutorial`. Consider adding `!tips` (see the getpos tip in §4.4). |
  | `NETHACKDIR` (or `NH_TEST_PLAYGROUND`) | Playground directory to `chdir` into. Defaults to `./playground`, then `../playground`. |
  | `NH_SHIM_NO_CHDIR` | Skip the `chdir`. |
  | `NH_SHIM_RESET_LOCKS=1` | Delete `alock.0`…`zlock.0` before starting. This is destructive, so it is opt-in. |
  | `NH_ELECTRON_CHOSEN_SEED` | RNG seed, decimal or `0x` hex. Reported in `bridge_seed`. |
  | `NETHACK_SEED` | Seed honoured only in fixture builds (`NH_ELECTRON_TEST_FIXTURES`); otherwise you get `bridge_seed_ignored`. |
  | `NH_BRIDGE_EXTENDED=1` | Enables the extended events and input in §9. Godot sets it. |
  | `NH_BRIDGE_PROTOCOL_CONTRACT=1` | Test mode: emits `bridge_start`, waits for one key, then exits. |
  | `NH_TEST_SCENARIO_ID`, `NH_ELECTRON_TEST_FIXTURES=1` | Fixture scenarios. These need a fixture build. |

### 1.2 Output framing (bridge stdout)

- One JSON object per line, terminated by `\n`.
- Stdout is unbuffered (`setvbuf(_IONBF)`), so a single line can arrive in
  several `write()` calls. Buffer the input and split on `\n`. A mutex keeps
  lines from interleaving.
- The bridge escapes strings itself: `\\`, `\"`, `\n`, `\r`, `\t`, and
  `\u00XX` for other bytes below 0x20. Bytes of 0x80 and above pass through
  raw. NetHack text is ASCII in practice.
- `emit_event_end` flushes after every event, except that it flushes
  `shim_print_glyph` only every 128 glyphs. Since the stream is unbuffered
  anyway, this makes no difference to a reader.
- There are two kinds of line:
  1. **v1 shim events.** Almost everything. Each starts with
     `{"type":"shim-event","name":"<name>"` and usually continues with
     `"fmt":"<shim arg signature>"` (debug only; ignore it), then the
     event's fields.
  2. **v2 envelopes.** These have no `type` field and start with
     `{"protocol":"nethack-electron-ui/v2", ...}`. Only `spell.rows` and
     `skill.rows` use this form (§3.12).
- Any field may be missing when it does not apply. The bridge omits fields;
  it never sends `null`.

### 1.3 Input framing (bridge stdin)

- One JSON object per line, at most 4095 bytes including the `\n`. A longer
  line is discarded. If it was a `ui-command`, the bridge emits
  `bridge_ui_command_rejected` with the reason "ui-command line exceeds
  bridge parser limit".
- The bridge routes on `"type"`:
  - `ui-command`, `ground-transfer`, `container-transfer`,
    `container-snapshot`, `equipment-change` and `terrain-action` are typed
    commands (§4.5).
  - `map-click` is extended input (§9.3).
  - Any other line, or a line with no `type`, is a key line (§4.1).
    Electron happens to send `"type":"keycode"`, but the value is not
    checked.
- **The parser is minimal and works by substring search**, so it has these
  quirks:
  - Key lines are scanned with `strstr`. If the text `"keycode"` appears
    anywhere in the line, even inside a string value, the line is treated as
    a keycode line.
  - In string fields, only the escapes `\n`, `\r`, `\t` and `\b` (the last
    only in `key`) are understood. Any other backslash keeps the next
    character literally, so `"\u001b"` arrives as the five keys
    `u 0 0 1 b`. **Send ESC and other control keys with `keycode`.**
  - Unsigned-integer fields in typed commands (`itemId`, `x`, `y`,
    `containerId`, `expectedRevision.*`) must be bare digits. `68.0`, `"68"`
    and `-1` are rejected with "… must be an unsigned integer field".
- **Godot gotcha.** `JSON.parse` turns every number into a float, and
  `JSON.stringify` writes floats as `68.0`. Convert ids with `int()` before
  building a typed command, or the bridge rejects it. A keycode such as
  `27.0` happens to work, because `strtol` stops at the `.`.
- If stdin closes, the bridge emits `bridge_stdin_closed` and then waits
  forever; it never invents keys. Electron kills it with SIGTERM.

---

## 2. Execution model and sequencing

NetHack runs on its own thread and calls window-port functions in order. The
bridge emits each call as it happens. **No display call ever blocks**, not
even `display_nhwindow(win, blocking=1)`. The game only stops when it needs
input, and then it waits on the bridge's key queue: a 1024-slot ring with
1023 usable slots.

Every input wait is announced by an event **before** the bridge blocks:

| What NetHack is doing | Event that opens the wait | `promptPurpose` | Event(s) after the key is consumed |
|---|---|---|---|
| Top-level command read, plus count digits and prefix keys like `F`, `m`, `g` (`nh_poskey`, `commandInp`) | `bridge_command_prompt` | `prompt.command` | `shim_nh_poskey`, then `bridge_direction_answer` |
| Map position or cursor (`getpos`, `getposInp`) | `bridge_direction_prompt` | `prompt.mapTarget` | `shim_nh_poskey`, then `bridge_direction_answer` |
| Direction read through `nh_poskey` (rare; only during `#repeat` or a queued readchar) | `bridge_direction_prompt` | `prompt.direction` | as above |
| Other `nh_poskey` reads | `bridge_direction_prompt` | `prompt.input` | as above |
| Yes/no, single key, `getobj` "What do you want to …", and normal `getdir` direction questions | `shim_yn_function` (`lifecycle:"opened"`) | `prompt.question`, `prompt.direction`, `prompt.equipmentRingFinger` | `bridge_prompt_answer` |
| Text line | `shim_getlin` (`opened`) | `prompt.lineInput` or `prompt.extendedCommand` | `bridge_line_answer` |
| `#` extended command | `shim_get_ext_cmd` (`opened`), then `bridge_extcmd_catalog` | `prompt.extendedCommand` | `bridge_extcmd_answer` |
| Menu selection | `shim_select_menu` (`awaitingSelection:true`) | `menuPurpose` | `bridge_menu_answer` |
| Raw `nhgetch` (not seen in practice in 5.0 shim games) | none in the base protocol (extended: `bridge_key_wait`) | n/a | `shim_nhgetch` |

**Before every `nh_poskey` and `nhgetch` wait** the bridge also emits:

1. `shim_update_inventory`: a full inventory snapshot, `reason` -2 for
   `nh_poskey` or -1 for `nhgetch`.
2. `shim_spell_availability`.
3. With extended events on, `bridge_vision` (only when it changed).

Yes/no, getlin, ext-cmd and menu waits do **not** get this snapshot.

**Every key you send is echoed immediately** as `bridge_command`, from the
stdin thread, as soon as the key is queued. The echo can arrive before or
after NetHack consumes the key.

### 2.1 A typical turn (pressing `l`)

```json
{"type":"shim-event","name":"bridge_command_prompt","query":"Choose a command.","choices":"","requestId":"shim-prompt-r4","transactionId":"shim-prompt-r4","lifecycleRevision":4,"lifecycle":"opened","requestSource":{"layer":"shim-bridge"},"owner":{"kind":"action"},"promptId":"shim-prompt-r4","promptPurpose":"prompt.command"}
{"type":"shim-event","name":"bridge_command","keycode":108,"queuedBefore":0,"queuedAfter":1,"activeRequestId":"shim-prompt-r4","activeRequestKind":"prompt","transactionId":"shim-command-3-108","requestSource":{"layer":"shim-bridge"}}
{"type":"shim-event","name":"shim_nh_poskey","fmt":"ippp","return":108,"queuedBeforePop":1,"queuedAfterPop":0}
{"type":"shim-event","name":"bridge_direction_answer","keycode":108,"queuedBeforePop":1,"queuedAfterPop":0,"requestId":"shim-prompt-r4","transactionId":"shim-prompt-r4","lifecycleRevision":4,"lifecycle":"answered","requestSource":{"layer":"shim-bridge"},"owner":{"kind":"action"},"promptId":"shim-prompt-r4","promptPurpose":"prompt.command"}
{"type":"shim-event","name":"shim_clear_nhwindow","fmt":"vi","window":1}
... shim_raw_print messages, shim_print_glyph cells, shim_status_update ...
{"type":"shim-event","name":"shim_cliparound","fmt":"vii","x":41,"y":17}
{"type":"shim-event","name":"shim_get_nh_event","fmt":"v"}
{"type":"shim-event","name":"shim_curs","fmt":"viii","window":2,"x":41,"y":17,"actorId":"hero"}
{"type":"shim-event","name":"shim_display_nhwindow","fmt":"vib","window":2,"blocking":0}
{"type":"shim-event","name":"shim_update_inventory","reason":-2,"revision":6, ...}
{"type":"shim-event","name":"shim_spell_availability","knownSpellCount":0,"authoritative":true,"source":"num_spells"}
{"type":"shim-event","name":"bridge_command_prompt", ... "requestId":"shim-prompt-r5", ...}
```

Rules that follow from this:

- **"Ready for a new command"** means `bridge_command_prompt` whose
  `transactionId == requestId`. When the `transactionId` belongs to an
  earlier key (for example `shim-command-11-70`), NetHack is still inside a
  command: a count (`3` then `s`), a prefix such as `F` (fight) waiting for
  its direction key, or similar. Both use the same event.
- **`shim_clear_nhwindow` on window 1** (the message window) comes right
  after each command key. Treat it as "start a new message batch"; do not
  erase the log.
- **`shim_curs(map, hero)` followed by `shim_display_nhwindow(map, 0)`** marks
  the end of a screen update. It is a good moment to render.
- **Never queue keys ahead of a prompt you have not seen.** Each prompt
  consumes whatever is next in the queue:
  - yes/no prompts silently **drop** keys that are not in `choices`, so stray
    queued keys disappear;
  - read-only menus consume **any** single key;
  - `getobj` asks again after an invalid letter.

  In one capture 146 queued keys were eaten by a single disclosure prompt.
  Wait for the prompt event, then send its answer.

---

## 3. Output events

Common conventions:

- `window` ids are integers the bridge assigns (§3.2).
- Map events carry `x` and `y` in NetHack coordinates (§5).
- Lifecycle metadata is described once, in §3.9.

### 3.1 Process and game lifecycle

| Event | Fields | When |
|---|---|---|
| `bridge_start` | — | First line. |
| `bridge_seed` | `seed` (decimal string), `source`: `"NH_ELECTRON_CHOSEN_SEED"`, `"NETHACK_SEED"` or `"system"` | Each time NetHack asks for a seed. **Usually twice** at startup. |
| `bridge_seed_invalid` | `value`, optional `source` | The seed variable could not be parsed. |
| `bridge_seed_ignored` | `reason` | `NETHACK_SEED` was set outside a fixture build. |
| `shim_init_nhwindows` | — | Window system init. |
| `shim_player_selection`, `shim_askname` | — | No-ops; the character comes from `-u`. |
| `shim_status_init` | — | Status system init. |
| `shim_exit_nhwindows` | `text` | NetHack is shutting down its windows (when it is called at all). |
| `shim_suspend_nhwindows` | `text`<br>(the bridge does not extract this field) | Not expected. |
| `shim_resume_nhwindows` | — | Not expected. |
| `bridge_exit` | `code`, plus `reason` in Godot (`"exit"`, `"abort"`, `"stopped"`, `"returned"`) or `"protocol-contract"` | See below. |
| `bridge_stdin_closed` | — | The stdin reader hit EOF. In Godot this follows `bridge_exit`. |
| `bridge_start_failed` | `code` | Godot core only: the bridge refused to start (playground, fixture checks...) and returned this code without starting NetHack. No `bridge_exit` follows; `game_ended` reports `reason:"returned"`. |
| `bridge_test_scenario_failed` | `id`, `message` | Fixture environment variables are misconfigured; the process exits with code 2. |

When `bridge_exit` appears:

- **Standalone bridge:** only if `nhmain` returns. It normally doesn't,
  because NetHack ends the process with `exit()`. Treat process exit as game
  over.
- **Godot core:** whenever NetHack ran: the host catches `exit()`,
  `abort()` and stops, and emits it (on a fresh line). A start the bridge
  refuses emits `bridge_start_failed` instead.

Startup order (captured):

1. `bridge_start`
2. `bridge_seed` ×2
3. `shim_init_nhwindows`
4. `create_nhwindow` → window 1 (message)
5. `shim_status_init`
6. `create_nhwindow` → window 2 (map)
7. `create_nhwindow` → window 3 (menu: NetHack's `WIN_INVEN`)
8. `shim_ctrl_nhwindow`
9. An empty `start_menu`/`end_menu` on window 3
10. `display_nhwindow` for windows 1 and 2
11. `shim_player_selection`
12. `cliparound`
13. `clear_nhwindow(2)`
14. A full status cycle
15. Every visible map cell
16. The legacy intro text, in a menu window (window 4, type 4): `putstr` ×N,
    then `display_nhwindow(4, blocking 1)` and `destroy_nhwindow(4)`
    straight away
17. `shim_putmsghistory`
18. `shim_raw_print`: "Velkommen ProtoCap, welcome to NetHack!  You are a
    lawful human Valkyrie."
19. The first `bridge_command_prompt`

### 3.2 Windows

Window types (`include/wintype.h`):

| Type | Name |
|---|---|
| 1 | `NHW_MESSAGE` |
| 2 | `NHW_STATUS` |
| 3 | `NHW_MAP` |
| 4 | `NHW_MENU` |
| 5 | `NHW_TEXT` |
| 6 | `NHW_PERMINVENT` |

- **Ids.** The bridge returns `next_winid++` starting at 1, so ids are never
  reused within a process. In a game the message window is 1, the map is 2,
  and NetHack's inventory menu window is 3.
- **No status window.** NetHack never creates an `NHW_STATUS` window here;
  status arrives only through `shim_status_update`.
- **Identify the map** by `windowType == 3`; don't hard-code 2.
- **Text windows.** NetHack uses `NHW_MENU` (type 4) windows for most text
  pages: the intro, enlightenment/attributes, and the getpos tip.

| Event | Fields | Meaning |
|---|---|---|
| `shim_create_nhwindow` | `return` (new window id), `windowType` | A window was created. |
| `shim_clear_nhwindow` | `window` | **Message window (1):** a new input cycle; NetHack clears the top line.<br>**Map window:** forget every cell; a full redraw follows. This happens at game start, on every level change, and on `#redraw`.<br>**Any window:** also resets the bridge's ground-pile bookkeeping (§3.11). |
| `shim_display_nhwindow` | `window`, `blocking` (0/1) | Show the window. Never blocks. For a text window this is your cue to show its accumulated lines. For the map it is a frame boundary. |
| `shim_destroy_nhwindow` | `window` | Window gone. Text windows are usually destroyed straight after `display_nhwindow(…, 1)`, so **keep the text and show it yourself** (as a modal or log entry); NetHack has already moved on. |
| `shim_curs` | `window`, `x`, `y`, `actorId:"hero"` (only when x,y is the hero's square) | Cursor position. On the map it is the hero at the end of each turn, and the **getpos cursor** during getpos (§4.4). |
| `shim_putstr` | `window`, `attr`, `text` | A line of text. `attr` is an `ATR_*` value (§5.6). Window 1 = a message (rare, see §3.5). Menu or text windows: append a line to that window. |
| `shim_raw_print` | `text` | A message (the main path, §3.5). |
| `shim_raw_print_bold` | `text` | The same, in bold. |
| `shim_display_file` | — (**the file name is not sent**) | NetHack wanted to show a help file. Nothing displayable reaches the client. |
| `shim_cliparound` | `x`, `y` | Hint to keep x,y (the hero) inside the viewport. Electron ignores it and centres on the cursor. |
| `shim_update_positionbar` | `text` | Not used in practice. |

### 3.3 Map cells: `shim_print_glyph`

One event per map cell change, emitted by `emit_print_glyph_fields`, always
followed by the ground-pile check (§3.11). NetHack only reports changes: a
cell keeps its last glyph, as the hero remembers it, until it is printed
again.

```json
{"type":"shim-event","name":"shim_print_glyph","fmt":"vi11pp","window":2,"x":41,"y":17,"glyph":725,"ttychar":64,"color":15,"tileidx":0,"glyphFlags":8193,"backgroundGlyph":4002,"backgroundChar":"<","semanticKind":"hero","semanticKnown":true,"semanticName":"hero","actionAffordances":[],"actorId":"hero","backgroundSemanticKind":"stairs","backgroundSemanticKnown":true,"backgroundSemanticName":"branch staircase up","backgroundActionAffordances":[],"featureDescription":"staircase up out of the dungeon","char":"@"}
{"type":"shim-event","name":"shim_print_glyph","fmt":"vi11pp","window":2,"x":41,"y":18,"glyph":1181,"ttychar":102,"color":15,"tileidx":0,"glyphFlags":8208,"backgroundGlyph":3992,"backgroundChar":".","semanticKind":"pet","semanticKnown":true,"semanticName":"kitten","actionAffordances":["monster.attitude.tame","monster.pet"],"actorId":"monster-64","backgroundSemanticKind":"floor","backgroundSemanticKnown":true,"backgroundSemanticName":"floor of a room","backgroundActionAffordances":[],"creaturePublic":{"attitude":"tame","size":"small","status":[]},"char":"f"}
{"type":"shim-event","name":"shim_print_glyph","fmt":"vi11pp","window":2,"x":40,"y":15,"glyph":3823,"ttychar":43,"color":11,"tileidx":0,"glyphFlags":0,"backgroundGlyph":3992,"backgroundChar":".","semanticKind":"object","semanticKnown":false,"semanticAppearance":"gold spellbook","objectId":4,"displayName":"a gold spellbook","actionAffordances":[],"groundPileSnapshotAuthoritative":true,"backgroundSemanticKind":"floor","backgroundSemanticKnown":true,"backgroundSemanticName":"floor of a room","backgroundActionAffordances":[],"char":"+"}
{"type":"shim-event","name":"shim_print_glyph","fmt":"vi11pp","window":2,"x":32,"y":13,"glyph":3932,"ttychar":45,"color":7,"tileidx":0,"glyphFlags":0,"backgroundGlyph":3932,"backgroundChar":"-","cmapIndex":3,"semanticKind":"wall","semanticKnown":true,"semanticName":"top left corner wall","actionAffordances":[],"backgroundSemanticKind":"wall","backgroundSemanticKnown":true,"backgroundSemanticName":"top left corner wall","backgroundActionAffordances":[],"char":"-"}
```

Hero standing on a pile (object layer present):

```json
{"name":"shim_print_glyph","window":2,"x":15,"y":11,"glyph":714,"ttychar":64,"color":15,"tileidx":0,"glyphFlags":8193,"backgroundGlyph":3992,"backgroundChar":".","semanticKind":"hero","semanticKnown":true,"semanticName":"hero","actionAffordances":[],"actorId":"hero","objectLayerGlyph":3686,"objectLayerChar":"(","objectLayerSemanticKind":"object","objectLayerSemanticKnown":true,"objectLayerSemanticName":"tinning kit","objectLayerObjectId":41,"objectLayerDisplayName":"a tinning kit (0:47)","objectLayerActionAffordances":[],"groundPileSnapshotAuthoritative":true,"backgroundSemanticKind":"floor","backgroundSemanticKnown":true,"backgroundSemanticName":"floor of a room","backgroundActionAffordances":[],"char":"@"}
```

**Core fields**

| Field | Type | Meaning |
|---|---|---|
| `window` | int | The map window. |
| `x`, `y` | int | Cell (§5.1). |
| `glyph` | int | NetHack glyph id of what is displayed (§5.4). **Omitted** for an unidentified gray stone (flint, touchstone, luckstone, loadstone), so they can't be told apart. |
| `ttychar` | int | The symbol code tty would draw (default ASCII symset). |
| `char` | 1-char string | `ttychar` if it is printable ASCII, else `" "`. |
| `color` | int | `CLR_*` 0–15 (§5.6); -1 if there is no glyph info. |
| `tileidx` | int | **Always 0** in this build (no tiles compiled). Don't use it. Omitted for unidentified gray stones. |
| `glyphFlags` | uint | `MG_*` bitmask (§5.5). |
| `cmapIndex` | int | Present only when `glyph` is a map-symbol (cmap) glyph: the `S_*` index (§5.4). |

**Semantic fields.** These are derived for the displayed glyph, with spoiler
protection.

| Field | Type | Meaning |
|---|---|---|
| `semanticKind` | string | `"hero"` when x,y is the hero's square (regardless of glyph). Otherwise: `pet`, `monster` (detected and ridden monsters are `monster` too), `corpse`, `statue`, `object`, `engulfment`, `trap`, `engraving`, `drawbridge`, `door`, `wall`, `floor`, `corridor`, `water`, `lava`, `stairs`, `fixture` (altar/fountain/sink/throne/grave/tree…), `terrain`, `warning`, `invisible` (remembered unseen monster, `I`), `unexplored`, `nothing`, `unknown`. |
| `semanticKnown` | bool | `false` only for objects whose type is not yet identified. |
| `semanticName` | string | **Only present when `semanticKnown` is true.** <br>Monster/corpse/statue: species name (`"kitten"`). <br>Object: type name (`"dagger"`). <br>Cmap/trap: a fixed English name from `cmap_semantic_name`, e.g. `"vertical wall"`, `"top left corner wall"`, `"tee up wall"`, `"no door"`, `"vertical open door"`, `"horizontal closed door"`, `"floor of a room"`, `"dark part of a room"`, `"dark corridor"`, `"lit corridor"`, `"up stairs"`, `"down stairs"`, `"branch staircase up"`, `"altar"`, `"fountain"`, `"molten lava"`, `"arrow trap"`, `"magic portal"`…<br>The hero cell is `"hero"`. |
| `semanticAppearance` | string | For unidentified objects: the appearance (`"gold spellbook"`, `"scroll labeled FOO"`, `"ruby"`). |
| `objectId` | uint | When the displayed glyph is an object on the floor: the NetHack `o_id` of the first matching floor object. Stable for the object's lifetime; this is the id used by direct commands. |
| `displayName` | string | NetHack's distant name for that object (`"a gold spellbook"`). |
| `actionAffordances` | string[] | Tokens for the displayed glyph (§3.3.1). Always `[]` on the hero cell. |
| `actorId` | string | `"hero"` on the hero cell, `"monster-<m_id>"` when a monster is actually at x,y. Use it to track creatures across moves. |
| `creaturePublic` | object | Monsters only, matching what farlook shows: `attitude` (`tame`/`peaceful`/`hostile`; omitted while hallucinating), `size` (`tiny`…`gigantic`), `status[]` (`"asleep"`, `"can't move"`, `"meditating"`, `"leashed to you"`, `"holding you"`, `"engulfing you"`, `"swallowing you"`, `"being held"`, `"trapped in a bear trap"`…). Never HP, AC or level. |

**Object layer.** Present when the displayed glyph is **not** an object but
the topmost floor object at x,y is seen (`dknown`); for example a monster or
the hero standing on an item.

The layer is only as fresh as the cell's last `shim_print_glyph`, and NetHack
reprints a square only when its glyph changes. The hero's glyph doesn't change
after a drop, after eating floor food to the end, or when a corpse under the
hero rots away, so the hero cell keeps the old layer then. In extended mode
the hero square's pile snapshot is always current (§9.6): read what lies under
the hero from it.

| Field | Meaning |
|---|---|
| `objectLayerGlyph` | Glyph of the topmost object (omitted for an unidentified gray stone). |
| `objectLayerChar` | Its class symbol (`)` if unknown). |
| `objectLayerSemanticKind` | Always `"object"`. |
| `objectLayerSemanticKnown`, `objectLayerSemanticName`, `objectLayerSemanticAppearance` | As for the main semantic fields. |
| `objectLayerObjectId`, `objectLayerDisplayName` | Id and display name of that object. |
| `objectLayerActionAffordances` | Affordance tokens for that object. |

**Background (terrain under the displayed thing).**

| Field | Meaning |
|---|---|
| `backgroundGlyph` | Terrain glyph under the cell, or `-1`. |
| `backgroundChar` | Printable symbol for it, when there is one. |
| `backgroundSemanticKind`, `backgroundSemanticKnown`, `backgroundSemanticName` | Semantics of the background glyph. |
| `backgroundActionAffordances` | Affordance tokens for the background. |

`effective_background_glyph_at` builds the background as follows:

1. It starts from NetHack's remembered background glyph.
2. If that is missing, unexplored, nothing, or generic floor/corridor/stone
   while the real terrain is something special (stairs, door, fountain,
   water…), it substitutes the real terrain from `back_to_glyph`.
3. A seen trap (`tseen`) replaces generic floor.

**Look fields**

| Field | Meaning |
|---|---|
| `featureDescription` | The dungeon feature at x,y as farlook's "also here" wording (`"staircase up out of the dungeon"`, `"fountain"`, `"doorway"`), or the name of a seen trap. Sent even when an object or monster covers it. |
| `engravingText` | Remembered engraving text, only after the hero has read it. |
| `groundPileSnapshotAuthoritative` | `true` when a `shim_ground_pile_snapshot` for this cell is (or is about to be) emitted. |

**Spoiler caveat.** The background, `featureDescription`, the object layer
and the door affordances read live game state at print time. In particular,
`door.locked` and `door.trapped` come from the real door mask, so they are
**not** public until NetHack says so ("This door is locked"). Don't show
those two tokens as known facts.

#### 3.3.1 Map affordance tokens

From `emit_action_affordances_array_at`:

- **Doors:** `door`, `door.open`, `door.closed`, `door.locked`*,
  `door.trapped`*. (*See the spoiler caveat above.)
- **Traps:** `trap.known`.
- **Fixtures:** `fixture.fountain`, `fixture.sink`, `fixture.altar`.
- **Containers:** `container`, when a box or chest is on the square or the
  object name contains chest/box/bag/sack.
- **Monsters:** `monster.attitude.tame`, `monster.attitude.peaceful`,
  `monster.attitude.hostile`, `monster.hostile-unknown` (while
  hallucinating), `monster.pet`, `monster.shopkeeper`,
  `monster.shopkeeper.id.<m_id>`.

The same token can appear twice. Dedupe it.

#### 3.3.2 Move semantics

NetHack reprints a cell when something leaves it, so you don't need to clear
old actor positions yourself. Electron still does, defensively, keyed on
`actorId`. Hero movement shows up as two prints (the old cell as terrain,
the new cell as hero) plus `shim_curs`.

### 3.4 Status: `shim_status_update`

```json
{"type":"shim-event","name":"shim_status_update","fmt":"vipiiip","field":18,"changed":-1,"percent":0,"color":8,"value":"11"}
{"type":"shim-event","name":"shim_status_update","fmt":"vipiiip","field":22,"changed":0,"percent":0,"color":8,"conditionMask":0}
{"type":"shim-event","name":"shim_status_update","fmt":"vipiiip","field":-1,"changed":0,"percent":0,"color":8}
```

| Field | Meaning |
|---|---|
| `field` | Status field index (table below); or `-1` (`BL_FLUSH`: end of a partial update cycle) or `-2` (`BL_RESET`: end of a full refresh). In captures, a full cycle ends with -2 and a partial one with -1. Treat either as "render the status line now". |
| `value` | String, for `field >= 0` other than 22. **Already formatted, without the label.** |
| `conditionMask` | Only for field 22: the `BL_MASK_*` bitmask. |
| `changed` | `1` the value went up, `-1` it went down, `0` no comparison. Seen as 0 on a full refresh. |
| `percent` | 0–100. Meaningful only for HP/Pw with the `hitpointbar` or status-hilite options; 0 otherwise. |
| `color` | `color & 0xFF` = `CLR_*` (8 = `NO_COLOR`, use the default), `color >> 8` = `HL_*` attribute bits (0x02 bold, 0x04 dim, 0x08 italic, 0x10 underline, 0x20 blink, 0x40 inverse). Without `hilite_status` options it is always 8. |

Fields only arrive when enabled. A default game sends 0–7, 9–14 and 17–20,
plus 22. Score (8), time (16, option `time`), experience points (21, option
`showexp`), HD (15, only while polymorphed) and 23–26 (5.0 status options)
appear only when turned on. **`shim_status_enablefield` is never emitted by
this bridge**: the port uses `genl_status_enablefield`. Infer which fields
are enabled from the ones that arrive.

| idx | name | tty format | Example value |
|---|---|---|---|
| 0 | `BL_TITLE` | `%s` | `"ProtoCap the Stripling        "` (padded) |
| 1 | `BL_STR` | ` St:%s` | `"18/01"` |
| 2 | `BL_DX` | ` Dx:%s` | `"14"` |
| 3 | `BL_CO` | ` Co:%s` | `"18"` |
| 4 | `BL_IN` | ` In:%s` | `"8"` |
| 5 | `BL_WI` | ` Wi:%s` | `"8"` |
| 6 | `BL_CH` | ` Ch:%s` | `"8"` |
| 7 | `BL_ALIGN` | ` %s` | `"Lawful"` |
| 8 | `BL_SCORE` | ` S:%s` | |
| 9 | `BL_CAP` | ` %s` | `""`, `"Burdened"`, `"Stressed"`, `"Strained"`, `"Overtaxed"`, `"Overloaded"` |
| 10 | `BL_GOLD` | ` %s` | `"\\G1E140F2E:0"` in the JSON, i.e. the text `\G1E140F2E:0` |
| 11 | `BL_ENE` | ` Pw:%s` | `"2"` |
| 12 | `BL_ENEMAX` | `(%s)` | `"2"` |
| 13 | `BL_XP` | ` Xp:%s` | `"1"` |
| 14 | `BL_AC` | ` AC:%s` | `"6"` |
| 15 | `BL_HD` | ` HD:%s` | |
| 16 | `BL_TIME` | ` T:%s` | |
| 17 | `BL_HUNGER` | ` %s` | `""`, `"Hungry"`, `"Weak"`, `"Fainting"`, … |
| 18 | `BL_HP` | ` HP:%s` | `"16"` |
| 19 | `BL_HPMAX` | `(%s)` | `"16"` |
| 20 | `BL_LEVELDESC` | `%s` | `"Dlvl:1  "` (padded; other branches use other text, e.g. `"Home 1"`, `"End Game"`) |
| 21 | `BL_EXP` | `/%s` | |
| 22 | `BL_CONDITION` | mask | `conditionMask` |
| 23 | `BL_WEAPON` | ` %s` | |
| 24 | `BL_ARMOR` | ` %s` | |
| 25 | `BL_TERRAIN` | ` %s` | |
| 26 | `BL_VERS` | ` %s` | |

**Gold encoding.** The gold value begins with an encoded glyph:
`\G` + 4 hex digits (a per-game random key) + 4 hex digits (the glyph number;
0x0F2E = 3886 = gold piece) + `:` + the amount. Strip `^\\G[0-9A-Fa-f]{8}`
and draw a gold icon, or show `$`. The amount follows the colon.

**Building the classic two lines.** Keep the latest value per field, trim
padding, and concatenate with the tty formats:

- Line 1: `TITLE St:… Dx:… Co:… In:… Wi:… Ch:… Align [S:…]`
- Line 2: `Dlvl $:gold HP:hp(max) Pw:pw(max) AC:… Xp:…[/exp] [T:…] [hunger] [cap] [conditions]`

**Condition bits** (`BL_MASK_*`):

| Bit | Name | Bit | Name |
|---|---|---|---|
| `0x00000001` | BAREH | `0x00008000` | PARLYZ |
| `0x00000002` | BLIND | `0x00010000` | RIDE |
| `0x00000004` | BUSY | `0x00020000` | SLEEPING |
| `0x00000008` | CONF | `0x00040000` | SLIME |
| `0x00000010` | DEAF | `0x00080000` | SLIPPERY |
| `0x00000020` | ELF_IRON | `0x00100000` | STONE |
| `0x00000040` | FLY | `0x00200000` | STRNGL |
| `0x00000080` | FOODPOIS | `0x00400000` | STUN |
| `0x00000100` | GLOWHANDS | `0x00800000` | SUBMERGED |
| `0x00000200` | GRAB | `0x01000000` | TERMILL |
| `0x00000400` | HALLU | `0x02000000` | TETHERED |
| `0x00000800` | HELD | `0x04000000` | TRAPPED |
| `0x00001000` | ICY | `0x08000000` | UNCONSC |
| `0x00002000` | INLAVA | `0x10000000` | WOUNDEDL |
| `0x00004000` | LEV | `0x20000000` | HOLDING |

The labels Electron uses (`src/shared/status-hud.js`): Bare hands, Blind,
Busy, Confused, Deaf, Iron, Flying, Food poison, Glowing hands, Grabbed,
Hallucinating, Held, Icy, In lava, Levitating, Paralyzed, Riding, Asleep,
Slimed, Slippery, Stoning, Strangled, Stunned, Submerged, Ill, Tethered,
Trapped, Unconscious, Wounded legs, Holding.

### 3.5 Messages

- **The shim never sets `iflags.window_inited`**, so NetHack sends almost
  every `pline` message through `shim_raw_print`, not through
  `putstr(WIN_MESSAGE)`. A few paths, such as the farlook result, still use
  `shim_putstr` with `window:1`. Treat both as messages.
- There is **no `--More--`**: messages never wait for a key.
- Prompt text (`query`) is not repeated as a message. Electron logs it
  itself.
- `shim_raw_print` also carries:
  - getpos autodescribe text while the cursor moves (`"floor of a room"`);
  - the count echo `"Count: 99"`;
  - NetHack's `impossible()` warnings (`"Program in disorder!"`, see §6.2).
- **Message history:**
  - `shim_getmsghistory` (no fields) returns NULL to NetHack.
  - `shim_putmsghistory` (no fields; **the text is not sent**) appears at
    startup.
  - `shim_doprev_message` returns 0, and `#prevmsg` shows nothing.

  Keep your own history.

### 3.6 Input-wait and key-echo events

**`bridge_command`.** Emitted for every key accepted into the queue.

```json
{"type":"shim-event","name":"bridge_command","keycode":100,"queuedBefore":0,"queuedAfter":1,"activeRequestId":"shim-prompt-r20","activeRequestKind":"prompt","transactionId":"tx-drop-1","requestSource":{"layer":"shim-bridge"},"guiAction":{"actionId":"item.drop","targetSelector":"b","targetText":"a dagger","commandPosition":1,"commandLength":2}}
```

| Field | Meaning |
|---|---|
| `keycode` | The key. 0 for the internal direct-command trigger (§4.5). |
| `queuedBefore`, `queuedAfter` | Queue length around the push. |
| `activeRequestId`, `activeRequestKind` (`"prompt"`/`"menu"`), `activeMenuTransactionId` | What was open when the key arrived. Includes the idle command prompt. |
| `transactionId` | The metadata's `transactionId`, or a generated `"shim-command-<n>-<keycode>"`. This becomes the bridge's active transaction (§3.9). |
| `requestSource` | `{"layer":"shim-bridge"}`. |
| `guiAction` | Echo of the key metadata sent: `actionId`, `label`, `targetSelector`, `targetText`, `followupPlan`, `expectedRequestId`, `commandPosition`, `commandLength`. |

**Other echo and rejection events**

| Event | Fields | Meaning |
|---|---|---|
| `bridge_input_queue_full` | `keycode`, `queuedBefore`, `queuedAfter`, active* | The queue is full; the key was dropped. |
| `bridge_unsupported_command` | `keycode`, `guiAction`? | The key is not in the allowed set (§4.1); it was dropped. |
| `bridge_semantic_followup_rejected` | `keycode`, `transactionId`?, `reason`, `guiAction` | The key carried `expectedRequestId` but that request is not the open one; it was dropped. |

**Wait events.** Lifecycle metadata in §3.9.

```json
{"type":"shim-event","name":"bridge_command_prompt","query":"Choose a command.","choices":"","requestId":"shim-prompt-r2","transactionId":"shim-prompt-r2","lifecycleRevision":2,"lifecycle":"opened","requestSource":{"layer":"shim-bridge"},"owner":{"kind":"action"},"promptId":"shim-prompt-r2","promptPurpose":"prompt.command"}
{"type":"shim-event","name":"bridge_direction_prompt","query":"Choose a direction or map target.","choices":"ykulnjbh.<>","requestId":"shim-prompt-r27","transactionId":"shim-command-42-46","lifecycleRevision":27,"lifecycle":"opened","requestSource":{"layer":"shim-bridge"},"owner":{"kind":"action"},"promptId":"shim-prompt-r27","promptPurpose":"prompt.mapTarget"}
```

- `query` and `choices` are **fixed strings**; they don't describe the
  actual question. The real question was printed just before as
  `shim_raw_print` (`"Where do you want to travel to?"`,
  `"Move cursor to the desired destination:"`).
- After the key is consumed:
  1. `shim_nh_poskey {return, queuedBeforePop, queuedAfterPop}`
  2. `bridge_direction_answer {keycode, queuedBeforePop, queuedAfterPop, …metadata, lifecycle:"answered"}`

  Both are emitted for command reads too, despite the name.
- `shim_nhgetch {return, queuedBeforePop, queuedAfterPop}` is emitted after
  a raw `nhgetch` read.

### 3.7 Prompts

**`shim_yn_function`.** A single-key question.

```json
{"type":"shim-event","name":"shim_yn_function","fmt":"css0","query":"What do you want to drop? [abcd or ?*]","choices":"","requestId":"shim-prompt-r6","transactionId":"shim-command-4-100","lifecycleRevision":6,"lifecycle":"opened","requestSource":{"layer":"shim-bridge"},"owner":{"kind":"action"},"promptId":"shim-prompt-r6","promptPurpose":"prompt.question"}
{"type":"shim-event","name":"bridge_prompt_answer","keycode":98,"requestId":"shim-prompt-r6","transactionId":"shim-command-4-100","lifecycleRevision":6,"lifecycle":"answered","requestSource":{"layer":"shim-bridge"},"owner":{"kind":"action"},"promptId":"shim-prompt-r6","promptPurpose":"prompt.question"}
{"type":"shim-event","name":"shim_yn_function","fmt":"css0","query":"In what direction do you want to dig? [hb>]","choices":"","requestId":"shim-prompt-r11", "...":"...", "promptPurpose":"prompt.direction"}
{"type":"shim-event","name":"shim_yn_function","fmt":"css0","query":"Really quit without saving?","choices":"yn", "...":"...", "promptPurpose":"prompt.question"}
```

| Field | Meaning |
|---|---|
| `query` | Full question text. `getobj` and direction prompts put the valid letters inside the brackets of the text. |
| `choices` | Valid keys. **Empty means any key is accepted.** `getobj` ("What do you want to …?") and `getdir` ("In what direction…?") pass empty choices. |
| `promptPurpose` | `prompt.equipmentRingFinger` when the query mentions `ring-finger`, or `Right or Left` with finger/ring, and choices contain `l` and `r`.<br>`prompt.direction` when the query contains "direction" (case-insensitive). This is how normal `getdir` arrives.<br>`prompt.question` otherwise. |
| `autoAnswered`, `autoAnswerReason:"queued-ring-finger"` | **Ring prompts only:** if the next queued key is in `choices` (or is ESC), the bridge answers immediately. You then see `shim_yn_function{… lifecycle:"autoAnswered"}` followed by `bridge_prompt_answer{keycode, autoAnswered:true}`. |

The default answer (`def`) is **not sent**. The bridge applies it when you
send Enter or Space.

**`shim_getlin`.** A text line.

```json
{"type":"shim-event","name":"shim_getlin","fmt":"vsp","query":"What do you want to write in the dust here?","requestId":"shim-prompt-r15","transactionId":"shim-command-14-45","lifecycleRevision":15,"lifecycle":"opened","requestSource":{"layer":"shim-bridge"},"owner":{"kind":"action"},"promptId":"shim-prompt-r15","promptPurpose":"prompt.lineInput"}
{"type":"shim-event","name":"bridge_line_answer","value":"Elbereth","requestId":"shim-prompt-r15","transactionId":"shim-command-14-45","lifecycleRevision":15,"lifecycle":"answered","requestSource":{"layer":"shim-bridge"},"owner":{"kind":"action"},"promptId":"shim-prompt-r15","promptPurpose":"prompt.lineInput"}
```

`promptPurpose` is `prompt.extendedCommand` if the query contains "command",
otherwise `prompt.lineInput`. A cancelled line (ESC) gives `value:""`, which
looks the same as an empty line.

**`shim_get_ext_cmd`.** The `#` prompt. It is followed by
`bridge_extcmd_catalog`.

```json
{"type":"shim-event","name":"shim_get_ext_cmd","fmt":"iv","awaitingSelection":true,"requestId":"shim-prompt-r18","transactionId":"shim-command-25-35","lifecycleRevision":18,"lifecycle":"opened","requestSource":{"layer":"shim-bridge"},"owner":{"kind":"action"},"promptId":"shim-prompt-r18","promptPurpose":"prompt.extendedCommand"}
{"type":"shim-event","name":"bridge_extcmd_catalog","commands":[{"index":0,"name":"#","description":"enter and perform an extended command","key":35,"flags":137},{"index":1,"name":"?","description":"list all extended commands","key":191,"flags":139},{"index":2,"name":"adjust","description":"adjust inventory letters","key":225,"flags":11}, "..."],"requestId":"shim-prompt-r18", "...":"..."}
{"type":"shim-event","name":"bridge_extcmd_answer","return":21,"value":"enhance","command":"enhance","requestId":"shim-prompt-r18","transactionId":"shim-command-25-35","lifecycleRevision":18,"lifecycle":"answered","requestSource":{"layer":"shim-bridge"},"owner":{"kind":"action"},"promptId":"shim-prompt-r18","promptPurpose":"prompt.extendedCommand"}
```

Catalog entries:

- **`index`:** NetHack's command table index.
- **`name`:** what you type after `#`.
- **`description`.**
- **`key`:** NetHack's default key binding.
  - 0 means no binding.
  - Values ≥128 are Meta keys (`0x80|c`). Values <32 are Ctrl keys.
  - **Most of these can't be sent** (§4.1); type `#name` instead.
- **`flags`:** a bitmask:

  | Bit | Flag | Bit | Flag |
  |---|---|---|---|
  | `0x1` | IFBURIED | `0x80` | CMD_M_PREFIX |
  | `0x2` | AUTOCOMPLETE | `0x200` | PREFIXCMD |
  | `0x4` | WIZMODECMD | `0x400` | MOVEMENTCMD |
  | `0x8` | GENERALCMD (takes no time) | `0x800` | MOUSECMD |
  | `0x20` | NOFUZZERCMD | `0x4000` | CMD_PARAM |

What the catalog contains:

- **Excluded:** internal and unavailable commands, and the shim's own
  direct-command entries.
- **Included:** wizard-mode commands (`wiz*`). Hide entries with `0x4` in
  normal play.
- **Captured size:** 163 entries, including `move*`, `rush*` and `run*`.

`bridge_extcmd_answer`:

- **`return`:** the command index, or -1 for unknown, an ambiguous prefix,
  or ESC.
- **`value`:** the typed text.
- **`command`:** the matched name.

**Matching** is a case-insensitive exact match, or else a unique prefix.

### 3.8 Menus

Order of events:

1. `shim_native_menu_context` (optional)
2. `shim_create_nhwindow` (type 4), unless the window is reused
3. `shim_start_menu`
4. `shim_add_menu` × N
5. `shim_end_menu`
6. `shim_select_menu`
7. *(wait for keys)*
8. `bridge_menu_answer`
9. `shim_destroy_nhwindow` (usually)

Every one of these events carries the menu lifecycle metadata (§3.9).

```json
{"type":"shim-event","name":"shim_start_menu","fmt":"vii","window":6,"behavior":0,"menuId":"shim-menu-6-r10","menuRequestId":"shim-menu-6-r10","requestId":"shim-menu-6-r10","transactionId":"shim-command-8-44","lifecycleRevision":10,"lifecycle":"opened","requestSource":{"layer":"shim-bridge","window":6},"owner":{"kind":"unknown","window":6},"menuPurpose":"menu.generic"}
{"type":"shim-event","name":"shim_add_menu","fmt":"vipi00iisi","window":6,"selector":0,"attr":7,"color":8,"itemflags":0,"glyph":9624,"glyphChar":32,"glyphColor":8,"tileidx":0,"semanticKind":"unknown","semanticKnown":true,"semanticName":"","actionAffordances":[],"menuId":"shim-menu-6-r10", "...":"...","text":"Weapons"}
{"type":"shim-event","name":"shim_add_menu","fmt":"vipi00iisi","window":6,"selector":97,"attr":0,"color":8,"itemflags":0,"objectId":68,"glyph":8026,"glyphChar":41,"glyphColor":6,"tileidx":0,"semanticKind":"object","semanticKnown":true,"semanticName":"dagger","actionAffordances":[],"publicClass":"weapon","filterGroups":["weapons"],"equipmentSlots":["mainHand","offHand"],"knownFields":{"beatitude":"blessed","enchantment":0},"ownership":{"state":"owned"},"menuId":"shim-menu-6-r10", "...":"...","text":"a blessed +0 dagger"}
{"type":"shim-event","name":"shim_end_menu","fmt":"vis","window":6,"prompt":"Pick up what?","menuId":"shim-menu-6-r10","menuRequestId":"shim-menu-6-r10","requestId":"shim-menu-6-r10","transactionId":"shim-command-8-44","lifecycleRevision":10,"lifecycle":"ready","requestSource":{"layer":"shim-bridge","window":6},"owner":{"kind":"ground","window":6},"menuPurpose":"ground.pickup"}
{"type":"shim-event","name":"shim_select_menu","fmt":"iiip","window":6,"how":2,"awaitingSelection":true,"menuId":"shim-menu-6-r10", "...":"...","lifecycle":"selecting","owner":{"kind":"ground","window":6},"menuPurpose":"ground.pickup"}
{"type":"shim-event","name":"bridge_menu_answer","window":6,"return":1,"selector":97,"queuedBeforePop":1,"queuedAfterPop":0,"activeRequestMatch":true,"inputMatchesMenuTransaction":false,"inputTransactionId":"shim-command-10-10","selectors":"a","menuId":"shim-menu-6-r10", "...":"...","lifecycle":"answered","menuPurpose":"ground.pickup"}
```

**`shim_start_menu`**

- `window`.
- `behavior`: `MENU_BEHAVE_*`. 0 is standard; 1 is the permanent-inventory
  menu.
- Starting a menu clears earlier entries for that window.

**`shim_add_menu` fields**

| Field | Meaning |
|---|---|
| `selector` | ASCII code of the accelerator letter, which is the key you send. **0 means a header or info row** (not selectable). If NetHack passed 0 for a selectable row, the bridge generates `a`–`z` then `A`–`Z`, counting the window's earlier selectable rows. |
| `text` | Row text. For inventory objects it is NetHack's public name, without the letter prefix (`"a +1 spear (weapon in right hand)"`). |
| `attr` | `ATR_*`; headers use 7 (inverse). |
| `color` | `CLR_*` from menucolors; 8 is the default. |
| `itemflags` | `MENU_ITEMFLAGS_*`: `0x1` SELECTED (preselected), `0x2` SKIPINVERT, `0x4` SKIPMENUCOLORS. |
| `glyph` | Item glyph. Headers and text rows use 9624 (`NO_GLYPH`). Floor items use **pile-top glyph variants** (§5.4): the dagger is 8026 here, versus 3482 in inventory. Omitted for an unidentified gray stone. |
| `glyphChar`, `glyphColor`, `tileidx`, `cmapIndex`? | As in §3.3. |
| `semanticKind`, `semanticKnown`, `semanticName`, `semanticAppearance` | As in §3.3. Text rows give `semanticKind:"unknown"` with `semanticName:""`. |
| `actionAffordances` | Glyph-based; usually `[]` for objects in menus. |
| `objectId` | When the row's identifier is a known object (inventory, floor or container contents), plus the item presentation fields `publicClass`, `filterGroups`, `equipmentSlots`, `knownFields`, `ownership`, `known`, `calledName`, `individualName` (§3.10). |

The bridge keeps at most 512 rows across all open menus; rows beyond that
are dropped.

**`shim_end_menu`**

- `window`, `prompt` (the menu title, `""` if none).
- Purpose classification is finalised here.

**`shim_select_menu`**

- `window`.
- `how`: 0 `PICK_NONE` (read-only), 1 `PICK_ONE`, 2 `PICK_ANY`.
- `awaitingSelection:true`.
- `lifecycle` is `"ready"` for read-only menus and `"selecting"` otherwise.
- **It always waits for keys, even when `how` is 0.**

**`bridge_menu_answer`**

| Field | Meaning |
|---|---|
| `return` | Number of items selected. 0 means none or cancelled. |
| `selector` | The last selector key chosen directly, or 0. |
| `selectors` | All chosen selector characters, as a string. Range picks are included. |
| `activeRequestMatch` | Whether this menu was the open request. |
| `inputMatchesMenuTransaction` | Whether the finishing key's transaction is the menu's. |
| `inputTransactionId` | The finishing key's transaction. |
| `queuedBeforePop`, `queuedAfterPop` | Queue length around the finishing key. |

**`shim_native_menu_context`.** Emitted by instrumented NetHack call sites
just before they build a menu. It labels the **next** `start_menu` (whichever
comes next).

```json
{"type":"shim-event","name":"shim_native_menu_context","fmt":"vsssbbis","menuPurpose":"inventory.displayInventory","ownerKind":"inventory","callsite":"invent.c:display_pickinv","finalFlow":false,"disclosureFlow":false,"how":-1,"pendingForNextMenu":true,"reason":"","transactionId":"shim-command-1-105"}
```

Purposes it sets:

| Purpose | Notes |
|---|---|
| `inventory.displayInventory` | The `i` menu. In 5.0 it is **`how` 1**: picking a letter opens the item-action menu. |
| `spell.rows` | |
| `skill.rows` | |
| `disclosure.finalInventory` | |
| `disclosure.finalAttributes` | The attributes page is putstr text, so this label carries over to the next real menu. |

Its fields:

- `how`: for skill and spell menus, the pick mode; for disclosure menus,
  NetHack's end-of-game `how` (§6).
- `reason`: the end reason text.

**`shim_message_menu`.** Emits only `return:0`. Not used in practice.

**Read-only menus as text.** The getpos tip is an example: a `how:0` menu
whose rows are all `selector:0` text lines. Show it and send one key (Space)
to dismiss it.

### 3.9 Lifecycle metadata (prompts and menus)

These fields are appended to prompt events, menu events and answers:

| Field | Meaning |
|---|---|
| `requestId` | Prompts: `"shim-prompt-r<rev>"`. Menus: `"shim-menu-<window>-r<rev>"`. |
| `promptId`, `menuId`, `menuRequestId` | The same value as `requestId`. |
| `lifecycleRevision` | `<rev>`: one counter shared by all prompts and menus, strictly increasing within a game. Drop events older than the request you are showing. |
| `lifecycle` | `opened`: start_menu, add_menu, prompts.<br>`ready`: end_menu, read-only select_menu.<br>`selecting`: pick menus.<br>`autoAnswered`.<br>`answered`: answers. |
| `transactionId` | The **active transaction** when the request opened (see below), else the `requestId` itself. |
| `requestSource` | `{"layer":"shim-bridge","window"?:n,"command"?:s}`. |
| `owner` | `{"kind":k,"window"?:n}`. `kind` comes from the purpose prefix: `container.`→container, `ground.`→ground, `inventory.`→inventory, `action.`→action, `system.`/`menu.`/`options.`/`spell.`→system, `prompt.equipment*`→equipment, other `prompt.*`→action. Native contexts can set `disclosure` or another kind. |
| `promptPurpose` | See §2. |
| `menuPurpose` | Set by `shim_native_menu_context`, or classified at `end_menu` from the title, case-insensitively: `ground.pickup` ("Pick up" + "what"), `ground.look` ("Things that are here"/"You see here"), `container.action` ("Do what with"), `container.category` ("Take out/Put in what type"), `container.takeOut`, `container.putIn`, `inventory.overview` ("Inventory"/"Possessions"), `system.startup`, `system.help` ("Help"/"command"), `system.status` ("attribute"/"conduct"/"score"), `action.choice` ("What do you want to"), else `menu.generic`. At `select_menu` a `how:0` generic menu becomes `menu.readOnlyInfo`. These are heuristics, so treat them as hints. |
| `nativeMenuCallsite`, `nativeEndReason`, `nativeEndHow`, `finalFlow`, `disclosureFlow` | Copied from the native context, when there was one. |

**Active transaction.**

- Every key sets the bridge's active transaction to the key's
  `transactionId`, or `"shim-command-<n>-<ch>"`.
- Typed commands set it to their transfer or transaction id.
- At `shim_get_nh_event`, when nothing is open and the queue is empty, it is
  cleared.
- So a follow-up prompt carries the transaction of the key that triggered
  it. That lets you tie "What do you want to drop?" to the `d` you sent.

### 3.10 Inventory: `shim_update_inventory`

```json
{"type":"shim-event","name":"shim_update_inventory","reason":-2,"revision":1,"inventoryRevision":1,"equipmentRevision":1,"items":[
 {"selector":97,"objectId":66,"text":"a - a +1 spear (weapon in right hand)","quantity":1,"glyph":3475,"glyphChar":41,"wornMask":256,"itemflags":0,"semanticKind":"object","semanticKnown":true,"semanticName":"spear","actionAffordances":["wield","wielded","engrave","name","inspect"],"publicClass":"weapon","filterGroups":["equipped","weapons"],"equipmentSlots":["mainHand","offHand"],"knownFields":{"beatitude":"uncursed","enchantment":1},"ownership":{"state":"owned"}},
 {"selector":98,"objectId":68,"text":"b - a blessed +0 dagger (alternate weapon; not wielded)","quantity":1,"glyph":3482,"glyphChar":41,"wornMask":1024,"itemflags":0,"semanticKind":"object","semanticKnown":true,"semanticName":"dagger","actionAffordances":["swap","wield","engrave","name","inspect"],"publicClass":"weapon","filterGroups":["equipped","weapons"],"equipmentSlots":["mainHand","offHand"],"knownFields":{"beatitude":"blessed","enchantment":0},"ownership":{"state":"owned"}},
 {"selector":99,"objectId":70,"text":"c - a blessed +3 small shield (being worn)","quantity":1,"glyph":3598,"glyphChar":91,"wornMask":8,"itemflags":0,"semanticKind":"object","semanticKnown":true,"semanticName":"small shield","actionAffordances":["takeOff","name","inspect"],"publicClass":"armor","filterGroups":["equipped","armor"],"equipmentSlots":["armor.shield","offHand"],"knownFields":{"beatitude":"blessed","enchantment":3},"ownership":{"state":"owned"}},
 {"selector":100,"objectId":71,"text":"d - 2 uncursed food rations","quantity":2,"glyph":3741,"glyphChar":37,"wornMask":0,"itemflags":0,"semanticKind":"object","semanticKnown":true,"semanticName":"food ration","actionAffordances":["hold","eat","throw","drop","name","inspect"],"publicClass":"food","filterGroups":["consumables"],"equipmentSlots":[],"knownFields":{"beatitude":"uncursed"},"ownership":{"state":"owned"}}]}
```

**When it is sent.** Always a **complete snapshot**; replace your inventory
each time.

- Before every `nh_poskey` wait (`reason` -2) and every `nhgetch` wait (-1).
- When NetHack calls `update_inventory` (`reason` from NetHack, usually 0).
- After a ground-transfer result (-31).
- With the active `transactionId` when there is one.

**Revisions.** `revision` equals `inventoryRevision`. Both it and
`equipmentRevision` go up by one on **every** snapshot. Use the latest
values in `expectedRevision` (§4.5).

**Item fields**

| Field | Meaning |
|---|---|
| `selector` | Inventory letter as an ASCII code. Items without a letter are skipped. |
| `objectId` | NetHack `o_id`, stable for the object's lifetime. |
| `text` | `"<letter> - <public name>"`. |
| `quantity` | Stack size. |
| `glyph`, `glyphChar` | `glyphChar` is the class symbol code. `glyph` is omitted for an unidentified gray stone. |
| `wornMask` | `W_*` bits; this is where equipment comes from (table below). 0 for an unidentified gray stone. |
| `itemflags` | Always 0. |
| `semanticKind` | `"object"`. |
| `semanticKnown`, `semanticName`, `semanticAppearance` | As in §3.3. |
| `actionAffordances` | Object tokens: `quiver`, `fire`, `throw`, `swap`, `wield`, `wielded`, `takeOff`, `remove`, `wear`, `wear.helmet`, `wear.gloves`, `wear.shirt`, `wear.cloak`, `wear.boots`, `wear.shield`, `wear.body`, `putOn`, `putOn.ring`, `putOn.amulet`, `putOn.eyes`, `hold`, `eat`, `quaff`, `read`, `study`, `zap`, `apply`, `engrave`, `rub`, `container`, `loot`, `pay`, `shop.unpaid`, `shop.unpaid.owner.<m_id>`, `drop`, `name`, `inspect`. An unidentified gray stone always gets `["hold","quiver","engrave","rub","throw","drop","name","inspect"]`. |
| `publicClass` | `weapon`, `armor`, `food`, `potion`, `scroll`, `spellbook`, `wand`, `ring`, `amulet`, `tool`, `gem`, `coin`, `other`. |
| `filterGroups` | Subset of `equipped`, `weapons`, `armor`, `consumables`, `magic`. |
| `equipmentSlots` | Slots the item *could* use: `mainHand`, `offHand`, `quiver`, `armor.helm`, `armor.gloves`, `armor.shirt`, `armor.cloak`, `armor.boots`, `armor.shield`, `armor.body`, `ring.left`, `ring.right`, `amulet`, `eyes`. |
| `knownFields` | Only facts the hero knows: `beatitude` (`blessed`/`uncursed`/`cursed`, once BUC is known), `enchantment` (weapons, armor, rings and weptools, once known), `charges` (wands and charged tools, once known), `erosion`, `corrosion`, `poisoned:true`. |
| `ownership` | `{"state":"owned"}` or `{"state":"unpaid"}`. |
| `known`, `calledName`, `individualName` | `known` is `{"naming":true}`, sent when the item type has a `#call` name or the object has its own name. `calledName` is the type's `#call` name; `individualName` is the object's own name. |

**`wornMask` bits.** This is the equipment snapshot; there is no separate
equipment event. Electron derives slots from it
(`src/shared/equipment-snapshot-adapter.js`).

| Mask | Slot | Mask | Slot |
|---|---|---|---|
| `0x1` W_ARM | armor.body | `0x200` W_QUIVER | quiver |
| `0x2` W_ARMC | armor.cloak | `0x400` W_SWAPWEP | offHand / alternate weapon |
| `0x4` W_ARMH | armor.helm | `0x10000` W_AMUL | amulet |
| `0x8` W_ARMS | armor.shield | `0x20000` W_RINGL | ring.left |
| `0x10` W_ARMG | armor.gloves | `0x40000` W_RINGR | ring.right |
| `0x20` W_ARMF | armor.boots | `0x80000` W_TOOL | eyes |
| `0x40` W_ARMU | armor.shirt | `0x100000` W_SADDLE | saddle |
| `0x100` W_WEP | mainHand | `0x200000`, `0x400000` | ball, chain |

### 3.11 Ground pile: `shim_ground_pile_snapshot`

```json
{"type":"shim-event","name":"shim_ground_pile_snapshot","window":2,"x":41,"y":17,"revision":10,"coord":{"x":41,"y":17},"source":"level.objects","authoritative":true,"items":[
 {"objectId":68,"displayName":"a blessed +0 dagger","quantity":1,"glyph":8026,"glyphChar":41,"objectClass":")","semanticKind":"object","semanticKnown":true,"semanticName":"dagger","actionAffordances":["wield","engrave","throw","drop","name","inspect"],"publicClass":"weapon","filterGroups":["weapons"],"equipmentSlots":["mainHand","offHand"],"knownFields":{"beatitude":"blessed","enchantment":0},"ownership":{"state":"owned"}},
 {"objectId":71,"displayName":"2 uncursed food rations","quantity":2,"glyph":8285,"glyphChar":37,"objectClass":"%", "...":"..."}]}
```

- **Contents.** Every **seen** (`dknown`) object at x,y, top to bottom. Item
  fields are the inventory ones (§3.10), with `displayName` instead of
  `text`, plus `objectClass` (the class symbol as a string). There is no
  selector. Containers are named by base type (`"a chest"`).
- **When it is emitted:**
  - Right after any `shim_print_glyph` of a cell that has seen objects, or
    that had a pile in the last snapshot (in that case `items:[]` means the
    pile is gone).
  - At `shim_get_nh_event` for the hero's square if no snapshot was sent.
  - After a ground-transfer result.
- **`revision`** is a global counter that increases with every snapshot.
- **Gotcha.** Every `shim_clear_nhwindow`, on **any** window, including the
  per-command message-window clear, forgets which cells had piles. So in
  base mode the empty "pile gone" snapshot is not guaranteed. Treat a
  reprinted cell without `groundPileSnapshotAuthoritative` as "no known pile
  here". (Extended mode always resends the hero's square when its pile
  changes, including to empty; see §9.6.)

### 3.12 Spells and skills

**`shim_spell_availability`.** Sent before every `nh_poskey` and `nhgetch`
wait.

```json
{"type":"shim-event","name":"shim_spell_availability","knownSpellCount":2,"authoritative":true,"source":"num_spells"}
```

**v2 rows envelopes.** These are emitted in the middle of the spell (`+`) or
`#enhance` menu, before `end_menu`. The menu itself still arrives as
`add_menu` rows.

```json
{"protocol":"nethack-electron-ui/v2","sequence":1,"eventId":"evt-spell-rows-1","eventType":"spell.rows","turn":1,"requestId":"shim-menu-5-r3","transactionId":"shim-command-1-43","source":{"layer":"core","window":5,"event":"native.spell.rows","authoritative":true},"revision":{"spell":1},"payload":{"menuId":"shim-menu-5-r3","revision":1,"classificationConfidence":"typed","rows":[{"name":"force bolt","selector":"a","level":1,"pwCost":5,"failure":0,"status":"100%"},{"name":"light","selector":"b","level":1,"pwCost":5,"failure":0,"status":"100%"}]}}
{"protocol":"nethack-electron-ui/v2","sequence":1,"eventId":"evt-skill-rows-1","eventType":"skill.rows","turn":6,"requestId":"shim-menu-7-r19","transactionId":"shim-command-33-10","source":{"layer":"core","window":7,"event":"native.skill.rows","authoritative":true},"revision":{"skill":1},"payload":{"menuId":"shim-menu-7-r19","revision":1,"classificationConfidence":"typed","rows":[{"name":"bare handed combat","currentRank":"Unskilled","canAdvance":false},{"name":"dagger","currentRank":"Basic","canAdvance":false}, "..."]}}
```

Spell rows:

- `name`, `selector` (string), `level`, `pwCost`, `failure` (percent).
- `status`: the retention text, e.g. `"100%"`.

Skill rows:

- `name`, `currentRank`.
- When `canAdvance` is true: `selector`, `nextRank`, `nextCost`.

`sequence` is a process-wide counter for v2 lines, and it starts at 1 in
each game.

### 3.13 Direct-command lifecycle events

There are five families: `ground_transfer`, `container_transfer`,
`container_snapshot`, `equipment_change` and `terrain_action`. Each emits
`shim_<family>_<stage>`:

| Stage | Meaning |
|---|---|
| `accepted` | Validated; a trigger key (`keycode` 0) is queued. |
| `queued` | NetHack read the trigger at the command prompt; the internal command is on NetHack's command queue. |
| `confirmed` | NetHack performed it. |
| `rejected` | Validation failed, or NetHack refused. |

Every stage carries:

- `commandId`, and `transactionId` when one is known;
- the family's fields;
- `reason`, on `confirmed`/`rejected`.

Results are delivered at the next `shim_get_nh_event`.

```json
{"type":"shim-event","name":"shim_ground_transfer_accepted","commandId":"cmd-gt-1","transactionId":"tx-gt-1","transferId":"xfer-1","itemId":68,"direction":"ground-to-inventory","coord":{"x":41,"y":17}}
{"type":"shim-event","name":"bridge_command","keycode":0,"queuedBefore":0,"queuedAfter":1,"activeRequestId":"shim-prompt-r22","activeRequestKind":"prompt","transactionId":"xfer-1","requestSource":{"layer":"shim-bridge"},"guiAction":{"actionId":"ground.transfer","label":"Ground transfer","commandPosition":1,"commandLength":1}}
{"type":"shim-event","name":"shim_ground_transfer_queued","commandId":"cmd-gt-1","transactionId":"tx-gt-1","transferId":"xfer-1","itemId":68,"direction":"ground-to-inventory","coord":{"x":41,"y":17}}
{"type":"shim-event","name":"shim_nh_poskey","fmt":"ippp","return":0,"queuedBeforePop":1,"queuedAfterPop":0}
... shim_raw_print "b - a blessed +0 dagger.", shim_update_inventory (reason -31), shim_ground_pile_snapshot ...
{"type":"shim-event","name":"shim_ground_transfer_confirmed","commandId":"cmd-gt-1","transactionId":"tx-gt-1","transferId":"xfer-1","itemId":68,"direction":"ground-to-inventory","coord":{"x":41,"y":17},"reason":"ground item picked up"}
{"type":"shim-event","name":"shim_nhbell","fmt":"v"}
```

Note that NetHack rings the bell (`shim_nhbell`) after the 0 trigger key.
This is harmless; suppress the bell right after a direct command.

Family fields:

| Family | Fields |
|---|---|
| ground_transfer | `transferId`, `itemId`, `direction` (`ground-to-inventory` / `inventory-to-ground`), `coord{x,y}` |
| container_transfer | `transferId`, `containerId`, `itemId`, `direction` (`container-to-inventory` / `inventory-to-container`) |
| container_snapshot | `sessionId`, `containerId`, `status` (`"ok"` or `"rejected"`), `failureKind`. `status` and `failureKind` come on the result, and `failureKind` only on rejection: `locked`, `trapped`, `stale-target`, `capacity`, `netHack-owned-flow-required`, `rejected`. |
| equipment_change | `action`, `itemId`, `slotId`, `hand` |
| terrain_action | `action`, `terrain`, `coord{x,y}`, `itemId` |

Examples of `reason` texts:

- Success: `"ground item picked up"`, `"ground transfer completed"`,
  `"container transfer completed"`, `"container snapshot refreshed"`,
  `"equipment change completed"`, `"terrain action completed"`.
- Refusal: `"public terrain no longer matches the requested action"`,
  `"container is locked"`, `"container contents have not been legitimately
  observed"`, `"shop pickup and drop require the normal NetHack flow"`,
  `"hero is carrying too much for direct ground transfer"`,
  `"another direct command is active"`, `"pending native command blocks
  ground transfer"`, `"active prompt/menu owner blocks ui-command
  (shim-menu-5-r3)"`.

### 3.14 Container contents: `shim_container_contents_snapshot`

Fields:

- `revision`.
- `sessionId`: yours, or `"container-<o_id>"`.
- `container{publicId:"container-<o_id>", displayName:<base type name>, objectId}`.
- `items[]`: the ground-pile item schema (§3.11).
- `transactionId`?

When it is emitted:

- When a menu classified `container.takeOut` opens and the current container's
  contents are known (`cknown`).
- After a container transfer, for a container on the hero's square or in
  the pack.
- After a successful `container-snapshot`.

The container must be on the hero's square or in the hero's pack (see
`container-transfer` and `container-snapshot` in §4.5).

### 3.15 Diagnostics

**`shim_native_end_diagnostic`.** Phases of the end of the game (§6).

```json
{"type":"shim-event","name":"shim_native_end_diagnostic","fmt":"vsississbbbiiiiib","phase":"really_done.final_killer","how":3,"finalFlow":true,"disclosureFlow":false,"taken":false,"cmdKey":115,"moves":1757,"depth":1,"dnum":0,"dlevel":1,"gameover":true,"pendingInputQueue":213,"killerFormat":1,"reason":"starvation","killerName":"starvation","killer":"starvation","callsite":"end.c:really_done/final_killer","transactionId":"shim-command-448-115"}
```

| Field | Meaning |
|---|---|
| `phase` | `done.enter`, `done.survived` (lifesaved or declined), `done.final`, `really_done.enter`, `really_done.final_killer`, `really_done.before_disclose`, `disclose.enter`. |
| `how` | End type (§6). |
| `reason` | Its name, e.g. `"quit"`, `"starvation"`. |
| `killerName`, `killerFormat`, `killer` | The killer summary. Final at `really_done.final_killer`. |
| `moves`, `depth`, `dnum`, `dlevel` | Turn count and location. |
| `gameover` | NetHack's game-over flag. |
| `finalFlow`, `disclosureFlow`, `taken`, `cmdKey` | Flow flags and the last command key. |
| `pendingInputQueue` | Keys still queued. |
| `activePromptRequestId`?, `activeMenuRequestId`? | What was open, if anything. |

The real killer text for death is the `really_done.final_killer` event, for
example `"killed by a jackal"` (`killerFormat` 1 = "killed by", 0 = "killed
by a/an", 2 = no prefix).

**`shim_native_command_diagnostic`.** Fields: `phase`, `callsite`,
`cmdKey`, `moves`, `depth`, `dnum`, `dlevel`, `nativePending`,
`pendingInputQueue`, and optional `transactionId`, `activePromptRequestId`,
`activeMenuRequestId`.

Phases seen:

- `stairs.down.before_transition` (`dodown`).
- `goto_level.target`, where `dnum`/`dlevel` are the **destination** and
  `nativePending` is the ledger number. This one is a **level-change
  signal**.
- `goto_level.invalid_ledger_done`.
- Save and lock phases.

### 3.16 Other callbacks (fields beyond `fmt`, if any)

| Event | Fields | Meaning |
|---|---|---|
| `shim_get_nh_event` | — | NetHack's idle tick, between commands and during multi-turn actions. The bridge uses it to deliver direct-command results and clear the transaction. |
| `shim_nhbell` | — | Beep. |
| `shim_delay_output` | — | Animation pacing hint (zaps, thrown objects). An optional short pause. |
| `shim_mark_synch`, `shim_wait_synch` | — | Flush hints. |
| `shim_number_pad` | `enabled` (0/1), `directionKeys` | Number pad mode changed. `directionKeys` is NetHack's `dirchars`: 10 characters in the order W, NW, N, NE, E, SE, S, SW, down, up (`"hykulnjb><"` for vi keys). |
| `shim_change_color`, `shim_change_background`, `shim_preference_update` | — | Ignore. |
| `shim_get_color_string` | `return:""` | Ignore. |
| `shim_ctrl_nhwindow` | — | Returns NULL. |
| `shim_update_inventory` | — | See §3.10. |
| `shim_doprev_message` | — | Returns 0. |
| `shim_player_selection_or_tty` | — | WASM builds only; never seen. |

**Never emitted by this bridge:**

- `shim_outrip` (§6).
- `shim_status_enablefield`.
- Any event for `putmixed`; NetHack uses `genl_putmixed`, which becomes
  `shim_putstr`.

---

## 4. Input lines

### 4.1 Keys

```json
{"key":"i"}
{"key":"#quit\n"}
{"keycode":27}
{"type":"keycode","keycode":32,"transactionId":"tx-7","expectedRequestId":"shim-menu-8-r26","guiActionId":"interaction.continue","actionLabel":"Continue","followupPlan":"continue"}
```

- **`key` or `keys`.** Every character in the string is pushed as its own
  key, in order. Recognised escapes: `\n`→10, `\r`→13, `\t`→9, `\b`→8.
  `\"` pushes `"` and `\\` pushes `\`. **`\uXXXX` is not decoded.**
- **`keycode`.** One integer key. If both are present, `keycode` wins.
- **Allowed keys:** 32–126, 4 (^D, kick), 8, 9, 10, 13, 27, 127. Anything
  else, including all other Ctrl keys (^P, ^X, ^T, ^F, ^A, ^R…) and Meta
  keys, is dropped with `bridge_unsupported_command`. Use the extended
  command instead: `#prevmsg`, `#attributes`, `#teleport`, `#redraw`,
  `#repeat`, `#overview`… (In extended mode Ctrl and Meta keys are allowed:
  see §9.4.) Keycode 0 is accepted but reserved for the bridge
  (a 0 read at the command prompt is NetHack's "mouse click"). **Never send
  it.**
- **Optional metadata**, echoed in `bridge_command.guiAction`. These fields
  are matched by substring, so keep them as top-level string fields:
  - `transactionId` (or `actionTransactionId`): becomes the key's
    transaction.
  - `expectedRequestId`: the key is **dropped** with
    `bridge_semantic_followup_rejected` unless that prompt or menu is the
    open one. This is a cheap guard against answering the wrong prompt; use
    it.
  - `actionId` (or `guiActionId`), `actionLabel`, `targetSelector`,
    `targetText`, `followupPlan`, `commandPosition`, `commandLength`: for
    display and logging only.

Electron sends exactly one key per line (`{"type":"keycode","keycode":N}`)
and suppresses duplicates within 75 ms. Multi-character `key` strings are
fine too.

### 4.2 Answering prompts

| Prompt | What to send | Notes |
|---|---|---|
| `bridge_command_prompt` | Any command key. | Counts: digits, then the command (`3s`). With `number_pad` on, `n` first. Prefixes (`F`, `m`, `g`, `G`) are followed by another command-prompt wait. |
| `shim_yn_function` with non-empty `choices` | One key from `choices`. | Keys outside `choices` are **silently dropped** and the prompt stays open. Enter or Space returns the hidden default, if NetHack has one. ESC is mapped as tty maps it (`win/tty/topl.c`): `q` if it is in `choices`, else `n`, else the default (which may be none, `'\0'`, and NetHack takes that as "cancel"); `bridge_prompt_answer` then carries `"cancelled":true`. When `choices` itself holds a hidden ESC, ESC is returned raw. Before 2026-10-18 ESC was returned raw, and at a question without `q` or `n` ("Which ring-finger, Right or Left? [rl]") NetHack printed `"Program in disorder!"` (an `impossible()`). |
| `shim_yn_function` with empty `choices` (`getobj`, `getdir`) | Any one key: an inventory letter, `-` (hands or fingers), `?` or `*` (NetHack opens a menu of choices), a direction key, `<`, `>`, `.` (self), or ESC. | `getobj` accepts a count first (`2` then the letter) and asks again after an invalid letter ("You don't have that object."). |
| `prompt.equipmentRingFinger` | `l` or `r`. | Queue it right after the `P`+letter keys; it is answered automatically. |
| `shim_getlin` | The text, then 10. | Printable characters only. Backspace (8/127) edits. ESC returns `""`. NetHack sees at most 79 characters. |
| `shim_get_ext_cmd` | Command name, then 10 (`enhance\n`). | A unique prefix works. ESC cancels (`return -1`). Typing `#name\n` at the command prompt does it in one go. |
| `bridge_direction_prompt` (`prompt.mapTarget`) | Cursor keys, then a pick key (§4.4). | One wait per key. |
| `shim_select_menu` | See §4.3. | |

### 4.3 Answering menus

The bridge collects keys until the menu is finished.

- **`how` 1 (PICK_ONE):** the first valid selector selects it and ends the
  menu. ESC returns 0 (nothing). Enter or Space with nothing selected
  returns 0.
- **`how` 2 (PICK_ANY):** send selectors, then Enter (10), CR (13) or Space
  to finish. ESC cancels everything.
  - **Counts:** digits before a selector set its count (`2a` = take 2 of
    item a). The count is capped at 999999 and applies only to the next
    selector.
  - **Ranges:** `a-e` selects every existing selector after `a`, up to `e`.
  - **No toggling.** Sending the same selector twice adds it twice. Unknown
    keys are ignored.
  - **Not supported:** tty's `,` (select all), `-` (unselect all), `@` and
    `<`/`>` paging.
  - **Preselected rows** (`itemflags & 1`) are **not** returned
    automatically. Send their selectors if they should stay selected.
- **`how` 0 (PICK_NONE):** any single key dismisses it. Electron sends
  Space.

Examples: `{"key":"a"}` (pick one), `{"key":"2ab\n"}` (2 of a, all of b),
`{"keycode":27}` (cancel).

For `how` 1, don't append `\n`: the stray Enter stays queued and goes to the
next prompt.

### 4.4 Map targets, travel and the mouse

- **No mouse in the base protocol.** The bridge ignores `nh_poskey`'s x, y
  and mod outputs.
- **Getpos** (`prompt.mapTarget`: travel `_`, farlook `;`, and spell, wand
  or jump targets) is driven by keys:

  | Key | Effect |
  |---|---|
  | `hjklyubn` | Move the cursor 1 square. |
  | `HJKLYUBN` | Move 8 squares. |
  | `.` `,` `;` `:` | Pick (normal, quick, once, verbose). |
  | `@` | Jump to self. |
  | `<` `>` | Cycle staircases and ladders. |
  | `_` | Cycle altars. |
  | `m`/`M` | Next/previous monster. |
  | `o`/`O` | Next/previous object. |
  | `d`/`D` | Next/previous door. |
  | `x`/`X` | Next/previous unexplored spot. |
  | `a`/`A` | Next/previous "anything interesting". |
  | `z`/`Z` | Next/previous valid position. |
  | `$` | Show valid positions. |
  | `#` | Toggle autodescribe. |
  | `"` | Filter. |
  | `!` | Menu. |
  | `?` | Help. |
  | ESC | Abort. |

  - **Where the cursor is:** follow the `shim_curs` events on the map
    window. During getpos they report the cursor, without `actorId` unless
    it is on the hero.
  - **Autodescribe text** for the square under the cursor arrives as
    `shim_raw_print`.
- **Click-to-travel the way Electron does it** (`sendTravelToCell` in
  `src/renderer.js`): send `_`, then one direction key per step from the
  current cursor to the target, then `.`. Keys move diagonally first.
  Caveats:
  - **Starting cursor.** `_` starts at the **previous travel destination**
    (`iflags.travelcc`) when there is one, not at the hero. Read the
    `shim_curs` that precedes the first `bridge_direction_prompt` instead of
    assuming the hero's square.
  - **First-use tip.** The first getpos of a game shows a tip (`how:0`
    menu, "Tip: Farlooking or selecting a map location") that **eats the
    next key**. Either start with `NETHACKOPTIONS` containing `!tips`, or
    send keys one at a time and dismiss the tip when it appears.
  - **Travel can be interrupted**, for example by a monster coming into
    view. `_` then `.` or `_` again, or `#retravel`, resumes it.
- **Extended map clicks** (§9.3) avoid all of this when available.

### 4.5 Typed commands

Rules shared by all typed commands:

- The line must be **one well-formed JSON object** (strictly parsed for the
  five direct commands).
- The command lives in a nested `command` object. The fields `protocol`,
  `commandType`, `commandId` and the target fields must **not** appear at
  wrapper level. Duplicate keys are rejected.
- `protocol` must be exactly `"nethack-electron-ui/v2"`.
- `commandId` is required. `transactionId` is optional and defaults to the
  command id.
- **Only send typed commands just after `bridge_command_prompt`**: nothing
  else may be open (a menu, yes/no, getlin…), the key queue must be empty,
  and no other direct command may be active. Otherwise you get an immediate
  `…_rejected` with a reason.

#### `ui-command`: an allow-listed key macro with a typed audit trail

```json
{"type":"ui-command","command":{"protocol":"nethack-electron-ui/v2","commandType":"action.execute","commandId":"cmd-drop-1","transactionId":"tx-drop-1","actionId":"item.drop","payload":{"actionId":"item.drop","route":{"command":"db"},"target":{"selector":"b","displayName":"a dagger"}}}}
```

Result:

```json
{"type":"shim-event","name":"bridge_ui_command_accepted","commandId":"cmd-drop-1","transactionId":"tx-drop-1","actionId":"item.drop","command":"db"}
```

The bridge then emits one `bridge_command` per key, with `guiAction`, and the
command runs as normal NetHack input. Its prompts are answered from the
queued keys. On failure:

```json
{"type":"shim-event","name":"bridge_ui_command_rejected","commandId":"cmd-bad-1","actionId":"item.teleport","reason":"actionId is not in bridge ui-command allowlist"}
```

Validation, in order:

1. `commandType` must be `"action.execute"`, and `actionId` is required.
2. **Forbidden hidden-fact keys:** the command object must not contain any
   of the key names `trueName`, `baseType`, `objectType`, `otyp`,
   `beatitude`, `buc`, `cursed`, `blessed`, `enchantment`, `charges`,
   `trapState`, `contents`, `locked`, `trapped`, `broken`. These are matched
   as quoted substrings, so they are also caught inside string values.
3. `payload.actionId` and `payload.route.actionId`, if present, must equal
   `actionId`. `route.keys` is not allowed.
4. `actionId` must be in the allowlist below.
5. Rules that set a target location need `target.location.kind` (or
   `targets.location.kind`) equal to that location. Rules with a prompt
   policy need `payload.promptPolicy` equal to it.
6. Nothing may own input, and the queue must be empty.
7. `payload.route.command` must match the rule:
   - a **literal** rule needs that exact string;
   - a **prefix** rule needs prefix + exactly one selector character, and
     that character must equal the public selector.

   The selector is taken from `payload.selector`, else
   `payload.route.selector`, else `target.selector` or
   `target.inventoryLetter` (or the same fields under `targets`). The ring
   rule also allows a trailing `l` or `r`.

| actionId | Route command | Constraints |
|---|---|---|
| `item.quaff` | `q` + sel | |
| `item.read.scroll`, `item.study`, `item.read.inscription` | `r` + sel | |
| `item.eat` | `e` + sel | |
| `item.drop` | `d` + sel | |
| `item.apply`, `item.lootOrApply` | `a` + sel | |
| `item.zap` | `z` + sel | |
| `item.throw` | `t` + sel | |
| `item.engraveWith` | `E` + sel | |
| `item.offer` | `O` + sel | |
| `item.pay` | `p` + sel | |
| `item.invoke` | `V` + sel | |
| `item.wear` | `W` + sel | |
| `item.takeOff` | `T` + sel | |
| `item.remove.accessory` | `R` + sel | |
| `item.wield.mainHand`, `item.wield.hold`, `slot.clear.mainHand` | `w` + sel | |
| `item.quiver`, `slot.clear.quiver` | `Q` + sel | |
| `item.putOn.ring` | `P` + sel [+ `l`/`r`] | |
| `item.putOn.accessory`, `item.putOn.eyes` | `P` + sel | |
| `slot.swapMainAlternate` | literal `x` | |
| `ground.openContainer` | literal `#loot\n` | location `ground`, promptPolicy `netHack-owned-followup` |
| `ground.tipContainer` | literal `#tip\n` | same |
| `ground.forceContainer` | literal `#force\n` | same |
| `ground.untrapContainer` | literal `#untrap\n` | same |
| `item.rub` | `#rub\n` + sel | location `inventory`, promptPolicy `netHack-owned-followup`, selector required |

Follow-up prompts (direction, "Really …?", menus) still appear and must be
answered with keys. A ui-command only guarantees that the right keys start
the action.

#### `ground-transfer`: pick up or drop one specific object

```json
{"type":"ground-transfer","command":{"protocol":"nethack-electron-ui/v2","commandType":"ground.transfer","commandId":"cmd-gt-1","transactionId":"tx-gt-1","payload":{"direction":"ground-to-inventory","transferId":"xfer-1","itemId":68,"coord":{"x":41,"y":17},"count":"all"}}}
```

Payload fields:

| Field | Required value |
|---|---|
| `direction` | `ground-to-inventory` or `inventory-to-ground`. |
| `transferId` | Required. It becomes the active transaction. |
| `itemId` | The non-zero `objectId`: from the ground pile when picking up, from inventory when dropping. |
| `coord` | `{x,y}`, a valid map square (the hero's square). |
| `count` | Must be the **string** `"all"`. |

Results: `shim_ground_transfer_*`. A confirm is followed by an inventory
snapshot (reason -31) and a ground-pile snapshot. Shops, a full pack and
similar cases are refused, so use the normal NetHack keys for those.

#### `container-transfer` and `container-snapshot`

```json
{"type":"container-transfer","command":{"protocol":"nethack-electron-ui/v2","commandType":"container.transfer","commandId":"cmd-ct-1","transactionId":"tx-ct-1","payload":{"direction":"container-to-inventory","transferId":"xfer-2","sessionId":"sess-1","containerId":123,"itemId":456}}}
{"type":"container-snapshot","command":{"protocol":"nethack-electron-ui/v2","commandType":"container.snapshot","commandId":"cmd-cs-1","transactionId":"tx-cs-1","payload":{"sessionId":"sess-1","containerId":123}}}
```

Container transfer:

- `direction`: `container-to-inventory` or `inventory-to-container`.
- `transferId` and `sessionId` are required.
- `containerId` and `itemId` must be non-zero.
- `moreItemIds` (optional, since 2026-10-18): up to 256 further item ids,
  moved the same way by the same command, as NetHack's own loot menu moves
  several. More than 256 rejects the whole command.
  - Items the direct path can't move (artifacts, a load needing NetHack's
    "Continue?", a full pack…) are skipped. When some moved, the result is
    `confirmed` with a reason like `"2 of 3 moved; <why>"`; `itemId` in the
    result is the first id only.
  - Time: one turn whenever NetHack was asked to move anything, even if it
    said no ("You cannot fit the large box into the sack."), as `menu_loot`
    spends one. Nothing attempted: no time.
  - A -1 from NetHack (a bag of holding blown up by what went in) stops the
    rest. The container is then gone: the reason ends in "the container is
    gone" and no contents snapshot follows.

Container snapshot: `sessionId` and `containerId` are required.

The container must be on the hero's square or in the hero's pack (since
2026-10-18). A snapshot marks the contents seen; a transfer needs them seen.
NetHack refuses locked and trapped containers, a bag of tricks, Schroedinger's
box (opening it makes it an ordinary box, so after NetHack's own open it is no
longer one) and other cases (reasons in §3.13).

**Open session.** A cursed magic bag and a confused hero are refused too,
unless NetHack's own `#loot` or apply has opened that container since the
hero's last command other than a direct container command (`use_container`
has then already rolled the bag's losses and confusion's effects). That is
how a front end takes over at the "Do what with…?" menu: snapshots and
transfers keep being accepted until the hero does anything else, so a cursed
bag's losses are rolled once per open, as in tty. A hero who becomes
confused after the open (a monster's turn between moves) is refused: one tty
`#loot` can't span that.

#### `equipment-change`

```json
{"type":"equipment-change","command":{"protocol":"nethack-electron-ui/v2","commandType":"equipment.change","commandId":"cmd-eq-1","transactionId":"tx-eq-1","expectedRevision":{"inventory":12,"equipment":12},"payload":{"action":"quiver","itemId":68,"slotId":"quiver"}}}
```

| action | itemId | slotId | hand |
|---|---|---|---|
| `takeOff` | required | any | must be empty |
| `removeAccessory` | required | any | must be empty |
| `wieldMain` | required | empty or `mainHand` | must be empty |
| `quiver` | required | empty or `quiver` | must be empty |
| `clearQuiver` | not needed | empty or `quiver` | must be empty |
| `wearArmor` | required | one of `armor.body`, `armor.cloak`, `armor.shirt`, `armor.helm`, `armor.gloves`, `armor.boots`, `armor.shield` | must be empty |
| `putOnRing` | required | `ring.left` or `ring.right` | `left` or `right`, matching `slotId` |

`expectedRevision` is optional. A value of 0 or a missing field skips the
check. Otherwise the field must equal the bridge's current
`inventoryRevision` or `equipmentRevision`; take them from the latest
`shim_update_inventory`.

#### `terrain-action`

```json
{"type":"terrain-action","command":{"protocol":"nethack-electron-ui/v2","commandType":"terrain.action","commandId":"cmd-ta-1","transactionId":"tx-ta-1","payload":{"action":"stairsDown","terrain":"stairs.down","coord":{"x":41,"y":17}}}}
```

| action | terrain | Extra |
|---|---|---|
| `stairsDown` | `stairs.down` | |
| `stairsUp` | `stairs.up` | |
| `ladderUp` | `ladder.up` | |
| `drink` | `fountain` | |
| `dip` | `fountain` | needs `itemId` |

`coord` must be valid. `expectedRevision.inventory` is optional. NetHack
rejects the action when the hero isn't actually on that terrain, e.g.
`"public terrain no longer matches the requested action"`.

---

## 5. Map semantics

### 5.1 Coordinates

- The map is `COLNO` × `ROWNO` = 80 × 21. Valid squares are **x 1..79,
  y 0..20**. Column 0 is never printed.
- Coordinates are NetHack's own and the same everywhere:
  - `print_glyph`, `curs` and `cliparound`;
  - snapshot `coord` fields;
  - typed command `coord` fields;
  - the extended `map-click` and `bridge_vision` index (`y*80+x`).
- No viewport clipping is applied; every cell arrives in absolute
  coordinates.

### 5.2 Level changes and clears

**Detecting a level change.** In a captured dig-down through a hole:

1. `shim_raw_print` "You fall through..."
2. `shim_native_command_diagnostic` with `phase:"goto_level.target"`
   (destination `dnum`/`dlevel`)
3. `shim_clear_nhwindow` on the **map window**
4. `shim_update_inventory`
5. `shim_status_update` field 20 = `"Dlvl:2  "`, then -2
6. The whole new level as `shim_print_glyph`
7. `shim_curs` and `display_nhwindow(map)`
8. The extended `bridge_vision` with the new `depth`

**What to do.**

- On a map clear, drop every cell, pile and actor position.
- Treat a change in status field 20 or in `bridge_vision.depth/dnum/dlevel`
  as the level identity.
- A map clear without a depth change is a redraw (`#redraw`, game start).

### 5.3 Remembered versus currently seen

NetHack sends the glyph the hero **remembers** for each cell, and only when
it changes. The base protocol has no "in view" flag. Practical signals:

- `semanticKind:"invisible"` (glyph 1532) is a remembered unseen monster.
- `glyphFlags & MG_DETECT` marks a monster sensed by detection or telepathy.
- `S_darkroom` (`cmapIndex` 20, "dark part of a room") is remembered floor
  that is not lit or not seen.
- The extended `bridge_vision` (§9.1) gives the exact per-cell "seen now"
  and "lit" bits; use it for fog of war.

### 5.4 Hero detection and glyph ranges

**Finding the hero.** Use `actorId == "hero"`, `semanticKind == "hero"` or
`glyphFlags & 0x1` (`MG_HERO`). `shim_curs` with `actorId:"hero"` gives the
hero's position at the end of each turn. Don't rely on a glyph number: the
hero glyph depends on role and gender (725 female Valkyrie, 714 female
Archeologist). Electron's `glyph == 725` check is a leftover.

**Glyph ranges** for this build (NetHack 5.0 tree, `include/display.h`,
`NUMMONS` 383, `NUM_OBJECTS` 481, `MAXPCHARS` 105). Glyph = range start + an
index into that range. These numbers change if the monster or object lists
change, so prefer the semantic fields.

| Range | First glyph | Count | Index meaning |
|---|---|---|---|
| Monster, male | 0 | 383 | `PM_*` (Valkyrie 342, kitten 32) |
| Monster, female | 383 | 383 | `PM_*` |
| Pet, male / female | 766 / 1149 | 383 each | `PM_*` |
| Invisible monster (`I`) | 1532 | 1 | |
| Detected, male / female | 1533 / 1916 | 383 each | |
| Corpse | 2299 | 383 | `PM_*` |
| Ridden, male / female | 2682 / 3065 | 383 each | |
| Object | 3448 | 481 | object index (dagger 34) |
| cmap: stone | 3929 | 1 | `S_stone` |
| cmap: walls, main / mines / Gehennom / Knox / Sokoban | 3930 / 3941 / 3952 / 3963 / 3974 | 11 each | `S_vwall`(1) … `S_trwall`(11) |
| cmap A: doors, floor, corridor, stairs, ladders | 3985 | 21 | `S_ndoor`(12) … `S_brdnladder`(32); glyph = 3985 + (cmap − 12) |
| Altars | 4006 | 5 | unaligned, chaotic, neutral, lawful, other |
| cmap B: grave … traps … | 4011 | 40 | `S_grave`(34) through the last trap |
| Zap beams | 4051 | 32 | 8 types × 4 directions |
| cmap C | 4083 | 10 | `S_digbeam`(78) … `S_goodpos`(87) |
| Swallow | 4093 | 383 × 8 | monster × 8 parts |
| Explosion | 7157 | 7 × 9 | 7 kinds |
| Warning | 7220 | 6 | levels 0–5 |
| Statue, male / female | 7226 / 7609 | 383 each | |
| **Pile top**, object | 7992 | 481 | object glyph + 4544 |
| Pile top, corpse | 8473 | 383 | |
| Pile top, statue male / female | 8856 / 9239 | 383 each | |
| Unexplored | 9622 | 1 | |
| Nothing | 9623 | 1 | |
| `NO_GLYPH` / `MAX_GLYPH` | 9624 | | Menu text rows. |

`cmapIndex` follows the `S_*` order in `include/defsym.h`. Ones you will
meet: 0 stone; 1–11 walls; 12 doorway (no door); 13/14 open door (vertical,
horizontal); 15/16 closed door; 17 iron bars; 18 tree; 19 room floor; 20
dark room floor; 21 engraved room; 22 dark corridor; 23 lit corridor; 24
engraved corridor; 25 up stairs; 26 down stairs; 27/28 ladders; 29–32 branch
stairs and ladders; 33 altar; 34 grave …; traps start at 49.

### 5.5 Glyph flags (`glyphFlags`)

| Bit | Flag | Bit | Flag |
|---|---|---|---|
| `0x0001` | MG_HERO | `0x0080` | MG_OBJPILE (more than one object stack) |
| `0x0002` | MG_CORPSE | `0x0100` | MG_BW_LAVA |
| `0x0004` | MG_INVIS | `0x0200` | MG_BW_ICE / SINK / ENGR |
| `0x0008` | MG_DETECT | `0x0400` | MG_NOTHING |
| `0x0010` | MG_PET | `0x0800` | MG_UNEXPL |
| `0x0020` | MG_RIDDEN | `0x1000` | MG_MALE |
| `0x0040` | MG_STATUE | `0x2000` | MG_FEMALE |
| | | `0x4000` | MG_BADXY |

Examples: hero 8193 = HERO|FEMALE; kitten 8208 = PET|FEMALE.

### 5.6 Colours and attributes

- **`CLR_*`:**

  | Value | Colour | Value | Colour |
  |---|---|---|---|
  | 0 | black | 8 | NO_COLOR (default) |
  | 1 | red | 9 | orange |
  | 2 | green | 10 | bright green |
  | 3 | brown | 11 | yellow |
  | 4 | blue | 12 | bright blue |
  | 5 | magenta | 13 | bright magenta |
  | 6 | cyan | 14 | bright cyan |
  | 7 | gray | 15 | white |

- **`ATR_*`** (for `putstr`/`add_menu` `attr`): 0 none, 1 bold, 2 dim,
  3 italic, 4 underline, 5 blink, 7 inverse. The flags 16 (urgent) and
  32 (no history) can be OR-ed in.

### 5.7 How Electron turns cells into tile art

Electron's rules live in `electron-poc/src/shared/tile-assets.js` and
`map-presentation.js`. A Godot port can reuse the data files as they are.

**Assets.**

- Root directory: `electron-poc/assets/tiles/`.
- `manifest.json`: `{version:2, tileSize:32, assets:[{id, name, category,
  categorySlug, installedPath, workflow, workflowLabel, sha256, …}]}`, 1044
  assets.
- `installedPath` is always
  `electron-poc/assets/tiles/generated/<categorySlug>/<id>.png`.
- Categories: `full-source-objects`, `full-source-monsters`,
  `objects-inventory`, `terrain-features`, `common-early-monsters`,
  `player-combo-avatars`, `player-pets-identity`, `traps-hazards`,
  `ui-status-overlays`.
- PNGs come in 32, 512 or 1024 pixels square; scale them to the cell.
- `tile-map.json`: `{char{}, glyphNumber{}, semanticName{}, semanticKind{}}`
  fallback tables, merged over built-in defaults.

**Slug rule.** `lower(name).replace(/[^a-z0-9]+/g,'-').trim('-')`.

**Lookup for a non-hero cell.** The first hit wins:

1. **Pets:** an alias by name (`little dog→little-dog-pet`,
   `kitten→kitten-pet`, `pony→pony-pet`, `dog`, `large dog`).
2. **Unidentified objects** (`semanticKnown:false`): the appearance.
   - `"scroll labeled X"` → `slug(X)` if it is a safe scroll asset.
   - `appearance + class noun` (`"ruby"` + `!` → `"ruby potion"`).
   - Subclass regexes for `[`, `)`, `(`.
   - Otherwise the class icon for the character.
3. **Corpses and statues:** strip "corpse of"/"statue of" and use the
   monster's art. Corpses get a red X overlay; statues are greyscaled.
4. **`semanticName`, resolved by kind** (`manifest[slug]` in a matching
   category, then `slug-object` or `slug-trap`), then the
   `tile-map.semanticName[slug]` table, then aliases.
5. `semanticAppearance`, resolved the same way.
6. The `glyphNumber[glyph]` table (a weak legacy table).
7. The class icon by character: `+ / ! = " * ? ) [ ( $ ` _ 0`.
8. The `semanticKind` table: `trap→arrow-trap`, `unexplored`/`nothing →
   unexplored-stone`, `terrain → generic-wall-fallback`.
9. The `char` table (`d→little-dog-pet`, `f→kitten-pet`, `#→lit-corridor`,
   `}→moat-water`…).

**Hero.** `${race}-${role}-${gender}-avatar`, then `${role}-role-avatar`,
then `hero-avatar`. Race, role and gender come from the `-u` string.

**Layering.**

- Walls, floors, corridors and doors are drawn by CSS, not PNGs.
- Monsters, the hero and items are drawn as sprites over a floor base.
- When `objectLayer*` is present, the order is terrain < object < actor.
- Pets get a green corner dot.

**Not implemented in Electron:** dimming for remembered or dark cells,
`glyphFlags`, and `MG_OBJPILE`.

**Caveats for a port.**

- Pets without an alias fall back to the char table (a tame large cat
  renders as a kitten).
- Unknown monsters render with a stand-in letter (a jackal shows the dog
  tile).
- Any unrecognised trap renders as `arrow-trap`.
- Prefer `semanticName`/`cmapIndex` over glyph numbers.

---

## 6. End of game

### 6.1 How it ends

`how` values: 0 DIED, 1 CHOKING, 2 POISONING, 3 STARVING, 4 DROWNING,
5 BURNING, 6 DISSOLVED, 7 CRUSHING, 8 STONING, 9 TURNED_SLIME, 10 GENOCIDED,
11 PANICKED, 12 TRICKED, 13 QUIT, 14 ESCAPED, 15 ASCENDED. Values below 10
are deaths.

Captured sequence for death by starvation (quitting is the same after
"Really quit without saving? [yn]" → `y`):

1. `shim_raw_print` "You die from starvation." (for quitting there is no
   such message)
2. `shim_native_end_diagnostic` phases, in order: `done.enter`,
   `done.final`, `really_done.enter`, `really_done.final_killer`,
   `really_done.before_disclose`, `disclose.enter`
3. The **DYWYPI disclosure prompts**, each a `shim_yn_function` with
   `choices` `"ynq"` (vanquished: `"ynaq"`):
   1. "Do you want your possessions identified?" `y` gives a
      `disclosure.finalInventory` menu (`how` 1); send ESC or Space to close
      it.
   2. "Do you want to see your attributes?" `y` gives the enlightenment text
      in a menu window: `putstr` ×N, then display and destroy.
   3. "Do you want an account of creatures vanquished?"
   4. "Do you want to see your conduct?"
   5. "Do you want to see the dungeon overview?"

   Prompts can be skipped when they don't apply. Answering `q` skips all the
   rest.
4. NetHack writes the record file and exits:
   - Standalone: the process exits.
   - Godot: `bridge_exit{"code":0,"reason":"exit"}` then
     `bridge_stdin_closed`.

### 6.2 What does not happen in this bridge

Because the shim never sets `iflags.window_inited`, NetHack's
`really_done()` treats the game as having no windows. So:

- **There is no tombstone.** `genl_outrip` is never called, and there is no
  `shim_outrip` event.
- There is no "Goodbye … You died in … with N points" summary window.
- There is no top-ten display (it may print "Cannot open file record" when
  the playground has no record file).

Build any death screen yourself from:

- `really_done.final_killer` (`killer`, `killerFormat`, `moves`, `depth`);
- the last status values (title, gold, depth);
- the disclosure text you collected.

**ESC at DYWYPI prompts** is mapped to `q` or `n` as tty does (§4.2); before
2026-10-18 it triggered NetHack's "Program in disorder" warning. `y`, `n` or
`q` are clearer. Electron auto-answers `y` to
every disclosure question and Space to every read-only menu once it has
seen game over.

### 6.3 Abandoning a game

- **Godot:** `stop_game()` unwinds the game thread and gives
  `bridge_exit{"reason":"stopped"}`. Clear stale `?lock.0` files before the
  next start (`NetHackSession.clear_stale_locks`).
- **Electron:** kills the process.

Saving (`S` / `#save`) works through the normal prompts.

---

## 7. Gotchas checklist

1. **Answer only the open prompt; never type ahead.** Use `expectedRequestId`
   when the answer is meant for a specific prompt.
2. **Send ESC and every control key as `keycode`**, never as `\u001b` inside
   `key`.
3. **Ctrl and Meta commands can't be sent in plain mode.** Use `#name`
   extended commands. With `NH_BRIDGE_EXTENDED=1` (§9.4) keycodes 1–255 are
   accepted except ^C (3) and ^Z (26).
4. **ESC at a yes/no prompt is mapped as tty maps it** (`q`, else `n`, else
   the default; the answer event then says `"cancelled":true`). Choices that
   hold a hidden ESC (`"ynq\033a"`) get it raw. Keys outside `choices` are
   silently discarded.
5. **Messages arrive as `shim_raw_print`** (mostly) and
   `shim_putstr(window 1)` (sometimes). There is no `--More--`.
6. **`display_nhwindow(…, blocking:1)` does not block.** Keep text-window
   lines after `destroy_nhwindow` and show them yourself.
7. **Read-only (`how` 0) menus still wait for one key**, and that key is
   consumed.
8. **The first getpos of a game shows a tip menu.** Set `!tips` or handle
   it.
9. **The direction question is a `shim_yn_function` with
   `promptPurpose:"prompt.direction"`**, and its valid keys appear only in
   the query text. `F` and other prefixes instead wait on another
   `bridge_command_prompt`.
10. **`bridge_command_prompt`'s `query` is a fixed string, and so is
    `bridge_direction_prompt`'s.** The real question is the preceding
    `shim_raw_print`.
11. **Inventory snapshots are complete and come before every command wait.**
    Revisions go up every time.
12. **The hero is `actorId:"hero"`, not a glyph number.** Glyphs depend on
    role and gender, and floor items in menus use pile-top glyphs.
13. **`tileidx` is always 0. `glyph` and `tileidx` are omitted for
    unidentified gray stones.** Code for missing fields.
14. **`semanticName` is present only when `semanticKnown` is true.** Never
    display a guessed identity.
15. **`door.locked` and `door.trapped` affordances leak hidden state.**
    Don't show them as facts.
16. **There is no tombstone, `shim_outrip` or `status_enablefield` event.**
    The `def` answer isn't sent, `display_file` has no file name, and
    `putmsghistory` has no text.
17. **Godot's JSON floats break typed-command integer fields.** Convert to
    `int` before serialising.
18. **Typed commands only work at the idle command prompt with an empty
    key queue.**
19. **The standalone bridge rarely emits `bridge_exit`.** Watch for process
    exit.
20. **`bridge_seed` is emitted twice.**

---

### 7.x `shim_display_file` (NetHack's help files)

`{"name":"shim_display_file","fmt":"vsb","file":"hh"}`, emitted in every mode. The shim had no `display_file`, so NetHack's help pages (`help`, `hh`, `opthelp`, `history`, `license`…) showed nothing. The bridge now reads the file through NetHack's dlb archive, like tty, and shows it as an ordinary text window: `shim_create_nhwindow` (type 3, NHW_TEXT), one `shim_putstr` per line (tabs expanded to 8 columns), `shim_display_nhwindow`, `shim_destroy_nhwindow`. A file that can't be opened gives NetHack's `Cannot open "<file>".` when it asked to complain. Both front ends show it with their text reader; Godot switches to a monospace font for text laid out in columns.

## 8. How Electron consumes the stream (for parity)

From `src/main/game-process.js`, `src/shared/shim-protocol.js`,
`game-view-state.js` and `renderer.js`.

- **Parsing.** Main splits stdout on newlines and `JSON.parse`s each line;
  bad lines become `shim-raw`.
  - `shim-protocol.js` validates and normalises known events, and drops
    unknown names.
  - Several bridge events are unknown to Electron, and it ignores them:
    `shim_nhgetch`, `shim_nh_poskey`, `shim_get_nh_event`,
    `shim_destroy_nhwindow`, `shim_cliparound`, `shim_init_nhwindows`,
    `shim_status_init` and `bridge_vision`.
  - v2 envelopes are validated and their `eventType` becomes the name.
- **Batching.** Main flushes on `setImmediate`, holds a batch from a map
  clear until the next display (or 50 ms), and flushes immediately on
  prompt and menu events.
- **Map state.**
  - Cells are stored by window and (x,y).
  - A map clear wipes cells, piles and actors, then defers rendering until
    the next display.
  - Each print marks the cell and its 4 neighbours dirty, because wall
    styling depends on neighbours.
- **Messages.** All `putstr`, `raw_print` and prompt `query` text goes into
  one log of 240 entries with consecutive duplicates dropped. Text in type 4
  and 5 windows is also kept per window and opened as a document on display.
- **Prompts.** Electron keeps one `activePrompt`. It rejects events with a
  stale `lifecycleRevision` and answers whose `requestId` doesn't match.
  `prompt.command` counts as "free".
- **Status.** Values are stored per field. Gold strips `\G…:`, Dlvl strips
  `Dlvl:`, and severities are computed locally (HP ≤25% danger, ≤50%
  warning).
- **Death.** Detected by a regex on messages plus
  `shim_native_end_diagnostic really_done.final_killer`; the game-over
  modal opens when the process exits.

---

## 9. Extended events and input (`NH_BRIDGE_EXTENDED=1`)

These are additive; Electron never sets the variable, so its stream is
unchanged. The Godot front end always sets it.

### 9.1 `bridge_vision`

Sent before `nh_poskey` and `nhgetch` waits, only while the game loop is
running, and only when the vision grid or depth changed.

```json
{"type":"shim-event","name":"bridge_vision","width":80,"height":21,"depth":2,"dnum":0,"dlevel":2,"blind":false,"cells":"0000…(1680 digits)…","dungeon":"The Dungeons of Doom","level":"oracle","wizardTower":false,"room":""}
```

- **`cells`:** one digit per square, row-major (`index = y*80 + x`). The
  digit is a bitmask:
  - **bit 0 (1):** the hero sees the square now;
  - **bit 1 (2):** the square is lit. In sight this is the real lighting
    including a carried light (`lit || templit`); out of sight it is only
    what the hero remembers (`waslit`), so lighting never leaks.

  So `0` means not in view (show remembered or fogged), `1` in view and
  dark, `3` in view and lit, and `2` remembered and lit.
- **`depth`, `dnum`, `dlevel`:** the level identity, a clean
  level-change signal.
- **`blind`:** whether the hero is blind.
- **`dungeon`:** the branch's name (`"The Gnomish Mines"`), for level
  labels.
- **`level`:** the special level's prototype (`"minetn"`, `"oracle"`,
  `"medusa"`, `"castle"`, `"astral"`...), `""` on an ordinary level.
- **`wizardTower`:** whether the hero is inside the Wizard's tower.
- **`room`:** the announced room the hero stands in: `"shop"`, `"temple"`,
  `"throne"`, or `""`. NetHack names these rooms on entry, so they give
  nothing away. Used for the music.
- The event is re-sent whenever the cells, the level identity, blindness or
  the room change.

### 9.2 `bridge_key_wait`

```json
{"type":"shim-event","name":"bridge_key_wait","inputState":0}
```

Emitted before a raw `nhgetch` wait, which otherwise has no opening event.
`inputState`: 0 other, 1 command, 2 getpos, 3 getdir.

### 9.3 `map-click` input

```json
{"type":"map-click","x":45,"y":10,"button":1}
```

- **Accepted** only while NetHack is reading a command (`commandInp`) or a
  map position (`getposInp`), for a valid square, with `button` 1 (left) or
  2 (right).
- **How it works:** the click is queued as one encoded key, and `nh_poskey`
  hands it to NetHack as a real mouse click with coordinates. NetHack then
  applies its own `click_to_cmd` rules:
  - at the command prompt, a left click travels to or moves toward the
    square (adjacent squares move or attack; clicking yourself acts on the
    square). A click on an adjacent door, or with `herecmd_menu` /
    `therecmd_menu` behaviour, can open NetHack's own action menu instead;
  - in getpos, a click picks that square.
- **Reply:** `bridge_map_click_accepted` or `bridge_map_click_rejected`
  `{x, y, button, inputState}`. A rejected click is never queued.
- **Clicks are only ever read as clicks.** An accepted click sits in the key
  queue; if NetHack moves on to a menu or a yes/no question before reading
  it, every other reader skips it (`click_pop_allowed`), so it can't be
  misread as an answer.

### 9.4 Control and Meta keys

In extended mode `keycode` accepts 1–255 except 3 (^C) and 26 (^Z), so
classic bindings such as ^P (previous message), ^X (attributes), ^T
(teleport) and Meta keys reach NetHack directly.

### 9.5 Godot core extras

- **Fixture scenarios** (tests only) run on `libnethack_core_fixtures.so`
  with `NH_ELECTRON_TEST_FIXTURES=1` and `NH_TEST_SCENARIO_ID` or an
  `NH_SHIM_TEST_*` scene switch. The bridge resolves scenario files from the
  working directory, so `NetHackCore.start` honours a pseudo-variable
  `NH_GODOT_WORKDIR` (a chdir, never exported).
- **Every per-game variable** (seed, fixture and test switches,
  `NETHACKOPTIONS`) is cleared before each start, so nothing leaks into the
  next game.

### 9.6 Extended-mode behaviour changes

These change what the bridge does, not only what it sends, and only with
`NH_BRIDGE_EXTENDED=1`:

- **Hero-pile resend.** At every `shim_get_nh_event` and at the
  command-level `nh_poskey`, the bridge compares a signature of the hero's
  square (object ids and quantities) with the last one sent. When it
  differs it sends a fresh `shim_ground_pile_snapshot` for that square,
  with `items:[]` when the pile is gone. A front end can therefore rely on
  the hero's pile being current at each command prompt, which the §3.11
  gotcha rules out in base mode.
- **Full menus, once per game.** At the first command-level `nh_poskey`
  the bridge sets `flags.menu_style` to `MENU_FULL`, once. Godot's screens
  rely on full menus (class pickers, "what type of" menus). The player can
  still change it with `O` afterwards; the bridge never resets it again.
- **Worm tails.** A long worm's tail segments carry `actorRole:"tail"` on
  `shim_print_glyph`, so they aren't drawn or announced as separate worms.
  While the hero hallucinates they carry `actorId:"segment-x-y"` instead.
- **Terrain under things.** `shim_print_glyph` carries `backgroundCmap`: the
  cmap index (`defsym`) of the terrain or trap under a creature or object
  (`trap_to_defsym` for traps). A front end draws the square from it exactly
  as when nothing stands there: doors, traps and engravings under the hero.
- **Question defaults.** `shim_yn_function` (opened) carries
  `"default":"y"` (one character) when NetHack's caller passed a default:
  the answer Enter or Space gives, the `(y)` tty shows after `[ynq]`.
  Godot highlights it and Enter picks it, as tty does.

The bag-name rule (`public_container_name`: a bag of holding or tricks
looks like "bag" until identified) is a spoiler fix and applies in both
modes.
