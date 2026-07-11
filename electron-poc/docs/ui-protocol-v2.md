# NetHack Electron UI protocol v2

`nethack-electron-ui/v2` is the additive semantic protocol for the Electron UI architecture roadmap. Slice 1 defines the contract, validators, replay preservation, and compatibility markers only. It does **not** switch visible inventory, equipment, container, ground-transfer, prompt, or map behavior away from the existing v1 path.

## Goals

- Give core/shim, main IPC, replay tooling, shared state, and renderer a typed protocol envelope before later gameplay slices depend on it.
- Fail closed for malformed v2 events and commands in tests.
- Preserve current v1 shim event behavior until each vertical has its own protocol, reducer, and real-game evidence.
- Record v2 events/commands as evidence without forcing domain behavior changes.
- Preserve the no-spoiler boundary: v2 exposes only facts the player could know.

## Envelope

Every v2 event uses this envelope:

```json
{
  "protocol": "nethack-electron-ui/v2",
  "sequence": 1284,
  "eventId": "evt-inv-1284",
  "eventType": "inventory.snapshot",
  "turn": 413,
  "source": { "layer": "shim-bridge", "window": 12 },
  "requestId": "req-inventory-3",
  "transactionId": "txn-wear-ring-1",
  "revision": { "inventory": 19, "map": 88 },
  "payload": {}
}
```

Required fields:

- `protocol`: exactly `nethack-electron-ui/v2`.
- `sequence`: non-negative safe integer. Event sequences must be monotonic within an event stream.
- `eventId`: stable non-empty string for diagnostics/replay.
- `eventType`: known semantic event name.
- `turn`: non-negative NetHack turn or best available public turn counter.
- `payload`: object validated per event type.

Optional fields:

- `source`: public producer context, such as `{ "layer": "core" }`, `{ "layer": "shim-bridge", "window": 7 }`, `{ "layer": "renderer" }`, or `{ "layer": "replay" }`.
- `requestId`: source request/menu prompt identity.
- `transactionId`: command/session ownership identity.
- `revision`: map of domain slice revisions, for example `{ "inventory": 4, "equipment": 2 }`.

## Commands

Renderer-to-game commands use the same protocol string but a command envelope:

```json
{
  "protocol": "nethack-electron-ui/v2",
  "commandId": "cmd-wear-ring-1",
  "commandType": "action.execute",
  "transactionId": "txn-wear-ring-1",
  "actionId": "item.equip.wear",
  "expectedRevision": { "inventory": 19, "equipment": 12 },
  "targets": { "objectId": 3481, "slotId": "ring.left" },
  "payload": { "promptPolicy": "allow-public-followup" }
}
```

Slice 1 validators recognize these command types: `action.execute`, `command.cancel`, `prompt.answer`, `menu.select`, `ground.transfer`, `container.transfer`, and `replay.control`. Later slices define execution semantics. Until then, commands may be recorded and validated, but the default game behavior remains v1/key driven.

## Revisions and transactions

- Revisions are public, non-negative integers for domain slices such as `inventory`, `equipment`, `ground`, `container`, `prompt`, or `map`.
- Commands include `expectedRevision` when stale state would be dangerous or confusing.
- Ground-container command validation requires current public ground target evidence. A stale ground revision may be tolerated only when the current public cursor pile or current visible map object layer still matches the command target; stale historical messages or other-coordinate piles are not enough.
- Visible NetHack messages may add public ground evidence after gameplay reveals a fact, for example “the chest turns out to be locked” may enable `ground.forceContainer` for the current visible container without exposing hidden lock state earlier.
- `transactionId` groups a user action with follow-up prompts, acknowledgements, snapshots/deltas, completion, or interruption.
- A later command gateway must reject stale or mismatched transactions rather than silently falling back to raw keys.

## No-spoiler policy

The v2 protocol is authoritative but not omniscient. It must not reveal hidden facts before NetHack reveals them to the player.

Allowed:

- Public display names and appearances.
- Known flags such as `{ "identity": true, "appearance": true, "quantity": true }`. Beatitude/BUC, enchantment, charges, and contents stay omitted until a later explicit public-known schema is added with tests.
- Public action availability and public disabled reasons.
- Public map layer semantics that are already visible.

Forbidden:

- Hidden object identity, curse/beatitude, enchantment, charges, trap state, container contents, monster details, or action consequences that NetHack has not revealed.
- Disabled reasons that leak hidden causes, e.g. “cursed” before the curse is known.
- Container contents before the legal `#loot`/open path reaches them.

