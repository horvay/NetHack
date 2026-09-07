# NetHack Electron Design System

## Confirmation Record

The Boss confirmed this design direction for UXM-00 on 2026-07-11 through approval of the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11** and the implementation assignment's explicit defaults: restrained truthful map-first presentation, compact HUD intent, 960 by 720 production minimum, and optional sound off and deferred.

On 2026-07-11, after reviewing the current inventory/equipment screenshot, the Boss confirmed that the illustrated full-character paper doll remains a prominent equipment centerpiece. Layout must protect the art and text simultaneously; replacing it with a plain equipment-only list is forbidden.

## Design Direction

A player studies a dangerous dungeon on a desktop monitor in a dim room, moving quickly between keyboard commands and careful inspection. The interface therefore uses a restrained dark palette, strong focus and state cues, compact information hierarchy, and minimal nonessential motion.

The experience is map-first and truthful. Torch-warmed stone, aged brass frames, vellum-colored text, serif headings, and the existing fantasy art give it a game identity. Ornament belongs to principal frames; gameplay state, not decoration, drives attention.

## Visual Theme

- **Theme:** dark dungeon desktop, never pure black.
- **Color strategy:** restrained tinted neutrals with one gold action accent occupying less than 10 percent of ordinary surfaces.
- **Density:** compact by default, detailed on demand.
- **Shape language:** engraved corners on principal map and overlay frames, raised metal controls, and flat readable content rows. Small radii keep dense controls practical.
- **Elevation:** dark recessed wells, contained control depth, and offset shadows for overlays. Direction-request glow has a specific gameplay meaning.
- **Assets:** reuse the installed coherent NetHack tileset. UX modernization does not generate new visual or audio assets by default.

## Color Tokens

The current palette uses sRGB stone neutrals and brass actions, with OKLCH semantic warning and outcome colors. Exact contrast must be checked against the rendered background before a component ships.

| Role | Token | Value | Use |
|---|---|---:|---|
| Dungeon canvas | `--ux-color-canvas` | `#0d1110` | Window and map surroundings |
| Base surface | `--ux-color-surface` | `#181b18` | Primary product surfaces |
| Raised surface | `--ux-color-surface-raised` | `#25251f` | Toolbars and dialog footers |
| Quiet surface | `--ux-color-surface-muted` | `#121714` | Recessed and secondary regions |
| Strong text | `--ux-color-text` | `#f2e8d0` | Primary labels and body copy |
| Muted text | `--ux-color-text-muted` | `#c8bda2` | Secondary descriptions |
| Faint text | `--ux-color-text-faint` | `#a99f89` | Nonessential metadata only |
| Border | `--ux-color-border` | `#514936` | Dividers and control outlines |
| Action gold | `--ux-color-action` | `#d8ba72` | Primary action and frame emphasis |
| Action gold hover | `--ux-color-action-hover` | `#eed391` | Hover and active emphasis |
| Focus | `--ux-color-focus` | `#f3d98d` | Keyboard focus and required-direction cue |
| Selection | `--ux-color-selection` | `#86bbb0` | Turnless selection, distinct from action |
| Information | `--ux-color-info` | `#a9c9cf` | Informational semantic state |
| Success | `--ux-color-success` | `oklch(0.75 0.12 150)` | Confirmed successful outcome |
| Warning | `--ux-color-warning` | `oklch(0.82 0.14 76)` | Actionable caution |
| Danger | `--ux-color-danger` | `oklch(0.65 0.19 24)` | Serious or terminal state |
| Error | `--ux-color-error` | `oklch(0.7 0.19 22)` | Failed action or invalid state |

Semantic roles never rely on color alone. Pair them with text, iconography, geometry, or state labels.

## Typography

- **Product labels and controls:** `"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif`. Native control text inherits the surrounding font size so text zoom also enlarges values and actions.
- **Canonical messages and manual text:** `"SFMono-Regular", Consolas, "Liberation Mono", monospace`.
- **Established display headings:** the system Palatino/Book Antiqua/Liberation Serif stack remains for the NetHack wordmark, lore and major reading or equipment headings. Forms and dense controls use the product sans-serif.
- **Scale:** fixed `rem` steps with at least a 1.25 hierarchy ratio between major levels.
- **Body line length:** 65 to 75 characters for prose where layout permits.
- **Case:** sentence case for player copy. Preserve canonical NetHack capitalization and command case.

