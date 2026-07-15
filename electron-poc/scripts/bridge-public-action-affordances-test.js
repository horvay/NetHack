const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');
const outDir = path.join(root, 'test-output', 'workstream-b-bridge-public-boundary');
fs.mkdirSync(outDir, { recursive: true });

function makeIsolatedPlayground() {
  const source = path.join(repo, 'playground');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-action-affordances-'));
  fs.cpSync(source, temp, {
    recursive: true,
    filter: (entry) => !/[a-z]lock\.0$/.test(path.basename(entry)),
  });
  return temp;
}

function runScenario(id, timeout = 12000) {
  const playground = makeIsolatedPlayground();
  try {
    const env = {
      ...process.env,
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: id,
      NETHACKDIR: playground,
      NETHACKOPTIONS: '!tutorial,!autopickup',
      NETHACK_SEED: '424242',
    };
    const result = spawnSync(bridge, [], { cwd: repo, env, encoding: 'utf8', timeout });
    if (result.error && result.error.code !== 'ETIMEDOUT') throw result.error;
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    fs.writeFileSync(path.join(outDir, `${id.replace(/[^a-z0-9_-]+/gi, '--')}.stdout-stderr.jsonl`), output);
    assert.doesNotMatch(output, /bridge_test_scenario_failed|Program in disorder|Please report these messages|Too many hacks running now/i, `${id} emitted runtime failure\n${output.slice(-4000)}`);
    assert.match(output, /bridge_test_scenario_loaded/, `${id} did not load\n${output.slice(-4000)}`);
    const events = output.split(/\r?\n/).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    fs.writeFileSync(path.join(outDir, `${id.replace(/[^a-z0-9_-]+/gi, '--')}.events.json`), JSON.stringify(events, null, 2));
    return events;
  } finally {
    fs.rmSync(playground, { recursive: true, force: true });
  }
}

function tokenSet(item) {
  return new Set((Array.isArray(item?.actionAffordances) ? item.actionAffordances : []).map(String));
}
function assertTokens(item, expected, label) {
  const tokens = tokenSet(item);
  for (const token of expected) assert(tokens.has(token), `${label} missing ${token}; saw ${Array.from(tokens).join(', ')}`);
}
function assertNoTokens(item, forbidden, label) {
  const tokens = tokenSet(item);
  for (const token of forbidden) assert(!tokens.has(token), `${label} leaked forbidden ${token}; saw ${Array.from(tokens).join(', ')}`);
}
function displayText(item) {
  return String(item?.displayName || item?.text || item?.semanticAppearance || item?.semanticName || '');
}
const hiddenContainerTextPattern = /\b(?:locked|trapped|broken)\b|\bcontaining\s+\d+\s+items?\b/i;
const containerSurfacePattern = /\b(?:chest|box|bag|sack|container)\b/i;
function assertNoHiddenContainerText(item, label) {
  for (const field of ['displayName', 'text', 'semanticName', 'semanticAppearance', 'appearanceName']) {
    const value = item?.[field];
    if (typeof value === 'string' && containerSurfacePattern.test(value)) {
      assert.doesNotMatch(value, hiddenContainerTextPattern, `${label}.${field} leaked hidden container text; use a public surface name such as a chest/a large box unless this is a historical visible message`);
    }
  }
}
function assertNoHiddenContainerMetadataEvents(events, label) {
  for (const event of events) {
    if (event.name === 'shim_raw_print' || event.name === 'shim_raw_print_bold' || event.name === 'shim_putstr') continue;
    if (event.name === 'bridge_test_scenario_loaded') {
      const facts = event.expectedPublicFacts || {};
      for (const [field, values] of Object.entries(facts)) {
        for (const value of Array.isArray(values) ? values : []) {
          if (containerSurfacePattern.test(String(value || ''))) assert.doesNotMatch(String(value || ''), hiddenContainerTextPattern, `${label} expectedPublicFacts.${field} leaked hidden container metadata`);
        }
      }
    }
    for (const item of event.items || []) assertNoHiddenContainerText(item, `${label} ${event.name || 'event'} item`);
  }
}
function assertNoHiddenIdentity(item, forbidden, label) {
  const text = JSON.stringify(item || {});
  if (item?.semanticKnown === false) assert.equal(item.semanticName, undefined, `${label} has semanticKnown=false but leaked semanticName`);
  for (const pattern of forbidden) assert.doesNotMatch(text, pattern, `${label} leaked hidden identity in public payload: ${text}`);
}
function assertPublicItemPresentation(item, expectedClass, expectedGroups, label) {
  assert.equal(item?.publicClass, expectedClass, `${label} has authoritative public class`);
  assert.deepEqual(item?.filterGroups || [], expectedGroups, `${label} has only class-safe public filters`);
  assert(Array.isArray(item?.equipmentSlots), `${label} exposes an explicit applicable-slot list`);
  assert(item?.knownFields && typeof item.knownFields === 'object' && !Array.isArray(item.knownFields), `${label} exposes reduced known fields object`);
  assert(['owned', 'unpaid', 'for-sale'].includes(item?.ownership?.state), `${label} exposes public ownership state`);
  for (const forbidden of ['trueName', 'otyp', 'spe', 'baseType']) assert.equal(item?.knownFields?.[forbidden], undefined, `${label} omits hidden ${forbidden}`);
}
function assertNoHiddenContainerTokens(item, label) {
  assertNoTokens(item, ['container.locked', 'container.trapped', 'container.broken', 'locked', 'trapped', 'broken'], label);
  assert.equal(item?.contents, undefined, `${label} public ground item must not expose hidden contents`);
  assert.equal(item?.locked, undefined, `${label} public ground item must not expose locked boolean`);
  assert.equal(item?.trapped, undefined, `${label} public ground item must not expose trapped boolean`);
  assert.equal(item?.broken, undefined, `${label} public ground item must not expose broken boolean`);
  assertNoHiddenContainerText(item, label);
}

