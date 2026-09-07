'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const seed = String(process.env.NH_TURN_NOTICE_LAYOUT_SEED || '424242');
const playerName = `TurnLayout${Date.now().toString(36).slice(-6)}`;
const viewports = Object.freeze([
  Object.freeze({ width: 1360, height: 920 }),
  Object.freeze({ width: 960, height: 720 }),
]);
const summaryName = 'turn-notice-layout-regression-result.json';
const { delay, waitFor } = Harness;

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function rectDelta(before, after) {
  return {
    top: Math.round((after.top - before.top) * 100) / 100,
    height: Math.round((after.height - before.height) * 100) / 100,
  };
}

function geometryComparison(before, after) {
  const selectors = ['header', 'statsPanel', 'playArea'];
  const deltas = Object.fromEntries(selectors.map((selector) => [selector, rectDelta(before[selector], after[selector])]));
  return {
    deltas,
    stable: selectors.every((selector) => Math.abs(deltas[selector].top) <= 0.5 && Math.abs(deltas[selector].height) <= 0.5),
  };
}

async function settleLayout(page) {
  await page.evalCheckedValue(`new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
  })`, { awaitPromise: true });
}

async function state(page) {
  return page.evalCheckedValue(`(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect?.();
      return rect ? { top: rect.top, height: rect.height } : null;
    };
    const noticeService = window.NetHackUxRuntime?.runtime?.service?.('notice');
    const notice = document.getElementById('ux-player-notice');
    const message = notice?.querySelector('.ux-player-notice-message');
    const action = notice?.querySelector('.ux-player-notice-action');
    const automation = window.__nethackAutomation?.state?.() || {};
    const shimEvents = (window.__nethackPromptTest?.shimEvents?.() || []).map((entry) => entry?.event || entry);
    const commandPrompts = shimEvents.filter((entry) => entry?.name === 'bridge_command_prompt');
    return {
      running: Boolean(automation.runningState?.running),
      automationStatus: automation.status || '',
      shimEventCount: Number(automation.shimEventCount || 0),
      commandTransactions: automation.commandTransactions || {},
      commandPromptCount: commandPrompts.length,
      commandPromptRequestId: commandPrompts.at(-1)?.requestId || '',
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      seen: document.getElementById('shim-output')?.dataset?.seen || '',
      turn: Number(document.getElementById('log-now-turn')?.textContent) || 0,
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      geometry: {
        header: box('body > header.reliquary-header'),
        statsPanel: box('#stats-panel'),
        playArea: box('#play-area'),
      },
      notice: {
        visible: Boolean(notice && !notice.hidden),
        id: noticeService?.current?.()?.id || '',
        kind: notice?.dataset?.kind || '',
        text: message?.textContent || '',
        actionVisible: Boolean(action && !action.hidden),
        actionText: action?.textContent || '',
        messageClientHeight: message?.clientHeight || 0,
        messageScrollHeight: message?.scrollHeight || 0,
        messageScrollTop: message?.scrollTop || 0,
        messageOverflowY: message ? getComputedStyle(message).overflowY : '',
      },
      noticeHistory: (noticeService?.history?.() || []).map((entry) => ({
        id: entry.id || '',
        kind: entry.kind || '',
        message: entry.message || '',
        source: entry.source || '',
        persistence: entry.persistence || '',
      })),
      syntheticActionClicks: Number(window.__turnNoticeLayoutActionClicks || 0),
    };
  })()`);
}

async function waitForGameplayReady(page, timeoutMs = 25000) {
  return waitFor(async () => {
    const current = await state(page);
    if (!current.running || current.dialogs.length) return null;
    if (/menu awaiting|line input|yes\/no/i.test(current.automationStatus)) return null;
    return /shim_glyph|shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(current.seen) ? current : null;
  }, timeoutMs, 100);
}

async function capture(page, qc, id, viewport, stateName, classification = 'diagnostic') {
  const record = await page.screenshotEvidence(qc, id, {
    classification,
    viewport: { ...viewport, devicePixelRatio: 1 },
    state: stateName,
    viewSafeFormat: 'BMP',
    viewSafeScale: 0.25,
  });
  return { raw: record.raw.path, viewSafe: record.derivative.path };
}

