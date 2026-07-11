# Fresh Electron Architecture Implementation Checklist

Source report: `electron-poc/architecture-report-fresh.html`

Status legend: `[ ]` pending, `[x]` done, `[blocked]` blocked with evidence.

## Implementable items

1. [x] Create a shared shim game view-state module that accepts normalized shim events, owns map/menu/prompt/status/text-window state transitions, and emits high-level effects for renderer/test adapters. Implemented in `src/shared/game-view-state.js`; renderer routes shim events through it.
2. [x] Route fixture view tests through the shared shim game view-state module so fixture replay and renderer semantics share one interpretation seam. Implemented in `scripts/fixture-view-test.js` with protocol validation and shared view-state replay.
3. [x] Deepen prompt/menu rules into a shared interaction model module that turns prompt/menu state plus cached inventory choices into plain interaction descriptions. Implemented in `src/shared/interaction-model.js`.
4. [x] Use the interaction model from renderer prompt/menu adapters while preserving current prompt, menu, direction-helper, inventory, class-selection, and cancellation behavior. Renderer delegates classification/selection helpers to `interaction-model`; GUI workflow/UI tests passed.
5. [x] Move tile/cell presentation rules into a shared map presentation module that returns a cell view model for terrain classes, tile/base ids, fallback glyph, tooltip model, and ARIA label. Implemented in `src/shared/map-presentation.js`.
6. [x] Use the map presentation model from renderer cell and tooltip rendering while preserving existing CSS/data attributes and visual behavior. Renderer uses `cellViewModel` and `tooltipInfoForCell`; map tooltip/render tests passed.
7. [x] Strengthen `shim-protocol.js` into a versioned event contract with per-event normalization/validation for high-value shim events while preserving raw event diagnostics. Implemented `schemaVersion`, `valid`, `errors`, `payload`, validators, and raw event preservation.
8. [x] Validate fixture events against the shim protocol contract before view-state replay. Implemented in `scripts/fixture-view-test.js` via `ShimProtocol.parseLine` and validity assertions.
9. [x] Add a preload validator drift check/generation seam so the inline sandbox preload validators cannot silently diverge from `src/shared/preload-contract.js`. Implemented `scripts/preload-contract-drift-test.js` and wired into `npm run test:architecture`. Follow-up note: this remains a drift check, not a true generated source-of-truth; a checked-in generated preload validator block is still a safe future Locality improvement.
10. [partial] Deepen the Electron/CDP test harness enough to remove duplicated workflow mechanics from browser workflow scripts. Implemented `scripts/lib/electron-test-harness.js` with a higher-level browser driver Interface (renderer readiness, visible-element click, key input, default-character startup, intro dismissal, screenshot/output artifacts) and migrated low-risk scripts including `scripts/real-startup-no-blank-command-test.js`. Many scenario scripts still contain scenario-specific spawn/connect/evaluate logic, so further migration should happen one script at a time to avoid CDP flake and active inventory/action overlap.
11. [x] Add a browser-global contract test for the CommonJS/browser-global module-system seam. Implemented `test/shared/browser-global-contract-test.js` and wired it into `npm run test:architecture` so renderer script-order/global drift is caught before real Electron tests.
12. [x] Run relevant architecture, fixture, input safety, UI, GUI input workflow, direction/log/prompt/map-tooltip/replay/render tests and syntax/build checks; record outcomes. Completed; see `employee-result.md`.
