const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const scenarioRoot = path.join(root, 'test/scenarios');
const allmain = fs.readFileSync(path.join(repo, 'src/allmain.c'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'shim-bridge/nh-shim-bridge.c'), 'utf8');
const gameProcess = fs.readFileSync(path.join(root, 'src/main/game-process.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src/preload.js'), 'utf8');
const protocol = require('../src/shared/shim-protocol');
const LaunchPolicy = require('../src/main/launch-policy');

function listScenarioFiles(dir = scenarioRoot) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__negative__' ? [] : listScenarioFiles(full);
    return entry.isFile() && entry.name.endsWith('.json') ? [full] : [];
  });
}

const files = listScenarioFiles();
assert.ok(files.length > 0, 'scenario examples should be present for the loader framework');
const scenarios = files.map((file) => ({ file, rel: path.relative(scenarioRoot, file).replace(/\\/g, '/').replace(/\.json$/, ''), json: JSON.parse(fs.readFileSync(file, 'utf8')) }));
for (const scenario of scenarios) {
  const version = scenario.json.schema === 'nethack-electron-test-scenario/v1' ? 1
    : scenario.json.schema === 'nethack-electron-test-scenario/v2' ? 2 : 0;
  assert.ok(version, `${scenario.rel} schema`);
  assert.equal(scenario.json.id, scenario.rel, `${scenario.rel} id must match safe resolver path`);
  assert.equal(scenario.json.phase, version === 2
    ? 'after-special-level-and-hero-before-first-draw'
    : 'after-level-and-hero-before-first-draw', `${scenario.rel} phase`);
  if (version === 2) assert.ok(typeof scenario.json.level?.specialLevel === 'string', `${scenario.rel} special level`);
  const requiredTopLevel = ['expectedPublicFacts', 'ground', 'hero', 'id', 'inventory', 'level', 'monsters', 'phase', 'schema'];
  const topLevel = Object.keys(scenario.json).sort();
  assert.deepEqual(topLevel.filter((key) => key !== 'eventResults'), requiredTopLevel.sort(), `${scenario.rel} top-level schema`);
  if (scenario.json.eventResults) {
    assert.ok(Array.isArray(scenario.json.eventResults), `${scenario.rel} eventResults array`);
    for (const entry of scenario.json.eventResults) {
      assert.deepEqual(Object.keys(entry).sort(), ['event', 'result'], `${scenario.rel} eventResults entry schema`);
      assert.ok(typeof entry.event === 'string' && entry.event.length, `${scenario.rel} eventResults event`);
      assert.ok(typeof entry.result === 'string' && entry.result.length, `${scenario.rel} eventResults result`);
    }
  }
  assert.ok(scenario.json.hero && typeof scenario.json.hero.placement === 'string', `${scenario.rel} declares hero placement`);
  assert.ok(Array.isArray(scenario.json.ground), `${scenario.rel} ground array`);
  assert.ok(Array.isArray(scenario.json.monsters), `${scenario.rel} monsters array`);
  assert.ok(Array.isArray(scenario.json.inventory), `${scenario.rel} inventory array`);
  assert.ok(scenario.json.expectedPublicFacts && Object.keys(scenario.json.expectedPublicFacts).length, `${scenario.rel} expected facts`);
}

const sampleScenario = scenarios.find((s) => s.rel === 'container/unlocked-chest-on-hero')?.json ?? scenarios[0].json;

