const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_REAL_STARTUP_OUT_DIR || path.join(root, 'test-output', 'real-startup-no-blank-command');
const port = Number(process.env.NH_REAL_STARTUP_CDP_PORT || 9494);
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
  fs.mkdirSync(outDir, { recursive: true });
  const staleLocksRemovedBeforeStart = Harness.removeStalePlaygroundLocks({ root });
  const initialLockFiles = new Set(Harness.playgroundLockFiles({ root }).map((lock) => lock.file));
  const page = await Harness.createElectronBrowserDriver({ root, port, width, height });
  const results = { outDir, playerName, staleLocksRemovedBeforeStart, screenshots: {}, checks: {} };
  try {
    results.rendererReady = await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    results.screenshots.beforeStart = await page.screenshot(path.join(outDir, '01-before-start.png'));
    await page.startDefaultGame({ timeoutMs: 10000, playerName });
    results.startedWithIntro = await waitFor(async () => {
      const s = await state(page);
      return s.running && /shim_glyph|shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(s.seen) ? s : null;
    }, 20000);
    results.screenshots.startedWithIntro = await page.screenshot(path.join(outDir, '02-started-before-intro-dismiss.png'));
    if (results.startedWithIntro.dialogs.includes('intro-dialog')) {
      await page.click('#intro-continue', { timeoutMs: 5000 });
      await waitFor(async () => !(await state(page)).dialogs.includes('intro-dialog'), 5000);
      await delay(500);
    }
    results.afterIntroDismiss = await state(page);
    results.screenshots.afterIntroDismiss = await page.screenshot(path.join(outDir, '03-after-intro-dismiss-no-unknown-command.png'));
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
    const md = [`# Real startup no blank command regression`, '', `Output: ${outDir}`, '', '## Checks', ...Object.entries(results.checks).map(([k,v]) => `- ${v ? 'PASS' : 'FAIL'} ${k}`), '', '## Screenshots', ...Object.entries(results.screenshots).map(([k,v]) => `- ${k}: ${v}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-startup-no-blank-command-summary.md'), md);
    console.log(md);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Real startup blank-command regression failed: ${failed.join(', ')}`);
  } catch (error) {
    results.failureState = await state(page).catch((stateError) => ({ stateError: stateError.message }));
    results.screenshots.failure = await page.screenshot(path.join(outDir, '99-failure.png')).catch(() => '');
    fs.writeFileSync(path.join(outDir, 'real-startup-no-blank-command-summary.json'), JSON.stringify(results, null, 2));
    throw error;
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), output.stderr);
    await page.close().catch(() => {});
    const newLocks = Harness.playgroundLockFiles({ root }).filter((lock) => !initialLockFiles.has(lock.file));
    Harness.removeStalePlaygroundLocks({ root, knownFiles: newLocks.map((lock) => lock.file) });
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
