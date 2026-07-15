const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

async function state(page) {
  return page.evalCheckedValue(`(() => {
    const cells = Array.from(document.querySelectorAll('.tile-cell')).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        x: Number(el.dataset.mapX),
        y: Number(el.dataset.mapY),
        semanticKind: el.dataset.semanticKind || '',
        semanticName: el.dataset.semanticName || '',
        aria: el.getAttribute('aria-label') || '',
        rect: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      };
    });
    const hero = cells.find((cell) => cell.semanticKind === 'hero' || /hero/i.test(cell.aria));
    const east = hero && cells.find((cell) => cell.x === hero.x + 1 && cell.y === hero.y);
    const altar = hero && cells.find((cell) => cell.x === hero.x + 2 && cell.y === hero.y);
    const tooltip = document.getElementById('map-tooltip');
    return {
      hero,
      east,
      altar,
      tooltip: {
        hidden: Boolean(tooltip?.hidden),
        title: document.getElementById('map-tooltip-title')?.textContent || '',
        text: tooltip?.innerText || '',
      },
      shim: document.getElementById('shim-output')?.innerText || '',
      seen: document.getElementById('shim-output')?.dataset?.seen || '',
    };
  })()`, { awaitPromise: true });
}

async function main() {
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_SHIM_RESET_LOCKS: '1',
      NH_TEST_SCENARIO_ID: 'object/horse-figurine-east',
      NETHACK_SEED: '424242',
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
  });
  const qc = Harness.screenshotQc.createScreenshotQc({
    rootDir: page.outputDir,
    runIdentity: page.outputIdentity,
    manifestFile: path.join(page.outputDir, 'evidence-approval.json'),
  });
  let failure = null;
  try {
    await page.startDefaultGame({ timeoutMs: 25000, playerName: 'FigurineProof' });
    await page.dismissIntroDialogs();
    await waitFor(async () => {
      const current = await state(page);
      if (/bridge_test_scenario_failed/.test(`${current.seen}\n${current.shim}`)) throw new Error(current.shim);
      return /bridge_test_scenario_loaded/.test(`${current.seen}\n${current.shim}`) && current.hero && current.east ? current : null;
    }, 15000);
    await page.dismissIntroDialogs();
    await delay(500);
    await page.dismissIntroDialogs();
    await waitFor(() => page.evalCheckedValue(`!document.getElementById('intro-dialog')?.open && !document.getElementById('document-dialog')?.open`, { awaitPromise: true }), 5000);
    await page.evalCheckedValue(`(() => { document.querySelector('.ux-onboarding-actions button')?.click(); return true; })()`, { awaitPromise: true });
    await delay(100);
    const before = await state(page);
    assert('map cell exposes horse figurine name', /figurine of a horse/i.test(before.east.aria), JSON.stringify(before.east));
    const mapCapture = await page.screenshotEvidence(qc, '00-horse-figurine-map', { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: 'horse figurine visible before hover', viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
    await page.evalCheckedValue(`(() => { const hero = Array.from(document.querySelectorAll('.tile-cell')).find((el) => el.dataset.semanticKind === 'hero'); const target = hero && Array.from(document.querySelectorAll('.tile-cell')).find((el) => Number(el.dataset.mapX) === Number(hero.dataset.mapX) + 1 && Number(el.dataset.mapY) === Number(hero.dataset.mapY)); target?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })); return Boolean(target); })()`, { awaitPromise: true });
    await delay(300);
    const hovered = await state(page);
    const tooltipCapture = await page.screenshotEvidence(qc, '01-horse-figurine-tooltip', { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: 'horse figurine tooltip', viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
    assert('tooltip uses horse figurine instance name', !hovered.tooltip.hidden && /figurine of a horse/i.test(`${hovered.tooltip.title}\n${hovered.tooltip.text}`), JSON.stringify(hovered.tooltip));
    assert('native map event carries the canonical display name', /"displayName":"a figurine of a horse"/.test(hovered.shim), hovered.shim.slice(-3000));
    assert('distant altar map cell is present', before.altar && /altar/i.test(`${before.altar.semanticName}\n${before.altar.aria}`), JSON.stringify(before.altar));
    await page.evalCheckedValue(`(() => { const hero = Array.from(document.querySelectorAll('.tile-cell')).find((el) => el.dataset.semanticKind === 'hero'); const target = hero && Array.from(document.querySelectorAll('.tile-cell')).find((el) => Number(el.dataset.mapX) === Number(hero.dataset.mapX) + 2 && Number(el.dataset.mapY) === Number(hero.dataset.mapY)); target?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })); return Boolean(target); })()`, { awaitPromise: true });
    await delay(300);
    const altarHovered = await state(page);
    const altarTooltipCapture = await page.screenshotEvidence(qc, '02-distant-altar-tooltip', { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: 'distant altar tooltip', viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
    assert('distant altar tooltip has a deity name', !altarHovered.tooltip.hidden && /altar to /i.test(`${altarHovered.tooltip.title}\n${altarHovered.tooltip.text}`) && !/\(null\)|to null/i.test(`${altarHovered.tooltip.title}\n${altarHovered.tooltip.text}`), JSON.stringify(altarHovered.tooltip));
    qc.recordAssertions([
      { id: 'map-cell-exact-name', status: 'passed', details: '' },
      { id: 'tooltip-exact-name', status: 'passed', details: '' },
      { id: 'native-display-name', status: 'passed', details: '' },
      { id: 'distant-altar-deity', status: 'passed', details: '' },
    ]);
    console.log(JSON.stringify({ ok: true, outputDir: page.outputDir, screenshots: [mapCapture.raw.path, tooltipCapture.raw.path, altarTooltipCapture.raw.path] }, null, 2));
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
