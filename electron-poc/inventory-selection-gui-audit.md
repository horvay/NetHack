# Inventory-selection GUI audit

Scope: every known prompt/menu/workflow where NetHack asks the player to choose carried inventory or inventory-like selectable rows. Requirement: GUI-primary rows must show item names and metadata like the inventory screen, filtered to the selectors NetHack allows. Selector letters are secondary hints only.

Update 2026-06-30: equipment management ownership moved to the RPG equipment screen path. The normal `Inventory:` menu now opens a paper-doll equipment screen with carried inventory on the right and slots/actions on the left; raw wear/remove/put-on/take-off item-picking prompts remain as compatibility fallback when NetHack invokes them directly.

Final verification status: each practical workflow family below is covered by automated fixture/browser proof. The former no-cache blocker now has a safe lazy-load path: when an item-selector prompt offers `?` and no inventory rows are cached, the renderer sends only `?` to ask NetHack for the matching inventory list, shows a loading state, and replaces it with filtered item rows if NetHack provides rows.

Status legend:

- **GUI-primary item rows**: visible item rows are primary and filtered to allowed selectors.
- **GUI-primary class rows**: object class choices are named GUI rows; symbols are secondary hints.
- **GUI-primary structured menu rows**: NetHack menu rows are rendered with item/spell/transfer metadata and visible row controls.
- **Advanced-only**: a raw typed selector path remains only for large lists/search or an explicit `?`/`*` NetHack list action.
- **Lazy-load fallback**: renderer proactively requests NetHack's matching inventory list with safe `?`; if no rows arrive, it falls back to labelled selector actions with an explicit missing-data explanation.

