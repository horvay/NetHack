# GUI-first contextual action bar plan

Planning only. No UI, shim, core, or gameplay code was changed.

This is a GUI-first companion to [`context-action-bar-plan.md`](./context-action-bar-plan.md). The key product rule is: the action bar may use NetHack commands internally, but the player should see and click clear controls, not raw command letters or selector letters. Every contextual button should either complete an action directly or open a modern widget: target chips, map-target pickers, item cards, confirmation dialogs, quantity controls, or text fields.

## GUI-first prompt replacements

Legacy NetHack prompt | GUI replacement | Notes
---|---|---
Direction prompts (`hjklyubn`, `.`, `<`, `>`) | Target chips and clickable map targets | Example chips: `North door`, `Goblin east`, `This square`, `Up stairs`, `Down stairs`. Highlight legal cells on the map; keyboard arrows/gamepad d-pad move focus between targets.
Inventory selectors (`a - item`, `?`, `*`, `-`) | Item picker with cards/rows | Show item name, glyph/icon, stack count, equipped/unpaid/known BUC status, danger badges, and relevant filters. Selector letters may remain hidden implementation IDs, not primary labels.
Multi-select pickup/drop menus | Checklist item cards plus `Select all`, filters, and total weight/cost | Use visible quantities and item names. Include `Pick up selected`, `Drop selected`, `Cancel`.
Quantity prompts | Stepper, numeric field, quick chips (`1`, `Half`, `All`) and slider for large stacks | Validate max quantity; show live resulting weight/cost when known.
Yes/no confirmations | Modal or inline confirmation buttons | `Offer corpse` / `Cancel`, `Kick sink anyway` / `Cancel`; danger copy must explain likely risk when known.
Text prompts for engraving, naming, wishing, custom labels | Text field modal | Include title, placeholder, length/status copy, `Submit`, `Cancel`, and previous text when editing/writing over an engraving.
Extended-command entry (`#command`) | `More actions` command palette/menu | Searchable by friendly labels and aliases. Never require typing `#offer` if a contextual button can expose `Offer corpse`.
Look/identify target prompts | Inspect mode with map hover/click and side panel | `Inspect goblin`, `Inspect pile`, `Inspect fountain`; avoid raw coordinate/direction prompts.
Dangerous movement prompts into water/lava/traps/hostiles | Warning sheet before commitment | If core knows risk/capability, show `You cannot swim safely` or `Levitating: safe to cross`.

## Action bar layout and behavior

- **Primary action button:** one high-confidence safe action, visually prominent. Examples: `Pick up`, `Descend`, `Open door`, `Loot chest`, `Chat with kitten`.
- **Secondary buttons:** up to three common alternatives: `Search`, `Wait`, `Inspect`, `Drop`, `Engrave`, `Dip item`, `Pay`.
- **Target chips row:** appears when one action has multiple targets. Examples: `Open: north door / east door`; `Chat: kitten west / priest north`.
- **More / Advanced menu:** lower-priority, inventory-dependent, rare, or dangerous actions: `Kick`, `Force lock`, `Untrap`, `Dig grave`, `Attack peaceful`, `Pray`, `Sit on throne`, `Move into lava`.
- **Danger styling:** caution color for risky but normal NetHack actions (`Drink from fountain`, `Sit on throne`); danger color and confirmation for destructive/hostile actions (`Attack peaceful`, `Kick altar`, `Dig grave`, `Steal unpaid item`).
- **Disabled-with-reason states:** show disabled actions when they teach the player and the reason is known: `Unlock door — no key or lock pick`, `Offer corpse — no corpse here`, `Loot chest — locked`, `Pay — no shop debt`. Avoid showing disabled spoilery actions for unknown secrets/traps.
- **Tooltips/hints:** include command-key hints only as secondary help, e.g. `Open door (o)`, never as the button label. Tooltips should describe prompts: `Choose a door target, then confirm if trapped`.
- **Keyboard accessibility:** tab through buttons and item cards; arrow keys move target focus; Enter activates; Escape cancels; visible focus rings; all dialogs have named titles and buttons.
- **Controller/touch:** large tap targets, bottom-sheet dialogs, d-pad target selection, shoulder buttons for More/Inventory, hold-to-confirm for high-danger actions if useful.
- **Feedback:** after submit, show turn/result events as toast plus message-log highlight: `Picked up 3 items`, `The door is locked`, `You offer the jackal corpse`, `You cannot loot that from here`.

