(function initUxConsequenceFeed(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../shared/message-log.js'));
  else root.NetHackUxConsequenceFeed = factory(root.NetHackMessageLog);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(MessageLog) {
  const version = 'nethack-consequence-feed/v1';
  const CATEGORY_RULES = Object.freeze([
    Object.freeze({ category: 'kill', severity: 'success', pattern: /^(?:You (?:kill|destroy)|The .* is killed)\b/i }),
    Object.freeze({ category: 'miss', severity: 'info', pattern: /\b(?:miss|misses)\b/i }),
    Object.freeze({ category: 'resistance', severity: 'info', pattern: /\bresist(?:s|ed|ance)?\b/i }),
    Object.freeze({ category: 'item-breakage', severity: 'warning', pattern: /\b(?:breaks|shatters|is destroyed|are destroyed)\b/i }),
    Object.freeze({ category: 'pet-harm', severity: 'warning', pattern: /^(?:Your .+ (?:is hit|is killed|dies)|You hear .+ yelp)\b/i }),
    Object.freeze({ category: 'blocked-action', severity: 'warning', pattern: /\b(?:cannot|can't|is locked|nothing happens|you are unable)\b/i }),
    Object.freeze({ category: 'hazard', severity: 'danger', pattern: /\b(?:trap|lava|poison|acid|burning oil)\b/i }),
    Object.freeze({ category: 'damage', severity: 'danger', pattern: /^(?:The .+ hits you|You are hit|It hits you)\b/i }),
    Object.freeze({ category: 'status-gained', severity: 'warning', pattern: /^(?:You (?:are|feel|become) (?!no longer\b)|You can no longer)\b/i }),
    Object.freeze({ category: 'status-lost', severity: 'success', pattern: /^(?:You (?:are|feel) no longer|You can see again)\b/i }),
  ]);

  function classifyCanonicalText(canonicalText) {
    const text = String(canonicalText || '');
    const rule = CATEGORY_RULES.find((candidate) => candidate.pattern.test(text));
    return Object.freeze(rule
      ? { category: rule.category, severity: rule.severity, classificationConfidence: 'conservative' }
      : { classificationConfidence: 'unclassified' });
  }

  function presentConsequence(input, defaults = {}) {
    const classification = input?.category
      ? { category: input.category, severity: input.severity, classificationConfidence: input.classificationConfidence || 'typed' }
      : classifyCanonicalText(input?.canonicalText ?? input?.text ?? input);
    return MessageLog.normalizeMessageEvent(input, { ...defaults, ...classification });
  }

  function createConsequenceFeed(options = {}) {
    const log = options.log || MessageLog.createMessageLog({ idPrefix: options.idPrefix || 'consequence' });
    const feedLimit = Math.max(2, Math.min(200, Number(options.feedLimit) || 100));
    let canonicalLines = [];
    let runEpoch = 1;
    let currentRunIdentity = '';
    let previousRenderedIds = new Set();
    function resetForRun(runIdentity) {
      const identity = String(runIdentity || '').trim();
      if (!identity) throw new TypeError('Consequence History reset requires a trustworthy run identity');
      if (identity === currentRunIdentity) return Object.freeze({ reset: false, runIdentity: identity, events: log.events() });
      currentRunIdentity = identity;
      runEpoch += 1;
      canonicalLines = [];
      previousRenderedIds = new Set();
      log.clear();
      return Object.freeze({ reset: true, runIdentity: identity, events: log.events() });
    }

    function syncCanonicalLines(lines, metadata = {}) {
      const suppliedRunIdentity = String(metadata.runIdentity || '').trim();
      if (suppliedRunIdentity) resetForRun(suppliedRunIdentity);
      const incoming = Array.from(lines || [], (line) => String(line ?? '')).filter((line) => line.trim());
      if (!incoming.length) return log.events();
      let common = 0;
      while (common < incoming.length && common < canonicalLines.length && incoming[common] === canonicalLines[common]) common += 1;
      let appendFrom = common;
      if (common < Math.min(incoming.length, canonicalLines.length)) {
        let overlap = Math.min(canonicalLines.length, incoming.length);
        while (overlap > 0) {
          const tail = canonicalLines.slice(-overlap);
          if (tail.every((line, index) => line === incoming[index])) break;
          overlap -= 1;
        }
        appendFrom = overlap;
      } else if (incoming.length <= canonicalLines.length) {
        return log.events();
      }
      const sequenceBase = log.size();
      for (let index = appendFrom; index < incoming.length; index += 1) {
        const sequence = sequenceBase + index - appendFrom + 1;
        const base = {
          id: `canonical-${runEpoch}-${sequence}`,
          canonicalText: incoming[index],
          sequence,
          source: metadata.source || 'core-message',
          classificationConfidence: 'unclassified',
        };
        const classified = presentConsequence(base);
        log.append(classified);
      }
      canonicalLines = incoming;
      return log.events();
    }

    function ingestEvent(input) {
      const nextSequence = Number(input?.sequence);
      const event = presentConsequence(input, {
        id: input?.id,
        sequence: Number.isSafeInteger(nextSequence) ? nextSequence : log.size() + 1,
        source: input?.source || 'typed-result',
      });
      return log.append(event);
    }

    function setOpeningChronicle(lines) {
      return log.setOpeningChronicle(lines);
    }

    function recent() {
      return Object.freeze(log.search('', { includeOpeningChronicle: false, groupOpeningChronicle: true }).events.slice(-feedLimit));
    }

    function render(mount, documentRoot = mount?.ownerDocument) {
      if (!mount || !documentRoot?.createElement) return recent();
      mount.replaceChildren();
      mount.dataset.uxConsequenceOwned = 'true';
      const events = recent();
      if (!events.length) {
        const waiting = documentRoot.createElement('span');
        waiting.className = 'ux-consequence-empty';
        waiting.textContent = 'Your next consequence will appear here.';
        mount.append(waiting);
        previousRenderedIds = new Set();
        return events;
      }
      for (const event of events.slice().reverse()) {
        const row = documentRoot.createElement('div');
        row.className = 'ux-consequence-row';
        row.dataset.category = event.category || 'unclassified';
        row.dataset.severity = event.severity || 'info';
        row.dataset.confidence = event.classificationConfidence;
        row.dataset.messageId = event.id;
        const mark = documentRoot.createElement('span');
        mark.className = 'ux-consequence-mark';
        mark.textContent = event.severity === 'danger' ? '!' : (event.severity === 'warning' ? '△' : (event.severity === 'success' ? '✓' : '·'));
        mark.setAttribute('aria-hidden', 'true');
        const text = documentRoot.createElement('span');
        text.className = 'ux-consequence-text';
        text.textContent = event.canonicalText;
        row.append(mark, text);
        mount.append(row);
      }
      const feedback = (typeof globalThis !== 'undefined' ? globalThis.NetHackUxFeedback : null) || null;
      previousRenderedIds = feedback?.animateConsequenceMount?.(mount, previousRenderedIds) || new Set(events.map((event) => event.id));
      return events;
    }

    return Object.freeze({
      version,
      log,
      feedLimit,
      syncCanonicalLines,
      resetForRun,
      ingestEvent,
      setOpeningChronicle,
      recent,
      render,
      canonicalLines: () => Object.freeze(canonicalLines.slice()),
      runIdentity: () => currentRunIdentity,
    });
  }

  return Object.freeze({ version, CATEGORY_RULES, classifyCanonicalText, presentConsequence, createConsequenceFeed });
}));