function completedNativeCommand(before, after) {
  return after.commandPromptCount > before.commandPromptCount
    && after.shimEventCount > before.shimEventCount
    && Number(after.commandTransactions.revision || 0) > Number(before.commandTransactions.revision || 0)
    && after.commandTransactions.lastCompleted?.status === 'completed'
    && after.commandTransactions.lastCompleted?.transactionId !== before.commandTransactions.lastCompleted?.transactionId;
}

async function exerciseSearchTurns(page, results) {
  await page.evalCheckedValue("window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true");
  await settleLayout(page);
  const initial = await state(page);
  assert('gameplay layout elements exist', Object.values(initial.geometry).every(Boolean), JSON.stringify(initial.geometry));

  let baseline = initial;
  if (baseline.turn < 1) {
    await page.pressKey('s', 's');
    const primed = await waitFor(async () => {
      const current = await state(page);
      return current.turn > 0 && completedNativeCommand(initial, current) ? current : null;
    }, 8000, 50);
    await settleLayout(page);
    baseline = await state(page);
    results.actualGameplay.turnCounterPrimingSearch = {
      required: true,
      beforeTurnText: '—',
      afterTurn: primed.turn,
      nativeCommandCompleted: completedNativeCommand(initial, baseline),
      geometry: geometryComparison(initial.geometry, baseline.geometry),
    };
  } else {
    results.actualGameplay.turnCounterPrimingSearch = { required: false, afterTurn: baseline.turn };
  }
  assert('native turn counter is ready', baseline.turn > 0, JSON.stringify(baseline));
  results.actualGameplay.baseline = baseline;

  for (let index = 0; index < 6; index += 1) {
    const before = await state(page);
    await page.pressKey('s', 's');
    const afterAdvance = await waitFor(async () => {
      const current = await state(page);
      return current.turn > before.turn && completedNativeCommand(before, current) ? current : null;
    }, 8000, 50);
    await settleLayout(page);
    const after = await state(page);
    const geometry = geometryComparison(baseline.geometry, after.geometry);
    results.actualGameplay.searchTurns.push({
      searchNumber: index + 1,
      beforeTurn: before.turn,
      observedTurn: afterAdvance.turn,
      settledTurn: after.turn,
      turnAdvanced: after.turn > before.turn,
      nativeCommandCompleted: completedNativeCommand(before, after),
      geometry,
      visibleNotice: after.notice,
    });
  }

  const settled = await state(page);
  results.actualGameplay.afterSearches = settled;
  results.checks.sixNativeSearchTurnsAdvanced = results.actualGameplay.searchTurns.length === 6
    && results.actualGameplay.searchTurns.every((turn) => turn.turnAdvanced && turn.nativeCommandCompleted);
  results.checks.actualTurnsKeepLayoutStable = results.actualGameplay.searchTurns.every((turn) => turn.geometry.stable)
    && results.actualGameplay.turnCounterPrimingSearch.geometry?.stable !== false;
  results.checks.noYourTurnNoticeInRunHistory = !settled.noticeHistory.some((entry) => /\byour turn\b/i.test(`${entry.id} ${entry.message}`));
}

