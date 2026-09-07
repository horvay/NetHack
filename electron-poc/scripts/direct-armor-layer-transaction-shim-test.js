const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const bridge = path.join(root, 'electron-poc', 'shim-bridge', 'nh-shim-bridge');
const outputDir = path.join(root, 'electron-poc', 'test-output', 'direct-armor-layer-transaction-shim');

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(check, timeoutMs = 30000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw lastError || new Error('timed out waiting for native armor transaction');
}
function latestInventory(events) {
  return [...events].reverse().find((event) => event.name === 'shim_update_inventory' && Array.isArray(event.items));
}
function worn(item) { return /being worn/i.test(item?.text || ''); }
function latestTurn(events) {
  const event = [...events].reverse().find((entry) => entry.name === 'shim_status_update' && entry.field === 16 && /^\d+$/.test(String(entry.value || '')));
  return event ? Number(event.value) : null;
}
function command(itemId, inventory, transactionId) {
  return {
    type: 'equipment-change',
    command: {
      protocol: 'nethack-electron-ui/v2',
      commandId: transactionId,
      commandType: 'equipment.change',
      transactionId,
      expectedRevision: {
        inventory: inventory.inventoryRevision || inventory.revision || 0,
        equipment: inventory.equipmentRevision || 0,
      },
      payload: { action: 'wearArmor', itemId, slotId: 'armor.body' },
    },
  };
}
async function runScenario(scenarioId, verify) {
  const playground = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-armor-layer-'));
  fs.cpSync(path.join(root, 'playground'), playground, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/.test(path.basename(entry)) });
  const child = spawn(bridge, [], {
    cwd: root,
    env: {
      ...process.env,
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NH_TEST_PLAYGROUND: playground,
      NETHACKDIR: playground,
      NH_SHIM_RESET_LOCKS: '1',
      NETHACKOPTIONS: '!tutorial,!autopickup,time',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const events = [];
  const stderr = [];
  let stdoutBuffer = '';
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8');
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    for (const line of lines.filter(Boolean)) {
      try { events.push(JSON.parse(line)); }
      catch { events.push({ name: 'unparsed-output', line }); }
    }
  });
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString('utf8')));
  try {
    await waitFor(() => events.find((event) => event.name === 'bridge_test_scenario_loaded'));
    const before = await waitFor(() => latestInventory(events)?.items?.some((item) => item.objectId) ? latestInventory(events) : null);
    const target = before.items.find((item) => /leather armor/i.test(item.text || ''));
    assert(`${scenarioId} has a loose target body armor with a public object id`,
      target?.objectId > 0 && !worn(target), JSON.stringify(before.items));
    const turnBefore = await waitFor(() => Number.isInteger(latestTurn(events)) ? latestTurn(events) : null);
    const transactionId = `armor-layer-${scenarioId.split('/').pop()}-${Date.now()}`;
    child.stdin.write(`${JSON.stringify(command(target.objectId, before, transactionId))}\n`);
    const outcome = await waitFor(() => events.find((event) => (event.name === 'shim_equipment_change_confirmed' || event.name === 'shim_equipment_change_rejected') && event.transactionId === transactionId));
    const after = await waitFor(() => {
      const inventory = latestInventory(events);
      return inventory && inventory.revision !== before.revision ? inventory : null;
    });
    await delay(100);
    const turnAfter = latestTurn(events);
    assert(`${scenarioId} exposes a final public turn count`, Number.isInteger(turnAfter), JSON.stringify(events.slice(-20)));
    verify({ before, after, outcome, target, events, transactionId, turnBefore, turnAfter });
    return { scenarioId, outcome, before, after, events, turnDelta: turnAfter - turnBefore };
  } catch (error) {
    fs.writeFileSync(path.join(outputDir, `${scenarioId.replaceAll('/', '-')}.failure.events.jsonl`), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
    throw error;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(playground, { recursive: true, force: true });
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const results = [];
  results.push(await runScenario('equipment/body-armor-swap-under-cloak', ({ after, outcome, target, events }) => {
    const cloak = after.items.find((item) => /cloak of protection/i.test(item.text || ''));
    const oldSuit = after.items.find((item) => /splint mail/i.test(item.text || ''));
    const newSuit = after.items.find((item) => item.objectId === target.objectId);
    assert('body armor swap confirms only after the target owns the body slot', outcome.name === 'shim_equipment_change_confirmed' && worn(newSuit), JSON.stringify({ outcome, items: after.items }));
    assert('body armor swap restores the original cloak', worn(cloak), JSON.stringify(after.items));
    assert('body armor swap leaves the replaced suit in inventory', oldSuit && !worn(oldSuit), JSON.stringify(after.items));
    assert('body armor swap uses no raw selector command stream', !events.some((event) => event.name === 'bridge_command' && /[TW]/.test(String.fromCharCode(event.keycode || 0))), JSON.stringify(events.filter((event) => event.name === 'bridge_command')));
  }));
  results.push(await runScenario('equipment/body-armor-empty-under-cloak', ({ after, outcome, target }) => {
    assert('empty body slot wear confirms with the target worn', outcome.name === 'shim_equipment_change_confirmed' && worn(after.items.find((item) => item.objectId === target.objectId)), JSON.stringify({ outcome, items: after.items }));
    assert('empty body slot wear restores the original cloak', worn(after.items.find((item) => /cloak of protection/i.test(item.text || ''))), JSON.stringify(after.items));
  }));
  results.push(await runScenario('equipment/body-armor-cursed-cloak', ({ after, outcome, target, turnBefore, turnAfter }) => {
    assert('cursed outer cloak truthfully rejects the armor swap', outcome.name === 'shim_equipment_change_rejected' && /cursed|refused|remove/i.test(outcome.reason || ''), JSON.stringify(outcome));
    assert('rejected armor swap leaves the target unworn', !worn(after.items.find((item) => item.objectId === target.objectId)), JSON.stringify(after.items));
    assert('rejected armor swap preserves the worn cloak and original suit', worn(after.items.find((item) => /cloak of protection/i.test(item.text || ''))) && worn(after.items.find((item) => /splint mail/i.test(item.text || ''))), JSON.stringify(after.items));
    assert('a refused cursed-cloak removal does not spend a turn', turnAfter === turnBefore, JSON.stringify({ turnBefore, turnAfter }));
  }));
  assert('direct layered armor swap spends the classic ten-turn remove-wear-restore cost',
    results[0].turnDelta === 10, JSON.stringify({ turnDelta: results[0].turnDelta }));
  for (const result of results) fs.writeFileSync(path.join(outputDir, `${result.scenarioId.replaceAll('/', '-')}.events.jsonl`), `${result.events.map((event) => JSON.stringify(event)).join('\n')}\n`);
  console.log('direct-armor-layer-transaction-shim-test PASS');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
