const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Ui = require('../src/shared/ui-protocol-v2');
const Shim = require('../src/shared/shim-protocol');
const GameView = require('../src/shared/game-view-state');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');
const outputFile = process.env.NH_NATIVE_MAGIC_ROWS_OUTPUT || '';
const playground = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-native-magic-rows-'));
fs.cpSync(path.join(repo, 'playground'), playground, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/i.test(path.basename(entry)) });

function run() {
  return new Promise((resolve, reject) => {
    const events = [];
    const view = GameView.createGameViewState();
    let stdout = '';
    let stderr = '';
    let stage = 'spell-command';
    let done = false;
    let buffer = '';
    const child = spawn(bridge, ['-uSlotTwo-Wiz-Hum-Fem-Neu'], {
      cwd: repo,
      env: { ...process.env, NH_TEST_PLAYGROUND: playground, NETHACKDIR: playground, NH_SHIM_RESET_LOCKS: '1', NH_ELECTRON_CHOSEN_SEED: '20303', NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const writeKey = (key) => child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: key.charCodeAt(0) })}\n`);
    const writeText = (text) => { for (const key of text) writeKey(key); };
    const finish = (error) => {
      if (done) return;
      done = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000).unref();
      if (error) reject(error); else resolve({ events, view: view.snapshot(), stdout, stderr });
    };
    child.stdout.on('data', (chunk) => {
      const text = String(chunk); stdout += text; buffer += text;
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        events.push(event);
        const normalized = Shim.normalizeRawShimEvent(event);
        if (normalized.valid) view.process(normalized.event);
        if (stage === 'spell-command' && event.name === 'bridge_command_prompt') {
          stage = 'spell-rows';
          writeText('#showspells\n');
        } else if (stage === 'spell-rows' && event.eventType === 'spell.rows') {
          stage = 'skill-command';
          writeKey('\u001b');
        } else if (stage === 'skill-command' && event.name === 'bridge_command_prompt') {
          stage = 'skill-rows';
          writeText('#enhance\n');
        } else if (stage === 'skill-rows' && event.eventType === 'skill.rows') {
          stage = 'done';
          writeKey('\u001b');
          setTimeout(() => finish(), 100);
        }
      }
    });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', finish);
    child.on('close', (code, signal) => { if (!done) finish(new Error(`bridge closed before rows (${code}/${signal})\n${stderr}\n${stdout.slice(-8000)}`)); });
    setTimeout(() => finish(new Error(`timed out waiting for native spell/skill rows at ${stage}\n${stderr}\n${stdout.slice(-8000)}`)), 30000);
  });
}

run().then(({ events, view, stdout, stderr }) => {
  const spell = events.find((event) => event.eventType === 'spell.rows');
  const availability = events.find((event) => event.name === 'shim_spell_availability');
  const skill = events.find((event) => event.eventType === 'skill.rows');
  assert(spell, 'real NetHack core emitted spell.rows');
  assert(availability, 'real NetHack core emitted spell availability before opening a spell menu');
  assert.equal(availability.authoritative, true);
  assert.equal(availability.source, 'num_spells');
  assert(availability.knownSpellCount >= 1, `Wizard starts with a learned spell: ${JSON.stringify(availability)}`);
  assert(events.indexOf(availability) < events.indexOf(spell), 'availability is published from normal input refresh before spell.rows menu publication');
  assert(skill, 'real NetHack core emitted skill.rows');
  for (const event of [spell, skill]) {
    const checked = Ui.validateEventEnvelope(event);
    assert.equal(checked.ok, true, checked.errors.join('; '));
    assert.equal(event.source.layer, 'core');
    assert.equal(event.source.authoritative, true);
    assert.equal(event.requestId, event.payload.menuId);
    assert.equal(event.payload.classificationConfidence, 'typed');
  }
  assert(spell.payload.rows.length >= 1, 'Wizard starts with at least one core-known spell');
  assert(spell.payload.rows.some((row) => /force bolt/i.test(row.name)), `expected real Wizard spell row: ${JSON.stringify(spell.payload.rows)}`);
  for (const row of spell.payload.rows) {
    assert.deepEqual(Object.keys(row).sort(), Object.keys(row).filter((key) => ['name', 'selector', 'level', 'pwCost', 'failure', 'status'].includes(key)).sort(), 'spell row exposes only allowlisted public fields');
    assert.equal(typeof row.pwCost, 'number');
    assert.equal(typeof row.failure, 'number');
  }
  assert(skill.payload.rows.length >= 1, 'real #enhance produced public skill rows');
  for (const row of skill.payload.rows) {
    assert(Object.keys(row).every((key) => ['name', 'selector', 'currentRank', 'nextRank', 'nextCost', 'canAdvance'].includes(key)), 'skill row exposes only allowlisted public fields');
    assert.equal(typeof row.canAdvance, 'boolean');
    if (!row.canAdvance) {
      assert.equal(row.selector, undefined);
      assert.equal(row.nextRank, undefined);
      assert.equal(row.nextCost, undefined);
    }
  }
  assert.equal(view.spellRows.classificationConfidence, 'typed');
  assert.equal(view.skillRows.classificationConfidence, 'typed');
  assert(spell.sequence < skill.sequence, 'native event sequence is strictly ordered');
  const evidence = { seed: '20303', playerSpec: '-uSlotTwo-Wiz-Hum-Fem-Neu', availability, spell, skill, reducedView: { knownSpellCount: view.knownSpellCount, spellRows: view.spellRows, skillRows: view.skillRows }, stderr };
  if (outputFile) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(evidence, null, 2)}\n`);
    fs.writeFileSync(`${outputFile}.stdout.log`, stdout);
  }
  fs.rmSync(playground, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: true, knownSpellCount: availability.knownSpellCount, spellRows: spell.payload.rows.length, skillRows: skill.payload.rows.length, spellSequence: spell.sequence, skillSequence: skill.sequence }, null, 2));
}).catch((error) => {
  fs.rmSync(playground, { recursive: true, force: true });
  console.error(error.stack || error);
  process.exit(1);
});
