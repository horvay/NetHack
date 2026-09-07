'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
const scenarioId = 'identity/canonical-gem-public-names';
const width = 1280;
const height = 900;

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function createEvidence(page) {
  return Harness.screenshotQc.createScreenshotQc({
    rootDir: page.outputDir,
    runIdentity: page.outputIdentity,
    manifestFile: path.join(page.outputDir, 'evidence-approval.json'),
  });
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`);
}

async function finishEvidence(page, qc, scenarioError) {
  await page.close().catch(() => {});
  qc.recordAssertions([{ id: 'canonical-gem-scenario', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(qc.manifestFile);
  console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
}

async function state(page) {
  return page.evalCheckedValue(`(() => {
    const cells = Array.from(document.querySelectorAll('.tile-cell')).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: Number(element.dataset.mapX),
        y: Number(element.dataset.mapY),
        semanticKind: element.dataset.semanticKind || '',
        semanticName: element.dataset.semanticName || '',
        aria: element.getAttribute('aria-label') || '',
        rect: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      };
    });
    const hero = cells.find((cell) => cell.semanticKind === 'hero' || cell.semanticKind === 'player' || /Hero|Player|Valkyrie/i.test(cell.aria));
    const east = hero ? cells.find((cell) => cell.x === hero.x + 1 && cell.y === hero.y) : null;
    const interaction = window.__nethackPromptTest?.dialog?.();
    const itemsRoot = document.getElementById('ux-items-root');
    const inventoryRowNodes = Array.from(itemsRoot?.querySelectorAll('.uxm-item-row') || []);
    const inventoryRows = inventoryRowNodes.map((node) => node.innerText || '');
    const inventoryRowModels = inventoryRowNodes.map((node) => {
      const icon = node.querySelector('.uxm-item-icon'); const image = icon?.querySelector('img'); const box = image?.getBoundingClientRect();
      return { text: node.innerText || '', iconSource: icon?.dataset.iconSource || '', iconSrc: image?.currentSrc || image?.src || '', iconNaturalWidth: image?.naturalWidth || 0, iconNaturalHeight: image?.naturalHeight || 0, iconBox: box ? { width: box.width, height: box.height } : null };
    });
    const itemsSnapshot = window.NetHackUxEquipmentScreen?.controller?.snapshot?.() || {};
    const itemsLayout = (() => {
      const pane = itemsRoot?.querySelector('.uxm-inventory-pane'); const list = itemsRoot?.querySelector('.uxm-inventory-list-wrap'); const rail = itemsRoot?.querySelector('.uxm-selection-rail');
      const rect = (node) => { const box = node?.getBoundingClientRect(); return box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null; };
      const paneBox = rect(pane); const listBox = rect(list); const railBox = rect(rail);
      return { pane: paneBox, list: listBox, rail: railBox, listShare: paneBox && listBox ? listBox.height / paneBox.height : 0, railShare: paneBox && railBox ? railBox.height / paneBox.height : 1, rootHorizontalOverflow: Boolean(itemsRoot && itemsRoot.scrollWidth > itemsRoot.clientWidth), documentHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    })();
    const camera = (() => {
      const playArea = document.getElementById('play-area');
      const cursorCell = document.querySelector('#game-grid .tile-cell.cursor');
      const playRect = playArea?.getBoundingClientRect();
      const heroRect = cursorCell?.getBoundingClientRect();
      const rect = (value) => value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null;
      return {
        scrollLeft: playArea?.scrollLeft || 0,
        scrollTop: playArea?.scrollTop || 0,
        playRect: rect(playRect),
        heroRect: rect(heroRect),
        heroCentered: Boolean(playRect && heroRect
          && Math.abs((heroRect.left + heroRect.width / 2) - (playRect.left + playRect.width / 2)) <= heroRect.width
          && Math.abs((heroRect.top + heroRect.height / 2) - (playRect.top + playRect.height / 2)) <= heroRect.height),
      };
    })();
    return {
      running: Boolean(window.__nethackAutomation?.state?.().runningState?.running),
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      inventory: window.__nethackPromptTest?.inventory?.(),
      interaction,
      activePrompt: window.__nethackPromptTest?.prompt?.(),
      sentInputs: (window.__nethackPromptTest?.sentInputs?.() || []).join(''),
      transferOwner: window.__nethackPromptTest?.container?.(),
      itemsOwner: {
        open: Boolean(itemsSnapshot.open),
        hidden: Boolean(itemsRoot?.hidden),
        ariaHidden: itemsRoot?.getAttribute('aria-hidden') || '',
        childCount: itemsRoot?.childElementCount || 0,
        text: itemsRoot?.innerText || '',
        rows: inventoryRows,
      },
      shimEvents: (window.__nethackPromptTest?.shimEvents?.() || []).map((entry) => entry.event || entry),
      hero,
      east,
      camera,
      mapDetail: {
        open: Boolean(document.getElementById('ux-map-detail-dialog')?.open),
        title: document.getElementById('ux-map-detail-title')?.textContent || '',
        description: document.querySelector('#ux-map-detail-dialog .ux-map-detail-description')?.textContent || '',
        visibleRows: Array.from(document.querySelectorAll('#ux-map-detail-dialog .ux-map-detail-contents li')).map((row) => row.innerText || ''),
        text: document.getElementById('ux-map-detail-dialog')?.innerText || '',
      },
      inventoryRows,
      inventoryRowModels,
      itemsLayout,
      body: document.body.innerText,
    };
  })()`);
}

async function waitForFiniteUiAnimations(page) {
  return page.evalCheckedValue(`(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    if (document.fonts?.ready) await document.fonts.ready;
    for (;;) {
      await frame();
      await frame();
      const animations = document.getAnimations().filter((animation) => {
        const timing = animation.effect?.getComputedTiming?.();
        return animation.playState !== 'finished' && Number.isFinite(timing?.endTime);
      });
      if (!animations.length) return true;
      await Promise.allSettled(animations.map((animation) => animation.finished));
    }
  })()`, { awaitPromise: true });
}

async function screenshot(page, qc, id, stateName) {
  await waitForFiniteUiAnimations(page);
  return page.screenshotEvidence(qc, id, {
    classification: 'synthetic-fixture',
    viewport: { width, height, devicePixelRatio: 1 },
    state: stateName,
  });
}

async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NETHACK_SEED: '424242',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none',
    },
  });
  const qc = createEvidence(page);
  let scenarioError = null;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true });
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const initialDialogs = await page.evalCheckedValue("Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id)");
    if (initialDialogs.includes('startup-choice-dialog')) await page.click('#startup-new-game');
    else await page.click('#start-shim');
    await Harness.waitFor(() => page.evalCheckedValue("document.getElementById('character-dialog')?.open"), 5000);
    await page.setInputValue('#player-name', 'GemNames');
    await page.setInputValue('#player-role', 'Val');
    await page.setInputValue('#player-race', 'Hum');
    await page.setInputValue('#player-gender', 'Fem');
    await page.setInputValue('#player-align', 'Law');
    await page.setInputValue('#game-seed', '424242');
    await page.click('#confirm-character');

    let current = await Harness.waitFor(async () => {
      const next = await state(page);
      const loaded = next.shimEvents.some((event) => event.name === 'bridge_test_scenario_loaded');
      return next.running && loaded && next.hero && next.east ? next : null;
    }, 25000);
    await waitForFiniteUiAnimations(page);
    current = await state(page);
    assert('canonical scenario presents the intro before gameplay evidence', current.dialogs.includes('intro-dialog'), JSON.stringify(current.dialogs));
    const cameraBeforeIntroClose = current.camera;
    await page.click('#intro-continue');
    await waitForFiniteUiAnimations(page);
    current = await state(page);
    assert('intro focus restoration preserves the close-up camera scroll', current.camera.scrollLeft === cameraBeforeIntroClose.scrollLeft && current.camera.scrollTop === cameraBeforeIntroClose.scrollTop, JSON.stringify({ before: cameraBeforeIntroClose, after: current.camera }));
    assert('intro focus restoration keeps the hero framed in close-up view', current.camera.heroCentered, JSON.stringify(current.camera));

    const inventoryEvent = current.shimEvents.filter((event) => event.name === 'shim_update_inventory').findLast((event) => Array.isArray(event.items) && event.items.length === 2);
    const nativeYellow = inventoryEvent?.items?.find((item) => /yellow gem/i.test(item.text || item.displayName || item.semanticAppearance || ''));
    const nativeChrysoberyl = inventoryEvent?.items?.find((item) => /chrysoberyl/i.test(item.text || item.displayName || item.semanticName || ''));
    const groundItems = current.shimEvents.filter((event) => event.name === 'shim_ground_pile_snapshot').flatMap((event) => event.items || []);
    const nativeRed = groundItems.find((item) => /red gem/i.test(item.displayName || item.semanticAppearance || ''));
    const nativeGarnet = groundItems.find((item) => /garnet/i.test(item.displayName || item.semanticName || ''));
    assert('native unknown inventory gem has full public appearance', nativeYellow?.semanticKnown === false && nativeYellow.semanticAppearance === 'yellow gem', JSON.stringify(nativeYellow));
    assert('native unknown inventory gem hides citrine', nativeYellow?.semanticName == null && !/citrine/i.test(JSON.stringify(nativeYellow)), JSON.stringify(nativeYellow));
    assert('native identified inventory gem has full identity', nativeChrysoberyl?.semanticKnown === true && nativeChrysoberyl.semanticName === 'chrysoberyl', JSON.stringify(nativeChrysoberyl));
    assert('native unknown ground gem has full public appearance', nativeRed?.semanticKnown === false && nativeRed.semanticAppearance === 'red gem', JSON.stringify(nativeRed));
    assert('native unknown ground gem hides ruby', nativeRed?.semanticName == null && !/ruby/i.test(JSON.stringify(nativeRed)), JSON.stringify(nativeRed));
    assert('native identified ground gem has full identity', nativeGarnet?.semanticKnown === true && nativeGarnet.semanticName === 'garnet', JSON.stringify(nativeGarnet));
    assert('east map cell exposes complete appearance', /red gem/i.test(`${current.east.semanticName} ${current.east.aria}`) && !/^red$/i.test(current.east.semanticName), JSON.stringify(current.east));

    const screenshots = {};
    screenshots.gameplay = await screenshot(page, qc, '01-canonical-gems-gameplay', 'canonical-gems-gameplay');
    const sentInputsBeforeLook = current.sentInputs;
    await page.click(`#game-grid .tile-cell[data-map-x="${current.east.x}"][data-map-y="${current.east.y}"]`);
    await Harness.waitFor(() => state(page).then((next) => next.mapDetail.open ? next : null), 5000);
    current = await state(page);
    const lookDetail = current.mapDetail;
    const visibleLookDetail = `${lookDetail.title}\n${lookDetail.description}\n${lookDetail.visibleRows.join('\n')}`;
    assert('look-equivalent details use complete unknown gem appearance', /red gem/i.test(visibleLookDetail), JSON.stringify(lookDetail));
    assert('look-equivalent details do not leak ruby', !/ruby/i.test(visibleLookDetail), JSON.stringify(lookDetail));
    assert('look-equivalent details are never a bare color', !/^red$/i.test(lookDetail.title.trim()), JSON.stringify(lookDetail));
    assert('look-equivalent details open without sending game input', current.sentInputs === sentInputsBeforeLook, JSON.stringify({ before: sentInputsBeforeLook, after: current.sentInputs }));
    screenshots.look = await screenshot(page, qc, '02-red-gem-look-details', 'red-gem-look-equivalent');
    await page.pressKey('Escape');
    await Harness.waitFor(() => state(page).then((next) => !next.mapDetail.open ? next : null), 5000);

    await page.evalCheckedValue("document.getElementById('game-grid')?.focus?.(); true");
    await page.pressKey('i', 'i');
    await Harness.delay(750);
    await page.evalCheckedValue("Promise.all(Array.from(document.querySelectorAll('#ux-items-root .uxm-item-icon img')).map((image) => image.decode?.().catch(() => {}))).then(() => true)", { awaitPromise: true });
    current = await state(page);
    assert('inventory equipment owner opens', current.itemsOwner.open && current.itemsOwner.childCount > 0, JSON.stringify({ itemsOwner: current.itemsOwner, interaction: current.interaction, activePrompt: current.activePrompt, transferOwner: current.transferOwner, sentInputs: current.sentInputs }));
    const visibleInventory = `${current.itemsOwner.text}\n${current.inventoryRows.join('\n')}`;
    assert('inventory paints complete unknown gem appearance', /yellow gem/i.test(visibleInventory) && !/(?:^|\n)\s*yellow\s*(?:\n|$)/i.test(visibleInventory), visibleInventory);
    assert('inventory paints identified full gem name', /chrysoberyl/i.test(visibleInventory), visibleInventory);
    assert('inventory does not leak citrine identity', !/citrine/i.test(visibleInventory), visibleInventory);
    assert('inventory gem rows use decoded canonical tile art instead of glyph fallback', current.inventoryRowModels.length === 2 && current.inventoryRowModels.every((row) => row.iconSource === 'resolved' && /\.png(?:\?|$)/i.test(row.iconSrc) && row.iconNaturalWidth > 0 && row.iconNaturalHeight > 0 && row.iconBox?.width >= 28 && row.iconBox?.width <= 36 && row.iconBox?.height >= 28 && row.iconBox?.height <= 36), JSON.stringify(current.inventoryRowModels));
    assert('unknown and identified gems use their public canonical art', current.inventoryRowModels.some((row) => /yellow gem/i.test(row.text) && /gem-class-icon\.png/i.test(row.iconSrc)) && current.inventoryRowModels.some((row) => /chrysoberyl/i.test(row.text) && /chrysoberyl\.png/i.test(row.iconSrc)), JSON.stringify(current.inventoryRowModels));
    assert('1280x900 gem inventory keeps a dominant list and shallow action rail without overflow', current.itemsLayout.listShare >= 0.62 && current.itemsLayout.railShare <= 0.2 && current.itemsLayout.list?.height >= 480 && !current.itemsLayout.rootHorizontalOverflow && !current.itemsLayout.documentHorizontalOverflow, JSON.stringify(current.itemsLayout));
    assert('gem equipment workspace exposes no raw or fallback labels', !/Inventory selector|Name unavailable|Loading your inventory|semantic IDs|undefined|null/i.test(current.itemsOwner.text), current.itemsOwner.text);
    screenshots.inventory = await screenshot(page, qc, '03-canonical-gems-inventory', 'canonical-gems-inventory');

    fs.writeFileSync(path.join(page.outputDir, 'canonical-gem-names-result.json'), JSON.stringify({ scenarioId, viewport: { width, height }, screenshots, native: { yellow: nativeYellow, chrysoberyl: nativeChrysoberyl, red: nativeRed, garnet: nativeGarnet }, mapDetail: lookDetail, itemsOwner: current.itemsOwner, inventoryRows: current.inventoryRows, inventoryRowModels: current.inventoryRowModels, itemsLayout: current.itemsLayout }, null, 2));
  } catch (error) {
    scenarioError = error;
  } finally {
    await finishEvidence(page, qc, scenarioError);
  }
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
  });
}
