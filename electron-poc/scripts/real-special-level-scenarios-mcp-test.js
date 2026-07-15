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

const cases = [
  { id: 'special/sokoban-boulder-pit', name: 'sokoban', seed: '424242' },
  { id: 'special/medusa-reflection', name: 'medusa', seed: '424242' },
  { id: 'endgame/astral-offering', name: 'astral', seed: '424242' },
];

function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

async function state(driver) {
  return driver.evalCheckedValue(`(() => {
    const cells = Array.from(document.querySelectorAll('.tile-cell')).map((el) => ({
      x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '',
      semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '',
      backgroundSemanticKind: el.dataset.backgroundSemanticKind || '', backgroundSemanticName: el.dataset.backgroundSemanticName || '',
      objectLayerSemanticName: el.dataset.objectLayerSemanticName || '', aria: el.getAttribute('aria-label') || '',
    }));
    const hero = cells.find((cell) => /^(hero|player)$/.test(cell.semanticKind))
      || cells.find((cell) => cell.glyph === '@' && /hero|player/i.test(cell.aria));
    const nearby = hero ? cells.filter((cell) => Math.max(Math.abs(cell.x - hero.x), Math.abs(cell.y - hero.y)) <= 8) : [];
    return {
      running: window.__nethackAutomation?.state?.().runningState?.running || false,
      cells, hero, nearby,
      actions: window.__nethackPromptTest?.contextActions?.() || null,
      inventory: window.__nethackPromptTest?.inventory?.() || null,
      messages: window.__nethackPromptTest?.messages?.().slice(-20).map((message) => message.text || String(message)) || [],
      body: document.body.innerText,
      seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
      shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-12000),
    };
  })()`);
}

function cellText(cell) {
  return [cell?.glyph, cell?.semanticKind, cell?.semanticName, cell?.backgroundSemanticKind,
    cell?.backgroundSemanticName, cell?.objectLayerSemanticName, cell?.aria].join(' ');
}
async function sendGameKey(driver, key) {
  await driver.evalCheckedValue(`window.__nethackAutomation.sendKeycode(${key.charCodeAt(0)})`);
}

async function clickButtonContaining(driver, pattern) {
  const source = pattern.source;
  return driver.evalCheckedValue(`(() => {
    const match = new RegExp(${JSON.stringify(source)}, 'i');
    const button = Array.from(document.querySelectorAll('button')).find((entry) => match.test(entry.innerText || entry.textContent || ''));
    if (!button) return false;
    button.click();
    return true;
  })()`);
}


async function runCase(testCase, index) {
  const driver = await Harness.createElectronBrowserDriver({
    root,
    width: 1360,
    height: 920,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_SHIM_RESET_LOCKS: '1',
      NH_TEST_SCENARIO_ID: testCase.id,
      NETHACK_SEED: testCase.seed,
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
  });
  outDir = driver.outputDir;
  const qc = createEvidence(driver);
  let scenarioError;
  try {
    await driver.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await driver.startDefaultGame({ timeoutMs: 25000, playerName: `Late${index + 1}` });
    await Harness.waitFor(async () => (await state(driver)).running, 20000);
    await driver.dismissIntroDialogs();
    const ready = await Harness.waitFor(async () => {
      const current = await state(driver);
      if (/bridge_test_scenario_failed/.test(`${current.seenShim}\n${current.shimTail}`)) throw new Error(current.shimTail);
      return current.hero && /bridge_test_scenario_loaded/.test(`${current.seenShim}\n${current.shimTail}`) ? current : null;
    }, 15000);
    const screenshot = await driver.screenshotEvidence(qc, `${index + 1}-${testCase.name}`, { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: testCase.name });
    let inventoryScreenshot = '';
    let resultScreenshot = '';
    let outcome = '';

    if (testCase.name === 'sokoban') {
      const boulder = ready.nearby.find((cell) => /boulder/i.test(cellText(cell)));
      const hole = ready.cells.find((cell) => /hole/i.test(cellText(cell)));
      assert('authentic Sokoban scene places hero near a boulder', boulder, JSON.stringify(ready.nearby));
      assert('authentic Sokoban level contains a public hole', hole, JSON.stringify(ready.cells));
    } else if (testCase.name === 'medusa') {
      const medusa = ready.nearby.find((cell) => /Medusa/i.test(cellText(cell)));
      assert('authentic Medusa scene places hero near Medusa', medusa, JSON.stringify(ready.nearby));
      let gazeState = null;
      for (let turn = 0; turn < 15 && !gazeState; turn += 1) {
        await driver.click('[data-context-action-id="wait"]');
        gazeState = await Harness.waitFor(async () => {
          const current = await state(driver);
          return /gaze is reflected|is turned to stone/i.test(current.messages.join('\n')) ? current : null;
        }, 1200).catch(() => null);
      }
      assert('live Medusa turn exercises intrinsic reflection', gazeState, JSON.stringify((await state(driver)).messages));
      outcome = gazeState.messages.join('\n');
      resultScreenshot = await driver.screenshotEvidence(qc, `${index + 1}-${testCase.name}-gaze-result`, { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: `${testCase.name}-gaze-result` });
    } else {
      const heroSurface = cellText(ready.hero);
      const actionText = (ready.actions?.buttons || []).map((button) => `${button.id}:${button.text}`).join('\n');
      assert('Astral hero stands on the matching altar', /altar/i.test(heroSurface), JSON.stringify(ready.hero));
      await driver.click('#inventory-equipment-button');
      const inventoryState = await Harness.waitFor(async () => {
        const current = await state(driver);
        return /Amulet of Yendor/i.test(current.body) ? current : null;
      }, 10000);
      assert('Astral inventory contains the real Amulet of Yendor', /Amulet of Yendor/i.test(inventoryState.body), inventoryState.body);
      inventoryScreenshot = await driver.screenshotEvidence(qc, `${index + 1}-${testCase.name}-inventory`, { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: `${testCase.name}-inventory` });
      assert('Astral context exposes the offering workflow', /offer/i.test(actionText), actionText);
      await driver.click('#interaction-cancel');
      await Harness.waitFor(async () => !/Equipment & inventory/i.test((await state(driver)).body), 10000);
      for (const key of '#offer\n') await sendGameKey(driver, key);
      const offered = await Harness.waitFor(async () => {
        const current = await state(driver);
        if (/ascended|demigoddess|congratulations/i.test(current.body)) return current;
        if (/Amulet of Yendor/i.test(current.body)) await clickButtonContaining(driver, /Amulet of Yendor/);
        return null;
      }, 20000);
      assert('offering the real Amulet completes ascension', /ascended|demigoddess|congratulations/i.test(offered.body), offered.body);
      outcome = offered.body;
      resultScreenshot = await driver.screenshotEvidence(qc, `${index + 1}-${testCase.name}-victory`, { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: `${testCase.name}-victory` });
    }
    assert(`${testCase.name} UI has no fixture failure`, !/bridge_test_scenario_failed|Program in disorder|Please report these messages/i.test(`${ready.shimTail}\n${ready.body}`), ready.shimTail);
    fs.writeFileSync(path.join(outDir, `${index + 1}-${testCase.name}-state.json`), JSON.stringify(ready, null, 2));
    return { ...testCase, screenshot, inventoryScreenshot, resultScreenshot, outcome, hero: ready.hero, actions: (ready.actions?.buttons || []).map((button) => ({ id: button.id, text: button.text })) };
  } catch (error) {
    scenarioError = error;
  } finally {
    await finishEvidence(driver, qc, scenarioError);
  }
}

async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  for (let index = 0; index < cases.length; index += 1) await runCase(cases[index], index);
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
