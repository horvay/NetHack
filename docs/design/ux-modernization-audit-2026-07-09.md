# NetHack Electron UX modernization audit

**Date:** 2026-07-09  
**Scope:** `electron-poc`, player-facing Electron experience  
**Goal:** Modernize usability and presentation while preserving NetHack rules, balance, player knowledge, discovery, keyboard play, and turn semantics.

## Executive summary

The app is no longer a thin terminal wrapper. It already has several strong modernization foundations:

- contextual actions based on public, player-visible state
- a tile map with semantic tooltips
- a paper-doll equipment screen with drag-and-drop and contextual item actions
- two-pane container and ground transfer panels
- named GUI choices for NetHack prompts instead of unexplained selector letters
- structured spell, skill, shop, status, save/restore, and game-over presentations
- classic NetHack keyboard input and menu-letter efficiency retained in parallel

The biggest UX problem is not missing features. It is that many individually useful surfaces compete at once. The player sees a dense status ribbon, a permanent quick-action ribbon, a contextual action ribbon, an 80-column map dominated by unexplored void, a prominent message panel, and a movement pad. Overlays then introduce a second vocabulary of dialogs, custom panels, and pop-up menus. The result feels capable but implementation-led rather than player-led.

The highest-value modernization is a **presentation and interaction consolidation**, not a mechanics redesign:

1. Make the hero, current threat/state, map, and latest consequence the visual hierarchy.
2. Replace internal lifecycle/status language with player-facing outcomes.
3. Turn the all-in-one Actions modal into a searchable command surface with progressive disclosure.
4. Make transfer and equipment flows keyboard-operable and visually stable.
5. Add optional first-turn guidance that teaches movement, turns, messages, context actions, and cancellation without giving strategic advice.
6. Build a small design system and accessibility/focus layer so every prompt does not invent its own behavior.

The first implementation batch should address shell clarity, first-turn guidance, command discovery, and transfer accessibility. It can be completed without changing any NetHack rule or adding new gameplay knowledge.

## Audit basis and evidence

### Repository and architecture inspected

- `electron-poc/src/renderer.html`: the complete static shell, 105 buttons and 8 native dialogs.
- `electron-poc/src/renderer.js`: 10,365-line DOM adapter and workflow controller.
- `electron-poc/src/styles.css`: 1,324 lines, with 289 hex color literals, 306 `rgba()` literals, 7 custom-property declarations, 8 media queries, one `:focus-visible` rule, and no `prefers-reduced-motion` handling.
- `electron-poc/src/main.js`: Electron window, process, recovery, recording, and IPC setup.
- `electron-poc/src/shared/*`: public UI protocol, game view state, inventory/equipment/ground/container snapshots, prompt rules, status HUD, action routing, transfer transactions, map presentation, and no-spoiler boundaries.
- `electron-poc/src/shared/MODULE_MAP.md`: confirms `renderer.js` is a known over-broad adapter and documents the CommonJS/browser-global migration seam.
- Existing UX plans and audits, including `gui-input-audit-2026-06-29.md`, `equipment-screen-paper-doll.md`, `inventory-selection-gui-audit.md`, `context-action-bar-gui-first-plan.md`, and `docs/escape-dismissal-audit.md`.

### Interactive exercise performed

A real Electron, fixture-backed NetHack container scenario was rerun through the existing MCP/CDP test harness, including a follow-up evidence run after screenshot review:

```text
NH_SCENARIO_CONTAINER_OUT_DIR=/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-phi-mapping-anchor-72/live-container \
NH_SCENARIO_CONTAINER_CDP_PORT=9801 \
NH_SCENARIO_CONTAINER_ID=container/unlocked-chest-on-hero \
node scripts/real-scenario-container-mcp-test.js
```

Result: **PASS**. The run started a real shim game, clicked the visible **Open chest** action, opened the two-pane container, dragged a dagger from the chest to inventory, then dragged it back. Direct public `container.snapshot` and transfer paths were used without raw `#loot` or selector fallback.

Accepted, personally inspected current-run frames:

- context action: `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-phi-mapping-anchor-72/live-container/stable/01-scenario-context-actions-stable.png`
- initial container: `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-phi-mapping-anchor-72/live-container/stable/02-scenario-container-panel-stable.png`
- settled open container: `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-phi-mapping-anchor-72/live-container/stable/03-after-container-open-no-readonly-chips-stable.png`
- stable post-transfer frame with the complete window and dialog: `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-phi-mapping-anchor-72/live-container/stable/04-container-to-inventory-post-transfer-complete.jpg`
- restored container preview: `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-phi-mapping-anchor-72/live-container/stable/05-restored-full-window-preview.png`
- screenshot encoding/pixel QC: `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-phi-mapping-anchor-72/live-container/screenshot-qc.json`
- diagnostic summary: `/home/horvay/.config/nethack-electron-poc/diagnostic-runs/2026-07-10T04-10-50-506Z-8adbe1d7/summary.json`

A separate real-input regression attempt from the original audit timed out during startup because its driver assumes a startup sequence that no longer matches the required startup-choice flow. It created no screenshots and is not acceptance evidence.

### Screenshot inspection notes and anomaly correction

Every screenshot from the follow-up run was opened and inspected. The earlier statement that all five source PNGs were clean was incorrect and has been withdrawn.

- The original full-size CDP PNG previews for frames 03, 04, and 05 can show large black bands with the dialog header/top controls apparently missing. Frame 04 is the acceptance-significant example reported in review.
- This is a screenshot encoding/preview interoperability artifact, not evidence of window displacement, cropping, renderer failure, or an unstable post-drag DOM state. Pillow decodes the complete 1360x920 RGB raster; lossless PNG transcodes are pixel-identical to the CDP captures; the captured state JSON reports an active container dialog and the expected rows; and the rerun reproduced the same raw screenshot hashes. The raw CDP files use many 4 KiB `IDAT` chunks, while a normal transcode/preview exposes the complete pixels.
- The accepted post-transfer derivative above was produced from that complete decoded raster and was opened successfully. It shows the full NetHack header, top controls, **Open container** title, **Done** button, both pane headings, food ration remaining in the container, and dagger present in inventory. The accepted restored preview shows the dagger returned to the container.
- The contextual **Open chest** action is clear and correctly distinguished from doors.
- The transfer panel shows real item names and stable panes with no raw fallback text.
- The panel tells players only to drag. Its double-click path is undocumented, and it has no visible keyboard transfer control.
- The header exposes internal state such as `container transfer panel ready`.
- The message log contains internal narration such as `GUI contextual action: Open chest.` alongside NetHack messages.

The source CDP PNGs and view-safe derivatives are both retained under the current Run Evidence directory; the source captures must not be cited as clean visual evidence without the anomaly note and QC manifest.

Representative existing screenshots were also opened and inspected for startup, character creation, intro, gameplay, full status, conditions, equipment, item context menus, Actions, spells, help, shops, pets, stairs, and game over. Specific references appear below.

## Product guardrails

All safe recommendations in this report follow these constraints:

