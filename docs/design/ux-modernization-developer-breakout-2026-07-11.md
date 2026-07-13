# NetHack UX modernization developer breakout master plan

**Plan ID:** UXM-2026-07-11
**Date:** 2026-07-11
**Status:** Approved-plan implementation specification, no implementation in this document
**Source audit:** [`ux-modernization-audit-2026-07-09.md`](./ux-modernization-audit-2026-07-09.md)
**Scope:** `electron-poc`, player-facing Electron gameplay experience
**Master-plan title to cite in every handoff:** **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**
**Final UX conformance reviewer:** **Glimmer**

## 1. Authority, intent, and use

The Boss approved implementation of the complete safe UX plan in the 2026-07-09 audit. This document is the authoritative developer breakout for all remaining work. It converts all 31 `SAFE-*` recommendations into substantial implementation chunks with explicit ownership, dependencies, contracts, proof, and review gates.

When this plan and an older implementation note disagree about presentation, this plan controls. NetHack core behavior, public protocol truth, `AGENTS.md`, `TESTING.md`, and `ASSET_GENERATION.md` remain higher-order constraints. A developer may refine implementation detail but may not remove a requirement, broaden gameplay powers, infer hidden facts, or silently change a shared contract.

This document does not authorize the mechanics-affecting ideas that the source audit explicitly excluded. It also does not implement any chunk.

### 1.1 Plan decision and change record

| Date | Decision | Scope and consequence |
|---|---|---|
| 2026-07-11 | The Boss decided that blind and screen-reader play, including Orca, is out of scope for this modernization and is **not deferred**. | The former deferred certification backlog item is deleted. All requirements and evidence gates for screen-reader operation, spoken output, virtual-cursor behavior, ARIA/speech certification, accessibility-tree or CDP AX inspection, automated screen-reader/AX audits, dedicated polite/assertive announcement channels, and live-announcement certification are removed. `SAFE-29` now covers only mainstream keyboard operation, modal focus entry/trap/return, visible focus, one-Escape-one-layer behavior, clear visible labels and action order, and singular input ownership. Visual readability, contrast, non-color cues, responsive layout, and 200 percent zoom remain ordinary sighted-player usability requirements under their applicable chunks; they are not screen-reader commitments. `PlayerNotice` still requires coherent visible deduplication. This decision removes the work rather than postponing it and supersedes all earlier accessibility scope language. |
| 2026-07-11 | The Boss decided that the illustrated full-character paper doll remains a prominent visual centerpiece of the equipment experience. It must not be replaced by a plain equipment-only list or removed to solve layout problems. | UXM-05 must fix the observed inventory truncation and paper-doll crowding through a wider inventory workspace, two-line item names, a stable selected-item detail/action pane, useful filters, reserved callout rails, high-contrast non-overlapping slot cards, and deliberate full/compact modes. Compact mode may use tabs or stacking, but its Equipment view still retains a prominent scaled full-character portrait/paper doll. UXM-06 consumes the same item-row allocation, and UXM-08/UXM-09 must reject cut-off names, unreadable metadata, overlapping callouts, obscured art, hidden actions, or horizontal scrolling. This decision supersedes any wording that could permit replacing the illustration with only a semantic slot list. |

### 1.2 Effect on the prior Glimmer UXM-01 rejection

The Boss's scope decision invalidates **Glimmer UXM-01 rejection finding 1** in full. The missing accessibility-tree/automated-AX evidence, dialog-description concern, and every AX or live-announcement evidence gate cited by that finding are no longer acceptance requirements and must not be returned to the UXM-01 developer.

Rejection findings 2 through 8 remain applicable only insofar as they concern, respectively: mainstream modal focus behavior and correct return targets; real stale-state preservation/disablement; an actual visible `Game saved` result; truthful real-game evidence; complete clean QC and explainable logs; accepted visual quality; and chunk/file ownership. Those findings remain blockers until resolved through the normal Glimmer revision loop. No removed criterion may be reintroduced while closing them.

## 2. Product vision

Create a modern desktop NetHack interface that makes the hero, immediate situation, known dungeon, and latest consequence easy to understand while preserving the game's uncertainty, irreversible decisions, turn economy, discovery, and expert command speed.

The interface should feel like NetHack made legible, not a different roguelike placed over NetHack. New players should recognize what can be done and what just happened. Experienced players should retain keyboard fluency, counts, selectors, and command access without extra confirmation or animation delays. The renderer explains only facts the core has made public.

### 2.1 Non-negotiable shared UX principles

1. **The core owns truth.** Renderer presentation models consume public NetHack or no-spoiler adapter facts. They do not infer identity, legality, outcome, damage, range, attitude, trap state, container state, prices, or final statistics from assets, regex guesses, or stale UI.
2. **Unknown remains unknown.** Use `Unknown` only when the absence itself is useful. Otherwise omit unavailable facts. Never resolve an appearance into an identity.
3. **GUI actions are alternate inputs.** Every action uses the same core command, prompt ownership, interruption behavior, cancellation, and turn cost as classic input.
4. **Selection is turnless.** Selecting a row, map cell, slot, filter, tab, or command preview does not send gameplay input.
5. **Dispatch is explicit.** A turn-spending action requires a named activation. Do not make ordinary map clicks, row selection, focus, hover, or onboarding cues dispatch commands.
6. **Classic efficiency is first-class.** Preserve arrows, `hjklyubn`, command letters with case, counts, menu letters, `#` commands, and Escape. GUI work must not add latency to classic input.
7. **One owner at a time.** A prompt, dialog, transfer, palette, context menu, or targeting mode has one input owner. One Escape dismisses or cancels exactly one top layer and never leaks into the dungeon.
8. **Outcomes, not transport.** Player chrome says `Your turn`, `Choose an item`, `Game saved`, or a useful failure. Protocol, selector, revision, PID, snapshot, bridge, and command-key diagnostics stay in diagnostics.
9. **Map first in actual layout.** The persistent shell gives the map, urgent hero state, contextual actions, and latest consequences priority over static attributes, version information, and general command chrome.
10. **Recognition before recall, acceleration after recognition.** Use names and explicit verbs as primary copy. Shortcuts are secondary keycaps and accelerators.
11. **Usable by construction.** Mainstream keyboard operation, focus entry and return, visible focus, clear labels and action order, non-color cues, 200 percent text zoom, and reduced motion are component contracts, not final polish.
12. **Responsive means intentional desktop modes.** Support full desktop and a declared compact desktop mode. Do not claim mobile support.
13. **Motion confirms state and never paces turns.** Use transform and opacity only, brief durations, no blocking choreography, and a complete reduced-motion path.
14. **Canonical messages remain canonical.** Presentation may classify or group exact lines, but it does not replace, discard, or rewrite the source log.
15. **Failure is visible and safe.** Do not automatically retry a command that could spend a turn. Preserve safe selection and scroll state, explain what changed, and place technical details behind diagnostics.
16. **Dense does not mean flat.** Urgent state and current consequence outrank static facts. Avoid nested cards, excessive pills, decorative gradients, and unrelated gold primary treatments.
17. **No new generated assets by default.** This effort is primarily layout and interaction. If a chunk genuinely needs a new tile, icon, or audio asset, obtain approval and follow `ASSET_GENERATION.md`, including full transparency and tracker QA where applicable.
18. **Illustrated equipment, legible inventory.** Keep the full-character paper doll prominent in Equipment. Solve density with reserved callout rails, selection-linked details, wider inventory rows, filters, and structural tabs or stacking, never by covering/removing the art or compressing names and actions into chip-filled rows.

## 3. Current-state baseline

### 3.1 Repository snapshot inspected

- Working tree was clean when this plan was written.
- Baseline commit: `6393d2a7e4265d1b6a0b4e142899f790a562ebff`, `Add Electron gameplay UI, direct APIs, and generated tileset`, committed 2026-07-11.
- `electron-poc/src/renderer.js`: 10,435 lines and approximately 598 KB. It still owns most DOM rendering and workflow choreography.
- `electron-poc/src/renderer.html`: 387 lines. It contains the shell, permanent quick actions, all-in-one Actions dialog, native dialogs, and the non-dialog container transfer section.
- `electron-poc/src/styles.css`: 1,325 lines. Hard-coded values still dominate; there is no reduced-motion query.
- `electron-poc/src/main.js`: 128 lines. `BrowserWindow` has requested dimensions but no minimum dimensions.
- Shared public-state foundations remain strong: `ui-protocol-v2.js`, inventory/equipment/ground/container adapters, command and transfer transaction models, `game-view-state.js`, `map-presentation.js`, `status-hud.js`, and `message-log.js`.
- The CommonJS plus frozen browser-global seam in `src/shared/MODULE_MAP.md` is still the required module pattern. Do not introduce a bundler as incidental UX work.
- The package exposes extensive fixture and real Electron scripts. Player-facing work remains subject to `TESTING.md`: real gameplay input, screenshots, and personal inspection are mandatory.

### 3.2 Improvements already present or added around the audit

Do not reimplement these as if absent:

- Public-state contextual actions, typed direct terrain/container/equipment routes, public inventory/equipment/ground/container snapshots, and transfer transaction tracking exist and must be reused.
- The shared Electron test harness now has `createElectronBrowserDriver().startDefaultGame()`, which handles the required startup-choice dialog before character confirmation. The older `real-input-regression-test.js` still bypasses that helper and still assumes `#start-shim` opens character creation directly, so the audit's regression-driver fix remains incomplete.
- Shop payment is partially specialized beyond the audit screenshot: current code recognizes a shop menu, renders `Bill summary`, uses `Pay selected`, shows row `Pay` labels, reports a selected total, and has real sufficient/insufficient-funds evidence. Remaining work includes authoritative available gold and remaining debt where public, removing residual generic status ownership, preserving partial-payment semantics, and consolidating this into the shared shop/interaction contracts.
- Container and ground transfers have real direct flows, stable public IDs, optimistic state reconciliation, interruption handling, and accepted view-safe evidence. The transfer surface is still a fixed `<section>`, tells players primarily to drag, lacks explicit keyboard transfer actions, and exposes selector-oriented labels.
- Menu letters, Shift+F10, centralized top-layer Escape routing, named choices, prompt filtering, and some arrow navigation already exist. They are foundations, not completion of the typed dialog/focus program.
- Spell/skill rows already parse and show some level, Pw, failure, rank, and advancement fields. The remaining recommendation is consistent entry, explanation, and typed public data migration.

### 3.3 Remaining baseline problems confirmed in current files

- `setStatus()` still accepts arbitrary low-level text, with many calls such as `version check passed`, `command transaction accepted`, `container transfer panel ready`, and `sent direct terrain.action`.
- The header still exposes Smoke check and TTY controls in ordinary chrome and starts with `initializing`.
- The permanent quick ribbon and context ribbon duplicate actions. The all-in-one Actions dialog remains static HTML with commands below the fold.
- Character name still defaults and falls back to `Electron`; seed and recording remain primary fields.
- `tooltipInfoForCell()` still includes asset category, glyph number, and map coordinates.
- `targetPreviewDetails()` still describes line, route, and validity placeholders and exposes raw cursor path language.
- The Boss-provided 1139x765 current-state screenshot shows the equipment illustration as valuable product character but the surrounding absolute slot cards overlap and cover the character, clip at the viewport edges, compete with one another, and obscure equipment text. The fix is reserved anchored callout placement around the full visible illustration, not removal of the paper doll.
- The same screenshot shows an inventory column starved of width: nearly every item name is ellipsized, category/BUC/charges/equipment chips collide with row actions, and actions become inconsistent small trailing controls. Inventory still combines row selection, double-click, drag, right-click, Shift+F10, selector key, and trailing action without a stable selected-item detail pane.
- Item inspect still lacks a truthful structured details contract.
- Status groups still include attributes, gear, and System/Version in the persistent HUD.
- `message-log.js` stores only strings; the visible recent panel renders up to 80 lines rather than a compact consequence view.
- `interaction-options` is permanently a listbox even when it contains checkboxes, commands, directions, forms, or read-only content.
- Final-state rendering still depends partly on cached status and message parsing, and unavailable fields can become `(hidden)` through `allStatusStats()`.
- There is no product or design canon file. `PRODUCT.md` and `DESIGN.md` must be established through stakeholder-confirmed content, not guessed by an implementer.

### 3.4 Baseline requirement status

Unless marked partial above, every `SAFE-*` recommendation is unimplemented as a complete acceptance unit. Existing foundations do not permit a developer to mark a recommendation done without the visible behavior, applicable sighted-player usability, real Electron proof, and Glimmer sign-off required here.

## 4. Global product and interaction contracts

All chunks must use these contracts. UXM-00 and UXM-01 own their concrete definitions. Later chunks consume them rather than creating local variants.

### 4.1 Shared terminology and copy rules

| Concept | Required player copy | Do not show in normal UI |
|---|---|---|
| Ready state | `Your turn` | `Ready`, `map ready`, PID, bridge state |
| Core item choice | `Choose an item` | selector, revision, snapshot |
| Direction choice | `Choose a direction` | key sequence sent |
| Renderer read-only dismissal | `Close` | `Close / Back` unless hierarchical |
| NetHack prompt dismissal | `Cancel` plus optional `Esc` keycap | `Ignore` when cancellation is intended |
| Hierarchy navigation | `Back` | `Close` if returning to parent |
| NetHack text acknowledgement | `Continue` | implementation explanation about key presses |
| Transfer from container | `Take` | source/destination transaction language |
| Transfer to container | `Put in` | selector and transfer request wording |
| Ground to inventory | `Pick up` | take from source |
| Inventory to ground | `Drop` | move to destination |
| Shop multi-payment | `Pay selected` | transfer selected |
| Save lifecycle | `Save and exit` | save slot, autosave, duplicate save |
| Dangerous action group | `Dangerous actions` | generic `More` without danger meaning |
| Inspect mode | `Inspect` or `Look` | raw map coordinates or glyph IDs |
| Unavailable fact | omit, or `Unknown` when comparison needs alignment | `(hidden)`, guessed value |

Copy must be concise, player-facing, and use sentence case. Preserve canonical NetHack terms such as quaff, wield, BUC, AC, Pw, and Dlvl where they aid experienced play, but pair uncommon verbs with searchable aliases. Do not expose composed internal routes such as `rf`, `wf`, or `#namef`. Respect command case.

### 4.2 Required presentation contracts

#### `PlayerNotice`

```text
id, kind(info|success|warning|error), message, actionLabel?, action?,
source(result|prompt|recovery|presentation), persistence(transient|until-state-change|sticky),
dedupeKey?, diagnosticRef?, createdAt
```

Only prompt ownership, player-actionable lifecycle, confirmed outcome, or failure may create a notice. Low-level effects may emit diagnostics but may not write player chrome directly.

#### `CommandDefinition`

```text
id, label, aliases[], category, publicShortcut?, internalRoute,
promptPlan(none|item|direction|target|text|core-owned), danger(none|caution|serious),
availability(always|public-context|core-prompt-only), unavailableReason?, recentEligible
```

`internalRoute` is never displayed. Availability must come from public state. Unknown prerequisites mean omit or `NetHack will ask`, not a renderer claim.

#### `DialogSpec`

```text
id, family(single-select|multi-select|command|form|confirmation|document|transfer),
title, visibleDescription?, initialFocus, returnFocus, escapePolicy,
primaryAction?, secondaryActions[], closeKind(close|cancel|back|continue|blocked)
```

A dialog family owns keyboard behavior, visible labels and action order, focus trap, and restoration. Content adapters do not override these ad hoc.

#### `ItemPresentation`

```text
stableId, selectorAccelerator?, icon, displayName, appearance?, calledName?, quantity,
filterGroups[](equipped|weapons|armor|consumables|magic), equippedState?, ownership?,
equipmentSlots[], knownState, knownFields{}, actions[], blockedActions[]
```

The adapter must preserve identity versus appearance, pluralization, user naming, artifact naming, corpses, statues, shop ownership, and unknown fields. `filterGroups` come only from public/core item classification; an unavailable class stays only in All and is never inferred from an unidentified appearance. Renderer text parsing is fallback-only and cannot enrich knowledge.

All consumers use one allocation rule. A list row contains selector keycap when public, icon, full name wrapping to at most two lines, quantity, and only essential equipped or ownership state. Category, BUC, charges, other known facts, blockers, compare values, and actions belong in the stable selected-item details/action pane, not a chip pile in the row. Full inventory exposes All, Equipped, Weapons, Armor, Consumables, and Magic filters; compact mode may wrap the filter bar or use a labeled filter menu without horizontal scrolling or losing keyboard search aliases.

#### `MessageEvent`

```text
id, canonicalText, sequence, turn?, category?, severity?, actorRef?, targetRef?, source,
classificationConfidence(typed|conservative|unclassified)
```

Canonical text is immutable. Unclassified is valid and must remain visible. Repetition may be grouped only with an exact reversible count and exact turn data.

