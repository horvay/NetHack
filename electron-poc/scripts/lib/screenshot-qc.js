'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const EvidenceApproval = require('./evidence-approval');

const version = EvidenceApproval.version;

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
  if (!id) throw new TypeError('Screenshot capture requires an id');
  return id;
}

function createScreenshotQc({ rootDir, runIdentity = crypto.randomUUID(), manifestFile = path.join(rootDir, 'evidence-approval.json') } = {}) {
  if (!rootDir) throw new TypeError('Screenshot QC requires rootDir');
  fs.mkdirSync(path.join(rootDir, 'raw-captures'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'view-safe'), { recursive: true });
  const approval = EvidenceApproval.createEvidenceApproval({ rootDir, runIdentity, manifestFile });

  function rawPath(id) {
    return path.join(rootDir, 'raw-captures', `${safeId(id)}.png`);
  }

  function recordCapture(id, source, options = {}) {
    const captureId = safeId(id);
    if (approval.snapshot().captures.some((capture) => capture.id === captureId)) {
      throw new Error(`Screenshot capture ${captureId} is immutable within Verification Run ${approval.runIdentity}`);
    }
    if (!fs.existsSync(source)) throw new Error(`Missing raw screenshot: ${source}`);
    const canonicalRaw = rawPath(captureId);
    if (path.resolve(source) !== path.resolve(canonicalRaw)) {
      fs.copyFileSync(source, canonicalRaw, fs.constants.COPYFILE_EXCL);
    }
    const format = String(options.viewSafeFormat || 'BMP').toUpperCase();
    const extension = format === 'JPEG' ? 'jpg' : format.toLowerCase();
    const scale = options.viewSafeScale == null ? 1 : Number(options.viewSafeScale);
    const derivativePath = path.join(rootDir, 'view-safe', `${captureId}.${extension}`);
    if (fs.existsSync(derivativePath)) throw new Error(`Screenshot derivative ${captureId} already exists and cannot be overwritten`);
    createDerivative(canonicalRaw, derivativePath, { format, scale });
    return approval.recordCapture({
      id: captureId,
      classification: options.classification || 'unclassified',
      capturedAt: options.capturedAt,
      viewport: options.viewport || null,
      state: options.state || null,
      provenance: {
        adapter: options.captureAdapter || 'unknown',
        mechanism: options.captureMethod || 'unspecified capture mechanism',
        source: options.captureSource || null,
      },
      raw: fileRecord(canonicalRaw),
      derivative: {
        ...fileRecord(derivativePath),
        provenance: {
          transform: {
            implementation: 'Pillow',
            colorMode: 'RGB',
            format,
            scale,
            resampling: scale === 1 ? 'none' : 'LANCZOS',
          },
        },
      },
    });
  }

  return Object.freeze({
    version,
    runIdentity: approval.runIdentity,
    rootDir: approval.rootDir,
    manifestFile: approval.manifestFile,
    rawPath,
    recordCapture,
    recordAssertions: approval.recordAssertions,
    recordLog: approval.recordLog,
    inspectCapture: approval.inspectCapture,
    decideCapture: approval.decideCapture,
    snapshot: approval.snapshot,
  });
}

function validateManifest(manifestFile, { requireApproval = false, expectedRunIdentity } = {}) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const approval = EvidenceApproval.validateEvidenceApproval(manifest, { requireApproval, expectedRunIdentity });
  const errors = [...approval.errors];
  for (const capture of manifest.captures || []) {
    for (const role of ['raw', 'derivative']) {
      const record = capture[role];
      if (!record?.path || !fs.existsSync(record.path)) continue;
      const metadata = imageMetadata(record.path);
      for (const key of ['width', 'height', 'format', 'mode', 'bytes']) {
        if (metadata[key] !== record[key]) errors.push(`${capture.id} ${role} ${key} mismatch`);
      }
      if (role === 'raw' && metadata.format !== 'PNG') errors.push(`${capture.id} raw capture must be lossless PNG`);
    }
    const transform = capture.derivative?.provenance?.transform;
    if (capture.raw?.path && capture.derivative?.path && transform?.format && Number.isFinite(Number(transform.scale))) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-screenshot-verify-'));
      const temp = path.join(tempDir, 'derivative');
      try {
        createDerivative(capture.raw.path, temp, { format: transform.format, scale: Number(transform.scale) });
        if (sha256(temp) !== capture.derivative.sha256) errors.push(`${capture.id} derivative is not reproducible from canonical raw capture`);
      } catch (error) {
        errors.push(`${capture.id} derivative verification failed: ${error.message}`);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } else {
      errors.push(`${capture.id} derivative transform provenance is incomplete`);
    }
    if (capture.viewport?.width && capture.viewport?.height) {
      const pixelRatio = Number(capture.viewport.devicePixelRatio || 1);
      const expectedWidth = Math.round(Number(capture.viewport.width) * pixelRatio);
      const expectedHeight = Math.round(Number(capture.viewport.height) * pixelRatio);
      if (capture.raw?.width !== expectedWidth || capture.raw?.height !== expectedHeight) errors.push(`${capture.id} raw dimensions do not match declared viewport`);
    }
  }
  const state = Object.freeze({ ...approval.state, manuallyApproved: approval.state.manuallyApproved && errors.length === 0 });
  return Object.freeze({ ...approval, ok: errors.length === 0, errors: Object.freeze(errors), state });
}

module.exports = Object.freeze({ version, imageMetadata, paintedRegionStats, fileRecord, createScreenshotQc, validateManifest });
