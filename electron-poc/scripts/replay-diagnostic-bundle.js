#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function usage() {
  console.error('usage: node scripts/replay-diagnostic-bundle.js <diagnostic-bundle> [--output <dir>] [--max-delay-ms <n>] [--delay-scale <n>] [--after-input-timeout-ms <n>]');
  process.exit(2);
}

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) usage();
const bundle = path.resolve(args.shift());
let output = '';
let maxDelayMs = 250;
let delayScale = 1;
let afterInputTimeoutMs = 5000;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--output') output = path.resolve(args[++i] || '');
  else if (args[i] === '--max-delay-ms') maxDelayMs = Number(args[++i] || maxDelayMs);
  else if (args[i] === '--delay-scale') delayScale = Number(args[++i] || delayScale);
  else if (args[i] === '--after-input-timeout-ms') afterInputTimeoutMs = Number(args[++i] || afterInputTimeoutMs);
  else usage();
}
if (!output) output = path.resolve(__dirname, '..', 'test-output', 'diagnostic-replay', path.basename(bundle));
fs.mkdirSync(output, { recursive: true });

function readJson(file) { return JSON.parse(fs.readFileSync(path.join(bundle, file), 'utf8')); }
function readEvents() {
  return fs.readFileSync(path.join(bundle, 'events.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sanitizeOptions(value) { return String(value || '!tutorial'); }

(async function main() {
  const run = readJson('run.json');
  const events = readEvents();
  const inputs = events.filter((event) => event.category === 'shim-send' && event.type === 'shim.stdin.write')
    .map((event) => ({ seq: event.seq, at: event.at, monoMs: event.monoMs, payload: event.payload?.payload, line: event.payload?.line }))
    .filter((entry) => entry.payload && entry.line);
  if (!inputs.length) throw new Error('bundle does not contain shim.stdin.write events');

  const inputPath = path.join(output, 'input-stream.jsonl');
  fs.writeFileSync(inputPath, inputs.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8');

  const repoRoot = path.resolve(__dirname, '..', '..');
  const bridge = process.env.NH_SHIM_BRIDGE || path.join(repoRoot, 'electron-poc', 'shim-bridge', 'nh-shim-bridge');
  const stdoutPath = path.join(output, 'replay-stdout.jsonl');
  const stderrPath = path.join(output, 'replay-stderr.log');
  fs.writeFileSync(stdoutPath, '', 'utf8');
  fs.writeFileSync(stderrPath, '', 'utf8');

  const playerSpec = run.player?.playerSpec || '';
  const seed = run.seed?.effective || run.seed?.chosen;
  const nethackOptions = sanitizeOptions(run.options?.NETHACKOPTIONS);
  const env = { ...process.env, NETHACKOPTIONS: nethackOptions };
  if (seed) {
    env.NETHACK_SEED = String(seed);
    env.NH_ELECTRON_CHOSEN_SEED = String(seed);
  }
  delete env.NH_ELECTRON_TEST_FIXTURES;
  delete env.NH_TEST_SCENARIO_ID;
  delete env.NH_TEST_SCENARIO;

  const command = { bridge, args: playerSpec ? [playerSpec] : [], cwd: repoRoot, seed, nethackOptions, inputCount: inputs.length, maxDelayMs, delayScale, afterInputTimeoutMs };
  fs.writeFileSync(path.join(output, 'replay-command.json'), `${JSON.stringify(command, null, 2)}\n`, 'utf8');

  const child = spawn(bridge, command.args, { cwd: repoRoot, env });
  const replayEvents = [];
  let stdoutRemainder = '';
  child.stdout.on('data', (data) => {
    stdoutRemainder += data.toString('utf8');
    const parts = stdoutRemainder.split(/\r?\n/);
    stdoutRemainder = parts.pop() || '';
    for (const line of parts.filter(Boolean)) {
      fs.appendFileSync(stdoutPath, `${line}\n`, 'utf8');
      try { replayEvents.push(JSON.parse(line)); } catch { replayEvents.push({ type: 'raw', text: line }); }
    }
  });
  child.stderr.on('data', (data) => fs.appendFileSync(stderrPath, data.toString('utf8'), 'utf8'));

  let written = 0;
  let writeError = null;
  for (let i = 0; i < inputs.length; i += 1) {
    if (child.exitCode != null || child.killed || !child.stdin.writable) break;
    if (i > 0 && Number.isFinite(inputs[i].monoMs) && Number.isFinite(inputs[i - 1].monoMs)) {
      const delta = Math.max(0, Math.min(maxDelayMs, (inputs[i].monoMs - inputs[i - 1].monoMs) * delayScale));
      if (delta > 0) await sleep(delta);
    }
    try {
      child.stdin.write(`${inputs[i].line}\n`);
      written += 1;
    } catch (error) {
      writeError = String(error && error.stack || error);
      break;
    }
  }
  try { child.stdin.end(); } catch {}
  let killedAfterInputTimeout = false;
  const exit = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode == null) {
        killedAfterInputTimeout = true;
        try { child.kill('SIGTERM'); } catch {}
      }
    }, Math.max(100, afterInputTimeoutMs));
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
  if (stdoutRemainder.trim()) fs.appendFileSync(stdoutPath, `${stdoutRemainder.trim()}\n`, 'utf8');

  const nativeEndEvents = replayEvents.filter((event) => event && event.name === 'shim_native_end_diagnostic');
  const nativeMenuContexts = replayEvents.filter((event) => event && event.name === 'shim_native_menu_context');
  const nativeCommandDiagnostics = replayEvents.filter((event) => event && event.name === 'shim_native_command_diagnostic');
  const menus = replayEvents.filter((event) => event && ['shim_start_menu', 'shim_end_menu', 'shim_select_menu', 'bridge_menu_answer'].includes(event.name));
  const bridgeCommands = replayEvents.filter((event) => event && event.name === 'bridge_command');
  const finalMessages = replayEvents.filter((event) => event && ['shim_putstr', 'shim_raw_print', 'shim_raw_print_bold'].includes(event.name)).map((event) => event.text).filter(Boolean).slice(-40);
  const summary = {
    schema: 'nethack-electron-diagnostic-replay-summary/v1',
    sourceBundle: bundle,
    output,
    command,
    exit,
    killedAfterInputTimeout,
    wroteInputs: written,
    inputCount: inputs.length,
    writeError,
    nativeEndEvents: nativeEndEvents.slice(0, 20),
    firstFinalNativeEndEvent: nativeEndEvents.find((event) => event.finalFlow) || null,
    nativeMenuContexts: nativeMenuContexts.slice(0, 20),
    nativeCommandDiagnostics: nativeCommandDiagnostics.slice(0, 20),
    menuEventCount: menus.length,
    bridgeCommandCount: bridgeCommands.length,
    finalMessages,
  };
  fs.writeFileSync(path.join(output, 'replay-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