async function exerciseSyntheticWarning(page, results, qc, viewport) {
  results.currentViewport = viewport;
  await Harness.setViewport(page.cdp, viewport);
  await page.evalCheckedValue(`(() => {
    const service = window.NetHackUxRuntime.runtime.service('notice');
    service.clear();
    window.__turnNoticeLayoutActionClicks = 0;
    return true;
  })()`);
  await settleLayout(page);
  const baseline = await state(page);
  assert(`${viewport.width}x${viewport.height} baseline layout elements exist`, Object.values(baseline.geometry).every(Boolean), JSON.stringify(baseline.geometry));

  const noticeId = `synthetic:turn-notice-layout:${viewport.width}x${viewport.height}`;
  const longMessage = `SYNTHETIC layout warning for ${viewport.width} by ${viewport.height}. ${'This deliberately long warning must remain available inside its own scrollable message area without moving the game map or status panel. '.repeat(16)}`.trim();
  await page.evalCheckedValue(`(() => {
    window.NetHackUxRuntime.runtime.service('notice').show({
      id: ${JSON.stringify(noticeId)},
      kind: 'warning',
      message: ${JSON.stringify(longMessage)},
      source: 'presentation',
      persistence: 'sticky',
      actionLabel: 'Acknowledge synthetic warning',
      action: () => { window.__turnNoticeLayoutActionClicks = (window.__turnNoticeLayoutActionClicks || 0) + 1; },
    });
    return true;
  })()`);
  await waitFor(async () => {
    const current = await state(page);
    return current.notice.visible && current.notice.id === noticeId ? current : null;
  }, 3000, 50);
  await settleLayout(page);
  const shown = await state(page);
  const shownGeometry = geometryComparison(baseline.geometry, shown.geometry);

  await page.evalCheckedValue(`(() => {
    const message = document.querySelector('#ux-player-notice .ux-player-notice-message');
    if (message) message.scrollTop = message.scrollHeight;
    return true;
  })()`);
  const scrolled = await state(page);
  const fullMessageScrollable = shown.notice.messageScrollHeight > shown.notice.messageClientHeight
    && /auto|scroll/.test(shown.notice.messageOverflowY)
    && scrolled.notice.messageScrollTop > 0;

  await page.click('#ux-player-notice .ux-player-notice-action', { timeoutMs: 3000 });
  await settleLayout(page);
  const afterAction = await state(page);
  const actionGeometry = geometryComparison(baseline.geometry, afterAction.geometry);
  const screenshotId = `synthetic-warning-${viewport.width}x${viewport.height}`;
  results.screenshots[screenshotId] = await capture(
    page,
    qc,
    screenshotId,
    viewport,
    `SYNTHETIC notice input against a live native game at ${viewport.width}x${viewport.height}`,
  );

  const cleared = await page.evalCheckedValue(`window.NetHackUxRuntime.runtime.service('notice').clear(${JSON.stringify(noticeId)})`);
  assert(`${viewport.width}x${viewport.height} synthetic warning clears`, cleared === true);
  await waitFor(async () => !(await state(page)).notice.visible, 3000, 50);
  await delay(250);
  await settleLayout(page);
  const afterClear = await state(page);
  const clearGeometry = geometryComparison(baseline.geometry, afterClear.geometry);

  const warningResult = {
    evidenceKind: 'SYNTHETIC notice input against live native gameplay',
    viewport,
    baselineGeometry: baseline.geometry,
    shown,
    afterAction,
    afterClear,
    geometry: { shown: shownGeometry, afterAction: actionGeometry, afterClear: clearGeometry },
    checks: {
      warningVisible: shown.notice.visible && shown.notice.kind === 'warning' && shown.notice.id === noticeId,
      completeMessageRendered: shown.notice.text === longMessage,
      fullLongMessageScrollable: fullMessageScrollable,
      actionVisible: shown.notice.actionVisible && shown.notice.actionText === 'Acknowledge synthetic warning',
      actionWorkedWithoutHidingWarning: afterAction.syntheticActionClicks === 1 && afterAction.notice.visible && afterAction.notice.id === noticeId,
      geometryStableWhileShown: shownGeometry.stable,
      geometryStableAfterAction: actionGeometry.stable,
      geometryStableAfterClear: clearGeometry.stable,
      warningCleared: !afterClear.notice.visible && afterClear.notice.id === '',
    },
  };
  results.syntheticWarnings.push(warningResult);
  return warningResult;
}

