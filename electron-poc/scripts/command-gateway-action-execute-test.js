const assert = require('node:assert/strict');

const CommandGateway = require('../src/shared/command-gateway');
const UiProtocolV2 = require('../src/shared/ui-protocol-v2');

function make(overrides = {}) {
  return CommandGateway.createActionExecuteCommand({
    commandId: 'cmd-test-drop',
    transactionId: 'txn-test-drop',
    action: { id: 'item.drop', label: 'Drop' },
    item: { selector: 'j', text: 'j - a scroll labeled ZELGO MER', actionAffordances: ['drop', 'read'] },
    route: { actionId: 'item.drop', command: 'dj', selector: 'j', label: 'Drop' },
    expectedRevision: { inventory: 7, equipment: 3 },
    source: 'test',
    ...overrides,
  });
}

{
  const command = make();
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, true, checked.errors.join('; '));
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 7, equipmentRevision: 3 });
  assert.equal(plan.ok, true, plan.reason || 'drop should plan');
  assert.equal(plan.keys, 'dj');
  assert.deepEqual(plan.keyInputs.map((entry) => entry.keycode), ['d'.charCodeAt(0), 'j'.charCodeAt(0)]);
}

{
  const command = make({ action: { id: 'item.putOn.ring', label: 'Put on left ring' }, item: { selector: 'd', text: 'd - an uncursed granite ring', actionAffordances: ['putOn.ring'] }, route: { actionId: 'item.putOn.ring', command: 'Pdl', selector: 'd', ringHand: 'l' } });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 7, equipmentRevision: 3 });
  assert.equal(plan.ok, true, plan.reason || 'ring put-on route should allow selector plus public hand');
  assert.equal(plan.keys, 'Pdl');
}

{
  const command = make({ action: { id: 'item.putOn.ring', label: 'Put on left ring' }, item: { selector: 'd', text: 'd - an uncursed granite ring', actionAffordances: ['putOn.ring'] }, route: { actionId: 'item.putOn.ring', command: 'Pdr', selector: 'd', ringHand: 'l' } });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 7, equipmentRevision: 3 });
  assert.equal(plan.ok, false, 'ring hand command answer must match route metadata');
  assert.match(plan.reason, /ring hand/i);
}

{
  const command = CommandGateway.createActionExecuteCommand({ commandId: 'cmd-swap', transactionId: 'txn-swap', action: { id: 'slot.swapMainAlternate', label: 'Swap' }, route: { actionId: 'slot.swapMainAlternate', command: 'x' }, expectedRevision: { equipment: 3 } });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, equipmentRevision: 3 });
  assert.equal(plan.ok, true, plan.reason || 'slot swap should be in the limited v2 allowlist');
  assert.equal(plan.keys, 'x');
}

{
  const command = make({ route: { actionId: 'item.drop', command: 'dk', selector: 'j', label: 'Drop' } });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 7, equipmentRevision: 3 });
  assert.equal(plan.ok, false, 'selector mismatch must fail closed');
  assert.equal(plan.supported, true);
  assert.equal(plan.blockerToken, 'blocked.input.malformedTarget');
  assert.match(plan.reason, /selector/i);
}

{
  const command = make({ expectedRevision: { inventory: 6, equipment: 3 } });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 7, equipmentRevision: 3, inventoryItems: [{ inventoryLetter: 'j', displayName: 'a wand of striking' }] });
  assert.equal(plan.ok, false, 'stale inventory revision with changed target must fail closed');
  assert.equal(plan.blockerToken, 'blocked.input.staleRevision');
  assert.match(plan.reason, /revision changed/i);
}

{
  const command = make({ expectedRevision: { inventory: 6, equipment: 3 } });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 7, equipmentRevision: 3, inventoryItems: [{ inventoryLetter: 'j', displayName: 'a scroll labeled ZELGO MER' }] });
  assert.equal(plan.ok, true, plan.reason || 'revision churn is allowed when public selector target still matches');
}

{
  const command = make();
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 7, equipmentRevision: 3, activeInputOwner: true });
  assert.equal(plan.ok, false, 'active prompt/menu owner must block v2 action execution');
  assert.equal(plan.blockerToken, 'blocked.input.promptActive');
  assert.match(plan.reason, /owns input/i);
}

