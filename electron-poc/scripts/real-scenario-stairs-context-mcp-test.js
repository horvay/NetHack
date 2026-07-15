const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');



const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
let outDir, evidencePage, evidenceQc

const width = 1360;
const height = 920;

const cases = [
  { id: 'stairs/down-on-hero', expectedButtonId: 'descend', expectedLabel: 'Go down stairs', forbiddenLabel: 'Go up stairs', expectedTerrainAction: 'stairsDown', expectedTerrain: 'stairs.down', expectedOutcome: /You descend the stairs\.|Dlvl\s*:?[\s\n]*2/i, screenshotPrefix: 'down-stairs' },
  { id: 'stairs/up-on-hero', expectedButtonId: 'ascend', expectedLabel: 'Go up stairs', forbiddenLabel: 'Go down stairs', expectedTerrainAction: 'stairsUp', expectedTerrain: 'stairs.up', expectedOutcome: /leaving the dungeon requires the visible NetHack confirmation flow/i, screenshotPrefix: 'up-stairs' },
  { id: 'stairs/floor-on-hero', absentLabels: ['Go down stairs', 'Go up stairs', 'Go down ladder', 'Go up ladder'], screenshotPrefix: 'non-stair-floor' },
  { id: 'stairs/ladder-up-on-hero', expectedButtonId: 'ascend-ladder', expectedLabel: 'Go up ladder', forbiddenLabel: 'Go down ladder', expectedTerrainAction: 'ladderUp', expectedTerrain: 'ladder.up', expectedOutcome: /leaving the dungeon requires the visible NetHack confirmation flow/i, screenshotPrefix: 'up-ladder' },
];





async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function screenshot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, devicePixelRatio: 1 }, state: path.basename(name, path.extname(name)) }); }
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
async function state(cdp) {
  return evalExpr(cdp, `(() => {
    const current = window.__nethackPromptTest?.currentCell?.() || null;
    return {
      running: window.__nethackAutomation?.state?.().runningState?.running || false,
      seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
      shim: document.getElementById('shim-output')?.innerText || '',
      body: document.body.innerText,
      actions: window.__nethackPromptTest?.contextActions?.(),
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [],
      sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
      currentCell: current,
      cursorCell: (() => {
        const el = document.querySelector('#game-grid .tile-cell.cursor');
        return el ? {
          text: el.textContent || '',
          glyph: el.dataset.glyph || '',
          tileId: el.dataset.tileId || '',
          semanticKind: el.dataset.semanticKind || '',
          semanticName: el.dataset.semanticName || '',
          backgroundSemanticKind: el.dataset.backgroundSemanticKind || '',
          backgroundSemanticName: el.dataset.backgroundSemanticName || '',
          aria: el.getAttribute('aria-label') || ''
        } : null;
      })()
    };
  })()`);
}
async function startGame(cdp) {
  if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game');
  else await click(cdp, '#start-shim');
  await Harness.waitFor(async () => evalExpr(cdp, `Boolean(document.getElementById('character-dialog')?.open && document.getElementById('confirm-character'))`), 7000);
  await click(cdp, '#confirm-character');
  await Harness.waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
}