1. **The core decides truth.** The renderer may explain only public facts emitted by NetHack or its no-spoiler adapters.
2. **Unknown stays unknown.** Unidentified appearance, BUC, trap, resistance, damage, price, container state, and monster facts remain hidden until NetHack reveals them.
3. **A GUI action is an alternate input, not a new power.** It must invoke the same command, prompt, turn cost, interruption, and result as classic input.
4. **Classic efficiency remains first-class.** `hjklyubn`, arrows, command letters, counts, menu letters, `#` commands, and Escape remain available.
5. **No undo, rewind, duplicate saves, or outcome preview.** Failure and permadeath remain meaningful.
6. **No automation disguised as convenience.** Auto-explore, auto-fight, automatic hazard avoidance, and tactical recommendations need separate approval.
7. **Cancellation is explicit.** Closing a renderer-only suggestion spends no turn; cancelling a NetHack-owned prompt follows NetHack's cancellation semantics.

## What is working and should be retained

### 1. Public-state contextual actions

`actionsForCurrentCell`, `actionForAdjacentCell`, `buildContextActions`, and `runContextAction` in `renderer.js:1652-2164` are the strongest modernization seam. Stairs, containers, fountains, shops, doors, pets, and nearby creatures are translated into words without replacing NetHack's core resolution.

The real stairs proof shows direct typed `terrain.action` commands and no raw `<`/`>` fallback. The real shop proof shows an itemized bill driven by native bill state. The current container proof shows direct snapshots and transfers. This architecture should be extended, not replaced by renderer heuristics.

### 2. Named prompt choices and cancellation

`interaction-model.js`, `prompt-rules.js`, and the shared interaction dialog translate item selectors, classes, directions, fixed choices, quantities, and text prompts into readable controls. `topmostEscapeLayer` and `handleTopmostEscapeKeydown` in `renderer.js:9977-10052` centralize layered Escape behavior. Existing menu-letter hotkeys preserve expert speed.

### 3. Public snapshot boundaries

The inventory, equipment, ground pile, and container adapters expose stable IDs and known/unknown fields. These are the correct basis for richer UI because they avoid inferring hidden state from sprites or internal memory.

### 4. Distinctive high-emotion moments

The startup choice, Book of Tyr intro, and final chronicle have a coherent dungeon tone. They are much more evocative than generic Electron dialogs. The visual identity should be retained while reducing overlong or diagnostic copy.

### 5. Real scenario and screenshot infrastructure

There are 141 test scripts plus real Electron scenario fixtures. The discipline around public facts, raw fallback leakage, and screenshot evidence is unusually strong. The current view-safe container derivatives passed visual inspection, while the anomalous source PNG previews show why assertions and pixel decoding alone cannot replace opening the exact acceptance artifact.

## Current experience map

| Journey stage | Current surface and code | Current assessment |
|---|---|---|
| Launch/restore | `startup-choice-dialog`, `refreshStartupRecoveryState`, `continuePreviousGame` | Visually strong. Internal version status remains visible. Continue/new-game decisions are clear. |
| Character creation | `character-dialog`, `character-options.js` | Valid combinations are constrained correctly. Seed and recording are too prominent. Default name `Electron` reads as developer data. |
| Intro | `intro-dialog`, `renderIntroWindow` | Strong atmosphere, but it teaches lore, not play. Escape advances instead of behaving like ordinary dismissal. |
| Core play | status groups, quick actions, context bar, 80x21 map, log, movement pad | Capable but crowded. The map is labeled primary while three ribbons and the log often dominate it. |
| Movement/input | direct keyboard forwarding, quick buttons, permanent movement pad, Actions movement mode | Classic flow is preserved. New-player guidance and run/fight semantics are poorly explained. |
| Map/targeting | tile grid, hover tooltip, right-click cell sheet, target controls | Tooltips and adjacent actions help. Right-click is hidden. Long-range target previews explicitly contain placeholder validity language. |
| Inventory/equipment | RPG paper doll, search, item rows, drag/drop, double-click, context menu | Ambitious and useful. Current paper doll overlaps text and clips lower slots; interaction vocabulary is inconsistent. |
| Ground/container | two-pane transfer panel | Real direct behavior works. Drag-only instruction and missing modal/focus semantics block keyboard-only use. |
| Item decisions | badges, action groups, known/appearance metadata | Good basis. No genuine inspect/detail/compare view; current inspect path says protocol is missing. |
| Combat | map sprites, messages, status, contextual attack | Core behavior remains faithful. Consequences are buried in a uniform log; no structured hit/miss/damage emphasis. |
| Spells/skills | structured menu rows with level, Pw, failure, rank filters | One of the cleaner dialogs. No persistent spell/skill overview and no explanation of changing failure state. |
| Status effects | grouped chips with warning/danger classes | Public conditions are visible, but every attribute/system fact competes equally and version is player-facing. |
| Prompts/menus | shared interaction dialog plus custom overlays/context menus | Broad coverage. ARIA role, focus, action placement, and close vocabulary vary by content type. |
| Shops | contextual pay/chat, itemized bill, offer choices | Functionally strong. Bill UI incorrectly uses transfer terminology; log and internal status compete with the transaction. |
| Pets | chat/attack context actions and semantic tooltip | Pet recognition works. The bar can show many chat/attack actions at once; tooltip leaks glyph and map coordinates. |
| Stairs | explicit up/down/ladder actions and direct protocol | Semantically excellent. Transition feedback is an internal status phrase rather than a brief player-facing transition. |
| Messages/history | bounded recent log, details history, document dialog | Reliable but visually dominant. Lore and action messages are mixed; history is nested in multiple places. |
| Save/restore/death | startup recovery, Save action, final chronicle | Restore is clear. Save is buried. Game-over screenshot shows generic cause, stale/full HP, `(hidden)` condition, and actions below the fold. |

# Safe presentation and interaction recommendations

Priority uses P0 blocking, P1 major, P2 useful, P3 polish. Effort uses S (days), M (roughly 1 to 3 weeks), L (multi-sprint or protocol work).

## A. Onboarding and discoverability

### SAFE-01: Add an optional first-turn field guide

- **Current friction:** The polished intro ends at **Begin the descent**. The next screen does not teach that movement spends turns, messages explain consequences, contextual actions change with location, `i` opens inventory, and Escape cancels. Keyboard help is collapsed at the bottom. See `renderer.html:80-83`, `renderIntroWindow`, and `real-startup-no-blank-command/03-after-intro-dismiss-no-unknown-command.png`.
- **Proposed UX:** On the first run only, show four lightweight anchored cues in sequence: move one square; read the latest consequence; use or inspect the **Here** actions; open and close Inventory. Include **Skip guidance** and **Do not show again**. Never require a specific strategic choice.
- **Semantics preserved:** The guide does not issue input, grant items, alter turns, or reveal hidden facts. It observes public UI state and dismisses immediately on classic keyboard play.
- **Implementation:** Add a local presentation-only onboarding state machine beside settings, driven by visible renderer events. Anchor cues to `#game-grid`, `#messages`, `#context-action-bar`, and `#inventory-equipment-button`. Persist completion in local GUI settings.
- **Dependencies/risks:** Must not cover prompts or steal focus. Test both mouse and keyboard, and suppress during restored games unless explicitly requested.
- **Priority/effort:** **P1 / M**.

### SAFE-02: Simplify character creation, retain advanced reproducibility

