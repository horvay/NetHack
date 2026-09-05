#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');
const sourcePlayground = path.join(repoRoot, 'playground');
const scenarioId = 'identity/archeologist-loaded-avatar';
const playerName = `LoadedAvatar${Date.now().toString(36).slice(-5)}`;
const width = Number(process.env.NH_REAL_LOADED_HERO_AVATAR_WIDTH || 1440);
const height = Number(process.env.NH_REAL_LOADED_HERO_AVATAR_HEIGHT || 940);
let playground = null;

const { waitFor, delay } = Harness;

function resetPlayground() {
  fs.rmSync(playground, { recursive: true, force: true });
  fs.mkdirSync(path.join(playground, 'save'), { recursive: true });
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license', 'perm']) {
    const src = path.join(sourcePlayground, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(playground, name));
  }
}

function saveFiles() {
  try { return fs.readdirSync(path.join(playground, 'save')).map((name) => path.join(playground, 'save', name)); }
  catch { return []; }
}

function bridgeEnv(extra = {}) {
  return {
    ...process.env,
    NH_TEST_PLAYGROUND: playground,
    NETHACKDIR: playground,
    NH_ELECTRON_TEST_FIXTURES: '1',
    NH_TEST_SCENARIO_ID: scenarioId,
    NETHACK_SEED: '626262',
    NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,disclose:+i +a +v +g +c +o',
    ...extra,
  };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(2000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function createScenarioSave() {
  const child = spawn(bridge, [`-u${playerName}-Arc-Hum-Mal-Law`], {
    cwd: repoRoot,
    env: bridgeEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    await waitFor(() => stdout.includes('bridge_start'), 10000);
    await waitFor(() => /bridge_test_scenario_loaded/.test(stdout), 15000);
    await waitFor(() => /welcome to NetHack|Hello /i.test(stdout), 15000);
    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: 'S'.charCodeAt(0) })}\n`);
    await waitFor(() => /Really save|Save the game/i.test(`${stdout}\n${stderr}`), 10000).catch(() => null);
    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: 'y'.charCodeAt(0) })}\n`);
    await waitFor(() => saveFiles().length > 0 ? true : null, 15000);
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(3000)]);
    return { saveFiles: saveFiles(), stdout, stderr };
  } finally {
    await stopChild(child);
  }
}

async function hoverSelector(page, selector) {
  const box = await page.visibleBox(selector);
  if (!box) throw new Error(`missing visible selector ${selector}`);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await delay(300);
  return box;
}

async function state(page) {
  return page.evalCheckedValue(`(() => {
    const summarizeCell = (el) => el ? ({
      x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), className: el.className || '', tileId: el.dataset.tileId || '',
      semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', glyph: el.dataset.glyph || '',
      aria: el.getAttribute('aria-label') || '', text: el.textContent || ''
    }) : null;
    const hero = Array.from(document.querySelectorAll('.tile-cell')).find((el) => ['hero', 'player'].includes(el.dataset.semanticKind));
    const tip = document.getElementById('map-tooltip');
    const icon = tip?.querySelector('.map-tooltip-icon');
    const avatar = document.querySelector('.player-avatar-display');
    const img = avatar?.querySelector('.player-avatar-image');
    return {
      status: document.getElementById('status')?.textContent || '',
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
      messages: window.__nethackPromptTest?.messages?.().slice(-20).map((m) => m.text || String(m)) || [],
      running: window.__nethackAutomation?.state?.().runningState?.running || false,
      recovery: window.__nethackAutomation?.recoveryState?.() || null,
      hero: summarizeCell(hero),
      tooltip: { hidden: !tip || tip.hidden, text: tip?.innerText || '', title: document.getElementById('map-tooltip-title')?.textContent || '', description: document.getElementById('map-tooltip-description')?.textContent || '', assetId: tip?.dataset?.assetId || '', iconImage: icon?.style?.backgroundImage || '' },
      interaction: window.__nethackPromptTest?.dialog?.(),
      equipment: window.__nethackPromptTest?.equipment?.(),
      avatar: avatar ? { tileId: avatar.dataset.tileId || '', source: avatar.dataset.avatarSource || '', src: avatar.dataset.avatarSrc || img?.getAttribute('src') || '', aria: avatar.getAttribute('aria-label') || '' } : null,
      mapMode: document.body.dataset.uxMapMode || '',
      minimap: (() => {
        const element = document.querySelector('.ux-minimap-button');
        const box = element?.getBoundingClientRect();
        return { exists: Boolean(element), hidden: element?.hidden ?? true, connected: element?.isConnected ?? false, width: box?.width || 0 };
      })(),
      body: document.body.innerText,
      seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
      shim: document.getElementById('shim-output')?.innerText || ''
    };
  })()`);
}

async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-loaded-hero-avatar-regression-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
function recordJsonSidecars(qc, outDir) {
  for (const name of fs.readdirSync(outDir)) {
    if (!name.endsWith('.json') || name === 'evidence-approval.json') continue;
    const file = path.join(outDir, name);
    if (!fs.statSync(file).isFile()) continue;
    qc.recordLog({ id: `sidecar-${name.replace(/[^a-z0-9._-]+/gi, '-')}`, path: file, classification: 'scenario-state' });
  }
}

