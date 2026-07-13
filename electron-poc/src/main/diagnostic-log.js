const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { normalizeSeed } = require('./launch-policy');
const PublicItemKnowledge = require('../shared/public-item-knowledge');
const ROOT_EVENT_NAMES = new Set(require('../shared/shim-protocol').knownNames);

const RUN_SCHEMA = 'nethack-electron-diagnostic-run/v1';
const EVENT_SCHEMA = 'nethack-electron-diagnostic-event/v1';
const LIVE_MARKER_FILE = 'live-run.json';

function safeSegment(value, fallback = 'run') {
  return String(value || fallback).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-|-$/g, '').slice(0, 96) || fallback;
}

function isoForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function shouldDropPrivateSemanticName(container, key) {
  if (key === 'semanticName' && !PublicItemKnowledge.identityIsPublic(container)) return true;
  if (key === 'objectLayerSemanticName' && container?.objectLayerSemanticKnown !== true) return true;
  if (key === 'backgroundSemanticName' && container?.backgroundSemanticKnown !== true) return true;
  return false;
}

function isRecognizedEventEnvelope(value, allowEventEnvelope) {
  if (!allowEventEnvelope || !ROOT_EVENT_NAMES.has(value.name)) return false;
  if (value.event && typeof value.event === 'object' && value.event.name === value.name) return true;
  if (value.name === 'shim_add_menu') return value.window != null && typeof value.text === 'string';
  if (['shim_start_menu', 'shim_end_menu', 'shim_select_menu', 'shim_create_nhwindow', 'shim_clear_nhwindow', 'shim_display_nhwindow'].includes(value.name)) return value.window != null || value.return != null;
  if (['shim_putstr', 'shim_raw_print', 'shim_raw_print_bold', 'shim-stderr', 'shim-raw'].includes(value.name)) return typeof value.text === 'string';
  if (value.name === 'bridge_seed') return value.seed != null;
  if (value.name === 'bridge_menu_answer') return value.window != null || value.return != null || value.requestId != null || value.menuRequestId != null;
  const itemAliases = ['objectId', 'inventoryLetter', 'selector', 'displayName', 'display', 'text', 'itemName', 'targetText', 'appearanceName', 'semanticAppearance', 'semanticName', 'semanticKnown', 'calledName', 'individualName', 'glyph', 'glyphChar', 'objectClass', 'publicClass', 'known'];
  return !itemAliases.some((key) => value[key] != null);
}

function isRecognizedNonItemEvent(value, eventEnvelope) {
  if (!eventEnvelope) return false;
  const itemMetadataKeys = ['objectId', 'inventoryLetter', 'displayName', 'display', 'itemName', 'targetText', 'appearanceName', 'semanticAppearance', 'semanticName', 'semanticKnown', 'calledName', 'individualName', 'objectClass', 'publicClass'];
  if (itemMetadataKeys.some((key) => value[key] != null)) return false;
  if (value.name === 'shim_add_menu') return value.selector != null && typeof value.text === 'string' && !PublicItemKnowledge.isObjectMenuItem(value);
  const textualMetadataEvents = new Set(['shim_putstr', 'shim_raw_print', 'shim_raw_print_bold', 'shim-stderr', 'shim-raw']);
  if (textualMetadataEvents.has(value.name)) return typeof value.text === 'string';
  return !['selector', 'text', 'glyph', 'glyphChar'].some((key) => value[key] != null);
}