When a fact is not public, omit it, use an appearance field, mark a `known` flag false, or say only that the result is unknown until tried.

## Event families in Slice 1

Slice 1 registers event names broadly enough for later verticals, while only validating/preserving them:

- Diagnostics: `diagnostic.v1Compatibility`.
- Menus: `menu.opened`, `menu.item`, `menu.ready`, `menu.selecting`, `menu.closed`.
- Prompts: `prompt.opened`, `prompt.answered`, `prompt.closed`.
- Inventory/equipment: `inventory.snapshot`, `inventory.delta`, `equipment.snapshot`, `equipment.delta`.
- Actions and acknowledgements: `action.affordances`, `command.accepted`, `command.rejected`, `command.completed`, `transaction.completed`, `transaction.interrupted`.
- Ground/container transfer: `ground.pile.snapshot`, `ground.transfer.confirmed`, `ground.transfer.rejected`, `container.session.opened`, `container.session.closed`, `container.contents.snapshot`, `container.candidates.snapshot`, `container.transfer.confirmed`, `container.transfer.rejected`.
- Map identity: `map.cell.updated`.
- Replay markers: `replay.marker`.

## v1 compatibility policy

Current v1 shim events (`nethack-electron-shim-events/v1`) remain supported. v2 failures do not mutate UI state and do not trigger guessed rich UI. During migration, v1-based rich or fallback paths should emit or record a non-spamming diagnostic marker when useful:

```json
{
  "protocol": "nethack-electron-ui/v2",
  "sequence": 17,
  "eventId": "evt-v1-compat-17",
  "eventType": "diagnostic.v1Compatibility",
  "turn": 0,
  "source": { "layer": "renderer" },
  "payload": {
    "legacyEventName": "shim_end_menu",
    "legacyPath": "renderer.isInventoryOverviewMenu",
    "reason": "Inventory overview still uses classic menu classification until inventory.snapshot is authoritative.",
    "fallback": "classic-menu-safe-fallback"
  }
}
```

These markers are for tests, recordings, and developer evidence. They must not spam normal gameplay UI.

## Slice 2 v1 menu/prompt compatibility adapter

Slice 2 adds an additive comparison path for classic menu and prompt metadata. It does not route player-facing UI from v2 by default.

Safe public v1 metadata fields may now be preserved when present on classic events:

- Menus: `menuPurpose`, `menuRequestId`/`requestId`, `transactionId`, `requestSource`, `owner`, `selectionMode`, and lifecycle facts (`opened`, `ready`, `selecting`, `closed`).
- Prompts: `promptPurpose`, `promptType`, `promptId`/`requestId`, `transactionId`, `requestSource`, `owner`, and lifecycle facts.

When v1 events do not provide those fields, `menu-metadata-adapter.js` derives best-effort public metadata from the same visible menu/prompt facts the renderer already sees. Its purpose is diagnostics and golden comparison: tests can compare `oldHeuristicPurpose` with structured `menuPurpose`, emit valid inert `menu.*`/`prompt.opened` envelopes, and store metadata on `game-view-state` snapshots. Normal gameplay UI should continue using the existing renderer heuristics until a later vertical proves the replacement route with real gameplay evidence.

Covered compatibility purposes include `inventory.overview`, `ground.pickup`, `ground.look`, `container.action`, `container.takeOut`, `container.putIn`, `container.category`, `action.choice`, `system.startup`, `system.help`, `system.status`, and `menu.generic`. Unknown or absent metadata must fall back to v1 classic behavior.

## Slice 3 inventory snapshots and public item schema

Slice 3 adds authoritative, revisioned inventory snapshot state without replacing player-facing inventory/equipment/container routing by default.

`shim_update_inventory` v1 events now preserve a conservative monotonic `revision`/`inventoryRevision` from the shim bridge. The JS adapter emits/validates inert v2 `inventory.snapshot` envelopes for diagnostics and future routing:

```json
{
  "protocol": "nethack-electron-ui/v2",
  "sequence": 7,
  "eventId": "evt-inventory-snapshot-7",
  "eventType": "inventory.snapshot",
  "turn": 0,
  "source": { "layer": "shim-bridge" },
  "revision": { "inventory": 7 },
  "payload": {
    "revision": 7,
    "items": [
      {
        "objectId": 1003,
        "inventoryLetter": "c",
        "displayName": "a milky potion",
        "appearanceName": "milky potion",
        "quantity": 1,
        "known": { "identity": false, "appearance": true, "quantity": true },
        "location": { "kind": "inventory" },
        "semanticKind": "object",
        "semanticAppearance": "milky potion",
        "semanticKnown": false
      }
    ]
  }
}
```

