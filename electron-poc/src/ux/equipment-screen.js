(function initUxEquipmentScreen(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(
    require('./item-presentation'),
    require('./item-detail-panel'),
    require('../shared/equipment-snapshot-adapter'),
    require('../shared/inventory-action-service'),
    require('../shared/interaction-model'),
    require('./status-presentation'),
    null,
    null,
  );
  else root.NetHackUxEquipmentScreen = factory(
    root.NetHackUxItemPresentation,
    root.NetHackUxItemDetailPanel,
    root.NetHackEquipmentSnapshotAdapter,
    root.NetHackInventoryActionService,
    root.NetHackInteractionModel,
    root.NetHackUxStatusPresentation,
    root.NetHackUxRuntime,
    root.NetHackUxAppMounts,
  );
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(ItemPresentation, ItemDetailPanel, EquipmentAdapter = {}, InventoryActionService = {}, InteractionModel = {}, StatusPresentation = {}, UxRuntimeModule = null, AppMounts = null) {
  const version = 'nethack-ux-item-equipment-owner/v2';
  const GROUPS = Object.freeze([
    Object.freeze({ id: 'head', label: 'Head & neck', rail: 'left', slots: Object.freeze(['armor.helm', 'eyes', 'amulet']) }),
    Object.freeze({ id: 'layers', label: 'Armor layers', rail: 'left', slots: Object.freeze(['armor.cloak', 'armor.body', 'armor.shirt']) }),
    Object.freeze({ id: 'hands-feet', label: 'Hands & feet', rail: 'left', slots: Object.freeze(['armor.gloves', 'armor.boots', 'armor.shield']) }),
    Object.freeze({ id: 'weapons', label: 'Weapons', rail: 'right', slots: Object.freeze(['mainHand', 'offHand']) }),
    Object.freeze({ id: 'rings', label: 'Rings', rail: 'right', slots: Object.freeze(['ring.left', 'ring.right']) }),
    Object.freeze({ id: 'ready', label: 'Ready', rail: 'right', slots: Object.freeze(['quiver']) }),
  ]);
  const SLOT_LABELS = ItemPresentation.SLOT_LABELS;
  const ACTION_SERVICE_SLOT_IDS = Object.freeze({
    mainHand: 'main-hand', offHand: 'offhand', quiver: 'quiver',
    'armor.body': 'armor-suit', 'armor.cloak': 'cloak', 'armor.shirt': 'shirt',
    'armor.helm': 'helmet', 'armor.gloves': 'gloves', 'armor.boots': 'boots',
    'armor.shield': 'shield', amulet: 'amulet', 'ring.left': 'left-ring',
    'ring.right': 'right-ring', eyes: 'eyes',
  });
  const CLOSE_AFTER_ACTIONS = new Set(['item.apply', 'item.lootOrApply', 'item.quaff', 'item.read.scroll']);

  function element(doc, tag, className, value) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  }
  function list(value, preferredKey) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.[preferredKey])) return value[preferredKey];
    return [];
  }
  function revisionOf(value) {
    const revision = Number(value?.revision);
    return Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
  }
  function inventoryItems(data) { return list(data?.inventory, 'orderedItems'); }
  function equipmentSlots(data) { return list(data?.equipment, 'orderedSlots'); }
  function slotMap(data) { return new Map(equipmentSlots(data).map((slot) => [slot.slotId, slot])); }
  function selectorFor(item) {
    if (typeof item?.inventoryLetter === 'string' && item.inventoryLetter.length === 1) return item.inventoryLetter;
    const code = Number(item?.selector);
    return Number.isInteger(code) && code > 0 && code < 128 ? String.fromCharCode(code) : '';
  }
  function stableIdFor(item) {
    const objectId = Number(item?.objectId);
    if (Number.isSafeInteger(objectId) && objectId >= 0) return `object:${objectId}`;
    const selector = selectorFor(item);
    return selector ? `inventory:${selector}` : '';
  }
  function slotItem(slot, inventoryById) {
    const item = slot?.item || (slot?.objectId != null ? inventoryById.get(slot.objectId) : null);
    if (!item?.publicClass) return item || null;
    const allowed = item.publicClass === 'weapon' ? new Set(['mainHand', 'offHand', 'quiver'])
      : item.publicClass === 'armor' ? new Set(['armor.body', 'armor.cloak', 'armor.shirt', 'armor.helm', 'armor.gloves', 'armor.boots', 'armor.shield'])
        : item.publicClass === 'ring' ? new Set(['ring.left', 'ring.right'])
          : item.publicClass === 'amulet' ? new Set(['amulet'])
            : item.publicClass === 'tool' ? new Set(['mainHand', 'offHand', 'eyes']) : new Set();
    return allowed.has(slot?.slotId) && (!Array.isArray(item.equipmentSlots) || item.equipmentSlots.length === 0 || item.equipmentSlots.includes(slot.slotId)) ? item : null;
  }
  function equippedComparison(selected, items) {
    if (!selected || selected.equippedState || !selected.equipmentSlots?.length) return null;
    return items.find((candidate) => candidate.equippedState && candidate.stableId !== selected.stableId
      && candidate.occupiedEquipmentSlots?.length
      && selected.equipmentSlots.some((slot) => candidate.occupiedEquipmentSlots.includes(slot))) || null;
  }
  function publicDispatchPayload(action, item) {
    return Object.freeze({ action, item: item.dispatchIdentity, stableId: item.stableId });
  }
  function publicBlockerLabel(token) {
    return typeof EquipmentAdapter.publicEquipmentBlockerLabel === 'function'
      ? EquipmentAdapter.publicEquipmentBlockerLabel(token)
      : String(token || '').replace(/^blocked\./, '').replace(/[.-]/g, ' ');
  }
  function applyEquipmentSlotAvailability(model, slots = []) {
    if (!model) return model;
    const removalBlocker = slots.map((slot) => {
      const blockers = Array.isArray(slot?.blockedBy) ? slot.blockedBy : [];
      if (slot?.slotId === 'armor.shirt' && blockers.includes('blocked.armor.bodyOverShirt')) return 'blocked.armor.bodyOverShirt';
      if (slot?.slotId === 'armor.body' && blockers.includes('blocked.armor.cloakOverBody')) return 'blocked.armor.cloakOverBody';
      return '';
    }).find(Boolean);
    if (!removalBlocker) return model;
    const reason = publicBlockerLabel(removalBlocker);
    const actions = Object.freeze((model.actions || []).map((action) => action.id === 'item.takeOff'
      ? Object.freeze({ ...action, enabled: false, disabledReason: reason })
      : action));
    return Object.freeze({ ...model, actions, blockedActions: Object.freeze(actions.filter((action) => !action.enabled)) });
  }
  function emptySlotPresentation(slotId, slot) {
    const blockers = (slot?.blockedBy || []).map(publicBlockerLabel);
    const blockedActions = Object.freeze(blockers.map((reason, index) => Object.freeze({ id: `slot-blocker-${index}`, label: 'Change equipment', enabled: false, disabledReason: reason, section: 'primary', danger: 'safe', shortcut: '' })));
    return Object.freeze({
      stableId: `slot:${slotId}`, selectorAccelerator: '', icon: Object.freeze({ glyph: '◇', alt: '' }),
      displayName: `${slot?.publicStatus === 'blocked' ? 'Blocked' : 'Empty'} ${String(SLOT_LABELS[slotId] || slotId).toLocaleLowerCase()} slot`,
      appearance: '', calledName: '', individualName: '', quantity: 1, filterGroups: Object.freeze([]),
      equippedState: '', ownership: null, equipmentSlots: Object.freeze([slotId]), occupiedEquipmentSlots: Object.freeze([]),
      knownState: 'identified', knownFields: Object.freeze({}), actions: blockedActions, blockedActions,
      dispatchIdentity: Object.freeze({ stableId: `slot:${slotId}`, slotId }),
    });
  }
  function menuIdentity(menu = {}) {
    const requestId = String(menu.requestId || menu.menuRequestId || '').trim();
    if (!requestId) return '';
    return Object.freeze({
      requestId,
      menuRequestId: String(menu.menuRequestId || requestId),
      transactionId: String(menu.transactionId || ''),
      window: Number.isSafeInteger(menu.window) ? menu.window : null,
      menuId: String(menu.menuId || ''),
      lifecycleRevision: Number(menu.lifecycleRevision || 0),
      purpose: String(menu.menuPurpose || menu.purpose || ''),
      ownerKind: String(menu.owner?.kind || ''),
    });
  }
  function exactSameSnapshot(a, b, preferredKey) {
    if (a === b) return true;
    if (revisionOf(a) !== revisionOf(b)) return false;
    const left = list(a, preferredKey);
    const right = list(b, preferredKey);
    if (left.length !== right.length) return false;
    return left.every((entry, index) => JSON.stringify(entry) === JSON.stringify(right[index]));
  }
  function sameMenuIdentity(left, right) {
    return Boolean(left && right
      && left.requestId === right.requestId
      && left.menuRequestId === right.menuRequestId
      && left.transactionId === right.transactionId
      && left.window === right.window
      && left.menuId === right.menuId
      && left.lifecycleRevision === right.lifecycleRevision
      && left.purpose === right.purpose
      && left.ownerKind === right.ownerKind);
  }
  function promptIdentity(prompt) {
    if (!prompt) return null;
    return Object.freeze({
      requestId: String(prompt.requestId || ''),
      transactionId: String(prompt.transactionId || ''),
      window: Number.isSafeInteger(prompt.window) ? prompt.window : null,
      lifecycleRevision: Number(prompt.lifecycleRevision || 0),
      kind: String(prompt.kind || ''),
      purpose: String(prompt.promptPurpose || prompt.purpose || ''),
      query: String(prompt.query || ''),
      choices: String(prompt.choices || ''),
    });
  }
  function samePromptIdentity(left, right) {
    return Boolean(left && right
      && left.requestId === right.requestId
      && left.transactionId === right.transactionId
      && left.window === right.window
      && left.lifecycleRevision === right.lifecycleRevision
      && left.kind === right.kind
      && left.purpose === right.purpose
      && left.query === right.query
      && left.choices === right.choices);
  }
  function promptBelongsToPending(prompt, pending) {
    const identity = promptIdentity(prompt);
    return Boolean(identity?.requestId && identity.transactionId && pending?.transactionId
      && identity.transactionId === pending.transactionId);
  }
  function menuBelongsToPending(menu, pending) {
    const identity = menuIdentity(menu);
    return Boolean(identity?.requestId && identity.transactionId && pending?.transactionId
      && identity.transactionId === pending.transactionId);
  }

  function createController(options = {}) {
    const runtime = options.runtime || UxRuntimeModule?.runtime || null;
    let mount = options.mount || null;
    let root = null;
    let data = Object.freeze({ inventory: null, equipment: null, statusValues: null, messages: Object.freeze([]), avatar: null, iconResolver: null });
    let models = Object.freeze([]);
    let rawByStableId = new Map();
    let activeMode = 'equipment';
    let selectedStableId = '';
    let selectedSlotId = '';
    let query = '';
    let expandedStableId = '';
    let filter = 'all';
    let pending = null;
    let feedback = '';
    let feedbackGood = false;
    let interaction = null;
    let completedPrompt = null;
    let transferOwner = null;
    let contextMenu = null;
    let focusLayer = null;
    let invoker = null;
    let unsubscribe = null;
    let intentSequence = 0;
    let nativeOverviewRequestId = '';
    let closeIntentRequestId = '';
    let deferredExecution = null;
    const diagnostics = [];

    function diagnostic(type, detail = {}) {
      const entry = Object.freeze({ type, detail: Object.freeze({ ...detail }), sequence: diagnostics.length + 1 });
      diagnostics.push(entry);
      if (diagnostics.length > 100) diagnostics.shift();
      try { (data.onDiagnostic || options.onDiagnostic)?.(entry); } catch {}
    }
    function currentMount(doc) {
      if (mount) return mount;
      try { mount = AppMounts?.lookupMount?.('items', doc); } catch {}
      return mount;
    }
    function currentRevisions() {
      return Object.freeze({ inventory: revisionOf(data.inventory), equipment: revisionOf(data.equipment) });
    }
    function resolveItemIcon(item, fallback = {}) {
      if (typeof data.iconResolver !== 'function') return fallback;
      try {
        const resolved = data.iconResolver(item);
        const src = typeof resolved === 'string' ? resolved : resolved?.src;
        if (src) return Object.freeze({ src: String(src), glyph: fallback?.glyph || '', alt: '' });
      } catch (error) {
        diagnostic('item.icon-resolution-failed', { stableId: stableIdFor(item), message: String(error?.message || error) });
      }
      return fallback;
    }
    function selectedModel() {
      if (selectedSlotId) {
        const slot = slotMap(data).get(selectedSlotId);
        const item = slotItem(slot, new Map(inventoryItems(data).map((entry) => [entry.objectId, entry])));
        if (item) {
          const presented = ItemPresentation.presentItem(item, { actionService: InventoryActionService, actionContext: { items: inventoryItems(data) } });
          return applyEquipmentSlotAvailability(Object.freeze({ ...presented, icon: resolveItemIcon(item, presented.icon) }), [slot]);
        }
        return emptySlotPresentation(selectedSlotId, slot);
      }
      return models.find((model) => model.stableId === selectedStableId) || null;
    }
    function preserveSelection(nextModels) {
      if (selectedSlotId && slotMap(data).has(selectedSlotId)) return;
      selectedSlotId = '';
      if (selectedStableId && nextModels.some((model) => model.stableId === selectedStableId)) return;
      selectedStableId = nextModels[0]?.stableId || '';
    }
    function rebuildModels() {
      const items = inventoryItems(data);
      rawByStableId = new Map(items.map((item) => [stableIdFor(item), item]).filter(([stableId]) => stableId));
      const presentedModels = ItemPresentation.presentItems(items, {
        actionService: InventoryActionService,
        actionContext: { items },
      });
      const slotsByObjectId = new Map();
      for (const slot of equipmentSlots(data)) {
        const objectId = slot?.objectId ?? slot?.item?.objectId;
        if (objectId == null || slot.publicStatus === 'empty') continue;
        if (!slotsByObjectId.has(objectId)) slotsByObjectId.set(objectId, []);
        slotsByObjectId.get(objectId).push(slot);
      }
      const nextModels = Object.freeze(presentedModels.map((model, index) => {
        const occupiedSlots = slotsByObjectId.get(model.dispatchIdentity.objectId) || [];
        const withIcon = Object.freeze({ ...model, icon: resolveItemIcon(items[index], model.icon) });
        const adjusted = applyEquipmentSlotAvailability(withIcon, occupiedSlots);
        return Object.freeze({ ...adjusted, occupiedEquipmentSlots: Object.freeze(occupiedSlots.map((slot) => slot.slotId)) });
      }));
      preserveSelection(nextModels);
      models = nextModels;
    }
    function acceptInventory(next) {
      if (!next) return false;
      const nextRevision = revisionOf(next);
      const currentRevision = revisionOf(data.inventory);
      if (!nextRevision) { diagnostic('snapshot.inventory.rejected', { code: 'missing-revision' }); return false; }
      if (nextRevision < currentRevision || (nextRevision === currentRevision && !exactSameSnapshot(data.inventory, next, 'orderedItems'))) {
        diagnostic('snapshot.inventory.rejected', { code: nextRevision < currentRevision ? 'stale-revision' : 'conflicting-revision', currentRevision, nextRevision });
        return false;
      }
      if (nextRevision === currentRevision) return false;
      data = Object.freeze({ ...data, inventory: next });
      diagnostic('snapshot.inventory.accepted', { revision: nextRevision, count: list(next, 'orderedItems').length });
      return true;
    }
    function acceptEquipment(next) {
      if (!next) return false;
      const nextRevision = revisionOf(next);
      const currentRevision = revisionOf(data.equipment);
      const inventoryRevision = revisionOf(data.inventory);
      const linkedRevision = Number(next.inventoryRevision || 0);
      if (!nextRevision) { diagnostic('snapshot.equipment.rejected', { code: 'missing-revision' }); return false; }
      if (linkedRevision && inventoryRevision && linkedRevision < inventoryRevision) {
        diagnostic('snapshot.equipment.rejected', { code: 'stale-inventory-link', inventoryRevision, linkedRevision });
        return false;
      }
      if (nextRevision < currentRevision || (nextRevision === currentRevision && !exactSameSnapshot(data.equipment, next, 'orderedSlots'))) {
        diagnostic('snapshot.equipment.rejected', { code: nextRevision < currentRevision ? 'stale-revision' : 'conflicting-revision', currentRevision, nextRevision });
        return false;
      }
      if (nextRevision === currentRevision) return false;
      data = Object.freeze({ ...data, equipment: next });
      diagnostic('snapshot.equipment.accepted', { revision: nextRevision, inventoryRevision: linkedRevision, count: list(next, 'orderedSlots').length });
      return true;
    }
    function completePending(message = '') {
      if (!pending) return false;
      const completed = pending;
      feedback = message || `${completed.label || 'Item action'} complete.`;
      feedbackGood = true;
      completedPrompt = completed.followupPromptCorrelation && samePromptIdentity(completed.followupPromptCorrelation, promptIdentity(interaction?.prompt)) ? completed.followupPromptCorrelation : null;
      diagnostic('item.action-completed', { intentId: completed.intentId, actionId: completed.actionId, stableId: completed.stableId });
      pending = null;
      deferredExecution = null;
      if (CLOSE_AFTER_ACTIONS.has(completed.actionId) && root?.isConnected && !root.hidden) {
        close({ reason: `${completed.actionId}-completed`, cancelNative: false });
        return true;
      }
      if (root?.isConnected) render({ skipFocus: true });
      return true;
    }
    function rejectPending(reason, code = 'rejected') {
      const rejected = pending;
      pending = null;
      deferredExecution = null;
      interaction = null;
      feedback = String(reason || 'NetHack rejected that item action. Review the current inventory and try again.');
      feedbackGood = false;
      diagnostic('item.action-rejected', { code, intentId: rejected?.intentId || '', actionId: rejected?.actionId || '', stableId: rejected?.stableId || '' });
      if (root?.isConnected) render({ skipFocus: true });
      return false;
    }
    function reconcile(next = {}) {
      const previousInventoryRevision = revisionOf(data.inventory);
      const previousEquipmentRevision = revisionOf(data.equipment);
      const iconResolverChanged = Object.prototype.hasOwnProperty.call(next, 'iconResolver') && data.iconResolver !== next.iconResolver;
      const interactionChanged = Object.prototype.hasOwnProperty.call(next, 'interaction');
      const transferOwnerChanged = Object.prototype.hasOwnProperty.call(next, 'transferOwner');
      const statusValuesChanged = Object.prototype.hasOwnProperty.call(next, 'statusValues') && data.statusValues !== next.statusValues;
      const messagesChanged = Object.prototype.hasOwnProperty.call(next, 'messages') && data.messages !== next.messages;
      if (Object.prototype.hasOwnProperty.call(next, 'onIntent')) data = Object.freeze({ ...data, onIntent: next.onIntent });
      if (Object.prototype.hasOwnProperty.call(next, 'onDiagnostic')) data = Object.freeze({ ...data, onDiagnostic: next.onDiagnostic });
      if (Object.prototype.hasOwnProperty.call(next, 'avatar')) data = Object.freeze({ ...data, avatar: next.avatar });
      if (Object.prototype.hasOwnProperty.call(next, 'iconResolver')) data = Object.freeze({ ...data, iconResolver: next.iconResolver });
      if (Object.prototype.hasOwnProperty.call(next, 'statusValues')) data = Object.freeze({ ...data, statusValues: next.statusValues || null });
      if (Object.prototype.hasOwnProperty.call(next, 'messages')) data = Object.freeze({ ...data, messages: Array.isArray(next.messages) ? next.messages : Object.freeze([]) });
      const inventoryChanged = acceptInventory(next.inventory);
      const equipmentChanged = acceptEquipment(next.equipment);
      if (inventoryChanged || equipmentChanged || iconResolverChanged) rebuildModels();
      if (Object.prototype.hasOwnProperty.call(next, 'transferOwner')) transferOwner = next.transferOwner?.active === false ? null : (next.transferOwner || null);
      if (Object.prototype.hasOwnProperty.call(next, 'interaction')) interaction = next.interaction || null;
      if (completedPrompt && !samePromptIdentity(completedPrompt, promptIdentity(interaction?.prompt))) completedPrompt = null;
      if (pending && CLOSE_AFTER_ACTIONS.has(pending.actionId)) {
        const currentPrompt = promptIdentity(interaction?.prompt);
        const currentMenu = interaction?.menu?.awaitingSelection ? menuIdentity(interaction.menu) : null;
        const promptFollowupAdvanced = Boolean(pending.followupPromptCorrelation
          && ((currentPrompt && promptBelongsToPending(interaction.prompt, pending) && currentPrompt.requestId !== pending.followupPromptCorrelation.requestId)
            || (currentMenu && menuBelongsToPending(interaction.menu, pending))));
        const menuFollowupAdvanced = Boolean(pending.followupCorrelation
          && ((currentMenu && menuBelongsToPending(interaction.menu, pending) && currentMenu.requestId !== pending.followupCorrelation.requestId)
            || (currentPrompt && promptBelongsToPending(interaction.prompt, pending))));
        if (promptFollowupAdvanced || menuFollowupAdvanced) {
          close({ reason: `${pending.actionId}-post-selection-followup`, cancelNative: false });
        }
      }
      if (pending && interaction?.menu?.awaitingSelection) {
        const identity = menuIdentity(interaction.menu);
        if (pending.followupCorrelation && !sameMenuIdentity(pending.followupCorrelation, identity)) {
          rejectPending('The native item follow-up changed before selection.', 'stale-followup');
        } else if (!pending.followupCorrelation && menuBelongsToPending(interaction.menu, pending)) {
          pending = Object.freeze({ ...pending, phase: 'awaiting-followup', followupCorrelation: identity });
          diagnostic('item.followup-opened', { intentId: pending.intentId, requestId: identity.requestId, transactionId: identity.transactionId, kind: 'menu' });
        }
      }
      if (pending && interaction?.prompt) {
        const identity = promptIdentity(interaction.prompt);
        if (pending.followupPromptCorrelation && !samePromptIdentity(pending.followupPromptCorrelation, identity)) {
          rejectPending('The native item follow-up changed before selection.', 'stale-followup');
        } else if (!pending.followupPromptCorrelation
          && promptBelongsToPending(interaction.prompt, pending)
          && InteractionModel.selectorSet?.(interaction.prompt.query, interaction.prompt.choices)?.has(pending.selector)) {
          pending = Object.freeze({ ...pending, phase: 'awaiting-followup', followupPromptCorrelation: identity });
          diagnostic('item.followup-opened', { intentId: pending.intentId, requestId: identity.requestId, transactionId: identity.transactionId, kind: 'prompt' });
        }
      }
      if (pending?.phase === 'waiting-overview-close' && deferredExecution) {
        const overview = menuIdentity(interaction?.menu || {});
        if (overview && overview.requestId === nativeOverviewRequestId) {
          // The owner already emitted the exact cancellation when it opened.
          // Keep the requested action queued until NetHack closes that menu.
        } else if (interaction?.prompt || interaction?.menu?.awaitingSelection) {
          rejectPending('A different NetHack prompt or menu opened before that item action could start.', 'input-owner-changed');
        } else {
          dispatchDeferredExecution();
        }
      }
      if (transferOwner && root && !root.hidden) close({ reason: 'transfer-owner-precedence', cancelNative: false });
      if (pending) {
        const nowInventoryRevision = revisionOf(data.inventory);
        const nowEquipmentRevision = revisionOf(data.equipment);
        if (nowInventoryRevision < pending.expectedRevision.inventory || nowEquipmentRevision < pending.expectedRevision.equipment) {
          rejectPending('Inventory changed to an older revision while the action was pending.', 'stale-revision');
        } else if (nowInventoryRevision > pending.expectedRevision.inventory || nowEquipmentRevision > pending.expectedRevision.equipment) {
          completePending(`${pending.label || 'Item action'} complete.`);
        }
      }
      if ((inventoryChanged || equipmentChanged || statusValuesChanged || messagesChanged || interactionChanged || transferOwnerChanged || iconResolverChanged) && root && !root.hidden) render({ skipFocus: true });
      return Object.freeze({ inventoryAccepted: inventoryChanged, equipmentAccepted: equipmentChanged, previousInventoryRevision, previousEquipmentRevision, ownership: ownership() });
    }
    function filteredModels() { return models.filter((model) => ItemPresentation.matchesItem(model, query, filter)); }
    function closeContextMenu({ restore = true } = {}) {
      if (!contextMenu) return false;
      const returnTarget = contextMenu.__returnTarget;
      focusLayer?.close?.(contextMenu, { restore: false });
      contextMenu.remove();
      contextMenu = null;
      if (restore && returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
      return true;
    }
    function emitIntent(intent) {
      const dispatch = data.onIntent || options.onIntent;
      if (typeof dispatch !== 'function') {
        if (intent.type === 'execute-item-action' || intent.type === 'select-native-followup') rejectPending('The item/equipment transport is not connected.', 'unwired');
        diagnostic('item.intent-unwired', { type: intent.type });
        return false;
      }
      try {
        const result = dispatch(Object.freeze(intent));
        if (result && typeof result.then === 'function') {
          result.then((accepted) => settle({ intentId: intent.intentId, accepted: accepted !== false })).catch((error) => settle({ intentId: intent.intentId, accepted: false, reason: String(error?.message || error) }));
        } else if ((intent.type === 'execute-item-action' || intent.type === 'select-native-followup') && result === false) settle({ intentId: intent.intentId, accepted: false });
        return result !== false;
      } catch (error) {
        if (intent.type === 'execute-item-action' || intent.type === 'select-native-followup') settle({ intentId: intent.intentId, accepted: false, reason: String(error?.message || error) });
        diagnostic('item.intent-failed', { type: intent.type, message: String(error?.message || error) });
        return false;
      }
    }
    function fullAffordance(item, actionId) {
      return (InventoryActionService.itemActionAffordances?.(item, { items: inventoryItems(data) }) || []).find((entry) => entry.id === actionId) || null;
    }
    function dispatchDeferredExecution() {
      if (!pending || !deferredExecution) return false;
      const execution = deferredExecution;
      deferredExecution = null;
      pending = Object.freeze({ ...pending, phase: 'dispatching' });
      feedback = `${pending.label}…`;
      feedbackGood = true;
      render({ skipFocus: true });
      return emitIntent(execution);
    }
    function beginIntent({ item, action, route, source, stableId, label }) {
      const command = String(route?.command || action?.execution?.keys || '');
      if (!route?.ok && route?.ok !== undefined) return rejectPending(route.reason || route.disabledReason || 'That action is not available.', route.code || 'route-rejected');
      if (!command) {
        feedback = route?.message || `${label || action?.label || 'Item'}: no turn spent.`;
        feedbackGood = true;
        render({ skipFocus: true });
        return true;
      }
      const intentId = `item-equipment-${++intentSequence}`;
      const overview = menuIdentity(interaction?.menu || {});
      const waitingForOverview = Boolean(overview && overview.requestId === nativeOverviewRequestId);
      pending = Object.freeze({
        intentId,
        transactionId: intentId,
        actionId: action?.id || route?.actionId || '',
        stableId,
        selector: selectorFor(item),
        expectedRevision: currentRevisions(),
        label: label || route?.label || action?.label || 'Item action',
        phase: waitingForOverview ? 'waiting-overview-close' : 'dispatching',
      });
      interaction = waitingForOverview ? interaction : null;
      deferredExecution = Object.freeze({
        type: 'execute-item-action', intentId, transactionId: intentId, source,
        action: Object.freeze({ id: pending.actionId, label: pending.label, promptPlan: action?.promptPlan || [] }),
        item,
        route: Object.freeze({ ...route, command }),
        command,
        expectedRevision: pending.expectedRevision,
      });
      feedback = waitingForOverview ? `${pending.label} queued while NetHack closes the inventory overview.` : `${pending.label}…`;
      feedbackGood = true;
      diagnostic('item.action-planned', { intentId, actionId: pending.actionId, stableId, expectedRevision: pending.expectedRevision, waitingForOverview });
      if (waitingForOverview) {
        render({ skipFocus: true });
        return true;
      }
      return dispatchDeferredExecution();
    }
    function request(requested = {}) {
      if (transferOwner) { feedback = 'Finish the active transfer before using inventory or equipment.'; feedbackGood = false; render({ skipFocus: true }); return false; }
      if (pending) { feedback = 'Finish the current item action before starting another.'; feedbackGood = false; render({ skipFocus: true }); return false; }
      completedPrompt = null;
      const requestedRevision = Number(requested.inventoryRevision || revisionOf(data.inventory));
      if (!requestedRevision || requestedRevision !== revisionOf(data.inventory)) {
        feedback = 'Inventory changed before that action could be planned. Review the current items and try again.';
        feedbackGood = false;
        diagnostic('item.action-rejected', { code: 'stale-revision', requestedRevision, currentRevision: revisionOf(data.inventory) });
        render({ skipFocus: true });
        return false;
      }
      const stableId = String(requested.stableId || '');
      const item = rawByStableId.get(stableId);
      if (!item || !selectorFor(item)) {
        feedback = 'That exact inventory item is no longer available.';
        feedbackGood = false;
        diagnostic('item.action-rejected', { code: 'stale-item', stableId });
        render({ skipFocus: true });
        return false;
      }
      if (requested.kind === 'primary-equipment') {
        const route = InventoryActionService.primaryEquipmentActionForItem?.(item, { items: inventoryItems(data) });
        if (!route) return rejectPending('That item has no available equipment action.', 'route-rejected');
        return beginIntent({ item, action: { id: route.actionId, label: route.label }, route: { ...route, ok: route.enabled !== false }, source: 'item-equipment-primary', stableId, label: route.label });
      }
      if (requested.kind === 'equipment-drop') {
        const slotId = String(requested.slotId || '');
        const route = InventoryActionService.routeEquipmentDrop?.(item, { id: ACTION_SERVICE_SLOT_IDS[slotId] || slotId, label: SLOT_LABELS[slotId] || slotId }, { items: inventoryItems(data) });
        return beginIntent({ item, action: { id: route?.actionId || 'equipment.drop', label: route?.message || 'Change equipment' }, route, source: 'item-equipment-drop', stableId, label: route?.message });
      }
      if (requested.kind === 'slot-action') {
        const slot = slotMap(data).get(String(requested.slotId || ''));
        const slotRawItem = slotItem(slot, new Map(inventoryItems(data).map((entry) => [entry.objectId, entry]))) || item;
        const actionServiceSlotId = ACTION_SERVICE_SLOT_IDS[requested.slotId] || requested.slotId;
        const route = InventoryActionService.routeEquipmentSlotAction?.(requested.actionId, { id: actionServiceSlotId, label: SLOT_LABELS[requested.slotId] || actionServiceSlotId, item: slotRawItem }, { items: inventoryItems(data) });
        return beginIntent({ item: slotRawItem, action: { id: requested.actionId, label: requested.label || requested.actionId }, route, source: 'item-equipment-slot', stableId: stableIdFor(slotRawItem), label: route?.message || requested.label });
      }
      const currentAffordance = fullAffordance(item, requested.actionId);
      const presentedAffordance = models.find((model) => model.stableId === stableId)?.actions.find((action) => action.id === requested.actionId);
      const affordance = presentedAffordance
        ? Object.freeze({ ...currentAffordance, ...presentedAffordance, execution: currentAffordance?.execution || presentedAffordance.route })
        : currentAffordance;
      if (!affordance || affordance.enabled === false) {
        feedback = affordance?.disabledReasonLabel || affordance?.disabledReason || 'That action is not available for this item.';
        feedbackGood = false;
        render({ skipFocus: true });
        return false;
      }
      if (affordance.consumesTurn === 'no' && !affordance.execution?.keys) {
        feedback = `${affordance.label}: no turn spent.`;
        feedbackGood = true;
        diagnostic('item.local-action-completed', { actionId: affordance.id, stableId });
        render({ skipFocus: true });
        return true;
      }
      const route = InventoryActionService.routeInventoryAction?.(item, affordance, { items: inventoryItems(data), slotId: requested.slotId }) || { ok: true, actionId: affordance.id, command: affordance.execution?.keys || '', label: affordance.label };
      return beginIntent({ item, action: affordance, route: requested.slotId ? { ...route, slotId: requested.slotId } : route, source: 'item-equipment-action', stableId, label: affordance.label });
    }
    function settle(result = {}) {
      if (!pending) return false;
      const resultIntentId = String(result.intentId || '');
      if (resultIntentId && resultIntentId !== pending.intentId && resultIntentId !== pending.followupIntentId) return false;
      if (result.accepted === false || result.status === 'rejected' || result.status === 'failure') return rejectPending(result.reason || 'NetHack rejected that item action.', result.code || 'transport-rejected');
      if (result.status === 'completed') return completePending(result.message || `${pending.label} complete.`);
      pending = Object.freeze({ ...pending, phase: pending.followupIntentId === resultIntentId ? 'followup-accepted' : 'accepted' });
      diagnostic('item.action-accepted', { intentId: pending.intentId, actionId: pending.actionId });
      if (root?.isConnected) render({ skipFocus: true });
      return true;
    }
    function selectFollowup(item) {
      if (!pending) return false;
      let identity = null;
      let type = '';
      if (interaction?.menu && pending.followupCorrelation) {
        identity = menuIdentity(interaction.menu);
        if (!sameMenuIdentity(pending.followupCorrelation, identity)) return rejectPending('The native item follow-up changed before selection.', 'stale-followup');
        type = 'select-native-followup';
      } else if (interaction?.prompt && pending.followupPromptCorrelation) {
        identity = promptIdentity(interaction.prompt);
        if (!samePromptIdentity(pending.followupPromptCorrelation, identity)) return rejectPending('The native item follow-up changed before selection.', 'stale-followup');
        type = 'select-native-prompt-followup';
      } else return false;
      const selector = selectorFor(item);
      if (!selector) return rejectPending('The selected native row has no exact NetHack selector.', 'missing-selector');
      const intentId = `${pending.intentId}-followup-${++intentSequence}`;
      pending = Object.freeze({ ...pending, phase: 'followup-dispatching', followupRequestId: identity.requestId, followupIntentId: intentId });
      render({ skipFocus: true });
      return emitIntent({
        type, intentId, transactionId: identity.transactionId || pending.transactionId,
        expectedRequestId: identity.requestId, correlation: identity, selector, command: selector,
        item: Object.freeze({ ...item, inventoryLetter: selector, selector: selector.charCodeAt(0) }),
        action: Object.freeze({ id: `${pending.actionId}.followup`, label: pending.label }),
        route: Object.freeze({ actionId: pending.actionId, selector, command: selector }),
        expectedRevision: pending.expectedRevision,
      });
    }
    function ownership() {
      const menuIdentityNow = interaction?.menu?.awaitingSelection ? menuIdentity(interaction.menu) : null;
      const promptIdentityNow = promptIdentity(interaction?.prompt);
      const ownsMenu = Boolean(pending?.followupCorrelation && sameMenuIdentity(pending.followupCorrelation, menuIdentityNow));
      const ownsPendingPrompt = Boolean(pending?.followupPromptCorrelation && samePromptIdentity(pending.followupPromptCorrelation, promptIdentityNow));
      const ownsCompletedPrompt = samePromptIdentity(completedPrompt, promptIdentityNow);
      return Object.freeze({
        id: pending?.transactionId || completedPrompt?.transactionId || completedPrompt?.requestId || nativeOverviewRequestId || '',
        active: Boolean(root && !root.hidden),
        ownsPrompt: Boolean(ownsPendingPrompt || ownsCompletedPrompt),
        ownsMenu,
        requestId: (ownsMenu ? menuIdentityNow?.requestId : '') || (ownsPendingPrompt ? promptIdentityNow?.requestId : '') || completedPrompt?.requestId || '',
      });
    }

    function renderIcon(doc, model) {
      const box = element(doc, 'span', 'uxm-item-icon');
      box.setAttribute('aria-hidden', 'true');
      const fallbackGlyph = model.icon?.glyph && model.icon.glyph !== '·' ? model.icon.glyph : '';
      const showFallback = () => {
        box.replaceChildren();
        box.dataset.iconSource = fallbackGlyph ? 'glyph' : 'none';
        if (fallbackGlyph) box.textContent = fallbackGlyph;
        else box.classList.add('is-empty');
      };
      if (model.icon?.src) {
        const img = element(doc, 'img', '');
        img.src = model.icon.src;
        img.alt = '';
        img.width = 32;
        img.height = 32;
        img.decoding = 'async';
        img.addEventListener('error', showFallback, { once: true });
        box.dataset.iconSource = 'resolved';
        box.appendChild(img);
      } else showFallback();
      return box;
    }
    function safeShortcut(shortcut) {
      const value = String(shortcut || '');
      return value && value.length <= 2 && !/[\n\u001b]/.test(value) ? value : '';
    }
    function isDangerousAction(action) {
      return ['caution', 'serious', 'dangerous'].includes(action?.danger);
    }
    function isReferenceAction(action) {
      return /(?:inspect|encyclopedia|name|call|adjust)/i.test(`${action?.id || ''} ${action?.label || ''}`);
    }
    function compactRailActionLabel(action) {
      const identity = `${action?.id || ''} ${action?.label || ''}`;
      if (/(?:wield|hold in hand)/i.test(identity)) return 'Wield / hold';
      if (/(?:quiver|ready to fire)/i.test(identity)) return 'Ready';
      if (/(?:\bfire\b|shoot readied)/i.test(identity)) return 'Fire / shoot';
      if (/\bthrow\b/i.test(identity)) return 'Throw';
      if (/(?:engrave|write with)/i.test(identity)) return 'Engrave';
      return action?.label || 'Use';
    }
    function renderRailAction(doc, item, action, className = '', label = action.label) {
      const button = element(doc, 'button', className, label);
      button.type = 'button';
      button.dataset.actionId = action.id;
      button.disabled = Boolean(pending) || action.enabled === false;
      if (action.enabled === false && action.disabledReason) button.title = action.disabledReason;
      if (label !== action.label) {
        button.setAttribute('aria-label', action.label);
        button.title = action.label;
      }
      const shortcut = safeShortcut(action.shortcut);
      if (shortcut) button.append(' ', element(doc, 'kbd', 'uxm-action-key', shortcut));
      button.addEventListener('click', () => {
        if (!button.disabled) request({ kind: 'item-action', stableId: item.stableId, actionId: action.id, inventoryRevision: revisionOf(data.inventory) });
      });
      return button;
    }
    function appendKnownFactBadges(container, item) {
      for (const fact of ItemPresentation.factRows(item)) {
        if (!Object.prototype.hasOwnProperty.call(item.knownFields || {}, fact.id)) continue;
        if (String(item.displayName || '').toLowerCase().includes(String(fact.value || '').toLowerCase())) continue;
        const label = fact.id === 'beatitude' ? fact.value : `${fact.label} ${fact.value}`;
        container.appendChild(element(container.ownerDocument, 'span', `uxm-known-state uxm-known-${fact.id}`, label));
      }
    }
    function recentMessageLines() {
      const messages = Array.isArray(data.messages) ? data.messages : [];
      return messages.slice(-8)
        .map((entry) => String(entry?.canonicalText ?? entry?.text ?? entry ?? '').trim())
        .filter(Boolean);
    }
    function renderRecentLog(doc) {
      const panel = element(doc, 'section', 'uxm-recent-log');
      panel.setAttribute('aria-labelledby', 'uxm-recent-log-title');
      const heading = element(doc, 'div', 'uxm-recent-log-heading');
      const title = element(doc, 'h3', '', 'Recent messages');
      title.id = 'uxm-recent-log-title';
      heading.append(title, element(doc, 'span', '', 'Newest at bottom'));
      const viewport = element(doc, 'div', 'uxm-recent-log-scroll');
      viewport.setAttribute('role', 'log');
      viewport.setAttribute('aria-live', 'off');
      viewport.setAttribute('aria-label', 'Recent NetHack messages, newest at bottom');
      viewport.tabIndex = 0;
      const lines = recentMessageLines();
      if (!lines.length) viewport.appendChild(element(doc, 'p', 'uxm-recent-log-empty', 'No messages yet.'));
      else {
        const listRoot = element(doc, 'ol', 'uxm-recent-log-lines');
        for (const line of lines) listRoot.appendChild(element(doc, 'li', '', line));
        viewport.appendChild(listRoot);
      }
      panel.append(heading, viewport);
      return panel;
    }
    function renderSelectionRail(doc) {
      const rail = element(doc, 'section', 'uxm-inventory-details uxm-selection-rail');
      const item = selectedModel();
      if (!item) {
        rail.append(element(doc, 'div', 'uxm-selection-summary', ''));
        const empty = rail.querySelector('.uxm-selection-summary');
        empty.append(element(doc, 'h3', 'uxm-detail-title', 'Selected item'), element(doc, 'p', 'uxm-detail-empty', 'Choose an inventory row or equipment slot to see its available actions.'));
        return rail;
      }

      rail.dataset.selectedStableId = item.stableId;
      const summary = element(doc, 'div', 'uxm-selection-summary');
      const titleWrap = element(doc, 'div', 'uxm-detail-title-wrap');
      titleWrap.append(element(doc, 'span', 'uxm-detail-kicker', selectedSlotId ? (SLOT_LABELS[selectedSlotId] || selectedSlotId) : 'Selected item'), element(doc, 'h3', 'uxm-detail-title', item.displayName));
      const essentials = element(doc, 'div', 'uxm-selection-state');
      if (item.quantity > 1) essentials.appendChild(element(doc, 'span', '', `Quantity ${item.quantity}`));
      if (item.knownState === 'appearance') essentials.appendChild(element(doc, 'span', 'uxm-identity-state', 'Unidentified'));
      if (item.equippedState) essentials.appendChild(element(doc, 'span', '', item.equippedState));
      if (item.ownership?.state && item.ownership.state !== 'owned') essentials.appendChild(element(doc, 'span', 'uxm-ownership-state', item.ownership.state === 'unpaid' ? 'Unpaid' : 'For sale'));
      appendKnownFactBadges(essentials, item);
      if (essentials.childNodes.length) titleWrap.appendChild(essentials);
      summary.appendChild(titleWrap);

      const actionsRoot = element(doc, 'div', 'uxm-detail-actions uxm-selection-actions');
      const primary = ItemDetailPanel.primaryAction(item.actions);
      const common = item.actions.filter((action) => action !== primary && action.enabled && !isDangerousAction(action) && !isReferenceAction(action)).slice(0, 2);
      const shown = new Set([primary, ...common].filter(Boolean));
      const moreActions = item.actions.filter((action) => !shown.has(action));
      if (primary) actionsRoot.appendChild(renderRailAction(doc, item, primary, 'uxm-action-primary', compactRailActionLabel(primary)));
      for (const action of common) actionsRoot.appendChild(renderRailAction(doc, item, action, 'uxm-action-secondary', compactRailActionLabel(action)));

      const facts = ItemPresentation.factRows(item);
      const comparison = ItemPresentation.compareItems(item, equippedComparison(item, models));
      if (moreActions.length || facts.length || comparison.length) {
        const disclosure = element(doc, 'details', 'uxm-action-disclosure');
        disclosure.open = expandedStableId === item.stableId;
        disclosure.addEventListener('toggle', () => { expandedStableId = disclosure.open ? item.stableId : ''; });
        const disclosureSummary = element(doc, 'summary', '', 'More actions');
        disclosureSummary.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          disclosure.open = !disclosure.open;
          expandedStableId = disclosure.open ? item.stableId : '';
        });
        disclosure.appendChild(disclosureSummary);
        const panel = element(doc, 'div', 'uxm-rail-more-panel');
        if (moreActions.length) {
          const actionList = element(doc, 'div', 'uxm-rail-more-actions');
          for (const action of moreActions) {
            const row = element(doc, 'div', `uxm-rail-more-action${isDangerousAction(action) ? ' is-dangerous' : ''}${action.enabled === false ? ' is-blocked' : ''}`);
            row.appendChild(renderRailAction(doc, item, action, isDangerousAction(action) ? 'uxm-action-danger' : 'uxm-action-secondary'));
            if (action.enabled === false && action.disabledReason) row.appendChild(element(doc, 'span', '', action.disabledReason));
            actionList.appendChild(row);
          }
          panel.appendChild(actionList);
        }
        if (facts.length) {
          const factsSection = element(doc, 'section', 'uxm-rail-facts');
          factsSection.appendChild(element(doc, 'h4', '', 'Known details'));
          const list = element(doc, 'dl', '');
          for (const fact of facts) {
            const row = element(doc, 'div', 'uxm-known-fact');
            row.append(element(doc, 'dt', '', fact.label), element(doc, 'dd', '', fact.value));
            list.appendChild(row);
          }
          factsSection.appendChild(list);
          panel.appendChild(factsSection);
        }
        if (comparison.length) {
          const compare = element(doc, 'section', 'uxm-rail-compare');
          compare.appendChild(element(doc, 'h4', '', 'Compare with equipped'));
          for (const rowModel of comparison) {
            const row = element(doc, 'div', 'uxm-compare-row');
            row.append(element(doc, 'span', '', rowModel.label), element(doc, 'span', '', rowModel.selected), element(doc, 'span', '', rowModel.equipped));
            compare.appendChild(row);
          }
          panel.appendChild(compare);
        }
        disclosure.appendChild(panel);
        actionsRoot.appendChild(disclosure);
      }
      if (pending) actionsRoot.prepend(element(doc, 'p', 'uxm-action-pending', 'Waiting for NetHack…'));
      rail.append(summary, actionsRoot);
      return rail;
    }
    function showContextMenu(item, anchor, point = null, extraActions = []) {
      closeContextMenu({ restore: false });
      const doc = root.ownerDocument;
      const actions = [...extraActions, ...item.actions];
      if (!actions.length) return;
      const menu = element(doc, 'div', `uxm-item-context-menu${extraActions.length ? ' uxm-slot-context-menu' : ''}`);
      menu.setAttribute('role', 'menu'); menu.tabIndex = -1; menu.__returnTarget = anchor;
      const heading = element(doc, 'div', 'uxm-item-context-header');
      heading.append(element(doc, 'strong', '', item.displayName), element(doc, 'span', '', 'Choose an action.'));
      menu.appendChild(heading);
      for (const action of actions) {
        const button = element(doc, 'button', `uxm-context-action${['caution', 'serious', 'dangerous'].includes(action.danger || action.dangerLevel) ? ' is-dangerous' : ''}`, action.label);
        button.type = 'button'; button.setAttribute('role', 'menuitem'); button.dataset.actionId = action.id;
        button.disabled = action.enabled === false || Boolean(pending);
        if (action.enabled === false && action.disabledReason) button.title = action.disabledReason;
        button.addEventListener('click', () => {
          closeContextMenu({ restore: false });
          request({ kind: action.__slotAction ? 'slot-action' : 'item-action', stableId: item.stableId, slotId: action.__slotId, actionId: action.id, label: action.label, inventoryRevision: revisionOf(data.inventory) });
        });
        menu.appendChild(button);
      }
      root.appendChild(menu);
      const anchorRect = anchor?.getBoundingClientRect?.() || { left: 8, bottom: 8 };
      const rootRect = root.getBoundingClientRect();
      const left = (point?.x ?? anchorRect.left) - rootRect.left;
      const top = (point?.y ?? anchorRect.bottom) - rootRect.top;
      menu.style.left = `${Math.max(8, Math.min(left, rootRect.width - Math.min(360, menu.offsetWidth || 320) - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(top, rootRect.height - Math.min(520, menu.offsetHeight || 420) - 8))}px`;
      contextMenu = menu;
      focusLayer?.open?.({ id: 'uxm-item-context', element: menu, domain: 'items', initialFocus: 'first-action', returnFocus: anchor, escapePolicy: 'close' });
      menu.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    }
    function renderRow(doc, model) {
      const row = element(doc, 'button', 'uxm-item-row');
      row.type = 'button'; row.dataset.stableId = model.stableId; row.dataset.selector = model.selectorAccelerator; row.dataset.key = model.selectorAccelerator;
      row.setAttribute('aria-pressed', String(model.stableId === selectedStableId && !selectedSlotId));
      if (model.stableId === selectedStableId && !selectedSlotId) row.classList.add('is-selected');
      row.draggable = Boolean(model.actions.some((action) => action.enabled));
      const key = element(doc, 'kbd', 'uxm-item-selector menu-key-hint', model.selectorAccelerator || '·');
      const copy = element(doc, 'span', 'uxm-item-row-copy');
      copy.appendChild(element(doc, 'span', 'uxm-item-name menu-item-name', model.displayName));
      const state = element(doc, 'span', 'uxm-item-essential-state menu-badges');
      if (model.equippedState) state.appendChild(element(doc, 'span', 'uxm-equipped-state', model.equippedState));
      if (model.ownership?.state && model.ownership.state !== 'owned') state.appendChild(element(doc, 'span', 'uxm-ownership-state', model.ownership.state === 'unpaid' ? 'Unpaid' : 'For sale'));
      appendKnownFactBadges(state, model);
      if (state.childNodes.length) copy.appendChild(state);
      row.append(key, renderIcon(doc, model), copy, element(doc, 'span', 'uxm-item-row-quantity', model.quantity > 1 ? `×${model.quantity}` : ''));
      row.addEventListener('click', () => { selectedSlotId = ''; if (selectedStableId !== model.stableId) expandedStableId = ''; selectedStableId = model.stableId; render({ focusStableId: model.stableId }); });
      row.addEventListener('dblclick', (event) => { event.preventDefault(); event.stopPropagation(); request({ kind: 'primary-equipment', stableId: model.stableId, inventoryRevision: revisionOf(data.inventory) }); });
      row.addEventListener('dragstart', (event) => { event.dataTransfer?.setData?.('application/x-nethack-stable-id', model.stableId); event.dataTransfer?.setData?.('text/plain', model.selectorAccelerator); });
      row.addEventListener('contextmenu', (event) => { event.preventDefault(); selectedSlotId = ''; if (selectedStableId !== model.stableId) expandedStableId = ''; selectedStableId = model.stableId; render({ skipFocus: true }); showContextMenu(model, root.querySelector(`[data-stable-id="${model.stableId}"]`), { x: event.clientX, y: event.clientY }); });
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); selectedSlotId = ''; if (selectedStableId !== model.stableId) expandedStableId = ''; selectedStableId = model.stableId; render({ focusStableId: model.stableId }); }
        else if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') { event.preventDefault(); showContextMenu(model, row); }
      });
      return row;
    }
    function renderInventory(doc) {
      const pane = element(doc, 'section', 'uxm-inventory-pane'); pane.dataset.itemMode = 'inventory';
      const toolbar = element(doc, 'div', 'uxm-inventory-tools');
      const title = element(doc, 'div', 'uxm-pane-heading'); title.append(element(doc, 'span', 'uxm-pane-kicker', 'Carried items'), element(doc, 'h2', '', 'Inventory'));
      const searchLabel = element(doc, 'label', 'uxm-item-search'); searchLabel.append(element(doc, 'span', '', 'Search items'), element(doc, 'input', ''));
      const input = searchLabel.querySelector('input'); input.type = 'search'; input.value = query; input.autocomplete = 'off'; input.placeholder = 'Name, selector, or category';
      input.addEventListener('input', () => { query = input.value; render({ focusSearch: true, searchSelection: [input.selectionStart, input.selectionEnd] }); });
      toolbar.append(title, searchLabel);
      const filters = element(doc, 'div', 'uxm-item-filters'); filters.setAttribute('aria-label', 'Inventory filters');
      for (const definition of ItemPresentation.FILTERS) {
        const button = element(doc, 'button', 'uxm-filter-button', definition.label); button.type = 'button'; button.dataset.filter = definition.id;
        button.setAttribute('aria-pressed', String(filter === definition.id)); if (filter === definition.id) button.classList.add('is-selected');
        button.addEventListener('click', () => { filter = definition.id; render({ focusFilter: definition.id }); }); filters.appendChild(button);
      }
      pane.append(toolbar, filters);
      const listWrap = element(doc, 'div', 'uxm-inventory-list-wrap'); const rows = element(doc, 'div', 'uxm-inventory-list'); rows.id = 'ux-item-equipment-options';
      const visible = filteredModels();
      if (!models.length) rows.appendChild(element(doc, 'div', 'uxm-item-empty', 'Your inventory is empty. Pick up an item in the dungeon and it will appear here.'));
      else if (!visible.length) rows.appendChild(element(doc, 'div', 'uxm-item-empty', 'No items match. Clear the search or choose another filter.'));
      else for (const model of visible) rows.appendChild(renderRow(doc, model));
      listWrap.appendChild(rows); pane.appendChild(listWrap);
      pane.appendChild(renderSelectionRail(doc));
      return pane;
    }
    function slotActions(slotId, rawItem) {
      if (!rawItem) return [];
      const actionServiceSlotId = ACTION_SERVICE_SLOT_IDS[slotId] || slotId;
      return (InventoryActionService.equipmentSlotActionAffordances?.({ id: actionServiceSlotId, label: SLOT_LABELS[slotId] || actionServiceSlotId, item: rawItem }, { items: inventoryItems(data) }) || []).map((action) => ({
        id: action.id, label: action.label, enabled: action.enabled !== false, disabledReason: action.disabledReasonLabel || action.disabledReason || '', danger: action.dangerLevel || 'safe', __slotAction: true, __slotId: slotId,
      }));
    }
    function renderSlotButton(doc, slotId, slot, rawItem, presented) {
      const button = element(doc, 'button', 'uxm-slot-button'); button.type = 'button'; button.dataset.slotId = slotId;
      if (selectedSlotId === slotId) button.classList.add('is-selected');
      if (slot?.publicStatus === 'blocked' || slot?.blockedBy?.length) button.classList.add('is-blocked');
      if (presented) button.classList.add('is-equipped');
      button.setAttribute('aria-pressed', String(selectedSlotId === slotId));
      const label = element(doc, 'span', 'uxm-slot-label', SLOT_LABELS[slotId] || slot?.label || slotId);
      const value = element(doc, 'span', 'uxm-slot-value', presented?.displayName || (slot?.publicStatus === 'blocked' ? 'Blocked' : 'Empty'));
      button.append(label, value);
      button.addEventListener('click', () => { if (selectedSlotId !== slotId) expandedStableId = ''; selectedStableId = presented?.stableId || ''; selectedSlotId = slotId; render({ focusSlotId: slotId }); });
      const openActions = (event, anchor) => { const extras = slotActions(slotId, rawItem); if (!presented || (!presented.actions.length && !extras.length)) return; event?.preventDefault?.(); selectedStableId = presented.stableId; selectedSlotId = slotId; render({ skipFocus: true }); showContextMenu(presented, anchor || root.querySelector(`[data-slot-id="${slotId}"]`), event ? { x: event.clientX, y: event.clientY } : null, extras); };
      button.addEventListener('contextmenu', (event) => openActions(event));
      button.addEventListener('keydown', (event) => { if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') openActions(event, button); });
      button.addEventListener('dragover', (event) => { event.preventDefault(); button.classList.add('drag-over'); });
      button.addEventListener('dragleave', () => button.classList.remove('drag-over'));
      button.addEventListener('drop', (event) => { event.preventDefault(); button.classList.remove('drag-over'); const stableId = event.dataTransfer?.getData?.('application/x-nethack-stable-id') || models.find((model) => model.selectorAccelerator === event.dataTransfer?.getData?.('text/plain'))?.stableId || ''; request({ kind: 'equipment-drop', stableId, slotId, inventoryRevision: revisionOf(data.inventory) }); });
      return button;
    }
    function renderEquipment(doc) {
      const pane = element(doc, 'section', 'uxm-equipment-pane'); pane.dataset.itemMode = 'equipment';
      const heading = element(doc, 'div', 'uxm-pane-heading uxm-equipment-heading'); heading.append(element(doc, 'span', 'uxm-pane-kicker', 'Hero at a glance'), element(doc, 'h2', '', 'Hero equipment')); pane.appendChild(heading);
      const stage = element(doc, 'div', 'uxm-paper-doll-stage'); const safe = element(doc, 'div', 'uxm-character-safe-area'); const avatar = element(doc, 'div', 'uxm-full-character');
      if (data.avatar?.src) { const img = element(doc, 'img', ''); img.src = data.avatar.src; img.alt = data.avatar.alt || ''; avatar.appendChild(img); }
      else avatar.appendChild(element(doc, 'span', 'uxm-avatar-fallback', '@'));
      safe.appendChild(avatar);
      const slots = slotMap(data); const inventoryById = new Map(inventoryItems(data).map((item) => [item.objectId, item]));
      const left = element(doc, 'div', 'uxm-callout-rail uxm-callout-left'); const right = element(doc, 'div', 'uxm-callout-rail uxm-callout-right');
      for (const group of GROUPS) {
        const groupEl = element(doc, 'section', 'uxm-slot-group'); groupEl.dataset.group = group.id; groupEl.appendChild(element(doc, 'h3', '', group.label));
        for (const slotId of group.slots) {
          const slot = slots.get(slotId) || { slotId, publicStatus: 'empty', blockedBy: [] };
          const rawItem = slotItem(slot, inventoryById);
          const presented = rawItem ? (models.find((model) => model.stableId === stableIdFor(rawItem)) || (() => { const base = applyEquipmentSlotAvailability(ItemPresentation.presentItem(rawItem, { actionService: InventoryActionService, actionContext: { items: inventoryItems(data) } }), [slot]); return Object.freeze({ ...base, icon: resolveItemIcon(rawItem, base.icon) }); })()) : null;
          groupEl.appendChild(renderSlotButton(doc, slotId, slot, rawItem, presented));
        }
        (group.rail === 'left' ? left : right).appendChild(groupEl);
      }
      stage.append(left, safe, right); pane.appendChild(stage);
      const details = element(doc, 'section', 'uxm-equipment-details'); const selected = selectedModel();
      ItemDetailPanel.renderDetailPanel(details, { item: selected, slotLabel: selectedSlotId ? (SLOT_LABELS[selectedSlotId] || selectedSlotId) : 'Selected equipment', compareItem: null, pending: Boolean(pending), onAction: (action, item) => request({ kind: 'item-action', stableId: item.stableId, slotId: selectedSlotId, actionId: action.id, inventoryRevision: revisionOf(data.inventory) }) });
      pane.append(renderRecentLog(doc), details); return pane;
    }
    function followupRows() {
      if (!pending) return [];
      let selectors = null;
      if (pending.followupCorrelation && sameMenuIdentity(pending.followupCorrelation, menuIdentity(interaction?.menu))) {
        selectors = new Set(list(interaction.menu, 'items').map(selectorFor).filter(Boolean));
      } else if (pending.followupPromptCorrelation && samePromptIdentity(pending.followupPromptCorrelation, promptIdentity(interaction?.prompt))) {
        selectors = InteractionModel.selectorSet?.(interaction.prompt.query, interaction.prompt.choices) || new Set();
      }
      if (!selectors?.size) return [];
      return inventoryItems(data).filter((item) => selectors.has(selectorFor(item)));
    }
    function renderFollowup(doc) {
      const rows = followupRows();
      if (!rows.length) return null;
      const modal = element(doc, 'section', 'uxm-native-followup'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
      modal.append(element(doc, 'h2', '', String(interaction?.menu?.prompt || interaction?.prompt?.query || 'Choose an item')));
      for (const item of rows) {
        const button = element(doc, 'button', 'uxm-native-followup-row', `${selectorFor(item)} — ${String(item.displayName || item.text || 'Item').replace(/^\s*[A-Za-z$]\s*[-+]\s*/, '')}`);
        button.type = 'button'; button.dataset.key = selectorFor(item); button.addEventListener('click', () => selectFollowup(item)); modal.appendChild(button);
      }
      return modal;
    }
    function renderStatusStrip(doc) {
      const strip = element(doc, 'div', 'uxm-items-status');
      strip.setAttribute('aria-label', 'Current hero stats');
      const presentation = StatusPresentation.renderStatusPresentation?.(strip, data.statusValues || [], {
        documentRoot: doc,
        density: 'compact',
        adaptive: true,
      });
      return presentation?.detailed?.some((group) => group.items.length) ? strip : null;
    }
    function render(focus = {}) {
      if (!root) return;
      const doc = root.ownerDocument;
      const focusedStableId = doc.activeElement?.closest?.('[data-stable-id]')?.dataset?.stableId || '';
      const focusedSlotId = doc.activeElement?.closest?.('[data-slot-id]')?.dataset?.slotId || '';
      const focusedFollowupKey = doc.activeElement?.closest?.('.uxm-native-followup-row')?.dataset?.key || '';
      const focusedActionId = doc.activeElement?.closest?.('[data-action-id]')?.dataset?.actionId || '';
      const focusedSearch = doc.activeElement?.matches?.('.uxm-item-search input');
      const inventoryScroll = root.querySelector('.uxm-inventory-list-wrap')?.scrollTop || 0;
      const workspaceScroll = root.querySelector('.uxm-items-content')?.scrollTop || 0;
      const logViewport = root.querySelector('.uxm-recent-log-scroll');
      const logWasNearBottom = !logViewport || logViewport.scrollHeight - logViewport.scrollTop - logViewport.clientHeight <= 4;
      const logScroll = logViewport?.scrollTop || 0;
      closeContextMenu({ restore: false }); root.textContent = '';
      const shell = element(doc, 'section', 'uxm-items-workspace'); shell.setAttribute('role', 'dialog'); shell.setAttribute('aria-modal', 'true'); shell.setAttribute('aria-labelledby', 'uxm-items-title');
      const topbar = element(doc, 'header', 'uxm-items-topbar'); const title = element(doc, 'div', ''); title.append(element(doc, 'span', 'uxm-workspace-kicker', 'Character'), element(doc, 'h1', '', 'Inventory & equipment')); title.querySelector('h1').id = 'uxm-items-title';
      const closeButton = element(doc, 'button', 'uxm-items-close', 'Close'); closeButton.type = 'button'; closeButton.addEventListener('click', () => close({ reason: 'close-button' })); topbar.append(title, closeButton);
      const tabs = element(doc, 'div', 'uxm-items-tabs');
      for (const mode of ['equipment', 'inventory']) {
        const button = element(doc, 'button', '', mode === 'equipment' ? 'Equipment' : 'Inventory'); button.type = 'button'; button.dataset.itemTab = mode; button.setAttribute('aria-pressed', String(activeMode === mode));
        if (activeMode === mode) button.classList.add('is-selected'); button.addEventListener('click', () => { activeMode = mode; render({ focusTab: mode }); }); tabs.appendChild(button);
      }
      const notice = element(doc, 'div', `uxm-item-feedback${feedbackGood ? ' good-feedback' : ''}`, feedback || (pending ? 'Waiting for NetHack…' : '')); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); notice.setAttribute('aria-atomic', 'true');
      const content = element(doc, 'div', 'uxm-items-content'); content.dataset.activeMode = activeMode; content.append(renderEquipment(doc), renderInventory(doc));
      const statusStrip = renderStatusStrip(doc);
      shell.append(topbar);
      if (statusStrip) shell.append(statusStrip);
      shell.append(tabs, notice, content); root.appendChild(shell);
      const followup = renderFollowup(doc); if (followup) root.appendChild(followup);
      root.hidden = false; root.classList.add('uxm-items-overlay');
      const listWrap = root.querySelector('.uxm-inventory-list-wrap'); if (listWrap) listWrap.scrollTop = inventoryScroll; content.scrollTop = workspaceScroll;
      const nextLogViewport = root.querySelector('.uxm-recent-log-scroll');
      if (nextLogViewport) nextLogViewport.scrollTop = logWasNearBottom ? nextLogViewport.scrollHeight : Math.min(logScroll, Math.max(0, nextLogViewport.scrollHeight - nextLogViewport.clientHeight));
      if (focus.skipFocus) {
        const preserved = (focusedFollowupKey && root.querySelector(`.uxm-native-followup-row[data-key="${focusedFollowupKey}"]`))
          || (followup && root.querySelector('.uxm-native-followup-row'))
          || (focusedStableId && root.querySelector(`[data-stable-id="${focusedStableId}"]`))
          || (focusedSlotId && root.querySelector(`[data-slot-id="${focusedSlotId}"]`))
          || (focusedActionId && root.querySelector(`[data-action-id="${focusedActionId}"]`))
          || (focusedSearch && root.querySelector('.uxm-item-search input'));
        preserved?.focus?.({ preventScroll: true });
        return;
      }
      let target = null;
      if (focus.focusStableId) target = root.querySelector(`[data-stable-id="${focus.focusStableId}"]`);
      else if (focus.focusSlotId) target = root.querySelector(`[data-slot-id="${focus.focusSlotId}"]`);
      else if (focus.focusFilter) target = root.querySelector(`[data-filter="${focus.focusFilter}"]`);
      else if (focus.focusTab) target = root.querySelector(`[data-item-tab="${focus.focusTab}"]`);
      else if (focus.focusSearch) { target = root.querySelector('.uxm-item-search input'); if (focus.searchSelection && target) target.setSelectionRange?.(...focus.searchSelection); }
      target?.focus?.({ preventScroll: true });
    }
    function handleKeydown(event) {
      if (!root || root.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!closeContextMenu()) close({ reason: 'escape' });
        return;
      }
      if (event.key === 'Tab' && focusLayer?.trapTab?.(event)) return;
      if (contextMenu) { if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); focusLayer?.moveRoving?.(contextMenu, event.key, '[role="menuitem"]'); } return; }
      const active = root.ownerDocument.activeElement;
      if (active?.matches?.('input, textarea, select')) return;
      if (/^[A-Za-z$]$/.test(event.key)) {
        const model = models.find((candidate) => candidate.selectorAccelerator === event.key);
        if (model) { event.preventDefault(); selectedSlotId = ''; if (selectedStableId !== model.stableId) expandedStableId = ''; selectedStableId = model.stableId; activeMode = 'inventory'; render({ focusStableId: model.stableId }); }
      }
    }
    function open(next = {}) {
      const doc = next.documentRoot || options.documentRoot || (typeof document !== 'undefined' ? document : null);
      const targetMount = next.mount || currentMount(doc);
      if (!targetMount) throw new Error('Missing UX items mount');
      if (next.transferOwner) { transferOwner = next.transferOwner; diagnostic('workspace.open-rejected', { code: 'transfer-owner-active', ownerId: transferOwner.id || '' }); return controller; }
      mount = targetMount; root = mount; invoker = next.invoker || doc.activeElement || invoker;
      activeMode = next.initialMode === 'inventory' ? 'inventory' : 'equipment'; query = ''; filter = 'all'; expandedStableId = ''; feedback = ''; feedbackGood = false;
      reconcile(next);
      if (!revisionOf(data.inventory)) { diagnostic('workspace.open-rejected', { code: 'missing-inventory-snapshot' }); root = null; return controller; }
      render({ skipFocus: true }); focusLayer = runtime?.service?.('dialog')?.focus || null;
      focusLayer?.open?.({ id: 'uxm-items-workspace', element: root, domain: 'items', initialFocus: () => root.querySelector('[data-item-tab].is-selected') || root.querySelector('button'), returnFocus: invoker, escapePolicy: 'close' });
      (root.querySelector('[data-item-tab].is-selected') || root.querySelector('button'))?.focus?.({ preventScroll: true }); doc.addEventListener('keydown', handleKeydown, true);
      const overview = menuIdentity(next.interaction?.menu || {});
      if (overview && overview.requestId !== nativeOverviewRequestId) {
        nativeOverviewRequestId = overview.requestId;
        emitIntent({ type: 'cancel-native-overview', correlation: overview, expectedRevision: currentRevisions() });
      }
      diagnostic('workspace.opened', { inventoryRevision: revisionOf(data.inventory), inventoryCount: models.length, equipmentRevision: revisionOf(data.equipment), equipmentSlotCount: equipmentSlots(data).length });
      return controller;
    }
    function close({ reason = 'closed', cancelNative = true } = {}) {
      if (!root || root.hidden) return false;
      const doc = root.ownerDocument;
      const activeIdentity = menuIdentity(interaction?.menu || {});
      if (cancelNative && activeIdentity && activeIdentity.requestId !== closeIntentRequestId && activeIdentity.requestId !== nativeOverviewRequestId) {
        closeIntentRequestId = activeIdentity.requestId;
        emitIntent({ type: 'cancel-native-interaction', correlation: activeIdentity, reason });
      }
      closeContextMenu({ restore: false }); doc.removeEventListener('keydown', handleKeydown, true); focusLayer?.close?.(root);
      root.hidden = true; root.textContent = ''; root.classList.remove('uxm-items-overlay');
      diagnostic('workspace.closed', { reason }); root = null; interaction = null; pending = null; deferredExecution = null; nativeOverviewRequestId = ''; closeIntentRequestId = '';
      return true;
    }
    function reset({ reason = 'game-reset' } = {}) {
      close({ reason, cancelNative: false });
      data = Object.freeze({ inventory: null, equipment: null, statusValues: null, messages: Object.freeze([]), avatar: null, iconResolver: null });
      models = Object.freeze([]);
      rawByStableId = new Map();
      activeMode = 'equipment';
      selectedStableId = '';
      selectedSlotId = '';
      query = '';
      expandedStableId = '';
      filter = 'all';
      pending = null;
      feedback = '';
      feedbackGood = false;
      interaction = null;
      completedPrompt = null;
      transferOwner = null;
      contextMenu = null;
      focusLayer = null;
      invoker = null;
      intentSequence = 0;
      nativeOverviewRequestId = '';
      closeIntentRequestId = '';
      deferredExecution = null;
      diagnostic('workspace.reset', { reason });
      return true;
    }
    function snapshot() {
      const selected = selectedModel();
      return Object.freeze({
        open: Boolean(root && !root.hidden), mode: activeMode, query, filter,
        selectedStableId: selected?.stableId || '', selectedSlotId,
        inventoryRevision: revisionOf(data.inventory), equipmentRevision: revisionOf(data.equipment),
        inventoryCount: models.length, visibleCount: filteredModels().length,
        pendingActionId: pending?.actionId || '', pendingPhase: pending?.phase || '', pendingIntentId: pending?.intentId || '',
        feedback, ownership: ownership(), horizontalOverflow: root ? root.scrollWidth > root.clientWidth : false,
      });
    }
    function connectRuntime() {
      if (!runtime?.subscribePublicState || unsubscribe) return false;
      const subscription = runtime.subscribePublicState('items', (state) => {
        const game = state?.game || {};
        reconcile({ inventory: game.inventory, equipment: game.equipment, statusValues: game.statusValues, messages: game.messages });
      });
      unsubscribe = () => subscription.unsubscribe(); return true;
    }
    
    function destroy() { close({ reason: 'destroy', cancelNative: false }); unsubscribe?.(); unsubscribe = null; }

    const controller = Object.freeze({ version, open, close, reset, reconcile, request, settle, snapshot, ownership, connectRuntime, destroy, diagnostics: () => Object.freeze(diagnostics.slice()), groups: GROUPS });
    return controller;
  }

  let controller = null;
  const runtime = UxRuntimeModule?.runtime;
  if (runtime?.registerDomain) {
    try {
      controller = runtime.domain?.('items') || createController({ runtime });
      if (!runtime.domain?.('items')) runtime.registerDomain('items', controller);
      controller.connectRuntime?.();
    } catch (error) {
      controller = runtime.domain?.('items') || null;
    }
  }

  return Object.freeze({ version, GROUPS, createController, equippedComparison, publicDispatchPayload, controller });
}));
