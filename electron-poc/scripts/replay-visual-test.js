const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer.html'), 'utf8');
const replayRunner = fs.readFileSync(path.join(root, 'src', 'main', 'replay-runner.js'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'scripts', 'replay-visual.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'src', 'shared', 'replay-adapter.js'), 'utf8');

const checks = [
  ['visual replay env hook is present', /NH_VISUAL_REPLAY_RECORDING/.test(main) || /NH_VISUAL_REPLAY_RECORDING/.test(replayRunner)],
  ['visual replay captures PNG screenshots', /captureReplayScreenshot/.test(replayRunner) && /capturePage\(\)/.test(replayRunner) && /toPNG\(\)/.test(replayRunner)],
  ['visual replay has configurable delay and screenshot cadence', /NH_VISUAL_REPLAY_INPUT_DELAY_MS/.test(replayRunner) && /NH_VISUAL_REPLAY_SCREENSHOT_EVERY/.test(replayRunner) && /NH_VISUAL_REPLAY_SCREENSHOT_GAP_MS/.test(replayRunner)],
  ['visual replay waits for renderer state stability before inputs/checkpoints', /waitForReplayStable/.test(replayRunner) && /shimEventCount/.test(replayRunner) && /state-stable/.test(replayRunner)],
  ['visual replay writes a summary artifact', /visual-replay-summary\.json/.test(replayRunner)],
  ['visual replay writes checkpoint state sidecars', /writeStateSidecar/.test(replayRunner) && /checkpointCount/.test(replayRunner)],
  ['renderer exposes replay automation API', /window\.__nethackAutomation/.test(renderer) && /startReplay/.test(renderer) && /sendKeycode/.test(renderer) && /dismissReplayIntro/.test(renderer)],
  ['renderer exposes visible recording checkpoint control', /recording-toolbar/.test(html) && /record-checkpoint-primary/.test(html) && /recordCheckpointPrimaryButton/.test(renderer) && /recordCheckpoint/.test(renderer)],
  ['renderer captures effective random bridge seed and wraps keycode shim inputs for recording', /bridge_seed/.test(renderer) && /pending-bridge-seed/.test(renderer) && /sendRecordedShimInput/.test(renderer) && /auto-disclosure/.test(renderer) && /auto-menu-space/.test(renderer)],
  ['wrapper forwards CLI delay and output options', /--delay-ms/.test(runner) && /--screenshot-every/.test(runner) && /NH_VISUAL_REPLAY_OUT_DIR/.test(runner)],
  ['wrapper recreates output directory before replay to prevent stale summary reuse', /rmSync\(outDir, \{ recursive: true, force: true \}\)/.test(runner) && /mkdirSync\(outDir/.test(runner)],
  ['wrapper exits nonzero when Electron replay terminates by signal', /visual replay exited by/.test(runner) && /process\.exit\(128 \+/.test(runner)],
  ['shared replay adapter supports v1 and v2', /normalizeRecording/.test(adapter) && /schemaVersion/.test(adapter) && /checkpoint/.test(adapter)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'ok' : 'not ok'} - ${name}`);
if (failed.length) {
  console.error(`Visual replay checks failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
