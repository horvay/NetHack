# NetHack contextual action bar plan

Planning only. No UI or gameplay code was changed.

GUI-first follow-up: see [`context-action-bar-gui-first-plan.md`](./context-action-bar-gui-first-plan.md) for modern button/dialog/picker flows that replace raw NetHack letter prompts.

## Scope and source anchors

The action bar should expose the actions most likely to be useful for the hero's current map context: the square being occupied, visible/known objects on that square, known special state for that square, and adjacent interactables. Source anchors used for this inventory:

- Terrain types and `struct rm` feature flags: `include/rm.h`.
- Display symbols and trap names: `include/defsym.h`.
- Existing bridge semantic classification: `electron-poc/shim-bridge/nh-shim-bridge.c`.
- Lua map metadata precedent: `src/nhlua.c`.
- Existing command bindings: `win/Qt/qt_main.cpp`, `include/extern.h`, plus command implementations in `src/lock.c`, `src/pickup.c`, `src/pray.c`, `src/potion.c`, `src/engrave.c`, `src/trap.c`, `src/sit.c`, `src/sounds.c`, `src/shk.c`, `src/hack.c`.

## Context inventory and button affordances

Legend for interaction needs:

- `current`: command acts on the hero's square.
- `adjacent`: command needs an adjacent map direction.
- `direction`: NetHack prompts for direction, which may be `.`, `<`, `>`, or a compass direction depending on command.
- `inventory`: command prompts for an inventory object.
- `quantity`: command can ask how many.
- `confirm`: command can ask yes/no.
- `text`: command prompts for typed text.

