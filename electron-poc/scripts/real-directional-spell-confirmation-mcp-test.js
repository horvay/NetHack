const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const { delay, waitFor } = Harness;
const seed = '424242';
const nethackOptions = '!tutorial,!autopickup,pettype:none';

function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function geometryMatches(left, right, tolerance = 0.5) {
  const keys = ['header', 'topBar', 'quickActions', 'playArea', 'gameGrid'];
  return keys.every((key) => {
    const a = left?.[key];
    const b = right?.[key];
    return a && b && ['left', 'top', 'width', 'height'].every((field) => Math.abs(a[field] - b[field]) <= tolerance);
  });
}
async function measureCueOnlyGeometry(page, expectedSent) {
  const measured = await page.evalCheckedValue(`(() => {
    const helper = document.getElementById('direction-helper');
    const cue = helper?.querySelector('.ux-direction-prompt-cue');
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
    };
    const geometry = () => ({
      header: rect('.reliquary-header'),
      topBar: rect('#top-bar'),
      quickActions: rect('#quick-actions'),
      playArea: rect('#play-area'),
      gameGrid: rect('#game-grid'),
    });
    const original = helper?.dataset.directionRequired || '';
    if (helper) helper.dataset.directionRequired = 'false';
    const withoutCue = geometry();
    const cueHidden = Boolean(cue && getComputedStyle(cue).display === 'none');
    if (helper) helper.dataset.directionRequired = original;
    const withCue = geometry();
    return {
      original,
      withoutCue,
      withCue,
      cueHidden,
      restored: helper?.dataset.directionRequired || '',
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    };
  })()`);
  assert('cue-only geometry probe restores the native required state without input', measured.original === 'true'
    && measured.restored === 'true'
    && measured.cueHidden
    && measured.sent === expectedSent, JSON.stringify(measured));
  assert('cue alone does not shift the dungeon or header', geometryMatches(measured.withoutCue, measured.withCue), JSON.stringify(measured));
  return measured;
}


async function state(page) {
  return page.evalCheckedValue(`(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
    };
    const helper = document.getElementById('direction-helper');
    const cue = helper?.querySelector('.ux-direction-prompt-cue');
    const helperStyle = helper ? getComputedStyle(helper) : null;
    const cueStyle = cue ? getComputedStyle(cue) : null;
    const shimEvents = window.__nethackPromptTest?.shimEvents?.() || [];
    const spellAvailability = shimEvents
      .map((entry) => entry?.event || entry?.raw || entry)
      .filter((event) => event && typeof event === 'object' && event.name === 'shim_spell_availability')
      .at(-1) || null;
    const cast = document.getElementById('cast-spell-button');
    return {
      running: Boolean(window.__nethackAutomation?.state?.().runningState?.running),
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      prompt: window.__nethackPromptTest?.prompt?.() || null,
      dialog: window.__nethackPromptTest?.dialog?.() || {},
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      activeText: String(document.activeElement?.textContent || '').trim(),
      activeKey: String(document.activeElement?.dataset?.key || ''),
      messages: window.__nethackPromptTest?.messages?.().slice(-10).map((message) => message.text || String(message)) || [],
      spellAvailability,
      cast: cast ? {
        hidden: cast.hidden,
        visible: Boolean(!cast.hidden && getComputedStyle(cast).display !== 'none' && getComputedStyle(cast).visibility !== 'hidden' && cast.getClientRects().length),
        title: cast.title,
        text: cast.textContent.trim(),
      } : null,
      direction: {
        hidden: Boolean(helper?.hidden),
        required: helper?.dataset.directionRequired || '',
        cueText: cue?.textContent?.trim() || '',
        cueVisible: Boolean(cue && cueStyle?.display !== 'none' && cueStyle?.visibility !== 'hidden' && cue.getClientRects().length),
        helperAnimation: helperStyle?.animationName || '',
        helperIterations: helperStyle?.animationIterationCount || '',
        helperDuration: helperStyle?.animationDuration || '',
        borderColor: helperStyle?.borderTopColor || '',
        outlineColor: helperStyle?.outlineColor || '',
        cueAnimation: cueStyle?.animationName || '',
        cueIterations: cueStyle?.animationIterationCount || '',
        cueDuration: cueStyle?.animationDuration || '',
      },
      geometry: {
        header: rect('.reliquary-header'),
        topBar: rect('#top-bar'),
        quickActions: rect('#quick-actions'),
        playArea: rect('#play-area'),
        gameGrid: rect('#game-grid'),
      },
    };
  })()`);
}