- **Current friction:** The primary character dialog shows deterministic seed and replay recording beside identity choices. `Electron` is prefilled as the hero name. Four footer actions compete. Historical screenshot also shows `Version check failed` in the header. See `renderer.html:268-288` and `character-creation-valid-combos/01-valid-character-dialog-default.png`.
- **Proposed UX:** Default name to blank with a thematic example. Keep **Random hero** and **Enter dungeon** primary. Move seed and replay recording into an **Advanced run options** disclosure. Show valid-combination changes inline, such as “Dwarf limits available roles,” rather than silently changing choices.
- **Semantics preserved:** All NetHack character options and randomization remain unchanged. Seed and recording stay available to testers and advanced players.
- **Implementation:** Restructure the existing dialog only. Reuse `character-options.js` to produce a short explanation when a choice constrains another field.
- **Dependencies/risks:** Empty-name behavior needs an explicit random-name or validation policy. Do not alter NetHack's role/race legality.
- **Priority/effort:** **P1 / S**.

### SAFE-03: Unify help, commands, and contextual discovery

- **Current friction:** Help exists as keyboard details, `?`, a read-only menu, a document window, `#whatdoes`, and an all-in-one Actions modal. The document dialog says “no random press any key,” which explains implementation rather than helping the player. See `renderer.html:80-83, 290-298`, `renderDocumentWindow`, and `real-read-only-menu-lifecycle/03-read-only-help-document-open.png`.
- **Proposed UX:** Create one **Help and commands** entry with tabs or sections for Basics, Keys, Commands, and NetHack manual text. Preserve searchable raw help as **Manual**. From any contextual action, expose its key as a secondary hint.
- **Semantics preserved:** Documentation only; no commands are automated.
- **Implementation:** Wrap existing help/document data in a common shell. Use the same command metadata that powers the command palette proposed below.
- **Dependencies/risks:** NetHack help content remains monospaced and searchable. Avoid rewriting canonical manual claims.
- **Priority/effort:** **P2 / M**.

## B. Shell, visual hierarchy, and player-facing status

### SAFE-04: Replace transport status with player-facing outcome status

- **Current friction:** The most prominent top-right status announces `version check passed`, `reading NetHack message`, `menu awaiting item selection`, `command completed: key y`, `container transfer panel ready`, and `terrain movement down requested`. These originate in `setStatus` and many workflow calls, including `renderer.js:7939` and `7214-7298`.
- **Proposed UX:** Reserve the header status for concise states the player can act on: **Your turn**, **Choose an item**, **Choose a direction**, **Game saved**, **Connection lost**, **Action could not be completed**. Move protocol and transport detail to diagnostics only. Outcome text should come from the message/result event, not the key used.
- **Semantics preserved:** Only wording and placement change. Raw diagnostics remain recorded.
- **Implementation:** Introduce a small `PlayerNotice` presentation model with `info`, `success`, `warning`, and `error`. Map game-view effects and transaction outcomes to notices; stop setting the header directly from low-level events.
- **Dependencies/risks:** Do not swallow actionable failures. Every rejected direct action must still provide a visible reason and log evidence.
- **Priority/effort:** **P0 / M**.

### SAFE-05: Establish a map-first hierarchy that is true in practice

- **Current friction:** “Map stays primary” is contradicted by two status rows, quick actions, context actions, and a large yellow log. At 1360x920, a small discovered room occupies a tiny portion of a vast 80x21 void. See `styles.css:37-70, 94-222, 363-423` and status/shop screenshots.
- **Proposed UX:** Use a compact hero/vitals strip, a single context command row, the map, and a two-line event feed. Expand full attributes, gear, system facts, and history on demand. Keep the full 80x21 map authoritative, but offer a presentation-only **Follow hero** magnifier or inset that shows known cells at a larger scale while preserving full-map access.
- **Semantics preserved:** No map information is added, hidden cells remain hidden, coordinates and movement remain unchanged. The full-level view remains one click/key away.
- **Implementation:** Collapse quick actions into the command palette and context bar. Move attributes to a character sheet. Derive a magnified view solely from already rendered public cells.
- **Dependencies/risks:** A zoomed view must not imply unseen bounds or alter click targeting. Keep classic players able to choose full-level view permanently.
- **Priority/effort:** **P1 / L** for full hierarchy; **P1 / S** for reducing the log and hiding system/version chips.

### SAFE-06: Replace one-off CSS with design tokens and state contracts

- **Current friction:** `styles.css` has hundreds of hard-coded color literals and only a handful of custom properties. Pills, borders, panels, dangerous states, and overlays use similar but non-identical values. Only one `:focus-visible` selector exists.
- **Proposed UX:** Define tokens for surface layers, text hierarchy, gold/accent, semantic states, focus, spacing, radius, typography, overlay, and motion. Give buttons and choice rows consistent default, hover, focus, active, disabled, loading, selected, warning, and danger states.
- **Semantics preserved:** Presentation only.
- **Implementation:** Start with CSS variables and component classes without changing DOM behavior. Document tokens in a future `DESIGN.md`; none exists today.
- **Dependencies/risks:** Incremental migration must avoid contrast regressions. Capture before/after screenshots for all major modal families.
- **Priority/effort:** **P1 / M**.

## C. Movement, hotkeys, commands, and advanced-player efficiency

### SAFE-07: Replace the all-in-one Actions modal with a searchable command palette

- **Current friction:** `renderer.html:154-250` places use, equipment, repeat, movement, save/quit, history, spells, skills, options, transfers, object flows, special actions, and inspect/name actions in one scrollable two-column modal. In `real-escape-popup-mcp/04-real-actions-before-escape.png`, important commands are below the fold.
- **Proposed UX:** A searchable palette opened by the existing button and `#`. Rank **Available here** and recent commands first, then categories. Show key hints, whether a prompt follows, and danger state. Keep dedicated Inventory and contextual actions outside it. Add expert aliases such as “quaff,” “drink potion,” and `q`.
- **Semantics preserved:** Every entry sends the existing command or opens the same NetHack-owned prompt. Hidden commands are not invented; unavailable contextual commands are either omitted or disabled only when public state explains why.
- **Implementation:** Extract command metadata now duplicated in HTML, `commandHelpOptions`, extended-command catalog, and contextual actions into a shared presentation catalog. Use the existing text/filter interaction patterns.
- **Dependencies/risks:** Avoid claiming availability for commands whose prerequisites are unknown. Save/quit require clear danger/confirmation placement.
- **Priority/effort:** **P1 / M**.

### SAFE-08: Teach keys as accelerators, not prerequisites

- **Current friction:** Some buttons include keys, some tooltips include them, context menu hints expose internal strings such as `rf`, `wf`, and `#namef`, and many Actions buttons omit keys. Menu letters are visually prominent in item rows even when names are sufficient.
- **Proposed UX:** Standardize secondary keycaps: `Read  R`, `Inventory  I`, `Cancel  Esc`. For multi-key internal routing, show the public command key only, not composed selector sequences. Add a setting to always show key hints for learners and experts.
- **Semantics preserved:** Classic keys remain unchanged and faster than GUI flows.
- **Implementation:** Command catalog owns display shortcut and internal execution separately. Keep selector letters in compact keycaps for advanced menu activation.
- **Dependencies/risks:** Case matters in NetHack. Labels must distinguish `w`, `W`, `q`, `Q`, and control keys.
- **Priority/effort:** **P2 / S** after SAFE-07.

### SAFE-09: Clarify movement modes and repeat actions

