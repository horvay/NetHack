(function initUxContextActionPresentation(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../shared/interaction-model'));
  else root.NetHackUxContextActionPresentation = factory(root.NetHackInteractionModel);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(InteractionModel) {
  const version = 'nethack-context-action-adapter/v2';

  function requirePlanner() {
    if (!InteractionModel?.groupCreatureActions || !InteractionModel?.attitudeFromPublicCell) throw new Error('NetHackInteractionModel contextual planning is required');
    return InteractionModel;
  }

  function attitudeFromPublicCell(cell = {}) {
    return requirePlanner().attitudeFromPublicCell(cell);
  }

  function normalizePublicAction(action = {}) {
    return requirePlanner().normalizePublicAction(action);
  }

  function groupCreatureActions(targets = []) {
    return requirePlanner().groupCreatureActions(targets);
  }

  function selectCreatureTarget(group, targetId) {
    return requirePlanner().selectCreatureTarget(group, targetId);
  }

  function actionsFromAffordances(cell = {}) {
    const tokens = new Set(Array.isArray(cell.actionAffordances) ? cell.actionAffordances.filter((token) => typeof token === 'string') : []);
    const actions = [];
    if (tokens.has('monster.action.chat')) actions.push({ id: 'creature.chat', label: 'Chat', kind: 'chat', dispatchToken: 'monster.action.chat' });
    if (tokens.has('monster.action.attack')) actions.push({ id: 'creature.attack', label: 'Attack', kind: 'attack', dispatchToken: 'monster.action.attack' });
    return Object.freeze(actions.map((action) => normalizePublicAction(action)));
  }

  return Object.freeze({ version, attitudeFromPublicCell, normalizePublicAction, groupCreatureActions, selectCreatureTarget, actionsFromAffordances });
}));
