(function initContainerContentsSnapshotAdapter(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./inventory-snapshot-adapter'));
  else root.NetHackContainerContentsSnapshotAdapter = factory(root.NetHackInventorySnapshotAdapter);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(InventorySnapshotAdapter) {
  const version = 'nethack-container-contents-snapshot-adapter/v1';

  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function asNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && Number.isSafeInteger(number) ? number : undefined;
  }
  function normalizeRevision(value) { return asNonNegativeInteger(value) ?? 0; }
  function cleanId(value) { return String(value || '').trim().replace(/[^A-Za-z0-9_.:-]+/g, '-') || ''; }
  function selectorToLetter(selector) {
    if (typeof selector === 'string' && selector.length === 1) return selector;
    const code = Number(selector);
    if (Number.isInteger(code) && code > 0 && code < 128) return String.fromCharCode(code);
    return undefined;
  }
  function displayNameFromText(text, selector) {
    const letter = selectorToLetter(selector);
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    if (InventorySnapshotAdapter?.displayNameFromText) return InventorySnapshotAdapter.displayNameFromText(raw, letter);
    return raw.replace(/^\s*[A-Za-z$]\s*[-+]\s*/, '').trim();
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
  function normalizeContainerIdentity(container = {}, fallbackSessionId = '') {
    const displayName = String(container.displayName || container.name || '').replace(/\s+/g, ' ').trim();
    const publicId = cleanId(container.publicId || container.containerId || displayName.toLowerCase() || fallbackSessionId || 'container');
    const out = { publicId };
    if (displayName) out.displayName = displayName;
    const publicObjectId = asNonNegativeInteger(container.objectId);
    const bridgedObjectId = asNonNegativeInteger(container.containerObjectId);
    if (publicObjectId != null) out.objectId = publicObjectId;
    else if (bridgedObjectId != null && container.objectIdPublic === true) out.objectId = bridgedObjectId;
    return out;
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
    return item ? {
      ...item,
      location: item.location ? { ...item.location } : item.location,
      known: item.known ? { ...item.known } : item.known,
      actionAffordances: Array.isArray(item.actionAffordances) ? item.actionAffordances.slice() : item.actionAffordances,
      publicActionHints: Array.isArray(item.publicActionHints) ? item.publicActionHints.slice() : item.publicActionHints,
    } : null;
  }
  function normalizePublicContainerItem(item = {}) {
    if (!isPlainObject(item)) return null;
    const displayName = displayNameFromText(item.displayName || item.appearanceName || item.text || item.name, item.selector || item.inventoryLetter);
    if (!displayName) return null;
    const out = { displayName, location: { kind: 'container' } };
    const objectId = asNonNegativeInteger(item.objectId);
    if (objectId != null) out.objectId = objectId;
    const letter = selectorToLetter(item.selector || item.inventoryLetter);
    if (letter) out.inventoryLetter = letter;
    const quantity = quantityFromText(displayName, item.quantity);
    if (quantity != null) out.quantity = quantity;
    const glyph = asNonNegativeInteger(item.glyph);
    if (glyph != null) out.glyph = glyph;
    const glyphChar = asNonNegativeInteger(item.glyphChar);
    if (glyphChar != null) out.glyphChar = glyphChar;
    const objectClass = typeof item.objectClass === 'string' ? item.objectClass : objectClassFromGlyphChar(item.glyphChar);
    if (objectClass) out.objectClass = objectClass;
    if (typeof item.semanticKind === 'string') out.semanticKind = item.semanticKind;
    if (typeof item.semanticKnown === 'boolean') out.semanticKnown = item.semanticKnown;
    if (typeof item.semanticAppearance === 'string') out.semanticAppearance = item.semanticAppearance;
    if ((item.semanticKnown === true || item.known?.identity === true) && typeof item.semanticName === 'string') out.semanticName = item.semanticName;
    const appearanceName = typeof item.appearanceName === 'string' ? item.appearanceName : (typeof item.semanticAppearance === 'string' ? item.semanticAppearance : undefined);
    if (appearanceName) out.appearanceName = appearanceName;
    const known = publicKnownFlags(item, displayName);
    if (known) out.known = known;
    const actionAffordances = cloneStringArray(item.actionAffordances || item.publicActionHints);
    if (actionAffordances) out.actionAffordances = actionAffordances;
    return out;
  }
  function normalizeContainerContentsSnapshotPayload(payload = {}) {
    const sessionId = String(payload.sessionId || '').trim();
    const revision = normalizeRevision(payload.revision);
    const container = normalizeContainerIdentity(payload.container || {}, sessionId);
    const items = Array.isArray(payload.items) ? payload.items.map(normalizePublicContainerItem).filter(Boolean) : [];
    return Object.freeze({ revision, sessionId, container: Object.freeze(container), items: Object.freeze(items.map((item) => Object.freeze(item))) });
  }
  function createContainerContentsSnapshotEvent(payload = {}, options = {}) {
    const snapshot = normalizeContainerContentsSnapshotPayload(payload);
    const sequence = asNonNegativeInteger(options.sequence ?? snapshot.revision) ?? 0;
    return {
      protocol: 'nethack-electron-ui/v2',
      sequence,
      eventId: options.eventId || `evt-container-contents-snapshot-${snapshot.sessionId || 'session'}-${snapshot.revision}`,
      eventType: 'container.contents.snapshot',
      turn: asNonNegativeInteger(options.turn) ?? 0,
      source: options.source || { layer: 'renderer' },
      revision: { container: snapshot.revision },
      payload: {
        revision: snapshot.revision,
        sessionId: snapshot.sessionId,
        container: { ...snapshot.container },
        items: snapshot.items.map(clonePublicItem),
      },
    };
  }
  function createContainerSessionEvent(eventType, session = {}, options = {}) {
    const sessionId = String(session.sessionId || '').trim();
    const container = normalizeContainerIdentity(session.container || {}, sessionId);
    const sequence = asNonNegativeInteger(options.sequence) ?? 0;
    const payload = { sessionId, container };
    if (eventType === 'container.session.closed') payload.reason = String(session.reason || options.reason || '').trim();
    return { protocol: 'nethack-electron-ui/v2', sequence, eventId: options.eventId || `evt-${eventType}-${sessionId || 'session'}-${sequence}`, eventType, turn: asNonNegativeInteger(options.turn) ?? 0, source: options.source || { layer: 'renderer' }, payload };
  }
  function emptyContainerContentsState() {
    return { revision: 0, activeSessionId: undefined, sessionsById: new Map(), activeSessionByContainerId: new Map(), contentsBySessionId: new Map(), lastSnapshotSource: null, lastSnapshotEvent: null, lastRejected: null };
  }
  function cloneSnapshot(snapshot) {
    return snapshot ? { revision: normalizeRevision(snapshot.revision), sessionId: String(snapshot.sessionId || ''), container: normalizeContainerIdentity(snapshot.container || {}, snapshot.sessionId), items: Array.isArray(snapshot.items) ? snapshot.items.map(clonePublicItem) : [] } : null;
  }
  function cloneSession(session) { return session ? { ...session, container: normalizeContainerIdentity(session.container || {}, session.sessionId) } : null; }
  function cloneContainerContentsState(state = emptyContainerContentsState()) {
    return {
      revision: normalizeRevision(state.revision),
      activeSessionId: state.activeSessionId,
      sessionsById: new Map(Array.from(state.sessionsById || []).map(([id, session]) => [id, cloneSession(session)])),
      activeSessionByContainerId: new Map(state.activeSessionByContainerId || []),
      contentsBySessionId: new Map(Array.from(state.contentsBySessionId || []).map(([id, snapshot]) => [id, cloneSnapshot(snapshot)])),
      lastSnapshotSource: state.lastSnapshotSource ? { ...state.lastSnapshotSource } : null,
      lastSnapshotEvent: state.lastSnapshotEvent ? { ...state.lastSnapshotEvent, payload: { ...state.lastSnapshotEvent.payload, container: { ...state.lastSnapshotEvent.payload?.container }, items: (state.lastSnapshotEvent.payload?.items || []).map(clonePublicItem) } } : null,
      lastRejected: state.lastRejected ? JSON.parse(JSON.stringify(state.lastRejected)) : null,
    };
  }
  function rejectState(previous, reason, event = {}) {
    const state = cloneContainerContentsState(previous);
    state.lastRejected = { reason, event: JSON.parse(JSON.stringify(event || {})) };
    return state;
  }
  function openSession(previous = emptyContainerContentsState(), event = {}) {
    const state = cloneContainerContentsState(previous);
    const sessionId = String(event.sessionId || '').trim();
    if (!sessionId) return rejectState(state, 'container session id is required', event);
    const container = normalizeContainerIdentity(event.container || {}, sessionId);
    const activeForContainer = state.activeSessionByContainerId.get(container.publicId);
    if (activeForContainer && activeForContainer !== sessionId) {
      const replaced = state.sessionsById.get(activeForContainer);
      if (replaced?.status === 'active') state.sessionsById.set(activeForContainer, { ...replaced, status: 'replaced', replacedBySessionId: sessionId, closedAtRevision: state.revision + 1 });
    }
    state.revision += 1;
    const session = { ...(state.sessionsById.get(sessionId) || {}), sessionId, status: 'active', container, openedAtRevision: state.revision, closedAtRevision: undefined, closeReason: '' };
    state.sessionsById.set(sessionId, session);
    state.activeSessionByContainerId.set(container.publicId, sessionId);
    state.activeSessionId = sessionId;
    return state;
  }
  function closeSession(previous = emptyContainerContentsState(), event = {}) {
    const state = cloneContainerContentsState(previous);
    const sessionId = String(event.sessionId || state.activeSessionId || '').trim();
    const session = sessionId ? state.sessionsById.get(sessionId) : null;
    if (!session) return rejectState(state, 'container session close did not match a known session', event);
    state.revision += 1;
    const closed = { ...session, status: 'closed', closedAtRevision: state.revision, closeReason: String(event.reason || 'session closed') };
    state.sessionsById.set(sessionId, closed);
    if (state.activeSessionId === sessionId) state.activeSessionId = undefined;
    if (state.activeSessionByContainerId.get(closed.container.publicId) === sessionId) state.activeSessionByContainerId.delete(closed.container.publicId);
    return state;
  }
  function containerContentsAt(state = emptyContainerContentsState(), sessionId = state.activeSessionId) { return cloneSnapshot(state.contentsBySessionId?.get?.(String(sessionId || ''))); }
  function applyContainerContentsSnapshot(previous = emptyContainerContentsState(), payload = {}, options = {}) {
    const snapshot = normalizeContainerContentsSnapshotPayload(payload);
    const session = snapshot.sessionId ? previous.sessionsById?.get?.(snapshot.sessionId) : null;
    if (!snapshot.sessionId) return { state: rejectState(previous, 'container contents snapshot sessionId is required', payload), accepted: false, reason: 'container contents snapshot sessionId is required' };
    if (!session || session.status !== 'active') return { state: rejectState(previous, 'container contents snapshot session is not active', payload), accepted: false, reason: 'container contents snapshot session is not active' };
    if (snapshot.container.publicId !== session.container?.publicId || ((snapshot.container.objectId != null || session.container?.objectId != null) && snapshot.container.objectId !== session.container?.objectId)) return { state: rejectState(previous, 'container contents snapshot container identity does not match session', payload), accepted: false, reason: 'container contents snapshot container identity does not match session' };
    const activeForContainer = previous.activeSessionByContainerId?.get?.(session.container?.publicId || snapshot.container.publicId);
    if (activeForContainer && activeForContainer !== snapshot.sessionId) return { state: rejectState(previous, 'container contents snapshot session was replaced', payload), accepted: false, reason: 'container contents snapshot session was replaced' };
    const existing = previous.contentsBySessionId?.get?.(snapshot.sessionId);
    if (existing && snapshot.revision < normalizeRevision(existing.revision)) return { state: rejectState(previous, `stale container contents snapshot revision ${snapshot.revision} < current ${normalizeRevision(existing.revision)}`, payload), accepted: false, stale: true, currentRevision: normalizeRevision(existing.revision), reason: `stale container contents snapshot revision ${snapshot.revision} < current ${normalizeRevision(existing.revision)}` };
    if (existing && snapshot.revision === normalizeRevision(existing.revision)) {
      const nextComparable = { revision: snapshot.revision, sessionId: snapshot.sessionId, container: normalizeContainerIdentity(snapshot.container, snapshot.sessionId), items: snapshot.items.map(clonePublicItem) };
      const existingComparable = { revision: normalizeRevision(existing.revision), sessionId: String(existing.sessionId || ''), container: normalizeContainerIdentity(existing.container || {}, existing.sessionId), items: (existing.items || []).map(clonePublicItem) };
      if (JSON.stringify(nextComparable) !== JSON.stringify(existingComparable)) return { state: rejectState(previous, `conflicting container contents snapshot revision ${snapshot.revision}`, payload), accepted: false, stale: true, currentRevision: normalizeRevision(existing.revision), reason: `conflicting container contents snapshot revision ${snapshot.revision}` };
      return { state: cloneContainerContentsState(previous), accepted: true, snapshot: cloneSnapshot(existing), previous: cloneSnapshot(existing), duplicate: true };
    }
    const state = cloneContainerContentsState(previous);
    state.revision = Math.max(normalizeRevision(state.revision), snapshot.revision);
    const next = { revision: snapshot.revision, sessionId: snapshot.sessionId, container: normalizeContainerIdentity(snapshot.container || session.container, snapshot.sessionId), items: snapshot.items.map(clonePublicItem) };
    state.contentsBySessionId.set(snapshot.sessionId, next);
    state.lastSnapshotSource = options.source ? { ...options.source } : null;
    state.lastSnapshotEvent = options.event ? { ...options.event, payload: { ...options.event.payload, container: { ...options.event.payload?.container }, items: (options.event.payload?.items || []).map(clonePublicItem) } } : null;
    return { state, accepted: true, snapshot: cloneSnapshot(next), previous: cloneSnapshot(existing) };
  }
  function itemIdentity(item = {}) {
    if (item.objectId != null) return `object:${item.objectId}`;
    const normalized = String(item.displayName || '').toLowerCase()
      .replace(/^\s*\d+\s+/, '')
      .replace(/^\s*(?:a|an|the|some)\s+/, '')
      .replace(/\b(?:blessed|uncursed|cursed)\b/g, ' ')
      .replace(/[^a-z0-9$]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return `name:${normalized || String(item.displayName || '').toLowerCase()}`;
  }
  function publicItemSummary(item = {}) {
    return { objectId: item.objectId, inventoryLetter: item.inventoryLetter || '', displayName: item.displayName || '', quantity: item.quantity, objectClass: item.objectClass || '', semanticKind: item.semanticKind || '', semanticName: item.semanticName || '', semanticAppearance: item.semanticAppearance || '', semanticKnown: item.semanticKnown };
  }
  function changed(a, b) { return JSON.stringify(a) !== JSON.stringify(b); }
  function containerContentsDelta(previousSnapshot, nextSnapshot) {
    const beforeItems = Array.isArray(previousSnapshot?.items) ? previousSnapshot.items : [];
    const afterItems = Array.isArray(nextSnapshot?.items) ? nextSnapshot.items : [];
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
    const updated = [];
    for (const [id, item] of after) {
      if (!before.has(id)) added.push(item);
      else if (changed(before.get(id), item)) updated.push({ before: before.get(id), after: item });
    }
    for (const [id, item] of before) if (!after.has(id)) removed.push(item);
    const changedCount = added.length + removed.length + updated.length;
    return { sessionId: nextSnapshot?.sessionId || previousSnapshot?.sessionId || '', container: normalizeContainerIdentity(nextSnapshot?.container || previousSnapshot?.container || {}, nextSnapshot?.sessionId || previousSnapshot?.sessionId), fromRevision: normalizeRevision(previousSnapshot?.revision), toRevision: normalizeRevision(nextSnapshot?.revision), added, removed, updated, changedCount, publicEvidence: Boolean(nextSnapshot), changed: changedCount > 0 };
  }
  function rowsToContainerItems(rows = []) { return (Array.isArray(rows) ? rows : []).map((row) => normalizePublicContainerItem(row)).filter(Boolean); }

  return Object.freeze({ version, normalizeContainerIdentity, normalizePublicContainerItem, normalizeContainerContentsSnapshotPayload, createContainerContentsSnapshotEvent, createContainerSessionEvent, emptyContainerContentsState, cloneContainerContentsState, cloneSnapshot, openSession, closeSession, applyContainerContentsSnapshot, containerContentsAt, containerContentsDelta, rowsToContainerItems });
}));
