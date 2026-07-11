const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const actions = require('../src/shared/inventory-action-service');

function idsFor(text, selector = 110) {
  return actions.itemActionAffordances({ text, selector }).map((entry) => entry.id);
}
function labelsFor(text, selector = 110) {
  return actions.itemActionAffordances({ text, selector }).map((entry) => entry.label);
}
function groundLabelsFor(text, selector = 110, context = {}) {
  return actions.groundItemActionAffordances({ text, selector }, context).map((entry) => entry.label);
}
function groundIdsFor(text, selector = 110, context = {}) {
  return actions.groundItemActionAffordances({ text, selector }, context).map((entry) => entry.id);
}
function assertGroundIncludes(text, expectedLabels, context = {}, selector = 110) {
  const labels = groundLabelsFor(text, selector, context);
  for (const label of expectedLabels) assert(labels.includes(label), `${text} missing ground action ${label}; labels: ${labels.join(' | ')}`);
}

{
  const ids = idsFor('n - 5 darts');
  assert(ids.includes('item.wield.mainHand'), 'darts expose wield-in-main-hand action');
  assert(ids.includes('item.quiver'), 'darts expose ready-in-quiver action');
  assert(ids.includes('item.throw'), 'darts expose throw action');
  assert(ids.includes('item.drop'), 'darts expose drop action');
  const labels = labelsFor('n - 5 darts');
  assert(labels.includes('Wield in main hand'));
  assert(labels.includes('Ready in quiver'));
}
{
  const route = actions.routeEquipmentDrop({ text: 'n - 5 darts', selector: 110 }, { id: 'main-hand', label: 'Weapon / main hand' });
  assert.equal(route.ok, true);
  assert.equal(route.actionId, 'item.wield.mainHand');
  assert.equal(route.command, 'wn');
}
{
  const route = actions.routeEquipmentDrop({ text: 'n - 5 darts', selector: 110 }, { id: 'quiver', label: 'Quiver / ammo' });
  assert.equal(route.ok, true);
  assert.equal(route.actionId, 'item.quiver');
  assert.equal(route.command, 'Qn');
}
{
  const route = actions.routeEquipmentDrop({ text: 'd - an uncursed food ration', selector: 100 }, { id: 'helmet', label: 'Helmet / head' });
  assert.equal(route.ok, false);
  assert.match(route.reason, /does not match|Only/);
}
{
  const swap = actions.equipmentSlotActionAffordances(
    { id: 'offhand', item: { text: 'b - a +0 dagger (alternate weapon; not wielded)', selector: 98 } },
    { items: [{ text: 'a - a +1 spear (weapon in hand)', selector: 97 }, { text: 'b - a +0 dagger (alternate weapon; not wielded)', selector: 98 }] },
  );
  assert.equal(swap.length, 1);
  assert.equal(swap[0].id, 'slot.swapMainAlternate');
  assert.equal(swap[0].label, 'Swap with alternate weapon');
  assert.equal(swap[0].execution.keys, 'x');
  const route = actions.routeEquipmentSlotAction('slot.swapMainAlternate', { id: 'offhand' }, { items: [{ text: 'b - a +0 dagger (alternate weapon; not wielded)' }] });
  assert.equal(route.ok, true);
  assert.equal(route.command, 'x');
  assert.equal(route.refreshInventory, true);
}
{
  const swap = actions.equipmentSlotActionAffordances({ id: 'main-hand', item: { text: 'a - a spear (weapon in hand)' } }, { items: [{ text: 'a - a spear (weapon in hand)' }] });
  assert.equal(swap.length, 0, 'no visible swap affordance when no alternate weapon is known');
  const route = actions.routeEquipmentSlotAction('slot.swapMainAlternate', { id: 'main-hand' }, { items: [{ text: 'a - a spear (weapon in hand)' }] });
  assert.equal(route.ok, false);
  assert.match(route.reason, /No alternate weapon/i);
}
{
  const layeredEvents = fs.readFileSync(path.join(__dirname, '../test/fixtures/armor-layered-inventory-events.jsonl'), 'utf8')
    .trim().split(/\n+/).map((line) => JSON.parse(line));
  const cloakOverSuitFixture = layeredEvents
    .filter((event) => event.name === 'shim_add_menu')
    .map((event) => ({ text: event.text, selector: event.selector }));
  const route = actions.armorSwapRouteForItem(cloakOverSuitFixture.find((item) => /splint mail/i.test(item.text)), { items: cloakOverSuitFixture });
  assert.equal(route.ok, true);
  assert.equal(route.command, 'TdTcWp');
  assert.deepEqual(route.takeOffSelectors, ['d', 'c']);
  assert.deepEqual(route.blockerTokens, ['blocked.armor.cloakOverBody', 'blocked.armor.slotOccupied']);
  assert(route.blockerLabels.some((label) => /cloak covers body armor/i.test(label)), 'armor route exposes player-facing cloak-over-body blocker label');
  assert.match(route.message, /cloak of protection.*ring mail.*splint mail/i);
}
{
  const layeredEvents = fs.readFileSync(path.join(__dirname, '../test/fixtures/armor-layered-inventory-events.jsonl'), 'utf8')
    .trim().split(/\n+/).map((line) => JSON.parse(line));
  const shirtUnderSuitFixture = layeredEvents
    .filter((event) => event.name === 'shim_add_menu')
    .map((event) => ({ text: event.text, selector: event.selector }));
  const route = actions.armorSwapRouteForItem(shirtUnderSuitFixture.find((item) => /Hawaiian shirt/i.test(item.text)), { items: shirtUnderSuitFixture });
  assert.equal(route.ok, true);
  assert.equal(route.command, 'TdTcTrWq');
  assert.deepEqual(route.takeOffSelectors, ['d', 'c', 'r']);
  assert(route.blockerTokens.includes('blocked.armor.bodyOverShirt'), 'shirt replacement exposes body-over-shirt blocker token');
  assert(route.blockerTokens.includes('blocked.armor.removeOuterFirst'), 'shirt replacement exposes public remove-outer-first token for outer layers');
  assert.equal(actions.armorSlotForItem('q - a Hawaiian shirt'), 'shirt');
}
{
  const items = [
    { text: 'c - an uncursed ring mail (being worn)', selector: 99 },
    { text: 'd - an uncursed cloak of protection (being worn)', selector: 100 },
    { text: 'm - a +0 helmet (being worn)', selector: 109 },
    { text: 'n - a +1 dwarvish iron helm', selector: 110 },
    { text: 'o - a pair of leather gloves', selector: 111 },
  ];
  const helmetRoute = actions.armorSwapRouteForItem(items.find((item) => /dwarvish iron helm/i.test(item.text)), { items });
  assert.equal(helmetRoute.ok, true);
  assert.equal(helmetRoute.command, 'TmWn', 'helmet replacement must not remove worn cloak or suit body layers');
  assert.deepEqual(helmetRoute.takeOffSelectors, ['m']);
  const glovesAction = actions.primaryEquipmentActionForItem(items.find((item) => /leather gloves/i.test(item.text)), { items });
  assert.equal(glovesAction.command, 'Wo', 'new non-body armor with no same-slot item wears directly despite worn body layers');
}
{
  const emptyHandsRingAction = actions.primaryEquipmentActionForItem(
    { text: 'd - an uncursed ring of protection', selector: 100 },
    { items: [] },
  );
  assert.equal(emptyHandsRingAction.command, 'Pdl', 'ring primary action answers NetHack hand prompt with left hand when both fingers are empty');
  assert.equal(emptyHandsRingAction.ringHand, 'l');
  assert.equal(emptyHandsRingAction.autoAnswerHand, true);
  assert.match(emptyHandsRingAction.message, /left hand/i);
  const rightOccupiedRingAction = actions.primaryEquipmentActionForItem(
    { text: 'd - an uncursed ring of protection', selector: 100 },
    { items: [{ text: 'e - a ring of gain strength (on right hand)', selector: 101 }] },
  );
  assert.equal(rightOccupiedRingAction.command, 'Pd', 'ring primary action does not queue a stray hand key when NetHack will auto-use the only empty finger');
  assert.equal(rightOccupiedRingAction.ringHand, 'l');
  assert.equal(rightOccupiedRingAction.autoAnswerHand, false);
  const leftOccupiedRingAction = actions.primaryEquipmentActionForItem(
    { text: 'd - an uncursed ring of protection', selector: 100 },
    { items: [{ text: 'e - a ring of gain strength (on left hand)', selector: 101 }] },
  );
  assert.equal(leftOccupiedRingAction.command, 'Pd', 'left occupied means NetHack auto-uses right without a GUI/user prompt');
  assert.equal(leftOccupiedRingAction.ringHand, 'r');
  const bothOccupiedContextAction = actions.itemActionAffordances(
    { text: 'd - an uncursed ring of protection', selector: 100 },
    { items: [{ text: 'e - a ring of gain strength (on left hand)', selector: 101 }, { text: 'f - a ring of adornment (on right hand)', selector: 102 }] },
  ).find((entry) => entry.id === 'item.putOn.ring');
  assert.equal(bothOccupiedContextAction.enabled, false, 'both occupied ring fingers expose a disabled public blocker action instead of routing replacement');
  assert.equal(bothOccupiedContextAction.disabledReasonToken, 'blocked.ring.bothOccupied');
  assert.match(bothOccupiedContextAction.disabledReasonLabel, /Both ring slots are occupied/i);
  const bothOccupiedRingAction = actions.primaryEquipmentActionForItem(
    { text: 'd - an uncursed ring of protection', selector: 100 },
    { items: [{ text: 'e - a ring of gain strength (on left hand)', selector: 101 }, { text: 'f - a ring of adornment (on right hand)', selector: 102 }] },
  );
  assert.equal(bothOccupiedRingAction.enabled, false, 'GUI primary put-on remains visible but disabled when both ring fingers are occupied');
  assert.equal(bothOccupiedRingAction.command, '', 'disabled GUI primary put-on does not route replacement when both ring fingers are occupied');
  assert.equal(bothOccupiedRingAction.disabledReasonToken, 'blocked.ring.bothOccupied');
  const leftDrop = actions.routeEquipmentDrop({ text: 'd - an uncursed ring of protection', selector: 100 }, { id: 'left-ring', label: 'Left ring' }, { items: [] });
  assert.equal(leftDrop.command, 'Pdl', 'dropping onto left ring with both fingers empty targets the left hand');
  assert.equal(leftDrop.actionId, 'item.putOn.ring');
  assert.equal(leftDrop.ringHand, 'l');
  const rightDrop = actions.routeEquipmentDrop({ text: 'd - an uncursed ring of protection', selector: 100 }, { id: 'right-ring', label: 'Right ring' }, { items: [] });
  assert.equal(rightDrop.command, 'Pdr', 'dropping the first ring onto right ring targets right, not the automatic left-first route');
  assert.equal(rightDrop.ringHand, 'r');
  const leftOccupiedDrop = actions.routeEquipmentDrop({ text: 'd - an uncursed ring of protection', selector: 100 }, { id: 'right-ring', label: 'Right ring' }, { items: [{ text: 'e - a ring of gain strength (on left hand)', selector: 101 }] });
  assert.equal(leftOccupiedDrop.command, 'Pd', 'with left occupied and right targeted, selector only is safe because NetHack auto-selects the only empty finger');
  assert.equal(leftOccupiedDrop.ringHand, 'r');
  const rightOccupiedDrop = actions.routeEquipmentDrop({ text: 'd - an uncursed ring of protection', selector: 100 }, { id: 'right-ring', label: 'Right ring' }, { items: [{ text: 'e - a ring of gain strength (on right hand)', selector: 101 }] });
  assert.equal(rightOccupiedDrop.ok, false, 'dropping onto an occupied right-ring target rejects instead of silently using left');
  assert.equal(rightOccupiedDrop.reasonToken, 'blocked.ring.rightOccupied');
  assert.match(rightOccupiedDrop.reason, /right ring slot is occupied/i);
  const targetedFollowupRoute = actions.routeInventoryAction({ text: 'd - an uncursed ring of protection', selector: 100 }, { id: 'item.putOn.ring', params: { targetRingHand: 'r' } }, { items: [] });
  assert.equal(targetedFollowupRoute.command, 'Pdr', 'right-ring slot button/follow-up selection preserves right-hand target intent');
  const contextAction = actions.itemActionAffordances({ text: 'd - an uncursed ring of protection', selector: 100 }, { items: [] }).find((entry) => entry.id === 'item.putOn.ring');
  assert.equal(contextAction.execution.keys, 'Pdl', 'context-menu ring action keeps normal GUI automatic left-first route when no slot is explicitly targeted');
  const route = actions.routeInventoryAction({ text: 'd - an uncursed ring of protection', selector: 100 }, contextAction, { items: [] });
  assert.equal(route.command, 'Pdl', 'inventory action router auto-answers ring hand for non-slot-specific GUI action execution');
  assert(!idsFor('c - an uncursed ring mail').includes('item.putOn.ring'), 'ring mail is armor and must not expose ring put-on actions');
  const ringMailDrop = actions.routeEquipmentDrop({ text: 'c - an uncursed ring mail', selector: 99 }, { id: 'left-ring', label: 'Left ring' }, { items: [] });
  assert.equal(ringMailDrop.ok, false, 'ring mail cannot be dropped onto ring fingers as a ring');
  const keyRingDrop = actions.routeEquipmentDrop({ text: 'k - a key ring', selector: 107 }, { id: 'left-ring', label: 'Left ring' }, { items: [] });
  assert.equal(keyRingDrop.ok, false, 'key ring cannot be dropped onto ring fingers as jewelry');
  const meatRingDrop = actions.routeEquipmentDrop({ text: 'm - an uncursed meat ring', selector: 109 }, { id: 'right-ring', label: 'Right ring' }, { items: [] });
  assert.equal(meatRingDrop.ok, false, 'meat ring cannot be dropped onto ring fingers as jewelry');
  assert(!idsFor('m - an uncursed meat ring').includes('item.putOn.ring'), 'meat ring is food, not wearable jewelry');
  assert(!idsFor('k - a key ring').includes('item.putOn.ring'), 'key ring is a tool, not wearable jewelry');
  const shieldBlocksTwoHanded = actions.itemActionAffordances(
    { text: 'o - a quarterstaff', selector: 111 },
    { items: [{ text: 'g - an uncursed small shield (being worn)', selector: 103 }] },
  ).find((entry) => entry.id === 'item.wield.mainHand');
  assert.equal(shieldBlocksTwoHanded.enabled, false, 'visible shield blocks GUI direct wield of public two-handed weapon');
  assert.equal(shieldBlocksTwoHanded.disabledReasonToken, 'blocked.hands.shieldEquipped');
  const blockedOffhandDrop = actions.routeEquipmentDrop(
    { text: 'o - a quarterstaff', selector: 111 },
    { id: 'offhand', label: 'Alternate / offhand' },
    { items: [{ text: 'g - an uncursed small shield (being worn)', selector: 103 }] },
  );
  assert.equal(blockedOffhandDrop.ok, false);
  assert.equal(blockedOffhandDrop.reasonToken, 'blocked.hands.shieldEquipped');
  const quiverReplace = actions.routeEquipmentDrop(
    { text: 'n - 5 darts', selector: 110 },
    { id: 'quiver', label: 'Quiver / ammo' },
    { items: [{ text: 'l - 12 arrows (in quiver)', selector: 108 }] },
  );
  assert.equal(quiverReplace.ok, true);
  assert.equal(quiverReplace.reasonToken, 'blocked.hands.quiverOccupied');
  assert.match(quiverReplace.reasonLabel, /Quiver occupied/i);
  for (const appearance of ['granite ring', 'copper ring', 'gold ring', 'shiny ring']) {
    const appearanceAction = actions.itemActionAffordances({ text: `x - an uncursed ${appearance}`, selector: 120 }, { items: [] }).find((entry) => entry.id === 'item.putOn.ring');
    assert(appearanceAction?.enabled !== false, `${appearance} is a valid unidentified NetHack ring appearance`);
    const appearanceDrop = actions.routeEquipmentDrop({ text: `x - an uncursed ${appearance}`, selector: 120 }, { id: 'right-ring', label: 'Right ring' }, { items: [] });
    assert.equal(appearanceDrop.command, 'Pxr', `${appearance} can be targeted to the right ring slot`);
  }
}
{
  const corePotion = { text: 'p - a milky liquid', selector: 112, actionAffordances: ['quaff', 'throw', 'drop'] };
  const potionActions = actions.itemActionAffordances(corePotion).map((entry) => entry.id);
  assert(potionActions.includes('item.quaff'), 'core potion token exposes Quaff without relying on identified text');
  assert(!potionActions.includes('item.dipInto'), 'core tokens do not invent unsafe dip routing without a potion-shaped public prompt');
  assert.equal(actions.routeInventoryAction(corePotion, actions.itemActionAffordances(corePotion).find((entry) => entry.id === 'item.quaff')).command, 'qp');
  const coreHelmet = { text: 'h - unknown headgear', selector: 104, actionAffordances: ['wear', 'wear.helmet', 'throw', 'drop'] };
  assert(actions.itemActionAffordances(coreHelmet).some((entry) => entry.id === 'item.wear'), 'core armor token exposes Wear');
  assert.equal(actions.armorSlotForItem(coreHelmet), 'helmet', 'core armor slot token maps to helmet slot without text guessing');
  assert.equal(actions.routeEquipmentDrop(coreHelmet, { id: 'helmet', label: 'Helmet / head' }).command, 'Wh', 'equipment drop accepts C-provided helmet slot token');
  assert.equal(actions.routeEquipmentDrop(coreHelmet, { id: 'boots', label: 'Boots' }).ok, false, 'equipment drop still rejects mismatched slot despite C wear token');
  const coreWand = { text: 'z - strange forked item', selector: 122, actionAffordances: ['zap', 'apply', 'engrave', 'drop'] };
  const wandLabels = actions.itemActionAffordances(coreWand).map((entry) => entry.label);
  assert(wandLabels.includes('Zap at target…'), 'core wand token exposes Zap even when text is not wand-like');
  assert(wandLabels.includes('Engrave / write with…'), 'core engrave token exposes write action');
  const unsafeRub = { text: 'l - strange item', selector: 108, actionAffordances: ['rub'] };
  assert(!actions.itemActionAffordances(unsafeRub).some((entry) => entry.id === 'item.rub'), 'core rub token alone is not accepted as a safe semantic #rub route');
  const lampRub = actions.itemActionAffordances({ text: 'l - an oil lamp', selector: 108, actionAffordances: ['rub'] }).find((entry) => entry.id === 'item.rub');
  assert(lampRub, 'public lamp row exposes safe item.rub');
  assert.equal(lampRub.execution.keys, '#rub\n', 'item.rub opens only NetHack #rub and does not append a selector');
  const lampRoute = actions.routeInventoryAction({ text: 'l - an oil lamp', selector: 108, actionAffordances: ['rub'] }, lampRub);
  assert.equal(lampRoute.command, '#rub\n');
  assert.equal(lampRoute.promptPolicy, 'netHack-owned-followup');
  assert.equal(lampRoute.target.location.kind, 'inventory');
  assert.equal(lampRoute.target.selector, 'l');
}
{
  assert(labelsFor('p - a potion of healing').includes('Quaff'));
  assert(labelsFor('s - a scroll labeled KIRJE').includes('Read'));
  assert(labelsFor('z - a wand of digging').includes('Zap at target…'));
  assert(labelsFor('a - an uncursed food ration').includes('Eat'));
  assert(labelsFor('b - a bag of holding').includes('Open / loot / apply'));
  assert(labelsFor('r - a ring of protection').includes('Put on ring…'));
  assert(labelsFor('m - a +0 helmet').includes('Wear in matching slot'));
  assert(labelsFor('s - a scroll labeled KIRJE').includes('Wield / hold in hands'), 'generic NetHack itemactions wield/hold is exposed for non-weapons too');
  assert(labelsFor('g - a gray stone').includes('Rub'), 'public gray-stone appearance exposes safe #rub prompt routing without inferring touchstone/luckstone/loadstone identity');
  assert(labelsFor('g - a touchstone').includes('Rub'), 'publicly named stones expose safe #rub prompt routing without choosing a second target');
  assert(labelsFor('l - a lamp').includes('Rub'), 'public lamp appearance exposes safe #rub prompt routing');
  assert(!labelsFor('m - a magic marker').includes('Rub'), 'magic marker does not expose #rub because NetHack #rub accepts lamps/lanterns/stones, not markers');
  assert(!labelsFor('t - a towel').includes('Rub'), 'towel does not expose #rub because NetHack #rub accepts lamps/lanterns/stones, not towels');
  assert(!labelsFor('r - a rock').includes('Rub'), 'ordinary rocks do not expose #rub as gray-stone/touchstone candidates');
  assert(labelsFor('z - a wand of digging').includes('Break wand'), 'wands expose apply/break and zap');
}
{
  const scroll = { text: 'j - a scroll labeled KIRJE', selector: 106 };
  const read = actions.itemActionAffordances(scroll).find((entry) => entry.id === 'item.read.scroll');
  assert.equal(read.execution.keys, 'rj', 'scroll context Read action targets the selected inventory letter directly');
  assert.equal(actions.routeInventoryAction(scroll, read).command, 'rj', 'scroll Read route does not fall back to item-action picker');
  const dagger = { text: 'b - an uncursed dagger', selector: 98 };
  const drop = actions.itemActionAffordances(dagger).find((entry) => entry.id === 'item.drop');
  const wield = actions.itemActionAffordances(dagger).find((entry) => entry.id === 'item.wield.mainHand');
  const throwAction = actions.itemActionAffordances(dagger).find((entry) => entry.id === 'item.throw');
  assert.equal(actions.routeInventoryAction(dagger, drop).command, 'db', 'drop action targets the selected inventory letter directly');
  assert.equal(actions.routeInventoryAction(dagger, wield).command, 'wb', 'wield action targets the selected inventory letter directly');
  assert.equal(actions.routeInventoryAction(dagger, throwAction).command, 'tb', 'throw action targets the selected inventory letter directly before target follow-up');
  const helmet = { text: 'm - a +0 helmet', selector: 109 };
  const wear = actions.itemActionAffordances(helmet).find((entry) => entry.id === 'item.wear');
  assert.equal(actions.routeInventoryAction(helmet, wear).command, 'Wm', 'equipment context Wear action targets the selected inventory letter directly');
  const wornHelmet = { text: 'm - a +0 helmet (being worn)', selector: 109 };
  const takeOff = actions.itemActionAffordances(wornHelmet).find((entry) => entry.id === 'item.takeOff');
  assert.equal(actions.routeInventoryAction(wornHelmet, takeOff).command, 'Tm', 'equipment context Take off action targets the selected inventory letter directly');
}
{
  const food = groundLabelsFor('a - an uncursed food ration');
  assert(food.includes('Pick up'));
  assert(food.includes('Eat here'));
  assert(food.includes('Pick up, then Eat'));
  assert(food.includes('Pick up, then Wield / hold in hands'));
}
{
  const wand = groundLabelsFor('d - a wand of digging (0:4)');
  assert(wand.includes('Pick up, then Zap at target'));
  assert(wand.includes('Pick up, then Engrave / write with'));
  assert(wand.includes('Pick up, then Break wand'));
}
{
  const container = groundLabelsFor('c - a trapped locked large box');
  assert(container.includes('Open / loot here'));
  assert(container.includes('Force lock here'));
  assert(container.includes('Tip contents here'));
  assert(container.includes('Untrap container here'));
  const groundContainerActions = actions.groundItemActionAffordances({ text: 'c - a trapped locked large box', selector: 99 });
  const open = groundContainerActions.find((entry) => entry.id === 'ground.openContainer');
  const tip = groundContainerActions.find((entry) => entry.id === 'ground.tipContainer');
  const force = groundContainerActions.find((entry) => entry.id === 'ground.forceContainer');
  const untrap = groundContainerActions.find((entry) => entry.id === 'ground.untrapContainer');
  assert.deepEqual(open.promptPlan, ['netHack-owned-container-menu'], 'ground #loot advertises that follow-up menus/prompts are NetHack-owned, not preselected by the GUI');
  assert.deepEqual(tip.promptPlan, ['netHack-owned-tip-confirmation'], 'ground #tip advertises its confirmation/target prompts as NetHack-owned follow-up prompts');
  assert.deepEqual(force.promptPlan, ['netHack-owned-force-confirmation'], 'ground #force advertises its confirmation as a NetHack-owned follow-up prompt');
  assert.deepEqual(untrap.promptPlan, ['netHack-owned-untrap-followup'], 'ground #untrap advertises that direction/follow-up prompts are NetHack-owned, not auto-answered by the GUI');
  assert(!groundLabelsFor('c - a locked large box').includes('Untrap container here'), 'ground #untrap is exposed only when the visible ground row says trapped');
  const tokenOnlyContainer = actions.groundItemActionAffordances({ text: 'an ornate coffer', actionAffordances: ['container'] });
  assert(tokenOnlyContainer.some((entry) => entry.id === 'ground.openContainer'), 'public container token exposes ground #loot even when display text is not bag/box/chest-shaped');
}
{
  const corpse = groundLabelsFor('x - a lizard corpse', 120, { isOnAltar: true });
  assert(corpse.includes('Eat corpse here'));
  assert(corpse.includes('Offer corpse here'));
}
{
  const potionIds = groundIdsFor('p - a potion of healing');
  assert(potionIds.includes('ground.pickupThen.item.quaff'));
  assert(!potionIds.includes('ground.pickupThen.item.dipInto'), 'ground potion pickup-then dip is hidden until a safe route exists');
}
{
  assertGroundIncludes('w - a blessed +1 long sword', ['Pick up', 'Pick up, then Wield in main hand', 'Pick up, then Ready in quiver', 'Pick up, then Throw', 'Pick up, then Engrave / write with']);
  assertGroundIncludes('m - a +0 helmet', ['Pick up', 'Pick up, then Wear in matching slot', 'Pick up, then Wield / hold in hands', 'Pick up, then Throw']);
  assertGroundIncludes('r - a ring of protection', ['Pick up', 'Pick up, then Put on ring', 'Pick up, then Engrave / write with', 'Pick up, then Throw']);
  assertGroundIncludes('a - an amulet of reflection', ['Pick up', 'Pick up, then Put on amulet', 'Pick up, then Wield / hold in hands', 'Pick up, then Throw']);
  assertGroundIncludes('A - the Amulet of Yendor', ['Pick up', 'Offer amulet here', 'Pick up, then Invoke unique power'], { onAltar: true });
  assertGroundIncludes('s - a scroll labeled KIRJE', ['Pick up', 'Pick up, then Read', 'Pick up, then Wield / hold in hands', 'Pick up, then Throw']);
  assertGroundIncludes('b - a spellbook of force bolt', ['Pick up', 'Pick up, then Study / read book', 'Pick up, then Wield / hold in hands', 'Pick up, then Throw']);
  assertGroundIncludes('t - a towel', ['Pick up', 'Pick up, then Put on eyewear', 'Pick up, then Clean yourself', 'Pick up, then Wipe engraving with towel']);
  assertGroundIncludes('k - a skeleton key', ['Pick up', 'Pick up, then Use to pick a lock', 'Pick up, then Engrave / write with']);
  assertGroundIncludes('l - an oil lamp', ['Pick up', 'Pick up, then Light / extinguish']);
  assert(!groundLabelsFor('l - an oil lamp').includes('Pick up, then Rub'), 'ground lamp pickup-then rub is hidden until a safe #rub route exists');
  assertGroundIncludes('g - a touchstone', ['Pick up', 'Pick up, then Ready in quiver', 'Pick up, then Throw']);
  assert(!groundLabelsFor('g - a touchstone').includes('Pick up, then Rub item on stone'), 'ground gray-stone rub is hidden until a safe #rub route exists');
  assertGroundIncludes('z - 23 gold pieces', ['Pick up', 'Pick up, then Flip coin']);
  assertGroundIncludes('B - a boulder', ['Pick up', 'Kick / push heavy object', 'Pick up, then Wield / hold in hands', 'Pick up, then Throw']);
  assertGroundIncludes('v - a splash of venom', ['Pick up', 'Inspect ground item']);
}

console.log('inventory action service test passed');
