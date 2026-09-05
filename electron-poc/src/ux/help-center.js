(function initUxHelpCenter(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxHelpCenter = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-help-center/v1';
  const sectionIds = Object.freeze(['basics', 'keys', 'commands', 'manual']);
  const movementTopics = Object.freeze([
    Object.freeze({ id: 'walk', title: 'Walk', shortcut: 'arrows / hjklyubn', text: 'Move one square in a direction. Walking into a creature keeps NetHack’s normal interaction and combat rules.' }),
    Object.freeze({ id: 'run', title: 'Run', shortcut: 'g + direction', text: 'Move repeatedly in a direction until NetHack interrupts the run. Running does not choose a route or explore automatically.' }),
    Object.freeze({ id: 'fight', title: 'Fight', shortcut: 'F + direction', text: 'Force a fight in one direction. NetHack still owns the result and turn cost.' }),
    Object.freeze({ id: 'counts', title: 'Count prefixes', shortcut: 'number + command', text: 'Type a number before a command to repeat that command. The count is sent unchanged to NetHack.' }),
    Object.freeze({ id: 'search', title: 'Search', shortcut: 's', text: 'Spend a turn searching nearby. The interface does not predict what a search will reveal.' }),
    Object.freeze({ id: 'wait', title: 'Wait', shortcut: '.', text: 'Spend one turn without moving. Wait does not mean rest until healed.' }),
  ]);
  const basics = Object.freeze([
    Object.freeze({ title: 'Read the dungeon', text: 'The map shows what NetHack has made public. Unknown items, creatures, traps, and outcomes stay unknown.' }),
    Object.freeze({ title: 'Choose deliberately', text: 'Selection, search filters, and Help are turnless. A named gameplay action uses the same NetHack command and prompt as the classic key.' }),
    Object.freeze({ title: 'Cancel safely', text: 'Escape cancels or closes one top layer. It never accepts a choice.' }),
    Object.freeze({ title: 'Keep the keys', text: 'Classic command letters, counts, menu letters, arrows, hjklyubn, and raw # commands remain available.' }),
  ]);
  const magicNotes = Object.freeze([
    Object.freeze({ title: 'Spells', text: 'Spell rows show only values NetHack provides: name, selector, level, Pw cost, failure, and status. Missing values are omitted.' }),
    Object.freeze({ title: 'Failure', text: 'Spell failure reflects the hero’s current equipment and condition. The interface does not estimate future values or recommend a build.' }),
    Object.freeze({ title: 'Skills', text: 'Skill rows show only current rank, public next rank or cost, and whether NetHack says advancement is available.' }),
  ]);

  function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function exactLines(input) {
    if (Array.isArray(input)) return Object.freeze(input.map((line) => String(line)));
    return Object.freeze(String(input == null ? '' : input).split(/\r?\n/));
  }
  function contains(haystack, query) { return String(haystack || '').toLocaleLowerCase().includes(String(query || '').toLocaleLowerCase()); }

  function normalizeSelector(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 32 && value <= 126) return String.fromCharCode(value);
    const selector = String(value == null ? '' : value);
    return selector.length === 1 ? selector : undefined;
  }

  function optionalText(target, field, value) {
    const text = clean(value);
    if (text) target[field] = text;
  }

  function normalizeProvenance(source) {
    if (source !== 'typed' && source !== 'fallback') throw new TypeError('Spell and skill rows require explicit typed or fallback provenance');
    return source;
  }

  function normalizeSpellRow(input = {}, source) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Spell row must be an object');
    normalizeProvenance(source);
    const name = clean(input.name);
    if (!name) throw new TypeError('Spell row name is required');
    const row = { name, classificationConfidence: source === 'typed' ? 'typed' : 'fallback' };
    const selector = normalizeSelector(input.selector);
    if (selector) row.selector = selector;
    optionalText(row, 'level', input.level);
    optionalText(row, 'pwCost', input.pwCost == null ? input.power : input.pwCost);
    const failure = input.failure == null ? input.fail : input.failure;
    if (typeof failure === 'number' && Number.isInteger(failure) && failure >= 0 && failure <= 100) row.failure = `${failure}%`;
    else optionalText(row, 'failure', failure);
    optionalText(row, 'status', input.status);
    return Object.freeze(row);
  }

  function normalizeSkillRow(input = {}, source) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Skill row must be an object');
    normalizeProvenance(source);
    const name = clean(input.name);
    if (!name) throw new TypeError('Skill row name is required');
    const row = { name, classificationConfidence: source === 'typed' ? 'typed' : 'fallback' };
    const selector = normalizeSelector(input.selector);
    if (selector) row.selector = selector;
    optionalText(row, 'currentRank', input.currentRank == null ? input.rank : input.currentRank);
    optionalText(row, 'nextRank', input.nextRank);
    optionalText(row, 'nextCost', input.nextCost == null ? input.cost : input.nextCost);
    if (typeof input.canAdvance === 'boolean') row.canAdvance = input.canAdvance;
    return Object.freeze(row);
  }

  function normalizeMagicRowsSnapshot(snapshot = {}, expectedKind = '') {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new TypeError('Spell and skill snapshot must be an object');
    const kind = expectedKind === 'skill' || snapshot.kind === 'skill' ? 'skill' : 'spell';
    const source = normalizeProvenance(snapshot.classificationConfidence);
    if (source === 'typed' && snapshot.authoritative !== true) throw new TypeError('Typed spell and skill rows require authoritative provenance');
    const rows = (Array.isArray(snapshot.rows) ? snapshot.rows : []).map((row) => kind === 'skill' ? normalizeSkillRow(row, source) : normalizeSpellRow(row, source));
    return Object.freeze({ kind, source, authoritative: source === 'typed', requestId: clean(snapshot.requestId), menuId: clean(snapshot.menuId), rows: Object.freeze(rows) });
  }

  function magicRowView(input, kind = 'spell', source, actionLabel = '') {
    const row = kind === 'skill' ? normalizeSkillRow(input, source) : normalizeSpellRow(input, source);
    const facts = kind === 'skill'
      ? [row.currentRank && `Rank ${row.currentRank}`, row.nextRank && `Next ${row.nextRank}`, row.nextCost && `Cost ${row.nextCost}`, row.canAdvance === true && 'Can advance'].filter(Boolean)
      : [row.level && `Level ${row.level}`, row.pwCost && `Pw ${row.pwCost}`, row.failure && `Failure ${row.failure}`, row.status].filter(Boolean);
    const safeActionLabel = kind === 'skill' && row.canAdvance !== true ? '' : clean(actionLabel);
    return Object.freeze({ kind, row, actionLabel: safeActionLabel, facts: Object.freeze(facts) });
  }

  function renderMagicRows(options = {}) {
    const documentRoot = options.documentRoot || (typeof document !== 'undefined' ? document : null);
    const mount = options.mount;
    const kind = options.kind === 'skill' ? 'skill' : 'spell';
    if (!documentRoot || !mount) throw new TypeError('Magic row rendering requires documentRoot and mount');
    const source = normalizeProvenance(options.source);
    const views = (Array.isArray(options.rows) ? options.rows : []).map((row) => {
      const actionLabel = typeof options.actionLabel === 'function' ? options.actionLabel(row) : options.actionLabel;
      return magicRowView(row, kind, source, actionLabel);
    });
    mount.replaceChildren();
    const explanationText = kind === 'skill'
      ? 'Ranks and advancement appear only when NetHack provides them.'
      : 'Failure reflects current equipment and condition. Missing values are omitted.';
    const provenanceText = source === 'fallback' ? ' These values come from NetHack’s legacy menu and may omit fields.' : '';
    const explanation = createElement(documentRoot, 'p', 'ux-magic-row-explanation', `${explanationText}${provenanceText}`);
    mount.append(explanation);
    for (const view of views) {
      const interactive = typeof options.onSelect === 'function' && Boolean(view.row.selector) && !(kind === 'skill' && view.row.canAdvance === false);
      const button = createElement(documentRoot, interactive ? 'button' : 'div', kind === 'skill' ? 'ux-skill-row' : 'ux-spell-row');
      if (interactive) button.type = 'button';
      button.dataset.selector = view.row.selector || '';
      button.dataset.confidence = view.row.classificationConfidence;
      if (view.row.selector) button.append(createElement(documentRoot, 'kbd', 'ux-keycap', view.row.selector));
      const copy = createElement(documentRoot, 'span', 'ux-magic-row-copy');
      copy.append(createElement(documentRoot, 'strong', '', view.row.name));
      const facts = createElement(documentRoot, 'span', 'ux-magic-row-facts');
      for (const fact of view.facts) facts.append(createElement(documentRoot, 'small', '', fact));
      copy.append(facts);
      button.append(copy);
      if (view.actionLabel && interactive) button.append(createElement(documentRoot, 'span', 'ux-magic-action', view.actionLabel));
      if (interactive) button.addEventListener('click', () => options.onSelect(view.row));
      mount.append(button);
    }
    return Object.freeze(views);
  }

  function createHelpModel(options = {}) {
    const catalog = options.catalog;
    if (!catalog || typeof catalog.entries !== 'function') throw new TypeError('Help center requires a CommandCatalog');
    let state = Object.freeze({ open: false, section: 'basics', query: '', manualLines: exactLines(options.manualLines || []), returnSection: 'basics', publicState: options.publicState || {} });

    function open(input = {}) {
      const section = sectionIds.includes(input.section) ? input.section : state.section;
      state = Object.freeze({ ...state, open: true, section, query: String(input.query || ''), invoker: input.invoker || null, returnSection: section === 'manual' ? state.section : section });
      return snapshot();
    }
    function close() { state = Object.freeze({ ...state, open: false, query: '' }); return snapshot(); }
    function setSection(section) {
      if (!sectionIds.includes(section)) return snapshot();
      state = Object.freeze({ ...state, section, returnSection: section === 'manual' ? state.section : section });
      return snapshot();
    }
    function back() { return setSection(state.section === 'manual' ? state.returnSection : 'basics'); }
    function search(query) { state = Object.freeze({ ...state, query: String(query || '') }); return snapshot(); }
    function setManual(lines) { state = Object.freeze({ ...state, manualLines: exactLines(lines) }); return snapshot(); }
    function setPublicState(publicState = {}) { state = Object.freeze({ ...state, publicState }); return snapshot(); }

    function visibleContent() {
      const q = clean(state.query);
      const commandEntries = catalog.materialize(state.publicState).filter((command) => !q || contains([command.label, command.publicShortcut, ...command.aliases].join(' '), q));
      const filteredBasics = basics.filter((topic) => !q || contains(`${topic.title} ${topic.text}`, q));
      const filteredMovement = movementTopics.filter((topic) => !q || contains(`${topic.title} ${topic.shortcut} ${topic.text}`, q));
      const filteredMagic = magicNotes.filter((topic) => !q || contains(`${topic.title} ${topic.text}`, q));
      const manualMatches = state.manualLines.map((line, index) => Object.freeze({ line, lineNumber: index + 1 })).filter((entry) => !q || contains(entry.line, q));
      return Object.freeze({ basics: Object.freeze(filteredBasics), movement: Object.freeze(filteredMovement), magic: Object.freeze(filteredMagic), commands: Object.freeze(commandEntries), manual: Object.freeze(manualMatches) });
    }
    function snapshot() { return Object.freeze({ ...state, content: visibleContent() }); }
    return Object.freeze({ version, open, close, setSection, back, search, setManual, setPublicState, snapshot });
  }

  function createElement(documentRoot, tag, className = '', text = '') {
    const element = documentRoot.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function createHelpController(options = {}) {
    const documentRoot = options.documentRoot || (typeof document !== 'undefined' ? document : null);
    const mount = options.mount;
    if (!documentRoot || !mount) throw new TypeError('Help controller requires documentRoot and mount');
    const model = createHelpModel({ catalog: options.catalog, manualLines: options.manualLines });
    const dialogService = options.dialogService || null;
    const dialog = createElement(documentRoot, 'dialog', 'ux-help-center');
    dialog.id = 'ux-help-center';
    dialog.setAttribute('aria-labelledby', 'ux-help-title');
    const frame = createElement(documentRoot, 'div', 'ux-help-frame');
    const header = createElement(documentRoot, 'header', 'ux-help-heading');
    const copy = createElement(documentRoot, 'div');
    copy.append(createElement(documentRoot, 'span', 'ux-discovery-kicker', 'Reference'));
    const title = createElement(documentRoot, 'h2', '', 'Help and commands');
    title.id = 'ux-help-title';
    copy.append(title);
    header.append(copy);
    const searchLabel = createElement(documentRoot, 'label', 'ux-help-search');
    searchLabel.append(createElement(documentRoot, 'span', '', 'Search Help'));
    const searchInput = createElement(documentRoot, 'input');
    searchInput.type = 'search';
    searchInput.autocomplete = 'off';
    searchLabel.append(searchInput);
    const tabs = createElement(documentRoot, 'div', 'ux-help-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const section of sectionIds) {
      const button = createElement(documentRoot, 'button', '', section[0].toUpperCase() + section.slice(1));
      button.type = 'button';
      button.dataset.helpSection = section;
      button.setAttribute('role', 'tab');
      tabs.append(button);
    }
    const body = createElement(documentRoot, 'div', 'ux-help-body');
    const footer = createElement(documentRoot, 'footer', 'dialog-actions ux-help-actions');
    const backButton = createElement(documentRoot, 'button', '', 'Back');
    backButton.type = 'button';
    const footerClose = createElement(documentRoot, 'button', 'primary', 'Close');
    footerClose.type = 'button';
    footer.append(backButton, footerClose);
    frame.append(header, searchLabel, tabs, body, footer);
    dialog.append(frame);
    mount.append(dialog);

    function topicNode(topic) {
      const node = createElement(documentRoot, 'article', 'ux-help-topic');
      const heading = createElement(documentRoot, 'h3', '', topic.title);
      if (topic.shortcut) heading.append(createElement(documentRoot, 'kbd', 'ux-keycap', topic.shortcut));
      node.append(heading, createElement(documentRoot, 'p', '', topic.text));
      return node;
    }

    function render() {
      const snapshot = model.snapshot();
      searchInput.value = snapshot.query;
      for (const button of tabs.querySelectorAll('[data-help-section]')) {
        const selected = button.dataset.helpSection === snapshot.section;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        button.classList.toggle('ux-state-selected', selected);
      }
      backButton.hidden = snapshot.section !== 'manual';
      body.replaceChildren();
      if (snapshot.section === 'basics') snapshot.content.basics.forEach((topic) => body.append(topicNode(topic)));
      if (snapshot.section === 'keys') {
        snapshot.content.movement.forEach((topic) => body.append(topicNode(topic)));
        snapshot.content.magic.forEach((topic) => body.append(topicNode(topic)));
      }
      if (snapshot.section === 'commands') {
        for (const command of snapshot.content.commands) {
          const row = createElement(documentRoot, 'div', 'ux-help-command');
          const commandCopy = createElement(documentRoot, 'span');
          commandCopy.append(createElement(documentRoot, 'strong', '', command.label));
          if (command.aliases.length) commandCopy.append(createElement(documentRoot, 'small', '', command.aliases.join(', ')));
          row.append(commandCopy);
          if (command.publicShortcut) row.append(createElement(documentRoot, 'kbd', 'ux-keycap', command.publicShortcut));
          body.append(row);
        }
      }
      if (snapshot.section === 'manual') {
        const pre = createElement(documentRoot, 'pre', 'ux-manual-text');
        pre.textContent = snapshot.content.manual.map((entry) => entry.line).join('\n');
        body.append(pre);
      }
      if (!body.childNodes.length) {
        const empty = createElement(documentRoot, 'div', 'ux-help-empty');
        empty.append(createElement(documentRoot, 'strong', '', 'No matches in this section'));
        empty.append(createElement(documentRoot, 'p', '', 'Try another term or choose a different section.'));
        body.append(empty);
      }
      return snapshot;
    }

    function open(input = {}) {
      model.open(input);
      render();
      dialogService?.focus?.prepareOpen?.(dialog, input.invoker || documentRoot.activeElement);
      if (!dialog.open) dialog.showModal();
      dialogService?.focus?.open?.({ id: 'help-center', element: dialog, domain: 'discovery', initialFocus: searchInput, returnFocus: 'invoker', escapePolicy: 'close' });
      searchInput.focus({ preventScroll: true });
      return model.snapshot();
    }
    function close(reason = 'close') {
      const invoker = model.snapshot().invoker;
      model.close();
      if (dialog.open) dialog.close(reason);
      dialogService?.focus?.close?.(dialog);
      const invokerDialog = invoker?.closest?.('dialog');
      if (invoker?.isConnected && (!invokerDialog || invokerDialog.open)) invoker.focus?.({ preventScroll: true });
    }
    dialog.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close('escape'); }
    });
    searchInput.addEventListener('input', () => { model.search(searchInput.value); render(); });
    tabs.addEventListener('click', (event) => { const section = event.target.closest?.('[data-help-section]')?.dataset.helpSection; if (section) { model.setSection(section); render(); } });
    tabs.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const buttons = Array.from(tabs.querySelectorAll('[data-help-section]'));
      const current = Math.max(0, buttons.indexOf(documentRoot.activeElement));
      const next = event.key === 'Home' ? 0 : (event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length);
      model.setSection(buttons[next].dataset.helpSection);
      render();
      tabs.querySelector(`[data-help-section="${buttons[next].dataset.helpSection}"]`)?.focus({ preventScroll: true });
    });
    backButton.addEventListener('click', () => { model.back(); render(); });
    footerClose.addEventListener('click', () => close());
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close('escape'); });
    return Object.freeze({ version, model, element: dialog, open, close, render, setManual(lines) { model.setManual(lines); return render(); } });
  }

  return Object.freeze({
    version, sectionIds, movementTopics, basics, magicNotes, exactLines, normalizeSpellRow, normalizeSkillRow, normalizeMagicRowsSnapshot, magicRowView, renderMagicRows,
    normalizeProvenance, createHelpModel, createHelpController,
  });
}));
