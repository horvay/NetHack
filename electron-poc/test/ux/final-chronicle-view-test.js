const assert = require('node:assert/strict');
const FinalChronicle = require('../../src/ux/final-chronicle');

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.id = '';
    this.tabIndex = 0;
    this.scrollTop = 0;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatchEvent(event) {
    event.target ||= this;
    for (const listener of this.listeners.get(event.type) || []) listener(event);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; }
  close(value = '') { this.open = false; this.returnValue = value; }
  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child?.find?.(predicate);
      if (found) return found;
    }
    return null;
  }
}

class FakeDocument {
  constructor() { this.activeElement = null; }
  createElement(tagName) { return new FakeElement(tagName, this); }
}

function settledModel(runId) {
  return {
    runId,
    disclosureComplete: true,
    payload: {
      schema: FinalChronicle.payloadSchema,
      finalId: `final:${runId}`,
      runId,
      sequence: 1,
      finalized: true,
      cause: 'Killed by a grid bug.',
    },
  };
}

async function main() {
  const documentRoot = new FakeDocument();
  const mount = new FakeElement('div', documentRoot);
  const diagnostics = [];
  const actionErrors = [];
  const focusState = { layerOpen: false, closeCount: 0 };
  const focusLayer = {
    prepareOpen() {},
    open() { focusState.layerOpen = true; },
    close() { focusState.layerOpen = false; focusState.closeCount += 1; },
  };
  const view = FinalChronicle.createFinalChronicleView({
    mount,
    documentRoot,
    focusLayer,
    onDiagnostic: (entry) => diagnostics.push(entry),
    onActionError: (error, action) => actionErrors.push({ error, action }),
  });
  const newButton = view.dialog.find((element) => element.dataset.action === 'new-game');
  const exitButton = view.dialog.find((element) => element.dataset.action === 'exit');
  const actionError = view.dialog.find((element) => element.className === 'ux-final-chronicle-action-error');
  view.open(settledModel('terminal-actions'));

  function assertFailureSafe(label, expectedFocus = newButton) {
    assert.equal(view.isOpen(), true, `${label}: chronicle remains open`);
    assert.equal(focusState.layerOpen, true, `${label}: terminal focus layer remains owned`);
    assert.equal(focusState.closeCount, 0, `${label}: focus layer was not closed`);
    assert.equal(newButton.disabled, false, `${label}: New game action restored`);
    assert.equal(exitButton.disabled, false, `${label}: Exit action restored`);
    assert.equal(actionError.hidden, false, `${label}: visible non-destructive error is shown`);
    assert.match(actionError.textContent, /final chronicle is still open/i);
    assert.equal(documentRoot.activeElement, expectedFocus, `${label}: focus returns to the attempted action`);
  }

  assert.equal(await view.handleTerminalAction('new-game'), false);
  assertFailureSafe('missing handler');
  assert.equal(diagnostics.at(-1).detail.reason, 'missing-handler');

  assert.equal(await view.handleTerminalAction('exit', () => false), false);
  assertFailureSafe('explicit false', exitButton);
  assert.equal(diagnostics.at(-1).detail.reason, 'handler-declined');

  assert.equal(await view.handleTerminalAction('new-game', () => { throw new Error('sync failure'); }), false);
  assertFailureSafe('thrown error');
  assert.equal(actionErrors.at(-1).error.message, 'sync failure');

  assert.equal(await view.handleTerminalAction('exit', async () => { throw new Error('async failure'); }), false);
  assertFailureSafe('rejected Promise', exitButton);
  assert.equal(actionErrors.at(-1).error.message, 'async failure');

  let resolvePending;
  let handlerCalls = 0;
  const pending = view.handleTerminalAction('new-game', () => {
    handlerCalls += 1;
    return new Promise((resolve) => { resolvePending = resolve; });
  });
  assert.equal(newButton.disabled, true, 'pending terminal action disables New game');
  assert.equal(exitButton.disabled, true, 'pending terminal action disables Exit');
  assert.equal(await view.handleTerminalAction('new-game', () => { handlerCalls += 1; }), false, 'duplicate pending activation is rejected');
  assert.equal(handlerCalls, 1, 'duplicate pending activation cannot invoke a second handler');
  assert.equal(view.isOpen(), true, 'duplicate pending activation cannot close the chronicle');
  assert.equal(focusState.layerOpen, true, 'duplicate pending activation keeps the focus layer open');
  resolvePending(false);
  assert.equal(await pending, false);
  assertFailureSafe('pending handler declined');

  const success = await view.handleTerminalAction('new-game', async () => undefined);
  assert.equal(success, true, 'a present successful async handler may complete with no explicit value');
  assert.equal(view.isOpen(), false, 'successful handler closes the chronicle');
  assert.equal(focusState.layerOpen, false, 'successful handler closes the terminal focus layer');
  assert.equal(focusState.closeCount, 1, 'focus layer closes exactly once, only on success');
  assert.equal(view.dialog.returnValue, 'new-game');

  assert.equal(actionErrors.length, 5, 'missing, false, throw, reject, and pending false all invoke the owned action error hook');
  assert.equal(diagnostics.filter((entry) => entry.type === 'final-chronicle.terminal-action-failed').length, 5);
  console.log('UXM-07 final chronicle terminal action fail-closed contracts PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