async function clearInput(page) {
  await page.evalCheckedValue(`(() => {
    document.getElementById('game-grid')?.focus?.();
    window.__nethackPromptTest?.clearSentInputs?.();
    return true;
  })()`);
}

async function pressCtrlD(page) {
  const common = {
    key: 'd',
    code: 'KeyD',
    modifiers: 2,
    windowsVirtualKeyCode: 68,
    nativeVirtualKeyCode: 68,
  };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...common });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
}

async function startCharacter(page, { role, name }) {
  await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
  await page.clickStartShim();
  const dialogs = await waitFor(async () => {
    const current = (await state(page)).dialogs;
    return current.includes('startup-choice-dialog') ? current : null;
  }, 10000);
  assert('startup choice opens', dialogs.includes('startup-choice-dialog'), JSON.stringify(dialogs));
  const roleTag = role === 'Wiz' ? 'wizard' : 'valkyrie';
  const startupScreenshot = path.join(page.outputDir, `${roleTag}-startup-choice.png`);
  await page.screenshot(startupScreenshot);
  await page.click('#startup-new-game');
  const characterDialogs = await waitFor(async () => {
    const current = (await state(page)).dialogs;
    return current.includes('character-dialog') ? current : null;
  }, 5000);
  assert('character creation opens', characterDialogs.includes('character-dialog'), JSON.stringify(characterDialogs));
  await page.setInputValue('#player-role', role);
  await page.setInputValue('#player-race', 'Hum');
  await page.setInputValue('#player-gender', 'Fem');
  await page.setInputValue('#player-align', role === 'Wiz' ? 'Neu' : 'Law');
  await page.setInputValue('#player-name', name);
  await page.setInputValue('#game-seed', seed);
  const characterScreenshot = path.join(page.outputDir, `${roleTag}-character-creation-selected.png`);
  await page.screenshot(characterScreenshot);
  await page.click('#confirm-character');
  await waitFor(async () => (await state(page)).running, 20000);

  // The intro arrives after running state. Observe it before dismissal so a
  // late intro cannot cover the native prompt exercised by the test.
  await waitFor(async () => (await state(page)).dialogs.includes('intro-dialog'), 10000);
  await page.dismissIntroDialogs();
  await waitFor(async () => {
    const current = await state(page);
    return !current.dialogs.includes('intro-dialog') && !current.dialogs.includes('document-dialog') ? current : null;
  }, 5000);
  await clearInput(page);

  const started = await waitFor(async () => {
    const current = await state(page);
    const availability = current.spellAvailability;
    if (!availability || availability.authoritative !== true || !Number.isInteger(availability.knownSpellCount)) return null;
    if (role === 'Wiz' && (availability.knownSpellCount < 1 || current.cast?.hidden)) return null;
    if (role !== 'Wiz' && (availability.knownSpellCount !== 0 || !current.cast?.hidden)) return null;
    return current;
  }, 10000);
  return { ...started, startupScreenshot, characterScreenshot };
}

async function createPage({ width, height }) {
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NETHACK_SEED: seed,
      NETHACKOPTIONS: nethackOptions,
    },
  });
  await page.cdp.send('Page.bringToFront');
  return page;
}
async function useDeterministicFullMotion(page) {
  const original = await page.evalCheckedValue(`(() => ({
    bodyMotion: document.body.dataset.uxMotion || '',
    osReduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }))()`);
  await page.evalCheckedValue("document.body.dataset.uxMotion = 'full'; true");
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  return original;
}

