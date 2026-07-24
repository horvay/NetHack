const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');
const stageRoot = path.join(appRoot, 'release-runtime');
const playgroundTemplate = path.join(stageRoot, 'playground-template');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
}

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: fs.statSync(source).isDirectory(), force: true });
}

function stageRuntimeLibraries(binary, acceptedNames, requiredNames) {
  const result = spawnSync('ldd', [binary], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ldd ${binary} exited with ${result.status}`);
  const libraries = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*([^\s]+)\s+=>\s+(\/[^\s]+)/);
    if (!match || !acceptedNames.some((name) => match[1].startsWith(name))) continue;
    libraries.set(match[1], match[2]);
  }
  for (const name of requiredNames) {
    if (![...libraries.keys()].some((library) => library.startsWith(name))) {
      throw new Error(`${binary} did not resolve required runtime library ${name}`);
    }
  }
  for (const [name, source] of libraries) {
    const destination = path.join(stageRoot, 'lib', name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(fs.realpathSync(source), destination);
    if (fs.lstatSync(destination).isSymbolicLink()) throw new Error(`Runtime library must not be a symbolic link: ${name}`);
  }
}

if (process.platform !== 'linux') throw new Error('The native Electron runtime currently supports Linux only.');

fs.rmSync(stageRoot, { recursive: true, force: true });
fs.mkdirSync(playgroundTemplate, { recursive: true });
run('sh', ['setup.sh', 'hints/linux.500'], path.join(repoRoot, 'sys', 'unix'));
run('make', ['fetch-Lua'], repoRoot);
run('make', ['all'], repoRoot);
run('make', [`HACKDIR=${playgroundTemplate}`, `INSTDIR=${playgroundTemplate}`, `VARDIR=${playgroundTemplate}`, 'install'], repoRoot);
run('npm', ['run', 'build:shim'], appRoot);
run('make', ['-C', 'util', 'recover'], repoRoot);
copy(path.join(repoRoot, 'sys', 'unix', 'sysconf'), path.join(stageRoot, 'playground-template', 'sysconf'));
copy(path.join(repoRoot, 'src', 'nethack'), path.join(stageRoot, 'src', 'nethack'));
copy(path.join(appRoot, 'shim-bridge', 'nh-shim-bridge'), path.join(stageRoot, 'electron-poc', 'shim-bridge', 'nh-shim-bridge'));
copy(path.join(repoRoot, 'util', 'recover'), path.join(stageRoot, 'util', 'recover'));
stageRuntimeLibraries(
  path.join(stageRoot, 'electron-poc', 'shim-bridge', 'nh-shim-bridge'),
  ['libncurses', 'libtinfo', 'libuuid', 'libuv'],
  ['libncurses', 'libuuid', 'libuv'],
);

const required = [
  'playground-template/sysconf',
  'playground-template/nhdat',
  'src/nethack',
  'electron-poc/shim-bridge/nh-shim-bridge',
  'util/recover',
];
for (const relative of required) {
  if (!fs.existsSync(path.join(stageRoot, relative))) throw new Error(`Missing staged runtime file: ${relative}`);
}

console.log(`Prepared packaged runtime at ${stageRoot}`);
