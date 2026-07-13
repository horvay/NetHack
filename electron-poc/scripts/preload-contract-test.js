'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Security = require('../src/main/electron-security');
const PreloadContract = require('../src/shared/preload-contract');

const root = path.resolve(__dirname, '..');

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, 'every cloned array/object must be frozen');
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) assertDeepFrozen(descriptor.value, seen);
  }
}

function assertLosslessClone(cloneFreeze, label) {
  const source = {
    nested: { array: [1, { value: 'kept' }, [-0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]] },
    undefinedValue: undefined,
    bigintValue: 12n,
  };
  const clone = cloneFreeze(source);
  assert.notEqual(clone, source, `${label}: root must be cloned`);
  assert.notEqual(clone.nested, source.nested, `${label}: nested objects must be cloned`);
  assert.notEqual(clone.nested.array, source.nested.array, `${label}: nested arrays must be cloned`);
  assert.equal(clone.nested.array[1].value, 'kept', `${label}: nested values survive cloning`);
  assert.equal(Object.is(clone.nested.array[2][0], -0), true, `${label}: negative zero identity is preserved`);
  assert.equal(Number.isNaN(clone.nested.array[2][1]), true, `${label}: NaN is preserved`);
  assert.equal(clone.nested.array[2][2], Number.POSITIVE_INFINITY, `${label}: positive Infinity is preserved`);
  assert.equal(clone.nested.array[2][3], Number.NEGATIVE_INFINITY, `${label}: negative Infinity is preserved`);
  assert.equal(Object.prototype.hasOwnProperty.call(clone, 'undefinedValue'), true, `${label}: explicit undefined is not dropped`);
  assert.equal(clone.bigintValue, 12n, `${label}: bigint is preserved`);
  assertDeepFrozen(clone);

  source.nested.array[1].value = 'mutated';
  source.nested.array.push('later');
  assert.equal(clone.nested.array[1].value, 'kept', `${label}: source mutation cannot change clone`);
  assert.equal(clone.nested.array.length, 3, `${label}: source array mutation cannot change clone`);
  assert.throws(() => { clone.nested.array[1].value = 'changed'; }, TypeError, `${label}: clone mutation is rejected`);

  const repeated = { value: 1 };
  const repeatedClone = cloneFreeze({ first: repeated, second: repeated });
  assert.deepEqual(repeatedClone.first, repeatedClone.second, `${label}: repeated acyclic values retain equal content`);
  assert.notEqual(repeatedClone.first, repeatedClone.second, `${label}: repeated values are independently immutable clones`);

  const sparseArray = [];
  sparseArray.length = 3;
  sparseArray[1] = 'middle';
  sparseArray.extra = { safe: true };
  sparseArray.map = 'own map data, not executable behavior';
  const sparseClone = cloneFreeze(sparseArray);
  assert.equal(0 in sparseClone, false, `${label}: sparse array holes are retained`);
  assert.equal(sparseClone[1], 'middle', `${label}: sparse array indices are retained`);
  assert.deepEqual(sparseClone.extra, { safe: true }, `${label}: enumerable array data properties are retained`);
  assert.equal(Object.isFrozen(sparseClone.extra), true, `${label}: nested array-extra data is deeply frozen`);
  assert.equal(sparseClone.map, 'own map data, not executable behavior', `${label}: cloning does not invoke an input-owned map property`);
  assertDeepFrozen(sparseClone);

  const directCycle = {};
  directCycle.self = directCycle;
  assert.throws(() => cloneFreeze(directCycle), /must not contain cycles/, `${label}: direct object cycles reject`);
  const indirectCycle = { array: [] };
  indirectCycle.array.push({ parent: indirectCycle });
  assert.throws(() => cloneFreeze(indirectCycle), /must not contain cycles/, `${label}: indirect object/array cycles reject`);

  for (const unsupported of [new Date(0), new Map(), new Set(), /x/, new (class Payload {})(), () => {}, Symbol('payload')]) {
    assert.throws(() => cloneFreeze(unsupported), /only plain objects, standard arrays, and primitive values/, `${label}: unsupported/non-plain values reject`);
  }

  const spoofPrototype = Object.create(null);
  Object.defineProperty(spoofPrototype, 'constructor', { value: Object, enumerable: true });
  spoofPrototype.behavior = () => 'must not survive';
  const spoofed = Object.create(spoofPrototype);
  spoofed.safe = true;
  assert.throws(() => cloneFreeze(spoofed), /only plain objects, standard arrays/, `${label}: a custom prototype cannot spoof plainness with constructor=Object`);

  class ArraySubclass extends Array {}
  assert.throws(() => cloneFreeze(new ArraySubclass(1, 2)), /only plain objects, standard arrays/, `${label}: array subclasses reject`);
  const customArrayPrototype = [];
  Object.setPrototypeOf(customArrayPrototype, Object.create(Array.prototype));
  assert.throws(() => cloneFreeze(customArrayPrototype), /only plain objects, standard arrays/, `${label}: arrays with custom prototypes reject`);
  let speciesReads = 0;
  class SpeciesArray extends Array {
    static get [Symbol.species]() { speciesReads += 1; return Array; }
  }
  assert.throws(() => cloneFreeze(new SpeciesArray(1)), /only plain objects, standard arrays/, `${label}: species-bearing subclasses reject`);
  assert.equal(speciesReads, 0, `${label}: species behavior is never consulted`);
  const ownSpeciesArray = [];
  const ownSpeciesConstructor = {};
  Object.defineProperty(ownSpeciesConstructor, Symbol.species, { get() { speciesReads += 1; return Array; } });
  ownSpeciesArray.constructor = ownSpeciesConstructor;
  assert.throws(() => cloneFreeze(ownSpeciesArray), /symbol-keyed/, `${label}: own species-bearing constructor data rejects`);
  assert.equal(speciesReads, 0, `${label}: own species accessors are never consulted`);
  const executableMap = [];
  let mapCalls = 0;
  executableMap.map = () => { mapCalls += 1; };
  assert.throws(() => cloneFreeze(executableMap), /only plain objects, standard arrays, and primitive values/, `${label}: executable own map values reject`);
  assert.equal(mapCalls, 0, `${label}: own map behavior is never invoked`);

  const hiddenSymbol = Symbol('hidden');
  const symbolValue = { visible: true, [hiddenSymbol]: () => 'unsupported' };
  assert.throws(() => cloneFreeze(symbolValue), /symbol-keyed/, `${label}: symbol-keyed unsupported values reject rather than disappearing`);
  const symbolCycle = {};
  symbolCycle[hiddenSymbol] = symbolCycle;
  assert.throws(() => cloneFreeze(symbolCycle), /symbol-keyed/, `${label}: symbol-only cycles reject rather than disappearing`);
  const symbolArray = [];
  symbolArray[hiddenSymbol] = 'hidden';
  assert.throws(() => cloneFreeze(symbolArray), /symbol-keyed/, `${label}: array symbol extras reject consistently`);

  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'secret', { enumerable: true, get() { getterCalls += 1; return 'value'; } });
  assert.throws(() => cloneFreeze(accessor), /data properties/, `${label}: accessors reject`);
  assert.equal(getterCalls, 0, `${label}: accessors are inspected without invocation`);
  const nonEnumerable = { visible: true };
  Object.defineProperty(nonEnumerable, 'hidden', { value: 'value' });
  assert.throws(() => cloneFreeze(nonEnumerable), /data properties/, `${label}: non-enumerable data rejects rather than disappearing`);
  const readOnlyData = {};
  Object.defineProperty(readOnlyData, 'fixed', { value: { kept: true }, enumerable: true, writable: false, configurable: false });
  const readOnlyClone = cloneFreeze(readOnlyData);
  assert.deepEqual(readOnlyClone.fixed, { kept: true }, `${label}: enumerable data from an already-frozen record is preserved`);
  assertDeepFrozen(readOnlyClone);

  let proxyOwnKeysCalls = 0;
  const guardedProxy = new Proxy({}, {
    getPrototypeOf() { throw new TypeError('proxy prototype trap rejected'); },
    ownKeys() { proxyOwnKeysCalls += 1; return []; },
  });
  assert.throws(() => cloneFreeze(guardedProxy), /proxy prototype trap rejected/, `${label}: safely detectable hostile proxies reject before key iteration`);
  assert.equal(proxyOwnKeysCalls, 0, `${label}: proxy-controlled ownKeys is not invoked after prototype rejection`);

  const foreignRecord = vm.runInNewContext('({ nested: [1, { ok: true }] })');
  assert.throws(() => cloneFreeze(foreignRecord), /only plain objects, standard arrays/, `${label}: synthetic foreign-realm objects do not weaken strict prototype checks`);

  const nullPrototype = Object.create(null);
  nullPrototype.safe = { value: 1 };
  const nullPrototypeClone = cloneFreeze(nullPrototype);
  assert.deepEqual(nullPrototypeClone, { safe: { value: 1 } }, `${label}: null-prototype data objects clone as inert plain data`);
  assertDeepFrozen(nullPrototypeClone);
  const customNullRootedPrototype = Object.create(null);
  customNullRootedPrototype.kind = 'custom';
  const customNullRootedValue = Object.create(customNullRootedPrototype);
  customNullRootedValue.safe = true;
  assert.throws(() => cloneFreeze(customNullRootedValue), /only plain objects, standard arrays, and primitive values/, `${label}: custom null-rooted prototypes are not mistaken for plain objects`);

  const protoKeySource = Object.fromEntries([['__proto__', { polluted: true }], ['safe', true]]);
  const protoKeyClone = cloneFreeze(protoKeySource);
  assert.equal(Object.getPrototypeOf(protoKeyClone), Object.prototype, `${label}: clone has the ordinary safe prototype`);
  assert.equal(Object.prototype.hasOwnProperty.call(protoKeyClone, '__proto__'), true, `${label}: __proto__ remains an own data key`);
  assert.equal({}.polluted, undefined, `${label}: cloning cannot pollute Object.prototype`);
}

