(function initTransferSession(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./transfer-transaction-model'),
      require('./ground-pile-snapshot-adapter'),
      require('./container-contents-snapshot-adapter'),
      require('./inventory-snapshot-adapter'),
    );
  } else {
    root.NetHackTransferSession = factory(
      root.NetHackTransferTransactionModel,
      root.NetHackGroundPileSnapshotAdapter,
      root.NetHackContainerContentsSnapshotAdapter,
      root.NetHackInventorySnapshotAdapter,
    );
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(
  TransferTransactionModel,
  GroundPileSnapshotAdapter,
  ContainerContentsSnapshotAdapter,
  InventorySnapshotAdapter,
) {
  'use strict';

  const version = 'nethack-transfer-session/v1';
  const kinds = Object.freeze({ GROUND: 'ground-pickup', CONTAINER: 'container' });
  const sides = Object.freeze({ LEFT: 'left', RIGHT: 'right' });
  const defaultTimeoutMs = 5000;

  function cleanId(value) {
    return String(value || '').trim().replace(/[^A-Za-z0-9_.:-]+/g, '-');
  }

  function clone(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function freeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    for (const child of Object.values(value)) freeze(child, seen);
    return Object.freeze(value);
  }

  function immutable(value) {
    return freeze(clone(value));
  }

  function selectorLetter(value) {
    if (typeof value === 'string' && value.length === 1) return value;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? String.fromCharCode(numeric) : '';
  }

  function rowName(row = {}) {
    return String(row.displayName || row.semanticName || row.semanticAppearance || row.text || '')
      .replace(/^\s*[A-Za-z$]\s*[-+]\s*/, '')
      .replace(/^\s*(?:an?|the|some|\d+)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function identityText(value = '') {
    return rowName({ text: value }).toLowerCase().replace(/\b(?:uncursed|blessed|cursed)\b/g, ' ').replace(/[^a-z0-9$]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function rowKey(row = {}, side = '') {
    const objectId = Number(row.objectId);
    if (Number.isFinite(objectId) && objectId > 0) return `${side || 'item'}-object-${objectId}`;
    return String(row.syntheticSelector || row.inventoryLetter || selectorLetter(row.selector) || row.id || identityText(rowName(row)) || 'item');
  }

  function normalizeRow(row = {}, side = '') {
    const inventoryLetter = String(row.inventoryLetter || selectorLetter(row.selector) || '').slice(0, 1);
    const objectId = Number(row.objectId);
    const displayName = String(row.displayName || rowName(row) || 'item').trim();
    const selector = String(row.syntheticSelector || (side === 'left' && Number.isFinite(objectId) && objectId > 0 ? `${side === 'left' ? 'source' : 'target'}-object-${objectId}` : inventoryLetter) || row.id || rowKey(row, side));
    return {
      ...clone(row),
      ...(Number.isFinite(objectId) && objectId > 0 ? { objectId } : {}),
      inventoryLetter,
      selector,
      displayName,
      text: String(row.text || `${inventoryLetter ? `${inventoryLetter} - ` : ''}${displayName}`),
      quantity: Math.max(1, Number(row.quantity) || 1),
    };
  }

  function normalizeRows(rows = [], side = '') {
    const normalized = (Array.isArray(rows) ? rows : []).map((row) => normalizeRow(row, side));
    const seen = new Set();
    return normalized.filter((row) => {
      const key = rowKey(row, side);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function protocolRows(rows = [], side = '') {
    return (rows || []).map((row) => ({
      selector: rowKey(row, side),
      text: String(row.text || row.displayName || 'item'),
      displayName: String(row.displayName || rowName(row) || 'item'),
      ...(Number.isFinite(Number(row.objectId)) && Number(row.objectId) > 0 ? { objectId: Number(row.objectId) } : {}),
      quantity: Math.max(1, Number(row.quantity) || 1),
      ...(row.appearanceName ? { appearanceName: String(row.appearanceName) } : {}),
      ...(row.semanticAppearance ? { semanticAppearance: String(row.semanticAppearance) } : {}),
      ...(typeof row.semanticKnown === 'boolean' ? { semanticKnown: row.semanticKnown } : {}),
      ...(row.known && typeof row.known === 'object' ? { known: clone(row.known) } : {}),
    }));
  }

  function cloneMenu(menu) {
    return menu ? { ...clone(menu), items: normalizeRows(menu.items || [], '') } : null;
  }

  function selectableRows(menu) {
    return (menu?.items || []).filter((item) => selectorLetter(item.selector));
  }

  function classifyMenu(menu = {}) {
    if (!menu?.awaitingSelection) return 'none';
    const prompt = String(menu.prompt || '').trim();
    const rowText = (menu.items || []).map((item) => String(item.text || '')).join(' ');
    if (/^Pick(?:\s+\d+)?\s+(?:up\s+)?(?:of\s+)?what\?$/i.test(prompt) || /^Pick\s+up\s+what\?$/i.test(prompt)) return 'ground-pickup';
    if (/\bWhat do you want to drop\?/i.test(prompt)) return 'ground-drop';
    if (/(?:Do what with|is empty\.\s*Do what with)/i.test(prompt) && /(?:look inside|take .* out|put .* in|stash .* into|do nothing|done)/i.test(rowText)) return 'container-action';
    if (/^\s*(?:Take out|Put in) what type of objects\?/i.test(prompt)) return 'container-category';
    if (/^\s*Take out what\?/i.test(prompt)) return 'container-takeout';
    if (/^\s*Put in what\?/i.test(prompt)) return 'container-putin';
    const purpose = String(menu.menuPurpose || menu.purpose || '');
    if ((!prompt || /^Menu$/i.test(prompt)) && selectableRows(menu).length && /^(?:inventory\.|container\.(?:takeOut|putIn)|transfer\.)/.test(purpose)) return purpose.startsWith('inventory.') ? 'inventory-probe' : 'container-items';
    return 'other';
  }

  function directionFor(kind, sourceSide) {
    if (kind === kinds.GROUND) return sourceSide === sides.LEFT ? 'ground-to-inventory' : 'inventory-to-ground';
    return sourceSide === sides.LEFT ? 'container-to-inventory' : 'inventory-to-container';
  }

  function targetSide(sourceSide) {
    return sourceSide === sides.LEFT ? sides.RIGHT : sides.LEFT;
  }

  function initialState() {
    return {
      revision: 0,
      active: false,
      sessionId: '',
      kind: '',
      route: '',
      status: 'closed',
      prompt: '',
      groundCoord: null,
      container: null,
      ownerRequestId: '',
      authoritative: { left: [], right: [] },
      loadedSides: { left: false, right: false },
      loadingSides: { left: false, right: false },
      menus: { action: null, left: null, right: null },
      selection: { left: [], right: [] },
      pending: null,
      queue: [],
      batch: null,
      batchSettlements: [],
      optimistic: [],
      feedback: '',
      rejection: null,
      refresh: null,
      openedAt: 0,
      closedReason: '',
    };
  }

  function presentationRows(state, side) {
    const rows = normalizeRows(state.authoritative[side], side);
    const removed = new Set();
    const added = [];
    for (const move of state.optimistic) {
      if (move.sourceSide === side) removed.add(move.rowKey);
      if (move.targetSide === side && !rows.some((row) => sameIdentity(row, move.row))) added.push({ ...move.row, optimistic: true, pendingTransferId: move.transferId });
    }
    return [...rows.filter((row) => !removed.has(rowKey(row, side))), ...added];
  }

  function publicSnapshot(state) {
    const left = presentationRows(state, sides.LEFT);
    const right = presentationRows(state, sides.RIGHT);
    const owner = state.active ? {
      id: `transfer:${state.sessionId}`,
      sessionId: state.sessionId,
      kind: state.kind,
      requestId: state.ownerRequestId,
      ownsPrompt: Boolean(state.ownerRequestId || state.menus.action || state.menus.left || state.menus.right),
      ownsMenu: Boolean(state.menus.action || state.menus.left || state.menus.right),
      cancellation: { kind: 'transfer-session', sessionId: state.sessionId, action: 'close' },
    } : null;
    return immutable({
      revision: state.revision,
      active: state.active,
      sessionId: state.sessionId,
      kind: state.kind,
      route: state.route,
      status: state.status,
      prompt: state.prompt,
      groundCoord: state.groundCoord,
      container: state.container,
      owner,
      panes: { left, right },
      authoritativePanes: state.authoritative,
      loadedSides: state.loadedSides,
      loadingSides: state.loadingSides,
      selection: state.selection,
      pending: state.pending,
      queuedCount: state.queue.length,
      batch: state.batch,
      feedback: state.feedback,
      rejection: state.rejection,
      refresh: state.refresh,
      closedReason: state.closedReason,
    });
  }

  function sameIdentity(row, candidate) {
    if (Number(row?.objectId) > 0 && Number(candidate?.objectId) > 0) return Number(row.objectId) === Number(candidate.objectId);
    const a = identityText(rowName(row));
    const b = identityText(rowName(candidate));
    return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
  }

  function remapSelector(row, menu) {
    const candidate = selectableRows(menu).find((item) => sameIdentity(row, item));
    return selectorLetter(candidate?.selector);
  }

  function eventMatchesPending(pending, event = {}) {
    if (!pending) return false;
    const transferId = String(event.transferId || event.transactionId || event.actionTransactionId || '').trim();
    const sessionId = String(event.sessionId || '').trim();
    const requestId = String(event.requestId || event.menuRequestId || event.promptId || '').trim();
    if (transferId && transferId !== pending.transferId) return false;
    if (sessionId && sessionId !== pending.sessionId) return false;
    if (pending.route === 'classic' && pending.expectedRequestId && requestId !== pending.expectedRequestId) return false;
    if (event.direction && event.direction !== pending.direction) return false;
    if (Number(event.itemId) > 0 && Number(pending.row.objectId) > 0 && Number(event.itemId) !== Number(pending.row.objectId)) return false;
    return Boolean(transferId || sessionId || requestId || event.direction);
  }

  function createTransferSession(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const timeoutMs = Math.max(100, Number(options.timeoutMs) || defaultTimeoutMs);
    const idPrefix = cleanId(options.idPrefix || 'transfer-session') || 'transfer-session';
    let sequence = 0;
    let state = initialState();

    function touch() {
      state.revision += 1;
    }

    function lifecycle(eventType, payload = {}) {
      return { type: 'publish-transfer-lifecycle', eventType, payload: immutable(payload) };
    }

    function open(event, effects) {
      const kind = event.kind === kinds.GROUND ? kinds.GROUND : kinds.CONTAINER;
      const sessionId = cleanId(event.sessionId) || `${idPrefix}-${++sequence}`;
      const leftRows = normalizeRows(event.leftRows || [], sides.LEFT);
      const rightRows = normalizeRows(event.rightRows || [], sides.RIGHT);
      state = {
        ...initialState(),
        revision: state.revision + 1,
        active: true,
        sessionId,
        kind,
        route: event.route === 'classic' ? 'classic' : 'direct',
        status: event.status || (event.loading ? 'loading' : 'ready'),
        prompt: String(event.prompt || (kind === kinds.GROUND ? 'Pick up from ground' : 'Open container')),
        groundCoord: kind === kinds.GROUND ? { x: Number(event.groundCoord?.x) || 0, y: Number(event.groundCoord?.y) || 0 } : null,
        container: kind === kinds.CONTAINER ? clone(event.container || {}) : null,
        ownerRequestId: String(event.ownerRequestId || ''),
        authoritative: { left: leftRows, right: rightRows },
        loadedSides: { left: event.loadedSides?.left ?? leftRows.length > 0, right: event.loadedSides?.right ?? rightRows.length > 0 },
        loadingSides: { left: Boolean(event.loadingSides?.left), right: Boolean(event.loadingSides?.right) },
        feedback: String(event.feedback || (kind === kinds.GROUND ? 'Select items to move between ground and inventory.' : 'Drag items between container and inventory.')),
        openedAt: now(),
      };
      effects.push(lifecycle('transfer.session.opened', {
        sessionId,
        kind,
        ...(state.groundCoord ? { groundCoord: state.groundCoord } : {}),
        ...(state.container ? { container: state.container } : {}),
        prompt: state.prompt,
        ownerRequestId: state.ownerRequestId,
        leftRows: protocolRows(leftRows, sides.LEFT),
        rightRows: protocolRows(rightRows, sides.RIGHT),
        loadedSides: state.loadedSides,
      }));
    }

    function settleCompletedBatchFeedback() {
      const batch = state.batch;
      if (!batch || state.pending || state.queue.length || batch.completed !== batch.total || state.batchSettlements.length !== batch.total) return false;
      const settled = state.batchSettlements.every((move) => {
        const sourceStillPresent = state.authoritative[move.sourceSide].some((row) => sameIdentity(row, move.row));
        const targetPresent = state.authoritative[move.targetSide].some((row) => sameIdentity(row, move.row));
        return !sourceStillPresent && targetPresent;
      });
      if (!settled) return false;
      state.feedback = `${batch.total} selected ${batch.total === 1 ? 'item' : 'items'} moved.`;
      return true;
    }

    function syncPane(side, rows, options, effects) {
      if (!state.active || !['left', 'right'].includes(side)) return;
      const normalized = normalizeRows(rows, side);
      state.authoritative = { ...state.authoritative, [side]: normalized };
      state.loadedSides = { ...state.loadedSides, [side]: options.loaded !== false };
      state.loadingSides = { ...state.loadingSides, [side]: false };
      if (options.confirmedTransferId) state.optimistic = state.optimistic.filter((move) => move.transferId !== options.confirmedTransferId);
      state.optimistic = state.optimistic.filter((move) => {
        const sourceStillPresent = state.authoritative[move.sourceSide].some((row) => sameIdentity(row, move.row));
        const targetPresent = state.authoritative[move.targetSide].some((row) => sameIdentity(row, move.row));
        // A fresh destination pane that omits the optimistic target resolves
        // that projection immediately. Keeping it would fabricate a row after
        // the authoritative destination proved the object is not there.
        if (side === move.targetSide && !targetPresent) return false;
        return sourceStillPresent || !targetPresent;
      });
      if (!state.pending && state.loadedSides.left && state.loadedSides.right) state.status = 'ready';
      settleCompletedBatchFeedback();
      touch();
      effects.push(lifecycle('transfer.session.updated', {
        sessionId: state.sessionId,
        kind: state.kind,
        leftRows: protocolRows(state.authoritative.left, sides.LEFT),
        rightRows: protocolRows(state.authoritative.right, sides.RIGHT),
        loadedSides: state.loadedSides,
        feedback: state.feedback,
      }));
    }

    function dispatchNext(effects) {
      if (!state.active || state.pending || !state.queue.length) return;
      const queued = state.queue.shift();
      if (state.batch) {
        const selected = new Set(state.selection[queued.sourceSide] || []);
        selected.delete(queued.rowKey);
        state.selection = { ...state.selection, [queued.sourceSide]: Array.from(selected) };
      }
      const sourceRows = presentationRows(state, queued.sourceSide);
      const row = sourceRows.find((candidate) => rowKey(candidate, queued.sourceSide) === queued.rowKey || sameIdentity(candidate, queued.row));
      if (!row) {
        state.rejection = { kind: 'stale-selection', reason: `${rowName(queued.row) || 'Selected item'} is no longer available.` };
        state.feedback = state.rejection.reason;
        state.status = 'rejected';
        touch();
        state.queue = [];
        state.batch = null;
        state.batchSettlements = [];
        return;
      }
      const direction = directionFor(state.kind, queued.sourceSide);
      const transferId = cleanId(queued.transferId) || `${idPrefix}-transfer-${++sequence}`;
      const classicMenu = queued.sourceSide === sides.LEFT ? state.menus.left : state.menus.right;
      const mappedSelector = remapSelector(row, classicMenu);
      const route = state.route === 'classic' || (!Number(row.objectId) && mappedSelector) ? 'classic' : 'direct';
      const expectedRequestId = String(classicMenu?.requestId || classicMenu?.menuRequestId || state.ownerRequestId || '');
      state.pending = {
        transferId,
        sessionId: state.sessionId,
        direction,
        sourceSide: queued.sourceSide,
        targetSide: targetSide(queued.sourceSide),
        row: clone(row),
        rowKey: rowKey(row, queued.sourceSide),
        route,
        expectedRequestId,
        startedAt: now(),
        deadlineAt: now() + timeoutMs,
      };
      state.status = 'waiting-confirmation';
      state.feedback = `Moving ${rowName(row)}; waiting for NetHack confirmation.`;
      touch();
      effects.push(lifecycle('transfer.begun', {
        transferId,
        sessionId: state.sessionId,
        ...(state.groundCoord ? { groundCoord: state.groundCoord } : {}),
        ...(state.container ? { container: state.container } : {}),
        direction,
        sourceSide: queued.sourceSide,
        targetSide: targetSide(queued.sourceSide),
        selector: rowKey(row, queued.sourceSide),
        itemName: rowName(row),
        expectedRequestId,
        beforePanes: { left: protocolRows(state.authoritative.left, sides.LEFT), right: protocolRows(state.authoritative.right, sides.RIGHT) },
      }));
      if (route === 'direct') {
        effects.push({ type: 'dispatch-direct', transferId, sessionId: state.sessionId, direction, row: immutable(row), groundCoord: immutable(state.groundCoord), container: immutable(state.container) });
      } else if (mappedSelector) {
        state.pending.dispatched = true;
        effects.push({ type: 'dispatch-classic', transferId, sessionId: state.sessionId, direction, text: `${mappedSelector}${classicMenu?.how === 2 ? '\n' : ''}`, expectedRequestId });
      } else {
        effects.push({ type: 'request-classic-menu', transferId, sessionId: state.sessionId, direction, sourceSide: queued.sourceSide, row: immutable(row) });
      }
    }

    function dispatchPendingClassic(effects) {
      const pending = state.pending;
      if (!pending || pending.route !== 'classic' || pending.dispatched) return false;
      const menu = pending.sourceSide === sides.LEFT ? state.menus.left : state.menus.right;
      const selector = remapSelector(pending.row, menu);
      if (!selector) return false;
      pending.expectedRequestId = String(menu?.requestId || menu?.menuRequestId || state.ownerRequestId || '');
      pending.dispatched = true;
      touch();
      effects.push({
        type: 'dispatch-classic',
        transferId: pending.transferId,
        sessionId: state.sessionId,
        direction: pending.direction,
        text: `${selector}${menu?.how === 2 ? '\n' : ''}`,
        expectedRequestId: pending.expectedRequestId,
      });
      return true;
    }

    function queueMove(event, effects) {
      if (!state.active || state.pending) {
        if (state.pending) {
          state.feedback = 'Wait for NetHack to confirm the current transfer.';
          touch();
        }
        return;
      }
      const sourceSide = event.sourceSide === sides.RIGHT ? sides.RIGHT : sides.LEFT;
      const rows = presentationRows(state, sourceSide);
      const wanted = String(event.rowKey || event.selector || '');
      const row = rows.find((candidate) => rowKey(candidate, sourceSide) === wanted || String(candidate.selector) === wanted || String(candidate.inventoryLetter) === wanted || Number(candidate.objectId) === Number(event.objectId));
      if (!row) {
        state.rejection = { kind: 'stale-selection', reason: 'The selected item is no longer available.' };
        state.feedback = state.rejection.reason;
        state.status = 'rejected';
        touch();
        return;
      }
      state.batch = null;
      state.batchSettlements = [];
      state.queue.push({ sourceSide, rowKey: rowKey(row, sourceSide), row: clone(row) });
      dispatchNext(effects);
    }

    function submitSelection(event, effects) {
      if (!state.active || state.pending) return;
      const requestedSides = Array.isArray(event.sides) ? event.sides : [sides.LEFT, sides.RIGHT];
      for (const side of requestedSides) {
        const selected = new Set(state.selection[side] || []);
        for (const row of presentationRows(state, side)) {
          const key = rowKey(row, side);
          if (selected.has(key)) state.queue.push({ sourceSide: side, rowKey: key, row: clone(row) });
        }
      }
      if (!state.queue.length) return;
      state.batch = { total: state.queue.length, completed: 0 };
      state.batchSettlements = [];
      touch();
      dispatchNext(effects);
    }

    function finishPending(event, effects, accepted) {
      const pending = state.pending;
      if (!pending || !eventMatchesPending(pending, event)) {
        effects.push({ type: 'ignored-followup', reason: 'transfer follow-up did not match active request/transaction/session', event: immutable(event) });
        return;
      }
      if (!accepted) {
        const reason = String(event.reason || 'NetHack rejected the transfer.');
        state.pending = null;
        state.optimistic = state.optimistic.filter((move) => move.transferId !== pending.transferId);
        state.queue = [];
        state.batch = null;
        state.batchSettlements = [];
        state.status = 'rejected';
        state.rejection = { kind: String(event.failureKind || event.kind || 'rejected'), reason, transferId: pending.transferId };
        state.feedback = reason;
        touch();
        effects.push(lifecycle('transfer.rejected', { transferId: pending.transferId, sessionId: state.sessionId, reason, requestId: event.requestId || event.menuRequestId || '' }));
        return;
      }
      if (pending.route === 'classic' && pending.expectedRequestId) {
        state.menus = { ...state.menus, [pending.sourceSide]: null };
        if (state.ownerRequestId === pending.expectedRequestId) state.ownerRequestId = '';
      }
      state.optimistic.push({ transferId: pending.transferId, sourceSide: pending.sourceSide, targetSide: pending.targetSide, rowKey: pending.rowKey, row: clone(pending.row) });
      if (state.batch) state.batchSettlements.push({ sourceSide: pending.sourceSide, targetSide: pending.targetSide, row: clone(pending.row) });
      state.pending = null;
      const batch = state.batch ? { ...state.batch, completed: state.batch.completed + 1 } : null;
      state.batch = batch;
      state.status = state.queue.length ? 'queueing' : 'ready';
      state.rejection = null;
      state.feedback = state.queue.length
        ? `${rowName(pending.row)} moved; continuing selected items.`
        : batch
          ? `${batch.total} selected ${batch.total === 1 ? 'item' : 'items'} moved. Waiting for refreshed NetHack rows.`
          : `${rowName(pending.row)} moved. Waiting for refreshed NetHack rows.`;
      settleCompletedBatchFeedback();
      touch();
      effects.push(lifecycle('transfer.confirmed', { transferId: pending.transferId, kind: String(event.kind || event.name || 'authoritative-confirmation'), requestId: event.requestId || event.menuRequestId || '', accepted: true }));
      effects.push(lifecycle('transfer.completed', { transferId: pending.transferId, sessionId: state.sessionId, status: 'success', reason: event.reason || 'authoritative transfer confirmation', afterPanes: { left: protocolRows(presentationRows(state, sides.LEFT), sides.LEFT), right: protocolRows(presentationRows(state, sides.RIGHT), sides.RIGHT) } }));
      dispatchNext(effects);
    }

    function close(reason, effects) {
      if (!state.active) return;
      if (state.pending) {
        effects.push(lifecycle('transfer.rejected', { transferId: state.pending.transferId, sessionId: state.sessionId, reason: reason || 'Transfer Session closed.' }));
      }
      const sessionId = state.sessionId;
      effects.push(lifecycle('transfer.session.closed', { sessionId, reason: reason || 'Transfer Session closed.' }));
      state = { ...initialState(), revision: state.revision + 1, closedReason: String(reason || 'Transfer Session closed.') };
    }

    function dispatch(event = {}) {
      const effects = [];
      const type = String(event.type || '');
      if (type === 'reset') state = initialState();
      else if (type === 'open') open(event, effects);
      else if (type === 'pane') syncPane(event.side, event.rows || [], event, effects);
      else if (type === 'inventory') syncPane(sides.RIGHT, event.rows || [], event, effects);
      else if (type === 'menu') {
        const menu = cloneMenu(event.menu);
        const classification = classifyMenu(menu);
        if (classification === 'ground-pickup') {
          if (!state.active || state.kind !== kinds.GROUND) open({ ...event, kind: kinds.GROUND, route: 'classic', prompt: menu.prompt, leftRows: selectableRows(menu), rightRows: event.inventoryRows || [], ownerRequestId: menu.requestId || menu.menuRequestId }, effects);
          state.menus.left = menu;
          state.authoritative.left = normalizeRows(selectableRows(menu), sides.LEFT);
          state.loadedSides.left = true;
          touch();
        } else if (classification === 'ground-drop' && state.active && state.kind === kinds.GROUND) {
          state.menus.right = menu;
          syncPane(sides.RIGHT, event.inventoryRows || selectableRows(menu), { loaded: true }, effects);
        } else if (classification === 'container-action') {
          if (!state.active || state.kind !== kinds.CONTAINER) open({ ...event, kind: kinds.CONTAINER, route: 'classic', prompt: menu.prompt, loading: true, loadedSides: { left: false, right: Boolean((event.inventoryRows || []).length) }, loadingSides: { left: true, right: !(event.inventoryRows || []).length }, rightRows: event.inventoryRows || [], ownerRequestId: menu.requestId || menu.menuRequestId }, effects);
          state.menus.action = menu;
          state.ownerRequestId = String(menu.requestId || menu.menuRequestId || '');
          touch();
        } else if (classification === 'container-takeout' || (classification === 'container-items' && state.loadingSides.left)) {
          state.menus.left = menu;
          syncPane(sides.LEFT, selectableRows(menu), { loaded: true }, effects);
        } else if (classification === 'container-putin' || classification === 'inventory-probe' || (classification === 'container-items' && state.loadingSides.right)) {
          state.menus.right = menu;
          syncPane(sides.RIGHT, event.inventoryRows || selectableRows(menu), { loaded: true }, effects);
        } else if (classification === 'container-category' && state.active) {
          const all = selectableRows(menu).find((row) => /\bAll types\b/i.test(String(row.text || '')));
          if (all) effects.push({ type: 'dispatch-classic', text: `${selectorLetter(all.selector)}\n`, sessionId: state.sessionId, transferId: state.pending?.transferId || '' });
          else finishPending({ transferId: state.pending?.transferId, reason: 'NetHack did not offer an All types category.' }, effects, false);
        } else if (state.active && classification === 'other') {
          effects.push({ type: 'owner-interrupted', reason: 'Another NetHack menu took input ownership.' });
          close('Transfer Session interrupted by another NetHack menu.', effects);
        }
        dispatchPendingClassic(effects);
      } else if (type === 'toggle') {
        if (!state.active || state.pending) return { snapshot: publicSnapshot(state), effects: immutable(effects) };
        const side = event.side === sides.RIGHT ? sides.RIGHT : sides.LEFT;
        const row = presentationRows(state, side).find((candidate) => rowKey(candidate, side) === String(event.rowKey || event.selector || '') || String(candidate.selector) === String(event.selector || ''));
        if (row) {
          const key = rowKey(row, side);
          const selected = new Set(state.selection[side]);
          if (event.selected === false || (event.selected == null && selected.has(key))) selected.delete(key); else selected.add(key);
          state.selection = { ...state.selection, [side]: Array.from(selected) };
          touch();
        }
      } else if (type === 'select-all') {
        const side = event.side === sides.RIGHT ? sides.RIGHT : sides.LEFT;
        if (!state.active || state.pending || !state.loadedSides[side]) return { snapshot: publicSnapshot(state), effects: immutable(effects) };
        const requestedKeys = Array.isArray(event.rowKeys) ? new Set(event.rowKeys.map(String)) : null;
        state.selection = {
          ...state.selection,
          [side]: presentationRows(state, side)
            .map((row) => rowKey(row, side))
            .filter((key) => !requestedKeys || requestedKeys.has(key)),
        };
        touch();
      } else if (type === 'clear-selection') {
        state.selection = { left: [], right: [] };
        touch();
      } else if (type === 'move') queueMove(event, effects);
      else if (type === 'submit') submitSelection(event, effects);
      else if (type === 'cancel') {
        state.queue = [];
        finishPending({ transferId: state.pending?.transferId, sessionId: state.sessionId, reason: String(event.reason || 'Transfer cancelled by player.'), failureKind: 'cancelled' }, effects, false);
      }
      else if (type === 'confirmed') finishPending(event, effects, true);
      else if (type === 'rejected') finishPending(event, effects, false);
      else if (type === 'tick') {
        if (state.pending && now() >= state.pending.deadlineAt) finishPending({ transferId: state.pending.transferId, sessionId: state.sessionId, reason: 'Timed out waiting for the NetHack transfer result.', failureKind: 'timeout' }, effects, false);
      } else if (type === 'load-rejected') {
        if (state.active) {
          const side = event.side === sides.RIGHT ? sides.RIGHT : sides.LEFT;
          state.loadingSides = { ...state.loadingSides, [side]: false };
          state.loadedSides = { ...state.loadedSides, [side]: false };
          state.refresh = null;
          state.status = 'ready';
          state.feedback = String(event.reason || 'NetHack could not load transfer items.');
          touch();
        }
      } else if (type === 'refresh') {
        if (state.active && !state.pending) {
          const side = event.side === sides.RIGHT ? sides.RIGHT : sides.LEFT;
          state.refresh = { side, reason: String(event.reason || 'player requested refresh'), requestedAt: now() };
          state.loadingSides = { ...state.loadingSides, [side]: true };
          state.status = 'loading';
          state.feedback = side === sides.LEFT ? `Refreshing ${state.kind === kinds.GROUND ? 'ground items' : 'container contents'}…` : 'Refreshing inventory…';
          touch();
          effects.push({ type: state.route === 'direct' ? 'refresh-direct' : 'refresh-classic', side, sessionId: state.sessionId, kind: state.kind, container: immutable(state.container), groundCoord: immutable(state.groundCoord) });
        }
      } else if (type === 'interrupt') close(String(event.reason || 'Transfer Session interrupted.'), effects);
      else if (type === 'close') close(String(event.reason || 'Transfer Session closed by player.'), effects);
      return freeze({ snapshot: publicSnapshot(state), effects: immutable(effects) });
    }

    return Object.freeze({
      version,
      dispatch,
      snapshot: () => publicSnapshot(state),
    });
  }

  return Object.freeze({ version, kinds, sides, createTransferSession });
}));
