const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = Number(process.env.NH_ELECTRON_WINDOW_WIDTH || 1360);
const height = Number(process.env.NH_ELECTRON_WINDOW_HEIGHT || 920);
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
  console.log(`real-free-text-prompt-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function clickCenter(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function state(cdp) { return evalExpr(cdp, `(() => {
  const automation = window.__nethackAutomation?.state?.() || {};
  const dialog = window.__nethackPromptTest?.dialog?.() || {};
  const messages = window.__nethackPromptTest?.messages?.().slice(-8).map(m => m.text || String(m)) || [];
  const backdrop = getComputedStyle(document.getElementById('interaction-dialog'), '::backdrop');
  return {
    running: automation.runningState?.running || false,
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id),
    dialog,
    messages,
    visibleRecentLog: document.getElementById('messages')?.innerText || '',
    backdrop: { background: backdrop.backgroundColor, filter: backdrop.backdropFilter || backdrop.webkitBackdropFilter || '' },
    body: document.body.innerText,
  };
})()`); }
async function startRealGame(cdp) {
  await clickCenter(cdp, '#start-shim');
  await delay(200);
  await clickCenter(cdp, '#confirm-character');
  await waitFor(async () => { const s = await state(cdp); return s.running && /shim_glyph|shim_status_update|shim_curs|shim_putstr/.test(s.seen) ? s : null; }, 20000);
  const s = await state(cdp);
  if (s.dialogs.includes('intro-dialog')) {
    await clickCenter(cdp, '#intro-continue');
    await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
  }
  await evalExpr(cdp, "document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs();");
  return state(cdp);
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  const page = await Harness.createElectronBrowserDriver({ root, width, height, env: {} });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const results = { outDir, screenshots: {}, checks: {} };
  let scenarioError = null;
  try {
    results.started = await startRealGame(cdp);
    results.screenshots.beforePrompt = await shot(cdp, '01-real-game-before-free-text-prompt.png');

    await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.event({name:'shim_putstr', window:1, text:'You unleash a water demon!'});
      t.event({name:'shim_putstr', window:1, text:'Grateful for its release, the demon grants you a wish!'});
      t.event({name:'shim_getlin', query:'For what do you wish?'});
      document.getElementById('interaction-text')?.focus();
    })()`);
    results.prompt = await waitFor(async () => { const s = await state(cdp); return s.dialogs.includes('interaction-dialog') && /wish/i.test(`${s.dialog.title}\n${s.dialog.prompt}`) ? s : null; }, 7000);
    results.screenshots.freeTextPrompt = await shot(cdp, '02-real-shim-free-text-wish-prompt-context-visible.png');
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.setText('blessed greased +2 gray dragon scale mail'); t.confirm(); })()`);
    results.afterConfirm = await state(cdp);

    const allPrompt = `${results.prompt.dialog.title}\n${results.prompt.dialog.prompt}\n${results.prompt.dialog.context}\n${results.prompt.dialog.textLabel}`;
    results.checks = {
      realElectronGameStarted: Boolean(results.started.running),
      deterministicShimPromptUsedAfterRealStart: /shim_getlin/.test(results.prompt.seen),
      clearWishQuestionVisible: /For what do you wish\?/i.test(allPrompt) && /Wish granted|Wish text/i.test(allPrompt),
      textInputVisibleAndFocusedFlow: results.prompt.dialog.textEntry && /Confirm \/ Enter/i.test(results.prompt.dialog.confirmText || ''),
      contextLogIncludedInPrompt: /water demon/i.test(results.prompt.dialog.context) && /grants you a wish/i.test(results.prompt.dialog.context),
      recentLogStillReadableBehindModal: /water demon/i.test(results.prompt.visibleRecentLog) && /grants you a wish/i.test(results.prompt.visibleRecentLog),
      interactionBackdropDoesNotBlurLog: !/blur/i.test(String(results.prompt.backdrop.filter || '')),
      typedWishSubmittedToBridge: false,
    };
    // afterConfirm.sent is not in state; fetch directly so the screenshot state stays compact.
    results.afterConfirm.sent = await evalExpr(cdp, "window.__nethackPromptTest.sentInputs().join('')");
    results.checks.typedWishSubmittedToBridge = /gray dragon scale mail\n/.test(results.afterConfirm.sent);

    fs.writeFileSync(path.join(outDir, 'real-free-text-prompt-mcp-summary.json'), JSON.stringify(results, null, 2));
    const md = [`# Real free-text prompt MCP/CDP regression`, '', `Output: ${outDir}`, '', 'This starts real Electron NetHack, then feeds deterministic shim events through the same renderer prompt/input flow used by live `shim_getlin` questions.', '', '## Checks', ...Object.entries(results.checks).map(([k,v]) => `- ${v ? 'passed' : 'failed'} ${k}`), '', '## Screenshots', ...Object.entries(results.screenshots).map(([k,v]) => `- ${k}: ${v}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-free-text-prompt-mcp-summary.md'), md);
    console.log(md);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Real free-text prompt MCP regression failed: ${failed.join(', ')}`);
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  qc.recordAssertions([{ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' }]);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-free-text-prompt-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
