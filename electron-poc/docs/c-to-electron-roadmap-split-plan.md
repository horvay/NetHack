# NetHack C-to-Electron integration roadmap split plan

Status date: 2026-07-06  
Closure status: **C-to-Electron roadmap closure-ready after Workstream H final integration proof.** This document is now the closure checklist for the Electron proof-of-concept C/shim/main/preload/shared/renderer integration roadmap.

## Scope and location

This plan lives at `electron-poc/docs/c-to-electron-roadmap-split-plan.md` because the remaining work is specifically the Electron proof-of-concept C/shim/main/preload/shared/renderer integration roadmap. It belongs beside `electron-poc/docs/ui-protocol-v2.md`, which is the canonical protocol contract for this migration, rather than under top-level `docs/` where general project notes live.

The goal is to finish the original C-to-Electron hookup: C/shim should provide only public, no-spoiler facts; Electron should consume them through v2 semantic state/command envelopes; renderer actions should be validated/fail-closed rather than relying on raw-key guesses; real Electron fixture/scenario evidence should prove the player-facing behavior.

## Current accepted baseline and closure checklist

Legend: `[x]` accepted/present in the current worktree, prior accepted evidence, or the final Workstream H closure proof. Historical `[~]` / `[ ]` items from the split plan have been reconciled below.

### Accepted or present baseline

- [x] v2 protocol envelope, event/command validation, replay preservation, and fail-closed validator posture are documented in `electron-poc/docs/ui-protocol-v2.md` and implemented in `electron-poc/src/shared/ui-protocol-v2.js`.
- [x] Inventory snapshot/public item schema route exists: C/shim inventory data is normalized into revisioned public snapshots; the visible inventory overview can use snapshots when selector sets match.
- [x] Inventory/drop selector fix is accepted: item actions route through public selector-shaped commands instead of leaking fallback labels such as `Inventory selector j`.
- [x] Equipment snapshot/paper-doll slice is present, including canonical slot ids and gated paper-doll consumption.
- [x] Ground snapshot behavior is accepted: current-square ground actions use revisioned public ground-pile state and fail closed on stale/empty snapshots.
- [x] Authoritative C ground-pile snapshots are present: `electron-poc/shim-bridge/nh-shim-bridge.c` emits `shim_ground_pile_snapshot` from `level.objects`; Electron normalizes it as `ground.pile.snapshot` evidence.
- [x] Public action affordance tokens are present for inventory/ground object rows from C/shim, with current v2 validation rejecting hidden lock/trap/broken tokens in public item payloads.
- [x] `action.execute` v2 validation is present for selected inventory/equipment actions in `electron-poc/src/shared/command-gateway.js`, including stale revision checks, active-owner blocking, and unsupported selector-shaped route blocking.
- [x] Accepted ground `#loot` route is present as `ground.openContainer`, requiring public ground target metadata and `promptPolicy: 'netHack-owned-followup'` before lowering to `#loot\n`.
- [x] Latest ground `#tip` and `#force` routes are present in the worktree as `ground.tipContainer` and `ground.forceContainer`, with real locked-container scenario evidence, bridge metadata tests, and the final locked-chest reveal lifecycle proof (`locked chest` visible message -> immediate `Force lock` affordance -> native `#force` accepted without step-off/step-on).
- [x] Container contents snapshots and transfer transaction evidence exist for opened container sessions; ordinary map/ground state does not infer hidden container contents.
- [x] Scenario fixture framework exists under `electron-poc/test/scenarios/` with safe-ID resolver, fixture-build/runtime gates, fail-closed negative tests, and real Electron scenario scripts.

### Closure checklist

- [x] Native v2 command envelope path from renderer/preload/main to shim/C is present for the limited allowlisted `action.execute` slice: renderer records/validates, preload/main send `uiCommand`, and bridge validates `{ "type":"ui-command", "command": ... }` before exact key lowering.
- [x] Safe semantic route for visible ground-container `#untrap` (`ground.untrapContainer` only; trap/door variants still not implemented), with explicit public ground target, NetHack-owned follow-up ownership, native bridge validation, exact `#untrap\n` key lowering, and real locked/trapped container MCP evidence.
- [x] Safe semantic terrain route for `#dip`: `ground.dipIntoTerrain` is present with native bridge validation for public current-terrain liquid labels, exact `#dip\n` lowering, NetHack-owned follow-up ownership, and stable final real MCP evidence. `item.dipInto` remains intentionally hidden/future and is not required for this closure.
- [x] Safe semantic inventory route for `#rub`: prompt-opening `item.rub` is present with native bridge validation for explicit public inventory candidates, exact `#rub\n` lowering, NetHack-owned follow-up ownership, no selector/target auto-answer, and stable final real MCP evidence. `item.rubOnStone` remains optional/future and is not required for this closure.
- [x] Richer public blocker reason tokens for visible equipment constraints are present for armor layering, occupied ring slots, two-handed/offhand/two-weapon conflicts, and quiver/main-hand blockers. These remain public reasons only and do not expose curse/welded/hidden state.
- [x] No-spoiler C/shim fixture coverage is present for unidentified objects, appearance-only ground piles, locked/trapped/broken container surfaces, destroyed-container stale-state cleanup, and public gray-stone rub candidates.
- [x] Prompt-policy metadata and ownership checks are present for all accepted new semantic routes, including active prompt/menu/transfer owner rejection and no bundled follow-up answers.
- [x] Replay/recording proof shows new v2 commands, rejections, and acknowledgements are preserved as evidence while replay remains driven by input events.
- [x] Cross-cutting docs/tests integration is present in `electron-poc/docs/ui-protocol-v2.md`, `electron-poc/src/shared/MODULE_MAP.md`, package scripts for accepted proof commands, and final Workstream H evidence.
- [x] Final integration pass ran targeted suites plus real Electron/MCP scenario evidence, inspected screenshots and state/log sidecars, inspected `logs/last-run.log`, documented the one non-product invocation error, and wrote the closure report at `electron-poc/test-output/final-c-to-electron-integration/summary.md`.

### Closure estimate

Counting coarse checklist items above: **22 accepted / 0 closure-blocking remaining** for the original C-to-Electron roadmap scope. Optional/future subroutes such as `item.dipInto`, `item.rubOnStone`, trap/door variants of `#untrap`, and broader replay-by-semantic-command execution remain out of scope and should be planned separately rather than treated as closure blockers.

### Baseline evidence table

Because the worktree is broad and not clean, Developers must treat this table as the handoff baseline rather than relying on git status alone. “Accepted by task context” means the Secretary/Boss prompt explicitly named the work as accepted; “present in worktree” means the current files expose the route/slice and must still be verified by the assigned Developer before editing nearby code.

