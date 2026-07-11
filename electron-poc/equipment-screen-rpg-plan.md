# Best modern RPG equipment screen plan

Planning only. No gameplay/UI code was changed.

Related plan: [Best modern inventory/context-menu design plan](inventory-context-menu-plan.md). Equipment drag/drop, right-click item cards, target pickers, prompt handling, and result feedback must share the same semantic action-affordance and transaction architecture.

## Product intent: best user experience first

The equipment screen should behave like a modern RPG paper doll while preserving NetHack rules. The player expresses intent visually; the core/shim validates and executes it safely.

Core principles:

- **Drag/drop means the obvious player intent.** Dragging darts onto main hand means wield/swap them into main hand. Dragging the same darts onto quiver means ready them as ammo. Dragging armor onto an occupied armor slot means replace it if the current item can be removed.
- **Right-click any equipped or carried item shows all appropriate GUI actions.** Wield, ready, wear, take off, put on left/right, remove, throw, fire, apply, eat, quaff, read, zap, drop, split, inspect, name, offer, dip, pay, and context-specific actions appear as player-readable entries.
- **No raw letter menus in the final design.** Classic selector letters can be optional hints, but final prompts must be item cards, target pickers, hand/slot pickers, quantity controls, confirmation dialogs, and result toasts.
- **Build the protocol needed for the best design.** Do not reject good UX because current command routing is awkward; add item IDs, slot metadata, prompt typing, semantic action IDs, and transactions.

## Target equipment UI

- **Paper doll slots:** head/helmet, eyes/blindfold/lenses/towel, neck/amulet, cloak, body armor, shirt, gloves, boots, main hand, offhand/shield, alternate weapon, quiver, left ring, right ring, and future two-weapon state.
- **Inventory pane:** item cards/rows with real names, counts, icons/glyphs, equipped badges, known BUC/enchantment/charges, shop/unpaid flags, weight where useful.
- **Interaction surfaces:** drag inventory item to slot, drag equipped item to inventory/ground/container, right-click item/slot for actions, keyboard Actions menu, visible clear/remove buttons, accessible target/quantity/hand modals.
- **Feedback:** slot highlights communicate valid/caution/blocked; results show “Wielded 3 darts in main hand”, “Cannot remove cloak: it is cursed”, or “Choose how many arrows to ready”.

## Ideal equipment interactions and required behavior

