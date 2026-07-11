(function initModuleSystem(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackModuleSystem = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const moduleFormat = 'commonjs-with-browser-global-adapter';
  const migrationPhase = 'phase-1-no-bundler';
  return Object.freeze({
    moduleFormat,
    migrationPhase,
    browserGlobalPrefix: 'NetHack',
    notes: [
      'Keep shared modules side-effect-light and CommonJS-loadable for Node tests.',
      'Expose the same interface as a frozen browser global when loaded by plain script tags.',
      'Do not convert renderer.html to type=module until Electron tests and fixture scripts have equivalent imports.',
    ],
  });
}));
