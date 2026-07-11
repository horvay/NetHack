const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_VISUAL_AUDIT_OUT_DIR || path.join(root, 'test', 'visual-ui-surfaces');
const port = Number(process.env.NH_VISUAL_AUDIT_CDP_PORT || 9488);
const width = Number(process.env.NH_VISUAL_AUDIT_WIDTH || 1280);
const height = Number(process.env.NH_VISUAL_AUDIT_HEIGHT || 900);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); }
  throw last || new Error('timed out waiting');
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function shot(cdp, name) {
  await delay(120);
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  return file;
}

const bootstrap = `(() => {
  const t = window.__nethackPromptTest;
  window.__visualAudit = {
    closeChrome() {
      for (const id of ['character-dialog','interaction-dialog','document-dialog','intro-dialog','game-over-dialog','settings-dialog']) {
        const dialog = document.getElementById(id);
        if (dialog?.open) dialog.close('visual-audit');
      }
      document.body.classList.remove('map-target-mode', 'direction-helper-active');
    },
    base() {
      t.reset(); t.setRunning(true); this.closeChrome();
      const room = [
        '----------',
        '|..f....+|',
        '|..@....|',
        '|..$.)..|',
        '|....?..|',
        '----+-----'
      ];
      t.event({ name: 'shim_create_nhwindow', return: 1, windowType: 3 });
      for (let y = 0; y < room.length; y++) for (let x = 0; x < room[y].length; x++) {
        const ch = room[y][x];
        if (ch !== ' ') t.event({ name: 'shim_print_glyph', window: 1, x: x + 8, y: y + 4, glyph: 0, ttychar: ch.charCodeAt(0), char: ch, semanticKind: ch === '@' ? 'hero' : ch === 'f' ? 'pet' : ch === '$' || ch === ')' || ch === '?' ? 'object' : ch === '+' ? 'door' : ch === '-' || ch === '|' ? 'wall' : 'floor', semanticName: ch === '@' ? 'hero' : ch === 'f' ? 'kitten' : ch === '$' ? 'gold' : ch === ')' ? 'dagger' : ch === '?' ? 'scroll' : ch });
      }
      t.setCursor(11, 6);
      const status = { 0: 'Electron the Valkyrie', 8: '1250', 10: '143', 11: '5', 12: '7', 13: '3', 14: '4', 16: '481', 17: 'Hungry', 18: '23', 19: '28', 20: 'Dlvl:2', 22: 'mask 0', 23: '+1 long sword', 24: 'leather armor' };
      for (const [field, value] of Object.entries(status)) t.event({ name: 'shim_status_update', field: Number(field), value });
      ['Velkommen Electron, welcome to NetHack!', 'You see here a food ration.', 'The kitten misses the grid bug.', 'You hear a door open.'].forEach((text) => t.event({ name: 'shim_putstr', text }));
      t.event({ name: 'shim_start_menu', window: 2 });
      [
        [97, 'a - a +1 long sword (weapon in hand)', 41, 'long sword'],
        [98, 'b - a leather armor (being worn)', 91, 'leather armor'],
        [99, 'c - a ring of protection (on left hand)', 61, 'ring'],
        [100, 'd - a wand of digging (0:4)', 47, 'wand'],
        [101, 'e - 4 daggers (in quiver)', 41, 'dagger']
      ].forEach(([selector, text, glyphChar, semanticName]) => t.event({ name: 'shim_add_menu', window: 2, selector, text, glyphChar, semanticKind: 'object', semanticName }));
      t.event({ name: 'shim_end_menu', window: 2, prompt: 'Inventory:' });
      return true;
    },
    inventory() { this.base(); t.event({ name: 'shim_select_menu', window: 2, how: 2 }); },
    objectPrompt() { this.base(); t.event({ name: 'shim_yn_function', query: 'What do you want to apply? [abcde or ?*]', choices: 'abcde?*\\u001b' }); },
    classPicker() { this.base(); t.event({ name: 'shim_yn_function', query: 'What type of object do you want?', choices: '!?+=/()[%$' }); },
    helpWindow() { this.base(); t.event({ name: 'shim_create_nhwindow', return: 61, windowType: 4 }); ['NetHack Help', 'Movement: use visible controls or keyboard.', 'Inventory and prompts have Close/Back controls.'].forEach((text) => t.event({ name: 'shim_putstr', window: 61, text })); t.event({ name: 'shim_display_nhwindow', window: 61 }); },
    targeting() { this.base(); t.event({ name: 'bridge_direction_prompt', query: 'In what direction do you want to zap the wand?', choices: 'ykulnjbh.<>' }); document.querySelector('.target-selection-controls [data-target-step="1,0"]')?.click(); document.querySelector('.target-selection-controls [data-target-step="1,0"]')?.click(); },
    transferPay() { this.base(); t.event({ name: 'shim_start_menu', window: 44 }); [[97, 'a - 2 unpaid food rations, 90 zorkmids'], [98, 'b - unpaid potion of healing, 100 zorkmids']].forEach(([selector, text]) => t.event({ name: 'shim_add_menu', window: 44, selector, text, glyphChar: 37, semanticKind: 'object', semanticName: text })); t.event({ name: 'shim_end_menu', window: 44, prompt: 'Pay which shop bill items?' }); t.event({ name: 'shim_select_menu', window: 44, how: 2 }); },
    spells() { this.base(); t.event({ name: 'shim_start_menu', window: 45 }); [[97, 'a - force bolt  Pw 5  Fail 0%'], [98, 'b - healing  Pw 12  Fail 20%']].forEach(([selector, text]) => t.event({ name: 'shim_add_menu', window: 45, selector, text })); t.event({ name: 'shim_end_menu', window: 45, prompt: 'Choose which spell to cast' }); t.event({ name: 'shim_select_menu', window: 45, how: 1 }); },
    skills() { this.base(); t.event({ name: 'shim_start_menu', window: 46 }); [[97, 'a - dagger Basic can advance cost 1'], [98, 'b - saber Restricted']].forEach(([selector, text]) => t.event({ name: 'shim_add_menu', window: 46, selector, text })); t.event({ name: 'shim_end_menu', window: 46, prompt: 'Enhance which skill?' }); t.event({ name: 'shim_select_menu', window: 46, how: 1 }); },
    options() { this.base(); t.event({ name: 'shim_start_menu', window: 47 }); [[97, 'a - autopickup true'], [98, 'b - pickup_types $']].forEach(([selector, text]) => t.event({ name: 'shim_add_menu', window: 47, selector, text })); t.event({ name: 'shim_end_menu', window: 47, prompt: 'Set options' }); t.event({ name: 'shim_select_menu', window: 47, how: 1 }); },
    serious() { this.base(); t.event({ name: 'shim_yn_function', query: 'Really quit?', choices: 'yn\\u001b' }); },
    saveQuit() { this.base(); document.querySelector('#system-actions button[data-command-key="S"]')?.focus(); },
    deathScore() { this.base(); t.event({ name: 'shim_putstr', window: 1, text: 'You were killed by a jackal.' }); t.event({ name: 'shim_yn_function', query: 'Do you want your possessions identified?', choices: 'ynq' }); t.event({ name: 'bridge_prompt_answer', keycode: 121 }); t.event({ name: 'shim_create_nhwindow', return: 7, windowType: 4 }); ['Goodbye Electron the Valkyrie...', 'You died in The Dungeons of Doom on dungeon level 2 with 1250 points.'].forEach((text) => t.event({ name: 'shim_putstr', window: 7, text })); t.event({ name: 'shim_display_nhwindow', window: 7 }); t.event({ name: 'shim_create_nhwindow', return: 8, windowType: 2 }); t.event({ name: 'shim_start_menu', window: 8 }); t.event({ name: 'shim_add_menu', window: 8, selector: 0, text: 'Vanquished creatures:' }); t.event({ name: 'shim_add_menu', window: 8, selector: 0, text: '  a jackal' }); t.event({ name: 'shim_end_menu', window: 8, prompt: 'Final attributes' }); t.event({ name: 'shim_display_nhwindow', window: 8 }); },
    summary(label) {
      return {
        label,
        characterOpen: document.getElementById('character-dialog').open,
        interactionOpen: document.getElementById('interaction-dialog').open,
        documentOpen: document.getElementById('document-dialog').open,
        gameOverOpen: document.getElementById('game-over-dialog').open,
        title: document.getElementById('interaction-title')?.textContent || document.getElementById('document-title')?.textContent || document.getElementById('game-over-title')?.textContent || '',
        prompt: document.getElementById('interaction-prompt')?.textContent || '',
        visibleButtons: Array.from(document.querySelectorAll('dialog[open] button, #system-actions button, #item-actions button')).filter((button) => !button.hidden && button.offsetParent !== null).slice(0, 30).map((button) => button.textContent.trim()),
        status: document.getElementById('status')?.textContent,
        messages: document.getElementById('messages')?.innerText,
        equipment: document.getElementById('equipment-slots')?.innerText,
      };
    }
  };
  return true;
})()`;

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height), NH_ELECTRON_SHOW: process.env.NH_ELECTRON_SHOW || '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stdout.on('data', (data) => { if (process.env.DEBUG_VISUAL_AUDIT) process.stdout.write(data); });
  child.stderr.on('data', (data) => { stderr += data.toString(); if (process.env.DEBUG_VISUAL_AUDIT) process.stderr.write(data); });
  let cdp;
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; });
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);
    const artifacts = [];
    await evalExpr(cdp, `document.getElementById('start-shim')?.click()`);
    await delay(150);
    artifacts.push({ surface: 'start-character-selection', path: await shot(cdp, '01-start-character-selection.png'), summary: await evalExpr(cdp, `({ characterOpen: document.getElementById('character-dialog').open, buttons: Array.from(document.querySelectorAll('#character-dialog button')).map(b => b.textContent.trim()) })`) });
    await evalExpr(cdp, bootstrap);
    const surfaces = [
      ['main-map-status-sidebar-message-log', 'base', '02-main-map-status-sidebar-message-log.png'],
      ['inventory-equipment', 'inventory', '03-inventory-equipment-picker.png'],
      ['object-action-prompt', 'objectPrompt', '04-object-action-apply-prompt.png'],
      ['class-category-picker', 'classPicker', '05-object-class-category-picker.png'],
      ['help-info-readonly-close-back', 'helpWindow', '06-help-info-readonly-window.png'],
      ['targeting-travel', 'targeting', '07-targeting-travel-controls.png'],
      ['shops-containers-pay-transfer', 'transferPay', '08-shop-pay-transfer.png'],
      ['options-menu', 'options', '09-options-menu.png'],
      ['spells-menu', 'spells', '10-spells-menu.png'],
      ['skills-menu', 'skills', '11-skills-menu.png'],
      ['serious-confirmation', 'serious', '12-serious-confirmation.png'],
      ['save-quit-lifecycle-buttons', 'saveQuit', '13-save-quit-lifecycle-buttons.png'],
      ['death-score-flow', 'deathScore', '14-death-score-flow.png'],
    ];
    const gameOverEvents = fs.readFileSync(path.join(root, 'test', 'fixtures', 'game-over-death-events.jsonl'), 'utf8').trim().split(/\n+/).map((line) => JSON.parse(line));
    for (const [surface, fn, file] of surfaces) {
      if (fn === 'deathScore') {
        await evalExpr(cdp, `window.__visualAudit.base(); window.__visualAudit.closeChrome();`);
        for (const event of gameOverEvents) await evalExpr(cdp, `window.__nethackPromptTest.event(${JSON.stringify({ event })})`);
      } else {
        await evalExpr(cdp, `window.__visualAudit.${fn}()`);
      }
      artifacts.push({ surface, path: await shot(cdp, file), summary: await evalExpr(cdp, `window.__visualAudit.summary(${JSON.stringify(surface)})`) });
    }
    const metricsPath = path.join(outDir, 'visual-ui-surface-audit.json');
    fs.writeFileSync(metricsPath, `${JSON.stringify({ ok: true, width, height, artifacts }, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, outDir, metricsPath, screenshots: artifacts.map((a) => a.path) }, null, 2));
    cdp.close();
  } finally {
    try { cdp?.close(); } catch {}
    child.kill('SIGTERM');
    await delay(250);
    if (!child.killed) child.kill('SIGKILL');
    if (stderr && process.env.DEBUG_VISUAL_AUDIT) process.stderr.write(stderr);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