#### `MapInspectorModel`

```text
selectedCell, publicLabel, publicLayers[], publicAttitude?, publicActions[],
distance?, mode(inspect|target|travel), validation(core-will-validate|confirmed-legal|confirmed-illegal)
```

Diagnostics such as glyph, asset taxonomy, and coordinates are separate and disabled in player mode.

#### `FeedbackEvent`

```text
id, outcomeKey, causationId?, sequence, turn?, publicRevision?, source(typed-result|typed-state|presentation),
kind(item-moved|hp-changed|status-changed|target-selected|level-changed|prompt|danger|game-over),
confirmed, publicRefs[], severity?, soundRole?, motionRole?, replayPolicy(live-only|allow-replay)
```

Only confirmed public events can trigger sound or consequence motion. `outcomeKey` is the mandatory canonical semantic-outcome key. Slot 4 result producers emit a stable public `outcomeId`; related status/map/inventory reducers propagate it as `causedByOutcomeId`, and every corresponding `FeedbackEvent` uses that value as `outcomeKey`. A state-only outcome uses one deterministic run/turn/revision/kind/public-reference key generated by the state adapter. Source precedence is `typed-result` over `typed-state` over `presentation`. Lower-precedence events are held in a non-blocking 50 ms coalescing buffer; a higher-precedence event with the same `outcomeKey` replaces it, regardless of arrival order. Once presented, all later representations of that key are suppressed. The feedback adapter keeps bounded presented-outcome and event-ID sets plus latest sequence/revision per source. Live rerender, authoritative snapshot recovery, app reconnect, replay playback, duplicate delivery, and a typed result plus state update for the same outcome must not repeat feedback unless `replayPolicy` explicitly permits it. Game-over, danger, HP, and movement feedback default to `live-only`. The coalescing buffer delays feedback only, never game input or state rendering.

### 4.3 Global state-transition rules

- `idle -> prompt-owned -> submitted -> awaiting-core -> completed|rejected -> idle` is the normal action lifecycle.
- While `awaiting-core`, prevent duplicate activation. Do not lock classic input beyond existing prompt ownership.
- Renderer-only surfaces use `closed -> opening -> open -> closing -> closed`. Opening and closing do not spend turns.
- A stale public revision moves the surface to `needs-refresh`, preserves safe selection by stable ID, and requires explicit retry.
- Transfer uses `open -> row-selected -> pending -> confirmed|rejected|interrupted`. A second transfer is disabled during `pending`.
- Targeting uses `inactive -> selecting -> selected -> submitted -> core-result`. Selection visuals never claim legality without typed metadata.
- Onboarding uses `not-started -> cue-1..cue-4 -> completed|skipped|disabled`. It suspends while any core prompt or higher dialog owns input.
- Game over is terminal for the run. Escape remains blocked only with visible New game and Exit actions.

### 4.4 Persistence contract

UXM-00 must introduce one versioned presentation settings document, with migration from `nethack-electron-poc-settings-v1`:

```text
schemaVersion: 2
contextualMenus: boolean
autoLootGold: boolean
onboarding: { completed: boolean, disabled: boolean, lastStep: string }
hudDensity: compact|detailed
keyHints: contextual|always|never
map: { mode: full|follow, scale: number, glyphOverlay: boolean, highContrast: boolean }
motion: system|reduced|full
sound: { uiEnabled: boolean, gameFeedbackEnabled: boolean, volume: number }
```

Rules:

- Presentation settings are local and must not enter NetHack save semantics.
- NetHack options remain separate and allowlisted.
- Restored games suppress onboarding by default.
- Storage parse failure uses safe defaults, records diagnostics, and shows at most one non-blocking warning per session.
- Storage write failure does not block gameplay. Keep the current session value and explain that the preference could not be saved.
- New optional sound defaults off until approved assets and licensing are installed. Reduced motion follows the OS when set to `system`.

### 4.5 Global visual, layout, and sighted-player usability requirements

- Declare a restrained dark dungeon palette with tinted neutrals and one gold action accent. Semantic danger, warning, success, info, focus, and selection roles are separate tokens.
- No pure black or pure white tokens. Body copy must meet WCAG AA contrast. Focus, small labels, and urgent states require direct checks.
- Product UI labels use a system sans stack. Canonical messages and raw manual text may use a readable mono stack. Intro and final chronicle may retain restrained serif display treatment.
- Body prose stays within 65 to 75 characters where applicable.
- Avoid nested cards and pill saturation. Use rows, sections, separators, and whitespace for hierarchy.
- Every interactive component has default, hover, focus, active, disabled, loading, selected, warning, and error states where relevant.
- Pointer targets are at least 44 by 44 CSS pixels when space permits; dense expert rows may be smaller only with full keyboard equivalence and at least 32 pixel row height.
- Item surfaces reserve row width for selector, icon, a name of up to two lines, quantity, and essential equipped/ownership state. Secondary facts and consistently sized primary/secondary action buttons live in a stable details pane.
- Equipment keeps the full-character illustration visible and prominent. Opaque and high-contrast slot callouts occupy reserved perimeter rails outside the character-safe area, never overlap one another or the art, and link selection to the shared details pane.
- `PlayerNotice` presents ordinary outcomes and actionable errors visibly in one coherent layer. Repeated effects for the same outcome or transaction deduplicate by stable identity rather than message text; maps and rerendered lists do not duplicate notices.
- Mainstream keyboard conformance requires deterministic modal focus entry/trap/return, visible focus, one-Escape-one-layer behavior, clear visible labels and action order, and singular input ownership.
- Full desktop target: 1360 by 920. Declared minimum and compact target: 960 by 720. Test 200 percent text zoom at both where technically possible as ordinary sighted-player usability.
- At compact size, no horizontal page scroll, unreachable dialog actions, clipped map, overlapping slot text, or off-screen close action is allowed.
- Motion is 150 to 200 ms, transform/opacity only, non-blocking, and removed under reduced motion.

## 5. Architecture, ownership, and integration policy

### 5.1 Dependency direction

```text
NetHack/shim public facts
  -> shared protocol and snapshot reducers
  -> domain presentation models
  -> reusable interaction and focus primitives
  -> renderer controllers
  -> DOM and component styles
```

Do not add domain parsing to `renderer.js`. New pure modules use the existing CommonJS plus frozen `window.NetHack*` browser-global pattern and get Node contract tests.

### 5.2 Central-file policy

`renderer.js`, `renderer.html`, `styles.css`, `main.js`, `ui-protocol-v2.js`, and `game-view-state.js` are high-conflict files. Ownership is:

- UXM-00 exclusively owns the first structural pass over `renderer.js`, `renderer.html`, `styles.css`, and `main.js` until it records a green, Glimmer-approved handoff baseline.
- UXM-00 must create predeclared mount points, a UX runtime/registry, preloaded module slots, and per-domain stylesheet files so later chunks do not need central-file edits for routine work.
- From the UXM-00 green baseline until UXM-01 Glimmer approval, UXM-01 has the exclusive second-pass lock on `renderer.js`, `renderer.html`, and `styles.css` for dialog/status/focus/visible-notice wiring only. It may not edit `main.js` or unrelated domains. Its handoff must rerun architecture, browser-global, prompt lifecycle, menu-letter, Escape, modal stability, and UI suites. Those three central files freeze when UXM-01 is approved.
- After UXM-01, central files are frozen for parallel developers. A developer who needs a central hook submits a small integration request to UXM-09 instead of editing the file.
- UXM-09 is the sole late-stage integration owner for central-file adjustments, deletion of compatibility fallbacks, script order, and conflict resolution.
- Protocol owners may edit `ui-protocol-v2.js` and `game-view-state.js` only in their sequenced protocol phase. UXM-09 resolves any overlap in the order specified below.

### 5.3 Planned scaffold and module ownership

UXM-00 should predeclare these paths. Names may change only before parallel work begins.

| Owner | Exclusive production paths after UXM-00 |
|---|---|
| UXM-00 | `src/ux/runtime.js`, `src/ux/settings-store.js`, `src/ux/app-mounts.js`, `src/ux/styles/tokens.css`, `src/ux/styles/base.css`; `renderer.js`, `renderer.html`, `styles.css`, `main.js` only until UXM-00 green handoff |
| UXM-01 | `src/ux/focus-layer.js`, `src/ux/dialog-shell.js`, `src/ux/player-notice.js`, `src/ux/failure-presentation.js`, `src/ux/styles/interaction.css`; exclusive `renderer.js`, `renderer.html`, `styles.css` second-pass lock from UXM-00 handoff through UXM-01 approval |
| UXM-02 | `src/ux/app-shell.js`, `src/ux/status-presentation.js`, `src/ux/message-presentation.js`, `src/ux/consequence-feed.js`, `src/ux/character-sheet.js`, `src/ux/styles/shell.css` |
| UXM-03 | `src/ux/command-catalog.js`, `src/ux/command-palette.js`, `src/ux/help-center.js`, `src/ux/onboarding.js`, `src/ux/character-creation.js`, `src/ux/styles/discovery.css` |
| UXM-04 | `src/ux/map-inspector.js`, `src/ux/target-presentation.js`, `src/ux/context-action-presentation.js`, `src/ux/styles/map.css`, additive map/target protocol fixtures |
| UXM-05 | `src/ux/item-presentation.js`, `src/ux/item-detail-panel.js`, `src/ux/equipment-screen.js`, `src/ux/styles/items.css`, additive item protocol fixtures |
| UXM-06 | `src/ux/transfer-dialog.js`, `src/ux/shop-bill.js`, `src/ux/styles/transfer.css` |
| UXM-07 | `src/ux/run-lifecycle.js`, `src/ux/final-chronicle.js`, `src/ux/styles/run-lifecycle.css`, additive final-run protocol fixtures |
| UXM-08 | `src/ux/responsive-controller.js`, `src/ux/feedback-adapter.js`, `src/ux/styles/responsive.css`, `src/ux/styles/feedback.css`, approved audio assets if any |
| UXM-09 | central files after freeze, `src/shared/MODULE_MAP.md`, package scripts, system smoke/evidence orchestration |

Each owner also owns focused tests named for its modules. Existing tests may be updated only by the chunk whose behavior they cover. Shared broad regression scripts are UXM-09-owned after Wave 0.

#### Existing shared-file lock table

| Existing path | Authorized owner and lock window | Required handoff baseline |
|---|---|---|
| `src/shared/interaction-model.js`, `prompt-rules.js`, `public-blockers.js` | UXM-01 only after UXM-00; frozen after UXM-01 Glimmer approval | architecture, browser-global, prompt lifecycle, menu-letter, Escape suites green |
| `src/shared/status-hud.js`, `message-log.js` | UXM-02 only | focused module tests plus browser-global contract green |
| `src/shared/character-options.js` | UXM-03 only | all legal-combination tests and startup tests green |
| `src/shared/map-presentation.js` | UXM-04 only | tooltip, layer, terrain, and performance tests green |
| `src/shared/inventory-action-service.js`, `inventory-snapshot-adapter.js`, `equipment-snapshot-adapter.js` | UXM-05 only | snapshot, blocker, direct-equipment, and no-spoiler tests green |
| `src/shared/transfer-transaction-model.js`, `ground-pile-snapshot-adapter.js`, `container-contents-snapshot-adapter.js` | UXM-06 only after the UXM-05 reduced item API is integrated | transfer lifecycle, selector-remap, ground/container snapshot, and public-boundary tests green |
| `src/main/recovery-state.js` | UXM-07 only | recovery-state and startup-choice tests green |
| `src/shared/ui-protocol-v2.js`, `game-view-state.js`, `shim-protocol.js`, `shim-bridge/nh-shim-bridge.c` | Serialized protocol lock only: slot 1 UXM-05 item fields; slot 2 UXM-03 spell/skill rows; slot 3 UXM-04 target metadata; slot 4 UXM-02 structured result events; slot 5 UXM-07 final-run payload | after every slot: commit/baseline identifier recorded, all valid/invalid golden fixtures, browser-global, game-view, command/transfer, replay, native envelope, bridge build, and real acceptance/rejection proof green before next slot starts |
| `test/fixtures/ui-protocol-v2/valid-events.json`, `invalid-events.json`, `replay-recording.json`; `scripts/ui-protocol-v2-golden-test.js`, `menu-metadata-comparison-test.js`, `recording-schema-replay-adapter-test.js`, `native-ui-command-envelope-test.js`, `bridge-semantic-action-metadata-test.js`, and cross-slot game-view/replay protocol harnesses | Same exclusive active protocol-slot owner and same slot window as the production files above. No parallel developer edits these shared fixtures/harnesses. Domain-specific new fixture files remain with the domain owner. | fixture/harness diff listed explicitly; full golden, invalid, native, game-view, recording, and replay suite green before lock handoff |
| `src/main/game-process.js`, `src/preload.js`, `src/shared/preload-contract.js` | No chunk edits by default. If protocol transport requires them, the active serialized protocol-slot owner obtains an integration lock and updates drift/IPC tests in the same slot | preload drift, IPC, process lifecycle, and security tests green |
| `scripts/lib/electron-test-harness.js` | UXM-00 through baseline approval, then UXM-09 only | harness contract and migrated real-input regression green |
| Existing domain test scripts | Owning chunk only during its active wave | exact before/after test list in handoff |
| Broad package scripts, `src/shared/MODULE_MAP.md`, `package.json` | UXM-00 for scaffold additions, then UXM-09 only | architecture and package-script smoke green |

A protocol slot begins only from the recorded green handoff baseline of the prior slot. The active owner has an exclusive lock on all protocol/bridge production files and shared protocol fixtures/harnesses named above. Other developers continue only in their exclusive `src/ux/*`, CSS, fixtures, and focused test paths. UXM-09 resolves an emergency cross-domain hook; developers do not bypass this table.

### 5.4 No unsafe parallel integration

- Work may be developed in parallel only after UXM-00 and UXM-01 are integrated and Glimmer-approved.
- UXM-00 predeclares versioned provider APIs for shell regions, catalog entries, context actions, run-lifecycle actions, notices, and public-state subscriptions. UXM-03 can implement and test the palette against registered providers without waiting for UXM-02, UXM-04, or UXM-07 code.
- **Wave 2A, parallel domain development:** UXM-02, UXM-03, UXM-04, UXM-05, and UXM-07 build only their exclusive modules/styles/focused fixtures from the same approved UXM-01 baseline. They may not edit serialized shared protocol files.
- **Wave 2B, serialized protocol integration and chunk completion:** slot 1 UXM-05 item fields; slot 2 UXM-03 spell/skill rows; slot 3 UXM-04 targeting metadata; slot 4 UXM-02 structured result events; slot 5 UXM-07 final-run payload. Each slot starts from the previous green baseline, runs its full handoff suite, and obtains Glimmer chunk approval before the next slot edits shared protocol files.
- UXM-06 begins in Wave 3 only after UXM-05's reduced `ItemPresentation` API and protocol slot are integrated. It does not depend on all optional compare fields being populated.
- UXM-03 owns Save/Quit catalog definitions and existing dispatch equivalence. UXM-07 later registers lifecycle metadata/results through the predeclared provider API without editing UXM-03 files.
- UXM-02 owns the shell mount implementation; all mount IDs and provider interfaces are predeclared by UXM-00 so its parallel work does not block other module development.
- UXM-08 begins only after all visible surfaces and all five protocol slots have landed. It is a conformance and feedback pass, not a place to redesign workflows.

### 5.5 Progressive integration and review baselines

UXM-09 has two operating phases so review is not circular:

1. **UXM-09A, progressive staging integration:** after UXM-01, the UXM-09 integration owner creates a disposable review baseline for each domain candidate or serialized protocol slot. This baseline includes the candidate, required provider wiring, and the removal/disablement of the exact compatibility presenter it replaces. It is not yet the approved integration baseline.
2. Glimmer reviews the candidate on that merged review baseline, including code/diff and real visual evidence. If rejected, UXM-09A discards or rolls back the staging delta and the same domain developer revises. UXM-09A then stages the replacement revision.
3. When Glimmer approves the merged candidate and compatibility-removal delta, UXM-09A promotes it to the recorded approved integration baseline. The next chunk starts from that baseline.
4. The five serialized protocol slots use the same staging, review, promote sequence. No later slot starts from an unapproved staging baseline.
5. After UXM-02 through UXM-07 are promoted and all replaced compatibility UI is removed, UXM-08 runs against the final-surface approved baseline. UXM-09A stages and promotes UXM-08 revisions through the same Glimmer loop.
6. **UXM-09B, final certification:** after UXM-08 promotion, UXM-09 runs system smoke, traceability, evidence certification, and final Glimmer sign-off. UXM-09B may remove only dead code proven unreachable without changing the DOM or behavior; any material surface change returns to the owning developer and repeats staging review.