assert.ok(allmain.includes('#ifdef NH_ELECTRON_TEST_FIXTURES'), 'loader and legacy hooks must be fixture-build gated');
assert.ok(allmain.includes('electron_test_parse_scenario_v1'), 'loader must use a real parser/validator entrypoint');
assert.ok(!/strstr\s*\(/.test(allmain), 'allmain scenario validation must not use substring strstr checks');
assert.ok(allmain.includes('ELECTRON_TEST_SCENARIO_SCHEMA_V2'), 'loader must recognize the special-level v2 schema');
assert.ok(allmain.includes('electron_test_apply_special_level'), 'v2 loader must enter authentic named special levels');
assert.ok(allmain.includes('goto_level(&target, FALSE, FALSE, FALSE)'), 'special-level setup must use NetHack level travel');
assert.ok(!allmain.includes('electron_test_json_has'), 'substring JSON helper must be removed');
assert.ok(allmain.includes('maybe_setup_electron_json_test_scenario();'), 'new game must invoke JSON scenario loader');
assert.ok(allmain.includes('bridge_test_scenario_loaded'), 'loaded event must be emitted');
assert.ok(allmain.includes('bridge_test_scenario_failed'), 'failed event must be emitted');
assert.ok(allmain.includes('unsupported JSON scenario field'), 'schema must fail closed for unknown fields');
assert.ok(allmain.includes('duplicate JSON scenario field'), 'duplicate fields must fail closed');
assert.ok(allmain.includes('scenario id does not match requested id'), 'JSON id must match safe requested scenario id');
assert.ok(allmain.includes('container object is missing required fields'), 'container schema must require lock/trap/contents fields');
assert.ok(allmain.includes('invalid hero role/race'), 'hero identity combinations must fail closed');
assert.ok(allmain.includes('electron_test_apply_identity(&scenario)'), 'identity is applied only after full scenario parse/validation');
assert.ok(allmain.indexOf('electron_test_parse_scenario_v1(json, &scenario)') < allmain.indexOf('electron_test_apply_identity(&scenario)'), 'invalid identity/scenario JSON must fail before identity mutation');
assert.ok(allmain.indexOf('electron_test_preflight_locations(&scenario)') < allmain.indexOf('electron_test_apply_hero(&scenario)'), 'location preflight must run before hero relocation');
assert.ok(allmain.lastIndexOf('electron_test_preflight_locations(&scenario)') < allmain.indexOf('electron_test_apply_terrain(&scenario)'), 'terrain/object/monster preflight must run before ordinary world mutation');
assert.ok(allmain.includes('electron_test_planned_accessible'), 'planned map/terrain accessibility must be checked before placements');
assert.ok(allmain.includes('electron_test_terrain_passable'), 'planned closed doors must be treated as impassable for placements');
assert.ok(allmain.includes('unsupported monster typeId'), 'monster type IDs must fail closed');
assert.ok(allmain.includes('unsupported terrain type'), 'terrain types must fail closed');
assert.ok(allmain.includes('electron_test_parse_event_results'), 'event result forcing must use schema parser/validator support');
assert.ok(allmain.includes('unsupported eventResults event/result'), 'event result forcing must fail closed for unsupported outcomes');
assert.ok(allmain.includes('electron_test_consume_event_result'), 'fixture event result consumers must use a generic queue API');
assert.ok(allmain.includes('equipped is only supported for inventory objects'), 'equipped state must be inventory-only');
assert.ok(allmain.includes('object quantity is out of range'), 'object quantities must be range checked');
assert.ok(allmain.includes('electron_test_build_expected_facts'), 'loader should emit JSON-declared expected facts, not a hardcoded fact constant');
assert.ok(allmain.includes('electron_test_clear_inventory'), 'scenario inventory should replace starter gear for hermetic fixture state');
assert.ok(allmain.includes('NH_TEST_SCENARIO_ID is required for fixture scenarios'), 'fixture C loader should not accept direct paths without the safe ID resolver');
assert.ok(allmain.indexOf('electron_test_parse_scenario_v1(json, &scenario)') < allmain.indexOf('electron_test_apply_hero(&scenario)'), 'scenario must validate before mutating NetHack state');
assert.ok(bridge.includes('fixture scenario env vars require NH_ELECTRON_TEST_FIXTURES build'), 'normal bridge build must reject fixture env vars');
assert.ok(bridge.includes('explicit NH_ELECTRON_TEST_FIXTURES=1 runtime gate'), 'runtime gate must reject accidental fixture env vars');
assert.ok(bridge.includes('direct NH_TEST_SCENARIO paths are not supported'), 'bridge must reject arbitrary direct scenario paths');
assert.ok(bridge.includes('/electron-poc/test/scenarios/%s.json'), 'scenario IDs must resolve under test/scenarios');
assert.ok(bridge.includes('scenario path is too long'), 'scenario ID path truncation must fail');
assert.ok(bridge.includes('NH_TEST_PLAYGROUND'), 'bridge must support per-test playground/root override');
assert.ok(bridge.includes('NETHACK_SEED requires NH_ELECTRON_TEST_FIXTURES build and runtime gate'), 'bridge must not honor deterministic seeds outside fixture gates');
assert.equal(LaunchPolicy.launchEnv({ NETHACK_SEED: '123', NH_ELECTRON_CHOSEN_SEED: '123', NH_TEST_SCENARIO_ID: 'equipment/both-rings-occupied', NH_TEST_PLAYGROUND: '/tmp/nh', NH_TEST_FORCE_DOWNSTAIRS_UNDER_HERO: '1', KEEP_ME: 'yes' }).NETHACK_SEED, undefined, 'launch policy strips deterministic seed env by default');
assert.equal(LaunchPolicy.launchEnv({ NETHACK_SEED: '123', NH_ELECTRON_CHOSEN_SEED: '123', NH_TEST_SCENARIO_ID: 'equipment/both-rings-occupied', NH_TEST_PLAYGROUND: '/tmp/nh', NH_TEST_FORCE_DOWNSTAIRS_UNDER_HERO: '1', KEEP_ME: 'yes' }).NH_TEST_SCENARIO_ID, undefined, 'launch policy strips fixture scenario env by default');
assert.equal(LaunchPolicy.launchEnv({ NETHACK_SEED: '123', KEEP_ME: 'yes' }).KEEP_ME, 'yes', 'launch policy preserves ordinary runtime env');
assert.ok(gameProcess.includes('LaunchPolicy.shimLaunchConfig'), 'main game process must route shim env construction through launch policy');
assert.ok(!gameProcess.includes('scenarioPath'), 'main process must not forward arbitrary scenario paths');
assert.ok(!preload.includes('scenarioPath'), 'preload must not expose arbitrary scenario paths');

for (const name of ['bridge_test_scenario_loaded', 'bridge_test_scenario_failed']) {
  assert.ok(protocol.knownNames.includes(name), `${name} should be a known shim protocol event`);
  const parsed = protocol.parseLine(JSON.stringify({ type: 'shim-event', name, id: sampleScenario.id, message: 'ok' }));
  assert.equal(parsed.valid, true, `${name} should validate`);
}

console.log('scenario-loader-contract-test: ok');
