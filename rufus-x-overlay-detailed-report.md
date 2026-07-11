# X Overlay Investigation Report: Corpses, Inventory, Equipment, and Neck/Amulet UI

Date: 2026-07-01  
Project: `/home/horvay/work/nethack`  
Report file intentionally outside Run Evidence path: `/home/horvay/work/nethack/rufus-x-overlay-detailed-report.md`

## Executive verdict

- **Corpse X overlay on the map/tile renderer exists and is implemented.**
  - It is driven by map semantic data: `semanticKind === "corpse"`.
  - Corpse cells keep the underlying monster/item tile asset so the corpse remains recognizable.
  - The renderer/model adds `corpse-tile corpse-overlay` classes.
  - CSS paints the red X with two diagonal `linear-gradient(...)` layers in `.tile-cell.corpse-overlay::after`.
  - Unit/rendering and real Electron MCP/CDP evidence both confirm a corpse gets the overlay and a live monster does not.

- **Inventory/equipment/neck X overlay is not implemented.**
  - The RPG equipment screen has an `amulet` slot and detects amulets/neck state from inventory text (`being worn` or `on neck`), but this only populates slot text/actions.
  - No inventory row, equipment slot, amulet/neck slot, or item action UI adds an X overlay/cross/marked visual state comparable to the corpse map overlay.
  - Existing equipment UI markers are ordinary slot/item states (`equipped`, `drag-over`, action pills, worn metadata), not X overlays.

## Files and code paths inspected

Primary renderer/UI/tile files:

- `electron-poc/src/shared/map-presentation.js`
- `electron-poc/src/renderer.js`
- `electron-poc/src/styles.css`
- `electron-poc/src/shared/tile-assets.js`
- `electron-poc/src/shared/inventory-action-service.js`
- `electron-poc/src/shared/interaction-model.js`
- `electron-poc/src/renderer.html`

Relevant tests/scripts:

- `electron-poc/scripts/corpse-overlay-rendering-test.js`
- `electron-poc/scripts/real-corpse-overlay-mcp-test.js`
- `electron-poc/scripts/equipment-screen-rpg-test.js`
- `electron-poc/scripts/gui-input-workflow-test.js`
- `electron-poc/scripts/inventory-selection-gui-audit-test.js`
- `electron-poc/package.json`

Evidence/output directories inspected:

- `electron-poc/test-output/real-corpse-overlay-mcp/`
- `electron-poc/test-output/equipment-screen-rpg/`
- `electron-poc/test-output/real-equipment-screen-mcp/`
- `electron-poc/test-output/inventory-selection-gui-audit/`

## Corpse map/tile overlay implementation details

### Semantic corpse detection

File: `electron-poc/src/shared/map-presentation.js`

Important functions/lines:

- `isCorpseCell(cell)` around line 48:

```js
function isCorpseCell(cell) {
  return String(TileAssets.normalizeCell(cell).semanticKind || '').toLowerCase() === 'corpse';
}
```

- `corpseLabel(name)` around line 51:

```js
function corpseLabel(name) {
  const base = humanizeId(name || '').trim();
  if (!base) return 'corpse';
  return /\bcorpse\b/i.test(base) ? base : `${base} corpse`;
}
```

- `cellViewModel(...)` around lines 83-99:

```js
const corpse = isCorpseCell(normalized);
...
ariaLabel = corpse ? `${corpseLabel(normalized.semanticName)} over dungeon floor` : `${normalized.semanticName || tile.name} over dungeon floor`;
...
ariaLabel = corpse ? corpseLabel(normalized.semanticName || tile.name) : (tile.name || titleCase(tile.id));
...
if (corpse) classes.push('corpse-tile', 'corpse-overlay');
```

Meaning: any map cell whose normalized semantic kind is `corpse` gets both `corpse-tile` and `corpse-overlay`. The overlay is not inferred from the word `corpse` in the name alone; it depends on semantic kind.

### Renderer consumption of the map view model

File: `electron-poc/src/renderer.js`

Important function:

- `applyMapCellToElement(cellEl, x, y)` around lines 430-447:

