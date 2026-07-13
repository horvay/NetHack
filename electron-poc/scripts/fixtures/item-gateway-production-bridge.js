#!/usr/bin/env node
'use strict';

const readline = require('node:readline');
function emit(event) { process.stdout.write(`${JSON.stringify(event)}\n`); }
emit({ name: 'bridge_start', source: 'item-gateway-production-fixture' });
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  let input;
  try { input = JSON.parse(line); } catch { return; }
  if (input.type === 'test-inventory-snapshot') {
    emit({
      name: 'shim_update_inventory',
      revision: input.revision,
      inventoryRevision: input.revision,
      equipmentRevision: input.revision,
      items: Array.isArray(input.items) ? input.items : [],
    });
  } else if (input.type === 'ui-command') {
    emit({
      name: 'bridge_ui_command_accepted',
      commandId: input.command?.commandId || '',
      transactionId: input.command?.transactionId || '',
      actionId: input.command?.actionId || '',
      command: input.command?.payload?.route?.command || '',
    });
  }
});