- **Current friction:** Walk, Run, Fight, repeat counts, Wait/rest, and Search are buried inside Actions. The permanent movement pad has an unlabeled center dot and no visible explanation of turns. `renderDirectionHelper` keeps it visible even outside prompts.
- **Proposed UX:** Keep the pad optional. A short tooltip or help sheet explains Walk, Run, Fight, count prefixes, and that most actions spend turns. Put repeat count in the command palette as an advanced parameter, not a permanent card.
- **Semantics preserved:** Existing prefixes and count behavior remain exactly NetHack's.
- **Implementation:** Use `movementPrefixForMode` and `sendRepeatedCommand`; change only presentation and help.
- **Dependencies/risks:** Do not label waiting as “rest until healed,” which would imply automation not currently present.
- **Priority/effort:** **P2 / S**.

## D. Map interaction and targeting

### SAFE-10: Make map interaction discoverable without right-click knowledge

- **Current friction:** Hover gives a tooltip, right-click opens map-cell actions, left-click is meaningful mainly during target mode, and the context bar works from the hero's square. The map has no visible inspect-mode affordance beyond a button. `showMapContextActionSheet` also exposes raw coordinates in its prompt.
- **Proposed UX:** **Inspect / look** visibly enters inspect mode. Hover/focus shows a compact inspector; single click selects the cell and exposes valid, public actions. Right-click remains an accelerator. Remove glyph IDs and `map x,y` from player-facing tooltips, with an optional diagnostics overlay for testers.
- **Semantics preserved:** Inspect spends no turn until NetHack's actual look/what-is command requires input. Actions remain limited to public state and the same commands.
- **Implementation:** Reuse `mapTooltipInfoForCell` and the existing context sheet, but add a clear mode banner and selected-cell state. Separate diagnostic metadata from display metadata in `map-presentation.js`.
- **Dependencies/risks:** A single ordinary click must not move or attack by default. That would be a mechanics/input-policy decision.
- **Priority/effort:** **P1 / M**.

### SAFE-11: Make target previews honest and compact

- **Current friction:** `targetPreviewDetails` tells players that line-of-effect, range, and route validity are placeholders. This is developer-facing and may imply safety or validity the core has not confirmed.
- **Proposed UX:** Until authoritative target metadata exists, show only selected cell, distance, visible target name, and **NetHack will validate this target**. Do not draw a “projectile line” or “route” as if valid. When the core later supplies legal targets/LOS, distinguish confirmed legal cells from merely selected cells.
- **Semantics preserved:** No range, LOS, hit chance, or path claim is made without core evidence. NetHack still accepts or rejects the target.
- **Implementation:** Simplify `targetPreviewDetails` now. Later add typed `target.prompt` metadata to `ui-protocol-v2.js`.
- **Dependencies/risks:** Sending raw cursor paths is fragile; typed stable targets should precede richer visuals.
- **Priority/effort:** **P0 / S** for removing placeholder claims; **P1 / L** for authoritative targeting.

### SAFE-12: Improve map legibility and non-color cues

- **Current friction:** Tiny 7px minimum cells, large dark void, subtle terrain textures, and color-heavy borders make the map difficult at distance, under zoom, or with low vision. The tooltip can cover nearby content.
- **Proposed UX:** Add map scale controls, high-contrast terrain outlines, optional classic glyph overlay, stronger cursor/target rings, and tooltip placement that avoids the selected cell. Use shape plus color for player, pet, hostile, peaceful, trap, and target states when those states are publicly known.
- **Semantics preserved:** Only known rendered layers are restyled.
- **Implementation:** Extend `map-presentation.js` display roles and CSS. Keep glyph overlay sourced from existing public glyph chars.
- **Dependencies/risks:** Do not use visual treatment to reveal attitude or traps before the core does.
- **Priority/effort:** **P1 / M**.

## E. Inventory, equipment, containers, and item knowledge

### SAFE-13: Rebuild the equipment layout for clarity and stability

- **Current friction:** The paper doll is visually attractive but slot cards overlap the avatar and each other. Text such as `Two-weapon/alternate-weapon setup is...` clips. Armor, boots, quiver, and rings fall below the visible dialog; the close action can be off-screen. See `styles.css:841-920` and `real-equipment-screen-mcp/02-real-key-i-equipment-screen.png`.
- **Proposed UX:** Use a stable body silhouette with compact slot anchors and a separate selected-slot detail panel. At narrower widths, switch to a semantic slot list rather than preserving absolute positioning. Keep inventory as a searchable list with direct action buttons.
- **Semantics preserved:** NetHack's distinct armor layers, ring hands, quiver, alternate weapon, and blockers remain. Do not merge layers merely because the current visual uses one body card.
- **Implementation:** Continue deriving slot truth from `equipment-snapshot-adapter.js` and action routing from `inventory-action-service.js`. Replace absolute slot cards with CSS grid/anchor layout and a slot detail region.
- **Dependencies/risks:** The existing note that shirt/suit/cloak are routed separately must become a visible layering model before replacement actions are simplified.
- **Priority/effort:** **P0 / M**.

### SAFE-14: Standardize inventory item interaction

- **Current friction:** A row can support single click with no action, double-click primary action, drag to slot, right-click menu, Shift+F10 menu, a trailing action pill, and a selector hotkey. None is clearly dominant. Context menus can exceed the viewport and overlap the dialog. See `renderer.js:2588-3013, 7415-7560` and item context screenshots.
- **Proposed UX:** Single click selects and opens an item detail/action pane. Enter does the same. A visible primary action button performs the most likely explicit action. Drag, double-click, right-click, Shift+F10, and selector letters remain accelerators. Context menus should be bounded, focus-managed, and restore focus.
- **Semantics preserved:** No automatic action occurs on selection. Primary action labels come from public affordances and route through existing action services.
- **Implementation:** Add selected-item state to the equipment dialog. Reuse existing grouped affordances inside a side panel instead of a floating fixed menu for most actions.
- **Dependencies/risks:** Avoid choosing a dangerous action as primary. `Read`, `quaff`, `eat`, invoke, sacrifice, and unknown items may require explicit confirmation depending on current prompt semantics.
- **Priority/effort:** **P1 / M**.

### SAFE-15: Make transfer panels keyboard-operable dialogs

- **Current friction:** `#container-transfer-panel` is a fixed `<section>` without `role="dialog"` or `aria-modal`. Rows transfer through drag and double-click; Enter produces an ordinary click. Opening does not establish a focus trap or initial focus. The current instruction says only “Drag items.” See `renderer.html:56`, `renderContainerItemRow`, and `renderContainerTransferPanel` at `renderer.js:6402-6459, 7214-7298`.
- **Proposed UX:** Treat the panel as a proper modal. Selecting a row exposes **Take**, **Put in**, **Pick up**, or **Drop** based on side. Enter activates the visible transfer action; Space selects; arrows move rows; Tab stays within the dialog; Escape/Done closes one layer. Retain drag and double-click.
- **Semantics preserved:** Each transfer still uses the authoritative direct command and transaction. No bulk action is added unless NetHack's existing multi-select semantics support it.
- **Implementation:** Prefer a native `<dialog>` or add equivalent dialog semantics and focus management. Add visible per-row or central transfer buttons. Update instructions dynamically.
- **Dependencies/risks:** Focus must survive authoritative pane refresh and selector remapping. Do not allow a second transfer while the first acknowledgement is pending.
- **Priority/effort:** **P0 / M**.

### SAFE-16: Add truthful item details and comparison

