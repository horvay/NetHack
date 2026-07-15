const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Notice = require('../../src/ux/player-notice');
const Dialog = require('../../src/ux/dialog-shell');
const Focus = require('../../src/ux/focus-layer');
const Failure = require('../../src/ux/failure-presentation');
const Interaction = require('../../src/shared/interaction-model');
const CommandTransaction = require('../../src/shared/command-transaction-model');
const ShimProtocol = require('../../src/shared/shim-protocol');

const root = path.resolve(__dirname, '..', '..');

const notice = Notice.normalizeNotice({
  id: 'result:save-1', dedupeKey: 'save:run-1', kind: 'success', message: 'Game saved', source: 'result',
  persistence: 'transient', createdAt: 4,
});
assert.equal(notice.message, 'Game saved');
assert.equal(notice.dedupeKey, 'save:run-1');
assert.equal(Object.isFrozen(notice), true);
assert.throws(() => Notice.normalizeNotice({ id: '', message: 'No id' }), /id is required/);
assert.throws(() => Notice.normalizeNotice({ id: 'bad-action', message: 'Bad', actionLabel: 'Retry' }), /supplied together/);

const scheduled = [];
const noticeDiagnostics = [];
const noticeService = Notice.createNoticeService({
  now: () => 10,
  retainedIdentityLimit: 8,
  setTimeout: (fn) => { scheduled.push(fn); return scheduled.length; },
  clearTimeout: () => {},
  onDiagnostic: (entry) => noticeDiagnostics.push(entry),
});
noticeService.show({ id: 'prompt:item-delivery-1', dedupeKey: 'prompt:item:request-1', kind: 'info', message: 'Choose an item', source: 'prompt', persistence: 'until-state-change' });
noticeService.show({ id: 'prompt:item-delivery-1', dedupeKey: 'prompt:item:request-1', kind: 'info', message: 'Choose an item', source: 'prompt', persistence: 'until-state-change' });
noticeService.show({ id: 'prompt:item-delivery-2', dedupeKey: 'prompt:item:request-1', kind: 'info', message: 'Choose an item', source: 'prompt', persistence: 'until-state-change' });
assert.equal(noticeService.current().message, 'Choose an item');
assert.equal(noticeService.history().length, 1, 'duplicate delivery IDs and alternate delivery IDs for one stable outcome are suppressed');
assert.equal(noticeDiagnostics.filter((entry) => entry.type === 'notice.duplicate-suppressed').length, 2);
noticeService.show({ id: 'prompt:item-update', dedupeKey: 'prompt:item:request-1', kind: 'warning', message: 'That item moved', source: 'prompt', persistence: 'until-state-change' });
assert.equal(noticeService.history().length, 2, 'an intentional state update for one identity is presented');
assert.equal(noticeService.current().message, 'That item moved');
noticeService.show({ id: 'prompt:item-replayed-old-state', dedupeKey: 'prompt:item:request-1', kind: 'info', message: 'Choose an item', source: 'prompt', persistence: 'until-state-change' });
assert.equal(noticeService.history().length, 2, 'reconnect/replay of an earlier presentation state cannot roll a stable outcome backward');
assert.equal(noticeService.current().message, 'That item moved');
noticeService.show({ id: 'prompt:item-request-2', dedupeKey: 'prompt:item:request-2', kind: 'info', message: 'Choose an item', source: 'prompt', persistence: 'until-state-change' });
assert.equal(noticeService.history().length, 3, 'a distinct outcome remains visible even when copy repeats');
assert.equal(noticeService.stateChanged(), true);
assert.equal(noticeService.current(), null);
noticeService.show({ id: 'result:move-1', kind: 'success', message: 'Item moved', source: 'result', persistence: 'transient' });
assert.equal(scheduled.length, 1);
scheduled[0]();
assert.equal(noticeService.current(), null);
for (let index = 0; index < 12; index += 1) noticeService.show({ id: `bounded:${index}`, kind: 'info', message: `Outcome ${index}`, source: 'result', persistence: 'sticky' });
assert.equal(noticeService.retainedIdentities().length, 8, 'presented identity retention is bounded');
assert.equal(noticeService.beginRun('run-2'), true);
assert.equal(noticeService.current(), null);
assert.equal(noticeService.history().length, 0);
assert.equal(noticeService.retainedIdentities().length, 0, 'a new run starts with a fresh identity ledger');
noticeService.show({ id: 'prompt:item-delivery-3', dedupeKey: 'prompt:item:request-1', kind: 'info', message: 'Choose an item', source: 'prompt', persistence: 'until-state-change' });
assert.equal(noticeService.history().length, 1, 'the same stable identity is legitimate in a new run');

