(function initShimProtocol(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./public-item-knowledge'), require('./ui-protocol-v2'));
  else root.NetHackShimProtocol = factory(root.NetHackPublicItemKnowledge, root.NetHackUiProtocolV2);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(PublicItemKnowledge = {}, UiProtocolV2 = {}) {
  const protocolVersion = 'nethack-electron-shim-events/v1';
  const knownNames = new Set([
    'shim_create_nhwindow', 'shim_clear_nhwindow', 'shim_print_glyph', 'shim_curs', 'shim_putstr', 'shim_raw_print', 'shim_raw_print_bold',
    'shim_start_menu', 'shim_add_menu', 'shim_end_menu', 'shim_select_menu', 'shim_display_nhwindow', 'shim_message_menu',
    'bridge_menu_answer', 'shim_yn_function', 'shim_getlin', 'bridge_command_prompt', 'bridge_direction_prompt', 'bridge_extcmd_catalog', 'shim_get_ext_cmd',
    'bridge_prompt_answer', 'bridge_line_answer', 'bridge_extcmd_answer', 'bridge_direction_answer', 'shim_status_enablefield', 'shim_status_update',
    'shim_update_inventory', 'shim_ground_pile_snapshot', 'shim_ground_transfer_accepted', 'shim_ground_transfer_queued', 'shim_ground_transfer_confirmed', 'shim_ground_transfer_rejected', 'shim_terrain_action_accepted', 'shim_terrain_action_queued', 'shim_terrain_action_confirmed', 'shim_terrain_action_rejected', 'shim_container_contents_snapshot', 'shim_container_transfer_accepted', 'shim_container_transfer_queued', 'shim_container_transfer_confirmed', 'shim_container_transfer_rejected', 'shim_container_snapshot_accepted', 'shim_container_snapshot_queued', 'shim_container_snapshot_confirmed', 'shim_container_snapshot_rejected', 'shim_equipment_change_accepted', 'shim_equipment_change_queued', 'shim_equipment_change_confirmed', 'shim_equipment_change_rejected', 'bridge_command', 'bridge_input_queue_full', 'bridge_unsupported_command', 'bridge_semantic_followup_rejected',
    'bridge_ui_command_accepted', 'bridge_ui_command_rejected',
    'bridge_seed', 'bridge_seed_invalid', 'bridge_seed_ignored', 'bridge_start', 'bridge_exit', 'bridge_stdin_closed',
    'shim_native_end_diagnostic', 'shim_native_menu_context', 'shim_native_command_diagnostic',
    'bridge_test_scenario_loaded', 'bridge_test_scenario_failed', 'shim-stderr', 'shim-raw',
  ]);
  function asInt(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
  function asOptInt(value) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : undefined; }
  function asText(value) { return value == null ? '' : String(value); }
  function opaqueToken(value) { const text = asText(value); return /^[A-Za-z0-9_.:-]+$/.test(text) ? text : undefined; }
  function publicActionTokens(value) { return Array.isArray(value) ? value.map(opaqueToken).filter(Boolean) : []; }
  function publicChar(value) { if (Number.isInteger(value) && value >= 0 && value < 128) return value; const text = asText(value); return text.length === 1 ? text : undefined; }
  function withField(target, name, value) { if (value !== undefined) target[name] = value; return target; }
  const publicKnownFieldKeys = Object.freeze(['beatitude', 'charges', 'enchantment', 'weight', 'erosion', 'corrosion', 'poisoned']);
  const publicClasses = new Set(['weapon', 'armor', 'food', 'potion', 'scroll', 'spellbook', 'wand', 'ring', 'amulet', 'tool', 'gem', 'coin', 'other']);
  const publicFilterGroups = new Set(['equipped', 'weapons', 'armor', 'consumables', 'magic']);
  const publicEquipmentSlots = new Set(['mainHand', 'offHand', 'quiver', 'armor.body', 'armor.cloak', 'armor.shirt', 'armor.helm', 'armor.gloves', 'armor.boots', 'armor.shield', 'amulet', 'ring.left', 'ring.right', 'eyes']);
  const knownFieldClasses = Object.freeze({ charges: new Set(['wand', 'tool']), enchantment: new Set(['weapon', 'armor', 'ring', 'tool']), erosion: new Set(['weapon', 'armor']), corrosion: new Set(['weapon', 'armor']), poisoned: new Set(['weapon']) });
  const classFilterGroups = Object.freeze({ weapon: new Set(['weapons']), armor: new Set(['armor']), food: new Set(['consumables']), potion: new Set(['consumables', 'magic']), scroll: new Set(['consumables', 'magic']), spellbook: new Set(['magic']), wand: new Set(['magic']), ring: new Set(['magic']), amulet: new Set(['magic']) });
  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function cleanItemText(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }
  function selectorLetter(selector) { const code = asOptInt(selector); return code > 0 && code < 128 ? String.fromCharCode(code) : ''; }
  function stripItemSelector(value) { return cleanItemText(value).replace(/^\s*[A-Za-z$]\s*[-+]\s*/, '').trim(); }
  function publicMenuSelector(value) {
    const numeric = asOptInt(value);
    if (numeric != null && numeric >= 32 && numeric <= 126) return String.fromCharCode(numeric);
    const text = typeof value === 'string' ? value : '';
    return text.length === 1 && text.charCodeAt(0) >= 32 && text.charCodeAt(0) <= 126 ? text : undefined;
  }
  function compatibilitySpellRowsFromMenu(menu = {}) {
    const rows = [];
    for (const item of Array.isArray(menu.items) ? menu.items : []) {
      const selector = publicMenuSelector(item?.selector);
      if (!selector) continue;
      const rawText = String(item?.text == null ? '' : item.text).trim();
      const text = cleanItemText(rawText);
      if (!text || /^\[sort spells\]$/i.test(text)) continue;
      const tabFields = rawText.includes('\t') ? rawText.split('\t').map(cleanItemText) : [];
      const tabExact = tabFields.length >= 5 && /^\d{1,2}$/.test(tabFields[1]) && /^\d{1,3}%$/.test(tabFields[3]);
      const exact = tabExact ? null : rawText.match(/^(.+?)\s{2,}(\d{1,2})\s+[A-Za-z]+\s+(\d{1,3})%\s+(.+)$/);
      const name = cleanItemText(tabExact ? tabFields[0] : (exact ? exact[1] : rawText.split(/\s{2,}/, 1)[0]));
      if (!name) continue;
      const row = { name, selector };
      if (tabExact || exact) {
        row.level = Number(tabExact ? tabFields[1] : exact[2]);
        row.failure = Number(String(tabExact ? tabFields[3] : exact[3]).replace('%', ''));
        const status = cleanItemText(tabExact ? tabFields[4] : exact[4]);
        if (status) row.status = status;
      }
      rows.push(Object.freeze(row));
    }
    return Object.freeze(rows);
  }
  function compatibilitySkillRowsFromMenu(menu = {}) {
    const rows = [];
    const rankPattern = '(Unskilled|Basic|Skilled|Expert|Master|Grand Master)';
    for (const item of Array.isArray(menu.items) ? menu.items : []) {
      const text = cleanItemText(item?.text);
      const match = text.match(new RegExp(`^\\s*(?:[*#]\\s*)?(.+?)\\s+\\[${rankPattern}\\]\\s*$`, 'i'));
      if (!match) continue;
      const name = cleanItemText(match[1]);
      const rank = match[2].replace(/\b\w/g, (letter) => letter.toUpperCase());
      if (!name || !rank) continue;
      const row = { name, currentRank: rank, canAdvance: Boolean(publicMenuSelector(item?.selector)) };
      const selector = publicMenuSelector(item?.selector);
      if (selector) row.selector = selector;
      rows.push(Object.freeze(row));
    }
    return Object.freeze(rows);
  }
  function itemIsExplicitlyUnknown(item) { return !PublicItemKnowledge.identityIsPublic(item); }
  function publicAppearance(item) { return PublicItemKnowledge.explicitAppearance(item); }
  function isItemLike(item) {
    return isPlainObject(item) && ['objectId', 'selector', 'inventoryLetter', 'displayName', 'text', 'name', 'appearanceName', 'semanticAppearance', 'semanticName', 'semanticKnown', 'known', 'glyph', 'glyphChar', 'publicClass'].some((key) => item[key] != null);
  }
  function isStructurallyValidItem(item) {
    if (!isItemLike(item)) return false;
    for (const key of ['displayName', 'text', 'name', 'appearanceName', 'semanticAppearance', 'semanticName', 'semanticKind', 'objectClass', 'publicClass', 'calledName', 'individualName']) if (item[key] != null && typeof item[key] !== 'string') return false;
    if (item.semanticKnown != null && typeof item.semanticKnown !== 'boolean') return false;
    if (item.known != null) {
      if (!isPlainObject(item.known)) return false;
      for (const key of ['identity', 'appearance', 'quantity', 'naming']) if (item.known[key] != null && typeof item.known[key] !== 'boolean') return false;
    }
    for (const key of ['actionAffordances', 'filterGroups', 'equipmentSlots']) if (item[key] != null && (!Array.isArray(item[key]) || item[key].some((entry) => typeof entry !== 'string'))) return false;
    if (item.knownFields != null && !isPlainObject(item.knownFields)) return false;
    if (item.ownership != null && !isPlainObject(item.ownership)) return false;
    return true;
  }
  function assertUniqueAuthoritativeItemKeys(items, label) {
    const objectIds = new Set();
    const selectors = new Set();
    items.forEach((item, index) => {
      const objectId = asOptInt(item?.objectId);
      if (objectId != null) {
        if (objectIds.has(objectId)) throw new TypeError(`${label} item ${index} repeats objectId`);
        objectIds.add(objectId);
      }
      const selector = item?.inventoryLetter ?? item?.selector;
      if (selector != null && selector !== '') {
        const key = String(selector);
        if (selectors.has(key)) throw new TypeError(`${label} item ${index} repeats selector`);
        selectors.add(key);
      }
    });
  }
  function publicItemDisplayName(item) {
    if (!isItemLike(item)) return '';
    return PublicItemKnowledge.publicDisplayLabel(item, { neutral: 'item' });
  }
  function publicLegacyItemText(item) {
    const displayName = publicItemDisplayName(item);
    const letter = selectorLetter(item?.selector);
    return displayName ? `${letter ? `${letter} - ` : ''}${displayName}` : '';
  }
  function copyItemPresentationFields(target, item = {}) {
    const publicClass = typeof item.publicClass === 'string' && publicClasses.has(item.publicClass) ? item.publicClass : '';
    if (publicClass) target.publicClass = publicClass;
    for (const key of ['calledName', 'individualName']) {
      const value = PublicItemKnowledge.publicNamingValue(item, key);
      if (value) target[key] = value;
    }
    target.known = { ...PublicItemKnowledge.publicKnownFlags(item) };
    if (Array.isArray(item.filterGroups)) target.filterGroups = Array.from(new Set(item.filterGroups.filter((entry) => typeof entry === 'string' && publicFilterGroups.has(entry) && (entry === 'equipped' ? Number(item.wornMask) > 0 : classFilterGroups[publicClass]?.has(entry)))));
    if (Array.isArray(item.equipmentSlots)) {
      const classSlots = publicClass === 'weapon' ? new Set(['mainHand', 'offHand', 'quiver'])
        : publicClass === 'armor' ? new Set(Array.from(publicEquipmentSlots).filter((slot) => slot.startsWith('armor.')))
          : publicClass === 'ring' ? new Set(['ring.left', 'ring.right'])
            : publicClass === 'amulet' ? new Set(['amulet'])
              : publicClass === 'tool' ? new Set(['mainHand', 'offHand', 'eyes']) : new Set();
      target.equipmentSlots = Array.from(new Set(item.equipmentSlots.filter((entry) => typeof entry === 'string' && publicEquipmentSlots.has(entry) && (!publicClass || classSlots.has(entry)))));
    }
    if (item.knownFields && typeof item.knownFields === 'object' && !Array.isArray(item.knownFields)) {
      const knownFields = {};
      for (const key of publicKnownFieldKeys) {
        if (item.knownFields[key] == null || !['string', 'number', 'boolean'].includes(typeof item.knownFields[key])) continue;
        if (knownFieldClasses[key] && !knownFieldClasses[key].has(publicClass)) continue;
        knownFields[key] = item.knownFields[key];
      }
      if (Object.keys(knownFields).length) target.knownFields = knownFields;
    }
    if (item.ownership && typeof item.ownership === 'object' && !Array.isArray(item.ownership) && ['owned', 'unpaid', 'for-sale'].includes(item.ownership.state)) {
      target.ownership = { state: item.ownership.state };
      const price = asOptInt(item.ownership.price);
      if (price != null && price >= 0) target.ownership.price = price;
      if (typeof item.ownership.currency === 'string' && item.ownership.currency.trim()) target.ownership.currency = item.ownership.currency.trim();
    }
    return target;
  }
  function copyPublicMetadata(target, event, keys = ['menuPurpose', 'menuRequestId', 'menuId', 'requestId', 'transactionId', 'requestSource', 'owner', 'selectionMode', 'lifecycle', 'lifecycleRevision', 'promptPurpose', 'promptType', 'promptId', 'autoAnswered', 'autoAnswerReason', 'guiAction', 'actionId', 'actionLabel', 'targetSelector', 'targetText', 'followupPlan', 'expectedRequestId', 'commandPosition', 'commandLength', 'activeRequestId', 'activeMenuRequestId', 'activePromptRequestId', 'activeRequestKind', 'activeMenuTransactionId', 'activeRequestTransactionId', 'activeTransactionId', 'queuedBeforePop', 'queuedAfterPop', 'activeRequestMatch', 'inputMatchesMenuTransaction', 'inputTransactionId', 'nativeMenuCallsite', 'nativeEndReason', 'nativeEndHow', 'finalFlow', 'disclosureFlow']) {
    for (const key of keys) {
      const value = event[key];
      if (value === undefined) continue;
      if (key === 'targetText') target[key] = PublicItemKnowledge.publicLabel({ ...event, displayName: value }, { neutral: 'item' });
      else if (value && typeof value === 'object') target[key] = Array.isArray(value) ? value.slice() : { ...value };
      else target[key] = value;
    }
    return target;
  }
  function assertExactIntegerField(value, path) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0)) throw new TypeError(`${path} must be an exact non-negative-zero safe integer`);
  }
  function assertStringField(value, path) {
    if (typeof value !== 'string') throw new TypeError(`${path} must be a string`);
  }
  function assertConsistentPresentAliases(event, keys, label) {
    const present = keys.filter((key) => Object.prototype.hasOwnProperty.call(event, key));
    for (const key of present) assertStringField(event[key], `bridge answer ${key}`);
    if (present.length > 1 && present.some((key) => event[key] !== event[present[0]])) throw new TypeError(`bridge answer has contradictory ${label} aliases`);
  }
  function validateAnswerIngress(event, family, integerFields = []) {
    for (const key of integerFields) if (Object.prototype.hasOwnProperty.call(event, key)) assertExactIntegerField(event[key], `${family}.${key}`);
    assertConsistentPresentAliases(event, ['requestId', 'menuRequestId', 'promptId', 'activeRequestId', 'activeMenuRequestId', 'activePromptRequestId', 'expectedRequestId'], 'request ownership');
    assertConsistentPresentAliases(event, ['transactionId', 'activeMenuTransactionId', 'activeRequestTransactionId', 'activeTransactionId'], 'transaction ownership');
    if (Object.prototype.hasOwnProperty.call(event, 'inputTransactionId')) assertStringField(event.inputTransactionId, `${family}.inputTransactionId`);
    if (event.inputMatchesMenuTransaction === true
      && Object.prototype.hasOwnProperty.call(event, 'transactionId')
      && Object.prototype.hasOwnProperty.call(event, 'inputTransactionId')
      && event.transactionId !== event.inputTransactionId) {
      throw new TypeError(`${family} claims a matching input transaction but exposes different transaction ids`);
    }
    for (const key of ['activeRequestMatch', 'inputMatchesMenuTransaction']) {
      if (Object.prototype.hasOwnProperty.call(event, key) && typeof event[key] !== 'boolean') throw new TypeError(`${family}.${key} must be boolean`);
    }
    if (Object.prototype.hasOwnProperty.call(event, 'activeRequestKind')) assertStringField(event.activeRequestKind, `${family}.activeRequestKind`);
    if (Object.prototype.hasOwnProperty.call(event, 'owner')) {
      if (!isPlainObject(event.owner)) throw new TypeError(`${family}.owner must be a plain object`);
      if (Object.prototype.hasOwnProperty.call(event.owner, 'kind')) assertStringField(event.owner.kind, `${family}.owner.kind`);
      if (Object.prototype.hasOwnProperty.call(event.owner, 'window')) assertExactIntegerField(event.owner.window, `${family}.owner.window`);
      if (Object.prototype.hasOwnProperty.call(event, 'activeRequestKind') && Object.prototype.hasOwnProperty.call(event.owner, 'kind') && event.activeRequestKind !== event.owner.kind) throw new TypeError(`${family} has contradictory owner kind aliases`);
    }
    if (Object.prototype.hasOwnProperty.call(event, 'requestSource')) {
      if (!isPlainObject(event.requestSource)) throw new TypeError(`${family}.requestSource must be a plain object`);
      if (Object.prototype.hasOwnProperty.call(event.requestSource, 'layer')) assertStringField(event.requestSource.layer, `${family}.requestSource.layer`);
      if (Object.prototype.hasOwnProperty.call(event.requestSource, 'window')) assertExactIntegerField(event.requestSource.window, `${family}.requestSource.window`);
    }
    if (Object.prototype.hasOwnProperty.call(event, 'window')) {
      for (const nested of [event.owner, event.requestSource]) {
        if (isPlainObject(nested) && Object.prototype.hasOwnProperty.call(nested, 'window') && nested.window !== event.window) throw new TypeError(`${family} has contradictory window ownership`);
      }
    }
  }
  function copyAnswerFields(target, event, keys) {
    // Answer values cross an ownership/security boundary. Preserve their
    // authoritative presence and type so missing or malformed data cannot be
    // normalized into a legitimate cancellation response.
    return copyPublicMetadata(target, event, keys);
  }
  const transferDirections = new Set(['ground-to-inventory', 'inventory-to-ground', 'container-to-inventory', 'inventory-to-container']);
  const terrainActions = new Set(['stairsDown', 'stairsUp', 'ladderUp', 'drink', 'dip']);
  const terrainKinds = new Set(['stairs.down', 'stairs.up', 'ladder.up', 'fountain']);
  const equipmentActions = new Set(['takeOff', 'removeAccessory', 'wieldMain', 'quiver', 'clearQuiver', 'putOnRing']);
  const lifecycleFamilySpecs = Object.freeze({
    ground_transfer: Object.freeze({ commandType: 'ground.transfer', correlations: ['commandId', 'transactionId', 'transferId'], fields: ['itemId', 'direction', 'coord'] }),
    terrain_action: Object.freeze({ commandType: 'terrain.action', correlations: ['commandId', 'transactionId'], fields: ['action', 'terrain', 'coord', 'itemId'] }),
    container_transfer: Object.freeze({ commandType: 'container.transfer', correlations: ['commandId', 'transactionId', 'transferId'], fields: ['containerId', 'itemId', 'direction'] }),
    container_snapshot: Object.freeze({ commandType: 'container.snapshot', correlations: ['commandId', 'transactionId', 'sessionId'], fields: ['containerId', 'status', 'failureKind'] }),
    equipment_change: Object.freeze({ commandType: 'equipment.change', correlations: ['commandId', 'transactionId'], fields: ['action', 'itemId', 'slotId', 'hand'] }),
    ui_command: Object.freeze({ commandType: 'action.execute', correlations: ['commandId', 'transactionId'], fields: ['actionId', 'command'] }),
  });
  const coordFieldNames = new Set(['x', 'y']);
  const bridgeCommandFieldNames = new Set(['name', 'keycode', 'queuedBefore', 'queuedAfter', 'activeRequestId', 'activeRequestKind', 'activeMenuTransactionId', 'transactionId', 'requestSource', 'guiAction']);
  const bridgeRequestSourceFieldNames = new Set(['layer']);
  const bridgeGuiActionFieldNames = new Set(['actionId', 'label', 'targetSelector', 'targetText', 'followupPlan', 'expectedRequestId', 'commandPosition', 'commandLength', 'source', 'uiProtocolCommandId', 'uiProtocolCommandType', 'uiProtocolActionId']);
  function assertAllowedFields(event, allowed, path) {
    for (const key of Object.keys(event)) if (!allowed.has(key)) throw new TypeError(`${path}.${key} is not an allowed public field`);
  }
  function strictPublicToken(value, path, { required = true } = {}) {
    if (value == null && !required) return undefined;
    if (typeof value !== 'string' || !value || value.length > 255 || !/^[A-Za-z0-9_.:-]+$/.test(value)) throw new TypeError(`${path} must be a non-empty opaque public token`);
    return value;
  }
  function strictPublicText(value, path, { required = true, allowEmpty = false } = {}) {
    if (value == null && !required) return undefined;
    if (typeof value !== 'string' || value.length > 512 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (!allowEmpty && !value.trim())) throw new TypeError(`${path} must be public text`);
    return value;
  }
  function strictPublicId(value, path, { required = true } = {}) {
    if (value == null && !required) return undefined;
    assertExactIntegerField(value, path);
    if (value < 0) throw new TypeError(`${path} must be a non-negative public id`);
    return value;
  }
  function strictPositivePublicId(value, path) {
    const id = strictPublicId(value, path);
    if (id === 0) throw new TypeError(`${path} must be a positive public id`);
    return id;
  }
  function strictCoord(value, path, { required = true } = {}) {
    if (value == null && !required) return undefined;
    if (!isPlainObject(value)) throw new TypeError(`${path} must be a public coordinate`);
    assertAllowedFields(value, coordFieldNames, path);
    return { x: strictPublicId(value.x, `${path}.x`), y: strictPublicId(value.y, `${path}.y`) };
  }
  function putPresent(target, key, value) {
    if (value !== undefined) target[key] = value;
  }
  function lifecycleParts(name) {
    const match = /^shim_(ground_transfer|terrain_action|container_transfer|container_snapshot|equipment_change)_(accepted|queued|confirmed|rejected)$/.exec(name)
      || /^bridge_(ui_command)_(accepted|rejected)$/.exec(name);
    return match ? { family: match[1], stage: match[2] } : undefined;
  }
  function validateDirectLifecycle(event) {
    const parts = lifecycleParts(event.name);
    const spec = parts && lifecycleFamilySpecs[parts.family];
    if (!spec) throw new TypeError(`${event.name} is not a direct command lifecycle`);
    const terminal = parts.stage === 'confirmed' || parts.stage === 'rejected';
    const rejection = parts.stage === 'rejected';
    const familyFields = parts.family === 'ui_command' && rejection ? spec.fields.filter((key) => key !== 'command') : spec.fields;
    const allowed = new Set(['name', ...spec.correlations, ...familyFields, ...(terminal ? ['reason'] : [])]);
    if (parts.family === 'container_snapshot') {
      if (!terminal) {
        allowed.delete('status');
        allowed.delete('failureKind');
      } else if (parts.stage === 'confirmed') allowed.delete('failureKind');
    }
    assertAllowedFields(event, allowed, event.name);
    const out = { name: event.name };
    for (const key of spec.correlations) {
      const required = parts.stage === 'accepted' || parts.stage === 'queued'
        ? !(parts.family === 'ui_command' && key === 'transactionId')
        : (parts.stage === 'confirmed' && key !== 'commandId');
      putPresent(out, key, strictPublicToken(event[key], `${event.name}.${key}`, { required }));
    }
    if (parts.family === 'ground_transfer') {
      const required = !rejection;
      putPresent(out, 'itemId', required ? strictPositivePublicId(event.itemId, `${event.name}.itemId`) : strictPublicId(event.itemId, `${event.name}.itemId`, { required: false }));
      const direction = strictPublicToken(event.direction, `${event.name}.direction`);
      if (!transferDirections.has(direction) || !direction.includes('ground')) throw new TypeError(`${event.name}.direction must describe a ground transfer`);
      out.direction = direction;
      putPresent(out, 'coord', strictCoord(event.coord, `${event.name}.coord`, { required }));
    } else if (parts.family === 'terrain_action') {
      const action = strictPublicText(event.action, `${event.name}.action`, { allowEmpty: rejection });
      const terrain = strictPublicText(event.terrain, `${event.name}.terrain`, { allowEmpty: rejection });
      if (!rejection) {
        const compatible = (action === 'stairsDown' && terrain === 'stairs.down')
          || (action === 'stairsUp' && terrain === 'stairs.up')
          || (action === 'ladderUp' && terrain === 'ladder.up')
          || ((action === 'drink' || action === 'dip') && terrain === 'fountain');
        if (!terrainActions.has(action) || !terrainKinds.has(terrain) || !compatible) throw new TypeError(`${event.name} must use a registered compatible terrain action and terrain`);
      }
      out.action = action;
      out.terrain = terrain;
      out.coord = strictCoord(event.coord, `${event.name}.coord`);
      out.itemId = action === 'dip' && !rejection ? strictPositivePublicId(event.itemId, `${event.name}.itemId`) : strictPublicId(event.itemId, `${event.name}.itemId`);
    } else if (parts.family === 'container_transfer') {
      const required = !rejection;
      putPresent(out, 'containerId', required ? strictPositivePublicId(event.containerId, `${event.name}.containerId`) : strictPublicId(event.containerId, `${event.name}.containerId`, { required: false }));
      putPresent(out, 'itemId', required ? strictPositivePublicId(event.itemId, `${event.name}.itemId`) : strictPublicId(event.itemId, `${event.name}.itemId`, { required: false }));
      const direction = strictPublicToken(event.direction, `${event.name}.direction`);
      if (!transferDirections.has(direction) || !direction.includes('container')) throw new TypeError(`${event.name}.direction must describe a container transfer`);
      out.direction = direction;
    } else if (parts.family === 'container_snapshot') {
      putPresent(out, 'containerId', rejection ? strictPublicId(event.containerId, `${event.name}.containerId`, { required: false }) : strictPositivePublicId(event.containerId, `${event.name}.containerId`));
      if (parts.stage === 'confirmed') {
        if (event.status !== 'ok') throw new TypeError(`${event.name}.status must be ok`);
        out.status = 'ok';
      } else if (rejection) {
        if (event.status !== 'rejected') throw new TypeError(`${event.name}.status must be rejected`);
        out.status = 'rejected';
        out.failureKind = strictPublicToken(event.failureKind, `${event.name}.failureKind`);
      }
    } else if (parts.family === 'equipment_change') {
      const action = strictPublicText(event.action, `${event.name}.action`, { allowEmpty: rejection });
      if (!rejection && !equipmentActions.has(action)) throw new TypeError(`${event.name}.action must be a registered equipment action`);
      out.action = action;
      out.itemId = strictPublicId(event.itemId, `${event.name}.itemId`);
      out.slotId = strictPublicText(event.slotId, `${event.name}.slotId`, { allowEmpty: true });
      out.hand = strictPublicText(event.hand, `${event.name}.hand`, { allowEmpty: true });
      if (!rejection) {
        if (action !== 'clearQuiver' && out.itemId === 0) throw new TypeError(`${event.name}.itemId must be positive for ${action}`);
        if (action !== 'putOnRing' && out.hand) throw new TypeError(`${event.name}.hand is only valid for putOnRing`);
        if (action === 'wieldMain' && out.slotId && out.slotId !== 'mainHand') throw new TypeError(`${event.name}.slotId must be mainHand for wieldMain`);
        if ((action === 'quiver' || action === 'clearQuiver') && out.slotId && out.slotId !== 'quiver') throw new TypeError(`${event.name}.slotId must be quiver for ${action}`);
        if (action === 'putOnRing' && (!['left', 'right'].includes(out.hand) || out.slotId !== `ring.${out.hand}`)) throw new TypeError(`${event.name} ring slot and hand must agree`);
      }
    } else if (parts.family === 'ui_command') {
      putPresent(out, 'actionId', strictPublicToken(event.actionId, `${event.name}.actionId`, { required: !rejection }));
      if (parts.stage === 'accepted' && event.command !== undefined) strictPublicText(event.command, `${event.name}.command`, { allowEmpty: false });
    }
    if (terminal) out.reason = strictPublicText(event.reason, `${event.name}.reason`, { allowEmpty: !rejection });
    return out;
  }
  function validateBridgeCommand(event) {
    const allowed = bridgeCommandFieldNames;
    assertAllowedFields(event, allowed, event.name);
    const out = {
      name: event.name,
      keycode: strictPublicId(event.keycode, `${event.name}.keycode`),
    };
    for (const key of ['queuedBefore', 'queuedAfter']) putPresent(out, key, strictPublicId(event[key], `${event.name}.${key}`, { required: false }));
    putPresent(out, 'transactionId', strictPublicToken(event.transactionId, `${event.name}.transactionId`, { required: false }));
    for (const key of ['activeRequestId', 'activeRequestKind', 'activeMenuTransactionId']) putPresent(out, key, strictPublicToken(event[key], `${event.name}.${key}`, { required: false }));
    if (event.requestSource !== undefined) {
      if (!isPlainObject(event.requestSource)) throw new TypeError(`${event.name}.requestSource must be a public source`);
      assertAllowedFields(event.requestSource, bridgeRequestSourceFieldNames, `${event.name}.requestSource`);
      out.requestSource = { layer: strictPublicToken(event.requestSource.layer, `${event.name}.requestSource.layer`) };
    }
    if (event.guiAction !== undefined) {
      if (!isPlainObject(event.guiAction)) throw new TypeError(`${event.name}.guiAction must be public action metadata`);
      assertAllowedFields(event.guiAction, bridgeGuiActionFieldNames, `${event.name}.guiAction`);
      const guiAction = {};
      for (const key of ['actionId', 'expectedRequestId', 'source', 'uiProtocolCommandId', 'uiProtocolCommandType', 'uiProtocolActionId']) putPresent(guiAction, key, strictPublicToken(event.guiAction[key], `${event.name}.guiAction.${key}`, { required: false }));
      putPresent(guiAction, 'targetSelector', strictPublicText(event.guiAction.targetSelector, `${event.name}.guiAction.targetSelector`, { required: false }));
      if (event.guiAction.followupPlan !== undefined) {
        if (Array.isArray(event.guiAction.followupPlan)) {
          guiAction.followupPlan = event.guiAction.followupPlan.map((entry, index) => strictPublicToken(entry, `${event.name}.guiAction.followupPlan[${index}]`));
        } else guiAction.followupPlan = strictPublicToken(event.guiAction.followupPlan, `${event.name}.guiAction.followupPlan`);
      }
      for (const key of ['label', 'targetText']) putPresent(guiAction, key, strictPublicText(event.guiAction[key], `${event.name}.guiAction.${key}`, { required: false }));
      for (const key of ['commandPosition', 'commandLength']) putPresent(guiAction, key, strictPublicId(event.guiAction[key], `${event.name}.guiAction.${key}`, { required: false }));
      out.guiAction = guiAction;
    }
    return out;
  }
  const validators = Object.freeze({
    shim_create_nhwindow(event) { return { name: event.name, return: asInt(event.return), windowType: asInt(event.windowType) }; },
    shim_clear_nhwindow(event) { return withField({ name: event.name, window: asInt(event.window ?? event.return) }, 'return', asOptInt(event.return)); },
    shim_print_glyph(event) {
      const out = { name: event.name, window: asInt(event.window), x: asInt(event.x), y: asInt(event.y), char: asText(event.char || ' ').slice(0, 1) || ' ', glyph: asOptInt(event.glyph), ttychar: asOptInt(event.ttychar), tileidx: asOptInt(event.tileidx), cmapIndex: asOptInt(event.cmapIndex) };
      for (const key of ['color', 'glyphFlags', 'backgroundGlyph', 'backgroundChar', 'semanticAppearance', 'semanticKnown', 'backgroundSemanticKnown', 'objectLayerGlyph', 'objectLayerSemanticAppearance', 'objectLayerSemanticKnown', 'groundPileSnapshotAuthoritative']) withField(out, key, event[key]);
      withField(out, 'objectId', asOptInt(event.objectId));
      withField(out, 'objectLayerObjectId', asOptInt(event.objectLayerObjectId));
      if (typeof event.displayName === 'string' && event.displayName.trim()) {
        const displayName = PublicItemKnowledge.publicDisplayLabel(event, { neutral: '' });
        if (displayName) out.displayName = displayName.slice(0, 512);
      }
      if (typeof event.objectLayerDisplayName === 'string' && event.objectLayerDisplayName.trim()) {
        const displayName = PublicItemKnowledge.publicDisplayLabel({
          displayName: event.objectLayerDisplayName,
          semanticKnown: event.objectLayerSemanticKnown,
          semanticName: event.objectLayerSemanticName,
          semanticAppearance: event.objectLayerSemanticAppearance,
          semanticKind: event.objectLayerSemanticKind || 'object',
        }, { neutral: '' });
        if (displayName) out.objectLayerDisplayName = displayName.slice(0, 512);
      }
      if (typeof event.featureDescription === 'string' && event.featureDescription.trim()) out.featureDescription = event.featureDescription.trim().slice(0, 512);
      if (typeof event.engravingText === 'string' && event.engravingText.trim()) out.engravingText = event.engravingText.trim().slice(0, 512);
      withField(out, 'assetId', opaqueToken(event.assetId));
      withField(out, 'actorId', opaqueToken(event.actorId));
      withField(out, 'semanticKind', opaqueToken(event.semanticKind));
      withField(out, 'backgroundSemanticKind', opaqueToken(event.backgroundSemanticKind));
      withField(out, 'objectLayerSemanticKind', opaqueToken(event.objectLayerSemanticKind));
      withField(out, 'objectLayerChar', publicChar(event.objectLayerChar));
      if (event.semanticKnown === true) withField(out, 'semanticName', event.semanticName);
      if (event.objectLayerSemanticKnown === true) withField(out, 'objectLayerSemanticName', event.objectLayerSemanticName);
      if (event.backgroundSemanticKnown === true) withField(out, 'backgroundSemanticName', event.backgroundSemanticName);
      if (Array.isArray(event.actionAffordances)) out.actionAffordances = publicActionTokens(event.actionAffordances);
      if (Array.isArray(event.backgroundActionAffordances)) out.backgroundActionAffordances = publicActionTokens(event.backgroundActionAffordances);
      if (Array.isArray(event.objectLayerActionAffordances)) out.objectLayerActionAffordances = publicActionTokens(event.objectLayerActionAffordances);
      if (event.creaturePublic && typeof event.creaturePublic === 'object') {
        const source = event.creaturePublic;
        const attitude = typeof source.attitude === 'string' ? source.attitude.trim().toLowerCase() : '';
        const size = typeof source.size === 'string' ? source.size.trim().toLowerCase() : '';
        const allowedAttitude = new Set(['tame', 'peaceful', 'hostile']);
        const allowedSize = new Set(['tiny', 'small', 'medium', 'large', 'huge', 'gigantic']);
        const status = Array.isArray(source.status)
          ? source.status
            .filter((entry) => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .slice(0, 12)
          : [];
        const creaturePublic = {};
        if (allowedAttitude.has(attitude)) creaturePublic.attitude = attitude;
        if (allowedSize.has(size)) creaturePublic.size = size;
        if (status.length) creaturePublic.status = status;
        if (creaturePublic.attitude || creaturePublic.size || (creaturePublic.status && creaturePublic.status.length)) {
          out.creaturePublic = creaturePublic;
        }
      }
      return out;
    },
    shim_curs(event) { return { name: event.name, window: asInt(event.window), x: asInt(event.x), y: asInt(event.y) }; },
    shim_putstr(event) { return { name: event.name, window: asOptInt(event.window), text: asText(event.text), attr: event.attr }; },
    shim_raw_print(event) { return { name: event.name, text: asText(event.text) }; },
    shim_raw_print_bold(event) { return { name: event.name, text: asText(event.text) }; },
    shim_start_menu(event) { return copyPublicMetadata({ name: event.name, window: asInt(event.window) }, event); },
    shim_add_menu(event) {
      const objectItem = PublicItemKnowledge.isObjectMenuItem(event);
      const out = copyPublicMetadata({ name: event.name, window: asInt(event.window), selector: asOptInt(event.selector), text: objectItem ? publicLegacyItemText(event) : asText(event.text), objectId: asOptInt(event.objectId), attr: event.attr, color: event.color, itemflags: event.itemflags, glyph: asOptInt(event.glyph), glyphChar: asOptInt(event.glyphChar), glyphColor: event.glyphColor, tileidx: asOptInt(event.tileidx), cmapIndex: asOptInt(event.cmapIndex) }, event);
      withField(out, 'semanticKind', event.semanticKind);
      if (objectItem) {
        out.semanticKnown = PublicItemKnowledge.identityIsPublic(event);
        copyItemPresentationFields(out, event);
      } else withField(out, 'semanticKnown', event.semanticKnown);
      if (event.known?.appearance !== false) withField(out, 'semanticAppearance', itemIsExplicitlyUnknown(event) && event.known?.appearance === true ? publicItemDisplayName(event) : event.semanticAppearance);
      if (PublicItemKnowledge.identityIsPublic(event)) withField(out, 'semanticName', event.semanticName);
      if (Array.isArray(event.actionAffordances)) out.actionAffordances = publicActionTokens(event.actionAffordances);
      return out;
    },
    shim_end_menu(event) { return copyPublicMetadata({ name: event.name, window: asInt(event.window), prompt: asText(event.prompt) }, event); },
    shim_select_menu(event) { return copyPublicMetadata({ name: event.name, window: asInt(event.window), how: asInt(event.how) }, event); },
    shim_display_nhwindow(event) { return { name: event.name, window: asInt(event.window), blocking: asInt(event.blocking) }; },
    shim_message_menu(event) { return copyPublicMetadata({ name: event.name, lets: asText(event.lets), how: asInt(event.how) }, event); },
    bridge_menu_answer(event) {
      validateAnswerIngress(event, 'bridge_menu_answer', ['window', 'return', 'selector', 'lifecycleRevision']);
      for (const key of ['selectors', 'answer', 'value', 'key', 'selection', 'menuId', 'menuPurpose', 'lifecycle']) if (Object.prototype.hasOwnProperty.call(event, key)) assertStringField(event[key], `bridge_menu_answer.${key}`);
      return copyPublicMetadata(copyAnswerFields({ name: event.name }, event, ['window', 'return', 'selector', 'selectors', 'answer', 'value', 'key', 'selection']), event);
    },
    shim_yn_function(event) { return copyPublicMetadata({ name: event.name, query: asText(event.query), choices: asText(event.choices), def: event.def == null ? undefined : asText(event.def) }, event); },
    shim_getlin(event) { return copyPublicMetadata({ name: event.name, query: asText(event.query), choices: asText(event.choices || '') }, event); },
    bridge_command_prompt(event) { return copyPublicMetadata({ name: event.name, query: asText(event.query), choices: asText(event.choices || '') }, event); },
    bridge_direction_prompt(event) { return copyPublicMetadata({ name: event.name, query: asText(event.query), choices: asText(event.choices || 'ykulnjbh.<>') }, event); },
    bridge_extcmd_catalog(event) { return copyPublicMetadata({ name: event.name, commands: Array.isArray(event.commands) ? event.commands : [] }, event); },
    shim_get_ext_cmd(event) { return copyPublicMetadata({ name: event.name }, event); },
    bridge_prompt_answer(event) { validateAnswerIngress(event, 'bridge_prompt_answer', ['keycode']); return copyPublicMetadata(copyAnswerFields({ name: event.name }, event, ['keycode', 'value', 'key', 'answer']), event); },
    bridge_line_answer(event) { validateAnswerIngress(event, 'bridge_line_answer'); return copyPublicMetadata(copyAnswerFields({ name: event.name }, event, ['value', 'answer', 'key']), event); },
    bridge_extcmd_answer(event) { validateAnswerIngress(event, 'bridge_extcmd_answer', ['return']); return copyPublicMetadata(copyAnswerFields({ name: event.name }, event, ['return', 'value', 'command', 'answer', 'key']), event); },
    bridge_direction_answer(event) { validateAnswerIngress(event, 'bridge_direction_answer', ['keycode']); return copyPublicMetadata(copyAnswerFields({ name: event.name }, event, ['keycode']), event); },
    bridge_test_scenario_loaded(event) { return { name: event.name, id: asText(event.id), message: asText(event.message), expectedPublicFacts: event.expectedPublicFacts && typeof event.expectedPublicFacts === 'object' ? event.expectedPublicFacts : undefined }; },
    bridge_test_scenario_failed(event) { return { name: event.name, id: asText(event.id), message: asText(event.message) }; },
    shim_status_enablefield(event) { return { name: event.name, field: asInt(event.field), label: asText(event.label), enabled: event.enabled }; },
    shim_status_update(event) { return { name: event.name, field: asInt(event.field), value: event.value == null ? undefined : asText(event.value), conditionMask: asOptInt(event.conditionMask), percent: asOptInt(event.percent), color: asOptInt(event.color) }; },
    shim_update_inventory(event) {
      if (!Array.isArray(event.items)) throw new TypeError('shim_update_inventory requires an items array');
      assertUniqueAuthoritativeItemKeys(event.items, 'shim_update_inventory');
      const items = event.items.map((item, index) => {
        if (!isStructurallyValidItem(item) || !asOptInt(item.selector)) throw new TypeError(`shim_update_inventory item ${index} is malformed`);
        const out = { selector: asOptInt(item.selector), text: publicLegacyItemText(item), objectId: asOptInt(item.objectId), quantity: asOptInt(item.quantity), glyph: asOptInt(item.glyph), glyphChar: asOptInt(item.glyphChar), itemflags: asOptInt(item.itemflags), wornMask: asOptInt(item.wornMask) };
        withField(out, 'semanticKind', opaqueToken(item.semanticKind));
        out.semanticKnown = PublicItemKnowledge.identityIsPublic(item);
        if (item.known?.appearance !== false) withField(out, 'semanticAppearance', item.semanticAppearance || item.appearanceName);
        if (PublicItemKnowledge.identityIsPublic(item)) withField(out, 'semanticName', item.semanticName);
        if (Array.isArray(item.actionAffordances)) out.actionAffordances = publicActionTokens(item.actionAffordances);
        return copyItemPresentationFields(out, item);
      });
      return copyPublicMetadata({ name: event.name, reason: asOptInt(event.reason), revision: asOptInt(event.revision ?? event.inventoryRevision), inventoryRevision: asOptInt(event.inventoryRevision ?? event.revision), equipmentRevision: asOptInt(event.equipmentRevision ?? event.revision ?? event.inventoryRevision), items }, event);
    },
    shim_ground_pile_snapshot(event) {
      if (!Array.isArray(event.items)) throw new TypeError('shim_ground_pile_snapshot requires an items array');
      assertUniqueAuthoritativeItemKeys(event.items, 'shim_ground_pile_snapshot');
      const items = event.items.map((item, index) => {
        if (!isStructurallyValidItem(item)) throw new TypeError(`shim_ground_pile_snapshot item ${index} is malformed`);
        const displayName = publicItemDisplayName(item);
        const out = { displayName, text: displayName, objectId: asOptInt(item.objectId), quantity: asOptInt(item.quantity), glyph: asOptInt(item.glyph), glyphChar: asOptInt(item.glyphChar), objectClass: item.objectClass == null ? undefined : publicChar(item.objectClass) };
        withField(out, 'semanticKind', opaqueToken(item.semanticKind));
        out.semanticKnown = PublicItemKnowledge.identityIsPublic(item);
        if (item.known?.appearance !== false) withField(out, 'semanticAppearance', item.semanticAppearance || item.appearanceName);
        if (PublicItemKnowledge.identityIsPublic(item)) withField(out, 'semanticName', item.semanticName);
        if (Array.isArray(item.actionAffordances)) out.actionAffordances = publicActionTokens(item.actionAffordances);
        return copyItemPresentationFields(out, item);
      });
      return copyPublicMetadata({ name: event.name, window: asOptInt(event.window), x: asInt(event.x), y: asInt(event.y), revision: asOptInt(event.revision), coord: event.coord && typeof event.coord === 'object' ? { x: asInt(event.coord.x), y: asInt(event.coord.y) } : { x: asInt(event.x), y: asInt(event.y) }, source: asText(event.source || 'level.objects'), authoritative: event.authoritative !== false, items }, event);
    },
    shim_container_contents_snapshot(event) {
      if (!Array.isArray(event.items)) throw new TypeError('shim_container_contents_snapshot requires an items array');
      assertUniqueAuthoritativeItemKeys(event.items, 'shim_container_contents_snapshot');
      const items = event.items.map((item, index) => {
        if (!isStructurallyValidItem(item)) throw new TypeError(`shim_container_contents_snapshot item ${index} is malformed`);
        const displayName = publicItemDisplayName(item);
        const out = { displayName, text: displayName, objectId: asOptInt(item.objectId), quantity: asOptInt(item.quantity), glyph: asOptInt(item.glyph), glyphChar: asOptInt(item.glyphChar), objectClass: item.objectClass == null ? undefined : publicChar(item.objectClass) };
        withField(out, 'semanticKind', opaqueToken(item.semanticKind));
        out.semanticKnown = PublicItemKnowledge.identityIsPublic(item);
        if (item.known?.appearance !== false) withField(out, 'semanticAppearance', item.semanticAppearance || item.appearanceName);
        if (PublicItemKnowledge.identityIsPublic(item)) withField(out, 'semanticName', item.semanticName);
        if (Array.isArray(item.actionAffordances)) out.actionAffordances = publicActionTokens(item.actionAffordances);
        return copyItemPresentationFields(out, item);
      });
      const container = event.container && typeof event.container === 'object' ? { publicId: asText(event.container.publicId || event.container.displayName || 'container'), displayName: asText(event.container.displayName || event.container.publicId || 'container'), objectId: asOptInt(event.container.objectId) } : { publicId: 'container', displayName: 'container' };
      return copyPublicMetadata({ name: event.name, revision: asOptInt(event.revision), sessionId: asText(event.sessionId), container, items }, event);
    },
    shim_ground_transfer_accepted: validateDirectLifecycle,
    shim_ground_transfer_queued: validateDirectLifecycle,
    shim_ground_transfer_confirmed: validateDirectLifecycle,
    shim_ground_transfer_rejected: validateDirectLifecycle,
    shim_terrain_action_accepted: validateDirectLifecycle,
    shim_terrain_action_queued: validateDirectLifecycle,
    shim_terrain_action_confirmed: validateDirectLifecycle,
    shim_terrain_action_rejected: validateDirectLifecycle,
    shim_container_transfer_accepted: validateDirectLifecycle,
    shim_container_transfer_queued: validateDirectLifecycle,
    shim_container_transfer_confirmed: validateDirectLifecycle,
    shim_container_transfer_rejected: validateDirectLifecycle,
    shim_container_snapshot_accepted: validateDirectLifecycle,
    shim_container_snapshot_queued: validateDirectLifecycle,
    shim_container_snapshot_confirmed: validateDirectLifecycle,
    shim_container_snapshot_rejected: validateDirectLifecycle,
    shim_equipment_change_accepted: validateDirectLifecycle,
    shim_equipment_change_queued: validateDirectLifecycle,
    shim_equipment_change_confirmed: validateDirectLifecycle,
    shim_equipment_change_rejected: validateDirectLifecycle,
    bridge_ui_command_accepted: validateDirectLifecycle,
    bridge_ui_command_rejected: validateDirectLifecycle,
    bridge_command: validateBridgeCommand,
    bridge_input_queue_full(event) { return copyPublicMetadata({ name: event.name, keycode: asOptInt(event.keycode), queuedBefore: asOptInt(event.queuedBefore), queuedAfter: asOptInt(event.queuedAfter) }, event); },
    bridge_unsupported_command(event) { return copyPublicMetadata({ name: event.name, keycode: asOptInt(event.keycode) }, event); },
    bridge_semantic_followup_rejected(event) { return copyPublicMetadata({ name: event.name, keycode: asOptInt(event.keycode), reason: asText(event.reason || 'semantic follow-up rejected') }, event); },
    bridge_seed(event) { return { name: event.name, seed: event.seed == null ? undefined : asText(event.seed), source: asText(event.source || '') }; },
    bridge_seed_invalid(event) { return { name: event.name, source: asText(event.source || ''), value: asText(event.value || '') }; },
    bridge_seed_ignored(event) { return { name: event.name, reason: asText(event.reason || '') }; },
    bridge_start(event) { return copyPublicMetadata({ name: event.name }, event); },
    bridge_exit(event) { return copyPublicMetadata({ name: event.name }, event); },
    bridge_stdin_closed(event) { return { name: event.name }; },
    shim_native_end_diagnostic(event) { return copyPublicMetadata({ name: event.name, phase: asText(event.phase), how: asOptInt(event.how), reason: asText(event.reason), killerName: asText(event.killerName), killerFormat: asOptInt(event.killerFormat), killer: asText(event.killer), callsite: asText(event.callsite), finalFlow: Boolean(event.finalFlow), disclosureFlow: Boolean(event.disclosureFlow), taken: Boolean(event.taken), cmdKey: asOptInt(event.cmdKey), moves: asOptInt(event.moves), depth: asOptInt(event.depth), dnum: asOptInt(event.dnum), dlevel: asOptInt(event.dlevel), gameover: Boolean(event.gameover), pendingInputQueue: asOptInt(event.pendingInputQueue), activePromptRequestId: event.activePromptRequestId ? asText(event.activePromptRequestId) : undefined, activeMenuRequestId: event.activeMenuRequestId ? asText(event.activeMenuRequestId) : undefined }, event); },
    shim_native_menu_context(event) { return copyPublicMetadata({ name: event.name, menuPurpose: asText(event.menuPurpose), ownerKind: asText(event.ownerKind), callsite: asText(event.callsite), finalFlow: Boolean(event.finalFlow), disclosureFlow: Boolean(event.disclosureFlow), how: asOptInt(event.how), reason: asText(event.reason), pendingForNextMenu: Boolean(event.pendingForNextMenu) }, event); },
    shim_native_command_diagnostic(event) { return copyPublicMetadata({ name: event.name, phase: asText(event.phase), callsite: asText(event.callsite), cmdKey: asOptInt(event.cmdKey), moves: asOptInt(event.moves), depth: asOptInt(event.depth), dnum: asOptInt(event.dnum), dlevel: asOptInt(event.dlevel), nativePending: asOptInt(event.nativePending), pendingInputQueue: asOptInt(event.pendingInputQueue), activePromptRequestId: event.activePromptRequestId ? asText(event.activePromptRequestId) : undefined, activeMenuRequestId: event.activeMenuRequestId ? asText(event.activeMenuRequestId) : undefined }, event); },
  });
  function parseLine(line) {
    try { return normalizeRawShimEvent(JSON.parse(String(line))); }
    catch { return normalizeRawShimEvent({ type: 'shim-raw', text: String(line) }); }
  }
  function normalizeRawShimEvent(raw) {
    const event = raw && typeof raw === 'object' ? { ...raw } : { type: 'shim-raw', text: String(raw ?? '') };
    // `type` is the NDJSON transport discriminator emitted by the C bridge,
    // not part of the public event. Strip only the exact wrapper token; any
    // other value remains visible to strict validators and fails closed.
    if (event.name && event.type === 'shim-event') delete event.type;
    if (event.protocol === 'nethack-electron-ui/v2' && typeof event.eventType === 'string' && event.eventType) {
      const checked = UiProtocolV2.validateEventEnvelope?.(event) || { ok: false, errors: ['v2 validator unavailable'] };
      const preserved = checked.ok ? Object.freeze({ ...event }) : Object.freeze({
        protocol: event.protocol,
        eventType: event.eventType,
        eventId: event.eventId,
        sequence: event.sequence,
        turn: event.turn,
      });
      return Object.freeze({
        protocol: protocolVersion,
        schemaVersion: 1,
        kind: 'control',
        known: true,
        valid: checked.ok,
        errors: Object.freeze((checked.errors || []).map(() => 'invalid public v2 event')),
        name: event.eventType,
        payload: preserved,
        raw: preserved,
        event: preserved,
      });
    }
    if (!event.name && typeof event.type === 'string' && event.type.startsWith('shim-')) event.name = event.type;
    const name = String(event.name || event.type || 'unknown');
    event.name = name;
    const validation = validateEvent(event);
    return Object.freeze({
      protocol: protocolVersion,
      schemaVersion: 1,
      kind: eventKind(name),
      known: knownNames.has(name),
      valid: validation.ok,
      errors: Object.freeze(validation.errors),
      name,
      payload: Object.freeze(validation.payload),
      raw: Object.freeze({ ...validation.payload }),
      event: Object.freeze(validation.payload),
    });
  }
  function validateEvent(event) {
    const name = String(event.name || 'unknown');
    const errors = [];
    let payload = { ...event, name };
    if (!knownNames.has(name)) errors.push(`unknown event: ${name}`);
    const validator = validators[name];
    if (validator) {
      try { payload = validator(event); }
      catch (error) { payload = { name }; errors.push(error.message || String(error)); }
    }
    if (name === 'shim_print_glyph' && (!Number.isFinite(Number(payload.x)) || !Number.isFinite(Number(payload.y)))) errors.push('print_glyph requires numeric x/y');
    if ((name === 'shim_putstr' || name === 'shim_raw_print' || name === 'shim_raw_print_bold') && typeof payload.text !== 'string') errors.push(`${name} requires text`);
    return { ok: errors.length === 0, errors, payload };
  }
  function eventKind(name) {
    if (/print_glyph|ground_pile|curs|nhwindow/.test(name)) return 'map';
    if (/menu/.test(name)) return 'menu';
    if (/prompt|yn_function|getlin|direction|get_ext_cmd/.test(name)) return 'prompt';
    if (/status|inventory/.test(name)) return 'status';
    if (/seed/.test(name)) return 'seed';
    if (/putstr|raw_print|message/.test(name)) return 'message';
    if (/stderr|raw/.test(name)) return 'raw-log';
    return 'control';
  }
  function adaptLifecycleToCommandAcknowledgement(raw, { sequence, eventId, turn = 0, source = { layer: 'renderer' } } = {}) {
    const normalized = normalizeRawShimEvent(raw?.event || raw?.raw || raw);
    if (!normalized.valid) throw new TypeError(`cannot acknowledge invalid shim lifecycle: ${normalized.errors.join('; ')}`);
    const parts = lifecycleParts(normalized.name);
    const spec = parts && lifecycleFamilySpecs[parts.family];
    if (!spec) return undefined;
    const event = normalized.event;
    if (!event.commandId) return undefined;
    const eventType = parts.stage === 'rejected' ? 'command.rejected' : (parts.stage === 'confirmed' ? 'command.completed' : 'command.accepted');
    const status = parts.stage === 'confirmed' ? 'success' : parts.stage;
    const details = {
      sequence,
      eventId,
      eventType,
      turn,
      source,
      commandId: event.commandId,
      transactionId: event.transactionId,
      transferId: event.transferId,
      sessionId: event.sessionId,
      commandType: spec.commandType,
      actionId: event.actionId,
      status,
      supported: true,
      executionSource: 'bridge-ui-command',
      replayBehavior: 'preserved evidence only; no raw fallback input sent',
    };
    if (parts.stage === 'rejected') {
      details.reason = `${spec.commandType} rejected by NetHack`;
      details.blockerToken = UiProtocolV2.commandBlockerTokenForReason?.(event.reason) || 'blocked.input.malformedCommand';
    } else if (parts.stage === 'confirmed') {
      const result = { status: 'success' };
      if (event.action) result.action = event.action;
      if (event.itemId !== undefined) result.itemId = event.itemId;
      details.result = result;
    }
    const acknowledgement = UiProtocolV2.createCommandAckEvent?.(details);
    const checked = UiProtocolV2.validateEventEnvelope?.(acknowledgement) || { ok: false, errors: ['v2 validator unavailable'] };
    if (!checked.ok) throw new TypeError(`invalid canonical command acknowledgement: ${(checked.errors || []).join('; ')}`);
    return checked.event;
  }
  return Object.freeze({ version: protocolVersion, knownNames: Object.freeze(Array.from(knownNames).sort()), validators, parseLine, normalizeRawShimEvent, validateEvent, adaptLifecycleToCommandAcknowledgement, compatibilitySpellRowsFromMenu, compatibilitySkillRowsFromMenu });
}));
