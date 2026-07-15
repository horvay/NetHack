const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const repo = path.resolve(root, '..');
const scenarioId = 'container/locked-chest-force-destroy-on-hero';

async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function sendKey(cdp, ch) { await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(${JSON.stringify(ch.charCodeAt(0))})`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  actions: window.__nethackPromptTest?.contextActions?.(),
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  prompt: window.__nethackPromptTest?.prompt?.(),
  dialog: window.__nethackPromptTest?.dialog?.(),
  currentCell: window.__nethackPromptTest?.currentCell?.(),
  ground: window.__nethackPromptTest?.groundSnapshots?.(),
  container: window.__nethackPromptTest?.container?.(),
  containerSnapshots: window.__nethackPromptTest?.containerSnapshots?.(),
  menuText: document.getElementById('menu-panel')?.innerText || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-40).map((m) => m.text || String(m)) || [],
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shimGroundPileEvents: (window.__nethackPromptTest?.publicGroundPileShimEvidence?.() || []).filter((event) => event?.name === 'shim_ground_pile_snapshot')
}))()`); }
let assertionOutcomes = null;
function assert(name, ok, detail = '') {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outcome = { id, status: ok ? 'passed' : 'failed', details: ok ? '' : detail };
  const existing = assertionOutcomes?.find((entry) => entry.id === id);
  if (existing) Object.assign(existing, outcome); else assertionOutcomes?.push(outcome);
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
function makeIsolatedPlayground() {
  const source = path.join(repo, 'playground');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-destroyed-boundary-'));
  fs.cpSync(source, temp, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/.test(path.basename(entry)) });
  return temp;
}

