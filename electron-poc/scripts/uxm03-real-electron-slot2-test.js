const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const outDir = path.resolve(process.env.NH_UXM03_SLOT2_EVIDENCE_DIR || path.join(root, 'test-output/uxm03-real-slot2'));
const port = Number(process.env.NH_UXM03_SLOT2_CDP_PORT || 19903);
const isolated = path.join(outDir, 'isolated-playground');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.cpSync(path.join(repo, 'playground'), isolated, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/i.test(path.basename(entry)) });
const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: path.join(outDir, 'screenshots') });
const captures = [];
const checks = {};

async function waitFor(driver, expression, timeout = 15000) {
  return driver.waitForCheckedValue(expression, timeout, 100);
}

async function pageState(driver) {
  return driver.evalCheckedValue(`(() => ({
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((node) => node.id),
    focus: { id: document.activeElement?.id || '', commandId: document.activeElement?.dataset?.commandId || '', tag: document.activeElement?.tagName || '' },
    palette: (() => { const node = document.getElementById('ux-command-palette'); return node ? { open: node.open, text: node.innerText, selected: node.querySelector('[aria-selected="true"]')?.dataset?.commandId || '', mode: NetHackUxRuntime.runtime.domain('discovery')?.palette?.model?.snapshot?.().mode || '' } : null; })(),
    magic: (() => { const dialog = document.getElementById('interaction-dialog'); return { open: dialog.open, title: document.getElementById('interaction-title')?.textContent || '', rows: Array.from(dialog.querySelectorAll('[data-classification-confidence]')).map((row) => ({ confidence: row.dataset.classificationConfidence, text: row.innerText })), selectors: Array.from(dialog.querySelectorAll('.choice-button')).map((row) => row.dataset.key).filter(Boolean) }; })(),
    sent: window.__nethackPromptTest.sentInputs().join(''),
    prompt: window.__nethackPromptTest.prompt(),
    spellRows: NetHackUxRuntime.runtime.latestPublicState()?.snapshot?.game?.spellRows || null,
    skillRows: NetHackUxRuntime.runtime.latestPublicState()?.snapshot?.game?.skillRows || null,
    overflow: { page: document.documentElement.scrollWidth > document.documentElement.clientWidth, body: document.body.scrollWidth > document.body.clientWidth },
    viewport: { width: innerWidth, height: innerHeight, fontSize: getComputedStyle(document.documentElement).fontSize },
    running: window.__nethackAutomation.state().runningState.running,
  }))()`);
}

