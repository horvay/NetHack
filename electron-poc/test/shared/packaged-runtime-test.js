const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Runtime = require('../../src/main/packaged-runtime');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-packaged-runtime-'));
try {
  const resourcesPath = path.join(root, 'resources');
  const userDataPath = path.join(root, 'user-data');
  const template = path.join(resourcesPath, 'runtime', 'playground-template');
  fs.mkdirSync(path.join(template, 'save'), { recursive: true });
  fs.writeFileSync(path.join(template, 'sysconf'), 'OPTIONS=!autopickup\n');
  fs.writeFileSync(path.join(template, 'data'), 'new static data\n');
  fs.writeFileSync(path.join(template, 'record'), 'template record\n');
  fs.writeFileSync(path.join(template, 'save', 'template-save'), 'template save\n');

  const runtime = Runtime.resolveRuntime({
    packaged: true,
    devRepoRoot: '/unused',
    resourcesPath,
    userDataPath,
    platform: 'linux',
  });
  assert.equal(runtime.repoRoot, path.join(resourcesPath, 'runtime'));
  assert.equal(runtime.shimBridgeBin, path.join(resourcesPath, 'runtime', 'electron-poc', 'shim-bridge', 'nh-shim-bridge'));
  assert.equal(runtime.playground, path.join(userDataPath, 'playground'));

  fs.mkdirSync(path.join(runtime.playground, 'save'), { recursive: true });
  fs.writeFileSync(path.join(runtime.playground, 'data'), 'old static data\n');
  fs.writeFileSync(path.join(runtime.playground, 'record'), 'player record\n');
  fs.writeFileSync(path.join(runtime.playground, 'save', 'hero-save'), 'saved hero\n');

  Runtime.preparePlayground(runtime).then(async () => {
    assert.equal(fs.readFileSync(path.join(runtime.playground, 'sysconf'), 'utf8'), 'OPTIONS=!autopickup\n');
    assert.equal(fs.readFileSync(path.join(runtime.playground, 'data'), 'utf8'), 'new static data\n');
    assert.equal(fs.readFileSync(path.join(runtime.playground, 'record'), 'utf8'), 'player record\n');
    assert.equal(fs.readFileSync(path.join(runtime.playground, 'save', 'hero-save'), 'utf8'), 'saved hero\n');
    assert.equal(fs.existsSync(path.join(runtime.playground, 'save', 'template-save')), false);

    const emptyResourcesPath = path.join(root, 'empty-resources');
    const emptyTemplate = path.join(emptyResourcesPath, 'runtime', 'playground-template');
    fs.mkdirSync(emptyTemplate, { recursive: true });
    fs.writeFileSync(path.join(emptyTemplate, 'sysconf'), 'OPTIONS=!autopickup\n');
    const emptyRuntime = Runtime.resolveRuntime({
      packaged: true,
      devRepoRoot: '/unused',
      resourcesPath: emptyResourcesPath,
      userDataPath: path.join(root, 'empty-user-data'),
      platform: 'linux',
    });
    await Runtime.preparePlayground(emptyRuntime);
    assert.equal(fs.statSync(path.join(emptyRuntime.playground, 'save')).isDirectory(), true, 'first packaged launch creates the save directory required by recover');

    const devRepoRoot = path.join(root, 'dev-repo');
    const devRuntime = Runtime.resolveRuntime({
      packaged: false,
      devRepoRoot,
      resourcesPath: '/unused',
      userDataPath: '/unused',
      platform: 'win32',
    });
    const devEnv = Runtime.runtimeEnvironment(devRuntime, { PATH: 'C:\\Windows\\System32' });
    assert.equal(devRuntime.playground, path.join(devRepoRoot, 'playground'));
    assert.equal(devEnv.NETHACKDIR, devRuntime.playground, 'development bridge resolves generated runtime data from the repository playground');

    const env = Runtime.runtimeEnvironment(runtime, { PATH: '/bin', LD_LIBRARY_PATH: '/custom/lib' });
    assert.equal(env.NETHACKDIR, runtime.playground);
    assert.equal(env.LD_LIBRARY_PATH, `${runtime.libraryPath}:/custom/lib`);
    console.log('packaged runtime: PASS');
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} finally {
  process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
}