{
  const events = runScenario('identity/valkyrie-equipped-inventory');
  const inventory = events.filter((event) => event.name === 'shim_update_inventory').find((event) => Array.isArray(event.items) && event.items.length >= 5);
  assert(inventory, 'expected shim_update_inventory with scenario inventory rows');
  const row = (pattern) => inventory.items.find((item) => pattern.test(String(item.text || '')));
  assertTokens(row(/long sword/i), ['wield', 'wielded', 'engrave'], 'wielded long sword');
  assertNoTokens(row(/long sword/i), ['drop'], 'wielded long sword');
  assertTokens(row(/shield/i), ['takeOff'], 'worn shield');
  assertNoTokens(row(/shield/i), ['drop', 'throw'], 'worn shield');
  assertTokens(row(/leather armor/i), ['takeOff'], 'worn leather armor');
  assertNoTokens(row(/leather armor/i), ['drop', 'throw'], 'worn leather armor');
  assertTokens(row(/arrows/i), ['quiver', 'fire', 'throw'], 'quivered arrows');
  assertTokens(row(/wand of digging/i), ['zap', 'apply', 'engrave', 'drop'], 'wand of digging');
  assertPublicItemPresentation(row(/long sword/i), 'weapon', ['equipped', 'weapons'], 'wielded long sword');
  assert.deepEqual(row(/long sword/i).equipmentSlots, ['mainHand', 'offHand'], 'weapon publishes main/offhand slots without merging them');
  assertPublicItemPresentation(row(/leather armor/i), 'armor', ['equipped', 'armor'], 'worn leather armor');
  assertPublicItemPresentation(row(/wand of digging/i), 'wand', ['magic'], 'wand of digging');
  assert(Number.isInteger(row(/wand of digging/i).knownFields.charges), 'known wand publishes authoritative charges');
}

{
  const events = runScenario('object/asset-tooltip-scroll-gold');
  const piles = events.filter((event) => event.name === 'shim_ground_pile_snapshot');
  const scroll = piles.flatMap((event) => event.items || []).find((item) => /scroll labeled/i.test(displayText(item)));
  assert(scroll, 'expected unidentified scroll in authoritative ground pile snapshot');
  assert.equal(scroll.semanticKnown, false, 'unidentified scroll remains semanticKnown=false');
  assert.equal(scroll.semanticName, undefined, 'unidentified scroll must not leak semanticName');
  assertTokens(scroll, ['read', 'drop'], 'unidentified ground scroll');
  assertPublicItemPresentation(scroll, 'scroll', ['consumables', 'magic'], 'unidentified ground scroll');
}

