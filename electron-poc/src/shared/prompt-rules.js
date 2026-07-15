(function initPromptRules(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackPromptRules = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-prompt-syntax/v2';

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function selectorSet(query, choices) {
    const selectors = new Set(String(choices || '').split('').filter((key) => /[A-Za-z$?*\-\u001b]/.test(key)));
    const sourceText = String(query || '');
    for (const match of sourceText.matchAll(/[\[(]([^\])]+)[\])]/g)) {
      const source = match[1].replace(/\bor\b/ig, ' ');
      for (const range of source.match(/[A-Za-z$]-[A-Za-z$]/g) || []) {
        const [start, end] = range.split('-').map((letter) => letter.charCodeAt(0));
        for (let code = Math.min(start, end); code <= Math.max(start, end); code += 1) selectors.add(String.fromCharCode(code));
      }
      for (const run of source.match(/[A-Za-z$?*\-]{2,}|[A-Za-z$?*\-]/g) || []) {
        if (/^or$/i.test(run)) continue;
        for (const key of run) selectors.add(key);
      }
    }
    return selectors;
  }

  function selectorCharacter(value) {
    const code = Number(value);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }

  return Object.freeze({ version, text, selectorSet, selectorCharacter });
}));
