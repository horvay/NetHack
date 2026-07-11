(function initMenuMetadataAdapter(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./interaction-model'), require('./ui-protocol-v2'));
  else root.NetHackMenuMetadataAdapter = factory(root.NetHackInteractionModel, root.NetHackUiProtocolV2);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(InteractionModel, UiProtocolV2) {
  const version = 'nethack-menu-metadata-adapter/v1';
  const defaultSourceLayer = 'v1-compat-adapter';

  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function text(value) { return value == null ? '' : String(value); }
  function safeIdPart(value) { return text(value).replace(/[^A-Za-z0-9_.:-]+/g, '-').replace(/^-|-$/g, '') || 'unknown'; }
  function cloneItems(items) { return Array.isArray(items) ? items.map((item) => ({ ...item })) : []; }
  function selectorText(selector) { return Number.isFinite(Number(selector)) && Number(selector) > 0 ? String.fromCharCode(Number(selector)) : undefined; }
  function selectableRows(menu) { return (menu?.items || []).filter((item) => item?.selector); }
  function selectionModeFromHow(how) {
    const n = Number(how || 0);
    if (n === 2) return 'many';
    if (n === 1) return 'one';
    return 'none';
  }
  function publicOwner(kind, extra = {}) { return { kind, ...extra }; }
  function normalizeOwner(value, fallback) {
    if (isPlainObject(value) && typeof value.kind === 'string' && value.kind.trim()) return { ...value };
    if (typeof value === 'string' && value.trim()) return { kind: value.trim() };
    return fallback;
  }
  function normalizeRequestSource(value, fallback = { layer: defaultSourceLayer }) {
    if (isPlainObject(value)) return { ...fallback, ...value };
    if (typeof value === 'string' && value.trim()) return { ...fallback, label: value.trim() };
    return { ...fallback };
  }
  function isAwaitingSelection(menu) { return Boolean(menu?.awaitingSelection) || Number(menu?.how || 0) > 0; }
  function isGroundLookMenu(menu) { return /things that are here|you see here|there (?:is|are) here/i.test(text(menu?.prompt)); }
  function isGroundPickupMenu(menu) {
    const prompt = text(menu?.prompt).trim();
    return selectableRows(menu).length > 0 && /^Pick(?:\s+\d+)?\s+(?:up\s+)?(?:of\s+)?what\?$/i.test(prompt);
  }
  function isContainerActionMenu(menu) {
    const prompt = text(menu?.prompt);
    const rows = (menu?.items || []).map((item) => text(item?.text)).join(' ');
    return isAwaitingSelection(menu)
      && /(?:Do what with|is empty\.\s*Do what with)/i.test(prompt)
      && /(?:look inside|take .* out|put .* in|stash .* into|do nothing|done)/i.test(rows);
  }
  function isContainerTakeOutMenu(menu) { return isAwaitingSelection(menu) && /^\s*Take out what\?/i.test(text(menu?.prompt)); }
  function isContainerPutInMenu(menu) { return isAwaitingSelection(menu) && /^\s*Put in what\?/i.test(text(menu?.prompt)); }
  function isContainerCategoryMenu(menu) {
    if (!isAwaitingSelection(menu)) return false;
    const prompt = text(menu?.prompt);
    const rows = (menu?.items || []).map((item) => text(item?.text)).join(' ');
    return /^(?:Take out|Put in).*(?:type|class|kind)|what type/i.test(prompt) || /\bAll types\b/i.test(rows);
  }
  function isPromptlessObjectMenu(menu) {
    const prompt = text(menu?.prompt).trim();
    const rows = selectableRows(menu);
    if (!rows.length || (prompt && !/^Menu$/i.test(prompt))) return false;
    return rows.every((item) => item.semanticKind === 'object' || /^[a-z$]\s+-\s+/i.test(text(item.text)));
  }
  function isInventoryOverviewMenu(menu, context = {}) {
    if (menu?.suppressPicker || isGroundLookMenu(menu)) return false;
    const prompt = text(menu?.prompt).trim();
    const kind = InteractionModel?.menuKind ? InteractionModel.menuKind(menu) : 'menu';
    if (kind === 'inventory' && /^(?:Inventory|Possessions):?$/i.test(prompt)) return true;
    if (prompt && !/^Menu$/i.test(prompt)) return false;
    if (context.lastWorldCommand !== 'i' && context.requestSource?.command !== 'inventory') return false;
    return isPromptlessObjectMenu(menu);
  }
  function isHelpLikeMenu(menu) {
    const prompt = text(menu?.prompt);
    const rows = (menu?.items || []).slice(0, 12).map((item) => text(item?.text)).join(' ');
    return /help|command|manual|option|wizard|conduct|license|about|version/i.test(`${prompt} ${rows}`);
  }
  function isStatusLikeMenu(menu) {
    const prompt = text(menu?.prompt);
    const rows = (menu?.items || []).slice(0, 12).map((item) => text(item?.text)).join(' ');
    return /status|attributes|characteristics|score|vanquished|conduct|inventory of possessions|final attributes/i.test(`${prompt} ${rows}`);
  }
  function isStartupLikeMenu(menu) {
    const prompt = text(menu?.prompt);
    const rows = (menu?.items || []).slice(0, 12).map((item) => text(item?.text)).join(' ');
    return /welcome to nethack|pick a role|choose.*character|shall i pick|new game/i.test(`${prompt} ${rows}`);
  }
  function classifyMenuPurpose(menu, context = {}) {
    const explicit = text((context.menuPurposeExplicit || menu?.menuPurposeExplicit) ? (menu?.menuPurpose || menu?.purpose) : undefined).trim();
    if (explicit) return explicit;
    if (isGroundPickupMenu(menu)) return 'ground.pickup';
    if (isGroundLookMenu(menu)) return 'ground.look';
    if (isContainerActionMenu(menu)) return 'container.action';
    if (isContainerTakeOutMenu(menu)) return 'container.takeOut';
    if (isContainerPutInMenu(menu)) return 'container.putIn';
    if (isContainerCategoryMenu(menu)) return 'container.category';
    if (isInventoryOverviewMenu(menu, context)) return 'inventory.overview';
    if (isStartupLikeMenu(menu)) return 'system.startup';
    if (isStatusLikeMenu(menu)) return 'system.status';
    if (isHelpLikeMenu(menu)) return 'system.help';
    const kind = InteractionModel?.menuKind ? InteractionModel.menuKind(menu) : 'menu';
    if (kind === 'inventory' && isAwaitingSelection(menu)) return 'action.choice';
    if (kind === 'inventory') return 'inventory.classic';
    if (kind === 'transfer') return 'transfer.classic';
    if (kind === 'spell') return 'spell.choice';
    if (kind === 'options') return 'options.choice';
    return 'menu.generic';
  }
  function ownerForPurpose(purpose, menu = {}) {
    if (/^container\./.test(purpose)) return publicOwner('container', { window: menu.window });
    if (/^ground\./.test(purpose)) return publicOwner('ground', { window: menu.window });
    if (/^inventory\./.test(purpose)) return publicOwner('inventory', { window: menu.window });
    if (/^action\./.test(purpose)) return publicOwner('action', { window: menu.window });
    if (/^(system|menu|spell|options)\./.test(purpose)) return publicOwner('system', { window: menu.window });
    return publicOwner('unknown', { window: menu.window });
  }
  function deriveV1MenuMetadata(menu, context = {}) {
    const windowId = menu?.window ?? context.window;
    const purpose = classifyMenuPurpose(menu, context);
    const revisionPart = menu?.lifecycleRevision || context.lifecycleRevision ? `-r${safeIdPart(menu?.lifecycleRevision || context.lifecycleRevision)}` : '';
    const menuId = text(menu?.menuId || menu?.menuRequestId || menu?.requestId || context.menuId || context.requestId).trim() || `v1-menu-${safeIdPart(windowId)}${revisionPart}`;
    const requestId = text(menu?.requestId || menu?.menuRequestId || context.requestId).trim() || menuId;
    const transactionId = text(menu?.transactionId || context.transactionId).trim() || `v1-transaction-${safeIdPart(requestId)}`;
    const selectionMode = text((context.selectionModeExplicit || menu?.selectionModeExplicit) ? menu?.selectionMode : undefined).trim() || selectionModeFromHow(context.how ?? menu?.how);
    const requestSource = normalizeRequestSource(menu?.requestSource || context.requestSource, { layer: defaultSourceLayer, window: Number.isFinite(Number(windowId)) ? Number(windowId) : undefined });
    const fallbackOwner = ownerForPurpose(purpose, { ...menu, window: windowId });
    const providedOwner = menu?.owner || context.owner;
    const owner = (providedOwner && menu?.purpose && menu.purpose !== purpose && !menu?.ownerExplicit && !context.owner) ? fallbackOwner : normalizeOwner(providedOwner, fallbackOwner);
    const explicitLifecycle = (context.lifecycleExplicit || menu?.lifecycleExplicit) ? (menu?.lifecycle || context.lifecycle) : undefined;
    const lifecycle = text(explicitLifecycle).trim() || (menu?.awaitingSelection && selectionMode !== 'none' ? 'selecting' : ((menu?.prompt || selectableRows(menu).length) ? 'ready' : 'opened'));
    const lifecycleRevision = Number.isFinite(Number(menu?.lifecycleRevision ?? context.lifecycleRevision)) ? Number(menu?.lifecycleRevision ?? context.lifecycleRevision) : undefined;
    return Object.freeze({ menuId, requestId, transactionId, purpose, menuPurpose: purpose, selectionMode, requestSource: Object.freeze(requestSource), owner: Object.freeze(owner), lifecycle, lifecycleRevision, source: Object.freeze({ layer: 'renderer', window: Number.isFinite(Number(windowId)) ? Number(windowId) : undefined }) });
  }
  function legacyHeuristicClassification(menu, context = {}) {
    const kind = InteractionModel?.menuKind ? InteractionModel.menuKind(menu) : 'menu';
    let purpose = 'menu.generic';
    if (isGroundPickupMenu(menu)) purpose = 'ground.pickup';
    else if (isGroundLookMenu(menu)) purpose = 'ground.look';
    else if (isContainerActionMenu(menu)) purpose = 'container.action';
    else if (isContainerTakeOutMenu(menu)) purpose = 'container.takeOut';
    else if (isContainerPutInMenu(menu)) purpose = 'container.putIn';
    else if (isContainerCategoryMenu(menu)) purpose = 'container.category';
    else if (isInventoryOverviewMenu(menu, context)) purpose = 'inventory.overview';
    else if (kind === 'inventory' && isAwaitingSelection(menu)) purpose = 'action.choice';
    else if (kind === 'inventory') purpose = 'inventory.classic';
    else if (kind === 'transfer') purpose = 'transfer.classic';
    else if (kind === 'spell') purpose = 'spell.choice';
    else if (kind === 'options') purpose = 'options.choice';
    else if (isStartupLikeMenu(menu)) purpose = 'system.startup';
    else if (isStatusLikeMenu(menu)) purpose = 'system.status';
    else if (isHelpLikeMenu(menu)) purpose = 'system.help';
    return Object.freeze({ kind, purpose, inventoryOverview: isInventoryOverviewMenu(menu, context), groundPickup: isGroundPickupMenu(menu), containerAction: isContainerActionMenu(menu), containerTakeOut: isContainerTakeOutMenu(menu), containerPutIn: isContainerPutInMenu(menu), containerCategory: isContainerCategoryMenu(menu) });
  }
  function compareMenuMetadata(menu, context = {}) {
    const metadata = deriveV1MenuMetadata(menu, context);
    const legacy = legacyHeuristicClassification(menu, context);
    const mismatch = metadata.purpose !== legacy.purpose;
    return Object.freeze({ menuId: metadata.menuId, requestId: metadata.requestId, oldHeuristicKind: legacy.kind, oldHeuristicPurpose: legacy.purpose, menuPurpose: metadata.purpose, mismatch, metadata, legacy });
  }
  function makeEnvelope(eventType, payload, options = {}) {
    const sequence = Number.isSafeInteger(options.sequence) ? options.sequence : 0;
    return {
      protocol: UiProtocolV2?.protocol || 'nethack-electron-ui/v2',
      sequence,
      eventId: options.eventId || `evt-${eventType.replace(/\./g, '-')}-${sequence}`,
      eventType,
      turn: Number.isFinite(Number(options.turn)) ? Number(options.turn) : 0,
      source: options.source || payload.source || { layer: 'renderer' },
      requestId: options.requestId || payload.requestId,
      transactionId: options.transactionId || payload.transactionId,
      payload,
    };
  }
  function adaptV1MenuSnapshotToV2Events(menu, options = {}) {
    const metadata = deriveV1MenuMetadata(menu, options);
    let sequence = Number.isSafeInteger(options.sequenceStart) ? options.sequenceStart : 0;
    const base = { turn: options.turn || 0, requestId: metadata.requestId, transactionId: metadata.transactionId, source: metadata.source };
    const commonPayload = { menuId: metadata.menuId, menuPurpose: metadata.purpose, owner: metadata.owner, selectionMode: metadata.selectionMode, requestSource: metadata.requestSource };
    const events = [makeEnvelope('menu.opened', { ...commonPayload }, { ...base, sequence: sequence++ })];
    cloneItems(menu?.items).forEach((item, index) => {
      const publicItem = { selector: selectorText(item.selector), text: text(item.text), index };
      if (item.semanticKind) publicItem.semanticKind = item.semanticKind;
      if (item.semanticAppearance) publicItem.semanticAppearance = item.semanticAppearance;
      if (typeof item.semanticKnown === 'boolean') publicItem.semanticKnown = item.semanticKnown;
      if (item.semanticKnown === true && item.semanticName) publicItem.semanticName = item.semanticName;
      events.push(makeEnvelope('menu.item', { menuId: metadata.menuId, item: publicItem }, { ...base, sequence: sequence++ }));
    });
    events.push(makeEnvelope('menu.ready', { ...commonPayload, prompt: text(menu?.prompt) }, { ...base, sequence: sequence++ }));
    if (metadata.selectionMode !== 'none' || menu?.awaitingSelection) events.push(makeEnvelope('menu.selecting', { ...commonPayload, prompt: text(menu?.prompt) }, { ...base, sequence: sequence++ }));
    return Object.freeze(events);
  }
  function adaptV1MenuClosedToV2Event(menuOrEvent, options = {}) {
    const metadata = deriveV1MenuMetadata(menuOrEvent, options);
    return makeEnvelope('menu.closed', { menuId: metadata.menuId, reason: options.reason || 'v1-menu-answer' }, { turn: options.turn || 0, sequence: Number.isSafeInteger(options.sequence) ? options.sequence : 0, requestId: metadata.requestId, transactionId: metadata.transactionId, source: metadata.source });
  }
  function classifyPromptPurpose(promptOrEvent = {}) {
    const query = text(promptOrEvent.query || promptOrEvent.message);
    const choices = text(promptOrEvent.choices);
    if (text(promptOrEvent.promptPurpose).trim()) return text(promptOrEvent.promptPurpose).trim();
    if (promptOrEvent.name === 'bridge_direction_prompt' || InteractionModel?.isDirectionPrompt?.(query)) return 'prompt.direction';
    if (promptOrEvent.name === 'shim_get_ext_cmd' || promptOrEvent.name === 'bridge_extcmd_catalog') return 'prompt.extendedCommand';
    if (promptOrEvent.name === 'shim_getlin') return 'prompt.lineInput';
    if (/(?:ring-finger|which\s+(?:ring-)?finger|right\s+or\s+left)/i.test(query) && /[lr]/i.test(choices)) return 'prompt.equipmentRingFinger';
    if (InteractionModel?.isItemClassPrompt?.(query, choices)) return 'prompt.itemClass';
    if (InteractionModel?.isInventoryActionPrompt?.(query, choices)) return 'prompt.itemAction';
    if (/\?/.test(query) && choices) return 'prompt.question';
    return 'prompt.generic';
  }
  function deriveV1PromptMetadata(promptOrEvent = {}, context = {}) {
    const promptType = text(promptOrEvent.promptType).trim() || classifyPromptPurpose(promptOrEvent).replace(/^prompt\./, '');
    const lifecycleRevision = Number.isFinite(Number(promptOrEvent.lifecycleRevision ?? context.lifecycleRevision)) ? Number(promptOrEvent.lifecycleRevision ?? context.lifecycleRevision) : undefined;
    const revisionPart = lifecycleRevision != null ? `-r${safeIdPart(lifecycleRevision)}` : '';
    const promptId = text(promptOrEvent.promptId || context.promptId || context.requestId).trim() || `v1-prompt-${safeIdPart(promptOrEvent.name || promptType)}-${safeIdPart(text(promptOrEvent.query || promptOrEvent.message).slice(0, 24))}${revisionPart}`;
    const requestId = text(promptOrEvent.requestId || context.requestId).trim() || promptId;
    const transactionId = text(promptOrEvent.transactionId || context.transactionId).trim() || `v1-transaction-${safeIdPart(requestId)}`;
    const purpose = classifyPromptPurpose(promptOrEvent);
    const fallbackOwner = purpose === 'prompt.extendedCommand' ? publicOwner('system') : (/^prompt\.equipment/.test(purpose) ? publicOwner('equipment') : publicOwner('action'));
    const owner = normalizeOwner(promptOrEvent.owner || context.owner, fallbackOwner);
    const requestSource = normalizeRequestSource(promptOrEvent.requestSource || context.requestSource, { layer: defaultSourceLayer });
    const lifecycle = text(promptOrEvent.lifecycle || context.lifecycle).trim() || 'opened';
    return Object.freeze({ promptId, requestId, transactionId, promptType, promptPurpose: purpose, owner: Object.freeze(owner), requestSource: Object.freeze(requestSource), lifecycle, lifecycleRevision });
  }
  function adaptV1PromptToV2Event(promptOrEvent = {}, options = {}) {
    const metadata = deriveV1PromptMetadata(promptOrEvent, options);
    return makeEnvelope('prompt.opened', {
      promptId: metadata.promptId,
      promptType: metadata.promptType,
      promptPurpose: metadata.promptPurpose,
      message: text(promptOrEvent.query || promptOrEvent.message || 'Choose an answer.'),
      choices: text(promptOrEvent.choices).split('').filter(Boolean),
      owner: metadata.owner,
      requestSource: metadata.requestSource,
    }, { turn: options.turn || 0, sequence: Number.isSafeInteger(options.sequence) ? options.sequence : 0, requestId: metadata.requestId, transactionId: metadata.transactionId, source: { layer: 'renderer' } });
  }
  return Object.freeze({
    version,
    selectionModeFromHow,
    classifyMenuPurpose,
    deriveV1MenuMetadata,
    legacyHeuristicClassification,
    compareMenuMetadata,
    adaptV1MenuSnapshotToV2Events,
    adaptV1MenuClosedToV2Event,
    classifyPromptPurpose,
    deriveV1PromptMetadata,
    adaptV1PromptToV2Event,
  });
}));