{
  const command = make({
    action: { id: 'ground.openContainer', label: 'Open / loot here' },
    route: { actionId: 'ground.openContainer', command: '#loot\n' },
    target: { location: { kind: 'ground' }, displayName: 'a large box' },
    payload: { promptPolicy: 'netHack-owned-followup' },
    item: { text: 'a large box' },
    expectedRevision: { ground: 12 },
  });
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, true, checked.errors.join('; '));
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12 });
  assert.equal(plan.ok, true, plan.reason || 'ground #loot route should be allowed with explicit public ground target and prompt policy');
  assert.equal(plan.keys, '#loot\n');
}

{
  const command = make({ action: { id: 'ground.openContainer', label: 'Open / loot here' }, route: { actionId: 'ground.openContainer', command: '#loot\n' }, item: { text: 'a large box' } });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12 });
  assert.equal(plan.ok, false, 'ground #loot must not execute without an explicit public ground target and prompt policy');
  assert.equal(plan.supported, true);
  assert(['blocked.input.malformedTarget', 'blocked.input.missingPromptPolicy'].includes(plan.blockerToken), plan.blockerToken);
  assert.match(plan.reason, /explicit public ground target|prompt ownership/i);
}

{
  const command = make({
    action: { id: 'ground.tipContainer', label: 'Tip contents here' },
    route: { actionId: 'ground.tipContainer', command: '#tip\n' },
    target: { location: { kind: 'ground' }, displayName: 'a large box' },
    payload: { promptPolicy: 'netHack-owned-followup' },
    item: { text: 'a large box' },
    expectedRevision: { ground: 12 },
  });
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, true, checked.errors.join('; '));
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12 });
  assert.equal(plan.ok, true, plan.reason || 'ground #tip route should be allowed with explicit public ground target and prompt policy');
  assert.equal(plan.keys, '#tip\n');
}

{
  const command = make({
    action: { id: 'ground.forceContainer', label: 'Force lock here' },
    route: { actionId: 'ground.forceContainer', command: '#force\n' },
    target: { location: { kind: 'ground' }, displayName: 'a large box' },
    payload: { promptPolicy: 'netHack-owned-followup' },
    item: { text: 'a large box' },
    expectedRevision: { ground: 12 },
  });
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, true, checked.errors.join('; '));
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12 });
  assert.equal(plan.ok, true, plan.reason || 'ground #force route should be allowed with explicit public ground target and prompt policy');
  assert.equal(plan.keys, '#force\n');
}

{
  const command = make({
    action: { id: 'ground.openContainer', label: 'Loot bag' },
    route: { actionId: 'ground.openContainer', command: '#loot\n' },
    target: { location: { kind: 'ground' }, displayName: 'an empty bag' },
    payload: { promptPolicy: 'netHack-owned-followup' },
    expectedRevision: { ground: 2 },
  });
  const noRowsFreshRevision = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 2, groundItems: [] });
  assert.equal(noRowsFreshRevision.ok, false, 'matching ground revision must still reject without current public ground row evidence');
  const noRows = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 3, groundItems: [] });
  assert.equal(noRows.ok, false, 'stale ground revision must not be accepted without current public ground row evidence');
  const publicAlias = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 3, groundItems: [{ displayName: 'a sack' }] });
  assert.equal(publicAlias.ok, true, publicAlias.reason || 'public empty bag/sack alias permits stale ground revision only when current public row matches');
}

{
  const command = make({
    action: { id: 'item.rub', label: 'Rub' },
    route: { actionId: 'item.rub', command: '#rub\n' },
    target: { selector: 'l', inventoryLetter: 'l', displayName: 'an oil lamp', location: { kind: 'inventory' } },
    payload: { promptPolicy: 'netHack-owned-followup' },
    item: { selector: 'l', text: 'l - an oil lamp', actionAffordances: ['rub'] },
    expectedRevision: { inventory: 8 },
  });
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, true, checked.errors.join('; '));
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 8 });
  assert.equal(plan.ok, true, plan.reason || 'item #rub route should be allowed with explicit public inventory target and prompt policy');
  assert.equal(plan.keys, '#rub\n');
}

