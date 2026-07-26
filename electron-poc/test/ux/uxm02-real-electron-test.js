const fs = require('node:fs');
const path = require('node:path');
const Harness = require('../../scripts/lib/electron-test-harness.js');

const root = path.resolve(__dirname, '..', '..');
const evidenceRoot = process.env.NH_UXM02_EVIDENCE_DIR || path.resolve(root, '..', 'test-output', 'uxm02-real-electron');
const basePort = Number(process.env.NH_UXM02_CDP_PORT || 19902);
const playgroundRoot = process.env.NH_UXM02_PLAYGROUND || '/tmp/nethack-uxm02-climbing-compass-75';
const { waitFor, delay } = Harness;

function assert(condition, message, detail) {
  if (!condition) throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
}

function preparePlayground(playground) {
  fs.rmSync(playground, { recursive: true, force: true });
  fs.mkdirSync(path.join(playground, 'save'), { recursive: true });
  const source = path.resolve(root, '..', 'playground');
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license', 'perm']) {
    const from = path.join(source, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(playground, name));
  }
}

async function shellState(page) {
  return page.evalCheckedValue(`(() => {
    const rect = (element) => element ? element.getBoundingClientRect().toJSON() : null;
    const visible = (element) => {
      if (!element) return false;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const game = window.NetHackUxRuntime?.runtime?.latestPublicState?.()?.snapshot?.game || {};
    const map = document.getElementById('game-grid');
    const play = document.getElementById('play-area');
    const feedMount = document.getElementById('messages');
    const feedRect = feedMount?.getBoundingClientRect();
    const feed = Array.from(document.querySelectorAll('.ux-consequence-row')).map((row) => {
      const rowRect = row.getBoundingClientRect();
      return {
        id: row.dataset.messageId, text: row.querySelector('.ux-consequence-text')?.textContent || '',
        category: row.dataset.category, confidence: row.dataset.confidence,
        visible: Boolean(feedRect && rowRect.top >= feedRect.top - 1 && rowRect.bottom <= feedRect.bottom + 1),
      };
    });
    const status = Array.from(document.querySelectorAll('#stats-panel .ux-status-chip')).map((chip) => ({
      label: chip.querySelector('span')?.textContent || '', value: chip.querySelector('strong')?.textContent || '',
      role: chip.dataset.statusRole || '', severity: chip.classList.contains('danger') ? 'danger' : (chip.classList.contains('warning') ? 'warning' : ''),
    }));
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      outer: { width: outerWidth, height: outerHeight },
      scroll: { bodyWidth: document.body.scrollWidth, htmlWidth: document.documentElement.scrollWidth, bodyHeight: document.body.scrollHeight },
      shellActive: document.body.classList.contains('uxm02-shell-active'),
      density: document.body.dataset.uxHudDensity || '',
      mapMode: document.body.dataset.uxMapMode || '',
      shellDomain: window.NetHackUxRuntime?.runtime?.domain?.('shell')?.version || '',
      shellState: window.NetHackUxRuntime?.runtime?.domain?.('shell')?.state?.() || {},
      modules: {
        status: window.NetHackUxStatusPresentation?.version || '',
        consequence: window.NetHackUxConsequenceFeed?.version || '',
        history: window.NetHackUxMessagePresentation?.version || '',
        character: window.NetHackUxCharacterSheet?.version || '',
      },
      rawStatusHtml: document.getElementById('stats-panel')?.innerHTML || '',
      rawMessageHtml: document.getElementById('messages')?.innerHTML || '',
      diagnostics: window.NetHackUxRuntime?.runtime?.diagnostics?.() || [],
      status,
      feed,
      buttons: ['open-actions','inventory-equipment-button','ux-character-button','ux-history-button','ux-hud-density-button','ux-map-mode-button'].map((id) => {
        const button = document.getElementById(id); return { id, text: button?.textContent || '', visible: visible(button), rect: rect(button) };
      }),
      notice: document.getElementById('ux-player-notice')?.textContent || '',
      map: { rect: rect(map), playRect: rect(play), transform: map ? getComputedStyle(map).transform : '', cells: map?.childElementCount || 0, focused: document.activeElement === map },
      openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      active: { id: document.activeElement?.id || '', tag: document.activeElement?.tagName || '', text: document.activeElement?.textContent?.slice(0, 80) || '' },
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      canonicalMessages: game.messages || [],
      running: Boolean(window.__nethackAutomation?.state?.().runningState?.running),
      evidenceLabel: document.getElementById('uxm02-synthetic-evidence-label')?.textContent || '',
    };
  })()`);
}