| Baseline item | Status | Current evidence / command anchor | Future owner if regression found |
|---|---|---|---|
| v2 protocol envelope, validator, replay preservation | Present in worktree | `electron-poc/docs/ui-protocol-v2.md`; `electron-poc/src/shared/ui-protocol-v2.js`; `npm run test:ui-protocol-v2`; `npm run test:architecture` | A/G/H |
| Inventory snapshot/public item schema | Present in worktree | `electron-poc/src/shared/inventory-snapshot-adapter.js`; `npm run test:inventory-snapshot`; `npm run test:architecture` | B/H |
| Inventory/drop selector fix | Accepted by task context | `electron-poc/test-output/real-inventory-context-actions/real-inventory-context-actions-summary.md`; `npm run test:real-inventory-context-actions-mcp` | C/H if equipment/inventory actions regress |
| Equipment snapshot/paper doll | Present in worktree | `electron-poc/src/shared/equipment-snapshot-adapter.js`; `npm run test:equipment-snapshot`; `node scripts/real-scenario-shirt-takeoff-mcp-test.js` | C/H |
| Ground snapshot behavior | Accepted by task context | `electron-poc/src/shared/ground-pile-snapshot-adapter.js`; `electron-poc/test-output/real-scenario-ground-pickup/real-scenario-ground-pickup-summary.md` | B/H |
| Authoritative C ground-pile snapshots | Accepted by task context | `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-nu-skipping-river-56/employee-result.md`; `electron-poc/shim-bridge/nh-shim-bridge.c`; `node scripts/real-scenario-ground-pickup-mcp-test.js` | B/H |
| Public action affordance tokens | Accepted/present in worktree | `electron-poc/shim-bridge/nh-shim-bridge.c`; `npm run test:bridge-public-action-affordances`; `electron-poc/scripts/bridge-public-action-affordances-test.js` | B/C/H |
| v2 `action.execute` validation | Accepted by task context | `electron-poc/src/shared/command-gateway.js`; `electron-poc/scripts/command-gateway-action-execute-test.js`; `npm run test:command-gateway-action-execute` | A/G/H |
| Accepted ground `#loot` route | Accepted by task context | `ground.openContainer` in `command-gateway.js`; `electron-poc/test-output/real-scenario-empty-bag-context-open/summary.md`; `node scripts/real-scenario-empty-bag-context-open-mcp-test.js` | A/D/H |
| Latest ground `#tip` / `#force` routes | Present in worktree and final bugfix proof | `ground.tipContainer` / `ground.forceContainer` in `command-gateway.js`; `electron-poc/test-output/real-scenario-locked-container/real-scenario-locked-container-summary.md`; `electron-poc/test-output/real-scenario-locked-container-force-lifecycle/real-scenario-locked-container-force-lifecycle-summary.md`; `node scripts/real-scenario-locked-container-mcp-test.js`; `npm run test:real-scenario-locked-container-force-lifecycle-mcp` | A/D/H |
| Container contents snapshots / transfer evidence | Present in worktree | `electron-poc/src/shared/container-contents-snapshot-adapter.js`; `npm run test:container-transfer-panel`; `npm run test:real-container-variant-suite-mcp` | B/G/H |
| Scenario fixture framework | Present in worktree | `electron-poc/test/scenarios/`; `electron-poc/scripts/scenario-loader-contract-test.js`; `npm run test:scenario-loader` | B/H |

### Original weighted staffing plan (closed)

Weighted estimate for the original roadmap after final integration: **100 accepted points / 0 closure-blocking remaining points**. The original 42-point remaining set was consumed by accepted Workstreams A-G plus the H final integration proof. Optional/future extensions listed in this document are not part of the closure denominator.

| Workstream | Original remaining effort points | Closure disposition |
|---|---:|---|
| A — Native v2 command envelope foundation | 9 | Accepted; native renderer/preload/main/bridge envelope path proved. |
| B — C/shim no-spoiler fixture/public-boundary hardening | 6 | Accepted; public-boundary, destroyed-container, and gray-stone evidence proved. |
| C — Public equipment blocker reasons | 4 | Accepted; public blocker tokens and real equipment blocker evidence proved. |
| D — Safe v2 `#untrap` route | 4 | Accepted; container-only route proved with NetHack-owned follow-up. |
| E — Safe v2 `#dip` routes | 5 | Accepted for `ground.dipIntoTerrain`; inventory-origin `item.dipInto` remains future/hidden. |
| F — Safe v2 `#rub` routes | 5 | Accepted for `item.rub`; `item.rubOnStone` remains future/optional. |
| G — Replay, acknowledgements, transaction completion polish | 4 | Accepted; command/ack evidence preserved while replay remains input-driven. |
| H — Final integration and closure proof | 5 | Accepted by this closure run. |
| **Total closure-blocking remaining** | **0** | Original 42 points are now closed for the roadmap scope. |

The original hiring/parallelization plan is retained below as historical context in the per-workstream sections; future staffing should use a new plan for optional extensions rather than reopening this roadmap.

## Global conventions and ambiguity eliminators

All future Developers must use these conventions unless they update this document and `ui-protocol-v2.md` in the same branch.

### Semantic route naming

Use dotted domain/action names. Do not reuse renderer button ids as v2 action ids.

- Ground/container routes:
  - `ground.openContainer` -> `#loot\n` (already accepted)
  - `ground.tipContainer` -> `#tip\n` (present)
  - `ground.forceContainer` -> `#force\n` (present)
  - `ground.untrapContainer` -> `#untrap\n` for a visible/public floor container; NetHack owns target/direction prompt unless the route later validates a public direction.
- Terrain/ground routes:
  - `ground.dipIntoTerrain` -> `#dip\n` for public current-square liquid/terrain such as fountain, sink, pool/water/lava only if the UI label says the terrain and the prompt remains NetHack-owned.
  - `ground.untrapTrap` -> `#untrap\n` for a visible public trap; only after container untrap is accepted.
  - `ground.untrapDoor` -> `#untrap\n` for a visible adjacent door; only if public direction metadata exists.
- Inventory/item routes:
  - `item.dipInto` -> `#dip\n` for public inventory item source; NetHack owns follow-up target prompts.
  - `item.rub` -> `#rub\n` for public inventory candidate; NetHack owns follow-up prompts.
  - `item.rubOnStone` is allowed only if both rubbed item and target stone are public, visible, and validated; otherwise do not create it.

Forbidden route names: `dip`, `rub`, `untrap`, `force`, `loot`, or renderer-specific ids such as `untrap-container` as v2 `actionId`s.

### Per-route schema table

This table is the canonical route contract for remaining Developers. Current selector-based inventory/equipment routes are grouped because they share the same schema; new extended-command routes are listed individually. Roadmap closure means every route listed as existing or accepted below uses the native Workstream-A path, or the final integration report explicitly lists a temporary legacy exception.

