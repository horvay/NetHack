const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const LaunchPolicy = require(path.join(root, 'src', 'main', 'launch-policy'));
const html = fs.readFileSync(path.join(root, 'src', 'renderer.html'), 'utf8');
const rendererJs = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
function concatenateSources(directory, extension) {
  return fs.readdirSync(directory)
    .filter((file) => file.endsWith(extension))
    .sort()
    .map((file) => fs.readFileSync(path.join(directory, file), 'utf8'))
    .join('\n');
}
const sharedJs = concatenateSources(path.join(root, 'src', 'shared'), '.js');
const uxJs = concatenateSources(path.join(root, 'src', 'ux'), '.js');
const js = `${rendererJs}\n${uxJs}`;
const allJs = `${js}\n${sharedJs}`;
const css = [
  fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8'),
  concatenateSources(path.join(root, 'src', 'ux', 'styles'), '.css'),
].join('\n');
const settingsJs = fs.readFileSync(path.join(root, 'src', 'ux', 'settings-store.js'), 'utf8');
const quickActionsHtml = html.match(/<div id="quick-actions"[\s\S]*?<\/div>/)?.[0] || '';
const InteractionModel = require(path.join(root, 'src', 'shared', 'interaction-model'));
const ConsequenceFeed = require(path.join(root, 'src', 'ux', 'consequence-feed'));
const directionPlan = InteractionModel.buildPromptInteraction({ kind: 'question', query: 'In what direction?', choices: 'hjklyubn' });
const engravingToolPlan = InteractionModel.buildPromptInteraction({ kind: 'question', query: 'What do you want to write with?', choices: '-?' });
const engravingTextPlan = InteractionModel.buildPromptInteraction({ kind: 'line input', query: 'What do you want to engrave here?', choices: '' });
const confirmationPlan = InteractionModel.buildPromptInteraction({ kind: 'question', query: 'Really quit?', choices: 'ynq' });
const itemClassPlan = InteractionModel.buildPromptInteraction({ kind: 'question', query: 'What type of object?', choices: ')[?' });
const commandHelpPlan = InteractionModel.buildPromptInteraction(
  { kind: 'line input', query: 'What command do you want help with?', choices: '' },
  [],
  { extCommandCatalog: [{ name: 'kick', description: 'Kick a door or object' }] },
);
const ringHandPlan = InteractionModel.buildPromptInteraction({ kind: 'question', query: 'Which ring-finger, Right or Left?', choices: 'lr' });
const consequenceFeed = ConsequenceFeed.createConsequenceFeed({ feedLimit: 100 });
consequenceFeed.syncCanonicalLines(Array.from({ length: 20 }, (_, index) => `Message ${index + 1}`));

