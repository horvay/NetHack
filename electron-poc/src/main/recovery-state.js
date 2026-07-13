const crypto = require('node:crypto');
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

function opaqueCandidateId(kind, identity) {
  const digest = crypto.createHash('sha256').update(`${kind}\0${String(identity || '')}`).digest('hex').slice(0, 20);
  return `${kind}:${digest}`;
}

function fileGenerationIdentity(name, stat) {
  return [name, stat?.dev, stat?.ino, stat?.size, stat?.mtimeMs, stat?.ctimeMs].join('\0');
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
const saveRoleNames = Object.freeze({
  Arc: 'Archeologist', Bar: 'Barbarian', Cav: 'Caveman', Hea: 'Healer', Kni: 'Knight', Mon: 'Monk',
  Pri: 'Priest', Ran: 'Ranger', Rog: 'Rogue', Sam: 'Samurai', Tou: 'Tourist', Val: 'Valkyrie', Wiz: 'Wizard',
});

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
        id: opaqueCandidateId('save', fileGenerationIdentity(entry.name, stat)),
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
  let recoverAvailable = false;
  try {
    fs.accessSync(recoverBin, fs.constants.X_OK);
    recoverAvailable = true;
  } catch {}
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
      const modifiedMs = Math.max(stat.mtimeMs, ...levelFiles.map((level) => level.modifiedMs));
      return {
        id: opaqueCandidateId('checkpoint', [
          fileGenerationIdentity(base, stat),
          ...levelFiles.map((level) => fileGenerationIdentity(level.name, fileStat(level.file))),
        ].join('\0')),
        kind: 'checkpoint',
        canContinue: recoverAvailable,
        base,
        displayName: `Recovered checkpoint ${base}`,
        file,
        pid,
        size: stat.size,
        levelFiles: levelFiles.map(({ name, file, size }) => ({ name, file, size })),
        modifiedAt: new Date(modifiedMs).toISOString(),
        modifiedMs,
        recoverAvailable,
      };
    })
    .filter(Boolean);
}

function safePlayerName(value) {
  const name = String(value || '');
  return /^[A-Za-z0-9_][-A-Za-z0-9_]{0,23}$/.test(name) ? name : '';
}

function publicCharacter(character, playerName = '') {
  if (!character && !playerName) return null;
  const publicValue = {};
  const name = safePlayerName(playerName);
  if (name) publicValue.name = name;
  const allowedByField = {
    role: saveIdentityRoleCodes, race: saveIdentityRaceCodes,
    gender: saveIdentityGenderCodes, alignment: saveIdentityAlignmentCodes,
  };
  for (const [field, allowed] of Object.entries(allowedByField)) {
    if (allowed.has(character?.[field])) publicValue[field] = character[field];
  }
  return Object.keys(publicValue).length ? Object.freeze(publicValue) : null;
}

function publicCandidate(candidate) {
  if (!candidate || !['save', 'checkpoint'].includes(candidate.kind)) return null;
  const playerName = safePlayerName(candidate.playerName);
  const id = new RegExp(`^${candidate.kind}:[a-f0-9]{20}$`).test(String(candidate.id || '')) ? candidate.id : '';
  if (!id) return null;
  const character = publicCharacter(candidate.character, playerName);
  const rawTimestamp = String(candidate.modifiedAt || '');
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(rawTimestamp) ? rawTimestamp : undefined;
  const publicValue = {
    ...(id ? { id } : {}),
    kind: candidate.kind,
    status: candidate.kind === 'save' ? 'saved' : 'recovery-candidate',
    canContinue: Boolean(candidate.canContinue),
    ...(playerName ? { playerName, heroName: playerName } : {}),
    ...(character ? { character } : {}),
    ...(character?.role ? { role: saveRoleNames[character.role] || character.role } : {}),
    ...(timestamp ? { timestamp, modifiedAt: timestamp } : {}),
  };
  return Object.freeze(publicValue);
}

function buildRecoveryState({ repoRoot, env = process.env } = {}) {
  const playground = resolvePlayground({ repoRoot, env });
  const recoverBin = recoverBinaryFor({ repoRoot, playground });
  const candidates = [
    ...listSaveCandidates({ playground, env }),
    ...listCheckpointCandidates({ playground, recoverBin }),
  ].sort((a, b) => b.modifiedMs - a.modifiedMs);
  const primaryCandidate = candidates.find((candidate) => candidate.canContinue) || null;
  return { playground, recoverBin, candidates, primaryCandidate };
}

