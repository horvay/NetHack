(function initInventoryActionService(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./public-blockers'));
  else root.NetHackInventoryActionService = factory(root.NetHackPublicBlockers);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(PublicBlockers = {}) {
  const publicEquipmentBlockerLabels = PublicBlockers.publicEquipmentBlockerLabels || Object.freeze({});
  const publicEquipmentBlockerLabel = PublicBlockers.publicEquipmentBlockerLabel || ((token) => publicEquipmentBlockerLabels[String(token || '')] || 'NetHack must decide this from public equipment state.');
  function itemText(item) { return String(item?.text || item?.displayName || item?.name || ''); }
  function itemKey(item) {
    if (typeof item?.selector === 'number' && item.selector > 0) return String.fromCharCode(item.selector);
    return String(item?.inventoryLetter || item?.key || item?.selector || '');
  }
  function publicActionTokens(item) {
    const raw = Array.isArray(item?.actionAffordances) ? item.actionAffordances : (Array.isArray(item?.publicActionHints) ? item.publicActionHints : []);
    return new Set(raw.map((token) => String(token || '').trim()).filter(Boolean));
  }
  function hasPublicActionToken(item, ...tokens) {
    const available = publicActionTokens(item);
    return tokens.some((token) => available.has(token));
  }
  function cleanName(text) {
    return String(text || '')
      .replace(/^\s*[a-z$]\s*[-+]\s+/i, '')
      .replace(/\s*\((?:weapon in (?:hand|hands|left hand|right hand)|being worn|wielded|in quiver|on (?:left|right) hand|alternate weapon; not wielded)\)\s*/ig, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function isEquipped(text) { return /\b(?:being worn|on left hand|on right hand|weapon in (?:hand|left hand|right hand)|wielded|in quiver)\b/i.test(text); }
  function hasAmmoTag(text) { return /\b(?:arrow|arrows|crossbow bolt|crossbow bolts|dart|darts|ya|shuriken|rock|rocks|stone|stones|sling bullet|sling bullets|ammo|missile|missiles)\b/i.test(text); }
  function hasWeaponTag(text) { return /\b(?:sword|dagger|daggers|axe|mace|staff|quarterstaff|spear|club|bow|yumi|crossbow|sling|weapon|pick-axe|pickaxe|lance|polearm|halberd|bullwhip|grappling hook)\b/i.test(text); }
  function hasArmorTag(text) { return /\b(?:mail|armor|armour|leather|robe|shirt|cloak|helm|helmet|hat|gloves|gauntlets|boots|shoes|shield|dragon scales|mummy wrapping|fedora|dunce cap|apron|smock)\b/i.test(text); }
  function hasRingTag(text) {
    const value = String(text || '');
    if (!/\bring\b/i.test(value)) return false;
    if (/\b(?:key ring|ring mail|meat ring)\b/i.test(value)) return false;
    if (/\bring of\b/i.test(value)) return true;
    // NetHack unidentified rings are shown as jewelry appearances such as
    // "wooden ring" or "opal ring".  Keep this intentionally accessory-shaped
    // so armor/tools/food whose English name happens to contain "ring" do not
    // get GUI put-on routes.
    return /\b(?:agate|amber|black onyx|brass|bronze|clay|copper|coral|diamond|emerald|engagement|gold|granite|iron|ivory|jade|mithril|moonstone|obsidian|opal|pearl|plain|porcelain|ruby|sapphire|shiny|silver|steel|tiger eye|topaz|twisted|wire|wooden) ring\b/i.test(value);
  }
  function hasAmuletTag(text) { return /\bamulet\b/i.test(text); }
  function hasEyewearTag(text) { return /\b(?:blindfold|lenses|towel)\b/i.test(text); }
  function hasRingAccessoryTag(text) { return hasRingTag(text) || hasAmuletTag(text) || hasEyewearTag(text); }
  function hasFoodTag(text) { return /\b(?:food ration|ration|corpse|egg|eggs|tin|tripe|apple|orange|melon|banana|carrot|cream pie|candy bar|fortune cookie|pancake|lembas|eucalyptus leaf|lizard|glob|kelp|slime mold|pear|melon|meatball|meat ring)\b/i.test(text); }
  function hasPotionTag(text) { return /\b(?:potion|potions)\b/i.test(text); }
  function hasScrollTag(text) { return /\b(?:scroll|scrolls|mail)\b/i.test(text); }
  function hasSpellbookTag(text) { return /\b(?:spellbook|spellbooks|book|novel|paperback)\b/i.test(text); }
  function hasWandTag(text) { return /\b(?:wand|wands)\b/i.test(text); }
  function hasContainerTag(text) { return /\b(?:bag|sack|chest|box|large box|ice box|container|bag of holding|oilskin sack)\b/i.test(text); }
  function hasGemStoneTag(text) { return /\b(?:gem|gems|stone|stones|rock|rocks|loadstone|luckstone|touchstone|flint|glass|diamond|ruby|emerald|amethyst|opal|jade|worthless piece)\b/i.test(text); }
  function hasCoinTag(text) { return /\b(?:gold piece|gold pieces|zorkmid|zorkmids|coin|coins|money|gold)\b/i.test(text) || /^\s*\$/.test(String(text || '')); }
  function hasBoulderStatueTag(text) { return /\b(?:boulder|statue)\b/i.test(text); }
  function hasBallChainTag(text) { return /\b(?:heavy iron ball|iron ball|chain|iron chain)\b/i.test(text); }
  function hasVenomTag(text) { return /\b(?:splash of venom|venom)\b/i.test(text); }
  function hasToolTag(text) { return /\b(?:bag|sack|chest|box|key|lock pick|credit card|lamp|lantern|candle|candelabrum|marker|magic marker|whistle|horn|flute|harp|drum|pick-axe|pickaxe|axe|tin opener|can opener|tinning kit|blindfold|towel|lenses|mirror|camera|stethoscope|unicorn horn|tool|leash|saddle|figurine|crystal ball|can of grease|trap|beartrap|land mine|bell)\b/i.test(text); }
  function hasApplyToolTag(text) { return hasToolTag(text) || hasWandTag(text) || hasCoinTag(text) || /\bcream pie\b/i.test(text); }
  function hasReadableClothingTag(text) { return /\b(?:T-shirt|shirt|smock|apron|Hawaiian shirt)\b/i.test(text); }
  function hasGraystoneTag(text) { return /\b(?:gray stone|grey stone|luckstone|loadstone|touchstone|flint stone)\b/i.test(text); }
  function hasRubCandidateTag(text) { return /\b(?:lamp|lantern|gray stone|grey stone|luckstone|loadstone|touchstone|flint stone)\b/i.test(text); }
  function hasLightSourceTag(text) { return /\b(?:lamp|lantern|candle|candelabrum|potion of oil|oil)\b/i.test(text); }
  function hasInvokeTag(text) { return /\b(?:amulet of yendor|fake amulet|crystal ball|bell of opening|candelabrum of invocation|book of the dead|artifact|orb|eye of the aethiopica|mitre|staff of aesculapius|longbow of diana|tsurugi|excalibur|mjollnir|stormbringer|cleaver|giantkiller|sunsword|demonbane|werebane|dragonbane|fire brand|frost brand|magicbane|grayswandir|vorpal blade)\b/i.test(text); }
  function isStack(text) { return /^\s*[a-z$]?\s*[-+]?\s*(?:\d+|[a-z]+\s+)?(?:arrows|bolts|darts|rocks|stones|gems|potions|scrolls|food rations|gold pieces)\b/i.test(text); }
  function isLikelyFloorContainerLocked(text) { return /\b(?:locked|trapped)\b/i.test(text); }

  function uniqueTokens(tokens = []) {
    return Array.from(new Set((tokens || []).map((token) => String(token || '').trim()).filter(Boolean)));
  }

  function blockerFields(tokens = []) {
    const blockerTokens = uniqueTokens(tokens);
    const blockerLabels = blockerTokens.map(publicEquipmentBlockerLabel);
    return { blockerTokens, blockerLabels, blockerToken: blockerTokens[0] || '', blockerLabel: blockerLabels[0] || '' };
  }

  function action(id, label, section, command, opts = {}) {
    const blockers = blockerFields(opts.blockerTokens || [opts.disabledReasonToken || opts.reasonToken].filter(Boolean));
    return Object.freeze({
      id, label, section, enabled: opts.enabled !== false, disabledReason: opts.disabledReason || '', disabledReasonToken: opts.disabledReasonToken || blockers.blockerToken || '', disabledReasonLabel: opts.disabledReasonLabel || blockers.blockerLabel || opts.disabledReason || '', dangerLevel: opts.dangerLevel || 'safe',
      blockerTokens: blockers.blockerTokens, blockerLabels: blockers.blockerLabels,
      params: opts.params || {}, promptPlan: opts.promptPlan || [], execution: { route: opts.route || 'compatKeySequence', action: id, keys: command || '' }, consumesTurn: opts.consumesTurn || 'maybe', source: opts.source || 'nethack-itemactions',
    });
  }

  function uniqueActions(actions) {
    return actions.filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id && candidate.label === entry.label) === index);
  }

  function inventoryActionLabelForApply(text) {
    if (hasCoinTag(text)) return 'Flip coin';
    if (/\bcream pie\b/i.test(text)) return 'Hit yourself with cream pie';
    if (/\bbullwhip\b/i.test(text)) return 'Lash with whip';
    if (/\bgrappling hook\b/i.test(text)) return 'Grapple with hook';
    if (hasContainerTag(text)) return 'Open / loot / apply';
    if (/\b(?:key|lock pick|credit card)\b/i.test(text)) return 'Use to pick a lock';
    if (/\btinning kit\b/i.test(text)) return 'Tin a corpse';
    if (/\b(?:whistle|eucalyptus leaf)\b/i.test(text)) return 'Blow whistle';
    if (/\bstethoscope\b/i.test(text)) return 'Listen with stethoscope';
    if (/\bmirror\b/i.test(text)) return 'Show reflection';
    if (/\b(?:bell|candelabrum|candle|lamp|lantern|oil)\b/i.test(text)) return 'Light / extinguish';
    if (/\bcamera\b/i.test(text)) return 'Take photograph';
    if (/\btowel\b/i.test(text)) return 'Clean yourself';
    if (/\bcrystal ball\b/i.test(text)) return 'Peer into crystal ball';
    if (/\bmagic marker\b/i.test(text)) return 'Write with marker';
    if (/\bfigurine\b/i.test(text)) return 'Activate figurine';
    if (/\bunicorn horn\b/i.test(text)) return 'Use unicorn horn';
    if (/\b(?:horn|flute|harp|drum)\b/i.test(text)) return 'Play instrument';
    if (/\b(?:beartrap|land mine)\b/i.test(text)) return 'Arm trap';
    if (/\b(?:pick-axe|pickaxe|mattock)\b/i.test(text)) return 'Dig with tool';
    if (hasWandTag(text)) return 'Break wand';
    return 'Apply / use';
  }

  function itemActionAffordances(item, context = {}) {
    const text = itemText(item);
    const key = itemKey(item);
    const equipped = isEquipped(text) || hasPublicActionToken(item, 'takeOff', 'remove', 'wielded');
    const actions = [];
    const canRoute = Boolean(key);
    const command = (prefix) => (canRoute ? `${prefix}${key}` : '');
    const hasHint = (...tokens) => hasPublicActionToken(item, ...tokens);
    if (equipped) {
      if (/\bin quiver\b/i.test(text)) actions.push(action('slot.clear.quiver', 'Clear/change quiver', 'primary', command('Q')));
      else if (/\bweapon in hands\b/i.test(text) || (/\b(?:weapon in (?:hand|left hand|right hand)|wielded)\b/i.test(text) && !/\b(?:alternate weapon|not wielded)\b/i.test(text))) actions.push(action('slot.clear.mainHand', 'Change main hand', 'primary', command('w')));
      else if (/\bon (?:left|right) hand\b/i.test(text)) actions.push(action('item.remove.accessory', hasRingTag(text) ? 'Remove ring' : 'Remove accessory', 'primary', command('R')));
      else if (hasHint('remove')) actions.push(action('item.remove.accessory', hasRingTag(text) ? 'Remove ring' : 'Remove accessory', 'primary', command('R')));
      else actions.push(action('item.takeOff', 'Take off', 'primary', command('T')));
    }
    if (hasHint('apply', 'loot') || hasApplyToolTag(text)) actions.push(action((hasHint('loot') || hasContainerTag(text)) ? 'item.lootOrApply' : 'item.apply', inventoryActionLabelForApply(text), 'primary', command('a')));
    if ((hasHint('wear') || hasArmorTag(text)) && !equipped) actions.push(action('item.wear', 'Wear in matching slot', 'primary', command('W')));
    if ((hasHint('putOn', 'putOn.ring', 'putOn.amulet', 'putOn.eyes') || hasRingAccessoryTag(text)) && !equipped) {
      const ringLike = hasHint('putOn.ring') || hasRingTag(text);
      if (ringLike && Array.isArray(context.items)) {
        const route = routeRingPutOn(item, context);
        actions.push(action('item.putOn.ring', route.ok ? route.label : 'Put on ring', 'primary', route.ok ? route.command : '', { promptPlan: [], enabled: route.ok, disabledReason: route.reason || '', disabledReasonToken: route.reasonToken || route.blockerToken || '', disabledReasonLabel: route.reasonLabel || route.blockerLabel || route.reason || '', blockerTokens: route.blockerTokens || [], params: route.ok ? { ringHand: route.ringHand, autoAnswerHand: route.autoAnswerHand } : {} }));
      } else {
        const actionId = ringLike ? 'item.putOn.ring' : 'item.putOn.accessory';
        const label = ringLike ? 'Put on ring…' : (hasHint('putOn.eyes') || hasEyewearTag(text)) ? 'Put on eyewear' : 'Put on amulet';
        actions.push(action(actionId, label, 'primary', command('P'), { promptPlan: ringLike ? ['hand'] : [] }));
      }
    }
    if (hasHint('eat') || hasFoodTag(text)) actions.push(action('item.eat', /\btin\b/i.test(text) ? 'Open tin / eat' : 'Eat', 'primary', command('e'), { dangerLevel: /corpse|egg|glob/i.test(text) ? 'caution' : 'safe' }));
    if (hasHint('quaff') || hasPotionTag(text)) actions.push(action('item.quaff', 'Quaff', 'primary', command('q'), { dangerLevel: 'caution' }));
    if ((hasHint('read') && !hasHint('study') && !hasSpellbookTag(text)) || hasScrollTag(text)) actions.push(action('item.read.scroll', 'Read', 'primary', command('r'), { dangerLevel: 'caution' }));
    if (hasHint('study') || hasSpellbookTag(text)) actions.push(action('item.study', /book of the dead/i.test(text) ? 'Examine tome' : 'Study / read book', 'primary', command('r'), { dangerLevel: 'caution' }));
    if (hasReadableClothingTag(text) && !hasScrollTag(text) && !hasSpellbookTag(text)) actions.push(action('item.read.inscription', 'Read inscription / pattern', 'primary', command('r')));
    if (hasHint('zap') || hasWandTag(text)) actions.push(action('item.zap', 'Zap at target…', 'primary', command('z'), { promptPlan: ['target'] }));
    if (!equipped && !hasVenomTag(text) && (hasHint('wield', 'hold') || !publicActionTokens(item).size)) {
      const wieldActionId = (hasHint('wield') || hasWeaponTag(text) || hasAmmoTag(text)) ? 'item.wield.mainHand' : 'item.wield.hold';
      const wieldLabel = hasHint('wield') || hasWeaponTag(text) || hasAmmoTag(text) || hasBallChainTag(text) ? 'Wield in main hand' : 'Wield / hold in hands';
      const blocker = handBlockerForTwoHandedItem(item, context);
      actions.push(action(wieldActionId, wieldLabel, 'primary', blocker ? '' : command('w'), blocker ? { enabled: false, disabledReason: blocker.blockerLabel, disabledReasonLabel: blocker.blockerLabel, disabledReasonToken: blocker.blockerToken, blockerTokens: blocker.blockerTokens } : {}));
    }
    if ((hasHint('quiver') || hasAmmoTag(text) || hasWeaponTag(text) || hasGemStoneTag(text)) && !equipped) actions.push(action('item.quiver', 'Ready in quiver', 'combat', command('Q')));
    if (!equipped && !hasVenomTag(text) && (hasHint('throw') || !publicActionTokens(item).size)) actions.push(action('item.throw', /\b(?:arrow|crossbow bolt)\b/i.test(text) ? 'Shoot / throw…' : 'Throw…', 'combat', command('t'), { promptPlan: [isStack(text) ? 'quantity' : '', 'target'].filter(Boolean) }));
    if ((equipped && /\bin quiver\b/i.test(text)) || hasHint('fire')) actions.push(action('item.fire', 'Fire / shoot readied item…', 'combat', 'f', { promptPlan: ['target'] }));
    if (hasHint('engrave') || hasWandTag(text) || hasToolTag(text) || hasWeaponTag(text) || hasGemStoneTag(text) || hasRingTag(text)) actions.push(action('item.engraveWith', /\btowel\b/i.test(text) ? 'Wipe engraving with towel' : /\bmagic marker\b/i.test(text) ? 'Scribble with marker' : 'Engrave / write with…', 'location', command('E'), { promptPlan: ['text'] }));
    if (hasRubCandidateTag(text)) actions.push(action('item.rub', 'Rub', 'location', command('#rub\n'), { promptPlan: ['netHack-owned-rub-followup'], route: 'semanticExtendedCommand', dangerLevel: /\b(?:luckstone|loadstone|touchstone|gray stone|grey stone)\b/i.test(text) ? 'caution' : 'safe' }));
    /* #tip and potion dipping are extended/prompt-led flows; do not expose
     * selector-prefixed T/a shortcuts here because those collide with take-off
     * and apply semantics in ordinary NetHack prompts. */
    if ((context.onAltar || context.isOnAltar) && (/\bcorpse\b/i.test(text) || /amulet of yendor|fake amulet/i.test(text))) actions.push(action('item.offer', /\bcorpse\b/i.test(text) ? 'Offer corpse' : 'Offer amulet', 'location', command('O'), { dangerLevel: 'caution' }));
    if (hasHint('pay') || /\b(?:unpaid|for sale|zm)\b/i.test(text)) actions.push(action('item.pay', 'Pay / buy item', 'management', command('p')));
    if (hasInvokeTag(text)) actions.push(action('item.invoke', 'Invoke unique power', 'magic', command('V'), { dangerLevel: 'caution' }));
    if (!equipped && !hasVenomTag(text) && (hasHint('drop') || !publicActionTokens(item).size)) actions.push(action('item.drop', 'Drop', 'management', command('d'), { promptPlan: ['quantity'] }));
    actions.push(action('item.name', 'Name this item…', 'management', canRoute ? `#name${key}` : '#name', { promptPlan: ['text'] }));
    actions.push(action('item.callType', 'Call this item type…', 'management', canRoute ? `#name${key}` : '#name', { promptPlan: ['text'] }));
    if (isStack(text) && !hasCoinTag(text)) actions.push(action('item.splitStack', 'Split stack / adjust', 'management', canRoute ? `#adjust${key}` : '#adjust'));
    if (!hasCoinTag(text)) actions.push(action('item.adjustLetter', 'Adjust inventory letter', 'management', canRoute ? `#adjust${key}` : '#adjust'));
    actions.push(action('item.inspect', 'Inspect details', 'management', '', { consumesTurn: 'no' }));
    actions.push(action('item.lookup', 'Look up encyclopedia entry', 'management', canRoute ? `/i${key}` : '/', { consumesTurn: 'no' }));
    return uniqueActions(actions);
  }

  function groundAction(id, label, section, keys, opts = {}) {
    return action(id, label, section, keys, { ...opts, source: 'ground-context', route: opts.route || 'directGroundCommand' });
  }

  function pickupKeys(item) {
    const key = itemKey(item);
    return key ? `${key}\n` : ',';
  }

  function groundItemActionAffordances(item, context = {}) {
    const text = itemText(item);
    const actions = [groundAction('ground.pickup', 'Pick up', 'primary', pickupKeys(item), { route: 'pickupGroundItem' })];
    if (hasFoodTag(text)) actions.push(groundAction('ground.eat', /\bcorpse\b/i.test(text) ? 'Eat corpse here' : 'Eat here', 'primary', 'e', { dangerLevel: /corpse|egg|glob/i.test(text) ? 'caution' : 'safe' }));
    if (hasPublicActionToken(item, 'container', 'loot') || hasContainerTag(text)) {
      actions.push(groundAction('ground.openContainer', 'Open / loot here', 'primary', '#loot\n', { promptPlan: ['netHack-owned-container-menu'] }));
      actions.push(groundAction('ground.openContainerSelf', 'Open by direction', 'primary', 'o.'));
      actions.push(groundAction('ground.tipContainer', 'Tip contents here', 'location', '#tip\n', { dangerLevel: 'caution', promptPlan: ['netHack-owned-tip-confirmation'] }));
      if (isLikelyFloorContainerLocked(text)) actions.push(groundAction('ground.forceContainer', 'Force lock here', 'location', '#force\n', { dangerLevel: 'caution', promptPlan: ['netHack-owned-force-confirmation'] }));
      if (/\btrapped\b/i.test(text)) actions.push(groundAction('ground.untrapContainer', 'Untrap container here', 'location', '#untrap\n', { dangerLevel: 'caution', promptPlan: ['netHack-owned-untrap-followup'] }));
    }
    if ((context.onAltar || context.isOnAltar) && (/\bcorpse\b/i.test(text) || /amulet of yendor|fake amulet/i.test(text))) actions.push(groundAction('ground.offer', /\bcorpse\b/i.test(text) ? 'Offer corpse here' : 'Offer amulet here', 'location', '#offer\n', { dangerLevel: 'caution' }));
    if (/\b(?:unpaid|for sale|zm)\b/i.test(text)) actions.push(groundAction('ground.pay', 'Pay shop bill for item', 'management', 'p'));
    if (hasBoulderStatueTag(text)) actions.push(groundAction('ground.kickHeavy', 'Kick / push heavy object', 'location', '\u0004', { dangerLevel: 'caution' }));
    const pickupThen = itemActionAffordances({ ...item, selector: '' }, context)
      .filter((entry) => !/^item\.(?:drop|inspect|adjustLetter|splitStack|rub)$/i.test(entry.id))
      .map((entry) => groundAction(`ground.pickupThen.${entry.id}`, `Pick up, then ${entry.label.replace(/…/g, '')}`, entry.section === 'primary' ? 'after-pickup' : entry.section, pickupKeys(item), { route: 'pickupThenInventoryAction', params: { afterActionId: entry.id, afterLabel: entry.label }, promptPlan: entry.promptPlan, dangerLevel: entry.dangerLevel }));
    actions.push(...pickupThen);
    actions.push(groundAction('ground.inspect', 'Inspect ground item', 'management', '', { consumesTurn: 'no' }));
    return uniqueActions(actions);
  }

  function armorSlotForItem(itemOrText) {
    if (itemOrText && typeof itemOrText === 'object') {
      if (hasPublicActionToken(itemOrText, 'wear.cloak')) return 'cloak';
      if (hasPublicActionToken(itemOrText, 'wear.shirt')) return 'shirt';
      if (hasPublicActionToken(itemOrText, 'wear.body')) return 'armor-suit';
      if (hasPublicActionToken(itemOrText, 'wear.helmet')) return 'helmet';
      if (hasPublicActionToken(itemOrText, 'wear.gloves')) return 'gloves';
      if (hasPublicActionToken(itemOrText, 'wear.boots')) return 'boots';
      if (hasPublicActionToken(itemOrText, 'wear.shield')) return 'shield';
    }
    const text = typeof itemOrText === 'string' ? itemOrText : itemText(itemOrText);
    if (/\b(?:cloak|mummy wrapping)\b/i.test(text)) return 'cloak';
    if (/\bshirt\b/i.test(text) && !/\b(?:cloak|gloves|gauntlets|boots|shoes|shield|helm|helmet|hat)\b/i.test(text)) return 'shirt';
    if (/\b(?:mail|armor|leather armor|robe|dragon scales|suit)\b/i.test(text) && !/\b(?:cloak|gloves|gauntlets|boots|shoes|shield|helm|helmet|hat)\b/i.test(text)) return 'armor-suit';
    if (/\b(?:helm|helmet|hat|fedora|dunce cap)\b/i.test(text)) return 'helmet';
    if (/\b(?:gloves|gauntlets)\b/i.test(text)) return 'gloves';
    if (/\b(?:boots|shoes)\b/i.test(text)) return 'boots';
    if (/\bshield\b/i.test(text)) return 'shield';
    return '';
  }

  const armorLayerRank = Object.freeze({ shirt: 0, 'armor-suit': 1, cloak: 2, helmet: 10, gloves: 10, boots: 10, shield: 10 });

  function armorBlockerTokenForLayer(targetSlot, blockerSlot) {
    if (targetSlot === 'shirt' && blockerSlot === 'armor-suit') return 'blocked.armor.bodyOverShirt';
    if (targetSlot === 'armor-suit' && blockerSlot === 'cloak') return 'blocked.armor.cloakOverBody';
    if (targetSlot === blockerSlot) return targetSlot === 'shield' ? 'blocked.hands.shieldEquipped' : 'blocked.armor.slotOccupied';
    if (blockerSlot === 'cloak') return 'blocked.armor.removeOuterFirst';
    return 'blocked.armor.removeOuterFirst';
  }

  function hasShieldEquipped(items = []) {
    return (items || []).some((item) => isEquipped(itemText(item)) && armorSlotForItem(item) === 'shield');
  }

  function hasQuiveredItem(items = []) {
    return (items || []).some((item) => /\bin quiver\b/i.test(itemText(item)));
  }

  function twoHandedWeaponPublicText(itemOrText) {
    const text = typeof itemOrText === 'string' ? itemOrText : itemText(itemOrText);
    return /\b(?:two-handed sword|quarterstaff|staff|bow|yumi|crossbow|battle-axe|dwarvish mattock|mattock|polearm|halberd|lance)\b/i.test(text);
  }

  function mainHandItem(items = []) {
    return (items || []).find((item) => { const text = itemText(item); return /\bweapon in hands\b/i.test(text) || (/\b(?:weapon in (?:hand|left hand|right hand)|wielded)\b/i.test(text) && !/\b(?:alternate weapon|not wielded)\b/i.test(text)); }) || null;
  }

  function handBlockerForTwoHandedItem(item, context = {}) {
    if (!twoHandedWeaponPublicText(item)) return null;
    if (hasShieldEquipped(context.items || [])) return blockerFields(['blocked.hands.shieldEquipped']);
    if (hasAlternateWeapon(context.items || [])) return blockerFields(['blocked.hands.twoWeaponing']);
    return null;
  }

  function offhandBlocker(context = {}) {
    const items = context.items || [];
    if (hasShieldEquipped(items)) return blockerFields(['blocked.hands.shieldEquipped']);
    if (twoHandedWeaponPublicText(mainHandItem(items))) return blockerFields(['blocked.hands.twoHandedWeapon']);
    if (hasAlternateWeapon(items)) return blockerFields(['blocked.hands.twoWeaponing']);
    return blockerFields(['blocked.hands.offhandOccupied']);
  }

  function wornArmorInSlot(items = [], slot = '') {
    if (!slot) return null;
    return (items || []).find((item) => isEquipped(itemText(item)) && armorSlotForItem(item) === slot) || null;
  }

  function wornArmorBlockingSlot(items = [], slot = '') {
    if (!slot) return [];
    const targetRank = armorLayerRank[slot];
    return (items || [])
      .map((item, index) => ({ item, index, slot: armorSlotForItem(item) }))
      .filter((entry) => isEquipped(itemText(entry.item)) && entry.slot)
      .filter((entry) => {
        if (entry.slot === slot) return true;
        if (!Number.isFinite(targetRank) || targetRank >= 10) return false;
        const rank = armorLayerRank[entry.slot];
        return Number.isFinite(rank) && rank > targetRank && rank < 10;
      })
      .sort((a, b) => {
        const rankDelta = (armorLayerRank[b.slot] ?? -1) - (armorLayerRank[a.slot] ?? -1);
        return rankDelta || a.index - b.index;
      })
      .map((entry) => entry.item);
  }

  function armorSwapRouteForItem(item, context = {}) {
    const text = itemText(item);
    const key = itemKey(item);
    if (!key || isEquipped(text) || !hasArmorTag(text)) return null;
    const slot = armorSlotForItem(text);
    const blockerEntries = wornArmorBlockingSlot(context.items || [], slot)
      .map((worn) => ({ worn, wornSlot: armorSlotForItem(worn) }))
      .filter((entry) => itemKey(entry.worn) && itemKey(entry.worn) !== key);
    if (!slot || !blockerEntries.length) return null;
    const blockers = blockerEntries.map((entry) => entry.worn);
    const takeOffSelectors = blockers.map(itemKey);
    const names = blockers.map((worn) => cleanName(itemText(worn))).filter(Boolean);
    const blockerInfo = blockerFields(blockerEntries.map((entry) => armorBlockerTokenForLayer(slot, entry.wornSlot)));
    return {
      ok: true,
      actionId: 'item.swapArmor',
      label: 'Change armor',
      command: `${takeOffSelectors.map((selector) => `T${selector}`).join('')}W${key}`,
      takeOffSelector: takeOffSelectors[takeOffSelectors.length - 1] || '',
      takeOffSelectors,
      wearSelector: key,
      slot,
      blockerTokens: blockerInfo.blockerTokens,
      blockerLabels: blockerInfo.blockerLabels,
      reasonToken: blockerInfo.blockerToken,
      reasonLabel: blockerInfo.blockerLabel,
      message: `Take off ${names.join(', ')}, then wear ${cleanName(text)}.`,
    };
  }

  function hasAlternateWeapon(items = []) {
    return items.some((item) => /\b(?:alternate weapon|secondary weapon|offhand|off-hand)\b/i.test(itemText(item)));
  }

  function swapMainAlternateAffordance(context = {}) {
    const canSwap = context.hasAlternate === true || hasAlternateWeapon(context.items || []);
    return action('slot.swapMainAlternate', 'Swap with alternate weapon', 'primary', canSwap ? 'x' : '', {
      enabled: canSwap,
      disabledReason: canSwap ? '' : 'No alternate weapon is known, so there is nothing to swap into the main hand.',
      params: { slotIds: ['main-hand', 'offhand'] },
      consumesTurn: 'yes',
    });
  }

  function equipmentSlotActionAffordances(slot, context = {}) {
    const id = String(slot?.id || slot?.slot || '');
    if (id === 'main-hand' || id === 'offhand') {
      const swap = swapMainAlternateAffordance({ ...context, hasAlternate: context.hasAlternate ?? Boolean(context.alternateItem) });
      return swap.enabled ? [swap] : [];
    }
    return [];
  }

  function routeEquipmentSlotAction(actionId, slot, context = {}) {
    if (actionId === 'slot.swapMainAlternate' || actionId === 'item.swapWithAlternate') {
      const swap = swapMainAlternateAffordance({ ...context, hasAlternate: context.hasAlternate ?? Boolean(context.alternateItem) });
      if (!swap.enabled) return { ok: false, actionId: swap.id, reason: swap.disabledReason };
      return { ok: true, actionId: swap.id, command: 'x', message: 'Swap main hand with alternate weapon.', refreshInventory: true };
    }
    return { ok: false, actionId: actionId || '', reason: 'No semantic equipment-slot route is available for that action.' };
  }

  function ringHandState(items = []) {
    const leftOccupied = (items || []).some((candidate) => /\bon left hand\b/i.test(itemText(candidate)));
    const rightOccupied = (items || []).some((candidate) => /\bon right hand\b/i.test(itemText(candidate)));
    const hand = !leftOccupied ? 'l' : (!rightOccupied ? 'r' : '');
    return { leftOccupied, rightOccupied, hand, bothEmpty: !leftOccupied && !rightOccupied, bothOccupied: leftOccupied && rightOccupied };
  }

  function preferredRingHand(items = []) {
    return ringHandState(items).hand;
  }

  function normalizeRingHand(hand) {
    const value = String(hand || '').toLowerCase();
    if (value === 'l' || value === 'left' || value === 'left-ring' || value === 'ring.left') return 'l';
    if (value === 'r' || value === 'right' || value === 'right-ring' || value === 'ring.right') return 'r';
    return '';
  }

  function ringHandName(hand) { return hand === 'r' ? 'right' : 'left'; }

  function routeRingPutOn(item, context = {}) {
    const key = itemKey(item);
    const text = itemText(item);
    if (!hasRingTag(text) && !hasPublicActionToken(item, 'putOn.ring')) return { ok: false, actionId: 'item.putOn.ring', reason: 'Only wearable jewelry rings can be put on ring fingers.', ...blockerFields(['blocked.public.tryInNetHack']) };
    if (!key) return { ok: false, actionId: 'item.putOn.ring', reason: 'This ring has no NetHack selector, so it cannot be put on safely.', ...blockerFields(['blocked.public.tryInNetHack']) };
    const state = ringHandState(context.items || []);
    const targetHand = normalizeRingHand(context.targetRingHand || context.targetHand || context.slotId || context.slot?.id || context.slot?.slot);
    if (targetHand) {
      const occupied = targetHand === 'l' ? state.leftOccupied : state.rightOccupied;
      const handName = ringHandName(targetHand);
      if (occupied) {
        const blockerInfo = blockerFields([targetHand === 'l' ? 'blocked.ring.leftOccupied' : 'blocked.ring.rightOccupied']);
        return { ok: false, actionId: 'item.putOn.ring', ringHand: targetHand, reason: blockerInfo.blockerLabel, reasonToken: blockerInfo.blockerToken, reasonLabel: blockerInfo.blockerLabel, blockerTokens: blockerInfo.blockerTokens, blockerLabels: blockerInfo.blockerLabels };
      }
      return {
        ok: true,
        actionId: 'item.putOn.ring',
        label: `Put on ${handName} ring`,
        command: `P${key}${state.bothEmpty ? targetHand : ''}`,
        selector: key,
        ringHand: targetHand,
        targetRingHand: targetHand,
        autoAnswerHand: state.bothEmpty,
        message: `Put on ${cleanName(text)} on ${handName} hand${state.bothEmpty ? ' (targeted slot).' : '.'}`,
      };
    }
    if (state.bothOccupied) {
      const blockerInfo = blockerFields(['blocked.ring.bothOccupied']);
      return { ok: false, actionId: 'item.putOn.ring', reason: blockerInfo.blockerLabel, reasonToken: blockerInfo.blockerToken, reasonLabel: blockerInfo.blockerLabel, blockerTokens: blockerInfo.blockerTokens, blockerLabels: blockerInfo.blockerLabels };
    }
    const handName = ringHandName(state.hand);
    return {
      ok: true,
      actionId: 'item.putOn.ring',
      label: `Put on ${handName} ring`,
      command: `P${key}${state.bothEmpty ? state.hand : ''}`,
      selector: key,
      ringHand: state.hand,
      autoAnswerHand: state.bothEmpty,
      message: `Put on ${cleanName(text)} on ${handName} hand${state.bothEmpty ? ' (auto-selected).' : '.'}`,
    };
  }

  function routeInventoryAction(item, affordance = {}, context = {}) {
    const actionId = affordance.id || affordance.actionId || '';
    if (actionId === 'item.putOn.ring') return routeRingPutOn(item, { ...context, targetRingHand: affordance.params?.targetRingHand || context.targetRingHand });
    const keys = affordance.execution?.keys || affordance.command || affordance.keys || '';
    if (!keys) return { ok: false, actionId, reason: 'That action does not have a safe NetHack command route yet.' };
    if (actionId === 'item.rub') {
      const key = itemKey(item);
      if (!key || !hasRubCandidateTag(itemText(item))) return { ok: false, actionId, reason: 'Only visible lamp, lantern, or stone inventory rows can use the safe selected-item #rub route.' };
      return {
        ok: true,
        actionId,
        command: `#rub\n${key}`,
        label: affordance.label || 'Rub',
        promptPolicy: 'netHack-owned-followup',
        target: {
          selector: key,
          inventoryLetter: key,
          ...(Number.isInteger(item?.objectId) && item.objectId >= 0 ? { objectId: item.objectId } : {}),
          displayName: cleanName(itemText(item) || 'item'),
          location: { kind: 'inventory' },
        },
        message: `Rub ${cleanName(itemText(item) || 'item')}; NetHack retains any subsequent prompt.`,
      };
    }
    return { ok: true, actionId, command: keys, label: affordance.label || actionId, message: `${String(affordance.label || 'Action').replace(/…/g, '')}: ${cleanName(itemText(item) || 'item')}.` };
  }

  function primaryEquipmentActionForItem(item, context = {}) {
    const text = itemText(item);
    if (isEquipped(text)) return null;
    const armorSwap = armorSwapRouteForItem(item, context);
    if (armorSwap?.ok) return { label: armorSwap.label, key: armorSwap.command[0], command: armorSwap.command, actionId: armorSwap.actionId, message: armorSwap.message, takeOffSelectors: armorSwap.takeOffSelectors || [armorSwap.takeOffSelector].filter(Boolean), slot: armorSwap.slot, blockerTokens: armorSwap.blockerTokens || [], blockerLabels: armorSwap.blockerLabels || [], reasonToken: armorSwap.reasonToken || '', reasonLabel: armorSwap.reasonLabel || '' };
    const actions = itemActionAffordances(item, context);
    const preferred = actions.find((a) => a.id === 'item.wear') || actions.find((a) => a.id === 'item.putOn.ring' || a.id === 'item.putOn.accessory') || actions.find((a) => a.id === 'item.quiver') || actions.find((a) => a.id === 'item.wield.mainHand');
    if (preferred?.enabled === false) return { label: preferred.label, key: '', command: '', actionId: preferred.id, enabled: false, disabledReason: preferred.disabledReason || '', disabledReasonToken: preferred.disabledReasonToken || '', disabledReasonLabel: preferred.disabledReasonLabel || preferred.disabledReason || '', blockerTokens: preferred.blockerTokens || [], blockerLabels: preferred.blockerLabels || [] };
    if (!preferred?.execution?.keys) return null;
    if (preferred.id === 'item.putOn.ring') {
      const route = routeRingPutOn(item, context);
      return route.ok ? {
        label: route.label,
        key: preferred.execution.keys[0],
        command: route.command,
        actionId: preferred.id,
        message: route.message,
        ringHand: route.ringHand,
        autoAnswerHand: route.autoAnswerHand,
      } : null;
    }
    return { label: preferred.label.replace(/…/g, ''), key: preferred.execution.keys[0], command: preferred.execution.keys, actionId: preferred.id };
  }

  function routeEquipmentDrop(item, slot, context = {}) {
    const text = itemText(item);
    const key = itemKey(item);
    if (!key) return { ok: false, actionId: '', reason: 'This inventory row has no NetHack selector, so it cannot be dropped safely.' };
    if (isEquipped(text)) return { ok: false, actionId: '', reason: 'That item is already equipped; use the slot buttons to remove or change it.' };
    const id = String(slot?.id || slot?.slot || '');
    const label = String(slot?.label || id || 'slot');
    const wearPatterns = {
      'armor-suit': /\b(?:mail|armor|leather|robe|shirt|dragon scales|suit)\b/i,
      cloak: /\b(?:cloak|mummy wrapping)\b/i,
      helmet: /\b(?:helm|helmet|hat|fedora|dunce cap)\b/i,
      gloves: /\b(?:gloves|gauntlets)\b/i,
      boots: /\b(?:boots|shoes)\b/i,
      shield: /\bshield\b/i,
    };
    if (id === 'main-hand') {
      const twoHandedBlocker = handBlockerForTwoHandedItem(item, context);
      if (twoHandedBlocker) return { ok: false, actionId: 'item.wield.mainHand', reason: twoHandedBlocker.blockerLabel, reasonToken: twoHandedBlocker.blockerToken, reasonLabel: twoHandedBlocker.blockerLabel, blockerTokens: twoHandedBlocker.blockerTokens, blockerLabels: twoHandedBlocker.blockerLabels };
      if (hasPublicActionToken(item, 'wield', 'hold') || hasWeaponTag(text) || hasAmmoTag(text)) return { ok: true, actionId: 'item.wield.mainHand', command: `w${key}`, message: `Wield ${cleanName(text)} in main hand.` };
      const blockerInfo = blockerFields(['blocked.public.tryInNetHack']);
      return { ok: false, actionId: 'item.wield.mainHand', reason: 'Only weapon-like, throwable, or ammunition items can be wielded in the main-hand slot.', reasonToken: blockerInfo.blockerToken, reasonLabel: blockerInfo.blockerLabel, blockerTokens: blockerInfo.blockerTokens, blockerLabels: blockerInfo.blockerLabels };
    }
    if (id === 'quiver') {
      if (hasPublicActionToken(item, 'quiver') || hasAmmoTag(text) || /\b(?:dagger|daggers)\b/i.test(text)) {
        const blockerInfo = hasQuiveredItem(context.items || []) ? blockerFields(['blocked.hands.quiverOccupied']) : blockerFields([]);
        return { ok: true, actionId: 'item.quiver', command: `Q${key}`, message: `Ready ${cleanName(text)} in the quiver.`, blockerTokens: blockerInfo.blockerTokens, blockerLabels: blockerInfo.blockerLabels, reasonToken: blockerInfo.blockerToken, reasonLabel: blockerInfo.blockerLabel };
      }
      const blockerInfo = blockerFields(['blocked.public.tryInNetHack']);
      return { ok: false, actionId: 'item.quiver', reason: 'Only throwable/ammunition items can be dropped on the quiver slot.', reasonToken: blockerInfo.blockerToken, reasonLabel: blockerInfo.blockerLabel, blockerTokens: blockerInfo.blockerTokens, blockerLabels: blockerInfo.blockerLabels };
    }
    if (wearPatterns[id]) return (armorSlotForItem(item) === id || wearPatterns[id].test(text))
      ? { ok: true, actionId: 'item.wear', command: `W${key}`, message: `Wear ${cleanName(text)} in ${label}.` }
      : { ok: false, actionId: 'item.wear', reason: `That item does not match the ${label} slot.` };
    if (id === 'amulet') return (hasPublicActionToken(item, 'putOn.amulet') || /\bamulet\b/i.test(text)) ? { ok: true, actionId: 'item.putOn.accessory', command: `P${key}`, message: `Put on ${cleanName(text)}.` } : { ok: false, actionId: 'item.putOn.accessory', reason: 'Only amulets fit the amulet/neck slot.' };
    if (id === 'left-ring' || id === 'right-ring') return (hasPublicActionToken(item, 'putOn.ring') || hasRingTag(text)) ? routeRingPutOn(item, { ...context, targetRingHand: id === 'right-ring' ? 'r' : 'l' }) : { ok: false, actionId: 'item.putOn.ring', reason: 'Only wearable jewelry rings fit ring slots.' };
    if (id === 'eyes') return (hasPublicActionToken(item, 'putOn.eyes') || /\b(?:blindfold|lenses|towel)\b/i.test(text)) ? { ok: true, actionId: 'item.putOn.eyes', command: `P${key}`, message: `Put on ${cleanName(text)} over eyes.` } : { ok: false, actionId: 'item.putOn.eyes', reason: 'Only blindfolds, lenses, or towels fit the eyes slot.' };
    if (id === 'offhand') {
      const blockerInfo = offhandBlocker(context);
      return { ok: false, actionId: 'slot.offhand', reason: blockerInfo.blockerLabel, reasonToken: blockerInfo.blockerToken, reasonLabel: blockerInfo.blockerLabel, blockerTokens: blockerInfo.blockerTokens, blockerLabels: blockerInfo.blockerLabels };
    }
    return { ok: false, actionId: '', reason: 'No safe NetHack command is known for that drop target.' };
  }

  return Object.freeze({ itemActionAffordances, groundItemActionAffordances, primaryEquipmentActionForItem, routeInventoryAction, routeEquipmentDrop, equipmentSlotActionAffordances, routeEquipmentSlotAction, swapMainAlternateAffordance, armorSwapRouteForItem, armorSlotForItem, wornArmorBlockingSlot, preferredRingHand, ringHandState, cleanName, itemKey, publicActionTokens, hasPublicActionToken, routeRingPutOn, publicEquipmentBlockerLabels, publicEquipmentBlockerLabel, twoHandedWeaponPublicText });
}));
