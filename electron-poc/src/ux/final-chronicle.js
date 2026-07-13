(function initUxFinalChronicle(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dialog-shell'));
  else root.NetHackUxFinalChronicle = factory(root.NetHackUxDialogShell, root.NetHackUxRuntime, root.NetHackUxAppMounts);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(DialogShell, RuntimeModule, AppMounts) {
  const version = 'nethack-final-chronicle/v1';
  const payloadSchema = 'nethack-final-run/v1';
  const hiddenPlaceholder = /^\(?hidden(?:\s+in\s+hud)?\)?$/i;

  function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function exactText(value) { return typeof value === 'string' && value.trim() ? value : undefined; }
  function safeInteger(value, field) {
    if (value == null || value === '') return undefined;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) throw new TypeError(`Final run ${field} must be a non-negative integer`);
    return number;
  }
  function safeDisplayValue(value) {
    if (value == null || value === '') return undefined;
    const display = typeof value === 'number' ? String(value) : clean(value);
    if (!display || hiddenPlaceholder.test(display)) return undefined;
    return display;
  }

  function normalizeStringList(values) {
    const result = [];
    for (const value of Array.isArray(values) ? values : []) {
      const text = exactText(value);
      if (text && !hiddenPlaceholder.test(clean(text)) && !result.includes(text)) result.push(text);
    }
    return Object.freeze(result);
  }

  function normalizeStatistics(values) {
    const result = [];
    const ids = new Set();
    for (const [index, input] of (Array.isArray(values) ? values : []).entries()) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) continue;
      const label = clean(input.label);
      const value = safeDisplayValue(input.value);
      if (!label || value === undefined) continue;
      const id = clean(input.id) || `statistic-${index + 1}`;
      if (ids.has(id)) continue;
      ids.add(id);
      result.push(Object.freeze({ id, label, value }));
    }
    return Object.freeze(result);
  }

  function normalizeDisclosures(values) {
    const byId = new Map();
    for (const [index, input] of (Array.isArray(values) ? values : []).entries()) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) continue;
      const title = exactText(input.title) || 'NetHack disclosure';
      const lines = (Array.isArray(input.lines) ? input.lines : []).filter((line) => typeof line === 'string' && line.length > 0);
      if (!lines.length) continue;
      const id = clean(input.id) || `disclosure-${index + 1}`;
      const prior = byId.get(id);
      const mergedLines = prior ? prior.lines.slice() : [];
      for (const line of lines) if (!mergedLines.includes(line)) mergedLines.push(line);
      byId.set(id, { id, title: prior?.title || title, lines: mergedLines });
    }
    return Object.freeze(Array.from(byId.values(), (entry) => Object.freeze({ ...entry, lines: Object.freeze(entry.lines) })));
  }

  function normalizeFinalRunPayload(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Final run payload must be an object');
    if (input.schema !== payloadSchema) throw new TypeError(`Final run payload schema must be ${payloadSchema}`);
    const finalId = clean(input.finalId || input.eventId);
    const runId = clean(input.runId);
    const sequence = safeInteger(input.sequence, 'sequence');
    if (!finalId) throw new TypeError('Final run finalId is required');
    if (!runId) throw new TypeError('Final run runId is required');
    if (sequence === undefined || sequence < 1) throw new TypeError('Final run sequence must be at least 1');
    if (input.finalized !== true) throw new TypeError('Final run payload must be finalized by NetHack');
    const payload = { schema: payloadSchema, finalId, runId, sequence, finalized: true };
    const cause = exactText(input.cause);
    if (cause && !hiddenPlaceholder.test(clean(cause))) payload.cause = cause;
    const score = safeInteger(input.score, 'score');
    if (score !== undefined) payload.score = score;
    const turns = safeInteger(input.turns, 'turns');
    if (turns !== undefined) payload.turns = turns;
    const depth = safeDisplayValue(input.depth);
    if (depth !== undefined) payload.depth = depth;
    const hero = exactText(input.hero);
    if (hero && !hiddenPlaceholder.test(clean(hero))) payload.hero = hero;
    const highlights = normalizeStringList(input.highlights);
    if (highlights.length) payload.highlights = highlights;
    const conduct = normalizeStringList(input.conduct);
    if (conduct.length) payload.conduct = conduct;
    const statistics = normalizeStatistics(input.statistics);
    if (statistics.length) payload.statistics = statistics;
    const disclosures = normalizeDisclosures(input.disclosures);
    if (disclosures.length) payload.disclosures = disclosures;
    return Object.freeze(payload);
  }

  function prioritizedFacts(payload) {
    if (!payload) return Object.freeze([]);
    const facts = [];
    if (payload.score !== undefined) facts.push(Object.freeze({ id: 'score', label: 'Score', value: String(payload.score) }));
    if (payload.turns !== undefined) facts.push(Object.freeze({ id: 'turns', label: 'Turns', value: String(payload.turns) }));
    if (payload.depth !== undefined) facts.push(Object.freeze({ id: 'depth', label: 'Depth', value: String(payload.depth) }));
    return Object.freeze(facts);
  }

  function chronicleModel(input = {}) {
    const payload = input.payload ? normalizeFinalRunPayload(input.payload) : null;
    const fallbackCause = exactText(input.fallbackCause);
    const authoritativeCause = payload?.cause;
    const cause = authoritativeCause || fallbackCause;
    const disclosures = normalizeDisclosures([
      ...(Array.isArray(input.disclosures) ? input.disclosures : []),
      ...(payload?.disclosures || []),
    ]);
    const disclosureComplete = input.disclosureComplete === true;
    const finalized = Boolean(payload && disclosureComplete);
    const loading = !finalized && input.timedOut !== true;
    const model = {
      phase: finalized ? 'finalized' : loading ? 'loading' : payload ? 'partial' : 'fallback',
      title: payload?.hero ? `${payload.hero}'s final chronicle` : 'Final chronicle',
      loading,
      causeAuthority: authoritativeCause ? 'authoritative' : fallbackCause ? 'fallback' : 'unavailable',
      causeLabel: authoritativeCause ? 'Final cause' : fallbackCause ? 'Cause from legacy text' : '',
      primaryFacts: prioritizedFacts(payload),
      highlights: payload?.highlights || Object.freeze([]),
      conduct: payload?.conduct || Object.freeze([]),
      statistics: payload?.statistics || Object.freeze([]),
      disclosures,
      actions: Object.freeze([
        Object.freeze({ id: 'new-game', label: 'New game', primary: true, disabled: loading }),
        Object.freeze({ id: 'exit', label: 'Exit', primary: false, disabled: loading }),
      ]),
      escapeBlockedMessage: 'This run has ended. Escape keeps the final chronicle open. Choose New game or Exit.',
    };
    if (cause && !hiddenPlaceholder.test(clean(cause))) model.cause = cause;
    return Object.freeze(model);
  }

  function createFinalChronicleStore(options = {}) {
    const onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {};
    const payloadIds = new Set();
    let state = Object.freeze({ runId: '', payload: null, fallbackCause: '', disclosures: Object.freeze([]), disclosureComplete: false, timedOut: false, latestSequence: 0 });

    function diagnostic(type, detail = {}) { try { onDiagnostic(Object.freeze({ type, detail: Object.freeze({ ...detail }) })); } catch {} }
    function snapshot() { return state; }
    function model() { return chronicleModel(state); }
    function begin(input = {}) {
      const runId = clean(input.runId);
      if (!runId) throw new TypeError('Final chronicle runId is required');
      if (state.runId === runId) {
        state = Object.freeze({
          ...state,
          fallbackCause: exactText(input.fallbackCause) || state.fallbackCause,
          disclosures: normalizeDisclosures([...state.disclosures, ...(input.disclosures || [])]),
        });
        diagnostic('final-chronicle.reopened', { runId, latestSequence: state.latestSequence });
        return model();
      }
      payloadIds.clear();
      state = Object.freeze({
        runId,
        payload: null,
        fallbackCause: exactText(input.fallbackCause) || '',
        disclosures: normalizeDisclosures(input.disclosures),
        disclosureComplete: false,
        timedOut: false,
        latestSequence: 0,
      });
      diagnostic('final-chronicle.started', { runId });
      return model();
    }
    function acceptPayload(input) {
      const payload = normalizeFinalRunPayload(input);
      if (state.runId && payload.runId !== state.runId) {
        diagnostic('final-chronicle.foreign-payload-rejected', { expectedRunId: state.runId, runId: payload.runId, finalId: payload.finalId });
        return Object.freeze({ accepted: false, reason: 'foreign-run', model: model() });
      }
      if (payloadIds.has(payload.finalId)) {
        diagnostic('final-chronicle.duplicate-payload-suppressed', { finalId: payload.finalId, sequence: payload.sequence });
        return Object.freeze({ accepted: false, reason: 'duplicate', model: model() });
      }
      payloadIds.add(payload.finalId);
      if (payload.sequence <= state.latestSequence) {
        diagnostic('final-chronicle.stale-payload-rejected', { finalId: payload.finalId, sequence: payload.sequence, latestSequence: state.latestSequence });
        return Object.freeze({ accepted: false, reason: 'stale', model: model() });
      }
      state = Object.freeze({ ...state, runId: payload.runId, payload, latestSequence: payload.sequence });
      diagnostic('final-chronicle.payload-accepted', { finalId: payload.finalId, sequence: payload.sequence });
      return Object.freeze({ accepted: true, model: model() });
    }
    function addDisclosure(input) {
      const disclosures = normalizeDisclosures([...state.disclosures, input]);
      const changed = disclosures.length !== state.disclosures.length;
      state = Object.freeze({ ...state, disclosures });
      diagnostic(changed ? 'final-chronicle.disclosure-added' : 'final-chronicle.disclosure-duplicate', { id: clean(input?.id), count: disclosures.length });
      return model();
    }
    function setFallbackCause(value) {
      state = Object.freeze({ ...state, fallbackCause: exactText(value) || '' });
      diagnostic('final-chronicle.fallback-updated', { present: Boolean(state.fallbackCause), outranked: Boolean(state.payload?.cause) });
      return model();
    }
    function completeDisclosures() {
      state = Object.freeze({ ...state, disclosureComplete: true });
      diagnostic('final-chronicle.disclosures-complete', { count: state.disclosures.length });
      return model();
    }
    function timeOut() {
      state = Object.freeze({ ...state, timedOut: true });
      diagnostic('final-chronicle.wait-timed-out', { hasPayload: Boolean(state.payload), disclosureComplete: state.disclosureComplete });
      return model();
    }
    return Object.freeze({ version, begin, acceptPayload, addDisclosure, setFallbackCause, completeDisclosures, timeOut, snapshot, model });
  }

  function createElement(documentRoot, tag, className = '', text = '') {
    const element = documentRoot.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function createFinalChronicleView(options = {}) {
    const mount = options.mount;
    const documentRoot = options.documentRoot || mount?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!mount || !documentRoot?.createElement) throw new TypeError('Final chronicle view requires a mount and document');
    const runtime = options.runtime || RuntimeModule?.runtime || null;
    const store = options.store || createFinalChronicleStore({ onDiagnostic: options.onDiagnostic });
    const schedule = options.setTimeout || setTimeout;
    const cancelSchedule = options.clearTimeout || clearTimeout;
    const finalizeWaitMs = Math.max(250, Math.min(5000, Number(options.finalizeWaitMs) || 1500));
    let finalizeTimer = null;
    let finalizeTimerRunId = '';
    let terminalActionPending = false;
    const dialog = createElement(documentRoot, 'dialog', 'ux-final-chronicle');
    dialog.id = options.id || 'ux-final-chronicle-dialog';
    dialog.dataset.uxDomain = 'run-lifecycle';
    const frame = createElement(documentRoot, 'div', 'ux-final-chronicle-frame');
    const scroll = createElement(documentRoot, 'div', 'ux-final-chronicle-scroll');
    const header = createElement(documentRoot, 'header', 'ux-final-chronicle-header');
    const kicker = createElement(documentRoot, 'p', 'ux-final-chronicle-kicker', 'Final chronicle');
    const title = createElement(documentRoot, 'h2', 'ux-final-chronicle-title', 'Final chronicle');
    title.id = `${dialog.id}-title`;
    const escapeNote = createElement(documentRoot, 'p', 'ux-final-chronicle-escape');
    escapeNote.id = `${dialog.id}-description`;
    header.append(kicker, title, escapeNote);
    const status = createElement(documentRoot, 'section', 'ux-final-chronicle-status');
    const facts = createElement(documentRoot, 'dl', 'ux-final-chronicle-facts');
    const highlights = createElement(documentRoot, 'section', 'ux-final-chronicle-highlights');
    const details = createElement(documentRoot, 'section', 'ux-final-chronicle-details');
    scroll.append(header, status, facts, highlights, details);
    const actionError = createElement(documentRoot, 'p', 'ux-final-chronicle-action-error');
    actionError.hidden = true;
    const actions = createElement(documentRoot, 'menu', 'ux-final-chronicle-actions dialog-actions');
    const newButton = createElement(documentRoot, 'button', 'primary', 'New game');
    newButton.type = 'button';
    newButton.dataset.action = 'new-game';
    const exitButton = createElement(documentRoot, 'button', '', 'Exit');
    exitButton.type = 'button';
    exitButton.dataset.action = 'exit';
    actions.append(newButton, exitButton);
    frame.append(scroll, actionError, actions);
    dialog.append(frame);
    mount.replaceChildren(dialog);

    function listSection(heading, values) {
      if (!values.length) return null;
      const section = createElement(documentRoot, 'section', 'ux-final-chronicle-list');
      section.append(createElement(documentRoot, 'h3', '', heading));
      const list = createElement(documentRoot, 'ul');
      for (const value of values) list.append(createElement(documentRoot, 'li', '', value));
      section.append(list);
      return section;
    }

    function render(model = store.model()) {
      const hasDetailedContent = Boolean(model.cause || model.primaryFacts.length || model.highlights.length || model.conduct.length || model.statistics.length || model.disclosures.length);
      actionError.hidden = !actionError.textContent;
      dialog.dataset.phase = model.phase;
      dialog.dataset.density = hasDetailedContent ? 'detailed' : 'minimal';
      title.textContent = model.title;
      escapeNote.textContent = model.escapeBlockedMessage;
      status.replaceChildren();
      status.hidden = false;
      if (model.loading) {
        const loadingTitle = createElement(documentRoot, 'strong', '', 'Collecting NetHack’s final disclosure…');
        const loadingCopy = createElement(documentRoot, 'p', '', 'New game and Exit remain visible while final details arrive.');
        status.className = 'ux-final-chronicle-status ux-state-loading';
        status.append(loadingTitle, loadingCopy);
      } else if (model.cause) {
        status.className = `ux-final-chronicle-status ux-final-cause-${model.causeAuthority}`;
        status.append(createElement(documentRoot, 'span', 'ux-final-chronicle-label', model.causeLabel), createElement(documentRoot, 'strong', 'ux-final-chronicle-cause', model.cause));
      } else {
        status.className = 'ux-final-chronicle-status';
        status.hidden = true;
      }
      facts.replaceChildren();
      for (const fact of model.primaryFacts) {
        facts.append(createElement(documentRoot, 'dt', '', fact.label), createElement(documentRoot, 'dd', '', fact.value));
      }
      highlights.replaceChildren();
      for (const section of [listSection('Highlights', model.highlights), listSection('Conduct', model.conduct)]) if (section) highlights.append(section);
      details.replaceChildren();
      if (model.statistics.length) {
        const statisticSection = createElement(documentRoot, 'section', 'ux-final-chronicle-statistics');
        statisticSection.append(createElement(documentRoot, 'h3', '', 'Available statistics'));
        const statisticList = createElement(documentRoot, 'dl');
        for (const statistic of model.statistics) statisticList.append(createElement(documentRoot, 'dt', '', statistic.label), createElement(documentRoot, 'dd', '', statistic.value));
        statisticSection.append(statisticList);
        details.append(statisticSection);
      }
      newButton.disabled = Boolean(model.actions.find((action) => action.id === 'new-game')?.disabled) || terminalActionPending;
      exitButton.disabled = Boolean(model.actions.find((action) => action.id === 'exit')?.disabled) || terminalActionPending;
      for (const disclosure of model.disclosures) {
        const disclosureElement = createElement(documentRoot, 'details', 'ux-final-chronicle-disclosure');
        const summary = createElement(documentRoot, 'summary', '', disclosure.title);
        const pre = createElement(documentRoot, 'pre', '', disclosure.lines.join('\n'));
        disclosureElement.append(summary, pre);
        details.append(disclosureElement);
      }
      return model;
    }

    function scheduleFinalizeWait(model) {
      const runId = store.snapshot().runId;
      if (!model.loading) {
        if (finalizeTimer != null) cancelSchedule(finalizeTimer);
        finalizeTimer = null;
        finalizeTimerRunId = '';
        return;
      }
      if (finalizeTimer != null && finalizeTimerRunId === runId) return;
      if (finalizeTimer != null) cancelSchedule(finalizeTimer);
      finalizeTimerRunId = runId;
      finalizeTimer = schedule(() => {
        finalizeTimer = null;
        const timedRunId = finalizeTimerRunId;
        finalizeTimerRunId = '';
        if (store.snapshot().runId !== timedRunId || store.snapshot().timedOut) return;
        store.timeOut();
        const timedOutModel = render();
        newButton.focus?.({ preventScroll: true });
        try { options.onDiagnostic?.(Object.freeze({ type: 'final-chronicle.wait-bounded', detail: Object.freeze({ waitMs: finalizeWaitMs, phase: timedOutModel.phase }) })); } catch {}
      }, finalizeWaitMs);
    }

    function focusService() { return options.focusLayer || runtime?.service?.('dialog')?.focus || null; }
    function applyDialogContract() {
      const shell = options.dialogShell || runtime?.service?.('dialog') || DialogShell;
      const apply = shell?.apply || shell?.applyDialogSpec;
      apply?.({
        dialog, titleElement: title, descriptionElement: escapeNote, choices: [],
        spec: { id: dialog.id, family: 'confirmation', title: title.textContent, description: escapeNote.textContent, initialFocus: () => newButton, returnFocus: options.returnFocus || 'invoker', escapePolicy: 'blocked', closeKind: 'blocked', secondaryActions: [] },
      });
    }
    function open(input = {}) {
      if (input.runId) store.begin(input);
      if (input.fallbackCause) store.setFallbackCause(input.fallbackCause);
      for (const disclosure of input.disclosures || []) store.addDisclosure(disclosure);
      if (input.disclosureComplete) store.completeDisclosures();
      if (input.timedOut) store.timeOut();
      if (input.payload) store.acceptPayload(input.payload);
      const model = render();
      scheduleFinalizeWait(model);
      scroll.scrollTop = 0;
      applyDialogContract();
      const focus = focusService();
      focus?.prepareOpen?.(dialog, input.invoker || documentRoot.activeElement);
      if (!dialog.open) dialog.showModal();
      const initialFocus = model.loading ? title : newButton;
      focus?.open?.({ id: dialog.id, element: dialog, domain: 'run-lifecycle', initialFocus: () => initialFocus, returnFocus: input.returnFocus || options.returnFocus || 'invoker', escapePolicy: 'blocked' });
      if (model.loading) { title.tabIndex = -1; title.focus?.({ preventScroll: true }); }
      else newButton.focus?.({ preventScroll: true });
      return model;
    }
    function update(input = {}) {
      if (input.fallbackCause !== undefined) store.setFallbackCause(input.fallbackCause);
      for (const disclosure of input.disclosures || []) store.addDisclosure(disclosure);
      if (input.disclosureComplete) store.completeDisclosures();
      if (input.timedOut) store.timeOut();
      const payloadResult = input.payload ? store.acceptPayload(input.payload) : null;
      const model = render();
      scheduleFinalizeWait(model);
      return Object.freeze({ payloadResult, model });
    }
    function closeForAction(action) {
      if (finalizeTimer != null) cancelSchedule(finalizeTimer);
      finalizeTimer = null;
      finalizeTimerRunId = '';
      focusService()?.close?.(dialog, { restore: false });
      if (dialog.open) dialog.close(action);
    }
    function terminalActionButton(action) { return action === 'exit' ? exitButton : newButton; }
    function reportTerminalActionFailure(action, reason, error) {
      const label = action === 'exit' ? 'Exit' : 'New game';
      const failure = error instanceof Error ? error : new Error(`${label} handler ${reason}`);
      actionError.textContent = `${label} could not be completed. The final chronicle is still open. Try again.`;
      try { options.onActionError?.(failure, action); } catch {}
      try {
        options.onDiagnostic?.(Object.freeze({
          type: 'final-chronicle.terminal-action-failed',
          detail: Object.freeze({ action, reason, message: String(failure.message || failure) }),
        }));
      } catch {}
    }
    async function handleTerminalAction(action, callback) {
      if (terminalActionPending || store.model().loading) return false;
      terminalActionPending = true;
      actionError.textContent = '';
      render();
      let succeeded = false;
      try {
        if (typeof callback !== 'function') {
          reportTerminalActionFailure(action, 'missing-handler');
          return false;
        }
        const result = await callback(store.snapshot());
        if (result === false) {
          reportTerminalActionFailure(action, 'handler-declined');
          return false;
        }
        succeeded = true;
        closeForAction(action);
        return true;
      } catch (error) {
        reportTerminalActionFailure(action, 'handler-error', error);
        return false;
      } finally {
        terminalActionPending = false;
        if (dialog.open) {
          render();
          if (!succeeded) terminalActionButton(action).focus?.({ preventScroll: true });
        }
      }
    }
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      const model = store.model();
      if (model.loading) { title.tabIndex = -1; title.focus?.({ preventScroll: true }); }
      else newButton.focus?.({ preventScroll: true });
    });
    newButton.addEventListener('click', () => { handleTerminalAction('new-game', options.onNewGame); });
    exitButton.addEventListener('click', () => { handleTerminalAction('exit', options.onExit); });
    render();
    return Object.freeze({ version, dialog, store, open, update, render, model: store.model, isOpen: () => Boolean(dialog.open), handleTerminalAction, focusNewGame: () => newButton.focus?.({ preventScroll: true }) });
  }

  function installDefaultView() {
    if (typeof document === 'undefined') return null;
    let mount = null;
    try { mount = AppMounts?.lookupMount?.('runLifecycle', document) || document.getElementById?.('ux-run-lifecycle-root'); } catch { return null; }
    if (!mount) return null;
    return createFinalChronicleView({ mount, documentRoot: document, runtime: RuntimeModule?.runtime });
  }

  const defaultView = typeof window !== 'undefined' ? installDefaultView() : null;
  return Object.freeze({
    version,
    payloadSchema,
    normalizeFinalRunPayload,
    normalizeDisclosures,
    chronicleModel,
    createFinalChronicleStore,
    createFinalChronicleView,
    installDefaultView,
    defaultView,
  });
}));
