const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const srcRoot = path.resolve(__dirname, '..', '..', 'src');
const uxRoot = path.join(srcRoot, 'ux');
const sharedRoot = path.join(srcRoot, 'shared');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
  if (request === '../shared/message-log.js' || request === '../shared/message-log') {
    return path.join(sharedRoot, 'message-log.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

const MessageLog = require(path.join(sharedRoot, 'message-log.js'));
const ConsequenceFeed = require(path.join(uxRoot, 'consequence-feed.js'));
const StatusPresentation = require(path.join(uxRoot, 'status-presentation.js'));
const AppShell = require(path.join(uxRoot, 'app-shell.js'));

function createDocument() {
  const body = {
    dataset: { uxMapMode: 'full' },
    classList: {
      values: new Set(),
      add(name) { this.values.add(name); },
      remove(name) { this.values.delete(name); },
      contains(name) { return this.values.has(name); },
      toggle(name, force) {
        if (force == null) force = !this.values.has(name);
        if (force) this.values.add(name); else this.values.delete(name);
        return force;
      },
    },
    append() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const mounts = new Map();
  function element(id, extras = {}) {
    const el = {
      id,
      dataset: {},
      hidden: false,
      textContent: '',
      title: '',
      className: '',
      style: { setProperty() {}, removeProperty() {} },
      children: [],
      scrollTop: 0,
      scrollHeight: 0,
      clientWidth: extras.clientWidth || 0,
      clientHeight: extras.clientHeight || 0,
      scrollWidth: extras.scrollWidth || 0,
      scrollHeightValue: extras.scrollHeight || 0,
      classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
      contains() { return false; },
      getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 100, height: 100 }; },
      querySelector(selector) {
        if (selector === '.tile-cell.cursor') {
          return cursorProxy;
        }
        if (selector === '.log-heading') return logHeading;
        if (selector === '.ux-command-entry-label') return null;
        if (selector === 'strong') return strong;
        if (selector === 'span') return hint;
        return null;
      },
      querySelectorAll() { return []; },
      addEventListener() {},
      removeEventListener() {},
      append(...nodes) { this.children.push(...nodes); },
      prepend(...nodes) { this.children.unshift(...nodes); },
      appendChild(node) { this.children.push(node); return node; },
      replaceChildren(...nodes) { this.children = nodes.slice(); },
      setAttribute() {},
      focus() {},
      ...extras,
    };
    Object.defineProperty(el, 'scrollHeight', {
      get() { return this.scrollHeightValue || 0; },
      set(value) { this.scrollHeightValue = value; },
    });
    mounts.set(id, el);
    return el;
  }

  const strong = { textContent: 'Recent messages' };
  const hint = { textContent: 'hint' };
  const logHeading = {
    querySelector(selector) {
      if (selector === 'strong') return strong;
      if (selector === 'span') return hint;
      return null;
    },
  };
  const cursorProxy = {
    offsetLeft: 960,
    offsetTop: 240,
    offsetWidth: 24,
    offsetHeight: 24,
  };

  element('top-bar');
  element('stats-panel');
  element('ux-player-notice-root');
  element('quick-actions');
  element('inventory-equipment-button');
  element('open-actions');
  element('log-panel');
  element('map-log-resizer');
  element('messages');
  element('log-position-hint');
  element('log-jump-newest');
  element('game-grid', { scrollWidth: 1920, scrollHeight: 504 });
  element('intro-body');
  element('play-area', { clientWidth: 800, clientHeight: 600 });
  element('message-history');
  const logNow = element('log-now-proxy');
  const gameViewSection = element('game-view-section-proxy');
  gameViewSection.className = 'game-view-section';

  const grid = mounts.get('game-grid');
  grid.styleProps = {};
  grid.style.setProperty = (key, value) => { grid.styleProps[key] = value; };
  grid.style.removeProperty = (key) => { delete grid.styleProps[key]; };
  grid.querySelector = (selector) => (selector === '.tile-cell.cursor' ? cursorProxy : null);

  const logPanel = mounts.get('log-panel');
  logPanel.querySelector = (selector) => {
    if (selector === '.log-heading') return logHeading;
    return null;
  };

  const quick = mounts.get('quick-actions');
  quick.querySelector = () => null;

  return {
    body,
    activeElement: null,
    getElementById(id) { return mounts.get(id) || null; },
    createElement(tag) {
      return {
        tagName: String(tag || 'div').toUpperCase(),
        dataset: {},
        className: '',
        textContent: '',
        type: '',
        id: '',
        title: '',
        style: {},
        children: [],
        hidden: false,
        classList: { values: new Set(), add(name){ this.values.add(name); }, remove(name){ this.values.delete(name); }, contains(name){ return this.values.has(name); } },
        setAttribute() {},
        append(...nodes) { this.children.push(...nodes); },
        appendChild(node) { this.children.push(node); return node; },
        replaceChildren(...nodes) { this.children = nodes.slice(); },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
      };
    },
    querySelector(selector) {
      if (selector === '.game-view-section') return gameViewSection;
      if (selector === '.log-now') return logNow;
      return null;
    },
    querySelectorAll() { return []; },
    _cursorProxy: cursorProxy,
    _grid: grid,
  };
}

const documentRoot = createDocument();
const runtime = {
  latestPublicState() { return null; },
  subscribePublicState() { return { unsubscribe() {} }; },
  service() { return null; },
  record() {},
};

const controller = AppShell.createAppShellController({
  runtime,
  documentRoot,
  root: {
    NetHackMessageLog: MessageLog,
    NetHackUxConsequenceFeed: ConsequenceFeed,
    NetHackUxStatusPresentation: StatusPresentation,
    NetHackUxSettingsStore: {
      defaultSettings: { hudDensity: 'compact', map: { mode: 'follow' }, layout: { logRatio: 0.5 } },
      createSettingsStore() {
        return {
          load() { return { settings: { hudDensity: 'compact', map: { mode: 'follow' }, layout: { logRatio: 0.5 } } }; },
          save() { return { settings: { hudDensity: 'compact', map: { mode: 'follow' }, layout: { logRatio: 0.5 } }, persisted: true }; },
        };
      },
    },
    requestAnimationFrame(fn) { fn(); },
    localStorage: { getItem() { return null; }, setItem() {} },
    addEventListener() {},
    removeEventListener() {},
    setTimeout(fn) { fn(); return 0; },
  },
});

assert.equal(controller.connect(), true);
controller.setMapMode('follow', { persist: false });

const messages = [
  'Hello Agent, welcome to NetHack!  You are a lawful female gnomish Archeologist.',
  'You can see here a food ration.',
  'The grid bug bites!',
];
const statusValues = new Map([
  [0, 'Agent the Intern'],
  [10, '14(14)'],
  [11, '7'],
  [12, '12'],
]);

assert.doesNotThrow(() => {
  controller.update({
    game: {
      messages,
      statusValues,
      cursor: { x: 40, y: 10 },
      activePrompt: null,
      currentMenu: null,
    },
  });
});

const messageMount = documentRoot.getElementById('messages');

const texts = messageMount.children
  .flatMap((row) => row.children || [])
  .filter((node) => node.className === 'ux-consequence-text')
  .map((node) => node.textContent);

assert.equal(messageMount.dataset.uxConsequenceOwned, 'true');
assert.notEqual(messageMount.children[0]?.className, 'ux-consequence-empty', 'must not stay on empty placeholder after messages arrive');
assert.deepEqual(texts, messages.slice().reverse());

const grid = documentRoot._grid;
assert.ok(grid.styleProps['--ux-follow-x'], 'follow mode sets horizontal translation');
assert.ok(grid.styleProps['--ux-follow-y'], 'follow mode sets vertical translation');
const firstFollowX = grid.styleProps['--ux-follow-x'];

controller.update({
  game: {
    messages,
    statusValues,
    cursor: { x: 40, y: 10 },
    activePrompt: null,
    currentMenu: null,
  },
});
assert.equal(grid.styleProps['--ux-follow-x'], firstFollowX);

controller.update({
  game: {
    messages: [...messages, 'You kill the grid bug!'],
    statusValues,
    cursor: { x: 41, y: 10 },
    activePrompt: null,
    currentMenu: null,
  },
});
const afterTexts = messageMount.children
  .flatMap((row) => row.children || [])
  .filter((node) => node.className === 'ux-consequence-text')
  .map((node) => node.textContent);
assert.equal(afterTexts[0], 'You kill the grid bug!');
assert.equal(afterTexts.length, 4);

documentRoot._cursorProxy.offsetLeft = 1400;
controller.update({
  game: {
    messages: [...messages, 'You kill the grid bug!'],
    statusValues,
    cursor: { x: 55, y: 10 },
    activePrompt: null,
    currentMenu: null,
  },
});
assert.notEqual(grid.styleProps['--ux-follow-x'], firstFollowX, 'cursor move recenters follow camera');

const renderer = fs.readFileSync(path.join(srcRoot, 'renderer.js'), 'utf8');
assert.match(renderer, /dirty-map-[\s\S]{0,80}return \['map', 'shell'\]/, 'map effects publish to shell so follow mode can recenter');

console.log(JSON.stringify({
  pass: true,
  first: afterTexts[0],
  count: afterTexts.length,
  followX: grid.styleProps['--ux-follow-x'],
  followY: grid.styleProps['--ux-follow-y'],
}, null, 2));
