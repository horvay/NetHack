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
  fs.mkdirSync(outDir, { recursive: true });
  await Harness.withElectronPage({ root, port, width, height }, async (page) => {
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
      const onlyArrowGlyphs = buttons.every((b) => /^[↖↑↗←→↙↓↘]$/.test(b.innerText.trim()));
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
        compactSquare: helperRect.width <= 90 && helperRect.height <= 90 && Math.abs(helperRect.width - helperRect.height) <= 4,
        properCompassOrder: cellKeys.join('') === 'ykuh.lbjn',
        properCompassLabels: cellText.join('|') === '↖|↑|↗|←|·|→|↙|↓|↘',
        onlyArrowGlyphs,
        pass: helperWithinViewport && helperWithinLog && helperNotClipped && gridRect.width >= innerWidth - 40 && buttons.length === 8 && cellKeys.join('') === 'ykuh.lbjn' && cellText.join('|') === '↖|↑|↗|←|·|→|↙|↓|↘' && onlyArrowGlyphs && document.getElementById('messages').clientHeight >= requiredMessageHeight && helperRect.width <= 90 && helperRect.height <= 90 && !helper.querySelector('#direction-helper-copy') && !/Esc|Choose a direction or map target|Dungeon remains playable|North|South|East|West|NW|NE|SW|SE/i.test(helper.innerText) && !buttons.some((b) => b.id === 'direction-helper-cancel' || /\bEsc\b/i.test(b.innerText.trim())),
      };
    })()`);
    fs.writeFileSync(path.join(outDir, 'direction-helper-layout-metrics.json'), JSON.stringify(metrics, null, 2));
    if (saveScreenshot) {
      await page.screenshot(path.join(outDir, 'after-direction-helper-compact-log.png'));
    }
    console.log(JSON.stringify(metrics, null, 2));
    if (!metrics.pass) throw new Error('direction helper layout assertion failed');
  });
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
