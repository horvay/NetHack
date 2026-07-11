# Electron architecture improvement checklist

Source evidence:
- Architecture report: `electron-poc/architecture-report.html`
- Independent critique: `subagent-runs/critique-1782759564686/subagent-result.md`
- Historical refreshed line-count evidence before the first architecture pass: `src/main.js` 272 lines, `src/preload.js` 17 lines, `src/renderer.js` 2026 lines, `src/renderer.html` 190 lines.
- Current follow-up evidence (2026-07-06): `src/main.js` 113 lines, `src/preload.js` 81 lines, `src/renderer.js` 7963 lines, `src/renderer.html` 362 lines, `src/shared/game-view-state.js` 954 lines. Renderer and game-view-state are now explicitly tracked as shallow/broad Modules in `src/shared/MODULE_MAP.md` rather than treated as complete decomposition.

Priority corrections from critique:
- Reserve P0 for active safety/correctness risks. Electron security hardening and preload IPC validation are P0.
- Main process lifecycle, renderer decomposition, command gateway, and shim normalizer are P1 practical architecture work, not emergency P0.
- Shared test helpers and module-map scaffolding are P2/P1 migration aids.
- Shim protocol versioning begins as a JavaScript normalizer at the Electron seam before any C shim changes.
- Module-system migration must be CommonJS-first for Node plus UMD/global browser adapters until a bundler/ESM migration is chosen.

## Checklist

- [x] 1. P1: Create a Game Process module in the main process; keep IPC as a thin adapter and test seed/options/input behavior.
- [x] 2. P0: Define and validate the preload interface; add contract version, gross payload validation, frozen listener payloads, and unsubscribe handles.
- [x] 3. P1: Add a JS shim event protocol normalizer/version seam before renderer processing; no C shim change required yet.
- [x] 4. P1: Split visual replay orchestration out of normal startup into a Replay Runner module.
- [x] 5. P1: Start renderer module extraction with small browser-loadable shared modules while preserving current script loading.
- [x] 6. P1: Make shim event processing pass through an app-event reducer/normalizer seam before DOM updates.
- [x] 7. P1: Add a Command Gateway module for player input safety and duplicate-key suppression shared by main/renderer tests.
- [x] 8. P1: Isolate prompt/menu domain rules from renderer DOM code.
- [x] 9. P1: Add a dungeon map view-model helper seam for normalized map-cell state.
- [x] 10. P2: Add status HUD helper scaffolding for status value rendering/parsing tests.
- [x] 11. P1: Turn message history into a Message Log module with bounded history and duplicate/prompt filtering.
- [x] 12. P1: Create a Tile Asset Resolver module for asset aliases, tile URLs, overlay/base logic, and manifest normalization.
- [x] 13. P1: Add asset manifest validation/normalization before renderer use.
- [x] 14. P2: Add shared fixture/replay/test helpers without weakening independent fixture assertions.
- [x] 15. P1: Treat recordings as versioned artifacts with validation before replay/save.
- [x] 16. P2: Consolidate CDP/Electron test harness utilities in a shared helper module.
- [x] 17. P1: Document/promote automation hooks as a Test Adapter with a stable version.
- [x] 18. P1: Model modal/focus state explicitly enough to keep prompt/input routing local.
- [x] 19. P2: Replace prompt regex scatter with named domain rules.
- [x] 20. P1: Separate raw shim log state from user message log state.
- [x] 21. P2: Add structured diagnostics for seams (protocol/module versions, event counts, manifest count).
- [x] 22. P2: Add a module map and practical CommonJS-to-browser migration checklist.
- [x] 23. P0: Electron security hardening: CSP, navigation/window-open/permission controls, remote-debugging guard, and sandbox assessment.

## Test plan

- Syntax/module smoke: `node -e` requires for new CommonJS modules.
- Shared module tests: `node test/shared/architecture-modules-test.js`.
- Electron tests as applicable: fixtures, UI, input safety, direction/log/prompt/map-tooltip/replay/render tests.
- Final package checks from `electron-poc`: selected `npm run test:*` commands and any blocker evidence.

## Completion evidence

The original checklist items are implemented, but follow-up architecture reviews found that two broad Modules remain intentionally incomplete decomposition work: `src/renderer.js` as the DOM Adapter choke point and `src/shared/game-view-state.js` as a deep external Interface with a broad internal Implementation. Current line counts are listed above, and `src/shared/MODULE_MAP.md` now records these deferred slices so future reviews do not overread this checklist as final renderer decomposition.

Key evidence by item:
- 1: `src/main/game-process.js` owns child lifecycle and input; `src/main.js` delegates IPC.
- 2: `src/preload.js` validates payloads, exposes `version`, freezes listener payload clones, and returns unsubscribe handles; `src/shared/preload-contract.js` is the Node-testable contract copy.
- 3/6: `src/shared/shim-protocol.js` provides `nethack-electron-shim-events/v1`; renderer handles normalized app events before DOM updates.
- 4/15/17: `src/main/replay-runner.js`, `src/shared/recording-schema.js`, and `window.__nethackAutomation.version`.
- 5/22: `src/shared/MODULE_MAP.md`, browser-global/CommonJS shared modules, and `test/shared/browser-global-contract-test.js` for renderer script-order/global Interface drift.
- 7/18: `src/shared/command-gateway.js` plus renderer `focusMode` and main duplicate-key gateway use.
- 8/19: `src/shared/prompt-rules.js` integrated by prompt helper functions.
- 9/10/12/13: `src/shared/tile-assets.js` and `src/shared/status-hud.js` scaffolding/integration.
- 11/20/21: `src/shared/message-log.js`, raw shim `shimLines` remain separate, and automation diagnostics report module versions/counts.
- 14/16: `src/shared/test-harness.js`, `scripts/lib/electron-test-harness.js`, `test/shared/architecture-modules-test.js`, and `test/shared/browser-global-contract-test.js`; existing fixture assertions remain independent. `scripts/lib/electron-test-harness.js` now exposes the deeper browser driver Interface used by `scripts/real-startup-no-blank-command-test.js`, but CDP script migration is still incremental, not complete.
- 23: `src/main/electron-security.js` plus CSP in `src/renderer.html`; remote debugging is non-packaged only, window open/navigation/permission controls are denied, and sandbox is enabled with preload kept self-contained.
