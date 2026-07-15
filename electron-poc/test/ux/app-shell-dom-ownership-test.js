const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Harness = require('../../scripts/lib/electron-test-harness');

const root = path.resolve(__dirname, '..', '..');
const rendererSource = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const shellSource = fs.readFileSync(path.join(root, 'src', 'ux', 'app-shell.js'), 'utf8');
const outputDir = process.env.NH_SHELL_OWNERSHIP_OUT_DIR || path.join(root, 'test', 'app-shell-dom-ownership');

assert.doesNotMatch(rendererSource, /\b(?:messages|statsPanel)\.(?:textContent|innerHTML|outerHTML|append|appendChild|prepend|replaceChildren|insertAdjacentHTML)\b/, 'renderer has no persistent status/message mount writer');
assert.doesNotMatch(rendererSource, /function\s+renderMessages\b/, 'renderer message presenter is deleted');
assert.doesNotMatch(rendererSource, /function\s+(?:createStatChip|addStatChip|addStatusGroup)\b/, 'renderer status presenter is deleted');
assert.doesNotMatch(shellSource, /\bMutationObserver\b/, 'app-shell does not reclaim mounts with an observer');
assert.doesNotMatch(shellSource, /compatibilityObserver|reclaimCompatibility/, 'app-shell has no compatibility presentation loop');
assert.match(shellSource, /subscribePublicState\?\.\('shell', update\)/, 'app-shell consumes public Game View publication');

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const result = await Harness.withElectronPage({
    root,
    outputDir,
    width: 1360,
    height: 920,
    port: Number(process.env.NH_SHELL_OWNERSHIP_CDP_PORT || 19931),
    env: {
      NH_ELECTRON_TEST_MODE: '1',
      NH_ELECTRON_SHOW: process.env.NH_ELECTRON_SHOW || '1',
      NH_ELECTRON_WINDOW_CONTENT_SIZE: '1',
    },
  }, async (page) => {
    await page.waitForCheckedValue("Boolean(window.__nethackPromptTest && window.NetHackUxRuntime?.runtime?.domain?.('shell')?.state?.().connected)", 15000);
    const proof = await page.evalCheckedValue(`(() => {
      window.__nethackPromptTest.reset();
      document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close('ownership-proof'));
      const runtime = window.NetHackUxRuntime.runtime;
      const statusMount = document.getElementById('stats-panel');
      const messageMount = document.getElementById('messages');
      const writes = { status: 0, messages: 0 };
      const statusReplace = statusMount.replaceChildren.bind(statusMount);
      const messageReplace = messageMount.replaceChildren.bind(messageMount);
      statusMount.replaceChildren = (...children) => { writes.status += 1; return statusReplace(...children); };
      messageMount.replaceChildren = (...children) => { writes.messages += 1; return messageReplace(...children); };

      const current = runtime.latestPublicState()?.snapshot || {};
      const currentGame = current.game || {};
      const values = new Map(currentGame.statusValues || []);
      values.set(0, 'Ownership the Ranger');
      values.set(11, '7');
      values.set(12, '12');
      values.set(18, '17');
      values.set(19, '24');
      const marker = 'R3 ownership publication reached the message mount.';
      const messages = [...(currentGame.messages || []), marker];
      runtime.publishPublicState({
        ...current,
        game: { ...currentGame, statusValues: Array.from(values), messages },
      }, { reason: 'app-shell-dom-ownership-proof' });
      const first = {
        writes: { ...writes },
        statusOwned: statusMount.dataset.uxStatusOwned,
        messagesOwned: messageMount.dataset.uxConsequenceOwned,
        heroCount: Array.from(statusMount.querySelectorAll('.ux-status-chip')).filter((chip) => chip.textContent.includes('Ownership the Ranger')).length,
        markerCount: Array.from(messageMount.querySelectorAll('.ux-consequence-text')).filter((node) => node.textContent === marker).length,
      };

      writes.status = 0;
      writes.messages = 0;
      runtime.publishPublicState({
        ...current,
        game: {
          ...currentGame,
          statusValues: Array.from(values),
          messages,
          activePrompt: { kind: 'direction', query: 'In what direction?' },
        },
      }, { reason: 'app-shell-direction-prompt-proof' });
      const direction = {
        writes: { ...writes },
        promptInMessages: messageMount.textContent.includes('In what direction?'),
        markerCount: Array.from(messageMount.querySelectorAll('.ux-consequence-text')).filter((node) => node.textContent === marker).length,
      };
      return {
        first,
        direction,
        openDialogs: Array.from(document.querySelectorAll('dialog[open]'), (dialog) => dialog.id),
        bodyOverflow: document.body.scrollWidth > document.documentElement.clientWidth,
        statusText: statusMount.innerText,
        messageText: messageMount.innerText,
      };
    })()`);

    assert.deepEqual(proof.first.writes, { status: 1, messages: 1 }, 'one immutable publication writes each mount exactly once');
    assert.equal(proof.first.statusOwned, 'true');
    assert.equal(proof.first.messagesOwned, 'true');
    assert.equal(proof.first.heroCount, 1, 'status publication renders once without duplicate facts');
    assert.equal(proof.first.markerCount, 1, 'message publication renders once without duplicate facts');
    assert.deepEqual(proof.direction.writes, { status: 1, messages: 1 }, 'direction-prompt publication still has one shell render pass per mount');
    assert.equal(proof.direction.promptInMessages, false, 'interaction-only direction prompt is absent from message facts');
    assert.equal(proof.direction.markerCount, 1, 'unchanged message facts do not duplicate');
    assert.deepEqual(proof.openDialogs, [], 'ownership proof has no startup dialog');
    assert.equal(proof.bodyOverflow, false, 'ownership mounts do not clip the viewport horizontally');

    const screenshot = path.join(outputDir, 'app-shell-dom-ownership.png');
    await page.screenshot(screenshot);
    return { proof, screenshot };
  });
  console.log(JSON.stringify(result, null, 2));
  console.log('ok - app-shell exclusively renders immutable public status and message facts once per publication');
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
