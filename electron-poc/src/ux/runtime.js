(function initUxRuntime(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackUxRuntime = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const version = 'nethack-ux-runtime/v1';
  const immutableGameSnapshotBrand = Symbol.for('nethack.game-view-state.immutable-snapshot');
  const DOMAIN_IDS = Object.freeze([
    'interaction', 'shell', 'discovery', 'map', 'items', 'transfer', 'run-lifecycle', 'conformance',
  ]);
  const SERVICE_SLOTS = Object.freeze(['notice', 'dialog']);

  function immutableCopy(value, seen = new WeakSet()) {
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (Object.isFrozen(value) && value[immutableGameSnapshotBrand] === true) return value;
    if (seen.has(value)) throw new TypeError('UX runtime snapshots must not contain cycles');
    seen.add(value);
    let copy;
    if (Array.isArray(value)) copy = value.map((entry) => immutableCopy(entry, seen));
    else if (value instanceof Map) copy = Array.from(value.entries(), ([key, entry]) => Object.freeze([immutableCopy(key, seen), immutableCopy(entry, seen)]));
    else if (value instanceof Set) copy = Array.from(value, (entry) => immutableCopy(entry, seen));
    else if (value instanceof Date) copy = value.toISOString();
    else {
      copy = {};
      for (const [key, entry] of Object.entries(value)) {
        const immutableEntry = immutableCopy(entry, seen);
        if (immutableEntry !== undefined) copy[key] = immutableEntry;
      }
    }
    seen.delete(value);
    return Object.freeze(copy);
  }

  function createRuntime(options = {}) {
    const domains = new Map();
    const registrationOrder = [];
    const services = new Map();
    const subscribers = new Map();
    const diagnostics = [];
    let diagnosticSink = typeof options.diagnosticSink === 'function' ? options.diagnosticSink : null;
    let latestPublicState;

    function record(type, detail = {}) {
      const entry = immutableCopy({ type, detail, sequence: diagnostics.length + 1 });
      diagnostics.push(entry);
      if (diagnostics.length > 100) diagnostics.shift();
      try { diagnosticSink?.(entry); } catch {}
      return entry;
    }

    function requireDomainId(id) {
      const domainId = String(id || '').trim();
      if (!DOMAIN_IDS.includes(domainId)) throw new TypeError(`Unknown UX domain: ${domainId || '(empty)'}`);
      return domainId;
    }

    function registerDomain(id, controller) {
      let domainId;
      try { domainId = requireDomainId(id); }
      catch (error) {
        record('domain.registration-rejected', { domainId: String(id || ''), reason: 'unknown-domain', message: error.message });
        throw error;
      }
      if (!controller || typeof controller !== 'object') {
        record('domain.registration-rejected', { domainId, reason: 'invalid-controller' });
        throw new TypeError(`UX domain ${domainId} requires a controller object`);
      }
      if (domains.has(domainId)) {
        record('domain.registration-rejected', { domainId, reason: 'duplicate-owner' });
        throw new Error(`UX domain already has an owner: ${domainId}`);
      }
      const stableController = Object.freeze({ ...controller });
      domains.set(domainId, stableController);
      registrationOrder.push(domainId);
      record('domain.registered', { domainId, order: registrationOrder.length });
      return stableController;
    }

    function domain(id) {
      return domains.get(String(id || ''));
    }

    function listDomains() {
      return Object.freeze(registrationOrder.map((id, index) => Object.freeze({ id, order: index + 1 })));
    }


    function subscribePublicState(ownerId, listener) {
      const domainId = requireDomainId(ownerId);
      if (!domains.has(domainId)) throw new Error(`Register UX domain before subscribing: ${domainId}`);
      if (typeof listener !== 'function') throw new TypeError('UX public-state subscriber must be a function');
      const token = Symbol(domainId);
      subscribers.set(token, Object.freeze({ ownerId: domainId, listener }));
      record('public-state.subscribed', { ownerId: domainId });
      if (latestPublicState) listener(latestPublicState.snapshot, latestPublicState.meta);
      return Object.freeze({ unsubscribe() { subscribers.delete(token); } });
    }

    function publishPublicState(snapshot, meta = {}) {
      const immutableSnapshot = immutableCopy(snapshot || {});
      const immutableMeta = immutableCopy(meta || {});
      latestPublicState = Object.freeze({ snapshot: immutableSnapshot, meta: immutableMeta });
      const requestedDomains = Array.isArray(immutableMeta.domains) ? new Set(immutableMeta.domains) : null;
      for (const subscriber of subscribers.values()) {
        if (requestedDomains && !requestedDomains.has(subscriber.ownerId)) continue;
        try { subscriber.listener(immutableSnapshot, immutableMeta); }
        catch (error) { record('public-state.subscriber-failed', { ownerId: subscriber.ownerId, message: String(error?.message || error) }); }
      }
      return immutableSnapshot;
    }

    function installService(slot, ownerId, service) {
      const serviceSlot = String(slot || '');
      let domainId;
      try { domainId = requireDomainId(ownerId); }
      catch (error) {
        record('service.registration-rejected', { slot: serviceSlot, ownerId: String(ownerId || ''), reason: 'unknown-domain' });
        throw error;
      }
      if (!SERVICE_SLOTS.includes(serviceSlot)) {
        record('service.registration-rejected', { slot: serviceSlot, ownerId: domainId, reason: 'unknown-slot' });
        throw new TypeError(`Unknown UX service slot: ${serviceSlot || '(empty)'}`);
      }
      if (domainId !== 'interaction') {
        record('service.registration-rejected', { slot: serviceSlot, ownerId: domainId, reason: 'wrong-owner' });
        throw new Error(`${serviceSlot} service is owned by the interaction domain`);
      }
      if (!domains.has(domainId)) {
        record('service.registration-rejected', { slot: serviceSlot, ownerId: domainId, reason: 'domain-not-registered' });
        throw new Error(`Register UX domain before its service: ${domainId}`);
      }
      if (!service || typeof service !== 'object') {
        record('service.registration-rejected', { slot: serviceSlot, ownerId: domainId, reason: 'invalid-service' });
        throw new TypeError(`UX service ${serviceSlot} requires an object`);
      }
      if (services.has(serviceSlot)) {
        record('service.registration-rejected', { slot: serviceSlot, ownerId: domainId, reason: 'duplicate-owner' });
        throw new Error(`UX service already installed: ${serviceSlot}`);
      }
      const stableService = Object.freeze({ ...service });
      services.set(serviceSlot, stableService);
      record('service.registered', { slot: serviceSlot, ownerId: domainId });
      return stableService;
    }

    const api = {
      version,
      domainIds: DOMAIN_IDS,
      serviceSlots: SERVICE_SLOTS,
      registerDomain,
      domain,
      listDomains,
      subscribePublicState,
      publishPublicState,
      latestPublicState: () => latestPublicState,
      installService,
      service: (slot) => services.get(String(slot || '')),
      diagnostics: () => Object.freeze(diagnostics.slice()),
      setDiagnosticSink(sink) {
        diagnosticSink = typeof sink === 'function' ? sink : null;
        return Boolean(diagnosticSink);
      },
    };
    return Object.freeze(api);
  }

  const runtime = createRuntime();
  return Object.freeze({ version, DOMAIN_IDS, SERVICE_SLOTS, immutableCopy, createRuntime, runtime });
}));
