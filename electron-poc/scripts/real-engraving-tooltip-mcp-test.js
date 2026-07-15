const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = Number(process.env.NH_REAL_ENGRAVING_TOOLTIP_WIDTH || 1360);
const height = Number(process.env.NH_REAL_ENGRAVING_TOOLTIP_HEIGHT || 920);
const { delay, waitFor } = Harness;
const seed = String(process.env.NH_REAL_ENGRAVING_TOOLTIP_SEED || '424242');

async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function screenshot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
async function click(cdp, selector) {
  const point = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({ block: 'center', inline: 'center' }); const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  if (!point) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}
async function pressKey(cdp, { key, code, text = '', windowsVirtualKeyCode = 0 }) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, unmodifiedText: text, windowsVirtualKeyCode });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
}
async function typeText(cdp, text) { await cdp.send('Input.insertText', { text }); }
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText || '',
    messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || []
  }))()`);
}
async function startGame(cdp) {
  await cdp.startDefaultGame({ timeoutMs: 25000, playerName: 'BatchBProof' });
  await cdp.dismissIntroDialogs();
    await delay(500);
    await cdp.dismissIntroDialogs();
}
let assertionOutcomes = null;
function assert(name, ok, detail = '') {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outcome = { id, status: ok ? 'passed' : 'failed', details: ok ? '' : detail };
  const existing = assertionOutcomes?.find((entry) => entry.id === id);
  if (existing) Object.assign(existing, outcome); else assertionOutcomes?.push(outcome);
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-engraving-tooltip-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
  const page = await Harness.createElectronBrowserDriver({
    root, width, height,
    env: { NETHACK_SEED: seed, NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const outcomes = [];
  if (typeof assertionOutcomes !== 'undefined') assertionOutcomes = outcomes;
  let scenarioError = null;
  try {
    await startGame(cdp);
    let heroBefore = await waitFor(async () => evalExpr(cdp, `(() => {
      const cells = Array.from(document.querySelectorAll('.tile-cell'));
      const hero = cells.find((el) => el.dataset.semanticKind === 'hero' || el.classList.contains('cursor') || /hero|valkyrie/i.test(el.getAttribute('aria-label') || ''));
      if (!hero) return null;
      return { x: Number(hero.dataset.mapX), y: Number(hero.dataset.mapY) };
    })()`), 10000);
    const initialMove = await evalExpr(cdp, `(() => {
      const hero = { x: ${heroBefore.x}, y: ${heroBefore.y} };
      const keyFor = { '1,-1': 'u', '1,0': 'l', '1,1': 'n', '0,1': 'j', '-1,1': 'b', '-1,0': 'h', '-1,-1': 'y', '0,-1': 'k' };
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const el = document.querySelector('.tile-cell[data-map-x="' + (hero.x + dx) + '"][data-map-y="' + (hero.y + dy) + '"]');
        const hay = [el?.className || '', el?.dataset?.semanticKind || '', el?.dataset?.semanticName || '', el?.getAttribute?.('aria-label') || '', el?.dataset?.glyph || ''].join(' ');
        if (el && /terrain-floor|floor of a room|^\.$/.test(hay) && !/monster|pet|object|door|wall|water|lava|trap|stairs/i.test(hay)) return { dx, dy, key: keyFor[dx + ',' + dy] };
      }
      return null;
    })()`);
    if (initialMove) {
      await evalExpr(cdp, `document.getElementById('game-grid')?.focus?.()`);
      await pressKey(cdp, { key: initialMove.key, code: `Key${initialMove.key.toUpperCase()}`, text: initialMove.key, windowsVirtualKeyCode: initialMove.key.toUpperCase().charCodeAt(0) });
      await delay(400);
      heroBefore = await waitFor(async () => evalExpr(cdp, `(() => {
        const cells = Array.from(document.querySelectorAll('.tile-cell'));
        const hero = cells.find((el) => el.dataset.semanticKind === 'hero' || el.classList.contains('cursor') || /hero|valkyrie/i.test(el.getAttribute('aria-label') || ''));
        if (!hero) return null;
        return { x: Number(hero.dataset.mapX), y: Number(hero.dataset.mapY), initialMove: ${JSON.stringify(initialMove)} };
      })()`), 5000);
    }
    await evalExpr(cdp, `document.getElementById('game-grid')?.focus?.()`);
    await pressKey(cdp, { key: 'E', code: 'KeyE', text: 'E', windowsVirtualKeyCode: 69 });
    await waitFor(async () => /write with|engrave|write/i.test((await state(cdp)).body), 7000);
    if (/write with/i.test((await state(cdp)).body)) {
      await pressKey(cdp, { key: '-', code: 'Minus', text: '-', windowsVirtualKeyCode: 189 });
    }
    await waitFor(async () => /what do you want to write|write in the dust|write\?/i.test((await state(cdp)).body), 7000);
    const freeTextScreenshot = await screenshot(cdp, '00-real-engraving-free-text-prompt.png');
    if (process.env.NH_REAL_FREE_TEXT_PROMPT_ONLY === '1') {
      const promptState = await evalExpr(cdp, `(() => ({ title:document.getElementById('interaction-title')?.textContent||'', prompt:document.getElementById('interaction-prompt')?.textContent||'', textEntry:!document.getElementById('interaction-text-row')?.hidden, textLabel:document.getElementById('interaction-text-label')?.textContent||'', inputVisible:Boolean(document.getElementById('interaction-text')?.getClientRects?.().length), sent:window.__nethackPromptTest?.sentInputs?.().join('')||'' }))()`);
      assert('real engraving command opens a free-text prompt', promptState.textEntry && promptState.inputVisible && /engrave|write/i.test(`${promptState.title}\n${promptState.prompt}`), JSON.stringify(promptState));
    } else {
      await typeText(cdp, 'AI ORG');
      await pressKey(cdp, { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await waitFor(async () => {
        const s = await state(cdp);
        return /write|engrave|dust|AI ORG/i.test(`${s.body}\n${s.messages.join('\n')}`) ? s : null;
      }, 10000);
      const move = await waitFor(async () => evalExpr(cdp, `(() => {
        const hero = { x: ${heroBefore.x}, y: ${heroBefore.y} };
        const keyFor = { '1,-1': 'u', '1,0': 'l', '1,1': 'n', '0,1': 'j', '-1,1': 'b', '-1,0': 'h', '-1,-1': 'y', '0,-1': 'k' };
        const candidates = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
        for (const [dx, dy] of candidates) {
          const el = document.querySelector('.tile-cell[data-map-x="' + (hero.x + dx) + '"][data-map-y="' + (hero.y + dy) + '"]');
          const hay = [el?.className || '', el?.dataset?.semanticKind || '', el?.dataset?.semanticName || '', el?.getAttribute?.('aria-label') || '', el?.dataset?.glyph || ''].join(' ');
          if (el && (/terrain-floor|adjacent-move-target|floor of a room|^\.$/.test(hay)) && !/monster|pet|object|door|wall|water|lava|trap/i.test(hay)) return { dx, dy, key: keyFor[dx + ',' + dy] };
        }
        return null;
      })()`), 10000).catch(() => ({ dx: 1, dy: 0, key: 'l', fallback: true }));
      await evalExpr(cdp, `document.getElementById('game-grid')?.focus?.()`);
      await pressKey(cdp, { key: move.key, code: `Key${move.key.toUpperCase()}`, text: move.key, windowsVirtualKeyCode: move.key.toUpperCase().charCodeAt(0) });
      const readTargetCell = () => evalExpr(cdp, `(() => {
        const el = document.querySelector('.tile-cell[data-map-x="${heroBefore.x}"][data-map-y="${heroBefore.y}"]');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '',
          glyphNumber: el.dataset.glyphNumber || '', cmapIndex: el.dataset.cmapIndex || '', tileId: el.dataset.tileId || '',
          semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || '',
          className: el.className || '', rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 }
        };
      })()`);
      let cell = await waitFor(readTargetCell, 10000);
      for (let attempt = 0; attempt < 4 && cell && !/engraving/i.test(`${cell.tileId} ${cell.semanticKind} ${cell.semanticName} ${cell.aria}`) && /pet|monster|hero|player/i.test(`${cell.semanticKind} ${cell.aria}`); attempt += 1) {
        await evalExpr(cdp, `document.getElementById('game-grid')?.focus?.()`);
        await pressKey(cdp, { key: move.key, code: `Key${move.key.toUpperCase()}`, text: move.key, windowsVirtualKeyCode: move.key.toUpperCase().charCodeAt(0) });
        await delay(300);
        cell = await readTargetCell();
      }
      assert('real engraving cell found', cell && /engraving/i.test(`${cell.tileId} ${cell.semanticKind} ${cell.semanticName} ${cell.aria}`), JSON.stringify({ heroBefore, move, cell }));
      assert('real engraving not rendered as boulder', !/boulder/i.test(`${cell.tileId} ${cell.aria}`), JSON.stringify(cell));
      const beforeScreenshot = await screenshot(cdp, '00-real-map-before-engraving-hover.png');
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell.rect.centerX, y: cell.rect.centerY });
      await delay(300);
      const tooltip = await waitFor(async () => evalExpr(cdp, `(() => {
        const tip = document.getElementById('map-tooltip');
        const icon = document.getElementById('map-tooltip-icon');
        const title = document.getElementById('map-tooltip-title');
        const desc = document.getElementById('map-tooltip-description');
        if (!tip || tip.hidden) return null;
        const rect = tip.getBoundingClientRect();
        return { hidden: tip.hidden, text: tip.innerText || '', title: title?.textContent || '', description: desc?.textContent || '', iconTileId: icon?.dataset?.tileId || '', iconImage: icon?.style?.backgroundImage || '', rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
      })()`), 5000);
      assert('engraving tooltip identifies public feature', /engraving/i.test(`${tooltip.title} ${tooltip.text}`) && tooltip.iconTileId === 'engraving', JSON.stringify(tooltip));
      assert('engraving tooltip does not call it boulder', !/boulder/i.test(`${tooltip.title} ${tooltip.text} ${tooltip.iconImage}`), JSON.stringify(tooltip));
      const hoverScreenshot = await screenshot(cdp, '01-real-engraving-tooltip.png');
    }
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  outcomes.push({ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' });
  qc.recordAssertions(outcomes);
  recordJsonSidecars(qc, outDir);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-engraving-tooltip-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
