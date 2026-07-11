const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const UiProtocolV2 = require('./ui-protocol-v2');

async function readJsonl(file) {
  const text = await fs.readFile(file, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function electronEnv(overrides = {}) {
  return { ...process.env, NH_ELECTRON_SHOW: '0', ...overrides };
}

function repoRelative(...parts) {
  return path.join(__dirname, '..', '..', ...parts);
}

function createUiEventFactory(options = {}) {
  const prefix = options.prefix || 'test';
  const source = options.source || { layer: 'test' };
  const defaultTurn = Number.isInteger(options.turn) ? options.turn : 0;
  let sequence = Number.isInteger(options.sequenceStart) ? options.sequenceStart : 0;

  function envelope(eventType, payload = {}, overrides = {}) {
    sequence += 1;
    const nextSequence = Number.isInteger(overrides.sequence) ? overrides.sequence : sequence;
    return {
      protocol: UiProtocolV2.protocol,
      sequence: nextSequence,
      eventId: overrides.eventId || `evt-${prefix}-${nextSequence}-${eventType}`,
      eventType,
      turn: Number.isInteger(overrides.turn) ? overrides.turn : defaultTurn,
      source: overrides.source || source,
      payload,
    };
  }

  function valid(eventType, payload = {}, overrides = {}) {
    const event = envelope(eventType, payload, overrides);
    const checked = UiProtocolV2.validateEventEnvelope(event);
    assert.equal(checked.ok, true, checked.errors.join('\n'));
    return event;
  }

  return Object.freeze({ envelope, valid });
}

function assertValidUiEvent(event, message = 'expected valid UI protocol event') {
  const checked = UiProtocolV2.validateEventEnvelope(event);
  assert.equal(checked.ok, true, `${message}\n${checked.errors.join('\n')}`.trim());
  return event;
}

function assertInvalidUiEvent(event, message = 'expected invalid UI protocol event') {
  const checked = UiProtocolV2.validateEventEnvelope(event);
  assert.equal(checked.ok, false, message);
  return checked;
}

function effectOf(result, type) {
  return (result?.effects || []).find((effect) => effect.type === type);
}

module.exports = Object.freeze({
  version: 'nethack-test-harness/v2',
  readJsonl,
  electronEnv,
  repoRelative,
  createUiEventFactory,
  assertValidUiEvent,
  assertInvalidUiEvent,
  effectOf,
});