Every review baseline and approved baseline gets an identifier, parent identifier, included chunk revision, protocol-slot number if relevant, test summary, and Glimmer decision. This is the authoritative handoff chain.

## 6. Chunk roster and delivery waves

| Chunk | Name | Priority | Primary recommendations | Depends on | Parallel status |
|---|---|---:|---|---|---|
| UXM-00 | Canon, runtime scaffold, settings, and evidence baseline | P0 | cross-cutting, SAFE-30 minimum guard, evidence quick win | none | Wave 0 alone |
| UXM-01 | Interaction foundation, notices, failures, focus, and dialog semantics | P0 | 04, 06, 21, 22, 23, first slice 29 | UXM-00 | Wave 1 alone |
| UXM-02 | Map-first shell, compact HUD, messages, consequences, transitions | P0/P1 | 05, 18, 20, 26, 27 | UXM-01 | Wave 2A domain work, Wave 2B protocol slot 4 and approval |
| UXM-03 | Command discovery, onboarding, creation, help, movement, spells/skills | P1 | 01, 02, 03, 07, 08, 09, 19 | UXM-01 | Wave 2A domain work, Wave 2B protocol slot 2 and approval |
| UXM-04 | Map inspection, truthful targeting, legibility, creature context | P0/P1 | 10, 11, 12, 25 | UXM-01 | Wave 2A domain work, Wave 2B protocol slot 3 and approval |
| UXM-05 | Illustrated equipment, readable inventory, item details/comparison | P0/P1 | 13, 14, 16, 17 | UXM-01 | Wave 2A domain work, Wave 2B protocol slot 1 and approval |
| UXM-06 | Keyboard transfer and shop transaction UX | P0/P1 | 15, 24 | UXM-01, integrated UXM-05 item API | Wave 3 |
| UXM-07 | Save/restore and authoritative final chronicle | P0/P1 | 28 | UXM-01 | Wave 2A domain work, Wave 2B protocol slot 5 and approval |
| UXM-08 | Responsive, keyboard, visual-usability, motion, and optional sound conformance | P0/P3 | completion of 29, plus 30 and 31 | UXM-02 through UXM-07 | Wave 4 |
| UXM-09 | Progressive integration plus system regression certification | P0 gate | all | UXM-00/01 for Phase A; all chunks for Phase B | UXM-09A stages between Waves 2-4; UXM-09B certifies in Wave 5 |

### 6.1 Required Glimmer review loop

There are three explicit review paths:

**Foundation path, UXM-00 and UXM-01:**

1. The foundation developer returns code/diff and the complete evidence payload directly to Glimmer.
2. Glimmer reviews the standalone foundation baseline. Rejection returns to the same developer with numbered feedback.
3. The developer revises and resubmits until Glimmer approves. That approval records the green UXM-00 or UXM-01 baseline. UXM-09A does not participate before UXM-01 approval.

**Progressive merged path, UXM-02 through UXM-08:**

1. The domain developer returns a candidate code/diff and complete evidence payload to UXM-09A.
2. UXM-09A stages the candidate with required provider wiring and exact compatibility-presenter removal on a disposable merged review baseline.
3. Glimmer checks the merged code/diff, compatibility removal, shared contracts, no-spoiler semantics, copy, focus, responsive evidence, and every screenshot.
4. Rejection produces actionable numbered feedback. UXM-09A discards/rolls back staging, and the same domain developer revises, reruns proof, reopens every replacement screenshot, and returns a new candidate.
5. Staging and review repeat until Glimmer approves. Only that signed merged review baseline is promoted to the approved integration baseline.

**Final path, UXM-09B:**

1. The UXM-09 integration owner returns final certification evidence directly to Glimmer after UXM-08 promotion.
2. Integration defects return to the UXM-09 owner. Domain defects return to the original domain developer, are restaged by UXM-09A, and repeat merged review before certification resumes.
3. Final review repeats until Glimmer signs off the system.

Technical test success alone is never sign-off.

Glimmer must reject evidence with black or blank bands, clipped controls, stale overlays, internal diagnostic copy, unexplained selector text, hidden primary actions, or visual inconsistency. Item evidence must also be rejected for cut-off distinguishing names, pervasive ellipses, unreadable row chips, overlapping or clipped slot callouts, obscured character art, a missing paper doll, or horizontal scrolling. The known CDP PNG interoperability anomaly does not waive inspection. Use view-safe derivatives, preserve raw captures, and include a QC manifest.

## 7. Complete requirement-to-chunk traceability

| Audit ID | Requirement summary | Baseline status | Primary chunk | Supporting chunks | Required proof anchor |
|---|---|---|---|---|---|
| SAFE-01 | Optional first-turn field guide | Remaining | UXM-03 | 01, 08 | new game cue sequence, skip, restored suppression |
| SAFE-02 | Simplify character creation | Remaining | UXM-03 | 00 | blank name, constraints, advanced run options |
| SAFE-03 | Unified help and commands | Remaining | UXM-03 | 01 | tabs/sections, search, manual preservation |
| SAFE-04 | Player-facing outcome status | Remaining | UXM-01 | 02, 07 | forbidden transport-copy scan and outcome states |
| SAFE-05 | True map-first hierarchy | Remaining | UXM-02 | 03, 04, 08 | full and compact shell screenshots, full/follow parity |
| SAFE-06 | Design tokens and state contracts | Remaining | UXM-01 | 00, all visible chunks | token lint, contrast, component state evidence |
| SAFE-07 | Searchable command palette | Remaining | UXM-03 | 04, 07 | aliases, context ranking, exact dispatch |
| SAFE-08 | Keys as accelerators | Remaining | UXM-03 | 01, all surfaces | case-sensitive public keycaps, setting |
| SAFE-09 | Clarify movement and repeat | Remaining | UXM-03 | 04 | mode help, optional pad, exact counts |
| SAFE-10 | Discoverable map inspection | Remaining | UXM-04 | 01, 03 | Inspect mode, click selects only, no raw metadata |
| SAFE-11 | Honest target previews | Remaining | UXM-04 | 01 | placeholder removal now, typed legality later |
| SAFE-12 | Map legibility and non-color cues | Remaining | UXM-04 | 08 | scale, contrast, glyph option, public-state cues |
| SAFE-13 | Illustrated paper doll with stable semantic equipment layout | Remaining | UXM-05 | 08, 09 | full art retained; full-mode anchored layered callouts; compact grouped slot list; no overlap/obscuration at both sizes and zoom |
| SAFE-14 | Standard readable item interaction | Remaining | UXM-05 | 01, 06, 08 | selector/icon/two-line name/quantity row; stable detail/actions; filters; select-only click/Enter plus accelerators |
| SAFE-15 | Keyboard-operable transfer dialogs | Remaining | UXM-06 | 01, 05 | keyboard container and ground transfers using shared readable item-row allocation |
| SAFE-16 | Truthful item details/comparison | Remaining | UXM-05 | 06 | secondary known fields in details pane only, unknown alignment, no inference |
| SAFE-17 | Identity, appearance, and naming grammar | Remaining | UXM-05 | 04, 06 | full/wrapping unidentified, named, plural, corpse/shop cases without pervasive ellipses |
| SAFE-18 | Compact consequence feed plus structured result events | Remaining | UXM-02 | 08 | native typed result acceptance/rejection, canonical log parity, conservative fallback |
| SAFE-19 | Refine spell and skill presentation with typed public rows | Partial foundation only | UXM-03 | 01 | dedicated entries, typed public values, fallback policy, explanation |
| SAFE-20 | Urgent status priority | Remaining | UXM-02 | 08 | compact/detailed presets, no System chip |
| SAFE-21 | Correct typed interaction shells | Remaining | UXM-01 | 03, 05, 06 | family semantics and real prompt regressions |
| SAFE-22 | Standard dismissal vocabulary | Remaining | UXM-01 | all surface chunks | Close/Cancel/Back/Continue matrix and Escape |
| SAFE-23 | Actionable failures with state preservation | Remaining | UXM-01 | 05, 06, 07 | stale/interrupt/recovery cases, no auto retry |
| SAFE-24 | Shop-specific bill UX | Partial | UXM-06 | 01, 05 | bill, totals, gold/debt if public, partial/insufficient |
| SAFE-25 | Creature action grouping and peaceful protection | Remaining | UXM-04 | 03 | one grouped target flow, typed attitude only |
| SAFE-26 | Clear level transitions | Remaining | UXM-02 | 01, 04 | confirmed destination notice and map focus |
| SAFE-27 | Message event center | Remaining | UXM-02 | 03, 08 | latest lines, searchable exact history, lore grouping |
| SAFE-28 | Save/restore and trustworthy final state | Remaining | UXM-07 | 03, 01, 08 | save ack, continue metadata, final payload/fallback |
| SAFE-29 | Mainstream keyboard, modal focus, and input ownership | Partial foundations only | UXM-08 | UXM-01 and all interactive surface chunks | keyboard matrix; modal focus entry/trap/return; visible focus; one Escape per layer; clear visible labels/action order; singular input ownership |
| SAFE-30 | Supported responsive window strategy and sighted-player zoom usability | Remaining | UXM-08 | UXM-00 minimum guard and all surface chunks | 960x720 and 1360x920 complete matrix; core flows at 200 percent zoom |
| SAFE-31 | Purposeful motion, sound-off conformance, reduced motion | Remaining | UXM-08 | 02, 04, 05, 06, 07 | confirmed feedback, reduced motion, recorded off/deferred policy and no shipped sound assets/controls |

All 31 recommendations have a primary owner. A supporting chunk may not mark the primary requirement complete. `SAFE-29` is complete only when the mainstream keyboard, modal-focus, visible-focus, one-Escape, visible-label/action-order, and input-ownership proof in this plan passes. Section 1.1 exclusions are outside the plan rather than later milestones.

## 8. Chunk specifications

## UXM-00: Canon, runtime scaffold, settings, and evidence baseline

### Objective

Create the stable architecture and evidence platform that lets multiple UX developers work without repeatedly editing the same central files. Establish stakeholder-confirmed product/design canon, version presentation settings, set the minimum window guard, and harden the shared Electron evidence harness without changing gameplay or redesigning a surface.

### Scope

- Facilitate stakeholder confirmation and add non-placeholder `PRODUCT.md` and `DESIGN.md`. Use this plan and the audit as inputs, but require explicit confirmation for audience, tone, density defaults, 960x720 minimum, restrained color strategy, and sound policy.
- Add design tokens and component-state names at the contract level. UXM-01 owns their visual application.
- Introduce the `src/ux/` runtime registry, fixed domain ownership, mount lookup, and predeclared per-chunk module/style slots.
- Refactor central files only enough to expose stable hook points and preserve behavior. Keep old implementations as compatibility presenters until the owning chunk claims a domain.
- Add versioned v2 presentation settings with migration from v1 and safe failure behavior.
- Set `BrowserWindow` `minWidth: 960`, `minHeight: 720`. Preserve environment-driven larger test sizes. If tests intentionally exercise smaller dimensions, provide an explicit test-only override rather than weakening production minimums.
- Update `scripts/lib/electron-test-harness.js` as the only lifecycle driver. Migrate `real-input-regression-test.js` startup to the driver and remove its stale direct assumption.
- Add screenshot QC helpers that preserve raw captures, produce view-safe PNG/JPEG/BMP derivatives when needed, and emit a manifest with dimensions, hashes, source/derivative relationship, and manual-inspection fields.
- Update `smoke.md` or create an Electron UX section if no root smoke exists, with exact launch, viewport, scenarios, expected observations, and log paths.

### Out of scope

- No shell redesign, command palette, new dialogs, item UX, map UX, transfer UX, or game-over redesign.
- No bundler, framework migration, ESM conversion, or core gameplay protocol enrichment.
- No unconfirmed product canon invented by a developer.

### Concrete implementation guidance

- Preserve the UMD/browser-global pattern and `browser-global-contract-test.js`.
- Runtime must support `registerDomain(id, controller)`, reject duplicate owners, expose public-state subscriptions, expose notice/dialog services only after UXM-01, and record registration failures to diagnostics.
- Predeclare all planned CSS files from section 5.3. Empty scaffold files are acceptable in this chunk so later changes do not touch `renderer.html`.
- Central hooks must pass immutable snapshots or copies. Do not expose mutable `renderer.js` globals to feature modules.
- Settings migration retains `contextualMenus` and `autoLootGold`. Migration is idempotent. Unknown future keys are ignored safely.
- Add package scripts for focused UX architecture and screenshot-manifest checks, but do not hand-edit lockfile dependencies. Prefer no new dependency.

### Required tests and evidence

- Node tests: runtime duplicate-owner rejection, registration order, immutable input, settings v1 migration, malformed storage, write failure, and production/test minimum-window policy.
- Existing `npm run test:architecture`, `npm run test:ui`, and startup recovery tests.
- Real Electron startup using the shared driver, at 960x720 and 1360x920, proving startup choice, character dialog, intro, and first map still work exactly.
- Rerun the migrated real-input regression through actual keyboard movement and inventory.
- Capture raw and view-safe screenshots plus a complete QC manifest. Open and inspect every accepted screenshot.
- Inspect the relevant diagnostic run summary and `logs/last-run.log`; distinguish stale unrelated logs explicitly.

### Acceptance checklist

- [ ] Stakeholder-confirmed `PRODUCT.md` and `DESIGN.md` exist and are not placeholders.
- [ ] No ordinary visible behavior intentionally changed.
- [ ] Later chunks have exclusive predeclared module/style paths and do not need routine central edits.
- [ ] Duplicate domain registration fails visibly in diagnostics.
- [ ] Settings v1 values migrate once and v2 preferences persist safely.
- [ ] Production window cannot shrink below 960x720.
- [ ] `real-input-regression-test.js` uses the shared startup driver and passes the startup-choice flow.
- [ ] Screenshot QC manifest and personal inspection notes exist.
- [ ] Architecture and browser-global tests pass.
- [ ] Glimmer approves baseline visual parity and scaffold quality.

### Developer handoff brief

You are implementing **UXM-00, Canon, runtime scaffold, settings, and evidence baseline**, from the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**, located at `docs/design/ux-modernization-developer-breakout-2026-07-11.md`. The overall effort modernizes presentation and interaction while preserving NetHack rules, unknown information, classic keyboard efficiency, turn semantics, and public-state boundaries. Your chunk creates the conflict-safe platform for every later developer. It interfaces with every chunk through `src/ux/runtime.js`, mount points, settings, predefined script/style slots, and the Electron evidence harness. It has no implementation dependency, but stakeholder confirmation is required for `PRODUCT.md` and `DESIGN.md`. Forbidden regressions include any gameplay change, startup blank command, hidden startup choice, broken menu letters, changed save semantics, bundler introduction, or test-only UI becoming product behavior. Return the complete diff, central-hook API documentation, migration tests, exact commands/results, real Electron steps, raw and view-safe screenshots, QC manifest, personal inspection notes for every frame, diagnostics/log paths, and caveats. Completion evidence must explicitly include changed-file ownership, every command and exit status, the commands/turns/cancellation/public-data/hidden-omission semantic statement, accepted frames at 1360x920 and 960x720 plus 200 percent zoom where applicable, raw-to-derivative relationships with dimensions and hashes, keyboard/focus/input-ownership notes, Electron stdout/stderr, diagnostic summaries, and `logs/last-run.log` inspection. Your result goes to Glimmer. If rejected, you revise the same chunk until Glimmer signs off.

## UXM-01: Interaction foundation, notices, failures, focus, and dialog semantics

### Objective

Replace ad hoc status, dialog, focus, and failure behavior with reusable player-facing contracts. This is the common interaction vocabulary for every later feature.

### Scope

- Implement `PlayerNotice` and route all ordinary header status through it. Low-level `setStatus` becomes diagnostics-only compatibility code and is removed from player chrome.
- Map prompt ownership and confirmed results to `Your turn`, `Choose an item`, `Choose a direction`, `Game saved`, `Connection lost`, and actionable failure copy.
- Implement typed shells for single-select, multi-select, command menu, form, confirmation/alert, document, and transfer. UXM-06 supplies transfer content later.
- Implement `FocusLayer`: modal stack, initial focus, trap, return focus, roving focus for menus, standard Home/End/arrows, and one-Escape-one-layer.
- Use interaction controls appropriate to each family. Do not use one permanent choice pattern for heterogeneous content.
- Standardize clear visible Close, Cancel, Back, Continue, and explicit destructive verbs, with consistent action order.
- Map `public-blockers.js`, transaction failures, stale revisions, prompt conflicts, process exits, and recovery failures into player copy with optional diagnostic details/copy action.
- Preserve selection and scroll by stable ID when safe. Never auto-retry a turn-spending action.
- Apply design tokens and complete states to shared buttons, inputs, choices, dialogs, focus, semantic notices, and overlays.
- Add reduced-motion treatment for the existing spinner immediately.

### User flows and states

