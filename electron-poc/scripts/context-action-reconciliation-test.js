'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const root = path.resolve(__dirname, '..');

function rendererContract() {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const originalDecision = interactionDecision;
  const originalDispatch = runContextAction;
  const bar = document.getElementById('context-action-bar');
  const sent = [];
  const search = { id: 'search', label: 'Search', title: 'Search', primary: true, command: 'key', key: 's' };
  const wait = { id: 'wait', label: 'Wait', title: 'Wait', command: 'keys', keys: 'm.' };
  const more = { id: 'more', label: 'More', title: 'More', command: 'more' };
  let actions = [search, wait, more];
  const observer = new MutationObserver(() => {});
  try {
    interactionDecision = () => ({ contextActions: actions });
    runContextAction = action => sent.push(action);
    renderContextActionBar();
    const nodes = Array.from(bar.children);
    const searchNode = nodes[0];
    searchNode.focus({ preventScroll: true });
    const animations = searchNode.getAnimations();
    observer.observe(bar, { childList: true, subtree: true, attributes: true, characterData: true });
    for (let i = 0; i < 5; i += 1) {
      actions = actions.map(action => ({ ...action }));
      renderContextActionBar();
    }
    check(observer.takeRecords().length === 0, 'identical actions must not mutate the bar');
    check(nodes.every((node, i) => node === bar.children[i]), 'identical actions must retain every node');
    check(document.activeElement === searchNode, 'identical actions must retain focus');
    const container = { id: 'open-container', label: 'Open box', title: 'Open box', command: 'ext', ext: 'loot', targetObjectId: 1 };
    actions = [container, search, wait, more];
    renderContextActionBar();
    const boxNode = bar.firstElementChild;
    check(bar.children[1] === searchNode, 'insertion must preserve Search');
    check(searchNode.getAnimations().every(animation => animations.includes(animation)), 'unrelated insertion must not restart Search animation');
    actions = [{ ...container, targetObjectId: 999 }, search, wait, more];
    renderContextActionBar();
    boxNode.click();
    check(sent.length === 1 && sent[0].targetObjectId === 999, 'reused listener must dispatch current nonvisual payload exactly once');
    actions = [{ ...container, label: 'Open chest', title: 'Updated title', primary: true }, search, wait, more];
    renderContextActionBar();
    check(bar.firstElementChild === boxNode && boxNode.textContent === 'Open chest' && boxNode.title === 'Updated title' && boxNode.classList.contains('primary-context'), 'visible changes must patch the same node');
    actions = [more, search, actions[0], wait];
    renderContextActionBar();
    check(Array.from(bar.children).map(node => node.dataset.contextActionId).join(',') === 'more,search,open-container,wait', 'reconciliation must preserve requested order');
    check(document.activeElement === searchNode, 'reordering must preserve surviving focus');
    check(searchNode.getAnimations().every(animation => animations.includes(animation)), 'reordering must not restart unchanged Search animation');
    actions = [search, wait];
    renderContextActionBar();
    check(!boxNode.isConnected && bar.children.length === 2, 'obsolete actions must be removed');
    boxNode.click();
    check(sent.length === 1, 'detached actions must not dispatch');
    actions = [container, search, wait];
    renderContextActionBar();
    check(bar.firstElementChild !== boxNode, 're-added action must have a fresh live node');
    boxNode.click();
    check(sent.length === 1, 'old node must not dispatch a re-added action');
    bar.firstElementChild.click();
    check(sent.length === 2 && sent[1].targetObjectId === 1, 're-added action must dispatch once');
    actions = [];
    renderContextActionBar();
    check(bar.children.length === 0, 'empty plan must remove all actions');
    return { identicalMutations: 0, nodeIdentity: true, freshPayload: true, selectiveChanges: true, orderAndFocus: true, detachedGuard: true, unchangedAnimation: true };
  } finally {
    observer.disconnect();
    interactionDecision = originalDecision;
    runContextAction = originalDispatch;
    renderContextActionBar();
  }
}

