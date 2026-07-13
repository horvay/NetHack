#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_UXM04_EVIDENCE_DIR || path.join(root, 'test-output', 'uxm04-map-inspector');
const port = Number(process.env.NH_UXM04_CDP_PORT || 19904);
const { waitFor, delay } = Harness;

const profiles = Object.freeze([
  Object.freeze({ id: 'full-1360x920', windowWidth: 1360, windowHeight: 920, cssWidth: 1360, cssHeight: 920, dpr: 1, equivalentPercent: 100, zoomMethod: 'native Electron layout at captured window size' }),
  Object.freeze({ id: 'compact-960x720', windowWidth: 960, windowHeight: 720, cssWidth: 960, cssHeight: 720, dpr: 1, equivalentPercent: 100, zoomMethod: 'native Electron layout at captured window size' }),
  Object.freeze({ id: 'zoom-200pct-1360x920', windowWidth: 1360, windowHeight: 920, cssWidth: 680, cssHeight: 460, dpr: 2, equivalentPercent: 200, zoomMethod: '200%-equivalent CDP device-metrics emulation; not actual browser zoom' }),
]);

async function state(page) {
  return page.evalCheckedValue(`(() => {
    const controller = window.NetHackUxMapInspectorController;
    const selected = document.querySelector('#game-grid .ux-map-selected');
    const panel = document.querySelector('.ux-map-inspector');
    const grid = document.getElementById('game-grid');
    const body = document.body;
    return {
      running: Boolean(window.__nethackAutomation?.state?.().runningState?.running),
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      controller: Boolean(controller),
      active: Boolean(controller?.active?.()),
      selection: controller?.selection?.() || null,
      model: controller?.model?.() || null,
      selectedClass: selected?.className || '',
      panelHidden: Boolean(panel?.hidden),
      panelText: panel?.innerText || '',
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      cursor: (() => { const [x,y] = String(grid?.dataset?.cursor || '').split(',').map(Number); return Number.isInteger(x) && Number.isInteger(y) ? {x,y} : null; })(),
      messages: window.__nethackPromptTest?.messages?.().map((entry) => entry.text || String(entry)) || [],
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      overflow: { body: body.scrollWidth - body.clientWidth, playArea: document.getElementById('play-area')?.scrollWidth - document.getElementById('play-area')?.clientWidth },
      geometry: (() => {
        const rect = (node) => {
          if (!node) return null;
          const box = node.getBoundingClientRect();
          return { left:box.left, top:box.top, right:box.right, bottom:box.bottom, width:box.width, height:box.height, visible:box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight };
        };
        return {
          selected: rect(selected),
          inspector: rect(panel),
          surface: rect(document.querySelector('.ux-map-surface')),
          toolbar: rect(document.querySelector('.ux-map-toolbar')),
          kicker: rect(document.querySelector('.ux-map-inspector-kicker')),
          label: rect(document.querySelector('.ux-map-inspector-label')),
          facts: rect(document.querySelector('.ux-map-inspector-facts')),
          layers: rect(document.querySelector('.ux-map-inspector-layers')),
          actions: rect(document.querySelector('.ux-map-inspector-actions')),
          help: rect(document.querySelector('.ux-map-inspector-help')),
          grid: rect(grid),
        };
      })(),
      modes: { glyphs: grid.classList.contains('ux-map-glyph-overlay'), contrast: grid.classList.contains('ux-map-high-contrast') },
      runtimeDomains: window.NetHackUxRuntime?.runtime?.listDomains?.() || [],
      runtimeDiagnostics: window.NetHackUxRuntime?.runtime?.diagnostics?.() || [],
    };
  })()`);
}