function publicRecoveryState(state = {}) {
  const candidates = (Array.isArray(state.candidates) ? state.candidates : []).map(publicCandidate).filter(Boolean);
  const requestedPrimary = publicCandidate(state.primaryCandidate);
  const primaryCandidate = requestedPrimary
    ? candidates.find((candidate) => candidate.id === requestedPrimary.id) || null
    : null;
  return Object.freeze({
    ok: true,
    hasContinue: Boolean(primaryCandidate),
    primaryCandidate,
    candidates: Object.freeze(candidates),
  });
}

function getRecoveryState({ repoRoot, env = process.env } = {}) {
  return publicRecoveryState(buildRecoveryState({ repoRoot, env }));
}

function tail(text, limit = 2400) {
  const value = String(text || '');
  return value.length > limit ? value.slice(value.length - limit) : value;
}

function recoveredSaveFile({ recover, base, playground } = {}) {
  const escapedBase = String(base || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escapedBase) return '';
  const output = `${recover?.stdout || ''}\n${recover?.stderr || ''}`;
  const match = output.match(new RegExp(`^recovered "${escapedBase}" to (.+)$`, 'm'));
  if (!match) return '';
  const reported = String(match[1] || '').trim().replace(/^"|"$/g, '');
  if (!reported) return '';
  const resolved = path.resolve(playground, reported);
  const saveRoot = path.resolve(playground, 'save');
  if (resolved !== saveRoot && !resolved.startsWith(`${saveRoot}${path.sep}`)) return '';
  return resolved;
}

function withoutCandidate(state, candidateId) {
  const candidates = (state.candidates || []).filter((candidate) => candidate.id !== candidateId);
  const primaryCandidate = candidates.find((candidate) => candidate.canContinue) || null;
  return Object.freeze({ ...state, candidates: Object.freeze(candidates), hasContinue: Boolean(primaryCandidate), primaryCandidate });
}

function reportRecoverDiagnostic(onDiagnostic, type, { selected, recover, recoveredFile = '', correlated = false, playground = '', recoverBin = '' } = {}) {
  if (typeof onDiagnostic !== 'function') return;
  try {
    onDiagnostic(Object.freeze({
      type,
      detail: Object.freeze({
        candidateId: selected?.id || '',
        base: selected?.base || '',
        playground,
        recoverBin,
        recoveredFile,
        correlated,
        status: recover?.status ?? null,
        signal: recover?.signal ?? null,
        timedOut: Boolean(recover?.timedOut),
        error: recover?.error || '',
        stdout: tail(recover?.stdout),
        stderr: tail(recover?.stderr),
      }),
    }));
  } catch {}
}

function publicPrepareFailure(message, recovery) {
  return Object.freeze({ ok: false, message, recovery });
}

function publicPrepareSuccess({ kind, candidate, recoveredFrom, recovery } = {}) {
  const character = publicCharacter(candidate?.character, candidate?.playerName);
  return Object.freeze({
    ok: true,
    kind,
    ...(candidate?.playerName ? { playerName: candidate.playerName } : {}),
    ...(character ? { character } : {}),
    candidate: publicCandidate(candidate),
    ...(recoveredFrom ? { recoveredFrom: publicCandidate(recoveredFrom) } : {}),
    recovery,
  });
}

function compatibilityPrepareSuccess(details = {}) {
  const strict = publicPrepareSuccess(details);
  return Object.freeze({ ...strict, playerSpec: details.candidate.playerSpec });
}

