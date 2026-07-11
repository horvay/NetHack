const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const bridge = path.join(root, 'shim-bridge/nh-shim-bridge');
const mode = process.argv[2] || '--fixtures';
const negativeRoot = path.join(root, 'test/scenarios/__negative__');
const baseScenario = JSON.parse(fs.readFileSync(path.join(root, 'test/scenarios/container/unlocked-chest-on-hero.json'), 'utf8'));

function makeIsolatedPlayground() {
  const source = path.join(repo, 'playground');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-scenario-negative-'));
  fs.cpSync(source, temp, {
    recursive: true,
    filter: (entry) => !/[a-z]lock\.0$/.test(path.basename(entry)),
  });
  return temp;
}

function runBridge(name, envPatch, timeout = 20000) {
  const playground = makeIsolatedPlayground();
  try {
    const env = {
      ...process.env,
      NETHACKDIR: playground,
      NETHACKOPTIONS: '!tutorial,!autopickup',
      NETHACK_SEED: '424242',
      ...envPatch,
    };
    const res = spawnSync(bridge, [], { cwd: repo, env, encoding: 'utf8', timeout });
    const out = `${res.stdout || ''}\n${res.stderr || ''}`;
    if (res.error && res.error.code !== 'ETIMEDOUT') throw res.error;
    return { name, status: res.status, signal: res.signal, out };
  } finally {
    fs.rmSync(playground, { recursive: true, force: true });
  }
}

function assertFailure(result, pattern) {
  assert.notEqual(result.status, 0, `${result.name} should fail`);
  assert.match(result.out, /bridge_test_scenario_failed/, `${result.name} should emit bridge_test_scenario_failed\n${result.out.slice(-2000)}`);
  assert.match(result.out, pattern, `${result.name} should mention ${pattern}\n${result.out.slice(-2000)}`);
  assert.doesNotMatch(result.out, /bridge_test_scenario_loaded/, `${result.name} must not mutate/load scenario`);
}

if (mode === '--normal') {
  const seedOnly = runBridge('normal-build seed ignored', {}, 3000);
  assert.match(seedOnly.out, /bridge_seed/, `normal build should still emit a system seed\n${seedOnly.out.slice(-2000)}`);
  assert.doesNotMatch(seedOnly.out, /"source":"NETHACK_SEED"/, `normal build must not honor NETHACK_SEED\n${seedOnly.out.slice(-2000)}`);
  const result = runBridge('normal-build rejection', {
    NH_ELECTRON_TEST_FIXTURES: '1',
    NH_TEST_SCENARIO_ID: 'container/unlocked-chest-on-hero',
  }, 10000);
  assertFailure(result, /NH_ELECTRON_TEST_FIXTURES build/);
  console.log('scenario-loader-negative-test --normal: ok');
  process.exit(0);
}

fs.rmSync(negativeRoot, { recursive: true, force: true });
fs.mkdirSync(negativeRoot, { recursive: true });

