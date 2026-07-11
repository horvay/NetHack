const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'renderer.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const realMcp = fs.readFileSync(path.join(root, 'scripts', 'real-context-action-bar-mcp-test.js'), 'utf8');
const realLockedLifecycleMcp = fs.readFileSync(path.join(root, 'scripts', 'real-scenario-locked-container-force-lifecycle-mcp-test.js'), 'utf8');
const shimProtocol = fs.readFileSync(path.join(root, 'src', 'shared', 'shim-protocol.js'), 'utf8');
const gameViewState = fs.readFileSync(path.join(root, 'src', 'shared', 'game-view-state.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'shim-bridge', 'nh-shim-bridge.c'), 'utf8');

const checks = [
  ['contextual action bar exists in gameplay chrome', /id="context-action-bar"/.test(html) && /aria-label="Contextual actions for current position"/.test(html)],
  ['renderer builds context actions from current map/status/menu context', /function buildContextActions\(\)/.test(js) && /hasKnownGroundItemsHere/.test(js) && /terrainAtPlayerMatches/.test(js)],
  ['base labels are player-facing and not raw command letters', /label: 'Search'/.test(js) && /label: 'Wait'/.test(js) && /label: 'Inspect \/ look'/.test(js) && !/>o<|>,<|>>&lt;/.test(html.match(/id="context-action-bar"[\s\S]*?<div id="play-area"/)?.[0] || '')],
  ['current-square contextual labels include pickup eat stairs fountain altar engraving semantic open-box force untrap without duplicate loot', /label: 'Pick up'/.test(js) && /label: edibleGround\.label/.test(js) && /id: 'eat-ground'/.test(js) && /currentStairDirection/.test(js) && /label: 'Go down stairs'/.test(js) && /label: 'Go up stairs'/.test(js) && /\\bladder\\b/.test(js) && /Drink from fountain/.test(js) && /Offer sacrifice/.test(js) && /label: 'Engrave'/.test(js) && /id: 'open-container', label: currentGroundContainerActionLabel\(\), command: 'ext', ext: 'loot'/.test(js) && /Open box/.test(js) && /Open chest/.test(js) && /id: 'force-container', label: 'Force lock'/.test(js) && /id: 'untrap-container', label: 'Untrap'/.test(js) && !/id: 'loot', label: 'Loot'/.test(js) && !/Open container'\s*,\s*command: 'direction'/.test(js) && !/id: 'open-container'[\s\S]{0,120}direction: '\\.'/.test(js)],
  ['adjacent door/pet actions route GUI-supplied directions internally while containers open through typed snapshots', /Open \$\{labelDirection\} door/.test(js) && /Close \$\{labelDirection\} door/.test(js) && /Chat with \$\{labelDirection\}/.test(js) && /commandThenDirection\(action.key, action.direction, action.label\)/.test(js) && /\^\[hjklyubn\.\]\$/.test(js) && /Floor containers are semantic container targets/.test(js) && /typed container\.snapshot/.test(js)],
  ['adjacent containers do not advertise invalid location-sensitive loot/open/force/untrap actions', /Floor container actions operate on containers at the hero/.test(js) && !/loot-container-\$\{direction\}/.test(js) && !/Open \$\{labelDirection\} container/.test(js) && !/force-container-\$\{direction\}/.test(js) && !/untrap-container-\$\{direction\}/.test(js)],
  ['safe heuristic slice covers stateful doors containers fixtures altars sinks and monsters without relying on hidden container state tokens or trap/door untrap variants in public output', /door\.locked/.test(js) && /door\.locked/.test(bridge) && /door\.trapped/.test(js) && /any_locked_box/.test(bridge) && !/Untrap .* trap/.test(js) && !/untrap-door-/.test(js) && /Kick sink/.test(js) && !/Drink from sink/.test(js) && /Drop for identification/.test(js) && /monster\.pet/.test(bridge)],
  ['shim protocol carries foreground and background actionAffordances from bridge through view state', /emit_action_affordances_for_glyph/.test(bridge) && /backgroundActionAffordances/.test(bridge) && /backgroundSemanticName/.test(shimProtocol) && /backgroundActionAffordances/.test(gameViewState) && /backgroundActionAffordances/.test(js)],
  ['advanced fallback opens existing GUI action dialog', /label: 'More \/ advanced…'/.test(js) && /if \(action.command === 'more'\)[\s\S]*openActionDialog\(\)/.test(js)],
  ['prompt wrapping remains GUI-first for context actions, ground container #tip/#force/#untrap use v2 action envelopes, and successful container unlock continues through direct snapshot without stale continuation state', /direction is sent by the GUI/.test(js) && /wraps follow-up prompts in GUI controls/.test(js) && /sendGroundTipContainerAction/.test(js) && /sendGroundForceContainerAction/.test(js) && /sendGroundUntrapContainerAction/.test(js) && /sendPlayableText\(`#\$\{action\.ext\}\\n`\)/.test(js) && /renderDirectionHelper/.test(js) && /renderMenuPanel/.test(js) && /maybeContinueContainerOpenAfterUnlock/.test(js) && /sendGroundOpenContainerAction\(request\.action/.test(js) && /clearContainerUnlockContinuation/.test(js) && /pendingContainerUnlockOpen = null/.test(js)],
  ['read-only NetHack menus render as a modal with Continue instead of top-strip diagnostic chips', /activePrompt\.kind === 'read-only menu'[\s\S]*promptPanel\.hidden = true/.test(js) && /function readOnlyMenuPanelControls/.test(js) && /read-only-menu-dialog/.test(js) && /Review this information, then choose Continue/.test(js) && /label: 'Continue'/.test(js) && /sendPlayableText\(' '\)/.test(js) && /cancelingReadOnlyMenu/.test(js) && /closingReadOnlyMenu/.test(gameViewState) && /information menu open/.test(gameViewState) && /\.read-only-menu-contents/.test(css)],
  ['raw direction prompt copy is filtered from the player log', /what\\s\+direction/.test(js) && /isGenericDirectionPromptMessage\(normalized\)\) \{[\s\S]*?return false/.test(js)],
  ['context bar rerenders after map status menu message and running-state changes', /renderContextActionBar\(\);[\s\S]*function makeEmptyMap/.test(js) && /renderContextActionBar\(\);[\s\S]*function scheduleMapRender/.test(js) && /render-status'[\s\S]*renderContextActionBar\(\)/.test(js) && /maybeShowContextualPrompt[\s\S]*renderContextActionBar\(\)/.test(js)],
  ['automation adapter exposes action-bar visibility and command routing checks', /contextActions: \(\) =>/.test(js) && /clickContextAction\(idOrLabel\)/.test(js)],
  ['real MCP door click uses a real visible door and rejects no-door outcomes', /findDoorPlan/.test(realMcp) && /04-real-adjacent-door-action/.test(realMcp) && /05-after-click-open-real-door/.test(realMcp) && /openDoorClickHasRealDoorOutcome/.test(realMcp) && /You see no door there/.test(realMcp)],
  ['real MCP covers locked-container force button and #force routing', /NH_SHIM_TEST_CONTAINER_CONTEXT_SCENE/.test(realMcp) && /realOnTileContainerShowsForceWhenLocked/.test(realMcp) && /liveForceContainerClickRoutesPoundForce/.test(realMcp) && /01b-after-live-force-locked-container/.test(realMcp) && /09-fixture-force-locked-chest-action/.test(realMcp)],
  ['real MCP covers locked-container reveal lifecycle without stepping off/on and no stale-ground force rejection', /locked-chest-east-unrevealed/.test(realLockedLifecycleMcp) && /initial current-square context exposed Open chest but not Force lock/.test(realLockedLifecycleMcp) && /Force lock appears without stepping off\/on/.test(realLockedLifecycleMcp) && /ground\.forceContainer/.test(realLockedLifecycleMcp) && /ground revision changed/.test(realLockedLifecycleMcp)],
  ['real MCP covers food and corpse ground Eat affordances without raw selector leak', /Eat food/.test(realMcp) && /Eat corpse/.test(realMcp) && /eatActionHasNoRawSelectorLeak/.test(realMcp) && /02c-fixture-corpse-eat-action/.test(realMcp)],
  ['real MCP stairs fixture uses explicit go-up/go-down player labels and click routing', /Go down stairs/.test(realMcp) && /Go up stairs/.test(realMcp) && /stairsFixtureClickRoutesDown/.test(realMcp) && /stairsFixtureDoesNotShowWrongDirection/.test(realMcp)],
  ['styles make action bar visually distinct from raw shortcut toolbar', /#context-action-bar/.test(css) && /context-action-button/.test(css) && /primary-context/.test(css)],
  ['game grid row allocation accounts for the action bar, recording toolbar, and log rows', /grid-template-rows: auto auto auto auto minmax\(0, auto\) minmax\(132px, 1fr\) auto/.test(css)],
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
