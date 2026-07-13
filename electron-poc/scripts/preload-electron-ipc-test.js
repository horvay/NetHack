'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

if (!process.versions.electron) {
  const electron = require('electron');
  const child = spawnSync(electron, [__filename, '--electron-child'], {
    cwd: root,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
    encoding: 'utf8',
    timeout: 30000,
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) throw child.error;
  assert.equal(child.signal, null, `Electron preload IPC test was killed by ${child.signal}`);
  assert.equal(child.status, 0, `Electron preload IPC test exited ${child.status}`);
  process.exit(0);
}

const { app, BrowserWindow, ipcMain } = require('electron');
const Security = require('../src/main/electron-security');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForValue(win, expression, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await win.webContents.executeJavaScript(expression, true);
    if (value) return value;
    await delay(25);
  }
  throw new Error(`timed out waiting for renderer expression: ${expression}`);
}

async function run() {
  const receivedCommands = [];
  ipcMain.handle('nethack:uiCommand', (_event, command) => {
    receivedCommands.push(command);
    return { ok: true, commandId: command.commandId };
  });
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: Security.secureWebPreferences({ preload: path.join(root, 'src/preload.js') }),
  });
  try {
    await win.loadFile(path.join(root, 'scripts/fixtures/preload-electron-ipc.html'));
    await waitForValue(win, 'window.fixtureReady === true');

    const validAck = await win.webContents.executeJavaScript('window.invokeValidCommand()', true);
    assert.deepEqual(validAck, { ok: true, commandId: 'actual-contextbridge-command' }, 'ordinary renderer records cross the real contextBridge and IPC invoke boundary');
    assert.equal(receivedCommands.length, 1);
    assert.deepEqual(receivedCommands[0].payload, { nested: [{ value: 'renderer-to-main' }] }, 'nested renderer data reaches main without contract weakening');

    const spoofed = await win.webContents.executeJavaScript('window.invokeSpoofedCommand()', true);
    assert.equal(spoofed.rejected, false, 'Electron contextBridge canonicalizes API argument records before the preload validator sees them');
    assert.equal(receivedCommands.length, 2);
    assert.equal(Object.getPrototypeOf(receivedCommands[1]), Object.prototype, 'the contextBridge/IPC result is an ordinary main-realm record');
    assert.equal(Object.prototype.hasOwnProperty.call(receivedCommands[1], 'constructor'), false, 'spoofed prototype properties and behavior do not cross contextBridge/IPC');

    const sparse = [];
    sparse.length = 3;
    sparse[1] = 'middle';
    win.webContents.send('nethack:shimEvent', {
      nested: [{ value: 'main-to-renderer' }],
      sparse,
      special: [-0, Number.NaN, Number.POSITIVE_INFINITY],
      explicitUndefined: undefined,
      bigintValue: 77n,
    });
    const firstDelivery = await waitForValue(win, 'window.boundaryResults.deliveries.length === 1 && window.boundaryResults.deliveries[0]');
    assert.deepEqual(firstDelivery, {
      nestedValue: 'main-to-renderer',
      sparseHole: false,
      negativeZero: true,
      nan: true,
      positiveInfinity: true,
      undefinedOwn: true,
      bigint: true,
      frozenRoot: false,
      frozenNested: false,
    }, 'ordinary nested Electron IPC data crosses the live preload with special values intact; contextBridge then returns its own mutable dense renderer-realm copy');

    for (const unsupported of [new Date(0), new Map([['key', 'value']])]) {
      win.webContents.send('nethack:shimEvent', unsupported);
      await delay(100);
      const count = await win.webContents.executeJavaScript('window.boundaryResults.deliveries.length', true);
      assert.equal(count, 1, `${unsupported.constructor.name} is rejected before the renderer callback at the live preload boundary`);
    }

    for (const unsupported of [Symbol('payload'), () => 'payload']) {
      win.webContents.send('nethack:shimEvent', unsupported);
      await delay(100);
      const count = await win.webContents.executeJavaScript('window.boundaryResults.deliveries.length', true);
      assert.equal(count, 1, 'Electron IPC refuses unserializable source values before renderer delivery');
    }

    win.webContents.send('nethack:shimEvent', { nested: [{ value: 'after-rejections' }], sparse: [], special: [0, 0, 0], explicitUndefined: undefined, bigintValue: 77n });
    const afterRejection = await waitForValue(win, 'window.boundaryResults.deliveries.length === 2 && window.boundaryResults.deliveries[1]');
    assert.equal(afterRejection.nestedValue, 'after-rejections', 'the live subscription remains usable after fail-closed payload rejections');
    console.log('real sandboxed Electron contextBridge/IPC preload boundary OK');
  } finally {
    ipcMain.removeHandler('nethack:uiCommand');
    if (!win.isDestroyed()) win.destroy();
  }
}

app.whenReady().then(run).then(() => app.quit()).catch((error) => {
  console.error(error.stack || error);
  app.exit(1);
});