## Major context/action families and GUI-first flows

### Base floor, corridor, room

- **Button labels:** `Search nearby`, `Wait`, `Inspect`, optional `Travel`.
- **Flow:** direct click for search/wait; `Inspect` enters clickable map inspect mode with highlighted current/adjacent cells.
- **Widgets:** map-target picker for inspect/travel destinations; no raw `;` or `_` prompt exposed.
- **Feedback:** message toast for found hidden doors/traps or `You search.`

### Ground item or item pile

- **Button labels:** `Pick up`, `Browse pile`, `Eat food` when edible floor food/corpse is known, `Pay` if unpaid in shop.
- **Flow:**
  1. Single simple item: `Pick up` can submit directly, then result toast.
  2. Stack/pile: open **pickup sheet** with item cards, checkboxes, quantity steppers, filters (`Food`, `Tools`, `Unpaid`), carry-weight impact, and `Pick up selected`.
  3. Edible item: open **food picker** filtered to edible floor/inventory items, with corpse age/safety badges when known.
- **Wrapped prompts:** pickup menu, inventory selector, quantity prompt.
- **Error feedback:** `Too heavy`, `Cannot pick up boulder`, `That belongs to the shop — price 10 zorkmids`.

### Stairs and ladders

- **Button labels:** `Ascend`, `Descend`, `Climb up`, `Climb down`, with destination when known (`Descend to Gnomish Mines`).
- **Flow:** direct action; if blocked, show core message in toast/log. If both up/down branch options exist, use two explicit buttons.
- **Wrapped prompts:** no direction letters; `<`/`>` are internal only.
- **Feedback:** level-transition state, blocked reason, or branch warning if core emits one.

### Doors: open, closed, locked, trapped, doorway

- **Button labels:** `Open door`, `Close door`, `Unlock door`, `Kick door`, `Untrap door`.
- **Flow:**
  - One eligible door: button includes target (`Open north door`) and submits with stable target/direction.
  - Multiple doors: click `Open door` opens target chips/map highlights; player clicks `north door` or a highlighted door cell.
  - Locked door: `Unlock door` opens tool picker filtered to keys/lock picks/credit card where possible; fallback `Open door` may produce `The door is locked`.
  - Trapped-known/suspected: `Untrap door` opens target chip and confirmation; `Kick` is in More/danger.
- **Wrapped prompts:** direction prompt, inventory tool selector, confirmation.
- **Feedback:** `Opened`, `Locked`, `No tool selected`, `You set off a trap`.

### Fountain and sink

- **Button labels:** `Drink from fountain/sink`, `Dip item`, `Kick sink`, `Drop ring in sink`, `Search`.
- **Flow:**
  - `Drink` opens caution confirmation when risk is known/appropriate: `Drink from fountain? Strange effects are possible.`
  - `Dip item` opens item picker filtered to dip-capable inventory; result shown in log/toast.
  - `Drop ring` opens inventory picker filtered to rings and quantity if stackable.
- **Wrapped prompts:** inventory selector, quantity, confirmation.
- **Feedback:** clear result plus caution badge; do not route to generic `Quaff what?` inventory picker when standing on a fountain/sink.

### Altar, especially altar with corpse

- **Button labels:** `Offer corpse`, `Pray`, `Drop for testing`, `Inspect altar`, `Sit`.
- **Flow:**
  - `Offer corpse` opens corpse picker if multiple corpses/items are on altar; otherwise direct confirm/action.
  - `Drop for testing` opens inventory picker with multi-select and BUC-testing explanation when known.
  - `Pray` is caution/danger and opens confirmation with last-prayer safety info only if core can expose it without spoilers.
- **Wrapped prompts:** floor item selector, inventory selector, quantity, confirmation.
- **Feedback:** sacrifice/prayer messages highlighted; disabled reason `No corpse on altar`.

### Engraving, grave, and text on floor

- **Button labels:** `Read engraving`, `Engrave`, `Wipe engraving`, `Read headstone`, `Dig grave`.
- **Flow:**
  - `Read` opens side panel or toast with known text; if unknown, use inspect action.
  - `Engrave` opens tool picker (`Fingers`, weapon/tool cards) then text field modal with preview and `Engrave` / `Cancel`.
  - `Wipe` uses confirmation if it destroys text.
  - `Dig grave` requires tool picker and danger confirmation; keep in More.
