function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
function cloneFreeze(value, seen = new WeakSet()) {
  const valueType = typeof value;
  if (value === null || valueType === 'undefined' || valueType === 'boolean' || valueType === 'number' || valueType === 'string' || valueType === 'bigint') return value;
  const isArray = Array.isArray(value);
  if (isArray ? Reflect.getPrototypeOf(value) !== Array.prototype : !isPlainObject(value)) throw new TypeError('IPC payload must contain only plain objects, standard arrays, and primitive values');
  if (seen.has(value)) throw new TypeError('IPC payload must not contain cycles');
  seen.add(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === 'symbol')) throw new TypeError('IPC payload must not contain symbol-keyed properties');
  const cloned = isArray ? new Array(value.length) : {};
  for (const key of keys) {
    if (isArray && key === 'length') continue;
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable) {
      throw new TypeError('IPC payload properties must be enumerable own data properties');
    }
    Object.defineProperty(cloned, key, { value: cloneFreeze(descriptor.value, seen), enumerable: true, writable: true, configurable: true });
  }
  seen.delete(value);
  return Object.freeze(cloned);
}
function validStartSize(size = {}) {
  if (!isPlainObject(size)) return {};
  const cols = Number(size.cols || 100);
  const rows = Number(size.rows || 30);
  const seed = String(size.seed || '').trim();
  return { cols: Number.isFinite(cols) ? Math.max(20, Math.min(240, cols)) : 100, rows: Number.isFinite(rows) ? Math.max(10, Math.min(80, rows)) : 30, ...(seed ? { seed } : {}) };
}
function validShimOptions(options = {}) {
  if (!isPlainObject(options)) return {};
  const out = {
    playerSpec: typeof options.playerSpec === 'string' ? options.playerSpec.slice(0, 80) : '',
    seed: typeof options.seed === 'string' || typeof options.seed === 'number' ? String(options.seed).slice(0, 32) : '',
    nethackOptions: typeof options.nethackOptions === 'string' ? options.nethackOptions.slice(0, 200) : '',
  };
  if (process.env.NH_ELECTRON_TEST_FIXTURES === '1') {
    out.scenarioId = typeof options.scenarioId === 'string' ? options.scenarioId.slice(0, 120) : '';
    out.testRoot = typeof options.testRoot === 'string' ? options.testRoot.slice(0, 512) : '';
  }
  return out;
}
function validRecording(recording) {
  if (!isPlainObject(recording)) throw new TypeError('invalid recording payload');
  if (recording.schema === 'nethack-electron-input-recording/v1' && Array.isArray(recording.inputs)) return recording;
  if (recording.schema === 'nethack-electron-input-recording/v2' && Array.isArray(recording.events)) return recording;
  throw new TypeError('invalid recording payload');
}
function validKey(key) {
  const text = String(key || '');
  if (text.length !== 1) throw new TypeError('key must be exactly one character');
  const code = text.charCodeAt(0);
  if (code < 1 || code > 126) throw new TypeError('key must be printable ASCII/control range 1..126');
  return text;
}
function validShimInput(payload) {
  if (!isPlainObject(payload) || typeof payload.type !== 'string') throw new TypeError('shim input must be an object with type');
  return payload;
}
function validUiCommand(command) {
  if (!isPlainObject(command)) throw new TypeError('ui command must be a plain object');
  if (command.protocol !== 'nethack-electron-ui/v2') throw new TypeError('ui command must use protocol v2');
  if (typeof command.commandType !== 'string' || !command.commandType) throw new TypeError('ui command must include commandType');
  if (typeof command.commandId !== 'string' || !command.commandId) throw new TypeError('ui command must include commandId');
  return command;
}
function validDiagnosticEvent(event) {
  if (!isPlainObject(event)) throw new TypeError('diagnostic event must be an object');
  return {
    layer: typeof event.layer === 'string' ? event.layer.slice(0, 64) : 'renderer',
    category: typeof event.category === 'string' ? event.category.slice(0, 64) : 'diagnostic',
    type: typeof event.type === 'string' ? event.type.slice(0, 128) : 'renderer.event',
    transactionId: typeof event.transactionId === 'string' ? event.transactionId.slice(0, 128) : '',
    requestId: typeof event.requestId === 'string' ? event.requestId.slice(0, 128) : '',
    payload: isPlainObject(event.payload) ? event.payload : {},
  };
}
function subscribe(ipcRenderer, channel, callback) {
  if (typeof callback !== 'function') throw new TypeError(`${channel} callback must be a function`);
  const listener = (_event, data) => callback(cloneFreeze(data));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
module.exports = Object.freeze({ version: 'nethack-preload-contract/v1', validStartSize, validShimOptions, validRecording, validKey, validShimInput, validUiCommand, validDiagnosticEvent, subscribe, cloneFreeze });
