const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'test-output', 'motion-layout-regression');

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

async function main() {
  const result = await Harness.withElectronPage({
    root,
    outputDir,
    width: 1320,
    height: 880,
    timeoutMs: 20000,
  }, async (page) => {
    await page.waitForCheckedValue("Boolean(window.__nethackPromptTest && window.NetHackUxEquipmentScreen?.controller)", 10000);
    return page.evalCheckedValue(`(async () => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const t = window.__nethackPromptTest;
      t.reset();
      t.setRunning(true);
      const items = Object.freeze([
        Object.freeze({ selector: 97, inventoryLetter: 'a', objectId: 801, text: 'a - an uncursed dagger', displayName: 'an uncursed dagger', quantity: 1, glyphChar: 41, publicClass: 'weapon', semanticKind: 'object', semanticName: 'dagger', semanticKnown: true, actionAffordances: ['drop'] }),
        Object.freeze({ selector: 98, inventoryLetter: 'b', objectId: 802, text: 'b - a food ration', displayName: 'a food ration', quantity: 1, glyphChar: 37, publicClass: 'food', semanticKind: 'object', semanticName: 'food ration', semanticKnown: true, actionAffordances: ['eat', 'drop'] }),
      ]);
      const owner = window.NetHackUxEquipmentScreen.controller;
      owner.open({
        documentRoot: document,
        inventory: Object.freeze({ revision: 7301, orderedItems: items }),
        equipment: Object.freeze({ revision: 1, inventoryRevision: 7301, orderedSlots: Object.freeze([]) }),
        statusValues: Object.freeze([]),
        messages: Object.freeze([]),
        invoker: document.getElementById('inventory-equipment-button'),
        initialMode: 'inventory',
        onIntent: () => true,
      });
      await frame();
      await frame();
      const root = document.getElementById('ux-items-root');
      const workspace = root?.querySelector('.uxm-items-workspace');
      const inventory = {
        open: Boolean(root && !root.hidden && workspace),
        rootAnimations: root?.getAnimations().map((animation) => animation.animationName) || [],
        workspaceAnimations: workspace?.getAnimations().map((animation) => animation.animationName) || [],
        workspaceOpacity: workspace ? getComputedStyle(workspace).opacity : '',
        selectedFilterAnimations: root?.querySelector('.uxm-filter-button.is-selected')?.getAnimations().map((animation) => animation.animationName) || [],
        selectedItemAnimations: root?.querySelector('.uxm-item-row.is-selected')?.getAnimations().map((animation) => animation.animationName) || [],
      };
      window.NetHackUxEquipmentScreen.controller.close({ reason: 'motion-layout-regression', cancelNative: false });

      t.setContainerStateForTest({
        active: true,
        sessionKind: 'ground-pickup',
        phase: 'ground-snapshot',
        prompt: 'Pick up from ground',
        leftItems: [{ selector: 97, text: 'a - an orcish dagger', semanticKind: 'object', semanticName: 'orcish dagger' }],
        rightItems: [{ selector: 36, text: '$ - 4 gold pieces', semanticKind: 'gold', semanticName: 'gold pieces' }],
        loadedSides: { left: true, right: true },
      });
      await frame();
      const panel = document.getElementById('container-transfer-panel');
      const rect = panel?.getBoundingClientRect();
      const pickup = rect ? {
        centerDeltaX: rect.left + (rect.width / 2) - (innerWidth / 2),
        centerDeltaY: rect.top + (rect.height / 2) - (innerHeight / 2),
        contained: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        animationName: getComputedStyle(panel).animationName,
        transform: getComputedStyle(panel).transform,
      } : null;
      return { inventory, pickup };
    })()`, { awaitPromise: true });
  });

  assert('inventory workspace is open', result.inventory.open, JSON.stringify(result.inventory));
  assert('inventory child does not restart an opacity animation', result.inventory.workspaceAnimations.length === 0 && result.inventory.workspaceOpacity === '1', JSON.stringify(result.inventory));
  assert('stable inventory root owns the single entrance animation', result.inventory.rootAnimations.includes('ux-motion-enter-up'), JSON.stringify(result.inventory));
  assert('inventory opens without replaying persistent selection animations', result.inventory.selectedFilterAnimations.length === 0 && result.inventory.selectedItemAnimations.length === 0, JSON.stringify(result.inventory));
  assert('pickup panel is centered during entrance', result.pickup && Math.abs(result.pickup.centerDeltaX) <= 1 && Math.abs(result.pickup.centerDeltaY) <= 1, JSON.stringify(result.pickup));
  assert('pickup panel remains viewport-contained', result.pickup?.contained, JSON.stringify(result.pickup));
  assert('pickup panel uses center-preserving animation', result.pickup?.animationName === 'ux-motion-enter-centered-scale', JSON.stringify(result.pickup));

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
