# Comprehensive contextual actions research report

Prepared by Developer/Rufus for the NetHack Electron/Pyra contextual action-bar work. This is a research/planning report only; no UI, shim, or gameplay code was changed.

## Overview and verdict

The current Electron action bar is a useful first heuristic wrapper around a small set of NetHack commands, but it is far from a complete contextual action system. It currently derives actions mostly from the visible map cell glyph/semantic string, current cursor position, a transient ground-items hint, and broad regexes. It can expose common actions such as Search, Wait, Inspect, Pick up, Eat visible food/corpse, Ascend/Descend, Drink/Dip at fountains, Drink at sinks, Offer/Pray at altars, Engrave, Loot for obvious containers, Open/Close adjacent visible doors, Chat with adjacent pet/creature, and More/advanced.

The major missing piece is authoritative, player-knowledge-safe action affordance data from NetHack core/shim. NetHack itself already has a richer contextual command menu in `src/cmd.c` (`there_cmd_menu_self`, `there_cmd_menu_next2u`, `there_cmd_menu_far`, `act_on_act`) that accounts for actual terrain type, object chains, container status, traps, monsters, saddles, inventory availability, and command queuing. The Electron renderer should not attempt to recreate that full ruleset solely from glyph names and regexes. It needs a structured `action_affordances`/target-affordance protocol, or at least a bridge to the core `MCMD_*` affordances, so the GUI can present player-facing actions without leaking hidden state or sending brittle key sequences.

Key verdicts:

- **Implemented today:** shallow heuristic action buttons, broad glyph/semantic detection, simple direction prefill for single adjacent doors/creatures, generic More/advanced dialog, and modern inventory/equipment item action affordances for carried items.
- **Partially covered by prior Nyx/Pyra planning:** extensive action family inventory, GUI-first prompt replacement strategy, and protocol requirements in `electron-poc/context-action-bar-plan.md` and `electron-poc/context-action-bar-gui-first-plan.md`.
- **Missing for correctness:** authoritative map/object/monster/shop/trap/container/hero-state metadata; stable target and item IDs; knownness flags; disabled reasons; typed prompt/result transactions; and broad NetHack-specific action coverage for state variants such as locked/trapped/cursed/known/unpaid/peaceful/levitating/trapped/riding.
- **Implementation recommendation:** do not expand regex heuristics category by category as the long-term solution. Use a small safe heuristic slice only as a bridge, then add a core/shim-generated action-affordance event modeled on NetHack's existing `MCMD_*` contextual menu logic.

## Sources inspected

### Electron renderer and shared modules

- `electron-poc/src/renderer.js`
  - `buildContextActions()` currently constructs the visible action bar.
  - `actionForAdjacentCell()` detects adjacent doors and creatures.
  - `runContextAction()` routes actions as key, extended command, key+direction, or extended command+direction.
  - `showMapContextActionSheet()` exposes clicked-map-cell actions such as Walk, Open, Close, Kick, Travel.
  - Automation helpers expose `contextActions()` and `clickContextAction()` for tests.
- `electron-poc/src/renderer.html`
  - Existing action surfaces: `#context-action-bar`, compact quick actions, `#action-dialog`, item/equipment/system/repeat/movement action sections, and settings toggle for contextual prompts.
- `electron-poc/src/shared/inventory-action-service.js`
  - Carried-item action affordances already cover wield, quiver, throw, wear, put on, eat, quaff, read, study, zap, apply/use, loot/apply containers, engrave, dip, drop, name/label, inspect, and equipment slot actions.
  - It is inventory-focused and not a full map context system.
- `electron-poc/src/shared/interaction-model.js`
  - Prompt/menu classification for inventory, transfer, shop payment, container transfer, direction, question, and picker flows.
- `electron-poc/src/shared/shim-protocol.js`
  - `shim_print_glyph` currently normalizes glyph, ttychar, tileidx, cmapIndex, semanticKind, semanticName, backgroundGlyph.
  - `shim_add_menu` carries selector, text, glyph and semantic fields for menus.
- `electron-poc/src/shared/map-presentation.js` and `electron-poc/src/shared/tile-assets.js`
  - Terrain/object/pet/trap visual classification and tooltip presentation.
- `electron-poc/src/styles.css`
  - Existing action bar and action-dialog styling.

### Existing planning and test artifacts

- `electron-poc/context-action-bar-plan.md`
  - Prior Nyx/Pyra contextual action inventory and schema proposal.
- `electron-poc/context-action-bar-gui-first-plan.md`
  - GUI-first replacement rules for direction prompts, inventory selectors, quantities, confirmations, text prompts, look/target prompts, and dangerous movement.
- `electron-poc/scripts/context-action-bar-test.js`
- `electron-poc/scripts/contextual-settings-test.js`
- `electron-poc/scripts/real-context-action-bar-mcp-test.js`
- `electron-poc/test-output/real-context-action-bar/real-context-action-bar-summary.md`
- `electron-poc/test-output/real-context-action-bar/real-context-action-bar-debug.json`

### NetHack core and shim sources

