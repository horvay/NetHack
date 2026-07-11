(function initShimProtocol(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackShimProtocol = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
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
  function withField(target, name, value) { if (value !== undefined) target[name] = value; return target; }
  function copyPublicMetadata(target, event, keys = ['menuPurpose', 'menuRequestId', 'menuId', 'requestId', 'transactionId', 'requestSource', 'owner', 'selectionMode', 'lifecycle', 'lifecycleRevision', 'promptPurpose', 'promptType', 'promptId', 'autoAnswered', 'autoAnswerReason', 'guiAction', 'actionId', 'actionLabel', 'targetSelector', 'targetText', 'followupPlan', 'expectedRequestId', 'commandPosition', 'commandLength', 'activeRequestId', 'activeRequestKind', 'activeMenuTransactionId', 'queuedBeforePop', 'queuedAfterPop', 'activeRequestMatch', 'inputMatchesMenuTransaction', 'inputTransactionId', 'nativeMenuCallsite', 'nativeEndReason', 'nativeEndHow', 'finalFlow', 'disclosureFlow']) {
    for (const key of keys) {
      const value = event[key];
      if (value === undefined) continue;
      if (value && typeof value === 'object') target[key] = Array.isArray(value) ? value.slice() : { ...value };
      else target[key] = value;
    }
    return target;
  }
  const validators = Object.freeze({
    shim_create_nhwindow(event) { return { name: event.name, return: asInt(event.return), windowType: asInt(event.windowType) }; },
    shim_clear_nhwindow(event) { return withField({ name: event.name, window: asInt(event.window ?? event.return) }, 'return', asOptInt(event.return)); },
    shim_print_glyph(event) {
      const out = { name: event.name, window: asInt(event.window), x: asInt(event.x), y: asInt(event.y), char: asText(event.char || ' ').slice(0, 1) || ' ', glyph: asOptInt(event.glyph), ttychar: asOptInt(event.ttychar), tileidx: asOptInt(event.tileidx), cmapIndex: asOptInt(event.cmapIndex) };
      for (const key of ['assetId', 'color', 'glyphFlags', 'backgroundGlyph', 'semanticKind', 'semanticAppearance', 'semanticKnown', 'backgroundSemanticKind', 'backgroundSemanticKnown', 'objectLayerGlyph', 'objectLayerChar', 'objectLayerSemanticKind', 'objectLayerSemanticAppearance', 'objectLayerSemanticKnown', 'groundPileSnapshotAuthoritative']) withField(out, key, event[key]);
      if (event.semanticKnown !== false) withField(out, 'semanticName', event.semanticName);
      if (event.objectLayerSemanticKnown !== false) withField(out, 'objectLayerSemanticName', event.objectLayerSemanticName);
      if (event.backgroundSemanticKnown !== false) withField(out, 'backgroundSemanticName', event.backgroundSemanticName);
      if (Array.isArray(event.actionAffordances)) out.actionAffordances = event.actionAffordances.filter((item) => typeof item === 'string');
      if (Array.isArray(event.backgroundActionAffordances)) out.backgroundActionAffordances = event.backgroundActionAffordances.filter((item) => typeof item === 'string');
      if (Array.isArray(event.objectLayerActionAffordances)) out.objectLayerActionAffordances = event.objectLayerActionAffordances.filter((item) => typeof item === 'string');
      return out;
    },
    shim_curs(event) { return { name: event.name, window: asInt(event.window), x: asInt(event.x), y: asInt(event.y) }; },
    shim_putstr(event) { return { name: event.name, window: asOptInt(event.window), text: asText(event.text), attr: event.attr }; },
    shim_raw_print(event) { return { name: event.name, text: asText(event.text) }; },
    shim_raw_print_bold(event) { return { name: event.name, text: asText(event.text) }; },
    shim_start_menu(event) { return copyPublicMetadata({ name: event.name, window: asInt(event.window) }, event); },
    shim_add_menu(event) {
      const out = copyPublicMetadata({ name: event.name, window: asInt(event.window), selector: asOptInt(event.selector), text: asText(event.text), objectId: asOptInt(event.objectId), attr: event.attr, color: event.color, itemflags: event.itemflags, glyph: asOptInt(event.glyph), glyphChar: asOptInt(event.glyphChar), glyphColor: event.glyphColor, tileidx: asOptInt(event.tileidx), cmapIndex: asOptInt(event.cmapIndex) }, event);
      for (const key of ['semanticKind', 'semanticAppearance', 'semanticKnown']) withField(out, key, event[key]);
      if (event.semanticKnown !== false) withField(out, 'semanticName', event.semanticName);
      if (Array.isArray(event.actionAffordances)) out.actionAffordances = event.actionAffordances.filter((item) => typeof item === 'string');
      return out;
    },
    shim_end_menu(event) { return copyPublicMetadata({ name: event.name, window: asInt(event.window), prompt: asText(event.prompt) }, event); },
    shim_select_menu(event) { return copyPublicMetadata({ name: event.name, window: asInt(event.window), how: asInt(event.how) }, event); },
    shim_display_nhwindow(event) { return { name: event.name, window: asInt(event.window), blocking: asInt(event.blocking) }; },
    shim_message_menu(event) { return copyPublicMetadata({ name: event.name, lets: asText(event.lets), how: asInt(event.how) }, event); },
    bridge_menu_answer(event) { return copyPublicMetadata({ name: event.name, window: asOptInt(event.window), return: asInt(event.return), selector: asOptInt(event.selector), selectors: event.selectors == null ? undefined : asText(event.selectors) }, event); },
    shim_yn_function(event) { return copyPublicMetadata({ name: event.name, query: asText(event.query), choices: asText(event.choices), def: event.def == null ? undefined : asText(event.def) }, event); },
    shim_getlin(event) { return copyPublicMetadata({ name: event.name, query: asText(event.query), choices: asText(event.choices || '') }, event); },
    bridge_command_prompt(event) { return copyPublicMetadata({ name: event.name, query: asText(event.query), choices: asText(event.choices || '') }, event); },
    bridge_direction_prompt(event) { return copyPublicMetadata({ name: event.name, query: asText(event.query), choices: asText(event.choices || 'ykulnjbh.<>') }, event); },
    bridge_extcmd_catalog(event) { return copyPublicMetadata({ name: event.name, commands: Array.isArray(event.commands) ? event.commands : [] }, event); },
    shim_get_ext_cmd(event) { return copyPublicMetadata({ name: event.name }, event); },
    bridge_prompt_answer(event) { return copyPublicMetadata({ name: event.name, keycode: asOptInt(event.keycode), value: event.value == null ? undefined : asText(event.value) }, event); },
    bridge_line_answer(event) { return copyPublicMetadata({ name: event.name, value: asText(event.value) }, event); },
    bridge_extcmd_answer(event) { return copyPublicMetadata({ name: event.name, command: asText(event.command) }, event); },
    bridge_direction_answer(event) { return copyPublicMetadata({ name: event.name, keycode: asOptInt(event.keycode) }, event); },
    bridge_test_scenario_loaded(event) { return { name: event.name, id: asText(event.id), message: asText(event.message), expectedPublicFacts: event.expectedPublicFacts && typeof event.expectedPublicFacts === 'object' ? event.expectedPublicFacts : undefined }; },
    bridge_test_scenario_failed(event) { return { name: event.name, id: asText(event.id), message: asText(event.message) }; },
    shim_status_enablefield(event) { return { name: event.name, field: asInt(event.field), label: asText(event.label), enabled: event.enabled }; },
    shim_status_update(event) { return { name: event.name, field: asInt(event.field), value: event.value == null ? undefined : asText(event.value), conditionMask: asOptInt(event.conditionMask), percent: asOptInt(event.percent), color: asOptInt(event.color) }; },
    shim_update_inventory(event) {
      const items = Array.isArray(event.items) ? event.items.map((item) => {
        const out = { selector: asOptInt(item.selector), text: asText(item.text), objectId: asOptInt(item.objectId), quantity: asOptInt(item.quantity), glyph: asOptInt(item.glyph), glyphChar: asOptInt(item.glyphChar), itemflags: asOptInt(item.itemflags), wornMask: asOptInt(item.wornMask) };
        for (const key of ['semanticKind', 'semanticAppearance', 'semanticKnown']) withField(out, key, item[key]);
        if (item.semanticKnown !== false) withField(out, 'semanticName', item.semanticName);
        if (Array.isArray(item.actionAffordances)) out.actionAffordances = item.actionAffordances.filter((value) => typeof value === 'string');
        return out;
      }).filter((item) => item.selector && item.text) : [];
      return copyPublicMetadata({ name: event.name, reason: asOptInt(event.reason), revision: asOptInt(event.revision ?? event.inventoryRevision), inventoryRevision: asOptInt(event.inventoryRevision ?? event.revision), equipmentRevision: asOptInt(event.equipmentRevision ?? event.revision ?? event.inventoryRevision), items }, event);
    },
    shim_ground_pile_snapshot(event) {
      const items = Array.isArray(event.items) ? event.items.map((item) => {
        const out = { displayName: asText(item.displayName || item.text), text: item.text == null ? undefined : asText(item.text), objectId: asOptInt(item.objectId), quantity: asOptInt(item.quantity), glyph: asOptInt(item.glyph), glyphChar: asOptInt(item.glyphChar), objectClass: item.objectClass == null ? undefined : asText(item.objectClass) };
        for (const key of ['semanticKind', 'semanticAppearance', 'semanticKnown']) withField(out, key, item[key]);
        if (item.semanticKnown !== false) withField(out, 'semanticName', item.semanticName);
        if (Array.isArray(item.actionAffordances)) out.actionAffordances = item.actionAffordances.filter((value) => typeof value === 'string');
        return out;
      }).filter((item) => item.displayName) : [];
      return copyPublicMetadata({ name: event.name, window: asOptInt(event.window), x: asInt(event.x), y: asInt(event.y), revision: asOptInt(event.revision), coord: event.coord && typeof event.coord === 'object' ? { x: asInt(event.coord.x), y: asInt(event.coord.y) } : { x: asInt(event.x), y: asInt(event.y) }, source: asText(event.source || 'level.objects'), authoritative: event.authoritative !== false, items }, event);
    },
    shim_container_contents_snapshot(event) {
      const items = Array.isArray(event.items) ? event.items.map((item) => {
        const out = { displayName: asText(item.displayName || item.text), text: item.text == null ? undefined : asText(item.text), objectId: asOptInt(item.objectId), quantity: asOptInt(item.quantity), glyph: asOptInt(item.glyph), glyphChar: asOptInt(item.glyphChar), objectClass: item.objectClass == null ? undefined : asText(item.objectClass) };
        for (const key of ['semanticKind', 'semanticAppearance', 'semanticKnown']) withField(out, key, item[key]);
        if (item.semanticKnown !== false) withField(out, 'semanticName', item.semanticName);
        if (Array.isArray(item.actionAffordances)) out.actionAffordances = item.actionAffordances.filter((value) => typeof value === 'string');
        return out;
      }).filter((item) => item.displayName) : [];
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
      raw: Object.freeze({ ...event }),
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
      catch (error) { errors.push(error.message || String(error)); }
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
  return Object.freeze({ version: protocolVersion, knownNames: Object.freeze(Array.from(knownNames).sort()), validators, parseLine, normalizeRawShimEvent, validateEvent });
}));
