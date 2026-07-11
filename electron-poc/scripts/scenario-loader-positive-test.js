const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');
const scenarioRoot = path.join(root, 'test/scenarios');

function listScenarioFiles(dir = scenarioRoot) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__negative__' ? [] : listScenarioFiles(full);
    return entry.isFile() && entry.name.endsWith('.json') ? [full] : [];
  });
}
const ids = listScenarioFiles().map((file) => path.relative(scenarioRoot, file).replace(/\\/g, '/').replace(/\.json$/, '')).sort();

function makeIsolatedPlayground() {
  const source = path.join(repo, 'playground');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-scenario-positive-'));
  fs.cpSync(source, temp, {
    recursive: true,
    filter: (entry) => !/[a-z]lock\.0$/.test(path.basename(entry)),
  });
  return temp;
}

function run(id, timeoutMs = 15000) {
  const playground = makeIsolatedPlayground();
  return new Promise((resolve, reject) => {
    let out = '';
    let requestedStop = false;
    let result = null;
    let timeoutTimer;
    let killTimer;
    const env = {
      ...process.env,
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: id,
      NETHACKDIR: playground,
      NETHACKOPTIONS: '!tutorial,!autopickup',
      NETHACK_SEED: '424242',
    };
    const cleanup = () => fs.rmSync(playground, { recursive: true, force: true });
    const child = spawn(bridge, [], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const requestStop = (nextResult) => {
      if (requestedStop) return;
      requestedStop = true;
      result = nextResult;
      clearTimeout(timeoutTimer);
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1500);
    };
    const onData = (chunk) => {
      out += chunk.toString();
      if (/bridge_test_scenario_failed/.test(out)) requestStop({ id, loaded: false, failed: true });
      else if (/bridge_test_scenario_loaded/.test(out)) requestStop({ id, loaded: true, failed: false });
    };
    timeoutTimer = setTimeout(() => requestStop({ id, loaded: false, failed: false, timedOut: true }), timeoutMs);
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => {
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      cleanup();
      reject(error);
    });
    child.on('close', (status, signal) => {
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      cleanup();
      resolve({ id, status, signal, loaded: /bridge_test_scenario_loaded/.test(out), failed: /bridge_test_scenario_failed/.test(out), ...(result || {}), out });
    });
  });
}

async function main() {
  for (const id of ids) {
    const scenario = JSON.parse(fs.readFileSync(path.join(scenarioRoot, `${id}.json`), 'utf8'));
    const result = await run(id);
    assert.equal(result.loaded, true, `${id} should emit loaded event without relying on process timeout\n${result.out.slice(-2000)}`);
    assert.equal(result.failed, false, `${id} should not fail\n${result.out.slice(-2000)}`);
    assert.doesNotMatch(result.out, /Program in disorder|Please report these messages|Too many hacks running now/i, `${id} emitted runtime failure\n${result.out.slice(-4000)}`);
    assert.match(result.out, new RegExp(`"id":"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${id} loaded id`);
    for (const [field, values] of Object.entries(scenario.expectedPublicFacts)) {
      for (const value of values) {
        assert.ok(result.out.includes(value), `${id} loaded event should include expectedPublicFacts.${field} value ${value}`);
      }
    }
  }
  console.log('scenario-loader-positive-test: ok');
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