- `src/cmd.c`
  - `MCMD_*` enum includes open/lock/untrap/kick/close door, search, look/untrap trap, move, ride/saddle, talk/name, quaff/dip/sit/up/down/dismount/monster ability, pickup/loot/tip/eat/drop/rest/look/inventory/cast spell/throw/travel/offer.
  - `there_cmd_menu_self()` is an important authoritative source for current-square actions.
  - `there_cmd_menu_next2u()` is an important authoritative source for adjacent terrain/door/trap/boulder/monster/pet actions.
  - `there_cmd_menu_far()` handles far throw/travel affordances.
  - `act_on_act()` maps semantic actions to queued NetHack commands plus direction/item/confirmation follow-up.
- `electron-poc/shim-bridge/nh-shim-bridge.c`
  - Current bridge exposes semantic kind/name from glyph/cmap/object/monster/corpse/statue/trap, but not full `levl`, object-chain, monster attitude, knownness, or action legality.
- `include/rm.h`, `include/defsym.h`, `include/extern.h`
  - Terrain, display symbol, trap, feature, and command implementation anchors.
- Relevant command implementation files by category: `src/lock.c`, `src/pickup.c`, `src/trap.c`, `src/pray.c`, `src/potion.c`, `src/engrave.c`, `src/sit.c`, `src/sounds.c`, `src/shk.c`, `src/hack.c`, `src/invent.c`, `src/iactions.c`.

## Current implementation summary

### Action bar code path

`buildContextActions()` in `electron-poc/src/renderer.js` currently starts with:

- `Search` -> `s`
- `Wait` -> `.`
- `Inspect / look` -> `;`

It then conditionally prepends or appends:

- `Pick up` -> `,` when `hasKnownGroundItemsHere()` is true.
- `Eat corpse` / `Eat food` -> `e` when visible ground text matches edible/corpse/food heuristics.
- `Descend` -> `>` when terrain signature looks like down stairs.
- `Ascend` -> `<` when terrain signature looks like up stairs.
- `Drink from fountain` -> `q` and `Dip item in fountain` -> `#dip` when current terrain matches fountain.
- `Drink from sink` -> `q` when current terrain matches sink.
- `Offer sacrifice` -> `#offer` and `Pray at altar` -> `#pray` when current terrain matches altar.
- `Engrave` -> `E` on broad floor/engraving/grave/corridor match.
- `Loot container` -> `#loot` when terrain signature matches chest/box/container.
- Adjacent `Open <dir> door` -> `o` + direction for closed-door glyph/name.
- Adjacent `Close <dir> door` -> `c` + direction for open-door glyph/name.
- Adjacent `Chat with <dir> pet/creature` -> `#chat` + direction when the neighbor signature looks like pet/tame/monster/creature.
- `More / advanced…` opens the existing action dialog.

Actions are deduplicated by id and sliced to 12 buttons.

### Current action-dialog/system menu coverage

The existing `renderer.html` action dialog exposes many command buttons, but most are generic command launchers rather than contextual affordances. It includes inventory/equipment/spell actions, repeat and movement controls, dungeon actions (open/close/kick), transfers (`#loot`, `#tip`, `#pay`), object flows (`#dip`, `#offer`, `#pray`, `#sit`, `#wipe`, `#force`, `#untrap`), special actions, inspect/name, and character panels.

This is useful as a command palette, but it does not know whether a button is correct for the current square, which target should be preselected, whether the action is safe, or why it is disabled.

### Current carried-item coverage

`inventory-action-service.js` is more mature for inventory items than the map action bar. It infers actions from item row text and state tags:

- Equipped item removal/change/quiver clearing.
- Weapon/ammo wield/quiver/throw.
- Armor wear.
- Ring/amulet/accessory put on/remove.
- Food eat, potion quaff, scroll/spellbook read/study, wand zap.
- Tool/container apply/loot.
- Engrave with tools/wands/weapons.
- Dip potions/items, throw gems, drop/name/inspect.
- Equipment slot drag/drop routing for weapon, quiver, armor, rings, amulet, eyes.

The limitation is that this service is selector/text based and inventory-focused. It does not supply floor-object, adjacent-target, trap, shop, altar, water/lava, or monster context.

## Current gaps versus implemented actions

### Cross-cutting gaps

1. **Knownness and secrecy.** The renderer cannot reliably distinguish known vs hidden door traps, container traps, secret doors, hidden traps, altar alignment, shop ownership, or corpse age. Regexes over visible glyphs can reveal too little or too much.
2. **Object chains.** The map cell only exposes a top glyph/semantic. The action bar needs a pile summary with count, top item, classes, edible/container/corpse/unpaid/gold flags, weight, and stable floor object IDs.
3. **Door state.** The renderer sees open/closed glyphs but not actual `doormask` state: closed vs locked, broken, no-door, trapped, secret, shop door, known vs unknown.
4. **Trap legality.** The renderer sees visible trap glyph/name but not `ttyp`, `tseen`, `u.utrap`, whether `#untrap` is meaningful, or whether the trap is current vs adjacent.
5. **Monster attitude and roles.** Pet glyphs are sometimes exposed, but hostile/peaceful/tame, sleeping, invisible, shopkeeper/priest/guard/quest NPC status, and saddle/riding affordances are not reliably exposed.
6. **Hero state overrides.** Trapped, stuck, swallowed, riding, levitating, flying, water walking, burdened, polymorphed, blind, hallucinating, confused, stunned, and carrying constraints should reprioritize the bar.
7. **Shop and ownership state.** The bar cannot identify unpaid floor items, bill totals, buy/sell context, shopkeeper direction, price knowledge, or stealing risk.
8. **Action result transactions.** Renderer submits legacy keys and waits for prompts/messages; it has no structured `started/prompted/completed/failed/cancelled` result tied to an action id.
9. **Prompt metadata.** Follow-up prompts often arrive as generic NetHack menus/questions. GUI-first flows need typed prompt kinds, target IDs, item IDs, danger levels, default selections, max quantities, and cancel semantics.
10. **Disabled reasons.** The UI cannot show `Unlock door — no key or lock pick`, `Offer corpse — no corpse here`, or `Untrap — this trap cannot be disarmed` unless core/shim supplies legality and reason.

