# Best modern inventory/context-menu design plan

Planning only. No gameplay/UI code was changed.

Related plan: [RPG drag-and-drop equipment screen rework plan](equipment-screen-rpg-plan.md). The inventory context menu, item cards, drag/drop equipment model, ground actions, prompt UI, and result feedback should all use the same semantic action affordance layer.

## Product intent: design the best UI first

The target is not “what can we safely fake with selector letters today.” The target is a modern NetHack inventory that lets players manage items with direct, readable GUI actions:

- **Right-click/long-press/keyboard Actions on any item** opens a contextual menu/card with all appropriate actions for that item and situation.
- **Drag/drop** expresses intent directly: darts dropped on main hand means wield/swap into main hand; darts dropped on quiver means ready as ammunition; armor dropped on a worn slot means replace if the current item can be removed.
- **No raw letter menus in the final design.** Selector letters may remain visible as optional classic hints, but final prompts must show item names, actions, quantities, targets, hand choices, confirmations, and results in player-readable GUI controls.
- **The GUI should be authoritative in presentation, while core/shim is authoritative in rules.** The renderer asks for action affordances; the core/shim validates curses, stuck items, shop rules, targeting, quantities, and turn-consuming transactions.

## Ideal item interaction model

### Item card and context menu

Right-clicking an inventory row or equipment slot opens an item card/menu with:

1. **Header:** actual item name, icon/glyph, count, equipped badges, known BUC/enchantment/charges/shop price where known.
2. **Primary actions:** the best likely verbs for the item: Wield, Wear, Eat, Quaff, Read, Zap, Apply, Loot/Open, Put on, Remove, Ready in quiver.
3. **Target actions:** Throw at…, Fire at…, Zap at…, Dig…, Unlock…, Dip into…, Engrave with…, selected via map target picker or target chips.
4. **Location actions:** Offer on altar, Pay in shop, Dip at fountain/water, Unlock adjacent door/chest, Loot floor container.
5. **Inventory management:** Drop, Drop quantity, Split stack, Move to quiver, Name/label, Inspect, Adjust classic letter.
6. **Dangerous/advanced section:** force locks, eat unsafe corpse, quaff/read unknown dangerous items, invoke artifacts, drop unpaid/valuable objects, break/force flows. These use explicit confirmation dialogs.

### Follow-up widgets

- **Quantity controls:** steppers, `1`, `All`, custom amount, and item-specific defaults for stacks, gold, missiles, drop/throw/quiver.
- **Target picker:** clickable map cells/monsters/features, direction chips (`North door`, `Goblin east`, `Fountain here`), and keyboard direction fallback.
- **Slot/hand picker:** explicit left/right ring choices, main hand/offhand/alternate/quiver choices, and visible conflict explanations.
- **Item picker:** item cards for secondary-item actions such as dip one item into a potion, unlock a chest with a key, write with a marker, tin a corpse.
- **Confirmation dialogs:** clear title, exact risk, result of continuing, and Cancel/Proceed buttons.
- **Result feedback:** toast plus log entry: succeeded/failed/blocked/consumed turn, with reason such as cursed, welded, no charges, unpaid, unsafe food, no target, too heavy.

## Category action matrix — best GUI behavior first

