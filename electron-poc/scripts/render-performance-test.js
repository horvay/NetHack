const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const gameViewJs = fs.readFileSync(path.join(root, 'src', 'shared', 'game-view-state.js'), 'utf8');
const GameViewState = require('../src/shared/game-view-state');

const printGlyphBranch = gameViewJs.match(/} else if \(event\.name === 'shim_print_glyph'\) \{[\s\S]*?\n      } else if \(event\.name === 'shim_curs'\)/)?.[0] || '';
const displayBranch = gameViewJs.match(/} else if \(event\.name === 'shim_display_nhwindow'\) \{[\s\S]*?\n      } else if \(event\.name === 'shim_message_menu'\)/)?.[0] || '';

const staticChecks = [
  ['print_glyph marks dirty cells', /dirty-map-neighborhood/.test(printGlyphBranch) && /markMapCellNeighborhoodDirty\(item\.x, item\.y\)/.test(js)],
  ['print_glyph schedules coalesced render', /render-map/.test(printGlyphBranch) && /scheduleMapRender/.test(js)],
  ['print_glyph does not synchronously rebuild grid', !/renderGameGrid\(/.test(printGlyphBranch)],
  ['display_nhwindow flushes pending map render', /flush-map/.test(displayBranch) && /flushMapRenderNow\(\)/.test(js)],
  ['level reloads defer print_glyph renders until display_nhwindow', /mapRefreshPendingDisplay/.test(gameViewJs) && /deferMapRenderUntilDisplay/.test(printGlyphBranch)],
  ['main-to-renderer shim events are batchable', /pendingShimEventBatch/.test(fs.readFileSync(path.join(root, 'src', 'main', 'game-process.js'), 'utf8')) && /handleShimEvents/.test(js)],
  ['map event runs publish one shared presentation snapshot', /deferredGameViewEffects/.test(js) && /flushDeferredGameViewEffects/.test(js)],
  ['renderer exposes render instrumentation', /__nethackRenderStats/.test(js) && /dataset\.partialRenders/.test(js)],
  ['grid has stable element cache', /mapCellElements/.test(js) && /applyMapCellToElement/.test(js)],
];

function simulateBurst({ width = 80, height = 21, displayEvery = null } = {}) {
  let scheduled = false;
  let fullRenders = 1; // initial grid build
  let partialRenders = 0;
  const dirty = new Set();
  let rafCallbacks = 0;
  function mark(x, y) {
    if (x >= 0 && y >= 0 && x < width && y < height) dirty.add(`${x},${y}`);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    rafCallbacks += 1;
  }
  function flush() {
    if (!scheduled && !dirty.size) return;
    scheduled = false;
    if (dirty.size) {
      partialRenders += 1;
      dirty.clear();
    }
  }
  let n = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      mark(x, y); mark(x - 1, y); mark(x + 1, y); mark(x, y - 1); mark(x, y + 1);
      schedule();
      n += 1;
      if (displayEvery && n % displayEvery === 0) flush();
    }
  }
  flush();
  return { glyphs: n, fullRenders, partialRenders, rafCallbacks };
}

const clairvoyance = simulateBurst();
const chunked = simulateBurst({ displayEvery: 80 });
function simulateGameViewLevelReload() {
  const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
  view.process({ name: 'shim_create_nhwindow', return: 2, windowType: 3 });
  const clearEffects = view.process({ name: 'shim_clear_nhwindow', window: 2 }).effects.map((effect) => effect.type);
  const preDisplayEffects = [];
  for (let y = 0; y < 21; y += 1) {
    for (let x = 0; x < 80; x += 1) {
      const result = view.process({ name: 'shim_print_glyph', window: 2, x, y, char: '.', glyph: 3992, ttychar: '.', semanticKind: 'terrain', semanticName: 'room floor' });
      preDisplayEffects.push(...result.effects.map((effect) => effect.type));
    }
  }
  const displayEffects = view.process({ name: 'shim_display_nhwindow', window: 2, blocking: 0 }).effects.map((effect) => effect.type);
  const inLevelEffects = view.process({ name: 'shim_print_glyph', window: 2, x: 10, y: 10, char: '@', glyph: 725, ttychar: '@', semanticKind: 'hero', semanticName: 'hero' }).effects.map((effect) => effect.type);
  return {
    clearEffects,
    preDisplayRenderEffects: preDisplayEffects.filter((type) => type === 'render-map' || type === 'flush-map').length,
    preDisplayStatusEffects: preDisplayEffects.filter((type) => type === 'status').length,
    mapResetEffects: preDisplayEffects.filter((type) => type === 'map-reset').length,
    displayEffects,
    inLevelEffects,
  };
}

