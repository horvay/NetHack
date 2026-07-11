(function initRecordingSchema(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ui-protocol-v2'));
  else root.NetHackRecordingSchema = factory(root.NetHackUiProtocolV2);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(UiProtocolV2) {
  const v1 = 'nethack-electron-input-recording/v1';
  const v2 = 'nethack-electron-input-recording/v2';

  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function inputKeycode(input) {
    return Number(input?.keycode || (typeof input?.key === 'string' ? input.key.charCodeAt(0) : 0));
  }
  function validateInput(input, index, path = 'recording.inputs') {
    const keycode = inputKeycode(input);
    if (!Number.isFinite(keycode) || keycode <= 0 || keycode > 126) return { ok: false, message: `invalid input keycode at ${path}[${index}]` };
    return { ok: true };
  }
  function validateV1(recording) {
    if (!Array.isArray(recording.inputs)) return { ok: false, message: 'recording.inputs must be an array' };
    for (const [index, input] of recording.inputs.entries()) {
      const checked = validateInput(input, index);
      if (!checked.ok) return checked;
    }
    return { ok: true, recording };
  }
  function validateArtifactReference(event, index) {
    const name = String(event.name || event.label || '').trim();
    if (!name) return { ok: false, message: `artifact event at ${index} must have a name` };
    if (typeof event.path !== 'string' || !event.path.trim()) return { ok: false, message: `artifact event at ${index} must have a path` };
    return { ok: true };
  }
  function validateV2(recording) {
    if (!Array.isArray(recording.events)) return { ok: false, message: 'recording.events must be an array' };
    for (const [index, event] of recording.events.entries()) {
      if (!isPlainObject(event)) return { ok: false, message: `recording.events[${index}] must be an object` };
      if (event.type === 'input') {
        const checked = validateInput(event, index, 'recording.events');
        if (!checked.ok) return checked;
      } else if (event.type === 'checkpoint') {
        const name = String(event.name || event.label || '').trim();
        if (!name) return { ok: false, message: `checkpoint event at ${index} must have a name` };
      } else if (event.type === 'shim-event') {
        if (!isPlainObject(event.event)) return { ok: false, message: `shim-event at ${index} must include an event object` };
      } else if (event.type === 'ui-protocol-event' || event.type === 'ui-protocol-ack') {
        const checked = UiProtocolV2.validateEventEnvelope(event.event);
        if (!checked.ok) return { ok: false, message: `invalid ${event.type} at recording.events[${index}]: ${checked.errors.join('; ')}` };
      } else if (event.type === 'ui-protocol-command') {
        const checked = UiProtocolV2.validateCommandEnvelope(event.command);
        if (!checked.ok) return { ok: false, message: `invalid ui-protocol-command at recording.events[${index}]: ${checked.errors.join('; ')}` };
      } else if (event.type === 'screenshot' || event.type === 'state-sidecar') {
        const checked = validateArtifactReference(event, index);
        if (!checked.ok) return checked;
      } else {
        return { ok: false, message: `unsupported event type at recording.events[${index}]: ${event.type}` };
      }
    }
    if (recording.inputs != null && !Array.isArray(recording.inputs)) return { ok: false, message: 'recording.inputs must be an array when present' };
    let previousV2Sequence = -1;
    for (const [index, event] of recording.events.entries()) {
      if (event.type !== 'ui-protocol-event' && event.type !== 'ui-protocol-ack') continue;
      if (event.event.sequence <= previousV2Sequence) return { ok: false, message: `non-monotonic v2 event sequence at recording.events[${index}]` };
      previousV2Sequence = event.event.sequence;
    }
    return { ok: true, recording };
  }
  function validateRecording(recording) {
    if (!recording || typeof recording !== 'object') return { ok: false, message: 'recording must be an object' };
    if (recording.schema === v1) return validateV1(recording);
    if (recording.schema === v2) return validateV2(recording);
    return { ok: false, message: `unsupported recording schema: ${recording.schema}` };
  }
  function sanitizeForSave(recording) {
    const checked = validateRecording(recording);
    if (!checked.ok) return checked;
    if (recording.schema === v1) return { ok: true, recording: { ...recording, schema: v1, inputs: recording.inputs.slice() } };
    const legacyInputs = Array.isArray(recording.inputs) ? recording.inputs.slice() : recording.events.filter((event) => event.type === 'input').map(({ type, ...input }) => input);
    return { ok: true, recording: { ...recording, schema: v2, events: recording.events.slice(), inputs: legacyInputs } };
  }
  return Object.freeze({ version: v2, schema: v2, v1, v2, validateRecording, sanitizeForSave });
}));
