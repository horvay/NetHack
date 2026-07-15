const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, 'electron-poc', 'test-output', 'direct-container-transfer-shim');
fs.mkdirSync(outDir, { recursive: true });
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 50) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function main() {
  const bridge = path.join(root, 'electron-poc', 'shim-bridge', 'nh-shim-bridge');
  const env = { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: 'container/multi-item-transfer-large-box-on-hero', NH_SHIM_RESET_LOCKS: '1' };
  const child = spawn(bridge, [], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const events = [];
  const stderr = [];
  const write = (payload) => child.stdin.write(`${JSON.stringify(payload)}\n`);
  child.stderr.on('data', (d) => stderr.push(d.toString('utf8')));
  child.stdout.on('data', (d) => {
    for (const line of d.toString('utf8').split(/\r?\n/).filter(Boolean)) {
      try { events.push(JSON.parse(line)); }
      catch { events.push({ type: 'raw', line }); }
    }
  });
  const cleanup = () => { try { child.kill('SIGTERM'); } catch {} };
  process.on('exit', cleanup);
  try {
    await waitFor(() => events.find((e) => e.name === 'bridge_test_scenario_loaded'), 15000);
    await waitFor(() => events.find((e) => e.name === 'shim_ground_pile_snapshot' && (e.items || []).some((i) => i.objectId)), 15000);
    const ground = [...events].reverse().find((e) => e.name === 'shim_ground_pile_snapshot' && (e.items || []).some((i) => /box|chest|sack|bag|container/i.test(i.displayName || '')));
    const container = (ground.items || []).find((i) => /box|chest|sack|bag|container/i.test(i.displayName || ''));
    assert('ground container has public objectId', Number.isInteger(container?.objectId) && container.objectId > 0, JSON.stringify(ground));
    const snapshotTx = 'fixture-direct-container-snapshot-1';
    const snapshotSession = `container-${container.objectId}-direct-shim`;
    write({ type: 'container-snapshot', command: { protocol: 'nethack-electron-ui/v2', commandId: snapshotTx, commandType: 'container.snapshot', transactionId: snapshotTx, payload: { sessionId: snapshotSession, containerId: container.objectId } } });
    await waitFor(() => events.find((e) => e.name === 'shim_container_snapshot_confirmed' && e.transactionId === snapshotTx), 15000);
    await waitFor(() => events.find((e) => e.name === 'shim_container_contents_snapshot' && e.container?.objectId === container.objectId && (e.items || []).length >= 2), 15000);
    const firstSnapshot = [...events].reverse().find((e) => e.name === 'shim_container_contents_snapshot' && e.container?.objectId === container.objectId);
    await delay(250);
    const firstItem = firstSnapshot.items[0];
    const secondItem = firstSnapshot.items[1];
    assert('container contents items have public objectIds', firstItem.objectId && secondItem.objectId && firstItem.objectId !== secondItem.objectId, JSON.stringify(firstSnapshot));
    const appearancePotion = firstSnapshot.items.find((item) => /potion/i.test(item.semanticAppearance || item.displayName || ''));
    assert('direct container snapshot observes items and publishes the same complete appearance used by inventory', appearancePotion?.semanticKnown === false
      && /potion/i.test(appearancePotion.semanticAppearance || '')
      && String(appearancePotion.displayName || '').toLowerCase().includes(String(appearancePotion.semanticAppearance).toLowerCase())
      && !/^(?:a |an )?potion$/i.test(String(appearancePotion.displayName || '').trim()), JSON.stringify(firstSnapshot));
    function transfer(item, n, snapshot, direction = 'container-to-inventory') {
      const tx = `fixture-direct-container-transfer-${n}`;
      write({ type: 'container-transfer', command: { protocol: 'nethack-electron-ui/v2', commandId: tx, commandType: 'container.transfer', transactionId: tx, expectedRevision: { container: snapshot.revision }, payload: { direction, transferId: tx, sessionId: snapshot.sessionId, containerId: container.objectId, itemId: item.objectId, item: { objectId: item.objectId, displayName: item.displayName, location: { kind: direction === 'inventory-to-container' ? 'inventory' : 'container' } } } } });
      return tx;
    }
    const tx1 = transfer(firstItem, 1, firstSnapshot);
    await waitFor(() => events.find((e) => e.name === 'shim_container_transfer_confirmed' && e.transferId === tx1), 15000);
    await waitFor(() => events.find((e) => e.name === 'shim_update_inventory' && e.transactionId === tx1 && (e.items || []).some((i) => i.objectId === firstItem.objectId)), 15000);
    const afterFirst = [...events].reverse().find((e) => e.name === 'shim_container_contents_snapshot' && e.container?.objectId === container.objectId && !(e.items || []).some((i) => i.objectId === firstItem.objectId));
    assert('first transfer refreshed container snapshot without first item', afterFirst, 'missing after-first snapshot');
    const putBack = transfer(firstItem, 'put-back', afterFirst, 'inventory-to-container');
    await waitFor(() => events.find((e) => e.name === 'shim_container_transfer_confirmed' && e.transferId === putBack && e.direction === 'inventory-to-container'), 15000);
    const afterPutBack = [...events].reverse().find((e) => e.name === 'shim_container_contents_snapshot' && e.container?.objectId === container.objectId && (e.items || []).some((i) => i.objectId === firstItem.objectId));
    assert('inventory-to-container direct transfer refreshed container snapshot with first item restored', afterPutBack, 'missing put-back snapshot');
    const remainingSecond = (afterPutBack.items || []).find((i) => i.objectId === secondItem.objectId) || secondItem;
    const tx2 = transfer(remainingSecond, 2, afterPutBack);
    await waitFor(() => events.find((e) => e.name === 'shim_container_transfer_confirmed' && e.transferId === tx2), 15000);
    await waitFor(() => events.find((e) => e.name === 'shim_update_inventory' && e.transactionId === tx2 && (e.items || []).some((i) => i.objectId === secondItem.objectId)), 15000);
    const afterSecond = [...events].reverse().find((e) => e.name === 'shim_container_contents_snapshot' && e.container?.objectId === container.objectId && !(e.items || []).some((i) => i.objectId === secondItem.objectId));
    assert('second transfer refreshed container snapshot without second item', afterSecond, 'missing after-second snapshot');
    const hiddenLootEvents = events.filter((e) => e.name === 'bridge_extcmd_answer' && /^(?:#?loot)$/i.test(String(e.command || e.value || '')));
    assert('direct container shim test sent no #loot/loot command text', hiddenLootEvents.length === 0, JSON.stringify(hiddenLootEvents));
    fs.writeFileSync(path.join(outDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'));
    fs.writeFileSync(path.join(outDir, 'summary.md'), [`# Direct container transfer shim regression`, '', 'PASS', '', 'Scenario: container/multi-item-transfer-large-box-on-hero', `Container ${container.objectId}: ${container.displayName}`, `Opened by direct container.snapshot: ${snapshotTx}`, `Moved first item out ${firstItem.objectId}: ${firstItem.displayName}`, `Put first item back via inventory-to-container: ${putBack}`, `Moved later item out ${secondItem.objectId}: ${secondItem.displayName}`, `First revision: ${firstSnapshot.revision}`, `After put-back revision used for later transfer: ${afterPutBack.revision}`, `Events: ${path.join(outDir, 'events.jsonl')}`, ''].join('\n'));
    console.log(fs.readFileSync(path.join(outDir, 'summary.md'), 'utf8'));
  } catch (error) {
    fs.writeFileSync(path.join(outDir, 'events-failure.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'));
    fs.writeFileSync(path.join(outDir, 'stderr.txt'), stderr.join(''));
    throw error;
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