assertLosslessClone(PreloadContract.cloneFreeze, 'shared contract');

const listeners = new Map();
const removals = [];
const invocations = [];
let exposed;
const sandbox = {
  process: { env: {} },
  require(name) {
    assert.equal(name, 'electron', 'sandboxed preload requires only Electron');
    return {
      contextBridge: { exposeInMainWorld(name, api) { assert.equal(name, 'netHackPOC'); exposed = api; } },
      ipcRenderer: {
        invoke(channel, payload) { invocations.push({ channel, payload }); return Promise.resolve({ ok: true }); },
        send() {},
        on(channel, listener) { listeners.set(channel, listener); },
        removeListener(channel, listener) { removals.push({ channel, listener }); },
      },
    };
  },
};
const preloadContext = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/preload.js'), 'utf8'), preloadContext, { filename: 'preload.js' });
assert.ok(exposed, 'preload exposes its context-isolated API');
assert.equal(Object.isFrozen(exposed), true, 'exposed preload API is immutable');
assert.equal(exposed.version, PreloadContract.version, 'inline and shared versions agree');

let delivered;
const unsubscribe = exposed.onShimEvent((value) => { delivered = value; });
const inlineListener = listeners.get('nethack:shimEvent');
assert.equal(typeof inlineListener, 'function', 'inline preload subscribes only through the declared IPC channel');
const inlineSource = vm.runInContext('({ nested: [{ value: "inline" }], special: [-0, Number.NaN, Number.POSITIVE_INFINITY] })', preloadContext);
inlineListener({}, inlineSource);
assert.equal(delivered.nested[0].value, 'inline');
assert.equal(Object.is(delivered.special[0], -0), true, 'inline clone preserves negative zero');
assert.equal(Number.isNaN(delivered.special[1]), true, 'inline clone preserves NaN');
assert.equal(delivered.special[2], Number.POSITIVE_INFINITY, 'inline clone preserves Infinity');
assertDeepFrozen(delivered);
inlineSource.nested[0].value = 'mutated';
assert.equal(delivered.nested[0].value, 'inline', 'inline callback cannot observe later source mutation');