### Gaps by currently implemented action

- **Search:** implemented as a generic always-available action. Missing target-specific search labels (`Search north wall`, `Search door for trap`, `Search for secret doors`) and repeated-count support.
- **Wait:** implemented as `.`. Missing state-aware labels (`Rest while trapped`, `Wait on altar`, `Wait for pet`) and safety warnings.
- **Inspect/look:** implemented as `;`. Missing structured inspect target picker and current/far map symbol metadata.
- **Pick up:** only based on visible/hinted ground items. Missing item pile browser, quantities, unpaid flags, boulder/heavy restrictions, gold special handling, and single-item direct pickup result.
- **Eat ground food/corpse:** only heuristic. Missing corpse age/safety, tins/eggs/globs, vegetarian/cannibalism warnings, polymorph/role/religion implications, inventory-vs-floor disambiguation.
- **Ascend/Descend:** basic glyph/terrain match. Missing ladders/branch stairs/destination labels and blocked/special branch reasons.
- **Drink/Dip fountain/sink:** simple commands. Missing caution confirmation, item picker filtering, sink-specific ring/drop/kick variants, fountain/sink looted/warned state.
- **Offer/Pray altar:** commands appear on altar regardless of corpse availability or prayer safety. Missing corpse picker, alignment/shrine/temple knownness, prayer timeout/risk, BUC testing drop flow.
- **Engrave:** appears broadly. Missing read/wipe engraving distinctions, known text, grave/headstone read/dig differentiation, tool+text GUI flow completeness.
- **Loot container:** only if terrain/cell signature says chest/box/container. Missing floor object chain, locked/trapped/known state, multiple containers, container transfer UI, force/untrap/unlock variants.
- **Open/Close door:** only adjacent visible door by glyph/name. Missing locked/trapped/broken/no-door state, target chips for multiple doors, unlock tool action, search/untrap door, shop door handling.
- **Chat:** adjacent creature heuristic. Missing hostile/peaceful/tame role-specific labels, attack separation, feed/swap/name/saddle/ride/pay/donate variants.
- **More/advanced:** command palette is broad but not contextual, not disabled, and not prioritized by current state.

## Detailed missing actions list by category

### 1. Containers and container-like floor objects

NetHack conventions:

- Containers include chest, large box, ice box, bag, sack, oilskin sack, bag of holding, and special container-like statues/ice boxes.
- Boxes/chests can be locked and trapped. Bags can be cursed and may have special behavior. Containers can be on the floor, in inventory, in shops, underwater/lava-adjacent, or among piles.
- Actions include loot/open, take from, put in, unlock, lock, force, untrap, tip, pick up, drop, inspect, name/label, kick, apply/use (inventory containers), and possibly break/dig statue.

Missing contextual actions:

- `Loot chest/box/bag` for floor containers with visible item name.
- `Open container` with container chooser if multiple containers are on the square.
- `Unlock chest/box` when locked is known or when open/loot reports locked; needs skeleton key/lock pick/credit card inventory state.
- `Lock chest/box` when unlocked/open state and lock tool available.
- `Untrap chest/box` when trap known or suspected; must not reveal unknown trap. For unknown state label should be `Search container for traps` rather than `Untrap trapped chest`.
- `Force lock` as danger/advanced; needs weapon/tool picker and warning about breakage/noise/contents damage.
- `Tip container` as advanced; confirm if contents may spill into hazards/shop.
- `Pick up container` when liftable; disabled reason for too-heavy/attached/owned.
- `Put items into container` and `Take items from container` GUI transfer actions.
- `Inspect container contents/state` if already open/known.
- `Kick container` as danger/advanced; direction/current target handling.
- `Loot statue` or `Break statue` only when core says statue contents/trap/petrification risk is known/appropriate.

State-dependent variants:

- Locked/unlocked/open/broken.
- Trapped known, trap suspected, trap unknown.
- Cursed bag/oilskin/bag of holding knownness.
- Unpaid/owned container in shop.
- Container on altar/water/lava/trap square.
- Multiple containers on current square.
- Inventory container vs floor container.
- Player cannot reach floor (levitating, swallowed, trapped, riding constraints).

Data needed:

- Floor object chain with object UID, display name, object class/type, `Is_container`, `olocked`, `otrapped`, `tknown`, `blessed/cursed/known`, unpaid/owned, weight/liftability, contents summary if known.
- Inventory tool availability for lock/unlock/force.
- Core legality and disabled reason for `loot`, `force`, `untrap`, `tip`.

