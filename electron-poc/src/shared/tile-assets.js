(function initTileAssets(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackTileAssets = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const defaultTileMapConfig = Object.freeze({
    defaults: { blank: 'unexplored-stone', floor: 'room-floor', rock: 'unexplored-stone', actorBase: 'room-floor' },
    char: {
      '.': 'room-floor', '|': 'vertical-wall', '-': 'horizontal-wall', '+': 'closed-door', '#': 'lit-corridor',
      '<': 'up-stairs', '>': 'down-stairs', '@': 'hero-avatar', '_': 'altar', '{': 'fountain', '}': 'moat-water', '\\': 'throne', '^': 'arrow-trap',
      '`': 'boulder', '/': 'open-vertical-door', f: 'kitten-pet', d: 'little-dog-pet', ')': 'weapon-class-icon', '%': 'food-ration',
    },
    glyphNumber: {
      44: 'dwarf', 427: 'dwarf', 725: 'hero-avatar', 798: 'kitten-pet', 3873: 'open-vertical-door', 3930: 'vertical-wall', 3931: 'horizontal-wall',
      3932: 'horizontal-wall', 3933: 'horizontal-wall', 3934: 'horizontal-wall', 3935: 'horizontal-wall', 3985: 'no-door-doorway',
      3986: 'open-vertical-door', 3987: 'open-horizontal-door', 3988: 'closed-door', 3989: 'closed-door', 3990: 'iron-bars', 3992: 'room-floor', 3994: 'engraving', 3997: 'engraving', 4013: 'sink', 4014: 'fountain',
    },
  });
  const semanticAssetAliases = new Map([
    ['arrow trap', 'arrow-trap'], ['engraving in a room', 'engraving'], ['engraving in a corridor', 'engraving'], ['engraving', 'engraving'], ['food', 'food-ration'], ['gold piece', 'coin-pile'], ['gold pieces', 'coin-pile'],
    ['crude ring mail', 'orcish-ring-mail'], ['crude dagger', 'orcish-dagger'],
  ]);
  const petAssetAliases = new Map([
    ['little dog', 'little-dog-pet'], ['dog', 'dog'], ['large dog', 'large-dog'],
    ['kitten', 'kitten-pet'], ['pony', 'pony-pet'],
  ]);
  const spellbookAppearanceSlugs = new Set([
    'parchment', 'vellum', 'ragged', 'dog-eared', 'mottled', 'stained', 'cloth', 'leathery', 'white', 'pink', 'red', 'orange',
    'yellow', 'velvet', 'light-green', 'dark-green', 'turquoise', 'cyan', 'light-blue', 'dark-blue', 'indigo', 'magenta',
    'purple', 'violet', 'tan', 'plaid', 'light-brown', 'dark-brown', 'gray', 'wrinkled', 'dusty', 'bronze', 'copper',
    'silver', 'gold', 'glittering', 'shining', 'dull', 'thin', 'thick', 'checkered', 'plain', 'paperback', 'papyrus',
  ]);
  const roleCodes = Object.freeze({ Arc: 'archeologist', Bar: 'barbarian', Cav: 'caveman', Hea: 'healer', Kni: 'knight', Mon: 'monk', Pri: 'priest', Ran: 'ranger', Rog: 'rogue', Sam: 'samurai', Tou: 'tourist', Val: 'valkyrie', Wiz: 'wizard' });
  const raceCodes = Object.freeze({ Hum: 'human', Dwa: 'dwarf', Elf: 'elf', Gno: 'gnome', Orc: 'orc' });
  const genderCodes = Object.freeze({ Mal: 'male', Fem: 'female' });
  function slugifySemanticName(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function normalizeComboPart(value, codes) {
    const raw = String(value || '').trim();
    return codes[raw] || slugifySemanticName(raw);
  }
  function normalizedPlayerParts(character = {}) {
    return {
      role: normalizeComboPart(character.role, roleCodes),
      race: normalizeComboPart(character.race, raceCodes),
      gender: normalizeComboPart(character.gender, genderCodes),
    };
  }
  function playerComboAvatarAssetId(character = {}, tileAssetsById = new Map()) {
    const { role, race, gender } = normalizedPlayerParts(character);
    if (!role || !race || !gender) return undefined;
    const comboId = `${race}-${role}-${gender}-avatar`;
    return tileAssetsById?.has?.(comboId) ? comboId : undefined;
  }
  function playerRoleAvatarAssetId(character = {}, tileAssetsById = new Map()) {
    const { role, gender } = normalizedPlayerParts(character);
    if (!role) return undefined;
    const candidates = [];
    if (role === 'caveman' && gender === 'female') candidates.push('cavewoman-role-avatar');
    if (role === 'priest' && gender === 'female') candidates.push('priestess-role-avatar');
    candidates.push(`${role}-role-avatar`);
    return candidates.find((id) => tileAssetsById?.has?.(id));
  }
  const playerRoleNameAliases = Object.freeze({
    arc: 'archeologist', archeologist: 'archeologist', archaeologist: 'archeologist',
    bar: 'barbarian', barbarian: 'barbarian',
    cav: 'caveman', caveman: 'caveman', cavewoman: 'cavewoman',
    hea: 'healer', healer: 'healer',
    kni: 'knight', knight: 'knight',
    mon: 'monk', monk: 'monk',
    pri: 'priest', priest: 'priest', priestess: 'priestess',
    ran: 'ranger', ranger: 'ranger',
    rog: 'rogue', rogue: 'rogue',
    sam: 'samurai', samurai: 'samurai',
    tou: 'tourist', tourist: 'tourist',
    val: 'valkyrie', valkyrie: 'valkyrie',
    wiz: 'wizard', wizard: 'wizard',
  });
  function playerSemanticAvatarAssetId(cell = {}, tileAssetsById = new Map()) {
    const normalized = normalizeCell(cell);
    if (!isPlayerCell(normalized)) return undefined;
    const slug = slugifySemanticName(normalized.semanticName);
    if (!slug || /^(?:hero|player)$/.test(slug)) return undefined;
    const roleSlug = playerRoleNameAliases[slug] || slug;
    const candidates = [];
    if (roleSlug === 'cavewoman') candidates.push('cavewoman-role-avatar', 'caveman-role-avatar');
    else if (roleSlug === 'priestess') candidates.push('priestess-role-avatar', 'priest-role-avatar');
    else candidates.push(`${roleSlug}-role-avatar`);
    return candidates.find((id) => tileAssetsById?.has?.(id));
  }
  function playerExplicitAvatarAssetId(assetId, tileAssetsById = new Map()) {
    const id = String(assetId || '');
    if (!id) return undefined;
    const tile = tileAssetsById?.get?.(id);
    const category = String(tile?.categorySlug || '').toLowerCase();
    if (id === 'hero-avatar' || category === 'player-pets-identity' || category === 'player-combo-avatars') return id;
    return undefined;
  }
  function isPlayerCell(cell) {
    const normalized = normalizeCell(cell);
    if (normalized.actorId === 'hero') return true;
    const semanticKind = String(normalized.semanticKind || '').toLowerCase();
    if (semanticKind) return semanticKind === 'player' || semanticKind === 'hero';
    if (normalized.assetId === 'hero-avatar') return true;
    if (Number(normalized.glyph) === 725) return true;
    const semanticName = String(normalized.semanticName || '').toLowerCase();
    if (semanticName && !/^(?:hero|player)$/.test(semanticName)) return false;
    return normalized.ch === '@' && normalized.glyph == null;
  }
  function normalizeCell(cell) {
    if (typeof cell === 'string') return { ch: cell || ' ', assetId: undefined, glyph: undefined, ttychar: undefined, color: undefined, tileidx: undefined };
    return { ch: cell?.ch || ' ', actorId: cell?.actorId, assetId: cell?.assetId, glyph: cell?.glyph, ttychar: cell?.ttychar, color: cell?.color, tileidx: cell?.tileidx, glyphFlags: cell?.glyphFlags, objectId: cell?.objectId, displayName: cell?.displayName, backgroundGlyph: cell?.backgroundGlyph, backgroundSemanticKind: cell?.backgroundSemanticKind, backgroundSemanticName: cell?.backgroundSemanticName, objectLayerGlyph: cell?.objectLayerGlyph, objectLayerChar: cell?.objectLayerChar, objectLayerObjectId: cell?.objectLayerObjectId, objectLayerDisplayName: cell?.objectLayerDisplayName, objectLayerSemanticKind: cell?.objectLayerSemanticKind, objectLayerSemanticName: cell?.objectLayerSemanticName, objectLayerSemanticAppearance: cell?.objectLayerSemanticAppearance, objectLayerSemanticKnown: cell?.objectLayerSemanticKnown, semanticKind: cell?.semanticKind, semanticName: cell?.semanticName, semanticAppearance: cell?.semanticAppearance, semanticKnown: cell?.semanticKnown, featureDescription: cell?.featureDescription, engravingText: cell?.engravingText, creaturePublic: cell?.creaturePublic && typeof cell.creaturePublic === 'object' ? { ...(cell.creaturePublic.attitude ? { attitude: cell.creaturePublic.attitude } : {}), ...(cell.creaturePublic.size ? { size: cell.creaturePublic.size } : {}), status: Array.isArray(cell.creaturePublic.status) ? cell.creaturePublic.status.slice() : [] } : undefined, cmapIndex: cell?.cmapIndex, actionAffordances: Array.isArray(cell?.actionAffordances) ? cell.actionAffordances.slice() : [], backgroundActionAffordances: Array.isArray(cell?.backgroundActionAffordances) ? cell.backgroundActionAffordances.slice() : [], objectLayerActionAffordances: Array.isArray(cell?.objectLayerActionAffordances) ? cell.objectLayerActionAffordances.slice() : [] };
  }
  function normalizeManifest(manifest) {
    const assets = Array.isArray(manifest?.assets) ? manifest.assets.filter((asset) => asset && typeof asset.id === 'string' && typeof asset.installedPath === 'string') : [];
    return Object.freeze({ ...(manifest || {}), assets });
  }
  function assetsById(manifest) { return new Map(normalizeManifest(manifest).assets.map((asset) => [asset.id, asset])); }
  function kindSpecificSemanticAssetId(semanticKind, semanticSlug, tileAssetsById = new Map()) {
    if (!semanticSlug) return undefined;
    const kind = String(semanticKind || '').toLowerCase();
    const exact = tileAssetsById.get(semanticSlug);
    if (exact) {
      const category = String(exact.categorySlug || '').toLowerCase();
      if ((kind === 'object' || kind === 'item') && /object|inventory/.test(category)) return semanticSlug;
      if (kind === 'monster' && /monster/.test(category)) return semanticSlug;
      if ((kind === 'trap' || kind === 'hazard') && /trap|hazard/.test(category)) return semanticSlug;
      if ((kind === 'terrain' || kind === 'feature') && /terrain/.test(category)) return semanticSlug;
    }
    const objectId = `${semanticSlug}-object`;
    if ((kind === 'object' || kind === 'item') && tileAssetsById.has(objectId)) return objectId;
    const trapId = `${semanticSlug}-trap`;
    if ((kind === 'trap' || kind === 'hazard') && tileAssetsById.has(trapId)) return trapId;
    return undefined;
  }
  function scrollLabelParts(name) {
    const match = String(name || '').toLowerCase().match(/^scroll\s+labeled\s+(.+)$/);
    return match ? { label: match[1], labelSlug: slugifySemanticName(match[1]) } : undefined;
  }
  function isSafeScrollLabelAsset(asset) {
    if (!asset) return false;
    const category = String(asset.categorySlug || '').toLowerCase();
    if (category && !/object|inventory/.test(category)) return false;
    const text = `${asset.id || ''} ${asset.name || ''} ${asset.prompt || ''} ${asset.description || ''}`.toLowerCase();
    // Unidentified scroll labels are public appearances.  Only use a label-specific
    // image if its manifest metadata says it is actually scroll/parchment art;
    // otherwise fail closed to the neutral scroll icon instead of showing a
    // hidden-identity illustration or an unrelated full-source object.
    if (/\b(?:spell\s*book|book\s+leather|tool|gadget|baton|relic|stone|bone|device|talisman|charm|crystal|fish|skull|map\s+bundle|gear|weapon|armor)\b/.test(text)) return false;
    return /\bscroll\b/.test(text) || /\b(?:rolled|curled|unrolled|torn|blank(?:-looking)?)\s+(?:magic\s+)?parchment\b/.test(text) || /\bparchment\s+scroll\b/.test(text);
  }
  function scrollLabelAssetId(name, tileAssetsById = new Map()) {
    const parts = scrollLabelParts(name);
    if (!parts) return undefined;
    const exactAsset = tileAssetsById.get(parts.labelSlug);
    if (isSafeScrollLabelAsset(exactAsset)) return parts.labelSlug;
    return tileAssetsById.has('scroll-class-icon') ? 'scroll-class-icon' : undefined;
  }
  function scrollLabelAppearanceAssetId(name, tileAssetsById = new Map()) {
    return scrollLabelAssetId(name, tileAssetsById);
  }
  const publicAppearanceClassNounsByGlyph = Object.freeze({ '+': 'spellbook', '/': 'wand', '!': 'potion', '=': 'ring', '"': 'amulet', '*': 'gem' });
  const publicClassNamesByGlyph = Object.freeze({ '+': 'spellbook', '/': 'wand', '!': 'potion', '=': 'ring', '"': 'amulet', '*': 'gem', '?': 'scroll', ')': 'weapon', '[': 'armor', '(': 'tool', '$': 'gold', '`': 'boulder', '_': 'iron chain', '0': 'heavy iron ball' });
  const objectClassFallbackAssetIdsByGlyph = Object.freeze({ '+': 'spellbook-class-icon', '/': 'wand-class-icon', '!': 'potion-class-icon', '=': 'ring-class-icon', '"': 'amulet-class-icon', '*': 'gem-class-icon', '?': 'scroll-class-icon', ')': 'weapon-class-icon', '[': 'armor-class-icon', '(': 'tool-class-icon', '$': 'coin-pile', '`': 'boulder', '_': 'iron-chain', '0': 'heavy-iron-ball' });
  function objectClassFallbackAssetId(ch, semanticKind, tileAssetsById = new Map()) {
    const kind = String(semanticKind || '').toLowerCase();
    if (kind && kind !== 'object' && kind !== 'item') return undefined;
    const id = objectClassFallbackAssetIdsByGlyph[ch];
    return id && tileAssetsById.has(id) ? id : undefined;
  }
  function publicAppearanceClassNounForCell(cell) {
    const normalized = normalizeCell(cell);
    const kind = String(normalized.semanticKind || '').toLowerCase();
    if (kind && kind !== 'object' && kind !== 'item') return undefined;
    return publicAppearanceClassNounsByGlyph[normalized.ch];
  }
  function publicObjectClassNameForCell(cell) {
    const normalized = normalizeCell(cell);
    const kind = String(normalized.semanticKind || '').toLowerCase();
    if (kind && kind !== 'object' && kind !== 'item') return undefined;
    return publicClassNamesByGlyph[normalized.ch];
  }
  function appendClassNounToAppearance(appearance, noun) {
    const text = String(appearance || '').trim();
    if (!text || !noun) return text;
    const nounPattern = noun === 'spellbook' ? /\b(?:spell\s*book|spellbook|book)\b/i : new RegExp(`\\b${noun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return nounPattern.test(text) ? text : `${text} ${noun}`;
  }
  function visibleSubjectNameForCorpseOrStatue(cell) {
    const normalized = normalizeCell(cell);
    const kind = String(normalized.semanticKind || '').toLowerCase();
    const name = String(normalized.semanticName || '').trim();
    if (!name || (kind !== 'corpse' && kind !== 'statue')) return undefined;
    if (kind === 'corpse') return name.replace(/^corpse\s+of\s+(?:an?\s+|the\s+)?/i, '').replace(/\s+corpse$/i, '').trim() || name;
    return name.replace(/^statue\s+of\s+(?:an?\s+|the\s+)?/i, '').replace(/\s+statue$/i, '').trim() || name;
  }
  function isSpellbookAppearanceName(name, cell = {}) {
    const text = String(name || '').trim();
    if (!text) return false;
    const normalized = normalizeCell(cell);
    const kind = String(normalized.semanticKind || '').toLowerCase();
    if (kind && kind !== 'object' && kind !== 'item') return false;
    if (normalized.ch && normalized.ch !== '+') return false;
    if (/\b(?:spell\s*book|spellbook|book)\b/i.test(text)) return true;
    return spellbookAppearanceSlugs.has(slugifySemanticName(text));
  }
  function publicDisplayNameForCell(cell) {
    const normalized = normalizeCell(cell);
    const exactDisplayName = String(normalized.displayName || '').trim();
    if (exactDisplayName) return exactDisplayName;
    if (normalized.semanticKnown === false) {
      const appearance = String(normalized.semanticAppearance || '').trim();
      if (appearance) {
        if (isSpellbookAppearanceName(appearance, normalized)) return appendClassNounToAppearance(appearance, 'spellbook');
        return appendClassNounToAppearance(appearance, publicAppearanceClassNounForCell(normalized));
      }
      if (/^scroll\s+labeled\s+/i.test(String(normalized.semanticName || ''))) return normalized.semanticName;
      return publicObjectClassNameForCell(normalized);
    }
    return normalized.semanticName;
  }
  function publicAppearanceSubclassAssetId(name, semanticKind, tileAssetsById = new Map(), cell = {}) {
    const kind = String(semanticKind || '').toLowerCase();
    if (kind && kind !== 'object' && kind !== 'item') return undefined;
    const normalized = normalizeCell(cell);
    const ch = normalized.ch;
    const noClassGlyph = !ch || ch === ' ';
    const text = String(name || '').toLowerCase();
    if (!text) return undefined;
    const has = (id) => tileAssetsById.has(id) ? id : undefined;
    if (ch === '[' || noClassGlyph) {
      if (/\b(?:helmet|helm|hat|cap)\b/.test(text)) return has('helmet');
      if (/\b(?:shield|roundshield|buckler)\b/.test(text)) return has('shield');
      if (/\b(?:gloves?|gauntlets?)\b/.test(text)) return has('gloves');
      if (/\b(?:boots?|shoes?|jackboots?)\b/.test(text)) return has('boots');
      if (/\b(?:cloak|cape|pall|mantelet|cope|smock|apron|cloth)\b/.test(text)) return has('cloak');
      if (/\bring mail\b/.test(text)) return has('ring-mail') || has('armor-class-icon');
      if (/\bchain mail\b/.test(text)) return has('chain-mail') || has('armor-class-icon');
      if (/\b(?:mail|armor|armour|plate|scales?|coat|jacket|shirt)\b/.test(text)) return has('armor-class-icon');
    }
    if (ch === ')' || noClassGlyph) {
      if (/\b(?:dagger|knife|sword|saber|axe|mace|club|bow|arrow|spear|lance|staff|polearm|flail|hammer|crossbow|dart|shuriken|boomerang)\b/.test(text)) return has('weapon-class-icon');
    }
    if (ch === '(' || noClassGlyph) {
      if (/\b(?:lamp|lantern|key|pick|bag|box|chest|sack|whistle|horn|flute|harp|marker|candle|mirror|towel|blindfold|tool)\b/.test(text)) return has('tool-class-icon');
    }
    return undefined;
  }
  function publicAppearanceAssetId(name, semanticKind, tileMapConfig = defaultTileMapConfig, tileAssetsById = new Map(), cell = {}) {
    const kind = String(semanticKind || '').toLowerCase();
    if (kind && kind !== 'object' && kind !== 'item') return undefined;
    const normalized = normalizeCell(cell);
    const classNoun = publicAppearanceClassNounForCell({ ...normalized, semanticKind });
    const visibleAppearanceName = classNoun ? appendClassNounToAppearance(name, classNoun) : String(name || '').trim();
    // NetHack often reports public magical-object appearances as bare adjectives
    // (`ruby`, `gold`, `long`) plus a class glyph.  Resolve the player-visible
    // classed name first so `ruby` + `!` cannot borrow the ruby gem asset; if no
    // class-specific art exists, fail closed to the neutral class icon below.
    const directName = visibleAppearanceName || name;
    const semanticId = assetIdForSemanticName(directName, semanticKind, tileMapConfig, tileAssetsById);
    if (semanticId) {
      const asset = tileAssetsById.get(semanticId);
      const category = String(asset?.categorySlug || '').toLowerCase();
      if (/object|inventory/.test(category)) return semanticId;
    }
    return publicAppearanceSubclassAssetId(visibleAppearanceName || name, semanticKind, tileAssetsById, cell);
  }
  function appearanceClassFallbackAssetId(name, semanticKind, tileAssetsById = new Map(), cell = {}) {
    const kind = String(semanticKind || '').toLowerCase();
    const text = String(name || '').toLowerCase();
    if (kind === 'object' && /^scroll\s+labeled\s+/.test(text) && tileAssetsById.has('scroll-class-icon')) return 'scroll-class-icon';
    if ((kind === 'object' || kind === 'item') && isSpellbookAppearanceName(name, { ...cell, semanticKind }) && tileAssetsById.has('spellbook-class-icon')) return 'spellbook-class-icon';
    return objectClassFallbackAssetId(normalizeCell(cell).ch, semanticKind, tileAssetsById);
  }
  function assetIdForSemanticName(name, semanticKind, tileMapConfig = defaultTileMapConfig, tileAssetsById = new Map()) {
    const semanticAlias = semanticAssetAliases.get(String(name || '').toLowerCase());
    const semanticSlug = slugifySemanticName(name);
    const labelId = scrollLabelAssetId(name, tileAssetsById);
    const kindSpecificId = kindSpecificSemanticAssetId(semanticKind, semanticSlug, tileAssetsById);
    const unscopedExactId = !semanticKind && semanticSlug && tileAssetsById.has(semanticSlug) ? semanticSlug : undefined;
    return labelId || kindSpecificId || tileMapConfig.semanticName?.[semanticSlug]
      || (semanticAlias && tileAssetsById.has(semanticAlias) ? semanticAlias : undefined)
      || unscopedExactId;
  }
  function engulfmentAssetId(cell, tileMapConfig = defaultTileMapConfig, tileAssetsById = new Map()) {
    const normalized = normalizeCell(cell);
    if (String(normalized.semanticKind || '').toLowerCase() !== 'engulfment') return undefined;
    return assetIdForSemanticName(normalized.semanticName, 'monster', tileMapConfig, tileAssetsById);
  }
  function mappedAssetIdForCell(cell, { tileMapConfig = defaultTileMapConfig, tileAssetsById = new Map(), playerCharacter } = {}) {
    const normalized = normalizeCell(cell);
    if (normalized.ch === ' ' && normalized.assetId == null && normalized.glyph == null && !normalized.semanticKind && !normalized.semanticName && !normalized.semanticAppearance) return undefined;
    const playerCell = isPlayerCell(normalized);
    const comboAvatarId = playerCell ? playerComboAvatarAssetId(playerCharacter, tileAssetsById) : undefined;
    const roleAvatarId = playerCell ? playerRoleAvatarAssetId(playerCharacter, tileAssetsById) : undefined;
    const semanticPlayerAvatarId = playerCell ? playerSemanticAvatarAssetId(normalized, tileAssetsById) : undefined;
    const semanticKind = String(normalized.semanticKind || '').toLowerCase();
    const semanticSubjectId = assetIdForSemanticName(visibleSubjectNameForCorpseOrStatue(normalized), 'monster', tileMapConfig, tileAssetsById);
    const semanticNameId = assetIdForSemanticName(normalized.semanticName, normalized.semanticKind, tileMapConfig, tileAssetsById);
    const petStateId = semanticKind === 'pet' ? petAssetAliases.get(String(normalized.semanticName || '').toLowerCase()) : undefined;
    const semanticAppearanceId = assetIdForSemanticName(normalized.semanticAppearance, normalized.semanticKind, tileMapConfig, tileAssetsById);
    const appearanceFallbackId = appearanceClassFallbackAssetId(normalized.semanticAppearance, normalized.semanticKind, tileAssetsById, normalized);
    const corpseFallbackId = semanticKind === 'corpse' && tileAssetsById.has('corpse') ? 'corpse' : undefined;
    const statueFallbackId = semanticKind === 'statue' && tileAssetsById.has('statue') ? 'statue' : undefined;
    const classFallbackId = objectClassFallbackAssetId(normalized.ch, normalized.semanticKind, tileAssetsById);
    const cmapGlyphId = normalized.cmapIndex != null && Number.isFinite(Number(normalized.cmapIndex)) ? tileMapConfig.glyphNumber?.[String(normalized.glyph)] : undefined;
    const semanticNameIsVisibleScrollLabel = /^scroll\s+labeled\s+/i.test(String(normalized.semanticName || ''));
    const unknownAppearanceName = normalized.semanticKnown === false ? (normalized.semanticAppearance || (semanticNameIsVisibleScrollLabel ? normalized.semanticName : undefined)) : undefined;
    const hidesSemanticName = normalized.semanticKnown === false;
    const unknownAppearanceId = unknownAppearanceName ? (scrollLabelAppearanceAssetId(unknownAppearanceName, tileAssetsById) || publicAppearanceAssetId(unknownAppearanceName, normalized.semanticKind, tileMapConfig, tileAssetsById, normalized) || appearanceClassFallbackAssetId(unknownAppearanceName, normalized.semanticKind, tileAssetsById, normalized)) : undefined;
    const knownOrDisplayNameId = hidesSemanticName ? undefined : semanticNameId;
    const secondaryAppearanceId = hidesSemanticName ? undefined : semanticAppearanceId;
    const engulfmentId = engulfmentAssetId(normalized, tileMapConfig, tileAssetsById);
    // Upstream fixture/runtime events may carry an explicit assetId.  For unknown
    // objects, do not let that precomputed id bypass public-appearance safeguards
    // and reveal hidden identity art; recompute from the visible appearance/class.
    const explicitAssetId = hidesSemanticName ? undefined : normalized.assetId;
    const nonPlayerAtSign = normalized.ch === '@' && !isPlayerCell(normalized);
    if (playerCell) {
      const explicitPlayerAvatarId = playerExplicitAvatarAssetId(explicitAssetId, tileAssetsById);
      const explicitSpecificAvatarId = explicitPlayerAvatarId === 'hero-avatar' ? undefined : explicitPlayerAvatarId;
      return explicitSpecificAvatarId || comboAvatarId || roleAvatarId || semanticPlayerAvatarId || explicitPlayerAvatarId || tileMapConfig.glyphNumber?.[String(normalized.glyph)] || tileMapConfig.semanticKind?.[semanticKind] || tileMapConfig.char?.[normalized.ch] || defaultTileMapConfig.char[normalized.ch];
    }
    if (semanticKind === 'engulfment') return engulfmentId;
    return petStateId || explicitAssetId || unknownAppearanceId || semanticSubjectId || knownOrDisplayNameId || secondaryAppearanceId || corpseFallbackId || statueFallbackId || cmapGlyphId || classFallbackId || tileMapConfig.glyphNumber?.[String(normalized.glyph)]
      || tileMapConfig.semanticKind?.[semanticKind]
      || (nonPlayerAtSign ? undefined : (tileMapConfig.char?.[normalized.ch] || defaultTileMapConfig.char[normalized.ch]));
  }
  function tileUrl(tile) {
    const assetPath = String(tile?.installedPath || '').replace(/^electron-poc\//, '');
    const version = tile?.sha256 || tile?.checksum || tile?.sourceSha256 || tile?.completedAt || tile?.coherentRestartAt || '';
    const cacheBust = version ? `?v=${encodeURIComponent(String(version).slice(0, 20))}` : '';
    return `url('../${assetPath}${cacheBust}')`;
  }
  function isOverlayTile(tile) {
    if (!tile) return false;
    if (/transparent/i.test(tile.workflowLabel || '') || /rem[_-]?back(?:ground)?/i.test(tile.workflow || '')) return true;
    return ['traps-hazards', 'player-pets-identity', 'player-combo-avatars', 'common-early-monsters', 'objects-inventory'].includes(tile.categorySlug);
  }
  function baseTileIdForCell(cell, overlayTile) {
    const normalized = normalizeCell(cell);
    const ch = normalized.ch;
    if (normalized.actorId === 'hero' && String(normalized.semanticKind || '').toLowerCase() === 'terrain') {
      const terrainName = String(normalized.semanticName || '').toLowerCase();
      if (terrainName === 'cloud' || terrainName === 'poison cloud') return terrainName.replace(' ', '-');
    }
    if (ch === ' ' || overlayTile?.id === 'unexplored-stone') return undefined;
    if (isOverlayTile(overlayTile)) return ch === '#' ? 'lit-corridor' : 'room-floor';
    if (['.', '#'].includes(ch) || ['room-floor', 'dark-room-floor', 'lit-corridor', 'dark-corridor'].includes(overlayTile?.id)) return undefined;
    if (['|', '-'].includes(ch) || /wall/i.test(overlayTile?.id || '')) return 'unexplored-stone';
    return 'room-floor';
  }
  return Object.freeze({ version: 'nethack-tile-assets/v1', defaultTileMapConfig, semanticAssetAliases, petAssetAliases, spellbookAppearanceSlugs: Object.freeze(Array.from(spellbookAppearanceSlugs)), roleCodes, raceCodes, genderCodes, slugifySemanticName, normalizedPlayerParts, playerComboAvatarAssetId, playerRoleAvatarAssetId, playerSemanticAvatarAssetId, playerExplicitAvatarAssetId, scrollLabelParts, isSafeScrollLabelAsset, scrollLabelAssetId, scrollLabelAppearanceAssetId, objectClassFallbackAssetId, publicAppearanceClassNounForCell, publicObjectClassNameForCell, appendClassNounToAppearance, visibleSubjectNameForCorpseOrStatue, isSpellbookAppearanceName, publicDisplayNameForCell, publicAppearanceSubclassAssetId, publicAppearanceAssetId, appearanceClassFallbackAssetId, assetIdForSemanticName, engulfmentAssetId, mappedAssetIdForCell, tileUrl, isOverlayTile, baseTileIdForCell, normalizeCell, normalizeManifest, assetsById, isPlayerCell });
}));
