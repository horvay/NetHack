# NetHack Electron smoke runbook

## UXM-00 startup and evidence baseline

This checklist is agent-runnable from `/home/horvay/work/nethack/electron-poc`. Run Electron journeys sequentially because they share CDP ports, native build outputs, and NetHack lock files.

### Prerequisites

```bash
cd /home/horvay/work/nethack/electron-poc
npm install
npm run build:shim
```

The production window minimum is 960 by 720. A smaller window is unsupported. Tests may opt out only when both `NH_ELECTRON_TEST_MODE=1` and `NH_ELECTRON_ALLOW_BELOW_MINIMUM_FOR_TESTS=1` are set.

### Automated foundation checks

```bash
npm run test:ux:architecture
npm run test:ux:interaction
npm run test:screenshot-manifest
npm run test:architecture
npm run test:ui
npm run test:startup-recovery-state
```

Expected: every command exits 0. Runtime tests prove deterministic registration, duplicate-owner rejection, immutable subscriber input, mount availability, settings migration/failure behavior, and production/test window policy.

### Real startup matrix

```bash
NH_UXM00_EVIDENCE_DIR=/absolute/evidence/path npm run test:real-uxm00-baseline
```

The script launches the real Electron and shim path sequentially at:

- 1360 by 920, primary desktop
- 960 by 720, compact production minimum

For each size it must visibly prove:

1. Startup choice is open and Start new game is reachable.
2. Character creation opens from Start new game.
3. The Book of Tyr intro appears after the character is confirmed.
4. Continue closes the intro without sending a blank command.
5. A nonblank map, hero, floor, canonical welcome message, and focused game grid are visible.

The output directory contains raw full-size CDP PNGs, quarter-scale view-safe BMP derivatives, `screenshot-qc.json`, state JSON, Electron stdout/stderr, and a summary. Open and inspect every accepted derivative. Reject black or blank bands, clipping, hidden actions, stale overlays, internal copy, wrong art, or focus mismatch.

### Real keyboard regression

```bash
NH_REAL_INPUT_OUT_DIR=/absolute/evidence/path npm run test:real-input-regression
```

Expected real actions: ArrowRight sends one east movement command, `i` opens the current Equipment / Inventory screen, Escape returns to the map, the toolbar Inventory / Equipment action sends the same command, and editable prompt ownership blocks dungeon input.

### Mainstream usability scope

Per the Boss decision on 2026-07-11, do not run Orca, speech capture, accessibility-tree capture, or automated accessibility audits. Current UXM checks cover visible keyboard behavior, modal focus/trapping/return, one-Escape-one-layer, visible labels and errors, zoom, contrast/readability, non-color cues, and actual-player Electron flows.

### Zoom note

UXM-00 adds no new visible dialog or persistent surface, so it does not claim final 200 percent layout conformance. Record the browser/device scale used for evidence. Full 200 percent certification belongs to each migrated surface and UXM-08. Do not treat this note as a waiver for clipping in the required 100 percent startup matrix.

### Logs and diagnostics

For every real run preserve:

- `<evidence>/electron-stdout.log`
- `<evidence>/electron-stderr.log`
- `<evidence>/diagnostic-summary.json`
- `<evidence>/screenshot-qc.json`
- `/home/horvay/work/nethack/logs/last-run.log`, if present
- the diagnostic run summary path returned by `window.netHackPOC.activeDiagnosticRun()`

Expected teardown may report SIGTERM. Any renderer exception, failed assertion, protocol rejection, unexpected process exit, or unexplained error is blocking.
