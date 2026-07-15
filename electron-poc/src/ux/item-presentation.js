(function initUxItemPresentation(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../shared/inventory-action-service'), require('../shared/inventory-snapshot-adapter'), require('../shared/public-item-knowledge'));
  else root.NetHackUxItemPresentation = factory(root.NetHackInventoryActionService, root.NetHackInventorySnapshotAdapter, root.NetHackPublicItemKnowledge);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(InventoryActionService = {}, InventorySnapshotAdapter = {}, PublicItemKnowledge = {}) {
  const version = 'nethack-ux-item-presentation/v1';
  const FILTERS = Object.freeze([
    Object.freeze({ id: 'all', label: 'All', aliases: Object.freeze(['all', 'everything', 'inventory']) }),
    Object.freeze({ id: 'equipped', label: 'Equipped', aliases: Object.freeze(['equipped', 'worn', 'wielded', 'readied']) }),
    Object.freeze({ id: 'weapons', label: 'Weapons', aliases: Object.freeze(['weapons', 'weapon', 'ammo', 'ammunition']) }),
    Object.freeze({ id: 'armor', label: 'Armor', aliases: Object.freeze(['armor', 'armour', 'clothing']) }),
    Object.freeze({ id: 'consumables', label: 'Consumables', aliases: Object.freeze(['consumables', 'food', 'potions', 'scrolls']) }),
    Object.freeze({ id: 'magic', label: 'Magic', aliases: Object.freeze(['magic', 'wands', 'rings', 'amulets', 'spellbooks']) }),
  ]);
  const FILTER_IDS = new Set(FILTERS.map((filter) => filter.id));
  const PUBLIC_CLASSES = new Set(['weapon', 'armor', 'food', 'potion', 'scroll', 'spellbook', 'wand', 'ring', 'amulet', 'tool', 'gem', 'coin', 'other']);
  const SLOT_IDS = new Set(['mainHand', 'offHand', 'quiver', 'armor.body', 'armor.cloak', 'armor.shirt', 'armor.helm', 'armor.gloves', 'armor.boots', 'armor.shield', 'amulet', 'ring.left', 'ring.right', 'eyes']);
  const LOCATION_KINDS = new Set(['inventory', 'equipment', 'ground', 'container', 'unknown']);
  const EQUIPPED_MASK = 0x00000100 | 0x00000200 | 0x00000400 | 0x0000007f | 0x00010000 | 0x00020000 | 0x00040000 | 0x00080000;
  const KNOWN_FACT_LABELS = Object.freeze({
    beatitude: 'BUC', charges: 'Charges', enchantment: 'Enchantment', weight: 'Weight', erosion: 'Erosion', corrosion: 'Corrosion', poisoned: 'Poisoned',
  });
  const SLOT_LABELS = Object.freeze({
    mainHand: 'Main hand', offHand: 'Offhand / alternate', quiver: 'Quiver', 'armor.body': 'Suit', 'armor.cloak': 'Cloak', 'armor.shirt': 'Shirt', 'armor.helm': 'Helmet', 'armor.gloves': 'Gloves', 'armor.boots': 'Boots', 'armor.shield': 'Shield', amulet: 'Amulet', 'ring.left': 'Left ring', 'ring.right': 'Right ring', eyes: 'Eyes',
  });

  function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function cleanString(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }
  function uniqueAllowedStrings(value, allowed) {
    return Object.freeze(Array.from(new Set((Array.isArray(value) ? value : []).map(cleanString).filter((entry) => allowed.has(entry)))));
  }
  function selectorAccelerator(item) {
    if (typeof item?.inventoryLetter === 'string' && item.inventoryLetter.length === 1) return item.inventoryLetter;
    if (typeof item?.selector === 'string' && item.selector.length === 1) return item.selector;
    const selector = Number(item?.selector);
    return Number.isInteger(selector) && selector > 0 && selector < 128 ? String.fromCharCode(selector) : '';
  }
  function stripSelector(text, item) {
    const selector = selectorAccelerator(item).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return cleanString(text).replace(selector ? new RegExp(`^${selector}\\s*[-+]\\s*`, 'i') : /^\s*[A-Za-z$]\s*[-+]\s*/, '').trim();
  }
  function publicItem(item) {
    return InventorySnapshotAdapter?.normalizePublicInventoryItem?.(item) || { displayName: 'item', semanticKnown: false, known: { identity: false }, location: { kind: 'inventory' } };
  }
  function knownState(item) {
    if (item?.semanticKnown === true || item?.known?.identity === true) return 'identified';
    if (item?.known?.appearance === true || cleanString(item?.appearanceName || item?.semanticAppearance)) return 'appearance';
    return 'unknown';
  }
  function displayName(item) {
    const projected = publicItem(item);
    const named = stripSelector(PublicItemKnowledge.publicDisplayLabel(projected, { neutral: 'item' }), projected);
    return named === 'item' ? 'Item' : (named || 'Item');
  }
  function stableId(item, index = 0) {
    const objectId = Number(item?.objectId);
    if (Number.isSafeInteger(objectId) && objectId >= 0) return `object:${objectId}`;
    const selector = selectorAccelerator(item);
    return selector ? `selector:${selector}` : `row:${index}`;
  }
  function equippedState(item) {
    const explicit = cleanString(item?.equippedState || item?.publicEquippedState);
    if (explicit) return explicit;
    const mask = Number(item?.wornMask || 0);
    return Number.isInteger(mask) && (mask & EQUIPPED_MASK) !== 0 ? 'equipped' : '';
  }
  function publicFilterGroups(item) {
    const explicitlyPublished = Array.isArray(item?.filterGroups);
    const groups = Array.from(uniqueAllowedStrings(item?.filterGroups, FILTER_IDS)).filter((group) => group !== 'all');
    if (!explicitlyPublished && equippedState(item) && !groups.includes('equipped')) groups.unshift('equipped');
    return Object.freeze(groups);
  }
  const WORN_SLOT_MASKS = Object.freeze({ mainHand: 0x00000100, offHand: 0x00000400, quiver: 0x00000200, 'armor.body': 0x00000001, 'armor.cloak': 0x00000002, 'armor.helm': 0x00000004, 'armor.gloves': 0x00000010, 'armor.boots': 0x00000020, 'armor.shield': 0x00000008, 'armor.shirt': 0x00000040, amulet: 0x00010000, 'ring.left': 0x00020000, 'ring.right': 0x00040000, eyes: 0x00080000 });
  function occupiedEquipmentSlots(item) {
    const mask = Number(item?.wornMask || 0);
    if (!Number.isSafeInteger(mask) || mask <= 0) return Object.freeze([]);
    return Object.freeze(Object.entries(WORN_SLOT_MASKS).filter(([, bit]) => (mask & bit) !== 0).map(([slot]) => slot));
  }
  function publicEquipmentSlots(item) {
    const slots = Array.from(uniqueAllowedStrings(item?.equipmentSlots, SLOT_IDS));
    const publicClass = cleanString(item?.publicClass);
    if (!PUBLIC_CLASSES.has(publicClass)) return Object.freeze(slots);
    const allowed = publicClass === 'weapon' ? new Set(['mainHand', 'offHand', 'quiver'])
      : publicClass === 'armor' ? new Set(Array.from(SLOT_IDS).filter((slot) => slot.startsWith('armor.')))
        : publicClass === 'ring' ? new Set(['ring.left', 'ring.right'])
          : publicClass === 'amulet' ? new Set(['amulet'])
            : publicClass === 'tool' ? new Set(['mainHand', 'offHand', 'eyes']) : new Set();
    return Object.freeze(slots.filter((slot) => allowed.has(slot)));
  }
  function ownership(item) {
    if (!isObject(item?.ownership)) return null;
    const state = ['owned', 'unpaid', 'for-sale'].includes(item.ownership.state) ? item.ownership.state : '';
    if (!state) return null;
    const result = { state };
    if (Number.isSafeInteger(item.ownership.price) && item.ownership.price >= 0) result.price = item.ownership.price;
    if (cleanString(item.ownership.currency)) result.currency = cleanString(item.ownership.currency);
    return Object.freeze(result);
  }
  function knownFields(item) {
    const source = isObject(item?.knownFields) ? item.knownFields : {};
    const result = {};
    for (const key of Object.keys(KNOWN_FACT_LABELS)) {
      const value = source[key];
      if (value != null && ['string', 'number', 'boolean'].includes(typeof value)) result[key] = value;
    }
    return Object.freeze(result);
  }
  function dispatchIdentity(item, index = 0) {
    const identity = { stableId: stableId(item, index) };
    const objectId = Number(item?.objectId);
    if (Number.isSafeInteger(objectId) && objectId >= 0) identity.objectId = objectId;
    const inventoryLetter = selectorAccelerator(item);
    if (inventoryLetter) {
      identity.inventoryLetter = inventoryLetter;
      identity.selector = inventoryLetter.charCodeAt(0);
    }
    const locationKind = cleanString(item?.location?.kind);
    if (LOCATION_KINDS.has(locationKind)) identity.location = Object.freeze({ kind: locationKind });
    return Object.freeze(identity);
  }
  function publicActionInput(item, index = 0) {
    item = publicItem(item);
    const identity = dispatchIdentity(item, index);
    const result = {
      ...identity,
      displayName: displayName(item),
      text: `${identity.inventoryLetter ? `${identity.inventoryLetter} - ` : ''}${displayName(item)}`,
      quantity: Number.isSafeInteger(Number(item?.quantity)) && Number(item.quantity) >= 0 ? Number(item.quantity) : 1,
      wornMask: Number.isSafeInteger(Number(item?.wornMask)) && Number(item.wornMask) >= 0 ? Number(item.wornMask) : 0,
      semanticKnown: knownState(item) === 'identified',
      filterGroups: publicFilterGroups(item),
      equipmentSlots: publicEquipmentSlots(item),
      actionAffordances: Object.freeze((Array.isArray(item?.actionAffordances) ? item.actionAffordances : (Array.isArray(item?.publicActionHints) ? item.publicActionHints : [])).map(cleanString).filter(Boolean)),
    };
    const publicClass = cleanString(item?.publicClass);
    if (PUBLIC_CLASSES.has(publicClass)) result.publicClass = publicClass;
    return Object.freeze(result);
  }
  function iconModel(item, options = {}, index = 0) {
    const resolved = typeof options.iconResolver === 'function' ? options.iconResolver(publicActionInput(item, index)) : null;
    if (typeof resolved === 'string' && resolved) return Object.freeze({ src: resolved, alt: '' });
    if (isObject(resolved) && resolved.src) return Object.freeze({ src: String(resolved.src), alt: '' });
    const glyphChar = Number(item?.glyphChar);
    const fallback = Number.isInteger(glyphChar) && glyphChar > 31 && glyphChar < 127 ? String.fromCharCode(glyphChar) : '·';
    return Object.freeze({ glyph: fallback, alt: '' });
  }
  function actionContext(context = {}) {
    const safe = {};
    for (const key of ['onAltar', 'isOnAltar', 'hasAlternate', 'autoAnswerHand']) if (typeof context?.[key] === 'boolean') safe[key] = context[key];
    for (const key of ['targetRingHand', 'targetHand', 'slotId']) if (cleanString(context?.[key])) safe[key] = cleanString(context[key]);
    safe.items = Object.freeze((Array.isArray(context?.items) ? context.items : []).map(publicActionInput));
    return Object.freeze(safe);
  }
  function routeModel(execution) {
    if (!isObject(execution)) return Object.freeze({});
    const route = {};
    for (const key of ['route', 'action', 'keys']) if (cleanString(execution[key])) route[key] = cleanString(execution[key]);
    return Object.freeze(route);
  }
  function actionModels(item, context = {}, service = InventoryActionService, index = 0) {
    const legacy = publicActionInput(item, index);
    const raw = typeof service?.itemActionAffordances === 'function' ? service.itemActionAffordances(legacy, actionContext(context)) : (Array.isArray(item.actions) ? item.actions : []);
    return Object.freeze((Array.isArray(raw) ? raw : []).map((entry) => {
      const id = cleanString(entry?.id || entry?.actionId);
      if (!id) return null;
      return Object.freeze({
        id,
        label: cleanString(entry.label) || 'Use',
        section: cleanString(entry.section) || 'primary',
        enabled: entry.enabled !== false,
        disabledReason: cleanString(entry.disabledReasonLabel || entry.disabledReason),
        danger: cleanString(entry.dangerLevel) || 'safe',
        shortcut: cleanString(entry.execution?.keys || entry.key),
        route: routeModel(entry.execution),
      });
    }).filter(Boolean));
  }

  function presentItem(item = {}, options = {}) {
    item = publicItem(item);
    const index = Number.isInteger(options.index) ? options.index : 0;
    const model = {
      stableId: stableId(item, index),
      dispatchIdentity: dispatchIdentity(item, index),
      selectorAccelerator: selectorAccelerator(item),
      icon: iconModel(item, options, index),
      displayName: displayName(item),
      appearance: item?.known?.appearance === false ? '' : cleanString(item.appearanceName || item.semanticAppearance),
      calledName: cleanString(item.calledName),
      individualName: cleanString(item.individualName),
      quantity: Number.isSafeInteger(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1,
      publicClass: PUBLIC_CLASSES.has(cleanString(item.publicClass)) ? cleanString(item.publicClass) : '',
      filterGroups: publicFilterGroups(item),
      equippedState: equippedState(item),
      ownership: ownership(item),
      equipmentSlots: publicEquipmentSlots(item),
      occupiedEquipmentSlots: occupiedEquipmentSlots(item),
      knownState: knownState(item),
      semanticKnown: knownState(item) === 'identified',
      known: Object.freeze({ identity: knownState(item) === 'identified', ...(item.known?.appearance != null ? { appearance: item.known.appearance } : {}) }),
      knownFields: knownFields(item),
      actions: actionModels(item, options.actionContext || {}, options.actionService, index),
      blockedActions: Object.freeze([]),
    };
    model.blockedActions = Object.freeze(model.actions.filter((action) => !action.enabled));
    return Object.freeze(model);
  }

  function presentItems(items = [], options = {}) {
    const sourceItems = Array.isArray(items) ? items : [];
    const context = { ...(options.actionContext || {}), items: sourceItems };
    return Object.freeze(sourceItems.map((item, index) => presentItem(item, { ...options, index, actionContext: context })));
  }

  function matchesItem(model, query = '', filterId = 'all') {
    const filter = FILTER_IDS.has(filterId) ? filterId : 'all';
    if (filter !== 'all' && !model.filterGroups.includes(filter)) return false;
    const needle = cleanString(query).toLocaleLowerCase();
    if (!needle) return true;
    const filterAliases = FILTERS.flatMap((entry) => entry.aliases).filter((alias) => alias.includes(needle) || needle.includes(alias));
    const haystack = [model.displayName, model.appearance, model.calledName, model.individualName, model.selectorAccelerator, ...model.filterGroups].join(' ').toLocaleLowerCase();
    return haystack.includes(needle) || (filterAliases.length > 0 && model.filterGroups.some((group) => FILTERS.find((entry) => entry.id === group)?.aliases.some((alias) => filterAliases.includes(alias))));
  }

  function compareItems(selected, equipped) {
    if (!selected || !equipped) return Object.freeze([]);
    const keys = Array.from(new Set([...Object.keys(selected.knownFields || {}), ...Object.keys(equipped.knownFields || {})]));
    return Object.freeze(keys.map((key) => Object.freeze({
      id: key,
      label: KNOWN_FACT_LABELS[key] || key,
      selected: Object.prototype.hasOwnProperty.call(selected.knownFields, key) ? selected.knownFields[key] : 'Unknown',
      equipped: Object.prototype.hasOwnProperty.call(equipped.knownFields, key) ? equipped.knownFields[key] : 'Unknown',
    })));
  }

  function factRows(model) {
    if (!model) return Object.freeze([]);
    const rows = [];
    if (model.knownState === 'appearance') rows.push({ id: 'identity', label: 'Identity', value: 'Unknown' });
    for (const [id, value] of Object.entries(model.knownFields || {})) rows.push({ id, label: KNOWN_FACT_LABELS[id] || id, value: value === true ? 'Yes' : value === false ? 'No' : String(value) });
    if (model.equipmentSlots.length) rows.push({ id: 'slots', label: 'Fits', value: model.equipmentSlots.map((slot) => SLOT_LABELS[slot] || slot).join(', ') });
    if (model.ownership?.state === 'unpaid') rows.push({ id: 'ownership', label: 'Ownership', value: model.ownership.price != null ? `Unpaid, ${model.ownership.price} ${model.ownership.currency || 'zm'}` : 'Unpaid' });
    else if (model.ownership?.state === 'for-sale') rows.push({ id: 'ownership', label: 'Ownership', value: model.ownership.price != null ? `For sale, ${model.ownership.price} ${model.ownership.currency || 'zm'}` : 'For sale' });
    if (model.equippedState) rows.push({ id: 'equipped', label: 'Equipped', value: model.equippedState });
    return Object.freeze(rows.map((row) => Object.freeze(row)));
  }

  return Object.freeze({ version, FILTERS, KNOWN_FACT_LABELS, SLOT_LABELS, presentItem, presentItems, matchesItem, compareItems, factRows, stableId, displayName, dispatchIdentity });
}));