{
  const events = runScenario('ground/unidentified-appearance-pile-on-hero');
  const piles = events.filter((event) => event.name === 'shim_ground_pile_snapshot');
  const items = piles.flatMap((event) => event.items || []);
  assert(items.some((item) => /crude dagger/i.test(displayText(item))), 'expected public crude dagger appearance in ground pile');
  assert(items.some((item) => /scroll labeled/i.test(displayText(item))), 'expected public scroll label in ground pile');
  assert(items.some((item) => /wand/i.test(displayText(item))), 'expected public wand appearance/class in ground pile');
  assert(items.some((item) => /potion/i.test(displayText(item))), 'expected public potion appearance/class in ground pile');
  for (const item of items) {
    assertNoHiddenIdentity(item, [/orcish dagger/i, /remove curse/i, /magic missile/i, /extra healing/i], `ground item ${displayText(item)}`);
    assertNoHiddenContainerTokens(item, `ground item ${displayText(item)}`);
  }
  const inventory = events.filter((event) => event.name === 'shim_update_inventory').find((event) => Array.isArray(event.items) && event.items.length >= 3);
  assert(inventory, 'expected inventory snapshot for unidentified appearance scenario');
  const inventoryText = JSON.stringify(inventory.items);
  assert.match(inventoryText, /iron skull cap/i, 'inventory exposes public helmet appearance');
  assert.match(inventoryText, /crude dagger/i, 'inventory exposes public dagger appearance');
  assert.match(inventoryText, /scroll labeled/i, 'inventory exposes public scroll label');
  assert.doesNotMatch(inventoryText, /orcish helm|orcish dagger|identify/i, 'inventory public rows must not leak hidden item identities');
  for (const item of inventory.items) assertNoHiddenIdentity(item, [/orcish helm/i, /orcish dagger/i, /identify/i], `inventory item ${displayText(item)}`);
}

{
  const events = runScenario('endgame/astral-offering', 20000);
  const altarCell = events.find((event) => event.name === 'shim_print_glyph' && /altar to Tyr \(lawful\)/i.test(String(event.featureDescription || '')));
  assert(altarCell, 'visible Astral altar cell publishes the same deity and alignment description as native look-here');
  assert.equal(altarCell.featureDescription, 'high altar to Tyr (lawful)', 'sanctum altar description preserves every native look-here detail');
}

{
  const events = runScenario('object/gray-stone-public-rub-candidates');
  const inventory = events.filter((event) => event.name === 'shim_update_inventory').find((event) => Array.isArray(event.items) && event.items.length >= 4);
  assert(inventory, 'expected inventory snapshot for gray-stone public rub candidates');
  const text = JSON.stringify(inventory.items);
  assert.match(text, /gray stone/i, 'gray-stone-like identities route through public gray stone appearance');
  assert.doesNotMatch(text, /flint|touchstone|luckstone|loadstone/i, 'unknown gray-stone-like fixture objects must not leak true identity names');
  const grayItems = inventory.items.filter((item) => /gray stone/i.test(displayText(item)));
  assert.equal(grayItems.length, 4, 'expected four public gray stone rows for FLINT/TOUCHSTONE/LUCKSTONE/LOADSTONE fixtures');
  const referenceActions = JSON.stringify([...(grayItems[0].actionAffordances || [])].sort());
  const referencePresentation = JSON.stringify({ publicClass: grayItems[0].publicClass, filterGroups: grayItems[0].filterGroups, equipmentSlots: grayItems[0].equipmentSlots, knownFields: grayItems[0].knownFields, ownership: grayItems[0].ownership });
  for (const item of grayItems) {
    const label = `gray stone candidate ${displayText(item)}`;
    assert.match(String(item.text || ''), /^[a-z] - a gray stone$/i, `${label} must not expose quiver/equipment or true identity text`);
    assert.equal(item.semanticKnown, false, `${label} keeps identity unknown`);
    assert.equal(item.semanticName, undefined, `${label} must not expose semanticName`);
    assert.equal(item.semanticAppearance, 'gray stone', `${label} publishes NetHack's complete public appearance, not the bare color adjective`);
    assert.equal(item.glyph, undefined, `${label} must redact true object glyph discriminator`);
    assert.equal(item.wornMask, 0, `${label} must not expose implicit fixture equipment state`);
    assert.equal(JSON.stringify([...(item.actionAffordances || [])].sort()), referenceActions, `${label} action affordances must be public-indistinguishable across hidden gray-stone identities`);
    assert.equal(JSON.stringify({ publicClass: item.publicClass, filterGroups: item.filterGroups, equipmentSlots: item.equipmentSlots, knownFields: item.knownFields, ownership: item.ownership }), referencePresentation, `${label} item presentation must be public-indistinguishable across hidden gray-stone identities`);
    assertPublicItemPresentation(item, 'gem', [], label);
    assertTokens(item, ['rub'], label);
    assertNoTokens(item, ['fire', 'wielded', 'container.locked', 'container.trapped', 'container.broken'], label);
    assertNoHiddenIdentity(item, [/flint/i, /touchstone/i, /luckstone/i, /loadstone/i], label);
  }
}