async function restoreMotion(page, original) {
  if (!original) return;
  await page.evalCheckedValue(`(() => {
    const value = ${JSON.stringify(original.bodyMotion)};
    if (value) document.body.dataset.uxMotion = value;
    else delete document.body.dataset.uxMotion;
    return true;
  })()`);
  await page.send('Emulation.setEmulatedMedia', {
    features: [{
      name: 'prefers-reduced-motion',
      value: original.osReduced ? 'reduce' : 'no-preference',
    }],
  });
}


function assertCastState(label, current, { visible }) {
  assert(`${label} has an authoritative native spell count`, current.spellAvailability?.authoritative === true
    && Number.isInteger(current.spellAvailability?.knownSpellCount), JSON.stringify(current.spellAvailability));
  if (visible) {
    assert(`${label} exposes Cast before opening the spell menu`, current.spellAvailability.knownSpellCount > 0
      && current.cast?.hidden === false
      && current.cast?.visible === true
      && current.cast?.title === 'Cast a spell (Z)'
      && current.cast?.text === 'Cast', JSON.stringify({ availability: current.spellAvailability, cast: current.cast }));
  } else {
    assert(`${label} hides Cast with zero learned spells`, current.spellAvailability.knownSpellCount === 0
      && current.cast?.hidden === true, JSON.stringify({ availability: current.spellAvailability, cast: current.cast }));
  }
}

function assertRequiredDirection(label, current, expectedSent, { animated = true } = {}) {
  assert(`${label} is the native direction prompt`, /In what direction/i.test(current.prompt?.query || ''), JSON.stringify(current.prompt));
  assert(`${label} marks the native compass as required`, current.direction.required === 'true' && !current.direction.hidden, JSON.stringify(current.direction));
  assert(`${label} shows the floating direction cue`, current.direction.cueVisible && current.direction.cueText === 'Pick a direction', JSON.stringify(current.direction));
  assert(`${label} sends no direction merely by showing the cue`, current.sent === expectedSent, JSON.stringify(current.sent));
  if (animated) {
    assert(`${label} uses fast direction attention`, parseFloat(current.direction.helperDuration) > 0
      && parseFloat(current.direction.helperDuration) <= 1
      && parseFloat(current.direction.cueDuration) > 0
      && parseFloat(current.direction.cueDuration) <= 1, JSON.stringify(current.direction));
    assert(`${label} uses the bounded compass glow`, current.direction.helperAnimation === 'ux-direction-required-glow'
      && Number(current.direction.helperIterations) === 3, JSON.stringify(current.direction));
    assert(`${label} uses the bounded floating cue`, current.direction.cueAnimation === 'ux-direction-cue-float'
      && Number(current.direction.cueIterations) === 3, JSON.stringify(current.direction));
  } else {
    assert(`${label} keeps the cue static`, current.direction.helperAnimation === 'none'
      && current.direction.cueAnimation === 'none', JSON.stringify(current.direction));
  }
}

function assertIdleDirection(label, current) {
  assert(`${label} restores the ordinary movement pad`, !current.direction.hidden
    && current.direction.required === 'false'
    && !current.direction.cueVisible
    && current.direction.helperAnimation !== 'ux-direction-required-glow'
    && current.direction.cueAnimation === 'none', JSON.stringify(current.direction));
}

