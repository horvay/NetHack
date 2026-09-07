#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');



const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
let outDir, evidencePage, evidenceQc, scenarioError

const scenarioId = 'status/full-hud';
let captureViewport = { width: 1440, height: 930, devicePixelRatio: 2 };
const fullStatusOptions = '!tutorial,!autopickup,time,showscore,showexp,showvers,weaponstatus,armorstatus,terrainstatus,disclose:+i +a +v +g +c +o';




async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: captureViewport, state: path.basename(name, path.extname(name)) }); }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ running: window.__nethackAutomation?.state?.().runningState?.running || false, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '', body: document.body.innerText }))()`); }
async function start(cdp) {
  const result = await evalExpr(cdp, `(() => window.__nethackAutomation.startReplay({ playerSpec: '-uStatusVal-Val-Hum-Fem-Law', seed: '626262', nethackOptions: ${JSON.stringify(fullStatusOptions)} }))()`);
  if (!result?.ok) throw new Error(`startReplay failed: ${JSON.stringify(result)}`);
  await Harness.waitFor(async () => (await state(cdp)).running, 20000);
  await Harness.waitFor(async () => evalExpr(cdp, "Boolean(document.getElementById('intro-dialog')?.open)"), 10000);
  await click(cdp, '#intro-continue');
  await Harness.waitFor(async () => evalExpr(cdp, "!document.querySelector('dialog[open]')"), 5000);
}
async function hud(cdp) {
  return evalExpr(cdp, `(() => {
    const mount = document.getElementById('stats-panel');
    return {
      density: mount?.dataset?.hudDensity || '',
      text: mount?.innerText || '',
      groups: Array.from(mount?.querySelectorAll('.status-group') || []).map((group) => ({
        label: group.querySelector('.status-group-label')?.textContent || '',
        role: group.dataset.statusRole || '',
        text: group.innerText,
        fields: Array.from(group.querySelectorAll('.stat-chip')).filter((chip) => chip.getClientRects().length && getComputedStyle(chip).display !== 'none').map((chip) => {
          const style = getComputedStyle(chip);
          return {
            field: chip.dataset.statusField || '',
            label: chip.querySelector('span')?.textContent || '',
            value: chip.querySelector('strong')?.textContent || '',
            role: chip.dataset.statusRole || '',
            className: chip.className || '',
            animationName: style.animationName,
            animationDuration: style.animationDuration,
            animationIterations: style.animationIterationCount,
            outlineColor: style.outlineColor,
            borderWidth: style.borderWidth,
            boxShadow: style.boxShadow,
          };
        }),
      })),
    };
  })()`);
}
async function character(cdp) {
  return evalExpr(cdp, `(() => {
    const dialog = document.getElementById('ux-character-sheet-dialog');
    return {
      open: Boolean(dialog?.open),
      title: dialog?.querySelector('#ux-character-sheet-title')?.textContent || '',
      text: dialog?.innerText || '',
      groups: Array.from(dialog?.querySelectorAll('.ux-character-sheet-section') || []).map((section) => ({
        id: section.dataset.group || '',
        label: section.querySelector('h3')?.textContent || '',
        rows: Array.from(section.querySelectorAll('dt')).map((term) => {
          const value = term.nextElementSibling;
          return { label: term.textContent || '', value: value?.textContent || '', severity: value?.dataset?.severity || '' };
        }),
      })),
    };
  })()`);
}
function fields(snapshot) { return snapshot.groups.flatMap((group) => group.fields); }
function rows(snapshot) { return snapshot.groups.flatMap((group) => group.rows); }
function byLabel(items, label) { return items.find((item) => item.label === label); }
function assertLabels(name, items, required, forbidden = []) {
  const labels = items.map((item) => item.label);
  const missing = required.filter((label) => !labels.includes(label));
  const unexpected = forbidden.filter((label) => labels.includes(label));
  assert(name, !missing.length && !unexpected.length, JSON.stringify({ missing, unexpected, labels }));
}
async function sendWait(cdp) { return evalExpr(cdp, `(() => { window.__nethackAutomation?.sendKeycode?.(46); return true; })()`); }

async function main() { if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]); scenarioError = null; ; ;
const page = await Harness.createElectronBrowserDriver({ root, width: 1440, height: 930, env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '626262' } });
const cdp = (outDir = page.outputDir, evidencePage = page, evidenceQc = createEvidence(page), page.cdp) 
;
try { ;
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 930, deviceScaleFactor: 2, mobile: false });
await Harness.waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
await evalExpr(cdp, "window.NetHackUxRuntime.runtime.domain('shell').setDensity('compact', { persist: false })");
await start(cdp);
const compactRequired = ['Hero', 'Align', 'Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha', 'HP', 'Pw', 'AC', 'XL', 'XP', 'Dlvl', 'Gold', 'Time'];
const compactForbidden = ['Score', 'Wield', 'Armor', 'Version'];
const firstHud = await Harness.waitFor(async () => {
  const snapshot = await hud(cdp);
  const labels = fields(snapshot).map((item) => item.label);
  return snapshot.density === 'compact' && compactRequired.every((label) => labels.includes(label)) ? snapshot : null;
}, 20000).catch(async (error) => { fs.writeFileSync(path.join(outDir, 'status-timeout-debug.json'), JSON.stringify(await hud(cdp).catch(() => ({})), null, 2)); await shot(cdp, 'debug-status-timeout.png').catch(() => undefined); throw error; });
const firstFields = fields(firstHud);
assert('persistent HUD uses Auto density', firstHud.density === 'compact', JSON.stringify(firstHud));
assertLabels('wide Auto HUD exposes every responsive gameplay stat without on-demand facts', firstFields, compactRequired, compactForbidden);
assert('compact identity is visible', Boolean(byLabel(firstFields, 'Hero')?.value), JSON.stringify(firstHud));
assert('compact paired vitals are visible', /^\d+\s+\/\s+\d+$/.test(byLabel(firstFields, 'HP')?.value || '') && /^\d+\s+\/\s+\d+$/.test(byLabel(firstFields, 'Pw')?.value || ''), JSON.stringify(firstHud));
assert('wide Auto HUD exposes attributes, defenses, progression, and dungeon facts', ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha', 'AC', 'XL', 'XP', 'Dlvl', 'Gold', 'Time'].every((label) => byLabel(firstFields, label)?.value), JSON.stringify(firstHud));
const compactScreenshot = await shot(cdp, '01-auto-status-hud.png');
const carryAttention = byLabel(firstFields, 'Carry');
assert('urgent Carry status has static and animated attention treatment', carryAttention?.role === 'urgent'
  && carryAttention.className.includes('ux-status-urgent')
  && carryAttention.animationName === 'ux-direction-required-glow'
  && carryAttention.animationDuration === '0.8s'
  && carryAttention.animationIterations === '3'
  && parseFloat(carryAttention.borderWidth) > 0
  && carryAttention.boxShadow !== 'none', JSON.stringify(carryAttention));
const reducedMotionAttention = await evalExpr(cdp, `(() => {
  const previous = document.body.dataset.uxMotion || '';
  document.body.dataset.uxMotion = 'reduced';
  const chip = Array.from(document.querySelectorAll('#stats-panel .ux-status-urgent')).find((entry) => entry.querySelector('span')?.textContent === 'Carry');
  const style = chip ? getComputedStyle(chip) : null;
  const result = style ? { animationName: style.animationName, borderWidth: style.borderWidth, boxShadow: style.boxShadow } : null;
  if (previous) document.body.dataset.uxMotion = previous; else delete document.body.dataset.uxMotion;
  return result;
})()`);
assert('reduced-motion mode keeps static urgency while disabling pulse', reducedMotionAttention?.animationName === 'none'
  && reducedMotionAttention.borderWidth === carryAttention.borderWidth
  && reducedMotionAttention.boxShadow !== 'none', JSON.stringify(reducedMotionAttention));

await click(cdp, '#ux-character-button');
const characterSheet = await Harness.waitFor(async () => {
  const snapshot = await character(cdp);
  const labels = rows(snapshot).map((item) => item.label);
  return snapshot.open && ['Name / role', 'Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'].every((label) => labels.includes(label)) ? snapshot : null;
}, 5000);
const characterRows = rows(characterSheet);
const characterRequired = ['Name / role', 'Align', 'Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha', 'HP', 'Pw', 'AC', 'XL', 'XP', 'Dlvl', 'Gold', 'Time', 'Carry', 'On', 'Wield', 'Armor', 'Version'];
assertLabels('Character surface retains emitted identity, attributes, vitals, dungeon, state, gear, and system facts', characterRows, characterRequired);
assert('Character identity matches the compact HUD', byLabel(characterRows, 'Name / role')?.value === byLabel(firstFields, 'Hero')?.value, JSON.stringify({ characterSheet, firstHud }));
assert('Character paired vitals match the compact HUD', byLabel(characterRows, 'HP')?.value === byLabel(firstFields, 'HP')?.value && byLabel(characterRows, 'Pw')?.value === byLabel(firstFields, 'Pw')?.value, JSON.stringify({ characterSheet, firstHud }));
const detailStateRows = characterSheet.groups.find((group) => group.id === 'state')?.rows || [];
for (const label of ['Hunger', 'Carry']) {
  const detail = byLabel(detailStateRows, label);
  if (detail) assert(`compact HUD retains emitted ${label}`, byLabel(firstFields, label)?.value === detail.value, JSON.stringify({ detail, firstHud }));
}
const urgentDetailRows = detailStateRows.filter((item) => !['Hunger', 'Carry', 'On'].includes(item.label) && ['warning', 'danger'].includes(item.severity));
for (const detail of urgentDetailRows) {
  const compact = byLabel(firstFields, detail.label);
  assert(`compact HUD retains urgent ${detail.label}`, compact?.value === detail.value && compact?.role === 'urgent', JSON.stringify({ detail, firstHud }));
}
const characterScreenshot = await shot(cdp, '02-character-detail.png');
await evalExpr(cdp, "document.getElementById('ux-character-sheet-dialog')?.close?.('close'); true");

await click(cdp, '#ux-hud-density-button');
const detailedHud = await Harness.waitFor(async () => {
  const snapshot = await hud(cdp);
  return snapshot.density === 'detailed' && byLabel(fields(snapshot), 'Time')?.value ? snapshot : null;
}, 5000);
const detailedFields = fields(detailedHud);
assertLabels('Full HUD retains every responsive gameplay stat', detailedFields, compactRequired, compactForbidden);
const timeBefore = byLabel(detailedFields, 'Time')?.value || '';
await sendWait(cdp);
const afterHud = await Harness.waitFor(async () => {
  const snapshot = await hud(cdp);
  const time = byLabel(fields(snapshot), 'Time')?.value || '';
  return snapshot.density === 'detailed' && time && time !== timeBefore ? snapshot : null;
}, 5000);
const timeAfter = byLabel(fields(afterHud), 'Time')?.value || '';
assertLabels('Full HUD remains rendered after a live command update', fields(afterHud), compactRequired, compactForbidden);
assert('real wait command advances the visible Time field', Boolean(timeBefore && timeAfter && timeBefore !== timeAfter), JSON.stringify({ timeBefore, timeAfter, afterHud }));
const updatedScreenshot = await shot(cdp, '03-detailed-status-hud-after-wait.png');
await evalExpr(cdp, `(() => {
  window.NetHackUxStatusPresentation.renderStatusPresentation(document.getElementById('stats-panel'), new Map([
    [0, 'StatusVal the Stripling'],
    [17, 'Hungry'],
    [22, 'mask 2'],
  ]), { documentRoot: document, density: 'compact', adaptive: true });
  return true;
})()`);
const warningHud = await hud(cdp);
for (const label of ['Hunger', 'Senses']) {
  const warning = byLabel(fields(warningHud), label);
  assert(`${label} warning receives the urgent attention treatment`, warning?.role === 'urgent'
    && warning.className.includes('warning')
    && warning.animationName === 'ux-direction-required-glow'
    && warning.animationDuration === '0.8s'
    && warning.animationIterations === '3'
    && warning.outlineColor === carryAttention.outlineColor
    && warning.borderWidth === carryAttention.borderWidth
    && warning.boxShadow !== 'none', JSON.stringify(warning));
}
const warningScreenshot = await shot(cdp, '04-hungry-blind-attention.png');
assert('ordinary hero status does not receive adverse glow', byLabel(fields(warningHud), 'Hero')?.animationName !== 'ux-direction-required-glow');
captureViewport = { width: 960, height: 720, devicePixelRatio: 1 };
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false });
await shot(cdp, '05-compact-hungry-blind-attention.png');
await evalExpr(cdp, `(() => {
  window.NetHackUxStatusPresentation.renderStatusPresentation(document.getElementById('stats-panel'), new Map([
    [0, 'StatusVal the Stripling'], [17, 'Weak'],
  ]), { documentRoot: document, density: 'compact', adaptive: true });
})()`);
const danger = byLabel(fields(await hud(cdp)), 'Hunger');
assert('danger hunger uses the same bounded purple glow', danger?.className.includes('danger')
  && danger.animationName === 'ux-direction-required-glow' && danger.animationDuration === '0.8s'
  && danger.animationIterations === '3' && danger.outlineColor === carryAttention.outlineColor, JSON.stringify(danger));
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const reducedDanger = byLabel(fields(await hud(cdp)), 'Hunger');
assert('OS reduced motion retains purple urgency without animation', reducedDanger?.animationName === 'none'
  && reducedDanger.outlineColor === carryAttention.outlineColor && reducedDanger.boxShadow !== 'none', JSON.stringify(reducedDanger));
await shot(cdp, '06-compact-weak-reduced-motion.png');
await cdp.send('Emulation.setEmulatedMedia', { features: [] });
await evalExpr(cdp, `(() => {
  window.NetHackUxStatusPresentation.renderStatusPresentation(document.getElementById('stats-panel'), new Map([
    [0, 'StatusVal the Stripling'], [17, 'Satiated'],
  ]), { documentRoot: document, density: 'compact', adaptive: true });
})()`);
const recovered = byLabel(fields(await hud(cdp)), 'Hunger');
assert('satiation clears adverse glow and former blindness', recovered?.role === 'persistent'
  && recovered.animationName !== 'ux-direction-required-glow'
  && !fields(await hud(cdp)).some((field) => field.role === 'urgent'), JSON.stringify(recovered));
await shot(cdp, '07-compact-satiated-no-attention.png');
fs.writeFileSync(path.join(outDir, 'status-hud-debug.json'), JSON.stringify({ firstHud, characterSheet, detailedHud, afterHud, warningHud, timeBefore, timeAfter, screenshots: { compactScreenshot, characterScreenshot, updatedScreenshot, warningScreenshot } }, null, 2));

;
; } catch (error) { scenarioError = error; } finally { await finishEvidence(page, evidenceQc, scenarioError); } }
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
