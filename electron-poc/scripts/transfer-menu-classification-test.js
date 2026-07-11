const InteractionModel = require('../src/shared/interaction-model');

function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const inventoryWithBag = {
  prompt: 'Inventory:',
  how: 0,
  items: [
    { selector: 97, text: 'a - a lamp' },
    { selector: 98, text: 'b - a bag of holding' },
  ],
};

const readOnlyPlaceholderMenu = {
  prompt: 'Menu',
  how: 0,
  items: [
    { selector: 0, text: 'Container contents → Inventory / floor' },
    { selector: 0, text: 'Encumbrance/load preview unavailable placeholder' },
  ],
};

const explicitLootMenu = {
  prompt: 'Loot which items from the bag of holding?',
  how: 2,
  items: [
    { selector: 97, text: 'a - 2 arrows in a bag of holding' },
    { selector: 98, text: 'b - potion of healing inside bag' },
  ],
};

const shopPaymentMenu = {
  prompt: 'Pay which shop bill items?',
  how: 2,
  items: [
    { selector: 97, text: 'a - 2 unpaid food rations, 90 zorkmids' },
  ],
};

assert('inventory rows mentioning a bag are still inventory, not transfer', InteractionModel.menuKind(inventoryWithBag) === 'inventory', InteractionModel.menuKind(inventoryWithBag));
assert('read-only placeholder menu mentioning container/encumbrance is not transfer', InteractionModel.menuKind(readOnlyPlaceholderMenu) !== 'transfer', InteractionModel.menuKind(readOnlyPlaceholderMenu));
assert('explicit loot menu with selectable rows is transfer', InteractionModel.menuKind(explicitLootMenu) === 'transfer', InteractionModel.menuKind(explicitLootMenu));
assert('explicit shop bill menu with selectable rows is transfer', InteractionModel.menuKind(shopPaymentMenu) === 'transfer', InteractionModel.menuKind(shopPaymentMenu));
for (const prompt of ['What do you want to drop?', 'What do you want to quaff?', 'Pick up what?', 'Inventory:']) {
  const ordinaryMenuWithUnpaidItem = { prompt, how: prompt === 'Inventory:' ? 0 : 1, items: [{ selector: 97, text: 'a - a food ration (unpaid, 60 zorkmids)' }] };
  assert(`${prompt} with unpaid merchandise is not relabeled as payment`, InteractionModel.menuKind(ordinaryMenuWithUnpaidItem) !== 'transfer', InteractionModel.menuKind(ordinaryMenuWithUnpaidItem));
}

const identifyChooserMenu = {
  prompt: 'What would you like to identify next?',
  how: 2,
  items: [
    { selector: 111, text: 'o - a spellbook of identify' },
    { selector: 112, text: 'p - a shining spellbook' },
    { selector: 109, text: 'm - a towel' },
    { selector: 113, text: 'q - a blue gem' },
  ],
};

const spellCastMenu = {
  prompt: 'Choose which spell to cast',
  how: 1,
  items: [
    { selector: 97, text: 'a - force bolt  Pw 5  Fail 0%' },
    { selector: 98, text: 'b - healing  Pw 12  Fail 20%' },
  ],
};

const skillAdvanceMenu = {
  prompt: 'Enhance which skill?',
  how: 1,
  items: [
    { selector: 97, text: 'a - dagger Basic can advance cost 1' },
    { selector: 98, text: 'b - saber Restricted' },
  ],
};

assert('identify chooser with spellbook rows stays inventory, not spell/cast', InteractionModel.menuKind(identifyChooserMenu) === 'inventory', InteractionModel.menuKind(identifyChooserMenu));
assert('explicit cast menu remains spell', InteractionModel.menuKind(spellCastMenu) === 'spell', InteractionModel.menuKind(spellCastMenu));
assert('explicit skill enhance menu remains spell', InteractionModel.menuKind(skillAdvanceMenu) === 'spell', InteractionModel.menuKind(skillAdvanceMenu));
assert('tool rows classify as tool class', InteractionModel.menuItemClass({ text: 'j - a magic marker (0:45)' }) === 'tool', InteractionModel.menuItemClass({ text: 'j - a magic marker (0:45)' }));

console.log('transfer-menu-classification-test PASS');
