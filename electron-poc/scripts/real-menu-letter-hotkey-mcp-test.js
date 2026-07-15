const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = Number(process.env.NH_ELECTRON_WINDOW_WIDTH || 1440);
const height = Number(process.env.NH_ELECTRON_WINDOW_HEIGHT || 1080);
const { delay, waitFor } = Harness;
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
const scenarioId = process.env.NH_REAL_MENU_HOTKEY_SCENARIO || 'identity/valkyrie-equipped-inventory';

function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function shot(cdp, name) { const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 }); return capture.raw.path; }
function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-menu-letter-hotkey-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await delay(120); }
async function press(cdp, key) { const special = key === 'Escape' ? ['Escape', 27, ''] : key === 'Enter' ? ['Enter', 13, '\r'] : [`Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0), key]; const [code, vk, text] = special; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, unmodifiedText: text, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); await delay(180); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  cursor: window.__nethackAutomation?.state?.().cursor || {},
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  messages: window.__nethackPromptTest?.messages?.().slice(-20).map((m) => m.text || String(m)) || [],
  status: document.getElementById('status')?.textContent || '',
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  body: document.body.innerText
}))()`); }
function rel(file) { return path.resolve(file); }

async function main() {
  const page = await Harness.createElectronBrowserDriver({ root, width, height, env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '976401', NETHACKOPTIONS: '!tutorial,!autopickup' } });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  let scenarioError = null;
  try {
    await click(cdp, '#start-shim');
    await delay(250);
    if ((await state(cdp)).dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
    await waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 8000);
    await evalExpr(cdp, `(() => { document.getElementById('player-name').value = 'MenuHotkey' + Date.now().toString(36).slice(-4); document.getElementById('player-name').dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await click(cdp, '#confirm-character');
    await waitFor(async () => (await state(cdp)).running, 20000);
    await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
    await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 12000);

    const screenshots = [];
    screenshots.push({ path: rel(await shot(cdp, '01-real-game-before-menu.png')), notes: 'Real scenario loaded; map is focused and no item popup is open.' });

    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus();`);
    await press(cdp, 'h');
    const movement = await state(cdp);
    assert('plain h still reaches dungeon command path when no popup is open', movement.sent === 'h' && /(?:sent key: move \(h\)|command completed: key h)/i.test(movement.status), JSON.stringify({ sent: movement.sent, status: movement.status }));

    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus();`);
    const cursorBeforeMenu = (await state(cdp)).cursor;
    await press(cdp, 'T');
    const menu = await waitFor(async () => { const s = await state(cdp); return s.dialog?.interactionOpen && /take off/i.test(`${s.dialog.title}\n${s.dialog.prompt}`) && s.dialog.options?.length ? s : null; }, 8000);
    const target = menu.dialog.options.find((o) => /^[hjklyubn]$/.test(o.key || '')) || menu.dialog.options[0];
    assert('take-off menu exposes lettered rows', target?.key && /being worn|worn|shield|armor|leather|wooden/i.test(target.text || ''), JSON.stringify(menu.dialog));
    screenshots.push({ path: rel(await shot(cdp, '02-real-takeoff-menu-before-letter.png')), notes: `Take-off popup shows visible selector ${target.key} for row: ${String(target.text || '').replace(/\s+/g, ' ').trim()}` });

    await press(cdp, target.key);
    const afterSelection = await waitFor(async () => { const s = await state(cdp); return s.sent === `T${target.key}` ? s : null; }, 8000);
    await delay(600);
    const settled = await state(cdp);
    screenshots.push({ path: rel(await shot(cdp, '03-real-after-letter-selection.png')), notes: 'After pressing the shown selector letter, the popup has been acted on via menu selection text rather than dungeon movement.' });

    assert('letter key was routed as menu row activation, not dungeon movement', afterSelection.sent === `T${target.key}` && !new RegExp(`sent key: move \\(${target.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'i').test(afterSelection.status), JSON.stringify({ target, sent: afterSelection.sent, status: afterSelection.status }));
    assert('selector key did not move the player cursor behind the popup', JSON.stringify(settled.cursor) === JSON.stringify(cursorBeforeMenu) || JSON.stringify(settled.cursor) === JSON.stringify(afterSelection.cursor), JSON.stringify({ before: cursorBeforeMenu, afterSelection: afterSelection.cursor, settled: settled.cursor, target }));

    const summary = { ok: true, scenarioId, target, movement: { sent: movement.sent, status: movement.status }, afterSelection: { sent: afterSelection.sent, status: afterSelection.status, cursor: afterSelection.cursor }, settled: { cursor: settled.cursor, messages: settled.messages.slice(-8), dialogOpen: settled.dialog.interactionOpen }, screenshots };
    fs.writeFileSync(path.join(outDir, 'real-menu-letter-hotkey-summary.json'), JSON.stringify(summary, null, 2));
    console.log(`real menu letter hotkey MCP passed: ${screenshots.map((s) => s.path).join(' ')}`);  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  qc.recordAssertions([{ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' }]);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-menu-letter-hotkey-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
