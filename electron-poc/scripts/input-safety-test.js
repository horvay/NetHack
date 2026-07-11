const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer.html'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'shim-bridge', 'nh-shim-bridge.c'), 'utf8');

const checks = [
  ['down-stairs quick action sends only >, not a control key', /data-command-key=">"/.test(html) && !/Down stairs[^\n]+data-command-code/.test(html)],
  ['renderer maps Ctrl-D only from explicit Ctrl+D shortcut or kick button', /event\.ctrlKey[\s\S]*'d'[\s\S]*'\\u0004'/.test(js) && /data-command-code="4"/.test(html)],
  ['document key forwarding ignores editable controls but does not let stale button focus trap movement', /function isTextEditingEvent\(event\)/.test(js) && /Non-text controls no longer trap gameplay keys/.test(js) && !/activeButtonOutsideDirectionHelper/.test(js)],
  ['bridge accepts NetHack Ctrl-D kick but keeps narrow control allow-list', /return ch == 4 \|\| ch == 27/.test(bridge) && !/ch >= 1 && ch <= 126/.test(bridge)],
  ['bridge never turns stdin EOF into ESC or Ctrl-D input', /Do not synthesize ESC on EOF/.test(bridge) && /bridge_stdin_closed/.test(bridge) && !/push_key\(27\)[\s\S]*bridge_stdin_closed/.test(bridge)],
  ['bridge logs input queue depth for stale-key diagnosis', /queuedBefore/.test(bridge) && /queuedAfter/.test(bridge)],
  ['bridge bounds menu selector echo buffer to avoid shim state corruption', /selected_len \+ 1 < \(int\) sizeof selected_keys/.test(bridge)],
  ['prompt titles are player-facing, not generic Answer NetHack prompt chrome', !/Answer NetHack prompt/.test(js + html) && /function questionDialogTitle/.test(js) && /function lineInputDialogTitle/.test(js) && /function menuDialogTitle/.test(js)],
  ['common prompt title mappings are present', /Choose direction/.test(js) && /Confirm/.test(js) && /Name item/.test(js) && /Choose item/.test(js) && /Question/.test(js)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'ok' : 'not ok'} - ${name}`);
if (failed.length) {
  console.error(`Input safety checks failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
