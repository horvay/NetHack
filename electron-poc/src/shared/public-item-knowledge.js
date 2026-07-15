(function initPublicItemKnowledge(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackPublicItemKnowledge = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-public-item-knowledge/v1';

  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function cleanString(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }
  function selectorLetter(item = {}) {
    if (typeof item.inventoryLetter === 'string' && item.inventoryLetter.length === 1) return item.inventoryLetter;
    if (typeof item.selector === 'string' && item.selector.length === 1) return item.selector;
    const code = Number(item.selector);
    return Number.isInteger(code) && code > 0 && code < 128 ? String.fromCharCode(code) : '';
  }
  function stripSelector(value, item = {}) {
    const letter = selectorLetter(item).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return cleanString(value).replace(letter ? new RegExp(`^${letter}\\s*-\\s*`, 'i') : /^\s*[A-Za-z$]\s*-\s*/, '').trim();
  }
  function hasContradictoryIdentity(item = {}) {
    return (item.semanticKnown === true && item.known?.identity === false)
      || (item.semanticKnown === false && item.known?.identity === true);
  }
  function hasContradictoryAppearance(item = {}) {
    return item.known?.appearance === false
      && Boolean(cleanString(item.appearanceName) || cleanString(item.semanticAppearance));
  }
  function identityIsPublic(item = {}) {
    if (item.semanticKnown === false || item.known?.identity === false) return false;
    return item.semanticKnown === true || item.known?.identity === true;
  }
  function explicitAppearance(item = {}) {
    if (item.known?.appearance === false) return '';
    return cleanString(item.appearanceName) || cleanString(item.semanticAppearance);
  }
  function genericLabel(item = {}) {
    return stripSelector(item.displayName || item.display || item.text || item.itemName || item.targetText || item.name, item);
  }
  const bareAppearanceClassPattern = /^(?:(?:a|an|the|some)\s+)?(?:amulets?|armor|armour|books?|corpses?|food|gems?|items?|objects?|potions?|rings?|scrolls?|spellbooks?|stones?|tools?|wands?|weapons?)$/i;
  function appearancePreferredLabel(generic, appearance) {
    if (!appearance) return generic;
    if (!generic || bareAppearanceClassPattern.test(generic)) return appearance;
    return generic;
  }
  function publicLabel(item = {}, options = {}) {
    const neutral = cleanString(options.neutral) || 'item';
    const appearance = explicitAppearance(item);
    if (identityIsPublic(item)) return genericLabel(item) || cleanString(item.semanticName) || appearance || neutral;
    if (item.known?.appearance === true) return appearancePreferredLabel(genericLabel(item), appearance) || neutral;
    return appearance || neutral;
  }
  function comparisonToken(value) {
    return cleanString(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  }
  function normalizedNamingText(value) { return cleanString(value).normalize('NFKC').toLocaleLowerCase(); }
  function splitTrailingEquipmentState(value) {
    const label = cleanString(value);
    const state = '(?:weapon in (?:left |right )?hands?|alternate weapon; not wielded|being worn|wielded|in quiver|on (?:left|right) hand|lit|unlit|unpaid(?:,?[^()]*)?|for sale(?:,?[^()]*)?)';
    const match = label.match(new RegExp(`^(.*?)(\\s+(?:\\(${state}\\)\\s*)+)$`, 'iu'));
    return match ? { body: cleanString(match[1]), trailingState: cleanString(match[2]) } : { body: label, trailingState: '' };
  }
  function parseExactNamingMarkers(label, values) {
    let body = normalizedNamingText(label);
    const markers = [];
    let matched = true;
    while (matched) {
      matched = false;
      for (const entry of values) {
        const suffix = ` ${entry.marker} ${normalizedNamingText(entry.value)}`;
        if (!body.endsWith(suffix)) continue;
        markers.unshift(entry.key);
        body = cleanString(body.slice(0, -suffix.length));
        matched = true;
        break;
      }
    }
    return { base: body, markers };
  }
  function exactNamingSuffix(item = {}, label = genericLabel(item)) {
    const values = [
      { key: 'calledName', marker: 'called', value: cleanString(item.calledName) },
      { key: 'individualName', marker: 'named', value: cleanString(item.individualName) },
    ].filter((entry) => entry.value && item.known?.naming === true);
    const state = '(?:weapon in (?:left |right )?hands?|alternate weapon; not wielded|being worn|wielded|in quiver|on (?:left|right) hand|lit|unlit|unpaid(?:,?[^()]*)?|for sale(?:,?[^()]*)?)';
    const oneState = new RegExp(`^(.*?)(\\s+\\(${state}\\))$`, 'iu');
    let body = cleanString(label);
    let trailingState = '';
    while (true) {
      const parsed = parseExactNamingMarkers(body, values);
      if (parsed.markers.length) return Object.freeze({ base: parsed.base, namingBody: body, trailingState, markers: Object.freeze(parsed.markers) });
      const split = body.match(oneState);
      if (!split) return Object.freeze({ base: parsed.base, namingBody: body, trailingState, markers: Object.freeze([]) });
      body = cleanString(split[1]);
      trailingState = cleanString(`${split[2]}${trailingState ? ` ${trailingState}` : ''}`);
    }
  }
  function hasExactNamingSuffix(item = {}, key, label = genericLabel(item)) {
    return exactNamingSuffix(item, label).markers.includes(key);
  }
  function genericLabelWithoutExactNamingSuffix(item = {}, key, value) {
    const generic = genericLabel(item);
    if (!generic || !value) return generic;
    const candidate = { ...item, [key]: value };
    const suffix = exactNamingSuffix(candidate, generic);
    if (!suffix.markers.includes(key)) return generic;
    return cleanString(`${suffix.base}${suffix.trailingState ? ` ${suffix.trailingState}` : ''}`);
  }
  function appendNamingBeforeEquipmentState(label, marker, value, item = {}) {
    const exact = exactNamingSuffix(item, label);
    const split = exact.markers.length ? { body: exact.namingBody, trailingState: exact.trailingState } : splitTrailingEquipmentState(label);
    return cleanString(`${split.body || 'item'} ${marker} ${value}${split.trailingState ? ` ${split.trailingState}` : ''}`);
  }
  function publicNamingValue(item = {}, key) {
    if (!['calledName', 'individualName'].includes(key)) return '';
    const value = cleanString(item[key]);
    if (!value || item.known?.naming !== true) return '';
    if (hasContradictoryIdentity(item) || hasContradictoryAppearance(item)) return '';

    // `known.naming` authorizes only the exact player-assigned value. It does
    // not authorize generic display/name/text as identity. Compare against the
    // non-naming portion so an authoritative exact display suffix interoperates
    // with its independently emitted name while hidden identity repetition,
    // wrapping, punctuation, and zero-width obfuscation still fail closed.
    const genericIsPublic = identityIsPublic(item) || item.known?.appearance === true;
    if (!genericIsPublic) {
      let generic = comparisonToken(genericLabelWithoutExactNamingSuffix(item, key, value));
      const appearance = comparisonToken(explicitAppearance(item));
      const candidate = comparisonToken(value);
      if (appearance && generic.includes(appearance)) generic = generic.replace(appearance, '');
      if (generic && (generic.includes(candidate) || candidate.includes(generic))) return '';
    }
    return value;
  }
  function publicDisplayLabel(item = {}, options = {}) {
    let label = publicLabel(item, options);
    for (const [key, marker] of [['individualName', 'named'], ['calledName', 'called']]) {
      const value = publicNamingValue(item, key);
      if (value && !hasExactNamingSuffix(item, key, label)) label = appendNamingBeforeEquipmentState(label, marker, value, item);
    }
    return cleanString(label) || cleanString(options.neutral) || 'item';
  }
  function publicKnownFlags(item = {}) {
    const known = { identity: identityIsPublic(item) };
    if (item.known?.appearance === false) known.appearance = false;
    else if (item.known?.appearance === true || explicitAppearance(item)) known.appearance = true;
    if (item.known?.quantity === false) known.quantity = false;
    else if (item.known?.quantity === true || item.quantity != null) known.quantity = true;
    if (publicNamingValue(item, 'calledName') || publicNamingValue(item, 'individualName')) known.naming = true;
    return Object.freeze(known);
  }
  function isPublicItemLike(item = {}) {
    if (!isPlainObject(item)) return false;
    if (item.publicId != null && item.semanticKind == null && item.semanticKnown == null && item.known == null && item.inventoryLetter == null && item.selector == null) return false;
    // Event-envelope handling belongs to the caller's structural recursion
    // context. Prefix spelling never makes a nested item alias public.
    return ['objectId', 'inventoryLetter', 'selector', 'displayName', 'display', 'text', 'itemName', 'targetText', 'name', 'appearanceName', 'semanticAppearance', 'semanticName', 'semanticKnown', 'calledName', 'individualName', 'glyph', 'glyphChar', 'objectClass', 'publicClass']
      .some((key) => item[key] != null);
  }
  function isObjectMenuItem(item = {}) {
    if (!isPlainObject(item)) return false;
    if (item.semanticKind != null && item.semanticKind !== 'object') return false;
    // A selector plus prose is not object evidence: classic action, help,
    // command, and manual menus use the same row shape. Legacy object rows are
    // promoted only by their completed menu's authoritative purpose adapter.
    return item.semanticKind === 'object' || item.objectId != null || item.appearanceName != null || item.semanticAppearance != null || item.semanticName != null || item.semanticKnown != null || item.known != null || item.publicClass != null || (typeof item.objectClass === 'string' && item.objectClass.length > 0);
  }

  return Object.freeze({
    version,
    cleanString,
    selectorLetter,
    stripSelector,
    hasContradictoryIdentity,
    hasContradictoryAppearance,
    identityIsPublic,
    explicitAppearance,
    genericLabel,
    publicLabel,
    publicDisplayLabel,
    publicNamingValue,
    exactNamingSuffix,
    hasExactNamingSuffix,
    publicKnownFlags,
    isPublicItemLike,
    isObjectMenuItem,
  });
}));
