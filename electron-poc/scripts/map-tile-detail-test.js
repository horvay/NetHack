const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_MAP_TILE_DETAIL_OUT_DIR || path.join(root, 'test-output', 'map-tile-detail');
const port = Number(process.env.NH_MAP_TILE_DETAIL_CDP_PORT || 19924);

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  await Harness.withElectronPage({ root, port, width: 1360, height: 920 }, async (page) => {
    await page.waitForValue("document.readyState === 'complete' && !!window.__nethackTooltipTest && !!window.NetHackUxMapDetailController", 10000);
    await page.evalCheckedValue(`(() => {
      window.__nethackTooltipTest.setCells([
        { x: 3, y: 2, ch: 'f', semanticKind: 'pet', semanticName: 'kitten', semanticKnown: true, glyph: 798 }
      ]);
      window.__nethackPromptTest.clearSentInputs();
      return true;
    })()`);

    const selector = '#game-grid .tile-cell[data-map-x="3"][data-map-y="2"]';
    await page.click(selector);
    await page.waitForValue("document.getElementById('ux-map-detail-dialog')?.open === true", 5000);
    const openState = await page.evalCheckedValue(`(() => {
      const dialog = document.getElementById('ux-map-detail-dialog');
      const artwork = dialog.querySelector('.ux-map-detail-artwork');
      const artRect = artwork.getBoundingClientRect();
      return {
        open: dialog.open,
        title: dialog.querySelector('h2')?.textContent || '',
        visibleRows: Array.from(dialog.querySelectorAll('.ux-map-detail-contents li')).map((row) => row.innerText),
        artworkTileId: artwork?.dataset.tileId || '',
        artworkSize: { width: artRect.width, height: artRect.height },
        inspectToggleCount: document.querySelectorAll('.ux-map-inspect-toggle').length,
        inspectPanelCount: document.querySelectorAll('.ux-map-inspector').length,
        inspectMode: document.getElementById('game-grid').classList.contains('ux-inspect-mode'),
        sentInputs: window.__nethackPromptTest.sentInputs(),
      };
    })()`);
    const screenshot = path.join(outDir, 'kitten-tile-detail.png');
    await page.screenshot(screenshot);

    await page.pressKey('Escape');
    await page.waitForValue("document.getElementById('ux-map-detail-dialog')?.open === false", 5000);
    const closedState = await page.evalCheckedValue(`(() => ({
      open: document.getElementById('ux-map-detail-dialog').open,
      focusedId: document.activeElement?.id || '',
      sentInputs: window.__nethackPromptTest.sentInputs(),
    }))()`);
    await page.evalCheckedValue(`(() => {
      const cells = [];
      for (let y = 5; y <= 15; y += 1) {
        for (let x = 24; x <= 56; x += 1) {
          const edge = y === 5 || y === 15 || x === 24 || x === 56;
          cells.push({ x, y, ch: edge ? (y === 5 || y === 15 ? '-' : '|') : '.', semanticKind: 'terrain', semanticName: edge ? 'wall' : 'floor of a room', semanticKnown: true });
        }
      }
      cells.push(
        { x: 40, y: 10, ch: '@', semanticKind: 'hero', semanticName: 'hero', semanticKnown: true },
        { x: 44, y: 10, ch: 'o', semanticKind: 'monster', semanticName: 'goblin', semanticKnown: true },
        { x: 52, y: 10, ch: '>', semanticKind: 'stairs', semanticName: 'staircase down', semanticKnown: true },
      );
      window.__nethackTooltipTest.setCells(cells);
      window.__nethackPromptTest.event({ name: 'shim_curs', window: 1, x: 40, y: 10 });
      const shell = window.NetHackUxRuntime.runtime.domain('shell');
      shell.setCloseRows(9, { persist: false });
      shell.setMapMode('close', { persist: false });
      shell.setLogRatio(0.56, { persist: false });
      window.__nethackPromptTest.clearSentInputs();
      window.__nethackPromptTest.setRunning(true);
      return true;
    })()`);
    await page.waitForValue("document.body.dataset.uxMapMode === 'close' && !document.querySelector('.ux-minimap-button')?.hidden", 5000);
    await page.waitForValue(`(() => {
      const play = document.getElementById('play-area')?.getBoundingClientRect();
      const hero = document.querySelector('#game-grid .tile-cell.cursor')?.getBoundingClientRect();
      return Boolean(play && hero
        && Math.abs((hero.left + hero.width / 2) - (play.left + play.width / 2)) <= hero.width
        && Math.abs((hero.top + hero.height / 2) - (play.top + play.height / 2)) <= hero.height);
    })()`, 5000);
    const closeUpState = await page.evalCheckedValue(`(() => {
      const play = document.getElementById('play-area').getBoundingClientRect();
      const hero = document.querySelector('#game-grid .tile-cell.cursor').getBoundingClientRect();
      const minimapElement = document.querySelector('.ux-minimap-button');
      const minimap = minimapElement.getBoundingClientRect();
      const minimapCanvas = minimapElement.querySelector('.ux-minimap-canvas');
      const pixels = minimapCanvas.getContext('2d').getImageData(0, 0, minimapCanvas.width, minimapCanvas.height).data;
      let greenMarkerPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] < 160 && pixels[index + 1] > 210 && pixels[index + 2] > 120 && pixels[index + 3] > 200) greenMarkerPixels += 1;
      }
      return {
        mode: document.body.dataset.uxMapMode,
        rows: Number(document.body.dataset.uxCloseRows),
        minimapSize: document.body.dataset.uxMinimapSize,
        minimapWidth: minimap.width,
        greenMarkerPixels,
        heroCentered: Math.abs((hero.left + hero.width / 2) - (play.left + play.width / 2)) <= hero.width
          && Math.abs((hero.top + hero.height / 2) - (play.top + play.height / 2)) <= hero.height,
        minimapInside: minimap.left >= play.left && minimap.right <= play.right && minimap.top >= play.top && minimap.bottom <= play.bottom,
        sentInputs: window.__nethackPromptTest.sentInputs(),
      };
    })()`);
    const closeUpScreenshot = path.join(outDir, 'close-up-view.png');
    await page.screenshot(closeUpScreenshot);
    await page.click('#settings-button');
    await page.waitForValue("document.getElementById('settings-dialog')?.open === true", 5000);
    const minimapSettingsScreenshot = path.join(outDir, 'minimap-size-settings.png');
    await page.screenshot(minimapSettingsScreenshot);
    await page.evalCheckedValue(`(() => {
      const select = document.getElementById('setting-minimap-size');
      select.value = 'large';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await page.click('#settings-save');
    await page.waitForValue(`document.body.dataset.uxMinimapSize === 'large' && document.querySelector('.ux-minimap-button').getBoundingClientRect().width > ${closeUpState.minimapWidth}`, 5000);
    const largeMinimapWidth = await page.evalCheckedValue("document.querySelector('.ux-minimap-button').getBoundingClientRect().width");
    await page.click('#settings-button');
    await page.waitForValue("document.getElementById('settings-dialog')?.open === true", 5000);
    await page.evalCheckedValue(`(() => {
      const select = document.getElementById('setting-minimap-size');
      select.value = 'medium';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await page.click('#settings-save');
    await page.waitForValue("document.body.dataset.uxMinimapSize === 'medium'", 5000);
    const minimapSizePersisted = await page.evalCheckedValue("JSON.parse(localStorage.getItem('nethack-electron-presentation-settings-v4') || '{}')?.map?.minimapSize");

    await page.evalCheckedValue("window.__nethackPromptTest.event({ name: 'shim_curs', window: 1, x: 1, y: 1 }); true");
    await page.waitForValue(`(() => {
      const play = document.getElementById('play-area')?.getBoundingClientRect();
      const heroCell = document.querySelector('#game-grid .tile-cell.cursor');
      const hero = heroCell?.getBoundingClientRect();
      return Boolean(play && hero && heroCell.dataset.mapX === '1' && heroCell.dataset.mapY === '1'
        && Math.abs((hero.left + hero.width / 2) - (play.left + play.width / 2)) <= hero.width
        && Math.abs((hero.top + hero.height / 2) - (play.top + play.height / 2)) <= hero.height);
    })()`, 5000);
    const edgeCentered = await page.evalCheckedValue("document.querySelector('#game-grid .tile-cell.cursor')?.dataset.mapX === '1' && document.querySelector('#game-grid .tile-cell.cursor')?.dataset.mapY === '1'");
    await page.evalCheckedValue("window.__nethackPromptTest.event({ name: 'shim_curs', window: 1, x: 40, y: 10 }); true");
    await page.waitForValue("document.querySelector('#game-grid .tile-cell.cursor')?.dataset.mapX === '40'", 5000);


    await page.click('.ux-map-scale-up');
    await page.waitForValue("document.body.dataset.uxCloseRows === '7'", 5000);
    await page.click('.ux-map-scale-down');
    await page.waitForValue("document.body.dataset.uxCloseRows === '9'", 5000);
    const closeRowsPersisted = await page.evalCheckedValue("JSON.parse(localStorage.getItem('nethack-electron-presentation-settings-v4') || '{}')?.map?.closeRows");

    await page.click('.ux-minimap-button');
    await page.waitForValue("document.getElementById('ux-level-overview-dialog')?.open === true", 5000);
    await page.click('.ux-level-overview-map .tile-cell[data-map-x="44"][data-map-y="10"]');
    await page.evalCheckedValue(`(() => {
      const test = window.__nethackPromptTest;
      test.event({ name: 'bridge_direction_prompt', query: 'Choose a direction or map target.', choices: 'ykulnjbh.<>' });
      test.clearSentInputs();
      return Boolean(test.prompt());
    })()`);
    await page.pressKey('ArrowRight');
    await page.evalCheckedValue(`(() => {
      const test = window.__nethackPromptTest;
      const prompt = test.prompt();
      test.event({ name: 'bridge_direction_answer', return: 0, requestId: prompt?.requestId, transactionId: prompt?.transactionId, lifecycleRevision: prompt?.lifecycleRevision });
      return true;
    })()`);
    const overviewState = await page.evalCheckedValue(`(() => ({
      open: document.getElementById('ux-level-overview-dialog').open,
      cells: document.querySelectorAll('.ux-level-overview-map .tile-cell').length,
      title: document.querySelector('.ux-level-overview-inspector-title').textContent,
      sentInputs: window.__nethackPromptTest.sentInputs(),
    }))()`);
    const overviewScreenshot = path.join(outDir, 'level-overview.png');
    await page.screenshot(overviewScreenshot);
    await page.pressKey('Escape');
    await page.waitForValue("document.getElementById('ux-level-overview-dialog')?.open === false", 5000);
    const overviewEscapeState = await page.evalCheckedValue(`(() => ({
      mode: document.body.dataset.uxMapMode,
      focusedId: document.activeElement?.id || '',
      sentInputs: window.__nethackPromptTest.sentInputs(),
    }))()`);
    await page.click('.ux-minimap-button');
    await page.waitForValue("document.getElementById('ux-level-overview-dialog')?.open === true", 5000);
    await page.click('.ux-level-overview-close');
    await page.waitForValue("document.getElementById('ux-level-overview-dialog')?.open === false", 5000);
    const overviewXState = await page.evalCheckedValue(`(() => ({
      mode: document.body.dataset.uxMapMode,
      focusedId: document.activeElement?.id || '',
      sentInputs: window.__nethackPromptTest.sentInputs(),
    }))()`);


    const checks = {
      clickOpensNearFullModal: openState.open && openState.artworkSize.width >= 300 && openState.artworkSize.height >= 300,
      modalUsesClickedTileArt: openState.title === 'Kitten' && openState.artworkTileId === 'kitten-pet',
      modalShowsPublicTileInformation: openState.visibleRows.some((row) => /Kitten/i.test(row)),
      inspectModeRemoved: openState.inspectToggleCount === 0 && openState.inspectPanelCount === 0 && !openState.inspectMode,
      clickAndEscapeAreTurnless: openState.sentInputs.length === 0 && closedState.sentInputs.length === 0,
      escapeClosesAndReturnsFocus: !closedState.open && closedState.focusedId === 'game-grid',
      closeUpCentersHeroAndShowsMinimap: closeUpState.mode === 'close' && closeUpState.rows === 9 && closeUpState.heroCentered && closeUpState.minimapInside,
      minimapDefaultsLargerAndShowsGreenHero: closeUpState.minimapSize === 'medium' && closeUpState.minimapWidth >= 260 && closeUpState.greenMarkerPixels >= 20,
      minimapSizeSettingPersistsAndResizes: largeMinimapWidth > closeUpState.minimapWidth && minimapSizePersisted === 'medium',
      closeUpCentersHeroAtDungeonEdge: edgeCentered,
      closeUpControlsPersistRowCount: closeRowsPersisted === 9,
      levelOverviewInspectsKnownSquareTurnlessly: overviewState.open && overviewState.cells === 1680 && overviewState.title === 'Goblin' && overviewState.sentInputs.length === 0,
      levelOverviewEscapeRestoresCloseUp: overviewEscapeState.mode === 'close' && overviewEscapeState.focusedId === 'game-grid' && overviewEscapeState.sentInputs.length === 0,
      levelOverviewXRestoresCloseUp: overviewXState.mode === 'close' && overviewXState.focusedId === 'game-grid' && overviewXState.sentInputs.length === 0,
    };
    const result = { checks, openState, closedState, closeUpState, largeMinimapWidth, minimapSizePersisted, edgeCentered, closeRowsPersisted, overviewState, overviewEscapeState, overviewXState, screenshots: { tileDetail: screenshot, closeUp: closeUpScreenshot, minimapSettings: minimapSettingsScreenshot, levelOverview: overviewScreenshot } };
    fs.writeFileSync(path.join(outDir, 'map-tile-detail-result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    if (failed.length) throw new Error(`map tile detail assertions failed: ${failed.join(', ')}`);
  });
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
