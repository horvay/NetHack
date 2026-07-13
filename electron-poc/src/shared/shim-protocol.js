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
    'shim_update_inventory', 'shim_ground_pile_snapshot', 'shim_container_contents_snapshot', 'shim_container_transfer_accepted', 'shim_container_transfer_queued', 'shim_container_transfer_confirmed', 'shim_container_transfer_rejected', 'shim_container_snapshot_accepted', 'shim_container_snapshot_queued', 'shim_container_snapshot_confirmed', 'shim_container_snapshot_rejected', 'shim_equipment_change_accepted', 'shim_equipment_change_queued', 'shim_equipment_change_confirmed', 'shim_equipment_change_rejected', 'bridge_command', 'bridge_input_queue_full', 'bridge_unsupported_command', 'bridge_semantic_followup_rejected',
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
              : publicClass === 'tool' ? new Set(['eyes']) : new Set();
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
    assertConsistentPresentAliases(event, ['transactionId', 'inputTransactionId', 'activeMenuTransactionId', 'activeRequestTransactionId', 'activeTransactionId'], 'transaction ownership');
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
  const validators = Object.freeze({
    shim_create_nhwindow(event) { return { name: event.name, return: asInt(event.return), windowType: asInt(event.windowType) }; },
    shim_clear_nhwindow(event) { return withField({ name: event.name, window: asInt(event.window ?? event.return) }, 'return', asOptInt(event.return)); },
    shim_print_glyph(event) {
      const out = { name: event.name, window: asInt(event.window), x: asInt(event.x), y: asInt(event.y), char: asText(event.char || ' ').slice(0, 1) || ' ', glyph: asOptInt(event.glyph), ttychar: asOptInt(event.ttychar), tileidx: asOptInt(event.tileidx), cmapIndex: asOptInt(event.cmapIndex) };
      for (const key of ['color', 'glyphFlags', 'backgroundGlyph', 'backgroundChar', 'semanticAppearance', 'semanticKnown', 'backgroundSemanticKnown', 'objectLayerGlyph', 'objectLayerSemanticAppearance', 'objectLayerSemanticKnown', 'groundPileSnapshotAuthoritative']) withField(out, key, event[key]);
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
    shim_container_transfer_accepted(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), transferId: asText(event.transferId), containerId: asOptInt(event.containerId), itemId: asOptInt(event.itemId), direction: asText(event.direction || 'container-to-inventory') }, event); },
    shim_container_transfer_queued(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), transferId: asText(event.transferId), containerId: asOptInt(event.containerId), itemId: asOptInt(event.itemId), direction: asText(event.direction || 'container-to-inventory') }, event); },
    shim_container_transfer_confirmed(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), transferId: asText(event.transferId), containerId: asOptInt(event.containerId), itemId: asOptInt(event.itemId), direction: asText(event.direction || 'container-to-inventory'), reason: asText(event.reason || '') }, event); },
    shim_container_transfer_rejected(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), transferId: asText(event.transferId), containerId: asOptInt(event.containerId), itemId: asOptInt(event.itemId), direction: asText(event.direction || 'container-to-inventory'), reason: asText(event.reason || 'container transfer rejected') }, event); },
    shim_container_snapshot_accepted(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), sessionId: asText(event.sessionId), containerId: asOptInt(event.containerId) }, event); },
    shim_container_snapshot_queued(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), sessionId: asText(event.sessionId), containerId: asOptInt(event.containerId) }, event); },
    shim_container_snapshot_confirmed(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), sessionId: asText(event.sessionId), containerId: asOptInt(event.containerId), status: asText(event.status || 'ok'), reason: asText(event.reason || '') }, event); },
    shim_container_snapshot_rejected(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), sessionId: asText(event.sessionId), containerId: asOptInt(event.containerId), status: asText(event.status || 'rejected'), failureKind: asText(event.failureKind || 'rejected'), reason: asText(event.reason || 'container snapshot rejected') }, event); },
    shim_equipment_change_accepted(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), action: asText(event.action), itemId: asOptInt(event.itemId), slotId: asText(event.slotId), hand: asText(event.hand) }, event); },
    shim_equipment_change_queued(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), action: asText(event.action), itemId: asOptInt(event.itemId), slotId: asText(event.slotId), hand: asText(event.hand) }, event); },
    shim_equipment_change_confirmed(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), action: asText(event.action), itemId: asOptInt(event.itemId), slotId: asText(event.slotId), hand: asText(event.hand), reason: asText(event.reason || '') }, event); },
    shim_equipment_change_rejected(event) { return copyPublicMetadata({ name: event.name, commandId: asText(event.commandId), transactionId: asText(event.transactionId), action: asText(event.action), itemId: asOptInt(event.itemId), slotId: asText(event.slotId), hand: asText(event.hand), reason: asText(event.reason || 'equipment change rejected') }, event); },
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
  return Object.freeze({ version: protocolVersion, knownNames: Object.freeze(Array.from(knownNames).sort()), validators, parseLine, normalizeRawShimEvent, validateEvent, compatibilitySpellRowsFromMenu, compatibilitySkillRowsFromMenu });
}));