for (const family of Dialog.families) {
  const spec = Dialog.normalizeDialogSpec({ id: `family:${family}`, family, title: `Test ${family}`, closeKind: family === 'document' ? 'close' : 'cancel' });
  assert.equal(spec.family, family);
  assert(Dialog.semanticsFor(family));
}
assert.equal(Dialog.closeLabels.close, 'Close');
assert.equal(Dialog.closeLabels.cancel, 'Cancel');
assert.equal(Dialog.closeLabels.back, 'Back');
assert.equal(Dialog.closeLabels.continue, 'Continue');
assert.equal(Dialog.inferFamily({ dialogClass: 'transfer-dialog multi-select-menu-dialog', multi: true }), 'transfer');
assert.equal(Dialog.inferFamily({ dialogClass: 'destructive-confirm-dialog' }), 'confirmation');
assert.equal(Dialog.inferFamily({ textEntry: true }), 'form');
assert.equal(Dialog.inferFamily({ dialogClass: 'command-help-dialog' }), 'command');
assert.equal(Dialog.inferFamily({ readOnly: true }), 'document');

function fakeElement(id, documentRoot) {
  const attrs = new Map();
  return {
    id, tagName: 'BUTTON', isConnected: true, hidden: false, disabled: false, dataset: {}, tabIndex: 0,
    getClientRects: () => [1],
    hasAttribute: (name) => attrs.has(name),
    setAttribute: (name, value) => attrs.set(name, String(value)),
    getAttribute: (name) => attrs.get(name) || '',
    removeAttribute: (name) => attrs.delete(name),
    focus: () => { documentRoot.activeElement = element; },
    scrollIntoView: () => {},
  };
  function element() {}
}

function focusNode(id, documentRoot) {
  const attrs = new Map();
  const node = {
    id, tagName: 'BUTTON', isConnected: true, hidden: false, disabled: false, dataset: {}, tabIndex: 0,
    getClientRects: () => [1], hasAttribute: (name) => attrs.has(name),
    setAttribute: (name, value) => attrs.set(name, String(value)), getAttribute: (name) => attrs.get(name) || '',
    removeAttribute: (name) => attrs.delete(name), scrollIntoView: () => {},
    focus: () => { documentRoot.activeElement = node; },
  };
  return node;
}

const documentRoot = { activeElement: null, querySelector: () => null, getElementById: () => null };
const map = focusNode('game-grid', documentRoot);
const invoker = focusNode('inventory-button', documentRoot);
const first = focusNode('choice-a', documentRoot);
const last = focusNode('choice-b', documentRoot);
const layerElement = {
  id: 'dialog-a', tagName: 'DIALOG', isConnected: true, hidden: false, disabled: false, dataset: {},
  getClientRects: () => [1], focus: () => { documentRoot.activeElement = layerElement; }, scrollIntoView: () => {},
  querySelectorAll: () => [first, last], querySelector: (selector) => selector.includes('first') ? first : null,
};
const diagnostics = [];
const focusLayer = Focus.createFocusLayer({ documentRoot, fallbackFocus: map, onDiagnostic: (entry) => diagnostics.push(entry) });
documentRoot.activeElement = invoker;
focusLayer.open({ id: 'dialog-a', element: layerElement, initialFocus: first, returnFocus: invoker, escapePolicy: 'cancel' });
assert.equal(documentRoot.activeElement, first, 'focus enters at declared target');
assert.equal(focusLayer.depth(), 1);
assert.equal(focusLayer.moveRoving(layerElement, 'End', 'button'), true);
assert.equal(documentRoot.activeElement, last, 'End moves to the final roving choice');
assert.equal(focusLayer.moveRoving(layerElement, 'Home', 'button'), true);
assert.equal(documentRoot.activeElement, first, 'Home moves to the first roving choice');
assert.equal(focusLayer.moveRoving(layerElement, 'ArrowDown', 'button'), true);
assert.equal(documentRoot.activeElement, last, 'ArrowDown moves to the next roving choice');
documentRoot.activeElement = first;
let prevented = false;
focusLayer.trapTab({ key: 'Tab', shiftKey: false, preventDefault: () => { prevented = true; }, stopPropagation: () => {} });
assert.equal(prevented, true);
assert.equal(documentRoot.activeElement, last, 'Tab advances within the top layer');
documentRoot.activeElement = first;
prevented = false;
focusLayer.trapTab({ key: 'Tab', shiftKey: true, preventDefault: () => { prevented = true; }, stopPropagation: () => {} });
assert.equal(prevented, true);
assert.equal(documentRoot.activeElement, last, 'Shift+Tab wraps backward inside the top layer');
focusLayer.close(layerElement);
assert.equal(documentRoot.activeElement, invoker, 'focus returns to the surviving invoker');
assert(diagnostics.some((entry) => entry.type === 'focus.restored'));

