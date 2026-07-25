const fs = require('node:fs/promises');
const path = require('node:path');

const MUTABLE_PLAYGROUND_ENTRIES = new Set([
  'save',
  'perm',
  'record',
  'logfile',
  'xlogfile',
  'livelog',
  'paniclog',
]);

function resolveRuntime({ packaged, devRepoRoot, resourcesPath, userDataPath, platform = process.platform } = {}) {
  const executableSuffix = platform === 'win32' ? '.exe' : '';
  if (!packaged) {
    return {
      packaged: false,
      repoRoot: devRepoRoot,
      playground: path.join(devRepoRoot, 'playground'),
      playgroundTemplate: null,
      nethackBin: path.join(devRepoRoot, 'src', `nethack${executableSuffix}`),
      shimBridgeBin: path.join(devRepoRoot, 'electron-poc', 'shim-bridge', `nh-shim-bridge${executableSuffix}`),
      recoverBin: path.join(devRepoRoot, 'util', `recover${executableSuffix}`),
      libraryPath: null,
    };
  }

  const repoRoot = path.join(resourcesPath, 'runtime');
  return {
    packaged: true,
    repoRoot,
    playground: path.join(userDataPath, 'playground'),
    playgroundTemplate: path.join(repoRoot, 'playground-template'),
    nethackBin: path.join(repoRoot, 'src', `nethack${executableSuffix}`),
    shimBridgeBin: path.join(repoRoot, 'electron-poc', 'shim-bridge', `nh-shim-bridge${executableSuffix}`),
    recoverBin: path.join(repoRoot, 'util', `recover${executableSuffix}`),
    libraryPath: platform === 'linux' ? path.join(repoRoot, 'lib') : null,
  };
}

async function preparePlayground(runtime) {
  if (!runtime?.packaged) return runtime?.playground;
  await fs.mkdir(runtime.playground, { recursive: true });
  await fs.mkdir(path.join(runtime.playground, 'save'), { recursive: true });
  const entries = await fs.readdir(runtime.playgroundTemplate, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(runtime.playgroundTemplate, entry.name);
    const destination = path.join(runtime.playground, entry.name);
    if (MUTABLE_PLAYGROUND_ENTRIES.has(entry.name)) {
      try {
        await fs.access(destination);
        continue;
      } catch {
        // First launch: seed the mutable file or directory from the template.
      }
    }
    await fs.cp(source, destination, { recursive: entry.isDirectory(), force: true });
  }
  return runtime.playground;
}

function runtimeEnvironment(runtime, env = process.env) {
  if (!runtime) return env;
  return {
    ...env,
    NETHACKDIR: runtime.playground,
    ...(runtime.libraryPath
      ? { LD_LIBRARY_PATH: `${runtime.libraryPath}${env.LD_LIBRARY_PATH ? `:${env.LD_LIBRARY_PATH}` : ''}` }
      : {}),
  };
}

module.exports = Object.freeze({
  MUTABLE_PLAYGROUND_ENTRIES,
  resolveRuntime,
  preparePlayground,
  runtimeEnvironment,
});
