(function initUxDialogShell(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxDialogShell = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-dialog-shell/v1';
  const families = Object.freeze(['single-select', 'multi-select', 'command', 'form', 'confirmation', 'document', 'transfer']);
  const closeKinds = Object.freeze(['close', 'cancel', 'back', 'continue', 'blocked']);
  const escapePolicies = Object.freeze(['close', 'cancel', 'back', 'continue', 'blocked']);
  const closeLabels = Object.freeze({ close: 'Close', cancel: 'Cancel', back: 'Back', continue: 'Continue', blocked: '' });
  const familySemantics = Object.freeze({
    'single-select': Object.freeze({ optionsRole: 'listbox', choiceRole: 'option', multi: false, roving: true }),
    'multi-select': Object.freeze({ optionsRole: 'group', choiceRole: 'checkbox', multi: true, roving: true }),
    command: Object.freeze({ optionsRole: 'menu', choiceRole: 'menuitem', multi: false, roving: true }),
    form: Object.freeze({ optionsRole: 'group', choiceRole: '', multi: false, roving: false }),
    confirmation: Object.freeze({ optionsRole: 'group', choiceRole: '', multi: false, roving: true }),
    document: Object.freeze({ optionsRole: 'document', choiceRole: '', multi: false, roving: false }),
    transfer: Object.freeze({ optionsRole: 'group', choiceRole: 'checkbox', multi: true, roving: true }),
  });

  function text(value, field, required = false) {
    const clean = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (required && !clean) throw new TypeError(`DialogSpec.${field} is required`);
    return clean;
  }

  function normalizeDialogSpec(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('DialogSpec must be an object');
    const family = families.includes(input.family) ? input.family : 'single-select';
    const closeKind = closeKinds.includes(input.closeKind) ? input.closeKind : (family === 'document' ? 'close' : 'cancel');
    const escapePolicy = escapePolicies.includes(input.escapePolicy) ? input.escapePolicy : (closeKind === 'blocked' ? 'blocked' : closeKind);
    const spec = {
      id: text(input.id, 'id', true),
      family,
      title: text(input.title, 'title', true),
      initialFocus: input.initialFocus || 'first-action',
      returnFocus: input.returnFocus || 'invoker',
      escapePolicy,
      secondaryActions: Object.freeze(Array.isArray(input.secondaryActions) ? input.secondaryActions.slice() : []),
      closeKind,
    };
    const description = text(input.description, 'description');
    if (description) spec.description = description;
    if (input.primaryAction) spec.primaryAction = input.primaryAction;
    return Object.freeze(spec);
  }

  function inferFamily({ dialogClass = '', textEntry = false, multi = false, readOnly = false } = {}) {
    const classes = String(dialogClass || '');
    if (readOnly || /read-only|document/.test(classes)) return 'document';
    if (/transfer/.test(classes)) return 'transfer';
    if (multi || /multi-select/.test(classes)) return 'multi-select';
    if (/destructive|confirm|shop-offer/.test(classes)) return 'confirmation';
    if (/command|context-menu/.test(classes)) return 'command';
    if (textEntry || /text-entry|form/.test(classes)) return 'form';
    return 'single-select';
  }

  function semanticsFor(family) {
    return familySemantics[families.includes(family) ? family : 'single-select'];
  }

  function applyDialogSpec({ dialog, titleElement, descriptionElement, optionsElement, choices = [], spec }) {
    const normalized = normalizeDialogSpec(spec);
    if (!dialog) throw new TypeError('Dialog shell requires a dialog element');
    const semantics = semanticsFor(normalized.family);
    dialog.dataset.dialogFamily = normalized.family;
    dialog.dataset.closeKind = normalized.closeKind;
    dialog.dataset.escapePolicy = normalized.escapePolicy;
    dialog.setAttribute('role', normalized.family === 'document' ? 'dialog' : (normalized.family === 'confirmation' ? 'alertdialog' : 'dialog'));
    dialog.setAttribute('aria-modal', 'true');
    if (titleElement?.id) dialog.setAttribute('aria-labelledby', titleElement.id);
    if (descriptionElement?.id && String(descriptionElement.textContent || '').trim()) dialog.setAttribute('aria-describedby', descriptionElement.id);
    else dialog.removeAttribute('aria-describedby');
    if (optionsElement) {
      if (semantics.optionsRole) optionsElement.setAttribute('role', semantics.optionsRole);
      else optionsElement.removeAttribute('role');
      optionsElement.setAttribute('aria-label', `${normalized.title} choices`);
      if (normalized.family === 'single-select') optionsElement.setAttribute('aria-multiselectable', 'false');
      else optionsElement.removeAttribute('aria-multiselectable');
    }
    const choiceList = Array.from(choices || []);
    choiceList.forEach((choice, index) => {
      if (semantics.choiceRole) choice.setAttribute('role', semantics.choiceRole);
      else choice.removeAttribute('role');
      if (semantics.roving) choice.tabIndex = index === 0 ? 0 : -1;
      else choice.removeAttribute('tabindex');
      if (semantics.choiceRole === 'option' && !choice.hasAttribute('aria-selected')) choice.setAttribute('aria-selected', 'false');
      if (semantics.choiceRole === 'checkbox' && !choice.hasAttribute('aria-checked')) choice.setAttribute('aria-checked', 'false');
    });
    return normalized;
  }

  function actionOrder(spec) {
    const normalized = normalizeDialogSpec(spec);
    return Object.freeze([
      ...normalized.secondaryActions,
      ...(normalized.primaryAction ? [normalized.primaryAction] : []),
      ...(normalized.closeKind === 'blocked' ? [] : [Object.freeze({ kind: normalized.closeKind, label: closeLabels[normalized.closeKind] })]),
    ]);
  }

  return Object.freeze({ version, families, closeKinds, escapePolicies, closeLabels, familySemantics, normalizeDialogSpec, inferFamily, semanticsFor, applyDialogSpec, actionOrder });
}));