async function openForceBoltDirection(page, mode, phase) {
  await clearInput(page);
  const before = await state(page);
  assertCastState(`${mode} Wizard`, before, { visible: true });
  if (mode === 'button') await page.click('#cast-spell-button');
  else await page.pressKey('Z', 'Z');
  const chooser = await waitFor(async () => {
    const current = await state(page);
    return current.dialog?.interactionOpen && /Choose which spell to cast/i.test(current.dialog.prompt || '') ? current : null;
  }, 10000);
  assert(`${mode} Cast opens the chooser without selecting a spell`, chooser.sent === 'Z'
    && chooser.prompt?.kind === 'menu selection'
    && !/In what direction/i.test(chooser.prompt.query || '')
    && chooser.dialog.options?.some((option) => option.key === 'a' && /force bolt/i.test(option.text || '')), JSON.stringify(chooser));
  const chooserScreenshot = path.join(page.outputDir, `force-bolt-${mode}-${phase}-chooser.png`);
  await page.screenshot(chooserScreenshot);
  if (mode === 'button') await page.click('#interaction-options .choice-button[data-key="a"]');
  else await page.pressKey('a', 'a');
  const direction = await waitFor(async () => {
    const current = await state(page);
    return /In what direction/i.test(current.prompt?.query || '') ? current : null;
  }, 10000);
  assertRequiredDirection(`${mode} force bolt`, direction, 'Za');
  const cueGeometry = await measureCueOnlyGeometry(page, 'Za');
  await delay(120);
  const settledCue = await state(page);
  assertRequiredDirection(`${mode} settled force bolt cue`, settledCue, 'Za');
  return { ...settledCue, chooserScreenshot, cueGeometry };
}

async function verifyReducedMotion(page, baseline) {
  const original = await page.evalCheckedValue(`(() => ({
    bodyMotion: document.body.dataset.uxMotion || '',
    osReduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }))()`);
  try {
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await page.evalCheckedValue("document.body.dataset.uxMotion = 'reduced'; true");
    await delay(80);
    const inAppReduced = await state(page);
    assertRequiredDirection('in-app reduced-motion force bolt', inAppReduced, 'Za', { animated: false });
    assert('in-app reduced motion does not shift dungeon or header', geometryMatches(baseline.geometry, inAppReduced.geometry), JSON.stringify({ baseline: baseline.geometry, reduced: inAppReduced.geometry }));

    await page.evalCheckedValue("document.body.dataset.uxMotion = 'full'; true");
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await delay(80);
    const osReduced = await state(page);
    assertRequiredDirection('OS reduced-motion force bolt', osReduced, 'Za', { animated: false });
    assert('OS reduced motion does not shift dungeon or header', geometryMatches(baseline.geometry, osReduced.geometry), JSON.stringify({ baseline: baseline.geometry, reduced: osReduced.geometry }));
    return { inAppReduced, osReduced };
  } finally {
    await restoreMotion(page, original);
  }
}

async function verifyCancelMovementAndKick(page, mode) {
  await openForceBoltDirection(page, mode, 'cancel');
  await page.pressKey('Escape', '');
  const afterCancel = await waitFor(async () => {
    const current = await state(page);
    return !current.prompt && current.direction.required === 'false' ? current : null;
  }, 10000);
  assert(`${mode} Escape cancels the force bolt direction once`, afterCancel.sent === `Za\u001b`, JSON.stringify(afterCancel.sent));
  assertIdleDirection(`${mode} force bolt cancel`, afterCancel);

  await clearInput(page);
  const idleBeforeMove = await state(page);
  assertIdleDirection('ordinary movement before clicking East', idleBeforeMove);
  await page.click('#direction-helper-options button[data-key="l"]');
  const afterMove = await waitFor(async () => {
    const current = await state(page);
    return current.sent === 'l' ? current : null;
  }, 5000);
  assertIdleDirection('ordinary movement after clicking East', afterMove);

  await clearInput(page);
  await pressCtrlD(page);
  const kickDirection = await waitFor(async () => {
    const current = await state(page);
    return /In what direction/i.test(current.prompt?.query || '') ? current : null;
  }, 10000);
  assertRequiredDirection('Ctrl-D kick', kickDirection, '\u0004');
  await page.pressKey('Escape', '');
  const kickCancelled = await waitFor(async () => {
    const current = await state(page);
    return !current.prompt && current.direction.required === 'false' ? current : null;
  }, 10000);
  assert('Ctrl-D Escape reaches native NetHack exactly once', kickCancelled.sent === `\u0004\u001b`, JSON.stringify(kickCancelled.sent));
  assertIdleDirection('Ctrl-D cancel', kickCancelled);
  return { afterCancel, idleBeforeMove, afterMove, kickDirection, kickCancelled };
}
async function reproduceDirectionFollowups() {
  const viewport = { width: 1360, height: 920 };
  const page = await createPage(viewport);
  let originalMotion = null;
  try {
    const started = await startCharacter(page, { role: 'Wiz', name: `DirectionCancel${process.pid}` });
    assertCastState('cancellation starter Wizard', started, { visible: true });
    originalMotion = await useDeterministicFullMotion(page);
    const followups = await verifyCancelMovementAndKick(page, 'button');
    return { outputDir: page.outputDir, viewport, started, ...followups };
  } finally {
    await restoreMotion(page, originalMotion).catch(() => {});
    await page.close().catch(() => {});
  }
}


