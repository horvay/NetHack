const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_UXM01_EVIDENCE_DIR || path.join(root, 'test-output', 'uxm01-synthetic-injected-mainstream-dialog-matrix');
const basePort = Number(process.env.NH_UXM01_CDP_PORT || 9770);
const profiles = Object.freeze([
  Object.freeze({ id: 'full-1360x920', windowWidth: 1360, windowHeight: 920, cssWidth: 1360, cssHeight: 920, dpr: 1, zoomPercent: 100 }),
  Object.freeze({ id: 'compact-960x720', windowWidth: 960, windowHeight: 720, cssWidth: 960, cssHeight: 720, dpr: 1, zoomPercent: 100 }),
  Object.freeze({ id: 'zoom-200pct-1360x920', windowWidth: 1360, windowHeight: 920, cssWidth: 680, cssHeight: 460, dpr: 2, zoomPercent: 200 }),
]);
const families = Object.freeze(['single-select', 'multi-select', 'command', 'form', 'confirmation', 'document', 'transfer']);
const { waitFor, delay } = Harness;

function setupExpression(family) {
  const common = "const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); t.clearSentInputs();";
  if (family === 'single-select') return `(() => { ${common}
    t.event({name:'shim_start_menu',window:610,requestId:'inventory-cache'});
    t.event({name:'shim_add_menu',window:610,selector:97,text:'a - an uncursed food ration',glyphChar:37,semanticKind:'object',semanticName:'food ration',objectId:401});
    t.event({name:'shim_add_menu',window:610,selector:98,text:'b - an apple',glyphChar:37,semanticKind:'object',semanticName:'apple',objectId:402});
    t.event({name:'shim_end_menu',window:610,prompt:'Inventory:'});
    t.event({name:'shim_yn_function',query:'What do you want to eat? [ab or ?*]',choices:'ab?*\\u001b',requestId:'item-single'});
    return true; })()`;
  if (family === 'multi-select') return `(() => { ${common}
    t.event({name:'shim_start_menu',window:611,requestId:'pickup-multi'});
    [['a','a - 2 uncursed food rations',401],['b','b - a potion of healing',402],['c','c - a scroll labeled READ ME',403]].forEach(([key,text,objectId]) => t.event({name:'shim_add_menu',window:611,selector:key.charCodeAt(0),text,semanticKind:'object',objectId}));
    t.event({name:'shim_end_menu',window:611,prompt:'Choose several items'}); t.event({name:'shim_select_menu',window:611,how:2,requestId:'pickup-multi'});
    document.querySelector('#interaction-options .choice-button[data-key="a"]')?.click(); return true; })()`;
  if (family === 'command') return `(() => { ${common}
    t.event({name:'bridge_extcmd_catalog',requestId:'command-menu',commands:[{name:'annotate',description:'name the current dungeon level'},{name:'chat',description:'talk to someone nearby'},{name:'enhance',description:'advance a skill'},{name:'loot',description:'use a container'},{name:'pray',description:'pray to your god'}]}); return true; })()`;
  if (family === 'form') return `(() => { ${common} t.event({name:'shim_getlin',query:'What do you want to engrave in the floor here?',requestId:'engraving-form'}); document.getElementById('interaction-text').value='Elbereth'; return true; })()`;
  if (family === 'confirmation') return `(() => { ${common} t.event({name:'shim_yn_function',query:'Really quit without saving?',choices:'yn\\u001b',requestId:'serious-confirm'}); return true; })()`;
  if (family === 'document') return `(() => { ${common}
    t.event({name:'shim_create_nhwindow',return:612,windowType:4}); t.event({name:'shim_putstr',window:612,text:'NetHack Help'}); t.event({name:'shim_putstr',window:612,text:'Movement: use h, j, k, l, y, u, b, n or the arrow keys.'}); t.event({name:'shim_putstr',window:612,text:'Escape cancels one active prompt or closes one open layer.'}); t.event({name:'shim_display_nhwindow',window:612,blocking:1}); return true; })()`;
  if (family === 'transfer') return `(() => { ${common}
    t.setContainerStateForTest({active:true,sessionKind:'container',phase:'ready',prompt:'Open large box',leftItems:[{selector:97,text:'a - an uncursed food ration',semanticKind:'object',objectId:501}],rightItems:[{selector:98,text:'b - a scroll of identify',semanticKind:'object',objectId:502}],loadedSides:{left:true,right:true},loadingSides:{left:false,right:false},feedback:'Choose an item to move, or close this dialog.'}); return true; })()`;
  throw new Error(`unknown family ${family}`);
}

