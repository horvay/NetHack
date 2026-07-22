// UXM-08 motion helpers: one-shot class pulses that never delay input.
(function initUxFeedbackAdapter(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxFeedback = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-ux-feedback/v1';
  const MOTION_CLASSES = Object.freeze([
    'ux-motion-enter',
    'ux-motion-enter-scale',
    'ux-motion-enter-pop',
    'ux-motion-exit',
    'ux-motion-exit-fade',
    'ux-motion-select',
    'ux-motion-success',
    'ux-motion-danger',
    'ux-motion-value-up',
    'ux-motion-value-down',
    'ux-motion-flash-danger',
    'ux-motion-flash-success',
    'ux-motion-flash-action',
    'ux-motion-urgent-arrive',
    'ux-motion-primary-breath',
    'ux-motion-row-migrate',
    'ux-motion-transfer-insert',
    'ux-motion-keycap-press',
    'ux-motion-detail-swap',
    'ux-motion-enable-pop',
    'ux-motion-kind-change',
    'ux-motion-exit-pending',
  ]);

  function documentRootOf(node) {
    return node?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  }

  function motionReduced(documentRoot = typeof document !== 'undefined' ? document : null) {
    const body = documentRoot?.body;
    if (body?.dataset?.uxMotion === 'reduced') return true;
    try {
      return Boolean(documentRoot?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    } catch {
      return false;
    }
  }

  function clearMotionClasses(element) {
    if (!element?.classList) return;
    for (const name of MOTION_CLASSES) element.classList.remove(name);
  }

  function pulse(element, className, options = {}) {
    if (!element?.classList || !className) return false;
    const doc = documentRootOf(element);
    if (motionReduced(doc)) return false;
    const names = Array.isArray(className) ? className : [className];
    clearMotionClasses(element);
    // Force reflow so repeated pulses restart.
    void element.offsetWidth;
    for (const name of names) {
      if (name) element.classList.add(name);
    }
    const durationMs = Math.max(90, Math.min(400, Number(options.durationMs) || 200));
    const timerKey = '__uxMotionTimer';
    if (element[timerKey]) {
      try { clearTimeout(element[timerKey]); } catch {}
    }
    element[timerKey] = setTimeout(() => {
      for (const name of names) element.classList.remove(name);
      element[timerKey] = null;
      if (typeof options.onDone === 'function') {
        try { options.onDone(element); } catch {}
      }
    }, durationMs);
    return true;
  }

  function parseNumeric(value) {
    const text = String(value == null ? '' : value).replace(/,/g, '');
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const number = Number(match[0]);
    return Number.isFinite(number) ? number : null;
  }

  function compareStatusValues(previous, next) {
    const prev = parseNumeric(previous);
    const curr = parseNumeric(next);
    if (prev == null || curr == null || prev === curr) return 'none';
    return curr > prev ? 'up' : 'down';
  }

  function animateStatusMount(mount, previousValues = new Map()) {
    if (!mount?.querySelectorAll) return new Map();
    const nextValues = new Map();
    const chips = mount.querySelectorAll('.ux-status-chip');
    for (const chip of chips) {
      const key = chip.dataset?.statusKey || '';
      const valueNode = chip.querySelector('strong');
      const value = valueNode?.textContent || '';
      if (key) nextValues.set(key, value);
      if (!key || !previousValues.size) continue;
      const previous = previousValues.get(key);
      if (previous == null || previous === value) {
        if (chip.classList.contains('ux-status-urgent') && !previousValues.has(`urgent:${key}`)) {
          pulse(chip, 'ux-motion-urgent-arrive', { durationMs: 220 });
        }
        continue;
      }
      const direction = compareStatusValues(previous, value);
      if (direction === 'up') {
        pulse(chip, ['ux-motion-value-up', 'ux-motion-flash-success'], { durationMs: 180 });
      } else if (direction === 'down') {
        pulse(chip, ['ux-motion-value-down', 'ux-motion-flash-danger'], { durationMs: 180 });
      } else {
        pulse(valueNode || chip, 'ux-motion-value-up', { durationMs: 140 });
      }
    }
    for (const chip of chips) {
      const key = chip.dataset?.statusKey || '';
      if (key && chip.classList.contains('ux-status-urgent')) nextValues.set(`urgent:${key}`, '1');
    }
    return nextValues;
  }

  function animateConsequenceMount(mount, previousIds = new Set()) {
    if (!mount?.querySelectorAll) return new Set();
    const rows = Array.from(mount.querySelectorAll('.ux-consequence-row'));
    const nextIds = new Set(rows.map((row) => row.dataset.messageId).filter(Boolean));
    if (!previousIds.size) {
      const first = rows[0];
      if (first) first.classList.add('ux-motion-enter');
      return nextIds;
    }
    for (const row of rows) {
      const id = row.dataset.messageId;
      if (id && !previousIds.has(id)) row.classList.add('ux-motion-enter');
    }
    return nextIds;
  }

  function animateContextActionBar(bar, previousSignature = '') {
    if (!bar) return '';
    const buttons = Array.from(bar.querySelectorAll('.context-action-button'));
    const signature = buttons.map((button) => `${button.dataset.contextActionId || ''}:${button.textContent || ''}`).join('|');
    if (signature && signature !== previousSignature) {
      for (const button of buttons) {
        if (button.classList.contains('primary-context')) pulse(button, 'ux-motion-primary-breath', { durationMs: 760 });
      }
    }
    return signature;
  }

  function markMapLevelTransition(grid) {
    if (!grid?.classList) return false;
    if (motionReduced(documentRootOf(grid))) return false;
    grid.classList.remove('ux-map-level-transition');
    void grid.offsetWidth;
    grid.classList.add('ux-map-level-transition');
    const timerKey = '__uxMapLevelTimer';
    if (grid[timerKey]) {
      try { clearTimeout(grid[timerKey]); } catch {}
    }
    grid[timerKey] = setTimeout(() => {
      grid.classList.remove('ux-map-level-transition');
      grid[timerKey] = null;
    }, 220);
    return true;
  }

  // Class name used by CSS for level fade lives outside MOTION_CLASSES.
  function ensureMapLevelClassSupport() {
    // no-op placeholder for API stability
  }

  function animateDetailSwap(element) {
    return pulse(element, 'ux-motion-detail-swap', { durationMs: 180 });
  }

  function animateEquipSlot(element) {
    return pulse(element, 'ux-motion-flash-action', { durationMs: 180 });
  }

  function animateBlocked(element) {
    return pulse(element, 'ux-motion-danger', { durationMs: 140 });
  }

  function animateTransferInsert(element) {
    return pulse(element, 'ux-motion-transfer-insert', { durationMs: 180 });
  }

  function animateTransferMigrate(element) {
    return pulse(element, 'ux-motion-row-migrate', { durationMs: 160 });
  }

  function animateEnablePop(element) {
    return pulse(element, 'ux-motion-enable-pop', { durationMs: 140 });
  }

  function animateNoticeShow(element, { kindChanged = false } = {}) {
    if (!element?.classList) return false;
    if (motionReduced(documentRootOf(element))) return false;
    element.classList.remove('ux-motion-exit-pending');
    if (kindChanged) pulse(element, 'ux-motion-kind-change', { durationMs: 140 });
    return true;
  }

  function animateNoticeHide(element, hide) {
    if (!element?.classList) {
      hide?.();
      return false;
    }
    if (motionReduced(documentRootOf(element)) || element.hidden) {
      hide?.();
      return false;
    }
    element.classList.add('ux-motion-exit-pending');
    const done = () => {
      element.classList.remove('ux-motion-exit-pending');
      hide?.();
    };
    const timer = setTimeout(done, 120);
    element.addEventListener('animationend', () => {
      clearTimeout(timer);
      done();
    }, { once: true });
    return true;
  }

  ensureMapLevelClassSupport();

  return Object.freeze({
    version,
    MOTION_CLASSES,
    motionReduced,
    clearMotionClasses,
    pulse,
    parseNumeric,
    compareStatusValues,
    animateStatusMount,
    animateConsequenceMount,
    animateContextActionBar,
    markMapLevelTransition,
    animateDetailSwap,
    animateEquipSlot,
    animateBlocked,
    animateTransferInsert,
    animateTransferMigrate,
    animateEnablePop,
    animateNoticeShow,
    animateNoticeHide,
  });
}));
