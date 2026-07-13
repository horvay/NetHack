'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness.js');

const root = path.resolve(__dirname, '..');
const fixtureBridge = path.join(root, 'scripts', 'fixtures', 'uxm01-production-ingress-bridge.js');
const port = Number(process.env.NH_UXM01_PRODUCTION_INGRESS_PORT || 20134);
const outFile = process.env.NH_UXM01_PRODUCTION_INGRESS_OUT || '';
const { waitFor, delay } = Harness;

const matrix = Object.freeze([
  { id: 'prompt-valid-exact', family: 'prompt', valid: true, response: { keycode: 110 }, transaction: 'required' },
  { id: 'prompt-valid-no-transaction', family: 'prompt', valid: true, response: { keycode: 110 }, transaction: 'omitted' },
  { id: 'prompt-missing-response', family: 'prompt', valid: false, response: {} },
  { id: 'prompt-malformed-keycode', family: 'prompt', valid: false, response: { keycode: '110' } },
  { id: 'prompt-wrapping-keycode', family: 'prompt', valid: false, response: { keycode: 65646 } },
  { id: 'prompt-conflicting-value-alias', family: 'prompt', valid: false, response: { keycode: 110, value: 'y' } },
  { id: 'prompt-conflicting-key-alias', family: 'prompt', valid: false, response: { keycode: 110, key: 'y' } },
  { id: 'prompt-conflicting-answer-alias', family: 'prompt', valid: false, response: { keycode: 110, answer: 'y' } },
  { id: 'prompt-foreign-request', family: 'prompt', valid: false, response: { keycode: 110 } },
  { id: 'prompt-conflicting-request-alias', family: 'prompt', valid: false, response: { keycode: 110 }, aliasConflict: 'promptId' },
  { id: 'prompt-wrong-key', family: 'prompt', valid: false, response: { keycode: 121 } },
  { id: 'prompt-wrong-family', family: 'prompt', responseFamily: 'line', valid: false, response: { value: 'n' } },
  { id: 'prompt-wrong-transaction', family: 'prompt', valid: false, response: { keycode: 110 }, transaction: 'foreign' },
  { id: 'prompt-conflicting-transaction-alias', family: 'prompt', valid: false, response: { keycode: 110 }, transaction: 'conflicting-alias' },
  { id: 'line-valid-exact', family: 'line', valid: true, response: { value: '' }, transaction: 'required' },
  { id: 'line-valid-no-transaction', family: 'line', valid: true, response: { value: '' }, transaction: 'omitted' },
  { id: 'line-missing-response', family: 'line', valid: false, response: {} },
  { id: 'line-conflicting-answer-alias', family: 'line', valid: false, response: { value: '', answer: 'engrave' } },
  { id: 'line-conflicting-key-alias', family: 'line', valid: false, response: { value: '', key: 'engrave' } },
  { id: 'menu-valid-exact', family: 'menu', valid: true, response: { return: 0, selector: 0, selectors: '' }, transaction: 'required' },
  { id: 'menu-missing-transaction', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, transaction: 'omitted' },
  { id: 'menu-missing-return', family: 'menu', valid: false, response: { selector: 0, selectors: '' } },
  { id: 'menu-malformed-return', family: 'menu', valid: false, response: { return: '0', selector: 0, selectors: '' } },
  { id: 'menu-string-window', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, windowOverride: 'owned-window' },
  { id: 'menu-fractional-window', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, windowOverride: 0.5 },
  { id: 'menu-negative-zero-window', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, rawNegativeZeroField: 'window' },
  { id: 'menu-negative-zero-return', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, rawNegativeZeroField: 'return' },
  { id: 'menu-negative-zero-selector', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, rawNegativeZeroField: 'selector' },
  { id: 'menu-null-return', family: 'menu', valid: false, response: { return: null, selector: 0, selectors: '' } },
  { id: 'menu-boolean-selector', family: 'menu', valid: false, response: { return: 0, selector: false, selectors: '' } },
  { id: 'menu-conflicting-active-request-id', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, activeRequestId: 'foreign-request' },
  { id: 'menu-conflicting-active-kind', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, activeRequestKind: 'prompt' },
  { id: 'menu-conflicting-active-transaction', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, activeMenuTransactionId: 'foreign-transaction' },
  { id: 'menu-malformed-owner', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, malformedOwner: true },
  { id: 'menu-malformed-source', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, malformedSource: true },
  { id: 'menu-conflicting-selectors', family: 'menu', valid: false, response: { return: 0, selector: 97, selectors: 'a' } },
  { id: 'menu-conflicting-answer-alias', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '', answer: 'a' } },
  { id: 'menu-conflicting-value-alias', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '', value: 'a' } },
  { id: 'menu-conflicting-key-alias', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '', key: 'a' } },
  { id: 'menu-conflicting-selection-alias', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '', selection: 'a' } },
  { id: 'menu-conflicting-request-alias', family: 'menu', valid: false, response: { return: 0, selector: 0, selectors: '' }, aliasConflict: 'menuRequestId' },
  { id: 'extcmd-valid-exact', family: 'extcmd', valid: true, response: { return: -1, value: '' }, transaction: 'required' },
  { id: 'extcmd-valid-no-transaction', family: 'extcmd', valid: true, response: { return: -1, value: '' }, transaction: 'omitted' },
  { id: 'extcmd-missing-value', family: 'extcmd', valid: false, response: { return: -1 } },
  { id: 'extcmd-conflicting-return', family: 'extcmd', valid: false, response: { return: 1, value: '' } },
  { id: 'extcmd-conflicting-command-alias', family: 'extcmd', valid: false, response: { return: -1, value: '', command: 'pray' } },
  { id: 'extcmd-conflicting-answer-alias', family: 'extcmd', valid: false, response: { return: -1, value: '', answer: 'pray' } },
  { id: 'extcmd-conflicting-key-alias', family: 'extcmd', valid: false, response: { return: -1, value: '', key: 'p' } },
]);