Public inventory item fields are closed/fail-closed: `objectId`, `inventoryLetter`, `displayName`, `appearanceName`, `quantity`, `objectClass`, public known flags, `wornMask`, glyph presentation fields, public semantic appearance fields, `location.kind`, and string action hints. Hidden identity (`trueName`, `baseType`, `objectType`, `otyp`), beatitude/BUC, enchantment, charges, trap state, and container `contents` are rejected. `semanticName` is allowed only when identity is already public/known; otherwise use `displayName`, `appearanceName`, or `semanticAppearance`.

Shared state now has `state.inventory.revision`, `orderedItems`, `itemsByObjectId`, `itemsByLetter`, `lastSnapshotSource`, and a preserved `lastSnapshotEvent`. Existing `cachedInventoryChoices` and classic menu paths remain populated for inventory action prompts, ground transfer, and container transfer. Renderer diagnostics expose the snapshot revision and public item rows. The visible inventory overview now defaults to `useSnapshotForOverview: true` only when the live NetHack inventory menu's selector set matches the current public snapshot; otherwise it falls back to the classic menu rows. This keeps prompt/menu lifecycle ownership unchanged while moving the ready overview rows to the no-spoiler revisioned snapshot source.

## Slice 4: equipment snapshot and gated paper-doll consumption

Slice 4 adds revisioned equipment state for future paper-doll routing while preserving the existing visible equipment/inventory/container UI by default.

The bridge now preserves an `equipmentRevision` beside each live `shim_update_inventory` revision. The equipment snapshot adapter derives public slot facts from the same public inventory item schema and NetHack `wornMask` facts; it does not parse item text as slot authority on the v2 path.

Canonical public slot ids are closed/fail-closed: `mainHand`, `offHand`, `quiver`, `armor.body`, `armor.cloak`, `armor.shirt`, `armor.helm`, `armor.gloves`, `armor.boots`, `armor.shield`, `amulet`, `ring.left`, `ring.right`, and `eyes`.

`equipment.snapshot` has this shape:

```json
{
  "eventType": "equipment.snapshot",
  "revision": { "equipment": 5, "inventory": 11 },
  "payload": {
    "revision": 5,
    "inventoryRevision": 11,
    "slots": [
      {
        "slotId": "mainHand",
        "label": "Weapon / main hand",
        "objectId": 2001,
        "wornMask": 256,
        "publicStatus": "equipped",
        "blockedBy": [],
        "actions": ["wield/change"],
        "item": { "objectId": 2001, "inventoryLetter": "a", "displayName": "a +0 spear", "location": { "kind": "equipment" } }
      }
    ]
  }
}
```

Envelope `revision.equipment` must match `payload.revision`; `revision.inventory` must match `payload.inventoryRevision` when both are present. Slot `blockedBy` and `actions` are public string tokens only. Hidden item identity, beatitude/curse state, enchantment, charges, trap state, and object-valued action/blocker payloads are rejected by the same no-spoiler schema used for inventory snapshots.

Shared state now has `state.equipment.revision`, `inventoryRevision`, `orderedSlots`, `slotsById`, `objectToSlots`, `lastSnapshotSource`, and `lastSnapshotEvent`. The renderer defaults `useSnapshotForPaperDoll: true` for the visible paper doll when a valid equipment snapshot is present, mapping canonical slot ids to the existing card ids and preserving the compatibility fallback behind the feature flag. Unsupported shirt-only layering is folded into the existing armor card when no body armor is present; when body armor exists, the full canonical shirt slot remains in reducer state but is not added as an extra unpositioned card. Container and ground transfer paths remain on their existing cache/session code until their own snapshot/session work is ready.

`inventory.delta` is registered and validated as a future shape with required `revision`, optional public item arrays (`items`, `added`, `updated`), and `removed` as public object ids. Slice 3 stores full snapshots only.

## Slice 5: ground-pile snapshots consumed by current-square actions

