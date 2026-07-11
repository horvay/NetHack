#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const TileAssets = require('../src/shared/tile-assets');

const repo = path.resolve(__dirname, '..', '..');
const outDir = process.env.NH_ASSET_AUDIT_OUT_DIR || path.join(repo, 'asset-generation/outputs');
fs.mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(repo, 'electron-poc/assets/tiles/manifest.json');
const tileMapPath = path.join(repo, 'electron-poc/assets/tiles/tile-map.json');
const generatedRoot = path.join(repo, 'electron-poc/assets/tiles/generated');
const byCategoryRoot = path.join(repo, 'electron-poc/assets/tiles/by-category');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const tileMap = JSON.parse(fs.readFileSync(tileMapPath, 'utf8'));
const assets = manifest.assets || [];
const assetsById = TileAssets.assetsById(manifest);

function rel(p) { return path.relative(repo, p).replace(/\\/g, '/'); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function walkPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/backup|\.original-/i.test(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkPngs(p));
    else if (/\.png$/i.test(entry.name) && !/\.original-/i.test(entry.name)) out.push(p);
  }
  return out.sort();
}
function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 24 && buf.toString('ascii', 1, 4) === 'PNG') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  return null;
}
function categoryCounts(list) {
  return list.reduce((acc, item) => {
    const cat = item.categorySlug || item.category || 'uncategorized';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
}
function normalizePlayerFromComboId(id) {
  const m = id.match(/^([a-z]+)-(.+)-(male|female)-avatar$/);
  if (!m) return null;
  return { race: m[1], role: m[2], gender: m[3] };
}
function runtimeResolves(asset) {
  const probes = [];
  const add = (label, cell, expected = asset.id) => probes.push({ label, actual: TileAssets.mappedAssetIdForCell(cell, { tileMapConfig: tileMap, tileAssetsById: assetsById }), expected });
  if (asset.categorySlug === 'player-combo-avatars') {
    const character = normalizePlayerFromComboId(asset.id);
    const actual = character ? TileAssets.playerComboAvatarAssetId(character, assetsById) : undefined;
    return { selectable: actual === asset.id, path: 'playerComboAvatarAssetId(character)', probes: [{ label: 'combo', actual, expected: asset.id }] };
  }
  if (asset.id.endsWith('-role-avatar')) {
    const role = asset.id.replace(/-role-avatar$/, '').replace(/^cavewoman$/, 'caveman').replace(/^priestess$/, 'priest');
    const gender = asset.id.startsWith('cavewoman') || asset.id.startsWith('priestess') ? 'female' : 'male';
    const actual = TileAssets.playerRoleAvatarAssetId({ role, gender }, assetsById);
    return { selectable: actual === asset.id, path: 'playerRoleAvatarAssetId(character)', probes: [{ label: 'role', actual, expected: asset.id }] };
  }
  for (const section of ['defaults', 'char', 'glyphNumber', 'semanticName', 'semanticKind']) {
    for (const [key, id] of Object.entries(tileMap[section] || {})) {
      if (id === asset.id) return { selectable: true, path: `tile-map.${section}.${key}`, probes: [] };
    }
  }
  if (asset.name) {
    const kind = /monster/i.test(asset.categorySlug) ? 'monster' : /object|inventory/i.test(asset.categorySlug) ? 'object' : /trap|hazard/i.test(asset.categorySlug) ? 'trap' : asset.categorySlug === 'terrain-features' ? 'engraving' : undefined;
    const ch = kind === 'monster' ? 'x' : kind === 'object' ? '?' : kind === 'trap' ? '^' : asset.glyph || '.';
    add('semantic name', { ch, semanticKind: kind, semanticName: asset.name });
    if (probes.at(-1).actual === asset.id) return { selectable: true, path: 'semantic slug/name fallback', probes };
  }
  return { selectable: false, path: null, probes };
}

const generatedFiles = walkPngs(generatedRoot);
const byCategoryFiles = walkPngs(byCategoryRoot);
const generatedRel = new Set(generatedFiles.map(rel));
const byCategoryRel = new Set(byCategoryFiles.map(rel));
const manifestInstalledRel = new Set(assets.map(a => a.installedPath).filter(Boolean));

const rows = assets.map((asset) => {
  const abs = path.join(repo, asset.installedPath || '');
  const outputAbs = path.join(repo, asset.outputPath || '');
  const byCatRel = asset.installedPath ? asset.installedPath.replace('/generated/', '/by-category/') : '';
  const byCatAbs = path.join(repo, byCatRel);
  const exists = Boolean(asset.installedPath && fs.existsSync(abs));
  const installedSha = exists ? sha(abs) : null;
  const outputExists = Boolean(asset.outputPath && fs.existsSync(outputAbs));
  const outputSha = outputExists ? sha(outputAbs) : null;
  const byCategoryExists = fs.existsSync(byCatAbs);
  const byCategorySha = byCategoryExists ? sha(byCatAbs) : null;
  const selectable = runtimeResolves(asset);
  return {
    id: asset.id,
    name: asset.name,
    categorySlug: asset.categorySlug,
    installedPath: asset.installedPath,
    outputPath: asset.outputPath,
    exists,
    pngSize: exists ? pngSize(abs) : null,
    manifestSha: asset.sha256 || null,
    installedSha,
    outputSha,
    byCategoryPath: byCatRel,
    byCategorySha,
    manifestShaMatches: !asset.sha256 || asset.sha256 === installedSha,
    outputMatchesInstalled: !outputExists || outputSha === installedSha,
    byCategoryMatchesInstalled: !byCategoryExists || byCategorySha === installedSha,
    tileUrl: exists ? TileAssets.tileUrl(asset) : null,
    selectable: selectable.selectable,
    selectionPath: selectable.path,
    selectionProbes: selectable.probes,
  };
});

const references = ['defaults', 'char', 'glyphNumber', 'semanticName', 'semanticKind'].flatMap(section => Object.entries(tileMap[section] || {}).map(([key, id]) => ({ section, key, id })));
const missingRefs = references.filter(r => r.id && !assetsById.has(r.id));
const duplicateIds = [...assets.reduce((m, a) => m.set(a.id, (m.get(a.id) || 0) + 1), new Map())].filter(([, n]) => n > 1).map(([id, count]) => ({ id, count }));
const filesNotInManifest = [...generatedRel].filter(p => !manifestInstalledRel.has(p));
const manifestNotOnDisk = rows.filter(r => !r.exists).map(r => r.id);
const shaMismatches = rows.filter(r => !r.manifestShaMatches).map(r => r.id);
const outputMismatches = rows.filter(r => !r.outputMatchesInstalled).map(r => r.id);
const byCategoryMismatches = rows.filter(r => !r.byCategoryMatchesInstalled).map(r => r.id);
const notSelectable = rows.filter(r => !r.selectable).map(r => ({ id: r.id, categorySlug: r.categorySlug, name: r.name, probes: r.selectionProbes }));

const spotlight = Object.fromEntries(['engraving', 'monk-role-avatar', 'monk', 'human-monk-male-avatar', 'human-monk-female-avatar', 'hero-avatar'].map(id => [id, rows.find(r => r.id === id)]));
const report = {
  auditedAt: new Date().toISOString(),
  manifestAssetCount: assets.length,
  generatedPngCount: generatedFiles.length,
  byCategoryPngCount: byCategoryFiles.length,
  tileMapReferenceCount: references.length,
  categoryCounts: categoryCounts(assets),
  generatedCategoryCounts: categoryCounts(generatedFiles.map(f => ({ categorySlug: rel(f).split('/').at(-2) }))),
  errors: { duplicateIds, missingRefs, manifestNotOnDisk, shaMismatches, outputMismatches, byCategoryMismatches },
  filesNotInManifest,
  notSelectable,
  spotlight,
  rows,
};
const jsonPath = path.join(outDir, 'full-asset-pipeline-audit.json');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
const mdPath = path.join(outDir, 'full-asset-pipeline-audit.md');
const md = [];
md.push('# Full asset pipeline audit');
md.push('');
md.push(`Audited at: ${report.auditedAt}`);
md.push(`Manifest assets: ${assets.length}`);
md.push(`Generated PNGs: ${generatedFiles.length}`);
md.push(`by-category PNGs: ${byCategoryFiles.length}`);
md.push('');
md.push('## Category counts');
md.push('| category | manifest | generated |');
md.push('|---|---:|---:|');
for (const cat of [...new Set([...Object.keys(report.categoryCounts), ...Object.keys(report.generatedCategoryCounts)])].sort()) md.push(`| ${cat} | ${report.categoryCounts[cat] || 0} | ${report.generatedCategoryCounts[cat] || 0} |`);
md.push('');
md.push('## Error summary');
for (const [key, value] of Object.entries(report.errors)) md.push(`- ${key}: ${value.length}`);
md.push(`- generated files not in manifest: ${filesNotInManifest.length}`);
md.push(`- manifest assets not selectable by current renderer probes: ${notSelectable.length}`);
md.push('');
md.push('## Spotlight');
for (const [id, row] of Object.entries(spotlight)) md.push(`- ${id}: ${row ? `path=${row.installedPath}; sha=${String(row.installedSha).slice(0,12)}; selectable=${row.selectable}; selection=${row.selectionPath}` : 'missing'}`);
md.push('');
md.push('Full row inventory is in `full-asset-pipeline-audit.json`.');
fs.writeFileSync(mdPath, md.join('\n') + '\n');
console.log(JSON.stringify({ ok: true, json: rel(jsonPath), md: rel(mdPath), manifestAssetCount: assets.length, generatedPngCount: generatedFiles.length, errors: Object.fromEntries(Object.entries(report.errors).map(([k,v]) => [k, v.length])), filesNotInManifest: filesNotInManifest.length, notSelectable: notSelectable.length }, null, 2));
const hasHardErrors = duplicateIds.length || missingRefs.length || manifestNotOnDisk.length || shaMismatches.length || outputMismatches.length || byCategoryMismatches.length || filesNotInManifest.length;
if (hasHardErrors) process.exit(1);