{
  const events = runScenario('identity/canonical-gem-public-names');
  const inventory = events.filter((event) => event.name === 'shim_update_inventory').find((event) => Array.isArray(event.items) && event.items.length >= 2);
  assert(inventory, 'expected inventory snapshot for canonical gem public names');
  const inventoryItems = inventory.items;
  const yellowGem = inventoryItems.find((item) => /yellow gem/i.test(displayText(item)));
  const chrysoberyl = inventoryItems.find((item) => /chrysoberyl/i.test(displayText(item)));
  assert(yellowGem, 'unidentified inventory gem uses NetHack public appearance “yellow gem”');
  assert.equal(yellowGem.semanticKnown, false, 'unidentified inventory gem keeps identity unknown');
  assert.equal(yellowGem.semanticName, undefined, 'unidentified inventory gem omits its true identity');
  assert.equal(yellowGem.semanticAppearance, 'yellow gem', 'unidentified inventory semantic appearance is complete and canonical');
  assert.doesNotMatch(JSON.stringify(yellowGem), /citrine/i, 'unidentified yellow gem does not leak citrine identity');
  assert.match(yellowGem.text, /^[a-z] - a yellow gem$/, 'unknown inventory gem text uses the complete NetHack look name');
  assert(chrysoberyl, 'identified inventory gem uses its full NetHack identity');
  assert.equal(chrysoberyl.semanticKnown, true, 'identified inventory gem publishes known identity');
  assert.equal(chrysoberyl.semanticName, 'chrysoberyl', 'identified inventory gem publishes full semantic name');
  assert.match(chrysoberyl.text, /^[a-z] - 2 chrysoberyl stones$/, 'identified inventory gem text uses NetHack’s full quantity-aware look name');

  const groundItems = events.filter((event) => event.name === 'shim_ground_pile_snapshot').flatMap((event) => event.items || []);
  const redGem = groundItems.find((item) => /red gem/i.test(displayText(item)));
  const garnet = groundItems.find((item) => /garnet/i.test(displayText(item)));
  assert(redGem, 'unidentified ground gem uses NetHack public appearance “red gem”');
  assert.equal(redGem.semanticKnown, false, 'unidentified ground gem keeps identity unknown');
  assert.equal(redGem.semanticName, undefined, 'unidentified ground gem omits its true identity');
  assert.equal(redGem.semanticAppearance, 'red gem', 'unidentified ground semantic appearance is complete and canonical');
  assert.doesNotMatch(JSON.stringify(redGem), /ruby/i, 'unidentified red gem does not leak ruby identity');
  assert.equal(redGem.displayName, 'a red gem', 'unknown ground gem displayName uses the complete NetHack look name');
  assert(garnet, 'identified ground gem uses its full NetHack identity');
  assert.equal(garnet.semanticKnown, true, 'identified ground gem publishes known identity');
  assert.equal(garnet.semanticName, 'garnet', 'identified ground gem publishes full semantic name');
  assert.equal(garnet.displayName, 'a garnet stone', 'identified ground gem displayName uses the full NetHack look name');

  for (const item of [...inventoryItems, ...groundItems]) {
    assert.doesNotMatch(String(item.semanticAppearance || ''), /^(?:red|yellow)$/i, 'native item evidence never publishes a bare gem color adjective');
  }
}

{
  for (const id of ['container/locked-trapped-chest-on-hero', 'container/locked-chest-force-destroy-on-hero']) {
    const events = runScenario(id);
    assertNoHiddenContainerMetadataEvents(events, id);
    const piles = events.filter((event) => event.name === 'shim_ground_pile_snapshot');
    assert(piles.some((event) => event.authoritative === true && event.source === 'level.objects'), `${id} should preserve authoritative C/shim ground-pile evidence`);
    const containers = piles.flatMap((event) => event.items || []).filter((item) => /box|chest|bag|sack|container/i.test(displayText(item)) || tokenSet(item).has('container'));
    assert(containers.length > 0, `${id} should emit public ground container surface`);
    for (const item of containers) {
      assertTokens(item, ['container', 'loot'], `${id} public container`);
      assertNoHiddenContainerTokens(item, `${id} public container`);
    }
  }
}

console.log('bridge-public-action-affordances-test PASS');
