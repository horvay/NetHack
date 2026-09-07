(function initInteractionModel(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./prompt-rules'));
  else root.NetHackInteractionModel = factory(root.NetHackPromptRules);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(PromptSyntax) {
  const version = 'nethack-interaction-model/v2';
  const ESC = '\u001b';
  const menuPromptKinds = new Set(['menu selection', 'read-only menu']);
  const inventoryActionPattern = /what do you want to|what would you like to|which item|use or apply|write with|engrave with|drop|read|eat|quaff|apply|wield|wear|take off|remove|zap|throw|fire|drink|put on|write|engrave|quiver|rub|dip|invoke|offer|force|name|call|identify|what is|whatis/i;
  const containerPattern = /\b(?:container|chest|box|large box|ice box|sack|bag)\b/i;
  const ediblePattern = /\b(?:corpse|food ration|ration|cram ration|K-ration|C-ration|lembas|melon|apple|orange|pear|banana|carrot|tripe ration|cream pie|candy bar|fortune cookie|pancake|egg|tin|lizard|glob)\b/i;
  const directionKeys = Object.freeze({ '-1,-1': 'y', '0,-1': 'k', '1,-1': 'u', '-1,0': 'h', '1,0': 'l', '-1,1': 'b', '0,1': 'j', '1,1': 'n' });
  const directionLabels = Object.freeze({ y: 'northwest', k: 'north', u: 'northeast', h: 'west', l: 'east', b: 'southwest', j: 'south', n: 'southeast' });
  const itemClassPresentation = Object.freeze({
    '!': ['Potions', 'Consumables', 'Potion inventory or discoveries'],
    '?': ['Scrolls', 'Consumables', 'Scroll inventory or discoveries'],
    '+': ['Spellbooks', 'Magic', 'Spellbook choices'],
    '=': ['Rings', 'Worn magic', 'Rings and ring discoveries'],
    '"': ['Amulets', 'Worn magic', 'Amulets and amulet discoveries'],
    '/': ['Wands', 'Magic', 'Wands'],
    '(': ['Tools', 'Tools', 'Tools, containers, and utility items'],
    ')': ['Weapons', 'Equipment', 'Weapons and ammunition'],
    '[': ['Armor', 'Equipment', 'Armor and worn gear'],
    '%': ['Food', 'Consumables', 'Food, corpses, and comestibles'],
    '*': ['Gems/rocks', 'Treasure', 'Gems, rocks, and stones'],
    '$': ['Gold', 'Treasure', 'Gold and coins'],
    '`': ['Boulders/statues', 'Dungeon', 'Boulders and statues'],
    '_': ['Iron balls', 'Dungeon', 'Iron balls and chains'],
    '.': ['Current square', 'Context', 'Objects on the current square'],
    '#': ['Dungeon feature', 'Context', 'Dungeon features'],
    '-': ['Nothing / bare hands', 'Context', 'No item or bare hands when offered'],
  });

  function text(value) { return PromptSyntax.text(value); }
  function selectorSet(query, choices) { return PromptSyntax.selectorSet(query, choices); }
  function selectorCharacter(value) { return PromptSyntax.selectorCharacter(value); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freeze(child);
    return Object.freeze(value);
  }
  function publicCopy(value) { return text(value).replace(/\s+([?.!,;:])/g, '$1'); }
  function requestId(owner) { return text(owner?.requestId || owner?.menuRequestId || owner?.promptId || owner?.menuId); }
  function lifecycleRevision(owner) { return Number(owner?.lifecycleRevision || owner?.revision || 0); }

  function isDirectionPrompt(query) {
    return /(?:^|\b)(?:choose|pick|select)?\s*(?:a\s+)?direction\b|\bin what direction\b|\bwhat direction\b|\bwhere do you want\b/i.test(String(query || ''));
  }
  function isLockedDoorMessage(value) {
    const message = String(value || '');
    return /\b(?:door|gateway)\b.*\blocked\b/i.test(message) || /\blocked\b.*\bdoor\b/i.test(message);
  }
  function isFixedChoicePromptChoices(choices) {
    const raw = String(choices || '').replace(new RegExp(ESC, 'g'), '').replace(/\s+/g, '');
    return Boolean(raw) && /^[ynaqmYNQAM]+$/.test(raw) && /[ynYN]/.test(raw);
  }
  function isExplicitInventorySelectorQuestion(query) {
    return /what do you want to|what would you like to|which item|write with|engrave with|which object|what item/i.test(String(query || ''));
  }
  function isFixedChoicePrompt(query, choices) {
    return isFixedChoicePromptChoices(choices) && !isExplicitInventorySelectorQuestion(query);
  }
  function isInventoryActionPrompt(query, choices) {
    return !isFixedChoicePrompt(query, choices) && inventoryActionPattern.test(String(query || '')) && selectorSet(query, choices).size > 0;
  }
  function isItemClassPrompt(query, choices) {
    if (isDirectionPrompt(query)) return false;
    const q = String(query || '');
    const explicit = /what type of object|what kinds of thing|pick.*class|object class|which class|drop type/i.test(q);
    const selectorSource = String(choices || '') || q.match(/\[([^\]]+)\]/)?.[1] || '';
    const classKeys = selectorSource.split('').filter((key) => itemClassPresentation[key]);
    const inventoryLetters = selectorSource.split('').filter((key) => /[A-Za-z]/.test(key));
    return explicit || (classKeys.length >= 2 && !inventoryLetters.length);
  }
  function isCommandHelpPrompt(query) {
    return /what\s+(?:command|does)|command\s+(?:help|description)|describe\s+(?:a\s+)?command/i.test(String(query || ''));
  }

  function hasSelectableRows(menu) { return (menu?.items || []).some((item) => Number(item?.selector) > 0); }
  function isReadOnlyInformationalMenu(menu) { return Boolean(menu?.awaitingSelection) && !Number(menu?.how || 0) && !hasSelectableRows(menu); }
  function isGroundLookMenu(menu) { return /things that are here|you see here|there (?:is|are) here/i.test(String(menu?.prompt || '')); }
  function isShopPaymentMenu(menu) { return /\b(?:pay for which items?|pay which (?:shop )?bill items?|which items? (?:do you want to )?pay for|itemized bill(?:ing)?)\b/i.test(String(menu?.prompt || '')); }
  function isExplicitTransferMenu(menu) {
    if (!hasSelectableRows(menu) || !Number(menu?.how || 0)) return false;
    if (isShopPaymentMenu(menu)) return true;
    return /\b(?:loot|take out|put in|stash|container contents|from (?:the )?(?:chest|box|bag|sack)|into (?:the )?(?:chest|box|bag|sack))\b/i.test(String(menu?.prompt || ''));
  }
  function looksLikeSpellMenu(prompt, rows) {
    if (/choose which spell|cast (?:a |the )?spell|which spell|spell to cast|enhance (?:your )?skills?|which skill|skill points|advance (?:a |your )?skill/i.test(prompt)) return true;
    if (/\b(?:pw|power)\s*[:=]?\s*\d+/i.test(rows) && /\bfail(?:ure)?\s*[:=]?\s*\d+/i.test(rows)) return true;
    if (/\b(?:unskilled|basic|skilled|expert|master|grand master)\b/i.test(rows) && /\bskill/i.test(`${prompt} ${rows}`)) return true;
    return /\b(?:cast|enhance|advance)\b/i.test(prompt) && !/\bspellbook\b/i.test(rows);
  }
  function looksLikeInventoryMenu(prompt, rows) {
    if (/do what with|what (?:do you want|would you like) to|which item|pick up what|drop what|take out what|put in what|inventory|possessions|things that are here/i.test(prompt)) return true;
    if (/\b(?:identify|name|call|wear|wield|apply|eat|quaff|drink|read|zap|throw|fire|dip|rub|invoke|offer|force|remove|take off|put on|quiver)\b/i.test(prompt)) return true;
    return /\b(?:spellbook|scroll|potion|wand|ring|amulet|food ration|dagger|sword|armor|corpse|gem|tool|towel)\b/i.test(rows)
      && !/\b(?:pw|power)\s*[:=]?\s*\d+/i.test(rows)
      && !/\bfail(?:ure)?\s*[:=]?\s*\d+/i.test(rows);
  }
  function menuKind(menu) {
    const prompt = String(menu?.prompt || '');
    const rows = (menu?.items || []).slice(0, 12).map((item) => item?.text || '').join(' ');
    const purpose = String(menu?.menuPurpose || menu?.purpose || '');
    if (/^(?:spell|skill)\.rows$/i.test(purpose)) return 'spell';
    if (/herecmdmenu|therecmdmenu|context action|what do you want to do here|what do you want to do there/i.test(`${prompt} ${rows}`)) return 'context';
    if (isReadOnlyInformationalMenu(menu)) return /help|commands/i.test(`${prompt} ${rows}`) ? 'help' : 'menu';
    if (isExplicitTransferMenu(menu)) return 'transfer';
    if (/\b(?:about|long description|list of game commands|history of nethack|info on a character|what a given key does|keyboard commands|extended commands|nethack license|help|commands)\b/i.test(`${prompt} ${rows}`)) return 'help';
    const spell = looksLikeSpellMenu(prompt, rows);
    if (looksLikeInventoryMenu(prompt, rows) && !spell) return 'inventory';
    if (spell) return 'spell';
    if (/option|autopickup|pickup_types|toggle/i.test(`${prompt} ${rows}`)) return 'options';
    return 'menu';
  }
  function shouldCacheInventoryChoices(menu) { return menuKind(menu) === 'inventory' && /inventory|possessions/i.test(String(menu?.prompt || '')); }
  function shouldSuppressPassiveGroundMenu(menu, how) { return Number(how || 0) === 0 && menuKind(menu) === 'inventory' && isGroundLookMenu(menu); }

  function menuItemClass(item) {
    const publicClass = text(item?.publicClass).toLowerCase();
    if (publicClass) return publicClass;
    const value = String(item?.text || '').toLowerCase();
    if (/weapon|sword|dagger|mace|axe|bow|arrow|dart|rock/.test(value)) return 'weapon';
    if (/armor|mail|helm|boots|gloves|cloak|shield/.test(value)) return 'armor';
    if (/potion|scroll|wand|spellbook|ring|amulet/.test(value)) return 'magic';
    if (/food|ration|corpse|apple|carrot|egg|tin/.test(value)) return 'food';
    if (/tool|marker|lamp|lantern|key|lock pick|pick-axe|pickaxe|bag|sack|box|chest|horn|whistle|towel|camera|stethoscope|can of oil|tinning kit|oil lamp/.test(value)) return 'tool';
    return '';
  }
  function menuItemState(value) {
    const publicText = String(value || '');
    if (/\(weapon in hands\)/i.test(publicText)) return 'weapon in hands';
    return publicText.match(/\((weapon in (?:hand|hands|left hand|right hand)|being worn|wielded|in quiver|on (?:left|right) hand|alternate weapon; not wielded)\)/i)?.[1] || '';
  }
  function menuItemName(value) {
    const item = value && typeof value === 'object' ? value : null;
    if (item) {
      const displayName = text(item.displayName);
      if (displayName) return displayName;
      const rowText = menuTextWithoutSelector(item.text);
      if (rowText) return rowText;
      const semantic = item.semanticKnown === false
        ? text(item.semanticAppearance)
        : text(item.semanticName || item.semanticAppearance);
      if (semantic) return semantic;
      value = item.text;
    }
    return String(value || '').replace(/^\s*[a-z$]\s*[-+]\s+/i, '').replace(/\s*\((?:weapon in (?:hand|hands|left hand|right hand)|being worn|wielded|in quiver|on (?:left|right) hand|alternate weapon; not wielded)\)\s*/ig, ' ').replace(/\s+/g, ' ').trim();
  }
  function menuTextWithoutSelector(value) { return String(value || '').replace(/^\s*[A-Za-z$]\s*[-+]\s*/, '').replace(/\s+/g, ' ').trim(); }
  function promptRequiresNamedInventoryRows(query) { return /\b(?:quaff|drink)\b/i.test(String(query || '')); }
  function inventoryTextRowActionMatches(query, itemName) {
    const q = String(query || '').toLowerCase();
    const name = String(itemName || '').toLowerCase();
    if (/\b(?:quaff|drink)\b/.test(q)) return /potion|liquid|water|juice|booze/.test(name);
    if (/\bread\b/.test(q)) return /scroll|spellbook|book/.test(name);
    if (/\beat\b/.test(q)) return /food|ration|corpse|apple|orange|pear|melon|banana|carrot|egg|tin|cream pie|candy bar|lichen/.test(name);
    return true;
  }
  function objectFilterTags(item = {}) {
    const value = `${item.text || ''} ${item.semanticName || ''} ${item.semanticAppearance || ''} ${item.publicClass || ''} ${item.itemState || ''}`.toLowerCase();
    const tags = ['all'];
    const include = (tag, pattern, exclude) => { if (pattern.test(value) && (!exclude || !exclude.test(value))) tags.push(tag); };
    include('tools', /tool|pick|key|lock|lamp|lantern|marker|horn|whistle|bag|sack|box|chest|camera|towel|stethoscope/);
    include('containers', /bag|sack|box|chest|container/);
    include('charged', /\(\d+:-?\d+\)|wand|marker|charged|charges/);
    include('wands', /wand|\//);
    include('projectiles', /arrow|dart|dagger|rock|stone|spear|knife|shuriken|bolt|ammo|projectile/);
    include('equipped', /weapon in (?:hand|left hand|right hand)|being worn|wielded|quiver|left hand|right hand|equipped/);
    include('stacks', /\b\d+\s+/);
    include('rub-targets', /lamp|lantern|stone|gray stone|touchstone|flint|luckstone/);
    include('armor', /armor|mail|helm|helmet|hat|boots|gloves|cloak|shield|shirt|robe|suit/);
    include('accessories', /ring|amulet|blindfold|towel|lenses/);
    include('rings', /ring|left hand|right hand/);
    include('amulets', /amulet/);
    include('worn', /being worn|weapon in (?:hand|left hand|right hand)|wielded|left hand|right hand|quiver/);
    include('weapons', /weapon|sword|dagger|mace|axe|bow|yumi|arrow|dart|spear|knife|club|staff/);
    include('offhand', /dagger|knife|short sword|saber|weapon|uncursed|blessed/, /two-handed|bow|launcher|crossbow/);
    include('cursed-risk', /cursed|welded|stuck|weapon in (?:hand|left hand|right hand)|being worn|left hand|right hand/);
    if (!/fountain|pool|sink/.test(value)) tags.push('dip-items');
    include('liquids', /potion|water|liquid|fountain|pool|sink/);
    include('corpses', /corpse|food|egg|tin|comestible/);
    include('ground', /corpse|altar|sacrifice|offer/);
    include('artifacts', /artifact|named|amulet|quest|orb|eye|mitre|scepter|staff|bane|brand|special/);
    return Object.freeze([...new Set(tags)]);
  }

  function inventoryItemSelector(item = {}) {
    const legacySelector = selectorCharacter(item.selector);
    if (legacySelector) return legacySelector;
    for (const value of [item.inventoryLetter, item.selectorKey, item.letter]) {
      const key = String(value || '');
      if ([...key].length === 1) return key;
    }
    return '';
  }

  function inventoryRowsForPrompt(prompt, cachedInventoryChoices = []) {
    if (!isInventoryActionPrompt(prompt?.query, prompt?.choices)) return [];
    const selectors = selectorSet(prompt.query, prompt.choices);
    return (cachedInventoryChoices || []).filter((item) => {
      const key = inventoryItemSelector(item);
      return selectors.has(key) && (!promptRequiresNamedInventoryRows(prompt.query) || inventoryTextRowActionMatches(prompt.query, item.text || item.displayName || item.semanticName || item.semanticAppearance));
    }).map((item) => {
      const key = inventoryItemSelector(item);
      return freeze({ ...item, selector: Number(item.selector) > 0 ? item.selector : key.codePointAt(0), key, itemClass: menuItemClass(item), itemName: menuItemName(item), itemState: menuItemState(item.text || item.displayName), filterTags: objectFilterTags(item) });
    });
  }

  function itemClassOptions(query, choices) {
    const source = String(choices || '') || (String(query || '').match(/\[([^\]]+)\]/)?.[1] || '!?+="/()[%*$');
    return Array.from(new Set(source.split('').filter((key) => itemClassPresentation[key]))).map((key) => {
      const [label, group, description] = itemClassPresentation[key];
      return freeze({ key, label, group, text: description, filterText: `${group} ${description}`, className: 'class-choice' });
    });
  }
  function specialSelectorOption(key, query) {
    const q = String(query || '').toLowerCase();
    if ((key === 'l' || key === 'r') && /which hand|left or right|ring/.test(q)) return { key, label: key === 'l' ? 'Left hand' : 'Right hand', text: `Put the ring on your ${key === 'l' ? 'left' : 'right'} hand.` };
    if (key === '-') {
      if (/wield|weapon|fight|bare/.test(q)) return { key, label: 'Bare hands', text: 'Use no weapon for this action.' };
      if (/write|engrave/.test(q)) return { key, label: 'Fingers / no tool', text: 'Write without selecting an inventory tool.' };
      if (/quiver|fire|throw/.test(q)) return { key, label: 'No quiver item', text: 'Clear or avoid selecting ammunition.' };
      return { key, label: 'No item', text: 'Continue without selecting an inventory item.' };
    }
    if (key === '?') return { key, label: 'Show matching inventory', text: 'List matching items.' };
    if (key === '*') return { key, label: 'Show all inventory', text: 'List all inventory.' };
    if (key === '$') return { key, label: 'Gold', text: 'Choose carried gold.' };
    return null;
  }
  function selectorFallbackOptions(query, choices, existing = new Set()) {
    if (promptRequiresNamedInventoryRows(query)) return [];
    return Array.from(selectorSet(query, choices)).filter((key) => key !== ESC && !existing.has(key)).map((key) => {
      const special = specialSelectorOption(key, query);
      return freeze({ ...(special || { key, label: `Item ${key}`, text: 'Name unavailable.' }), className: special ? 'letter-choice special-selector-choice' : 'letter-choice unavailable-item-choice', nameUnavailable: !special });
    });
  }
  function shopOfferInfo(query) {
    const value = publicCopy(query);
    const match = value.match(/\boffers(?: only)?\s+(\d+)\s+gold piece(?:s)?\s+for\s+(?:the|your)\s+(.+?)\.\s*Sell\s+(it|them)\?/i);
    if (!match) return null;
    const lead = value.slice(0, match.index).trim();
    const offerSentence = value.slice(match.index, match.index + match[0].length).replace(/\.\s*Sell\s+(?:it|them)\?\s*$/i, '.');
    return freeze({ amount: match[1], item: match[2], pronoun: match[3].toLowerCase(), prompt: `${lead ? `${lead} ` : ''}${offerSentence}`.trim() });
  }
  function seriousPromptProfile(query) {
    const q = String(query || '').toLowerCase();
    if (/really quit|quit without saving|give up/.test(q)) return { action: 'Quit without saving', safe: 'Do not quit', note: 'Destructive confirmation: this ends the run without saving.' };
    if (/really save|save (?:and|then)|save.*game|save.*exit/.test(q)) return { action: 'Save and exit', safe: 'Keep playing', note: 'Serious confirmation: saving exits the current play session.' };
    if (/explore mode|enter explore|switch.*explore/.test(q)) return { action: 'Enter explore mode', safe: 'Stay in normal play', note: 'Serious confirmation: explore mode changes scoring and conduct expectations.' };
    if (/pray|prayer/.test(q)) return { action: 'Pray now', safe: 'Do not pray', note: 'Serious confirmation: prayer can anger your god if mistimed.' };
    if (/attack.*peaceful|peaceful.*attack/.test(q)) return { action: 'Attack peaceful creature', safe: 'Do not attack', note: 'Danger confirmation: this can anger peaceful monsters or shopkeepers.' };
    if (/break|destroy/.test(q)) return { action: 'Destroy it anyway', safe: 'Do not destroy', note: 'Danger confirmation: this may permanently destroy an item.' };
    return null;
  }
  function choiceButtonOptions(query, choices) {
    const defaultKey = String(query || '').match(/\[.*?\(([a-z?])\).*?\]/i)?.[1]?.toLowerCase();
    const offer = shopOfferInfo(query);
    const serious = seriousPromptProfile(query);
    return String(choices || '').split('').filter((key) => key && key !== ESC && !/\s/.test(key)).map((key, index) => {
      const lower = key.toLowerCase();
      const suffix = defaultKey === lower ? ' (default)' : '';
      const special = specialSelectorOption(key, query);
      let label = special?.label || ({ y: 'Yes', n: 'No', q: 'Quit', a: 'All', m: 'More', r: 'Rename', '?': 'Help/list', '*': 'List all' })[lower] || key.toUpperCase();
      let optionText = special?.text || '';
      let className = special ? 'letter-choice special-selector-choice' : 'letter-choice';
      let sort = index + 1;
      if (offer) {
        if (lower === 'y') { label = 'Accept offer'; optionText = `Sell ${offer.item}; receive ${offer.amount} gold.`; className += ' accept-choice'; sort = 0; }
        if (lower === 'n') { label = 'Decline offer'; optionText = `Keep ${offer.item}.`; className += ' decline-choice'; sort = 1; }
        if (lower === 'a') { label = 'Accept remaining offers'; optionText = 'Accept this and later offers in this drop.'; className += ' accept-choice secondary-offer-choice'; sort = 2; }
        if (lower === 'q') { label = 'Stop selling'; optionText = 'Decline this and remaining dropped items.'; className += ' decline-choice secondary-offer-choice'; sort = 3; }
      } else if (serious) {
        if (lower === 'y') { label = serious.action; optionText = serious.note; className += ' danger-choice'; sort = 2; }
        else if (lower === 'n') { label = serious.safe; optionText = 'Safe path: cancels or declines this serious action.'; className += ' safe-choice'; sort = 0; }
        else { optionText = serious.note; className += ' serious-choice'; }
      }
      return freeze({ key, label: `${label}${suffix}`, text: optionText, className, sort, serious: Boolean(serious) });
    }).sort((a, b) => a.sort - b.sort);
  }
  function inventoryActionVerb(query) {
    const q = String(query || '').toLowerCase();
    for (const [pattern, label] of [[/write with|engrave with/, 'Write with'], [/read/, 'Read'], [/eat/, 'Eat'], [/quaff|drink/, 'Quaff'], [/apply|use/, 'Apply'], [/wield|weapon/, 'Wield'], [/wear/, 'Wear'], [/take off/, 'Take off'], [/remove/, 'Remove'], [/put on/, 'Put on'], [/quiver/, 'Quiver'], [/zap/, 'Zap'], [/throw/, 'Throw'], [/fire/, 'Fire'], [/rub/, 'Rub'], [/dip/, 'Dip'], [/invoke/, 'Invoke'], [/offer/, 'Offer'], [/name|call/, 'Name/call']]) if (pattern.test(q)) return label;
    return 'Choose';
  }
  function objectActionFilters(query) {
    const q = String(query || '').toLowerCase();
    if (/put on/.test(q)) return [['all', 'All candidates'], ['rings', 'Rings'], ['amulets', 'Amulets'], ['cursed-risk', 'Cursed/stuck risk']];
    if (/remove|take off/.test(q)) return [['all', 'All equipped'], ['worn', 'Worn gear'], ['rings', 'Rings'], ['cursed-risk', 'Cursed/stuck risk']];
    if (/wear/.test(q)) return [['all', 'All candidates'], ['armor', 'Armor slots'], ['accessories', 'Accessories'], ['cursed-risk', 'Cursed/stuck risk']];
    if (/wield|two-weapon|weapon/.test(q)) return [['all', 'All candidates'], ['weapons', 'Weapons'], ['offhand', 'Off-hand candidates'], ['cursed-risk', 'Cursed/stuck risk']];
    if (/zap/.test(q)) return [['all', 'All candidates'], ['wands', 'Wands'], ['charged', 'Charged/known']];
    if (/throw|fire|quiver/.test(q)) return [['all', 'All candidates'], ['projectiles', 'Projectiles'], ['equipped', 'Quiver/equipped'], ['stacks', 'Stacks']];
    if (/rub/.test(q)) return [['all', 'All candidates'], ['rub-targets', 'Lamps/stones'], ['tools', 'Tools']];
    if (/dip/.test(q)) return [['all', 'All candidates'], ['dip-items', 'Dip items'], ['liquids', 'Potions/liquids'], ['equipped', 'Equipped']];
    if (/offer/.test(q)) return [['all', 'All candidates'], ['corpses', 'Corpses/food'], ['ground', 'Altar-ready']];
    if (/invoke/.test(q)) return [['all', 'All candidates'], ['artifacts', 'Artifacts/special'], ['equipped', 'Equipped']];
    if (/apply|use|force|untrap/.test(q)) return [['all', 'All candidates'], ['tools', 'Tools'], ['containers', 'Containers'], ['charged', 'Charged/known']];
    return [];
  }

  function cancellationPlanForPrompt(prompt) {
    const fallback = freeze({ key: ESC, kind: 'escape', acknowledgementEvent: 'bridge_prompt_answer', canonicalChoice: false });
    if (!prompt) return fallback;
    if (prompt.kind === 'line input') return freeze({ key: ESC, kind: 'line-input-cancel', acknowledgementEvent: 'bridge_line_answer', canonicalChoice: false });
    if (prompt.kind === 'extended command') return freeze({ key: ESC, kind: 'extended-command-cancel', acknowledgementEvent: 'bridge_extcmd_answer', canonicalChoice: false });
    if (prompt.kind !== 'question') return fallback;
    if (isDirectionPrompt(prompt.query)) return freeze({ key: ESC, kind: 'direction-cancel', acknowledgementEvent: 'bridge_prompt_answer', canonicalChoice: false });
    const choices = String(prompt.choices || '');
    const yesNo = isFixedChoicePrompt(prompt.query, choices) || (!isExplicitInventorySelectorQuestion(prompt.query) && choices.includes('y') && choices.includes('n'));
    if (!yesNo) return fallback;
    const key = choices.includes('q') ? 'q' : (choices.includes('n') ? 'n' : ESC);
    return key === ESC ? fallback : freeze({ key, kind: key === 'q' ? 'fixed-choice-quit' : 'fixed-choice-no', acknowledgementEvent: 'bridge_prompt_answer', canonicalChoice: true });
  }
  function cancellationPlanForMenu(menu) {
    return freeze({ key: ESC, kind: menu?.awaitingSelection ? 'menu-cancel' : 'menu-close', acknowledgementEvent: 'bridge_menu_answer', canonicalChoice: false });
  }

  function promptTitle(prompt, classification, hasInventoryRows) {
    const q = String(prompt?.query || '');
    if (classification === 'direction') return 'Choose direction';
    if (/write with|engrave with/i.test(q)) return 'Choose engraving tool';
    if (classification === 'item-class' && !hasInventoryRows) return 'Choose item class';
    if (hasInventoryRows || classification === 'inventory') return 'Choose item';
    if (/name|call|annotate/i.test(q)) return 'Name item';
    if (shopOfferInfo(q)) return 'Shopkeeper offer';
    if (classification === 'confirmation') return 'Confirm';
    return 'Question';
  }
  function lineInputTitle(prompt) {
    const q = String(prompt?.query || '');
    if (/wish/i.test(q)) return 'Wish granted — type your wish';
    if (isCommandHelpPrompt(q)) return 'Choose command help topic';
    if (/engrave|write in|write on/i.test(q)) return 'Enter engraving text';
    if (/name|call|annotate/i.test(q)) return 'Name item';
    if (/file|save/i.test(q)) return 'Name file';
    return 'Type answer';
  }
  function readOnlyMenuTitle(menu) {
    const prompt = text(menu?.prompt);
    const firstRow = (menu?.items || []).map((item) => menuTextWithoutSelector(item?.text)).find(Boolean) || '';
    if (/^Tip:/i.test(firstRow) || /^Tip:/i.test(prompt)) return 'Tip';
    if (/help|commands/i.test(`${prompt} ${firstRow}`)) return 'Help';
    return prompt && !/^Menu$/i.test(prompt) ? prompt : 'Review information';
  }
  function menuTitle(menu, kind, hasSelection, actionPrompt = '') {
    const prompt = String(actionPrompt || menu?.prompt || '');
    if (!hasSelection && isReadOnlyInformationalMenu(menu)) return readOnlyMenuTitle(menu);
    if (kind === 'transfer') {
      if (isShopPaymentMenu(menu)) return 'Shop payment';
      if (containerPattern.test(prompt)) return 'Container transfer';
      return 'Transfer items';
    }
    if (kind === 'spell') return /enhance|skill/i.test(prompt) ? 'Skills' : 'Spellbook';
    if (kind === 'options') return 'Options';
    if (kind === 'help') return 'Help';
    if (kind === 'context') return /there/i.test(prompt) ? 'There actions' : 'Here actions';
    if (kind === 'inventory') {
      if (/quaff|drink/i.test(prompt)) return 'Choose potion';
      return /drop|read|eat|apply|wield|wear|take off|remove|zap|throw|fire|pick up|identify|name|call|what is|whatis|dip|rub|invoke|offer|force|quiver/i.test(prompt) ? 'Choose item' : 'Inventory';
    }
    return hasSelection ? 'Choose option' : 'Review information';
  }
  function menuCopy(menu, kind, multi, hasSelection, actionPrompt = '') {
    const prompt = publicCopy(actionPrompt || menu?.prompt);
    if (kind === 'transfer') return isShopPaymentMenu(menu) ? 'Choose items to pay for.' : (prompt || 'Transfer items');
    if (kind === 'context') return prompt || 'Choose an action.';
    if (kind === 'spell') return prompt || 'Choose a spell or skill.';
    if (kind === 'options') return prompt || 'Choose an option.';
    if (kind === 'help') return prompt || 'Choose a help topic.';
    if (kind === 'inventory') return prompt || 'Choose item';
    return prompt || (multi ? 'Select items, then Confirm.' : (hasSelection ? 'Choose an option.' : 'Review information.'));
  }
  function dialogFamilyForPrompt(prompt, cachedInventoryChoices = []) {
    if (!prompt) return 'document';
    if (prompt.kind === 'line input') return 'form';
    if (prompt.kind === 'extended command') return 'command';
    if (prompt.kind === 'read-only menu') return 'document';
    if (prompt.kind === 'question' && isFixedChoicePrompt(prompt.query, prompt.choices)) return 'confirmation';
    return prompt.kind === 'question' || cachedInventoryChoices.length ? 'single-select' : 'document';
  }
  function dialogFamilyForMenu(menu) {
    if (!menu || isReadOnlyInformationalMenu(menu)) return 'document';
    if (isExplicitTransferMenu(menu)) return 'transfer';
    if (Number(menu.how || 0) === 2) return 'multi-select';
    return menuKind(menu) === 'help' ? 'command' : 'single-select';
  }
  function normalizeCommand(command, index = 0) {
    if (typeof command === 'string') return { name: command, description: '', index };
    if (!command || typeof command !== 'object') return null;
    const name = text(command.name || command.ef_txt || command.command);
    if (!name) return null;
    return { name, description: text(command.description || command.desc || command.ef_desc), index: command.index ?? index };
  }
  function commandOptions(catalog = [], includeQuickKeys = false) {
    const seen = new Set();
    const extended = catalog.map(normalizeCommand).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)).filter((command) => {
      const identity = command.name.toLowerCase();
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }).slice(0, 120).map((command) => freeze({ key: `${command.name}\n`, label: `#${command.name}`, text: command.description || 'Extended command', filterText: `extended #${command.name} ${command.description}`, className: 'command-help-choice', hint: `#${command.name}` }));
    if (!includeQuickKeys) return freeze(extended);
    const quick = [
      ['o\n', 'Open', 'Open doors and containers', 'O key'],
      ['c\n', 'Close', 'Close doors', 'C key'],
      ['s\n', 'Search', 'Search nearby spaces', 'S key'],
      [',\n', 'Pick up', 'Pick up objects here', ', key'],
      ['i\n', 'Inventory', 'Show carried inventory', 'I key'],
      ['Z\n', 'Cast spell', 'Cast a known spell', 'Z key'],
    ].map(([key, label, copy, hint]) => freeze({ key, label, text: copy, filterText: `${label} ${copy}`, className: 'command-help-choice', hint }));
    return freeze([...quick, ...extended]);
  }

  function buildPromptInteraction(prompt, cachedInventoryChoices = [], input = {}) {
    if (!prompt) return freeze({ kind: 'none', family: 'document', options: [] });
    const query = String(prompt.query || '');
    if (prompt.kind === 'question') {
      const classification = isDirectionPrompt(query) ? 'direction' : (isItemClassPrompt(query, prompt.choices) ? 'item-class' : (isInventoryActionPrompt(query, prompt.choices) ? 'inventory' : (isFixedChoicePrompt(query, prompt.choices) ? 'confirmation' : 'question')));
      const inventoryRows = classification === 'inventory' ? inventoryRowsForPrompt(prompt, cachedInventoryChoices) : [];
      const classRows = classification === 'item-class' ? itemClassOptions(query, prompt.choices) : [];
      const existing = new Set(inventoryRows.map((row) => row.key));
      const selectorRows = classification === 'inventory' && !promptRequiresNamedInventoryRows(query) ? selectorFallbackOptions(query, prompt.choices, existing) : [];
      const specialRows = selectorRows.filter((row) => !row.nameUnavailable);
      const fallbackRows = inventoryRows.length ? [] : selectorRows.filter((row) => row.nameUnavailable);
      const options = inventoryRows.length ? [...specialRows.filter((row) => row.key === '-' || row.key === '$'), ...inventoryRows, ...specialRows.filter((row) => row.key !== '-' && row.key !== '$')] : (classRows.length ? classRows : (fallbackRows.length || specialRows.length ? [...specialRows, ...fallbackRows] : choiceButtonOptions(query, prompt.choices)));
      const offer = shopOfferInfo(query);
      return freeze({
        kind: classification === 'direction' ? 'direction' : 'question', classification,
        family: dialogFamilyForPrompt(prompt, cachedInventoryChoices),
        title: promptTitle(prompt, classification, inventoryRows.length > 0),
        prompt: offer?.prompt || publicCopy(query) || 'Choose an answer.',
        options, inventoryRows, classRows, fallbackRows, specialRows,
        requiresNamedInventoryRows: classification === 'inventory' && promptRequiresNamedInventoryRows(query),
        shouldRequestInventory: classification === 'inventory' && !inventoryRows.length && selectorSet(query, prompt.choices).has('?'),
        textEntry: options.length > Number(input.smallFixedOptionLimit || 4) && (inventoryRows.length > 0 || fallbackRows.length > 0 || classRows.length > 0),
        serious: Boolean(seriousPromptProfile(query)), offer: offer || undefined,
        actionVerb: inventoryActionVerb(query), filters: objectActionFilters(query),
        cancellation: cancellationPlanForPrompt(prompt), requestId: requestId(prompt), lifecycleRevision: lifecycleRevision(prompt),
      });
    }
    if (prompt.kind === 'line input') {
      const classRows = isItemClassPrompt(query, prompt.choices) ? itemClassOptions(query, prompt.choices) : [];
      const commandHelp = !classRows.length && isCommandHelpPrompt(query);
      const options = classRows.length ? classRows : (commandHelp ? commandOptions(input.extCommandCatalog || [], true) : []);
      return freeze({ kind: 'line-input', classification: classRows.length ? 'item-class' : (commandHelp ? 'command-help' : 'text'), family: 'form', title: classRows.length ? 'Choose item class' : lineInputTitle(prompt), prompt: publicCopy(query) || 'Type your answer.', options, classRows, textEntry: true, engravingText: /engrave|write in|write on/i.test(query), wishText: /wish/i.test(query), cancellation: cancellationPlanForPrompt(prompt), requestId: requestId(prompt), lifecycleRevision: lifecycleRevision(prompt) });
    }
    if (prompt.kind === 'extended command') return freeze({ kind: 'extended-command', classification: 'extended-command', family: 'command', title: 'Extended command (#)', prompt: publicCopy(query) || 'Choose an extended command.', options: commandOptions(input.extCommandCatalog || []), textEntry: true, cancellation: cancellationPlanForPrompt(prompt), requestId: requestId(prompt), lifecycleRevision: lifecycleRevision(prompt) });
    return freeze({ kind: 'menu-prompt', classification: prompt.kind || 'unknown', family: dialogFamilyForPrompt(prompt, cachedInventoryChoices), prompt: publicCopy(query), options: [], cancellation: cancellationPlanForPrompt(prompt), requestId: requestId(prompt), lifecycleRevision: lifecycleRevision(prompt) });
  }
  function menuFilterPlan(kind, prompt) {
    if (kind === 'options') return freeze({ heading: 'Settings', filters: freeze([freeze(['all', 'All options']), freeze(['toggles', 'Toggles']), freeze(['values', 'Value options'])]) });
    if (kind !== 'spell') return freeze({ heading: '', filters: freeze([]) });
    const skill = /skill|enhance|advance/i.test(String(prompt || ''));
    return skill
      ? freeze({ heading: 'Skills', filters: freeze([freeze(['all', 'All skills']), freeze(['advance', 'Can advance']), freeze(['restricted', 'Restricted'])]) })
      : freeze({ heading: 'Spells', filters: freeze([freeze(['all', 'All spells']), freeze(['castable', 'Low failure']), freeze(['risky', 'High failure'])]) });
  }
  function menuFilterTags(kind, item, prompt) {
    const value = text(item?.text);
    const tags = ['all'];
    if (kind === 'spell' && /skill|enhance|advance/i.test(String(prompt || ''))) {
      if (/can advance|advance/i.test(value)) tags.push('advance');
      if (/restricted/i.test(value)) tags.push('restricted');
    } else if (kind === 'spell') {
      const failure = Number(value.match(/Fail\s*(\d+)/i)?.[1]);
      if (!Number.isFinite(failure) || failure < 50) tags.push('castable');
      if (Number.isFinite(failure) && failure >= 50) tags.push('risky');
    } else if (kind === 'options') {
      if (/\bToggle\b/i.test(value)) tags.push('toggles');
      if (/\bChange\b|\b(?:true|false|on|off|yes|no|\$|pickup_types)\b/i.test(value)) tags.push('values');
    }
    return freeze(tags);
  }

  function buildMenuInteraction(menu, input = {}) {
    if (!menu || !Array.isArray(menu.items) || !menu.items.length) return freeze({ kind: 'none', options: [], selectable: [] });
    const kind = menuKind(menu);
    const hasSelection = Boolean(Number(menu.how || 0));
    const multi = Number(menu.how || 0) === 2;
    const actionPrompt = kind === 'inventory' && /^Menu$/i.test(text(menu.prompt)) ? text(input.lastInventoryActionQuery) : '';
    const filterPlan = menuFilterPlan(kind, menu.prompt);
    const selectable = menu.items.filter((item) => Number(item.selector) > 0).slice(0, 120).map((item) => freeze({ ...item, key: selectorCharacter(item.selector), itemClass: menuItemClass(item), itemName: menuItemName(item), itemState: menuItemState(item.text), filterTags: menuFilterTags(kind, item, menu.prompt) }));
    const title = menuTitle(menu, kind, hasSelection, actionPrompt);
    const prompt = !hasSelection && isReadOnlyInformationalMenu(menu) ? (/^Tip$/i.test(title) ? 'Review this tip, then choose Continue to return to the map.' : 'Review this information, then choose Continue to return to the map.') : menuCopy(menu, kind, multi, hasSelection, actionPrompt);
    return freeze({ kind, classification: kind, family: dialogFamilyForMenu(menu), title, prompt, selectable, options: selectable, filters: filterPlan.filters, filterHeading: filterPlan.heading, hasSelection, multi, readOnly: isReadOnlyInformationalMenu(menu), suppressPicker: Boolean(menu.suppressPicker), awaitingSelection: Boolean(menu.awaitingSelection), shopPayment: isShopPaymentMenu(menu), cancellation: cancellationPlanForMenu(menu), requestId: requestId(menu), lifecycleRevision: lifecycleRevision(menu) });
  }

  function cellTokens(cell = {}) {
    return [...(cell.actionAffordances || []), ...(cell.backgroundActionAffordances || []), ...(cell.objectLayerActionAffordances || [])].map(text).filter(Boolean);
  }
  function cellSignature(cell = {}) {
    return publicCopy([cell.ch, cell.backgroundGlyph, cell.semanticKind, cell.semanticName, cell.semanticAppearance, cell.backgroundSemanticKind, cell.backgroundSemanticName, cell.objectLayerSemanticKind, cell.objectLayerSemanticName, cell.objectLayerSemanticAppearance, ...cellTokens(cell)].join(' ')).toLowerCase();
  }
  function isEngulfmentCell(cell = {}) {
    return String(cell.semanticKind || '').toLowerCase() === 'engulfment';
  }
  function cellHas(cell, token) { return cellTokens(cell).includes(token) || cellSignature(cell).includes(token); }
  function groundPileAt(gameView, cursor) {
    const piles = gameView?.groundPiles?.pilesByCoord;
    return piles?.get?.(`${cursor.x},${cursor.y}`) || piles?.get?.(Object.freeze({ x: cursor.x, y: cursor.y })) || null;
  }
  function contextFacts(input = {}) {
    const gameView = input.gameView || {};
    const cursor = gameView.cursor || { x: 0, y: 0 };
    const currentCell = gameView.mapCells?.[cursor.y]?.[cursor.x] || {};
    const pile = groundPileAt(gameView, cursor);
    const hint = input.groundHint && input.groundHint.x === cursor.x && input.groundHint.y === cursor.y ? input.groundHint : null;
    const pileItems = (pile?.items || []).filter(Boolean);
    const groundTexts = [];
    for (const item of pileItems) groundTexts.push(text(item.displayName || item.text || item.semanticName || item.semanticAppearance));
    for (const item of hint?.items || []) groundTexts.push(text(item));
    if (!pile && gameView.currentMenu?.suppressPicker && isGroundLookMenu(gameView.currentMenu)) for (const item of gameView.currentMenu.items || []) groundTexts.push(menuItemName(item));
    if (!groundTexts.length && /\b(?:object|food|corpse|item|container|chest|box|bag|sack)\b/.test(cellSignature(currentCell))) groundTexts.push(text(currentCell.objectLayerSemanticName || currentCell.semanticName || currentCell.semanticAppearance));
    const uniqueGroundTexts = [...new Set(groundTexts.filter(Boolean).map((value) => value.replace(/\s+/g, ' ').trim()))];
    let engulfed = false;
    for (let y = Math.max(0, cursor.y - 1); !engulfed && y <= Math.min((gameView.mapHeight || 21) - 1, cursor.y + 1); y += 1) {
      for (let x = Math.max(0, cursor.x - 1); x <= Math.min((gameView.mapWidth || 80) - 1, cursor.x + 1); x += 1) {
        if ((x !== cursor.x || y !== cursor.y) && isEngulfmentCell(gameView.mapCells?.[y]?.[x])) {
          engulfed = true;
          break;
        }
      }
    }
    const terrainText = `${input.terrainLabel || ''} ${cellSignature(currentCell)}`.toLowerCase();
    return { gameView, cursor, currentCell, pile, pileItems, groundTexts: uniqueGroundTexts, terrainText, engulfed };
  }
  function stairDirection(cell = {}) {
    const value = cellSignature(cell);
    if (!/\bstairs?\b|\bstaircase\b|\bladder\b/.test(value)) return '';
    if (/\bladder\b/.test(value) && /\bdown\b|down-ladder|ladder down/.test(value)) return 'ladder-down';
    if (/\bladder\b/.test(value) && /\bup\b|up-ladder|ladder up/.test(value)) return 'ladder-up';
    if (/\bdown\b|down-stairs|staircase down|branch staircase down/.test(value)) return 'down';
    if (/\bup\b|up-stairs|staircase up|branch staircase up/.test(value)) return 'up';
    return '';
  }
  function containerLabel(value) {
    if (/\blarge box\b/i.test(value)) return 'large box';
    if (/\bice box\b/i.test(value)) return 'ice box';
    if (/\bchest\b/i.test(value)) return 'chest';
    if (/\bbox\b/i.test(value)) return 'box';
    if (/\bsack\b/i.test(value)) return 'sack';
    if (/\bbag\b/i.test(value)) return 'bag';
    return 'container';
  }
  function publicInventoryItems(gameView) { return gameView?.inventory?.orderedItems || gameView?.cachedInventoryChoices || []; }
  function selectorForItem(item) { return item?.letter || item?.selectorKey || selectorCharacter(item?.selector); }
  function actionsForCurrentSquare(input, facts) {
    if (facts.engulfed) return [];
    const actions = [];
    const groundText = facts.groundTexts.join(' ');
    const groundTokens = new Set(facts.pileItems.flatMap((item) => item.actionAffordances || []));
    const hasGround = facts.pile ? facts.pileItems.length > 0 : Boolean(groundText);
    if (hasGround) actions.push({ id: 'pickup', label: 'Pick up', command: 'ground-panel', primary: true });
    if (ediblePattern.test(groundText)) actions.unshift({ id: 'eat-ground', label: /corpse/i.test(groundText) ? 'Eat corpse' : 'Eat food', command: 'key', key: 'e', primary: true });
    const stairs = stairDirection(facts.currentCell);
    if (stairs === 'down') actions.unshift({ id: 'descend', label: 'Go down stairs', command: 'terrain-action', action: 'stairsDown', terrain: 'stairs.down', primary: true });
    if (stairs === 'up') actions.unshift({ id: 'ascend', label: 'Go up stairs', command: 'terrain-action', action: 'stairsUp', terrain: 'stairs.up', primary: true });
    if (stairs === 'ladder-up') actions.unshift({ id: 'ascend-ladder', label: 'Go up ladder', command: 'terrain-action', action: 'ladderUp', terrain: 'ladder.up', primary: true });
    const dipTerrain = /fountain/.test(facts.terrainText) ? 'fountain' : (/sink/.test(facts.terrainText) ? 'sink' : (/\b(?:pool|moat|water)\b/.test(facts.terrainText) ? 'water' : (/lava/.test(facts.terrainText) ? 'lava' : '')));
    if (/fountain/.test(facts.terrainText)) actions.push({ id: 'drink-fountain', label: 'Drink from fountain', command: 'terrain-action', action: 'drink', terrain: 'fountain', primary: true });
    if (dipTerrain === 'fountain') actions.push({ id: 'dip-terrain', label: 'Dip item in fountain', command: 'terrain-dip', action: 'dip', terrain: 'fountain', targetDisplayName: 'fountain' });
    if (/sink/.test(facts.terrainText)) actions.push({ id: 'drink-sink', label: 'Drink from sink', command: 'key', key: 'q', primary: true }, { id: 'kick-sink', label: 'Kick sink', command: 'key', key: '\u0004' });
    if (/altar/.test(facts.terrainText)) actions.push({ id: 'offer', label: 'Offer sacrifice', command: 'ext', ext: 'offer', primary: true }, { id: 'pray', label: 'Pray at altar', command: 'ext', ext: 'pray' }, { id: 'drop-altar', label: 'Drop for identification', command: 'key', key: 'd' });
    const containerText = `${groundText} ${cellSignature(facts.currentCell)}`;
    const looksLikeContainer = groundTokens.has('container') || containerPattern.test(groundText || cellSignature(facts.currentCell));
    if (looksLikeContainer) {
      const label = containerLabel(containerText);
      const directItem = facts.pileItems.find((item) => Number.isInteger(item?.objectId) && item.objectId > 0 && (item.actionAffordances || []).includes('container'));
      if (directItem) actions.push({ id: 'open-container', label: label === 'bag' || label === 'sack' ? `Loot ${label}` : `Open ${label}`, command: 'ext', ext: 'loot', primary: true, targetObjectId: directItem.objectId });
      actions.push({ id: 'tip-container', label: 'Tip', command: 'ext', ext: 'tip' });
      if (/\blocked\b/i.test(groundText)) actions.push({ id: 'force-container', label: 'Force lock', command: 'ext', ext: 'force' });
      if (/\btrapped\b/i.test(groundText)) actions.push({ id: 'untrap-container', label: 'Untrap', command: 'ext', ext: 'untrap', primary: true });
    }
    if (/engraving|grave|floor|room floor|corridor|\./.test(facts.terrainText)) actions.push({ id: 'engrave', label: 'Engrave', command: 'key', key: 'E' });
    return actions;
  }
  function shopkeeperId(cell) { return cellTokens(cell).map((token) => token.match(/^monster\.shopkeeper\.id\.(\d+)$/)?.[1]).find(Boolean) || ''; }
  function actionsForAdjacentSquare(input, facts, x, y) {
    const dx = x - facts.cursor.x; const dy = y - facts.cursor.y;
    const direction = directionKeys[`${dx},${dy}`];
    if (!direction) return [];
    const cell = facts.gameView.mapCells?.[y]?.[x] || {};
    if (isEngulfmentCell(cell)) return [];
    const signature = cellSignature(cell);
    const labelDirection = directionLabels[direction];
    const actions = [];
    const objectLike = /^(?:object|item)$/i.test(String(cell.semanticKind || ''));
    const closedDoor = !objectLike && (cell.ch === '+' || /closed door|locked door|door.*closed|trapped door/.test(signature) || cellHas(cell, 'door.closed') || cellHas(cell, 'door.locked') || cellHas(cell, 'door.trapped'));
    const openDoor = !objectLike && (cell.ch === '/' || /open door/.test(signature) || cellHas(cell, 'door.open'));
    if (closedDoor) {
      actions.push({ id: `open-${direction}`, label: `Open ${labelDirection} door`, command: 'direction', key: 'o', direction, primary: true });
      actions.push({ id: `kick-door-${direction}`, label: `Kick ${labelDirection} door`, command: 'kick-direction', direction });
      if (cellHas(cell, 'door.locked') || /\b(?:locked|resists|stuck)\b/.test(signature)) actions.push({ id: `force-door-${direction}`, label: `Force ${labelDirection} lock`, command: 'ext-direction', ext: 'force', direction });
    }
    if (openDoor) actions.push({ id: `close-${direction}`, label: `Close ${labelDirection} door`, command: 'direction', key: 'c', direction });
    if (containerPattern.test(signature)) actions.push({ id: `kick-container-${direction}`, label: `Kick ${labelDirection} ${containerLabel(signature)}`, command: 'kick-direction', direction });
    const creature = /\b(?:pet|peaceful|tame|kitten|dog|cat|pony|horse|monster|creature|shopkeeper)\b/.test(signature) && !/\bplayer\b/.test(signature);
    if (creature) {
      const shopkeeper = cellHas(cell, 'monster.shopkeeper') || /\bshopkeeper\b/.test(signature);
      const creatureLabel = shopkeeper ? 'shopkeeper' : (/pet|tame|kitten|dog|cat|pony|horse/.test(signature) ? 'pet' : 'creature');
      actions.push({ id: `chat-${direction}`, label: `Chat with ${labelDirection} ${creatureLabel}`, command: 'ext-direction', ext: 'chat', direction, primary: shopkeeper || /pet|tame|peaceful/.test(signature) });
      if (shopkeeper) {
        const recipientId = shopkeeperId(cell);
        const adjacentIds = new Set();
        for (let yy = Math.max(0, facts.cursor.y - 1); yy <= Math.min((facts.gameView.mapHeight || 21) - 1, facts.cursor.y + 1); yy += 1) for (let xx = Math.max(0, facts.cursor.x - 1); xx <= Math.min((facts.gameView.mapWidth || 80) - 1, facts.cursor.x + 1); xx += 1) { const id = shopkeeperId(facts.gameView.mapCells?.[yy]?.[xx] || {}); if (id) adjacentIds.add(id); }
        const ownerToken = `shop.unpaid.owner.${recipientId}`;
        const unpaid = publicInventoryItems(facts.gameView).filter((item) => (item.actionAffordances || []).includes('shop.unpaid') && (item.actionAffordances || []).includes(ownerToken));
        const count = unpaid.reduce((total, item) => total + (Number.isSafeInteger(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1), 0);
        if (recipientId && adjacentIds.size === 1 && count) actions.push({ id: `pay-shopkeeper-${direction}-${recipientId}`, label: `Pay shopkeeper (${count} item${count === 1 ? '' : 's'})`, command: 'ext', ext: 'pay', direction, recipientId, primary: true, unpaidItemCount: count });
      } else if (!/pet|tame|peaceful/.test(signature)) actions.push({ id: `fight-${direction}`, label: `Attack ${labelDirection} creature`, command: 'direction', key: 'F', direction });
    }
    return actions;
  }
  function buildContextActions(input = {}) {
    const facts = contextFacts(input);
    const actions = [{ id: 'search', label: 'Search', command: 'key', key: 's', primary: true }, { id: 'wait', label: 'Wait', command: 'keys', keys: 'm.' }];
    if (input.running && input.playable !== false) {
      actions.unshift(...actionsForCurrentSquare(input, facts));
      for (let y = Math.max(0, facts.cursor.y - 1); y <= Math.min((facts.gameView.mapHeight || 21) - 1, facts.cursor.y + 1); y += 1) for (let x = Math.max(0, facts.cursor.x - 1); x <= Math.min((facts.gameView.mapWidth || 80) - 1, facts.cursor.x + 1); x += 1) if (x !== facts.cursor.x || y !== facts.cursor.y) actions.push(...actionsForAdjacentSquare(input, facts, x, y));
      actions.push({ id: 'more', label: 'More / advanced…', command: 'more' });
    }
    const seen = new Set();
    const unique = actions.filter((action) => action.id && action.label && !seen.has(action.id) && seen.add(action.id)).map((action) => freeze({ ...action, title: action.id.startsWith('pay-shopkeeper-') ? `Open the current NetHack shop bill for ${action.unpaidItemCount} unpaid item${action.unpaidItemCount === 1 ? '' : 's'}. You can review and choose items before paying.` : (action.id === 'open-container' ? `${action.label}; opens the container.` : (action.command === 'direction' ? `${action.label}; then choose a direction.` : (/^ext/.test(action.command) ? `${action.label}; follow-up choices appear here.` : action.label))) }));
    return freeze([...unique.filter((action) => action.id.startsWith('pay-shopkeeper-')), ...unique.filter((action) => !action.id.startsWith('pay-shopkeeper-'))].slice(0, 12));
  }

  const attitudes = Object.freeze(['tame', 'peaceful', 'hostile']);
  function explicitAttitude(value) { const attitude = text(value).toLowerCase(); return attitudes.includes(attitude) ? attitude : undefined; }
  function attitudeFromPublicCell(cell = {}) {
    const direct = explicitAttitude(cell.publicAttitude); if (direct) return direct;
    const tokens = new Set(cellTokens(cell));
    if (tokens.has('monster.attitude.tame') || tokens.has('monster.pet')) return 'tame';
    if (tokens.has('monster.attitude.peaceful')) return 'peaceful';
    if (tokens.has('monster.attitude.hostile')) return 'hostile';
    return undefined;
  }
  function normalizePublicAction(action = {}) {
    const id = text(action.id); const label = text(action.label);
    if (!id || !label) throw new TypeError('public context actions require id and label');
    return freeze({ id, label, kind: action.kind === 'attack' ? 'attack' : (action.kind === 'chat' ? 'chat' : 'other'), danger: action.danger === 'serious' ? 'serious' : (action.danger === 'caution' ? 'caution' : 'none'), primaryEligible: action.primaryEligible !== false, ...(action.publicShortcut ? { publicShortcut: text(action.publicShortcut) } : {}), ...(action.dispatchToken ? { dispatchToken: text(action.dispatchToken) } : {}) });
  }
  function creaturePolicy(attitude, actions) {
    const normalized = actions.map(normalizePublicAction); const chat = normalized.find((action) => action.kind === 'chat'); const attack = normalized.find((action) => action.kind === 'attack');
    const primary = ((attitude === 'tame' || attitude === 'peaceful') && chat?.primaryEligible) ? chat : (attitude === 'hostile' && attack?.primaryEligible ? attack : undefined);
    const secondary = []; const dangerous = [];
    for (const action of normalized) { if (action === primary) continue; if (action.kind === 'attack' && (attitude === 'tame' || attitude === 'peaceful')) dangerous.push(freeze({ ...action, danger: 'serious', confirmationRequired: true })); else if (action.danger === 'serious') dangerous.push(action); else secondary.push(action); }
    return freeze({ ...(primary ? { primary } : {}), secondary, dangerous, attitudeKnown: Boolean(attitude) });
  }
  function groupCreatureActions(inputs = []) {
    const seen = new Set();
    const targets = inputs.map((input) => {
      const targetId = text(input.targetId); const publicLabel = text(input.publicLabel); const direction = text(input.direction).toLowerCase();
      if (!targetId || !publicLabel) throw new TypeError('creature targets require stable targetId and publicLabel');
      if (seen.has(targetId)) throw new TypeError(`duplicate creature target: ${targetId}`); seen.add(targetId);
      if (direction && !Object.values(directionLabels).includes(direction)) throw new TypeError(`unsupported creature direction: ${direction}`);
      const publicAttitude = explicitAttitude(input.publicAttitude); return freeze({ targetId, publicLabel, ...(direction ? { direction } : {}), ...(publicAttitude ? { publicAttitude } : {}), policy: creaturePolicy(publicAttitude, Array.isArray(input.publicActions) ? input.publicActions : []) });
    });
    if (!targets.length) return freeze({ visible: false, targets: [], primary: undefined });
    if (targets.length === 1) return freeze({ visible: true, label: 'Creature', targets, selectedTargetId: targets[0].targetId, primary: targets[0].policy.primary, secondary: targets[0].policy.secondary, dangerous: targets[0].policy.dangerous, chooserRequired: false });
    return freeze({ visible: true, label: 'Creature', targets, primary: { id: 'creature.choose-target', label: 'Choose creature', kind: 'chooser', danger: 'none', primaryEligible: true }, secondary: [], dangerous: [], chooserRequired: true });
  }
  function selectCreatureTarget(group, targetId) {
    const target = group?.targets?.find((entry) => entry.targetId === text(targetId));
    if (!target) throw new RangeError(`unknown creature target: ${text(targetId) || '(empty)'}`);
    return freeze({ ...group, selectedTargetId: target.targetId, primary: target.policy.primary, secondary: target.policy.secondary, dangerous: target.policy.dangerous, chooserRequired: false });
  }

  function buildContextDialog(input = {}) {
    const prompt = input.contextualPrompt;
    if (!prompt) return freeze({ kind: 'none', options: [] });
    if (prompt.kind === 'map-cell') {
      const game = input.gameView || {};
      const x = Number(prompt.x);
      const y = Number(prompt.y);
      const direction = text(prompt.direction);
      const sameCell = Number(game.cursor?.x) === x && Number(game.cursor?.y) === y;
      const options = [];
      if (sameCell && (game.groundPiles?.revision || input.groundHint?.items?.length)) options.push(freeze({ id: 'map.pickup', label: 'Pick up here', text: 'Open the ground item list.', primary: true }));
      if (direction) {
        options.push(freeze({ id: 'map.walk', label: 'Walk here', text: `Move ${direction.toUpperCase()} to this adjacent cell.`, primary: true }));
        options.push(freeze({ id: 'map.open', label: 'Open toward cell', text: 'Open a door or container in that direction.' }));
        options.push(freeze({ id: 'map.close', label: 'Close toward cell', text: 'Close a door in that direction.' }));
        options.push(freeze({ id: 'map.kick', label: 'Kick toward cell', text: 'Kick a door, boulder, or monster in that direction.' }));
      } else if (!sameCell) {
        options.push(freeze({ id: 'map.travel', label: 'Travel here', text: 'Start NetHack travel and move the targeting cursor to this map cell.', primary: true }));
      }
      options.push(freeze({ id: 'map.ignore', label: 'Ignore', text: 'Close this action sheet without sending a command.' }));
      const targetName = publicCopy(prompt.targetName) || `map ${x},${y}`;
      return freeze({ kind: 'map-cell', family: 'command', title: 'Map cell actions', prompt: `Actions for ${targetName} at ${x},${y}.`, options, cancellation: freeze({ key: '', kind: 'close-context', acknowledgementEvent: '', canonicalChoice: false }) });
    }
    if (prompt.kind !== 'locked-door') return freeze({ kind: 'none', options: [] });
    const directionLabel = text(prompt.directionLabel);
    const door = directionLabel ? `${directionLabel} door` : 'door';
    const tools = (prompt.tools || []).filter((tool) => text(tool.selector) && text(tool.label));
    const unlock = tools.map((tool, index) => freeze({
      id: `unlock:${text(tool.selector)}`,
      label: `Unlock with ${text(tool.label)}`,
      text: directionLabel ? `Apply your ${text(tool.label)} to the ${door}.` : `Apply your ${text(tool.label)}; NetHack will ask which door direction.`,
      primary: index === 0,
      toolSelector: text(tool.selector),
    }));
    const options = [
      ...unlock,
      freeze({ id: 'kick', label: 'Kick door', text: directionLabel ? `Try kicking the ${door}.` : 'NetHack will ask which direction.', primary: !unlock.length }),
      freeze({ id: 'search', label: 'Search nearby', text: 'Spend a turn searching for hidden doors or traps.' }),
      freeze({ id: 'close', label: 'Close', text: 'Close this suggestion without sending a command.' }),
    ];
    return freeze({ kind: 'locked-door', family: 'command', title: 'Locked door actions', prompt: `${publicCopy(prompt.message) || 'The door is locked.'}\nChoose an action.`, options, cancellation: freeze({ key: '', kind: 'close-context', acknowledgementEvent: '', canonicalChoice: false }) });
  }

  function ownerPlan(input, promptPlan, menuPlan) {
    const prompt = input.gameView?.activePrompt; const menu = input.gameView?.currentMenu; const transfer = input.transfer || {}; const equipment = input.equipment || {};
    const promptIsMenu = menuPromptKinds.has(prompt?.kind);
    if (prompt && !promptIsMenu && !transfer.ownsPrompt && !equipment.ownsPrompt) return freeze({ kind: 'prompt', id: requestId(prompt) || `prompt-r${lifecycleRevision(prompt)}`, requestId: requestId(prompt), priority: 500 });
    if (equipment.ownsPrompt || equipment.ownsMenu) return freeze({ kind: 'equipment', id: text(equipment.id) || requestId(prompt) || requestId(menu) || 'equipment', requestId: requestId(prompt) || requestId(menu), priority: 450 });
    if (transfer.ownsPrompt || transfer.ownsMenu) return freeze({ kind: 'transfer', id: text(transfer.id) || requestId(menu) || requestId(prompt) || 'transfer', requestId: requestId(menu) || requestId(prompt), priority: 400 });
    if (menu?.awaitingSelection && menuPlan.kind !== 'none') return freeze({ kind: 'menu', id: requestId(menu) || `menu-r${lifecycleRevision(menu)}`, requestId: requestId(menu), priority: 300 });
    if (prompt) return freeze({ kind: 'prompt', id: requestId(prompt) || `prompt-r${lifecycleRevision(prompt)}`, requestId: requestId(prompt), priority: 250 });
    if (input.contextualPrompt) return freeze({ kind: 'context-dialog', id: text(input.contextualPrompt.kind) || 'context-dialog', requestId: '', priority: 200 });
    return freeze({ kind: 'gameplay', id: 'gameplay', requestId: '', priority: 100 });
  }
  function signatureFor(input) {
    const game = input.gameView || {};
    const prompt = game.activePrompt || {};
    const menu = game.currentMenu || {};
    const context = input.contextualPrompt || {};
    const catalog = input.extCommandCatalog || game.extCommandCatalog || [];
    return JSON.stringify([
      game.interactionLifecycleRevision || 0,
      requestId(prompt), prompt.kind, prompt.query, prompt.choices,
      requestId(menu), menu.awaitingSelection, menu.how, menu.prompt, (menu.items || []).length,
      catalog.map((command) => command?.name || command?.ef_txt || command),
      input.transfer?.ownsPrompt, input.transfer?.ownsMenu,
      input.equipment?.ownsPrompt, input.equipment?.ownsMenu,
      context.kind, context.direction, context.label, context.message, context.tools, context.x, context.y, context.targetName,
      input.running, input.playable,
      game.mapRevision, game.inventory?.revision, game.groundPiles?.revision,
      game.cursor?.x, game.cursor?.y,
      input.terrainLabel, input.groundHint?.x, input.groundHint?.y, input.groundHint?.items,
      input.inventoryLoadState, input.lastInventoryActionQuery, input.workflowLabel, input.smallFixedOptionLimit,
    ]);
  }
  function createInteractionPlanner() {
    let sequence = 0; let previousIdentity = ''; let previousSignature = ''; let previousDecision = null;
    function decide(input = {}) {
      const signature = signatureFor(input);
      if (signature === previousSignature && previousDecision) return previousDecision;
      const gameView = input.gameView || {};
      const inventoryChoices = input.inventoryChoices || gameView.cachedInventoryChoices || [];
      const prompt = buildPromptInteraction(gameView.activePrompt, inventoryChoices, input);
      const menu = buildMenuInteraction(gameView.currentMenu, input);
      const owner = ownerPlan(input, prompt, menu);
      const identity = owner.kind === 'gameplay' ? '' : `${owner.kind}:${owner.id}`;
      const transition = !previousIdentity && identity ? 'opened' : (previousIdentity && !identity ? 'closed' : (previousIdentity !== identity ? 'replaced' : (identity ? 'updated' : 'idle')));
      const contextDialog = buildContextDialog(input);
      const cancellation = owner.kind === 'menu' || (owner.kind === 'transfer' && input.transfer?.ownsMenu)
        ? menu.cancellation
        : (owner.kind === 'prompt' || (owner.kind === 'transfer' && input.transfer?.ownsPrompt)
          ? prompt.cancellation
          : (owner.kind === 'context-dialog' ? contextDialog.cancellation : freeze({ key: '', kind: 'none', acknowledgementEvent: '', canonicalChoice: false })));
      const decision = freeze({ version, decisionSequence: ++sequence, interactionId: identity, transition, owner, prompt, menu, contextDialog, contextActions: buildContextActions(input), cancellation });
      previousIdentity = identity;
      previousSignature = signature;
      previousDecision = decision;
      return decision;
    }
    function reset() { sequence = 0; previousIdentity = ''; previousSignature = ''; previousDecision = null; }
    return Object.freeze({ version, decide, reset });
  }
  function planInteraction(input = {}) { return createInteractionPlanner().decide(input); }

  return Object.freeze({
    version,
    createInteractionPlanner,
    planInteraction,
    selectorSet,
    isDirectionPrompt,
    isLockedDoorMessage,
    isFixedChoicePromptChoices,
    isFixedChoicePrompt,
    isInventoryActionPrompt,
    isItemClassPrompt,
    isCommandHelpPrompt,
    inventoryTextRowActionMatches,
    menuKind,
    shouldCacheInventoryChoices,
    shouldSuppressPassiveGroundMenu,
    isGroundLookMenu,
    isReadOnlyInformationalMenu,
    isShopPaymentMenu,
    menuItemClass,
    menuItemState,
    menuItemName,
    menuTextWithoutSelector,
    cancellationPlanForPrompt,
    cancellationPlanForMenu,
    dialogFamilyForPrompt,
    dialogFamilyForMenu,
    inventoryRowsForPrompt,
    promptRequiresNamedInventoryRows,
    selectorFallbackOptions,
    itemClassOptions,
    choiceButtonOptions,
    buildPromptInteraction,
    buildMenuInteraction,
    buildContextActions,
    explicitAttitude,
    attitudeFromPublicCell,
    normalizePublicAction,
    groupCreatureActions,
    selectCreatureTarget,
  });
}));
