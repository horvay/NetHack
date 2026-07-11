const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, 'electron-poc', 'test-output', 'direct-terrain-action-shim');
fs.mkdirSync(outDir, { recursive: true });
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 50) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeoutMs) { try { const v = fn(); if (v) return v; } catch (error) { last = error; } await delay(stepMs); }
  throw last || new Error('timed out');
}
function bridgeFor(scenarioId, extraEnv = {}) {
  const bridge = path.join(root, 'electron-poc', 'shim-bridge', 'nh-shim-bridge');
  const env = { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NH_SHIM_RESET_LOCKS: '1', ...extraEnv };
  const child = spawn(bridge, [], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const events = []; const stderr = [];
  child.stdout.on('data', (d) => { for (const line of d.toString('utf8').split(/\r?\n/).filter(Boolean)) { try { events.push(JSON.parse(line)); } catch { events.push({ type: 'raw', line }); } } });
  child.stderr.on('data', (d) => stderr.push(d.toString('utf8')));
  const write = (payload) => child.stdin.write(`${JSON.stringify(payload)}\n`);
  return { child, events, stderr, write, cleanup: () => { try { child.kill('SIGTERM'); } catch {} } };
}
function terrainCommand(commandId, action, terrain, coord, itemId, expectedRevision = undefined) {
  return { type: 'terrain-action', command: { protocol: 'nethack-electron-ui/v2', commandId, commandType: 'terrain.action', transactionId: commandId, ...(expectedRevision ? { expectedRevision } : {}), payload: { action, terrain, coord, ...(itemId ? { itemId } : {}) } } };
}
async function proveDownStairs() {
  const run = bridgeFor('stairs/down-on-hero');
  try {
    await waitFor(() => run.events.find((e) => e.name === 'bridge_test_scenario_loaded'));
    const curs = await waitFor(() => [...run.events].reverse().find((e) => e.name === 'shim_curs'));
    const tx = 'terrain-stairs-down-direct';
    run.write(terrainCommand(tx, 'stairsDown', 'stairs.down', { x: curs.x, y: curs.y }));
    await waitFor(() => run.events.find((e) => e.name === 'shim_terrain_action_confirmed' && e.transactionId === tx), 20000);
    assert('direct down-stairs did not route raw > command', !run.events.some((e) => e.name === 'bridge_command' && (e.keycode === 62 || e.command === '>')), JSON.stringify(run.events.filter((e) => e.name === 'bridge_command')));
    return { events: run.events.slice(), stderr: run.stderr.join('') };
  } finally { run.cleanup(); }
}
async function proveLadderUp() {
  const run = bridgeFor('stairs/ladder-up-on-hero');
  try {
    await waitFor(() => run.events.find((e) => e.name === 'bridge_test_scenario_loaded'));
    const curs = await waitFor(() => [...run.events].reverse().find((e) => e.name === 'shim_curs'));
    const tx = 'terrain-ladder-up-direct';
    run.write(terrainCommand(tx, 'ladderUp', 'ladder.up', { x: curs.x, y: curs.y }));
    await waitFor(() => run.events.find((e) => e.name === 'shim_terrain_action_rejected' && e.transactionId === tx && /confirmation/i.test(e.reason || '')), 20000);
    assert('direct up-ladder rejection did not route raw < command', !run.events.some((e) => e.name === 'bridge_command' && (e.keycode === 60 || e.command === '<')), JSON.stringify(run.events.filter((e) => e.name === 'bridge_command')));
    return { events: run.events.slice(), stderr: run.stderr.join('') };
  } finally { run.cleanup(); }
}
async function proveFountainDrink() {
  const run = bridgeFor('terrain/fountain-dip-current');
  try {
    await waitFor(() => run.events.find((e) => e.name === 'bridge_test_scenario_loaded'));
    const curs = await waitFor(() => [...run.events].reverse().find((e) => e.name === 'shim_curs'));
    const tx = 'terrain-fountain-drink-direct';
    run.write(terrainCommand(tx, 'drink', 'fountain', { x: curs.x, y: curs.y }));
    await waitFor(() => run.events.find((e) => e.name === 'shim_terrain_action_confirmed' && e.transactionId === tx), 20000);
    assert('direct fountain drink did not route #drink extended command', !run.events.some((e) => e.name === 'bridge_extcmd_answer' && /^(?:#?drink)$/i.test(String(e.command || ''))), JSON.stringify(run.events.filter((e) => e.name === 'bridge_extcmd_answer')));
    return { events: run.events.slice(), stderr: run.stderr.join('') };
  } finally { run.cleanup(); }
}
async function proveFountainDipAndStale() {
  const run = bridgeFor('terrain/fountain-dip-current');
  try {
    await waitFor(() => run.events.find((e) => e.name === 'bridge_test_scenario_loaded'));
    const curs = await waitFor(() => [...run.events].reverse().find((e) => e.name === 'shim_curs'));
    const inv = await waitFor(() => [...run.events].reverse().find((e) => e.name === 'shim_update_inventory' && (e.items || []).some((i) => i.objectId && /dagger|potion/i.test(i.text || i.displayName || ''))));
    const item = (inv.items || []).find((i) => i.objectId && /dagger/i.test(i.text || i.displayName || '')) || (inv.items || []).find((i) => i.objectId);
    assert('fountain dip fixture exposes public inventory object id', item?.objectId > 0, JSON.stringify(inv));
    const staleTx = 'terrain-fountain-stale-coordinate';
    run.write(terrainCommand(staleTx, 'dip', 'fountain', { x: Math.max(0, curs.x - 1), y: curs.y }, item.objectId));
    await waitFor(() => run.events.find((e) => e.name === 'shim_terrain_action_rejected' && e.transactionId === staleTx), 20000);
    const stale = run.events.find((e) => e.name === 'shim_terrain_action_rejected' && e.transactionId === staleTx);
    assert('stale coordinate rejects before terrain mutation', /coordinate|no longer/i.test(stale.reason || ''), JSON.stringify(stale));
    const tx = 'terrain-fountain-dip-direct';
    run.write(terrainCommand(tx, 'dip', 'fountain', { x: curs.x, y: curs.y }, item.objectId));
    await waitFor(() => run.events.find((e) => e.name === 'shim_terrain_action_confirmed' && e.transactionId === tx), 20000);
    assert('direct fountain dip did not route #dip extended command', !run.events.some((e) => e.name === 'bridge_extcmd_answer' && /^(?:#?dip)$/i.test(String(e.command || ''))), JSON.stringify(run.events.filter((e) => e.name === 'bridge_extcmd_answer')));
    assert('direct fountain dip did not answer a hidden item selector menu', !run.events.some((e) => e.name === 'bridge_menu_answer' && e.transactionId === tx), JSON.stringify(run.events.filter((e) => e.name === 'bridge_menu_answer')));
    return { events: run.events.slice(), stderr: run.stderr.join('') };
  } finally { run.cleanup(); }
}
async function proveDeferredUnbackedActions() {
  const run = bridgeFor('terrain/fountain-dip-current');
  try {
    await waitFor(() => run.events.find((e) => e.name === 'bridge_test_scenario_loaded'));
    const curs = await waitFor(() => [...run.events].reverse().find((e) => e.name === 'shim_curs'));
    const sinkTx = 'terrain-sink-drink-deferred';
    run.write(terrainCommand(sinkTx, 'drink', 'sink', { x: curs.x, y: curs.y }));
    await waitFor(() => run.events.find((e) => e.name === 'shim_terrain_action_rejected' && e.transactionId === sinkTx), 20000);
    const sink = run.events.find((e) => e.name === 'shim_terrain_action_rejected' && e.transactionId === sinkTx);
    assert('sink drink is rejected/deferred at shim boundary', /not compatible/i.test(sink.reason || ''), JSON.stringify(sink));
    const sinkDipTx = 'terrain-sink-dip-deferred';
    run.write(terrainCommand(sinkDipTx, 'dip', 'sink', { x: curs.x, y: curs.y }, 1));
    await waitFor(() => run.events.find((e) => e.name === 'shim_terrain_action_rejected' && e.transactionId === sinkDipTx), 20000);
    const ladderTx = 'terrain-ladder-down-deferred';
    run.write(terrainCommand(ladderTx, 'ladderDown', 'ladder.down', { x: curs.x, y: curs.y }));
    await waitFor(() => run.events.find((e) => e.name === 'shim_terrain_action_rejected' && e.transactionId === ladderTx), 20000);
    assert('deferred terrain actions do not lower classic command bytes', !run.events.some((e) => e.name === 'bridge_command' || e.name === 'bridge_extcmd_answer' || e.name === 'bridge_menu_answer'), JSON.stringify(run.events.filter((e) => /bridge_.*answer|bridge_command/.test(e.name || ''))));
    return { events: run.events.slice(), stderr: run.stderr.join('') };
  } finally { run.cleanup(); }
}
async function main() {
  const stairs = await proveDownStairs();
  const ladder = await proveLadderUp();
  const drink = await proveFountainDrink();
  const fountain = await proveFountainDipAndStale();
  const deferred = await proveDeferredUnbackedActions();
  fs.writeFileSync(path.join(outDir, 'stairs-events.jsonl'), stairs.events.map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(path.join(outDir, 'ladder-events.jsonl'), ladder.events.map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(path.join(outDir, 'fountain-drink-events.jsonl'), drink.events.map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(path.join(outDir, 'fountain-events.jsonl'), fountain.events.map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(path.join(outDir, 'deferred-events.jsonl'), deferred.events.map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(path.join(outDir, 'summary.md'), ['# Direct terrain.action shim regression', '', 'PASS', '', 'Verified:', '- stairs/down-on-hero accepted and confirmed terrain.action stairsDown at public coord without a raw `>` bridge_command', '- stairs/ladder-up-on-hero direct terrain.action ladderUp rejects the dungeon-exit confirmation path without a raw `<` bridge_command',
'- terrain/fountain-dip-current confirmed terrain.action drink without a #drink extended command',
'- terrain/fountain-dip-current rejected stale coordinate before direct dip (stale expectedRevision is covered by command-gateway direct validation)', '- fountain dip used payload.itemId and confirmed terrain.action without #dip or hidden item selector answer', '- unproved sink drink, sink dip, and ladderDown routes are rejected/deferred at the shim boundary without classic command/menu lowering', '', `Stairs events: ${path.join(outDir, 'stairs-events.jsonl')}`, `Ladder events: ${path.join(outDir, 'ladder-events.jsonl')}`, `Fountain drink events: ${path.join(outDir, 'fountain-drink-events.jsonl')}`, `Fountain events: ${path.join(outDir, 'fountain-events.jsonl')}`, `Deferred route events: ${path.join(outDir, 'deferred-events.jsonl')}`, ''].join('\n'));
  console.log(fs.readFileSync(path.join(outDir, 'summary.md'), 'utf8'));
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
