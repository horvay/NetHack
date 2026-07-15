(function initInventorySnapshotAdapter(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./public-item-knowledge'));
  else root.NetHackInventorySnapshotAdapter = factory(root.NetHackPublicItemKnowledge);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(PublicItemKnowledge = {}) {
  const version = 'nethack-inventory-snapshot-adapter/v1';

  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function asNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && Number.isSafeInteger(number) ? number : undefined;
  }
  function selectorToLetter(selector) {
    if (typeof selector === 'string' && selector.length === 1) return selector;
    const code = Number(selector);
    if (Number.isInteger(code) && code > 0 && code < 128) return String.fromCharCode(code);
    return undefined;
  }
  function letterToSelector(letter) {
    return typeof letter === 'string' && letter.length === 1 ? letter.charCodeAt(0) : undefined;
  }
  function displayNameFromText(text, inventoryLetter) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    const letter = inventoryLetter ? inventoryLetter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[A-Za-z$]';
    const prefixed = raw.match(new RegExp(`^\\s*${letter}\\s*-\\s*(.+)$`, 'i'));
    const displayName = (prefixed?.[1] || raw).trim();
    if (/\(weapon in (?:right |left )?hands?\)/i.test(displayName)) return displayName.replace(/\s*\(alternate weapon; not wielded\)\s*/ig, ' ').replace(/\s+/g, ' ').trim();
    return displayName;
  }
  function displayNameWithKnownFacts(displayName, fields = {}) {
    const label = String(displayName || '').replace(/\s+/g, ' ').trim();
    if (!label || !isPlainObject(fields)) return label;
    const prefixes = [];
    const beatitude = typeof fields.beatitude === 'string' && /^(?:blessed|uncursed|cursed)$/.test(fields.beatitude) ? fields.beatitude : '';
    if (beatitude && !new RegExp(`\\b${beatitude}\\b`, 'i').test(label)) prefixes.push(beatitude);
    if (fields.poisoned === true && !/\bpoisoned\b/i.test(label)) prefixes.push('poisoned');
    if (Number.isInteger(fields.enchantment)) {
      const enchantment = `${fields.enchantment >= 0 ? '+' : ''}${fields.enchantment}`;
      if (!new RegExp(`(?:^|\\s)${enchantment.replace('+', '\\+')}\\b`).test(label)) prefixes.push(enchantment);
    }
    if (!prefixes.length) return label;
    const leading = label.match(/^(?:(?:a|an|the|some)|\d+)\s+/i)?.[0] || '';
    return `${leading}${prefixes.join(' ')} ${label.slice(leading.length)}`.trim();
  }
  function objectClassFromGlyphChar(value) {
    const code = Number(value);
    if (!Number.isInteger(code) || code <= 0 || code >= 128) return undefined;
    const ch = String.fromCharCode(code);
    if (!/\S/.test(ch)) return undefined;
    return ch;
  }
  const publicClasses = new Set(['weapon', 'armor', 'food', 'potion', 'scroll', 'spellbook', 'wand', 'ring', 'amulet', 'tool', 'gem', 'coin', 'other']);
  const publicFilterGroups = new Set(['equipped', 'weapons', 'armor', 'consumables', 'magic']);
  const equipmentSlotIds = new Set(['mainHand', 'offHand', 'quiver', 'armor.body', 'armor.cloak', 'armor.shirt', 'armor.helm', 'armor.gloves', 'armor.boots', 'armor.shield', 'amulet', 'ring.left', 'ring.right', 'eyes']);
  const publicKnownFieldKeys = Object.freeze(['beatitude', 'charges', 'enchantment', 'weight', 'erosion', 'corrosion', 'poisoned']);
  const knownFieldClasses = Object.freeze({ charges: new Set(['wand', 'tool']), enchantment: new Set(['weapon', 'armor', 'ring', 'tool']), erosion: new Set(['weapon', 'armor']), corrosion: new Set(['weapon', 'armor']), poisoned: new Set(['weapon']) });
  function copyStringArray(value, allowed) {
    if (!Array.isArray(value)) return undefined;
    return Array.from(new Set(value.filter((item) => typeof item === 'string' && (!allowed || allowed.has(item)))));
  }
  function copyKnownFields(value, publicClass) {
    if (!isPlainObject(value)) return undefined;
    const result = {};
    for (const key of publicKnownFieldKeys) {
      const entry = value[key];
      if (entry == null || !['string', 'number', 'boolean'].includes(typeof entry)) continue;
      if (knownFieldClasses[key] && !knownFieldClasses[key].has(publicClass)) continue;
      result[key] = entry;
    }
    return Object.keys(result).length ? result : undefined;
  }
  function copyOwnership(value) {
    if (!isPlainObject(value) || !['owned', 'unpaid', 'for-sale'].includes(value.state)) return undefined;
    const result = { state: value.state };
    const price = asNonNegativeInteger(value.price);
    if (price != null) result.price = price;
    if (typeof value.currency === 'string' && value.currency.trim()) result.currency = value.currency.trim();
    return result;
  }
  function copyItemPresentationFields(source, target) {
    const publicClass = typeof source.publicClass === 'string' && publicClasses.has(source.publicClass) ? source.publicClass : undefined;
    if (publicClass) target.publicClass = publicClass;
    const filterGroups = copyStringArray(source.filterGroups, publicFilterGroups);
    if (filterGroups) target.filterGroups = filterGroups.filter((group) => (group === 'equipped' ? Number(source.wornMask) > 0 : (publicClass && ({ weapon: ['weapons'], armor: ['armor'], food: ['consumables'], potion: ['consumables', 'magic'], scroll: ['consumables', 'magic'], spellbook: ['magic'], wand: ['magic'], ring: ['magic'], amulet: ['magic'] }[publicClass] || []).includes(group))));
    const equipmentSlots = copyStringArray(source.equipmentSlots, equipmentSlotIds);
    if (equipmentSlots) {
      const classSlots = publicClass === 'weapon' ? new Set(['mainHand', 'offHand', 'quiver'])
        : publicClass === 'armor' ? new Set(Array.from(equipmentSlotIds).filter((slot) => slot.startsWith('armor.')))
          : publicClass === 'ring' ? new Set(['ring.left', 'ring.right'])
            : publicClass === 'amulet' ? new Set(['amulet'])
              : publicClass === 'gem' ? new Set(['quiver'])
                : publicClass === 'tool' ? new Set(['mainHand', 'offHand', 'eyes']) : new Set();
      target.equipmentSlots = publicClass ? equipmentSlots.filter((slot) => classSlots.has(slot)) : equipmentSlots;
    }
    const knownFields = copyKnownFields(source.knownFields, publicClass);
    if (knownFields) target.knownFields = knownFields;
    const ownership = copyOwnership(source.ownership);
    if (ownership) target.ownership = ownership;
    for (const key of ['calledName', 'individualName']) {
      const value = PublicItemKnowledge.publicNamingValue(source, key);
      if (value) target[key] = value;
    }
    return target;
  }
  function cleanPublicString(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }
  function identityIsExplicitlyUnknown(item) { return !PublicItemKnowledge.identityIsPublic(item); }
  function identityIsExplicitlyKnown(item) { return PublicItemKnowledge.identityIsPublic(item); }
  function explicitAppearance(item) { return PublicItemKnowledge.explicitAppearance(item); }
  function isItemLike(item) {
    if (!isPlainObject(item)) return false;
    return ['objectId', 'inventoryLetter', 'selector', 'displayName', 'text', 'name', 'appearanceName', 'semanticAppearance', 'semanticName', 'semanticKnown', 'known', 'calledName', 'individualName', 'glyph', 'glyphChar', 'objectClass', 'publicClass']
      .some((key) => item[key] != null);
  }
  function isStructurallyValidPublicItem(item) {
    if (!isItemLike(item)) return false;
    for (const key of ['displayName', 'text', 'name', 'appearanceName', 'semanticAppearance', 'semanticName', 'semanticKind', 'objectClass', 'publicClass', 'calledName', 'individualName']) {
      if (item[key] != null && typeof item[key] !== 'string') return false;
    }
    if (item.semanticKnown != null && typeof item.semanticKnown !== 'boolean') return false;
    if (item.known != null) {
      if (!isPlainObject(item.known)) return false;
      for (const key of ['identity', 'appearance', 'quantity', 'naming']) if (item.known[key] != null && typeof item.known[key] !== 'boolean') return false;
    }
    for (const key of ['objectId', 'quantity', 'glyph', 'glyphChar', 'wornMask']) if (item[key] != null && asNonNegativeInteger(item[key]) == null) return false;
    for (const key of ['actionAffordances', 'publicActionHints', 'filterGroups', 'equipmentSlots']) if (item[key] != null && (!Array.isArray(item[key]) || item[key].some((entry) => typeof entry !== 'string'))) return false;
    if (item.knownFields != null && !isPlainObject(item.knownFields)) return false;
    if (item.ownership != null && !isPlainObject(item.ownership)) return false;
    return true;
  }
  function publicKnownFlags(item) { return { ...PublicItemKnowledge.publicKnownFlags(item) }; }

  function normalizePublicInventoryItem(item = {}) {
    if (!isStructurallyValidPublicItem(item)) return null;
    const inventoryLetter = selectorToLetter(item.inventoryLetter ?? item.selector);
    const identityKnown = identityIsExplicitlyKnown(item);
    const displayName = displayNameWithKnownFacts(displayNameFromText(PublicItemKnowledge.publicDisplayLabel(item, { neutral: 'item' }), inventoryLetter) || 'item', item.knownFields);
    const out = {
      displayName,
      location: { kind: 'inventory' },
    };
    const objectId = asNonNegativeInteger(item.objectId);
    if (objectId != null) out.objectId = objectId;
    if (inventoryLetter) out.inventoryLetter = inventoryLetter;
    const quantity = asNonNegativeInteger(item.quantity);
    if (quantity != null) out.quantity = quantity;
    const glyph = asNonNegativeInteger(item.glyph);
    if (glyph != null) out.glyph = glyph;
    const glyphChar = asNonNegativeInteger(item.glyphChar);
    if (glyphChar != null) out.glyphChar = glyphChar;
    const wornMask = asNonNegativeInteger(item.wornMask);
    if (wornMask != null) out.wornMask = wornMask;
    const objectClass = typeof item.objectClass === 'string' ? item.objectClass : objectClassFromGlyphChar(item.glyphChar);
    if (objectClass) out.objectClass = objectClass;
    if (typeof item.semanticKind === 'string') out.semanticKind = item.semanticKind;
    out.semanticKnown = identityKnown;
    if (item.known?.appearance !== false && typeof item.appearanceName === 'string' && item.appearanceName.trim()) out.appearanceName = item.appearanceName.trim();
    if (item.known?.appearance !== false && typeof item.semanticAppearance === 'string' && item.semanticAppearance.trim()) out.semanticAppearance = item.semanticAppearance.trim();
    if (identityKnown && typeof item.semanticName === 'string') out.semanticName = item.semanticName;
    out.known = publicKnownFlags(item);
    const actionAffordances = copyStringArray(item.actionAffordances || item.publicActionHints);
    if (actionAffordances) out.actionAffordances = actionAffordances;
    copyItemPresentationFields(item, out);
    return out;
  }

  function publicItemToLegacyChoice(item = {}) {
    const publicItem = normalizePublicInventoryItem(item) || { displayName: 'item', location: { kind: 'inventory' } };
    const letter = publicItem.inventoryLetter;
    const selector = letterToSelector(letter);
    const out = {
      selector,
      text: `${letter ? `${letter} - ` : ''}${publicItem.displayName}`,
      objectId: publicItem.objectId,
      quantity: publicItem.quantity,
      glyph: publicItem.glyph,
      glyphChar: publicItem.glyphChar,
      wornMask: publicItem.wornMask,
      semanticKind: publicItem.semanticKind,
      semanticAppearance: publicItem.semanticAppearance,
      semanticKnown: publicItem.semanticKnown,
      actionAffordances: Array.isArray(publicItem.actionAffordances) ? publicItem.actionAffordances.slice() : [],
      filterGroups: Array.isArray(publicItem.filterGroups) ? publicItem.filterGroups.slice() : [],
      equipmentSlots: Array.isArray(publicItem.equipmentSlots) ? publicItem.equipmentSlots.slice() : [],
      knownFields: publicItem.knownFields ? { ...publicItem.knownFields } : undefined,
      ownership: publicItem.ownership ? { ...publicItem.ownership } : undefined,
      publicClass: publicItem.publicClass,
      calledName: publicItem.calledName,
      individualName: publicItem.individualName,
    };
    if (publicItem.semanticKnown === true || publicItem.known?.identity === true) out.semanticName = publicItem.semanticName;
    return out;
  }

  function normalizeInventoryRevision(value) {
    const revision = asNonNegativeInteger(value);
    return revision == null ? 0 : revision;
  }

  function normalizeInventorySnapshotPayload(payload = {}) {
    const revision = normalizeInventoryRevision(payload.revision);
    const normalized = Array.isArray(payload.items) ? payload.items.map(normalizePublicInventoryItem) : [];
    const validItems = normalized.filter(Boolean);
    const objectIds = validItems.map((item) => item.objectId).filter((id) => id != null);
    const letters = validItems.map((item) => item.inventoryLetter).filter(Boolean);
    const collectionValid = Array.isArray(payload.items) && normalized.every(Boolean)
      && new Set(objectIds).size === objectIds.length && new Set(letters).size === letters.length;
    const items = collectionValid ? normalized : [];
    const snapshot = { revision, items: Object.freeze(items.map((item) => Object.freeze(item))) };
    Object.defineProperty(snapshot, 'collectionValid', { value: collectionValid, enumerable: false });
    return Object.freeze(snapshot);
  }

  function adaptShimInventoryUpdateToSnapshot(event = {}) {
    const revision = normalizeInventoryRevision(event.revision ?? event.inventoryRevision);
    return normalizeInventorySnapshotPayload({ revision, items: event.items || [] });
  }

  function createInventorySnapshotEvent(event = {}, options = {}) {
    const snapshot = adaptShimInventoryUpdateToSnapshot(event);
    if (!snapshot.collectionValid) throw new TypeError('inventory snapshot item collection is malformed');
    const sequence = asNonNegativeInteger(options.sequence ?? snapshot.revision) ?? 0;
    return {
      protocol: 'nethack-electron-ui/v2',
      sequence,
      eventId: options.eventId || `evt-inventory-snapshot-${snapshot.revision}`,
      eventType: 'inventory.snapshot',
      turn: asNonNegativeInteger(options.turn) ?? 0,
      source: options.source || { layer: 'shim-bridge' },
      revision: { inventory: snapshot.revision },
      payload: {
        revision: snapshot.revision,
        items: snapshot.items.map((item) => ({ ...item })),
      },
    };
  }

  function emptyInventoryState() {
    return {
      revision: 0,
      itemsByObjectId: new Map(),
      itemsByLetter: new Map(),
      orderedItems: [],
      lastSnapshotSource: null,
      lastSnapshotEvent: null,
    };
  }

  function clonePublicSource(source) {
    if (!isPlainObject(source)) return null;
    const out = {};
    if (typeof source.layer === 'string') out.layer = source.layer;
    const window = asNonNegativeInteger(source.window);
    if (window != null) out.window = window;
    return Object.keys(out).length ? out : null;
  }
  function cloneSnapshotEvent(event) {
    if (!isPlainObject(event)) return null;
    const out = {};
    for (const key of ['protocol', 'eventId', 'eventType']) if (typeof event[key] === 'string') out[key] = event[key];
    for (const key of ['sequence', 'turn']) { const value = asNonNegativeInteger(event[key]); if (value != null) out[key] = value; }
    if (isPlainObject(event.revision)) out.revision = Object.fromEntries(Object.entries(event.revision).filter(([, value]) => asNonNegativeInteger(value) != null).map(([key, value]) => [key, asNonNegativeInteger(value)]));
    const source = clonePublicSource(event.source); if (source) out.source = source;
    out.payload = { revision: normalizeInventoryRevision(event.payload?.revision), items: (event.payload?.items || []).map(clonePublicItem).filter(Boolean) };
    return out;
  }
  function cloneInventoryState(inventory = emptyInventoryState()) {
    const orderedItems = Array.isArray(inventory.orderedItems) ? inventory.orderedItems.map(clonePublicItem).filter(Boolean) : [];
    return {
      revision: normalizeInventoryRevision(inventory.revision),
      itemsByObjectId: new Map(orderedItems.filter((item) => item.objectId != null).map((item) => [item.objectId, item])),
      itemsByLetter: new Map(orderedItems.filter((item) => item.inventoryLetter).map((item) => [item.inventoryLetter, item])),
      orderedItems,
      lastSnapshotSource: clonePublicSource(inventory.lastSnapshotSource),
      lastSnapshotEvent: cloneSnapshotEvent(inventory.lastSnapshotEvent),
    };
  }

  function clonePublicItem(item) {
    return item ? normalizePublicInventoryItem(item) : item;
  }

  function applyInventorySnapshot(previous = emptyInventoryState(), payload = {}, options = {}) {
    if (!isPlainObject(payload) || !Array.isArray(payload.items) || payload.collectionValid === false) return cloneInventoryState(previous);
    const snapshot = normalizeInventorySnapshotPayload(payload);
    if (!snapshot.collectionValid) return cloneInventoryState(previous);
    const state = emptyInventoryState();
    state.revision = snapshot.revision;
    state.lastSnapshotSource = clonePublicSource(options.source);
    state.lastSnapshotEvent = cloneSnapshotEvent(options.event);
    for (const item of snapshot.items) {
      const copy = clonePublicItem(item);
      state.orderedItems.push(copy);
      if (copy.objectId != null) state.itemsByObjectId.set(copy.objectId, copy);
      if (copy.inventoryLetter) state.itemsByLetter.set(copy.inventoryLetter, copy);
    }
    return state;
  }

  return Object.freeze({
    version,
    selectorToLetter,
    displayNameFromText,
    normalizePublicInventoryItem,
    isStructurallyValidPublicItem,
    publicItemToLegacyChoice,
    normalizeInventorySnapshotPayload,
    adaptShimInventoryUpdateToSnapshot,
    createInventorySnapshotEvent,
    emptyInventoryState,
    cloneInventoryState,
    applyInventorySnapshot,
    identityIsPublic: identityIsExplicitlyKnown,
    publicItemLabel: PublicItemKnowledge.publicLabel,
  });
}));
