const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'renderer.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const interaction = fs.readFileSync(path.join(root, 'src', 'shared', 'interaction-model.js'), 'utf8');
const messageLog = fs.readFileSync(path.join(root, 'src', 'shared', 'message-log.js'), 'utf8');
const realMcp = fs.readFileSync(path.join(root, 'scripts', 'real-context-action-bar-mcp-test.js'), 'utf8');
const realLockedLifecycleMcp = fs.readFileSync(path.join(root, 'scripts', 'real-scenario-locked-container-force-lifecycle-mcp-test.js'), 'utf8');
const shimProtocol = fs.readFileSync(path.join(root, 'src', 'shared', 'shim-protocol.js'), 'utf8');
const gameViewState = fs.readFileSync(path.join(root, 'src', 'shared', 'game-view-state.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'shim-bridge', 'nh-shim-bridge.c'), 'utf8');

const checks = [
  ['contextual action bar exists in gameplay chrome', /id="context-action-bar"/.test(html) && /aria-label="Contextual actions for current position"/.test(html)],
  ['interaction planner builds context actions from immutable Game View facts', /function buildContextActions\(input/.test(interaction) && /interactionDecision\('render-context-actions'\)/.test(js)],
  ['base labels are player-facing, omit the superseded inspect mode, and are not raw command letters', /label: 'Search'/.test(interaction) && /label: 'Wait'/.test(interaction) && !/Inspect \/ look/.test(interaction) && !/>o<|>,<|>>&lt;/.test(html.match(/id="context-action-bar"[\s\S]*?<div id="play-area"/)?.[0] || '')],
  ['current-square plans include pickup terrain engraving and container actions without duplicate loot', /label: 'Pick up'/.test(interaction) && /id: 'eat-ground'/.test(interaction) && /Go down stairs/.test(interaction) && /Go up stairs/.test(interaction) && /Drink from fountain/.test(interaction) && /Offer sacrifice/.test(interaction) && /label: 'Engrave'/.test(interaction) && /id: 'open-container'/.test(interaction) && /id: 'force-container'/.test(interaction) && /id: 'untrap-container'/.test(interaction) && !/id: 'loot', label:/.test(interaction)],
  ['adjacent door and creature plans route GUI-supplied directions while floor containers stay current-square actions', /Open \$\{labelDirection\} door/.test(interaction) && /Close \$\{labelDirection\} door/.test(interaction) && /Chat with \$\{labelDirection\}/.test(interaction) && /commandThenDirection\(action.key, action.direction, action.label\)/.test(js) && /\^\[hjklyubn\.\]\$/.test(js) && !/Open \$\{labelDirection\} container/.test(interaction)],
  ['adjacent containers do not advertise location-invalid open force or untrap actions', !/loot-container-\$\{direction\}/.test(interaction) && !/force-container-\$\{direction\}/.test(interaction) && !/untrap-container-\$\{direction\}/.test(interaction)],
  ['public context heuristics cover stateful doors containers fixtures altars sinks and creatures', /door\.locked/.test(interaction) && /door\.locked/.test(bridge) && /door\.trapped/.test(interaction) && /any_locked_box/.test(bridge) && !/untrap-trap-/.test(interaction) && !/untrap-door-/.test(interaction) && /Drink from sink/.test(interaction) && /Kick sink/.test(interaction) && /Drop for identification/.test(interaction) && /monster\.pet/.test(bridge)],
  ['shim protocol carries foreground and background actionAffordances from bridge through view state', /emit_action_affordances_for_glyph/.test(bridge) && /backgroundActionAffordances/.test(bridge) && /backgroundSemanticName/.test(shimProtocol) && /backgroundActionAffordances/.test(gameViewState) && /backgroundActionAffordances/.test(interaction)],
  ['advanced action stays planned and renderer dispatches it through the existing dialog', /label: 'More \/ advanced…'/.test(interaction) && /if \(action.command === 'more'\)[\s\S]*openActionDialog\(\)/.test(js)],
  ['prompt wrapping remains GUI-first and ground container actions use existing typed dispatch adapters', /then choose a direction/.test(interaction) && /follow-up choices appear here/.test(interaction) && /sendGroundTipContainerAction/.test(js) && /sendGroundForceContainerAction/.test(js) && /sendGroundUntrapContainerAction/.test(js) && /sendPlayableText\(`#\$\{action\.ext\}\\n`\)/.test(js) && /renderDirectionHelper/.test(js) && /renderMenuPanel/.test(js) && /maybeContinueContainerOpenAfterUnlock/.test(js)],
  ['read-only NetHack menus use planner copy and an owned Continue adapter', /Review this information, then choose Continue/.test(interaction) && /read-only-menu-dialog/.test(js) && /label: 'Continue'/.test(js) && /expectedRequestId: requestId/.test(js) && /transactionId/.test(js) && /read-only-menu-continue/.test(js) && /closingReadOnlyMenu/.test(gameViewState) && /\.read-only-menu-contents/.test(css)],
  ['raw direction prompt copy is filtered from player messages', /function isDirectionPrompt/.test(interaction) && /isGenericDirectionPromptMessage/.test(messageLog) && /generic-direction-prompt/.test(messageLog) && /sharedModules\.messageLog\?\.isGenericDirectionPromptMessage/.test(js)],
  ['context bar consumes planner decisions after public Game View changes', /interactionDecision\('render-context-actions'\)/.test(js) && /render-status'[\s\S]*renderContextActionBar\(\)/.test(js) && /maybeShowContextualPrompt[\s\S]*renderContextActionBar\(\)/.test(js)],
  ['automation adapter exposes action-bar visibility and command routing checks', /contextActions: \(\) =>/.test(js) && /clickContextAction\(idOrLabel\)/.test(js)],
  ['real MCP door click uses a real visible door and rejects no-door outcomes', /findDoorPlan/.test(realMcp) && /04-real-adjacent-door-action/.test(realMcp) && /05-after-click-open-real-door/.test(realMcp) && /openDoorClickHasRealDoorOutcome/.test(realMcp) && /You see no door there/.test(realMcp)],
  ['real MCP covers locked-container force button and #force routing', /NH_SHIM_TEST_CONTAINER_CONTEXT_SCENE/.test(realMcp) && /realOnTileContainerShowsForceWhenLocked/.test(realMcp) && /liveForceContainerClickRoutesPoundForce/.test(realMcp) && /01b-after-live-force-locked-container/.test(realMcp) && /09-fixture-force-locked-chest-action/.test(realMcp)],
  ['real MCP covers locked-container reveal lifecycle without stepping off/on and no stale-ground force rejection', /locked-chest-east-unrevealed/.test(realLockedLifecycleMcp) && /open attempt produces visible locked-container guidance/.test(realLockedLifecycleMcp) && /Force lock appears without stepping off\/on/.test(realLockedLifecycleMcp) && /ground\.forceContainer/.test(realLockedLifecycleMcp) && /ground revision changed/.test(realLockedLifecycleMcp)],
  ['real MCP covers food and corpse ground Eat affordances without raw selector leak', /Eat food/.test(realMcp) && /Eat corpse/.test(realMcp) && /eatActionHasNoRawSelectorLeak/.test(realMcp) && /02c-fixture-corpse-eat-action/.test(realMcp)],
  ['real MCP stairs fixture uses explicit go-up/go-down player labels and click routing', /Go down stairs/.test(realMcp) && /Go up stairs/.test(realMcp) && /stairsFixtureClickRoutesDown/.test(realMcp) && /stairsFixtureDoesNotShowWrongDirection/.test(realMcp)],
  ['styles make action bar visually distinct from raw shortcut toolbar', /#context-action-bar/.test(css) && /context-action-button/.test(css) && /primary-context/.test(css)],
  ['game grid row allocation accounts for the action bar recording toolbar and log rows', /grid-template-rows: auto auto auto auto minmax\(0, auto\) minmax\(132px, 1fr\) auto/.test(css)],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'ok' : 'not ok'} - ${name}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error(`${failed} context action bar check(s) failed`);
  process.exit(1);
}
