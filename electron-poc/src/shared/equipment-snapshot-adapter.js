(function initEquipmentSnapshotAdapter(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./inventory-snapshot-adapter'), require('./public-blockers'));
  else root.NetHackEquipmentSnapshotAdapter = factory(root.NetHackInventorySnapshotAdapter, root.NetHackPublicBlockers);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(InventorySnapshotAdapter, PublicBlockers = {}) {
  const version = 'nethack-equipment-snapshot-adapter/v1';
  const publicEquipmentBlockerLabels = PublicBlockers.publicEquipmentBlockerLabels || Object.freeze({});
  const publicEquipmentBlockerLabel = PublicBlockers.publicEquipmentBlockerLabel || ((token) => publicEquipmentBlockerLabels[String(token || '')] || 'NetHack must decide this from public equipment state.');

  function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function asNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && Number.isSafeInteger(number) ? number : undefined;
  }
  function cloneStringArray(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []; }
  function clonePublicItem(item) {
    return item ? {
      ...item,
      location: item.location ? { ...item.location } : item.location,
      known: item.known ? { ...item.known } : item.known,
      actionAffordances: Array.isArray(item.actionAffordances) ? item.actionAffordances.slice() : item.actionAffordances,
      publicActionHints: Array.isArray(item.publicActionHints) ? item.publicActionHints.slice() : item.publicActionHints,
    } : undefined;
  }

  const wornMasks = Object.freeze({
    mainHand: 0x00000100,
    offHand: 0x00000400,
    quiver: 0x00000200,
    'armor.body': 0x00000001,
    'armor.cloak': 0x00000002,
    'armor.helm': 0x00000004,
    'armor.gloves': 0x00000010,
    'armor.boots': 0x00000020,
    'armor.shield': 0x00000008,
    'armor.shirt': 0x00000040,
    amulet: 0x00010000,
    'ring.left': 0x00020000,
    'ring.right': 0x00040000,
    eyes: 0x00080000,
  });

  function uniqueTokens(tokens = []) { return Array.from(new Set((tokens || []).map((token) => String(token || '').trim()).filter(Boolean))); }
  function twoHandedWeaponPublicText(itemOrText) { return /\b(?:two-handed sword|quarterstaff|staff|bow|yumi|crossbow|battle-axe|dwarvish mattock|mattock|polearm|halberd|lance)\b/i.test(typeof itemOrText === 'string' ? itemOrText : equipmentItemText(itemOrText)); }

  const canonicalSlots = Object.freeze([
    Object.freeze({ slotId: 'mainHand', rendererSlotId: 'main-hand', label: 'Weapon / main hand', empty: 'Empty hand / no wielded item known', equipKey: 'w', removeKey: 'w', defaultActions: Object.freeze(['wield/change']) }),
    Object.freeze({ slotId: 'offHand', rendererSlotId: 'offhand', label: 'Alternate / offhand', empty: 'No alternate/offhand metadata known', equipKey: 'x', removeKey: 'x', defaultActions: Object.freeze(['swap']) }),
    Object.freeze({ slotId: 'quiver', rendererSlotId: 'quiver', label: 'Quiver / ammo', empty: 'No quivered ammo known', equipKey: 'Q', removeKey: 'Q', defaultActions: Object.freeze(['set quiver', 'throw/fire']) }),
    Object.freeze({ slotId: 'armor.body', rendererSlotId: 'armor-suit', label: 'Armor / body', empty: 'No body armor worn', equipKey: 'W', removeKey: 'T', defaultActions: Object.freeze(['wear armor', 'take off']) }),
    Object.freeze({ slotId: 'armor.cloak', rendererSlotId: 'cloak', label: 'Cloak', empty: 'No cloak worn', equipKey: 'W', removeKey: 'T', defaultActions: Object.freeze(['wear cloak', 'take off']) }),
    Object.freeze({ slotId: 'armor.helm', rendererSlotId: 'helmet', label: 'Helmet / head', empty: 'No helmet worn', equipKey: 'W', removeKey: 'T', defaultActions: Object.freeze(['wear helmet', 'take off']) }),
    Object.freeze({ slotId: 'armor.gloves', rendererSlotId: 'gloves', label: 'Gloves', empty: 'No gloves worn', equipKey: 'W', removeKey: 'T', defaultActions: Object.freeze(['wear gloves', 'take off']) }),
    Object.freeze({ slotId: 'armor.boots', rendererSlotId: 'boots', label: 'Boots', empty: 'No boots worn', equipKey: 'W', removeKey: 'T', defaultActions: Object.freeze(['wear boots', 'take off']) }),
    Object.freeze({ slotId: 'armor.shield', rendererSlotId: 'shield', label: 'Shield', empty: 'No shield worn', equipKey: 'W', removeKey: 'T', defaultActions: Object.freeze(['wear shield', 'take off']) }),
    Object.freeze({ slotId: 'armor.shirt', rendererSlotId: 'shirt', label: 'Shirt', empty: 'No shirt worn', equipKey: 'W', removeKey: 'T', defaultActions: Object.freeze(['wear shirt', 'take off']) }),
    Object.freeze({ slotId: 'amulet', rendererSlotId: 'amulet', label: 'Amulet', empty: 'No amulet worn', equipKey: 'P', removeKey: 'R', defaultActions: Object.freeze(['put on', 'remove']) }),
    Object.freeze({ slotId: 'ring.left', rendererSlotId: 'left-ring', label: 'Left ring', empty: 'No left ring worn', equipKey: 'P', removeKey: 'R', defaultActions: Object.freeze(['put on ring', 'remove']) }),
    Object.freeze({ slotId: 'ring.right', rendererSlotId: 'right-ring', label: 'Right ring', empty: 'No right ring worn', equipKey: 'P', removeKey: 'R', defaultActions: Object.freeze(['put on ring', 'remove']) }),
    Object.freeze({ slotId: 'eyes', rendererSlotId: 'eyes', label: 'Eyes / blindfold', empty: 'No eyewear/blindfold worn', equipKey: 'P', removeKey: 'R', defaultActions: Object.freeze(['put on', 'remove']) }),
  ]);

  const slotById = new Map(canonicalSlots.map((slot) => [slot.slotId, slot]));

  function normalizeEquipmentRevision(value) {
    const revision = asNonNegativeInteger(value);
    return revision == null ? 0 : revision;
  }

  function slotStatusForItem(item) {
    if (!item) return 'empty';
    return 'equipped';
  }

  function publicItemForEquipmentSlot(item, slotId) {
    if (!item) return undefined;
    const copy = clonePublicItem(item);
    copy.location = { kind: 'equipment' };
    return copy;
  }

  function equipmentItemText(item) {
    return String(item?.text || item?.displayName || item?.semanticName || item?.semanticAppearance || '').trim();
  }

  function equipmentComparableText(item) {
    return equipmentItemText(item)
      .replace(/^\s*[A-Za-z$]\s*-\s*/i, '')
      .replace(/\s*\((?:weapon in (?:hand|hands|left hand|right hand)|wielded|alternate weapon; not wielded|secondary weapon|offhand|off-hand|being worn|in quiver|on (?:left|right) hand)\)\s*/ig, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function explicitlyAlternateItem(item) {
    const text = equipmentItemText(item);
    if (/\bweapon in hands\b/i.test(text)) return false;
    return /\b(?:alternate weapon|secondary weapon|offhand|off-hand|not wielded)\b/i.test(text);
  }

  function sameEquipmentObject(a, b) {
    return Boolean(a && b && ((a.objectId != null && b.objectId != null && a.objectId === b.objectId) || (a.inventoryLetter && b.inventoryLetter && a.inventoryLetter === b.inventoryLetter)));
  }

  function sameKnownEquipmentItem(a, b) {
    if (!a || !b) return false;
    if (sameEquipmentObject(a, b)) return true;
    const left = equipmentComparableText(a);
    const right = equipmentComparableText(b);
    return Boolean(left && right && left === right);
  }

  function normalizeEquipmentSlot(slot = {}) {
    if (!isPlainObject(slot)) return null;
    const slotId = typeof slot.slotId === 'string' && slotById.has(slot.slotId) ? slot.slotId : (typeof slot.slotId === 'string' ? slot.slotId : '');
    if (!slotId) return null;
    const definition = slotById.get(slotId) || { slotId, label: slotId, rendererSlotId: slotId, defaultActions: [] };
    const objectId = asNonNegativeInteger(slot.objectId);
    const wornMask = asNonNegativeInteger(slot.wornMask ?? wornMasks[slotId]);
    const item = slot.item ? InventorySnapshotAdapter.normalizePublicInventoryItem({ ...slot.item, selector: slot.item.inventoryLetter || slot.item.selector }) : undefined;
    const out = {
      slotId,
      label: typeof slot.label === 'string' && slot.label.trim() ? slot.label.trim() : definition.label,
      wornMask: wornMask ?? wornMasks[slotId] ?? 0,
      blockedBy: cloneStringArray(slot.blockedBy),
      publicStatus: typeof slot.publicStatus === 'string' ? slot.publicStatus : slotStatusForItem(item || (objectId != null ? { objectId } : null)),
      actions: cloneStringArray(slot.actions).length ? cloneStringArray(slot.actions) : Array.from(definition.defaultActions || []),
    };
    if (definition.rendererSlotId) out.rendererSlotId = definition.rendererSlotId;
    if (objectId != null) out.objectId = objectId;
    if (item) out.item = publicItemForEquipmentSlot(item, slotId);
    return out;
  }

  function normalizeEquipmentSnapshotPayload(payload = {}) {
    const revision = normalizeEquipmentRevision(payload.revision);
    const inventoryRevision = normalizeEquipmentRevision(payload.inventoryRevision);
    const slots = Array.isArray(payload.slots) ? payload.slots.map(normalizeEquipmentSlot).filter(Boolean) : [];
    const mainHand = slots.find((slot) => slot.slotId === 'mainHand');
    const sanitizedSlots = slots.map((slot) => {
      if (slot.slotId !== 'offHand' || !slot.item || !mainHand?.item) return slot;
      if (sameEquipmentObject(slot.item, mainHand.item) || (!explicitlyAlternateItem(slot.item) && sameKnownEquipmentItem(slot.item, mainHand.item))) {
        const copy = { ...slot, publicStatus: 'empty' };
        delete copy.objectId;
        delete copy.item;
        return copy;
      }
      return slot;
    });
    return Object.freeze({ revision, inventoryRevision, slots: Object.freeze(sanitizedSlots.map((slot) => Object.freeze(slot))) });
  }

  function inventoryItemsFromEvent(event = {}) {
    if (Array.isArray(event.items)) return event.items;
    if (event.inventory && Array.isArray(event.inventory.orderedItems)) return event.inventory.orderedItems;
    return [];
  }

  function publicBlockersForSlot(slotId, byMask = new Map()) {
    const tokens = [];
    const has = (id) => Boolean(byMask.get(id));
    if (slotId === 'armor.shirt' && has('armor.body')) tokens.push('blocked.armor.bodyOverShirt');
    if (slotId === 'armor.body' && has('armor.body') && has('armor.shirt')) tokens.push('blocked.armor.bodyOverShirt');
    if (slotId === 'armor.body' && has('armor.cloak')) tokens.push('blocked.armor.cloakOverBody');
    if (slotId === 'armor.cloak' && has('armor.cloak')) tokens.push('blocked.armor.slotOccupied');
    if (slotId === 'armor.body' && has('armor.body') && !has('armor.shirt')) tokens.push('blocked.armor.slotOccupied');
    if (slotId === 'armor.shirt' && has('armor.shirt') && !has('armor.body')) tokens.push('blocked.armor.slotOccupied');
    if (slotId === 'ring.left' && has('ring.left')) tokens.push('blocked.ring.leftOccupied');
    if (slotId === 'ring.right' && has('ring.right')) tokens.push('blocked.ring.rightOccupied');
    if ((slotId === 'ring.left' || slotId === 'ring.right') && has('ring.left') && has('ring.right')) tokens.push('blocked.ring.bothOccupied');
    if (slotId === 'amulet' && has('amulet')) tokens.push('blocked.accessory.slotOccupied');
    if (slotId === 'eyes' && has('eyes')) tokens.push('blocked.accessory.slotOccupied');
    if (slotId === 'quiver' && has('quiver')) tokens.push('blocked.hands.quiverOccupied');
    if (slotId === 'mainHand' && has('offHand')) tokens.push('blocked.hands.twoWeaponing');
    if (slotId === 'offHand') {
      if (has('armor.shield')) tokens.push('blocked.hands.shieldEquipped');
      if (twoHandedWeaponPublicText(byMask.get('mainHand'))) tokens.push('blocked.hands.twoHandedWeapon');
      if (has('offHand')) tokens.push('blocked.hands.twoWeaponing');
    }
    return uniqueTokens(tokens);
  }

  function adaptInventorySnapshotToEquipmentSnapshot(inventorySnapshot = {}, options = {}) {
    const items = Array.isArray(inventorySnapshot.items) ? inventorySnapshot.items : (Array.isArray(inventorySnapshot.orderedItems) ? inventorySnapshot.orderedItems : []);
    const byMask = new Map();
    for (const item of items) {
      const wornMask = asNonNegativeInteger(item.wornMask) || 0;
      for (const [slotId, mask] of Object.entries(wornMasks)) {
        if ((wornMask & mask) !== 0 && !byMask.has(slotId)) byMask.set(slotId, item);
      }
    }
    const revision = normalizeEquipmentRevision(options.revision ?? options.equipmentRevision ?? inventorySnapshot.equipmentRevision ?? inventorySnapshot.revision);
    const inventoryRevision = normalizeEquipmentRevision(options.inventoryRevision ?? inventorySnapshot.revision);
    const mainHandItem = byMask.get('mainHand');
    const offHandItem = byMask.get('offHand');
    if (mainHandItem && offHandItem && (sameEquipmentObject(mainHandItem, offHandItem) || (!explicitlyAlternateItem(offHandItem) && sameKnownEquipmentItem(mainHandItem, offHandItem)))) byMask.delete('offHand');
    return normalizeEquipmentSnapshotPayload({
      revision,
      inventoryRevision,
      slots: canonicalSlots.map((slot) => {
        const item = byMask.get(slot.slotId);
        const objectId = asNonNegativeInteger(item?.objectId);
        return {
          slotId: slot.slotId,
          label: slot.label,
          rendererSlotId: slot.rendererSlotId,
          objectId,
          wornMask: wornMasks[slot.slotId],
          blockedBy: publicBlockersForSlot(slot.slotId, byMask),
          publicStatus: item ? 'equipped' : (publicBlockersForSlot(slot.slotId, byMask).length ? 'blocked' : 'empty'),
          actions: Array.from(slot.defaultActions || []),
          item,
        };
      }),
    });
  }

  function adaptShimInventoryUpdateToEquipmentSnapshot(event = {}) {
    const inventorySnapshot = InventorySnapshotAdapter.adaptShimInventoryUpdateToSnapshot(event);
    return adaptInventorySnapshotToEquipmentSnapshot(inventorySnapshot, {
      revision: event.equipmentRevision ?? event.revision ?? event.inventoryRevision,
      inventoryRevision: event.inventoryRevision ?? event.revision,
    });
  }

  function adaptShimEquipmentUpdateToSnapshot(event = {}) {
    if (Array.isArray(event.slots)) return normalizeEquipmentSnapshotPayload({ revision: event.revision ?? event.equipmentRevision, inventoryRevision: event.inventoryRevision, slots: event.slots });
    const inventorySnapshot = InventorySnapshotAdapter.normalizeInventorySnapshotPayload({ revision: event.inventoryRevision ?? event.revision, items: inventoryItemsFromEvent(event) });
    return adaptInventorySnapshotToEquipmentSnapshot(inventorySnapshot, { revision: event.equipmentRevision ?? event.revision, inventoryRevision: event.inventoryRevision ?? event.revision });
  }

  function createEquipmentSnapshotEvent(event = {}, options = {}) {
    const snapshot = options.snapshot || (event.name === 'shim_update_equipment' ? adaptShimEquipmentUpdateToSnapshot(event) : adaptShimInventoryUpdateToEquipmentSnapshot(event));
    const sequence = asNonNegativeInteger(options.sequence ?? snapshot.revision) ?? 0;
    return {
      protocol: 'nethack-electron-ui/v2',
      sequence,
      eventId: options.eventId || `evt-equipment-snapshot-${snapshot.revision}`,
      eventType: 'equipment.snapshot',
      turn: asNonNegativeInteger(options.turn) ?? 0,
      source: options.source || { layer: 'shim-bridge' },
      revision: { equipment: snapshot.revision, inventory: snapshot.inventoryRevision },
      payload: {
        revision: snapshot.revision,
        inventoryRevision: snapshot.inventoryRevision,
        slots: snapshot.slots.map((slot) => ({ ...slot, item: clonePublicItem(slot.item), blockedBy: slot.blockedBy.slice(), actions: slot.actions.slice() })),
      },
    };
  }

  function emptyEquipmentState() {
    return {
      revision: 0,
      inventoryRevision: 0,
      slotsById: new Map(),
      objectToSlots: new Map(),
      orderedSlots: [],
      lastSnapshotSource: null,
      lastSnapshotEvent: null,
    };
  }

  function cloneEquipmentState(equipment = emptyEquipmentState()) {
    return {
      revision: normalizeEquipmentRevision(equipment.revision),
      inventoryRevision: normalizeEquipmentRevision(equipment.inventoryRevision),
      slotsById: new Map(Array.from(equipment.slotsById || []).map(([key, slot]) => [key, cloneEquipmentSlot(slot)])),
      objectToSlots: new Map(Array.from(equipment.objectToSlots || []).map(([key, slots]) => [key, Array.isArray(slots) ? slots.slice() : []])),
      orderedSlots: Array.isArray(equipment.orderedSlots) ? equipment.orderedSlots.map(cloneEquipmentSlot) : [],
      lastSnapshotSource: equipment.lastSnapshotSource ? { ...equipment.lastSnapshotSource } : null,
      lastSnapshotEvent: equipment.lastSnapshotEvent ? { ...equipment.lastSnapshotEvent, payload: { ...equipment.lastSnapshotEvent.payload, slots: (equipment.lastSnapshotEvent.payload?.slots || []).map(cloneEquipmentSlot) } } : null,
    };
  }

  function cloneEquipmentSlot(slot) {
    return slot ? { ...slot, item: clonePublicItem(slot.item), blockedBy: cloneStringArray(slot.blockedBy), actions: cloneStringArray(slot.actions) } : slot;
  }

  function applyEquipmentSnapshot(previous = emptyEquipmentState(), payload = {}, options = {}) {
    const snapshot = normalizeEquipmentSnapshotPayload(payload);
    const state = emptyEquipmentState();
    state.revision = snapshot.revision;
    state.inventoryRevision = snapshot.inventoryRevision;
    state.lastSnapshotSource = options.source ? { ...options.source } : null;
    state.lastSnapshotEvent = options.event ? { ...options.event, payload: { ...options.event.payload, slots: (options.event.payload?.slots || []).map(cloneEquipmentSlot) } } : null;
    for (const slot of snapshot.slots) {
      const copy = cloneEquipmentSlot(slot);
      state.orderedSlots.push(copy);
      state.slotsById.set(copy.slotId, copy);
      if (copy.objectId != null) {
        const existing = state.objectToSlots.get(copy.objectId) || [];
        existing.push(copy.slotId);
        state.objectToSlots.set(copy.objectId, existing);
      }
    }
    return state;
  }

  function publicItemToLegacyChoice(item = {}) {
    return InventorySnapshotAdapter.publicItemToLegacyChoice ? InventorySnapshotAdapter.publicItemToLegacyChoice(item) : { text: item.displayName || 'item', objectId: item.objectId };
  }

  function slotModelFromSnapshotSlot(slot, context = {}) {
    const definition = slotById.get(slot.slotId) || {};
    const item = slot.item ? publicItemToLegacyChoice({ ...slot.item, inventoryLetter: slot.item.inventoryLetter }) : (slot.objectId != null && context.inventoryByObjectId?.get ? publicItemToLegacyChoice(context.inventoryByObjectId.get(slot.objectId) || {}) : null);
    const actionLabels = Array.isArray(slot.actions) ? slot.actions : [];
    const actionFor = (label) => {
      const text = String(label || '');
      if (/swap/i.test(text)) return slot.item ? { label: 'Swap with alternate weapon', key: 'x', actionId: 'slot.swapMainAlternate', snapshotAction: true, refreshInventory: true } : null;
      if (/wield\/change/i.test(text)) return { label: 'Wield/change', key: 'w', snapshotAction: true, refreshInventory: true };
      if (/set quiver/i.test(text)) return { label: 'Set quiver', key: 'Q', snapshotAction: true, refreshInventory: true };
      if (/throw|fire/i.test(text)) return { label: 'Throw/fire', key: 't', snapshotAction: true, refreshInventory: true };
      if (/take off/i.test(text)) return { label: 'Take off', key: definition.removeKey || 'T', snapshotAction: true, refreshInventory: true };
      if (/remove/i.test(text)) return { label: 'Remove', key: definition.removeKey || 'R', snapshotAction: true, refreshInventory: true };
      if (/put on ring/i.test(text)) return { label: 'Put on ring', key: 'P', snapshotAction: true, refreshInventory: true };
      if (/put on/i.test(text)) return { label: 'Put on', key: 'P', snapshotAction: true, refreshInventory: true };
      if (/wear/i.test(text)) return { label: text.replace(/^wear\s+/i, 'Wear '), key: 'W', snapshotAction: true, refreshInventory: true };
      return { label: text, key: labelKey(text, definition), snapshotAction: true, refreshInventory: true };
    };
    return {
      id: slot.rendererSlotId || definition.rendererSlotId || slot.slotId,
      canonicalSlotId: slot.slotId,
      label: slot.label || definition.label || slot.slotId,
      item,
      empty: definition.empty || 'No item equipped',
      equipKey: definition.equipKey || '',
      removeKey: definition.removeKey || '',
      actions: (actionLabels.length ? actionLabels : Array.from(definition.defaultActions || [])).map(actionFor).filter(Boolean),
      blockedBy: cloneStringArray(slot.blockedBy),
      blockerLabels: cloneStringArray(slot.blockedBy).map(publicEquipmentBlockerLabel),
      publicStatus: slot.publicStatus || '',
      source: 'equipment.snapshot',
    };
  }

  function labelKey(label, definition = {}) {
    const text = String(label || '').toLowerCase();
    if (/swap/.test(text)) return 'x';
    if (/quiver/.test(text)) return 'Q';
    if (/throw|fire/.test(text)) return 't';
    if (/take off|remove/.test(text)) return definition.removeKey || 'R';
    if (/put on/.test(text)) return 'P';
    if (/wear/.test(text)) return 'W';
    if (/wield/.test(text)) return 'w';
    return definition.equipKey || '';
  }

  function equipmentSnapshotToRendererSlotModels(equipment = emptyEquipmentState(), options = {}) {
    const slots = Array.isArray(equipment.orderedSlots) ? equipment.orderedSlots : [];
    const bodySlot = slots.find((slot) => slot.slotId === 'armor.body');
    const shirtSlot = slots.find((slot) => slot.slotId === 'armor.shirt');
    const mainHandSlot = slots.find((slot) => slot.slotId === 'mainHand' || slot.rendererSlotId === 'main-hand');
    return slots
      .filter((slot) => {
        if (slot.slotId === 'armor.body' && !slot.item && shirtSlot?.item) return false;
        if (slot.slotId === 'armor.shirt') return !bodySlot?.item && slot.item;
        if ((slot.slotId === 'offHand' || slot.rendererSlotId === 'offhand') && mainHandSlot?.item && slot.item) {
          if (sameEquipmentObject(slot.item, mainHandSlot.item) || (!explicitlyAlternateItem(slot.item) && sameKnownEquipmentItem(slot.item, mainHandSlot.item))) return false;
        }
        return true;
      })
      .map((slot) => slotModelFromSnapshotSlot(slot.slotId === 'armor.shirt' ? { ...slot, rendererSlotId: 'armor-suit', label: 'Armor / shirt' } : slot, options));
  }

  return Object.freeze({
    version,
    wornMasks,
    canonicalSlots,
    normalizeEquipmentRevision,
    normalizeEquipmentSlot,
    normalizeEquipmentSnapshotPayload,
    adaptInventorySnapshotToEquipmentSnapshot,
    adaptShimInventoryUpdateToEquipmentSnapshot,
    adaptShimEquipmentUpdateToSnapshot,
    createEquipmentSnapshotEvent,
    emptyEquipmentState,
    cloneEquipmentState,
    applyEquipmentSnapshot,
    equipmentSnapshotToRendererSlotModels,
    publicEquipmentBlockerLabels,
    publicEquipmentBlockerLabel,
  });
}));