function safeJson(value, depth = 0, context = { allowEventEnvelope: depth === 0 }) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString(10);
  if (Array.isArray(value)) return depth > 5 ? '[array-truncated]' : value.slice(0, 200).map((item) => safeJson(item, depth + 1, { allowEventEnvelope: false }));
  if (typeof value === 'object') {
    if (depth > 5) return '[object-truncated]';
    const out = {};
    const itemLike = PublicItemKnowledge.isPublicItemLike(value);
    const eventEnvelope = isRecognizedEventEnvelope(value, context.allowEventEnvelope === true);
    const publicItem = itemLike && !isRecognizedNonItemEvent(value, eventEnvelope);
    const publicLabel = publicItem ? PublicItemKnowledge.publicDisplayLabel(value, { neutral: 'item' }) : '';
    for (const [key, item] of Object.entries(value).slice(0, 200)) {
      if (/password|token|secret|cookie|authorization|^(?:hidden|private|internal)|trueName|baseType|objectType|^otyp$/i.test(key)) continue;
      if (shouldDropPrivateSemanticName(value, key)) continue;
      if (publicItem && (key === 'displayName' || key === 'display' || key === 'itemName' || key === 'targetText')) { out[key] = publicLabel; continue; }
      if (publicItem && key === 'text') {
        const letter = PublicItemKnowledge.selectorLetter(value);
        out[key] = `${letter ? `${letter} - ` : ''}${publicLabel}`;
        continue;
      }
      if (publicItem && key === 'name' && !eventEnvelope) { out[key] = publicLabel; continue; }
      if (publicItem && (key === 'calledName' || key === 'individualName')) {
        const namingValue = PublicItemKnowledge.publicNamingValue(value, key);
        if (namingValue) out[key] = namingValue;
        continue;
      }
      if (publicItem && (key === 'appearanceName' || key === 'semanticAppearance') && value.known?.appearance === false) continue;
      out[key] = safeJson(item, depth + 1, { allowEventEnvelope: key === 'event' || key === 'raw' });
    }
    if (publicItem) {
      out.semanticKnown = PublicItemKnowledge.identityIsPublic(value);
      out.known = safeJson(PublicItemKnowledge.publicKnownFlags(value), depth + 1);
    }
    return out;
  }
  return String(value);
}

function sanitizeShimLine(line) {
  const raw = String(line);
  try { return JSON.stringify(safeJson(JSON.parse(raw))); }
  catch { return JSON.stringify({ malformedShimLine: true, bytes: Buffer.byteLength(raw) }); }
}

function randomSeed() {
  let seed = 0n;
  while (!seed) seed = crypto.randomBytes(8).readBigUInt64LE(0);
  return seed.toString(10);
}

function readJsonFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function readJsonlFile(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function pidIsAlive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try { process.kill(numericPid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

function liveRunOwner(runDir, run = {}) {
  const marker = readJsonFile(path.join(runDir, LIVE_MARKER_FILE));
  const pid = Number(marker?.pid || run?.appProcess?.pid || run?.process?.pid || 0);
  return {
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    markerUpdatedAt: marker?.updatedAt || null,
    source: marker?.pid ? LIVE_MARKER_FILE : (run?.appProcess?.pid ? 'run.appProcess.pid' : 'none'),
  };
}

function lastEventOfType(events, type) {
  for (let index = events.length - 1; index >= 0; index -= 1) if (events[index]?.type === type) return events[index];
  return null;
}

function recoveryExitFromEvents(events, run, owner) {
  const signal = lastEventOfType(events, 'process.signal.received');
  if (signal) return { ok: false, code: null, signal: signal.payload?.signal || null, mode: run.mode || null, expected: false, reason: 'process-signal', classification: signal.payload?.classification || null, ownerPid: owner.pid, ownerPidAlive: false, ownerSource: owner.source };
  const rendererGone = lastEventOfType(events, 'app.render-process-gone');
  if (rendererGone) return { ok: false, code: rendererGone.payload?.details?.exitCode ?? null, signal: null, mode: run.mode || null, expected: false, reason: 'renderer-process-gone', classification: rendererGone.payload?.classification || null, details: rendererGone.payload?.details || null, ownerPid: owner.pid, ownerPidAlive: false, ownerSource: owner.source };
  const childGone = lastEventOfType(events, 'app.child-process-gone');
  if (childGone) return { ok: false, code: childGone.payload?.details?.exitCode ?? null, signal: null, mode: run.mode || null, expected: false, reason: 'electron-child-process-gone', classification: childGone.payload?.classification || null, details: childGone.payload?.details || null, ownerPid: owner.pid, ownerPidAlive: false, ownerSource: owner.source };
  const shimClose = lastEventOfType(events, 'process.close');
  if (shimClose) return { ok: Boolean(shimClose.payload?.ok), code: shimClose.payload?.code ?? null, signal: shimClose.payload?.signal || null, mode: shimClose.payload?.mode || run.mode || null, expected: Boolean(shimClose.payload?.expected), reason: 'shim-process-closed-before-summary', ownerPid: owner.pid, ownerPidAlive: false, ownerSource: owner.source };
  return { ok: false, code: null, signal: null, mode: run.mode || null, expected: false, reason: 'diagnostic-recovery', ownerPid: owner.pid, ownerPidAlive: false, ownerSource: owner.source };
}

function chooseSeed(requestedSeed, env = process.env) {
  const explicit = normalizeSeed(requestedSeed);
  if (explicit) return { requested: String(requestedSeed).trim(), chosen: explicit, source: 'user', enforced: true };
  const fixture = env.NH_ELECTRON_TEST_FIXTURES === '1' ? normalizeSeed(env.NETHACK_SEED) : undefined;
  if (fixture) return { requested: String(requestedSeed || '').trim() || null, chosen: fixture, source: 'fixture-env', enforced: true };
  return { requested: String(requestedSeed || '').trim() || null, chosen: randomSeed(), source: 'app-random', enforced: true };
}

function parsePlayerSpec(playerSpec = '') {
  const spec = String(playerSpec || '').slice(0, 80);
  const body = spec.replace(/^-u\s*/, '').trim();
  const parts = body.split('-').map((part) => part.trim()).filter(Boolean);
  const hasName = parts.length >= 5;
  return {
    playerSpec: spec,
    name: hasName ? parts[0] || '' : '',
    role: hasName ? parts[1] || '' : parts[0] || '',
    race: hasName ? parts[2] || '' : parts[1] || '',
    gender: hasName ? parts[3] || '' : parts[2] || '',
    alignment: hasName ? parts[4] || '' : parts[3] || '',
  };
}

function allowlistedEnv(env = process.env) {
  const keys = [
    'NH_ELECTRON_TEST_FIXTURES', 'NH_TEST_SCENARIO_ID', 'NH_TEST_PLAYGROUND', 'NH_TEST_FORCE_DOWNSTAIRS_UNDER_HERO',
    'NH_DIAGNOSTIC_LOG_DIR', 'NH_ELECTRON_WINDOW_WIDTH', 'NH_ELECTRON_WINDOW_HEIGHT', 'AI_ORG_ELECTRON_CDP_PORT',
  ];
  const out = {};
  for (const key of keys) if (env[key] != null) out[key] = String(env[key]);
  return out;
}

class DiagnosticRunStore {
  constructor({ app, repoRoot, env = process.env } = {}) {
    this.app = app;
    this.repoRoot = repoRoot || process.cwd();
    this.env = env;
    this.root = path.resolve(env.NH_DIAGNOSTIC_LOG_DIR || path.join(app?.getPath ? app.getPath('userData') : this.repoRoot, 'diagnostic-runs'));
    this.maxBytes = Math.max(1024 * 1024, Number(env.NH_DIAGNOSTIC_MAX_BYTES || 100 * 1024 * 1024));
    this.active = null;
  }

  recoverUnfinalized() {
    try {
      if (!fs.existsSync(this.root)) return;
      for (const entry of fs.readdirSync(this.root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const runDir = path.join(this.root, entry.name);
        const runPath = path.join(runDir, 'run.json');
        const summaryPath = path.join(runDir, 'summary.json');
        if (!fs.existsSync(runPath) || fs.existsSync(summaryPath)) continue;
        const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
        const owner = liveRunOwner(runDir, run);
        if (owner.pid && pidIsAlive(owner.pid)) {
          console.warn(`[diagnostic-log] leaving unfinalized run active: ${run.runId || entry.name} owner pid ${owner.pid} is still alive (${owner.source})`);
          continue;
        }
        const events = readJsonlFile(path.join(runDir, 'events.jsonl'));
        const summary = this.buildSummary({
          run,
          events,
          finalized: false,
          recoveredAfterCrash: true,
          exit: recoveryExitFromEvents(events, run, owner),
        });
        fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
      }
    } catch (error) {
      console.warn(`[diagnostic-log] recovery failed: ${error.stack || error}`);
    }
  }

  startRun({ mode = 'shim', startOptions = {}, nethackOptions = '', pid = null } = {}) {
    if (this.active && !this.active.finalized) {
      this.appendEvent({ layer: 'main', category: 'process', type: 'start.rejected.alreadyRunning', payload: { mode, pid: this.active.pid || null } });
      return { alreadyRunning: true, run: this.publicRun() };
    }
    fs.mkdirSync(this.root, { recursive: true });
    const startedAt = new Date();
    const runId = `${isoForPath(startedAt)}-${crypto.randomBytes(4).toString('hex')}`;
    const runDir = path.join(this.root, safeSegment(runId));
    fs.mkdirSync(path.join(runDir, 'artifacts'), { recursive: true });
    const seed = chooseSeed(startOptions.seed, this.env);
    const run = {
      schema: RUN_SCHEMA,
      runId,
      startedAt: startedAt.toISOString(),
      app: { name: 'nethack-electron-poc', version: '0.1.0' },
      build: { electron: process.versions.electron || null, node: process.versions.node || null, gitCommit: null, gitDirty: null },
      platform: { os: os.platform(), arch: os.arch() },
      mode,
      player: parsePlayerSpec(startOptions.playerSpec),
      options: { NETHACKOPTIONS: nethackOptions || '' },
      test: {
        fixtures: this.env.NH_ELECTRON_TEST_FIXTURES === '1',
        scenarioId: this.env.NH_TEST_SCENARIO_ID || startOptions.scenarioId || null,
        visualReplay: Boolean(this.env.NH_VISUAL_REPLAY_RECORDING),
        recording: Boolean(startOptions.recording),
      },
      privacy: { policy: 'public-ui-and-boundary-diagnostics/no-spoilers-default', localPathFields: ['runDir'] },
      seed: { requested: seed.requested, chosen: seed.chosen, source: seed.source, effective: null, effectiveSource: null, enforced: seed.enforced, mismatch: false },
      environment: allowlistedEnv(this.env),
      appProcess: { pid: process.pid, ppid: process.ppid || null, startedAt: startedAt.toISOString() },
    };
    this.active = { run, runDir, seq: 0, events: [], counts: {}, dropped: {}, bytes: 0, startedMono: process.uptime() * 1000, finalized: false, pid };
    fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
    this.writeLiveMarker('running');
    fs.writeFileSync(path.join(runDir, 'events.jsonl'), '', 'utf8');
    fs.writeFileSync(path.join(runDir, 'message-log.jsonl'), '', 'utf8');
    fs.writeFileSync(path.join(runDir, 'shim-raw.jsonl'), '', 'utf8');
    this.appendEvent({ layer: 'main', category: 'process', type: 'run.started', payload: { mode, pid, runDirPrivacyClass: 'local-path' } });
    this.appendEvent({ layer: 'main', category: 'seed', type: 'seed.chosen', payload: run.seed });
    return { alreadyRunning: false, run: this.publicRun() };
  }

  publicRun() {
    if (!this.active) return null;
    return { runId: this.active.run.runId, runDir: this.active.runDir, seed: { ...this.active.run.seed } };
  }

  writeLiveMarker(status = 'running') {
    if (!this.active) return;
    const marker = {
      schema: 'nethack-electron-diagnostic-live-run/v1',
      runId: this.active.run.runId,
      pid: process.pid,
      ppid: process.ppid || null,
      status,
      updatedAt: new Date().toISOString(),
    };
    try { fs.writeFileSync(path.join(this.active.runDir, LIVE_MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, 'utf8'); }
    catch (error) { console.warn(`[diagnostic-log] live marker write failed: ${error.stack || error}`); }
  }

  appendEvent(event = {}) {
    if (!this.active || this.active.finalized) return null;
    const losslessCategories = new Set(['message', 'shim-send', 'prompt', 'menu', 'transaction', 'error', 'process', 'seed', 'user-action', 'game-over', 'diagnostic']);
    const category = String(event.category || 'diagnostic').slice(0, 64);
    if (this.active.bytes > this.maxBytes && !losslessCategories.has(category)) {
      this.active.dropped[category] = (this.active.dropped[category] || 0) + 1;
      if (this.active.dropped[category] === 1) this.appendEvent({ layer: 'main', category: 'diagnostic', type: 'diagnostic.eventsDropped', payload: { category, reason: 'diagnostic max bytes exceeded', maxBytes: this.maxBytes } });
      return null;
    }
    const seq = ++this.active.seq;
    const record = {
      schema: EVENT_SCHEMA,
      runId: this.active.run.runId,
      seq,
      at: new Date().toISOString(),
      monoMs: Math.round((process.uptime() * 1000 - this.active.startedMono) * 1000) / 1000,
      layer: String(event.layer || 'main').slice(0, 64),
      category,
      type: String(event.type || 'diagnostic.event').slice(0, 128),
      ...(event.transactionId ? { transactionId: String(event.transactionId).slice(0, 128) } : {}),
      ...(event.requestId ? { requestId: String(event.requestId).slice(0, 128) } : {}),
      payload: safeJson(event.payload || {}),
    };
    this.active.events.push(record);
    this.active.counts[record.category] = (this.active.counts[record.category] || 0) + 1;
    try {
      const line = `${JSON.stringify(record)}\n`;
      this.active.bytes += Buffer.byteLength(line);
      fs.appendFileSync(path.join(this.active.runDir, 'events.jsonl'), line, 'utf8');
      if (record.category === 'message') fs.appendFileSync(path.join(this.active.runDir, 'message-log.jsonl'), `${JSON.stringify(record)}\n`, 'utf8');
      if (record.category === 'shim-event' && /^shim\.raw/.test(record.type)) fs.appendFileSync(path.join(this.active.runDir, 'shim-raw.jsonl'), `${JSON.stringify(record)}\n`, 'utf8');
    } catch (error) {
      console.warn(`[diagnostic-log] append failed: ${error.stack || error}`);
    }
    return record;
  }

  recordBridgeSeed(event = {}) {
    const seed = normalizeSeed(event.seed);
    if (!this.active || !seed) return;
    this.active.run.seed.effective = seed;
    this.active.run.seed.effectiveSource = event.source || 'bridge_seed';
    this.active.run.seed.mismatch = Boolean(this.active.run.seed.chosen && this.active.run.seed.chosen !== seed);
    fs.writeFileSync(path.join(this.active.runDir, 'run.json'), `${JSON.stringify(this.active.run, null, 2)}\n`, 'utf8');
    this.appendEvent({ layer: 'main', category: 'seed', type: this.active.run.seed.mismatch ? 'seed.mismatch' : 'seed.effective', payload: { ...this.active.run.seed } });
  }

  buildSummary({ run, events, finalized = true, recoveredAfterCrash = false, exit = null } = {}) {
    const counts = events.reduce((acc, event) => { acc[event.category] = (acc[event.category] || 0) + 1; return acc; }, {});
    const visibleMessages = events.filter((event) => event.type === 'message.visible.appended').map((event) => event.payload?.displayText || event.payload?.text).filter(Boolean);
    const gameOver = events.filter((event) => String(event.category) === 'game-over').slice(-1)[0];
    return {
      schema: 'nethack-electron-diagnostic-summary/v1',
      runId: run.runId,
      startedAt: run.startedAt,
      endedAt: new Date().toISOString(),
      finalized,
      recoveredAfterCrash,
      seed: run.seed,
      mode: run.mode,
      player: run.player,
      counts,
      firstMessages: visibleMessages.slice(0, 10),
      lastMessages: visibleMessages.slice(-20),
      gameOver: gameOver ? { type: gameOver.type, payload: gameOver.payload } : null,
      exit,
      warnings: run.seed?.mismatch ? ['seed mismatch: chosen seed differs from bridge effective seed'] : [],
      reproducibility: { requires: ['seed.chosen/effective', 'player.playerSpec', 'options.NETHACKOPTIONS', 'complete input stream', 'build/version', 'fixture/scenario/playground state'] },
    };
  }

  finalize(exit = null) {
    if (!this.active || this.active.finalized) return null;
    this.appendEvent({ layer: 'main', category: 'process', type: 'run.finalizing', payload: { exit } });
    const active = this.active;
    const summary = this.buildSummary({ run: active.run, events: active.events, finalized: true, exit });
    const index = {
      schema: 'nethack-electron-diagnostic-index/v1',
      runId: active.run.runId,
      eventCount: active.events.length,
      lastSeq: active.seq,
      counts: active.counts,
      files: ['run.json', 'events.jsonl', 'message-log.jsonl', 'shim-raw.jsonl', 'summary.json', 'index.json'],
      dropped: active.dropped || {},
    };
    fs.writeFileSync(path.join(active.runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(active.runDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    try { fs.rmSync(path.join(active.runDir, LIVE_MARKER_FILE), { force: true }); }
    catch (error) { console.warn(`[diagnostic-log] live marker cleanup failed: ${error.stack || error}`); }
    active.finalized = true;
    const publicRun = this.publicRun();
    this.active = null;
    return publicRun;
  }
}

module.exports = { DiagnosticRunStore, RUN_SCHEMA, EVENT_SCHEMA, LIVE_MARKER_FILE, chooseSeed, normalizeSeed, safeJson, sanitizeShimLine, pidIsAlive };
