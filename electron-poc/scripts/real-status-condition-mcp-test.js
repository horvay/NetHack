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
const nethackOptions = '!tutorial,!autopickup,time,showscore,showexp,showvers,weaponstatus,armorstatus,terrainstatus,disclose:+i +a +v +g +c +o';




async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width: 1440, height: 930, devicePixelRatio: 2 }, state: path.basename(name, path.extname(name)) }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function hud(cdp) { return evalExpr(cdp, `(() => window.__nethackPromptTest?.statusHud?.() || { text: document.getElementById('stats-panel')?.innerText || '', groups: [] })()`); }
async function send(cdp, key) { return evalExpr(cdp, `((code) => { window.__nethackAutomation?.sendKeycode?.(code); return true; })(${JSON.stringify(key.charCodeAt(0))})`); }
async function start(cdp) { const result = await evalExpr(cdp, `(() => window.__nethackAutomation.startReplay({ playerSpec: '-uStatusCon-Val-Hum-Fem-Law', seed: '737373', nethackOptions: ${JSON.stringify(nethackOptions)} }))()`); if (!result?.ok) throw new Error(`startReplay failed: ${JSON.stringify(result)}`); await Harness.waitFor(async () => evalExpr(cdp, `(() => window.__nethackAutomation?.state?.().runningState?.running || false)()`), 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); await Harness.waitFor(async () => (await hud(cdp)).text.includes('Str'), 20000).catch(async (error) => { fs.writeFileSync(path.join(outDir, 'start-timeout-debug.json'), JSON.stringify({ result, hud: await hud(cdp).catch(() => ({})), body: await evalExpr(cdp, 'document.body.innerText').catch(() => '') }, null, 2)); await shot(cdp, 'debug-start-timeout.png').catch(() => undefined); throw error; }); }
async function main() { if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]); scenarioError = null; ; ;
const page = await Harness.createElectronBrowserDriver({ root, width: 1440, height: 930, env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '737373' } });
const cdp = (outDir = page.outputDir, evidencePage = page, evidenceQc = createEvidence(page), page.cdp) 
;
try { ;
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 930, deviceScaleFactor: 2, mobile: false });
await Harness.waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
await start(cdp);
const terrainHud = await Harness.waitFor(async () => { const snapshot = await hud(cdp); return /\bOn\s+\S+/i.test(snapshot.text) ? snapshot : null; }, 10000).catch(async (error) => { fs.writeFileSync(path.join(outDir, 'terrain-timeout-debug.json'), JSON.stringify(await hud(cdp).catch(() => ({})), null, 2)); await shot(cdp, 'debug-terrain-timeout.png').catch(() => undefined); throw error; });
const terrainShot = await shot(cdp, '01-terrain-status.png');
let naturalCondition = false;
let conditionHud = await hud(cdp);
if (/\b(?:Held\s+Trapped|Trapped)\b/i.test(conditionHud.text)) naturalCondition = true;
if (!naturalCondition) {
  await evalExpr(cdp, `(() => { window.__nethackPromptTest.event({ name: 'shim_status_update', field: 22, conditionMask: 0x00000002 | 0x00000008 | 0x04000000 }); return true; })()`);
  conditionHud = await Harness.waitFor(async () => { const snapshot = await hud(cdp); return /\b(?:Held\s+Trapped|Trapped)\b/i.test(snapshot.text) && /\bBlind\b/i.test(snapshot.text) && /\bConfused\b/i.test(snapshot.text) ? snapshot : null; }, 5000);
}
const conditionShot = await shot(cdp, '02-condition-status-trapped.png');
assert('terrain status visible from real status emission', /\bOn\s+\S+/i.test(terrainHud.text), JSON.stringify(terrainHud));
assert('condition status visible in the real Electron renderer', /\b(?:Held\s+Trapped|Trapped)\b/i.test(conditionHud.text), JSON.stringify(conditionHud));
fs.writeFileSync(path.join(outDir, 'status-condition-debug.json'), JSON.stringify({ terrainHud, conditionHud, naturalCondition, scenarioId, nethackOptions }, null, 2));

;
; } catch (error) { scenarioError = error; } finally { await finishEvidence(page, evidenceQc, scenarioError); } }
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
