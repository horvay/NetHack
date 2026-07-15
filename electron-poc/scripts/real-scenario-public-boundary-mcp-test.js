const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');



const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
const repo = path.resolve(root, '..');
const scenarioId = process.env.NH_PUBLIC_BOUNDARY_SCENARIO_ID || 'ground/unidentified-appearance-pile-on-hero';
let outDir, evidencePage, evidenceQc

const seed = process.env.NH_PUBLIC_BOUNDARY_SEED || '424242';
const forbiddenIdentityPatterns = [
  /orcish dagger/i,
  /scroll of remove curse/i,
  /wand of magic missile/i,
  /potion of extra healing/i,
  /orcish helm/i,
  /orcish dagger/i,
  /scroll of identify/i,
];
const forbiddenActionTokens = new Set(['container.locked', 'container.trapped', 'container.broken', 'locked', 'trapped', 'broken']);





async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: path.basename(name, path.extname(name)) }); }
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function pressKey(cdp, key) {
  const code = key === 'Escape' ? 27 : key.toUpperCase().charCodeAt(0);
  const params = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, text: key.length === 1 ? key : '' };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params, text: undefined });
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function makeIsolatedPlayground() {
  const source = path.join(repo, 'playground');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-public-boundary-'));
  fs.cpSync(source, temp, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/.test(path.basename(entry)) });
  return temp;
}
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    actions: window.__nethackPromptTest?.contextActions?.(),
    inventory: window.__nethackPromptTest?.inventory?.(),
    equipment: window.__nethackPromptTest?.equipmentSnapshot?.(),
    ground: window.__nethackPromptTest?.groundSnapshots?.(),
    container: window.__nethackPromptTest?.container?.(),
    currentCell: window.__nethackPromptTest?.currentCell?.(),
    menuText: document.getElementById('menu-panel')?.innerText || '',
    prompt: window.__nethackPromptTest?.prompt?.(),
    messages: window.__nethackPromptTest?.messages?.().slice(-20).map((m) => m.text || String(m)) || [],
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    shimGroundPileEvents: ((() => { const kept = window.__nethackPromptTest?.publicGroundPileShimEvidence?.() || []; if (kept.length) return kept; const apiEvents = window.__nethackPromptTest?.shimEvents?.() || []; if (apiEvents.length) return apiEvents; return (document.getElementById('shim-output')?.textContent || '').split('\\n').map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean); })()).filter((event) => event?.name === 'shim_ground_pile_snapshot').map((event) => ({ name: event.name, window: event.window, revision: event.revision, coord: event.coord, source: event.source, authoritative: event.authoritative, items: (event.items || []).map((item) => ({ objectId: item.objectId, displayName: item.displayName, quantity: item.quantity, glyph: item.glyph, objectClass: item.objectClass, semanticKnown: item.semanticKnown, semanticName: item.semanticName, semanticAppearance: item.semanticAppearance, actionAffordances: item.actionAffordances })) })),
    seenShimNames: document.getElementById('shim-output')?.dataset?.seen || '',
    scenarioLoaded: /bridge_test_scenario_loaded/.test(document.getElementById('shim-output')?.dataset?.seen || ''),
    scenarioFailed: /bridge_test_scenario_failed/.test(document.getElementById('shim-output')?.dataset?.seen || '')
  }))()`);
}
function flattenedPublicPayload(s) {
  return {
    actions: s.actions,
    inventory: s.inventory,
    equipment: s.equipment,
    ground: s.ground,
    shimGroundPileEvents: s.shimGroundPileEvents,
    seenShimNames: s.seenShimNames,
    container: s.container,
    currentCell: s.currentCell,
    menuText: s.menuText,
  };
}
function assertNoForbiddenIdentity(label, payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  for (const pattern of forbiddenIdentityPatterns) assert(`${label} does not leak ${pattern}`, !pattern.test(text), text.slice(0, 1600));
}
function assertGroundItemsArePublic(s) {
  const rendererItems = (s.ground?.piles || []).flatMap((pile) => pile.items || []);
  const shimEvents = s.shimGroundPileEvents || [];
  const shimItems = shimEvents.flatMap((event) => event.items || []);
  assert('C/shim emitted shim_ground_pile_snapshot in the real event stream', shimEvents.some((event) => event.authoritative === true && event.source === 'level.objects') || /shim_ground_pile_snapshot/.test(s.seenShimNames || ''), JSON.stringify({ shimEvents, seenShimNames: s.seenShimNames }));
  assert('ground public snapshot has unidentified scenario items', rendererItems.length >= 4 && (shimItems.length >= 4 || /shim_ground_pile_snapshot/.test(s.seenShimNames || '')), JSON.stringify({ renderer: s.ground, shimEvents, seenShimNames: s.seenShimNames }));
  const allText = JSON.stringify({ rendererItems, shimItems });
  assert('ground snapshot exposes crude dagger appearance', /crude dagger/i.test(allText), allText);
  assert('ground snapshot exposes scroll label appearance', /scroll labeled/i.test(allText), allText);
  assert('ground snapshot exposes wand public class/appearance', /wand/i.test(allText), allText);
  assert('ground snapshot exposes potion public class/appearance', /potion/i.test(allText), allText);
  for (const item of [...rendererItems, ...shimItems]) {
    if (item.known?.identity === false || item.semanticKnown === false) assert(`hidden identity semanticName omitted for ${item.displayName}`, item.semanticName == null, JSON.stringify(item));
    for (const token of item.actionAffordances || []) assert(`ground item ${item.displayName} omits hidden action token ${token}`, !forbiddenActionTokens.has(String(token)), JSON.stringify(item));
  }
}
async function start(cdp) {
  await evalExpr(cdp, `document.querySelector('#start-shim')?.click?.()`);
  await Harness.delay(250);
  const needsCharacterConfirm = await evalExpr(cdp, `Boolean(document.getElementById('character-dialog')?.open)`);
  if (needsCharacterConfirm) await click(cdp, '#confirm-character');
  else {
    const confirmVisible = await evalExpr(cdp, `(() => { const el = document.getElementById('confirm-character'); const r = el?.getBoundingClientRect(); return Boolean(r?.width && r?.height && getComputedStyle(el).display !== 'none'); })()`);
    if (confirmVisible) await click(cdp, '#confirm-character');
  }
  await Harness.waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
}
async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  const playground = makeIsolatedPlayground();
  const page = await Harness.createElectronBrowserDriver({
    root,
    width: 1360,
    height: 920,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NETHACKDIR: playground,
      NETHACK_SEED: seed,
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
  });
  outDir = page.outputDir;
  evidencePage = page;
  evidenceQc = createEvidence(page);
  const cdp = page.cdp;
  let scenarioError;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true });
    await start(cdp);
    const ready = await Harness.waitFor(async () => {
      const current = await state(cdp);
      if (current.scenarioFailed) throw new Error('scenario failed to load');
      const items = (current.ground?.piles || []).flatMap((pile) => pile.items || []);
      return current.scenarioLoaded && current.actions?.buttons?.some((button) => button.id === 'pickup') && items.length >= 4 ? current : null;
    }, 12000);
    assertGroundItemsArePublic(ready);
    assertNoForbiddenIdentity('map/context public state', flattenedPublicPayload(ready));
    assert('hero tile is not exposed as monster semantics', ready.currentCell?.semanticKind === 'hero' && ready.currentCell?.semanticName === 'hero' && !(ready.currentCell?.actionAffordances || []).some((token) => /monster/i.test(String(token))), JSON.stringify(ready.currentCell));
    const contextShot = await shot(cdp, '01-map-ground-public-boundary.png');
    fs.writeFileSync(path.join(outDir, '01-map-ground-public-boundary-state.json'), JSON.stringify(flattenedPublicPayload(ready), null, 2));
    await pressKey(cdp, 'i');
    const inventoryState = await Harness.waitFor(async () => {
      const current = await state(cdp);
      const text = `${current.inventory?.live?.map((item) => item.text).join('\n') || ''}\n${current.menuText}\n${current.body}`;
      return /iron skull cap/i.test(text) && /crude dagger/i.test(text) && /scroll labeled/i.test(text) ? current : null;
    }, 10000);
    assertNoForbiddenIdentity('inventory public UI/state', flattenedPublicPayload(inventoryState));
    const inventoryShot = await shot(cdp, '02-inventory-public-appearances.png');
    await pressKey(cdp, 'Escape');
    await Harness.waitFor(async () => !(await state(cdp)).menuText, 5000).catch(() => undefined);
    await click(cdp, '#context-action-bar button[data-context-action-id="pickup"]');
    const pickupState = await Harness.waitFor(async () => {
      const current = await state(cdp);
      const text = current.container?.text || '';
      return /Ground items|Pick up from ground/i.test(text) && /crude dagger/i.test(text) && /scroll labeled/i.test(text) && /wand/i.test(text) && /potion/i.test(text) ? current : null;
    }, 15000);
    assertNoForbiddenIdentity('ground pickup public UI/state', flattenedPublicPayload(pickupState));
    assertGroundItemsArePublic(pickupState);
    const pickupShot = await shot(cdp, '03-ground-pickup-public-appearances.png');
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({
      scenarioId,
      seed,
      screenshots: { context: contextShot, inventory: inventoryShot, pickup: pickupShot },
      contextActions: (ready.actions?.buttons || []).map((button) => ({ id: button.id, text: button.text })),
    }, null, 2));
  } catch (error) {
    scenarioError = error;
  } finally {
    fs.rmSync(playground, { recursive: true, force: true });
    await finishEvidence(page, evidenceQc, scenarioError);
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
