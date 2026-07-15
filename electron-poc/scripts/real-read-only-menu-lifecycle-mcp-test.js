const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
const sourcePlayground = path.resolve(root, '..', 'playground');

function prepareIsolatedPlayground(isolatedPlayground) {
  fs.mkdirSync(path.join(isolatedPlayground, 'save'), { recursive: true });
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license']) fs.copyFileSync(path.join(sourcePlayground, name), path.join(isolatedPlayground, name));
  for (const name of ['perm', 'record', 'logfile', 'xlogfile', 'livelog', 'paniclog']) fs.writeFileSync(path.join(isolatedPlayground, name), '');
}

async function shot(cdp, name) { const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 }); return capture.raw.path; }
function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-read-only-menu-lifecycle-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`);
  if (!box) throw new Error(`missing ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function press(cdp, key, text = key) {
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : (key === 'Escape' ? 27 : 0);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}
async function pageState(cdp) {
  return evalExpr(cdp, `(() => ({
    status: document.getElementById('status')?.textContent || '',
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
    running: window.__nethackAutomation?.state?.()?.runningState?.running || false,
    mapCells: window.__nethackAutomation?.state?.()?.map?.cells?.length || 0,
    prompt: window.__nethackPromptTest?.prompt?.() || null,
    dialog: window.__nethackPromptTest?.dialog?.() || {},
    openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    body: document.body.innerText,
    menuPanel: { hidden: !!document.getElementById('menu-panel')?.hidden, text: document.getElementById('menu-panel')?.innerText || '' },
    promptPanel: { hidden: !!document.getElementById('prompt-panel')?.hidden, text: document.getElementById('prompt-panel')?.innerText || '' },
  }))()`);
}
function writeState(outputDir, name, data) { const p = path.join(outputDir, name); fs.writeFileSync(p, JSON.stringify(data, null, 2)); return p; }

async function main() {
  const isolatedPlayground = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-read-only-menu-'));
  prepareIsolatedPlayground(isolatedPlayground);
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_PLAYGROUND: isolatedPlayground,
      NETHACKDIR: isolatedPlayground,
    },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  let scenarioError = null;
  try {
    await click(cdp, '#start-shim');
    await delay(200);
    if (await evalExpr(cdp, `document.getElementById('startup-choice-dialog')?.open === true`)) await click(cdp, '#startup-new-game');
    await waitFor(async () => evalExpr(cdp, `document.getElementById('character-dialog')?.open === true && !document.getElementById('confirm-character')?.disabled`), 8000);
    await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); input.value = 'ReadOnlyMenu'; input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await click(cdp, '#confirm-character');
    await waitFor(async () => {
      const s = await pageState(cdp);
      if (/failed|error/i.test(s.status)) throw new Error(`game failed to start: ${JSON.stringify(s)}`);
      return s.running ? s : null;
    }, 25000).catch(async (error) => {
      throw new Error(`${error.message}: ${JSON.stringify(await pageState(cdp))}`);
    });
    if ((await pageState(cdp)).openDialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
    await evalExpr(cdp, `(() => { document.getElementById('game-grid')?.focus(); window.__nethackPromptTest?.clearSentInputs?.(); return true; })()`);
    await shot(cdp, '01-game-ready-before-help.png');
    await press(cdp, ';', ';');
    const tip = await waitFor(async () => {
      const s = await pageState(cdp);
      return s.dialog?.interactionOpen
        && /^Tip$/i.test(s.dialog?.title || '')
        && /Farlooking or selecting a map location/i.test(s.body) ? s : null;
    }, 10000);
    const tipOpenPath = await shot(cdp, '02-farlook-tip-open.png');
    writeState(outDir, '02-farlook-tip-open-state.json', tip);
    await click(cdp, '.read-only-continue');
    const afterContinue = await waitFor(async () => {
      const s = await pageState(cdp);
      return !s.dialog?.interactionOpen
        && !/Review this tip|Farlooking or selecting a map location/i.test(`${s.promptPanel.text}\n${s.menuPanel.text}`) ? s : null;
    }, 5000);
    const tipClosedPath = await shot(cdp, '03-farlook-tip-closed.png');
    writeState(outDir, '03-farlook-tip-closed-state.json', afterContinue);
    if (/Unknown command/i.test(afterContinue.body)) throw new Error('Continue leaked a menu-dismissal key into gameplay as an unknown command');
    await press(cdp, 'Escape', '');
    await delay(300);
    await press(cdp, '?', '?');
    const help = await waitFor(async () => {
      const s = await pageState(cdp);
      return (s.dialog?.interactionOpen || s.dialog?.documentOpen) && /help|command|information menu|Review this information/i.test(`${s.dialog?.title||''}\n${s.dialog?.prompt||''}\n${s.dialog?.documentTitle||''}\n${s.dialog?.documentBody||''}`) ? s : null;
    }, 10000);
    const openPath = await shot(cdp, '02-read-only-help-menu-open.png');
    writeState(outDir, '02-read-only-help-menu-open-state.json', help);
    if (!help.dialog?.interactionOpen) throw new Error(`expected real help topic interaction, got ${JSON.stringify(help.dialog)}`);
    if (!/Help/i.test(help.dialog?.title || '')) throw new Error(`expected Help title, got ${JSON.stringify(help.dialog)}`);
    if (/\bCHANGE\b|Settings panel/i.test(help.body)) throw new Error('help topic menu was mis-rendered with options/settings chrome');
    await press(cdp, 'a', 'a');
    await press(cdp, 'Enter', '\n');
    const doc = await waitFor(async () => {
      const s = await pageState(cdp);
      return s.dialog?.documentOpen || /NetHack|version information|Copyright|About/i.test(`${s.dialog?.documentBody || ''}\n${s.body}`) ? s : null;
    }, 10000);
    const docPath = await shot(cdp, '03-read-only-help-document-open.png');
    writeState(outDir, '03-read-only-help-document-open-state.json', doc);
    if (!doc.dialog?.documentOpen) throw new Error(`expected read-only help document, got ${JSON.stringify(doc.dialog)}`);
    await press(cdp, 'Escape', '');
    await delay(500);
    const after = await pageState(cdp);
    const afterPath = await shot(cdp, '04-read-only-help-closed.png');
    writeState(outDir, '04-read-only-help-closed-state.json', after);
    if (/Review this information|information menu open/i.test(`${after.promptPanel.text}\n${after.menuPanel.text}`)) throw new Error('read-only menu prompt remained visible after Escape');
    if (/Unknown command/i.test(after.body)) throw new Error('read-only menu dismissal leaked an unknown command into gameplay');
    const summary = { ok: true, outDir, screenshots: [tipOpenPath, tipClosedPath, openPath, docPath, afterPath], tipPrompt: tip.prompt, afterContinuePrompt: afterContinue.prompt, helpPrompt: help.prompt, documentOpen: doc.dialog.documentOpen, afterPrompt: after.prompt };
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  fs.rmSync(isolatedPlayground, { recursive: true, force: true });
  qc.recordAssertions([{ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' }]);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-read-only-menu-lifecycle-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