### 2. Doors, doorways, secret doors, and door traps

NetHack conventions:

- Door terrain uses `DOOR` with `doormask` states such as open, closed, locked, broken, no-door. Secret doors/corridors use hidden terrain (`SDOOR`, `SCORR`) and should not be revealed by GUI.
- Doors can be trapped, but comments in `src/cmd.c` note there is no persistent player-known locked/trapped flag for doors in the current menu logic.

Missing contextual actions:

- `Open north door` for a closed door.
- `Close east door` for an open door.
- `Unlock north door` when locked known or likely and a key/pick/card is available.
- `Lock door` when open/closed/unlocked and tool available.
- `Search door for trap` / `Untrap door` without leaking whether trap exists.
- `Kick door` as danger/advanced; warn about noise, damage, shopkeepers, trapped doors.
- `Force door` if supported/implemented via lock actions/tools.
- `Search for secret door` near walls/corridors; label should not reveal hidden `SDOOR`.
- `Travel through doorway` / `Move through open door` when open/passable.
- `Inspect door` with state visible to player.

State-dependent variants:

- Closed vs locked vs open vs broken vs no-door doorway.
- Secret door unknown vs revealed.
- Trapped known/suspected/unknown.
- Shop door: kicking/breaking may anger shopkeeper and has billing/ownership implications.
- Multiple adjacent doors requiring target chips.
- Door blocked by monster/boulder/object.

Data needed:

- Adjacent target list with `typ`, decoded `doormask`, knownness-safe state, direction, stable target id, shop/room context, passability, target label.
- Inventory lock tool availability.
- Command legality: open/close/lock/unlock/untrap/kick.

### 3. Monsters, pets, peacefuls, NPCs, and combat targets

NetHack conventions:

- Moving into a hostile adjacent monster attacks. Peaceful/tame monsters should not be presented as attack-primary. `#chat`, swap/move, feed, name, saddle/ride/remove saddle, pay/donate, and ranged actions may apply.

Missing contextual actions:

- `Attack goblin` for adjacent hostile monsters.
- `Chat with kitten`, `Chat with shopkeeper`, `Chat with priest`, `Talk to Oracle/quest leader` for tame/peaceful/NPCs.
- `Swap places with pet` / `Move past peaceful` where legal.
- `Feed pet` with food picker and target preselected.
- `Throw food/item at monster` with item picker and target.
- `Fire at monster`, `Zap wand at monster`, `Cast spell at monster`, `Apply tool at monster` with target picker.
- `Name/Rename pet/monster`.
- `Ride steed`, `Dismount`, `Put saddle on`, `Remove saddle`.
- `Pay shopkeeper` / `Donate to priest` / `Buy/sell` role-specific actions.
- `Attack peaceful` only in danger/advanced with confirmation.
- `Inspect monster`, including invisible/unseen creature caveats.

State-dependent variants:

- Hostile vs peaceful vs tame.
- Sleeping, fleeing, invisible, mimicking, concealed, remembered but not currently visible.
- Shopkeeper/priest/guard/quest leader/Oracle roles.
- Saddled/rideable, player already riding, can_saddle conditions.
- Monster in water/lava/trap, pet in shop, pet carrying/leashed.
- Hallucination/blindness affecting labels/knownness.

Data needed:

- Adjacent monster target: monster UID, direction, display name, attitude, role flags, visible/canspot, saddle/rideable state, legal movement/attack/chat flags.
- Hero state: riding, polymorphed, blind, hallucinating, conflicted, encumbered.
- Inventory food/leash/saddle/ranged tools.

### 4. Traps, trap-like features, and trapped hero states

NetHack conventions:

- Visible trap types include arrow trap, dart trap, falling rock trap, squeaky board, bear trap, land mine, rolling boulder trap, sleeping gas trap, rust trap, fire trap, pit, spiked pit, hole, trap door, teleportation trap, level teleporter, magic portal, web, statue trap, magic trap, anti-magic field, polymorph trap, vibrating square, trapped door, trapped chest.
- Some traps can be untrapped/disarmed; others should be inspected/avoided rather than offering false `Untrap`.

Missing contextual actions:

- `Inspect arrow trap` / `Examine trap`.
- `Untrap <trap>` only when core says possible.
- `Search for traps` in suspicious contexts.
- `Move onto trap` / `Move anyway` as danger.
- `Avoid trap` / travel-around hints.
- `Escape web`, `Escape bear trap`, `Climb out of pit` when hero is currently trapped.
- `Untrap self` for current trap where applicable.
- `Cut web`/`Burn web` if inventory/actions support it.
- `Disarm land mine/bear trap` and then `Pick up` object variant after disarmed.
- `Enter portal` / `Step into trap` only as explicit danger/intent.
- `Use invocation/vibrating square` late-game actions only from core affordance.

State-dependent variants:

- Current square vs adjacent trap.
- Trap seen/known vs hidden.
- Trap type and untrappable state.
- Hero `u.utrap`, `utraptype`, turns remaining, stuck/swallowed.
- Levitating/flying/water walking may avoid triggering some traps/hazards.
- Trapped door/chest knownness separate from terrain/object trap.

