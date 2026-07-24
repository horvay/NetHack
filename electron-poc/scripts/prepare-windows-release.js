const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');
const stageRoot = path.join(appRoot, 'release-runtime');
const extractedRoot = path.resolve(process.argv[2] || '');

if (process.platform !== 'win32') throw new Error('Windows release staging must run on Windows.');
if (!process.argv[2] || !fs.existsSync(extractedRoot)) throw new Error('usage: node prepare-windows-release.js <extracted NetHack package>');

function walk(root) {
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...walk(absolute));
    else results.push(absolute);
  }
  return results;
}

function findFile(files, predicate, label) {
  const match = files.find((file) => predicate(path.basename(file)));
  if (!match) throw new Error(`Missing Windows runtime file: ${label}`);
  return match;
}

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: fs.statSync(source).isDirectory(), force: true });
}

const files = walk(extractedRoot);
const nhdat = findFile(files, (name) => /^nhdat\d*$/i.test(name), 'nhdat');
const sysconf = findFile(files, (name) => /^sysconf(?:\.template)?$/i.test(name), 'sysconf');
const nethack = findFile(files, (name) => name.toLowerCase() === 'nethack.exe', 'NetHack.exe');
const bridge = path.join(appRoot, 'shim-bridge', 'nh-shim-bridge.exe');
const buildFiles = fs.existsSync(path.join(repoRoot, 'vsbinary')) ? walk(path.join(repoRoot, 'vsbinary')) : [];
const recover = findFile([...files, ...buildFiles], (name) => name.toLowerCase() === 'recover.exe', 'recover.exe');

const runtimeDirectory = path.dirname(nhdat);
fs.rmSync(stageRoot, { recursive: true, force: true });
copy(runtimeDirectory, path.join(stageRoot, 'playground-template'));
copy(sysconf, path.join(stageRoot, 'playground-template', 'sysconf'));
copy(nethack, path.join(stageRoot, 'src', 'nethack.exe'));
copy(recover, path.join(stageRoot, 'util', 'recover.exe'));
copy(bridge, path.join(stageRoot, 'electron-poc', 'shim-bridge', 'nh-shim-bridge.exe'));

for (const relative of [
  'playground-template/sysconf',
  path.join('playground-template', path.basename(nhdat)),
  'src/nethack.exe',
  'util/recover.exe',
  'electron-poc/shim-bridge/nh-shim-bridge.exe',
]) {
  if (!fs.existsSync(path.join(stageRoot, relative))) throw new Error(`Missing staged runtime file: ${relative}`);
}

console.log(`Prepared Windows runtime at ${stageRoot}`);
console.log(`Runtime source: ${runtimeDirectory}`);
console.log(`Repository: ${repoRoot}`);
