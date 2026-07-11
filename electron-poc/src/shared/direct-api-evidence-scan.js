(function initDirectApiEvidenceScan(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('node:fs'), require('node:path'));
  else root.NetHackDirectApiEvidenceScan = factory(null, null);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(fs, path) {
  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

  const forbiddenPublicBoundaryFields = Object.freeze([
    'locked', 'trapped', 'broken', 'contents',
    'buc', 'cursed', 'blessed', 'beatitude', 'curseState',
    'charges', 'remainingCharges', 'otyp', 'spe', 'baseType', 'objectType', 'trueName',
    'objectPointer', 'chainPointer', 'nobj', 'cobj', 'monsterId', 'monsterInternalId', 'm_id', 'mx', 'my',
  ]);
  const forbiddenPublicBoundaryFieldSet = new Set(forbiddenPublicBoundaryFields);
  const forbiddenPublicActionTokens = Object.freeze(['container.locked', 'container.trapped', 'container.broken', 'locked', 'trapped', 'broken']);
  const forbiddenPublicActionTokenSet = new Set(forbiddenPublicActionTokens);
  const publicActionTokenFields = new Set(['actionAffordances', 'actions', 'publicActionHints', 'backgroundActionAffordances', 'objectLayerActionAffordances']);
  const defaultPublicBoundaryFields = Object.freeze([
    'payload', 'result', 'results', 'snapshot', 'snapshots', 'command', 'event', 'events',
    'inventory', 'equipment', 'ground', 'container', 'map', 'status', 'state', 'items', 'directApiEvidence',
  ]);
  const hiddenContainerTextPattern = /\b(?:locked|trapped|broken)\b(?!-looking)|\bcontaining\s+\d+\s+items?\b/i;
  const containerSurfacePattern = /\b(?:chest|box|bag|sack|container)\b/i;

  const commonForbiddenTokenRules = Object.freeze([
    { id: 'no-hidden-extcmd-answer', field: 'name', equals: 'bridge_extcmd_answer' },
    { id: 'no-hidden-menu-answer', field: 'name', equals: 'bridge_menu_answer' },
    { id: 'no-hidden-ynq-answer', field: 'name', equals: 'bridge_ynq_answer' },
    { id: 'no-extended-command-modal-text', field: 'text', regex: '\\bExtended-command\\b' },
    { id: 'no-raw-selector-label', field: 'text', regex: '\\bInventory selector [a-zA-Z]\\b' },
  ]);
  const taskForbiddenTokenRules = Object.freeze({
    'ground.transfer': Object.freeze([
      { id: 'ground-no-pickup-prompt', field: 'text', regex: '\\bPick up what\\?' },
      { id: 'ground-no-drop-prompt', field: 'text', regex: '\\bWhat do you want to drop\\?' },
      { id: 'ground-no-comma-command', field: 'command', regex: '^,\\n?$' },
      { id: 'ground-no-hidden-drop-selector-command', field: 'command', regex: '^d[a-zA-Z]$' },
    ]),
    'equipment.change': Object.freeze([
      { id: 'equipment-no-takeoff-selector-command', field: 'command', regex: '^T[a-zA-Z]$' },
      { id: 'equipment-no-remove-selector-command', field: 'command', regex: '^R[a-zA-Z]$' },
      { id: 'equipment-no-puton-selector-command', field: 'command', regex: '^P[a-zA-Z](?:[lr])?$' },
      { id: 'equipment-no-wield-selector-command', field: 'command', regex: '^w[a-zA-Z]$' },
      { id: 'equipment-no-quiver-selector-command', field: 'command', regex: '^Q[a-zA-Z]$' },
      { id: 'equipment-no-ring-hand-prompt', field: 'text', regex: '\\b(?:left|right) hand\\?' },
    ]),
    'container.force': Object.freeze([
      { id: 'container-force-no-force-command', field: 'command', regex: '^#force\\n?$' },
      { id: 'container-force-no-loot-command', field: 'command', regex: '^#loot\\n?$' },
      { id: 'container-force-no-ynq-text', field: 'text', regex: '\\b(?:Really|Are you sure|Force|break)\\b.*\\?' },
    ]),
    'item.use': Object.freeze([
      { id: 'item-use-no-rub-extcmd', field: 'command', regex: '^#rub\\n?$' },
      { id: 'item-use-no-inventory-prompt', field: 'text', regex: '\\bWhat do you want to (?:rub|use|apply)\\?' },
    ]),
    'terrain.action': Object.freeze([
      { id: 'terrain-no-dip-command', field: 'command', regex: '^#dip\\n?$' },
      { id: 'terrain-no-drink-command', field: 'command', regex: '^#drink\\n?$' },
      { id: 'terrain-no-quaff-command', field: 'command', regex: '^q\\n?$' },
      { id: 'terrain-no-stairs-command', field: 'command', regex: '^[<>]\\n?$' },
      { id: 'terrain-no-dip-item-prompt', field: 'text', regex: '\\bWhat do you want to dip\\?' },
    ]),
    'altar.action': Object.freeze([
      { id: 'altar-no-offer-command', field: 'command', regex: '^#offer\\n?$' },
      { id: 'altar-no-hidden-drop-selector-command', field: 'command', regex: '^d[a-zA-Z]$' },
      { id: 'altar-no-drop-prompt', field: 'text', regex: '\\bWhat do you want to drop\\?' },
    ]),
    'prompt.answer': Object.freeze([
      { id: 'prompt-no-unscoped-delayed-key', field: 'name', regex: 'delayed_.*key|timer_.*key' },
    ]),
    'game.final.summary': Object.freeze([]),
  });

  const taskScenarioCatalog = Object.freeze({
    'ground.transfer': Object.freeze(['ground/pickup-pile-on-hero', 'ground/unidentified-appearance-pile-on-hero']),
    'equipment.change': Object.freeze(['identity/valkyrie-equipped-inventory', 'equipment/ring-put-on-gui', 'equipment/both-rings-occupied', 'equipment/offhand-shield-twohanded', 'equipment/body-armor-over-shirt']),
    'container.force': Object.freeze(['container/locked-trapped-chest-on-hero', 'container/locked-chest-force-destroy-on-hero', 'container/empty-bag-on-hero']),
    'item.use': Object.freeze(['object/rub-candidates-in-inventory', 'object/gray-stone-public-rub-candidates']),
    'terrain.action': Object.freeze(['stairs/down-on-hero', 'stairs/up-on-hero', 'stairs/ladder-up-on-hero', 'terrain/fountain-dip-current', 'terrain/fountain-dip-on-hero']),
    'public-boundary': Object.freeze(['ground/unidentified-appearance-pile-on-hero', 'object/gray-stone-public-rub-candidates', 'container/locked-trapped-chest-on-hero']),
  });

  function walkFiles(dir, out = []) {
    if (!fs || !path) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walkFiles(file, out);
      else if (entry.isFile()) out.push(file);
    }
    return out;
  }

  function readRecords(file) {
    const text = fs.readFileSync(file, 'utf8');
    const records = [];
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try { records.push({ file, line: index + 1, json: JSON.parse(line), text: line }); }
      catch { records.push({ file, line: index + 1, text: line }); }
    }
    if (!records.length) records.push({ file, line: 1, text });
    return records;
  }

  function valueAt(record, field) {
    if (field === 'raw' || field === 'line') return record.text || '';
    if (field === 'text' && record.json && Object.prototype.hasOwnProperty.call(record.json, 'text')) return record.json.text;
    if (field === 'text' && !record.json) return record.text || '';
    const parts = String(field || '').split('.').filter(Boolean);
    let value = record.json;
    for (const part of parts) {
      if (!isPlainObject(value) && !Array.isArray(value)) return undefined;
      value = value[part];
    }
    return value;
  }

  function matchesRule(record, rule) {
    const value = valueAt(record, rule.field || 'text');
    if (value == null) return false;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (rule.equals != null) return text === String(rule.equals);
    if (rule.regex) return new RegExp(rule.regex, rule.flags || '').test(text);
    if (rule.includes != null) return text.includes(String(rule.includes));
    return false;
  }

  function scanRecords(records, rules = []) {
    const matches = [];
    for (const record of records) {
      for (const rule of rules) {
        if (matchesRule(record, rule)) {
          matches.push({ file: record.file, line: record.line, ruleId: rule.id || rule.field || 'rule', field: rule.field || 'text', value: valueAt(record, rule.field || 'text') });
        }
      }
    }
    return { ok: matches.length === 0, matches };
  }

  function isGeneratedReviewArtifact(file) {
    const name = path ? path.basename(file) : String(file).split('/').pop();
    return /^(?:contact-sheet\.html|evidence-manifest\.md|summary\.md|forbidden-token-scan\.md|public-boundary-scan\.md|.*-scan-summary\.md)$/i.test(name || '');
  }

  function scanOutputDir(outputDir, rules = [], options = {}) {
    const files = walkFiles(outputDir).filter((file) => /\.(?:jsonl?|txt|log|md|html)$/i.test(file) && (options.includeGeneratedReviewArtifacts || !isGeneratedReviewArtifact(file)));
    const records = files.flatMap(readRecords);
    const result = scanRecords(records, rules);
    return { ...result, files, recordsScanned: records.length, outputDir };
  }

  function rulesForTask(task, extraRules = []) {
    const taskRules = taskForbiddenTokenRules[task] || [];
    return [...commonForbiddenTokenRules, ...taskRules, ...extraRules];
  }

  function scanValueForPublicBoundary(value, context, matches) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => scanValueForPublicBoundary(entry, { ...context, path: `${context.path}[${index}]` }, matches));
      return;
    }
    if (!isPlainObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = context.path ? `${context.path}.${key}` : key;
      if (forbiddenPublicBoundaryFieldSet.has(key)) {
        matches.push({ file: context.file, line: context.line, ruleId: 'no-forbidden-public-boundary-field', field: childPath, value: child });
      }
      if (publicActionTokenFields.has(key) && Array.isArray(child)) {
        for (const [index, token] of child.entries()) {
          if (forbiddenPublicActionTokenSet.has(String(token))) matches.push({ file: context.file, line: context.line, ruleId: 'no-hidden-action-token', field: `${childPath}[${index}]`, value: token });
        }
      }
      if (['displayName', 'text', 'semanticName', 'semanticAppearance', 'appearanceName'].includes(key) && typeof child === 'string' && containerSurfacePattern.test(child) && hiddenContainerTextPattern.test(child)) {
        matches.push({ file: context.file, line: context.line, ruleId: 'no-hidden-container-public-text', field: childPath, value: child });
      }
      scanValueForPublicBoundary(child, { ...context, path: childPath }, matches);
    }
  }

  function scanPublicBoundaryRecords(records, options = {}) {
    const fields = options.fields || defaultPublicBoundaryFields;
    const matches = [];
    for (const record of records) {
      if (!record.json) continue;
      for (const field of fields) {
        const value = valueAt(record, field);
        if (value == null) continue;
        scanValueForPublicBoundary(value, { file: record.file, line: record.line, path: field }, matches);
      }
    }
    return { ok: matches.length === 0, matches, recordsScanned: records.length };
  }

  function scanPublicBoundaryOutputDir(outputDir, options = {}) {
    const files = walkFiles(outputDir).filter((file) => /\.(?:jsonl?|txt|log)$/i.test(file));
    const records = files.flatMap(readRecords);
    const result = scanPublicBoundaryRecords(records, options);
    return { ...result, files, outputDir };
  }

  function markdownSummary(result, title = 'Direct API evidence scan') {
    const lines = [`# ${title}`, '', result.ok ? 'PASS' : 'FAIL', '', `Output directory: ${result.outputDir || '(records only)'}`, `Files scanned: ${(result.files || []).length}`, `Records scanned: ${result.recordsScanned || 0}`, `Matches: ${(result.matches || []).length}`, ''];
    for (const match of result.matches || []) lines.push(`- ${match.ruleId} at ${match.file}:${match.line} field ${match.field}: ${JSON.stringify(match.value)}`);
    return `${lines.join('\n')}\n`;
  }

  function isSafeRelativeEvidencePath(value) {
    if (typeof value !== 'string' || !value || value.length > 240) return false;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
    if (path && path.isAbsolute(value)) return false;
    if (value.includes('\\') || value.includes('\0')) return false;
    return !value.split('/').some((part) => part === '..' || part === '');
  }

  function validateEvidenceManifest(manifest, options = {}) {
    const errors = [];
    const rootObject = isPlainObject(manifest) && isPlainObject(manifest.directApiEvidence) ? manifest.directApiEvidence : null;
    if (!rootObject) errors.push('directApiEvidence object is required');
    const evidence = rootObject || {};
    if (typeof evidence.task !== 'string' || !evidence.task) errors.push('directApiEvidence.task is required');
    if (evidence.scenarioId != null && !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(String(evidence.scenarioId))) errors.push('directApiEvidence.scenarioId must be a safe scenario id');
    if (!Array.isArray(evidence.screenshots)) errors.push('directApiEvidence.screenshots array is required');
    else {
      evidence.screenshots.forEach((shot, index) => {
        const entry = typeof shot === 'string' ? { path: shot } : shot;
        if (!isPlainObject(entry) || !isSafeRelativeEvidencePath(entry.path)) errors.push(`directApiEvidence.screenshots[${index}].path must be a safe relative path`);
        if (options.requireScreenshotInspection !== false && isPlainObject(entry) && (!Array.isArray(entry.inspectionNotes) || entry.inspectionNotes.length === 0)) errors.push(`directApiEvidence.screenshots[${index}].inspectionNotes must document manual screenshot review`);
      });
    }
    if (!isPlainObject(evidence.forbiddenTokenScan)) errors.push('directApiEvidence.forbiddenTokenScan object is required');
    else {
      if (typeof evidence.forbiddenTokenScan.passed !== 'boolean') errors.push('directApiEvidence.forbiddenTokenScan.passed boolean is required');
      if (evidence.forbiddenTokenScan.summary != null && !isSafeRelativeEvidencePath(evidence.forbiddenTokenScan.summary)) errors.push('directApiEvidence.forbiddenTokenScan.summary must be a safe relative path');
    }
    if (!isPlainObject(evidence.publicBoundaryScan)) errors.push('directApiEvidence.publicBoundaryScan object is required');
    else {
      if (typeof evidence.publicBoundaryScan.passed !== 'boolean') errors.push('directApiEvidence.publicBoundaryScan.passed boolean is required');
      if (evidence.publicBoundaryScan.summary != null && !isSafeRelativeEvidencePath(evidence.publicBoundaryScan.summary)) errors.push('directApiEvidence.publicBoundaryScan.summary must be a safe relative path');
    }
    if (!Array.isArray(evidence.reviewNotes) || evidence.reviewNotes.length === 0) errors.push('directApiEvidence.reviewNotes must contain screenshot/public-boundary review notes');
    for (const field of ['stateSidecars', 'logs', 'contactSheets']) {
      if (evidence[field] == null) continue;
      if (!Array.isArray(evidence[field])) errors.push(`directApiEvidence.${field} must be an array of safe relative paths`);
      else evidence[field].forEach((entry, index) => { if (!isSafeRelativeEvidencePath(typeof entry === 'string' ? entry : entry?.path)) errors.push(`directApiEvidence.${field}[${index}] must be a safe relative path`); });
    }
    return { ok: errors.length === 0, errors };
  }

  function createEvidenceManifest(input = {}) {
    return {
      directApiEvidence: {
        task: input.task || '',
        scenarioId: input.scenarioId || '',
        generatedAt: input.generatedAt || new Date().toISOString(),
        outputDir: input.outputDir || '.',
        screenshots: input.screenshots || [],
        stateSidecars: input.stateSidecars || [],
        logs: input.logs || [],
        contactSheets: input.contactSheets || [],
        forbiddenTokenScan: input.forbiddenTokenScan || { passed: false, tokens: [] },
        publicBoundaryScan: input.publicBoundaryScan || { passed: false, forbiddenFields: forbiddenPublicBoundaryFields },
        reviewNotes: input.reviewNotes || [],
      },
    };
  }

  function renderManifestMarkdown(manifest) {
    const evidence = manifest.directApiEvidence || {};
    const lines = ['# Direct API evidence manifest', '', `Task: ${evidence.task || '(missing)'}`, `Scenario: ${evidence.scenarioId || '(not scenario-bound)'}`, `Generated: ${evidence.generatedAt || '(unknown)'}`, '', '## Screenshots'];
    for (const shot of evidence.screenshots || []) {
      const entry = typeof shot === 'string' ? { path: shot, inspectionNotes: [] } : shot;
      lines.push(`- ${entry.path}`);
      for (const note of entry.inspectionNotes || []) lines.push(`  - ${note}`);
    }
    lines.push('', '## Scans', `- Forbidden-token scan: ${evidence.forbiddenTokenScan?.passed === true ? 'PASS' : 'FAIL'}`, `- Public-boundary scan: ${evidence.publicBoundaryScan?.passed === true ? 'PASS' : 'FAIL'}`, '', '## Review notes');
    for (const note of evidence.reviewNotes || []) lines.push(`- ${note}`);
    return `${lines.join('\n')}\n`;
  }

  function writeEvidenceManifest(outputDir, manifest) {
    if (!fs || !path) throw new Error('writeEvidenceManifest requires node fs/path');
    fs.mkdirSync(outputDir, { recursive: true });
    const manifestPath = path.join(outputDir, 'evidence-manifest.json');
    const summaryPath = path.join(outputDir, 'evidence-manifest.md');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(summaryPath, renderManifestMarkdown(manifest));
    return { manifestPath, summaryPath };
  }

  function scenarioIdsForTask(task) { return Array.from(taskScenarioCatalog[task] || []); }

  function validateScenarioShape(parsed, id) {
    const errors = [];
    const required = ['schema', 'id', 'phase', 'hero', 'level', 'ground', 'monsters', 'inventory', 'expectedPublicFacts'];
    const allowed = new Set([...required, 'eventResults']);
    if (!isPlainObject(parsed)) return [`${id}: scenario must be a JSON object`];
    for (const key of required) if (!Object.prototype.hasOwnProperty.call(parsed, key)) errors.push(`${id}: missing required top-level field ${key}`);
    for (const key of Object.keys(parsed)) if (!allowed.has(key)) errors.push(`${id}: unknown top-level field ${key}`);
    if (parsed.schema !== 'nethack-electron-test-scenario/v1') errors.push(`${id}: unsupported schema ${parsed.schema}`);
    if (parsed.id !== id) errors.push(`${id}: JSON id mismatch ${parsed.id}`);
    if (parsed.phase !== 'after-level-and-hero-before-first-draw') errors.push(`${id}: unsupported phase ${parsed.phase}`);
    if (!isPlainObject(parsed.hero)) errors.push(`${id}: hero must be an object`);
    if (!isPlainObject(parsed.level)) errors.push(`${id}: level must be an object`);
    for (const field of ['ground', 'monsters', 'inventory']) if (!Array.isArray(parsed[field])) errors.push(`${id}: ${field} must be an array`);
    if (!isPlainObject(parsed.expectedPublicFacts)) errors.push(`${id}: expectedPublicFacts must be an object`);
    return errors;
  }

  function validateScenarioCatalog(scenariosRoot, catalog = taskScenarioCatalog) {
    const errors = [];
    if (!fs || !path) return { ok: false, errors: ['validateScenarioCatalog requires node fs/path'] };
    for (const [task, ids] of Object.entries(catalog)) {
      if (!Array.isArray(ids) && typeof ids?.[Symbol.iterator] !== 'function') { errors.push(`${task}: scenario list must be iterable`); continue; }
      for (const id of ids) {
        if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(String(id))) { errors.push(`${task}: unsafe scenario id ${id}`); continue; }
        const file = path.join(scenariosRoot, `${id}.json`);
        if (!fs.existsSync(file)) { errors.push(`${task}: missing scenario ${id}`); continue; }
        let parsed;
        try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { errors.push(`${task}: invalid JSON in ${id}: ${error.message}`); continue; }
        for (const error of validateScenarioShape(parsed, id)) errors.push(`${task}: ${error}`);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  return Object.freeze({
    scanRecords,
    scanOutputDir,
    markdownSummary,
    rulesForTask,
    scanPublicBoundaryRecords,
    scanPublicBoundaryOutputDir,
    validateEvidenceManifest,
    createEvidenceManifest,
    renderManifestMarkdown,
    writeEvidenceManifest,
    scenarioIdsForTask,
    validateScenarioCatalog,
    forbiddenPublicBoundaryFields,
    forbiddenPublicActionTokens,
    defaultPublicBoundaryFields,
    taskScenarioCatalog,
    validateScenarioShape,
  });
}));