- **Wrapped prompts:** engraving tool selector, text prompt, confirmation, direction/current target for digging.
- **Feedback:** resulting engraving text or interruption message.

### Containers: chest, large box, ice box, bag, sack, statue contents

- **Button labels:** `Loot chest`, `Open container`, `Unlock chest`, `Untrap chest`, `Force lock`, `Pick up container`.
- **Flow:**
  - `Loot` opens **container dialog** with two panes: container contents and inventory; buttons `Take`, `Put in`, `Take all`, `Close`.
  - Locked container: show `Unlock` primary if tool available; tool picker before action.
  - Trapped-known container: show `Untrap` with warning; `Force lock` in danger/advanced with weapon/tool picker.
- **Wrapped prompts:** container selection if multiple, inventory selectors, quantity, confirmation.
- **Feedback:** `The chest is locked`, `You disarm the trap`, item transfer summaries.

### Traps and hazardous current/adjacent squares

- **Button labels:** `Untrap`, `Escape web`, `Climb out`, `Avoid`, `Inspect trap`, `Move anyway`.
- **Flow:**
  - Known adjacent trap: `Untrap` opens target chip/map highlight and, if needed, tool picker.
  - Current trap holding hero: primary becomes `Escape web`/`Escape bear trap` and maps to movement/untrap semantics chosen by core.
  - Non-untrappable hazards (`hole`, `portal`, `level teleporter`) should show `Inspect`/`Avoid`, not false `Untrap`.
- **Wrapped prompts:** direction/current target, confirmation, inventory tool selector.
- **Feedback:** disabled reason `This trap cannot be disarmed`; turn/result event for escape attempts.

### Adjacent pet, peaceful, hostile monster, NPC

- **Button labels:** `Chat with kitten`, `Swap places`, `Feed pet`, `Attack goblin`, `Throw`, `Zap`, `Pay shopkeeper`, `Donate to priest`.
- **Flow:**
  - Pet/tame: primary is `Chat` or `Swap`, never `Attack`. `Feed` opens food picker and target is preselected.
  - Peaceful/NPC: primary `Chat`; contextual secondary `Pay`/`Donate`; `Attack` only in danger menu with confirmation.
  - Hostile: primary may be `Attack goblin` if adjacent, but ranged actions open item/target pickers.
  - Multiple monsters: target chips by visible name and direction.
- **Wrapped prompts:** direction prompt, inventory selector for throw/feed/zap/apply, confirmation for peaceful attack.
- **Feedback:** target-specific messages and attitude changes.

### Shop square and unpaid items

- **Button labels:** `Pay`, `Buy item`, `Sell/drop item`, `Inspect price`, `Chat with shopkeeper`.
- **Flow:**
  - `Pay` opens bill dialog if data exists: item cards, prices, total, `Pay all`.
  - Picking up unpaid object opens purchase confirmation when the shop state is known.
  - Dropping/selling opens inventory picker with estimated sale/ownership badges.
- **Wrapped prompts:** pickup/drop selectors, quantity, yes/no purchase confirmations, shop bill prompts.
- **Feedback:** cost paid, debt remaining, ownership warnings; danger styling for stealing/attacking shopkeeper.

### Water, pool, moat, lava, ice hazards

- **Button labels:** `Cross safely`, `Dip item`, `Freeze water`, `Move into water`, `Move into lava`, `Avoid`.
- **Flow:**
  - If core knows capability, label accurately: `Fly over lava`, `Walk on water`, `Cannot swim safely`.
  - Dangerous movement opens confirmation with reason; target chip or highlighted destination square.
  - `Dip` opens item picker; `Freeze`/`cool` opens wand/tool picker filtered to cold effects when known.
- **Wrapped prompts:** direction target, inventory tool/wand selector, confirmation.
- **Feedback:** movement result or blocked reason.

### Boulder and pushable/blocked objects

- **Button labels:** `Push boulder east`, `Kick boulder`, `Squeeze past`, `Pick up boulder` if possible.
- **Flow:**
  - Movement/push uses target chip for adjacent boulder direction; do not label as generic `Move`.
  - `Kick` is danger/advanced and opens target chip if multiple boulders/objects.
  - `Pick up` disabled with reason unless core says hero can lift it.
- **Wrapped prompts:** direction prompt, confirmation where dangerous, pickup failure into friendly message.
- **Feedback:** boulder moved/blocked/too heavy; warn if pushing into pet/shopkeeper/hazard when known.

