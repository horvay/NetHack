(function initUxCommandPalette(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxCommandPalette = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-command-palette/v1';

  function createPaletteState(options = {}) {
    const catalog = options.catalog;
    if (!catalog || typeof catalog.sections !== 'function') throw new TypeError('Command palette requires a CommandCatalog');
    let state = Object.freeze({ phase: 'closed', mode: 'browse', query: '', selectedId: '', publicState: Object.freeze({}), invoker: null });

    function results(next = state) {
      const sourceSections = catalog.sections(next.query, next.publicState);
      const sections = next.mode === 'core' ? sourceSections.map((section) => Object.freeze({
        ...section,
        entries: Object.freeze(section.entries.filter((entry) => entry.command.internalRoute.kind === 'text' && entry.command.internalRoute.value.startsWith('#'))),
      })).filter((section) => section.entries.length) : sourceSections;
      const entries = sections.flatMap((section) => section.entries);
      return Object.freeze({ sections: Object.freeze(sections), entries: Object.freeze(entries) });
    }

    function selectAvailable(next, preferredId = '') {
      const found = results(next).entries;
      const selectedId = found.some((entry) => entry.command.id === preferredId) ? preferredId : (found[0]?.command.id || '');
      return Object.freeze({ ...next, selectedId });
    }

    function open(input = {}) {
      const next = { phase: 'open', mode: input.mode === 'core' ? 'core' : 'browse', query: String(input.query || ''), selectedId: '', publicState: input.publicState || {}, invoker: input.invoker || null };
      state = selectAvailable(next, input.selectedId);
      return snapshot();
    }

    function close(reason = 'close') {
      const previous = state;
      state = Object.freeze({ phase: 'closed', mode: previous.mode, query: '', selectedId: '', publicState: previous.publicState, invoker: previous.invoker, closeReason: reason });
      return snapshot();
    }

    function setQuery(query) {
      state = selectAvailable({ ...state, query: String(query || '') });
      return snapshot();
    }

    function updatePublicState(publicState = {}) {
      state = selectAvailable({ ...state, publicState }, state.selectedId);
      return snapshot();
    }

    function move(delta) {
      const entries = results().entries;
      if (!entries.length) return snapshot();
      const current = Math.max(0, entries.findIndex((entry) => entry.command.id === state.selectedId));
      const index = (current + Number(delta || 0) + entries.length) % entries.length;
      state = Object.freeze({ ...state, selectedId: entries[index].command.id });
      return snapshot();
    }

    function moveBoundary(which) {
      const entries = results().entries;
      if (!entries.length) return snapshot();
      state = Object.freeze({ ...state, selectedId: entries[which === 'end' ? entries.length - 1 : 0].command.id });
      return snapshot();
    }

    function select(id) {
      if (results().entries.some((entry) => entry.command.id === id)) state = Object.freeze({ ...state, selectedId: id });
      return snapshot();
    }

    function selected() {
      return results().entries.find((entry) => entry.command.id === state.selectedId) || null;
    }

    function activate(adapter = {}) {
      const entry = selected();
      if (!entry) return Object.freeze({ ok: false, reason: 'no-selection' });
      if (!entry.available) return Object.freeze({ ok: false, reason: entry.reason || 'unavailable', commandId: entry.command.id });
      if (entry.command.danger !== 'none' && typeof adapter.confirm !== 'function') {
        return Object.freeze({ ok: false, reason: 'confirmation-required', commandId: entry.command.id, danger: entry.command.danger });
      }
      if (entry.command.danger !== 'none') {
        const accepted = adapter.confirm(entry.command);
        if (!accepted) return Object.freeze({ ok: false, reason: 'confirmation-declined', commandId: entry.command.id });
      }
      const dispatchCommand = state.mode === 'core' && entry.command.internalRoute.kind === 'text' && entry.command.internalRoute.value.startsWith('#')
        ? Object.freeze({ ...entry.command, internalRoute: Object.freeze({ ...entry.command.internalRoute, value: entry.command.internalRoute.value.slice(1) }) })
        : entry.command;
      return catalog.dispatch(dispatchCommand, adapter, state.publicState);
    }

    function snapshot() {
      const listed = results(state);
      return Object.freeze({ ...state, sections: listed.sections, entries: listed.entries, selected: listed.entries.find((entry) => entry.command.id === state.selectedId) || null });
    }

    return Object.freeze({ version, open, close, setQuery, updatePublicState, move, moveBoundary, select, selected, activate, snapshot });
  }

  function promptLabel(command) {
    const labels = Object.freeze({ item: 'Choose an item next', direction: 'Choose a direction next', target: 'Choose a target next', text: 'Type an answer next', 'core-owned': 'NetHack will ask if needed' });
    return labels[command?.promptPlan] || '';
  }

  function createElement(documentRoot, tag, className = '', text = '') {
    const element = documentRoot.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function createPaletteController(options = {}) {
    const documentRoot = options.documentRoot || (typeof document !== 'undefined' ? document : null);
    const mount = options.mount;
    const catalog = options.catalog;
    if (!documentRoot || !mount || !catalog) throw new TypeError('Palette controller requires documentRoot, mount, and catalog');
    const model = createPaletteState({ catalog });
    const keyHints = typeof options.keyHints === 'function' ? options.keyHints : () => 'contextual';
    const onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {};
    const dialogService = options.dialogService || null;
    const adapter = options.dispatchAdapter || {};

    const dialog = createElement(documentRoot, 'dialog', 'ux-command-palette');
    dialog.id = 'ux-command-palette';
    dialog.setAttribute('aria-labelledby', 'ux-command-palette-title');
    const frame = createElement(documentRoot, 'div', 'ux-command-palette-frame');
    const heading = createElement(documentRoot, 'header', 'ux-command-palette-heading');
    const headingCopy = createElement(documentRoot, 'div');
    const kicker = createElement(documentRoot, 'span', 'ux-discovery-kicker', 'Command palette');
    const title = createElement(documentRoot, 'h2', '', 'Choose an action');
    title.id = 'ux-command-palette-title';
    headingCopy.append(kicker, title);
    const closeButton = createElement(documentRoot, 'button', '', 'Close');
    closeButton.type = 'button';
    heading.append(headingCopy, closeButton);
    const searchLabel = createElement(documentRoot, 'label', 'ux-command-search');
    searchLabel.append(createElement(documentRoot, 'span', '', 'Search commands'));
    const searchInput = createElement(documentRoot, 'input');
    searchInput.type = 'search';
    searchInput.autocomplete = 'off';
    searchInput.placeholder = 'Try “drink potion”, “q”, or “quaff”';
    searchLabel.append(searchInput);
    const list = createElement(documentRoot, 'div', 'ux-command-results');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Commands');
    const empty = createElement(documentRoot, 'div', 'ux-command-empty');
    empty.hidden = true;
    empty.append(createElement(documentRoot, 'strong', '', 'No matching commands'));
    empty.append(createElement(documentRoot, 'p', '', 'Try a NetHack name, a friendly phrase, or an exact key.'));
    frame.append(heading, searchLabel, list, empty);
    dialog.append(frame);
    mount.replaceChildren(dialog);

    function render() {
      const snapshot = model.snapshot();
      list.replaceChildren();
      empty.hidden = snapshot.entries.length > 0;
      list.hidden = !snapshot.entries.length;
      for (const section of snapshot.sections) {
        const group = createElement(documentRoot, 'section', 'ux-command-group');
        group.dataset.section = section.id;
        group.append(createElement(documentRoot, 'h3', '', section.label));
        for (const entry of section.entries) {
          const command = entry.command;
          const button = createElement(documentRoot, 'button', 'ux-command-row');
          button.type = 'button';
          button.dataset.commandId = command.id;
          button.setAttribute('role', 'option');
          button.setAttribute('aria-selected', String(command.id === snapshot.selectedId));
          button.tabIndex = command.id === snapshot.selectedId ? 0 : -1;
          if (!entry.available) button.disabled = true;
          const copy = createElement(documentRoot, 'span', 'ux-command-copy');
          copy.append(createElement(documentRoot, 'strong', '', command.label));
          const detailParts = [promptLabel(command), entry.reason].filter(Boolean);
          if (detailParts.length) copy.append(createElement(documentRoot, 'small', '', detailParts.join('. ')));
          button.append(copy);
          if (command.danger !== 'none') button.append(createElement(documentRoot, 'span', `ux-command-danger ux-danger-${command.danger}`, command.danger === 'serious' ? 'Serious' : 'Caution'));
          const policy = keyHints();
          if (command.publicShortcut && policy !== 'never') {
            const keycap = createElement(documentRoot, 'kbd', 'ux-keycap', command.publicShortcut);
            keycap.title = 'Keyboard shortcut';
            button.append(keycap);
          }
          group.append(button);
        }
        list.append(group);
      }
      list.querySelector(`[data-command-id="${String(snapshot.selectedId).replace(/["\\]/g, '\\$&')}"]`)?.scrollIntoView?.({ block: 'nearest' });
      return snapshot;
    }

    function close(reason = 'close') {
      const previous = model.snapshot();
      const invoker = previous.invoker;
      model.close(reason);
      if (dialog.open) dialog.close(reason);
      dialogService?.focus?.close?.(dialog);
      try { options.onClose?.(reason, previous); } catch (error) { onDiagnostic({ type: 'palette.close-handler-failed', detail: { reason, message: String(error?.message || error) } }); }
      const invokerDialog = invoker?.closest?.('dialog');
      if (invoker?.isConnected && (!invokerDialog || invokerDialog.open) && typeof invoker.focus === 'function') invoker.focus({ preventScroll: true });
      return true;
    }

    function open(input = {}) {
      model.open(input);
      searchInput.value = input.query || '';
      render();
      dialogService?.focus?.prepareOpen?.(dialog, input.invoker || documentRoot.activeElement);
      if (!dialog.open) dialog.showModal();
      dialogService?.focus?.open?.({ id: 'command-palette', element: dialog, domain: 'discovery', initialFocus: searchInput, returnFocus: 'invoker', escapePolicy: 'close' });
      searchInput.focus({ preventScroll: true });
      onDiagnostic({ type: 'palette.opened', detail: { mode: input.mode || 'browse' } });
      return model.snapshot();
    }

    function activate() {
      const selected = model.selected();
      if (!selected) return false;
      const result = model.activate(adapter);
      onDiagnostic({ type: result.ok ? 'palette.command-dispatched' : 'palette.command-not-dispatched', detail: result });
      if (result.ok) close('dispatched');
      else if (result.reason === 'confirmation-required' && typeof options.requestConfirmation === 'function') {
        const command = selected.command;
        close('confirmation');
        options.requestConfirmation(command, () => {
          const confirmed = catalog.dispatch(command, adapter, model.snapshot().publicState);
          onDiagnostic({ type: confirmed.ok ? 'palette.command-dispatched' : 'palette.command-not-dispatched', detail: confirmed });
        });
      }
      return result.ok;
    }

    searchInput.addEventListener('input', () => { model.setQuery(searchInput.value); render(); });
    closeButton.addEventListener('click', () => close('close'));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close('escape'); });
    list.addEventListener('mousemove', (event) => {
      const row = event.target.closest?.('[data-command-id]');
      if (!row || model.snapshot().selectedId === row.dataset.commandId) return;
      model.select(row.dataset.commandId);
      for (const candidate of list.querySelectorAll('[data-command-id]')) {
        const selected = candidate.dataset.commandId === row.dataset.commandId;
        candidate.setAttribute('aria-selected', String(selected));
        candidate.tabIndex = selected ? 0 : -1;
      }
    });
    list.addEventListener('click', (event) => {
      const row = event.target.closest?.('[data-command-id]');
      if (!row) return;
      model.select(row.dataset.commandId);
      activate();
    });
    dialog.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        close('escape');
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(event.key)) return;
      if ((event.key === 'Home' || event.key === 'End') && event.target === searchInput) return;
      if (event.key === 'Enter' && event.target === searchInput && !model.selected()) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'ArrowDown') model.move(1);
      else if (event.key === 'ArrowUp') model.move(-1);
      else if (event.key === 'Home') model.moveBoundary('home');
      else if (event.key === 'End') model.moveBoundary('end');
      else activate();
      render();
    });

    return Object.freeze({ version, model, element: dialog, open, close, render, updatePublicState(publicState) { model.updatePublicState(publicState); return render(); } });
  }

  return Object.freeze({ version, promptLabel, createPaletteState, createPaletteController });
}));
