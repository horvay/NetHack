(function initUxOnboarding(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxOnboarding = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-first-turn-guide/v1';
  const cueIds = Object.freeze(['move', 'consequence', 'here-actions', 'inventory']);
  const cueDefinitions = Object.freeze([
    Object.freeze({ id: 'move', step: 1, title: 'Move one square', instruction: 'Use an arrow key, hjkl, yubn, or the optional movement pad. Your normal move completes this cue.' }),
    Object.freeze({ id: 'consequence', step: 2, title: 'Read what happened', instruction: 'The latest consequence keeps NetHack’s exact result close to the map.' }),
    Object.freeze({ id: 'here-actions', step: 3, title: 'Check actions here', instruction: 'Open Here actions to inspect public choices for the current square. Opening the list spends no turn.' }),
    Object.freeze({ id: 'inventory', step: 4, title: 'Open and close Inventory', instruction: 'Inventory shows carried items. Open it, then close it with Escape or Close.' }),
  ]);

  function normalizedSettings(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    return Object.freeze({ completed: source.completed === true, disabled: source.disabled === true, lastStep: String(source.lastStep || 'not-started') });
  }

  function createOnboarding(options = {}) {
    const settingsStore = options.settingsStore || null;
    const onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {};
    const onWarning = typeof options.onWarning === 'function' ? options.onWarning : () => {};
    let settings = normalizedSettings(options.settings || settingsStore?.current?.()?.onboarding);
    let state = Object.freeze({ phase: 'not-started', cueIndex: -1, suspended: false, suspendReason: '', runKind: '', completionReason: '', inventoryOpened: false });
    const activeOwners = new Set();
    let persistenceWarningShown = false;

    function diagnostic(type, detail = {}) { try { onDiagnostic(Object.freeze({ type, detail: Object.freeze({ ...detail }) })); } catch {} }
    function warnPersistenceOnce() {
      if (persistenceWarningShown) return;
      persistenceWarningShown = true;
      try { onWarning('The guide preference is active for this session but could not be saved.'); } catch {}
    }
    function persist(patch) {
      settings = normalizedSettings({ ...settings, ...patch });
      if (!settingsStore?.save) {
        warnPersistenceOnce();
        diagnostic('onboarding.preference-not-saved', { reason: 'settings-store-unavailable' });
        return false;
      }
      try {
        const result = settingsStore.save({ onboarding: settings });
        if (!result?.persisted) {
          warnPersistenceOnce();
          diagnostic('onboarding.preference-not-saved', { reason: 'storage-write-failed' });
        }
        return Boolean(result?.persisted);
      } catch (error) {
        warnPersistenceOnce();
        diagnostic('onboarding.preference-not-saved', { reason: 'storage-write-threw', message: String(error?.message || error) });
        return false;
      }
    }
    function currentCue() { return state.cueIndex >= 0 ? cueDefinitions[state.cueIndex] : null; }
    function snapshot() { return Object.freeze({ ...state, settings, cue: currentCue(), activeOwners: Object.freeze(Array.from(activeOwners)) }); }
    function begin(input = {}) {
      activeOwners.clear();
      const runKind = ['new', 'restored', 'replay', 'recovered'].includes(input.runKind) ? input.runKind : 'new';
      if (settings.disabled) {
        state = Object.freeze({ phase: 'disabled', cueIndex: -1, suspended: false, suspendReason: '', runKind, completionReason: 'disabled', inventoryOpened: false });
      } else if (settings.completed && !input.force) {
        state = Object.freeze({ phase: 'completed', cueIndex: -1, suspended: false, suspendReason: '', runKind, completionReason: 'previously-completed', inventoryOpened: false });
      } else if (runKind !== 'new' && !input.force) {
        state = Object.freeze({ phase: 'completed', cueIndex: -1, suspended: false, suspendReason: '', runKind, completionReason: `${runKind}-suppressed`, inventoryOpened: false });
      } else {
        state = Object.freeze({ phase: 'cue-1', cueIndex: 0, suspended: false, suspendReason: '', runKind, completionReason: '', inventoryOpened: false });
        persist({ lastStep: 'cue-1' });
      }
      diagnostic('onboarding.started', { runKind, phase: state.phase, force: Boolean(input.force) });
      return snapshot();
    }
    function advance(reason) {
      if (state.suspended || state.cueIndex < 0) return snapshot();
      const nextIndex = state.cueIndex + 1;
      if (nextIndex >= cueDefinitions.length) {
        state = Object.freeze({ ...state, phase: 'completed', cueIndex: -1, completionReason: reason || 'all-cues-completed', inventoryOpened: false });
        persist({ completed: true, lastStep: 'completed' });
        diagnostic('onboarding.completed', { reason: state.completionReason });
      } else {
        state = Object.freeze({ ...state, phase: `cue-${nextIndex + 1}`, cueIndex: nextIndex, inventoryOpened: false });
        persist({ lastStep: state.phase });
        diagnostic('onboarding.cue-advanced', { phase: state.phase, reason });
      }
      return snapshot();
    }
    function suspend(reason = 'input-owned', ownerId = reason) {
      if (state.cueIndex < 0) return snapshot();
      activeOwners.add(String(ownerId || reason || 'input-owned'));
      state = Object.freeze({ ...state, suspended: true, suspendReason: Array.from(activeOwners).join(', ') });
      diagnostic('onboarding.suspended', { reason: String(reason || 'input-owned'), ownerId: String(ownerId || ''), phase: state.phase, ownerCount: activeOwners.size });
      return snapshot();
    }
    function resume(ownerId = 'input-owned') {
      activeOwners.delete(String(ownerId || 'input-owned'));
      const suspended = activeOwners.size > 0;
      state = Object.freeze({ ...state, suspended, suspendReason: suspended ? Array.from(activeOwners).join(', ') : '' });
      diagnostic(suspended ? 'onboarding.still-suspended' : 'onboarding.resumed', { phase: state.phase, ownerCount: activeOwners.size });
      return snapshot();
    }
    function skip() {
      state = Object.freeze({ ...state, phase: 'completed', cueIndex: -1, suspended: false, suspendReason: '', completionReason: 'skipped', inventoryOpened: false });
      persist({ completed: true, lastStep: 'skipped' });
      diagnostic('onboarding.skipped');
      return snapshot();
    }
    function disable() {
      state = Object.freeze({ ...state, phase: 'disabled', cueIndex: -1, suspended: false, suspendReason: '', completionReason: 'disabled', inventoryOpened: false });
      persist({ completed: true, disabled: true, lastStep: 'disabled' });
      diagnostic('onboarding.disabled');
      return snapshot();
    }
    function restart() {
      persist({ completed: false, disabled: false, lastStep: 'not-started' });
      return begin({ runKind: state.runKind || 'new', force: true });
    }
    function observe(event = {}) {
      const type = String(event.type || '');
      const ownerId = String(event.ownerId || type.replace(/-(?:opened|closed)$/, '') || 'input-owned');
      if (['core-prompt-opened', 'dialog-opened', 'game-over'].includes(type)) return suspend(type, type === 'game-over' ? 'game-over' : ownerId);
      if (['core-prompt-closed', 'dialog-closed'].includes(type)) return resume(ownerId);
      const cue = currentCue()?.id;
      if (cue === 'inventory' && type === 'inventory-opened' && event.confirmed !== false) {
        if (!state.inventoryOpened) {
          state = Object.freeze({ ...state, inventoryOpened: true });
          diagnostic('onboarding.inventory-opened');
        }
        return snapshot();
      }
      if (state.suspended || state.cueIndex < 0 || event.confirmed === false) return snapshot();
      if (cue === 'move' && type === 'movement-confirmed') return advance(type);
      if (cue === 'consequence' && type === 'consequence-visible') return advance(type);
      if (cue === 'here-actions' && type === 'here-actions-opened') return advance(type);
      if (cue === 'inventory' && type === 'inventory-closed' && state.inventoryOpened) return advance(type);
      return snapshot();
    }

    return Object.freeze({ version, begin, observe, suspend, resume, skip, disable, restart, advance, snapshot });
  }

  function createElement(documentRoot, tag, className = '', text = '') {
    const element = documentRoot.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function createOnboardingController(options = {}) {
    const documentRoot = options.documentRoot || (typeof document !== 'undefined' ? document : null);
    const mount = options.mount;
    if (!documentRoot || !mount) throw new TypeError('Onboarding controller requires documentRoot and mount');
    const model = createOnboarding(options);
    const panel = createElement(documentRoot, 'aside', 'ux-first-turn-guide');
    panel.hidden = true;
    const progress = createElement(documentRoot, 'span', 'ux-onboarding-progress');
    const title = createElement(documentRoot, 'strong');
    const instruction = createElement(documentRoot, 'p');
    const actions = createElement(documentRoot, 'div', 'ux-onboarding-actions');
    const skipButton = createElement(documentRoot, 'button', '', 'Skip guide');
    skipButton.type = 'button';
    const disableButton = createElement(documentRoot, 'button', '', 'Do not show again');
    disableButton.type = 'button';
    actions.append(skipButton, disableButton);
    panel.append(progress, title, instruction, actions);
    mount.append(panel);
    function render() {
      const snapshot = model.snapshot();
      panel.hidden = snapshot.cueIndex < 0 || snapshot.suspended;
      if (snapshot.cue) {
        progress.textContent = `Field guide ${snapshot.cue.step} of ${cueDefinitions.length}`;
        title.textContent = snapshot.cue.title;
        instruction.textContent = snapshot.cue.instruction;
      }
      panel.dataset.phase = snapshot.phase;
      panel.dataset.suspended = String(snapshot.suspended);
      return snapshot;
    }
    skipButton.addEventListener('click', () => { model.skip(); render(); options.onComplete?.('skipped'); });
    disableButton.addEventListener('click', () => { model.disable(); render(); options.onComplete?.('disabled'); });
    return Object.freeze({
      version, model, element: panel, render,
      begin(input) { model.begin(input); return render(); },
      observe(event) { model.observe(event); return render(); },
      restart() { model.restart(); return render(); },
    });
  }

  return Object.freeze({ version, cueIds, cueDefinitions, normalizedSettings, createOnboarding, createOnboardingController });
}));