Slice 5 makes revisioned public `ground.pile.snapshot` state a first-class renderer source for current-square ground actions. The shared reducer accepts snapshots from visible object-layer metadata, passive ground menus/messages, explicit v2 events, and now full authoritative C/shim `shim_ground_pile_snapshot` events produced from `level.objects` for visible `dknown` floor objects.

The C/shim event is still a v1 transport event, but it is normalized immediately into the same closed public ground-pile model as v2 `ground.pile.snapshot`: public display names/appearances, quantities, public object ids, glyph presentation fields, known flags, and action affordance tokens. When a `shim_print_glyph` advertises `groundPileSnapshotAuthoritative`, the shared reducer suppresses older single-object object-layer inference for that cell and waits for the following full pile event. This makes multi-object ground stacks end-to-end rather than inferred from the visible top object or pickup menu text.

This keeps no-spoiler behavior unchanged: only public display names, appearances, quantities, object ids when already public, and action affordance tokens are consumed. The context action bar and ground item models can show `Pick up`, `Eat food/corpse`, and container-on-ground actions from the accepted ground snapshot even when no classic ground menu is currently open. Empty or stale lower-revision snapshots still fail closed in the shared reducer and must not resurrect stale ground hints.

Container contents remain session-gated: `container.contents.snapshot` is still accepted only for an active public container session and is not inferred from ordinary map object layers.

## Replay records

The existing replay schema remains `nethack-electron-input-recording/v2`; it now preserves additional inert evidence records:

- `{ "type": "input", ... }` — replayable key input, unchanged.
- `{ "type": "checkpoint", "name": "..." }` — screenshot checkpoint, unchanged.
- `{ "type": "shim-event", "event": { ... } }` — preserved v1 raw/normalized shim event evidence.
- `{ "type": "ui-protocol-event", "event": { ... v2 event envelope ... } }` — preserved v2 event evidence.
- `{ "type": "ui-protocol-command", "command": { ... v2 command envelope ... } }` — preserved v2 command evidence.
- `{ "type": "ui-protocol-ack", "event": { ... v2 command/transaction event ... } }` — preserved acknowledgement evidence.
- `{ "type": "screenshot", "name": "...", "path": "..." }` and `{ "type": "state-sidecar", "name": "...", "path": "..." }` — artifact references.

Replay execution still uses only `input` events. Non-input records are preserved and normalized for evidence/review; they are not interpreted as gameplay instructions in Slice 1.

## Slice 7: limited `action.execute` validation/execution

The current execution slice is deliberately narrow. Renderer context actions build a v2 `action.execute` command before key dispatch. `command-gateway` validates the v2 envelope with `ui-protocol-v2`, checks route-specific revisions, rejects active prompt/menu ownership, and allowlists only these semantic routes:

- `q/r/e/d/W/T/R/w/Q/P/a/z/t/E/O/p/V` plus one public inventory selector for quaff/read/eat/drop/wear/take-off/remove/wield/quiver/put-on/apply/zap/throw/engrave/offer/pay/invoke routes already exposed by the shared action service.
- `P` plus selector and optional public ring hand (`l`/`r`) for the existing ring-slot auto-answer route; the hand answer must match public route metadata.
- `x` for main/alternate weapon swap when the equipment action service already exposed that slot action.
- `#loot\n` / `ground.openContainer`, `#tip\n` / `ground.tipContainer`, `#force\n` / `ground.forceContainer`, and `#untrap\n` / `ground.untrapContainer` for public current-ground container targets, with `promptPolicy: "netHack-owned-followup"` and no bundled follow-up answers. The untrap route is container-only here; it does not auto-answer direction prompts and does not add trap/door variants.
- `#dip\n` / `ground.dipIntoTerrain` for public current-square terrain/liquid labels such as `fountain`, `sink`, `water`, or `lava`, with `promptPolicy: "netHack-owned-followup"` and no bundled source-item, liquid-target, or outcome answer.
- `#rub\n` / `item.rub` for public inventory candidates accepted by native NetHack `#rub`, currently visible lamps/lanterns and public stone appearances, with an explicit inventory target and `promptPolicy: "netHack-owned-followup"`. This route opens NetHack's rub prompt only; it does not append the clicked row's selector, infer hidden lamp/stone identity, or answer any secondary target prompt.

