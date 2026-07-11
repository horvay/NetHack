(function initCommandTransactionModel(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackCommandTransactionModel = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-command-transaction-model/v1';

  function asPositiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 && Number.isSafeInteger(number) ? number : undefined;
  }
  function asRevision(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && Number.isSafeInteger(number) ? number : 0;
  }
  function cloneMap(map) { return new Map(map || []); }
  function clonePlain(value) {
    if (!value || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }
  function keyFromEvent(event = {}) {
    const keycode = Number(event.keycode);
    if (Number.isFinite(keycode) && keycode > 0 && keycode < 127) return String.fromCharCode(keycode);
    return '';
  }
  function commandNameForKey(key) {
    const names = {
      W: 'wear', T: 'take off', w: 'wield', x: 'swap main and alternate weapon', Q: 'quiver', r: 'read',
      d: 'drop', t: 'throw', P: 'put on accessory', R: 'remove accessory/rub', a: 'apply', q: 'quaff', e: 'eat',
      z: 'zap', f: 'fire', i: 'inventory overview', ',': 'pick up', '#': 'extended command', '\u001b': 'cancel', '\n': 'confirm', '\r': 'confirm', ' ': 'continue',
    };
    return names[key] || (key ? `key ${key}` : 'command');
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
      byId: new Map(),
      lastCompleted: null,
      lastRejected: null,
    };
  }
  function cloneState(state = emptyState()) {
    return {
      revision: asRevision(state.revision),
      activeId: state.activeId,
      byId: new Map(Array.from(state.byId || []).map(([id, tx]) => [id, clonePlain(tx)])),
      lastCompleted: clonePlain(state.lastCompleted),
      lastRejected: clonePlain(state.lastRejected),
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
      semanticActionId: guiAction?.actionId || '',
      guiAction,
      source: event.requestSource || { layer: 'shim-bridge' },
      acceptedAt: now,
      inventoryRevisionBefore: asRevision(context.inventoryRevision),
      equipmentRevisionBefore: asRevision(context.equipmentRevision),
      interactions: [],
    };
    next.activeId = id;
    next.byId.set(id, tx);
    return { state: next, transaction: clonePlain(tx), effect: { type: 'command-transaction-started', transaction: clonePlain(tx) } };
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
    next.byId.set(id, tx);
    return { state: next, transaction: clonePlain(tx), effect: { type: 'command-transaction-updated', transaction: clonePlain(tx) } };
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
    const rejection = { revision: next.revision, transactionId: event.transactionId || '', reason, event: clonePlain(event) };
    next.lastRejected = rejection;
    return { state: next, rejected: rejection, effect: { type: 'command-transaction-completion-rejected', reason, event: clonePlain(event), rejection } };
  }
  function rejectFollowup(state = emptyState(), transactionId, event = {}, reason = 'stale command follow-up') {
    const id = String(transactionId || event.transactionId || state.activeId || '').trim();
    const current = id ? state.byId?.get?.(id) : null;
    const next = cloneState(state);
    next.revision += 1;
    const rejection = { revision: next.revision, transactionId: id, reason, event: clonePlain(event), kind: 'follow-up' };
    if (current && current.status === 'pending') {
      const tx = { ...next.byId.get(id) };
      tx.interactions = Array.isArray(tx.interactions) ? tx.interactions.slice() : [];
      tx.interactions.push({ kind: 'followup-rejected', lifecycle: 'rejected-follow-up', reason, requestId: event.requestId || event.menuRequestId || event.promptId || '', eventName: event.name || '', followupOwnership: followupOwnership(tx, event) });
      next.byId.set(id, tx);
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
    next.byId.set(requestedId, tx);
    next.activeId = undefined;
    next.lastCompleted = clonePlain(tx);
    return { state: next, transaction: clonePlain(tx), effect: { type: 'command-transaction-completed', transaction: clonePlain(tx), result: clonePlain(tx.result), delta: clonePlain(delta) } };
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
    next.byId.set(requestedId, tx);
    next.activeId = undefined;
    next.lastCompleted = clonePlain(tx);
    return { state: next, transaction: clonePlain(tx), effect: { type: 'command-transaction-completed', transaction: clonePlain(tx), result: clonePlain(tx.result) } };
  }

  return Object.freeze({ version, emptyState, cloneState, beginTransaction, noteInteraction, rejectFollowup, completeFromSnapshots, failTransaction, publicStateDelta, commandNameForKey, normalizeGuiAction });
}));