| Item category | Best GUI behavior | Current command semantics | Core/shim/protocol support required |
|---|---|---|---|
| Melee weapons, picks, polearms | Card offers **Wield in main hand**, **Set alternate**, **Throw**, **Engrave with**, **Dip**, **Force lock**, **Drop/Split**, **Inspect**. Drag to main hand wields/replaces; drag to alternate sets alternate; drag to target throws/attacks where valid. | `w`, `x`/alternate flows, `t`, `E`, `#dip`, `#force`, `d/D`. | Stable item IDs, weapon tags, alternate-weapon affordance, cursed/welded current weapon status, two-handed/offhand conflict graph, target affordances for polearms/throwing, transaction results. |
| Ammo/missiles: darts, arrows, bolts, shuriken, rocks | Card offers **Ready in quiver**, **Throw one/amount**, **Wield in main hand**, **Fire** if quivered/launcher compatible, **Drop/Split**. **Boss-required behavior:** dragging darts/ammo onto main hand wields/swaps them where safe; dragging onto quiver readies them. | `Q`, `t`, `w`, `f`, `d/D`. | `canWieldInMainHand` and `canQuiver` can both be true; quantity picker; launcher/ammo compatibility; current slot replacement transaction; no heuristic rejection because item is ammo. |
| Launchers: bows, crossbows, slings | **Wield launcher**, **Fire compatible ammo**, **Ready best ammo**, **Throw launcher**, **Drop**. UI can suggest compatible ammo cards. | `w`, `f`, `Q`, `t`, `d`. | Compatibility metadata, quivered item state, ammo suggestions, empty/no-ammo disabled reasons. |
| Armor: shirt/body armor/cloak/helmet/gloves/boots/shield | **Wear in matching slot**, **Replace current slot item**, **Take off**, **Drop after remove**, **Inspect**, **Name/Dip**. Drag onto occupied slot removes current item then wears replacement through a safe transaction. | `W`, `T`, `d`, `#dip`, `#name`. | Canonical armor slots/layers, occupied-slot replacement transactions, cursed/stuck status, cloak/body layering, shield/two-handed conflicts, remove-then-drop transaction. |
| Rings | **Put on left hand**, **Put on right hand**, **Replace left/right ring**, **Remove**, **Drop**, **Drop into sink** only as explicit location/danger action. | `P` plus hand prompt, `R`, `d/D`. | Explicit hand metadata, typed hand prompt, per-hand slots, cursed ring removal blockers, sink context, transaction `replaceSlot(leftRing/rightRing,itemId)`. |
| Amulets | **Put on neck**, **Replace amulet**, **Remove**, **Invoke** if special, **Drop** with high-value warnings. | `P`, `R`, `#invoke`, `d/D`. | Neck slot state, special artifact/invocation flags, cursed removal, value/quest warnings. |
| Eyewear/blindfold/towel/lenses | **Put on eyes**, **Remove**, **Apply** if also a tool, **Replace eyes item**, **Drop**, with vision-change warning. | `P/R`, sometimes `a`, `d/D`. | Eyes slot, wearable-tool tags, side-effect warning, cursed removal, replacement transaction. |
| General tools | **Apply/Use**, target-specific apply actions, **Engrave with**, **Wear/Remove** if wearable, **Dip**, **Drop**, **Inspect**. Tool-specific controls show charges/fuel. | `a`, `E`, `P/R`, `#dip`, `d/D`. | Tool subtype/capability tags, charges/fuel, target prompts, semantic apply results, typed text/direction prompts. |
| Containers | **Open/Loot** as nested inventory, **Put items in**, **Take items out**, **Lock/Unlock**, **Untrap**, **Force**, **Drop**, with bag-of-holding/shop/weight warnings. | `#loot`, `a`, `#force`, `#untrap`, `d/D`. | Container state, contents summaries with stable IDs, locked/trapped/known flags, nested inventory protocol, item transfer quantities, shop ownership, transaction safety. |
| Keys/lock tools | **Unlock/Lock north door/chest** target chips, **Apply to target**, **Drop**, **Name**, **Inspect**. | `a` with direction/target. | Adjacent lockable targets, target IDs/directions, lock state, failure/result events. |
| Digging tools | **Dig wall/floor/grave**, **Wield**, **Engrave**, **Force**, **Drop**, with shop/property warnings. | `a`, `w`, `E`, `#force`, `d/D`. | Feature/terrain targets, damage warnings, shop ownership, target picker. |
| Instruments | **Play/Apply**, target/effect prompt if needed, **Drop**, **Inspect**, with wake/drawbridge warnings. | `a`, `d/D`. | Instrument subtype, charges/tuning where known, environmental effects, danger confirmations. |
| Food, rations, tins | **Eat**, **Open tin with opener** when available, **Offer** on altar, **Drop/Split**, **Inspect**. Unsafe/stale warnings are explicit. | `e`, `a` tin opener flows, `#offer`, `d/D`. | Edibility, nutrition/safety as player-known, tin opener affordance, altar context, conduct/cannibal/tainted/poison risks. |
| Corpses, eggs, globs | **Eat**, **Offer/Sacrifice**, **Tin corpse** if tool exists, **Drop**, with safety and conduct warnings. | `e`, `#offer`, `a` tinning kit, `d/D`. | Monster type, age/freshness if known, poison/acid/slime/cannibal/vegetarian flags, altar state, secondary tool picker. |
| Potions | **Quaff**, **Throw**, **Dip item into potion**, **Dip potion into fountain/water**, **Drop/Split**, **Name/Label**, with unknown/harmful warnings. | `q`, `t`, `#dip`, `d/D`, `#name`. | Potion identity/BUC, item-to-item dip prompt, terrain dip target, stack quantity, dangerous confirmation. |
| Scrolls | **Read**, **Name/Label**, **Drop/Split**, target/item picker for scrolls that need one, with blindness/confusion warnings. | `r`, `d/D`, `#name`. | Scroll identity/known danger, hero literacy/blind/confused state, typed item/text prompts. |
| Spellbooks | **Study/Learn**, **Cast learned spell** when mapped, **Drop**, **Inspect**, with level/failure warnings. | `r`, `Z`, `d/D`. | Spellbook-to-spell mapping, learned spell IDs, failure/risk metadata, role/skill/casting state. |
| Wands | **Zap at target**, **Engrave with**, **Drop/Split**, **Name/Label**, charge/empty display and last-charge warning. | `z`, `E`, `d/D`, `#name`. | Charges/known empty, target picker, engrave text prompt, wrest warning. |
| Gems, stones, rocks, luck/load/touchstones | **Throw**, **Wield**, **Apply/Rub touchstone**, **Drop/Split**, **Name/Label**, **Inspect**, with loadstone/value warnings. | `t`, `w`, `a`, `d/D`, `#name`. | Subtype/value/identity, cursed loadstone status, throwable/wieldable flags, quantity. |
| Coins/gold | **Pay bill**, **Drop amount**, **Inspect wealth**, shop-specific price/bill actions. | `#pay`, `d/D`. | Amount picker, shop bill state, ownership, current wealth, transaction result. |
| Statues, boulders, heavy rocks | **Drop**, **Loot statue** if it contains objects, **Break/Force** with warning, **Inspect**. | `d/D`, `#loot`, tool actions. | Heavy/carry metadata, container-like flag, terrain consequences, warnings. |
| Iron ball and chain | Special card shows punished attachment state, limited **Inspect** and any legal remove/drop actions only when core says valid. | Special punishment/drop semantics. | Punishment/attachment state, disabled reasons; never present normal drop/remove as safe if blocked. |
| Special artifacts/invocation objects | **Invoke/Apply/Read/Wear/Wield** as appropriate, **Drop** with warnings, **Inspect**. | `#invoke`, `a`, `r`, `P/W/w`, `d/D`. | Artifact/special flags, role/alignment/quest context, branch progress, danger confirmations. |