async function clickCell(page, x, y, button = 'left') {
  const box = await page.evalCheckedValue(`(() => {
    const cell = document.querySelector('.tile-cell[data-map-x="${x}"][data-map-y="${y}"]');
    if (!cell) return null;
    cell.scrollIntoView({ block:'center', inline:'center' });
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!box) throw new Error(`missing map cell ${x},${y}`);
  if (button === 'right') {
    await page.evalCheckedValue(`(() => { const cell = document.querySelector('.tile-cell[data-map-x="${x}"][data-map-y="${y}"]'); cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, button:2, buttons:2, clientX:${box.x}, clientY:${box.y} })); return true; })()`);
  } else {
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button, buttons: 1, clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button, buttons: 0, clickCount: 1 });
  }
  await delay(120);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function assessPaint(file, current) {
  const assessed = spawnSync('python3', ['-c', [
    'from PIL import Image, ImageStat',
    'import json, sys',
    'im=Image.open(sys.argv[1]).convert("RGB")',
    'spec=json.loads(sys.argv[2])',
    'sx=im.width/spec["viewport"]["width"]',
    'sy=im.height/spec["viewport"]["height"]',
    'out={"image":{"width":im.width,"height":im.height},"regions":{},"ok":True,"errors":[]}',
    'for name in ("toolbar","inspector","kicker","label","facts","layers","actions","help","surface","selected"):',
    ' box=spec["geometry"].get(name)',
    ' if not box or box.get("width",0)<=0 or box.get("height",0)<=0:',
    '  if name != "help": out["ok"]=False; out["errors"].append(name+": missing DOM geometry")',
    '  continue',
    ' if name=="selected" and not box.get("visible",False): continue',
    ' pad=5 if name=="selected" else 0',
    ' crop=(max(0,min(im.width,round((box["left"]-pad)*sx))),max(0,min(im.height,round((box["top"]-pad)*sy))),max(0,min(im.width,round((box["right"]+pad)*sx))),max(0,min(im.height,round((box["bottom"]+pad)*sy))))',
    ' if crop[2]<=crop[0] or crop[3]<=crop[1]:',
    '  if name not in ("help","selected"): out["ok"]=False; out["errors"].append(name+": geometry outside screenshot")',
    '  continue',
    ' region=im.crop(crop)',
    ' pixels=list(region.getdata())',
    ' count=max(1,len(pixels))',
    ' nonblack=sum(1 for p in pixels if max(p)>4)/count',
    ' bright=sum(1 for p in pixels if max(p)>40)/count',
    ' mean=sum(sum(p)/3 for p in pixels)/count',
    ' out["regions"][name]={"box":crop,"nonBlackFraction":round(nonblack,6),"brightFraction":round(bright,6),"meanBrightness":round(mean,3)}',
    'for name,minimum in (("toolbar",0.70),("inspector",0.70),("kicker",0.70),("label",0.70),("facts",0.70),("layers",0.70),("actions",0.70),("surface",0.70)):',
    ' value=out["regions"].get(name,{}).get("nonBlackFraction",0)',
    ' if value<minimum: out["ok"]=False; out["errors"].append(f"{name}: non-black coverage {value} < {minimum}")',
    'if "help" in out["regions"] and out["regions"]["help"]["nonBlackFraction"]<0.70: out["ok"]=False; out["errors"].append("help: painted coverage is incomplete")',
    'if spec.get("requireSelectedRingPaint") and out["regions"].get("selected",{}).get("brightFraction",0)<0.005: out["ok"]=False; out["errors"].append("selected: ring lacks bright painted pixels")',
    'print(json.dumps(out))',
  ].join('\n'), file, JSON.stringify(current)], { encoding:'utf8' });
  if (assessed.status !== 0) throw new Error(`screenshot paint assessment failed: ${assessed.stderr || assessed.stdout}`);
  return JSON.parse(assessed.stdout);
}

async function settleForCapture(page) {
  await page.send('Page.bringToFront');
  return page.evalCheckedValue(`(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(Array.from(document.images).filter((image) => !image.complete).map((image) => new Promise((resolve) => {
      image.addEventListener('load', resolve, { once:true });
      image.addEventListener('error', resolve, { once:true });
    })));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return true;
  })()` , { awaitPromise:true });
}

async function capture(page, qc, profile, id, stateName, { resetScroll = true } = {}) {
  if (resetScroll) await page.evalCheckedValue("(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; const mainNode=document.querySelector('main'); const playNode=document.getElementById('play-area'); if (mainNode) mainNode.scrollTop=0; if (playNode) playNode.scrollTop=0; return true; })()");
  const captureId = `${profile.id}-${id}`;
  const attemptDir = path.join(outDir, 'capture-attempts', captureId);
  fs.mkdirSync(attemptDir, { recursive:true });
  const attempts = [];
  let accepted = null;
  let priorAcceptedHash = '';
  for (let index = 1; index <= 6; index += 1) {
    await settleForCapture(page);
    await delay(120);
    const current = await state(page);
    const attempt = path.join(attemptDir, `attempt-${String(index).padStart(2, '0')}.png`);
    /* Capture only after deterministic paint readiness. Structural raster checks and
       consecutive byte identity reject transient compositor damage; optimizeForSpeed
       also produces a conservatively encoded PNG for direct evidence review. */
    await page.screenshot(attempt, { fromSurface:true, optimizeForSpeed:true });
    const paint = assessPaint(attempt, { ...current, requireSelectedRingPaint:profile.equivalentPercent === 200 });
    const hash = sha256(attempt);
    const stableWithPrior = paint.ok && hash === priorAcceptedHash;
    attempts.push({ index, path:attempt, sha256:hash, paint, stableWithPrior });
    if (stableWithPrior) { accepted = { attempt, current, paint, hash, index }; break; }
    priorAcceptedHash = paint.ok ? hash : '';
  }
  const provenanceFile = path.join(attemptDir, 'capture-provenance.json');
  if (!accepted) {
    fs.writeFileSync(provenanceFile, `${JSON.stringify({
      schema:'uxm04-settled-capture/v1', captureId,
      method:'Page.captureScreenshot after fonts/images and three requestAnimationFrame paint checkpoints; accept only two consecutive byte-identical captures that each pass structural pixel-region checks',
      acceptedAttempt:null, attempts,
    }, null, 2)}\n`);
    throw new Error(`${captureId}: no two consecutive structurally complete settled captures; see ${provenanceFile}`);
  }
  const rawFile = qc.rawPath(captureId);
  const normalized = spawnSync('python3', ['-c', [
    'from PIL import Image, ImageChops',
    'import json, sys',
    'source=Image.open(sys.argv[1]).convert("RGB")',
    'source.save(sys.argv[2], format="PNG", compress_level=0, optimize=False)',
    'written=Image.open(sys.argv[2]).convert("RGB")',
    'print(json.dumps({"pixelIdentical":ImageChops.difference(source,written).getbbox() is None,"width":written.width,"height":written.height,"encoding":"RGB PNG, compression level 0"}))',
  ].join('\n'), accepted.attempt, rawFile], { encoding:'utf8' });
  if (normalized.status !== 0) throw new Error(`lossless canonical screenshot normalization failed: ${normalized.stderr || normalized.stdout}`);
  const canonicalNormalization = JSON.parse(normalized.stdout);
  if (!canonicalNormalization.pixelIdentical) throw new Error(`${captureId}: canonical PNG normalization changed pixels`);
  const canonicalRawSha256 = sha256(rawFile);
  fs.writeFileSync(provenanceFile, `${JSON.stringify({
    schema:'uxm04-settled-capture/v1', captureId,
    method:'Page.captureScreenshot after fonts/images and three requestAnimationFrame paint checkpoints; accept only two consecutive byte-identical captures that each pass structural pixel-region checks. The accepted raster is then losslessly normalized to uncompressed RGB PNG for deterministic direct-review decoding.',
    acceptedAttempt:accepted.index,
    acceptedCaptureSha256:accepted.hash,
    canonicalRaw:{ path:rawFile, sha256:canonicalRawSha256, ...canonicalNormalization },
    attempts,
  }, null, 2)}\n`);
  const frame = qc.recordCapture(captureId, rawFile, {
    viewport: {
      width: profile.windowWidth,
      height: profile.windowHeight,
      devicePixelRatio: 1,
      cssWidth: accepted.current.viewport.width,
      cssHeight: accepted.current.viewport.height,
      actualDevicePixelRatio: accepted.current.viewport.devicePixelRatio,
      equivalentPercent: profile.equivalentPercent,
      zoomMethod: profile.zoomMethod,
    },
    state: stateName,
    viewSafeFormat: 'BMP',
    viewSafeScale: profile.equivalentPercent === 200 ? 0.25 : 0.5,
  });
  return Object.freeze({ frame, captureProof:Object.freeze({ provenanceFile, acceptedAttempt:accepted.index, acceptedCaptureSha256:accepted.hash, canonicalRawSha256, canonicalNormalization, paint:accepted.paint }) });
}

function compareFrameStructure(left, right, current) {
  const compared = spawnSync('python3', ['-c', [
    'from PIL import Image, ImageChops',
    'import json, sys',
    'left=Image.open(sys.argv[1]).convert("RGB")',
    'right=Image.open(sys.argv[2]).convert("RGB")',
    'spec=json.loads(sys.argv[3])',
    'sx=left.width/spec["viewport"]["width"]; sy=left.height/spec["viewport"]["height"]',
    'out={"ok":True,"regions":{},"errors":[]}',
    'for name,limit in (("toolbar",0.30),("inspector",0.20),("surface",0.30)):',
    ' box=spec["geometry"].get(name)',
    ' crop=(max(0,round(box["left"]*sx)),max(0,round(box["top"]*sy)),min(left.width,round(box["right"]*sx)),min(left.height,round(box["bottom"]*sy)))',
    ' a=left.crop(crop); b=right.crop(crop)',
    ' pixels=list(ImageChops.difference(a,b).getdata()); count=max(1,len(pixels))',
    ' changed=sum(1 for p in pixels if max(p)>12)/count',
    ' out["regions"][name]={"changedFraction":round(changed,6),"limit":limit}',
    ' if changed>limit: out["ok"]=False; out["errors"].append(f"{name}: changed fraction {changed} > {limit}")',
    'print(json.dumps(out))',
  ].join('\n'), left, right, JSON.stringify(current)], { encoding:'utf8' });
  if (compared.status !== 0) throw new Error(`frame structure comparison failed: ${compared.stderr || compared.stdout}`);
  return JSON.parse(compared.stdout);
}

async function scrollIntoEvidenceView(page, selector) {
  await page.evalCheckedValue(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    const playArea = document.getElementById('play-area');
    const main = document.querySelector('main');
    if (playArea?.contains(node)) {
      if (node.classList.contains('ux-map-surface')) playArea.scrollTop = 0;
      else {
        const playBox = playArea.getBoundingClientRect();
        const nodeBox = node.getBoundingClientRect();
        playArea.scrollTop += nodeBox.top - playBox.top - Math.max(0, (playArea.clientHeight - Math.min(nodeBox.height, playArea.clientHeight)) / 2);
      }
    }
    if (main?.contains(node)) {
      const mainBox = main.getBoundingClientRect();
      const nodeBox = node.getBoundingClientRect();
      const align = node.classList.contains('ux-map-surface') ? 0 : Math.max(0, (main.clientHeight - Math.min(nodeBox.height, main.clientHeight)) / 2);
      main.scrollTop += nodeBox.top - mainBox.top - align;
    }
    return true;
  })()`);
  await delay(120);
  return state(page);
}

