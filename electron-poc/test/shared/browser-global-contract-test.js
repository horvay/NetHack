const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const rendererHtmlPath = path.join(root, 'src/renderer.html');
const rendererHtml = fs.readFileSync(rendererHtmlPath, 'utf8');

const expectedContracts = Object.freeze({
  './shared/module-system.js': { global: 'NetHackModuleSystem', props: ['moduleFormat', 'browserGlobalPrefix'] },
  './shared/public-item-knowledge.js': { global: 'NetHackPublicItemKnowledge', props: ['version', 'identityIsPublic', 'publicLabel'] },
  './shared/public-blockers.js': { global: 'NetHackPublicBlockers', props: ['version', 'publicEquipmentBlockerLabel', 'isPublicEquipmentBlockerToken'] },
  './shared/ui-protocol-v2.js': { global: 'NetHackUiProtocolV2', props: ['version', 'protocol', 'normalizeEventEnvelope'] },
  './shared/command-gateway.js': { global: 'NetHackCommandGateway', props: ['version', 'supportedPlayableKey', 'normalizeShimKey'] },
  './shared/message-log.js': { global: 'NetHackMessageLog', props: ['version', 'createMessageLog'] },
  './shared/prompt-rules.js': { global: 'NetHackPromptRules', props: ['version', 'selectorSet', 'isDirectionPrompt'] },
  './shared/tile-assets.js': { global: 'NetHackTileAssets', props: ['version', 'normalizeManifest', 'mappedAssetIdForCell'] },
  './shared/character-options.js': { global: 'NetHackCharacterOptions', props: ['version', 'validCombos', 'comboAvatarId'] },
  './shared/interaction-model.js': { global: 'NetHackInteractionModel', props: ['version', 'buildPromptInteraction', 'buildMenuInteraction'] },
  './shared/inventory-action-service.js': { global: 'NetHackInventoryActionService', props: ['itemActionAffordances', 'routeInventoryAction'] },
  './shared/map-presentation.js': { global: 'NetHackMapPresentation', props: ['version', 'cellViewModel', 'tooltipInfoForCell'] },
  './shared/shim-protocol.js': { global: 'NetHackShimProtocol', props: ['version', 'parseLine', 'normalizeRawShimEvent'] },
  './shared/menu-metadata-adapter.js': { global: 'NetHackMenuMetadataAdapter', props: ['version', 'compareMenuMetadata', 'adaptV1MenuSnapshotToV2Events'] },
  './shared/inventory-snapshot-adapter.js': { global: 'NetHackInventorySnapshotAdapter', props: ['version', 'normalizePublicInventoryItem', 'adaptShimInventoryUpdateToSnapshot'] },
  './shared/equipment-snapshot-adapter.js': { global: 'NetHackEquipmentSnapshotAdapter', props: ['version', 'canonicalSlots', 'adaptShimInventoryUpdateToEquipmentSnapshot'] },
  './shared/ground-pile-snapshot-adapter.js': { global: 'NetHackGroundPileSnapshotAdapter', props: ['version', 'normalizeGroundPileSnapshotPayload', 'groundPileDelta'] },
  './shared/container-contents-snapshot-adapter.js': { global: 'NetHackContainerContentsSnapshotAdapter', props: ['version', 'normalizeContainerContentsSnapshotPayload', 'containerContentsDelta'] },
  './shared/command-transaction-model.js': { global: 'NetHackCommandTransactionModel', props: ['version', 'beginTransaction', 'completeFromSnapshots'] },
  './shared/transfer-transaction-model.js': { global: 'NetHackTransferTransactionModel', props: ['version', 'openSession', 'beginTransfer'] },
  './shared/game-view-state.js': { global: 'NetHackGameViewState', props: ['version', 'createGameViewState', 'makeEmptyMap'] },
  './shared/recording-schema.js': { global: 'NetHackRecordingSchema', props: ['version', 'validateRecording', 'sanitizeForSave'] },
  './shared/status-hud.js': { global: 'NetHackStatusHud', props: ['version', 'buildStatusGroups', 'conditionLabels'] },
});

function scriptSourcesFromRendererHtml() {
  return Array.from(rendererHtml.matchAll(/<script\s+src="([^"]+)"\s*>\s*<\/script>/g)).map((match) => match[1]);
}

const sharedScripts = scriptSourcesFromRendererHtml().filter((src) => src.startsWith('./shared/'));
assert.deepEqual(sharedScripts, Object.keys(expectedContracts), 'renderer shared script order must match the browser-global contract list');

const context = { console };
context.window = context;
context.self = context;
vm.createContext(context);

for (const src of sharedScripts) {
  const contract = expectedContracts[src];
  const beforeGlobals = new Set(Object.keys(context).filter((key) => key.startsWith('NetHack')));
  const sourcePath = path.join(root, 'src', src.replace(/^\.\//, ''));
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.match(source, new RegExp(`root\\.${contract.global}\\s*=`), `${src} must expose ${contract.global} in browser mode`);
  vm.runInContext(source, context, { filename: sourcePath, displayErrors: true });
  const exposed = context[contract.global];
  assert.ok(exposed, `${src} must create window.${contract.global}`);
  assert.equal(Object.isFrozen(exposed), true, `${contract.global} must be frozen as a stable browser Interface`);
  for (const prop of contract.props) assert.ok(prop in exposed, `${contract.global}.${prop} must exist`);
  const afterGlobals = new Set(Object.keys(context).filter((key) => key.startsWith('NetHack')));
  const newGlobals = Array.from(afterGlobals).filter((key) => !beforeGlobals.has(key));
  assert.deepEqual(newGlobals, [contract.global], `${src} should expose exactly ${contract.global}`);
}

assert.equal(context.NetHackModuleSystem.moduleFormat, 'commonjs-with-browser-global-adapter');
assert.equal(context.NetHackModuleSystem.browserGlobalPrefix, 'NetHack');
assert.equal(context.NetHackGameViewState.createGameViewState().snapshot().mapCells.length, 21);
assert.equal(context.NetHackUiProtocolV2.normalizeEventEnvelope({ protocol: context.NetHackUiProtocolV2.protocol, sequence: 1, eventId: 'evt-browser-global-contract', eventType: 'replay.marker', turn: 0, payload: { name: 'browser global contract' } }).valid, true);

console.log('browser global contract OK');
