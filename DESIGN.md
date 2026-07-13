# NetHack Electron Design System

## Confirmation Record

The Boss confirmed this design direction for UXM-00 on 2026-07-11 through approval of the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11** and the implementation assignment's explicit defaults: restrained truthful map-first presentation, compact HUD intent, 960 by 720 production minimum, and optional sound off and deferred.

On 2026-07-11, after reviewing the current inventory/equipment screenshot, the Boss confirmed that the illustrated full-character paper doll remains a prominent equipment centerpiece. Layout must protect the art and text simultaneously; replacing it with a plain equipment-only list is forbidden.

## Design Direction

A player studies a dangerous dungeon on a desktop monitor in a dim room, moving quickly between keyboard commands and careful inspection. The interface therefore uses a restrained dark palette, strong focus and state cues, compact information hierarchy, and minimal nonessential motion.

The experience is map-first and truthful. Atmosphere comes from tinted dungeon neutrals, disciplined typography, existing game art, and a limited gold action accent. It does not come from decorative chrome or invented information.

## Visual Theme

- **Theme:** dark dungeon desktop, never pure black.
- **Color strategy:** restrained tinted neutrals with one gold action accent occupying less than 10 percent of ordinary surfaces.
- **Density:** compact by default, detailed on demand.
- **Shape language:** practical rectangles and rows with modest radii. Pills are reserved for short status values where the shape improves scanning.
- **Elevation:** separators and surface contrast first, shadows only for true overlays.
- **Assets:** reuse the installed coherent NetHack tileset. UX modernization does not generate new visual or audio assets by default.

## Color Tokens

Tokens use OKLCH so lightness and chroma remain intentional. Exact contrast must be checked against the rendered background before a component ships.

| Role | Token | Value | Use |
|---|---|---:|---|
| Dungeon canvas | `--ux-color-canvas` | `oklch(0.145 0.012 78)` | Window and map surroundings |
| Base surface | `--ux-color-surface` | `oklch(0.19 0.014 76)` | Primary product surfaces |
| Raised surface | `--ux-color-surface-raised` | `oklch(0.235 0.016 75)` | Toolbars and dialogs |
| Quiet surface | `--ux-color-surface-muted` | `oklch(0.175 0.01 75)` | Recessed and secondary regions |
| Strong text | `--ux-color-text` | `oklch(0.91 0.012 82)` | Primary labels and body copy |
| Muted text | `--ux-color-text-muted` | `oklch(0.72 0.018 78)` | Secondary descriptions |
| Faint text | `--ux-color-text-faint` | `oklch(0.59 0.016 76)` | Nonessential metadata only |
| Border | `--ux-color-border` | `oklch(0.34 0.018 74)` | Dividers and control outlines |
| Action gold | `--ux-color-action` | `oklch(0.76 0.12 83)` | Primary action and current emphasis |
| Action gold hover | `--ux-color-action-hover` | `oklch(0.82 0.13 84)` | Hover and active emphasis |
| Focus | `--ux-color-focus` | `oklch(0.82 0.14 92)` | Keyboard focus ring only |
| Selection | `--ux-color-selection` | `oklch(0.7 0.1 238)` | Turnless selection, distinct from action |
| Information | `--ux-color-info` | `oklch(0.72 0.1 238)` | Informational semantic state |
| Success | `--ux-color-success` | `oklch(0.72 0.12 150)` | Confirmed successful outcome |
| Warning | `--ux-color-warning` | `oklch(0.79 0.13 78)` | Actionable caution |
| Danger | `--ux-color-danger` | `oklch(0.67 0.18 27)` | Serious or terminal state |
| Error | `--ux-color-error` | `oklch(0.7 0.19 25)` | Failed action or invalid state |

Semantic roles never rely on color alone. Pair them with text, iconography, geometry, or state labels.

## Typography

- **Product labels and controls:** `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`.
- **Canonical messages and manual text:** `"SFMono-Regular", Consolas, "Liberation Mono", monospace`.
- **Intro and final chronicle only:** a restrained system serif stack may remain where already established.
- **Scale:** fixed `rem` steps with at least a 1.25 hierarchy ratio between major levels.
- **Body line length:** 65 to 75 characters for prose where layout permits.
- **Case:** sentence case for player copy. Preserve canonical NetHack capitalization and command case.

## Spacing and Shape

- Base spacing unit: 4 CSS pixels.
- Preferred steps: 4, 8, 12, 16, 24, and 32 pixels.
- Use varied spacing to distinguish related controls from section boundaries.
- Default radius: 6 pixels for controls, 10 pixels for true overlays.
- Dense expert rows may be 32 pixels tall when full keyboard equivalence exists.
- Pointer-oriented controls target at least 44 by 44 CSS pixels where space permits.
- Avoid nested cards. Prefer sections, rows, separators, and whitespace.