async function visualQuality(page, family) {
  const browser = await page.evalCheckedValue(`(() => {
    function color(value) {
      const input=String(value||'').trim();
      let match=input.match(/rgba?\\(([-.\\d]+)[, ]+([-.\\d]+)[, ]+([-.\\d]+)(?:[, /]+([-.\\d]+))?/);
      if(match) return [Number(match[1]),Number(match[2]),Number(match[3]),match[4]==null?1:Number(match[4])];
      match=input.match(/oklch\\(([-.\\d]+)(%)?\\s+([-.\\d]+)\\s+([-.\\d]+)(?:deg)?(?:\\s*\\/\\s*([-.\\d]+))?/i);
      if(!match) return null;
      const L=Number(match[1])/(match[2]?100:1), C=Number(match[3]), h=Number(match[4])*Math.PI/180, a=C*Math.cos(h), b=C*Math.sin(h);
      const lp=L+0.3963377774*a+0.2158037573*b, mp=L-0.1055613458*a-0.0638541728*b, sp=L-0.0894841775*a-1.291485548*b;
      const l=lp*lp*lp,m=mp*mp*mp,s=sp*sp*sp;
      const linear=[4.0767416621*l-3.3077115913*m+0.2309699292*s,-1.2684380046*l+2.6097574011*m-0.3413193965*s,-0.0041960863*l-0.7034186147*m+1.707614701*s];
      const gamma=(v)=>255*Math.max(0,Math.min(1,v<=0.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-0.055));
      return [gamma(linear[0]),gamma(linear[1]),gamma(linear[2]),match[5]==null?1:Number(match[5])];
    }
    function composite(top,bottom){const alpha=top[3]+bottom[3]*(1-top[3]);if(!alpha)return [0,0,0,0];return [(top[0]*top[3]+bottom[0]*bottom[3]*(1-top[3]))/alpha,(top[1]*top[3]+bottom[1]*bottom[3]*(1-top[3]))/alpha,(top[2]*top[3]+bottom[2]*bottom[3]*(1-top[3]))/alpha,alpha];}
    function lum(c) { const channels=c.slice(0,3).map((v)=>{ const x=v/255; return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4); }); return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2]; }
    function ratio(a,b) { if(!a||!b) return null; const x=lum(a),y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); }
    function opaqueBackground(element) { const chain=[]; for(let node=element;node;node=node.parentElement) chain.push(node); let result=[0,0,0,1]; for(const node of chain.reverse()){const next=color(getComputedStyle(node).backgroundColor);if(next)result=composite(next,result);} return result; }
    function foreground(element,background){const value=color(getComputedStyle(element).color);return value?composite(value,background):null;}
    const surface=Array.from(document.querySelectorAll('dialog[open]')).at(-1)||document.querySelector('#container-transfer-panel:not([hidden])');
    const active=document.activeElement;
    const activeStyle=active?getComputedStyle(active):null;
    const focusContrast=activeStyle?ratio(color(activeStyle.outlineColor),opaqueBackground(active)):null;
    const labels=Array.from(surface?.querySelectorAll('button, input, label, p, h2, strong, span')||[]).filter((node)=>{const r=node.getBoundingClientRect(),style=getComputedStyle(node);return r.width&&r.height&&style.visibility!=='hidden'&&style.display!=='none'&&String(node.textContent||node.value||'').trim();}).slice(0,120).map((node)=>{const style=getComputedStyle(node),background=opaqueBackground(node);return {tag:node.tagName,id:node.id||'',text:String(node.textContent||node.value||'').trim().slice(0,100),contrast:ratio(foreground(node,background),background),fontSize:parseFloat(style.fontSize)||0,fontWeight:parseInt(style.fontWeight)||400};});
    const lowText=labels.filter((entry)=>entry.contrast!=null&&entry.contrast<(entry.fontSize>=18||(entry.fontSize>=14&&entry.fontWeight>=700)?3:4.5));
    const selected=surface?.querySelector('[aria-selected="true"], [aria-checked="true"], .selected');
    const selectedStyle=selected?getComputedStyle(selected):null;
    return {
      focus:{id:active?.id||'',tag:active?.tagName||'',inside:Boolean(surface?.contains(active)),outlineStyle:activeStyle?.outlineStyle||'',outlineWidth:activeStyle?.outlineWidth||'',outlineColor:activeStyle?.outlineColor||'',contrast:focusContrast},
      contrast:{checkedLabels:labels.length,lowText},
      nonColor:{selectedText:String(selected?.textContent||'').trim(),selectedBorderWidth:selectedStyle?.borderWidth||'',focusedOutline:Boolean(activeStyle&&activeStyle.outlineStyle!=='none'&&parseFloat(activeStyle.outlineWidth)>0),noticeHasText:Boolean(document.getElementById('ux-player-notice')?.textContent?.trim())},
      cancel:Array.from(surface?.querySelectorAll('button')||[]).map((button)=>button.textContent.trim()).filter((text)=>/^(Close|Cancel|Back|Continue)$/.test(text)),
    };
  })()`);
  const errors = [];
  if (!browser.focus.inside) errors.push('focus is outside the owning surface');
  if (!browser.nonColor.focusedOutline) errors.push('focused control has no visible outline');
  if (browser.focus.contrast != null && browser.focus.contrast < 3) errors.push(`focus contrast ${browser.focus.contrast.toFixed(2)}:1`);
  if (browser.contrast.lowText.length) errors.push(`low text contrast ${JSON.stringify(browser.contrast.lowText.slice(0,8))}`);
  if (family === 'multi-select' && !browser.nonColor.selectedText) errors.push('selected row has no visible text/state cue');
  const expectedCancel = ['document','transfer'].includes(family) ? 'Close' : 'Cancel';
  if (!browser.cancel.includes(expectedCancel)) errors.push(`${expectedCancel} is not visibly exposed`);
  return { schema:'uxm01-mainstream-visual-quality/v1', family, browser, errors, limitations:['Computed contrast covers visible text and the currently focused shared control. Image-backed map contrast and downstream surface redesigns are outside UXM-01.','Final acceptance also requires manual inspection of every captured frame.'] };
}