| Context | Detection source | Buttons to consider | NetHack command(s) | Interaction needs and notes |
|---|---|---|---|---|
| Empty room floor, corridor, dark room, lit corridor | `ROOM`, `CORR`, `S_room`, `S_corr`, `S_darkroom`, `S_litcorr` | Wait, Search nearby, Look, Travel | `.` wait, `s`, `;`/look mode if wired, `_` travel if available | current. Search consumes a turn and is important for hidden doors/traps. |
| Engraving on floor/corridor | `S_engroom`, `S_engrcorr`; core engraving list needed for reliable text | Read engraving, Engrave, Wipe, Search | look/read via `;` or core affordance, `E`, `#wipe`, `s` | current. Engrave requires inventory selection and text prompt. Wipe may confirm/consume turn. Renderer currently only sees semantic `engraving`, not actual text. |
| Single item on ground | object glyph, object list on `level.objects[u.ux][u.uy]` | Pick up, Inspect, Eat if food/corpse, Loot if container, Pay if unpaid, Drop | `,`, `:`, `e`, `#loot`, `#pay`, `d`/`D` | current, inventory for some follow-up. Pick up may skip menu for one item or ask quantity. Need object identity, count, unpaid flag, food/container class. |
| Ground item pile | top glyph plus object chain | Pick up, Pick up all, Browse pile, Eat food, Loot container, Pay | `,`, possibly `m,` or menu, `#loot`, `#pay`, `e` | current, quantity and selection. Need pile count, top item, object classes, unpaid/owned flags. |
| Gold on ground | gold object | Pick up gold, Pay if in shop | `,`, `#pay` | current, possibly quantity. |
| Corpse, egg, tin, glob, food ration on ground | object types/classes, corpse glyph | Eat, Pick up, Offer if on altar, Inspect | `e`, `,`, `#offer` | current. Eat uses inventory or floor context in modern item actions, may prompt if multiple edible items. Offer only meaningful on altar and consumes current square corpse from floor. |
| Container on current square: chest, large box, ice box, bag, sack, statue | `Is_container`, `Is_box`, object `olocked`, `otrapped`, `tknown`; statue can contain contents | Loot, Force lock, Untrap, Pick up, Kick | `#loot`, `#force`, `#untrap`, `,`, `^D` kick | current for floor container. Loot may ask which container if several, may expose locked/trapped prompt. Force requires inventory weapon/tool and confirm. Untrap may ask target. |
| Boulder on current or adjacent square | object `BOULDER`, adjacent object chain | Push/Move, Kick, Squeeze/Move around, Pick up if giant/strong conditions | movement key, `^D`, `,` | adjacent/current. Push is movement into boulder direction, not separate command. Kick asks direction. Needs adjacent directions with boulder. |
| Stairs up | `STAIRS` plus `On_stairs_up`, glyph `S_upstair` or `S_brupstair` | Ascend, Travel, Sit, Search | `<`, `_`, `#sit`, `s` | current. Ascend may be blocked by branch rules or carrying Amulet in some branches. Branch metadata useful for label. |
| Stairs down | `STAIRS` plus `On_stairs_dn`, glyph `S_dnstair` or `S_brdnstair` | Descend, Travel, Sit, Search | `>`, `_`, `#sit`, `s` | current. May prompt or block in special levels. |
| Ladder up/down | `LADDER`, `LA_UP`, `LA_DOWN`, glyph `S_upladder`/`S_dnladder`, branch ladder glyphs | Climb up, Climb down, Sit | `<`, `>`, `#sit` | current. Branch ladder labels should mention destination when known. |
| Open doorway or no-door doorway | `DOOR` with `D_ISOPEN`/`D_NODOOR`, glyph `S_vodoor`, `S_hodoor`, `S_ndoor` | Close door, Search, Travel through | `c`, `s`, movement | adjacent if next to hero, current if hero is in doorway and close asks direction. Need direction target. |
| Closed door | `DOOR` with `D_CLOSED` | Open, Kick, Untrap if trapped suspected, Search | `o`, `^D`, `#untrap`, `s` | adjacent direction. Open asks direction. Kick asks direction. Door can be trapped, stuck, shop door. |
| Locked door | `DOOR` with `D_LOCKED` | Unlock/Open, Kick, Force, Untrap, Search | `o` can auto-use key in some paths, `a` apply key/lock pick, `^D`, `#force`, `#untrap` | adjacent direction plus possibly inventory tool. Door locked/trapped flags from `doormask` are needed for good labels. |
| Secret door or secret corridor suspected | `SDOOR`, `SCORR`, or unknown to player | Search nearby, Kick wall/door, Look | `s`, `^D` | adjacent direction for kick. Should not reveal secret state unless known. Heuristic should only offer Search based on adjacent walls/corridors. |
| Fountain | `FOUNTAIN`, flags `F_LOOTED`, `F_WARNED` | Quaff from fountain, Dip item, Sit, Search, Kick, Apply tool | `q` when standing on fountain, `#dip`, `#sit`, `s`, `^D`, `a` | current. Quaff uses no inventory unless normal quaff path asks from inventory when not on fountain. Dip requires inventory selection and can be dangerous. |
| Sink | `SINK`, flags `S_LPUDDING`, `S_LDWASHER`, `S_LRING` | Quaff from sink, Dip item, Sit, Kick, Drop ring, Search | `q`, `#dip`, `#sit`, `^D`, `d`, `s` | current. Dropping rings has special sink behavior but needs inventory selection. Kick sink has special behavior and possible danger. |
| Altar | `ALTAR`, `altarmask`, shrine/sanctum flags | Offer corpse, Pray, Drop items, BUC test, Sit, Search | `#offer`, `#pray`, `d`/`D`, `#sit`, `s` | current. Offer requires corpse/food on altar or inventory/floor context. Pray is dangerous if mistimed. Alignment and temple/shrine state needed. |
| Throne | `THRONE`, `T_LOOTED` | Sit on throne, Search, Loot room, Kick | `#sit`, `s`, `^D` | current for sit. Serious confirmation recommended because throne sitting has random high-impact effects. |
| Grave/headstone | `GRAVE`, `emptygrave`, glyph `S_grave` | Read headstone, Dig grave, Engrave, Sit, Search | look/read via `;`, apply pick-axe/spade via `a`, `E`, `#sit`, `s` | current. Dig requires inventory tool and direction/current square depending tool flow. Do not surface as casual primary action. |
| Known trap on current square | trap glyph or `t_at(u.ux,u.uy)` with `tseen`; trap types in `include/defsym.h` | Untrap, Search, Sit anyway, Step off, Look | `#untrap`, `s`, `#sit`, movement, `:` | current or direction `.` for some untrap flows. Danger grouping. Trap type matters: pit/web/bear trap may mean hero is trapped and movement differs. |
| Known adjacent trap | adjacent trap glyph or `t_at(x,y)->tseen` | Untrap, Avoid/Travel around, Search | `#untrap`, movement/travel, `s` | adjacent direction. Some traps are untrappable, e.g. holes/portals. Need `could_untrap` style affordance from core to avoid false buttons. |
| Pit/spiked pit/hole/trap door/current fall trap | trap types `PIT`, `SPIKED_PIT`, `HOLE`, `TRAPDOOR` | Escape/Move, Untrap where allowed, Search, Sit danger | movement, `#untrap`, `s`, `#sit` | current. Movement may fail while trapped. Hole/trap door not necessarily untrappable. |
| Web/bear trap/current holding trap | trap types `WEB`, `BEAR_TRAP` plus `u.utrap` | Escape, Untrap self, Cut/web actions if inventory allows, Sit danger | movement, `#untrap`, inventory apply/wield in some flows | current. Need `u.utrap`, `utraptype`, turns remaining for labels like `Escape web`. |
| Magic portal, teleport trap, level teleporter, polymorph trap | trap types | Enter/Trigger, Avoid, Search, Untrap if possible | movement onto trap, `s`, `#untrap` | current/adjacent. Usually not a button unless known and safe intent is clear. |
| Vibrating square | `S_vibrating_square`/trap-like cmap | Inspect, Search, Use invocation items if ready | `:`, `s`, inventory commands | current. Only relevant late game; core should supply special affordance when appropriate. |
| Water, pool, moat, swamp, submerged | `POOL`, `MOAT`, `WATER`, `S_pool`; `is_pool` | Dip item, Drink if possible, Move/swim, Freeze/bridge via wand/tool, Search | `#dip`, movement, inventory apply/zap | current/adjacent. Dangerous without levitation/water walking. Needs hero movement capabilities for labels and warnings. |
| Lava pool/wall | `LAVAPOOL`, `LAVAWALL`, `S_lava`, `S_lavawall` | Dip item, Move/fly over, Avoid, Freeze/cool with item, Search | `#dip`, movement, inventory apply/zap | current/adjacent. Danger by default. Need resistances/levitation/flying for whether movement is plausible. |
| Ice | `ICE`, `icedpool` flags | Move carefully, Search, Melt/dig via items | movement, `s`, inventory apply/zap | current. Low priority unless adjacent hazard. |
| Drawbridge up/raised portcullis | `DRAWBRIDGE_UP`, glyph `S_vcdbridge`/`S_hcdbridge`, mask direction/under terrain | Open/Lower bridge if mechanism known, Zap/Apply instrument, Kick, Search | movement into controls, `a` instrument, `z`, `^D`, `s` | adjacent. Mechanics are not a simple command. Needs core affordance or avoid offering except Search/Look. |
| Drawbridge down/lowered bridge | `DRAWBRIDGE_DOWN`, glyph `S_vodbridge`/`S_hodbridge` | Cross, Search, Close/Raise if possible, Sit | movement, `s`, mechanism/instrument actions, `#sit` | current/adjacent. Core should label as bridge and expose specific control only if usable. |
| Iron bars | `IRONBARS`, glyph `S_bars` | Look through, Kick, Force/break with tool, Zap, Search | `:`, `^D`, `a`/`z`, `s` | adjacent direction. Not normally openable. Needs adjacent target. |
| Tree | `TREE`, flags `TREE_LOOTED`, `TREE_SWARM` | Kick tree, Search, Loot fruit if known, Chop/dig, Sit if on/near? | `^D`, `s`, `a` axe/pick | adjacent. Kick can drop fruit or summon swarm. Current square generally not accessible as standing terrain. |
| Adjacent wall/stone | `IS_WALL`, `STONE`, `DBWALL`, `W_NONDIGGABLE`, `W_NONPASSWALL` | Search, Dig, Kick, Look | `s`, `a` pick-axe, `^D`, `:` | adjacent direction. Do not offer Dig unless inventory has a digging tool or core says available. |
| Adjacent monster hostile | `glyph_is_monster`, monster at adjacent square | Attack, Throw, Fire, Zap, Chat if peaceful/unclear, Look | movement into monster, `t`, `f`, `z`, `C`, `:` | adjacent direction. Attack is movement into monster, should be danger primary only for hostile. Need attitude, tame/peaceful, sleeping, shopkeeper/priest flags. |
| Adjacent pet/tame monster | `glyph_is_pet`, monster tame | Chat, Swap/Move, Look, Feed/Throw food, Leash if inventory | `C`, movement, `:`, `t`/`a` leash | adjacent. Avoid primary Attack. Need tame flag and possibly pet name. |
| Adjacent peaceful monster/NPC | monster peaceful, shopkeeper/priest/Oracle/quest leader | Chat, Pay, Donate/Talk, Attack (danger/advanced), Look | `C`, `#pay`, movement attack if hostile intent | adjacent. Shopkeeper specific payment should appear when bill exists. |
| Shop square, unpaid object, shopkeeper nearby | room shop flags, object unpaid, `inhishop`, bill state | Pay, Pick up/buy, Drop/sell, Chat shopkeeper, Inspect price | `#pay`, `,`, `d`/`D`, `C`, `:` | current plus adjacent shopkeeper. Need shop state, unpaid flags, bill total, sellable context. |
| Temple/priest adjacent | altar room plus priest monster | Chat priest, Donate, Pray, Offer, Attack danger | `C`, `#pray`, `#offer`, movement attack | current/adjacent. Need priest/temple state. |
| Vault guard adjacent | guard monster state | Chat, Follow/Move, Pay? | `C`, movement | adjacent. Core affords better than renderer heuristics. |
| Closed/locked/trapped chest adjacent or current | container object on floor or adjacent if reaching allowed | Loot/Open, Force lock, Untrap, Kick | `#loot`, `#force`, `#untrap`, `^D` | usually current square for loot; direction for kick/untrap. Need object flags. |
| Statue | statue glyph/object, possible statue trap | Inspect, Pick up if possible, Break, Loot if container-like, Untrap if trapped statue | `:`, `,`, `a` pick-axe/weapon, `#loot`, `#untrap` | current. Statue trap state is not always known. |
| Bear trap/land mine as object | object types `BEARTRAP`, `LAND_MINE` if disarmed | Pick up, Set/Apply, Drop | `,`, `a` | current/inventory. Armed trap is trap context, object is item context. |
| Invocation position | dungeon branch metadata plus hero coords | Perform invocation sequence, Inspect, Search | inventory apply/read/ringing commands | current. Should only appear when core can confidently afford it; too spoilery otherwise. |
| Air/cloud/Plane contexts | `AIR`, `CLOUD` | Move/fly, Search, Wait | movement, `s`, `.` | current. Usually special levels; action bar should remain minimal. |
| Hero swallowed, stuck, riding, levitating, trapped | hero state, not terrain | Escape/Attack inside, Dismount, Ride, Untrap self, Wait | movement/attack, `#ride`, `#untrap`, `.` | current. These states should override terrain affordances where relevant. |