// UXM-09A must atomically promote this strict projection with an internal,
// one-time continuation launch handoff. The currently frozen renderer consumes
// playerSpec directly, so the active IPC presenter remains the compatibility
// presenter below until that central integration is approved.
function toStrictPrepareResponse(response = {}) {
  const recovery = publicRecoveryState(response?.recovery || {});
  const knownMessages = new Set([
    'No saved or recoverable NetHack game was found.',
    'Unsupported recovery candidate.',
    'The recoverable game could not be prepared.',
    'Recovery did not produce a usable saved game.',
    'The previous game could not be continued.',
  ]);
  const requestedMessage = String(response?.message || '');
  const message = knownMessages.has(requestedMessage) ? requestedMessage : 'The previous game could not be continued.';
  const kind = ['save', 'checkpoint'].includes(response?.kind) ? response.kind : '';
  const candidate = publicCandidate(response?.candidate);
  const recoveredFrom = publicCandidate(response?.recoveredFrom);
  const validSuccessShape = kind === 'save'
    ? candidate?.kind === 'save' && !recoveredFrom
    : kind === 'checkpoint' && candidate?.kind === 'save' && recoveredFrom?.kind === 'checkpoint';
  if (!response || response.ok !== true || !validSuccessShape) {
    return publicPrepareFailure(message, recovery);
  }
  return Object.freeze({
    ok: true,
    kind,
    ...(safePlayerName(response.playerName) ? { playerName: safePlayerName(response.playerName) } : {}),
    ...(response.character ? { character: publicCharacter(response.character, response.playerName) } : {}),
    candidate,
    ...(recoveredFrom ? { recoveredFrom } : {}),
    recovery,
  });
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

async function prepareContinueGame({ repoRoot, env = process.env, candidateId = '', onDiagnostic } = {}) {
  const initialInternal = buildRecoveryState({ repoRoot, env });
  const initial = publicRecoveryState(initialInternal);
  const requestedId = String(candidateId || '').trim();
  const selected = requestedId
    ? initialInternal.candidates.find((candidate) => candidate.id === requestedId && candidate.canContinue)
    : initialInternal.primaryCandidate;
  if (!selected || !selected.canContinue) {
    return publicPrepareFailure('No saved or recoverable NetHack game was found.', initial);
  }
  if (selected.kind === 'save') {
    return compatibilityPrepareSuccess({ kind: 'save', candidate: selected, recovery: initial });
  }
  if (selected.kind !== 'checkpoint') {
    return publicPrepareFailure('Unsupported recovery candidate.', initial);
  }

  const beforeSaves = new Map(initialInternal.candidates.filter((candidate) => candidate.kind === 'save').map((candidate) => [candidate.id, candidate.modifiedMs]));
  const recover = await runRecover({ recoverBin: initialInternal.recoverBin, playground: initialInternal.playground, base: selected.base, repoRoot, env });
  const afterInternal = buildRecoveryState({ repoRoot, env });
  const after = publicRecoveryState(afterInternal);
  if (recover.status !== 0) {
    reportRecoverDiagnostic(onDiagnostic, 'recovery.prepare-failed', {
      selected, recover, playground: initialInternal.playground, recoverBin: initialInternal.recoverBin,
    });
    return publicPrepareFailure('The recoverable game could not be prepared.', withoutCandidate(after, selected.id));
  }
  const recoveredFile = recoveredSaveFile({ recover, base: selected.base, playground: initialInternal.playground });
  const save = recoveredFile ? afterInternal.candidates.find((candidate) => candidate.kind === 'save'
    && candidate.canContinue
    && path.resolve(candidate.file) === recoveredFile
    && (!beforeSaves.has(candidate.id) || candidate.modifiedMs > beforeSaves.get(candidate.id))) : null;
  if (!save || save.kind !== 'save' || !save.playerSpec) {
    reportRecoverDiagnostic(onDiagnostic, 'recovery.prepare-uncorrelated', {
      selected, recover, recoveredFile, correlated: false, playground: initialInternal.playground, recoverBin: initialInternal.recoverBin,
    });
    return publicPrepareFailure('Recovery did not produce a usable saved game.', withoutCandidate(after, selected.id));
  }
  reportRecoverDiagnostic(onDiagnostic, 'recovery.prepare-succeeded', {
    selected, recover, recoveredFile, correlated: true, playground: initialInternal.playground, recoverBin: initialInternal.recoverBin,
  });
  return compatibilityPrepareSuccess({ kind: 'checkpoint', candidate: save, recoveredFrom: selected, recovery: after });
}

async function prepareContinueGameStrict(options = {}) {
  return toStrictPrepareResponse(await prepareContinueGame(options));
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
  prepareContinueGameStrict,
  toStrictPrepareResponse,
});
