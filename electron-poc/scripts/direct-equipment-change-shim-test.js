const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, 'electron-poc', 'test-output', 'direct-equipment-change-shim');
fs.mkdirSync(outDir, { recursive: true });
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 50) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
function latestInventory(events) { return [...events].reverse().find((e) => e.name === 'shim_update_inventory' && Array.isArray(e.items)); }
async function runScenario(scenarioId, work) {
  const bridge = path.join(root, 'electron-poc', 'shim-bridge', 'nh-shim-bridge');
  const env = { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NH_SHIM_RESET_LOCKS: '1' };
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
  try {
    await waitFor(() => events.find((e) => e.name === 'bridge_test_scenario_loaded'), 15000);
    await waitFor(() => latestInventory(events)?.items?.some((i) => i.objectId), 15000);
    await work({ events, write });
    fs.writeFileSync(path.join(outDir, `${scenarioId.replace(/[\/]/g, '-')}.events.jsonl`), events.map((e) => JSON.stringify(e)).join('\n'));
    return events;
  } catch (error) {
    fs.writeFileSync(path.join(outDir, `${scenarioId.replace(/[\/]/g, '-')}.failure.events.jsonl`), events.map((e) => JSON.stringify(e)).join('\n'));
    fs.writeFileSync(path.join(outDir, `${scenarioId.replace(/[\/]/g, '-')}.stderr.txt`), stderr.join(''));
    throw error;
  } finally { cleanup(); }
}
function command(action, payload, inv) {
  const tx = `fixture-equipment-${action}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  return { type: 'equipment-change', command: { protocol: 'nethack-electron-ui/v2', commandId: tx, commandType: 'equipment.change', transactionId: tx, expectedRevision: { inventory: inv.inventoryRevision || inv.revision || 0, equipment: inv.equipmentRevision || 0 }, payload: { action, ...payload } } };
}
async function main() {
  const summaries = [];
  const firstEvents = await runScenario('identity/valkyrie-equipped-inventory', async ({ events, write }) => {
    let inv = latestInventory(events);
    const shield = inv.items.find((i) => /shield/i.test(i.text) && /being worn/i.test(i.text));
    assert('fixture has worn shield with public object id', shield?.objectId > 0, JSON.stringify(inv.items));
    const invalids = [
      command('wieldMain', { itemId: shield.objectId, slotId: 'quiver' }, inv),
      command('quiver', { itemId: shield.objectId, slotId: 'mainHand' }, inv),
      command('clearQuiver', { slotId: 'mainHand' }, inv),
      command('putOnRing', { itemId: shield.objectId, hand: 'left' }, inv),
      command('wieldMain', { itemId: shield.objectId, slotId: 'mainHand', hand: 'left' }, inv),
    ];
    for (const invalid of invalids) {
      write(invalid);
      await waitFor(() => events.find((e) => e.name === 'shim_equipment_change_rejected' && e.transactionId === invalid.command.transactionId), 15000);
    }
    summaries.push('malformed equipment.change slot/hand payloads rejected at shim boundary');
    const takeoff = command('takeOff', { itemId: shield.objectId, slotId: 'armor.shield' }, inv);
    write(takeoff);
    await waitFor(() => events.find((e) => e.name === 'shim_equipment_change_confirmed' && e.transactionId === takeoff.command.transactionId), 15000);
    inv = await waitFor(() => { const v = latestInventory(events); return v?.items?.find((i) => i.objectId === shield.objectId && !/being worn/i.test(i.text)) ? v : null; }, 15000);

    const sword = inv.items.find((i) => /long sword/i.test(i.text));
    const wand = inv.items.find((i) => /wand of digging/i.test(i.text));
    assert('fixture has wand for direct wield', wand?.objectId > 0, JSON.stringify(inv.items));
    const wield = command('wieldMain', { itemId: wand.objectId, slotId: 'mainHand' }, inv);
    write(wield);
    await waitFor(() => events.find((e) => e.name === 'shim_equipment_change_confirmed' && e.transactionId === wield.command.transactionId), 15000);
    inv = await waitFor(() => { const v = latestInventory(events); return v?.items?.find((i) => i.objectId === wand.objectId && /(?:weapon in|wielded)/i.test(i.text)) ? v : null; }, 15000);

    const arrows = inv.items.find((i) => /arrow/i.test(i.text));
    assert('fixture has quivered arrows', arrows?.objectId > 0, JSON.stringify(inv.items));
    const clear = command('clearQuiver', { slotId: 'quiver' }, inv);
    write(clear);
    await waitFor(() => events.find((e) => e.name === 'shim_equipment_change_confirmed' && e.transactionId === clear.command.transactionId), 15000);
    inv = await waitFor(() => { const v = latestInventory(events); return v?.items?.find((i) => i.objectId === arrows.objectId && !/in quiver/i.test(i.text)) ? v : null; }, 15000);
    const setq = command('quiver', { itemId: arrows.objectId, slotId: 'quiver' }, inv);
    write(setq);
    await waitFor(() => events.find((e) => e.name === 'shim_equipment_change_confirmed' && e.transactionId === setq.command.transactionId), 15000);
    await waitFor(() => latestInventory(events)?.items?.find((i) => i.objectId === arrows.objectId && /in quiver/i.test(i.text)), 15000);
    summaries.push(`takeOff shield ${shield.objectId}; wield wand ${wand.objectId}; clear/set quiver arrows ${arrows.objectId}; original sword ${sword?.objectId || 'n/a'}`);
  });

  const ringEvents = await runScenario('equipment/ring-put-on-gui', async ({ events, write }) => {
    const inv = latestInventory(events);
    const ring = inv.items.find((i) => /ring of protection/i.test(i.text));
    assert('fixture has ring with public object id', ring?.objectId > 0, JSON.stringify(inv.items));
    const put = command('putOnRing', { itemId: ring.objectId, hand: 'left', slotId: 'ring.left' }, inv);
    write(put);
    await waitFor(() => events.find((e) => e.name === 'shim_equipment_change_confirmed' && e.transactionId === put.command.transactionId), 15000);
    await waitFor(() => latestInventory(events)?.items?.find((i) => i.objectId === ring.objectId && /on left hand/i.test(i.text)), 15000);
    summaries.push(`putOnRing left ${ring.objectId}`);
  });

  const blockerEvents = await runScenario('equipment/both-rings-occupied', async ({ events, write }) => {
    const inv = latestInventory(events);
    const loose = inv.items.find((i) => /ring of adornment/i.test(i.text) && !/on (?:left|right) hand/i.test(i.text));
    assert('fixture has loose ring for occupied hand rejection', loose?.objectId > 0, JSON.stringify(inv.items));
    const put = command('putOnRing', { itemId: loose.objectId, hand: 'left', slotId: 'ring.left' }, inv);
    write(put);
    await waitFor(() => events.find((e) => e.name === 'shim_equipment_change_rejected' && e.transactionId === put.command.transactionId), 15000);
    summaries.push(`occupied left ring rejected for loose ring ${loose.objectId}`);
  });

  const all = [...firstEvents, ...ringEvents, ...blockerEvents];
  const forbidden = all.filter((e) => (e.name === 'bridge_ui_command_accepted') || (e.name === 'bridge_extcmd_answer') || (e.name === 'bridge_prompt_answer' && e.autoAnswerReason === 'queued-ring-finger') || (/^shim_yn_function$/.test(e.name) && /ring|finger|Right or Left/i.test(`${e.query || ''} ${e.choices || ''}`) && e.autoAnswered));
  assert('direct equipment shim used no selector ui-command/extcmd/ring auto-answer choreography', forbidden.length === 0, JSON.stringify(forbidden.slice(0, 5)));
  fs.writeFileSync(path.join(outDir, 'summary.md'), [`# Direct equipment.change shim regression`, '', 'PASS', '', ...summaries.map((s) => `- ${s}`), '', 'Forbidden scan scope: shim events from direct-equipment-change-shim scenarios; checked bridge_ui_command_accepted, bridge_extcmd_answer, and ring-finger auto-answer events.', `Events: ${outDir}`, ''].join('\n'));
  console.log(fs.readFileSync(path.join(outDir, 'summary.md'), 'utf8'));
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