{
  const command = make({
    action: { id: 'item.rub', label: 'Rub' },
    route: { actionId: 'item.rub', command: '#rub\nl' },
    target: { selector: 'l', inventoryLetter: 'l', displayName: 'an oil lamp', location: { kind: 'inventory' } },
    payload: { promptPolicy: 'netHack-owned-followup' },
    item: { selector: 'l', text: 'l - an oil lamp', actionAffordances: ['rub'] },
    expectedRevision: { inventory: 8 },
  });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 8 });
  assert.equal(plan.ok, false, 'item.rub must not bundle an item selector or any follow-up answer after #rub');
  assert.match(plan.reason, /route shape/i);
}

{
  const command = make({ action: { id: 'item.rub', label: 'Rub' }, route: { actionId: 'item.rub', command: '#rub\n' }, item: { selector: 'l', text: 'l - an oil lamp', actionAffordances: ['rub'] }, expectedRevision: { inventory: 8 } });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 8 });
  assert.equal(plan.ok, false, 'item.rub must not execute without an explicit public inventory target and prompt policy');
  assert.equal(plan.supported, true);
  assert.match(plan.reason, /explicit public inventory target|prompt ownership/i);
}

{
  const command = make({
    action: { id: 'ground.dipIntoTerrain', label: 'Dip item in fountain' },
    route: { actionId: 'ground.dipIntoTerrain', command: '#dip\n' },
    target: { location: { kind: 'ground' }, displayName: 'fountain' },
    payload: { promptPolicy: 'netHack-owned-followup' },
    expectedRevision: { inventory: 5, equipment: 6, ground: 12 },
  });
  assert.deepEqual(command.expectedRevision, { ground: 12 }, 'legacy ground.dipIntoTerrain commands carry only route-owned ground revision metadata before validation');
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, true, checked.errors.join('; '));
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12 });
  assert.equal(plan.ok, false, 'legacy ground.dipIntoTerrain #dip fallback is disabled after terrain.action migration');
  assert.match(plan.reason, /unsupported|route/i);
}

{
  const command = make({
    action: { id: 'item.dipInto', label: 'Dip item' },
    route: { actionId: 'item.dipInto', command: '#dip\n' },
    target: { selector: 'p', inventoryLetter: 'p', location: { kind: 'inventory' }, displayName: 'a milky potion' },
    payload: { promptPolicy: 'netHack-owned-followup' },
  });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 7 });
  assert.equal(plan.ok, false, 'item.dipInto stays hidden until prompt ownership for inventory-origin dip can be proven safe');
  assert.equal(plan.supported, false);
}

{
  const command = make({
    action: { id: 'ground.untrapContainer', label: 'Untrap container here' },
    route: { actionId: 'ground.untrapContainer', command: '#untrap\n' },
    target: { location: { kind: 'ground' }, displayName: 'a large box' },
    payload: { promptPolicy: 'netHack-owned-followup' },
    item: { text: 'a large box' },
    expectedRevision: { ground: 12 },
  });
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, true, checked.errors.join('; '));
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12 });
  assert.equal(plan.ok, true, plan.reason || 'ground #untrap route should be allowed with explicit public ground target and prompt policy');
  assert.equal(plan.keys, '#untrap\n');
}

{
  const command = make({
    action: { id: 'ground.untrapContainer', label: 'Untrap container here' },
    route: { actionId: 'ground.untrapContainer', command: '#untrap\n' },
    target: { location: { kind: 'ground' }, displayName: 'a large box' },
    payload: { promptPolicy: 'netHack-owned-followup' },
    item: { text: 'a large box' },
    expectedRevision: { ground: 12 },
  });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12, activeInputOwner: true });
  assert.equal(plan.ok, false, 'ground #untrap must be blocked when a NetHack prompt/menu/transfer owner is active');
  assert.match(plan.reason, /owns input/i);
}

{
  const command = make({
    action: { id: 'ground.untrapContainer', label: 'Untrap container here' },
    route: { actionId: 'ground.untrapContainer', command: '#untrap\n' },
    target: { location: { kind: 'inventory' }, displayName: 'a large box' },
    payload: { promptPolicy: 'netHack-owned-followup' },
  });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12 });
  assert.equal(plan.ok, false, 'ground #untrap must not execute without an explicit public ground target');
  assert.match(plan.reason, /explicit public ground target/i);
}

