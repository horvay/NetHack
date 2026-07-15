const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_DIRECTION_HELPER_OUT_DIR || path.join(root, 'test', 'direction-helper-layout');
const port = Number(process.env.NH_DIRECTION_HELPER_CDP_PORT || 9444);
const width = Number(process.env.NH_DIRECTION_HELPER_WIDTH || 1656);
const height = Number(process.env.NH_DIRECTION_HELPER_HEIGHT || 861);
const saveScreenshot = process.env.NH_DIRECTION_HELPER_SCREENSHOT !== '0';

const { delay } = Harness;

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const page = await Harness.createElectronPageSession({ root, port, width, height, outputDir: outDir, teardownTimeoutMs: 5000 });
  let scenarioError;
  try {
    await page.waitForValue("document.readyState === 'complete' && !!window.__nethackPromptTest", 10000);
    await page.run(`(() => {
      window.__nethackPromptTest.reset();
      window.__nethackPromptTest.event({ name: 'shim_putstr', text: 'You hear a door creak nearby.' });
      window.__nethackPromptTest.event({ name: 'shim_putstr', text: 'You see here a food ration.' });
      window.__nethackPromptTest.event({ name: 'bridge_direction_prompt', query: 'Choose a direction or map target.', choices: 'ykulnjbh.<>' });
    })()`);
    await page.waitForValue("document.body.classList.contains('direction-helper-active') && !document.getElementById('direction-helper').hidden", 5000);
    await delay(250);
    const metrics = await page.evalValue(`(() => {
      const rect = (el) => { const r = el.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height, scrollWidth:el.scrollWidth, scrollHeight:el.scrollHeight, clientWidth:el.clientWidth, clientHeight:el.clientHeight }; };
      const helper = document.getElementById('direction-helper');
      const log = document.getElementById('log-panel');
      const grid = document.getElementById('game-grid');
      const buttons = Array.from(helper.querySelectorAll('button'));
      const cells = Array.from(helper.querySelectorAll('.direction-pad > *'));
      const helperRect = rect(helper); const logRect = rect(log); const gridRect = rect(grid);
      const helperWithinViewport = helperRect.left >= 0 && helperRect.top >= 0 && helperRect.right <= innerWidth && helperRect.bottom <= innerHeight;
      const helperWithinLog = helperRect.left >= logRect.left && helperRect.top >= logRect.top && helperRect.right <= logRect.right + 1 && helperRect.bottom <= logRect.bottom + 1;
      const helperNotClipped = helper.scrollWidth <= helper.clientWidth + 1 && helper.scrollHeight <= helper.clientHeight + 1;
      const cellText = cells.map((el) => el.innerText.trim());
      const cellKeys = cells.map((el) => el.dataset.key || '.');
      const onlyArrowGlyphs = buttons.filter((button) => !button.matches('[data-compass-run]')).every((button) => /^[↖↑↗←→↙↓↘]$/.test(button.innerText.trim()));
      const requiredMessageHeight = innerHeight <= 450 ? 50 : 72;
      return {
        viewport: { width: innerWidth, height: innerHeight },
        helperRect, logRect, gridRect,
        buttonCount: buttons.length,
        cellText,
        buttonLabels: buttons.map((b) => b.innerText.trim()),
        cellKeys,
        buttonKeys: buttons.map((b) => b.dataset.key),
        hasWidgetEscButton: buttons.some((b) => b.id === 'direction-helper-cancel' || /\bEsc\b/i.test(b.innerText.trim())),
        hasHelperCopyElement: !!helper.querySelector('#direction-helper-copy'),
        bodyClass: document.body.className,
        messages: document.getElementById('messages').innerText,
        helperText: helper.innerText,
        gameGridFullWidth: gridRect.width >= innerWidth - 40,
        helperWithinViewport, helperWithinLog, helperNotClipped,
        requiredMessageHeight,
        logReadable: document.getElementById('messages').clientHeight >= requiredMessageHeight,
        compactSquare: helperRect.width <= 144 && helperRect.height <= 160,
        properCompassOrder: cellKeys.join('') === 'ykuh.lbjn',
        properCompassLabels: cellText.join('|') === '↖|↑|↗|←|·|→|↙|↓|↘',
        onlyArrowGlyphs,
        pass: helperWithinViewport && helperWithinLog && helperNotClipped && gridRect.width >= innerWidth - 40 && buttons.length === 8 && cellKeys.join('') === 'ykuh.lbjn' && cellText.join('|') === '↖|↑|↗|←|·|→|↙|↓|↘' && onlyArrowGlyphs && document.getElementById('messages').clientHeight >= requiredMessageHeight && helperRect.width <= 144 && helperRect.height <= 160 && !helper.querySelector('#direction-helper-copy') && !/Esc|Choose a direction or map target|Dungeon remains playable|North|South|East|West|NW|NE|SW|SE/i.test(helper.innerText) && !buttons.some((button) => button.id === 'direction-helper-cancel' || /\bEsc\b/i.test(button.innerText.trim())),
      };
    })()`);
    metrics.defaultCompass = await page.evalValue(`(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true);
      document.querySelector('#direction-helper [data-key="l"]').click();
      const walkSent = t.sentInputs().join('');
      t.reset(); t.setRunning(true);
      const run = document.querySelector('#direction-helper [data-compass-run]');
      run.click();
      const armed = { pressed: run.getAttribute('aria-pressed'), selected: run.classList.contains('selected'), label: run.textContent.trim() };
      run.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      const cancelled = { sent: t.sentInputs().join(''), pressed: run.getAttribute('aria-pressed'), selected: run.classList.contains('selected'), label: run.textContent.trim() };
      run.click();
      document.querySelector('#direction-helper [data-key="k"]').click();
      const runSent = t.sentInputs().join('');
      const disarmed = { pressed: run.getAttribute('aria-pressed'), selected: run.classList.contains('selected') };
      document.querySelector('#direction-helper [data-key="u"]').click();
      return { walkSent, runSent, afterSecondDirection: t.sentInputs().join(''), armed, cancelled, disarmed };
    })()`);
    metrics.defaultCompassPass = metrics.defaultCompass.walkSent === 'l'
      && metrics.defaultCompass.runSent === 'K'
      && metrics.defaultCompass.afterSecondDirection === 'Ku'
      && metrics.defaultCompass.armed.label === 'Go'
      && metrics.defaultCompass.armed.pressed === 'true'
      && metrics.defaultCompass.armed.selected
      && metrics.defaultCompass.cancelled.sent === ''
      && metrics.defaultCompass.cancelled.pressed === 'false'
      && !metrics.defaultCompass.cancelled.selected
      && metrics.defaultCompass.cancelled.label === 'Run'
      && metrics.defaultCompass.disarmed.pressed === 'false'
      && !metrics.defaultCompass.disarmed.selected;
    metrics.pass = metrics.pass && metrics.defaultCompassPass;
    await page.evalCheckedValue(`(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true);
      document.getElementById('startup-choice-dialog')?.close?.('focused-proof-setup');
      t.event({ name: 'bridge_direction_prompt', query: 'Choose a direction or map target.', choices: 'ykulnjbh.<>' });
      return true;
    })()`);
    await page.waitForCheckedValue("document.body.classList.contains('direction-helper-active') && !document.getElementById('direction-helper').hidden", 5000);
    await delay(100);
    metrics.visualState = await page.evalCheckedValue(`(() => {
      const helper = document.getElementById('direction-helper');
      const rect = helper.getBoundingClientRect();
      return {
        helperText:helper.innerText,
        openDialogs:Array.from(document.querySelectorAll('dialog[open]')).map((dialog)=>dialog.id),
        withinViewport:rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        notClipped:helper.scrollWidth <= helper.clientWidth + 1 && helper.scrollHeight <= helper.clientHeight + 1,
        body:document.body.innerText,
      };
    })()`);
    metrics.visualPass = metrics.visualState.withinViewport
      && metrics.visualState.notClipped
      && metrics.visualState.openDialogs.length === 0
      && !/Choose your path|Choose a direction or map target|Unknown command|Esc/i.test(metrics.visualState.helperText);
    metrics.pass = metrics.pass && metrics.visualPass;
    if (saveScreenshot) await page.screenshot(path.join(outDir, 'after-direction-helper-compact-log.png'));
    fs.writeFileSync(path.join(outDir, 'direction-helper-layout-metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(JSON.stringify(metrics, null, 2));
    if (!metrics.pass) throw new Error('direction helper layout assertion failed');
  } catch (error) {
    scenarioError = error;
  }
  const teardown = await page.close(5000);
  fs.writeFileSync(path.join(outDir, 'direction-helper-layout-teardown.json'), JSON.stringify(teardown, null, 2));
  if (scenarioError) throw scenarioError;
  if (!teardown.exited) throw new Error('direction helper Electron teardown exceeded its bounded owner timeout');
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