async function startScenario(page, scenarioId, playerName, viewport = { width: 1360, height: 920 }) {
  await page.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
  const result = await page.evalCheckedValue(`window.__nethackAutomation.startReplay(${JSON.stringify({
    playerSpec: `-u${playerName}-Val-Hum-Fem-Law`, seed: '902902', scenarioId,
    nethackOptions: '!tutorial,!autopickup,time,showscore,showexp,showvers,weaponstatus,armorstatus,terrainstatus,disclose:+i +a +v +g +c +o',
    settings: { hudDensity: 'compact', map: { mode: 'full' } },
  })})`, { awaitPromise: true });
  assert(result?.ok, 'real shim scenario failed to start', result);
  await waitFor(async () => {
    const ready = await page.evalCheckedValue(`(() => {
      const snapshot = window.NetHackUxRuntime?.runtime?.latestPublicState?.()?.snapshot;
      const status = new Map(snapshot?.game?.statusValues || []);
      return Boolean(window.__nethackAutomation?.state?.().runningState?.running && snapshot?.game?.mapCells?.length === 21 && status.get(18));
    })()`);
    return ready || null;
  }, 25000);
  await waitFor(async () => {
    const state = await shellState(page);
    return state.status.some((item) => item.label === 'HP') && state.feed.length ? state : null;
  }, 5000);
  const dialogs = await page.evalCheckedValue("Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id)");
  if (dialogs.includes('intro-dialog')) await page.click('#intro-continue', { timeoutMs: 5000 });
  await page.evalCheckedValue("document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs(); true");
  await delay(350);
}

async function capture(page, qc, id, viewport, state, zoomPercent = 100) {
  const raw = qc.rawPath(id);
  const metrics = zoomPercent === 200
    ? { width: Math.round(viewport.width / 2), height: Math.round(viewport.height / 2), deviceScaleFactor: 2, mobile: false }
    : { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false };
  await page.cdp.send('Page.bringToFront');
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { ...metrics, width: metrics.width - 1 });
  await page.evalCheckedValue(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`, { awaitPromise: true });
  await page.cdp.send('Emulation.setDeviceMetricsOverride', metrics);
  await page.evalCheckedValue(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`, { awaitPromise: true });
  await page.screenshot(raw, { fromSurface: true });
  return qc.recordCapture(id, raw, {
    viewport: { width: viewport.width, height: viewport.height, zoomPercent },
    state: { ...state, evidenceCaptureMethod: 'single CDP surface PNG after a one-pixel viewport invalidation restored before capture; accepted inspection uses the full-size Pillow-decoded BMP derivative to bypass the large-PNG preview decoder defect without mutating the document' },
    viewSafeFormat: 'BMP',
    viewSafeScale: 1,
  });
}

async function stageSyntheticConditionMask(page, mask, label) {
  await page.evalCheckedValue(`(() => {
    const runtime = window.NetHackUxRuntime.runtime;
    const current = runtime.latestPublicState();
    const snapshot = current.snapshot;
    const status = new Map(snapshot.game.statusValues || []);
    status.set(22, 'mask ' + ${Number(mask)});
    let evidenceLabel = document.getElementById('uxm02-synthetic-evidence-label');
    if (!evidenceLabel) {
      evidenceLabel = document.createElement('aside');
      evidenceLabel.id = 'uxm02-synthetic-evidence-label';
      Object.assign(evidenceLabel.style, {
        position: 'fixed', top: '8px', right: '8px', zIndex: '2147483647', padding: '7px 10px',
        border: '1px solid #f2c14e', borderRadius: '4px', background: '#1a1712', color: '#f6e7bd',
        font: '700 12px/1.2 sans-serif', letterSpacing: '.04em', pointerEvents: 'none'
      });
      document.body.append(evidenceLabel);
    }
    evidenceLabel.textContent = ${JSON.stringify(label)};
    runtime.publishPublicState({ ...snapshot, game: { ...snapshot.game, statusValues: Array.from(status) } }, {
      source: 'uxm02-synthetic-public-mask-evidence', synthetic: true
    });
    return true;
  })()`);
  await delay(250);
  return shellState(page);
}

