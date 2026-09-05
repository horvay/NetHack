const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
async function evalExpr(page, expression) { return page.evalCheckedValue(expression, { awaitPromise: true }); }
async function click(page, selector) {
  const box = await evalExpr(page, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({ block: 'center', inline: 'center' }); const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function state(page) {
  return evalExpr(page, `(() => ({
    actions: window.__nethackPromptTest?.contextActions?.() || {},
    dialog: window.__nethackPromptTest?.dialog?.() || {},
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    messages: window.__nethackPromptTest?.messages?.().slice(-20).map((entry) => entry.text || String(entry)) || [],
    ground: window.__nethackPromptTest?.groundSnapshots?.() || {},
    body: document.body.innerText,
    shim: document.getElementById('shim-output')?.innerText || '',
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
  }))()`);
}
async function capture(page, qc, name, stateLabel) {
  const shot = await page.screenshotEvidence(qc, name, { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: stateLabel, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return shot.raw.path;
}

async function main() {
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: 'terrain/altar-sacrifice-on-hero',
      NETHACK_SEED: '424242',
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
  });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') });
  let failure = null;
  const screenshots = [];
  try {
    await page.startDefaultGame({ timeoutMs: 25000, playerName: 'SacrificeProof' });
    await page.dismissIntroDialogs();
    await waitFor(async () => {
      const current = await state(page);
      if (/bridge_test_scenario_failed/.test(`${current.seen}\n${current.shim}`)) throw new Error(current.shim);
      return /bridge_test_scenario_loaded/.test(`${current.seen}\n${current.shim}`) && current.actions?.buttons?.some((button) => button.id === 'offer') ? current : null;
    }, 15000);
    await page.dismissIntroDialogs();
    await evalExpr(page, `(() => { document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest?.clearSentInputs?.(); return true; })()`);
    await delay(150);
    const before = await state(page);
    screenshots.push(await capture(page, qc, '00-altar-corpse-offer-action', 'altar and corpse with Offer sacrifice action'));
    assert('altar exposes Offer sacrifice', before.actions?.buttons?.some((button) => button.id === 'offer' && /Offer sacrifice/i.test(button.text)), JSON.stringify(before.actions));
    assert('ground snapshot names goblin corpse', /goblin corpse/i.test(JSON.stringify(before.ground)), JSON.stringify(before.ground));

    await click(page, '#context-action-bar button[data-context-action-id="offer"]');
    const floorPrompt = await waitFor(async () => {
      const current = await state(page);
      return current.dialog?.interactionOpen && /There is an? .*goblin corpse here; sacrifice it\\?/i.test(current.dialog.prompt) ? current : null;
    }, 10000);
    screenshots.push(await capture(page, qc, '01-ground-corpse-confirmation', 'named floor corpse sacrifice confirmation'));
    assert('floor corpse confirmation names the goblin corpse', /goblin corpse/i.test(floorPrompt.dialog.prompt) && !/Name unavailable/i.test(floorPrompt.dialog.prompt), JSON.stringify(floorPrompt.dialog));
    await click(page, '#interaction-options .choice-button[data-key="n"]');
    const prompt = await waitFor(async () => {
      const current = await state(page);
      return current.dialog?.interactionOpen && /What do you want to sacrifice/i.test(current.dialog.prompt) && (current.dialog.options.length > 0 || /Name unavailable/i.test(current.body)) ? current : null;
    }, 10000);
    screenshots.push(await capture(page, qc, '02-sacrifice-named-inventory-corpse-choice', 'sacrifice prompt with named carried corpse'));
    const corpseOption = prompt.dialog.options.find((option) => /jackal corpse/i.test(`${option.label || ''} ${option.text || ''}`));
    assert('sacrifice prompt names the carried corpse', corpseOption && !/Name unavailable|Item [a-z]/i.test(`${corpseOption.label || ''} ${corpseOption.text || ''}`), JSON.stringify(prompt.dialog));
    assert('sacrifice prompt has no unavailable item fallback', !/Name unavailable/i.test(`${prompt.dialog.prompt}\n${prompt.body}`), prompt.body.slice(-2000));

    await click(page, `#interaction-options .choice-button[data-key="${corpseOption.key}"]`);
    const after = await waitFor(async () => {
      const current = await state(page);
      return !current.dialog?.interactionOpen && /sacrifice|offering|consumed|accepts|angry|feel/i.test(current.messages.join('\n')) ? current : null;
    }, 10000);
    screenshots.push(await capture(page, qc, '03-after-sacrifice', 'sacrifice resolved by NetHack'));
    assert('sacrifice selector was dispatched', after.sent.includes(corpseOption.key), JSON.stringify({ sent: after.sent, key: corpseOption.key }));
    assert('sacrifice produces no ownership failure', !/another prompt, menu, or transfer owns input|direct command is blocked|Name unavailable/i.test(`${after.messages.join('\n')}\n${after.body}`), after.body.slice(-2000));
    qc.recordAssertions([
      { id: 'offer-action-visible', status: 'passed', details: '' },
      { id: 'named-floor-and-inventory-corpse-choices', status: 'passed', details: '' },
      { id: 'sacrifice-resolved', status: 'passed', details: '' },
    ]);
    console.log(JSON.stringify({ ok: true, outputDir: page.outputDir, screenshots }, null, 2));
  } catch (error) {
    failure = error;
    qc.recordAssertions([{ id: 'scenario-completed', status: 'failed', details: String(error.message || error) }]);
  } finally {
    await page.close().catch((error) => { if (!failure) failure = error; });
  }
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence capture failed: ${validation.errors.join('; ')}`);
  if (failure) throw failure;
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