- **Current friction:** `executeInventoryAction` currently reports that inspect/details require structured protocol. The UI shows badges but has no durable detail view or comparison. Players cannot easily compare a candidate weapon/armor item with the relevant equipped slot.
- **Proposed UX:** A side panel shows only known fields: visible name/appearance, quantity, weight if public, equipped state, known BUC, charges if known, unpaid price, applicable slot, and available actions. **Compare with equipped** aligns known fields and displays `Unknown` rather than inferred values. Add a short “Why unavailable” explanation for blocked actions.
- **Semantics preserved:** Unknown identity, enchantment, BUC, damage, armor value, charges, and effects remain unknown. Comparison never predicts outcomes.
- **Implementation:** Extend the public item schema in `ui-protocol-v2.js` only for facts NetHack already exposes to the player. Build an `ItemPresentation` adapter shared by inventory, ground, shop, and container rows.
- **Dependencies/risks:** This is protocol-sensitive. A renderer-only text parser will leak or misstate knowledge. Ship a reduced known-facts panel first.
- **Priority/effort:** **P1 / L**.

### SAFE-17: Separate identity, appearance, and player naming

- **Current friction:** The current snapshots correctly carry semantic name/appearance/known state, but rows and tooltips inconsistently present articles, called names, appearances, and generic asset labels. Pet tooltip currently leaks `glyph 1165 · map 54,5`.
- **Proposed UX:** Standard row grammar: primary public display name; secondary appearance or “called …” only when known; known-state badges; diagnostics hidden. For unidentified items, appearance remains primary, such as **white potion**, not a resolved potion type.
- **Semantics preserved:** This makes the knowledge boundary visible rather than bypassing it.
- **Implementation:** Centralize item naming in a shared presentation adapter instead of renderer regexes such as `menuItemName` and `cleanEquipmentText`.
- **Dependencies/risks:** Must cover plural stacks, corpses, statues, artifact names, user-assigned names, and shop ownership.
- **Priority/effort:** **P1 / M**.

## F. Combat, spells, skills, and status effects

### SAFE-18: Create a compact consequence feed for combat and hazards

- **Current friction:** Combat, failed actions, hunger, traps, and shop speech all enter the same yellow monospaced log. The latest high-impact consequence can be lost among lore and routine messages. There is no current structured combat event layer.
- **Proposed UX:** Keep the canonical log, but show a two-line live consequence feed above or below the map. Emphasize damage, miss, resistance, status gained/lost, item breakage, kill, pet harm, and blocked action only after NetHack emits them. Briefly pulse the involved visible cells and HP/status region.
- **Semantics preserved:** Feedback is post-result, not predictive. It does not alter turn timing or suppress canonical messages.
- **Implementation:** First classify visible messages conservatively in a shared `message-presentation` module. Longer term, add public result event types. Use transform/opacity motion under 200ms and support reduced motion.
- **Dependencies/risks:** Text parsing across NetHack variants is error-prone. Unclassified messages must still appear. Animation must not delay input or imply damage when none occurred.
- **Priority/effort:** **P1 / L**.

### SAFE-19: Refine spell and skill presentation

- **Current friction:** The spell dialog is comparatively good, with level, power, failure, and low/high failure filters. However, level is missing in some synthetic captures, failure lacks an explanation of current-state sensitivity, and spells/skills are buried in Actions. See `parseSpellMenuText`, `parseSkillMenuText`, `renderStructuredMenuOption`, and `inventory-selection-gui-audit/spell-menu-rows.png`.
- **Proposed UX:** Add dedicated **Spells** and **Skills** command entries. Show current Pw, spell level, failure, and status as public data. Explain “Failure reflects your current equipment and condition” without revealing hidden calculations. Skills show current rank and **Can advance** only when NetHack says so.
- **Semantics preserved:** Casting and advancement remain NetHack-owned menus; no recommendations or optimal-build advice.
- **Implementation:** Reuse current parsers, then migrate to typed public spell/skill rows when available.
- **Dependencies/risks:** Do not estimate failure or advancement from renderer state.
- **Priority/effort:** **P2 / M**.

### SAFE-20: Prioritize urgent status and move static stats on demand

- **Current friction:** Strength through Charisma, HP/Pw/AC/XL/XP, dungeon/gold/time, carry/terrain/conditions, gear, and NetHack version all appear as chips. In `real-status-condition/02-condition-status-trapped.png`, overloaded, stairs, trapped, confused, and blind compete with static attributes.
- **Proposed UX:** Persistent HUD: HP/Pw, AC, level, dungeon, gold, hunger/burden, and urgent conditions. Character sheet: attributes, XP detail, full gear, conduct, and system/version. Urgent conditions use icon, text, and severity, and can be focused for a public explanation.
- **Semantics preserved:** All displayed facts remain unchanged. No timer or duration is invented.
- **Implementation:** Adjust `status-hud.js` grouping into persistent versus detail roles. Remove `System/Version` from play HUD.
- **Dependencies/risks:** Experienced players may want dense mode. Offer Compact and Detailed HUD presets.
- **Priority/effort:** **P1 / M**.

## G. Prompts, menus, cancellation, and failure recovery

### SAFE-21: Give every interaction family correct semantics and a consistent shell

- **Current friction:** `#interaction-options` is permanently `role="listbox"`, but its children may be options, checkboxes, command buttons, context choices, directions, or document continuation. Native dialogs, the custom transfer overlay, and fixed context menus all use different focus and close behavior.
- **Proposed UX:** Define shells for single-select list, multi-select list, command menu, form, alert/confirmation, document, and transfer dialog. Each owns correct ARIA roles, heading, description, focus entry, focus restoration, keyboard behavior, and action order.
- **Semantics preserved:** Prompt ownership and answers are unchanged.
- **Implementation:** Split `showInteractionDialog` into a shared shell plus typed content adapters. Keep `topmostEscapeLayer` as the central layer router.
- **Dependencies/risks:** Prompt lifecycle regression risk is high. Migrate one family at a time with existing real menu-letter and Escape tests.
- **Priority/effort:** **P0 / L**.

### SAFE-22: Standardize close, cancel, back, continue, and destructive confirmation

- **Current friction:** Surfaces use Close, Close/Back, Cancel/Esc, Done, Continue, Ignore, Begin the descent, and non-dismissible behavior. Escape advances the intro. The startup and game-over dialogs intentionally consume Escape, but other differences feel arbitrary.
- **Proposed UX:** Use **Close** for read-only renderer surfaces, **Cancel** for unsubmitted NetHack prompts, **Back** for hierarchical navigation, **Continue** for acknowledged NetHack text, and explicit verbs for final actions. Place the dismissal consistently. If Escape is intentionally blocked, explain it only at high-stakes final states, not routine dialogs.
- **Semantics preserved:** One Escape still dismisses one layer and does not leak into dungeon input.
- **Implementation:** Add action-kind metadata to dialog shells and use it in `topmostEscapeLayer`.
- **Dependencies/risks:** Do not turn Escape into prompt acceptance. The intro should either have a true skip/close policy or retain Enter/Continue as the only progress action.
- **Priority/effort:** **P1 / M**.

### SAFE-23: Make failures actionable and preserve state

