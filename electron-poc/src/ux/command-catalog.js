(function initUxCommandCatalog(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxCommandCatalog = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-command-catalog/v1';
  const categories = Object.freeze(['Items', 'Equipment', 'Magic', 'Dungeon', 'Character', 'Run', 'Help']);
  const promptPlans = Object.freeze(['none', 'item', 'direction', 'target', 'text', 'core-owned']);
  const dangerLevels = Object.freeze(['none', 'caution', 'serious']);
  const availabilityKinds = Object.freeze(['always', 'public-context', 'core-prompt-only']);
  const routeKinds = Object.freeze(['key', 'text', 'surface', 'provider']);

  const route = (kind, value, extra = {}) => Object.freeze({ kind, value, ...extra });
  const definition = (id, label, aliases, category, publicShortcut, internalRoute, extra = {}) => Object.freeze({
    id, label, aliases: Object.freeze(aliases), category, publicShortcut, internalRoute,
    promptPlan: 'none', danger: 'none', availability: 'always', recentEligible: true, ...extra,
  });

  const baseDefinitions = Object.freeze([
    definition('item.inventory', 'Inventory', ['items', 'carried items', 'possessions'], 'Items', 'i', route('key', 'i'), { promptPlan: 'core-owned' }),
    definition('item.pick-up', 'Pick up', ['pickup', 'take from floor'], 'Items', ',', route('key', ','), { promptPlan: 'item' }),
    definition('item.drop', 'Drop', ['leave item'], 'Items', 'd', route('key', 'd'), { promptPlan: 'item' }),
    definition('item.eat', 'Eat', ['food', 'consume food'], 'Items', 'e', route('key', 'e'), { promptPlan: 'item' }),
    definition('item.quaff', 'Quaff', ['drink', 'drink potion', 'potion'], 'Items', 'q', route('key', 'q'), { promptPlan: 'item' }),
    definition('item.read', 'Read', ['scroll', 'spellbook'], 'Items', 'r', route('key', 'r'), { promptPlan: 'item' }),
    definition('item.apply', 'Apply', ['use tool', 'tool'], 'Items', 'a', route('key', 'a'), { promptPlan: 'item' }),
    definition('item.zap', 'Zap', ['use wand', 'wand'], 'Items', 'z', route('key', 'z'), { promptPlan: 'item' }),
    definition('item.throw', 'Throw', ['throw item', 'toss'], 'Items', 't', route('key', 't'), { promptPlan: 'item' }),
    definition('item.fire', 'Fire from quiver', ['fire ammunition', 'shoot'], 'Items', 'f', route('key', 'f'), { promptPlan: 'target' }),
    definition('item.loot', 'Loot container', ['container', 'chest', 'bag'], 'Items', '#loot', route('text', '#loot\n'), { promptPlan: 'core-owned', availability: 'public-context' }),
    definition('equipment.wield', 'Wield', ['weapon', 'hold weapon'], 'Equipment', 'w', route('key', 'w'), { promptPlan: 'item' }),
    definition('equipment.swap', 'Swap weapon', ['alternate weapon', 'exchange weapon'], 'Equipment', 'x', route('key', 'x')),
    definition('equipment.wear', 'Wear armor', ['put on armor'], 'Equipment', 'W', route('key', 'W'), { promptPlan: 'item' }),
    definition('equipment.take-off', 'Take off armor', ['remove armor'], 'Equipment', 'T', route('key', 'T'), { promptPlan: 'item' }),
    definition('equipment.put-on', 'Put on accessory', ['wear ring', 'wear amulet'], 'Equipment', 'P', route('key', 'P'), { promptPlan: 'item' }),
    definition('equipment.remove', 'Remove accessory', ['remove ring', 'remove amulet'], 'Equipment', 'R', route('key', 'R'), { promptPlan: 'item' }),
    definition('equipment.quiver', 'Set quiver', ['ready ammunition', 'quiver item'], 'Equipment', 'Q', route('key', 'Q'), { promptPlan: 'item' }),
    definition('magic.cast', 'Cast spell', ['spell', 'magic'], 'Magic', 'Z', route('key', 'Z'), { promptPlan: 'core-owned' }),
    definition('magic.spells', 'Spells', ['spellbook', 'known spells', 'show spells'], 'Magic', '#showspells', route('text', '#showspells\n'), { promptPlan: 'core-owned' }),
    definition('magic.skills', 'Skills', ['enhance', 'advance skill', 'skill ranks'], 'Magic', '#enhance', route('text', '#enhance\n'), { promptPlan: 'core-owned' }),
    definition('magic.pray', 'Pray', ['prayer'], 'Magic', '#pray', route('text', '#pray\n'), { promptPlan: 'core-owned', danger: 'caution', recentEligible: false }),
    definition('dungeon.walk', 'Walk', ['move one square', 'movement', 'arrows', 'vi keys'], 'Dungeon', 'arrows / hjklyubn', route('surface', 'movement'), { recentEligible: false }),
    definition('dungeon.run', 'Run', ['go until interrupted', 'fast movement'], 'Dungeon', 'g + direction', route('surface', 'movement'), { recentEligible: false }),
    definition('dungeon.fight', 'Fight', ['force attack', 'attack direction'], 'Dungeon', 'F + direction', route('surface', 'movement'), { recentEligible: false }),
    definition('dungeon.counts', 'Count prefixes', ['repeat', 'repeat count', 'number prefix'], 'Dungeon', 'number + command', route('surface', 'movement'), { recentEligible: false }),
    definition('dungeon.search', 'Search', ['find hidden doors', 'find traps'], 'Dungeon', 's', route('key', 's')),
    definition('dungeon.wait', 'Wait one turn', ['wait', 'pass one turn'], 'Dungeon', '.', route('key', '.')),
    definition('dungeon.open', 'Open', ['open door'], 'Dungeon', 'o', route('key', 'o'), { promptPlan: 'direction' }),
    definition('dungeon.close', 'Close', ['close door'], 'Dungeon', 'c', route('key', 'c'), { promptPlan: 'direction' }),
    definition('dungeon.kick', 'Kick', ['kick door', 'kick object'], 'Dungeon', 'Ctrl-D', route('key', '\u0004'), { promptPlan: 'direction' }),
    definition('dungeon.up', 'Go up stairs', ['ascend', 'upstairs'], 'Dungeon', '<', route('key', '<')),
    definition('dungeon.down', 'Go down stairs', ['descend', 'downstairs'], 'Dungeon', '>', route('key', '>')),
    definition('dungeon.whatis', 'What is?', ['identify map symbol', 'describe map symbol'], 'Dungeon', '/', route('key', '/'), { promptPlan: 'target' }),
    definition('dungeon.look-here', 'Look here', ['inspect current square', 'what is here'], 'Dungeon', ':', route('key', ':')),
    definition('dungeon.extended', 'Extended command', ['raw command', 'hash command', '#'], 'Dungeon', '#', route('key', '#'), { promptPlan: 'text' }),
    definition('character.attributes', 'Attributes', ['character sheet', 'stats'], 'Character', '#attributes', route('text', '#attributes\n'), { promptPlan: 'core-owned' }),
    definition('character.conduct', 'Conduct', ['voluntary challenges'], 'Character', '#conduct', route('text', '#conduct\n'), { promptPlan: 'core-owned' }),
    definition('character.history', 'Message history', ['previous messages', 'log'], 'Character', '#prevmsg', route('text', '#prevmsg\n'), { promptPlan: 'core-owned' }),
    definition('run.save', 'Save and exit', ['save game', 'save'], 'Run', 'S', route('key', 'S'), { promptPlan: 'core-owned', danger: 'caution', recentEligible: false }),
    definition('run.quit', 'Quit without saving', ['quit game', 'abandon run'], 'Run', '#quit', route('text', '#quit\n'), { promptPlan: 'core-owned', danger: 'serious', recentEligible: false }),
    definition('help.center', 'Help', ['basics', 'keys', 'commands', 'manual'], 'Help', '?', route('surface', 'help'), { recentEligible: false }),
    definition('help.command', 'Describe a command', ['what does', 'command help'], 'Help', '#whatdoes', route('text', '#whatdoes\n'), { promptPlan: 'text', recentEligible: false }),
  ]);

  function cleanText(value, field, required = false) {
    const result = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (required && !result) throw new TypeError(`CommandDefinition.${field} is required`);
    return result;
  }

  function normalizeRoute(input) {
    if (!input || typeof input !== 'object' || !routeKinds.includes(input.kind)) throw new TypeError('CommandDefinition.internalRoute is invalid');
    const value = String(input.value == null ? '' : input.value);
    if (!value.length) throw new TypeError('CommandDefinition.internalRoute.value is required');
    return Object.freeze({ ...input, kind: input.kind, value });
  }

  function normalizeDefinition(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('CommandDefinition must be an object');
    const category = categories.includes(input.category) ? input.category : null;
    if (!category) throw new TypeError(`CommandDefinition.category is invalid: ${String(input.category || '')}`);
    const aliases = Array.from(new Set((Array.isArray(input.aliases) ? input.aliases : []).map((alias) => cleanText(alias, 'alias')).filter(Boolean)));
    const publicShortcut = cleanText(input.publicShortcut, 'publicShortcut');
    const definitionValue = {
      id: cleanText(input.id, 'id', true),
      label: cleanText(input.label, 'label', true),
      aliases: Object.freeze(aliases),
      category,
      publicShortcut: publicShortcut || undefined,
      internalRoute: normalizeRoute(input.internalRoute),
      promptPlan: promptPlans.includes(input.promptPlan) ? input.promptPlan : 'none',
      danger: dangerLevels.includes(input.danger) ? input.danger : 'none',
      availability: availabilityKinds.includes(input.availability) ? input.availability : 'always',
      recentEligible: input.recentEligible !== false,
    };
    const unavailableReason = cleanText(input.unavailableReason, 'unavailableReason');
    if (unavailableReason) definitionValue.unavailableReason = unavailableReason;
    return Object.freeze(definitionValue);
  }

  function displayKeycap(shortcut, policy = 'contextual', context = {}) {
    if (policy === 'never' || !shortcut) return '';
    if (policy === 'contextual' && !context.focused && !context.palette && !context.help) return '';
    return String(shortcut);
  }

  function searchableText(command) {
    return [command.label, command.id, command.publicShortcut, ...command.aliases].filter(Boolean).join(' ').toLocaleLowerCase();
  }

  function matchScore(command, query) {
    const rawQuery = cleanText(query, 'query');
    const q = rawQuery.toLocaleLowerCase();
    if (!q) return 1;
    const label = command.label.toLocaleLowerCase();
    const rawShortcut = String(command.publicShortcut || '');
    const shortcut = rawShortcut.toLocaleLowerCase();
    if (rawShortcut && rawShortcut === rawQuery) return 110;
    if (label === q || shortcut === q || command.aliases.some((alias) => alias.toLocaleLowerCase() === q)) return 100;
    if (label.startsWith(q)) return 80;
    if (command.aliases.some((alias) => alias.toLocaleLowerCase().startsWith(q))) return 70;
    if (searchableText(command).includes(q)) return 50;
    const words = q.split(/\s+/).filter(Boolean);
    return words.every((word) => searchableText(command).includes(word)) ? 30 : 0;
  }

  function createCommandCatalog(options = {}) {
    const definitions = new Map();
    const providers = [];
    const recentIds = [];
    const recentLimit = Math.max(1, Math.min(20, Number(options.recentLimit) || 8));

    function add(input, owner = 'discovery') {
      const command = normalizeDefinition(input);
      if (definitions.has(command.id)) throw new Error(`Duplicate command id: ${command.id}`);
      definitions.set(command.id, Object.freeze({ ...command, owner }));
      return definitions.get(command.id);
    }

    function registerProvider(owner, provider) {
      const ownerId = cleanText(owner, 'provider owner', true);
      if (!provider || typeof provider.entries !== 'function') throw new TypeError('Command provider requires entries(publicState)');
      if (providers.some((entry) => entry.owner === ownerId)) throw new Error(`Duplicate command provider: ${ownerId}`);
      providers.push(Object.freeze({ owner: ownerId, entries: provider.entries }));
      return true;
    }

    function materialize(publicState = {}) {
      const combined = Array.from(definitions.values());
      for (const provider of providers) {
        const entries = provider.entries(publicState);
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) combined.push(Object.freeze({ ...normalizeDefinition(entry), owner: provider.owner, availableHere: true }));
      }
      const seen = new Set();
      return Object.freeze(combined.filter((entry) => {
        if (seen.has(entry.id)) throw new Error(`Duplicate materialized command id: ${entry.id}`);
        seen.add(entry.id);
        return true;
      }));
    }

    function availabilityFor(command, publicState = {}) {
      if (command.availableHere) return Object.freeze({ available: true, availableHere: true });
      const override = publicState.commandAvailability && typeof publicState.commandAvailability === 'object' ? publicState.commandAvailability[command.id] : undefined;
      if (override === false || (override && override.available === false)) return Object.freeze({ available: false, availableHere: false, reason: cleanText(override?.reason || command.unavailableReason, 'availability reason') || 'Unavailable right now.' });
      if (override === true || (override && override.available === true)) return Object.freeze({ available: true, availableHere: Boolean(override.availableHere) });
      if (command.availability === 'always') return Object.freeze({ available: true, availableHere: false });
      if (command.availability === 'core-prompt-only') {
        const available = Boolean(publicState.corePromptCommandIds?.includes?.(command.id));
        return Object.freeze({ available, availableHere: available, reason: available ? '' : (command.unavailableReason || 'Available only when NetHack asks.') });
      }
      const contextual = publicState.contextCommands && typeof publicState.contextCommands === 'object' ? publicState.contextCommands[command.id] : undefined;
      const available = contextual === true || (contextual && contextual.available === true);
      const reason = available ? '' : cleanText(contextual?.reason || command.unavailableReason, 'availability reason');
      return Object.freeze({ available, availableHere: available, reason: reason || 'Not available here.' });
    }

    function search(query = '', publicState = {}) {
      return Object.freeze(materialize(publicState).map((command) => {
        const score = matchScore(command, query);
        const availability = availabilityFor(command, publicState);
        return Object.freeze({ command, score, ...availability });
      }).filter((entry) => entry.score > 0 && (entry.command.availability !== 'public-context' || entry.available))
        .sort((left, right) => Number(right.availableHere) - Number(left.availableHere) || right.score - left.score || categories.indexOf(left.command.category) - categories.indexOf(right.command.category) || left.command.label.localeCompare(right.command.label)));
    }

    function sections(query = '', publicState = {}) {
      const results = search(query, publicState);
      const used = new Set();
      const output = [];
      const available = results.filter((entry) => entry.availableHere);
      if (available.length) {
        output.push(Object.freeze({ id: 'available', label: 'Available here', entries: Object.freeze(available) }));
        available.forEach((entry) => used.add(entry.command.id));
      }
      if (!cleanText(query, 'query')) {
        const recent = recentIds.map((id) => results.find((entry) => entry.command.id === id)).filter(Boolean).filter((entry) => !used.has(entry.command.id));
        if (recent.length) {
          output.push(Object.freeze({ id: 'recent', label: 'Recent', entries: Object.freeze(recent) }));
          recent.forEach((entry) => used.add(entry.command.id));
        }
      }
      const categoryOrder = cleanText(query, 'query')
        ? categories.slice().sort((left, right) => Math.max(0, ...results.filter((entry) => entry.command.category === right).map((entry) => entry.score)) - Math.max(0, ...results.filter((entry) => entry.command.category === left).map((entry) => entry.score)) || categories.indexOf(left) - categories.indexOf(right))
        : categories;
      for (const category of categoryOrder) {
        const entries = results.filter((entry) => entry.command.category === category && !used.has(entry.command.id));
        if (entries.length) output.push(Object.freeze({ id: category.toLocaleLowerCase(), label: category, entries: Object.freeze(entries) }));
      }
      return Object.freeze(output);
    }

    function recordUse(id) {
      const command = definitions.get(String(id || ''));
      if (!command || !command.recentEligible || command.danger !== 'none') return false;
      const index = recentIds.indexOf(command.id);
      if (index >= 0) recentIds.splice(index, 1);
      recentIds.unshift(command.id);
      recentIds.splice(recentLimit);
      return true;
    }

    function dispatch(idOrCommand, adapter = {}, publicState = {}) {
      const command = typeof idOrCommand === 'string' ? (definitions.get(idOrCommand) || materialize(publicState).find((entry) => entry.id === idOrCommand)) : idOrCommand;
      if (!command) return Object.freeze({ ok: false, reason: 'unknown-command' });
      const commandRoute = command.internalRoute;
      let sent = false;
      if (commandRoute.kind === 'key' && typeof adapter.sendKey === 'function') sent = adapter.sendKey(commandRoute.value) !== false;
      else if (commandRoute.kind === 'text' && typeof adapter.sendText === 'function') sent = adapter.sendText(commandRoute.value) !== false;
      else if (commandRoute.kind === 'surface' && typeof adapter.openSurface === 'function') sent = adapter.openSurface(commandRoute.value, command) !== false;
      else if (commandRoute.kind === 'provider' && typeof adapter.dispatchProvider === 'function') sent = adapter.dispatchProvider(commandRoute, command) !== false;
      else return Object.freeze({ ok: false, reason: 'route-adapter-unavailable', commandId: command.id });
      if (sent) recordUse(command.id);
      return Object.freeze({ ok: sent, reason: sent ? '' : 'dispatch-rejected', commandId: command.id, routeKind: commandRoute.kind });
    }

    (options.definitions || baseDefinitions).forEach((entry) => add(entry));
    return Object.freeze({
      version, add, registerProvider, materialize, availabilityFor, search, sections, recordUse, dispatch,
      get: (id) => definitions.get(String(id || '')),
      entries: () => Object.freeze(Array.from(definitions.values())),
      recent: () => Object.freeze(recentIds.slice()),
    });
  }

  function movementCommandPlan(input = {}) {
    const mode = ['walk', 'run', 'fight'].includes(input.mode) ? input.mode : 'walk';
    const direction = String(input.direction || '');
    if (!/^[hjklyubn]$/.test(direction)) return Object.freeze({ ok: false, reason: 'invalid-direction' });
    const countNumber = input.count == null || input.count === '' ? 1 : Number(input.count);
    if (!Number.isInteger(countNumber) || countNumber < 1 || countNumber > 999) return Object.freeze({ ok: false, reason: 'invalid-count' });
    const count = countNumber > 1 ? String(countNumber) : '';
    const prefix = mode === 'run' ? 'g' : (mode === 'fight' ? 'F' : '');
    return Object.freeze({ ok: true, mode, direction, count: countNumber, text: `${count}${prefix}${direction}` });
  }

  function hashActivation() {
    return Object.freeze({
      dispatch: route('key', '#'),
      presenter: 'core-extended-command',
      consumesClassicKey: false,
      explanation: 'The # key is sent to NetHack immediately. The palette presents the resulting core-owned command prompt.',
    });
  }

  function registerDiscoveryDomain(options = {}) {
    const runtime = options.runtime;
    const catalog = options.catalog || createCommandCatalog();
    if (!runtime?.registerDomain || !runtime?.registerProvider) throw new TypeError('Discovery registration requires the UX runtime');
    const controller = Object.freeze({
      version: 'nethack-ux-discovery-controller/v1',
      catalog,
      palette: options.palette || null,
      help: options.help || null,
      onboarding: options.onboarding || null,
      characterCreation: options.characterCreation || null,
      hashActivation: hashActivation(),
    });
    runtime.registerDomain('discovery', controller);
    runtime.registerProvider('catalog-entries', 'discovery', Object.freeze({
      version,
      entries: () => catalog.entries(),
      search: (query, publicState) => catalog.search(query, publicState),
    }));
    if (typeof options.onPublicState === 'function') runtime.subscribePublicState('discovery', options.onPublicState);
    return controller;
  }

  return Object.freeze({
    version, categories, promptPlans, dangerLevels, availabilityKinds, routeKinds, baseDefinitions,
    normalizeDefinition, displayKeycap, searchableText, matchScore, createCommandCatalog, movementCommandPlan, hashActivation, registerDiscoveryDomain,
  });
}));
