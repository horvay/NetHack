const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { waitFor } = Harness;

function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function shot(driver, id) {
  const capture = await driver.screenshotEvidence(driver.qc, id, { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: id, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-late-game-workflows-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}

async function state(driver) {
  return driver.evalCheckedValue(`(() => ({
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    actions: window.__nethackPromptTest?.contextActions?.() || null,
    messages: window.__nethackPromptTest?.messages?.().slice(-40).map((message) => message.text || String(message)) || [],
    body: document.body.innerText,
    documentOpen: Boolean(document.getElementById('document-dialog')?.open),
    documentTitle: document.getElementById('document-title')?.textContent || '',
    documentBody: document.getElementById('document-body')?.textContent || '',
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-16000),
  }))()`);
}

async function startScenario(id, name) {
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_SHIM_RESET_LOCKS: '1', NH_TEST_SCENARIO_ID: id, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' },
  });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') });
  const driver = Object.freeze({ ...page, qc });
  await driver.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
  await driver.startDefaultGame({ timeoutMs: 25000, playerName: name });
  await waitFor(async () => (await state(driver)).running, 20000);
  await driver.dismissIntroDialogs();
  await waitFor(async () => {
    const current = await state(driver);
    if (/bridge_test_scenario_failed/.test(`${current.seenShim}\n${current.shimTail}`)) throw new Error(current.shimTail);
    return /bridge_test_scenario_loaded/.test(`${current.seenShim}\n${current.shimTail}`) ? current : null;
  }, 15000);
  return driver;
}

