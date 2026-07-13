const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const outDir = process.env.NH_SHOP_PAYMENT_OUT_DIR || path.join(root, 'test-output', 'real-shop-payment-context');
const basePort = Number(process.env.NH_SHOP_PAYMENT_CDP_PORT || 9664);
const width = 1360;
const height = 920;
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const response = await fetch(url); if (!response.ok) throw new Error(`${response.status} ${url}`); return response.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 120) { const started = Date.now(); let last; while (Date.now() - started < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (!message.id || !pending.has(message.id)) return; const request = pending.get(message.id); pending.delete(message.id); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result); }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evaluate(cdp, expression) { const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
async function click(cdp, selector) { const point = await evaluate(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); element?.scrollIntoView?.({block:'center',inline:'center'}); const rect = element?.getBoundingClientRect?.(); return rect ? {x:rect.left+rect.width/2,y:rect.top+rect.height/2} : null; })()`); if (!point) throw new Error(`missing ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key, code = `Key${key.toUpperCase()}`, text = key) {
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : (key === 'Escape' ? 27 : 0);
  await cdp.send('Input.dispatchKeyEvent', { type:'keyDown', key, code, text, windowsVirtualKeyCode:vk, nativeVirtualKeyCode:vk });
  await cdp.send('Input.dispatchKeyEvent', { type:'keyUp', key, code, windowsVirtualKeyCode:vk, nativeVirtualKeyCode:vk });
}
async function screenshot(cdp, name) {
  await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await delay(250);
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const rawTarget = path.join(outDir, 'raw-captures', name);
  const losslessTarget = path.join(outDir, 'lossless-transcodes', name);
  const viewSafeTarget = path.join(outDir, 'view-safe', name.replace(/\.png$/i, '.bmp'));
  fs.writeFileSync(rawTarget, Buffer.from(result.data, 'base64'));
  const transcode = spawnSync('python3', ['-c', [
    'from PIL import Image',
    'import sys',
    'with Image.open(sys.argv[1]) as image:',
    " rgb=image.convert('RGB')",
    " rgb.save(sys.argv[2], format='PNG', compress_level=6)",
    " preview=rgb.resize((max(1, rgb.width//4), max(1, rgb.height//4)), Image.Resampling.LANCZOS)",
    " preview.save(sys.argv[3], format='BMP')",
  ].join('\n'), rawTarget, losslessTarget, viewSafeTarget], { encoding: 'utf8' });
  if (transcode.status !== 0) throw new Error(`view-safe screenshot transcode failed: ${transcode.stderr || transcode.stdout}`);
  return viewSafeTarget;
}
async function state(cdp) { return evaluate(cdp, `(() => ({
  running: Boolean(window.__nethackAutomation?.state?.().runningState?.running),
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
  actions: window.__nethackPromptTest?.contextActions?.(),
  inventory: window.__nethackPromptTest?.inventory?.(),
  dialog: window.__nethackPromptTest?.dialog?.(),
  status: document.getElementById('status')?.textContent || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-30).map((entry) => entry.text || String(entry)) || [],
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  activePrompt: window.__nethackAutomation?.state?.().activePrompt || null
}))()`); }

function makeIsolatedPlayground(mode) {
  const playground = fs.mkdtempSync(path.join(os.tmpdir(), `nh-shop-payment-${mode}-`));
  fs.cpSync(path.join(repo, 'playground'), playground, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/i.test(path.basename(entry)) });
  return playground;
}

