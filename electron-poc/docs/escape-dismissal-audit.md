# Escape dismissal audit

Escape is routed by the capture-phase layer router in `src/renderer.js` (`topmostEscapeLayer` / `handleTopmostEscapeKeydown`). It runs before focused controls, native `<dialog>` cancellation, and dungeon input forwarding. A handled Escape is prevented and propagation is stopped. Holding Escape consumes repeat keydowns until keyup, so it cannot tear through a nested stack.

Each dismissible layer invokes the same visible Close, Done, Cancel, or Continue control used by pointer input. Before dismissal, transient `.dragging` and `.drag-over` presentation is cleared. A new overlay must be added to `modalOverlayDialogs` and `dialogEscapeLayer`, or be represented by an explicit non-dialog branch in `topmostEscapeLayer`.

## Audited layers

| Layer / implementation | Escape behavior | Cleanup path |
| --- | --- | --- |
| Ground pickup/drop direct-transfer panel (`#container-transfer-panel`, `sessionKind: ground-pickup`) | Dismiss | Visible **Done** button → `cancelContainerTransferPanel`; does not send a game key unless a real NetHack selection menu is still awaiting cancellation |
| Container transfer panel (`sessionKind: container`) | Dismiss | Visible **Done** button → cancel backing menu, clear prompt/menu/session/transaction ownership, close panel |
| Inventory / RPG equipment panel | Dismiss | `#interaction-cancel` → `cancelActiveInteraction`; cancels backing inventory menu and suppresses stale reopen |
| Single- and multi-select item menus (wear/take off/drop/pickup/identify), spells, skills, options, transfer selections | Dismiss | Shared interaction Cancel path; sends NetHack Escape and clears prompt/menu state |
| Fixed-choice prompts, shop offers, destructive confirmations, free-text prompts | Dismiss when NetHack presents a cancellable interaction | Shared interaction Cancel path; sends NetHack Escape |
| Read-only NetHack menus | Dismiss | Shared interaction Close/Cancel path; acknowledges/cancels the backing menu |
| Contextual map/door/action sheets | Dismiss | Shared interaction Cancel path → `dismissContextualPrompt`; sends no dungeon command for renderer-only suggestions |
| Inventory, equipment-slot, and ground-item pop-up action menus (`.inventory-context-menu`) | Dismiss topmost only | `closeInventoryContextMenu`; owning panel remains open |
| Map targeting helper | Dismiss | Visible **Cancel targeting** control → shared prompt cancellation |
| Help/history/document window | Dismiss, including while search has focus | Visible **Close / Back** button |
| Use item / Actions modal | Dismiss, including while repeat input has focus | Visible **Close** button |
| Settings | Dismiss | Visible **Cancel** button; unsaved settings are not applied |
| Character creation | Dismiss | Visible **Cancel** button; no game starts |
| Intro chronicle | Dismiss | Visible **Begin the descent** continuation; this presentation is not a live NetHack prompt and sends no blank/game key |

The prompt and menu chips in the top context strip mirror the owning interaction and are not independent overlays. Hover map tooltips are transient pointer help, not cancellable dialogs. The direction pad for an active NetHack direction question remains part of the game prompt: Escape reaches NetHack through the normal prompt input path unless map-target mode exposes the explicit Cancel targeting layer above.

## Intentionally non-dismissible exceptions

- **Startup choice** (`#startup-choice-dialog`): the app cannot proceed without choosing Continue or Start new game. Escape is consumed and focus returns to **Start new game**; it never reaches dungeon input.
- **Game-over final chronicle** (`#game-over-dialog`): the ended run must leave through **New game** or **Exit**. Escape is consumed, the modal remains open, and focus returns to **New game**.

Nested overlays are resolved by layer priority: an item context menu is above its owning dialog; the most recently opened native modal is above a transfer panel; a transfer panel is above dungeon input. One distinct Escape dismisses one layer. The next Escape may dismiss the newly exposed layer.
