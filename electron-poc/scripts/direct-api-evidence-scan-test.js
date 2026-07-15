const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EvidenceScan = require('../src/shared/direct-api-evidence-scan');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'direct-api-foundation', 'evidence-scan-fixtures');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const rules = [
  { id: 'no-hidden-extcmd-answer', field: 'name', equals: 'bridge_extcmd_answer' },
  { id: 'no-pickup-prompt-text', field: 'text', regex: '\\bPick up what\\?' },
  { id: 'no-force-command-field', field: 'command', regex: '^#force\\n?$' },
  { id: 'no-hidden-drop-selector-command', field: 'command', regex: '^d[a-zA-Z]$' },
  { id: 'no-hidden-public-field', field: 'payload', regex: '"(?:locked|trapped|broken|contents|buc|cursed|blessed|charges|otyp|spe)"' },
];

fs.writeFileSync(path.join(outDir, 'clean.jsonl'), [
  JSON.stringify({ name: 'shim_container_transfer_confirmed', commandType: 'container.transfer', command: 'container.transfer', payload: { itemId: 42, displayName: 'a large box' } }),
  JSON.stringify({ name: 'shim_update_inventory', text: 'You have a large box.', payload: { objectId: 42 } }),
].join('\n'));

const clean = EvidenceScan.scanOutputDir(outDir, rules);
assert.equal(clean.ok, true, EvidenceScan.markdownSummary(clean));

fs.writeFileSync(path.join(outDir, 'dirty.jsonl'), [
  JSON.stringify({ name: 'bridge_extcmd_answer', command: '#force\n', text: 'Pick up what?', payload: { locked: true } }),
  JSON.stringify({ name: 'bridge_command', command: 'dj', text: 'legacy drop selector' }),
].join('\n'));

const dirty = EvidenceScan.scanOutputDir(outDir, rules);
assert.equal(dirty.ok, false, 'dirty fixture should produce field-scoped matches');
assert(dirty.matches.some((match) => match.ruleId === 'no-hidden-extcmd-answer' && match.field === 'name'));
assert(dirty.matches.some((match) => match.ruleId === 'no-force-command-field' && match.field === 'command'));
const textMatch = dirty.matches.find((match) => match.ruleId === 'no-pickup-prompt-text' && match.field === 'text');
assert(textMatch, 'prompt/menu text rule should match JSON text field');
assert.equal(textMatch.value, 'Pick up what?', 'field-scoped text scan must not report the raw JSON line');
assert(dirty.matches.some((match) => match.ruleId === 'no-hidden-drop-selector-command' && match.field === 'command'));
assert(dirty.matches.some((match) => match.ruleId === 'no-hidden-public-field' && match.field === 'payload'));

const terrainRules = EvidenceScan.rulesForTask('terrain.action');
const fieldScoped = EvidenceScan.scanRecords([
  { file: 'memory', line: 1, json: { name: 'map.snapshot', text: 'The visible map contains > and < glyphs.', command: 'terrain.action' }, text: '' },
  { file: 'memory', line: 2, json: { name: 'bridge_command', text: 'Going down.', command: '>' }, text: '' },
], terrainRules);
assert.equal(fieldScoped.ok, false, 'terrain command-field rule catches raw stair command only when routed through command field');
assert.equal(fieldScoped.matches.length, 1, EvidenceScan.markdownSummary(fieldScoped));
assert.equal(fieldScoped.matches[0].field, 'command');
assert.equal(fieldScoped.matches[0].ruleId, 'terrain-no-stairs-command');

const publicBoundaryDir = path.join(outDir, 'public-boundary');
fs.mkdirSync(publicBoundaryDir, { recursive: true });
fs.writeFileSync(path.join(publicBoundaryDir, 'clean-public.jsonl'), [
  JSON.stringify({ name: 'command.accepted', payload: { commandType: 'ground.transfer', itemId: 42, coord: { x: 12, y: 8 } } }),
  JSON.stringify({ name: 'inventory.snapshot', snapshot: { items: [{ objectId: 42, displayName: 'a crude dagger', semanticKnown: false, actionAffordances: ['drop', 'throw'] }] } }),
].join('\n'));
const cleanBoundary = EvidenceScan.scanPublicBoundaryOutputDir(publicBoundaryDir);
assert.equal(cleanBoundary.ok, true, EvidenceScan.markdownSummary(cleanBoundary));

fs.writeFileSync(path.join(publicBoundaryDir, 'dirty-public.jsonl'), [
  JSON.stringify({ name: 'command.accepted', payload: { commandType: 'container.force', containerId: 9, locked: true } }),
  JSON.stringify({ name: 'command.completed', result: { snapshot: { ground: [{ objectId: 9, displayName: 'a locked chest', contents: [{ objectId: 10 }] }] } } }),
  JSON.stringify({ name: 'inventory.snapshot', snapshot: { items: [{ objectId: 11, displayName: 'a gray stone', actionAffordances: ['rub', 'container.trapped'], publicActionHints: ['container.locked'], buc: 'cursed' }] } }),
].join('\n'));
const dirtyBoundary = EvidenceScan.scanPublicBoundaryOutputDir(publicBoundaryDir);
assert.equal(dirtyBoundary.ok, false, 'dirty public-boundary fixture should catch forbidden fields/tokens in scoped JSON evidence');
assert(dirtyBoundary.matches.some((match) => match.ruleId === 'no-forbidden-public-boundary-field' && /payload\.locked$/.test(match.field)));
assert(dirtyBoundary.matches.some((match) => match.ruleId === 'no-forbidden-public-boundary-field' && /contents$/.test(match.field)));
assert(dirtyBoundary.matches.some((match) => match.ruleId === 'no-forbidden-public-boundary-field' && /buc$/.test(match.field)));
assert(dirtyBoundary.matches.some((match) => match.ruleId === 'no-hidden-action-token' && match.value === 'container.trapped'));
assert(dirtyBoundary.matches.some((match) => match.ruleId === 'no-hidden-action-token' && match.value === 'container.locked' && /publicActionHints/.test(match.field)));
assert(dirtyBoundary.matches.some((match) => match.ruleId === 'no-hidden-container-public-text' && /locked chest/i.test(match.value)));


fs.writeFileSync(path.join(root, 'test-output', 'direct-api-foundation', 'evidence-scan-summary.md'), EvidenceScan.markdownSummary(dirty, 'Direct API foundation evidence-scan fixture'));
fs.writeFileSync(path.join(root, 'test-output', 'direct-api-foundation', 'public-boundary-scan-summary.md'), EvidenceScan.markdownSummary(dirtyBoundary, 'Direct API public-boundary dirty fixture'));
console.log('direct-api-evidence-scan-test PASS');