Data needed:

- `t_at(x,y)`, `ttyp`, `tseen`, `u.utrap`, `utraptype`, core `could_untrap`/legality, current/adjacent target id.
- Hazard/danger classification and disabled reasons.

### 5. Altars, sacrifice, prayer, BUC testing, temples

NetHack conventions:

- Altars support offering corpses, prayer, dropping items for BUC testing, sitting, looking/inspection, and temple/priest interactions. Altar alignment and prayer safety are sensitive and partially knowledge-dependent.

Missing contextual actions:

- `Offer corpse` only when a corpse/offerable item is on altar or selectable; currently `Offer sacrifice` appears on any altar.
- `Choose corpse to offer` when multiple corpses/items exist.
- `Pray at altar` with caution/danger styling and optional disabled reason if core can safely expose prayer danger.
- `Drop items for blessing/curse testing` with multi-select inventory picker.
- `Inspect altar` with known alignment/shrine/temple data.
- `Sit on altar` as advanced.
- `Chat with priest`, `Donate to priest`, `Attack priest` danger when priest adjacent.
- `Pay/temple services` where applicable.

State-dependent variants:

- Altar alignment known/unknown, cross-aligned/same-aligned/Moloch.
- Shrine/temple/sanctum state.
- Priest present/hostile/peaceful.
- Corpse freshness/sacrifice value, undead/demon/human/cannibal implications.
- Cursed/known BUC inventory items.
- Prayer timeout/safety.

Data needed:

- Terrain altar flags/player-known alignment; floor pile corpse summary; inventory/floor item IDs; prayer safety if exposed; priest monster role/attitude; temple/shop room state.

### 6. Fountains, sinks, thrones, graves, trees, iron bars, drawbridges, engravings

Missing contextual actions:

- **Fountain:** `Drink from fountain`, `Dip item`, `Search`, `Kick fountain`, `Apply tool`; caution confirmation; looted/warned state where known.
- **Sink:** `Drink from sink`, `Dip item`, `Drop ring in sink`, `Kick sink`, `Search`; ring-specific picker; pudding/dishwasher/ring looted state only when known.
- **Throne:** `Sit on throne` danger/caution, `Search`, `Loot room` where applicable, `Kick` advanced; state `T_LOOTED`.
- **Grave/headstone:** `Read headstone`, `Engrave`, `Dig grave` with tool picker and danger confirmation, `Search`; empty grave state.
- **Engraving:** `Read engraving`, `Engrave`, `Wipe engraving`, `Overwrite/Add text`; tool picker + text field; known text.
- **Tree:** `Kick tree`, `Chop tree`, `Search`, `Loot fruit` if known; swarm/looted state.
- **Iron bars:** `Look through bars`, `Kick bars`, `Dig/break/zap bars` with tool/wand picker.
- **Drawbridge:** `Cross bridge`, `Open/lower/raise bridge` only if control mechanism known and core says legal; `Search`, danger confirmations.

State-dependent variants:

- Looted/warned flags for fountains/thrones/trees/sinks/graves.
- Known engraving/headstone text vs unknown.
- Current square vs adjacent feature.
- Tool availability and danger (digging grave, kicking sink/tree/altar, drawbridge crushing).

Data needed:

- Decoded `levl` terrain type and feature flags (`looted`, `warned`, `ring`, `pudding`, `dishwasher`, `emptygrave`, drawbridge orientation/under terrain), engraving text/knownness, and inventory tools.

### 7. Ground items, corpses, gold, boulders, statues, and piles

Missing contextual actions:

- `Browse pile` with visible item-card list.
- `Pick up selected`, `Pick up all`, quantity steppers.
- `Pick up gold` / `Pick up unpaid item` / `Buy item` variants.
- `Eat corpse/food` with corpse/item picker.
- `Offer corpse` when on altar.
- `Loot container` when pile includes container even if top glyph is different.
- `Pay for unpaid items` when pile/shop context applies.
- `Push boulder <dir>`, `Kick boulder`, `Pick up boulder` only if possible.
- `Inspect statue`, `Break statue`, `Loot statue`, `Untrap statue trap` if known.
- `Drop item here` contextual to floor/altar/shop/sink.

State-dependent variants:

- Single top object vs pile.
- Known object identities/classes vs unknown appearances.
- Stack quantity, weight, shop ownership/unpaid price.
- Corpse age, poisonous/acidic/petrifying/cannibal/vegan considerations.
- Boulder adjacent vs current, Sokoban constraints, strength/giant forms.
- Statue trap/contents knownness.

Data needed:

- Full current-square object chain summary with object IDs, display names, object classes, quantities, weight, edible/corpse/container/gold/boulder/statue/unpaid flags, corpse metadata if safely known.

### 8. Shops, unpaid items, billing, buying and selling

Missing contextual actions:

- `Pay shop bill` with bill dialog, total, item list.
- `Buy item` / `Pick up unpaid item` with price/confirmation where known.
- `Sell/drop item` with item picker and ownership warnings.
- `Inspect price` for floor/shop item.
- `Chat with shopkeeper`.
- `Attack shopkeeper` danger/advanced with confirmation.
- `Leave shop`/debt warning if known.

