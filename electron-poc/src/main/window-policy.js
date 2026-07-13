const PRODUCTION_MINIMUM = Object.freeze({ width: 960, height: 720 });
const DEFAULT_SIZE = Object.freeze({ width: 1100, height: 760 });

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function testMinimumOverrideEnabled(env = {}) {
  return env.NH_ELECTRON_TEST_MODE === '1' && env.NH_ELECTRON_ALLOW_BELOW_MINIMUM_FOR_TESTS === '1';
}

function browserWindowSizePolicy(env = {}) {
  const requested = Object.freeze({
    width: positiveInteger(env.NH_ELECTRON_WINDOW_WIDTH, DEFAULT_SIZE.width),
    height: positiveInteger(env.NH_ELECTRON_WINDOW_HEIGHT, DEFAULT_SIZE.height),
  });
  const testOverride = testMinimumOverrideEnabled(env);
  const minimum = testOverride ? Object.freeze({ width: 1, height: 1 }) : PRODUCTION_MINIMUM;
  return Object.freeze({
    requested,
    initial: Object.freeze({
      width: testOverride ? requested.width : Math.max(requested.width, minimum.width),
      height: testOverride ? requested.height : Math.max(requested.height, minimum.height),
    }),
    minimum,
    testOverride,
  });
}

module.exports = Object.freeze({ PRODUCTION_MINIMUM, DEFAULT_SIZE, testMinimumOverrideEnabled, browserWindowSizePolicy });