## Spacing and Shape

- Base spacing unit: 4 CSS pixels.
- Preferred steps: 4, 8, 12, 16, 24, and 32 pixels.
- Use varied spacing to distinguish related controls from section boundaries.
- Default radius: 0.3rem for controls, 0.65rem for overlays.
- Dense expert rows may be 32 pixels tall when full keyboard equivalence exists.
- Pointer-oriented controls target at least 44 by 44 CSS pixels where space permits.
- Avoid nested cards. Prefer sections, rows, separators, and whitespace.
- Command and inventory results use flat rows with separators. Selected rows have a blue-green fill and outline; filter tabs use an underline.
- Settings keeps its heading and opaque action footer outside the scrolling field groups.
- Routine command readiness produces no player notice. Notices share the fixed-height header beside Settings; long messages scroll within their cell. Showing or clearing a notice never adds a row above the map.
- The movement/history rail scrolls rather than shrinking or clipping its controls.
- The gameplay message viewport defaults to eight rendered text line heights. The map receives the remaining vertical space. Pointer and keyboard divider adjustments persist as an explicit custom split, and the player can restore the eight-line default.
- Quick actions and contextual actions each occupy one fixed 3.5rem row. Excess controls scroll horizontally and remain keyboard-reachable; adding actions never increases toolbar height.
- Contextual controls retain their DOM identity by action ID. Identical updates do not mutate or reanimate them. Changed controls receive fresh presentation and dispatch data; removed actions cannot dispatch.

## Layout

### Full desktop

The primary review target is 1360 by 920. Player notices occupy the application header. Below it, the persistent order is hero and urgent state, contextual actions, known map, latest consequences, then on-demand history and details.

The inventory/equipment workspace uses two intentional columns: approximately 40 to 44 percent for illustrated Equipment and 56 to 60 percent for Inventory. Inventory keeps list and selected-item details/actions in one wide column rather than adding a squeezed third column.

### Compact desktop

The production minimum is 960 by 720. Compact mode is structural, not a scaled-down full layout. Static detail collapses, and inventory/equipment switches to deliberate tabs or stacked task modes. Inventory stacks list above details/actions. At 960 by 720 and 100 percent zoom, Equipment keeps the full figure as the leading visual region and shows all 14 grouped slot controls in opaque side rails within the initial viewport. At 200 percent zoom the figure remains the first substantial Equipment region, while slot controls and details may follow through vertical scrolling. Dialog actions remain visible and keyboard-reachable.

### Unsupported sizes

The production window cannot shrink below 960 by 720. Smaller dimensions are allowed only through an explicit test-mode override and are not a supported player experience.

## Inventory and Equipment Pattern

### Inventory rows and details

- Keep search visible. Full mode names All, Equipped, Weapons, Armor, Consumables, and Magic filters. Compact mode may wrap them or use a labeled filter menu, never horizontal scrolling.
- A row contains only the public selector keycap, icon, full item name wrapping to at most two lines, quantity, and essential equipped/ownership state.
- Category, BUC, charges, other known facts, blockers, comparison values, and actions live in the stable selected-item details/action pane. Do not build chip ribbons inside rows.
- The details pane uses one consistent larger primary action and consistently sized secondary actions, targeting 44 CSS pixels where space permits. Dangerous actions remain separated.
- Click and Enter select only. Named controls dispatch. Selector letters and classic routes remain accelerators; right-click and Shift+F10 open the same action menu.
- Layered armor changes may temporarily remove only required outer layers, spend each native removal, wear, and restoration cost, and complete only after restoring those layers. Curses and interruptions report the actual resulting state; an intermediate inventory change is never success.

### Illustrated equipment

