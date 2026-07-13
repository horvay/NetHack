const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');
const outputFile = process.env.NH_NATIVE_PLAYER_NAMES_OUTPUT || '';
const playground = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-native-player-names-'));
fs.cpSync(path.join(repo, 'playground'), playground, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/.test(path.basename(entry)) });

function run() {
  return new Promise((resolve, reject) => {
    const events = []; let stdout = ''; let stderr = ''; let sentInventory = false; let done = false;
    const child = spawn(bridge, [], {
      cwd: repo,
      env: { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: 'identity/player-assigned-item-names', NH_TEST_PLAYGROUND: playground, NETHACKDIR: playground, NH_SHIM_RESET_LOCKS: '1', NETHACK_SEED: '16', NH_ELECTRON_CHOSEN_SEED: '16', NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const finish = (error) => {
      if (done) return;
      done = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000).unref();
      if (error) reject(error); else resolve({ events, stdout, stderr });
    };
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      const text = String(chunk); stdout += text; buffer += text;
      const lines = buffer.split(/\r?\n/); buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let event; try { event = JSON.parse(line); } catch { continue; }
        events.push(event);
        if (!sentInventory && event.name === 'bridge_command_prompt') {
          sentInventory = true;
          child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: 105 })}\n`);
        }
        if (sentInventory && event.name === 'shim_end_menu' && event.menuPurpose === 'inventory.displayInventory') finish();
      }
    });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', finish);
    child.on('close', () => { if (!done) finish(new Error(`bridge closed before inventory menu\n${stderr}\n${stdout.slice(-4000)}`)); });
    setTimeout(() => finish(new Error(`timed out waiting for native inventory menu\n${stderr}\n${stdout.slice(-4000)}`)), 20000);
  });
}

run().then(({ events, stdout, stderr }) => {
  const inventory = events.filter((event) => event.name === 'shim_update_inventory').slice(-1)[0];
  assert.ok(inventory, 'native bridge emits authoritative inventory snapshot');
  const called = inventory.items.find((item) => item.calledName === 'sunrise');
  const named = inventory.items.find((item) => item.individualName === 'Dawnbringer');
  assert.equal(called.semanticKnown, false, 'called potion remains identity-unknown at the C boundary');
  assert.equal(called.semanticAppearance, 'milky potion', 'C boundary emits complete explicit milky potion appearance');
  assert.equal(called.known.naming, true, 'C boundary emits narrow explicit naming knowledge');
  assert.equal(called.known.identity, undefined, 'C emitter does not manufacture identity authorization');
  assert.equal(called.known.appearance, undefined, 'C emitter does not blanket-authorize generic display text as appearance');
  assert.match(called.text, /milky(?: potion)? called sunrise/i, `C inventory text contains the real exact called suffix: ${JSON.stringify(called)}`);
  assert.equal(called.semanticName, undefined, 'C unknown called potion omits hidden generic identity');
  assert.equal(named.individualName, 'Dawnbringer', 'C boundary emits exact individual object name');
  assert.equal(named.known.naming, true, 'C boundary emits naming knowledge for the named sword');
  assert.equal(named.semanticKnown, true, 'known sword identity remains independently public');
  const menus = events.filter((event) => event.name === 'shim_add_menu' && event.menuPurpose === 'inventory.displayInventory');
  const calledMenu = menus.find((event) => event.calledName === 'sunrise');
  const namedMenu = menus.find((event) => event.individualName === 'Dawnbringer');
  assert.equal(calledMenu.objectId, called.objectId, 'classic menu resolves authoritative called object metadata');
  assert.equal(calledMenu.semanticAppearance, 'milky potion', 'classic menu emits complete public appearance');
  assert.equal(calledMenu.known.naming, true, 'classic menu carries explicit called-name knowledge');
  assert.match(calledMenu.text, /milky potion called sunrise/i, 'classic menu carries real called suffix text');
  assert.equal(namedMenu.objectId, named.objectId, 'classic menu resolves authoritative named object metadata');
  assert.equal(namedMenu.individualName, 'Dawnbringer', 'classic menu carries exact individual name');
  assert.equal(namedMenu.known.naming, true, 'classic menu carries explicit individual naming knowledge');
  const evidence = { scenarioId: 'identity/player-assigned-item-names', seed: '16', inventory, called, named, calledMenu, namedMenu, stderr };
  if (outputFile) { fs.mkdirSync(path.dirname(outputFile), { recursive: true }); fs.writeFileSync(outputFile, `${JSON.stringify(evidence, null, 2)}\n`); }
  fs.rmSync(playground, { recursive: true, force: true });
  console.log('native-player-assigned-names-shim-test: PASS');
}).catch((error) => {
  fs.rmSync(playground, { recursive: true, force: true });
  console.error(error.stack || error);
  process.exit(1);
});
