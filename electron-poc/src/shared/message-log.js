(function initMessageLog(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackMessageLog = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-message-log/v2';
  const CLASSIFICATION_CONFIDENCE = Object.freeze(['typed', 'conservative', 'unclassified']);

  function isGenericDirectionPromptMessage(text) {
    return /^\s*(?:(?:choose|pick|select)\s+a\s+direction(?:\s+or\s+map\s+target)?|(?:in\s+)?what\s+direction\??)\.?\s*$/i.test(String(text || ''));
  }

  function optionalText(value) {
    const text = value == null ? '' : String(value).trim();
    return text || undefined;
  }

  function optionalPublicRef(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const copy = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry == null || ['string', 'number', 'boolean'].includes(typeof entry)) copy[key] = entry;
    }
    return Object.keys(copy).length ? Object.freeze(copy) : undefined;
  }

  function normalizeMessageEvent(input, defaults = {}) {
    const source = typeof input === 'string' ? { canonicalText: input } : input;
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError('MessageEvent must be text or an object');
    const canonicalText = String(source.canonicalText ?? source.text ?? '');
    if (!canonicalText.trim()) throw new TypeError('MessageEvent.canonicalText is required');
    const sequence = Number(source.sequence ?? defaults.sequence);
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new TypeError('MessageEvent.sequence must be a non-negative safe integer');
    const id = optionalText(source.id ?? defaults.id);
    if (!id) throw new TypeError('MessageEvent.id is required');
    const turnValue = source.turn ?? defaults.turn;
    const turn = turnValue == null ? undefined : Number(turnValue);
    if (turn !== undefined && (!Number.isSafeInteger(turn) || turn < 0)) throw new TypeError('MessageEvent.turn must be a non-negative safe integer when supplied');
    const confidence = CLASSIFICATION_CONFIDENCE.includes(source.classificationConfidence)
      ? source.classificationConfidence
      : (CLASSIFICATION_CONFIDENCE.includes(defaults.classificationConfidence) ? defaults.classificationConfidence : 'unclassified');
    const event = {
      id,
      canonicalText,
      sequence,
      source: optionalText(source.source ?? defaults.source) || 'core-message',
      classificationConfidence: confidence,
    };
    if (turn !== undefined) event.turn = turn;
    for (const field of ['category', 'severity']) {
      const value = optionalText(source[field] ?? defaults[field]);
      if (value) event[field] = value;
    }
    const actorRef = optionalPublicRef(source.actorRef ?? defaults.actorRef);
    const targetRef = optionalPublicRef(source.targetRef ?? defaults.targetRef);
    if (actorRef) event.actorRef = actorRef;
    if (targetRef) event.targetRef = targetRef;
    return Object.freeze(event);
  }

  function groupExactRepetitions(events) {
    const groups = [];
    for (const event of events || []) {
      const previous = groups[groups.length - 1];
      const exactTurnKnown = Number.isSafeInteger(event?.turn);
      if (previous && exactTurnKnown && previous.turn === event.turn && previous.canonicalText === event.canonicalText && previous.category === (event.category || '')) {
        groups[groups.length - 1] = Object.freeze({
          ...previous,
          count: previous.count + 1,
          eventIds: Object.freeze(previous.eventIds.concat(event.id)),
          events: Object.freeze(previous.events.concat(event)),
        });
      } else {
        groups.push(Object.freeze({
          canonicalText: event.canonicalText,
          turn: exactTurnKnown ? event.turn : undefined,
          category: event.category || '',
          severity: event.severity || '',
          count: 1,
          eventIds: Object.freeze([event.id]),
          events: Object.freeze([event]),
        }));
      }
    }
    return Object.freeze(groups);
  }

  function createMessageLog({ limit = Infinity, idPrefix = 'message' } = {}) {
    const maximum = Number.isFinite(Number(limit)) ? Math.max(1, Math.floor(Number(limit))) : Infinity;
    let events = [];
    let openingChronicle = [];
    let openingChronicleEventIds = new Set();
    let nextSequence = 1;
    const eventIds = new Set();

    function result(appended, extra = {}) {
      return Object.freeze({ appended, events: Object.freeze(events.slice()), entries: events.map((event) => event.canonicalText), ...extra });
    }

    function append(input, options = {}) {
      const source = typeof input === 'string' ? { canonicalText: input } : input;
      const canonicalText = String(source?.canonicalText ?? source?.text ?? '');
      if (!canonicalText.trim()) return result(false, { reason: 'blank' });
      if (options.logPrompt === false && isGenericDirectionPromptMessage(canonicalText)) return result(false, { reason: 'generic-direction-prompt' });

      const explicitIdentity = Boolean(source && typeof source === 'object' && (source.id || source.sequence != null || source.turn != null));
      const previous = events[events.length - 1];
      if (!options.allowConsecutiveDuplicate && !explicitIdentity && previous?.canonicalText === canonicalText) return result(false, { duplicate: true, reason: 'consecutive-compatibility-duplicate' });

      const sequence = Number.isSafeInteger(Number(source?.sequence)) && Number(source.sequence) >= 0 ? Number(source.sequence) : nextSequence;
      nextSequence = Math.max(nextSequence, sequence + 1);
      const id = optionalText(source?.id) || `${idPrefix}-${sequence}`;
      if (eventIds.has(id)) return result(false, { duplicate: true, reason: 'duplicate-event-id' });
      const event = normalizeMessageEvent(source, {
        id,
        sequence,
        source: options.source,
        turn: options.turn,
        category: options.category,
        severity: options.severity,
        actorRef: options.actorRef,
        targetRef: options.targetRef,
        classificationConfidence: options.classificationConfidence,
      });
      eventIds.add(event.id);
      events = events.concat(event);
      if (events.length > maximum) {
        const removed = events.slice(0, events.length - maximum);
        events = events.slice(-maximum);
        for (const removedEvent of removed) eventIds.delete(removedEvent.id);
      }
      return result(true, { event });
    }

    function appendMany(inputs, options = {}) {
      const appended = [];
      for (const input of inputs || []) {
        const outcome = append(input, options);
        if (outcome.appended) appended.push(outcome.event);
      }
      return Object.freeze({ appended: Object.freeze(appended), events: Object.freeze(events.slice()), entries: events.map((event) => event.canonicalText) });
    }

    function setOpeningChronicle(lines) {
      openingChronicle = Array.from(lines || [], (line) => String(line ?? '')).filter((line) => line.trim());
      openingChronicleEventIds = new Set();
      let eventIndex = 0;
      for (const loreLine of openingChronicle) {
        while (eventIndex < events.length && events[eventIndex].canonicalText !== loreLine) eventIndex += 1;
        if (eventIndex >= events.length) break;
        openingChronicleEventIds.add(events[eventIndex].id);
        eventIndex += 1;
      }
      return Object.freeze(openingChronicle.slice());
    }

    function search(query, { includeOpeningChronicle = true, groupOpeningChronicle = true } = {}) {
      const needle = String(query || '').trim().toLocaleLowerCase();
      const ordinaryEvents = groupOpeningChronicle && openingChronicleEventIds.size
        ? events.filter((event) => !openingChronicleEventIds.has(event.id))
        : events;
      const matchedEvents = needle ? ordinaryEvents.filter((event) => event.canonicalText.toLocaleLowerCase().includes(needle)) : ordinaryEvents.slice();
      const lore = includeOpeningChronicle
        ? openingChronicle.filter((line) => !needle || line.toLocaleLowerCase().includes(needle))
        : [];
      return Object.freeze({ events: Object.freeze(matchedEvents), openingChronicle: Object.freeze(lore) });
    }

    return Object.freeze({
      version,
      append,
      appendMany,
      setOpeningChronicle,
      openingChronicle: () => Object.freeze(openingChronicle.slice()),
      clear() { events = []; openingChronicle = []; openingChronicleEventIds.clear(); eventIds.clear(); nextSequence = 1; },
      entries: () => events.map((event) => event.canonicalText),
      events: () => Object.freeze(events.slice()),
      recent: (count = 4) => events.slice(-Math.max(0, Number(count) || 0)).map((event) => event.canonicalText),
      recentEvents: (count = 4) => Object.freeze(events.slice(-Math.max(0, Number(count) || 0))),
      search,
      grouped: () => groupExactRepetitions(events),
      size: () => events.length,
    });
  }

  return Object.freeze({
    version,
    CLASSIFICATION_CONFIDENCE,
    isGenericDirectionPromptMessage,
    normalizeMessageEvent,
    groupExactRepetitions,
    createMessageLog,
  });
}));