State-dependent variants:

- In shop vs outside; shopkeeper present/angry/dead; unpaid carried items; owned floor objects; bill total known; item price known/unknown; pet theft; credit/no gold; closed shop door.

Data needed:

- Room/shop state, shopkeeper monster target, bill entries/totals, object unpaid/owned flags, price visibility, sale eligibility, player gold.

### 9. Hazards: water, lava, ice, air/cloud, drawbridge danger

Missing contextual actions:

- `Move into water/lava` as explicit danger action with confirmation.
- `Walk on water`, `Fly over lava`, `Levitate across` when hero state makes it safe.
- `Cannot safely cross` disabled reason.
- `Dip item in water/lava` with item picker and danger.
- `Freeze water/lava/cool lava` via wand/spell/tool if known.
- `Search/Inspect hazard`.
- `Travel around hazard`.

State-dependent variants:

- Hero levitating/flying/water walking/swimming, fire resistance, burden, riding mount, polymorph form, inventory protection.
- Hazard current vs adjacent; underwater/swallowed/special plane contexts.
- Ice slipping/melting; moat/pool/water/lava/cloud/air distinctions.

Data needed:

- Terrain type and underlying terrain; hero movement/resistance/capability flags; available wands/spells/tools; pathfinding/hazard risk from core.

### 10. Movement, travel, walls, corridors, secret discovery, and far targets

Missing contextual actions:

- `Travel here` for non-adjacent cells with stable target.
- `Throw at target` for lined-up far targets.
- `Inspect map symbol` for current/adjacent/far cells.
- `Search wall/corridor` without revealing secret state.
- `Dig wall`, `Kick wall`, `Chop tree`, `Break bars` when tool/capability exists.
- `Run`, `fight`, `go to`, and repeat movement variants in a contextual manner.

State-dependent variants:

- Adjacent passability, diagonal movement restrictions, boulders, doors, walls, known traps/hazards, travel command enabled, blindness/map memory.

Data needed:

- Adjacent and far cell passability/target list; wall diggability knownness; inventory digging/chopping tools; line of fire; travel availability.

### 11. Hero state overrides and status-driven actions

Missing contextual actions:

- `Escape` / `Untrap self` when stuck in web/bear trap/pit.
- `Dismount` / `Ride` when mounted or adjacent rideable.
- `Attack inside` / `Cut free` / `Pray?` when swallowed/stuck, if core allows.
- `Drop weight` when burdened/stressed and movement is impacted.
- `Rest/heal`, `Eat`, `Pray`, `Quaff`, `Read`, `Zap`, `Apply` recommendations only when safe and not spoilery.
- `Stop current multi-turn action` if busy/occupation is active.
- `Remove cursed item`/`Take off` variants only when known and appropriate.

State-dependent variants:

- Trapped, stuck, swallowed, riding, levitating, polymorphed, hallucinating, blind, confused, stunned, burdened, hungry/fainting, sick, slimed, stoning, strangling, wounded, no hands/can reach floor.

Data needed:

- Hero status flags and conditions, occupation state, equipment/cursed knownness, inventory remedies if core can safely expose them.

### 12. Carried items and knownness/cursed/equipped variants

Already partially implemented in `inventory-action-service.js`, but missing contextual/state depth:

- Cursed equipment should alter remove/takeoff affordances and warn/disable if stuck.
- Known BUC should be badges and filters; unknown BUC should not be guessed.
- Known object identity vs appearance should affect labels (`milky potion`, `potion of healing`, `uncursed potion`).
- Blessed/cursed/erosion/charges/known charges should affect action labels for scrolls, wands, tools, lamps, candles, tins, eggs, corpses.
- `Invoke`, `rub`, `charge`, `light`, `snuff`, `open tin`, `apply key to door/chest`, `use towel/blindfold`, `use stethoscope`, `use camera`, etc. need item-specific affordances beyond broad regex categories.
- Shop unpaid/owned inventory items need Pay/Drop/Sell/Steal danger context.

Data needed:

- Structured inventory item model instead of parsing row text: item UID, base type, known name, appearance name, BUC known/value, quantity, charges known/value, erosion, equipment slot, cursed-stuck status, unpaid/owned, weight, class-specific affordances.

## Data sources/game state needed

The action system needs a player-knowledge-safe, structured event from core/shim rather than ad hoc renderer inference. Minimum proposed data:

1. **Hero state**
   - Coordinates, map window id/turn, can reach floor, can move, trapped/stuck/swallowed/riding/levitating/flying/water walking/swimming/fire resistance, burden, hunger/major ailments, polymorph/no-hands constraints, current occupation.
2. **Current square terrain**
   - Actual terrain type as known to player; cmap/display; decoded flags for door/altar/fountain/sink/throne/tree/grave/drawbridge/stairs/ladder/water/lava/ice; passability; danger.
3. **Current square object pile**
   - Count and top item; list or summary of floor object UIDs, display names, object classes/types, quantities, edible/corpse/container/gold/boulder/statue/tool/weapon flags, unpaid/owned, known locked/trapped, BUC known/value where player knows.
