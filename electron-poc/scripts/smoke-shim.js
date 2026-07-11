const { spawn } = require('node:child_process');
const proc = spawn('./shim-bridge/nh-shim-bridge', [], { cwd: process.cwd() });
let sawCommand = false;
let sawWelcome = false;
let sawStatus = false;
const timer = setTimeout(() => proc.kill('SIGTERM'), 10_000);
proc.stdout.on('data', (data) => {
  process.stdout.write(data);
  const text = data.toString('utf8');
  if (text.includes('bridge_command')) sawCommand = true;
  if (text.includes('Velkommen Electron')) sawWelcome = true;
  if (text.includes('shim_status_update')) sawStatus = true;
});
proc.stderr.on('data', (data) => process.stderr.write(data));
proc.stdin.write(`${JSON.stringify({ key: '.' })}\n`);
proc.on('close', () => {
  clearTimeout(timer);
  if (sawCommand && sawWelcome && sawStatus) process.exit(0);
  console.error(`missing evidence: command=${sawCommand} welcome=${sawWelcome} status=${sawStatus}`);
  process.exit(1);
});