1. A player opens a read-only document. Focus enters the heading or search, Escape/Close returns to the invoker, and no core input is sent.
2. A core item prompt opens. One coherent visible notice appears, menu letters remain available, Cancel sends the correct core cancellation, and focus returns to the map or owning surface after the core closes.
3. A serious confirmation opens. The destructive verb is explicit, default focus is safe, Escape cancels, and acceptance follows the existing core route.
4. A transaction revision changes. The selection remains when stable IDs still exist, the action disables while stale, and the player sees `That item moved. Refresh the list and try again.` Technical revision details live under diagnostics.
5. The process stops unexpectedly. A visible error notice reports recovery availability without blocking diagnostic recording.

### Edge cases

- Nested item context over inventory, document over intro, actions over ground transfer, shop offer, startup required, and terminal game-over layers.
- A focused element disappears during authoritative refresh.
- The initiating element disappears before close. Return to the nearest surviving domain invoker, then map.
- Prompt cancellation is rejected or delayed by the core.
- Multiple low-level status effects arrive for one player outcome. Deduplicate the visible notice by outcome/transaction, not message string alone.
- Storage or clipboard diagnostics copy fails.

### Out of scope

- No command-palette content, equipment redesign, transfer content, shell hierarchy, or final-run payload.
- No renderer-only attempt to classify combat outcomes.

### Concrete implementation guidance

- Start at `showInteractionDialog`, `closeInteractionDialog`, `handleInteractionNavigationKeydown`, `topmostEscapeLayer`, `handleTopmostEscapeKeydown`, `setStatus`, and `applyGameViewEffects`.
- Keep existing real menu-letter behavior. Choice shells must expose selector letters as accelerators without placing internal sequences in labels.
- Add action-kind and escape-policy metadata instead of dialog-ID regexes.
- Update `interaction-model.js` for typed family derivation and add a browser-global contract test.
- `PlayerNotice` input should be typed view effects and transaction outcomes. Unknown raw status is diagnostic-only.
- Keep game-over and startup Escape blocking, but require visible actions and focus placement. Change intro Escape only according to the agreed Close/Continue policy, never by sending a blank key.

### Required tests and evidence

- Unit/contract tests for every dialog family, focus stack, visible-notice deduplication, failure mapping, and no-auto-retry.
- Existing prompt lifecycle, menu-letter, modal stability, Escape popup, command transaction, transfer transaction, and preload/architecture tests.
- Real Electron proof for direction prompt, item single select, multi-select, free text, read-only help, confirmation, nested inventory context, ground/container close, shop offer, startup, intro, and game over.
- Keyboard-only traversal with Tab, Shift+Tab, arrows, Home, End, Enter, Space, Escape, menu letters, and Shift+F10 where retained.
- Screenshots at 1360x920 and 960x720 for every dialog family, plus at least one 200 percent zoom sample per family.
- Prove each dialog family's visible title/instructions/action order, initial focus, modal trap, return focus, visible focus, choice behavior, cancellation behavior, one-Escape handling, and input ownership through real Electron interaction and screenshots.

### Acceptance checklist

- [ ] Normal chrome contains no transport/protocol phrases listed in the source audit.
- [ ] All interaction families use clear visible labels and shared action order.
- [ ] One Escape affects one top layer and never accepts a prompt.
- [ ] Menu letters and case-sensitive classic keys still work.
- [ ] Focus enters, stays in, and returns from every modal family.
- [ ] `PlayerNotice` is one coherent visible layer and deduplicates repeated outcomes by stable identity.
- [ ] Failures use player language and preserve safe state.
- [ ] No failed turn-spending action retries automatically.
- [ ] Shared controls have all required visual states and visible focus.
- [ ] Existing real prompt and Escape regressions pass.
- [ ] Every dialog family passes real keyboard proof for modal focus entry/trap/return, visible focus, choice behavior, cancellation, one-Escape handling, clear visible labels/action order, and singular input ownership.
- [ ] Glimmer signs off all in-scope dialog-family and visible-notice evidence. Prior Glimmer finding 1 and all evidence gates it relied on remain invalid under section 1.2.

### Developer handoff brief

You are implementing **UXM-01, Interaction foundation, notices, failures, focus, and dialog semantics**, from the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**. The effort makes NetHack legible without changing rules or input semantics. UXM-00 must already be integrated and Glimmer-approved. Your interfaces are `PlayerNotice`, `DialogSpec`, `FocusLayer`, failure presentation, visible notice deduplication, and the shared token/state vocabulary. UXM-02 through UXM-08 will consume them, so do not add domain-specific shortcuts. Forbidden regressions include prompt acceptance on Escape, menu-letter loss, focus leakage to dungeon input, multiple simultaneous owners, swallowed failures, automatic action retry, internal status copy, or altered game-over/startup policy. Return code/diff, contract docs, unit and real Electron results, mainstream keyboard matrix, real modal focus entry/trap/return and invoker proof, visible-focus proof, clear visible labels/action order, one-Escape and input-ownership evidence, every screenshot and personal inspection note, diagnostics/log paths, and unresolved risks. Apply section 1.1's scope exclusions and section 1.2's invalidation of prior Glimmer finding 1. Completion evidence must explicitly include changed-file ownership, every command and exit status, the commands/turns/cancellation/public-data/hidden-omission semantic statement, real player steps, raw and view-safe frames at 1360x920, 960x720, and 200 percent zoom, dimensions/hashes/QC manifest, keyboard/focus/input-ownership notes, visible-notice deduplication, Electron stdout/stderr, diagnostic summaries, and `logs/last-run.log` inspection. Findings 2 through 8 remain in force only as narrowed by section 1.2. The result goes to Glimmer and returns to you for revision until signed off.

## UXM-02: Map-first shell, compact HUD, messages, consequences, and transitions

### Objective

Make the hero, urgent state, map, current context, and latest consequence the real persistent hierarchy. Preserve exact history and provide on-demand detail without flattening all facts into chips.

### Scope

- Replace the permanent quick-action ribbon with one compact command entry plus context row. Dedicated Inventory remains visible. UXM-03 supplies palette behavior.
- Persistent shell order: hero summary and vital/urgent state, PlayerNotice, context actions, map, two-to-four-line consequence feed, History access.
- Move attributes, XP detail, full gear, conduct, and system/version to a character sheet or details surface.
- Add Compact and Detailed HUD presets. Compact is default after stakeholder confirmation.
- Derive urgent status from `status-hud.js`: HP/Pw, AC, level, dungeon, gold, hunger/burden, and active urgent conditions. Use icon/shape/text/severity, never color alone. No invented durations.
- Build `MessageEvent` storage with immutable canonical lines and optional metadata. Preserve exact searchable history.
- Show two to four latest lines by default. Group intro lore under Opening chronicle after intro. Group by turn only when exact turn metadata exists.
- Add conservative consequence presentation for damage, miss, resistance, status gained/lost, item breakage, kill, pet harm, blocked action, and hazard. Typed events outrank parsing. Unclassified lines remain visible.
- Implement mandatory additive structured public result events for combat, hazards, status gained/lost, item breakage, kill, pet harm, blocked action, and final action outcomes. Extend the native/shim bridge, `shim-protocol.js`, `ui-protocol-v2.js`, and `game-view-state.js` in serialized protocol slot 4. Every event carries stable event ID/sequence, mandatory semantic `outcomeId`, turn when public, public actor/target references when visible, category, severity, and exact canonical message linkage. Related typed state events/reducer deltas carry `causedByOutcomeId` so UXM-08 can derive one `outcomeKey` across sources. Unknown actor/target or unavailable damage stays absent. Message parsing remains compatibility fallback, not completion.
- Add brief non-blocking visual emphasis hooks for involved public cells and HP/status. UXM-08 owns final motion/sound conformance.
- On confirmed level change, show the public destination such as `Dungeon level 2`, focus the new map, and use the same path for stairs, portals, falls, teleports, and branches. Do not reveal branch names early.
- Add optional presentation-only Follow hero/magnifier mode derived solely from rendered known cells. Full 80x21 view remains one action/key away and can be permanent.

### User flows and states

- A normal turn leaves the map dominant and shows only current context and recent consequences.
- An urgent condition enters the persistent HUD immediately and is focusable for a public explanation.
- The player opens Character to inspect static attributes without changing turns.
- The player opens History, searches exact canonical text, copies a line, then closes back to the map.
- A level change is confirmed. The shell shows the new level, updates known cells, moves focus to map, and does not claim safety.
- Full and Follow views switch without changing cursor coordinates, public data, targeting, or command dispatch.

### Edge cases

- Polymorphed HD versus XL; zero/unknown max HP/Pw; stale final status; many simultaneous fatal conditions; hallucination; no turn metadata; repeated identical messages across distinct turns; long shopkeeper dialogue; intro replay; map reset; level change while a prompt is active; 80x21 mostly unexplored map.

### Out of scope

- No click-to-move, pathfinding, target legality, command catalog, or final-run statistics.
- No aggressive message parser that claims structured truth across variants.

### Concrete implementation guidance

- Extend `status-hud.js` with `persistent`, `urgent`, and `detail` roles. Remove System/Version from persistent output.
- Replace the string-only `message-log.js` model while retaining a compatibility `entries()` view for tests.
- Route `applyGameViewEffects` through UX runtime subscriptions instead of direct DOM status/log updates.
- In protocol slot 4, add valid/invalid result-event fixtures, native lowering/emission, mandatory `outcomeId` and state `causedByOutcomeId` propagation, duplicate/out-of-order handling, public-reference validation, and typed-to-canonical-message correlation. The bridge must emit only post-result public facts. Renderer events cannot synthesize missing damage, attitude, resistance, or hidden actors.
- Keep exact source text in memory. Presentation summaries may visually emphasize but not replace source text.
- Follow view must index existing `mapCells` and public cursor only. It must never calculate unseen bounds.
- Define performance budgets: ordinary message/status update should not force full map rebuild; Follow view update should stay within the existing render-performance tolerance plus an agreed small margin.

### Required tests and evidence

- Status unit tests for compact/detail grouping, every severity, unknown values, and condition masks.
- Message tests for canonical parity, search, exact repetition, turn grouping, lore grouping, and unclassified fallback.
- Protocol slot 4 tests: valid/invalid structured result events, mandatory outcome correlation and state propagation, bridge/native acceptance and rejection, duplicate/out-of-order idempotence, typed public references, canonical message correlation, missing-field omission, replay/reconnect suppression, and compatibility fallback.
- Existing status HUD, condition, log-panel, render-performance, stairs, map-reset, protocol golden, game-view, bridge, native envelope, and replay tests.
- Real scenarios: first gameplay, full HUD, hero conditions (trapped, blind, and confused), typed combat hit/miss/kill, typed hazard/status gain/loss, item break or blocked action where fixtures support it, shopkeeper dialogue, stairs down/up, non-stair level change if available, and intro-to-history.
- Full and Follow screenshots at 1360x920 and 960x720, with 200 percent zoom for HUD/history.
- State evidence proving no hidden cells or branch labels appear and no extra gameplay command is sent when changing presentation mode.

### Acceptance checklist

- [ ] Map is visually dominant at both supported sizes.
- [ ] System/version and static attributes are absent from Compact HUD.
- [ ] All audit-required persistent facts and urgent conditions remain available.
- [ ] Canonical message history is exact, searchable, and copyable.
- [ ] Default feed is two to four lines, not the current 80-line block.
- [ ] Structured native/shim result events work end to end for the approved combat, hazard, status, item, pet, blocked-action, and outcome categories.
- [ ] Duplicate, replayed, recovered, or out-of-order result events do not duplicate consequences or feedback.
- [ ] Conservative parsing is fallback-only, and unclassified canonical text is never hidden.
- [ ] Confirmed level transitions use player copy and restore map focus.
- [ ] Follow view adds no information and Full view remains immediate.
- [ ] Classic input and render performance remain acceptable.
- [ ] Glimmer approves hierarchy, density, and all state screenshots.

### Developer handoff brief

You are implementing **UXM-02, Map-first shell, compact HUD, messages, consequences, and transitions**, from the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**. UXM-00 and UXM-01 are required and must be Glimmer-approved; mandatory structured result events are serialized protocol slot 4 after UXM-04's target slot 3 green handoff. The wider effort consolidates the interface around hero, known map, context, and consequence while preserving exact NetHack truth and command speed. Your interfaces are persistent/detail status roles, `MessageEvent`, consequence feed, character sheet, shell mount regions, and level-change feedback. UXM-03 supplies the command palette entry, UXM-04 supplies map inspection/target visuals, and UXM-08 applies final responsive, mainstream-keyboard, visual-usability, and motion conformance. Forbidden regressions include message loss or rewriting, hidden urgent state, unseen map disclosure, inferred combat facts, changed turn timing, blocking animation, or degraded classic input. Return diff, data contracts, performance measurements, automated and real Electron results, exact scenario steps, screenshots at both sizes and zoom, personal inspection notes for every frame, canonical-log parity evidence, diagnostics/logs, and caveats. Completion evidence must explicitly include changed-file ownership, every command and exit status, the commands/turns/cancellation/public-data/hidden-omission semantic statement, typed result acceptance/rejection proof, raw and view-safe frames at 1360x920, 960x720, and 200 percent zoom, dimensions/hashes/QC manifest, keyboard/focus/input-ownership notes, Electron stdout/stderr, diagnostic summaries, and `logs/last-run.log` inspection. Glimmer reviews and may return the chunk to you until signed off.

## UXM-03: Command discovery, onboarding, creation, help, movement, spells, and skills

### Objective

Provide one discoverable command vocabulary and a respectful first-turn learning path without automating play or diminishing expert keyboard access.

### Scope

- Build a searchable command palette using one `CommandCatalog` for static commands, extended commands, contextual entries, help metadata, and visible key hints.
- Open from the existing Actions button and `#` without breaking classic extended-command entry. If `#` currently belongs directly to NetHack, palette activation must preserve a one-keystroke path to raw extended command and be explicitly tested.
- Rank Available here, Recent, then categories: Items, Equipment, Magic, Dungeon, Character, Run, Help.
- Search friendly names, canonical NetHack names, aliases, and public shortcut. Examples: `quaff`, `drink potion`, `q`.
- Show whether a prompt follows and mark serious actions. Save and Quit are separated from ordinary actions and use UXM-01 confirmation contracts.
- Standardize public keycaps and add `keyHints: contextual|always|never`. Respect case and control keys. Never display internal composed routes.
- Clarify Walk, Run, Fight, count prefixes, Search, and Wait. Keep movement pad optional. Do not call Wait `rest until healed`.
- Add an optional four-step first-turn field guide: move one square, read latest consequence, inspect/use Here actions, open and close Inventory. Include Skip guidance and Do not show again. It observes visible state, never issues input, and yields instantly to classic keyboard play.
- Suppress first-turn guide for restored games unless explicitly restarted from Help.
- Simplify character creation: blank name with thematic example, identity choices first, Random hero and Enter dungeon hierarchy, seed/recording under Advanced run options, and inline legality explanation from `character-options.js`.
- Define empty-name policy with the core/product owner. Preferred safe behavior is explicit validation or a core-approved generated name, never silent `Electron` fallback.
- Unify Help and commands sections: Basics, Keys, Commands, Manual. Keep canonical manual text monospaced and searchable. Context actions can expose their public key as secondary hints.
- Give Spells and Skills dedicated command entries. Preserve current public level/Pw/failure/rank/can-advance fields and explain that failure reflects current equipment and condition. Do not estimate values or recommend builds.
- Implement mandatory typed public `spell.rows` and `skill.rows` event models in serialized protocol slot 2. Spell rows include only core-emitted name, selector, level, Pw cost, failure, and status. Skill rows include only core-emitted name, selector, current rank, next rank/cost when public, and can-advance. Current text parsers become explicit compatibility fallback with `classificationConfidence: fallback`; they may omit a field but never estimate it.

### User flows and states

- First new run: character identity is primary, Advanced is collapsed, legality changes are explained, intro completes, and cue one waits without stealing focus.
- Expert first key: pressing a classic movement key both moves normally and satisfies/dismisses the current learning cue.
- Palette: open, type alias, arrow to command, inspect key/prompt/danger metadata, Enter dispatches exact existing route, Escape returns to map.
- Context command: Available here updates from public state without inventing unavailable actions.
- Help: search keys/commands, open Manual, return to prior section, close to invoker.
- Spells/Skills: open from palette, use existing core menu, preserve selector letters and cancellation.

### Edge cases

- A prompt or game-over appears during onboarding; restored/recovered/replay runs; settings storage unavailable; no commands match; contextual availability changes while palette is open; command shortcut differs by case; raw `#` command search; command alias collision; Save unavailable; Quit danger; spell level omitted by source; advancement absent; character selection constrains multiple fields.

### Out of scope

