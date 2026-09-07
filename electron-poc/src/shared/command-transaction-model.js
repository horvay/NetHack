(function initCommandTransactionModel(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackCommandTransactionModel = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-command-transaction-model/v1';
  const immutableValues = new WeakSet();
  const immutableHistoryEntries = new WeakMap();
  const immutableHistoryConstructorToken = Object.freeze({});

  class ImmutableTransactionHistory extends Map {
    constructor(entries = [], updatedId, updatedTransaction, token) {
      super();
      if (token !== immutableHistoryConstructorToken) throw new TypeError('immutable command transaction history construction is internal');
      const backing = new Map(entries);
      if (updatedId !== undefined) backing.set(updatedId, updatedTransaction);
      immutableHistoryEntries.set(this, backing);
      Object.freeze(this);
    }
    get size() { return immutableHistoryEntries.get(this).size; }
    get(id) { return immutableHistoryEntries.get(this).get(id); }
    has(id) { return immutableHistoryEntries.get(this).has(id); }
    entries() { return immutableHistoryEntries.get(this).entries(); }
    keys() { return immutableHistoryEntries.get(this).keys(); }
    values() { return immutableHistoryEntries.get(this).values(); }
    [Symbol.iterator]() { return this.entries(); }
    forEach(callback, thisArg) {
      immutableHistoryEntries.get(this).forEach((transaction, id) => callback.call(thisArg, transaction, id, this));
    }
    set() { throw new TypeError('immutable command transaction history'); }
    delete() { throw new TypeError('immutable command transaction history'); }
    clear() { throw new TypeError('immutable command transaction history'); }
  }

  function asPositiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 && Number.isSafeInteger(number) ? number : undefined;
  }
  function asRevision(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && Number.isSafeInteger(number) ? number : 0;
  }
  function clonePlain(value) {
    if (!value || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }
  function freezeValue(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const key of Reflect.ownKeys(value)) freezeValue(value[key]);
    return Object.freeze(value);
  }
  function immutableValue(value) {
    if (!value || typeof value !== 'object' || immutableValues.has(value)) return value;
    const detached = clonePlain(value);
    freezeValue(detached);
    immutableValues.add(detached);
    return detached;
  }
  function immutableHistory(history) {
    if (history && immutableHistoryEntries.has(history)) return history;
    const entries = history instanceof Map ? Map.prototype.entries.call(history) : (history || []);
    return new ImmutableTransactionHistory(Array.from(entries, ([id, transaction]) => [id, immutableValue(transaction)]), undefined, undefined, immutableHistoryConstructorToken);
  }
  function historyWithEntry(history, id, transaction) {
    const entries = immutableHistoryEntries.get(history);
    if (!entries) throw new TypeError('command transaction history is not owned by this model');
    return new ImmutableTransactionHistory(entries, id, immutableValue(transaction), immutableHistoryConstructorToken);
  }
  function keyFromEvent(event = {}) {
    const keycode = Number(event.keycode);
    if (Number.isFinite(keycode) && keycode > 0 && keycode < 127) return String.fromCharCode(keycode);
    return '';
  }
  function commandNameForKey(key) {
    const names = {
      W: 'wear', T: 'take off', w: 'wield', x: 'swap main and alternate weapon', Q: 'quiver', S: 'save and exit', r: 'read',
      d: 'drop', t: 'throw', P: 'put on accessory', R: 'remove accessory/rub', a: 'apply', q: 'quaff', e: 'eat',
      z: 'zap', f: 'fire', i: 'inventory overview', ',': 'pick up', '#': 'extended command', '\u001b': 'cancel', '\n': 'confirm', '\r': 'confirm', ' ': 'continue',
    };
    return names[key] || (key ? `key ${key}` : 'command');
  }
  function commandActionIdForKey(key) {
    const ids = { S: 'run.save-and-exit' };
    return ids[key] || '';
  }
  function normalizeGuiAction(event = {}) {
    const raw = event.guiAction && typeof event.guiAction === 'object' ? event.guiAction : event;
    const id = String(raw.actionId || raw.guiActionId || raw.id || '').trim();
    const label = String(raw.actionLabel || raw.guiActionLabel || raw.label || '').trim();
    const targetSelector = String(raw.targetSelector || raw.selector || '').trim();
    const targetText = String(raw.targetText || raw.itemText || raw.text || '').trim();
    const source = String(raw.source || raw.guiSource || raw.requestSource?.layer || '').trim();
    const commandPosition = asPositiveInteger(raw.commandPosition);
    const commandLength = asPositiveInteger(raw.commandLength);
    const uiProtocolCommandId = String(raw.uiProtocolCommandId || raw.commandId || '').trim();
    const uiProtocolCommandType = String(raw.uiProtocolCommandType || raw.commandType || '').trim();
    const uiProtocolActionId = String(raw.uiProtocolActionId || '').trim();
    const followupPlan = Array.isArray(raw.followupPlan) ? raw.followupPlan.map((item) => String(item || '').trim()).filter(Boolean) : String(raw.followupPlan || '').split(/[>,|]/).map((item) => item.trim()).filter(Boolean);
    if (!id && !label && !targetSelector && !targetText && !source && !commandPosition && !commandLength && !followupPlan.length && !uiProtocolCommandId) return null;
    return {
      actionId: id,
      label,
      target: { selector: targetSelector, text: targetText },
      followupPlan,
      commandPosition: commandPosition || undefined,
      commandLength: commandLength || undefined,
      source: source || 'gui-semantic-action',
      uiProtocol: uiProtocolCommandId ? {
        commandId: uiProtocolCommandId,
        commandType: uiProtocolCommandType || 'action.execute',
        actionId: uiProtocolActionId || id,
      } : undefined,
    };
  }
  function transactionIdFromEvent(event = {}, fallbackRevision = 0) {
    const explicit = String(event.transactionId || '').trim();
    if (explicit) return explicit;
    const key = keyFromEvent(event) || 'key';
    const safeKey = key.replace(/[^A-Za-z0-9_.:-]+/g, '-') || 'key';
    return `renderer-command-${fallbackRevision || 1}-${safeKey}`;
  }
  function emptyState() {
    return {
      revision: 0,
      activeId: undefined,
      byId: new ImmutableTransactionHistory([], undefined, undefined, immutableHistoryConstructorToken),
      lastCompleted: null,
      lastRejected: null,
    };
  }
  function cloneState(state = emptyState()) {
    return {
      revision: asRevision(state.revision),
      activeId: state.activeId,
      byId: immutableHistory(state.byId),
      lastCompleted: immutableValue(state.lastCompleted),
      lastRejected: immutableValue(state.lastRejected),
    };
  }
  function beginTransaction(state = emptyState(), event = {}, context = {}) {
    const next = cloneState(state);
    next.revision += 1;
    const id = transactionIdFromEvent(event, next.revision);
    const key = keyFromEvent(event);
    const now = context.now ?? Date.now?.() ?? 0;
    const guiAction = normalizeGuiAction(event);
    const tx = {
      transactionId: id,
      revision: next.revision,
      lifecycle: 'accepted',
      status: 'pending',
      commandKey: key,
      semanticAction: commandNameForKey(key),
      semanticActionId: guiAction?.actionId || commandActionIdForKey(key),
      guiAction,
      source: event.requestSource || { layer: 'shim-bridge' },
      acceptedAt: now,
      inventoryRevisionBefore: asRevision(context.inventoryRevision),
      equipmentRevisionBefore: asRevision(context.equipmentRevision),
      interactions: [],
    };
    const storedTransaction = immutableValue(tx);
    next.activeId = id;
    next.byId = historyWithEntry(next.byId, id, storedTransaction);
    return { state: next, transaction: clonePlain(storedTransaction), effect: { type: 'command-transaction-started', transaction: clonePlain(storedTransaction) } };
  }
  function followupOwnership(tx = {}, interaction = {}) {
    const action = tx.guiAction || null;
    if (!action) return undefined;
    const targetSelector = String(action.target?.selector || '').trim();
    const key = String(interaction.key || '').trim();
    return {
      owner: 'gui-semantic-action',
      actionId: action.actionId || '',
      actionLabel: action.label || '',
      targetSelector,
      targetText: action.target?.text || '',
      matchesTargetSelector: Boolean(targetSelector && key && targetSelector === key),
    };
  }
  function noteInteraction(state = emptyState(), transactionId, interaction = {}) {
    const id = String(transactionId || state.activeId || '').trim();
    const current = id ? state.byId?.get?.(id) : null;
    if (!current || current.status !== 'pending') return { state, transaction: current ? clonePlain(current) : null, effect: null };
    const next = cloneState(state);
    const tx = { ...next.byId.get(id) };
    tx.lifecycle = interaction.lifecycle || `awaiting-${interaction.kind || 'interaction'}`;
    tx.interactions = Array.isArray(tx.interactions) ? tx.interactions.slice() : [];
    const ownedInteraction = { ...interaction };
    const ownership = followupOwnership(tx, interaction);
    if (ownership) ownedInteraction.followupOwnership = ownership;
    tx.interactions.push(ownedInteraction);
    const storedTransaction = immutableValue(tx);
    next.byId = historyWithEntry(next.byId, id, storedTransaction);
    return { state: next, transaction: clonePlain(storedTransaction), effect: { type: 'command-transaction-updated', transaction: clonePlain(storedTransaction) } };
  }
  function itemId(item = {}) {
    if (item.objectId != null) return `object:${item.objectId}`;
    if (item.inventoryLetter) return `letter:${item.inventoryLetter}`;
    return `name:${String(item.displayName || '').toLowerCase()}`;
  }
  function publicItemSummary(item = {}) {
    return {
      objectId: item.objectId,
      inventoryLetter: item.inventoryLetter || '',
      displayName: item.displayName || '',
      quantity: item.quantity,
      wornMask: item.wornMask || 0,
      semanticKind: item.semanticKind || '',
      semanticName: item.semanticName || '',
      semanticAppearance: item.semanticAppearance || '',
    };
  }
  function slotSummary(slot = {}) {
    const item = slot.item || {};
    return {
      slotId: slot.slotId || '',
      publicStatus: slot.publicStatus || '',
      objectId: slot.objectId,
      inventoryLetter: item.inventoryLetter || '',
      displayName: item.displayName || '',
    };
  }
  function changed(a, b) { return JSON.stringify(a) !== JSON.stringify(b); }
  function inventoryDelta(previous = {}, next = {}) {
    const beforeItems = Array.isArray(previous.orderedItems) ? previous.orderedItems : [];
    const afterItems = Array.isArray(next.orderedItems) ? next.orderedItems : [];
    const before = new Map(beforeItems.map((item) => [itemId(item), publicItemSummary(item)]));
    const after = new Map(afterItems.map((item) => [itemId(item), publicItemSummary(item)]));
    const added = [];
    const removed = [];
    const changedItems = [];
    for (const [id, item] of after) {
      if (!before.has(id)) added.push(item);
      else if (changed(before.get(id), item)) changedItems.push({ before: before.get(id), after: item });
    }
    for (const [id, item] of before) if (!after.has(id)) removed.push(item);
    return { fromRevision: asRevision(previous.revision), toRevision: asRevision(next.revision), added, removed, changed: changedItems };
  }
  function equipmentDelta(previous = {}, next = {}) {
    const beforeSlots = Array.isArray(previous.orderedSlots) ? previous.orderedSlots : [];
    const afterSlots = Array.isArray(next.orderedSlots) ? next.orderedSlots : [];
    const before = new Map(beforeSlots.map((slot) => [slot.slotId, slotSummary(slot)]));
    const after = new Map(afterSlots.map((slot) => [slot.slotId, slotSummary(slot)]));
    const slotsChanged = [];
    for (const [slotId, slot] of after) {
      const previousSlot = before.get(slotId) || { slotId, publicStatus: 'unknown' };
      if (changed(previousSlot, slot)) slotsChanged.push({ slotId, before: previousSlot, after: slot });
    }
    return { fromRevision: asRevision(previous.revision), toRevision: asRevision(next.revision), slotsChanged };
  }
  function publicStateDelta(previous = {}, next = {}) {
    const inventory = inventoryDelta(previous.inventory, next.inventory);
    const equipment = equipmentDelta(previous.equipment, next.equipment);
    const changedCount = inventory.added.length + inventory.removed.length + inventory.changed.length + equipment.slotsChanged.length;
    return { inventory, equipment, changed: changedCount > 0, changedCount };
  }
  function rejectCompletion(state = emptyState(), event = {}, reason = 'stale command completion') {
    const next = cloneState(state);
    next.revision += 1;
    const rejection = immutableValue({ revision: next.revision, transactionId: event.transactionId || '', reason, event: clonePlain(event) });
    next.lastRejected = rejection;
    return { state: next, rejected: rejection, effect: { type: 'command-transaction-completion-rejected', reason, event: clonePlain(event), rejection } };
  }
  function rejectFollowup(state = emptyState(), transactionId, event = {}, reason = 'stale command follow-up') {
    const id = String(transactionId || event.transactionId || state.activeId || '').trim();
    const current = id ? state.byId?.get?.(id) : null;
    const next = cloneState(state);
    next.revision += 1;
    const rejection = immutableValue({ revision: next.revision, transactionId: id, reason, event: clonePlain(event), kind: 'follow-up' });
    if (current && current.status === 'pending') {
      const tx = { ...next.byId.get(id) };
      tx.interactions = Array.isArray(tx.interactions) ? tx.interactions.slice() : [];
      tx.interactions.push({ kind: 'followup-rejected', lifecycle: 'rejected-follow-up', reason, requestId: event.requestId || event.menuRequestId || event.promptId || '', eventName: event.name || '', followupOwnership: followupOwnership(tx, event) });
      next.byId = historyWithEntry(next.byId, id, tx);
    }
    next.lastRejected = rejection;
    return { state: next, rejected: rejection, transaction: current ? clonePlain(next.byId.get(id)) : null, effect: { type: 'command-transaction-followup-rejected', reason, event: clonePlain(event), rejection } };
  }
  function completeFromSnapshots(state = emptyState(), event = {}, context = {}) {
    const requestedId = String(event.transactionId || state.activeId || '').trim();
    if (!requestedId) return { state, transaction: null, effect: null };
    const current = state.byId?.get?.(requestedId);
    if (!current) return rejectCompletion(state, event, 'transaction id is not active or pending');
    if (current.status !== 'pending') return rejectCompletion(state, event, 'transaction already completed');
    if (event.transactionId && state.activeId && event.transactionId !== state.activeId) return rejectCompletion(state, event, 'transaction id is older than the active command transaction');
    const delta = publicStateDelta({ inventory: context.previousInventory, equipment: context.previousEquipment }, { inventory: context.nextInventory, equipment: context.nextEquipment });
    const next = cloneState(state);
    next.revision += 1;
    const tx = { ...next.byId.get(requestedId) };
    tx.lifecycle = 'completed';
    tx.status = 'completed';
    tx.completedAt = context.now ?? Date.now?.() ?? 0;
    tx.result = {
      status: 'success',
      kind: delta.changed ? 'public-state-updated' : 'public-state-unchanged',
      actionId: tx.guiAction?.actionId || tx.semanticActionId || '',
      actionLabel: tx.guiAction?.label || '',
      target: clonePlain(tx.guiAction?.target || null),
      inventoryRevision: asRevision(context.nextInventory?.revision),
      equipmentRevision: asRevision(context.nextEquipment?.revision),
      delta,
    };
    const storedTransaction = immutableValue(tx);
    next.byId = historyWithEntry(next.byId, requestedId, storedTransaction);
    next.activeId = undefined;
    next.lastCompleted = storedTransaction;
    return { state: next, transaction: clonePlain(storedTransaction), effect: { type: 'command-transaction-completed', transaction: clonePlain(storedTransaction), result: clonePlain(storedTransaction.result), delta: clonePlain(delta) } };
  }
  function createOwnedInputFlow(input = {}) {
    const requestId = String(input.requestId || '').trim();
    const transactionId = String(input.transactionId || '').trim();
    const acknowledgementEvent = String(input.acknowledgementEvent || '').trim();
    const kind = String(input.kind || 'prompt');
    if (!requestId || !transactionId || !acknowledgementEvent) throw new TypeError('owned input flow requires requestId, transactionId, and acknowledgementEvent');
    const menuAnswerFlow = kind === 'menu-cancel' && acknowledgementEvent === 'bridge_menu_answer';
    const windowId = input.window;
    const menuId = String(input.menuId || '').trim();
    const lifecycleRevision = input.lifecycleRevision;
    const menuPurpose = String(input.menuPurpose || '').trim();
    const ownerKind = String(input.ownerKind || '').trim();
    const requestSourceLayer = String(input.requestSourceLayer || '').trim();
    if (menuAnswerFlow && (!Number.isSafeInteger(windowId) || Object.is(windowId, -0) || windowId <= 0 || !menuId || !menuPurpose || !ownerKind || !requestSourceLayer
      || !Number.isSafeInteger(lifecycleRevision) || lifecycleRevision <= 0)) {
      throw new TypeError('owned menu cancellation requires exact window/menu/purpose/owner/source identity and a positive lifecycleRevision');
    }
    return {
      kind,
      requestId,
      transactionId,
      acknowledgementEvent,
      responseKey: String(input.responseKey ?? ''),
      ...(menuAnswerFlow ? {
        window: windowId,
        menuId,
        menuPurpose,
        ownerKind,
        requestSourceLayer,
        lifecycleRevision,
        acknowledgementLifecycle: String(input.acknowledgementLifecycle || 'answered'),
      } : {}),
      requireRevisionAdvance: input.requireRevisionAdvance === true,
      requiredRevisionAdvance: Array.isArray(input.requiredRevisionAdvance) ? input.requiredRevisionAdvance.filter((domain) => domain === 'inventory' || domain === 'equipment') : [],
      requireLinkedEquipmentRevision: input.requireLinkedEquipmentRevision === true,
      status: 'pending',
      baselineRevision: {
        inventory: asRevision(input.baselineRevision?.inventory),
        equipment: asRevision(input.baselineRevision?.equipment),
      },
      stableSignature: '',
    };
  }
  function hasOwn(event, key) { return Object.prototype.hasOwnProperty.call(event, key); }
  function ownExactString(event, key, expected) { return hasOwn(event, key) && typeof event[key] === 'string' && event[key] === expected; }
  function ownExactInteger(event, key, expected) { return hasOwn(event, key) && typeof event[key] === 'number' && Number.isSafeInteger(event[key]) && Object.is(event[key], expected); }
  function exactOwnedMenuCancellation(flow = {}, event = {}) {
    const transportMatches = ownExactString(event, 'name', flow.acknowledgementEvent);
    const requestMatches = ownExactString(event, 'requestId', flow.requestId)
      && ownExactString(event, 'menuRequestId', flow.requestId)
      && (!hasOwn(event, 'promptId') || ownExactString(event, 'promptId', flow.requestId));
    const transactionMatches = ownExactString(event, 'transactionId', flow.transactionId)
      && ownExactString(event, 'inputTransactionId', flow.transactionId);
    const menuIdentityMatches = ownExactInteger(event, 'window', flow.window)
      && ownExactString(event, 'menuId', flow.menuId)
      && (!flow.menuPurpose || ownExactString(event, 'menuPurpose', flow.menuPurpose));
    const lifecycleMatches = ownExactInteger(event, 'lifecycleRevision', flow.lifecycleRevision)
      && ownExactString(event, 'lifecycle', flow.acknowledgementLifecycle || 'answered');
    const ownerMatches = (!flow.ownerKind || (hasOwn(event, 'owner') && event.owner && typeof event.owner === 'object' && !Array.isArray(event.owner)
      && ownExactString(event.owner, 'kind', flow.ownerKind) && ownExactInteger(event.owner, 'window', flow.window)))
      && (!flow.requestSourceLayer || (hasOwn(event, 'requestSource') && event.requestSource && typeof event.requestSource === 'object' && !Array.isArray(event.requestSource)
        && ownExactString(event.requestSource, 'layer', flow.requestSourceLayer) && ownExactInteger(event.requestSource, 'window', flow.window)));
    const ownershipFlagsMatch = hasOwn(event, 'activeRequestMatch') && event.activeRequestMatch === true
      && hasOwn(event, 'inputMatchesMenuTransaction') && event.inputMatchesMenuTransaction === true;
    const ownershipAliasesMatch = [
      ['activeRequestId', flow.requestId],
      ['activeMenuRequestId', flow.requestId],
      ['activePromptRequestId', flow.requestId],
      ['expectedRequestId', flow.requestId],
      ['activeRequestKind', flow.ownerKind],
      ['activeMenuTransactionId', flow.transactionId],
      ['activeRequestTransactionId', flow.transactionId],
      ['activeTransactionId', flow.transactionId],
    ].every(([key, expected]) => !hasOwn(event, key) || ownExactString(event, key, expected));
    const responseMatches = ownExactInteger(event, 'return', 0)
      && ownExactInteger(event, 'selector', 0)
      && ownExactString(event, 'selectors', '')
      && ['selection', 'answer', 'value', 'key'].every((key) => !hasOwn(event, key) || ownExactString(event, key, ''))
      && flow.responseKey === '\u001b';
    return { transportMatches, requestMatches, transactionMatches, menuIdentityMatches, lifecycleMatches, ownerMatches, ownershipFlagsMatch, ownershipAliasesMatch, responseMatches };
  }
  function settleOwnedInputFlow(flow = {}, event = {}) {
    if (flow.status !== 'pending') {
      const duplicate = clonePlain(flow);
      duplicate.status = 'rejected';
      duplicate.rejection = { reason: 'late duplicate acknowledgement', previousStatus: flow.status };
      return { flow: duplicate, ok: false, code: 'late-duplicate', reason: 'owned input flow is already settled' };
    }
    const next = clonePlain(flow);
    const checks = flow.kind === 'menu-cancel' && flow.acknowledgementEvent === 'bridge_menu_answer'
      ? exactOwnedMenuCancellation(flow, event)
      : {
        transportMatches: ownExactString(event, 'name', flow.acknowledgementEvent),
        requestMatches: ownExactString(event, 'requestId', flow.requestId),
        transactionMatches: ownExactString(event, 'transactionId', flow.transactionId),
        responseMatches: false,
      };
    const ok = Object.values(checks).every(Boolean);
    if (!ok) {
      next.status = 'rejected';
      next.rejection = checks;
      const code = !checks.transportMatches ? 'foreign-transport'
        : !checks.requestMatches ? 'unowned-request'
          : !checks.transactionMatches ? 'mismatched-transaction'
            : !checks.menuIdentityMatches ? 'mismatched-menu'
              : !checks.lifecycleMatches ? 'stale-lifecycle'
                : !checks.ownerMatches ? 'mismatched-owner'
                  : !checks.ownershipFlagsMatch ? 'unowned-acknowledgement'
                    : !checks.ownershipAliasesMatch ? 'contradictory-ownership-alias'
                      : 'invalid-response';
      return { flow: next, ok: false, code, reason: 'owned input acknowledgement did not exactly match every authoritative ownership, lifecycle, and response field' };
    }
    next.status = 'acknowledged';
    next.acknowledgement = {
      name: event.name, requestId: flow.requestId, transactionId: flow.transactionId,
      inputTransactionId: event.inputTransactionId, window: event.window, menuId: event.menuId,
      lifecycleRevision: event.lifecycleRevision, responseKey: flow.responseKey,
    };
    return { flow: next, ok: true, code: 'acknowledged' };
  }
  function ownedInventoryItemFingerprint(item = {}) {
    const normalizedName = String(item?.displayName || item?.text || '')
      .replace(/^\s*[A-Za-z$]\s*[-+]\s+/, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const fingerprint = { objectId: item.objectId, normalizedName };
    for (const key of ['semanticKind', 'semanticName', 'semanticAppearance']) {
      if (typeof item[key] === 'string' && item[key]) fingerprint[key] = item[key];
    }
    return JSON.stringify(fingerprint);
  }
  function resolveExactOwnedInventoryItem(selected = {}, snapshot = {}, expectedRevision) {
    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.orderedItems)) return { ok: false, code: 'empty-snapshot', item: null };
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision <= 0 || snapshot.revision !== expectedRevision) return { ok: false, code: 'stale-snapshot', item: null };
    if (typeof selected.objectId !== 'number' || !Number.isSafeInteger(selected.objectId) || selected.objectId <= 0) return { ok: false, code: 'missing-object-id', item: null };
    const item = snapshot.orderedItems.find((candidate) => typeof candidate?.objectId === 'number' && Number.isSafeInteger(candidate.objectId) && candidate.objectId === selected.objectId) || null;
    if (!item) return { ok: false, code: 'target-disappeared', item: null };
    if (ownedInventoryItemFingerprint(selected) !== ownedInventoryItemFingerprint(item)) return { ok: false, code: 'target-mutated', item: null };
    for (const key of ['quantity', 'wornMask']) {
      if (Object.prototype.hasOwnProperty.call(selected, key) && Object.prototype.hasOwnProperty.call(item, key)
        && (!Number.isSafeInteger(Number(selected[key])) || !Number.isSafeInteger(Number(item[key])) || Number(selected[key]) !== Number(item[key]))) {
        return { ok: false, code: 'target-mutated', item: null };
      }
    }
    if (Array.isArray(selected.actionAffordances) && Array.isArray(item.actionAffordances)
      && JSON.stringify(selected.actionAffordances.slice().sort()) !== JSON.stringify(item.actionAffordances.slice().sort())) {
      return { ok: false, code: 'target-mutated', item: null };
    }
    return { ok: true, code: 'exact-target', item: clonePlain(item) };
  }
  function observeOwnedRevisionStability(flow = {}, context = {}) {
    const next = clonePlain(flow);
    if (flow.status !== 'acknowledged' && flow.status !== 'stabilizing') return { flow: next, ready: false, code: 'not-acknowledged' };
    const owner = context.activeInputOwner;
    if (owner) {
      const sameOwner = String(owner.requestId || '') === flow.requestId && String(owner.transactionId || '') === flow.transactionId;
      if (!sameOwner) {
        next.status = 'rejected';
        next.rejection = { reason: 'prompt interposition', owner: clonePlain(owner) };
        return { flow: next, ready: false, code: 'prompt-interposition' };
      }
      next.status = 'stabilizing';
      return { flow: next, ready: false, code: 'owner-still-open' };
    }
    if (context.ownerClosed !== true) {
      next.status = 'stabilizing';
      return { flow: next, ready: false, code: 'owner-close-unconfirmed' };
    }
    const inventory = asRevision(context.revision?.inventory);
    const equipment = asRevision(context.revision?.equipment);
    if (inventory < asRevision(flow.baselineRevision?.inventory) || equipment < asRevision(flow.baselineRevision?.equipment)) {
      next.status = 'rejected';
      next.rejection = { reason: 'stale revision', revision: { inventory, equipment } };
      return { flow: next, ready: false, code: 'stale-revision' };
    }
    const requiredAdvance = flow.requiredRevisionAdvance?.length
      ? flow.requiredRevisionAdvance
      : (flow.requireRevisionAdvance === true ? ['inventory', 'equipment'] : []);
    if ((requiredAdvance.includes('inventory') && inventory <= asRevision(flow.baselineRevision?.inventory))
      || (requiredAdvance.includes('equipment') && equipment <= asRevision(flow.baselineRevision?.equipment))) {
      next.status = 'stabilizing';
      next.stableSignature = '';
      return { flow: next, ready: false, code: 'revision-advance-pending' };
    }
    if (flow.requireLinkedEquipmentRevision === true
      && inventory > 0 && asRevision(context.equipmentInventoryRevision) > 0 && asRevision(context.equipmentInventoryRevision) < inventory) {
      next.status = 'stabilizing';
      next.stableSignature = '';
      return { flow: next, ready: false, code: 'linked-revision-pending' };
    }
    const signature = JSON.stringify({ inventory, equipment, equipmentInventoryRevision: asRevision(context.equipmentInventoryRevision) });
    if (flow.stableSignature !== signature) {
      next.status = 'stabilizing';
      next.stableSignature = signature;
      return { flow: next, ready: false, code: 'revision-observed' };
    }
    next.status = 'ready';
    next.stableRevision = { inventory, equipment };
    return { flow: next, ready: true, code: 'ready', revision: clonePlain(next.stableRevision) };
  }
  function failTransaction(state = emptyState(), event = {}, reason = 'command failed') {
    const requestedId = String(event.transactionId || state.activeId || '').trim();
    const current = requestedId ? state.byId?.get?.(requestedId) : null;
    if (!requestedId || !current) return rejectCompletion(state, event, 'failure did not match an active command transaction');
    if (current.status !== 'pending') return rejectCompletion(state, event, 'failure matched a transaction that is already completed');
    if (event.transactionId && state.activeId && event.transactionId !== state.activeId) return rejectCompletion(state, event, 'failure transaction id is older than the active command transaction');
    const next = cloneState(state);
    next.revision += 1;
    const tx = { ...next.byId.get(requestedId) };
    tx.lifecycle = 'failed';
    tx.status = 'failed';
    tx.completedAt = event.now ?? Date.now?.() ?? 0;
    tx.result = { status: 'failure', kind: event.name || 'command.failure', reason, actionId: tx.guiAction?.actionId || tx.semanticActionId || '', actionLabel: tx.guiAction?.label || '', target: clonePlain(tx.guiAction?.target || null) };
    const storedTransaction = immutableValue(tx);
    next.byId = historyWithEntry(next.byId, requestedId, storedTransaction);
    next.activeId = undefined;
    next.lastCompleted = storedTransaction;
    return { state: next, transaction: clonePlain(storedTransaction), effect: { type: 'command-transaction-completed', transaction: clonePlain(storedTransaction), result: clonePlain(storedTransaction.result) } };
  }

  return Object.freeze({ version, emptyState, cloneState, beginTransaction, noteInteraction, rejectFollowup, completeFromSnapshots, failTransaction, publicStateDelta, commandNameForKey, commandActionIdForKey, normalizeGuiAction, createOwnedInputFlow, settleOwnedInputFlow, observeOwnedRevisionStability, resolveExactOwnedInventoryItem });
}));
