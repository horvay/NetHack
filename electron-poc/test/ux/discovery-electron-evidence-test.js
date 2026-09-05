const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Harness = require('../../scripts/lib/electron-test-harness');

const root = path.resolve(__dirname, '../..');
const outDir = path.resolve(process.env.NH_UXM03_EVIDENCE_DIR || path.join(root, 'test-output/uxm03-discovery-electron'));
const port = Number(process.env.NH_UXM03_CDP_PORT || 19903);
const isolatedRoot = path.join(outDir, 'isolated-runtime');
fs.mkdirSync(isolatedRoot, { recursive: true });
const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: path.join(outDir, 'screenshots') });
const captures = [];

async function main() {
  await Harness.withElectronBrowserDriver({
    root,
    port,
    width: 1360,
    height: 920,
    env: {
      NH_ELECTRON_TEST_MODE: '1',
      NETHACKDIR: path.join(isolatedRoot, 'playground'),
      XDG_CONFIG_HOME: path.join(isolatedRoot, 'xdg-config'),
    },
  }, async (driver) => {
    await driver.waitForRendererReady({ automation: true, startButton: true });
    await driver.evalCheckedValue(`(() => {
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close('uxm03-evidence');
      const mount = document.getElementById('ux-discovery-root');
      mount.replaceChildren();
      const catalog = NetHackUxCommandCatalog.createCommandCatalog();
      const dialogService = NetHackUxRuntime.runtime.service('dialog');
      const dispatches = [];
      const dispatchAdapter = {
        sendKey(value) { dispatches.push({ kind: 'key', value }); return true; },
        sendText(value) { dispatches.push({ kind: 'text', value }); return true; },
        openSurface(value) { dispatches.push({ kind: 'surface', value }); return true; },
      };
      const palette = NetHackUxCommandPalette.createPaletteController({ documentRoot: document, mount, catalog, dialogService, dispatchAdapter, keyHints: () => 'always' });
      const help = NetHackUxHelpCenter.createHelpController({ documentRoot: document, mount, catalog, dialogService, manualLines: ['NetHack Manual', '', 'Commands are case-sensitive.', 'Type # followed by an extended command name.', '', 'Escape cancels the current prompt.'] });
      const creation = NetHackUxCharacterCreation.createCharacterCreationController({ documentRoot: document, mount, characterOptions: NetHackCharacterOptions, dialogService });
      window.__uxm03Evidence = { mount, catalog, palette, help, creation, dispatches };
      return true;
    })()`);

    async function setViewport(width, height, textZoom = 1) {
      await driver.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await driver.evalCheckedValue(`(() => { document.documentElement.style.fontSize = ${JSON.stringify(textZoom === 2 ? '200%' : '')}; return { width: innerWidth, height: innerHeight, fontSize: getComputedStyle(document.documentElement).fontSize }; })()`);
    }
    async function closeDialogs() {
      await driver.evalCheckedValue(`(() => { for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close('evidence-next'); return true; })()`);
    }
    async function capture(id, viewport, stateLabel) {
      const state = await driver.evalCheckedValue(`(() => ({
        openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
        focus: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        internalHorizontalOverflow: Array.from(document.querySelectorAll('#ux-discovery-root dialog[open], #ux-discovery-root dialog[open] form, #ux-discovery-root .ux-command-results, #ux-discovery-root .ux-help-body')).some((node) => node.scrollWidth > node.clientWidth + 1),
        clippedVisibleActions: Array.from(document.querySelectorAll('#ux-discovery-root dialog[open] header button, #ux-discovery-root dialog[open] .dialog-actions button')).filter((node) => { const r = node.getBoundingClientRect(); const style = getComputedStyle(node); return style.display !== 'none' && (!r.width || !r.height || r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight); }).map((node) => node.textContent.trim()),
        viewport: { width: innerWidth, height: innerHeight },
        textSize: getComputedStyle(document.documentElement).fontSize,
        visibleText: Array.from(document.querySelectorAll('#ux-discovery-root dialog[open]')).map((node) => node.innerText).join('\\n').slice(0, 4000),
      }))()`);
      assert.equal(state.horizontalOverflow, false, `${id} must not create horizontal page overflow`);
      assert.equal(state.internalHorizontalOverflow, false, `${id} must not create internal horizontal overflow`);
      assert.deepEqual(state.clippedVisibleActions, [], `${id} must keep visible dialog actions inside the viewport`);
      const entry = await driver.screenshotEvidence(qc, id, { viewport: { ...viewport, devicePixelRatio: 1 }, state: { label: stateLabel, ...state }, viewSafeFormat: 'BMP', viewSafeScale: 1 });
      fs.writeFileSync(path.join(outDir, `${id}-state.json`), `${JSON.stringify(state, null, 2)}\n`);
      captures.push({ id, state, raw: entry.raw.path, derivative: entry.derivative.path });
    }

    await setViewport(1360, 920, 1);
    await driver.evalCheckedValue(`(() => { __uxm03Evidence.creation.open({ selection: { role: 'Mon', race: 'Dwa', gender: 'Fem', alignment: 'Law' } }); __uxm03Evidence.creation.model.setAdvanced(true); __uxm03Evidence.creation.render(); return true; })()`);
    await capture('1360-character-advanced-constraint', { width: 1360, height: 920 }, 'synthetic domain controller in real Electron, character constraint and Advanced');
    await closeDialogs();
    await driver.evalCheckedValue(`(() => { __uxm03Evidence.palette.open({ query: 'drink potion' }); return true; })()`);
    await capture('1360-palette-alias', { width: 1360, height: 920 }, 'synthetic domain controller in real Electron, alias search');
    await closeDialogs();
    await driver.evalCheckedValue(`(() => { __uxm03Evidence.help.open({ section: 'basics' }); return true; })()`);
    await capture('1360-help-basics', { width: 1360, height: 920 }, 'synthetic domain controller in real Electron, Help Basics');
    await closeDialogs();

    await driver.evalCheckedValue(`(() => {
      const dialog = document.createElement('dialog'); dialog.id = 'ux-magic-evidence'; dialog.className = 'ux-help-center';
      const frame = document.createElement('div'); frame.className = 'ux-help-frame';
      const heading = document.createElement('header'); heading.className = 'ux-help-heading'; heading.innerHTML = '<div><span class="ux-discovery-kicker">Magic</span><h2>Spells</h2></div>';
      const rows = document.createElement('div'); rows.className = 'ux-help-body';
      frame.append(heading, rows); dialog.append(frame); __uxm03Evidence.mount.append(dialog);
      NetHackUxHelpCenter.renderMagicRows({ documentRoot: document, mount: rows, kind: 'spell', source: 'typed', actionLabel: 'Cast', onSelect: () => {}, rows: [
        { selector: 'a', name: 'force bolt', level: 1, pwCost: 5, failure: '12%', status: 'Known' },
        { selector: 'b', name: 'healing', level: 1, pwCost: 5, failure: '38%' },
        { selector: 'c', name: 'detect monsters', status: 'Forgotten' },
      ] });
      dialog.showModal(); return true;
    })()`);
    await capture('1360-spells-typed', { width: 1360, height: 920 }, 'synthetic typed public spell rows in real Electron');
    await closeDialogs();

    await setViewport(960, 720, 1);
    await driver.evalCheckedValue(`(() => { __uxm03Evidence.palette.open({ query: 'quit' }); return true; })()`);
    await capture('960-palette-danger', { width: 960, height: 720 }, 'synthetic domain controller in real Electron, serious command placement');
    await closeDialogs();
    await driver.evalCheckedValue(`(() => { __uxm03Evidence.help.open({ section: 'manual' }); return true; })()`);
    await capture('960-help-manual', { width: 960, height: 720 }, 'synthetic domain controller in real Electron, exact Manual text');
    await closeDialogs();
    await driver.evalCheckedValue(`(() => {
      const old = document.getElementById('ux-magic-evidence'); old?.remove();
      const dialog = document.createElement('dialog'); dialog.id = 'ux-magic-evidence'; dialog.className = 'ux-help-center';
      const frame = document.createElement('div'); frame.className = 'ux-help-frame';
      const heading = document.createElement('header'); heading.className = 'ux-help-heading'; heading.innerHTML = '<div><span class="ux-discovery-kicker">Character</span><h2>Skills</h2></div>';
      const rows = document.createElement('div'); rows.className = 'ux-help-body'; frame.append(heading, rows); dialog.append(frame); __uxm03Evidence.mount.append(dialog);
      NetHackUxHelpCenter.renderMagicRows({ documentRoot: document, mount: rows, kind: 'skill', source: 'fallback', actionLabel: (row) => row.canAdvance === true ? 'Advance' : '', onSelect: () => {}, rows: [
        { selector: 'a', name: 'dagger', rank: 'Basic', nextRank: 'Skilled', cost: 2, canAdvance: true },
        { selector: 'b', name: 'long sword', rank: 'Skilled' },
        { selector: 'c', name: 'bare handed combat', rank: 'Unskilled', canAdvance: false },
      ] });
      dialog.showModal(); return true;
    })()`);
    await capture('960-skills-fallback', { width: 960, height: 720 }, 'synthetic parser-fallback skill rows in real Electron');
    await closeDialogs();

    await setViewport(960, 720, 2);
    await driver.evalCheckedValue(`(() => { __uxm03Evidence.palette.open({ query: 'q' }); return true; })()`);
    await capture('960-zoom200-palette-case', { width: 960, height: 720 }, 'synthetic domain controller in real Electron, 200 percent text zoom and lowercase q');
    await closeDialogs();
    await driver.evalCheckedValue(`(() => { __uxm03Evidence.creation.open({}); __uxm03Evidence.creation.model.setAdvanced(true); __uxm03Evidence.creation.render(); return true; })()`);
    await capture('960-zoom200-character', { width: 960, height: 720 }, 'synthetic domain controller in real Electron, 200 percent text zoom character form');
    await closeDialogs();
    await driver.evalCheckedValue(`(() => { __uxm03Evidence.help.open({ section: 'keys', query: 'wait' }); return true; })()`);
    await capture('960-zoom200-help-keys', { width: 960, height: 720 }, 'synthetic domain controller in real Electron, 200 percent text zoom movement help');

    const output = driver.output();
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), output.stderr);
  });

  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const summary = {
    ok: true,
    evidenceKind: 'synthetic domain controllers rendered inside real Electron; not integrated real gameplay proof',
    port,
    captures,
    screenshotManifest: qc.manifestFile,
    manifestValidation: validation,
    isolatedRoot,
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, captures: captures.length, screenshotManifest: qc.manifestFile, evidenceKind: summary.evidenceKind }, null, 2));
}

main().catch((error) => {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'failure.log'), `${error.stack || error}\n`);
  console.error(error.stack || error);
  process.exit(1);
});
