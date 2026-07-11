#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonl(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${file}:${index + 1}: malformed JSONL: ${error.message}`); }
  });
}

function verifyBundle(runDir, { strict = false } = {}) {
  assert.ok(runDir, 'run folder is required');
  const required = ['run.json', 'events.jsonl', 'summary.json', 'index.json'];
  for (const file of required) assert.ok(fs.existsSync(path.join(runDir, file)), `${file} exists`);
  const run = readJson(path.join(runDir, 'run.json'));
  const summary = readJson(path.join(runDir, 'summary.json'));
  const index = readJson(path.join(runDir, 'index.json'));
  const events = readJsonl(path.join(runDir, 'events.jsonl'));
  assert.equal(run.schema, 'nethack-electron-diagnostic-run/v1', 'run schema');
  assert.equal(summary.schema, 'nethack-electron-diagnostic-summary/v1', 'summary schema');
  assert.equal(index.schema, 'nethack-electron-diagnostic-index/v1', 'index schema');
  assert.equal(summary.runId, run.runId, 'summary runId matches');
  assert.equal(index.runId, run.runId, 'index runId matches');
  let previousSeq = 0;
  const seenSeq = new Set();
  for (const event of events) {
    assert.equal(event.schema, 'nethack-electron-diagnostic-event/v1', `event ${event.seq} schema`);
    assert.equal(event.runId, run.runId, `event ${event.seq} runId`);
    assert.ok(Number.isInteger(event.seq), `event seq is integer`);
    assert.ok(event.seq > previousSeq, `seq ${event.seq} is monotonic after ${previousSeq}`);
    assert.ok(!seenSeq.has(event.seq), `seq ${event.seq} is unique`);
    seenSeq.add(event.seq);
    previousSeq = event.seq;
    assert.ok(event.at, `event ${event.seq} timestamp`);
    assert.ok(event.layer && event.category && event.type, `event ${event.seq} has routing fields`);
  }
  assert.equal(index.lastSeq, previousSeq, 'index lastSeq matches events');
  assert.equal(index.eventCount, events.length, 'index eventCount matches events');
  const actualCounts = events.reduce((acc, event) => { acc[event.category] = (acc[event.category] || 0) + 1; return acc; }, {});
  assert.deepEqual(index.counts, actualCounts, 'index category counts match events');
  assert.deepEqual(summary.counts, actualCounts, 'summary category counts match events');
  assert.ok(run.seed?.chosen, 'chosen seed recorded');
  assert.ok(summary.seed?.chosen, 'summary chosen seed recorded');
  const seedEvents = events.filter((event) => event.category === 'seed');
  assert.ok(seedEvents.some((event) => event.type === 'seed.chosen'), 'seed.chosen event recorded');
  if (run.seed.enforced !== false) {
    assert.ok(run.seed.effective || events.some((event) => event.type === 'seed.mismatch'), 'effective bridge seed recorded or mismatch marker present');
    if (run.seed.effective) assert.equal(String(run.seed.effective), String(run.seed.chosen), 'effective bridge seed matches chosen seed');
  }
  const rawShim = events.filter((event) => event.type === 'shim.raw.stdout');
  const parsedShim = events.filter((event) => event.type === 'shim.event.parsed');
  assert.equal(parsedShim.length, rawShim.length, 'raw shim and parsed shim event counts match one-to-one');
  for (const raw of rawShim) {
    let rawName = '';
    try {
      const parsedRawLine = JSON.parse(String(raw.payload?.line || '{}'));
      rawName = parsedRawLine.name || parsedRawLine.event?.name || parsedRawLine.type || '';
    } catch {}
    const adjacent = events.find((event) => event.seq === raw.seq + 1);
    assert.ok(adjacent && adjacent.type === 'shim.event.parsed', `raw shim line at seq ${raw.seq} is immediately followed by parsed representation`);
    assert.ok(!rawName || adjacent.payload?.name === rawName || adjacent.payload?.event?.name === rawName, `raw shim line at seq ${raw.seq} parsed name matches ${rawName}`);
  }
  for (const parsed of parsedShim) {
    const previous = events.find((event) => event.seq === parsed.seq - 1);
    assert.ok(previous && previous.type === 'shim.raw.stdout', `parsed shim event at seq ${parsed.seq} has preceding raw pair`);
  }
  if (fs.existsSync(path.join(runDir, 'shim-raw.jsonl'))) {
    const shimRawEvents = readJsonl(path.join(runDir, 'shim-raw.jsonl'));
    assert.deepEqual(shimRawEvents.map((event) => event.seq), rawShim.map((event) => event.seq), 'shim-raw seq view matches raw stdout events');
  }
  function assertNoPrivateSemanticNames(value, location = '$') {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoPrivateSemanticNames(item, `${location}[${index}]`));
      return;
    }
    assert.ok(!(value.semanticKnown === false && Object.prototype.hasOwnProperty.call(value, 'semanticName')), `${location}: unknown semanticName is redacted`);
    assert.ok(!(value.objectLayerSemanticKnown === false && Object.prototype.hasOwnProperty.call(value, 'objectLayerSemanticName')), `${location}: unknown objectLayerSemanticName is redacted`);
    assert.ok(!(value.backgroundSemanticKnown === false && Object.prototype.hasOwnProperty.call(value, 'backgroundSemanticName')), `${location}: unknown backgroundSemanticName is redacted`);
    for (const [key, item] of Object.entries(value)) assertNoPrivateSemanticNames(item, `${location}.${key}`);
  }
  assertNoPrivateSemanticNames(events);
  const visibleMessages = events.filter((event) => event.type === 'message.visible.appended');
  if (fs.existsSync(path.join(runDir, 'message-log.jsonl'))) {
    const messageEvents = readJsonl(path.join(runDir, 'message-log.jsonl'));
    assert.deepEqual(messageEvents.map((event) => event.seq), events.filter((event) => event.category === 'message').map((event) => event.seq), 'message-log seq view matches message events');
  }
  const sent = events.filter((event) => event.type === 'shim-send.sent' || event.type === 'shim.stdin.write');
  if (strict) {
    assert.ok(visibleMessages.length > 0, 'strict: at least one visible message logged');
    assert.ok(rawShim.length > 0, 'strict: raw shim stdout preserved');
    assert.ok(sent.length > 0, 'strict: user/shim input logged');
    assert.ok(events.some((event) => event.category === 'prompt' || event.category === 'menu'), 'strict: prompt/menu lifecycle or effects logged');
  }
  const droppedRequired = index.dropped || {};
  for (const category of ['message', 'shim-send', 'prompt', 'menu', 'transaction', 'error', 'process', 'seed']) {
    assert.equal(Number(droppedRequired[category] || 0), 0, `no dropped required ${category} events`);
  }
  return { ok: true, runId: run.runId, eventCount: events.length, visibleMessageCount: visibleMessages.length, rawShimCount: rawShim.length, runDir };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const runDir = args.find((arg) => arg !== '--strict');
  try {
    const result = verifyBundle(runDir, { strict });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`diagnostic bundle verification failed: ${error.stack || error}`);
    process.exit(1);
  }
}

module.exports = { verifyBundle };