const inlineCycle = vm.runInContext('(() => { const value = {}; value.self = value; return value; })()', preloadContext);
assert.throws(() => inlineListener({}, inlineCycle), /must not contain cycles/, 'inline preload rejects cyclic IPC payloads');
const inlineDate = vm.runInContext('new Date(0)', preloadContext);
assert.throws(() => inlineListener({}, inlineDate), /only plain objects, standard arrays, and primitive values/, 'inline preload rejects non-plain IPC payloads');
for (const [source, pattern, message] of [
  ['(() => { const proto = Object.create(null); proto.constructor = Object; const value = Object.create(proto); value.safe = true; return value; })()', /only plain objects, standard arrays/, 'spoofed constructor prototype'],
  ['new (class extends Array {})(1, 2)', /only plain objects, standard arrays/, 'array subclass'],
  ['(() => { const value = []; Object.setPrototypeOf(value, Object.create(Array.prototype)); return value; })()', /only plain objects, standard arrays/, 'custom array prototype'],
  ['(() => { class Value extends Array { static get [Symbol.species]() { throw new Error("species invoked"); } } return new Value(1); })()', /only plain objects, standard arrays/, 'species-bearing array subclass without invoking species'],
  ['(() => { const value = []; const constructor = {}; Object.defineProperty(constructor, Symbol.species, { get() { throw new Error("species invoked"); } }); value.constructor = constructor; return value; })()', /symbol-keyed/, 'own species-bearing array constructor without invoking species'],
  ['(() => { const value = []; value.map = () => { throw new Error("map invoked"); }; return value; })()', /only plain objects, standard arrays, and primitive values/, 'executable own array map without invoking map'],
  ['(() => { const symbol = Symbol("hidden"); return { [symbol]: Symbol("value") }; })()', /symbol-keyed/, 'symbol-keyed unsupported value'],
  ['(() => { const symbol = Symbol("cycle"); const value = {}; value[symbol] = value; return value; })()', /symbol-keyed/, 'symbol-only cycle'],
  ['(() => { const value = {}; Object.defineProperty(value, "hidden", { value: 1 }); return value; })()', /data properties/, 'non-enumerable property'],
]) {
  const value = vm.runInContext(source, preloadContext);
  assert.throws(() => inlineListener({}, value), pattern, `inline preload rejects ${message}`);
}
let inlineGetterCalls = 0;
sandbox.inlineGetterCalls = () => { inlineGetterCalls += 1; };
const inlineAccessor = vm.runInContext('(() => { const value = {}; Object.defineProperty(value, "secret", { enumerable: true, get() { inlineGetterCalls(); return 1; } }); return value; })()', preloadContext);
assert.throws(() => inlineListener({}, inlineAccessor), /data properties/, 'inline preload rejects accessors');
assert.equal(inlineGetterCalls, 0, 'inline preload never invokes rejected accessors');
let inlineProxyOwnKeysCalls = 0;
sandbox.inlineProxyOwnKeysCall = () => { inlineProxyOwnKeysCalls += 1; };
const inlineProxy = vm.runInContext('new Proxy({}, { getPrototypeOf() { throw new TypeError("inline proxy rejected"); }, ownKeys() { inlineProxyOwnKeysCall(); return []; } })', preloadContext);
assert.throws(() => inlineListener({}, inlineProxy), /inline proxy rejected/, 'inline preload rejects a safely detectable hostile proxy');
assert.equal(inlineProxyOwnKeysCalls, 0, 'inline preload does not invoke proxy ownKeys after prototype rejection');
unsubscribe();
assert.equal(removals.length, 1, 'unsubscribe removes exactly its own listener');
assert.equal(removals[0].channel, 'nethack:shimEvent');
assert.equal(removals[0].listener, inlineListener);

const crossRealmCommand = {
  protocol: 'nethack-electron-ui/v2',
  commandType: 'action.execute',
  commandId: 'preload-contract-command',
};
assert.throws(() => exposed.uiCommand(crossRealmCommand), /plain object/, 'synthetic foreign-realm objects are not treated as proof of Electron contextBridge compatibility');
const inlineRealmCommand = vm.runInContext(`({ protocol: 'nethack-electron-ui/v2', commandType: 'action.execute', commandId: 'preload-contract-command' })`, preloadContext);
assert.doesNotThrow(() => exposed.uiCommand(inlineRealmCommand), 'same-realm plain command records remain valid in the inline contract probe');
assert.throws(() => PreloadContract.validUiCommand(new (class Command {})()), /plain object/, 'non-plain command payloads fail validation');
assert.equal(invocations[0].channel, 'nethack:uiCommand', 'validated commands retain the declared IPC contract');

const preferences = Security.secureWebPreferences({ preload: '/safe/preload.js' });
assert.deepEqual(preferences, {
  preload: '/safe/preload.js',
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
}, 'preload contract remains behind hardened context-isolated web preferences');
assert.equal(Object.isFrozen(preferences), true, 'security preferences are immutable');

console.log('preload security and lossless clone contract OK');
