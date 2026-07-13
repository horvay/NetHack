(function initUxFocusLayer(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxFocusLayer = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-focus-layer/v1';
  const focusableSelector = [
    'button:not([disabled]):not([hidden])',
    'input:not([disabled]):not([hidden])',
    'select:not([disabled]):not([hidden])',
    'textarea:not([disabled]):not([hidden])',
    '[href]',
    '[tabindex]:not([tabindex="-1"]):not([hidden])',
  ].join(',');

  function isUsable(element) {
    if (!element || !element.isConnected || element.hidden || element.disabled) return false;
    if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false;
    return typeof element.focus === 'function';
  }

  function focusables(element) {
    return Array.from(element?.querySelectorAll?.(focusableSelector) || []).filter(isUsable);
  }

  function resolveTarget(target, layer, documentRoot) {
    let value = target;
    if (typeof value === 'function') value = value(layer);
    if (typeof value === 'string') value = layer.element?.querySelector?.(value) || documentRoot?.querySelector?.(value);
    if (value === 'heading') value = layer.element?.querySelector?.('h1, h2, h3, [role="heading"]');
    if (value === 'first-choice') value = layer.element?.querySelector?.('[role="option"], [role="menuitem"], [role="checkbox"], .choice-button');
    if (value === 'first-action') value = focusables(layer.element)[0];
    return isUsable(value) ? value : null;
  }

  function createFocusLayer(options = {}) {
    const documentRoot = options.documentRoot || (typeof document !== 'undefined' ? document : null);
    const onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {};
    const schedule = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
    const cancelSchedule = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
    const stack = [];
    const registrations = new Map();
    const preparedInvokers = new WeakMap();
    let sequence = 0;

    function diagnostic(type, detail = {}) {
      try { onDiagnostic(Object.freeze({ type, detail: Object.freeze({ ...detail }) })); } catch {}
    }

    function top() { return stack[stack.length - 1] || null; }

    function invokerIdentity(element) {
      if (!element) return Object.freeze({ id: '', stableId: '' });
      return Object.freeze({ id: String(element.id || ''), stableId: String(element.dataset?.stableId || '') });
    }

    function replacementInvoker(layer, survivingLayer) {
      if (!survivingLayer?.element) return null;
      const identity = layer.invokerIdentity || invokerIdentity(layer.invoker);
      const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape : (value) => String(value).replace(/["\\]/g, '\\$&');
      if (identity.stableId) {
        const stable = survivingLayer.element.querySelector?.(`[data-stable-id="${escaped(identity.stableId)}"]`);
        if (isUsable(stable)) return stable;
      }
      if (identity.id) {
        const byId = survivingLayer.element.querySelector?.(`#${escaped(identity.id)}`);
        if (isUsable(byId)) return byId;
      }
      return null;
    }

    function domainFallback(layer, survivingLayer = null) {
      const domain = survivingLayer?.domain || layer.domain || '';
      const candidates = [
        survivingLayer?.element?.querySelector?.(`[data-ux-domain-fallback="${domain}"]`),
        survivingLayer ? resolveTarget(survivingLayer.initialFocus, survivingLayer, documentRoot) : null,
        survivingLayer ? focusables(survivingLayer.element)[0] : null,
        documentRoot?.querySelector?.(`[data-ux-domain-invoker="${domain}"]`),
        survivingLayer ? resolveTarget(survivingLayer.domainFallback, survivingLayer, documentRoot) : null,
        resolveTarget(layer.returnFocus, layer, documentRoot),
      ];
      return candidates.find(isUsable) || null;
    }

    function mapFallback(layer) {
      const configured = typeof options.fallbackFocus === 'function' ? options.fallbackFocus(layer) : options.fallbackFocus;
      return [configured, documentRoot?.getElementById?.('game-grid')].find(isUsable) || null;
    }

    function focusInitial(layer) {
      const target = resolveTarget(layer.initialFocus, layer, documentRoot)
        || focusables(layer.element)[0]
        || (isUsable(layer.element) ? layer.element : null);
      if (!target) {
        diagnostic('focus.initial-missing', { id: layer.id });
        return false;
      }
      if (!target.hasAttribute?.('tabindex') && /^(H1|H2|H3)$/.test(target.tagName || '')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      diagnostic('focus.entered', { id: layer.id, targetId: target.id || '', targetRole: target.getAttribute?.('role') || target.tagName || '' });
      return true;
    }

    function scheduleInitialFocus(layer, delayMs) {
      if (layer.focusTimer != null) cancelSchedule(layer.focusTimer);
      const focusDelayMs = Math.max(0, Number(delayMs) || 0);
      if (!focusDelayMs) {
        layer.focusTimer = null;
        focusInitial(layer);
        return;
      }
      layer.focusTimer = schedule(() => {
        layer.focusTimer = null;
        if (stack.includes(layer) && top() === layer) focusInitial(layer);
      }, focusDelayMs);
      diagnostic('focus.initial-deferred', { id: layer.id, focusDelayMs });
    }

    function open(input = {}) {
      const element = input.element;
      if (!element) throw new TypeError('FocusLayer.open requires an element');
      const existing = stack.find((layer) => layer.element === element);
      if (existing) {
        Object.assign(existing, input);
        scheduleInitialFocus(existing, input.focusDelayMs);
        return existing;
      }
      const invoker = preparedInvokers.get(element) || input.invoker || documentRoot?.activeElement || null;
      preparedInvokers.delete(element);
      const layer = {
        id: String(input.id || element.id || `focus-layer-${sequence + 1}`),
        element,
        domain: String(input.domain || 'interaction'),
        initialFocus: input.initialFocus || 'first-action',
        returnFocus: input.returnFocus || 'invoker',
        escapePolicy: input.escapePolicy || 'cancel',
        invoker,
        invokerIdentity: invokerIdentity(invoker),
        domainFallback: input.domainFallback || null,
        order: ++sequence,
      };
      stack.push(layer);
      scheduleInitialFocus(layer, input.focusDelayMs);
      diagnostic('focus.layer-opened', { id: layer.id, depth: stack.length, escapePolicy: layer.escapePolicy });
      return layer;
    }

    function close(elementOrId, { restore = true } = {}) {
      const index = stack.findIndex((layer) => layer.element === elementOrId || layer.id === elementOrId);
      if (index < 0) return false;
      const [layer] = stack.splice(index, 1);
      if (layer.focusTimer != null) cancelSchedule(layer.focusTimer);
      diagnostic('focus.layer-closed', { id: layer.id, depth: stack.length, restore });
      if (!restore || index !== stack.length) return true;
      const nextLayer = top();
      const actualInvoker = isUsable(layer.invoker) && (!nextLayer || nextLayer.element?.contains?.(layer.invoker)) ? layer.invoker : null;
      const target = actualInvoker
        || replacementInvoker(layer, nextLayer)
        || domainFallback(layer, nextLayer)
        || mapFallback(layer);
      if (target) {
        target.focus({ preventScroll: true });
        target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        diagnostic('focus.restored', { id: layer.id, targetId: target.id || '', targetRole: target.getAttribute?.('role') || target.tagName || '', strategy: actualInvoker ? 'actual-invoker' : (target === replacementInvoker(layer, nextLayer) ? 'replacement-invoker' : (nextLayer && nextLayer.element?.contains?.(target) ? 'surviving-domain' : 'domain-or-map-fallback')) });
      } else diagnostic('focus.return-missing', { id: layer.id });
      return true;
    }

    function prepareOpen(element, invoker) {
      if (element) preparedInvokers.set(element, invoker || documentRoot?.activeElement || null);
    }

    function syncRegistration(element, config) {
      const openState = element?.tagName === 'DIALOG' ? Boolean(element.open) : !element?.hidden;
      const existing = stack.find((layer) => layer.element === element);
      if (openState && !existing) {
        const resolved = typeof config === 'function' ? config(element) : config;
        open({ ...(resolved || {}), element });
      } else if (!openState && existing) close(element);
    }

    function register(element, config = {}) {
      if (!element || registrations.has(element)) return false;
      const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => syncRegistration(element, config)) : null;
      observer?.observe?.(element, { attributes: true, attributeFilter: element.tagName === 'DIALOG' ? ['open'] : ['hidden'] });
      // A queued native close event may arrive after the same reusable dialog has
      // already reopened for the next core prompt. Do not remove that new layer.
      const onClose = () => {
        if (element.tagName === 'DIALOG' && element.open) return;
        close(element);
      };
      element.addEventListener?.('close', onClose);
      registrations.set(element, { observer, onClose });
      syncRegistration(element, config);
      return true;
    }

    function unregister(element) {
      const registration = registrations.get(element);
      if (!registration) return false;
      registration.observer?.disconnect?.();
      element.removeEventListener?.('close', registration.onClose);
      registrations.delete(element);
      close(element, { restore: false });
      return true;
    }

    function trapTab(event, layer = top()) {
      if (!layer || event.key !== 'Tab') return false;
      const items = focusables(layer.element);
      if (!items.length) {
        event.preventDefault();
        layer.element.tabIndex = -1;
        layer.element.focus({ preventScroll: true });
        return true;
      }
      const current = documentRoot?.activeElement;
      const index = items.indexOf(current);
      const next = event.shiftKey
        ? (index <= 0 ? items[items.length - 1] : items[index - 1])
        : (index < 0 || index >= items.length - 1 ? items[0] : items[index + 1]);
      event.preventDefault();
      event.stopPropagation();
      next.focus({ preventScroll: true });
      return true;
    }

    function moveRoving(container, key, selector = '[role="option"], [role="menuitem"], [role="checkbox"], .choice-button') {
      const items = Array.from(container?.querySelectorAll?.(selector) || []).filter(isUsable);
      if (!items.length) return false;
      const current = documentRoot?.activeElement;
      const currentIndex = Math.max(0, items.indexOf(current));
      let nextIndex = currentIndex;
      if (key === 'Home') nextIndex = 0;
      else if (key === 'End') nextIndex = items.length - 1;
      else if (key === 'ArrowUp' || key === 'ArrowLeft') nextIndex = (currentIndex - 1 + items.length) % items.length;
      else if (key === 'ArrowDown' || key === 'ArrowRight') nextIndex = (currentIndex + 1) % items.length;
      else return false;
      items.forEach((item, index) => { item.tabIndex = index === nextIndex ? 0 : -1; });
      items[nextIndex].focus({ preventScroll: true });
      items[nextIndex].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      return true;
    }

    function handleKeydown(event) {
      if (!top() || event.key !== 'Tab') return false;
      return trapTab(event);
    }

    return Object.freeze({
      version,
      open,
      close,
      prepareOpen,
      register,
      unregister,
      top,
      depth: () => stack.length,
      snapshot: () => Object.freeze(stack.map((layer) => Object.freeze({ id: layer.id, domain: layer.domain, escapePolicy: layer.escapePolicy, order: layer.order }))),
      trapTab,
      moveRoving,
      handleKeydown,
      focusables,
    });
  }

  return Object.freeze({ version, focusableSelector, isUsable, focusables, createFocusLayer });
}));