async function runShellViewport(viewport, index, qc, summary) {
  const runId = viewport.id;
  const outputDir = path.join(evidenceRoot, runId);
  const playground = path.join(playgroundRoot, runId);
  preparePlayground(playground);
  fs.mkdirSync(outputDir, { recursive: true });
  const page = await Harness.createElectronBrowserDriver({
    root, port: basePort + index, width: viewport.width, height: viewport.height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: 'status/condition-trap', NH_TEST_PLAYGROUND: playground, NH_ELECTRON_SHOW: '1' },
  });
  const run = { viewport, playground, screenshots: {}, checks: {} };
  summary.runs[runId] = run;
  try {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
    await page.waitForCheckedValue("Boolean(window.NetHackUxRuntime?.runtime?.domain?.('shell')?.state?.().connected)", 10000);
    await page.evalCheckedValue("window.NetHackUxRuntime.runtime.domain('shell').setDensity('compact', { persist: false }); true");
    await startScenario(page, 'status/condition-trap', `UXM02${index}`, viewport);
    await page.pressKey('ArrowRight');
    await waitFor(async () => (await shellState(page)).openDialogs.includes('interaction-dialog'), 5000);
    await page.pressKey('y', 'y');
    await waitFor(async () => {
      const state = await shellState(page);
      return !state.openDialogs.includes('interaction-dialog') && state.feed.some((item) => /web|trap/i.test(item.text)) ? state : null;
    }, 5000);
    const initial = await shellState(page);
    run.initial = initial;
    run.checks.shellRegistered = initial.shellDomain === 'nethack-app-shell/v1';
    run.checks.mapDominant = initial.map.rect.width >= initial.viewport.width * 0.9 && initial.map.rect.height > 160;
    run.checks.compactDefault = initial.density === 'compact';
    run.checks.noStaticCompactFacts = !initial.status.some((item) => ['Str', 'Dex', 'Wield', 'Armor', 'Version', 'Time'].includes(item.label));
    run.checks.publicConditionConsequenceVisible = initial.status.some((item) => ['Held', 'Senses', 'Mind', 'Hunger', 'Carry'].includes(item.label)) || initial.feed.some((item) => /web|trap/i.test(item.text));
    run.checks.expandedFeed = initial.feed.length >= 1 && initial.feed.length <= 10 && initial.feed.every((item) => item.visible);
    run.checks.unclassifiedVisible = initial.feed.some((item) => item.confidence === 'unclassified');
    run.checks.commandAndInventoryVisible = initial.buttons.filter((button) => ['open-actions', 'inventory-equipment-button'].includes(button.id)).every((button) => button.visible);
    run.checks.historyAndCharacterVisible = initial.buttons.filter((button) => ['ux-history-button', 'ux-character-button'].includes(button.id)).every((button) => button.visible);
    run.checks.noHorizontalPageScroll = initial.scroll.bodyWidth <= initial.viewport.width + 2 && initial.scroll.htmlWidth <= initial.viewport.width + 2;
    run.checks.noRegistrationFailure = !initial.diagnostics.some((entry) => /registration-rejected|subscriber-failed/.test(entry.type || ''));
    run.screenshots.shell = await capture(page, qc, `${runId}-01-map-first-shell`, viewport, initial);

    await page.click('#ux-character-button');
    const characterOpen = await waitFor(async () => { const state = await shellState(page); return state.openDialogs.includes('ux-character-sheet-dialog') ? state : null; }, 5000);
    run.checks.characterShowsStaticFacts = await page.evalCheckedValue(`(() => {
      const text = document.getElementById('ux-character-sheet-dialog')?.textContent || '';
      return ['Attributes','Str','Dex','Dungeon','Time'].every((value) => text.includes(value)) && !text.includes('(hidden)');
    })()`);
    run.screenshots.character = await capture(page, qc, `${runId}-02-character-sheet`, viewport, characterOpen);
    await page.pressKey('Escape');
    const characterClosed = await waitFor(async () => { const state = await shellState(page); return !state.openDialogs.includes('ux-character-sheet-dialog') ? state : null; }, 5000);
    run.checks.characterEscapeReturnsFocus = characterClosed.active.id === 'ux-character-button';

    await page.click('#ux-history-button');
    await waitFor(async () => (await shellState(page)).openDialogs.includes('ux-message-history-dialog'), 5000);
    await page.setInputValue('#ux-message-history-dialog input[type="search"]', 'welcome');
    await delay(150);
    const historyOpen = await shellState(page);
    run.checks.historySearchExact = await page.evalCheckedValue(`(() => {
      const rows = Array.from(document.querySelectorAll('#ux-message-history-dialog .ux-history-row-text')).map((row) => row.textContent);
      return rows.length > 0 && rows.every((text) => /welcome/i.test(text));
    })()`);
    run.screenshots.history = await capture(page, qc, `${runId}-03-searchable-history`, viewport, historyOpen);
    await page.pressKey('Escape');
    const historyClosed = await waitFor(async () => { const state = await shellState(page); return !state.openDialogs.includes('ux-message-history-dialog') ? state : null; }, 5000);
    run.checks.historyEscapeReturnsFocus = historyClosed.active.id === 'ux-history-button';

    await page.evalCheckedValue('window.__nethackPromptTest.clearSentInputs(); true');
    await page.click('#ux-map-mode-button');
    await delay(250);
    const follow = await shellState(page);
    run.checks.followTurnless = follow.mapMode === 'follow' && follow.sent === '';
    run.checks.followUsesRenderedMap = follow.map.cells === 1680 && follow.map.transform !== 'none';
    run.screenshots.follow = await capture(page, qc, `${runId}-04-follow-view`, viewport, follow);

    await page.click('#ux-map-mode-button');
    const closeUp = await waitFor(async () => {
      const state = await shellState(page);
      return state.mapMode === 'close' && await page.evalCheckedValue("!document.querySelector('.ux-minimap-button')?.hidden") ? state : null;
    }, 5000);
    const closeUpFacts = await page.evalCheckedValue(`(() => {
      const play = document.getElementById('play-area').getBoundingClientRect();
      const hero = document.querySelector('#game-grid .tile-cell.cursor').getBoundingClientRect();
      const minimap = document.querySelector('.ux-minimap-button').getBoundingClientRect();
      return {
        closeRows: Number(document.body.dataset.uxCloseRows),
        tileSize: hero.width,
        centered: Math.abs((hero.left + hero.width / 2) - (play.left + play.width / 2)) <= hero.width
          && Math.abs((hero.top + hero.height / 2) - (play.top + play.height / 2)) <= hero.height,
        minimapInside: minimap.left >= play.left && minimap.right <= play.right && minimap.top >= play.top && minimap.bottom <= play.bottom,
      };
    })()`);
    run.checks.closeUpTurnlessAndCentered = closeUp.sent === '' && closeUpFacts.closeRows === 9 && closeUpFacts.centered;
    run.checks.closeUpMinimapVisible = closeUpFacts.minimapInside;
    run.screenshots.closeUp = await capture(page, qc, `${runId}-05-close-up-view`, viewport, closeUp);

    await page.click('.ux-minimap-button');
    const overview = await waitFor(async () => {
      const state = await shellState(page);
      return state.openDialogs.includes('ux-level-overview-dialog') ? state : null;
    }, 5000);
    const overviewFacts = await page.evalCheckedValue(`(() => {
      const hero = document.querySelector('#game-grid .tile-cell.cursor');
      const target = document.querySelector('.ux-level-overview-map .tile-cell[data-map-x="' + hero.dataset.mapX + '"][data-map-y="' + hero.dataset.mapY + '"]');
      target.click();
      return {
        cells: document.querySelectorAll('.ux-level-overview-map .tile-cell').length,
        title: document.querySelector('.ux-level-overview-inspector-title').textContent,
        closeFocused: document.activeElement.classList.contains('ux-level-overview-close'),
        sent: window.__nethackPromptTest.sentInputs().join(''),
      };
    })()`);
    run.checks.levelOverviewInspectsTurnlessly = overviewFacts.cells === 1680 && overviewFacts.title && overviewFacts.sent === '';
    run.checks.levelOverviewCloseFocused = overviewFacts.closeFocused;
    run.screenshots.levelOverview = await capture(page, qc, `${runId}-06-level-overview`, viewport, overview);
    await page.pressKey('Escape');
    const overviewClosed = await waitFor(async () => {
      const state = await shellState(page);
      return !state.openDialogs.includes('ux-level-overview-dialog') ? state : null;
    }, 5000);
    run.checks.levelOverviewEscapeRestoresCloseUp = overviewClosed.mapMode === 'close' && overviewClosed.active.id === 'game-grid' && overviewClosed.sent === '';
    await page.click('.ux-minimap-button');
    await waitFor(async () => (await shellState(page)).openDialogs.includes('ux-level-overview-dialog'), 5000);
    await page.click('.ux-level-overview-close');
    const overviewXClosed = await waitFor(async () => {
      const state = await shellState(page);
      return !state.openDialogs.includes('ux-level-overview-dialog') ? state : null;
    }, 5000);
    run.checks.levelOverviewXRestoresCloseUp = overviewXClosed.mapMode === 'close' && overviewXClosed.active.id === 'game-grid' && overviewXClosed.sent === '';


    await page.click('#ux-map-mode-button');
    await delay(100);
    const fullAgain = await shellState(page);
    run.checks.fullImmediateAndTurnless = fullAgain.mapMode === 'full' && fullAgain.sent === '';
    if (viewport.id === 'full-1360x920') {
      await page.click('#ux-hud-density-button');
      await delay(400);
      const detailed = await shellState(page);
      run.checks.detailedPreset = detailed.density === 'detailed' && detailed.status.some((item) => item.label === 'Time');
      run.screenshots.detailed = await capture(page, qc, `${runId}-05-detailed-hud`, viewport, detailed);
      await page.click('#ux-hud-density-button');
      await delay(200);

      const syntheticWarning = await stageSyntheticConditionMask(page, 0x00000002, 'SYNTHETIC PUBLIC-STATE STAGE · warning mask · not core gameplay');
      run.checks.syntheticWarningChip = syntheticWarning.status.some((item) => item.label === 'Senses' && item.value === 'Blind' && item.severity === 'warning');
      run.screenshots.syntheticWarning = await capture(page, qc, `${runId}-06-synthetic-public-mask-warning`, viewport, syntheticWarning);
      const syntheticWarningAfterCapture = await shellState(page);
      run.checks.syntheticWarningStableThroughCapture = syntheticWarningAfterCapture.status.some((item) => item.label === 'Senses' && item.value === 'Blind' && item.severity === 'warning')
        && /SYNTHETIC PUBLIC-STATE STAGE/.test(syntheticWarningAfterCapture.evidenceLabel);

    } else {
      await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 360, deviceScaleFactor: 2, mobile: false });
      await delay(250);
      await page.evalCheckedValue("document.getElementById('ux-history-button').click(); true");
      await waitFor(async () => (await shellState(page)).openDialogs.includes('ux-message-history-dialog'), 5000);
      const zoom = await shellState(page);
      run.checks.zoomActionsReachable = await page.evalCheckedValue(`(() => {
        const dialog = document.getElementById('ux-message-history-dialog');
        const close = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Close');
        const rect = close?.getBoundingClientRect();
        return !!rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
      })()`);
      run.checks.zoomNoHorizontalPageScroll = zoom.scroll.bodyWidth <= zoom.viewport.width + 2 && zoom.scroll.htmlWidth <= zoom.viewport.width + 2;
      run.screenshots.zoomHistory = await capture(page, qc, `${runId}-05-history-200-percent`, viewport, zoom, 200);
      await page.pressKey('Escape');
    }

    const failed = Object.entries(run.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`${runId} checks failed: ${failed.join(', ')}`);
    run.diagnostic = await page.evalCheckedValue('window.netHackPOC.activeDiagnosticRun()', { awaitPromise: true }).catch((error) => ({ ok: false, error: error.message }));
    fs.writeFileSync(path.join(outputDir, 'diagnostic-summary.json'), `${JSON.stringify(run.diagnostic, null, 2)}\n`);
  } catch (error) {
    run.failure = { message: error.message, stack: error.stack };
    run.failureState = await shellState(page).catch((stateError) => ({ error: stateError.message }));
    throw error;
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outputDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outputDir, 'electron-stderr.log'), output.stderr);
    run.output = { stdout: path.join(outputDir, 'electron-stdout.log'), stderr: path.join(outputDir, 'electron-stderr.log') };
    await page.close().catch(() => {});
    await delay(500);
  }
}

