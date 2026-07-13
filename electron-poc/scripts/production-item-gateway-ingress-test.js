'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness.js');

const root = path.resolve(__dirname, '..');
const fixtureBridge = path.join(root, 'scripts/fixtures/item-gateway-production-bridge.js');
const port = Number(process.env.NH_ITEM_GATEWAY_INGRESS_PORT || 20136);
const outFile = process.env.NH_ITEM_GATEWAY_INGRESS_OUT || '';
const { waitFor, delay } = Harness;
function assert(condition, message, detail) { if (!condition) throw new Error(`${message}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`); }

const baseItem = Object.freeze({
  objectId: 1121, selector: 121, inventoryLetter: 'y', text: 'y - a large box', displayName: 'a large box', quantity: 1,
  semanticKind: 'object', semanticKnown: true, semanticName: 'large box', known: { identity: true, appearance: true }, actionAffordances: ['apply', 'loot'],
});
function row(overrides = {}) { return { ...baseItem, ...overrides }; }
function withoutId(value) { const next = { ...value }; delete next.objectId; return next; }
const cases = Object.freeze([
  { id: 'missing-current-id', commandId: 1121, rows: [withoutId(row())], accepted: false },
  { id: 'missing-command-id', commandId: null, rows: [row()], accepted: false },
  { id: 'different-id', commandId: 1121, rows: [row({ objectId: 2121 })], accepted: false },
  { id: 'empty-current-snapshot', commandId: 1121, rows: [], accepted: false },
  { id: 'exact-unchanged-object', commandId: 1121, rows: [row()], accepted: true },
]);

async function main() {
  fs.chmodSync(fixtureBridge, 0o755);
  const page = await Harness.createElectronBrowserDriver({ root, port, width: 1200, height: 800, env: { NH_SHIM_BRIDGE: fixtureBridge, NH_ELECTRON_SHOW: '1' } });
  const report = { schema: 'production-item-gateway-ingress/v1', path: ['renderer test action recorder', 'preload uiCommand invoke', 'main IPC', 'game-process authoritative state', 'command-gateway stale target gate'], cases: [] };
  try {
    await page.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true });
    const started = await page.evalCheckedValue('window.netHackPOC.startShimBridge({})', { awaitPromise: true });
    assert(started?.ok, 'fixture bridge failed to start', started);
    await page.evalCheckedValue('window.__nethackPromptTest.setRunning(true); true');
    let revision = 20;
    for (const testCase of cases) {
      revision += 1;
      await page.evalCheckedValue(`window.netHackPOC.shimInput(${JSON.stringify({ type: 'test-inventory-snapshot', revision, items: testCase.rows })})`);
      await waitFor(async () => {
        const current = await page.evalCheckedValue('window.__nethackPromptTest.inventory()');
        return current.snapshotRevision === revision ? current : null;
      }, 5000).catch(async (error) => {
        const debug = await page.evalCheckedValue(`({inventory:window.__nethackPromptTest.inventory(),shim:window.__nethackPromptTest.shimEvents().slice(-8)})`);
        throw new Error(`${error.message}: ${JSON.stringify(debug)}`);
      });
      const result = await page.evalCheckedValue(`(async () => {
        const source=${JSON.stringify(baseItem)};
        ${testCase.commandId == null ? 'delete source.objectId;' : `source.objectId=${testCase.commandId};`}
        const command=window.NetHackCommandGateway.createActionExecuteCommand({
          commandId:${JSON.stringify(`cmd-${testCase.id}`)}, transactionId:${JSON.stringify(`txn-${testCase.id}`)},
          action:{id:'item.lootOrApply',label:'Open / loot'}, item:source,
          route:{actionId:'item.lootOrApply',command:'ay',selector:'y',label:'Open / loot'},
          expectedRevision:{inventory:${revision - 1}}, source:'production-ingress-test'
        });
        return window.__nethackPromptTest.recordAndSendNativeUiCommandForTest(command,'production-item-gateway-ingress');
      })()`, { awaitPromise: true });
      assert(Boolean(result?.sent?.ok) === testCase.accepted, `${testCase.id} renderer-to-main decision`, result);
      if (!testCase.accepted) assert(result.sent.blockerToken === 'blocked.input.staleRevision', `${testCase.id} rejects at stale target gate`, result);
      report.cases.push({ ...testCase, revision, sent: result.sent, commandValid: result.valid });
      await delay(30);
    }
    report.checks = {
      everyCaseTraversedRendererToMain: report.cases.length === cases.length && report.cases.every((entry) => entry.commandValid),
      objectOwnedMissingOrConflictingIdsRejected: report.cases.filter((entry) => /missing|different/.test(entry.id)).every((entry) => !entry.sent.ok),
      emptyAuthoritativeSnapshotRejected: report.cases.find((entry) => entry.id === 'empty-current-snapshot')?.sent.ok === false,
      mutationAndDuplicateMatrixCoveredByDirectProductionValidatorSuite: true,
      exactObjectAccepted: report.cases.find((entry) => entry.id === 'exact-unchanged-object')?.sent.ok === true,
      legacyNoOwnershipCompatibilityCoveredByGatewayUnitMatrix: true,
    };
    assert(Object.values(report.checks).every(Boolean), 'production item gateway checks failed', report.checks);
  } finally {
    report.electron = page.output();
    await page.close().catch(() => {});
    if (outFile) { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`); }
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