- No strategic tutorial, quest checklist, auto-explore, action recommendation, key rebinding, or canonical manual rewrite.
- No change to core character legality, randomization, seed, or recording semantics.

### Concrete implementation guidance

- Extract metadata currently duplicated in `renderer.html` Actions sections, `commandHelpOptions`, extended-command catalog, context actions, and item affordances.
- `CommandDefinition.internalRoute` may call existing `sendPlayableKey`, `sendPlayableText`, typed action routes, or open a dedicated surface. It must not be rendered.
- Recent commands are presentation-only and exclude destructive commands by default.
- Onboarding state listens for confirmed renderer events, not raw key guesses. Movement cue completes after the map/cursor or result confirms action, not on keydown alone.
- Character legality explanation must come from `character-options.js` output. Do not create renderer legality rules.
- Preserve canonical manual lines exactly even when navigation wrappers change.
- Protocol slot 2 extends `ui-protocol-v2.js`, `shim-protocol.js`, the bridge/native emitter, and `game-view-state.js` with typed spell/skill rows, invalid/unknown fixture coverage, stable selector/request ownership, duplicate/out-of-order rejection, and fallback provenance. Start only from UXM-05's recorded green protocol baseline.

### Required tests and evidence

- Catalog uniqueness, alias search, case-sensitive shortcuts, contextual availability, dangerous command placement, exact route dispatch, and no hidden prerequisite claims.
- Onboarding state-machine tests for new, skip, disable, restored, replay, prompt interruption, keyboard completion, and storage failure.
- Character-options and creation tests for every legal role/race/gender/alignment adjustment and blank-name policy.
- Protocol slot 2 tests for typed spell/skill valid/invalid rows, missing optional fields, selector/request ownership, duplicate/out-of-order handling, parser fallback provenance, bridge/native acceptance and rejection, and replay compatibility.
- Existing real startup, character combinations, menu letters, spells/skills fixture, recording, save/quit, protocol golden, game-view, bridge, native envelope, replay, and Escape tests.
- Real Electron evidence for new-player mouse path, keyboard-first path, palette search by friendly name/key/alias, raw extended command, movement counts, Help/Manual, typed Spells, typed Skills, parser fallback fixture, Save, and Quit cancel.
- Screenshots at both sizes and 200 percent zoom: creation default/Advanced/constraint, each onboarding cue, palette empty/search/danger, Help sections, spell and skill menus.

### Acceptance checklist

- [ ] One catalog is the source for palette/help/key hints.
- [ ] Every palette entry routes to the same existing command or prompt.
- [ ] Context ranking uses public facts only.
- [ ] Save and Quit are clearly separated and confirmed appropriately.
- [ ] Public keycaps preserve case and hide internal sequences.
- [ ] Movement help is accurate and adds no automation.
- [ ] First-turn guide is optional, turnless, non-blocking, and restored-game safe.
- [ ] Character name no longer defaults or silently falls back to `Electron`.
- [ ] Advanced run options preserve seed and recording.
- [ ] Help retains exact canonical Manual text.
- [ ] Spell/skill rows use authoritative typed public events in the real path; parser-backed rows are labeled/tested compatibility fallback only.
- [ ] Missing level, Pw, failure, rank, or advancement data is omitted rather than estimated, and no recommendation is added.
- [ ] Glimmer signs off discovery, hierarchy, copy, and evidence.

### Developer handoff brief

You are implementing **UXM-03, Command discovery, onboarding, creation, help, movement, spells, and skills**, from the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**. UXM-00 and UXM-01 are dependencies; mandatory typed spell/skill rows are serialized protocol slot 2 after UXM-05's item slot 1 green handoff. The overall effort preserves NetHack mechanics and expert keys while improving recognition and learning. Your public interfaces are `CommandCatalog`, command palette, Help center, onboarding events/preferences, character-creation presenter, and key-hint policy. UXM-02 supplies shell/History, UXM-04 supplies contextual and map commands, UXM-07 supplies save/final lifecycle actions, and all register through your catalog without duplicating definitions. Forbidden regressions include changing `#`, counts, case-sensitive keys, menu letters, randomization, legality, seed/replay behavior, turn costs, or adding strategic advice/automation. Return diff, catalog/API docs, route-equivalence tests, onboarding state proof, character legality matrix, real Electron steps and results, every screenshot at required sizes with personal inspection notes, diagnostics/log paths, and risks. Completion evidence must explicitly include changed-file ownership, every command and exit status, the commands/turns/cancellation/public-data/hidden-omission semantic statement, typed spell/skill and fallback proof, raw and view-safe frames at 1360x920, 960x720, and 200 percent zoom, dimensions/hashes/QC manifest, keyboard/focus/input-ownership notes, Electron stdout/stderr, diagnostic summaries, and `logs/last-run.log` inspection. Glimmer reviews the code and visual evidence; rejected work returns to you until signed off.

## UXM-04: Map inspection, truthful targeting, legibility, and creature context

### Objective

Make map exploration and contextual creature interaction discoverable, legible, and honest about what NetHack has or has not validated.

### Scope

- Add explicit Inspect/Look mode. Hover or keyboard focus shows a compact inspector. Single click selects only. Right-click remains an accelerator.
- Selected-cell presentation exposes only public layers and valid public actions. Ordinary click never moves, attacks, travels, or dispatches.
- Separate diagnostic metadata from player metadata in `map-presentation.js`. Hide glyph IDs, asset categories, and coordinates unless a diagnostics overlay is explicitly enabled.
- Immediately replace placeholder targeting copy with selected public cell/name, distance, and `NetHack will validate this target`. Remove line-of-effect, route validity, and raw path-key claims.
- Implement mandatory additive authoritative target-prompt metadata in serialized protocol slot 3: stable prompt and target IDs, public candidate cells, legal/illegal/unknown state, authoritative LOS/range only when the core emits it, rejection reasons safe for the player, and target acceptance acknowledgement. Distinguish confirmed legal cells from selected cells by shape and text. If the core cannot authoritatively determine a field, emit unknown/omit it; do not de-scope the protocol or infer in the renderer.
- Add map scale controls, stronger cursor/selection/target rings, optional classic glyph overlay, high-contrast terrain outlines, and tooltip placement that avoids selected content.
- Add non-color cues for hero, pet, known hostile, known peaceful, known trap, and target states. Use state only when public.
- Group adjacent creature actions. Show at most one primary creature command plus target chooser when multiple creatures are adjacent.
- Tame/pet uses Chat or another public safe action as primary. Peaceful uses Chat primary with Attack under Dangerous actions and explicit confirmation. Hostile may use Attack primary. Typed attitude is required; no glyph/name heuristic.
- Remove flat 12-button creature/action clutter from context bar. Preserve exact direction and classic Fight semantics.

### User flows and states

- Player chooses Inspect, moves selection by keyboard or click, reads public cell details, opens allowed actions, and exits without spending a turn.
- Player right-clicks as an accelerator and receives the same inspector/action model.
- A target prompt opens. Selection shows distance and known name, makes no legality claim, and dispatches only on explicit confirm.
- A typed legal-target prompt, when available, visually distinguishes legal/illegal without implying hit chance or damage.
- Several creatures are adjacent. Player chooses Creature, then a named/directional target, then safe or dangerous action according to public attitude.

### Edge cases

- Unexplored cells, hallucination, invisible/unseen actors, actor over object, unidentified objects, corpse/statue, pet/peaceful/hostile transitions, multiple creatures with same name, no typed attitude, target self, out-of-bounds keyboard navigation, tooltip near viewport edge, Follow map mode, trap only after discovery.

### Out of scope

- No click-to-move, click-to-attack, auto-path, renderer LOS, hit chance, damage range, hazard prediction, or attitude inference.
- No new creature commands or pet control.

### Concrete implementation guidance

- Refactor `tooltipInfoForCell()` into player and diagnostic models. Keep asset IDs available to renderer internally but not display description.
- Replace `targetPreviewDetails()` and `renderTargetSelectionControls()` copy before adding richer protocol.
- Typed target changes are mandatory and additive across the bridge/native emitter, `shim-protocol.js`, `ui-protocol-v2.js`, and `game-view-state.js`, with invalid/unknown fixtures, stable prompt ownership, duplicate/out-of-order rejection, and core accept/reject acknowledgements. Implement in serialized slot 3 after UXM-03's slot 2 green baseline.
- `context-action-presentation.js` consumes existing `actionsForCurrentCell`, `actionForAdjacentCell`, and typed public action affordances. It groups but does not invent.
- Selection and target rings require non-color geometry differences and high-contrast focus.

### Required tests and evidence

- Unit tests for player versus diagnostic tooltip output, unknown cells, attitude source, grouped actions, click-selection turnlessness, and target copy.
- Protocol slot 3 golden tests for typed target metadata, including hidden/invalid/unknown cells, missing LOS/range, stable IDs, stale prompt, duplicate/out-of-order delivery, and core accept/reject acknowledgements.
- Real bridge/native proof that at least one accepted and one rejected target reaches the same NetHack prompt route without renderer legality inference.
- Existing map tooltip, render layer, terrain map, monster, pet, trap, door, stairs, context action, input safety, protocol golden, game-view, bridge, native envelope, replay, and render-performance tests.
- Real scenarios for player/door/object/engraving/corpse/statue/pet/peaceful/hostile/trap/stairs; target prompts for aim/travel/inspect where available.
- Keyboard-only inspector and target selection. Pointer hover, click, and right-click parity.
- Screenshots at both sizes, Follow and Full map, glyph overlay, high contrast, selected/target states, multiple creatures, and diagnostics overlay off/on.
- Input evidence proving selection sends no command.

### Acceptance checklist

- [ ] Inspect is visible and understandable without right-click knowledge.
- [ ] Ordinary click selects only and spends no turn.
- [ ] Player tooltips contain no glyph ID, asset category, or coordinate.
- [ ] Target preview makes no unverified line, range, route, or legality claim.
- [ ] Authoritative target metadata, stable IDs, and core acceptance/rejection work end to end in the real path.
- [ ] Legal-target, LOS, or range visualization appears only for fields the core supplied; unknown remains explicit/omitted.
- [ ] Scale, high contrast, glyph overlay, and non-color states are available.
- [ ] No public attitude/trap state is inferred.
- [ ] Multiple creature actions are grouped and peaceful attack is isolated as dangerous.
- [ ] Classic movement, Fight, right-click, and targeting still work.
- [ ] Glimmer approves all map states and no-spoiler evidence.

### Developer handoff brief

You are implementing **UXM-04, Map inspection, truthful targeting, legibility, and creature context**, from the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**. UXM-00 and UXM-01 are dependencies; mandatory typed target protocol work is serialized slot 3 after UXM-03's spell/skill slot 2 green handoff. The overall effort improves recognition without revealing hidden dungeon knowledge or changing input policy. Your interfaces are `MapInspectorModel`, target presentation, public/diagnostic map metadata separation, and grouped context-action presentation. UXM-02 owns shell and Follow-map container, UXM-03 owns command catalog entries, and UXM-08 owns final responsive, mainstream-keyboard, visual-usability, and motion conformance. Forbidden regressions include click-to-move/attack, inferred LOS/range/attitude/traps, raw metadata in player mode, hidden target dispatch, changed classic Fight semantics, or map performance collapse. Return diff, mandatory protocol fixtures and native accept/reject evidence, input-turnlessness proof, test commands/results, real scenario steps, every screenshot and inspection note, diagnostics/logs, and caveats. Completion evidence must explicitly include changed-file ownership, every command and exit status, the commands/turns/cancellation/public-data/hidden-omission semantic statement, raw and view-safe frames at 1360x920, 960x720, and 200 percent zoom, dimensions/hashes/QC manifest, keyboard/focus/input-ownership notes, Electron stdout/stderr, diagnostic summaries, and `logs/last-run.log` inspection. Glimmer reviews and sends rejected work back to you until approved.

## UXM-05: Illustrated equipment, readable inventory, item details, and comparison

### Objective

Create one truthful, stable item interaction model across equipment and inventory. Keep the illustrated full-character paper doll as the equipment centerpiece while making item names, equipment layers, known facts, blockers, and explicit actions reliably readable.

### Finished layout contract

**Full mode, 1360x920:** use an intentional two-column workspace. Equipment receives approximately 40 to 44 percent of the width and Inventory receives approximately 56 to 60 percent. The inventory column contains search and filters, the scrollable list, then a stable selected-item details/action pane. It must not surrender list width to a third squeezed column. The paper doll remains a full-height visual anchor within the equipment column, with the complete character visible from head to boots.

The illustration has a reserved character-safe area. Slot cards live in opaque and high-contrast perimeter rails outside that area and connect to fixed anchors with restrained leader lines. Cards cannot float over the face, body, hands, weapon art, or one another. Organize the rails into stable semantic groups: helmet/eyes/amulet; cloak/suit/shirt in visible outer-to-inner layer order; gloves/boots; main/offhand; left/right rings; and quiver/alternate. Main/offhand must express two-handed conflicts without merging the slots. Empty, occupied, blocked, and selected states retain the same anchor positions. A selected card highlights its anchor and populates the shared details/action pane; it does not expand across the art.

**Compact mode, 960x720 and constrained zoom:** switch structure instead of squeezing the full layout. Use deliberate Inventory and Equipment tabs, or equivalent stacked modes with one dominant task at a time. Inventory stacks list above details/actions. Equipment retains a prominent, scaled, uncropped full-character portrait/paper-doll view and places the grouped semantic slot list beside it only when space is proven, otherwise below it. At 960x720 and 100 percent zoom, the complete figure occupies the leading visual region and at least 35 percent of the initial Equipment content height; it may not collapse into an icon or small thumbnail. At 200 percent zoom it remains the first substantial Equipment region with the full figure visible, while the slot list and details may follow through vertical scrolling. Compact mode deliberately collapses full-mode callout rails into the grouped slot list; leader lines are not required there, but the same semantic groups, selected-slot linkage, opaque and high-contrast text surfaces, and character-safe separation remain required. The illustration may reduce in size but may not disappear, become a decorative background behind text, or be replaced by a plain slot list. Actions remain reachable and the page never scrolls horizontally.

### Scope

- Inventory rows show, in order, the public selector letter as a keycap, item icon, full item name wrapping from one to at most two lines, quantity, and only essential equipped or ownership state. Allocate enough width for the required long-name states without ellipses or cut-off text, and repeat the complete canonical name at the top of the selected-item pane.
- Move secondary category, BUC, charges, other known-fact chips, blockers, comparison values, and all actions out of the row into the stable selected-item details/action pane. Use prose rows or compact facts with readable contrast, not a dense ribbon of tiny pills.
- The detail pane uses one consistent larger primary button and consistently sized secondary buttons, targeting 44 CSS pixels where space permits. Dangerous actions are separated and are never the default primary. Disabled actions show a public `Why unavailable` explanation in this pane.
- Keep search visible. Full mode visibly exposes All, Equipped, Weapons, Armor, Consumables, and Magic filters. Keyboard search matches both item text and these public category aliases. At compact widths the filters may wrap or move into a labeled filter menu, but every option remains named, keyboard reachable, and available without horizontal scrolling.
- Click and Enter on a row select only and spend no turn. Dispatch requires an explicit named button or action-menu entry. Selector letters and existing classic command routes remain direct accelerators to the same underlying actions. Right-click and Shift+F10 open the same bounded action menu and restore focus on close. Row double-click and drag/drop do not dispatch gameplay actions.
- Implement `ItemPresentation` shared grammar for identity, appearance, called names, quantity/plural, public filter groups, BUC known state, charges when known, unpaid/ownership, equipped state, equipment slots, icon, actions, and blockers.
- Implement reduced known-facts details first, then additive typed item protocol only for facts the player already knows: stable ID, public item classification, public weight if emitted, applicable slots, known charges, ownership, known BUC, and known public stats.
- Add Compare with equipped in the details pane. Align only known fields; show `Unknown` when alignment needs a row and a value is not public. Do not calculate damage, armor delta, best item, effects, or outcome.
- Apply the same item grammar and row allocation to inventory now and publish the API for UXM-06 transfer/shop and UXM-04 map object labels.

### User flows and states

- Open Inventory with `i`, search or filter without spending a turn, select a row by click/Enter, read its full two-line-capable name and known details, choose an explicit action, complete the same core prompt, and return with selection and scroll preserved when possible.
- Open Equipment and immediately see the complete illustrated character. Select a slot card or grouped compact slot row, follow its visual linkage to the same detail pane, inspect layering/blockers, choose a compatible inventory candidate through an explicit action, and see authoritative refresh.
- Select main/offhand with a two-handed weapon present. The public blocker is readable in details, neither callout overlaps the art, and no invalid command dispatches.
- Compare an unidentified appearance against an equipped item. Unknown identity/stats remain unknown and the inventory row remains readable without secondary chips.
- Open context actions through right-click or Shift+F10, navigate with arrows, dispatch only an explicit entry, and Escape back to the selected row.

