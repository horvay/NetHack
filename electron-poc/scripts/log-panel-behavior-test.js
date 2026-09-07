const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_LOG_PANEL_OUT_DIR || path.join(root, 'test', 'log-panel-behavior');
const port = Number(process.env.NH_LOG_PANEL_CDP_PORT || 9447);
const width = Number(process.env.NH_LOG_PANEL_WIDTH || 1506);
const height = Number(process.env.NH_LOG_PANEL_HEIGHT || 819);
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
let logPaintSequence = 0;
async function boundedCdp(cdp, operation, phase, timeoutMs = 3000) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          try { cdp.close(); } catch {}
          reject(new Error(`timed out during log ${phase}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function runtimeValue(cdp, expression, phase, timeoutMs) {
  const result = await boundedCdp(cdp, cdp.send('Runtime.evaluate', { returnByValue: true, expression }), phase, timeoutMs);
  if (result.exceptionDetails) throw new Error(`log ${phase} failed: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'renderer exception'}`);
  return result.result.value;
}
async function waitForLogPaint(cdp, timeoutMs = 3000) {
  const marker = `__nethackLogPaint${Date.now()}_${logPaintSequence += 1}`;
  const markerLiteral = JSON.stringify(marker);
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  await waitFor(() => runtimeValue(cdp, "!document.fonts || document.fonts.status === 'loaded'", 'font readiness', remaining()), timeoutMs, 16);
  await runtimeValue(cdp, `(() => {
    globalThis[${markerLiteral}] = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { globalThis[${markerLiteral}] = true; }));
    return true;
  })()`, 'frame barrier installation', remaining());
  await boundedCdp(cdp, cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    .then(() => cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })), 'frame pump', remaining());
  await waitFor(() => runtimeValue(cdp, `globalThis[${markerLiteral}] === true`, 'frame readiness', remaining()), remaining(), 16);
  await runtimeValue(cdp, `delete globalThis[${markerLiteral}]`, 'frame cleanup', remaining());
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-log-panel-profile-'));
  const child = spawn(electronBin, [`--user-data-dir=${profileDir}`, '.'], {
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
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed && child.exitCode == null) child.kill('SIGTERM'); };
  const exitCleanup = () => { cleanup(); fs.rmSync(profileDir, { recursive: true, force: true }); };
  process.on('exit', exitCleanup);
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
    await cdp.send('Runtime.evaluate', { expression: `localStorage.removeItem('nethack-electron-presentation-settings-v5')` });
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);
    await cdp.send('Runtime.evaluate', { expression: `(() => {
      window.__nethackPromptTest.reset();
      window.__nethackPromptTest.setRunning(true);
      for (let i = 1; i <= 120; i += 1) window.__nethackPromptTest.event({ name: 'shim_putstr', text: 'Log expansion message ' + String(i).padStart(3, '0') });
      document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close('silent'));
    })()` });
    await waitForLogPaint(cdp);
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.querySelectorAll('#messages .ux-consequence-row').length === 100" })).result.value, 5000, 50);

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
        separator:{role:document.getElementById('map-log-resizer')?.getAttribute('role'),value:document.getElementById('map-log-resizer')?.getAttribute('aria-valuenow'),valueText:document.getElementById('map-log-resizer')?.getAttribute('aria-valuetext')||''},
        messageLineHeight:Number.parseFloat(getComputedStyle(messages).lineHeight),
        messageViewportLines:messages.clientHeight / Number.parseFloat(getComputedStyle(messages).lineHeight),
        savedLogRatio:window.NetHackUxRuntime.runtime.domain('shell').state().logRatio,
      };
    })()` })).result.value;

    const screenshots = {};
    async function capture(name) {
      if (!saveScreenshot) return '';
      const file = path.join(outDir, name);
      await waitForLogPaint(cdp);
      const shot = await boundedCdp(cdp, cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }), 'screenshot capture');
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      return file;
    }

    await waitForLogPaint(cdp);
    const initial = await layoutState();
    screenshots.defaultEightLines = await capture('log-default-eight-lines-1506x819.png');
    await cdp.send('Runtime.evaluate', { expression: `(() => {
      const messages=document.getElementById('messages');
      messages.scrollTop=0;
      window.__nethackPromptTest.event({name:'shim_putstr',text:'NEWEST TOP MESSAGE'});
    })()` });
    await waitForLogPaint(cdp);
    const autoTop = await layoutState();

    await cdp.send('Runtime.evaluate', { expression: `(() => {
      const messages=document.getElementById('messages');
      const anchor=()=>Array.from(messages.querySelectorAll('.ux-consequence-row')).find((row)=>row.getBoundingClientRect().bottom>messages.getBoundingClientRect().top+1)?.innerText.trim()||'';
      messages.scrollTop=240;
      messages.dispatchEvent(new Event('scroll'));
      window.__manualBefore={top:messages.scrollTop,anchor:anchor()};
      window.__nethackPromptTest.event({name:'shim_putstr',text:'MANUAL SCROLLBACK SHOULD NOT JUMP'});
    })()` });
    await waitForLogPaint(cdp);
    const manual = (await cdp.send('Runtime.evaluate', { returnByValue:true, expression:`(() => {
      const messages=document.getElementById('messages');
      const anchor=Array.from(messages.querySelectorAll('.ux-consequence-row')).find((row)=>row.getBoundingClientRect().bottom>messages.getBoundingClientRect().top+1)?.innerText.trim()||'';
      return {before:window.__manualBefore,after:messages.scrollTop,anchor,hint:document.getElementById('log-position-hint')?.textContent||'',jumpHidden:document.getElementById('log-jump-newest')?.hidden};
    })()` })).result.value;

    const beforeKeyboard = await layoutState();

    await cdp.send('Runtime.evaluate', { expression:`document.getElementById('map-log-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))` });
    await waitForLogPaint(cdp);
    const afterKeyboard = await layoutState();
    await cdp.send('Page.bringToFront');
    const pointerProbe = await cdp.send('Runtime.evaluate', { returnByValue:true, expression:`(() => {
      const resizer=document.getElementById('map-log-resizer');
      const rect=resizer.getBoundingClientRect();
      const x=Math.round(rect.left+rect.width/2);
      const y=Math.round(rect.top+rect.height/2);
      window.__logPointerTrace=[];
      for(const type of ['pointerdown','pointermove','pointerup','pointercancel','mousedown','mousemove','mouseup']) {
        document.addEventListener(type,(event)=>{
          if(!event.target?.closest?.('#map-log-resizer')) return;
          window.__logPointerTrace.push({type,target:event.target.id||event.target.className||event.target.tagName,button:event.button,buttons:event.buttons,pointerId:event.pointerId||0,clientX:event.clientX,clientY:event.clientY,isTrusted:event.isTrusted,captured:resizer.hasPointerCapture?.(event.pointerId)||false});
        },{capture:true,once:false});
      }
      const hit=document.elementFromPoint(x,y);
      return {x,y,hit:hit?.id||hit?.className||hit?.tagName||'',closest:Boolean(hit?.closest?.('#map-log-resizer')),rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom}};
    })()` }).then((result)=>result.result.value);
    await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:pointerProbe.x, y:pointerProbe.y, button:'none', buttons:0, pointerType:'mouse' });
    await cdp.send('Input.dispatchMouseEvent', { type:'mousePressed', x:pointerProbe.x, y:pointerProbe.y, button:'left', buttons:1, clickCount:1, pointerType:'mouse' });
    for (const offset of [20, 40, 60, 80]) {
      await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:pointerProbe.x, y:pointerProbe.y-offset, button:'left', buttons:1, pointerType:'mouse' });
    }
    await cdp.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:pointerProbe.x, y:pointerProbe.y-80, button:'left', buttons:0, clickCount:1, pointerType:'mouse' });
    await waitForLogPaint(cdp);
    const afterPointer = await layoutState();
    const pointerTrace = (await cdp.send('Runtime.evaluate', { returnByValue:true, expression:'window.__logPointerTrace||[]' })).result.value;
    screenshots.customDivider = await capture('log-custom-divider-1506x819.png');
    const persisted = (await cdp.send('Runtime.evaluate', { returnByValue:true, expression:`JSON.parse(localStorage.getItem('nethack-electron-presentation-settings-v5')||'{}')?.layout?.logRatio` })).result.value;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width:1328, height:750, deviceScaleFactor:1, mobile:false });
    await waitForLogPaint(cdp);
    const customWindowed = await layoutState();
    await cdp.send('Emulation.setDeviceMetricsOverride', { width:1506, height:819, deviceScaleFactor:1, mobile:false });
    await waitForLogPaint(cdp);
    const customFullscreen = await layoutState();
    await cdp.send('Runtime.evaluate', { expression:`window.NetHackUxRuntime.runtime.domain('shell').setLogRatio(null,{persist:true})` });
    await waitForLogPaint(cdp);
    const resetDefault = await layoutState();
    screenshots.resetEightLines = await capture('log-reset-eight-lines-1506x819.png');
    const persistedDefault = (await cdp.send('Runtime.evaluate', { returnByValue:true, expression:`JSON.parse(localStorage.getItem('nethack-electron-presentation-settings-v5')||'{}')?.layout?.logRatio` })).result.value;
    await cdp.send('Runtime.evaluate', { expression:`document.getElementById('ux-map-mode-button').click()` });
    await delay(180);
    const follow = await layoutState();
    const gridLogGap = initial.resizer.top - initial.play.bottom;
    const metrics = {
      requestedWindow:{width,height,contentSize:true,shown:process.env.NH_ELECTRON_SHOW!=='0'},
      initial,autoTop,manual,beforeKeyboard,afterKeyboard,pointerProbe,pointerTrace,afterPointer,customWindowed,customFullscreen,resetDefault,persisted,persistedDefault,follow,gridLogGap,screenshots,
      pass:initial.viewport.width>=1200
        && initial.viewport.height>=650
        && Math.abs(initial.messageViewportLines-8)<=0.08
        && initial.savedLogRatio===null
        && /eight message lines/i.test(initial.separator.valueText)
        && initial.messages.clientHeight>100
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
        && afterKeyboard.log.height<beforeKeyboard.log.height
        && afterKeyboard.play.height>beforeKeyboard.play.height
        && Number(afterKeyboard.separator.value)<Number(beforeKeyboard.separator.value)
        && afterKeyboard.separator.valueText===''
        && pointerProbe.closest
        && ['pointerdown','pointermove','pointerup'].every((type)=>pointerTrace.some((event)=>event.type===type && event.isTrusted))
        && afterPointer.log.height>afterKeyboard.log.height+50
        && afterPointer.play.height<afterKeyboard.play.height-50
        && Math.abs(customWindowed.log.height/(customWindowed.play.height+customWindowed.log.height)-persisted)<=0.015
        && Math.abs(customFullscreen.log.height/(customFullscreen.play.height+customFullscreen.log.height)-persisted)<=0.015
        && customWindowed.viewport.width===1328
        && customWindowed.viewport.height===750
        && customFullscreen.viewport.width===1506
        && customFullscreen.viewport.height===819
        && Math.abs(resetDefault.messageViewportLines-8)<=0.08
        && resetDefault.savedLogRatio===null
        && persistedDefault===null
        && /eight message lines/i.test(resetDefault.separator.valueText)
        && follow.mapMode==='full'
        && follow.play.bottom<=follow.resizer.top
        && follow.resizer.bottom<=follow.log.top
        && follow.play.height<=resetDefault.play.height+1
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
    if (child.exitCode == null) await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(3000),
    ]);
    fs.rmSync(profileDir, { recursive: true, force: true });
    process.removeListener('exit', exitCleanup);
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
