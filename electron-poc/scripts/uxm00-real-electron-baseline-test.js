const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_UXM00_EVIDENCE_DIR || path.join(root, 'test-output', 'uxm00-electron-baseline');
const basePort = Number(process.env.NH_UXM00_CDP_PORT || 9750);
const viewports = Object.freeze([
  Object.freeze({ id: 'full-1360x920', width: 1360, height: 920 }),
  Object.freeze({ id: 'compact-960x720', width: 960, height: 720 }),
]);
const { waitFor, delay } = Harness;

async function state(page) {
  return page.evalCheckedValue(`(() => {
    const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
    const cells = Array.from(document.querySelectorAll('.tile-cell'));
    const meaningful = cells.filter((cell) => (cell.dataset.glyph || ' ') !== ' ');
    const primaryActions = openDialogs.flatMap((dialog) => Array.from(dialog.querySelectorAll('button')).filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }).map((button) => ({ id: button.id, text: button.innerText, rect: button.getBoundingClientRect().toJSON() })));
    return {
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      browserWindow: { outerWidth, outerHeight },
      body: { scrollWidth: document.body.scrollWidth, scrollHeight: document.body.scrollHeight },
      dialogs: openDialogs.map((dialog) => dialog.id),
      active: { id: document.activeElement?.id || '', tag: document.activeElement?.tagName || '', text: document.activeElement?.innerText || '' },
      status: document.getElementById('status')?.innerText || '',
      messages: window.__nethackPromptTest?.messages?.().map((entry) => entry.text || String(entry)) || [],
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      running: Boolean(window.__nethackAutomation?.state?.().runningState?.running),
      seen: document.getElementById('shim-output')?.dataset?.seen || '',
      map: {
        count: cells.length,
        meaningful: meaningful.length,
        heroVisible: cells.some((cell) => cell.dataset.glyph === '@' || cell.dataset.tileId === 'hero-avatar'),
        floorVisible: cells.some((cell) => cell.dataset.glyph === '.' || cell.classList.contains('terrain-floor')),
      },
      primaryActions,
      liveRegions: Array.from(document.querySelectorAll('[aria-live]')).filter((element) => !element.hidden).map((element) => ({ id: element.id || '', live: element.getAttribute('aria-live'), text: element.innerText.slice(0, 160) })),
      ux: {
        version: window.NetHackUxRuntime?.version || '',
        settingsVersion: window.NetHackUxSettingsStore?.schemaVersion || 0,
        mounts: window.NetHackUxAppMounts?.inspectMounts?.(document) || [],
        diagnostics: window.NetHackUxRuntime?.runtime?.diagnostics?.() || [],
      },
    };
  })()`);
}

async function capture(page, qc, viewport, frame, currentState) {
  const id = `${viewport.id}-${frame}`;
  return page.screenshotEvidence(qc, id, {
    viewport: { width: viewport.width, height: viewport.height, zoomPercent: 100 },
    state: frame,
    viewSafeFormat: 'BMP',
    viewSafeScale: 0.25,
  });
}