### Edge and required visual states

- Loaded inventory; empty inventory; very long distinguishing names; at least 120 rows; plural/partial stacks; corpses/statues; artifact and user-assigned names; unidentified appearance; unknown BUC/charges/enchantment; unpaid/shop ownership; two rings; shirt under suit and cloak; two-handed weapon/offhand conflict; cursed or other public blocker; polymorph slots; quiver/alternate; item disappearance or selector remap; prompt interruption; and authoritative refresh while focused.

### Out of scope

- No recommendation, best-item ranking, damage/AC prediction, automatic identification, hidden weight/category parsing, or new equipment command.
- No container/ground transfer interaction or shop transaction behavior, which belongs to UXM-06.
- No removal, substitution, or background treatment of the illustrated character to make layout easier.

### Concrete implementation guidance

- Reuse `equipment-snapshot-adapter.js` for truth and `inventory-action-service.js` for routes. Extend them rather than adding renderer regexes.
- Consolidate `menuItemName`, `cleanEquipmentText`, `inventoryTransferDisplayName`, and related naming fallbacks behind `item-presentation.js`.
- Additive protocol changes go first among protocol slots. Update `ui-protocol-v2` valid/invalid fixtures and no-spoiler tests. Public filter groups must not resolve an unidentified appearance.
- Implement stable layout regions rather than absolute viewport coordinates. Reserve explicit callout-rail and character-safe-area geometry, clamp leader lines within the equipment panel, and keep text surfaces opaque enough that decorative art never reduces contrast.
- Primary action policy must be explicit and deterministic. Dangerous verbs such as Eat, Quaff, Read, Invoke, Offer, and unknown-item use require explicit action selection and existing core confirmations.
- Selection and scroll restore by stable object ID, then public selector if still the same item, never by ambiguous display name alone.

### Required tests and evidence

- Item grammar matrix covering unknown appearance, known identity, called name, plural, artifact, corpse, statue, shop ownership, BUC, charges, public filter membership, and omission rules.
- Row allocation tests proving selector, icon, up-to-two-line full name, quantity, and essential equipped/ownership state remain visible while secondary facts/actions are absent from rows and present in details.
- Slot/layout tests for every anchored group: helmet, eyes, amulet, cloak, suit, shirt, gloves, boots, main/offhand, both rings, quiver, and alternate. Prove stable empty/loaded positions, layering, blockers, two-handed state, selection linkage, character-safe area, and no overlap or clipping.
- Interaction tests for select-only click/Enter, explicit action dispatch, selector-letter/classic-route equivalence, right-click/Shift+F10 parity, no double-click dispatch, filter/search turnlessness, focus return, stale item, and pending transaction lock.
- Protocol valid/invalid and no-spoiler tests for every added field and filter group.
- Existing inventory/equipment snapshots, action service, menu letters, direct equipment, equipment blockers, modal layout, real inventory context, and scenario identity tests.
- Real Electron evidence at 1360x920, 960x720, and 200 percent zoom for every required visual state: loaded, empty, long-name, large-inventory, unidentified, shop-owned item, layered armor, two rings, two-handed conflict, and blocker. Capture Inventory and Equipment modes, selected details/actions, filters, and bounded context menu. Inspect every frame against the Boss-provided current-state screenshot.

### Acceptance checklist

- [ ] The complete illustrated character remains prominent and unobscured in full Equipment. In compact Equipment it remains the leading substantial visual region, scaled and uncropped, occupies at least 35 percent of the initial content height at 960x720/100 percent zoom, and never collapses to a thumbnail.
- [ ] Full-mode slot callouts are anchored in reserved rails, opaque and high-contrast, grouped as specified, selection-linked, and free of overlap, clipping, or competition with the inventory. Compact mode replaces the rails deliberately with the same grouped, opaque and high-contrast, selection-linked slot list beside or below the art.
- [ ] Inventory receives the larger horizontal allocation in full mode; compact mode uses tabs/stacking rather than squeezing paper doll, list, and details side by side.
- [ ] Every ordinary row shows selector, icon, a full name wrapping to at most two lines, quantity, and essential equipped/ownership state only.
- [ ] Category, BUC, charges, known facts, blockers, compare values, and actions live in the stable details/action pane, not cramped row chips.
- [ ] Search and All, Equipped, Weapons, Armor, Consumables, and Magic filters are usable without losing selector-letter acceleration.
- [ ] Click and Enter select only; explicit named actions dispatch; right-click/Shift+F10 and classic routes remain equivalent accelerators.
- [ ] Primary and secondary actions are consistently sized, visible, keyboard reachable, and never hidden below an unreachable region.
- [ ] Item identity/appearance/naming grammar is shared and no-spoiler; unknown values are omitted or explicitly Unknown, never inferred.
- [ ] Layered armor, ring hands, quiver, alternate weapon, two-handed state, and blockers remain distinct and readable.
- [ ] Loaded, empty, long-name, large-inventory, unidentified, shop ownership, layered-armor, two-ring, two-handed, and blocker evidence passes at 1360x920, 960x720, and 200 percent zoom.
- [ ] No accepted frame contains cut-off distinguishing names, pervasive ellipses, unreadable chips, overlapping callouts, obscured character art, hidden actions, or horizontal scrolling.
- [ ] Existing direct and classic equipment flows pass.
- [ ] Glimmer signs off interaction clarity, paper-doll prominence, and every evidence state.

### Developer handoff brief

You are implementing **UXM-05, Illustrated equipment, readable inventory, item details, and comparison**, from the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**. UXM-00 and UXM-01 are required. This is serialized protocol slot 1 and must publish its recorded green handoff baseline before UXM-03 starts slot 2. The Boss has explicitly required the illustrated full-character paper doll to remain a prominent equipment centerpiece; replacing it with a plain equipment-only list, covering it with callouts, or treating it as a text background is forbidden. Build the finished full layout with approximately 40 to 44 percent equipment and 56 to 60 percent inventory, reserved anchored callout rails, a character-safe area, two-line-capable rows, visible category filters, and a stable details/action pane. Build compact as deliberate Inventory/Equipment tabs or stacked modes while retaining the full-character figure as the leading substantial Equipment region, not a thumbnail; at 960x720/100 percent zoom it occupies at least 35 percent of the initial content height. Your interfaces are `ItemPresentation`, item detail/action panel, compare model, equipment layout, and additive public item fields. UXM-06 consumes the exact row/detail allocation, UXM-04 may consume labels, and UXM-08 performs responsive, mainstream-keyboard, and visual-usability conformance. Forbidden regressions include identity leakage, inferred classification/stats, merged armor layers, action on click/Enter, double-click dispatch, dangerous defaults, lost selectors/classic routes, stale-item dispatch, truncated distinguishing names, row chip/action crowding, callout overlap, obscured art, hidden actions, or horizontal scroll. Return diff, schema docs/fixtures, no-spoiler matrix, automated and real Electron results, exact scenario steps, and loaded/empty/long-name/large-inventory/unidentified/shop/layered-armor/two-ring/two-handed/blocker evidence at 1360x920, 960x720, and 200 percent zoom. Return every screenshot with personal inspection notes, diagnostics/logs, and risks. Completion evidence must explicitly include changed-file ownership, every command and exit status, the commands/turns/cancellation/public-data/hidden-omission semantic statement, dimensions/hashes/QC manifest, keyboard/focus/input-ownership notes, filter and selector equivalence, Electron stdout/stderr, diagnostic summaries, and `logs/last-run.log` inspection. Glimmer must reject every listed visual failure; rejected work comes back to you until signed off.

## UXM-06: Keyboard transfer and shop transaction UX

### Objective

Turn container, ground, and shop workflows into explicit, keyboard-operable, focus-safe dialogs while preserving authoritative transaction, interruption, revision, and partial-payment semantics.

### Scope

- Replace the fixed transfer `<section>` behavior with the shared transfer dialog family and correct modal semantics.
- Initial focus goes to a useful first row or empty-state action. Tab remains within. Escape/Done closes one layer and restores the invoker.
- Click or Enter selects the focused row only. Arrows move row focus; Space toggles selection where the core flow supports multi-select. Explicit Take, Put in, Pick up, Drop, or Pay selected controls dispatch. Public selector letters and existing classic routes remain accelerators to the same actions.
- Add a central or selected-item-pane explicit transfer button with the same larger primary/secondary button vocabulary as UXM-05. Do not dispatch from row double-click or drag/drop; pointer and keyboard both select first, then use a named action.
- Update instruction dynamically for pointer and keyboard, not `Drag items` only.
- Preserve selection/focus by stable item ID through authoritative pane refresh and selector remapping.
- Disable all dispatch during pending acknowledgement. On reject, reconcile authoritative panes and use UXM-01 actionable failure copy. On interruption, close or suspend according to core ownership and explain why.
- Consume UXM-05 `ItemPresentation` and its allocation rule without a local variant: selector keycap when public, icon, two-line-capable full name, quantity, and only transaction-essential ownership/price state in the row. Category, BUC, charges, other known facts, blockers, and item actions belong in a stable selected-item detail/action region; bill totals remain in the bill summary. Do not add local naming regexes or chip piles.
- Finish shop specialization: Shop bill title, prices, selected total, available gold and remaining debt only when public, Pay selected, partial-payment behavior, insufficient funds, and accepted sell-offer vocabulary.
- Remove Source, Destination, and Transfer summary from all shop states. Generic container/ground transfer may use pane names, but player actions remain explicit verbs.
- Preserve existing direct snapshot/transfer routes and no raw `#loot` fallback where the public direct route is required.

### User flows and states

- Container: Open chest, select dagger with click or row Enter, move to the explicit Take control and activate it, wait for confirmation, move focus to the same logical area, use explicit Put in to reverse, then Done back to the Open chest invoker.
- Ground: Open Pick up, select item, Pick up, switch pane, Drop, and close.
- Keyboard-only: no drag or pointer required at any point.
- Shop: open bill, select one or more items, review authoritative selected total/gold/debt, Pay selected, receive confirmed outcome or insufficient-funds failure.
- Stale/interrupted: item moves or monster interrupts. The dialog does not retry, stale selection is explained, and no duplicate turn occurs.

### Edge cases

- Empty container, locked/trapped/destroyed container, item with no selector, selector remap, duplicate display names, multi-item stack, partial quantity, direct rejection, pending close request, interruption, ground menu owner, container refresh, full inventory, insufficient funds, partial bill, shopkeeper no longer adjacent, sale accept/decline/remaining/stop.

### Out of scope

- No bulk transfer unless existing core multi-select semantics support it and the route is proven authoritative.
- No pause-free inventory management, automatic retry, estimated price, credit, or debt.

### Concrete implementation guidance

- Keep `transfer-transaction-model.js`, public snapshot adapters, and direct command envelopes as source of truth.
- Refactor `renderContainerTransferPanel`, `renderContainerItemRow`, and transfer ownership code behind `transfer-dialog.js`; do not weaken reconciliation to simplify UI.
- Remove selector wording from visible row and action labels. Selector letters may appear as optional keycaps only when meaningful.
- `shop-bill.js` should consume typed/public menu values. If available gold/debt is unavailable, omit rather than parse status text.
- Shop status results use `PlayerNotice`, not a special global `shopPaymentUiStatus` competing with prompt status.

### Required tests and evidence

- Visible dialog title/instructions/action order, focus entry/trap/return, visible focus, arrow/Space/Enter/Escape, selector accelerators, explicit-action dispatch, pending lock, stable focus after refresh, input ownership, and rejection/interruption tests.
- Shared item-row tests for full/wrapping names, large lists, shop ownership/price, unidentified items, and absence of category/BUC/charges/action chip crowding.
- Integrated regression evidence for the complete loaded, empty, long-name, large-inventory, unidentified, shop, layered-armor, two-ring, two-handed, and blocker matrix at 1360x920, 960x720, and 200 percent zoom. Equipment-only states prove that consuming `ItemPresentation` did not regress the approved UXM-05 paper doll/callout design.
- Transaction model tests remain unchanged and pass. Add explicit duplicate-dispatch assertions.
- Existing container/ground classification, selector remap, owner lifecycle, direct shim, locked/destroyed boundary, shop offer/payment, and Escape tests.
- Real Electron keyboard-only container and ground transfers both directions.
- Real shop sufficient funds, insufficient funds, partial selection, stale context, and sell offer.
- Pointer/keyboard parity proof: click and row Enter select only; explicit controls dispatch; right-click and Shift+F10 open the same menu; double-click and drag/drop do not dispatch.
- Screenshots at 1360x920, 960x720, and 200 percent zoom for initial, selected, pending, confirmed, rejected, restored-focus, loaded, empty, long-name, large-inventory, unidentified, shop, layered-armor, two-ring, two-handed, and blocker states. Use view-safe derivatives and a QC manifest; reject cut-off names, unreadable chips, overlapping callouts, obscured/missing character art, hidden actions, or horizontal scrolling.

### Acceptance checklist

- [ ] Container and ground transfer are proper modal dialogs with clear visible titles and instructions.
- [ ] Full transfer flow works keyboard-only.
- [ ] Click and Enter select only; only an explicit visible verb, selector accelerator, or existing classic route dispatches.
- [ ] Pending state blocks duplicate dispatch.
- [ ] Focus and selection survive authoritative refresh safely.
- [ ] Escape/Done closes one layer and restores the invoker.
- [ ] Shop uses bill/payment language and core totals only.
- [ ] Partial and insufficient payment mirror core behavior.
- [ ] Selector letters appear only as useful public accelerators, never as raw selector plumbing; snapshot, revision, and transaction language remain hidden.
- [ ] Transfer/shop rows follow UXM-05's readable row allocation, with secondary facts/actions in the selected-item region and no cramped chip ribbon.
- [ ] Loaded, empty, long-name, large-inventory, unidentified, shop, layered-armor, two-ring, two-handed, and blocker regression states pass at 1360x920, 960x720, and 200 percent zoom with no cut-off distinguishing names, unreadable chips, overlapping callouts, obscured/missing character art, hidden actions, or horizontal scrolling.
- [ ] Existing direct public boundary and interruption behavior remain intact.
- [ ] Glimmer signs off every transfer/shop state and screenshot.

### Developer handoff brief

You are implementing **UXM-06, Keyboard transfer and shop transaction UX**, from the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**. UXM-00, UXM-01, and the stable reduced `ItemPresentation` API from UXM-05 are dependencies. The overall modernization preserves authoritative NetHack transfer and shop semantics while removing drag-only and generic transaction UI. Consume UXM-05's row allocation exactly: selector, icon, two-line-capable full name, quantity, and transaction-essential ownership/price only; put secondary facts and consistently sized named actions in the selected-item region. Click and row Enter select only. Explicit controls dispatch; selector letters/classic routes accelerate; right-click/Shift+F10 open the same action menu; double-click and drag/drop do not dispatch. Your interfaces are `TransferDialog`, `ShopBill`, focus/selection restoration, and transaction-to-notice mapping. Do not edit UXM-05 naming contracts or UXM-01 shell behavior locally. Forbidden regressions include duplicate transfer, automatic retry, implicit row dispatch, raw fallback commands, selector plumbing, cramped metadata/action chips, cut-off names, hidden actions, horizontal scroll, stale optimistic panes presented as truth, altered interruption, bulk behavior not supported by core, or estimated prices. Return diff, keyboard matrix, transaction-state proof, automated and real Electron results, exact player steps, and the complete loaded/empty/long-name/large-inventory/unidentified/shop/layered-armor/two-ring/two-handed/blocker regression matrix at 1360x920, 960x720, and 200 percent zoom. Return every raw/view-safe screenshot and inspection note, QC manifest, diagnostics/logs, and risks. Completion evidence must explicitly include changed-file ownership, every command and exit status, the commands/turns/cancellation/public-data/hidden-omission semantic statement, dimensions/hashes/raw-to-derivative relationships, keyboard/focus/input-ownership evidence, Electron stdout/stderr, diagnostic summaries, and `logs/last-run.log` inspection. Glimmer reviews; any rejection returns to you for revision until sign-off.

## UXM-07: Save, restore, and authoritative final chronicle

### Objective

Make run lifecycle actions easy to find and final-state information trustworthy while preserving NetHack's single-save, recovery, permadeath, and disclosure semantics.

### Scope

- Register Save and exit and Quit in the command catalog Run section with clear danger/confirmation and core acknowledgement.
- Do not show save success until acknowledged. Failure and recovery use UXM-01 notices.
- Enrich Continue previous game with public hero, role, dungeon level, and save/recovery timestamp when available. Clearly distinguish saved versus recoverable checkpoint.
- Define and implement additive authoritative final-run payload for exact cause, score, turns, depth, conduct/highlights, and available statistics where the core emits them.
- Final chronicle prioritizes exact cause, score, turns, depth, and available highlights. Omit unavailable fields. Never show `(hidden)`.
- Keep New game and Exit always visible without scrolling at both supported sizes and 200 percent zoom. Detailed disclosures may scroll independently.
- Use finalized payload over cached status or message inference. Keep `deathCauseFromText` only as labeled fallback and test priority ordering.
- Preserve all NetHack final disclosure prompts and canonical text. Do not fabricate conduct or achievements.