async function runSyntheticConditionEvidence(qc, summary, { runId, mask, label, screenshotId, expectedLabels }) {
  const outputDir = path.join(evidenceRoot, runId);
  const playground = path.join(playgroundRoot, runId);
  preparePlayground(playground);
  fs.mkdirSync(outputDir, { recursive: true });
  const viewport = { width: 1360, height: 920 };
  const page = await Harness.createElectronBrowserDriver({
    root, port: basePort, width: viewport.width, height: viewport.height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: 'status/condition-trap', NH_TEST_PLAYGROUND: playground, NH_ELECTRON_SHOW: '1' },
  });
  const run = { playground, synthetic: true, screenshots: {}, checks: {} };
  summary.runs[runId] = run;
  try {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
    await startScenario(page, 'status/condition-trap', `UXM02${runId}`, viewport);
    const staged = await stageSyntheticConditionMask(page, mask, label);
    run.state = staged;
    run.checks.expectedChips = expectedLabels.every((expected) => staged.status.some((item) => item.label === expected.label && item.value === expected.value && item.severity === expected.severity));
    run.checks.evidenceLabeled = /SYNTHETIC PUBLIC-STATE STAGE/.test(staged.evidenceLabel) && /not core gameplay/.test(staged.evidenceLabel);
    run.checks.noTypedOutcomeClaim = staged.feed.every((item) => item.confidence !== 'typed');
    run.screenshots.condition = await capture(page, qc, screenshotId, viewport, staged);
    const afterCapture = await shellState(page);
    run.afterCapture = afterCapture;
    run.checks.stagedStateStableThroughCapture = expectedLabels.every((expected) => afterCapture.status.some((item) => item.label === expected.label && item.value === expected.value && item.severity === expected.severity))
      && afterCapture.evidenceLabel === staged.evidenceLabel;
    const failed = Object.entries(run.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`${runId} checks failed: ${failed.join(', ')}`);
    run.diagnostic = await page.evalCheckedValue('window.netHackPOC.activeDiagnosticRun()', { awaitPromise: true }).catch((error) => ({ ok: false, error: error.message }));
    fs.writeFileSync(path.join(outputDir, 'diagnostic-summary.json'), `${JSON.stringify(run.diagnostic, null, 2)}\n`);
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outputDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outputDir, 'electron-stderr.log'), output.stderr);
    await page.close().catch(() => {});
    await delay(500);
  }
}

