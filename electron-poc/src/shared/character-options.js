(function initCharacterOptions(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackCharacterOptions = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const roles = Object.freeze({
    Arc: { label: 'Archeologist', races: ['Hum', 'Dwa', 'Gno'], genders: ['Mal', 'Fem'], alignments: ['Law', 'Neu'] },
    Bar: { label: 'Barbarian', races: ['Hum', 'Orc'], genders: ['Mal', 'Fem'], alignments: ['Neu', 'Cha'] },
    Cav: { label: 'Caveman', races: ['Hum', 'Dwa', 'Gno'], genders: ['Mal', 'Fem'], alignments: ['Law', 'Neu'] },
    Hea: { label: 'Healer', races: ['Hum', 'Gno'], genders: ['Mal', 'Fem'], alignments: ['Neu'] },
    Kni: { label: 'Knight', races: ['Hum'], genders: ['Mal', 'Fem'], alignments: ['Law'] },
    Mon: { label: 'Monk', races: ['Hum'], genders: ['Mal', 'Fem'], alignments: ['Law', 'Neu', 'Cha'] },
    Pri: { label: 'Priest', races: ['Hum', 'Elf'], genders: ['Mal', 'Fem'], alignments: ['Law', 'Neu', 'Cha'] },
    Ran: { label: 'Ranger', races: ['Hum', 'Elf', 'Gno', 'Orc'], genders: ['Mal', 'Fem'], alignments: ['Neu', 'Cha'] },
    Rog: { label: 'Rogue', races: ['Hum', 'Orc'], genders: ['Mal', 'Fem'], alignments: ['Cha'] },
    Sam: { label: 'Samurai', races: ['Hum'], genders: ['Mal', 'Fem'], alignments: ['Law'] },
    Tou: { label: 'Tourist', races: ['Hum'], genders: ['Mal', 'Fem'], alignments: ['Neu'] },
    Val: { label: 'Valkyrie', races: ['Hum', 'Dwa'], genders: ['Fem'], alignments: ['Law', 'Neu'] },
    Wiz: { label: 'Wizard', races: ['Hum', 'Elf', 'Gno', 'Orc'], genders: ['Mal', 'Fem'], alignments: ['Neu', 'Cha'] },
  });
  const races = Object.freeze({
    Hum: { label: 'Human', roles: ['Arc', 'Bar', 'Cav', 'Hea', 'Kni', 'Mon', 'Pri', 'Ran', 'Rog', 'Sam', 'Tou', 'Val', 'Wiz'], alignments: ['Law', 'Neu', 'Cha'] },
    Dwa: { label: 'Dwarf', roles: ['Arc', 'Cav', 'Val'], alignments: ['Law'] },
    Elf: { label: 'Elf', roles: ['Pri', 'Ran', 'Wiz'], alignments: ['Cha'] },
    Gno: { label: 'Gnome', roles: ['Arc', 'Cav', 'Hea', 'Ran', 'Wiz'], alignments: ['Neu'] },
    Orc: { label: 'Orc', roles: ['Bar', 'Ran', 'Rog', 'Wiz'], alignments: ['Cha'] },
  });
  const genders = Object.freeze({ Mal: { label: 'Male' }, Fem: { label: 'Female' } });
  const alignments = Object.freeze({ Law: { label: 'Lawful' }, Neu: { label: 'Neutral' }, Cha: { label: 'Chaotic' } });
  const fieldOrder = Object.freeze(['role', 'race', 'gender']);
  const codeMap = Object.freeze({ role: roles, race: races, gender: genders, alignment: alignments });
  const codeKeys = Object.freeze({ role: 'role', race: 'race', gender: 'gender', alignment: 'alignment' });
  const avatarRoleSlugs = Object.freeze({ Arc: 'archeologist', Bar: 'barbarian', Cav: 'caveman', Hea: 'healer', Kni: 'knight', Mon: 'monk', Pri: 'priest', Ran: 'ranger', Rog: 'rogue', Sam: 'samurai', Tou: 'tourist', Val: 'valkyrie', Wiz: 'wizard' });
  const avatarRaceSlugs = Object.freeze({ Hum: 'human', Dwa: 'dwarf', Elf: 'elf', Gno: 'gnome', Orc: 'orc' });
  const avatarGenderSlugs = Object.freeze({ Mal: 'male', Fem: 'female' });

  function intersects(left, right) { return left.some((value) => right.includes(value)); }
  function intersection(left, right) { return left.filter((value) => right.includes(value)); }
  function comboAlignmentOptions(combo) { return intersection(roles[combo.role].alignments, races[combo.race].alignments); }
  const validCombos = Object.freeze(Object.keys(roles).flatMap((role) => roles[role].races
    .filter((race) => races[race]?.roles?.includes(role) && intersects(roles[role].alignments, races[race].alignments))
    .flatMap((race) => roles[role].genders.map((gender) => Object.freeze({ role, race, gender })))))
    .filter((combo) => combo.role !== 'Val' || combo.gender === 'Fem');

  function comboAvatarId(combo) {
    if (!combo?.role || !combo?.race || !combo?.gender) return '';
    return `${avatarRaceSlugs[combo.race]}-${avatarRoleSlugs[combo.role]}-${avatarGenderSlugs[combo.gender]}-avatar`;
  }
  function optionLabel(field, value) { return codeMap[field]?.[value]?.label || value; }
  function unique(values) { return Array.from(new Set(values)); }
  function matchingCombos(filters = {}) {
    return validCombos.filter((combo) => fieldOrder.every((field) => !filters[field] || combo[field] === filters[field]));
  }
  function resolveSelection(selection = {}, priority = []) {
    let candidates = validCombos.slice();
    const orderedFields = unique(priority.concat(fieldOrder));
    for (const field of orderedFields) {
      const value = selection[field];
      if (!value) continue;
      const narrowed = candidates.filter((combo) => combo[field] === value);
      if (narrowed.length) candidates = narrowed;
    }
    const chosen = candidates[0] || validCombos[0];
    const alignmentOptions = comboAlignmentOptions(chosen);
    return Object.freeze({
      role: chosen.role,
      race: chosen.race,
      gender: chosen.gender,
      alignment: alignmentOptions.includes(selection.alignment) ? selection.alignment : alignmentOptions[0],
    });
  }
  function allowedValues(field, selection = {}) {
    if (field === 'alignment') return comboAlignmentOptions(resolveSelection(selection));
    const filters = {};
    for (const other of fieldOrder) if (other !== field && selection[other]) filters[other] = selection[other];
    let combos = matchingCombos(filters);
    if (!combos.length) combos = validCombos;
    return unique(combos.map((combo) => combo[field]));
  }
  function isValidSelection(selection = {}) {
    if (!selection.role || !selection.race || !selection.gender || !selection.alignment) return false;
    return validCombos.some((combo) => combo.role === selection.role && combo.race === selection.race && combo.gender === selection.gender && comboAlignmentOptions(combo).includes(selection.alignment));
  }
  function optionsFor(field, selection = {}) {
    return allowedValues(field, resolveSelection(selection)).map((value) => ({ value, label: optionLabel(field, value) }));
  }
  function selectionPresentation(selection = {}, priority = []) {
    const requested = Object.freeze(Object.fromEntries(['role', 'race', 'gender', 'alignment'].map((field) => [field, selection[field] || ''])));
    const resolved = resolveSelection(selection, priority);
    const fieldLabels = Object.freeze({ role: 'Role', race: 'Race', gender: 'Gender', alignment: 'Alignment' });
    const adjustments = Object.freeze(Object.keys(fieldLabels).filter((field) => requested[field] && requested[field] !== resolved[field]).map((field) => Object.freeze({
      field,
      fieldLabel: fieldLabels[field],
      requested: requested[field],
      requestedLabel: optionLabel(field, requested[field]),
      resolved: resolved[field],
      resolvedLabel: optionLabel(field, resolved[field]),
      message: `${fieldLabels[field]} changed from ${optionLabel(field, requested[field])} to ${optionLabel(field, resolved[field])} because NetHack does not allow the requested combination.`,
    })));
    const available = Object.freeze(Object.fromEntries(Object.keys(fieldLabels).map((field) => [field, Object.freeze(optionsFor(field, resolved))])));
    return Object.freeze({
      requested,
      resolved,
      adjustments,
      available,
      valid: isValidSelection(resolved),
      explanation: adjustments.length ? adjustments.map((entry) => entry.message).join(' ') : 'This character combination is available in NetHack.',
    });
  }
  return Object.freeze({
    version: 'nethack-character-options/v1', roles, races, genders, alignments, validCombos,
    comboAlignmentOptions, comboAvatarId, optionLabel, allowedValues, optionsFor, resolveSelection, isValidSelection, selectionPresentation,
  });
}));
