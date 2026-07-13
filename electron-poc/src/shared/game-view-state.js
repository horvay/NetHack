(function initGameViewState(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shim-protocol'), require('./interaction-model'), require('./menu-metadata-adapter'), require('./inventory-snapshot-adapter'), require('./equipment-snapshot-adapter'), require('./ground-pile-snapshot-adapter'), require('./container-contents-snapshot-adapter'), require('./ui-protocol-v2'), require('./command-transaction-model'), require('./transfer-transaction-model'));
  else root.NetHackGameViewState = factory(root.NetHackShimProtocol, root.NetHackInteractionModel, root.NetHackMenuMetadataAdapter, root.NetHackInventorySnapshotAdapter, root.NetHackEquipmentSnapshotAdapter, root.NetHackGroundPileSnapshotAdapter, root.NetHackContainerContentsSnapshotAdapter, root.NetHackUiProtocolV2, root.NetHackCommandTransactionModel, root.NetHackTransferTransactionModel);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(ShimProtocol, InteractionModel, MenuMetadataAdapter, InventorySnapshotAdapter, EquipmentSnapshotAdapter, GroundPileSnapshotAdapter, ContainerContentsSnapshotAdapter, UiProtocolV2, CommandTransactionModel, TransferTransactionModel) {
  const version = 'nethack-game-view-state/v1';
  const defaultWidth = 80;
  const defaultHeight = 21;
  function makeEmptyMap(width = defaultWidth, height = defaultHeight) { return Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: ' ', assetId: undefined, glyph: undefined }))); }
  function normalizeMapCoord(value, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(max - 1, n)) : 0; }
  function actorBackgroundCell(cell = {}) {
    const objectVisible = Number.isFinite(Number(cell.objectLayerGlyph)) && Number(cell.objectLayerGlyph) >= 0;
    if (objectVisible) {
      return {
        ch: String(cell.objectLayerChar || ' ').slice(0, 1) || ' ',
        glyph: cell.objectLayerGlyph,
        ttychar: typeof cell.objectLayerChar === 'string' ? cell.objectLayerChar.charCodeAt(0) : cell.objectLayerChar,
        semanticKind: cell.objectLayerSemanticKind,
        semanticName: cell.objectLayerSemanticName,
        semanticAppearance: cell.objectLayerSemanticAppearance,
        semanticKnown: cell.objectLayerSemanticKnown,
        actionAffordances: Array.isArray(cell.objectLayerActionAffordances) ? cell.objectLayerActionAffordances.slice() : [],
        backgroundGlyph: cell.backgroundGlyph,
        backgroundChar: cell.backgroundChar,
        backgroundSemanticKind: cell.backgroundSemanticKind,
        backgroundSemanticName: cell.backgroundSemanticName,
        backgroundSemanticKnown: cell.backgroundSemanticKnown,
        backgroundActionAffordances: Array.isArray(cell.backgroundActionAffordances) ? cell.backgroundActionAffordances.slice() : [],
      };
    }
    return {
      ch: String(cell.backgroundChar || ' ').slice(0, 1) || ' ',
      glyph: cell.backgroundGlyph,
      ttychar: typeof cell.backgroundChar === 'string' ? cell.backgroundChar.charCodeAt(0) : cell.backgroundChar,
      semanticKind: cell.backgroundSemanticKind,
      semanticName: cell.backgroundSemanticName,
      semanticKnown: cell.backgroundSemanticKnown,
      actionAffordances: Array.isArray(cell.backgroundActionAffordances) ? cell.backgroundActionAffordances.slice() : [],
    };
  }
  function cloneMenu(menu) {
    if (!menu) return null;
    const publicRows = menu.publicRows ? { ...menu.publicRows, rows: (menu.publicRows.rows || []).map((row) => ({ ...row })) } : undefined;
    return { ...menu, items: Array.isArray(menu.items) ? menu.items.slice() : [], ...(publicRows ? { publicRows } : {}) };
  }
  function applyMenuMetadata(menu, event, context = {}) {
    if (!menu || !MenuMetadataAdapter?.deriveV1MenuMetadata) return menu;
    const metadata = MenuMetadataAdapter.deriveV1MenuMetadata({ ...menu, window: event?.window ?? menu.window }, { how: event?.name === 'shim_select_menu' ? event.how : undefined, selectionModeExplicit: Boolean(event?.selectionMode || menu.selectionModeExplicit), ...context });
    menu.menuId = metadata.menuId;
    menu.requestId = metadata.requestId;
    menu.transactionId = metadata.transactionId;
    menu.menuPurpose = metadata.menuPurpose;
    menu.purpose = metadata.purpose;
    menu.selectionMode = metadata.selectionMode;
    menu.requestSource = metadata.requestSource;
    menu.owner = metadata.owner;
    menu.lifecycle = metadata.lifecycle;
    menu.lifecycleRevision = metadata.lifecycleRevision;
    return menu;
  }
  function applyPromptMetadata(prompt, event, context = {}) {
    if (!prompt || !MenuMetadataAdapter?.deriveV1PromptMetadata) return prompt;
    const metadata = MenuMetadataAdapter.deriveV1PromptMetadata(event || prompt, context);
    return { ...prompt, promptId: metadata.promptId, requestId: metadata.requestId, transactionId: metadata.transactionId, promptType: metadata.promptType, promptPurpose: metadata.promptPurpose, requestSource: metadata.requestSource, owner: metadata.owner, lifecycle: metadata.lifecycle, lifecycleRevision: metadata.lifecycleRevision };
  }
  function isGenericDirectionText(text) { return /\b(?:choose|pick|select|what|which|in what)\b.*\bdirection\b|\bdirection or map target\b/i.test(String(text || '')); }
  function clonePlainPublic(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function mapValue(mapLike, id) {
    const key = String(id || '').trim();
    if (!key || !mapLike) return null;
    if (typeof mapLike.get === 'function') return mapLike.get(key) || null;
    return mapLike[key] || null;
  }
  function mapValues(mapLike) {
    if (!mapLike) return [];
    if (typeof mapLike.values === 'function') return Array.from(mapLike.values());
    return Object.values(mapLike);
  }
  function samePublicCoord(a, b) { return Boolean(a && b && Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y)); }
  function samePublicContainer(a = {}, b = {}) {
    if (!a || !b) return false;
    if (String(a.publicId || '') !== String(b.publicId || '')) return false;
    if ((a.objectId != null || b.objectId != null) && Number(a.objectId) !== Number(b.objectId)) return false;
    return true;
  }
  function sessionMatchesTransferPanelQuery(session = {}, query = {}) {
    const kind = String(query.kind || '').trim();
    if (kind && String(session.kind || '') !== kind) return false;
    if (kind === 'ground-pickup' && query.groundCoord && !samePublicCoord(session.evidenceIdentity?.coord, query.groundCoord)) return false;
    if (kind === 'container' && query.container && session.evidenceIdentity?.container && !samePublicContainer(session.evidenceIdentity.container, query.container)) return false;
    return true;
  }
  function transferPanelPendingEvidence(pending = {}, query = {}, sessionId = '', transferId = '') {
    const kind = String(query.kind || '').trim();
    const candidates = kind === 'ground-pickup'
      ? [['ground-pile', pending?.ground]]
      : kind === 'container'
        ? [['container-contents', pending?.container]]
        : [['ground-pile', pending?.ground], ['container-contents', pending?.container]];
    return candidates.find(([, entry]) => entry && (!sessionId || String(entry.sessionId || '') === String(sessionId)) && (!transferId || String(entry.transferId || '') === String(transferId))) || ['', null];
  }
  function transferPanelCommandState(viewState = {}, query = {}) {
    const transferState = viewState.transferTransactions || viewState || {};
    const pendingState = viewState.pendingTransferEvidence || query.pendingTransferEvidence || {};
    const requestedSessionId = String(query.sessionId || '').trim();
    const requestedTransferId = String(query.transferId || '').trim();
    let session = mapValue(transferState.sessionsById, requestedSessionId) || null;
    if (!session || !sessionMatchesTransferPanelQuery(session, query)) {
      const activeSession = mapValue(transferState.sessionsById, transferState.activeSessionId);
      if (activeSession && activeSession.status === 'active' && sessionMatchesTransferPanelQuery(activeSession, query)) session = activeSession;
    }
    if (!session) {
      session = mapValues(transferState.sessionsById).reverse().find((candidate) => candidate?.status === 'active' && sessionMatchesTransferPanelQuery(candidate, query)) || null;
    }
    const sessionId = String(session?.sessionId || requestedSessionId || transferState.activeSessionId || '').trim();
    const pendingForSession = transferPanelPendingEvidence(pendingState, query, sessionId, '') || ['', null];
    const preferredTransferIds = (query.strictTransferId
      ? [requestedTransferId]
      : [session?.activeTransferId, transferState.activeTransferId, pendingForSession[1]?.transferId, requestedTransferId])
      .map((value) => String(value || '').trim()).filter(Boolean);
    let transfer = null;
    for (const id of preferredTransferIds) {
      const candidate = mapValue(transferState.transfersById, id);
      if (!candidate) continue;
      if (sessionId && String(candidate.sessionId || '') !== sessionId) continue;
      if (candidate.status === 'pending' || query.allowHistorical) {
        transfer = candidate;
        break;
      }
    }
    if (!transfer && !query.strictTransferId && sessionId) {
      transfer = mapValues(transferState.transfersById).reverse().find((candidate) => candidate?.status === 'pending' && String(candidate.sessionId || '') === sessionId) || null;
    }
    const transferId = String(transfer?.transferId || (query.strictTransferId ? requestedTransferId : '')).trim();
    const [pendingEvidenceKind, pendingEvidence] = transferPanelPendingEvidence(pendingState, query, sessionId, transferId);
    return {
      source: viewState.transferTransactions ? 'game-view-state' : 'transfer-transactions',
      sessionId,
      session: clonePlainPublic(session),
      transferId,
      transfer: clonePlainPublic(transfer),
      pendingEvidenceKind,
      pendingEvidence: clonePlainPublic(pendingEvidence),
    };
  }
  function transferPanelRowKey(row = {}) { return String(row.selector || row.key || '').trim(); }
  function cloneTransferPanelRows(rows = []) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      selector: transferPanelRowKey(row),
      text: String(row.text || row.displayName || row.itemName || '').trim(),
      objectId: row.objectId,
      quantity: row.quantity,
    }));
  }
  function transferPanelPanesFromSessionOrFallback(session = null, fallbackPanes = {}) {
    const sessionPanes = session?.panes || {};
    const hasSessionLeft = Array.isArray(sessionPanes.left);
    const hasSessionRight = Array.isArray(sessionPanes.right);
    const left = cloneTransferPanelRows(hasSessionLeft ? sessionPanes.left : fallbackPanes.left);
    const right = cloneTransferPanelRows(hasSessionRight ? sessionPanes.right : fallbackPanes.right);
    const source = (hasSessionLeft || hasSessionRight) ? 'shared-session-panes' : 'fallback-panes';
    return { source, left, right };
  }
  function transferPanelMoveFeedback(kind, direction, itemName, options = {}) {
    const name = String(itemName || 'that item').trim() || 'that item';
    if (kind === 'ground-pickup') {
      if (direction === 'inventory-to-ground') return `Dropping ${name}. The panes were updated from shared transfer state and will refresh from NetHack if it interrupts.`;
      return `Picking up ${name}. The panes were updated from shared transfer state; the ground pane will refresh by re-sending comma unless NetHack interrupts.`;
    }
    return `${direction === 'container-to-inventory' ? 'Taking out' : 'Putting in'} ${name}; panes updated from shared transfer state while NetHack confirms the transfer.`;
  }
  function transferPanelChoreographyState(viewState = {}, query = {}) {
    const commandState = transferPanelCommandState(viewState, query);
    const choreography = commandState.session?.choreography || query.fallbackChoreography || {};
    const pendingSelection = choreography.pendingSelection ? clonePlainPublic(choreography.pendingSelection) : (query.fallbackPendingSelection ? clonePlainPublic(query.fallbackPendingSelection) : null);
    const refreshIntent = choreography.refreshIntent ? clonePlainPublic(choreography.refreshIntent) : (query.fallbackRefreshIntent ? clonePlainPublic(query.fallbackRefreshIntent) : null);
    return {
      source: commandState.session?.choreography ? 'shared-session-choreography' : 'fallback-choreography',
      commandState,
      sessionId: commandState.sessionId,
      pendingSelection,
      autoLoadingSide: String(choreography.autoLoadingSide || query.fallbackChoreography?.autoLoadingSide || '').trim(),
      autoNextSide: String(choreography.autoNextSide || query.fallbackChoreography?.autoNextSide || '').trim(),
      reopenPending: Boolean(choreography.reopenPending ?? query.fallbackChoreography?.reopenPending),
      autoInventoryLoadPending: Boolean(choreography.autoInventoryLoadPending ?? query.fallbackChoreography?.autoInventoryLoadPending),
      refreshIntent,
      lastTransition: choreography.lastTransition ? clonePlainPublic(choreography.lastTransition) : null,
    };
  }
  function transferPanelOptimisticMoveState(viewState = {}, query = {}) {
    const kind = String(query.kind || '').trim() || 'container';
    const sourceSide = String(query.sourceSide || '').trim() === 'right' ? 'right' : 'left';
    const targetSide = sourceSide === 'left' ? 'right' : 'left';
    const selector = String(query.selector || '').trim();
    const commandState = transferPanelCommandState(viewState, query);
    const panesBefore = transferPanelPanesFromSessionOrFallback(commandState.session, query.fallbackPanes || {});
    const sourceRows = panesBefore[sourceSide] || [];
    const targetRows = panesBefore[targetSide] || [];
    const index = sourceRows.findIndex((row) => transferPanelRowKey(row) === selector);
    const fallbackRow = query.fallbackRow ? cloneTransferPanelRows([query.fallbackRow])[0] : null;
    const movedRow = index >= 0 ? sourceRows[index] : fallbackRow;
    if (!selector) return { ok: false, reason: 'missing selector', commandState, sourceSide, targetSide, panesBefore: { left: panesBefore.left, right: panesBefore.right }, panesAfter: { left: panesBefore.left, right: panesBefore.right } };
    if (!movedRow) return { ok: false, reason: 'selector not found in shared transfer panes or fallback row', commandState, sourceSide, targetSide, panesBefore: { left: panesBefore.left, right: panesBefore.right }, panesAfter: { left: panesBefore.left, right: panesBefore.right } };
    const nextSource = index >= 0 ? sourceRows.filter((_, rowIndex) => rowIndex !== index) : sourceRows.slice();
    const movedKey = transferPanelRowKey(movedRow);
    const nextTarget = targetRows.concat([{ ...movedRow }]);
    const panesAfter = sourceSide === 'left' ? { left: nextSource, right: nextTarget } : { left: nextTarget, right: nextSource };
    const direction = kind === 'ground-pickup'
      ? (sourceSide === 'left' ? 'ground-to-inventory' : 'inventory-to-ground')
      : (sourceSide === 'left' ? 'container-to-inventory' : 'inventory-to-container');
    const itemName = String(query.itemName || movedRow.text || movedRow.displayName || selector).trim();
    const sessionPatch = {
      sessionId: commandState.sessionId || query.sessionId || '',
      kind,
      leftRows: panesAfter.left,
      rightRows: panesAfter.right,
      loadedSides: query.loadedSides || commandState.session?.loadedSides || undefined,
      feedback: transferPanelMoveFeedback(kind, direction, itemName, query),
    };
    return {
      ok: true,
      source: panesBefore.source,
      commandState,
      sessionId: sessionPatch.sessionId,
      transferId: commandState.transferId || String(query.transferId || '').trim(),
      direction,
      sourceSide,
      targetSide,
      selector,
      itemName,
      movedRow: clonePlainPublic(movedRow),
      panesBefore: { left: panesBefore.left, right: panesBefore.right },
      panesAfter,
      sessionPatch,
      refreshPlan: {
        reopenPending: kind === 'container' || direction === 'ground-to-inventory',
        dropPending: direction === 'inventory-to-ground',
        keepOpenThroughRefresh: kind === 'container',
        feedback: sessionPatch.feedback,
      },
    };
  }
  function explicitRequestId(event = {}) { return String(event.requestId || event.menuRequestId || event.promptId || '').trim(); }
  function explicitLifecycleRevision(event = {}) { const n = Number(event.lifecycleRevision); return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined; }
  function createGameViewState(options = {}) {
    const width = Number(options.mapWidth) || defaultWidth;
    const height = Number(options.mapHeight) || defaultHeight;
    const state = {
      mapWidth: width,
      mapHeight: height,
      mapWindowId: undefined,
      windowTypes: new Map(),
      statusLabels: new Map(),
      statusValues: new Map(),
      mapCells: makeEmptyMap(width, height),
      mapRevision: 0,
      actorPositions: new Map(),
      cursor: { x: 0, y: 0, window: undefined },
      menusByWindow: new Map(),
      textWindowsByWindow: new Map(),
      currentMenu: null,
      activePrompt: null,
      extCommandCatalog: [],
      cachedInventoryChoices: [],
      inventory: InventorySnapshotAdapter?.emptyInventoryState ? InventorySnapshotAdapter.emptyInventoryState() : { revision: 0, itemsByObjectId: new Map(), itemsByLetter: new Map(), orderedItems: [], lastSnapshotSource: null, lastSnapshotEvent: null },
      equipment: EquipmentSnapshotAdapter?.emptyEquipmentState ? EquipmentSnapshotAdapter.emptyEquipmentState() : { revision: 0, inventoryRevision: 0, slotsById: new Map(), objectToSlots: new Map(), orderedSlots: [], lastSnapshotSource: null, lastSnapshotEvent: null },
      groundPiles: GroundPileSnapshotAdapter?.emptyGroundPileState ? GroundPileSnapshotAdapter.emptyGroundPileState() : { revision: 0, pilesByCoord: new Map(), lastSnapshotSource: null, lastSnapshotEvent: null },
      containerContents: ContainerContentsSnapshotAdapter?.emptyContainerContentsState ? ContainerContentsSnapshotAdapter.emptyContainerContentsState() : { revision: 0, activeSessionId: undefined, sessionsById: new Map(), contentsBySessionId: new Map(), lastSnapshotSource: null, lastSnapshotEvent: null },
      messages: [],
      documentWindow: null,
      milestones: [],
      pendingMenuSelections: new Map(),
      menuLifecyclesByWindow: new Map(),
      activeInteractionRevision: 0,
      interactionLifecycleRevision: 0,
      commandTransactionRevision: 0,
      activeTransactionId: undefined,
      commandTransactions: CommandTransactionModel?.emptyState ? CommandTransactionModel.emptyState() : { revision: 0, activeId: undefined, byId: new Map(), lastCompleted: null, lastRejected: null },
      commandProtocolAcks: [],
      lastCommandProtocolAck: null,
      lastCommandProtocolRejection: null,
      spellRows: null,
      skillRows: null,
      magicRowEventIds: new Set(),
      magicRowEventOrder: [],
      magicFallbackRevision: 0,
      transferTransactions: TransferTransactionModel?.emptyState ? TransferTransactionModel.emptyState() : { revision: 0, activeSessionId: undefined, activeTransferId: undefined, sessionsById: new Map(), transfersById: new Map(), lastCompleted: null, lastRejected: null },
      pendingTransferEvidence: { ground: null, container: null, lastIgnored: null },
      commandTransactionAliases: new Map(),
      mapClearPending: false,
      mapRefreshPendingDisplay: false,
      lastWorldCommand: '',
      protocolSequence: 0,
    };
    function effect(type, payload = {}) { return { type, ...payload }; }
    function recordMilestone(type, data) { state.milestones.push({ type, data }); return effect('record-milestone', { milestone: { type, data } }); }
    function nextLifecycleRevision(event) {
      const explicit = explicitLifecycleRevision(event);
      if (explicit != null) {
        state.interactionLifecycleRevision = Math.max(state.interactionLifecycleRevision, explicit);
        state.activeInteractionRevision = Math.max(state.activeInteractionRevision, explicit);
        return explicit;
      }
      state.interactionLifecycleRevision += 1;
      state.activeInteractionRevision = state.interactionLifecycleRevision;
      return state.interactionLifecycleRevision;
    }
    function commandTransactionIdForKey(keycode) {
      const key = Number(keycode) > 0 && Number(keycode) < 127 ? String.fromCharCode(Number(keycode)) : 'key';
      state.commandTransactionRevision += 1;
      return `v1-command-${state.commandTransactionRevision}-${key.replace(/[^A-Za-z0-9_.:-]+/g, '-') || 'key'}`;
    }
    function eventIsStaleByRevision(event) {
      const revision = explicitLifecycleRevision(event);
      return revision != null && state.activeInteractionRevision > 0 && revision < state.activeInteractionRevision;
    }
    function staleEffect(kind, event, reason) { return effect(`${kind}-event-rejected`, { reason, event: { ...event } }); }
    function beginMenuLifecycle(event) {
      const revision = nextLifecycleRevision(event);
      const requestId = explicitRequestId(event) || `v1-menu-${event.window}-r${revision}`;
      const transactionId = String(event.transactionId || state.activeTransactionId || `v1-transaction-${requestId}`).trim();
      const lifecycle = { kind: 'menu', window: event.window, revision, lifecycleRevision: revision, menuId: event.menuId || requestId, requestId, menuRequestId: event.menuRequestId || requestId, transactionId, lifecycle: event.lifecycle || '' };
      state.menuLifecyclesByWindow.set(event.window, lifecycle);
      return lifecycle;
    }
    function ensureMenuLifecycle(event) {
      const current = state.menuLifecyclesByWindow.get(event.window);
      const requestId = explicitRequestId(event);
      if (current && requestId && requestId !== current.requestId) return { stale: true, current };
      if (current) return current;
      return beginMenuLifecycle(event);
    }
    function assignMenuLifecycle(menu, lifecycle) {
      if (!menu || !lifecycle) return menu;
      menu.lifecycleRevision = lifecycle.lifecycleRevision;
      menu.menuId = menu.menuId || lifecycle.menuId || lifecycle.requestId;
      menu.requestId = menu.requestId || lifecycle.requestId;
      menu.menuRequestId = menu.menuRequestId || lifecycle.menuRequestId || lifecycle.requestId;
      menu.transactionId = menu.transactionId || lifecycle.transactionId;
      menu.lifecycle = menu.lifecycle || lifecycle.lifecycle;
      return menu;
    }
    function promptLifecycleContext(event) {
      const revision = nextLifecycleRevision(event);
      const requestId = explicitRequestId(event) || `v1-prompt-r${revision}`;
      const transactionId = String(event.transactionId || state.activeTransactionId || `v1-transaction-${requestId}`).trim();
      return { lifecycleRevision: revision, requestId, promptId: event.promptId || requestId, transactionId };
    }
    function noteCommandInteraction(kind, event, extra = {}) {
      if (!CommandTransactionModel?.noteInteraction) return;
      const eventTransactionId = String(event?.transactionId || '').trim();
      const transactionId = state.commandTransactionAliases.get(eventTransactionId) || eventTransactionId || state.activeTransactionId;
      if (!transactionId) return;
      const next = CommandTransactionModel.noteInteraction(state.commandTransactions, transactionId, { kind, requestId: explicitRequestId(event), window: event?.window, lifecycleRevision: explicitLifecycleRevision(event), query: event?.query, choices: event?.choices, promptPurpose: event?.promptPurpose, menuPurpose: event?.menuPurpose, guiAction: event?.guiAction, ...extra });
      state.commandTransactions = next.state;
      if (next.transaction) state.activeTransactionId = next.transaction.transactionId;
    }
    function rejectCommandFollowup(event, reason, effects) {
      if (!CommandTransactionModel?.rejectFollowup) return;
      const transactionId = event?.transactionId || state.activeTransactionId || state.commandTransactions?.activeId;
      if (!transactionId) return;
      const rejected = CommandTransactionModel.rejectFollowup(state.commandTransactions, transactionId, event, reason);
      state.commandTransactions = rejected.state;
      if (rejected.effect) effects.push(rejected.effect);
    }
    function cloneCommandTransactionState() { return CommandTransactionModel?.cloneState ? CommandTransactionModel.cloneState(state.commandTransactions) : { ...state.commandTransactions, byId: new Map(state.commandTransactions?.byId || []) }; }
    function cloneTransferTransactionState() { return TransferTransactionModel?.cloneState ? TransferTransactionModel.cloneState(state.transferTransactions) : { ...state.transferTransactions, sessionsById: new Map(state.transferTransactions?.sessionsById || []), transfersById: new Map(state.transferTransactions?.transfersById || []) }; }
    function cloneMagicRows(snapshot) { return snapshot ? { ...snapshot, rows: (snapshot.rows || []).map((row) => ({ ...row })) } : null; }
    function clonePlain(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function clonePendingTransferEvidenceEntry(entry) { return entry ? clonePlain(entry) : null; }
    function clonePendingTransferEvidenceState() { return { ground: clonePendingTransferEvidenceEntry(state.pendingTransferEvidence?.ground), container: clonePendingTransferEvidenceEntry(state.pendingTransferEvidence?.container), lastIgnored: clonePendingTransferEvidenceEntry(state.pendingTransferEvidence?.lastIgnored) }; }
    function cloneGroundPileState() { return GroundPileSnapshotAdapter?.cloneGroundPileState ? GroundPileSnapshotAdapter.cloneGroundPileState(state.groundPiles) : { ...state.groundPiles, pilesByCoord: new Map(state.groundPiles?.pilesByCoord || []) }; }
    function cloneContainerContentsState() { return ContainerContentsSnapshotAdapter?.cloneContainerContentsState ? ContainerContentsSnapshotAdapter.cloneContainerContentsState(state.containerContents) : { ...state.containerContents, sessionsById: new Map(state.containerContents?.sessionsById || []), contentsBySessionId: new Map(state.containerContents?.contentsBySessionId || []) }; }
    function aliasBridgeTransactionToActive(event) {
      const alias = String(event?.transactionId || '').trim();
      const active = String(state.activeTransactionId || '').trim();
      if (alias && active && alias !== active) state.commandTransactionAliases.set(alias, active);
    }
    function keyAnswersActiveInteraction(key) {
      if (!key) return false;
      if (key === '\u001b' || key === '\n' || key === '\r' || key === ' ') return Boolean(state.activePrompt || state.currentMenu?.awaitingSelection);
      if (state.activePrompt?.choices && String(state.activePrompt.choices).includes(key)) return true;
      if (state.currentMenu?.awaitingSelection) {
        return (state.currentMenu.items || []).some((item) => Number(item.selector) === key.charCodeAt(0));
      }
      return false;
    }
    function activeNonInventoryTransaction() {
      const tx = state.activeTransactionId ? state.commandTransactions?.byId?.get?.(state.activeTransactionId) : null;
      if (!tx || tx.status !== 'pending') return null;
      return tx.semanticAction === 'inventory overview' ? null : tx;
    }
    function publicGroundRevision() { return (state.groundPiles?.revision || 0) + 1; }
    function applyGroundPileSnapshotPayload(payload, source = { layer: 'renderer' }, eventEnvelope = null) {
      if (!GroundPileSnapshotAdapter?.normalizeGroundPileSnapshotPayload || !GroundPileSnapshotAdapter?.applyGroundPileSnapshot) return { accepted: false, effect: effect('ground-pile-snapshot-rejected', { errors: ['ground pile adapter unavailable'] }) };
      let snapshot = GroundPileSnapshotAdapter.normalizeGroundPileSnapshotPayload(payload);
      const previousPile = GroundPileSnapshotAdapter.groundPileAt ? GroundPileSnapshotAdapter.groundPileAt(state.groundPiles, snapshot.coord) : null;
      const currentPile = GroundPileSnapshotAdapter.groundPileAt ? GroundPileSnapshotAdapter.groundPileAt(state.groundPiles, snapshot.coord) : null;
      const authoritativeSource = source?.authoritative === true || source?.event === 'shim_ground_pile_snapshot';
      const authoritativeRevision = authoritativeSource ? Number(snapshot.revision || 0) : undefined;
      const currentAuthoritativeRevision = currentPile?.authoritativeRevision;
      if (authoritativeSource && currentPile && currentAuthoritativeRevision != null && authoritativeRevision <= Number(currentAuthoritativeRevision)) {
        return { accepted: false, effect: effect('ground-pile-snapshot-rejected', { stale: true, authoritative: true, revision: authoritativeRevision, authoritativeRevision, currentRevision: Number(currentPile.revision || 0), currentAuthoritativeRevision: Number(currentAuthoritativeRevision), coord: { ...snapshot.coord }, errors: [`stale authoritative ground pile snapshot revision ${authoritativeRevision} <= current authoritative ${Number(currentAuthoritativeRevision)}`] }) };
      }
      // Authoritative shim revisions and renderer-observation revisions are
      // independent clocks. A newer native snapshot must supersede prose/map
      // evidence without pretending an older native revision became newer;
      // retain the native clock separately and allocate a monotonic public one.
      if (authoritativeSource && currentPile && snapshot.revision <= Number(currentPile.revision || 0)) {
        snapshot = GroundPileSnapshotAdapter.normalizeGroundPileSnapshotPayload({ ...payload, revision: Math.max(Number(state.groundPiles?.revision || 0), Number(currentPile.revision || 0)) + 1 });
      }
      if (currentPile && snapshot.revision < Number(currentPile.revision || 0)) {
        return { accepted: false, effect: effect('ground-pile-snapshot-rejected', { stale: true, revision: snapshot.revision, currentRevision: Number(currentPile.revision || 0), coord: { ...snapshot.coord }, errors: [`stale ground pile snapshot revision ${snapshot.revision} < current ${Number(currentPile.revision || 0)}`] }) };
      }
      if (currentPile && snapshot.revision === Number(currentPile.revision || 0)) {
        const nextComparable = { revision: snapshot.revision, coord: { ...snapshot.coord }, items: snapshot.items.map((item) => ({ ...item })) };
        const currentComparable = { revision: Number(currentPile.revision || 0), coord: { ...(currentPile.coord || {}) }, items: (currentPile.items || []).map((item) => ({ ...item })) };
        if (JSON.stringify(nextComparable) !== JSON.stringify(currentComparable)) return { accepted: false, effect: effect('ground-pile-snapshot-rejected', { stale: true, revision: snapshot.revision, currentRevision: Number(currentPile.revision || 0), coord: { ...snapshot.coord }, errors: [`conflicting ground pile snapshot revision ${snapshot.revision}`] }) };
      }
      const event = eventEnvelope || (GroundPileSnapshotAdapter.createGroundPileSnapshotEvent ? GroundPileSnapshotAdapter.createGroundPileSnapshotEvent(snapshot, { sequence: ++state.protocolSequence, source }) : null);
      const checked = event && UiProtocolV2?.validateEventEnvelope ? UiProtocolV2.validateEventEnvelope(event) : { ok: true, errors: [] };
      if (!checked.ok) return { accepted: false, effect: effect('ground-pile-snapshot-rejected', { errors: checked.errors.slice(), coord: { ...snapshot.coord }, revision: snapshot.revision }) };
      state.groundPiles = GroundPileSnapshotAdapter.applyGroundPileSnapshot(state.groundPiles, snapshot, { source, event, ...(authoritativeSource ? { authoritativeRevision } : {}) });
      const nextPile = GroundPileSnapshotAdapter.groundPileAt ? GroundPileSnapshotAdapter.groundPileAt(state.groundPiles, snapshot.coord) : null;
      const delta = GroundPileSnapshotAdapter.groundPileDelta ? GroundPileSnapshotAdapter.groundPileDelta(previousPile, nextPile) : null;
      return { accepted: true, snapshot: nextPile, delta, effect: effect('ground-pile-snapshot', { groundPiles: cloneGroundPileState(), snapshot: nextPile, event, delta }) };
    }
    function publicGroundItemFromObjectLayer(event, coord) {
      if (!GroundPileSnapshotAdapter?.groundObjectLayerEventToPublicItem) return null;
      return GroundPileSnapshotAdapter.groundObjectLayerEventToPublicItem(event, coord);
    }
    function applyContainerSessionEvent(eventEnvelope) {
      if (!ContainerContentsSnapshotAdapter) return effect('container-contents-snapshot-rejected', { errors: ['container contents adapter unavailable'] });
      if (eventEnvelope.eventType === 'container.session.opened') {
        state.containerContents = ContainerContentsSnapshotAdapter.openSession(state.containerContents, eventEnvelope.payload || {});
        return effect('container-session-opened', { containerContents: cloneContainerContentsState(), session: state.containerContents.sessionsById?.get?.(eventEnvelope.payload?.sessionId), event: eventEnvelope });
      }
      state.containerContents = ContainerContentsSnapshotAdapter.closeSession(state.containerContents, eventEnvelope.payload || {});
      const closed = effect('container-session-closed', { containerContents: cloneContainerContentsState(), sessionId: eventEnvelope.payload?.sessionId || '', event: eventEnvelope });
      return [closed, ...clearPendingEvidenceForTransfer(state.pendingTransferEvidence?.container?.sessionId === (eventEnvelope.payload?.sessionId || '') ? state.pendingTransferEvidence.container.transferId : '', eventEnvelope.payload?.reason || 'container session closed')];
    }
    function applyContainerContentsSnapshotPayload(payload, source = { layer: 'renderer' }, eventEnvelope = null) {
      if (!ContainerContentsSnapshotAdapter?.normalizeContainerContentsSnapshotPayload || !ContainerContentsSnapshotAdapter?.applyContainerContentsSnapshot) return { accepted: false, effect: effect('container-contents-snapshot-rejected', { errors: ['container contents adapter unavailable'] }) };
      const snapshot = ContainerContentsSnapshotAdapter.normalizeContainerContentsSnapshotPayload(payload);
      const event = eventEnvelope || (ContainerContentsSnapshotAdapter.createContainerContentsSnapshotEvent ? ContainerContentsSnapshotAdapter.createContainerContentsSnapshotEvent(snapshot, { sequence: ++state.protocolSequence, source }) : null);
      const checked = event && UiProtocolV2?.validateEventEnvelope ? UiProtocolV2.validateEventEnvelope(event) : { ok: true, errors: [] };
      if (!checked.ok) return { accepted: false, effect: effect('container-contents-snapshot-rejected', { errors: checked.errors.slice(), sessionId: snapshot.sessionId, revision: snapshot.revision }) };
      const applied = ContainerContentsSnapshotAdapter.applyContainerContentsSnapshot(state.containerContents, snapshot, { source, event });
      state.containerContents = applied.state;
      if (!applied.accepted) return { accepted: false, effect: effect('container-contents-snapshot-rejected', { stale: Boolean(applied.stale), reason: applied.reason, revision: snapshot.revision, currentRevision: applied.currentRevision, sessionId: snapshot.sessionId, errors: [applied.reason] }) };
      const delta = ContainerContentsSnapshotAdapter.containerContentsDelta ? ContainerContentsSnapshotAdapter.containerContentsDelta(applied.previous, applied.snapshot) : null;
      return { accepted: true, snapshot: applied.snapshot, delta, effect: effect('container-contents-snapshot', { containerContents: cloneContainerContentsState(), snapshot: applied.snapshot, event, delta }) };
    }
    function transferEffectFromModelResult(result, eventEnvelope) {
      if (!result || !result.state) return effect('transfer-transaction-rejected', { reason: 'transfer transaction model unavailable', event: eventEnvelope, pendingTransferEvidence: clonePendingTransferEvidenceState() });
      state.transferTransactions = result.state;
      return { ...(result.effect || { type: 'transfer-transaction-updated' }), event: eventEnvelope, transferTransactions: cloneTransferTransactionState(), pendingTransferEvidence: clonePendingTransferEvidenceState() };
    }
    function sameCoord(a, b) { return Boolean(a && b && Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y)); }
    function sameContainerIdentity(a = {}, b = {}) {
      if (!a || !b) return false;
      if (String(a.publicId || '') !== String(b.publicId || '')) return false;
      if ((a.objectId != null || b.objectId != null) && Number(a.objectId) !== Number(b.objectId)) return false;
      return true;
    }
    function pendingEvidenceIgnored(kind, entry, reason, context = {}) {
      const ignored = { kind, reason, transferId: entry?.transferId || '', sessionId: entry?.sessionId || '', context: clonePlain(context) };
      state.pendingTransferEvidence.lastIgnored = ignored;
      return effect(`transfer-pending-${kind}-evidence-ignored`, { ...ignored, pendingTransferEvidence: clonePendingTransferEvidenceState() });
    }
    function clearPendingEvidenceForTransfer(transferId, reason = '') {
      const cleared = [];
      if (transferId && state.pendingTransferEvidence?.ground?.transferId === transferId) { cleared.push({ kind: 'ground-pile', transferId, reason }); state.pendingTransferEvidence.ground = null; }
      if (transferId && state.pendingTransferEvidence?.container?.transferId === transferId) { cleared.push({ kind: 'container-contents', transferId, reason }); state.pendingTransferEvidence.container = null; }
      return cleared.map((entry) => effect(`transfer-pending-${entry.kind}-evidence-cleared`, { ...entry, pendingTransferEvidence: clonePendingTransferEvidenceState() }));
    }
    function clearPendingEvidenceForSession(sessionId, reason = '') {
      const effects = [];
      if (sessionId && state.pendingTransferEvidence?.ground?.sessionId === sessionId) effects.push(...clearPendingEvidenceForTransfer(state.pendingTransferEvidence.ground.transferId, reason));
      if (sessionId && state.pendingTransferEvidence?.container?.sessionId === sessionId) effects.push(...clearPendingEvidenceForTransfer(state.pendingTransferEvidence.container.transferId, reason));
      return effects;
    }
    function clearDeadPendingEvidenceForSession(sessionId, reason = '') {
      const effects = [];
      const groundEntry = state.pendingTransferEvidence?.ground;
      if (groundEntry?.transferId && String(groundEntry.sessionId || '') === String(sessionId || '')) {
        const tx = state.transferTransactions?.transfersById?.get?.(groundEntry.transferId);
        const explicitGroundClose = /ground pickup panel closed|closed by player|cancel|escape/i.test(String(reason || ''));
        if (!tx || tx.status === 'pending' || tx.status === 'rejected' || tx.status === 'cancelled' || (explicitGroundClose && !tx.result?.groundPileDelta)) effects.push(...clearPendingEvidenceForTransfer(groundEntry.transferId, reason));
      }
      const containerEntry = state.pendingTransferEvidence?.container;
      if (containerEntry?.transferId && String(containerEntry.sessionId || '') === String(sessionId || '')) {
        const tx = state.transferTransactions?.transfersById?.get?.(containerEntry.transferId);
        if (!tx || tx.status === 'pending' || tx.status === 'rejected' || tx.status === 'cancelled' || !tx.result?.containerContentsDelta) effects.push(...clearPendingEvidenceForTransfer(containerEntry.transferId, reason));
      }
      return effects;
    }
    function recordPendingEvidenceForTransfer(transfer = {}) {
      if (!transfer?.transferId || !transfer.sessionId) return [];
      const effects = [];
      if (/^(?:ground-to-inventory|inventory-to-ground)$/.test(String(transfer.direction || ''))) {
        const coord = transfer.evidenceIdentity?.coord;
        if (!coord) return [pendingEvidenceIgnored('ground-pile', transfer, 'ground transfer has no public evidence coordinate')];
        if (state.pendingTransferEvidence?.ground?.transferId && state.pendingTransferEvidence.ground.transferId !== transfer.transferId) effects.push(...clearPendingEvidenceForTransfer(state.pendingTransferEvidence.ground.transferId, 'superseded by newer ground transfer pending evidence'));
        const beforePile = GroundPileSnapshotAdapter?.groundPileAt ? GroundPileSnapshotAdapter.groundPileAt(state.groundPiles, coord) : null;
        state.pendingTransferEvidence.ground = { transferId: transfer.transferId, sessionId: transfer.sessionId, direction: transfer.direction, coord: { x: Number(coord.x) || 0, y: Number(coord.y) || 0 }, beforePile, delta: null, afterPile: null, recordedAtRevision: state.transferTransactions?.revision || 0 };
        effects.push(effect('transfer-pending-ground-pile-evidence-recorded', { pending: clonePendingTransferEvidenceEntry(state.pendingTransferEvidence.ground), pendingTransferEvidence: clonePendingTransferEvidenceState() }));
        return effects;
      }
      if (/^(?:container-to-inventory|inventory-to-container)$/.test(String(transfer.direction || ''))) {
        const container = transfer.evidenceIdentity?.container;
        if (!container) return [pendingEvidenceIgnored('container-contents', transfer, 'container transfer has no public evidence container identity')];
        if (state.pendingTransferEvidence?.container?.transferId && state.pendingTransferEvidence.container.transferId !== transfer.transferId) effects.push(...clearPendingEvidenceForTransfer(state.pendingTransferEvidence.container.transferId, 'superseded by newer container transfer pending evidence'));
        const beforeSnapshot = ContainerContentsSnapshotAdapter?.containerContentsAt ? ContainerContentsSnapshotAdapter.containerContentsAt(state.containerContents, transfer.sessionId) : null;
        state.pendingTransferEvidence.container = { transferId: transfer.transferId, sessionId: transfer.sessionId, direction: transfer.direction, container: clonePlain(container), beforeSnapshot, delta: null, afterSnapshot: null, recordedAtRevision: state.transferTransactions?.revision || 0 };
        effects.push(effect('transfer-pending-container-contents-evidence-recorded', { pending: clonePendingTransferEvidenceEntry(state.pendingTransferEvidence.container), pendingTransferEvidence: clonePendingTransferEvidenceState() }));
        return effects;
      }
      return [];
    }
    function maybeAttachPendingGroundPileEvidence(delta, pile) {
      const pending = state.pendingTransferEvidence?.ground;
      if (!pending?.transferId) return [];
      const tx = state.transferTransactions?.transfersById?.get?.(pending.transferId);
      if (!tx) { state.pendingTransferEvidence.ground = null; return [pendingEvidenceIgnored('ground-pile', pending, 'pending ground evidence transfer no longer exists')]; }
      if (tx.result?.groundPileDelta) return clearPendingEvidenceForTransfer(pending.transferId, 'ground pile delta already attached');
      if (!delta?.publicEvidence || !delta.changed) return [pendingEvidenceIgnored('ground-pile', pending, 'ordinary ground pile snapshot had no changed public evidence', { delta })];
      if (!sameCoord(delta.coord, pending.coord)) return [pendingEvidenceIgnored('ground-pile', pending, 'ordinary ground pile snapshot coordinate did not match pending transfer evidence', { coord: delta.coord })];
      const evidenceDelta = (GroundPileSnapshotAdapter?.groundPileDelta && pending.beforePile && pile) ? GroundPileSnapshotAdapter.groundPileDelta(pending.beforePile, pile) : delta;
      const result = TransferTransactionModel?.attachGroundPileDelta ? TransferTransactionModel.attachGroundPileDelta(state.transferTransactions, { transferId: pending.transferId, sessionId: pending.sessionId, coord: pending.coord }, evidenceDelta) : null;
      const attachEffect = transferEffectFromModelResult(result, { eventType: 'ground.pile.snapshot', payload: { coord: delta.coord } });
      if (result?.transfer?.result?.groundPileDelta) {
        state.pendingTransferEvidence.ground = null;
        return [{ ...attachEffect, pendingTransferEvidence: clonePendingTransferEvidenceState() }];
      }
      return [attachEffect];
    }
    function maybeAttachPendingContainerContentsEvidence(delta, snapshot) {
      const pending = state.pendingTransferEvidence?.container;
      if (!pending?.transferId) return [];
      const tx = state.transferTransactions?.transfersById?.get?.(pending.transferId);
      if (!tx) { state.pendingTransferEvidence.container = null; return [pendingEvidenceIgnored('container-contents', pending, 'pending container evidence transfer no longer exists')]; }
      if (tx.result?.containerContentsDelta) return clearPendingEvidenceForTransfer(pending.transferId, 'container contents delta already attached');
      if (!delta?.publicEvidence || !delta.changed) return [pendingEvidenceIgnored('container-contents', pending, 'ordinary container contents snapshot had no changed public evidence', { delta })];
      if (String(delta.sessionId || '') !== String(pending.sessionId || '')) return [pendingEvidenceIgnored('container-contents', pending, 'ordinary container contents snapshot session did not match pending transfer evidence', { sessionId: delta.sessionId })];
      if (delta.container && pending.container && !sameContainerIdentity(delta.container, pending.container)) return [pendingEvidenceIgnored('container-contents', pending, 'ordinary container contents snapshot container identity did not match pending transfer evidence', { container: delta.container })];
      const evidenceDelta = (ContainerContentsSnapshotAdapter?.containerContentsDelta && pending.beforeSnapshot && snapshot) ? ContainerContentsSnapshotAdapter.containerContentsDelta(pending.beforeSnapshot, snapshot) : delta;
      const result = TransferTransactionModel?.attachContainerContentsDelta ? TransferTransactionModel.attachContainerContentsDelta(state.transferTransactions, { transferId: pending.transferId, sessionId: pending.sessionId, container: pending.container }, evidenceDelta) : null;
      const attachEffect = transferEffectFromModelResult(result, { eventType: 'container.contents.snapshot', payload: { sessionId: delta.sessionId, container: delta.container } });
      if (result?.transfer?.result?.containerContentsDelta) {
        state.pendingTransferEvidence.container = null;
        return [{ ...attachEffect, pendingTransferEvidence: clonePendingTransferEvidenceState() }];
      }
      return [attachEffect];
    }
    function applyTransferLifecycleEvent(eventEnvelope) {
      if (!TransferTransactionModel) return effect('transfer-transaction-rejected', { reason: 'transfer transaction model unavailable', event: eventEnvelope, pendingTransferEvidence: clonePendingTransferEvidenceState() });
      const payload = eventEnvelope.payload || {};
      switch (eventEnvelope.eventType) {
        case 'transfer.session.opened':
          return transferEffectFromModelResult(TransferTransactionModel.openSession(state.transferTransactions, payload), eventEnvelope);
        case 'transfer.session.updated':
          return transferEffectFromModelResult(TransferTransactionModel.updateSession(state.transferTransactions, payload.sessionId, payload), eventEnvelope);
        case 'transfer.session.closed': {
          const modelEffect = transferEffectFromModelResult(TransferTransactionModel.closeSession(state.transferTransactions, payload, payload.reason || 'session closed'), eventEnvelope);
          return [modelEffect, ...clearDeadPendingEvidenceForSession(payload.sessionId || modelEffect.session?.sessionId, payload.reason || 'session closed')];
        }
        case 'transfer.choreography.updated':
          return transferEffectFromModelResult(TransferTransactionModel.updateChoreography(state.transferTransactions, payload.sessionId, payload), eventEnvelope);
        case 'transfer.begun': {
          const modelResult = TransferTransactionModel.beginTransfer(state.transferTransactions, payload);
          const modelEffect = transferEffectFromModelResult(modelResult, eventEnvelope);
          const pendingEffects = modelResult?.transfer ? recordPendingEvidenceForTransfer(modelResult.transfer) : [];
          if (pendingEffects.length) modelEffect.pendingTransferEvidence = clonePendingTransferEvidenceState();
          return pendingEffects.length ? [modelEffect, ...pendingEffects] : modelEffect;
        }
        case 'transfer.confirmed':
          return transferEffectFromModelResult(TransferTransactionModel.noteConfirmation(state.transferTransactions, payload), eventEnvelope);
        case 'transfer.completed': {
          const modelResult = TransferTransactionModel.completeTransfer(state.transferTransactions, payload, { afterPanes: payload.afterPanes, groundPileDelta: payload.groundPileDelta, containerContentsDelta: payload.containerContentsDelta });
          const modelEffect = transferEffectFromModelResult(modelResult, eventEnvelope);
          const hasPublicEvidence = Boolean(modelResult?.transfer?.result?.groundPileDelta || modelResult?.transfer?.result?.containerContentsDelta);
          return hasPublicEvidence ? [modelEffect, ...clearPendingEvidenceForTransfer(modelResult.transfer.transferId, 'transfer completed with public evidence')] : modelEffect;
        }
        case 'transfer.rejected': {
          const modelResult = TransferTransactionModel.rejectFollowup(state.transferTransactions, payload, payload.reason || 'stale transfer follow-up');
          const modelEffect = transferEffectFromModelResult(modelResult, eventEnvelope);
          return [modelEffect, ...clearPendingEvidenceForTransfer(payload.transferId || modelResult?.transfer?.transferId, payload.reason || 'stale transfer follow-up')];
        }
        case 'transfer.ground-pile-evidence.attached': {
          const modelResult = TransferTransactionModel.attachGroundPileDelta(state.transferTransactions, payload, payload.groundPileDelta);
          const modelEffect = transferEffectFromModelResult(modelResult, eventEnvelope);
          return modelResult?.transfer?.result?.groundPileDelta ? [modelEffect, ...clearPendingEvidenceForTransfer(modelResult.transfer.transferId, 'ground pile evidence attached')] : modelEffect;
        }
        case 'transfer.container-contents-evidence.attached': {
          const modelResult = TransferTransactionModel.attachContainerContentsDelta(state.transferTransactions, payload, payload.containerContentsDelta);
          const modelEffect = transferEffectFromModelResult(modelResult, eventEnvelope);
          return modelResult?.transfer?.result?.containerContentsDelta ? [modelEffect, ...clearPendingEvidenceForTransfer(modelResult.transfer.transferId, 'container contents evidence attached')] : modelEffect;
        }
        default:
          return effect('transfer-transaction-rejected', { reason: `unsupported transfer event ${eventEnvelope.eventType}`, event: eventEnvelope, pendingTransferEvidence: clonePendingTransferEvidenceState() });
      }
    }
    function currentMagicMenuMatches(eventEnvelope) {
      if (!state.currentMenu) return false;
      const requestId = String(state.currentMenu.requestId || state.currentMenu.menuRequestId || state.currentMenu.menuId || '');
      const expectedKind = eventEnvelope.eventType === 'skill.rows' ? 'skill' : 'spell';
      return magicMenuKind(state.currentMenu) === expectedKind
        && requestId === String(eventEnvelope.requestId || '')
        && String(state.currentMenu.menuId || requestId) === String(eventEnvelope.payload?.menuId || '');
    }
    function applyMagicRowsEvent(eventEnvelope) {
      const kind = eventEnvelope.eventType === 'skill.rows' ? 'skill' : 'spell';
      const field = kind === 'skill' ? 'skillRows' : 'spellRows';
      const current = state[field];
      if (state.magicRowEventIds.has(eventEnvelope.eventId)) return effect('magic-rows-rejected', { kind, reason: 'duplicate event id', eventId: eventEnvelope.eventId, requestId: eventEnvelope.requestId });
      if (current && eventEnvelope.sequence <= current.sequence) return effect('magic-rows-rejected', { kind, stale: true, reason: 'out-of-order event sequence', sequence: eventEnvelope.sequence, currentSequence: current.sequence, requestId: eventEnvelope.requestId });
      if (current?.classificationConfidence === 'typed' && Number(eventEnvelope.payload.revision) <= Number(current.revision)) return effect('magic-rows-rejected', { kind, stale: true, reason: 'duplicate or stale row revision', revision: eventEnvelope.payload.revision, currentRevision: current.revision, requestId: eventEnvelope.requestId });
      if (!currentMagicMenuMatches(eventEnvelope)) return effect('magic-rows-rejected', { kind, stale: true, reason: 'request does not own the active menu', requestId: eventEnvelope.requestId, activeRequestId: state.currentMenu?.requestId || '' });
      const snapshot = {
        kind,
        revision: eventEnvelope.payload.revision,
        sequence: eventEnvelope.sequence,
        eventId: eventEnvelope.eventId,
        requestId: eventEnvelope.requestId,
        menuId: eventEnvelope.payload.menuId,
        classificationConfidence: eventEnvelope.payload.classificationConfidence,
        authoritative: eventEnvelope.payload.classificationConfidence === 'typed',
        rows: eventEnvelope.payload.rows.map((row) => ({ ...row })),
        source: clonePlain(eventEnvelope.source || {}),
      };
      state.magicRowEventIds.add(eventEnvelope.eventId);
      state.magicRowEventOrder.push(eventEnvelope.eventId);
      while (state.magicRowEventOrder.length > 256) state.magicRowEventIds.delete(state.magicRowEventOrder.shift());
      state[field] = snapshot;
      if (state.currentMenu && currentMagicMenuMatches(eventEnvelope)) state.currentMenu.publicRows = cloneMagicRows(snapshot);
      return [effect('magic-rows-changed', { kind, snapshot: cloneMagicRows(snapshot), event: eventEnvelope }), effect('render-menu')];
    }
    function magicMenuKind(menu = {}) {
      const purpose = String(menu.menuPurpose || menu.purpose || '');
      const prompt = String(menu.prompt || '');
      if (/^skill\.|skill\.rows|enhance|advance.*skill|current skills/i.test(`${purpose} ${prompt}`)) return 'skill';
      if (/^spell\.|spell\.rows|known spells|which spell|spell to cast/i.test(`${purpose} ${prompt}`)) return 'spell';
      return '';
    }
    function attachCompatibilityMagicRows(menu) {
      const kind = magicMenuKind(menu);
      if (!kind) return null;
      const parser = kind === 'skill' ? ShimProtocol.compatibilitySkillRowsFromMenu : ShimProtocol.compatibilitySpellRowsFromMenu;
      const rows = typeof parser === 'function' ? parser(menu) : [];
      if (!rows.length) return null;
      const requestId = String(menu.requestId || menu.menuRequestId || menu.menuId || '');
      const typed = kind === 'skill' ? state.skillRows : state.spellRows;
      if (typed?.classificationConfidence === 'typed' && String(typed.requestId || '') === requestId) {
        menu.publicRows = cloneMagicRows(typed);
        return typed;
      }
      const snapshot = {
        kind,
        revision: ++state.magicFallbackRevision,
        sequence: state.protocolSequence,
        eventId: `fallback-${kind}-rows-${state.magicFallbackRevision}`,
        requestId,
        menuId: String(menu.menuId || requestId),
        classificationConfidence: 'fallback',
        authoritative: false,
        rows: rows.map((row) => ({ ...row })),
        source: { layer: 'renderer', event: 'classic.menu.fallback', authoritative: false },
      };
      if (kind === 'skill') state.skillRows = snapshot;
      else state.spellRows = snapshot;
      menu.publicRows = cloneMagicRows(snapshot);
      return snapshot;
    }
    function applyCommandProtocolAckEvent(eventEnvelope) {
      const payload = eventEnvelope.payload || {};
      const ack = {
        eventType: eventEnvelope.eventType,
        sequence: eventEnvelope.sequence,
        eventId: eventEnvelope.eventId,
        commandId: payload.commandId || '',
        transactionId: eventEnvelope.transactionId || payload.transactionId || '',
        commandType: payload.commandType || '',
        actionId: payload.actionId || '',
        status: payload.status || eventEnvelope.eventType.replace(/^command\./, ''),
        reason: payload.reason || '',
        blockerToken: payload.blockerToken || '',
        supported: payload.supported,
        executionSource: payload.executionSource || '',
        replayBehavior: payload.replayBehavior || '',
      };
      state.commandProtocolAcks.push(clonePlainPublic(ack));
      if (state.commandProtocolAcks.length > 80) state.commandProtocolAcks.splice(0, state.commandProtocolAcks.length - 80);
      state.lastCommandProtocolAck = clonePlainPublic(ack);
      if (eventEnvelope.eventType === 'command.rejected') state.lastCommandProtocolRejection = clonePlainPublic(ack);
      return effect('command-protocol-ack-recorded', { ack: clonePlainPublic(ack), event: eventEnvelope });
    }
    function processUiProtocolEvent(rawInput) {
      const eventEnvelope = rawInput?.eventType ? rawInput : (rawInput?.event?.eventType ? rawInput.event : null);
      if (!eventEnvelope) return null;
      const effects = [];
      const handled = new Set(['inventory.snapshot', 'equipment.snapshot', 'spell.rows', 'skill.rows', 'ground.pile.snapshot', 'container.session.opened', 'container.session.closed', 'container.contents.snapshot', 'command.accepted', 'command.rejected', 'command.completed', 'transaction.completed', 'transaction.interrupted', 'transfer.session.opened', 'transfer.session.updated', 'transfer.session.closed', 'transfer.choreography.updated', 'transfer.begun', 'transfer.confirmed', 'transfer.completed', 'transfer.rejected', 'transfer.ground-pile-evidence.attached', 'transfer.container-contents-evidence.attached']);
      if (!handled.has(eventEnvelope.eventType)) return { event: eventEnvelope, state, effects: [effect('ui-protocol-event-ignored', { eventType: eventEnvelope.eventType })] };
      const checked = UiProtocolV2?.validateEventEnvelope ? UiProtocolV2.validateEventEnvelope(eventEnvelope) : { ok: true, errors: [] };
      if (!checked.ok) {
        const type = String(eventEnvelope.eventType || '');
        const rejectedType = type.startsWith('command.') || type.startsWith('transaction.')
          ? 'command-protocol-invalid-ack-rejected'
          : (type === 'inventory.snapshot' ? 'inventory-snapshot-rejected'
            : (type === 'equipment.snapshot' ? 'equipment-snapshot-rejected'
              : ((type === 'spell.rows' || type === 'skill.rows') ? 'magic-rows-rejected'
                : (type === 'ground.pile.snapshot' ? 'ground-pile-snapshot-rejected'
                  : (type.startsWith('transfer.') ? 'transfer-transaction-rejected' : 'container-contents-snapshot-rejected')))));
        const diagnosticErrors = checked.errors.map((error) => {
          const text = String(error || '');
          if (/\btrapped\b/i.test(text)) return 'payload: forbidden trapped field';
          if (/\blocked\b/i.test(text)) return 'payload: forbidden locked-state field';
          if (/\bbroken\b/i.test(text)) return 'payload: forbidden broken-state field';
          return 'payload: invalid public data';
        });
        const sanitizedEvent = {
          protocol: eventEnvelope.protocol,
          eventType: eventEnvelope.eventType,
          eventId: eventEnvelope.eventId,
          sequence: eventEnvelope.sequence,
          turn: eventEnvelope.turn,
        };
        return { event: sanitizedEvent, state, effects: [effect(rejectedType, { errors: diagnosticErrors, event: sanitizedEvent })] };
      }
      function pushEffects(value) { if (Array.isArray(value)) effects.push(...value.filter(Boolean)); else if (value) effects.push(value); }
      if (eventEnvelope.eventType === 'inventory.snapshot') {
        const revision = Number(eventEnvelope.payload?.revision || 0);
        const currentRevision = Number(state.inventory?.revision || 0);
        if (revision < currentRevision) effects.push(effect('inventory-snapshot-rejected', { stale: true, revision, currentRevision, errors: [`stale inventory snapshot revision ${revision} < current ${currentRevision}`] }));
        else {
          state.inventory = InventorySnapshotAdapter.applyInventorySnapshot(state.inventory, eventEnvelope.payload, { source: eventEnvelope.source, event: eventEnvelope });
          state.cachedInventoryChoices = (state.inventory.orderedItems || []).map((item) => InventorySnapshotAdapter.publicItemToLegacyChoice(item));
          effects.push(effect('inventory-snapshot', { inventory: InventorySnapshotAdapter.cloneInventoryState(state.inventory), event: state.inventory.lastSnapshotEvent }));
        }
      } else if (eventEnvelope.eventType === 'spell.rows' || eventEnvelope.eventType === 'skill.rows') {
        pushEffects(applyMagicRowsEvent(eventEnvelope));
      } else if (eventEnvelope.eventType === 'equipment.snapshot') {
        const revision = Number(eventEnvelope.payload?.revision || 0);
        const hasInventoryRevision = eventEnvelope.payload?.inventoryRevision != null;
        const inventoryRevision = hasInventoryRevision ? Number(eventEnvelope.payload.inventoryRevision) : Number(state.inventory?.revision || 0);
        const currentRevision = Number(state.equipment?.revision || 0);
        const currentInventoryRevision = Number(state.inventory?.revision || 0);
        if (revision < currentRevision || (hasInventoryRevision && inventoryRevision < currentInventoryRevision)) effects.push(effect('equipment-snapshot-rejected', { stale: true, revision, currentRevision, inventoryRevision, currentInventoryRevision, errors: [`stale equipment snapshot revision ${revision}/${inventoryRevision}`] }));
        else {
          const payload = hasInventoryRevision ? eventEnvelope.payload : { ...eventEnvelope.payload, inventoryRevision };
          const normalizedEvent = hasInventoryRevision ? eventEnvelope : { ...eventEnvelope, payload };
          state.equipment = EquipmentSnapshotAdapter.applyEquipmentSnapshot(state.equipment, payload, { source: eventEnvelope.source, event: normalizedEvent });
          effects.push(effect('equipment-snapshot', { equipment: EquipmentSnapshotAdapter.cloneEquipmentState(state.equipment), event: state.equipment.lastSnapshotEvent }));
        }
      } else if (eventEnvelope.eventType === 'ground.pile.snapshot') {
        const applied = applyGroundPileSnapshotPayload(eventEnvelope.payload, eventEnvelope.source || { layer: 'renderer' }, eventEnvelope);
        effects.push(applied.effect);
        if (applied.accepted) pushEffects(maybeAttachPendingGroundPileEvidence(applied.delta, applied.snapshot));
      } else if (String(eventEnvelope.eventType || '').startsWith('command.') || String(eventEnvelope.eventType || '').startsWith('transaction.')) {
        pushEffects(applyCommandProtocolAckEvent(eventEnvelope));
      } else if (eventEnvelope.eventType === 'container.contents.snapshot') {
        const applied = applyContainerContentsSnapshotPayload(eventEnvelope.payload, eventEnvelope.source || { layer: 'renderer' }, eventEnvelope);
        effects.push(applied.effect);
        if (applied.accepted) pushEffects(maybeAttachPendingContainerContentsEvidence(applied.delta, applied.snapshot));
      } else if (String(eventEnvelope.eventType || '').startsWith('transfer.')) {
        pushEffects(applyTransferLifecycleEvent(eventEnvelope));
      } else {
        pushEffects(applyContainerSessionEvent(eventEnvelope));
      }
      return { event: eventEnvelope, state, effects };
    }
    function transactionShouldAwaitVisibleDelta(tx, previousInventory, previousEquipment, nextInventory, nextEquipment) {
      if (!tx || tx.status !== 'pending' || !CommandTransactionModel?.publicStateDelta) return false;
      if (!/wear|take off|wield|swap|quiver|put on|remove accessory/i.test(String(tx.semanticAction || ''))) return false;
      const delta = CommandTransactionModel.publicStateDelta({ inventory: previousInventory, equipment: previousEquipment }, { inventory: nextInventory, equipment: nextEquipment });
      return !delta.changed;
    }
    function completeCommandFromPublicMenuRows(menu, sourceEvent, effects) {
      if (!menu || !InteractionModel.shouldCacheInventoryChoices(menu) || !CommandTransactionModel?.completeFromSnapshots || !activeNonInventoryTransaction()) return;
      const previousInventory = InventorySnapshotAdapter?.cloneInventoryState ? InventorySnapshotAdapter.cloneInventoryState(state.inventory) : state.inventory;
      const previousEquipment = EquipmentSnapshotAdapter?.cloneEquipmentState ? EquipmentSnapshotAdapter.cloneEquipmentState(state.equipment) : state.equipment;
      const rows = (menu.items || []).filter((item) => item.selector).map((item) => ({ selector: item.selector, text: item.text, objectId: item.objectId, quantity: item.quantity, glyph: item.glyph, glyphChar: item.glyphChar, itemflags: item.itemflags, wornMask: item.wornMask, semanticKind: item.semanticKind, semanticName: item.semanticName, semanticAppearance: item.semanticAppearance, semanticKnown: item.semanticKnown, known: item.known ? { ...item.known } : undefined, calledName: item.calledName, individualName: item.individualName, actionAffordances: item.actionAffordances }));
      if (!rows.length || !InventorySnapshotAdapter?.adaptShimInventoryUpdateToSnapshot || !EquipmentSnapshotAdapter?.adaptShimInventoryUpdateToEquipmentSnapshot) return;
      const synthetic = { name: 'shim_update_inventory', reason: -3, revision: (state.inventory?.revision || 0) + 1, inventoryRevision: (state.inventory?.revision || 0) + 1, equipmentRevision: Math.max((state.equipment?.revision || 0) + 1, (state.inventory?.revision || 0) + 1), transactionId: state.activeTransactionId, items: rows };
      const inventorySnapshot = InventorySnapshotAdapter.adaptShimInventoryUpdateToSnapshot(synthetic);
      const equipmentSnapshot = EquipmentSnapshotAdapter.adaptShimInventoryUpdateToEquipmentSnapshot(synthetic);
      state.inventory = InventorySnapshotAdapter.applyInventorySnapshot(state.inventory, inventorySnapshot, { source: { layer: 'renderer-public-menu', reason: sourceEvent?.name }, event: synthetic });
      state.equipment = EquipmentSnapshotAdapter.applyEquipmentSnapshot(state.equipment, equipmentSnapshot, { source: { layer: 'renderer-public-menu', reason: sourceEvent?.name }, event: synthetic });
      effects.push(effect('inventory-snapshot', { inventory: InventorySnapshotAdapter.cloneInventoryState(state.inventory), event: synthetic }));
      effects.push(effect('equipment-snapshot', { equipment: EquipmentSnapshotAdapter.cloneEquipmentState(state.equipment), event: synthetic }));
      const completion = CommandTransactionModel.completeFromSnapshots(state.commandTransactions, synthetic, { previousInventory, previousEquipment, nextInventory: state.inventory, nextEquipment: state.equipment });
      state.commandTransactions = completion.state;
      if (completion.effect) effects.push(completion.effect);
      if (completion.transaction?.status === 'completed' || completion.transaction?.status === 'failed') state.activeTransactionId = undefined;
    }
    function applyMenuSelectionState(menu, how) {
      if (!menu) return menu;
      menu.how = Number(how || 0);
      menu.selectionMode = MenuMetadataAdapter?.selectionModeFromHow ? MenuMetadataAdapter.selectionModeFromHow(menu.how) : (menu.how === 2 ? 'many' : (menu.how === 1 ? 'one' : 'none'));
      menu.selectionModeExplicit = false;
      menu.awaitingSelection = !InteractionModel.shouldSuppressPassiveGroundMenu(menu, menu.how);
      menu.suppressPicker = InteractionModel.shouldSuppressPassiveGroundMenu(menu, menu.how);
      return menu;
    }
    function process(rawInput) {
      const publicEventResult = processUiProtocolEvent(rawInput);
      if (publicEventResult) return publicEventResult;
      const appEvent = ShimProtocol.normalizeRawShimEvent(rawInput?.event || rawInput?.raw || rawInput);
      if (!appEvent.valid) return Object.freeze([]);
      const event = appEvent.event;
      const effects = [];
      if (event.name === 'shim_create_nhwindow') {
        state.windowTypes.set(event.return, event.windowType);
        if (event.windowType === 3) state.mapWindowId = event.return;
      } else if (event.name === 'shim_clear_nhwindow') {
        if (event.window === state.mapWindowId || event.return === state.mapWindowId) {
          state.mapCells = makeEmptyMap(width, height);
          state.actorPositions.clear();
          state.mapClearPending = false;
          state.mapRefreshPendingDisplay = true;
          state.groundPiles = GroundPileSnapshotAdapter?.emptyGroundPileState ? GroundPileSnapshotAdapter.emptyGroundPileState() : { revision: 0, pilesByCoord: new Map(), lastSnapshotSource: null, lastSnapshotEvent: null };
          state.mapRevision += 1;
          effects.push(effect('map-reset'));
          effects.push(effect('ground-pile-snapshot', { groundPiles: cloneGroundPileState(), snapshot: null, event, delta: { changed: true, changedCount: 0, publicEvidence: false, reason: 'map cleared' } }));
          effects.push(effect('status', { text: 'loading dungeon map' }));
        }
      } else if (event.name === 'shim_print_glyph') {
        if (state.mapWindowId == null || event.window === state.mapWindowId || state.windowTypes.get(event.window) === 3) {
          state.mapWindowId = event.window;
          const x = normalizeMapCoord(event.x, width);
          const y = normalizeMapCoord(event.y, height);
          const ch = typeof event.char === 'string' && event.char ? event.char[0] : ' ';
          const deferMapRenderUntilDisplay = state.mapRefreshPendingDisplay;
          if (state.mapClearPending) {
            state.mapCells = makeEmptyMap(width, height);
            state.actorPositions.clear();
            state.mapClearPending = false;
            effects.push(effect('map-reset'));
          }
          const actorId = String(event.actorId || '').trim();
          const replacedActorId = String(state.mapCells[y]?.[x]?.actorId || '').trim();
          if (replacedActorId && replacedActorId !== actorId) {
            const replacedPosition = state.actorPositions.get(replacedActorId);
            if (replacedPosition?.x === x && replacedPosition?.y === y) state.actorPositions.delete(replacedActorId);
          }
          if (actorId) {
            const previous = state.actorPositions.get(actorId);
            if (previous && (previous.x !== x || previous.y !== y)) {
              const previousCell = state.mapCells[previous.y]?.[previous.x];
              if (previousCell?.actorId === actorId) {
                state.mapCells[previous.y][previous.x] = actorBackgroundCell(previousCell);
                if (!deferMapRenderUntilDisplay) effects.push(effect('dirty-map-neighborhood', { x: previous.x, y: previous.y }));
              }
            }
            state.actorPositions.set(actorId, { x, y });
          }
          state.mapCells[y][x] = { ch, actorId: actorId || undefined, assetId: event.assetId, glyph: event.glyph, ttychar: event.ttychar, color: event.color, tileidx: event.tileidx, glyphFlags: event.glyphFlags, backgroundGlyph: event.backgroundGlyph, backgroundChar: event.backgroundChar, backgroundSemanticKind: event.backgroundSemanticKind, backgroundSemanticName: event.backgroundSemanticName, backgroundSemanticKnown: event.backgroundSemanticKnown, objectLayerGlyph: event.objectLayerGlyph, objectLayerChar: event.objectLayerChar, objectLayerSemanticKind: event.objectLayerSemanticKind, objectLayerSemanticName: event.objectLayerSemanticName, objectLayerSemanticAppearance: event.objectLayerSemanticAppearance, objectLayerSemanticKnown: event.objectLayerSemanticKnown, cmapIndex: event.cmapIndex, semanticKind: event.semanticKind, semanticName: event.semanticName, semanticAppearance: event.semanticAppearance, semanticKnown: event.semanticKnown, actionAffordances: Array.isArray(event.actionAffordances) ? event.actionAffordances.slice() : [], backgroundActionAffordances: Array.isArray(event.backgroundActionAffordances) ? event.backgroundActionAffordances.slice() : [], objectLayerActionAffordances: Array.isArray(event.objectLayerActionAffordances) ? event.objectLayerActionAffordances.slice() : [] };
          state.mapRevision += 1;
          if (!event.groundPileSnapshotAuthoritative) {
            const publicGroundItem = publicGroundItemFromObjectLayer(event, { x, y });
            if (publicGroundItem) {
              const applied = applyGroundPileSnapshotPayload({ revision: publicGroundRevision(), coord: { x, y }, items: [publicGroundItem] }, { layer: 'shim-bridge' });
              effects.push(applied.effect);
            } else if (GroundPileSnapshotAdapter?.groundPileAt?.(state.groundPiles, { x, y })) {
              const applied = applyGroundPileSnapshotPayload({ revision: publicGroundRevision(), coord: { x, y }, items: [] }, { layer: 'shim-bridge' });
              effects.push(applied.effect);
            }
          }
          if (event.semanticKind === 'stairs' || ch === '>' || ch === '<') effects.push(recordMilestone('stairs-seen', { x, y, ch, semanticName: event.semanticName || '' }));
          if (!deferMapRenderUntilDisplay) effects.push(effect('dirty-map-neighborhood', { x, y }), effect('render-map'), effect('status', { text: 'updating dungeon map' }));
        }
      } else if (event.name === 'shim_ground_pile_snapshot') {
        const coord = event.coord || { x: event.x, y: event.y };
        const applied = applyGroundPileSnapshotPayload({ revision: event.revision, coord, items: event.items || [] }, { layer: 'shim-bridge', event: 'shim_ground_pile_snapshot', source: event.source || 'level.objects', authoritative: event.authoritative !== false });
        effects.push(applied.effect);
        if (applied.accepted) effects.push(...maybeAttachPendingGroundPileEvidence(applied.delta, applied.snapshot));
      } else if (event.name === 'shim_container_contents_snapshot') {
        const payload = { revision: event.revision, sessionId: event.sessionId, container: event.container, items: event.items || [] };
        if (ContainerContentsSnapshotAdapter?.openSession && !state.containerContents.sessionsById?.get?.(payload.sessionId)) {
          state.containerContents = ContainerContentsSnapshotAdapter.openSession(state.containerContents, { sessionId: payload.sessionId, container: payload.container });
          effects.push(effect('container-session-opened', { containerContents: cloneContainerContentsState(), sessionId: payload.sessionId, container: payload.container }));
        }
        const applied = applyContainerContentsSnapshotPayload(payload, { layer: 'shim-bridge', event: 'shim_container_contents_snapshot', source: 'container.cobj', authoritative: true });
        effects.push(applied.effect);
        if (applied.accepted) effects.push(...maybeAttachPendingContainerContentsEvidence(applied.delta, applied.snapshot));
      } else if (event.name === 'shim_container_snapshot_rejected') {
        effects.push(effect('container-snapshot-rejected', { commandId: event.commandId || '', transactionId: event.transactionId || '', sessionId: event.sessionId || '', containerId: event.containerId, status: event.status || 'rejected', failureKind: event.failureKind || 'rejected', reason: event.reason || 'container snapshot rejected', event }));
      } else if (event.name === 'shim_curs') {
        const previous = state.cursor;
        state.cursor = { window: event.window, x: normalizeMapCoord(event.x, width), y: normalizeMapCoord(event.y, height) };
        if (previous.window === state.mapWindowId) effects.push(effect('dirty-map-neighborhood', { x: previous.x, y: previous.y }));
        if (state.cursor.window === state.mapWindowId) effects.push(effect('dirty-map-neighborhood', { x: state.cursor.x, y: state.cursor.y }));
        effects.push(effect('render-map'));
      } else if (event.name === 'shim_putstr' || event.name === 'shim_raw_print' || event.name === 'shim_raw_print_bold') {
        state.messages.push(event.text || '');
        effects.push(effect('message', { text: event.text || '' }));
        if (/stairs|descend|Welcome|Rest in peace|You die|Dlvl/i.test(String(event.text || ''))) effects.push(recordMilestone('message', { text: event.text || '' }));
        const wtype = state.windowTypes.get(event.window);
        if (event.name === 'shim_putstr' && (wtype === 4 || wtype === 5)) {
          const doc = state.textWindowsByWindow.get(event.window) || { title: 'NetHack help/file window', lines: [] };
          doc.lines.push(event.text || '');
          state.textWindowsByWindow.set(event.window, doc);
          effects.push(effect('text-window-line', { window: event.window, text: event.text || '' }));
        }
      } else if (event.name === 'shim_start_menu') {
        if (eventIsStaleByRevision(event)) { effects.push(staleEffect('menu', event, 'stale lifecycle revision')); return { event: appEvent, state, effects }; }
        const lifecycle = beginMenuLifecycle(event);
        noteCommandInteraction('menu', { ...event, transactionId: lifecycle.transactionId, requestId: lifecycle.requestId }, { lifecycle: 'building-menu' });
        const menu = assignMenuLifecycle({ prompt: '', items: [], window: event.window, menuId: event.menuId || lifecycle.menuId, menuRequestId: event.menuRequestId || lifecycle.requestId, requestId: event.requestId || lifecycle.requestId, transactionId: event.transactionId || lifecycle.transactionId, requestSource: event.requestSource, owner: event.owner, ownerExplicit: Boolean(event.owner), menuPurpose: event.menuPurpose, menuPurposeExplicit: Boolean(event.menuPurpose), lifecycle: event.lifecycle, lifecycleExplicit: Boolean(event.lifecycle), selectionMode: event.selectionMode, selectionModeExplicit: Boolean(event.selectionMode) }, lifecycle);
        if (state.pendingMenuSelections.has(event.window)) applyMenuSelectionState(menu, state.pendingMenuSelections.get(event.window));
        applyMenuMetadata(menu, event, { lastWorldCommand: state.lastWorldCommand, lifecycleRevision: lifecycle.lifecycleRevision, requestId: lifecycle.requestId, transactionId: lifecycle.transactionId, lifecycleExplicit: menu.lifecycleExplicit });
        state.menusByWindow.set(event.window, menu); state.currentMenu = menu;
        effects.push(effect('menu-changed', { menu: cloneMenu(menu) }));
      } else if (event.name === 'shim_add_menu') {
        if (eventIsStaleByRevision(event)) { effects.push(staleEffect('menu', event, 'stale lifecycle revision')); return { event: appEvent, state, effects }; }
        const lifecycle = ensureMenuLifecycle(event);
        if (lifecycle.stale) { effects.push(staleEffect('menu', event, 'request id does not match active menu window')); return { event: appEvent, state, effects }; }
        const menu = assignMenuLifecycle(state.menusByWindow.get(event.window) || { prompt: '', items: [], window: event.window }, lifecycle);
        menu.window = event.window;
        menu.items.push({ selector: event.selector, text: event.text || '', objectId: event.objectId, attr: event.attr, color: event.color, itemflags: event.itemflags, glyph: event.glyph, glyphChar: event.glyphChar, glyphColor: event.glyphColor, tileidx: event.tileidx, cmapIndex: event.cmapIndex, semanticKind: event.semanticKind, semanticName: event.semanticName, semanticAppearance: event.semanticAppearance, semanticKnown: event.semanticKnown, known: event.known ? { ...event.known } : undefined, calledName: event.calledName, individualName: event.individualName, actionAffordances: Array.isArray(event.actionAffordances) ? event.actionAffordances.slice() : [] });
        if (event.menuPurpose) { menu.menuPurpose = event.menuPurpose; menu.menuPurposeExplicit = true; }
        if (event.menuId) menu.menuId = event.menuId;
        if (event.lifecycle) { menu.lifecycle = event.lifecycle; menu.lifecycleExplicit = true; }
        if (event.menuRequestId) menu.menuRequestId = event.menuRequestId;
        if (event.requestId) menu.requestId = event.requestId;
        if (event.transactionId) menu.transactionId = event.transactionId;
        if (event.requestSource) menu.requestSource = event.requestSource;
        if (event.owner) { menu.owner = event.owner; menu.ownerExplicit = true; }
        if (event.selectionMode) { menu.selectionMode = event.selectionMode; menu.selectionModeExplicit = true; }
        if (state.pendingMenuSelections.has(event.window)) applyMenuSelectionState(menu, state.pendingMenuSelections.get(event.window));
        applyMenuMetadata(menu, event, { lastWorldCommand: state.lastWorldCommand, lifecycleRevision: lifecycle.lifecycleRevision, requestId: lifecycle.requestId, transactionId: lifecycle.transactionId, lifecycleExplicit: menu.lifecycleExplicit });
        state.menusByWindow.set(event.window, menu); state.currentMenu = menu;
        if (InteractionModel.shouldCacheInventoryChoices(menu)) state.cachedInventoryChoices = menu.items.filter((item) => item.selector);
        effects.push(effect('menu-changed', { menu: cloneMenu(menu) }));
      } else if (event.name === 'shim_end_menu') {
        if (eventIsStaleByRevision(event)) { effects.push(staleEffect('menu', event, 'stale lifecycle revision')); return { event: appEvent, state, effects }; }
        const lifecycle = ensureMenuLifecycle(event);
        if (lifecycle.stale) { effects.push(staleEffect('menu', event, 'request id does not match active menu window')); return { event: appEvent, state, effects }; }
        const menu = assignMenuLifecycle(state.menusByWindow.get(event.window) || { prompt: '', items: [], window: event.window }, lifecycle);
        menu.window = event.window;
        menu.prompt = event.prompt || menu.prompt || 'Menu';
        if (event.menuPurpose) { menu.menuPurpose = event.menuPurpose; menu.menuPurposeExplicit = true; }
        if (event.menuId) menu.menuId = event.menuId;
        if (event.lifecycle) { menu.lifecycle = event.lifecycle; menu.lifecycleExplicit = true; }
        if (event.menuRequestId) menu.menuRequestId = event.menuRequestId;
        if (event.requestId) menu.requestId = event.requestId;
        if (event.transactionId) menu.transactionId = event.transactionId;
        if (event.requestSource) menu.requestSource = event.requestSource;
        if (event.owner) { menu.owner = event.owner; menu.ownerExplicit = true; }
        if (event.selectionMode) { menu.selectionMode = event.selectionMode; menu.selectionModeExplicit = true; }
        if (state.pendingMenuSelections.has(event.window)) applyMenuSelectionState(menu, state.pendingMenuSelections.get(event.window));
        applyMenuMetadata(menu, event, { lastWorldCommand: state.lastWorldCommand, lifecycleRevision: lifecycle.lifecycleRevision, requestId: lifecycle.requestId, transactionId: lifecycle.transactionId, lifecycleExplicit: menu.lifecycleExplicit });
        const magicRows = attachCompatibilityMagicRows(menu);
        state.menusByWindow.set(event.window, menu); state.currentMenu = menu;
        if (InteractionModel.shouldCacheInventoryChoices(menu)) state.cachedInventoryChoices = menu.items.filter((item) => item.selector);
        completeCommandFromPublicMenuRows(menu, event, effects);
        if (magicRows) effects.push(effect('magic-rows-changed', { kind: magicRows.kind, snapshot: cloneMagicRows(magicRows), compatibilityFallback: magicRows.classificationConfidence === 'fallback' }));
        effects.push(effect('menu-changed', { menu: cloneMenu(menu) }));
      } else if (event.name === 'shim_select_menu') {
        if (eventIsStaleByRevision(event)) { effects.push(staleEffect('menu', event, 'stale lifecycle revision')); return { event: appEvent, state, effects }; }
        const lifecycle = ensureMenuLifecycle(event);
        if (lifecycle.stale) { effects.push(staleEffect('menu', event, 'request id does not match active menu window')); return { event: appEvent, state, effects }; }
        const how = Number(event.how || 0);
        state.pendingMenuSelections.set(event.window, how);
        const menu = assignMenuLifecycle(state.menusByWindow.get(event.window) || state.currentMenu, lifecycle);
        if (menu) {
          if (event.lifecycle) { menu.lifecycle = event.lifecycle; menu.lifecycleExplicit = true; }
          applyMenuSelectionState(menu, how);
          applyMenuMetadata(menu, event, { how, lastWorldCommand: state.lastWorldCommand, lifecycleRevision: lifecycle.lifecycleRevision, requestId: lifecycle.requestId, transactionId: lifecycle.transactionId, lifecycleExplicit: menu.lifecycleExplicit });
          state.menusByWindow.set(event.window, menu); state.currentMenu = menu;
          if (InteractionModel.shouldCacheInventoryChoices(menu)) state.cachedInventoryChoices = menu.items.filter((item) => item.selector);
        }
        completeCommandFromPublicMenuRows(menu, event, effects);
        if (menu && !menu.items.length) {
          state.activePrompt = { kind: how ? 'menu selection' : 'read-only menu', query: how ? 'Waiting for NetHack menu rows…' : 'Waiting for NetHack menu text…', promptId: menu.menuId || lifecycle.requestId, requestId: lifecycle.requestId, transactionId: lifecycle.transactionId, promptType: how ? 'menuSelection' : 'readOnlyMenu', promptPurpose: how ? 'prompt.menuSelection' : 'prompt.readOnlyMenu', requestSource: menu.requestSource, owner: menu.owner, lifecycle: how ? 'selecting' : 'ready', lifecycleRevision: lifecycle.lifecycleRevision };
          effects.push(effect('render-prompt'), effect('status', { text: 'menu awaiting NetHack rows' }));
        } else if (menu?.suppressPicker) {
          state.activePrompt = null;
          effects.push(effect('close-interaction'), effect('render-prompt'), effect('render-menu'), effect('status', { text: 'ground items noted; movement remains unobstructed' }));
        } else {
          state.activePrompt = { kind: how ? 'menu selection' : 'read-only menu', query: how ? 'Choose from the menu, press an item letter, or Esc/Enter to cancel.' : 'Review this information, then continue.', promptId: menu.menuId || lifecycle.requestId, requestId: lifecycle.requestId, transactionId: lifecycle.transactionId, promptType: how ? 'menuSelection' : 'readOnlyMenu', promptPurpose: how ? 'prompt.menuSelection' : 'prompt.readOnlyMenu', requestSource: menu.requestSource, owner: menu.owner, lifecycle: how ? 'selecting' : 'ready', lifecycleRevision: lifecycle.lifecycleRevision };
          const statusText = how && /\b(?:pay for which items?|pay which (?:shop )?bill items?|which items? (?:do you want to )?pay for|itemized bill(?:ing)?)\b/i.test(String(menu?.prompt || ''))
            ? 'Choose items to pay for'
            : (how ? 'menu awaiting item selection' : 'information menu open');
          effects.push(effect('render-prompt'), effect('render-menu'), effect('status', { text: statusText }));
        }
      } else if (event.name === 'shim_display_nhwindow') {
        if (event.window === state.mapWindowId || state.windowTypes.get(event.window) === 3) {
          const completedDeferredMapRefresh = state.mapRefreshPendingDisplay || state.mapClearPending;
          if (state.mapClearPending) {
            state.mapCells = makeEmptyMap(width, height);
            state.actorPositions.clear();
            state.mapClearPending = false;
            effects.push(effect('map-reset'));
          }
          state.mapRefreshPendingDisplay = false;
          effects.push(effect('flush-map'));
          if (completedDeferredMapRefresh) effects.push(effect('status', { text: 'dungeon map ready' }));
        }
        const wtype = state.windowTypes.get(event.window);
        if ((wtype === 4 || wtype === 5) && state.textWindowsByWindow.has(event.window)) {
          state.documentWindow = state.textWindowsByWindow.get(event.window);
          effects.push(effect('open-document', { document: state.documentWindow }));
        }
      } else if (event.name === 'shim_message_menu') {
        state.documentWindow = { title: 'Message history', lines: state.messages.slice() };
        effects.push(effect('open-document', { document: state.documentWindow }), effect('status', { text: 'message menu displayed' }));
      } else if (event.name === 'bridge_menu_answer') {
        const requestId = explicitRequestId(event);
        const currentForWindow = event.window != null ? state.menusByWindow.get(event.window) : state.currentMenu;
        const activeMenuForAnswer = currentForWindow || state.currentMenu;
        const transferAnswerTransactionId = String(event.transactionId || event.inputTransactionId || event.actionTransactionId || event.guiAction?.transactionId || event.guiAction?.actionTransactionId || '').trim();
        const transferAnswerTx = transferAnswerTransactionId ? state.transferTransactions?.transfersById?.get?.(transferAnswerTransactionId) : null;
        const transferExpectedRequestId = String(transferAnswerTx?.expectedRequestId || '').trim();
        const activeMenuRequestId = String(activeMenuForAnswer?.requestId || activeMenuForAnswer?.menuRequestId || '').trim();
        const transferAnswerOwnsMenu = Boolean(transferAnswerTx?.status === 'pending' && (
          !activeMenuForAnswer?.transactionId
          || String(activeMenuForAnswer.transactionId || '') === transferAnswerTransactionId
          || (transferExpectedRequestId && activeMenuRequestId && transferExpectedRequestId === activeMenuRequestId)
        ));
        if (state.currentMenu?.requestId && event.window != null && !currentForWindow) { rejectCommandFollowup(event, 'answer window does not match active menu', effects); effects.push(staleEffect('menu-answer', event, 'answer window does not match active menu')); return { event: appEvent, state, effects }; }
        if (activeMenuForAnswer?.requestId && !requestId && !transferAnswerOwnsMenu) { rejectCommandFollowup(event, 'missing request id for active menu', effects); effects.push(staleEffect('menu-answer', event, 'missing request id for active menu')); return { event: appEvent, state, effects }; }
        if (requestId && activeMenuForAnswer?.requestId && requestId !== activeMenuForAnswer.requestId) { rejectCommandFollowup(event, 'request id does not match active menu', effects); effects.push(staleEffect('menu-answer', event, 'request id does not match active menu')); return { event: appEvent, state, effects }; }
        const closingReadOnlyMenu = state.currentMenu && !Number(state.currentMenu.how || 0);
        const answeringCurrentMenu = state.currentMenu && (event.window == null || state.currentMenu.window === event.window);
        if (!event.return && activeNonInventoryTransaction() && activeMenuForAnswer?.awaitingSelection && CommandTransactionModel?.failTransaction) {
          const failed = CommandTransactionModel.failTransaction(state.commandTransactions, { ...event, transactionId: activeMenuForAnswer.transactionId || state.activeTransactionId, name: 'bridge_menu_answer.cancelled' }, 'cancelled by player');
          state.commandTransactions = failed.state;
          if (failed.effect) effects.push(failed.effect);
          if (failed.transaction?.status === 'failed') state.activeTransactionId = undefined;
        }
        state.activePrompt = null;
        if (state.currentMenu) state.currentMenu.awaitingSelection = false;
        if (event.window != null) {
          state.menusByWindow.delete(event.window);
          state.pendingMenuSelections.delete(event.window);
          state.menuLifecyclesByWindow.delete(event.window);
        }
        if (answeringCurrentMenu || closingReadOnlyMenu || event.return) state.currentMenu = null;
        effects.push(effect('close-interaction'), effect('render-prompt'), effect('render-menu'), effect('status', { text: event.return ? 'menu selection sent' : 'returned to map' }));
      } else if (event.name === 'shim_yn_function') {
        if (event.autoAnswered) {
          effects.push(effect('status', { text: event.autoAnswerReason === 'queued-ring-finger' ? 'ring finger auto-selected' : 'prompt auto-answered' }));
        } else {
          if (eventIsStaleByRevision(event)) { effects.push(staleEffect('prompt', event, 'stale lifecycle revision')); return { event: appEvent, state, effects }; }
          const lifecycle = promptLifecycleContext(event);
          noteCommandInteraction('prompt', { ...event, transactionId: lifecycle.transactionId, requestId: lifecycle.requestId }, { lifecycle: 'awaiting-question' });
          state.activePrompt = applyPromptMetadata({ kind: 'question', query: event.query, choices: event.choices, lifecycleRevision: lifecycle.lifecycleRevision }, event, lifecycle);
          effects.push(effect('render-prompt'), effect('message', { text: event.query }));
        }
      } else if (event.name === 'shim_getlin') {
        if (eventIsStaleByRevision(event)) { effects.push(staleEffect('prompt', event, 'stale lifecycle revision')); return { event: appEvent, state, effects }; }
        const lifecycle = promptLifecycleContext(event);
        noteCommandInteraction('prompt', { ...event, transactionId: lifecycle.transactionId, requestId: lifecycle.requestId }, { lifecycle: 'awaiting-line-input' });
        state.activePrompt = applyPromptMetadata({ kind: 'line input', query: event.query, choices: event.choices || '', lifecycleRevision: lifecycle.lifecycleRevision }, event, lifecycle);
        effects.push(effect('render-prompt'), effect('message', { text: event.query }));
      } else if (event.name === 'bridge_direction_prompt') {
        const query = event.query || 'Choose a direction.';
        const recentPromptText = state.messages.slice(-3).some(isGenericDirectionText);
        if (recentPromptText || !/direction or map target/i.test(query)) {
          if (eventIsStaleByRevision(event)) { effects.push(staleEffect('prompt', event, 'stale lifecycle revision')); return { event: appEvent, state, effects }; }
          const lifecycle = promptLifecycleContext(event);
          noteCommandInteraction('prompt', { ...event, transactionId: lifecycle.transactionId, requestId: lifecycle.requestId }, { lifecycle: 'awaiting-direction' });
          state.activePrompt = applyPromptMetadata({ kind: 'question', query, choices: event.choices || 'ykulnjbh.<>', lifecycleRevision: lifecycle.lifecycleRevision }, event, lifecycle);
          effects.push(effect('render-prompt'), effect('message', { text: state.activePrompt.query, logPrompt: false }));
        }
      } else if (event.name === 'bridge_extcmd_catalog') {
        if (eventIsStaleByRevision(event)) { effects.push(staleEffect('prompt', event, 'stale lifecycle revision')); return { event: appEvent, state, effects }; }
        const lifecycle = promptLifecycleContext(event);
        noteCommandInteraction('prompt', { ...event, transactionId: lifecycle.transactionId, requestId: lifecycle.requestId }, { lifecycle: 'awaiting-extended-command' });
        state.extCommandCatalog = Array.isArray(event.commands) ? event.commands : [];
        state.activePrompt = applyPromptMetadata({ kind: 'extended command', query: 'Choose an extended command or type to filter/submit.', lifecycleRevision: lifecycle.lifecycleRevision }, event, lifecycle);
        effects.push(effect('render-prompt'));
      } else if (event.name === 'shim_get_ext_cmd') {
        if (eventIsStaleByRevision(event)) { effects.push(staleEffect('prompt', event, 'stale lifecycle revision')); return { event: appEvent, state, effects }; }
        const lifecycle = promptLifecycleContext(event);
        noteCommandInteraction('prompt', { ...event, transactionId: lifecycle.transactionId, requestId: lifecycle.requestId }, { lifecycle: 'awaiting-extended-command' });
        state.activePrompt = applyPromptMetadata({ kind: 'extended command', query: 'Type an extended command name, then Enter. Esc cancels.', lifecycleRevision: lifecycle.lifecycleRevision }, event, lifecycle);
        effects.push(effect('render-prompt'));
      } else if (event.name === 'bridge_prompt_answer' || event.name === 'bridge_line_answer' || event.name === 'bridge_extcmd_answer' || event.name === 'bridge_direction_answer') {
        const requestId = explicitRequestId(event);
        if (state.activePrompt?.requestId && !requestId) { rejectCommandFollowup(event, 'missing request id for active prompt', effects); effects.push(staleEffect('prompt-answer', event, 'missing request id for active prompt')); return { event: appEvent, state, effects }; }
        if (requestId && state.activePrompt?.requestId && requestId !== state.activePrompt.requestId) { rejectCommandFollowup(event, 'request id does not match active prompt', effects); effects.push(staleEffect('prompt-answer', event, 'request id does not match active prompt')); return { event: appEvent, state, effects }; }
        const cancelled = Number(event.keycode) === 27 || String(event.value || '') === '\u001b' || (event.name === 'bridge_line_answer' && activeNonInventoryTransaction() && String(event.value || '') === '');
        if (cancelled && activeNonInventoryTransaction() && CommandTransactionModel?.failTransaction) {
          const failed = CommandTransactionModel.failTransaction(state.commandTransactions, { ...event, transactionId: state.activePrompt.transactionId || state.activeTransactionId, name: `${event.name}.cancelled` }, 'cancelled by player');
          state.commandTransactions = failed.state;
          if (failed.effect) effects.push(failed.effect);
          if (failed.transaction?.status === 'failed') state.activeTransactionId = undefined;
        }
        state.activePrompt = null;
        effects.push(effect('close-interaction'), effect('hide-direction-helper'), effect('render-prompt'));
      } else if (event.name === 'shim_status_enablefield') {
        state.statusLabels.set(event.field, event.label || `field ${event.field}`);
        if (event.enabled === 0 || event.enabled === false) state.statusValues.delete(event.field);
        effects.push(effect('render-status'));
      } else if (event.name === 'shim_status_update') {
        if (event.field >= 0) {
          state.statusValues.set(event.field, event.value != null ? event.value : (event.conditionMask != null ? `mask ${event.conditionMask}` : `changed (pct ${event.percent ?? 0}, color ${event.color ?? 0})`));
          if (/Dlvl/i.test(state.statusLabels.get(event.field) || '') && event.value != null) effects.push(recordMilestone('depth', { depth: event.value }));
          effects.push(effect('render-status'));
        }
        if (event.field === -2) effects.push(effect('render-status'));
        if (event.field === -1) effects.push(effect('render-status'));
      } else if (event.name === 'shim_update_inventory') {
        const previousInventoryForTransaction = InventorySnapshotAdapter?.cloneInventoryState ? InventorySnapshotAdapter.cloneInventoryState(state.inventory) : state.inventory;
        const previousEquipmentForTransaction = EquipmentSnapshotAdapter?.cloneEquipmentState ? EquipmentSnapshotAdapter.cloneEquipmentState(state.equipment) : state.equipment;
        const incomingInventoryRevision = Number(event.inventoryRevision ?? event.revision ?? 0);
        const currentAcceptedInventoryRevision = Number(state.inventory?.revision || 0);
        const staleInventoryUpdate = incomingInventoryRevision < currentAcceptedInventoryRevision;
        if (!staleInventoryUpdate) state.cachedInventoryChoices = (event.items || []).filter((item) => item.selector);
        let inventorySnapshot = null;
        let inventoryEvent = null;
        if (InventorySnapshotAdapter?.adaptShimInventoryUpdateToSnapshot) {
          inventorySnapshot = InventorySnapshotAdapter.adaptShimInventoryUpdateToSnapshot(event);
          inventoryEvent = InventorySnapshotAdapter.createInventorySnapshotEvent(event, { sequence: ++state.protocolSequence, eventId: `evt-inventory-snapshot-${inventorySnapshot.revision}`, source: { layer: 'shim-bridge' } });
          const checked = UiProtocolV2?.validateEventEnvelope ? UiProtocolV2.validateEventEnvelope(inventoryEvent) : { ok: true, errors: [] };
          const currentInventoryRevision = Number(state.inventory?.revision || 0);
          if (checked.ok && inventorySnapshot.revision < currentInventoryRevision) {
            effects.push(effect('inventory-snapshot-rejected', { stale: true, revision: inventorySnapshot.revision, currentRevision: currentInventoryRevision, errors: [`stale inventory snapshot revision ${inventorySnapshot.revision} < current ${currentInventoryRevision}`] }));
          } else if (checked.ok) {
            state.inventory = InventorySnapshotAdapter.applyInventorySnapshot(state.inventory, inventorySnapshot, { source: { layer: 'shim-bridge', reason: event.reason }, event: inventoryEvent });
            effects.push(effect('inventory-snapshot', { inventory: InventorySnapshotAdapter.cloneInventoryState(state.inventory), event: inventoryEvent }));
          } else {
            effects.push(effect('inventory-snapshot-rejected', { errors: checked.errors.slice() }));
          }
        }
        if (EquipmentSnapshotAdapter?.adaptShimInventoryUpdateToEquipmentSnapshot) {
          const equipmentSnapshot = EquipmentSnapshotAdapter.adaptShimInventoryUpdateToEquipmentSnapshot(event);
          const equipmentEvent = EquipmentSnapshotAdapter.createEquipmentSnapshotEvent(event, { sequence: ++state.protocolSequence, eventId: `evt-equipment-snapshot-${equipmentSnapshot.revision}`, source: { layer: 'shim-bridge' }, snapshot: equipmentSnapshot });
          const checked = UiProtocolV2?.validateEventEnvelope ? UiProtocolV2.validateEventEnvelope(equipmentEvent) : { ok: true, errors: [] };
          const currentEquipmentRevision = Number(state.equipment?.revision || 0);
          const currentInventoryRevision = Number(state.inventory?.revision || 0);
          if (checked.ok && equipmentSnapshot.revision < currentEquipmentRevision) {
            effects.push(effect('equipment-snapshot-rejected', { stale: true, revision: equipmentSnapshot.revision, currentRevision: currentEquipmentRevision, errors: [`stale equipment snapshot revision ${equipmentSnapshot.revision} < current ${currentEquipmentRevision}`] }));
          } else if (checked.ok && equipmentSnapshot.inventoryRevision < currentInventoryRevision) {
            effects.push(effect('equipment-snapshot-rejected', { stale: true, inventoryRevision: equipmentSnapshot.inventoryRevision, currentInventoryRevision, errors: [`stale equipment inventory revision ${equipmentSnapshot.inventoryRevision} < current inventory ${currentInventoryRevision}`] }));
          } else if (checked.ok) {
            state.equipment = EquipmentSnapshotAdapter.applyEquipmentSnapshot(state.equipment, equipmentSnapshot, { source: { layer: 'shim-bridge', reason: event.reason }, event: equipmentEvent });
            effects.push(effect('equipment-snapshot', { equipment: EquipmentSnapshotAdapter.cloneEquipmentState(state.equipment), event: equipmentEvent }));
          } else {
            effects.push(effect('equipment-snapshot-rejected', { errors: checked.errors.slice() }));
          }
        }
        const acceptedInventory = InventorySnapshotAdapter?.cloneInventoryState ? InventorySnapshotAdapter.cloneInventoryState(state.inventory) : state.inventory;
        const acceptedEquipment = EquipmentSnapshotAdapter?.cloneEquipmentState ? EquipmentSnapshotAdapter.cloneEquipmentState(state.equipment) : state.equipment;
        if (CommandTransactionModel?.completeFromSnapshots && !staleInventoryUpdate && (event.transactionId || state.activeTransactionId)) {
          const eventTransaction = event.transactionId ? state.commandTransactions?.byId?.get?.(event.transactionId) : null;
          const aliasedTransactionId = event.transactionId ? state.commandTransactionAliases.get(event.transactionId) : undefined;
          const completionId = eventTransaction ? event.transactionId : (aliasedTransactionId || (!event.transactionId ? state.activeTransactionId : undefined));
          const trackedCompletion = state.commandTransactions?.byId?.get?.(completionId);
          const completionEvent = eventTransaction || !completionId ? event : { ...event, transactionId: completionId, bridgedTransactionId: event.transactionId };
          const staleKnownEventTransaction = Boolean(event.transactionId && eventTransaction && state.commandTransactions?.activeId && event.transactionId !== state.commandTransactions.activeId);
          const completedKnownEventTransaction = Boolean(event.transactionId && eventTransaction && eventTransaction.status !== 'pending');
          const unknownExplicitTransaction = Boolean(event.transactionId && !eventTransaction && !aliasedTransactionId);
          const staleAliasedTransaction = Boolean(event.transactionId && aliasedTransactionId && trackedCompletion && trackedCompletion.status !== 'pending');
          const shouldCompleteOrReject = trackedCompletion?.status === 'pending' || staleKnownEventTransaction || completedKnownEventTransaction || unknownExplicitTransaction || staleAliasedTransaction;
          if (shouldCompleteOrReject) {
            if (transactionShouldAwaitVisibleDelta(trackedCompletion, previousInventoryForTransaction, previousEquipmentForTransaction, acceptedInventory, acceptedEquipment)) {
              effects.push(effect('command-transaction-awaiting-public-delta', { transactionId: completionId, semanticAction: trackedCompletion.semanticAction }));
            } else {
              const completion = CommandTransactionModel.completeFromSnapshots(state.commandTransactions, completionEvent, { previousInventory: previousInventoryForTransaction, previousEquipment: previousEquipmentForTransaction, nextInventory: acceptedInventory, nextEquipment: acceptedEquipment });
              state.commandTransactions = completion.state;
              if (completion.effect) effects.push(completion.effect);
              if (completion.transaction?.status === 'completed' || completion.transaction?.status === 'failed') state.activeTransactionId = undefined;
            }
          }
        }
        effects.push(effect('inventory-updated', { items: state.cachedInventoryChoices.slice(), inventory: acceptedInventory, equipment: acceptedEquipment, revision: state.inventory?.revision || event.revision || 0 }), effect('render-menu'));
      } else if (event.name === 'bridge_command') {
        const keycode = Number(event.keycode);
        const key = keycode > 0 && keycode < 127 ? String.fromCharCode(keycode) : '';
        if (keyAnswersActiveInteraction(key)) {
          aliasBridgeTransactionToActive(event);
          noteCommandInteraction('answer-key', event, { lifecycle: state.currentMenu?.awaitingSelection ? 'answering-menu' : 'answering-prompt', key });
          effects.push(effect('command-input-routed-to-active-interaction', { keycode, transactionId: state.activeTransactionId || '' }));
        } else if (event.guiAction && Number(event.guiAction.commandPosition || 0) > 1 && activeNonInventoryTransaction()) {
          aliasBridgeTransactionToActive(event);
          noteCommandInteraction('queued-followup-key', event, { lifecycle: 'queued-semantic-follow-up', key });
          effects.push(effect('command-input-routed-to-active-semantic-sequence', { keycode, transactionId: state.activeTransactionId || '' }));
        } else if (key === 'i' && activeNonInventoryTransaction()) {
          aliasBridgeTransactionToActive(event);
          noteCommandInteraction('refresh-inventory', event, { lifecycle: 'refreshing-public-state', key });
          effects.push(effect('command-input-routed-to-active-transaction-refresh', { keycode, transactionId: state.activeTransactionId || '' }));
        } else {
          state.lastWorldCommand = key;
          const fallbackTransactionId = commandTransactionIdForKey(keycode);
          const commandEvent = { ...event, transactionId: event.transactionId || fallbackTransactionId };
          state.activeTransactionId = commandEvent.transactionId;
          if (CommandTransactionModel?.beginTransaction) {
            const begun = CommandTransactionModel.beginTransaction(state.commandTransactions, commandEvent, { inventoryRevision: state.inventory?.revision || 0, equipmentRevision: state.equipment?.revision || 0 });
            state.commandTransactions = begun.state;
            if (begun.effect) effects.push(begun.effect);
          }
        }
      } else if (event.name === 'bridge_semantic_followup_rejected') {
        rejectCommandFollowup(event, event.reason || 'semantic follow-up rejected before NetHack consumed it', effects);
        if (CommandTransactionModel?.failTransaction && event.transactionId && state.commandTransactions?.activeId === event.transactionId) {
          const failed = CommandTransactionModel.failTransaction(state.commandTransactions, { ...event, name: 'bridge_semantic_followup_rejected' }, event.reason || 'semantic follow-up rejected before NetHack consumed it');
          state.commandTransactions = failed.state;
          if (failed.effect) effects.push(failed.effect);
          if (failed.transaction?.status === 'failed') state.activeTransactionId = undefined;
        }
      } else if (event.name === 'bridge_input_queue_full' || event.name === 'bridge_unsupported_command') {
        if (CommandTransactionModel?.failTransaction) {
          const failed = CommandTransactionModel.failTransaction(state.commandTransactions, event, event.name === 'bridge_input_queue_full' ? 'input queue is full' : 'unsupported command');
          state.commandTransactions = failed.state;
          if (failed.effect) effects.push(failed.effect);
          if (failed.transaction?.status === 'failed') state.activeTransactionId = undefined;
        }
      }
      return { event: appEvent, state, effects };
    }
    function snapshot() { return { mapWidth: width, mapHeight: height, mapWindowId: state.mapWindowId, windowTypes: new Map(state.windowTypes), statusLabels: new Map(state.statusLabels), statusValues: new Map(state.statusValues), mapCells: state.mapCells, mapRevision: state.mapRevision, cursor: { ...state.cursor }, menusByWindow: new Map(state.menusByWindow), textWindowsByWindow: new Map(state.textWindowsByWindow), currentMenu: cloneMenu(state.currentMenu), activePrompt: state.activePrompt ? { ...state.activePrompt } : null, extCommandCatalog: state.extCommandCatalog.slice(), cachedInventoryChoices: state.cachedInventoryChoices.slice(), inventory: InventorySnapshotAdapter?.cloneInventoryState ? InventorySnapshotAdapter.cloneInventoryState(state.inventory) : state.inventory, equipment: EquipmentSnapshotAdapter?.cloneEquipmentState ? EquipmentSnapshotAdapter.cloneEquipmentState(state.equipment) : state.equipment, spellRows: cloneMagicRows(state.spellRows), skillRows: cloneMagicRows(state.skillRows), groundPiles: cloneGroundPileState(), containerContents: cloneContainerContentsState(), messages: state.messages.slice(), milestones: state.milestones.slice(), pendingMenuSelections: new Map(state.pendingMenuSelections), menuLifecyclesByWindow: new Map(state.menuLifecyclesByWindow), activeInteractionRevision: state.activeInteractionRevision, interactionLifecycleRevision: state.interactionLifecycleRevision, activeTransactionId: state.activeTransactionId, commandTransactions: cloneCommandTransactionState(), commandProtocolAcks: state.commandProtocolAcks.map(clonePlainPublic), lastCommandProtocolAck: clonePlainPublic(state.lastCommandProtocolAck), lastCommandProtocolRejection: clonePlainPublic(state.lastCommandProtocolRejection), transferTransactions: cloneTransferTransactionState(), pendingTransferEvidence: clonePendingTransferEvidenceState(), commandTransactionAliases: new Map(state.commandTransactionAliases), lastWorldCommand: state.lastWorldCommand, protocolSequence: state.protocolSequence }; }
    return Object.freeze({ version, state, process, snapshot });
  }
  return Object.freeze({ version, makeEmptyMap, normalizeMapCoord, transferPanelCommandState, transferPanelChoreographyState, transferPanelOptimisticMoveState, createGameViewState });
}));
