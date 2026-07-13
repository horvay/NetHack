(function initUxEquipmentScreen(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(
    require('./item-presentation'), require('./item-detail-panel'), require('../shared/equipment-snapshot-adapter'), null, null,
  );
  else root.NetHackUxEquipmentScreen = factory(root.NetHackUxItemPresentation, root.NetHackUxItemDetailPanel, root.NetHackEquipmentSnapshotAdapter, root.NetHackUxRuntime, root.NetHackUxAppMounts);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(ItemPresentation, ItemDetailPanel, EquipmentAdapter = {}, UxRuntimeModule = null, AppMounts = null) {
  const version = 'nethack-ux-equipment-screen/v1';
  const GROUPS = Object.freeze([
    Object.freeze({ id: 'head', label: 'Head & neck', rail: 'left', slots: Object.freeze(['armor.helm', 'eyes', 'amulet']) }),
    Object.freeze({ id: 'layers', label: 'Armor layers', rail: 'left', slots: Object.freeze(['armor.cloak', 'armor.body', 'armor.shirt']) }),
    Object.freeze({ id: 'hands-feet', label: 'Hands & feet', rail: 'left', slots: Object.freeze(['armor.gloves', 'armor.boots', 'armor.shield']) }),
    Object.freeze({ id: 'weapons', label: 'Weapons', rail: 'right', slots: Object.freeze(['mainHand', 'offHand']) }),
    Object.freeze({ id: 'rings', label: 'Rings', rail: 'right', slots: Object.freeze(['ring.left', 'ring.right']) }),
    Object.freeze({ id: 'ready', label: 'Ready', rail: 'right', slots: Object.freeze(['quiver']) }),
  ]);
  const SLOT_LABELS = ItemPresentation.SLOT_LABELS;

  function element(doc, tag, className, value) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  }
  function list(value, preferredKey) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.[preferredKey])) return value[preferredKey];
    return [];
  }
  function inventoryItems(data) { return list(data?.inventory, 'orderedItems'); }
  function equipmentSlots(data) { return list(data?.equipment, 'orderedSlots'); }
  function slotMap(data) { return new Map(equipmentSlots(data).map((slot) => [slot.slotId, slot])); }
  function selectorFor(item) {
    if (typeof item?.inventoryLetter === 'string') return item.inventoryLetter;
    const code = Number(item?.selector);
    return Number.isInteger(code) && code > 0 && code < 128 ? String.fromCharCode(code) : String(item?.selector || '');
  }
  function slotItem(slot, inventoryById) {
    const item = slot?.item || (slot?.objectId != null ? inventoryById.get(slot.objectId) : null);
    if (!item?.publicClass) return item;
    const allowed = item.publicClass === 'weapon' ? new Set(['mainHand', 'offHand', 'quiver'])
      : item.publicClass === 'armor' ? new Set(['armor.body', 'armor.cloak', 'armor.shirt', 'armor.helm', 'armor.gloves', 'armor.boots', 'armor.shield'])
        : item.publicClass === 'ring' ? new Set(['ring.left', 'ring.right'])
          : item.publicClass === 'amulet' ? new Set(['amulet'])
            : item.publicClass === 'tool' ? new Set(['eyes']) : new Set();
    return allowed.has(slot?.slotId) && (!Array.isArray(item.equipmentSlots) || item.equipmentSlots.includes(slot.slotId)) ? item : null;
  }
  function equippedComparison(selected, items) {
    if (!selected || selected.equippedState || !selected.equipmentSlots?.length) return null;
    return items.find((candidate) => candidate.equippedState && candidate.stableId !== selected.stableId
      && candidate.occupiedEquipmentSlots?.length
      && selected.equipmentSlots.some((slot) => candidate.occupiedEquipmentSlots.includes(slot))) || null;
  }
  function publicDispatchPayload(action, item) {
    return Object.freeze({ action, item: item.dispatchIdentity, stableId: item.stableId });
  }
  function publicBlockerLabel(token) {
    return typeof EquipmentAdapter.publicEquipmentBlockerLabel === 'function'
      ? EquipmentAdapter.publicEquipmentBlockerLabel(token)
      : String(token || '').replace(/^blocked\./, '').replace(/[.-]/g, ' ');
  }
  function pseudoSlotItem(slotId, slot) {
    const blockers = (slot?.blockedBy || []).map(publicBlockerLabel);
    const blockedActions = Object.freeze(blockers.map((reason, index) => Object.freeze({ id: `slot-blocker-${index}`, label: 'Change equipment', enabled: false, disabledReason: reason, section: 'primary', danger: 'safe', shortcut: '' })));
    return Object.freeze({
      stableId: `slot:${slotId}`,
      selectorAccelerator: '',
      icon: Object.freeze({ glyph: '◇', alt: '' }),
      displayName: `${slot?.publicStatus === 'blocked' ? 'Blocked' : 'Empty'} ${String(SLOT_LABELS[slotId] || slotId).toLocaleLowerCase()} slot`,
      appearance: '', calledName: '', individualName: '', quantity: 1,
      filterGroups: Object.freeze([]), equippedState: '', ownership: null,
      equipmentSlots: Object.freeze([slotId]), occupiedEquipmentSlots: Object.freeze([]), knownState: 'identified', knownFields: Object.freeze({}),
      actions: blockedActions,
      blockedActions,
      dispatchIdentity: Object.freeze({ stableId: `slot:${slotId}`, slotId }),
    });
  }

  function createController(options = {}) {
    const runtime = options.runtime || UxRuntimeModule?.runtime || null;
    let mount = options.mount || null;
    let root = null;
    let data = {};
    let models = Object.freeze([]);
    let activeMode = 'equipment';
    let selectedStableId = '';
    let selectedSlotId = '';
    let query = '';
    let filter = 'all';
    let pendingActionId = '';
    let contextMenu = null;
    let focusLayer = null;
    let invoker = null;
    let unsubscribe = null;
    const diagnostics = [];

    function diagnostic(type, detail = {}) {
      const entry = Object.freeze({ type, detail: Object.freeze({ ...detail }), sequence: diagnostics.length + 1 });
      diagnostics.push(entry);
      if (diagnostics.length > 100) diagnostics.shift();
      try { options.onDiagnostic?.(entry); } catch {}
    }
    function currentMount(doc) {
      if (mount) return mount;
      try { mount = AppMounts?.lookupMount?.('items', doc); } catch {}
      return mount;
    }
    function selectedModel() {
      if (selectedSlotId) {
        const slots = slotMap(data);
        const slot = slots.get(selectedSlotId);
        const item = slotItem(slot, new Map(inventoryItems(data).map((entry) => [entry.objectId, entry])));
        if (item) return ItemPresentation.presentItem(item, { iconResolver: data.iconResolver, actionContext: { items: inventoryItems(data) } });
        return pseudoSlotItem(selectedSlotId, slot);
      }
      return models.find((model) => model.stableId === selectedStableId) || null;
    }
    function preserveSelection(nextModels) {
      const current = selectedModel();
      if (selectedSlotId && slotMap(data).has(selectedSlotId)) return;
      selectedSlotId = '';
      if (selectedStableId && nextModels.some((model) => model.stableId === selectedStableId)) return;
      const selector = current?.selectorAccelerator;
      selectedStableId = selector ? (nextModels.find((model) => model.selectorAccelerator === selector)?.stableId || '') : '';
      if (!selectedStableId) selectedStableId = nextModels[0]?.stableId || '';
    }
    function normalizeData(next = {}) {
      data = { ...data, ...next };
      const presentedModels = ItemPresentation.presentItems(inventoryItems(data), {
        iconResolver: data.iconResolver,
        actionService: data.actionService,
        actionContext: { items: inventoryItems(data) },
      });
      const authoritativeSlots = equipmentSlots(data);
      const occupiedByObjectId = new Map();
      for (const slot of authoritativeSlots) {
        const objectId = slot?.objectId ?? slot?.item?.objectId;
        if (objectId == null || slot.publicStatus === 'empty') continue;
        occupiedByObjectId.set(objectId, Object.freeze([...(occupiedByObjectId.get(objectId) || []), slot.slotId]));
      }
      const nextModels = Object.freeze(presentedModels.map((model) => authoritativeSlots.length
        ? Object.freeze({ ...model, occupiedEquipmentSlots: occupiedByObjectId.get(model.dispatchIdentity.objectId) || Object.freeze([]) }) : model));
      preserveSelection(nextModels);
      models = nextModels;
    }
    function filteredModels() { return models.filter((model) => ItemPresentation.matchesItem(model, query, filter)); }
    function closeContextMenu({ restore = true } = {}) {
      if (!contextMenu) return false;
      const returnTarget = contextMenu.__returnTarget;
      focusLayer?.close?.(contextMenu, { restore: false });
      contextMenu.remove();
      contextMenu = null;
      if (restore && returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
      return true;
    }
    async function dispatch(action, item, button) {
      if (!action?.enabled || pendingActionId) return false;
      pendingActionId = action.id || 'pending';
      render();
      diagnostic('item.action-dispatched', { actionId: action.id, stableId: item.stableId });
      try {
        const dispatchFn = data.onDispatch || options.onDispatch;
        if (typeof dispatchFn !== 'function') {
          diagnostic('item.action-unwired', { actionId: action.id });
          return false;
        }
        const result = await dispatchFn(publicDispatchPayload(action, item));
        return result !== false;
      } catch (error) {
        diagnostic('item.action-failed', { actionId: action.id, message: String(error?.message || error) });
        return false;
      } finally {
        pendingActionId = '';
        if (root?.isConnected) render({ focusStableId: item.stableId, focusActionId: action.id });
      }
    }
    function showContextMenu(item, anchor, point = null) {
      closeContextMenu({ restore: false });
      const doc = root.ownerDocument;
      const actions = item.actions;
      if (!actions.length) return;
      const menu = element(doc, 'div', 'uxm-item-context-menu');
      menu.setAttribute('role', 'menu');
      menu.tabIndex = -1;
      menu.__returnTarget = anchor;
      menu.append(element(doc, 'strong', 'uxm-context-title', item.displayName));
      for (const action of actions) {
        const button = element(doc, 'button', `uxm-context-action${['caution', 'serious', 'dangerous'].includes(action.danger) ? ' is-dangerous' : ''}`, action.label);
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.dataset.actionId = action.id;
        button.disabled = !action.enabled || Boolean(pendingActionId);
        if (!action.enabled && action.disabledReason) button.title = action.disabledReason;
        button.addEventListener('click', () => { closeContextMenu({ restore: false }); dispatch(action, item, button); });
        menu.appendChild(button);
      }
      root.appendChild(menu);
      const anchorRect = anchor.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const left = (point?.x ?? anchorRect.left) - rootRect.left;
      const top = (point?.y ?? anchorRect.bottom) - rootRect.top;
      menu.style.left = `${Math.max(8, Math.min(left, rootRect.width - Math.min(360, menu.offsetWidth || 320) - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(top, rootRect.height - Math.min(520, menu.offsetHeight || 420) - 8))}px`;
      contextMenu = menu;
      focusLayer?.open?.({ id: 'uxm-item-context', element: menu, domain: 'items', initialFocus: 'first-action', returnFocus: anchor, escapePolicy: 'close' });
      menu.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    }
    function renderIcon(doc, model) {
      const box = element(doc, 'span', 'uxm-item-icon');
      box.setAttribute('aria-hidden', 'true');
      if (model.icon.src) {
        const img = element(doc, 'img', '');
        img.src = model.icon.src;
        img.alt = '';
        box.appendChild(img);
      } else box.textContent = model.icon.glyph || '·';
      return box;
    }
    function renderRow(doc, model) {
      const row = element(doc, 'button', 'uxm-item-row');
      row.type = 'button';
      row.dataset.stableId = model.stableId;
      row.dataset.selector = model.selectorAccelerator;
      row.setAttribute('aria-pressed', String(model.stableId === selectedStableId && !selectedSlotId));
      if (model.stableId === selectedStableId && !selectedSlotId) row.classList.add('is-selected');
      const key = element(doc, 'kbd', 'uxm-item-selector', model.selectorAccelerator || '·');
      const copy = element(doc, 'span', 'uxm-item-row-copy');
      copy.appendChild(element(doc, 'span', 'uxm-item-name', model.displayName));
      const state = element(doc, 'span', 'uxm-item-essential-state');
      if (model.equippedState) state.appendChild(element(doc, 'span', 'uxm-equipped-state', model.equippedState));
      if (model.ownership?.state && model.ownership.state !== 'owned') state.appendChild(element(doc, 'span', 'uxm-ownership-state', model.ownership.state === 'unpaid' ? 'Unpaid' : 'For sale'));
      if (state.childNodes.length) copy.appendChild(state);
      row.append(key, renderIcon(doc, model), copy, element(doc, 'span', 'uxm-item-row-quantity', model.quantity > 1 ? `×${model.quantity}` : ''));
      row.addEventListener('click', () => { selectedSlotId = ''; selectedStableId = model.stableId; render({ focusStableId: model.stableId }); });
      row.addEventListener('dblclick', (event) => { event.preventDefault(); event.stopPropagation(); });
      row.addEventListener('dragstart', (event) => event.preventDefault());
      row.addEventListener('contextmenu', (event) => { event.preventDefault(); selectedSlotId = ''; selectedStableId = model.stableId; render({ skipFocus: true }); const replacement = root.querySelector(`[data-stable-id="${model.stableId}"]`); showContextMenu(model, replacement, { x: event.clientX, y: event.clientY }); });
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); selectedSlotId = ''; selectedStableId = model.stableId; render({ focusStableId: model.stableId }); }
        else if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); showContextMenu(model, row); }
      });
      return row;
    }
    function renderInventory(doc) {
      const pane = element(doc, 'section', 'uxm-inventory-pane');
      pane.dataset.itemMode = 'inventory';
      const toolbar = element(doc, 'div', 'uxm-inventory-tools');
      const title = element(doc, 'div', 'uxm-pane-heading');
      title.append(element(doc, 'span', 'uxm-pane-kicker', 'Carried items'), element(doc, 'h2', '', 'Inventory'));
      const searchLabel = element(doc, 'label', 'uxm-item-search');
      searchLabel.append(element(doc, 'span', '', 'Search items'), element(doc, 'input', ''));
      const input = searchLabel.querySelector('input');
      input.type = 'search'; input.value = query; input.autocomplete = 'off'; input.placeholder = 'Name, selector, or category';
      input.addEventListener('input', () => { query = input.value; render({ focusSearch: true, searchSelection: [input.selectionStart, input.selectionEnd] }); });
      toolbar.append(title, searchLabel);
      const filters = element(doc, 'div', 'uxm-item-filters');
      filters.setAttribute('aria-label', 'Inventory filters');
      for (const definition of ItemPresentation.FILTERS) {
        const button = element(doc, 'button', 'uxm-filter-button', definition.label);
        button.type = 'button'; button.dataset.filter = definition.id;
        button.setAttribute('aria-pressed', String(filter === definition.id));
        if (filter === definition.id) button.classList.add('is-selected');
        button.addEventListener('click', () => { filter = definition.id; render({ focusFilter: definition.id }); });
        filters.appendChild(button);
      }
      pane.append(toolbar, filters);
      const listWrap = element(doc, 'div', 'uxm-inventory-list-wrap');
      const rows = element(doc, 'div', 'uxm-inventory-list');
      const visible = filteredModels();
      if (!models.length) rows.appendChild(element(doc, 'div', 'uxm-item-empty', 'Your inventory is empty. Equipment slots remain available in Equipment.'));
      else if (!visible.length) rows.appendChild(element(doc, 'div', 'uxm-item-empty', 'No items match this search and filter. Clear the search or choose All.'));
      else for (const model of visible) rows.appendChild(renderRow(doc, model));
      listWrap.appendChild(rows);
      pane.appendChild(listWrap);
      const details = element(doc, 'section', 'uxm-inventory-details');
      const selected = selectedModel();
      ItemDetailPanel.renderDetailPanel(details, { item: selected, compareItem: equippedComparison(selected, models), pending: Boolean(pendingActionId), onAction: dispatch });
      pane.appendChild(details);
      return pane;
    }
    function renderSlotButton(doc, slotId, slot, presented) {
      const button = element(doc, 'button', 'uxm-slot-button');
      button.type = 'button'; button.dataset.slotId = slotId;
      if (selectedSlotId === slotId) button.classList.add('is-selected');
      if (slot?.publicStatus === 'blocked' || slot?.blockedBy?.length) button.classList.add('is-blocked');
      if (presented) button.classList.add('is-equipped');
      button.setAttribute('aria-pressed', String(selectedSlotId === slotId));
      const label = element(doc, 'span', 'uxm-slot-label', SLOT_LABELS[slotId] || slot?.label || slotId);
      const value = element(doc, 'span', 'uxm-slot-value', presented?.displayName || (slot?.publicStatus === 'blocked' ? 'Blocked' : 'Empty'));
      button.append(label, value);
      button.addEventListener('click', () => { selectedStableId = presented?.stableId || ''; selectedSlotId = slotId; render({ focusSlotId: slotId }); });
      button.addEventListener('contextmenu', (event) => { if (!presented?.actions?.length) return; event.preventDefault(); selectedStableId = presented.stableId; selectedSlotId = slotId; render({ skipFocus: true }); const replacement = root.querySelector(`[data-slot-id="${slotId}"]`); showContextMenu(presented, replacement, { x: event.clientX, y: event.clientY }); });
      button.addEventListener('keydown', (event) => { if (event.key === 'F10' && event.shiftKey && presented?.actions?.length) { event.preventDefault(); showContextMenu(presented, button); } });
      return button;
    }
    function renderEquipment(doc) {
      const pane = element(doc, 'section', 'uxm-equipment-pane');
      pane.dataset.itemMode = 'equipment';
      const heading = element(doc, 'div', 'uxm-pane-heading uxm-equipment-heading');
      heading.append(element(doc, 'span', 'uxm-pane-kicker', 'Hero at a glance'), element(doc, 'h2', '', 'Equipment'));
      pane.appendChild(heading);
      const stage = element(doc, 'div', 'uxm-paper-doll-stage');
      const safe = element(doc, 'div', 'uxm-character-safe-area');
      const avatar = element(doc, 'div', 'uxm-full-character');
      if (data.avatar?.src) {
        const img = element(doc, 'img', ''); img.src = data.avatar.src; img.alt = data.avatar.alt || '';
        avatar.appendChild(img);
      } else avatar.appendChild(element(doc, 'span', 'uxm-avatar-fallback', '@'));
      safe.appendChild(avatar);
      const slots = slotMap(data);
      const inventoryById = new Map(inventoryItems(data).map((item) => [item.objectId, item]));
      const left = element(doc, 'div', 'uxm-callout-rail uxm-callout-left');
      const right = element(doc, 'div', 'uxm-callout-rail uxm-callout-right');
      for (const group of GROUPS) {
        const groupEl = element(doc, 'section', 'uxm-slot-group');
        groupEl.dataset.group = group.id;
        groupEl.appendChild(element(doc, 'h3', '', group.label));
        for (const slotId of group.slots) {
          const slot = slots.get(slotId) || { slotId, publicStatus: 'empty', blockedBy: [] };
          const rawItem = slotItem(slot, inventoryById);
          const presented = rawItem ? ItemPresentation.presentItem(rawItem, { iconResolver: data.iconResolver, actionService: data.actionService, actionContext: { items: inventoryItems(data) } }) : null;
          groupEl.appendChild(renderSlotButton(doc, slotId, slot, presented));
        }
        (group.rail === 'left' ? left : right).appendChild(groupEl);
      }
      stage.append(left, safe, right);
      pane.appendChild(stage);
      const details = element(doc, 'section', 'uxm-equipment-details');
      const selected = selectedModel();
      ItemDetailPanel.renderDetailPanel(details, { item: selected, slotLabel: selectedSlotId ? (SLOT_LABELS[selectedSlotId] || selectedSlotId) : 'Selected equipment', compareItem: null, pending: Boolean(pendingActionId), onAction: dispatch });
      pane.appendChild(details);
      return pane;
    }
    function render(focus = {}) {
      if (!root) return;
      const doc = root.ownerDocument;
      const inventoryScroll = root.querySelector('.uxm-inventory-list-wrap')?.scrollTop || 0;
      const workspaceScroll = root.querySelector('.uxm-items-content')?.scrollTop || 0;
      closeContextMenu({ restore: false });
      root.textContent = '';
      const shell = element(doc, 'section', 'uxm-items-workspace');
      shell.setAttribute('role', 'dialog'); shell.setAttribute('aria-modal', 'true'); shell.setAttribute('aria-labelledby', 'uxm-items-title');
      const topbar = element(doc, 'header', 'uxm-items-topbar');
      const title = element(doc, 'div', ''); title.append(element(doc, 'span', 'uxm-workspace-kicker', 'Character'), element(doc, 'h1', '', 'Inventory & equipment')); title.querySelector('h1').id = 'uxm-items-title';
      const closeButton = element(doc, 'button', 'uxm-items-close', 'Close'); closeButton.type = 'button'; closeButton.addEventListener('click', close);
      topbar.append(title, closeButton);
      const tabs = element(doc, 'div', 'uxm-items-tabs');
      for (const mode of ['equipment', 'inventory']) {
        const button = element(doc, 'button', '', mode === 'equipment' ? 'Equipment' : 'Inventory'); button.type = 'button'; button.dataset.itemTab = mode;
        button.setAttribute('aria-pressed', String(activeMode === mode));
        if (activeMode === mode) button.classList.add('is-selected');
        button.addEventListener('click', () => { activeMode = mode; render({ focusTab: mode }); });
        tabs.appendChild(button);
      }
      const content = element(doc, 'div', 'uxm-items-content');
      content.dataset.activeMode = activeMode;
      content.append(renderEquipment(doc), renderInventory(doc));
      shell.append(topbar, tabs, content);
      root.appendChild(shell);
      root.hidden = false;
      root.classList.add('uxm-items-overlay');
      const listWrap = root.querySelector('.uxm-inventory-list-wrap'); if (listWrap) listWrap.scrollTop = inventoryScroll;
      content.scrollTop = workspaceScroll;
      if (focus.skipFocus) return;
      let target = null;
      if (focus.focusStableId) target = root.querySelector(`[data-stable-id="${focus.focusStableId}"]`);
      else if (focus.focusSlotId) target = root.querySelector(`[data-slot-id="${focus.focusSlotId}"]`);
      else if (focus.focusFilter) target = root.querySelector(`[data-filter="${focus.focusFilter}"]`);
      else if (focus.focusTab) target = root.querySelector(`[data-item-tab="${focus.focusTab}"]`);
      else if (focus.focusSearch) {
        target = root.querySelector('.uxm-item-search input');
        if (focus.searchSelection && target) target.setSelectionRange?.(...focus.searchSelection);
      } else if (focus.focusActionId) target = root.querySelector(`[data-action-id="${focus.focusActionId}"]`);
      target?.focus?.({ preventScroll: true });
    }
    function handleKeydown(event) {
      if (!root || root.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!closeContextMenu()) close();
        return;
      }
      if (event.key === 'Tab' && focusLayer?.trapTab?.(event)) return;
      if (contextMenu) {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); focusLayer?.moveRoving?.(contextMenu, event.key, '[role="menuitem"]'); }
        return;
      }
      const active = root.ownerDocument.activeElement;
      if (active?.matches?.('input, textarea, select')) return;
      if (/^[A-Za-z$]$/.test(event.key)) {
        const model = models.find((candidate) => candidate.selectorAccelerator === event.key);
        if (model) { event.preventDefault(); selectedSlotId = ''; selectedStableId = model.stableId; activeMode = 'inventory'; render({ focusStableId: model.stableId }); }
      }
    }
    function open(next = {}) {
      const doc = next.documentRoot || options.documentRoot || (typeof document !== 'undefined' ? document : null);
      const targetMount = next.mount || currentMount(doc);
      if (!targetMount) throw new Error('Missing UX items mount');
      invoker = next.invoker || doc.activeElement || invoker;
      mount = targetMount;
      root = mount;
      activeMode = next.initialMode === 'inventory' ? 'inventory' : 'equipment';
      query = ''; filter = 'all'; pendingActionId = '';
      normalizeData(next);
      render({ skipFocus: true });
      focusLayer = runtime?.service?.('dialog')?.focus || null;
      focusLayer?.open?.({ id: 'uxm-items-workspace', element: root, domain: 'items', initialFocus: () => root.querySelector('[data-item-tab].is-selected') || root.querySelector('button'), returnFocus: invoker, escapePolicy: 'close' });
      (root.querySelector('[data-item-tab].is-selected') || root.querySelector('button'))?.focus?.({ preventScroll: true });
      doc.addEventListener('keydown', handleKeydown, true);
      diagnostic('workspace.opened', { inventoryCount: models.length, equipmentSlotCount: equipmentSlots(data).length });
      return controller;
    }
    function update(next = {}) { normalizeData(next); if (root && !root.hidden) render({ skipFocus: true }); return controller; }
    function close() {
      if (!root || root.hidden) return false;
      const doc = root.ownerDocument;
      closeContextMenu({ restore: false });
      doc.removeEventListener('keydown', handleKeydown, true);
      focusLayer?.close?.(root);
      root.hidden = true; root.textContent = ''; root.classList.remove('uxm-items-overlay');
      diagnostic('workspace.closed');
      root = null;
      return true;
    }
    function snapshot() {
      const selected = selectedModel();
      return Object.freeze({ open: Boolean(root && !root.hidden), mode: activeMode, query, filter, selectedStableId: selected?.stableId || '', selectedSlotId, inventoryCount: models.length, visibleCount: filteredModels().length, pendingActionId, horizontalOverflow: root ? root.scrollWidth > root.clientWidth : false });
    }
    function connectRuntime() {
      if (!runtime?.subscribePublicState || unsubscribe) return false;
      const subscription = runtime.subscribePublicState('items', (state) => {
        if (!root || root.hidden) return;
        const game = state?.game || {};
        update({ inventory: game.inventory, equipment: game.equipment });
      });
      unsubscribe = () => subscription.unsubscribe();
      return true;
    }
    function destroy() { close(); unsubscribe?.(); unsubscribe = null; }

    const controller = Object.freeze({ version, open, close, update, snapshot, connectRuntime, destroy, diagnostics: () => Object.freeze(diagnostics.slice()), groups: GROUPS });
    return controller;
  }

  let controller = null;
  const runtime = UxRuntimeModule?.runtime;
  if (runtime?.registerDomain) {
    try {
      controller = createController({ runtime });
      runtime.registerDomain('items', controller);
      controller.connectRuntime();
    } catch (error) {
      controller = runtime.domain?.('items') || null;
    }
  }

  return Object.freeze({ version, GROUPS, createController, equippedComparison, publicDispatchPayload, controller });
}));
