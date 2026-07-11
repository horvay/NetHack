(function initPublicBlockers(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackPublicBlockers = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const publicEquipmentBlockerLabels = Object.freeze({
    'blocked.armor.removeOuterFirst': 'Remove outer armor layers first.',
    'blocked.armor.bodyOverShirt': 'Shirt covered; remove armor first.',
    'blocked.armor.cloakOverBody': 'A cloak covers body armor; remove the cloak first.',
    'blocked.armor.slotOccupied': 'That armor slot is occupied; remove the worn item first.',
    'blocked.ring.leftOccupied': 'The left ring slot is occupied; remove that ring before putting another ring on that hand.',
    'blocked.ring.rightOccupied': 'The right ring slot is occupied; remove that ring before putting another ring on that hand.',
    'blocked.ring.bothOccupied': 'Both ring slots are occupied; remove a ring before putting on another through the GUI.',
    'blocked.accessory.slotOccupied': 'That accessory slot is occupied; remove the worn accessory first.',
    'blocked.hands.twoHandedWeapon': 'A two-handed weapon uses both hands; change the main hand before using the offhand.',
    'blocked.hands.shieldEquipped': 'A shield is equipped; remove it before using a two-handed or offhand setup.',
    'blocked.hands.offhandOccupied': 'The offhand/alternate slot is occupied; swap or clear it before using that setup.',
    'blocked.hands.twoWeaponing': 'Two-weapon/alternate-weapon setup is active; swap or clear the alternate before changing offhand use.',
    'blocked.hands.quiverOccupied': 'Quiver occupied; replaces ammo.',
    'blocked.input.promptActive': 'A NetHack prompt is active; finish it before using this action.',
    'blocked.input.menuActive': 'A NetHack menu is active; finish it before using this action.',
    'blocked.input.transferActive': 'A transfer panel is active; finish it before using this action.',
    'blocked.input.staleRevision': 'The public equipment/inventory snapshot changed; refresh before using this action.',
    'blocked.input.unsupportedRoute': 'That semantic route is not available through the safe UI path yet.',
    'blocked.input.malformedTarget': 'The action target no longer matches the public UI state.',
    'blocked.input.missingPromptPolicy': 'The action is missing explicit NetHack prompt ownership metadata.',
    'blocked.input.malformedCommand': 'The command metadata did not match the safe route shape.',
    'blocked.public.tryInNetHack': 'NetHack must decide this from the normal prompt.',
  });

  const publicEquipmentBlockerTokens = Object.freeze(Object.keys(publicEquipmentBlockerLabels));
  const publicEquipmentBlockerTokenSet = Object.freeze(new Set(publicEquipmentBlockerTokens));
  const publicEquipmentBlockerLabelSet = Object.freeze(new Set(Object.values(publicEquipmentBlockerLabels)));

  function publicEquipmentBlockerLabel(token) {
    return publicEquipmentBlockerLabels[String(token || '')] || 'NetHack must decide this from public equipment state.';
  }

  function isPublicEquipmentBlockerToken(token) {
    return publicEquipmentBlockerTokenSet.has(String(token || ''));
  }

  function isPublicEquipmentBlockerLabel(label) {
    return publicEquipmentBlockerLabelSet.has(String(label || ''));
  }

  return Object.freeze({
    version: 'nethack-public-blockers/v1',
    publicEquipmentBlockerLabels,
    publicEquipmentBlockerTokens,
    publicEquipmentBlockerTokenSet,
    publicEquipmentBlockerLabelSet,
    publicEquipmentBlockerLabel,
    isPublicEquipmentBlockerToken,
    isPublicEquipmentBlockerLabel,
  });
}));