### Walls, secret doors/corridors, iron bars, trees, drawbridges

- **Button labels:** `Search wall`, `Dig wall`, `Kick wall`, `Look through bars`, `Kick tree`, `Chop tree`, `Cross bridge`, `Lower bridge` if core can expose it safely.
- **Flow:** target chips for adjacent feature; item picker for dig/chop/apply/zap; danger confirmations for bridge mechanisms or destructive actions.
- **Wrapped prompts:** direction and inventory selectors.
- **Feedback:** do not reveal secrets; use `Nothing found`/message-log results.

### Hero state overrides: trapped, swallowed, riding, levitating, burdened

- **Button labels:** `Escape`, `Dismount`, `Ride`, `Attack inside`, `Drop weight`, `Wait`.
- **Flow:** state actions should outrank terrain. `Drop weight` opens inventory picker sorted by weight; `Dismount/Ride` targets steed; swallowed actions use simplified `Attack`/`Cut free` buttons if core supports them.
- **Wrapped prompts:** inventory selector, direction/current target, confirmation.
- **Feedback:** persistent state chip near action bar: `Stuck in web`, `Riding pony`, `Levitating`.

## Required protocol/core/shim support to avoid raw selector menus

1. **Semantic action IDs:** renderer submits `actionId: open.door:north` or `offer:itemUid` instead of staging `o` then a direction letter.
2. **Stable target IDs:** current square, adjacent cells, monsters, doors, traps, containers, and floor objects need stable IDs for one turn/transaction.
3. **Typed prompt events:** prompt kind must be explicit: `direction`, `item-single`, `item-multi`, `quantity`, `confirm`, `text`, `target`, `container-transfer`, `shop-bill`.
4. **Prompt metadata:** title, body/help text, allowed targets/items, default selection, max quantity, danger level, cancel semantics, and whether the prompt consumes a turn.
5. **Item affordances:** item UID, display name, class, count, weight, equipped slot, unpaid/owned, known BUC, edible/corpse/container/tool/weapon tags, known locked/trapped state.
6. **Target affordances:** direction, coordinates, visible label, target kind, attitude for monsters, terrain/door/trap state, safe/danger/disabled reason.
7. **Transaction/result events:** every action returns `started`, `prompted`, `completed`, `cancelled`, `failed`, or `interrupted`, with message-log references and changed object/target IDs.
8. **Player-knowledge filtering:** core/shim must not leak hidden traps, secret doors, unknown container traps, or unrevealed altar/shop metadata.
9. **Direct GUI prompt resolution:** when a typed prompt is active, renderer sends structured values (`selectedItemIds`, `quantity`, `text`, `targetId`, `confirmed`) rather than command letters.
10. **Fallback command bridge:** while protocol is incomplete, the shim may map GUI choices to legacy keys internally, but the renderer should remain GUI-model-first.

## Immediate GUI wrappers possible now

These can be built on current command routing as visible wrappers, provided screenshots are QA'd for raw selector leakage:

- Action bar layout with heuristic buttons: `Search`, `Wait`, `Pick up`, `Ascend`, `Descend`, `Open/Close door`, `Engrave`, `Loot`, `Drink`, `Dip`, `Offer`, `Pray`, `Chat`, `Pay`, `More actions`.
- Direction wrapper for simple single-target actions: if exactly one adjacent eligible door/pet/monster is visible, preselect its direction internally and label the button with target text.
- Generic target picker for multiple adjacent visible features, mapping selected chip to a direction key internally.
- GUI yes/no modal over existing yes/no prompts.
- GUI text field over engraving/name/wish prompts.
- Basic inventory picker over existing inventory menus, if current prompt events already expose real item names; raw `Inventory selector j`-style labels are blockers.
- Quantity modal over current quantity prompts.
- More-actions menu mapped to existing extended commands.

## Features needing protocol support before they can be truly GUI-first

- Accurate pile browsing and floor item actions with stable floor object IDs.
- Container two-pane transfer UI with stable contents/inventory IDs.
- Shop bill, buy/sell, price, and unpaid ownership UI.
- Correct altar offering among multiple corpses and safe prayer disabled reasons.
- Trap-specific actions and `could_untrap` disabled reasons.
- Locked/trapped/secret door handling without leaking unknown state.
- Monster attitude-sensitive actions (`Chat`, `Attack`, `Pay`, `Donate`, `Feed`) without glyph heuristics.
- Hazard movement labels based on levitation, flying, swimming, water walking, fire resistance, burden, and mounts.
- Tool-filtered actions (`Unlock`, `Dig`, `Chop`, `Freeze`, `Force`, `Zap`) that know usable inventory and target compatibility.
- Action result transactions that let the bar update optimistically without stale buttons.

