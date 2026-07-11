const RecordingSchema = require('./recording-schema');

function keycodeForInput(input = {}) {
  const keycode = Number(input.keycode || (typeof input.key === 'string' ? input.key.charCodeAt(0) : 0));
  return Number.isFinite(keycode) && keycode > 0 && keycode <= 126 ? keycode : 0;
}

const preservedEvidenceTypes = new Set(['shim-event', 'ui-protocol-event', 'ui-protocol-command', 'ui-protocol-ack', 'screenshot', 'state-sidecar']);

function normalizeEvent(event, index) {
  if (!event || typeof event !== 'object') return { type: 'invalid', index, raw: event };
  if (event.type === 'checkpoint') {
    const name = String(event.name || event.label || `checkpoint-${index + 1}`).trim() || `checkpoint-${index + 1}`;
    return { ...event, type: 'checkpoint', name, index };
  }
  if (event.type === 'input') {
    const keycode = keycodeForInput(event);
    return { ...event, type: 'input', keycode, index };
  }
  if (preservedEvidenceTypes.has(event.type)) return { ...event, type: event.type, index, replayable: false };
  return { ...event, type: event.type || 'unknown', index };
}

function normalizeRecording(recording) {
  const checked = RecordingSchema.validateRecording(recording);
  if (!checked.ok) return { ok: false, message: checked.message };
  const source = checked.recording;
  const schemaVersion = source.schema === RecordingSchema.v2 ? 2 : 1;
  const rawEvents = schemaVersion === 2
    ? source.events
    : source.inputs.map((input, index) => ({ ...input, type: 'input', index }));
  const events = rawEvents.map(normalizeEvent);
  const inputs = events.filter((event) => event.type === 'input' && event.keycode);
  const checkpoints = events.filter((event) => event.type === 'checkpoint');
  const preservedEvidence = events.filter((event) => preservedEvidenceTypes.has(event.type));
  const protocolEvents = events.filter((event) => event.type === 'ui-protocol-event' || event.type === 'ui-protocol-ack');
  const protocolCommands = events.filter((event) => event.type === 'ui-protocol-command');
  const shimEvents = events.filter((event) => event.type === 'shim-event');
  const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : metadata.settings;
  const windowMetadata = source.window && typeof source.window === 'object' ? source.window : metadata.window;
  const options = source.options && typeof source.options === 'object' ? source.options : {};
  const startConfig = {
    playerSpec: source.playerSpec || '',
    seed: source.seed != null ? String(source.seed) : '',
    nethackOptions: typeof options.NETHACKOPTIONS === 'string' ? options.NETHACKOPTIONS : '',
    settings: settings && typeof settings === 'object' ? settings : undefined,
    window: windowMetadata && typeof windowMetadata === 'object' ? windowMetadata : undefined,
  };
  const warnings = [];
  for (const event of events) {
    if (event.type === 'input' && !event.keycode) warnings.push(`ignored invalid input event at ${event.index}`);
    if (preservedEvidenceTypes.has(event.type)) warnings.push(`preserved non-replay evidence event type ${event.type} at ${event.index}`);
    else if (!['input', 'checkpoint'].includes(event.type)) warnings.push(`ignored unsupported event type ${event.type} at ${event.index}`);
  }
  return { ok: true, schemaVersion, recording: source, events, inputs, checkpoints, preservedEvidence, protocolEvents, protocolCommands, shimEvents, startConfig, metadata, warnings };
}

module.exports = Object.freeze({ version: 'nethack-replay-adapter/v1', keycodeForInput, normalizeRecording });
