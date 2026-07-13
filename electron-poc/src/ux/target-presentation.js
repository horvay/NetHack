(function initUxTargetPresentation(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxTargetPresentation = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-target-presentation/v1';
  const validationStates = Object.freeze(['core-will-validate', 'confirmed-legal', 'confirmed-illegal']);
  const candidateStates = Object.freeze(['legal', 'illegal', 'unknown']);
  const acknowledgementStates = Object.freeze(['accepted', 'rejected']);

  function cleanText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function stableId(value, field) {
    const id = cleanText(value);
    if (!id) throw new TypeError(`${field} is required`);
    return id;
  }

  function coordinate(value, field = 'coord') {
    if (!value || !Number.isInteger(value.x) || !Number.isInteger(value.y)) throw new TypeError(`${field} requires integer x and y`);
    return Object.freeze({ x: value.x, y: value.y });
  }

  function normalizeCandidate(input = {}) {
    const state = candidateStates.includes(input.state) ? input.state : 'unknown';
    if (state !== 'unknown' && input.authority !== 'core') throw new TypeError(`${state} target state requires core authority`);
    const candidate = {
      targetId: stableId(input.targetId, 'targetId'),
      coord: coordinate(input.coord, 'candidate coord'),
      state,
    };
    const publicLabel = cleanText(input.publicLabel);
    if (publicLabel) candidate.publicLabel = publicLabel;
    if (input.authoritativeLos != null) {
      if (input.authority !== 'core' || typeof input.authoritativeLos !== 'boolean') throw new TypeError('authoritativeLos requires a core boolean');
      candidate.authoritativeLos = input.authoritativeLos;
    }
    if (input.authoritativeRange != null) {
      if (input.authority !== 'core' || !Number.isFinite(Number(input.authoritativeRange)) || Number(input.authoritativeRange) < 0) throw new TypeError('authoritativeRange requires a non-negative core value');
      candidate.authoritativeRange = Number(input.authoritativeRange);
    }
    const rejectionReason = cleanText(input.rejectionReason);
    if (rejectionReason) {
      if (state !== 'illegal') throw new TypeError('rejectionReason is valid only for an illegal candidate');
      candidate.rejectionReason = rejectionReason;
    }
    return Object.freeze(candidate);
  }

  function normalizeAcknowledgement(input, promptId) {
    if (!input) return undefined;
    const state = acknowledgementStates.includes(input.state) ? input.state : '';
    if (!state) throw new TypeError('target acknowledgement state must be accepted or rejected');
    const acknowledgement = {
      acknowledgementId: stableId(input.acknowledgementId, 'acknowledgementId'),
      promptId: stableId(input.promptId, 'acknowledgement promptId'),
      targetId: stableId(input.targetId, 'acknowledgement targetId'),
      state,
    };
    if (acknowledgement.promptId !== promptId) throw new TypeError('target acknowledgement does not own this prompt');
    const reason = cleanText(input.reason);
    if (reason) acknowledgement.reason = reason;
    return Object.freeze(acknowledgement);
  }

  function normalizeTargetMetadata(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('target metadata must be an object');
    const promptId = stableId(input.promptId, 'promptId');
    const seenTargetIds = new Set();
    const seenCoords = new Set();
    const candidates = (Array.isArray(input.candidates) ? input.candidates : []).map((entry) => {
      const candidate = normalizeCandidate(entry);
      const coordKey = `${candidate.coord.x},${candidate.coord.y}`;
      if (seenTargetIds.has(candidate.targetId)) throw new TypeError(`duplicate targetId: ${candidate.targetId}`);
      if (seenCoords.has(coordKey)) throw new TypeError(`duplicate target coord: ${coordKey}`);
      seenTargetIds.add(candidate.targetId);
      seenCoords.add(coordKey);
      return candidate;
    });
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new TypeError('target metadata revision must be a non-negative safe integer');
    const metadata = {
      promptId,
      revision: input.revision,
      candidates: Object.freeze(candidates),
    };
    const acknowledgement = normalizeAcknowledgement(input.acknowledgement, promptId);
    if (acknowledgement) metadata.acknowledgement = acknowledgement;
    return Object.freeze(metadata);
  }

  function candidateAt(metadata, selectedCell) {
    if (!metadata || !selectedCell) return null;
    return metadata.candidates.find((candidate) => candidate.coord.x === selectedCell.x && candidate.coord.y === selectedCell.y) || null;
  }

  function targetValidation(candidate) {
    if (candidate?.state === 'legal') return 'confirmed-legal';
    if (candidate?.state === 'illegal') return 'confirmed-illegal';
    return 'core-will-validate';
  }

  function createTargetPresentation(input = {}) {
    const selectedCell = coordinate(input.selectedCell, 'selectedCell');
    const publicLabel = cleanText(input.publicLabel) || 'Unknown';
    const distance = Number.isFinite(Number(input.distance)) && Number(input.distance) >= 0 ? Number(input.distance) : undefined;
    const metadata = input.metadata ? normalizeTargetMetadata(input.metadata) : null;
    const candidate = candidateAt(metadata, selectedCell);
    const validation = targetValidation(candidate);
    const model = {
      selectedCell,
      publicLabel,
      mode: input.mode === 'travel' ? 'travel' : (input.mode === 'inspect' ? 'inspect' : 'target'),
      validation,
      statusText: validation === 'confirmed-legal'
        ? 'NetHack confirms this target is legal.'
        : (validation === 'confirmed-illegal' ? (candidate.rejectionReason || 'NetHack confirms this target is not legal.') : 'NetHack will validate this target.'),
    };
    if (distance !== undefined) model.distance = distance;
    if (candidate?.targetId) model.targetId = candidate.targetId;
    if (candidate?.authoritativeLos != null) model.authoritativeLos = candidate.authoritativeLos;
    if (candidate?.authoritativeRange != null) model.authoritativeRange = candidate.authoritativeRange;
    if (metadata?.promptId) model.promptId = metadata.promptId;
    if (candidate && metadata?.acknowledgement?.targetId === candidate.targetId) model.acknowledgement = metadata.acknowledgement;
    return Object.freeze(model);
  }

  function targetSummary(model) {
    const distance = model.distance == null ? '' : `, distance ${model.distance}`;
    return `${model.publicLabel}${distance}. ${model.statusText}`;
  }

  function acceptanceFor(metadataInput, promptId, targetId) {
    const metadata = normalizeTargetMetadata(metadataInput);
    if (metadata.promptId !== cleanText(promptId)) return null;
    const acknowledgement = metadata.acknowledgement;
    if (!acknowledgement || acknowledgement.targetId !== cleanText(targetId)) return null;
    return acknowledgement;
  }

  function acceptMetadata(previous, nextInput, options = {}) {
    const next = normalizeTargetMetadata(nextInput);
    const activePromptId = cleanText(options.activePromptId);
    if (activePromptId && next.promptId !== activePromptId) throw new TypeError('target metadata does not own the active prompt');
    if (previous?.promptId === next.promptId && next.revision <= previous.revision) throw new TypeError('target metadata revision is stale or duplicate');
    return next;
  }

  return Object.freeze({
    version,
    validationStates,
    candidateStates,
    acknowledgementStates,
    normalizeCandidate,
    normalizeTargetMetadata,
    candidateAt,
    createTargetPresentation,
    targetSummary,
    acceptanceFor,
    acceptMetadata,
  });
}));
