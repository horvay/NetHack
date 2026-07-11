const { spawn } = require('node:child_process');

const proc = spawn('./shim-bridge/nh-shim-bridge', [], { cwd: process.cwd() });
const commands = [];
const promptAnswers = [];
let sawWelcome = false;
let sawDeathPrompt = false;
let closed = false;
const timer = setTimeout(() => finish(false, 'timed out waiting for bridge events'), 10_000);

function finish(ok, message) {
  if (closed) return;
  closed = true;
  clearTimeout(timer);
  proc.kill('SIGTERM');
  const downCommands = commands.filter((event) => event.keycode === 62);
  const extraControls = commands.filter((event) => event.keycode === 4 || event.keycode === 24 || event.keycode === 26);
  const passed = ok
    && sawWelcome
    && downCommands.length === 1
    && commands.length === 1
    && downCommands[0].queuedBefore === 0
    && extraControls.length === 0
    && promptAnswers.length === 0
    && !sawDeathPrompt;
  console.log(JSON.stringify({
    passed,
    message,
    sawWelcome,
    commandCount: commands.length,
    downCommandCount: downCommands.length,
    commands,
    promptAnswers,
    sawDeathPrompt,
  }, null, 2));
  process.exit(passed ? 0 : 1);
}

proc.stdout.on('data', (data) => {
  for (const line of data.toString('utf8').split(/\r?\n/).filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.name === 'bridge_command') commands.push(event);
    if (event.name === 'bridge_prompt_answer') promptAnswers.push(event);
    if ((event.text || '').includes('welcome to NetHack')) sawWelcome = true;
    if (/possessions identified|Do you want your possessions/i.test(`${event.text || ''} ${event.query || ''}`)) sawDeathPrompt = true;
    if (sawWelcome) setTimeout(() => finish(true, 'single down-stairs command stayed single and did not answer prompts'), 200);
  }
});
proc.stderr.on('data', (data) => process.stderr.write(data));
proc.on('error', (error) => finish(false, String(error)));
proc.on('close', () => finish(false, 'bridge closed early'));

proc.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: '>'.charCodeAt(0) })}\n`);