async function runLevelTransition(qc, summary) {
  const runId = 'level-transition';
  const outputDir = path.join(evidenceRoot, runId);
  const playground = path.join(playgroundRoot, runId);
  preparePlayground(playground);
  fs.mkdirSync(outputDir, { recursive: true });
  const page = await Harness.createElectronBrowserDriver({
    root, port: basePort, width: 1360, height: 920,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: 'regression/multi-level-downstairs-current', NH_TEST_PLAYGROUND: playground, NH_ELECTRON_SHOW: '1' },
  });
  const run = { playground, screenshots: {}, checks: {} };
  summary.runs[runId] = run;
  try {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await startScenario(page, 'regression/multi-level-downstairs-current', 'UXM02Level', { width: 1360, height: 920 });
    const before = await page.evalCheckedValue(`(() => {
      const status = new Map(window.NetHackUxRuntime.runtime.latestPublicState().snapshot.game.statusValues || []);
      return { dungeon: status.get(20) || '', sent: window.__nethackPromptTest.sentInputs().join('') };
    })()`);
    await page.pressKey('>');
    const after = await waitFor(async () => {
      const state = await shellState(page);
      const dungeon = await page.evalCheckedValue(`(() => new Map(window.NetHackUxRuntime.runtime.latestPublicState().snapshot.game.statusValues || []).get(20) || '')()`);
      return dungeon && dungeon !== before.dungeon && /level/i.test(state.notice) ? { ...state, dungeon } : null;
    }, 15000);
    run.before = before;
    run.after = after;
    run.checks.oneClassicCommand = after.sent === '>';
    run.checks.destinationIsPublic = Boolean(after.dungeon && after.notice.includes(String(after.dungeon).replace(/^Dlvl:\s*/i, '').trim()));
    run.checks.mapFocused = after.map.focused;
    run.checks.noSafetyClaim = !/safe|clear|danger-free/i.test(after.notice);
    run.screenshots.transition = await capture(page, qc, `${runId}-01-confirmed-destination`, { width: 1360, height: 920 }, after);
    const failed = Object.entries(run.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`${runId} checks failed: ${failed.join(', ')}`);
    run.diagnostic = await page.evalCheckedValue('window.netHackPOC.activeDiagnosticRun()', { awaitPromise: true }).catch((error) => ({ ok: false, error: error.message }));
    fs.writeFileSync(path.join(outputDir, 'diagnostic-summary.json'), `${JSON.stringify(run.diagnostic, null, 2)}\n`);
  } catch (error) {
    run.failure = { message: error.message, stack: error.stack };
    run.failureState = await shellState(page).catch((stateError) => ({ error: stateError.message }));
    throw error;
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outputDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outputDir, 'electron-stderr.log'), output.stderr);
    await page.close().catch(() => {});
  }
}