- **Current friction:** Direct actions can expose transport phrasing such as “snapshot,” “revision,” “selector,” “panel ready,” or “stale.” Transfer code has detailed recovery but surfaces technical text. A current real-input test timed out because its startup assumption drifted.
- **Proposed UX:** Use player language: **That item moved. Refresh the list and try again**, **The container is no longer here**, **Finish the current choice first**, **Game process stopped unexpectedly; recovery is available**. Preserve the player's selection and scroll when safe. Add **Copy diagnostics** only behind a details disclosure.
- **Semantics preserved:** No failed action is retried automatically if retry could spend a turn. Recovery choices remain explicit.
- **Implementation:** Map `public-blockers.js`, transaction failure kinds, and recovery state to user copy. Keep technical detail in diagnostics.
- **Dependencies/risks:** Automatic retries are unsafe unless the command is proven idempotent and turnless.
- **Priority/effort:** **P1 / M**.

## H. Shops, pets, stairs, messages, saves, and final states

### SAFE-24: Give shops a transaction-specific bill, not a transfer form

- **Current friction:** The real payment picker is functional but says **Source**, **Destination**, and **Transfer summary**. The player must mentally translate a bill into inventory transfer terminology. The top status still says `menu awaiting item selection`.
- **Proposed UX:** Use **Shop bill**, item prices, selected total, available gold, remaining debt, and **Pay selected**. For sell offers, keep the excellent Accept/Decline/Accept remaining/Stop selling choices and add ownership context only when public.
- **Semantics preserved:** NetHack still sets prices, sale offers, debt, and payment outcomes.
- **Implementation:** Specialize `transferPanelControls` and `transferSelectionSummary` when `model.shop` is true. Remove transfer destination cards.
- **Dependencies/risks:** Partial payments and insufficient funds must mirror the core. Never estimate prices.
- **Priority/effort:** **P1 / S**.

### SAFE-25: Reduce pet/creature action clutter and protect peaceful targets

- **Current friction:** In the pet scenario, the context bar shows chat and attack entries for several directions at once. The Little Dog tooltip exposes glyph and map coordinates. The visual hierarchy does not clearly separate tame, peaceful, and hostile actions.
- **Proposed UX:** Show at most one primary creature action plus a target chooser when several creatures are adjacent. Tame/pet: **Chat** or public safe action primary. Peaceful: **Chat** primary, attack under **Dangerous actions** with explicit confirmation. Hostile: **Attack** may be primary. Tooltip shows public name and attitude only.
- **Semantics preserved:** No pet command, attitude, or attack result is invented. Moving into a creature and deliberate Fight commands retain NetHack semantics.
- **Implementation:** Group creature actions in `buildContextActions` rather than emitting every direction as a separate top-level button. Reuse serious confirmation handling.
- **Dependencies/risks:** Attitude must come from public affordances, never name/glyph heuristics. Current `actionForAdjacentCell` still falls back to signature matching and should prefer typed state.
- **Priority/effort:** **P1 / M**.

### SAFE-26: Make level transitions feel clear without hiding danger

- **Current friction:** Stair actions are excellent before the click. After descent, the header says `terrain movement down requested`, while the important confirmation is in the log and changed dungeon level. There is no brief transition focus.
- **Proposed UX:** After the core confirms, briefly show **Dungeon level 2** and place focus on the new map. For special branches, show destination only if NetHack has revealed it. If ascent triggers a confirmation, present the real prompt with clear leave/cancel verbs.
- **Semantics preserved:** No branch name or safety claim is shown early. Transition consumes the same turn and uses the same confirmation.
- **Implementation:** Map successful terrain transaction plus status level change to a short outcome notice.
- **Dependencies/risks:** Teleports, portals, level changes after falls, and branch transitions must use the same generic event path.
- **Priority/effort:** **P2 / S**.

### SAFE-27: Turn messages into an event center without losing the canonical log

- **Current friction:** Recent messages can show most of the intro lore and shop speech at once, while the newest line sits at the bottom. “Full history is collapsed below” is visually static. Message history also exists through `#prevmsg` and document windows.
- **Proposed UX:** Show latest 2 to 4 lines by default with severity accents and a clear **History** button. History opens a searchable timeline grouped by turn when turn data exists. Preserve exact canonical text and offer a copy action. Lore can be collapsed under **Opening chronicle** after the intro closes.
- **Semantics preserved:** No message is discarded or rewritten as the source of truth. Grouping is presentation only.
- **Implementation:** Extend `message-log.js` beyond its current 33-line bounded store with public metadata references. Keep raw lines and add optional presentation tags.
- **Dependencies/risks:** Do not collapse repeated messages that encode repeated turns unless the count is exact and reversible.
- **Priority/effort:** **P1 / M**.

### SAFE-28: Surface save/restore clearly and make final-state data trustworthy

- **Current friction:** Continue/new game is clear at launch, but Save is buried in Actions. The game-over screenshot shows generic **You die...**, full HP, `(hidden)` condition, and New game/Exit below the fold. `renderGameOverSummary` draws from the current status cache, which may be stale or incomplete.
- **Proposed UX:** Put **Save and exit** in the command palette's Run section with explicit confirmation and success notice. Continue card shows hero, role, dungeon level, and save/recovery timestamp when public. Final chronicle prioritizes exact cause, score, turns, depth, conduct/highlights, and always-visible New game/Exit; omit unavailable fields instead of showing `(hidden)`.
- **Semantics preserved:** NetHack's single-save/permadeath model remains. No duplicate slots, rewind, or autosave promise is added.
- **Implementation:** Use native end-game payloads and finalized status/result events instead of renderer message inference wherever possible. Keep `deathCauseFromText` as fallback only.
- **Dependencies/risks:** Exact cause and final statistics need a stronger native end protocol. Never imply a save succeeded until acknowledged.
- **Priority/effort:** **P0 / M** for final actions/unknown-field cleanup; **P1 / L** for authoritative final payload.

## I. Accessibility, responsive behavior, motion, and audio

### SAFE-29: Complete keyboard, focus, and screen-reader support

- **Current friction:** The map is a focusable generic div with generic cell divs; context menus do not implement standard arrow navigation or focus restoration; transfer is keyboard-blocked; several simultaneous `aria-live` regions can announce status, context actions, messages, direction helper, and an entire transfer panel. Labels/badges reach 0.60 to 0.68rem.
- **Proposed UX:** Define one polite live status and one assertive error channel. Give the map a documented application/grid pattern or a concise focused-cell inspector rather than 1,680 noisy gridcells. Add focus restoration, roving tabindex for menus, visible focus on every control, 44px touch targets where pointer use is expected, and a 200% text-zoom layout.
- **Semantics preserved:** Input routes and commands stay unchanged.
- **Implementation:** Add an accessibility/focus manager used by every overlay. Audit with keyboard-only and a screen reader after each dialog-family migration.
- **Dependencies/risks:** A fully exposed 80x21 ARIA grid may be worse than a focused-cell model. Prototype with screen-reader users before committing.
- **Priority/effort:** **P0 / L**, with transfer and context-menu focus as first slices.

### SAFE-30: Define a supported responsive window strategy

- **Current friction:** `BrowserWindow` has no minimum dimensions. The map uses a 7px minimum tile size, so 80 columns require roughly 574px plus frame. Actions remain two columns. Below 960px the paper doll becomes a 680px absolute-positioned stage. Existing visual coverage is mostly 877px wide or larger.
- **Proposed UX:** For this desktop game, explicitly support a minimum compact window, recommended 960x720. Above it, use the full desktop layout. At compact width, collapse static status and quick actions, stack inventory/detail, use list-based equipment, and keep map horizontal overflow impossible. If smaller windows remain allowed, provide an intentional compact mode rather than accidental clipping.
- **Semantics preserved:** Only layout changes.
- **Implementation:** Set `minWidth`/`minHeight` in `main.js` as an immediate guard, then add breakpoint screenshots and layout tests. Long term, make compact mode structural.
- **Dependencies/risks:** Do not claim mobile/touch support unless Electron packaging and all prompts are validated there.
- **Priority/effort:** **P0 / S** for minimum window; **P1 / L** for compact mode.

