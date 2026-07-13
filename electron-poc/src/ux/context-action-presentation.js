(function initUxContextActionPresentation(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxContextActionPresentation = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-context-action-presentation/v1';
  const attitudes = Object.freeze(['tame', 'peaceful', 'hostile']);
  const directions = Object.freeze(['northwest', 'north', 'northeast', 'west', 'east', 'southwest', 'south', 'southeast']);

  function text(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }

  function explicitAttitude(value) {
    const attitude = text(value).toLowerCase();
    return attitudes.includes(attitude) ? attitude : undefined;
  }

  function normalizePublicAction(input = {}) {
    const id = text(input.id);
    const label = text(input.label);
    if (!id || !label) throw new TypeError('public context actions require id and label');
    const action = {
      id,
      label,
      kind: input.kind === 'attack' ? 'attack' : (input.kind === 'chat' ? 'chat' : 'other'),
      danger: input.danger === 'serious' ? 'serious' : (input.danger === 'caution' ? 'caution' : 'none'),
      primaryEligible: input.primaryEligible !== false,
    };
    if (input.publicShortcut) action.publicShortcut = text(input.publicShortcut);
    if (input.dispatchToken) action.dispatchToken = text(input.dispatchToken);
    return Object.freeze(action);
  }

  function policyForCreature(attitude, actions = []) {
    const normalized = actions.map(normalizePublicAction);
    const chat = normalized.find((action) => action.kind === 'chat');
    const attack = normalized.find((action) => action.kind === 'attack');
    let primary;
    if ((attitude === 'tame' || attitude === 'peaceful') && chat?.primaryEligible) primary = chat;
    if (attitude === 'hostile' && attack?.primaryEligible) primary = attack;
    const dangerous = [];
    const secondary = [];
    for (const action of normalized) {
      if (action === primary) continue;
      if (action.kind === 'attack' && (attitude === 'tame' || attitude === 'peaceful')) {
        dangerous.push(Object.freeze({ ...action, danger: 'serious', confirmationRequired: true }));
      } else if (action.danger === 'serious') dangerous.push(action);
      else secondary.push(action);
    }
    return Object.freeze({
      ...(primary ? { primary } : {}),
      secondary: Object.freeze(secondary),
      dangerous: Object.freeze(dangerous),
      attitudeKnown: Boolean(attitude),
    });
  }

  function normalizeCreatureTarget(input = {}) {
    const targetId = text(input.targetId);
    const publicLabel = text(input.publicLabel);
    const direction = text(input.direction).toLowerCase();
    if (!targetId || !publicLabel) throw new TypeError('creature targets require stable targetId and publicLabel');
    if (direction && !directions.includes(direction)) throw new TypeError(`unsupported creature direction: ${direction}`);
    const publicAttitude = explicitAttitude(input.publicAttitude);
    const actions = Array.isArray(input.publicActions) ? input.publicActions : [];
    const target = {
      targetId,
      publicLabel,
      ...(direction ? { direction } : {}),
      ...(publicAttitude ? { publicAttitude } : {}),
      policy: policyForCreature(publicAttitude, actions),
    };
    return Object.freeze(target);
  }

  function groupCreatureActions(inputs = []) {
    const targets = inputs.map(normalizeCreatureTarget);
    const seen = new Set();
    for (const target of targets) {
      if (seen.has(target.targetId)) throw new TypeError(`duplicate creature target: ${target.targetId}`);
      seen.add(target.targetId);
    }
    if (!targets.length) return Object.freeze({ visible: false, targets: Object.freeze([]), primary: undefined });
    if (targets.length === 1) {
      return Object.freeze({
        visible: true,
        label: 'Creature',
        targets: Object.freeze(targets),
        selectedTargetId: targets[0].targetId,
        primary: targets[0].policy.primary,
        secondary: targets[0].policy.secondary,
        dangerous: targets[0].policy.dangerous,
        chooserRequired: false,
      });
    }
    return Object.freeze({
      visible: true,
      label: 'Creature',
      targets: Object.freeze(targets),
      primary: Object.freeze({ id: 'creature.choose-target', label: 'Choose creature', kind: 'chooser', danger: 'none', primaryEligible: true }),
      secondary: Object.freeze([]),
      dangerous: Object.freeze([]),
      chooserRequired: true,
    });
  }

  function selectCreatureTarget(group, targetId) {
    const target = group?.targets?.find((entry) => entry.targetId === text(targetId));
    if (!target) throw new RangeError(`unknown creature target: ${text(targetId) || '(empty)'}`);
    return Object.freeze({
      ...group,
      selectedTargetId: target.targetId,
      primary: target.policy.primary,
      secondary: target.policy.secondary,
      dangerous: target.policy.dangerous,
      chooserRequired: false,
    });
  }

  function actionsFromAffordances(cell = {}) {
    const tokens = new Set(Array.isArray(cell.actionAffordances) ? cell.actionAffordances.map(text) : []);
    const actions = [];
    if (tokens.has('monster.action.chat')) actions.push({ id: 'creature.chat', label: 'Chat', kind: 'chat', dispatchToken: 'monster.action.chat' });
    if (tokens.has('monster.action.attack')) actions.push({ id: 'creature.attack', label: 'Attack', kind: 'attack', dispatchToken: 'monster.action.attack' });
    return Object.freeze(actions.map(normalizePublicAction));
  }

  function attitudeFromPublicCell(cell = {}) {
    const direct = explicitAttitude(cell.publicAttitude);
    if (direct) return direct;
    const tokens = new Set(Array.isArray(cell.actionAffordances) ? cell.actionAffordances.map(text) : []);
    if (tokens.has('monster.attitude.tame') || tokens.has('monster.pet')) return 'tame';
    if (tokens.has('monster.attitude.peaceful')) return 'peaceful';
    if (tokens.has('monster.attitude.hostile')) return 'hostile';
    return undefined;
  }

  return Object.freeze({
    version,
    attitudes,
    directions,
    explicitAttitude,
    normalizePublicAction,
    policyForCreature,
    normalizeCreatureTarget,
    groupCreatureActions,
    selectCreatureTarget,
    actionsFromAffordances,
    attitudeFromPublicCell,
  });
}));
