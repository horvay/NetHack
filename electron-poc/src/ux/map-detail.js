(function initUxMapDetail(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../shared/map-presentation'),
      require('./runtime'),
      require('./settings-store'),
    );
  } else {
    root.NetHackUxMapDetail = factory(root.NetHackMapPresentation, root.NetHackUxRuntime, root.NetHackUxSettingsStore, root);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(MapPresentation, RuntimeModule, SettingsStore, browserRoot) {
  const version = 'nethack-map-detail/v1';
  const mapWidth = 80;
  const mapHeight = 21;
  const minimapColors = Object.freeze({
    unknown: '#08090d',
    floor: '#6f6a5d',
    wall: '#343945',
    door: '#c48a4a',
    stairs: '#67d5d0',
    hazard: '#e66b49',
    object: '#70a6d8',
    creature: '#d95f74',
    hero: '#f6d365',
    known: '#8b8291',
  });

  function text(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function sentenceCase(value) {
    const label = text(value);
    return label ? `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}` : '';
  }
  function titleCase(value) { return text(value).replace(/\b\w/g, (letter) => letter.toUpperCase()); }
  function coordinate(value) {
    if (!value || !Number.isInteger(value.x) || !Number.isInteger(value.y)) return null;
    return Object.freeze({ x: value.x, y: value.y });
  }
  function minimapTone(cell = {}) {
    const kind = text(cell.semanticKind).toLowerCase();
    const glyph = text(cell.ch);
    const feature = text(cell.featureDescription);
    if (!glyph || glyph === ' ' || kind === 'unknown' || kind === 'void') return 'unknown';
    if (kind === 'hero' || kind === 'player') return 'hero';
    if (kind === 'monster' || kind === 'pet') return 'creature';
    if (kind === 'object') return 'object';
    if (kind === 'trap' || /\btrap\b/i.test(feature)) return 'hazard';
    if (kind === 'stairs' || /\bstairs?\b|\bstaircase\b|\bladder\b/i.test(`${feature} ${publicDisplayName(cell)}`)) return 'stairs';
    if (kind === 'door' || glyph === '+' || glyph === '/') return 'door';
    if (glyph === '|' || glyph === '-') return 'wall';
    if (glyph === '.' || glyph === '#') return 'floor';
    return 'known';
  }

  function createMinimapModel(input = {}) {
    const cells = Array.isArray(input.mapCells) ? input.mapCells : [];
    const width = Math.max(1, Number(input.mapWidth) || cells[0]?.length || mapWidth);
    const height = Math.max(1, Number(input.mapHeight) || cells.length || mapHeight);
    const cursor = coordinate(input.cursor);
    const tones = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        tones.push(cursor?.x === x && cursor?.y === y ? 'hero' : minimapTone(cells[y]?.[x]));
      }
    }
    return Object.freeze({ width, height, tones: Object.freeze(tones) });
  }

  function publicDisplayName(cell = {}) {
    if (cell.semanticKnown === false) return text(cell.semanticAppearance);
    return text(cell.semanticName || cell.semanticAppearance);
  }
  function publicObjectLayerName(cell = {}) {
    if (cell.objectLayerSemanticKnown === false) return text(cell.objectLayerSemanticAppearance);
    return text(cell.objectLayerSemanticName || cell.objectLayerSemanticAppearance);
  }
  function publicFallbackLabel(cell = {}) {
    const semantic = publicDisplayName(cell);
    if (semantic) return sentenceCase(semantic);
    const kind = text(cell.semanticKind).toLowerCase();
    if (kind === 'hero' || kind === 'player') return 'Hero';
    if (kind && !['terrain', 'door', 'feature', 'stairs'].includes(kind)) return 'Unknown';
    if (cell.ch === '.') return 'Dungeon floor';
    if (cell.ch === '#') return 'Corridor';
    if (cell.ch === '|' || cell.ch === '-') return 'Wall';
    if (cell.ch === '+') return 'Closed door';
    if (cell.ch === '/') return 'Open door';
    return 'Unknown';
  }
  function normalizeLayer(role, label) {
    const cleanRole = text(role).toLowerCase();
    const cleanLabel = text(label);
    if (!cleanRole || !cleanLabel) return null;
    return Object.freeze({ role: cleanRole, label: sentenceCase(cleanLabel) });
  }
  function publicLayersForCell(cell = {}) {
    const layers = [];
    const kind = text(cell.semanticKind).toLowerCase();
    const label = publicDisplayName(cell);
    const objectLabel = publicObjectLayerName(cell);
    const feature = text(cell.featureDescription);
    const backgroundName = text(cell.backgroundSemanticName);
    const backgroundKind = text(cell.backgroundSemanticKind).toLowerCase();
    const featureLooksSpecial = /\bstairs?\b|\bstaircase\b|\bladder\b|\baltar\b|\bfountain\b|\bsink\b|\bthrone\b|\bgrave\b|\btree\b|\bdoor\b|\btrap\b|\bpool\b|\blava\b|\bmoat\b|\bwater\b|\biron bars\b|\bdrawbridge\b/i.test(feature);
    const backgroundLooksSpecial = ['stairs', 'door', 'trap', 'feature'].includes(backgroundKind)
      || /\bstairs?\b|\bstaircase\b|\bladder\b|\baltar\b|\bfountain\b/i.test(backgroundName);
    if (objectLabel) layers.push(normalizeLayer(cell.objectLayerSemanticKnown === false ? 'visible' : 'object', objectLabel));
    if (label) layers.push(normalizeLayer(cell.semanticKnown === false ? 'visible' : (['monster', 'pet', 'hero', 'player'].includes(kind) ? 'creature' : (kind || 'feature')), label));
    if (feature && featureLooksSpecial) {
      const role = /\bstairs?\b|\bstaircase\b|\bladder\b/i.test(feature) ? 'stairs' : (/\bdoor\b/i.test(feature) ? 'door' : (/\btrap\b/i.test(feature) ? 'trap' : 'feature'));
      layers.push(normalizeLayer(role, sentenceCase(feature)));
    } else if (backgroundLooksSpecial && backgroundName) {
      layers.push(normalizeLayer(backgroundKind || 'feature', sentenceCase(backgroundName)));
    } else if (!layers.length && publicFallbackLabel(cell) !== 'Unknown') {
      layers.push(normalizeLayer('terrain', publicFallbackLabel(cell)));
    } else if (layers.length && !featureLooksSpecial && !backgroundLooksSpecial) {
      const terrainLabel = backgroundName || publicFallbackLabel(cell);
      if (terrainLabel && terrainLabel !== 'Unknown' && !layers.some((entry) => entry.label.toLowerCase() === terrainLabel.toLowerCase())) {
        layers.push(normalizeLayer('terrain', sentenceCase(terrainLabel)));
      }
    }
    return Object.freeze(layers.filter(Boolean));
  }
  function publicAttitudeForCell(cell = {}, contextActions) {
    const fromCreature = text(cell?.creaturePublic?.attitude).toLowerCase();
    if (fromCreature === 'tame' || fromCreature === 'peaceful' || fromCreature === 'hostile') return fromCreature;
    return contextActions?.attitudeFromPublicCell?.(cell);
  }
  function publicStateCues(cell = {}, publicAttitude) {
    const cues = [];
    const kind = text(cell.semanticKind).toLowerCase();
    const tokens = new Set(Array.isArray(cell.actionAffordances) ? cell.actionAffordances.map(text) : []);
    if (kind === 'hero' || kind === 'player') cues.push('hero');
    if (publicAttitude === 'tame') cues.push('pet');
    if (publicAttitude === 'peaceful') cues.push('peaceful');
    if (publicAttitude === 'hostile') cues.push('hostile');
    if (tokens.has('trap.known')) cues.push('known-trap');
    return Object.freeze(cues);
  }
  function normalizeCreatureSize(value) {
    const size = text(value).toLowerCase();
    if (['tiny', 'small', 'medium', 'large', 'huge', 'gigantic'].includes(size)) return size;
    return '';
  }
  function normalizeCreatureStatus(status = []) {
    if (!Array.isArray(status)) return Object.freeze([]);
    const seen = new Set();
    const out = [];
    for (const entry of status) {
      const label = text(entry);
      const key = label.toLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
    return Object.freeze(out);
  }
  function publicCreatureFacts(cell = {}, publicAttitude) {
    const kind = text(cell.semanticKind).toLowerCase();
    const isCreature = ['monster', 'pet', 'hero', 'player'].includes(kind) || Boolean(cell.creaturePublic);
    if (!isCreature) return undefined;
    const source = cell.creaturePublic && typeof cell.creaturePublic === 'object' ? cell.creaturePublic : {};
    const attitude = text(source.attitude).toLowerCase() || publicAttitude || '';
    const size = normalizeCreatureSize(source.size);
    const status = normalizeCreatureStatus(source.status);
    if (!attitude && !size && !status.length) return undefined;
    return Object.freeze({
      ...(attitude ? { attitude } : {}),
      ...(size ? { size } : {}),
      status,
    });
  }
  function creatureFactRows(facts) {
    if (!facts) return Object.freeze([]);
    const rows = [];
    if (facts.attitude) rows.push(Object.freeze({ label: 'Attitude', value: titleCase(facts.attitude) }));
    if (facts.size) rows.push(Object.freeze({ label: 'Size', value: titleCase(facts.size) }));
    for (const entry of facts.status || []) rows.push(Object.freeze({ label: 'Status', value: sentenceCase(entry) }));
    return Object.freeze(rows);
  }
  function chebyshevDistance(from, to) {
    if (!from || !to) return undefined;
    return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  }
  function normalizePublicActions(actions = []) {
    return Object.freeze((Array.isArray(actions) ? actions : []).map((action) => {
      const id = text(action.id);
      const label = text(action.label);
      if (!id || !label) throw new TypeError('MapDetailModel public actions require id and label');
      return Object.freeze({
        id,
        label,
        danger: action.danger === 'serious' ? 'serious' : (action.danger === 'caution' ? 'caution' : 'none'),
        ...(action.dispatchToken ? { dispatchToken: text(action.dispatchToken) } : {}),
      });
    }));
  }
  function createMapDetailModel(input = {}, dependencies = {}) {
    const selectedCell = coordinate(input.selectedCell);
    if (!selectedCell) throw new TypeError('MapDetailModel.selectedCell requires integer x and y');
    const cell = input.cell && typeof input.cell === 'object' ? input.cell : {};
    const publicLayers = publicLayersForCell(cell);
    const publicLabel = text(input.publicLabel) || publicLayers.at(-1)?.label || publicFallbackLabel(cell);
    const publicAttitude = publicAttitudeForCell(cell, dependencies.contextActions);
    const creature = publicCreatureFacts(cell, publicAttitude);
    const model = {
      selectedCell,
      publicLabel,
      publicLayers,
      publicActions: normalizePublicActions(input.publicActions),
      stateCues: publicStateCues(cell, publicAttitude || creature?.attitude),
      creatureFacts: creature || null,
      creatureFactRows: creatureFactRows(creature),
    };
    if (publicAttitude || creature?.attitude) model.publicAttitude = publicAttitude || creature.attitude;
    const distance = input.distance == null ? chebyshevDistance(input.origin, selectedCell) : Number(input.distance);
    if (Number.isFinite(distance) && distance >= 0) model.distance = distance;
    return Object.freeze(model);
  }

  function createController(options = {}) {
    const documentRoot = options.documentRoot || (typeof document !== 'undefined' ? document : null);
    const runtime = options.runtime || RuntimeModule?.runtime;
    const contextActions = options.contextActions || browserRoot?.NetHackUxContextActionPresentation;
    const diagnostics = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {};
    const grid = options.grid || documentRoot?.getElementById?.('game-grid');
    const mount = options.mount || documentRoot?.getElementById?.('ux-map-overlay-root');
    const storage = options.storage || browserRoot?.localStorage;
    const detailSource = options.detailSource || browserRoot?.NetHackMapTileDetailSource;
    let settingsStore;
    let publicState = null;
    let selection = null;
    let actionProvider = null;
    let subscription;
    let elements = {};
    let lastMapSettings = SettingsStore?.defaultSettings?.map || { mode: 'full', closeRows: 9, scale: 1 };
    let overviewSelection = null;

    function diagnostic(type, detail = {}) {
      try { diagnostics(Object.freeze({ type, detail: Object.freeze({ ...detail }) })); } catch {}
    }
    function gameState() { return publicState?.game || {}; }
    function cells() { return gameState().mapCells || []; }
    function cursor() {
      const publicCursor = coordinate(gameState().cursor);
      if (publicCursor) return publicCursor;
      const [x, y] = text(grid?.dataset?.cursor).split(',').map(Number);
      return Number.isInteger(x) && Number.isInteger(y) ? Object.freeze({ x, y }) : Object.freeze({ x: 0, y: 0 });
    }
    function cellElement(coord) {
      return coord ? grid?.querySelector?.(`.tile-cell[data-map-x="${coord.x}"][data-map-y="${coord.y}"]`) : null;
    }
    function cellFromElement(node) {
      if (!node) return {};
      return {
        ch: node.dataset.glyph || '',
        semanticKind: node.dataset.semanticKind || '',
        semanticName: node.dataset.semanticName || '',
        semanticKnown: true,
        objectLayerSemanticKind: node.dataset.objectLayerSemanticKind || '',
        objectLayerSemanticName: node.dataset.objectLayerSemanticName || '',
        objectLayerSemanticKnown: true,
        actionAffordances: [],
      };
    }
    function cellAt(coord) { return cells()?.[coord?.y]?.[coord?.x] || cellFromElement(cellElement(coord)); }
    function actionsFor(coord, cell) {
      const provided = actionProvider?.actionsForCell?.(Object.freeze({ coord, cell, publicState })) || [];
      return Array.isArray(provided) ? provided : [];
    }
    function modelFor(coord) {
      const cell = cellAt(coord);
      return createMapDetailModel({
        selectedCell: coord,
        cell,
        origin: cursor(),
        publicActions: actionsFor(coord, cell),
      }, { contextActions });
    }
    function boundedCoordinate(coord) {
      return Object.freeze({
        x: Math.max(0, Math.min(Number(gameState().mapWidth || mapWidth) - 1, Number(coord?.x) || 0)),
        y: Math.max(0, Math.min(Number(gameState().mapHeight || mapHeight) - 1, Number(coord?.y) || 0)),
      });
    }
    function coordFromEvent(event) {
      const node = event.target?.closest?.('.tile-cell');
      if (!node || !grid?.contains?.(node)) return null;
      const x = Number(node.dataset.mapX);
      const y = Number(node.dataset.mapY);
      return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
    }
    function renderArtwork(node) {
      elements.art.replaceChildren();
      if (!node?.cloneNode) {
        elements.art.textContent = cellAt(selection).ch || '?';
        elements.art.classList.add('ux-map-detail-art-fallback');
        return;
      }
      const artwork = node.cloneNode(true);
      artwork.removeAttribute('id');
      artwork.removeAttribute('aria-label');
      artwork.classList.remove('cursor', 'adjacent-move-target', 'ux-map-selected', 'ux-map-hovered');
      artwork.classList.add('ux-map-detail-artwork');
      for (const adornment of artwork.querySelectorAll('.tile-ally-marker')) adornment.remove();
      artwork.setAttribute('aria-hidden', 'true');
      elements.art.classList.remove('ux-map-detail-art-fallback');
      elements.art.append(artwork);
    }
    function renderInspectionContents(container, entries) {
      container.replaceChildren(...entries.map((entry) => {
        const row = documentRoot.createElement('li');
        const label = documentRoot.createElement('strong');
        const kind = documentRoot.createElement('span');
        label.textContent = text(entry.label);
        kind.textContent = text(entry.kind || 'Visible feature');
        row.append(label, kind);
        return row;
      }));
    }

    function renderContents(info, model) {
      const entries = Array.isArray(info?.contents) && info.contents.length
        ? info.contents
        : model.publicLayers.map((layer) => ({ label: layer.label, kind: titleCase(layer.role) }));
      renderInspectionContents(elements.contents, entries);
      elements.contentsSection.hidden = entries.length === 0;
    }
    function renderCreatureFacts(model) {
      elements.creatureFacts.replaceChildren();
      const rows = Array.isArray(model?.creatureFactRows) ? model.creatureFactRows : [];
      if (!rows.length) {
        elements.creatureFactsSection.hidden = true;
        return;
      }
      elements.creatureFactsSection.hidden = false;
      for (const entry of rows) {
        const row = documentRoot.createElement('li');
        const label = documentRoot.createElement('span');
        const value = documentRoot.createElement('strong');
        label.textContent = text(entry.label);
        value.textContent = text(entry.value);
        row.append(label, value);
        elements.creatureFacts.append(row);
      }
    }
    function requestDispatch(action, model) {
      if (typeof actionProvider?.dispatch === 'function') actionProvider.dispatch(action, model);
      else if (typeof browserRoot?.CustomEvent === 'function') {
        grid?.dispatchEvent?.(new browserRoot.CustomEvent('nethack:map-action-request', {
          bubbles: true,
          detail: Object.freeze({ action, model }),
        }));
      }
      diagnostic('map.detail-action-requested', { actionId: action.id, explicit: true });
    }
    function renderActions(model) {
      elements.actions.replaceChildren();
      if (!model.publicActions.length) {
        elements.actionsSection.hidden = true;
        return;
      }
      elements.actionsSection.hidden = false;
      for (const action of model.publicActions) {
        const button = documentRoot.createElement('button');
        button.type = 'button';
        button.className = action.danger === 'serious' ? 'ux-map-detail-action ux-map-action-danger' : 'ux-map-detail-action';
        button.textContent = action.label;
        button.addEventListener('click', () => requestDispatch(action, model));
        elements.actions.append(button);
      }
    }
    function render() {
      if (!selection || !elements.dialog) return null;
      const node = cellElement(selection);
      const info = detailSource?.infoForCellElement?.(node) || null;
      const model = modelFor(selection);
      elements.title.textContent = text(info?.title) || model.publicLabel;
      elements.description.textContent = text(info?.description);
      elements.description.hidden = !text(info?.description);
      renderArtwork(node);
      renderContents(info, model);
      renderCreatureFacts(model);
      renderActions(model);
      return model;
    }
    function close(reason = 'close') {
      if (!elements.dialog?.open) return;
      elements.dialog.close(reason);
      diagnostic('map.detail-closed', { turnless: true, reason });
      grid?.focus?.({ preventScroll: true });
    }
    function open(coord, { focus = true } = {}) {
      selection = boundedCoordinate(coord);
      const model = render() || modelFor(selection);
      detailSource?.hideTooltip?.();
      if (elements.dialog && !elements.dialog.open) elements.dialog.showModal();
      if (focus) elements.closeButton?.focus?.({ preventScroll: true });
      diagnostic('map.detail-opened', { turnless: true });
      return model;
    }
    function select(coord, options = {}) { return open(coord, options); }
    function onClick(event) {
      const coord = coordFromEvent(event);
      if (!coord) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open(coord);
    }
    function onWindowKeydown(event) {
      if (event.key !== 'Escape') return;
      if (elements.overviewDialog?.open) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeOverview('escape');
        return;
      }
      if (!elements.dialog?.open) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close('escape');
    }
    function persistMapSettings(patch) {
      try {
        if (!settingsStore && SettingsStore?.createSettingsStore) {
          settingsStore = SettingsStore.createSettingsStore({ storage, onDiagnostic: (entry) => diagnostic(entry.type, entry.detail) });
          settingsStore.load();
        }
        settingsStore?.save?.({ map: patch });
      } catch (error) { diagnostic('map.settings-save-failed', { message: text(error?.message || error) }); }
    }
    function closeUpActive() {
      return documentRoot?.body?.dataset?.uxMapMode === 'close';
    }
    function shellController() {
      return runtime?.domain?.('shell');
    }
    function applySettings(mapSettings = {}) {
      lastMapSettings = { ...lastMapSettings, ...mapSettings };
      const scale = Math.max(0.75, Math.min(2, Number(lastMapSettings.scale) || 1));
      grid?.style?.setProperty('--ux-map-scale', String(scale));
      grid?.classList?.toggle('ux-map-glyph-overlay', Boolean(lastMapSettings.glyphOverlay));
      grid?.classList?.toggle('ux-map-high-contrast', Boolean(lastMapSettings.highContrast));
      const closeRows = Number(shellController()?.state?.().closeRows || lastMapSettings.closeRows) || 9;
      if (elements.scaleValue) elements.scaleValue.textContent = closeUpActive() ? `${closeRows} rows` : `${Math.round(scale * 100)}%`;
      if (elements.scaleDown) elements.scaleDown.setAttribute('aria-label', closeUpActive() ? 'Show more nearby map rows' : 'Decrease map scale');
      if (elements.scaleUp) elements.scaleUp.setAttribute('aria-label', closeUpActive() ? 'Show fewer nearby map rows' : 'Increase map scale');
      if (elements.glyphToggle) elements.glyphToggle.setAttribute('aria-pressed', String(Boolean(lastMapSettings.glyphOverlay)));
      if (elements.contrastToggle) elements.contrastToggle.setAttribute('aria-pressed', String(Boolean(lastMapSettings.highContrast)));
      syncMinimap();
    }
    function changeScale(delta) {
      if (closeUpActive()) {
        shellController()?.adjustCloseRows?.(delta > 0 ? -1 : 1);
        return;
      }
      const current = Number(grid?.style?.getPropertyValue('--ux-map-scale')) || 1;
      const scale = Math.max(0.75, Math.min(2, Math.round((current + delta) * 4) / 4));
      applySettings({ scale });
      persistMapSettings({ scale });
    }
    function renderMinimap() {
      const canvas = elements.minimapCanvas;
      if (!canvas?.getContext) return null;
      const game = gameState();
      const model = createMinimapModel({
        mapCells: cells(),
        mapWidth: game.mapWidth || mapWidth,
        mapHeight: game.mapHeight || mapHeight,
        cursor: cursor(),
      });
      const context = canvas.getContext('2d');
      if (!context) return model;
      const cellWidth = canvas.width / model.width;
      const cellHeight = canvas.height / model.height;
      context.fillStyle = minimapColors.unknown;
      context.fillRect(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < model.tones.length; index += 1) {
        const tone = model.tones[index];
        if (tone === 'unknown') continue;
        context.fillStyle = minimapColors[tone] || minimapColors.known;
        context.fillRect((index % model.width) * cellWidth, Math.floor(index / model.width) * cellHeight, Math.max(1, cellWidth), Math.max(1, cellHeight));
      }
      return model;
    }
    function syncMinimap() {
      if (!elements.minimapButton) return;
      elements.minimapButton.hidden = !closeUpActive();
      if (!elements.minimapButton.hidden) renderMinimap();
    }
    function renderOverviewMap() {
      if (!elements.overviewMap || !grid) return;
      const clones = Array.from(grid.children || [], (node) => {
        const clone = node.cloneNode(true);
        clone.classList.remove('adjacent-move-target', 'ux-map-selected', 'ux-map-hovered');
        clone.removeAttribute('tabindex');
        return clone;
      });
      elements.overviewMap.style.setProperty('--grid-cols', String(gameState().mapWidth || mapWidth));
      elements.overviewMap.replaceChildren(...clones);
    }
    function renderOverviewInspection(coord) {
      const bounded = boundedCoordinate(coord);
      const cell = cellAt(bounded);
      if (minimapTone(cell) === 'unknown') return null;
      overviewSelection = bounded;
      const sourceNode = cellElement(bounded);
      const info = detailSource?.infoForCellElement?.(sourceNode) || null;
      const model = modelFor(bounded);
      elements.overviewInspectorTitle.textContent = text(info?.title) || model.publicLabel;
      elements.overviewInspectorDescription.textContent = text(info?.description) || 'Known square on the current level.';
      const entries = Array.isArray(info?.contents) && info.contents.length
        ? info.contents
        : model.publicLayers.map((layer) => ({ label: layer.label, kind: titleCase(layer.role) }));
      renderInspectionContents(elements.overviewInspectorContents, entries);
      for (const node of elements.overviewMap.querySelectorAll('.tile-cell.ux-level-overview-selected')) node.classList.remove('ux-level-overview-selected');
      elements.overviewMap.querySelector(`.tile-cell[data-map-x="${bounded.x}"][data-map-y="${bounded.y}"]`)?.classList.add('ux-level-overview-selected');
      return model;
    }
    function openOverview() {
      if (!elements.overviewDialog || elements.overviewDialog.open) return false;
      renderOverviewMap();
      renderOverviewInspection(cursor());
      detailSource?.hideTooltip?.();
      elements.overviewDialog.showModal();
      elements.overviewClose?.focus?.({ preventScroll: true });
      diagnostic('map.level-overview-opened', { turnless: true });
      return true;
    }
    function closeOverview(reason = 'close') {
      if (!elements.overviewDialog?.open) return false;
      elements.overviewDialog.close(reason);
      overviewSelection = null;
      diagnostic('map.level-overview-closed', { turnless: true, reason });
      grid?.focus?.({ preventScroll: true });
      return true;
    }
    function inspectOverviewCell(event) {
      const node = event.target?.closest?.('.tile-cell');
      if (!node || !elements.overviewMap?.contains?.(node)) return;
      renderOverviewInspection({ x: Number(node.dataset.mapX), y: Number(node.dataset.mapY) });
    }
    function onMapPresentationChanged(event) {
      lastMapSettings = { ...lastMapSettings, ...(event?.detail || {}) };
      applySettings(lastMapSettings);
    }
    function toggleSetting(key, className, button) {
      const value = !grid.classList.contains(className);
      grid.classList.toggle(className, value);
      button.setAttribute('aria-pressed', String(value));
      persistMapSettings({ [key]: value });
      diagnostic('map.presentation-changed', { key, value, turnless: true });
    }
    function buildDom() {
      if (!documentRoot?.createElement || !grid || !mount) return false;
      mount.replaceChildren();
      mount.className = 'ux-map-surface';
      const toolbar = documentRoot.createElement('div');
      toolbar.className = 'ux-map-toolbar';
      toolbar.innerHTML = `
        <span class="ux-map-toolbar-label">Map view</span>
        <button type="button" class="ux-map-scale-down" aria-label="Decrease map scale">−</button>
        <span class="ux-map-scale-value">100%</span>
        <button type="button" class="ux-map-scale-up" aria-label="Increase map scale">+</button>
        <button type="button" class="ux-map-glyph-toggle" aria-pressed="false">Glyphs</button>
        <button type="button" class="ux-map-contrast-toggle" aria-pressed="false">High contrast</button>`;
      mount.append(toolbar);
      const minimapButton = documentRoot.createElement('button');
      minimapButton.type = 'button';
      minimapButton.className = 'ux-minimap-button';
      minimapButton.hidden = true;
      minimapButton.setAttribute('aria-haspopup', 'dialog');
      minimapButton.setAttribute('aria-controls', 'ux-level-overview-dialog');
      minimapButton.setAttribute('aria-label', 'Open full current level overview');
      minimapButton.innerHTML = `
        <span class="ux-minimap-kicker">Current level</span>
        <canvas class="ux-minimap-canvas" width="320" height="84" aria-hidden="true"></canvas>
        <span class="ux-minimap-hint">Open overview</span>`;
      documentRoot.getElementById('play-area')?.append(minimapButton);
      const overviewDialog = documentRoot.createElement('dialog');
      overviewDialog.id = 'ux-level-overview-dialog';
      overviewDialog.className = 'ux-level-overview-dialog';
      overviewDialog.setAttribute('aria-labelledby', 'ux-level-overview-title');
      overviewDialog.innerHTML = `
        <div class="ux-level-overview-frame">
          <header class="ux-level-overview-header">
            <div>
              <p class="ux-map-detail-kicker">Current dungeon level</p>
              <h2 id="ux-level-overview-title">Level Overview</h2>
              <p>Every square NetHack has revealed on this level. Select a known square to inspect it without spending a turn.</p>
            </div>
            <button type="button" class="ux-level-overview-close" aria-label="Close Level Overview">×</button>
          </header>
          <div class="ux-level-overview-workspace">
            <div class="ux-level-overview-map" aria-label="Remembered current dungeon level"></div>
            <aside class="ux-level-overview-inspector">
              <p class="ux-map-detail-kicker">Inspecting</p>
              <h3 class="ux-level-overview-inspector-title">Hero</h3>
              <p class="ux-level-overview-inspector-description">Known square on the current level.</p>
              <ul class="ux-level-overview-inspector-contents"></ul>
              <p class="ux-map-detail-note">Inspection never moves the hero or spends a turn.</p>
            </aside>
          </div>
        </div>`;
      const dialog = documentRoot.createElement('dialog');
      dialog.id = 'ux-map-detail-dialog';
      dialog.className = 'ux-map-detail-dialog';
      dialog.setAttribute('aria-labelledby', 'ux-map-detail-title');
      dialog.innerHTML = `
        <div class="ux-map-detail-frame">
          <header class="ux-map-detail-header">
            <div><p class="ux-map-detail-kicker">On this square</p><h2 id="ux-map-detail-title">Unknown</h2><p class="ux-map-detail-description"></p></div>
            <button type="button" class="ux-map-detail-close" aria-label="Close tile details">Close</button>
          </header>
          <div class="ux-map-detail-body">
            <div class="ux-map-detail-art" aria-label="Tile artwork"></div>
            <div class="ux-map-detail-information">
              <section class="ux-map-detail-contents-section"><h3>Visible here</h3><ul class="ux-map-detail-contents"></ul></section>
              <section class="ux-map-detail-creature-section" hidden><h3>Creature</h3><ul class="ux-map-detail-creature-facts"></ul></section>
              <section class="ux-map-detail-actions-section" hidden><h3>Available actions</h3><div class="ux-map-detail-actions"></div></section>
              <p class="ux-map-detail-note">Looking does not spend a turn.</p>
            </div>
          </div>
        </div>`;
      documentRoot.body.append(dialog, overviewDialog);
      elements = {
        toolbar,
        dialog,
        minimapButton,
        minimapCanvas: minimapButton.querySelector('.ux-minimap-canvas'),
        overviewDialog,
        overviewClose: overviewDialog.querySelector('.ux-level-overview-close'),
        overviewMap: overviewDialog.querySelector('.ux-level-overview-map'),
        overviewInspectorTitle: overviewDialog.querySelector('.ux-level-overview-inspector-title'),
        overviewInspectorDescription: overviewDialog.querySelector('.ux-level-overview-inspector-description'),
        overviewInspectorContents: overviewDialog.querySelector('.ux-level-overview-inspector-contents'),
        scaleDown: toolbar.querySelector('.ux-map-scale-down'),
        scaleUp: toolbar.querySelector('.ux-map-scale-up'),
        scaleValue: toolbar.querySelector('.ux-map-scale-value'),
        glyphToggle: toolbar.querySelector('.ux-map-glyph-toggle'),
        contrastToggle: toolbar.querySelector('.ux-map-contrast-toggle'),
        closeButton: dialog.querySelector('.ux-map-detail-close'),
        title: dialog.querySelector('#ux-map-detail-title'),
        description: dialog.querySelector('.ux-map-detail-description'),
        art: dialog.querySelector('.ux-map-detail-art'),
        contentsSection: dialog.querySelector('.ux-map-detail-contents-section'),
        contents: dialog.querySelector('.ux-map-detail-contents'),
        creatureFactsSection: dialog.querySelector('.ux-map-detail-creature-section'),
        creatureFacts: dialog.querySelector('.ux-map-detail-creature-facts'),
        actionsSection: dialog.querySelector('.ux-map-detail-actions-section'),
        actions: dialog.querySelector('.ux-map-detail-actions'),
      };
      elements.scaleDown.addEventListener('click', () => changeScale(-0.25));
      elements.scaleUp.addEventListener('click', () => changeScale(0.25));
      elements.glyphToggle.addEventListener('click', () => toggleSetting('glyphOverlay', 'ux-map-glyph-overlay', elements.glyphToggle));
      elements.contrastToggle.addEventListener('click', () => toggleSetting('highContrast', 'ux-map-high-contrast', elements.contrastToggle));
      elements.closeButton.addEventListener('click', () => close());
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); close('escape'); });
      dialog.addEventListener('click', (event) => { if (event.target === dialog) close('backdrop'); });
      minimapButton.addEventListener('click', openOverview);
      elements.overviewClose.addEventListener('click', () => closeOverview());
      elements.overviewMap.addEventListener('click', inspectOverviewCell);
      overviewDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeOverview('escape'); });
      overviewDialog.addEventListener('click', (event) => { if (event.target === overviewDialog) closeOverview('backdrop'); });
      return true;
    }
    function onPublicState(snapshot) {
      publicState = snapshot || {};
      applySettings(publicState.presentationSettings?.map || {});
      renderMinimap();
      if (elements.dialog?.open && selection) render();
      if (elements.overviewDialog?.open) {
        renderOverviewMap();
        renderOverviewInspection(overviewSelection || cursor());
      }
    }
    function attach() {
      if (!buildDom()) return false;
      grid.addEventListener('click', onClick, true);
      browserRoot?.addEventListener?.('keydown', onWindowKeydown, true);
      browserRoot?.addEventListener?.('nethack:map-presentation-changed', onMapPresentationChanged);
      if (runtime?.subscribePublicState) subscription = runtime.subscribePublicState('map', onPublicState);
      applySettings(runtime?.latestPublicState?.()?.snapshot?.presentationSettings?.map || SettingsStore?.defaultSettings?.map || {});
      diagnostic('map.detail-controller-attached', { clickOpensDialog: true, clickDispatch: false });
      return true;
    }
    function destroy() {
      grid?.removeEventListener?.('click', onClick, true);
      browserRoot?.removeEventListener?.('keydown', onWindowKeydown, true);
      browserRoot?.removeEventListener?.('nethack:map-presentation-changed', onMapPresentationChanged);
      subscription?.unsubscribe?.();
      elements.dialog?.remove?.();
      elements.minimapButton?.remove?.();
      elements.overviewDialog?.remove?.();
      mount?.replaceChildren?.();
    }

    return Object.freeze({
      version,
      attach,
      destroy,
      open,
      close,
      select,
      exit: () => close('api'),
      model: () => selection ? modelFor(selection) : null,
      selection: () => selection,
      active: () => Boolean(elements.dialog?.open),
      openOverview,
      closeOverview,
      overviewActive: () => Boolean(elements.overviewDialog?.open),
      overviewSelection: () => overviewSelection,
      setActionProvider(provider) { actionProvider = provider && typeof provider === 'object' ? provider : null; if (elements.dialog?.open) render(); },
      setTargetMetadata() { return null; },
      applySettings,
      element: () => elements.dialog,
    });
  }

  function autoInstall() {
    const root = browserRoot;
    const runtime = RuntimeModule?.runtime;
    if (!root?.document || !runtime?.registerDomain || runtime.domain?.('map')) return null;
    const controller = createController({
      documentRoot: root.document,
      runtime,
      contextActions: root.NetHackUxContextActionPresentation,
      onDiagnostic: (entry) => root.dispatchEvent?.(new root.CustomEvent('nethack:ux-diagnostic', { detail: Object.freeze({ component: 'map', ...entry }) })),
    });
    runtime.registerDomain('map', controller);
    controller.attach();
    return controller;
  }

  const api = Object.freeze({
    version,
    coordinate,
    sentenceCase,
    minimapTone,
    createMinimapModel,
    publicDisplayName,
    publicObjectLayerName,
    publicLayersForCell,
    publicFallbackLabel,
    publicStateCues,
    publicCreatureFacts,
    creatureFactRows,
    chebyshevDistance,
    normalizePublicActions,
    createMapDetailModel,
    createController,
    autoInstall,
  });

  if (browserRoot?.document) {
    /* External scripts receive a microtask checkpoint between tags. Defer to a
       task so target/context collaborators and renderer hooks have loaded. */
    browserRoot.setTimeout(() => {
      try { browserRoot.NetHackUxMapDetailController = autoInstall(); }
      catch (error) { browserRoot.console?.error?.('Map detail controller failed to attach', error); }
    });
  }
  return api;
}));