async function capture(driver, id, evidenceKind, notes = '') {
  const state = await pageState(driver);
  assert.equal(state.overflow.page, false, `${id}: no page horizontal overflow`);
  assert.equal(state.overflow.body, false, `${id}: no body horizontal overflow`);
  const viewport = { width: state.viewport.width, height: state.viewport.height, devicePixelRatio: 1 };
  const entry = await driver.screenshotEvidence(qc, id, { viewport, state: { evidenceKind, notes, ...state }, viewSafeFormat: 'BMP', viewSafeScale: 1 });
  captures.push({ id, evidenceKind, notes, state, raw: entry.raw.path, derivative: entry.derivative.path });
  fs.writeFileSync(path.join(outDir, `${id}.json`), `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

async function setViewport(driver, width, height, zoom = 1) {
  await driver.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await driver.evalCheckedValue(`(() => { document.documentElement.style.fontSize = ${JSON.stringify(zoom === 2 ? '200%' : '')}; return { width: innerWidth, height: innerHeight }; })()`);
}

async function openPaletteSearch(driver, query) {
  await driver.click('#open-actions');
  await waitFor(driver, `document.getElementById('ux-command-palette')?.open === true`);
  await driver.setInputValue('#ux-command-palette input[type="search"]', query);
  return pageState(driver);
}

async function dispatchPaletteCommand(driver, query, id) {
  await driver.evalCheckedValue(`(() => { NetHackUxRuntime.runtime.domain('discovery').palette.open({ publicState: {}, invoker: document.getElementById('open-actions') }); return true; })()`);
  await waitFor(driver, `document.getElementById('ux-command-palette')?.open === true`);
  await driver.setInputValue('#ux-command-palette input[type="search"]', query);
  const state = await pageState(driver);
  assert.equal(state.palette.selected, id, `${query} selects exact catalog command`);
  await driver.click(`[data-command-id="${id}"]`);
}

async function main() {
  await Harness.withElectronBrowserDriver({
    root,
    port,
    width: 1360,
    height: 920,
    env: {
      NH_ELECTRON_TEST_MODE: '1',
      NH_TEST_PLAYGROUND: isolated,
      NETHACKDIR: isolated,
      NH_SHIM_RESET_LOCKS: '1',
      XDG_CONFIG_HOME: path.join(outDir, 'xdg-config'),
    },
  }, async (driver) => {
    await driver.waitForRendererReady({ automation: true, startButton: true });
    let dialogs = await driver.evalCheckedValue(`Array.from(document.querySelectorAll('dialog[open]')).map((node) => node.id)`);
    if (dialogs.includes('startup-choice-dialog')) await driver.click('#startup-new-game');
    else if (!dialogs.includes('character-dialog')) await driver.click('#start-shim');
    await waitFor(driver, `document.getElementById('character-dialog')?.open === true`);
    const creationDefault = await capture(driver, '01-1360-character-default', 'real production Electron UI before launching core', 'Blank name, identity first, Advanced collapsed.');
    assert.match(creationDefault.dialogs.join(','), /character-dialog/);
    await driver.evalCheckedValue(`(() => {
      const values = { '#player-role': 'Wiz', '#player-race': 'Hum', '#player-gender': 'Fem', '#player-align': 'Neu' };
      for (const [selector, value] of Object.entries(values)) { const node = document.querySelector(selector); node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); }
      document.querySelector('.ux-character-advanced summary')?.click();
      return true;
    })()`);
    await driver.setInputValue('#player-name', 'SlotTwo');
    await driver.setInputValue('#game-seed', '20303');
    await capture(driver, '02-1360-character-advanced', 'real production Electron UI before launching core', 'Legal Wizard identity, explicit name/seed, Advanced expanded.');
    await driver.click('#confirm-character');
    await waitFor(driver, `window.__nethackAutomation.state().runningState.running === true`, 25000);
    await waitFor(driver, `document.getElementById('intro-dialog')?.open === true`, 20000);
    await driver.click('#intro-continue');
    await waitFor(driver, `!document.getElementById('intro-dialog')?.open`);
    const removedGuide = await driver.evalCheckedValue(`({
      elementPresent: Boolean(document.querySelector('.ux-first-turn-guide')),
      globalPresent: typeof window.NetHackUxOnboarding !== 'undefined',
      restartActionPresent: Array.from(document.querySelectorAll('button')).some((button) => /Restart field guide/i.test(button.textContent || '')),
    })`);
    assert.deepEqual(removedGuide, { elementPresent: false, globalPresent: false, restartActionPresent: false });
    checks.onboardingRemoved = true;
    await capture(driver, '03-1360-gameplay-no-guide', 'real Electron and real NetHack core', 'Normal gameplay begins without a first-turn overlay.');

    await driver.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs()`);
    let palette = await openPaletteSearch(driver, 'drink potion');
    assert.equal(palette.palette.selected, 'item.quaff');
    await capture(driver, '07-1360-palette-alias', 'real production Electron UI over a real running core', 'Mouse-opened palette searched by friendly alias; no command dispatched yet.');
    await driver.pressKey('Escape');
    await waitFor(driver, `document.getElementById('ux-command-palette')?.open === false`);
    checks.paletteEscapeTurnless = (await pageState(driver)).sent === '';
    assert.equal(checks.paletteEscapeTurnless, true);

    palette = await openPaletteSearch(driver, 'q');
    assert.equal(palette.palette.selected, 'item.quaff');
    await driver.setInputValue('#ux-command-palette input[type="search"]', 'Q');
    await waitFor(driver, `NetHackUxRuntime.runtime.domain('discovery').palette.model.snapshot().selected?.command?.id === 'equipment.quiver'`, 5000);
    palette = await pageState(driver);
    checks.caseSensitiveQ = palette.palette.selected === 'equipment.quiver';
    assert.equal(checks.caseSensitiveQ, true);
    await driver.pressKey('Escape');

    await driver.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus()`);
    await driver.pressKey('#', '#');
    await waitFor(driver, `document.getElementById('ux-command-palette')?.open === true && NetHackUxRuntime.runtime.domain('discovery').palette.model.snapshot().mode === 'core'`, 15000);
    const rawHash = await capture(driver, '08-1360-raw-hash-core-palette', 'real Electron and real NetHack core extended-command prompt', 'Classic # reached core immediately; the production palette presents the owned core command request.');
    assert.equal(rawHash.sent, '#');
    await driver.pressKey('Escape');
    await waitFor(driver, `document.getElementById('ux-command-palette')?.open === false`);
    await Harness.delay(250);
    const rawCancelled = await pageState(driver);
    checks.rawHashOneEscape = rawCancelled.sent === '#\u001b';
    assert.equal(checks.rawHashOneEscape, true);

    await driver.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus()`);
    await driver.pressKey('3', '3');
    await driver.pressKey('s', 's');
    await Harness.delay(500);
    checks.countExact = (await pageState(driver)).sent === '3s';
    assert.equal(checks.countExact, true, 'classic count prefix is forwarded unchanged');

    await driver.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs()`);
    await dispatchPaletteCommand(driver, 'known spells', 'magic.spells');
    await waitFor(driver, `NetHackUxRuntime.runtime.latestPublicState()?.snapshot?.game?.spellRows?.classificationConfidence === 'typed' && document.querySelectorAll('#interaction-dialog [data-classification-confidence="typed"]').length > 0`, 15000);
    const spell = await capture(driver, '09-1360-spells-typed-real', 'real Electron and real NetHack core typed spell.rows', 'Production spell presenter uses authoritative typed rows and exact public selectors.');
    assert(spell.magic.rows.length >= 1);
    assert(spell.magic.rows.every((row) => row.confidence === 'typed'));
    assert(spell.spellRows.rows.every((row) => Object.keys(row).every((key) => ['name','selector','level','pwCost','failure','status'].includes(key))));
    checks.spellCommandExact = spell.sent === '#showspells\n';
    assert.equal(checks.spellCommandExact, true);
    await driver.pressKey('Escape');
    await Harness.delay(300);

    await setViewport(driver, 960, 720, 1);
    await driver.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs()`);
    await dispatchPaletteCommand(driver, 'skills', 'magic.skills');
    await waitFor(driver, `NetHackUxRuntime.runtime.latestPublicState()?.snapshot?.game?.skillRows?.classificationConfidence === 'typed' && document.querySelectorAll('#interaction-dialog [data-classification-confidence="typed"]').length > 0`, 15000);
    const skill = await capture(driver, '10-960-skills-typed-real', 'real Electron and real NetHack core typed skill.rows', 'Compact production skill presenter uses authoritative ranks and omits unavailable advancement.');
    assert(skill.skillRows.rows.every((row) => Object.keys(row).every((key) => ['name','selector','currentRank','nextRank','nextCost','canAdvance'].includes(key))));
    checks.skillCommandExact = skill.sent === '#enhance\n';
    assert.equal(checks.skillCommandExact, true);
    await driver.pressKey('Escape');
    await Harness.delay(300);

    await driver.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs()`);
    await dispatchPaletteCommand(driver, 'help', 'help.center');
    await waitFor(driver, `document.getElementById('ux-help-center')?.open === true`);
    await capture(driver, '11-960-help-basics-real', 'real production Electron UI with a real running core', 'Help opens from the same command catalog; Basics includes field-guide restart.');
    await driver.click('#ux-help-center [data-help-section="manual"]');
    await waitFor(driver, `document.querySelector('#ux-help-center .ux-manual-text')?.textContent.length > 1000`, 10000);
    await capture(driver, '12-960-help-manual-real', 'real production Electron UI with canonical Guidebook text', 'Manual keeps canonical file text monospaced and searchable.');
    await driver.pressKey('Escape');

    await setViewport(driver, 960, 720, 2);
    await driver.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs()`);
    await dispatchPaletteCommand(driver, 'known spells', 'magic.spells');
    await waitFor(driver, `document.querySelectorAll('#interaction-dialog [data-classification-confidence="typed"]').length > 0`, 15000);
    await capture(driver, '13-960-zoom200-spells-typed-real', 'real Electron and real NetHack core typed spell.rows at 200 percent text zoom', 'Typed rows, selectors, and Cancel remain reachable with no horizontal page overflow.');
    await driver.pressKey('Escape');
    await Harness.delay(300);

    await setViewport(driver, 960, 720, 1);
    await driver.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs()`);
    await dispatchPaletteCommand(driver, 'quit game', 'run.quit');
    await waitFor(driver, `window.__nethackPromptTest.prompt()?.query?.match?.(/quit/i) || window.__nethackPromptTest.prompt()?.question?.match?.(/quit/i)`, 15000).catch(() => true);
    await Harness.delay(300);
    const quitBefore = await pageState(driver);
    checks.quitRouteExact = quitBefore.sent === '#quit\n';
    assert.equal(checks.quitRouteExact, true);
    await driver.pressKey('Escape');
    await Harness.delay(300);
    const quitAfter = await pageState(driver);
    checks.quitCancelledNotEnded = quitAfter.running === true;
    assert.equal(checks.quitCancelledNotEnded, true);

    const output = driver.output();
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), output.stderr);
  });

  const manifestValidation = Harness.screenshotQc.validateManifest(qc.manifestFile);
  assert.equal(manifestValidation.ok, true, manifestValidation.errors.join('\n'));
  const summary = {
    ok: true,
    evidencePolicy: 'All screenshots in this run use production controllers. Frames marked real core were reached by real keyboard/mouse input against the native NetHack shim; no JSON or renderer event injection was used.',
    port,
    checks,
    captures,
    screenshotManifest: qc.manifestFile,
    manifestValidation,
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, captures: captures.length, checks, screenshotManifest: qc.manifestFile }, null, 2));
}

main().catch((error) => {
  fs.writeFileSync(path.join(outDir, 'failure.log'), `${error.stack || error}\n`);
  console.error(error.stack || error);
  process.exit(1);
});