async function runCase(testCase, index) {
  const caseDirName = testCase.id.replace(/[\/]/g, '--');
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_SHIM_RESET_LOCKS: '1',
      NH_TEST_SCENARIO_ID: testCase.id,
      NETHACK_SEED: '424242',
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
  });
  outDir = page.outputDir;
  evidencePage = page;
  evidenceQc = createEvidence(page);
  const cdp = page.cdp;
  const result = { id: testCase.id, runIdentity: page.outputIdentity, outputDir: outDir, screenshots: {}, checks: {} };
  let scenarioError;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true });
    await startGame(cdp).catch(async (error) => {
      const startupDebug = await evalExpr(cdp, `(() => ({
        startButton: (() => { const el = document.getElementById('start-shim'); const r = el?.getBoundingClientRect(); return el ? { disabled: el.disabled, text: el.textContent, rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null } : null; })(),
        startupChoiceOpen: Boolean(document.getElementById('startup-choice-dialog')?.open),
        characterOpen: Boolean(document.getElementById('character-dialog')?.open),
        body: document.body.innerText
      }))()`).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, `${caseDirName}-startup-timeout-debug.json`), JSON.stringify(startupDebug, null, 2));
      await screenshot(cdp, `${testCase.screenshotPrefix}-startup-timeout.png`).catch(() => undefined);
      throw error;
    });
    const loaded = await Harness.waitFor(async () => {
      const s = await state(cdp);
      if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim);
      return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null;
    }, 10000);
    assert(`${testCase.id} loaded`, /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));

    const ready = await Harness.waitFor(async () => {
      const s = await state(cdp);
      const text = s.actions?.text || '';
      if (testCase.expectedLabel) return text.includes(testCase.expectedLabel) ? s : null;
      return /Search/.test(text) && !/Go down stairs|Go up stairs/.test(text) ? s : null;
    }, 7000).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, `${caseDirName}-timeout-debug.json`), JSON.stringify(debug, null, 2));
      await screenshot(cdp, `${testCase.screenshotPrefix}-timeout.png`).catch(() => undefined);
      throw error;
    });
    result.ready = ready;
    result.screenshots.ready = await screenshot(cdp, `${testCase.screenshotPrefix}-01-context.png`);

    if (testCase.expectedLabel) {
      const buttons = ready.actions?.buttons || [];
      result.checks.expectedButtonVisible = buttons.some((button) => button.id === testCase.expectedButtonId && button.text === testCase.expectedLabel);
      result.checks.wrongStairDirectionAbsent = !buttons.some((button) => button.text === testCase.forbiddenLabel);
      assert(`${testCase.id} shows expected stair action`, result.checks.expectedButtonVisible, JSON.stringify(ready.actions));
      assert(`${testCase.id} omits wrong stair action`, result.checks.wrongStairDirectionAbsent, JSON.stringify(ready.actions));
      await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
      await click(cdp, `#context-action-bar button[data-context-action-id=${JSON.stringify(testCase.expectedButtonId)}]`);
      await Harness.delay(400);
      const afterClick = await state(cdp);
      result.afterClick = afterClick;
      result.screenshots.afterClick = await screenshot(cdp, `${testCase.screenshotPrefix}-02-after-click.png`);
      result.checks.routesDirectTerrainAction = afterClick.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action' && command.payload?.action === testCase.expectedTerrainAction && command.payload?.terrain === testCase.expectedTerrain);
      result.checks.noRawStairKey = afterClick.sent === '';
      assert(`${testCase.id} routes direct terrain.action`, result.checks.routesDirectTerrainAction, JSON.stringify({ sent: afterClick.sent, sentUiProtocolCommands: afterClick.sentUiProtocolCommands, actions: afterClick.actions, messages: afterClick.messages }));
      assert(`${testCase.id} sends no raw stair key`, result.checks.noRawStairKey, JSON.stringify({ sent: afterClick.sent }));
      const outcomeText = `${afterClick.body || ''}\n${(afterClick.messages || []).join('\n')}\n${afterClick.shim || ''}`;
      result.checks.visibleNetHackOutcome = testCase.expectedOutcome.test(outcomeText);
      assert(`${testCase.id} shows NetHack-visible outcome after terrain.action`, result.checks.visibleNetHackOutcome, outcomeText.slice(-1600));
    } else {
      const terrainText = `${JSON.stringify(ready.currentCell || {})}\n${JSON.stringify(ready.cursorCell || {})}`;
      if (testCase.expectedTerrain) {
        result.checks.expectedTerrainSeen = testCase.expectedTerrain.test(terrainText);
        assert(`${testCase.id} exposes expected terrain semantic`, result.checks.expectedTerrainSeen, terrainText);
      }
      const actionText = ready.actions?.text || '';
      result.checks.stairActionsAbsent = testCase.absentLabels.every((label) => !actionText.includes(label));
      assert(`${testCase.id} omits stair/ladder actions`, result.checks.stairActionsAbsent, actionText);
    }
    assert(`${testCase.id} has no fallback/developer UI`, !/Name unavailable|Inventory selector|Loading your inventory|Program in disorder|Please report these messages/i.test(ready.body), ready.body.slice(0, 1200));
    fs.writeFileSync(path.join(outDir, `${caseDirName}-debug.json`), JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    scenarioError = error;
  } finally {
    await finishEvidence(page, evidenceQc, scenarioError);
  }
}

async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  for (let index = 0; index < cases.length; index += 1) await runCase(cases[index], index);
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