## Cross-cutting context dependencies

Menus are accurate only when fed structured facts about equipped state, slot conflicts, BUC/curse/stuck knowledge, stack quantity, item identity, charges/fuel, container state, shop ownership, current terrain, adjacent targets, hero state, known safety risks, and pending prompts. The GUI should show useful disabled entries with reasons for common intent, but should not clutter every item with every impossible verb.

## Required core/shim/protocol work for the best design

### Authoritative item and slot model

- Stable `itemId` for object/stack identity across refreshes; selector letter is routing metadata only.
- `objectClass`, `otyp`, subtype tags, semantic capabilities, count, weight, display name, tile/glyph.
- Knowledge: identity, appearance, known BUC, enchantment, erosion, charges, fuel, greased, trapped/locked, corpse age/safety where player-known.
- Equipment: exact slots (`mainHand`, `offhand`, `alternateWeapon`, `quiver`, armor layers, `leftRing`, `rightRing`, `amulet`, `eyes`) and conflicts.
- Context: terrain/features, shop state, altar/fountain/sink/water/lava, adjacent targets/doors/containers/traps/monsters.

### Semantic action affordances

The renderer should receive menu entries from the core/shim or a validating shim layer, not infer final safety from text. Proposed shape:

```ts
type InventoryActionAffordance = {
  id: string;
  itemId: string;
  label: string;
  section: "primary" | "combat" | "location" | "management" | "danger";
  enabled: boolean;
  disabledReason?: string;
  dangerLevel?: "safe" | "caution" | "danger";
  confirm?: { required: boolean; message?: string; reason?: string };
  params?: { slotId?: string; targetId?: string; quantity?: QuantitySpec; hand?: "left" | "right" };
  promptPlan?: Array<"quantity" | "target" | "hand" | "item" | "text" | "confirm">;
  execution: { route: "coreAction" | "transaction" | "compatKeySequence"; action: string; keys?: string };
  consumesTurn: "yes" | "no" | "maybe";
  source: "core" | "shim" | "compat";
};
```