const answerNames = Object.freeze({ prompt: 'bridge_prompt_answer', line: 'bridge_line_answer', menu: 'bridge_menu_answer', extcmd: 'bridge_extcmd_answer' });

function assert(condition, message, detail) {
  if (!condition) throw new Error(`${message}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
}

function expectedRequestId(id) { return `uxm01-ingress-${id}`; }
function expectedTransactionId(id) { return `uxm01-transaction-${id}`; }

async function snapshot(page) {
  return page.evalCheckedValue(`(() => {
    const t = window.__nethackPromptTest;
    const automation = window.__nethackAutomation?.state?.() || {};
    return {
      prompt: t.prompt(),
      dialog: t.dialog(),
      pending: t.cancellationPending(),
      acknowledgement: t.cancellationAcknowledgement(),
      diagnostics: t.cancellationDiagnostics(),
      sent: t.sentInputs().join(''),
      payloads: t.sentPayloads(),
      shimEvents: t.shimEvents(),
      gameActivePrompt: automation.gameView?.activePrompt || null,
      gameCurrentMenu: automation.gameView?.currentMenu || null,
      openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      commandPaletteOpen: Boolean(document.getElementById('ux-command-palette')?.open),
    };
  })()`);
}

function answerEnvelopeFor(state, testCase) {
  const name = answerNames[testCase.responseFamily || testCase.family];
  return state.shimEvents.map((entry) => entry?.event ? entry : null).filter(Boolean).reverse()
    .find((entry) => entry.event.name === name);
}

function verifyAuthoritativeShape(testCase, event) {
  const rejectedAtIngress = Object.keys(testCase.response).some((key) => !Object.prototype.hasOwnProperty.call(event, key));
  if (rejectedAtIngress) {
    assert(!testCase.valid && event.name === answerNames[testCase.responseFamily || testCase.family] && Object.keys(event).length === 1, `${testCase.id} ingress rejection must preserve only an inert transport marker`, event);
    return;
  }
  for (const [key, value] of Object.entries(testCase.response)) {
    assert(Object.prototype.hasOwnProperty.call(event, key), `${testCase.id} lost explicit response field ${key}`, event);
    assert(Object.is(event[key], value), `${testCase.id} changed authoritative response field ${key}`, event);
  }
  const responseFields = testCase.family === 'prompt' ? ['keycode', 'value', 'key', 'answer']
    : testCase.family === 'line' ? ['value', 'answer', 'key']
      : testCase.family === 'menu' ? ['return', 'selector', 'selectors', 'answer', 'value', 'key', 'selection']
        : ['return', 'value', 'command', 'answer', 'key'];
  for (const key of responseFields) {
    if (!Object.prototype.hasOwnProperty.call(testCase.response, key)) assert(!Object.prototype.hasOwnProperty.call(event, key), `${testCase.id} invented absent response field ${key}`, event);
  }
  if (testCase.transaction === 'omitted') {
    assert(!Object.prototype.hasOwnProperty.call(event, 'transactionId') && !Object.prototype.hasOwnProperty.call(event, 'inputTransactionId'), `${testCase.id} invented optional transaction metadata`, event);
  }
}

async function main() {
  assert(fs.existsSync(fixtureBridge), 'production ingress fixture bridge is missing', fixtureBridge);
  const page = await Harness.createElectronBrowserDriver({
    root,
    port,
    width: 1200,
    height: 800,
    env: { NH_SHIM_BRIDGE: fixtureBridge, NH_ELECTRON_SHOW: '1' },
  });
  const report = { schema: 'uxm01-production-ingress-matrix/v1', port, fixtureBridge, path: ['game-process.parseLine', 'shim-protocol.normalizeRawShimEvent', 'Electron IPC', 'preload.cloneFreeze(lossless recursive clone)', 'renderer.handleShimEvent'], cases: [], checks: {} };
  try {
    await page.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true });
    const started = await page.evalCheckedValue('window.netHackPOC.startShimBridge({})', { awaitPromise: true });
    assert(started?.ok, 'fixture bridge did not start', started);
    await page.evalCheckedValue("window.__nethackPromptTest.setRunning(true); document.getElementById('game-grid').focus(); true");

    for (const testCase of matrix) {
      await page.evalCheckedValue(`(() => { const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); window.netHackPOC.shimInput({type:'uxm01-test-case',caseId:${JSON.stringify(testCase.id)}}); return true; })()`);
      const requestId = expectedRequestId(testCase.id);
      const ready = await waitFor(async () => {
        const state = await snapshot(page);
        const owned = state.prompt?.requestId === requestId || state.gameCurrentMenu?.requestId === requestId || state.gameCurrentMenu?.menuRequestId === requestId;
        const presenterOpen = testCase.family === 'extcmd' ? state.commandPaletteOpen : state.openDialogs.includes('interaction-dialog');
        return owned && presenterOpen ? state : null;
      }, 5000);
      assert(ready.acknowledgement == null && ready.diagnostics.length === 0, `${testCase.id} did not begin with clean inspection state`, ready);

      await page.pressKey('Escape');
      const settled = await waitFor(async () => {
        const state = await snapshot(page);
        const envelope = answerEnvelopeFor(state, testCase);
        return envelope && state.pending == null ? { state, envelope } : null;
      }, 5000);
      const { state, envelope } = settled;
      const answer = envelope.event;
      verifyAuthoritativeShape(testCase, answer);
      const expectedKey = testCase.family === 'prompt' ? 'n' : '\u001b';
      assert(state.sent === expectedKey, `${testCase.id} cancellation send changed`, { sent: state.sent, expectedKey });
      assert(state.payloads.length === 1 && state.payloads[0].guiActionId === 'interaction.cancel', `${testCase.id} must send one typed cancellation`, state.payloads);
      if (testCase.valid) {
        assert(state.acknowledgement?.status === 'acknowledged', `${testCase.id} exact production response did not acknowledge`, state);
        assert(state.acknowledgement.requestId === requestId && state.acknowledgement.transportEvent === answer.name && state.acknowledgement.responseKey === expectedKey, `${testCase.id} acknowledgement lost ownership/transport/key agreement`, state.acknowledgement);
        assert(state.diagnostics.length === 0, `${testCase.id} valid response emitted cancellation mismatch diagnostic`, state.diagnostics);
      } else {
        assert(state.acknowledgement == null, `${testCase.id} malformed production response acknowledged`, state.acknowledgement);
        assert(state.diagnostics.length === 1, `${testCase.id} rejection did not emit one bounded diagnostic`, state.diagnostics);
      }
      assert(state.pending == null, `${testCase.id} did not consume one-shot pending cancellation`, state.pending);
      const caseResult = { ...testCase, requestId, expectedTransactionId: expectedTransactionId(testCase.id), normalizedAnswer: answer, acknowledgement: state.acknowledgement, diagnostics: state.diagnostics, downstream: { activePrompt: state.gameActivePrompt, currentMenu: state.gameCurrentMenu, interactionOpen: state.openDialogs.includes('interaction-dialog'), commandPaletteOpen: state.commandPaletteOpen } };
      report.cases.push(caseResult);

      // A second exact answer traverses the same production path. Invalid first
      // answers must not leave stale one-shot ownership that can acknowledge it
      // or emit an additional cancellation diagnostic.
      if (!testCase.valid) {
        await page.evalCheckedValue("window.netHackPOC.shimInput({type:'uxm01-cleanup'}); true");
        const stale = await waitFor(async () => {
          const next = await snapshot(page);
          const cleanupObserved = next.shimEvents.some((entry) => entry?.event?.autoAnswerReason === 'uxm01-stale-exact-cleanup' && JSON.stringify(entry.event).includes(testCase.id));
          const cleaned = !next.openDialogs.includes('interaction-dialog') && !next.gameActivePrompt && !next.gameCurrentMenu;
          return cleanupObserved && cleaned ? next : null;
        }, 3000);
        assert(stale.acknowledgement == null && stale.pending == null, `${testCase.id} later exact answer satisfied invalidated cancellation state`, stale);
        assert(stale.diagnostics.length === 1, `${testCase.id} later exact answer emitted a second cancellation diagnostic`, stale.diagnostics);
        caseResult.staleExactAnswer = { acknowledgement: stale.acknowledgement, pending: stale.pending, diagnosticCount: stale.diagnostics.length, downstreamClosed: true };
      } else if (state.openDialogs.includes('interaction-dialog') || state.gameActivePrompt || state.gameCurrentMenu) {
        await page.evalCheckedValue("window.netHackPOC.shimInput({type:'uxm01-cleanup'}); true");
        await waitFor(async () => {
          const cleaned = await snapshot(page);
          return !cleaned.openDialogs.includes('interaction-dialog') && !cleaned.gameActivePrompt && !cleaned.gameCurrentMenu ? cleaned : null;
        }, 3000);
      }
      await delay(20);
    }

    const validCases = report.cases.filter((item) => item.valid);
    const invalidCases = report.cases.filter((item) => !item.valid);
    report.checks = {
      allCasesObservedAfterProductionIngress: report.cases.length === matrix.length,
      allExactCancellationsAcknowledged: validCases.every((item) => item.acknowledgement?.status === 'acknowledged'),
      allMalformedOrConflictingResponsesRejected: invalidCases.every((item) => !item.acknowledgement && item.diagnostics.length === 1),
      promptCovered: report.cases.some((item) => item.family === 'prompt'),
      lineCovered: report.cases.some((item) => item.family === 'line'),
      menuCovered: report.cases.some((item) => item.family === 'menu'),
      extcmdCovered: report.cases.some((item) => item.family === 'extcmd'),
      missingFieldsFailClosed: ['prompt-missing-response', 'line-missing-response', 'menu-missing-return', 'extcmd-missing-value'].every((id) => !report.cases.find((item) => item.id === id)?.acknowledgement),
      conflictingAliasesFailClosed: report.cases.filter((item) => /conflicting/.test(item.id)).every((item) => !item.acknowledgement),
      lossyWindowAndNegativeZeroCasesFailClosed: report.cases.filter((item) => /string-window|fractional-window|negative-zero/.test(item.id)).every((item) => !item.acknowledgement),
      malformedNestedOwnershipFailsClosed: ['menu-malformed-owner', 'menu-malformed-source'].every((id) => !report.cases.find((item) => item.id === id)?.acknowledgement),
      contradictoryActiveOwnershipFailsClosed: report.cases.filter((item) => /conflicting-active/.test(item.id)).every((item) => !item.acknowledgement),
      wrongFamilyKeyTransactionFailClosed: ['prompt-wrong-family', 'prompt-wrong-key', 'prompt-wrong-transaction'].every((id) => !report.cases.find((item) => item.id === id)?.acknowledgement),
      optionalNonMenuTransactionOmissionAcceptedAndOwnedMenuOmissionRejected: report.cases.filter((item) => item.transaction === 'omitted' && item.family !== 'menu').every((item) => item.acknowledgement?.status === 'acknowledged') && !report.cases.find((item) => item.id === 'menu-missing-transaction')?.acknowledgement,
      normalizedConsumersRemainCompatible: validCases.every((item) => !item.downstream.activePrompt && !item.downstream.currentMenu && !item.downstream.interactionOpen),
      boundedOneShotDiagnostics: invalidCases.every((item) => item.diagnostics.length === 1 && item.staleExactAnswer?.diagnosticCount === 1 && !item.staleExactAnswer?.acknowledgement),
    };
    const failed = Object.entries(report.checks).filter(([, passed]) => !passed).map(([name]) => name);
    assert(failed.length === 0, `production ingress matrix checks failed: ${failed.join(', ')}`, report.checks);
  } finally {
    report.electron = page.output();
    await page.close().catch(() => {});
    if (outFile) {
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