const staleSurfacePattern = /\b(?:open-container|force-container|chest|box|container)\b/i;
function collectStrings(value, pathName = '$', out = []) {
  if (value == null) return out;
  if (typeof value === 'string') {
    out.push({ path: pathName, value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${pathName}[${index}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) collectStrings(child, `${pathName}.${key}`, out);
  }
  return out;
}
function publicDialogState(dialog) {
  if (!dialog) return null;
  if (!dialog.interactionOpen && !dialog.documentOpen) return { interactionOpen: false, documentOpen: false, options: [], panelControls: dialog.panelControls?.hidden ? { hidden: true, text: '', buttons: [] } : dialog.panelControls || null };
  return dialog;
}
function publicSnapshotPayloadWithoutHistoricalMessages(s) {
  return {
    actions: s.actions,
    prompt: s.prompt,
    dialog: publicDialogState(s.dialog),
    currentCell: s.currentCell,
    ground: s.ground,
    container: s.container,
    containerSnapshots: s.containerSnapshots,
    menuText: s.menuText,
  };
}
function publicStateSidecar(s) {
  return {
    ...publicSnapshotPayloadWithoutHistoricalMessages(s),
    sent: s.sent,
    messages: s.messages,
    running: s.running,
    seenShim: s.seenShim,
  };
}
function stalePublicSurfaces(s) {
  return collectStrings(publicSnapshotPayloadWithoutHistoricalMessages(s)).filter(({ value }) => staleSurfacePattern.test(value));
}
function assertNoDestroyedContainerSurface(s) {
  const stale = stalePublicSurfaces(s);
  assert('destroyed container public snapshots/state have no stale container/chest/box/open/force surface except historical messages', stale.length === 0, JSON.stringify(stale.slice(0, 20), null, 2));
  const ids = (s.actions?.buttons || []).map((b) => b.id);
  assert('destroyed container context actions omit open-container', !ids.includes('open-container'), ids.join(','));
  assert('destroyed container context actions omit force-container', !ids.includes('force-container'), ids.join(','));
  assert('destroyed container ground snapshot has no stale container item', !(s.ground?.piles || []).flatMap((pile) => pile.items || []).some((item) => staleSurfacePattern.test(`${item.displayName || ''} ${item.semanticName || ''} ${item.semanticAppearance || ''} ${(item.actionAffordances || []).join(' ')}`)), JSON.stringify(s.ground));
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-scenario-destroyed-container-boundary-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
function recordJsonSidecars(qc, outDir) {
  for (const name of fs.readdirSync(outDir)) {
    if (!name.endsWith('.json') || name === 'evidence-approval.json') continue;
    const file = path.join(outDir, name);
    if (!fs.statSync(file).isFile()) continue;
    qc.recordLog({ id: `sidecar-${name.replace(/[^a-z0-9._-]+/gi, '-')}`, path: file, classification: 'scenario-state' });
  }
}

async function main() {
  const playground = makeIsolatedPlayground();
  const page = await Harness.createElectronBrowserDriver({
    root, width, height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACKDIR: playground, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const outcomes = [];
  if (typeof assertionOutcomes !== 'undefined') assertionOutcomes = outcomes;
  let scenarioError = null;
  try {
    await evalExpr(cdp, `document.querySelector('#start-shim')?.click?.()`);
    await delay(250);
    const confirmVisible = await evalExpr(cdp, `(() => { const dialog = document.getElementById('character-dialog'); const button = document.getElementById('confirm-character'); const r = button?.getBoundingClientRect(); return Boolean(dialog?.open || (r?.width && r?.height && getComputedStyle(button).display !== 'none')); })()`);
    if (confirmVisible) await click(cdp, '#confirm-character');
    await waitFor(async () => (await state(cdp)).running);
    await waitFor(async () => /bridge_test_scenario_loaded/.test((await state(cdp)).seenShim || ''), 15000).catch(async (error) => {
      const debug = await state(cdp).catch((stateError) => ({ stateError: String(stateError) }));
      fs.writeFileSync(path.join(outDir, 'debug-scenario-load-timeout-state.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-scenario-load-timeout.png').catch(() => undefined);
      throw error;
    });
    await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
    const before = await waitFor(async () => { const s = await state(cdp); const ids = (s.actions?.buttons || []).map((b) => b.id); return ids.includes('open-container') ? s : null; }).catch(async (error) => {
      const debug = await state(cdp).catch((stateError) => ({ stateError: String(stateError) }));
      fs.writeFileSync(path.join(outDir, 'debug-before-timeout-state.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-before-timeout.png').catch(() => undefined);
      throw error;
    });
    const beforeShot = await shot(cdp, '01-before-destroy-public-container-surface.png');
    fs.writeFileSync(path.join(outDir, 'before-destroy-public-state.json'), JSON.stringify(publicStateSidecar(before), null, 2));
    
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus?.();`);
    await click(cdp, '#context-action-bar button[data-context-action-id="force-container"]');
    await waitFor(async () => { const s = await state(cdp); return /force its lock/i.test(`${s.prompt?.query || ''}\n${s.dialog?.prompt || ''}`) ? s : null; });
    await sendKey(cdp, 'y');
    let destroyed;
    for (let i = 0; i < 120; i += 1) {
      const s = await state(cdp);
      if (/totally destroyed/i.test((s.messages || []).join('\n'))) { destroyed = s; break; }
      await sendKey(cdp, '.');
      await delay(120);
    }
    assert('container was destroyed by real #force', Boolean(destroyed), JSON.stringify((await state(cdp)).messages));
    const after = await waitFor(async () => { const s = await state(cdp); const ids = (s.actions?.buttons || []).map((b) => b.id); if (!ids.includes('pickup')) return null; try { assertNoDestroyedContainerSurface(s); return s; } catch { return null; } }, 12000);
    assertNoDestroyedContainerSurface(after);
    const afterShot = await shot(cdp, '02-after-destroy-no-stale-container-surface.png');
    fs.writeFileSync(path.join(outDir, 'after-destroy-public-state.json'), JSON.stringify(publicStateSidecar(after), null, 2));
    fs.writeFileSync(path.join(outDir, 'after-destroy-raw-shim-ground-pile-events.json'), JSON.stringify(after.shimGroundPileEvents, null, 2));
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  outcomes.push({ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' });
  qc.recordAssertions(outcomes);
  recordJsonSidecars(qc, outDir);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  fs.rmSync(playground, { recursive: true, force: true });
  console.log(`real-scenario-destroyed-container-boundary-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