async function main() {
  fs.rmSync(evidenceRoot, { recursive: true, force: true });
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: evidenceRoot });
  const summary = {
    plan: 'NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11',
    chunk: 'UXM-02 domain phase before serialized protocol slot 4',
    port: basePort,
    evidenceRoot,
    runs: {},
  };
  try {
    await runShellViewport({ id: 'full-1360x920', width: 1360, height: 920 }, 0, qc, summary);
    await runShellViewport({ id: 'compact-960x720', width: 960, height: 720 }, 0, qc, summary);
    await runSyntheticConditionEvidence(qc, summary, {
      runId: 'synthetic-danger', mask: 0x00000080,
      label: 'SYNTHETIC PUBLIC-STATE STAGE · danger mask · not core gameplay',
      screenshotId: 'full-1360x920-07-synthetic-public-mask-danger',
      expectedLabels: [{ label: 'Food poison', value: 'Critical', severity: 'danger' }],
    });
    await runSyntheticConditionEvidence(qc, summary, {
      runId: 'synthetic-combined', mask: 0x00000080 | 0x00000002 | 0x00000008,
      label: 'SYNTHETIC PUBLIC-STATE STAGE · combined warning + danger mask · not core gameplay',
      screenshotId: 'full-1360x920-08-synthetic-public-mask-combined',
      expectedLabels: [
        { label: 'Food poison', value: 'Critical', severity: 'danger' },
        { label: 'Mind', value: 'Confused', severity: 'warning' },
        { label: 'Senses', value: 'Blind', severity: 'warning' },
      ],
    });
    await runLevelTransition(qc, summary);
  } finally {
    summary.manifest = qc.manifestFile;
    summary.manifestValidation = Harness.screenshotQc.validateManifest(qc.manifestFile);
    fs.writeFileSync(path.join(evidenceRoot, 'uxm02-real-electron-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  }
  assert(summary.manifestValidation.ok, 'screenshot manifest dimensions/hashes failed validation', summary.manifestValidation.errors);
  console.log(`UXM-02 real Electron domain evidence passed: ${evidenceRoot}`);
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