| Route/actionId | Status | Exact command bytes | `targets` shape | Required `expectedRevision` keys | Required payload fields | Prompt policy | Validator/test coverage |
|---|---|---|---|---|---|---|---|
| Selector inventory actions: `item.quaff`, `item.read.scroll`, `item.study`, `item.read.inscription`, `item.eat`, `item.drop`, `item.apply`, `item.lootOrApply`, `item.zap`, `item.throw`, `item.engraveWith`, `item.offer`, `item.pay`, `item.invoke` | Existing | one command key plus one public selector, e.g. `qa`, `ra`, `da` | `{ "selector":"a", "inventoryLetter":"a", "objectId"?:123, "displayName"?:"public row", "location":{"kind":"inventory"} }` | `inventory` | `actionId`, `label`, `surface`, `route.command`, public `item`, optional `target` matching selector | `no-followup` unless the route intentionally opens a NetHack prompt, then `netHack-owned-followup` | `command-gateway-action-execute-test.js`, `inventory-action-service-test.js`, real inventory context MCP |
| Equipment-changing inventory actions: `item.wear`, `item.takeOff`, `item.remove.accessory`, `item.wield.mainHand`, `item.wield.hold`, `item.quiver`, `slot.clear.quiver`, `slot.clear.mainHand`, `item.putOn.ring`, `item.putOn.accessory`, `item.putOn.eyes` | Existing | command key plus selector; ring may include public `l`/`r` only with explicit hand metadata | same inventory target shape; optional `{ "slotId":"ring.left" }` or `{ "slotId":"mainHand" }` target when the slot is the public target | `inventory`, `equipment` | `actionId`, `label`, `surface`, `route.command`, public `item`; for ring auto-answer include `route.targetRingHand` or `route.autoAnswerHand:true` | `electron-owned-public-answer` only for validated ring hand; otherwise `netHack-owned-followup`/`no-followup` as route requires | `command-gateway-action-execute-test.js`, `real-command-transaction-completion-mcp-test.js`, ring/equipment MCP scripts |
| `slot.swapMainAlternate` | Existing | `x` | `{ "slotId":"mainHand" }` or `{ "slotId":"alternate" }` | `equipment` | `actionId`, `label`, `surface`, `route.command` | `no-followup` | `command-gateway-action-execute-test.js`, equipment MCP scripts |
| `ground.openContainer` | Accepted | `#loot\n` | `{ "location":{"kind":"ground"}, "objectId"?:123, "displayName":"public ground text" }` | `ground` when available | `actionId`, `label`, `surface:"ground-context"`, `target`, `route.command`, `promptPolicy` | `netHack-owned-followup` | command gateway, bridge metadata, empty-bag and container scenario MCP |
| `ground.tipContainer` | Present/latest | `#tip\n` | same ground target shape | `ground` when available | same as `ground.openContainer` | `netHack-owned-followup` | command gateway, bridge metadata, locked-container MCP |
| `ground.forceContainer` | Present/latest | `#force\n` | same ground target shape; may be enabled only after current public ground text or visible NetHack messages reveal a locked container | `ground` when available | same as `ground.openContainer` | `netHack-owned-followup` | command gateway, bridge metadata, locked-container/force-destroy MCP, locked-container reveal lifecycle MCP |
| `ground.untrapContainer` | Present/Workstream D | `#untrap\n` | same ground target shape; source must be visible trapped-container text/action, not hidden `otrapped` alone | `ground` when available | same as `ground.openContainer`; no direction answer | `netHack-owned-followup` | command gateway, native bridge metadata, locked-container MCP untrap click |
| `ground.dipIntoTerrain` | Accepted/Workstream E + H | `#dip\n` | `{ "location":{"kind":"ground"}, "displayName":"fountain/sink/water/etc public label" }` | `ground` if terrain/ground revision is available; otherwise omit and document | `actionId`, `label`, `surface:"ground-context"`, `target`, `route.command`, `promptPolicy` | `netHack-owned-followup` | command gateway, native bridge, `real-scenario-terrain-dip-mcp` final evidence |
| `item.dipInto` | Optional remaining/hidden | `#dip\n` | inventory target shape for public source item, or no item target if the action only opens NetHack's source prompt | `inventory` when an item target is present | `actionId`, `label`, `surface:"inventory-context"`, `route.command`, `promptPolicy`, public `item` if targeted | `netHack-owned-followup` | must add command gateway + inventory-action-service + real prompt evidence; hide if unsafe |
| `item.rub` | Accepted/Workstream F + H | `#rub\n` | inventory target shape for public rub candidate; no selector/follow-up answer bundled in command bytes | `inventory` when an item target is present | `actionId`, `label`, `surface:"inventory-context"`, `route.command`, `promptPolicy`, public `item`/target | `netHack-owned-followup` | command gateway, inventory-action-service, native bridge, `real-scenario-rub-inventory-mcp` final evidence |
| `item.rubOnStone` | Optional/future | `#rub\n` only; no bundled target answer unless separately validated | two public inventory targets, both with selector/displayName/location | `inventory` | explicit source and target metadata; no hidden stone identity | `netHack-owned-followup` unless a later public-answer route is approved | do not implement unless `item.rub` is accepted and no-spoiler proof exists |

Forbidden fields for every row: `trueName`, `baseType`, `objectType`, `otyp`, `beatitude`, `buc`, `cursed`, `blessed`, `enchantment`, `charges`, `trapState`, `contents`, `locked`, `trapped`, `broken`, predicted outcome, or any nested alias of those facts.

### Command envelope fields

Every v2 `action.execute` command must include the common envelope fields below plus the route-specific fields from the table above:

```json
{
  "protocol": "nethack-electron-ui/v2",
  "commandType": "action.execute",
  "commandId": "cmd-<transactionId>",
  "transactionId": "txn-<domain>-<short-purpose>",
  "actionId": "domain.actionName",
  "expectedRevision": {},
  "targets": {},
  "payload": {
    "actionId": "domain.actionName",
    "label": "player-visible label",
    "surface": "ground-context|inventory-context|system-actions|equipment-paper-doll",
    "route": { "actionId": "domain.actionName", "command": "exact bytes" },
    "promptPolicy": "netHack-owned-followup|electron-owned-public-answer|no-followup"
  }
}
```

Only include revision keys listed for that route. Ground routes require `expectedRevision.ground` when a ground snapshot exists. Inventory item routes require `expectedRevision.inventory` when a specific inventory row/selector is targeted. Equipment-changing routes require both inventory and equipment revisions.

Do **not** include hidden target fields: no `trueName`, `baseType`, `otyp`, `beatitude`, `cursed`, `charges`, `trapState`, `contents`, `locked`, `trapped`, `broken`, or speculative outcome preview.

### Prompt-policy metadata

Allowed prompt policies:

