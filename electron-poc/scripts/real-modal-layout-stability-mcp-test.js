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
  console.log(`real-modal-layout-stability-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function press(cdp, key, code = key, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
async function clickCenter(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function rectDelta(a, b) { return Object.fromEntries(['left', 'top', 'width', 'height', 'right', 'bottom'].map((key) => [key, Math.round((b[key] - a[key]) * 100) / 100])); }
function maxAbsDelta(delta) { return Math.max(...Object.values(delta).map((value) => Math.abs(value))); }
function assertStableRect(name, before, after, tolerance = 1.5) { const delta = rectDelta(before, after); assert(`${name} stable`, maxAbsDelta(delta) <= tolerance, JSON.stringify({ before, after, delta, tolerance })); }
function playgroundLockFiles() { const dir = path.resolve(root, '..', 'playground'); try { return fs.readdirSync(dir).filter((name) => /^[a-z]lock\.\d+$/i.test(name)).map((name) => path.join(dir, name)); } catch { return []; } }
function removeNewPlaygroundLocks(initialLocks = new Set()) { for (const file of playgroundLockFiles()) { if (initialLocks.has(file)) continue; try { fs.rmSync(file, { force: true }); } catch {} } }

async function state(cdp) { return evalExpr(cdp, `(() => ({
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seen: document.getElementById('shim-output')?.dataset?.seen || '',
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  bodyClass: document.body.className
}))()`); }
async function startRealGame(cdp) {
  await clickCenter(cdp, '#start-shim');
  await delay(200);
  const dialogsAfterStart = await evalExpr(cdp, `Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id)`);
  if (dialogsAfterStart.includes('startup-choice-dialog')) {
    await clickCenter(cdp, '#startup-new-game');
    await delay(200);
  }
  await waitFor(async () => evalExpr(cdp, `document.getElementById('character-dialog')?.open || false`), 5000);
  await evalExpr(cdp, `(() => { document.getElementById('player-role').value = 'Sam'; document.getElementById('player-race').value = 'Hum'; document.getElementById('player-gender').value = 'Fem'; document.getElementById('player-align').value = 'Law'; document.getElementById('player-name').value = 'Layout'; })()`);
  await clickCenter(cdp, '#confirm-character');
  await waitFor(async () => { const s = await state(cdp); return s.running && /shim_glyph|shim_status_update|shim_curs|shim_putstr/.test(s.seen) ? s : null; }, 25000);
  if ((await state(cdp)).dialogs.includes('intro-dialog')) {
    await clickCenter(cdp, '#intro-continue');
    await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
  }
  await evalExpr(cdp, `document.getElementById('game-grid')?.focus(); window.__nethackPromptTest?.clearSentInputs?.();`);
}
async function layoutMetrics(cdp) { return evalExpr(cdp, `(() => {
  function box(selector) { const el = document.querySelector(selector); const r = el?.getBoundingClientRect?.(); return r ? { left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom } : null; }
  function groupBoxes() { return Array.from(document.querySelectorAll('#stats-panel .status-group')).map((el) => { const r = el.getBoundingClientRect(); return { label: el.querySelector('.status-group-label')?.textContent || '', left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; }); }
  const context = document.getElementById('context-strip');
  const style = context ? getComputedStyle(context) : null;
  const dialog = document.getElementById('interaction-dialog');
  const options = document.getElementById('interaction-options');
  const optionsStyle = options ? getComputedStyle(options) : null;
  return {
    modalLock: document.body.classList.contains('modal-overlay-active'),
    contextAriaHidden: context?.getAttribute('aria-hidden') || '',
    contextText: context?.innerText || '',
    contextStyle: style ? { position: style.position, opacity: style.opacity, pointerEvents: style.pointerEvents, width: style.width, height: style.height } : null,
    title: document.getElementById('interaction-title')?.textContent || '',
    openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    rects: { topBar: box('#top-bar'), statsPanel: box('#stats-panel'), quickActions: box('#quick-actions'), contextActionBar: box('#context-action-bar'), gameGrid: box('#game-grid'), logPanel: box('#log-panel'), dialog: box('#interaction-dialog'), options: box('#interaction-options') },
    scroll: { bodyWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth, dialogScrollWidth: dialog?.scrollWidth || 0, dialogClientWidth: dialog?.clientWidth || 0, optionsOverflowX: optionsStyle?.overflowX || '' },
    groups: groupBoxes(),
    statsText: document.getElementById('stats-panel')?.innerText || ''
  };
})()`); }

async function main() {
  const page = await Harness.createElectronBrowserDriver({ root, width, height, env: {} });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  let scenarioError = null;
  try {
    await startRealGame(cdp);

    const before = await layoutMetrics(cdp);
    const beforeShot = await shot(cdp, '01-real-before-key-i.png');
    assert('real precondition has status groups', before.groups.length >= 3 && /Hero|Attributes|Vitals|Dungeon/i.test(before.statsText), JSON.stringify(before));
    assert('real precondition has no modal lock', !before.modalLock, JSON.stringify(before));

    await press(cdp, 'i', 'KeyI', 'i');
    const after = await waitFor(async () => { const m = await layoutMetrics(cdp); return m.modalLock && /Equipment\s*\/\s*Inventory/i.test(m.title) ? m : null; }, 10000);
    const afterShot = await shot(cdp, '02-real-after-key-i-inventory-modal.png');
    assert('real inventory modal hides context strip accessibly', after.contextAriaHidden === 'true' && after.contextStyle?.position === 'absolute' && after.contextStyle?.opacity === '0', JSON.stringify(after.contextStyle));
    assert('real equipment dialog keeps usable two-column width without horizontal modal overflow', after.rects.dialog.width >= 900 && after.rects.options.width >= 300 && after.scroll.bodyWidth <= after.scroll.viewportWidth + 1 && after.scroll.dialogScrollWidth <= after.scroll.dialogClientWidth + 1 && after.scroll.optionsOverflowX === 'hidden', JSON.stringify({ dialog: after.rects.dialog, options: after.rects.options, scroll: after.scroll }));
    for (const key of ['topBar', 'statsPanel', 'quickActions', 'contextActionBar', 'gameGrid', 'logPanel']) assertStableRect(`real ${key}`, before.rects[key], after.rects[key], 1.5);
    assert('real status groups do not rewrap on inventory modal', before.groups.length === after.groups.length, JSON.stringify({ before: before.groups, after: after.groups }));
    for (let index = 0; index < before.groups.length; index += 1) {
      assert(`real status group order ${index} stable`, before.groups[index].label === after.groups[index].label, JSON.stringify({ before: before.groups, after: after.groups }));
      assertStableRect(`real status group ${before.groups[index].label}`, before.groups[index], after.groups[index], 1.5);
    }

    await press(cdp, 'Escape', 'Escape');
    const closingSamples = [];
    for (let index = 0; index < 26; index += 1) {
      closingSamples.push(await layoutMetrics(cdp));
      await delay(50);
    }
    const unstableCloseSamples = closingSamples.map((sample, index) => ({
      index,
      openDialogs: sample.openDialogs,
      bodyClass: sample.bodyClass,
      contextText: sample.contextText,
      deltas: Object.fromEntries(['topBar', 'statsPanel', 'quickActions', 'contextActionBar', 'gameGrid', 'logPanel'].map((key) => [key, rectDelta(before.rects[key], sample.rects[key])])),
    })).filter((sample) => Object.values(sample.deltas).some((delta) => maxAbsDelta(delta) > 1.5));
    assert('real inventory Escape close keeps map/background layout stable during stale-menu grace window', unstableCloseSamples.length === 0, JSON.stringify(unstableCloseSamples.slice(0, 5)));
    const closed = await waitFor(async () => { const m = await layoutMetrics(cdp); return !m.openDialogs.includes('interaction-dialog') && !m.modalLock ? m : null; }, 10000);
    const closedShot = await shot(cdp, '03-real-after-escape-close.png');
    assert('real Escape close restores context strip semantics', closed.contextAriaHidden === '' && closed.contextStyle?.position === 'absolute' && closed.contextStyle?.opacity === '1', JSON.stringify(closed.contextStyle));

    const summary = { beforeShot, afterShot, closedShot, before, after, closingSamples, closed };
    fs.writeFileSync(path.join(outDir, 'real-modal-layout-stability-summary.json'), JSON.stringify(summary, null, 2));
    console.log(`real modal layout stability test passed: ${beforeShot} ${afterShot} ${closedShot}`);
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
  console.log(`real-modal-layout-stability-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