### Typed prompts and transactions

- Typed prompts: item selector, quantity, direction/target, hand/slot, yes/no, danger confirmation, free text, container contents, shop payment.
- Prompt options must carry semantic values, not just letters.
- Multi-step operations need transactions: `equipSlot`, `replaceSlot`, `clearSlot`, `removeThenDrop`, `setQuiver`, `splitStack`, `throwAtTarget`, `dipItemIntoItemOrFeature`, `lootContainer`.
- Transactions emit progress/result events and abort on unresolved or failed steps. The renderer must never blindly continue after a curse/stuck/failure prompt.

## Migration note: current selector routing is secondary

Current selector-key routing remains useful as a compatibility/migration layer, not as the product design. It can power early slices only when the UI still presents the ideal GUI shape and when command chains are not guessed.

Acceptable temporary routes include single actions such as `w<selector>`, `Q<selector>`, `W<selector>`, `T<selector>`, `P<selector>`, `R<selector>`, `e/q/r/z/a/t/d` and prompt-starting commands. Temporary compatibility must not expose raw `Inventory selector j`-style labels as final UX, must not auto-answer hand/direction/quantity prompts without typed prompt support, and must not send blind remove-then-wear/drop chains.

## Recommended implementation architecture and phases

### Architecture recommendation

Build an **Inventory Action Service** shared by inventory rows, item cards, equipment slots, ground piles, and contextual action bars:

1. Renderer requests action affordances for item/context/target.
2. Core/shim returns semantic affordances and prompt plans.
3. Renderer displays item cards, menus, drag targets, quantity controls, target pickers, and confirmations.
4. Execution goes through `coreAction` or `transaction`; `compatKeySequence` is isolated behind the service for migration only.
5. Results update inventory/equipment state and show GUI feedback.

### Phase 1 — GUI-first action service with best-shape menus

Chosen because it moves toward the ideal architecture, not because it is the smallest patch.

- Add the shared action-affordance data shape in the renderer/shim boundary, with compat-backed entries where necessary.
- Implement right-click/keyboard item cards for representative categories using semantic action IDs and modern labels.
- Implement darts/ammo menu actions **Wield in main hand**, **Ready in quiver**, **Throw**, **Drop/Split** and ensure drag to main hand routes as wield intent, not rejection.
- Wrap any resulting NetHack selector/quantity/confirm prompt in modern UI or mark it as a blocker if it cannot be modernized.

### Phase 2 — typed prompts and stable identity

- Add stable item IDs, typed prompt events, semantic options, quantity picker support, hand choice, target picker, and result events.
- Replace raw item selector menus with item-card pickers.

### Phase 3 — transaction-backed equipment and inventory management

- Implement occupied-slot replacement, remove-then-drop, explicit left/right ring replacement, container nested inventory, dip item-to-item/feature, and target-specific actions.

### Phase 4 — full modern NetHack inventory

- Drag/drop to equipment, ground, containers, map features, monsters, and shops all route through semantic actions and transactions.
- Classic command letters are optional hints only; all normal gameplay is manageable through GUI menus, cards, and drag/drop.

## Real Electron/MCP validation strategy

When implementation begins, project rules require real Electron gameplay validation. Screenshots must prove visible item names, action labels, quantity/target/hand widgets, confirmations, and result feedback. Any raw fallback letter menu in the final-path screenshot is a blocker.

Sample scenarios: starter weapon/armor/food; darts/ammo right-click and drag to main hand/quiver; ring left/right; occupied armor replacement; potion/scroll/wand target prompts; container loot; altar/fountain/shop context; unsafe corpse/cursed/welded blockers; stack quantity controls.