function focusContainer(id, nodes, documentRoot, replacements = {}) {
  const container = {
    id, tagName: 'DIALOG', isConnected: true, hidden: false, disabled: false, dataset: {},
    getClientRects: () => [1], focus: () => { documentRoot.activeElement = container; }, scrollIntoView: () => {},
    contains: (node) => nodes.includes(node), querySelectorAll: () => nodes,
    querySelector: (selector) => {
      const stable = selector.match(/\[data-stable-id="([^"]+)"\]/)?.[1];
      if (stable) return replacements[stable] || nodes.find((node) => node.dataset?.stableId === stable) || null;
      const byId = selector.match(/^#(.+)$/)?.[1];
      if (byId) return nodes.find((node) => node.id === byId) || null;
      if (selector.includes('first') || selector.includes('button')) return nodes[0] || null;
      return null;
    },
  };
  return container;
}

const parentFirst = focusNode('parent-first', documentRoot);
const parentNonFirst = focusNode('parent-non-first', documentRoot);
parentNonFirst.dataset.stableId = 'object:42';
const parent = focusContainer('parent', [parentFirst, parentNonFirst], documentRoot);
const childFirst = focusNode('child-first', documentRoot);
const child = focusContainer('child', [childFirst], documentRoot);
documentRoot.activeElement = invoker;
focusLayer.open({ id: 'parent', element: parent, initialFocus: parentFirst, returnFocus: invoker, domain: 'items' });
documentRoot.activeElement = parentNonFirst;
focusLayer.open({ id: 'child', element: child, initialFocus: childFirst, domain: 'items' });
focusLayer.close(child);
assert.equal(documentRoot.activeElement, parentNonFirst, 'closing a nested layer restores the actual non-first context invoker');

const grandchildFirst = focusNode('grandchild-first', documentRoot);
const grandchild = focusContainer('grandchild', [grandchildFirst], documentRoot);
focusLayer.open({ id: 'child', element: child, initialFocus: childFirst, invoker: parentNonFirst, domain: 'items' });
focusLayer.open({ id: 'grandchild', element: grandchild, initialFocus: grandchildFirst, invoker: childFirst, domain: 'interaction' });
focusLayer.close(grandchild);
assert.equal(documentRoot.activeElement, childFirst, 'first nested close returns to the immediate child invoker');
focusLayer.close(child);
assert.equal(documentRoot.activeElement, parentNonFirst, 'second nested close returns to the parent context invoker');
focusLayer.close(parent);
assert.equal(documentRoot.activeElement, invoker, 'final nested close returns to the original domain invoker');

const helpInvoker = focusNode('help-button', documentRoot);
const helpFilter = focusNode('document-filter', documentRoot);
const documentLayer = focusContainer('document-dialog', [helpFilter], documentRoot);
documentRoot.activeElement = helpInvoker;
focusLayer.open({ id: 'document', element: documentLayer, initialFocus: helpFilter, returnFocus: map, domain: 'document' });
focusLayer.close(documentLayer);
assert.equal(documentRoot.activeElement, helpInvoker, 'document close prefers its actual Help invoker over a hard-coded map return');

const oldRow = focusNode('old-row', documentRoot);
oldRow.dataset.stableId = 'object:77';
const replacementRow = focusNode('replacement-row', documentRoot);
replacementRow.dataset.stableId = 'object:77';
const surviving = focusContainer('surviving', [replacementRow], documentRoot, { 'object:77': replacementRow });
const transient = focusContainer('transient', [childFirst], documentRoot);
documentRoot.activeElement = invoker;
focusLayer.open({ id: 'surviving', element: surviving, initialFocus: replacementRow, domain: 'items' });
oldRow.isConnected = true;
documentRoot.activeElement = oldRow;
focusLayer.open({ id: 'transient', element: transient, initialFocus: childFirst, domain: 'items' });
oldRow.isConnected = false;
focusLayer.close(transient);
assert.equal(documentRoot.activeElement, replacementRow, 'a disappearing invoker restores its stable-ID replacement in the surviving layer');
const vanishedWithoutReplacement = focusNode('vanished-without-replacement', documentRoot);
documentRoot.activeElement = vanishedWithoutReplacement;
focusLayer.open({ id: 'transient-no-replacement', element: transient, initialFocus: childFirst, domain: 'items' });
vanishedWithoutReplacement.isConnected = false;
focusLayer.close(transient);
assert.equal(documentRoot.activeElement, replacementRow, 'missing nested invoker uses the surviving layer before the configured map fallback');
focusLayer.close(surviving, { restore: false });

const disappearingInvoker = focusNode('gone', documentRoot);
const mapFallbackLayer = focusContainer('map-fallback-dialog', [childFirst], documentRoot);
documentRoot.activeElement = disappearingInvoker;
focusLayer.open({ id: 'map-fallback', element: mapFallbackLayer, initialFocus: childFirst, returnFocus: null, domain: 'unknown' });
disappearingInvoker.isConnected = false;
focusLayer.close(mapFallbackLayer);
assert.equal(documentRoot.activeElement, map, 'map is the final fallback when invoker and domain controls disappear');

const delayedTasks = [];
const delayedFocus = Focus.createFocusLayer({
  documentRoot,
  fallbackFocus: map,
  setTimeout: (fn) => { delayedTasks.push(fn); return delayedTasks.length; },
  clearTimeout: () => {},
});
documentRoot.activeElement = invoker;
delayedFocus.open({ id: 'delayed-dialog', element: layerElement, initialFocus: first, focusDelayMs: 120 });
assert.equal(documentRoot.activeElement, invoker, 'deferred focus leaves the native dialog opening event time to settle');
assert.equal(delayedTasks.length, 1);
delayedTasks[0]();
assert.equal(documentRoot.activeElement, first, 'deferred focus enters the declared initial control');
delayedFocus.close(layerElement, { restore: false });

let nativeCloseHandler = null;
const reusedDialog = {
  id: 'reused-dialog', tagName: 'DIALOG', open: false, isConnected: true, hidden: false, disabled: false, dataset: {},
  getClientRects: () => [1], focus: () => { documentRoot.activeElement = reusedDialog; }, scrollIntoView: () => {},
  querySelectorAll: () => [first], querySelector: () => first,
  addEventListener: (type, handler) => { if (type === 'close') nativeCloseHandler = handler; },
  removeEventListener: () => {},
};
focusLayer.register(reusedDialog, { id: 'reused-dialog', initialFocus: first });
reusedDialog.open = true;
focusLayer.open({ id: 'reused-dialog', element: reusedDialog, initialFocus: first });
nativeCloseHandler();
assert.equal(focusLayer.depth(), 1, 'a delayed native close event cannot remove an already reopened dialog layer');
reusedDialog.open = false;
nativeCloseHandler();
assert.equal(focusLayer.depth(), 0, 'a native close event removes the closed dialog layer');

const stale = Failure.presentFailure({ id: 'stale-1', blockerToken: 'blocked.input.staleRevision', reason: 'revision changed', transactionId: 'tx-1' });
assert.equal(stale.notice.message, 'That item moved. Refresh the list and try again.');
assert.equal(stale.preserveSelection, true);
assert.equal(stale.preserveScroll, true);
assert.equal(stale.refreshRequired, true);
assert.equal(stale.retry, false);
for (const kind of ['prompt-conflict', 'menu-conflict', 'transfer-conflict', 'process-exit', 'recovery-failed', 'interrupted', 'rejected', 'timeout']) {
  const model = Failure.presentFailure({ id: `failure:${kind}`, kind, reason: kind });
  assert.equal(model.retry, false, `${kind} never requests automatic retry`);
  assert(model.notice.message);
}
assert.equal(Failure.presentFailure({ blockerToken: 'blocked.armor.removeOuterFirst' }).notice.message, 'Remove outer armor layers first.');
assert.equal(Failure.isBenignCancellationRejection({ event: { name: 'bridge_prompt_answer.cancelled', keycode: 27 } }), true, 'expected core prompt cancellation is not a player-facing failure');
assert.equal(Failure.isBenignCancellationRejection({ event: { name: 'bridge_line_answer.cancelled' } }), true, 'expected core line-input cancellation is not a player-facing failure');
assert.equal(Failure.isBenignCancellationRejection({ event: { name: 'bridge_menu_answer.cancelled' } }), true, 'expected core menu cancellation is not a player-facing failure');
assert.equal(Failure.isBenignCancellationRejection({ event: { name: 'bridge_menu_answer', return: 0, selector: 0, selections: '' } }), true, 'normalized empty menu answer is treated as the same expected cancellation');
assert.equal(Failure.isBenignCancellationRejection({ event: { name: 'bridge_menu_answer', return: 1, selector: 97, selections: 'a' } }), false, 'a completed menu selection is not misclassified as cancellation');
assert.equal(Failure.isBenignCancellationRejection({ result: { kind: 'bridge_prompt_answer.cancelled' }, transaction: { interactions: [{ kind: 'answer-key', key: '\u001b' }] } }), true, 'completed prompt cancellation is not a player-facing failure');
assert.equal(Failure.isBenignCancellationRejection({ result: { kind: 'bridge_menu_answer.cancelled' }, transaction: { interactions: [{ kind: 'answer-key', key: '\u001b' }] } }), true, 'completed menu cancellation is not a player-facing failure');
assert.equal(Failure.isBenignCancellationRejection({ result: { kind: 'bridge_menu_answer.cancelled', actionId: 'interaction.cancel' }, transaction: { semanticAction: 'cancel', semanticActionId: 'interaction.cancel', interactions: [] } }), true, 'GUI-owned inventory Escape remains benign when the bridge records cancellation without an answer-key interaction');
assert.equal(Failure.isBenignCancellationRejection({ result: { kind: 'bridge_menu_answer.cancelled' }, transaction: { semanticAction: 'key i', interactions: [] } }), false, 'a cancellation-shaped result without explicit cancel intent or an Escape answer remains visible');
assert.equal(Failure.isBenignCancellationRejection({ event: { name: 'command.rejected', keycode: 27 } }), false, 'unrelated rejections remain visible failures');

const saveStarted = CommandTransaction.beginTransaction(CommandTransaction.emptyState(), { keycode: 'S'.charCodeAt(0), transactionId: 'save-accepted' }, { now: 1 });
assert.equal(saveStarted.transaction.semanticActionId, 'run.save-and-exit', 'uppercase S has a stable typed Save action id');
assert.equal(saveStarted.transaction.semanticAction, 'save and exit');
const saveAccepted = CommandTransaction.completeFromSnapshots(saveStarted.state, { transactionId: 'save-accepted' }, { previousInventory: {}, previousEquipment: {}, nextInventory: {}, nextEquipment: {}, now: 2 });
assert.equal(saveAccepted.transaction.result.status, 'success');
assert.equal(saveAccepted.transaction.result.actionId, 'run.save-and-exit', 'accepted Save acknowledgement preserves the typed result id');
const saveFailedStart = CommandTransaction.beginTransaction(CommandTransaction.emptyState(), { keycode: 'S'.charCodeAt(0), transactionId: 'save-failed' });
const saveFailed = CommandTransaction.failTransaction(saveFailedStart.state, { transactionId: 'save-failed', name: 'command.rejected' }, 'storage failed');
assert.equal(saveFailed.transaction.result.status, 'failure');
assert.equal(saveFailed.transaction.result.actionId, 'run.save-and-exit', 'failed Save cannot lose its typed result id');
const saveCancelledStart = CommandTransaction.beginTransaction(CommandTransaction.emptyState(), { keycode: 'S'.charCodeAt(0), transactionId: 'save-cancelled' });
const saveCancelledNoted = CommandTransaction.noteInteraction(saveCancelledStart.state, 'save-cancelled', { kind: 'answer-key', key: '\u001b' });
const saveCancelled = CommandTransaction.failTransaction(saveCancelledNoted.state, { transactionId: 'save-cancelled', name: 'bridge_prompt_answer.cancelled' }, 'cancelled');
assert.equal(saveCancelled.transaction.result.status, 'failure');
assert.equal(saveCancelled.transaction.interactions.some((entry) => entry.key === '\u001b'), true, 'cancelled Save remains cancellation, not success');

const planner = Interaction.createInteractionPlanner();
const directionInput = {
  gameView: {
    interactionLifecycleRevision: 1,
    activePrompt: { kind: 'question', query: 'In what direction?', choices: 'hjklyubn.', requestId: 'direction-1', lifecycleRevision: 1 },
    currentMenu: null,
    cursor: { x: 0, y: 0 },
    mapCells: [[{}]],
    mapWidth: 1,
    mapHeight: 1,
  },
  running: true,
  playable: true,
};
const directionDecision = planner.decide(directionInput);
assert.equal(directionDecision.owner.kind, 'prompt', 'a native direction prompt owns input ahead of gameplay context');
assert.equal(directionDecision.prompt.classification, 'direction');
assert.equal(directionDecision.prompt.title, 'Choose direction');
assert.equal(directionDecision.transition, 'opened');
assert.equal(Object.isFrozen(directionDecision), true, 'planner publications are immutable');
assert.equal(Object.isFrozen(directionDecision.prompt), true, 'nested prompt plans are immutable');
assert.strictEqual(planner.decide(directionInput), directionDecision, 'one immutable planner decision is reused for an unchanged interaction');
assert.equal(planner.decide(directionInput).decisionSequence, 1, 'unchanged consumers cannot create parallel decisions for one interaction');

const overlappingPrompt = planner.decide({
  ...directionInput,
  gameView: {
    ...directionInput.gameView,
    interactionLifecycleRevision: 2,
    activePrompt: { kind: 'question', query: 'Really open it?', choices: 'yn', requestId: 'prompt-2', lifecycleRevision: 2 },
    currentMenu: { awaitingSelection: true, how: 1, prompt: 'Pick one', requestId: 'menu-2', lifecycleRevision: 2, items: [{ selector: 97, text: 'a - option', objectId: 71, semanticKind: 'object' }] },
  },
  contextualPrompt: { kind: 'locked-door' },
});
assert.equal(overlappingPrompt.owner.kind, 'prompt', 'an explicit NetHack follow-up prompt outranks menu and contextual owners');
assert.equal(overlappingPrompt.transition, 'replaced');

const equipmentDecision = planner.decide({
  ...directionInput,
  gameView: {
    ...directionInput.gameView,
    interactionLifecycleRevision: 3,
    activePrompt: { kind: 'menu selection', requestId: 'equipment-menu', lifecycleRevision: 3 },
    currentMenu: { awaitingSelection: true, how: 1, prompt: 'Take off what?', requestId: 'equipment-menu', lifecycleRevision: 3, items: [{ selector: 97, text: 'a - a robe (being worn)', objectId: 72, menuRole: 'equipment' }] },
  },
  equipment: { id: 'equipment-owner', ownsMenu: true },
  transfer: { id: 'transfer-owner', ownsMenu: true },
  contextualPrompt: { kind: 'locked-door' },
});
assert.equal(equipmentDecision.owner.kind, 'equipment', 'equipment ownership outranks transfer, native menu, and context owners');

const transferDecision = planner.decide({
  ...directionInput,
  gameView: {
    ...directionInput.gameView,
    interactionLifecycleRevision: 4,
    activePrompt: { kind: 'menu selection', requestId: 'transfer-menu', lifecycleRevision: 4 },
    currentMenu: { awaitingSelection: true, how: 2, prompt: 'Take out what?', requestId: 'transfer-menu', lifecycleRevision: 4, items: [{ selector: 97, text: 'a - a potion', objectId: 73, quantity: 2 }] },
  },
  transfer: { id: 'transfer-owner', ownsMenu: true },
  contextualPrompt: { kind: 'locked-door' },
});
assert.equal(transferDecision.owner.kind, 'transfer', 'transfer ownership outranks a native menu and contextual owner');
assert.equal(transferDecision.menu.options[0].objectId, 73, 'native menu object identity survives planning');
assert.equal(transferDecision.menu.options[0].quantity, 2, 'native menu quantity metadata survives planning');

const contextDecision = planner.decide({
  ...directionInput,
  gameView: { ...directionInput.gameView, interactionLifecycleRevision: 5, activePrompt: null, currentMenu: null },
  contextualPrompt: { kind: 'locked-door', message: 'This door is locked.', direction: 'l', directionLabel: 'east', tools: [{ selector: 'a', label: 'lock pick' }] },
});
assert.equal(contextDecision.owner.kind, 'context-dialog', 'context dialog owns input only after prompt, equipment, transfer, and menu owners are absent');
assert.equal(contextDecision.contextDialog.title, 'Locked door actions');
assert(contextDecision.contextDialog.options.some((option) => option.id === 'unlock:a' && /lock pick/.test(option.label)), 'locked-door option planning stays inside the interaction planner');

const closedDecision = planner.decide({
  ...directionInput,
  gameView: { ...directionInput.gameView, interactionLifecycleRevision: 6, activePrompt: null, currentMenu: null },
  contextualPrompt: null,
});
assert.equal(closedDecision.owner.kind, 'gameplay');
assert.equal(closedDecision.transition, 'closed', 'planner publishes the close lifecycle transition once the last interaction owner leaves');

assert.equal(Interaction.dialogFamilyForPrompt({ kind: 'line input' }), 'form');
assert.equal(Interaction.dialogFamilyForPrompt({ kind: 'extended command' }), 'command');
assert.equal(Interaction.dialogFamilyForPrompt({ kind: 'question', query: 'Really quit?', choices: 'yn' }), 'confirmation');
assert.equal(Interaction.dialogFamilyForPrompt({ kind: 'question', query: 'What do you want to eat?', choices: 'ab' }), 'single-select');
assert.equal(Interaction.dialogFamilyForMenu({ awaitingSelection: true, how: 2, prompt: 'Pick up what?', items: [{ selector: 97, text: 'a - an apple' }] }), 'multi-select');
assert.equal(Interaction.dialogFamilyForMenu({ awaitingSelection: true, how: 0, prompt: 'Tip', items: [{ selector: 0, text: 'Tip: stay alert.' }] }), 'document');

const webCancellation = Interaction.cancellationPlanForPrompt({ kind: 'question', query: 'Really step into that web?', choices: 'yn' });
assert.deepEqual(webCancellation, { key: 'n', kind: 'fixed-choice-no', acknowledgementEvent: 'bridge_prompt_answer', canonicalChoice: true }, 'Escape on a y/n confirmation uses the same safe no response as the classic tty port');
assert.deepEqual(Interaction.cancellationPlanForPrompt({ kind: 'question', query: 'Drink from the fountain?', choices: 'ynq' }), { key: 'q', kind: 'fixed-choice-quit', acknowledgementEvent: 'bridge_prompt_answer', canonicalChoice: true }, 'Escape on a ynq prompt uses the classic quit response');
assert.deepEqual(Interaction.cancellationPlanForPrompt({ kind: 'question', query: 'Really attack?', choices: `yn\u001b` }), { key: 'n', kind: 'fixed-choice-no', acknowledgementEvent: 'bridge_prompt_answer', canonicalChoice: true }, 'an ESC sentinel in fixed choices does not bypass classic y/n Escape translation');
assert.deepEqual(Interaction.cancellationPlanForPrompt({ kind: 'question', query: 'Itemized billing?', choices: 'ynq m' }), { key: 'q', kind: 'fixed-choice-quit', acknowledgementEvent: 'bridge_prompt_answer', canonicalChoice: true }, 'custom yes/no families retain classic q-first Escape cancellation');
assert.deepEqual(Interaction.cancellationPlanForMenu({ awaitingSelection: true, how: 2 }), { key: '\u001b', kind: 'menu-cancel', acknowledgementEvent: 'bridge_menu_answer', canonicalChoice: false }, 'menus retain native Escape cancellation');
assert.deepEqual(Interaction.cancellationPlanForPrompt({ kind: 'line input', query: 'What do you want to engrave?' }), { key: '\u001b', kind: 'line-input-cancel', acknowledgementEvent: 'bridge_line_answer', canonicalChoice: false }, 'text prompts retain native Escape cancellation');
assert.deepEqual(Interaction.cancellationPlanForPrompt({ kind: 'question', query: 'In what direction?', choices: `hjklyubn.\u001b` }), { key: '\u001b', kind: 'direction-cancel', acknowledgementEvent: 'bridge_prompt_answer', canonicalChoice: false }, 'direction prompts retain core-owned Escape semantics');
assert.deepEqual(Interaction.cancellationPlanForPrompt({ kind: 'question', query: 'What do you want to read?', choices: `ab?*\u001b` }), { key: '\u001b', kind: 'escape', acknowledgementEvent: 'bridge_prompt_answer', canonicalChoice: false }, 'item selectors retain native Escape instead of being globally coerced');
assert.deepEqual(Interaction.cancellationPlanForPrompt({ kind: 'question', query: 'What do you want to name?', choices: `qny\u001b` }), { key: '\u001b', kind: 'escape', acknowledgementEvent: 'bridge_prompt_answer', canonicalChoice: false }, 'inventory selectors containing q/n/y are not mistaken for yes/no prompts');
const cloneIngress = (event) => JSON.parse(JSON.stringify(ShimProtocol.normalizeRawShimEvent(event))).event;
assert.equal(Object.prototype.hasOwnProperty.call(cloneIngress({ name: 'bridge_line_answer', requestId: 'line-owner' }), 'value'), false, 'production normalization and preload clone preserve a missing line response');
assert.equal(cloneIngress({ name: 'bridge_line_answer', value: '', requestId: 'line-owner' }).value, '', 'production normalization and preload clone preserve explicit empty line cancellation');
assert.equal(Object.prototype.hasOwnProperty.call(cloneIngress({ name: 'bridge_menu_answer', requestId: 'menu-owner' }), 'return'), false, 'production normalization and preload clone preserve a missing menu response');
assert.equal(cloneIngress({ name: 'bridge_menu_answer', return: 0, requestId: 'menu-owner' }).return, 0, 'production normalization and preload clone preserve explicit menu cancellation');
const selectedMenuAnswer = cloneIngress({
  name: 'bridge_menu_answer',
  window: 5,
  return: 1,
  selector: 97,
  selectors: 'a',
  requestId: 'spell-menu-r3',
  menuRequestId: 'spell-menu-r3',
  transactionId: 'cast-command',
  inputTransactionId: 'spell-selection-command',
  inputMatchesMenuTransaction: false,
  lifecycleRevision: 3,
});
assert.equal(selectedMenuAnswer.name, 'bridge_menu_answer', 'a native menu selection remains a menu answer when the selection key has its own bridge transaction');
assert.equal(selectedMenuAnswer.transactionId, 'cast-command', 'menu answer retains the transaction that opened the menu');
assert.equal(selectedMenuAnswer.inputTransactionId, 'spell-selection-command', 'menu answer separately retains the transaction that supplied the selector');
assert.deepEqual(cloneIngress({ name: 'bridge_extcmd_answer', return: -1, value: '', requestId: 'ext-owner' }), { name: 'bridge_extcmd_answer', return: -1, value: '', requestId: 'ext-owner' }, 'production normalization preserves exact extcmd cancellation fields without inventing command');

const html = fs.readFileSync(path.join(root, 'src/renderer.html'), 'utf8');
const noticeSource = fs.readFileSync(path.join(root, 'src/ux/player-notice.js'), 'utf8');
assert.equal((html.match(/aria-live=/g) || []).length, 0, 'static compatibility presenters contain no custom live regions');
assert.doesNotMatch(noticeSource, /ariaNotify|aria-live|ux-live-(?:polite|assertive)/, 'PlayerNotice is visual product feedback without custom speech channels');
assert.doesNotMatch(html, /interaction-role-cue|ux-visually-hidden[^>]*>Dialog\./, 'dialogs contain no screen-reader-only role cue text');
const rendererSource = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8');
for (const phrase of ['version check passed', 'command completed:', 'menu awaiting item selection']) {
  assert(!new RegExp(`setStatus\\([^\\n]*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(rendererSource), `${phrase} is not written to player chrome`);
}
assert.match(rendererSource, /status\.diagnostic-only/, 'setStatus is diagnostics-only compatibility code');
assert.match(rendererSource, /prompt\.cancellation\.acknowledged/, 'typed cancellation acknowledgement is recorded');
assert.match(rendererSource, /exposedRequestIds\.every\(\(requestId\) => requestId && expectedRequestId === requestId\)/, 'typed cancellation acknowledgement fails closed unless every exposed request owner is non-empty and exact');
assert.match(rendererSource, /const responseEvent = rawEvent;/, 'typed cancellation acknowledgement validates the authoritative normalized renderer event');
assert.match(rendererSource, /responseEvent\.keycode <= 255/, 'typed cancellation acknowledgement rejects wrapping or out-of-range prompt keycodes');
assert.match(rendererSource, /transportMatches && requestMatches && transactionMatches && exactOwnedMenuIdentity && keyMatches/, 'typed cancellation acknowledgement requires transport, request, optional transaction, exact menu ownership, and response-key agreement');
assert.match(rendererSource, /prompt\.cancellation\.acknowledgement-unowned/, 'unowned cancellation answers emit a bounded diagnostic');
assert.match(rendererSource, /pendingPromptCancellation = null;\n  }\n  if \(rawEvent/, 'every bridge cancellation answer consumes the one-shot pending record');
assert.match(rendererSource, /guiActionId: 'interaction\.cancel'/, 'one typed cancel input identifies its semantic intent');
assert.match(rendererSource, /command\.cancellation-rejection-suppressed/, 'expected prompt cancellation bookkeeping is diagnostic-only');

console.log('UXM-01 interaction foundation contract PASS');
