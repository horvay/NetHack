(function initUxMessagePresentation(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../shared/message-log.js'));
  else root.NetHackUxMessagePresentation = factory(root.NetHackMessageLog);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(MessageLog) {
  const version = 'nethack-message-presentation/v1';

  function createHistoryModel(log) {
    if (!log?.search || !log?.events) throw new TypeError('History requires a MessageEvent store');
    let query = '';
    let selectedId = '';

    function results() {
      return log.search(query, { includeOpeningChronicle: true });
    }

    function select(id) {
      const value = String(id || '');
      selectedId = log.events().some((event) => event.id === value) ? value : '';
      return selected();
    }

    function selected() {
      return log.events().find((event) => event.id === selectedId) || null;
    }

    return Object.freeze({
      setQuery(value) { query = String(value || ''); return results(); },
      query: () => query,
      results,
      select,
      selected,
      clearSelection() { selectedId = ''; },
    });
  }

  function createHistoryDialog(options = {}) {
    const documentRoot = options.documentRoot || (typeof document !== 'undefined' ? document : null);
    const model = options.model || createHistoryModel(options.log);
    const dialogService = options.dialogService;
    const noticeService = options.noticeService;
    let invoker = null;
    let dialog;
    let searchInput;
    let rows;
    let lore;
    let copyButton;
    let resultCount;

    function notify(input) {
      try { noticeService?.show?.(input); } catch {}
    }

    function build() {
      if (dialog || !documentRoot?.createElement) return;
      dialog = documentRoot.createElement('dialog');
      dialog.id = 'ux-message-history-dialog';
      dialog.className = 'ux-history-dialog';
      const form = documentRoot.createElement('form');
      form.method = 'dialog';
      form.className = 'ux-history-frame';
      const heading = documentRoot.createElement('div');
      heading.className = 'ux-surface-heading';
      const headingCopy = documentRoot.createElement('div');
      const kicker = documentRoot.createElement('span');
      kicker.className = 'ux-surface-kicker';
      kicker.textContent = 'Canonical record';
      const title = documentRoot.createElement('h2');
      title.id = 'ux-message-history-title';
      title.textContent = 'History';
      const description = documentRoot.createElement('p');
      description.id = 'ux-message-history-description';
      description.textContent = 'Search exact NetHack messages from this run.';
      headingCopy.append(kicker, title, description);
      const close = documentRoot.createElement('button');
      close.type = 'button';
      close.textContent = 'Close';
      close.addEventListener('click', () => closeDialog());
      heading.append(headingCopy, close);

      const searchLabel = documentRoot.createElement('label');
      searchLabel.className = 'ux-history-search';
      const labelText = documentRoot.createElement('span');
      labelText.textContent = 'Search history';
      searchInput = documentRoot.createElement('input');
      searchInput.type = 'search';
      searchInput.autocomplete = 'off';
      searchInput.placeholder = 'Message text';
      searchInput.addEventListener('input', () => { model.setQuery(searchInput.value); model.clearSelection(); render(); });
      resultCount = documentRoot.createElement('span');
      resultCount.className = 'ux-history-count';
      searchLabel.append(labelText, searchInput, resultCount);

      lore = documentRoot.createElement('details');
      lore.className = 'ux-opening-chronicle';
      const loreSummary = documentRoot.createElement('summary');
      loreSummary.textContent = 'Opening chronicle';
      const loreBody = documentRoot.createElement('pre');
      loreBody.className = 'ux-opening-chronicle-body';
      lore.append(loreSummary, loreBody);

      rows = documentRoot.createElement('div');
      rows.className = 'ux-history-rows';
      rows.addEventListener('click', (event) => {
        const button = event.target.closest?.('[data-message-id]');
        if (!button) return;
        model.select(button.dataset.messageId);
        render();
      });

      const actions = documentRoot.createElement('menu');
      actions.className = 'dialog-actions ux-surface-actions';
      copyButton = documentRoot.createElement('button');
      copyButton.type = 'button';
      copyButton.textContent = 'Copy selected';
      copyButton.disabled = true;
      copyButton.addEventListener('click', copySelected);
      const done = documentRoot.createElement('button');
      done.type = 'button';
      done.className = 'primary';
      done.textContent = 'Close';
      done.addEventListener('click', () => closeDialog());
      actions.append(copyButton, done);
      form.append(heading, searchLabel, lore, rows, actions);
      dialog.append(form);
      (options.mount || documentRoot.body).append(dialog);

      dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
      dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        closeDialog();
      });
      dialogService?.apply?.({
        dialog,
        titleElement: title,
        descriptionElement: description,
        optionsElement: rows,
        choices: [],
        spec: {
          id: 'message-history', family: 'document', title: 'History',
          visibleDescription: description.textContent, initialFocus: () => searchInput,
          returnFocus: 'invoker', escapePolicy: 'close', closeKind: 'close', secondaryActions: [],
        },
      });
    }

    function render() {
      build();
      const outcome = model.results();
      rows.replaceChildren();
      resultCount.textContent = `${outcome.events.length} ${outcome.events.length === 1 ? 'message' : 'messages'}`;
      if (!outcome.events.length) {
        const empty = documentRoot.createElement('p');
        empty.className = 'ux-history-empty';
        empty.textContent = 'No messages match this search.';
        rows.append(empty);
      } else {
        for (const message of outcome.events) {
          const row = documentRoot.createElement('button');
          row.type = 'button';
          row.className = 'ux-history-row';
          row.dataset.messageId = message.id;
          row.dataset.selected = String(model.selected()?.id === message.id);
          const meta = documentRoot.createElement('span');
          meta.className = 'ux-history-row-meta';
          meta.textContent = Number.isSafeInteger(message.turn) ? `Turn ${message.turn}` : `Message ${message.sequence}`;
          const text = documentRoot.createElement('span');
          text.className = 'ux-history-row-text';
          text.textContent = message.canonicalText;
          row.append(meta, text);
          rows.append(row);
        }
      }
      const loreBody = lore.querySelector('.ux-opening-chronicle-body');
      lore.hidden = outcome.openingChronicle.length === 0;
      loreBody.textContent = outcome.openingChronicle.join('\n');
      copyButton.disabled = !model.selected();
    }

    async function copySelected() {
      const selected = model.selected();
      if (!selected) return false;
      try {
        const writer = options.clipboard?.writeText ? options.clipboard : globalThis.navigator?.clipboard;
        if (!writer?.writeText) throw new Error('clipboard unavailable');
        await writer.writeText(selected.canonicalText);
        notify({ id: `history:copied:${selected.id}`, kind: 'success', message: 'Message copied', source: 'presentation', persistence: 'transient' });
        return true;
      } catch {
        notify({ id: `history:copy-failed:${selected.id}`, kind: 'error', message: 'This message could not be copied.', source: 'presentation', persistence: 'transient' });
        return false;
      }
    }

    function open(nextInvoker) {
      build();
      invoker = nextInvoker || documentRoot.activeElement;
      render();
      dialogService?.focus?.prepareOpen?.(dialog, invoker);
      dialog.showModal();
      dialogService?.focus?.open?.({ id: 'message-history', element: dialog, domain: 'shell', initialFocus: () => searchInput, returnFocus: invoker, escapePolicy: 'close', invoker });
      searchInput.focus({ preventScroll: true });
      return true;
    }

    function closeDialog() {
      if (!dialog?.open) return false;
      dialog.close('close');
      dialogService?.focus?.close?.(dialog);
      return true;
    }

    return Object.freeze({ version, model, open, close: closeDialog, render, dialog: () => dialog });
  }

  return Object.freeze({ version, createHistoryModel, createHistoryDialog });
}));
