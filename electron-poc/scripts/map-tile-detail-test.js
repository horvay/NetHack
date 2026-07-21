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

    const checks = {
      clickOpensNearFullModal: openState.open && openState.artworkSize.width >= 300 && openState.artworkSize.height >= 300,
      modalUsesClickedTileArt: openState.title === 'Kitten' && openState.artworkTileId === 'kitten-pet',
      modalShowsPublicTileInformation: openState.visibleRows.some((row) => /Kitten/i.test(row)),
      inspectModeRemoved: openState.inspectToggleCount === 0 && openState.inspectPanelCount === 0 && !openState.inspectMode,
      clickAndEscapeAreTurnless: openState.sentInputs.length === 0 && closedState.sentInputs.length === 0,
      escapeClosesAndReturnsFocus: !closedState.open && closedState.focusedId === 'game-grid',
    };
    const result = { checks, openState, closedState, screenshot };
    fs.writeFileSync(path.join(outDir, 'map-tile-detail-result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    if (failed.length) throw new Error(`map tile detail assertions failed: ${failed.join(', ')}`);
  });
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