| Interaction | Best GUI behavior | NetHack semantics today | Required core/shim/protocol work |
|---|---|---|---|
| Inventory weapon -> empty main hand | Highlight main hand; drop wields item; result toast and updated slot. | `w<selector>`. | Stable item ID, `canWieldInMainHand`, result event, cursed/welded blocker if current weapon exists. |
| Inventory weapon -> occupied main hand | Replace current weapon where safe; if current weapon is cursed/welded show blocker; if quantity needed show picker. | Often `w<new>` handles replacement unless current item blocks. | `replaceSlot(mainHand,newItemId,quantity?)`, current weapon stuck status, transaction abort/result. |
| **Darts/ammo -> main hand** | **Boss-required:** treat as deliberate wield/swap request, not invalid ammo and not generic action menu. Quantity picker if stack rules need it. | `w<selector>`; NetHack may wield stack or prompt/fail. | Core exposes both `canWieldInMainHand` and `canQuiver`; drop target chooses action; stack quantity metadata; no renderer ammo rejection. |
| Darts/ammo -> quiver | Ready as quivered ammo; if occupied, replace quivered item; quantity picker. | `Q<selector>`. | `setQuiver(itemId,quantity?)`, `clearQuiver`, quantity defaults, ammo/throwable compatibility. |
| Launcher -> main hand | Wield launcher; show compatible quivered ammo or “Ready ammo” suggestion. | `w<selector>`, `f`, `Q`. | Launcher/ammo compatibility, affordance suggestions, empty-ammo disabled reason. |
| Armor/cloak/helmet/gloves/boots -> empty slot | Wear in matching slot; slot highlights only matching/caution targets. | `W<selector>`. | Canonical armor slot metadata, layer/conflict rules, wear result. |
| Armor/cloak/helmet/gloves/boots -> occupied slot | Replace current item by safely taking off current item then wearing new item; show cursed/stuck/layer blocker. | `T<old>` then `W<new>` if first succeeds. | `replaceSlot(slotId,newItemId)` transaction, selector-independent item IDs, step prompts/results. |
| Shield/offhand interactions | Wear/replace shield; explain two-handed weapon/two-weapon conflicts; offer explicit conflict choices where safe. | `W/T`, two-weapon commands vary. | Offhand slot, shield/two-handed/two-weapon conflict graph, remove/unwield transaction choices. |
| Rings -> left/right ring | Drag to exact hand or menu action “Put on left/right hand”; occupied hand replaces if removable. | `P<selector>` plus hand prompt; `R<old>`. | Explicit left/right slots, typed hand prompt, `replaceSlot(leftRing/rightRing,itemId)`, cursed ring blocker. |
| Amulet -> neck | Put on or replace neck item; special amulet warnings. | `P`, `R`. | Neck slot, artifact/special flags, removal blocker, value/quest warnings. |
| Eyewear/blindfold/towel/lenses -> eyes | Put on/replace eyes item; vision side-effect warning. | `P/R`, sometimes `a`. | Eyes slot, wearable-tool tags, vision warning, replacement transaction. |
| Equipped item -> inventory | Clear slot/remove item, not drop it; preserve item card in inventory. | Weapon `w-`, armor `T`, accessories `R`, quiver clear. | `clearSlot(slotId)` transaction with cursed/welded/stuck results. |
| Equipped item -> ground/drop zone | Remove then drop with confirmation and quantity if needed. | `T/R/w-/Q-` followed by `d/D`. | `removeThenDrop(slotId,quantity?)` transaction; abort if removal fails; stable item ID after removal. |
| Main hand <-> alternate weapon | Drag/swap where semantically valid; also offer visible Swap button. | `x` handles current/alternate swap. | `canSwap(mainHand,alternateWeapon)`, alternate slot metadata, result events. |
| Inventory item -> alternate weapon | Set alternate weapon without accidentally wielding it. | Awkward with classic flows. | `setAlternateWeapon(itemId)` core action. |
| Main/offhand/two-weapon swaps | Support only where NetHack semantics allow; explain skill/body/shield/two-handed blockers. | `X`/two-weapon commands vary. | Hand/offhand metadata, skill/body requirements, conflict graph, transactions. |
| Clear quiver/unwield/remove buttons | Visible slot controls: Clear weapon, Clear quiver, Take off, Remove ring. | `w-`, `Q-`/prompt, `T`, `R`. | `clearSlot` per slot, typed prompt if legacy command asks follow-up. |
| Right-click equipped or inventory item | Show same item card/context menu as inventory plan with equipment-aware actions first. | Many single-letter and extended commands. | Shared `InventoryActionAffordance` service; action IDs reused across drag/drop and menu. |

## Best GUI prompt behavior by action type

- **Quantity:** stack drops, throws, quiver, wielding missiles, gold payment/drop use a quantity popover with All/One/custom.
- **Hand/slot:** rings use explicit left/right buttons; weapons use main/offhand/alternate where valid; armor replacement dialogs show current item and replacement.
- **Target:** throw/fire/zap/apply/dig/unlock uses clickable map target picker plus direction chips.
- **Item-to-item:** dip, write, unlock with key, tin corpse, put into container use item-card pickers for the secondary item.
- **Confirmation:** cursed/unknown/dangerous/shop/valuable/quest/artifact actions use semantic confirmation dialogs.
- **Result:** every action emits structured success/failure/cancel/turn-consumed feedback.

## Required core/shim/protocol additions

### Structured equipment and inventory state

- Stable `itemId`; selector letter as temporary routing detail only.
- Object class, `otyp`, semantic tags, count, stack/quantity range, display name, glyph/tile.
- Known BUC, enchantment, erosion, charges, greased, shop/unpaid, container lock/trap state, corpse safety where player-known.
- Exact equipped slots: main hand, offhand/shield, alternate weapon, quiver, armor layers, left/right ring, amulet, eyes.
- Slot metadata: empty/occupied/blocked/hidden, allowed capabilities, body location, conflicts, current item.
- Hero/context metadata: hands/body form, two-handed/two-weapon state, role/skill, cursed/welded/stuck blockers, terrain/shop/altar/fountain, adjacent targets.

### Semantic action affordances

Expose computed/validated actions such as `item.wield.mainHand`, `item.quiver`, `slot.replace`, `slot.clear`, `slot.removeThenDrop`, `item.putOn.leftRing`, `item.putOn.rightRing`, `item.wear.slot`, `item.takeOff`, `item.throwAtTarget`, `item.dropQuantity`, `item.inspect`.

Each affordance should include label, enabled/disabled reason, danger level, prompt plan, quantity/target/hand/slot params, execution route, and turn/result expectations. The renderer should not infer final legality from row text.

### Typed prompts and safe transactions