- `netHack-owned-followup`: command dispatches only the initiating extended command/key sequence; all follow-up prompts, menus, confirmations, directions, text input, and target choices are owned by NetHack/shim GUI wrappers.
- `electron-owned-public-answer`: rare; allowed only when the answer is fully public, deterministic, and validated in `command-gateway` with tests. Existing example: public ring hand answer when route metadata says left/right.
- `no-followup`: action is fully executed by the initial key sequence and should not open a prompt.

Do not use vague policies such as `allow-public-followup` for new execution routes; that older example remains documentation history, not a convention for new work.

### Blocker reason vocabulary

Use public, player-facing tokens and labels. Tokens are machine-stable; labels can be rendered text.

Allowed tokens:

- Armor layering: `blocked.armor.removeOuterFirst`, `blocked.armor.bodyOverShirt`, `blocked.armor.cloakOverBody`, `blocked.armor.slotOccupied`.
- Rings/accessories: `blocked.ring.leftOccupied`, `blocked.ring.rightOccupied`, `blocked.ring.bothOccupied`, `blocked.accessory.slotOccupied`.
- Hands/weapons: `blocked.hands.twoHandedWeapon`, `blocked.hands.shieldEquipped`, `blocked.hands.offhandOccupied`, `blocked.hands.twoWeaponing`, `blocked.hands.quiverOccupied`.
- Prompt/ownership: `blocked.input.promptActive`, `blocked.input.menuActive`, `blocked.input.transferActive`, `blocked.input.staleRevision`.
- Public unknown: `blocked.public.tryInNetHack` for cases where NetHack must decide and the UI must not guess.

Forbidden blocker tokens: anything that reveals curse/welded/trap/lock/broken/contents/identity unless NetHack has already displayed that exact fact publicly in the current surface. Examples to avoid: `blocked.cursed`, `blocked.welded`, `container.trapped`, `container.locked`, `hasKey`, `willBreak`, `containsGold`.

### Fixture naming

Use lowercase hyphenated safe IDs under `electron-poc/test/scenarios/<category>/<name>.json`. Category choices for this roadmap:

- `container/locked-trapped-chest-on-hero` (already present)
- `container/locked-chest-force-destroy-on-hero` (already present)
- `ground/unidentified-appearance-pile-on-hero` for C/shim no-spoiler ground pile checks
- `ground/broken-container-stale-cleanup-on-hero` if fixture support can publicize broken/destroyed state without hidden leakage
- `equipment/body-armor-over-shirt` (already present)
- `equipment/offhand-shield-twohanded` for public hand blocker tests
- `equipment/both-rings-occupied` for public ring blocker tests
- `terrain/fountain-dip-on-hero` for `ground.dipIntoTerrain`
- `object/rub-candidates-in-inventory` for `item.rub`

Never add arbitrary direct scenario paths. Use `NH_TEST_SCENARIO_ID=<category>/<name>` only.

### Test-output preservation

Each Developer must preserve evidence under a unique directory and must not overwrite another Developer's artifacts. Preferred format:

- `electron-poc/test-output/<workstream-slug>/...` for new scripts.
- If extending an existing script that already writes to a fixed directory, either add an env var for the output directory in that branch or move old output aside before running and report both paths.
- Required evidence files for player-facing slices:
  - screenshots (`*.png`),
  - state sidecars (`*.json`),
  - a summary markdown in the output directory,
  - exact command invocation,
  - screenshot inspection notes,
  - `logs/last-run.log` inspection result when the app run writes it.

## Parallel workstreams

### Workstream A — Native v2 command envelope foundation

Owner slot: **Developer A / Protocol-Bridge**

Goal: Create the scoped native v2 command envelope path from renderer/preload/main to shim/bridge without changing the semantics of existing accepted routes. This stream owns the transport contract that route Developers must use.

Minimum native transport contract:

1. Renderer builds and validates the v2 `action.execute` command with the shared command gateway, records the command for UI/replay evidence, then calls a new preload API named `netHackPOC.uiCommand(command)` for accepted v2 actions.
2. Preload exposes `uiCommand` through a new IPC channel named `nethack:uiCommand` and validates only that the payload is a plain v2 command object; it must not accept arbitrary strings on this channel.
3. Main process adds `gameProcess.uiCommand(command)`, validates the command envelope and allowlisted route with shared validators, logs a diagnostic event, and writes exactly one bridge stdin JSON line: `{ "type":"ui-command", "command": <v2 command> }`.
4. `nh-shim-bridge` receives that single JSON line, validates `protocol`, `commandType`, `actionId`, exact route command bytes, public target shape, and prompt policy, emits `bridge_ui_command_accepted` or `bridge_ui_command_rejected`, and only then lowers accepted commands into the exact NetHack key bytes.
5. Existing `shimInput` per-key metadata may remain as a compatibility path for manual/raw input, but accepted v2 semantic actions must use `uiCommand` after this workstream.

Acceptance criteria:

- Every action id currently in `CommandGateway.safeActionExecuteActionIds` can use the native `uiCommand` path, or the branch explicitly removes/marks unsupported action ids before merge.
- All accepted ground routes (`ground.openContainer`, `ground.tipContainer`, `ground.forceContainer`) use the native path by the end of Workstream A.
- Malformed, unsupported, wrong-prompt-policy, wrong-target, or wrong-command-byte envelopes fail closed in main or bridge before any key is sent.
- The bridge still emits the exact key stream expected by NetHack for accepted routes.
- Existing manual keyboard and raw NetHack input remain unchanged.
- Native path records `ui-protocol-command`, `command.accepted`/`command.rejected`, `bridge_ui_command_accepted`/`bridge_ui_command_rejected`, and bridge key-lowering diagnostics as evidence.
- Later route workstreams D/E/F must use `uiCommand`; renderer key-lowering is not acceptable for new v2 route acceptance.

Likely files/directories touched:

- `electron-poc/src/shared/ui-protocol-v2.js`
- `electron-poc/src/shared/command-gateway.js`
- `electron-poc/src/preload.js`
- `electron-poc/src/shared/preload-contract.js`
- `electron-poc/src/main/game-process.js`
- `electron-poc/shim-bridge/nh-shim-bridge.c`
- `win/shim/winshim.c` only if the shim input API must carry envelope metadata
- `electron-poc/scripts/command-gateway-action-execute-test.js`
- `electron-poc/scripts/bridge-semantic-action-metadata-test.js`
- new focused native-envelope test script under `electron-poc/scripts/`
- docs: `electron-poc/docs/ui-protocol-v2.md`, `electron-poc/src/shared/MODULE_MAP.md`

Dependencies:

- Lands first or in a protected integration branch before new route work is merged.
- Must not depend on new `#dip`, `#rub`, or `#untrap` semantics.

Collision risks and files not to touch:

- High collision risk with all route work in `command-gateway.js`, `renderer.js`, and `ui-protocol-v2.js`.
- Do not refactor renderer architecture broadly.
- Do not modify assets, tile manifest, Megabyte/icon mapping, or map presentation except for tests that observe existing behavior.

Testing requirements:

From `electron-poc/`:

```bash
npm run test:command-gateway-action-execute
npm run test:bridge-semantic-action-metadata
npm run test:architecture
node scripts/real-scenario-empty-bag-context-open-mcp-test.js
node scripts/real-scenario-locked-container-mcp-test.js
```

If preload/main contracts change, also run:

```bash
node scripts/preload-contract-drift-test.js
node scripts/electron-test-harness-contract-test.js
```

Fixture/scenario evidence required:

- Use existing `container/empty-bag-on-hero` and `container/locked-trapped-chest-on-hero`.
- Save screenshots and state sidecars proving a native-envelope `ground.openContainer` or `ground.tipContainer` still opens the real NetHack-owned follow-up UI.

Safety boundaries:

- Native envelope transport must validate the same closed no-spoiler target schema as shared validator.
- No bundled prompt/menu answers except already accepted public ring hand validation.
- No broad command executor for arbitrary `#` commands.

Expected Developer report:

- Matrix: old renderer-lowered path vs native envelope path.
- Exact envelope shape and rejection reason vocabulary used.
- Files changed, commands run, evidence paths, screenshot inspection notes, logs/last-run result, caveats.

### Workstream B — C/shim no-spoiler fixture and public-boundary hardening

Owner slot: **Developer B / Public-Boundary-Fixtures**

Goal: Prove and harden the public/no-spoiler boundary for C/shim ground/inventory/equipment/menu data, especially unidentified objects and locked/trapped/broken containers. This stream should deepen evidence even if it makes no visible route changes.

Acceptance criteria:

- Real C/shim fixture tests show unidentified objects expose public appearance/class only and omit hidden identity from v2/public UI payloads.
- Ground-pile snapshots do not expose hidden container lock/trap/broken state as action tokens.
- Destroyed/broken containers do not leave stale ground/container actions or contents.
- Any scenario schema extensions are gated, fail-closed, and covered by negative tests.
- Raw diagnostic evidence may contain raw NetHack internals only if explicitly classified as raw debug; player-facing UI/state/replay v2 public payloads must not.

Likely files/directories touched:

- `src/allmain.c` for scenario fixture parser/apply extensions only if needed
- `electron-poc/shim-bridge/nh-shim-bridge.c`
- `electron-poc/src/shared/shim-protocol.js`
- `electron-poc/src/shared/ui-protocol-v2.js`
- `electron-poc/src/shared/ground-pile-snapshot-adapter.js`
- `electron-poc/src/shared/game-view-state.js` only if stale public state cleanup is needed
- `electron-poc/test/scenarios/ground/*.json`
- `electron-poc/test/scenarios/container/*.json`
- `electron-poc/scripts/scenario-loader-contract-test.js`
- `electron-poc/scripts/scenario-loader-negative-test.js`
- `electron-poc/scripts/scenario-loader-positive-test.js`
- new or extended real scenario MCP scripts under `electron-poc/scripts/`

Dependencies:

- Can run in parallel with Workstream A if it avoids `command-gateway.js` and route execution.
- Route workstreams should consume this stream's new fixtures when available, but do not block on it for initial unit tests.

Collision risks and files not to touch:

- High collision risk in `nh-shim-bridge.c` if Workstream A also changes bridge transport; coordinate before editing bridge input parsing.
- Do not touch `electron-poc/assets/`, tile manifests, or asset/icon mappings.
- Do not add unsupported fixture backdoors or direct scenario paths.

Testing requirements:

From `electron-poc/`:

```bash
npm run build:shim:test-fixtures
npm run test:scenario-loader
npm run test:bridge-public-action-affordances
npm run test:ground-pile-snapshot
node scripts/real-scenario-ground-pickup-mcp-test.js
node scripts/real-scenario-force-destroyed-container-context-mcp-test.js
```

If object tooltip no-spoiler evidence is touched, run relevant existing object scenario scripts, but do not change asset mapping:

```bash
node scripts/real-scenario-thin-spellbook-tooltip-mcp-test.js
node scripts/real-scenario-crude-dagger-tooltip-mcp-test.js
```

Fixture/scenario evidence required:

- Add `ground/unidentified-appearance-pile-on-hero` if not already covered.
- Capture at least one screenshot of visible map/ground UI and one state sidecar proving hidden identity is absent from public UI strings.
- For locked/trapped containers, prove only visible text/actions are used; do not assert hidden `olocked`/`otrapped` as public unless NetHack printed it.

Safety boundaries:

- No-spoiler C/shim data rule is absolute for public state: omit hidden facts rather than marking them false.
- Do not expose `container.locked`, `container.trapped`, or `container.broken` as public tokens unless the token name is changed to a visible-text-derived form and the public display source is recorded.

Expected Developer report:

- Public-boundary matrix: raw C fact, public emitted field, redaction rule, test proof.
- New fixtures and negative cases listed by path.
- Commands/evidence/logs/screenshot inspection notes.

### Workstream C — Public equipment blocker reasons

Owner slot: **Developer C / Equipment-Blockers**

Goal: Add richer public blocker/action reason tokens for equipment constraints so the UI can explain visible limitations without guessing hidden NetHack state.

Acceptance criteria:

- Armor layering blockers for body armor over shirt/cloak/body relationships use the approved `blocked.armor.*` vocabulary.
- Ring slot occupancy blockers use `blocked.ring.*` and never guess BUC/curse/welded state.
- Offhand/two-handed/two-weapon blockers use `blocked.hands.*` and are generated only from public equipment snapshot/worn-mask facts.
- UI labels are player-facing and do not mention implementation tokens unless in diagnostics.
- Existing equipment paper doll and inventory action behavior remains stable.

Likely files/directories touched:

- `electron-poc/src/shared/inventory-action-service.js`
- `electron-poc/src/shared/equipment-snapshot-adapter.js`
- `electron-poc/src/shared/ui-protocol-v2.js` only if adding allowed public blocker-token validation
- `electron-poc/src/renderer.js` only for rendering existing service outputs; avoid broad UI refactor
- `electron-poc/scripts/inventory-action-service-test.js`
- `electron-poc/scripts/equipment-snapshot-test.js`
- `electron-poc/scripts/equipment-screen-rpg-test.js`
- `electron-poc/test/scenarios/equipment/*.json`
- new/extended real MCP scripts for equipment blockers

Dependencies:

- Can run parallel with Workstreams A/B if it avoids command envelope changes.
- Should merge before final route polish if `#dip`/`#rub` labels depend on equipment blockers; otherwise independent.

Collision risks and files not to touch:

- Collision with route work in `inventory-action-service.js` if those streams add item actions. Coordinate by keeping blocker changes near armor/ring/hand functions and avoiding ground action functions.
- Do not touch map rendering, assets, or container transfer code.