function toolbarContract() {
  const originalDecision = interactionDecision;
  const bar = document.getElementById('context-action-bar');
  const quick = document.getElementById('quick-actions');
  const before = { context: bar.getBoundingClientRect().height, quick: quick.getBoundingClientRect().height };
  try {
    const actions = Array.from({ length: 12 }, (_, index) => ({ id: `overflow-${index}`, label: `Open northeast container ${index + 1}`, title: 'Toolbar overflow verification', command: 'more' }));
    interactionDecision = () => ({ contextActions: actions });
    renderContextActionBar();
    const bounds = bar.getBoundingClientRect();
    if (bounds.height !== before.context || quick.getBoundingClientRect().height !== before.quick) throw new Error('More actions changed toolbar height');
    const children = Array.from(bar.children);
    if (new Set(children.map(node => Math.round(node.getBoundingClientRect().top))).size !== 1) throw new Error('Contextual actions wrapped onto multiple rows');
    if (bar.scrollWidth <= bar.clientWidth) throw new Error('Overflow case did not exercise scrolling');
    const last = bar.lastElementChild;
    last.focus();
    const lastBounds = last.getBoundingClientRect();
    if (bar.scrollLeft <= 0 || lastBounds.right > bounds.right + 1 || lastBounds.left < bounds.left) throw new Error('Keyboard focus did not reveal overflowed action');
    if (document.documentElement.scrollWidth > innerWidth) throw new Error('Toolbar overflow escaped into the page');
    return { heights: before, count: children.length, singleRow: true, overflowKeyboardReachable: true };
  } finally {
    interactionDecision = originalDecision;
    renderContextActionBar();
    bar.scrollLeft = 0;
    document.getElementById('game-grid').focus({ preventScroll: true });
  }
}

async function nativeStep(page) {
  const before = await page.evalCheckedValue(`(() => {
    const grid = document.getElementById('game-grid');
    const cursor = grid.querySelector('.tile-cell.cursor');
    if (!cursor) throw new Error('Missing native cursor');
    const x = Number(cursor.dataset.mapX), y = Number(cursor.dataset.mapY);
    const directions = [['h', -1, 0], ['l', 1, 0], ['j', 0, 1], ['k', 0, -1]];
    const target = directions.map(([key, dx, dy]) => {
      const cell = grid.querySelector('[data-map-x="' + (x + dx) + '"][data-map-y="' + (y + dy) + '"]');
      return { key, x: x + dx, y: y + dy, cell };
    }).find(({cell}) => cell && /floor|corridor/.test(cell.dataset.tileId || '') && !/pet|monster|object|item|trap/.test(cell.dataset.semanticKind || ''));
    if (!target) throw new Error('No safe visible floor neighbor for native movement');
    window.contextMovementBefore = Array.from(document.querySelectorAll('#context-action-bar button')).map(node => ({ node, id: node.dataset.contextActionId, label: node.textContent, title: node.title, primary: node.classList.contains('primary-context'), animations: node.getAnimations() }));
    // Track real intermediate plans: pets can leave and re-enter a direction
    // during one native turn. Those are genuine removals, not unchanged rows.
    window.contextMovementOriginalDecision = interactionDecision;
    interactionDecision = (...args) => {
      const plan = window.contextMovementOriginalDecision(...args);
      if (args[0] === 'render-context-actions') {
        for (const prior of window.contextMovementBefore) {
          const action = plan.contextActions.find(candidate => candidate.id === prior.id);
          if (!action) prior.absent = true;
          else if (action.label !== prior.label || action.title !== prior.title || Boolean(action.primary) !== prior.primary) prior.visuallyChanged = true;
        }
      }
      return plan;
    };
    grid.focus({ preventScroll: true });
    return { from: {x,y}, to: {x:target.x,y:target.y}, key: target.key, revision: window.__nethackAutomation.state().commandTransactions.revision };
  })()`);
  await page.pressKey(before.key, before.key);
  await Harness.waitFor(async () => page.evalCheckedValue(`(() => {
    const cursor = document.querySelector('#game-grid .tile-cell.cursor');
    const commands = window.__nethackAutomation.state().commandTransactions;
    return Number(cursor?.dataset.mapX) === ${before.to.x} && Number(cursor?.dataset.mapY) === ${before.to.y} && commands.revision > ${before.revision} && commands.lastCompleted?.status === 'completed';
  })()`), 8000, 50);
  await page.evalCheckedValue('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))', { awaitPromise: true });
  const result = await page.evalCheckedValue(`(() => {
    interactionDecision = window.contextMovementOriginalDecision;
    let retained = 0;
    for (const prior of window.contextMovementBefore) {
      const current = Array.from(document.querySelectorAll('#context-action-bar button')).find(node => node.dataset.contextActionId === prior.id);
      if (prior.absent || prior.visuallyChanged || !current || current.textContent !== prior.label || current.title !== prior.title || current.classList.contains('primary-context') !== prior.primary) continue;
      if (current !== prior.node) throw new Error('Movement replaced unchanged action: ' + prior.id);
      if (current.getAnimations().some(animation => !prior.animations.includes(animation))) throw new Error('Movement restarted unchanged animation: ' + prior.id);
      retained += 1;
    }
    for (const id of ['search', 'wait']) {
      const prior = window.contextMovementBefore.find(entry => entry.id === id);
      if (!prior || prior.absent || prior.visuallyChanged || !prior.node.isConnected) throw new Error(id + ' must survive native movement continuously');
    }
    if (retained < 2) throw new Error('Search and Wait must survive native movement');
    return { retained, changedAvailability: window.contextMovementBefore.filter(entry => entry.absent).map(entry => entry.id) };
  })()`);
  return { ...before, ...result };
}