## NetHack trap list to model

Known trap types from `include/defsym.h` and `trap_to_defsym`: arrow trap, dart trap, falling rock trap, squeaky board, bear trap, land mine, rolling boulder trap, sleeping gas trap, rust trap, fire trap, pit, spiked pit, hole, trap door, teleportation trap, level teleporter, magic portal, web, statue trap, magic trap, anti-magic field, polymorph trap. Display also has vibrating square, trapped door, and trapped chest symbols.

For each known trap, the renderer should at minimum know `trapType`, `known`, `onCurrentSquare`, and whether core thinks `untrap` is possible. Without the last field, a generic Untrap button is useful but can produce confusing prompts or no-op messages.

## Prompt and targeting requirements

### Current square actions

- `Pick up`: current square, may ask item selection and quantity.
- `Eat`: usually inventory, but should prioritize edible floor items only when core can route the item action correctly.
- `Offer`: current altar and corpse/object context, may require choosing a corpse or using floor corpse.
- `Pray`, `Sit`, `Quaff from fountain/sink`, `Dip`, `Engrave`, `Wipe`, `Loot`: current square context, but many prompt for inventory or text.
- `Ascend`/`Descend`: current stairs/ladder only.

### Adjacent target actions

- `Open`, `Close`, `Kick`, `Untrap`, `Chat`, `Attack`, `Dig`, `Zap/Apply toward target`, `Look`: generally need an adjacent direction or an action target id.
- Door actions should preselect the only adjacent eligible door. If multiple doors are adjacent, show a direction picker or split into target chips such as `Open north door`.
- Monster actions should never require the player to infer a direction from a button. Use labels like `Chat with kitten` or `Attack goblin`, with a target id that maps to the direction.