async function runViewport(viewport, index, qc, results) {
  const staleLocksRemovedBeforeStart = Harness.removeStalePlaygroundLocks({ root });
  const initialLockFiles = new Set(Harness.playgroundLockFiles({ root }).map((lock) => lock.file));
  const page = await Harness.createElectronBrowserDriver({
    root,
    port: basePort + index,
    width: viewport.width,
    height: viewport.height,
  });
  const run = { viewport, staleLocksRemovedBeforeStart, screenshots: {}, checks: {} };
  results.runs[viewport.id] = run;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    run.startup = await waitFor(async () => {
      const value = await state(page);
      return value.dialogs.includes('startup-choice-dialog') ? value : null;
    }, 10000);
    run.screenshots.startup = await capture(page, qc, viewport, '01-startup-choice', run.startup);

    await page.click('#startup-new-game', { timeoutMs: 5000 });
    run.character = await waitFor(async () => {
      const value = await state(page);
      return value.dialogs.includes('character-dialog') ? value : null;
    }, 5000);
    run.screenshots.character = await capture(page, qc, viewport, '02-character-dialog', run.character);

    await page.setInputValue('#player-name', `UXM${viewport.width}`);
    await page.click('#confirm-character', { timeoutMs: 5000 });
    run.intro = await waitFor(async () => {
      const value = await state(page);
      return value.running && value.dialogs.includes('intro-dialog') && /shim_glyph|shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(value.seen) ? value : null;
    }, 25000);
    run.screenshots.intro = await capture(page, qc, viewport, '03-intro', run.intro);

    await page.click('#intro-continue', { timeoutMs: 5000 });
    run.map = await waitFor(async () => {
      const value = await state(page);
      return value.running && !value.dialogs.includes('intro-dialog') && value.map.meaningful > 0 ? value : null;
    }, 10000);
    await delay(400);
    await page.evalCheckedValue("document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs(); true");
    run.map = await state(page);
    run.screenshots.map = await capture(page, qc, viewport, '04-first-map', run.map);

    await page.pressKey('ArrowRight');
    await delay(250);
    run.afterMovement = await state(page);
    const combinedMessages = `${run.map.messages.join('\n')}\n${run.afterMovement.messages.join('\n')}`;
    run.checks = {
      startupChoiceVisible: run.startup.dialogs.includes('startup-choice-dialog'),
      startupPrimaryActionReachable: run.startup.primaryActions.some((action) => action.id === 'startup-new-game' && action.rect.bottom <= viewport.height),
      characterDialogVisible: run.character.dialogs.includes('character-dialog'),
      characterPrimaryActionReachable: run.character.primaryActions.some((action) => action.id === 'confirm-character' && action.rect.bottom <= viewport.height),
      introVisible: run.intro.dialogs.includes('intro-dialog'),
      introPrimaryActionReachable: run.intro.primaryActions.some((action) => action.id === 'intro-continue' && action.rect.bottom <= viewport.height),
      realGameStarted: run.map.running,
      mapHasHeroAndFloor: run.map.map.heroVisible && run.map.map.floorVisible,
      noHorizontalPageScroll: run.map.body.scrollWidth <= viewport.width,
      productionWindowMinimumEnforced: run.map.browserWindow.outerWidth >= 960 && run.map.browserWindow.outerHeight >= 720,
      noStartupUnknownBlankCommand: !/Unknown command ['’`]\s*['’`]|Unknown command '\s*'/i.test(combinedMessages),
      actualMovementSentOnce: run.afterMovement.sent === 'l',
      gameGridFocusedBeforeMovement: run.map.active.id === 'game-grid',
      uxRuntimeLoaded: run.map.ux.version === 'nethack-ux-runtime/v1',
      v2SettingsLoaded: run.map.ux.settingsVersion === 2,
      allMountsPresent: run.map.ux.mounts.length > 0 && run.map.ux.mounts.every((mount) => mount.present),
      noUxRegistrationFailure: !run.map.ux.diagnostics.some((entry) => /rejected|failed/.test(entry.type || '')),
    };
    run.diagnostic = await page.evalCheckedValue('window.netHackPOC.activeDiagnosticRun()', { awaitPromise: true }).catch((error) => ({ ok: false, error: error.message }));
    fs.writeFileSync(path.join(outDir, `${viewport.id}-diagnostic-summary.json`), `${JSON.stringify(run.diagnostic, null, 2)}\n`);
    const failed = Object.entries(run.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`${viewport.id} failed: ${failed.join(', ')}`);
  } catch (error) {
    run.failure = { message: error.message, stack: error.stack };
    run.failureState = await state(page).catch((stateError) => ({ error: stateError.message }));
    throw error;
  } finally {
    const output = page.output();
    run.output = {
      stdoutFile: path.join(outDir, `${viewport.id}-electron-stdout.log`),
      stderrFile: path.join(outDir, `${viewport.id}-electron-stderr.log`),
      stdoutBytes: Buffer.byteLength(output.stdout),
      stderrBytes: Buffer.byteLength(output.stderr),
    };
    fs.writeFileSync(run.output.stdoutFile, output.stdout);
    fs.writeFileSync(run.output.stderrFile, output.stderr);
    await page.close().catch(() => {});
    const newLocks = Harness.playgroundLockFiles({ root }).filter((lock) => !initialLockFiles.has(lock.file));
    Harness.removeStalePlaygroundLocks({ root, knownFiles: newLocks.map((lock) => lock.file) });
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir });
  const results = {
    plan: 'NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11',
    chunk: 'UXM-00',
    outDir,
    runs: {},
  };
  let failure;
  for (let index = 0; index < viewports.length; index += 1) {
    try { await runViewport(viewports[index], index, qc, results); }
    catch (error) { failure = error; break; }
  }
  results.screenshotManifest = qc.manifestFile;
  results.qc = Harness.screenshotQc.validateManifest(qc.manifestFile);
  fs.writeFileSync(path.join(outDir, 'uxm00-real-electron-baseline-summary.json'), `${JSON.stringify(results, null, 2)}\n`);
  const lines = [
    '# UXM-00 real Electron baseline',
    '',
    `Output: ${outDir}`,
    '',
    ...Object.entries(results.runs).flatMap(([id, run]) => [
      `## ${id}`,
      ...Object.entries(run.checks || {}).map(([name, ok]) => `- ${ok ? 'PASS' : 'FAIL'} ${name}`),
      '',
      ...Object.entries(run.screenshots || {}).map(([name, entry]) => `- ${name}: raw ${entry.raw.path}; view-safe ${entry.derivative.path}`),
      '',
    ]),
    `Screenshot QC manifest: ${qc.manifestFile}`,
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'uxm00-real-electron-baseline-summary.md'), lines.join('\n'));
  console.log(lines.join('\n'));
  if (failure) throw failure;
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
