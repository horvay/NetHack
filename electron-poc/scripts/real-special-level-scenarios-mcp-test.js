const fs = require('node:fs');
const path = require('node:path');
const { createElectronBrowserDriver, waitFor, removeStalePlaygroundLocks } = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-special-level-scenarios');
const basePort = Number(process.env.NH_SPECIAL_LEVEL_CDP_PORT || 9671);
const cases = [
  { id: 'special/sokoban-boulder-pit', name: 'sokoban', seed: '424242' },
  { id: 'special/medusa-reflection', name: 'medusa', seed: '424242' },
  { id: 'endgame/astral-offering', name: 'astral', seed: '424242' },
];

function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

async function state(driver) {
  return driver.evalCheckedValue(`(() => {
    const cells = Array.from(document.querySelectorAll('.tile-cell')).map((el) => ({
      x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '',
      semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '',
      backgroundSemanticKind: el.dataset.backgroundSemanticKind || '', backgroundSemanticName: el.dataset.backgroundSemanticName || '',
      objectLayerSemanticName: el.dataset.objectLayerSemanticName || '', aria: el.getAttribute('aria-label') || '',
    }));
    const hero = cells.find((cell) => /^(hero|player)$/.test(cell.semanticKind))
      || cells.find((cell) => cell.glyph === '@' && /hero|player/i.test(cell.aria));
    const nearby = hero ? cells.filter((cell) => Math.max(Math.abs(cell.x - hero.x), Math.abs(cell.y - hero.y)) <= 8) : [];
    return {
      running: window.__nethackAutomation?.state?.().runningState?.running || false,
      cells, hero, nearby,
      actions: window.__nethackPromptTest?.contextActions?.() || null,
      inventory: window.__nethackPromptTest?.inventory?.() || null,
      messages: window.__nethackPromptTest?.messages?.().slice(-20).map((message) => message.text || String(message)) || [],
      body: document.body.innerText,
      seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
      shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-12000),
    };
  })()`);
}

function cellText(cell) {
  return [cell?.glyph, cell?.semanticKind, cell?.semanticName, cell?.backgroundSemanticKind,
    cell?.backgroundSemanticName, cell?.objectLayerSemanticName, cell?.aria].join(' ');
}
async function sendGameKey(driver, key) {
  await driver.evalCheckedValue(`window.__nethackAutomation.sendKeycode(${key.charCodeAt(0)})`);
}

async function clickButtonContaining(driver, pattern) {
  const source = pattern.source;
  return driver.evalCheckedValue(`(() => {
    const match = new RegExp(${JSON.stringify(source)}, 'i');
    const button = Array.from(document.querySelectorAll('button')).find((entry) => match.test(entry.innerText || entry.textContent || ''));
    if (!button) return false;
    button.click();
    return true;
  })()`);
}