Typed prompts needed: item selector, quantity, target/direction, hand/slot choice, yes/no, danger confirm, free text, container contents, shop payment. Prompt options must carry semantic values like `leftHand`, `rightHand`, `all`, `one`, `northDoor`, `cancel`.

Transactions needed: `equipSlot`, `replaceSlot`, `clearSlot`, `removeThenDrop`, `setQuiver`, `clearQuiver`, `setAlternateWeapon`, `swapSlots`, `moveItemToContainer`, `dropQuantity`. Transactions must abort on failed/unresolved steps and emit `started`, `prompt`, `stepSucceeded`, `stepFailed`, `committed`, `aborted` events with user-facing and machine-readable reasons.

## Migration note: safe/current selector routing is secondary

Current command routing is an implementation bridge only. It should not define the UX.

Temporary compatibility can use single prompt-starting commands (`w`, `Q`, `W`, `T`, `P`, `R`, `a/e/q/r/z/t/d`, `#loot`, `#name`, etc.) when wrapped by modern UI. It must not:

- reject desired actions such as darts -> main hand merely because heuristics call them ammo;
- fall through to a generic raw “what do you want to do with item j?” menu;
- show raw selector-letter menus as polished UX;
- auto-answer hand/direction/quantity/confirmation prompts without typed prompt support;
- send blind multi-command chains such as remove old armor then wear new armor unless a transaction monitors each step.

## Recommended implementation architecture

Implement a shared **Inventory/Equipment Action Service**:

1. Normalizes item/slot/context state into semantic records.
2. Requests or computes `InventoryActionAffordance` entries.
3. Drives item cards, context menus, drag/drop slot highlights, target pickers, quantity controls, confirmations, and result toasts.
4. Executes through core actions/transactions when available and isolated compat key sequences while migrating.
5. Logs raw fallback prompts as UX blockers for final design.

## Phases toward the best design

### Phase 1 — GUI-first action service and intent-correct equipment drops

Chosen because it establishes the target architecture and correct player intent, not because it is the safest minimal patch.

- Introduce semantic action IDs/data shape for item cards and equipment drops, even if some entries execute through compat keys.
- Make main-hand drops action-based: darts/ammo and weapons dropped on main hand request `item.wield.mainHand`; quiver drops request `item.quiver`.
- Add right-click/keyboard item card actions for representative equipped and carried items, sharing the same affordance entries.
- Consume equipment-slot drops so no generic raw action menu appears.
- Wrap observable prompts in modern UI where possible; if a raw letter prompt appears in real Electron screenshots, treat it as a blocker.

### Phase 2 — stable item IDs, typed prompts, and result events

- Add stable item IDs, slot metadata, typed quantity/hand/target/item/text/confirm prompts, semantic prompt options, and action result events.
- Replace raw selector menus with item-card pickers.

### Phase 3 — transaction-backed replacement/removal

- Implement occupied armor/ring/amulet/eyes/weapon/quiver replacement, explicit left/right rings, clear slot, remove-then-drop, and quantity-aware quiver/drop/wield.
- Show precise cursed/stuck/welded/two-handed/shop blockers and confirmations.

### Phase 4 — full modern inventory/equipment management

- Drag/drop among equipment, inventory, ground, containers, shops, map features, and monsters.
- Context menus cover all sensible actions per item category.
- No raw NetHack letter menus in normal final-path GUI; classic command layer remains optional.

## Test and real Electron/MCP validation strategy

Implementation must follow project rules: real Electron gameplay automation is required for player-facing UI changes.

Validation must launch the real app, use actual player actions, capture screenshots, and assert player-facing labels. Required scenarios include darts -> main hand, darts -> quiver, occupied main hand replacement, armor replacement, ring left/right, equipped item clear/remove, right-click item menus, quantity controls, target picker, and cursed/welded blockers. Screenshots showing raw selector labels, stale fallback rows, or generic item-action menus in the final path are blockers.

## Recommended next implementation slice

Build Phase 1 as the first real implementation slice:

1. Create the shared semantic action-affordance shape/service in the renderer boundary.
2. Route main-hand equipment drops through `item.wield.mainHand`, explicitly including darts/ammo; route quiver drops through `item.quiver`.
3. Add right-click/keyboard item cards for darts/ammo, weapon, armor, ring/amulet, food, potion/scroll/book, wand, and tool/container with modern labels.
4. Use current single-command routing only behind these semantic actions, with no blind replacement chains.
5. Add real Electron/MCP validation proving actual item names/actions are visible and no raw letter menus appear for these flows.
