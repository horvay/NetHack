(function initUxAppMounts(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxAppMounts = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-ux-mounts/v1';
  const mountIds = Object.freeze({
    runtime: 'ux-runtime-root',
    shell: 'ux-shell-root',
    playerNotice: 'ux-player-notice-root',
    status: 'stats-panel',
    contextActions: 'context-action-bar',
    map: 'game-grid',
    consequences: 'messages',
    history: 'message-history',
    discovery: 'ux-discovery-root',
    dialogs: 'ux-dialog-root',
    mapOverlay: 'ux-map-overlay-root',
    items: 'ux-items-root',
    transfer: 'ux-transfer-root',
    runLifecycle: 'ux-run-lifecycle-root',
    feedback: 'ux-feedback-root',
  });

  function lookupMount(name, documentRoot) {
    const id = mountIds[name];
    if (!id) throw new TypeError(`Unknown UX mount: ${String(name || '(empty)')}`);
    const scope = documentRoot || (typeof document !== 'undefined' ? document : null);
    const mount = scope?.getElementById?.(id) || null;
    if (!mount) throw new Error(`Missing UX mount #${id}`);
    return mount;
  }

  function inspectMounts(documentRoot) {
    return Object.freeze(Object.entries(mountIds).map(([name, id]) => Object.freeze({ name, id, present: Boolean(documentRoot?.getElementById?.(id)) })));
  }

  return Object.freeze({ version, mountIds, lookupMount, inspectMounts });
}));
