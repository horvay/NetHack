(function initUxAppShell(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.NetHackUxAppShell = api;
    api.installBrowserShell();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(root) {
  const version = 'nethack-app-shell/v1';

  function tuplesToMap(value) {
    if (value instanceof Map) return new Map(value);
    if (Array.isArray(value)) return new Map(value.filter((entry) => Array.isArray(entry) && entry.length >= 2));
    return new Map(Object.entries(value || {}).map(([key, entry]) => [Number(key), entry]));
  }

  function hasCanonicalMessageContent(lines) {
    return Array.from(lines || [], (line) => String(line ?? '')).some((line) => line.trim());
  }

  function levelDestinationLabel(value) {
    const clean = String(value || '').replace(/^Dlvl:\s*/i, '').trim();
    if (!clean) return '';
    if (/^\d+$/.test(clean)) return `Dungeon level ${clean}`;
    const branchLevel = /^(.*?):\s*(\d+)$/.exec(clean);
    if (branchLevel) return `${branchLevel[1].trim()}, level ${branchLevel[2]}`;
    return /^Dungeon level\b/i.test(clean) ? clean : `Dungeon level ${clean}`;
  }

  function computeFollowTranslation({ containerWidth, containerHeight, contentWidth, contentHeight, cursorCenterX, cursorCenterY }) {
    function axis(container, content, cursor) {
      if (![container, content, cursor].every(Number.isFinite)) return 0;
      if (content <= container) return Math.round((container - content) / 2);
      return Math.round(Math.max(container - content, Math.min(0, container / 2 - cursor)));
    }
    return Object.freeze({
      x: axis(Number(containerWidth), Number(contentWidth), Number(cursorCenterX)),
      y: axis(Number(containerHeight), Number(contentHeight), Number(cursorCenterY)),
    });
  }

  function createAppShellController(options = {}) {
    const globalRoot = options.root || root;
    const runtime = options.runtime;
    const documentRoot = options.documentRoot || globalRoot?.document;
    let connected = false;
    let previousDungeon = '';
    let pendingMapFocus = false;
    let settingsStore;
    let settings;
    let hudDensity = 'compact';
    let statusMount;
    let messageMount;
    let consequenceFeed;
    let historyDialog;
    let characterSheet;
    let historyButton;
    let characterButton;
    let densityButton;
    let mapModeButton;
    let subscription;
    const cleanupListeners = [];

    function noticeService() { return runtime?.service?.('notice'); }
    function dialogService() { return runtime?.service?.('dialog'); }

    function publicGameFacts() {
      return runtime?.latestPublicState?.()?.snapshot?.game || {};
    }

    function renderStatusFacts(values = publicGameFacts().statusValues || []) {
      return globalRoot.NetHackUxStatusPresentation?.renderStatusPresentation?.(statusMount, values, {
        documentRoot,
        density: hudDensity,
        adaptive: true,
        onExplain(item, explanation) {
          noticeService()?.show?.({
            id: `status:explain:${item.field ?? item.label}`,
            dedupeKey: `status:explain:${item.field ?? item.label}`,
            kind: item.severity === 'danger' ? 'warning' : 'info',
            message: explanation,
            source: 'presentation',
            persistence: 'transient',
          });
        },
      });
    }

    function renderMessageFacts() {
      if (!messageMount) return [];
      const wasNearBottom = messageMount.scrollHeight - messageMount.scrollTop - messageMount.clientHeight <= 32;
      const previousScrollTop = messageMount.scrollTop;
      const events = consequenceFeed?.render?.(messageMount, documentRoot) || [];
      if (!wasNearBottom) messageMount.scrollTop = Math.min(previousScrollTop, Math.max(0, messageMount.scrollHeight - messageMount.clientHeight));
      return events;
    }

    function recordDiagnostic(type, detail = {}) {
      try { options.onDiagnostic?.({ type, detail }); } catch {}
    }

    function ensureButton(id, label, className = '') {
      let button = documentRoot.getElementById(id);
      if (!button) {
        button = documentRoot.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = className;
      }
      button.textContent = label;
      return button;
    }

    function configureStructure() {
      const body = documentRoot.body;
      const topBar = documentRoot.getElementById('top-bar');
      const stats = documentRoot.getElementById('stats-panel');
      const noticeMount = documentRoot.getElementById('ux-player-notice-root');
      const quick = documentRoot.getElementById('quick-actions');
      const inventory = documentRoot.getElementById('inventory-equipment-button');
      const commands = documentRoot.getElementById('open-actions');
      const logPanel = documentRoot.getElementById('log-panel');
      if (!body || !topBar || !stats || !noticeMount || !quick || !inventory || !commands || !logPanel) throw new Error('UXM-02 shell mount is incomplete');

      body.classList.add('uxm02-shell-active');
      topBar.append(noticeMount);
      stats.setAttribute('aria-label', 'Hero and urgent status');
      inventory.textContent = 'Inventory';
      inventory.title = 'Open Inventory and Equipment (i)';
      commands.textContent = 'Commands';
      commands.title = 'Open commands and actions';

      let label = quick.querySelector('.ux-command-entry-label');
      if (!label) {
        label = documentRoot.createElement('span');
        label.className = 'ux-command-entry-label';
        label.textContent = 'Command';
        quick.prepend(label);
      }
      characterButton = ensureButton('ux-character-button', 'Character', 'ux-shell-action');
      historyButton = ensureButton('ux-history-button', 'History', 'ux-shell-action');
      densityButton = ensureButton('ux-hud-density-button', 'HUD: Compact', 'ux-shell-action');
      mapModeButton = ensureButton('ux-map-mode-button', 'View: Full', 'ux-shell-action');
      mapModeButton.setAttribute('aria-pressed', 'false');
      quick.append(characterButton, historyButton, densityButton, mapModeButton);

      const heading = logPanel.querySelector('.log-heading');
      if (heading) {
        const strong = heading.querySelector('strong');
        const hint = heading.querySelector('span');
        if (strong) strong.textContent = 'Latest consequences';
        if (hint) hint.textContent = 'Exact messages, newest last.';
      }
      const legacyHistory = documentRoot.getElementById('message-history');
      if (legacyHistory) legacyHistory.hidden = true;
    }

    function persistPresentationPatch(patch) {
      if (!settingsStore) return;
      const outcome = settingsStore.save(patch);
      settings = outcome.settings;
      if (!outcome.persisted) {
        noticeService()?.show?.({ id: 'shell:preference-not-saved', dedupeKey: 'shell:preference-not-saved', kind: 'warning', message: 'This preference is active for this session but could not be saved.', source: 'presentation', persistence: 'transient' });
      }
    }

    function setDensity(value, { persist = true, render = true } = {}) {
      hudDensity = value === 'detailed' ? 'detailed' : 'compact';
      if (render) renderStatusFacts();
      if (densityButton) {
        densityButton.textContent = hudDensity === 'compact' ? 'Stats: Auto' : 'Stats: Full';
        densityButton.setAttribute('aria-pressed', String(hudDensity === 'detailed'));
      }
      documentRoot.body.dataset.uxHudDensity = hudDensity;
      if (persist) persistPresentationPatch({ hudDensity });
      return hudDensity;
    }

    function centerFollowMap() {
      if (documentRoot.body.dataset.uxMapMode !== 'follow') return;
      const playArea = documentRoot.getElementById('play-area');
      const grid = documentRoot.getElementById('game-grid');
      const cursorCell = grid?.querySelector?.('.tile-cell.cursor');
      if (!playArea || !grid || !cursorCell) return;
      const translation = computeFollowTranslation({
        containerWidth: playArea.clientWidth,
        containerHeight: playArea.clientHeight,
        contentWidth: grid.scrollWidth,
        contentHeight: grid.scrollHeight,
        cursorCenterX: cursorCell.offsetLeft + cursorCell.offsetWidth / 2,
        cursorCenterY: cursorCell.offsetTop + cursorCell.offsetHeight / 2,
      });
      grid.style.setProperty('--ux-follow-x', `${translation.x}px`);
      grid.style.setProperty('--ux-follow-y', `${translation.y}px`);
    }

    function setMapMode(value, { persist = true } = {}) {
      const mode = value === 'follow' ? 'follow' : 'full';
      documentRoot.body.dataset.uxMapMode = mode;
      if (mapModeButton) {
        mapModeButton.textContent = mode === 'follow' ? 'View: Follow' : 'View: Full';
        mapModeButton.setAttribute('aria-pressed', String(mode === 'follow'));
      }
      if (mode === 'full') {
        const grid = documentRoot.getElementById('game-grid');
        grid?.style.removeProperty('--ux-follow-x');
        grid?.style.removeProperty('--ux-follow-y');
      } else globalRoot.requestAnimationFrame?.(centerFollowMap);
      if (persist) persistPresentationPatch({ map: { mode } });
      return mode;
    }

    function presentationOwnerActive(game) {
      const top = dialogService()?.focus?.top?.();
      return Boolean(top || game?.activePrompt || game?.currentMenu?.awaitingSelection);
    }

    function focusMapWhenSafe() {
      if (!pendingMapFocus || presentationOwnerActive(publicGameFacts())) return false;
      const map = documentRoot.getElementById('game-grid');
      if (!map?.focus) return false;
      pendingMapFocus = false;
      map.focus({ preventScroll: true });
      return true;
    }

    function handleLevelTransition(game) {
      const byField = tuplesToMap(game?.statusValues);
      const nextDungeon = String(byField.get(20) || '').trim();
      if (!nextDungeon) {
        previousDungeon = '';
        return;
      }
      if (!previousDungeon) {
        previousDungeon = nextDungeon;
        return;
      }
      if (nextDungeon === previousDungeon) return;
      previousDungeon = nextDungeon;
      const destination = levelDestinationLabel(nextDungeon);
      if (!destination) return;
      noticeService()?.show?.({
        id: `level:${game?.mapRevision || 0}:${nextDungeon}`,
        dedupeKey: `level:${game?.mapRevision || 0}:${nextDungeon}`,
        kind: 'info',
        message: destination,
        source: 'result',
        persistence: 'transient',
      });
      pendingMapFocus = true;
      focusMapWhenSafe();
    }

    function openingChronicleLines(canonicalMessages = []) {
      const body = documentRoot.getElementById('intro-body');
      const bodyText = String(body?.innerText || body?.textContent || '').trim();
      if (!bodyText) return [];
      const lines = Array.from(canonicalMessages || [], (line) => String(line ?? ''));
      const welcomeIndex = lines.findIndex((line) => /welcome to NetHack!/i.test(line));
      if (welcomeIndex > 0) return lines.slice(0, welcomeIndex).filter((line) => line.trim());
      return bodyText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    }

    function update(snapshot) {
      const game = snapshot?.game || {};
      documentRoot.body.dataset.uxPromptOwned = String(Boolean(game.activePrompt || game.currentMenu?.awaitingSelection));
      renderStatusFacts(game.statusValues || []);
      characterSheet?.update?.(game.statusValues || []);
      const canonicalMessages = game.messages || [];
      consequenceFeed?.syncCanonicalLines?.(canonicalMessages, { source: 'core-message' });
      if (hasCanonicalMessageContent(canonicalMessages)) consequenceFeed?.setOpeningChronicle?.(openingChronicleLines(canonicalMessages));
      renderMessageFacts();
      if (historyDialog?.dialog?.()?.open) historyDialog.render();
      handleLevelTransition(game);
      focusMapWhenSafe();
      if (documentRoot.body.dataset.uxMapMode === 'follow') globalRoot.requestAnimationFrame?.(centerFollowMap);
    }

    function connect() {
      if (connected || !documentRoot) return false;
      connected = true;
      try {
        configureStructure();
        settingsStore = globalRoot.NetHackUxSettingsStore?.createSettingsStore?.({ storage: globalRoot.localStorage, onDiagnostic: (entry) => recordDiagnostic(entry.type, entry.detail) });
        settings = settingsStore?.load?.().settings || globalRoot.NetHackUxSettingsStore?.defaultSettings || { hudDensity: 'compact', map: { mode: 'full' } };
        consequenceFeed = globalRoot.NetHackUxConsequenceFeed?.createConsequenceFeed?.({ feedLimit: 10 });
        const model = globalRoot.NetHackUxMessagePresentation?.createHistoryModel?.(consequenceFeed.log);
        historyDialog = globalRoot.NetHackUxMessagePresentation?.createHistoryDialog?.({ documentRoot, model, log: consequenceFeed.log, dialogService: dialogService(), noticeService: noticeService(), mount: documentRoot.body });
        characterSheet = globalRoot.NetHackUxCharacterSheet?.createCharacterSheet?.({ documentRoot, dialogService: dialogService(), mount: documentRoot.body });
        statusMount = documentRoot.getElementById('stats-panel');
        messageMount = documentRoot.getElementById('messages');
        setDensity(settings.hudDensity, { persist: false, render: false });
        setMapMode(settings.map?.mode, { persist: false });
        const listen = (target, type, listener, options) => {
          target?.addEventListener?.(type, listener, options);
          cleanupListeners.push(() => target?.removeEventListener?.(type, listener, options));
        };
        listen(characterButton, 'click', () => characterSheet?.open?.(publicGameFacts().statusValues || [], characterButton));
        listen(historyButton, 'click', () => historyDialog?.open?.(historyButton));
        listen(densityButton, 'click', () => setDensity(hudDensity === 'compact' ? 'detailed' : 'compact'));
        listen(mapModeButton, 'click', () => setMapMode(documentRoot.body.dataset.uxMapMode === 'follow' ? 'full' : 'follow'));
        listen(globalRoot, 'resize', () => { if (documentRoot.body.dataset.uxMapMode === 'follow') globalRoot.requestAnimationFrame?.(centerFollowMap); });
        listen(documentRoot, 'close', () => globalRoot.setTimeout?.(focusMapWhenSafe, 0), true);
        if (!runtime?.latestPublicState?.()?.snapshot) {
          renderStatusFacts([]);
          renderMessageFacts();
        }
        subscription = runtime?.subscribePublicState?.('shell', update);
        recordDiagnostic('shell.connected', { density: settings.hudDensity, mapMode: settings.map?.mode || 'full' });
        return true;
      } catch (error) {
        connected = false;
        recordDiagnostic('shell.connection-failed', { message: String(error?.message || error) });
        throw error;
      }
    }

    return Object.freeze({
      version,
      connect,
      disconnect() {
        subscription?.unsubscribe?.();
        while (cleanupListeners.length) cleanupListeners.pop()();
        connected = false;
      },
      update,
      resetForRun(runIdentity) {
        if (!consequenceFeed) throw new Error('App shell must be connected before resetting consequence History');
        const outcome = consequenceFeed.resetForRun(runIdentity);
        if (outcome.reset) {
          renderMessageFacts();
          if (historyDialog?.dialog?.()?.open) historyDialog.render();
        }
        return outcome;
      },
      setDensity,
      setMapMode,
      centerFollowMap,
      state: () => Object.freeze({ connected, density: hudDensity || settings?.hudDensity || 'compact', mapMode: documentRoot?.body?.dataset?.uxMapMode || 'full', previousDungeon, pendingMapFocus, messageCount: consequenceFeed?.log?.size?.() || 0 }),
    });
  }

  let browserController;
  function installBrowserShell() {
    const runtime = root?.NetHackUxRuntime?.runtime;
    if (!runtime || !root?.document) return null;
    if (runtime.domain?.('shell')) return runtime.domain('shell');
    browserController = createAppShellController({
      root,
      runtime,
      documentRoot: root.document,
      onDiagnostic: (entry) => {
        try { root.netHackAPI?.diagnosticEvent?.({ layer: 'renderer', category: 'shell', type: entry.type, payload: entry.detail || {} }); } catch {}
      },
    });
    runtime.registerDomain('shell', browserController);
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => browserController.connect(), { once: true });
    else root.setTimeout(() => browserController.connect(), 0);
    return browserController;
  }

  return Object.freeze({ version, tuplesToMap, hasCanonicalMessageContent, levelDestinationLabel, computeFollowTranslation, createAppShellController, installBrowserShell, browserController: () => browserController });
}));
