const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const zlib = require('node:zlib');

function resolvePlayground({ repoRoot, env = process.env } = {}) {
  return path.resolve(env.NH_TEST_PLAYGROUND || env.NETHACKDIR || path.join(repoRoot, 'playground'));
}

function recoverBinaryFor({ repoRoot, playground } = {}) {
  const candidates = [path.join(repoRoot, 'util', 'recover'), path.join(playground, 'recover')];
  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) || candidates[0];
}

function fileStat(file) {
  try { return fs.statSync(file); }
  catch { return null; }
}

function readStoredPid(file) {
  try {
    const buffer = fs.readFileSync(file);
    if (buffer.length < 4) return null;
    const pid = buffer.readInt32LE(0);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function pidIsAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

function currentUid(env = process.env) {
  const rawOverride = String(env.NH_ELECTRON_RECOVERY_UID || '').trim();
  if (rawOverride) {
    const override = Number(rawOverride);
    if (Number.isInteger(override) && override >= 0) return override;
  }
  return typeof process.getuid === 'function' ? process.getuid() : 0;
}

function parseSaveName(name, uid) {
  const withoutCompression = name.endsWith('.gz') ? name.slice(0, -3) : name;
  const prefix = String(uid);
  if (!withoutCompression.startsWith(prefix)) return null;
  const playerName = withoutCompression.slice(prefix.length);
  if (!/^[A-Za-z0-9_][-A-Za-z0-9_]{0,23}$/.test(playerName)) return null;
  return playerName;
}

const saveIdentityRoleCodes = new Set(['Arc', 'Bar', 'Cav', 'Hea', 'Kni', 'Mon', 'Pri', 'Ran', 'Rog', 'Sam', 'Tou', 'Val', 'Wiz']);
const saveIdentityRaceCodes = new Set(['Hum', 'Dwa', 'Elf', 'Gno', 'Orc']);
const saveIdentityGenderCodes = new Set(['Mal', 'Fem', 'Neu']);
const saveIdentityAlignmentCodes = new Set(['Law', 'Neu', 'Cha']);

function inflateSaveBufferIfNeeded(file, buffer) {
  if (!String(file || '').endsWith('.gz')) return buffer;
  try { return zlib.gunzipSync(buffer); }
  catch { return buffer; }
}

function parseSaveCharacterBuffer(buffer, playerName = '') {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer || '');
  const escapedName = String(playerName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scoped = escapedName ? new RegExp(`${escapedName}\x00([A-Za-z]{3})-([A-Za-z]{3})-([A-Za-z]{3})-([A-Za-z]{3})`) : null;
  const match = scoped?.exec(text) || /\x00(Arc|Bar|Cav|Hea|Kni|Mon|Pri|Ran|Rog|Sam|Tou|Val|Wiz)-(Hum|Dwa|Elf|Gno|Orc)-(Mal|Fem|Neu)-(Law|Neu|Cha)/.exec(text);
  if (!match) return null;
  const [, role, race, gender, alignment] = match;
  if (!saveIdentityRoleCodes.has(role) || !saveIdentityRaceCodes.has(race) || !saveIdentityGenderCodes.has(gender) || !saveIdentityAlignmentCodes.has(alignment)) return null;
  return { role, race, gender, alignment };
}

function readSaveCharacter({ file, playerName } = {}) {
  try {
    const raw = fs.readFileSync(file);
    return parseSaveCharacterBuffer(inflateSaveBufferIfNeeded(file, raw), playerName);
  } catch {
    return null;
  }
}

function listSaveCandidates({ playground, env = process.env } = {}) {
  const saveDir = path.join(playground, 'save');
  const uid = currentUid(env);
  let entries = [];
  try { entries = fs.readdirSync(saveDir, { withFileTypes: true }); }
  catch { return []; }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = path.join(saveDir, entry.name);
      const stat = fileStat(file);
      const playerName = parseSaveName(entry.name, uid);
      if (!stat || stat.size <= 0 || !playerName) return null;
      const character = readSaveCharacter({ file, playerName });
      return {
        id: `save:${entry.name}`,
        kind: 'save',
        canContinue: true,
        playerName,
        playerSpec: `-u${playerName}`,
        displayName: playerName,
        ...(character ? { character } : {}),
        file,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        modifiedMs: stat.mtimeMs,
      };
    })
    .filter(Boolean);
}

function checkpointLevelFiles({ playground, base } = {}) {
  let entries = [];
  try { entries = fs.readdirSync(playground, { withFileTypes: true }); }
  catch { return []; }
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(`${base}.`) && !entry.name.endsWith('.0'))
    .map((entry) => {
      const file = path.join(playground, entry.name);
      const stat = fileStat(file);
      return stat && stat.size > 1024 ? { name: entry.name, file, size: stat.size, modifiedMs: stat.mtimeMs } : null;
    })
    .filter(Boolean);
}

