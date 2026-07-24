const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const bridgePath = process.argv[2];
if (!bridgePath) throw new Error('usage: node bridge-protocol-contract.js <bridge executable>');

const child = spawn(path.resolve(bridgePath), [], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NH_SHIM_NO_CHDIR: '1',
    NH_BRIDGE_PROTOCOL_CONTRACT: '1',
    NETHACKOPTIONS: '!tutorial',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
let sentCommand = false;
let startEvent = null;
let commandEvent = null;
let settled = false;

function finish(error) {
  if (settled) return;
  settled = true;
  clearTimeout(deadline);
  if (!child.killed) child.kill();
  if (error) {
    console.error(stdout);
    console.error(stderr);
    throw error;
  }
  assert.equal(startEvent.type, 'shim-event');
  assert.equal(startEvent.name, 'bridge_start');
  assert.equal(commandEvent.type, 'shim-event');
  assert.equal(commandEvent.name, 'bridge_command');
  assert.equal(commandEvent.keycode, 62);
  assert.equal(commandEvent.queuedBefore, 0);
  assert.equal(commandEvent.queuedAfter, 1);
  console.log('bridge protocol contract: PASS');
}

function consumeLines() {
  let newline;
  while ((newline = stdout.indexOf('\n')) >= 0) {
    const line = stdout.slice(0, newline).trim();
    stdout = stdout.slice(newline + 1);
    if (!line.startsWith('{')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.name === 'bridge_start') {
      startEvent = event;
      if (!sentCommand) {
        sentCommand = true;
        child.stdin.write('{"type":"key","keycode":62}\n');
      }
    }
    if (event.name === 'bridge_command') commandEvent = event;
    if (startEvent && commandEvent) finish();
  }
}

child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdout += chunk;
  consumeLines();
});
child.stderr.on('data', (chunk) => { stderr += chunk; });
child.on('error', (error) => finish(error));
child.on('exit', (code) => {
  if (!settled) finish(new Error(`bridge exited before protocol contract completed: ${code}`));
});

const deadline = setTimeout(() => finish(new Error('timed out waiting for bridge protocol events')), 15000);
