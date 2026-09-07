const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
const scenarioId = 'monster/fog-vapor-engulfment';
const viewport = { width: 1280, height: 860, devicePixelRatio: 1 };

function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`);
}

async function state(driver) {
  return driver.evalCheckedValue(`(() => {
    const automation = window.__nethackAutomation?.state?.() || {};
    const cells = Array.from(document.querySelectorAll('.tile-cell')).map((cell) => ({
      x: Number(cell.dataset.mapX),
      y: Number(cell.dataset.mapY),
      glyph: Number(cell.dataset.glyphNumber),
      char: cell.dataset.glyph || '',
      tileId: cell.dataset.tileId || '',
      semanticKind: cell.dataset.semanticKind || '',
      semanticName: cell.dataset.semanticName || '',
      aria: cell.getAttribute('aria-label') || '',
    }));
    const shimEvents = (window.__nethackPromptTest?.shimEvents?.() || [])
      .map((entry) => entry?.event || entry?.raw || entry)
      .filter(Boolean);
    const scenarioFailure = shimEvents.find((event) => event.name === 'bridge_test_scenario_failed');
    return {
      running: Boolean(automation.runningState?.running),
      cursor: automation.cursor || null,
      prompt: window.__nethackPromptTest?.prompt?.() || null,
      openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      commandPromptCount: shimEvents.filter((event) => event?.name === 'bridge_command_prompt').length,
      commandPromptId: shimEvents.filter((event) => event?.name === 'bridge_command_prompt').at(-1)?.requestId || '',
      cells,
      fog: cells.filter((cell) => cell.semanticName === 'fog cloud'),
      vapor: cells.filter((cell) => cell.tileId === 'cloud' || cell.semanticName === 'cloud'),
      engulfment: cells.filter((cell) => cell.semanticKind === 'engulfment'),
      body: document.body.innerText,
      seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
      scenarioFailure: scenarioFailure ? { id: scenarioFailure.id || '', message: scenarioFailure.message || 'native scenario failed without a message' } : null,
      shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-12000),
    };
  })()`);
}

async function sendGameKey(driver, keys) {
  for (const key of keys) {
    await driver.evalCheckedValue(`window.__nethackAutomation.sendKeycode(${JSON.stringify(key.charCodeAt(0))})`);
    await Harness.delay(90);
  }
}
async function sendNativeTurn(driver, key) {
  const before = await state(driver);
  await sendGameKey(driver, key);
  return Harness.waitFor(async () => {
    const current = await state(driver);
    const entered = !before.engulfment.length && current.engulfment.length === 8;
    const exited = before.engulfment.length > 0 && !current.engulfment.length;
    return entered || exited || (current.commandPromptId && current.commandPromptId !== before.commandPromptId) ? current : null;
  }, 5000);
}


async function capture(driver, qc, name, stateName) {
  return driver.screenshotEvidence(qc, name, { classification: 'synthetic-fixture', viewport, state: stateName, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
}

async function walkFogRoom(driver, qc) {
  const route = [
    ['l'], ['l', '06-through-vapor-bank'],
    ['k'], ['h'], ['h', '07-north-vapor-row'],
    ['j'], ['j'], ['l'], ['l', '08-south-vapor-row'],
    ['k'], ['l', '09-outside-vapor-bank'],
    ['h'], ['h'], ['h'], ['h', '10-returned-to-room-entry'],
  ];
  const deltas = { h: [-1, 0], l: [1, 0], k: [0, -1], j: [0, 1] };
  const steps = [];
  for (const [key, screenshot] of route) {
    const before = await state(driver);
    const [dx, dy] = deltas[key];
    const expected = { x: before.cursor.x + dx, y: before.cursor.y + dy };
    const priorHero = before.cells.find(cell => cell.x === before.cursor.x && cell.y === before.cursor.y);
    await sendGameKey(driver, key);
    let current = await Harness.waitFor(async () => {
      const next = await state(driver);
      return (next.cursor?.x === expected.x && next.cursor?.y === expected.y) || /step into that vapor cloud/i.test(next.prompt?.query || '') ? next : null;
    }, 5000);
    if (current.cursor?.x !== expected.x || current.cursor?.y !== expected.y) {
      await sendGameKey(driver, 'y');
      current = await Harness.waitFor(async () => {
        const next = await state(driver);
        return next.cursor?.x === expected.x && next.cursor?.y === expected.y ? next : null;
      }, 5000);
    }
    const hero = current.cells.find(cell => cell.x === expected.x && cell.y === expected.y);
    assert('walking keeps the native hero avatar visible', /avatar$/.test(hero?.tileId || ''), JSON.stringify({ expected, hero }));
    assert('walking leaves exactly one hero avatar', current.cells.filter(cell => /avatar$/.test(cell.tileId)).length === 1);
    if (priorHero?.semanticName === 'cloud') {
      const departed = current.cells.find(cell => cell.x === priorHero.x && cell.y === priorHero.y);
      assert('departing vapor preserves the cloud tile', departed?.semanticName === 'cloud' && departed.tileId === 'cloud', JSON.stringify(departed));
    }
    steps.push({ key, from: before.cursor, to: current.cursor, terrain: hero.semanticName, avatar: hero.tileId });
    if (screenshot) await capture(driver, qc, screenshot, screenshot);
  }
  return steps;
}

async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  const driver = await Harness.createElectronBrowserDriver({
    root,
    ...viewport,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_SHIM_RESET_LOCKS: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none',
      NETHACK_SEED: '640226',
    },
  });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: driver.outputDir, runIdentity: driver.outputIdentity, manifestFile: path.join(driver.outputDir, 'evidence-approval.json') });
  const outcomes = [];
  let scenarioError;
  const passed = (id) => outcomes.push({ id, status: 'passed', details: '' });
  try {
    await driver.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await driver.startDefaultGame({ timeoutMs: 25000, playerName: `FogWalk${process.pid}` });
    await Harness.waitFor(async () => driver.evalCheckedValue("document.getElementById('intro-dialog')?.open === true"), 10000);
    await driver.dismissIntroDialogs();
    const before = await Harness.waitFor(async () => {
      const current = await state(driver);
      if (current.scenarioFailure) throw new Error(`${current.scenarioFailure.id}: ${current.scenarioFailure.message}`);
      return current.running && !current.openDialogs.length
        && /bridge_test_scenario_loaded/.test(`${current.seenShim}\n${current.shimTail}`)
        && /bridge_command_prompt/.test(current.seenShim)
        && current.vapor.length ? current : null;
    }, 15000);
    assert('native scenario marker arrives', /bridge_test_scenario_loaded/.test(`${before.seenShim}\n${before.shimTail}`));
    assert('native harmless vapor region uses cloud terrain art', before.vapor.some((cell) => cell.tileId === 'cloud'), JSON.stringify(before.vapor));
    passed('native-scenario-loaded');
    passed('native-vapor-visible-before-approach');
    await capture(driver, qc, '01-before-fog', 'before-fog');

    const startX = before.cursor.x;
    await sendGameKey(driver, 'l');
    const entry = await Harness.waitFor(async () => {
      const current = await state(driver);
      return current.cursor?.x === startX + 1 || /step into that vapor cloud/i.test(current.prompt?.query || current.body) ? current : null;
    }, 5000);
    if (entry.cursor?.x !== startX + 1) {
      assert('native vapor asks for hazard confirmation', /step into that vapor cloud/i.test(entry.prompt?.query || entry.body), JSON.stringify(entry.prompt));
      passed('native-vapor-hazard-confirmation');
      await capture(driver, qc, '02-vapor-confirmation', 'vapor-confirmation');
      await sendGameKey(driver, 'y');
    }
    const inside = await Harness.waitFor(async () => {
      const current = await state(driver);
      return current.cursor?.x === startX + 1 ? current : null;
    }, 5000);
    assert('hero walks into the native vapor square', inside.cursor.x === startX + 1, JSON.stringify({ before: before.cursor, inside: inside.cursor }));
    passed('hero-walks-into-native-vapor');
    await capture(driver, qc, '03-inside-vapor', 'inside-vapor');

    let engulfed;
    for (let turn = 0; turn < 260 && !engulfed; turn += 1) {
      const current = await sendNativeTurn(driver, 'm.');
      if (current.engulfment.length === 8) engulfed = current;
    }
    assert('fog cloud engulfs hero through native monster turns', Boolean(engulfed), JSON.stringify(await state(driver)));
    const engulfmentGlyphs = [...new Set(engulfed.engulfment.map((cell) => cell.glyph))].sort((a, b) => a - b);
    assert('native engulfment exposes one contiguous eight-glyph boundary set', engulfmentGlyphs.length === 8 && engulfmentGlyphs[7] - engulfmentGlyphs[0] === 7, JSON.stringify(engulfed.engulfment));
    assert('all fog engulfment cells resolve to fog cloud art', engulfed.engulfment.every((cell) => cell.tileId === 'fog-cloud' && cell.semanticName === 'fog cloud'), JSON.stringify(engulfed.engulfment));
    passed('native-fog-engulfment-reached');
    passed('engulfment-glyph-boundaries-and-identity');
    await capture(driver, qc, '04-engulfed-by-fog-cloud', 'engulfed-by-fog-cloud');

    let after;
    for (let turn = 0; turn < 80 && !after; turn += 1) {
      const current = await sendNativeTurn(driver, 'l');
      if (!current.engulfment.length) after = current;
    }
    assert('hero exits or defeats the native engulfment', Boolean(after), JSON.stringify(await state(driver)));
    passed('native-engulfment-ended');
    await capture(driver, qc, '05-after-engulfment', 'after-engulfment');
    const walking = await walkFogRoom(driver, qc);
    passed('walked-fifteen-native-steps-through-fog-room-and-back');
    passed('hero-visible-and-vapor-preserved-throughout-walk');
    fs.writeFileSync(path.join(driver.outputDir, 'fog-vapor-engulfment-state.json'), JSON.stringify({ scenarioId, seed: '640226', before, inside, engulfed, after, walking }, null, 2));
  } catch (error) {
    const failureState = await state(driver).catch((stateError) => ({ stateError: String(stateError?.stack || stateError) }));
    fs.writeFileSync(path.join(driver.outputDir, 'fog-vapor-engulfment-failure-state.json'), JSON.stringify(failureState, null, 2));
    await capture(driver, qc, 'debug-fog-vapor-engulfment-failure', 'failure').catch(() => undefined);
    const failureSummary = failureState.stateError ? failureState : {
      cursor: failureState.cursor,
      prompt: failureState.prompt,
      openDialogs: failureState.openDialogs,
      commandPromptCount: failureState.commandPromptCount,
      fog: failureState.fog,
      vapor: failureState.vapor,
      engulfment: failureState.engulfment,
      visibleCells: failureState.cells?.filter((cell) => cell.char && cell.char !== ' '),
      messageTail: failureState.body?.slice(-2000),
    };
    scenarioError = new Error(`${error?.stack || error}\nNative state: ${JSON.stringify(failureSummary)}`);
    outcomes.push({ id: 'scenario-completed', status: 'failed', details: String(error?.message || error) });
  } finally {
    if (!scenarioError) outcomes.push({ id: 'scenario-completed', status: 'passed', details: '' });
    await driver.close().catch((error) => { if (!scenarioError) scenarioError = error; });
    qc.recordAssertions(outcomes);
    qc.recordLog({ id: 'electron-stdout', path: driver.logs.stdout, classification: 'electron-stdout' });
    qc.recordLog({ id: 'electron-stderr', path: driver.logs.stderr, classification: 'electron-stderr' });
    const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: driver.outputIdentity, requireApproval: false });
    if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
    EvidenceApproval.writeEvidenceReport(qc.manifestFile);
    console.log(`${scriptName}: CAPTURED ${driver.outputIdentity} ${qc.manifestFile}`);
  }
  if (scenarioError) throw scenarioError;
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
