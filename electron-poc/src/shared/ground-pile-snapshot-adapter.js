(function initGroundPileSnapshotAdapter(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./inventory-snapshot-adapter'));
  else root.NetHackGroundPileSnapshotAdapter = factory(root.NetHackInventorySnapshotAdapter);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(InventorySnapshotAdapter) {
  const version = 'nethack-ground-pile-snapshot-adapter/v1';
  const visibleTextObservations = new WeakSet();

  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function asNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && Number.isSafeInteger(number) ? number : undefined;
  }
  function normalizeRevision(value) { return asNonNegativeInteger(value) ?? 0; }
  function normalizeCoord(coord = {}) {
    return Object.freeze({ x: asNonNegativeInteger(coord.x) ?? 0, y: asNonNegativeInteger(coord.y) ?? 0 });
  }
  function pileKey(coord = {}) {
    const normalized = normalizeCoord(coord);
    return `${normalized.x},${normalized.y}`;
  }
  function selectorToLetter(selector) {
    if (typeof selector === 'string' && selector.length === 1) return selector;
    const code = Number(selector);
    if (Number.isInteger(code) && code > 0 && code < 128) return String.fromCharCode(code);
    return undefined;
  }
  function cleanGroundText(text, selector) {
    const letter = selectorToLetter(selector);
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    if (InventorySnapshotAdapter?.displayNameFromText) return InventorySnapshotAdapter.displayNameFromText(raw, letter);
    return raw.replace(/^\s*[A-Za-z$]\s*-\s*/, '').trim();
  }
  function quantityFromText(text, explicit) {
    const explicitQuantity = asNonNegativeInteger(explicit);
    if (explicitQuantity != null) return explicitQuantity;
    const match = String(text || '').trim().match(/^(\d+)\b/);
    return match ? asNonNegativeInteger(match[1]) : undefined;
  }
  function objectClassFromGlyphChar(value) {
    const code = Number(value);
    if (!Number.isInteger(code) || code <= 0 || code >= 128) return undefined;
    const ch = String.fromCharCode(code);
    return /\S/.test(ch) ? ch : undefined;
  }
  function publicKnownFlags(item, displayName) {
    const known = {};
    if (item?.semanticKnown === true || item?.known?.identity === true) known.identity = true;
    else if (item?.semanticKnown === false || item?.known?.identity === false) known.identity = false;
    if (item?.semanticAppearance != null || item?.appearanceName != null || displayName) known.appearance = true;
    if (item?.quantity != null || /^\d+\b/.test(displayName || '')) known.quantity = true;
    return Object.keys(known).length ? known : undefined;
  }
  function cloneStringArray(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : undefined; }
  function clonePublicItem(item) {
    const normalized = item ? InventorySnapshotAdapter.normalizePublicInventoryItem(item) : null;
    return normalized ? { ...normalized, location: { kind: 'ground' } } : null;
  }

  function normalizePublicGroundItem(item = {}) {
    if (!isPlainObject(item)) return null;
    let normalized = InventorySnapshotAdapter.normalizePublicInventoryItem(item);
    if (!normalized) return null;
    const quantity = quantityFromText(normalized.displayName, item.quantity);
    if (quantity != null && normalized.quantity == null) normalized = InventorySnapshotAdapter.normalizePublicInventoryItem({ ...normalized, quantity });
    return normalized ? { ...normalized, location: { kind: 'ground' } } : null;
  }

  function normalizeGroundPileSnapshotPayload(payload = {}) {
    const revision = normalizeRevision(payload.revision);
    const coord = normalizeCoord(payload.coord);
    const normalized = Array.isArray(payload.items) ? payload.items.map(normalizePublicGroundItem) : [];
    const validItems = normalized.filter(Boolean);
    const objectIds = validItems.map((item) => item.objectId).filter((id) => id != null);
    const letters = validItems.map((item) => item.inventoryLetter).filter(Boolean);
    const collectionValid = Array.isArray(payload.items) && normalized.every(Boolean)
      && new Set(objectIds).size === objectIds.length && new Set(letters).size === letters.length;
    const items = collectionValid ? normalized : [];
    const snapshot = { revision, coord, items: Object.freeze(items.map((item) => Object.freeze(item))) };
    Object.defineProperty(snapshot, 'collectionValid', { value: collectionValid, enumerable: false });
    return Object.freeze(snapshot);
  }

  function publicDisplayNameFromObjectLayer(event = {}) {
    const known = event.objectLayerSemanticKnown === true;
    const appearance = typeof event.objectLayerSemanticAppearance === 'string' ? event.objectLayerSemanticAppearance.trim() : '';
    const semanticName = typeof event.objectLayerSemanticName === 'string' ? event.objectLayerSemanticName.trim() : '';
    if (known && semanticName) return semanticName;
    if (appearance) return appearance;
    const objectClass = objectClassFromGlyphChar(event.objectLayerChar);
    if (objectClass) return `visible ${objectClass} object`;
    if (event.objectLayerGlyph != null || event.objectLayerSemanticKind) return 'visible object';
    return '';
  }

  function groundObjectLayerEventToPublicItem(event = {}, coord = {}) {
    const hasObjectLayer = event.objectLayerGlyph != null || event.objectLayerChar != null || event.objectLayerSemanticKind != null || event.objectLayerSemanticAppearance != null || event.objectLayerSemanticName != null;
    if (!hasObjectLayer) return null;
    const displayName = publicDisplayNameFromObjectLayer(event);
    if (!displayName) return null;
    return normalizePublicGroundItem({
      displayName,
      glyph: event.objectLayerGlyph,
      glyphChar: event.objectLayerChar,
      semanticKind: event.objectLayerSemanticKind || 'object',
      semanticKnown: event.objectLayerSemanticKnown === true,
      semanticName: event.objectLayerSemanticKnown === true ? event.objectLayerSemanticName : undefined,
      semanticAppearance: event.objectLayerSemanticAppearance,
      actionAffordances: event.objectLayerActionAffordances,
      location: { kind: 'ground', coord: normalizeCoord(coord) },
    });
  }

  function createGroundPileSnapshotEvent(payload = {}, options = {}) {
    const snapshot = normalizeGroundPileSnapshotPayload(payload);
    if (!snapshot.collectionValid) throw new TypeError('ground pile snapshot item collection is malformed');
    const sequence = asNonNegativeInteger(options.sequence ?? snapshot.revision) ?? 0;
    return {
      protocol: 'nethack-electron-ui/v2',
      sequence,
      eventId: options.eventId || `evt-ground-pile-snapshot-${snapshot.revision}-${snapshot.coord.x}-${snapshot.coord.y}`,
      eventType: 'ground.pile.snapshot',
      turn: asNonNegativeInteger(options.turn) ?? 0,
      source: options.source || { layer: 'renderer' },
      revision: { ground: snapshot.revision },
      payload: {
        revision: snapshot.revision,
        coord: { ...snapshot.coord },
        items: snapshot.items.map((item) => clonePublicItem(item)),
      },
    };
  }

  function emptyGroundPileState() {
    return { revision: 0, pilesByCoord: new Map(), lastSnapshotSource: null, lastSnapshotEvent: null };
  }
  function clonePublicSource(source) {
    if (!isPlainObject(source)) return null;
    const out = {};
    if (typeof source.layer === 'string') out.layer = source.layer;
    const window = asNonNegativeInteger(source.window);
    if (window != null) out.window = window;
    return Object.keys(out).length ? out : null;
  }
  function clonePile(pile) {
    return pile ? { revision: normalizeRevision(pile.revision), ...(pile.authoritativeRevision != null ? { authoritativeRevision: normalizeRevision(pile.authoritativeRevision) } : {}), coord: { ...normalizeCoord(pile.coord) }, items: Array.isArray(pile.items) ? pile.items.map(clonePublicItem).filter(Boolean) : [] } : null;
  }
  function cloneGroundPileState(state = emptyGroundPileState()) {
    return {
      revision: normalizeRevision(state.revision),
      pilesByCoord: new Map(Array.from(state.pilesByCoord || []).map(([key, pile]) => [key, clonePile(pile)])),
      lastSnapshotSource: clonePublicSource(state.lastSnapshotSource),
      lastSnapshotEvent: state.lastSnapshotEvent ? { protocol: state.lastSnapshotEvent.protocol, sequence: asNonNegativeInteger(state.lastSnapshotEvent.sequence), eventId: state.lastSnapshotEvent.eventId, eventType: state.lastSnapshotEvent.eventType, turn: asNonNegativeInteger(state.lastSnapshotEvent.turn), payload: { revision: normalizeRevision(state.lastSnapshotEvent.payload?.revision), coord: { ...normalizeCoord(state.lastSnapshotEvent.payload?.coord) }, items: (state.lastSnapshotEvent.payload?.items || []).map(clonePublicItem).filter(Boolean) } } : null,
    };
  }
  function normalizedIdentityName(value = '') {
    const normalized = String(value || '').toLowerCase()
      .replace(/^\s*\d+\s+/, '')
      .replace(/^\s*(?:a|an|the|some)\s+/, '')
      .replace(/\b(?:blessed|uncursed|cursed)\b/g, ' ')
      .replace(/[^a-z0-9$]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized.split(' ').map((word) => {
      if (word.length > 4 && /ies$/.test(word)) return `${word.slice(0, -3)}y`;
      if (word.length > 3 && /ses$/.test(word) && !/sses$/.test(word)) return word.slice(0, -1);
      if (word.length > 3 && /s$/.test(word) && !/(?:ss|us)$/.test(word)) return word.slice(0, -1);
      return word;
    }).join(' ');
  }
  function identityMatchKeys(item = {}) {
    return Array.from(new Set([item.semanticName, item.semanticAppearance, item.appearanceName, item.displayName, item.text]
      .map(normalizedIdentityName).filter(Boolean)));
  }
  function itemIdentity(item = {}) {
    if (item.objectId != null) return `object:${item.objectId}`;
    const normalized = identityMatchKeys(item)[0] || String(item.displayName || '').toLowerCase();
    return `name:${normalized}`;
  }
  function visibleTextObservation(items = []) {
    const observation = Object.freeze({ items: Object.freeze((Array.isArray(items) ? items : []).map((item) => isPlainObject(item) ? Object.freeze({ ...item }) : item)) });
    visibleTextObservations.add(observation);
    return observation;
  }

  function reconcileGroundPileObservation(existingItems = [], observedInput = [], options = {}) {
    const existing = (Array.isArray(existingItems) ? existingItems : []).map(normalizePublicGroundItem).filter(Boolean).map(clonePublicItem);
    // A private WeakSet brand distinguishes player-visible text ingress from
    // arbitrary arrays and caller-asserted option booleans.
    const trustedVisibleText = isPlainObject(observedInput) && visibleTextObservations.has(observedInput);
    const observedItems = trustedVisibleText ? observedInput.items : observedInput;
    const observed = (Array.isArray(observedItems) ? observedItems : []).map((item) => {
      if (!trustedVisibleText || !isPlainObject(item) || item.semanticKnown != null || item.known?.identity != null || item.known?.appearance != null) return item;
      return { ...item, semanticKnown: false, known: { ...(item.known || {}), identity: false, appearance: true } };
    }).map(normalizePublicGroundItem).filter(Boolean).map(clonePublicItem);
    const complete = options.complete === true;
    const unmatched = new Set(existing.map((_, index) => index));
    const reconciledObserved = observed.map((incoming) => {
      let candidates = [];
      if (incoming.objectId != null) candidates = Array.from(unmatched).filter((index) => existing[index].objectId === incoming.objectId);
      if (!candidates.length && incoming.objectId == null) {
        const incomingKeys = new Set(identityMatchKeys(incoming));
        candidates = Array.from(unmatched).filter((index) => identityMatchKeys(existing[index]).some((key) => incomingKeys.has(key)));
      }
      if (candidates.length > 1 && incoming.quantity != null) {
        const quantityMatches = candidates.filter((index) => existing[index].quantity === incoming.quantity);
        if (quantityMatches.length === 1) candidates = quantityMatches;
      }
      if (candidates.length !== 1) return { item: incoming, matchedIndex: null, ambiguous: candidates.length > 1 };
      const matchedIndex = candidates[0];
      unmatched.delete(matchedIndex);
      const prior = existing[matchedIndex];
      const identityDowngraded = incoming.semanticKnown === false || incoming.known?.identity === false;
      const merged = {
        ...prior,
        ...incoming,
        ...(prior.objectId != null ? { objectId: prior.objectId } : {}),
        quantity: incoming.quantity ?? prior.quantity,
        glyph: incoming.glyph ?? prior.glyph,
        glyphChar: incoming.glyphChar ?? prior.glyphChar,
        objectClass: incoming.objectClass ?? prior.objectClass,
        semanticKind: incoming.semanticKind ?? prior.semanticKind,
        semanticKnown: identityDowngraded ? false : (incoming.semanticKnown ?? prior.semanticKnown),
        semanticName: identityDowngraded ? undefined : (incoming.semanticName ?? prior.semanticName),
        semanticAppearance: incoming.semanticAppearance ?? prior.semanticAppearance,
        actionAffordances: Array.isArray(incoming.actionAffordances) && incoming.actionAffordances.length ? incoming.actionAffordances : prior.actionAffordances,
        location: incoming.location || prior.location || { kind: 'ground' },
      };
      return { matchedIndex, ambiguous: false, item: normalizePublicGroundItem(merged) || incoming };
    });
    if (complete) return reconciledObserved.map((entry) => entry.item);
    const result = existing.slice();
    for (const entry of reconciledObserved) {
      if (entry.matchedIndex != null) result[entry.matchedIndex] = entry.item;
      else if (!entry.ambiguous) result.push(entry.item);
    }
    return result;
  }
  function publicItemSummary(item = {}) {
    return {
      objectId: item.objectId,
      displayName: item.displayName || '',
      quantity: item.quantity,
      objectClass: item.objectClass || '',
      semanticKind: item.semanticKind || '',
      semanticName: item.semanticName || '',
      semanticAppearance: item.semanticAppearance || '',
      semanticKnown: item.semanticKnown,
    };
  }
  function changed(a, b) { return JSON.stringify(a) !== JSON.stringify(b); }
  function groundPileDelta(previousPile, nextPile) {
    const beforeItems = Array.isArray(previousPile?.items) ? previousPile.items : [];
    const afterItems = Array.isArray(nextPile?.items) ? nextPile.items : [];
    function multisetMap(items) {
      const counts = new Map();
      return new Map(items.map((item) => {
        const id = itemIdentity(item);
        const count = (counts.get(id) || 0) + 1;
        counts.set(id, count);
        return [`${id}#${count}`, publicItemSummary(item)];
      }));
    }
    const before = multisetMap(beforeItems);
    const after = multisetMap(afterItems);
    const added = [];
    const removed = [];
    const changedItems = [];
    for (const [id, item] of after) {
      if (!before.has(id)) added.push(item);
      else if (changed(before.get(id), item)) changedItems.push({ before: before.get(id), after: item });
    }
    for (const [id, item] of before) if (!after.has(id)) removed.push(item);
    const coord = nextPile?.coord || previousPile?.coord || { x: 0, y: 0 };
    const changedCount = added.length + removed.length + changedItems.length;
    return { coord: { ...normalizeCoord(coord) }, fromRevision: normalizeRevision(previousPile?.revision), toRevision: normalizeRevision(nextPile?.revision), added, removed, updated: changedItems, changedCount, publicEvidence: Boolean(nextPile), changed: changedCount > 0 };
  }
  function applyGroundPileSnapshot(previous = emptyGroundPileState(), payload = {}, options = {}) {
    const state = cloneGroundPileState(previous);
    if (!isPlainObject(payload) || !Array.isArray(payload.items) || payload.collectionValid === false) return state;
    const snapshot = normalizeGroundPileSnapshotPayload(payload);
    if (!snapshot.collectionValid) return state;
    const key = pileKey(snapshot.coord);
    const existing = state.pilesByCoord.get(key);
    if (existing && snapshot.revision < normalizeRevision(existing.revision)) return state;
    if (existing && snapshot.revision === normalizeRevision(existing.revision)) return state;
    const authoritativeRevision = asNonNegativeInteger(options.authoritativeRevision) ?? asNonNegativeInteger(existing?.authoritativeRevision);
    const pile = { revision: snapshot.revision, ...(authoritativeRevision != null ? { authoritativeRevision } : {}), coord: { ...snapshot.coord }, items: snapshot.items.map(clonePublicItem) };
    state.revision = Math.max(normalizeRevision(state.revision), snapshot.revision);
    state.pilesByCoord.set(key, pile);
    state.lastSnapshotSource = clonePublicSource(options.source);
    state.lastSnapshotEvent = options.event ? { protocol: options.event.protocol, sequence: asNonNegativeInteger(options.event.sequence), eventId: options.event.eventId, eventType: options.event.eventType, turn: asNonNegativeInteger(options.event.turn), payload: { revision: normalizeRevision(options.event.payload?.revision), coord: { ...normalizeCoord(options.event.payload?.coord) }, items: (options.event.payload?.items || []).map(clonePublicItem).filter(Boolean) } } : null;
    return state;
  }
  function groundPileAt(state = emptyGroundPileState(), coord = {}) { return clonePile(state.pilesByCoord?.get?.(pileKey(coord))); }
  function rowsToGroundItems(rows = []) {
    return (Array.isArray(rows) ? rows : []).map((row) => normalizePublicGroundItem(row)).filter(Boolean);
  }
  function textLinesToGroundItems(lines = []) {
    return (Array.isArray(lines) ? lines : []).map((line) => normalizePublicGroundItem({
      text: String(line || '').replace(/^\s*(?:you see here|there (?:is|are) here|things? that are here)[:\s]*/i, '').replace(/[.!?]+$/g, '').trim(),
      semanticKind: 'object',
      semanticKnown: false,
      known: { identity: false, appearance: true },
    })).filter(Boolean);
  }

  return Object.freeze({
    version,
    normalizeCoord,
    pileKey,
    normalizePublicGroundItem,
    normalizeGroundPileSnapshotPayload,
    groundObjectLayerEventToPublicItem,
    createGroundPileSnapshotEvent,
    emptyGroundPileState,
    cloneGroundPileState,
    clonePile,
    applyGroundPileSnapshot,
    groundPileAt,
    groundPileDelta,
    normalizedIdentityName,
    visibleTextObservation,
    reconcileGroundPileObservation,
    rowsToGroundItems,
    textLinesToGroundItems,
  });
}));
