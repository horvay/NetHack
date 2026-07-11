#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ReplayAdapter = require('../src/shared/replay-adapter');

const repoRoot = path.resolve(__dirname, '..', '..');
const bridge = process.env.NH_SHIM_BRIDGE || path.join(repoRoot, 'electron-poc', 'shim-bridge', 'nh-shim-bridge');
const recordingPath = process.argv[2] || path.join(repoRoot, 'electron-poc', 'test', 'recordings', 'seeded-smoke.nhrec.json');
const maxMs = Number(process.env.NH_REPLAY_MAX_MS || 6000);

function fail(message) {
  console.error(`[replay] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(recordingPath)) fail(`recording not found: ${recordingPath}`);
const recording = JSON.parse(fs.readFileSync(recordingPath, 'utf8'));
const replay = ReplayAdapter.normalizeRecording(recording);
if (!replay.ok) fail(replay.message);

const env = { ...process.env, NETHACKOPTIONS: replay.startConfig.nethackOptions || recording.options?.NETHACKOPTIONS || '!tutorial' };
if (replay.startConfig.seed) env.NETHACK_SEED = replay.startConfig.seed;
const args = replay.startConfig.playerSpec ? [replay.startConfig.playerSpec] : [];
const proc = spawn(bridge, args, { cwd: repoRoot, env, stdio: ['pipe', 'pipe', 'pipe'] });

const events = [];
const milestones = [];
let stdoutBuffer = '';
let sawSeed = !env.NETHACK_SEED;
let sawWelcome = false;
let sent = false;
let sendTimer;

function sendInputs() {
  if (sent) return;
  sent = true;
  let offset = 0;
  for (const input of replay.inputs) {
    const keycode = input.keycode;
    if (!keycode) continue;
    offset += Number(process.env.NH_REPLAY_INPUT_DELAY_MS || 60);
    setTimeout(() => proc.stdin.write(`${JSON.stringify({ type: 'keycode', keycode })}\n`), offset);
  }
}

proc.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk.toString('utf8');
  let nl;
  while ((nl = stdoutBuffer.indexOf('\n')) >= 0) {
    const line = stdoutBuffer.slice(0, nl);
    stdoutBuffer = stdoutBuffer.slice(nl + 1);
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    events.push(event);
    if (event.name === 'bridge_seed' && String(event.seed) === String(recording.seed)) sawSeed = true;
    if ((event.name === 'shim_putstr' || event.name === 'shim_raw_print') && /Welcome/i.test(event.text || '')) sawWelcome = true;
    if (event.name === 'shim_print_glyph' && (event.semanticKind === 'stairs' || event.char === '>' || event.char === '<')) {
      milestones.push({ type: 'stairs-seen', x: event.x, y: event.y, ch: event.char, semanticName: event.semanticName });
    }
    if (event.name === 'shim_nhgetch' || event.name === 'shim_yn_function' || event.name === 'shim_select_menu') sendInputs();
  }
});

proc.stderr.on('data', (chunk) => process.stderr.write(chunk));
proc.on('error', (error) => fail(String(error)));

sendTimer = setTimeout(sendInputs, 1000);
const killTimer = setTimeout(() => {
  if (!proc.killed) proc.kill('SIGTERM');
}, maxMs);

proc.on('close', (code, signal) => {
  clearTimeout(sendTimer);
  clearTimeout(killTimer);
  const summary = { ok: sawSeed && sawWelcome && events.length > 0, code, signal, schemaVersion: replay.schemaVersion, replayEvents: replay.events.length, inputs: replay.inputs.length, checkpoints: replay.checkpoints.length, warnings: replay.warnings, events: events.length, sawSeed, sawWelcome, milestones };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(1);
});
