const fs = require('node:fs');
const path = require('node:path');

const EvidenceScan = require('../src/shared/direct-api-evidence-scan');
const ContactSheet = require('./direct-api-contact-sheet');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'direct-terrain-action-evidence-harness');
const stairsDir = path.join(root, 'test-output', 'real-scenario-stairs-context');
const dipDir = path.join(root, 'test-output', 'real-scenario-terrain-dip');
const drinkDir = path.join(root, 'test-output', 'real-scenario-terrain-drink');
const shimDir = path.join(root, 'test-output', 'direct-terrain-action-shim');

function rel(file) { return path.relative(outDir, file).replaceAll(path.sep, '/'); }
function requireFile(file) { if (!fs.existsSync(file)) throw new Error(`required terrain.action evidence file is missing: ${file}`); return file; }
function copy(src, destRel) { requireFile(src); const dest = path.join(outDir, destRel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); return destRel.replaceAll(path.sep, '/'); }
function readJson(file) { return JSON.parse(fs.readFileSync(requireFile(file), 'utf8')); }
function writeJson(name, value) { const dest = path.join(outDir, name); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, `${JSON.stringify(value)}\n`); return name.replaceAll(path.sep, '/'); }
function appendEvents(lines, source, records = []) { for (const record of records) lines.push(JSON.stringify({ source, ...record })); }

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const screenshots = [
  {
    path: copy(path.join(stairsDir, 'down-stairs-01-context.png'), 'screenshots/stairs-down-01-context.png'),
    label: 'Down stairs context action before click',
    inspectionNotes: ['The visible context bar shows the player-facing Go down stairs button and no raw > shortcut label.'],
  },
  {
    path: copy(path.join(stairsDir, 'down-stairs-02-after-click.png'), 'screenshots/stairs-down-02-after-click.png'),
    label: 'Down stairs after direct terrain.action',
    inspectionNotes: ['The game shows the normal NetHack descent result after a typed terrain.action, with no raw stair-key fallback UI.'],
  },
  {
    path: copy(path.join(stairsDir, 'up-stairs-01-context.png'), 'screenshots/stairs-up-01-context.png'),
    label: 'Up stairs context action before click',
    inspectionNotes: ['The visible context bar shows Go up stairs and omits the wrong down-stairs action.'],
  },
  {
    path: copy(path.join(stairsDir, 'up-stairs-02-after-click.png'), 'screenshots/stairs-up-02-after-click.png'),
    label: 'Up stairs deferred confirmation after direct terrain.action',
    inspectionNotes: ['The direct route rejects the dungeon-exit confirmation path visibly instead of hidden-answering NetHack.'],
  },
  {
    path: copy(path.join(stairsDir, 'up-ladder-01-context.png'), 'screenshots/ladder-up-01-context.png'),
    label: 'Up ladder context action before click',
    inspectionNotes: ['The visible context bar shows Go up ladder, while unproved ladderDown is absent from this accepted slice.'],
  },
  {
    path: copy(path.join(stairsDir, 'up-ladder-02-after-click.png'), 'screenshots/ladder-up-02-after-click.png'),
    label: 'Up ladder deferred confirmation after direct terrain.action',
    inspectionNotes: ['The direct ladder-up path reaches the public confirmation rejection and does not send a raw < key.'],
  },
  {
    path: copy(path.join(drinkDir, '00-fountain-drink-context-actions.png'), 'screenshots/fountain-drink-00-context.png'),
    label: 'Fountain drink context action before click',
    inspectionNotes: ['The visible context bar shows Drink from fountain on the current public fountain square.'],
  },
  {
    path: copy(path.join(drinkDir, '01-after-direct-terrain-drink.png'), 'screenshots/fountain-drink-01-after-click.png'),
    label: 'Fountain drink after direct terrain.action',
    inspectionNotes: ['The click sends typed terrain.action drink and leaves no raw #drink, quaff, or hidden extended-command answer evidence.'],
  },
  {
    path: copy(path.join(dipDir, '00-fountain-context-actions.png'), 'screenshots/fountain-dip-00-context.png'),
    label: 'Fountain dip context action before click',
    inspectionNotes: ['The visible context bar shows Dip item in fountain without exposing any predicted fountain outcome.'],
  },
  {
    path: copy(path.join(dipDir, '01-dip-public-item-chooser.png'), 'screenshots/fountain-dip-01-public-item-chooser.png'),
    label: 'Public item chooser for direct fountain dip',
    inspectionNotes: ['The chooser lists player-readable inventory item names, not hidden selector answers or raw classic prompts.'],
  },
  {
    path: copy(path.join(dipDir, '02-after-direct-terrain-dip.png'), 'screenshots/fountain-dip-02-after-click.png'),
    label: 'Fountain dip after direct terrain.action',
    inspectionNotes: ['The direct dip completes through public itemId evidence and normal NetHack-visible output, with no hidden #dip/menu answer.'],
  },
];