async function launch(mode, port) {
  const logs = { stdout: [], stderr: [] };
  const playground = makeIsolatedPlayground(mode);
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      AI_ORG_ELECTRON_CDP_PORT: String(port),
      NH_ELECTRON_WINDOW_WIDTH: String(width),
      NH_ELECTRON_WINDOW_HEIGHT: String(height),
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_PLAYGROUND: playground,
      NETHACKDIR: playground,
      NH_SHIM_TEST_SHOP_PAYMENT_SCENE: mode,
      NH_SHIM_RESET_LOCKS: '1',
      NETHACK_SEED: '424242',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => logs.stdout.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.stderr.push(String(chunk)));
  let cdp;
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((page) => page.type === 'page') ? list : null; });
    cdp = await connect((pages.find((page) => page.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await waitFor(() => evaluate(cdp, `document.readyState === 'complete' && Boolean(window.__nethackPromptTest)`), 10000);
    const startup = await state(cdp);
    if (startup.dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
    else await click(cdp, '#start-shim');
    await waitFor(() => evaluate(cdp, `document.getElementById('character-dialog')?.open === true`), 5000);
    await click(cdp, '#confirm-character');
    await waitFor(async () => (await state(cdp)).running);
    const initial = await state(cdp);
    if (initial.dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
    await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
    await waitFor(async () => { const current = await state(cdp); return current.actions?.buttons?.some((button) => /^pay-shopkeeper-/.test(button.id || '')) && current.inventory?.unpaidItemCount === 2 ? current : null; }, 12000);
    await delay(500);
    return { child, cdp, logs, playground };
  } catch (error) {
    let debugState = null;
    try { if (cdp) debugState = await state(cdp); } catch {}
    fs.writeFileSync(path.join(outDir, `launch-${mode}-failure.json`), JSON.stringify({ error: error.stack || String(error), debugState, stdout: logs.stdout, stderr: logs.stderr }, null, 2));
    try { cdp?.close(); } catch {}
    if (!child.killed) child.kill('SIGTERM');
    fs.rmSync(playground, { recursive: true, force: true });
    throw error;
  }
}

async function stop(run, prefix) {
  try { run.cdp?.close(); } catch {}
  if (!run.child.killed) run.child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => run.child.once('exit', resolve)), delay(2500)]);
  fs.writeFileSync(path.join(outDir, `${prefix}-electron-stdout.log`), run.logs.stdout.join(''));
  fs.writeFileSync(path.join(outDir, `${prefix}-electron-stderr.log`), run.logs.stderr.join(''));
  if (run.playground) fs.rmSync(run.playground, { recursive: true, force: true });
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'raw-captures'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'lossless-transcodes'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'view-safe'), { recursive: true });
  const evidence = { evidenceKind: 'REAL Electron + real NetHack core in test-gated native shop scenes; actual player commands/actions except the explicitly labeled stale/recipient-safety renderer supplement', outDir, screenshots: {}, rawScreenshots: {}, checks: {} };
  for (const [stage, name] of Object.entries({
    beforePayment: '01-unpaid-items-adjacent-shopkeeper.png',
    paymentMenu: '02-shop-payment-item-picker.png',
    afterPayment: '03-paid-inventory-action-removed.png',
    shopOffer: '03b-real-shop-sell-offer.png',
    insufficient: '04-insufficient-funds-message.png',
  })) evidence.rawScreenshots[stage] = path.join(outDir, 'raw-captures', name);
  let run;
  try {
    run = await launch('sufficient', basePort);
    evidence.beforePayment = await state(run.cdp);
    const payButton = evidence.beforePayment.actions.buttons.find((button) => /^pay-shopkeeper-/.test(button.id || ''));
    evidence.screenshots.beforePayment = await screenshot(run.cdp, '01-unpaid-items-adjacent-shopkeeper.png');
    await evaluate(run.cdp, 'window.__nethackPromptTest.clearSentInputs()');
    await click(run.cdp, `#context-action-bar button[data-context-action-id="${payButton.id}"]`);
    evidence.paymentMenu = await waitFor(async () => { const current = await state(run.cdp); return current.dialogs.includes('interaction-dialog') && /Shop payment/i.test(current.dialog?.title || '') ? current : null; }, 8000);
    evidence.screenshots.paymentMenu = await screenshot(run.cdp, '02-shop-payment-item-picker.png');
    await click(run.cdp, '#interaction-options .choice-button[data-key="a"]');
    evidence.partialSelection = await state(run.cdp);
    await click(run.cdp, '#interaction-clear');
    await click(run.cdp, '#interaction-cancel');
    await waitFor(async () => { const current = await state(run.cdp); return !current.dialogs.includes('interaction-dialog') && current.inventory?.unpaidItemCount === 2 ? current : null; }, 5000);
    await evaluate(run.cdp, 'window.__nethackPromptTest.clearSentInputs()');
    await click(run.cdp, `#context-action-bar button[data-context-action-id="${payButton.id}"]`);
    await waitFor(async () => { const current = await state(run.cdp); return current.dialogs.includes('interaction-dialog') && /Shop payment/i.test(current.dialog?.title || '') ? current : null; }, 8000);
    await click(run.cdp, '#interaction-select-all');
    await click(run.cdp, '#interaction-confirm');
    evidence.afterPayment = await waitFor(async () => { const current = await state(run.cdp); return current.inventory?.unpaidItemCount === 0 && !current.actions?.buttons?.some((button) => /^pay-shopkeeper-/.test(button.id || '')) ? current : null; }, 10000);
    evidence.screenshots.afterPayment = await screenshot(run.cdp, '03-paid-inventory-action-removed.png');

    await evaluate(run.cdp, `document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest.clearSentInputs(); true`);
    await press(run.cdp, 'd');
    const dropMenu = await waitFor(async () => { const current=await state(run.cdp); return current.dialogs.includes('interaction-dialog') && /drop/i.test(`${current.dialog?.title||''}\n${current.dialog?.prompt||''}`) ? current : null; }, 8000);
    const sellRow = (dropMenu.dialog?.options || []).find((option) => option.key && /food ration|potion of healing/i.test(option.text || '')) || (dropMenu.dialog?.options || []).find((option) => option.key && !/gold|zorkmid|wielded|worn/i.test(option.text || ''));
    if (!sellRow) throw new Error(`real shop offer setup found no droppable owned item: ${JSON.stringify(dropMenu.dialog)}`);
    await click(run.cdp, `#interaction-options .choice-button[data-key="${sellRow.key}"]`);
    evidence.shopOffer = await waitFor(async () => { const current=await state(run.cdp); return current.dialogs.includes('interaction-dialog') && /offers?|sell it/i.test(`${current.dialog?.title||''}\n${current.dialog?.prompt||''}`) ? current : null; }, 8000);
    evidence.screenshots.shopOffer = await screenshot(run.cdp, '03b-real-shop-sell-offer.png');
    await click(run.cdp, '#interaction-cancel');
    await stop(run, 'sufficient');
    run = null;

    run = await launch('insufficient', basePort + 1);
    evidence.beforeInsufficient = await state(run.cdp);
    const insufficientButton = evidence.beforeInsufficient.actions.buttons.find((button) => /^pay-shopkeeper-/.test(button.id || ''));
    await evaluate(run.cdp, 'window.__nethackPromptTest.clearSentInputs()');
    await click(run.cdp, `#context-action-bar button[data-context-action-id="${insufficientButton.id}"]`);
    evidence.insufficient = await waitFor(async () => { const current = await state(run.cdp); return /no gold or credit/i.test(current.messages.join('\n')) ? current : null; }, 8000).catch(async (error) => {
      throw new Error(`insufficient-funds payment did not reach the expected public message: ${error.message}; state=${JSON.stringify(await state(run.cdp))}`);
    });
    await click(run.cdp, '#context-action-bar button[data-context-action-id="more"]');
    await waitFor(() => evaluate(run.cdp, `document.getElementById('action-dialog')?.open === true`), 5000);
    await click(run.cdp, '#action-dialog-close');
    await waitFor(() => evaluate(run.cdp, `document.getElementById('action-dialog')?.open !== true`), 5000);
    evidence.screenshots.insufficient = await screenshot(run.cdp, '04-insufficient-funds-message.png');

    evidence.stale = await evaluate(run.cdp, `(() => {
      const test = window.__nethackPromptTest;
      const staleButton = document.querySelector('#context-action-bar button[data-context-action-id^="pay-shopkeeper-"]');
      const revision = (test.inventory().snapshotRevision || 0) + 100;
      test.clearSentInputs();
      test.event({ name: 'shim_update_inventory', revision, inventoryRevision: revision, equipmentRevision: revision, items: [] });
      staleButton?.click();
      return new Promise((resolve) => setTimeout(() => resolve({ sent: test.sentInputs().join(''), actions: test.contextActions(), status: document.getElementById('status')?.textContent || '', messages: test.messages().slice(-8).map((entry) => entry.text || String(entry)) }), 120));
    })()`);
    evidence.stale.evidenceKind = 'SYNTHETIC/INJECTED stale controller supplement; not actual-player proof';
    evidence.recipientSafety = await evaluate(run.cdp, `(() => {
      const test = window.__nethackPromptTest;
      const revision = (test.inventory().snapshotRevision || 0) + 1;
      test.event({ name: 'shim_update_inventory', revision, inventoryRevision: revision, equipmentRevision: revision, items: [{ selector: 97, objectId: 9001, text: 'a - a food ration (unpaid, 60 zorkmids)', quantity: 1, actionAffordances: ['shop.unpaid', 'shop.unpaid.owner.101'] }] });
      window.__nethackTooltipTest.setCells([{ x: 10, y: 10, ch: '@', semanticKind: 'hero', semanticName: 'hero' }, { x: 11, y: 10, ch: '@', semanticKind: 'monster', semanticName: 'shopkeeper', actionAffordances: ['monster.shopkeeper', 'monster.shopkeeper.id.101'] }, { x: 9, y: 10, ch: '@', semanticKind: 'monster', semanticName: 'shopkeeper', actionAffordances: ['monster.shopkeeper', 'monster.shopkeeper.id.202'] }]);
      test.setCursor(10, 10); test.setRunning(true);
      const ambiguous = test.contextActions();
      window.__nethackTooltipTest.setCells([{ x: 10, y: 10, ch: '@', semanticKind: 'hero', semanticName: 'hero' }, { x: 11, y: 10, ch: '@', semanticKind: 'monster', semanticName: 'shopkeeper', actionAffordances: ['monster.shopkeeper', 'monster.shopkeeper.id.202'] }]);
      test.setCursor(10, 10); test.setRunning(true); test.clearSentInputs();
      const replacement = test.contextActions();
      replacement.buttons.find((button) => /^pay-shopkeeper-/.test(button.id || ''))?.click?.();
      return { ambiguous, replacement, sent: test.sentInputs().join('') };
    })()`);

    evidence.recipientSafety.evidenceKind = 'SYNTHETIC/INJECTED recipient-safety controller supplement; not actual-player proof';
    const beforeLabels = evidence.beforePayment.actions?.buttons?.map((button) => button.text) || [];
    const menuText = `${evidence.paymentMenu.dialog?.prompt || ''}\n${(evidence.paymentMenu.dialog?.options || []).map((option) => option.text).join('\n')}`;
    const afterMessages = evidence.afterPayment.messages.join('\n');
    evidence.checks = {
      realElectronStartedWithNativeShopFixture: evidence.beforePayment.running === true,
      unpaidAffordancesCameFromNativeInventory: evidence.beforePayment.inventory.snapshotItems.filter((item) => item.actionAffordances.includes('shop.unpaid') && item.actionAffordances.some((token) => /^shop\.unpaid\.owner\.\d+$/.test(token))).length === 2,
      adjacentShopkeeperShowsCountedPayAction: beforeLabels.includes('Pay shopkeeper (2 items)'),
      payActionAlsoKeepsShopkeeperChat: beforeLabels.some((label) => /Chat with .* shopkeeper/i.test(label)),
      unrelatedAdvancedPayButtonIsNotTheProof: evidence.beforePayment.actions.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')),
      clickRoutesNativePayCommand: evidence.paymentMenu.sent === '#pay\n',
      multipleItemsOpenReviewablePaymentPicker: /food ration/i.test(menuText) && /potion of healing/i.test(menuText) && /Pay selected/i.test(evidence.paymentMenu.dialog?.confirmText || ''),
      paymentPickerUsesPlayerFacingStatus: /Choose items to pay for/i.test(`${evidence.paymentMenu.dialog?.prompt || ''}\n${evidence.paymentMenu.status}`),
      paymentPickerSeparatesSelectedSubtotalFromBillTotal: /1 selected.*selected total 60 zm/i.test(evidence.partialSelection.dialog?.feedback || '') && !/87 zm|visible total|bill total/i.test(evidence.partialSelection.dialog?.feedback || ''),
      successfulPaymentClearsNativeUnpaidState: evidence.afterPayment.inventory.unpaidItemCount === 0 && evidence.afterPayment.inventory.snapshotItems.every((item) => !item.actionAffordances.includes('shop.unpaid')),
      successfulPaymentRemovesContextAction: !evidence.afterPayment.actions.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')),
      successfulPaymentHasNativeFeedback: /bought|thank you for shopping/i.test(afterMessages),
      successfulPaymentUsesPlayerFacingStatus: evidence.afterPayment.status === 'Payment complete',
      realDropCommandOpensCoreShopOffer: evidence.shopOffer.sent.startsWith('d') && /offers?|sell it/i.test(`${evidence.shopOffer.dialog?.title||''}\n${evidence.shopOffer.dialog?.prompt||''}`),
      shopOfferUsesConfirmationButtons: (evidence.shopOffer.dialog?.options || []).some((option)=>/Accept offer/i.test(option.text||'')) && (evidence.shopOffer.dialog?.options || []).some((option)=>/Decline offer/i.test(option.text||'')),
      insufficientFundsAreReported: /no gold or credit/i.test(evidence.insufficient.messages.join('\n')),
      insufficientFundsStatusUsesNativeResult: /no gold or credit/i.test(evidence.insufficient.status),
      insufficientFundsDoNotHang: !evidence.insufficient.dialogs.includes('interaction-dialog') && !evidence.insufficient.activePrompt,
      insufficientFundsLeaveBillAndActionIntact: evidence.insufficient.inventory.unpaidItemCount === 2 && evidence.insufficient.actions.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')),
      staleDetachedActionSendsNothing: evidence.stale.sent === '',
      staleDetachedActionReportsChangedContext: /Payment is no longer available/i.test(`${evidence.stale.status}\n${evidence.stale.messages.join('\n')}`),
      staleSnapshotRemovesPayAction: !evidence.stale.actions.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')),
      multipleAdjacentShopkeepersSuppressUntargetedPay: !evidence.recipientSafety.ambiguous.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')),
      replacementShopkeeperCannotReceiveAnotherOwnersBill: !evidence.recipientSafety.replacement.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')) && evidence.recipientSafety.sent === '',
    };
    await stop(run, 'insufficient');
    run = null;

    fs.writeFileSync(path.join(outDir, 'real-shop-payment-context-debug.json'), JSON.stringify(evidence, null, 2));
    const qc = spawnSync('python3', ['-c', [
      'from PIL import Image, ImageChops',
      'from pathlib import Path',
      'import hashlib, json, struct, sys',
      'root=Path(sys.argv[1])',
      'def idat_chunks(path):',
      ' data=path.read_bytes(); offset=8; sizes=[]',
      ' while offset+12 <= len(data):',
      "  size=struct.unpack('>I',data[offset:offset+4])[0]; kind=data[offset+4:offset+8]",
      "  if kind == b'IDAT': sizes.append(size)",
      '  offset += size+12',
      ' return sizes',
      'rows=[]',
      "for raw in sorted((root/'raw-captures').glob('*.png')):",
      " lossless=root/'lossless-transcodes'/raw.name",
      " accepted=root/'view-safe'/(raw.stem+'.bmp')",
      ' with Image.open(raw) as a, Image.open(lossless) as b, Image.open(accepted) as c:',
      "  ar=a.convert('RGB'); br=b.convert('RGB'); cr=c.convert('RGB')",
      "  raw_chunks=idat_chunks(raw); lossless_chunks=idat_chunks(lossless)",
      "  rows.append({'name':raw.name,'dimensions':list(ar.size),'rawSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'losslessTranscodeSha256':hashlib.sha256(lossless.read_bytes()).hexdigest(),'acceptedBmp':accepted.name,'acceptedBmpSha256':hashlib.sha256(accepted.read_bytes()).hexdigest(),'acceptedDimensions':list(cr.size),'rawIdatChunkCount':len(raw_chunks),'rawTypicalIdatBytes':raw_chunks[0] if raw_chunks else 0,'losslessIdatChunkCount':len(lossless_chunks),'losslessTypicalIdatBytes':lossless_chunks[0] if lossless_chunks else 0,'losslessDecodedPixelsIdentical':ImageChops.difference(ar,br).getbbox() is None,'inspection':'pending manual inspection'})",
      "manifest={'finding':'Project review tools can render black bands for full-size CDP screenshots, losslessly re-encoded PNGs, and full-size JPEGs. This is decoder/preview-specific: Pillow decodes raw and lossless PNG rasters identically. Raw PNGs and lossless diagnostics are retained separately; cross-viewer acceptance uses quarter-size uncompressed BMP overviews.','rawDirectory':str(root/'raw-captures'),'losslessDiagnosticDirectory':str(root/'lossless-transcodes'),'acceptedDirectory':str(root/'view-safe'),'manualInspectionCompleted':False,'files':rows}",
      "(root/'screenshot-qc.json').write_text(json.dumps(manifest,indent=2)+'\\n')",
    ].join('\n'), outDir], { encoding: 'utf8' });
    if (qc.status !== 0) throw new Error(`screenshot QC failed: ${qc.stderr || qc.stdout}`);
    const summary = [
      '# Real shop payment contextual action validation', '',
      `Output: ${outDir}`, '',
      '## Native setup',
      '- Test-fixture build created a real tended general store, placed the hero beside its real shopkeeper, and picked up two real stock objects through `pick_obj()` and `addtobill()`.',
      '- The renderer received ordinary live map and inventory events. Payment ran through NetHack `#pay`, its itemized bill menu, and native gold/bill mutation.',
      '- The sell-offer frame uses the actual player `d` command on a paid item inside the real test-gated shop; NetHack itself emitted the offer prompt.',
      '- Stale-detached-action and recipient-safety checks are explicitly synthetic/injected controller supplements; they are not presented as actual-player proof.', '',
      '## Checks', ...Object.entries(evidence.checks).map(([name, passed]) => `- ${passed ? 'PASS' : 'FAIL'} ${name}`), '',
      '## Accepted view-safe screenshots', ...Object.entries(evidence.screenshots).map(([name, file]) => `- ${name}: ${file}`), '',
      '## Raw capture anomaly',
      '- Raw CDP PNGs are retained under `raw-captures/`; pixel-identical PNG diagnostics are under `lossless-transcodes/`. Neither PNG set is cited as universally view-safe because the anomaly is decoder-specific.',
      '- Acceptance uses quarter-size uncompressed BMP overviews under `view-safe/`. `screenshot-qc.json` records provenance and leaves manual inspection pending until a reviewer opens every accepted artifact.', '',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-shop-payment-context-summary.md'), summary);
    console.log(summary);
    const failed = Object.entries(evidence.checks).filter(([, passed]) => !passed).map(([name]) => name);
    if (failed.length) throw new Error(`shop payment checks failed: ${failed.join(', ')}`);
  } finally {
    if (run) await stop(run, 'aborted');
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
