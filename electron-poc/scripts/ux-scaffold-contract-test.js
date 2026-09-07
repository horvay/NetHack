const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Mounts = require('../src/ux/app-mounts');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/renderer.html'), 'utf8');
const scripts = Array.from(html.matchAll(/<script\s+src="([^"]+)"\s*>\s*<\/script>/g), (match) => match[1]);
const styles = Array.from(html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/>/g), (match) => match[1]);
const expectedCore = ['./ux/runtime.js', './ux/settings-store.js', './ux/app-mounts.js'];
for (const source of expectedCore) assert(scripts.includes(source), `${source} must be preloaded`);
assert(scripts.indexOf('./ux/runtime.js') < scripts.indexOf('./renderer.js'), 'UX runtime loads before renderer');
for (const id of Object.values(Mounts.mountIds)) assert(new RegExp(`id="${id}"`).test(html), `renderer must predeclare #${id}`);

const plannedScripts = fs.readdirSync(path.join(root, 'src/ux')).filter((name) => name.endsWith('.js')).map((name) => `./ux/${name}`);
for (const source of plannedScripts) assert(scripts.includes(source), `${source} must have a preloaded module slot`);
const plannedStyles = fs.readdirSync(path.join(root, 'src/ux/styles')).filter((name) => name.endsWith('.css')).map((name) => `./ux/styles/${name}`);
for (const source of plannedStyles) assert(styles.includes(source), `${source} must have a preloaded stylesheet slot`);

const context = { console };
context.window = context;
context.self = context;
vm.createContext(context);
for (const source of expectedCore) vm.runInContext(fs.readFileSync(path.join(root, 'src', source.replace(/^\.\//, '')), 'utf8'), context, { filename: source });
for (const name of ['NetHackUxRuntime', 'NetHackUxSettingsStore', 'NetHackUxAppMounts']) assert.equal(Object.isFrozen(context[name]), true, `${name} must be frozen`);
assert.equal(context.NetHackUxRuntime.version, 'nethack-ux-runtime/v1');
assert.equal(context.NetHackUxSettingsStore.schemaVersion, 5);

console.log('UX scaffold preload and browser-global contract OK');