function simulateRapidActorMovement() {
  const view = GameViewState.createGameViewState({ mapWidth: 20, mapHeight: 10 });
  view.process({ name: 'shim_create_nhwindow', return: 2, windowType: 3 });
  view.process({ name: 'shim_print_glyph', window: 2, x: 5, y: 5, char: 'd', glyph: 1167, ttychar: 'd'.charCodeAt(0), semanticKind: 'monster', semanticName: 'dog', actorId: 'monster-17', backgroundGlyph: 3992, backgroundChar: '.', backgroundSemanticKind: 'terrain', backgroundSemanticName: 'room floor' });
  const moved = view.process({ name: 'shim_print_glyph', window: 2, x: 6, y: 5, char: 'd', glyph: 1167, ttychar: 'd'.charCodeAt(0), semanticKind: 'monster', semanticName: 'dog', actorId: 'monster-17', backgroundGlyph: 3992, backgroundChar: '.', backgroundSemanticKind: 'terrain', backgroundSemanticName: 'room floor' });
  return {
    oldCell: view.snapshot().mapCells[5][5],
    newCell: view.snapshot().mapCells[5][6],
    effects: moved.effects,
    visibleDogs: view.snapshot().mapCells.flat().filter((cell) => cell.actorId === 'monster-17' || (cell.semanticKind === 'monster' && cell.semanticName === 'dog')).length,
  };
}

const reload = simulateGameViewLevelReload();
const rapidActor = simulateRapidActorMovement();
const dynamicChecks = [
  ['synthetic 80x21 glyph burst coalesces to one partial render', clairvoyance.glyphs === 1680 && clairvoyance.partialRenders === 1 && clairvoyance.rafCallbacks === 1],
  ['line display flushes are bounded to display events not glyphs', chunked.partialRenders === 21 && chunked.partialRenders < chunked.glyphs / 10],
  ['game-view level reload suppresses pre-display map renders', reload.preDisplayRenderEffects === 0 && reload.clearEffects.includes('map-reset') && reload.mapResetEffects === 0 && reload.displayEffects.includes('flush-map')],
  ['game-view level reload emits one loading status instead of per-glyph status spam', reload.clearEffects.includes('status') && reload.preDisplayStatusEffects === 0],
  ['game-view in-level glyph updates still render incrementally', reload.inLevelEffects.includes('render-map') && reload.inLevelEffects.includes('dirty-map-neighborhood')],
  ['rapid actor updates clear the previous actor cell before rendering the new one', rapidActor.visibleDogs === 1 && rapidActor.oldCell.ch === '.' && rapidActor.oldCell.glyph === 3992 && rapidActor.newCell.actorId === 'monster-17' && rapidActor.effects.some((effect) => effect.type === 'dirty-map-neighborhood' && effect.x === 5 && effect.y === 5)],
];

const checks = [...staticChecks, ...dynamicChecks];
for (const [name, ok] of checks) console.log(`${ok ? 'ok' : 'not ok'} - ${name}`);
console.log(JSON.stringify({ clairvoyance, chunked, reload }, null, 2));
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`render performance checks failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