```js
if (sharedModules.mapPresentation?.cellViewModel) {
  const model = sharedModules.mapPresentation.cellViewModel(normalized, x, y, { tileMapConfig, tileAssetsById, cells: mapCells, cursor, mapWindowId });
  resetMapCellElement(cellEl, x, y, normalized);
  cellEl.className = model.classes.join(' ');
  if (model.assetId) cellEl.dataset.tileId = model.assetId;
  if (model.baseTileId) cellEl.dataset.baseTileId = model.baseTileId;
  if (model.backgroundImage) cellEl.style.backgroundImage = model.backgroundImage;
  if (model.tileImage) cellEl.style.setProperty('--tile-image', model.tileImage);
  if (model.ariaLabel) cellEl.setAttribute('aria-label', model.ariaLabel);
  if (model.fallbackGlyph) cellEl.textContent = model.fallbackGlyph;
  applyMapCellInteractionClasses(cellEl, x, y);
  return;
}
```

Meaning: `cellViewModel` is authoritative for map cell classes in the shared presentation path. If `cellViewModel` returns `corpse-overlay`, the DOM element receives that class.

### CSS red X paint

File: `electron-poc/src/styles.css`

Important rule around lines 426-436:

```css
.tile-cell.corpse-overlay::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  background:
    linear-gradient(45deg, transparent 40%, rgba(127, 29, 29, 0.9) 42%, rgba(239, 68, 68, 0.98) 47%, rgba(254, 202, 202, 0.92) 50%, rgba(239, 68, 68, 0.98) 53%, rgba(127, 29, 29, 0.9) 58%, transparent 60%),
    linear-gradient(-45deg, transparent 40%, rgba(127, 29, 29, 0.9) 42%, rgba(239, 68, 68, 0.98) 47%, rgba(254, 202, 202, 0.92) 50%, rgba(239, 68, 68, 0.98) 53%, rgba(127, 29, 29, 0.9) 58%, transparent 60%);
  filter: drop-shadow(0 0 2px rgba(0,0,0,0.85));
  box-shadow: inset 0 -3px 6px rgba(0,0,0,0.28);
}
```

Meaning: the X is a CSS pseudo-element on map/tile cells only. It is not a reusable inventory/equipment decoration class.

## Inventory, equipment, and neck/amulet status findings

### Existing neck/amulet handling

File: `electron-poc/src/renderer.js`

Important code around lines 1206-1233:

```js
function equipmentSlotModels(sourceItems = cachedInventoryChoices) {
  const findItem = (pattern) => sourceItems.find((item) => pattern.test(String(item.text || '')));
  const mainHand = findItem(/\b(?:weapon in hand|weapon in right hand|wielded)\b/i);
  const offhand = findItem(/\b(?:alternate weapon|weapon in left hand)\b/i);
  const quiver = findItem(/\bin quiver\b/i);
  const amulet = findItem(/\b(?:being worn|on neck)\b/i) && findItem(/\bamulet\b/i);
  ...
  return [
    ...
    { id: 'amulet', label: 'Amulet', item: amulet, empty: 'No amulet worn', equipKey: 'P', removeKey: 'R', actions: [{ label: 'Put on', key: 'P' }, { label: 'Remove', key: 'R' }] },
    ...
  ];
}
```

This confirms an **amulet/neck slot exists**, but the code only uses it to render slot text/actions. There is no X overlay class or cross marker added for this slot.

### Existing equipment slot rendering

File: `electron-poc/src/renderer.js`

Important code around lines 1250-1272:

```js
function equipmentSlotElement(slot, commandWithSelector = true) {
  const card = document.createElement('div');
  card.className = `equipment-slot${slot.item ? ' equipped' : ''}`;
  card.dataset.slot = slot.id;
  const title = document.createElement('strong');
  title.textContent = slot.label;
  const value = document.createElement('span');
  value.className = 'equipment-item';
  value.textContent = slot.item ? cleanEquipmentText(slot.item.text) : slot.empty;
  ...
}
```

This adds only `equipment-slot` and optionally `equipped`. No `corpse-overlay`, `x-overlay`, `marked`, `cross`, or equivalent visual indicator is applied to equipment slots, including `data-slot="amulet"`.

### Existing RPG inventory row rendering

File: `electron-poc/src/renderer.js`

Important code around lines 3204-3215:

```js
const { rowAction } = equipmentInventoryOption(item);
const actionHtml = rowAction ? `<span class="row-action-pill equipment-row-action">${escapeHtml(rowAction.label)}</span>` : '<span class="row-action-pill equipment-row-action muted">Inspect</span>';
return {
  key,
  label: menuItemName(item.text),
  className: 'inventory-row rpg-inventory-row',
  html: `${tileHtmlForMenuItem(item, 'menu-tile')}<span class="selector-keycap" aria-hidden="true">${key}</span><span class="menu-item-main"><span class="menu-item-name">${escapeHtml(menuItemName(item.text))}</span><span class="menu-badges">${badges}</span></span>${actionHtml}`,
  item,
  draggable: true,
  ariaLabel: `${rowAction ? `${rowAction.label}; draggable to compatible equipment slots` : 'Inventory'} ${menuItemName(item.text)}${menuItemState(item.text) ? `, ${menuItemState(item.text)}` : ''}; Actions menu available with right click or Shift+F10; NetHack selector ${key}`,
};
```

Inventory rows get tile icon, selector keycap, item name, badges, and a row action pill. They do not get an X overlay marker.

### Equipment/amulet CSS

File: `electron-poc/src/styles.css`

Relevant equipment CSS:

```css
.equipment-slot { ... }
.equipment-slot.equipped .equipment-item { color: #d8f8e8; font-weight: 700; }
.rpg-equipment-dialog .equipment-slot[data-slot="amulet"] { left: 34.5%; bottom: 172px; }
.rpg-equipment-dialog .choice-button.rpg-inventory-row { ... }
.row-action-pill { ... }
```

None of these rules draw an X or use the `corpse-overlay` pseudo-element. The only CSS red X implementation found is `.tile-cell.corpse-overlay::after`, which targets map tile cells.

## Focused grep results

Commands were run from `/home/horvay/work/nethack`.

### Corpse overlay references

```text
$ rg -n "corpse-overlay|corpse-tile|isCorpseCell|corpseLabel" electron-poc/src electron-poc/scripts electron-poc/package.json

electron-poc/package.json:25:    "test:corpse-overlay": "node scripts/corpse-overlay-rendering-test.js",
electron-poc/package.json:37:    "test:real-corpse-overlay-mcp": "node scripts/real-corpse-overlay-mcp-test.js",
electron-poc/scripts/real-corpse-overlay-mcp-test.js:7:const outDir = process.env.NH_CORPSE_OVERLAY_OUT_DIR || path.join(root, 'test-output', 'real-corpse-overlay-mcp');
electron-poc/scripts/real-corpse-overlay-mcp-test.js:42:  const overlaidCorpses = corpseCells.filter(c => /corpse-overlay/.test(c.className));
electron-poc/scripts/real-corpse-overlay-mcp-test.js:44:  const liveMonsterWithOverlay = liveMonsters.filter(c => /corpse-overlay/.test(c.className));
electron-poc/scripts/real-corpse-overlay-mcp-test.js:99:    fs.writeFileSync(path.join(outDir, 'real-corpse-overlay-mcp-summary.md'), md);
electron-poc/scripts/corpse-overlay-rendering-test.js:18:assert.ok(corpse.classes.includes('corpse-tile'), 'corpse cell gets corpse marker class');
electron-poc/scripts/corpse-overlay-rendering-test.js:19:assert.ok(corpse.classes.includes('corpse-overlay'), 'corpse cell gets red-X overlay class');
electron-poc/scripts/corpse-overlay-rendering-test.js:24:assert.ok(!liveMonster.classes.includes('corpse-overlay'), 'live monster must not get corpse red-X overlay');
electron-poc/scripts/corpse-overlay-rendering-test.js:28:assert.ok(!objectCorpseNameOnly.classes.includes('corpse-overlay'), 'semanticName text alone is not enough; overlay relies on semantic corpse kind');
electron-poc/scripts/corpse-overlay-rendering-test.js:31:assert.match(css, /\.tile-cell\.corpse-overlay::after/, 'CSS defines corpse overlay pseudo-element');
electron-poc/scripts/corpse-overlay-rendering-test.js:35:console.log('PASS corpse-overlay-rendering-test');
electron-poc/src/shared/map-presentation.js:48:  function isCorpseCell(cell) {
electron-poc/src/shared/map-presentation.js:51:  function corpseLabel(name) {
electron-poc/src/shared/map-presentation.js:83:    const corpse = isCorpseCell(normalized);
electron-poc/src/shared/map-presentation.js:91:        ariaLabel = corpse ? `${corpseLabel(normalized.semanticName)} over dungeon floor` : `${normalized.semanticName || tile.name} over dungeon floor`;
electron-poc/src/shared/map-presentation.js:94:        ariaLabel = corpse ? corpseLabel(normalized.semanticName || tile.name) : (tile.name || titleCase(tile.id));
electron-poc/src/shared/map-presentation.js:97:      ariaLabel = corpse ? corpseLabel(normalized.semanticName || tile.name) : (tile.name || titleCase(tile.id));
electron-poc/src/shared/map-presentation.js:99:    if (corpse) classes.push('corpse-tile', 'corpse-overlay');
electron-poc/src/shared/map-presentation.js:124:  return Object.freeze({ ..., isCorpseCell, cellViewModel, tooltipInfoForCell });
electron-poc/src/styles.css:426:.tile-cell.corpse-overlay::after {
```

