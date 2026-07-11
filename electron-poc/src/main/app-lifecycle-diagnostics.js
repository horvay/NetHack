function errorDetails(error) {
  if (!error || typeof error !== 'object') return { message: String(error) };
  return {
    name: error.name || 'Error',
    message: String(error.message || error),
    stack: error.stack ? String(error.stack).slice(0, 8000) : undefined,
    code: error.code || undefined,
  };
}

function safeCall(fn, fallback = null) {
  try { return fn(); }
  catch { return fallback; }
}

function webContentsContext(webContents) {
  if (!webContents) return null;
  return {
    id: webContents.id || null,
    url: safeCall(() => webContents.getURL(), ''),
    title: safeCall(() => webContents.getTitle(), ''),
    destroyed: safeCall(() => webContents.isDestroyed(), false),
  };
}

function installAppLifecycleDiagnostics({ app, getWindow, getGameProcess, getDiagnostics, logger = console } = {}) {
  let quitIntent = 'unknown';
  let signalForwarded = false;

  function noteQuitIntent(intent, detail = {}) {
    quitIntent = intent || quitIntent;
    log('app.quit-intent', { quitIntent, detail }, 'warn');
  }

  function activeDiagnosticRun() {
    return safeCall(() => getDiagnostics?.()?.publicRun?.(), null);
  }

  function gameProcessStatus() {
    return safeCall(() => getGameProcess?.()?.status?.(), { running: false, unavailable: true });
  }

  function windowContext() {
    const win = safeCall(() => getWindow?.(), null);
    if (!win) return null;
    return {
      id: safeCall(() => win.id, null),
      destroyed: safeCall(() => win.isDestroyed(), false),
      visible: safeCall(() => !win.isDestroyed() && win.isVisible(), false),
      title: safeCall(() => win.getTitle(), ''),
      webContents: safeCall(() => webContentsContext(win.webContents), null),
    };
  }

  function log(type, payload = {}, level = 'warn') {
    const context = {
      appPid: process.pid,
      parentPid: process.ppid || null,
      quitIntent,
      activeDiagnosticRun: activeDiagnosticRun(),
      gameProcess: gameProcessStatus(),
      window: windowContext(),
      ...payload,
    };
    try {
      getDiagnostics?.()?.appendEvent?.({ layer: 'main', category: 'process', type, payload: context });
    } catch (error) {
      logger.warn?.(`[app-lifecycle] diagnostic append failed: ${error.stack || error}`);
    }
    try {
      const line = `[app-lifecycle] ${type} ${JSON.stringify(context)}`;
      if (level === 'error') logger.error?.(line);
      else logger.warn?.(line);
    } catch {
      logger.warn?.(`[app-lifecycle] ${type}`);
    }
  }

  function stopGameForQuit(reason) {
    const gameProcess = safeCall(() => getGameProcess?.(), null);
    if (!gameProcess?.stop) return;
    try { gameProcess.stop(); }
    catch (error) { log('app.game-process-stop.failed', { reason, error: errorDetails(error) }, 'error'); }
  }

  app.on('before-quit', () => {
    const userCloseIntents = new Set(['window-all-closed', 'browser-window-close', 'browser-window-closed']);
    log('app.before-quit', { classification: userCloseIntents.has(quitIntent) ? 'user-close-or-window-manager' : 'app-quit' });
    stopGameForQuit('before-quit');
  });

  app.on('will-quit', () => {
    log('app.will-quit', { classification: quitIntent });
  });

  app.on('render-process-gone', (_event, webContents, details = {}) => {
    log('app.render-process-gone', { classification: 'renderer-crash-or-exit', details, webContents: webContentsContext(webContents) }, 'error');
  });

  app.on('child-process-gone', (_event, details = {}) => {
    const childType = String(details.type || '').toLowerCase();
    log('app.child-process-gone', { classification: childType === 'gpu' ? 'gpu-child-crash-or-exit' : 'electron-child-crash-or-exit', details }, 'error');
  });

  process.on('uncaughtExceptionMonitor', (error, origin) => {
    log('process.uncaughtException', { classification: 'main-process-uncaught-exception', origin, error: errorDetails(error) }, 'error');
  });

  process.on('unhandledRejection', (reason) => {
    log('process.unhandledRejection', { classification: 'main-process-unhandled-rejection', reason: errorDetails(reason) }, 'error');
    setImmediate(() => {
      if (reason instanceof Error) throw reason;
      throw new Error(`Unhandled rejection: ${String(reason)}`);
    });
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      signalForwarded = true;
      quitIntent = `signal:${signal}`;
      log('process.signal.received', { classification: signal === 'SIGTERM' ? 'external-kill-or-parent-shutdown' : 'terminal-interrupt', signal }, 'error');
      stopGameForQuit(`signal:${signal}`);
      setTimeout(() => process.kill(process.pid, signal), 25).unref();
      setTimeout(() => process.exit(signal === 'SIGINT' ? 130 : 143), 750).unref();
    });
  }

  return {
    noteQuitIntent,
    log,
    signalWasForwarded: () => signalForwarded,
  };
}

module.exports = { installAppLifecycleDiagnostics, errorDetails };
