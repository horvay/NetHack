# UI protocol v2, serialized slot 1: public item presentation

**Owner:** UXM-05  
**Plan:** NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11  
**Change type:** additive; legacy v1 shim events remain accepted

## Public item fields

The existing public item envelope may additionally contain:

- `publicClass`: one of `weapon`, `armor`, `food`, `potion`, `scroll`, `spellbook`, `wand`, `ring`, `amulet`, `tool`, `gem`, `coin`, or `other`.
- `filterGroups`: unique public groups from `equipped`, `weapons`, `armor`, `consumables`, and `magic`. Non-equipped groups require `publicClass` and must match its allowlist. An explicitly empty list stays empty.
- `equipmentSlots`: unique public slot IDs from the existing equipment schema.
- `knownFields`: only `beatitude`, `charges`, `enchantment`, `weight`, `erosion`, `corrosion`, and `poisoned`. Class-specific values fail closed when incompatible with `publicClass`.
- `ownership`: `{ state, price?, currency? }`, where state is `owned`, `unpaid`, or `for-sale` and price is non-negative.
- `calledName`: the public player-assigned type name, when present with `known.naming: true`.
- `individualName`: the public player-assigned individual/artifact name, when present with `known.naming: true`.
- `known.naming`: narrowly authorizes the exact player-assigned `calledName`/`individualName` strings. It does not authorize generic `displayName`, `text`, `name`, identity, or appearance fields.

These fields are valid on public inventory, equipment, ground, and container item records. Protocol validation and compatibility lowering recursively allowlist the nested keys and token values; snapshot reducers re-normalize items and slots rather than spreading source objects. Reducers clone arrays and nested objects so replay/runtime consumers cannot mutate source evidence.

## Truth and no-spoiler boundary

- `semanticName` remains forbidden unless `semanticKnown` or `known.identity` is true.
- When identity is explicitly unknown, generic `displayName`, legacy `text`, or generic `name` is usable only when `known.appearance === true` explicitly authorizes it as observed public appearance. Without that authorization, lowering prefers explicit `appearanceName`/`semanticAppearance`; with neither, it emits the neutral `item` label. `known.appearance:false` redacts even contradictory appearance fields.
- `known.naming` is necessary because player-assigned names are independently public even while object identity remains unknown. Identity or appearance knowledge is not reused as naming authorization: absent/false naming knowledge drops naming fields, and contradictory identity/appearance records or names that repeat/wrap an unauthorized generic identity fail closed. An exact authoritative `called X` / `named X` display suffix interoperates only when the same exact `calledName` / `individualName` is independently emitted; arbitrary suffix text grants nothing. This keeps slot 1 minimal instead of widening identity, appearance, known facts, actions, or any other domain.
- Identity, object type IDs, hidden effects, private shop identity/path, predicted damage/AC, recommendations, and remaining hidden charges are never added.
- Unknown appearance pairs in `item-no-spoiler-cases.json` must remain indistinguishable for every field named by `publicEqual`.
- Classification comes from the native public object class, never renderer text parsing.
- Known fields come only from NetHack knowledge flags or already-public state. Missing values are omitted.
- Equipment applicability describes public slot shape only and does not claim that an action is legal; core blockers and commands remain authoritative.
- The gray-stone redaction path emits no identity-derived filter or known-field enrichment.

## Native and compatibility lowering

`nh-shim-bridge.c` emits the additive fields alongside existing item records. `shim-protocol.js` preserves only the recursively allowlisted public shape for legacy `shim_update_inventory`, ground, and container events. `ui-protocol-v2.js` validates the normalized envelope. Inventory/equipment snapshot adapters re-normalize the additive item and slot shape, including stored source/event evidence, so injected private nested fields are removed rather than merely ignored by rendering. Existing v1 events without additive fields remain valid, but unknown-identity generic text is never treated as appearance authorization: semantic appearance is preferred and otherwise the neutral label is used. Lowering never restores an unknown `semanticName`. Authoritative inventory, equipment, ground, and container collections are atomic: one malformed item/slot rejects the collection and preserves prior accepted state rather than installing a filtered partial snapshot.

The browser presentation model stores no raw source record. Dispatch retains only `stableId`, public `objectId`, selector/inventory letter, public location kind, action ID/label/state, and allowlisted execution route/action/keys. Search, comparison, context menus, diagnostics, snapshots, icon resolution, and callbacks consume that public projection.

## Fixtures and proof

- `valid-events.json`: inventory/equipment examples with additive fields.
- `invalid-events.json`: bad classes, filters, slots, known fields, ownership, ranges, and class-incompatible facts.
- `replay-recording.json`: replay preservation without identity enrichment.
- `item-no-spoiler-cases.json`: hidden-identity indistinguishability matrix.
- `scripts/ui-protocol-v2-golden-test.js`: valid/invalid, legacy lowering, replay, and no-spoiler checks.
- `scripts/bridge-public-action-affordances-test.js`: native emission and gray-stone boundary proof.

Protocol slot 1 does not add a command, turn, target, spell/skill, result, or final-run event and does not authorize renderer inference.