| Workflow / prompt family | Selector examples | Final status | Coverage / notes |
|---|---:|---|---|
| Apply / use tool (`a`, `#apply`) | `[fjk or ?*]` | GUI-primary item rows | Verified by `npm run test:inventory-selection-gui-audit` workflow row `apply`: shows wand of digging, magic marker charges, bag of holding; also covered by `test:gui-input-workflow` object filters. |
| Wield / change weapon (`w`) | `[- abef or ?*]` | RPG equipment screen primary; prompt rows fallback | Inventory overview screen can send `w<selector>` from visible rows/weapon slot. Fallback verified by `test:inventory-selection-gui-audit` screenshot case `screenshot-case-wield-abef-none.png`: compact bracket selectors parsed with empty `choices`, filtered rows plus labelled `Bare hands` for `-`. |
| Wear armor (`W`) | `[c or ?*]` | RPG equipment screen primary; prompt rows fallback | Inventory overview screen can send `W<selector>` from visible armor rows. Fallback verified by `test:inventory-selection-gui-audit` workflow row `wear`: leather armor inventory row/metadata. |
| Take off armor (`T`) | `[c or ?*]` | RPG equipment screen primary; prompt rows fallback | Paper-doll worn armor slots send `T<selector>` when NetHack inventory metadata exposes the selector; cursed/stuck confirmation remains labelled fixed buttons in `test:gui-input-workflow`. |
| Put on ring/amulet (`P`) | `[dl or ?*]`, then `l/r` | RPG equipment screen primary; prompt rows fallback | Inventory overview screen can send `P<selector>` for rings/amulets/eyes items. Hand follow-up still uses GUI visible hand buttons when NetHack asks. |
| Remove ring/amulet (`R`) | `[dl or ?*]` | RPG equipment screen primary; prompt rows fallback | Paper-doll ring/amulet/eyes slots and equipped rows send `R<selector>` when metadata exposes the selector; fallback prompt rows remain tested. |
| Quiver / ready ammunition (`Q`) | `[- e or ?*]` | RPG equipment screen primary; prompt rows fallback | Inventory overview screen can send `Q<selector>` for projectile rows or quiver slot; fallback prompt shows arrows row plus contextual `No quiver item`/no-item special row for `-`. |
| Throw / fire (`t`, `f`) | `[be or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `throwFire`: dagger/arrows rows; subsequent direction remains compact direction controls. |
| Read scroll/spellbook (`r`) | `[g or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `read`: scroll of identify row. |
| Eat food/corpse (`e`) | `[ai or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `eat`: food ration and lizard corpse rows. |
| Quaff potion (`q`) | `[h or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `quaff`: potion of healing row. |
| Zap wand (`z`) | `[f or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `zap`: wand of digging row with charges; direction follow-up remains compact direction controls. |
| Dip (`#dip`) | `[bgh or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `dipSource`: dagger, scroll, and potion rows. |
| Rub (`#rub`) | `[j or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `rub`: magic marker row; command breadcrumb path covered by `test:gui-input-workflow`. |
| Invoke (`#invoke`) | `[fl or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `invoke`: wand and amulet rows. |
| Offer sacrifice (`#offer`) | `[i or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `offer`: lizard corpse row. |
| Write / engrave with tool | `[- fj or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `writeEngraveTool` and `test:gui-input-workflow` engraving screenshot: `Fingers / no tool`, wand charges, magic marker charges. |
| Force lock (`#force`) | `[bj or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `forceLockTool`: dagger and magic marker rows. |
| Loot/container item choices | menu rows with selectors | GUI-primary structured menu rows | Verified by `test:inventory-selection-gui-audit` follow-up `lootContainer` and screenshot `loot-container-transfer-rows.png`: transfer/container pane rows with item names; also covered by `test:gui-input-workflow`. |
| Drop selected items (`d`) | menu rows / selectors or `[abc or ?*]` | GUI-primary item rows / structured menu rows | Verified by `test:inventory-selection-gui-audit` workflow row `dropItem` and follow-up `dropMenu`: item rows/names, not letters-only. |
| Drop type (`D` / class prompt) | object classes like `!?+$` | GUI-primary class rows | Fixed class prompt precedence so object-class prompts are named class rows instead of special-selector/fallback rows. Verified by `test:inventory-selection-gui-audit` follow-up `dropClass`. |
| Naming/calling an item (`C`, name/call prompts) | `[abef or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `nameCall`: food, dagger, arrows, wand rows; text-entry follow-up remains labelled. |
| Identify / what-is item (`/`, `;`, `#whatis` when item follows) | `[gfh or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` workflow row `identifyWhatIsItem`: scroll, wand, potion rows. Map inspect/direction prompts remain separate non-inventory UI. |
| Spell/item followups | spell menu rows; item then direction/text/confirm | GUI-primary structured spell rows and item rows | Verified by `test:inventory-selection-gui-audit` follow-up `spellMenu` for spells and workflow row `spellItemFollowup` for item follow-up rows; direction follow-ups remain compact helper. |
| Special selector `?` | `?` | Advanced-only visible row | Verified by `test:inventory-selection-gui-audit` workflow row `specialQuestionStar`: renders `Show matching inventory` as visible action, not a bare `?` button. |
| Special selector `*` | `*` | Advanced-only visible row | Verified by `test:inventory-selection-gui-audit` workflow row `specialQuestionStar`: renders `Show all inventory` as visible action, not a bare `*` button. |
| Special selector `-` | `-` | GUI-primary labelled row | Verified by screenshot case plus `wield`, `quiver`, and `writeEngraveTool` rows: contextual labels include `Bare hands`, `No quiver item`, and `Fingers / no tool`. |
| Empty `choices` but bracketed selectors in query | `[- abef or ?*]` | GUI-primary item rows | Verified by `test:inventory-selection-gui-audit` screenshot case with `choices:''`; implemented in `src/shared/prompt-rules.js`, `src/shared/interaction-model.js`, and renderer parser. |
| No cached inventory rows available | any item-selector prompt with `?` | Lazy-load fallback | Verified by `test:inventory-selection-gui-audit` `lazyLoadSuccess` and `noInventoryBlocked`: first shows `Loading inventory choices…`, sends only safe `?` (no item selector, no `*`, no cancel), uses returned menu rows as filtered GUI-primary item rows when NetHack provides them, and otherwise falls back to labelled selector actions with “NetHack did not provide inventory data.” |
