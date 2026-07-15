const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
let outDir

const width = Number(process.env.NH_REAL_STARTUP_WIDTH || 1280);
const height = Number(process.env.NH_REAL_STARTUP_HEIGHT || 900);

const { delay, waitFor } = Harness;
const playerName = (process.env.NH_REAL_STARTUP_PLAYER_NAME || `Test${Date.now().toString(36).slice(-6)}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'TestHero';

async function state(page) {
  return page.evalCheckedValue(`(() => {
    const cells = Array.from(document.querySelectorAll('.tile-cell'));
    const meaningfulCells = cells.filter((cell) => (cell.dataset.glyph || ' ') !== ' ');
    return {
      ready: document.readyState,
      hasAutomation: !!window.__nethackAutomation,
      hasPromptTest: !!window.__nethackPromptTest,
      running: window.__nethackAutomation?.state?.().runningState?.running || false,
      status: document.getElementById('status')?.textContent || '',
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id),
      seen: document.getElementById('shim-output')?.dataset?.seen || '',
      messages: window.__nethackPromptTest?.messages?.().map(m => m.text || String(m)) || [],
      visibleRecentLog: document.getElementById('messages')?.innerText || '',
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      map: {
        cellCount: cells.length,
        meaningfulCellCount: meaningfulCells.length,
        heroVisible: cells.some((cell) => cell.dataset.glyph === '@' || cell.dataset.tileId === 'hero-avatar'),
        floorVisible: cells.some((cell) => cell.dataset.glyph === '.' || cell.classList.contains('terrain-floor')),
        parsedPrintGlyphEvents: /shim_print_glyph/.test(document.getElementById('shim-output')?.dataset?.seen || ''),
        rawShimParseErrors: (document.getElementById('shim-output')?.textContent || '').includes('"name":"shim-raw"'),
      },
    };
  })()`);
}

async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  const page = await Harness.createElectronBrowserDriver({ root, width, height });
  outDir = page.outputDir;
  const qc = createEvidence(page);
  const results = { runIdentity: page.outputIdentity, playerName, screenshots: {}, checks: {} };
  let scenarioError;
  try {
    results.rendererReady = await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    results.screenshots.beforeStart = await page.screenshotEvidence(qc, '01-before-start', { classification: 'actual-player', viewport: { width, height, devicePixelRatio: 1 }, state: 'before-start' });
    await page.startDefaultGame({ timeoutMs: 10000, playerName });
    results.startedWithIntro = await waitFor(async () => {
      const current = await state(page);
      return current.running && /shim_glyph|shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(current.seen) ? current : null;
    }, 20000);
    results.screenshots.startedWithIntro = await page.screenshotEvidence(qc, '02-started-before-intro-dismiss', { classification: 'actual-player', viewport: { width, height, devicePixelRatio: 1 }, state: 'started-before-intro-dismiss' });
    if (results.startedWithIntro.dialogs.includes('intro-dialog')) {
      await page.click('#intro-continue', { timeoutMs: 5000 });
      await waitFor(async () => !(await state(page)).dialogs.includes('intro-dialog'), 5000);
      await delay(500);
    }
    results.afterIntroDismiss = await state(page);
    results.screenshots.afterIntroDismiss = await page.screenshotEvidence(qc, '03-after-intro-dismiss-no-unknown-command', { classification: 'actual-player', viewport: { width, height, devicePixelRatio: 1 }, state: 'after-intro-dismiss' });
    const logText = `${results.afterIntroDismiss.messages.join('\n')}\n${results.afterIntroDismiss.visibleRecentLog}`;
    results.checks = {
      realElectronGameStarted: Boolean(results.afterIntroDismiss.running),
      welcomeMessageVisible: /welcome to NetHack/i.test(logText),
      noUnknownCommandImmediatelyAfterStart: !/Unknown command/i.test(logText),
      noBlankSpaceCommandImmediatelyAfterStart: !/Unknown command ['’`]\s*['’`]/i.test(logText),
      shimPrintGlyphJsonParsed: Boolean(results.afterIntroDismiss.map?.parsedPrintGlyphEvents) && !results.afterIntroDismiss.map?.rawShimParseErrors,
      startupMapNotBlack: Number(results.afterIntroDismiss.map?.meaningfulCellCount || 0) > 0,
      heroAndFloorVisible: Boolean(results.afterIntroDismiss.map?.heroVisible && results.afterIntroDismiss.map?.floorVisible),
    };
    fs.writeFileSync(path.join(outDir, 'real-startup-no-blank-command-summary.json'), JSON.stringify(results, null, 2));
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Real startup blank-command regression failed: ${failed.join(', ')}`);
  } catch (error) {
    scenarioError = error;
    results.failureState = await state(page).catch((stateError) => ({ stateError: stateError.message }));
    await page.screenshotEvidence(qc, '99-failure', { classification: 'diagnostic', viewport: { width, height, devicePixelRatio: 1 }, state: 'failure' }).catch(() => '');
    fs.writeFileSync(path.join(outDir, 'real-startup-no-blank-command-summary.json'), JSON.stringify(results, null, 2));
  } finally {
    await finishEvidence(page, qc, scenarioError);
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
