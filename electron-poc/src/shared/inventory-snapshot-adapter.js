(function initInventorySnapshotAdapter(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackInventorySnapshotAdapter = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
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
    if (/\(weapon in hands\)/i.test(displayName)) return displayName.replace(/\s*\(alternate weapon; not wielded\)\s*/ig, ' ').replace(/\s+/g, ' ').trim();
    return displayName;
  }
  function objectClassFromGlyphChar(value) {
    const code = Number(value);
    if (!Number.isInteger(code) || code <= 0 || code >= 128) return undefined;
    const ch = String.fromCharCode(code);
    if (!/\S/.test(ch)) return undefined;
    return ch;
  }
  function copyStringArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : undefined;
  }
  function publicKnownFlags(item) {
    const known = {};
    if (item?.semanticKnown === true) known.identity = true;
    else if (item?.semanticKnown === false) known.identity = false;
    if (item?.semanticAppearance != null || item?.displayName != null || item?.text != null) known.appearance = true;
    if (item?.quantity != null) known.quantity = true;
    return Object.keys(known).length ? known : undefined;
  }

  function normalizePublicInventoryItem(item = {}) {
    if (!isPlainObject(item)) return null;
    const inventoryLetter = selectorToLetter(item.inventoryLetter ?? item.selector);
    const displayName = displayNameFromText(item.displayName || item.text, inventoryLetter);
    if (!displayName) return null;
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
    if (typeof item.semanticKnown === 'boolean') out.semanticKnown = item.semanticKnown;
    if (typeof item.semanticAppearance === 'string') out.semanticAppearance = item.semanticAppearance;
    if ((item.semanticKnown === true || item.known?.identity === true) && typeof item.semanticName === 'string') out.semanticName = item.semanticName;
    const known = publicKnownFlags(item);
    if (known) out.known = known;
    const actionAffordances = copyStringArray(item.actionAffordances || item.publicActionHints);
    if (actionAffordances) out.actionAffordances = actionAffordances;
    return out;
  }

  function publicItemToLegacyChoice(item = {}) {
    const letter = item.inventoryLetter;
    const selector = letterToSelector(letter);
    const text = `${letter ? `${letter} - ` : ''}${item.displayName || 'item'}`;
    const out = {
      selector,
      text,
      objectId: item.objectId,
      quantity: item.quantity,
      glyph: item.glyph,
      glyphChar: item.glyphChar,
      wornMask: item.wornMask,
      semanticKind: item.semanticKind,
      semanticAppearance: item.semanticAppearance,
      semanticKnown: item.semanticKnown,
      actionAffordances: Array.isArray(item.actionAffordances) ? item.actionAffordances.slice() : [],
    };
    if (item.semanticKnown === true || item.known?.identity === true) out.semanticName = item.semanticName;
    return out;
  }

  function normalizeInventoryRevision(value) {
    const revision = asNonNegativeInteger(value);
    return revision == null ? 0 : revision;
  }

  function normalizeInventorySnapshotPayload(payload = {}) {
    const revision = normalizeInventoryRevision(payload.revision);
    const items = Array.isArray(payload.items) ? payload.items.map(normalizePublicInventoryItem).filter(Boolean) : [];
    return Object.freeze({ revision, items: Object.freeze(items.map((item) => Object.freeze(item))) });
  }

  function adaptShimInventoryUpdateToSnapshot(event = {}) {
    const revision = normalizeInventoryRevision(event.revision ?? event.inventoryRevision);
    return normalizeInventorySnapshotPayload({ revision, items: event.items || [] });
  }

  function createInventorySnapshotEvent(event = {}, options = {}) {
    const snapshot = adaptShimInventoryUpdateToSnapshot(event);
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

  function cloneInventoryState(inventory = emptyInventoryState()) {
    return {
      revision: normalizeInventoryRevision(inventory.revision),
      itemsByObjectId: new Map(inventory.itemsByObjectId || []),
      itemsByLetter: new Map(inventory.itemsByLetter || []),
      orderedItems: Array.isArray(inventory.orderedItems) ? inventory.orderedItems.map((item) => ({ ...item, location: item.location ? { ...item.location } : item.location, known: item.known ? { ...item.known } : item.known, actionAffordances: Array.isArray(item.actionAffordances) ? item.actionAffordances.slice() : item.actionAffordances })) : [],
      lastSnapshotSource: inventory.lastSnapshotSource ? { ...inventory.lastSnapshotSource } : null,
      lastSnapshotEvent: inventory.lastSnapshotEvent ? { ...inventory.lastSnapshotEvent, payload: { ...inventory.lastSnapshotEvent.payload, items: (inventory.lastSnapshotEvent.payload?.items || []).map((item) => ({ ...item })) } } : null,
    };
  }

  function applyInventorySnapshot(previous = emptyInventoryState(), payload = {}, options = {}) {
    const snapshot = normalizeInventorySnapshotPayload(payload);
    const state = emptyInventoryState();
    state.revision = snapshot.revision;
    state.lastSnapshotSource = options.source ? { ...options.source } : null;
    state.lastSnapshotEvent = options.event ? { ...options.event, payload: { ...options.event.payload, items: (options.event.payload?.items || []).map((item) => ({ ...item })) } } : null;
    for (const item of snapshot.items) {
      const copy = { ...item, location: item.location ? { ...item.location } : item.location, known: item.known ? { ...item.known } : item.known, actionAffordances: Array.isArray(item.actionAffordances) ? item.actionAffordances.slice() : item.actionAffordances };
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
    publicItemToLegacyChoice,
    normalizeInventorySnapshotPayload,
    adaptShimInventoryUpdateToSnapshot,
    createInventorySnapshotEvent,
    emptyInventoryState,
    cloneInventoryState,
    applyInventorySnapshot,
  });
}));
