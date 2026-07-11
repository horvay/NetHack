const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');

function runBridgeWithInput(lines, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bridge, [], { cwd: root, env: { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ stdout: stdout.join(''), stderr: stderr.join(''), timedOut: true });
    }, timeoutMs);
    child.stdout.on('data', (d) => stdout.push(String(d)));
    child.stderr.on('data', (d) => stderr.push(String(d)));
    child.on('error', reject);
    child.on('close', () => { clearTimeout(timer); resolve({ stdout: stdout.join(''), stderr: stderr.join(''), timedOut: false }); });
    for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`);
    setTimeout(() => { try { child.stdin.end(); } catch {} }, 250);
  });
}

function events(output) {
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

(async () => {
  const stale = await runBridgeWithInput([
    { type: 'keycode', keycode: 'd'.charCodeAt(0), transactionId: 'txn-stale-c-test', actionId: 'item.putOn.ring', actionLabel: 'Put on ring', targetSelector: 'd', targetText: 'd - an uncursed granite ring', expectedRequestId: 'req-closed' },
  ]);
  const staleEvents = events(stale.stdout);
  const rejected = staleEvents.find((event) => event.name === 'bridge_semantic_followup_rejected');
  assert(rejected, `expected bridge_semantic_followup_rejected, saw ${stale.stdout.slice(0, 1000)}`);
  assert.equal(rejected.transactionId, 'txn-stale-c-test');
  assert.equal(rejected.guiAction?.actionId, 'item.putOn.ring');
  assert.match(rejected.reason, /expected prompt request id/i);

  const accepted = await runBridgeWithInput([
    { type: 'keycode', keycode: 'r'.charCodeAt(0), transactionId: 'txn-read-c-test', actionId: 'item.read.scroll', actionLabel: 'Read', targetSelector: 'f', targetText: 'f - a scroll of identify', commandPosition: 1, commandLength: 2 },
    { type: 'keycode', keycode: 'f'.charCodeAt(0), transactionId: 'txn-read-c-test', actionId: 'item.read.scroll', actionLabel: 'Read', targetSelector: 'f', targetText: 'f - a scroll of identify', commandPosition: 2, commandLength: 2 },
  ]);
  const acceptedEvents = events(accepted.stdout);
  const commands = acceptedEvents.filter((event) => event.name === 'bridge_command' && event.transactionId === 'txn-read-c-test');
  assert(commands.length >= 2, `expected two bridge_command events with stable transaction id, saw ${accepted.stdout.slice(0, 1000)}`);
  assert(commands.every((event) => event.guiAction?.actionId === 'item.read.scroll'), 'bridge commands preserve GUI action metadata');

  const groundCommands = [
    ['#loot\n', 'txn-ground-loot-c-test', 'ground.openContainer', 'Loot bag', 6],
    ['#tip\n', 'txn-ground-tip-c-test', 'ground.tipContainer', 'Tip contents here', 5],
    ['#force\n', 'txn-ground-force-c-test', 'ground.forceContainer', 'Force lock here', 7],
    ['#rub\n', 'txn-item-rub-c-test', 'item.rub', 'Rub', 5],
    ['#dip\n', 'txn-ground-dip-terrain-c-test', 'ground.dipIntoTerrain', 'Dip item in fountain', 5],
    ['#untrap\n', 'txn-ground-untrap-c-test', 'ground.untrapContainer', 'Untrap container here', 8],
  ];
  for (const [keys, transactionId, actionId, actionLabel, length] of groundCommands) {
    const run = await runBridgeWithInput(keys.split('').map((key, index) => ({
      type: 'keycode',
      keycode: key.charCodeAt(0),
      transactionId,
      actionId,
      actionLabel,
      targetText: 'locked large box',
      commandPosition: index + 1,
      commandLength: length,
    })));
    const groundEvents = events(run.stdout);
    const commands = groundEvents.filter((event) => event.name === 'bridge_command' && event.transactionId === transactionId);
    assert.equal(commands.length, length, `expected ${length} ${keys.trim()} bridge commands with stable v2 transaction metadata, saw ${run.stdout.slice(0, 1200)}`);
    assert(commands.every((event) => event.guiAction?.actionId === actionId && /box/i.test(event.guiAction?.targetText || '')), `bridge preserves ${actionId} metadata on every ${keys.trim()} key`);
  }

  console.log('bridge-semantic-action-metadata-test PASS');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
