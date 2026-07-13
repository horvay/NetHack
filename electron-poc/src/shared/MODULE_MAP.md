# Electron shared module map and migration checklist

Current migration phase: CommonJS modules with browser-global adapters. `renderer.html` still uses plain script tags, so shared renderer modules must expose a frozen `window.NetHack*` global and also export `module.exports` for Node tests. `test/shared/browser-global-contract-test.js` is the contract test for this seam: it loads the shared scripts in the real `renderer.html` order inside a browser-like VM context and asserts each expected `window.NetHack*` Interface is exposed and frozen.

## Modules

- `src/main/game-process.js` — owns the child process seam: start TTY, start shim bridge, stop, status, TTY input, shim key/input.
- `src/main/launch-policy.js` — pure launch policy for seed normalization, NetHack option allowlisting, fixture env gating, and TTY/shim spawn configuration.
- `src/main/replay-runner.js` — owns visual replay automation and recording validation.
- `src/main/electron-security.js` — owns BrowserWindow command-line/window/session hardening.
- `src/shared/preload-contract.js` — Node-testable copy of preload contract validators and the lossless recursive IPC clone. Preload inlines this logic because sandboxed preloads cannot require local files; the wired contract and exact-source drift tests enforce parity.
- `src/shared/public-item-knowledge.js` — single fail-closed item-label authority: omitted identity knowledge is unknown, generic labels require explicit identity/appearance authorization, and contradictory flags redact.
- `src/shared/shim-protocol.js` — versioned JS shim protocol contract with per-event normalization/validation and raw diagnostics.
- `src/shared/game-view-state.js` — shared shim event interpretation seam; owns map/menu/prompt/status/text-window state transitions, command acknowledgement evidence (`commandProtocolAcks`), and renderer/test effects.
- `src/shared/command-gateway.js` — input safety, duplicate-key rules, and the limited v2 `action.execute` allowlist/route validator for safe inventory/equipment selector commands, accepted public ground-container/terrain routes, and safe prompt-owned inventory `#rub`.
- `src/shared/message-log.js` — bounded user message history separate from raw shim logs.
- `src/shared/prompt-rules.js` — named prompt/menu/domain regex rules.
- `src/shared/interaction-model.js` — prompt/menu interaction descriptions shared by renderer adapters and fixture replay.
- `src/shared/public-blockers.js` — public player-facing blocker token vocabulary and labels for equipment/input constraints.
- `src/shared/inventory-action-service.js` — equipment/inventory row action derivation for the RPG inventory screen.
- `src/shared/tile-assets.js` — asset manifest normalization, cell normalization, tile/base/overlay resolution.
- `src/shared/map-presentation.js` — map cell/tooltip presentation model for terrain classes, tile/base ids, fallback glyphs, and labels.
- `src/shared/ui-protocol-v2.js` — additive semantic UI protocol validators, command/event envelope checks, and no-spoiler public item schema.
- `src/shared/menu-metadata-adapter.js` — v1 menu/prompt metadata compatibility adapter and comparison diagnostics.
- `src/shared/inventory-snapshot-adapter.js` — v1 `shim_update_inventory` to public v2 `inventory.snapshot` adapter plus inventory reducer helpers.
- `src/shared/equipment-snapshot-adapter.js` — derives public v2 `equipment.snapshot` slots from inventory `wornMask` facts, preserves equipment revisions, and exposes gated paper-doll slot models.
- `src/shared/ground-pile-snapshot-adapter.js` — normalizes visible ground menu/message rows and visible map object-layer metadata into no-spoiler public `ground.pile.snapshot` payloads, revisioned piles, and canonical ground-pile deltas.
- `src/shared/container-contents-snapshot-adapter.js` — normalizes opened container-pane rows into public no-spoiler `container.contents.snapshot` payloads keyed by explicit session/container identity, with stale-session/revision rejection and canonical container-content deltas.
- `src/shared/recording-schema.js` — versioned recording validation, including preserved non-replay v2 command/ack evidence while replay remains input-event driven.
- `src/shared/status-hud.js` — status HUD parsing helper scaffold.
- `src/shared/test-harness.js` — shared fixture/replay shared-test adapter helpers for reading JSONL, deterministic Electron env, UI protocol event factories, protocol assertions, and effect lookup.
- `src/ux/runtime.js` — UXM-00 versioned domain registry, provider slots, immutable public-state subscriptions, diagnostics, and reserved notice/dialog service installation points. Duplicate domain owners fail closed.
- `src/ux/settings-store.js` — presentation settings v2 normalization, v1 migration, safe defaults, session-preserving write failure, and once-per-session warning policy.
- `src/ux/app-mounts.js` — fixed mount-name to DOM-id contract for later exclusive UX domain modules.
- `src/ux/*.js` and `src/ux/styles/*.css` — preloaded, owner-specific module and stylesheet slots from UXM-01 through UXM-08. Reserved slots are intentionally behaviorless until their owning chunk implements them.
- `src/main/window-policy.js` — pure 960 by 720 production minimum policy with a two-flag test-only override.
- `scripts/lib/screenshot-qc.js` — raw screenshot provenance, explicitly scaled or full-size view-safe derivatives, dimensions, hashes, manual-inspection fields, and manifest validation.
- `test/shared/browser-global-contract-test.js` — shared module-system contract proof for the renderer script-order/browser-global seam.
- `scripts/lib/electron-test-harness.js` — Node-only Electron/CDP test Adapter v3 for launch/connect/wait/evaluate/viewport/screenshot/teardown plus a higher-level browser driver Interface for renderer readiness, visible-element clicks, key input, startup-choice-aware default-character startup, QC screenshot capture, intro dismissal, safe stale-lock cleanup, and captured Electron stdout/stderr artifacts. `scripts/real-startup-no-blank-command-test.js` and `scripts/real-input-regression-test.js` use this lifecycle driver; `scripts/electron-test-harness-contract-test.js` covers non-text key dispatch and SIGKILL teardown escalation.