{
  const command = make({
    action: { id: 'ground.untrapContainer', label: 'Untrap container here' },
    route: { actionId: 'ground.untrapContainer', command: '#untrap\n' },
    target: { location: { kind: 'ground' }, displayName: 'a large box' },
    payload: { promptPolicy: 'no-followup' },
  });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12 });
  assert.equal(plan.ok, false, 'ground #untrap must require NetHack-owned follow-up prompt policy');
  assert.match(plan.reason, /prompt ownership/i);
}

{
  const command = make({
    action: { id: 'ground.untrapContainer', label: 'Untrap container here' },
    route: { actionId: 'ground.untrapContainer', command: '#force\n' },
    target: { location: { kind: 'ground' }, displayName: 'a large box' },
    payload: { promptPolicy: 'netHack-owned-followup' },
  });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12 });
  assert.equal(plan.ok, false, 'ground #untrap action id must not accept #force or other extended command bytes');
  assert.match(plan.reason, /route shape/i);
}

{
  const command = make({
    action: { id: 'ground.openContainer', label: 'Open / loot here' },
    route: { actionId: 'ground.openContainer', command: '#tip\n' },
    target: { location: { kind: 'ground' }, displayName: 'a large box' },
    payload: { promptPolicy: 'netHack-owned-followup' },
  });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12 });
  assert.equal(plan.ok, false, 'nearby extended commands are not accepted through the #loot route');
  assert.equal(plan.blockerToken, 'blocked.input.malformedCommand');
  assert.match(plan.reason, /route shape/i);
}

{
  const command = make({
    action: { id: 'ground.openContainer', label: 'Open / loot here' },
    route: { actionId: 'ground.openContainer', command: '#loot\n' },
    target: { location: { kind: 'ground' }, displayName: 'a large box' },
    payload: { promptPolicy: 'netHack-owned-followup' },
    expectedRevision: { ground: 11 },
  });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12, requireExpectedRevisionForKnownSnapshots: true });
  assert.equal(plan.ok, false, 'stale ground revision must fail closed when main has no matching current public ground rows');
  assert.match(plan.reason, /ground revision changed/i);
  assert.equal(plan.blockerToken, 'blocked.input.staleRevision');
}

{
  const command = make({
    action: { id: 'ground.openContainer', label: 'Open / loot here' },
    route: { actionId: 'ground.openContainer', command: '#loot\n' },
    target: { location: { kind: 'ground' }, displayName: 'a large box' },
    payload: { promptPolicy: 'netHack-owned-followup' },
    expectedRevision: { ground: 11 },
  });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12, requireExpectedRevisionForKnownSnapshots: true, groundItems: [{ displayName: 'a large box' }] });
  assert.equal(plan.ok, true, plan.reason || 'stale ground revision may proceed only when current main-side public ground rows still match the target');
}

{
  const command = make({ action: { id: 'ground.tipContainer', label: 'Tip contents here' }, route: { actionId: 'ground.tipContainer', command: '#tip\n' }, item: { text: 'a large box' } });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, groundRevision: 12 });
  assert.equal(plan.ok, false, 'ground #tip must not execute without an explicit public ground target and prompt policy');
  assert.equal(plan.supported, true);
  assert(['blocked.input.malformedTarget', 'blocked.input.missingPromptPolicy'].includes(plan.blockerToken), plan.blockerToken);
  assert.match(plan.reason, /explicit public ground target|prompt ownership/i);
}

{
  const command = make({ payload: { item: { displayName: 'a scroll', trueName: 'scroll of identify' } } });
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, false, 'action.execute payload item must honor no-spoiler public item schema');
  assert.match(checked.errors.join('\n'), /trueName/);
}

{
  const command = make();
  command.targets = { selector: 'j', trueName: 'scroll of identify' };
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, false, 'action.execute top-level targets must be closed public target payloads');
  assert.match(checked.errors.join('\n'), /trueName/);
}

