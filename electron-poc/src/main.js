const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const { createGameProcess } = require('./main/game-process');
const { createReplayRunner } = require('./main/replay-runner');
// Visual replay env hook and artifact implementation live in main/replay-runner.js: NH_VISUAL_REPLAY_RECORDING, captureReplayScreenshot, capturePage(), toPNG(), NH_VISUAL_REPLAY_INPUT_DELAY_MS, NH_VISUAL_REPLAY_SCREENSHOT_EVERY, NH_VISUAL_REPLAY_SCREENSHOT_GAP_MS, visual-replay-summary.json.
const Security = require('./main/electron-security');
const RecordingSchema = require('./shared/recording-schema');
const { DiagnosticRunStore } = require('./main/diagnostic-log');
const { installAppLifecycleDiagnostics } = require('./main/app-lifecycle-diagnostics');
const RecoveryState = require('./main/recovery-state');

const repoRoot = path.resolve(__dirname, '..', '..');
const nethackBin = process.env.NETHACK_BINARY || path.join(repoRoot, 'src', 'nethack');
const shimBridgeBin = process.env.NH_SHIM_BRIDGE || path.join(repoRoot, 'electron-poc', 'shim-bridge', 'nh-shim-bridge');

Security.configureCommandLine({ app });

let win;
let gameProcess;
let diagnostics;

const appLifecycleDiagnostics = installAppLifecycleDiagnostics({
  app,
  getWindow: () => win,
  getGameProcess: () => gameProcess,
  getDiagnostics: () => diagnostics,
});

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  const requestedWidth = Number(process.env.NH_ELECTRON_WINDOW_WIDTH || 1100);
  const requestedHeight = Number(process.env.NH_ELECTRON_WINDOW_HEIGHT || 760);
  const useContentSize = process.env.NH_ELECTRON_WINDOW_CONTENT_SIZE === '1';
  const showWindow = process.env.NH_ELECTRON_SHOW !== '0';
  diagnostics = new DiagnosticRunStore({ app, repoRoot, env: process.env });
  diagnostics.recoverUnfinalized();
  gameProcess = createGameProcess({ repoRoot, nethackBin, shimBridgeBin, send, diagnostics });
  win = new BrowserWindow({
    width: requestedWidth,
    height: requestedHeight,
    useContentSize,
    show: showWindow,
    title: 'NetHack Electron POC',
    webPreferences: Security.secureWebPreferences({ preload: path.join(__dirname, 'preload.js') }),
  });
  Security.hardenWindow(win, { allowFileNavigation: true });
  win.on('close', () => appLifecycleDiagnostics.noteQuitIntent('browser-window-close'));
  win.on('closed', () => appLifecycleDiagnostics.noteQuitIntent('browser-window-closed'));
  win.loadFile(path.join(__dirname, 'renderer.html'));
  win.webContents.once('did-finish-load', () => {
    createReplayRunner({ app, win, repoRoot }).runIfRequested().catch((error) => {
      console.error(`[visual-replay] ${error.stack || error}`);
      app.exit(1);
    });
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  appLifecycleDiagnostics.noteQuitIntent('window-all-closed');
  app.quit();
});

function recordingPathFor(recording) {
  const started = String(recording?.startedAt || new Date().toISOString()).replace(/[:.]/g, '-');
  const name = String(recording?.character?.name || 'nethack').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'nethack';
  return path.join(repoRoot, 'electron-poc', 'test', 'recordings', `${started}-${name}.nhrec.json`);
}

ipcMain.handle('nethack:info', () => ({
  repoRoot,
  nethackBin,
  shimBridgeBin,
  security: { sandbox: true, contextIsolation: true, nodeIntegration: false, csp: "default-src 'self' file:; img-src 'self' file: data:; style-src 'self' 'unsafe-inline' file:; script-src 'self' 'unsafe-inline' file:" },
  modules: { gameProcess: 'main/game-process', replayRunner: 'main/replay-runner', shimProtocol: 'shared/shim-protocol', diagnosticLog: 'main/diagnostic-log' },
}));

ipcMain.handle('nethack:stop', () => gameProcess.stop());

ipcMain.handle('nethack:runVersion', async () => new Promise((resolve) => {
  const proc = spawn(nethackBin, ['--version'], { cwd: repoRoot, env: process.env });
  let output = '';
  proc.stdout.on('data', (data) => { output += data.toString(); });
  proc.stderr.on('data', (data) => { output += data.toString(); });
  proc.on('error', (error) => resolve({ ok: false, output: String(error) }));
  proc.on('close', (code) => resolve({ ok: code === 0, code, output }));
}));

ipcMain.handle('nethack:startGame', (_event, size = {}) => gameProcess.startGame(size));
ipcMain.handle('nethack:startShimBridge', (_event, options = {}) => gameProcess.startShimBridge(options));

ipcMain.handle('nethack:diagnosticEvent', (_event, event) => {
  if (!event || typeof event !== 'object') return { ok: false, message: 'invalid diagnostic event' };
  const record = diagnostics?.appendEvent?.({
    layer: String(event.layer || 'renderer').slice(0, 64),
    category: String(event.category || 'diagnostic').slice(0, 64),
    type: String(event.type || 'renderer.event').slice(0, 128),
    transactionId: event.transactionId,
    requestId: event.requestId,
    payload: event.payload || {},
  });
  return { ok: Boolean(record), seq: record?.seq || null, runId: record?.runId || null };
});

ipcMain.handle('nethack:activeDiagnosticRun', () => ({ ok: true, diagnostic: diagnostics?.publicRun?.() || null }));

ipcMain.handle('nethack:startupRecoveryState', () => RecoveryState.getRecoveryState({ repoRoot, env: process.env }));
ipcMain.handle('nethack:prepareContinueGame', (_event, candidateId = '') => RecoveryState.prepareContinueGame({ repoRoot, env: process.env, candidateId: String(candidateId || '').slice(0, 120) }));

ipcMain.handle('nethack:saveRecording', async (_event, recording) => {
  const checked = RecordingSchema.sanitizeForSave(recording);
  if (!checked.ok) return { ok: false, message: checked.message };
  const outPath = recordingPathFor(checked.recording);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(checked.recording, null, 2)}\n`, 'utf8');
  return { ok: true, path: outPath };
});

ipcMain.on('nethack:input', (_event, input) => gameProcess.input(input));
ipcMain.on('nethack:shimKey', (_event, key) => gameProcess.shimKey(key));
ipcMain.on('nethack:shimInput', (_event, payload) => gameProcess.shimInput(payload));
ipcMain.handle('nethack:uiCommand', (_event, command) => gameProcess.uiCommand(command));

