#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const electronBin = require('electron');

function usage() {
  console.error('Usage: node scripts/replay-visual.js <recording.nhrec.json> [--out DIR] [--delay-ms N] [--initial-delay-ms N] [--final-delay-ms N] [--screenshot-every N] [--screenshot-gap-ms N]');
}

const args = process.argv.slice(2);
let recording = '';
let outDir = '';
const env = { ...process.env };
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = () => args[++i];
  if (arg === '--out') outDir = path.resolve(next());
  else if (arg === '--delay-ms') env.NH_VISUAL_REPLAY_INPUT_DELAY_MS = next();
  else if (arg === '--initial-delay-ms') env.NH_VISUAL_REPLAY_INITIAL_DELAY_MS = next();
  else if (arg === '--final-delay-ms') env.NH_VISUAL_REPLAY_FINAL_DELAY_MS = next();
  else if (arg === '--screenshot-every') env.NH_VISUAL_REPLAY_SCREENSHOT_EVERY = next();
  else if (arg === '--screenshot-gap-ms') env.NH_VISUAL_REPLAY_SCREENSHOT_GAP_MS = next();
  else if (!recording) recording = path.resolve(arg);
  else {
    usage();
    process.exit(2);
  }
}
if (!recording) recording = path.join(root, 'test', 'recordings', 'seeded-smoke.nhrec.json');
if (!outDir) outDir = path.join(root, 'test', 'replay-screenshots', path.basename(recording, '.json'));

env.NH_VISUAL_REPLAY_RECORDING = recording;
env.NH_VISUAL_REPLAY_OUT_DIR = outDir;
env.NETHACKOPTIONS = env.NETHACKOPTIONS || '!tutorial';

// Recreate the visual replay output directory for every invocation so a failed
// Electron replay cannot be mistaken for a stale previous summary/screenshots.
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const proc = spawn(electronBin, ['.'], { cwd: root, env, stdio: 'inherit' });
proc.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
proc.on('close', (code, signal) => {
  if (signal) {
    console.error(`visual replay exited by ${signal}`);
    const signalNumbers = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
    process.exit(128 + (signalNumbers[signal] || 1));
  }
  process.exit(code || 0);
});