### Inventory and text prompts

- `Dip`, `Force`, `Apply tool`, `Zap`, `Throw`, `Fire`, `Eat`, `Drop`, `Offer`, `Engrave`, `Loot` can prompt for inventory.
- `Pick up` and `Drop` may prompt for quantity.
- `Force`, `pray`, throne sitting, shop purchases, stealing, kicking sinks/altars/doors, and dangerous movement can prompt for confirmation.
- `Engrave` prompts for both tool selection and text.
- Naming, writing, wishing, and some advanced commands are not primary contextual actions but share prompt infrastructure.

## Data needed by renderer/shim/protocol

Current rendering events classify glyphs into broad semantics, which is enough for very rough heuristics. A reliable action bar needs richer state from core or shim:

1. Hero state: position, can move, trapped/stuck/riding/levitating/flying/water-walking, resistances relevant to water/lava/fire, carrying constraints.
2. Current square terrain: real `levl[x][y].typ`, display cmap, lit/known, flags decoded by terrain type.
3. Current square special metadata:
   - Stairs/ladder: up/down, branch stairs, known destination, branch name when known.
   - Door: open/closed/locked/broken/trapped/secret only if known.
   - Altar: alignment, shrine/sanctum/temple status, priest presence.
   - Fountain/sink/throne/tree/grave: looted/warned/ring/pudding/dishwasher/swarm/empty grave state where player-known.
   - Drawbridge: up/down, orientation, underlying terrain, control affordance if any.
   - Engraving: presence, readable known text if already known, headstone text for grave.
   - Trap: type, seen/known, current `u.utrap` state, untrappable flag.
