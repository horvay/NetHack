#!/usr/bin/env node
'use strict';

const readline = require('node:readline');

let revision = 0;
let activeCase = null;

const cases = Object.freeze({
  'prompt-valid-exact': { family: 'prompt', response: { keycode: 110 } },
  'prompt-valid-no-transaction': { family: 'prompt', response: { keycode: 110 }, omitTransaction: true },
  'prompt-missing-response': { family: 'prompt', response: {} },
  'prompt-malformed-keycode': { family: 'prompt', response: { keycode: '110' } },
  'prompt-wrapping-keycode': { family: 'prompt', response: { keycode: 65646 } },
  'prompt-conflicting-value-alias': { family: 'prompt', response: { keycode: 110, value: 'y' } },
  'prompt-conflicting-key-alias': { family: 'prompt', response: { keycode: 110, key: 'y' } },
  'prompt-conflicting-answer-alias': { family: 'prompt', response: { keycode: 110, answer: 'y' } },
  'prompt-foreign-request': { family: 'prompt', response: { keycode: 110 }, foreignRequestId: true },
  'prompt-conflicting-request-alias': { family: 'prompt', response: { keycode: 110 }, foreignPromptId: true },
  'prompt-wrong-key': { family: 'prompt', response: { keycode: 121 } },
  'prompt-wrong-family': { family: 'prompt', responseFamily: 'line', response: { value: 'n' } },
  'prompt-wrong-transaction': { family: 'prompt', response: { keycode: 110 }, foreignTransaction: true },
  'prompt-conflicting-transaction-alias': { family: 'prompt', response: { keycode: 110 }, foreignInputTransaction: true },
  'line-valid-exact': { family: 'line', response: { value: '' } },
  'line-valid-no-transaction': { family: 'line', response: { value: '' }, omitTransaction: true },
  'line-missing-response': { family: 'line', response: {} },
  'line-conflicting-answer-alias': { family: 'line', response: { value: '', answer: 'engrave' } },
  'line-conflicting-key-alias': { family: 'line', response: { value: '', key: 'engrave' } },
  'menu-valid-exact': { family: 'menu', response: { return: 0, selector: 0, selectors: '' } },
  'menu-missing-transaction': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, omitTransaction: true },
  'menu-missing-return': { family: 'menu', response: { selector: 0, selectors: '' } },
  'menu-malformed-return': { family: 'menu', response: { return: '0', selector: 0, selectors: '' } },
  'menu-string-window': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, windowOverride: 'owned-window' },
  'menu-fractional-window': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, windowOverride: 0.5 },
  'menu-negative-zero-window': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, rawNegativeZeroField: 'window' },
  'menu-negative-zero-return': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, rawNegativeZeroField: 'return' },
  'menu-negative-zero-selector': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, rawNegativeZeroField: 'selector' },
  'menu-null-return': { family: 'menu', response: { return: null, selector: 0, selectors: '' } },
  'menu-boolean-selector': { family: 'menu', response: { return: 0, selector: false, selectors: '' } },
  'menu-conflicting-active-request-id': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, activeRequestId: 'foreign-request' },
  'menu-conflicting-active-kind': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, activeRequestKind: 'prompt' },
  'menu-conflicting-active-transaction': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, activeMenuTransactionId: 'foreign-transaction' },
  'menu-malformed-owner': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, malformedOwner: true },
  'menu-malformed-source': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, malformedSource: true },
  'menu-conflicting-selectors': { family: 'menu', response: { return: 0, selector: 97, selectors: 'a' } },
  'menu-conflicting-answer-alias': { family: 'menu', response: { return: 0, selector: 0, selectors: '', answer: 'a' } },
  'menu-conflicting-value-alias': { family: 'menu', response: { return: 0, selector: 0, selectors: '', value: 'a' } },
  'menu-conflicting-key-alias': { family: 'menu', response: { return: 0, selector: 0, selectors: '', key: 'a' } },
  'menu-conflicting-selection-alias': { family: 'menu', response: { return: 0, selector: 0, selectors: '', selection: 'a' } },
  'menu-conflicting-request-alias': { family: 'menu', response: { return: 0, selector: 0, selectors: '' }, foreignMenuRequestId: true },
  'extcmd-valid-exact': { family: 'extcmd', response: { return: -1, value: '' } },
  'extcmd-valid-no-transaction': { family: 'extcmd', response: { return: -1, value: '' }, omitTransaction: true },
  'extcmd-missing-value': { family: 'extcmd', response: { return: -1 } },
  'extcmd-conflicting-return': { family: 'extcmd', response: { return: 1, value: '' } },
  'extcmd-conflicting-command-alias': { family: 'extcmd', response: { return: -1, value: '', command: 'pray' } },
  'extcmd-conflicting-answer-alias': { family: 'extcmd', response: { return: -1, value: '', answer: 'pray' } },
  'extcmd-conflicting-key-alias': { family: 'extcmd', response: { return: -1, value: '', key: 'p' } },
});

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function identity(caseId) {
  const requestId = `uxm01-ingress-${caseId}`;
  return { requestId, transactionId: `uxm01-transaction-${caseId}` };
}

function ownership(id, family) {
  return family === 'menu'
    ? { requestId: id.requestId, menuRequestId: id.requestId, transactionId: id.transactionId }
    : { requestId: id.requestId, promptId: id.requestId, transactionId: id.transactionId };
}

