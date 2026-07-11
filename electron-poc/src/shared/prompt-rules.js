(function initPromptRules(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackPromptRules = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  function selectorSet(query, choices) {
    const set = new Set(String(choices || '').split('').filter((ch) => /[A-Za-z$?*\-\u001b]/.test(ch)));
    const q = String(query || '');
    for (const match of q.matchAll(/[\[(]([^\])]+)[\])]/g)) {
      const source = match[1].replace(/\bor\b/ig, ' ');
      for (const range of source.match(/[A-Za-z$]-[A-Za-z$]/g) || []) {
        const [start, end] = range.split('-').map((letter) => letter.charCodeAt(0));
        for (let code = Math.min(start, end); code <= Math.max(start, end); code += 1) set.add(String.fromCharCode(code));
      }
      for (const run of source.match(/[A-Za-z$?*\-]{2,}|[A-Za-z$?*\-]/g) || []) {
        if (/^or$/i.test(run)) continue;
        for (const ch of run.split('')) set.add(ch);
      }
    }
    return set;
  }
  function isDirectionPrompt(query) {
    return /direction|where|what direction/i.test(String(query || ''));
  }
  function isLockedDoorMessage(text) {
    return /\b(?:door|gateway)\b.*\blocked\b/i.test(String(text || ''))
      || /\blocked\b.*\bdoor\b/i.test(String(text || ''));
  }
  function isFixedChoicePromptChoices(choices) {
    const raw = String(choices || '');
    if (!raw) return false;
    const withoutEsc = raw.replace(/\u001b/g, '');
    return /^[ynaqYNQA]+$/.test(withoutEsc) && /[ynYN]/.test(withoutEsc);
  }
  function isExplicitInventorySelectorQuestion(query) {
    return /what do you want to|what would you like to|which item|write with|engrave with|which object|what item/i.test(String(query || ''));
  }
  function isFixedChoicePrompt(query, choices) {
    return isFixedChoicePromptChoices(choices) && !isExplicitInventorySelectorQuestion(query);
  }
  function isInventoryActionPrompt(query, choices) {
    if (isFixedChoicePrompt(query, choices)) return false;
    const q = String(query || '').toLowerCase();
    return /what do you want to|what would you like to|which item|write with|engrave with|inventory|possessions/.test(q) || selectorSet(q, choices).size > 0;
  }
  function isItemClassPrompt(query, choices) {
    return /what type of object|what kinds of thing|pick.*class|object class/i.test(String(query || '')) || String(choices || '').includes('$');
  }
  return Object.freeze({ version: 'nethack-prompt-rules/v1', selectorSet, isDirectionPrompt, isLockedDoorMessage, isFixedChoicePromptChoices, isFixedChoicePrompt, isInventoryActionPrompt, isItemClassPrompt });
}));
