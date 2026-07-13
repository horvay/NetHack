(function initUxCharacterCreation(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxCharacterCreation = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-character-creation/v1';
  const namePolicy = Object.freeze({ mode: 'explicit-validation', minLength: 1, maxLength: 24, pattern: /^[A-Za-z0-9_]+$/, example: 'Rowan' });
  const thematicNames = Object.freeze(['Ada', 'Boulder', 'Cobalt', 'Delver', 'Ember', 'Rune', 'Sable', 'Torch']);
  const fields = Object.freeze(['role', 'race', 'gender', 'alignment']);
  const maxSeed = 18446744073709551615n;

  function cleanName(value) { return String(value == null ? '' : value).trim(); }
  function validateName(value) {
    const name = cleanName(value);
    if (!name) return Object.freeze({ ok: false, name: '', message: 'Enter a hero name before entering the dungeon.' });
    if (name.length > namePolicy.maxLength) return Object.freeze({ ok: false, name, message: `Hero names can use at most ${namePolicy.maxLength} characters.` });
    if (!namePolicy.pattern.test(name)) return Object.freeze({ ok: false, name, message: 'Use letters, numbers, or underscores for the hero name.' });
    return Object.freeze({ ok: true, name, message: '' });
  }
  function normalizeSeed(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return Object.freeze({ ok: true, value: '', message: '' });
    if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(raw)) return Object.freeze({ ok: false, value: raw, message: 'Use a whole number or leave the seed blank for a random dungeon.' });
    try {
      const seed = BigInt(raw);
      if (seed > maxSeed) return Object.freeze({ ok: false, value: raw, message: 'This seed is too large to use.' });
      return Object.freeze({ ok: true, value: String(seed), message: '' });
    } catch { return Object.freeze({ ok: false, value: raw, message: 'This seed is too large to use.' }); }
  }

  function createCharacterCreationModel(options = {}) {
    const characterOptions = options.characterOptions;
    if (!characterOptions?.selectionPresentation || !Array.isArray(characterOptions.validCombos)) throw new TypeError('Character creation requires NetHackCharacterOptions.selectionPresentation');
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const defaultCombo = characterOptions.resolveSelection(options.selection || { role: 'Val', race: 'Hum', gender: 'Fem', alignment: 'Law' });
    let state = Object.freeze({
      open: false,
      name: '',
      selection: defaultCombo,
      presentation: characterOptions.selectionPresentation(defaultCombo),
      advancedOpen: false,
      seed: '',
      recordingEnabled: false,
      validation: Object.freeze({ name: '', seed: '' }),
      pending: false,
      submissionError: '',
      invoker: null,
    });

    function snapshot() { return state; }
    function update(patch) { state = Object.freeze({ ...state, ...patch }); return snapshot(); }
    function open(input = {}) {
      const requested = input.selection || state.selection;
      const presentation = characterOptions.selectionPresentation(requested, []);
      return update({ open: true, name: input.name == null ? '' : cleanName(input.name), selection: presentation.resolved, presentation, advancedOpen: false, seed: String(input.seed || ''), recordingEnabled: input.recordingEnabled === true, validation: Object.freeze({ name: '', seed: '' }), pending: false, submissionError: '', invoker: input.invoker || null });
    }
    function close() { return update({ open: false }); }
    function setName(name) { return update({ name: String(name == null ? '' : name), validation: Object.freeze({ ...state.validation, name: '' }) }); }
    function setSelection(field, value) {
      if (!fields.includes(field)) return snapshot();
      const requested = { ...state.selection, [field]: value };
      const presentation = characterOptions.selectionPresentation(requested, [field]);
      return update({ selection: presentation.resolved, presentation });
    }
    function setAdvanced(openState) { return update({ advancedOpen: Boolean(openState) }); }
    function setSeed(seed) { return update({ seed: String(seed == null ? '' : seed), validation: Object.freeze({ ...state.validation, seed: '' }) }); }
    function setRecordingEnabled(enabled) { return update({ recordingEnabled: Boolean(enabled) }); }
    function randomize() {
      const comboIndex = Math.min(characterOptions.validCombos.length - 1, Math.floor(random() * characterOptions.validCombos.length));
      const combo = characterOptions.validCombos[Math.max(0, comboIndex)];
      const alignments = characterOptions.comboAlignmentOptions(combo);
      const alignmentIndex = Math.min(alignments.length - 1, Math.floor(random() * alignments.length));
      const nameIndex = Math.min(thematicNames.length - 1, Math.floor(random() * thematicNames.length));
      const suffix = Math.floor(random() * 90) + 10;
      const selection = Object.freeze({ ...combo, alignment: alignments[Math.max(0, alignmentIndex)] });
      const presentation = characterOptions.selectionPresentation(selection);
      return update({ name: `${thematicNames[Math.max(0, nameIndex)]}${suffix}`, selection, presentation, validation: Object.freeze({ name: '', seed: state.validation.seed }), submissionError: '' });
    }
    function validate() {
      const name = validateName(state.name);
      const seed = normalizeSeed(state.seed);
      const selectionOk = characterOptions.isValidSelection(state.selection);
      const validation = Object.freeze({ name: name.message, seed: seed.message, selection: selectionOk ? '' : 'Choose a character combination available in NetHack.' });
      update({ validation });
      return Object.freeze({ ok: name.ok && seed.ok && selectionOk, name, seed, selection: state.selection, validation });
    }
    function submit() {
      const checked = validate();
      if (!checked.ok) return Object.freeze({ ok: false, validation: checked.validation });
      const character = Object.freeze({ name: checked.name.name, ...state.selection });
      return Object.freeze({
        ok: true,
        character,
        playerSpec: `-u${character.name}-${character.role}-${character.race}-${character.gender}-${character.alignment}`,
        seed: checked.seed.value,
        recordingEnabled: state.recordingEnabled,
      });
    }

    function setSubmissionState(pending, error = '') { return update({ pending: Boolean(pending), submissionError: String(error || '') }); }

    return Object.freeze({ version, open, close, setName, setSelection, setAdvanced, setSeed, setRecordingEnabled, randomize, validate, submit, setSubmissionState, snapshot });
  }

  function createElement(documentRoot, tag, className = '', text = '') {
    const element = documentRoot.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function createCharacterCreationController(options = {}) {
    const documentRoot = options.documentRoot || (typeof document !== 'undefined' ? document : null);
    const mount = options.mount;
    if (!documentRoot || !mount) throw new TypeError('Character creation controller requires documentRoot and mount');
    const model = createCharacterCreationModel(options);
    const dialogService = options.dialogService || null;
    const dialog = options.dialogElement || createElement(documentRoot, 'dialog', 'ux-character-creation');
    dialog.className = `${options.dialogElement ? 'character-dialog ' : ''}ux-character-creation`;
    dialog.id = options.dialogElement?.id || 'ux-character-creation';
    dialog.setAttribute('aria-labelledby', 'ux-character-title');
    const form = createElement(documentRoot, 'form', 'ux-character-form');
    form.id = options.legacyControlIds ? 'character-form' : 'ux-character-form';
    form.noValidate = true;
    const header = createElement(documentRoot, 'header', 'ux-character-heading');
    header.append(createElement(documentRoot, 'span', 'ux-discovery-kicker', 'Dungeons of Doom'));
    const title = createElement(documentRoot, 'h2', '', 'Create your adventurer');
    title.id = 'ux-character-title';
    header.append(title, createElement(documentRoot, 'p', '', 'Choose an identity, or create a random hero and enter the dungeon.'));
    const identity = createElement(documentRoot, 'div', 'ux-character-identity');
    const controls = {};
    function field(labelText, control) {
      const label = createElement(documentRoot, 'label', 'ux-character-field');
      label.append(createElement(documentRoot, 'span', '', labelText), control);
      return label;
    }
    const nameInput = createElement(documentRoot, 'input');
    nameInput.id = options.legacyControlIds ? 'player-name' : 'ux-hero-name';
    nameInput.maxLength = namePolicy.maxLength;
    nameInput.placeholder = `Example: ${namePolicy.example}`;
    nameInput.autocomplete = 'off';
    const nameError = createElement(documentRoot, 'small', 'ux-field-error');
    const nameWrap = field('Hero name', nameInput);
    nameWrap.append(nameError);
    identity.append(nameWrap);
    const labelByField = Object.freeze({ role: 'Role', race: 'Race', gender: 'Gender', alignment: 'Alignment' });
    for (const fieldName of fields) {
      const select = createElement(documentRoot, 'select');
      const legacyIds = { role: 'player-role', race: 'player-race', gender: 'player-gender', alignment: 'player-align' };
      select.id = options.legacyControlIds ? legacyIds[fieldName] : `ux-hero-${fieldName}`;
      controls[fieldName] = select;
      identity.append(field(labelByField[fieldName], select));
    }
    const legality = createElement(documentRoot, 'p', 'ux-character-legality');
    const submissionError = createElement(documentRoot, 'p', 'ux-character-submit-error');
    submissionError.hidden = true;
    const advanced = createElement(documentRoot, 'details', 'ux-character-advanced');
    const summary = createElement(documentRoot, 'summary', '', 'Advanced run options');
    const advancedGrid = createElement(documentRoot, 'div', 'ux-character-advanced-grid');
    const seedInput = createElement(documentRoot, 'input');
    seedInput.id = options.legacyControlIds ? 'game-seed' : 'ux-game-seed';
    seedInput.inputMode = 'numeric';
    seedInput.placeholder = 'Random';
    const seedError = createElement(documentRoot, 'small', 'ux-field-error');
    const seedWrap = field('Dungeon seed', seedInput);
    seedWrap.append(createElement(documentRoot, 'small', 'ux-field-help', 'Optional. Leave blank for a random dungeon.'), seedError);
    const recordingInput = createElement(documentRoot, 'input');
    recordingInput.id = options.legacyControlIds ? 'record-inputs' : 'ux-record-inputs';
    recordingInput.type = 'checkbox';
    const recordingLabel = createElement(documentRoot, 'label', 'ux-character-recording');
    recordingLabel.append(recordingInput, createElement(documentRoot, 'span', '', 'Record inputs for replay'));
    advancedGrid.append(seedWrap, recordingLabel);
    advanced.append(summary, advancedGrid);
    const actions = createElement(documentRoot, 'footer', 'dialog-actions ux-character-actions');
    const randomButton = createElement(documentRoot, 'button', '', 'Random hero');
    randomButton.id = options.legacyControlIds ? 'randomize-character' : 'ux-randomize-character';
    randomButton.type = 'button';
    const cancelButton = createElement(documentRoot, 'button', '', 'Cancel');
    cancelButton.type = 'button';
    const submitButton = createElement(documentRoot, 'button', 'primary', 'Enter dungeon');
    submitButton.id = options.legacyControlIds ? 'confirm-character' : 'ux-confirm-character';
    submitButton.type = 'submit';
    actions.append(randomButton, cancelButton, submitButton);
    form.append(header, identity, legality, submissionError, advanced, actions);
    dialog.replaceChildren(form);
    if (!options.dialogElement) mount.append(dialog);

    function replaceOptions(select, optionList, selected) {
      select.replaceChildren(...optionList.map((option) => {
        const node = createElement(documentRoot, 'option', '', option.label);
        node.value = option.value;
        node.selected = option.value === selected;
        return node;
      }));
      select.value = selected;
    }
    function render() {
      const snapshot = model.snapshot();
      nameInput.value = snapshot.name;
      for (const fieldName of fields) replaceOptions(controls[fieldName], snapshot.presentation.available[fieldName], snapshot.selection[fieldName]);
      legality.textContent = snapshot.presentation.explanation;
      legality.dataset.adjusted = String(snapshot.presentation.adjustments.length > 0);
      advanced.open = snapshot.advancedOpen;
      seedInput.value = snapshot.seed;
      recordingInput.checked = snapshot.recordingEnabled;
      nameError.textContent = snapshot.validation.name || '';
      seedError.textContent = snapshot.validation.seed || '';
      submissionError.textContent = snapshot.submissionError || '';
      submissionError.hidden = !snapshot.submissionError;
      nameInput.setAttribute('aria-invalid', String(Boolean(snapshot.validation.name)));
      seedInput.setAttribute('aria-invalid', String(Boolean(snapshot.validation.seed)));
      submitButton.disabled = snapshot.pending;
      submitButton.classList.toggle('ux-state-loading', snapshot.pending);
      return snapshot;
    }
    function open(input = {}) {
      model.open(input);
      render();
      dialogService?.focus?.prepareOpen?.(dialog, input.invoker || documentRoot.activeElement);
      if (!dialog.open) dialog.showModal();
      dialogService?.focus?.open?.({ id: 'character-creation', element: dialog, domain: 'discovery', initialFocus: nameInput, returnFocus: 'invoker', escapePolicy: 'cancel' });
      nameInput.focus({ preventScroll: true });
      return model.snapshot();
    }
    function close(reason = 'cancel') {
      const invoker = model.snapshot().invoker;
      model.close();
      if (dialog.open) dialog.close(reason === 'start' ? 'ux-start' : reason);
      dialogService?.focus?.close?.(dialog);
      const invokerDialog = invoker?.closest?.('dialog');
      if (invoker?.isConnected && (!invokerDialog || invokerDialog.open)) invoker.focus?.({ preventScroll: true });
    }
    dialog.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close('escape'); }
    });
    nameInput.addEventListener('input', () => model.setName(nameInput.value));
    for (const fieldName of fields) controls[fieldName].addEventListener('change', () => { model.setSelection(fieldName, controls[fieldName].value); render(); });
    advanced.addEventListener('toggle', () => model.setAdvanced(advanced.open));
    seedInput.addEventListener('input', () => model.setSeed(seedInput.value));
    recordingInput.addEventListener('change', () => model.setRecordingEnabled(recordingInput.checked));
    randomButton.addEventListener('click', () => { model.randomize(); render(); nameInput.focus({ preventScroll: true }); });
    cancelButton.addEventListener('click', () => close('cancel'));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close('escape'); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (model.snapshot().pending) return;
      model.setName(nameInput.value);
      for (const fieldName of fields) model.setSelection(fieldName, controls[fieldName].value);
      model.setSeed(seedInput.value);
      model.setRecordingEnabled(recordingInput.checked);
      const result = model.submit();
      render();
      if (!result.ok) {
        (result.validation.name ? nameInput : seedInput).focus({ preventScroll: true });
        return;
      }
      if (typeof options.onSubmit !== 'function') {
        model.setSubmissionState(false, 'The dungeon cannot start from this screen right now.');
        render();
        return;
      }
      model.setSubmissionState(true);
      render();
      try {
        const outcome = await options.onSubmit(result);
        if (outcome === false || outcome?.ok === false) {
          model.setSubmissionState(false, outcome?.message || 'The dungeon did not start. Check the choices and try again.');
          render();
          nameInput.focus({ preventScroll: true });
          return;
        }
        model.setSubmissionState(false);
        close('start');
      } catch (error) {
        model.setSubmissionState(false, String(error?.message || 'The dungeon did not start. Check the choices and try again.'));
        render();
        nameInput.focus({ preventScroll: true });
      }
    });
    return Object.freeze({ version, model, element: dialog, open, close, render });
  }

  return Object.freeze({ version, namePolicy, thematicNames, validateName, normalizeSeed, createCharacterCreationModel, createCharacterCreationController });
}));
