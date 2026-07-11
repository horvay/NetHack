const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const Harness = require('./lib/electron-test-harness');

async function waitForExit(child, timeoutMs = 3000) {
  if (child.exitCode != null || child.signalCode != null) return { code: child.exitCode, signal: child.signalCode };
  return Promise.race([
    new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal }))),
    Harness.delay(timeoutMs).then(() => null),
  ]);
}

async function testTerminateEscalatesAfterPriorSignal() {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"], { stdio: 'ignore' });
  await Harness.delay(100);
  child.kill('SIGTERM');
  assert.equal(child.killed, true, 'precondition: child.killed only means a signal was sent');
  await Harness.terminateElectron(child, null, 100);
  const exit = await waitForExit(child, 3000);
  assert(exit, 'terminateElectron should not leave a SIGTERM-ignoring child alive');
  assert.equal(exit.signal, 'SIGKILL');
}

async function main() {
  assert.equal(Harness.keyEventParams('Escape').text, '');
  assert.equal(Harness.keyEventParams('Enter', '\n').text, '');
  assert.equal(Harness.keyEventParams('?', '?').text, '?');
  await testTerminateEscalatesAfterPriorSignal();
  console.log('electron test harness contract OK');
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
