(function initUxSettingsStore(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxSettingsStore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-presentation-settings/v4';
  const schemaVersion = 4;
  const storageKey = 'nethack-electron-presentation-settings-v4';
  const previousStorageKey = 'nethack-electron-presentation-settings-v3';
  const v2StorageKey = 'nethack-electron-presentation-settings-v2';
  const legacyStorageKey = 'nethack-electron-poc-settings-v1';
  const defaultSettings = Object.freeze({
    schemaVersion,
    contextualPrompts: 'full',
    autopickup: 'gold',
    movement: 'classic',
    onboarding: Object.freeze({ completed: false, disabled: false, lastStep: 'not-started' }),
    hudDensity: 'compact',
    keyHints: 'contextual',
    map: Object.freeze({ mode: 'close', closeRows: 9, minimapSize: 'medium', scale: 1, glyphOverlay: false, highContrast: false }),
    layout: Object.freeze({ logRatio: 0.5 }),
    motion: 'system',
    sound: Object.freeze({ uiEnabled: false, gameFeedbackEnabled: false, volume: 0.5 }),
  });

  const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
  const closeUpRowOptions = Object.freeze([7, 9, 11, 13, 15]);
  const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
  const numberInRange = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;

  function normalizeSettings(input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const onboarding = source.onboarding && typeof source.onboarding === 'object' ? source.onboarding : {};
    const map = source.map && typeof source.map === 'object' ? source.map : {};
    const layout = source.layout && typeof source.layout === 'object' ? source.layout : {};
    const sound = source.sound && typeof source.sound === 'object' ? source.sound : {};
    return Object.freeze({
      schemaVersion,
      contextualPrompts: oneOf(source.contextualPrompts, ['off', 'essential', 'full'], defaultSettings.contextualPrompts),
      autopickup: oneOf(source.autopickup, ['off', 'gold', 'all'], defaultSettings.autopickup),
      movement: oneOf(source.movement, ['classic', 'numpad'], defaultSettings.movement),
      onboarding: Object.freeze({
        completed: bool(onboarding.completed, defaultSettings.onboarding.completed),
        disabled: bool(onboarding.disabled, defaultSettings.onboarding.disabled),
        lastStep: typeof onboarding.lastStep === 'string' && onboarding.lastStep.trim() ? onboarding.lastStep.trim().slice(0, 64) : defaultSettings.onboarding.lastStep,
      }),
      hudDensity: oneOf(source.hudDensity, ['compact', 'detailed'], defaultSettings.hudDensity),
      keyHints: oneOf(source.keyHints, ['contextual', 'always', 'never'], defaultSettings.keyHints),
      map: Object.freeze({
        mode: oneOf(map.mode, ['full', 'follow', 'close'], defaultSettings.map.mode),
        closeRows: oneOf(Number(map.closeRows), closeUpRowOptions, defaultSettings.map.closeRows),
        minimapSize: oneOf(map.minimapSize, ['small', 'medium', 'large'], defaultSettings.map.minimapSize),
        scale: numberInRange(map.scale, 0.5, 3, defaultSettings.map.scale),
        glyphOverlay: bool(map.glyphOverlay, defaultSettings.map.glyphOverlay),
        highContrast: bool(map.highContrast, defaultSettings.map.highContrast),
      }),
      layout: Object.freeze({
        logRatio: numberInRange(layout.logRatio, 0.2, 0.75, defaultSettings.layout.logRatio),
      }),
      motion: oneOf(source.motion, ['system', 'reduced', 'full'], defaultSettings.motion),
      sound: Object.freeze({
        uiEnabled: bool(sound.uiEnabled, defaultSettings.sound.uiEnabled),
        gameFeedbackEnabled: bool(sound.gameFeedbackEnabled, defaultSettings.sound.gameFeedbackEnabled),
        volume: numberInRange(sound.volume, 0, 1, defaultSettings.sound.volume),
      }),
    });
  }
  function migrateLegacySettings(source = {}) {
    return normalizeSettings({
      ...source,
      contextualPrompts: source.contextualMenus === false ? 'off' : 'full',
      autopickup: source.autoLootGold === false ? 'off' : 'gold',
      movement: 'classic',
    });
  }

  function mergeSettings(current, patch = {}) {
    const source = patch && typeof patch === 'object' ? patch : {};
    return normalizeSettings({
      ...current,
      ...source,
      onboarding: { ...current.onboarding, ...(source.onboarding && typeof source.onboarding === 'object' ? source.onboarding : {}) },
      map: { ...current.map, ...(source.map && typeof source.map === 'object' ? source.map : {}) },
      layout: { ...current.layout, ...(source.layout && typeof source.layout === 'object' ? source.layout : {}) },
      sound: { ...current.sound, ...(source.sound && typeof source.sound === 'object' ? source.sound : {}) },
    });
  }

  function createSettingsStore(options = {}) {
    const storage = options.storage;
    const onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {};
    const onWarning = typeof options.onWarning === 'function' ? options.onWarning : () => {};
    let settings = defaultSettings;
    const warningKinds = new Set();

    function diagnostic(type, detail = {}) {
      try { onDiagnostic(Object.freeze({ type, detail: Object.freeze({ ...detail }) })); } catch {}
    }

    function warning(message, diagnosticType) {
      diagnostic(diagnosticType, { message });
      const kind = /write/.test(diagnosticType) ? 'write' : 'load';
      if (warningKinds.has(kind)) return;
      warningKinds.add(kind);
      try { onWarning(message); } catch {}
    }

    function read(key) {
      if (!storage || typeof storage.getItem !== 'function') return null;
      return storage.getItem(key);
    }

    function parse(raw, key) {
      if (raw == null || raw === '') return null;
      try {
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('settings document must be an object');
        return value;
      } catch (error) {
        warning('Presentation settings could not be loaded. Safe defaults are in use.', 'settings.parse-failed');
        diagnostic('settings.parse-detail', { key, message: String(error?.message || error) });
        return null;
      }
    }

    function write(value) {
      settings = normalizeSettings(value);
      if (!storage || typeof storage.setItem !== 'function') {
        warning('This preference is active for this session but could not be saved.', 'settings.write-unavailable');
        return false;
      }
      try {
        storage.setItem(storageKey, JSON.stringify(settings));
        diagnostic('settings.saved', { schemaVersion, storageKey });
        return true;
      } catch (error) {
        warning('This preference is active for this session but could not be saved.', 'settings.write-failed');
        diagnostic('settings.write-detail', { message: String(error?.message || error) });
        return false;
      }
    }

    function load() {
      let currentRaw = null;
      try { currentRaw = read(storageKey); }
      catch (error) {
        warning('Presentation settings could not be loaded. Safe defaults are in use.', 'settings.read-failed');
        diagnostic('settings.read-detail', { key: storageKey, message: String(error?.message || error) });
      }
      if (currentRaw != null && currentRaw !== '') {
        const parsed = parse(currentRaw, storageKey);
        settings = normalizeSettings(parsed || {});
        diagnostic('settings.loaded', { source: parsed ? 'v4' : 'defaults', schemaVersion });
        return Object.freeze({ settings, source: parsed ? 'v4' : 'defaults', migrated: false, persisted: Boolean(parsed) });
      }

      for (const [key, source] of [[previousStorageKey, 'v3'], [v2StorageKey, 'v2'], [legacyStorageKey, 'v1']]) {
        let legacyRaw = null;
        try { legacyRaw = read(key); }
        catch (error) {
          warning('Presentation settings could not be loaded. Safe defaults are in use.', 'settings.legacy-read-failed');
          diagnostic('settings.read-detail', { key, message: String(error?.message || error) });
        }
        if (legacyRaw == null || legacyRaw === '') continue;
        const legacy = parse(legacyRaw, key);
        if (!legacy) continue;
        settings = source === 'v3' ? normalizeSettings(legacy) : migrateLegacySettings(legacy);
        const persisted = write(settings);
        if (persisted && typeof storage.removeItem === 'function') {
          try { storage.removeItem(key); }
          catch (error) { diagnostic('settings.legacy-remove-failed', { message: String(error?.message || error) }); }
        }
        diagnostic('settings.migrated', { from: key, to: storageKey, persisted });
        return Object.freeze({ settings, source, migrated: true, persisted });
      }
      settings = defaultSettings;
      diagnostic('settings.loaded', { source: 'defaults', schemaVersion });
      return Object.freeze({ settings, source: 'defaults', migrated: false, persisted: false });
    }

    function refreshFromCurrentDocument() {
      let raw = null;
      try { raw = read(storageKey); }
      catch (error) {
        warning('Presentation settings could not be loaded. Current session values are in use.', 'settings.read-failed');
        diagnostic('settings.read-detail', { key: storageKey, message: String(error?.message || error) });
        return settings;
      }
      if (raw == null || raw === '') return settings;
      const parsed = parse(raw, storageKey);
      if (parsed) settings = normalizeSettings(parsed);
      return settings;
    }

    function save(patch = {}) {
      const next = mergeSettings(refreshFromCurrentDocument(), patch);
      const persisted = write(next);
      return Object.freeze({ settings, persisted });
    }

    return Object.freeze({
      version,
      schemaVersion,
      storageKey,
      previousStorageKey,
      v2StorageKey,
      legacyStorageKey,
      load,
      save,
      reset: () => save(defaultSettings),
      current: () => settings,
      warningEmitted: () => warningKinds.size > 0,
    });
  }

  return Object.freeze({ version, schemaVersion, storageKey, previousStorageKey, v2StorageKey, legacyStorageKey, closeUpRowOptions, defaultSettings, normalizeSettings, mergeSettings, createSettingsStore });
}));