async function uiState(page) {
  return page.evalCheckedValue(`(() => {
    const dialogs = Array.from(document.querySelectorAll('dialog[open]'));
    const transfer = document.getElementById('container-transfer-panel');
    const openSurface = dialogs.at(-1) || (transfer && !transfer.hidden ? transfer : null);
    const r = openSurface?.getBoundingClientRect?.();
    const actions = openSurface ? Array.from(openSurface.querySelectorAll('button')).filter((button) => {
      const b = button.getBoundingClientRect(); const s = getComputedStyle(button);
      return b.width > 0 && b.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    }).map((button) => { const b=button.getBoundingClientRect(); return {id:button.id||'',text:button.innerText.trim(),left:b.left,top:b.top,right:b.right,bottom:b.bottom}; }) : [];
    const visibleText = document.body.innerText;
    return {
      viewport:{width:innerWidth,height:innerHeight,devicePixelRatio}, body:{scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},
      surface:openSurface ? {id:openSurface.id,family:openSurface.dataset.dialogFamily||'',role:openSurface.getAttribute('role')||'',labelledby:openSurface.getAttribute('aria-labelledby')||'',describedby:openSurface.getAttribute('aria-describedby')||'',rect:r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null} : null,
      options:{role:document.getElementById('interaction-options')?.getAttribute('role')||'',choices:Array.from(document.querySelectorAll('#interaction-options .choice-button')).map((button)=>({role:button.getAttribute('role')||'',selected:button.getAttribute('aria-selected'),checked:button.getAttribute('aria-checked'),tabIndex:button.tabIndex,stableId:button.dataset.stableId||'',text:button.innerText.trim()}))},
      active:{id:document.activeElement?.id||'',role:document.activeElement?.getAttribute?.('role')||'',text:document.activeElement?.innerText?.trim?.()||'',inside:Boolean(openSurface?.contains(document.activeElement))},
      actions, notice:document.getElementById('ux-player-notice')?.innerText||'', visibleText,
      focusStack:window.NetHackUxRuntime?.runtime?.service?.('dialog')?.focus?.snapshot?.()||[], sent:window.__nethackPromptTest?.sentInputs?.().join('')||'',
    };
  })()`);
}

async function capture(page, qc, profile, family, state) {
  const id = `synthetic-injected-${profile.id}-${family}`;
  return page.screenshotEvidence(qc, id, {
    viewport: { width: profile.cssWidth, height: profile.cssHeight, devicePixelRatio: profile.dpr, zoomPercent: profile.zoomPercent },
    state: `SYNTHETIC/INJECTED ${family}`,
    viewSafeFormat: 'BMP', viewSafeScale: 0.25,
  });
}

