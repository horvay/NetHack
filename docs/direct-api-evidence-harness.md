# Direct API evidence harness

This harness is the reusable proof format for direct-API implementation slices. It supports strict review without changing gameplay APIs.

## Output bundle convention

Each slice should write a clean, task-owned directory under `electron-poc/test-output/<task-name-or-run>/` containing:

- `evidence-manifest.json` and `evidence-manifest.md` from `DirectApiEvidenceScan.createEvidenceManifest()` / `writeEvidenceManifest()`.
- `events.jsonl` or equivalent command/result lifecycle evidence.
- State sidecars such as `01-before-state.json`, `02-after-state.json`, and native bridge stdout/stderr logs when relevant.
- Real Electron/MCP screenshots for player-facing behavior, with manual inspection notes in the manifest.
- `forbidden-token-scan.md` generated with `rulesForTask(<commandType>)` plus any slice-specific rules.
- `public-boundary-scan.md` generated with `scanPublicBoundaryOutputDir()`.
- `contact-sheet.html` generated with `node scripts/direct-api-contact-sheet.js evidence-manifest.json` for screenshot review.

The manifest shape is:

```json
{
  "directApiEvidence": {
    "task": "ground.transfer",
    "scenarioId": "ground/pickup-pile-on-hero",
    "screenshots": [
      {
        "path": "screenshots/01-before.png",
        "label": "Before direct transfer",
        "inspectionNotes": ["No selector prompt is visible."]
      }
    ],
    "stateSidecars": ["state/after.json"],
    "logs": ["events.jsonl"],
    "contactSheets": ["contact-sheet.html"],
    "forbiddenTokenScan": { "passed": true, "tokens": ["ground-no-pickup-prompt"] },
    "publicBoundaryScan": { "passed": true, "forbiddenFields": ["locked", "trapped"] },
    "reviewNotes": ["Ground row moved by public name only."]
  }
}
```

All paths in the manifest are safe relative paths so bundles can be copied into Run Evidence without leaking local paths.

## Field-scoped forbidden-token scans

Use `electron-poc/src/shared/direct-api-evidence-scan.js` rather than ad-hoc grep:

```js
const EvidenceScan = require('../src/shared/direct-api-evidence-scan');
const rules = EvidenceScan.rulesForTask('terrain.action', [
  { id: 'slice-no-custom-hidden-route', field: 'command', regex: '^custom-hidden-key$' },
]);
const scan = EvidenceScan.scanOutputDir('test-output/direct-terrain-action', rules);
```

Rules are scoped to JSON fields such as `name`, `command`, `text`, or `payload`. Do not scan bare map glyphs such as `>` or `<`; the provided terrain rules only fail when those glyphs appear in a routed `command` field.

## Public-boundary checks

`scanPublicBoundaryOutputDir()` recursively scans public command/result/snapshot evidence fields for forbidden hidden keys and hidden action tokens, including `locked`, `trapped`, `broken`, `contents`, `buc`, `cursed`, `blessed`, `charges`, `otyp`, `spe`, object-chain pointers, and monster internals.

It is intentionally field-scoped to public evidence roots (`payload`, `result`, `snapshot`, `items`, `inventory`, `equipment`, `ground`, `container`, `map`, `status`, etc.) so private developer notes do not become the API contract.

## Scenario catalog

`DirectApiEvidenceScan.scenarioIdsForTask(task)` documents existing safe scenario fixtures for initial slices:

- `ground.transfer`: ground pickup and unidentified public appearance piles.
- `equipment.change`: Valkyrie equipment, ring placement, ring/armor/offhand blockers.
- `container.force`: locked/trapped and force-destroy container fixtures.
- `item.use`: rub candidates and gray-stone public-boundary fixtures.
- `terrain.action`: stairs/up-ladder and fountain current-cell fixtures; ladder-down and sink routes stay deferred until separate real-proof fixtures land.

The harness test validates every catalog entry against `electron-poc/test/scenarios/<id>.json`, including safe ID shape, v1 schema, and JSON `id` match. Add new scenarios only when existing fixtures cannot support the slice, and then follow `.pi/skills/nethack-scenario-fixtures/SKILL.md` with positive and negative loader coverage.

## Commands

From `electron-poc/`:

```bash
npm run test:direct-api-evidence-harness
npm run test:direct-api-foundation
npm run test:scenario-loader
npm run test:architecture
npm run test:workstream-b-public-boundary
```

Real implementation slices still need their own gameplay tests and real Electron/MCP screenshots per `TESTING.md`; this harness only standardizes the artifact shape and scans.