async function main() {
  const page = await Harness.createElectronBrowserDriver({ root, width: 1360, height: 920, env: { NETHACKOPTIONS: '!tutorial,!autopickup,time', NETHACK_SEED: '424242' } });
  const result = { runIdentity: page.outputIdentity, outputDir: page.outputDir, movements: [], toolbars: [], screenshots: [] };
  try {
    await page.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await page.clickStartShim();
    await page.waitForValue("document.getElementById('startup-choice-dialog').open", 10000);
    await page.click('#startup-new-game');
    await page.waitForValue("document.getElementById('character-dialog').open", 10000);
    await page.setInputValue('#player-role', 'Val');
    await page.setInputValue('#player-race', 'Hum');
    await page.setInputValue('#player-gender', 'Fem');
    await page.setInputValue('#player-align', 'Law');
    await page.setInputValue('#player-name', `ContextDiff${Date.now().toString(36).slice(-6)}`);
    await page.setInputValue('#game-seed', '424242');
    await page.click('#confirm-character');
    await Harness.waitFor(async () => page.evalCheckedValue("document.getElementById('intro-dialog').open"), 10000, 50);
    await page.dismissIntroDialogs();
    await Harness.waitFor(async () => page.evalCheckedValue("window.__nethackAutomation.state().runningState.running && !document.querySelector('dialog[open]') && !!document.querySelector('#game-grid .tile-cell.cursor')"), 10000, 50);
    result.renderer = await page.evalCheckedValue(`(${rendererContract.toString()})()`);
    for (const viewport of [{ width: 1360, height: 920 }, { width: 960, height: 720 }]) {
      await page.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
      result.toolbars.push({ viewport, ...await page.evalCheckedValue(`(${toolbarContract.toString()})()`) });
      for (let i = 0; i < 4; i += 1) result.movements.push({ viewport, ...await nativeStep(page) });
      const screenshot = path.join(page.outputDir, `native-context-${viewport.width}x${viewport.height}.png`);
      await page.screenshot(screenshot);
      result.screenshots.push(screenshot);
    }
    assert.equal(result.movements.length, 8);
    fs.writeFileSync(path.join(page.outputDir, 'context-action-reconciliation-result.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    await page.close();
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