function validateFamily(profile, family, state) {
  const errors = [];
  if (!state.surface) errors.push('no open surface');
  if (state.surface?.family !== family) errors.push(`family ${state.surface?.family} not ${family}`);
  if (!state.active.inside) errors.push(`focus outside surface: ${state.active.id || state.active.text}`);
  if (state.body.scrollWidth > state.viewport.width + 1) errors.push(`horizontal page overflow ${state.body.scrollWidth}>${state.viewport.width}`);
  if (state.surface?.rect && (state.surface.rect.left < -1 || state.surface.rect.top < -1 || state.surface.rect.right > state.viewport.width + 1 || state.surface.rect.bottom > state.viewport.height + 1)) errors.push(`surface clipped ${JSON.stringify(state.surface.rect)}`);
  if (state.actions.length && !state.actions.some((action) => action.bottom <= state.viewport.height + 1 && action.top >= -1)) errors.push('no reachable action');
  if (/version check passed|command completed:|menu awaiting item selection|\bpid\s+\d+|sent direct|sent compat/i.test(state.visibleText)) errors.push('transport copy visible');
  return errors;
}

async function captureFailureMatrix(page, run) {
  await page.evalCheckedValue(setupExpression('single-select'));
  await delay(120);
  await page.evalCheckedValue(`(() => { const options=document.getElementById('interaction-options'); options.style.maxHeight='48px'; options.style.overflow='auto'; const row=document.querySelector('[data-stable-id="object:402"]'); row?.focus(); options.scrollTop=17; window.__nethackPromptTest.clearSentInputs(); return true; })()`);
  const cases = {};
  cases.staleRevision = await page.evalCheckedValue(`(() => { const t=window.__nethackPromptTest; const before=t.sentInputs().join(''); t.presentFailureForTest({id:'proof:stale',kind:'stale-revision',reason:'revision changed'}); document.querySelector('[data-stable-id="object:402"]')?.click(); return {before,after:t.sentInputs().join(''),state:t.failureState(),scrollTop:document.getElementById('interaction-options').scrollTop,notice:document.getElementById('ux-player-notice')?.textContent||''}; })()`);
  await page.evalCheckedValue('window.__nethackPromptTest.refreshFailureForTest()'); await delay(30);
  cases.staleRevision.afterRefresh = await page.evalCheckedValue(`({state:window.__nethackPromptTest.failureState(),scrollTop:document.getElementById('interaction-options').scrollTop})`);
  for (const [id, kind, reason] of [
    ['transactionRejection','rejected','transaction rejected'], ['transactionInterruption','interrupted','transaction interrupted'], ['promptConflict','prompt-conflict','prompt active'],
  ]) {
    cases[id] = await page.evalCheckedValue(`(() => { const t=window.__nethackPromptTest; const conflictControl=document.getElementById('open-actions'); const before=t.sentInputs().join(''); t.presentFailureForTest({id:${JSON.stringify(`proof:${id}`)},kind:${JSON.stringify(kind)},reason:${JSON.stringify(reason)}${kind === 'prompt-conflict' ? ',surface:null,actionControl:conflictControl' : ''}}); ${kind === 'prompt-conflict' ? "conflictControl?.click();" : ''} const result={before,after:t.sentInputs().join(''),state:t.failureState(),conflictingControlDisabled:Boolean(conflictControl?.disabled),notice:document.getElementById('ux-player-notice')?.textContent||''}; if(conflictControl){conflictControl.disabled=false;conflictControl.removeAttribute('aria-disabled');} t.clearFailureForTest(); return result; })()`);
  }
  for (const [id, kind, reason] of [
    ['processExit','process-exit','unexpected process exit'], ['recoveryFailure','recovery-failed','recovery failed'], ['storageLoad','storage-load','storage parse failed'], ['storageWrite','storage-write','storage write failed'],
  ]) {
    cases[id] = await page.evalCheckedValue(`(() => { const t=window.__nethackPromptTest; const before=t.sentInputs().join(''); const model=t.presentFailureForTest({id:${JSON.stringify(`proof:${id}`)},kind:${JSON.stringify(kind)},reason:${JSON.stringify(reason)},surface:null}); return {before,after:t.sentInputs().join(''),kind:model.kind,retry:model.retry,notice:document.getElementById('ux-player-notice')?.textContent||''}; })()`);
  }
  await page.evalCheckedValue(setupExpression('multi-select')); await delay(80);
  await page.evalCheckedValue(`(() => { const t=window.__nethackPromptTest; document.querySelector('[data-stable-id="object:402"]')?.focus(); t.presentFailureForTest({id:'proof:disappearing',kind:'stale-revision',reason:'item moved'}); t.event({name:'shim_start_menu',window:611,requestId:'pickup-multi-refresh'}); t.event({name:'shim_add_menu',window:611,selector:97,text:'a - 2 uncursed food rations',semanticKind:'object',objectId:401}); t.event({name:'shim_add_menu',window:611,selector:99,text:'c - a scroll labeled READ ME',semanticKind:'object',objectId:403}); t.event({name:'shim_end_menu',window:611,prompt:'Choose several items'}); t.event({name:'shim_select_menu',window:611,how:2,requestId:'pickup-multi-refresh'}); return true; })()`);
  await delay(50); await page.evalCheckedValue('window.__nethackPromptTest.refreshFailureForTest()'); await delay(30);
  cases.disappearingFocusedItem = await page.evalCheckedValue(`({state:window.__nethackPromptTest.failureState(),activeStableId:document.activeElement?.dataset?.stableId||'',rows:Array.from(document.querySelectorAll('[data-stable-id]')).map((node)=>node.dataset.stableId),sent:window.__nethackPromptTest.sentInputs().join('')})`);
  const checks = {
    stalePreservesStableSelectionAndScroll: cases.staleRevision.state.stableId === 'object:402' && Math.abs(cases.staleRevision.scrollTop - 17) < 1 && Math.abs(cases.staleRevision.afterRefresh.scrollTop - 17) < 1 && cases.staleRevision.afterRefresh.state.activeStableId === 'object:402',
    staleDisablesActivationAndRequiresRefresh: cases.staleRevision.state.disabledStableIds.includes('object:402') && cases.staleRevision.state.refreshVisible && cases.staleRevision.before === cases.staleRevision.after,
    refreshDoesNotRedispatch: cases.staleRevision.afterRefresh.state.sent === cases.staleRevision.after,
    rejectionInterruptionConflictDoNotRedispatch: ['transactionRejection','transactionInterruption','promptConflict'].every((id)=>cases[id].before===cases[id].after),
    promptConflictDisablesActivation: cases.promptConflict.conflictingControlDisabled && cases.promptConflict.state.disabledStableIds.length === 0,
    processRecoveryStorageNeverRetry: ['processExit','recoveryFailure','storageLoad','storageWrite'].every((id)=>cases[id].retry===false&&cases[id].before===cases[id].after&&cases[id].notice.trim()),
    disappearingFocusedItemUsesNearestSurvivingRow: cases.disappearingFocusedItem.activeStableId === 'object:401' && !cases.disappearingFocusedItem.rows.includes('object:402'),
  };
  run.failurePreservation = { evidenceKind: 'SYNTHETIC/INJECTED controller fault matrix', cases, checks };
  fs.writeFileSync(path.join(outDir, 'failure-preservation-matrix.json'), JSON.stringify(run.failurePreservation, null, 2));
  const failed = Object.entries(checks).filter(([,value])=>!value).map(([name])=>name);
  if (failed.length) throw new Error(`failure preservation matrix failed: ${failed.join(', ')}`);
}