const checks = [
  ['compact top actions hide kick behind the command and contextual workflows', !/Kick door \(Ctrl-D\)/.test(quickActionsHtml) && /Use item \/ Actions/.test(quickActionsHtml) && InteractionModel.isLockedDoorMessage('This door is locked.') && /Locked \$\{target\} actions/.test(js) && /Kick door/.test(js)],
  ['command dialog keeps detailed actions out of the compact top chrome', /id="action-dialog"/.test(html) && /id="open-actions"/.test(html) && /id="item-actions"/.test(html) && /id="system-actions"/.test(html) && /function openActionDialog/.test(js) && /uxCommandPalette\.open/.test(js)],
  ['keyboard help documents kicking doors', /Ctrl-D<\/kbd> kick a door\/object/.test(html) || /Ctrl-D.+kick a door\/object/.test(html)],
  ['command summary documents Ctrl-D kick', /Ctrl-D kick door\/object/.test(js)],
  ['Ctrl-D is accepted by playable key validation', /code === 4/.test(js)],
  ['Ctrl-D keyboard shortcut maps to NetHack EOT', /event\.ctrlKey[\s\S]*'d'[\s\S]*'\\u0004'/.test(js)],
  ['modal text input stops bubbling before global forwarding', /interactionText\.addEventListener\('keydown'[\s\S]*event\.stopPropagation\(\)/.test(js)],
  ['document filter input is protected by the global editable-owner guard', /id="document-filter"/.test(html) && /function isTextEditingEvent\(event\)/.test(js) && /\^\(INPUT\|TEXTAREA\|SELECT\)\$/.test(js)],
  ['intro lore is detected by Book/Moloch/Amulet signature instead of generic document chrome', /function isIntroLoreWindow/.test(js) && /Book of \[\^:\\n\]\+/.test(js) && /Moloch/.test(js) && /Amulet of Yendor/.test(js) && /openIntroWindow/.test(js)],
  ['intro prologue modal has no search field and uses the shared Continue vocabulary', /id="intro-dialog"/.test(html) && /id="intro-body"/.test(html) && /id="intro-continue"[^>]*>Continue</.test(html) && !/intro-dialog[\s\S]*Search\/filter/.test(html) && /dialog\.intro-dialog/.test(css) && /intro-frame/.test(css)],
  ['global key forwarder skips editable targets robustly', /function isTextEditingEvent\(event\)/.test(js) && /event\.composedPath\?\.\(\)\.some\(isEditable\)/.test(js)],
  ['active UI input owner blocks document-level map command forwarding', /function hasActiveUiInputOwner\(\)/.test(js) && /interactionDialog\.open/.test(js) && /documentDialog\.open/.test(js) && /activePrompt/.test(js) && /hasActiveUiInputOwner\(\)[\s\S]*return;[\s\S]*handlePlayableKeydown\(event\)/.test(js)],
  ['interaction modal captures arrow enter escape space and tab as UI navigation', /function handleInteractionNavigationKeydown\(event\)/.test(js) && /ArrowUp/.test(js) && /ArrowDown/.test(js) && /event\.stopPropagation\(\)/.test(js) && /event\.key === 'Tab'[\s\S]*return true/.test(js) && /activateFocusedInteractionControl/.test(js) && /cancelActiveInteraction/.test(js)],
  ['interaction modal keyboard navigation owns directional and activation keys', /function focusInteractionChoice/.test(js) && /visibleInteractionChoices/.test(js) && /focusInteractionChoice\(-1\)/.test(js) && /focusInteractionChoice\(1\)/.test(js) && /activateFocusedInteractionControl/.test(js) && /event\.stopPropagation\(\)/.test(js)],
  ['inventory modal uses concise copy and live feedback', /Inventory/.test(js) && /Filter choices/.test(html) && /interaction-feedback/.test(html) && /Filter items/.test(js) && !/Choose visible item rows|advanced selector syntax|Use visible checkboxes/.test(js)],
  ['main layout has no legacy side inventory strip and opens the equipment surface from one compact control', /id="inventory-equipment-button"/.test(html) && !/id="(?:side-panel|inventory-summary|inventory-panel|inventory-pill)"/.test(html) && /createEquipmentScreen|NetHackUxEquipmentScreen/.test(js)],
  ['system action toolbar exposes spell skill option container and shop commands without raw # typing', /id="system-actions"/.test(html) && /data-ext-command="showspells"/.test(html) && /data-ext-command="enhance"/.test(html) && /data-ext-command="options"/.test(html) && /data-ext-command="loot"/.test(html) && /data-ext-command="pay"/.test(html) && /function sendExtendedCommandButton/.test(js) && /sendPlayableText\(`#\$\{command\}\\n`\)/.test(js)],
  ['extended object and special actions have visible buttons instead of raw # catalog as primary path', /data-ext-command="rub"/.test(html) && /data-ext-command="force"/.test(html) && /data-ext-command="jump"/.test(html) && /data-ext-command="ride"/.test(html) && /data-ext-command="turn"/.test(html) && /data-ext-command="monster"/.test(html) && /data-ext-command="whatis"/.test(html) && /data-ext-command="whatdoes"/.test(html) && /data-ext-command="autopickup"/.test(html)],
  ['object action workflows carry a visible breadcrumb into follow-up prompts', /let activeWorkflowContext/.test(js) && /function workflowPromptText/.test(js) && /data-workflow-label/.test(html) && /setWorkflowContextFromButton/.test(js)],
  ['system and transfer menus retain specialized public titles and row rendering', /kind === 'transfer'/.test(allJs) && /Shop payment/.test(allJs) && /Container transfer/.test(allJs) && /container-transfer-panel/.test(html) && /transfer-row/.test(css) && /kind === 'spell'/.test(allJs) && /kind === 'options'/.test(allJs)],
  ['spell skill option and shop rows expose structured visible action metadata', /function renderStructuredMenuOption/.test(js) && /parseSpellMenuText/.test(js) && /parseSkillMenuText/.test(js) && /parseOptionMenuText/.test(js) && /parseTransferMenuText/.test(js) && /row-action-pill/.test(css) && /shopPayment \? 'Pay' : 'Transfer'/.test(js) && /Fail/.test(js) && /Toggle/.test(js)],
  ['inventory special selectors and ring-hand prompts expose public labels', engravingToolPlan.options.some((option) => /bare hands/i.test(option.label)) && ringHandPlan.options.some((option) => option.label === 'Left hand') && ringHandPlan.options.some((option) => option.label === 'Right hand') && engravingToolPlan.options.every((option) => option.className === 'class-choice')],
  ['selector letters render as keycaps not inputs', /selector-keycap/.test(js) && !/type="text"[^>]+selector/.test(html)],
  ['inventory modal exposes confirm and clear actions', /interaction-confirm/.test(html) && /Confirm selection/.test(html) && /interaction-clear/.test(html) && /Clear selection/.test(html)],
  ['Enter confirms typed modal selection and Esc cancels', /event\.key === 'Enter'[\s\S]*sendPlayableText\(`\$\{interactionText\.value\}\\n`\)/.test(js) && /function cancelActiveInteraction/.test(js) && /event\.key === 'Escape'[\s\S]*cancelActiveInteraction\(\)/.test(js)],
  ['menu selection supports count and range parsing', /selectedKeysFromMenuExpression/.test(js) && /function menuSelectionPartsFromExpression/.test(js) && /\\d\*\[A-Za-z\$\]\(\?:-\[A-Za-z\$\]\)\?/.test(js) && /countMatch/.test(js) && /letters\.split\('-'\)/.test(js)],
  ['inventory rows use the current compact 32px interaction floor', /choice-button\.inventory-row/.test(css) && /rpg-inventory-row[\s\S]*min-height: 2rem/.test(css) && /menu-item-main[\s\S]*display:\s*flex/.test(css)],
  ['action inventory prompts reuse inventory rows instead of input-only yn prompts', /isInventoryActionPrompt/.test(js) && /actionInventoryOptions/.test(js) && /action-inventory-row/.test(js) && /cachedInventoryChoices/.test(js)],
  ['engraving-tool prompts become visible item-class choices', engravingToolPlan.title === 'Choose engraving tool' && engravingToolPlan.classification === 'item-class' && engravingToolPlan.options.length > 0],
  ['engraving-text prompts get a purpose-labeled text field', engravingTextPlan.title === 'Enter engraving text' && engravingTextPlan.engravingText === true && /Engraving text/.test(js) && /engraving-text-dialog/.test(js)],
  ['yes/no prompts become labeled confirmation choices', confirmationPlan.classification === 'confirmation' && confirmationPlan.family === 'confirmation' && confirmationPlan.options.some((option) => /quit/i.test(option.label))],
  ['direction prompts have a graphical non-modal direction helper including nh_poskey bridge prompts', /id="direction-helper"/.test(html) && /function renderDirectionHelper/.test(js) && /↖/.test(js) && /↗/.test(js) && /↙/.test(js) && /↘/.test(js) && /#direction-helper/.test(css) && !/dialog\.direction-dialog/.test(css) && /gameGrid\.focus\(\{ preventScroll: true \}\)/.test(js) && /bridge_direction_prompt/.test(allJs) && /bridge_direction_prompt/.test(fs.readFileSync(path.join(root, 'shim-bridge', 'nh-shim-bridge.c'), 'utf8'))],
  ['direction helper occupies log/sidebar space and never narrows the dungeon grid', /<section id="log-panel"[\s\S]*<aside id="direction-helper"[\s\S]*<div id="messages"/.test(html) && html.indexOf('id="direction-helper"') > html.indexOf('id="log-panel"') && html.indexOf('id="direction-helper"') > html.indexOf('</div>\n        <section id="log-panel"') && /body\.direction-helper-active #log-panel/.test(css) && !/body\.direction-helper-active #play-area \{ grid-template-columns: minmax\(0, 1fr\) minmax/.test(css) && !/body\.direction-helper-active #game-grid \{ --map-available-width/.test(css)],
  ['direction helper stays compact without a duplicate cancel widget', !/id="direction-helper-cancel"/.test(html) && !/id="direction-helper-copy"/.test(html) && /#direction-helper \.direction-pad[\s\S]*grid-auto-rows: 2.5rem/.test(css) && /#log-side-rail/.test(css)],
  ['direction prompts use the non-modal helper instead of map-target controls', directionPlan.kind === 'direction' && /if \(promptPlan\.kind === 'direction'\)[\s\S]*renderDirectionHelper\(promptPlan\.prompt, \{ promptActive: true \}\);[\s\S]*return;/.test(js) && !/renderTargetSelectionControlsPanel/.test(js)],
  ['map hover tooltip exists and is driven by delegated grid hover without blocking clicks', /id="map-tooltip"/.test(html) && /role="tooltip"/.test(html) && /gameGrid\.addEventListener\('mousemove', updateMapTooltipFromPointer, \{ passive: true \}\)/.test(js) && /gameGrid\.addEventListener\('mouseleave', hideMapTooltip\)/.test(js) && /pointer-events: none/.test(css)],
  ['map tooltip suppresses basic floor wall darkness and shows meaningful semantics', /basicDungeonGlyphs = new Set\(\[' ', '\\.', '#', '\\|', '-'\]\)/.test(js) && /meaningfulSemanticKinds/.test(js) && /monster/.test(js) && /object/.test(js) && /stairs/.test(js) && /mapTooltipInfoForCell/.test(js)],
  ['map tooltip positions inside viewport and exposes enlarged tile or fallback glyph', /function positionMapTooltip/.test(js) && /window\.innerWidth/.test(js) && /window\.innerHeight/.test(js) && /has-tooltip-tile/.test(js) && /map-tooltip-icon[\s\S]*58px/.test(css)],
  ['unknown object menu and cell text use visible semantic appearance instead of hidden identity', /function menuItemSemanticDisplayName/.test(js) && /semanticKnown === false[\s\S]*semanticAppearance/.test(js) && /menuItemSemanticFilterText\(item\)/.test(js) && /semanticDisplay/.test(js) && /objectLayerDisplay/.test(js)],
  ['direction classification wins before item-class punctuation fallback', directionPlan.classification === 'direction' && InteractionModel.isItemClassPrompt('In what direction?', 'hjklyubn') === false],
  ['intro prologue defers unrelated NetHack prompts instead of stacking modals', /introDialog\.open && gameViewSnapshot\.activePrompt/.test(js) && /Intro is open; NetHack prompt is waiting behind it/.test(js) && /introDialog\.addEventListener\('close'[\s\S]*renderPromptPanel/.test(js)],
  ['item-class prompts produce visible object-class choices', itemClassPlan.classification === 'item-class' && itemClassPlan.title === 'Choose item class' && itemClassPlan.classRows.length === 3 && itemClassPlan.options.every((option) => option.className === 'class-choice')],
  ['extended commands use searchable command catalog', /bridge_extcmd_catalog/.test(allJs) && /Choose an extended command/.test(allJs) && /Filter commands/.test(js)],
  ['action inventory prompts use public copy with visible Confirm and Clear controls', !/Answer NetHack prompt/.test(js) && /confirmText: needsTyping \? 'Confirm selection' : 'Confirm'/.test(js) && /onClear: needsTyping/.test(js) && /interaction-confirm/.test(html) && /interaction-clear/.test(html)],
  ['action-specific menus do not overwrite the broad inventory cache', InteractionModel.shouldCacheInventoryChoices({ kind: 'inventory', prompt: 'Inventory' }) && !InteractionModel.shouldCacheInventoryChoices({ kind: 'inventory', prompt: 'What do you want to drop?' })],
  ['passive ground menus stay passive while explicit pickup uses inventory rows', InteractionModel.shouldSuppressPassiveGroundMenu({ kind: 'inventory', prompt: 'Things that are here' }, 0) && !InteractionModel.shouldSuppressPassiveGroundMenu({ kind: 'inventory', prompt: 'Pick up what?' }, 1) && /openGroundTransferPanelFromSnapshot/.test(js) && /renderInventoryOption/.test(js)],
  ['passive multi-item ground text windows only refresh evidence; explicit pickup remains the sole panel opener', /function isPassiveGroundTextWindow/.test(js) && /function notePassiveGroundTextWindow/.test(js) && /Explicit Pickup or comma remains the sole opener/.test(js) && /documentDialog\.close\('silent'\)/.test(js)],
  ['select_menu binds selection to event window not stale current menu', /const menu = state\.menusByWindow\.get\(event\.window\) \|\| state\.currentMenu/.test(allJs) || /const menu = assignMenuLifecycle\(state\.menusByWindow\.get\(event\.window\) \|\| state\.currentMenu/.test(allJs) || /const menu = menusByWindow\.get\(event\.window\) \|\| currentMenu/.test(js)],
  ['new game modal exposes optional deterministic seed without main-view clutter', /id="game-seed"/.test(html) && /placeholder="random"/.test(html) && /selectedSeed/.test(js) && !/id="game-seed"[\s\S]*<main>/.test(html)],
  ['new game seed help is scoped to the seed field, not a loose overlapping paragraph', /class="seed-field"[\s\S]*id="game-seed"[\s\S]*<span id="seed-help" class="field-help">/.test(html) && !/<p id="seed-help"/.test(html)],
  ['new game modal uses bounded columns and responsive spans for seed/recording controls', /grid-template-columns: repeat\(4, minmax\(138px, 1fr\)\)/.test(css) && /\.character-grid \.seed-field \{ grid-column: span 2; \}/.test(css) && /\.character-grid \.checkbox-row \{ grid-column: span 1;/.test(css) && /max-width: 760px[\s\S]*\.character-grid \.seed-field \{ grid-column: 1 \/ -1; \}/.test(css)],
  ['input recording affordance and artifact save path are wired', /id="record-inputs"/.test(html) && /id="recording-toolbar"/.test(html) && /id="record-checkpoint-primary"/.test(html) && /id="save-recording-primary"/.test(html) && /id="save-recording"/.test(html) && /startInputRecording/.test(js) && /recordCheckpointPrimaryButton/.test(js) && /recordingToolbar\.hidden = !isRecording/.test(js) && /saveActiveRecording/.test(js) && /saveRecording/.test(js)],
  ['message feed retains more than eight events while the viewport controls visible height', consequenceFeed.recent().length === 20 && consequenceFeed.feedLimit === 100 && /updateMessageScrollPosition/.test(js) && /overflow-y: auto/.test(css)],
  ['line-input prompts expose the shared visible Confirm affordance', /confirmText: commandRows\.length \? 'Submit command' : 'Confirm'/.test(js) && /onConfirm: classRows\.length && smallClassSet \? null/.test(js)],
  ['free-text prompts show recent context without blurring the legacy interaction backdrop', /id="interaction-context"/.test(html) && /function recentPromptContextLines/.test(js) && /contextLines: recentPromptContextLines\(promptPlan\.prompt\)/.test(js) && /Wish granted — type your wish/.test(allJs) && /#interaction-dialog::backdrop[\s\S]*backdrop-filter: none/.test(css)],
  ['whatdoes help becomes a searchable visible command-topic picker', commandHelpPlan.classification === 'command-help' && commandHelpPlan.title === 'Choose command help topic' && commandHelpPlan.options.some((option) => option.className === 'command-help-choice') && /Search command help topics/.test(js)],
  ['unexplored full-map rock is visually subdued', /tile-cell\.terrain-rock[\s\S]*rgba\(92, 86, 74, 0\.045\)/.test(css)],
  ['runtime status copy is player-facing, not bridge jargon', /updating dungeon map/.test(allJs) && /setStatus\('Ready\.'\)/.test(js) && !/reading NetHack message|shim bridge rendering map glyphs|shim bridge receiving NetHack text/.test(allJs)],
  ['settings dialog exposes persisted display, gameplay, prompt, key-hint, and eight-line log defaults', /id="setting-hud-density"/.test(html) && /id="setting-map-mode"/.test(html) && /id="setting-close-rows"/.test(html) && /id="setting-log-ratio"/.test(html) && /id="setting-log-default"/.test(html) && /id="setting-autopickup"/.test(html) && /id="setting-movement"/.test(html) && /id="setting-contextual-prompts"/.test(html) && /id="setting-key-hints"/.test(html) && /contextualPrompts: 'full'/.test(settingsJs) && /autopickup: 'gold'/.test(settingsJs) && /movement: 'classic'/.test(settingsJs) && /mode: 'close', closeRows: 9/.test(settingsJs) && /layout: Object\.freeze\(\{ logRatio: null \}\)/.test(settingsJs) && /schemaVersion\s*=\s*5/.test(settingsJs) && /buildNethackOptions/.test(js)],
  ['game-over modal has gravestone, final stats, and only New game/Exit actions', /id="game-over-dialog"/.test(html) && /class="gravestone"/.test(html) && /id="game-over-summary"/.test(html) && /id="game-over-sections"/.test(html) && /id="game-over-new"[^>]*>New game/.test(html) && /id="game-over-exit"[^>]*>Exit/.test(html) && /function isGameOverDisclosurePrompt/.test(js) && /autoAnswered/.test(js) && /disclose:\+i \+a \+v \+g \+c \+o/.test(js) && /gameOverDialog\.addEventListener\('cancel'[\s\S]*preventDefault/.test(js) && /\.game-over-dialog/.test(css)],
  ['launch policy allowlists GUI NetHack options before setting NETHACKOPTIONS', LaunchPolicy.normalizeNetHackOptions('autopickup,pickup_types:$,number_pad:1,disclose:+i +a +v +g +c +o,bad') === '!tutorial,autopickup,pickup_types:$,number_pad:1,disclose:+i +a +v +g +c +o' && LaunchPolicy.shimLaunchConfig({ options: { nethackOptions: 'pickup_types:$,bad' }, env: {} }).env.NETHACKOPTIONS === '!tutorial,pickup_types:$'],
  ['locked-door context detects the message and exposes kick and search recovery', InteractionModel.isLockedDoorMessage('This door is locked.') && /Locked (?:door|\$\{target\}) actions/.test(allJs) && /Kick door/.test(allJs) && /Search nearby/.test(allJs) && /activeContextualPrompt/.test(js)],
  ['prompt cancellation follows the typed cancellation plan and closes stale UI', confirmationPlan.cancellation.key === 'q' && confirmationPlan.cancellation.canonicalChoice === true && directionPlan.cancellation.key === '\u001b' && /function sendActivePromptCancellation/.test(js) && /closeInteractionDialog\(\{ force: true \}\)/.test(js)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'ok' : 'not ok'} - ${name}`);
if (failed.length) {
  console.error(`UI regression checks failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
