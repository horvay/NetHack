(function initUxMapInspector(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../shared/map-presentation'),
      require('./runtime'),
      require('./settings-store'),
    );
  } else {
    root.NetHackUxMapInspector = factory(root.NetHackMapPresentation, root.NetHackUxRuntime, root.NetHackUxSettingsStore, root);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(MapPresentation, RuntimeModule, SettingsStore, browserRoot) {
  const version = 'nethack-map-inspector/v1';
  const modes = Object.freeze(['inspect', 'target', 'travel']);
  const validations = Object.freeze(['core-will-validate', 'confirmed-legal', 'confirmed-illegal']);
  const mapWidth = 80;
  const mapHeight = 21;

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
    if (objectLabel) layers.push(normalizeLayer(cell.objectLayerSemanticKnown === false ? 'visible' : 'object', objectLabel));
    if (label) layers.push(normalizeLayer(cell.semanticKnown === false ? 'visible' : (['monster', 'pet', 'hero', 'player'].includes(kind) ? 'creature' : (kind || 'feature')), label));
    if (!layers.length && publicFallbackLabel(cell) !== 'Unknown') layers.push(normalizeLayer('terrain', publicFallbackLabel(cell)));
    return Object.freeze(layers.filter(Boolean));
  }
  function publicAttitudeForCell(cell = {}, contextActions) {
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
  function chebyshevDistance(from, to) {
    if (!from || !to) return undefined;
    return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  }
  function normalizePublicActions(actions = []) {
    return Object.freeze((Array.isArray(actions) ? actions : []).map((action) => {
      const id = text(action.id);
      const label = text(action.label);
      if (!id || !label) throw new TypeError('MapInspectorModel public actions require id and label');
      return Object.freeze({
        id,
        label,
        danger: action.danger === 'serious' ? 'serious' : (action.danger === 'caution' ? 'caution' : 'none'),
        ...(action.dispatchToken ? { dispatchToken: text(action.dispatchToken) } : {}),
      });
    }));
  }
  function initialInspectionState(origin = { x: 0, y: 0 }) {
    const selectedCell = coordinate(origin) || Object.freeze({ x: 0, y: 0 });
    return Object.freeze({ active: false, selectedCell, hoveredCell: null, dispatchRequest: null, revision: 0 });
  }
  function reduceInspectionState(previous, event = {}, bounds = { width: mapWidth, height: mapHeight }) {
    const state = previous || initialInspectionState();
    const clamp = (value, maximum) => Math.max(0, Math.min(Math.max(0, maximum - 1), Number(value) || 0));
    const requested = coordinate(event.cell) || state.selectedCell;
    const selectedCell = Object.freeze({ x: clamp(requested.x, bounds.width || mapWidth), y: clamp(requested.y, bounds.height || mapHeight) });
    if (event.type === 'enter') return Object.freeze({ ...state, active: true, selectedCell, hoveredCell: null, dispatchRequest: null, revision: state.revision + 1 });
    if (event.type === 'click-select' || event.type === 'keyboard-select' || event.type === 'right-click-select') return Object.freeze({ ...state, active: true, selectedCell, hoveredCell: null, dispatchRequest: null, revision: state.revision + 1 });
    if (event.type === 'hover') return Object.freeze({ ...state, hoveredCell: coordinate(event.cell), dispatchRequest: null, revision: state.revision + 1 });
    if (event.type === 'exit') return Object.freeze({ ...state, active: false, hoveredCell: null, dispatchRequest: null, revision: state.revision + 1 });
    if (event.type === 'explicit-action') {
      const actionId = text(event.actionId);
      if (!actionId) throw new TypeError('explicit map action requires actionId');
      return Object.freeze({ ...state, dispatchRequest: Object.freeze({ actionId, selectedCell: state.selectedCell }), revision: state.revision + 1 });
    }
    return state;
  }
  function createMapInspectorModel(input = {}, dependencies = {}) {
    const selectedCell = coordinate(input.selectedCell);
    if (!selectedCell) throw new TypeError('MapInspectorModel.selectedCell requires integer x and y');
    const cell = input.cell && typeof input.cell === 'object' ? input.cell : {};
    const publicLayers = publicLayersForCell(cell);
    const publicLabel = text(input.publicLabel) || publicLayers.at(-1)?.label || publicFallbackLabel(cell);
    const publicAttitude = publicAttitudeForCell(cell, dependencies.contextActions);
    const mode = modes.includes(input.mode) ? input.mode : 'inspect';
    const validation = validations.includes(input.validation) ? input.validation : 'core-will-validate';
    const model = {
      selectedCell,
      publicLabel,
      publicLayers,
      publicActions: normalizePublicActions(input.publicActions),
      mode,
      validation,
      stateCues: publicStateCues(cell, publicAttitude),
    };
    if (publicAttitude) model.publicAttitude = publicAttitude;
    const distance = input.distance == null ? chebyshevDistance(input.origin, selectedCell) : Number(input.distance);
    if (Number.isFinite(distance) && distance >= 0) model.distance = distance;
    return Object.freeze(model);
  }

  function createController(options = {}) {
    const documentRoot = options.documentRoot || (typeof document !== 'undefined' ? document : null);
    const runtime = options.runtime || RuntimeModule?.runtime;
    const contextActions = options.contextActions || browserRoot?.NetHackUxContextActionPresentation;
    const targetPresentation = options.targetPresentation || browserRoot?.NetHackUxTargetPresentation;
    const diagnostics = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {};
    const grid = options.grid || documentRoot?.getElementById?.('game-grid');
    const mount = options.mount || documentRoot?.getElementById?.('ux-map-overlay-root');
    const storage = options.storage || browserRoot?.localStorage;
    let settingsStore;
    let publicState = null;
    let selection = null;
    let hovered = null;
    let active = false;
    let actionProvider = null;
    let targetMetadata = null;
    let targetMetadataSource = '';
    let mutationFrame = 0;
    let observer;
    let subscription;
    let elements = {};

    function diagnostic(type, detail = {}) {
      try { diagnostics(Object.freeze({ type, detail: Object.freeze({ ...detail }) })); } catch {}
    }
    function gameState() { return publicState?.game || {}; }
    function cells() { return gameState().mapCells || []; }
    function cursor() { return coordinate(gameState().cursor) || coordinateFromGridCursor() || Object.freeze({ x: 0, y: 0 }); }
    function coordinateFromGridCursor() {
      const [x, y] = text(grid?.dataset?.cursor).split(',').map(Number);
      return Number.isInteger(x) && Number.isInteger(y) ? Object.freeze({ x, y }) : null;
    }
    function cellAt(coord) { return cells()?.[coord?.y]?.[coord?.x] || cellFromElement(cellElement(coord)) || {}; }
    function cellElement(coord) { return coord ? grid?.querySelector?.(`.tile-cell[data-map-x="${coord.x}"][data-map-y="${coord.y}"]`) : null; }
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
    function actionsFor(coord, cell) {
      const provided = actionProvider?.actionsForCell?.(Object.freeze({ coord, cell, publicState })) || [];
      return Array.isArray(provided) ? provided : [];
    }
    function modelFor(coord, mode = targetMetadata ? 'target' : 'inspect') {
      const cell = cellAt(coord);
      const targetApi = targetPresentation || browserRoot?.NetHackUxTargetPresentation;
      const contextApi = contextActions || browserRoot?.NetHackUxContextActionPresentation;
      let validation = 'core-will-validate';
      let publicLabel = '';
      if (targetMetadata && targetApi?.createTargetPresentation) {
        const target = targetApi.createTargetPresentation({ selectedCell: coord, publicLabel: publicFallbackLabel(cell), origin: cursor(), distance: chebyshevDistance(cursor(), coord), metadata: targetMetadata, mode });
        validation = target.validation;
        publicLabel = target.publicLabel;
      }
      return createMapInspectorModel({ selectedCell: coord, cell, origin: cursor(), publicLabel, publicActions: actionsFor(coord, cell), mode, validation }, { contextActions: contextApi });
    }
    function updateCellClasses() {
      if (!grid) return;
      grid.querySelectorAll('.ux-map-selected, .ux-map-hovered, .ux-cue-hero, .ux-cue-pet, .ux-cue-peaceful, .ux-cue-hostile, .ux-cue-known-trap, .ux-target-confirmed-legal, .ux-target-confirmed-illegal').forEach((node) => {
        node.classList.remove('ux-map-selected', 'ux-map-hovered', 'ux-cue-hero', 'ux-cue-pet', 'ux-cue-peaceful', 'ux-cue-hostile', 'ux-cue-known-trap', 'ux-target-confirmed-legal', 'ux-target-confirmed-illegal');
      });
      const selectedNode = cellElement(selection);
      if (selectedNode) {
        const model = modelFor(selection);
        selectedNode.classList.add('ux-map-selected', ...model.stateCues.map((cue) => `ux-cue-${cue}`));
        if (model.validation === 'confirmed-legal') selectedNode.classList.add('ux-target-confirmed-legal');
        if (model.validation === 'confirmed-illegal') selectedNode.classList.add('ux-target-confirmed-illegal');
      }
      if (hovered && (!selection || hovered.x !== selection.x || hovered.y !== selection.y)) cellElement(hovered)?.classList.add('ux-map-hovered');
    }
    function renderActions(model, previewing = false) {
      elements.actions.replaceChildren();
      if (previewing || !model.publicActions.length) {
        const empty = documentRoot.createElement('span');
        empty.className = 'ux-map-inspector-empty';
        empty.textContent = previewing ? 'Click to select this cell before using actions.' : 'No public actions for this cell.';
        elements.actions.append(empty);
        return;
      }
      for (const action of model.publicActions) {
        const button = documentRoot.createElement('button');
        button.type = 'button';
        button.className = `ux-map-inspector-action${action.danger === 'serious' ? ' ux-map-action-danger' : ''}`;
        button.textContent = action.label;
        button.addEventListener('click', () => dispatchAction(action, model));
        elements.actions.append(button);
      }
    }
    function render() {
      if (!elements.panel || !selection) return;
      const model = modelFor(hovered || selection);
      elements.panel.hidden = false;
      elements.panel.dataset.mode = model.mode;
      elements.label.textContent = model.publicLabel;
      const facts = [];
      if (model.distance != null) facts.push(model.distance === 0 ? 'Current square' : `Distance ${model.distance}`);
      if (model.publicAttitude) facts.push(titleCase(model.publicAttitude));
      if (model.mode === 'target') facts.push(model.validation === 'confirmed-legal' ? 'Legal target' : (model.validation === 'confirmed-illegal' ? 'Illegal target' : 'NetHack will validate this target'));
      elements.facts.textContent = facts.join(' · ');
      elements.layers.textContent = model.publicLayers.map((layer) => layer.label).join(' · ') || 'No visible details';
      const previewing = Boolean(hovered && (hovered.x !== selection.x || hovered.y !== selection.y));
      renderActions(previewing ? Object.freeze({ ...model, publicActions: Object.freeze([]) }) : model, previewing);
      elements.inspectButton.setAttribute('aria-pressed', String(active));
      elements.inspectButton.textContent = active ? 'Inspecting' : 'Inspect';
      grid?.classList.toggle('ux-inspect-mode', active);
      updateCellClasses();
    }
    function select(coord, { activate = true, focus = false } = {}) {
      const bounded = {
        x: Math.max(0, Math.min(Number(gameState().mapWidth || mapWidth) - 1, Number(coord?.x) || 0)),
        y: Math.max(0, Math.min(Number(gameState().mapHeight || mapHeight) - 1, Number(coord?.y) || 0)),
      };
      selection = Object.freeze(bounded);
      if (activate) active = true;
      hovered = null;
      render();
      if (focus) grid?.focus?.({ preventScroll: true });
      diagnostic('map.selection-changed', { mode: targetMetadata ? 'target' : 'inspect', turnless: true });
      return modelFor(selection);
    }
    function exit({ restoreFocus = true } = {}) {
      active = false;
      hovered = null;
      grid?.classList.remove('ux-inspect-mode');
      elements.panel.hidden = true;
      updateCellClasses();
      if (restoreFocus) grid?.focus?.({ preventScroll: true });
      diagnostic('map.inspect-closed', { turnless: true });
    }
    function dispatchAction(action, model) {
      if (action.danger === 'serious') {
        elements.confirm.hidden = false;
        elements.confirmText.textContent = `${action.label} ${model.publicLabel}?`;
        elements.confirmButton.onclick = () => {
          elements.confirm.hidden = true;
          requestDispatch(action, model);
        };
        elements.confirmCancel.onclick = () => {
          elements.confirm.hidden = true;
          elements.actions.querySelector('button')?.focus?.();
        };
        elements.confirmCancel.focus?.();
        return;
      }
      requestDispatch(action, model);
    }
    function requestDispatch(action, model) {
      if (typeof actionProvider?.dispatch === 'function') actionProvider.dispatch(action, model);
      else if (typeof browserRoot?.CustomEvent === 'function') {
        grid?.dispatchEvent?.(new browserRoot.CustomEvent('nethack:map-action-request', { bubbles: true, detail: Object.freeze({ action, model }) }));
      }
      diagnostic('map.action-requested', { actionId: action.id, explicit: true });
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
    function applySettings(mapSettings = {}) {
      const scale = Math.max(0.75, Math.min(2, Number(mapSettings.scale) || 1));
      grid?.style?.setProperty('--ux-map-scale', String(scale));
      grid?.classList?.toggle('ux-map-glyph-overlay', Boolean(mapSettings.glyphOverlay));
      grid?.classList?.toggle('ux-map-high-contrast', Boolean(mapSettings.highContrast));
      if (elements.scaleValue) elements.scaleValue.textContent = `${Math.round(scale * 100)}%`;
      if (elements.glyphToggle) elements.glyphToggle.setAttribute('aria-pressed', String(Boolean(mapSettings.glyphOverlay)));
      if (elements.contrastToggle) elements.contrastToggle.setAttribute('aria-pressed', String(Boolean(mapSettings.highContrast)));
    }
    function changeScale(delta) {
      const current = Number(grid?.style?.getPropertyValue('--ux-map-scale')) || 1;
      const scale = Math.max(0.75, Math.min(2, Math.round((current + delta) * 4) / 4));
      applySettings({ scale, glyphOverlay: grid.classList.contains('ux-map-glyph-overlay'), highContrast: grid.classList.contains('ux-map-high-contrast') });
      persistMapSettings({ scale });
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
        <button type="button" class="ux-map-inspect-toggle" aria-pressed="false">Inspect</button>
        <span class="ux-map-toolbar-separator"></span>
        <button type="button" class="ux-map-scale-down" aria-label="Decrease map scale">−</button>
        <span class="ux-map-scale-value">100%</span>
        <button type="button" class="ux-map-scale-up" aria-label="Increase map scale">+</button>
        <button type="button" class="ux-map-glyph-toggle" aria-pressed="false">Glyphs</button>
        <button type="button" class="ux-map-contrast-toggle" aria-pressed="false">High contrast</button>`;
      const panel = documentRoot.createElement('section');
      panel.className = 'ux-map-inspector';
      panel.hidden = true;
      panel.innerHTML = `
        <div class="ux-map-inspector-heading"><span class="ux-map-inspector-kicker">Selected cell</span><strong class="ux-map-inspector-label">Unknown</strong></div>
        <div class="ux-map-inspector-facts"></div>
        <div class="ux-map-inspector-layers"></div>
        <div class="ux-map-inspector-actions"></div>
        <div class="ux-map-danger-confirm" hidden><strong class="ux-map-confirm-text"></strong><div><button type="button" class="ux-map-confirm-cancel">Keep inspecting</button><button type="button" class="ux-map-confirm-action">Confirm attack</button></div></div>
        <p class="ux-map-inspector-help">Click selects only. Use arrows or hjkl to inspect. Enter shows actions. Esc closes Inspect.</p>`;
      mount.append(toolbar, panel);
      const playArea = grid.parentElement;
      if (playArea && mount.parentElement !== playArea) playArea.insertBefore(mount, grid);
      elements = {
        toolbar, panel,
        inspectButton: toolbar.querySelector('.ux-map-inspect-toggle'),
        scaleDown: toolbar.querySelector('.ux-map-scale-down'),
        scaleUp: toolbar.querySelector('.ux-map-scale-up'),
        scaleValue: toolbar.querySelector('.ux-map-scale-value'),
        glyphToggle: toolbar.querySelector('.ux-map-glyph-toggle'),
        contrastToggle: toolbar.querySelector('.ux-map-contrast-toggle'),
        label: panel.querySelector('.ux-map-inspector-label'),
        facts: panel.querySelector('.ux-map-inspector-facts'),
        layers: panel.querySelector('.ux-map-inspector-layers'),
        actions: panel.querySelector('.ux-map-inspector-actions'),
        confirm: panel.querySelector('.ux-map-danger-confirm'),
        confirmText: panel.querySelector('.ux-map-confirm-text'),
        confirmCancel: panel.querySelector('.ux-map-confirm-cancel'),
        confirmButton: panel.querySelector('.ux-map-confirm-action'),
      };
      elements.inspectButton.addEventListener('click', () => active ? exit() : select(selection || cursor(), { focus: true }));
      elements.scaleDown.addEventListener('click', () => changeScale(-0.25));
      elements.scaleUp.addEventListener('click', () => changeScale(0.25));
      elements.glyphToggle.addEventListener('click', () => toggleSetting('glyphOverlay', 'ux-map-glyph-overlay', elements.glyphToggle));
      elements.contrastToggle.addEventListener('click', () => toggleSetting('highContrast', 'ux-map-high-contrast', elements.contrastToggle));
      return true;
    }
    function coordFromEvent(event) {
      const node = event.target?.closest?.('.tile-cell');
      if (!node || !grid.contains(node)) return null;
      const x = Number(node.dataset.mapX);
      const y = Number(node.dataset.mapY);
      return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
    }
    function onClick(event) {
      const coord = coordFromEvent(event);
      if (!coord) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      select(coord, { activate: true, focus: true });
    }
    function onContextMenu(event) {
      const coord = coordFromEvent(event);
      if (!coord) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      select(coord, { activate: true, focus: true });
      elements.actions.querySelector('button')?.focus?.({ preventScroll: true });
    }
    function onPointerMove(event) {
      if (!active) return;
      const coord = coordFromEvent(event);
      if (!coord || (hovered && hovered.x === coord.x && hovered.y === coord.y)) return;
      hovered = Object.freeze(coord);
      render();
    }
    function onPointerLeave() {
      if (!hovered) return;
      hovered = null;
      render();
    }
    const keyDelta = Object.freeze({ ArrowLeft: [-1, 0], h: [-1, 0], ArrowRight: [1, 0], l: [1, 0], ArrowUp: [0, -1], k: [0, -1], ArrowDown: [0, 1], j: [0, 1], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1] });
    function onKeydown(event) {
      if (!active || event.target !== grid) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); exit(); return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); event.stopImmediatePropagation(); elements.actions.querySelector('button')?.focus?.({ preventScroll: true }); return;
      }
      const delta = keyDelta[event.key];
      if (!delta) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const base = selection || cursor();
      select({ x: base.x + delta[0], y: base.y + delta[1] }, { activate: true, focus: true });
    }
    function onPublicState(snapshot) {
      publicState = snapshot || {};
      applySettings(publicState.presentationSettings?.map || {});
      const promptMetadata = gameState().targetMetadata;
      const targetApi = targetPresentation || browserRoot?.NetHackUxTargetPresentation;
      if (promptMetadata && targetApi?.acceptMetadata) {
        try {
          targetMetadata = targetApi.acceptMetadata(targetMetadataSource === 'public-state' ? targetMetadata : null, promptMetadata, { activePromptId: gameState().activePrompt?.requestId || gameState().activePrompt?.promptId || '' });
          targetMetadataSource = 'public-state';
        } catch (error) { diagnostic('target.metadata-rejected', { message: text(error?.message || error) }); }
      } else if (targetMetadataSource === 'public-state') { targetMetadata = null; targetMetadataSource = ''; }
      if (!selection) selection = cursor();
      else {
        selection = Object.freeze({
          x: Math.max(0, Math.min(Number(gameState().mapWidth || mapWidth) - 1, selection.x)),
          y: Math.max(0, Math.min(Number(gameState().mapHeight || mapHeight) - 1, selection.y)),
        });
      }
      if (active) render();
      else updateCellClasses();
    }
    function attach() {
      if (!buildDom()) return false;
      grid.addEventListener('click', onClick, true);
      grid.addEventListener('contextmenu', onContextMenu, true);
      grid.addEventListener('mousemove', onPointerMove, { passive: true });
      grid.addEventListener('mouseleave', onPointerLeave, { passive: true });
      grid.addEventListener('keydown', onKeydown, true);
      observer = typeof browserRoot?.MutationObserver === 'function' ? new browserRoot.MutationObserver(() => {
        if (mutationFrame) return;
        const request = browserRoot.requestAnimationFrame || ((callback) => browserRoot.setTimeout(callback, 0));
        mutationFrame = request(() => { mutationFrame = 0; updateCellClasses(); });
      }) : null;
      observer?.observe?.(grid, { childList: true, subtree: true });
      if (runtime?.subscribePublicState) subscription = runtime.subscribePublicState('map', onPublicState);
      applySettings(runtime?.latestPublicState?.()?.snapshot?.presentationSettings?.map || SettingsStore?.defaultSettings?.map || {});
      /* The grid may not have received its first public cursor when the UX
         domain attaches. Leave selection unset so the first public snapshot
         anchors Inspect to the actual hero instead of an invented 0,0 cell. */
      selection = coordinateFromGridCursor();
      diagnostic('map.controller-attached', { clickDispatch: false, keyboardInspect: true });
      return true;
    }
    function destroy() {
      grid?.removeEventListener?.('click', onClick, true);
      grid?.removeEventListener?.('contextmenu', onContextMenu, true);
      grid?.removeEventListener?.('mousemove', onPointerMove);
      grid?.removeEventListener?.('mouseleave', onPointerLeave);
      grid?.removeEventListener?.('keydown', onKeydown, true);
      observer?.disconnect?.();
      subscription?.unsubscribe?.();
      mount?.replaceChildren?.();
    }

    return Object.freeze({
      version,
      attach,
      destroy,
      select,
      exit,
      model: () => selection ? modelFor(selection) : null,
      selection: () => selection,
      active: () => active,
      setActionProvider(provider) { actionProvider = provider && typeof provider === 'object' ? provider : null; if (active) render(); },
      setTargetMetadata(metadata) {
        const targetApi = targetPresentation || browserRoot?.NetHackUxTargetPresentation;
        targetMetadata = metadata ? targetApi?.acceptMetadata?.(targetMetadataSource === 'provider' ? targetMetadata : null, metadata) : null;
        targetMetadataSource = targetMetadata ? 'provider' : '';
        if (active) render();
        return targetMetadata;
      },
      applySettings,
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
      targetPresentation: root.NetHackUxTargetPresentation,
      onDiagnostic: (entry) => root.dispatchEvent?.(new root.CustomEvent('nethack:ux-diagnostic', { detail: Object.freeze({ component: 'map', ...entry }) })),
    });
    runtime.registerDomain('map', controller);
    controller.attach();
    return controller;
  }

  const api = Object.freeze({
    version,
    modes,
    validations,
    coordinate,
    sentenceCase,
    publicDisplayName,
    publicObjectLayerName,
    publicLayersForCell,
    publicFallbackLabel,
    publicStateCues,
    chebyshevDistance,
    normalizePublicActions,
    initialInspectionState,
    reduceInspectionState,
    createMapInspectorModel,
    createController,
    autoInstall,
  });

  if (browserRoot?.document) {
    /* External scripts receive a microtask checkpoint between tags. Defer to a
       task so target/context collaborators and renderer hooks have loaded. */
    browserRoot.setTimeout(() => {
      try { browserRoot.NetHackUxMapInspectorController = autoInstall(); }
      catch (error) { browserRoot.console?.error?.('UXM-04 map controller failed to attach', error); }
    });
  }
  return api;
}));