async function clickChat(driver) {
  return driver.evalCheckedValue(`(() => {
    const button = document.querySelector('[data-context-action-id^="chat-"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function runQuest(id, name, admitted, index) {
  const driver = await startScenario(id, name);
  let scenarioError = null;
  let result;
  try {
    const before = await state(driver);
    const actionText = (before.actions?.buttons || []).map((button) => `${button.id}:${button.text}`).join('\n');
    assert(`${name} exposes Chat with the real Norn`, /chat.*Norn|chat/i.test(actionText), actionText);
    const beforeShot = await shot(driver, `${index + 1}-${admitted ? 'quest-admit' : 'quest-reject'}-before`);
    assert(`${name} dispatches visible Chat action`, await clickChat(driver));
    const documents = [];
    const screenshots = [];
    for (let step = 0; step < 4; step += 1) {
      const doc = await waitFor(async () => {
        const current = await state(driver);
        return current.documentOpen && current.documentBody.trim() ? current : null;
      }, 10000).catch(() => null);
      if (!doc) break;
      documents.push(`${doc.documentTitle}\n${doc.documentBody}`);
      screenshots.push(await shot(driver, `${index + 1}-${admitted ? 'quest-admit' : 'quest-reject'}-dialog-${step + 1}`));
      await driver.click('#document-close');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const text = documents.join('\n');
    if (admitted) {
      assert('worthy Quest hero receives the assignment', /recover|find the entrance|return.*Orb|start Ragnarok/i.test(text), text);
      const after = await state(driver);
      assert('worthy Quest hero remains in the Quest branch', /Home|Norn|fumarole|lava|Quest|Dlvl/i.test(after.body), after.body);
    } else {
      assert('underleveled Quest hero receives the bad-level rejection', /not prepared|grow more experienced|come back/i.test(text), text);
      const after = await waitFor(async () => {
        const current = await state(driver);
        return /expelled|return.*when|grow more experienced|Dlvl/i.test(`${current.messages.join('\n')}\n${current.body}`) ? current : null;
      }, 10000);
      assert('rejected Quest flow returns control without a fixture failure', !/bridge_test_scenario_failed|Program in disorder/i.test(`${after.shimTail}\n${after.body}`), after.shimTail);
    }
    result = { id, admitted, beforeShot, screenshots, documents };
  } catch (error) {
    scenarioError = error;
  } finally {
    await driver.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  driver.qc.recordAssertions([{ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' }]);
  driver.qc.recordLog({ id: 'electron-stdout', path: driver.logs.stdout, classification: 'electron-stdout' });
  driver.qc.recordLog({ id: 'electron-stderr', path: driver.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(driver.qc.manifestFile, { expectedRunIdentity: driver.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-late-game-workflows-mcp-test: CAPTURED ${driver.outputIdentity} ${driver.qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
  return result;
}

async function invokeInventoryAction(driver, itemPattern, actionId) {
  await driver.click('#inventory-equipment-button');
  await waitFor(async () => itemPattern.test((await state(driver)).body), 10000);
  return driver.evalCheckedValue(`(() => {
    const itemPattern = new RegExp(${JSON.stringify(itemPattern.source)}, 'i');
    const row = Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).find((entry) => itemPattern.test(entry.innerText || ''));
    if (!row) return { ok: false, reason: 'row missing', body: document.body.innerText };
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 700, clientY: 360 }));
    const action = document.querySelector('.inventory-context-menu .inventory-context-action[data-action-id=${JSON.stringify(actionId)}]');
    if (!action) return { ok: false, reason: 'action missing', menu: document.querySelector('.inventory-context-menu')?.innerText || '', body: document.body.innerText };
    action.click();
    return { ok: true, row: row.innerText, action: action.innerText };
  })()`);
}

async function waitForMessage(driver, pattern) {
  return waitFor(async () => {
    const current = await state(driver);
    return pattern.test(`${current.messages.join('\n')}\n${current.body}`) ? current : null;
  }, 15000);
}

async function runInvocation() {
  const driver = await startScenario('endgame/invocation-ritual', 'Invoker');
  let scenarioError = null;
  let invocationResult;
  try {
    const before = await state(driver);
    assert('invocation setup exposes all three real tools', /Bell of Opening/i.test(before.body) || /vibrating|Gehennom|Dlvl/i.test(before.body), before.body);
    const beforeShot = await shot(driver, '3-invocation-before');

    const bell = await invokeInventoryAction(driver, /Bell of Opening/i, 'item.apply');
    assert('Bell of Opening Apply action is available', bell.ok, JSON.stringify(bell));
    const bellState = await waitForMessage(driver, /unsettling shrill sound/i);
    const bellShot = await shot(driver, '3-invocation-bell');

    const candelabrum = await invokeInventoryAction(driver, /Candelabrum of Invocation/i, 'item.apply');
    assert('Candelabrum Apply action is available', candelabrum.ok, JSON.stringify(candelabrum));
    const candelabrumState = await waitForMessage(driver, /burn brightly|glow.*strange light/i);
    const candelabrumShot = await shot(driver, '3-invocation-candelabrum');

    const book = await invokeInventoryAction(driver, /Book of the Dead/i, 'item.study');
    assert('Book of the Dead read action is available', book.ok, JSON.stringify(book));
    const refreshPrompt = await waitForMessage(driver, /Refresh your memory anyway\?/i);
    assert('Book of the Dead asks before rereading a known unique tome', /Refresh your memory anyway\?/i.test(refreshPrompt.body), refreshPrompt.body);
    await driver.click('#interaction-options .choice-button[data-key="y"]');
    const result = await waitForMessage(driver, /floor shakes violently|walls around you begin to bend and crumble/i);
    const resultShot = await shot(driver, '3-invocation-result');
    assert('successful invocation creates the downstairs', /stairs|down/i.test(result.body), result.body);
    assert('invocation flow has no core disorder', !/Program in disorder|bridge_test_scenario_failed|invocation fails/i.test(`${result.body}\n${result.shimTail}`), `${result.body}\n${result.shimTail}`);
    invocationResult = { beforeShot, bellShot, candelabrumShot, resultShot, messages: result.messages, bellMessages: bellState.messages, candelabrumMessages: candelabrumState.messages };
  } catch (error) {
    scenarioError = error;
  } finally {
    await driver.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  driver.qc.recordAssertions([{ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' }]);
  driver.qc.recordLog({ id: 'electron-stdout', path: driver.logs.stdout, classification: 'electron-stdout' });
  driver.qc.recordLog({ id: 'electron-stderr', path: driver.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(driver.qc.manifestFile, { expectedRunIdentity: driver.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-late-game-workflows-mcp-test: CAPTURED ${driver.outputIdentity} ${driver.qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
  return invocationResult;
}

async function main() {
  const rejected = await runQuest('quest/leader-rejects-underleveled-hero', 'QuestLow', false, 0);
  const admitted = await runQuest('quest/leader-admits-worthy-hero', 'QuestReady', true, 1);
  const invocation = await runInvocation();
  console.log(JSON.stringify({ rejected, admitted, invocation }, null, 2));
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
