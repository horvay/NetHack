const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bridge = fs.readFileSync(path.join(root, 'shim-bridge', 'nh-shim-bridge.c'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const gameViewState = fs.readFileSync(path.join(root, 'src', 'shared', 'game-view-state.js'), 'utf8');
const allmain = fs.readFileSync(path.join(root, '..', 'src', 'allmain.c'), 'utf8');
const InventorySnapshot = require('../src/shared/inventory-snapshot-adapter');

const unpaidSnapshot = InventorySnapshot.adaptShimInventoryUpdateToSnapshot({
  revision: 7,
  items: [
    { selector: 97, objectId: 101, text: 'a - an uncursed food ration (unpaid, 45 zorkmids)', quantity: 1, actionAffordances: ['eat', 'pay', 'shop.unpaid', 'shop.unpaid.owner.4242'] },
    { selector: 98, objectId: 102, text: 'b - 2 potions of healing (unpaid, 100 zorkmids)', quantity: 2, actionAffordances: ['quaff', 'pay', 'shop.unpaid', 'shop.unpaid.owner.4242'] },
  ],
});
assert.deepEqual(unpaidSnapshot.items.map((item) => item.actionAffordances), [
  ['eat', 'pay', 'shop.unpaid', 'shop.unpaid.owner.4242'],
  ['quaff', 'pay', 'shop.unpaid', 'shop.unpaid.owner.4242'],
], 'public inventory snapshots preserve native unpaid affordances');

assert.match(bridge, /if \(otmp->unpaid\)[\s\S]{0,300}OBJ_AFFORD\("shop\.unpaid"\)[\s\S]{0,500}shop\.unpaid\.owner\.%u/, 'bridge derives owner-bound unpaid affordances from native object and bill state');
assert.doesNotMatch(bridge, /otmp->oclass == COIN_CLASS\) OBJ_AFFORD\("pay"\)/, 'carried gold is not mislabeled as merchandise to buy');
assert.match(bridge, /mtmp && mtmp->isshk[\s\S]{0,260}monster\.shopkeeper\.id\.%u/, 'visible shopkeepers carry a public recipient identity');
assert.match(renderer, /function unpaidInventoryItems\(recipientId = ''\)/, 'renderer derives payment context from owner-bound public inventory snapshots');
assert.match(renderer, /Pay shopkeeper \(\$\{itemCount\} item/, 'payment button uses clear count-aware copy');
assert.match(renderer, /shopkeeper \? shopPaymentAction\(direction, cell\) : null/, 'payment is scoped to adjacent shopkeeper interaction');
assert.match(renderer, /adjacentShopkeeperRecipientIds\(\)\.size !== 1/, 'ambiguous multiple-shopkeeper contexts do not expose an untargeted Pay action');
assert.match(renderer, /multi && !shopPaymentMenu && maxCount > 1/, 'shop bill rows do not offer unsupported partial-stack quantities');
assert.match(renderer, /interactionConfirm\.disabled = selectedMenuParts\.size === 0/, 'empty shop selections keep Pay selected disabled');
assert.match(renderer, /Choose items to pay for/, 'shop payment picker and status use player-facing copy');
assert.match(renderer, /Payment complete/, 'successful payment has a concise player outcome');
assert.match(gameViewState, /pay which \(\?:shop \)\?bill items/, 'shared menu status recognizes supported payment prompt variants');
assert.match(renderer, /shopPaymentUiStatus = \{ phase: 'result', text: message, until: Date\.now\(\) \+ 5000 \}/, 'stale payment rejection replaces the opening status with an expiring player result');
assert.match(renderer, /actionDispatched && !isShopPaymentAction/, 'payment does not add GUI telemetry to the player message log');
assert.match(renderer, /selected total \$\{price\} zm/, 'selection feedback keeps the selected total clear');
assert.match(renderer, /if \(model\.shop\) \{[\s\S]{0,320}return `\$\{selectedKeys\.size\} selected\$\{selectedPrice\}\.`;/, 'shop selection feedback reports only the selection and selected total');
assert.match(renderer, /Payment is no longer available\. Your bill or shopkeeper context changed\./, 'stale payment actions fail visibly without sending a command');
assert.match(renderer, /renderContextActionBar\(\);[\s\S]{0,250}else if \(item\.type === 'equipment-snapshot'/, 'inventory snapshots immediately refresh contextual payment availability');
assert.match(allmain, /pick_obj\(otmp\)->unpaid/, 'real fixture creates merchandise through normal pickup and billing semantics');
assert.match(allmain, /NH_SHIM_TEST_SHOP_PAYMENT_SCENE/, 'real payment fixture remains test-gated');
assert.match(allmain, /unsupported shop payment fixture mode/, 'shop payment fixture rejects unknown modes');

console.log('shop payment contextual action tests OK');
