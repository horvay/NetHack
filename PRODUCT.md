# Product

## Confirmation Record

The Boss confirmed this canon for UXM-00 on 2026-07-11 by approving the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11** and explicitly confirming its product defaults in the implementation assignment: 960 by 720 production minimum, compact HUD as the intended default, restrained truthful map-first tone, and optional sound off and deferred. The plan supplies the approved audience, classic-expert compatibility, truth boundary, density, and accessibility direction reflected below.

On 2026-07-11, after reviewing the current inventory/equipment screenshot, the Boss additionally decided that the illustrated full-character paper doll must remain a prominent equipment centerpiece. Readability must improve around it through anchored callouts, wider inventory rows, selected-item details/actions, and structural compact modes. A plain equipment-only list is not an acceptable replacement.

## Register

product

## Users

NetHack Electron serves two overlapping groups:

- People learning NetHack who need clear names, visible actions, understandable consequences, and safe cancellation without having the game play for them.
- Experienced players who rely on exact NetHack terminology, case-sensitive command keys, counts, menu letters, fast prompts, and the consequences of irreversible choices.

Players use the app on a Linux desktop, often for long, concentrated sessions in a dim or mixed-light environment. Their primary job is to read the known dungeon state, choose an intentional action, and understand the result without losing NetHack's uncertainty or pace.

## Product Purpose

Present real NetHack as a legible modern desktop game while preserving its rules, public knowledge boundary, turn economy, discovery, save constraints, permadeath, and classic keyboard flow.

Success means the hero, urgent state, known map, available context, and latest consequence are easy to find. GUI actions remain alternate inputs to the same core commands and prompts. The renderer never invents legality, identity, outcome, damage, attitude, range, or hidden state.

The modernization direction is defined by the **NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11**. Its approved product defaults are:

- 1360 by 920 as the primary desktop review size.
- 960 by 720 as the production minimum and compact desktop target.
- Compact HUD as the intended default, with detail available on demand.
- A prominent illustrated full-character paper doll in Equipment at full and compact desktop sizes, with text and controls kept outside the character-safe area.
- A restrained, dark, map-first presentation.
- Optional sound off by default and deferred until approved, licensed assets exist.
- Desktop support only. Mobile and touch support are not claimed.

## Brand Personality

**Restrained, truthful, resolute.**

The interface should feel atmospheric without becoming theatrical, precise without becoming clinical, and capable without exposing implementation machinery. Player copy is concise and direct. Canonical NetHack vocabulary remains where it improves fluency.

## Anti-references

This product must not resemble:

- A different action roguelike layered over NetHack with click-to-move, tactical recommendations, predicted outcomes, or automated play.
- A terminal wrapper that exposes selectors, revisions, snapshots, bridge state, PIDs, command routes, or testing controls as player chrome.
- A casino-like fantasy UI with saturated gold, decorative gradients, glow everywhere, or animation that paces turns.
- A generic dashboard made from nested cards, uniform pills, and equally weighted facts.
- A chip-filled inventory that truncates names or a plain equipment-only list that removes the character illustration to avoid solving layout.
- A mobile-first interface that sacrifices the known 80 by 21 dungeon, keyboard speed, or explicit prompt ownership.
- A spoiler assistant that resolves unidentified appearances or infers hidden monster, trap, item, shop, target, or final-run facts.

## Design Principles

### Core truth before convenience

Only public NetHack facts may shape availability, labels, details, and feedback. Unknown information stays unknown. Omission is preferred when an unavailable fact is not useful.

### Map, urgency, consequence

Persistent hierarchy favors the known map, hero vitals and urgent conditions, current context, and the latest canonical consequence. Static attributes, system facts, and long history move on demand.

### Recognition with expert acceleration

Use player-meaningful names and explicit verbs first. Show keys as secondary accelerators. Preserve arrows, `hjklyubn`, counts, command case, menu letters, `#` commands, and Escape without added latency.

### Selection is safe, dispatch is deliberate

Focus, hover, row selection, map-cell selection, filtering, and presentation modes spend no turns. Gameplay input requires a named activation and follows the existing core prompt, interruption, cancellation, and turn cost.

### One owner, one outcome

Only one prompt or top layer owns input at a time. One Escape affects one layer. Player chrome describes prompts, confirmed outcomes, and actionable failures, while technical transport detail stays in diagnostics.

### Dense hierarchy, not visual noise

The product may be information-dense, but urgency must outrank static facts. Use rows, separators, shape, typography, and space before adding cards, pills, or decoration.

### Illustrated equipment, readable items

Equipment keeps the complete character illustration visually prominent. Slot callouts use reserved opaque and high-contrast rails and never cover the character or one another. Inventory prioritizes selector, icon, a full name of up to two lines, quantity, and essential equipped/ownership state; filters and a stable selected-item pane carry secondary facts and explicit actions. Compact widths use deliberate tabs or stacking while retaining the full figure as a prominent, non-thumbnail Equipment view.

## Mainstream usability

- Target WCAG AA contrast for body copy and direct checks for focus, small labels, and urgent states.
- Support complete keyboard operation and preserve classic NetHack keyboard input.
- Provide visible focus, predictable focus entry and return, and non-color state cues.
- Support 200 percent text zoom for core flows at the declared desktop sizes as modernization surfaces land.
- Respect reduced motion and never make animation block input.
- Per the Boss decision on 2026-07-11, blind/screen-reader support, speech announcements, accessibility-tree evidence, and automated accessibility auditing are removed from the NetHack UX plan. Native controls may retain harmless standard HTML semantics, but custom assistive-technology machinery is not a product requirement.
