(function initUxCharacterSheet(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../shared/status-hud.js'));
  else root.NetHackUxCharacterSheet = factory(root.NetHackStatusHud);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(StatusHud) {
  const version = 'nethack-character-sheet/v1';

  function buildCharacterSheetModel(values) {
    const groups = StatusHud.buildDetailStatusGroups(values)
      .filter((group) => group.id !== 'other')
      .map((group) => Object.freeze({
        id: group.id,
        label: group.label,
        rows: Object.freeze(group.items.map((item) => Object.freeze({ label: item.label, value: item.value, severity: item.severity || '' }))),
      }))
      .filter((group) => group.rows.length);
    const hero = groups.find((group) => group.id === 'identity')?.rows.find((row) => row.label === 'Name / role')?.value || 'Character';
    return Object.freeze({ hero, groups: Object.freeze(groups) });
  }

  function createCharacterSheet(options = {}) {
    const documentRoot = options.documentRoot || (typeof document !== 'undefined' ? document : null);
    const dialogService = options.dialogService;
    let values = [];
    let dialog;
    let content;
    let title;
    let invoker;

    function build() {
      if (dialog || !documentRoot?.createElement) return;
      dialog = documentRoot.createElement('dialog');
      dialog.id = 'ux-character-sheet-dialog';
      dialog.className = 'ux-character-sheet-dialog';
      const frame = documentRoot.createElement('div');
      frame.className = 'ux-character-sheet-frame';
      const heading = documentRoot.createElement('div');
      heading.className = 'ux-surface-heading';
      const headingCopy = documentRoot.createElement('div');
      const kicker = documentRoot.createElement('span');
      kicker.className = 'ux-surface-kicker';
      kicker.textContent = 'Current public record';
      title = documentRoot.createElement('h2');
      title.id = 'ux-character-sheet-title';
      title.textContent = 'Character';
      const description = documentRoot.createElement('p');
      description.id = 'ux-character-sheet-description';
      description.textContent = 'Attributes and details reported by NetHack.';
      headingCopy.append(kicker, title, description);
      const topClose = documentRoot.createElement('button');
      topClose.type = 'button';
      topClose.textContent = 'Close';
      topClose.addEventListener('click', () => close());
      heading.append(headingCopy, topClose);
      content = documentRoot.createElement('div');
      content.className = 'ux-character-sheet-content';
      const actions = documentRoot.createElement('menu');
      actions.className = 'dialog-actions ux-surface-actions';
      const done = documentRoot.createElement('button');
      done.type = 'button';
      done.className = 'primary';
      done.textContent = 'Close';
      done.addEventListener('click', () => close());
      actions.append(done);
      frame.append(heading, content, actions);
      dialog.append(frame);
      (options.mount || documentRoot.body).append(dialog);
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
      dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
      });
      dialogService?.apply?.({
        dialog,
        titleElement: title,
        descriptionElement: description,
        optionsElement: content,
        choices: [],
        spec: { id: 'character-sheet', family: 'document', title: 'Character', description: description.textContent, initialFocus: 'heading', returnFocus: 'invoker', escapePolicy: 'close', closeKind: 'close', secondaryActions: [] },
      });
    }

    function render() {
      build();
      const model = buildCharacterSheetModel(values);
      title.textContent = model.hero;
      content.replaceChildren();
      for (const group of model.groups) {
        const section = documentRoot.createElement('section');
        section.className = 'ux-character-sheet-section';
        section.dataset.group = group.id;
        const heading = documentRoot.createElement('h3');
        heading.textContent = group.label;
        const list = documentRoot.createElement('dl');
        for (const row of group.rows) {
          const term = documentRoot.createElement('dt');
          term.textContent = row.label;
          const value = documentRoot.createElement('dd');
          value.textContent = row.value;
          if (row.severity) value.dataset.severity = row.severity;
          list.append(term, value);
        }
        section.append(heading, list);
        content.append(section);
      }
      if (!model.groups.length) {
        const empty = documentRoot.createElement('p');
        empty.className = 'ux-character-sheet-empty';
        empty.textContent = 'Character details will appear when the dungeon starts.';
        content.append(empty);
      }
      return model;
    }

    function open(nextValues, nextInvoker) {
      values = nextValues || values;
      build();
      invoker = nextInvoker || documentRoot.activeElement;
      render();
      dialogService?.focus?.prepareOpen?.(dialog, invoker);
      dialog.showModal();
      dialogService?.focus?.open?.({ id: 'character-sheet', element: dialog, domain: 'shell', initialFocus: () => title, returnFocus: invoker, escapePolicy: 'close', invoker });
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
      return true;
    }

    function close() {
      if (!dialog?.open) return false;
      dialog.close('close');
      dialogService?.focus?.close?.(dialog);
      return true;
    }

    return Object.freeze({ version, open, close, render, update(nextValues) { values = nextValues || []; if (dialog?.open) render(); }, dialog: () => dialog });
  }

  return Object.freeze({ version, buildCharacterSheetModel, createCharacterSheet });
}));