4. Object pile summary: count, top display name, object classes, edible count, corpse count, container count, unpaid count, gold count, boulder present, heavy/immovable flags, known locked/trapped for containers.
5. Adjacent interactables: for 8 directions, terrain, door state, wall diggability if known, trap, object summary, boulder, monster/pet/NPC identity and attitude, shopkeeper/priest role.
6. Shop state: in shop, shop type, unpaid bill total if known, square ownership, sell/buy availability, shopkeeper direction.
7. Command availability: whether each action is currently legal, dangerous, disabled reason, expected prompts.
8. Stable action ids: renderer should submit an action id, not synthesize brittle key sequences where possible.

## Immediate implementation versus required protocol additions

### Possible immediately with current command routing and heuristics

These can be implemented as a first slice using existing glyph semantics, message/prompt handling, and key routing:

- Show `Pick up` when current glyph or cell semantic says object/corpse/statue, routed to `,`.
- Show `Ascend`/`Descend` when current glyph is `<`/`>` or semantic kind `stairs`, routed to `<`/`>`.
- Show `Search nearby` always or when near walls/doors/traps, routed to `s`.
- Show `Open`/`Close`/`Kick` when exactly one adjacent visible door is detected, routed to command plus preselected direction if direction routing exists, otherwise command then prompt.
- Show `Engrave` on floor/engraving contexts, routed to `E`, relying on existing GUI prompt support.
- Show `Loot` when current visible top object looks like chest/box/bag/statue, routed to `#loot`.
- Show `Pray`, `Offer`, `Sit` on altar/throne/furniture glyphs, routed to existing extended-command buttons.
- Show `Quaff` and `Dip` on fountain/sink, routed to `q` and `#dip`.
- Show `Chat` when adjacent semantic is pet/monster, routed to `C` and direction prompt.
- Put `Untrap`, `Force`, `Pay`, `Wipe`, `Apply tool` in an advanced menu backed by existing extended-command routing.