4. **Current square trap/engraving/specials**
   - Trap type/seen/current trapped state; engraving/headstone known text; vibrating square/special branch/invocation affordance where appropriate.
5. **Adjacent target list**
   - For each of 8 directions: terrain state, door state, wall/diggability knownness, trap, pile summary, boulder, monster target, hazard, passability, target labels, stable target IDs.
6. **Monster targets**
   - UID, visible name, attitude, tame/peaceful/hostile, role (shopkeeper/priest/guard/quest/Oracle), saddle/rideability, sleeping/invisible/knownness, legal actions.
7. **Shop state**
   - In shop, shop type, shopkeeper target, bill count/total, unpaid carried/floor items, price knownness, buy/sell/drop/pay availability.
8. **Inventory/equipment model**
   - Structured item IDs and class/state metadata for filtering tool/item prompts.
9. **Command/action affordances**
   - Authoritative list of actions with id, label, target id, priority, danger, enabled, disabled reason, prompts expected, command mapping or core action id, consumes-turn expectation.
10. **Prompt/result transactions**
   - `actionStarted`, `prompted`, `completed`, `failed`, `cancelled`, message refs, changed objects/targets, and stale-action invalidation.

## Proposed action-affordance schema

A long-term event should be generated by core/shim every turn or on relevant map/inventory/status changes:

```json
{
  "name": "action_affordances",
  "turn": 1234,
  "hero": { "x": 40, "y": 12, "trapped": false, "riding": false, "levitating": false },
  "context": {
    "terrain": { "typ": "ALTAR", "display": "altar", "known": true, "flags": { "alignmentKnown": true, "alignment": "lawful" } },
    "pile": { "count": 1, "items": [{ "id": "floor:40,12:1", "name": "jackal corpse", "classes": ["food", "corpse"] }] },
    "trap": null,
    "shop": { "inShop": false, "billTotal": null }
  },
  "adjacent": [
    { "id": "cell:40,11", "dir": "n", "label": "north door", "terrain": { "door": { "state": "closed", "lockedKnown": false, "trappedKnown": false } } }
  ],
  "actions": [
    {
      "id": "offer.floor-corpse.1",
      "label": "Offer jackal corpse",
      "group": "primary",
      "priority": 100,
      "targetId": "floor:40,12:1",
      "command": { "kind": "extended", "name": "offer" },
      "requires": ["confirmationPossible"],
      "danger": "normal",
      "enabled": true,
      "disabledReason": null,
      "promptPreview": "May ask which item if several corpses are present."
    }
  ]
}
```

Notes:

- Actions must already be filtered for player knowledge.
- Use stable target/object IDs valid for the current turn/transaction.
- `danger` should be at least `safe`, `normal`, `caution`, `danger`, `forbidden`.
- `requires` should include `direction`, `inventory`, `quantity`, `confirm`, `text`, `target`, `container-transfer`, `shop-bill`, `turn-consuming`.
- `disabledReason` is a first-class UI field, not an afterthought.
- The renderer can initially accept `command.kind` as legacy key/extended/key-sequence, then migrate to `core-action-id`.

## Risks and edge cases

1. **Spoilers/knowledge leaks.** Showing `Untrap trapped chest` before the trap is known, `Search secret door east` before discovery, exact altar alignment before known, or shop prices before known would be a gameplay bug.
2. **Wrong primary action can be fatal.** Making `Attack` primary for a pet/peaceful, `Move into lava`, `Sit on throne`, `Pray` at unsafe times, or `Eat corpse` without warnings can hurt the player.
3. **Brittle key staging.** Current key/extended-command routing can desynchronize if NetHack asks an unexpected prompt, if multiple targets exist, or if command queue timing differs.
4. **Multiple target ambiguity.** Generic `Open`/`Chat` is poor when several doors/monsters are adjacent. Buttons need explicit target labels or a target picker.
5. **Prompt leakage.** GUI-first requirements are violated if raw selector-only fallback labels (`Inventory selector j`) or unexplained command letters are shown as primary UI.
6. **Map memory vs reality.** Renderer map cells may be stale under blindness, hallucination, invisibility, moving monsters, or after a redraw. Core affordances should be turn-bound.
7. **Object identity ambiguity.** Top glyph does not represent piles; item names can be unknown/appearance-based; parsing English rows is fragile.
8. **Shop edge cases.** Pet theft, unpaid items, owned containers, breaking doors, dropping/selling, and shopkeeper hostility can cause unexpected debt/anger.
9. **Trap and hazard legality.** Some traps are not disarmable; some hazards are safe only with particular statuses. False `Untrap`/`Cross safely` labels will confuse or kill players.
10. **State overrides.** Trapped/swallowed/riding/levitating/no-hands states can make otherwise normal floor actions impossible or change command behavior.
11. **Performance/clutter.** A full action list can become noisy. The UI needs priority/grouping rules and an overflow menu.
12. **Validation burden.** NetHack has many state combinations; tests must include real Electron gameplay and screenshot QA, not just fixtures.

## Recommended implementation priorities and slices

### Slice 0: Document and preserve current behavior

- Keep the current heuristic bar stable.
- Add comments linking `buildContextActions()` to this report and to the future `action_affordances` protocol.
- Add tests asserting current safe labels remain player-facing.

