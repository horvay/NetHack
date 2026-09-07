(function initCommandGateway(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./public-item-knowledge'), require('./ui-protocol-v2'));
  else root.NetHackCommandGateway = factory(root.NetHackPublicItemKnowledge, root.NetHackUiProtocolV2);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(PublicItemKnowledge = {}, UiProtocolV2 = {}) {
  function supportedPlayableKey(key) {
    const text = String(key || '');
    if (text.length !== 1) return false;
    const code = text.charCodeAt(0);
    if (code < 1 || code > 126) return false;
    return true;
  }

  function normalizeShimKey(key) {
    const text = String(key || '');
    return supportedPlayableKey(text) ? text : '';
  }

  function shouldSuppressDuplicateKey(previous, key, now = Date.now(), windowMs = 120) {
    return Boolean(previous && previous.key === key && now - Number(previous.at || 0) < windowMs);
  }

  function normalizeTextInput(text) {
    return String(text || '').split('').filter(supportedPlayableKey).join('');
  }

  const v2Protocol = 'nethack-electron-ui/v2';
  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function isNonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }
  function isPositiveInteger(value) { return Number.isInteger(value) && Number.isFinite(value) && value > 0; }
  function isNonNegativeInteger(value) { return Number.isInteger(value) && Number.isFinite(value) && value >= 0; }
  function directArray(values) { return Object.freeze(values.slice()); }
  const directCommandSpecs = Object.freeze({
    'ground.transfer': Object.freeze({ bridgeType: 'ground-transfer', implementedRoute: true, requireExpectedRevision: false, requiredPayload: directArray(['transferId', 'direction', 'coord', 'itemId', 'count']), allowedPayload: directArray(['transferId', 'direction', 'coord', 'itemId', 'count']), objectIdFields: directArray(['itemId']), coordFields: directArray(['coord']), countFields: directArray(['count']), enumFields: Object.freeze({ direction: directArray(['ground-to-inventory', 'inventory-to-ground']) }), revisionKeys: directArray(['ground', 'inventory']), changesSnapshots: directArray(['ground', 'inventory', 'status']) }),
    'equipment.change': Object.freeze({ bridgeType: 'equipment-change', implementedRoute: true, requiredPayload: directArray(['action']), allowedPayload: directArray(['action', 'itemId', 'slotId', 'hand']), objectIdFields: directArray(['itemId']), enumFields: Object.freeze({ action: directArray(['takeOff', 'removeAccessory', 'wieldMain', 'quiver', 'clearQuiver', 'putOnRing', 'wearArmor']), hand: directArray(['left', 'right']), slotId: directArray(['mainHand', 'offHand', 'quiver', 'armor.body', 'armor.cloak', 'armor.shirt', 'armor.helm', 'armor.gloves', 'armor.boots', 'armor.shield', 'amulet', 'ring.left', 'ring.right', 'eyes']) }), revisionKeys: directArray(['inventory', 'equipment']), changesSnapshots: directArray(['inventory', 'equipment', 'status']) }),
    'container.transfer': Object.freeze({ bridgeType: 'container-transfer', implementedRoute: true, requireExpectedRevision: false, zeroRevisionIsUnknown: true, requiredPayload: directArray(['direction', 'transferId', 'sessionId', 'containerId', 'itemId']), allowedPayload: directArray(['direction', 'transferId', 'sessionId', 'containerId', 'itemId', 'item']), objectIdFields: directArray(['containerId', 'itemId']), enumFields: Object.freeze({ direction: directArray(['container-to-inventory', 'inventory-to-container']) }), allowActiveOwnerKinds: directArray(['transfer']), revisionKeys: directArray(['container']), changesSnapshots: directArray(['container', 'inventory', 'status']) }),
    'container.snapshot': Object.freeze({ bridgeType: 'container-snapshot', implementedRoute: true, requireExpectedRevision: false, requiredPayload: directArray(['sessionId', 'containerId']), allowedPayload: directArray(['sessionId', 'containerId']), objectIdFields: directArray(['containerId']), allowActiveOwnerKinds: directArray(['transfer']), revisionKeys: directArray([]), changesSnapshots: directArray(['container']) }),
    'container.force': Object.freeze({ bridgeType: 'container-force', implementedRoute: false, requiredPayload: directArray(['containerId', 'coord', 'confirmDestructive']), allowedPayload: directArray(['containerId', 'coord', 'toolOrWeaponId', 'confirmDestructive']), objectIdFields: directArray(['containerId', 'toolOrWeaponId']), coordFields: directArray(['coord']), booleanFields: directArray(['confirmDestructive']), revisionKeys: directArray(['ground', 'inventory']), changesSnapshots: directArray(['ground', 'container', 'map', 'status']) }),
    'container.tip': Object.freeze({ bridgeType: 'container-tip', implementedRoute: false, requiredPayload: directArray(['containerId', 'coord', 'confirmDestructive']), allowedPayload: directArray(['containerId', 'coord', 'confirmDestructive']), objectIdFields: directArray(['containerId']), coordFields: directArray(['coord']), booleanFields: directArray(['confirmDestructive']), revisionKeys: directArray(['ground', 'inventory']), changesSnapshots: directArray(['ground', 'container', 'status']) }),
    'container.untrap': Object.freeze({ bridgeType: 'container-untrap', implementedRoute: false, requiredPayload: directArray(['containerId', 'coord']), allowedPayload: directArray(['containerId', 'coord']), objectIdFields: directArray(['containerId']), coordFields: directArray(['coord']), revisionKeys: directArray(['ground', 'inventory']), changesSnapshots: directArray(['ground', 'container', 'status']) }),
    'container.unlock': Object.freeze({ bridgeType: 'container-unlock', implementedRoute: false, requiredPayload: directArray(['containerId', 'coord', 'toolId', 'intent']), allowedPayload: directArray(['containerId', 'coord', 'toolId', 'intent']), objectIdFields: directArray(['containerId', 'toolId']), coordFields: directArray(['coord']), enumFields: Object.freeze({ intent: directArray(['lock', 'unlock']) }), revisionKeys: directArray(['ground', 'inventory']), changesSnapshots: directArray(['ground', 'container', 'status']) }),
    'item.use': Object.freeze({ bridgeType: 'item-use', implementedRoute: false, requiredPayload: directArray(['action', 'itemId']), allowedPayload: directArray(['action', 'itemId', 'count', 'followupPolicy']), objectIdFields: directArray(['itemId']), countFields: directArray(['count']), enumFields: Object.freeze({ action: directArray(['rub']), followupPolicy: directArray(['visible-netHack-owned', 'request-scoped-target']) }), revisionKeys: directArray(['inventory']), changesSnapshots: directArray(['inventory', 'equipment', 'map', 'status']) }),
    'terrain.action': Object.freeze({ bridgeType: 'terrain-action', implementedRoute: true, requiredPayload: directArray(['action', 'coord', 'terrain']), allowedPayload: directArray(['action', 'coord', 'terrain', 'itemId']), objectIdFields: directArray(['itemId']), coordFields: directArray(['coord']), enumFields: Object.freeze({ action: directArray(['stairsDown', 'stairsUp', 'ladderUp', 'drink', 'dip']), terrain: directArray(['stairs.down', 'stairs.up', 'ladder.up', 'fountain']) }), revisionKeys: directArray(['map', 'inventory']), changesSnapshots: directArray(['map', 'status', 'ground', 'inventory']) }),
    'altar.action': Object.freeze({ bridgeType: 'altar-action', implementedRoute: false, requiredPayload: directArray(['action', 'coord']), allowedPayload: directArray(['action', 'coord', 'itemId', 'confirmDestructive']), objectIdFields: directArray(['itemId']), coordFields: directArray(['coord']), booleanFields: directArray(['confirmDestructive']), enumFields: Object.freeze({ action: directArray(['offer', 'dropIdentify']) }), revisionKeys: directArray(['map', 'inventory', 'ground']), changesSnapshots: directArray(['inventory', 'ground', 'map', 'status']) }),
    'target.answer': Object.freeze({ bridgeType: 'target-answer', implementedRoute: false, requiredPayload: directArray(['targetRequestId', 'coord']), allowedPayload: directArray(['targetRequestId', 'coord']), coordFields: directArray(['coord']), requestIdField: 'targetRequestId', allowActiveOwnerKinds: directArray(['target', 'prompt']), revisionKeys: directArray(['map']), changesSnapshots: directArray([]) }),
  });
  const commandPlanningSpecs = Object.freeze({
    'action.execute': Object.freeze({ family: 'action', bridgeType: 'ui-command', implementedRoute: true }),
    'command.cancel': Object.freeze({ family: 'lifecycle', bridgeType: null, implementedRoute: false }),
    'prompt.answer': Object.freeze({ family: 'owned-input', bridgeType: null, implementedRoute: false }),
    'menu.select': Object.freeze({ family: 'owned-input', bridgeType: null, implementedRoute: false }),
    'replay.control': Object.freeze({ family: 'replay', bridgeType: null, implementedRoute: false }),
    ...directCommandSpecs,
  });
  const safeActionRoutes = Object.freeze({
    'item.quaff': { pattern: /^q.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.read.scroll': { pattern: /^r.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.study': { pattern: /^r.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.read.inscription': { pattern: /^r.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.eat': { pattern: /^e.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.drop': { pattern: /^d.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.apply': { pattern: /^a.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.lootOrApply': { pattern: /^a.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.zap': { pattern: /^z.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.throw': { pattern: /^t.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.engraveWith': { pattern: /^E.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.offer': { pattern: /^O.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.pay': { pattern: /^p.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.invoke': { pattern: /^V.$/, selectorIndex: 1, revisions: ['inventory'] },
    'item.rub': { pattern: /^#rub\n.$/, selectorIndex: 5, revisions: ['inventory'], targetLocation: 'inventory', promptPolicy: 'netHack-owned-followup', requireSelectorTarget: true },
    'item.wear': { pattern: /^W.$/, selectorIndex: 1, revisions: ['inventory', 'equipment'] },
    'item.takeOff': { pattern: /^T.$/, selectorIndex: 1, revisions: ['inventory', 'equipment'] },
    'item.remove.accessory': { pattern: /^R.$/, selectorIndex: 1, revisions: ['inventory', 'equipment'] },
    'item.wield.mainHand': { pattern: /^w.$/, selectorIndex: 1, revisions: ['inventory', 'equipment'] },
    'item.wield.hold': { pattern: /^w.$/, selectorIndex: 1, revisions: ['inventory', 'equipment'] },
    'item.quiver': { pattern: /^Q.$/, selectorIndex: 1, revisions: ['inventory', 'equipment'] },
    'slot.clear.quiver': { pattern: /^Q.$/, selectorIndex: 1, revisions: ['inventory', 'equipment'] },
    'slot.clear.mainHand': { pattern: /^w.$/, selectorIndex: 1, revisions: ['inventory', 'equipment'] },
    'item.putOn.ring': { pattern: /^P.[lr]?$/, selectorIndex: 1, revisions: ['inventory', 'equipment'] },
    'item.putOn.accessory': { pattern: /^P.$/, selectorIndex: 1, revisions: ['inventory', 'equipment'] },
    'item.putOn.eyes': { pattern: /^P.$/, selectorIndex: 1, revisions: ['inventory', 'equipment'] },
    'slot.swapMainAlternate': { pattern: /^x$/, selectorIndex: -1, revisions: ['equipment'] },
    'ground.openContainer': { pattern: /^#loot\n$/, selectorIndex: -1, revisions: ['ground'], targetLocation: 'ground', promptPolicy: 'netHack-owned-followup', requireCurrentGroundTarget: true },
    'ground.tipContainer': { pattern: /^#tip\n$/, selectorIndex: -1, revisions: ['ground'], targetLocation: 'ground', promptPolicy: 'netHack-owned-followup', requireCurrentGroundTarget: true },
    'ground.forceContainer': { pattern: /^#force\n$/, selectorIndex: -1, revisions: ['ground'], targetLocation: 'ground', promptPolicy: 'netHack-owned-followup', requireCurrentGroundTarget: true },
    'ground.dipIntoTerrain': { pattern: /^$/, selectorIndex: -1, revisions: ['ground'], targetLocation: 'ground', promptPolicy: 'netHack-owned-followup', targetDisplayPattern: /\b(?:fountain|sink|water|pool|moat|lava)\b/i },
    'ground.untrapContainer': { pattern: /^#untrap\n$/, selectorIndex: -1, revisions: ['ground'], targetLocation: 'ground', promptPolicy: 'netHack-owned-followup', requireCurrentGroundTarget: true },
  });

  function publicSelectorFrom(value) {
    if (typeof value === 'number' && value > 0 && value < 127) return String.fromCharCode(value);
    const text = String(value || '');
    return text.length === 1 && supportedPlayableKey(text) ? text : '';
  }

  function routeKeysFromPayload(payload = {}) {
    const route = payload.route && typeof payload.route === 'object' ? payload.route : {};
    return String(route.command || route.keys || payload.commandKeys || payload.keys || '');
  }

  function targetSelectorFromPayload(payload = {}, command = '') {
    const route = payload.route && typeof payload.route === 'object' ? payload.route : {};
    const target = payload.target && typeof payload.target === 'object' ? payload.target : {};
    const item = payload.item && typeof payload.item === 'object' ? payload.item : {};
    return publicSelectorFrom(route.selector)
      || publicSelectorFrom(payload.selector)
      || publicSelectorFrom(target.selector)
      || publicSelectorFrom(target.inventoryLetter)
      || publicSelectorFrom(item.selector)
      || publicSelectorFrom(item.inventoryLetter)
      || publicSelectorFrom(command?.targets?.selector)
      || publicSelectorFrom(command?.targets?.inventoryLetter);
  }

  function actionIdFromCommand(command = {}) {
    return String(command.actionId || command.payload?.actionId || command.payload?.route?.actionId || '').trim();
  }

  function firstTargetObject(value) {
    if (Array.isArray(value)) return value.find((entry) => entry && typeof entry === 'object') || {};
    return value && typeof value === 'object' ? value : {};
  }

  function targetLocationKindFromPayload(payload = {}, command = {}) {
    const target = firstTargetObject(payload.target || command.targets);
    return String(target.location?.kind || '').trim();
  }

  function defaultPromptPolicyForRoute(actionId, route = {}) {
    const rule = safeActionRoutes[actionId];
    if (rule?.promptPolicy) return rule.promptPolicy;
    if (route?.autoAnswerHand === true || route?.targetRingHand || route?.ringHand) return 'electron-owned-public-answer';
    return 'no-followup';
  }

  function expectedRevisionForRoute(actionId, expectedRevision) {
    if (!expectedRevision || typeof expectedRevision !== 'object') return undefined;
    const rule = safeActionRoutes[actionId];
    if (!rule?.revisions?.length) return undefined;
    const out = {};
    for (const key of rule.revisions) {
      const value = expectedRevision[key];
      if (Number.isInteger(value) && value >= 0) out[key] = value;
    }
    return Object.keys(out).length ? out : undefined;
  }

  function sanitizeActionTarget(value) {
    if (Array.isArray(value)) return value.map(sanitizeActionTarget).filter(Boolean);
    if (!isPlainObject(value)) return undefined;
    const out = {};
    for (const key of ['selector', 'inventoryLetter', 'objectId', 'slotId']) if (value[key] != null) out[key] = value[key];
    if (isPlainObject(value.location) && value.location.kind) out.location = { kind: value.location.kind };
    if (value.displayName != null || PublicItemKnowledge.isPublicItemLike(value)) {
      out.displayName = PublicItemKnowledge.publicLabel(value, { neutral: 'item' });
      out.semanticKnown = PublicItemKnowledge.identityIsPublic(value);
      out.known = { ...PublicItemKnowledge.publicKnownFlags(value) };
      const appearance = PublicItemKnowledge.explicitAppearance(value);
      if (appearance) out.semanticAppearance = appearance;
    }
    return Object.keys(out).length ? out : undefined;
  }

  function createActionExecuteCommand({ commandId, transactionId, actionId, action, item, route, expectedRevision, source, surface, target, payload } = {}) {
    const publicPayload = payload && typeof payload === 'object' ? payload : {};
    const itemSource = item && typeof item === 'object' ? item : publicPayload.item;
    const resolvedActionId = String(actionId || route?.actionId || action?.id || action?.actionId || '').trim();
    const publicItemDisplayName = itemSource && typeof itemSource === 'object' && PublicItemKnowledge.isPublicItemLike(itemSource)
      ? PublicItemKnowledge.publicLabel(itemSource, { neutral: 'item' })
      : '';
    const selector = targetSelectorFromPayload({ route, item: itemSource, target: target || publicPayload.target, selector: route?.selector }, {});
    const publicTarget = sanitizeActionTarget(target || publicPayload.target || (selector ? { selector } : undefined));
    const promptPolicy = publicPayload.promptPolicy || route?.promptPolicy || action?.promptPolicy || defaultPromptPolicyForRoute(resolvedActionId, route);
    return {
      protocol: v2Protocol,
      commandId: String(commandId || transactionId || `action-execute-${Date.now?.() || 0}`).slice(0, 96),
      commandType: 'action.execute',
      transactionId: transactionId ? String(transactionId).slice(0, 96) : undefined,
      actionId: resolvedActionId,
      expectedRevision: expectedRevisionForRoute(resolvedActionId, expectedRevision),
      targets: publicTarget,
      payload: {
        ...(typeof publicPayload.expectedRequestId === 'string' ? { expectedRequestId: publicPayload.expectedRequestId } : {}),
        ...(typeof publicPayload.publicGroundEvidence === 'string' ? { publicGroundEvidence: publicPayload.publicGroundEvidence } : {}),
        actionId: resolvedActionId,
        label: String(route?.label || action?.label || resolvedActionId || '').replace(/…/g, '').trim(),
        surface: String(surface || source || action?.source || '').trim() || undefined,
        selector: selector || undefined,
        target: publicTarget || undefined,
        item: itemSource && typeof itemSource === 'object' && publicItemDisplayName ? {
          objectId: Number.isInteger(itemSource.objectId) && itemSource.objectId >= 0 ? itemSource.objectId : undefined,
          inventoryLetter: publicSelectorFrom(itemSource.inventoryLetter || itemSource.key || itemSource.selector) || undefined,
          displayName: publicItemDisplayName,
          semanticKnown: PublicItemKnowledge.identityIsPublic(itemSource),
          known: { ...PublicItemKnowledge.publicKnownFlags(itemSource) },
          ...(PublicItemKnowledge.explicitAppearance(itemSource) ? { semanticAppearance: PublicItemKnowledge.explicitAppearance(itemSource) } : {}),
          quantity: Number.isInteger(itemSource.quantity) && itemSource.quantity >= 0 ? itemSource.quantity : undefined,
          actionAffordances: resolvedActionId === 'item.rub' ? undefined : (Array.isArray(itemSource.actionAffordances) ? itemSource.actionAffordances.map(String) : undefined),
        } : undefined,
        route: route && typeof route === 'object' ? {
          actionId: resolvedActionId,
          label: String(route.label || action?.label || resolvedActionId || '').replace(/…/g, '').trim(),
          command: String(route.command || route.keys || action?.execution?.keys || ''),
          selector: selector || undefined,
          targetRingHand: route.targetRingHand || route.ringHand || undefined,
          autoAnswerHand: route.autoAnswerHand === true || undefined,
        } : { actionId: resolvedActionId, command: String(action?.execution?.keys || '') },
        promptPolicy,
      },
    };
  }

  function revisionValue(context = {}, key) {
    const value = context[`${key}Revision`] ?? context.revisions?.[key];
    return Number.isInteger(value) && value >= 0 ? value : undefined;
  }

  function cleanDisplayName(value) {
    return String(value || '')
      .replace(/^\s*[a-z$]\s*[-+]\s+/, '')
      .replace(/\s+\((?:being worn|weapon in (?:right|left) hand|in quiver|on (?:left|right) hand)\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function activeInputOwnerToken(owner) {
    const kind = String(owner?.kind || owner || '').toLowerCase();
    if (kind.includes('transfer')) return 'blocked.input.transferActive';
    if (kind.includes('menu')) return 'blocked.input.menuActive';
    return 'blocked.input.promptActive';
  }

  function rejection(details = {}, context = {}) {
    const reason = String(details.reason || 'v2 action execution rejected');
    const blockerToken = details.blockerToken
      || (details.kind === 'active-owner' ? activeInputOwnerToken(context.activeInputOwner) : '')
      || context.uiProtocol?.commandBlockerTokenForReason?.(reason, { ...details, activeInputOwner: context.activeInputOwner })
      || 'blocked.input.malformedCommand';
    const activeInputOwner = details.kind === 'active-owner' && context.activeInputOwner
      ? {
        kind: String(context.activeInputOwner.kind || context.activeInputOwner || ''),
        requestId: String(context.activeInputOwner.requestId || context.activeInputOwner.targetRequestId || ''),
        transactionId: String(context.activeInputOwner.transactionId || ''),
        label: String(context.activeInputOwner.label || ''),
        lifecycle: String(context.activeInputOwner.lifecycle || ''),
        source: String(context.activeInputOwner.source || ''),
        ...(context.activeInputOwner.window != null ? { window: context.activeInputOwner.window } : {}),
      }
      : undefined;
    return { ok: false, ...details, reason, blockerToken, ...(activeInputOwner ? { activeInputOwner } : {}) };
  }

  function own(value, key) { return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)); }
  function actionTargetObjects(command = {}, payload = {}) {
    const targets = Array.isArray(command.targets) ? command.targets : [command.targets];
    return [payload.item, payload.target, ...targets].filter((value) => isPlainObject(value));
  }
  function exactClaimedObjectId(command = {}, payload = {}) {
    const claims = actionTargetObjects(command, payload).filter((value) => own(value, 'objectId') && value.objectId !== undefined).map((value) => value.objectId);
    if (!claims.length) return { claimed: false, valid: true, objectId: undefined };
    if (claims.some((value) => !isPositiveInteger(value)) || claims.some((value) => value !== claims[0])) return { claimed: true, valid: false, objectId: undefined };
    return { claimed: true, valid: true, objectId: claims[0] };
  }
  function exactSelectorClaim(command = {}, payload = {}) {
    const candidates = [payload.route?.selector, payload.selector, payload.target?.selector, payload.target?.inventoryLetter, payload.item?.selector, payload.item?.inventoryLetter, command.targets?.selector, command.targets?.inventoryLetter]
      .filter((value) => value != null && value !== '')
      .map(publicSelectorFrom);
    return candidates.length && candidates.every((selector) => selector && selector === candidates[0]) ? candidates[0] : '';
  }
  function equalStringSet(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return JSON.stringify(Array.from(new Set(left.map(String))).sort()) === JSON.stringify(Array.from(new Set(right.map(String))).sort());
  }
  function publicItemFingerprintMatches(expected = {}, current = {}) {
    const expectedName = cleanDisplayName(expected.displayName || expected.text || expected.name);
    const currentName = cleanDisplayName(current.displayName || current.text || current.name);
    if (!expectedName || !currentName || expectedName !== currentName) return false;
    for (const key of ['quantity', 'semanticKind', 'semanticName', 'semanticAppearance', 'semanticKnown', 'publicClass']) {
      if (own(expected, key) && expected[key] !== undefined && (!own(current, key) || expected[key] !== current[key])) return false;
    }
    if (own(expected, 'known')) {
      if (!isPlainObject(expected.known) || !isPlainObject(current.known)) return false;
      for (const [key, value] of Object.entries(expected.known)) if (!own(current.known, key) || current.known[key] !== value) return false;
    }
    if (own(expected, 'actionAffordances') && !equalStringSet(expected.actionAffordances, current.actionAffordances)) return false;
    return true;
  }
  function inventoryTargetStillMatches(command = {}, payload = {}, context = {}) {
    const selector = exactSelectorClaim(command, payload);
    const rows = context.inventoryItems;
    if (!selector || !Array.isArray(rows)) return false;
    const commandObject = exactClaimedObjectId(command, payload);
    if (!commandObject.valid) return false;
    const positiveIds = rows.filter((item) => isPositiveInteger(item?.objectId)).map((item) => item.objectId);
    if (new Set(positiveIds).size !== positiveIds.length) return false;
    const selectorRows = rows.filter((item) => publicSelectorFrom(item?.inventoryLetter || item?.key || item?.selector) === selector);
    if (selectorRows.length !== 1) return false;
    const current = selectorRows[0];
    const currentClaimsId = own(current, 'objectId') && current.objectId !== undefined;
    const currentObjectIdValid = isPositiveInteger(current.objectId);
    if (commandObject.claimed || currentClaimsId) {
      if (!commandObject.claimed || !commandObject.valid || !currentClaimsId || !currentObjectIdValid || commandObject.objectId !== current.objectId) return false;
    }
    const expected = isPlainObject(payload.item) ? payload.item : (isPlainObject(payload.target) ? payload.target : firstTargetObject(command.targets));
    return publicItemFingerprintMatches(expected, current);
  }

  function comparableGroundDisplayName(value) {
    return cleanDisplayName(value)
      .replace(/\s+containing\s+\d+\s+items?$/i, '')
      .replace(/^\s*(?:a|an|the|some)\s+/i, '')
      .replace(/^(?:(?:trapped|locked|unlocked|closed|open|broken|empty)\s+)+/i, '')
      .replace(/^bag$/i, 'sack')
      .trim();
  }

  function cleanGroundRowDisplayName(row = {}) {
    const raw = String(row.displayName || row.text || row.name || row || '')
      .replace(/^\s*(?:you see here|there (?:is|are) here|things? that are here)[:\s]*/i, '')
      .replace(/[.!?]+$/g, '')
      .trim();
    return comparableGroundDisplayName(raw);
  }

  function comparableGroundDisplayNames(value) {
    return String(value || '')
      .split(/\s*,\s*/)
      .map(comparableGroundDisplayName)
      .filter(Boolean);
  }

  function groundTargetStillMatches(command = {}, payload = {}, context = {}) {
    const target = firstTargetObject(payload.target || command.targets);
    const expectedNames = comparableGroundDisplayNames(target.displayName || payload.targetText);
    const rows = Array.isArray(context.groundItems) ? context.groundItems : [];
    if (!expectedNames.length) return false;
    return rows.some((row) => expectedNames.includes(cleanGroundRowDisplayName(row)));
  }

  function contextWithCommandGroundEvidence(command = {}, context = {}) {
    const actionId = actionIdFromCommand(command);
    const payload = isPlainObject(command.payload) ? command.payload : {};
    const target = firstTargetObject(payload.target || command.targets);
    const targetDisplayName = String(target.displayName || payload.targetText || '').trim();
    if (!actionId.startsWith('ground.')
      || payload.publicGroundEvidence !== 'visible-current-square-container'
      || target.location?.kind !== 'ground'
      || !targetDisplayName
      || !Array.isArray(context.groundItems)) return context;
    const commandEvidence = targetDisplayName
      .split(/\s*,\s*/)
      .filter(Boolean)
      .map((displayName) => ({ displayName, location: { kind: 'ground' }, source: 'command-public-ground-target' }));
    return { ...context, groundItems: [...context.groundItems, ...commandEvidence] };
  }


  const forbiddenDirectPublicKeys = Object.freeze(['locked', 'trapped', 'broken', 'contents', 'buc', 'cursed', 'blessed', 'charges', 'otyp', 'spe', 'trueName', 'baseType', 'objectType', 'objectPointer', 'chainPointer', 'monsterId', 'monsterInternalId']);

  function collectForbiddenPublicKeys(value, path = 'payload', found = []) {
    if (!value || typeof value !== 'object') return found;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => collectForbiddenPublicKeys(entry, `${path}[${index}]`, found));
      return found;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (forbiddenDirectPublicKeys.includes(key)) found.push(`${path}.${key}`);
      collectForbiddenPublicKeys(nested, `${path}.${key}`, found);
    }
    return found;
  }

  function validatePublicObjectId(value, path, errors) {
    if (!isPositiveInteger(value)) errors.push(`${path}: must be a positive public objectId`);
  }

  function validatePublicCoord(value, path, errors) {
    if (!isPlainObject(value)) { errors.push(`${path}: must be an object with public x/y coordinates`); return; }
    const allowed = new Set(['x', 'y']);
    for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key}: is not an allowed public coordinate field`);
    if (!isNonNegativeInteger(value.x)) errors.push(`${path}.x: must be a non-negative integer`);
    if (!isNonNegativeInteger(value.y)) errors.push(`${path}.y: must be a non-negative integer`);
  }

  function validateCount(value, path, errors) {
    if (value !== 'all' && !isPositiveInteger(value)) errors.push(`${path}: must be "all" or a positive integer`);
  }

  function validateEnumField(value, path, allowed, errors) {
    if (!isNonEmptyString(value) || !allowed.includes(value)) errors.push(`${path}: must be one of ${allowed.join(', ')}`);
  }

  function validateExpectedRevisionShape(expectedRevision, errors) {
    if (expectedRevision == null) return;
    if (!isPlainObject(expectedRevision)) { errors.push('expectedRevision: must be an object when present'); return; }
    for (const [key, value] of Object.entries(expectedRevision)) {
      if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key)) errors.push(`expectedRevision.${key}: revision key must be an identifier`);
      if (!isNonNegativeInteger(value)) errors.push(`expectedRevision.${key}: revision must be a non-negative integer`);
    }
  }

  function validateUnknownPayloadFields(payload, allowedPayload = [], errors) {
    const allowed = new Set(allowedPayload);
    for (const key of Object.keys(payload || {})) if (!allowed.has(key)) errors.push(`payload.${key}: is not an allowed public field for this direct command`);
  }

  function directCommandValidationSpec(commandType) {
    return directCommandSpecs[commandType] || null;
  }

  function contextRevisionValue(context = {}, key) {
    return revisionValue(context, key);
  }

  function validateDirectCommandEnvelope(command = {}, context = {}) {
    if (!command || typeof command !== 'object') return rejection({ supported: false, reason: 'direct command must be an object', errors: ['command must be an object'], blockerToken: 'blocked.input.malformedCommand' }, context);
    const validator = context.uiProtocol?.validateCommandEnvelope || UiProtocolV2.validateCommandEnvelope;
    if (typeof validator !== 'function') return rejection({ supported: true, reason: 'public command protocol validator is unavailable', errors: ['validator unavailable'], blockerToken: 'blocked.input.malformedCommand' }, context);
    const envelopeCheck = validator(command);
    if (!envelopeCheck.ok) {
      const reason = envelopeCheck.errors.join('; ');
      const malformedTarget = /(?:payload|targets?)(?:\.[A-Za-z]+)*\.(?:objectId|itemId|containerId|toolId|toolOrWeaponId|coord|x|y)|positive public (?:objectId|id)|coordinate/i.test(reason);
      return rejection({ supported: true, reason, errors: envelopeCheck.errors.slice(), blockerToken: malformedTarget ? 'blocked.input.malformedTarget' : 'blocked.input.malformedCommand' }, context);
    }
    if (command.protocol !== v2Protocol) return rejection({ supported: false, reason: 'not a v2 direct command', errors: ['unsupported protocol'], blockerToken: 'blocked.input.unsupportedRoute' }, context);
    const spec = directCommandValidationSpec(command.commandType);
    if (!spec) return rejection({ supported: false, reason: `command type ${command.commandType || '(missing)'} is not a registered direct command`, errors: ['unsupported direct command type'], blockerToken: 'blocked.input.unsupportedRoute' }, context);
    const payload = command.payload;
    const errors = [];
    if (!isNonEmptyString(command.commandId)) errors.push('commandId: direct command requires a commandId');
    if (!isPlainObject(payload)) errors.push('payload: direct command requires a payload object');
    validateExpectedRevisionShape(command.expectedRevision, errors);
    if (isPlainObject(payload)) {
      validateUnknownPayloadFields(payload, spec.allowedPayload, errors);
      for (const field of spec.requiredPayload || []) if (payload[field] == null || payload[field] === '') errors.push(`payload.${field}: is required`);
      for (const field of spec.objectIdFields || []) if (payload[field] != null) validatePublicObjectId(payload[field], `payload.${field}`, errors);
      for (const field of spec.coordFields || []) if (payload[field] != null) validatePublicCoord(payload[field], `payload.${field}`, errors);
      for (const field of spec.countFields || []) if (payload[field] != null) validateCount(payload[field], `payload.${field}`, errors);
      if (command.commandType === 'ground.transfer' && payload.count !== 'all') errors.push('payload.count: ground.transfer first slice only supports "all"');
      for (const field of spec.booleanFields || []) if (payload[field] != null && typeof payload[field] !== 'boolean') errors.push(`payload.${field}: must be boolean`);
      for (const [field, allowed] of Object.entries(spec.enumFields || {})) if (payload[field] != null) validateEnumField(payload[field], `payload.${field}`, allowed, errors);
      const forbidden = collectForbiddenPublicKeys(payload);
      for (const path of forbidden) errors.push(`${path}: hidden/private NetHack state is forbidden in public direct-command evidence`);
    }
    if (errors.length) {
      const reason = errors.join('; ');
      const blockerToken = command.commandType === 'container.transfer' && errors.some((error) => error.startsWith('payload.direction:'))
        ? 'blocked.input.unsupportedRoute'
        : (/objectId|coord|target|payload\.(?:itemId|containerId|tool)/.test(reason) ? 'blocked.input.malformedTarget' : 'blocked.input.malformedCommand');
      return rejection({ supported: true, reason, errors, blockerToken }, context);
    }
    const expected = command.expectedRevision && typeof command.expectedRevision === 'object' ? command.expectedRevision : {};
    for (const key of spec.revisionKeys || []) {
      const actual = contextRevisionValue(context, key);
      if (spec.requireExpectedRevision !== false && context.requireExpectedRevisionForKnownSnapshots === true && actual != null && expected[key] == null) {
        return rejection({ supported: true, reason: `${key} expected revision is required before direct ${command.commandType}`, actualRevision: actual, blockerToken: 'blocked.input.staleRevision' }, context);
      }
      if (expected[key] != null && actual != null && !(spec.zeroRevisionIsUnknown === true && actual === 0) && expected[key] !== actual) {
        return rejection({ supported: true, reason: `${key} revision changed before direct ${command.commandType}`, expectedRevision: expected[key], actualRevision: actual, blockerToken: 'blocked.input.staleRevision' }, context);
      }
    }
    if (command.commandType === 'equipment.change') {
      const action = String(payload.action || '');
      const itemRequired = ['takeOff', 'removeAccessory', 'wieldMain', 'quiver', 'putOnRing', 'wearArmor'].includes(action);
      if (itemRequired && payload.itemId == null) return rejection({ supported: true, reason: `equipment.change ${action} requires payload.itemId`, blockerToken: 'blocked.input.malformedTarget' }, context);
      if (action !== 'putOnRing' && payload.hand != null) return rejection({ supported: true, reason: `equipment.change ${action} does not accept payload.hand`, blockerToken: 'blocked.input.malformedTarget' }, context);
      if ((action === 'wieldMain' && payload.slotId != null && payload.slotId !== 'mainHand')
        || (action === 'quiver' && payload.slotId != null && payload.slotId !== 'quiver')
        || (action === 'clearQuiver' && payload.slotId != null && payload.slotId !== 'quiver')) {
        return rejection({ supported: true, reason: `equipment.change ${action} has an incompatible public slotId`, blockerToken: 'blocked.input.malformedTarget' }, context);
      }
      if (action === 'wearArmor' && !String(payload.slotId || '').startsWith('armor.')) {
        return rejection({ supported: true, reason: 'equipment.change wearArmor requires a canonical armor slotId', blockerToken: 'blocked.input.malformedTarget' }, context);
      }
      if (action === 'putOnRing') {
        if (payload.hand !== 'left' && payload.hand !== 'right') return rejection({ supported: true, reason: 'equipment.change putOnRing requires explicit public payload.hand', blockerToken: 'blocked.input.malformedTarget' }, context);
        if (payload.slotId == null) return rejection({ supported: true, reason: 'equipment.change putOnRing requires public payload.slotId', blockerToken: 'blocked.input.malformedTarget' }, context);
        if (payload.slotId !== `ring.${payload.hand}`) return rejection({ supported: true, reason: 'equipment.change putOnRing slotId and hand disagree', blockerToken: 'blocked.input.malformedTarget' }, context);
      }
    }
    if (command.commandType === 'terrain.action') {
      const action = String(payload.action || '');
      const terrain = String(payload.terrain || '');
      const compatible = (action === 'stairsDown' && terrain === 'stairs.down')
        || (action === 'stairsUp' && terrain === 'stairs.up')
        || (action === 'ladderUp' && terrain === 'ladder.up')
        || (action === 'drink' && terrain === 'fountain')
        || (action === 'dip' && terrain === 'fountain');
      if (!compatible) return rejection({ supported: true, reason: `terrain.action ${action} is not compatible with public terrain ${terrain}`, blockerToken: 'blocked.input.malformedTarget' }, context);
      if (action === 'dip' && payload.itemId == null) return rejection({ supported: true, reason: 'terrain.action dip requires payload.itemId', blockerToken: 'blocked.input.malformedTarget' }, context);
    }
    if (context.activeInputOwner) {
      const ownerKind = String(context.activeInputOwner?.kind || context.activeInputOwner || '').toLowerCase();
      const allowedOwners = spec.allowActiveOwnerKinds || [];
      if (!allowedOwners.some((allowed) => ownerKind.includes(allowed))) {
        return rejection({ supported: true, kind: 'active-owner', reason: 'another prompt, menu, or transfer owns input; direct command is blocked' }, context);
      }
      if (spec.requestIdField) {
        const expectedRequestId = String(payload?.[spec.requestIdField] || '').trim();
        const activeRequestId = String(context.activeInputOwner?.requestId || context.activeInputOwner?.targetRequestId || '').trim();
        if (!expectedRequestId || expectedRequestId !== activeRequestId) return rejection({ supported: true, reason: `${command.commandType} requires exact active request ownership`, blockerToken: 'blocked.input.staleRevision' }, context);
      }
    } else if (spec.requestIdField) {
      return rejection({ supported: true, reason: `${command.commandType} requires an active request owner`, blockerToken: 'blocked.input.staleRevision' }, context);
    }
    return { ok: true, supported: true, commandId: command.commandId, transactionId: command.transactionId || command.commandId, commandType: command.commandType, bridgeType: spec.bridgeType, implementedRoute: spec.implementedRoute === true, changesSnapshots: (spec.changesSnapshots || []).slice(), command };
  }

  function validateActionExecuteCommand(command = {}, context = {}) {
    if (!command || typeof command !== 'object') return rejection({ supported: false, reason: 'action.execute command must be an object', errors: ['command must be an object'], blockerToken: 'blocked.input.malformedCommand' }, context);
    const validator = context.uiProtocol?.validateCommandEnvelope || UiProtocolV2.validateCommandEnvelope;
    if (typeof validator !== 'function') return rejection({ supported: true, reason: 'public command protocol validator is unavailable', errors: ['validator unavailable'], blockerToken: 'blocked.input.malformedCommand' }, context);
    const envelopeCheck = validator(command);
    if (!envelopeCheck.ok) return rejection({ supported: true, reason: envelopeCheck.errors.join('; '), errors: envelopeCheck.errors.slice(), blockerToken: 'blocked.input.malformedCommand' }, context);
    if (command.protocol !== v2Protocol || command.commandType !== 'action.execute') return rejection({ supported: false, reason: 'not a v2 action.execute command', errors: ['unsupported command envelope'], blockerToken: 'blocked.input.unsupportedRoute' }, context);
    context = contextWithCommandGroundEvidence(command, context);
    const actionId = actionIdFromCommand(command);
    const rule = safeActionRoutes[actionId];
    if (!rule) return rejection({ supported: false, reason: `action ${actionId || '(missing)'} is not in the limited v2 execution allowlist`, actionId, blockerToken: 'blocked.public.tryInNetHack' }, context);
    const payload = command.payload && typeof command.payload === 'object' ? command.payload : {};
    const rawKeys = routeKeysFromPayload(payload);
    const keys = normalizeTextInput(rawKeys);
    if (!keys || keys !== rawKeys) return rejection({ supported: true, actionId, reason: 'command keys contain unsupported or non-playable input', blockerToken: 'blocked.input.malformedCommand' }, context);
    if (!rule.pattern.test(keys)) return rejection({ supported: true, actionId, reason: `command keys do not match the safe ${actionId} route shape`, blockerToken: 'blocked.input.malformedCommand' }, context);
    if (context.activeInputOwner) return rejection({ supported: true, actionId, kind: 'active-owner', reason: 'another prompt, menu, or transfer owns input; v2 action execution is blocked' }, context);
    if (rule.selectorIndex >= 0) {
      const selector = exactSelectorClaim(command, payload);
      if (!selector) return rejection({ supported: true, actionId, reason: 'selector-targeted action.execute requires one exact, non-contradictory public inventory selector', blockerToken: 'blocked.input.malformedTarget' }, context);
      if (keys[rule.selectorIndex] !== selector) return rejection({ supported: true, actionId, reason: 'command selector does not match the public target selector', selector, commandSelector: keys[rule.selectorIndex], blockerToken: 'blocked.input.malformedTarget' }, context);
    }
    if (rule.targetLocation && targetLocationKindFromPayload(payload, command) !== rule.targetLocation) {
      return rejection({ supported: true, actionId, reason: `${actionId} requires an explicit public ${rule.targetLocation} target`, targetLocation: targetLocationKindFromPayload(payload, command), blockerToken: 'blocked.input.malformedTarget' }, context);
    }
    if (rule.requireSelectorTarget && !targetSelectorFromPayload(payload, command)) {
      return rejection({ supported: true, actionId, reason: `${actionId} requires a public inventory selector target`, blockerToken: 'blocked.input.malformedTarget' }, context);
    }
    if (rule.requireCurrentGroundTarget && Array.isArray(context.groundItems) && !groundTargetStillMatches(command, payload, context)) {
      return rejection({ supported: true, actionId, reason: `${actionId} requires current public ground target evidence`, blockerToken: 'blocked.input.staleRevision' }, context);
    }
    if (rule.promptPolicy && String(payload.promptPolicy || '') !== rule.promptPolicy) {
      return rejection({ supported: true, actionId, reason: `${actionId} requires explicit prompt ownership policy metadata`, promptPolicy: payload.promptPolicy || '', blockerToken: 'blocked.input.missingPromptPolicy' }, context);
    }
    if (rule.targetDisplayPattern) {
      const target = firstTargetObject(payload.target || command.targets);
      const displayName = String(target.displayName || '').trim();
      if (!rule.targetDisplayPattern.test(displayName)) return rejection({ supported: true, actionId, reason: `${actionId} requires a public dippable terrain or liquid target label`, targetDisplayName: displayName, blockerToken: 'blocked.input.malformedTarget' }, context);
    }
    const expected = command.expectedRevision && typeof command.expectedRevision === 'object' ? command.expectedRevision : {};
    for (const key of rule.revisions || []) {
      const actual = revisionValue(context, key);
      if (context.requireExpectedRevisionForKnownSnapshots === true && actual != null && actual > 0 && expected[key] == null) {
        return rejection({ supported: true, actionId, reason: `${key} expected revision is required before action execution`, actualRevision: actual, blockerToken: 'blocked.input.staleRevision' }, context);
      }
      if (expected[key] == null) continue;
      if (actual != null && expected[key] !== actual) {
        if ((key === 'inventory' || key === 'equipment') && inventoryTargetStillMatches(command, payload, context)) continue;
        if (key === 'ground' && groundTargetStillMatches(command, payload, context)) continue;
        return rejection({ supported: true, actionId, reason: `${key} revision changed before action execution`, expectedRevision: expected[key], actualRevision: actual, blockerToken: 'blocked.input.staleRevision' }, context);
      }
    }
    if (actionId === 'item.putOn.ring' && keys.length === 3) {
      const route = payload.route && typeof payload.route === 'object' ? payload.route : {};
      const wantedHand = String(route.targetRingHand || route.ringHand || payload.targetRingHand || payload.ringHand || '').toLowerCase();
      const normalizedWanted = wantedHand === 'left' || wantedHand === 'ring.left' ? 'l' : (wantedHand === 'right' || wantedHand === 'ring.right' ? 'r' : wantedHand);
      if (normalizedWanted && keys[2] !== normalizedWanted) return rejection({ supported: true, actionId, reason: 'ring hand answer does not match the public route target hand', expectedHand: normalizedWanted, commandHand: keys[2], blockerToken: 'blocked.input.malformedCommand' }, context);
      if (!normalizedWanted && route.autoAnswerHand !== true) return rejection({ supported: true, actionId, reason: 'ring hand answer requires explicit public route metadata', blockerToken: 'blocked.input.malformedTarget' }, context);
    }
    const keyInputs = [...keys].map((key, index) => ({ type: 'keycode', keycode: key.charCodeAt(0), commandPosition: index + 1, commandLength: keys.length }));
    return { ok: true, supported: true, actionId, commandId: command.commandId, transactionId: command.transactionId || command.commandId, keys, keyInputs, command };
  }

  function validateRegisteredCommandEnvelope(command = {}, context = {}) {
    if (!command || typeof command !== 'object') return rejection({ supported: false, reason: 'public command must be an object', errors: ['command must be an object'], blockerToken: 'blocked.input.malformedCommand' }, context);
    const validator = context.uiProtocol?.validateCommandEnvelope || UiProtocolV2.validateCommandEnvelope;
    if (typeof validator !== 'function') return rejection({ supported: true, reason: 'public command protocol validator is unavailable', errors: ['validator unavailable'], blockerToken: 'blocked.input.malformedCommand' }, context);
    const envelopeCheck = validator(command);
    if (!envelopeCheck.ok) return rejection({ supported: true, reason: envelopeCheck.errors.join('; '), errors: envelopeCheck.errors.slice(), blockerToken: 'blocked.input.malformedCommand' }, context);
    return {
      ok: true,
      supported: true,
      commandId: command.commandId,
      transactionId: command.transactionId || command.commandId,
      commandType: command.commandType,
      command,
    };
  }

  function planCommand(command = {}, context = {}) {
    const commandType = String(command?.commandType || '');
    const routeSpec = commandPlanningSpecs[commandType];
    let candidate;
    if (commandType === 'action.execute') candidate = validateActionExecuteCommand(command, context);
    else if (directCommandSpecs[commandType]) candidate = validateDirectCommandEnvelope(command, context);
    else candidate = validateRegisteredCommandEnvelope(command, context);
    if (!candidate.ok) return { ...candidate, commandType: commandType || undefined, planningAuthority: 'CommandGateway' };
    if (!routeSpec) {
      return rejection({
        supported: false,
        commandType,
        commandId: command.commandId,
        transactionId: command.transactionId || command.commandId,
        implementationState: 'unknown',
        reason: `command type ${commandType || '(missing)'} has no registered bridge route`,
        blockerToken: 'blocked.input.unsupportedRoute',
        planningAuthority: 'CommandGateway',
      }, context);
    }
    if (routeSpec.implementedRoute !== true) {
      return rejection({
        supported: true,
        commandType,
        commandId: candidate.commandId,
        transactionId: candidate.transactionId,
        bridgeType: routeSpec.bridgeType || undefined,
        implementationState: 'registered-unimplemented',
        reason: `${commandType} bridge route is registered but not implemented`,
        blockerToken: 'blocked.input.unsupportedRoute',
        planningAuthority: 'CommandGateway',
      }, context);
    }
    const bridgeType = routeSpec.bridgeType;
    return {
      ...candidate,
      commandType,
      bridgeType,
      implementationState: 'implemented',
      planningAuthority: 'CommandGateway',
      bridgePayload: Object.freeze({ type: bridgeType, command: candidate.command }),
    };
  }

  return Object.freeze({
    version: 'nethack-command-gateway/v2',
    supportedPlayableKey,
    normalizeShimKey,
    shouldSuppressDuplicateKey,
    normalizeTextInput,
    createActionExecuteCommand,
    planCommand,
    commandPlanningSpecs,
    validateActionExecuteCommand,
    inventoryTargetStillMatches,
    validateDirectCommandEnvelope,
    validatePublicObjectId,
    validatePublicCoord,
    validateCount,
    validateEnumField,
    validateExpectedRevisionShape,
    validateUnknownPayloadFields,
    directCommandValidationSpec,
    directCommandSpecs,
    safeActionExecuteActionIds: Object.freeze(Object.keys(safeActionRoutes).sort()),
  });
}));