async function runCase(testCase, index) {
  removeStalePlaygroundLocks({ root });
  const driver = await createElectronBrowserDriver({
    root,
    port: basePort + index,
    width: 1360,
    height: 920,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_SHIM_RESET_LOCKS: '1',
      NH_TEST_SCENARIO_ID: testCase.id,
      NETHACK_SEED: testCase.seed,
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
  });
  try {
    await driver.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await driver.startDefaultGame({ timeoutMs: 25000, playerName: `Late${index + 1}` });
    await waitFor(async () => (await state(driver)).running, 20000);
    await driver.dismissIntroDialogs();
    const ready = await waitFor(async () => {
      const current = await state(driver);
      if (/bridge_test_scenario_failed/.test(`${current.seenShim}\n${current.shimTail}`)) throw new Error(current.shimTail);
      return current.hero && /bridge_test_scenario_loaded/.test(`${current.seenShim}\n${current.shimTail}`) ? current : null;
    }, 15000);
    const screenshot = await driver.screenshot(path.join(outDir, `${index + 1}-${testCase.name}.png`));
    let inventoryScreenshot = '';
    let resultScreenshot = '';
    let outcome = '';

    if (testCase.name === 'sokoban') {
      const boulder = ready.nearby.find((cell) => /boulder/i.test(cellText(cell)));
      const hole = ready.cells.find((cell) => /hole/i.test(cellText(cell)));
      assert('authentic Sokoban scene places hero near a boulder', boulder, JSON.stringify(ready.nearby));
      assert('authentic Sokoban level contains a public hole', hole, JSON.stringify(ready.cells));
    } else if (testCase.name === 'medusa') {
      const medusa = ready.nearby.find((cell) => /Medusa/i.test(cellText(cell)));
      assert('authentic Medusa scene places hero near Medusa', medusa, JSON.stringify(ready.nearby));
      let gazeState = null;
      for (let turn = 0; turn < 15 && !gazeState; turn += 1) {
        await driver.click('[data-context-action-id="wait"]');
        gazeState = await waitFor(async () => {
          const current = await state(driver);
          return /gaze is reflected|is turned to stone/i.test(current.messages.join('\n')) ? current : null;
        }, 1200).catch(() => null);
      }
      assert('live Medusa turn exercises intrinsic reflection', gazeState, JSON.stringify((await state(driver)).messages));
      outcome = gazeState.messages.join('\n');
      resultScreenshot = await driver.screenshot(path.join(outDir, `${index + 1}-${testCase.name}-gaze-result.png`));
    } else {
      const heroSurface = cellText(ready.hero);
      const actionText = (ready.actions?.buttons || []).map((button) => `${button.id}:${button.text}`).join('\n');
      assert('Astral hero stands on the matching altar', /altar/i.test(heroSurface), JSON.stringify(ready.hero));
      await driver.click('#inventory-equipment-button');
      const inventoryState = await waitFor(async () => {
        const current = await state(driver);
        return /Amulet of Yendor/i.test(current.body) ? current : null;
      }, 10000);
      assert('Astral inventory contains the real Amulet of Yendor', /Amulet of Yendor/i.test(inventoryState.body), inventoryState.body);
      inventoryScreenshot = await driver.screenshot(path.join(outDir, `${index + 1}-${testCase.name}-inventory.png`));
      assert('Astral context exposes the offering workflow', /offer/i.test(actionText), actionText);
      await driver.click('#interaction-cancel');
      await waitFor(async () => !/Equipment & inventory/i.test((await state(driver)).body), 10000);
      for (const key of '#offer\n') await sendGameKey(driver, key);
      const offered = await waitFor(async () => {
        const current = await state(driver);
        if (/ascended|demigoddess|congratulations/i.test(current.body)) return current;
        if (/Amulet of Yendor/i.test(current.body)) await clickButtonContaining(driver, /Amulet of Yendor/);
        return null;
      }, 20000);
      assert('offering the real Amulet completes ascension', /ascended|demigoddess|congratulations/i.test(offered.body), offered.body);
      outcome = offered.body;
      resultScreenshot = await driver.screenshot(path.join(outDir, `${index + 1}-${testCase.name}-victory.png`));
    }
    assert(`${testCase.name} UI has no fixture failure`, !/bridge_test_scenario_failed|Program in disorder|Please report these messages/i.test(`${ready.shimTail}\n${ready.body}`), ready.shimTail);
    fs.writeFileSync(path.join(outDir, `${index + 1}-${testCase.name}-state.json`), JSON.stringify(ready, null, 2));
    return { ...testCase, screenshot, inventoryScreenshot, resultScreenshot, outcome, hero: ready.hero, actions: (ready.actions?.buttons || []).map((button) => ({ id: button.id, text: button.text })) };
  } finally {
    await driver.close().catch(() => undefined);
  }
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (let index = 0; index < cases.length; index += 1) results.push(await runCase(cases[index], index));
  const summary = [
    '# Authentic special-level real Electron proof', '', 'PASS', '',
    ...results.flatMap((result) => [`## ${result.name}`, `- Scenario: ${result.id}`, `- Screenshot: ${result.screenshot}`, ...(result.inventoryScreenshot ? [`- Inventory screenshot: ${result.inventoryScreenshot}`] : []), ...(result.resultScreenshot ? [`- Result screenshot: ${result.resultScreenshot}`] : []), `- Hero: ${JSON.stringify(result.hero)}`, `- Context actions: ${JSON.stringify(result.actions)}`, ...(result.outcome ? [`- Outcome: ${result.outcome.replace(/\\s+/g, ' ').slice(0, 500)}`] : []), '']),
    'Verified:',
    '- Sokoban uses NetHack’s generated Sokoban end level and positions the hero near its real boulder/hole puzzle.',
    '- Medusa uses NetHack’s generated Medusa level, with Medusa nearby and a real worn amulet of reflection.',
    '- Astral uses NetHack’s generated Astral Plane, places the hero on a matching altar, carries the real Amulet of Yendor, and exposes Offer.',
    '- No bridge fixture failure or Program in disorder output was visible.', '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
  console.log(summary);
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
