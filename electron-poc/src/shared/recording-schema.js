(function initRecordingSchema(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ui-protocol-v2'), require('./shim-protocol'));
  else root.NetHackRecordingSchema = factory(root.NetHackUiProtocolV2, root.NetHackShimProtocol);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(UiProtocolV2, ShimProtocol = {}) {
  const v1 = 'nethack-electron-input-recording/v1';
  const v2 = 'nethack-electron-input-recording/v2';

  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function unknownKeys(value, allowed) { return Object.keys(value || {}).filter((key) => !allowed.has(key)); }
  const rootFields = new Set(['schema', 'startedAt', 'createdAt', 'stoppedAt', 'durationMs', 'seed', 'seedSource', 'character', 'playerSpec', 'options', 'settings', 'window', 'metadata', 'events', 'inputs', 'milestones']);
  const recordingIdentityKeys = new Set(['displayName', 'itemName', 'calledName', 'individualName', 'semanticName', 'semanticAppearance', 'appearanceName', 'objectClass', 'actionAffordances']);
  function unsafeRecordingIdentityPath(value, path = '') {
    if (!value || typeof value !== 'object') return '';
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) { const found = unsafeRecordingIdentityPath(value[index], `${path}[${index}]`); if (found) return found; }
      return '';
    }
    for (const [key, nested] of Object.entries(value)) {
      if (recordingIdentityKeys.has(key)) return `${path}.${key}`;
      const found = unsafeRecordingIdentityPath(nested, `${path}.${key}`);
      if (found) return found;
    }
    return '';
  }
  function pickFields(value, allowed) { return Object.fromEntries(Object.entries(value || {}).filter(([key]) => allowed.has(key))); }
  function validateClosed(value, allowed, path) {
    const unknown = unknownKeys(value, allowed);
    return unknown.length ? { ok: false, message: `${path}.${unknown[0]} is not an allowed recording field` } : { ok: true };
  }
  function inputKeycode(input) {
    return Number(input?.keycode || (typeof input?.key === 'string' ? input.key.charCodeAt(0) : 0));
  }
  function validateInput(input, index, path = 'recording.inputs') {
    if (!isPlainObject(input)) return { ok: false, message: `invalid input at ${path}[${index}]` };
    const closed = validateClosed(input, new Set(['type', 't', 'key', 'keycode', 'source']), `${path}[${index}]`);
    if (!closed.ok) return closed;
    if (input.source != null && typeof input.source !== 'string') return { ok: false, message: `${path}[${index}].source must be a string` };
    const keycode = inputKeycode(input);
    if (!Number.isFinite(keycode) || keycode <= 0 || keycode > 126) return { ok: false, message: `invalid input keycode at ${path}[${index}]` };
    return { ok: true };
  }
  function validateV1(recording) {
    const closed = validateClosed(recording, rootFields, 'recording');
    if (!closed.ok) return closed;
    for (const key of ['metadata', 'character', 'milestones', 'options', 'settings', 'window']) {
      const unsafePath = unsafeRecordingIdentityPath(recording[key], `recording.${key}`);
      if (unsafePath) return { ok: false, message: `${unsafePath} is not allowed outside a validated public protocol envelope` };
    }
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
    const closedRoot = validateClosed(recording, rootFields, 'recording');
    if (!closedRoot.ok) return closedRoot;
    for (const key of ['metadata', 'character', 'milestones', 'options', 'settings', 'window']) {
      const unsafePath = unsafeRecordingIdentityPath(recording[key], `recording.${key}`);
      if (unsafePath) return { ok: false, message: `${unsafePath} is not allowed outside a validated public protocol envelope` };
    }
    if (recording.metadata != null) {
      if (!isPlainObject(recording.metadata)) return { ok: false, message: 'recording.metadata must be an object when present' };
      const metadataClosed = validateClosed(recording.metadata, new Set(['recorder', 'contract', 'caveats', 'effectiveSeedCapturedAt']), 'recording.metadata');
      if (!metadataClosed.ok) return metadataClosed;
      if (recording.metadata.caveats != null && (!Array.isArray(recording.metadata.caveats) || recording.metadata.caveats.some((entry) => typeof entry !== 'string'))) return { ok: false, message: 'recording.metadata.caveats must be a string array' };
      if (recording.metadata.effectiveSeedCapturedAt != null && (!Number.isFinite(recording.metadata.effectiveSeedCapturedAt) || recording.metadata.effectiveSeedCapturedAt < 0)) return { ok: false, message: 'recording.metadata.effectiveSeedCapturedAt must be a non-negative elapsed time' };
    }
    if (!Array.isArray(recording.events)) return { ok: false, message: 'recording.events must be an array' };
    for (const [index, event] of recording.events.entries()) {
      if (!isPlainObject(event)) return { ok: false, message: `recording.events[${index}] must be an object` };
      if (event.type === 'input') {
        const closed = validateClosed(event, new Set(['type', 't', 'key', 'keycode', 'source']), `recording.events[${index}]`);
        if (!closed.ok) return closed;
        const checked = validateInput(event, index, 'recording.events');
        if (!checked.ok) return checked;
      } else if (event.type === 'checkpoint') {
        const closed = validateClosed(event, new Set(['type', 't', 'name', 'label']), `recording.events[${index}]`);
        if (!closed.ok) return closed;
        const name = String(event.name || event.label || '').trim();
        if (!name) return { ok: false, message: `checkpoint event at ${index} must have a name` };
      } else if (event.type === 'shim-event') {
        const closed = validateClosed(event, new Set(['type', 't', 'event']), `recording.events[${index}]`);
        if (!closed.ok) return closed;
        if (!isPlainObject(event.event)) return { ok: false, message: `shim-event at ${index} must include an event object` };
        const normalized = ShimProtocol.normalizeRawShimEvent?.(event.event);
        if (!normalized?.valid) return { ok: false, message: `invalid shim-event at recording.events[${index}]` };
        if (JSON.stringify(normalized.event) !== JSON.stringify(event.event)) return { ok: false, message: `shim-event at recording.events[${index}] must already be normalized public data` };
      } else if (event.type === 'ui-protocol-event' || event.type === 'ui-protocol-ack') {
        const closed = validateClosed(event, new Set(['type', 't', 'event']), `recording.events[${index}]`);
        if (!closed.ok) return closed;
        const checked = UiProtocolV2.validateEventEnvelope(event.event);
        if (!checked.ok) return { ok: false, message: `invalid ${event.type} at recording.events[${index}]: ${checked.errors.join('; ')}` };
      } else if (event.type === 'ui-protocol-command') {
        const closed = validateClosed(event, new Set(['type', 't', 'command']), `recording.events[${index}]`);
        if (!closed.ok) return closed;
        const checked = UiProtocolV2.validateCommandEnvelope(event.command);
        if (!checked.ok) return { ok: false, message: `invalid ui-protocol-command at recording.events[${index}]: ${checked.errors.join('; ')}` };
      } else if (event.type === 'screenshot' || event.type === 'state-sidecar') {
        const closed = validateClosed(event, new Set(['type', 't', 'name', 'label', 'path']), `recording.events[${index}]`);
        if (!closed.ok) return closed;
        const checked = validateArtifactReference(event, index);
        if (!checked.ok) return checked;
      } else {
        return { ok: false, message: `unsupported event type at recording.events[${index}]: ${event.type}` };
      }
    }
    if (recording.inputs != null && !Array.isArray(recording.inputs)) return { ok: false, message: 'recording.inputs must be an array when present' };
    if (Array.isArray(recording.inputs)) {
      for (const [index, input] of recording.inputs.entries()) {
        const checked = validateInput(input, index);
        if (!checked.ok) return checked;
      }
      const eventInputs = recording.events.filter((event) => event.type === 'input').map((event) => pickFields(event, new Set(['t', 'key', 'keycode', 'source'])));
      const legacyInputs = recording.inputs.map((input) => pickFields(input, new Set(['t', 'key', 'keycode', 'source'])));
      if (JSON.stringify(legacyInputs) !== JSON.stringify(eventInputs)) return { ok: false, message: 'recording.inputs must exactly mirror the authoritative input events when both are present' };
    }
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
    const root = pickFields(recording, rootFields);
    if (recording.schema === v1) return { ok: true, recording: { ...root, schema: v1, inputs: recording.inputs.map((input) => pickFields(input, new Set(['t', 'key', 'keycode', 'source']))) } };
    const legacyInputs = Array.isArray(recording.inputs) ? recording.inputs.map((input) => pickFields(input, new Set(['t', 'key', 'keycode', 'source']))) : recording.events.filter((event) => event.type === 'input').map(({ type, ...input }) => pickFields(input, new Set(['t', 'key', 'keycode', 'source'])));
    return { ok: true, recording: { ...root, schema: v2, events: recording.events.slice(), inputs: legacyInputs } };
  }
  return Object.freeze({ version: v2, schema: v2, v1, v2, validateRecording, sanitizeForSave });
}));
