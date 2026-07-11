const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const inventPath = path.resolve(__dirname, '..', '..', 'src', 'invent.c');
const source = fs.readFileSync(inventPath, 'utf8');

function sliceFunction(signature, endMarker) {
  const start = source.indexOf(signature);
  assert(start >= 0, `${signature} found`);
  const end = source.indexOf(endMarker, start);
  assert(end > start, `${signature} end found`);
  return source.slice(start, end);
}

const displayInventory = sliceFunction(
  'display_inventory(const char *lets, boolean want_reply)',
  '\n}\n\nvoid\nrepopulate_perminvent',
);
const cmdqStart = displayInventory.indexOf('if (cmdq) {');
const cmdqAbortReturn = displayInventory.indexOf("return '\\0';", cmdqStart);
const flagSet = displayInventory.indexOf('electron_display_inventory_menu_context = TRUE;', cmdqAbortReturn);
const displayPickinvCall = displayInventory.indexOf('ret = display_pickinv(', flagSet);
const flagClear = displayInventory.indexOf('electron_display_inventory_menu_context = FALSE;', displayPickinvCall);

assert(cmdqStart >= 0, 'cmdq fast path block present');
assert(cmdqAbortReturn > cmdqStart, 'cmdq fast path can return without opening a menu');
assert(flagSet > cmdqAbortReturn, 'inventory menu context flag is only set after cmdq fast-path returns are impossible');
assert(displayPickinvCall > flagSet, 'display_pickinv is called while context flag is set');
assert(flagClear > displayPickinvCall, 'context flag is cleared after display_pickinv returns, including non-menu returns');

const displayPickinv = sliceFunction(
  'display_pickinv(\n    const char *lets',
  '\n}\n\n/*\n * If lets == NULL',
);
const noInventoryReturn = displayPickinv.indexOf('if (n == 0)');
const singleMessageReturn = displayPickinv.indexOf('if (n == 1 && !iflags.force_invmenu && !iflags.menu_requested)');
const contextEmit = displayPickinv.indexOf('shim_native_menu_context("inventory.displayInventory"');
const contextClearInside = displayPickinv.indexOf('electron_display_inventory_menu_context = FALSE;', contextEmit);
const startMenu = displayPickinv.indexOf('start_menu(win, menu_behavior);', contextEmit);

assert(noInventoryReturn >= 0, 'display_pickinv empty-inventory non-menu path present');
assert(singleMessageReturn > noInventoryReturn, 'display_pickinv single-item message-only path present');
assert(contextEmit > singleMessageReturn, 'inventory menu context is emitted only after non-menu display_pickinv returns are impossible');
assert(contextClearInside > contextEmit, 'context flag is cleared immediately when emitted for a real menu');
assert(startMenu > contextEmit, 'inventory menu context immediately precedes real start_menu path');

console.log('inventory-menu-context-placement-test PASS');