## Layout

### Full desktop

The primary review target is 1360 by 920. The persistent order is hero and urgent state, player notice, contextual actions, known map, latest consequences, then on-demand history and details.

The inventory/equipment workspace uses two intentional columns: approximately 40 to 44 percent for illustrated Equipment and 56 to 60 percent for Inventory. Inventory keeps list and selected-item details/actions in one wide column rather than adding a squeezed third column.

### Compact desktop

The production minimum is 960 by 720. Compact mode is structural, not a scaled-down full layout. Static detail collapses, and inventory/equipment switches to deliberate tabs or stacked task modes. Inventory stacks list above details/actions. Equipment retains a prominent scaled, uncropped full-character paper doll and places its grouped semantic slot list beside it only when space is proven, otherwise below it. At 960 by 720 and 100 percent zoom, the full figure is the leading visual region and occupies at least 35 percent of the initial Equipment content height; it never collapses into an icon or small thumbnail. At 200 percent zoom it remains the first substantial Equipment region, while the slot list/details may follow through vertical scrolling. Dialog actions remain reachable and the page must not develop horizontal scroll.

### Unsupported sizes

The production window cannot shrink below 960 by 720. Smaller dimensions are allowed only through an explicit test-mode override and are not a supported player experience.

## Inventory and Equipment Pattern

### Inventory rows and details

- Keep search visible. Full mode names All, Equipped, Weapons, Armor, Consumables, and Magic filters. Compact mode may wrap them or use a labeled filter menu, never horizontal scrolling.
- A row contains only the public selector keycap, icon, full item name wrapping to at most two lines, quantity, and essential equipped/ownership state.
- Category, BUC, charges, other known facts, blockers, comparison values, and actions live in the stable selected-item details/action pane. Do not build chip ribbons inside rows.
- The details pane uses one consistent larger primary action and consistently sized secondary actions, targeting 44 CSS pixels where space permits. Dangerous actions remain separated.
- Click and Enter select only. Named controls dispatch. Selector letters and classic routes remain accelerators; right-click and Shift+F10 open the same action menu.

### Illustrated equipment

- Keep the complete character visible from head to boots as the visual centerpiece. Decorative art never sits behind text.
- Reserve an art-safe center and opaque, high-contrast perimeter callout rails. Fixed anchors and restrained leader lines link cards without covering the character or crossing other cards.
- Group helmet/eyes/amulet; cloak/suit/shirt in outer-to-inner order; gloves/boots; main/offhand; left/right rings; and quiver/alternate. Empty, occupied, blocked, and selected states retain stable positions.
- Slot selection highlights the anchor and updates the shared selected-item details/action pane. Cards do not expand over the illustration.
- Full-mode callout rails are mandatory. At compact width and 200 percent zoom, Equipment deliberately replaces the rails with the same grouped, opaque and high-contrast, selection-linked slot list beside or below the full-character view. It may scale the illustration, but may not crop, hide, remove, shrink it to a thumbnail, place text over it, or substitute it with only a list.

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

Keys are secondary keycaps, not primary labels. Internal routes, selector plumbing, revisions, snapshots, PIDs, and bridge state remain in diagnostics.

## Focus and visible feedback

- Show a high-contrast focus ring on every keyboard-reachable control.
- A modal establishes initial focus, traps focus, and returns focus to its invoker or the nearest surviving domain control.
- One Escape affects only the top layer and never accepts a prompt.
- Ordinary notices and actionable errors are concise, visible, and distinguished by text, icon, border, and color.
- Custom speech channels, hidden role cues, and assistive-technology-only nodes are not part of the product contract.

## Motion

- State transitions use opacity and transform only.
- Typical duration: 150 to 200 milliseconds.
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Motion confirms state and never delays core input or turn progression.
- `prefers-reduced-motion` and the presentation motion setting remove nonessential motion, including spinner rotation.

## Sound

Sound remains off and deferred. If approved later, it must be optional, licensed, tied only to confirmed public outcomes, independently controllable for UI and game feedback, and safe when audio initialization fails. No sound may reveal an unseen or inferred result.

## Public Truth and Asset Policy

- Renderer presentation consumes public NetHack or no-spoiler adapter facts only.
- Unknown fields are omitted, or shown as `Unknown` only when comparison requires alignment.
- Canonical messages remain exact even when grouped or classified.
- New generated assets are not part of the default modernization path. Any approved asset work follows `ASSET_GENERATION.md` and its transparency and QA requirements.
