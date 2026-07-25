const MAX_UINT64 = 18446744073709551615n;
const LAUNCH_CONTROL_ENV_KEYS = [
  'NETHACK_SEED',
  'NH_ELECTRON_CHOSEN_SEED',
  'NH_TEST_SCENARIO_ID',
  'NH_TEST_PLAYGROUND',
  'NH_TEST_FORCE_DOWNSTAIRS_UNDER_HERO',
];

const ALLOWED_NETHACK_OPTIONS = new Set([
  '!tutorial', 'tutorial',
  'autopickup', '!autopickup',
  'number_pad:0',
  'pickup_types:$',
  'disclose:+i +a +v +g +c +o',
  'time', '!time',
  'showscore', '!showscore',
  'showexp', '!showexp',
  'showvers', '!showvers',
  'weaponstatus', '!weaponstatus',
  'armorstatus', '!armorstatus',
  'terrainstatus', '!terrainstatus',
]);

function normalizeSeed(seed) {
  const raw = String(seed ?? '').trim();
  if (!raw) return undefined;
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(raw)) return undefined;
  const value = BigInt(raw);
  if (value < 0n || value > MAX_UINT64) return undefined;
  return value.toString(10);
}

function normalizeNetHackOptions(value) {
  const requested = String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
  const filtered = requested.filter((option) => ALLOWED_NETHACK_OPTIONS.has(option));
  if (!filtered.includes('!tutorial') && !filtered.includes('tutorial')) filtered.unshift('!tutorial');
  return filtered.join(',') || '!tutorial';
}

function testFixturesEnabled(env = process.env) {
  return env.NH_ELECTRON_TEST_FIXTURES === '1';
}

function launchEnv(env = process.env) {
  const childEnv = { ...env };
  for (const key of LAUNCH_CONTROL_ENV_KEYS) delete childEnv[key];
  return childEnv;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function validScenarioId(value) {
  const candidate = String(value || '').trim();
  return /^[a-z0-9/_-]+$/i.test(candidate) ? candidate : undefined;
}

function validPlayground(value) {
  const candidate = String(value || '').trim();
  return candidate && !candidate.includes('\0') ? candidate : undefined;
}

function scenarioEnvForOptions(options = {}, env = process.env) {
  const scenarioEnv = {};
  if (!testFixturesEnabled(env)) return scenarioEnv;
  const playground = validPlayground(options.testRoot) || validPlayground(env.NH_TEST_PLAYGROUND);
  const scenarioId = validScenarioId(options.scenarioId) || validScenarioId(env.NH_TEST_SCENARIO_ID);
  if (playground) scenarioEnv.NH_TEST_PLAYGROUND = playground;
  if (scenarioId) scenarioEnv.NH_TEST_SCENARIO_ID = scenarioId;
  if (env.NH_TEST_FORCE_DOWNSTAIRS_UNDER_HERO === '1') scenarioEnv.NH_TEST_FORCE_DOWNSTAIRS_UNDER_HERO = '1';
  return scenarioEnv;
}

function ttyLaunchConfig({ size = {}, nethackBin, env = process.env } = {}) {
  const cols = Number(size.cols || 100);
  const rows = Number(size.rows || 30);
  const seed = testFixturesEnabled(env) ? normalizeSeed(size.seed) : undefined;
  const command = `stty cols ${cols} rows ${rows}; exec ${shellQuote(nethackBin)}`;
  return {
    executable: 'script',
    args: ['-qfec', command, '/dev/null'],
    cols,
    rows,
    seed,
    env: { ...launchEnv(env), TERM: 'xterm-256color', ...(seed ? { NETHACK_SEED: seed } : {}) },
  };
}

function shimLaunchConfig({ options = {}, env = process.env, nethackOptions, seed } = {}) {
  const args = [];
  if (typeof options.playerSpec === 'string' && options.playerSpec.trim()) args.push(options.playerSpec.trim());
  const chosenOptions = normalizeNetHackOptions(nethackOptions || options.nethackOptions || env.NETHACKOPTIONS || '!tutorial');
  const chosenSeed = normalizeSeed(seed);
  return {
    args,
    seed: chosenSeed,
    nethackOptions: chosenOptions,
    env: {
      ...launchEnv(env),
      ...scenarioEnvForOptions(options, env),
      NETHACKOPTIONS: chosenOptions,
      ...(chosenSeed ? { NETHACK_SEED: chosenSeed, NH_ELECTRON_CHOSEN_SEED: chosenSeed } : {}),
    },
  };
}

module.exports = Object.freeze({
  version: 'nethack-electron-launch-policy/v1',
  normalizeSeed,
  normalizeNetHackOptions,
  testFixturesEnabled,
  launchEnv,
  scenarioEnvForOptions,
  shellQuote,
  ttyLaunchConfig,
  shimLaunchConfig,
});