function writeScenario(id, value) {
  const file = path.join(root, 'test/scenarios', `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}
function clone(mutator) {
  const copy = JSON.parse(JSON.stringify(baseScenario));
  copy.id = '__negative__/case';
  if (mutator) mutator(copy);
  return copy;
}
function caseRun(name, value, pattern) {
  const id = `__negative__/${name}`;
  if (typeof value !== 'string' && value.id === '__negative__/case') value.id = id;
  writeScenario(id, value);
  const result = runBridge(id, { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: id });
  assertFailure(result, pattern);
}

try {
  assertFailure(runBridge('missing runtime gate', { NH_TEST_SCENARIO_ID: 'container/unlocked-chest-on-hero' }, 10000), /runtime gate/);
  assertFailure(runBridge('path traversal id', { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: '../container/unlocked-chest-on-hero' }, 10000), /invalid scenario id/);
  assertFailure(runBridge('too-long id', { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: 'a'.repeat(181) }, 10000), /invalid scenario id|too long/);
  assertFailure(runBridge('direct path rejection', { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO: path.join(root, 'test/scenarios/container/unlocked-chest-on-hero.json') }, 10000), /direct NH_TEST_SCENARIO paths are not supported/);

  caseRun('malformed-json', '{ "schema": ', /expected JSON string|scenario JSON root|unterminated|expected/);
  caseRun('unknown-top-level-key', clone((s) => { s.unknownField = true; }), /unsupported JSON scenario field/);
  caseRun('unsupported-schema', clone((s) => { s.schema = 'nethack-electron-test-scenario/v2'; }), /unsupported schema/);
  caseRun('id-mismatch', clone((s) => { s.id = 'container/unlocked-chest-on-hero'; }), /scenario id does not match requested id/);
  caseRun('unsupported-phase', clone((s) => { s.phase = 'after-first-draw'; }), /unsupported phase/);
  caseRun('bad-event-results-nesting', clone((s) => { s.eventResults = {}; }), /expected eventResults array/);
  caseRun('unsupported-event-results-field', clone((s) => { s.eventResults = [{ event: 'drink-fountain', result: 'monster-detection', chance: 100 }]; }), /unsupported eventResults field/);
  caseRun('unsupported-event-results-pair', clone((s) => { s.eventResults = [{ event: 'drink-fountain', result: 'water-demon' }]; }), /unsupported eventResults event\/result/);
  caseRun('event-results-missing-required-field', clone((s) => { s.eventResults = [{ event: 'drink-fountain' }]; }), /eventResults entry is missing required fields/);
  caseRun('unsupported-declared-player-spec', clone((s) => { s.playerSpec = '-uRejected-Val-Hum-Fem-Law'; }), /unsupported JSON scenario field/);
  caseRun('bad-hero-role', clone((s) => { s.hero.role = 'Marmalade'; }), /unsupported or invalid hero role/);
  caseRun('bad-hero-race', clone((s) => { s.hero.race = 'dragon'; }), /unsupported or invalid hero race/);
  caseRun('bad-hero-gender', clone((s) => { s.hero.gender = 'sideways'; }), /unsupported or invalid hero gender/);
  caseRun('bad-hero-alignment', clone((s) => { s.hero.alignment = 'hungry'; }), /unsupported or invalid hero alignment/);
  caseRun('bad-hero-combination', clone((s) => { s.hero.role = 'Valkyrie'; s.hero.race = 'elf'; s.hero.gender = 'male'; s.hero.alignment = 'chaotic'; }), /invalid hero role\/race/);
  caseRun('bad-object-id', clone((s) => { s.inventory[0].typeId = 'WAN_NOTHING'; }), /unsupported object typeId/);
  caseRun('bad-quantity-zero', clone((s) => { s.inventory[0].quantity = 0; }), /object quantity is out of range/);
  caseRun('bad-quantity-too-large', clone((s) => { s.ground[0].object.contents[0].quantity = 100; }), /object quantity is out of range/);
  caseRun('bad-quantity-decimal', clone((s) => { s.inventory[0].quantity = 1.5; }), /expected JSON integer, not decimal/);
  caseRun('wrong-level-nesting', clone((s) => { s.level = []; }), /expected level object/);
  caseRun('wrong-inventory-nesting', clone((s) => { s.inventory = {}; }), /expected inventory array/);
  caseRun('unsupported-level-field', clone((s) => { s.level.dark = false; }), /unsupported level field/);
  caseRun('unsupported-hero-field', clone((s) => { s.hero.title = 'Rejected'; }), /unsupported hero field/);
  caseRun('unsupported-hero-placement', clone((s) => { s.hero.placement = 'exact:1,2'; }), /unsupported hero placement/);
  caseRun('unsupported-ground-field', clone((s) => { s.ground[0].radius = 2; }), /unsupported ground entry field/);
  caseRun('unsupported-ground-location', clone((s) => { s.ground[0].at = 'diagonal-northeast'; }), /unsupported object location/);
  caseRun('unsupported-object-field', clone((s) => { s.inventory[0].blessed = true; }), /unsupported object spec field/);
  caseRun('bad-beatitude', clone((s) => { s.inventory[0].beatitude = 'holy-ish'; }), /unsupported object beatitude/);
  caseRun('bad-charges-type', clone((s) => { s.inventory[0].charges = 3; }), /charges are not supported/);
  caseRun('bad-equipped-on-ground', clone((s) => { s.ground[0].object.equipped = 'wielded'; }), /equipped is only supported/);
  caseRun('bad-equipped-value', clone((s) => { s.inventory[0].equipped = 'helmet'; }), /unsupported equipped state/);
  caseRun('bad-ring-slot-non-ring', clone((s) => { s.inventory[0] = { typeId: 'SMALL_SHIELD', equipped: 'left-ring' }; }), /left-ring\/right-ring equipped state requires a ring/);
  caseRun('bad-poisoned-false-on-food', clone((s) => { s.inventory[0] = { typeId: 'FOOD_RATION', poisoned: false }; }), /poisoned requires a poisonable weapon/);
  caseRun('corpse-missing-monster-type', clone((s) => { s.inventory[0] = { typeId: 'CORPSE' }; }), /CORPSE object requires corpseMonsterTypeId/);
  caseRun('corpse-bad-monster-type', clone((s) => { s.inventory[0] = { typeId: 'CORPSE', corpseMonsterTypeId: 'RODENT_OF_UNUSUAL_SIZE' }; }), /unsupported corpseMonsterTypeId/);
  caseRun('corpse-monster-type-on-non-corpse', clone((s) => { s.inventory[0] = { typeId: 'FOOD_RATION', corpseMonsterTypeId: 'DWARF' }; }), /corpseMonsterTypeId requires CORPSE typeId/);
  caseRun('duplicate-wielded-equipment', clone((s) => { s.inventory = [{ typeId: 'DAGGER', equipped: 'wielded' }, { typeId: 'LONG_SWORD', equipped: 'wielded' }]; }), /duplicate wielded equipment/);
  caseRun('container-in-inventory', clone((s) => { s.inventory[0] = { typeId: 'CHEST', locked: false, trap: 'none', contents: [] }; }), /container object is not supported here/);
  caseRun('container-missing-lock', clone((s) => { delete s.ground[0].object.locked; }), /container object is missing required fields/);
  caseRun('container-bad-trap', clone((s) => { s.ground[0].object.trap = 'poison-needle'; }), /unsupported container trap value/);
  caseRun('noncontainer-with-contents', clone((s) => { s.ground[0].object = { typeId: 'DAGGER', contents: [] }; }), /locked\/lockKnown\/trap\/contents require a container object/);
  caseRun('bad-monster-id', clone((s) => { s.monsters = [{ typeId: 'ORC_OF_TESTING', at: 'east' }]; }), /unsupported monster typeId/);
  caseRun('bad-monster-location', clone((s) => { s.monsters = [{ typeId: 'JACKAL', at: { dx: 100, dy: 0 } }]; }), /location dx is out of range/);
  caseRun('bad-monster-attitude', clone((s) => { s.monsters = [{ typeId: 'JACKAL', at: 'east', attitude: 'annoyed' }]; }), /unsupported monster attitude/);
  caseRun('bad-monster-hp', clone((s) => { s.monsters = [{ typeId: 'JACKAL', at: 'east', hp: 0 }]; }), /monster hp is out of range/);
  caseRun('monster-on-planned-wall', clone((s) => { s.level.terrain = [{ at: 'east', type: 'wall' }]; s.monsters = [{ typeId: 'JACKAL', at: 'east' }]; }), /monster location is not safe/);
  caseRun('monster-on-planned-map-water', clone((s) => { s.level.map = { topLeft: { dx: 1, dy: 0 }, rows: ['~'] }; s.monsters = [{ typeId: 'JACKAL', at: 'east' }]; }), /monster location is not safe/);
  caseRun('monster-on-planned-map-lava', clone((s) => { s.level.map = { topLeft: { dx: 1, dy: 0 }, rows: ['L'] }; s.monsters = [{ typeId: 'JACKAL', at: 'east' }]; }), /monster location is not safe/);
  caseRun('monster-on-planned-closed-door', clone((s) => { s.level.terrain = [{ at: 'east', type: 'door-closed' }]; s.monsters = [{ typeId: 'JACKAL', at: 'east' }]; }), /monster location is not safe/);
  caseRun('bad-terrain-type', clone((s) => { s.level.terrain = [{ at: 'east', type: 'acid' }]; }), /unsupported terrain type/);
  caseRun('bad-terrain-field', clone((s) => { s.level.terrain = [{ at: 'east', type: 'floor', color: 'red' }]; }), /unsupported terrain field/);
  caseRun('bad-map-symbol', clone((s) => { s.level.map = { topLeft: { dx: -1, dy: -1 }, rows: ['.@?', '...'] }; }), /unsupported map terrain symbol|map rows must have equal width/);
  caseRun('bad-map-width', clone((s) => { s.level.map = { topLeft: { dx: -1, dy: -1 }, rows: ['...', '..'] }; }), /map rows must have equal width/);
  caseRun('bad-location-absolute-mixed', clone((s) => { s.ground[0].at = { x: 10, y: 10, dx: 1 }; }), /absolute location requires x\/y only/);
  caseRun('ground-on-planned-water', clone((s) => { s.level.terrain = [{ at: 'hero', type: 'water' }]; }), /terrain cannot block the hero|ground object location is not safe/);
  caseRun('ground-on-planned-nonhero-water', clone((s) => { s.level.terrain = [{ at: 'east', type: 'water' }]; s.ground[0].at = 'east'; }), /ground object location is not safe/);
  caseRun('ground-on-planned-map-wall', clone((s) => { s.level.map = { topLeft: { dx: 1, dy: 0 }, rows: ['-'] }; s.ground[0].at = 'east'; }), /ground object location is not safe/);
  caseRun('ground-on-planned-map-lava', clone((s) => { s.level.map = { topLeft: { dx: 1, dy: 0 }, rows: ['L'] }; s.ground[0].at = 'east'; }), /ground object location is not safe/);
  caseRun('ground-on-planned-closed-door', clone((s) => { s.level.terrain = [{ at: 'east', type: 'door-closed' }]; s.ground[0].at = 'east'; }), /ground object location is not safe/);
  caseRun('closed-door-on-hero-blocks-before-mutation', clone((s) => { s.level.terrain = [{ at: 'hero', type: 'door-closed' }]; }), /terrain cannot block the hero/);
  caseRun('invalid-identity-with-world-mutation-fails-before-load', clone((s) => { s.hero.role = 'Valkyrie'; s.hero.race = 'elf'; s.hero.gender = 'male'; s.hero.alignment = 'chaotic'; s.ground = [{ at: 'hero', object: { typeId: 'APPLE' } }]; }), /invalid hero role\/race/);
  caseRun('unsupported-expected-field', clone((s) => { s.expectedPublicFacts.privateState = ['x']; }), /unsupported expectedPublicFacts field/);
  caseRun('empty-expected-array', clone((s) => { s.expectedPublicFacts.messages = []; }), /expectedPublicFacts arrays cannot be empty/);

  caseRun('top-level-duplicate-field', `{
    "schema": "nethack-electron-test-scenario/v1",
    "schema": "nethack-electron-test-scenario/v1",
    "id": "__negative__/top-level-duplicate-field",
    "phase": "after-level-and-hero-before-first-draw",
    "hero": ${JSON.stringify(baseScenario.hero)},
    "level": ${JSON.stringify(baseScenario.level)},
    "ground": ${JSON.stringify(baseScenario.ground)},
    "monsters": ${JSON.stringify(baseScenario.monsters)},
    "inventory": ${JSON.stringify(baseScenario.inventory)},
    "expectedPublicFacts": ${JSON.stringify(baseScenario.expectedPublicFacts)}
  }`, /duplicate JSON scenario field/);
  caseRun('top-level-missing-required-field', clone((s) => { delete s.phase; }), /scenario JSON is missing required v1 fields/);
  caseRun('nested-duplicate-field', `{
    "schema": "nethack-electron-test-scenario/v1",
    "id": "__negative__/nested-duplicate-field",
    "phase": "after-level-and-hero-before-first-draw",
    "hero": { "placement": "current" },
    "level": { "safeAreaAroundHero": 2, "lit": true, "lit": false, "suppressAdjacentMonsters": true, "pet": "none" },
    "ground": ${JSON.stringify(baseScenario.ground)},
    "monsters": ${JSON.stringify(baseScenario.monsters)},
    "inventory": ${JSON.stringify(baseScenario.inventory)},
    "expectedPublicFacts": ${JSON.stringify(baseScenario.expectedPublicFacts)}
  }`, /duplicate JSON scenario field/);
  caseRun('nested-missing-hero-required-field', clone((s) => { delete s.hero.placement; }), /hero object (?:is missing required v1 fields|cannot be empty)/);
  caseRun('nested-missing-container-required-field', clone((s) => { delete s.ground[0].object.contents; }), /container object is missing required fields/);
  console.log('scenario-loader-negative-test --fixtures: ok');
} finally {
  fs.rmSync(negativeRoot, { recursive: true, force: true });
}