### Slice 1: Safe heuristic improvements only

Goal: improve labels and target specificity without pretending to know hidden state.

- Keep base actions: `Search`, `Wait`, `Inspect`.
- Current square: `Pick up`, `Ascend`, `Descend`, `Engrave`, `Drink from fountain`, `Dip item`, `Drink from sink`, `Offer` only when current pile/cell suggests corpse or at least keep label generic/caution, `Loot` only for obvious visible container.
- Adjacent single-target doors: explicit `Open north door`, `Close east door`; if multiple, target chip picker.
- Adjacent pet: `Chat with northwest pet`; do not show attack as primary unless hostile is known.
- Put dangerous/uncertain actions (`Kick`, `Force`, `Untrap`, `Pray`, `Sit`, `Move into hazard`, `Attack peaceful`) in More/danger.

Validation: real Electron scenarios for normal floor, stairs, one closed door, pet chat, fountain/sink, obvious pickup.

### Slice 2: Core/shim action-affordance prototype

Goal: expose a minimal authoritative affordance list from NetHack instead of renderer regexes.

- Add a shim event for current-square and adjacent actions based on `src/cmd.c` `MCMD_*` logic.
- Start with fields: id, label, group, priority, target dir/current, command mapping, danger, enabled.
- Include no hidden state beyond what NetHack itself would present in `there_cmd_menu`.
- Renderer prefers protocol actions when present; falls back to heuristics otherwise.

Suggested first core actions:

- Current: drink fountain/sink, dip fountain, sit throne, offer altar, stairs/ladders up/down, pickup/loot/tip/eat floor object, inventory/drop/rest/search/look/cast, untrap current known trap.
- Adjacent: open/close/lock/untrap/kick door, search secret doors, examine/untrap/move onto visible trap, push boulder, ride/saddle/talk/swap/name/attack monster, look map symbol.
- Far: throw if lined up, travel here.

### Slice 3: Structured targets and prompt wrappers

Goal: make GUI-first prompt flows robust.

- Add stable target IDs for current square, adjacent cells, visible monsters, doors, traps, containers, floor objects.
- Convert direction prompts to target chips/highlights.
- Convert item selectors to item cards using visible names and metadata.
- Add confirmation/quantity/text prompt wrappers with action context.
- Add action result events or at least action correlation IDs.

### Slice 4: Object pile, container, and shop metadata

Goal: cover the highest-value NetHack item interactions.

- Floor pile summary and floor object IDs.
- Container locked/trapped/known state; container transfer two-pane UI.
- Shop bill/unpaid/owned/price state; Pay/Buy/Sell/drop warnings.
- Corpses/food/altar offering with safe labels.

### Slice 5: Traps, hazards, and hero state overrides

Goal: avoid dangerous false affordances.

- Trap type/current trapped state/untrappable disabled reasons.
- Hazard state for water/lava/ice and hero movement capabilities.
- State override priority: trapped, swallowed, riding, levitating, burdened, no hands/cannot reach floor.
- Danger confirmations for hazardous movement, attacking peacefuls, throne/fountain/sink/kick/dig grave.

### Slice 6: Advanced item-specific affordances

Goal: close inventory/action completeness gaps.

- Structured inventory item model.
- Apply-specific actions for keys, lock picks, tools, lamps, candles, towels, blindfolds, tins, cameras, stethoscopes, leashes, saddles, digging/chopping tools.
- Invoke/rub/charge/light/snuff/name/call/identify flows.
- Cursed/knownness/equipped/unpaid state variants.

## UI priority rules for eventual implementation

- One primary action only, selected by confidence and safety.
- Up to three common secondary actions.
- Use target-specific labels (`Open north door`, `Chat with kitten west`) instead of generic verbs.
- Use More/Advanced for dangerous, rare, inventory-dependent, or uncertain actions.
- Caution/danger styling for `Pray`, `Sit throne`, `Drink fountain`, `Kick`, `Force`, `Untrap`, `Dig grave`, `Attack peaceful`, `Move into lava/water`.
- Disabled actions are useful only with non-spoilery reasons.
- Do not reveal hidden traps, secret doors, unknown container traps, altar alignment, or shop prices.
- Keep raw NetHack command keys as secondary hints/tooltips, not button labels.

## Next steps and validation note

1. Treat this report and the existing `context-action-bar-plan.md` / `context-action-bar-gui-first-plan.md` as the contextual-actions backlog.
2. Choose whether the next engineering task is a small heuristic polish slice or the core/shim `action_affordances` prototype. The prototype is the stronger architecture choice.
3. If implementing protocol support, start by wrapping NetHack's existing `MCMD_*` contextual menu logic rather than inventing a separate renderer rules engine.
4. Add fixture tests only for fast coverage; they are not sufficient for completion.
5. For every player-facing contextual action implementation, follow the project real-game MCP validation rule:
   - Launch the real Electron app/game path.
   - Use visible gameplay automation to stand in each context and click the actual button.
   - Capture screenshots before/after and inspect them for player-facing blockers.
   - Assert visible labels, item names, target chips, confirm/cancel paths, and prompt titles.
   - Document exact steps, screenshots, and test output in `employee-result.md` for the implementation task.

No UI changes were made for this report.
