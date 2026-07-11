#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const EvidenceScan = require('../src/shared/direct-api-evidence-scan');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function screenshotEntries(manifest) {
  return (manifest.directApiEvidence?.screenshots || []).map((shot) => (typeof shot === 'string' ? { path: shot, label: shot, inspectionNotes: [] } : shot));
}

function createContactSheetHtml(manifest, options = {}) {
  const evidence = manifest.directApiEvidence || {};
  const title = options.title || `Direct API evidence contact sheet: ${evidence.task || 'unknown task'}`;
  const entries = screenshotEntries(manifest);
  const reviewNotes = evidence.reviewNotes || [];
  const generatedAt = options.generatedAt || new Date().toISOString();
  const cards = entries.map((entry, index) => {
    const notes = (entry.inspectionNotes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join('\n');
    return `<article class="shot">
  <h2>${String(index + 1).padStart(2, '0')}. ${escapeHtml(entry.label || entry.path)}</h2>
  <figure><img src="${escapeHtml(entry.path)}" alt="${escapeHtml(entry.alt || entry.label || entry.path)}"></figure>
  <ul class="notes">${notes || '<li>No inspection notes recorded.</li>'}</ul>
</article>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 24px; background: #141821; color: #f4f0e8; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  header { margin-bottom: 24px; max-width: 1040px; }
  h1 { margin: 0 0 8px; font-size: 26px; }
  .meta, .notes { color: #c9c2b7; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 18px; }
  .shot { background: #1f2633; border: 1px solid #3f4b60; border-radius: 12px; padding: 16px; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
  .shot h2 { margin: 0 0 12px; font-size: 17px; }
  figure { margin: 0; background: #0c0f14; border-radius: 8px; overflow: auto; min-height: 120px; display: flex; align-items: center; justify-content: center; }
  img { max-width: 100%; height: auto; display: block; image-rendering: auto; }
  code { background: #0c0f14; padding: 2px 5px; border-radius: 4px; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Task: <code>${escapeHtml(evidence.task || '')}</code> · Scenario: <code>${escapeHtml(evidence.scenarioId || '')}</code> · Generated: ${escapeHtml(generatedAt)}</p>
  <p class="meta">Forbidden-token scan: <strong>${evidence.forbiddenTokenScan?.passed === true ? 'PASS' : 'FAIL'}</strong> · Public-boundary scan: <strong>${evidence.publicBoundaryScan?.passed === true ? 'PASS' : 'FAIL'}</strong></p>
  <h2>Review notes</h2>
  <ul>${reviewNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('\n') || '<li>No review notes recorded.</li>'}</ul>
</header>
<main class="grid">
${cards || '<p>No screenshots declared.</p>'}
</main>
</body>
</html>
`;
}

function writeContactSheet(manifestPath, outputPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const validation = EvidenceScan.validateEvidenceManifest(manifest);
  if (!validation.ok) throw new Error(`Invalid direct API evidence manifest:\n${validation.errors.join('\n')}`);
  const html = createContactSheetHtml(manifest);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
  return { outputPath, screenshots: screenshotEntries(manifest).map((entry) => entry.path) };
}

if (require.main === module) {
  const [, , manifestPath, outputPathArg] = process.argv;
  if (!manifestPath) {
    console.error('usage: node scripts/direct-api-contact-sheet.js <evidence-manifest.json> [contact-sheet.html]');
    process.exit(2);
  }
  const outputPath = outputPathArg || path.join(path.dirname(manifestPath), 'contact-sheet.html');
  const result = writeContactSheet(manifestPath, outputPath);
  console.log(`direct-api-contact-sheet wrote ${result.outputPath}`);
}

module.exports = { createContactSheetHtml, writeContactSheet, screenshotEntries };