{
  const command = make({ item: { selector: 'j', text: 'j - a large box', actionAffordances: ['container', 'container.locked'] } });
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, false, 'public item action tokens must not leak lock/trap/broken hidden state');
  assert.match(checked.errors.join('\n'), /hidden lock/);
}

{
  const command = make({ expectedRevision: {} });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 7, equipmentRevision: 3, requireExpectedRevisionForKnownSnapshots: true });
  assert.equal(plan.ok, false, 'main-side execution must fail closed if a renderer/direct IPC command omits a known snapshot revision');
  assert.match(plan.reason, /expected revision/i);
  assert.equal(plan.blockerToken, 'blocked.input.staleRevision');
}

{
  const command = make({ expectedRevision: { inventory: 6, equipment: 3 } });
  const plan = CommandGateway.validateActionExecuteCommand(command, { uiProtocol: UiProtocolV2, inventoryRevision: 7, equipmentRevision: 3, requireExpectedRevisionForKnownSnapshots: true, inventoryItems: [{ inventoryLetter: 'j', displayName: 'a wand of striking' }] });
  assert.equal(plan.ok, false, 'main-side stale revision safety must reject before native lowering when the public target no longer matches');
  assert.match(plan.reason, /revision changed/i);
  assert.equal(plan.blockerToken, 'blocked.input.staleRevision');
}

{
  const terrain = {
    protocol: 'nethack-electron-ui/v2',
    commandId: 'cmd-terrain-stairs-down',
    commandType: 'terrain.action',
    transactionId: 'txn-terrain-stairs-down',
    expectedRevision: { map: 4, inventory: 8 },
    payload: { action: 'stairsDown', terrain: 'stairs.down', coord: { x: 12, y: 8 } },
  };
  const stale = CommandGateway.validateDirectCommandEnvelope(terrain, { uiProtocol: UiProtocolV2, mapRevision: 5, inventoryRevision: 8, requireExpectedRevisionForKnownSnapshots: true });
  assert.equal(stale.ok, false, 'direct terrain.action rejects stale public map revision before native lowering');
  assert.equal(stale.blockerToken, 'blocked.input.staleRevision');
  const active = CommandGateway.validateDirectCommandEnvelope(terrain, { uiProtocol: UiProtocolV2, mapRevision: 4, inventoryRevision: 8, activeInputOwner: { kind: 'menu', requestId: 'menu-1' } });
  assert.equal(active.ok, false, 'direct terrain.action rejects while a prompt/menu owner is active');
  assert.equal(active.blockerToken, 'blocked.input.menuActive');
  const mismatched = CommandGateway.validateDirectCommandEnvelope({ ...terrain, payload: { action: 'stairsDown', terrain: 'stairs.up', coord: { x: 12, y: 8 } } }, { uiProtocol: UiProtocolV2, mapRevision: 4, inventoryRevision: 8 });
  assert.equal(mismatched.ok, false, 'direct terrain.action rejects mismatched action/terrain before native lowering');
  assert.equal(mismatched.blockerToken, 'blocked.input.malformedTarget');
  const deferredSink = CommandGateway.validateDirectCommandEnvelope({ ...terrain, commandId: 'cmd-terrain-sink', payload: { action: 'drink', terrain: 'sink', coord: { x: 12, y: 8 } } }, { uiProtocol: UiProtocolV2, mapRevision: 4, inventoryRevision: 8 });
  assert.equal(deferredSink.ok, false, 'sink terrain.action is deferred until real scenario proof exists');
  assert.match(deferredSink.reason, /payload\.terrain|one of/i);
  const deferredLadderDown = CommandGateway.validateDirectCommandEnvelope({ ...terrain, commandId: 'cmd-terrain-ladder-down', payload: { action: 'ladderDown', terrain: 'ladder.down', coord: { x: 12, y: 8 } } }, { uiProtocol: UiProtocolV2, mapRevision: 4, inventoryRevision: 8 });
  assert.equal(deferredLadderDown.ok, false, 'ladderDown terrain.action is deferred until real scenario proof exists');
  assert.match(deferredLadderDown.reason, /payload\.action|one of/i);
}

console.log('command-gateway-action-execute-test PASS');
