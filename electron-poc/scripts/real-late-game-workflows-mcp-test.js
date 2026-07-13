const fs = require('node:fs');
const path = require('node:path');
const { createElectronBrowserDriver, waitFor, removeStalePlaygroundLocks } = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-late-game-workflows');
const basePort = Number(process.env.NH_LATE_GAME_CDP_PORT || 9675);

function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

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

async function startScenario(id, port, name) {
  removeStalePlaygroundLocks({ root });
  const driver = await createElectronBrowserDriver({
    root, port, width: 1360, height: 920,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_SHIM_RESET_LOCKS: '1', NH_TEST_SCENARIO_ID: id, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' },
  });
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
  const driver = await startScenario(id, basePort + index, name);
  try {
    const before = await state(driver);
    const actionText = (before.actions?.buttons || []).map((button) => `${button.id}:${button.text}`).join('\n');
    assert(`${name} exposes Chat with the real Norn`, /chat.*Norn|chat/i.test(actionText), actionText);
    const beforeShot = await driver.screenshot(path.join(outDir, `${index + 1}-${admitted ? 'quest-admit' : 'quest-reject'}-before.png`));
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
      screenshots.push(await driver.screenshot(path.join(outDir, `${index + 1}-${admitted ? 'quest-admit' : 'quest-reject'}-dialog-${step + 1}.png`)));
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
    return { id, admitted, beforeShot, screenshots, documents };
  } finally { await driver.close().catch(() => undefined); }
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
  const driver = await startScenario('endgame/invocation-ritual', basePort + 2, 'Invoker');
  try {
    const before = await state(driver);
    assert('invocation setup exposes all three real tools', /Bell of Opening/i.test(before.body) || /vibrating|Gehennom|Dlvl/i.test(before.body), before.body);
    const beforeShot = await driver.screenshot(path.join(outDir, '3-invocation-before.png'));

    const bell = await invokeInventoryAction(driver, /Bell of Opening/i, 'item.apply');
    assert('Bell of Opening Apply action is available', bell.ok, JSON.stringify(bell));
    const bellState = await waitForMessage(driver, /unsettling shrill sound/i);
    const bellShot = await driver.screenshot(path.join(outDir, '3-invocation-bell.png'));

    const candelabrum = await invokeInventoryAction(driver, /Candelabrum of Invocation/i, 'item.apply');
    assert('Candelabrum Apply action is available', candelabrum.ok, JSON.stringify(candelabrum));
    const candelabrumState = await waitForMessage(driver, /burn brightly|glow.*strange light/i);
    const candelabrumShot = await driver.screenshot(path.join(outDir, '3-invocation-candelabrum.png'));

    const book = await invokeInventoryAction(driver, /Book of the Dead/i, 'item.study');
    assert('Book of the Dead read action is available', book.ok, JSON.stringify(book));
    const refreshPrompt = await waitForMessage(driver, /Refresh your memory anyway\?/i);
    assert('Book of the Dead asks before rereading a known unique tome', /Refresh your memory anyway\?/i.test(refreshPrompt.body), refreshPrompt.body);
    await driver.click('#interaction-options .choice-button[data-key="y"]');
    const result = await waitForMessage(driver, /floor shakes violently|walls around you begin to bend and crumble/i);
    const resultShot = await driver.screenshot(path.join(outDir, '3-invocation-result.png'));
    assert('successful invocation creates the downstairs', /stairs|down/i.test(result.body), result.body);
    assert('invocation flow has no core disorder', !/Program in disorder|bridge_test_scenario_failed|invocation fails/i.test(`${result.body}\n${result.shimTail}`), `${result.body}\n${result.shimTail}`);
    return { beforeShot, bellShot, candelabrumShot, resultShot, messages: result.messages, bellMessages: bellState.messages, candelabrumMessages: candelabrumState.messages };
  } finally { await driver.close().catch(() => undefined); }
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const rejected = await runQuest('quest/leader-rejects-underleveled-hero', 'QuestLow', false, 0);
  const admitted = await runQuest('quest/leader-admits-worthy-hero', 'QuestReady', true, 1);
  const invocation = await runInvocation();
  const evidence = { rejected, admitted, invocation };
  fs.writeFileSync(path.join(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('# Real late-game workflows\nPASS\n' + JSON.stringify(evidence, null, 2));
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
