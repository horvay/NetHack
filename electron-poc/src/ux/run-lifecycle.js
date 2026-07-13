(function initUxRunLifecycle(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxRunLifecycle = factory(root.NetHackUxRuntime);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(RuntimeModule) {
  const version = 'nethack-run-lifecycle/v1';
  const resultSources = Object.freeze(['typed-result', 'command-transaction']);
  const roleNames = Object.freeze({
    Arc: 'Archeologist', Bar: 'Barbarian', Cav: 'Caveman', Hea: 'Healer', Kni: 'Knight', Mon: 'Monk',
    Pri: 'Priest', Ran: 'Ranger', Rog: 'Rogue', Sam: 'Samurai', Tou: 'Tourist', Val: 'Valkyrie', Wiz: 'Wizard',
  });
  const actionDefinitions = Object.freeze([
    Object.freeze({
      id: 'run.save-and-exit', label: 'Save and exit', aliases: Object.freeze(['save', 'save game']), category: 'Run',
      publicShortcut: 'S', internalRoute: 'S', promptPlan: 'core-owned', danger: 'caution', availability: 'always',
      confirmationTitle: 'Save and exit?', confirmationText: 'NetHack will save this run and return to the start screen.',
      safeActionLabel: 'Keep playing', actionLabel: 'Save and exit', recentEligible: true,
    }),
    Object.freeze({
      id: 'run.quit', label: 'Quit', aliases: Object.freeze(['quit game', 'quit without saving']), category: 'Run',
      publicShortcut: '#quit', internalRoute: '#quit', promptPlan: 'core-owned', danger: 'serious', availability: 'always',
      confirmationTitle: 'Quit without saving?', confirmationText: 'This ends the current run without creating a save.',
      safeActionLabel: 'Do not quit', actionLabel: 'Quit without saving', recentEligible: false,
    }),
  ]);

  function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function optionalText(value) { const text = clean(value); return text || undefined; }
  function actionFor(id) { return actionDefinitions.find((action) => action.id === String(id || '')) || null; }
  function freezeState(value) { return Object.freeze({ ...value }); }

  function publicRole(character = {}, candidate = {}) {
    const code = clean(character.role || candidate.role);
    return roleNames[code] || code || undefined;
  }

  function recoveryCandidatePresentation(candidate = {}) {
    if (!candidate || typeof candidate !== 'object' || !['save', 'checkpoint'].includes(candidate.kind)) return null;
    const saved = candidate.kind === 'save';
    const character = candidate.character && typeof candidate.character === 'object' ? candidate.character : {};
    const hero = optionalText(candidate.heroName || candidate.playerName || character.name);
    const role = publicRole(character, candidate);
    const dungeonLevel = optionalText(candidate.dungeonLevel || candidate.publicMetadata?.dungeonLevel);
    const timestamp = optionalText(candidate.timestamp || candidate.savedAt || candidate.recoveryAt || candidate.modifiedAt);
    const facts = [];
    if (hero) facts.push(Object.freeze({ id: 'hero', label: 'Hero', value: hero }));
    if (role) facts.push(Object.freeze({ id: 'role', label: 'Role', value: role }));
    if (dungeonLevel) facts.push(Object.freeze({ id: 'dungeon-level', label: 'Dungeon', value: dungeonLevel }));
    if (timestamp) facts.push(Object.freeze({ id: 'timestamp', label: saved ? 'Saved' : 'Checkpoint', value: timestamp }));
    return Object.freeze({
      id: clean(candidate.id) || `${candidate.kind}:current`,
      kind: candidate.kind,
      status: saved ? 'saved' : 'recovery-candidate',
      title: saved ? 'Continue previous game' : 'Recover and continue',
      description: saved ? 'Resume the saved run.' : 'An interrupted-run checkpoint was found. NetHack will validate it before continuing.',
      actionLabel: saved ? 'Continue previous game' : 'Recover and continue',
      canContinue: candidate.canContinue !== false,
      facts: Object.freeze(facts),
    });
  }

  function normalizeAcknowledgement(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Run lifecycle acknowledgement must be an object');
    const source = clean(input.source);
    if (!resultSources.includes(source)) throw new TypeError('Run lifecycle acknowledgement requires an authoritative source');
    const status = clean(input.status).toLowerCase();
    if (!['success', 'failure', 'cancelled'].includes(status)) throw new TypeError('Run lifecycle acknowledgement has an invalid status');
    const actionId = clean(input.actionId);
    if (!actionFor(actionId)) throw new TypeError('Run lifecycle acknowledgement has an unknown action');
    const id = clean(input.id || input.eventId);
    const transactionId = clean(input.transactionId);
    if (!id) throw new TypeError('Run lifecycle acknowledgement id is required');
    if (!transactionId) throw new TypeError('Run lifecycle acknowledgement transactionId is required');
    const acknowledgement = { id, actionId, transactionId, status, source };
    const reason = optionalText(input.reason || input.message);
    if (reason) acknowledgement.reason = reason;
    return Object.freeze(acknowledgement);
  }

  function createRunLifecycleController(options = {}) {
    const runtime = options.runtime || null;
    let dispatchHandler = typeof options.dispatch === 'function' ? options.dispatch : null;
    const onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {};
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const seenAcknowledgements = new Set();
    const issuedTransactionIds = new Set();
    let serial = 0;
    let requestGeneration = 0;
    let current = freezeState({ phase: 'idle', actionId: '', transactionId: '', pending: false });

    function diagnostic(type, detail = {}) {
      try { onDiagnostic(Object.freeze({ type, detail: Object.freeze({ ...detail }) })); } catch {}
    }

    function noticeService() { return options.noticeService || runtime?.service?.('notice') || null; }
    function showNotice(notice) { return noticeService()?.show?.(notice); }

    function request(actionId, context = {}) {
      const action = actionFor(actionId);
      if (!action) throw new TypeError(`Unknown run lifecycle action: ${String(actionId || '(empty)')}`);
      if (current.pending) {
        diagnostic('run-action.duplicate-blocked', { actionId, pendingActionId: current.actionId, transactionId: current.transactionId });
        return Object.freeze({ accepted: false, reason: 'pending', state: current });
      }
      const transactionId = clean(context.transactionId) || `run-action:${++serial}:${Number(now())}`;
      if (issuedTransactionIds.has(transactionId)) {
        diagnostic('run-action.transaction-reuse-blocked', { actionId, transactionId });
        return Object.freeze({ accepted: false, reason: 'transaction-reused', state: current });
      }
      issuedTransactionIds.add(transactionId);
      const requestToken = ++requestGeneration;
      current = freezeState({ phase: 'awaiting-core', actionId, transactionId, pending: true, requestedAt: Number(now()) });
      if (!dispatchHandler) {
        current = freezeState({ ...current, phase: 'rejected', pending: false, reason: 'No run action dispatcher is connected.' });
        diagnostic('run-action.dispatch-unavailable', { actionId, transactionId });
        return Object.freeze({ accepted: false, reason: current.reason, state: current });
      }
      function isCurrentRequest() {
        return requestToken === requestGeneration && current.pending && current.actionId === actionId && current.transactionId === transactionId;
      }
      function staleDispatchSettlement(type) {
        diagnostic('run-action.stale-dispatch-settlement-suppressed', { actionId, transactionId, settlement: type, currentActionId: current.actionId, currentTransactionId: current.transactionId });
        return Object.freeze({ accepted: false, stale: true, state: current });
      }
      function rejectDispatch(reason, type = 'run-action.dispatch-failed') {
        if (!isCurrentRequest()) return staleDispatchSettlement(type);
        current = freezeState({ ...current, phase: 'rejected', pending: false, reason: clean(reason) });
        showNotice({
          id: `run:${transactionId}:dispatch-failed`, dedupeKey: `run:${transactionId}`, kind: 'error',
          message: actionId === 'run.save-and-exit' ? 'Cannot save the game. Check the save location and try again.' : 'NetHack did not accept that action. Review the current state and try again.',
          source: 'result', persistence: 'until-state-change', diagnosticRef: transactionId,
        });
        diagnostic(type, { actionId, transactionId, reason: current.reason });
        return Object.freeze({ accepted: false, reason: current.reason, state: current });
      }
      function settleDispatch(outcome) {
        if (outcome?.accepted === false) return rejectDispatch(outcome.reason, 'run-action.dispatch-rejected');
        if (!isCurrentRequest()) return staleDispatchSettlement('accepted');
        diagnostic('run-action.awaiting-core', { actionId, transactionId });
        return Object.freeze({ accepted: true, transactionId, state: current });
      }
      let outcome;
      try { outcome = dispatchHandler(action, Object.freeze({ ...context, transactionId })); }
      catch (error) { return rejectDispatch(error?.message || error); }
      if (outcome && typeof outcome.then === 'function') {
        return Promise.resolve(outcome).then(settleDispatch, (error) => rejectDispatch(error?.message || error));
      }
      return settleDispatch(outcome);
    }

    function acceptAcknowledgement(input) {
      const acknowledgement = normalizeAcknowledgement(input);
      const identity = acknowledgement.id;
      if (seenAcknowledgements.has(identity)) {
        diagnostic('run-action.duplicate-acknowledgement-suppressed', { identity, actionId: acknowledgement.actionId });
        return Object.freeze({ accepted: false, duplicate: true, state: current });
      }
      if (!current.pending || current.actionId !== acknowledgement.actionId
          || current.transactionId !== acknowledgement.transactionId) {
        diagnostic('run-action.unmatched-acknowledgement', { identity, actionId: acknowledgement.actionId, transactionId: acknowledgement.transactionId });
        return Object.freeze({ accepted: false, unmatched: true, state: current });
      }
      seenAcknowledgements.add(identity);
      current = freezeState({
        ...current,
        phase: acknowledgement.status === 'success' ? 'completed' : acknowledgement.status === 'cancelled' ? 'cancelled' : 'rejected',
        pending: false,
        acknowledgedAt: Number(now()),
        acknowledgementId: identity,
        ...(acknowledgement.reason ? { reason: acknowledgement.reason } : {}),
      });
      if (acknowledgement.status === 'success' && acknowledgement.actionId === 'run.save-and-exit') {
        showNotice({
          id: `run:${current.transactionId}:saved`, dedupeKey: `run:${current.transactionId}:save-result`, kind: 'success',
          message: 'Game saved', source: 'result', persistence: 'transient',
        });
      } else if (acknowledgement.status === 'failure') {
        showNotice({
          id: `run:${current.transactionId}:failed`, dedupeKey: `run:${current.transactionId}:result`, kind: 'error',
          message: acknowledgement.actionId === 'run.save-and-exit'
            ? 'Cannot save the game. Check the save location and try again.'
            : 'NetHack did not accept that action. Review the current state and try again.',
          source: 'result', persistence: 'until-state-change', diagnosticRef: current.transactionId,
        });
      }
      diagnostic('run-action.acknowledged', { actionId: acknowledgement.actionId, transactionId: current.transactionId, status: acknowledgement.status, source: acknowledgement.source });
      return Object.freeze({ accepted: true, acknowledgement, state: current });
    }

    function connectDispatch(nextDispatch) {
      if (typeof nextDispatch !== 'function') throw new TypeError('Run lifecycle dispatcher must be a function');
      dispatchHandler = nextDispatch;
      diagnostic('run-action.dispatch-connected');
      return true;
    }

    function reset(runIdentity = '') {
      requestGeneration += 1;
      current = freezeState({ phase: 'idle', actionId: '', transactionId: '', pending: false, runIdentity: clean(runIdentity) });
      seenAcknowledgements.clear();
      diagnostic('run-action.reset', { runIdentity: current.runIdentity || '' });
      return current;
    }

    return Object.freeze({
      version,
      actions: () => actionDefinitions,
      request,
      acceptAcknowledgement,
      connectDispatch,
      recoveryCandidatePresentation,
      state: () => current,
      reset,
    });
  }

  function installDefaultController(runtimeModule = RuntimeModule) {
    const runtime = runtimeModule?.runtime;
    if (!runtime?.registerDomain || runtime.domain?.('run-lifecycle')) return runtime?.domain?.('run-lifecycle')?.controller || null;
    const controller = createRunLifecycleController({ runtime });
    const owner = runtime.registerDomain('run-lifecycle', Object.freeze({ version, controller }));
    runtime.registerProvider('run-lifecycle-actions', 'run-lifecycle', Object.freeze({
      version,
      entries: actionDefinitions,
      request: controller.request,
      acceptAcknowledgement: controller.acceptAcknowledgement,
      connectDispatch: controller.connectDispatch,
      recoveryCandidatePresentation,
    }));
    return owner.controller;
  }

  const defaultController = typeof window !== 'undefined' ? installDefaultController(RuntimeModule) : null;
  return Object.freeze({
    version,
    resultSources,
    roleNames,
    actionDefinitions,
    actionFor,
    recoveryCandidatePresentation,
    normalizeAcknowledgement,
    createRunLifecycleController,
    installDefaultController,
    defaultController,
  });
}));