async function main() {
  const page = await Harness.createElectronBrowserDriver({
    root,
    width: viewports[0].width,
    height: viewports[0].height,
    timeoutMs: 20000,
    readinessTimeoutMs: 20000,
    teardownTimeoutMs: 5000,
    env: {
      NETHACK_SEED: seed,
      NETHACKOPTIONS: '!tutorial,!autopickup,time,pettype:none',
    },
  });
  const qc = Harness.screenshotQc.createScreenshotQc({
    rootDir: page.outputDir,
    runIdentity: page.outputIdentity,
    manifestFile: path.join(page.outputDir, 'evidence-approval.json'),
  });
  const results = {
    test: 'turn-notice-layout-regression',
    evidenceClaim: 'Regression script output, not canonical acceptance evidence',
    runIdentity: page.outputIdentity,
    outputDir: page.outputDir,
    seed,
    playerName,
    actualGameplay: { searchTurns: [] },
    syntheticWarnings: [],
    screenshots: {},
    currentViewport: viewports[0],
    checks: {},
  };
  let scenarioError = null;

  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    await waitFor(async () => (await state(page)).dialogs.includes('startup-choice-dialog'), 10000, 100);
    results.start = await page.evalCheckedValue(`window.__nethackAutomation.startReplay({
      playerSpec: ${JSON.stringify(`-u${playerName}-Val-Hum-Fem-Law`)},
      seed: ${JSON.stringify(seed)},
      nethackOptions: '!tutorial,!autopickup,time',
    })`, { awaitPromise: true });
    assert('actual native game starts with requested seed', results.start?.ok && String(results.start.seed) === seed, JSON.stringify(results.start));
    await waitFor(async () => (await state(page)).running, 25000, 100);
    results.introOpened = await waitFor(async () => {
      const current = await state(page);
      return current.dialogs.includes('intro-dialog') ? current : null;
    }, 10000, 100);
    await page.dismissIntroDialogs();
    await waitFor(async () => !(await state(page)).dialogs.includes('intro-dialog'), 5000, 100);
    results.ready = await waitForGameplayReady(page, 25000);

    await exerciseSearchTurns(page, results);
    results.screenshots.actualGameplayAfterSixSearches = await capture(
      page,
      qc,
      'actual-native-game-after-six-search-turns',
      viewports[0],
      'Actual native gameplay after six search turns',
      'actual-player',
    );

    for (const viewport of viewports) await exerciseSyntheticWarning(page, results, qc, viewport);
    results.checks.syntheticWarningLayoutsPass = results.syntheticWarnings.length === viewports.length
      && results.syntheticWarnings.every((warning) => Object.values(warning.checks).every(Boolean));

    const failed = Object.entries(results.checks).filter(([, passed]) => !passed).map(([name]) => name);
    if (failed.length) throw new Error(`Turn notice layout regression failed: ${failed.join(', ')}`);
  } catch (error) {
    scenarioError = error;
    results.error = error?.stack || String(error);
    results.failureState = await state(page).catch((stateError) => ({ stateError: stateError.message }));
    results.screenshots.failure = await capture(
      page,
      qc,
      'failure',
      results.currentViewport,
      'Diagnostic failure state',
    ).catch(() => null);
  } finally {
    try {
      fs.writeFileSync(path.join(page.outputDir, summaryName), `${JSON.stringify(results, null, 2)}\n`);
      const assertionRecords = Object.entries(results.checks).map(([id, passed]) => ({
        id,
        status: passed ? 'passed' : 'failed',
        details: passed ? '' : results.error || 'check returned false',
      }));
      if (assertionRecords.length) qc.recordAssertions(assertionRecords);
      qc.recordAssertions([{
        id: 'scenario-completed',
        status: scenarioError ? 'failed' : 'passed',
        details: scenarioError?.message || '',
      }]);
    } finally {
      await page.close(5000).catch(() => {});
      qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
      qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
    }
  }

  const manifest = Harness.screenshotQc.validateManifest(qc.manifestFile, {
    expectedRunIdentity: page.outputIdentity,
    requireApproval: false,
  });
  if (!manifest.ok && !scenarioError) scenarioError = new Error(`Screenshot output validation failed: ${manifest.errors.join('; ')}`);
  if (scenarioError) throw scenarioError;
  console.log(JSON.stringify({
    ok: true,
    test: results.test,
    claim: results.evidenceClaim,
    outputDir: page.outputDir,
    summary: path.join(page.outputDir, summaryName),
    screenshotManifest: qc.manifestFile,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
