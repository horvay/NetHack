(function initTransferTransactionModel(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackTransferTransactionModel = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-transfer-transaction-model/v1';
  const directions = new Set(['ground-to-inventory', 'inventory-to-ground', 'container-to-inventory', 'inventory-to-container']);

  function asRevision(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && Number.isSafeInteger(number) ? number : 0;
  }
  function clonePlain(value) {
    if (!value || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }
  function cloneRows(rows = []) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      selector: String(row.selector || row.key || '').trim(),
      text: String(row.text || row.displayName || '').trim(),
      objectId: row.objectId,
      quantity: row.quantity,
    }));
  }
  function cleanSide(value) { return String(value || '').trim() === 'right' ? 'right' : (String(value || '').trim() === 'left' ? 'left' : ''); }
  function cleanPendingSelection(value) {
    if (!value || typeof value !== 'object') return null;
    const action = String(value.action || '').trim();
    if (action !== 'out' && action !== 'in') return null;
    const selector = String(value.selector || '').trim();
    const sourceSide = cleanSide(value.sourceSide);
    if (!selector || !sourceSide) return null;
    const item = value.item && typeof value.item === 'object' ? {
      ...(Number.isInteger(value.item.objectId) ? { objectId: value.item.objectId } : {}),
      ...(value.item.inventoryLetter ? { inventoryLetter: String(value.item.inventoryLetter) } : {}),
      displayName: String(value.item.displayName || 'item'),
      semanticKnown: value.item.semanticKnown === true,
      known: value.item.known && typeof value.item.known === 'object' ? { ...value.item.known } : { identity: value.item.semanticKnown === true, appearance: false },
      ...(value.item.semanticAppearance ? { semanticAppearance: String(value.item.semanticAppearance) } : {}),
    } : undefined;
    return {
      action,
      selector,
      sourceSide,
      targetSide: cleanSide(value.targetSide) || (sourceSide === 'left' ? 'right' : 'left'),
      itemName: String(value.itemName || '').trim(),
      item,
      transferId: String(value.transferId || '').trim(),
      requestId: String(value.requestId || value.expectedRequestId || '').trim(),
      reason: String(value.reason || '').trim(),
      at: asRevision(value.at) || Date.now?.() || 0,
    };
  }
  function cleanRefreshIntent(value) {
    if (!value || typeof value !== 'object') return null;
    const kind = String(value.kind || '').trim();
    if (!kind) return null;
    const intent = {
      kind,
      side: cleanSide(value.side),
      nextSide: cleanSide(value.nextSide),
      transferId: String(value.transferId || '').trim(),
      command: String(value.command || '').slice(0, 32),
      reason: String(value.reason || '').trim(),
      delayMs: asRevision(value.delayMs),
      at: asRevision(value.at) || Date.now?.() || 0,
    };
    if (!intent.side) delete intent.side;
    if (!intent.nextSide) delete intent.nextSide;
    if (!intent.transferId) delete intent.transferId;
    if (!intent.command) delete intent.command;
    if (!intent.reason) delete intent.reason;
    if (!intent.delayMs) delete intent.delayMs;
    return intent;
  }
  function cloneChoreography(value = {}) {
    const out = {
      pendingSelection: cleanPendingSelection(value.pendingSelection),
      autoLoadingSide: cleanSide(value.autoLoadingSide),
      autoNextSide: cleanSide(value.autoNextSide),
      reopenPending: Boolean(value.reopenPending),
      autoInventoryLoadPending: Boolean(value.autoInventoryLoadPending),
      refreshIntent: cleanRefreshIntent(value.refreshIntent),
    };
    if (value.lastTransition && typeof value.lastTransition === 'object') out.lastTransition = clonePlain(value.lastTransition);
    return out;
  }
  function patchChoreography(current = {}, patch = {}, context = {}) {
    const next = cloneChoreography(current);
    if (Object.prototype.hasOwnProperty.call(patch, 'pendingSelection')) next.pendingSelection = cleanPendingSelection(patch.pendingSelection);
    if (patch.clearPendingSelection) next.pendingSelection = null;
    if (Object.prototype.hasOwnProperty.call(patch, 'autoLoadingSide')) next.autoLoadingSide = cleanSide(patch.autoLoadingSide);
    if (Object.prototype.hasOwnProperty.call(patch, 'autoNextSide')) next.autoNextSide = cleanSide(patch.autoNextSide);
    if (Object.prototype.hasOwnProperty.call(patch, 'reopenPending')) next.reopenPending = Boolean(patch.reopenPending);
    if (Object.prototype.hasOwnProperty.call(patch, 'autoInventoryLoadPending')) next.autoInventoryLoadPending = Boolean(patch.autoInventoryLoadPending);
    if (Object.prototype.hasOwnProperty.call(patch, 'refreshIntent')) next.refreshIntent = cleanRefreshIntent(patch.refreshIntent);
    if (patch.clearRefreshIntent) next.refreshIntent = null;
    next.lastTransition = { reason: String(patch.reason || context.reason || '').trim(), at: context.now || Date.now?.() || 0 };
    return next;
  }
  function asPublicObjectId(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && Number.isSafeInteger(number) ? number : undefined;
  }
  function cleanPublicId(value) { return String(value || '').trim().replace(/[^A-Za-z0-9_.:-]+/g, '-') || ''; }
  function normalizeCoord(value) {
    if (!value || typeof value !== 'object') return null;
    const hasX = Object.prototype.hasOwnProperty.call(value, 'x');
    const hasY = Object.prototype.hasOwnProperty.call(value, 'y');
    if (!hasX || !hasY) return null;
    const x = asRevision(value.x);
    const y = asRevision(value.y);
    return { x, y };
  }
  function sameCoord(a, b) { return Boolean(a && b && Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y)); }
  function normalizeContainerIdentity(container = {}, fallback = '') {
    if (!container || typeof container !== 'object') return null;
    const displayName = String(container.displayName || container.name || '').replace(/\s+/g, ' ').trim();
    const publicId = cleanPublicId(container.publicId || container.containerId || (displayName ? displayName.toLowerCase() : '') || fallback);
    if (!publicId && !displayName) return null;
    const out = { publicId: publicId || cleanPublicId(displayName.toLowerCase()) || 'container' };
    if (displayName) out.displayName = displayName;
    const objectId = asPublicObjectId(container.objectId);
    if (objectId != null) out.objectId = objectId;
    return out;
  }
  function sameContainerIdentity(a, b) {
    if (!a || !b) return true;
    if (String(a.publicId || '') !== String(b.publicId || '')) return false;
    if ((a.objectId != null || b.objectId != null) && Number(a.objectId) !== Number(b.objectId)) return false;
    return true;
  }
  function evidenceIdentityForEvent(event = {}, session = {}) {
    const kind = String(event.kind || session.kind || '').trim();
    if (kind === 'ground-pickup') {
      const coord = normalizeCoord(event.groundCoord || event.coord || session.evidenceIdentity?.coord);
      return coord ? { kind, coord } : { kind };
    }
    if (kind === 'container') {
      const container = normalizeContainerIdentity(event.container || session.evidenceIdentity?.container || {}, event.sessionId || session.sessionId || 'container');
      return container ? { kind, container } : { kind };
    }
    return kind ? { kind } : null;
  }
  function normalizeItemText(value) {
    return String(value || '').toLowerCase()
      .replace(/^\s*[a-z$]\s*[-+]\s*/i, ' ')
      .replace(/^\s*\d+\s+/, ' ')
      .replace(/^\s*(?:a|an|the|some)\s+/, ' ')
      .replace(/\b(?:blessed|uncursed|cursed)\b/g, ' ')
      .replace(/[^a-z0-9$]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function itemMatchesTransfer(item = {}, tx = {}) {
    const expected = normalizeItemText(tx.itemName || tx.selector || '');
    if (!expected) return true;
    const actual = normalizeItemText(`${item.displayName || ''} ${item.semanticName || ''} ${item.semanticAppearance || ''}`);
    return Boolean(actual && (actual === expected || actual.includes(expected) || expected.includes(actual)));
  }
  function primaryEvidenceItemsForDirection(delta = {}, direction = '') {
    if (direction === 'ground-to-inventory' || direction === 'container-to-inventory') return Array.isArray(delta.removed) ? delta.removed : [];
    if (direction === 'inventory-to-ground' || direction === 'inventory-to-container') return Array.isArray(delta.added) ? delta.added : [];
    return [];
  }
  function updatedEvidenceItems(delta = {}) {
    return (Array.isArray(delta.updated) ? delta.updated : []).flatMap((entry) => [entry.before, entry.after].filter(Boolean));
  }
  function transferItemEvidenceError(tx = {}, delta = {}, label = 'public evidence delta') {
    if (!delta?.changed) return `${label} has no changed public evidence`;
    const primary = primaryEvidenceItemsForDirection(delta, tx.direction);
    const updated = updatedEvidenceItems(delta);
    const candidates = primary.concat(updated);
    if (!candidates.some((item) => itemMatchesTransfer(item, tx))) return `${label} does not mention the transfer item`;
    const unexpectedPrimary = primary.filter((item) => !itemMatchesTransfer(item, tx));
    if (unexpectedPrimary.length) return `${label} includes unrelated item changes`;
    return '';
  }
  function emptyState() {
    return {
      revision: 0,
      activeSessionId: undefined,
      activeTransferId: undefined,
      sessionsById: new Map(),
      transfersById: new Map(),
      lastCompleted: null,
      lastRejected: null,
    };
  }
  function cloneState(state = emptyState()) {
    return {
      revision: asRevision(state.revision),
      activeSessionId: state.activeSessionId,
      activeTransferId: state.activeTransferId,
      sessionsById: new Map(Array.from(state.sessionsById || []).map(([id, session]) => [id, clonePlain(session)])),
      transfersById: new Map(Array.from(state.transfersById || []).map(([id, tx]) => [id, clonePlain(tx)])),
      lastCompleted: clonePlain(state.lastCompleted),
      lastRejected: clonePlain(state.lastRejected),
    };
  }
  function rowsDelta(before = {}, after = {}) {
    const beforeLeft = cloneRows(before.left);
    const beforeRight = cloneRows(before.right);
    const afterLeft = cloneRows(after.left);
    const afterRight = cloneRows(after.right);
    return {
      before: { left: beforeLeft, right: beforeRight },
      after: { left: afterLeft, right: afterRight },
      changed: JSON.stringify({ left: beforeLeft, right: beforeRight }) !== JSON.stringify({ left: afterLeft, right: afterRight }),
    };
  }
  function generatedId(prefix, revision) { return `${prefix}-${revision || 1}`; }
  function reject(state = emptyState(), event = {}, reason = 'transfer transaction rejected') {
    const next = cloneState(state);
    next.revision += 1;
    const rejection = { revision: next.revision, sessionId: event.sessionId || next.activeSessionId || '', transferId: event.transferId || next.activeTransferId || '', reason, event: clonePlain(event) };
    next.lastRejected = rejection;
    return { state: next, rejected: rejection, effect: { type: 'transfer-transaction-rejected', reason, rejection, event: clonePlain(event) } };
  }
  function openSession(state = emptyState(), event = {}, context = {}) {
    const next = cloneState(state);
    next.revision += 1;
    const sessionId = String(event.sessionId || context.sessionId || next.activeSessionId || generatedId(`${event.kind || 'transfer'}-session`, next.revision)).trim();
    const existing = next.sessionsById.get(sessionId) || {};
    const session = {
      ...existing,
      sessionId,
      kind: String(event.kind || existing.kind || 'container').trim(),
      status: 'active',
      prompt: String(event.prompt || existing.prompt || '').trim(),
      ownerRequestId: String(event.ownerRequestId || event.requestId || existing.ownerRequestId || '').trim(),
      openedAt: existing.openedAt || context.now || Date.now?.() || 0,
      updatedAt: context.now || Date.now?.() || 0,
      panes: {
        left: cloneRows(event.leftRows || existing.panes?.left || []),
        right: cloneRows(event.rightRows || existing.panes?.right || []),
      },
      loadedSides: { ...(existing.loadedSides || {}), ...(event.loadedSides || {}) },
      choreography: cloneChoreography(existing.choreography || event.choreography || {}),
      transactionIds: Array.isArray(existing.transactionIds) ? existing.transactionIds.slice() : [],
    };
    session.evidenceIdentity = evidenceIdentityForEvent(event, session) || existing.evidenceIdentity || null;
    next.sessionsById.set(sessionId, session);
    next.activeSessionId = sessionId;
    return { state: next, session: clonePlain(session), effect: { type: 'transfer-session-opened', session: clonePlain(session) } };
  }
  function updateSession(state = emptyState(), sessionId, patch = {}, context = {}) {
    const id = String(sessionId || state.activeSessionId || '').trim();
    const current = id ? state.sessionsById?.get?.(id) : null;
    if (!current || current.status !== 'active') return reject(state, { sessionId: id, patch }, 'transfer session is not active');
    const next = cloneState(state);
    next.revision += 1;
    const session = { ...next.sessionsById.get(id) };
    if (patch.prompt != null) session.prompt = String(patch.prompt || '').trim();
    if (patch.ownerRequestId != null || patch.requestId != null) session.ownerRequestId = String(patch.ownerRequestId || patch.requestId || '').trim();
    if (patch.leftRows) session.panes = { ...(session.panes || {}), left: cloneRows(patch.leftRows) };
    if (patch.rightRows) session.panes = { ...(session.panes || {}), right: cloneRows(patch.rightRows) };
    if (patch.loadedSides) session.loadedSides = { ...(session.loadedSides || {}), ...patch.loadedSides };
    if (patch.feedback != null) session.feedback = String(patch.feedback || '').trim();
    if (patch.choreography) session.choreography = patchChoreography(session.choreography || {}, patch.choreography, context);
    if (patch.groundCoord || patch.coord || patch.container || patch.kind) session.evidenceIdentity = evidenceIdentityForEvent({ ...patch, kind: patch.kind || session.kind, sessionId: id }, session) || session.evidenceIdentity || null;
    session.updatedAt = context.now || Date.now?.() || 0;
    next.sessionsById.set(id, session);
    return { state: next, session: clonePlain(session), effect: { type: 'transfer-session-updated', session: clonePlain(session) } };
  }
  function updateChoreography(state = emptyState(), sessionId, patch = {}, context = {}) {
    const id = String(sessionId || state.activeSessionId || '').trim();
    const current = id ? state.sessionsById?.get?.(id) : null;
    if (!current || current.status !== 'active') return reject(state, { sessionId: id, ...patch }, 'transfer session is not active');
    const next = cloneState(state);
    next.revision += 1;
    const session = { ...next.sessionsById.get(id) };
    const nextChoreography = patchChoreography(session.choreography || {}, patch, context);
    const pendingTransferId = String(nextChoreography.pendingSelection?.transferId || '').trim();
    if (pendingTransferId) {
      const pendingTransfer = next.transfersById.get(pendingTransferId);
      if (!pendingTransfer || pendingTransfer.status !== 'pending' || String(pendingTransfer.sessionId || '') !== id) return reject(state, { sessionId: id, ...patch }, 'pending transfer selection does not match an active transfer in the session');
    }
    session.choreography = nextChoreography;
    session.updatedAt = context.now || Date.now?.() || 0;
    next.sessionsById.set(id, session);
    next.activeSessionId = id;
    return { state: next, session: clonePlain(session), effect: { type: 'transfer-choreography-updated', session: clonePlain(session), choreography: clonePlain(session.choreography) } };
  }
  function beginTransfer(state = emptyState(), event = {}, context = {}) {
    const sessionId = String(event.sessionId || state.activeSessionId || '').trim();
    const session = sessionId ? state.sessionsById?.get?.(sessionId) : null;
    if (!session || session.status !== 'active') return reject(state, event, 'transfer has no active owner session');
    const direction = String(event.direction || '').trim();
    if (!directions.has(direction)) return reject(state, event, 'transfer direction is invalid');
    const next = cloneState(state);
    next.revision += 1;
    const transferId = String(event.transferId || generatedId(`${direction}-tx`, next.revision)).trim();
    if (next.transfersById.has(transferId)) return reject(state, event, 'transfer id already exists');
    const beforePanes = event.beforePanes || session.panes || {};
    const tx = {
      transferId,
      sessionId,
      revision: next.revision,
      status: 'pending',
      direction,
      sourceSide: String(event.sourceSide || '').trim(),
      targetSide: String(event.targetSide || '').trim(),
      selector: String(event.selector || '').trim(),
      itemName: String(event.itemName || '').trim(),
      expectedRequestId: String(Object.prototype.hasOwnProperty.call(event, 'expectedRequestId') ? event.expectedRequestId : (session.ownerRequestId || '')).trim(),
      evidenceIdentity: evidenceIdentityForEvent({ ...event, kind: session.kind }, session) || session.evidenceIdentity || null,
      startedAt: context.now || Date.now?.() || 0,
      panesBefore: { left: cloneRows(beforePanes.left), right: cloneRows(beforePanes.right) },
      confirmations: [],
    };
    const nextSession = { ...next.sessionsById.get(sessionId), activeTransferId: transferId, transactionIds: Array.from(new Set([...(next.sessionsById.get(sessionId).transactionIds || []), transferId])) };
    next.sessionsById.set(sessionId, nextSession);
    next.transfersById.set(transferId, tx);
    next.activeSessionId = sessionId;
    next.activeTransferId = transferId;
    return { state: next, transfer: clonePlain(tx), effect: { type: 'transfer-transaction-started', transfer: clonePlain(tx) } };
  }
  function noteConfirmation(state = emptyState(), event = {}) {
    const transferId = String(event.transferId || state.activeTransferId || '').trim();
    const current = transferId ? state.transfersById?.get?.(transferId) : null;
    if (!current || current.status !== 'pending') return reject(state, event, 'confirmation did not match a pending transfer');
    const requestId = String(event.requestId || event.menuRequestId || '').trim();
    const expectedRequestId = String(current.expectedRequestId || '').trim();
    if (requestId && expectedRequestId && requestId !== expectedRequestId) return reject(state, { ...event, transferId }, 'confirmation request id does not match transfer');
    const next = cloneState(state);
    next.revision += 1;
    const tx = { ...next.transfersById.get(transferId) };
    tx.confirmations = Array.isArray(tx.confirmations) ? tx.confirmations.slice() : [];
    tx.confirmations.push({ kind: event.kind || event.name || 'confirmation', requestId: event.requestId || event.menuRequestId || '', accepted: event.accepted !== false, at: event.now || Date.now?.() || 0 });
    next.transfersById.set(transferId, tx);
    return { state: next, transfer: clonePlain(tx), effect: { type: 'transfer-transaction-confirmed', transfer: clonePlain(tx), confirmation: clonePlain(tx.confirmations[tx.confirmations.length - 1]) } };
  }
  function completeTransfer(state = emptyState(), event = {}, context = {}) {
    const transferId = String(event.transferId || state.activeTransferId || '').trim();
    const current = transferId ? state.transfersById?.get?.(transferId) : null;
    if (!current) return reject(state, event, 'completion did not match a transfer');
    if (current.status !== 'pending') return reject(state, event, 'transfer already completed');
    if (event.sessionId && String(event.sessionId) !== String(current.sessionId)) return reject(state, { ...event, transferId }, 'completion session id does not match transfer');
    const session = state.sessionsById?.get?.(current.sessionId) || null;
    const afterPanes = context.afterPanes || session?.panes || {};
    const delta = rowsDelta(current.panesBefore, afterPanes);
    let groundPileDelta = context.groundPileDelta ? clonePlain(context.groundPileDelta) : (current.result?.groundPileDelta ? clonePlain(current.result.groundPileDelta) : null);
    let containerContentsDelta = context.containerContentsDelta ? clonePlain(context.containerContentsDelta) : (current.result?.containerContentsDelta ? clonePlain(current.result.containerContentsDelta) : null);
    const groundEvidenceError = groundPileDelta ? validateGroundPileEvidence(state, current, event, groundPileDelta) : '';
    const containerEvidenceError = containerContentsDelta ? validateContainerContentsEvidence(state, current, event, containerContentsDelta) : '';
    if (groundEvidenceError) return reject(state, { ...event, transferId, groundPileDelta }, groundEvidenceError);
    if (containerEvidenceError) return reject(state, { ...event, transferId, containerContentsDelta }, containerEvidenceError);
    const next = cloneState(state);
    next.revision += 1;
    const tx = { ...next.transfersById.get(transferId) };
    tx.status = event.status || (event.accepted === false ? 'failed' : 'success');
    tx.completedAt = context.now || event.now || Date.now?.() || 0;
    tx.result = { status: tx.status, reason: event.reason || '', direction: tx.direction, selector: tx.selector, itemName: tx.itemName, delta: { ...delta, groundPile: groundPileDelta, containerContents: containerContentsDelta, canonicalChanged: Boolean(delta.changed || groundPileDelta?.changed || containerContentsDelta?.changed) }, groundPileDelta, containerContentsDelta, publicEvidence: { groundPile: Boolean(groundPileDelta?.publicEvidence), containerContents: Boolean(containerContentsDelta?.publicEvidence) } };
    next.transfersById.set(transferId, tx);
    const nextSession = next.sessionsById.get(tx.sessionId);
    if (nextSession) {
      nextSession.activeTransferId = undefined;
      nextSession.panes = { left: cloneRows(afterPanes.left), right: cloneRows(afterPanes.right) };
      if (nextSession.choreography?.pendingSelection?.transferId === transferId) nextSession.choreography = patchChoreography(nextSession.choreography, { clearPendingSelection: true }, { reason: 'transfer completed', now: tx.completedAt });
      nextSession.updatedAt = tx.completedAt;
      next.sessionsById.set(tx.sessionId, nextSession);
    }
    if (next.activeTransferId === transferId) next.activeTransferId = undefined;
    next.lastCompleted = clonePlain(tx);
    return { state: next, transfer: clonePlain(tx), effect: { type: 'transfer-transaction-completed', transfer: clonePlain(tx), result: clonePlain(tx.result), delta: clonePlain(delta) } };
  }
  function validateGroundPileEvidence(state = emptyState(), tx = {}, event = {}, groundPileDelta = null) {
    const session = state.sessionsById?.get?.(tx.sessionId) || null;
    if (!/^(?:ground-to-inventory|inventory-to-ground)$/.test(String(tx.direction || ''))) return 'ground pile delta cannot attach to non-ground transfer';
    if (session?.kind && session.kind !== 'ground-pickup') return 'ground pile delta session kind does not match transfer';
    if (event.sessionId && String(event.sessionId) !== String(tx.sessionId)) return 'ground pile delta session id does not match transfer';
    if (!groundPileDelta?.publicEvidence) return 'ground pile delta has no public evidence';
    const stableCoord = tx.evidenceIdentity?.coord || session?.evidenceIdentity?.coord || null;
    const eventCoord = normalizeCoord(event.groundCoord || event.coord);
    const deltaCoord = normalizeCoord(groundPileDelta.coord);
    if (!stableCoord) return 'ground pile delta transfer evidence coordinate is missing';
    if (eventCoord && !sameCoord(stableCoord, eventCoord)) return 'ground pile delta event coordinate does not match transfer evidence identity';
    if (!deltaCoord) return 'ground pile delta coordinate is missing';
    if (!sameCoord(stableCoord, deltaCoord)) return 'ground pile delta coordinate does not match transfer evidence identity';
    return transferItemEvidenceError(tx, groundPileDelta, 'ground pile delta');
  }
  function validateContainerContentsEvidence(state = emptyState(), tx = {}, event = {}, containerContentsDelta = null) {
    const session = state.sessionsById?.get?.(tx.sessionId) || null;
    if (!/^(?:container-to-inventory|inventory-to-container)$/.test(String(tx.direction || ''))) return 'container contents delta cannot attach to non-container transfer';
    if (session?.kind && session.kind !== 'container') return 'container contents delta session kind does not match transfer';
    if (event.sessionId && String(event.sessionId) !== String(tx.sessionId)) return 'container contents delta session id does not match transfer';
    if (!containerContentsDelta?.sessionId) return 'container contents delta session id is missing';
    if (String(containerContentsDelta.sessionId) !== String(tx.sessionId)) return 'container contents delta session id does not match transfer';
    if (!containerContentsDelta?.publicEvidence) return 'container contents delta has no public evidence';
    const stableContainerSource = tx.evidenceIdentity?.container || session?.evidenceIdentity?.container || null;
    const stableContainer = stableContainerSource ? normalizeContainerIdentity(stableContainerSource, tx.sessionId) : null;
    const eventContainer = event.container ? normalizeContainerIdentity(event.container, tx.sessionId) : null;
    const deltaContainer = containerContentsDelta.container ? normalizeContainerIdentity(containerContentsDelta.container, containerContentsDelta.sessionId || tx.sessionId) : null;
    if (!stableContainer) return 'container contents delta transfer evidence container identity is missing';
    if (eventContainer && !sameContainerIdentity(stableContainer, eventContainer)) return 'container contents delta event container identity does not match transfer';
    if (!deltaContainer) return 'container contents delta container identity is missing';
    if (!sameContainerIdentity(stableContainer, deltaContainer)) return 'container contents delta container identity does not match transfer';
    return transferItemEvidenceError(tx, containerContentsDelta, 'container contents delta');
  }
  function attachGroundPileDelta(state = emptyState(), event = {}, groundPileDelta = null) {
    const transferId = String(event.transferId || state.activeTransferId || '').trim();
    const current = transferId ? state.transfersById?.get?.(transferId) : null;
    if (!current) return reject(state, event, 'ground pile delta did not match a transfer');
    if (current.result?.groundPileDelta && !event.replace) {
      return reject(state, event, 'ground pile delta already attached to transfer');
    }
    const evidenceError = validateGroundPileEvidence(state, current, event, groundPileDelta);
    if (evidenceError) return reject(state, { ...event, groundPileDelta }, evidenceError);
    const next = cloneState(state);
    next.revision += 1;
    const tx = { ...next.transfersById.get(transferId) };
    const clonedDelta = clonePlain(groundPileDelta);
    const baseDelta = tx.result?.delta || rowsDelta(tx.panesBefore, tx.panesAfter || {});
    const attachedAfterCompletion = tx.status !== 'pending';
    tx.result = {
      ...(tx.result || { status: tx.status, direction: tx.direction, selector: tx.selector, itemName: tx.itemName }),
      groundPileDelta: clonedDelta,
      publicEvidence: { ...(tx.result?.publicEvidence || {}), groundPile: Boolean(clonedDelta?.publicEvidence) },
      publicEvidenceAttachedAfterCompletion: Boolean((tx.result?.publicEvidenceAttachedAfterCompletion) || attachedAfterCompletion),
      delta: { ...baseDelta, groundPile: clonedDelta, canonicalChanged: Boolean(baseDelta.changed || baseDelta.containerContents?.changed || clonedDelta?.changed), publicEvidenceAttachedAfterCompletion: Boolean(baseDelta.publicEvidenceAttachedAfterCompletion || attachedAfterCompletion), rendererPaneDeltaOnly: Boolean(baseDelta.changed) },
    };
    next.transfersById.set(transferId, tx);
    if (next.lastCompleted?.transferId === transferId) next.lastCompleted = clonePlain(tx);
    return { state: next, transfer: clonePlain(tx), effect: { type: 'transfer-transaction-ground-pile-delta-attached', transfer: clonePlain(tx), groundPileDelta: clonedDelta } };
  }
  function attachContainerContentsDelta(state = emptyState(), event = {}, containerContentsDelta = null) {
    const transferId = String(event.transferId || state.activeTransferId || '').trim();
    const current = transferId ? state.transfersById?.get?.(transferId) : null;
    if (!current) return reject(state, event, 'container contents delta did not match a transfer');
    if (current.result?.containerContentsDelta && !event.replace) return reject(state, event, 'container contents delta already attached to transfer');
    const evidenceError = validateContainerContentsEvidence(state, current, event, containerContentsDelta);
    if (evidenceError) return reject(state, { ...event, containerContentsDelta }, evidenceError);
    const next = cloneState(state);
    next.revision += 1;
    const tx = { ...next.transfersById.get(transferId) };
    const clonedDelta = clonePlain(containerContentsDelta);
    const baseDelta = tx.result?.delta || rowsDelta(tx.panesBefore, tx.panesAfter || {});
    const attachedAfterCompletion = tx.status !== 'pending';
    tx.result = {
      ...(tx.result || { status: tx.status, direction: tx.direction, selector: tx.selector, itemName: tx.itemName }),
      containerContentsDelta: clonedDelta,
      publicEvidence: { ...(tx.result?.publicEvidence || {}), containerContents: Boolean(clonedDelta?.publicEvidence) },
      publicEvidenceAttachedAfterCompletion: Boolean((tx.result?.publicEvidenceAttachedAfterCompletion) || attachedAfterCompletion),
      delta: { ...baseDelta, containerContents: clonedDelta, canonicalChanged: Boolean(baseDelta.changed || baseDelta.groundPile?.changed || clonedDelta?.changed), publicEvidenceAttachedAfterCompletion: Boolean(baseDelta.publicEvidenceAttachedAfterCompletion || attachedAfterCompletion), rendererPaneDeltaOnly: Boolean(baseDelta.changed) },
    };
    next.transfersById.set(transferId, tx);
    if (next.lastCompleted?.transferId === transferId) next.lastCompleted = clonePlain(tx);
    return { state: next, transfer: clonePlain(tx), effect: { type: 'transfer-transaction-container-contents-delta-attached', transfer: clonePlain(tx), containerContentsDelta: clonedDelta } };
  }
  function rejectFollowup(state = emptyState(), event = {}, reason = 'stale transfer follow-up') {
    const transferId = String(event.transferId || state.activeTransferId || '').trim();
    const current = transferId ? state.transfersById?.get?.(transferId) : null;
    const rejected = reject(state, { ...event, transferId }, reason);
    if (!current || current.status !== 'pending') return rejected;
    const next = rejected.state;
    const tx = { ...next.transfersById.get(transferId) };
    tx.status = 'rejected';
    tx.result = { status: 'rejected', reason, direction: tx.direction, selector: tx.selector, itemName: tx.itemName };
    next.transfersById.set(transferId, tx);
    if (next.activeTransferId === transferId) next.activeTransferId = undefined;
    const session = next.sessionsById.get(tx.sessionId);
    if (session) {
      session.activeTransferId = undefined;
      session.feedback = reason;
      if (session.choreography?.pendingSelection?.transferId === transferId) session.choreography = patchChoreography(session.choreography, { clearPendingSelection: true, reopenPending: false, clearRefreshIntent: true }, { reason });
      next.sessionsById.set(tx.sessionId, session);
    }
    return { state: next, rejected: rejected.rejected, transfer: clonePlain(tx), effect: { type: 'transfer-transaction-followup-rejected', reason, transfer: clonePlain(tx), rejection: rejected.rejected } };
  }
  function closeSession(state = emptyState(), event = {}, reason = 'session closed') {
    const sessionId = String(event.sessionId || state.activeSessionId || '').trim();
    const current = sessionId ? state.sessionsById?.get?.(sessionId) : null;
    if (!current) return reject(state, event, 'close did not match a transfer session');
    const next = cloneState(state);
    next.revision += 1;
    const closedAt = event.now || Date.now?.() || 0;
    for (const [transferId, tx] of next.transfersById) {
      if (tx.sessionId !== sessionId || tx.status !== 'pending') continue;
      const cancelled = { ...tx, status: 'cancelled', completedAt: closedAt, result: { status: 'cancelled', reason, direction: tx.direction, selector: tx.selector, itemName: tx.itemName, delta: rowsDelta(tx.panesBefore, current.panes || {}) } };
      next.transfersById.set(transferId, cancelled);
      next.lastCompleted = clonePlain(cancelled);
      if (next.activeTransferId === transferId) next.activeTransferId = undefined;
    }
    const session = { ...next.sessionsById.get(sessionId), status: 'closed', closedAt, closeReason: reason, activeTransferId: undefined, choreography: patchChoreography(next.sessionsById.get(sessionId)?.choreography || {}, { clearPendingSelection: true, autoLoadingSide: '', autoNextSide: '', reopenPending: false, autoInventoryLoadPending: false, clearRefreshIntent: true }, { reason, now: closedAt }) };
    next.sessionsById.set(sessionId, session);
    if (next.activeSessionId === sessionId) next.activeSessionId = undefined;
    if (next.activeTransferId && next.transfersById.get(next.activeTransferId)?.sessionId === sessionId) next.activeTransferId = undefined;
    return { state: next, session: clonePlain(session), effect: { type: 'transfer-session-closed', session: clonePlain(session), reason } };
  }

  return Object.freeze({ version, directions, emptyState, cloneState, cloneRows, rowsDelta, openSession, updateSession, updateChoreography, beginTransfer, noteConfirmation, completeTransfer, attachGroundPileDelta, attachContainerContentsDelta, rejectFollowup, closeSession });
}));