### Red X / overlay references

```text
$ rg -n "red-X|red X|corpse.*overlay|overlay.*corpse|linear-gradient\(45deg|linear-gradient\(-45deg" electron-poc/src electron-poc/scripts

electron-poc/scripts/real-corpse-overlay-mcp-test.js:87:    const overlayShot = await shot(cdp, '02-live-game-corpse-red-x-overlay-with-live-monster-negative.png');
electron-poc/scripts/corpse-overlay-rendering-test.js:19:assert.ok(corpse.classes.includes('corpse-overlay'), 'corpse cell gets red-X overlay class');
electron-poc/scripts/corpse-overlay-rendering-test.js:24:assert.ok(!liveMonster.classes.includes('corpse-overlay'), 'live monster must not get corpse red-X overlay');
electron-poc/scripts/corpse-overlay-rendering-test.js:28:assert.ok(!objectCorpseNameOnly.classes.includes('corpse-overlay'), 'semanticName text alone is not enough; overlay relies on semantic corpse kind');
electron-poc/src/shared/map-presentation.js:99:    if (corpse) classes.push('corpse-tile', 'corpse-overlay');
electron-poc/src/styles.css:426:.tile-cell.corpse-overlay::after {
electron-poc/src/styles.css:433:    linear-gradient(45deg, transparent 40%, rgba(127, 29, 29, 0.9) 42%, rgba(239, 68, 68, 0.98) 47%, rgba(254, 202, 202, 0.92) 50%, rgba(239, 68, 68, 0.98) 53%, rgba(127, 29, 29, 0.9) 58%, transparent 60%),
electron-poc/src/styles.css:434:    linear-gradient(-45deg, transparent 40%, rgba(127, 29, 29, 0.9) 42%, rgba(239, 68, 68, 0.98) 47%, rgba(254, 202, 202, 0.92) 50%, rgba(239, 68, 68, 0.98) 53%, rgba(127, 29, 29, 0.9) 58%, transparent 60%);
```

Interpretation: all concrete X/overlay hits point to the map corpse overlay. No equivalent inventory/equipment/neck X overlay class was found.

### Neck/amulet references

```text
$ rg -n "neck|amulet|on neck|equipment-slot\[data-slot=\"amulet\"\]|data-slot=\"amulet\"" electron-poc/src electron-poc/scripts

electron-poc/src/shared/inventory-action-service.js:21:  function hasRingAccessoryTag(text) { return /\b(?:ring|amulet|blindfold|lenses|towel)\b/i.test(text); }
electron-poc/src/shared/inventory-action-service.js:143:    if (id === 'amulet') return /\bamulet\b/i.test(text) ? { ok: true, actionId: 'item.putOn.accessory', command: `P${key}`, message: `Put on ${cleanName(text)}.` } : { ok: false, actionId: 'item.putOn.accessory', reason: 'Only amulets fit the amulet/neck slot.' };
electron-poc/src/renderer.html:135:            <button type="button" data-command-key="P">Put on ring/amulet</button>
electron-poc/src/renderer.html:136:            <button type="button" data-command-key="R">Remove ring/amulet</button>
electron-poc/src/styles.css:630:.rpg-equipment-dialog .equipment-slot[data-slot="amulet"] { left: 34.5%; bottom: 172px; }
electron-poc/src/renderer.js:1211:  const amulet = findItem(/\b(?:being worn|on neck)\b/i) && findItem(/\bamulet\b/i);
electron-poc/src/renderer.js:1232:    { id: 'amulet', label: 'Amulet', item: amulet, empty: 'No amulet worn', equipKey: 'P', removeKey: 'R', actions: [{ label: 'Put on', key: 'P' }, { label: 'Remove', key: 'R' }] },
electron-poc/src/renderer.js:1300:  if (/\b(?:ring|amulet|blindfold|lenses|towel)\b/i.test(text)) return { label: 'Put on', key: 'P' };
electron-poc/src/renderer.js:2029:  ['"', 'Amulets and amulet discoveries'],
electron-poc/src/renderer.js:2753:  if (/potion|scroll|wand|spellbook|ring|amulet/.test(text)) return 'magic';
electron-poc/src/renderer.js:2893:  if (/put on/.test(q)) return [['all', 'All candidates'], ['rings', 'Rings'], ['amulets', 'Amulets'], ['cursed-risk', 'Cursed/stuck risk']];
electron-poc/src/renderer.js:2919:  if (filter === 'accessories') return /ring|amulet|blindfold|towel|lenses/.test(value);
electron-poc/src/renderer.js:2921:  if (filter === 'amulets') return /amulet/.test(value);
electron-poc/src/renderer.js:2930:  if (filter === 'artifacts') return /artifact|named|amulet|quest|orb|eye|mitre|scepter|staff|bane|brand|special/.test(value);
```

