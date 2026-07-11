const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, 'electron-poc', 'test-output', 'direct-container-snapshot-locked-shim');
fs.mkdirSync(outDir, { recursive: true });

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 50) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await delay(stepMs);
  }
  throw last || new Error('timed out');
}

async function main() {
  const bridge = path.join(root, 'electron-poc', 'shim-bridge', 'nh-shim-bridge');
  const env = { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: 'container/locked-trapped-chest-on-hero', NH_SHIM_RESET_LOCKS: '1' };
  const child = spawn(bridge, [], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const events = [];
  const stderr = [];
  const write = (payload) => child.stdin.write(`${JSON.stringify(payload)}\n`);
  child.stderr.on('data', (data) => stderr.push(data.toString('utf8')));
  child.stdout.on('data', (data) => {
    for (const line of data.toString('utf8').split(/\r?\n/).filter(Boolean)) {
      try { events.push(JSON.parse(line)); }
      catch { events.push({ type: 'raw', line }); }
    }
  });
  const cleanup = () => { try { child.kill('SIGTERM'); } catch {} };
  process.on('exit', cleanup);
  try {
    await waitFor(() => events.find((event) => event.name === 'bridge_test_scenario_loaded'), 15000);
    await waitFor(() => events.find((event) => event.name === 'shim_ground_pile_snapshot' && (event.items || []).some((item) => item.objectId)), 15000);
    const ground = [...events].reverse().find((event) => event.name === 'shim_ground_pile_snapshot' && (event.items || []).some((item) => /box|chest|container/i.test(item.displayName || '')));
    const container = (ground?.items || []).find((item) => /box|chest|container/i.test(item.displayName || ''));
    assert('locked fixture container has public objectId', Number.isInteger(container?.objectId) && container.objectId > 0, JSON.stringify(ground));

    const snapshotTx = 'fixture-locked-container-snapshot';
    const snapshotSession = `container-${container.objectId}-locked-direct-shim`;
    write({ type: 'container-snapshot', command: { protocol: 'nethack-electron-ui/v2', commandId: snapshotTx, commandType: 'container.snapshot', transactionId: snapshotTx, payload: { sessionId: snapshotSession, containerId: container.objectId } } });

    const rejected = await waitFor(() => events.find((event) => event.name === 'shim_container_snapshot_rejected' && event.transactionId === snapshotTx), 15000);
    assert('locked snapshot rejection carries structured status', rejected.status === 'rejected' && rejected.failureKind === 'locked', JSON.stringify(rejected));
    assert('locked snapshot rejection carries clear reason', /locked/i.test(rejected.reason || ''), JSON.stringify(rejected));
    assert('locked snapshot rejection preserves session/container identity', rejected.sessionId === snapshotSession && rejected.containerId === container.objectId, JSON.stringify(rejected));
    assert('locked snapshot does not emit a false contents snapshot', !events.some((event) => event.name === 'shim_container_contents_snapshot' && event.sessionId === snapshotSession), events.filter((event) => /container/.test(event.name || '')).map((event) => JSON.stringify(event)).join('\n'));

    fs.writeFileSync(path.join(outDir, 'events.jsonl'), events.map((event) => JSON.stringify(event)).join('\n'));
    fs.writeFileSync(path.join(outDir, 'stderr.txt'), stderr.join(''));
    fs.writeFileSync(path.join(outDir, 'summary.md'), [
      '# Direct locked container snapshot shim regression',
      '',
      'PASS',
      '',
      'Scenario: container/locked-trapped-chest-on-hero',
      `Container ${container.objectId}: ${container.displayName}`,
      `Rejected transaction: ${snapshotTx}`,
      `Reason: ${rejected.reason}`,
      `Failure kind: ${rejected.failureKind}`,
      `Events: ${path.join(outDir, 'events.jsonl')}`,
      '',
    ].join('\n'));
    console.log(fs.readFileSync(path.join(outDir, 'summary.md'), 'utf8'));
  } catch (error) {
    fs.writeFileSync(path.join(outDir, 'events-failure.jsonl'), events.map((event) => JSON.stringify(event)).join('\n'));
    fs.writeFileSync(path.join(outDir, 'stderr.txt'), stderr.join(''));
    throw error;
  } finally {
    cleanup();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
