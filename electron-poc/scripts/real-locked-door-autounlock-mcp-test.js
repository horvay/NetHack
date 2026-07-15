const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 900;
const { delay, waitFor } = Harness;
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) { const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 }); return capture.raw.path; }
function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-locked-door-autounlock-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function press(cdp, key) { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key.length === 1 ? key : undefined, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined }); }
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left + r.width / 2, y:r.top + r.height / 2} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function state(cdp) { return evalExpr(cdp, `(() => ({
  status: document.getElementById('status')?.textContent || '',
  prompt: window.__nethackPromptTest?.prompt?.(),
  dialog: window.__nethackPromptTest?.dialog?.(),
  context: window.__nethackPromptTest?.context?.(),
  messages: window.__nethackPromptTest?.messages?.().slice(-12) || [],
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  automation: window.__nethackAutomation?.state?.(),
  cursor: window.__nethackAutomation?.state?.().cursor,
  doors: Array.from(document.querySelectorAll('.tile-cell')).filter((el) => /door/i.test((el.dataset.semanticKind || '') + ' ' + (el.dataset.semanticName || '')) || el.textContent === '+').map((el) => ({ x:Number(el.dataset.mapX), y:Number(el.dataset.mapY), text:el.getAttribute('aria-label') || el.textContent, kind:el.dataset.semanticKind, name:el.dataset.semanticName })).slice(0,20)
}))()`); }
function directionFromTo(a, b) { const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y); return { '-1,-1':'y', '0,-1':'k', '1,-1':'u', '-1,0':'h', '1,0':'l', '-1,1':'b', '0,1':'j', '1,1':'n' }[`${dx},${dy}`]; }

async function main() {
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: { NH_SHIM_TEST_LOCKED_DOOR_SCENE: '1', NETHACK_SEED: '424242' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const results = { outDir, screenshots: {}, checks: {} };
  let scenarioError = null;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    await click(cdp, '#start-shim');
    await delay(100);
    const characterOpen = await evalExpr(cdp, `document.getElementById('character-dialog')?.open`);
    if (characterOpen) {
      await evalExpr(cdp, `document.getElementById('player-role').value='Rog'; document.getElementById('player-race').value='Hum'; document.getElementById('player-gender').value='Fem'; document.getElementById('player-align').value='Cha'; document.getElementById('player-name').value='Lockpick'; true`);
      await click(cdp, '#confirm-character');
    }
    await waitFor(async () => { const s = await state(cdp); return s.automation?.runningState?.running && s.doors.length && s.cursor ? s : null; }, 30000);
    if (await evalExpr(cdp, `document.getElementById('intro-dialog')?.open`)) await click(cdp, '#intro-continue');
    results.screenshots.started = await shot(cdp, '01-started-adjacent-locked-door.png');
    const before = await state(cdp);
    const adjacent = before.doors.find((d) => /closed|locked/i.test(`${d.name || ''} ${d.text || ''}`) && Math.abs(d.x - before.cursor.x) <= 1 && Math.abs(d.y - before.cursor.y) <= 1 && (d.x !== before.cursor.x || d.y !== before.cursor.y));
    if (!adjacent) throw new Error(`No adjacent test door found: ${JSON.stringify(before)}`);
    const direction = directionFromTo(before.cursor, adjacent);
    results.door = { cursor: before.cursor, adjacent, direction };
    await press(cdp, direction);
    const promptState = await waitFor(async () => { const s = await state(cdp); return /Unlock it with your lock pick/i.test(s.dialog?.prompt || '') ? s : null; }, 10000);
    results.promptState = promptState;
    results.screenshots.prompt = await shot(cdp, '02-real-autounlock-prompt.png');
    await click(cdp, '#interaction-options .choice-button[data-key="y"]');
    const after = await waitFor(async () => { const s = await state(cdp); return s.messages.some((m) => /succeed in picking the lock|give up your attempt|stop picking|This door is locked/i.test(m)) && !s.dialog?.interactionOpen && !s.prompt ? s : null; }, 15000);
    results.after = after;
    results.screenshots.after = await shot(cdp, '03-after-y-control-returned.png');
    await press(cdp, '.');
    await waitFor(async () => { const s = await state(cdp); return /sent key: wait|stats updated|command accepted/i.test(s.status) ? s : null; }, 5000);
    results.afterWait = await state(cdp);
    results.screenshots.afterWait = await shot(cdp, '04-after-followup-wait.png');
    results.checks.realElectronStarted = true;
    results.checks.lockedDoorPromptVisible = /Unlock it with your lock pick/i.test(promptState.dialog?.prompt || '');
    results.checks.staleContextClearedAtPrompt = promptState.context == null;
    results.checks.yWasSent = /y/.test(results.after.sent || '');
    results.checks.controlReturnedAfterAnswer = !after.dialog?.interactionOpen && !after.prompt;
    results.checks.followupInputAccepted = /\./.test(results.afterWait.sent || '') || /sent key: wait|command accepted/i.test(results.afterWait.status || '');
    const ok = Object.values(results.checks).every(Boolean);
    fs.writeFileSync(path.join(outDir, 'real-locked-door-autounlock-result.json'), JSON.stringify(results, null, 2));
    if (!ok) throw new Error(`Checks failed: ${JSON.stringify(results.checks)}`);
  } catch (error) {
    scenarioError = error;
    results.error = error.stack || String(error);
    fs.writeFileSync(path.join(outDir, 'real-locked-door-autounlock-failure.json'), JSON.stringify(results, null, 2));
  } finally {
    await page.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  qc.recordAssertions(Object.entries(results.checks).map(([id, ok]) => ({ id, status: ok ? 'passed' : 'failed', details: ok ? '' : 'Observable scenario condition was not satisfied.' })).concat([{ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' }]));
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-locked-door-autounlock-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