Accepted v2 actions are validated and recorded in Electron, then sent through the native preload/main/bridge `uiCommand` envelope path as one bridge `{ "type": "ui-command", "command": ... }` JSON line. The preload channel is `nethack:uiCommand`; main returns a validation/write acknowledgement before the renderer records accepted execution evidence. Main also keeps its own shim-derived public state snapshot and re-runs `command-gateway` with non-renderer-trustable active prompt/menu/transfer ownership, inventory/equipment/ground revisions, and known inventory rows. When main knows a route's revision slice, `expectedRevision` is required and unsafe stale/mismatched revisions or active owners are rejected before anything is written to bridge stdin. Inventory selector actions may tolerate revision churn only when the current main-side public selector row still names the same target; changed/missing target rows fail closed. The bridge revalidates protocol, required `commandId`, action id, exact command bytes, target location, prompt policy, and no-spoiler public fields before lowering accepted commands to NetHack key bytes. Inventory-origin `item.dipInto` remains hidden until the UI can prove prompt ownership without implying that the clicked row was automatically selected. Unsupported broad routes such as `#name/#adjust` continue down the existing compat path or stay unavailable. Supported-but-invalid selector/ground/inventory semantic routes fail closed instead of falling back to raw keys, and accidental selector-shaped inventory/equipment actions not in the allowlist are blocked. Valid v2 action commands are recorded as `ui-protocol-command` evidence while replay remains driven by the captured key inputs.

Command acknowledgements are valid v2 event envelopes recorded as `ui-protocol-ack` evidence and mirrored into shared view state (`commandProtocolAcks`, `lastCommandProtocolAck`, `lastCommandProtocolRejection`). `command.accepted`, `command.rejected`, and `command.completed` payloads carry the public `commandId`, optional `transactionId`/`actionId`, `executionSource`, and an explicit `replayBehavior` string documenting that replay executes recorded input events only. Rejections must include one blocker token from the command blocker vocabulary: `blocked.input.promptActive`, `blocked.input.menuActive`, `blocked.input.transferActive`, `blocked.input.staleRevision`, `blocked.input.unsupportedRoute`, `blocked.input.malformedTarget`, `blocked.input.missingPromptPolicy`, `blocked.input.malformedCommand`, or `blocked.public.tryInNetHack`. These tokens are evidence/diagnostics for active owner, stale revision, unsupported route, malformed target/command bytes, and missing prompt-policy failures; they are not hidden gameplay facts.

## Examples

### Valid inventory snapshot

```json
{
  "protocol": "nethack-electron-ui/v2",
  "sequence": 1,
  "eventId": "evt-inventory-1",
  "eventType": "inventory.snapshot",
  "turn": 12,
  "source": { "layer": "shim-bridge" },
  "revision": { "inventory": 1 },
  "payload": {
    "revision": 1,
    "items": [
      {
        "objectId": 1001,
        "inventoryLetter": "a",
        "displayName": "a food ration",
        "quantity": 1,
        "known": { "identity": true },
        "location": { "kind": "inventory" }
      }
    ]
  }
}
```

### Valid menu command

```json
{
  "protocol": "nethack-electron-ui/v2",
  "commandId": "cmd-menu-select-1",
  "commandType": "menu.select",
  "transactionId": "txn-menu-1",
  "expectedRevision": { "prompt": 3 },
  "targets": { "menuId": "menu-7", "selectors": ["a"] },
  "payload": { "menuId": "menu-7", "selectors": ["a"] }
}
```

### Invalid v2 must fail closed

This event is invalid because it has the wrong protocol, no sequence, an unknown event type, and a payload that cannot be validated:

```json
{
  "protocol": "nethack-electron-ui/v1",
  "eventId": "evt-bad",
  "eventType": "inventory.omniscientSpoiler",
  "turn": 1,
  "payload": null
}
```

Validators return `ok: false`/`valid: false`; callers must not use malformed v2 payloads for domain behavior.

## Map field preservation

Slice 1 does not change map protocol behavior. Existing Rufus/Marmalade fields such as `backgroundGlyph`, `backgroundSemanticKind`, `backgroundSemanticName`, `backgroundActionAffordances`, `objectLayerGlyph`, `objectLayerChar`, `objectLayerSemanticKind`, `objectLayerSemanticName`, `objectLayerSemanticAppearance`, `objectLayerSemanticKnown`, and `objectLayerActionAffordances` remain v1 fields and must be preserved by any future v2 map integration.

## Scenario runbooks

Markdown scenario plans under `electron-poc/test/scenario-plans/` remain manual AI-agent runbooks. They are not automation backlogs merely because v2 replay and protocol fixtures exist.
