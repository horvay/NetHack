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
const WindowPolicy = require('./main/window-policy');
const PackagedRuntime = require('./main/packaged-runtime');

const devRepoRoot = path.resolve(__dirname, '..', '..');
const runtime = PackagedRuntime.resolveRuntime({
  packaged: app.isPackaged,
  devRepoRoot,
  resourcesPath: process.resourcesPath,
  userDataPath: app.getPath('userData'),
  platform: process.platform,
});
const repoRoot = runtime.repoRoot;
const nethackBin = process.env.NETHACK_BINARY || runtime.nethackBin;
const shimBridgeBin = process.env.NH_SHIM_BRIDGE || runtime.shimBridgeBin;
const runtimeEnv = PackagedRuntime.runtimeEnvironment(runtime, process.env);

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
  const windowPolicy = WindowPolicy.browserWindowSizePolicy(runtimeEnv);
  const useContentSize = runtimeEnv.NH_ELECTRON_WINDOW_CONTENT_SIZE === '1';
  const showWindow = runtimeEnv.NH_ELECTRON_SHOW !== '0';
  diagnostics = new DiagnosticRunStore({ app, repoRoot, env: runtimeEnv });
  diagnostics.recoverUnfinalized();
  gameProcess = createGameProcess({ repoRoot, nethackBin, shimBridgeBin, send, env: runtimeEnv, diagnostics });
  win = new BrowserWindow({
    width: windowPolicy.initial.width,
    height: windowPolicy.initial.height,
    minWidth: windowPolicy.minimum.width,
    minHeight: windowPolicy.minimum.height,
    useContentSize,
    show: showWindow,
    title: 'NetHack Electron',
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

app.whenReady().then(async () => {
  await PackagedRuntime.preparePlayground(runtime);
  createWindow();
}).catch((error) => {
  console.error(`[startup] ${error.stack || error}`);
  app.exit(1);
});
app.on('window-all-closed', () => {
  appLifecycleDiagnostics.noteQuitIntent('window-all-closed');
  app.quit();
});

function recordingPathFor(recording) {
  const started = String(recording?.startedAt || new Date().toISOString()).replace(/[:.]/g, '-');
  const name = String(recording?.character?.name || 'nethack').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'nethack';
  const root = app.isPackaged ? path.join(app.getPath('userData'), 'recordings') : path.join(repoRoot, 'electron-poc', 'test', 'recordings');
  return path.join(root, `${started}-${name}.nhrec.json`);
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
  const proc = spawn(nethackBin, ['--version'], { cwd: repoRoot, env: runtimeEnv });
  let output = '';
  proc.stdout.on('data', (data) => { output += data.toString(); });
  proc.stderr.on('data', (data) => { output += data.toString(); });
  proc.on('error', (error) => resolve({ ok: false, output: String(error) }));
  proc.on('close', (code) => resolve({ ok: code === 0, code, output }));
}));

ipcMain.handle('nethack:startGame', (_event, size = {}) => gameProcess.startGame(size));
ipcMain.handle('nethack:startShimBridge', (_event, options = {}) => gameProcess.startShimBridge(options));

ipcMain.on('nethack:diagnosticEvent', (_event, event) => {
  if (!event || typeof event !== 'object') return;
  try {
    diagnostics?.appendEvent?.({
      layer: String(event.layer || 'renderer').slice(0, 64),
      category: String(event.category || 'diagnostic').slice(0, 64),
      type: String(event.type || 'renderer.event').slice(0, 128),
      transactionId: event.transactionId,
      requestId: event.requestId,
      payload: event.payload || {},
    });
  } catch (error) {
    console.warn(`[diagnostic-log] renderer diagnostic failed: ${error.stack || error}`);
  }
});

ipcMain.handle('nethack:activeDiagnosticRun', () => ({ ok: true, diagnostic: diagnostics?.publicRun?.() || null }));

ipcMain.handle('nethack:testCaptureProfile', async (event, profile = {}) => {
  if (process.env.NH_ELECTRON_TEST_FIXTURES !== '1' || !process.env.NH_TEST_CAPTURE_DIR) return { ok: false, message: 'native test capture is disabled' };
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return { ok: false, message: 'capture sender does not own the application window' };
  const width = Math.max(640, Math.min(1920, Math.round(Number(profile.width) || 1360)));
  const height = Math.max(480, Math.min(1200, Math.round(Number(profile.height) || 920)));
  const zoomFactor = Math.max(1, Math.min(2, Number(profile.zoomPercent || 100) / 100));
  win.setContentSize(width, height, false);
  win.webContents.setZoomFactor(zoomFactor);
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { ok: true, windowSize: win.getSize(), contentSize: win.getContentSize(), zoomFactor };
});

ipcMain.handle('nethack:testCapturePage', async (event, captureId = '') => {
  if (process.env.NH_ELECTRON_TEST_FIXTURES !== '1' || !process.env.NH_TEST_CAPTURE_DIR) return { ok: false, message: 'native test capture is disabled' };
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return { ok: false, message: 'capture sender does not own the application window' };
  const id = String(captureId || '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!id) return { ok: false, message: 'capture id is required' };
  const captureRoot = path.resolve(process.env.NH_TEST_CAPTURE_DIR);
  const file = path.join(captureRoot, `${id}.png`);
  if (path.dirname(file) !== captureRoot) return { ok: false, message: 'capture path escaped the configured test directory' };
  await new Promise((resolve) => setTimeout(resolve, 50));
  const image = await win.webContents.capturePage();
  const size = image.getSize();
  await fs.mkdir(captureRoot, { recursive: true });
  await fs.writeFile(file, image.toPNG());
  return { ok: true, path: file, width: size.width, height: size.height, method: 'BrowserWindow.webContents.capturePage' };
});

ipcMain.handle('nethack:startupRecoveryState', () => RecoveryState.getRecoveryState({ repoRoot, env: runtimeEnv, recoverBin: runtime.recoverBin }));
ipcMain.handle('nethack:prepareContinueGame', (_event, candidateId = '') => RecoveryState.prepareContinueGame({ repoRoot, env: runtimeEnv, recoverBin: runtime.recoverBin, candidateId: String(candidateId || '').slice(0, 120) }));

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