Testing requirements:

From `electron-poc/`:

```bash
npm run test:inventory-action-service
npm run test:equipment-snapshot
npm run test:equipment-screen-rpg
node scripts/real-scenario-shirt-takeoff-mcp-test.js
node scripts/real-scenario-ring-put-on-gui-mcp-test.js
```

If new fixtures are added:

```bash
npm run test:scenario-loader
```

Fixture/scenario evidence required:

- Existing `equipment/body-armor-over-shirt` for armor layering.
- Add or extend `equipment/both-rings-occupied` and `equipment/offhand-shield-twohanded` only if existing scenarios cannot prove the blockers.
- Real screenshots must show player-facing blocker/choice labels, not only JSON state.

Safety boundaries:

- Do not expose cursed/welded status unless NetHack has already revealed it in the current visible surface.
- Do not auto-answer prompts to remove/wear/drop blockers.

Expected Developer report:

- Table of blocker token -> visible label -> source public fact -> test evidence.
- Commands/evidence/logs/screenshot inspection notes.

### Workstream D — Safe v2 `#untrap` route

Owner slot: **Developer D / Untrap-Route**

Goal: Convert visible ground-container `Untrap` from legacy raw `#untrap\n` routing into a safe v2 `ground.untrapContainer` route, with explicit public target and prompt ownership. Optional trap/door variants must not be added until the container route is accepted.

Acceptance criteria:

- `ground.untrapContainer` is allowlisted only for `#untrap\n`.
- Requires public ground target (`targets.location.kind === 'ground'`) and `promptPolicy: 'netHack-owned-followup'`.
- Blocks when active prompt/menu/transfer owner exists.
- Records v2 command evidence and bridge semantic metadata.
- Real locked/trapped container scenario clicks `Untrap` and asserts a v2 `action.execute` with public ground target and prompt policy before NetHack-owned direction/follow-up UI.
- Existing `ground.openContainer`, `ground.tipContainer`, `ground.forceContainer` behavior remains unchanged.

Likely files/directories touched:

- `electron-poc/src/shared/command-gateway.js`
- `electron-poc/src/shared/inventory-action-service.js`
- `electron-poc/src/renderer.js`
- `electron-poc/scripts/command-gateway-action-execute-test.js`
- `electron-poc/scripts/inventory-action-service-test.js`
- `electron-poc/scripts/bridge-semantic-action-metadata-test.js`
- `electron-poc/scripts/real-scenario-locked-container-mcp-test.js`
- `electron-poc/scripts/context-action-bar-test.js`
- docs: `electron-poc/docs/ui-protocol-v2.md`, `electron-poc/src/shared/MODULE_MAP.md`

Dependencies:

- Prefer after Workstream A conventions land, but can be developed against current renderer-lowered gateway if branch is rebased before final acceptance.
- Consumes Workstream B's no-spoiler fixture if available; otherwise use existing `container/locked-trapped-chest-on-hero`.

Collision risks and files not to touch:

- High collision with `#dip`/`#rub` streams in `command-gateway.js`, `inventory-action-service.js`, and `renderer.js`. Route Developers should either land serially after Workstream A or coordinate exact non-overlapping edits.
- Do not implement trap/door untrap unless explicitly scoped in this branch.
- Do not add direction auto-answering.

Testing requirements:

From `electron-poc/`:

```bash
npm run test:command-gateway-action-execute
npm run test:inventory-action-service
npm run test:bridge-semantic-action-metadata
npm run test:context-action-bar
node scripts/real-scenario-locked-container-mcp-test.js
```

Fixture/scenario evidence required:

- Use `container/locked-trapped-chest-on-hero`.
- Required screenshots: context actions before click, NetHack-owned untrap follow-up after click.
- Required state sidecar: sent input stream, sent v2 command envelope, prompt/dialog state.

Safety boundaries:

- No direction answer in the initial envelope.
- No hidden `otrapped` token in v2 public payload; the route can be exposed only from visible text/action already shown to the player.

Expected Developer report:

- State explicitly that only container untrap is v2; trap/door untrap remains legacy/unimplemented unless included with evidence.

### Workstream E — Safe v2 `#dip` routes

Owner slot: **Developer E / Dip-Route**

Goal: Add safe semantic routing for `#dip` without letting Electron infer potion identity, liquid effects, or hidden outcomes.

Acceptance criteria:

- Add `ground.dipIntoTerrain` for public current-square terrain/liquid labels only; command keys exactly `#dip\n`; prompt policy `netHack-owned-followup`.
- Add `item.dipInto` only for public inventory candidates if the first action remains just `#dip\n` and NetHack owns the item/target prompts. If the route cannot prove prompt ownership safely, leave `item.dipInto` hidden and document why.
- Existing generic system `Dip` button may continue legacy routing, but new context/inventory semantic actions must be v2 validated or deliberately hidden.
- No automatic selection of source item, potion, fountain, sink, pool, or target.
- Real Electron evidence covers at least one terrain dip prompt and one inventory dip candidate prompt if implemented.

Likely files/directories touched:

- `electron-poc/src/shared/command-gateway.js`
- `electron-poc/src/shared/inventory-action-service.js`
- `electron-poc/src/renderer.js`
- `electron-poc/scripts/command-gateway-action-execute-test.js`
- `electron-poc/scripts/inventory-action-service-test.js`
- `electron-poc/scripts/gui-input-workflow-test.js`
- `electron-poc/scripts/inventory-selection-gui-audit-test.js`
- new scenario `electron-poc/test/scenarios/terrain/fountain-dip-on-hero.json` if needed
- new real scenario MCP script for fountain/terrain dip if current scripts do not cover it
- docs: `electron-poc/docs/ui-protocol-v2.md`

Dependencies:

- Prefer after Workstream A and after Workstream B if a terrain/liquid fixture needs schema expansion.
- Does not depend on `#untrap` or `#rub` except for merge order in shared files.

Collision risks and files not to touch:

- High collision with route streams in `command-gateway.js`, `inventory-action-service.js`, `renderer.js`.
- Do not touch fountain NetHack gameplay in `src/fountain.c` except fixture deterministic event hooks if explicitly needed and covered.
- Do not change asset/icon mapping for fountains/water/potions.

Testing requirements:

From `electron-poc/`:

```bash
npm run test:command-gateway-action-execute
npm run test:inventory-action-service
npm run test:gui-input-workflow
npm run test:inventory-selection-gui-audit
npm run test:scenario-loader   # if adding fixtures
```

For real proof, Workstream E must create the exact script and package alias below if no equivalent already exists:

- script: `electron-poc/scripts/real-scenario-terrain-dip-mcp-test.js`
- package alias: `test:real-scenario-terrain-dip-mcp`
- default scenario: `terrain/fountain-dip-on-hero`
- default output dir: `electron-poc/test-output/real-scenario-terrain-dip`
- output env override: `NH_TERRAIN_DIP_OUT_DIR`
- CDP port env/default: `AI_ORG_ELECTRON_CDP_PORT` or `9641` when unset

```bash
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=terrain/fountain-dip-on-hero NH_TERRAIN_DIP_OUT_DIR=test-output/real-scenario-terrain-dip npm run test:real-scenario-terrain-dip-mcp
```

Fixture/scenario evidence required:

- Public terrain screenshot showing fountain/sink/water context label.
- Prompt screenshot after clicking Dip showing NetHack-owned item selection GUI, not an auto-selected hidden target.
- State sidecar with `actionId: ground.dipIntoTerrain` or `item.dipInto`, command `#dip\n`, public target, and promptPolicy.

Safety boundaries:

- Never preview dip effects.
- Never expose potion identity/BUC/charges/knownness beyond public display text.
- If route starts from a ground potion, do not create pickup-then-dip automation in this stream.

Expected Developer report:

- Explicitly list which `#dip` subroutes are implemented and which remain legacy/hidden.

### Workstream F — Safe v2 `#rub` routes

Owner slot: **Developer F / Rub-Route**

Goal: Add safe semantic routing for `#rub` candidates while preserving NetHack prompt ownership and no-spoiler item identity rules.

Acceptance criteria:

- Add `item.rub` for public inventory candidates such as lamp/lantern/magic marker/towel/visible stone only if route command is exactly `#rub\n` and prompt policy is `netHack-owned-followup`.
- If adding a more specific route such as `item.rubOnStone`, both source and target must be public and no follow-up answer may be bundled unless separately validated.
- Ground pickup-then-rub remains hidden unless a separate accepted pickup transaction route exists.
- Generic system `Rub` button may remain legacy, but context/inventory semantic rub actions must be v2 validated or hidden.
- Real Electron evidence covers a visible inventory rub prompt and proves no hidden stone/lamp identity is exposed.

Likely files/directories touched:

- `electron-poc/src/shared/command-gateway.js`
- `electron-poc/src/shared/inventory-action-service.js`
- `electron-poc/src/renderer.js`
- `electron-poc/scripts/command-gateway-action-execute-test.js`
- `electron-poc/scripts/inventory-action-service-test.js`
- `electron-poc/scripts/gui-input-workflow-test.js`
- `electron-poc/scripts/inventory-selection-gui-audit-test.js`
- new scenario `electron-poc/test/scenarios/object/rub-candidates-in-inventory.json` if needed
- new real scenario MCP script for rub if current GUI workflow is not enough
- docs: `electron-poc/docs/ui-protocol-v2.md`

Dependencies:

- Prefer after Workstream A. Can use existing inventory-selection audit for prompt UI, but real gameplay screenshot proof is still required for player-facing changes.

Collision risks and files not to touch:

- High collision with route streams in shared route files.
- Do not modify object tile/icon mapping for lamps/stones/markers.
- Do not add hidden `otyp`/true identity rules to the renderer.

Testing requirements:

From `electron-poc/`:

```bash
npm run test:command-gateway-action-execute
npm run test:inventory-action-service
npm run test:gui-input-workflow
npm run test:inventory-selection-gui-audit
npm run test:scenario-loader   # if adding fixtures
```

For real proof, Workstream F must create the exact script and package alias below if no equivalent already exists:

- script: `electron-poc/scripts/real-scenario-rub-inventory-mcp-test.js`
- package alias: `test:real-scenario-rub-inventory-mcp`
- default scenario: `object/rub-candidates-in-inventory`
- default output dir: `electron-poc/test-output/real-scenario-rub-inventory`
- output env override: `NH_RUB_INVENTORY_OUT_DIR`
- CDP port env/default: `AI_ORG_ELECTRON_CDP_PORT` or `9642` when unset

```bash
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=object/rub-candidates-in-inventory NH_RUB_INVENTORY_OUT_DIR=test-output/real-scenario-rub-inventory npm run test:real-scenario-rub-inventory-mcp
```

Fixture/scenario evidence required:

- Screenshot of inventory/context action showing Rub only for public candidate rows.
- Screenshot after click showing NetHack-owned prompt wrapper.
- State sidecar with v2 command envelope and absence of hidden identity fields.

Safety boundaries:

- Do not infer which gray stone is touchstone/luckstone/loadstone unless publicly named.
- Do not auto-answer target prompts.

Expected Developer report:

- Candidate matrix: public row text/token -> shown action? -> route -> prompt owner -> evidence.

### Workstream G — Replay, acknowledgements, and transaction completion polish

Owner slot: **Developer G / Replay-Acks**

Goal: Ensure all new native/v2 semantic commands and route rejections have coherent command/transaction evidence in state, logs, and replay recordings, without changing replay to execute semantic commands.

Acceptance criteria:

- New v2 commands record `ui-protocol-command` evidence; accepted/rejected/completed events are valid v2 envelopes.
- Rejections use the approved blocker vocabulary for active owner, stale revision, unsupported route, malformed target, and missing prompt policy.
- Replay records preserve commands/acks but still replay only `input` events.
- Tests prove rejected commands do not send raw fallback input.
- This stream does not create new gameplay routes; it supports routes landed by A/D/E/F.

Likely files/directories touched:

- `electron-poc/src/shared/recording-schema.js`
- `electron-poc/src/shared/command-transaction-model.js`
- `electron-poc/src/shared/game-view-state.js`
- `electron-poc/src/shared/ui-protocol-v2.js`
- `electron-poc/src/renderer.js` only for recording/evidence plumbing
- `electron-poc/scripts/recording-schema-replay-adapter-test.js`
- `electron-poc/scripts/command-transaction-lifecycle-test.js`
- `electron-poc/scripts/semantic-action-acknowledgement-test.js`
- `electron-poc/scripts/real-record-replay-e2e-test.js`
- docs: `electron-poc/docs/replay-recordings.md`, `electron-poc/docs/ui-protocol-v2.md`

Dependencies:

- Best after Workstream A exposes native-envelope evidence.
- Can run in parallel with C once route command ids are known; final tests require rebasing over D/E/F.

Collision risks and files not to touch:

- Collision with A in `ui-protocol-v2.js` and renderer recording helpers.
- Do not switch replay execution semantics to v2 commands in this roadmap; input replay remains source of execution.

Testing requirements:

From `electron-poc/`:

```bash
npm run test:semantic-action-acknowledgement
npm run test:command-transaction-lifecycle
npm run test:real-command-transaction-completion-mcp
npm run test:real-record-replay-e2e
npm run test:replay-v2
```

Fixture/scenario evidence required:

- At least one accepted command, one rejected command, and one completed transaction in saved recording/state sidecar.
- Screenshots only required if renderer UI or player-facing route behavior changes in this stream.