function setupCase(caseId, spec) {
  const id = identity(caseId);
  const metadata = { ...ownership(id, spec.family), lifecycle: 'awaiting', lifecycleRevision: ++revision };
  activeCase.lifecycleRevision = revision;
  if (spec.family === 'prompt') emit({ name: 'shim_yn_function', query: `UXM-01 production ingress ${caseId}?`, choices: 'yn', def: 'n', ...metadata });
  else if (spec.family === 'line') emit({ name: 'shim_getlin', query: `UXM-01 production ingress ${caseId}`, choices: '', ...metadata });
  else if (spec.family === 'extcmd') emit({ name: 'shim_get_ext_cmd', ...metadata });
  else {
    const window = 810 + revision;
    const menuId = `uxm01-menu-${window}-r${revision}`;
    activeCase.window = window;
    activeCase.menuId = menuId;
    const menuMetadata = { ...metadata, menuId, menuPurpose: 'inventory.displayInventory', requestSource: { layer: 'shim-bridge', window }, owner: { kind: 'inventory', window } };
    emit({ name: 'shim_start_menu', window, ...menuMetadata });
    emit({ name: 'shim_add_menu', window, selector: 0, text: `UXM-01 production ingress ${caseId}`, ...menuMetadata });
    emit({ name: 'shim_end_menu', window, prompt: `UXM-01 production ingress ${caseId}`, ...menuMetadata });
    emit({ name: 'shim_select_menu', window, how: 0, ...menuMetadata });
  }
}

function answerFor(active, cleanup = false) {
  const { caseId, spec } = active;
  const id = identity(caseId);
  const family = cleanup ? spec.family : (spec.responseFamily || spec.family);
  const names = { prompt: 'bridge_prompt_answer', line: 'bridge_line_answer', menu: 'bridge_menu_answer', extcmd: 'bridge_extcmd_answer' };
  const response = cleanup
    ? (spec.family === 'prompt' ? { keycode: 110 } : spec.family === 'line' ? { value: '' } : spec.family === 'menu' ? { return: 0, selector: 0, selectors: '' } : { return: -1, value: '' })
    : spec.response;
  const event = { name: names[family], ...(family === 'menu' && active.window != null ? { window: active.window } : {}), ...response, ...(cleanup ? { autoAnswerReason: 'uxm01-stale-exact-cleanup' } : {}) };
  if (family === 'menu') {
    event.requestId = id.requestId;
    event.menuRequestId = spec.foreignMenuRequestId && !cleanup ? `${id.requestId}-foreign` : id.requestId;
    event.menuId = active.menuId;
    event.lifecycleRevision = active.lifecycleRevision;
    event.lifecycle = 'answered';
    event.menuPurpose = 'inventory.displayInventory';
    event.requestSource = spec.malformedSource && !cleanup ? null : { layer: 'shim-bridge', window: active.window };
    event.owner = spec.malformedOwner && !cleanup ? [] : { kind: 'inventory', window: active.window };
    if (spec.windowOverride != null && !cleanup) event.window = spec.windowOverride === 'owned-window' ? String(active.window) : active.window + spec.windowOverride;
    if (spec.activeRequestId && !cleanup) event.activeRequestId = spec.activeRequestId;
    if (spec.activeRequestKind && !cleanup) event.activeRequestKind = spec.activeRequestKind;
    if (spec.activeMenuTransactionId && !cleanup) event.activeMenuTransactionId = spec.activeMenuTransactionId;
    event.activeRequestMatch = true;
    event.inputMatchesMenuTransaction = true;
  } else {
    event.requestId = spec.foreignRequestId && !cleanup ? `${id.requestId}-foreign` : id.requestId;
    event.promptId = spec.foreignRequestId && !cleanup ? `${id.requestId}-foreign` : (spec.foreignPromptId && !cleanup ? `${id.requestId}-foreign` : id.requestId);
  }
  if (!(spec.omitTransaction && !cleanup)) {
    event.transactionId = spec.foreignTransaction && !cleanup ? `${id.transactionId}-foreign` : id.transactionId;
    if (family === 'menu') event.inputTransactionId = id.transactionId;
    if (spec.foreignInputTransaction && !cleanup) event.inputTransactionId = `${id.transactionId}-foreign`;
  }
  return event;
}

emit({ name: 'bridge_start', source: 'uxm01-production-ingress-fixture' });

readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  let input;
  try { input = JSON.parse(line); } catch { return; }
  if (input.type === 'uxm01-test-case') {
    const spec = cases[input.caseId];
    if (!spec) return emit({ name: 'shim_raw_print', text: `unknown UXM-01 ingress case: ${String(input.caseId || '')}` });
    activeCase = { caseId: input.caseId, spec, window: null, answered: false };
    setupCase(input.caseId, spec);
    return;
  }
  if (input.type === 'uxm01-cleanup' && activeCase) {
    emit(answerFor(activeCase, true));
    return;
  }
  if (input.guiActionId === 'interaction.cancel' && activeCase && !activeCase.answered) {
    activeCase.answered = true;
    const answer = answerFor(activeCase, false);
    if (activeCase.spec.rawNegativeZeroField) {
      const key = activeCase.spec.rawNegativeZeroField;
      const serialized = JSON.stringify(answer).replace(new RegExp(`"${key}":-?\\d+(?:\\.\\d+)?(?=,|})`), `"${key}":-0`);
      process.stdout.write(`${serialized}\n`);
    } else emit(answer);
  }
});
