(function initUiProtocolV2(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./public-blockers'));
  else root.NetHackUiProtocolV2 = factory(root.NetHackPublicBlockers);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(PublicBlockers = {}) {
  const protocol = 'nethack-electron-ui/v2';
  const schemaVersion = 2;

  const eventTypes = new Set([
    'diagnostic.v1Compatibility',
    'menu.opened', 'menu.item', 'menu.ready', 'menu.selecting', 'menu.closed',
    'prompt.opened', 'prompt.answered', 'prompt.closed',
    'inventory.snapshot', 'inventory.delta',
    'equipment.snapshot', 'equipment.delta',
    'action.affordances',
    'command.accepted', 'command.rejected', 'command.completed',
    'transaction.completed', 'transaction.interrupted',
    'ground.pile.snapshot', 'ground.transfer.confirmed', 'ground.transfer.rejected',
    'container.session.opened', 'container.session.closed',
    'container.contents.snapshot', 'container.candidates.snapshot',
    'container.transfer.confirmed', 'container.transfer.rejected',
    'transfer.session.opened', 'transfer.session.updated', 'transfer.session.closed',
    'transfer.choreography.updated',
    'transfer.begun', 'transfer.confirmed', 'transfer.completed', 'transfer.rejected',
    'transfer.ground-pile-evidence.attached', 'transfer.container-contents-evidence.attached',
    'map.cell.updated',
    'replay.marker',
  ]);

  const currentCommandTypes = Object.freeze([
    'action.execute',
    'command.cancel',
    'prompt.answer',
    'menu.select',
    'ground.transfer',
    'equipment.change',
    'terrain.action',
    'container.transfer',
    'container.snapshot',
    'replay.control',
  ]);
  const proposedDirectCommandTypes = Object.freeze([
    'container.force',
    'container.tip',
    'container.untrap',
    'container.unlock',
    'item.use',
    'altar.action',
    'target.answer',
  ]);
  const directCommandTypes = new Set([
    'ground.transfer',
    'equipment.change',
    'terrain.action',
    'container.transfer',
    'container.snapshot',
    ...proposedDirectCommandTypes,
  ]);
  const commandTypes = new Set([...currentCommandTypes, ...proposedDirectCommandTypes]);
  const commandStatuses = Object.freeze(['accepted', 'queued', 'completed', 'success', 'failure', 'cancelled', 'rejected']);
  const directCommandRegistry = Object.freeze({
    current: currentCommandTypes,
    proposed: proposedDirectCommandTypes,
    direct: Object.freeze(Array.from(directCommandTypes).sort()),
    statuses: commandStatuses,
    revisionSemantics: 'expectedRevision is a stale public snapshot guard, not a secret capability; stale supplied revisions reject before core mutation.',
    hiddenClassicMenuDriving: 'Direct APIs must not drive invisible classic menus, selectors, prompts, directions, or ynq confirmations; require explicit public fields, visible request-scoped follow-up, or reject.',
    snapshotAfterChange: 'Accepted direct commands that can change visible state must be followed by authoritative snapshots for every affected public surface.',
    rendererReconcile: 'Renderer optimistic state is provisional and must reconcile to the next authoritative snapshot; rejection must not fall back to hidden classic choreography.',
  });

  const selectionModes = new Set(['none', 'one', 'many']);
  const sourceLayers = new Set(['core', 'winshim', 'shim-bridge', 'main', 'renderer', 'replay', 'test']);
  const itemLocations = new Set(['inventory', 'equipment', 'ground', 'container', 'unknown']);
  const equipmentSlotIds = new Set(['mainHand', 'offHand', 'quiver', 'armor.body', 'armor.cloak', 'armor.shirt', 'armor.helm', 'armor.gloves', 'armor.boots', 'armor.shield', 'amulet', 'ring.left', 'ring.right', 'eyes']);
  const publicEquipmentStatuses = new Set(['empty', 'equipped', 'blocked', 'unknown']);
  const transferDirections = new Set(['ground-to-inventory', 'inventory-to-ground', 'container-to-inventory', 'inventory-to-container']);
  const transferSessionKinds = new Set(['ground-pickup', 'container']);
  const commandBlockerTokens = new Set([
    'blocked.input.promptActive',
    'blocked.input.menuActive',
    'blocked.input.transferActive',
    'blocked.input.staleRevision',
    'blocked.input.unsupportedRoute',
    'blocked.input.malformedTarget',
    'blocked.input.missingPromptPolicy',
    'blocked.input.malformedCommand',
    'blocked.public.tryInNetHack',
  ]);
  const commandAckStatusesByEventType = Object.freeze({
    'command.accepted': new Set(['accepted', 'queued']),
    'command.rejected': new Set(['rejected']),
    'command.completed': new Set(['completed', 'success', 'failure', 'cancelled']),
  });
  const commandAckExecutionSources = new Set(['none', 'native-ui-command', 'bridge-ui-command', 'public-state-transaction', 'command-transaction', 'test-preserve-only']);
  const commandAckReplayBehaviors = new Set([
    'preserve-only; replay executes input events',
    'preserved evidence only; replay executes input events',
    'replay executes recorded input events only',
    'preserved evidence only; no raw fallback input sent',
  ]);

  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function isString(value) { return typeof value === 'string' && value.trim().length > 0; }
  function isInteger(value) { return Number.isInteger(value) && Number.isFinite(value); }
  function isNonNegativeInteger(value) { return isInteger(value) && value >= 0; }
  function isSafeSequence(value) { return isNonNegativeInteger(value) && value <= Number.MAX_SAFE_INTEGER; }
  function add(errors, path, message) { errors.push(`${path}: ${message}`); }

  function validateRevision(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object');
    for (const [key, revision] of Object.entries(value)) {
      if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key)) add(errors, `${path}.${key}`, 'revision key must be an identifier');
      if (!isNonNegativeInteger(revision)) add(errors, `${path}.${key}`, 'revision must be a non-negative integer');
    }
  }

  function validateSource(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object');
    if (value.layer != null && (!isString(value.layer) || !sourceLayers.has(value.layer))) add(errors, `${path}.layer`, `must be one of ${Array.from(sourceLayers).join(', ')}`);
    if (value.window != null && !isNonNegativeInteger(value.window)) add(errors, `${path}.window`, 'must be a non-negative integer');
  }

  function validateAllowedKeys(value, path, allowed, errors) {
    for (const key of Object.keys(value || {})) {
      if (!allowed.has(key)) add(errors, `${path}.${key}`, 'is not an allowed public field');
    }
  }

  function validateOwner(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object');
    validateAllowedKeys(value, path, new Set(['kind', 'window', 'label']), errors);
    if (!isString(value.kind)) add(errors, `${path}.kind`, 'is required');
    if (value.window != null && !isNonNegativeInteger(value.window)) add(errors, `${path}.window`, 'must be a non-negative integer when present');
    if (value.label != null && typeof value.label !== 'string') add(errors, `${path}.label`, 'must be a string when present');
  }

  function validateRequestSource(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object');
    validateAllowedKeys(value, path, new Set(['layer', 'window', 'command', 'label']), errors);
    if (value.layer != null && typeof value.layer !== 'string') add(errors, `${path}.layer`, 'must be a string when present');
    if (value.window != null && !isNonNegativeInteger(value.window)) add(errors, `${path}.window`, 'must be a non-negative integer when present');
    if (value.command != null && typeof value.command !== 'string') add(errors, `${path}.command`, 'must be a string when present');
    if (value.label != null && typeof value.label !== 'string') add(errors, `${path}.label`, 'must be a string when present');
  }

  function validateMenuLifecyclePayload(payload, path, errors) {
    validateAllowedKeys(payload, path, new Set(['menuId', 'purpose', 'menuPurpose', 'selectionMode', 'owner', 'requestSource', 'prompt']), errors);
    if (!isString(payload.menuId)) add(errors, `${path}.menuId`, 'is required');
    if (payload.purpose != null && typeof payload.purpose !== 'string') add(errors, `${path}.purpose`, 'must be a string when present');
    if (payload.menuPurpose != null && typeof payload.menuPurpose !== 'string') add(errors, `${path}.menuPurpose`, 'must be a string when present');
    if (payload.prompt != null && typeof payload.prompt !== 'string') add(errors, `${path}.prompt`, 'must be a string when present');
    if (payload.selectionMode != null && !selectionModes.has(payload.selectionMode)) add(errors, `${path}.selectionMode`, `must be one of ${Array.from(selectionModes).join(', ')}`);
    validateOwner(payload.owner, `${path}.owner`, errors);
    validateRequestSource(payload.requestSource, `${path}.requestSource`, errors);
  }

  function validateTargetCollection(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value) && !Array.isArray(value)) add(errors, path, 'must be an object or array');
  }

  const allowedKnownFlagKeys = new Set(['identity', 'appearance', 'quantity']);
  function validateKnownFlags(value, path, errors) {
    if (value == null) return;
    if (typeof value === 'boolean') return;
    if (!isPlainObject(value)) return add(errors, path, 'must be a boolean or object of public known flags');
    for (const [key, known] of Object.entries(value)) {
      if (!allowedKnownFlagKeys.has(key)) add(errors, `${path}.${key}`, 'is not an allowed public known flag');
      if (typeof known !== 'boolean') add(errors, `${path}.${key}`, 'must be boolean');
    }
  }

  const forbiddenPublicItemFields = new Set(['baseType', 'beatitude', 'enchantment', 'charges', 'curseState', 'cursed', 'blessed', 'buc', 'trapped', 'trapState', 'contents', 'trueName', 'objectType', 'otyp', 'spe', 'remainingCharges']);
  const forbiddenPublicActionTokens = new Set(['container.locked', 'container.trapped', 'container.broken', 'locked', 'trapped', 'broken']);
  const hiddenContainerTextPattern = /\b(?:locked|trapped|broken)\b(?!-looking)|\bcontaining\s+\d+\s+items?\b/i;
  const containerSurfacePattern = /\b(?:chest|box|bag|sack|container)\b/i;
  const allowedEquipmentBlockerTokens = PublicBlockers.publicEquipmentBlockerTokenSet || new Set();
  const allowedEquipmentBlockerLabels = PublicBlockers.publicEquipmentBlockerLabelSet || new Set();
  const publicEquipmentBlockerLabel = typeof PublicBlockers.publicEquipmentBlockerLabel === 'function'
    ? PublicBlockers.publicEquipmentBlockerLabel
    : ((token) => (PublicBlockers.publicEquipmentBlockerLabels || {})[String(token || '')] || '');
  const allowedPublicItemFields = new Set(['objectId', 'inventoryLetter', 'displayName', 'appearanceName', 'quantity', 'known', 'location', 'actionAffordances', 'publicActionHints', 'objectClass', 'glyph', 'glyphChar', 'wornMask', 'semanticKind', 'semanticName', 'semanticAppearance', 'semanticKnown']);
  function validatePublicStringArray(value, path, errors) {
    if (value == null) return;
    if (!Array.isArray(value)) return add(errors, path, 'must be an array when present');
    value.forEach((item, index) => { if (typeof item !== 'string') add(errors, `${path}[${index}]`, 'must be a public string token'); });
  }

  function validateNoHiddenContainerText(value, path, errors) {
    if (value == null || typeof value !== 'string') return;
    if (containerSurfacePattern.test(value) && hiddenContainerTextPattern.test(value)) {
      add(errors, path, 'must not expose hidden container lock/trap/broken/content words unless recorded as a historical visible message');
    }
  }

  function validateEquipmentSlot(slot, path, errors) {
    if (!isPlainObject(slot)) return add(errors, path, 'must be an object');
    validateAllowedKeys(slot, path, new Set(['slotId', 'rendererSlotId', 'label', 'objectId', 'wornMask', 'blockedBy', 'publicStatus', 'actions', 'item']), errors);
    if (!isString(slot.slotId)) add(errors, `${path}.slotId`, 'is required');
    else if (!equipmentSlotIds.has(slot.slotId)) add(errors, `${path}.slotId`, `must be one of ${Array.from(equipmentSlotIds).join(', ')}`);
    if (slot.rendererSlotId != null && typeof slot.rendererSlotId !== 'string') add(errors, `${path}.rendererSlotId`, 'must be a string when present');
    if (slot.label != null && typeof slot.label !== 'string') add(errors, `${path}.label`, 'must be a string when present');
    if (slot.objectId != null && !isNonNegativeInteger(slot.objectId)) add(errors, `${path}.objectId`, 'must be a non-negative integer when present');
    if (slot.wornMask != null && !isNonNegativeInteger(slot.wornMask)) add(errors, `${path}.wornMask`, 'must be a non-negative integer when present');
    validatePublicStringArray(slot.blockedBy, `${path}.blockedBy`, errors);
    if (Array.isArray(slot.blockedBy)) slot.blockedBy.forEach((token, index) => {
      if (!allowedEquipmentBlockerTokens.has(String(token || ''))) add(errors, `${path}.blockedBy[${index}]`, 'must be an approved public equipment blocker token');
    });
    if (slot.publicStatus != null && (!isString(slot.publicStatus) || !publicEquipmentStatuses.has(slot.publicStatus))) add(errors, `${path}.publicStatus`, `must be one of ${Array.from(publicEquipmentStatuses).join(', ')}`);
    validatePublicStringArray(slot.actions, `${path}.actions`, errors);
    if (slot.item != null) validatePublicItem(slot.item, `${path}.item`, errors);
  }

  function validatePublicLocation(location, path, errors) {
    if (!isPlainObject(location)) return add(errors, path, 'must be an object');
    const allowed = new Set(['kind']);
    for (const key of Object.keys(location)) {
      if (!allowed.has(key)) add(errors, `${path}.${key}`, 'is not an allowed public location field');
    }
    if (location.kind != null && !itemLocations.has(location.kind)) add(errors, `${path}.kind`, `must be one of ${Array.from(itemLocations).join(', ')}`);
  }

  function validatePublicItem(item, path, errors) {
    if (!isPlainObject(item)) return add(errors, path, 'must be an object');
    for (const key of Object.keys(item)) {
      if (forbiddenPublicItemFields.has(key)) add(errors, `${path}.${key}`, 'is not allowed in public item payloads; expose only player-visible display/appearance and known flags');
      else if (!allowedPublicItemFields.has(key)) add(errors, `${path}.${key}`, 'is not an allowed public item field in v2; add an explicit public schema rule before using it');
    }
    if (item.objectId != null && !isNonNegativeInteger(item.objectId)) add(errors, `${path}.objectId`, 'must be a non-negative integer when present');
    if (item.inventoryLetter != null && (typeof item.inventoryLetter !== 'string' || item.inventoryLetter.length !== 1)) add(errors, `${path}.inventoryLetter`, 'must be a single character when present');
    if (!isString(item.displayName)) add(errors, `${path}.displayName`, 'is required and must be player-visible text');
    validateNoHiddenContainerText(item.displayName, `${path}.displayName`, errors);
    validateNoHiddenContainerText(item.appearanceName, `${path}.appearanceName`, errors);
    validateNoHiddenContainerText(item.semanticAppearance, `${path}.semanticAppearance`, errors);
    validateNoHiddenContainerText(item.semanticName, `${path}.semanticName`, errors);
    if (item.appearanceName != null && typeof item.appearanceName !== 'string') add(errors, `${path}.appearanceName`, 'must be a string when present');
    if (item.objectClass != null && typeof item.objectClass !== 'string') add(errors, `${path}.objectClass`, 'must be a string when present');
    if (item.glyph != null && !isNonNegativeInteger(item.glyph)) add(errors, `${path}.glyph`, 'must be a non-negative integer when present');
    if (item.glyphChar != null && !isNonNegativeInteger(item.glyphChar)) add(errors, `${path}.glyphChar`, 'must be a non-negative integer when present');
    if (item.wornMask != null && !isNonNegativeInteger(item.wornMask)) add(errors, `${path}.wornMask`, 'must be a non-negative integer when present');
    if (item.semanticKind != null && typeof item.semanticKind !== 'string') add(errors, `${path}.semanticKind`, 'must be a string when present');
    if (item.semanticKnown != null && typeof item.semanticKnown !== 'boolean') add(errors, `${path}.semanticKnown`, 'must be boolean when present');
    if (item.semanticAppearance != null && typeof item.semanticAppearance !== 'string') add(errors, `${path}.semanticAppearance`, 'must be a string when present');
    if (item.semanticName != null && typeof item.semanticName !== 'string') add(errors, `${path}.semanticName`, 'must be a string when present');
    if (item.semanticName != null && String(item.semanticName).trim() && item.semanticKnown !== true && item.known?.identity !== true) add(errors, `${path}.semanticName`, 'must be omitted unless identity is public/known; use displayName, appearanceName, or semanticAppearance');
    if (item.quantity != null && (!isInteger(item.quantity) || item.quantity < 0)) add(errors, `${path}.quantity`, 'must be a non-negative integer when present');
    if (item.known != null) validateKnownFlags(item.known, `${path}.known`, errors);
    if (item.location != null) validatePublicLocation(item.location, `${path}.location`, errors);
    validatePublicStringArray(item.actionAffordances, `${path}.actionAffordances`, errors);
    validatePublicStringArray(item.publicActionHints, `${path}.publicActionHints`, errors);
    for (const [field, values] of [['actionAffordances', item.actionAffordances], ['publicActionHints', item.publicActionHints]]) {
      if (Array.isArray(values)) values.forEach((token, index) => {
        if (forbiddenPublicActionTokens.has(String(token || ''))) add(errors, `${path}.${field}[${index}]`, 'must not expose hidden lock/trap/broken state as an action token');
      });
    }
  }

  const allowedMenuItemFields = new Set(['selector', 'text', 'index', 'glyph', 'glyphChar', 'semanticKind', 'semanticName', 'semanticAppearance', 'semanticKnown', 'actionAffordances']);
  function validatePublicMenuItem(item, path, errors) {
    if (!isPlainObject(item)) return add(errors, path, 'is required');
    for (const key of Object.keys(item)) {
      if (forbiddenPublicItemFields.has(key)) add(errors, `${path}.${key}`, 'is not allowed in public menu item payloads');
      else if (!allowedMenuItemFields.has(key)) add(errors, `${path}.${key}`, 'is not an allowed public menu item field');
    }
    if (item.selector != null && typeof item.selector !== 'string') add(errors, `${path}.selector`, 'must be a string when present');
    if (!isString(item.text)) add(errors, `${path}.text`, 'is required');
    if (item.index != null && !isNonNegativeInteger(item.index)) add(errors, `${path}.index`, 'must be a non-negative integer when present');
    if (item.glyph != null && !isNonNegativeInteger(item.glyph)) add(errors, `${path}.glyph`, 'must be a non-negative integer when present');
    if (item.glyphChar != null && !isNonNegativeInteger(item.glyphChar)) add(errors, `${path}.glyphChar`, 'must be a non-negative integer when present');
    if (item.semanticKind != null && typeof item.semanticKind !== 'string') add(errors, `${path}.semanticKind`, 'must be a string when present');
    if (item.semanticKnown != null && typeof item.semanticKnown !== 'boolean') add(errors, `${path}.semanticKnown`, 'must be boolean when present');
    if (item.semanticAppearance != null && typeof item.semanticAppearance !== 'string') add(errors, `${path}.semanticAppearance`, 'must be a string when present');
    if (item.semanticName != null && typeof item.semanticName !== 'string') add(errors, `${path}.semanticName`, 'must be a string when present');
    if (item.semanticName != null && String(item.semanticName).trim() && item.semanticKnown !== true) add(errors, `${path}.semanticName`, 'must be omitted unless semanticKnown is true; use semanticAppearance/text only');
    validatePublicStringArray(item.actionAffordances, `${path}.actionAffordances`, errors);
  }

  const allowedActionFields = new Set(['actionId', 'label', 'section', 'enabled', 'disabledReason', 'disabledReasonToken', 'disabledReasonLabel', 'dangerLevel', 'blockerTokens', 'blockerLabels', 'params', 'promptPlan', 'execution', 'consumesTurn', 'source', 'targets']);
  function validateAction(action, path, errors) {
    if (!isPlainObject(action)) return add(errors, path, 'must be an object');
    validateAllowedKeys(action, path, allowedActionFields, errors);
    if (!isString(action.actionId)) add(errors, `${path}.actionId`, 'is required');
    if (!isString(action.label)) add(errors, `${path}.label`, 'is required');
    if (typeof action.enabled !== 'boolean') add(errors, `${path}.enabled`, 'must be boolean');
    if (action.disabledReason != null) {
      if (typeof action.disabledReason !== 'string') add(errors, `${path}.disabledReason`, 'must be a string when present');
      else if (action.enabled === false && !allowedEquipmentBlockerLabels.has(String(action.disabledReason || ''))) add(errors, `${path}.disabledReason`, 'must be an approved public equipment blocker label for disabled public actions');
    }
    for (const field of ['disabledReasonToken']) {
      if (action[field] != null && (typeof action[field] !== 'string' || !allowedEquipmentBlockerTokens.has(String(action[field] || '')))) add(errors, `${path}.${field}`, 'must be an approved public equipment blocker token when present');
    }
    for (const field of ['disabledReasonLabel']) if (action[field] != null) {
      if (typeof action[field] !== 'string') add(errors, `${path}.${field}`, 'must be a string when present');
      else if (!allowedEquipmentBlockerLabels.has(String(action[field] || ''))) add(errors, `${path}.${field}`, 'must be an approved public equipment blocker label when present');
    }
    if (typeof action.disabledReasonToken === 'string') {
      const expected = publicEquipmentBlockerLabel(action.disabledReasonToken);
      if (action.disabledReasonLabel != null && String(action.disabledReasonLabel || '') !== expected) add(errors, `${path}.disabledReasonLabel`, 'must match the canonical public label for disabledReasonToken');
      if (action.disabledReason != null && action.enabled === false && String(action.disabledReason || '') !== expected) add(errors, `${path}.disabledReason`, 'must match the canonical public label for disabledReasonToken');
    } else if (action.disabledReasonLabel != null) {
      add(errors, `${path}.disabledReasonLabel`, 'requires disabledReasonToken so label cannot be orphaned');
    }
    for (const field of ['blockerTokens']) if (action[field] != null) {
      validatePublicStringArray(action[field], `${path}.${field}`, errors);
      if (Array.isArray(action[field])) action[field].forEach((token, index) => {
        if (!allowedEquipmentBlockerTokens.has(String(token || ''))) add(errors, `${path}.${field}[${index}]`, 'must be an approved public equipment blocker token');
      });
    }
    if (action.blockerLabels != null) {
      validatePublicStringArray(action.blockerLabels, `${path}.blockerLabels`, errors);
      if (Array.isArray(action.blockerLabels)) action.blockerLabels.forEach((label, index) => {
        if (!allowedEquipmentBlockerLabels.has(String(label || ''))) add(errors, `${path}.blockerLabels[${index}]`, 'must be an approved public equipment blocker label');
      });
      if (!Array.isArray(action.blockerTokens)) add(errors, `${path}.blockerLabels`, 'requires blockerTokens so labels cannot be orphaned');
    }
    if (Array.isArray(action.blockerTokens) && Array.isArray(action.blockerLabels)) {
      if (action.blockerTokens.length !== action.blockerLabels.length) add(errors, `${path}.blockerLabels`, 'must have one canonical label per blocker token');
      action.blockerTokens.forEach((token, index) => {
        const expected = publicEquipmentBlockerLabel(token);
        if (action.blockerLabels[index] != null && String(action.blockerLabels[index] || '') !== expected) add(errors, `${path}.blockerLabels[${index}]`, 'must match the canonical public label for blockerTokens entry');
      });
    }
    if (action.targets != null) validateTargetCollection(action.targets, `${path}.targets`, errors);
  }

  function validateCoord(value, path, errors) {
    if (!isPlainObject(value)) return add(errors, path, 'must be an object');
    if (!isNonNegativeInteger(value.x)) add(errors, `${path}.x`, 'must be a non-negative integer');
    if (!isNonNegativeInteger(value.y)) add(errors, `${path}.y`, 'must be a non-negative integer');
  }

  function validatePublicContainerIdentity(value, path, errors) {
    if (!isPlainObject(value)) return add(errors, path, 'must be an object');
    validateAllowedKeys(value, path, new Set(['publicId', 'displayName', 'objectId']), errors);
    if (!isString(value.publicId)) add(errors, `${path}.publicId`, 'is required');
    if (value.displayName != null && typeof value.displayName !== 'string') add(errors, `${path}.displayName`, 'must be a string when present');
    if (value.objectId != null && !isNonNegativeInteger(value.objectId)) add(errors, `${path}.objectId`, 'must be a non-negative integer when present');
  }

  function validateTransferRow(row, path, errors) {
    if (!isPlainObject(row)) return add(errors, path, 'must be an object');
    validateAllowedKeys(row, path, new Set(['selector', 'key', 'text', 'displayName', 'objectId', 'quantity']), errors);
    if (row.selector != null && typeof row.selector !== 'string') add(errors, `${path}.selector`, 'must be a string when present');
    if (row.key != null && typeof row.key !== 'string') add(errors, `${path}.key`, 'must be a string when present');
    if (row.text != null && typeof row.text !== 'string') add(errors, `${path}.text`, 'must be a string when present');
    if (row.displayName != null && typeof row.displayName !== 'string') add(errors, `${path}.displayName`, 'must be a string when present');
    if (row.objectId != null && !isNonNegativeInteger(row.objectId)) add(errors, `${path}.objectId`, 'must be a non-negative integer when present');
    if (row.quantity != null && (!isInteger(row.quantity) || row.quantity < 0)) add(errors, `${path}.quantity`, 'must be a non-negative integer when present');
  }

  function validateTransferRows(value, path, errors) {
    if (value == null) return;
    if (!Array.isArray(value)) return add(errors, path, 'must be an array when present');
    value.forEach((row, index) => validateTransferRow(row, `${path}[${index}]`, errors));
  }

  function validateTransferPanes(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object when present');
    validateAllowedKeys(value, path, new Set(['left', 'right']), errors);
    validateTransferRows(value.left, `${path}.left`, errors);
    validateTransferRows(value.right, `${path}.right`, errors);
  }

  function validateLoadedSides(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object when present');
    validateAllowedKeys(value, path, new Set(['left', 'right']), errors);
    for (const key of ['left', 'right']) if (value[key] != null && typeof value[key] !== 'boolean') add(errors, `${path}.${key}`, 'must be boolean when present');
  }

  function validateTransferSide(value, path, errors) {
    if (value == null || value === '') return;
    if (value !== 'left' && value !== 'right') add(errors, path, 'must be left or right when present');
  }

  function validateTransferPendingSelection(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object when present');
    validateAllowedKeys(value, path, new Set(['action', 'selector', 'sourceSide', 'targetSide', 'itemName', 'transferId', 'requestId', 'expectedRequestId', 'reason', 'at']), errors);
    if (value.action !== 'out' && value.action !== 'in') add(errors, `${path}.action`, 'must be out or in');
    if (!isString(value.selector)) add(errors, `${path}.selector`, 'is required');
    validateTransferSide(value.sourceSide, `${path}.sourceSide`, errors);
    validateTransferSide(value.targetSide, `${path}.targetSide`, errors);
    for (const key of ['itemName', 'transferId', 'requestId', 'expectedRequestId', 'reason']) if (value[key] != null && typeof value[key] !== 'string') add(errors, `${path}.${key}`, 'must be a string when present');
    if (value.at != null && !isNonNegativeInteger(value.at)) add(errors, `${path}.at`, 'must be a non-negative integer when present');
  }

  function validateTransferRefreshIntent(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object when present');
    validateAllowedKeys(value, path, new Set(['kind', 'side', 'nextSide', 'transferId', 'command', 'reason', 'delayMs', 'at']), errors);
    if (!isString(value.kind)) add(errors, `${path}.kind`, 'is required');
    validateTransferSide(value.side, `${path}.side`, errors);
    validateTransferSide(value.nextSide, `${path}.nextSide`, errors);
    for (const key of ['transferId', 'command', 'reason']) if (value[key] != null && typeof value[key] !== 'string') add(errors, `${path}.${key}`, 'must be a string when present');
    for (const key of ['delayMs', 'at']) if (value[key] != null && !isNonNegativeInteger(value[key])) add(errors, `${path}.${key}`, 'must be a non-negative integer when present');
  }

  function validateTransferChoreographyPayload(payload, path, errors) {
    validateAllowedKeys(payload, path, new Set(['sessionId', 'pendingSelection', 'clearPendingSelection', 'autoLoadingSide', 'autoNextSide', 'reopenPending', 'autoInventoryLoadPending', 'refreshIntent', 'clearRefreshIntent', 'reason']), errors);
    if (!isString(payload.sessionId)) add(errors, `${path}.sessionId`, 'is required');
    validateTransferPendingSelection(payload.pendingSelection, `${path}.pendingSelection`, errors);
    if (payload.clearPendingSelection != null && typeof payload.clearPendingSelection !== 'boolean') add(errors, `${path}.clearPendingSelection`, 'must be boolean when present');
    validateTransferSide(payload.autoLoadingSide, `${path}.autoLoadingSide`, errors);
    validateTransferSide(payload.autoNextSide, `${path}.autoNextSide`, errors);
    if (payload.reopenPending != null && typeof payload.reopenPending !== 'boolean') add(errors, `${path}.reopenPending`, 'must be boolean when present');
    if (payload.autoInventoryLoadPending != null && typeof payload.autoInventoryLoadPending !== 'boolean') add(errors, `${path}.autoInventoryLoadPending`, 'must be boolean when present');
    validateTransferRefreshIntent(payload.refreshIntent, `${path}.refreshIntent`, errors);
    if (payload.clearRefreshIntent != null && typeof payload.clearRefreshIntent !== 'boolean') add(errors, `${path}.clearRefreshIntent`, 'must be boolean when present');
    if (payload.reason != null && typeof payload.reason !== 'string') add(errors, `${path}.reason`, 'must be a string when present');
  }

  function validatePublicTransferDelta(value, path, errors, { ground = false, container = false } = {}) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object when present');
    const identityKeys = ground ? ['coord'] : (container ? ['sessionId', 'container'] : []);
    validateAllowedKeys(value, path, new Set([...identityKeys, 'fromRevision', 'toRevision', 'added', 'removed', 'updated', 'changedCount', 'publicEvidence', 'changed']), errors);
    if (ground && value.coord != null) validateCoord(value.coord, `${path}.coord`, errors);
    if (container) {
      if (value.sessionId != null && !isString(value.sessionId)) add(errors, `${path}.sessionId`, 'must be a string when present');
      if (value.container != null) validatePublicContainerIdentity(value.container, `${path}.container`, errors);
    }
    for (const key of ['added', 'removed']) {
      if (value[key] != null) {
        if (!Array.isArray(value[key])) add(errors, `${path}.${key}`, 'must be an array when present');
        else value[key].forEach((item, index) => validatePublicItem(item, `${path}.${key}[${index}]`, errors));
      }
    }
    if (value.updated != null) {
      if (!Array.isArray(value.updated)) add(errors, `${path}.updated`, 'must be an array when present');
      else value.updated.forEach((entry, index) => {
        if (!isPlainObject(entry)) add(errors, `${path}.updated[${index}]`, 'must be an object');
        else {
          if (entry.before != null) validatePublicItem(entry.before, `${path}.updated[${index}].before`, errors);
          if (entry.after != null) validatePublicItem(entry.after, `${path}.updated[${index}].after`, errors);
        }
      });
    }
    for (const key of ['fromRevision', 'toRevision', 'changedCount']) if (value[key] != null && !isNonNegativeInteger(value[key])) add(errors, `${path}.${key}`, 'must be a non-negative integer when present');
    for (const key of ['publicEvidence', 'changed']) if (value[key] != null && typeof value[key] !== 'boolean') add(errors, `${path}.${key}`, 'must be boolean when present');
  }

  function validateTransferSessionPayload(payload, path, errors, { close = false } = {}) {
    validateAllowedKeys(payload, path, new Set(['sessionId', 'kind', 'prompt', 'ownerRequestId', 'requestId', 'leftRows', 'rightRows', 'loadedSides', 'feedback', 'groundCoord', 'coord', 'container', 'reason']), errors);
    if (!isString(payload.sessionId)) add(errors, `${path}.sessionId`, 'is required');
    if (!close && payload.kind != null && (!isString(payload.kind) || !transferSessionKinds.has(payload.kind))) add(errors, `${path}.kind`, `must be one of ${Array.from(transferSessionKinds).join(', ')}`);
    if (payload.prompt != null && typeof payload.prompt !== 'string') add(errors, `${path}.prompt`, 'must be a string when present');
    if (payload.ownerRequestId != null && typeof payload.ownerRequestId !== 'string') add(errors, `${path}.ownerRequestId`, 'must be a string when present');
    if (payload.requestId != null && typeof payload.requestId !== 'string') add(errors, `${path}.requestId`, 'must be a string when present');
    if (payload.feedback != null && typeof payload.feedback !== 'string') add(errors, `${path}.feedback`, 'must be a string when present');
    if (payload.reason != null && typeof payload.reason !== 'string') add(errors, `${path}.reason`, 'must be a string when present');
    validateTransferRows(payload.leftRows, `${path}.leftRows`, errors);
    validateTransferRows(payload.rightRows, `${path}.rightRows`, errors);
    validateLoadedSides(payload.loadedSides, `${path}.loadedSides`, errors);
    if (payload.groundCoord != null) validateCoord(payload.groundCoord, `${path}.groundCoord`, errors);
    if (payload.coord != null) validateCoord(payload.coord, `${path}.coord`, errors);
    if (payload.container != null) validatePublicContainerIdentity(payload.container, `${path}.container`, errors);
  }

  function validateTransferLifecyclePayload(eventType, payload, path, errors) {
    if (eventType === 'transfer.session.opened' || eventType === 'transfer.session.updated') return validateTransferSessionPayload(payload, path, errors);
    if (eventType === 'transfer.session.closed') return validateTransferSessionPayload(payload, path, errors, { close: true });
    if (eventType === 'transfer.choreography.updated') return validateTransferChoreographyPayload(payload, path, errors);
    if (eventType === 'transfer.begun') {
      validateAllowedKeys(payload, path, new Set(['transferId', 'sessionId', 'direction', 'sourceSide', 'targetSide', 'selector', 'itemName', 'expectedRequestId', 'beforePanes', 'groundCoord', 'coord', 'container']), errors);
      if (!isString(payload.transferId)) add(errors, `${path}.transferId`, 'is required');
      if (!isString(payload.sessionId)) add(errors, `${path}.sessionId`, 'is required');
      if (!transferDirections.has(payload.direction)) add(errors, `${path}.direction`, `must be one of ${Array.from(transferDirections).join(', ')}`);
      for (const key of ['sourceSide', 'targetSide', 'selector', 'itemName', 'expectedRequestId']) if (payload[key] != null && typeof payload[key] !== 'string') add(errors, `${path}.${key}`, 'must be a string when present');
      validateTransferPanes(payload.beforePanes, `${path}.beforePanes`, errors);
      if (payload.groundCoord != null) validateCoord(payload.groundCoord, `${path}.groundCoord`, errors);
      if (payload.coord != null) validateCoord(payload.coord, `${path}.coord`, errors);
      if (payload.container != null) validatePublicContainerIdentity(payload.container, `${path}.container`, errors);
      return;
    }
    if (eventType === 'transfer.confirmed') {
      validateAllowedKeys(payload, path, new Set(['transferId', 'kind', 'name', 'requestId', 'menuRequestId', 'accepted']), errors);
      if (!isString(payload.transferId)) add(errors, `${path}.transferId`, 'is required');
      if (payload.accepted != null && typeof payload.accepted !== 'boolean') add(errors, `${path}.accepted`, 'must be boolean when present');
      return;
    }
    if (eventType === 'transfer.completed') {
      validateAllowedKeys(payload, path, new Set(['transferId', 'sessionId', 'status', 'reason', 'afterPanes', 'groundPileDelta', 'containerContentsDelta', 'groundCoord', 'coord', 'container']), errors);
      if (!isString(payload.transferId)) add(errors, `${path}.transferId`, 'is required');
      if (payload.sessionId != null && !isString(payload.sessionId)) add(errors, `${path}.sessionId`, 'must be a string when present');
      if (payload.status != null && typeof payload.status !== 'string') add(errors, `${path}.status`, 'must be a string when present');
      if (payload.reason != null && typeof payload.reason !== 'string') add(errors, `${path}.reason`, 'must be a string when present');
      validateTransferPanes(payload.afterPanes, `${path}.afterPanes`, errors);
      validatePublicTransferDelta(payload.groundPileDelta, `${path}.groundPileDelta`, errors, { ground: true });
      validatePublicTransferDelta(payload.containerContentsDelta, `${path}.containerContentsDelta`, errors, { container: true });
      return;
    }
    if (eventType === 'transfer.rejected') {
      validateAllowedKeys(payload, path, new Set(['transferId', 'sessionId', 'reason', 'requestId', 'expectedRequestId']), errors);
      if (payload.transferId != null && !isString(payload.transferId)) add(errors, `${path}.transferId`, 'must be a string when present');
      if (!isString(payload.reason)) add(errors, `${path}.reason`, 'is required');
      return;
    }
    if (eventType === 'transfer.ground-pile-evidence.attached' || eventType === 'transfer.container-contents-evidence.attached') {
      const groundEvidence = eventType === 'transfer.ground-pile-evidence.attached';
      const key = groundEvidence ? 'groundPileDelta' : 'containerContentsDelta';
      validateAllowedKeys(payload, path, groundEvidence ? new Set(['transferId', 'sessionId', 'coord', 'groundCoord', 'replace', key]) : new Set(['transferId', 'sessionId', 'container', 'replace', key]), errors);
      if (!isString(payload.transferId)) add(errors, `${path}.transferId`, 'is required');
      if (payload.sessionId != null && !isString(payload.sessionId)) add(errors, `${path}.sessionId`, 'must be a string when present');
      if (groundEvidence) {
        if (payload.coord != null) validateCoord(payload.coord, `${path}.coord`, errors);
        if (payload.groundCoord != null) validateCoord(payload.groundCoord, `${path}.groundCoord`, errors);
      } else if (payload.container != null) validatePublicContainerIdentity(payload.container, `${path}.container`, errors);
      if (payload.replace != null && typeof payload.replace !== 'boolean') add(errors, `${path}.replace`, 'must be boolean when present');
      if (payload[key] == null) add(errors, `${path}.${key}`, 'is required');
      validatePublicTransferDelta(payload[key], `${path}.${key}`, errors, { ground: key === 'groundPileDelta', container: key === 'containerContentsDelta' });
    }
  }

  const hiddenCommandAckTextPattern = /\b(?:welded|curse(?:d)?|beatitude|otyp|true\s*name|charges?|locked|trapped|broken|contents?)\b/i;
  function validateNoForbiddenEvidenceFields(value, path, errors) {
    if (value == null) return;
    if (typeof value === 'string') {
      if (hiddenCommandAckTextPattern.test(value)) add(errors, path, 'must not expose hidden/spoiler command acknowledgement content');
      return;
    }
    if (typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach((entry, index) => validateNoForbiddenEvidenceFields(entry, `${path}[${index}]`, errors));
    for (const [key, nested] of Object.entries(value)) {
      if (forbiddenPublicItemFields.has(key)) add(errors, `${path}.${key}`, 'is not allowed in public command acknowledgement evidence');
      else validateNoForbiddenEvidenceFields(nested, `${path}.${key}`, errors);
    }
  }

  function validateCommandAckResult(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object when present');
    validateAllowedKeys(value, path, new Set(['status', 'kind', 'reason', 'actionId', 'actionLabel', 'target', 'inventoryRevision', 'equipmentRevision', 'delta']), errors);
    if (value.status != null && typeof value.status !== 'string') add(errors, `${path}.status`, 'must be a string when present');
    if (value.kind != null && typeof value.kind !== 'string') add(errors, `${path}.kind`, 'must be a string when present');
    if (value.reason != null && typeof value.reason !== 'string') add(errors, `${path}.reason`, 'must be a string when present');
    if (value.actionId != null && typeof value.actionId !== 'string') add(errors, `${path}.actionId`, 'must be a string when present');
    if (value.actionLabel != null && typeof value.actionLabel !== 'string') add(errors, `${path}.actionLabel`, 'must be a string when present');
    if (value.target != null) validateActionExecuteTarget(value.target, `${path}.target`, errors);
    if (value.inventoryRevision != null && !isNonNegativeInteger(value.inventoryRevision)) add(errors, `${path}.inventoryRevision`, 'must be a non-negative integer when present');
    if (value.equipmentRevision != null && !isNonNegativeInteger(value.equipmentRevision)) add(errors, `${path}.equipmentRevision`, 'must be a non-negative integer when present');
    if (value.delta != null && !isPlainObject(value.delta)) add(errors, `${path}.delta`, 'must be an object when present');
    validateNoForbiddenEvidenceFields(value, path, errors);
  }

  function validateEventPayload(eventType, payload, errors) {
    const path = 'payload';
    if (!isPlainObject(payload)) return add(errors, path, 'must be an object');
    switch (eventType) {
      case 'diagnostic.v1Compatibility':
        if (!isString(payload.reason)) add(errors, `${path}.reason`, 'is required');
        if (!isString(payload.legacyEventName) && !isString(payload.legacyPath)) add(errors, path, 'requires legacyEventName or legacyPath');
        break;
      case 'menu.opened':
      case 'menu.ready':
      case 'menu.selecting':
        validateMenuLifecyclePayload(payload, path, errors);
        break;
      case 'menu.item':
        validateAllowedKeys(payload, path, new Set(['menuId', 'item']), errors);
        if (!isString(payload.menuId)) add(errors, `${path}.menuId`, 'is required');
        validatePublicMenuItem(payload.item, `${path}.item`, errors);
        break;
      case 'menu.closed':
        validateAllowedKeys(payload, path, new Set(['menuId', 'reason']), errors);
        if (!isString(payload.menuId)) add(errors, `${path}.menuId`, 'is required');
        if (payload.reason != null && typeof payload.reason !== 'string') add(errors, `${path}.reason`, 'must be a string when present');
        break;
      case 'prompt.opened':
        validateAllowedKeys(payload, path, new Set(['promptId', 'promptType', 'promptPurpose', 'message', 'choices', 'owner', 'requestSource']), errors);
        if (!isString(payload.promptId)) add(errors, `${path}.promptId`, 'is required');
        if (!isString(payload.promptType)) add(errors, `${path}.promptType`, 'is required');
        if (payload.promptPurpose != null && typeof payload.promptPurpose !== 'string') add(errors, `${path}.promptPurpose`, 'must be a string when present');
        if (!isString(payload.message)) add(errors, `${path}.message`, 'is required');
        if (payload.choices != null) {
          if (!Array.isArray(payload.choices)) add(errors, `${path}.choices`, 'must be an array when present');
          else payload.choices.forEach((choice, index) => { if (typeof choice !== 'string') add(errors, `${path}.choices[${index}]`, 'must be a public string token'); });
        }
        if (payload.owner != null) validateOwner(payload.owner, `${path}.owner`, errors);
        if (payload.requestSource != null) validateRequestSource(payload.requestSource, `${path}.requestSource`, errors);
        break;
      case 'prompt.answered':
      case 'prompt.closed':
        if (!isString(payload.promptId)) add(errors, `${path}.promptId`, 'is required');
        break;
      case 'inventory.snapshot':
        validateAllowedKeys(payload, path, new Set(['revision', 'items']), errors);
        if (!isNonNegativeInteger(payload.revision)) add(errors, `${path}.revision`, 'is required and must be a non-negative integer');
        if (!Array.isArray(payload.items)) add(errors, `${path}.items`, 'is required');
        else payload.items.forEach((item, index) => validatePublicItem(item, `${path}.items[${index}]`, errors));
        break;
      case 'container.contents.snapshot':
      case 'container.candidates.snapshot':
        validateAllowedKeys(payload, path, new Set(['revision', 'items', 'sessionId', 'container']), errors);
        if (payload.revision != null && !isNonNegativeInteger(payload.revision)) add(errors, `${path}.revision`, 'must be a non-negative integer when present');
        if (!Array.isArray(payload.items)) add(errors, `${path}.items`, 'is required');
        else payload.items.forEach((item, index) => validatePublicItem(item, `${path}.items[${index}]`, errors));
        if (!isString(payload.sessionId)) add(errors, `${path}.sessionId`, 'is required');
        validatePublicContainerIdentity(payload.container, `${path}.container`, errors);
        break;
      case 'inventory.delta':
        validateAllowedKeys(payload, path, new Set(['revision', 'items', 'added', 'updated', 'removed']), errors);
        if (!isNonNegativeInteger(payload.revision)) add(errors, `${path}.revision`, 'is required and must be a non-negative integer');
        for (const key of ['items', 'added', 'updated']) {
          if (payload[key] != null) {
            if (!Array.isArray(payload[key])) add(errors, `${path}.${key}`, 'must be an array when present');
            else payload[key].forEach((item, index) => validatePublicItem(item, `${path}.${key}[${index}]`, errors));
          }
        }
        if (payload.removed != null) {
          if (!Array.isArray(payload.removed)) add(errors, `${path}.removed`, 'must be an array when present');
          else payload.removed.forEach((objectId, index) => { if (!isNonNegativeInteger(objectId)) add(errors, `${path}.removed[${index}]`, 'must be a public objectId'); });
        }
        break;
      case 'equipment.snapshot':
      case 'equipment.delta':
        validateAllowedKeys(payload, path, new Set(['revision', 'inventoryRevision', 'slots', 'items', 'added', 'updated', 'removed']), errors);
        if (!isNonNegativeInteger(payload.revision)) add(errors, `${path}.revision`, 'is required and must be a non-negative integer');
        if (payload.inventoryRevision != null && !isNonNegativeInteger(payload.inventoryRevision)) add(errors, `${path}.inventoryRevision`, 'must be a non-negative integer when present');
        if (eventType === 'equipment.snapshot' && !Array.isArray(payload.slots)) add(errors, `${path}.slots`, 'is required');
        if (payload.slots != null) {
          if (!Array.isArray(payload.slots)) add(errors, `${path}.slots`, 'must be an array');
          else payload.slots.forEach((slot, index) => validateEquipmentSlot(slot, `${path}.slots[${index}]`, errors));
        }
        for (const key of ['items', 'added', 'updated']) {
          if (payload[key] != null) {
            if (!Array.isArray(payload[key])) add(errors, `${path}.${key}`, 'must be an array when present');
            else payload[key].forEach((item, index) => validatePublicItem(item, `${path}.${key}[${index}]`, errors));
          }
        }
        if (payload.removed != null) {
          if (!Array.isArray(payload.removed)) add(errors, `${path}.removed`, 'must be an array when present');
          else payload.removed.forEach((objectId, index) => { if (!isNonNegativeInteger(objectId)) add(errors, `${path}.removed[${index}]`, 'must be a public objectId'); });
        }
        break;
      case 'action.affordances':
        if (!Array.isArray(payload.actions)) add(errors, `${path}.actions`, 'is required');
        else payload.actions.forEach((action, index) => validateAction(action, `${path}.actions[${index}]`, errors));
        break;
      case 'command.accepted':
      case 'command.rejected':
      case 'command.completed':
        validateAllowedKeys(payload, path, new Set(['commandId', 'transactionId', 'commandType', 'actionId', 'status', 'reason', 'blockerToken', 'supported', 'executionSource', 'replayBehavior', 'result']), errors);
        if (!isString(payload.commandId)) add(errors, `${path}.commandId`, 'is required');
        if (payload.transactionId != null && !isString(payload.transactionId)) add(errors, `${path}.transactionId`, 'must be a non-empty string when present');
        if (payload.commandType != null && typeof payload.commandType !== 'string') add(errors, `${path}.commandType`, 'must be a string when present');
        if (payload.actionId != null && typeof payload.actionId !== 'string') add(errors, `${path}.actionId`, 'must be a string when present');
        if (!isString(payload.status)) add(errors, `${path}.status`, 'is required');
        else if (!commandAckStatusesByEventType[eventType]?.has(payload.status)) add(errors, `${path}.status`, `must match ${eventType} acknowledgement status`);
        if (payload.supported != null && typeof payload.supported !== 'boolean') add(errors, `${path}.supported`, 'must be boolean when present');
        if (!isString(payload.executionSource)) add(errors, `${path}.executionSource`, 'is required');
        else if (!commandAckExecutionSources.has(payload.executionSource)) add(errors, `${path}.executionSource`, `must be one of ${Array.from(commandAckExecutionSources).join(', ')}`);
        if (!isString(payload.replayBehavior)) add(errors, `${path}.replayBehavior`, 'is required');
        else if (!commandAckReplayBehaviors.has(payload.replayBehavior)) add(errors, `${path}.replayBehavior`, 'must be an approved replay preservation policy');
        if (payload.blockerToken != null && (!isString(payload.blockerToken) || !commandBlockerTokens.has(payload.blockerToken))) add(errors, `${path}.blockerToken`, `must be one of ${Array.from(commandBlockerTokens).join(', ')}`);
        if (eventType === 'command.rejected' && !isString(payload.reason)) add(errors, `${path}.reason`, 'is required');
        if (eventType === 'command.rejected' && !isString(payload.blockerToken)) add(errors, `${path}.blockerToken`, 'is required for command rejection evidence');
        validateNoForbiddenEvidenceFields({ reason: payload.reason }, path, errors);
        validateCommandAckResult(payload.result, `${path}.result`, errors);
        break;
      case 'transaction.completed':
      case 'transaction.interrupted':
        if (!isString(payload.transactionId)) add(errors, `${path}.transactionId`, 'is required');
        if (eventType === 'transaction.interrupted' && !isString(payload.reason)) add(errors, `${path}.reason`, 'is required');
        break;
      case 'ground.pile.snapshot':
        validateAllowedKeys(payload, path, new Set(['revision', 'coord', 'items']), errors);
        validateCoord(payload.coord, `${path}.coord`, errors);
        if (payload.revision != null && !isNonNegativeInteger(payload.revision)) add(errors, `${path}.revision`, 'must be a non-negative integer when present');
        if (!Array.isArray(payload.items)) add(errors, `${path}.items`, 'is required');
        else payload.items.forEach((item, index) => validatePublicItem(item, `${path}.items[${index}]`, errors));
        break;
      case 'ground.transfer.confirmed':
      case 'ground.transfer.rejected':
      case 'container.transfer.confirmed':
      case 'container.transfer.rejected':
        if (!isString(payload.commandId)) add(errors, `${path}.commandId`, 'is required');
        if (payload.direction != null && !transferDirections.has(payload.direction)) add(errors, `${path}.direction`, `must be one of ${Array.from(transferDirections).join(', ')}`);
        if (/rejected$/.test(eventType) && !isString(payload.reason)) add(errors, `${path}.reason`, 'is required');
        break;
      case 'transfer.session.opened':
      case 'transfer.session.updated':
      case 'transfer.session.closed':
      case 'transfer.choreography.updated':
      case 'transfer.begun':
      case 'transfer.confirmed':
      case 'transfer.completed':
      case 'transfer.rejected':
      case 'transfer.ground-pile-evidence.attached':
      case 'transfer.container-contents-evidence.attached':
        validateTransferLifecyclePayload(eventType, payload, path, errors);
        break;
      case 'container.session.opened':
        validateAllowedKeys(payload, path, new Set(['sessionId', 'container']), errors);
        if (!isString(payload.sessionId)) add(errors, `${path}.sessionId`, 'is required');
        validatePublicContainerIdentity(payload.container, `${path}.container`, errors);
        break;
      case 'container.session.closed':
        validateAllowedKeys(payload, path, new Set(['sessionId', 'container', 'reason']), errors);
        if (!isString(payload.sessionId)) add(errors, `${path}.sessionId`, 'is required');
        if (payload.container != null) validatePublicContainerIdentity(payload.container, `${path}.container`, errors);
        if (payload.reason != null && typeof payload.reason !== 'string') add(errors, `${path}.reason`, 'must be a string when present');
        break;
      case 'map.cell.updated':
        validateCoord(payload.coord, `${path}.coord`, errors);
        break;
      case 'replay.marker':
        if (!isString(payload.name)) add(errors, `${path}.name`, 'is required');
        break;
      default:
        break;
    }
  }

  function validateActionRoutePayload(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object when present');
    validateAllowedKeys(value, path, new Set(['actionId', 'label', 'command', 'keys', 'selector', 'targetRingHand', 'ringHand', 'autoAnswerHand', 'source']), errors);
    if (value.actionId != null && !isString(value.actionId)) add(errors, `${path}.actionId`, 'must be a string when present');
    if (value.label != null && typeof value.label !== 'string') add(errors, `${path}.label`, 'must be a string when present');
    if (value.command != null && typeof value.command !== 'string') add(errors, `${path}.command`, 'must be a string when present');
    if (value.keys != null && typeof value.keys !== 'string') add(errors, `${path}.keys`, 'must be a string when present');
    if (value.selector != null && (typeof value.selector !== 'string' || value.selector.length !== 1)) add(errors, `${path}.selector`, 'must be a single public selector when present');
    if (value.targetRingHand != null && !['l', 'r', 'left', 'right', 'ring.left', 'ring.right'].includes(String(value.targetRingHand))) add(errors, `${path}.targetRingHand`, 'must be a public ring hand token when present');
    if (value.ringHand != null && !['l', 'r', 'left', 'right', 'ring.left', 'ring.right'].includes(String(value.ringHand))) add(errors, `${path}.ringHand`, 'must be a public ring hand token when present');
    if (value.autoAnswerHand != null && typeof value.autoAnswerHand !== 'boolean') add(errors, `${path}.autoAnswerHand`, 'must be boolean when present');
    if (value.source != null && typeof value.source !== 'string') add(errors, `${path}.source`, 'must be a string when present');
  }

  function validateActionExecuteTarget(value, path, errors) {
    if (value == null) return;
    if (Array.isArray(value)) return value.forEach((entry, index) => validateActionExecuteTarget(entry, `${path}[${index}]`, errors));
    if (!isPlainObject(value)) return add(errors, path, 'must be an object or array of public action targets');
    validateAllowedKeys(value, path, new Set(['selector', 'inventoryLetter', 'objectId', 'slotId', 'displayName', 'location']), errors);
    if (value.selector != null && (typeof value.selector !== 'string' || value.selector.length !== 1)) add(errors, `${path}.selector`, 'must be a single public selector when present');
    if (value.inventoryLetter != null && (typeof value.inventoryLetter !== 'string' || value.inventoryLetter.length !== 1)) add(errors, `${path}.inventoryLetter`, 'must be a single inventory letter when present');
    if (value.objectId != null && !isNonNegativeInteger(value.objectId)) add(errors, `${path}.objectId`, 'must be a non-negative integer when present');
    if (value.slotId != null && typeof value.slotId !== 'string') add(errors, `${path}.slotId`, 'must be a string when present');
    if (value.displayName != null && typeof value.displayName !== 'string') add(errors, `${path}.displayName`, 'must be a string when present');
    if (value.location != null) validatePublicLocation(value.location, `${path}.location`, errors);
  }

  function validateActionExecuteCommandPayload(payload, path, errors) {
    if (!isPlainObject(payload)) return add(errors, path, 'must be an object when present');
    validateAllowedKeys(payload, path, new Set(['actionId', 'label', 'surface', 'source', 'selector', 'target', 'item', 'route', 'commandKeys', 'keys', 'promptPolicy', 'expectedRequestId', 'publicGroundEvidence']), errors);
    if (payload.actionId != null && !isString(payload.actionId)) add(errors, `${path}.actionId`, 'must be a string when present');
    if (payload.label != null && typeof payload.label !== 'string') add(errors, `${path}.label`, 'must be a string when present');
    if (payload.surface != null && typeof payload.surface !== 'string') add(errors, `${path}.surface`, 'must be a string when present');
    if (payload.source != null && typeof payload.source !== 'string') add(errors, `${path}.source`, 'must be a string when present');
    if (payload.selector != null && (typeof payload.selector !== 'string' || payload.selector.length !== 1)) add(errors, `${path}.selector`, 'must be a single public selector when present');
    if (payload.commandKeys != null && typeof payload.commandKeys !== 'string') add(errors, `${path}.commandKeys`, 'must be a string when present');
    if (payload.keys != null && typeof payload.keys !== 'string') add(errors, `${path}.keys`, 'must be a string when present');
    if (payload.promptPolicy != null && typeof payload.promptPolicy !== 'string') add(errors, `${path}.promptPolicy`, 'must be a string when present');
    if (payload.publicGroundEvidence != null && typeof payload.publicGroundEvidence !== 'string') add(errors, `${path}.publicGroundEvidence`, 'must be a string when present');
    if (payload.expectedRequestId != null && typeof payload.expectedRequestId !== 'string') add(errors, `${path}.expectedRequestId`, 'must be a string when present');
    if (payload.item != null) validatePublicItem(payload.item, `${path}.item`, errors);
    if (payload.target != null) validateActionExecuteTarget(payload.target, `${path}.target`, errors);
    validateActionRoutePayload(payload.route, `${path}.route`, errors);
  }

  const directCommandPayloadSchemas = Object.freeze({
    'ground.transfer': Object.freeze({ allowed: Object.freeze(['transferId', 'direction', 'coord', 'itemId', 'count']) }),
    'equipment.change': Object.freeze({ allowed: Object.freeze(['action', 'itemId', 'slotId', 'hand']) }),
    'container.force': Object.freeze({ allowed: Object.freeze(['containerId', 'coord', 'toolOrWeaponId', 'confirmDestructive']) }),
    'container.tip': Object.freeze({ allowed: Object.freeze(['containerId', 'coord', 'confirmDestructive']) }),
    'container.untrap': Object.freeze({ allowed: Object.freeze(['containerId', 'coord']) }),
    'container.unlock': Object.freeze({ allowed: Object.freeze(['containerId', 'coord', 'toolId', 'intent']) }),
    'item.use': Object.freeze({ allowed: Object.freeze(['action', 'itemId', 'count', 'followupPolicy']) }),
    'terrain.action': Object.freeze({ allowed: Object.freeze(['action', 'coord', 'terrain', 'itemId']) }),
    'altar.action': Object.freeze({ allowed: Object.freeze(['action', 'coord', 'itemId', 'confirmDestructive']) }),
    'target.answer': Object.freeze({ allowed: Object.freeze(['targetRequestId', 'coord']) }),
  });

  function validateDirectCommandPayload(commandType, payload, path, errors) {
    const schema = directCommandPayloadSchemas[commandType];
    if (!schema || payload == null) return;
    if (!isPlainObject(payload)) return add(errors, path, 'must be an object when present');
    validateAllowedKeys(payload, path, new Set(schema.allowed), errors);
    for (const field of ['itemId', 'containerId', 'toolOrWeaponId', 'toolId']) {
      if (payload[field] != null && (!isInteger(payload[field]) || payload[field] <= 0)) add(errors, `${path}.${field}`, 'must be a positive public objectId when present');
    }
    for (const field of ['coord']) if (payload[field] != null) {
      validateCoord(payload[field], `${path}.${field}`, errors);
      if (isPlainObject(payload[field])) for (const key of Object.keys(payload[field])) if (key !== 'x' && key !== 'y') add(errors, `${path}.${field}.${key}`, 'is not an allowed public coordinate field');
    }
    if (payload.count != null && payload.count !== 'all' && (!isInteger(payload.count) || payload.count <= 0)) add(errors, `${path}.count`, 'must be "all" or a positive integer when present');
    for (const field of ['action', 'direction', 'slotId', 'hand', 'intent', 'followupPolicy', 'terrain', 'transferId', 'targetRequestId']) {
      if (payload[field] != null && !isString(payload[field])) add(errors, `${path}.${field}`, 'must be a non-empty public string when present');
    }
    for (const field of ['confirmDestructive']) if (payload[field] != null && typeof payload[field] !== 'boolean') add(errors, `${path}.${field}`, 'must be boolean when present');
  }

  function validateRevisionConsistency(eventType, revision, payload, errors) {
    if ((eventType === 'inventory.snapshot' || eventType === 'inventory.delta') && revision?.inventory != null && payload?.revision != null && revision.inventory !== payload.revision) {
      add(errors, 'revision.inventory', 'must match payload.revision for inventory events');
    }
    if ((eventType === 'equipment.snapshot' || eventType === 'equipment.delta') && revision?.equipment != null && payload?.revision != null && revision.equipment !== payload.revision) {
      add(errors, 'revision.equipment', 'must match payload.revision for equipment events');
    }
    if ((eventType === 'equipment.snapshot' || eventType === 'equipment.delta') && revision?.inventory != null && payload?.inventoryRevision != null && revision.inventory !== payload.inventoryRevision) {
      add(errors, 'revision.inventory', 'must match payload.inventoryRevision for equipment events');
    }
    if ((eventType === 'container.contents.snapshot' || eventType === 'container.candidates.snapshot') && revision?.container != null && payload?.revision != null && revision.container !== payload.revision) {
      add(errors, 'revision.container', 'must match payload.revision for container events');
    }
  }

  function validateEventEnvelope(envelope) {
    const errors = [];
    if (!isPlainObject(envelope)) return { ok: false, errors: ['event: must be an object'] };
    if (envelope.protocol !== protocol) add(errors, 'protocol', `must be ${protocol}`);
    if (!isSafeSequence(envelope.sequence)) add(errors, 'sequence', 'must be a non-negative safe integer');
    if (!isString(envelope.eventId)) add(errors, 'eventId', 'is required');
    if (!isString(envelope.eventType)) add(errors, 'eventType', 'is required');
    else if (!eventTypes.has(envelope.eventType)) add(errors, 'eventType', `unknown event type ${envelope.eventType}`);
    if (!isNonNegativeInteger(envelope.turn)) add(errors, 'turn', 'must be a non-negative integer');
    if (envelope.requestId != null && !isString(envelope.requestId)) add(errors, 'requestId', 'must be a non-empty string when present');
    if (envelope.transactionId != null && !isString(envelope.transactionId)) add(errors, 'transactionId', 'must be a non-empty string when present');
    validateSource(envelope.source, 'source', errors);
    validateRevision(envelope.revision, 'revision', errors);
    if (isString(envelope.eventType) && eventTypes.has(envelope.eventType)) {
      validateEventPayload(envelope.eventType, envelope.payload, errors);
      validateRevisionConsistency(envelope.eventType, envelope.revision, envelope.payload, errors);
    }
    return { ok: errors.length === 0, errors, event: errors.length ? undefined : Object.freeze({ ...envelope, payload: Object.freeze({ ...envelope.payload }) }) };
  }

  function validateCommandEnvelope(command) {
    const errors = [];
    if (!isPlainObject(command)) return { ok: false, errors: ['command: must be an object'] };
    if (command.protocol !== protocol) add(errors, 'protocol', `must be ${protocol}`);
    if (!isString(command.commandId)) add(errors, 'commandId', 'is required');
    if (!isString(command.commandType)) add(errors, 'commandType', 'is required');
    else if (!commandTypes.has(command.commandType)) add(errors, 'commandType', `unknown command type ${command.commandType}`);
    if (command.transactionId != null && !isString(command.transactionId)) add(errors, 'transactionId', 'must be a non-empty string when present');
    validateRevision(command.expectedRevision, 'expectedRevision', errors);
    if (command.commandType === 'action.execute') validateActionExecuteTarget(command.targets, 'targets', errors);
    else validateTargetCollection(command.targets, 'targets', errors);
    if (command.payload != null && !isPlainObject(command.payload)) add(errors, 'payload', 'must be an object when present');
    if (command.commandType === 'action.execute') {
      if (!isString(command.actionId) && !isString(command.payload?.actionId)) add(errors, 'actionId', 'action.execute requires actionId on the command or payload');
      if (command.payload != null) validateActionExecuteCommandPayload(command.payload, 'payload', errors);
    } else if (isString(command.commandType) && directCommandTypes.has(command.commandType)) {
      validateDirectCommandPayload(command.commandType, command.payload, 'payload', errors);
    }
    if (command.commandType === 'prompt.answer' && !isString(command.promptId) && !isString(command.payload?.promptId)) add(errors, 'promptId', 'prompt.answer requires promptId on the command or payload');
    if (command.commandType === 'menu.select' && !isString(command.menuId) && !isString(command.payload?.menuId)) add(errors, 'menuId', 'menu.select requires menuId on the command or payload');
    return { ok: errors.length === 0, errors, command: errors.length ? undefined : Object.freeze({ ...command, payload: Object.freeze({ ...(command.payload || {}) }) }) };
  }

  function normalizeEventEnvelope(envelope) {
    const checked = validateEventEnvelope(envelope);
    return Object.freeze({
      protocol,
      schemaVersion,
      kind: 'ui-protocol-event',
      valid: checked.ok,
      errors: Object.freeze(checked.errors.slice()),
      eventType: isPlainObject(envelope) ? envelope.eventType : undefined,
      event: checked.event,
      raw: isPlainObject(envelope) ? Object.freeze({ ...envelope }) : envelope,
    });
  }

  function normalizeCommandEnvelope(command) {
    const checked = validateCommandEnvelope(command);
    return Object.freeze({
      protocol,
      schemaVersion,
      kind: 'ui-protocol-command',
      valid: checked.ok,
      errors: Object.freeze(checked.errors.slice()),
      commandType: isPlainObject(command) ? command.commandType : undefined,
      command: checked.command,
      raw: isPlainObject(command) ? Object.freeze({ ...command }) : command,
    });
  }

  function commandBlockerTokenForReason(reason = '', details = {}) {
    const explicit = String(details.blockerToken || '').trim();
    if (commandBlockerTokens.has(explicit)) return explicit;
    const owner = String(details.activeInputOwner?.kind || details.activeInputOwner || '').toLowerCase();
    const text = `${reason || ''} ${details.reason || ''}`.toLowerCase();
    if (owner.includes('transfer') || /transfer/.test(text)) return 'blocked.input.transferActive';
    if (owner.includes('menu') || /menu/.test(text)) return 'blocked.input.menuActive';
    if (owner.includes('prompt') || /prompt.*active|prompt.*owns|owns input/.test(text)) return 'blocked.input.promptActive';
    if (/revision changed|stale revision|out-of-date/.test(text)) return 'blocked.input.staleRevision';
    if (/prompt ownership policy|promptpolicy|missing prompt policy/.test(text)) return 'blocked.input.missingPromptPolicy';
    if (/target|selector/.test(text)) return 'blocked.input.malformedTarget';
    if (/allowlist|unsupported route|not supported|not in the limited|try in nethack/.test(text)) return 'blocked.public.tryInNetHack';
    if (/route shape|command key|command bytes|malformed|ring hand/.test(text)) return 'blocked.input.malformedCommand';
    return 'blocked.input.malformedCommand';
  }

  function createCommandAckEvent({ sequence, eventId, eventType = 'command.accepted', turn = 0, source, command, commandId, transactionId, actionId, commandType, status, reason, blockerToken, supported, executionSource, replayBehavior, result } = {}) {
    const payload = {
      commandId: String(commandId || command?.commandId || '').trim(),
      transactionId: String(transactionId || command?.transactionId || '').trim() || undefined,
      commandType: String(commandType || command?.commandType || '').trim() || undefined,
      actionId: String(actionId || command?.actionId || command?.payload?.actionId || '').trim() || undefined,
      status: String(status || eventType.replace(/^command\./, '')).trim(),
      supported: typeof supported === 'boolean' ? supported : undefined,
      executionSource: String(executionSource || '').trim() || undefined,
      replayBehavior: String(replayBehavior || 'preserve-only; replay executes input events').trim(),
      result: result && typeof result === 'object' ? result : undefined,
    };
    if (eventType === 'command.rejected') {
      payload.reason = String(reason || 'v2 command rejected').trim();
      payload.blockerToken = commandBlockerTokenForReason(payload.reason, { blockerToken, supported });
    } else if (reason) payload.reason = String(reason).trim();
    return {
      protocol,
      sequence,
      eventId: String(eventId || `evt-${eventType.replace(/\./g, '-')}-${sequence}`).trim(),
      eventType,
      turn,
      source: source || { layer: 'renderer' },
      transactionId: payload.transactionId,
      payload,
    };
  }

  function validateEventSequence(events) {
    if (!Array.isArray(events)) return { ok: false, errors: ['events: must be an array'] };
    const errors = [];
    let previous = -1;
    events.forEach((event, index) => {
      const checked = validateEventEnvelope(event);
      if (!checked.ok) checked.errors.forEach((error) => errors.push(`events[${index}].${error}`));
      if (checked.ok && event.sequence <= previous) errors.push(`events[${index}].sequence: must be strictly monotonic`);
      if (checked.ok) previous = event.sequence;
    });
    return { ok: errors.length === 0, errors };
  }

  function createV1CompatibilityDiagnostic({ sequence, eventId, turn = 0, legacyEventName, legacyPath, reason, fallback, source } = {}) {
    return {
      protocol,
      sequence,
      eventId,
      eventType: 'diagnostic.v1Compatibility',
      turn,
      source: source || { layer: 'renderer' },
      payload: {
        legacyEventName,
        legacyPath,
        reason,
        fallback: fallback || 'classic-menu-safe-fallback',
      },
    };
  }

  return Object.freeze({
    protocol,
    version: protocol,
    schemaVersion,
    eventTypes: Object.freeze(Array.from(eventTypes).sort()),
    commandTypes: Object.freeze(Array.from(commandTypes).sort()),
    directCommandRegistry,
    validateEventEnvelope,
    validateCommandEnvelope,
    validateEventSequence,
    normalizeEventEnvelope,
    normalizeCommandEnvelope,
    createV1CompatibilityDiagnostic,
    createCommandAckEvent,
    commandBlockerTokenForReason,
    commandBlockerTokens: Object.freeze(Array.from(commandBlockerTokens).sort()),
    commandStatuses,
    directCommandPayloadSchemas,
    publicItemSchema: Object.freeze({ allowedFields: Object.freeze(Array.from(allowedPublicItemFields).sort()), forbiddenFields: Object.freeze(Array.from(forbiddenPublicItemFields).sort()), allowedKnownFlags: Object.freeze(Array.from(allowedKnownFlagKeys).sort()) }),
    equipmentSchema: Object.freeze({ slotIds: Object.freeze(Array.from(equipmentSlotIds).sort()), publicStatuses: Object.freeze(Array.from(publicEquipmentStatuses).sort()) }),
  });
}));