### User flows and states

- Save and exit: palette Run section, explicit confirmation, core action, acknowledged success, return to startup with Continue metadata.
- Save failure: visible reason/recovery path, no success claim.
- Recovery: startup identifies recoverable versus saved run and prepares only after explicit Continue.
- Death: terminal final chronicle opens with exact available facts, Escape blocked with visible explanation and actions, New game or Exit remains reachable.
- Missing payload field: section/row is omitted, not guessed.

### Edge cases

- Process crash during save, stale recovery candidate, existing game with same name, quit without save, death during level transition, polymorphed/final HP cache, disclosure menus arriving after initial death line, multiple death-cause candidates, generic `You die...`, game over at minimum height, no score/turns available.

### Out of scope

- No multiple slots, autosave promise, duplicate/copyable save, rewind, undo, or death prevention.
- No inferred conduct/highlight from renderer history unless explicitly labeled non-authoritative and approved. Preferred behavior is omission.

### Concrete implementation guidance

- Add final payload types to `ui-protocol-v2.js`, `shim-protocol.js`, the bridge/native emitter, and `game-view-state.js`. This is mandatory serialized protocol slot 5 after UXM-02's structured-result slot 4 green handoff.
- Recovery metadata extends `main/recovery-state.js` using only filesystem/core facts already safe to expose.
- Final chronology waits for finalized payload/disclosure completion within a bounded non-blocking state. Show a truthful loading state if needed, but keep actions visible.
- Remove `allStatusStats()` `(hidden)` behavior from final presentation.

### Required tests and evidence

- Protocol valid/invalid fixtures, payload priority, late disclosure merge, missing fields, fallback cause, and duplicate final-event idempotence.
- Recovery state tests for saved/recoverable/stale/none and public metadata.
- Existing game-over, death parsing, death-new-random, stair/game-over, startup recovery, command transaction, and save input tests.
- Real Electron Save and exit, Continue, recovery if feasible, exact death cause, missing-field fixture, late statistics, New game, Exit, and Escape blocked.
- Screenshots at both sizes and 200 percent zoom for Continue cards, save confirmation/result/failure, final loading/finalized/missing-field states.

### Acceptance checklist

- [ ] Save and exit is discoverable and not conflated with Quit.
- [ ] Success appears only after core acknowledgement.
- [ ] Continue metadata is public, accurate, and distinguishes recovery.
- [ ] Final payload outranks stale cache and parser fallback.
- [ ] Exact available cause/score/turns/depth/highlights are prioritized.
- [ ] Unavailable fields are omitted; `(hidden)` never appears.
- [ ] New game and Exit remain visible at all supported states.
- [ ] Escape remains safe and does not leak.
- [ ] Single-save/permadeath semantics are unchanged.
- [ ] Glimmer approves lifecycle copy and final visual evidence.

### Developer handoff brief

You are implementing **UXM-07, Save, restore, and authoritative final chronicle**, from the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**. UXM-00 and UXM-01 are dependencies; mandatory final-run protocol work is serialized slot 5 after UXM-02's structured-result slot 4 green handoff. The overall effort modernizes presentation without weakening permadeath or save constraints. Your interfaces are Run lifecycle actions for UXM-03's catalog, recovery metadata, authoritative final-run payload, and final chronicle. UXM-08 later handles responsive, mainstream-keyboard, visual-usability, and motion conformance. Forbidden regressions include success before acknowledgement, duplicate saves, autosave claims, stale HP presented as final truth, guessed cause/conduct, `(hidden)`, actions below an unreachable fold, or Escape leakage. Return diff, payload docs/fixtures, recovery and priority tests, real Electron steps/results, every screenshot and inspection note, diagnostics/logs, and limitations. Completion evidence must explicitly include changed-file ownership, every command and exit status, the commands/turns/cancellation/public-data/hidden-omission semantic statement, raw and view-safe frames at 1360x920, 960x720, and 200 percent zoom, dimensions/hashes/QC manifest, keyboard/focus/input-ownership notes, Electron stdout/stderr, diagnostic summaries, and `logs/last-run.log` inspection. Glimmer reviews and returns rejected work to you until signed off.

## UXM-08: Responsive, keyboard, visual-usability, motion, and optional sound conformance

### Objective

Apply system-wide responsive, sighted-player usability, and mainstream keyboard conformance after all feature surfaces exist, then add restrained confirmed-state feedback with a complete reduced-motion and sound-off path.

### Scope

- Implement structural compact desktop mode at 960x720: compact shell, collapsed static status, deliberate Inventory/Equipment tabs or stacking, a prominent non-thumbnail scaled full-character paper-doll view as the leading Equipment region, grouped semantic slot list, stacked item details/actions, bounded dialogs, usable transfer, and map without horizontal page overflow. A plain equipment-only list is not an acceptable compact substitute.
- Validate full desktop at 1360x920 and intermediate resizing. Do not support below production minimum except explicit test diagnostics.
- Complete mainstream keyboard and modal-focus audits across every final surface, including map focused-cell inspection, command palette, Help, items, transfers, shop, save, and final chronicle.
- Standardize the keyboard map-inspection model around one visibly selected cell with concise public details and actions. Preserve map readability without turning all 1,680 cells into simultaneous interaction targets.
- Verify visible hierarchy, readable text, clear labels and action order, visible focus, modal focus entry/trap/return, one-Escape behavior, singular input ownership, non-color cues, target sizes, contrast, and 200 percent text zoom.
- Audit final item surfaces against UXM-05's allocation: wider full-mode inventory; selector/icon/two-line name/quantity/essential state rows; secondary facts and consistent actions in details; filters; unobscured full-character art; reserved non-overlapping callouts; and structural compact adaptation.
- Add transform/opacity feedback for confirmed item movement, HP/status change, target selection, and level transition. Never delay input.
- Enforce exactly-once feedback presentation by event ID/sequence/revision. Live rerender, public snapshot recovery, reconnect, replay playback, duplicate delivery, and responsive remount must not replay HP, movement, danger, prompt, or game-over feedback.
- Respect OS `prefers-reduced-motion` and the v2 motion setting. Reduced mode removes nonessential feedback and spinner rotation.
- Record the confirmed sound-off/deferred conformance result. Ship no sound in this modernization unless a later separate Boss approval supplies licensed assets and explicitly supersedes the canon; only then add optional UI sounds for confirmed action, danger, prompt, and game over, with separate UI/game toggles and volume.
- If sound assets are generated or added, document source/license and follow applicable project asset QA. No sound may imply an unseen result.

### User flows and states

- Resize from full to compact with an open dialog, preserving active owner, selection, action visibility, and focus.
- Navigate a complete gameplay loop keyboard-only with visible focus and one active input owner.
- Inspect the visibly selected map cell, move selection by keyboard, use its visible actions, and return focus without dispatch leakage.
- Enable 200 percent text zoom and complete startup, palette, inventory, transfer, and final actions.
- Enable reduced motion and confirm no nonessential animation.
- Under the confirmed policy, verify no sound assets, playback, or player controls ship or initialize. Only if a later separate Boss approval supersedes the canon, toggle approved sound independently and verify hidden/unknown events produce no sound.

### Edge cases

- Resize during prompt/target/transfer pending; loaded/empty/long-name/large-inventory/unidentified/shop/layered-armor/two-ring/two-handed/blocker item states; very long hero/cause text; many conditions; dense manual; high contrast plus glyph overlay; OS preference changes at runtime; rapid repeated messages; background app; DOM focus versus game key routing. Missing/failed audio decode and audio-device-unavailable states apply only if later-approved sound ships.

### Out of scope

- No mobile/touch claim, controller/haptics, real-time combat animation, decorative motion, or sound-driven gameplay information.
- No redesign of domain flows already approved. Issues return to the owning developer through Glimmer if they are domain defects.

### Concrete implementation guidance

- Use CSS container/media rules and structural render modes, not fluid heading gimmicks.
- Avoid layout-property animation. Motion tokens from UXM-01 control duration/easing.
- Add a keyboard-and-visual-usability conformance matrix and a screenshot matrix manifest.
- Combine automated layout/overflow and keyboard-contract checks with manual keyboard/focus operation, zoom, contrast/non-color review, and screenshot inspection. No single method replaces the others.
- `feedback-adapter.js` persists bounded presented-`outcomeKey` and event-ID ledgers plus source sequence/revision. It uses the 50 ms lower-precedence coalescing buffer from the global contract, handles typed-state-first and typed-result-first identically, clears only at a verified new-run boundary, ignores recovery/replay delivery by default, and records replacements/suppressed duplicates to diagnostics.
- Performance: feedback adapter must be passive and event-driven. Under the confirmed policy there is no audio preload; if later-approved sound ships, its preload cannot block app startup or the renderer.

### Required tests and evidence

- Layout assertions and screenshots for every final major surface at 1360x920, 960x720, and 200 percent zoom.
- Item-specific matrix at all three evidence targets for loaded, empty, long-name, large-inventory, unidentified, shop, layered-armor, two-ring, two-handed, and blocker states. At full mode prove anchored, opaque, high-contrast character-safe callouts; at compact/zoom structural mode prove the grouped, opaque, high-contrast, selection-linked slot list beside or below the prominent full-character art. At every target prove two-line names, visible filters, stable details/actions, and zero horizontal overflow.
- Keyboard-only end-to-end: new game, movement, palette command, inventory action, map inspect, container/ground transfer, shop, stairs, save/restore, and game over.
- Mainstream keyboard and focus matrix across startup, onboarding, palette, Help, map focused-cell inspection, item selection/action, transfer, shop, save/restore, status/consequence, and final chronicle. Record initial focus, trap, return target, visible focus, one-Escape result, visible labels/action order, and active input owner.
- Contrast report for tokens/components, text-readability inspection, and non-color cue inspection.
- Reduced-motion automated media-query check and manual visual proof.
- Feedback deduplication tests for ordinary rerender, responsive remount, duplicate event, out-of-order event, snapshot recovery, reconnect, replay playback, new-run reset, game-over idempotence, and the same correlated outcome arriving as both typed-result and typed-state in either order. Assert source precedence yields one presentation.
- Sound-on/off/failure tests only if sound ships, including license manifest.
- Render performance and no input-latency regression checks.

### Acceptance checklist

- [ ] Every major final surface works at 1360x920 and 960x720.
- [ ] No horizontal page scroll, clipped primary action, or overlapping content.
- [ ] Equipment retains the prominent unobscured full-character paper doll in full mode and as the leading substantial, non-thumbnail full-character view in compact mode. Full-mode callouts remain anchored, opaque, high-contrast, readable, and non-overlapping; compact mode deliberately uses the same grouped selection-linked slot list beside or below the art.
- [ ] Item rows, filters, details, and actions pass the UXM-05 contract with no cut-off distinguishing names, unreadable chips, hidden actions, or squeezed side-by-side compact layout.
- [ ] Core flows complete at 200 percent text zoom.
- [ ] Keyboard-only matrix passes end to end.
- [ ] Every modal surface passes focus entry/trap/return, visible-focus, one-Escape, visible-label/action-order, and singular-input-owner checks.
- [ ] Keyboard map inspection exposes a concise visibly selected cell and clear visible actions without input leakage.
- [ ] Contrast, text readability, and non-color cues pass.
- [ ] Reduced motion removes nonessential motion and never delays input.
- [ ] Rerender, remount, recovery, reconnect, replay, duplicate delivery, and dual typed-result/typed-state delivery cannot replay the same correlated feedback; source precedence is deterministic and a verified new run resets the bounded ledger.
- [ ] The confirmed sound-off/deferred policy is recorded, and evidence proves no sound assets, playback, or controls ship. If a later approval supersedes it, the new decision, default, licensing, controls, and failure behavior are documented and tested.
- [ ] No feedback reveals hidden information.
- [ ] Glimmer signs off the full screenshot and keyboard/visual-usability matrix.

### Developer handoff brief

You are implementing **UXM-08, Responsive, keyboard, visual-usability, motion, and optional sound conformance**, from the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**. UXM-02 through UXM-07 must already be integrated and individually Glimmer-approved. The effort's core promise is a coherent, truthful, keyboard-first desktop NetHack UI for sighted players. Your chunk verifies all final surfaces at full and compact sizes, 200 percent zoom, keyboard-only operation, modal focus entry/trap/return, visible focus, one-Escape behavior, clear visible labels/action order, singular input ownership, readable text, contrast, non-color cues, reduced motion, and optional sound. For items, certify UXM-05 rather than redesigning it: full mode gives inventory the larger width; compact uses tabs/stacking; the full-character paper doll stays prominent and unobscured, including as the leading non-thumbnail compact region; full-mode callouts remain anchored, opaque, high-contrast, and non-overlapping while compact deliberately uses the same grouped, opaque, high-contrast, selection-linked slot list; rows preserve selector/icon/two-line name/quantity/essential state; secondary facts/actions stay in details; filters and explicit actions remain reachable. Apply the scope exclusion in section 1.1; no excluded evidence gate can block this chunk or Glimmer closure. You consume every domain interface and must return domain defects to the owning developer through Glimmer rather than patching their files. Forbidden regressions include a missing/plain-list paper doll substitute, cut-off names, unreadable chips, obscured art, overlapping callouts, hidden actions, squeezed compact columns, horizontal scroll, mobile claims, focus/input leakage, blocking animation, hidden-information sound, unlicensed assets, or visual fixes that alter gameplay. Return the loaded/empty/long-name/large-inventory/unidentified/shop/layered-armor/two-ring/two-handed/blocker matrix at 1360x920, 960x720, and 200 percent zoom alongside the responsive/keyboard/visual-usability matrices, diff, automated layout and keyboard results, real Electron end-to-end steps, every screenshot and personal inspection note, contrast/readability/non-color evidence, focus/input-ownership proof, motion and sound-off/no-assets proof (or conditional approved-sound proof if the canon is later superseded), diagnostics/logs, and risks. Completion evidence must explicitly include changed-file ownership, every command and exit status, the commands/turns/cancellation/public-data/hidden-omission semantic statement, dimensions/hashes/QC manifest, complete keyboard/focus/one-Escape/input-ownership evidence, replay/reconnect feedback deduplication proof, Electron stdout/stderr, diagnostic summaries, and `logs/last-run.log` inspection. Glimmer reviews and returns rejected conformance work to you until signed off.

## UXM-09: System integration, regression certification, and release evidence

### Objective

Progressively stage each candidate on a merged review baseline for Glimmer, promote only approved merged revisions, remove each replaced compatibility presenter before that candidate is approved, then run final interaction, visual, and regression certification after UXM-08.

### Scope

- In UXM-09A, stage unapproved candidate revisions only on disposable merged review baselines, with required provider wiring and exact compatibility-presenter removal. Promote them only after Glimmer approves the merged behavior and evidence.
- Own all late edits to `renderer.js`, `renderer.html`, `styles.css`, `main.js`, script order, `MODULE_MAP.md`, broad package scripts, and compatibility fallback removal.
- Ensure each domain has one owner. Remove old quick actions, static Actions grid, duplicate status writers, old item naming, old absolute/overlapping slot-callout implementation, old transfer section behavior, and old heterogeneous dialog rendering in the same staged delta as their proven replacements. Preserve the character illustration itself; compatibility removal may not remove or downgrade the paper doll. Glimmer reviews that removal before promotion.
- Resolve protocol slots in order and rerun all golden/invalid/replay compatibility tests.
- Run complete interaction, real scenario, input safety, save/recovery, render performance, manifest/asset, and architecture suites relevant to the final app.
- Execute system smoke at both supported sizes and 200 percent zoom. Preserve all raw screenshots, view-safe derivatives, state snapshots, logs, and QC manifests.
- Inspect `logs/last-run.log` and every diagnostic summary. Record expected SIGTERM separately from app failures.
- Produce a final implementation conformance report mapping every `SAFE-*` ID to code, tests, evidence, and Glimmer sign-off.

### Out of scope

- No new domain behavior, visual redesign, protocol field, compatibility shortcut, gameplay command, or unapproved dependency may originate in integration.
- Do not waive a failed or missing chunk acceptance item. Return it to the original developer through Glimmer.
- Do not regenerate tiles, alter core balance, or commit/push unless separately authorized.

### Integration order