async function main() {
  playground = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-loaded-avatar-'));
  resetPlayground();
  const createdSave = await createScenarioSave();
  assert.ok(createdSave.saveFiles.length > 0, 'scenario setup created a save file');
  const page = await Harness.createElectronBrowserDriver({
    root, width, height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_PLAYGROUND: playground, NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,disclose:+i +a +v +g +c +o' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const setupStdout = path.join(outDir, 'save-setup-stdout.log');
  const setupStderr = path.join(outDir, 'save-setup-stderr.log');
  fs.writeFileSync(setupStdout, createdSave.stdout || '');
  fs.writeFileSync(setupStderr, createdSave.stderr || '');
  let scenarioError = null;
  try {
    await cdp.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    await cdp.evalCheckedValue("saveSettings({ map: { mode: 'close', closeRows: 9, minimapSize: 'medium' } }); true");
    await cdp.send('Page.reload', { ignoreCache: true });
    await cdp.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    const startup = await waitFor(async () => {
      const s = await state(cdp);
      return s.dialogs.includes('startup-choice-dialog') && s.recovery?.hasContinue ? s : null;
    }, 10000);
    const startupShot = await shot(cdp, '01-loaded-save-startup-choice.png');
    await cdp.click('#startup-continue-game');
    const restored = await waitFor(async () => {
      const s = await state(cdp);
      const log = s.messages.join('\n');
      return s.running && s.hero?.tileId && /Restoring save file|Welcome back|Velkommen back/i.test(log) ? s : null;
    }, 30000);
    await cdp.evalCheckedValue(`(() => { document.getElementById('intro-dialog')?.close?.('test'); document.getElementById('document-dialog')?.close?.('test'); document.getElementById('game-grid')?.focus?.(); return true; })()`);
    await delay(300);
    const restoredPresentation = await state(cdp);
    assert.equal(restoredPresentation.mapMode, 'close', `continued game retained Close-up View: ${JSON.stringify(restoredPresentation)}`);
    assert.equal(restoredPresentation.minimap.exists && restoredPresentation.minimap.connected && !restoredPresentation.minimap.hidden && restoredPresentation.minimap.width > 0, true, `continued Close-up game restored its Minimap: ${JSON.stringify(restoredPresentation.minimap)}`);
    await hoverSelector(cdp, '.tile-cell[data-semantic-kind="hero"], .tile-cell[data-semantic-kind="player"]');
    const hovered = await waitFor(async () => { const s = await state(cdp); return !s.tooltip.hidden ? s : null; }, 5000);
    const hoverShot = await shot(cdp, '02-loaded-hero-hover-card.png');

    assert.ok(['hero', 'player'].includes(restored.hero.semanticKind), `continued hero semantic kind: ${JSON.stringify(restored.hero)}`);
    assert.equal(restored.hero.tileId, 'human-archeologist-male-avatar', `continued hero tile should use save-file combo identity, not stale neutral/full-source art: ${JSON.stringify(restored.hero)}`);
    assert.match(restored.hero.aria, /Archeologist|Hero|Player/i, `continued hero aria: ${JSON.stringify(restored.hero)}`);
    assert.doesNotMatch(`${restored.hero.aria}\n${restored.hero.tileId}\n${hovered.tooltip.text}`, /Werejackal|\bMonster\b.*Hero|full-source-monsters\/archeologist|data-tile-id="archeologist"/i, 'hero hover/card must not be monster-labeled or use full-source archeologist art');
    assert.match(hovered.tooltip.text, /Archeologist|Hero/i, `hero hover tooltip text: ${JSON.stringify(hovered.tooltip)}`);
    assert.doesNotMatch(hovered.tooltip.text, /Werejackal/i, `hero hover tooltip text: ${JSON.stringify(hovered.tooltip)}`);

    await cdp.pressKey('i', 'i');
    const equipment = await waitFor(async () => {
      const s = await state(cdp);
      return /Equipment\s*\/\s*Inventory/i.test(s.interaction?.title || '') && s.avatar?.tileId ? s : null;
    }, 12000);
    const equipmentShot = await shot(cdp, '03-loaded-hero-equipment-paper-doll.png');
    assert.equal(equipment.avatar.tileId, 'human-archeologist-male-avatar', `paper doll avatar: ${JSON.stringify(equipment.avatar)}`);
    assert.match(equipment.avatar.src, /player-combo-avatars\/human-archeologist-male-avatar\.png/i, `paper doll avatar src: ${JSON.stringify(equipment.avatar)}`);
    assert.doesNotMatch(`${equipment.avatar.tileId}\n${equipment.avatar.src}\n${equipment.avatar.aria}`, /full-source-monsters\/archeologist|werejackal|dwarf|\bmonster\b/i, `paper doll avatar must not use monster/full-source fallback: ${JSON.stringify(equipment.avatar)}`);
    assert.match(`${equipment.interaction?.panelControls?.text || ''}\n${equipment.body}`, /Hero equipment[\s\S]*pick-axe|Leather armor/i, 'loaded equipment screen shows deterministic scenario inventory');
    assert.doesNotMatch(`${equipment.body}\n${equipment.interaction?.panelControls?.text || ''}`, /Program in disorder|Please report these messages|Inventory selector|Name unavailable/i, 'no visible disorder/fallback labels in loaded equipment screen');
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  qc.recordAssertions([{ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' }]);
  qc.recordLog({ id: 'save-setup-stdout', path: setupStdout, classification: 'save-setup-stdout' });
  qc.recordLog({ id: 'save-setup-stderr', path: setupStderr, classification: 'save-setup-stderr' });
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  fs.rmSync(playground, { recursive: true, force: true });
  console.log(`real-loaded-hero-avatar-regression-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