Safety boundaries:

- No raw fallback after v2 rejection.
- No replay interpretation of semantic commands until a separate approved roadmap item exists.

Expected Developer report:

- Evidence table: command type, result, replay record type, execution source, paths.

### Workstream H — Final integration, merge reconciliation, and closure proof

Owner slot: **Developer H / Final-Integrator**

Goal: Reconcile all accepted branches, update docs/checklists, run the final cross-cutting proof suite, inspect screenshots/logs, and produce the roadmap closure report.

Acceptance criteria:

- All workstreams are rebased onto the same base and merged in the integration order below.
- `electron-poc/docs/ui-protocol-v2.md`, `electron-poc/src/shared/MODULE_MAP.md`, and this plan are updated to match implemented reality.
- No stale claims: any route not implemented remains listed as legacy/remaining.
- Cross-cutting tests pass or failures are documented with exact blockers.
- Real Electron screenshots are opened and inspected; inspection notes are in the final report.
- `logs/last-run.log` is inspected after app runs if present.

Likely files/directories touched:

- Documentation files only unless reconciliation requires small test/import fixes:
  - `electron-poc/docs/ui-protocol-v2.md`
  - `electron-poc/docs/replay-recordings.md`
  - `electron-poc/src/shared/MODULE_MAP.md`
  - `electron-poc/docs/c-to-electron-roadmap-split-plan.md`
  - `electron-poc/package.json` only to add canonical scripts for tests that already exist
- Final reports/evidence under `electron-poc/test-output/final-c-to-electron-integration/`

Dependencies:

- Runs after A, B, C, and any accepted route streams.

Collision risks and files not to touch:

- Do not implement new feature behavior in final integration unless it is a minimal merge/test fix.
- Do not touch assets/icon mapping.
- Do not do broad renderer architecture refactors.

Testing requirements:

Minimum final command set from `electron-poc/`:

```bash
npm run test:architecture
npm run test:command-gateway-action-execute
npm run test:inventory-action-service
npm run test:bridge-semantic-action-metadata
npm run test:bridge-public-action-affordances
npm run test:scenario-loader
npm run test:real-container-variant-suite-mcp
npm run test:real-ground-pickup-transfer-panel-mcp
npm run test:real-inventory-context-actions-mcp
npm run test:real-equipment-screen-mcp
npm run test:real-command-transaction-completion-mcp
npm run test:real-record-replay-e2e
```

Add route-specific real scripts for any accepted `#untrap`, `#dip`, or `#rub` workstreams.

Fixture/scenario evidence required:

- One summary markdown under `electron-poc/test-output/final-c-to-electron-integration/summary.md` linking all screenshots/state sidecars from accepted branches.
- A final completed-vs-remaining checklist.

Safety boundaries:

- Final integrator is the gatekeeper for no-spoiler, prompt ownership, v2 validation, and asset non-goals.

Expected Developer report:

- Merge order followed, branches included/excluded, test matrix with pass/fail, screenshot inspection notes, logs/last-run result, exact remaining caveats, readiness verdict.

## Integration order

1. **Land Workstream A first** on a clean branch. It changes the command transport contract and must stabilize before route branches depend on it.
2. **Land Workstream B early** after A or in parallel if conflicts are resolved carefully. Its fixtures and no-spoiler tests are shared proof assets for the route workstreams.
3. **Land Workstream C** after A if it needs protocol vocabulary changes; otherwise it can land after B. It should avoid route functions.
4. **Land route workstreams one at a time** in this order to minimize collisions:
   1. Workstream D `ground.untrapContainer` because it extends the already-visible trapped-container affordance and fixes a known semantic-routing gap.
   2. Workstream E `#dip` because it has terrain/inventory prompt ambiguity and should consume conventions from D.
   3. Workstream F `#rub` because it is most exposed to hidden identity ambiguity around gray stones/lamp-like tools.
5. **Land Workstream G** after A and at least one route branch, then rebase it after all accepted route branches so recording/ack tests cover the final route set.
6. **Run Workstream H final integration**. The integrator should rebase every branch onto the same base, resolve shared-file conflicts in `command-gateway.js`, `inventory-action-service.js`, `renderer.js`, and `ui-protocol-v2.js`, then run final proofs.

Rebase/merge rules:

- Each Developer branch must include a short `employee-result.md` or branch report with changed files, commands, evidence paths, and unresolved risks.
- Before merging a route branch, re-run `npm run test:command-gateway-action-execute` and `npm run test:inventory-action-service` after rebase; these files are collision hotspots.
- Do not merge two route branches that both edited the same route table without an explicit post-rebase diff review.
- The final integrator owns package script additions and docs reconciliation; route Developers can update docs for their own route but should not reorganize docs broadly.

## Non-goals and forbidden areas

- No Megabyte asset/icon mapping, tile manifest edits, generated asset work, RMBG/transparency work, or map art changes.
- No broad Electron architecture refactor, bundler/module-system migration, renderer rewrite, or store decomposition except minimal route/command plumbing directly required by this roadmap.
- No changes to classic/manual keyboard flows; raw NetHack keyboard behavior must continue.
- No deterministic fake gameplay, fake Employees, canned NetHack outcomes, or renderer-only demonstrations as acceptance for player-facing routes.
- No hidden NetHack state exposure in public Electron payloads, visible UI, prompt labels, replay v2 records, or action tokens.
- No direct scenario path support and no production fixture mutators.
- No auto-answering NetHack prompts unless a separate route validates that exact public answer and documents why it is safe.
- No arbitrary `#` extended-command executor under v2; every semantic extended route must be allowlisted by exact action id and exact command bytes.

## Remaining ambiguity/risk register

- **Native envelope depth:** Workstream A must use the exact `netHackPOC.uiCommand` -> `nethack:uiCommand` -> `gameProcess.uiCommand` -> bridge `{type:"ui-command", command}` seam defined above. Do not substitute per-key metadata as the accepted native path and do not overbuild a general command bus.
- **Public lock/trap knowledge:** A visible string such as `trapped` can justify a visible `Untrap` label, but hidden `otrapped` alone cannot. Workstream B/D must record source evidence for any route exposure.
- **`#dip` ambiguity:** NetHack may ask source item, target liquid, or confirmation depending on context. Default to NetHack-owned follow-up and no auto-selection.
- **`#rub` ambiguity:** Public candidate labels do not prove hidden effects. Show route only as a prompt-opening action, not an effect preview.
- **Parallel test isolation:** MCP/Electron tests should not run concurrently against the same CDP port/output directory/playground. Use unique ports/output dirs and preserve artifacts.
- **Current broad worktree:** The repository contains many modified/untracked files. Developers must report `git status --short` before/after and isolate their diffs by file path and evidence, not by assuming a clean tree.
