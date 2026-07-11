const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const root = path.resolve(__dirname, '..');
const baselinePath = '/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-beta-sailing-cat-49/missing-assets-analysis.json';
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/manifest.json'), 'utf8'));
const tileMap = JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/tile-map.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')).fullSourceGaps;

function slugify(name) {
  return name.trim().toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unnamed';
}

const assets = manifest.assets || [];
const byId = new Map(assets.map((asset) => [asset.id, asset]));
const byLowerName = new Map();
for (const asset of assets) {
  const key = `${asset.categorySlug}:${String(asset.name).toLowerCase()}`;
  byLowerName.set(key, asset);
}

function exists(asset) {
  return asset && asset.installedPath && fs.existsSync(path.resolve(repo, asset.installedPath));
}

function findMonster(name) {
  return byId.get(slugify(name)) || byLowerName.get(`full-source-monsters:${name.toLowerCase()}`) || byLowerName.get(`common-early-monsters:${name.toLowerCase()}`);
}

function findObject(name) {
  return byId.get(slugify(name)) || byId.get(`${slugify(name)}-object`) || byLowerName.get(`full-source-objects:${name.toLowerCase()}`) || byLowerName.get(`objects-inventory:${name.toLowerCase()}`);
}

const missingMonsters = [];
for (const name of baseline.missingMonsters) {
  const asset = findMonster(name);
  if (!exists(asset)) missingMonsters.push(name);
}
const missingObjects = [];
for (const name of baseline.missingObjects) {
  const asset = findObject(name);
  if (!exists(asset)) missingObjects.push(name);
}

const sourceCategoryCounts = assets.reduce((acc, asset) => {
  acc[asset.categorySlug] = (acc[asset.categorySlug] || 0) + 1;
  return acc;
}, {});

const badSemanticRefs = Object.entries(tileMap.semanticName || {})
  .filter(([, id]) => id && !byId.has(id))
  .map(([name, id]) => `${name} -> ${id}`);

const fullSourceAssets = assets.filter((asset) => asset.categorySlug === 'full-source-monsters' || asset.categorySlug === 'full-source-objects');
const acceptedFullSourceWorkflowLabels = new Set([
  'deterministic-silhouette-source-backlog-v2',
  'visual-qa-cleanup-transparent-semantic-v1',
  'transparent-rmbg-ai-cat-refine',
  'transparent-rmbg-ai-legibility-refine',
  'transparent-rmbg-ai-critique-delta-refine',
  'transparent-rmbg-ai-phi-full-coverage-refine',
  'transparent-scroll-followup-regeneration',
  'transparent-rmbg-coherent-restart',
  'transparent-approved-candidate-curation',
  'opaque-terrain-coherent-restart',
]);
const coherentRestartWorkflowLabels = new Set([
  'transparent-rmbg-coherent-restart',
  'transparent-approved-candidate-curation',
  'opaque-terrain-coherent-restart',
]);
const remainingPlaceholderBadges = fullSourceAssets
  .filter((asset) => !acceptedFullSourceWorkflowLabels.has(asset.workflowLabel)
    || (!coherentRestartWorkflowLabels.has(asset.workflowLabel)
      && !String(asset.renderingNotes || '').includes('Upgraded from placeholder initial badge')))
  .map((asset) => asset.id);

const report = {
  baselineMonsterMissingBacklog: baseline.monsterMissingCount,
  baselineObjectMissingBacklog: baseline.objectMissingCount,
  currentManifestAssets: assets.length,
  fullSourceMonsterAssets: sourceCategoryCounts['full-source-monsters'] || 0,
  fullSourceObjectAssets: sourceCategoryCounts['full-source-objects'] || 0,
  missingMonsters,
  missingObjects,
  badSemanticRefs,
  remainingPlaceholderBadges,
};
console.log(JSON.stringify(report, null, 2));
if (missingMonsters.length || missingObjects.length || badSemanticRefs.length || remainingPlaceholderBadges.length) process.exit(1);
