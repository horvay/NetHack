const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const version = 'nethack-screenshot-qc/v2';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function imageMetadata(file) {
  const result = spawnSync('python3', ['-c', [
    'from PIL import Image',
    'import json, os, sys',
    'with Image.open(sys.argv[1]) as image:',
    " print(json.dumps({'width': image.width, 'height': image.height, 'format': image.format, 'mode': image.mode, 'bytes': os.path.getsize(sys.argv[1])}))",
  ].join('\n'), file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Screenshot metadata failed for ${file}: ${result.stderr || result.stdout}`);
  return Object.freeze(JSON.parse(result.stdout));
}

function createDerivative(source, target, { format = 'BMP', scale = 1 } = {}) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const result = spawnSync('python3', ['-c', [
    'from PIL import Image',
    'import sys',
    'scale=float(sys.argv[3])',
    'with Image.open(sys.argv[1]) as image:',
    " rgb=image.convert('RGB')",
    ' if scale != 1:',
    '  rgb=rgb.resize((max(1, round(rgb.width*scale)), max(1, round(rgb.height*scale))), Image.Resampling.LANCZOS)',
    " rgb.save(sys.argv[2], format=sys.argv[4], quality=95)",
  ].join('\n'), source, target, String(scale), String(format).toUpperCase()], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`View-safe screenshot transcode failed: ${result.stderr || result.stdout}`);
  return target;
}

function paintedRegionStats(file, regions = []) {
  const result = spawnSync('python3', ['-c', [
    'from PIL import Image, ImageStat',
    'import json, sys',
    'regions=json.loads(sys.argv[2])',
    'with Image.open(sys.argv[1]).convert("RGB") as image:',
    ' out=[]',
    ' for region in regions:',
    '  box=region["box"]',
    '  left=max(0,min(image.width,int(round(box["left"]))))',
    '  top=max(0,min(image.height,int(round(box["top"]))))',
    '  right=max(left,min(image.width,int(round(box["right"]))))',
    '  bottom=max(top,min(image.height,int(round(box["bottom"]))))',
    '  crop=image.crop((left,top,right,bottom))',
    '  colors=crop.getcolors(maxcolors=max(1,crop.width*crop.height)) or []',
    '  stat=ImageStat.Stat(crop) if crop.width and crop.height else None',
    '  near_black=sum(count for count,color in colors if max(color)<8)',
    '  pixels=max(1,crop.width*crop.height)',
    '  out.append({"id":region["id"],"box":{"left":left,"top":top,"right":right,"bottom":bottom},"width":crop.width,"height":crop.height,"uniqueColors":len(colors),"nearBlackRatio":near_black/pixels,"mean":stat.mean if stat else [0,0,0],"stddev":stat.stddev if stat else [0,0,0]})',
    ' print(json.dumps(out))',
  ].join('\n'), file, JSON.stringify(regions)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Painted-region analysis failed for ${file}: ${result.stderr || result.stdout}`);
  return Object.freeze(JSON.parse(result.stdout).map((entry) => Object.freeze(entry)));
}

function fileRecord(file) {
  const metadata = imageMetadata(file);
  return Object.freeze({
    path: path.resolve(file),
    format: metadata.format,
    mode: metadata.mode,
    width: metadata.width,
    height: metadata.height,
    bytes: metadata.bytes,
    sha256: sha256(file),
  });
}

function safeId(value) {
  const id = String(value || '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!id) throw new TypeError('Screenshot QC capture requires an id');
  return id;
}

function createScreenshotQc({ rootDir, manifestFile = path.join(rootDir, 'screenshot-qc.json') } = {}) {
  if (!rootDir) throw new TypeError('Screenshot QC requires rootDir');
  fs.mkdirSync(path.join(rootDir, 'raw-captures'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'view-safe'), { recursive: true });
  const manifest = {
    schema: version,
    createdAt: new Date().toISOString(),
    rootDir: path.resolve(rootDir),
    manualInspectionCompleted: false,
    files: [],
  };

  function save() {
    manifest.updatedAt = new Date().toISOString();
    manifest.manualInspectionCompleted = manifest.files.length > 0 && manifest.files.every((entry) => entry.manualInspection.status === 'accepted');
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifestFile;
  }

  function rawPath(id) {
    // Accepted raw evidence is lossless. In particular, do not interpose a JPEG
    // transcode between Electron's capturePage() PNG and manual inspection.
    return path.join(rootDir, 'raw-captures', `${safeId(id)}.png`);
  }

  function recordCapture(id, source, options = {}) {
    const captureId = safeId(id);
    if (!fs.existsSync(source)) throw new Error(`Missing raw screenshot: ${source}`);
    const canonicalRaw = rawPath(captureId);
    if (path.resolve(source) !== path.resolve(canonicalRaw)) fs.copyFileSync(source, canonicalRaw);
    source = canonicalRaw;
    const format = String(options.viewSafeFormat || 'BMP').toUpperCase();
    const extension = format === 'JPEG' ? 'jpg' : format.toLowerCase();
    const derivativePath = path.join(rootDir, 'view-safe', `${captureId}.${extension}`);
    createDerivative(source, derivativePath, { format, scale: options.viewSafeScale == null ? 1 : Number(options.viewSafeScale) });
    const raw = fileRecord(source);
    const derivative = fileRecord(derivativePath);
    const entry = {
      id: captureId,
      capturedAt: new Date().toISOString(),
      viewport: options.viewport || null,
      state: options.state || null,
      captureMethod: options.captureMethod || 'Chrome DevTools Page.captureScreenshot',
      captureSource: options.captureSource || null,
      raw,
      derivative,
      relationship: Object.freeze({
        sourceSha256: raw.sha256,
        format,
        scale: options.viewSafeScale == null ? 1 : Number(options.viewSafeScale),
        transform: `Pillow RGB transcode to ${format}${options.viewSafeScale && Number(options.viewSafeScale) !== 1 ? ` at scale ${Number(options.viewSafeScale)}` : ' at source dimensions'}`,
      }),
      manualInspection: { status: 'pending', inspector: '', inspectedAt: '', notes: '' },
    };
    const prior = manifest.files.findIndex((candidate) => candidate.id === captureId);
    if (prior >= 0) manifest.files.splice(prior, 1, entry);
    else manifest.files.push(entry);
    save();
    return Object.freeze(JSON.parse(JSON.stringify(entry)));
  }

  function markInspected(id, { accepted, inspector, notes } = {}) {
    const entry = manifest.files.find((candidate) => candidate.id === safeId(id));
    if (!entry) throw new Error(`Unknown screenshot QC id: ${id}`);
    if (!String(notes || '').trim()) throw new TypeError('Screenshot inspection notes are required');
    entry.manualInspection = {
      status: accepted ? 'accepted' : 'rejected',
      inspector: String(inspector || 'Developer'),
      inspectedAt: new Date().toISOString(),
      notes: String(notes).trim(),
    };
    save();
    return Object.freeze(JSON.parse(JSON.stringify(entry)));
  }

  function snapshot() {
    return Object.freeze(JSON.parse(JSON.stringify(manifest)));
  }

  save();
  return Object.freeze({ version, rootDir: path.resolve(rootDir), manifestFile: path.resolve(manifestFile), rawPath, recordCapture, markInspected, save, snapshot });
}

function markManifestInspection(manifestFile, id, { accepted, inspector, notes } = {}) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const entry = (manifest.files || []).find((candidate) => candidate.id === safeId(id));
  if (!entry) throw new Error(`Unknown screenshot QC id: ${id}`);
  if (!String(notes || '').trim()) throw new TypeError('Screenshot inspection notes are required');
  entry.manualInspection = {
    status: accepted ? 'accepted' : 'rejected',
    inspector: String(inspector || 'Developer'),
    inspectedAt: new Date().toISOString(),
    notes: String(notes).trim(),
  };
  manifest.updatedAt = new Date().toISOString();
  manifest.manualInspectionCompleted = manifest.files.length > 0 && manifest.files.every((candidate) => candidate.manualInspection?.status === 'accepted');
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return Object.freeze(JSON.parse(JSON.stringify(entry)));
}

function validateManifest(manifestFile, { requireInspection = false } = {}) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const errors = [];
  const rootDir = path.resolve(manifest.rootDir || path.dirname(manifestFile));
  const ids = new Set();
  if (manifest.schema !== version) errors.push(`unexpected schema ${manifest.schema || '(missing)'}`);
  if (!Array.isArray(manifest.files) || !manifest.files.length) errors.push('manifest has no screenshot files');
  for (const entry of manifest.files || []) {
    if (!entry.id || ids.has(entry.id)) errors.push(`${entry.id || '(missing id)'} duplicate or missing capture id`);
    ids.add(entry.id);
    for (const role of ['raw', 'derivative']) {
      const record = entry[role];
      const expectedRoot = path.join(rootDir, role === 'raw' ? 'raw-captures' : 'view-safe');
      if (!record?.path || !fs.existsSync(record.path)) errors.push(`${entry.id} missing ${role} file`);
      else {
        const resolved = path.resolve(record.path);
        if (path.dirname(resolved) !== expectedRoot) errors.push(`${entry.id} ${role} path is outside its canonical evidence directory`);
        if (sha256(resolved) !== record.sha256) errors.push(`${entry.id} ${role} hash mismatch`);
        const metadata = imageMetadata(resolved);
        for (const key of ['width', 'height', 'format', 'mode', 'bytes']) if (metadata[key] !== record[key]) errors.push(`${entry.id} ${role} ${key} mismatch`);
        if (role === 'raw' && metadata.format !== 'PNG') errors.push(`${entry.id} accepted raw capture must be lossless PNG`);
      }
    }
    if (entry.relationship?.sourceSha256 !== entry.raw?.sha256) errors.push(`${entry.id} source relationship mismatch`);
    const transformFormat = String(entry.relationship?.format || '').toUpperCase();
    const transformScale = Number(entry.relationship?.scale);
    if (!transformFormat || !Number.isFinite(transformScale) || transformScale <= 0) errors.push(`${entry.id} derivative transform metadata is incomplete`);
    else if (entry.raw?.path && entry.derivative?.path && fs.existsSync(entry.raw.path) && fs.existsSync(entry.derivative.path)) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-screenshot-verify-'));
      const temp = path.join(tempDir, 'derivative');
      try {
        createDerivative(entry.raw.path, temp, { format: transformFormat, scale: transformScale });
        if (sha256(temp) !== entry.derivative.sha256) errors.push(`${entry.id} derivative is not reproducible from canonical raw evidence`);
      } catch (error) { errors.push(`${entry.id} derivative verification failed: ${error.message}`); }
      finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
    }
    if (entry.viewport?.width && entry.viewport?.height) {
      const pixelRatio = Number(entry.viewport.devicePixelRatio || 1);
      const expectedWidth = Math.round(Number(entry.viewport.width) * pixelRatio);
      const expectedHeight = Math.round(Number(entry.viewport.height) * pixelRatio);
      if (entry.raw?.width !== expectedWidth || entry.raw?.height !== expectedHeight) errors.push(`${entry.id} raw dimensions do not match declared viewport`);
    }
    if (requireInspection && entry.manualInspection?.status !== 'accepted') errors.push(`${entry.id} manual inspection incomplete`);
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), fileCount: manifest.files?.length || 0, manualInspectionCompleted: Boolean(manifest.manualInspectionCompleted) });
}

module.exports = Object.freeze({ version, sha256, imageMetadata, paintedRegionStats, createDerivative, fileRecord, createScreenshotQc, markManifestInspection, validateManifest });
