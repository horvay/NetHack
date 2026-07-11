# Direct API foundation and evidence contract

This document records the shared conventions for NetHack Electron direct APIs. It is intentionally thin: each gameplay slice still owns its route-specific bridge/C implementation and real Electron proof.

## Command registry

- Current v2 commands stay documented in `UiProtocolV2.directCommandRegistry.current`: `action.execute`, `command.cancel`, `prompt.answer`, `menu.select`, `ground.transfer`, `equipment.change`, `terrain.action`, `container.transfer`, `container.snapshot`, and `replay.control`.
- Proposed direct command types are registered separately in `UiProtocolV2.directCommandRegistry.proposed`: `container.force`, `container.tip`, `container.untrap`, `container.unlock`, `item.use`, `altar.action`, and `target.answer`.
- Registering a proposed command type only makes the envelope/schema testable. It does **not** mean the route is implemented. `game-process` must reject registered-but-unimplemented direct commands with `blocked.input.unsupportedRoute` and no generic `ui-command` fallback. When a slice is implemented and proven, move that command type from `proposed` to `current` while keeping its direct validation spec.

## Event registry and lifecycle events

`UiProtocolV2.eventTypes` is the public event registry. Direct command lifecycle evidence uses `command.accepted`, `command.rejected`, and `command.completed`; domain events such as `ground.transfer.confirmed` should be added only when a slice owns a real domain transaction model. A queued direct command may be represented as `command.accepted` with status `queued` until a richer queue event is intentionally designed.

## Statuses and public rejection reasons

Public lifecycle statuses are: `accepted`, `queued`, `completed`, `success`, `failure`, `cancelled`, and `rejected`.

Use stable blocker tokens from `UiProtocolV2.commandBlockerTokens`, especially:

- `blocked.input.promptActive`
- `blocked.input.menuActive`
- `blocked.input.transferActive`
- `blocked.input.staleRevision`
- `blocked.input.unsupportedRoute`
- `blocked.input.malformedTarget`
- `blocked.input.missingPromptPolicy`
- `blocked.input.malformedCommand`
- `blocked.public.tryInNetHack`

Prefer these before adding new public tokens.

## Revision semantics

`expectedRevision` is a stale public snapshot guard, not a secret capability. If a command supplies a stale revision, reject before core mutation. If a slice allows missing revisions for a low-risk command, document that exception in its task tests.

## Command-gateway validation helpers

`electron-poc/src/shared/command-gateway.js` exposes foundation helpers for future slices:

- `validateDirectCommandEnvelope`
- `validatePublicObjectId`
- `validatePublicCoord`
- `validateCount`
- `validateEnumField`
- `validateExpectedRevisionShape`
- `validateUnknownPayloadFields`
- `directCommandValidationSpec`

Direct payloads must fail closed on unknown fields, malformed object IDs/coords/counts/enums, stale revisions, and active prompt/menu/transfer ownership.

## Shim JSON wrapper validation pattern

Use the existing `handle_container_transfer_line()` / `handle_container_snapshot_line()` shape as the bridge pattern:

1. Require the wrapper line to be one JSON object.
2. Require a nested `command` object.
3. Reject spoofed top-level fields such as `protocol`, `commandType`, `commandId`, and payload target IDs.
4. Reject duplicate critical fields.
5. Extract `protocol`, `commandType`, `commandId`, `transactionId`, `expectedRevision`, and payload fields with bounded buffers.
6. Validate enum values, public object IDs, public coordinates, and required confirmation fields.
7. Reject prompt/menu/transfer ownership and pending key queues.
8. Emit accepted/rejected bridge diagnostics with public-safe reasons only.

## C request/result pattern

Each direct domain should add a narrow request/result pair, for example `shim_<domain>_<verb>_request` and `shim_<domain>_<verb>_result`:

- Request state stores only public object IDs, coordinates, count/action/confirmation fields, and transaction metadata.
- Result state stores public `success/status/reason` and the snapshot surfaces that changed.
- Keep one active direct request per domain unless a real queue is designed.
- Queue a NetHack internal command such as `doshim<domain><verb>`; do not mutate object chains from the bridge.
- Re-find public object IDs in the expected public chain/location inside C before acting.

## Prompt/menu ownership and no hidden classic menu driving

Direct commands must reject when a non-command prompt, menu, text window, transfer, or pending key queue owns input. The exception is a future request-scoped answer (`prompt.answer` / `target.answer`) tied to the exact active request ID.

Do not answer invisible classic menus, extended-command prompts, selectors, ring-hand prompts, direction prompts, or `ynq` confirmations. Require explicit public fields, surface a visible request-scoped follow-up, or reject.

Forbidden public fields include `locked`, `trapped`, `broken`, `contents`, `buc`, `cursed`, `blessed`, `charges`, `otyp`, `spe`, monster internals, and object-chain pointers unless already made public by normal NetHack knowledge and explicitly modeled.

## Snapshot and renderer reconcile rules

After every accepted direct command that can change visible state, emit authoritative snapshots for affected surfaces (`inventory`, `equipment`, `ground`, `container`, `map`, `status`). Renderer optimistic state is provisional; it must reconcile to snapshots and show public rejection messages without falling back to hidden classic choreography.

## Evidence contract

Use `electron-poc/src/shared/direct-api-evidence-scan.js` on a clean task-owned output directory. Scans should be field-scoped where possible: event `name`, routed `command`, prompt/menu `text`, visible DOM text, bridge stdout/stderr, or JSON `payload` fields. Do not scan raw glyphs such as `>` or `<` without command-field context.

Task slices should use the reusable evidence harness in [`docs/direct-api-evidence-harness.md`](./direct-api-evidence-harness.md): evidence manifest, field-scoped forbidden-token scan, public-boundary scan, screenshot inspection notes, and optional HTML contact sheet. The harness exports task-specific rule presets for `ground.transfer`, `equipment.change`, `container.force`, `item.use`, `terrain.action`, and `altar.action`, plus a scenario catalog for existing safe fixture IDs.

Every migrated player-facing route still needs real Electron/MCP screenshots per `TESTING.md`; Task 0 itself does not require a screenshot because it does not migrate a player workflow.

## Task 2 equipment.change accepted first slice

The accepted `equipment.change` first slice is public-ID based and intentionally narrower than legacy selector routes:

- Item-targeted actions (`takeOff`, `removeAccessory`, `wieldMain`, `quiver`, and `putOnRing`) require a positive public `payload.itemId`; `clearQuiver` is the only accepted action that may omit `itemId` because the public slot target is the quiver itself.
- `putOnRing` requires both explicit public `payload.hand` (`left` or `right`) and matching `payload.slotId` (`ring.left` or `ring.right`). It must not answer a hidden ring-hand prompt.
- `wieldMain`, `quiver`, and `clearQuiver` reject incompatible supplied `slotId` values before native lowering. Non-ring actions reject inapplicable `hand` fields.
- JS command-gateway validation and the shim bridge boundary should enforce the same malformed-target rules so direct bridge wrappers cannot bypass renderer/main validation.

## Task 5 terrain.action accepted first slice

The accepted terrain.action first slice is intentionally narrow until each route has real scenario-backed proof:

- Enabled/proven: `stairsDown` on `stairs.down`, `stairsUp` on `stairs.up`, `ladderUp` on `ladder.up`, `drink` on `fountain`, and `dip` on `fountain` with public `itemId`.
- Deferred/rejected: `ladderDown`, `drink` on `sink`, and `dip` on `sink`.

The renderer should not advertise deferred terrain.action buttons. The shared JS command gateway and shim boundary reject deferred payloads without generic key fallback or hidden classic prompt/menu driving. Later slices must add real Electron/MCP screenshots, state sidecars, events, and direct-API harness scans before re-enabling those routes.