## Known shallow Modules and deferred slices

- `src/renderer.js` remains the main DOM Adapter and still owns too many rendering and workflow domains. Safe next slice: route status/message/diagnostic effects through a renderer-side effect Adapter before touching inventory/action routing.
- `src/shared/game-view-state.js` has a deep external Interface (`process(rawInput) -> effects`) but a broad internal Implementation. Safe next slice: split v2/public-event reducers behind the same external Interface.
- `scripts/lib/electron-test-harness.js` now has a deeper browser driver Interface and covers the real startup no-blank-command lifecycle proof, but many real-browser scripts still bypass it. Safe next slice: migrate one additional read-only lifecycle/status script at a time, avoiding concurrent Electron/CDP runs.
- `src/preload.js` still inlines validators and the lossless recursive IPC clone mirrored by `src/shared/preload-contract.js` because the sandbox cannot require local files. `scripts/preload-contract-test.js` checks clone/security semantics and `scripts/preload-contract-drift-test.js` enforces exact function-source parity; a future generated checked-in validator block would improve Locality.
- Native v2 command envelope execution is present for the limited `action.execute` slice: renderer validates and records allowlisted inventory/equipment selector routes plus safe ground extended routes (`#loot`/`ground.openContainer`, `#tip`/`ground.tipContainer`, `#force`/`ground.forceContainer`, container-only `#untrap`/`ground.untrapContainer`, terrain/liquid `#dip`/`ground.dipIntoTerrain`), and inventory-origin `#rub`/`item.rub`, then sends one `netHackPOC.uiCommand` / `nethack:uiCommand` / bridge `{ "type": "ui-command" }` envelope for main acknowledgement, bridge-side validation, and key lowering. Main-side ground-container validation uses only current public cursor evidence (ground pile or current map object layer), while renderer may refresh current ground affordances from visible NetHack messages such as a locked-container reveal. Inventory-origin `item.dipInto` remains hidden until its prompt ownership/no-spoiler workstream lands.

## Practical module-system migration plan

1. Keep CommonJS as the Node/test source of truth while the app has no bundler.
2. For renderer-consumed pure modules, use the UMD/global adapter pattern already used in `src/shared/*.js`.
3. Move one domain rule at a time from `renderer.js` into a shared module; keep the renderer as the DOM adapter.
4. Add focused Node tests per shared module before using the module from the renderer.
5. Only after renderer globals shrink substantially, choose either:
   - ESM script tags with import maps, or
   - a small bundler build step.
6. Convert fixture scripts after the browser path is stable; do not make fixtures depend on app internals in ways that remove independent verification.

## Browser script order

`renderer.html` loads: xterm, module-system, public-item-knowledge, public-blockers, ui-protocol-v2, command-gateway, message-log, prompt-rules, tile-assets, character-options, interaction-model, inventory-action-service, map-presentation, shim-protocol, menu-metadata-adapter, inventory-snapshot-adapter, equipment-snapshot-adapter, ground-pile-snapshot-adapter, container-contents-snapshot-adapter, command-transaction-model, transfer-transaction-model, game-view-state, recording-schema, status-hud, UX runtime/settings/mount contracts, the predeclared UXM-01 through UXM-08 owner slots in plan order, then `renderer.js`.