### SAFE-31: Add purposeful motion, optional sound, and reduced-motion support

- **Current friction:** There is almost no state motion beyond a loading spinner and pane border transition. No app sound layer exists. Changes such as equipment transfer, HP loss, level transition, and prompt ownership can feel abrupt. The help dump reports `nosound`.
- **Proposed UX:** Use brief transform/opacity feedback for confirmed item movement, HP/status changes, target selection, and level transitions. Add optional UI sounds only for confirmed actions, danger, prompt, and game over. Respect OS reduced motion and provide separate UI/game sound controls. Haptics are not relevant to standard desktop Electron unless controller support is explicitly added.
- **Semantics preserved:** Motion and sound occur after or during visible state changes and never pace the turn loop.
- **Implementation:** CSS motion tokens plus a small event-to-feedback adapter. Audio assets and licensing need a separate decision.
- **Dependencies/risks:** Avoid repetitive sound fatigue, inaccessible color-only pulses, and input delay. No sound should imply a hidden trap or unseen result.
- **Priority/effort:** **P3 / M** after hierarchy and event work.

## Design-system and consistency opportunities

### Reusable primitives

1. **AppShell**: hero summary, urgent status, current player notice, map, consequence feed.
2. **CommandCatalog**: label, aliases, visible shortcut, category, danger, availability source, prompt plan, internal route.
3. **DialogShell**: title, description, content role, primary/secondary/dismiss actions, focus entry/return, Escape policy.
4. **ChoiceList**: single select, multi-select, command menu, quantity row, selector keycap.
5. **ItemPresentation**: public display name, appearance, known state, quantity, ownership, equipment state, icon, actions.
6. **ItemActionPanel**: grouped safe/combat/location/management/magic/danger actions with disabled reasons.
7. **TransferDialog**: typed sides, selected row, explicit transfer verb, transaction pending/error state.
8. **PlayerNotice**: player-facing status derived from result, with diagnostics hidden behind details.
9. **StatusToken**: semantic severity plus icon/text, not color alone.
10. **FocusLayer**: modal stack, focus trap, initial focus, restoration, roving menu focus, one-Escape-one-layer.
11. **MessageEvent**: immutable canonical line plus optional turn, category, actor/target references, severity, and source.
12. **MapInspector**: selected public cell, visible layers, tooltip, contextual actions, diagnostics opt-in.

### Current inconsistencies to resolve

- Header state alternates among player state, bridge state, transaction state, and test diagnostics.
- Quick actions and context actions duplicate Search, Wait, Pick up, Inventory, and More/Actions.
- Actions are defined in static HTML, extended-command fallback lists, help metadata, context actions, and item affordances.
- Overlay types include native `<dialog>`, a fixed section modal, and body/interaction-owned fixed context menus.
- Dismissal labels and action placement vary by surface.
- Shop bills inherit generic transfer language.
- Selector shortcuts range from helpful single letters to internal composed strings.
- Tooltips mix player facts with glyph IDs, asset taxonomy, and map coordinates.
- Status uses many nearly identical pill/card treatments, flattening hierarchy.
- Paper-doll layout preserves visual positions at the expense of readable slot content.
- The same gold gradient marks primary actions, startup controls, and many unrelated controls.
- There is no `PRODUCT.md` or `DESIGN.md`, so product audience, tone, density modes, supported window sizes, and design tokens are not canonicalized.

### Recommended dependency direction

```text
NetHack/shim public facts
  -> shared protocol and snapshot reducers
  -> domain presentation models (item, action, message, status, map target)
  -> reusable UI primitives and focus layer
  -> renderer DOM adapter
```

Do not add more regex and DOM ownership to `renderer.js`. Its 10,365 lines currently combine map, messages, onboarding, context actions, shops, equipment, transfer choreography, prompts, menus, recording, recovery, targeting, and input routing. The next UI work should extract presentation models and component adapters one domain at a time while retaining existing shared contracts and real tests.

## Mechanics-affecting ideas that require explicit approval

The following may sound modern but should **not** be included in the safe modernization roadmap without a separate product/gameplay decision.

| Idea | Why it changes or risks NetHack semantics |
|---|---|
| Undo, rewind, checkpoint restore, multiple save slots | Removes or weakens permadeath and irreversible decision-making. |
| Autosave that can be copied or restored | Changes save-scumming constraints even if presented as recovery. |
| Auto-explore, click-to-auto-path through unknown terrain, auto-fight | Automates discovery, risk, path choice, and turn expenditure. Existing travel should remain NetHack's command. |
| Guaranteed safe path, hazard prediction, trap warnings | Can reveal hidden traps, resistances, movement capability, or future outcomes. |
| Hit chance, damage range, DPS, armor delta, “best item” ranking | Exposes calculations or hidden properties not normally available and changes discovery/optimization. |
| Automatic item identification or inferred identity from assets | Directly breaks the identification game. |
| Corpse safety, prayer safety, altar outcome, fountain outcome recommendations | Reveals strategic knowledge and hidden timing/state. Public manual information can be explained, but the UI must not advise an outcome. |
| Automatic pet feeding, pet health meters, pet command queue | Adds control or information not currently guaranteed by NetHack. |
| Confirm every attack or dangerous move | Can materially change expert input cadence and accidental-risk character. Peaceful-target confirmation is reasonable as an optional safety setting, not a silent default change. |
| Pause-free container/inventory management that ignores interruptions or turn costs | Can alter interruption risk and action timing. Transfers must remain core-owned transactions. |
| Branch destination labels before discovery | Spoils dungeon structure. Show destinations only after public discovery. |
| Rich LOS/range overlays inferred in the renderer | Can be wrong and reveal blocked paths. Require authoritative prompt metadata. |
| Quest checklist with future objectives or recipe encyclopedia | Can spoil discovery and strategic knowledge beyond the current manual. |
| Real-time combat animation that locks input | Changes pacing and can interfere with turn-based command efficiency. Feedback must be brief and non-blocking. |

## Technical quality snapshot

This is not a release certification, but it helps prioritize work.

| Dimension | Score (0-4) | Key finding |
|---|---:|---|
| Accessibility | 2 | Some strong labels, keyboard paths, and centralized Escape handling, but transfer, roles, focus restoration, live regions, and text size have major gaps. |
| Performance | 2 | Incremental map rendering and bounded logs exist, but a 10k-line renderer and broad rerenders raise regression and interaction-cost risk. |
| Theming/design system | 1 | Dark visual identity is intentional, but color, surface, radius, and state values are overwhelmingly hard-coded. |
| Responsive design | 1 | A few breakpoints exist; minimum window and equipment/map behavior remain structurally unsafe. |
| Anti-pattern resistance | 2 | Distinctive NetHack tone and good dense rows, but excessive pills/cards, gradients, and simultaneous chrome flatten hierarchy. |
| **Total** | **8/20, poor** | Modernization should consolidate and harden existing strengths, not add more surface area. |

## Prioritized roadmap

### Quick wins, approximately 1 to 2 weeks total