Interpretation: neck/amulet logic exists as equipment semantics and filtering, not as an X overlay.

### Equipment/inventory overlay-ish references

```text
$ rg -n "rpg-inventory-row|equipment-slot|row-action-pill|overlay|x-overlay|cross|corpse-overlay" electron-poc/src/renderer.js electron-poc/src/styles.css electron-poc/src/shared/inventory-action-service.js

electron-poc/src/styles.css:159:.equipment-slot { ... }
electron-poc/src/styles.css:163:.equipment-slot.equipped .equipment-item { color: #d8f8e8; font-weight: 700; }
electron-poc/src/styles.css:404:.tile-cell.has-tile.tile-overlay {
electron-poc/src/styles.css:407:.tile-cell.has-tile.tile-overlay::before {
electron-poc/src/styles.css:426:.tile-cell.corpse-overlay::after {
electron-poc/src/styles.css:446:#game-grid.map-target-mode { cursor: crosshair; ... }
electron-poc/src/styles.css:447:#game-grid.map-target-mode .tile-cell { cursor: crosshair; }
electron-poc/src/styles.css:616:.rpg-equipment-dialog .equipment-slot { ... }
electron-poc/src/styles.css:630:.rpg-equipment-dialog .equipment-slot[data-slot="amulet"] { left: 34.5%; bottom: 172px; }
electron-poc/src/styles.css:634:.equipment-slot.drag-over { outline: 2px solid #7dd3fc; background: rgba(14, 165, 233, 0.18); }
electron-poc/src/styles.css:635:.rpg-equipment-dialog .choice-button.rpg-inventory-row { ... }
electron-poc/src/styles.css:681:.row-action-pill { ... }
electron-poc/src/renderer.js:1252:  card.className = `equipment-slot${slot.item ? ' equipped' : ''}`;
electron-poc/src/renderer.js:1260:  actions.className = 'equipment-slot-actions';
electron-poc/src/renderer.js:1511:    card.classList.add('drag-over');
electron-poc/src/renderer.js:1513:  slots.addEventListener('dragleave', (event) => event.target.closest('.equipment-slot')?.classList.remove('drag-over'));
electron-poc/src/renderer.js:1814:        document.querySelectorAll('.equipment-slot.drag-over').forEach((el) => el.classList.remove('drag-over'));
electron-poc/src/renderer.js:3205:        const actionHtml = rowAction ? `<span class="row-action-pill equipment-row-action">${escapeHtml(rowAction.label)}</span>` : '<span class="row-action-pill equipment-row-action muted">Inspect</span>';
electron-poc/src/renderer.js:3209:          className: 'inventory-row rpg-inventory-row',
```

Interpretation: `overlay` in equipment/inventory grep is either the map tile overlay/corpse overlay or unrelated cursor `crosshair`; no equipment/inventory X overlay exists.

## Test coverage and command output

### Command run

```bash
cd electron-poc && npm run test:corpse-overlay
```

### Output

```text
> nethack-electron-poc@0.1.0 test:corpse-overlay
> node scripts/corpse-overlay-rendering-test.js

PASS corpse-overlay-rendering-test
```

### What this test asserts

File: `electron-poc/scripts/corpse-overlay-rendering-test.js`

Key assertions:

```js
const corpse = model({ ch: '%', glyph: 900, semanticKind: 'corpse', semanticName: 'jackal' });
assert.equal(corpse.assetId, 'jackal', 'corpse should keep the monster-specific asset so it remains recognizable');
assert.ok(corpse.classes.includes('corpse-tile'), 'corpse cell gets corpse marker class');
assert.ok(corpse.classes.includes('corpse-overlay'), 'corpse cell gets red-X overlay class');
assert.match(corpse.ariaLabel, /jackal corpse/i, 'corpse aria label identifies corpse, not a live monster');

const liveMonster = model({ ch: 'd', glyph: 1, semanticKind: 'monster', semanticName: 'jackal' });
assert.equal(liveMonster.assetId, 'jackal', 'live monster uses same recognizable monster asset');
assert.ok(!liveMonster.classes.includes('corpse-overlay'), 'live monster must not get corpse red-X overlay');
assert.doesNotMatch(liveMonster.ariaLabel || '', /corpse/i, 'live monster label must not say corpse');

const objectCorpseNameOnly = model({ ch: '%', glyph: 901, semanticKind: 'object', semanticName: 'jackal corpse' });
assert.ok(!objectCorpseNameOnly.classes.includes('corpse-overlay'), 'semanticName text alone is not enough; overlay relies on semantic corpse kind');

const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
assert.match(css, /\.tile-cell\.corpse-overlay::after/, 'CSS defines corpse overlay pseudo-element');
assert.match(css, /linear-gradient\(45deg[^;]+rgba\(239,\s*68,\s*68/, 'CSS paints one red diagonal of the X');
assert.match(css, /linear-gradient\(-45deg[^;]+rgba\(239,\s*68,\s*68/, 'CSS paints the other red diagonal of the X');
```

## Real Electron / MCP evidence

Existing real-game validation evidence was found in:

- Summary: `/home/horvay/work/nethack/electron-poc/test-output/real-corpse-overlay-mcp/real-corpse-overlay-mcp-summary.md`
- Startup screenshot: `/home/horvay/work/nethack/electron-poc/test-output/real-corpse-overlay-mcp/01-live-game-started-before-corpse-assertion.png`
- Main evidence screenshot: `/home/horvay/work/nethack/electron-poc/test-output/real-corpse-overlay-mcp/02-live-game-corpse-red-x-overlay-with-live-monster-negative.png`
- Alternate similarly named screenshot also present: `/home/horvay/work/nethack/electron-poc/test-output/real-corpse-overlay-mcp/02-real-game-corpse-red-x-overlay-live-monster-negative.png`
- Logs/data:
  - `/home/horvay/work/nethack/electron-poc/test-output/real-corpse-overlay-mcp/electron.log`
  - `/home/horvay/work/nethack/electron-poc/test-output/real-corpse-overlay-mcp/startup-debug-state.json`

### Summary checks from real MCP/CDP validation

From `electron-poc/test-output/real-corpse-overlay-mcp/real-corpse-overlay-mcp-summary.md`:

```text
## Checks
- PASS realElectronLaunched
- PASS liveShimStartupReachedMapEvents
- PASS liveGameCorpsePresent
- PASS liveGameCorpseHasOverlay
- PASS liveMonsterPresentForNegativeCase
- PASS liveMonsterNoOverlay
- PASS noRendererStagedCellsUsed
- PASS noUnexpectedDialogs
```

### Live map cell evidence from real MCP/CDP validation

From the same summary:

```json
{
  "corpseCells": [
    {
      "x": 55,
      "y": 4,
      "className": "tile-cell terrain-floor touch-wall-s has-tile has-base-tile tile-overlay corpse-tile corpse-overlay adjacent-move-target",
      "tileId": "jackal",
      "semanticKind": "corpse",
      "semanticName": "jackal",
      "aria": "jackal corpse over dungeon floor"
    }
  ],
  "overlaidCorpses": [
    {
      "x": 55,
      "y": 4,
      "className": "tile-cell terrain-floor touch-wall-s has-tile has-base-tile tile-overlay corpse-tile corpse-overlay adjacent-move-target",
      "tileId": "jackal",
      "semanticKind": "corpse",
      "semanticName": "jackal",
      "aria": "jackal corpse over dungeon floor"
    }
  ],
  "liveMonsters": [
    {
      "x": 54,
      "y": 3,
      "className": "tile-cell terrain-floor touch-wall-n touch-wall-w has-tile has-base-tile tile-overlay adjacent-move-target",
      "tileId": "little-dog",
      "semanticKind": "pet",
      "semanticName": "little dog",
      "aria": "little dog over dungeon floor"
    },
    {
      "x": 53,
      "y": 4,
      "className": "tile-cell terrain-floor touch-wall-n touch-wall-s has-tile has-base-tile tile-overlay adjacent-move-target",
      "tileId": "jackal",
      "semanticKind": "monster",
      "semanticName": "jackal",
      "aria": "jackal over dungeon floor"
    },
    {
      "x": 54,
      "y": 4,
      "className": "tile-cell terrain-floor touch-wall-s has-tile has-base-tile tile-overlay cursor",
      "tileId": "hero-avatar",
      "semanticKind": "monster",
      "semanticName": "valkyrie",
      "aria": "valkyrie over dungeon floor"
    }
  ],
  "liveMonsterWithOverlay": []
}
```

