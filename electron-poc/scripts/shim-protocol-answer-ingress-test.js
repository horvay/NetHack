'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ShimProtocol = require('../src/shared/shim-protocol');
const GameViewState = require('../src/shared/game-view-state');
const CommandTransactionModel = require('../src/shared/command-transaction-model');
const PreloadContract = require('../src/shared/preload-contract');

function ingress(raw) { return PreloadContract.cloneFreeze(ShimProtocol.normalizeRawShimEvent(raw)); }
function payload(raw) { return ingress(raw).event; }
function has(event, key) { return Object.prototype.hasOwnProperty.call(event, key); }

const missingLine = payload({ name: 'bridge_line_answer', requestId: 'line-r' });
assert.equal(has(missingLine, 'value'), false, 'line answer must preserve missing value');
const emptyLine = payload({ name: 'bridge_line_answer', value: '', requestId: 'line-r' });
assert.equal(has(emptyLine, 'value'), true, 'line answer must preserve explicit empty value');
assert.equal(emptyLine.value, '');

const missingMenu = payload({ name: 'bridge_menu_answer', requestId: 'menu-r' });
assert.equal(has(missingMenu, 'return'), false, 'menu answer must preserve missing return');
const emptyMenu = payload({ name: 'bridge_menu_answer', return: 0, selector: 0, selectors: '', requestId: 'menu-r' });
assert.equal(emptyMenu.return, 0);
assert.equal(emptyMenu.selector, 0);
assert.equal(emptyMenu.selectors, '');
const malformedMenuIngress = ingress({ name: 'bridge_menu_answer', return: '0', requestId: 'menu-r' });
assert.equal(malformedMenuIngress.valid, false, 'malformed menu return type is rejected before delivery cloning');
assert.deepEqual(malformedMenuIngress.event, { name: 'bridge_menu_answer' }, 'invalid authoritative response fields are not normalized into accepted values');

const nativeOwnedMenuAnswer = {
  name: 'bridge_menu_answer', window: 44, return: 0, selector: 0, selectors: '',
  activeRequestMatch: true, inputMatchesMenuTransaction: true,
  inputTransactionId: 'menu-t', transactionId: 'menu-t',
  menuId: 'menu-44-r9', menuRequestId: 'menu-r', requestId: 'menu-r',
  lifecycleRevision: 9, lifecycle: 'answered', menuPurpose: 'inventory.displayInventory',
  requestSource: { layer: 'shim-bridge', window: 44 }, owner: { kind: 'inventory', window: 44 },
};
const nativeAfterProductionIngress = payload(nativeOwnedMenuAnswer);
assert.deepEqual(nativeAfterProductionIngress, nativeOwnedMenuAnswer, 'production normalization and the shared lossless preload contract preserve every authoritative native ownership field and exact type');
const nativeFlow = CommandTransactionModel.createOwnedInputFlow({
  kind: 'menu-cancel', requestId: 'menu-r', transactionId: 'menu-t', window: 44,
  menuId: 'menu-44-r9', menuPurpose: 'inventory.displayInventory', ownerKind: 'inventory', requestSourceLayer: 'shim-bridge', lifecycleRevision: 9,
  acknowledgementEvent: 'bridge_menu_answer', responseKey: '\u001b', baselineRevision: { inventory: 4, equipment: 2 }, requiredRevisionAdvance: ['inventory'],
});
assert.equal(CommandTransactionModel.settleOwnedInputFlow(nativeFlow, nativeAfterProductionIngress).ok, true, 'current native-shaped production-ingress event satisfies the strict owned settlement contract');

