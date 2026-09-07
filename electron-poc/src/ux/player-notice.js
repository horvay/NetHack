(function initUxPlayerNotice(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxPlayerNotice = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-player-notice/v1';
  const kinds = Object.freeze(['info', 'success', 'warning', 'error']);
  const sources = Object.freeze(['result', 'prompt', 'recovery', 'presentation']);
  const persistences = Object.freeze(['transient', 'until-state-change', 'sticky']);

  function cleanText(value, field, required = false) {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (required && !text) throw new TypeError(`PlayerNotice.${field} is required`);
    return text;
  }

  function normalizeNotice(input = {}, now = Date.now) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('PlayerNotice must be an object');
    const kind = kinds.includes(input.kind) ? input.kind : 'info';
    const source = sources.includes(input.source) ? input.source : 'presentation';
    const persistence = persistences.includes(input.persistence) ? input.persistence : 'transient';
    const action = typeof input.action === 'function' ? input.action : undefined;
    const actionLabel = cleanText(input.actionLabel, 'actionLabel');
    if (Boolean(action) !== Boolean(actionLabel)) throw new TypeError('PlayerNotice action and actionLabel must be supplied together');
    const notice = {
      id: cleanText(input.id, 'id', true),
      kind,
      message: cleanText(input.message, 'message', true),
      source,
      persistence,
      createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : Number(now()),
    };
    if (actionLabel) notice.actionLabel = actionLabel;
    if (action) notice.action = action;
    const dedupeKey = cleanText(input.dedupeKey, 'dedupeKey');
    if (dedupeKey) notice.dedupeKey = dedupeKey;
    const diagnosticRef = cleanText(input.diagnosticRef, 'diagnosticRef');
    if (diagnosticRef) notice.diagnosticRef = diagnosticRef;
    return Object.freeze(notice);
  }

  function createNoticeService(options = {}) {
    const mount = options.mount || null;
    const documentRoot = options.documentRoot || mount?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {};
    const timers = new Map();
    const history = [];
    const presentedIdentities = new Map();
    const retainedIdentityLimit = Math.max(8, Math.min(2048, Number(options.retainedIdentityLimit) || 256));
    let active = null;
    let runIdentity = '';
    let visible;
    let icon;
    let message;
    let actionButton;

    function diagnostic(type, detail = {}) {
      try { onDiagnostic(Object.freeze({ type, detail: Object.freeze({ ...detail }) })); } catch {}
    }

    function buildDom() {
      if (!mount || !documentRoot?.createElement) return;
      mount.replaceChildren();
      mount.classList?.add('ux-player-notice-mount');
      visible = documentRoot.createElement('div');
      visible.id = 'ux-player-notice';
      visible.className = 'ux-player-notice ux-state-default';
      visible.hidden = true;
      icon = documentRoot.createElement('span');
      icon.className = 'ux-player-notice-icon';
      icon.setAttribute('aria-hidden', 'true');
      message = documentRoot.createElement('span');
      message.className = 'ux-player-notice-message';
      actionButton = documentRoot.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'ux-player-notice-action';
      actionButton.hidden = true;
      visible.append(icon, message, actionButton);
      mount.append(visible);
    }

    function iconFor(kind) {
      return Object.freeze({ info: 'i', success: '✓', warning: '!', error: '!' })[kind] || 'i';
    }

    function feedbackApi() {
      return (typeof globalThis !== 'undefined' ? globalThis.NetHackUxFeedback : null) || null;
    }

    function render(notice) {
      if (!visible) return;
      if (!notice) {
        const hide = () => {
          if (active) return;
          visible.hidden = true;
          visible.removeAttribute('data-kind');
          message.textContent = '';
          actionButton.hidden = true;
          actionButton.onclick = null;
        };
        if (!feedbackApi()?.animateNoticeHide?.(visible, hide)) hide();
        return;
      }
      const previousKind = visible.dataset.kind || '';
      const wasHidden = visible.hidden;
      visible.hidden = false;
      visible.dataset.kind = notice.kind;
      visible.className = `ux-player-notice ux-state-default ux-notice-${notice.kind}`;
      icon.textContent = iconFor(notice.kind);
      message.textContent = notice.message;
      actionButton.hidden = !notice.action;
      actionButton.textContent = notice.actionLabel || '';
      actionButton.onclick = notice.action ? () => {
        try { notice.action(); }
        catch (error) { diagnostic('notice.action-failed', { id: notice.id, message: String(error?.message || error) }); }
      } : null;
      feedbackApi()?.animateNoticeShow?.(visible, { kindChanged: !wasHidden && previousKind && previousKind !== notice.kind });
    }

    function clearTimer(id) {
      const timer = timers.get(id);
      if (timer != null) {
        (options.clearTimeout || clearTimeout)(timer);
        timers.delete(id);
      }
    }

    function stableIdentity(notice) {
      return notice.dedupeKey ? `dedupe:${notice.dedupeKey}` : `notice:${notice.id}`;
    }

    function presentationSignature(notice) {
      return JSON.stringify({
        kind: notice.kind,
        message: notice.message,
        source: notice.source,
        persistence: notice.persistence,
        actionLabel: notice.actionLabel || '',
        diagnosticRef: notice.diagnosticRef || '',
      });
    }

    function retainIdentity(identity, signature) {
      const previous = presentedIdentities.get(identity);
      const signatures = previous ? previous.signatures.slice() : [];
      if (!signatures.includes(signature)) signatures.push(signature);
      while (signatures.length > 8) signatures.shift();
      presentedIdentities.delete(identity);
      presentedIdentities.set(identity, Object.freeze({ latestSignature: signature, signatures: Object.freeze(signatures) }));
      while (presentedIdentities.size > retainedIdentityLimit) {
        presentedIdentities.delete(presentedIdentities.keys().next().value);
      }
    }

    function show(input) {
      const notice = normalizeNotice(input, options.now || Date.now);
      const identity = stableIdentity(notice);
      const signature = presentationSignature(notice);
      const previousIdentity = presentedIdentities.get(identity);
      if (previousIdentity?.signatures.includes(signature)) {
        diagnostic('notice.duplicate-suppressed', { id: notice.id, dedupeKey: notice.dedupeKey || '', identity, kind: notice.kind, source: notice.source });
        return active?.id === notice.id || (active?.dedupeKey && active.dedupeKey === notice.dedupeKey) ? active : notice;
      }
      if (active && stableIdentity(active) === identity) clearTimer(active.id);
      clearTimer(notice.id);
      const updatedIdentity = previousIdentity !== undefined;
      retainIdentity(identity, signature);
      active = notice;
      history.push(notice);
      if (history.length > 100) history.shift();
      render(notice);
      if (notice.persistence === 'transient') {
        const timer = (options.setTimeout || setTimeout)(() => {
          timers.delete(notice.id);
          if (active?.id === notice.id) clear(notice.id);
        }, Number(options.transientMs || 5000));
        timers.set(notice.id, timer);
      }
      diagnostic(updatedIdentity ? 'notice.updated' : 'notice.shown', { id: notice.id, dedupeKey: notice.dedupeKey || '', identity, kind: notice.kind, source: notice.source, persistence: notice.persistence });
      return notice;
    }

    function clear(id = '') {
      if (id && active?.id !== String(id)) return false;
      if (!active) return false;
      const cleared = active;
      clearTimer(cleared.id);
      active = null;
      render(null);
      diagnostic('notice.cleared', { id: cleared.id });
      return true;
    }

    function stateChanged() {
      if (active?.persistence !== 'until-state-change') return false;
      return clear(active.id);
    }

    function beginRun(nextRunIdentity = '') {
      const next = String(nextRunIdentity || '').trim();
      if (next && next === runIdentity) return false;
      for (const id of timers.keys()) clearTimer(id);
      active = null;
      history.length = 0;
      presentedIdentities.clear();
      runIdentity = next;
      render(null);
      diagnostic('notice.run-reset', { runIdentity, retainedIdentityLimit });
      return true;
    }

    buildDom();
    return Object.freeze({
      version,
      show,
      clear,
      stateChanged,
      beginRun,
      current: () => active,
      history: () => Object.freeze(history.slice()),
      retainedIdentities: () => Object.freeze(Array.from(presentedIdentities.keys())),
    });
  }

  return Object.freeze({ version, kinds, sources, persistences, normalizeNotice, createNoticeService });
}));
