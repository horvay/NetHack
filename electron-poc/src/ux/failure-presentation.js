(function initUxFailurePresentation(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../shared/public-blockers'));
  else root.NetHackUxFailurePresentation = factory(root.NetHackPublicBlockers);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(PublicBlockers) {
  const version = 'nethack-failure-presentation/v1';
  const exactKinds = Object.freeze({
    'stale-revision': 'That item moved. Refresh the list and try again.',
    'prompt-conflict': 'Finish the current NetHack prompt before using that action.',
    'menu-conflict': 'Finish the current NetHack menu before using that action.',
    'transfer-conflict': 'Finish the open transfer before using another action.',
    'process-exit': 'Connection lost. Start a new game or continue from recovery if one is available.',
    'recovery-failed': 'That game could not be recovered. Start a new game or review diagnostics.',
    'clipboard-failed': 'Technical details could not be copied.',
    'storage-load': 'Presentation settings could not be loaded. Safe defaults are in use.',
    'storage-write': 'This preference is active for this session but could not be saved.',
    'interrupted': 'NetHack interrupted that action. Review the current state before trying again.',
    'rejected': 'NetHack did not accept that action. Review the current state and try again.',
    'save-rejected': 'Cannot save the game. Check the save location and try again.',
    'timeout': 'NetHack did not confirm that action. Review the current state before trying again.',
  });

  function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }

  function kindFromInput(input = {}) {
    const explicit = clean(input.kind || input.failureKind || input.status).toLowerCase();
    const token = clean(input.blockerToken);
    const reason = clean(input.reason || input.message).toLowerCase();
    if (token === 'blocked.input.staleRevision' || /stale.*revision|revision.*changed|item.*moved/.test(reason)) return 'stale-revision';
    if (token === 'blocked.input.promptActive' || /prompt.*active|finish.*prompt/.test(reason)) return 'prompt-conflict';
    if (token === 'blocked.input.menuActive' || /menu.*active|finish.*menu/.test(reason)) return 'menu-conflict';
    if (token === 'blocked.input.transferActive' || /transfer.*active/.test(reason)) return 'transfer-conflict';
    if (/process|connection|bridge.*exit|unexpected.*exit/.test(`${explicit} ${reason}`)) return 'process-exit';
    if (/recover/.test(`${explicit} ${reason}`) && /fail|stale|invalid|could not/.test(`${explicit} ${reason}`)) return 'recovery-failed';
    if (/clipboard|copy/.test(`${explicit} ${reason}`) && /fail|unavailable/.test(`${explicit} ${reason}`)) return 'clipboard-failed';
    if (/setting|storage/.test(`${explicit} ${reason}`) && /load|parse|read/.test(`${explicit} ${reason}`)) return 'storage-load';
    if (/setting|storage|preference/.test(`${explicit} ${reason}`) && /write|save|persist/.test(`${explicit} ${reason}`)) return 'storage-write';
    if (/interrupt|destroyed|no longer adjacent/.test(`${explicit} ${reason}`)) return 'interrupted';
    if (/timeout/.test(`${explicit} ${reason}`)) return 'timeout';
    return exactKinds[explicit] ? explicit : 'rejected';
  }

  function isBenignCancellationRejection(input = {}) {
    const event = input.event || input.rejection?.event || input.effect?.event || {};
    const eventName = clean(event.name).toLowerCase();
    if (eventName === 'bridge_line_answer.cancelled' || eventName === 'bridge_menu_answer.cancelled') return true;
    if (eventName === 'bridge_menu_answer') {
      const selected = clean(event.selection || event.selections || event.selectors || event.answer);
      return !Number(event.return || 0) && !Number(event.selector || 0) && !selected;
    }
    if (eventName === 'bridge_prompt_answer.cancelled') return event.keycode == null || Number(event.keycode) === 27;
    const resultKind = clean(input.result?.kind || input.transaction?.result?.kind).toLowerCase();
    const interactions = Array.isArray(input.transaction?.interactions) ? input.transaction.interactions : [];
    const hasEscapeAnswer = interactions.some((interaction) => interaction?.kind === 'answer-key' && interaction.key === '\u001b');
    const semanticAction = clean(input.transaction?.semanticAction).toLowerCase();
    const actionId = clean(input.result?.actionId || input.transaction?.result?.actionId || input.transaction?.semanticActionId || input.transaction?.guiAction?.actionId).toLowerCase();
    const hasExplicitCancelIntent = semanticAction === 'cancel' || actionId === 'interaction.cancel';
    return ['bridge_prompt_answer.cancelled', 'bridge_line_answer.cancelled', 'bridge_menu_answer.cancelled'].includes(resultKind) && (hasEscapeAnswer || hasExplicitCancelIntent);
  }

  function publicBlockerMessage(token) {
    if (!token || !PublicBlockers?.isPublicEquipmentBlockerToken?.(token)) return '';
    return PublicBlockers.publicEquipmentBlockerLabel(token);
  }

  function presentFailure(input = {}) {
    const kind = kindFromInput(input);
    const blockerToken = clean(input.blockerToken);
    const publicReason = publicBlockerMessage(blockerToken);
    const diagnosticRef = clean(input.diagnosticRef || input.transactionId || input.requestId);
    const id = clean(input.id) || `failure:${kind}:${diagnosticRef || blockerToken || 'current'}`;
    const message = ['stale-revision', 'prompt-conflict', 'menu-conflict', 'transfer-conflict'].includes(kind)
      ? exactKinds[kind]
      : (publicReason || exactKinds[kind] || exactKinds.rejected);
    const severity = ['process-exit', 'recovery-failed', 'rejected', 'save-rejected', 'timeout'].includes(kind) ? 'error' : 'warning';
    const notice = {
      id,
      kind: severity,
      message,
      source: ['process-exit', 'recovery-failed'].includes(kind) ? 'recovery' : 'result',
      persistence: ['process-exit', 'recovery-failed'].includes(kind) ? 'sticky' : 'until-state-change',
      dedupeKey: clean(input.dedupeKey) || `failure:${kind}:${diagnosticRef || blockerToken || id}`,
    };
    if (diagnosticRef) notice.diagnosticRef = diagnosticRef;
    return Object.freeze({
      kind,
      notice: Object.freeze(notice),
      preserveSelection: kind !== 'process-exit' && kind !== 'recovery-failed',
      preserveScroll: true,
      disableAction: kind === 'stale-revision' || kind.endsWith('conflict'),
      refreshRequired: kind === 'stale-revision',
      retry: false,
      technicalReason: clean(input.reason || input.message),
    });
  }

  function noticeForSettingsWarning(message) {
    const kind = /could not be loaded|safe defaults/i.test(String(message || '')) ? 'storage-load' : 'storage-write';
    return presentFailure({ id: `settings:${kind}`, kind, reason: message }).notice;
  }

  return Object.freeze({ version, exactKinds, kindFromInput, isBenignCancellationRejection, presentFailure, noticeForSettingsWarning });
}));