1. UXM-00 runtime/settings/harness.
2. UXM-01 interaction foundation.
3. UXM-05 domain UI plus protocol slot 1, item fields.
4. UXM-03 domain UI plus protocol slot 2, spell/skill rows.
5. UXM-04 domain UI plus protocol slot 3, target metadata.
6. UXM-02 domain UI plus protocol slot 4, structured result events.
7. UXM-07 domain UI plus protocol slot 5, final-run payload.
8. UXM-06 transfer/shop against the integrated item API.
9. Confirm all replaced compatibility presenters were removed and promoted with their owning chunks.
10. UXM-08 conformance/feedback on the final-surface baseline.
11. UXM-09B final certification and behavior-neutral dead-code cleanup only.

The UI merge order differs from parallel development order to serialize protocol and central ownership safely. Steps 3 through 9 are UXM-09A progressive staging; steps 10 through 11 close the effort.

### Required tests and evidence

- Run every focused suite named by UXM-00 through UXM-08 from the final integrated baseline, then the broad architecture, protocol, fixture, UI, input safety, public-boundary, transaction, save/recovery, render-performance, manifest, and asset-visual QA suites.
- Run every real Electron journey in the smoke list below without concurrent CDP/build output contention.
- Capture the complete 1360x920, 960x720, and 200 percent zoom screenshot matrix; preserve raw and view-safe artifacts, dimensions, hashes, state snapshots, and QC manifests.
- Open and inspect every accepted frame. Record per-frame observations and reject black bands, clipping, stale/internal text, wrong assets, hidden actions, focus mismatch, incoherent hierarchy, cut-off item names, unreadable chips, overlapping callouts, obscured/missing character art, or horizontal scrolling.
- Record classic and GUI command routes, commands sent, turns spent, cancellation, public data sources, and intentionally omitted hidden fields.
- Include mainstream keyboard operation; modal focus entry/trap/return; visible focus; one-Escape behavior; clear visible labels/action order; singular input ownership; 200 percent zoom; contrast/readability/non-color; reduced-motion; visible-feedback deduplication; and sound-decision evidence.
- Preserve Electron stdout/stderr, all diagnostic summaries, performance measurements, and `logs/last-run.log` inspection.

### Required system regression criteria

- Core command keys, counts, menu letters, `#`, arrows, `hjklyubn`, Escape, save/quit, and classic prompt flows remain unchanged.
- No new action, auto-path, outcome preview, identification, hidden data, undo, save slot, or automation exists.
- Every palette/context/item/transfer action routes through an existing or approved typed core route.
- Unknown item/monster/map/container/target/final facts stay unknown.
- All selections and presentation mode changes are turnless.
- Prompt ownership is singular; duplicate dispatch and Escape leakage tests pass.
- Header/player notices contain no forbidden transport terms.
- Map, urgent state, latest consequence, command access, and History remain visible at supported sizes.
- Every dialog and menu is keyboard-operable and focus-safe.
- Inventory click/Enter selection is turnless; named actions dispatch; selector letters, Shift+F10/right-click, and classic routes remain equivalent accelerators.
- Inventory rows preserve full/two-line names and reserve secondary facts/actions for the stable details pane. Equipment preserves the unobscured paper doll and anchored non-overlapping semantic callouts in full mode; compact mode retains the prominent non-thumbnail art and deliberately replaces callout rails with the same grouped selection-linked slot list.
- Canonical message log and final disclosure text remain exact.
- Save/permadeath/recovery semantics remain intact.
- Render performance and startup/input latency remain within agreed budgets.
- No asset manifest or transparency regressions. This plan does not require tileset regeneration.

### Required final real Electron smoke

1. Startup with no saved game, character constraints, Advanced options, intro, first-turn guide, and classic first movement.
2. Startup with saved/recoverable game and Continue metadata.
3. Command palette search by name, alias, and key; raw `#`; counts; Save and Quit cancellation.
4. Help Basics/Keys/Commands/Manual.
5. Full/Follow map, Inspect, target selection, door, trap, stairs, and multiple creature context.
6. Inventory/equipment at 1360x920, 960x720, and 200 percent zoom: prominent unobscured full-character paper doll; loaded, empty, long-name, large-inventory, unidentified, shop-owned, layered-armor, two-ring, two-handed, and blocker states; filters; stable details/actions; known/unknown compare; selector letters; Shift+F10/right-click; and existing classic routes. Full mode proves anchored, opaque, high-contrast helmet/eyes/amulet, cloak/suit/shirt, gloves/boots, main/offhand, ring, and quiver/alternate callout groups. Compact/zoom structural mode proves the same groups in the opaque, high-contrast, selection-linked slot list beside or below the prominent art.
7. Keyboard-only container and ground transfer both directions, stale/rejected/interrupted state.
8. Shop payment sufficient, insufficient, partial selection, and sell offer.
9. Combat/hazard consequence, urgent statuses, exact History, and level transition.
10. Save and exit, Continue, death/final payload, missing field omission, New game, Exit.
11. Repeat applicable flows at 960x720 and 200 percent zoom.
12. Repeat feedback sample under reduced motion; sound off and on if approved.

### Acceptance checklist

- [ ] Every staged candidate has a review-baseline identifier; every promoted primary chunk has a recorded merged-baseline Glimmer approval.
- [ ] Traceability report covers SAFE-01 through SAFE-31 with no omission.
- [ ] Central files contain one implementation per domain and no dead competing UI.
- [ ] All required automated suites pass or every failure is documented and blocking.
- [ ] Full real Electron smoke passes at required viewports/zoom.
- [ ] The complete item-state matrix passes at 1360x920, 960x720, and 200 percent zoom, including paper-doll prominence, full-mode anchored callouts, compact grouped selection-linked slot lists, readable rows/details, filters, actions, and accelerator parity.
- [ ] No accepted item frame has cut-off names, unreadable chips, overlapping callouts, obscured/missing character art, hidden actions, or horizontal scrolling.
- [ ] Every acceptance screenshot was opened and inspected personally.
- [ ] QC manifests preserve raw and view-safe evidence relationships.
- [ ] Diagnostics and `logs/last-run.log` contain no unexplained error/exception/assertion.
- [ ] Performance, input safety, public-boundary, and save semantics pass.
- [ ] No mechanics-affecting excluded idea entered the product.
- [ ] Final conformance report is complete.
- [ ] Glimmer gives final system-level sign-off.

### Developer handoff brief

You are implementing **UXM-09, Progressive integration, system regression certification, and release evidence**, from the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**. Phase A begins after UXM-01 and stages each unapproved domain candidate for merged Glimmer review; Phase B depends on all UXM-02 through UXM-08 promotions. The overall effort delivers one coherent map-first, truthful, keyboard-first NetHack UX for sighted players without changing rules, hidden knowledge, classic keys, turn costs, save constraints, or permadeath. You are the sole late central-file and integration owner. Integrate protocol slots in the specified order and remove old fallbacks only after parity proof. For UXM-05, remove the absolute overlapping callouts and cramped row presenter but preserve the illustrated character asset and the approved prominent paper-doll experience. Certify the full/compact layout, shared UXM-06 item allocation, explicit-action/accelerator model, and loaded/empty/long-name/large-inventory/unidentified/shop/layered-armor/two-ring/two-handed/blocker matrix at 1360x920, 960x720, and 200 percent zoom. Return domain defects to the original developer through Glimmer rather than masking them. Forbidden regressions include removing/downgrading the paper doll, cut-off names, unreadable chips, obscured art, overlapping callouts, hidden actions, horizontal scroll, any unapproved mechanics, duplicate domain owner, stale compatibility UI, skipped real Electron proof, uninspected screenshot, or unexplained log error. Return the integrated diff, SAFE-01 through SAFE-31 conformance matrix, all command results, full smoke steps, every raw/view-safe screenshot and inspection note, QC manifests, state evidence, performance data, diagnostics/logs, caveats, and explicit list of prior Glimmer approvals. Completion evidence must explicitly include changed-file ownership, every command and exit status, the commands/turns/cancellation/public-data/hidden-omission semantic statement, dimensions/hashes/raw-to-derivative relationships, mainstream keyboard/modal-focus/visible-focus/one-Escape/visible-label/action-order/input-ownership and visible-feedback-deduplication evidence, Electron stdout/stderr, every diagnostic summary, and `logs/last-run.log` inspection. Apply the scope decision in section 1.1 and do not add excluded evidence gates. Glimmer performs final UX conformance review. Rejected integration returns to you, while rejected domain behavior returns to its original developer; the loop repeats until final sign-off.

## 9. Shared test and evidence standard for every chunk

Every chunk result must include:

1. Exact files changed and ownership confirmation.
2. Exact commands run with exit status and relevant output summary.
3. Unit/contract tests for central invariants.
4. Existing regression suites affected by the change.
5. Real Electron launch and actual player actions for every player-facing behavior.
6. Raw screenshot paths, view-safe accepted screenshot paths, dimensions, hashes, and QC manifest.
7. Personal inspection notes for every accepted screenshot, including anything odd, confusing, stale, clipped, diagnostic, or inconsistent.
8. State/DOM evidence only as a supplement, never a replacement for visual inspection.
9. Diagnostic run summary, Electron stdout/stderr, and `logs/last-run.log` inspection note.
10. Mainstream keyboard steps; modal focus entry/trap/return; visible focus; one-Escape result; clear visible labels/action order; singular input ownership; and visible-notice deduplication evidence.
11. Viewport evidence at 1360x920 and 960x720; 200 percent zoom when the chunk owns a dialog or persistent surface.
12. NetHack semantic statement: commands sent, turns spent, cancellation path, public data sources, and hidden fields deliberately omitted.
13. Risks, limitations, and anything not completed.
14. Glimmer approval or numbered rejection feedback and revision number.
15. For UXM-05, UXM-06, UXM-08, and UXM-09 item evidence: loaded, empty, long-name, large-inventory, unidentified, shop, layered-armor, two-ring, two-handed, and blocker coverage at 1360x920, 960x720, and 200 percent zoom, with explicit inspection for cut-off names, unreadable chips, overlapping callouts, obscured/missing character art, hidden actions, and horizontal scrolling.

A screenshot assertion is not visual inspection. A black/blank/cropped preview fails until a view-safe artifact is produced and opened. Do not cite historical screenshots with `Version check failed`, `Unknown command`, raw prompt text, overlap, clipping, generic death cause when exact cause is available, or unreachable actions as acceptance proof.

## 10. Decisions and risk register

| Decision/risk | Current plan position | Owner/action |
|---|---|---|
| Product/design canon | Confirmed by the Boss on 2026-07-11 and recorded in `PRODUCT.md`, `DESIGN.md`, and this decision record | Every chunk follows the confirmed canon; UXM-09 rejects drift |
| Minimum desktop size | 960x720 production minimum, 1360x920 primary review | UXM-00 validates, UXM-08 certifies |
| Compact HUD default | Boss-confirmed as the intended default on 2026-07-11 | UXM-02 implements; UXM-08/09 certify |
| `#` palette versus raw extended command | Must preserve expert raw command path; exact activation needs implementation proof | UXM-03/Glimmer |
| Empty hero name | Must not become `Electron`; choose validation or approved generated name | UXM-03/product owner |
| Peaceful attack confirmation | Explicit confirmation only for GUI Dangerous actions; classic movement/Fight unchanged | UXM-04 |
| Illustrated equipment and item density | The Boss requires the full-character paper doll to remain prominent. Full mode gives inventory the larger width, keeps slot callouts in reserved opaque and high-contrast rails, and moves secondary item facts/actions to a stable pane. Compact mode uses tabs/stacking while retaining the full figure as a leading substantial region and uses a grouped selection-linked slot list. | UXM-05 implements; UXM-06 consumes; UXM-08/09 certify |
| Target legality metadata | Remove placeholder claims immediately, then complete mandatory authoritative protocol slot 3 before UXM-04 closes | UXM-04 |
| Combat/result classification | Mandatory structured public result events in slot 4; conservative fallback only for compatibility; unclassified canonical text preserved | UXM-02 |
| Final-run payload | Additive authoritative protocol; parser remains fallback only | UXM-07 |
| Keyboard map-inspection model | A concise visibly selected-cell inspector is the required default; keyboard selection, visible public details/actions, focus return, one-Escape behavior, and input ownership contribute to `SAFE-29` closure. | UXM-08/Glimmer |
| Sound | Boss-confirmed off by default and deferred; no sound ships unless separately approved with licensed assets | UXM-08 records the off/deferred conformance result |
| Renderer coupling | Runtime scaffold and ownership freeze prevent parallel central edits | UXM-00/UXM-09 |
| Protocol overlap | Five serialized slots: 1 item, 2 spell/skill, 3 target, 4 structured result, 5 final-run; every slot starts from the prior recorded green baseline | UXM-09 enforces |
| Screenshot PNG anomaly | Preserve raw, make view-safe derivative, inspect exact accepted file | Every chunk |
| Test concurrency | Do not run Electron/CDP scenarios concurrently on shared ports/build outputs | Every developer |
| Long implementation horizon | Glimmer review occurs per chunk, not only at the end | Secretary/Glimmer |

No additional gameplay or product-canon decision is needed for the approved chunks. The Boss-confirmed product/design canon and sound-off/deferred policy are already recorded. UXM-08 still implements reduced motion and feedback hooks and records that no sound ships unless separately approved with licensed assets.

## 11. Final system-level sign-off checklist

### Product and semantics

- [ ] All SAFE-01 through SAFE-31 requirements are implemented and traced; `SAFE-29` uses the scope recorded in section 1.1.
- [ ] NetHack core remains the source of truth.
- [ ] Unknown facts stay unknown across map, items, targets, shops, status, and final state.
- [ ] No excluded mechanics-affecting idea was added.
- [ ] GUI and classic routes have equivalent commands, prompts, turns, interruption, and cancellation.
- [ ] Save, recovery, death, and permadeath semantics are unchanged.

### Coherence and interaction

- [ ] One command catalog, item grammar, dialog vocabulary, notice layer, focus layer, and message model exist.
- [ ] Map-first hierarchy is visible in practice.
- [ ] Selection is turnless and dispatch is explicit.
- [ ] One Escape handles one layer and never leaks.
- [ ] Failures are actionable, safe, and free of transport language.
- [ ] No duplicate quick/action/status/dialog implementation remains.

### Visual and responsive quality

- [ ] Full desktop and compact desktop are intentional and complete.
- [ ] No overlap, clipping, unreachable actions, horizontal page scroll, stale overlays, or raw diagnostic copy.
- [ ] Equipment, inventory, transfer, shop, palette, help, History, and final chronicle share one component vocabulary.
- [ ] Equipment preserves a prominent unobscured full-character paper doll with anchored, opaque, high-contrast, non-overlapping semantic callouts in full mode; compact mode retains the full figure as a leading non-thumbnail region and uses the same grouped selection-linked slot list.
- [ ] Inventory and transfer/shop rows show full/two-line-capable names and essential row state only; secondary facts/actions occupy stable details panes; filters and classic selectors remain available.
- [ ] 200 percent zoom preserves all core flows.
- [ ] Tokens, contrast, focus, semantic states, and non-color cues pass.
- [ ] Motion is brief/non-blocking and reduced-motion complete.
- [ ] Sound, if present, is optional, licensed, and no-spoiler.

### Mainstream keyboard and sighted-player usability

- [ ] Keyboard-only end-to-end smoke passes.
- [ ] Modal focus entry/trap/return, visible focus, one-Escape behavior, clear visible labels/action order, and singular input ownership are correct.
- [ ] `PlayerNotice` is visibly coherent and repeated outcomes deduplicate by stable identity.
- [ ] Keyboard map inspection uses a clear visibly selected-cell model with visible public details/actions.
- [ ] Readability, contrast, non-color cues, responsive layout, and 200 percent zoom pass as ordinary sighted-player usability.
- [ ] Loaded, empty, long-name, large-inventory, unidentified, shop, layered-armor, two-ring, two-handed, and blocker item states pass at 1360x920, 960x720, and 200 percent zoom with no cut-off names, unreadable chips, overlapping callouts, obscured art, hidden actions, or horizontal scrolling.

### Proof and operations

- [ ] Automated architecture, protocol, public-boundary, transaction, input, UI, performance, save/recovery, and asset tests pass.
- [ ] Real Electron scenarios cover every major journey.
- [ ] Every accepted screenshot was opened and inspected.
- [ ] Raw and view-safe evidence plus QC manifests are preserved.
- [ ] Logs and diagnostic summaries contain no unexplained failures.
- [ ] Every chunk has Glimmer sign-off after any required revision loop.
- [ ] UXM-09 has final Glimmer system sign-off.

## 12. Completion definition

The modernization is complete only when every chunk acceptance checklist, the shared evidence standard, and the final system checklist pass, and Glimmer has signed off the integrated system. A partial first batch, visual mock, fixture-only test, automated assertion without screenshot inspection, or protocol proposal without real gameplay proof is not completion. Completion includes the mainstream keyboard/focus/input-ownership requirements and ordinary sighted-player visual/responsive/zoom requirements defined above. Work excluded by the dated Boss decision in section 1.1 is outside completion and the backlog; it is not deferred.
