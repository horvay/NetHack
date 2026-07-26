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
  function computeCloseUpTranslation({ containerWidth, containerHeight, cursorCenterX, cursorCenterY }) {
    function axis(container, cursor) {
      if (![container, cursor].every(Number.isFinite)) return 0;
      return Math.round(container / 2 - cursor);
    }
    return Object.freeze({
      x: axis(Number(containerWidth), Number(cursorCenterX)),
      y: axis(Number(containerHeight), Number(cursorCenterY)),
    });
  }

  const closeUpRowOptions = Object.freeze([7, 9, 11, 13, 15]);

  function normalizeMapMode(value) {
    return ['full', 'follow', 'close'].includes(value) ? value : 'full';
  }

  function nextMapMode(value) {
    const modes = ['full', 'follow', 'close'];
    return modes[(modes.indexOf(normalizeMapMode(value)) + 1) % modes.length];
  }

  function computeCloseUpTileSize({ containerHeight, closeRows }) {
    const height = Number(containerHeight);
    const rows = closeUpRowOptions.includes(Number(closeRows)) ? Number(closeRows) : 9;
    if (!Number.isFinite(height)) return 18;
    return Math.max(18, Math.min(80, Math.floor((height - 14) / rows)));
  }

  function adjustCloseUpRows(current, direction) {
    const index = closeUpRowOptions.indexOf(Number(current));
    const safeIndex = index < 0 ? closeUpRowOptions.indexOf(9) : index;
    return closeUpRowOptions[Math.max(0, Math.min(closeUpRowOptions.length - 1, safeIndex + Math.sign(Number(direction) || 0)))];
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
    let gameViewSection;
    let layoutResizer;
    let logRatio = 0.5;
    let closeRows = 9;
    let resizeDrag = null;
    const cleanupListeners = [];

    function noticeService() { return runtime?.service?.('notice'); }
    function dialogService() { return runtime?.service?.('dialog'); }

    let lastShellRenderKey = '';
    function statusValuesSignature(statusValues) {
      const byField = tuplesToMap(statusValues);
      if (!byField.size) return '0//';
      return `${byField.size}//${Array.from(byField.entries())
        .sort((left, right) => Number(left[0]) - Number(right[0]))
        .map(([field, value]) => `${field}:${value ?? ''}`)
        .join('|')}`;
    }
    function shellRenderKey(game = {}) {
      const messages = Array.isArray(game.messages) ? game.messages : [];
      const lastMessage = messages.length ? messages[messages.length - 1] : null;
      const prompt = game.activePrompt || null;
      const menu = game.currentMenu || null;
      return [
        statusValuesSignature(game.statusValues),
        messages.length,
        typeof lastMessage === 'string' ? lastMessage : `${lastMessage?.text || ''}:${lastMessage?.id || ''}`,
        prompt?.requestId || prompt?.query || '',
        menu?.requestId || '',
        Boolean(menu?.awaitingSelection),
        documentRoot.body?.classList?.contains?.('map-target-mode') ? 'target' : 'explore',
      ].join('//');
    }

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

    function updateMessageScrollPosition() {
      if (!messageMount) return;
      const viewingEarlier = messageMount.scrollTop > 32;
      const hint = documentRoot.getElementById('log-position-hint');
      const jump = documentRoot.getElementById('log-jump-newest');
      if (hint) hint.textContent = viewingEarlier ? 'Viewing earlier events.' : 'Exact messages, newest first. Scroll for earlier events.';
      if (jump) jump.hidden = !viewingEarlier;
    }

    function renderMessageFacts() {
      if (!messageMount) return [];
      const wasNearTop = messageMount.scrollTop <= 32;
      const previousScrollTop = messageMount.scrollTop;
      const previousScrollHeight = messageMount.scrollHeight;
      const viewportTop = messageMount.getBoundingClientRect?.().top || 0;
      let anchorId = '';
      let anchorOffset = 0;
      if (!wasNearTop) {
        for (const row of messageMount.children) {
          const bounds = row.getBoundingClientRect?.();
          if (bounds && bounds.bottom > viewportTop + 1) {
            anchorId = row.dataset?.messageId || '';
            anchorOffset = bounds.top - viewportTop;
            break;
          }
        }
      }
      const events = consequenceFeed?.render?.(messageMount, documentRoot) || [];
      if (wasNearTop) {
        messageMount.scrollTop = 0;
      } else {
        let restored = false;
        for (const row of messageMount.children) {
          if (row.dataset?.messageId !== anchorId) continue;
          const nextOffset = (row.getBoundingClientRect?.().top || viewportTop) - viewportTop;
          messageMount.scrollTop = Math.max(0, previousScrollTop + nextOffset - anchorOffset);
          restored = true;
          break;
        }
        if (!restored) messageMount.scrollTop = Math.max(0, previousScrollTop + messageMount.scrollHeight - previousScrollHeight);
      }
      updateMessageScrollPosition();
      return events;
    }

    function currentTurnLabel(events = []) {
      for (let index = events.length - 1; index >= 0; index -= 1) {
        if (Number.isSafeInteger(events[index]?.turn)) return String(events[index].turn);
      }
      const turnChip = Array.from(statusMount?.querySelectorAll?.('.ux-status-chip') || [])
        .find((chip) => /^(?:T|Time|Turn)$/i.test(String(chip.querySelector('span')?.textContent || '').trim()));
      return String(turnChip?.querySelector('strong')?.textContent || '—').trim() || '—';
    }

    function currentModeLabel(game = {}) {
      if (documentRoot.body.classList.contains('map-target-mode')) return 'Targeting';
      if (game.currentMenu?.awaitingSelection) return 'Choosing';
      if (game.activePrompt) {
        if (/direction/i.test(String(game.activePrompt.kind || game.activePrompt.promptType || ''))) {
          return String(documentRoot.getElementById('direction-helper-title')?.textContent || 'Choosing direction').trim();
        }
        return 'Answering';
      }
      return 'Exploring';
    }

    function pendingChoiceLabel(game = {}) {
      const prompt = game.activePrompt;
      const menu = game.currentMenu?.awaitingSelection ? game.currentMenu : null;
      return String(prompt?.query || prompt?.question || prompt?.message || menu?.prompt || 'No pending choice').trim();
    }

    function renderNowFacts(game = {}, events = []) {
      const turn = documentRoot.getElementById('log-now-turn');
      const mode = documentRoot.getElementById('log-now-mode');
      const pending = documentRoot.getElementById('log-now-pending');
      if (turn) turn.textContent = currentTurnLabel(events);
      if (mode) mode.textContent = currentModeLabel(game);
      if (pending) {
        pending.textContent = pendingChoiceLabel(game);
        pending.title = pending.textContent;
      }
    }

    function workspaceSplitHeight() {
      const play = documentRoot.getElementById('play-area');
      const log = documentRoot.getElementById('log-panel');
      return Math.max(0, Number(play?.getBoundingClientRect?.().height) + Number(log?.getBoundingClientRect?.().height));
    }

    function applyLogRatio(value, { persist = false } = {}) {
      logRatio = Math.min(0.75, Math.max(0.2, Number(value) || 0.5));
      const available = workspaceSplitHeight();
      if (available > 0) gameViewSection?.style?.setProperty('--ux-log-height', `${Math.round(available * logRatio)}px`);
      layoutResizer?.setAttribute?.('aria-valuenow', String(Math.round(logRatio * 100)));
      if (persist) persistPresentationPatch({ layout: { logRatio } });
      return logRatio;
    }
    function beginWorkspaceResize(event) {
      if (event.button !== 0) return;
      const available = workspaceSplitHeight();
      const logHeight = documentRoot.getElementById('log-panel')?.getBoundingClientRect?.().height || 0;
      if (!available || !logHeight) return;
      resizeDrag = { pointerId: event.pointerId, startY: event.clientY, available, logHeight };
      layoutResizer?.setPointerCapture?.(event.pointerId);
      documentRoot.body.classList.add('ux-log-resizing');
      event.preventDefault();
    }

    function continueWorkspaceResize(event) {
      if (!resizeDrag || event.pointerId !== resizeDrag.pointerId) return;
      const nextHeight = resizeDrag.logHeight - (event.clientY - resizeDrag.startY);
      applyLogRatio(nextHeight / resizeDrag.available);
    }

    function finishWorkspaceResize(event) {
      if (!resizeDrag || event.pointerId !== resizeDrag.pointerId) return;
      resizeDrag = null;
      documentRoot.body.classList.remove('ux-log-resizing');
      applyLogRatio(logRatio, { persist: true });
    }

    function resizeWorkspaceFromKeyboard(event) {
      const direction = event.key === 'ArrowUp' ? 1 : (event.key === 'ArrowDown' ? -1 : 0);
      if (!direction) return;
      event.preventDefault();
      applyLogRatio(logRatio + direction * 0.05, { persist: true });
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
      gameViewSection = documentRoot.querySelector('.game-view-section');
      layoutResizer = documentRoot.getElementById('map-log-resizer');
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
      mapModeButton.setAttribute('aria-label', 'Cycle map view. Current view: Full dungeon.');
      quick.append(characterButton, densityButton, mapModeButton);
      historyButton.classList.add('log-now-history');
      documentRoot.querySelector('.log-now')?.append(historyButton);

      const heading = logPanel.querySelector('.log-heading');
      if (heading) {
        const strong = heading.querySelector('strong');
        const hint = heading.querySelector('span');
        if (strong) strong.textContent = 'Latest consequences';
        if (hint) hint.textContent = 'Exact messages, newest first. Scroll for earlier events.';
      }
      const legacyHistory = documentRoot.getElementById('message-history');
      if (legacyHistory) legacyHistory.hidden = true;
    }

    function persistPresentationPatch(patch) {
      if (!settingsStore) return;
      settingsStore.load();
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

    function mapTracksPlayer() {
      return normalizeMapMode(documentRoot.body.dataset.uxMapMode) !== 'full';
    }

    function publishMapPresentation() {
      if (typeof globalRoot.CustomEvent !== 'function') return;
      globalRoot.dispatchEvent?.(new globalRoot.CustomEvent('nethack:map-presentation-changed', {
        detail: Object.freeze({ mode: normalizeMapMode(documentRoot.body.dataset.uxMapMode), closeRows }),
      }));
    }

    function centerFollowMap() {
      if (!mapTracksPlayer()) return;
      const playArea = documentRoot.getElementById('play-area');
      const grid = documentRoot.getElementById('game-grid');
      const cursorCell = grid?.querySelector?.('.tile-cell.cursor');
      if (!playArea || !grid || !cursorCell) return;
      if (documentRoot.body.dataset.uxMapMode === 'close') {
        grid.style.setProperty('--ux-close-tile-size', `${computeCloseUpTileSize({ containerHeight: playArea.clientHeight, closeRows })}px`);
      }
      const translationInput = {
        containerWidth: playArea.clientWidth,
        containerHeight: playArea.clientHeight,
        contentWidth: grid.scrollWidth,
        contentHeight: grid.scrollHeight,
        cursorCenterX: cursorCell.offsetLeft + cursorCell.offsetWidth / 2,
        cursorCenterY: cursorCell.offsetTop + cursorCell.offsetHeight / 2,
      };
      const translation = documentRoot.body.dataset.uxMapMode === 'close'
        ? computeCloseUpTranslation(translationInput)
        : computeFollowTranslation(translationInput);
      grid.style.setProperty('--ux-follow-x', `${translation.x}px`);
      grid.style.setProperty('--ux-follow-y', `${translation.y}px`);
    }

    function setCloseRows(value, { persist = true } = {}) {
      closeRows = closeUpRowOptions.includes(Number(value)) ? Number(value) : 9;
      documentRoot.body.dataset.uxCloseRows = String(closeRows);
      if (mapTracksPlayer()) globalRoot.requestAnimationFrame?.(centerFollowMap);
      if (persist) persistPresentationPatch({ map: { closeRows } });
      publishMapPresentation();
      return closeRows;
    }
    function adjustCloseRows(direction, options) {
      return setCloseRows(adjustCloseUpRows(closeRows, direction), options);
    }


    function setMapMode(value, { persist = true } = {}) {
      const mode = normalizeMapMode(value);
      documentRoot.body.dataset.uxMapMode = mode;
      if (mapModeButton) {
        const label = mode === 'close' ? 'Close-up' : mode === 'follow' ? 'Follow player' : 'Full dungeon';
        mapModeButton.textContent = `View: ${mode === 'close' ? 'Close-up' : mode === 'follow' ? 'Follow' : 'Full'}`;
        mapModeButton.setAttribute('aria-label', `Cycle map view. Current view: ${label}.`);
      }
      if (mode === 'full') {
        const grid = documentRoot.getElementById('game-grid');
        grid?.style.removeProperty('--ux-follow-x');
        grid?.style.removeProperty('--ux-follow-y');
        grid?.style.removeProperty('--ux-close-tile-size');
      } else globalRoot.requestAnimationFrame?.(centerFollowMap);
      if (persist) persistPresentationPatch({ map: { mode } });
      publishMapPresentation();
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
      const grid = documentRoot.getElementById('game-grid');
      globalRoot.NetHackUxFeedback?.markMapLevelTransition?.(grid);
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
      const nextKey = shellRenderKey(game);
      if (nextKey === lastShellRenderKey) {
        if (mapTracksPlayer()) globalRoot.requestAnimationFrame?.(centerFollowMap);
        return;
      }
      lastShellRenderKey = nextKey;
      documentRoot.body.dataset.uxPromptOwned = String(Boolean(game.activePrompt || game.currentMenu?.awaitingSelection));
      renderStatusFacts(game.statusValues || []);
      characterSheet?.update?.(game.statusValues || []);
      const canonicalMessages = game.messages || [];
      consequenceFeed?.syncCanonicalLines?.(canonicalMessages, { source: 'core-message' });
      if (hasCanonicalMessageContent(canonicalMessages)) consequenceFeed?.setOpeningChronicle?.(openingChronicleLines(canonicalMessages));
      const renderedEvents = renderMessageFacts();
      renderNowFacts(game, renderedEvents);
      if (historyDialog?.dialog?.()?.open) historyDialog.render();
      handleLevelTransition(game);
      focusMapWhenSafe();
      if (mapTracksPlayer()) globalRoot.requestAnimationFrame?.(centerFollowMap);
    }

    function connect() {
      if (connected || !documentRoot) return false;
      connected = true;
      try {
        configureStructure();
        settingsStore = globalRoot.NetHackUxSettingsStore?.createSettingsStore?.({ storage: globalRoot.localStorage, onDiagnostic: (entry) => recordDiagnostic(entry.type, entry.detail) });
        settings = settingsStore?.load?.().settings || globalRoot.NetHackUxSettingsStore?.defaultSettings || { hudDensity: 'compact', map: { mode: 'full' } };
        consequenceFeed = globalRoot.NetHackUxConsequenceFeed?.createConsequenceFeed?.({ feedLimit: 100 });
        const model = globalRoot.NetHackUxMessagePresentation?.createHistoryModel?.(consequenceFeed.log);
        historyDialog = globalRoot.NetHackUxMessagePresentation?.createHistoryDialog?.({ documentRoot, model, log: consequenceFeed.log, dialogService: dialogService(), noticeService: noticeService(), mount: documentRoot.body });
        characterSheet = globalRoot.NetHackUxCharacterSheet?.createCharacterSheet?.({ documentRoot, dialogService: dialogService(), mount: documentRoot.body });
        statusMount = documentRoot.getElementById('stats-panel');
        messageMount = documentRoot.getElementById('messages');
        setDensity(settings.hudDensity, { persist: false, render: false });
        setCloseRows(settings.map?.closeRows, { persist: false });
        setMapMode(settings.map?.mode, { persist: false });
        globalRoot.requestAnimationFrame?.(() => applyLogRatio(settings.layout?.logRatio, { persist: false }));
        if (settings.motion === 'reduced') documentRoot.body.dataset.uxMotion = 'reduced';
        else if (settings.motion === 'full') documentRoot.body.dataset.uxMotion = 'full';
        else documentRoot.body.dataset.uxMotion = 'system';
        const listen = (target, type, listener, options) => {
          target?.addEventListener?.(type, listener, options);
          cleanupListeners.push(() => target?.removeEventListener?.(type, listener, options));
        };
        listen(characterButton, 'click', () => characterSheet?.open?.(publicGameFacts().statusValues || [], characterButton));
        listen(historyButton, 'click', () => historyDialog?.open?.(historyButton));
        listen(densityButton, 'click', () => setDensity(hudDensity === 'compact' ? 'detailed' : 'compact'));
        const jumpNewestButton = documentRoot.getElementById('log-jump-newest');
        listen(messageMount, 'scroll', updateMessageScrollPosition, { passive: true });
        listen(jumpNewestButton, 'click', () => {
          messageMount.scrollTop = 0;
          updateMessageScrollPosition();
          messageMount.focus?.({ preventScroll: true });
        });
        listen(mapModeButton, 'click', () => setMapMode(nextMapMode(documentRoot.body.dataset.uxMapMode)));
        listen(layoutResizer, 'pointerdown', beginWorkspaceResize);
        listen(globalRoot, 'pointermove', continueWorkspaceResize);
        listen(globalRoot, 'pointerup', finishWorkspaceResize);
        listen(globalRoot, 'pointercancel', finishWorkspaceResize);
        listen(layoutResizer, 'keydown', resizeWorkspaceFromKeyboard);
        listen(globalRoot, 'resize', () => {
          globalRoot.requestAnimationFrame?.(() => applyLogRatio(logRatio));
          if (mapTracksPlayer()) globalRoot.requestAnimationFrame?.(centerFollowMap);
        });
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
      setCloseRows,
      adjustCloseRows,
      setLogRatio: applyLogRatio,
      centerFollowMap,
      state: () => Object.freeze({ connected, density: hudDensity || settings?.hudDensity || 'compact', mapMode: documentRoot?.body?.dataset?.uxMapMode || 'full', closeRows, logRatio, previousDungeon, pendingMapFocus, messageCount: consequenceFeed?.log?.size?.() || 0 }),
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

  return Object.freeze({ version, tuplesToMap, hasCanonicalMessageContent, levelDestinationLabel, computeFollowTranslation, computeCloseUpTranslation, normalizeMapMode, nextMapMode, computeCloseUpTileSize, adjustCloseUpRows, createAppShellController, installBrowserShell, browserController: () => browserController });
}));