async function runProfile(profile, index, qc, summary) {
  const page = await Harness.createElectronBrowserDriver({ root, port: basePort + index, width: profile.windowWidth, height: profile.windowHeight });
  const run = { profile, families: {}, checks: {}, output: {} };
  summary.runs[profile.id] = run;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    await page.send('Emulation.setDeviceMetricsOverride', { width: profile.cssWidth, height: profile.cssHeight, deviceScaleFactor: profile.dpr, mobile: false });
    await page.send('Page.bringToFront');
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    for (const family of families) {
      await page.evalCheckedValue(setupExpression(family));
      await delay(220);
      const state = await uiState(page);
      const errors = validateFamily(profile, family, state);
      const quality = await visualQuality(page, family);
      errors.push(...quality.errors);
      const screenshot = await capture(page, qc, profile, family, state);
      run.families[family] = { evidenceKind: 'synthetic/injected renderer family fixture', state, visualQuality: quality, screenshot, errors };
      if (errors.length) throw new Error(`${profile.id} ${family}: ${errors.join('; ')}`);
    }
    if (profile.zoomPercent === 100 && profile.cssWidth === 1360) {
      await captureFailureMatrix(page, run);
      await page.evalCheckedValue(`(() => { const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); t.clearSentInputs(); t.setContainerStateForTest({active:true,sessionKind:'ground-pickup',phase:'ground-snapshot',prompt:'Ground items',leftItems:[{selector:97,text:'a - a runed dagger',semanticKind:'object',objectId:501}],rightItems:[{selector:98,text:'b - a food ration',semanticKind:'object',objectId:502}],loadedSides:{left:true,right:true},feedback:'Choose an item to move, or close this dialog.'}); const row=document.querySelector('.container-pane.left-pane .container-item-row'); const rect=row?.getBoundingClientRect(); row?.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:(rect?.left||40)+16,clientY:(rect?.top||40)+16})); document.getElementById('open-actions')?.focus(); document.getElementById('open-actions')?.click(); const help=document.querySelector('#system-actions [data-command-key="?"]'); help?.focus(); help?.click(); t.event({name:'shim_create_nhwindow',return:713,windowType:4}); t.event({name:'shim_putstr',window:713,text:'NetHack Help'}); t.event({name:'shim_putstr',window:713,text:'Movement and prompt help.'}); t.event({name:'shim_display_nhwindow',window:713,blocking:1}); return true; })()`);
      await delay(80);
      const before = await uiState(page);
      run.nested = { evidenceKind: 'SYNTHETIC/INJECTED clean nested focus-shell proof', before, baselineSent: before.sent, screenshot: await capture(page, qc, profile, 'synthetic-clean-nested-focus-document', before), steps: [] };
      for (let step = 1; step <= 3; step += 1) {
        await page.pressKey('Escape'); await delay(80);
        run.nested.steps.push(await uiState(page));
      }
      const [one,two,three] = run.nested.steps;
      run.checks.nestedStackSequence = one.surface?.id !== 'document-dialog' && one.focusStack.length >= 2 && two.focusStack.length >= 1 && three.focusStack.length === 0 && three.sent === run.nested.baselineSent;
      if (!run.checks.nestedStackSequence) throw new Error(`nested stack sequence failed: ${JSON.stringify(run.nested.steps.map((state)=>({surface:state.surface,depth:state.focusStack.length,sent:state.sent})))}`);

      await page.evalCheckedValue(`window.NetHackUxRuntime.runtime.service('notice').show({id:'failure:process-demo',kind:'error',message:'Connection lost. Start a new game or continue from recovery if one is available.',source:'recovery',persistence:'sticky'}); true`);
      const noticeState = await uiState(page);
      run.notice = { state: noticeState, screenshot: await capture(page, qc, profile, 'visible-error-player-notice', noticeState) };
    }
    run.diagnostic = await page.evalCheckedValue('window.netHackPOC.activeDiagnosticRun()', { awaitPromise: true }).catch((error) => ({ ok:false,error:error.message }));
  } finally {
    const output = page.output();
    run.output.stdoutFile = path.join(outDir, `${profile.id}-electron-stdout.log`);
    run.output.stderrFile = path.join(outDir, `${profile.id}-electron-stderr.log`);
    fs.writeFileSync(run.output.stdoutFile, output.stdout);
    fs.writeFileSync(run.output.stderrFile, output.stderr);
    fs.writeFileSync(path.join(outDir, `${profile.id}-diagnostic-summary.json`), `${JSON.stringify(run.diagnostic || null, null, 2)}\n`);
    await page.close().catch(() => {});
  }
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir });
  const summary = { revisionBasis:'Boss mainstream UXM-01 replacement instruction, 2026-07-11; forthcoming Glimmer plan hash not yet present in workspace',chunk:'UXM-01',parent:'UXM-00-GREEN-2026-07-11-a3bc7279eb22',evidenceKind:'SYNTHETIC/INJECTED renderer fixture coverage for visual layout, keyboard focus, failure preservation, and 200% zoom; not real gameplay proof',runs:{} };
  let failure;
  for (let index=0; index<profiles.length; index += 1) {
    try { await runProfile(profiles[index], index, qc, summary); }
    catch (error) { failure = error; summary.failure = {message:error.message,stack:error.stack}; break; }
  }
  summary.screenshotManifest = qc.manifestFile;
  summary.qc = Harness.screenshotQc.validateManifest(qc.manifestFile);
  fs.writeFileSync(path.join(outDir, 'uxm01-dialog-evidence-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`# UXM-01 dialog evidence\n\nOutput: ${outDir}\n\nProfiles completed: ${Object.keys(summary.runs).join(', ')}\nManifest: ${qc.manifestFile}`);
  if (failure) throw failure;
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