Interpretation: the live fixture produced exactly one corpse cell, and it had `corpse-overlay`. Live pet/monster/player-adjacent cells did not have `corpse-overlay`.

### Real-game setup from validation summary

```text
- The Electron process was started with `NH_SHIM_TEST_CORPSE_OVERLAY_SCENE=1` and `NETHACK_SEED=424242`.
- The fixture is injected in NetHack game initialization, not through renderer DOM hooks: it places a real jackal corpse object and a live jackal monster near the player before `docrt()`, so the screenshot is produced from live shim `shim_print_glyph` map events.
```

## Screenshot evidence and visual QA notes

### Corpse overlay screenshot

Path:

- `/home/horvay/work/nethack/electron-poc/test-output/real-corpse-overlay-mcp/02-live-game-corpse-red-x-overlay-with-live-monster-negative.png`

Description:

- Real Electron gameplay screenshot produced from shim/game map events.
- It contains a jackal corpse cell with map classes including `corpse-tile corpse-overlay`.
- It also contains nearby live monster/pet cells used as a negative case; those cells lack `corpse-overlay`.
- The summary confirms no unexpected dialogs were open.

User-facing QA interpretation:

- The corpse overlay is a player-facing map/tile indication, not a placeholder label.
- The live-monster negative case is important: it demonstrates the X does not indiscriminately appear on all jackal/little-dog/monster tiles.
- The overlay is tied to the semantic corpse event and rendered on the map tile itself.

### Equipment/inventory screenshots inspected as related evidence

Representative related screenshots present in the project output tree:

- `/home/horvay/work/nethack/electron-poc/test-output/equipment-screen-rpg/01-rpg-equipment-screen.png`
- `/home/horvay/work/nethack/electron-poc/test-output/equipment-screen-rpg/03-injected-rich-rpg-equipment-screen.png`
- `/home/horvay/work/nethack/electron-poc/test-output/real-equipment-screen-mcp/02-real-key-i-equipment-screen.png`
- `/home/horvay/work/nethack/electron-poc/test-output/real-equipment-screen-mcp/04-real-button-equipment-screen.png`

These screenshots/test outputs document the RPG equipment and inventory screen, including body slots and item rows. The code and CSS behind those screens show regular slot cards, item names, badges, action pills, and drag/drop states. No corpse-style X overlay or neck/amulet X marker is implemented in that UI.

## Package scripts found

File: `electron-poc/package.json`

Relevant scripts:

```json
"test:corpse-overlay": "node scripts/corpse-overlay-rendering-test.js",
"test:real-corpse-overlay-mcp": "node scripts/real-corpse-overlay-mcp-test.js"
```

## Final conclusion

The requested X overlay feature is **partially present**:

1. **Present:** map/tile corpse X overlay.
   - Implemented in `electron-poc/src/shared/map-presentation.js` and `electron-poc/src/styles.css`.
   - Rendered through `electron-poc/src/renderer.js` via `cellViewModel` classes.
   - Tested by `electron-poc/scripts/corpse-overlay-rendering-test.js`.
   - Real Electron/MCP evidence exists in `electron-poc/test-output/real-corpse-overlay-mcp/`.

2. **Absent:** inventory/equipment/neck X overlay.
   - The amulet/neck slot exists in the RPG equipment model and is positioned in CSS.
   - Inventory rows and equipment slots render semantic text/actions, but no X/cross overlay marker is applied.
   - Grep did not find any `x-overlay`, equipment/amulet `corpse-overlay`, neck overlay, or equivalent inventory/equipment cross marker.

No code changes were made as part of this re-created report; this is an investigation/evidence report only.