async function reproduceDirectionalCast(mode, viewport) {
  const page = await createPage(viewport);
  let originalMotion = null;
  try {
    const started = await startCharacter(page, { role: 'Wiz', name: `Direction${mode}${process.pid}` });
    assertCastState(`${mode} starter Wizard`, started, { visible: true });
    originalMotion = await useDeterministicFullMotion(page);
    const direction = await openForceBoltDirection(page, mode, 'result');
    const promptScreenshot = path.join(page.outputDir, `force-bolt-${mode}-direction-prompt-${viewport.width}x${viewport.height}.png`);
    await page.screenshot(promptScreenshot);
    const motion = mode === 'button' ? await verifyReducedMotion(page, direction) : null;
    if (mode === 'button') await page.click('#direction-helper-options button[data-key="l"]');
    else await page.pressKey('ArrowRight', '');
    const after = await waitFor(async () => {
      const current = await state(page);
      return current.sent === 'Zal' && !current.prompt && !current.dialog?.interactionOpen ? current : null;
    }, 10000);
    assert(`${mode} East answers with exact native Zal`, after.sent === 'Zal', JSON.stringify(after.sent));
    assertIdleDirection(`${mode} force bolt result`, after);
    const resultScreenshot = path.join(page.outputDir, `force-bolt-${mode}-result-${viewport.width}x${viewport.height}.png`);
    await page.screenshot(resultScreenshot);
    return { outputDir: page.outputDir, viewport, started, direction, motion, after, promptScreenshot, resultScreenshot };
  } finally {
    await restoreMotion(page, originalMotion).catch(() => {});
    await page.close().catch(() => {});
  }
}

async function reproduceNoSpellAndYesDefault() {
  const page = await createPage({ width: 1360, height: 920 });
  try {
    const started = await startCharacter(page, { role: 'Val', name: `YesDefault${process.pid}` });
    assertCastState('starter Valkyrie', started, { visible: false });
    await page.pressKey('S', 'S');
    const prompt = await waitFor(async () => {
      const current = await state(page);
      return current.dialog?.interactionOpen && /Really save|Save the game/i.test(current.dialog.prompt || '') ? current : null;
    }, 10000);
    assert('save confirmation keeps Yes as the native default', prompt.activeKey.toLowerCase() === 'y', JSON.stringify({ text: prompt.activeText, key: prompt.activeKey }));
    assert('save confirmation does not reveal Cast for a no-spell Valkyrie', prompt.cast?.hidden === true, JSON.stringify(prompt.cast));
    const screenshot = path.join(page.outputDir, 'save-confirmation-yes-default-no-spell-valkyrie-1360x920.png');
    await page.screenshot(screenshot);
    return { outputDir: page.outputDir, started, focusedChoice: prompt.activeText, focusedKey: prompt.activeKey, screenshot };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const yesDefault = await reproduceNoSpellAndYesDefault();
  const directionFollowups = await reproduceDirectionFollowups();
  const buttonCast = await reproduceDirectionalCast('button', { width: 1360, height: 920 });
  const keyboardCast = await reproduceDirectionalCast('keyboard', { width: 960, height: 720 });
  const result = { ok: true, command: 'node scripts/real-directional-spell-confirmation-mcp-test.js', yesDefault, directionFollowups, buttonCast, keyboardCast };
  const summaryFile = path.join(buttonCast.outputDir, 'directional-spell-confirmation-result.json');
  fs.writeFileSync(summaryFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, summaryFile }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