1. Remove version/protocol/transaction phrases from the player header; keep them in diagnostics.
2. Remove `System / Version` from the persistent HUD.
3. Blank the `Electron` default name and move seed/replay under Advanced run options.
4. Replace target placeholder copy with “NetHack will validate this target.”
5. Remove glyph IDs, asset taxonomy, and map coordinates from normal tooltips.
6. Specialize shop bill copy and remove Source/Destination/Transfer terminology.
7. Set a tested minimum Electron window size.
8. Add `prefers-reduced-motion` handling for the loading spinner and future motion.
9. Standardize visible shortcuts to public command keys, not internal composed sequences.
10. Fix game-over unavailable fields and keep New game/Exit visible without scrolling.
11. Update the real-input regression startup driver to handle the required startup-choice dialog.
12. Keep screenshot artifact manifests and explicit human inspection notes in every player-facing test result.

### Medium projects, approximately 2 to 6 weeks each

1. First-turn field guide with skip and persistent preference.
2. Searchable command palette backed by one command catalog.
3. Compact HUD and consequence feed with full character sheet/history on demand.
4. Keyboard-operable, focus-managed transfer dialog.
5. Equipment screen grid/list redesign with selected-item action pane.
6. Unified help and commands surface.
7. Typed dialog shells for select, multi-select, command, confirmation, form, and document workflows.
8. Context-action grouping for multiple doors/creatures/items rather than 12 flat buttons.
9. Public item naming/presentation adapter shared across inventory, ground, shop, and container.
10. Compact desktop layout at the supported minimum size.

### Larger initiatives, multi-sprint

1. Structured, no-spoiler item details and comparison protocol.
2. Authoritative targeting metadata for legal targets, LOS, range, and typed stable target IDs.
3. Structured result/message events for combat, hazards, status changes, and final outcomes.
4. Renderer decomposition into domain presentation modules and reusable UI primitives.
5. Full accessibility program with screen-reader validation, 200% zoom, and input-mode testing.
6. Optional map magnifier/follow-hero presentation with full-map parity.
7. Optional sound and motion feedback system after structured result events exist.
8. Authoritative native final-run payload for cause, score, turns, depth, conduct, and statistics.

## Recommended first implementation batch

### Batch: player-facing shell clarity and operable core interactions

This batch offers the best usability gain without touching mechanics:

1. **PlayerNotice layer**
   - Replace header transport text with player-facing Your turn, Choose…, success, warning, and failure notices.
   - Move technical text to diagnostics.
2. **Compact persistent HUD**
   - Keep vitals, dungeon, gold, burden/hunger, and urgent conditions.
   - Move attributes, gear, and version to detail surfaces.
3. **Character creation cleanup**
   - Blank/default-safe name.
   - Advanced disclosure for seed and replay.
4. **Command palette first slice**
   - Search all currently visible Actions commands.
   - Group Available here, Items, Equipment, Magic, Dungeon, Character, Run, Help.
   - Show public key hints and danger state.
5. **Transfer accessibility first slice**
   - Proper modal semantics and focus management.
   - Visible Take/Put in or Pick up/Drop action for selected row.
   - Enter activation and focus restoration.
6. **Diagnostic copy cleanup**
   - Remove map coordinates/glyph IDs from normal tooltips.
   - Remove targeting placeholder claims.
   - Specialize shop bill terminology.
7. **Evidence hardening**
   - Fix real-input startup automation drift.
   - Preserve screenshot manifests and mandatory manual-inspection notes for every player-facing run.

### Acceptance criteria

#### Behavior and semantics

- Classic movement, command keys, menu letters, counts, Escape, and `#` commands still work unchanged.
- Every palette command invokes the same existing command or prompt route; no new gameplay action is introduced.
- Contextual availability is derived only from public state.
- Unknown item identity and hidden terrain/monster/container facts do not appear in labels, badges, details, or disabled reasons.
- Selecting an inventory or transfer row does not spend a turn.
- Transfer occurs only after explicit button/Enter/double-click/drag activation and is blocked while a prior transaction is pending.
- Cancel closes one UI layer and never leaks an unintended dungeon command.

#### Visible UX

- During ordinary play the top header contains no `version check`, `menu awaiting`, `command completed: key`, `snapshot`, `selector`, `revision`, `panel ready`, or `requested` language.
- At 1360x920 and the declared minimum viewport, the map, latest messages, command access, and urgent statuses remain visible without horizontal clipping.
- The command palette finds commands by friendly name, NetHack name, and key; Save and Quit are clearly separated from ordinary actions.
- Character creation shows identity choices first; seed and replay are collapsed by default.
- Transfer panel announces itself as a dialog, focuses a useful control, stays keyboard-operable after pane refresh, and restores focus to the initiating action on close.
- Shop bill uses bill/payment language and displays selected/visible totals from core data.
- Tooltips contain player-facing public facts only.
- Game over keeps exact known cause and New game/Exit visible; unavailable facts are omitted.

#### Accessibility

- All batch controls have visible `:focus-visible` treatment.
- Dialogs trap focus, have an accessible name/description, and restore focus.
- Context menus support arrow/Home/End/Escape or are replaced by the selected-item action pane.
- Only scoped status/error live regions announce changes; rerendered maps and transfer panels do not produce announcement floods.
- Reduced-motion mode disables nonessential spinner/transition animation.

#### Proof

Run real Electron scenarios for:

1. new startup and character creation
2. first normal turn and classic movement
3. command palette search and command dispatch
4. inventory open/close and item action
5. container transfer using keyboard only
6. ground pickup/drop using keyboard only
7. shop bill and insufficient funds
8. stairs transition
9. save/restore
10. game over

Capture and personally inspect screenshots at 1360x920, the declared minimum size, and 200% text zoom for applicable dialogs. Screenshots with black/blank regions, clipped controls, internal diagnostic copy, stale overlays, raw selectors without names, generic death cause when a cause is available, or actions below an unreachable fold are failures even when assertions pass.

## Risks and caveats

- `renderer.js` is a high-coupling change surface. UI modernization should extract one presentation model at a time and keep the shared protocol boundary intact.
- Many existing tests validate synthetic renderer events. Player-facing completion still requires the real Electron path under `TESTING.md`.
- Some historical screenshots contain `Version check failed`, `Unknown command ' '`, raw prompt history, generic death cause, overlap, or clipping. They should not be reused as clean acceptance evidence.
- The container behavior passed and contained no raw fallback copy, but the original CDP PNG previews are not a clean visual baseline: several can display black bands despite complete decoded pixels. Cite the view-safe inspected derivatives and `screenshot-qc.json`, and treat any black/blank preview as an evidence failure until recaptured or transcoded and reopened.
- The most valuable future item, targeting, combat, and final-state improvements require richer typed public events. Renderer inference should not be deepened as a shortcut.
- No `PRODUCT.md` or `DESIGN.md` currently defines audience, density modes, visual tokens, supported window sizes, or tone. Create them with stakeholder input before a broad visual redesign; this audit should be an input, not a substitute for product intent.

## Bottom line

NetHack's complexity is the product, not the defect. The modernization target should be **recognition before recall, explicit state ownership, readable consequences, and optional acceleration**, while leaving uncertainty, irreversible choices, discovery, and classic command efficiency intact.

The repository already has the right semantic foundations. The next step is to consolidate the player experience around them: fewer simultaneous surfaces, stronger hierarchy, one command vocabulary, truthful public-state details, operable dialogs, and diagnostics that stay out of the dungeon.