const adversarialOwnedAnswers = [
  ['window string', { window: '44' }],
  ['window fractional', { window: 44.9 }],
  ['window negative zero', { window: -0 }],
  ['return negative zero', { return: -0 }],
  ['selector negative zero', { selector: -0 }],
  ['return null', { return: null }],
  ['selector boolean', { selector: false }],
  ['window NaN', { window: Number.NaN }],
  ['return Infinity', { return: Number.POSITIVE_INFINITY }],
  ['conflicting active request id', { activeRequestId: 'foreign-request' }],
  ['conflicting active request kind', { activeRequestKind: 'prompt' }],
  ['conflicting active menu transaction', { activeMenuTransactionId: 'foreign-transaction' }],
  ['malformed owner', { owner: [] }],
  ['malformed request source', { requestSource: null }],
  ['nested owner negative zero window', { owner: { kind: 'inventory', window: -0 } }],
  ['nested source fractional window', { requestSource: { layer: 'shim-bridge', window: 44.5 } }],
];
for (const [label, overrides] of adversarialOwnedAnswers) {
  const normalized = ingress({ ...nativeOwnedMenuAnswer, ...overrides });
  assert.equal(normalized.valid, false, `${label} must fail at production normalization before any lossy clone`);
  assert.deepEqual(normalized.event, { name: 'bridge_menu_answer' }, `${label} must not retain an accept-shaped response`);
  const first = CommandTransactionModel.settleOwnedInputFlow(nativeFlow, normalized.event);
  assert.equal(first.ok, false, `${label} malformed first event must reject settlement`);
  assert.equal(first.flow.status, 'rejected', `${label} malformed first event consumes the flow`);
  assert.equal(CommandTransactionModel.settleOwnedInputFlow(first.flow, nativeAfterProductionIngress).code, 'late-duplicate', `${label} later valid answer cannot rescue the consumed flow`);
}
const specialCloneProbe = PreloadContract.cloneFreeze({ negativeZero: -0, nan: Number.NaN, infinity: Number.POSITIVE_INFINITY });
assert.equal(Object.is(specialCloneProbe.negativeZero, -0), true, 'preload-equivalent clone preserves negative zero rather than changing it to accepted zero');
assert.equal(Number.isNaN(specialCloneProbe.nan), true, 'preload-equivalent clone preserves NaN');
assert.equal(specialCloneProbe.infinity, Number.POSITIVE_INFINITY, 'preload-equivalent clone preserves Infinity');
const preloadSource = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');
assert.equal(/JSON\.parse\(JSON\.stringify/.test(preloadSource), false, 'production preload no longer uses a lossy JSON clone');
const nativeSource = fs.readFileSync(path.join(__dirname, '../shim-bridge/nh-shim-bridge.c'), 'utf8');
for (const requiredEmission of ['"bridge_menu_answer"', '\\"return\\":%d', '\\"selector\\":%d', '\\"activeRequestMatch\\":%s', '\\"inputMatchesMenuTransaction\\":%s', '\\"inputTransactionId\\":\\"', '\\"selectors\\":\\"', 'emit_menu_lifecycle_metadata(menu_ctx, "answered")']) {
  assert.ok(nativeSource.includes(requiredEmission), `native bridge currently emits ${requiredEmission}`);
}

const extcmdCancellation = payload({ name: 'bridge_extcmd_answer', return: -1, value: '', requestId: 'ext-r', promptId: 'ext-r', transactionId: 'ext-t', inputTransactionId: 'ext-t' });
assert.equal(extcmdCancellation.return, -1, 'extcmd cancellation return must survive normalization');
assert.equal(extcmdCancellation.value, '', 'extcmd cancellation value must survive normalization');
assert.equal(has(extcmdCancellation, 'command'), false, 'normalization must not invent an extcmd command');

const aliases = payload({
  name: 'bridge_menu_answer',
  return: 0,
  requestId: 'owner-r',
  menuRequestId: 'owner-r',
  promptId: 'owner-r',
  transactionId: 'owner-t',
  inputTransactionId: 'owner-t',
});
for (const key of ['requestId', 'menuRequestId', 'promptId', 'transactionId', 'inputTransactionId']) assert.equal(aliases[key], key.endsWith('Id') && key.includes('Transaction') ? 'owner-t' : (key === 'transactionId' ? 'owner-t' : 'owner-r'), `${key} must survive answer normalization`);

const conflictingResponses = [
  payload({ name: 'bridge_prompt_answer', keycode: 110, value: 'y', key: 'y', answer: 'y' }),
  payload({ name: 'bridge_line_answer', value: '', answer: 'text', key: 'text' }),
  payload({ name: 'bridge_menu_answer', return: 0, selector: 97, selectors: 'a', answer: 'a', value: 'a', key: 'a', selection: 'a' }),
  payload({ name: 'bridge_extcmd_answer', return: -1, value: '', command: 'pray', answer: 'pray', key: 'p' }),
];
assert.deepEqual(conflictingResponses.map((event) => Object.keys(event).sort()), [
  ['answer', 'key', 'keycode', 'name', 'value'],
  ['answer', 'key', 'name', 'value'],
  ['answer', 'key', 'name', 'return', 'selection', 'selector', 'selectors', 'value'],
  ['answer', 'command', 'key', 'name', 'return', 'value'],
], 'every response alias required for conflict validation must survive normalization');

function process(view, raw) { return view.process(ingress(raw)); }
function identity(requestId, transactionId, family = 'prompt') {
  return family === 'menu' ? { requestId, menuRequestId: requestId, transactionId } : { requestId, promptId: requestId, transactionId };
}

const promptView = GameViewState.createGameViewState();
process(promptView, { name: 'shim_yn_function', query: 'Continue?', choices: 'yn', ...identity('prompt-r', 'prompt-t') });
assert.equal(promptView.snapshot().activePrompt.requestId, 'prompt-r');
process(promptView, { name: 'bridge_prompt_answer', keycode: 110, ...identity('prompt-r', 'prompt-t') });
assert.equal(promptView.snapshot().activePrompt, null, 'prompt consumer remains compatible with normalized answer');

const lineView = GameViewState.createGameViewState();
process(lineView, { name: 'shim_getlin', query: 'Name?', ...identity('line-r', 'line-t') });
process(lineView, { name: 'bridge_line_answer', value: '', ...identity('line-r', 'line-t') });
assert.equal(lineView.snapshot().activePrompt, null, 'line consumer remains compatible with normalized empty cancellation');

const menuView = GameViewState.createGameViewState();
for (const event of [
  { name: 'shim_start_menu', window: 44 },
  { name: 'shim_add_menu', window: 44, selector: 0, text: 'Information' },
  { name: 'shim_end_menu', window: 44, prompt: 'Information' },
  { name: 'shim_select_menu', window: 44, how: 0 },
]) process(menuView, { ...event, ...identity('menu-r', 'menu-t', 'menu') });
process(menuView, { name: 'bridge_menu_answer', window: 44, return: 0, selector: 0, selectors: '', ...identity('menu-r', 'menu-t', 'menu') });
assert.equal(menuView.snapshot().currentMenu, null, 'menu consumer remains compatible with normalized cancellation');

const extcmdView = GameViewState.createGameViewState();
process(extcmdView, { name: 'shim_get_ext_cmd', ...identity('ext-r', 'ext-t') });
process(extcmdView, { name: 'bridge_extcmd_answer', return: -1, value: '', ...identity('ext-r', 'ext-t') });
assert.equal(extcmdView.snapshot().activePrompt, null, 'extcmd consumer remains compatible with normalized cancellation');

console.log(JSON.stringify({
  passed: true,
  checks: {
    lineAbsencePreserved: true,
    menuAbsencePreserved: true,
    malformedTypesNotCoerced: true,
    adversarialOwnedFieldsRejectedBeforeClone: adversarialOwnedAnswers.length,
    jsonSpecialNumbersPreservedByPreloadClone: true,
    malformedFirstEventConsumesFlow: true,
    nativeOwnedMenuAnswerStrictlyCompatibleAfterProductionIngress: true,
    nativeSourceEmitsEveryRequiredCancellationField: true,
    extcmdCancellationFieldsPreserved: true,
    ownershipAndTransactionAliasesPreserved: true,
    responseConflictAliasesPreserved: true,
    sharedLosslessPreloadContractCovered: true,
    downstreamPromptLineMenuExtcmdConsumersCompatible: true,
  },
}, null, 2));