async function typedPublicPet(page) {
  return page.evalCheckedValue(`(() => {
    const snapshot = window.NetHackUxRuntime?.runtime?.latestPublicState?.()?.snapshot;
    const rows = snapshot?.game?.mapCells || [];
    const context = window.NetHackUxContextActionPresentation;
    for (let y = 0; y < rows.length; y += 1) {
      for (let x = 0; x < (rows[y] || []).length; x += 1) {
        const cell = rows[y][x] || {};
        const kind = String(cell.semanticKind || '').toLowerCase();
        const tokens = Array.isArray(cell.actionAffordances) ? cell.actionAffordances : [];
        const attitude = context?.attitudeFromPublicCell?.(cell);
        if ((kind === 'pet' || kind === 'monster') && attitude === 'tame' && (tokens.includes('monster.pet') || tokens.includes('monster.attitude.tame'))) {
          return { coord:{x,y}, semanticKind:kind, publicAttitude:attitude, actionAffordances:tokens.slice() };
        }
      }
    }
    return null;
  })()`);
}

async function run(profile, qc) {
  Harness.removeStalePlaygroundLocks({ root });
  const page = await Harness.createElectronBrowserDriver({ root, port, width: profile.windowWidth, height: profile.windowHeight });
  const result = { profile, checks: {}, frames: {}, captureProofs: {} };
  async function captureFrame(name, id, stateName, options) {
    const captured = await capture(page, qc, profile, id, stateName, options);
    result.frames[name] = captured.frame;
    result.captureProofs[name] = captured.captureProof;
  }
  try {
    await page.waitForRendererReady({ timeoutMs: 12000, promptTest: true, automation: true, startButton: true });
    if (profile.cssWidth !== profile.windowWidth || profile.dpr !== 1) await Harness.setViewport(page.cdp, { width: profile.cssWidth, height: profile.cssHeight, deviceScaleFactor: profile.dpr });
    await waitFor(async () => (await state(page)).controller, 5000);
    await page.startDefaultGame({ timeoutMs: 20000, playerName: `M${profile.equivalentPercent}${String(Date.now()).slice(-5)}` });
    await waitFor(async () => {
      const current = await state(page);
      return current.running && current.dialogs.includes('intro-dialog') ? current : null;
    }, 30000);
    await page.click('#intro-continue');
    const ready = await waitFor(async () => {
      const current = await state(page);
      return current.running && !current.dialogs.length && current.cursor?.x > 0 ? current : null;
    }, 12000);
    await page.evalCheckedValue("window.__nethackPromptTest.clearSentInputs(); window.NetHackUxMapInspectorController.applySettings({scale:1,glyphOverlay:false,highContrast:false}); document.getElementById('game-grid').focus(); true");
    const target = { x: Math.min(79, ready.cursor.x + 1), y: ready.cursor.y };
    if (profile.equivalentPercent === 200) {
      await scrollIntoEvidenceView(page, '.ux-map-surface');
      await page.evalCheckedValue("document.querySelector('.ux-map-inspect-toggle').click(); true");
    } else {
      await clickCell(page, target.x, target.y);
    }
    const selected = await state(page);
    if (profile.equivalentPercent === 200) {
      const contextVisible = await scrollIntoEvidenceView(page, '.ux-map-surface');
      result.checks.boundedInspectorContextVisible = Boolean(contextVisible.geometry.inspector?.visible && contextVisible.geometry.inspector.top >= 0 && contextVisible.geometry.inspector.bottom <= contextVisible.viewport.height);
      result.checks.selectedMapVisibleAt200PercentEquivalent = Boolean(contextVisible.geometry.selected?.visible);
      await captureFrame('selectedContext', '01-real-selected-context-and-map', 'REAL GAME: bounded 200%-equivalent selected-cell inspector, complete controls, map, and non-color hero-cell ring after entering Inspect', { resetScroll:false });
    } else {
      await captureFrame('selected', '01-real-click-selected', 'REAL GAME: ordinary map click selected a public cell without gameplay dispatch');
    }

    await page.evalCheckedValue("document.getElementById('game-grid').focus(); true");
    await page.pressKey('ArrowDown');
    await delay(120);
    const keyboard = await state(page);
    if (profile.equivalentPercent === 200) {
      const keyboardVisible = await scrollIntoEvidenceView(page, '#game-grid .ux-map-selected');
      result.checks.keyboardSelectedMapVisibleAt200PercentEquivalent = Boolean(keyboardVisible.geometry.selected?.visible);
      await captureFrame('keyboard', '02-real-keyboard-selected-map', 'REAL GAME: keyboard inspection moved the visible selected-cell ring in the 200%-equivalent profile', { resetScroll:false });
    } else {
      await captureFrame('keyboard', '02-real-keyboard-selected', 'REAL GAME: keyboard Inspect selection after ArrowDown');
    }

    const beforeLegibility = await state(page);
    if (!beforeLegibility.modes.glyphs) await page.evalCheckedValue("document.querySelector('.ux-map-glyph-toggle').click(); true");
    if (!beforeLegibility.modes.contrast) await page.evalCheckedValue("document.querySelector('.ux-map-contrast-toggle').click(); true");
    const legibility = await state(page);
    if (profile.equivalentPercent === 200) {
      const legibilityVisible = await state(page);
      result.checks.legibleSelectedMapVisibleAt200PercentEquivalent = Boolean(legibilityVisible.geometry.selected?.visible);
      await captureFrame('legibility', '03-real-glyph-high-contrast-map', 'REAL GAME: bounded inspector, selected map ring, classic glyphs, and high-contrast terrain visibly coexist in the 200%-equivalent profile', { resetScroll:false });
      const keyboardAgainst01 = compareFrameStructure(result.frames.keyboard.raw.path, result.frames.selectedContext.raw.path, keyboard);
      const keyboardAgainst03 = compareFrameStructure(result.frames.keyboard.raw.path, result.frames.legibility.raw.path, keyboard);
      result.frameComparisons = { keyboardAgainst01, keyboardAgainst03 };
      result.checks.keyboardFrameStructurallyMatchesFrames01And03 = keyboardAgainst01.ok && keyboardAgainst03.ok;
    } else {
      await captureFrame('legibility', '03-real-glyph-high-contrast', 'REAL GAME: classic glyph overlay and high-contrast terrain enabled');
    }

    const rightTarget = { x: Math.max(0, ready.cursor.x - 1), y: ready.cursor.y };
    if (profile.equivalentPercent !== 200) await clickCell(page, rightTarget.x, rightTarget.y, 'right');
    const rightClick = await state(page);

    if (profile.id === 'full-1360x920') {
      const pet = await typedPublicPet(page);
      if (!pet) throw new Error('full-1360x920: no explicitly typed tame public pet cell found');
      const creatureModel = await page.evalCheckedValue(`(() => {
        const controller = window.NetHackUxMapInspectorController;
        const context = window.NetHackUxContextActionPresentation;
        const coord = ${JSON.stringify(pet.coord)};
        controller.select(coord, { activate:true, focus:true });
        const initial = controller.model();
        const group = context.groupCreatureActions([{
          targetId:'public-pet-cell', publicLabel:initial.publicLabel, publicAttitude:${JSON.stringify(pet.publicAttitude)},
          publicActions:[
            { id:'creature.chat', label:'Chat', kind:'chat', dispatchToken:'monster.action.chat' },
            { id:'creature.attack', label:'Attack', kind:'attack', dispatchToken:'monster.action.attack' },
          ],
        }]);
        const actions = [group.primary, ...group.secondary, ...group.dangerous].filter(Boolean);
        controller.setActionProvider({
          actionsForCell: ({coord:selected}) => selected.x === coord.x && selected.y === coord.y ? actions : [],
          dispatch: () => {},
        });
        controller.select(coord, { activate:true, focus:true });
        return { model:controller.model(), group };
      })()`);
      result.checks.syntheticCreatureUsesTypedPublicPet = creatureModel.model?.publicAttitude === 'tame' && creatureModel.model?.stateCues?.includes('pet') && pet.semanticKind === 'pet';
      result.checks.syntheticCreatureChatPrimary = creatureModel.group?.primary?.label === 'Chat' && creatureModel.model?.publicActions?.[0]?.label === 'Chat';
      result.checks.syntheticCreatureAttackIsolatedDangerous = creatureModel.group?.dangerous?.length === 1 && creatureModel.group.dangerous[0].label === 'Attack' && creatureModel.model?.publicActions?.[1]?.danger === 'serious';
      await page.click('.ux-map-action-danger');
      const confirmingCreature = await state(page);
      result.checks.syntheticCreatureConfirmationNamesPet = confirmingCreature.panelText.includes(`Attack ${creatureModel.model.publicLabel}?`);
      await captureFrame('creature', '04-synthetic-typed-pet-danger', 'SYNTHETIC ACTION PROVIDER + REAL PUBLIC CELL: explicitly typed tame pet, Chat primary, isolated dangerous Attack, named confirmation; no dispatch adapter installed');
      await page.click('.ux-map-confirm-cancel');
      await page.evalCheckedValue(`(() => {
        const controller = window.NetHackUxMapInspectorController;
        const selection = controller.selection();
        controller.setActionProvider(null);
        controller.setTargetMetadata({ promptId:'synthetic-target-prompt', revision:1, candidates:[{ targetId:'synthetic-target', coord:selection, state:'unknown', publicLabel:controller.model().publicLabel }] });
        controller.select(selection, { activate:true, focus:true });
        return controller.model();
      })()`);
      const targetPreview = await state(page);
      result.checks.syntheticUnknownTargetTruthful = targetPreview.model?.mode === 'target' && targetPreview.model?.validation === 'core-will-validate' && /NetHack will validate this target/i.test(targetPreview.panelText);
      await captureFrame('target', '05-synthetic-unknown-target', 'SYNTHETIC PUBLIC MODEL: selected target remains unknown and says NetHack will validate');
    }

    await page.evalCheckedValue("document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs(); true");
    await page.pressKey('Escape');
    await delay(100);
    const escaped = await state(page);

    result.checks = {
      ...result.checks,
      realGameRunning: selected.running,
      mapDomainRegistered: selected.runtimeDomains.some((domain) => domain.id === 'map'),
      ordinaryClickSelectedOnly: profile.equivalentPercent === 200
        ? (selected.active && selected.selection?.x === ready.cursor.x && selected.selection?.y === ready.cursor.y && selected.sent === '')
        : (selected.active && selected.selection?.x === target.x && selected.selection?.y === target.y && selected.sent === ''),
      cursorDidNotMoveOnClick: selected.cursor?.x === ready.cursor.x && selected.cursor?.y === ready.cursor.y,
      keyboardSelectionTurnless: keyboard.selection?.y === Math.min(20, selected.selection.y + 1) && keyboard.sent === '' && keyboard.cursor?.x === ready.cursor.x && keyboard.cursor?.y === ready.cursor.y,
      rightClickParityTurnless: profile.equivalentPercent === 200 || (rightClick.selection?.x === rightTarget.x && rightClick.selection?.y === rightTarget.y && rightClick.sent === ''),
      escapeClosesInspectWithoutDungeonInput: !escaped.active && escaped.sent === '' && escaped.cursor?.x === ready.cursor.x && escaped.cursor?.y === ready.cursor.y,
      playerCopyHasNoDiagnostics: !/glyph\s+\d|map\s+\d+\s*,\s*\d+|asset|taxonomy|route preview|line preview/i.test(`${selected.panelText}\n${keyboard.panelText}\n${rightClick.panelText}`),
      publicSemanticLabelsUseSentenceCasing: !/Floor Of A Room|Vertical Closed Door/.test(`${selected.panelText}\n${keyboard.panelText}\n${rightClick.panelText}`),
      selectedHasNonColorGeometry: /ux-map-selected/.test(selected.selectedClass),
      glyphAndContrastAvailable: legibility.modes.glyphs && legibility.modes.contrast,
      noHorizontalPageOverflow: selected.overflow.body <= 1 && keyboard.overflow.body <= 1 && legibility.overflow.body <= 1,
      boundedInspectorContextVisible: profile.equivalentPercent !== 200 || result.checks.boundedInspectorContextVisible,
      noRuntimeRegistrationFailure: !selected.runtimeDiagnostics.some((entry) => /rejected|failed/.test(entry.type || '')),
    };
    const failures = Object.entries(result.checks).filter(([, value]) => !value).map(([name]) => name);
    if (failures.length) {
      fs.writeFileSync(path.join(outDir, `${profile.id}-failure-state.json`), `${JSON.stringify({ ready, selected, keyboard, legibility, rightClick, escaped, checks:result.checks }, null, 2)}\n`);
      throw new Error(`${profile.id}: ${failures.join(', ')}`);
    }
    result.finalState = await state(page);
    result.diagnostic = await page.evalCheckedValue('window.netHackPOC.activeDiagnosticRun()', { awaitPromise: true }).catch((error) => ({ error: error.message }));
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outDir, `${profile.id}-electron-stdout.log`), output.stdout);
    fs.writeFileSync(path.join(outDir, `${profile.id}-electron-stderr.log`), output.stderr);
    await page.close();
  }
  return result;
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir });
  const summary = {
    plan: 'NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11',
    chunk: 'UXM-04 protocol-independent candidate',
    port,
    outDir,
    zoomMethod: 'The zoom-200pct profile is 200%-equivalent CDP device-metrics emulation (680x460 CSS viewport, DPR 2, 1360x920 physical capture), not actual browser zoom.',
    runs: {},
  };
  const selectedProfiles = process.env.NH_UXM04_PROFILE ? profiles.filter((profile) => profile.id === process.env.NH_UXM04_PROFILE) : profiles;
  if (!selectedProfiles.length) throw new Error(`Unknown UXM-04 profile: ${process.env.NH_UXM04_PROFILE}`);
  for (const profile of selectedProfiles) summary.runs[profile.id] = await run(profile, qc);
  summary.qc = Harness.screenshotQc.validateManifest(qc.manifestFile);
  summary.manifest = qc.manifestFile;
  fs.writeFileSync(path.join(outDir, 'uxm04-map-inspector-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const lines = [
    '# UXM-04 map inspector evidence',
    '',
    `Output: ${outDir}`,
    `CDP port: ${port}`,
    '',
    'Zoom method: the zoom-200pct profile is **200%-equivalent** CDP device-metrics emulation (680x460 CSS viewport, DPR 2, 1360x920 physical capture), not actual browser zoom.',
    '',
  ];
  for (const [id, run] of Object.entries(summary.runs)) {
    lines.push(`## ${id}`);
    for (const [name, ok] of Object.entries(run.checks)) lines.push(`- ${ok ? 'PASS' : 'FAIL'} ${name}`);
    for (const [name, frame] of Object.entries(run.frames)) lines.push(`- ${name}: ${frame.derivative.path}`);
    lines.push('');
  }
  lines.push(`QC manifest: ${qc.manifestFile}`, '');
  fs.writeFileSync(path.join(outDir, 'uxm04-map-inspector-summary.md'), lines.join('\n'));
  console.log(lines.join('\n'));
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
