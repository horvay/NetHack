const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const CommandGateway = require('../shared/command-gateway');
const UiProtocolV2 = require('../shared/ui-protocol-v2');
const ShimProtocol = require('../shared/shim-protocol');
const GameViewState = require('../shared/game-view-state');
const { sanitizeShimLine } = require('./diagnostic-log');
const LaunchPolicy = require('./launch-policy');

const { normalizeSeed, normalizeNetHackOptions } = LaunchPolicy;

function createGameProcess({ repoRoot, nethackBin, shimBridgeBin, send, env = process.env, diagnostics = null }) {
  let child;
  let childMode = '';
  let childSeq = 0;
  let childStopping = false;
  let lastShimKey = { key: undefined, at: 0 };
  let commandState = GameViewState.createGameViewState();

  function diagnosticEvent(event) {
    try { return diagnostics?.appendEvent?.(event); }
    catch (error) { console.warn(`[diagnostic-log] event failed: ${error.stack || error}`); return null; }
  }

  function status() {
    return child && !child.killed ? { running: true, mode: childMode, pid: child.pid } : { running: false };
  }

  function resetCommandState() {
    commandState = GameViewState.createGameViewState();
  }

  function noteShimEventForCommandState(event) {
    try { commandState.process(event); }
    catch (error) {
      diagnosticEvent({ layer: 'game-process', category: 'ui-command', type: 'command.state.update.failed', payload: { message: String(error?.message || error), eventName: event?.name || '' } });
    }
  }

  function activeOwnerFromCommandState(snapshot = commandState.snapshot()) {
    if (snapshot.activePrompt) {
      if (snapshot.activePrompt.promptPurpose === 'prompt.command' || snapshot.activePrompt.query === 'Choose a command.') return null;
      return { kind: snapshot.activePrompt.kind || 'prompt', requestId: snapshot.activePrompt.requestId || '', transactionId: snapshot.activePrompt.transactionId || '', label: snapshot.activePrompt.query || snapshot.activePrompt.promptPurpose || '', lifecycle: snapshot.activePrompt.lifecycle || '', source: 'game-view.activePrompt' };
    }
    if (snapshot.currentMenu?.awaitingSelection) {
      return { kind: 'menu', requestId: snapshot.currentMenu.requestId || snapshot.currentMenu.menuRequestId || '', transactionId: snapshot.currentMenu.transactionId || '', window: snapshot.currentMenu.window, label: snapshot.currentMenu.prompt || snapshot.currentMenu.menuPurpose || '', lifecycle: snapshot.currentMenu.lifecycle || '', source: 'game-view.currentMenu' };
    }
    const transferState = snapshot.transferTransactions;
    const activeSessionId = transferState?.activeSessionId || '';
    const activeSession = activeSessionId && transferState?.sessionsById?.get ? transferState.sessionsById.get(activeSessionId) : null;
    if (activeSession?.status === 'active') {
      return { kind: 'transfer', requestId: activeSession.sessionId || activeSessionId, transactionId: activeSession.activeTransferId || '', label: activeSession.kind || 'transfer panel', lifecycle: activeSession.status, source: 'game-view.transferTransactions' };
    }
    return null;
  }

  function publicGroundItemFromCurrentCell(snapshot = {}, coord = {}) {
    const cell = snapshot.mapCells?.[coord.y]?.[coord.x];
    if (!cell || typeof cell !== 'object') return null;
    const kind = String(cell.objectLayerSemanticKind || '').toLowerCase();
    const name = String(cell.objectLayerSemanticName || cell.objectLayerSemanticAppearance || '').trim();
    const objectClass = String(cell.objectLayerChar || '').trim();
    const affordances = Array.isArray(cell.objectLayerActionAffordances) ? cell.objectLayerActionAffordances.slice() : [];
    const objectLike = kind === 'object' || kind === 'item' || Boolean(name && (objectClass || affordances.length));
    if (!objectLike || !name) return null;
    return {
      displayName: /^\s*(?:a|an|the|some)\s+/i.test(name) ? name : `a ${name}`,
      semanticKind: cell.objectLayerSemanticKind || 'object',
      semanticName: cell.objectLayerSemanticName || undefined,
      semanticAppearance: cell.objectLayerSemanticAppearance || undefined,
      objectClass: objectClass || undefined,
      actionAffordances: affordances,
      location: { kind: 'ground', coord: { x: coord.x, y: coord.y } },
      source: 'current-map-cell',
    };
  }

  function currentGroundItemsFromSnapshot(snapshot = {}) {
    const piles = snapshot.groundPiles || {};
    const cursor = snapshot.cursor || {};
    const coord = { x: Number(cursor.x) || 0, y: Number(cursor.y) || 0 };
    const key = `${coord.x},${coord.y}`;
    const cursorPile = piles.pilesByCoord?.get?.(key);
    if (cursorPile && Array.isArray(cursorPile.items) && cursorPile.items.length) return cursorPile.items;
    const last = piles.lastSnapshotEvent?.payload;
    if (last && Number(last.coord?.x) === coord.x && Number(last.coord?.y) === coord.y && Array.isArray(last.items) && last.items.length) return last.items;
    const cellItem = publicGroundItemFromCurrentCell(snapshot, coord);
    return cellItem ? [cellItem] : [];
  }

  function commandExecutionContext() {
    const snapshot = commandState.snapshot();
    return {
      uiProtocol: UiProtocolV2,
      inventoryRevision: snapshot.inventory?.revision || 0,
      equipmentRevision: snapshot.equipment?.revision || 0,
      groundRevision: snapshot.groundPiles?.revision || 0,
      containerRevision: snapshot.containerContents?.revision || 0,
      mapRevision: snapshot.mapRevision || snapshot.protocolSequence || 0,
      inventoryItems: snapshot.inventory?.orderedItems || [],
      groundItems: currentGroundItemsFromSnapshot(snapshot),
      activeInputOwner: activeOwnerFromCommandState(snapshot),
      requireExpectedRevisionForKnownSnapshots: true,
    };
  }

  function attach(proc, mode, onStdout, onStderr) {
    childSeq += 1;
    const seq = childSeq;
    child = proc;
    childMode = mode;
    childStopping = false;
    lastShimKey = { key: undefined, at: 0 };
    diagnosticEvent({ layer: 'game-process', category: 'process', type: 'process.spawned', payload: { mode, pid: proc.pid } });
    proc.stdout.on('data', onStdout);
    proc.stderr.on('data', onStderr);
    proc.on('error', (error) => {
      diagnosticEvent({ layer: 'game-process', category: 'error', type: 'process.error', payload: { mode, message: String(error) } });
      send('nethack:exit', { ok: false, mode, message: String(error) });
    });
    proc.on('close', (code, signal) => {
      const exit = { ok: code === 0, code, signal, mode, expected: childStopping };
      diagnosticEvent({ layer: 'game-process', category: 'process', type: 'process.close', payload: exit });
      send('nethack:exit', exit);
      diagnostics?.finalize?.(exit);
      if (seq === childSeq) {
        child = undefined;
        childMode = '';
        childStopping = false;
      }
    });
    send('nethack:state', status());
  }

  function stop() {
    diagnosticEvent({ layer: 'main', category: 'process', type: 'process.stop.requested', payload: status() });
    if (child && !child.killed) {
      childStopping = true;
      child.kill('SIGTERM');
    }
    return { ok: true, ...status() };
  }

  function readStoredPid(file) {
    try {
      const buffer = fs.readFileSync(file);
      if (buffer.length < 4) return null;
      const pid = buffer.readInt32LE(0);
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    } catch {
      return null;
    }
  }

  function pidIsAlive(pid) {
    if (!pid) return false;
    try { process.kill(pid, 0); return true; }
    catch { return false; }
  }

  function removeStaleNetHackLockFiles() {
    const playground = env.NH_TEST_PLAYGROUND || env.NETHACKDIR || path.join(repoRoot, 'playground');
    let entries = [];
    try { entries = fs.readdirSync(playground, { withFileTypes: true }); }
    catch { return []; }
    const removed = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/lock\.\d+$/i.test(entry.name)) continue;
      const file = path.join(playground, entry.name);
      const pid = readStoredPid(file);
      if (!pid || pidIsAlive(pid)) continue;
      try {
        fs.rmSync(file, { force: true });
        removed.push({ file, name: entry.name, pid });
      } catch (error) {
        diagnosticEvent({ layer: 'game-process', category: 'process', type: 'stale-lock.remove.failed', payload: { file, pid, message: String(error?.message || error) } });
      }
    }
    if (removed.length) diagnosticEvent({ layer: 'game-process', category: 'process', type: 'stale-lock.removed-before-start', payload: { playground, removed } });
    return removed;
  }

  function startGame(size = {}) {
    if (child && !child.killed) return { ok: true, alreadyRunning: true, ...status() };
    removeStaleNetHackLockFiles();
    const launch = LaunchPolicy.ttyLaunchConfig({ size, nethackBin, env });
    const proc = spawn(launch.executable, launch.args, { cwd: repoRoot, env: launch.env });
    attach(proc, 'tty', (data) => send('nethack:data', data.toString('utf8')), (data) => send('nethack:data', data.toString('utf8')));
    return { ok: true, cols: launch.cols, rows: launch.rows, pid: proc.pid };
  }

  function startShimBridge(options = {}) {
    if (child && !child.killed) {
      const activeRun = diagnostics?.startRun?.({ mode: 'shim', startOptions: options })?.run;
      return { ok: true, alreadyRunning: true, diagnostic: activeRun, ...status() };
    }
    const nethackOptions = normalizeNetHackOptions(options.nethackOptions || env.NETHACKOPTIONS || '!tutorial');
    const diagnosticStart = diagnostics?.startRun?.({ mode: 'shim', startOptions: options, nethackOptions }) || {};
    const diagnosticRun = diagnosticStart.run || null;
    removeStaleNetHackLockFiles();
    const seed = diagnosticRun?.seed?.chosen || normalizeSeed(options.seed);
    const launch = LaunchPolicy.shimLaunchConfig({ options, env, nethackOptions, seed });
    resetCommandState();
    const proc = spawn(shimBridgeBin, launch.args, { cwd: repoRoot, env: launch.env });
    let pendingShimEventBatch = [];
    let shimEventBatchImmediate = null;
    let shimEventBatchTimer = null;
    let holdShimBatchUntilDisplay = false;
    let glyphDiagnosticSpan = null;
    let mapRefreshPerf = null;
    let mapRefreshPerfId = 0;
    const verboseShimDiagnostics = env.NH_DIAGNOSTIC_VERBOSE_SHIM_EVENTS === '1';
    function monoNowMs() { return Number(process.hrtime.bigint()) / 1e6; }
    function compactEventSample(event = {}) {
      return { x: event.x, y: event.y, char: event.char, glyph: event.glyph, semanticKind: event.semanticKind, semanticName: event.semanticName };
    }
    function flushGlyphDiagnosticSpan(reason = 'boundary') {
      if (!glyphDiagnosticSpan) return;
      diagnosticEvent({ layer: 'game-process', category: 'shim-event', type: 'shim.print_glyph.compacted', payload: { ...glyphDiagnosticSpan, reason } });
      glyphDiagnosticSpan = null;
    }
    function appendShimEventDiagnostics(originalLine, diagnosticLine, parsed, rawEvent, lineBytes) {
      if (!verboseShimDiagnostics && rawEvent?.name === 'shim_print_glyph') {
        if (!glyphDiagnosticSpan) glyphDiagnosticSpan = { count: 0, bytes: 0, first: compactEventSample(rawEvent), last: compactEventSample(rawEvent) };
        glyphDiagnosticSpan.count += 1;
        glyphDiagnosticSpan.bytes += lineBytes;
        glyphDiagnosticSpan.last = compactEventSample(rawEvent);
        return;
      }
      flushGlyphDiagnosticSpan(rawEvent?.name || 'non-glyph');
      diagnosticEvent({ layer: 'game-process', category: 'shim-event', type: 'shim.raw.stdout', payload: { line: diagnosticLine, privacy: diagnosticLine === originalLine ? 'raw-public' : 'raw-redacted-public' } });
      diagnosticEvent({ layer: 'game-process', category: 'shim-event', type: 'shim.event.parsed', payload: { protocol: parsed.protocol, kind: parsed.kind, known: parsed.known, name: rawEvent?.name || null, event: rawEvent } });
    }
    function noteMapRefreshPerf(rawEvent, sample) {
      const name = rawEvent?.name;
      if (name === 'shim_clear_nhwindow') {
        mapRefreshPerf = { id: ++mapRefreshPerfId, clearAtMs: sample.receivedAtMs, glyphCount: 0, glyphBytes: 0, parseMs: sample.parseMs, diagnosticMs: sample.diagnosticMs };
      } else if (name === 'shim_print_glyph' && mapRefreshPerf) {
        if (!mapRefreshPerf.firstGlyphAtMs) mapRefreshPerf.firstGlyphAtMs = sample.receivedAtMs;
        mapRefreshPerf.lastGlyphAtMs = sample.receivedAtMs;
        mapRefreshPerf.glyphCount += 1;
        mapRefreshPerf.glyphBytes += sample.lineBytes || 0;
        mapRefreshPerf.parseMs += sample.parseMs || 0;
        mapRefreshPerf.diagnosticMs += sample.diagnosticMs || 0;
      } else if (name === 'shim_display_nhwindow' && mapRefreshPerf) {
        const span = mapRefreshPerf;
        span.displayAtMs = sample.receivedAtMs;
        span.parseMs += sample.parseMs || 0;
        span.diagnosticMs += sample.diagnosticMs || 0;
        diagnosticEvent({ layer: 'game-process', category: 'performance', type: 'perf.mapRefresh.main', payload: {
          id: span.id,
          glyphCount: span.glyphCount,
          glyphBytes: span.glyphBytes,
          clearToFirstGlyphMs: span.firstGlyphAtMs ? Math.round((span.firstGlyphAtMs - span.clearAtMs) * 1000) / 1000 : null,
          firstToLastGlyphMs: span.firstGlyphAtMs && span.lastGlyphAtMs ? Math.round((span.lastGlyphAtMs - span.firstGlyphAtMs) * 1000) / 1000 : null,
          clearToDisplayMs: Math.round((span.displayAtMs - span.clearAtMs) * 1000) / 1000,
          parseMs: Math.round(span.parseMs * 1000) / 1000,
          diagnosticMs: Math.round(span.diagnosticMs * 1000) / 1000,
        } });
        mapRefreshPerf = null;
      }
    }
    function flushShimEventBatch() {
      if (shimEventBatchImmediate) {
        clearImmediate(shimEventBatchImmediate);
        shimEventBatchImmediate = null;
      }
      if (shimEventBatchTimer) {
        clearTimeout(shimEventBatchTimer);
        shimEventBatchTimer = null;
      }
      holdShimBatchUntilDisplay = false;
      if (!pendingShimEventBatch.length) return;
      const batch = pendingShimEventBatch;
      pendingShimEventBatch = [];
      if (batch.length > 1) {
        const counts = {};
        for (const item of batch) {
          const event = item?.event || item?.raw || item;
          const name = event?.name || event?.protocol || 'unknown';
          counts[name] = (counts[name] || 0) + 1;
        }
        diagnosticEvent({ layer: 'game-process', category: 'shim-event', type: 'shim.event.renderer.batch', payload: { count: batch.length, counts } });
      }
      send('nethack:shimEvent', batch.length === 1 ? batch[0] : batch);
    }
    function queueShimEventForRenderer(parsed, rawEvent = null) {
      const eventName = rawEvent?.name || '';
      const promptOrMenuBoundary = /^(shim_yn_function|shim_getlin|shim_start_menu|shim_select_menu|bridge_command_prompt|bridge_direction_prompt)$/.test(eventName);
      if (holdShimBatchUntilDisplay && promptOrMenuBoundary && pendingShimEventBatch.length) flushShimEventBatch();
      if (eventName === 'shim_clear_nhwindow') holdShimBatchUntilDisplay = true;
      pendingShimEventBatch.push(parsed);
      if (pendingShimEventBatch.length >= 4096 || eventName === 'shim_display_nhwindow') {
        flushShimEventBatch();
        return;
      }
      if (holdShimBatchUntilDisplay) {
        if (!shimEventBatchTimer) shimEventBatchTimer = setTimeout(flushShimEventBatch, 50);
        return;
      }
      if (!shimEventBatchImmediate) shimEventBatchImmediate = setImmediate(flushShimEventBatch);
    }
    let stdoutLineBuffer = '';
    function processShimStdoutLine(line, chunkStats) {
      if (!line) return;
      const receivedAtMs = monoNowMs();
      chunkStats.lineCount += 1;
      chunkStats.bytes += Buffer.byteLength(line);
      const diagnosticLine = sanitizeShimLine(line);
      const parseStartedAt = monoNowMs();
      // Parse the original transport bytes before diagnostic redaction or any
      // JSON reserialization. Re-stringifying first would collapse -0 and
      // other authoritative answer distinctions before protocol validation.
      const parsed = ShimProtocol.parseLine(line);
      const parseMs = monoNowMs() - parseStartedAt;
      chunkStats.parseMs += parseMs;
      const rawEvent = parsed.event || parsed.raw || parsed;
      if (rawEvent?.name || rawEvent?.protocol === UiProtocolV2.protocol) noteShimEventForCommandState(rawEvent);
      const diagnosticStartedAt = monoNowMs();
      appendShimEventDiagnostics(line, diagnosticLine, parsed, rawEvent, Buffer.byteLength(diagnosticLine));
      const diagnosticMs = monoNowMs() - diagnosticStartedAt;
      chunkStats.diagnosticMs += diagnosticMs;
      noteMapRefreshPerf(rawEvent, { receivedAtMs, lineBytes: Buffer.byteLength(diagnosticLine), parseMs, diagnosticMs });
      if (rawEvent?.name === 'bridge_seed') diagnostics?.recordBridgeSeed?.(rawEvent);
      queueShimEventForRenderer(parsed, rawEvent);
    }
    proc.once('close', () => {
      if (stdoutLineBuffer.trim()) diagnosticEvent({ layer: 'game-process', category: 'shim-event', type: 'shim.raw.stdout.incomplete', payload: { bytes: Buffer.byteLength(stdoutLineBuffer), text: sanitizeShimLine(stdoutLineBuffer).slice(0, 4096) } });
      stdoutLineBuffer = '';
      flushGlyphDiagnosticSpan('process-close');
      flushShimEventBatch();
    });
    attach(proc, 'shim', (data) => {
      const chunkStartedAt = monoNowMs();
      const chunkStats = { lineCount: 0, bytes: 0, parseMs: 0, diagnosticMs: 0 };
      stdoutLineBuffer += data.toString('utf8');
      const lines = stdoutLineBuffer.split(/\r?\n/);
      stdoutLineBuffer = lines.pop() || '';
      for (const line of lines) processShimStdoutLine(line, chunkStats);
      if (chunkStats.lineCount > 64) diagnosticEvent({ layer: 'game-process', category: 'performance', type: 'perf.shim.stdoutChunk', payload: { lineCount: chunkStats.lineCount, bytes: chunkStats.bytes, parseMs: Math.round(chunkStats.parseMs * 1000) / 1000, diagnosticMs: Math.round(chunkStats.diagnosticMs * 1000) / 1000, totalMs: Math.round((monoNowMs() - chunkStartedAt) * 1000) / 1000 } });
    }, (data) => {
      flushGlyphDiagnosticSpan('stderr');
      const text = data.toString('utf8');
      diagnosticEvent({ layer: 'game-process', category: 'shim-event', type: 'shim.raw.stderr', payload: { text } });
      queueShimEventForRenderer(ShimProtocol.normalizeRawShimEvent({ type: 'shim-stderr', text }));
    });
    diagnosticEvent({ layer: 'game-process', category: 'seed', type: 'seed.bridge.enforced', payload: { seed: launch.seed, source: diagnosticRun?.seed?.source || (LaunchPolicy.testFixturesEnabled(env) ? 'fixture-compatible' : 'unknown') } });
    return { ok: true, bridge: shimBridgeBin, pid: proc.pid, seed: launch.seed, nethackOptions: launch.nethackOptions, diagnostic: diagnosticRun };
  }

  function writeShimPayload(payload) {
    if (child && child.stdin && child.stdin.writable && childMode === 'shim') {
      const line = JSON.stringify(payload);
      diagnosticEvent({ layer: 'game-process', category: 'shim-send', type: 'shim.stdin.write', transactionId: payload?.transactionId || payload?.actionTransactionId || '', requestId: payload?.expectedRequestId || '', payload: { payload, line, pid: child.pid } });
      child.stdin.write(`${line}\n`);
      return true;
    }
    diagnosticEvent({ layer: 'game-process', category: 'shim-send', type: 'shim.stdin.dropped', payload: { reason: 'no writable shim child', childMode, payload } });
    return false;
  }

  function input(data) {
    if (child && child.stdin && child.stdin.writable) {
      if (childMode === 'shim') return false;
      const input = String(data || '');
      if (input.trim().startsWith('{')) child.stdin.write(`${input.trim()}\n`);
      else child.stdin.write(input);
      return true;
    }
    return false;
  }

  function shimKey(key) {
    const keyString = CommandGateway.normalizeShimKey(key);
    if (!keyString) return false;
    const now = Date.now();
    if (CommandGateway.shouldSuppressDuplicateKey(lastShimKey, keyString, now)) return false;
    lastShimKey = { key: keyString, at: now };
    return writeShimPayload({ type: 'key', key: keyString });
  }

  function shimInput(payload) {
    if (!payload || typeof payload !== 'object') return false;
    return writeShimPayload(payload);
  }

  function uiCommand(command) {
    const executionContext = commandExecutionContext();
    const plan = CommandGateway.planCommand(command, executionContext);
    if (!plan.ok) {
      diagnosticEvent({
        layer: 'game-process',
        category: 'ui-command',
        type: 'command.rejected',
        transactionId: plan.transactionId || command?.transactionId || command?.commandId || '',
        payload: {
          commandId: plan.commandId || command?.commandId || '',
          commandType: plan.commandType || command?.commandType || '',
          actionId: plan.actionId || '',
          reason: plan.reason || 'ui command rejected',
          blockerToken: plan.blockerToken || '',
          supported: Boolean(plan.supported),
          bridgeType: plan.bridgeType || '',
          implementationState: plan.implementationState || '',
          planningAuthority: plan.planningAuthority || 'CommandGateway',
          errors: plan.errors || [],
          activeInputOwner: plan.activeInputOwner || executionContext.activeInputOwner || null,
        },
      });
      return {
        ok: false,
        reason: plan.reason || 'ui command rejected',
        blockerToken: plan.blockerToken || undefined,
        commandId: plan.commandId || command?.commandId || undefined,
        transactionId: plan.transactionId || command?.transactionId || undefined,
        commandType: plan.commandType || command?.commandType || undefined,
        actionId: plan.actionId || undefined,
        bridgeType: plan.bridgeType || undefined,
        implementationState: plan.implementationState || undefined,
        supported: Boolean(plan.supported),
        errors: plan.errors || [],
        ...(plan.activeInputOwner ? { activeInputOwner: plan.activeInputOwner } : {}),
      };
    }
    const written = writeShimPayload(plan.bridgePayload);
    diagnosticEvent({
      layer: 'game-process',
      category: 'ui-command',
      type: written ? 'command.accepted' : 'command.rejected',
      transactionId: plan.transactionId || command?.transactionId || command?.commandId || '',
      payload: written ? {
        commandId: plan.commandId,
        commandType: plan.commandType,
        actionId: plan.actionId || '',
        bridgeType: plan.bridgeType,
        implementationState: plan.implementationState,
        planningAuthority: plan.planningAuthority,
      } : {
        commandId: plan.commandId,
        commandType: plan.commandType,
        actionId: plan.actionId || '',
        bridgeType: plan.bridgeType,
        reason: 'no writable shim child',
      },
    });
    return written ? {
      ok: true,
      commandId: plan.commandId,
      transactionId: plan.transactionId,
      commandType: plan.commandType,
      actionId: plan.actionId || undefined,
      bridgeType: plan.bridgeType,
      implementationState: plan.implementationState,
    } : {
      ok: false,
      reason: 'no writable shim child',
      commandId: plan.commandId,
      transactionId: plan.transactionId,
      commandType: plan.commandType,
      actionId: plan.actionId || undefined,
      bridgeType: plan.bridgeType,
      implementationState: plan.implementationState,
    };
  }

  return Object.freeze({ status, stop, startGame, startShimBridge, input, shimKey, shimInput, uiCommand });
}

module.exports = { createGameProcess };
