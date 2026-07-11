const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.CDP_PORT || 9333);
const out = process.argv[2] || 'electron-poc-screenshot.png';

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return {
    send(method, params = {}) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close() { ws.close(); },
  };
}

(async () => {
  const pages = await json(`http://127.0.0.1:${port}/json/list`);
  const page = pages.find((p) => p.type === 'page') || pages[0];
  if (!page) throw new Error('No CDP page target found');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await delay(1000);
  await cdp.send('Runtime.evaluate', { expression: "document.getElementById('start-shim').click()" });
  await delay(250);
  await cdp.send('Runtime.evaluate', { expression: "document.getElementById('confirm-character').click()" });
  await delay(3500);
  const state = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
      paths: document.getElementById('paths').textContent,
      status: document.getElementById('status').textContent,
      manifestCount: document.getElementById('game-grid').dataset.tileManifestCount,
      tiledCells: document.querySelectorAll('.tile-cell.has-tile').length,
      blankTiledCells: Array.from(document.querySelectorAll('.tile-cell.has-tile')).filter((el)=>!el.dataset.glyph.trim()).length,
      visibleGlyphs: Array.from(document.querySelectorAll('.tile-cell')).map((el)=>el.dataset.glyph || ' ').join(''),
      seen: document.getElementById('shim-output').dataset.seen || '',
      debugOpen: document.getElementById('debug-panel').open,
      modalOpen: Boolean(document.querySelector('dialog[open]')),
      statsText: document.getElementById('stats-panel').innerText,
      messages: document.getElementById('messages').innerText,
    })`,
  });
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(JSON.stringify({ out, state: state.result.value }, null, 2));
  cdp.close();
  setTimeout(() => process.exit(0), 25);
})().catch((error) => { console.error(error); process.exit(1); });
