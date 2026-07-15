const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');


const RecordingSchema = require('../src/shared/recording-schema');

const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
let outDir, evidencePage, evidenceQc

const width = Number(process.env.NH_REAL_RECORDING_TOOLBAR_WIDTH || 1360);
const height = Number(process.env.NH_REAL_RECORDING_TOOLBAR_HEIGHT || 920);
const sourcePlayground = path.resolve(root, '..', 'playground');

function prepareIsolatedPlayground(isolatedPlayground) {
  fs.mkdirSync(path.join(isolatedPlayground, 'save'), { recursive: true });
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license']) fs.copyFileSync(path.join(sourcePlayground, name), path.join(isolatedPlayground, name));
  for (const name of ['perm', 'record', 'logfile', 'xlogfile', 'livelog', 'paniclog']) fs.writeFileSync(path.join(isolatedPlayground, name), '');
}





async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function shot(cdp, name) {
  const id = path.basename(name, path.extname(name));
  return evidencePage.nativeScreenshotEvidence(evidenceQc, id, {
    classification: 'synthetic-fixture',
    viewport: { width, height, devicePixelRatio: 1 },
    state: id,
  });
}
async function clickCenter(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  return box;
}
async function state(cdp) {
  return evalExpr(cdp, `(() => {
    const toolbar = document.getElementById('recording-toolbar');
    const checkpoint = document.getElementById('record-checkpoint-primary');
    const save = document.getElementById('save-recording-primary');
    const debugCheckpoint = document.getElementById('record-checkpoint');
    const toolbarBox = toolbar?.getBoundingClientRect();
    const checkpointBox = checkpoint?.getBoundingClientRect();
    const automation = window.__nethackAutomation?.state?.() || {};
    return {
      running: automation.runningState?.running || false,
      seen: document.getElementById('shim-output')?.dataset?.seen || '',
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      toolbarHidden: toolbar?.hidden ?? true,
      toolbarText: toolbar?.innerText || '',
      toolbarWidth: Math.round(toolbarBox?.width || 0),
      checkpointText: checkpoint?.innerText || '',
      checkpointVisible: !!checkpoint && !checkpoint.disabled && !toolbar?.hidden && checkpointBox.width > 0 && checkpointBox.height > 0,
      saveText: save?.innerText || '',
      debugCheckpointHidden: debugCheckpoint?.hidden ?? true,
      recordingStatus: document.getElementById('recording-status')?.innerText || '',
      savePath: ((toolbar?.innerText || '') + '\\n' + (document.getElementById('recording-status')?.innerText || '')).match(/Recording saved: (.*\\.nhrec\\.json)/)?.[1] || '',
      body: document.body.innerText,
    };
  })()`);
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  const isolatedPlayground = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'nh-recording-toolbar-'));
  prepareIsolatedPlayground(isolatedPlayground);
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_PLAYGROUND: isolatedPlayground,
      NETHACKDIR: isolatedPlayground,
      NH_DIAGNOSTIC_LOG_DIR: path.join(isolatedPlayground, 'diagnostics'),
      NH_TEST_CAPTURE_DIR: path.join(isolatedPlayground, 'native-captures'),
    },
  });
  outDir = page.outputDir;
  evidencePage = page;
  evidenceQc = createEvidence(page);
  const cdp = page.cdp;
  const results = { runIdentity: page.outputIdentity, screenshots: {}, checks: {} };
  let scenarioError;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true });
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    const captureProfile = await evalExpr(cdp, `window.netHackPOC.setTestCaptureProfile(${JSON.stringify({ width, height, zoomPercent: 100 })})`);
    assert('native recording toolbar capture profile applied', captureProfile?.ok && captureProfile.contentSize?.[0] === width && captureProfile.contentSize?.[1] === height, JSON.stringify(captureProfile));
    await Harness.waitFor(async () => (await evalExpr(cdp, `innerWidth === ${width} && innerHeight === ${height}`)), 5000);
    results.beforeStart = await state(cdp);
    assert('toolbar hidden before recording', results.beforeStart.toolbarHidden);
    results.screenshots.beforeStart = await shot(cdp, '01-before-recording-toolbar-hidden.png');
    const initialDialogs = await evalExpr(cdp, "Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id)");
    if (initialDialogs.includes('startup-choice-dialog')) await clickCenter(cdp, '#startup-new-game');
    else await clickCenter(cdp, '#start-shim');
    await Harness.waitFor(async () => (await evalExpr(cdp, "document.getElementById('character-dialog')?.open")), 5000);
    await evalExpr(cdp, `(() => {
      document.getElementById('player-name').value = 'Recorder';
      document.getElementById('player-role').value = 'Val';
      document.getElementById('player-race').value = 'Hum';
      document.getElementById('player-gender').value = 'Fem';
      document.getElementById('player-align').value = 'Law';
      document.getElementById('game-seed').value = '424242';
      document.getElementById('record-inputs').checked = true;
    })()`);
    await clickCenter(cdp, '#confirm-character');
    results.recordingActive = await Harness.waitFor(async () => {
      const next = await state(cdp);
      return next.running && /shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(next.seen) && next.checkpointVisible ? next : null;
    }, 20000);
    if (results.recordingActive.dialogs.includes('intro-dialog')) await clickCenter(cdp, '#intro-continue');
    results.screenshots.recordingActive = await shot(cdp, '02-recording-toolbar-visible.png');
    await evalExpr(cdp, `window.prompt = () => 'real-game-toolbar-checkpoint';`);
    await clickCenter(cdp, '#record-checkpoint-primary');
    results.afterCheckpoint = await Harness.waitFor(async () => {
      const next = await state(cdp);
      return /Checkpoint recorded: real-game-toolbar-checkpoint/.test(next.toolbarText + next.recordingStatus) ? next : null;
    }, 5000);
    results.screenshots.afterCheckpoint = await shot(cdp, '03-after-primary-checkpoint-click.png');
    await clickCenter(cdp, '#save-recording-primary');
    results.afterSave = await Harness.waitFor(async () => {
      const next = await state(cdp);
      return next.savePath ? next : null;
    }, 5000);
    const savedRecording = JSON.parse(fs.readFileSync(results.afterSave.savePath, 'utf8'));
    const savedValidation = RecordingSchema.validateRecording(savedRecording);
    assert('primary save writes a schema-valid recording', savedValidation.ok, savedValidation.message || 'invalid recording');
    results.savedRecording = { schema: savedRecording.schema, eventCount: savedRecording.events?.length || 0 };
    fs.copyFileSync(results.afterSave.savePath, path.join(outDir, 'saved-toolbar-recording.nhrec.json'));
    results.screenshots.afterSave = await shot(cdp, '04-after-primary-save-click.png');
    assert('normal game toolbar is visible while recording', !results.recordingActive.toolbarHidden && results.recordingActive.toolbarWidth > 400, JSON.stringify(results.recordingActive));
    assert('primary checkpoint button is visible and discoverable', /Add screenshot checkpoint/.test(results.recordingActive.checkpointText) && results.recordingActive.checkpointVisible, JSON.stringify(results.recordingActive));
    assert('primary save button is visible', /Save recording/.test(results.recordingActive.saveText), JSON.stringify(results.recordingActive));
    assert('debug checkpoint mirror remains available when recording', results.recordingActive.debugCheckpointHidden === false, JSON.stringify(results.recordingActive));
    assert('primary checkpoint records named checkpoint', /real-game-toolbar-checkpoint/.test(results.afterCheckpoint.toolbarText + results.afterCheckpoint.recordingStatus), JSON.stringify(results.afterCheckpoint));
    assert('primary save reports the concrete recording path', /Recording saved: .*\.nhrec\.json/.test(results.afterSave.toolbarText + results.afterSave.recordingStatus), JSON.stringify(results.afterSave));
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(results, null, 2));
  } catch (error) {
    scenarioError = error;
    results.error = error.stack || String(error);
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(results, null, 2));
  } finally {
    try {
      await finishEvidence(page, evidenceQc, scenarioError);
    } finally {
      fs.rmSync(isolatedPlayground, { recursive: true, force: true });
    }
  }
}

main();
