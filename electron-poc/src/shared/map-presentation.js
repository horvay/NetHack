(function initMapPresentation(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tile-assets'));
  else root.NetHackMapPresentation = factory(root.NetHackTileAssets);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(TileAssets) {
  const version = 'nethack-map-presentation/v1';
  const cssTerrainGlyphs = new Set([' ', '.', '#', '|', '-', '+', '/']);
  const roomLikeGlyphs = new Set(['.', '@', ')', '%', '[', ']', '(', '?', '!', '$', '*', '=', '"', '`', '_', '{', '<', '>', '^']);
  const wallGlyphs = new Set(['|', '-']);
  const wallAssetIds = new Set(['vertical-wall', 'horizontal-wall', 'wall', 'wall-corner', 'wall-tee-junction', 'generic-wall-fallback']);
  const doorGlyphs = new Set(['+', '/']);
  const legacyCssFloorAssetIds = new Set(['room-floor', 'dark-room-floor', 'lit-corridor', 'dark-corridor', 'unexplored-stone', 'solid-rock', 'stone', 'floor', 'corridor']);
  const legacyCssDungeonAssetIds = new Set([
    ...legacyCssFloorAssetIds,
    'vertical-wall', 'horizontal-wall', 'wall', 'wall-corner', 'wall-tee-junction', 'generic-wall-fallback',
    'closed-door', 'open-vertical-door', 'open-horizontal-door', 'broken-door', 'no-door-doorway',
  ]);
  const basicDungeonAssetIds = new Set(legacyCssDungeonAssetIds);
  const basicDungeonGlyphs = new Set([' ', '.', '#', '|', '-', '+', '/']);
  const meaningfulFeatureGlyphs = new Set(['+', '/', '<', '>', '_', '{', '}', '\\', '^', '`']);
  const meaningfulSemanticKinds = new Set(['monster', 'pet', 'player', 'hero', 'corpse', 'statue', 'object', 'item', 'trap', 'stairs', 'door', 'feature', 'engraving']);
  const actorSemanticKinds = new Set(['monster', 'pet', 'player', 'hero']);
  const objectSemanticKinds = new Set(['object', 'item']);
  const layeredTooltipForegroundKinds = new Set(['monster', 'pet', 'player', 'hero', 'corpse', 'statue', 'object', 'item', 'trap', 'stairs', 'feature', 'engraving']);
  const basicSemanticNames = new Set(['floor', 'room floor', 'wall', 'vertical wall', 'horizontal wall', 'corridor', 'stone', 'rock', 'unexplored stone', 'darkness']);
  function humanizeId(value) { return String(value || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function titleCase(value) { return humanizeId(value).replace(/\b\w/g, (letter) => letter.toUpperCase()); }
  function exactObjectTitle(value) {
    const text = humanizeId(value).replace(/^(?:an?|the)\s+/i, '').trim();
    return text ? `${text[0].toUpperCase()}${text.slice(1)}` : '';
  }
  function displayNameForAsset(assetId, fallback) {
    if (assetId === 'no-door-doorway' && /^no door(?: doorway)?$/i.test(String(fallback || '').trim())) return 'empty doorway';
    return fallback;
  }
  function categoryLabelForTile(tile, semanticKind) {
    const kind = String(semanticKind || '').toLowerCase();
    if (tile?.categorySlug === 'full-source-objects' && (kind === 'object' || kind === 'item')) return 'Objects and inventory items';
    return tile?.category;
  }
  function doorTerrainClassForAsset(assetId) {
    if (assetId === 'open-horizontal-door') return 'terrain-door terrain-door-open terrain-door-open-horizontal';
    if (assetId === 'open-vertical-door') return 'terrain-door terrain-door-open terrain-door-open-vertical';
    if (assetId === 'closed-door') return 'terrain-door terrain-door-closed';
    if (assetId === 'broken-door') return 'terrain-door terrain-door-broken';
    if (assetId === 'no-door-doorway') return 'terrain-door terrain-doorway';
    return '';
  }
  function terrainClassForCell(cell, assetId) {
    const ch = TileAssets.normalizeCell(cell).ch;
    const doorClass = doorTerrainClassForAsset(assetId);
    if (doorClass) return doorClass;
    if (ch === ' ') return 'terrain-rock';
    if (ch === '.') return 'terrain-floor';
    if (ch === '#') return 'terrain-corridor';
    if (ch === '|') return 'terrain-wall terrain-wall-v';
    if (ch === '-') return 'terrain-wall terrain-wall-h';
    if (ch === '+') return 'terrain-door terrain-door-closed';
    if (ch === '/') return 'terrain-door terrain-door-open terrain-door-open-vertical';
    return '';
  }
  function shouldUseCssTerrain(ch, tile) {
    return cssTerrainGlyphs.has(ch) && (!tile || legacyCssDungeonAssetIds.has(tile.id));
  }
  function shouldForceFloorUnderGlyph(ch, tile) { return roomLikeGlyphs.has(ch) || (ch && !cssTerrainGlyphs.has(ch)) || TileAssets.isOverlayTile(tile); }
  function cellAt(cells, x, y) {
    if (x < 0 || y < 0 || y >= cells.length || x >= (cells[y]?.length || 0)) return null;
    return TileAssets.normalizeCell(cells[y][x]);
  }
  function glyphAt(cells, x, y) {
    return cellAt(cells, x, y)?.ch || ' ';
  }
  function isWallLikeCell(cells, x, y) {
    const normalized = cellAt(cells, x, y);
    if (!normalized) return false;
    const assetId = TileAssets.mappedAssetIdForCell(normalized);
    if (wallAssetIds.has(assetId)) return true;
    if (assetId && /door/i.test(assetId)) return false;
    const semantic = `${normalized.semanticKind || ''} ${normalized.semanticName || ''}`;
    if (/door/i.test(semantic)) return false;
    return wallGlyphs.has(normalized.ch);
  }
  function contextualTerrainClasses(cell, x, y, assetId, cells = []) {
    const normalized = TileAssets.normalizeCell(cell);
    const classes = [];
    const terrainClass = terrainClassForCell(normalized, assetId);
    if (terrainClass) classes.push(...terrainClass.split(' '));
    if (isWallLikeCell(cells, x, y - 1)) classes.push('touch-wall-n');
    if (isWallLikeCell(cells, x + 1, y)) classes.push('touch-wall-e');
    if (isWallLikeCell(cells, x, y + 1)) classes.push('touch-wall-s');
    if (isWallLikeCell(cells, x - 1, y)) classes.push('touch-wall-w');
    if (doorGlyphs.has(normalized.ch) || doorTerrainClassForAsset(assetId)) {
      if (assetId === 'open-horizontal-door') classes.push('door-in-horizontal-wall');
      else if (assetId === 'open-vertical-door') classes.push('door-in-vertical-wall');
      else {
        if (isWallLikeCell(cells, x - 1, y) || isWallLikeCell(cells, x + 1, y)) classes.push('door-in-horizontal-wall');
        if (isWallLikeCell(cells, x, y - 1) || isWallLikeCell(cells, x, y + 1)) classes.push('door-in-vertical-wall');
      }
    }
    return classes;
  }
  function tileForCell(cell, context = {}) {
    const assetId = TileAssets.mappedAssetIdForCell(cell, context);
    return { assetId, tile: assetId ? context.tileAssetsById?.get(assetId) : undefined };
  }
  function semanticKindOf(cell) { return String(TileAssets.normalizeCell(cell).semanticKind || '').toLowerCase(); }
  function isActorCell(cell) {
    const normalized = TileAssets.normalizeCell(cell);
    return normalized.ch === '@' || actorSemanticKinds.has(semanticKindOf(normalized));
  }
  function isObjectCell(cell) { return objectSemanticKinds.has(semanticKindOf(cell)); }
  function isTameAllyCell(cell) {
    const normalized = TileAssets.normalizeCell(cell);
    if (semanticKindOf(normalized) === 'pet') return true;
    const affordances = new Set(normalized.actionAffordances.map((value) => String(value || '').toLowerCase()));
    return affordances.has('monster.attitude.tame') || affordances.has('monster.pet');
  }
  function terrainGlyphForSemantic(kind, name) {
    const hay = `${kind || ''} ${name || ''}`.toLowerCase();
    if (/corridor/.test(hay)) return '#';
    if (/wall|rock|stone|unexplored/.test(hay)) return ' ';
    if (/door/.test(hay)) return /open/.test(hay) ? '/' : '+';
    if (/water|pool|moat/.test(hay)) return '}';
    if (/lava/.test(hay)) return '}';
    if (/stair|ladder/.test(hay)) return /down/.test(hay) ? '>' : '<';
    if (/trap/.test(hay)) return '^';
    return '.';
  }
  function backgroundTerrainCellForCell(cell) {
    const normalized = TileAssets.normalizeCell(cell);
    const kind = normalized.backgroundSemanticKind;
    const name = normalized.backgroundSemanticName;
    if (/^(?:unexplored|nothing|unknown)$/i.test(String(kind || ''))) return { ch: '.', semanticKind: 'floor', semanticName: 'floor of a room' };
    if (normalized.backgroundGlyph != null && Number(normalized.backgroundGlyph) >= 0) {
      return { ch: terrainGlyphForSemantic(kind, name), glyph: normalized.backgroundGlyph, semanticKind: kind || 'floor', semanticName: name || 'floor of a room', featureDescription: normalized.featureDescription, engravingText: normalized.engravingText };
    }
    if (kind || name) return { ch: terrainGlyphForSemantic(kind, name), semanticKind: kind || 'floor', semanticName: name || 'floor of a room', featureDescription: normalized.featureDescription, engravingText: normalized.engravingText };
    return { ch: '.', semanticKind: 'floor', semanticName: 'floor of a room' };
  }
  function objectLayerCharForCell(cell) {
    const normalized = TileAssets.normalizeCell(cell);
    if (typeof normalized.objectLayerChar === 'string' && normalized.objectLayerChar.length) return normalized.objectLayerChar[0];
    const code = Number(normalized.objectLayerChar);
    if (Number.isInteger(code) && code > 0 && code < 128) return String.fromCharCode(code);
    return ')';
  }
  function objectLayerCellForCell(cell) {
    const normalized = TileAssets.normalizeCell(cell);
    if (normalized.objectLayerGlyph == null && normalized.objectLayerChar == null && !normalized.objectLayerSemanticName && !normalized.objectLayerSemanticAppearance && !normalized.objectLayerSemanticKind) return null;
    return {
      ch: objectLayerCharForCell(normalized),
      glyph: normalized.objectLayerGlyph,
      objectId: normalized.objectLayerObjectId,
      displayName: normalized.objectLayerDisplayName,
      semanticKind: normalized.objectLayerSemanticKind || 'object',
      semanticName: normalized.objectLayerSemanticName || 'object',
      semanticAppearance: normalized.objectLayerSemanticAppearance,
      semanticKnown: normalized.objectLayerSemanticKnown,
      actionAffordances: Array.isArray(normalized.objectLayerActionAffordances) ? normalized.objectLayerActionAffordances.slice() : [],
    };
  }
  function layerLabel(cell, tile) {
    const normalized = TileAssets.normalizeCell(cell);
    const displayName = TileAssets.publicDisplayNameForCell ? TileAssets.publicDisplayNameForCell(normalized) : (normalized.semanticKnown === false && normalized.semanticAppearance ? normalized.semanticAppearance : normalized.semanticName);
    return humanizeId(displayName || tile?.name || tile?.id || normalized.ch || '').trim();
  }
  function isCorpseCell(cell) {
    return String(TileAssets.normalizeCell(cell).semanticKind || '').toLowerCase() === 'corpse';
  }
  function isStatueCell(cell) {
    return String(TileAssets.normalizeCell(cell).semanticKind || '').toLowerCase() === 'statue';
  }
  function corpseLabel(name) {
    const base = humanizeId(name || '').trim();
    if (!base) return 'corpse';
    return /\bcorpse\b/i.test(base) ? base : `${base} corpse`;
  }
  function statueLabel(name) {
    const base = humanizeId(name || '').trim();
    if (!base) return 'statue';
    return /\bstatue\b/i.test(base) ? base : `${base} statue`;
  }
  function cellViewModel(cell, x, y, context = {}) {
    const normalized = TileAssets.normalizeCell(cell);
    const ch = normalized.ch;
    const cells = context.cells || [];
    const objectLayerCell = objectLayerCellForCell(normalized);
    const actorOverObject = isActorCell(normalized) && objectLayerCell;
    const presentationBaseCell = actorOverObject ? backgroundTerrainCellForCell(normalized) : normalized;
    const { assetId, tile } = tileForCell(normalized, context);
    const { assetId: baseAssetId, tile: baseTile } = actorOverObject ? tileForCell(presentationBaseCell, context) : { assetId, tile };
    const useCssTerrain = shouldUseCssTerrain(presentationBaseCell.ch, actorOverObject ? baseTile : tile);
    const classes = ['tile-cell'];
    const tameAlly = isTameAllyCell(normalized);
    if (useCssTerrain || actorOverObject) classes.push(...contextualTerrainClasses(presentationBaseCell, x, y, actorOverObject ? baseAssetId : assetId, cells));
    if (!useCssTerrain && shouldForceFloorUnderGlyph(ch, tile)) classes.push('terrain-floor');
    const baseTileId = tile ? TileAssets.baseTileIdForCell(normalized, tile) : undefined;
    let ariaLabel = '';
    let backgroundImage = '';
    let tileImage = '';
    let objectTileImage = '';
    let objectLayerAssetId = '';
    let objectLayerFallbackGlyph = '';
    let baseDatasetId = baseTileId;
    let layers = [];
    const corpse = isCorpseCell(normalized);
    const statue = isStatueCell(normalized);
    if (actorOverObject) {
      classes.push('has-tile', 'tile-layered', 'actor-over-object');
      const baseTileForLayer = baseAssetId && !legacyCssFloorAssetIds.has(baseAssetId) ? baseTile : undefined;
      baseDatasetId = baseTileForLayer?.id || 'css-terrain-floor';
      if (baseTileForLayer) backgroundImage = TileAssets.tileUrl(baseTileForLayer);
      const objectLayer = tileForCell(objectLayerCell, context);
      objectLayerAssetId = objectLayer.assetId || '';
      objectTileImage = objectLayer.tile ? TileAssets.tileUrl(objectLayer.tile) : '';
      objectLayerFallbackGlyph = objectTileImage ? '' : (objectLayerCell.ch || ')');
      tileImage = tile ? TileAssets.tileUrl(tile) : '';
      const actorName = layerLabel(normalized, tile) || 'actor';
      const objectName = layerLabel(objectLayerCell, objectLayer.tile) || 'object';
      const terrainName = layerLabel(presentationBaseCell, baseTile) || 'dungeon floor';
      ariaLabel = `${actorName} over ${objectName} on ${terrainName}`;
      layers = [
        { role: 'object', assetId: objectLayerAssetId, image: objectTileImage, fallbackGlyph: objectLayerFallbackGlyph, label: objectName },
        { role: 'actor', assetId: assetId || '', image: tileImage, fallbackGlyph: tileImage ? '' : (ch || '@'), label: actorName },
      ];
    } else if (tile && !useCssTerrain) {
      classes.push('has-tile');
      const baseTile = baseTileId && !legacyCssFloorAssetIds.has(baseTileId) ? context.tileAssetsById?.get(baseTileId) : undefined;
      const displayLabel = displayNameForAsset(assetId, layerLabel(normalized, tile) || tile.name || titleCase(tile.id));
      if (statue || TileAssets.isOverlayTile(tile)) {
        classes.push('has-base-tile', 'tile-overlay');
        baseDatasetId = baseTile?.id || 'css-terrain-floor';
        if (baseTile) backgroundImage = TileAssets.tileUrl(baseTile);
        tileImage = TileAssets.tileUrl(tile);
        ariaLabel = statue
          ? `${statueLabel(displayLabel)} over dungeon floor`
          : corpse ? `${corpseLabel(displayLabel)} over dungeon floor` : `${displayLabel} over dungeon floor`;
      } else {
        backgroundImage = TileAssets.tileUrl(tile);
        ariaLabel = corpse ? corpseLabel(displayLabel) : displayLabel;
      }
    } else if (tile && useCssTerrain) {
      const displayLabel = displayNameForAsset(assetId, normalized.semanticName || tile.name || titleCase(tile.id));
      ariaLabel = statue ? statueLabel(displayLabel) : corpse ? corpseLabel(displayLabel) : displayLabel;
    }
    if (corpse) classes.push('corpse-tile', 'corpse-overlay');
    if (statue) classes.push('statue-tile', 'statue-overlay');
    const fallbackGlyph = !tile && ch !== ' ' && !cssTerrainGlyphs.has(ch) ? ch : '';
    if (fallbackGlyph && !actorOverObject) { classes.push('fallback-glyph'); ariaLabel = `NetHack glyph ${ch}`; }
    if (tameAlly) {
      classes.push('tame-ally');
      ariaLabel = ariaLabel ? `${ariaLabel}, tame ally` : 'Tame ally';
    }
    if (context.cursor?.window === context.mapWindowId && context.cursor?.x === x && context.cursor?.y === y) classes.push('cursor');
    return { x, y, cell: normalized, glyph: ch, assetId, tile, baseTileId: baseDatasetId, objectLayerAssetId, objectTileImage, objectLayerFallbackGlyph, layers, layerOrder: actorOverObject ? ['terrain', 'object', 'actor'] : (isObjectCell(normalized) ? ['terrain', 'object'] : ['terrain']), classes, tameAlly, useCssTerrain, ariaLabel, backgroundImage, tileImage, fallbackGlyph: actorOverObject ? '' : fallbackGlyph };
  }
  function tooltipInfoForCell(cell, x, y, context = {}) {
    const normalized = TileAssets.normalizeCell(cell);
    const ch = normalized.ch || ' ';
    const { assetId, tile } = tileForCell(normalized, context);
    const semanticName = humanizeId(normalized.semanticName || '');
    const semanticAppearance = humanizeId(normalized.semanticAppearance || '');
    const normalizedSemanticKind = String(normalized.semanticKind || '').toLowerCase();
    const rawSemanticKind = (normalizedSemanticKind === 'player' || normalizedSemanticKind === 'hero' || (!normalizedSemanticKind && TileAssets.isPlayerCell(normalized))) ? 'hero' : normalized.semanticKind;
    const semanticKind = humanizeId(rawSemanticKind || '');
    const featureDescription = humanizeId(normalized.featureDescription || '');
    const engravingText = String(normalized.engravingText || '').trim();
    const objectLayerCell = objectLayerCellForCell(normalized);
    const meaningfulKind = meaningfulSemanticKinds.has(semanticKind.toLowerCase());
    const meaningfulAsset = assetId === 'no-door-doorway' || assetId === 'engraving';
    const isMeaningfulGlyph = meaningfulFeatureGlyphs.has(ch) || (!basicDungeonGlyphs.has(ch) && ch !== '');
    if (basicDungeonGlyphs.has(ch) && !meaningfulKind && !meaningfulFeatureGlyphs.has(ch) && !objectLayerCell && !meaningfulAsset) return null;
    const hasMeaningfulSemanticName = Boolean(semanticName && !basicSemanticNames.has(semanticName.toLowerCase()) && (meaningfulKind || isMeaningfulGlyph));
    if (!assetId && !hasMeaningfulSemanticName && !meaningfulKind && !isMeaningfulGlyph && !objectLayerCell && !meaningfulAsset) return null;
    const publicDisplayName = TileAssets.publicDisplayNameForCell ? TileAssets.publicDisplayNameForCell(normalized) : (normalized.semanticKnown === false && semanticAppearance ? semanticAppearance : semanticName);
    const playerRoleDisplayName = TileAssets.isPlayerCell(normalized) && /^(?:hero|player)?$/i.test(String(publicDisplayName || '').trim())
      ? humanizeId(TileAssets.normalizedPlayerParts?.(context.playerCharacter || {})?.role || context.playerCharacter?.role || '')
      : '';
    const exactDisplayName = String(normalized.displayName || '').trim();
    const displayName = humanizeId(playerRoleDisplayName || publicDisplayName || '');
    const featureTitle = featureDescription && !/^(?:hero|player|monster|pet|object|item|corpse|statue)$/i.test(semanticKind) ? featureDescription : '';
    const rawTitle = exactDisplayName
      ? exactObjectTitle(exactDisplayName)
      : displayNameForAsset(assetId, featureTitle || displayName || tile?.name || (assetId ? titleCase(assetId) : `Glyph ${ch}`));
    const useCssTerrain = shouldUseCssTerrain(ch, tile);
    const terrainClasses = useCssTerrain ? contextualTerrainClasses(normalized, x, y, assetId, context.cells || []) : [];
    const corpse = isCorpseCell(normalized);
    const statue = isStatueCell(normalized);
    const title = exactDisplayName ? rawTitle : (statue ? statueLabel(rawTitle) : (corpse ? corpseLabel(rawTitle) : rawTitle));
    const contents = [];
    const contentKeys = new Set();
    const addContent = (label, kind, layer, contentAssetId = '', preserveLabel = false) => {
      const normalizedLabel = preserveLabel ? String(label || '').trim() : titleCase(humanizeId(label || '')).trim();
      const normalizedKind = titleCase(humanizeId(kind || 'feature')).trim();
      const key = `${normalizedLabel.toLowerCase()}:${normalizedKind.toLowerCase()}`;
      if (!normalizedLabel || contentKeys.has(key)) return;
      contentKeys.add(key);
      contents.push({ label: normalizedLabel, kind: normalizedKind, layer, assetId: contentAssetId || '' });
    };
    addContent(title, semanticKind || 'feature', 'foreground', assetId, Boolean(exactDisplayName));
    const details = [];
    const kindLower = semanticKind.toLowerCase();
    const titleLower = title.toLowerCase();
    if (semanticKind && kindLower !== titleLower && !titleLower.includes(kindLower)) details.push(titleCase(semanticKind));
    if (engravingText) details.push(`Inscription: “${engravingText}”`);
    if (objectLayerCell) {
      const objectLayer = tileForCell(objectLayerCell, context);
      const objectName = objectLayerCell.displayName ? exactObjectTitle(objectLayerCell.displayName) : (layerLabel(objectLayerCell, objectLayer.tile) || 'object');
      addContent(objectName, objectLayerCell.semanticKind || 'object', 'object', objectLayer.assetId, Boolean(objectLayerCell.displayName));
    }
    if (layeredTooltipForegroundKinds.has(kindLower) || objectLayerCell) {
      const backgroundCell = backgroundTerrainCellForCell(normalized);
      const backgroundLayer = tileForCell(backgroundCell, context);
      addContent(backgroundCell.featureDescription || layerLabel(backgroundCell, backgroundLayer.tile) || 'floor of a room', backgroundCell.semanticKind || 'terrain', 'terrain', backgroundLayer.assetId);
    }
    return { title: exactDisplayName ? title : titleCase(title), description: details.join(' · '), contents, tile, assetId, glyph: ch, isCorpse: corpse, isStatue: statue, useCssTerrain, terrainClasses };
  }
  function diagnosticTooltipInfoForCell(cell, x, y, context = {}) {
    const player = tooltipInfoForCell(cell, x, y, context);
    if (!player) return null;
    const normalized = TileAssets.normalizeCell(cell);
    const semanticKind = String(normalized.semanticKind || '');
    const category = categoryLabelForTile(player.tile, semanticKind);
    const details = [];
    if (category) details.push(category);
    if (normalized.glyph != null && Number.isFinite(Number(normalized.glyph))) details.push(`glyph ${normalized.glyph}`);
    details.push(`map ${x},${y}`);
    return Object.freeze({ ...player, diagnosticDescription: details.join(' · '), coordinates: Object.freeze({ x, y }) });
  }
  return Object.freeze({ version, cssTerrainGlyphs: Object.freeze(Array.from(cssTerrainGlyphs)), legacyCssFloorAssetIds: Object.freeze(Array.from(legacyCssFloorAssetIds)), legacyCssDungeonAssetIds: Object.freeze(Array.from(legacyCssDungeonAssetIds)), wallGlyphs: Object.freeze(Array.from(wallGlyphs)), doorGlyphs: Object.freeze(Array.from(doorGlyphs)), humanizeId, titleCase, displayNameForAsset, categoryLabelForTile, doorTerrainClassForAsset, terrainClassForCell, contextualTerrainClasses, shouldUseCssTerrain, shouldForceFloorUnderGlyph, glyphAt, isCorpseCell, isStatueCell, cellViewModel, playerTooltipInfoForCell: tooltipInfoForCell, tooltipInfoForCell, diagnosticTooltipInfoForCell });
}));