- Keep the complete character visible from head to boots as the visual centerpiece. The figure may extend behind the opaque perimeter rails so it remains prominent in a narrow equipment column.
- Use opaque, high-contrast left and right callout rails over the stage perimeter. Slot labels stay on those surfaces, never directly on the art, and callouts never cover one another.
- Keep all 14 slots in stable grouped positions: helmet/eyes/amulet; cloak/suit/shirt in outer-to-inner order; gloves/boots; main hand/offhand/shield; left/right rings; and quiver. Empty, occupied, blocked, and selected states remain distinguishable.
- Slot selection highlights the control and updates the shared selected-item details/action pane. Cards do not expand over the illustration.
- At 1360 by 920 and 960 by 720, all 14 slot controls and the full prominent portrait remain visible in the initial Equipment viewport without scrolling. A pane narrower than the supported desktop layouts may move the same grouped controls below the figure. The image may scale but may not be cropped, hidden, reduced to a thumbnail, or replaced by a list.

## Component State Contract

Every interactive component implements relevant states from this vocabulary:

- `default`
- `hover`
- `focus`
- `active`
- `disabled`
- `loading`
- `selected`
- `warning`
- `error`

Selection is visually distinct from activation and does not imply a legal target or turn-spending command. Loading prevents duplicate activation only for the owning action. Disabled controls require a public reason when that reason is useful and safe.

## Interaction Vocabulary

- **Close:** dismiss a renderer-owned read-only surface.
- **Cancel:** cancel an unsubmitted NetHack prompt, optionally with an `Esc` keycap.
- **Back:** return to a parent surface.
- **Continue:** acknowledge NetHack text.
- **Explicit verbs:** dispatch an action, for example Take, Put in, Pick up, Drop, Pay selected, Save and exit.
- **Cast:** appears in the top quick actions when the active run has learned spell entries, using native `num_spells()` availability rather than role or carried spellbooks. It sends the ordinary `Z` command without selecting a spell. Temporary energy, memory, or status restrictions remain NetHack's decision; they do not make the shortcut flash on and off.

Keys are secondary keycaps, not primary labels. Internal routes, selector plumbing, revisions, snapshots, PIDs, and bridge state remain in diagnostics.

## Focus and visible feedback

- Show a high-contrast focus ring on every keyboard-reachable control.
- A modal establishes initial focus, traps focus, and returns focus to its invoker or the nearest surviving domain control.
- Returning focus to the camera-managed map preserves its scroll position. Focus restoration may reveal ordinary controls, but must not reposition the dungeon.
- One Escape affects only the top layer and never accepts a prompt.
- Ordinary notices and actionable errors are concise, visible, and distinguished by text, icon, border, and color.
- Custom speech channels, hidden role cues, and assistive-technology-only nodes are not part of the product contract.
- A native direction prompt marks the compass with a vivid purple border and displays "Pick a direction." Ordinary movement has no such cue. The label's space stays reserved, so the cue never moves the map or log. Answering or leaving the direction prompt clears it.
- Adverse status badges use the same vivid purple attention treatment as the direction prompt. Ordinary satiation remains unglowed.

## Motion

- Animate paint and transforms, never layout dimensions. The inventory entrance uses a bounded material-brightness cue; required direction and adverse status attention use a bounded glow.
- Direction and adverse status attention run for three 800-millisecond cycles, then remain clearly marked without continuous motion. Reduced motion uses the same static purple border and label treatment without animation.
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Motion confirms state and never delays core input or turn progression.
- `prefers-reduced-motion` and the presentation motion setting remove nonessential motion, including spinner rotation.

## Sound

Sound remains off and deferred. If approved later, it must be optional, licensed, tied only to confirmed public outcomes, independently controllable for UI and game feedback, and safe when audio initialization fails. No sound may reveal an unseen or inferred result.

## Public Truth and Asset Policy

- Renderer presentation consumes public NetHack or no-spoiler adapter facts only.
- Unknown fields are omitted, or shown as `Unknown` only when comparison requires alignment.
- Canonical messages remain exact even when grouped or classified.
- Native hero identity remains visible over cloud terrain. Moving away removes the hero overlay without erasing the cloud beneath it.
- Engulfment boundaries use their native creature identity, not door or wall guesses from ASCII. While engulfed, contextual actions omit inaccessible ground, container, and terrain affordances; Search, Wait, and More remain available.
- New generated assets are not part of the default modernization path. Any approved asset work follows `ASSET_GENERATION.md` and its transparency and QA requirements.