Known limits of this slice: object pile contents are mostly unknown to the renderer, door locked/trapped flags may be unavailable, monster attitude may be inferred only from pet glyph, shop state is weak, and some buttons will be optimistic.

### Requires core/shim/protocol additions for correctness

- Exact current square terrain and decoded flags in a player-knowledge-safe form.
- Full object pile summary and item flags needed for food/container/shop labels.
- Adjacent target list with stable target ids and directions.
- Monster attitude/role, not just glyph kind.
- Shop bill and ownership state.
- Container locked/trapped/known state.
- Engraving text presence and readable text/knownness.
- Trap type plus `could_untrap` result.
- Command legality and disabled reasons.
- Direct action submission by action id, so renderer can say `open door north` without staging a fragile `o` plus direction sequence.

## Recommended grouping and priority rules

1. **Primary slot, one button only.** Pick the safest obvious current-square action: `Pick up` on items, `Descend/Ascend` on stairs, `Open` for one adjacent closed door, `Loot` for a visible chest, `Chat` for adjacent peaceful/pet if no stronger square action.
2. **Common row, up to three buttons.** `Search`, `Pick up`, `Open/Close`, `Chat`, `Loot`, `Eat`, `Quaff`, `Dip`, `Offer` depending on context.
3. **Target chips when needed.** Use compact labels like `Open north door`, `Chat with kitten`, `Kick boulder east`; do not show generic `Open` when there are multiple eligible targets unless it opens a direction picker.
4. **Danger/advanced menu.** Put `Kick`, `Force`, `Untrap`, `Sit on throne`, `Drink from fountain`, `Pray`, `Attack peaceful`, `Move into lava/water`, `Dig grave`, and shop-stealing-sensitive actions behind warning styling or overflow.
5. **Inventory-dependent group.** Show `Dip`, `Apply tool`, `Zap`, `Throw`, `Fire`, `Force lock`, `Dig` only when inventory/core says the player has plausible items, or keep them in `More actions`.
6. **Do not clutter base exploration.** On normal floor/corridor, show at most `Search`, `Wait`, `Travel`/`Look` if space allows.
7. **Respect player knowledge.** Do not reveal secret doors, hidden traps, container traps, altar alignment, or shop prices unless NetHack has revealed them.
8. **Prefer verbs players understand.** `Climb down`, `Drink from fountain`, `Open chest`, `Offer corpse`, `Pay shopkeeper`. Keep raw command names as secondary hints, e.g. `<`, `#offer`.

## Proposed `action_affordances` event schema

A core/shim-generated event is the cleanest long-term design. Suggested event shape:

```json
{
  "name": "action_affordances",
  "turn": 1234,
  "hero": {
    "x": 40,
    "y": 12,
    "trapped": false,
    "riding": false,
    "levitating": false
  },
  "context": {
    "terrain": {
      "typ": "ALTAR",
      "display": "altar",
      "known": true,
      "flags": { "alignment": "lawful", "shrine": false, "sanctum": false }
    },
    "engraving": { "present": false, "knownText": null },
    "trap": null,
    "pile": {
      "count": 2,
      "top": "jackal corpse",
      "classes": ["corpse", "food"],
      "edibleCount": 1,
      "containerCount": 0,
      "unpaidCount": 0
    },
    "shop": { "inShop": false, "billCount": 0, "billTotal": null }
  },
  "adjacent": [
    {
      "dir": "n",
      "dx": 0,
      "dy": -1,
      "terrain": { "display": "closed door", "door": { "closed": true, "lockedKnown": false, "trappedKnown": false } },
      "monster": null,
      "pile": null,
      "trap": null
    }
  ],
  "actions": [
    {
      "id": "offer.floor-corpse.1",
      "label": "Offer corpse",
      "shortLabel": "Offer",
      "group": "primary",
      "priority": 100,
      "command": { "kind": "extended", "name": "offer" },
      "target": { "kind": "current-square", "x": 40, "y": 12 },
      "requires": ["confirmationPossible"],
      "danger": "normal",
      "enabled": true,
      "disabledReason": null,
      "promptPreview": "May ask which corpse if several are present."
    },
    {
      "id": "open.north-door",
      "label": "Open north door",
      "group": "common",
      "priority": 70,
      "command": { "kind": "key-sequence", "keys": ["o", "k"] },
      "target": { "kind": "adjacent", "dir": "n", "x": 40, "y": 11 },
      "requires": ["direction"],
      "danger": "normal",
      "enabled": true
    }
  ]
}
```

Schema notes:

- `actions` should be authoritative and already filtered for player knowledge.
- `command.kind` can begin as `key`, `key-sequence`, or `extended`; later add `core-action-id` to avoid key staging.
- `requires` should enumerate `direction`, `inventory`, `quantity`, `confirmation`, `text`, `position`, `turn-consuming`, `dangerous`.
- `danger` should be `normal`, `caution`, `danger`, or `forbidden` for styling and confirmations.
- Include `disabledReason` so the renderer can show why an action is present but unavailable.

## Validation strategy for implementation

Per project rules, renderer-only fixtures are not sufficient. When implementation begins, validate through real Electron gameplay with MCP/CDP/visible app automation:

1. Launch the real Electron app/game path, not a renderer fixture.
2. Start or load deterministic scenarios that cover the first slice:
   - floor item and item pile, verify `Pick up` opens real pickup flow and visible item names are player-facing.
   - stairs up/down and ladder if available, verify `Ascend`/`Descend` buttons send `<`/`>` and the level change or message is visible.
   - adjacent closed/open door, verify `Open`/`Close` handles direction prompt or target chip.
   - fountain/sink, verify `Drink`/`Dip` opens the correct prompt and does not mislabel inventory quaffing.
   - altar with corpse, verify `Offer` appears and routes to `#offer`.
   - engraving, verify `Engrave` opens tool picker and text entry with labels, not raw selector letters.
   - chest/box, verify `Loot` opens a meaningful container prompt.
   - adjacent pet/monster, verify `Chat`/`Attack` are separated and pet is not presented as primary attack.
   - known trap, verify `Untrap` is in danger/advanced grouping and routes to the prompt.
3. Capture screenshots for each context and inspect for blockers: stale labels, raw selector letters, wrong action priority, hidden rows, startup text reappearing, or controls that do not match the current prompt.
4. Assert on visible labels, not just internal state: item names, target labels, confirm/cancel paths, and command-specific prompt titles.
5. Document screenshots, exact commands/clicks, and any blockers in `employee-result.md` for the implementation task.

## Recommended first implementation slice

Start with a heuristic action bar that consumes current renderer map semantics and existing command routing:

1. Base row: `Search`, `Wait`, `Look/Help`.
2. Current square: `Pick up`, `Ascend`, `Descend`, `Engrave`, `Loot` for obvious container names, `Offer` on altar with corpse-like top glyph, `Pray` on altar as advanced, `Drink`/`Dip` on fountain/sink as caution.
3. Adjacent single-target doors: `Open`, `Close`, `Kick` with direction prefill if possible.
4. Adjacent pet/monster: `Chat` for pet/peaceful-looking targets, `Attack` only as danger/advanced until attitude is known.
5. `More actions` menu for existing extended commands already present in the renderer: force, untrap, pay, ride, rub, sit, wipe, dip, offer, pray.

In parallel, add the `action_affordances` protocol design behind a feature flag so the heuristic bar can be replaced by authoritative core actions without changing renderer layout.
