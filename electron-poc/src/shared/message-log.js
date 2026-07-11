(function initMessageLog(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackMessageLog = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  function isGenericDirectionPromptMessage(text) {
    return /^\s*(?:(?:choose|pick|select)\s+a\s+direction(?:\s+or\s+map\s+target)?|(?:in\s+)?what\s+direction\??)\.?\s*$/i.test(String(text || ''));
  }

  function createMessageLog({ limit = 240 } = {}) {
    let entries = [];
    return Object.freeze({
      append(text, { allowConsecutiveDuplicate = false, logPrompt = true } = {}) {
        const normalized = String(text || '').trim();
        if (!normalized) return { appended: false, entries: entries.slice() };
        if (isGenericDirectionPromptMessage(normalized)) return { appended: false, entries: entries.slice() };
        const previous = entries[entries.length - 1];
        if (!allowConsecutiveDuplicate && previous === normalized) return { appended: false, duplicate: true, entries: entries.slice() };
        entries = entries.concat(normalized).slice(-limit);
        return { appended: true, entries: entries.slice() };
      },
      clear() { entries = []; },
      entries() { return entries.slice(); },
      recent(count = 80) { return entries.slice(-count); },
      size() { return entries.length; },
    });
  }

  return Object.freeze({
    version: 'nethack-message-log/v1',
    isGenericDirectionPromptMessage,
    createMessageLog,
  });
}));
