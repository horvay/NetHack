const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_LOG_PANEL_OUT_DIR || path.join(root, 'test', 'log-panel-behavior');
const port = Number(process.env.NH_LOG_PANEL_CDP_PORT || 9447);
const width = Number(process.env.NH_LOG_PANEL_WIDTH || 2200);
const height = Number(process.env.NH_LOG_PANEL_HEIGHT || 1800);
const saveScreenshot = process.env.NH_LOG_PANEL_SCREENSHOT !== '0';

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 250) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { lastError = error; }
    await delay(stepMs);
  }
  throw lastError || new Error('timed out waiting');
}
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
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
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

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      AI_ORG_ELECTRON_CDP_PORT: String(port),
      NH_ELECTRON_WINDOW_WIDTH: String(width),
      NH_ELECTRON_WINDOW_HEIGHT: String(height),
      NH_ELECTRON_WINDOW_CONTENT_SIZE: '1',
      NH_ELECTRON_SHOW: process.env.NH_ELECTRON_SHOW || '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => {
      const list = await json(`http://127.0.0.1:${port}/json/list`);
      return list.find((p) => p.type === 'page') ? list : null;
    }, 20000);
    const page = pages.find((p) => p.type === 'page') || pages[0];
    cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);
    await cdp.send('Runtime.evaluate', { expression: `localStorage.removeItem('nethack-electron-presentation-settings-v2')` });
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);
    await cdp.send('Runtime.evaluate', { expression: `(() => {
      window.__nethackPromptTest.reset();
      window.__nethackPromptTest.setRunning(true);
      for (let i = 1; i <= 120; i += 1) window.__nethackPromptTest.event({ name: 'shim_putstr', text: 'Log expansion message ' + String(i).padStart(3, '0') });
      document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close('silent'));
    })()` });
    await delay(300);

    const layoutState = async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const rect = (el) => { const r = el.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height, scrollWidth:el.scrollWidth, scrollHeight:el.scrollHeight, clientWidth:el.clientWidth, clientHeight:el.clientHeight }; };
      const messages = document.getElementById('messages');
      const rows = Array.from(messages.querySelectorAll('.ux-consequence-row'));
      return {
        viewport:{width:innerWidth,height:innerHeight},
        mapMode:document.body.dataset.uxMapMode || '',
        play:rect(document.getElementById('play-area')),
        log:rect(document.getElementById('log-panel')),
        messages:rect(messages),
        resizer:rect(document.getElementById('map-log-resizer')),
        rowTexts:rows.map((row)=>row.innerText.trim()),
        scrollTop:messages.scrollTop,
        overflowY:getComputedStyle(messages).overflowY,
        now:document.querySelector('.log-now')?.innerText || '',
        separator:{role:document.getElementById('map-log-resizer')?.getAttribute('role'),value:document.getElementById('map-log-resizer')?.getAttribute('aria-valuenow')},
      };
    })()` })).result.value;

    const initial = await layoutState();
    await cdp.send('Runtime.evaluate', { expression: `(() => {
      const messages=document.getElementById('messages');
      messages.scrollTop=0;
      window.__nethackPromptTest.event({name:'shim_putstr',text:'NEWEST TOP MESSAGE'});
    })()` });
    await delay(120);
    const autoTop = await layoutState();

    await cdp.send('Runtime.evaluate', { expression: `(() => {
      const messages=document.getElementById('messages');
      const anchor=()=>Array.from(messages.querySelectorAll('.ux-consequence-row')).find((row)=>row.getBoundingClientRect().bottom>messages.getBoundingClientRect().top+1)?.innerText.trim()||'';
      messages.scrollTop=240;
      window.__manualBefore={top:messages.scrollTop,anchor:anchor()};
      window.__nethackPromptTest.event({name:'shim_putstr',text:'MANUAL SCROLLBACK SHOULD NOT JUMP'});
    })()` });
    await delay(120);
    const manual = (await cdp.send('Runtime.evaluate', { returnByValue:true, expression:`(() => {
      const messages=document.getElementById('messages');
      const anchor=Array.from(messages.querySelectorAll('.ux-consequence-row')).find((row)=>row.getBoundingClientRect().bottom>messages.getBoundingClientRect().top+1)?.innerText.trim()||'';
      return {before:window.__manualBefore,after:messages.scrollTop,anchor,hint:document.getElementById('log-position-hint')?.textContent||'',jumpHidden:document.getElementById('log-jump-newest')?.hidden};
    })()` })).result.value;

    const separator = initial.resizer;
    const dragX = separator.left + separator.width / 2;
    const dragY = separator.top + separator.height / 2;
    await cdp.send('Input.dispatchMouseEvent', { type:'mousePressed', x:dragX, y:dragY, button:'left', clickCount:1 });
    await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:dragX, y:dragY-160, button:'left', buttons:1 });
    await cdp.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:dragX, y:dragY-160, button:'left', clickCount:1 });
    await delay(180);
    const afterDrag = await layoutState();

    await cdp.send('Runtime.evaluate', { expression:`document.getElementById('map-log-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))` });
    await delay(100);
    const afterKeyboard = await layoutState();
    const persisted = (await cdp.send('Runtime.evaluate', { returnByValue:true, expression:`JSON.parse(localStorage.getItem('nethack-electron-presentation-settings-v2')||'{}')?.layout?.logRatio` })).result.value;
    await cdp.send('Runtime.evaluate', { expression:`document.getElementById('ux-map-mode-button').click()` });
    await delay(180);
    const follow = await layoutState();

    const gridLogGap = initial.resizer.top - initial.play.bottom;
    const metrics = {
      requestedWindow:{width,height,contentSize:true,shown:process.env.NH_ELECTRON_SHOW!=='0'},
      initial,autoTop,manual,afterDrag,afterKeyboard,follow,persisted,gridLogGap,
      pass:initial.viewport.width>=1200
        && initial.viewport.height>=650
        && initial.log.height>300
        && initial.messages.clientHeight>250
        && initial.messages.scrollHeight>initial.messages.clientHeight
        && /auto|scroll/.test(initial.overflowY)
        && initial.rowTexts.length===100
        && initial.rowTexts[0].includes('120')
        && initial.rowTexts.at(-1).includes('021')
        && autoTop.rowTexts[0].endsWith('NEWEST TOP MESSAGE')
        && autoTop.scrollTop<=2
        && manual.before.top>0
        && manual.after>manual.before.top
        && manual.anchor===manual.before.anchor
        && /Viewing earlier events/i.test(manual.hint)
        && manual.jumpHidden===false
        && afterDrag.log.height>initial.log.height+100
        && afterDrag.play.height<initial.play.height-100
        && Number(afterDrag.separator.value)>Number(initial.separator.value)
        && afterKeyboard.log.height<afterDrag.log.height
        && follow.mapMode==='follow'
        && follow.play.bottom<=follow.resizer.top
        && follow.resizer.bottom<=follow.log.top
        && follow.play.height<=afterKeyboard.play.height+1
        && Number.isFinite(persisted)
        && ['NOW','TURN','MODE','PENDING','History'].every((label)=>initial.now.includes(label))
        && initial.separator.role==='separator',
    };
    fs.writeFileSync(path.join(outDir,'log-panel-behavior-metrics.json'),JSON.stringify(metrics,null,2));
    if (saveScreenshot) {
      await cdp.send('Runtime.evaluate',{expression:`(() => { const messages=document.getElementById('messages'); const top=messages.getBoundingClientRect().top; const row=Array.from(messages.querySelectorAll('.ux-consequence-row')).find((item)=>item.getBoundingClientRect().bottom>top+1); if(row) messages.scrollTop+=row.getBoundingClientRect().top-top; })()`});
      await delay(80);
      const scrollbackShot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(outDir,'log-workspace-manual-scrollback.png'),Buffer.from(scrollbackShot.data,'base64'));
      await cdp.send('Runtime.evaluate',{expression:`document.getElementById('messages').scrollTop=0`});
      await delay(80);
      const newestShot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(outDir,'log-workspace-newest-first-resizable.png'),Buffer.from(newestShot.data,'base64'));
    }
    console.log(JSON.stringify(metrics,null,2));
    if(!metrics.pass) throw new Error('log panel behavior assertion failed');
  } finally {
    cleanup();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
