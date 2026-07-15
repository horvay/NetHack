(function initUiProtocolV2(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./public-blockers'), require('./public-item-knowledge'));
  else root.NetHackUiProtocolV2 = factory(root.NetHackPublicBlockers, root.NetHackPublicItemKnowledge);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(PublicBlockers = {}, PublicItemKnowledge = {}) {
  const protocol = 'nethack-electron-ui/v2';
  const schemaVersion = 2;

  const eventTypes = new Set([
    'diagnostic.v1Compatibility',
    'menu.opened', 'menu.item', 'menu.ready', 'menu.selecting', 'menu.closed',
    'prompt.opened', 'prompt.answered', 'prompt.closed',
    'inventory.snapshot', 'inventory.delta',
    'equipment.snapshot', 'equipment.delta',
    'spell.rows', 'skill.rows',
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
  const publicItemClasses = new Set(['weapon', 'armor', 'food', 'potion', 'scroll', 'spellbook', 'wand', 'ring', 'amulet', 'tool', 'gem', 'coin', 'other']);
  const publicItemFilterGroups = new Set(['equipped', 'weapons', 'armor', 'consumables', 'magic']);
  const publicItemOwnershipStates = new Set(['owned', 'unpaid', 'for-sale']);
  const publicKnownFieldKeys = new Set(['beatitude', 'charges', 'enchantment', 'weight', 'erosion', 'corrosion', 'poisoned']);
  const publicBeatitudes = new Set(['blessed', 'uncursed', 'cursed']);
  const classificationConfidences = new Set(['typed', 'fallback']);
  const publicSkillRanks = new Set(['Unskilled', 'Basic', 'Skilled', 'Expert', 'Master', 'Grand Master']);
  const publicClassFilterGroups = Object.freeze({
    weapon: new Set(['weapons']), armor: new Set(['armor']), food: new Set(['consumables']), potion: new Set(['consumables', 'magic']), scroll: new Set(['consumables', 'magic']), spellbook: new Set(['magic']), wand: new Set(['magic']), ring: new Set(['magic']), amulet: new Set(['magic']), tool: new Set(), gem: new Set(), coin: new Set(), other: new Set(),
  });
  const publicClassEquipmentSlots = Object.freeze({
    weapon: new Set(['mainHand', 'offHand', 'quiver']), armor: new Set(Array.from(equipmentSlotIds).filter((slot) => slot.startsWith('armor.'))), ring: new Set(['ring.left', 'ring.right']), amulet: new Set(['amulet']), tool: new Set(['mainHand', 'offHand', 'eyes']),
    food: new Set(), potion: new Set(), scroll: new Set(), spellbook: new Set(), wand: new Set(), gem: new Set(['quiver']), coin: new Set(), other: new Set(),
  });
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
    validateAllowedKeys(value, path, new Set(['layer', 'window', 'event', 'reason', 'source', 'authoritative']), errors);
    if (value.layer != null && (!isString(value.layer) || !sourceLayers.has(value.layer))) add(errors, `${path}.layer`, `must be one of ${Array.from(sourceLayers).join(', ')}`);
    if (value.window != null && !isNonNegativeInteger(value.window)) add(errors, `${path}.window`, 'must be a non-negative integer');
    for (const key of ['event', 'reason', 'source']) if (value[key] != null && (typeof value[key] !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(value[key]))) add(errors, `${path}.${key}`, 'must be an opaque public source token');
    if (value.authoritative != null && typeof value.authoritative !== 'boolean') add(errors, `${path}.authoritative`, 'must be boolean when present');
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

  function validateActiveInputOwner(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object');
    validateAllowedKeys(value, path, new Set(['kind', 'requestId', 'transactionId', 'label', 'lifecycle', 'source', 'window']), errors);
    for (const key of ['kind', 'requestId', 'transactionId', 'label', 'lifecycle', 'source']) if (value[key] != null && typeof value[key] !== 'string') add(errors, `${path}.${key}`, 'must be a string when present');
    if (value.window != null && !isNonNegativeInteger(value.window)) add(errors, `${path}.window`, 'must be a non-negative integer when present');
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

  function validatePublicSelector(value, path, errors) {
    if (value == null) return;
    if (typeof value !== 'string' || value.length !== 1 || value.charCodeAt(0) < 32 || value.charCodeAt(0) > 126) add(errors, path, 'must be one public printable selector character when present');
  }

  function validateSpellOrSkillRows(eventType, payload, path, errors) {
    const spell = eventType === 'spell.rows';
    validateAllowedKeys(payload, path, new Set(['menuId', 'revision', 'classificationConfidence', 'rows']), errors);
    if (!isString(payload.menuId)) add(errors, `${path}.menuId`, 'is required');
    if (!isNonNegativeInteger(payload.revision)) add(errors, `${path}.revision`, 'is required and must be a non-negative integer');
    if (!classificationConfidences.has(payload.classificationConfidence)) add(errors, `${path}.classificationConfidence`, 'must be typed or fallback');
    if (!Array.isArray(payload.rows)) return add(errors, `${path}.rows`, 'is required and must be an array');
    const selectors = new Set();
    const names = new Set();
    payload.rows.forEach((row, index) => {
      const rowPath = `${path}.rows[${index}]`;
      if (!isPlainObject(row)) return add(errors, rowPath, 'must be an object');
      const allowed = spell
        ? new Set(['name', 'selector', 'level', 'pwCost', 'failure', 'status'])
        : new Set(['name', 'selector', 'currentRank', 'nextRank', 'nextCost', 'canAdvance']);
      validateAllowedKeys(row, rowPath, allowed, errors);
      if (!isString(row.name)) add(errors, `${rowPath}.name`, 'is required');
      else {
        const normalizedName = row.name.trim().toLocaleLowerCase();
        if (names.has(normalizedName)) add(errors, `${rowPath}.name`, 'must be unique in an authoritative row collection');
        names.add(normalizedName);
      }
      validatePublicSelector(row.selector, `${rowPath}.selector`, errors);
      if (row.selector != null) {
        if (selectors.has(row.selector)) add(errors, `${rowPath}.selector`, 'must be unique in an authoritative row collection');
        selectors.add(row.selector);
      }
      if (spell) {
        if (row.level != null && (!isInteger(row.level) || row.level < 0 || row.level > 99)) add(errors, `${rowPath}.level`, 'must be an integer from 0 to 99 when present');
        if (row.pwCost != null && !isNonNegativeInteger(row.pwCost)) add(errors, `${rowPath}.pwCost`, 'must be a non-negative integer when present');
        if (row.failure != null && (!isInteger(row.failure) || row.failure < 0 || row.failure > 100)) add(errors, `${rowPath}.failure`, 'must be an integer percentage from 0 to 100 when present');
        if (row.status != null && !isString(row.status)) add(errors, `${rowPath}.status`, 'must be a non-empty public string when present');
      } else {
        if (!publicSkillRanks.has(row.currentRank)) add(errors, `${rowPath}.currentRank`, `must be one of ${Array.from(publicSkillRanks).join(', ')}`);
        if (row.nextRank != null && !publicSkillRanks.has(row.nextRank)) add(errors, `${rowPath}.nextRank`, `must be one of ${Array.from(publicSkillRanks).join(', ')}`);
        if (row.nextCost != null && (!isInteger(row.nextCost) || row.nextCost <= 0)) add(errors, `${rowPath}.nextCost`, 'must be a positive integer when present');
        if (typeof row.canAdvance !== 'boolean') add(errors, `${rowPath}.canAdvance`, 'is required and must be boolean');
        if (row.selector != null && row.canAdvance !== true) add(errors, `${rowPath}.selector`, 'requires canAdvance true');
        if ((row.nextRank != null || row.nextCost != null) && row.canAdvance !== true) add(errors, rowPath, 'next rank and cost require canAdvance true');
      }
    });
  }

  function validateTargetCollection(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value) && !Array.isArray(value)) add(errors, path, 'must be an object or array');
  }

  function validateNestedPublicItemLabels(value, path, errors, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) return value.forEach((entry, index) => validateNestedPublicItemLabels(entry, `${path}[${index}]`, errors, seen));
    const rawLabel = value.displayName || value.text || value.name || value.itemName || value.targetText;
    if (rawLabel != null) {
      validateUnknownIdentityDisplay({ ...value, displayName: PublicItemKnowledge.stripSelector(rawLabel, value) || 'item' }, path, errors);
    }
    for (const [key, entry] of Object.entries(value)) validateNestedPublicItemLabels(entry, `${path}.${key}`, errors, seen);
  }

  const allowedKnownFlagKeys = new Set(['identity', 'appearance', 'quantity', 'naming']);
  function validateKnownFlags(value, path, errors) {
    if (value == null) return;
    if (typeof value === 'boolean') return;
    if (!isPlainObject(value)) return add(errors, path, 'must be a boolean or object of public known flags');
    for (const [key, known] of Object.entries(value)) {
      if (!allowedKnownFlagKeys.has(key)) add(errors, `${path}.${key}`, 'is not an allowed public known flag');
      if (typeof known !== 'boolean') add(errors, `${path}.${key}`, 'must be boolean');
    }
  }

  const forbiddenPublicItemFields = new Set(['baseType', 'beatitude', 'enchantment', 'charges', 'weight', 'curseState', 'cursed', 'blessed', 'buc', 'trapped', 'trapState', 'contents', 'trueName', 'objectType', 'otyp', 'spe', 'remainingCharges']);
  const forbiddenPublicActionTokens = new Set(['container.locked', 'container.trapped', 'container.broken', 'locked', 'trapped', 'broken']);
  const hiddenContainerTextPattern = /\b(?:locked|trapped|broken)\b(?!-looking)|\bcontaining\s+\d+\s+items?\b/i;
  const containerSurfacePattern = /\b(?:chest|box|bag|sack|container)\b/i;
  const allowedEquipmentBlockerTokens = PublicBlockers.publicEquipmentBlockerTokenSet || new Set();
  const allowedEquipmentBlockerLabels = PublicBlockers.publicEquipmentBlockerLabelSet || new Set();
  const publicEquipmentBlockerLabel = typeof PublicBlockers.publicEquipmentBlockerLabel === 'function'
    ? PublicBlockers.publicEquipmentBlockerLabel
    : ((token) => (PublicBlockers.publicEquipmentBlockerLabels || {})[String(token || '')] || '');
  const allowedPublicItemFields = new Set(['objectId', 'inventoryLetter', 'displayName', 'appearanceName', 'quantity', 'known', 'location', 'actionAffordances', 'publicActionHints', 'objectClass', 'glyph', 'glyphChar', 'wornMask', 'semanticKind', 'semanticName', 'semanticAppearance', 'semanticKnown', 'publicClass', 'filterGroups', 'equipmentSlots', 'knownFields', 'ownership', 'calledName', 'individualName']);
  function validatePublicStringArray(value, path, errors) {
    if (value == null) return;
    if (!Array.isArray(value)) return add(errors, path, 'must be an array when present');
    value.forEach((item, index) => { if (typeof item !== 'string') add(errors, `${path}[${index}]`, 'must be a public string token'); });
  }

  function validatePublicKnownFields(value, path, errors, publicClass) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object when present');
    validateAllowedKeys(value, path, publicKnownFieldKeys, errors);
    if (value.beatitude != null && !publicBeatitudes.has(value.beatitude)) add(errors, `${path}.beatitude`, `must be one of ${Array.from(publicBeatitudes).join(', ')}`);
    for (const key of ['charges', 'weight', 'erosion', 'corrosion']) if (value[key] != null && !isNonNegativeInteger(value[key])) add(errors, `${path}.${key}`, 'must be a non-negative integer when present');
    if (value.enchantment != null && (!isInteger(value.enchantment) || value.enchantment < -99 || value.enchantment > 99)) add(errors, `${path}.enchantment`, 'must be an integer from -99 to 99 when present');
    if (value.poisoned != null && typeof value.poisoned !== 'boolean') add(errors, `${path}.poisoned`, 'must be boolean when present');
    const classAllows = (key, allowed) => {
      if (value[key] != null && (!publicClass || !allowed.includes(publicClass))) add(errors, `${path}.${key}`, 'is not applicable to the declared publicClass');
    };
    classAllows('charges', ['wand', 'tool']);
    classAllows('enchantment', ['weapon', 'armor', 'ring', 'tool']);
    classAllows('erosion', ['weapon', 'armor']);
    classAllows('corrosion', ['weapon', 'armor']);
    classAllows('poisoned', ['weapon']);
  }

  function validatePublicOwnership(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be an object when present');
    validateAllowedKeys(value, path, new Set(['state', 'price', 'currency']), errors);
    if (!publicItemOwnershipStates.has(value.state)) add(errors, `${path}.state`, `must be one of ${Array.from(publicItemOwnershipStates).join(', ')}`);
    if (value.price != null && !isNonNegativeInteger(value.price)) add(errors, `${path}.price`, 'must be a non-negative integer when present');
    if (value.currency != null && !isString(value.currency)) add(errors, `${path}.currency`, 'must be a non-empty string when present');
  }

  function validateItemFilterGroups(item, path, errors) {
    validatePublicStringArray(item.filterGroups, `${path}.filterGroups`, errors);
    if (!Array.isArray(item.filterGroups)) return;
    const seen = new Set();
    item.filterGroups.forEach((group, index) => {
      if (!publicItemFilterGroups.has(group)) add(errors, `${path}.filterGroups[${index}]`, `must be one of ${Array.from(publicItemFilterGroups).join(', ')}`);
      if (seen.has(group)) add(errors, `${path}.filterGroups[${index}]`, 'must be unique');
      seen.add(group);
      if (group === 'equipped') {
        if (!(Number.isInteger(item.wornMask) && item.wornMask > 0)) add(errors, `${path}.filterGroups[${index}]`, 'equipped requires a non-zero public wornMask');
      } else if (!item.publicClass) add(errors, `${path}.filterGroups[${index}]`, 'requires publicClass so filters never infer identity from display text');
      else if (!publicClassFilterGroups[item.publicClass]?.has(group)) add(errors, `${path}.filterGroups[${index}]`, 'is not a public filter for this publicClass');
    });
  }

  function validateNoHiddenContainerText(value, path, errors) {
    if (value == null || typeof value !== 'string') return;
    if (containerSurfacePattern.test(value) && hiddenContainerTextPattern.test(value)) {
      add(errors, path, 'must not expose hidden container lock/trap/broken/content words unless recorded as a historical visible message');
    }
  }
  function normalizedPublicItemLabel(value) {
    return String(value || '').replace(/^\s*[A-Za-z$]\s*[-+]\s*/, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  }
  function validateUnknownIdentityDisplay(item, path, errors) {
    if (PublicItemKnowledge.identityIsPublic(item)) return;
    const display = normalizedPublicItemLabel(item.displayName);
    const appearance = normalizedPublicItemLabel(item.appearanceName || item.semanticAppearance);
    const authorizedDisplay = normalizedPublicItemLabel(PublicItemKnowledge.publicDisplayLabel(item, { neutral: 'item' }));
    if (item.known?.appearance === true) return;
    if (item.known?.appearance === false) {
      if (appearance) add(errors, `${path}.known.appearance`, 'false must redact contradictory appearance fields');
      if (display !== 'item') add(errors, `${path}.displayName`, 'must be the neutral item label when identity or appearance authorization is absent');
      return;
    }
    if (appearance) {
      if (display !== appearance && display !== authorizedDisplay) add(errors, `${path}.displayName`, 'must equal the explicit public appearance plus any exact authorized player name unless known.appearance true authorizes generic display text');
    } else if (display !== 'item') add(errors, `${path}.displayName`, 'generic display text requires explicit public identity or appearance authorization');
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
    if (slot.item != null) {
      validatePublicItem(slot.item, `${path}.item`, errors);
      if (slot.objectId != null && slot.item.objectId != null && slot.objectId !== slot.item.objectId) add(errors, `${path}.item.objectId`, 'must match slot.objectId');
      if (slot.item.publicClass && !publicClassEquipmentSlots[slot.item.publicClass]?.has(slot.slotId)) add(errors, `${path}.item.publicClass`, 'is not compatible with the occupied slot');
      if (slot.item.publicClass && Array.isArray(slot.item.equipmentSlots) && slot.item.equipmentSlots.length > 0 && !slot.item.equipmentSlots.includes(slot.slotId)) add(errors, `${path}.item.equipmentSlots`, 'must include the occupied slot');
    }
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
    if (item.objectClass != null && (typeof item.objectClass !== 'string' || item.objectClass.length !== 1)) add(errors, `${path}.objectClass`, 'must be one public object-class character when present');
    if (item.glyph != null && !isNonNegativeInteger(item.glyph)) add(errors, `${path}.glyph`, 'must be a non-negative integer when present');
    if (item.glyphChar != null && !isNonNegativeInteger(item.glyphChar)) add(errors, `${path}.glyphChar`, 'must be a non-negative integer when present');
    if (item.wornMask != null && !isNonNegativeInteger(item.wornMask)) add(errors, `${path}.wornMask`, 'must be a non-negative integer when present');
    if (item.semanticKind != null && typeof item.semanticKind !== 'string') add(errors, `${path}.semanticKind`, 'must be a string when present');
    if (item.semanticKnown != null && typeof item.semanticKnown !== 'boolean') add(errors, `${path}.semanticKnown`, 'must be boolean when present');
    if (item.semanticAppearance != null && typeof item.semanticAppearance !== 'string') add(errors, `${path}.semanticAppearance`, 'must be a string when present');
    if (item.semanticName != null && typeof item.semanticName !== 'string') add(errors, `${path}.semanticName`, 'must be a string when present');
    validateUnknownIdentityDisplay(item, path, errors);
    if (item.semanticKnown === false && item.known?.identity === true) add(errors, `${path}.known.identity`, 'must not contradict semanticKnown false');
    if (item.semanticKnown === true && item.known?.identity === false) add(errors, `${path}.known.identity`, 'must not contradict semanticKnown true');
    if (item.semanticName != null && String(item.semanticName).trim() && (item.semanticKnown === false || item.known?.identity === false || (item.semanticKnown !== true && item.known?.identity !== true))) add(errors, `${path}.semanticName`, 'must be omitted unless identity is consistently public/known; use displayName, appearanceName, or semanticAppearance');
    if (item.publicClass != null && !publicItemClasses.has(item.publicClass)) add(errors, `${path}.publicClass`, `must be one of ${Array.from(publicItemClasses).join(', ')}`);
    validateItemFilterGroups(item, path, errors);
    validatePublicStringArray(item.equipmentSlots, `${path}.equipmentSlots`, errors);
    if (Array.isArray(item.equipmentSlots)) item.equipmentSlots.forEach((slot, index) => {
      if (!equipmentSlotIds.has(slot)) add(errors, `${path}.equipmentSlots[${index}]`, `must be one of ${Array.from(equipmentSlotIds).join(', ')}`);
      else if (item.publicClass && !publicClassEquipmentSlots[item.publicClass]?.has(slot)) add(errors, `${path}.equipmentSlots[${index}]`, 'is not compatible with the declared publicClass');
    });
    validatePublicKnownFields(item.knownFields, `${path}.knownFields`, errors, item.publicClass);
    validatePublicOwnership(item.ownership, `${path}.ownership`, errors);
    for (const key of ['calledName', 'individualName']) if (item[key] != null) {
      if (!isString(item[key])) add(errors, `${path}.${key}`, 'must be a non-empty public string when present');
      else if (item.known?.naming !== true) add(errors, `${path}.${key}`, 'requires explicit public naming knowledge');
      else if (PublicItemKnowledge.publicNamingValue(item, key) !== item[key]) add(errors, `${path}.${key}`, 'must satisfy the explicit public naming contract without smuggling identity');
    }
    if (item.quantity != null && (!isInteger(item.quantity) || item.quantity < 0)) add(errors, `${path}.quantity`, 'must be a non-negative integer when present');
    if (item.known != null) validateKnownFlags(item.known, `${path}.known`, errors);
    if (item.location != null) validatePublicLocation(item.location, `${path}.location`, errors);
    validatePublicStringArray(item.actionAffordances, `${path}.actionAffordances`, errors);
    validatePublicStringArray(item.publicActionHints, `${path}.publicActionHints`, errors);
    for (const [field, values] of [['actionAffordances', item.actionAffordances], ['publicActionHints', item.publicActionHints]]) {
      if (Array.isArray(values)) values.forEach((token, index) => {
        if (typeof token !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(token)) add(errors, `${path}.${field}[${index}]`, 'must be an opaque public action token');
        if (forbiddenPublicActionTokens.has(String(token || ''))) add(errors, `${path}.${field}[${index}]`, 'must not expose hidden lock/trap/broken state as an action token');
      });
    }
  }

  function validateUniquePublicItems(items, path, errors) {
    if (!Array.isArray(items)) return;
    const objectIds = new Set();
    const letters = new Set();
    items.forEach((item, index) => {
      if (item?.objectId != null) {
        if (objectIds.has(item.objectId)) add(errors, `${path}[${index}].objectId`, 'must be unique in an authoritative item collection');
        objectIds.add(item.objectId);
      }
      if (item?.inventoryLetter) {
        if (letters.has(item.inventoryLetter)) add(errors, `${path}[${index}].inventoryLetter`, 'must be unique in an authoritative item collection');
        letters.add(item.inventoryLetter);
      }
    });
  }

  const allowedMenuItemFields = new Set(['selector', 'text', 'index', 'glyph', 'glyphChar', 'semanticKind', 'semanticName', 'semanticAppearance', 'semanticKnown', 'known', 'calledName', 'individualName', 'actionAffordances']);
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
    if (item.known != null) validateKnownFlags(item.known, `${path}.known`, errors);
    if (item.semanticKnown === false && item.known?.identity === true) add(errors, `${path}.known.identity`, 'must not contradict semanticKnown false');
    if (item.semanticKnown === true && item.known?.identity === false) add(errors, `${path}.known.identity`, 'must not contradict semanticKnown true');
    if (item.semanticName != null && String(item.semanticName).trim() && !PublicItemKnowledge.identityIsPublic(item)) add(errors, `${path}.semanticName`, 'must be omitted unless identity is explicitly public; use semanticAppearance/text only');
    if (PublicItemKnowledge.isObjectMenuItem(item) && !PublicItemKnowledge.identityIsPublic(item)) {
      const display = normalizedPublicItemLabel(item.text);
      const appearance = normalizedPublicItemLabel(item.semanticAppearance);
      if (item.known?.appearance === false) {
        if (appearance) add(errors, `${path}.known.appearance`, 'false must redact contradictory semanticAppearance');
        if (display !== 'item') add(errors, `${path}.text`, 'must use a neutral item label when appearance authorization is false');
      } else if (item.known?.appearance !== true) {
        const authorizedDisplay = normalizedPublicItemLabel(PublicItemKnowledge.publicDisplayLabel({ ...item, displayName: item.text }, { neutral: 'item' }));
        if (appearance ? (display !== appearance && display !== authorizedDisplay) : display !== 'item') add(errors, `${path}.text`, 'must use explicit semanticAppearance plus any exact authorized player name or a neutral item label when identity authorization is absent');
      }
    }
    for (const key of ['calledName', 'individualName']) if (item[key] != null) {
      if (!isString(item[key])) add(errors, `${path}.${key}`, 'must be a non-empty public string when present');
      else if (item.known?.naming !== true) add(errors, `${path}.${key}`, 'requires explicit public naming knowledge');
      else if (PublicItemKnowledge.publicNamingValue({ ...item, displayName: item.text }, key) !== item[key]) add(errors, `${path}.${key}`, 'must satisfy the explicit public naming contract without smuggling identity');
    }
    validatePublicStringArray(item.actionAffordances, `${path}.actionAffordances`, errors);
  }

  const allowedActionFields = new Set(['actionId', 'label', 'section', 'enabled', 'disabledReason', 'disabledReasonToken', 'disabledReasonLabel', 'dangerLevel', 'blockerTokens', 'blockerLabels', 'params', 'promptPlan', 'execution', 'consumesTurn', 'source', 'targets']);
  const allowedAffordanceTargetFields = new Set(['selector', 'inventoryLetter', 'objectId', 'itemId', 'containerId', 'slotId', 'publicId', 'displayName', 'appearanceName', 'semanticAppearance', 'semanticKnown', 'known', 'location', 'coord']);
  const allowedActionParamFields = new Set(['ringHand', 'targetRingHand', 'autoAnswerHand', 'afterActionId', 'afterLabel', 'slotIds']);
  const allowedActionExecutionFields = new Set(['route', 'action', 'keys']);

  function validateAffordanceTargets(value, path, errors) {
    if (Array.isArray(value)) return value.forEach((target, index) => validateAffordanceTargets(target, `${path}[${index}]`, errors));
    if (!isPlainObject(value)) return add(errors, path, 'must contain only structured public targets');
    validateAllowedKeys(value, path, allowedAffordanceTargetFields, errors);
    if ((value.semanticAppearance != null || value.appearanceName != null) && value.displayName == null) add(errors, `${path}.displayName`, 'is required when public appearance text is present');
    if (value.publicId != null && (typeof value.publicId !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(value.publicId))) add(errors, `${path}.publicId`, 'must be an opaque public identifier token');
    if (value.location != null) validatePublicLocation(value.location, `${path}.location`, errors);
    if (value.coord != null) validateCoord(value.coord, `${path}.coord`, errors);
    validateNestedPublicItemLabels(value, path, errors);
  }

  function validateActionParams(value, path, errors) {
    if (!isPlainObject(value)) return add(errors, path, 'must be an object');
    validateAllowedKeys(value, path, allowedActionParamFields, errors);
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'slotIds') validatePublicStringArray(entry, `${path}.${key}`, errors);
      else if (!['string', 'boolean'].includes(typeof entry)) add(errors, `${path}.${key}`, 'must be a string or boolean');
    }
  }

  function validateActionExecution(value, path, errors) {
    if (!isPlainObject(value)) return add(errors, path, 'must be an object');
    validateAllowedKeys(value, path, allowedActionExecutionFields, errors);
    for (const [key, entry] of Object.entries(value)) if (typeof entry !== 'string') add(errors, `${path}.${key}`, 'must be a string');
  }

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
    if (action.targets != null) validateAffordanceTargets(action.targets, `${path}.targets`, errors);
    if (action.params != null) validateActionParams(action.params, `${path}.params`, errors);
    if (action.execution != null) validateActionExecution(action.execution, `${path}.execution`, errors);
    if (action.promptPlan != null && typeof action.promptPlan !== 'string') validatePublicStringArray(action.promptPlan, `${path}.promptPlan`, errors);
    for (const key of ['section', 'dangerLevel', 'consumesTurn']) if (action[key] != null && typeof action[key] !== 'string') add(errors, `${path}.${key}`, 'must be a string when present');
    if (action.source != null && (typeof action.source !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(action.source))) add(errors, `${path}.source`, 'must be an opaque public source token');
  }

  function validateCoord(value, path, errors) {
    if (!isPlainObject(value)) return add(errors, path, 'must be an object');
    validateAllowedKeys(value, path, new Set(['x', 'y']), errors);
    if (!isNonNegativeInteger(value.x)) add(errors, `${path}.x`, 'must be a non-negative integer');
    if (!isNonNegativeInteger(value.y)) add(errors, `${path}.y`, 'must be a non-negative integer');
  }

  function validatePublicContainerIdentity(value, path, errors) {
    if (!isPlainObject(value)) return add(errors, path, 'must be an object');
    validateAllowedKeys(value, path, new Set(['publicId', 'displayName', 'objectId', 'appearanceName', 'semanticAppearance', 'semanticKnown', 'known']), errors);
    if (!isString(value.publicId)) add(errors, `${path}.publicId`, 'is required');
    else if (!/^[A-Za-z0-9_.:-]+$/.test(value.publicId)) add(errors, `${path}.publicId`, 'must be an opaque public identifier token');
    if (!isString(value.displayName)) add(errors, `${path}.displayName`, 'is required');
    if (value.appearanceName != null && typeof value.appearanceName !== 'string') add(errors, `${path}.appearanceName`, 'must be a string when present');
    if (value.semanticAppearance != null && typeof value.semanticAppearance !== 'string') add(errors, `${path}.semanticAppearance`, 'must be a string when present');
    if (value.semanticKnown != null && typeof value.semanticKnown !== 'boolean') add(errors, `${path}.semanticKnown`, 'must be boolean when present');
    if (value.known != null) validateKnownFlags(value.known, `${path}.known`, errors);
    if (value.displayName != null) validateUnknownIdentityDisplay(value, path, errors);
    if (value.objectId != null && !isNonNegativeInteger(value.objectId)) add(errors, `${path}.objectId`, 'must be a non-negative integer when present');
  }

  function validateTransferRow(row, path, errors) {
    if (!isPlainObject(row)) return add(errors, path, 'must be an object');
    validateAllowedKeys(row, path, new Set(['selector', 'key', 'text', 'displayName', 'objectId', 'quantity', 'appearanceName', 'semanticAppearance', 'semanticKnown', 'known']), errors);
    if (row.selector != null && (typeof row.selector !== 'string' || !/^[A-Za-z0-9_.:$-]+$/.test(row.selector))) add(errors, `${path}.selector`, 'must be an opaque public selector token when present');
    if (row.key != null && (typeof row.key !== 'string' || row.key.length !== 1)) add(errors, `${path}.key`, 'must be one public selector character when present');
    if (row.text != null && typeof row.text !== 'string') add(errors, `${path}.text`, 'must be a string when present');
    if (row.displayName != null && typeof row.displayName !== 'string') add(errors, `${path}.displayName`, 'must be a string when present');
    if (row.appearanceName != null && typeof row.appearanceName !== 'string') add(errors, `${path}.appearanceName`, 'must be a string when present');
    if (row.semanticAppearance != null && typeof row.semanticAppearance !== 'string') add(errors, `${path}.semanticAppearance`, 'must be a string when present');
    if (row.semanticKnown != null && typeof row.semanticKnown !== 'boolean') add(errors, `${path}.semanticKnown`, 'must be boolean when present');
    if (row.known != null) validateKnownFlags(row.known, `${path}.known`, errors);
    const rawLabel = row.displayName || row.text;
    if ((row.semanticAppearance != null || row.appearanceName != null) && rawLabel == null) add(errors, `${path}.displayName`, 'is required when public appearance text is present');
    if (rawLabel != null) validateUnknownIdentityDisplay({ ...row, displayName: PublicItemKnowledge.stripSelector(rawLabel, row) || 'item' }, path, errors);
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
    validateAllowedKeys(value, path, new Set(['action', 'selector', 'sourceSide', 'targetSide', 'itemName', 'item', 'transferId', 'requestId', 'expectedRequestId', 'reason', 'at']), errors);
    if (value.action !== 'out' && value.action !== 'in') add(errors, `${path}.action`, 'must be out or in');
    if (!isString(value.selector)) add(errors, `${path}.selector`, 'is required');
    validateTransferSide(value.sourceSide, `${path}.sourceSide`, errors);
    validateTransferSide(value.targetSide, `${path}.targetSide`, errors);
    for (const key of ['itemName', 'transferId', 'requestId', 'expectedRequestId', 'reason']) if (value[key] != null && typeof value[key] !== 'string') add(errors, `${path}.${key}`, 'must be a string when present');
    if (value.item != null) validatePublicItem(value.item, `${path}.item`, errors);
    if (isString(value.itemName)) {
      const itemLabel = value.item ? PublicItemKnowledge.publicLabel(value.item, { neutral: 'item' }) : '';
      const comparable = (label) => PublicItemKnowledge.stripSelector(label, value.item || value).toLocaleLowerCase().replace(/^\s*(?:(?:a|an|the|some)|\d+)\s+/i, '').trim();
      if (!value.item || comparable(itemLabel) !== comparable(value.itemName)) add(errors, `${path}.itemName`, 'must match an explicitly authorized public item');
    }
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
          validateAllowedKeys(entry, `${path}.updated[${index}]`, new Set(['before', 'after']), errors);
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
      if (isString(payload.itemName)) {
        const sourceRows = payload.sourceSide === 'right' ? payload.beforePanes?.right : payload.beforePanes?.left;
        const row = Array.isArray(sourceRows) ? sourceRows.find((entry) => String(entry?.selector || entry?.key || '') === String(payload.selector || '')) : null;
        const rowLabel = row ? PublicItemKnowledge.publicLabel({ ...row, displayName: row.displayName || row.text }, { neutral: 'item' }) : '';
        const comparable = (label) => PublicItemKnowledge.stripSelector(label, row || {}).toLocaleLowerCase().replace(/^\s*(?:(?:a|an|the|some)|\d+)\s+/i, '').trim();
        if (!row || comparable(rowLabel) !== comparable(payload.itemName)) add(errors, `${path}.itemName`, 'must match an explicitly authorized source row');
      }
      if (payload.groundCoord != null) validateCoord(payload.groundCoord, `${path}.groundCoord`, errors);
      if (payload.coord != null) validateCoord(payload.coord, `${path}.coord`, errors);
      if (payload.container != null) validatePublicContainerIdentity(payload.container, `${path}.container`, errors);
      return;
    }
    if (eventType === 'transfer.confirmed') {
      validateAllowedKeys(payload, path, new Set(['transferId', 'kind', 'name', 'requestId', 'menuRequestId', 'accepted']), errors);
      if (!isString(payload.transferId)) add(errors, `${path}.transferId`, 'is required');
      if (payload.name != null && (typeof payload.name !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(payload.name))) add(errors, `${path}.name`, 'must be an opaque public event token');
      if (payload.kind != null && (typeof payload.kind !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(payload.kind))) add(errors, `${path}.kind`, 'must be an opaque public event token');
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
    validateAllowedKeys(value, path, new Set(['status', 'kind', 'reason', 'action', 'actionId', 'actionLabel', 'itemId', 'target', 'inventoryRevision', 'equipmentRevision']), errors);
    if (value.status != null && typeof value.status !== 'string') add(errors, `${path}.status`, 'must be a string when present');
    if (value.kind != null && typeof value.kind !== 'string') add(errors, `${path}.kind`, 'must be a string when present');
    if (value.reason != null && typeof value.reason !== 'string') add(errors, `${path}.reason`, 'must be a string when present');
    if (value.action != null && typeof value.action !== 'string') add(errors, `${path}.action`, 'must be a string when present');
    if (value.actionId != null && typeof value.actionId !== 'string') add(errors, `${path}.actionId`, 'must be a string when present');
    if (value.itemId != null && !isNonNegativeInteger(value.itemId)) add(errors, `${path}.itemId`, 'must be a non-negative public id when present');
    if (value.actionLabel != null && typeof value.actionLabel !== 'string') add(errors, `${path}.actionLabel`, 'must be a string when present');
    if (value.target != null) validateActionExecuteTarget(value.target, `${path}.target`, errors);
    if (value.inventoryRevision != null && !isNonNegativeInteger(value.inventoryRevision)) add(errors, `${path}.inventoryRevision`, 'must be a non-negative integer when present');
    if (value.equipmentRevision != null && !isNonNegativeInteger(value.equipmentRevision)) add(errors, `${path}.equipmentRevision`, 'must be a non-negative integer when present');
    validateNoForbiddenEvidenceFields(value, path, errors);
  }

  function validateEventPayload(eventType, payload, errors) {
    const path = 'payload';
    if (!isPlainObject(payload)) return add(errors, path, 'must be an object');
    switch (eventType) {
      case 'diagnostic.v1Compatibility':
        validateAllowedKeys(payload, path, new Set(['reason', 'legacyEventName', 'legacyPath', 'fallback']), errors);
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
        validateAllowedKeys(payload, path, new Set(['promptId', 'answer', 'reason', 'requestId', 'transactionId']), errors);
        if (!isString(payload.promptId)) add(errors, `${path}.promptId`, 'is required');
        for (const key of ['answer', 'reason', 'requestId', 'transactionId']) if (payload[key] != null && typeof payload[key] !== 'string') add(errors, `${path}.${key}`, 'must be a string when present');
        break;
      case 'inventory.snapshot':
        validateAllowedKeys(payload, path, new Set(['revision', 'items']), errors);
        if (!isNonNegativeInteger(payload.revision)) add(errors, `${path}.revision`, 'is required and must be a non-negative integer');
        if (!Array.isArray(payload.items)) add(errors, `${path}.items`, 'is required');
        else { payload.items.forEach((item, index) => validatePublicItem(item, `${path}.items[${index}]`, errors)); validateUniquePublicItems(payload.items, `${path}.items`, errors); }
        break;
      case 'container.contents.snapshot':
      case 'container.candidates.snapshot':
        validateAllowedKeys(payload, path, new Set(['revision', 'items', 'sessionId', 'container']), errors);
        if (payload.revision != null && !isNonNegativeInteger(payload.revision)) add(errors, `${path}.revision`, 'must be a non-negative integer when present');
        if (!Array.isArray(payload.items)) add(errors, `${path}.items`, 'is required');
        else { payload.items.forEach((item, index) => validatePublicItem(item, `${path}.items[${index}]`, errors)); validateUniquePublicItems(payload.items, `${path}.items`, errors); }
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
      case 'spell.rows':
      case 'skill.rows':
        validateSpellOrSkillRows(eventType, payload, path, errors);
        break;
      case 'equipment.snapshot':
      case 'equipment.delta':
        validateAllowedKeys(payload, path, new Set(['revision', 'inventoryRevision', 'slots', 'items', 'added', 'updated', 'removed']), errors);
        if (!isNonNegativeInteger(payload.revision)) add(errors, `${path}.revision`, 'is required and must be a non-negative integer');
        if (payload.inventoryRevision != null && !isNonNegativeInteger(payload.inventoryRevision)) add(errors, `${path}.inventoryRevision`, 'must be a non-negative integer when present');
        if (eventType === 'equipment.snapshot' && !Array.isArray(payload.slots)) add(errors, `${path}.slots`, 'is required');
        if (payload.slots != null) {
          if (!Array.isArray(payload.slots)) add(errors, `${path}.slots`, 'must be an array');
          else {
            const slotIds = new Set();
            payload.slots.forEach((slot, index) => {
              validateEquipmentSlot(slot, `${path}.slots[${index}]`, errors);
              if (slot?.slotId && slotIds.has(slot.slotId)) add(errors, `${path}.slots[${index}].slotId`, 'must be unique in an authoritative equipment collection');
              if (slot?.slotId) slotIds.add(slot.slotId);
            });
          }
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
        validateAllowedKeys(payload, path, new Set(['actions']), errors);
        if (!Array.isArray(payload.actions)) add(errors, `${path}.actions`, 'is required');
        else payload.actions.forEach((action, index) => validateAction(action, `${path}.actions[${index}]`, errors));
        break;
      case 'command.accepted':
      case 'command.rejected':
      case 'command.completed':
        validateAllowedKeys(payload, path, new Set(['commandId', 'transactionId', 'transferId', 'sessionId', 'commandType', 'actionId', 'status', 'reason', 'blockerToken', 'supported', 'executionSource', 'replayBehavior', 'result']), errors);
        if (!isString(payload.commandId)) add(errors, `${path}.commandId`, 'is required');
        if (payload.transactionId != null && !isString(payload.transactionId)) add(errors, `${path}.transactionId`, 'must be a non-empty string when present');
        if (payload.transferId != null && !isString(payload.transferId)) add(errors, `${path}.transferId`, 'must be a non-empty string when present');
        if (payload.sessionId != null && !isString(payload.sessionId)) add(errors, `${path}.sessionId`, 'must be a non-empty string when present');
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
        validateAllowedKeys(payload, path, new Set(['transactionId', 'reason', 'status']), errors);
        if (!isString(payload.transactionId)) add(errors, `${path}.transactionId`, 'is required');
        if (eventType === 'transaction.interrupted' && !isString(payload.reason)) add(errors, `${path}.reason`, 'is required');
        break;
      case 'ground.pile.snapshot':
        validateAllowedKeys(payload, path, new Set(['revision', 'coord', 'items']), errors);
        validateCoord(payload.coord, `${path}.coord`, errors);
        if (payload.revision != null && !isNonNegativeInteger(payload.revision)) add(errors, `${path}.revision`, 'must be a non-negative integer when present');
        if (!Array.isArray(payload.items)) add(errors, `${path}.items`, 'is required');
        else { payload.items.forEach((item, index) => validatePublicItem(item, `${path}.items[${index}]`, errors)); validateUniquePublicItems(payload.items, `${path}.items`, errors); }
        break;
      case 'ground.transfer.confirmed':
      case 'ground.transfer.rejected':
      case 'container.transfer.confirmed':
      case 'container.transfer.rejected':
        validateAllowedKeys(payload, path, new Set(['commandId', 'transactionId', 'transferId', 'sessionId', 'direction', 'itemId', 'containerId', 'coord', 'status', 'reason', 'blockerToken', 'activeInputOwner']), errors);
        if (!isString(payload.commandId)) add(errors, `${path}.commandId`, 'is required');
        if (payload.direction != null && !transferDirections.has(payload.direction)) add(errors, `${path}.direction`, `must be one of ${Array.from(transferDirections).join(', ')}`);
        if (/rejected$/.test(eventType) && !isString(payload.reason)) add(errors, `${path}.reason`, 'is required');
        if (payload.activeInputOwner != null) validateActiveInputOwner(payload.activeInputOwner, `${path}.activeInputOwner`, errors);
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
      case 'map.cell.updated': {
        validateAllowedKeys(payload, path, new Set(['coord', 'ch', 'assetId', 'glyph', 'ttychar', 'color', 'tileidx', 'glyphFlags', 'backgroundGlyph', 'semanticKind', 'semanticName', 'semanticAppearance', 'semanticKnown', 'backgroundSemanticKind', 'backgroundSemanticName', 'backgroundSemanticKnown', 'objectLayerGlyph', 'objectLayerChar', 'objectLayerSemanticKind', 'objectLayerSemanticName', 'objectLayerSemanticAppearance', 'objectLayerSemanticKnown', 'cmapIndex', 'actionAffordances', 'backgroundActionAffordances', 'objectLayerActionAffordances']), errors);
        validateCoord(payload.coord, `${path}.coord`, errors);
        for (const key of ['ch', 'assetId', 'semanticKind', 'semanticName', 'semanticAppearance', 'backgroundSemanticKind', 'backgroundSemanticName', 'objectLayerSemanticKind', 'objectLayerSemanticName', 'objectLayerSemanticAppearance']) if (payload[key] != null && typeof payload[key] !== 'string') add(errors, `${path}.${key}`, 'must be a string when present');
        if (payload.ch != null && String(payload.ch).length !== 1) add(errors, `${path}.ch`, 'must be one public character');
        if (payload.objectLayerChar != null && !((typeof payload.objectLayerChar === 'string' && payload.objectLayerChar.length === 1) || (isNonNegativeInteger(payload.objectLayerChar) && payload.objectLayerChar < 128))) add(errors, `${path}.objectLayerChar`, 'must be one public character or character code');
        for (const key of ['assetId', 'semanticKind', 'backgroundSemanticKind', 'objectLayerSemanticKind']) if (payload[key] != null && !/^[A-Za-z0-9_.:-]+$/.test(payload[key])) add(errors, `${path}.${key}`, 'must be an opaque public token');
        for (const key of ['semanticKnown', 'backgroundSemanticKnown', 'objectLayerSemanticKnown']) if (payload[key] != null && typeof payload[key] !== 'boolean') add(errors, `${path}.${key}`, 'must be boolean when present');
        for (const key of ['glyph', 'ttychar', 'color', 'tileidx', 'glyphFlags', 'backgroundGlyph', 'objectLayerGlyph', 'cmapIndex']) if (payload[key] != null && !isNonNegativeInteger(payload[key])) add(errors, `${path}.${key}`, 'must be a non-negative integer when present');
        if (payload.semanticName != null && payload.semanticKnown !== true) add(errors, `${path}.semanticName`, 'requires explicit semanticKnown true');
        if (payload.backgroundSemanticName != null && payload.backgroundSemanticKnown !== true) add(errors, `${path}.backgroundSemanticName`, 'requires explicit backgroundSemanticKnown true');
        if (payload.objectLayerSemanticName != null && payload.objectLayerSemanticKnown !== true) add(errors, `${path}.objectLayerSemanticName`, 'requires explicit objectLayerSemanticKnown true');
        if (payload.objectLayerSemanticKnown === false && payload.objectLayerSemanticAppearance == null && payload.objectLayerSemanticName != null) add(errors, `${path}.objectLayerSemanticName`, 'must be redacted when object identity is unknown');
        for (const key of ['actionAffordances', 'backgroundActionAffordances', 'objectLayerActionAffordances']) if (payload[key] != null) {
          validatePublicStringArray(payload[key], `${path}.${key}`, errors);
          if (Array.isArray(payload[key])) payload[key].forEach((token, index) => { if (!/^[A-Za-z0-9_.:-]+$/.test(token)) add(errors, `${path}.${key}[${index}]`, 'must be an opaque public action token'); });
        }
        break;
      }
      case 'replay.marker':
        validateAllowedKeys(payload, path, new Set(['name']), errors);
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
    validateAllowedKeys(value, path, new Set(['selector', 'inventoryLetter', 'objectId', 'slotId', 'displayName', 'appearanceName', 'semanticAppearance', 'semanticKnown', 'known', 'location']), errors);
    if (value.selector != null && (typeof value.selector !== 'string' || value.selector.length !== 1)) add(errors, `${path}.selector`, 'must be a single public selector when present');
    if (value.inventoryLetter != null && (typeof value.inventoryLetter !== 'string' || value.inventoryLetter.length !== 1)) add(errors, `${path}.inventoryLetter`, 'must be a single inventory letter when present');
    if (value.objectId != null && !isNonNegativeInteger(value.objectId)) add(errors, `${path}.objectId`, 'must be a non-negative integer when present');
    if (value.slotId != null && typeof value.slotId !== 'string') add(errors, `${path}.slotId`, 'must be a string when present');
    if (value.displayName != null && typeof value.displayName !== 'string') add(errors, `${path}.displayName`, 'must be a string when present');
    if (value.appearanceName != null && typeof value.appearanceName !== 'string') add(errors, `${path}.appearanceName`, 'must be a string when present');
    if (value.semanticAppearance != null && typeof value.semanticAppearance !== 'string') add(errors, `${path}.semanticAppearance`, 'must be a string when present');
    if (value.semanticKnown != null && typeof value.semanticKnown !== 'boolean') add(errors, `${path}.semanticKnown`, 'must be boolean when present');
    if (value.known != null) validateKnownFlags(value.known, `${path}.known`, errors);
    if (value.semanticKnown === false && value.known?.identity === true) add(errors, `${path}.known.identity`, 'must not contradict semanticKnown false');
    if (value.semanticKnown === true && value.known?.identity === false) add(errors, `${path}.known.identity`, 'must not contradict semanticKnown true');
    if ((value.semanticAppearance != null || value.appearanceName != null) && value.displayName == null) add(errors, `${path}.displayName`, 'is required when public appearance text is present');
    if (value.displayName != null) validateUnknownIdentityDisplay(value, path, errors);
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
    'container.transfer': Object.freeze({ allowed: Object.freeze(['direction', 'transferId', 'sessionId', 'containerId', 'itemId', 'item']) }),
    'container.snapshot': Object.freeze({ allowed: Object.freeze(['sessionId', 'containerId']) }),
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
    if (!schema) return add(errors, path, `has no closed public schema for ${commandType}`);
    if (payload == null) return;
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
    if (payload.item != null) validatePublicItem(payload.item, `${path}.item`, errors);
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
    if (eventType === 'spell.rows' && revision?.spell != null && payload?.revision != null && revision.spell !== payload.revision) add(errors, 'revision.spell', 'must match payload.revision for spell rows');
    if (eventType === 'skill.rows' && revision?.skill != null && payload?.revision != null && revision.skill !== payload.revision) add(errors, 'revision.skill', 'must match payload.revision for skill rows');
  }

  function validateEventEnvelope(envelope) {
    const errors = [];
    if (!isPlainObject(envelope)) return { ok: false, errors: ['event: must be an object'] };
    validateAllowedKeys(envelope, 'event', new Set(['protocol', 'sequence', 'eventId', 'eventType', 'turn', 'requestId', 'transactionId', 'source', 'revision', 'payload']), errors);
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
      if (envelope.eventType === 'spell.rows' || envelope.eventType === 'skill.rows') {
        if (!isString(envelope.requestId)) add(errors, 'requestId', 'is required for authoritative menu row ownership');
        else if (isString(envelope.payload?.menuId) && envelope.requestId !== envelope.payload.menuId) add(errors, 'requestId', 'must match payload.menuId');
        if (envelope.payload?.classificationConfidence === 'typed') {
          if (!['core', 'shim-bridge'].includes(envelope.source?.layer) || envelope.source?.authoritative !== true) add(errors, 'source', 'typed rows require an authoritative core or shim-bridge source');
        } else if (envelope.payload?.classificationConfidence === 'fallback' && envelope.source?.authoritative === true) add(errors, 'source.authoritative', 'fallback rows cannot be authoritative');
      }
    }
    return { ok: errors.length === 0, errors, event: errors.length ? undefined : Object.freeze({ ...envelope, payload: Object.freeze({ ...envelope.payload }) }) };
  }

  function validateNonDirectCommandPayload(commandType, value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be a closed public payload object');
    const schemas = {
      'prompt.answer': new Set(['promptId', 'answer']),
      'menu.select': new Set(['menuId', 'selectors']),
      'command.cancel': new Set(['commandId', 'transactionId', 'reason']),
      'replay.control': new Set(['mode']),
    };
    const allowed = schemas[commandType];
    if (!allowed) return add(errors, path, `has no closed public schema for ${commandType}`);
    validateAllowedKeys(value, path, allowed, errors);
    if (value.selectors != null) validatePublicStringArray(value.selectors, `${path}.selectors`, errors);
    for (const [key, entry] of Object.entries(value)) if (key !== 'selectors' && typeof entry !== 'string') add(errors, `${path}.${key}`, 'must be a string');
  }

  function validateNonDirectCommandTargets(commandType, value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be a closed public target object');
    const allowed = commandType === 'menu.select' ? new Set(['menuId', 'selectors'])
      : new Set(['commandId', 'transactionId', 'promptId']);
    validateAllowedKeys(value, path, allowed, errors);
    if (value.menuId != null && !isString(value.menuId)) add(errors, `${path}.menuId`, 'must be a string');
    if (value.selectors != null) validatePublicStringArray(value.selectors, `${path}.selectors`, errors);
    for (const key of ['commandId', 'transactionId', 'promptId']) if (value[key] != null && !isString(value[key])) add(errors, `${path}.${key}`, 'must be a string');
  }

  function validateDirectCommandTargets(value, path, errors) {
    if (value == null) return;
    if (!isPlainObject(value)) return add(errors, path, 'must be a closed public target object');
    validateAllowedKeys(value, path, new Set(['selector', 'inventoryLetter', 'objectId', 'itemId', 'containerId', 'slotId', 'displayName', 'appearanceName', 'semanticAppearance', 'semanticKnown', 'known', 'location', 'coord']), errors);
    for (const key of ['selector', 'inventoryLetter']) if (value[key] != null && (typeof value[key] !== 'string' || value[key].length !== 1)) add(errors, `${path}.${key}`, 'must be one public selector character');
    for (const key of ['objectId', 'itemId', 'containerId']) if (value[key] != null && !isNonNegativeInteger(value[key])) add(errors, `${path}.${key}`, 'must be a non-negative public id');
    if (value.slotId != null && typeof value.slotId !== 'string') add(errors, `${path}.slotId`, 'must be a string when present');
    if (value.semanticKnown != null && typeof value.semanticKnown !== 'boolean') add(errors, `${path}.semanticKnown`, 'must be boolean when present');
    if (value.known != null) validateKnownFlags(value.known, `${path}.known`, errors);
    if (value.appearanceName != null && typeof value.appearanceName !== 'string') add(errors, `${path}.appearanceName`, 'must be a string when present');
    if (value.semanticAppearance != null && typeof value.semanticAppearance !== 'string') add(errors, `${path}.semanticAppearance`, 'must be a string when present');
    if (value.location != null) validatePublicLocation(value.location, `${path}.location`, errors);
    if (value.coord != null) validateCoord(value.coord, `${path}.coord`, errors);
    if ((value.semanticAppearance != null || value.appearanceName != null) && value.displayName == null) add(errors, `${path}.displayName`, 'is required when public appearance text is present');
    if (value.displayName != null) validateUnknownIdentityDisplay(value, path, errors);
  }

  function validateCommandEnvelope(command) {
    const errors = [];
    if (!isPlainObject(command)) return { ok: false, errors: ['command: must be an object'] };
    validateAllowedKeys(command, 'command', new Set(['protocol', 'commandId', 'commandType', 'transactionId', 'expectedRevision', 'targets', 'payload', 'actionId', 'promptId', 'menuId']), errors);
    if (command.protocol !== protocol) add(errors, 'protocol', `must be ${protocol}`);
    if (!isString(command.commandId)) add(errors, 'commandId', 'is required');
    if (!isString(command.commandType)) add(errors, 'commandType', 'is required');
    else if (!commandTypes.has(command.commandType)) add(errors, 'commandType', `unknown command type ${command.commandType}`);
    if (command.transactionId != null && !isString(command.transactionId)) add(errors, 'transactionId', 'must be a non-empty string when present');
    validateRevision(command.expectedRevision, 'expectedRevision', errors);
    if (command.commandType === 'action.execute') validateActionExecuteTarget(command.targets, 'targets', errors);
    else {
      if (directCommandTypes.has(command.commandType)) validateDirectCommandTargets(command.targets, 'targets', errors);
      else validateNonDirectCommandTargets(command.commandType, command.targets, 'targets', errors);
      validateNestedPublicItemLabels(command.payload, 'payload', errors);
    }
    if (command.payload != null && !isPlainObject(command.payload)) add(errors, 'payload', 'must be an object when present');
    if (command.commandType === 'action.execute') {
      if (!isString(command.actionId) && !isString(command.payload?.actionId)) add(errors, 'actionId', 'action.execute requires actionId on the command or payload');
      if (command.payload != null) validateActionExecuteCommandPayload(command.payload, 'payload', errors);
    } else if (isString(command.commandType) && directCommandTypes.has(command.commandType)) {
      validateDirectCommandPayload(command.commandType, command.payload, 'payload', errors);
    } else if (isString(command.commandType)) validateNonDirectCommandPayload(command.commandType, command.payload, 'payload', errors);
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
      raw: checked.event,
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
      raw: checked.command,
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

  function createCommandAckEvent({ sequence, eventId, eventType = 'command.accepted', turn = 0, source, command, commandId, transactionId, transferId, sessionId, actionId, commandType, status, reason, blockerToken, supported, executionSource, replayBehavior, result } = {}) {
    const payload = {
      commandId: String(commandId || command?.commandId || '').trim(),
      transactionId: String(transactionId || command?.transactionId || '').trim() || undefined,
      transferId,
      sessionId,
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
    publicItemSchema: Object.freeze({
      allowedFields: Object.freeze(Array.from(allowedPublicItemFields).sort()),
      forbiddenFields: Object.freeze(Array.from(forbiddenPublicItemFields).sort()),
      allowedKnownFlags: Object.freeze(Array.from(allowedKnownFlagKeys).sort()),
      publicClasses: Object.freeze(Array.from(publicItemClasses).sort()),
      filterGroups: Object.freeze(Array.from(publicItemFilterGroups).sort()),
      knownFields: Object.freeze(Array.from(publicKnownFieldKeys).sort()),
      ownershipStates: Object.freeze(Array.from(publicItemOwnershipStates).sort()),
    }),
    equipmentSchema: Object.freeze({ slotIds: Object.freeze(Array.from(equipmentSlotIds).sort()), publicStatuses: Object.freeze(Array.from(publicEquipmentStatuses).sort()) }),
  });
}));
