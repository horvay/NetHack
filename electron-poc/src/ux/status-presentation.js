(function initUxStatusPresentation(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../shared/status-hud.js'));
  else root.NetHackUxStatusPresentation = factory(root.NetHackStatusHud);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(StatusHud) {
  const version = 'nethack-status-presentation/v1';

  function normalizeDensity(value) {
    return value === 'detailed' ? 'detailed' : 'compact';
  }

  function conditionExplanation(item) {
    return String(item?.explanation || `${item?.label || 'Status'} is reported by NetHack.`).trim();
  }

  function renderStatusPresentation(mount, values, options = {}) {
    const documentRoot = options.documentRoot || mount?.ownerDocument;
    const density = normalizeDensity(options.density);
    const adaptive = options.adaptive === true;
    const presentation = StatusHud.buildStatusPresentation(values, { density });
    if (!mount || !documentRoot?.createElement) return presentation;
    const focusedKey = mount.contains(documentRoot.activeElement) ? documentRoot.activeElement?.dataset?.statusKey || '' : '';
    mount.replaceChildren();
    mount.dataset.hudDensity = density;
    mount.dataset.statusAdaptive = String(adaptive);
    mount.dataset.uxStatusOwned = 'true';
    const compactKeys = new Set(presentation.compact.flatMap((group) => group.items.map((item) => `${item.field ?? 'label'}:${item.label}`)));
    const renderedGroups = adaptive ? presentation.detailed : presentation.persistent;

    for (const group of renderedGroups) {
      const section = documentRoot.createElement('section');
      section.className = `status-group ux-status-group ux-status-group-${group.id}`;
      if (adaptive && group.items.every((item) => !compactKeys.has(`${item.field ?? 'label'}:${item.label}`))) section.classList.add('ux-status-adaptive-only');
      section.dataset.statusRole = group.id === 'urgent' ? 'urgent' : 'persistent';
      const title = documentRoot.createElement('span');
      title.className = 'status-group-label';
      title.textContent = group.label;
      section.append(title);
      for (const item of group.items) {
        const interactive = item.role === 'urgent';
        const chip = documentRoot.createElement(interactive ? 'button' : 'span');
        if (interactive) chip.type = 'button';
        chip.className = ['stat-chip', 'ux-status-chip', item.important ? 'important' : '', item.severity || '', item.className || '', interactive ? 'ux-status-urgent' : ''].filter(Boolean).join(' ');
        if (adaptive && !compactKeys.has(`${item.field ?? 'label'}:${item.label}`)) chip.classList.add('ux-status-adaptive-only');
        chip.dataset.statusRole = item.role || 'persistent';
        chip.dataset.statusField = item.field == null ? '' : String(item.field);
        chip.dataset.statusKey = `${item.field ?? 'label'}:${item.label}`;
        if (interactive) {
          chip.title = conditionExplanation(item);
          chip.addEventListener('click', () => options.onExplain?.(item, conditionExplanation(item)));
        }
        const label = documentRoot.createElement('span');
        label.textContent = item.label;
        const value = documentRoot.createElement('strong');
        value.textContent = item.value;
        chip.append(label, value);
        section.append(chip);
      }
      mount.append(section);
    }
    if (!mount.childElementCount) {
      const empty = documentRoot.createElement('span');
      empty.className = 'ux-status-empty';
      empty.textContent = 'Hero status will appear when the dungeon starts.';
      mount.append(empty);
    }
    if (focusedKey) Array.from(mount.querySelectorAll('[data-status-key]')).find((chip) => chip.dataset.statusKey === focusedKey)?.focus?.({ preventScroll: true });
    return presentation;
  }

  function createStatusController(options = {}) {
    let density = normalizeDensity(options.density);
    let values = [];
    let lastPresentation = StatusHud.buildStatusPresentation(values, { density });
    let lastSignature = '';

    function explain(item, explanation) {
      const notice = options.noticeService;
      if (!notice?.show) return;
      notice.show({
        id: `status:explain:${item.field ?? item.label}`,
        dedupeKey: `status:explain:${item.field ?? item.label}`,
        kind: item.severity === 'danger' ? 'warning' : 'info',
        message: explanation,
        source: 'presentation',
        persistence: 'transient',
      });
    }

    function render({ force = false } = {}) {
      const nextPresentation = StatusHud.buildStatusPresentation(values, { density });
      const signature = JSON.stringify(nextPresentation.persistent);
      if (!force && signature === lastSignature) return lastPresentation;
      lastSignature = signature;
      lastPresentation = renderStatusPresentation(options.mount, values, {
        documentRoot: options.documentRoot,
        density,
        onExplain: explain,
      });
      return lastPresentation;
    }

    function setDensity(nextDensity) {
      const next = normalizeDensity(nextDensity);
      const changed = next !== density;
      density = next;
      options.onDensityChanged?.(density);
      return render({ force: changed });
    }

    return Object.freeze({
      version,
      update(nextValues) { values = nextValues || []; return render(); },
      setDensity,
      toggleDensity() { return setDensity(density === 'compact' ? 'detailed' : 'compact'); },
      density: () => density,
      presentation: () => lastPresentation,
      render,
    });
  }

  return Object.freeze({ version, normalizeDensity, conditionExplanation, renderStatusPresentation, createStatusController });
}));