## Required examples from common contexts

Context | Primary GUI button | Follow-up widget | Legacy prompt wrapped
---|---|---|---
Item pile | `Pick up` | Multi-select item cards with quantity steppers | pickup menu, quantity
Stairs | `Descend`/`Ascend` | Direct; optional destination confirmation for special branches | `<`/`>` key
Closed/locked door | `Open north door` / `Unlock north door` | Target chip; tool picker if locked | direction, inventory selector
Fountain/sink | `Drink from fountain`; `Dip item` | Caution confirm; item picker | yes/no, inventory selector
Altar with corpse | `Offer corpse` | Corpse picker if multiple; confirmation | floor object selector, confirm
Engraving | `Engrave` | Tool picker then text field | inventory/tool selector, text
Chest/container | `Loot chest` | Container transfer dialog; unlock/untrap flow | container prompt, inventory, quantity
Trap | `Untrap arrow trap` / `Escape web` | Target chip or current-state action; warning | direction/current target, confirm
Adjacent pet/monster | `Chat with kitten` / `Attack goblin` | Target chips; food/throw picker for secondary actions | direction, inventory
Shop square | `Pay` / `Buy item` | Bill/purchase dialog with prices | yes/no, pickup/drop, pay prompt
Water/lava hazard | `Fly over lava` / `Move into lava` | Target highlight; danger confirm | movement direction, confirm
Boulder | `Push boulder east` | Target chip; disabled reason if impossible | movement direction/kick direction

## First implementable GUI-first slice

Recommended first slice: **safe current-square and single-adjacent-target wrappers with modern prompt shells**.

1. Render action bar with primary/secondary/More layout.
2. Support these buttons first: `Search`, `Wait`, `Pick up`, `Ascend`, `Descend`, `Open/Close one adjacent door`, `Chat with adjacent pet`, `Engrave`, `Loot obvious chest`, `Drink from fountain/sink`, `Dip item`, `Offer` on altar, and `Pay` in shop if already routable.
3. Add GUI wrappers for active prompt kinds already observable today: yes/no modal, text field, quantity control, direction target chips, and inventory item cards using visible item names.
4. Treat any raw fallback selector label, unexplained letter-only option, or wrong target label as a blocker under `AGENTS.md`.
5. Keep dangerous/inaccurate actions in `More` until protocol affordances exist.

## MCP validation scenarios for the first slice

When implementation starts, validation must use the real Electron game path, not renderer-only fixtures.

1. **Item pile:** stand on a pile, click `Pick up`, verify item-card names and quantity controls; screenshot before and after pickup.
2. **Stairs:** stand on down stairs, click `Descend`, verify level transition/message and no raw `<` prompt.
3. **Closed/locked door:** click `Open north door`; for locked case verify `Unlock` or locked feedback and no direction-letter prompt leaks.
4. **Fountain/sink:** click `Drink` and `Dip item`; verify caution/item-picker labels are friendly.
5. **Altar with corpse:** place/stand on corpse at altar, click `Offer corpse`, verify corpse name appears and result message is highlighted.
6. **Engraving:** click `Engrave`, choose tool/fingers in item-card UI, enter text in text field, verify engraving result/readback.
7. **Chest/container:** click `Loot chest`, verify container dialog or locked feedback uses player-facing labels.
8. **Trap:** reveal a trap, verify `Untrap`/`Inspect trap` appears in More/danger and target chip is readable.
9. **Adjacent pet/monster:** verify pet shows `Chat`/`Swap` as safe actions and hostile monster shows `Attack` without making pet attack primary.
10. **Shop square:** verify unpaid item/purchase/payment labels and bill UI if shop data is available; stealing/attack actions must be danger-styled.
11. **Water/lava/boulder:** verify hazard and boulder target chips are explicit (`east boulder`, `lava south`) and dangerous movement requires confirmation.

Each scenario should capture screenshots and assert visible labels: item names, target labels, confirm/cancel buttons, quantity controls, and text fields. Automated assertions passing is not enough if screenshots show raw selector letters or developer-facing fallback text.