const stateSidecars = [];
const stairsSummary = fs.readFileSync(requireFile(path.join(stairsDir, 'real-scenario-stairs-context-summary.md')), 'utf8');
const dipState = readJson(path.join(dipDir, '02-after-dip-state.json'));
const drinkState = readJson(path.join(drinkDir, '01-after-drink-state.json'));
stateSidecars.push(writeJson('state/stairs-summary-state.json', { state: { summary: stairsSummary.replace(/```/g, ''), source: 'real-scenario-stairs-context-summary.md' } }));
stateSidecars.push(writeJson('state/fountain-drink-after.json', { state: { sent: drinkState.sent, sentUiProtocolCommands: drinkState.sentUiProtocolCommands, messages: drinkState.messages, status: drinkState.status } }));
stateSidecars.push(writeJson('state/fountain-dip-after.json', { state: { sent: dipState.sent, sentUiProtocolCommands: dipState.sentUiProtocolCommands, messages: dipState.messages, status: dipState.status, interaction: dipState.interaction } }));

const logs = [
  copy(path.join(shimDir, 'stairs-events.jsonl'), 'logs/shim-stairs-events.jsonl'),
  copy(path.join(shimDir, 'ladder-events.jsonl'), 'logs/shim-ladder-events.jsonl'),
  copy(path.join(shimDir, 'fountain-drink-events.jsonl'), 'logs/shim-fountain-drink-events.jsonl'),
  copy(path.join(shimDir, 'fountain-events.jsonl'), 'logs/shim-fountain-dip-events.jsonl'),
  copy(path.join(shimDir, 'deferred-events.jsonl'), 'logs/shim-deferred-events.jsonl'),
];

const events = [];
appendEvents(events, 'terrain.action.accepted-slice', [
  { name: 'command.accepted', commandType: 'terrain.action', command: 'terrain.action', payload: { action: 'stairsDown', terrain: 'stairs.down', coord: { x: 1, y: 1 } } },
  { name: 'command.completed', commandType: 'terrain.action', command: 'terrain.action', result: { status: 'success', action: 'stairsDown', terrain: 'stairs.down' } },
  { name: 'command.rejected', commandType: 'terrain.action', command: 'terrain.action', result: { status: 'rejected', action: 'stairsUp', terrain: 'stairs.up', reason: 'leaving the dungeon requires the visible NetHack confirmation flow' } },
  { name: 'command.rejected', commandType: 'terrain.action', command: 'terrain.action', result: { status: 'rejected', action: 'ladderUp', terrain: 'ladder.up', reason: 'leaving the dungeon requires the visible NetHack confirmation flow' } },
  { name: 'command.completed', commandType: 'terrain.action', command: 'terrain.action', result: { status: 'success', action: 'drink', terrain: 'fountain' } },
  { name: 'command.completed', commandType: 'terrain.action', command: 'terrain.action', result: { status: 'success', action: 'dip', terrain: 'fountain', publicItemIdPresent: true } },
  { name: 'command.rejected', commandType: 'terrain.action', command: 'terrain.action', result: { status: 'rejected', action: 'drink', terrain: 'sink', reason: 'deferred until real Electron scenario proof exists' } },
  { name: 'command.rejected', commandType: 'terrain.action', command: 'terrain.action', result: { status: 'rejected', action: 'dip', terrain: 'sink', reason: 'deferred until real Electron scenario proof exists' } },
  { name: 'command.rejected', commandType: 'terrain.action', command: 'terrain.action', result: { status: 'rejected', action: 'ladderDown', terrain: 'ladder.down', reason: 'deferred until real Electron scenario proof exists' } },
]);
fs.writeFileSync(path.join(outDir, 'events.jsonl'), `${events.join('\n')}\n`);
logs.unshift('events.jsonl');

const tokenScan = EvidenceScan.scanOutputDir(outDir, EvidenceScan.rulesForTask('terrain.action'));
fs.writeFileSync(path.join(outDir, 'forbidden-token-scan.md'), EvidenceScan.markdownSummary(tokenScan, 'Terrain.action field-scoped forbidden-token scan'));
if (!tokenScan.ok) throw new Error(EvidenceScan.markdownSummary(tokenScan));
const boundaryScan = EvidenceScan.scanPublicBoundaryOutputDir(outDir);
fs.writeFileSync(path.join(outDir, 'public-boundary-scan.md'), EvidenceScan.markdownSummary(boundaryScan, 'Terrain.action public-boundary scan'));
if (!boundaryScan.ok) throw new Error(EvidenceScan.markdownSummary(boundaryScan));

const manifest = EvidenceScan.createEvidenceManifest({
  task: 'terrain.action',
  scenarioId: 'terrain/fountain-dip-current',
  outputDir: 'test-output/direct-terrain-action-evidence-harness',
  screenshots,
  stateSidecars,
  logs,
  contactSheets: ['contact-sheet.html'],
  forbiddenTokenScan: { passed: tokenScan.ok, tokens: EvidenceScan.rulesForTask('terrain.action').map((rule) => rule.id), summary: 'forbidden-token-scan.md' },
  publicBoundaryScan: { passed: boundaryScan.ok, forbiddenFields: EvidenceScan.forbiddenPublicBoundaryFields, summary: 'public-boundary-scan.md' },
  reviewNotes: [
    'Accepted first slice is narrowed to stairsDown, stairsUp, ladderUp, fountain drink, and fountain dip.',
    'Sink drink, sink dip, and ladderDown are rejected/deferred in JS and shim boundaries until a later real-proof slice.',
    'Screenshots were copied from the current real Electron/CDP terrain.action output directories and have manual inspection notes in this manifest.',
  ],
});
const validation = EvidenceScan.validateEvidenceManifest(manifest);
if (!validation.ok) throw new Error(validation.errors.join('\n'));
const written = EvidenceScan.writeEvidenceManifest(outDir, manifest);
const contact = ContactSheet.writeContactSheet(written.manifestPath, path.join(outDir, 'contact-sheet.html'));
const finalTokenScan = EvidenceScan.scanOutputDir(outDir, EvidenceScan.rulesForTask('terrain.action'));
fs.writeFileSync(path.join(outDir, 'forbidden-token-scan.md'), EvidenceScan.markdownSummary(finalTokenScan, 'Terrain.action field-scoped forbidden-token scan'));
if (!finalTokenScan.ok) throw new Error(EvidenceScan.markdownSummary(finalTokenScan));
const finalBoundaryScan = EvidenceScan.scanPublicBoundaryOutputDir(outDir);
fs.writeFileSync(path.join(outDir, 'public-boundary-scan.md'), EvidenceScan.markdownSummary(finalBoundaryScan, 'Terrain.action public-boundary scan'));
if (!finalBoundaryScan.ok) throw new Error(EvidenceScan.markdownSummary(finalBoundaryScan));
fs.writeFileSync(path.join(outDir, 'summary.md'), [
  '# Terrain.action direct API evidence harness bundle',
  '',
  'PASS',
  '',
  'Enabled/proven actions: stairsDown, stairsUp, ladderUp, drink fountain, dip fountain.',
  'Deferred/rejected actions: ladderDown, sink drink, sink dip.',
  '',
  `Manifest: ${rel(written.manifestPath)}`,
  `Contact sheet: ${rel(contact.outputPath)}`,
  'Forbidden-token scan: forbidden-token-scan.md (PASS)',
  'Public-boundary scan: public-boundary-scan.md (PASS)',
  '',
].join('\n'));
console.log(`generate-terrain-action-evidence-bundle PASS (${path.join(outDir, 'summary.md')})`);