function listCheckpointCandidates({ playground, recoverBin } = {}) {
  let entries = [];
  try { entries = fs.readdirSync(playground, { withFileTypes: true }); }
  catch { return []; }
  const recoverAvailable = Boolean(recoverBin && fileStat(recoverBin));
  return entries
    .filter((entry) => entry.isFile() && /^[a-z]lock\.0$/i.test(entry.name))
    .map((entry) => {
      const file = path.join(playground, entry.name);
      const stat = fileStat(file);
      if (!stat) return null;
      const pid = readStoredPid(file);
      const active = pidIsAlive(pid);
      const checkpointBytes = stat.size > 4096;
      if (!checkpointBytes || active) return null;
      const base = entry.name.replace(/\.0$/, '');
      const levelFiles = checkpointLevelFiles({ playground, base });
      if (!levelFiles.length) return null;
      return {
        id: `checkpoint:${base}`,
        kind: 'checkpoint',
        canContinue: recoverAvailable,
        base,
        displayName: `Recovered checkpoint ${base}`,
        file,
        pid,
        size: stat.size,
        levelFiles: levelFiles.map(({ name, file, size }) => ({ name, file, size })),
        modifiedAt: stat.mtime.toISOString(),
        modifiedMs: Math.max(stat.mtimeMs, ...levelFiles.map((level) => level.modifiedMs)),
        recoverAvailable,
      };
    })
    .filter(Boolean);
}

function publicCandidate(candidate) {
  if (!candidate) return null;
  const copy = { ...candidate };
  delete copy.modifiedMs;
  return copy;
}

function getRecoveryState({ repoRoot, env = process.env } = {}) {
  const playground = resolvePlayground({ repoRoot, env });
  const recoverBin = recoverBinaryFor({ repoRoot, playground });
  const candidates = [
    ...listSaveCandidates({ playground, env }),
    ...listCheckpointCandidates({ playground, recoverBin }),
  ].sort((a, b) => b.modifiedMs - a.modifiedMs);
  const continuable = candidates.filter((candidate) => candidate.canContinue);
  const primary = continuable[0] || null;
  return {
    ok: true,
    playground,
    recoverBin,
    hasContinue: Boolean(primary),
    primaryCandidate: publicCandidate(primary),
    candidates: candidates.map(publicCandidate),
  };
}

function tail(text, limit = 2400) {
  const value = String(text || '');
  return value.length > limit ? value.slice(value.length - limit) : value;
}

function withoutCandidate(state, candidateId) {
  const candidates = (state.candidates || []).filter((candidate) => candidate.id !== candidateId);
  const primaryCandidate = candidates.find((candidate) => candidate.canContinue) || null;
  return { ...state, candidates, hasContinue: Boolean(primaryCandidate), primaryCandidate };
}

function runRecover({ recoverBin, playground, base, repoRoot, env = process.env, timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(recoverBin, ['-d', playground, base], {
      cwd: repoRoot,
      env: { ...env, NETHACKDIR: playground },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, ...result });
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      finish({ status: null, signal: 'TIMEOUT', timedOut: true });
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => finish({ status: null, signal: null, error: String(error?.message || error) }));
    child.on('close', (code, signal) => finish({ status: code, signal }));
  });
}

async function prepareContinueGame({ repoRoot, env = process.env, candidateId = '' } = {}) {
  const initial = getRecoveryState({ repoRoot, env });
  const selected = initial.candidates.find((candidate) => candidate.id === candidateId && candidate.canContinue)
    || initial.primaryCandidate;
  if (!selected || !selected.canContinue) {
    return { ok: false, message: 'No saved or recoverable NetHack game was found.', recovery: initial };
  }
  if (selected.kind === 'save') {
    return { ok: true, kind: 'save', playerSpec: selected.playerSpec, playerName: selected.playerName, character: selected.character || null, candidate: selected, recovery: initial };
  }
  if (selected.kind !== 'checkpoint') {
    return { ok: false, message: 'Unsupported recovery candidate.', recovery: initial };
  }

  const beforeSaveIds = new Set(initial.candidates.filter((candidate) => candidate.kind === 'save').map((candidate) => candidate.id));
  const recover = await runRecover({ recoverBin: initial.recoverBin, playground: initial.playground, base: selected.base, repoRoot, env });
  const after = getRecoveryState({ repoRoot, env });
  if (recover.status !== 0) {
    const recovery = withoutCandidate(after, selected.id);
    return {
      ok: false,
      message: `Recovery failed for checkpoint ${selected.base}.`,
      recover: { status: recover.status, signal: recover.signal, timedOut: Boolean(recover.timedOut), error: recover.error || '', stdout: tail(recover.stdout), stderr: tail(recover.stderr) },
      recovery,
    };
  }
  const save = after.candidates.find((candidate) => candidate.kind === 'save' && !beforeSaveIds.has(candidate.id) && candidate.canContinue)
    || after.primaryCandidate;
  if (!save || save.kind !== 'save' || !save.playerSpec) {
    const recovery = withoutCandidate(after, selected.id);
    return {
      ok: false,
      message: `Recovery ran but did not produce a usable save file for checkpoint ${selected.base}.`,
      recover: { status: recover.status, signal: recover.signal, timedOut: Boolean(recover.timedOut), error: recover.error || '', stdout: tail(recover.stdout), stderr: tail(recover.stderr) },
      recovery,
    };
  }
  return {
    ok: true,
    kind: 'checkpoint',
    playerSpec: save.playerSpec,
    playerName: save.playerName,
    character: save.character || null,
    candidate: save,
    recoveredFrom: selected,
    recover: { status: recover.status, signal: recover.signal, timedOut: Boolean(recover.timedOut), error: recover.error || '', stdout: tail(recover.stdout), stderr: tail(recover.stderr) },
    recovery: after,
  };
}

module.exports = Object.freeze({
  resolvePlayground,
  recoverBinaryFor,
  parseSaveName,
  parseSaveCharacterBuffer,
  readSaveCharacter,
  listSaveCandidates,
  checkpointLevelFiles,
  listCheckpointCandidates,
  getRecoveryState,
  prepareContinueGame,
});
