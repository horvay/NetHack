(function initInteractionModel(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./prompt-rules'), require('./tile-assets'));
  else root.NetHackInteractionModel = factory(root.NetHackPromptRules, root.NetHackTileAssets);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(PromptRules, TileAssets) {
  const version = 'nethack-interaction-model/v1';
  const inventoryActionPromptPattern = /what do you want to|what would you like to|which item|use or apply|write with|engrave with|drop|read|eat|quaff|apply|wield|wear|take off|remove|zap|throw|fire|drink|put on|write|engrave|quiver|rub|dip|invoke|offer|force|name|call|identify|what is|whatis/i;
  const itemClassLabels = Object.freeze({ '!': 'Potions', '?': 'Scrolls', '+': 'Spellbooks', '=': 'Rings', '"': 'Amulets', '/': 'Wands', '(': 'Tools', ')': 'Weapons', '[': 'Armor', '%': 'Food', '*': 'Gems/rocks', '$': 'Gold', '`': 'Boulders/statues', '_': 'Iron balls', '.': 'Current square', '#': 'Dungeon feature', '-': 'Nothing / bare hands' });
  function selectorSet(query, choices) {
    const selectors = new Set(String(choices || '').split('').filter((key) => /[A-Za-z$?*\-]/.test(key)));
    const bracket = String(query || '').match(/\[([^\]]+)\]/);
    const source = bracket ? bracket[1] : '';
    for (const range of source.match(/[A-Za-z$]-[A-Za-z$]/g) || []) {
      const [start, end] = range.split('-').map((letter) => letter.charCodeAt(0));
      for (let code = Math.min(start, end); code <= Math.max(start, end); code += 1) selectors.add(String.fromCharCode(code));
    }
    const compactSelectorRuns = source.replace(/\bor\b/ig, ' ').match(/[A-Za-z$?*\-]{2,}|[A-Za-z$?*\-]/g) || [];
    for (const run of compactSelectorRuns) {
      if (/^or$/i.test(run)) continue;
      for (const key of run.split('')) selectors.add(key);
    }
    for (const key of source.match(/\b[A-Za-z$]\b/g) || []) selectors.add(key);
    for (const key of PromptRules.selectorSet(query, choices)) selectors.add(key);
    return selectors;
  }
  function isDirectionPrompt(query) { return PromptRules.isDirectionPrompt(query); }
  function isFixedChoicePromptChoices(choices) {
    const raw = String(choices || '');
    if (!raw) return false;
    const withoutEsc = raw.replace(/\u001b/g, '');
    return /^[ynaqYNQA]+$/.test(withoutEsc) && /[ynYN]/.test(withoutEsc);
  }
  function isExplicitInventorySelectorQuestion(query) { return /what do you want to|what would you like to|which item|write with|engrave with|which object|what item/i.test(String(query || '')); }
  function isFixedChoicePrompt(query, choices) { return isFixedChoicePromptChoices(choices) && !isExplicitInventorySelectorQuestion(query); }
  function isInventoryActionPrompt(query, choices) { return !isFixedChoicePrompt(query, choices) && inventoryActionPromptPattern.test(String(query || '')) && selectorSet(query, choices).size > 0; }
  function isItemClassPrompt(query, choices) { return !isDirectionPrompt(query) && PromptRules.isItemClassPrompt(query, choices); }
  function hasSelectableRows(menu) { return (menu?.items || []).some((item) => item?.selector); }
  function isReadOnlyInformationalMenu(menu) { return Boolean(menu?.awaitingSelection) && !Number(menu?.how || 0) && !hasSelectableRows(menu); }
  function readOnlyMenuTitle(menu) {
    const prompt = String(menu?.prompt || '').trim();
    const firstRow = (menu?.items || []).map((item) => menuItemName(item?.text || '').trim()).find(Boolean) || '';
    const tipMatch = firstRow.match(/^Tip:\s*(.+)$/i) || prompt.match(/^Tip:\s*(.+)$/i);
    if (tipMatch) return 'Tip';
    if (/help|commands/i.test(`${prompt} ${firstRow}`)) return 'Help';
    if (prompt && !/^Menu$/i.test(prompt)) return prompt;
    return 'Review information';
  }
  function isExplicitTransferMenu(menu) {
    const prompt = String(menu?.prompt || '').toLowerCase();
    const selectable = hasSelectableRows(menu);
    if (!selectable || !Number(menu?.how || 0)) return false;
    if (/\b(?:pay for which items?|pay which (?:shop )?bill items?|which items? (?:do you want to )?pay for|itemized bill(?:ing)?)\b/.test(prompt)) return true;
    return /\b(?:loot|take out|put in|stash|container contents|from (?:the )?(?:chest|box|bag|sack)|into (?:the )?(?:chest|box|bag|sack))\b/.test(prompt);
  }
  function looksLikeSpellMenu(prompt, itemText) {
    // Real cast/skill menus: explicit spellcasting prompts or rows with power/failure metadata.
    // Do not treat inventory object nouns like "spellbook of healing" as spell menus.
    if (/choose which spell|cast (?:a |the )?spell|which spell|spell to cast|enhance (?:your )?skills?|which skill|skill points|advance (?:a |your )?skill/.test(prompt)) return true;
    if (/\b(?:pw|power)\s*[:=]?\s*\d+/.test(itemText) && /\bfail(?:ure)?\s*[:=]?\s*\d+/.test(itemText)) return true;
    if (/\b(?:unskilled|basic|skilled|expert|master|grand master)\b/.test(itemText) && /\bskill/.test(`${prompt} ${itemText}`)) return true;
    if (/\b(?:cast|enhance|advance)\b/.test(prompt) && !/\bspellbook\b/.test(itemText)) return true;
    return false;
  }
  function looksLikeInventoryChooser(prompt, itemText) {
    if (/do what with|what (?:do you want|would you like) to|which item|pick up what|drop what|take out what|put in what|inventory|possessions|things that are here/.test(prompt)) return true;
    if (/\b(?:identify|name|call|wear|wield|apply|eat|quaff|drink|read|zap|throw|fire|dip|rub|invoke|offer|force|remove|take off|put on|quiver)\b/.test(prompt)) return true;
    // Object-class inventory rows (including spellbooks/scrolls) without cast power metadata.
    if (/\b(?:spellbook|scroll|potion|wand|ring|amulet|food ration|dagger|sword|armor|corpse|gem|tool|towel)\b/.test(itemText)
      && !/\b(?:pw|power)\s*[:=]?\s*\d+/.test(itemText)
      && !/\bfail(?:ure)?\s*[:=]?\s*\d+/.test(itemText)) return true;
    return false;
  }
  function menuKind(menu) {
    const prompt = String(menu?.prompt || '').toLowerCase();
    const itemText = (menu?.items || []).slice(0, 8).map((item) => item.text || '').join(' ').toLowerCase();
    if (isReadOnlyInformationalMenu(menu)) return /help|commands/i.test(`${prompt} ${itemText}`) ? 'help' : 'menu';
    if (isExplicitTransferMenu(menu)) return 'transfer';
    if (/do what with/i.test(prompt)) return 'inventory';
    if (/\b(?:about|long description|list of game commands|history of nethack|info on a character|what a given key does|keyboard commands|extended commands|nethack license|help|commands)\b/.test(`${prompt} ${itemText}`)) return 'help';
    // Inventory choosers (identify, object pickers, etc.) must win over spell heuristics so
    // rows like "spellbook of healing" are not rendered as Cast spell rows.
    if (looksLikeInventoryChooser(prompt, itemText) && !looksLikeSpellMenu(prompt, itemText)) return 'inventory';
    if (looksLikeSpellMenu(prompt, itemText)) return 'spell';
    if (/option|autopickup|pickup_types|toggle/.test(`${prompt} ${itemText}`)) return 'options';
    if (/inventory|possessions|things that are here|pick up|drop|wear|wield|apply|eat|quaff|drink|read|zap|throw|do what with|potion|scroll|wand|spellbook|ring|amulet|food ration|corpse/.test(`${prompt} ${itemText}`)) return 'inventory';
    if (/help|commands/.test(prompt)) return 'help';
    return 'menu';
  }
  function shouldCacheInventoryChoices(menu) { return /inventory|possessions/.test(String(menu?.prompt || '').toLowerCase()); }
  function isGroundLookMenu(menu) { return /things that are here|you see here|there (?:is|are) here/.test(String(menu?.prompt || '').toLowerCase()); }
  function shouldSuppressPassiveGroundMenu(menu, how) { return Number(how || 0) === 0 && menuKind(menu) === 'inventory' && isGroundLookMenu(menu); }
  function menuItemClass(item) {
    const text = String(item?.text || '').toLowerCase();
    if (/weapon|sword|dagger|mace|axe|bow|arrow|dart|rock/.test(text)) return 'weapon';
    if (/armor|mail|helm|boots|gloves|cloak|shield/.test(text)) return 'armor';
    if (/potion|scroll|wand|spellbook|ring|amulet/.test(text)) return 'magic';
    if (/food|ration|corpse|apple|carrot|egg|tin/.test(text)) return 'food';
    if (/tool|marker|lamp|lantern|key|lock pick|pick-axe|pickaxe|bag|sack|box|chest|horn|whistle|towel|camera|stethoscope|can of oil|tinning kit|oil lamp/.test(text)) return 'tool';
    return '';
  }
  function menuItemState(text) {
    const publicText = String(text || '');
    if (/\(weapon in hands\)/i.test(publicText)) return 'weapon in hands';
    return publicText.match(/\((weapon in (?:hand|hands|left hand|right hand)|being worn|wielded|in quiver|on (?:left|right) hand|alternate weapon; not wielded)\)/i)?.[1] || '';
  }
  function menuItemName(text) { return String(text || '').replace(/^\s*[a-z$]\s*[-+]\s+/i, '').replace(/\s*\((?:weapon in (?:hand|hands|left hand|right hand)|being worn|wielded|in quiver|on (?:left|right) hand|alternate weapon; not wielded)\)\s*/ig, ' ').replace(/\s+/g, ' ').trim(); }
  function inventoryRowsForPrompt(prompt, cachedInventoryChoices = []) {
    if (!isInventoryActionPrompt(prompt?.query, prompt?.choices)) return [];
    const selectors = selectorSet(prompt.query, prompt.choices);
    return cachedInventoryChoices.filter((item) => selectors.has(String.fromCharCode(item.selector))).map((item) => ({ ...item, key: String.fromCharCode(item.selector), itemClass: menuItemClass(item), itemName: menuItemName(item.text), itemState: menuItemState(item.text) }));
  }
  function promptRequiresNamedInventoryRows(query) { return /\b(?:quaff|drink)\b/i.test(String(query || '')); }
  function selectorFallbackOptions(query, choices) {
    if (promptRequiresNamedInventoryRows(query)) return [];
    return Array.from(selectorSet(query, choices)).map((key) => ({ key, label: `Item ${key}`, text: 'Name unavailable.', className: 'letter-choice unavailable-item-choice' }));
  }
  function itemClassOptions(query, choices) {
    const source = String(choices || '') || (String(query || '').match(/\[([^\]]+)\]/)?.[1] || '!?+="/()[%*$');
    return Array.from(new Set(source.split('').filter((key) => key.trim() && key !== '[' && key !== ']'))).map((key) => ({ key, label: key, text: itemClassLabels[key] || `Object class ${key}`, className: 'class-choice' }));
  }
  function shopOfferInfo(query) {
    const text = String(query || '').replace(/\s+/g, ' ').trim();
    const match = text.match(/\boffers(?: only)?\s+(\d+)\s+gold piece(?:s)?\s+for\s+(?:the|your)\s+(.+?)\.\s*Sell\s+(it|them)\?/i);
    if (!match) return null;
    const lead = text.slice(0, match.index).trim();
    const offerSentence = text.slice(match.index, match.index + match[0].length).replace(/\.\s*Sell\s+(?:it|them)\?\s*$/i, '.');
    return { amount: match[1], item: match[2], pronoun: match[3].toLowerCase(), prompt: `${lead ? `${lead} ` : ''}${offerSentence}`.trim() };
  }
  function shopOfferPromptCopy(query) {
    const offer = shopOfferInfo(query);
    return offer?.prompt || String(query || '');
  }
  function shopOfferChoiceInfo(query, key) {
    const offer = shopOfferInfo(query);
    if (!offer) return null;
    const lowerKey = String(key).toLowerCase();
    if (lowerKey === 'y') return { label: 'Accept offer', note: `Sell ${offer.item}; receive ${offer.amount} gold.`, sort: 0, className: 'accept-choice' };
    if (lowerKey === 'n' || key === '\u001b') return { label: 'Decline offer', note: `Keep ${offer.item}.`, sort: 1, className: 'decline-choice' };
    if (lowerKey === 'a') return { label: 'Accept remaining offers', note: 'Accept this and later offers in this drop.', sort: 2, className: 'accept-choice secondary-offer-choice' };
    if (lowerKey === 'q') return { label: 'Stop selling', note: 'Decline this and remaining dropped items.', sort: 3, className: 'decline-choice secondary-offer-choice' };
    return null;
  }
  function yesNoChoiceLabel(key, query) {
    const def = String(query || '').match(/\[.*?\(([a-z?])\).*?\]/i)?.[1];
    const suffix = def && def.toLowerCase() === String(key).toLowerCase() ? ' (default)' : '';
    const shopOfferChoice = shopOfferChoiceInfo(query, key);
    if (shopOfferChoice) return `${shopOfferChoice.label}${suffix}`;
    const labels = { y: 'Yes', n: 'No', q: 'Quit', a: 'All', m: 'More', r: 'Rename', '?': 'Help/list', '*': 'List all', '\u001b': 'Cancel' };
    return `${labels[String(key).toLowerCase()] || String(key).toUpperCase()}${suffix}`;
  }
  function choiceButtonOptions(query, choices) {
    return String(choices || '').split('').filter(Boolean).map((key, index) => {
      const shopOfferChoice = shopOfferChoiceInfo(query, key);
      const label = yesNoChoiceLabel(key, query);
      const hint = key === '\u001b' ? 'Esc' : key;
      return { key, label, text: shopOfferChoice?.note || '', sort: shopOfferChoice ? shopOfferChoice.sort : index + 1, className: `letter-choice${shopOfferChoice?.className ? ` ${shopOfferChoice.className}` : ''}`, hint };
    }).sort((a, b) => (a.sort ?? 1) - (b.sort ?? 1));
  }
  function promptTitle(prompt, hasInventoryRows) {
    const q = String(prompt?.query || '');
    if (isDirectionPrompt(q)) return 'Choose direction';
    if (/write with|engrave with/i.test(q)) return 'Choose engraving tool';
    if (isItemClassPrompt(q, prompt?.choices) && !hasInventoryRows) return 'Choose item class';
    if (hasInventoryRows || isInventoryActionPrompt(q, prompt?.choices)) return 'Choose item';
    if (/name|call|annotate/i.test(q)) return 'Name item';
    if (shopOfferInfo(q)) return 'Shopkeeper offer';
    if (/\?\s*$/.test(q) && isFixedChoicePrompt(q, prompt?.choices)) return 'Confirm';
    return 'Question';
  }
  function lineInputTitle(prompt) {
    const q = String(prompt?.query || '');
    if (/engrave|write in|write on/i.test(q)) return 'Enter engraving text';
    if (/name|call|annotate/i.test(q)) return 'Name item';
    if (/what do you want to (read|eat|quaff|apply|zap|drop|throw|wear|wield|remove|write)/i.test(q)) return 'Choose item';
    if (/file|save/i.test(q)) return 'Name file';
    return 'Type answer';
  }
  function menuTitle(menu, kind = menuKind(menu), hasSelection = Boolean(menu?.how)) {
    const prompt = String(menu?.prompt || '');
    if (!hasSelection && isReadOnlyInformationalMenu(menu)) return readOnlyMenuTitle(menu);
    if (kind === 'transfer') {
      if (/pay|bill|shop|unpaid|price|debt/i.test(prompt)) return 'Shop payment';
      if (/loot|container|chest|box|bag|sack|tip/i.test(prompt)) return 'Container transfer';
      return 'Transfer items';
    }
    if (kind === 'spell') return /enhance|skill/i.test(prompt) ? 'Skills' : 'Spellbook';
    if (kind === 'options') return 'Options';
    if (kind === 'help') return 'Help';
    if (kind === 'inventory') {
      if (/do what with/i.test(prompt)) return 'Choose action';
      return /drop|read|eat|quaff|apply|wield|wear|take off|remove|zap|throw|fire|pick up|identify|name|call|what is|whatis|dip|rub|invoke|offer|force|quiver/i.test(prompt) ? 'Choose item' : 'Inventory';
    }
    if (/help|commands/i.test(prompt)) return 'Help';
    return hasSelection ? 'Choose option' : 'Review information';
  }
  function menuPrompt(menu, kind = menuKind(menu), multi = menu?.how === 2, hasSelection = Boolean(menu?.how)) {
    if (kind === 'transfer') return menu?.prompt || 'Transfer items';
    if (kind === 'spell') return menu?.prompt || 'Choose a spell or skill.';
    if (kind === 'options') return menu?.prompt || 'Choose an option.';
    if (kind === 'help') return menu?.prompt || 'Choose a help topic.';
    if (kind === 'inventory' && /pick up/i.test(String(menu?.prompt || ''))) return menu.prompt || 'Pick up items';
    if (kind === 'inventory' && /do what with/i.test(String(menu?.prompt || ''))) return menu?.prompt || 'Choose an action.';
    if (kind === 'inventory') return menu?.prompt || 'Choose item';
    return menu?.prompt || (multi ? 'Select items, then Confirm.' : (hasSelection ? 'Choose an option.' : 'Review information.'));
  }
  function buildPromptInteraction(prompt, cachedInventoryChoices = []) {
    if (!prompt) return { kind: 'none' };
    if (prompt.kind === 'question') {
      const direction = isDirectionPrompt(prompt.query);
      const itemClassPrompt = !direction && isItemClassPrompt(prompt.query, prompt.choices);
      const rows = itemClassPrompt ? [] : inventoryRowsForPrompt(prompt, cachedInventoryChoices);
      const classRows = itemClassPrompt ? itemClassOptions(prompt.query, prompt.choices) : [];
      const fallback = !rows.length && !classRows.length && isInventoryActionPrompt(prompt.query, prompt.choices) && !promptRequiresNamedInventoryRows(prompt.query) ? selectorFallbackOptions(prompt.query, prompt.choices) : [];
      return { kind: direction ? 'direction' : 'question', title: promptTitle(prompt, rows.length > 0), inventoryRows: rows, fallbackRows: fallback, classRows, options: rows.length ? rows : (classRows.length ? classRows : (fallback.length ? fallback : choiceButtonOptions(prompt.query, prompt.choices))), textEntry: rows.length || fallback.length || classRows.length, query: shopOfferInfo(prompt.query) ? shopOfferPromptCopy(prompt.query) : (prompt.query || 'Choose an answer.') };
    }
    if (prompt.kind === 'line input') {
      const classRows = isItemClassPrompt(prompt.query, prompt.choices) ? itemClassOptions(prompt.query, prompt.choices) : [];
      return { kind: 'line-input', title: classRows.length ? 'Choose item class' : lineInputTitle(prompt), classRows, options: classRows, query: prompt.query || 'Type your answer with the keyboard.', engravingText: /engrave|write in|write on/i.test(String(prompt.query || '')) };
    }
    if (prompt.kind === 'extended command') return { kind: 'extended-command', title: 'Extended command (#)', query: prompt.query || '', textEntry: true };
    if (prompt.kind === 'menu selection' || prompt.kind === 'read-only menu') return { kind: 'menu-prompt', query: prompt.query || '' };
    return { kind: prompt.kind || 'unknown', query: prompt.query || '' };
  }
  function buildMenuInteraction(menu) {
    if (!menu || !Array.isArray(menu.items) || !menu.items.length) return { kind: 'none' };
    const kind = menuKind(menu); const hasSelection = Boolean(menu.how); const multi = Number(menu.how) === 2;
    const selectable = menu.items.filter((item) => item.selector).slice(0, 80).map((item) => ({ ...item, key: String.fromCharCode(item.selector), itemClass: menuItemClass(item), itemName: menuItemName(item.text), itemState: menuItemState(item.text) }));
    return { kind, title: menuTitle(menu, kind, hasSelection), prompt: menuPrompt(menu, kind, multi, hasSelection), selectable, hasSelection, multi, suppressPicker: Boolean(menu.suppressPicker), awaitingSelection: Boolean(menu.awaitingSelection) };
  }
  return Object.freeze({ version, selectorSet, isDirectionPrompt, isFixedChoicePromptChoices, isFixedChoicePrompt, isInventoryActionPrompt, isItemClassPrompt, menuKind, shouldCacheInventoryChoices, shouldSuppressPassiveGroundMenu, menuItemClass, menuItemState, menuItemName, inventoryRowsForPrompt, promptRequiresNamedInventoryRows, selectorFallbackOptions, itemClassOptions, choiceButtonOptions, buildPromptInteraction, buildMenuInteraction, isReadOnlyInformationalMenu, readOnlyMenuTitle });
}));
