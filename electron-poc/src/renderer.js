const term = new Terminal({
  cols: 100,
  rows: 30,
  cursorBlink: true,
  convertEol: true,
  theme: { background: '#101014', foreground: '#e7e7e7' },
});
term.open(document.getElementById('terminal'));
term.writeln('Terminal bridge ready. Click "Start NetHack TTY" to launch.');

const output = document.getElementById('output');
const shimOutput = document.getElementById('shim-output');
const gameGrid = document.getElementById('game-grid');
const containerTransferPanel = document.getElementById('container-transfer-panel');
if (containerTransferPanel && containerTransferPanel.parentElement !== document.body) {
  document.body.appendChild(containerTransferPanel);
}
const mapTooltip = document.getElementById('map-tooltip');
const mapTooltipIcon = document.getElementById('map-tooltip-icon');
const mapTooltipTitle = document.getElementById('map-tooltip-title');
const mapTooltipDescription = document.getElementById('map-tooltip-description');
const mapTooltipContents = document.getElementById('map-tooltip-contents');
const directionHelper = document.getElementById('direction-helper');
const directionHelperTitle = document.getElementById('direction-helper-title');
const directionHelperOptions = document.getElementById('direction-helper-options');
const statusLines = document.getElementById('status-lines');
const status = document.getElementById('status');
const paths = document.getElementById('paths');
const statsPanel = document.getElementById('stats-panel');
const contextStrip = document.getElementById('context-strip');
const promptPanel = document.getElementById('prompt-panel');
const menuPanel = document.getElementById('menu-panel');
const documentDialog = document.getElementById('document-dialog');
const documentTitle = document.getElementById('document-title');
const documentFilter = document.getElementById('document-filter');
const documentBody = document.getElementById('document-body');
const documentClose = document.getElementById('document-close');
const startupChoiceDialog = document.getElementById('startup-choice-dialog');
const startupChoiceSummary = document.getElementById('startup-choice-summary');
const startupContinueCard = document.getElementById('startup-continue-card');
const startupContinueTitle = document.getElementById('startup-continue-title');
const startupContinueDetail = document.getElementById('startup-continue-detail');
const startupContinueGame = document.getElementById('startup-continue-game');
const startupNewGame = document.getElementById('startup-new-game');
const introDialog = document.getElementById('intro-dialog');
const introTitle = document.getElementById('intro-title');
const introBody = document.getElementById('intro-body');
const introContinue = document.getElementById('intro-continue');
const commandHelp = document.getElementById('command-help');
const characterDialog = document.getElementById('character-dialog');
const characterForm = document.getElementById('character-form');
const interactionDialog = document.getElementById('interaction-dialog');
const interactionTitle = document.getElementById('interaction-title');
const interactionPrompt = document.getElementById('interaction-prompt');
const interactionContext = document.getElementById('interaction-context');
const interactionOptions = document.getElementById('interaction-options');
const interactionTextRow = document.getElementById('interaction-text-row');
const interactionTextLabel = document.getElementById('interaction-text-label');
const interactionText = document.getElementById('interaction-text');
const interactionFeedback = document.getElementById('interaction-feedback');
const interactionPanelControls = document.getElementById('interaction-panel-controls');
const interactionSelectAll = document.getElementById('interaction-select-all');
const interactionClear = document.getElementById('interaction-clear');
const interactionRefresh = document.getElementById('interaction-refresh');
const interactionConfirm = document.getElementById('interaction-confirm');
const interactionCancel = document.getElementById('interaction-cancel');
const gameOverDialog = document.getElementById('game-over-dialog');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverCause = document.getElementById('game-over-cause');
const gameOverStoneName = document.getElementById('game-over-stone-name');
const gameOverStoneCause = document.getElementById('game-over-stone-cause');
const gameOverStoneScore = document.getElementById('game-over-stone-score');
const gameOverSummary = document.getElementById('game-over-summary');
const gameOverSections = document.getElementById('game-over-sections');
const gameOverNew = document.getElementById('game-over-new');
const gameOverExit = document.getElementById('game-over-exit');
const actionDialog = document.getElementById('action-dialog');
const openActionsButton = document.getElementById('open-actions');
const actionDialogClose = document.getElementById('action-dialog-close');
const settingsDialog = document.getElementById('settings-dialog');
const settingsForm = document.getElementById('settings-form');
const settingContextualMenus = document.getElementById('setting-contextual-menus');
const settingAutoLootGold = document.getElementById('setting-auto-loot-gold');
const settingMotion = document.getElementById('setting-motion');
const itemActions = document.getElementById('item-actions');
const systemActions = document.getElementById('system-actions');
const repeatActions = document.getElementById('repeat-actions');
const repeatCountInput = document.getElementById('repeat-count');

const modalOverlayDialogs = [startupChoiceDialog, interactionDialog, documentDialog, introDialog, characterDialog, actionDialog, settingsDialog, gameOverDialog].filter(Boolean);
const overlayLayerOpenOrder = new WeakMap();
let overlayLayerSequence = 0;
let modalOverlayLayoutLockActive = false;
let contextStripVisibleBeforeOverlay = false;
function overlayLayerIsOpen(element) {
  if (!element) return false;
  return element.tagName === 'DIALOG' ? Boolean(element.open) : !element.hidden;
}
function noteOverlayLayerState(element) {
  if (overlayLayerIsOpen(element) && !overlayLayerOpenOrder.has(element)) overlayLayerOpenOrder.set(element, ++overlayLayerSequence);
  if (!overlayLayerIsOpen(element)) overlayLayerOpenOrder.delete(element);
}
function contextStripHasVisibleContent() {
  return Boolean((promptPanel && !promptPanel.hidden) || (menuPanel && !menuPanel.hidden));
}
function updateModalOverlayLayoutLock() {
  const dialogOpen = modalOverlayDialogs.some((dialog) => Boolean(dialog?.open));
  const transferPanelOpen = Boolean(containerTransferPanel && !containerTransferPanel.hidden);
  const active = dialogOpen || transferPanelOpen;
  if (active && !modalOverlayLayoutLockActive) contextStripVisibleBeforeOverlay = document.body.classList.contains('context-strip-visible');
  modalOverlayLayoutLockActive = active;
  document.body.classList.toggle('modal-overlay-active', active);
  document.body.classList.toggle('context-strip-visible', active ? contextStripVisibleBeforeOverlay : contextStripHasVisibleContent());
  if (!active) contextStripVisibleBeforeOverlay = false;
  if (contextStrip) {
    if (active) contextStrip.setAttribute('aria-hidden', 'true');
    else contextStrip.removeAttribute('aria-hidden');
  }
}
const modalOverlayObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => noteOverlayLayerState(mutation.target));
  updateModalOverlayLayoutLock();
});
for (const dialog of modalOverlayDialogs) {
  noteOverlayLayerState(dialog);
  modalOverlayObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
}
if (containerTransferPanel) {
  noteOverlayLayerState(containerTransferPanel);
  modalOverlayObserver.observe(containerTransferPanel, { attributes: true, attributeFilter: ['hidden'] });
}
if (promptPanel) modalOverlayObserver.observe(promptPanel, { attributes: true, attributeFilter: ['hidden'] });
if (menuPanel) modalOverlayObserver.observe(menuPanel, { attributes: true, attributeFilter: ['hidden'] });
updateModalOverlayLayoutLock();
const movementActions = document.getElementById('movement-actions');
const contextActionBar = document.getElementById('context-action-bar');
const recordingToolbar = document.getElementById('recording-toolbar');
const recordingToolbarStatus = document.getElementById('recording-toolbar-status');
const recordCheckpointButton = document.getElementById('record-checkpoint');
const recordCheckpointPrimaryButton = document.getElementById('record-checkpoint-primary');
const saveRecordingPrimaryButton = document.getElementById('save-recording-primary');
const isBrowserPreview = !window.netHackPOC;
const netHackAPI = window.netHackPOC || {
  info: async () => ({ repoRoot: 'browser preview', nethackBin: 'unavailable', shimBridgeBin: 'unavailable' }),
  runVersion: async () => ({ ok: false, output: 'Electron preload API unavailable; browser preview mode.\n' }),
  startGame: async () => ({ ok: false }),
  startShimBridge: async () => ({ ok: false }),
  startupRecoveryState: async () => ({ ok: true, hasContinue: false, candidates: [] }),
  prepareContinueGame: async () => ({ ok: false, message: 'preview mode' }),
  shimKey: () => {},
  shimInput: () => {},
  uiCommand: () => {},
  stop: () => {},
  saveRecording: async () => ({ ok: false, message: 'preview mode' }),
  input: () => {},
  onData: () => () => {},
  onExit: () => () => {},
  onShimEvent: () => () => {},
  onState: () => () => {},
  diagnosticEvent: async () => ({ ok: false }),
  activeDiagnosticRun: async () => ({ ok: true, diagnostic: null }),
};
function diagnosticEvent(category, type, payload = {}, extra = {}) {
  try {
    return netHackAPI.diagnosticEvent?.({ layer: 'renderer', category, type, payload, ...extra });
  } catch (_error) {
    return null;
  }
}
const sharedModules = Object.freeze({
  moduleSystem: window.NetHackModuleSystem,
  publicItemKnowledge: window.NetHackPublicItemKnowledge,
  commandGateway: window.NetHackCommandGateway,
  messageLog: window.NetHackMessageLog,
  tileAssets: window.NetHackTileAssets,
  characterOptions: window.NetHackCharacterOptions,
  interactionModel: window.NetHackInteractionModel,
  inventoryActionService: window.NetHackInventoryActionService,
  uxEquipmentScreen: window.NetHackUxEquipmentScreen,
  mapPresentation: window.NetHackMapPresentation,
  shimProtocol: window.NetHackShimProtocol,
  uiProtocolV2: window.NetHackUiProtocolV2,
  menuMetadataAdapter: window.NetHackMenuMetadataAdapter,
  inventorySnapshotAdapter: window.NetHackInventorySnapshotAdapter,
  equipmentSnapshotAdapter: window.NetHackEquipmentSnapshotAdapter,
  groundPileSnapshotAdapter: window.NetHackGroundPileSnapshotAdapter,
  containerContentsSnapshotAdapter: window.NetHackContainerContentsSnapshotAdapter,
  commandTransactionModel: window.NetHackCommandTransactionModel,
  transferTransactionModel: window.NetHackTransferTransactionModel,
  transferSession: window.NetHackTransferSession,
  gameViewState: window.NetHackGameViewState,
  recordingSchema: window.NetHackRecordingSchema,
  statusHud: window.NetHackStatusHud,
  uxRuntime: window.NetHackUxRuntime,
  uxSettingsStore: window.NetHackUxSettingsStore,
  uxAppMounts: window.NetHackUxAppMounts,
  uxFocusLayer: window.NetHackUxFocusLayer,
  uxDialogShell: window.NetHackUxDialogShell,
  uxPlayerNotice: window.NetHackUxPlayerNotice,
  uxFailurePresentation: window.NetHackUxFailurePresentation,
  uxCommandCatalog: window.NetHackUxCommandCatalog,
  uxCommandPalette: window.NetHackUxCommandPalette,
  uxHelpCenter: window.NetHackUxHelpCenter,
  uxOnboarding: window.NetHackUxOnboarding,
  uxCharacterCreation: window.NetHackUxCharacterCreation,
});
const transferSession = sharedModules.transferSession.createTransferSession({
  idPrefix: 'renderer-transfer-session',
});
const uxRuntime = sharedModules.uxRuntime?.runtime;
const itemEquipmentOwner = sharedModules.uxEquipmentScreen?.controller;
uxRuntime?.setDiagnosticSink?.((entry) => diagnosticEvent('ux-runtime', entry.type, entry.detail || {}));
const uxMountInspection = sharedModules.uxAppMounts?.inspectMounts?.(document) || [];
for (const mount of uxMountInspection) {
  if (!mount.present) diagnosticEvent('ux-runtime', 'mount.missing', mount);
}
const uxInteractionDomain = uxRuntime?.registerDomain?.('interaction', Object.freeze({
  version: 'nethack-ux-interaction-controller/v1',
  noticeContract: sharedModules.uxPlayerNotice?.version || '',
  dialogContract: sharedModules.uxDialogShell?.version || '',
  focusContract: sharedModules.uxFocusLayer?.version || '',
  failureContract: sharedModules.uxFailurePresentation?.version || '',
}));
const uxNoticeService = sharedModules.uxPlayerNotice?.createNoticeService?.({
  mount: sharedModules.uxAppMounts?.lookupMount?.('playerNotice', document),
  documentRoot: document,
  onDiagnostic: (entry) => diagnosticEvent('interaction', entry.type, entry.detail || {}),
});
const uxFocusLayer = sharedModules.uxFocusLayer?.createFocusLayer?.({
  documentRoot: document,
  fallbackFocus: () => gameGrid,
  onDiagnostic: (entry) => diagnosticEvent('focus', entry.type, entry.detail || {}),
});
const uxDialogService = Object.freeze({
  version: sharedModules.uxDialogShell?.version || 'unavailable',
  normalize: sharedModules.uxDialogShell?.normalizeDialogSpec,
  apply: sharedModules.uxDialogShell?.applyDialogSpec,
  focus: uxFocusLayer,
});
if (uxInteractionDomain && uxNoticeService) uxRuntime?.installService?.('notice', 'interaction', uxNoticeService);
if (uxInteractionDomain) uxRuntime?.installService?.('dialog', 'interaction', uxDialogService);

function applyFixedDialogContract(dialog, input) {
  if (!dialog || !sharedModules.uxDialogShell?.applyDialogSpec) return null;
  const titleElement = input.titleElement || dialog.querySelector('h1, h2, h3');
  const descriptionElement = input.descriptionElement || dialog.querySelector('.modal-copy, .startup-choice-summary, .game-over-escape-note');
  return sharedModules.uxDialogShell.applyDialogSpec({
    dialog,
    titleElement,
    descriptionElement,
    optionsElement: input.optionsElement || null,
    choices: input.choices || [],
    spec: {
      id: input.id || dialog.id,
      family: input.family,
      title: titleElement?.textContent || input.title || 'NetHack dialog',
      description: descriptionElement?.textContent || '',
      initialFocus: input.initialFocus || 'first-action',
      returnFocus: input.returnFocus || 'invoker',
      escapePolicy: input.escapePolicy || input.closeKind || 'cancel',
      closeKind: input.closeKind || 'cancel',
      secondaryActions: [],
    },
  });
}

const fixedDialogContracts = new Map([
  [startupChoiceDialog, { id: 'startup-choice', family: 'confirmation', closeKind: 'blocked', escapePolicy: 'blocked', initialFocus: () => startupRecoveryState?.hasContinue ? startupContinueGame : startupNewGame, returnFocus: () => document.getElementById('start-shim') }],
  [actionDialog, { id: 'actions', family: 'command', closeKind: 'close', initialFocus: () => itemActions?.querySelector('button'), returnFocus: 'invoker' }],
  [settingsDialog, { id: 'settings', family: 'form', closeKind: 'cancel', initialFocus: () => settingContextualMenus, returnFocus: 'invoker' }],
  [characterDialog, { id: 'character', family: 'form', closeKind: 'cancel', initialFocus: () => document.getElementById('player-name'), returnFocus: 'invoker' }],
  [documentDialog, { id: 'document', family: 'document', closeKind: 'close', initialFocus: () => documentFilter || documentTitle, returnFocus: 'invoker', descriptionElement: document.getElementById('document-description') }],
  [introDialog, { id: 'intro', family: 'document', closeKind: 'continue', escapePolicy: 'continue', initialFocus: () => introTitle, returnFocus: 'invoker' }],
  [gameOverDialog, { id: 'game-over', family: 'confirmation', closeKind: 'blocked', escapePolicy: 'blocked', initialFocus: () => gameOverNew, returnFocus: () => document.getElementById('start-shim') }],
]);
for (const [dialog, config] of fixedDialogContracts) {
  applyFixedDialogContract(dialog, config);
  uxFocusLayer?.register?.(dialog, () => ({ ...config, element: dialog, domain: 'interaction' }));
}
uxFocusLayer?.register?.(interactionDialog, () => ({
  id: 'interaction',
  domain: 'interaction',
  initialFocus: () => {
    if (interactionDialog.dataset.dialogFamily === 'confirmation') {
      return interactionOptions.querySelector('.decline-choice, .safe-choice, [data-key="n"], [data-key="\u001b"]') || interactionCancel;
    }
    if (!interactionTextRow.hidden) return interactionText;
    return visibleInteractionChoices()[0] || interactionCancel;
  },
  returnFocus: 'invoker',
  domainFallback: () => gameGrid,
  escapePolicy: interactionDialog.dataset.escapePolicy || 'cancel',
  focusDelayMs: interactionDialog.dataset.dialogFamily === 'confirmation' ? 0 : 160,
}));
uxFocusLayer?.register?.(containerTransferPanel, () => ({
  id: transferPresentation?.sessionKind === 'ground-pickup' ? 'ground-transfer' : 'container-transfer',
  domain: 'transfer',
  initialFocus: () => containerTransferPanel.querySelector('.container-item-row') || containerTransferPanel.querySelector('.container-transfer-heading button'),
  returnFocus: 'invoker',
  domainFallback: () => gameGrid,
  escapePolicy: 'close',
  focusDelayMs: 160,
}));
document.addEventListener('keydown', (event) => uxFocusLayer?.handleKeydown?.(event), true);

let focusMode = 'game';
let pendingConfirmedSaveAction = null;
let noticeRunGeneration = 0;
let actionableFailureHoldUntil = 0;
let actionableFailureNotice = null;
let pendingDocumentReturnFocus = null;
let movementMode = 'walk';
let compassRunArmed = false;
const maxShimLines = 400;
const mapWidth = 80;
const mapHeight = 21;
let gameView = sharedModules.gameViewState.createGameViewState({ mapWidth, mapHeight });
let gameViewSnapshot = gameView.snapshot();
let lastRenderedGameViewMapRevision = gameViewSnapshot.mapRevision;
function refreshGameViewSnapshot() {
  const next = gameView.snapshot();
  if (next.mapRevision !== lastRenderedGameViewMapRevision) publicTerrainLabelsDirty = true;
  lastRenderedGameViewMapRevision = next.mapRevision;
  gameViewSnapshot = next;
  return next;
}
function publishRendererGameViewEvent(event) {
  const result = gameView.process(event);
  refreshGameViewSnapshot();
  return result;
}
let shimEventCount = 0;
let shimLines = [];
let publicGroundPileShimEvidence = [];
let suppressInventoryLazyLoadUntil = 0;
let suppressedInventoryOverviewUntil = 0;
let pendingShimEvents = [];
let shimFlushScheduled = false;
const seenShimEventNames = new Set();
let tileManifest = { assets: [] };
let tileMapConfig = { defaults: {}, char: {}, glyphNumber: {} };
let tileAssetsById = new Map();
let projectInfo;
let runningState = { running: false };
let lastSentKey = { key: undefined, at: 0 };
let pendingPromptCancellation = null;
let lastPromptCancellationAcknowledgement = null;
let testPromptCancellationDiagnostics = [];
let omitNextPromptCancellationOwnershipForTest = false;
const cancellationAnswerTransports = new Set(['bridge_prompt_answer', 'bridge_line_answer', 'bridge_menu_answer', 'bridge_extcmd_answer']);
let documentWindow = null;
let introWindow = null;
let introLoreShown = false;
let inventoryLazyLoad = null;
let lastInventoryActionQuery = '';
let lastInventoryOverviewRequestAt = 0;
let canceledInventoryLazyLoadMenuUntil = 0;
let canceledInventoryLazyLoadSelectors = new Set();
const inventoryLazyLoadTimeoutMs = 900;
let activeRecording = null;
let currentRunConfig = null;
let derivedPlayerCharacter = {};
let startupRecoveryState = null;
let startupChoiceShown = false;
let activeContextualPrompt = null;
let gameOverState = null;
let gameOverRenderTimer = null;
let recentDeathCauseCandidate = '';
let recentDeathCauseCandidateRank = 0;
let pendingQuitConfirmation = null;
let testSentInputs = [];
let testSentPayloads = [];
let testSentUiProtocolCommands = [];
let testSentUiProtocolAcks = [];
let recordingProtocolSequence = 0;
let pendingExplicitGroundLookUntil = 0;
let lastDirectionKey = '';
let activeWorkflowContext = null;
let shopPaymentUiStatus = { phase: 'idle', text: '', until: 0 };
let pendingNativeUiCommands = new Map();
let pendingNativeUiCommandBridgeOutcomes = new Map();
let semanticActionCommandRevision = 0;
let transferEventSequence = 0;
let lastInteractionDialogSignature = '';
let groundItemsHint = null;
let pendingGroundItemsMessageList = null;
let transferPresentation = null;
let containerTransferRefreshGraceUntil = 0;
let containerTransferExtendedPromptSuppressTokens = [];
let containerTransferExtendedPromptSuppressSequence = 0;
let containerTransferSuppressedExtendedPrompt = null;
let containerTransferLastExtendedPromptSuppressionAt = 0;
let containerTransferInternalSendDepth = 0;
let directTransferPendingTimeout = null;
let directContainerSnapshotTimeout = null;
let testUiCommandHandler = null;
let pendingContainerUnlockOpen = null;
let stalePlaceholderStatusSuppressUntil = 0;
let monsterSenseFarlookStatusUntil = 0;
let pendingMonsterSenseFarlookTipSuppression = false;
let lastMonsterSenseMessageAt = 0;
const smallFixedOptionLimit = 4;
const interactionPlanner = sharedModules.interactionModel.createInteractionPlanner();
let lastInteractionPlannerDecisionSequence = 0;

function interactionPlannerInput() {
  const menu = gameViewSnapshot.currentMenu;
  const prompt = gameViewSnapshot.activePrompt;
  const transferOwner = transferSession.snapshot().owner;
  const panelOwnsMenu = Boolean(transferOwner?.ownsMenu && menu?.awaitingSelection);
  const transferOwnsPrompt = Boolean(transferOwner?.ownsPrompt);
  const itemOwnership = itemEquipmentOwner?.ownership?.() || {};
  const inventoryChoices = gameViewSnapshot.inventory?.orderedItems || [];
  return {
    gameView: gameViewSnapshot,
    inventoryChoices,
    extCommandCatalog: gameViewSnapshot.extCommandCatalog,
    inventoryLoadState: inventoryLazyLoad?.status || '',
    running: Boolean(runningState.running),
    playable: Boolean(runningState.running),
    terrainLabel: statusValue(25),
    groundHint: groundItemsHint,
    contextualPrompt: activeContextualPrompt,
    lastInventoryActionQuery,
    workflowLabel: activeWorkflowContext?.label || '',
    smallFixedOptionLimit,
    transfer: transferOwner ? {
      id: transferOwner.id,
      ownsPrompt: transferOwnsPrompt,
      ownsMenu: panelOwnsMenu,
      cancellation: transferOwner.cancellation,
    } : null,
    equipment: {
      id: itemOwnership.id || '',
      ownsPrompt: Boolean(itemOwnership.ownsPrompt),
      ownsMenu: Boolean(itemOwnership.ownsMenu),
    },
  };
}

function interactionDecision(reason = 'presentation') {
  const decision = interactionPlanner.decide(interactionPlannerInput());
  if (decision.decisionSequence !== lastInteractionPlannerDecisionSequence) {
    lastInteractionPlannerDecisionSequence = decision.decisionSequence;
    diagnosticEvent('interaction', 'interaction.plan.decided', {
      reason,
      decisionSequence: decision.decisionSequence,
      interactionId: decision.interactionId,
      transition: decision.transition,
      owner: decision.owner.kind,
      requestId: decision.owner.requestId,
      promptClassification: decision.prompt.classification || decision.prompt.kind,
      menuClassification: decision.menu.classification || decision.menu.kind,
      contextActionCount: decision.contextActions.length,
    });
  }
  return decision;
}

function summarizeCommandTransactions() {
  const byId = gameViewSnapshot.commandTransactions?.byId instanceof Map ? gameViewSnapshot.commandTransactions.byId : new Map();
  return {
    revision: gameViewSnapshot.commandTransactions?.revision || 0,
    activeId: gameViewSnapshot.commandTransactions?.activeId || '',
    lastCompleted: gameViewSnapshot.commandTransactions?.lastCompleted || null,
    lastRejected: gameViewSnapshot.commandTransactions?.lastRejected || null,
    protocolAcks: gameViewSnapshot.commandProtocolAcks.slice(-8),
    lastProtocolAck: gameViewSnapshot.lastCommandProtocolAck,
    lastProtocolRejection: gameViewSnapshot.lastCommandProtocolRejection,
    transactions: Array.from(byId.values()).slice(-8).map((tx) => ({ 
      transactionId: tx.transactionId,
      status: tx.status,
      lifecycle: tx.lifecycle,
      commandKey: tx.commandKey,
      semanticAction: tx.semanticAction,
      semanticActionId: tx.semanticActionId || '',
      guiAction: tx.guiAction || null,
      interactions: Array.isArray(tx.interactions) ? tx.interactions.slice(-4) : [],
      result: tx.result || null,
    })),
  };
}

const defaultTileMapConfig = sharedModules.tileAssets?.defaultTileMapConfig || {
  defaults: { blank: 'unexplored-stone', floor: 'room-floor', rock: 'unexplored-stone', actorBase: 'room-floor' },
  char: {
    '.': 'room-floor', '|': 'vertical-wall', '-': 'horizontal-wall', '+': 'closed-door', '#': 'lit-corridor',
    '<': 'up-stairs', '>': 'down-stairs', '@': 'hero-avatar', '_': 'altar', '{': 'fountain', '}': 'moat-water', '\\': 'throne', '^': 'arrow-trap',
    '`': 'boulder', '/': 'open-vertical-door', f: 'kitten-pet', d: 'little-dog-pet', ')': 'weapon-class-icon', '%': 'food-ration',
  },
  glyphNumber: {
    44: 'dwarf', 427: 'dwarf', 725: 'hero-avatar', 798: 'kitten-pet', 3873: 'open-vertical-door', 3930: 'vertical-wall', 3931: 'horizontal-wall',
    3932: 'horizontal-wall', 3933: 'horizontal-wall', 3934: 'horizontal-wall', 3935: 'horizontal-wall', 3985: 'no-door-doorway',
    3986: 'open-vertical-door', 3987: 'open-horizontal-door', 3988: 'closed-door', 3989: 'closed-door', 3990: 'iron-bars', 3992: 'room-floor', 3994: 'engraving', 3997: 'engraving', 4013: 'sink', 4014: 'fountain',
  },
};

tileMapConfig = defaultTileMapConfig;

function slugifySemanticName(name) {
  return sharedModules.tileAssets?.slugifySemanticName ? sharedModules.tileAssets.slugifySemanticName(name) : String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const semanticAssetAliases = new Map([
  ['arrow trap', 'arrow-trap'], ['engraving in a room', 'engraving'], ['engraving in a corridor', 'engraving'], ['engraving', 'engraving'], ['food', 'food-ration'], ['gold piece', 'coin-pile'], ['gold pieces', 'coin-pile'],
  ['crude ring mail', 'orcish-ring-mail'], ['crude dagger', 'orcish-dagger'],
]);
const petAssetAliases = new Map([
  ['little dog', 'little-dog-pet'], ['dog', 'dog'], ['large dog', 'large-dog'],
  ['kitten', 'kitten-pet'], ['pony', 'pony-pet'],
]);

const publicRoleNames = Object.freeze(['Archeologist', 'Barbarian', 'Caveman', 'Cavewoman', 'Healer', 'Knight', 'Monk', 'Priest', 'Priestess', 'Ranger', 'Rogue', 'Samurai', 'Tourist', 'Valkyrie', 'Wizard']);
const publicRoleNameBySlug = Object.freeze(Object.fromEntries(publicRoleNames.map((name) => [slugifySemanticName(name), name.replace(/^Cavewoman$/, 'Caveman').replace(/^Priestess$/, 'Priest')])));
function publicPlayerCharacterFromMessage(text = '') {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  const patterns = [
    /\b(lawful|neutral|chaotic)\s+(?:(male|female)\s+)?(human|dwarf|elf|gnome|orc)\s+([A-Za-z]+)\b/i,
    /\bthe\s+(?:(male|female)\s+)?(human|dwarf|elf|gnome|orc)\s+([A-Za-z]+)\b/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const hasAlignment = /lawful|neutral|chaotic/i.test(match[1] || '');
    const alignment = hasAlignment ? match[1] : '';
    const gender = hasAlignment ? (match[2] || '') : (match[1] || '');
    const race = hasAlignment ? (match[3] || '') : (match[2] || '');
    const roleToken = hasAlignment ? (match[4] || '') : (match[3] || '');
    const role = publicRoleNameBySlug[slugifySemanticName(roleToken)];
    if (!role || !race) continue;
    return {
      role,
      race: race.toLowerCase(),
      ...(gender ? { gender: gender.toLowerCase() } : {}),
      ...(alignment ? { alignment: alignment.toLowerCase() } : {}),
    };
  }
  return null;
}
function maybeRememberPlayerCharacterFromMessage(text = '') {
  const parsed = publicPlayerCharacterFromMessage(text);
  if (!parsed) return false;
  const before = JSON.stringify(derivedPlayerCharacter || {});
  derivedPlayerCharacter = { ...(derivedPlayerCharacter || {}), ...parsed };
  return JSON.stringify(derivedPlayerCharacter || {}) !== before;
}
function currentPlayerCharacter() {
  if (currentRunConfig) return { ...(derivedPlayerCharacter || {}), ...(currentRunConfig.character || {}) };
  return selectedCharacter();
}

function mappedAssetIdForCell(cell) {
  if (sharedModules.tileAssets?.mappedAssetIdForCell) return sharedModules.tileAssets.mappedAssetIdForCell(cell, { tileMapConfig, tileAssetsById, playerCharacter: currentPlayerCharacter() });
  const normalized = normalizeCell(cell);
  if (normalized.ch === ' ' && normalized.assetId == null) return undefined;
  const semanticAlias = semanticAssetAliases.get(String(normalized.semanticName || '').toLowerCase());
  const semanticSlug = slugifySemanticName(normalized.semanticName);
  const semanticKind = String(normalized.semanticKind || '').toLowerCase();
  const semanticName = String(normalized.semanticName || '').toLowerCase();
  const petStateId = semanticKind === 'pet' ? petAssetAliases.get(semanticName) : undefined;
  const isPlayer = semanticKind ? ['player', 'hero'].includes(semanticKind) : (normalized.assetId === 'hero-avatar' || Number(normalized.glyph) === 725 || (normalized.ch === '@' && (!semanticName || /^(?:hero|player)$/.test(semanticName))));
  const comboAvatarId = isPlayer ? sharedModules.tileAssets?.playerComboAvatarAssetId?.(currentPlayerCharacter(), tileAssetsById) : undefined;
  const roleAvatarId = isPlayer ? sharedModules.tileAssets?.playerRoleAvatarAssetId?.(currentPlayerCharacter(), tileAssetsById) : undefined;
  const semanticPlayerAvatarId = isPlayer ? sharedModules.tileAssets?.playerSemanticAvatarAssetId?.(normalized, tileAssetsById) : undefined;
  const nonPlayerAtSign = normalized.ch === '@' && !isPlayer;
  if (isPlayer) {
    const explicitPlayerAvatarId = sharedModules.tileAssets?.playerExplicitAvatarAssetId?.(normalized.assetId, tileAssetsById) || (normalized.assetId === 'hero-avatar' ? 'hero-avatar' : undefined);
    const explicitSpecificAvatarId = explicitPlayerAvatarId === 'hero-avatar' ? undefined : explicitPlayerAvatarId;
    return explicitSpecificAvatarId || comboAvatarId || roleAvatarId || semanticPlayerAvatarId || explicitPlayerAvatarId || tileMapConfig.glyphNumber?.[String(normalized.glyph)] || tileMapConfig.semanticKind?.[semanticKind] || tileMapConfig.char?.[normalized.ch] || defaultTileMapConfig.char[normalized.ch];
  }
  return petStateId
    || normalized.assetId
    || tileMapConfig.glyphNumber?.[String(normalized.glyph)]
    || tileMapConfig.semanticName?.[semanticSlug]
    || tileMapConfig.semanticKind?.[String(normalized.semanticKind || '').toLowerCase()]
    || (semanticAlias && tileAssetsById.has(semanticAlias) ? semanticAlias : undefined)
    || (semanticSlug && tileAssetsById.has(semanticSlug) ? semanticSlug : undefined)
    || (nonPlayerAtSign ? undefined : (tileMapConfig.char?.[normalized.ch] || defaultTileMapConfig.char[normalized.ch]));
}

function setStatus(text) {
  const diagnosticText = String(text || '').trim();
  if (status.dataset.status === diagnosticText) return;
  status.textContent = diagnosticText;
  status.dataset.status = diagnosticText;
  const ready = /^(your turn|ready\.?|map ready|dungeon map ready|command accepted)$/i.test(diagnosticText)
    || /dungeon running|previous game restored|tile map focused/i.test(diagnosticText);
  status.classList.toggle('ux-status-ready', ready);
  diagnosticEvent('status-compatibility', 'status.diagnostic-only', { text: diagnosticText });
}

function showPlayerNotice(notice) {
  if (!notice?.id || !notice?.message) return null;
  if (notice.kind === 'info' && Date.now() < actionableFailureHoldUntil && actionableFailureNotice) {
    diagnosticEvent('interaction', 'notice.lower-priority-suppressed-by-actionable-failure', { suppressedId: notice.id, activeFailureId: actionableFailureNotice.id });
    return uxNoticeService?.current?.() || actionableFailureNotice;
  }
  try { return uxNoticeService?.show?.(notice) || null; }
  catch (error) {
    diagnosticEvent('interaction', 'notice.rejected', { message: String(error?.message || error), notice: { ...notice, action: notice.action ? '[function]' : undefined } });
    return null;
  }
}

function showReadyNotice(id = 'state:your-turn') {
  const current = uxNoticeService?.current?.();
  if (current && ['warning', 'error'].includes(current.kind) && current.persistence !== 'transient') {
    diagnosticEvent('interaction', 'notice.ready-suppressed-by-actionable-failure', { readyId: id, activeId: current.id, activeKind: current.kind });
    return current;
  }
  return showPlayerNotice({ id, dedupeKey: id, kind: 'info', message: 'Your turn', source: 'prompt', persistence: 'until-state-change' });
}

const failureSurfaceState = new WeakMap();
let lastContainerTransferInteractionSnapshot = null;
let pendingTransferFailureRestore = null;

function currentFailureSurface() {
  if (containerTransferPanel && !containerTransferPanel.hidden) return containerTransferPanel;
  if (interactionDialog?.open) return interactionDialog;
  return null;
}

function failureListKey(node, index) {
  return node?.id || node?.closest?.('[data-container-pane]')?.dataset?.containerPane || String(index);
}

function snapshotFailureSurface(surface) {
  const lists = Array.from(surface?.querySelectorAll?.('#interaction-options, .container-item-list') || []).map((node, index) => {
    const rows = Array.from(node.querySelectorAll('[data-stable-id]'));
    const focused = surface?.contains?.(document.activeElement) ? document.activeElement?.closest?.('[data-stable-id]') : null;
    const selected = rows.filter((row) => row.matches?.('[aria-selected="true"], [aria-checked="true"], .selected'));
    const focusRow = focused && node.contains(focused) ? focused : (selected[0] || null);
    return {
      key: failureListKey(node, index),
      top: node.scrollTop,
      stableId: String(focusRow?.dataset?.stableId || ''),
      index: focusRow ? rows.indexOf(focusRow) : -1,
      selectedStableIds: selected.map((row) => String(row.dataset.stableId || '')).filter(Boolean),
    };
  });
  const focusedList = lists.find((entry) => entry.stableId) || null;
  return { stableId: focusedList?.stableId || '', focusedPane: focusedList?.key || '', scroll: lists, lists };
}

function failureActivationControls(surface) {
  return Array.from(surface?.querySelectorAll?.('.choice-button, .container-item-row, #interaction-confirm, #interaction-select-all, #interaction-clear') || []);
}

function applyFailureSurfaceLock(surface, presentation, preserved = snapshotFailureSurface(surface)) {
  if (!surface || !presentation?.disableAction) return;
  failureSurfaceState.set(surface, { presentation, preserved });
  surface.dataset.failureLocked = presentation.kind;
  surface.dataset.refreshRequired = String(Boolean(presentation.refreshRequired));
  for (const control of failureActivationControls(surface)) {
    if (!control.dataset.failurePriorDisabled) control.dataset.failurePriorDisabled = control.disabled ? 'true' : 'false';
    control.disabled = true;
    control.setAttribute('aria-disabled', 'true');
    if ('draggable' in control) control.draggable = false;
  }
  if (interactionRefresh && surface === interactionDialog) interactionRefresh.hidden = !presentation.refreshRequired;
  const transferRefresh = surface.querySelector?.('[data-transfer-refresh]');
  if (transferRefresh) transferRefresh.hidden = !presentation.refreshRequired;
  if (surface === containerTransferPanel && presentation.refreshRequired) {
    surface.querySelectorAll('.ux-stale-preserved').forEach((node) => node.classList.remove('ux-stale-preserved'));
    const selected = preserved.stableId && Array.from(surface.querySelectorAll('[data-stable-id]')).find((node) => node.dataset.stableId === preserved.stableId);
    selected?.classList.add('ux-stale-preserved');
    window.setTimeout(() => transferRefresh?.focus?.({ preventScroll: true }), 0);
  }
}

function restoreFailureSurfaceState(surface, preserved) {
  if (!surface || !preserved) return;
  const nodes = Array.from(surface.querySelectorAll('#interaction-options, .container-item-list'));
  let focusTarget = null;
  for (const saved of preserved.lists || preserved.scroll || []) {
    const node = nodes.find((candidate, index) => failureListKey(candidate, index) === saved.key);
    if (!node) continue;
    const rows = Array.from(node.querySelectorAll('[data-stable-id]'));
    for (const stableId of saved.selectedStableIds || []) {
      const selected = rows.find((row) => row.dataset.stableId === stableId);
      if (selected) {
        if (selected.hasAttribute('aria-selected')) selected.setAttribute('aria-selected', 'true');
        if (selected.hasAttribute('aria-checked')) selected.setAttribute('aria-checked', 'true');
        selected.classList.toggle('selected', selected.classList.contains('selected'));
      }
    }
    if (saved.key === preserved.focusedPane) {
      focusTarget = rows.find((row) => row.dataset.stableId === saved.stableId && !row.disabled)
        || rows[Math.max(0, Math.min(rows.length - 1, Number(saved.index) < 0 ? 0 : Number(saved.index)))]
        || null;
    }
    node.scrollTop = saved.top;
  }
  const stable = !focusTarget && preserved.stableId
    ? Array.from(surface.querySelectorAll('[data-stable-id]')).find((node) => node.dataset.stableId === preserved.stableId && !node.disabled)
    : null;
  const fallback = surface.querySelector('[data-ux-domain-fallback], .choice-button:not(:disabled), .container-item-row:not(:disabled), #interaction-refresh:not([hidden]), [data-transfer-refresh]:not([hidden]), button:not(:disabled)');
  (focusTarget || stable || fallback || gameGrid)?.focus?.({ preventScroll: true });
  for (const saved of preserved.lists || preserved.scroll || []) {
    const node = nodes.find((candidate, index) => failureListKey(candidate, index) === saved.key);
    if (node) node.scrollTop = saved.top;
  }
}

function clearFailureSurfaceLock(surface, { restore = true } = {}) {
  const state = failureSurfaceState.get(surface);
  if (!state) return null;
  delete surface.dataset.failureLocked;
  delete surface.dataset.refreshRequired;
  for (const control of failureActivationControls(surface)) {
    control.disabled = control.dataset.failurePriorDisabled === 'true';
    control.removeAttribute('aria-disabled');
    delete control.dataset.failurePriorDisabled;
  }
  if (interactionRefresh && surface === interactionDialog) interactionRefresh.hidden = true;
  const transferRefresh = surface.querySelector?.('[data-transfer-refresh]');
  if (transferRefresh) transferRefresh.hidden = true;
  surface.querySelectorAll?.('.ux-stale-preserved').forEach((node) => node.classList.remove('ux-stale-preserved'));
  failureSurfaceState.delete(surface);
  if (restore) window.setTimeout(() => restoreFailureSurfaceState(surface, state.preserved), 0);
  return state;
}

function refreshFailedInteractionSurface() {
  const state = clearFailureSurfaceLock(interactionDialog, { restore: false });
  if (!state) return;
  actionableFailureHoldUntil = 0;
  actionableFailureNotice = null;
  uxNoticeService?.stateChanged?.();
  if (gameViewSnapshot.currentMenu?.awaitingSelection) renderMenuPanel();
  else if (gameViewSnapshot.activePrompt) renderPromptPanel();
  else restoreFailureSurfaceState(interactionDialog, state.preserved);
  window.setTimeout(() => restoreFailureSurfaceState(interactionDialog, state.preserved), 0);
  diagnosticEvent('failure-presentation', 'failure.explicit-refresh', { surface: 'interaction', retryDispatched: false, stableId: state.preserved.stableId });
}
interactionRefresh?.addEventListener('click', refreshFailedInteractionSurface);

function showFailureNotice(input) {
  const presentation = sharedModules.uxFailurePresentation?.presentFailure?.(input);
  if (!presentation) return null;
  const explicitSurface = Object.prototype.hasOwnProperty.call(input || {}, 'surface');
  const conflict = presentation.kind.endsWith('conflict');
  const surface = explicitSurface ? input.surface : (conflict ? null : currentFailureSurface());
  const currentPreserved = surface ? snapshotFailureSurface(surface) : null;
  const existingPreserved = surface ? failureSurfaceState.get(surface)?.preserved : null;
  const preserved = surface === containerTransferPanel && !currentPreserved?.stableId
    ? (existingPreserved?.stableId ? existingPreserved : (lastContainerTransferInteractionSnapshot?.stableId ? lastContainerTransferInteractionSnapshot : currentPreserved))
    : currentPreserved;
  actionableFailureNotice = presentation.notice;
  actionableFailureHoldUntil = Date.now() + 5000;
  showPlayerNotice(presentation.notice);
  if (surface && presentation.disableAction) applyFailureSurfaceLock(surface, presentation, preserved);
  if (conflict && input?.actionControl) {
    input.actionControl.disabled = true;
    input.actionControl.setAttribute?.('aria-disabled', 'true');
  }
  diagnosticEvent('failure-presentation', 'failure.presented', {
    kind: presentation.kind,
    retry: presentation.retry,
    redispatched: false,
    preserveSelection: presentation.preserveSelection,
    preserveScroll: presentation.preserveScroll,
    disableAction: presentation.disableAction,
    refreshRequired: presentation.refreshRequired,
    stableId: preserved?.stableId || '',
    conflictingControlDisabled: Boolean(conflict && input?.actionControl?.disabled),
    diagnosticRef: presentation.notice.diagnosticRef || '',
  });
  return presentation;
}

function setRunningState(state) {
  runningState = state || { running: false };
  const running = Boolean(runningState.running);
  document.getElementById('start').disabled = running;
  document.getElementById('start-shim').disabled = running;
  document.getElementById('stop').disabled = !running;
  document.getElementById('shim-wait').hidden = !running;
  document.getElementById('shim-esc').hidden = !running;
  document.getElementById('stop').hidden = !running;
  renderContextActionBar();
}


let mapCellElements = [];
const mapInteractionClassCells = new Set();
const publicTerrainLabelsByCoord = new Map();
let publicTerrainLabelsDirty = true;
let mapRenderScheduled = false;
let mapNeedsFullRender = true;
let activeTooltipCellKey = '';
const dirtyMapCells = new Set();
const renderStats = { fullRenders: 0, partialRenders: 0, cellsUpdated: 0, scheduledFlushes: 0, immediateFlushes: 0, lastRenderDurationMs: 0, lastRenderMode: 'none' };
let shimEventBatchDepth = 0;
let deferredGameViewEffects = null;
const performanceEvents = [];
function recordPerformanceEvent(type, payload = {}) {
  if (typeof performance === 'undefined') return;
  performanceEvents.push({ type, at: Math.round(performance.now() * 1000) / 1000, ...payload });
  if (performanceEvents.length > 300) performanceEvents.splice(0, performanceEvents.length - 300);
}
if (typeof window !== 'undefined') {
  window.__nethackRenderStats = renderStats;
  window.__nethackPerformanceEvents = performanceEvents;
}

function automationState() {
  return {
    status: status?.dataset?.status || status?.textContent || '',
    messages: gameViewSnapshot.messages.slice(-8),
    activePrompt: gameViewSnapshot.activePrompt ? { question: gameViewSnapshot.activePrompt.question, choices: gameViewSnapshot.activePrompt.choices } : null,
    currentMenu: gameViewSnapshot.currentMenu ? { title: gameViewSnapshot.currentMenu.title, itemCount: gameViewSnapshot.currentMenu.items?.length || 0 } : null,
    runningState,
    commandTransactions: summarizeCommandTransactions(),
    shimEventCount,
    mapWindowId: gameViewSnapshot.mapWindowId,
    cursor: { ...gameViewSnapshot.cursor },
    mapCells: gameGrid?.childElementCount || 0,
    renderStats: { ...renderStats },
    diagnostics: {
      modules: Object.fromEntries(Object.entries(sharedModules).map(([name, mod]) => [name, mod?.version || mod?.migrationPhase || 'unavailable'])),
      focusMode,
      rawShimLogCount: shimLines.length,
      messageLogCount: gameViewSnapshot.messages.length,
      tileManifestCount: tileAssetsById.size,
    },
  };
}

function normalizeCell(cell) {
  if (sharedModules.tileAssets?.normalizeCell) return sharedModules.tileAssets.normalizeCell(cell);
  if (typeof cell === 'string') return { ch: cell || ' ', assetId: undefined, glyph: undefined, ttychar: undefined, color: undefined, tileidx: undefined };
  return {
    ch: cell?.ch || ' ',
    assetId: cell?.assetId,
    glyph: cell?.glyph,
    ttychar: cell?.ttychar,
    color: cell?.color,
    tileidx: cell?.tileidx,
    glyphFlags: cell?.glyphFlags,
    objectId: cell?.objectId,
    displayName: cell?.displayName,
    backgroundGlyph: cell?.backgroundGlyph,
    backgroundSemanticKind: cell?.backgroundSemanticKind,
    backgroundSemanticName: cell?.backgroundSemanticName,
    objectLayerGlyph: cell?.objectLayerGlyph,
    objectLayerChar: cell?.objectLayerChar,
    objectLayerObjectId: cell?.objectLayerObjectId,
    objectLayerDisplayName: cell?.objectLayerDisplayName,
    objectLayerSemanticKind: cell?.objectLayerSemanticKind,
    objectLayerSemanticName: cell?.objectLayerSemanticName,
    objectLayerSemanticAppearance: cell?.objectLayerSemanticAppearance,
    objectLayerSemanticKnown: cell?.objectLayerSemanticKnown,
    semanticKind: cell?.semanticKind,
    semanticName: cell?.semanticName,
    semanticAppearance: cell?.semanticAppearance,
    semanticKnown: cell?.semanticKnown,
    cmapIndex: cell?.cmapIndex,
    actionAffordances: Array.isArray(cell?.actionAffordances) ? cell.actionAffordances.slice() : [],
    backgroundActionAffordances: Array.isArray(cell?.backgroundActionAffordances) ? cell.backgroundActionAffordances.slice() : [],
    objectLayerActionAffordances: Array.isArray(cell?.objectLayerActionAffordances) ? cell.objectLayerActionAffordances.slice() : [],
  };
}

function tileForCell(cell) {
  const assetId = mappedAssetIdForCell(cell);
  return assetId ? tileAssetsById.get(assetId) : undefined;
}

function humanizeId(value) {
  return String(value || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCase(value) {
  return humanizeId(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function corpseLabel(name) {
  const base = humanizeId(name || '').trim();
  if (!base) return 'corpse';
  return /\bcorpse\b/i.test(base) ? base : `${base} corpse`;
}

function statueLabel(name) {
  const base = humanizeId(name || '').trim();
  if (!base) return 'statue';
  return /\bstatue\b/i.test(base) ? base : `${base} statue`;
}

function tileUrl(tile) {
  if (sharedModules.tileAssets?.tileUrl) return sharedModules.tileAssets.tileUrl(tile);
  const assetPath = String(tile?.installedPath || '').replace(/^electron-poc\//, '');
  const version = tile?.sha256 || tile?.checksum || tile?.sourceSha256 || tile?.completedAt || tile?.coherentRestartAt || '';
  const cacheBust = version ? `?v=${encodeURIComponent(String(version).slice(0, 20))}` : '';
  return `url('../${assetPath}${cacheBust}')`;
}

function isOverlayTile(tile) {
  if (sharedModules.tileAssets?.isOverlayTile) return sharedModules.tileAssets.isOverlayTile(tile);
  if (!tile) return false;
  // Assets generated with the transparent workflow are intended to sit above
  // terrain.  Without an explicit base layer, their alpha shows the CSS cell
  // background (#07080c), which made sprites/items/traps look like black cards.
  if (/transparent/i.test(tile.workflowLabel || '') || /rem[_-]?back(?:ground)?/i.test(tile.workflow || '')) return true;
  return ['traps-hazards', 'player-pets-identity', 'player-combo-avatars', 'common-early-monsters', 'objects-inventory'].includes(tile.categorySlug);
}

function baseTileIdForCell(cell, overlayTile) {
  if (sharedModules.tileAssets?.baseTileIdForCell) return sharedModules.tileAssets.baseTileIdForCell(cell, overlayTile);
  const normalized = normalizeCell(cell);
  const ch = normalized.ch;
  if (ch === ' ' || overlayTile?.id === 'unexplored-stone') return undefined;
  if (isOverlayTile(overlayTile)) return ch === '#' ? 'lit-corridor' : 'room-floor';
  if (['.', '#'].includes(ch) || ['room-floor', 'dark-room-floor', 'lit-corridor', 'dark-corridor'].includes(overlayTile?.id)) return undefined;
  // Door/wall art may be opaque today, but keeping the semantic base here makes
  // future transparent structural overlays composite over terrain instead of CSS
  // black.  Walls get rock; doorways and actors/items/traps get room floor.
  if (['|', '-'].includes(ch) || /wall/i.test(overlayTile?.id || '')) return 'unexplored-stone';
  return 'room-floor';
}

function baseTileForCell(cell, overlayTile) {
  const baseId = baseTileIdForCell(cell, overlayTile);
  return baseId ? tileAssetsById.get(baseId) : undefined;
}

const cssTerrainGlyphs = new Set([' ', '.', '#', '|', '-', '+', '/']);
const roomLikeGlyphs = new Set(['.', '@', ')', '%', '[', ']', '(', '?', '!', '$', '*', '=', '"', '`', '_', '{', '<', '>', '^']);
const wallGlyphs = new Set(['|', '-']);
const wallAssetIds = new Set(['vertical-wall', 'horizontal-wall', 'wall', 'wall-corner', 'wall-tee-junction', 'generic-wall-fallback']);
const doorGlyphs = new Set(['+', '/']);
const legacyCssDungeonAssetIds = new Set([
  'room-floor', 'dark-room-floor', 'lit-corridor', 'dark-corridor', 'unexplored-stone', 'solid-rock', 'stone', 'floor', 'corridor',
  'vertical-wall', 'horizontal-wall', 'wall', 'wall-corner', 'wall-tee-junction', 'generic-wall-fallback',
  'closed-door', 'open-vertical-door', 'open-horizontal-door', 'broken-door', 'no-door-doorway',
]);

function cellAt(x, y) {
  if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return null;
  return normalizeCell(gameViewSnapshot.mapCells[y][x]);
}

function glyphAt(x, y) {
  return cellAt(x, y)?.ch || ' ';
}

function isWallLikeCell(x, y) {
  const normalized = cellAt(x, y);
  if (!normalized) return false;
  const assetId = mappedAssetIdForCell(normalized);
  if (wallAssetIds.has(assetId)) return true;
  if (assetId && /door/i.test(assetId)) return false;
  const semantic = `${normalized.semanticKind || ''} ${normalized.semanticName || ''}`;
  if (/door/i.test(semantic)) return false;
  return wallGlyphs.has(normalized.ch);
}

function isKnownDungeonGlyph(ch) {
  return ch !== ' ';
}

function isRockBackdropCell(x, y) {
  if (glyphAt(x, y) !== ' ') return false;
  for (let yy = y - 1; yy <= y + 1; yy += 1) {
    for (let xx = x - 1; xx <= x + 1; xx += 1) {
      if (xx === x && yy === y) continue;
      if (isKnownDungeonGlyph(glyphAt(xx, yy))) return true;
    }
  }
  return false;
}

function displayNameForAsset(assetId, fallback) {
  if (assetId === 'no-door-doorway' && /^no door(?: doorway)?$/i.test(String(fallback || '').trim())) return 'empty doorway';
  return fallback;
}

function categoryLabelForTile(tile, semanticKind) {
  const kind = String(semanticKind || '').toLowerCase();
  if (tile?.categorySlug === 'full-source-objects' && (kind === 'object' || kind === 'item')) return 'Objects and inventory items';
  return tile?.category;
}

function doorTerrainClassForAsset(assetId) {
  if (assetId === 'open-vertical-door') return 'terrain-door terrain-door-open terrain-door-open-vertical';
  if (assetId === 'open-horizontal-door') return 'terrain-door terrain-door-open terrain-door-open-horizontal';
  if (assetId === 'closed-door') return 'terrain-door terrain-door-closed';
  if (assetId === 'broken-door') return 'terrain-door terrain-door-broken';
  if (assetId === 'no-door-doorway') return 'terrain-door terrain-doorway';
  return '';
}

function terrainClassForCell(cell, assetId, x, y) {
  const normalized = normalizeCell(cell);
  const ch = normalized.ch;
  const doorClass = doorTerrainClassForAsset(assetId);
  if (doorClass) return doorClass;
  if (ch === ' ') return 'terrain-rock';
  if (ch === '.') return 'terrain-floor';
  if (ch === '#') return 'terrain-corridor';
  if (ch === '|') return 'terrain-wall terrain-wall-v';
  if (ch === '-') return 'terrain-wall terrain-wall-h';
  if (ch === '+') return 'terrain-door terrain-door-closed';
  if (ch === '/') return 'terrain-door terrain-door-open terrain-door-open-vertical';
  return '';
}

function shouldUseCssTerrain(ch, tile) {
  return cssTerrainGlyphs.has(ch) && (!tile || legacyCssDungeonAssetIds.has(tile.id));
}

function shouldForceFloorUnderGlyph(ch, tile) {
  // Any non-structural visible glyph (including monsters/items not yet present
  // in the generated manifest) should sit on floor instead of black/rock.
  return roomLikeGlyphs.has(ch) || (ch && !cssTerrainGlyphs.has(ch)) || isOverlayTile(tile);
}

function updatePaths() {
  if (!projectInfo) return;
  paths.textContent = `Repo: ${projectInfo.repoRoot} | Binary: ${projectInfo.nethackBin} | Shim: ${projectInfo.shimBridgeBin} | Tiles: ${tileAssetsById.size}`;
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function markMapCellDirty(x, y) {
  if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return;
  dirtyMapCells.add(cellKey(x, y));
}

function markMapCellNeighborhoodDirty(x, y) {
  // Cell classes depend on adjacent wall/door context, so update neighbors too.
  markMapCellDirty(x, y);
  markMapCellDirty(x - 1, y);
  markMapCellDirty(x + 1, y);
  markMapCellDirty(x, y - 1);
  markMapCellDirty(x, y + 1);
}

function markAllMapCellsDirty() {
  dirtyMapCells.clear();
  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) markMapCellDirty(x, y);
  }
}

function publicSemanticNameForCell(cell) {
  const normalized = normalizeCell(cell);
  if (sharedModules.tileAssets?.publicDisplayNameForCell) return sharedModules.tileAssets.publicDisplayNameForCell(normalized);
  if (normalized.semanticKnown === false) return normalized.semanticAppearance || '';
  return normalized.semanticName;
}

function publicObjectLayerClassFallback(cell) {
  const normalized = normalizeCell(cell);
  const code = Number(normalized.objectLayerChar);
  if (Number.isInteger(code) && code > 0 && code < 128) return `visible ${String.fromCharCode(code)} object`;
  if (normalized.objectLayerGlyph != null || normalized.objectLayerSemanticKind) return 'visible object';
  return '';
}

function publicObjectLayerSemanticNameForCell(cell) {
  const normalized = normalizeCell(cell);
  if (normalized.objectLayerSemanticKnown === false && normalized.objectLayerSemanticAppearance && sharedModules.tileAssets?.publicDisplayNameForCell) {
    return sharedModules.tileAssets.publicDisplayNameForCell({ ch: normalized.objectLayerChar || ')', semanticKind: normalized.objectLayerSemanticKind || 'object', semanticName: normalized.objectLayerSemanticName, semanticAppearance: normalized.objectLayerSemanticAppearance, semanticKnown: normalized.objectLayerSemanticKnown });
  }
  if (normalized.objectLayerSemanticKnown === false) return normalized.objectLayerSemanticAppearance || publicObjectLayerClassFallback(normalized);
  return normalized.objectLayerSemanticName || normalized.objectLayerSemanticAppearance || publicObjectLayerClassFallback(normalized);
}

function semanticKindDatasetValueForCell(normalized) {
  const semanticKind = normalized.semanticKind ? String(normalized.semanticKind) : '';
  if (semanticKind) return semanticKind;
  const isPlayer = sharedModules.tileAssets?.isPlayerCell
    ? sharedModules.tileAssets.isPlayerCell(normalized)
    : (normalized.assetId === 'hero-avatar' || Number(normalized.glyph) === 725 || (normalized.ch === '@' && normalized.glyph == null));
  return isPlayer ? 'hero' : '';
}

function resetMapCellElement(cellEl, x, y, normalized) {
  cellEl.className = 'tile-cell';
  cellEl.textContent = '';
  cellEl.removeAttribute('style');
  cellEl.removeAttribute('title');
  cellEl.removeAttribute('aria-label');
  cellEl.dataset.glyph = normalized.ch;
  delete cellEl.dataset.glyphNumber;
  delete cellEl.dataset.tileidx;
  delete cellEl.dataset.glyphColor;
  delete cellEl.dataset.semanticKind;
  delete cellEl.dataset.semanticName;
  delete cellEl.dataset.cmapIndex;
  delete cellEl.dataset.backgroundSemanticKind;
  delete cellEl.dataset.backgroundSemanticName;
  delete cellEl.dataset.objectLayerSemanticKind;
  delete cellEl.dataset.objectLayerSemanticName;
  delete cellEl.dataset.tileId;
  delete cellEl.dataset.baseTileId;
  delete cellEl.dataset.objectTileId;
  delete cellEl.dataset.layerOrder;
  cellEl.dataset.mapX = String(x);
  cellEl.dataset.mapY = String(y);
  if (normalized.glyph != null && Number.isFinite(Number(normalized.glyph))) cellEl.dataset.glyphNumber = String(normalized.glyph);
  if (normalized.tileidx != null && Number.isFinite(Number(normalized.tileidx))) cellEl.dataset.tileidx = String(normalized.tileidx);
  if (normalized.color != null && Number.isFinite(Number(normalized.color))) cellEl.dataset.glyphColor = String(normalized.color);
  const semanticKindDatasetValue = semanticKindDatasetValueForCell(normalized);
  if (semanticKindDatasetValue) cellEl.dataset.semanticKind = semanticKindDatasetValue;
  const semanticDisplayName = publicSemanticNameForCell(normalized);
  if (semanticDisplayName) cellEl.dataset.semanticName = semanticDisplayName;
  if (normalized.cmapIndex != null && Number.isFinite(Number(normalized.cmapIndex))) cellEl.dataset.cmapIndex = String(normalized.cmapIndex);
  if (normalized.backgroundSemanticKind) cellEl.dataset.backgroundSemanticKind = normalized.backgroundSemanticKind;
  if (normalized.backgroundSemanticName) cellEl.dataset.backgroundSemanticName = normalized.backgroundSemanticName;
  if (normalized.objectLayerSemanticKind) cellEl.dataset.objectLayerSemanticKind = normalized.objectLayerSemanticKind;
  const objectLayerDisplayName = publicObjectLayerSemanticNameForCell(normalized);
  if (objectLayerDisplayName) cellEl.dataset.objectLayerSemanticName = objectLayerDisplayName;
}

function applyMapCellInteractionClasses(cellEl, x, y) {
  const isCursor = gameViewSnapshot.cursor.window === gameViewSnapshot.mapWindowId
    && gameViewSnapshot.cursor.x === x
    && gameViewSnapshot.cursor.y === y;
  const isAdjacentTarget = Boolean(directionKeyForMapDelta(x - gameViewSnapshot.cursor.x, y - gameViewSnapshot.cursor.y));
  if (isCursor) cellEl.classList.add('cursor');
  if (isAdjacentTarget) cellEl.classList.add('adjacent-move-target');
  if (isCursor || isAdjacentTarget) mapInteractionClassCells.add(cellEl);
}

function refreshMapCellInteractionClasses() {
  for (const cellEl of mapInteractionClassCells) cellEl.classList.remove('cursor', 'adjacent-move-target');
  mapInteractionClassCells.clear();
  const { x, y, window } = gameViewSnapshot.cursor;
  if (window !== gameViewSnapshot.mapWindowId) return;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cellEl = mapCellElements[y + dy]?.[x + dx];
      if (cellEl) applyMapCellInteractionClasses(cellEl, x + dx, y + dy);
    }
  }
}

function renderMapCellLayers(cellEl, layers = []) {
  if (!Array.isArray(layers) || !layers.length) return;
  for (const layer of layers) {
    const layerEl = document.createElement('span');
    layerEl.className = `tile-layer tile-layer-${layer.role || 'unknown'}`;
    layerEl.setAttribute('aria-hidden', 'true');
    if (layer.assetId) layerEl.dataset.tileId = layer.assetId;
    if (layer.label) layerEl.dataset.label = layer.label;
    if (layer.image) layerEl.style.backgroundImage = layer.image;
    if (layer.fallbackGlyph) {
      layerEl.classList.add('tile-layer-glyph');
      layerEl.textContent = layer.fallbackGlyph;
    }
    cellEl.appendChild(layerEl);
  }
}

function applyMapCellToElement(cellEl, x, y) {
  const normalized = normalizeCell(gameViewSnapshot.mapCells[y][x]);
  if (sharedModules.mapPresentation?.cellViewModel) {
    const model = sharedModules.mapPresentation.cellViewModel(normalized, x, y, { tileMapConfig, tileAssetsById, cells: gameViewSnapshot.mapCells, cursor: gameViewSnapshot.cursor, mapWindowId: gameViewSnapshot.mapWindowId, playerCharacter: currentPlayerCharacter() });
    resetMapCellElement(cellEl, x, y, normalized);
    cellEl.className = model.classes.join(' ');
    if (model.assetId) cellEl.dataset.tileId = model.assetId;
    if (model.baseTileId) cellEl.dataset.baseTileId = model.baseTileId;
    if (model.objectLayerAssetId) cellEl.dataset.objectTileId = model.objectLayerAssetId;
    if (Array.isArray(model.layerOrder) && model.layerOrder.length) cellEl.dataset.layerOrder = model.layerOrder.join('<');
    if (model.backgroundImage) cellEl.style.backgroundImage = model.backgroundImage;
    if (model.tileImage) cellEl.style.setProperty('--tile-image', model.tileImage);
    if (model.objectTileImage) cellEl.style.setProperty('--object-tile-image', model.objectTileImage);
    if (model.ariaLabel) cellEl.setAttribute('aria-label', model.ariaLabel);
    if (model.fallbackGlyph) cellEl.textContent = model.fallbackGlyph;
    renderMapCellLayers(cellEl, model.layers);
    applyMapCellInteractionClasses(cellEl, x, y);
    return;
  }
  const ch = normalized.ch;
  const assetId = mappedAssetIdForCell(normalized);
  const tile = assetId ? tileAssetsById.get(assetId) : undefined;
  const useCssTerrain = shouldUseCssTerrain(ch, tile);
  cellEl.className = 'tile-cell';
  cellEl.textContent = '';
  cellEl.removeAttribute('style');
  cellEl.removeAttribute('title');
  cellEl.removeAttribute('aria-label');
  cellEl.dataset.glyph = ch;
  delete cellEl.dataset.glyphNumber;
  delete cellEl.dataset.tileidx;
  delete cellEl.dataset.glyphColor;
  delete cellEl.dataset.semanticKind;
  delete cellEl.dataset.semanticName;
  delete cellEl.dataset.cmapIndex;
  delete cellEl.dataset.backgroundSemanticKind;
  delete cellEl.dataset.backgroundSemanticName;
  delete cellEl.dataset.objectLayerSemanticKind;
  delete cellEl.dataset.objectLayerSemanticName;
  delete cellEl.dataset.tileId;
  delete cellEl.dataset.baseTileId;
  delete cellEl.dataset.objectTileId;
  delete cellEl.dataset.layerOrder;
  cellEl.dataset.mapX = String(x);
  cellEl.dataset.mapY = String(y);
  if (normalized.glyph != null && Number.isFinite(Number(normalized.glyph))) cellEl.dataset.glyphNumber = String(normalized.glyph);
  if (normalized.tileidx != null && Number.isFinite(Number(normalized.tileidx))) cellEl.dataset.tileidx = String(normalized.tileidx);
  if (normalized.color != null && Number.isFinite(Number(normalized.color))) cellEl.dataset.glyphColor = String(normalized.color);
  const semanticKindDatasetValue = semanticKindDatasetValueForCell(normalized);
  if (semanticKindDatasetValue) cellEl.dataset.semanticKind = semanticKindDatasetValue;
  const semanticDisplayName = publicSemanticNameForCell(normalized);
  if (semanticDisplayName) cellEl.dataset.semanticName = semanticDisplayName;
  if (normalized.cmapIndex != null && Number.isFinite(Number(normalized.cmapIndex))) cellEl.dataset.cmapIndex = String(normalized.cmapIndex);
  const terrainClass = terrainClassForCell(normalized, assetId, x, y);
  if (terrainClass) cellEl.classList.add(...terrainClass.split(' '));
  if (!useCssTerrain && shouldForceFloorUnderGlyph(ch, tile)) cellEl.classList.add('terrain-floor');
  if (isWallLikeCell(x, y - 1)) cellEl.classList.add('touch-wall-n');
  if (isWallLikeCell(x + 1, y)) cellEl.classList.add('touch-wall-e');
  if (isWallLikeCell(x, y + 1)) cellEl.classList.add('touch-wall-s');
  if (isWallLikeCell(x - 1, y)) cellEl.classList.add('touch-wall-w');
  if (doorGlyphs.has(ch) || doorTerrainClassForAsset(assetId)) {
    if (assetId === 'open-horizontal-door') cellEl.classList.add('door-in-horizontal-wall');
    else if (assetId === 'open-vertical-door') cellEl.classList.add('door-in-vertical-wall');
    else {
      if (isWallLikeCell(x - 1, y) || isWallLikeCell(x + 1, y)) cellEl.classList.add('door-in-horizontal-wall');
      if (isWallLikeCell(x, y - 1) || isWallLikeCell(x, y + 1)) cellEl.classList.add('door-in-vertical-wall');
    }
  }
  const isStatueCell = String(normalized.semanticKind || '').toLowerCase() === 'statue';
  if (tile && !useCssTerrain) {
    const baseTile = baseTileForCell(normalized, tile);
    cellEl.classList.add('has-tile');
    cellEl.dataset.tileId = tile.id;
    if (baseTile) cellEl.dataset.baseTileId = baseTile.id;
    if (isStatueCell || isOverlayTile(tile)) {
      cellEl.classList.add('has-base-tile', 'tile-overlay');
      cellEl.dataset.baseTileId = 'css-terrain-floor';
      cellEl.style.setProperty('--tile-image', tileUrl(tile));
      const displayName = normalized.semanticKnown === false && normalized.semanticAppearance ? normalized.semanticAppearance : normalized.semanticName;
      const displayLabel = displayNameForAsset(assetId, displayName || tile.name);
      cellEl.setAttribute('aria-label', `${displayLabel}${isStatueCell && !/statue/i.test(displayLabel || '') ? ' statue' : ''} over dungeon floor`);
    } else {
      cellEl.style.backgroundImage = tileUrl(tile);
      cellEl.setAttribute('aria-label', displayNameForAsset(assetId, tile.name || titleCase(tile.id)));
    }
  } else if (tile && useCssTerrain) {
    cellEl.dataset.tileId = tile.id;
    cellEl.setAttribute('aria-label', displayNameForAsset(assetId, normalized.semanticName || tile.name || titleCase(tile.id)));
  }
  if (isStatueCell) cellEl.classList.add('statue-tile', 'statue-overlay');
  if (!tile && ch !== ' ' && !cssTerrainGlyphs.has(ch)) {
    cellEl.classList.add('fallback-glyph');
    cellEl.textContent = ch;
    cellEl.setAttribute('aria-label', `NetHack glyph ${ch}`);
  }
  applyMapCellInteractionClasses(cellEl, x, y);
}

const basicDungeonAssetIds = new Set(legacyCssDungeonAssetIds);
const basicDungeonGlyphs = new Set([' ', '.', '#', '|', '-', '+', '/']);
const meaningfulFeatureGlyphs = new Set(['+', '/', '<', '>', '_', '{', '}', '\\', '^', '`']);
const meaningfulSemanticKinds = new Set(['monster', 'pet', 'player', 'hero', 'corpse', 'statue', 'object', 'item', 'trap', 'stairs', 'door', 'feature', 'engraving']);
const basicSemanticNames = new Set(['floor', 'room floor', 'wall', 'vertical wall', 'horizontal wall', 'corridor', 'stone', 'rock', 'unexplored stone', 'darkness']);

function tooltipContentIdentity(label = '') {
  return String(label || '').toLowerCase().replace(/^[a-z]\s*-\s*/, '').replace(/^(?:an?|the|\d+)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function publicGroundTooltipContents(x, y) {
  const pile = groundPileAtCoord({ x, y });
  return (pile?.items || []).map((item) => {
    const glyphCode = Number(item.glyphChar);
    const ch = typeof item.glyphChar === 'string' ? item.glyphChar[0] : (Number.isInteger(glyphCode) && glyphCode > 0 && glyphCode < 128 ? String.fromCharCode(glyphCode) : ')');
    const cell = { ...item, ch, semanticKind: item.semanticKind || 'object' };
    const assetId = mappedAssetIdForCell(cell);
    const publicName = sharedModules.tileAssets?.publicDisplayNameForCell?.(cell);
    const label = publicName || item.displayName || item.text || item.semanticAppearance || item.semanticName || 'item';
    return { label: titleCase(label), kind: 'Item', layer: 'ground', assetId: assetId || '', objectId: item.objectId };
  });
}

function mapTooltipInfoForCell(cell, x, y) {
  if (sharedModules.mapPresentation?.tooltipInfoForCell) {
    const info = sharedModules.mapPresentation.tooltipInfoForCell(cell, x, y, { tileMapConfig, tileAssetsById, cells: gameViewSnapshot.mapCells, playerCharacter: currentPlayerCharacter() });
    if (!info) return null;
    const contents = Array.isArray(info.contents) ? info.contents.map((entry) => ({ ...entry })) : [];
    const identities = new Set(contents.map((entry) => tooltipContentIdentity(entry.label)));
    for (const item of publicGroundTooltipContents(x, y)) {
      const identity = tooltipContentIdentity(item.label);
      if (!identity || identities.has(identity)) continue;
      identities.add(identity);
      const terrainIndex = contents.findIndex((entry) => entry.layer === 'terrain');
      contents.splice(terrainIndex < 0 ? contents.length : terrainIndex, 0, item);
    }
    return { ...info, contents };
  }
  const normalized = normalizeCell(cell);
  const ch = normalized.ch || ' ';
  const assetId = mappedAssetIdForCell(normalized);
  const tile = assetId ? tileAssetsById.get(assetId) : undefined;
  const semanticName = humanizeId(normalized.semanticName || '');
  const semanticAppearance = humanizeId(normalized.semanticAppearance || '');
  const semanticKind = humanizeId(normalized.semanticKind || '');
  const meaningfulKind = meaningfulSemanticKinds.has(semanticKind.toLowerCase());
  const meaningfulAsset = assetId === 'no-door-doorway' || assetId === 'engraving';
  const isMeaningfulGlyph = meaningfulFeatureGlyphs.has(ch) || (!basicDungeonGlyphs.has(ch) && ch !== '');
  const isBasicTile = !assetId || basicDungeonAssetIds.has(assetId);
  // Boss requested no tooltips for ordinary floor/wall/empty/darkness.  Do not
  // let generic semantic labels like "room", "stone wall", or "darkness" turn
  // a basic terrain glyph into meaningful hover content.
  if (basicDungeonGlyphs.has(ch) && !meaningfulKind && !meaningfulFeatureGlyphs.has(ch) && !meaningfulAsset) return null;
  const hasMeaningfulSemanticName = Boolean(semanticName && !basicSemanticNames.has(semanticName.toLowerCase()) && (meaningfulKind || isMeaningfulGlyph));
  const hasMeaningfulSemantic = hasMeaningfulSemanticName || meaningfulKind;
  if (!assetId && !hasMeaningfulSemantic && !isMeaningfulGlyph && !meaningfulAsset) return null;
  const publicDisplayName = sharedModules.tileAssets?.publicDisplayNameForCell ? sharedModules.tileAssets.publicDisplayNameForCell(normalized) : (normalized.semanticKnown === false && semanticAppearance ? semanticAppearance : semanticName);
  const displayName = humanizeId(publicDisplayName || '');
  const rawTitle = displayNameForAsset(assetId, displayName || tile?.name || (assetId ? titleCase(assetId) : `Glyph ${ch}`));
  const isCorpse = semanticKind.toLowerCase() === 'corpse';
  const isStatue = semanticKind.toLowerCase() === 'statue';
  const title = isStatue ? statueLabel(rawTitle) : (isCorpse ? corpseLabel(rawTitle) : rawTitle);
  const details = [];
  const kindLower = semanticKind.toLowerCase();
  const titleLower = title.toLowerCase();
  if (semanticKind && kindLower !== titleLower && !titleLower.includes(kindLower)) details.push(titleCase(semanticKind));
  const categoryLabel = categoryLabelForTile(tile, semanticKind);
  if (categoryLabel && !details.includes(categoryLabel)) details.push(categoryLabel);
  if (normalized.glyph != null && Number.isFinite(Number(normalized.glyph))) details.push(`glyph ${normalized.glyph}`);
  details.push(`map ${x},${y}`);
  return { title: titleCase(title), description: details.join(' · '), contents: [{ label: titleCase(title), kind: titleCase(semanticKind || 'Feature'), layer: 'foreground', assetId: assetId || '' }], tile, assetId, glyph: ch, isCorpse, isStatue };
}

function hideMapTooltip() {
  if (!mapTooltip) return;
  activeTooltipCellKey = '';
  mapTooltip.hidden = true;
  mapTooltip.dataset.visible = 'false';
  mapTooltip.classList.remove('map-tooltip-statue');
}

function positionMapTooltip(cellEl) {
  if (!mapTooltip || mapTooltip.hidden) return;
  const cellRect = cellEl.getBoundingClientRect();
  const tipRect = mapTooltip.getBoundingClientRect();
  const margin = 10;
  let left = cellRect.right + margin;
  let top = cellRect.top + Math.max(0, (cellRect.height - tipRect.height) / 2);
  if (left + tipRect.width + margin > window.innerWidth) left = cellRect.left - tipRect.width - margin;
  if (left < margin) left = Math.min(window.innerWidth - tipRect.width - margin, cellRect.left + margin);
  if (top + tipRect.height + margin > window.innerHeight) top = window.innerHeight - tipRect.height - margin;
  if (top < margin) top = margin;
  mapTooltip.style.left = `${Math.round(Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - tipRect.width - margin)))}px`;
  mapTooltip.style.top = `${Math.round(Math.max(margin, top))}px`;
}

function showMapTooltipForCell(cellEl) {
  if (!cellEl || !mapTooltip) return hideMapTooltip();
  const x = Number(cellEl.dataset.mapX);
  const y = Number(cellEl.dataset.mapY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return hideMapTooltip();
  const info = mapTooltipInfoForCell(gameViewSnapshot.mapCells[y]?.[x], x, y);
  if (!info) return hideMapTooltip();
  const contentSignature = (info.contents || []).map((content) => `${content.label}:${content.kind}`).join('|');
  const nextKey = `${x},${y}:${info.assetId || info.glyph}:${info.title}:${info.description || ''}:${contentSignature}`;
  if (activeTooltipCellKey !== nextKey) {
    activeTooltipCellKey = nextKey;
    mapTooltipTitle.textContent = info.title;
    mapTooltipDescription.textContent = info.description === 'Fixture' ? 'Dungeon feature' : info.description;
    if (mapTooltipDescription) mapTooltipDescription.hidden = !info.description;
    if (mapTooltipContents) {
      mapTooltipContents.replaceChildren();
      const tooltipContents = (info.contents || []).slice();
      const visibleContents = tooltipContents.length && String(tooltipContents[0]?.label || '').trim().toLowerCase() === String(info.title || '').trim().toLowerCase()
        ? tooltipContents.slice(1)
        : tooltipContents;
      mapTooltipContents.classList.toggle('also-only', visibleContents.length > 0 && visibleContents.length < tooltipContents.length);
      for (const content of visibleContents) {
        const row = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'map-tooltip-content-label';
        label.textContent = content.label;
        const kind = document.createElement('span');
        kind.className = 'map-tooltip-content-kind';
        kind.textContent = content.kind === 'Fixture' ? 'Dungeon feature' : content.kind;
        row.append(label, kind);
        mapTooltipContents.append(row);
      }
      mapTooltipContents.hidden = visibleContents.length === 0;
    }
    mapTooltip.classList.toggle('map-tooltip-statue', Boolean(info.isStatue));
    mapTooltipIcon.className = 'map-tooltip-icon';
    mapTooltipIcon.textContent = '';
    mapTooltipIcon.style.removeProperty('background-image');
    delete mapTooltipIcon.dataset.tileId;
    if (info.isCorpse) mapTooltipIcon.classList.add('corpse-overlay');
    if (info.isStatue) mapTooltipIcon.classList.add('statue-overlay');
    if (info.useCssTerrain && Array.isArray(info.terrainClasses) && info.terrainClasses.length) {
      mapTooltipIcon.classList.add(...info.terrainClasses);
      mapTooltipIcon.dataset.tileId = info.assetId || info.tile?.id || '';
    } else if (info.tile?.installedPath) {
      mapTooltipIcon.classList.add('has-tooltip-tile');
      mapTooltipIcon.dataset.tileId = info.assetId || info.tile.id || '';
      mapTooltipIcon.style.backgroundImage = tileUrl(info.tile);
    } else {
      mapTooltipIcon.classList.add('map-tooltip-glyph');
      mapTooltipIcon.textContent = info.glyph || '?';
    }
    mapTooltip.hidden = false;
    mapTooltip.dataset.visible = 'true';
  }
  positionMapTooltip(cellEl);
}

function updateMapTooltipFromPointer(event) {
  const cellEl = event.target?.closest?.('.tile-cell');
  if (!cellEl || !gameGrid.contains(cellEl)) return hideMapTooltip();
  showMapTooltipForCell(cellEl);
}

window.NetHackMapTileDetailSource = Object.freeze({
  infoForCellElement(cellEl) {
    if (!cellEl || !gameGrid.contains(cellEl)) return null;
    const x = Number(cellEl.dataset.mapX);
    const y = Number(cellEl.dataset.mapY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    return mapTooltipInfoForCell(gameViewSnapshot.mapCells[y]?.[x], x, y);
  },
  hideTooltip: hideMapTooltip,
});

function updateGameGridMetadata() {
  gameGrid.dataset.mapWindowId = gameViewSnapshot.mapWindowId == null ? '' : String(gameViewSnapshot.mapWindowId);
  gameGrid.dataset.cursor = `${gameViewSnapshot.cursor.x},${gameViewSnapshot.cursor.y}`;
  gameGrid.dataset.tileManifestCount = String(tileAssetsById.size);
  gameGrid.dataset.bounds = `0,0,${mapWidth - 1},${mapHeight - 1}`;
  gameGrid.dataset.gridSize = `${mapWidth}x${mapHeight}`;
  gameGrid.dataset.fullRenders = String(renderStats.fullRenders);
  gameGrid.dataset.partialRenders = String(renderStats.partialRenders);
  gameGrid.dataset.cellsUpdated = String(renderStats.cellsUpdated);
}

function buildGameGrid() {
  gameGrid.textContent = '';
  mapCellElements = Array.from({ length: mapHeight }, () => Array(mapWidth));
  const fragment = document.createDocumentFragment();
  gameGrid.style.setProperty('--grid-cols', String(mapWidth));
  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const cellEl = document.createElement('span');
      applyMapCellToElement(cellEl, x, y);
      mapCellElements[y][x] = cellEl;
      fragment.appendChild(cellEl);
    }
  }
  gameGrid.appendChild(fragment);
  refreshMapCellInteractionClasses();
  renderStats.fullRenders += 1;
  renderStats.cellsUpdated += mapWidth * mapHeight;
  dirtyMapCells.clear();
  mapNeedsFullRender = false;
  updateGameGridMetadata();
  updatePublicTerrainLabelCache();
  reconcileGroundItemsHintWithCurrentMap();
  renderContextActionBar();
}

function renderGameGrid({ full = false } = {}) {
  const renderStartedAt = typeof performance !== 'undefined' ? performance.now() : 0;
  mapRenderScheduled = false;
  const existingCellCount = gameGrid.childElementCount;
  if (full || mapNeedsFullRender || existingCellCount !== mapWidth * mapHeight) {
    buildGameGrid();
    const duration = typeof performance !== 'undefined' ? performance.now() - renderStartedAt : 0;
    renderStats.lastRenderDurationMs = Math.round(duration * 1000) / 1000;
    renderStats.lastRenderMode = 'full';
    recordPerformanceEvent('renderer.map.render', { mode: 'full', durationMs: renderStats.lastRenderDurationMs, cells: mapWidth * mapHeight });
    return;
  }
  let dirtyCount = 0;
  if (dirtyMapCells.size) {
    const dirty = Array.from(dirtyMapCells);
    dirtyCount = dirty.length;
    dirtyMapCells.clear();
    for (const key of dirty) {
      const [x, y] = key.split(',').map(Number);
      const cellEl = mapCellElements[y]?.[x];
      if (cellEl) applyMapCellToElement(cellEl, x, y);
    }
    renderStats.partialRenders += 1;
    renderStats.cellsUpdated += dirty.length;
  }
  refreshMapCellInteractionClasses();
  updateGameGridMetadata();
  updatePublicTerrainLabelCache();
  reconcileGroundItemsHintWithCurrentMap();
  renderContextActionBar();
  const duration = typeof performance !== 'undefined' ? performance.now() - renderStartedAt : 0;
  renderStats.lastRenderDurationMs = Math.round(duration * 1000) / 1000;
  renderStats.lastRenderMode = dirtyCount ? 'partial' : 'metadata';
  recordPerformanceEvent('renderer.map.render', { mode: renderStats.lastRenderMode, durationMs: renderStats.lastRenderDurationMs, cells: dirtyCount });
}

function scheduleMapRender({ full = false } = {}) {
  if (full) mapNeedsFullRender = true;
  if (mapRenderScheduled) return;
  mapRenderScheduled = true;
  renderStats.scheduledFlushes += 1;
  const callback = () => renderGameGrid();
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(callback);
  else window.setTimeout(callback, 0);
}

function flushMapRenderNow() {
  if (!mapRenderScheduled && !mapNeedsFullRender && !dirtyMapCells.size) {
    updateGameGridMetadata();
    return;
  }
  renderStats.immediateFlushes += 1;
  renderGameGrid();
}


let pendingPresentationSettingsWarning = '';
const presentationSettingsStore = sharedModules.uxSettingsStore?.createSettingsStore?.({
  storage: window.localStorage,
  onDiagnostic: (entry) => diagnosticEvent('settings', entry.type, entry.detail || {}),
  onWarning: (message) => {
    pendingPresentationSettingsWarning = message;
    window.setTimeout(() => {
      if (!pendingPresentationSettingsWarning) return;
      showFailureNotice({ id: 'settings:storage-warning', kind: /loaded|defaults/i.test(pendingPresentationSettingsWarning) ? 'storage-load' : 'storage-write', reason: pendingPresentationSettingsWarning, surface: null });
    }, 500);
  },
});
let userSettings = presentationSettingsStore?.load?.().settings || {
  schemaVersion: 2,
  contextualMenus: true,
  autoLootGold: true,
  onboarding: { completed: false, disabled: false, lastStep: 'not-started' },
  hudDensity: 'compact',
  keyHints: 'contextual',
  map: { mode: 'full', scale: 1, glyphOverlay: false, highContrast: false },
  motion: 'system',
  sound: { uiEnabled: false, gameFeedbackEnabled: false, volume: 0.5 },
};
document.body.dataset.uxMotion = userSettings.motion === 'reduced' ? 'reduced' : userSettings.motion;

let uxDiscoveryController = null;
let uxCommandCatalog = null;
let uxCommandPalette = null;
let uxHelpCenter = null;
let uxOnboarding = null;
let uxCharacterCreation = null;

function discoveryPublicState() {
  const game = gameView?.snapshot?.() || {};
  const contextCommands = {};
  for (const action of interactionDecision('discovery-public-state').contextActions) {
    if (action.id === 'open-container' || action.command === 'ground-panel') contextCommands['item.loot'] = { available: true };
  }
  return {
    game,
    contextCommands,
    coreExtendedCommands: Array.isArray(gameViewSnapshot.extCommandCatalog) ? gameViewSnapshot.extCommandCatalog.slice() : [],
    commandAvailability: {
      'run.save': gameViewSnapshot.activePrompt || gameViewSnapshot.currentMenu?.awaitingSelection ? { available: false, reason: 'Finish the current NetHack choice before saving.' } : { available: true },
    },
    presentationSettings: userSettings,
  };
}

function openDiscoverySurface(surface, command = null, invoker = null) {
  window.setTimeout(() => {
    if (surface === 'help') uxHelpCenter?.open?.({ section: 'basics', invoker: invoker || openActionsButton });
    else if (surface === 'movement') uxHelpCenter?.open?.({ section: 'keys', query: command?.id === 'dungeon.counts' ? 'count' : '', invoker: invoker || openActionsButton });
  }, 0);
  return true;
}

function initializeDiscoveryDomain() {
  if (uxDiscoveryController || !uxRuntime || !sharedModules.uxCommandCatalog || !sharedModules.uxCommandPalette || !sharedModules.uxHelpCenter || !sharedModules.uxOnboarding || !sharedModules.uxCharacterCreation) return uxDiscoveryController;
  const mount = sharedModules.uxAppMounts?.lookupMount?.('discovery', document);
  if (!mount) return null;
  uxCommandCatalog = sharedModules.uxCommandCatalog.createCommandCatalog();
  const staticExtendedNames = new Set(uxCommandCatalog.entries().map((entry) => entry.internalRoute?.kind === 'text' && entry.internalRoute.value.startsWith('#') ? entry.internalRoute.value.slice(1).trim() : '').filter(Boolean));
  uxCommandCatalog.registerProvider('core-extended-commands', {
    entries(publicState = {}) {
      const commands = Array.isArray(publicState.coreExtendedCommands) ? publicState.coreExtendedCommands : [];
      const seen = new Set();
      return commands.flatMap((entry) => {
        const name = String(entry?.name || '').trim();
        if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || staticExtendedNames.has(name)) return [];
        const id = `core.extended.${name.replace(/[^A-Za-z0-9_.-]+/g, '-').toLocaleLowerCase()}`;
        if (seen.has(id)) return [];
        seen.add(id);
        return [{
          id,
          label: name.replace(/(^|[-_])([a-z])/g, (_match, space, letter) => `${space ? ' ' : ''}${letter.toUpperCase()}`),
          aliases: [name, String(entry.description || '')].filter(Boolean),
          category: /help|history|conduct|attribute|version|what/i.test(name) ? 'Help' : 'Dungeon',
          publicShortcut: `#${name}`,
          internalRoute: { kind: 'text', value: `#${name}\n` },
          promptPlan: 'core-owned',
          availability: 'always',
          recentEligible: true,
        }];
      });
    },
  });
  const dispatchAdapter = {
    sendKey(key) { return sendPlayableKey(key) !== false; },
    sendText(text) { return sendPlayableText(text) !== false; },
    openSurface(surface, command) { return openDiscoverySurface(surface, command, openActionsButton); },
    confirm(command) { return command?.promptPlan === 'core-owned'; },
  };
  uxCommandPalette = sharedModules.uxCommandPalette.createPaletteController({
    documentRoot: document,
    mount,
    catalog: uxCommandCatalog,
    dialogService: uxDialogService,
    dispatchAdapter,
    keyHints: () => userSettings.keyHints || 'contextual',
    onDiagnostic: (entry) => diagnosticEvent('discovery', entry.type, entry.detail || {}),
    onClose(reason, previous) {
      if (reason === 'escape' && previous?.mode === 'core' && gameViewSnapshot.activePrompt?.kind === 'extended command') sendActivePromptCancellation(gameViewSnapshot.activePrompt);
    },
  });
  uxHelpCenter = sharedModules.uxHelpCenter.createHelpController({
    documentRoot: document,
    mount,
    catalog: uxCommandCatalog,
    dialogService: uxDialogService,
    onRestartGuide() { uxOnboarding?.restart?.(); },
  });
  uxCharacterCreation = sharedModules.uxCharacterCreation.createCharacterCreationController({
    documentRoot: document,
    mount,
    dialogElement: characterDialog,
    legacyControlIds: true,
    characterOptions: sharedModules.characterOptions,
    dialogService: uxDialogService,
    onSubmit: startDiscoveryCharacter,
  });
  uxOnboarding = sharedModules.uxOnboarding.createOnboardingController({
    documentRoot: document,
    mount,
    settingsStore: presentationSettingsStore,
    settings: userSettings.onboarding,
    onDiagnostic: (entry) => diagnosticEvent('discovery', entry.type, entry.detail || {}),
    onWarning: (message) => showFailureNotice({ id: 'onboarding:preference-warning', kind: 'storage-write', reason: message }),
  });
  uxDiscoveryController = sharedModules.uxCommandCatalog.registerDiscoveryDomain({
    runtime: uxRuntime,
    catalog: uxCommandCatalog,
    palette: uxCommandPalette,
    help: uxHelpCenter,
    onboarding: uxOnboarding,
    characterCreation: uxCharacterCreation,
    onPublicState(snapshot) {
      const state = { ...discoveryPublicState(), game: snapshot.game || {}, presentationSettings: snapshot.presentationSettings || userSettings };
      uxCommandPalette?.updatePublicState?.(state);
      uxHelpCenter?.model?.setPublicState?.(state);
    },
  });
  fetch('../../doc/Guidebook.txt', { cache: 'no-store' }).then((response) => response.ok ? response.text() : '').then((text) => { if (text) uxHelpCenter?.setManual?.(text.split(/\r?\n/)); }).catch((error) => diagnosticEvent('discovery', 'help.manual-load-failed', { message: String(error?.message || error) }));
  if (openActionsButton) {
    openActionsButton.textContent = 'Commands';
    openActionsButton.setAttribute('aria-controls', 'ux-command-palette');
  }
  return uxDiscoveryController;
}

function saveSettings(nextSettings = userSettings) {
  const saved = presentationSettingsStore?.save?.(nextSettings);
  userSettings = saved?.settings || { ...userSettings, ...nextSettings };
  document.body.dataset.uxMotion = userSettings.motion === 'reduced' ? 'reduced' : userSettings.motion;
  syncSettingsForm();
  scheduleUxPublicStatePublish('presentation-settings');
  if (saved?.persisted) showPlayerNotice({ id: 'settings:saved', kind: 'success', message: 'Settings saved', source: 'result', persistence: 'transient' });
  return userSettings;
}

function resetSettings() {
  const reset = presentationSettingsStore?.reset?.();
  userSettings = reset?.settings || userSettings;
  document.body.dataset.uxMotion = userSettings.motion === 'reduced' ? 'reduced' : userSettings.motion;
  syncSettingsForm();
  scheduleUxPublicStatePublish('presentation-settings-reset');
}

function syncSettingsForm() {
  if (settingContextualMenus) settingContextualMenus.checked = Boolean(userSettings.contextualMenus);
  if (settingAutoLootGold) settingAutoLootGold.checked = Boolean(userSettings.autoLootGold);
  if (settingMotion) settingMotion.value = ['system', 'full', 'reduced'].includes(userSettings.motion) ? userSettings.motion : 'system';
}

function settingsFromForm() {
  return {
    contextualMenus: Boolean(settingContextualMenus?.checked),
    autoLootGold: Boolean(settingAutoLootGold?.checked),
    motion: ['system', 'full', 'reduced'].includes(settingMotion?.value) ? settingMotion.value : (userSettings.motion || 'system'),
  };
}

initializeDiscoveryDomain();

function buildNethackOptions(settings = userSettings) {
  const options = ['!tutorial', 'disclose:+i +a +v +g +c +o'];
  if (settings.autoLootGold) options.push('autopickup', 'pickup_types:$');
  else options.push('!autopickup');
  return options.join(',');
}

function resetGameOverState() {
  gameOverState = null;
  pendingQuitConfirmation = null;
  recentDeathCauseCandidate = '';
  recentDeathCauseCandidateRank = 0;
  if (gameOverRenderTimer) window.clearTimeout(gameOverRenderTimer);
  gameOverRenderTimer = null;
  if (gameOverDialog?.open) gameOverDialog.close('new-game');
}

function resetGameView() {
  resetGameOverState();
  pendingConfirmedSaveAction = null;
  omitNextPromptCancellationOwnershipForTest = false;
  closeContainerTransferPanel();
  gameView = sharedModules.gameViewState.createGameViewState({ mapWidth, mapHeight });
  gameViewSnapshot = gameView.snapshot();
  lastRenderedGameViewMapRevision = gameViewSnapshot.mapRevision;
  publicTerrainLabelsByCoord.clear();
  publicTerrainLabelsDirty = true;
  monsterSenseFarlookStatusUntil = 0;
  pendingMonsterSenseFarlookTipSuppression = false;
  lastMonsterSenseMessageAt = 0;
  statusLines.textContent = 'Status appears when play begins.';
  pendingPromptCancellation = null;
  lastPromptCancellationAcknowledgement = null;
  activeContextualPrompt = null;
  movementMode = 'walk';
  updateMovementModeButtons();
  compassRunArmed = false;
  updateCompassRunButton();
  documentWindow = null;
  introWindow = null;
  introLoreShown = false;
  if (documentDialog.open) documentDialog.close('silent');
  if (introDialog.open) introDialog.close('silent');
  lastWorldCommand = '';
  pendingExplicitGroundLookUntil = 0;
  lastDirectionKey = '';
  lastInventoryOverviewRequestAt = 0;
  groundItemsHint = null;
  pendingGroundItemsMessageList = null;
  clearWorkflowContext();
  lastInventoryActionQuery = '';
  transferEventSequence = 0;
  pendingContainerUnlockOpen = null;
  clearInventoryLazyLoad();
  closeInteractionDialog();
  itemEquipmentOwner?.reset?.({ reason: 'game-reset' });
  renderPromptPanel();
  renderMenuPanel();
  renderGameGrid({ full: true });
  renderContextActionBar();
  scheduleUxPublicStatePublish('game-reset');
}


function groundItemTextsFromMessage(text) {
  const raw = String(text || '').trim();
  if (/\bthings? that are here\s*:?\s*$/i.test(raw)) {
    pendingGroundItemsMessageList = { x: gameViewSnapshot.cursor.x, y: gameViewSnapshot.cursor.y, items: [], until: Date.now() + 2500 };
    return [];
  }
  if (pendingGroundItemsMessageList && Date.now() <= pendingGroundItemsMessageList.until && pendingGroundItemsMessageList.x === gameViewSnapshot.cursor.x && pendingGroundItemsMessageList.y === gameViewSnapshot.cursor.y) {
    if (sharedModules.messageLog.isGenericDirectionPromptMessage(raw) || /^(?:Never mind|Pick up|Search|Wait|Inspect(?:\s*\/\s*look)?|More\s*\/\s*advanced)\.?$/i.test(raw)) {
      pendingGroundItemsMessageList = null;
      return [];
    }
    if (/^(?:\d+\s+|an?\s+|some\s+|the\s+)?[A-Za-z][A-Za-z0-9' +\-]*(?:\s+[A-Za-z0-9' +\-]+)*[.!?]?$/.test(raw) && !/\b(?:welcome|there is|you |your |it is|after |moloch|marduk|keyboard help)\b/i.test(raw)) {
      pendingGroundItemsMessageList.items.push(raw.replace(/[.!?]+$/g, '').trim());
      return pendingGroundItemsMessageList.items.slice();
    }
    pendingGroundItemsMessageList = null;
  }
  if (/\b(?:staircase|stairs?|ladder)\b/i.test(raw)) return [];
  if (!/\byou see here\b/i.test(raw) && !/\bthere (?:is|are) (?:several|many|a|an|some)\b.*\bhere\b/i.test(raw)) return [];
  return [raw.replace(/^.*?\b(?:you see here|there (?:is|are))\b[:\s]*/i, '').replace(/\bhere\b[.!?]*$/i, '').replace(/[.!?]+$/g, '').trim()].filter(Boolean);
}

function droppedGroundItemTextFromMessage(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/^You drop\s+(.+?)[.!?]?$/i);
  return match?.[1]?.trim() || '';
}

function isVisibleLockedContainerMessage(text = '') {
  const raw = String(text || '').trim();
  if (!/\blocked\b/i.test(raw)) return false;
  if (/\bdoor\b/i.test(raw) && !/\b(?:chest|box|large box|ice box|bag|sack|container)\b/i.test(raw)) return false;
  if (/\b(?:chest|box|large box|ice box|bag|sack|container)\b/i.test(raw)) return /\b(?:turns? out to be locked|is locked|locked\b)/i.test(raw);
  return containerUnlockContinuationIsCurrent?.() && pendingContainerUnlockOpen?.phase === 'open-requested' && /\b(?:it|this|that)\b.*\blocked\b/i.test(raw);
}

function lockedContainerVisibleGroundText() {
  const existing = groundItemTextsHere().find((text) => /\b(?:chest|box|large box|ice box|bag|sack|container)\b/i.test(String(text || '')));
  const cell = currentCell();
  const semantic = String(cell?.objectLayerSemanticName || cell?.backgroundSemanticName || cell?.semanticName || '').trim();
  const label = currentGroundContainerActionLabel();
  const source = existing || semantic || label;
  const lower = String(source || '').toLowerCase();
  const noun = /large box/.test(lower) ? 'large box'
    : /ice box/.test(lower) ? 'ice box'
    : /chest/.test(lower) ? 'chest'
    : /box/.test(lower) ? 'box'
    : /sack/.test(lower) ? 'sack'
    : /bag/.test(lower) ? 'bag'
    : 'container';
  return `a locked ${noun}`;
}

function maybeRememberVisibleLockedContainerMessage(text = '') {
  if (!isVisibleLockedContainerMessage(text)) return false;
  if (!currentGroundLooksLikeContainer()) return false;
  rememberGroundItemsHere('message', [lockedContainerVisibleGroundText()]);
  renderContextActionBar();
  diagnosticEvent('state', 'ground-pile.visible-locked-container-message', { coord: groundPileCoordHere(), source: 'visible-message' });
  return true;
}

function groundPileCoordHere() {
  return { x: Number(gameViewSnapshot.cursor.x) || 0, y: Number(gameViewSnapshot.cursor.y) || 0 };
}

function groundPileAtCoord(coord = groundPileCoordHere()) {
  return sharedModules.groundPileSnapshotAdapter?.groundPileAt ? sharedModules.groundPileSnapshotAdapter.groundPileAt(gameViewSnapshot.groundPiles, coord) : null;
}

function applyPublicGroundPileSnapshot(items = [], source = { layer: 'renderer' }, coord = groundPileCoordHere()) {
  const adapter = sharedModules.groundPileSnapshotAdapter;
  if (!adapter?.normalizeGroundPileSnapshotPayload || !adapter?.applyGroundPileSnapshot) return null;
  const previousPile = groundPileAtCoord(coord);
  const revision = (gameViewSnapshot.groundPiles?.revision || 0) + 1;
  const payload = adapter.normalizeGroundPileSnapshotPayload({ revision, coord, items });
  const event = adapter.createGroundPileSnapshotEvent(payload, { sequence: Date.now() % Number.MAX_SAFE_INTEGER, source });
  const checked = sharedModules.uiProtocolV2?.validateEventEnvelope ? sharedModules.uiProtocolV2.validateEventEnvelope(event) : { ok: true, errors: [] };
  if (!checked.ok) {
    diagnosticEvent('state', 'ground-pile.snapshot.rejected', { errors: checked.errors.slice(), source, coord });
    return null;
  }
  const result = gameView.process(event);
  refreshGameViewPresentation();
  applyGameViewEffects(result.effects);
  refreshGameViewPresentation();
  const nextPile = groundPileAtCoord(coord);
  const delta = adapter.groundPileDelta ? adapter.groundPileDelta(previousPile, nextPile) : null;
  diagnosticEvent('state', 'ground-pile.snapshot.accepted', { revision: payload.revision, coord: payload.coord, itemCount: payload.items.length, delta, sourcePath: 'shared-game-view-state' });
  return { snapshot: nextPile, event, delta };
}

function rememberGroundPileFromVisibleRows(rows = [], source = { layer: 'renderer' }, coord = groundPileCoordHere()) {
  const adapter = sharedModules.groundPileSnapshotAdapter;
  const items = adapter?.rowsToGroundItems ? adapter.rowsToGroundItems(rows) : rows;
  return applyPublicGroundPileSnapshot(mergeVisibleGroundItemsWithExistingPublicIds(items, coord, { complete: true }), source, coord);
}

function normalizedGroundIdentityName(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/\bcontaining\s+\d+\s+items?\b/g, ' ')
    .replace(/\b(?:locked|trapped|broken|unlocked|empty)\b/g, ' ')
    .replace(/^\s*\d+\s+/, '')
    .replace(/^\s*(?:a|an|the|some)\s+/, '')
    .replace(/[^a-z0-9$]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeVisibleGroundItemsWithExistingPublicIds(items = [], coord = groundPileCoordHere(), { complete = true } = {}) {
  const existingItems = groundPileAtCoord(coord)?.items || [];
  if (!existingItems.length) return items;
  const byName = new Map();
  const ambiguousNames = new Set();
  for (const existing of existingItems) {
    const key = normalizedGroundIdentityName(existing.displayName || existing.text || existing.semanticName || existing.semanticAppearance || '');
    if (!key) continue;
    if (byName.has(key)) ambiguousNames.add(key);
    else byName.set(key, existing);
  }
  const identifiedItems = items.map((item) => {
    if (Number.isInteger(item?.objectId) && item.objectId > 0) return item;
    const key = normalizedGroundIdentityName(item?.displayName || item?.text || item?.semanticName || item?.semanticAppearance || '');
    const existing = ambiguousNames.has(key) ? null : byName.get(key);
    return existing && Number.isInteger(existing.objectId) && existing.objectId > 0 ? { ...existing, ...item, objectId: existing.objectId } : item;
  });
  const adapter = sharedModules.groundPileSnapshotAdapter;
  return adapter?.reconcileGroundPileObservation && adapter?.visibleTextObservation
    ? adapter.reconcileGroundPileObservation(existingItems, adapter.visibleTextObservation(identifiedItems), { complete })
    : identifiedItems;
}

function rememberGroundPileFromVisibleTexts(texts = [], source = { layer: 'renderer' }, coord = groundPileCoordHere(), { merge = false } = {}) {
  if (gameViewSnapshot.transferTransactions?.activeSessionId) return null;
  const adapter = sharedModules.groundPileSnapshotAdapter;
  if (!adapter) return null;
  const incoming = adapter.textLinesToGroundItems ? adapter.textLinesToGroundItems(texts) : texts.map((text) => ({ displayName: String(text || ''), location: { kind: 'ground' } }));
  return applyPublicGroundPileSnapshot(mergeVisibleGroundItemsWithExistingPublicIds(incoming, coord, { complete: !merge }), source, coord);
}

function containerSnapshotIdentity() {
  const sessionContainer = transferSession.snapshot().container || {};
  const displayName = sessionContainer.displayName || containerDisplayName(gameViewSnapshot.currentMenu);
  const groundContainer = groundSnapshotItemsHere().find((item) => Array.isArray(item.actionAffordances) && item.actionAffordances.includes('container')) || null;
  const snapshotSession = gameViewSnapshot.containerContents?.activeSessionId ? sharedModules.containerContentsSnapshotAdapter?.containerContentsAt?.(gameViewSnapshot.containerContents, gameViewSnapshot.containerContents.activeSessionId) : null;
  const objectId = Number.isInteger(snapshotSession?.container?.objectId) ? snapshotSession.container.objectId : (Number.isInteger(sessionContainer.objectId) ? sessionContainer.objectId : (Number.isInteger(groundContainer?.objectId) ? groundContainer.objectId : undefined));
  const publicId = objectId != null ? `container-${objectId}` : (String(sessionContainer.publicId || displayName || 'container').toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-') || 'container');
  const publicSource = snapshotSession?.container || sessionContainer || groundContainer || {};
  return {
    publicId,
    displayName,
    ...(objectId != null ? { objectId } : {}),
    semanticKnown: publicSource.semanticKnown === true || publicSource.known?.identity === true,
    known: { ...(publicSource.known || {}), identity: publicSource.semanticKnown === true || publicSource.known?.identity === true, appearance: true },
    ...(publicSource.semanticAppearance ? { semanticAppearance: publicSource.semanticAppearance } : {}),
  };
}

function containerContentsSnapshotForSession(sessionId = transferPresentation?.transferSessionId || gameViewSnapshot.containerContents?.activeSessionId) {
  return sharedModules.containerContentsSnapshotAdapter?.containerContentsAt ? sharedModules.containerContentsSnapshotAdapter.containerContentsAt(gameViewSnapshot.containerContents, sessionId) : null;
}

function processPublicContainerEvent(event) {
  const adapter = sharedModules.containerContentsSnapshotAdapter;
  if (!adapter || !event) return null;
  const checked = sharedModules.uiProtocolV2?.validateEventEnvelope ? sharedModules.uiProtocolV2.validateEventEnvelope(event) : { ok: true, errors: [] };
  if (!checked.ok) {
    diagnosticEvent('state', 'container-contents.snapshot.rejected', { errors: checked.errors.slice(), eventType: event.eventType });
    return null;
  }
  const result = gameView.process(event);
  refreshGameViewPresentation();
  applyGameViewEffects(result.effects);
  refreshGameViewPresentation();
  return result;
}

function ensurePublicContainerSnapshotSession() {
  const adapter = sharedModules.containerContentsSnapshotAdapter;
  if (!adapter?.createContainerSessionEvent || !transferPresentation?.active || transferPresentation.sessionKind !== 'container') return null;
  const sessionId = transferSession.snapshot().sessionId;
  if (!sessionId) return null;
  const existing = gameViewSnapshot.containerContents?.sessionsById?.get?.(sessionId);
  if (existing?.status === 'active') return existing;
  const session = { sessionId, container: containerSnapshotIdentity() };
  const event = adapter.createContainerSessionEvent('container.session.opened', session, { sequence: Date.now() % Number.MAX_SAFE_INTEGER, source: { layer: 'renderer' } });
  processPublicContainerEvent(event);
  return gameViewSnapshot.containerContents?.sessionsById?.get?.(session.sessionId) || null;
}

function closePublicContainerSnapshotSession(reason = 'container transfer panel closed') {
  const adapter = sharedModules.containerContentsSnapshotAdapter;
  const sessionId = transferPresentation?.transferSessionId || gameViewSnapshot.containerContents?.activeSessionId;
  if (!adapter?.createContainerSessionEvent || !sessionId) return;
  const event = adapter.createContainerSessionEvent('container.session.closed', { sessionId, container: containerSnapshotIdentity(), reason }, { sequence: Date.now() % Number.MAX_SAFE_INTEGER, source: { layer: 'renderer' }, reason });
  processPublicContainerEvent(event);
}

function rememberContainerContentsFromVisibleRows(rows = [], source = { layer: 'renderer' }) {
  const adapter = sharedModules.containerContentsSnapshotAdapter;
  if (!adapter?.rowsToContainerItems || !adapter?.createContainerContentsSnapshotEvent || !transferPresentation?.active || transferPresentation.sessionKind !== 'container') return null;
  ensurePublicContainerSnapshotSession();
  const sessionId = transferSession.snapshot().sessionId || gameViewSnapshot.containerContents?.activeSessionId || '';
  if (!sessionId) return null;
  const previous = containerContentsSnapshotForSession(sessionId);
  const revision = (previous?.revision || 0) + 1;
  const payload = adapter.normalizeContainerContentsSnapshotPayload({ revision, sessionId, container: containerSnapshotIdentity(), items: adapter.rowsToContainerItems(rows) });
  const event = adapter.createContainerContentsSnapshotEvent(payload, { sequence: Date.now() % Number.MAX_SAFE_INTEGER, source });
  processPublicContainerEvent(event);
  const next = containerContentsSnapshotForSession(sessionId);
  const delta = adapter.containerContentsDelta ? adapter.containerContentsDelta(previous, next) : null;
  diagnosticEvent('state', 'container-contents.snapshot.accepted', { revision: payload.revision, sessionId, itemCount: payload.items.length, delta, sourcePath: 'shared-game-view-state' });
  return { snapshot: next, event, delta };
}

function isEdibleGroundItemText(text) {
  return /\b(?:corpse|food ration|ration|cram ration|K-ration|C-ration|lembas|melon|apple|orange|pear|banana|carrot|tripe ration|cream pie|candy bar|fortune cookie|pancake|egg|tin|lizard|glob)\b/i.test(String(text || ''));
}

function rememberGroundItemsHere(source, texts = []) {
  const items = texts.map((value) => String(value || '').trim()).filter(Boolean);
  groundItemsHint = {
    x: gameViewSnapshot.cursor.x,
    y: gameViewSnapshot.cursor.y,
    source,
    at: Date.now(),
    items,
  };
  // A single public message/text-window line is a partial observation.  Merge
  // it into the authoritative pile instead of replacing sibling rows and their
  // stable object IDs while the rest of the window is still streaming.
  if (items.length) rememberGroundPileFromVisibleTexts(items, { layer: 'renderer' }, groundPileCoordHere(), { merge: true });
}

function rememberMonsterSenseMessage(text) {
  if (/\bYou sense the presence of monsters\./i.test(String(text || '').trim())) {
    lastMonsterSenseMessageAt = Date.now();
    pendingMonsterSenseFarlookTipSuppression = true;
  }
}

function appendMessage(text, { allowConsecutiveDuplicate = false, logPrompt = true, alreadyPublished = false, appended: publishedAppendResult } = {}) {
  const normalized = String(text || '').trim();
  let appended = Boolean(alreadyPublished && publishedAppendResult !== false);
  if (!alreadyPublished && normalized) {
    const result = publishRendererGameViewEvent({ name: 'renderer_publish_message', text: normalized, allowConsecutiveDuplicate, logPrompt });
    appended = Boolean((result?.effects || []).some((item) => item.type === 'message-published' && item.appended));
  }
  const suppressionReason = appended ? '' : (sharedModules.messageLog?.isGenericDirectionPromptMessage?.(normalized) && logPrompt === false ? 'generic-direction-prompt' : (!normalized ? 'blank' : 'duplicate'));
  diagnosticEvent('message', appended ? 'message.visible.appended' : 'message.visible.suppressed', {
    rawText: String(text || ''),
    displayText: normalized,
    logPrompt: logPrompt !== false,
    allowConsecutiveDuplicate,
    suppressionReason,
    messageIndex: appended ? gameViewSnapshot.messages.length : null,
    historyLength: gameViewSnapshot.messages.length,
  });
  if (!appended) return false;
  if (maybeRememberPlayerCharacterFromMessage(normalized)) renderGameGrid({ full: true });
  rememberMonsterSenseMessage(normalized);
  const groundTexts = groundItemTextsFromMessage(normalized);
  if (groundTexts.length) rememberGroundItemsHere('message', groundTexts);
  else maybeRememberVisibleLockedContainerMessage(normalized);
  const droppedGroundText = droppedGroundItemTextFromMessage(normalized);
  if (droppedGroundText) rememberGroundPileFromVisibleTexts([droppedGroundText], { layer: 'renderer' }, groundPileCoordHere(), { merge: true });
  clearGroundItemsHintForDestroyedContainerMessage(normalized);
  maybeFinishEmptyContainerPaneFromMessage(normalized);
  maybeShowContextualPrompt(normalized);
  uxOnboarding?.observe?.({ type: 'consequence-visible', confirmed: true });
  return true;
}


function dismissContextualPrompt() {
  activeContextualPrompt = null;
  hideDirectionHelper();
  closeInteractionDialog();
  renderPromptPanel();
  gameGrid.focus();
}

function kickDirectionFromContext(direction = activeContextualPrompt?.direction || lastDirectionKey) {
  sendPlayableKey('\u0004');
  if (direction && /^[hjklyubn]$/.test(direction)) window.setTimeout(() => sendPlayableKey(direction), 40);
  else appendMessage('Kick: choose the direction when NetHack asks.');
}

function kickLockedDoorFromContext() {
  const direction = activeContextualPrompt?.direction || lastDirectionKey;
  activeContextualPrompt = null;
  hideDirectionHelper();
  closeInteractionDialog();
  kickDirectionFromContext(direction);
  gameGrid.focus();
}

function commandThenDirection(commandKey, direction, label) {
  activeContextualPrompt = null;
  closeInteractionDialog();
  hideDirectionHelper();
  sendPlayableKey(commandKey);
  if (direction && /^[hjklyubn.]$/.test(direction)) window.setTimeout(() => sendPlayableKey(direction), 40);
  else if (label) appendMessage(`${label}: choose a direction when NetHack asks.`);
  gameGrid.focus({ preventScroll: true });
}

function sendTravelToCell(cellEl) {
  const path = mapTargetPathFromCursor(cellEl);
  if (!path) return;
  const x = cellEl.dataset.mapX;
  const y = cellEl.dataset.mapY;
  activeContextualPrompt = null;
  closeInteractionDialog();
  sendPlayableKey('_');
  window.setTimeout(() => sendPlayableText(`${path}.`), 40);
  appendMessage('Travel target selected.');
  gameGrid.focus({ preventScroll: true });
}

function unlockDoorWithInventoryTool(tool = {}, direction = '') {
  const selector = selectorForInventoryItem(tool);
  if (!selector) return;
  const label = publicInventoryItemLabel(tool);
  activeContextualPrompt = null;
  closeInteractionDialog();
  hideDirectionHelper();
  sendPlayableKey('a');
  window.setTimeout(() => sendPlayableText(selector), 60);
  if (direction && /^[hjklyubn]$/.test(direction)) window.setTimeout(() => sendPlayableKey(direction), 120);
  else appendMessage(`Unlock with ${label}: choose the door direction when NetHack asks.`);
  gameGrid.focus({ preventScroll: true });
}

function showLockedDoorPrompt(message) {
  if (!userSettings.contextualMenus || gameViewSnapshot.activePrompt || gameViewSnapshot.currentMenu?.awaitingSelection || interactionDialog.open || introDialog.open) return;
  const direction = lastDirectionKey;
  const directionLabel = direction ? (contextDirectionLabels.get(direction) || direction.toUpperCase()) : '';
  const tools = availableLockTools().map((tool) => ({ selector: selectorForInventoryItem(tool), label: publicInventoryItemLabel(tool) })).filter((tool) => tool.selector);
  activeContextualPrompt = { kind: 'locked-door', message, direction, directionLabel, tools };
  promptPanel.textContent = direction ? `Door is locked to the ${directionLabel}; choose an action from the visible sheet.` : 'Door is locked; choose an action from the visible sheet.';
  hideDirectionHelper();
  renderPromptPanel();
}

function renderContextualPrompt(contextDialog) {
  const context = activeContextualPrompt || {};
  const direction = context.direction || '';
  const options = contextDialog.options.map((option) => ({
    ...option,
    key: '',
    className: `context-choice${option.primary ? ' primary-context' : ''}`,
    onClick: () => {
      if (option.id.startsWith('unlock:')) {
        const tool = availableLockTools().find((candidate) => selectorForInventoryItem(candidate) === option.toolSelector);
        if (tool) unlockDoorWithInventoryTool(tool, direction);
        return;
      }
      if (option.id === 'kick') kickLockedDoorFromContext();
      else if (option.id === 'search') {
        activeContextualPrompt = null;
        closeInteractionDialog();
        sendPlayableKey('s');
        gameGrid.focus({ preventScroll: true });
      } else if (option.id === 'close' || option.id === 'map.ignore') dismissContextualPrompt();
      else if (option.id === 'map.pickup') {
        activeContextualPrompt = null;
        closeInteractionDialog();
        if (!openGroundTransferPanelFromSnapshot('map context')) setStatus('Ground panel needs a public ground snapshot before direct transfer; no pickup menu fallback was sent.');
        gameGrid.focus({ preventScroll: true });
      } else if (option.id === 'map.walk') {
        activeContextualPrompt = null;
        closeInteractionDialog();
        sendMovementCommand(direction);
      } else if (option.id === 'map.open') commandThenDirection('o', direction, 'Open');
      else if (option.id === 'map.close') commandThenDirection('c', direction, 'Close');
      else if (option.id === 'map.kick') {
        activeContextualPrompt = null;
        closeInteractionDialog();
        kickDirectionFromContext(direction);
        gameGrid.focus({ preventScroll: true });
      } else if (option.id === 'map.travel') {
        const cell = gameGrid.querySelector(`.tile-cell[data-map-x="${context.x}"][data-map-y="${context.y}"]`);
        if (cell) sendTravelToCell(cell);
      }
    },
  }));
  const dialogClass = contextDialog.kind === 'map-cell' ? 'context-dialog map-context-dialog' : 'context-dialog locked-door-dialog';
  showInteractionDialog({ title: contextDialog.title, prompt: contextDialog.prompt, dialogClass, cancelText: 'Close', closeKind: 'close', family: contextDialog.family, options });
}

function maybeShowContextualPrompt(text) {
  if (sharedModules.interactionModel.isLockedDoorMessage(text)) showLockedDoorPrompt(text);
  renderContextActionBar();
}

const contextDirectionLabels = new Map([
  ['y', 'northwest'], ['k', 'north'], ['u', 'northeast'],
  ['h', 'west'], ['l', 'east'],
  ['b', 'southwest'], ['j', 'south'], ['n', 'southeast'],
]);

function directionLabel(key) {
  return contextDirectionLabels.get(key) || String(key || '').toUpperCase();
}

function currentCell() {
  return gameViewSnapshot.mapCells[gameViewSnapshot.cursor.y]?.[gameViewSnapshot.cursor.x] || { ch: ' ' };
}

function cellFeatureGlyph(cell) {
  const normalized = normalizeCell(cell);
  return normalized.backgroundGlyph || normalized.ch || ' ';
}

function cellTextSignature(cell) {
  const normalized = normalizeCell(cell);
  const semanticDisplay = publicSemanticNameForCell(normalized);
  const objectLayerDisplay = publicObjectLayerSemanticNameForCell(normalized);
  return `${normalized.ch || ''} ${normalized.backgroundGlyph || ''} ${normalized.semanticKind || ''} ${semanticDisplay || ''} ${normalized.backgroundSemanticKind || ''} ${normalized.backgroundSemanticName || ''} ${normalized.objectLayerChar || ''} ${normalized.objectLayerSemanticKind || ''} ${objectLayerDisplay || ''} ${mappedAssetIdForCell(normalized) || ''} ${(normalized.actionAffordances || []).join(' ')} ${(normalized.backgroundActionAffordances || []).join(' ')} ${(normalized.objectLayerActionAffordances || []).join(' ')}`.toLowerCase();
}

function recentMessagesMatch(pattern) {
  return gameViewSnapshot.messages.slice(-8).some((line) => pattern.test(String(line || '')));
}

function currentCellHasVisibleGroundObject() {
  const cell = normalizeCell(currentCell());
  const signature = cellTextSignature(cell);
  return cellFeatureGlyph(cell) === '%' || /\b(?:object|food|corpse|item)\b/.test(signature);
}

function groundSnapshotHere() {
  return groundPileAtCoord(groundPileCoordHere());
}

function groundSnapshotItemsHere() {
  return (groundSnapshotHere()?.items || []).filter((item) => item && String(item.displayName || item.text || '').trim());
}

function groundSnapshotAffordancesHere() {
  const tokens = new Set();
  for (const item of groundSnapshotItemsHere()) {
    for (const token of (Array.isArray(item.actionAffordances) ? item.actionAffordances : [])) {
      if (typeof token === 'string' && token.trim()) tokens.add(token.trim());
    }
  }
  return tokens;
}

function groundSnapshotHasAffordanceHere(token) {
  return groundSnapshotAffordancesHere().has(token);
}

function hasKnownGroundItemsHere() {
  const snapshot = groundSnapshotHere();
  if (snapshot) return groundSnapshotItemsHere().length > 0;
  return Boolean((groundItemsHint && groundItemsHint.x === gameViewSnapshot.cursor.x && groundItemsHint.y === gameViewSnapshot.cursor.y) || currentCellHasVisibleGroundObject());
}

function dedupeGroundTexts(texts = []) {
  const seen = new Set();
  const out = [];
  for (const text of texts) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function groundItemTextsHere() {
  if (!hasKnownGroundItemsHere()) return [];
  const snapshot = groundSnapshotHere();
  const snapshotTexts = groundSnapshotItemsHere().map((item) => item.displayName || item.text || '');
  const hintTexts = Array.isArray(groundItemsHint?.items) ? groundItemsHint.items : [];
  // Authoritative public snapshots intentionally omit hidden lock/trap tokens,
  // but the player may have just seen visible prose such as "trapped locked
  // large box".  Preserve that visible text alongside the snapshot so action
  // exposure can be sourced to public messages without adding hidden tokens.
  if (snapshot) return dedupeGroundTexts([...snapshotTexts, ...hintTexts]);
  const menuTexts = gameViewSnapshot.currentMenu?.suppressPicker && sharedModules.interactionModel.isGroundLookMenu(gameViewSnapshot.currentMenu) ? gameViewSnapshot.currentMenu.items.map((item) => `${item.text || ''} ${menuItemSemanticDisplayName(item) || ''}`.trim()) : [];
  const cell = normalizeCell(currentCell());
  const semanticDisplay = publicSemanticNameForCell(cell);
  const objectLayerDisplay = publicObjectLayerSemanticNameForCell(cell);
  const cellTexts = [semanticDisplay, objectLayerDisplay, mappedAssetIdForCell(cell)].filter(Boolean);
  return dedupeGroundTexts([...hintTexts, ...menuTexts, ...cellTexts]);
}

function redactHiddenContainerGroundText(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!/\b(?:locked|trapped|broken)\b|\bcontaining\s+\d+\s+items?\b/i.test(value)) return value;
  if (/\blarge box\b/i.test(value)) return 'a large box';
  if (/\bice box\b/i.test(value)) return 'an ice box';
  if (/\bchest\b/i.test(value)) return 'a chest';
  if (/\bbox\b/i.test(value)) return 'a box';
  if (/\bsack\b/i.test(value)) return 'a sack';
  if (/\bbag\b/i.test(value)) return 'a bag';
  if (/\bcontainer\b/i.test(value)) return 'a container';
  return value;
}

function publicGroundItemTextsHere() {
  return dedupeGroundTexts(groundItemTextsHere().map(redactHiddenContainerGroundText));
}

function visibleMessageGroundTextDetailsHere() {
  if (!groundItemsHint || groundItemsHint.x !== gameViewSnapshot.cursor.x || groundItemsHint.y !== gameViewSnapshot.cursor.y || !Array.isArray(groundItemsHint.items)) return [];
  return groundItemsHint.items.map((text) => ({ text: String(text || ''), source: groundItemsHint.source === 'message' ? 'visible-message' : String(groundItemsHint.source || 'unknown') }));
}

function edibleGroundContextHere() {
  const texts = groundItemTextsHere();
  if (!texts.some(isEdibleGroundItemText)) return null;
  const joined = texts.join(' ');
  return { label: /corpse/i.test(joined) ? 'Eat corpse' : 'Eat food', texts };
}

function terrainAtPlayerMatches(pattern) {
  const terrain = `${statusValue(25) || ''} ${cellTextSignature(currentCell())}`;
  return pattern.test(terrain);
}

function currentStairDirection() {
  const cell = normalizeCell(currentCell());
  const stairText = [
    cell.semanticKind === 'stairs' ? cell.semanticKind : '',
    cell.backgroundSemanticKind === 'stairs' ? cell.backgroundSemanticKind : '',
    cell.semanticName || '',
    cell.backgroundSemanticName || '',
    ...(Array.isArray(cell.actionAffordances) ? cell.actionAffordances : []),
    ...(Array.isArray(cell.backgroundActionAffordances) ? cell.backgroundActionAffordances : []),
  ].join(' ').toLowerCase();
  if (!/\bstairs?\b|\bstaircase\b|\bstairs?[- ]|\bladder\b/.test(stairText)) return '';
  if (/\bladder\b/.test(stairText) && /\bdown\b|down-ladder|ladder down/.test(stairText)) return 'ladder-down';
  if (/\bladder\b/.test(stairText) && /\bup\b|up-ladder|ladder up/.test(stairText)) return 'ladder-up';
  if (/\bdown\b|down-stairs|staircase down|branch staircase down/.test(stairText)) return 'down';
  if (/\bup\b|up-stairs|staircase up|branch staircase up/.test(stairText)) return 'up';
  return '';
}

function dipTerrainLabelFromPublicText(text = '') {
  if (/fountain/i.test(text)) return 'fountain';
  if (/sink/i.test(text)) return 'sink';
  if (/\b(?:pool|moat|water)\b/i.test(text)) return 'water';
  if (/lava/i.test(text)) return 'lava';
  return '';
}

function currentDipTerrainTargetLabel() {
  const terrain = `${statusValue(25) || ''} ${cellTextSignature(currentCell())}`;
  return dipTerrainLabelFromPublicText(terrain) || publicTerrainLabelsByCoord.get(`${gameViewSnapshot.cursor.x},${gameViewSnapshot.cursor.y}`) || '';
}

function updatePublicTerrainLabelCache({ force = false } = {}) {
  if (!force && !publicTerrainLabelsDirty) return;
  publicTerrainLabelsByCoord.clear();
  for (let y = 0; y < gameViewSnapshot.mapCells.length; y += 1) {
    for (let x = 0; x < (gameViewSnapshot.mapCells[y] || []).length; x += 1) {
      const cell = normalizeCell(gameViewSnapshot.mapCells[y][x]);
      const label = dipTerrainLabelFromPublicText(cellTextSignature(cell));
      if (label) publicTerrainLabelsByCoord.set(`${x},${y}`, label);
    }
  }
  publicTerrainLabelsDirty = false;
}

function cellHasAffordance(cell, name) {
  const normalized = normalizeCell(cell);
  return normalized.actionAffordances?.includes(name) || normalized.backgroundActionAffordances?.includes(name) || normalized.objectLayerActionAffordances?.includes(name) || cellTextSignature(normalized).includes(name);
}

function cellLooksLikeContainer(cell) {
  const signature = cellTextSignature(cell);
  return /\b(?:container|chest|box|large box|ice box|sack|bag)\b/.test(signature) || cellHasAffordance(cell, 'container');
}

function groundSnapshotLooksLikeContainerHere() {
  // Public ground snapshots may say that an object is container-like, but must
  // not leak hidden locked/trapped/broken state as action tokens.  Lock/trap
  // affordances come only from player-visible text or dedicated prompt state.
  return groundSnapshotHasAffordanceHere('container');
}

function groundTextsContainContainer(texts = []) {
  return texts.some((text) => /\b(?:container|chest|box|large box|ice box|sack|bag)\b/i.test(String(text || '')));
}

function currentMapCellHasVisibleNonContainerGroundObject() {
  const rawCell = currentCell() || {};
  const rawObjectText = `${rawCell.objectLayerSemanticKind || ''} ${rawCell.objectLayerSemanticName || ''} ${rawCell.objectLayerSemanticAppearance || ''} ${(rawCell.objectLayerActionAffordances || []).join(' ')}`;
  if (/\bobject\b/i.test(rawObjectText) && !/\b(?:container|chest|box|large box|ice box|sack|bag)\b/i.test(rawObjectText)) return true;
  return currentCellHasVisibleGroundObject() && !cellLooksLikeContainer(rawCell);
}

function reconcileGroundItemsHintWithCurrentMap() {
  if (!groundItemsHint || groundItemsHint.x !== gameViewSnapshot.cursor.x || groundItemsHint.y !== gameViewSnapshot.cursor.y) return;
  if (!groundTextsContainContainer(groundItemsHint.items)) return;
  if (currentMapCellHasVisibleNonContainerGroundObject()) groundItemsHint = null;
}

function clearGroundItemsHintForDestroyedContainerMessage(text = '') {
  if (!groundItemsHint || groundItemsHint.x !== gameViewSnapshot.cursor.x || groundItemsHint.y !== gameViewSnapshot.cursor.y) return;
  if (!groundTextsContainContainer(groundItemsHint.items)) return;
  if (/\b(?:totally destroyed|destroy(?:ed)?|shatter(?:ed)?|smash(?:ed)?)\b.*\b(?:container|chest|box|large box|ice box)\b/i.test(String(text || ''))) groundItemsHint = null;
}

function currentGroundLooksLikeContainer() {
  const groundText = groundItemTextsHere().join(' ');
  if (groundSnapshotHere()) return groundSnapshotLooksLikeContainerHere() || /\b(?:container|chest|box|large box|ice box|sack|bag)\b/i.test(groundText);
  if (currentMapCellHasVisibleNonContainerGroundObject()) return false;
  return cellLooksLikeContainer(currentCell()) || /\b(?:container|chest|box|large box|ice box|sack|bag)\b/i.test(groundText);
}

function currentGroundHasLockedContainer() {
  const groundText = groundItemTextsHere().join(' ');
  if (groundSnapshotHere()) return /\blocked\b/i.test(groundText);
  const signature = cellTextSignature(currentCell());
  return /\blocked\b/i.test(`${signature} ${groundText}`);
}

function currentGroundHasTrappedContainer() {
  const groundText = groundItemTextsHere().join(' ');
  if (groundSnapshotHere()) return /\btrapped\b/i.test(groundText);
  const signature = cellTextSignature(currentCell());
  return /\btrapped\b/i.test(`${signature} ${groundText}`);
}

function currentGroundContainerActionLabel() {
  const text = groundSnapshotHere() ? groundItemTextsHere().join(' ') : `${cellTextSignature(currentCell())} ${groundItemTextsHere().join(' ')}`;
  if (/\bchest\b/i.test(text)) return 'Open chest';
  if (/\b(?:box|large box|ice box)\b/i.test(text)) return 'Open box';
  if (/\b(?:bag|sack)\b/i.test(text)) return 'Loot bag';
  return 'Loot container';
}

function currentGroundContainerTargetText() {
  const text = groundSnapshotHere() ? groundItemTextsHere().join(' ') : `${cellTextSignature(currentCell())} ${groundItemTextsHere().join(' ')}`;
  if (/\blarge box\b/i.test(text)) return 'large box';
  if (/\bice box\b/i.test(text)) return 'ice box';
  if (/\bchest\b/i.test(text)) return 'chest';
  if (/\bbox\b/i.test(text)) return 'box';
  if (/\bsack\b/i.test(text)) return 'sack';
  if (/\bbag\b/i.test(text)) return 'bag';
  if (/\bcontainer\b/i.test(text)) return 'container';
  return '';
}

function currentGroundContainerItemForDirectOpen(item = {}) {
  if (Number.isInteger(item?.objectId) && item.objectId > 0) return item;
  return groundSnapshotItemsHere().find((entry) => Number.isInteger(entry?.objectId) && entry.objectId > 0 && Array.isArray(entry.actionAffordances) && entry.actionAffordances.includes('container')) || item || {};
}

function currentGroundContainerDirectOpenItem(item = {}) {
  const candidate = currentGroundContainerItemForDirectOpen(item);
  return Number.isInteger(candidate?.objectId) && candidate.objectId > 0 ? candidate : null;
}


function armContainerUnlockContinuation(action, item = {}) {
  if (action?.id !== 'open-container') return;
  const containerItem = currentGroundContainerItemForDirectOpen(item);
  pendingContainerUnlockOpen = { phase: 'open-requested', x: gameViewSnapshot.cursor.x, y: gameViewSnapshot.cursor.y, armedAt: performance.now(), action: { ...action }, item: { ...containerItem } };
}

function containerUnlockContinuationIsCurrent(maxAgeMs = 12000) {
  if (!pendingContainerUnlockOpen) return false;
  if (pendingContainerUnlockOpen.x !== gameViewSnapshot.cursor.x || pendingContainerUnlockOpen.y !== gameViewSnapshot.cursor.y) {
    pendingContainerUnlockOpen = null;
    return false;
  }
  const effectiveMaxAgeMs = pendingContainerUnlockOpen.phase === 'awaiting-unlock-result' ? Math.max(maxAgeMs, 120000) : maxAgeMs;
  const age = performance.now() - (pendingContainerUnlockOpen.armedAt || pendingContainerUnlockOpen.answeredAt || 0);
  if (age > effectiveMaxAgeMs) {
    pendingContainerUnlockOpen = null;
    return false;
  }
  return true;
}

function containerUnlockTargetIsCurrent() {
  if (!containerUnlockContinuationIsCurrent()) return false;
  const expectedObjectId = Number(pendingContainerUnlockOpen.item?.objectId);
  if (!Number.isInteger(expectedObjectId) || expectedObjectId <= 0) return false;
  return groundSnapshotItemsHere().some((item) => Number(item?.objectId) === expectedObjectId);
}

function clearContainerUnlockContinuation() {
  pendingContainerUnlockOpen = null;
}

function isContainerUnlockPrompt(query = '') {
  const value = String(query || '');
  return /unlock/i.test(value) && (/(?:box|chest|container|large box|ice box|bag|sack)/i.test(value) || (pendingContainerUnlockOpen && /\bit\b/i.test(value)));
}

function noteContainerUnlockAnswer(text = '') {
  if (!containerUnlockContinuationIsCurrent() || !gameViewSnapshot.activePrompt || gameViewSnapshot.activePrompt.kind !== 'question' || !isContainerUnlockPrompt(gameViewSnapshot.activePrompt.query)) return;
  const answer = String(text || '').trim().charAt(0).toLowerCase();
  if (answer === 'y') pendingContainerUnlockOpen = { ...pendingContainerUnlockOpen, phase: 'awaiting-unlock-result', answeredAt: performance.now(), query: gameViewSnapshot.activePrompt.query };
  else if (answer === 'n' || answer === 'q' || answer === '\u001b') pendingContainerUnlockOpen = null;
}

function publicInventoryItemLabel(item = {}) {
  return cleanEquipmentText(item.displayName || item.text || item.semanticName || item.semanticAppearance || 'item')
    .replace(/^\s*[A-Za-z$]\s*[-+]\s*/i, '')
    .replace(/^\s*(?:a|an|the)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function availableLockTools() {
  return (gameViewSnapshot.inventory?.orderedItems || []).filter((item) => {
    if (!selectorForInventoryItem(item)) return false;
    const label = publicInventoryItemLabel(item);
    const appearance = cleanEquipmentText(item.semanticAppearance || '').trim();
    const publicClass = String(item.publicClass || '').trim().toLowerCase();
    const affordances = Array.isArray(item.actionAffordances) ? item.actionAffordances : [];
    const isPublicTool = publicClass === 'tool' || item.objectClass === '(' || affordances.includes('apply');
    if (!isPublicTool) return false;
    return /\b(?:skeleton key|lock pick|credit card)\b/i.test(label)
      || /^(?:key|lock pick|credit card)$/i.test(appearance)
      || /^key$/i.test(label);
  });
}

function wieldedContainerForceItem() {
  const mainHand = (gameViewSnapshot.equipment?.orderedSlots || []).find((slot) => slot?.slotId === 'mainHand' && slot?.item);
  if (!mainHand?.item) return null;
  const item = mainHand.item;
  const label = publicInventoryItemLabel(item);
  const affordances = Array.isArray(item.actionAffordances) ? item.actionAffordances : [];
  return item.publicClass === 'weapon' || item.objectClass === ')' || affordances.includes('weapon') || /\b(?:pick-axe|axe|sword|dagger|mace|hammer|club|spear|staff|polearm|lance|flail|morning star|bow|crossbow)\b/i.test(label) ? item : null;
}

function lockedContainerTargetLabel(item = {}) {
  const raw = `${publicInventoryItemLabel(item)} ${cleanEquipmentText(transferPresentation?.prompt || transferSession.snapshot().container?.displayName || currentGroundContainerTargetText() || '')}`.trim() || 'container';
  if (/\blarge box\b/i.test(raw)) return 'large box';
  if (/\bice box\b/i.test(raw)) return 'ice box';
  if (/\bchest\b/i.test(raw)) return 'chest';
  if (/\bbox\b/i.test(raw)) return 'box';
  return 'container';
}

function unlockContainerWithInventoryTool(tool = {}, request = {}) {
  const selector = selectorForInventoryItem(tool);
  if (!selector) return;
  const transactionId = `container-unlock-${Number(request.item?.objectId || pendingContainerUnlockOpen?.item?.objectId || 0)}-${Date.now()}`;
  activeContextualPrompt = null;
  closeInteractionDialog();
  hideDirectionHelper();
  pendingContainerUnlockOpen = {
    ...(pendingContainerUnlockOpen || {}),
    phase: 'awaiting-unlock-target',
    x: gameViewSnapshot.cursor.x,
    y: gameViewSnapshot.cursor.y,
    armedAt: performance.now(),
    answeredAt: performance.now(),
    action: request.action || pendingContainerUnlockOpen?.action || { id: 'open-container', label: 'Open container', ext: 'loot' },
    item: request.item || pendingContainerUnlockOpen?.item || currentGroundContainerItemForDirectOpen({}),
    tool: { ...tool },
    transactionId,
    query: `Unlock with ${publicInventoryItemLabel(tool)}`,
  };
  Promise.resolve(sendSemanticActionCommand(`a${selector}`, {
    id: 'item.apply',
    label: `Apply ${publicInventoryItemLabel(tool)}`,
  }, tool, {
    actionId: 'item.apply',
    selector,
  }, {
    source: 'container-unlock',
    transactionId,
    target: {
      itemId: tool.objectId,
      selector,
      inventoryLetter: selector,
      location: { kind: 'inventory' },
      displayName: tool.displayName || tool.text || publicInventoryItemLabel(tool),
      semanticKnown: tool.semanticKnown !== false,
      known: tool.known || { identity: true, quantity: true },
    },
  })).then((accepted) => {
    if (accepted === false && pendingContainerUnlockOpen?.transactionId === transactionId) clearContainerUnlockContinuation();
  });
  gameGrid.focus({ preventScroll: true });
}

function showLockedContainerActionSheet(event = {}) {
  const request = {
    action: pendingContainerUnlockOpen?.action || { id: 'open-container', label: 'Open container', ext: 'loot' },
    item: pendingContainerUnlockOpen?.item || directContainerIdentityForRefresh(),
  };
  const target = lockedContainerTargetLabel(request.item);
  const tools = availableLockTools();
  const forceItem = wieldedContainerForceItem();
  closeContainerTransferPanel('Locked container choices opened.');
  activeContextualPrompt = { kind: 'locked-container', message: String(event.reason || 'The container is locked.'), target };
  const options = tools.map((tool) => {
    const label = publicInventoryItemLabel(tool);
    return { key: '', className: 'context-choice primary-context', label: `Unlock with ${label}`, text: `Apply your ${label} to the ${target}.`, onClick: () => unlockContainerWithInventoryTool(tool, request) };
  });
  if (forceItem) {
    const label = publicInventoryItemLabel(forceItem);
    options.push({ key: '', className: 'context-choice', label: `Force with ${label}`, text: `Use your wielded ${label} to force the lock. This can damage the weapon or container.`, onClick: () => { activeContextualPrompt = null; closeInteractionDialog(); sendGroundForceContainerAction({ id: 'force-container', label: `Force with ${label}`, ext: 'force' }, request.item); gameGrid.focus({ preventScroll: true }); } });
  }
  if (currentGroundHasTrappedContainer()) options.push({ key: '', className: 'context-choice', label: `Untrap ${target}`, text: 'Check and disarm the container trap before opening it.', onClick: () => { activeContextualPrompt = null; closeInteractionDialog(); sendGroundUntrapContainerAction({ id: 'untrap-container', label: `Untrap ${target}`, ext: 'untrap' }, request.item); gameGrid.focus({ preventScroll: true }); } });
  options.push({ key: '', className: 'context-choice', label: 'Close', text: 'Leave the container closed without spending a turn.', onClick: dismissContextualPrompt });
  showInteractionDialog({
    title: `Locked ${target} actions`,
    prompt: `The ${target} is locked. Choose how to handle it.`,
    dialogClass: 'context-dialog locked-container-dialog',
    cancelText: 'Close',
    closeKind: 'close',
    family: 'command',
    options,
  });
  return true;
}

function answerOwnedContainerUnlockPrompt(prompt = {}, key = '', nextPhase = '') {
  const requestId = String(prompt.requestId || prompt.promptId || '').trim();
  if (!requestId || !containerUnlockTargetIsCurrent()) return false;
  const transactionId = String(pendingContainerUnlockOpen.transactionId || '').trim();
  const promptTransactionId = String(prompt.transactionId || '').trim();
  if (!transactionId || promptTransactionId !== transactionId) {
    clearContainerUnlockContinuation();
    return false;
  }
  pendingContainerUnlockOpen = {
    ...pendingContainerUnlockOpen,
    phase: nextPhase,
    answeredAt: performance.now(),
    ownerRequestId: requestId,
    query: prompt.query || pendingContainerUnlockOpen.query || '',
  };
  publishRendererGameViewEvent({ name: 'renderer_dismiss_interaction', expectedRequestId: requestId, clearMenu: false });
  closeInteractionDialog({ force: true });
  sendRecordedShimInput({
    type: 'keycode',
    keycode: key.charCodeAt(0),
    guiActionId: 'container.unlock',
    actionId: 'container.unlock',
    actionLabel: 'Unlock container',
    expectedRequestId: requestId,
    transactionId,
    actionTransactionId: transactionId,
    commandPosition: 1,
    commandLength: 1,
  }, 'container-unlock-followup');
  lastSentKey = { key: undefined, at: 0 };
  return true;
}

function maybeDispatchContainerOpenAfterUnlock() {
  if (!containerUnlockTargetIsCurrent() || pendingContainerUnlockOpen.phase !== 'opening-after-unlock') return false;
  if (gameViewSnapshot.activePrompt || gameViewSnapshot.currentMenu?.awaitingSelection) return false;
  const request = { ...pendingContainerUnlockOpen, phase: 'open-dispatched' };
  pendingContainerUnlockOpen = request;
  Promise.resolve(sendGroundOpenContainerAction(
    request.action || { id: 'open-container', label: 'Open container', ext: 'loot' },
    request.item || {},
  )).then((accepted) => {
    if ((accepted === false || accepted?.ok === false) && pendingContainerUnlockOpen === request) clearContainerUnlockContinuation();
  });
  return true;
}

function maybeContinueContainerOpenAfterUnlock(message = '') {
  if (!containerUnlockTargetIsCurrent() || pendingContainerUnlockOpen.phase !== 'awaiting-unlock-result') return;
  const text = String(message || '');
  const succeeded = /\byou succeed(?:ed)? in (?:unlocking|picking) the (?:lock|container|chest|box)\b|\byou (?:unlocked|picked) the (?:lock|container|chest|box)\b|\bthe lock clicks open\b/i.test(text);
  const failed = /\b(?:fail(?:ed)?|cannot|can't|unable) to (?:unlock|pick)|\bgive up (?:trying to )?(?:unlock|pick)|\bthe lock (?:resists|does not open)\b/i.test(text);
  if (succeeded) {
    pendingContainerUnlockOpen = { ...pendingContainerUnlockOpen, phase: 'opening-after-unlock' };
    maybeDispatchContainerOpenAfterUnlock();
  } else if (failed) pendingContainerUnlockOpen = null;
}


async function runContextAction(action) {
  if (!action || hasActiveUiInputOwner()) return;
  const isShopPaymentAction = /^pay-shopkeeper-/.test(action.id || '');
  if (!isShopPaymentAction && shopPaymentUiStatus.phase !== 'idle') shopPaymentUiStatus = { phase: 'idle', text: '', until: 0 };
  if (isShopPaymentAction) {
    shopPaymentUiStatus = { phase: 'opening', text: 'Opening shop bill…', until: 0 };
    setStatus(shopPaymentUiStatus.text);
  }
  if (isShopPaymentAction) {
    const current = interactionDecision('validate-context-action').contextActions.find((candidate) => candidate.id === action.id);
    if (!current) {
      const message = 'Payment is no longer available. Your bill or shopkeeper context changed.';
      shopPaymentUiStatus = { phase: 'result', text: message, until: Date.now() + 5000 };
      setStatus(message);
      appendMessage(message, { allowConsecutiveDuplicate: true, logPrompt: false });
      return;
    }
    action = current;
  }
  if (action.command === 'more') {
    openActionDialog();
    return;
  }
  armContainerUnlockContinuation(action);
  let actionDispatched = true;
  if (action.command === 'key') {
    sendPlayableKey(action.key);
  } else if (action.command === 'keys') {
    sendPlayableText(action.keys);
  } else if (action.command === 'ground-panel') {
    actionDispatched = openGroundTransferPanelFromSnapshot('context action') !== false;
    if (!actionDispatched) setStatus('Ground panel needs a public ground snapshot before direct transfer; no pickup menu fallback was sent.');
  } else if (action.command === 'ext') {
    setWorkflowContextFromButton({ dataset: { workflowLabel: action.label } }, action.label);
    if (activeWorkflowContext) activeWorkflowContext.submittedExtendedCommand = action.ext;
    if (action.id === 'open-container' && action.ext === 'loot') actionDispatched = await sendGroundOpenContainerAction(action) !== false;
    else if (action.id === 'tip-container' && action.ext === 'tip') actionDispatched = await sendGroundTipContainerAction(action) !== false;
    else if (action.id === 'force-container' && action.ext === 'force') actionDispatched = await sendGroundForceContainerAction(action) !== false;
    else if (action.id === 'untrap-container' && action.ext === 'untrap') actionDispatched = await sendGroundUntrapContainerAction(action) !== false;
    else sendPlayableText(`#${action.ext}\n`);
  } else if (action.command === 'terrain-action') {
    setWorkflowContextFromButton({ dataset: { workflowLabel: action.label } }, action.label);
    actionDispatched = await sendDirectTerrainAction(action) !== false;
  } else if (action.command === 'terrain-dip') {
    setWorkflowContextFromButton({ dataset: { workflowLabel: action.label } }, action.label);
    actionDispatched = await showTerrainDipItemChooser(action) !== false;
  } else if (action.command === 'direction') {
    commandThenDirection(action.key, action.direction, action.label);
  } else if (action.command === 'kick-direction') {
    kickDirectionFromContext(action.direction);
  } else if (action.command === 'ext-direction') {
    setWorkflowContextFromButton({ dataset: { workflowLabel: action.label } }, action.label);
    if (activeWorkflowContext) activeWorkflowContext.submittedExtendedCommand = action.ext;
    sendPlayableText(`#${action.ext}\n`);
    if (action.direction) window.setTimeout(() => sendPlayableKey(action.direction), 60);
  }
  if (actionDispatched && !isShopPaymentAction) appendMessage(`${action.label}.`);
  gameGrid.focus({ preventScroll: true });
}

let contextActionBarSignature = '';
function renderContextActionBar() {
  if (!contextActionBar) return;
  const actions = interactionDecision('render-context-actions').contextActions;
  contextActionBar.textContent = '';
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `context-action-button${action.primary ? ' primary-context' : ''}`;
    button.dataset.contextActionId = action.id;
    button.textContent = action.label;
    button.title = action.title;
    button.addEventListener('click', () => {
      uxOnboarding?.observe?.({ type: 'here-actions-opened', confirmed: true });
      runContextAction(action);
    });
    contextActionBar.appendChild(button);
  }
  const feedback = globalThis.NetHackUxFeedback;
  contextActionBarSignature = feedback?.animateContextActionBar?.(contextActionBar, contextActionBarSignature) || contextActionBarSignature;
}

function showMapContextActionSheet(cellEl) {
  if (!cellEl || !gameGrid.contains(cellEl) || hasActiveUiInputOwner()) return false;
  const x = Number(cellEl.dataset.mapX);
  const y = Number(cellEl.dataset.mapY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const tooltip = mapTooltipInfoForCell(gameViewSnapshot.mapCells[y]?.[x], x, y);
  activeContextualPrompt = {
    kind: 'map-cell',
    x,
    y,
    direction: mapCellDirectionFromCursor(cellEl),
    targetName: tooltip?.title || `map ${x},${y}`,
  };
  renderPromptPanel();
  return true;
}

const statusFieldNames = new Map((sharedModules.statusHud?.STATUS_FIELDS || []).map((field) => [field.field, field.label]));

function cleanStatusValue(field, value) {
  if (sharedModules.statusHud?.cleanStatusValue) return sharedModules.statusHud.cleanStatusValue(field, value);
  if (field === 10 && typeof value === 'string') return value.replace(/^\\G[0-9A-Fa-f]+:/, '').trim() || '0';
  return typeof value === 'string' ? value.trim() : value;
}

function statusValue(field) {
  return cleanStatusValue(field, gameViewSnapshot.statusValues.get(field));
}

function rawStatusValue(field) {
  const value = gameViewSnapshot.statusValues.get(field);
  return typeof value === 'string' ? value.trim() : value;
}

function allStatusStats() {
  return Array.from(gameViewSnapshot.statusValues.entries())
    .filter(([, value]) => value != null && value !== '')
    .sort(([a], [b]) => a - b)
    .map(([field, value]) => ({ label: statusFieldNames.get(field) || gameViewSnapshot.statusLabels.get(field) || `field ${field}`, value: cleanStatusValue(field, value) || '(hidden)' }));
}


function meaningfulConditions() {
  return sharedModules.statusHud?.conditionLabels ? sharedModules.statusHud.conditionLabels(gameViewSnapshot.statusValues.get(22)).join(' ') : '';
}

function renderRawStatusLines() {
  const fields = allStatusStats().map((stat) => `${stat.label}: ${stat.value || '(hidden in HUD)'}`);
  statusLines.textContent = fields.length ? fields.join('  |  ') : 'Status appears when play begins.';
}

function cleanEquipmentText(text) {
  return sharedModules.interactionModel.menuItemName(String(text || '').replace(/^\s*[a-z$]\s*[-+]\s+/i, '')).replace(/\s+/g, ' ').trim();
}

function menuLooksLikeRememberedGroundItems(menu) {
  if (!groundItemsHint?.items?.length) return false;
  const hintText = groundItemsHint.items.join('\n').toLowerCase();
  const rows = (menu?.items || []).filter((item) => item.selector).map((item) => sharedModules.interactionModel.menuItemName(item.text).toLowerCase()).filter(Boolean);
  return rows.length > 0 && rows.every((row) => hintText.includes(row));
}

function inventoryOverviewRequestActive() {
  return Date.now() - lastInventoryOverviewRequestAt < 2500;
}

function markInventoryOverviewRequest() {
  lastInventoryOverviewRequestAt = Date.now();
}

function activeInventoryActionPromptOwnsMenu() {
  return Boolean(gameViewSnapshot.activePrompt?.kind === 'question'
    && sharedModules.interactionModel.isInventoryActionPrompt(gameViewSnapshot.activePrompt.query, gameViewSnapshot.activePrompt.choices)
    && !activePromptIsOrphaned());
}

function rememberedInventoryActionPromptOwnsMenu(menu) {
  const rememberedActionQuery = String(lastInventoryActionQuery || '').trim();
  return Boolean(rememberedActionQuery
    && /^Menu$/i.test(String(menu?.prompt || '').trim())
    && gameViewSnapshot.activePrompt?.kind === 'menu selection'
    && gameViewSnapshot.currentMenu?.awaitingSelection
    && !inventoryOverviewRequestActive()
    && sharedModules.interactionModel.isInventoryActionPrompt(rememberedActionQuery, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$?*-'));
}

function isExplicitInventoryOverviewMenu(menu) {
  const purpose = String(menu?.menuPurpose || menu?.purpose || '').trim();
  const ownerKind = String(menu?.owner?.kind || '').trim();
  return /^inventory\.displayInventory$/i.test(purpose) && /^inventory$/i.test(ownerKind);
}

function rowLooksLikePublicInventoryItem(item) {
  const kind = String(item?.semanticKind || '').toLowerCase();
  return ['object', 'item', 'corpse'].includes(kind) || /^[a-z$]\s+-\s+/i.test(String(item?.text || ''));
}

function isInventoryOverviewMenu(menu) {
  if (menu?.suppressPicker || sharedModules.interactionModel.isGroundLookMenu(menu)) return false;
  const prompt = String(menu?.prompt || '').trim();
  const selectableItems = (menu?.items || []).filter((item) => item.selector);
  const rowsLookLikeInventory = selectableItems.length > 0 && selectableItems.every((item) => rowLooksLikePublicInventoryItem(item));
  if (isExplicitInventoryOverviewMenu(menu) && rowsLookLikeInventory && !activeInventoryActionPromptOwnsMenu() && !rememberedInventoryActionPromptOwnsMenu(menu)) return true;
  if (sharedModules.interactionModel.menuKind(menu) === 'inventory' && /^(?:Inventory|Possessions):?$/i.test(prompt)) return !activeInventoryActionPromptOwnsMenu() || inventoryOverviewRequestActive();
  if (prompt && !/^Menu$/i.test(prompt)) return false;
  if (!inventoryOverviewRequestActive()) return false;
  // Ground-look rows and a real inventory overview can have the same raw shape,
  // especially after the player picks up a whole stack while standing on it.
  // Only use remembered-ground suppression when the menu was not opened by the
  // explicit gameplay Inventory command; otherwise `i` regresses to the basic
  // picker instead of the rich equipment screen.
  if (menuLooksLikeRememberedGroundItems(menu)) return selectableItems.length > 0;
  // NetHack's normal gameplay `i` command calls display_inventory(..., FALSE),
  // whose end_menu prompt is null/empty.  Treat a promptless object menu as the
  // inventory overview only when the visible inventory command opened it; comma
  // pickup and passive ground menus can have the same raw object-row shape.
  return rowsLookLikeInventory;
}


function groundItemActionAffordancesForItem(item) {
  const context = { isOnAltar: terrainAtPlayerMatches(/altar/), onAltar: terrainAtPlayerMatches(/altar/) };
  return sharedModules.inventoryActionService?.groundItemActionAffordances?.(item, context) || [];
}

function groundItemModelsHere() {
  const menuRows = gameViewSnapshot.currentMenu?.suppressPicker && sharedModules.interactionModel.isGroundLookMenu(gameViewSnapshot.currentMenu)
    ? gameViewSnapshot.currentMenu.items.map((item) => ({ ...item, groundSource: 'look-menu' })) : [];
  if (menuRows.length) return menuRows;
  const snapshotRows = groundSnapshotItemsHere().map((item, index) => ({
    text: item.displayName || item.text || 'ground item',
    displayName: item.displayName || item.text || 'ground item',
    selector: item.selector || 0,
    syntheticGroundItem: true,
    syntheticSelector: item.objectId != null ? `object-${item.objectId}` : `ground-snapshot-${index}`,
    groundSource: 'ground.pile.snapshot',
    objectId: item.objectId,
    quantity: item.quantity,
    glyph: item.glyph,
    glyphChar: item.glyphChar,
    semanticKind: item.semanticKind,
    semanticName: item.semanticName,
    semanticAppearance: item.semanticAppearance,
    semanticKnown: item.semanticKnown,
    actionAffordances: Array.isArray(item.actionAffordances) ? item.actionAffordances.slice() : [],
    known: item.known ? { ...item.known } : undefined,
  }));
  if (snapshotRows.length) return snapshotRows;
  return groundItemTextsHere().map((text, index) => ({ text, selector: 0, syntheticGroundItem: true, syntheticSelector: `here-${index}`, groundSource: groundItemsHint?.source || 'cell' }));
}

function closeGroundItemContextMenu() {
  const menu = document.querySelector('.ground-item-context-menu');
  if (!menu) return false;
  uxFocusLayer?.close?.(menu);
  menu.remove();
  return true;
}

function sectionTitle(section) {
  if (section === 'combat') return 'Combat / target';
  if (section === 'location') return 'Location / advanced';
  if (section === 'management') return 'Inventory management';
  if (section === 'magic') return 'Magic / unique powers';
  if (section === 'danger') return 'Dangerous';
  return 'Primary actions';
}

function actionMenuHint(entry) {
  if (entry?.enabled === false) return entry.disabledReasonLabel || entry.disabledReason || 'This action is blocked by visible public state.';
  if (/^ground\.pickupThen\./.test(entry?.id || '')) return 'First picks up the ground item; then uses the visible follow-up choice.';
  if (entry?.execution?.route === 'pickupGroundItem') return 'Picks up this row from the ground list, or opens pickup if the list needs refreshing.';
  if (/inspect/i.test(entry?.id || entry?.label || '')) return 'View item details without spending a turn.';
  const key = entry?.execution?.keys || entry?.key || '';
  const keyHint = key ? `Shortcut: ${key.replace(/\u001b/g, 'Esc').replace(/\n/g, ' Enter')}.` : '';
  const pickerHint = entry?.promptPlan?.length ? 'A follow-up picker may appear.' : '';
  return [keyHint, pickerHint].filter(Boolean).join(' ') || 'Choose this action.';
}

function showGroundItemFeedback(text, good = false) {
  if (!text) return;
  showPlayerNotice({
    id: `ground-item:${good ? 'accepted' : 'info'}:${shimEventCount}`,
    kind: good ? 'success' : 'info',
    message: String(text),
    source: 'result',
    persistence: 'transient',
  });
}

function executeGroundItemAction(item, affordance) {
  closeGroundItemContextMenu();
  const keys = affordance?.execution?.keys || '';
  if (affordance?.id === 'ground.inspect' || !keys) {
    showGroundItemFeedback(`${cleanEquipmentText(item?.text || 'Ground item')}: inspect the visible ground row or use Look for more details.`);
    return;
  }
  const route = affordance?.execution?.route || '';
  const itemName = cleanEquipmentText(item?.text || 'ground item');
  if (route === 'pickupThenInventoryAction') {
    sendPlayableText(keys);
    appendMessage(`Picked up ${itemName}; next choose ${affordance.params?.afterLabel || 'the matching inventory action'} from the visible controls.`);
  } else if (route === 'pickupGroundItem') {
    sendPlayableText(keys);
    appendMessage(`Pick up ${itemName}.`);
  } else if (affordance?.id === 'ground.openContainer' && keys === '#loot\n') {
    sendGroundOpenContainerAction({ id: 'open-container', label: affordance.label || 'Open / loot here', ext: 'loot' }, item);
    appendMessage(`${affordance.label}.`);
  } else if (affordance?.id === 'ground.tipContainer' && keys === '#tip\n') {
    sendGroundTipContainerAction({ id: 'tip-container', label: affordance.label || 'Tip contents here', ext: 'tip' }, item);
    appendMessage(`${affordance.label}.`);
  } else if (affordance?.id === 'ground.forceContainer' && keys === '#force\n') {
    sendGroundForceContainerAction({ id: 'force-container', label: affordance.label || 'Force lock here', ext: 'force' }, item);
    appendMessage(`${affordance.label}.`);
  } else if (affordance?.id === 'ground.untrapContainer' && keys === '#untrap\n') {
    sendGroundUntrapContainerAction({ id: 'untrap-container', label: affordance.label || 'Untrap container here', ext: 'untrap' }, item);
    appendMessage(`${affordance.label}.`);
  } else {
    sendPlayableText(keys);
    appendMessage(`${affordance.label}.`);
  }
  showGroundItemFeedback(`${affordance.label.replace(/…/g, '')}: ${itemName}.`, true);
  gameGrid.focus({ preventScroll: true });
}

function showGroundItemContextMenu(item, anchorOrEvent) {
  const contextInvoker = anchorOrEvent?.currentTarget || anchorOrEvent?.target || anchorOrEvent || document.activeElement;
  const actions = groundItemActionAffordancesForItem(item);
  if (!actions.length) return;
  closeGroundItemContextMenu();
  const menu = document.createElement('div');
  menu.className = 'ground-item-context-menu';
  menu.setAttribute('role', 'menu');
  menu.tabIndex = -1;
  const header = document.createElement('div');
  header.className = 'inventory-context-header';
  header.innerHTML = `<strong>${escapeHtml(cleanEquipmentText(item?.text || 'Ground item'))}</strong><span>Ground item actions.</span>`;
  menu.appendChild(header);
  const groups = new Map();
  for (const entry of actions) {
    const section = entry.section || 'primary';
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(entry);
  }
  for (const [section, entries] of groups.entries()) {
    const sectionEl = document.createElement('section');
    const title = document.createElement('div');
    title.className = 'inventory-context-section-title';
    title.textContent = section === 'after-pickup' ? 'After pickup actions' : sectionTitle(section);
    sectionEl.appendChild(title);
    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `inventory-context-action danger-${entry.dangerLevel || 'safe'}`;
      button.dataset.actionId = entry.id;
      button.disabled = entry.enabled === false;
      button.setAttribute('role', 'menuitem');
      button.innerHTML = `<strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(actionMenuHint(entry))}</span>`;
      button.addEventListener('click', () => executeGroundItemAction(item, entry));
      sectionEl.appendChild(button);
    }
    menu.appendChild(sectionEl);
  }
  (interactionDialog?.open ? interactionDialog : document.body).appendChild(menu);
  const isPointerEvent = Number.isFinite(anchorOrEvent?.clientX) && Number.isFinite(anchorOrEvent?.clientY);
  const rect = anchorOrEvent?.currentTarget?.getBoundingClientRect?.() || anchorOrEvent?.target?.getBoundingClientRect?.() || anchorOrEvent?.getBoundingClientRect?.() || { left: 24, top: 24, bottom: 24 };
  const wantedLeft = isPointerEvent ? anchorOrEvent.clientX : (rect.left || 24);
  const wantedTop = isPointerEvent ? anchorOrEvent.clientY : (rect.bottom || rect.top || 24);
  menu.style.left = `${Math.min(Math.max(8, wantedLeft), Math.max(8, window.innerWidth - 360))}px`;
  menu.style.top = `${Math.min(Math.max(8, wantedTop), Math.max(8, window.innerHeight - Math.min(620, menu.offsetHeight || 460)))}px`;
  uxFocusLayer?.open?.({ id: 'ground-item-context', element: menu, domain: 'items', initialFocus: () => menu.querySelector('[role="menuitem"]'), returnFocus: contextInvoker, escapePolicy: 'close' });
}


function currentPlayerAvatarTile() {
  const directComboId = sharedModules.tileAssets?.playerComboAvatarAssetId?.(currentPlayerCharacter(), tileAssetsById);
  const directComboTile = directComboId ? tileAssetsById.get(directComboId) : undefined;
  if (directComboTile?.installedPath) return { tile: directComboTile, assetId: directComboId, source: 'character-combo' };
  const directRoleId = sharedModules.tileAssets?.playerRoleAvatarAssetId?.(currentPlayerCharacter(), tileAssetsById);
  const directRoleTile = directRoleId ? tileAssetsById.get(directRoleId) : undefined;
  if (directRoleTile?.installedPath) return { tile: directRoleTile, assetId: directRoleId, source: 'character-role' };
  const candidateCells = [];
  const cursorCell = gameViewSnapshot.mapCells[gameViewSnapshot.cursor.y]?.[gameViewSnapshot.cursor.x];
  if (cursorCell) candidateCells.push(cursorCell);
  for (const row of gameViewSnapshot.mapCells) {
    for (const cell of row) {
      const normalized = normalizeCell(cell);
      if (sharedModules.tileAssets?.isPlayerCell?.(normalized) || (normalized.assetId === 'hero-avatar' || Number(normalized.glyph) === 725)) candidateCells.push(cell);
    }
  }
  for (const cell of candidateCells) {
    const normalized = normalizeCell(cell);
    const assetId = mappedAssetIdForCell(normalized);
    const tile = assetId ? tileAssetsById.get(assetId) : undefined;
    if (tile?.installedPath) return { tile, assetId, source: normalized.ch === '@' ? 'map-player' : 'map-semantic' };
  }
  const fallbackTile = tileAssetsById.get('hero-avatar');
  return fallbackTile?.installedPath ? { tile: fallbackTile, assetId: 'hero-avatar', source: 'fallback' } : { tile: null, assetId: 'hero-avatar', source: 'glyph-fallback' };
}

function itemEquipmentTransferOwnerSignal() {
  const owner = transferSession.snapshot().owner;
  return owner?.id ? Object.freeze({ id: owner.id, active: true }) : null;
}

function itemEquipmentAvatar() {
  const avatar = currentPlayerAvatarTile();
  if (!avatar.tile?.installedPath) return Object.freeze({ src: '', alt: 'Hero' });
  const src = tileUrl(avatar.tile).replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
  return Object.freeze({ src, alt: avatar.tile.name || 'Hero' });
}

function itemEquipmentIcon(item = {}) {
  const glyph = item.glyphChar && item.glyphChar > 0 && item.glyphChar < 128 ? String.fromCharCode(item.glyphChar) : '';
  const assetId = mappedAssetIdForCell({
    ch: glyph,
    glyph: item.glyph,
    semanticKind: item.semanticKind,
    semanticName: item.semanticName,
    semanticAppearance: item.semanticAppearance,
    semanticKnown: item.semanticKnown,
    cmapIndex: item.cmapIndex,
  });
  const tile = assetId ? tileAssetsById.get(assetId) : null;
  if (!tile?.installedPath) return null;
  return Object.freeze({ src: tileUrl(tile).replace(/^url\(["']?/, '').replace(/["']?\)$/, ''), alt: '' });
}

function itemEquipmentInteraction(decision = interactionDecision('item-equipment-reconcile')) {
  return Object.freeze({
    id: decision.interactionId || '',
    owner: decision.owner,
    prompt: gameViewSnapshot.activePrompt,
    menu: gameViewSnapshot.currentMenu,
    promptPlan: decision.prompt,
    menuPlan: decision.menu,
  });
}

function reconcileItemEquipmentOwner(decision = null) {
  if (!itemEquipmentOwner) return null;
  const pendingBefore = itemEquipmentOwner.snapshot?.().pendingIntentId || '';
  const result = itemEquipmentOwner.reconcile({
    inventory: gameViewSnapshot.inventory,
    equipment: gameViewSnapshot.equipment,
    statusValues: gameViewSnapshot.statusValues,
    messages: gameViewSnapshot.messages,
    transferOwner: itemEquipmentTransferOwnerSignal(),
    interaction: itemEquipmentInteraction(decision || interactionDecision('item-equipment-reconcile')),
    avatar: itemEquipmentAvatar(),
    iconResolver: itemEquipmentIcon,
    onIntent: dispatchItemEquipmentIntent,
    onDiagnostic: (entry) => diagnosticEvent('items', entry.type, entry.detail || {}),
  });
  if (pendingBefore && !itemEquipmentOwner.snapshot?.().pendingIntentId) suppressInventoryLazyLoadUntil = 0;
  return result;
}

function nativeMenuMatchesItemCorrelation(menu = {}, correlation = {}) {
  const requestId = String(menu.requestId || menu.menuRequestId || '');
  const menuRequestId = String(menu.menuRequestId || requestId);
  const purpose = String(menu.menuPurpose || menu.purpose || '');
  return Boolean(requestId
    && requestId === String(correlation.requestId || '')
    && menuRequestId === String(correlation.menuRequestId || correlation.requestId || '')
    && String(menu.transactionId || '') === String(correlation.transactionId || '')
    && (Number.isSafeInteger(correlation.window) ? menu.window === correlation.window : !Number.isSafeInteger(menu.window))
    && String(menu.menuId || '') === String(correlation.menuId || '')
    && Number(menu.lifecycleRevision || 0) === Number(correlation.lifecycleRevision || 0)
    && purpose === String(correlation.purpose || '')
    && String(menu.owner?.kind || '') === String(correlation.ownerKind || ''));
}
function nativePromptMatchesItemCorrelation(prompt = {}, correlation = {}) {
  return Boolean(prompt.requestId
    && String(prompt.requestId) === String(correlation.requestId || '')
    && String(prompt.transactionId || '') === String(correlation.transactionId || '')
    && (Number.isSafeInteger(correlation.window) ? prompt.window === correlation.window : !Number.isSafeInteger(prompt.window))
    && Number(prompt.lifecycleRevision || 0) === Number(correlation.lifecycleRevision || 0)
    && String(prompt.kind || '') === String(correlation.kind || '')
    && String(prompt.promptPurpose || prompt.purpose || '') === String(correlation.purpose || '')
    && String(prompt.query || '') === String(correlation.query || '')
    && String(prompt.choices || '') === String(correlation.choices || ''));
}

async function dispatchItemEquipmentIntent(intent = {}) {
  if (intent.type === 'cancel-native-overview' || intent.type === 'cancel-native-interaction') {
    const currentMenu = gameViewSnapshot.currentMenu;
    const expectedRequestId = String(intent.correlation?.requestId || '');
    const currentRequestId = String(currentMenu?.requestId || currentMenu?.menuRequestId || '');
    if (!currentMenu || !nativeMenuMatchesItemCorrelation(currentMenu, intent.correlation)) {
      diagnosticEvent('items', 'native-menu.cancel-rejected', { expectedRequestId, currentRequestId, type: intent.type });
      return false;
    }
    return sendActivePromptCancellation(
      gameViewSnapshot.activePrompt || { kind: 'read-only menu', requestId: expectedRequestId, transactionId: intent.correlation?.transactionId || '' },
      { forceMenu: currentMenu, transactionId: intent.correlation?.transactionId || '' },
    );
  }
  if (intent.type === 'execute-item-action') {
    if (String(intent.command || '').length > 1) {
      suppressInventoryLazyLoadUntil = Date.now() + 3000;
      clearInventoryLazyLoad();
    }
    return sendSemanticActionCommand(
      intent.command,
      intent.action,
      intent.item,
      intent.route,
      {
        source: intent.source || 'item-equipment-owner',
        transactionId: intent.transactionId,
        expectedRevision: intent.expectedRevision,
        target: intent.route?.target,
        payload: intent.route?.promptPolicy ? { promptPolicy: intent.route.promptPolicy } : undefined,
      },
    );
  }
  if (intent.type === 'select-native-prompt-followup') {
    const currentPrompt = gameViewSnapshot.activePrompt;
    if (!currentPrompt || !nativePromptMatchesItemCorrelation(currentPrompt, intent.correlation)) {
      diagnosticEvent('items', 'native-prompt-followup.selection-rejected', {
        expectedRequestId: intent.correlation?.requestId || '',
        currentRequestId: currentPrompt?.requestId || '',
      });
      return false;
    }
    return sendRecordedShimInput({
      type: 'keycode',
      keycode: intent.selector.charCodeAt(0),
      transactionId: intent.transactionId,
      expectedRequestId: intent.correlation.requestId,
      guiActionId: intent.action?.id || 'item.followup',
      actionLabel: intent.action?.label || 'Choose item',
      followupPlan: 'native-prompt-selection',
    }, 'item-equipment-native-followup');
  }
  if (intent.type === 'select-native-followup') {
    const currentMenu = gameViewSnapshot.currentMenu;
    if (!currentMenu || !nativeMenuMatchesItemCorrelation(currentMenu, intent.correlation)) {
      diagnosticEvent('items', 'native-followup.selection-rejected', {
        expectedRequestId: intent.correlation?.requestId || '',
        currentRequestId: currentMenu?.requestId || currentMenu?.menuRequestId || '',
      });
      return false;
    }
    return sendRecordedShimInput({
      type: 'keycode',
      keycode: intent.selector.charCodeAt(0),
      transactionId: intent.transactionId,
      expectedRequestId: intent.correlation.requestId,
      guiActionId: intent.action?.id || 'item.followup',
      actionLabel: intent.action?.label || 'Choose item',
      followupPlan: 'native-menu-selection',
    }, 'item-equipment-native-followup');
  }
  return false;
}

function openItemEquipmentOwner(decision) {
  if (!itemEquipmentOwner || itemEquipmentTransferOwnerSignal()) return false;
  if (itemEquipmentOwner.snapshot?.().open) return true;
  const inventory = gameViewSnapshot.inventory;
  if (!Number.isSafeInteger(inventory?.revision) || inventory.revision <= 0) {
    diagnosticEvent('items', 'workspace.open-rejected', { code: 'missing-authoritative-inventory' });
    return false;
  }
  itemEquipmentOwner.open({
    documentRoot: document,
    mount: sharedModules.uxAppMounts?.lookupMount?.('items', document),
    inventory,
    equipment: gameViewSnapshot.equipment,
    statusValues: gameViewSnapshot.statusValues,
    transferOwner: null,
    interaction: itemEquipmentInteraction(decision),
    avatar: itemEquipmentAvatar(),
    iconResolver: itemEquipmentIcon,
    initialMode: 'equipment',
    invoker: document.activeElement,
    onIntent: dispatchItemEquipmentIntent,
    onDiagnostic: (entry) => diagnosticEvent('items', entry.type, entry.detail || {}),
  });
  return itemEquipmentOwner.snapshot().open;
}


function isGameOverMessage(text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  if (!line) return false;
  if (/^Really quit without saving\??$/i.test(line)) return false;
  return /^(?:You (?:die\b|were killed\b|are dead(?:[.!?]|$)|died\b|starved to death\b|were poisoned\b|choked on\b|drowned in\b|burned by\b|dissolved in\b|were crushed to death\b|turned to stone\b|turned into slime\b|were genocided\b)|Killed by\b|Rest in peace\b)/i.test(line)
    || /^(?:Goodbye\b|You (?:escaped|ascended|quit)\b|.*\bquit while already on Charon's boat\b)/i.test(line);
}

function cleanDeathActorName(actor) {
  return String(actor || '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/(?:'s)?\s*$/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function killedByPhrase(actor) {
  const clean = cleanDeathActorName(actor);
  if (!clean) return '';
  const article = /^[a-z]/.test(clean) ? (/^(?:[aeiou])/i.test(clean) ? 'an ' : 'a ') : '';
  return `Killed by ${article}${clean}`;
}

function deathCauseCandidateFromText(text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  if (!line) return '';
  const actorAttack = line.match(/^(?!(?:You|Your)\b)(?:(?:The|A|An)\s+)?(.+?)\s+(?:hits(?: you)?|bites(?: you)?|stings(?: you)?|kicks(?: you)?|scratches(?: you)?|claws(?: you)?|touches(?: you)?|butts(?: you)?|engulfs(?: you)?|strikes(?: you)?|attacks(?: you)?)[.!?]*$/i)
    || line.match(/^(?:(?:The|A|An)\s+)?(.+?)'s\s+(?:bite|sting|touch|attack)\b/i)
    || line.match(/^(?!(?:You|Your)\b)(?:(?:The|A|An)\s+)?(.+?)\s+(?:zaps|shoots|throws|explodes|breathes|casts)(?:\s+.+?)?!?$/i);
  if (actorAttack) return killedByPhrase(actorAttack[1]);
  const hitBy = line.match(/\b(?:You are hit by|You are struck by|You are blasted by)\s+(.+?)(?:[.!?]|$)/i);
  if (hitBy) return killedByPhrase(hitBy[1]) || '';
  return '';
}

function deathCauseCandidateRank(text, candidate) {
  const line = String(text || '');
  const cause = String(candidate || '');
  if (!candidate) return 0;
  if (/\b(?:zaps|casts|breathes|exhales|shoots|throws)\b/i.test(line)) return 70;
  if (/\bwand hits you\b/i.test(line) || /\bKilled by an? wand\b/i.test(cause)) return 45;
  return 55;
}

function deathCauseFromText(text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  if (!line) return '';
  if (/^Really quit without saving\??$/i.test(line)) return 'Quit without saving';
  const killed = line.match(/(?:You were |You are )?killed by (.+?)(?:\.|$)/i);
  if (killed) return `Killed by ${killed[1].trim()}`;
  const starved = line.match(/(?:You )?(starv(?:ed|e) to death)(?:\.|$)/i) || line.match(/You die from starvation(?:\.|$)/i);
  if (starved) return 'Starved to death';
  const dieFrom = line.match(/You die from (.+?)(?:\.|$)/i);
  if (dieFrom) return `Died from ${dieFrom[1].trim()}`;
  if (/^You died\b/i.test(line)) return recentDeathCauseCandidate || 'You died.';
  if (/You die/i.test(line)) return recentDeathCauseCandidate || line;
  if (/Rest in peace/i.test(line)) return recentDeathCauseCandidate || line;
  if (/died of|starv(?:e|ed|ation)|choked|poisoned|petrified|drowned/i.test(line)) return line;
  return line;
}

function rememberDeathCauseCandidate(text) {
  const candidate = deathCauseCandidateFromText(text);
  const rank = deathCauseCandidateRank(text, candidate);
  if (candidate && rank >= recentDeathCauseCandidateRank) {
    recentDeathCauseCandidate = candidate;
    recentDeathCauseCandidateRank = rank;
  }
  return candidate;
}

function isGenericDeathReason(reason) {
  return !reason || /^(?:The dungeon has claimed another hero\.|You (?:die\.\.\.?|died\.)|Rest in peace\.?|Goodbye\b.*)$/i.test(String(reason).trim());
}

function deathCauseSourcePriority(source, reason) {
  if (isGenericDeathReason(reason)) return 0;
  switch (source) {
    case 'native-end': return 100;
    case 'disclosure': return 90;
    case 'quit-confirmation': return 80;
    case 'message':
    default: return 40;
  }
}

function deathCauseFromNativeEnd(event) {
  const killer = String(event?.killer || '').replace(/\s+/g, ' ').trim();
  if (killer) return killer.replace(/^([a-z])/, (match) => match.toUpperCase());
  const reason = String(event?.reason || '').trim();
  if (/starvation/i.test(reason)) return 'Starved to death';
  if (reason && !/^(?:died|unknown)$/i.test(reason)) return reason.replace(/^([a-z])/, (match) => match.toUpperCase());
  return '';
}

function isGameOverDisclosurePrompt(event) {
  if (event?.name !== 'shim_yn_function') return false;
  const query = String(event.query || '');
  return /(?:possessions|inventory|attributes|vanquished|genocided|extinct|conduct|overview|score|statistics|end of game|disclose)/i.test(query);
}

function refreshVisibleGameOverModal(updateReason = 'state-updated') {
  if (!gameOverState || (!gameOverDialog?.open && !gameOverState.shown)) return;
  renderGameOverModalContent();
  diagnosticEvent('game-over', 'game-over.modal.refreshed', { updateReason, reason: gameOverState.reason, sections: gameOverState.sections.length });
}

function ensureGameOverState(reason = '', options = {}) {
  const source = options.source || 'message';
  const specificReason = reason && isGenericDeathReason(reason) && recentDeathCauseCandidate ? recentDeathCauseCandidate : reason;
  const resolvedReason = specificReason || recentDeathCauseCandidate || 'The dungeon has claimed another hero.';
  const incomingPriority = deathCauseSourcePriority(source, resolvedReason);
  const creating = !gameOverState;
  const previousReason = gameOverState?.reason || '';
  if (!gameOverState) {
    gameOverState = {
      active: true,
      reason: resolvedReason,
      reasonSource: source,
      reasonPriority: incomingPriority,
      prompts: [],
      sections: [],
      rawLines: [],
      shown: false,
    };
  } else if (resolvedReason) {
    const currentPriority = Number(gameOverState.reasonPriority || deathCauseSourcePriority(gameOverState.reasonSource || 'message', gameOverState.reason));
    const shouldUpdate = isGenericDeathReason(gameOverState.reason)
      || incomingPriority > currentPriority
      || (incomingPriority === currentPriority && source !== 'message' && resolvedReason !== gameOverState.reason);
    if (shouldUpdate) {
      gameOverState.reason = resolvedReason;
      gameOverState.reasonSource = source;
      gameOverState.reasonPriority = incomingPriority;
    }
  }
  diagnosticEvent('game-over', creating ? 'game-over.state.created' : 'game-over.state.updated', { requestedReason: reason, specificReason, source, incomingPriority, state: gameOverState });
  if (!creating && previousReason !== gameOverState.reason) refreshVisibleGameOverModal('death-cause-updated');
  return gameOverState;
}

function appendGameOverSection(title, lines) {
  const clean = (lines || []).map((line) => String(line || '').trimEnd()).filter((line) => line.trim());
  if (!gameOverState || !clean.length) return;
  for (const line of clean) {
    rememberDeathCauseCandidate(line);
    const candidate = isGameOverMessage(line);
    diagnosticEvent('game-over', candidate ? 'game-over.disclosure.line.candidate' : 'game-over.disclosure.line.ignored', { title: title || 'NetHack statistics', line, candidate });
    if (candidate) ensureGameOverState(deathCauseFromText(line), { source: 'disclosure' });
  }
  const body = clean.join('\n');
  if (gameOverState.sections.some((section) => section.title === title && section.body === body)) return;
  gameOverState.sections.push({ title: title || 'NetHack statistics', body });
  gameOverState.rawLines.push(...clean);
  diagnosticEvent('game-over', 'game-over.disclosure.section.appended', { title: title || 'NetHack statistics', lineCount: clean.length });
  refreshVisibleGameOverModal('statistics-section-appended');
}

function scheduleGameOverModal(delay = 250) {
  if (!gameOverState) return;
  if (gameOverRenderTimer) window.clearTimeout(gameOverRenderTimer);
  diagnosticEvent('game-over', 'game-over.modal.scheduled', { delay, reason: gameOverState.reason, shown: gameOverState.shown });
  gameOverRenderTimer = window.setTimeout(showGameOverModal, delay);
}

function renderGameOverSummary() {
  const stats = [
    ['Name', currentRunConfig?.character?.name],
    ['Role', currentRunConfig?.character?.role],
    ['Race', currentRunConfig?.character?.race],
    ['Alignment', currentRunConfig?.character?.alignment],
    ['Score', statusValue(8)],
    ['Turns', statusValue(16)],
    ['Dungeon', rawStatusValue(20) || statusValue(20)],
    ['Level', statusValue(13)],
    ['HP', `${statusValue(18) || '?'} / ${statusValue(19) || '?'}`],
    ['Power', `${statusValue(11) || '?'} / ${statusValue(12) || '?'}`],
    ['AC', statusValue(14)],
    ['Gold', statusValue(10)],
    ['Hunger', statusValue(17)],
    ['Conditions', meaningfulConditions()],
  ];
  const seen = new Set();
  const fragment = document.createDocumentFragment();
  for (const [label, value] of stats.concat(allStatusStats().map((stat) => [stat.label, stat.value]))) {
    if (value == null || value === '' || seen.has(label)) continue;
    seen.add(label);
    const item = document.createElement('div');
    item.className = 'game-over-stat';
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    fragment.appendChild(item);
  }
  gameOverSummary.replaceChildren(fragment);
}

function renderGameOverSections() {
  const fragment = document.createDocumentFragment();
  for (const section of gameOverState?.sections || []) {
    const details = document.createElement('details');
    details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = section.title || 'NetHack statistics';
    const pre = document.createElement('pre');
    pre.textContent = section.body || '(no lines captured)';
    details.append(summary, pre);
    fragment.appendChild(details);
  }
  const logDetails = document.createElement('details');
  logDetails.open = true;
  const logSummary = document.createElement('summary');
  logSummary.textContent = 'Game log';
  const log = document.createElement('pre');
  log.className = 'game-over-log';
  log.textContent = gameViewSnapshot.messages.length ? gameViewSnapshot.messages.join('\n') : '(no messages captured)';
  logDetails.append(logSummary, log);
  fragment.appendChild(logDetails);
  gameOverSections.replaceChildren(fragment);
}

function renderGameOverModalContent() {
  if (!gameOverState) return;
  gameOverTitle.textContent = 'Game over';
  const reason = gameOverState.reason || 'The dungeon has claimed another hero.';
  gameOverCause.textContent = reason;
  gameOverStoneName.textContent = currentRunConfig?.character?.name || 'Adventurer';
  gameOverStoneCause.textContent = reason;
  gameOverStoneScore.textContent = `Score ${statusValue(8) || '0'}`;
  renderGameOverSummary();
  renderGameOverSections();
}

function showGameOverModal() {
  if (!gameOverState) return;
  if (interactionDialog.open) closeInteractionDialog();
  if (documentDialog.open) documentDialog.close('game-over');
  hideDirectionHelper();
  renderGameOverModalContent();
  if (!gameOverDialog.open) { uxFocusLayer?.prepareOpen?.(gameOverDialog, document.activeElement); gameOverDialog.showModal(); }
  gameOverState.shown = true;
  diagnosticEvent('game-over', 'game-over.modal.shown', { reason: gameOverState.reason || 'The dungeon has claimed another hero.', sections: gameOverState.sections.length, prompts: gameOverState.prompts.slice() });
  gameOverNew.focus({ preventScroll: true });
  setStatus('game over; final statistics displayed');
}


function closeInteractionDialog({ force = false } = {}) {
  void force;
  closeGroundItemContextMenu();
  focusMode = 'game';
  activeContextualPrompt = null;
  if (interactionDialog.open) interactionDialog.close('silent');
  interactionDialog.className = 'interaction-dialog';
  interactionOptions.textContent = '';
  interactionPrompt.textContent = '';
  if (interactionContext) {
    interactionContext.hidden = true;
    interactionContext.textContent = '';
  }
  interactionFeedback.textContent = '';
  if (interactionPanelControls) {
    interactionPanelControls.hidden = true;
    interactionPanelControls.textContent = '';
  }
  interactionText.value = '';
  interactionTextRow.hidden = true;
  interactionSelectAll.hidden = true;
  interactionClear.hidden = true;
  interactionRefresh.hidden = true;
  interactionConfirm.hidden = true;
  interactionText.oninput = null;
  lastInteractionDialogSignature = '';
}

function visibleInteractionChoices() {
  return Array.from(interactionOptions.querySelectorAll('.choice-button')).filter((button) => !button.hidden && !button.disabled);
}

function focusInteractionChoice(delta = 1) {
  return uxFocusLayer?.moveRoving?.(interactionOptions, delta < 0 ? 'ArrowUp' : 'ArrowDown') || false;
}

function activateFocusedInteractionControl() {
  const active = document.activeElement;
  if (active && interactionDialog.contains(active) && /^(BUTTON)$/.test(active.tagName || '') && !active.disabled && !active.hidden) {
    active.click();
    return true;
  }
  if (!interactionConfirm.hidden && !interactionConfirm.disabled) {
    interactionConfirm.click();
    return true;
  }
  const [firstChoice] = visibleInteractionChoices();
  if (firstChoice) {
    firstChoice.click();
    return true;
  }
  return false;
}

function activeSingleSelectMenuOwnsHotkeys() {
  const menuOwnsSingleSelection = Boolean(gameViewSnapshot.currentMenu?.awaitingSelection
    && Number(gameViewSnapshot.currentMenu?.how || 0) > 0
    && Number(gameViewSnapshot.currentMenu?.how || 0) !== 2);
  const promptOwnsSingleSelection = Boolean(gameViewSnapshot.activePrompt?.kind === 'question'
    && !isActiveDirectionPrompt()
    && (sharedModules.interactionModel.isInventoryActionPrompt(gameViewSnapshot.activePrompt.query, gameViewSnapshot.activePrompt.choices) || sharedModules.interactionModel.isItemClassPrompt(gameViewSnapshot.activePrompt.query, gameViewSnapshot.activePrompt.choices)));
  return Boolean(interactionDialog?.open && (menuOwnsSingleSelection || promptOwnsSingleSelection));
}

function activeFixedChoicePromptOwnsHotkeys() {
  return Boolean(interactionDialog?.open
    && gameViewSnapshot.activePrompt?.kind === 'question'
    && sharedModules.interactionModel.isFixedChoicePrompt(gameViewSnapshot.activePrompt.query, gameViewSnapshot.activePrompt.choices)
    && interactionTextRow?.hidden);
}

function choiceButtonForHotkey(key) {
  if (typeof key !== 'string' || key.length !== 1 || key === ' ') return null;
  const choices = visibleInteractionChoices().filter((button) => button.getAttribute('role') !== 'checkbox');
  return choices.find((button) => button.dataset.key === key)
    || choices.find((button) => button.dataset.key?.toLowerCase() === key.toLowerCase())
    || null;
}

function handleSingleSelectMenuHotkey(event) {
  if (!activeSingleSelectMenuOwnsHotkeys()) return false;
  if (event.repeat || event.isComposing || event.metaKey || event.altKey || event.ctrlKey) return false;
  const button = choiceButtonForHotkey(event.key);
  if (!button) return false;
  event.preventDefault();
  event.stopPropagation();
  closeGroundItemContextMenu();
  button.click();
  return true;
}

function handleFixedChoicePromptHotkey(event) {
  if (!activeFixedChoicePromptOwnsHotkeys()) return false;
  if (event.repeat || event.isComposing || event.metaKey || event.altKey || event.ctrlKey) return false;
  const button = choiceButtonForHotkey(event.key);
  if (!button) return false;
  event.preventDefault();
  event.stopPropagation();
  closeGroundItemContextMenu();
  button.click();
  return true;
}

function handleInteractionNavigationKeydown(event) {
  const uiNavigationKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', ' ', 'Spacebar', 'Tab', 'Home', 'End']);
  if (!uiNavigationKeys.has(event.key)) return false;
  event.stopPropagation();
  if (event.key === 'Tab') return true;
  event.preventDefault();
  if (event.key === 'Escape') cancelActiveInteraction();
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') focusInteractionChoice(-1);
  else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') focusInteractionChoice(1);
  else if (event.key === 'Home' || event.key === 'End') uxFocusLayer?.moveRoving?.(interactionOptions, event.key);
  else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') activateFocusedInteractionControl();
  return true;
}

function showInteractionDialog({ title, prompt, options = [], cancelText = 'Cancel', textEntry = false, textLabel = 'Filter or type selection', textPlaceholder = '', dialogClass = '', family = '', closeKind = '', escapePolicy = '', confirmText = '', clearText = 'Clear selection', selectAllText = 'Select visible', onConfirm, onClear, onSelectAll, feedback, panelControls = null, contextLines = [] }) {
  const resolvedFamily = family || sharedModules.uxDialogShell?.inferFamily?.({
    dialogClass,
    textEntry,
    multi: Number(gameViewSnapshot.currentMenu?.how || 0) === 2,
    readOnly: gameViewSnapshot.activePrompt?.kind === 'read-only menu',
  }) || 'single-select';
  const optionKeysSignature = options.map((option) => option.key || '').join('');
  const interactionSignature = `${title || ''}\n${prompt || ''}\n${dialogClass || ''}\n${textEntry ? 'text' : 'buttons'}\n${optionKeysSignature}`;
  const isNewInteraction = interactionSignature !== lastInteractionDialogSignature;
  if (!isNewInteraction && interactionDialog.open && resolvedFamily === 'confirmation') return;
  lastInteractionDialogSignature = interactionSignature;
  focusMode = 'modal';
  interactionTitle.textContent = title || 'NetHack choice';
  interactionPrompt.textContent = prompt || '';
  if (interactionContext) {
    const lines = (contextLines || []).map((line) => String(line || '').trim()).filter(Boolean).slice(-5);
    interactionContext.hidden = !lines.length;
    interactionContext.textContent = lines.length ? `Recent context:\n${lines.join('\n')}` : '';
  }
  interactionDialog.className = ['interaction-dialog', dialogClass].filter(Boolean).join(' ');
  const resolvedCloseKind = closeKind || (resolvedFamily === 'document' && !gameViewSnapshot.activePrompt && !gameViewSnapshot.currentMenu?.awaitingSelection ? 'close' : 'cancel');
  const requestedCancel = String(cancelText || '').replace(/\s*\/\s*Esc\s*/i, '').trim();
  interactionCancel.textContent = /^(Close|Cancel|Back|Continue)$/i.test(requestedCancel)
    ? requestedCancel.replace(/^./, (letter) => letter.toUpperCase())
    : (sharedModules.uxDialogShell?.closeLabels?.[resolvedCloseKind] || 'Cancel');
  interactionTextLabel.textContent = textLabel;
  interactionTextRow.hidden = !textEntry;
  interactionText.placeholder = textPlaceholder;
  if (!textEntry || isNewInteraction) interactionText.value = '';
  interactionFeedback.textContent = '';
  if (interactionPanelControls) {
    interactionPanelControls.hidden = !panelControls;
    interactionPanelControls.textContent = '';
    if (panelControls) interactionPanelControls.appendChild(panelControls);
  }
  interactionSelectAll.hidden = !onSelectAll;
  interactionSelectAll.textContent = selectAllText;
  interactionSelectAll.onclick = onSelectAll || null;
  interactionClear.hidden = !onClear;
  interactionClear.textContent = clearText;
  interactionClear.onclick = onClear || null;
  interactionRefresh.hidden = true;
  interactionConfirm.hidden = !onConfirm;
  interactionConfirm.textContent = confirmText || 'Apply selection';
  interactionConfirm.onclick = onConfirm || null;
  const previousFocusedChoice = document.activeElement?.closest?.('#interaction-options .choice-button');
  const previousStableId = previousFocusedChoice?.dataset?.stableId || '';
  const previousChoiceKey = previousFocusedChoice?.dataset?.key || '';
  const previousScrollTop = interactionOptions.scrollTop;
  interactionOptions.textContent = '';
  let optionDragSuppressClickUntil = 0;
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `choice-button${option.className ? ` ${option.className}` : ''}`;
    button.dataset.key = option.key || '';
    button.dataset.stableId = String(option.stableId || option.objectId || option.key || '');
    button.dataset.filterText = `${option.label || ''} ${option.text || ''} ${option.key || ''} ${option.filterText || ''}`.toLowerCase();
    button.dataset.filterTags = Array.isArray(option.filterTags) ? option.filterTags.join(' ') : '';
    if (option.role) button.setAttribute('role', option.role);
    if (option.role === 'checkbox') button.setAttribute('aria-checked', 'false');
    if (option.ariaLabel) button.setAttribute('aria-label', option.ariaLabel);
    if (option.onContextMenu) {
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        option.onContextMenu(event, button);
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          event.stopPropagation();
          option.onKeyContextMenu ? option.onKeyContextMenu(button) : option.onContextMenu(event, button);
        }
      });
    }
    if (option.draggable) {
      button.draggable = true;
      button.dataset.dragSelector = option.dragData?.selector || option.key || '';
      button.dataset.dragItemName = option.dragData?.itemName || option.text || '';
      button.addEventListener('dragstart', (event) => {
        const selector = button.dataset.dragSelector || '';
        event.dataTransfer?.setData('application/x-nethack-selector', selector);
        event.dataTransfer?.setData('text/plain', selector);
        event.dataTransfer?.setDragImage?.(button, 12, 12);
        optionDragSuppressClickUntil = Date.now() + 800;
        button.classList.add('dragging');
      });
      button.addEventListener('dragend', () => {
        optionDragSuppressClickUntil = Date.now() + 800;
        button.classList.remove('dragging');
      });
    }
    button.innerHTML = option.html || `<strong>${option.label || option.key}</strong><span>${option.text || ''}</span>`;
    button.addEventListener('click', (event) => {
      if (Date.now() < optionDragSuppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (option.suppressClickAction) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      closeGroundItemContextMenu();
      if (option.onClick) option.onClick(button, event);
      else sendPlayableText(option.key);
    });
    if (option.onDoubleClick) {
      button.addEventListener('dblclick', (event) => {
        closeGroundItemContextMenu();
        event.preventDefault();
        event.stopPropagation();
        option.onDoubleClick(button, event);
      });
    }
    if (option.onQuantityChange) button.addEventListener('quantitychange', (event) => option.onQuantityChange(button, event.detail));
    interactionOptions.appendChild(button);
  }
  const interactionSpec = sharedModules.uxDialogShell?.applyDialogSpec?.({
    dialog: interactionDialog,
    titleElement: interactionTitle,
    descriptionElement: interactionPrompt,
    optionsElement: interactionOptions,
    choices: interactionOptions.querySelectorAll('.choice-button'),
    spec: {
      id: `interaction:${resolvedFamily}`,
      family: resolvedFamily,
      title: interactionTitle.textContent || 'NetHack choice',
      description: interactionPrompt.textContent || '',
      initialFocus: textEntry ? '#interaction-text' : (resolvedFamily === 'confirmation' ? '[data-key="y"]' : 'first-choice'),
      returnFocus: 'invoker',
      escapePolicy: escapePolicy || (resolvedCloseKind === 'close' ? 'close' : 'cancel'),
      primaryAction: onConfirm ? { label: confirmText || 'Confirm' } : undefined,
      secondaryActions: [],
      closeKind: resolvedCloseKind,
    },
  });
  if (!interactionDialog.open) {
    uxFocusLayer?.prepareOpen?.(interactionDialog, document.activeElement);
    interactionDialog.showModal();
    interactionTitle.tabIndex = -1;
  }
  uxFocusLayer?.open?.({
    id: interactionSpec?.id || 'interaction',
    element: interactionDialog,
    domain: 'interaction',
    initialFocus: () => {
      if (resolvedFamily === 'confirmation') return interactionOptions.querySelector('[data-key="y"]') || visibleInteractionChoices()[0] || interactionCancel;
      if (textEntry) return interactionText;
      return visibleInteractionChoices()[0] || interactionCancel;
    },
    returnFocus: 'invoker',
    domainFallback: () => gameGrid,
    escapePolicy: interactionSpec?.escapePolicy || 'cancel',
    focusDelayMs: resolvedFamily === 'confirmation' ? 0 : 160,
  });
  const restoredChoice = !isNewInteraction && previousStableId
    ? Array.from(interactionOptions.querySelectorAll('.choice-button')).find((button) => button.dataset.stableId === previousStableId)
    : (!isNewInteraction && previousChoiceKey ? Array.from(interactionOptions.querySelectorAll('.choice-button')).find((button) => button.dataset.key === previousChoiceKey) : null);
  if (!isNewInteraction) interactionOptions.scrollTop = previousScrollTop;
  if (restoredChoice) {
    interactionOptions.querySelectorAll('.choice-button').forEach((button) => { button.tabIndex = button === restoredChoice ? 0 : -1; });
    restoredChoice.focus({ preventScroll: true });
  } else if (textEntry) {
    interactionText.disabled = false;
    interactionText.readOnly = false;
    interactionText.focus({ preventScroll: true });
    interactionText.select();
  } else {
    const affirmativeConfirmationChoice = resolvedFamily === 'confirmation' ? interactionOptions.querySelector('[data-key="y"]') : null;
    const [firstChoice] = visibleInteractionChoices();
    (affirmativeConfirmationChoice || firstChoice || interactionCancel).focus({ preventScroll: true });
  }
  const applyFilter = () => {
    const raw = interactionText.value.trim().toLowerCase();
    const terms = raw.split(/\s+/).filter(Boolean);
    const selectorKeys = selectedKeysFromMenuExpression(raw);
    const selectionSyntax = (/^\d+[a-z$]$/i.test(raw) || raw.includes('-') || raw.replace(/\s+/g, '').length <= 3) && Boolean(selectorKeys.size);
    let visible = 0;
    for (const button of interactionOptions.querySelectorAll('.choice-button')) {
      const keyMatch = selectorKeys.has(button.dataset.key) || (/^\d+[a-z$]$/i.test(raw) && button.dataset.key === raw.slice(-1));
      const matches = !terms.length || (selectionSyntax ? true : terms.every((term) => button.dataset.filterText.includes(term)));
      button.hidden = !matches;
      button.setAttribute('aria-selected', keyMatch ? 'true' : 'false');
      if (matches) visible += 1;
    }
    interactionFeedback.textContent = feedback ? feedback(interactionText.value, visible) : (textEntry && options.length ? `${visible} matching option${visible === 1 ? '' : 's'}.` : '');
  };
  interactionOptions.querySelectorAll('.quantity-control').forEach((control) => {
    const row = control.closest('.choice-button');
    const key = row?.dataset.key;
    const input = control.querySelector('.quantity-input');
    const commit = () => {
      if (!row || !key || !input) return;
      const max = Number(input.max) || 1;
      const count = Math.max(1, Math.min(max, Number(input.value) || max));
      input.value = String(count);
      row.dispatchEvent(new CustomEvent('quantitychange', { bubbles: true, detail: { key, count, max } }));
    };
    control.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const stepButton = event.target.closest('.quantity-step');
      if (stepButton && input) input.value = String(Math.max(1, Math.min(Number(input.max) || 1, (Number(input.value) || 1) + Number(stepButton.dataset.step || 0))));
      if (event.target.closest('.quantity-max') && input) input.value = input.max || input.value;
      commit();
    });
    input?.addEventListener('input', (event) => { event.stopPropagation(); commit(); });
    input?.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelActiveInteraction();
      }
    });
  });
  interactionText.oninput = textEntry ? applyFilter : null;
  applyFilter();
  const lockedFailure = failureSurfaceState.get(interactionDialog);
  if (lockedFailure) applyFailureSurfaceLock(interactionDialog, lockedFailure.presentation, lockedFailure.preserved);
}

function renderDocumentWindow() {
  if (!documentWindow) return;
  const needle = documentFilter.value.trim().toLowerCase();
  const lines = documentWindow.lines || [];
  const filtered = needle ? lines.filter((line) => line.toLowerCase().includes(needle)) : lines;
  documentTitle.textContent = documentWindow.title || 'NetHack window';
  documentBody.textContent = filtered.join('\n') || '(no matching lines)';
}

function isIntroLoreWindow(lines) {
  const compact = (lines || []).filter(Boolean).join('\n');
  return /It is written in the Book of [^:\n]+:/i.test(compact)
    && /Moloch/i.test(compact)
    && /Amulet of Yendor/i.test(compact)
    && /Go bravely with/i.test(compact);
}

function introDeity(lines) {
  const match = (lines || []).join('\n').match(/It is written in the Book of ([^:\n]+):/i);
  return match ? match[1].trim() : 'Destiny';
}

function renderIntroWindow() {
  if (!introWindow) return;
  const lines = introWindow.lines || [];
  introTitle.textContent = `The Book of ${introDeity(lines)}`;
  introBody.replaceChildren();
  const storyLines = lines.filter((line) => !/^It is written in the Book of/i.test(String(line || '').trim()));
  const paragraphs = [];
  let current = [];
  for (const rawLine of storyLines) {
    const line = String(rawLine || '').trimEnd();
    if (!line.trim()) {
      if (current.length) paragraphs.push(current.join(' ').replace(/\s+/g, ' ').trim());
      current = [];
    } else {
      current.push(line.trim());
    }
  }
  if (current.length) paragraphs.push(current.join(' ').replace(/\s+/g, ' ').trim());
  if (paragraphs.length < 2 && storyLines.length > 5) {
    paragraphs.splice(0, paragraphs.length,
      storyLines.slice(0, 6).join(' ').replace(/\s+/g, ' ').trim(),
      storyLines.slice(6, 8).join(' ').replace(/\s+/g, ' ').trim(),
      storyLines.slice(8).join(' ').replace(/\s+/g, ' ').trim(),
    );
  }
  for (const paragraph of paragraphs.filter(Boolean)) {
    const p = document.createElement('p');
    p.textContent = paragraph;
    if (/Your hour of destiny|Go bravely/i.test(paragraph)) p.className = 'intro-callout';
    introBody.appendChild(p);
  }
}

function openIntroWindow({ lines }) {
  introWindow = { lines: lines.filter(Boolean) };
  introLoreShown = true;
  uxOnboarding?.observe?.({ type: 'dialog-opened', ownerId: 'intro' });
  renderIntroWindow();
  if (interactionDialog.open) closeInteractionDialog();
  if (!introDialog.open) { uxFocusLayer?.prepareOpen?.(introDialog, document.activeElement); introDialog.showModal(); }
  introTitle.focus({ preventScroll: true });
}

function isPassiveGroundTextWindow(title, lines) {
  const cleanLines = (lines || []).map((line) => String(line || '').trim()).filter(Boolean);
  if (!cleanLines.length) return false;
  // A terrain description (stairs, altar, etc.) may precede NetHack's pile
  // heading, so classification cannot rely on the first line alone. Item names
  // are deliberately ignored: words like "inventory" must not turn a passive
  // floor report into a blocking document.
  const groundHeading = cleanLines.some((line) => /^(?:other\s+)?things that are here[:.!?]?$/i.test(line));
  const helpLikeTitle = !title || /help\/file window|nethack window|window/i.test(String(title));
  if (!groundHeading || !helpLikeTitle) return false;
  if (Date.now() < pendingExplicitGroundLookUntil) {
    // Consume the one ground report owned by the player's explicit ':' look;
    // later movement/redraw reports are passive even if they arrive quickly.
    pendingExplicitGroundLookUntil = 0;
    return false;
  }
  pendingExplicitGroundLookUntil = 0;
  return true;
}

function groundItemsFromTextWindowLines(lines) {
  const cleanLines = (lines || []).map((line) => String(line || '').trim()).filter(Boolean);
  const headingIndex = cleanLines.findIndex((line) => /^(?:other\s+)?things that are here[:.!?]?$/i.test(line));
  const itemLines = headingIndex >= 0 ? cleanLines.slice(headingIndex + 1) : cleanLines;
  const rows = [];
  for (const [index, line] of itemLines.entries()) {
    let text = line.replace(/^\s*(?:you see here|there (?:is|are) here)[:\s]*/i, '').replace(/[.!?]+$/g, '').trim();
    if (!text || /^(?:several|many|some)?\s*objects?\s+here$/i.test(text)) continue;
    rows.push({ selector: 0, syntheticSelector: `ground-${index}`, text, syntheticGroundItem: true, semanticKind: 'object', semanticKnown: false, known: { identity: false, appearance: true } });
  }
  return rows;
}

function currentInventoryTransferRows() {
  const source = gameViewSnapshot.cachedInventoryChoices.length ? gameViewSnapshot.cachedInventoryChoices : (gameViewSnapshot.inventory?.orderedItems || []);
  const snapshotByLetter = new Map((gameViewSnapshot.inventory?.orderedItems || []).map((item) => [String(item.inventoryLetter || item.selector || '').trim(), item]));
  return source.filter((item) => itemHasNetHackSelector(item)).map((item) => {
    const selector = transferItemKey(item) || String(item.inventoryLetter || '').trim();
    const snapshot = snapshotByLetter.get(selector);
    if (!snapshot) return item;
    return {
      ...snapshot,
      ...item,
      objectId: Number.isInteger(item.objectId) && item.objectId > 0 ? item.objectId : snapshot.objectId,
      quantity: item.quantity ?? snapshot.quantity,
      text: `${selector ? `${selector} - ` : ''}${snapshot.displayName || item.displayName || item.text || 'item'}`,
      displayName: snapshot.displayName || item.displayName || item.text,
      semanticName: item.semanticName || snapshot.semanticName,
      semanticAppearance: item.semanticAppearance || snapshot.semanticAppearance,
      semanticKnown: item.semanticKnown ?? snapshot.semanticKnown,
      publicClass: item.publicClass || snapshot.publicClass,
      known: item.known ? { ...item.known } : (snapshot.known ? { ...snapshot.known } : undefined),
      knownFields: item.knownFields ? { ...item.knownFields } : (snapshot.knownFields ? { ...snapshot.knownFields } : undefined),
      ownership: item.ownership ? { ...item.ownership } : (snapshot.ownership ? { ...snapshot.ownership } : undefined),
      filterGroups: Array.isArray(item.filterGroups) ? item.filterGroups.slice() : (Array.isArray(snapshot.filterGroups) ? snapshot.filterGroups.slice() : undefined),
      actionAffordances: Array.isArray(item.actionAffordances) ? item.actionAffordances.slice() : (Array.isArray(snapshot.actionAffordances) ? snapshot.actionAffordances.slice() : undefined),
    };
  });
}

function transferShortcutForIndex(index) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return alphabet[index] || '';
}

function publicGroundTransferDisplayName(item = {}) {
  const glyphCode = Number(item.glyphChar);
  const ch = typeof item.objectClass === 'string' && item.objectClass.length
    ? item.objectClass[0]
    : (Number.isInteger(glyphCode) && glyphCode > 0 && glyphCode < 128 ? String.fromCharCode(glyphCode) : '');
  const publicName = item.semanticKnown === false
    ? sharedModules.tileAssets?.publicDisplayNameForCell?.({ ...item, ch, semanticKind: item.semanticKind || 'object' })
    : '';
  return String(publicName || item.displayName || item.text || item.semanticName || item.semanticAppearance || 'ground item').trim();
}

function groundPanelItemsFromPublicSnapshot(coord = groundPileCoordHere(), pileOverride = null) {
  const pile = pileOverride || groundPileAtCoord(coord);
  return (pile?.items || []).map((item, index) => {
    const displayName = publicGroundTransferDisplayName(item);
    return {
      ...item,
      text: displayName,
      displayName,
      objectId: Number.isInteger(item.objectId) ? item.objectId : undefined,
      quantity: Number.isInteger(item.quantity) ? item.quantity : undefined,
      glyph: item.glyph,
      glyphChar: item.glyphChar,
      objectClass: item.objectClass,
      publicClass: item.publicClass,
      semanticKind: item.semanticKind || 'object',
      semanticName: item.semanticName,
      semanticAppearance: item.semanticAppearance,
      semanticKnown: item.semanticKnown,
      known: item.known ? { ...item.known } : undefined,
      knownFields: item.knownFields ? { ...item.knownFields } : undefined,
      ownership: item.ownership ? { ...item.ownership } : undefined,
      filterGroups: Array.isArray(item.filterGroups) ? item.filterGroups.slice() : undefined,
      actionAffordances: Array.isArray(item.actionAffordances) ? item.actionAffordances.slice() : undefined,
      displaySelector: transferShortcutForIndex(index),
      syntheticSelector: Number.isInteger(item.objectId) && item.objectId > 0 ? `ground-object-${item.objectId}` : `ground-snapshot-${index}`,
    };
  });
}

function hydrateGroundTransferPanelFromPublicSnapshot(snapshot = null) {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'ground-pickup' || !snapshot?.coord) return false;
  if (Number(snapshot.coord.x) !== Number(groundPileCoordHere().x) || Number(snapshot.coord.y) !== Number(groundPileCoordHere().y)) return false;
  const leftRows = groundPanelItemsFromPublicSnapshot(snapshot.coord, snapshot);
  dispatchTransferSessionEvent({ type: 'pane', side: 'left', rows: leftRows });
  renderContainerTransferPanel();
  return true;
}

function openGroundTransferPanelFromSnapshot(reason = 'public ground snapshot') {
  const coord = groundPileCoordHere();
  // A snapshot-backed open is not coupled to any older comma/pickup menu.
  // Invalidate only this panel's deferred handoff; live NetHack prompts remain
  // authoritative and are never force-cleared here.
  const leftItems = groundPanelItemsFromPublicSnapshot(coord);
  if (!leftItems.length) return false;
  const inventoryRows = currentInventoryTransferRows();
  transferPresentation = {
    ...(transferPresentation || {}),
    active: true,
    sessionKind: 'ground-pickup',
    presentationMode: 'ground-snapshot',
    prompt: 'Ground items',
    snapshotGroundItems: true,
    textWindowGroundItems: false,
    interrupted: false,
    loadedSides: { left: true, right: inventoryRows.length > 0 },
    feedback: inventoryRows.length
      ? 'Select items with the checkboxes or letter shortcuts, then press Enter. You can also drag items between panes.'
      : 'Ground items are ready. Select with letter shortcuts; your inventory will appear when NetHack finishes updating it.'
  };
  dispatchTransferSessionEvent({
    type: 'open',
    kind: 'ground-pickup',
    route: 'direct',
    sessionId: transferSession.snapshot().sessionId,
    prompt: transferPresentation.prompt,
    groundCoord: coord,
    leftRows: leftItems,
    rightRows: inventoryRows,
    loadedSides: transferPresentation.loadedSides,
    feedback: transferPresentation.feedback,
  });
  renderContainerTransferPanel();
  setStatus('Pick up items from the ground.');
  return true;
}

function notePassiveGroundTextWindow(lines) {
  // A NetHack menu can emit a short text window while an active transfer is
  // settling. It is not a complete observation of the floor pile; the public
  // ground snapshot remains authoritative for the session.
  if (transferSession.snapshot().active || gameViewSnapshot.transferTransactions?.activeSessionId) return true;
  const cleanLines = (lines || []).map((line) => String(line || '').trim()).filter(Boolean);
  const items = groundItemsFromTextWindowLines(cleanLines);
  if (!items.length) return false;
  rememberGroundItemsHere('text-window', items.map((item) => item.text));
  rememberGroundPileFromVisibleRows(items, { layer: 'renderer' });
  documentWindow = null;
  if (documentDialog.open) documentDialog.close('silent');
  renderContextActionBar();
  const passiveStatus = 'Ground items here — use Pick up or comma.';
  setStatus(passiveStatus);
  window.setTimeout(() => {
    if (!transferPresentation?.active && hasKnownGroundItemsHere()) setStatus(passiveStatus);
  }, 0);
  return true;
}

function openDocumentWindow({ title, lines }) {
  const cleanLines = lines.filter(Boolean);
  if (maybeCompleteInventoryLazyLoadFromTextWindow(cleanLines)) return;
  // NetHack reports a multi-item floor pile through a blocking-looking text
  // window while entering or redrawing a square.  Treat that report as public
  // ground evidence only: movement, level load, and redraw must never open the
  // pickup/transfer UI.  Explicit Pickup or comma remains the sole opener.
  if (isPassiveGroundTextWindow(title, cleanLines) && notePassiveGroundTextWindow(cleanLines)) return;
  if (isIntroLoreWindow(cleanLines)) {
    if (!introLoreShown && !gameViewSnapshot.activePrompt && !interactionDialog.open) openIntroWindow({ lines: cleanLines });
    else {
      appendMessage('NetHack repeated startup text during item selection; keeping the current prompt open.');
      setStatus('current item prompt remains active');
    }
    return;
  }
  const playerTitle = /help\/file window|^nethack window$|^window$/i.test(String(title || '').trim()) ? 'Help' : title;
  const playerLines = cleanLines.filter((line) => !/^\s*NetHack help\/file window\s*$/i.test(String(line)));
  documentWindow = { title: playerTitle, lines: playerLines };
  documentFilter.value = '';
  renderDocumentWindow();
  if (!documentDialog.open) {
    const invoker = pendingDocumentReturnFocus && sharedModules.uxFocusLayer?.isUsable?.(pendingDocumentReturnFocus) ? pendingDocumentReturnFocus : document.activeElement;
    pendingDocumentReturnFocus = null;
    uxFocusLayer?.prepareOpen?.(documentDialog, invoker);
    documentDialog.showModal();
  }
  documentFilter?.focus({ preventScroll: true });
}

documentFilter.addEventListener('input', renderDocumentWindow);
introDialog.addEventListener('keydown', (event) => event.stopPropagation());
introDialog.addEventListener('close', () => {
  uxOnboarding?.observe?.({ type: 'dialog-closed', ownerId: 'intro' });
  // The Electron intro is a renderer presentation of NetHack's already-printed
  // role lore, not a NetHack --More-- prompt.  Do not send Space when the user
  // clicks "Begin the descent"; doing so leaked an unsolicited blank command
  // into the live game and produced "Unknown command ' '." at startup.
  introWindow = null;
  if (gameViewSnapshot.activePrompt) window.setTimeout(renderPromptPanel, 0);
});







function inventoryPromptKey(query, choices) {
  return `${String(query || '')}\n${String(choices || '')}`;
}

function clearInventoryLazyLoad() {
  if (inventoryLazyLoad?.timer) window.clearTimeout(inventoryLazyLoad.timer);
  inventoryLazyLoad = null;
}

function rememberCanceledInventoryLazyLoad() {
  if (!inventoryLazyLoad || !['loading', 'failed'].includes(inventoryLazyLoad.status)) return false;
  canceledInventoryLazyLoadSelectors = new Set(inventoryLazyLoad.selectors || []);
  canceledInventoryLazyLoadMenuUntil = Date.now() + 2500;
  clearInventoryLazyLoad();
  return true;
}

function isCanceledInventoryLazyLoadMenu(menu) {
  if (!menu) return false;
  if (menu.__canceledInventoryLazyLoadMenu) return true;
  if (Date.now() > canceledInventoryLazyLoadMenuUntil) return false;
  const prompt = String(menu.prompt || '').trim();
  if (!/^(?:Inventory|Possessions):?$/i.test(prompt)) return false;
  const rows = (menu.items || []).filter((item) => item.selector);
  if (!rows.length) return false;
  const selectorMatches = !canceledInventoryLazyLoadSelectors.size || rows.some((item) => canceledInventoryLazyLoadSelectors.has(String.fromCharCode(item.selector)));
  return selectorMatches && lastWorldCommand !== 'i';
}

function lazyLoadedInventoryChoices(query, choices) {
  const key = inventoryPromptKey(query, choices);
  return inventoryLazyLoad?.promptKey === key && inventoryLazyLoad.status === 'loaded' && Array.isArray(inventoryLazyLoad.rows) ? inventoryLazyLoad.rows : [];
}



function inventoryRowsFromTextWindowLines(lines, query, choices) {
  const selectors = sharedModules.interactionModel.selectorSet(query, choices);
  if (!selectors.size) return [];
  const rows = [];
  const seen = new Set();
  const itemPattern = /(?:^|\s)([A-Za-z$])\s*[-+]\s+([^\n.?!]+(?:potion|liquid|water|juice|booze|scroll|spellbook|book|food|ration|corpse|apple|orange|pear|melon|banana|carrot|egg|tin|cream pie|candy bar|lichen)[^\n.?!]*)(?=$|[.?!]|\s+[A-Za-z$]\s*[-+])/ig;
  for (const rawLine of lines || []) {
    const line = String(rawLine || '').replace(/\s+/g, ' ').trim();
    if (!line || /^(?:what do you want to|choose|never mind)/i.test(line)) continue;
    for (const match of line.matchAll(itemPattern)) {
      const key = match[1];
      if (!selectors.has(key) || seen.has(key)) continue;
      const itemName = String(match[2] || '').replace(/\s+/g, ' ').trim();
      if (!itemName || /^(?:what do you want|choose|never mind)/i.test(itemName)) continue;
      if (!sharedModules.interactionModel.inventoryTextRowActionMatches(query, itemName)) continue;
      seen.add(key);
      rows.push({ selector: key.charCodeAt(0), text: `${key} - ${itemName}`, glyphChar: /potion|liquid|water|juice|booze/i.test(itemName) ? '!'.charCodeAt(0) : undefined, semanticKind: 'object', semanticName: itemName });
    }
  }
  return rows;
}

function maybeCompleteInventoryLazyLoadFromTextWindow(lines) {
  if (!inventoryLazyLoad || !['loading', 'failed'].includes(inventoryLazyLoad.status)) return false;
  const rows = inventoryRowsFromTextWindowLines(lines, inventoryLazyLoad.query, inventoryLazyLoad.choices);
  if (!rows.length) return false;
  if (inventoryLazyLoad.timer) window.clearTimeout(inventoryLazyLoad.timer);
  inventoryLazyLoad = { ...inventoryLazyLoad, status: 'loaded', rows, timer: null };
  publishRendererGameViewEvent({ name: 'renderer_publish_inventory_choices', items: rows });
  if (gameViewSnapshot.activePrompt?.kind === 'question' && inventoryPromptKey(gameViewSnapshot.activePrompt.query, gameViewSnapshot.activePrompt.choices) === inventoryLazyLoad.promptKey) window.setTimeout(renderPromptPanel, 0);
  setStatus('inventory choices loaded');
  return true;
}

function actionInventoryOptions(query, choices) {
  const selectors = sharedModules.interactionModel.selectorSet(query, choices);
  const sourceRows = gameViewSnapshot.cachedInventoryChoices.length ? gameViewSnapshot.cachedInventoryChoices : lazyLoadedInventoryChoices(query, choices);
  if (!selectors.size || !sourceRows.length) return [];
  return sourceRows.filter((item) => selectors.has(String.fromCharCode(item.selector)) && (!sharedModules.interactionModel.promptRequiresNamedInventoryRows(query) || sharedModules.interactionModel.inventoryTextRowActionMatches(query, item.text || menuItemSemanticDisplayName(item) || '')));
}

function maybeCompleteInventoryLazyLoadFromMenu() {
  if (!inventoryLazyLoad || !['loading', 'loaded'].includes(inventoryLazyLoad.status)) return false;
  const selectors = inventoryLazyLoad.selectors || new Set();
  const rows = (gameViewSnapshot.currentMenu?.items || []).filter((item) => item?.selector && selectors.has(String.fromCharCode(item.selector)));
  if (!rows.length) return false;
  const previousCount = Array.isArray(inventoryLazyLoad.rows) ? inventoryLazyLoad.rows.length : 0;
  if (inventoryLazyLoad.timer) window.clearTimeout(inventoryLazyLoad.timer);
  inventoryLazyLoad = { ...inventoryLazyLoad, status: 'loaded', rows, timer: null };
  return inventoryLazyLoad.status === 'loaded' && rows.length !== previousCount;
}

function ensureInventoryLazyLoad(query, choices) {
  // Transfer Session and the locked-container continuation already own exact
  // public inventory rows. Expanding either prompt with `?` would replace the
  // correlated prompt before its selected row can be dispatched.
  if (transferSession.snapshot().pending?.direction === 'inventory-to-ground' || pendingContainerUnlockOpen?.phase === 'awaiting-unlock-target') return null;
  if (Date.now() < suppressInventoryLazyLoadUntil) return null;
  const selectors = sharedModules.interactionModel.selectorSet(query, choices);
  if (!selectors.has('?')) return null;
  const key = inventoryPromptKey(query, choices);
  if (inventoryLazyLoad?.promptKey === key) return inventoryLazyLoad;
  clearInventoryLazyLoad();
  inventoryLazyLoad = { promptKey: key, query, choices, selectors, status: 'loading', rows: [], timer: null };
  inventoryLazyLoad.timer = window.setTimeout(() => {
    if (!inventoryLazyLoad || inventoryLazyLoad.promptKey !== key || inventoryLazyLoad.status !== 'loading') return;
    inventoryLazyLoad = { ...inventoryLazyLoad, status: 'failed', timer: null };
    if (gameViewSnapshot.activePrompt?.kind === 'question' && inventoryPromptKey(gameViewSnapshot.activePrompt.query, gameViewSnapshot.activePrompt.choices) === key) renderPromptPanel();
  }, inventoryLazyLoadTimeoutMs);
  sendPlayableKey('?');
  return inventoryLazyLoad;
}







function objectClassPanelControls(classRows = []) {
  if (!classRows.length) return null;
  const groups = Array.from(new Set(classRows.map((row) => row.group || 'Other')));
  const wrap = document.createElement('div');
  wrap.className = 'object-class-panel-controls';
  const heading = document.createElement('strong');
  heading.textContent = 'Item classes';
  wrap.appendChild(heading);
  const addFilter = (group, label) => {
    const control = document.createElement('button');
    control.type = 'button';
    control.dataset.classGroup = group;
    control.setAttribute('aria-pressed', String(group === 'all'));
    control.textContent = label;
    control.addEventListener('click', (event) => {
      event.preventDefault();
      const rows = Array.from(interactionOptions.querySelectorAll('.choice-button.class-choice'));
      let visible = 0;
      for (const row of rows) {
        const classGroup = classRows.find((entry) => entry.key === row.dataset.key)?.group || 'Other';
        const show = group === 'all' || classGroup === group;
        row.hidden = !show;
        if (show) visible += 1;
      }
      interactionPanelControls?.querySelectorAll('button[data-class-group]')?.forEach((button) => button.setAttribute('aria-pressed', String(button === control)));
      interactionFeedback.textContent = `${visible} class${visible === 1 ? '' : 'es'} shown.`;
    });
    wrap.appendChild(control);
  };
  addFilter('all', 'All classes');
  for (const group of groups) addFilter(group, group);
  return wrap;
}








function hideDirectionHelper() {
  // Default gameplay must keep a compact movement pad visible on the right side
  // of the log area.  Previous target-mode work hid this whole helper outside
  // prompts, leaving only stale toolbar focus and no obvious keyboard/movement
  // affordance.  Reset to movement-only controls instead of removing it.
  renderDirectionHelper('Movement', { promptActive: false });
}









function focusDirectionHelperButton(delta = 1) {
  const buttons = Array.from(directionHelperOptions.querySelectorAll('button.direction-pad-button'));
  if (!buttons.length) return false;
  const current = document.activeElement;
  const index = buttons.indexOf(current);
  buttons[(index < 0 ? 0 : (index + delta + buttons.length) % buttons.length)]?.focus({ preventScroll: true });
  return true;
}

function renderDirectionHelper(query, { promptActive = true } = {}) {
  if (introDialog.open) return;
  if (promptActive && interactionDialog.open) closeInteractionDialog();
  directionHelper.hidden = false;
  document.body.classList.add('direction-helper-active');
  directionHelperTitle.textContent = promptActive ? 'Direction' : 'Move';
  directionHelperOptions.textContent = '';
  for (const option of directionChoiceOptions()) {
    if (option.isCenter) {
      if (promptActive) {
        const center = document.createElement('span');
        center.className = 'direction-pad-center';
        center.setAttribute('aria-hidden', 'true');
        center.textContent = '·';
        directionHelperOptions.appendChild(center);
      } else {
        const run = document.createElement('button');
        run.type = 'button';
        run.className = 'direction-pad-center direction-pad-run';
        run.dataset.compassRun = 'true';
        run.textContent = 'Run';
        run.addEventListener('click', () => {
          if (hasActiveUiInputOwner()) {
            setStatus('Finish the current choice before arming Run.');
            return;
          }
          compassRunArmed = !compassRunArmed;
          updateCompassRunButton();
          setStatus(compassRunArmed ? 'Run armed — choose a direction.' : 'Run cancelled — compass will walk.');
        });
        directionHelperOptions.appendChild(run);
        updateCompassRunButton();
      }
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `direction-pad-button ${option.className || ''}`;
    button.dataset.key = option.key;
    button.setAttribute('aria-label', option.text);
    button.textContent = option.label;
    button.addEventListener('click', () => {
      if (!promptActive) sendCompassMovement(option.key);
      else if (option.key === '.') sendMovementCommand(option.key);
      else sendPlayableText(option.key);
      gameGrid.focus({ preventScroll: true });
    });
    directionHelperOptions.appendChild(button);
  }
}


function directionChoiceOptions() {
  return [
    ['y', '↖', 'Northwest'], ['k', '↑', 'North'], ['u', '↗', 'Northeast'],
    ['h', '←', 'West'], ['.', '·', 'Wait / self'], ['l', '→', 'East'],
    ['b', '↙', 'Southwest'], ['j', '↓', 'South'], ['n', '↘', 'Southeast'],
  ].map(([key, label, text]) => ({ key, label, text, isCenter: key === '.', className: 'direction-choice' }));
}




function recentPromptContextLines(query, limit = 5) {
  const promptText = String(query || '').trim();
  return gameViewSnapshot.messages
    .slice(-12)
    .map((line) => String(line || '').trim())
    .filter((line) => line && line !== promptText && !/^GUI\b/.test(line))
    .slice(-limit);
}







function workflowPrefix() {
  return activeWorkflowContext?.label ? `${activeWorkflowContext.label} → ` : '';
}

function workflowPromptText(text) {
  const prefix = workflowPrefix();
  return prefix ? `${prefix}${text || ''}` : (text || '');
}

function clearPromptOwnerState({ clearWorkflow = false, clearMenu = false } = {}) {
  publishRendererGameViewEvent({
    name: 'renderer_dismiss_interaction',
    expectedRequestId: gameViewSnapshot.activePrompt?.requestId || gameViewSnapshot.currentMenu?.requestId || '',
    clearMenu,
  });
  if (clearWorkflow) {
    clearWorkflowContext();
    lastInventoryActionQuery = '';
  }
  if (promptPanel) {
    promptPanel.hidden = true;
    promptPanel.textContent = 'No active prompt.';
  }
  clearInventoryLazyLoad();
}

function pruneContainerTransferExtendedPromptSuppressTokens(now = performance.now()) {
  containerTransferExtendedPromptSuppressTokens = containerTransferExtendedPromptSuppressTokens.filter((token) => !token.consumed && token.expiresAt > now);
  if (gameViewSnapshot.activePrompt?.kind !== 'extended command') containerTransferSuppressedExtendedPrompt = null;
}

function activeExtendedPromptHasExplicitInternalContainerMarker() {
  if (gameViewSnapshot.activePrompt?.kind !== 'extended command') return false;
  const ownerKind = String(gameViewSnapshot.activePrompt.owner?.kind || '').toLowerCase();
  const sourceText = `${gameViewSnapshot.activePrompt.requestSource?.layer || ''} ${gameViewSnapshot.activePrompt.requestSource?.source || ''} ${gameViewSnapshot.activePrompt.requestSource?.reason || ''}`.toLowerCase();
  return ownerKind === 'container' || /container-transfer|container transfer|internal-container/.test(sourceText);
}

function activeExtendedPromptIsExplicitPlayerCommand() {
  if (gameViewSnapshot.activePrompt?.kind !== 'extended command') return false;
  const ownerKind = String(gameViewSnapshot.activePrompt.owner?.kind || '').toLowerCase();
  const sourceText = `${gameViewSnapshot.activePrompt.requestSource?.layer || ''} ${gameViewSnapshot.activePrompt.requestSource?.source || ''} ${gameViewSnapshot.activePrompt.requestSource?.reason || ''}`.toLowerCase();
  return ownerKind === 'player' || /player|user|command-button|quick-action|manual-command/.test(sourceText);
}

function activeExtendedPromptSuppressionReason() {
  if (!transferPresentation?.active || gameViewSnapshot.activePrompt?.kind !== 'extended command') return '';
  if (containerTransferSuppressedExtendedPrompt?.prompt === gameViewSnapshot.activePrompt) return containerTransferSuppressedExtendedPrompt.reason || 'container transfer internal command routing';
  const now = performance.now();
  pruneContainerTransferExtendedPromptSuppressTokens(now);
  const token = containerTransferExtendedPromptSuppressTokens.find((candidate) => !candidate.consumed && candidate.expiresAt > now);
  if (activeExtendedPromptHasExplicitInternalContainerMarker() && !activeExtendedPromptIsExplicitPlayerCommand()) {
    containerTransferSuppressedExtendedPrompt = { prompt: gameViewSnapshot.activePrompt, reason: 'container transfer internal command routing', tokenId: token?.id || 0 };
    if (token) token.consumed = true;
    pruneContainerTransferExtendedPromptSuppressTokens(now);
    diagnosticEvent('prompt', 'container-transfer.extended-command-suppressed', { reason: containerTransferSuppressedExtendedPrompt.reason, tokenId: token?.id || 0, command: token?.command || '', promptMarker: 'internal-container' });
    return containerTransferSuppressedExtendedPrompt.reason;
  }
  if (!token || activeExtendedPromptIsExplicitPlayerCommand()) return '';
  token.consumed = true;
  containerTransferLastExtendedPromptSuppressionAt = now;
  containerTransferSuppressedExtendedPrompt = { prompt: gameViewSnapshot.activePrompt, reason: token.reason || 'container transfer internal command routing', tokenId: token.id };
  pruneContainerTransferExtendedPromptSuppressTokens(now);
  diagnosticEvent('prompt', 'container-transfer.extended-command-suppressed', { reason: containerTransferSuppressedExtendedPrompt.reason, tokenId: token.id, command: token.command || '' });
  return containerTransferSuppressedExtendedPrompt.reason;
}

function containerTransferSuppressesExtendedPrompt() {
  return Boolean(activeExtendedPromptSuppressionReason());
}

function suppressContainerTransferExtendedPrompt(reason = 'container transfer internal command routing', commandText = '', durationMs = 1200) {
  const command = String(commandText || '');
  const count = Math.max(2, (command.match(/#/g) || []).length);
  const now = performance.now();
  pruneContainerTransferExtendedPromptSuppressTokens(now);
  for (let index = 0; index < count; index += 1) {
    containerTransferExtendedPromptSuppressTokens.push({
      id: ++containerTransferExtendedPromptSuppressSequence,
      reason,
      command,
      createdAt: now,
      expiresAt: now + durationMs,
      consumed: false,
    });
  }
}

function transferPanelOwnsMenu(menu = gameViewSnapshot.currentMenu) {
  if (!transferPresentation?.active || !menu?.awaitingSelection) return false;
  if (transferPresentation.sessionKind === 'ground-pickup') return panelOwnedGroundPickupMenu(menu);
  if (transferPresentation.sessionKind !== 'container') return false;
  return isContainerActionMenu(menu)
    || isContainerExpectedTakeOutMenu(menu)
    || isContainerExpectedPutInMenu(menu)
    || isContainerCategoryMenu(menu)
    || isContainerInventoryProbeMenu(menu);
}

function clearTransferPanelOwnerChrome() {
  const suppressedExtendedPromptReason = activeExtendedPromptSuppressionReason();
  const panelOwnsMenu = transferPanelOwnsMenu(gameViewSnapshot.currentMenu);
  const transferOwnsPrompt = (gameViewSnapshot.activePrompt?.kind === 'menu selection' && panelOwnsMenu)
    || (gameViewSnapshot.activePrompt?.kind === 'read-only menu' && panelOwnsMenu)
    || gameViewSnapshot.activePrompt?.owner?.kind === 'container'
    || gameViewSnapshot.activePrompt?.owner?.kind === 'ground'
    || Boolean(suppressedExtendedPromptReason);
  if (transferOwnsPrompt) {
    publishRendererGameViewEvent({ name: 'renderer_dismiss_interaction', expectedRequestId: gameViewSnapshot.activePrompt?.requestId || '', clearMenu: false });
    // Keep containerTransferSuppressedExtendedPrompt associated with the prompt
    // object through this render pass. Clearing it here can let later cleanup
    // calls treat the same internal prompt as new and consume bounded
    // suppression tokens before NetHack repeats its prompt update.
    if (suppressedExtendedPromptReason) closeInteractionDialog({ force: true });
  }
  // A genuinely unrelated live prompt/menu must remain visible and retain its
  // NetHack owner. renderMenuPanel/renderActivePrompt will close the transfer
  // shell without answering it; never turn it into an invisible ghost lock.
  if ((gameViewSnapshot.currentMenu?.awaitingSelection && !panelOwnsMenu) || (gameViewSnapshot.activePrompt && !transferOwnsPrompt)) return;
  const staleExtendedDialog = transferPresentation?.active
    && interactionDialog?.open
    && /Extended command|filter\/type any # command|matching options/i.test(`${interactionTitle?.textContent || ''}\n${interactionPrompt?.textContent || ''}`)
    && gameViewSnapshot.activePrompt?.kind !== 'extended command';
  if (staleExtendedDialog) closeInteractionDialog({ force: true });
  if (promptPanel) {
    promptPanel.hidden = true;
    promptPanel.textContent = 'No active prompt.';
  }
  if (menuPanel) {
    menuPanel.hidden = true;
    menuPanel.textContent = 'Transfer panel active.';
  }
}

function containerTransferReadyStatusText() {
  if (!transferPresentation?.active) return '';
  const isGroundPickup = transferPresentation.sessionKind === 'ground-pickup';
  const leftLoaded = containerMenuItems('left').length > 0 || (!isGroundPickup && containerPaneLoaded('left'));
  const rightLoaded = containerMenuItems('right').length > 0 || (!isGroundPickup && containerPaneLoaded('right'));
  if (leftLoaded && rightLoaded) return isGroundPickup ? 'Ground items ready.' : 'Container and inventory ready.';
  return transferPresentation.feedback || (isGroundPickup ? 'ground transfer panel active' : 'container transfer panel active');
}

function settleTransferPanelOwnership() {
  if (!transferPresentation?.active) return;
  clearTransferPanelOwnerChrome();
  const statusText = containerTransferReadyStatusText();
  if (statusText) setStatus(statusText);
}

function activePromptIsOrphaned() {
  return Boolean(gameViewSnapshot.activePrompt)
    && !isActiveDirectionPrompt()
    && !interactionDialog?.open
    && !documentDialog?.open
    && !introDialog?.open
    && !characterDialog?.open
    && !actionDialog?.open
    && !settingsDialog?.open
    && !gameOverDialog?.open;
}

function setWorkflowContextFromButton(button, fallbackLabel = '') {
  if (!button) return;
  const command = String(button.dataset.extCommand || button.dataset.commandKey || '').trim().replace(/^#/, '');
  const label = String(button.dataset.workflowLabel || fallbackLabel || button.textContent || command || '').trim();
  activeWorkflowContext = command || label ? { command, label } : null;
}

function clearWorkflowContext() {
  activeWorkflowContext = null;
}

function promptOptionForDom(option, promptPlan) {
  if (Number(option?.selector) > 0) {
    const key = option.key || String.fromCharCode(option.selector);
    const glyph = option.glyphChar > 0 && option.glyphChar < 128 ? String.fromCharCode(option.glyphChar) : '';
    const assetId = mappedAssetIdForCell({ ch: glyph, glyph: option.glyph, semanticKind: option.semanticKind, semanticName: option.semanticName, semanticAppearance: option.semanticAppearance, semanticKnown: option.semanticKnown, cmapIndex: option.cmapIndex });
    const tile = assetId ? tileAssetsById.get(assetId) : undefined;
    return {
      ...option,
      key,
      className: 'inventory-row action-inventory-row',
      filterText: `${option.itemClass || ''} ${menuItemSemanticFilterText(option)}`,
      stableId: Number.isInteger(option.objectId) ? `object:${option.objectId}` : key,
      ariaLabel: `Choose ${option.itemName || option.text}${option.itemState ? `, ${option.itemState}` : ''}; shortcut ${key}`,
      html: renderInventoryOption(option, key, tile, assetId, { actionVerb: promptPlan.actionVerb }),
    };
  }
  const key = option?.key || '';
  const hint = option?.hint || (key === '\u001b' ? 'Esc' : key);
  const classGroup = option?.group ? `<span class="class-group">${escapeHtml(option.group)}</span>` : '';
  const noteClass = option?.serious ? 'choice-note danger-note' : 'choice-note';
  return {
    ...option,
    className: `${option?.className || 'letter-choice'} gui-visible-choice`,
    ariaLabel: `${option?.label || 'Choice'}${option?.text ? `; ${option.text}` : ''}${hint ? `; shortcut ${hint}` : ''}`,
    html: `<strong>${escapeHtml(option?.label || key)}</strong><span class="${noteClass}">${escapeHtml(option?.text || '')}</span>${classGroup}${hint ? `<span class="selector-hint">${escapeHtml(hint)}</span>` : ''}`,
  };
}

function renderPromptPanel() {
  reconcileItemEquipmentOwner({ interactionId: '', owner: Object.freeze({ kind: 'gameplay' }), prompt: Object.freeze({}), menu: Object.freeze({}) });
  const decision = interactionDecision('render-prompt');
  const promptPlan = decision.prompt;
  if (decision.owner.kind === 'context-dialog') {
    hideDirectionHelper();
    promptPanel.hidden = false;
    renderContextualPrompt(decision.contextDialog);
    return;
  }
  if (introDialog.open && gameViewSnapshot.activePrompt) {
    hideDirectionHelper();
    promptPanel.hidden = false;
    promptPanel.textContent = 'Intro is open; NetHack prompt is waiting behind it.';
    return;
  }
  if (!gameViewSnapshot.activePrompt) {
    hideDirectionHelper();
    promptPanel.hidden = true;
    promptPanel.textContent = 'No active prompt.';
    if (runningState.running && !gameViewSnapshot.currentMenu?.awaitingSelection && !topmostEscapeLayer()) showReadyNotice(`state:your-turn:${gameViewSnapshot.commandTransactions?.revision || shimEventCount}`);
    return;
  }
  if (gameViewSnapshot.activePrompt.kind === 'read-only menu' || decision.owner.kind === 'menu') {
    hideDirectionHelper();
    promptPanel.hidden = true;
    promptPanel.textContent = 'No active prompt.';
    return;
  }
  if (decision.owner.kind === 'equipment') {
    reconcileItemEquipmentOwner(decision);
    promptPanel.hidden = true;
    if (interactionDialog?.open) closeInteractionDialog({ force: true });
    promptPanel.textContent = 'Item/equipment owner has the active prompt.';
    return;
  }
  if (decision.owner.kind === 'transfer') {
    hideDirectionHelper();
    clearTransferPanelOwnerChrome();
    closeInteractionDialog({ force: true });
    setStatus(activeExtendedPromptSuppressionReason() || 'transfer interaction active');
    return;
  }
  if (gameViewSnapshot.activePrompt.kind === 'extended command' && activeWorkflowContext?.submittedExtendedCommand) {
    hideDirectionHelper();
    promptPanel.hidden = true;
    promptPanel.textContent = 'No active prompt.';
    closeInteractionDialog({ force: true });
    setStatus(`${activeWorkflowContext.label} command in progress`);
    return;
  }
  activeContextualPrompt = null;
  promptPanel.hidden = false;
  promptPanel.textContent = workflowPromptText(promptPlan.prompt || gameViewSnapshot.activePrompt.kind);
  if (promptPlan.kind === 'direction') {
    promptPanel.hidden = true;
    promptPanel.textContent = 'No active prompt.';
    showPlayerNotice({ id: `prompt:direction:${promptPlan.requestId || promptPlan.lifecycleRevision || shimEventCount}`, kind: 'info', message: promptPlan.title, source: 'prompt', persistence: 'until-state-change' });
    renderDirectionHelper(promptPlan.prompt, { promptActive: true });
    return;
  }
  if (activeContextualPrompt) activeContextualPrompt = null;
  hideDirectionHelper();
  if (gameViewSnapshot.activePrompt.kind === 'question') {
    const query = gameViewSnapshot.activePrompt.query || 'Choose an answer.';
    let lazyLoadState = inventoryLazyLoad;
    if (promptPlan.shouldRequestInventory && !promptPlan.inventoryRows.length) lazyLoadState = ensureInventoryLazyLoad(query, gameViewSnapshot.activePrompt.choices);
    const loadingInventoryRows = promptPlan.classification === 'inventory' && !promptPlan.inventoryRows.length && lazyLoadState?.status === 'loading';
    const namedInventoryLoadFailed = promptPlan.requiresNamedInventoryRows && !promptPlan.inventoryRows.length && lazyLoadState?.status === 'failed';
    const options = loadingInventoryRows ? [] : promptPlan.options.map((option) => promptOptionForDom(option, promptPlan));
    const hasInventoryRows = promptPlan.inventoryRows.length > 0;
    const needsTyping = !loadingInventoryRows && promptPlan.textEntry;
    const loadingLabel = promptPlan.requiresNamedInventoryRows ? 'drinkable item choices' : 'inventory choices';
    const promptText = loadingInventoryRows
      ? `${promptPlan.prompt}\nLoading ${loadingLabel}…`
      : (namedInventoryLoadFailed ? `${promptPlan.prompt}\nNo drinkable item names yet.` : (promptPlan.fallbackRows.length ? `${promptPlan.prompt}\nItem names unavailable.` : promptPlan.prompt));
    showPlayerNotice({
      id: `prompt:${promptPlan.classification}:${promptPlan.requestId || promptPlan.lifecycleRevision || shimEventCount}`,
      kind: 'info',
      message: promptPlan.classification === 'inventory' ? 'Choose an item' : (promptPlan.classification === 'confirmation' ? 'Confirm your choice' : 'Choose an option'),
      source: 'prompt',
      persistence: 'until-state-change',
    });
    showInteractionDialog({
      title: workflowPromptText(loadingInventoryRows ? 'Loading inventory choices…' : (namedInventoryLoadFailed ? 'Drinkable items unavailable' : promptPlan.title)),
      prompt: workflowPromptText(promptText),
      options,
      family: promptPlan.family,
      dialogClass: loadingInventoryRows ? 'inventory-dialog action-inventory-dialog inventory-loading-dialog' : (hasInventoryRows ? 'inventory-dialog action-inventory-dialog' : (promptPlan.offer ? 'shop-offer-confirm-dialog' : (promptPlan.serious ? 'destructive-confirm-dialog' : (promptPlan.classRows.length ? 'class-dialog' : '')))),
      onConfirm: needsTyping ? (() => {
        if (!String(interactionText.value || '').trim() && /wish/i.test(String(promptPlan?.title || promptPlan?.prompt || interactionDialog?.className || ''))) {
          globalThis.NetHackUxFeedback?.animateBlocked?.(interactionText);
          interactionFeedback.textContent = 'Type a wish before confirming.';
          interactionText.focus({ preventScroll: true });
          return;
        }
        sendPlayableText(`${interactionText.value}\n`);
      }) : null,
      textPlaceholder: hasInventoryRows ? 'Filter items…' : 'Filter choices…',
      confirmText: needsTyping ? 'Confirm selection' : 'Confirm',
      onClear: needsTyping ? (() => { interactionText.value = ''; interactionText.dispatchEvent(new Event('input')); interactionText.focus({ preventScroll: true }); }) : null,
      feedback: hasInventoryRows && needsTyping ? ((value, visible) => menuSelectionFeedback(value, visible, promptPlan.inventoryRows, false)) : undefined,
      panelControls: hasInventoryRows && needsTyping ? objectActionPanelControls(promptPlan.filters, promptPlan.actionVerb) : (promptPlan.classRows.length ? objectClassPanelControls(promptPlan.classRows) : null),
    });
    return;
  }
  if (promptPlan.kind === 'line-input') {
    showPlayerNotice({ id: `prompt:text:${promptPlan.requestId || promptPlan.lifecycleRevision || shimEventCount}`, kind: 'info', message: 'Enter text', source: 'prompt', persistence: 'until-state-change' });
    const classRows = promptPlan.classRows.map((option) => promptOptionForDom(option, promptPlan));
    const commandRows = promptPlan.classification === 'command-help' ? promptPlan.options.map((option) => promptOptionForDom(option, promptPlan)) : [];
    const smallClassSet = classRows.length > 0 && classRows.length <= smallFixedOptionLimit;
    showInteractionDialog({
      title: workflowPromptText(promptPlan.title),
      prompt: workflowPromptText(promptPlan.prompt),
      options: classRows.length ? classRows : commandRows,
      family: promptPlan.family,
      dialogClass: classRows.length ? 'class-dialog' : (commandRows.length ? 'command-help-dialog' : (promptPlan.wishText ? 'text-entry-dialog wish-text-dialog' : (promptPlan.engravingText ? 'text-entry-dialog engraving-text-dialog' : 'text-entry-dialog'))),
      textEntry: !smallClassSet || !classRows.length,
      textLabel: classRows.length ? 'Filter classes' : (commandRows.length ? 'Search command help topics' : (promptPlan.wishText ? 'Wish text' : (promptPlan.engravingText ? 'Engraving text' : 'Type answer'))),
      textPlaceholder: classRows.length ? 'Filter classes…' : (commandRows.length ? 'Search commands…' : (promptPlan.wishText ? 'blessed greased +2 gray dragon scale mail…' : (promptPlan.engravingText ? 'Elbereth, a note, or leave blank…' : ''))),
      contextLines: recentPromptContextLines(promptPlan.prompt),
      confirmText: commandRows.length ? 'Submit command' : 'Confirm',
      onConfirm: classRows.length && smallClassSet ? null : (() => {
        if (promptPlan.wishText && !String(interactionText.value || '').trim()) {
          globalThis.NetHackUxFeedback?.animateBlocked?.(interactionText);
          interactionFeedback.textContent = 'Type a wish before confirming.';
          interactionText.focus({ preventScroll: true });
          return;
        }
        sendPlayableText(`${interactionText.value}\n`);
      }),
      onClear: (classRows.length && !smallClassSet) || commandRows.length ? (() => { interactionText.value = ''; interactionText.dispatchEvent(new Event('input')); interactionText.focus({ preventScroll: true }); }) : null,
      panelControls: classRows.length ? objectClassPanelControls(promptPlan.classRows) : null,
    });
    return;
  }
  if (promptPlan.kind === 'extended-command') {
    showPlayerNotice({ id: `prompt:command:${promptPlan.requestId || promptPlan.lifecycleRevision || shimEventCount}`, kind: 'info', message: 'Choose a command', source: 'prompt', persistence: 'until-state-change' });
    const options = promptPlan.options.map((option) => promptOptionForDom(option, promptPlan));
    showInteractionDialog({ title: workflowPromptText(promptPlan.title), prompt: workflowPromptText(promptPlan.prompt), options, family: promptPlan.family, textEntry: true, textLabel: 'Filter commands', textPlaceholder: 'Filter commands…' });
  }
}








function selectedKeysFromMenuExpression(value) {
  return new Set(menuSelectionPartsFromExpression(value).map((part) => part.key));
}

function menuSelectionPartsFromExpression(value) {
  const parts = [];
  const raw = String(value || '').trim();
  const tokens = raw.match(/\d*[A-Za-z$](?:-[A-Za-z$])?/g) || [];
  for (const token of tokens) {
    const countMatch = token.match(/^(\d+)/);
    const count = countMatch ? Math.max(1, Number(countMatch[1])) : null;
    const letters = token.replace(/^\d+/, '');
    if (/^[A-Za-z$]-[A-Za-z$]$/.test(letters)) {
      const [start, end] = letters.split('-').map((letter) => letter.charCodeAt(0));
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let code = low; code <= high; code += 1) parts.push({ key: String.fromCharCode(code), count });
    } else if (letters) {
      parts.push({ key: letters.slice(-1), count });
    }
  }
  return parts;
}

function menuItemMaxCount(item) {
  const text = String(item?.text || '');
  const explicit = text.match(/(?:^|\s)(\d+)\s+(?:[-+a-z]|uncursed|blessed|cursed|partly eaten|food|daggers?|arrows?|darts?|rocks?|gems?|coins?)/i);
  if (explicit) return Math.max(1, Number(explicit[1]));
  const gold = text.match(/(\d+)\s+gold/i);
  if (gold) return Math.max(1, Number(gold[1]));
  return 1;
}

function serializeMenuSelection(selectionParts) {
  return Array.from(selectionParts.values()).map((part) => `${part.count && part.count > 1 ? part.count : ''}${part.key}`).join('');
}

function menuSelectionFeedback(value, visibleCount, selectable, multi) {
  const selectors = new Set(selectable.map((item) => String.fromCharCode(item.selector)));
  const raw = String(value || '').trim();
  if (!raw) return `${visibleCount} item${visibleCount === 1 ? '' : 's'} shown.`;
  const looksLikeSelector = /^\d+[A-Za-z$]$/i.test(raw) || raw.includes('-') || raw.replace(/\s+/g, '').length <= 3;
  const tokens = looksLikeSelector ? (raw.match(/\d*[A-Za-z$][A-Za-z$]?(?:-[A-Za-z$])?/g) || []) : [];
  let hits = 0;
  for (const token of tokens) {
    const letters = token.replace(/^\d+/, '');
    if (/^[A-Za-z$]-[A-Za-z$]$/.test(letters)) {
      const [start, end] = letters.split('-').map((letter) => letter.charCodeAt(0));
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (const selector of selectors) {
        const code = selector.charCodeAt(0);
        if (code >= low && code <= high) hits += 1;
      }
    } else if (selectors.has(letters.slice(-1))) {
      hits += 1;
    }
  }
  return hits ? `${multi ? 'Selection' : 'Typed selector'}: ${raw} · ${hits} item${hits === 1 ? '' : 's'}.` : `${visibleCount} match${visibleCount === 1 ? '' : 'es'} for “${raw}”.`;
}


function parseInventoryItemMetadata(item) {
  const text = String(item?.text || '');
  const lower = text.toLowerCase();
  const known = item?.knownFields && typeof item.knownFields === 'object' ? item.knownFields : {};
  const count = menuItemMaxCount(item);
  const beatitude = lower.match(/\b(blessed|uncursed|cursed)\b/)?.[1] || String(known.beatitude || '');
  const chargePair = text.match(/\((\d+):(-?\d+)\)/)?.[0] || '';
  const charges = chargePair || (known.charges != null ? String(known.charges) : '');
  const enchantment = text.match(/(?:^|\s)([+-]\d+)\b/)?.[1] || (known.enchantment != null ? `${Number(known.enchantment) >= 0 ? '+' : ''}${known.enchantment}` : '');
  const nutrition = lower.match(/partly eaten|corpse|ration|food|tin|egg|apple|carrot/)?.[0] || '';
  const stack = count > 1 ? `${count} in stack` : '';
  const condition = [known.erosion, known.corrosion, known.poisoned === true ? 'poisoned' : ''].filter((value) => value !== '' && value != null && value !== false).join(' · ');
  const weight = known.weight != null ? `${known.weight} wt` : '';
  const ownership = item?.ownership?.state && item.ownership.state !== 'owned' ? String(item.ownership.state) : '';
  return { count, beatitude, charges, enchantment, nutrition, stack, condition, weight, ownership };
}

function renderInventoryActionBadges(item, actionVerb, category, state) {
  const meta = parseInventoryItemMetadata(item);
  const actionBadge = actionVerb && actionVerb !== 'Choose' ? `<span class="item-action-pill">${escapeHtml(actionVerb)}</span>` : '';
  // Avoid redundant nutrition/context chips that only restate the class badge (e.g. FOOD + food).
  const nutritionAddsInfo = meta.nutrition && (!category || !String(meta.nutrition).toLowerCase().includes(String(category).toLowerCase())) && !/^(?:food|ration|corpse)$/i.test(meta.nutrition);
  const badges = [
    actionBadge,
    state ? `<span class="item-badge equipped">${escapeHtml(state)}</span>` : '',
    category ? `<span class="item-badge item-class-${escapeHtml(category)}">${escapeHtml(category)}</span>` : '',
    meta.beatitude ? `<span class="item-badge item-beatitude">${escapeHtml(meta.beatitude)}</span>` : '',
    meta.enchantment ? `<span class="item-badge item-enchantment">${escapeHtml(meta.enchantment)}</span>` : '',
    meta.charges ? `<span class="item-badge item-charges">charges ${escapeHtml(meta.charges.replace(/[()]/g, ''))}</span>` : '',
    meta.stack ? `<span class="item-badge item-stack">${escapeHtml(meta.stack)}</span>` : '',
    meta.condition ? `<span class="item-badge item-condition">${escapeHtml(meta.condition)}</span>` : '',
    meta.weight ? `<span class="item-badge item-weight">${escapeHtml(meta.weight)}</span>` : '',
    meta.ownership ? `<span class="item-badge item-ownership">${escapeHtml(meta.ownership)}</span>` : '',
    nutritionAddsInfo ? `<span class="item-badge item-context">${escapeHtml(meta.nutrition)}</span>` : '',
  ].filter(Boolean).join('');
  return badges;
}


function applyObjectActionFilter(filter, button) {
  const rows = Array.from(interactionOptions.querySelectorAll('.choice-button.inventory-row'));
  let visible = 0;
  for (const row of rows) {
    const show = filter === 'all' || String(row.dataset.filterTags || '').split(' ').includes(filter);
    row.hidden = !show;
    if (show) visible += 1;
  }
  interactionPanelControls?.querySelectorAll('button[data-object-filter]')?.forEach((control) => control.setAttribute('aria-pressed', String(control === button)));
  interactionFeedback.textContent = `${visible} item${visible === 1 ? '' : 's'} shown.`;
  const [first] = visibleInteractionChoices();
  if (first && document.activeElement?.closest?.('#interaction-panel-controls')) first.focus({ preventScroll: true });
}

function objectActionPanelControls(filters = [], verb = 'Choose') {
  if (!filters.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'object-action-panel-controls';
  const heading = document.createElement('strong');
  heading.textContent = `${verb} filters`;
  wrap.appendChild(heading);
  for (const [filter, label] of filters) {
    const control = document.createElement('button');
    control.type = 'button';
    control.dataset.objectFilter = filter;
    control.setAttribute('aria-pressed', String(filter === 'all'));
    control.textContent = label;
    control.addEventListener('click', (event) => {
      event.preventDefault();
      applyObjectActionFilter(filter, control);
    });
    wrap.appendChild(control);
  }
  return wrap;
}

function menuItemSemanticDisplayName(item) {
  return item?.semanticKnown === false && item?.semanticAppearance ? item.semanticAppearance : item?.semanticName;
}

function menuItemSemanticFilterText(item) {
  const displayName = menuItemSemanticDisplayName(item);
  return `${item?.semanticKind || ''} ${displayName || ''}`.trim();
}

function renderInventoryOption(item, key, tile, assetId, options = {}) {
  const category = item.itemClass || sharedModules.interactionModel.menuItemClass(item);
  const sourceText = item.text || item.displayName || item.semanticName || item.semanticAppearance || 'item';
  const state = item.itemState || sharedModules.interactionModel.menuItemState(sourceText);
  const itemName = item.itemName || sharedModules.interactionModel.menuItemName(sourceText) || 'item';
  const isStatue = String(item.semanticKind || '').toLowerCase() === 'statue';
  const iconClass = `menu-tile${isStatue ? ' statue-menu-tile' : ''}`;
  const icon = tile ? `<span class="${iconClass}" aria-hidden="true" data-tile-id="${assetId}" style="background-image: ${tileUrl(tile)}"></span>` : `<span class="${iconClass} menu-tile-fallback" aria-hidden="true"></span>`;
  const badges = renderInventoryActionBadges(item, options.actionVerb || '', category, state);
  // Keep rows single-line: only show a compact semantic badge when it adds info not already in the name.
  // Per-row action guidance is omitted (prompt/panel already explain the workflow).
  const showSemantic = options.showSemantic === true;
  const semanticLabel = item.semanticKnown === false && item.semanticAppearance ? item.semanticAppearance : item.semanticName;
  const nameLower = itemName.toLowerCase();
  const semanticAddsInfo = Boolean(semanticLabel) && !nameLower.includes(String(semanticLabel).toLowerCase());
  const semantic = showSemantic && semanticAddsInfo
    ? `<span class="item-badge item-semantic">${escapeHtml(semanticLabel)}</span>`
    : '';
  return `<span class="selector-keycap" aria-hidden="true">${escapeHtml(key)}</span>${icon}<span class="menu-item-main"><span class="menu-item-name">${escapeHtml(itemName)}</span><span class="menu-badges">${badges}${semantic}</span></span>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}


function parseSpellMenuText(text) {
  const clean = sharedModules.interactionModel.menuTextWithoutSelector(text);
  const power = clean.match(/\b(?:Pw|Power)\s*[:=]?\s*(\d+)/i);
  const fail = clean.match(/\bFail(?:ure)?\s*[:=]?\s*(\d+%?)/i);
  const level = clean.match(/\b(?:Lvl|Level)\s*[:=]?\s*(\d+)/i);
  const name = clean
    .replace(/\b(?:Pw|Power)\s*[:=]?\s*\d+/ig, '')
    .replace(/\bFail(?:ure)?\s*[:=]?\s*\d+%?/ig, '')
    .replace(/\b(?:Lvl|Level)\s*[:=]?\s*\d+/ig, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || clean;
  return { name, power: power?.[1] || '', fail: fail?.[1] || '', level: level?.[1] || '' };
}

function parseSkillMenuText(text) {
  const clean = sharedModules.interactionModel.menuTextWithoutSelector(text);
  const slotCost = clean.match(/\b(?:cost|slots?)\s*[:=]?\s*(\d+)/i);
  const rank = clean.match(/\b(?:Basic|Skilled|Expert|Master|Grand Master|Unskilled|Restricted)\b/i);
  const canAdvance = /advance|enhance|increase|raise|\*/i.test(clean);
  return { name: clean.replace(/^\*\s*/, ''), rank: rank?.[0] || '', cost: slotCost?.[1] || '', canAdvance };
}

function parseOptionMenuText(text) {
  const clean = sharedModules.interactionModel.menuTextWithoutSelector(text);
  const match = clean.match(/^([^:=\s]+)\s*(?::|=|\s)\s*(.*)$/);
  const name = match ? match[1] : clean;
  const value = match ? match[2].trim() : '';
  const isToggle = /^(?:true|false|on|off|yes|no|\+|-)?$/i.test(value) || /^!?[a-z_]+$/i.test(clean);
  return { name, value, isToggle };
}

function parseTransferMenuText(text) {
  const clean = sharedModules.interactionModel.menuTextWithoutSelector(text);
  const leadingPrice = clean.match(/^\s*(\d+)\s+(?:zorkmids?|zm|gold(?: pieces?)?)\s*,\s*/i);
  const trailingPrice = clean.match(/(?:,|\s)(\d+)\s+(?:zorkmids?|zm|gold(?: pieces?)?)\b/i);
  const price = leadingPrice || trailingPrice;
  const unpaid = /unpaid|for sale|price|bill|zorkmid/i.test(clean) || Boolean(leadingPrice);
  const name = clean
    .replace(/^\s*\d+\s+(?:zorkmids?|zm|gold(?: pieces?)?)\s*,\s*/i, '')
    .replace(/,?\s*\d+\s+(?:zorkmids?|zm|gold(?: pieces?)?)\b/i, '')
    .trim();
  return { name, price: price?.[1] || '', unpaid };
}

function menuSelectableRows(menu) {
  return (menu?.items || []).filter((item) => item?.selector);
}


function isStaleTransferPlaceholderMenu(menu) {
  const rows = (menu?.items || []).filter((item) => String(item?.text || '').trim());
  if (Number(menu?.how || 0) || rows.some((item) => item.selector)) return false;
  const prompt = String(menu?.prompt || '').trim();
  const body = rows.map((item) => String(item.text || '')).join('\n');
  return /^Menu$/i.test(prompt || 'Menu') && /Container contents\s*→\s*Inventory \/ floor/i.test(body) && /Encumbrance\/load preview unavailable/i.test(body);
}

function isFarlookTipReadOnlyMenu(menu) {
  if (!sharedModules.interactionModel.isReadOnlyInformationalMenu(menu)) return false;
  const prompt = String(menu?.prompt || '');
  const body = (menu?.items || []).map((item) => sharedModules.interactionModel.menuTextWithoutSelector(item?.text || '')).join('\n');
  return /Tip:\s*Farlooking or selecting a map location/i.test(`${prompt}\n${body}`)
    || (/\bfarlook(?:ing)?\b/i.test(body) && /\bGame time does not advance\b/i.test(body));
}

function shouldSuppressMonsterSenseFarlookTip(menu) {
  if (!pendingMonsterSenseFarlookTipSuppression) return false;
  if (Date.now() - lastMonsterSenseMessageAt >= 8000) {
    pendingMonsterSenseFarlookTipSuppression = false;
    return false;
  }
  return isFarlookTipReadOnlyMenu(menu);
}

function suppressMonsterSenseFarlookTipMenu() {
  pendingMonsterSenseFarlookTipSuppression = false;
  clearPromptOwnerState({ clearWorkflow: true, clearMenu: true });
  closeInteractionDialog({ force: true });
  sendRecordedShimInput({ type: 'keycode', keycode: ' '.charCodeAt(0) }, 'monster-sense-farlook-tip-continue');
  monsterSenseFarlookStatusUntil = Date.now() + 1200;
  setStatus('monster-sense map browse active');
  window.setTimeout(() => {
    if (/monster-sense map browse active/i.test(status?.textContent || '')) setStatus('map ready');
  }, 1400);
}

function readOnlyMenuPanelControls(menu) {
  const wrap = document.createElement('div');
  wrap.className = 'read-only-menu-contents';
  const rows = (menu?.items || []).slice(0, 160);
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'read-only-menu-empty';
    empty.textContent = 'NetHack opened a message menu with no visible rows.';
    wrap.appendChild(empty);
    return wrap;
  }
  const list = document.createElement('div');
  list.className = 'read-only-menu-rows';
  for (const item of rows) {
    const text = sharedModules.interactionModel.menuTextWithoutSelector(item.text || '').trim() || String(item.text || '').trim();
    if (!text) continue;
    const row = document.createElement('div');
    row.className = 'read-only-menu-row';
    row.textContent = text;
    list.appendChild(row);
  }
  if (!list.children.length) {
    const empty = document.createElement('p');
    empty.className = 'read-only-menu-empty';
    empty.textContent = 'NetHack opened a message menu with no visible rows.';
    wrap.appendChild(empty);
    return wrap;
  }
  wrap.appendChild(list);
  return wrap;
}



function transferMenuModel(menu) {
  const prompt = String(menu?.prompt || '');
  const shop = sharedModules.interactionModel.isShopPaymentMenu(menu);
  const container = /loot|container contents|take out|put in|stash|chest|box|bag|sack|tip/i.test(prompt);
  const source = shop ? 'Shop bill' : (container ? 'Container contents' : (/pick up|ground/i.test(prompt) ? 'Ground' : 'Source'));
  const destination = shop ? 'Shopkeeper payment' : (container ? 'Inventory / floor' : 'Inventory / floor');
  const rows = menuSelectableRows(menu).map((item) => parseTransferMenuText(item.text));
  const totalPrice = rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0);
  const pricedRows = rows.filter((row) => row.price).length;
  return { shop, container, source, destination, totalPrice, pricedRows, rowCount: rows.length };
}

function menuPanelControlFilter(filter, button) {
  const rows = Array.from(interactionOptions.querySelectorAll('.choice-button'));
  for (const row of rows) row.hidden = filter !== 'all' && !String(row.dataset.filterTags || '').split(' ').includes(filter);
  interactionPanelControls?.querySelectorAll('button[data-panel-filter]')?.forEach((control) => control.setAttribute('aria-pressed', String(control === button)));
  const visible = rows.filter((row) => !row.hidden).length;
  interactionFeedback.textContent = `${visible} row${visible === 1 ? '' : 's'} shown.`;
}

function transferPanelControls(menu, model = transferMenuModel(menu)) {
  const wrap = document.createElement('div');
  wrap.className = `transfer-panel-controls${model.shop ? ' shop-payment-controls' : ''}`;
  const details = document.createElement('section');
  details.className = 'transfer-pane transfer-summary';
  if (model.shop) {
    const priceSummary = model.totalPrice ? ` Total: ${model.totalPrice} zm.` : '';
    details.innerHTML = `<strong>Bill summary</strong><span>${escapeHtml(`${model.rowCount} item${model.rowCount === 1 ? '' : 's'} on the bill.${priceSummary}`)}</span>`;
    wrap.append(details);
    return wrap;
  }
  const source = document.createElement('section');
  source.className = 'transfer-pane source-pane';
  source.innerHTML = `<strong>Source</strong><span>${escapeHtml(model.source)}</span>`;
  const destination = document.createElement('section');
  destination.className = 'transfer-pane destination-pane';
  destination.innerHTML = `<strong>Destination</strong><span>${escapeHtml(model.destination)}</span>`;
  details.innerHTML = `<strong>Transfer summary</strong><span>${escapeHtml(`${model.rowCount} row${model.rowCount === 1 ? '' : 's'}.`)}</span>`;
  wrap.append(source, destination, details);
  return wrap;
}

function specializedMenuPanelControls(menuPlan) {
  if (!menuPlan.filters.length) return null;
  const wrap = document.createElement('div');
  wrap.className = `${menuPlan.kind}-panel-controls`;
  const heading = document.createElement('strong');
  heading.textContent = menuPlan.filterHeading;
  wrap.appendChild(heading);
  for (const [filter, label] of menuPlan.filters) {
    const control = document.createElement('button');
    control.type = 'button';
    control.dataset.panelFilter = filter;
    control.setAttribute('aria-pressed', String(filter === 'all'));
    control.textContent = label;
    control.addEventListener('click', (event) => {
      event.preventDefault();
      menuPanelControlFilter(filter, control);
    });
    wrap.appendChild(control);
  }
  return wrap;
}

function isContainerActionMenu(menu) {
  const prompt = String(menu?.prompt || '');
  const rows = (menu?.items || []).map((item) => String(item.text || '')).join(' ');
  return Boolean(menu?.awaitingSelection)
    && /(?:Do what with|is empty\.\s*Do what with)/i.test(prompt)
    && /(?:look inside|take .* out|put .* in|stash .* into|do nothing|done)/i.test(rows);
}

function isGroundPickupMenu(menu) {
  const prompt = String(menu?.prompt || '').trim();
  const selectable = (menu?.items || []).filter((item) => item.selector);
  if (!Boolean(menu?.awaitingSelection) || !selectable.length) return false;
  return /^Pick(?:\s+\d+)?\s+(?:up\s+)?(?:of\s+)?what\?$/i.test(prompt)
    || /^Pick\s+up\s+what\?$/i.test(prompt);
}

function isContainerTakeOutMenu(menu) {
  return Boolean(menu?.awaitingSelection) && /^\s*Take out what\?/i.test(String(menu?.prompt || ''));
}

function isContainerPutInMenu(menu) {
  return Boolean(menu?.awaitingSelection) && /^\s*Put in what\?/i.test(String(menu?.prompt || ''));
}

function isPromptlessSelectableMenu(menu) {
  const prompt = String(menu?.prompt || '').trim();
  const selectable = menuSelectableRows(menu);
  return Boolean(menu?.awaitingSelection) && selectable.length > 0 && (!prompt || /^Menu$/i.test(prompt));
}

function isPromptlessObjectSelectionMenu(menu) {
  if (!isPromptlessSelectableMenu(menu)) return false;
  const purpose = String(menu?.menuPurpose || menu?.purpose || '');
  const authoritativeObjectPurpose = /^(?:inventory\.|ground\.(?:pickup|look)|container\.(?:takeOut|putIn)|transfer\.|shop\.|object\.)/.test(purpose);
  return authoritativeObjectPurpose || menuSelectableRows(menu).every((item) => sharedModules.publicItemKnowledge?.isObjectMenuItem?.(item));
}

function expectedContainerLoadingSide() {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container') return '';
  const choreography = currentTransferChoreographyState({ kind: 'container' });
  if (choreography.autoLoadingSide) return choreography.autoLoadingSide;
  if (transferPresentation.autoLoadingSide) return transferPresentation.autoLoadingSide;
  if (choreography.autoInventoryLoadPending || transferPresentation.autoInventoryLoadPending) return 'right';
  const loading = transferPresentation.loadingSides || {};
  if (loading.left && !containerPaneLoaded('left')) return 'left';
  if (loading.right && !containerPaneLoaded('right')) return 'right';
  // If menu transaction metadata arrives without the renderer-side loading
  // flag, keep ownership only for an established container action transaction
  // while a pane is still missing. Promptless object menus in that transaction
  // are container/inventory pane probes, not the global Inventory overlay.
  const hasContainerTransaction = Boolean(transferSession.snapshot().active);
  if (hasContainerTransaction && !containerPaneLoaded('left')) return 'left';
  if (hasContainerTransaction && !containerPaneLoaded('right')) return 'right';
  return '';
}

function isContainerExpectedTakeOutMenu(menu) {
  return isContainerTakeOutMenu(menu) || (isPromptlessSelectableMenu(menu) && (expectedContainerLoadingSide() === 'left' || currentPendingContainerTransferSelection()?.action === 'out'));
}

function isContainerInventoryProbeMenu(menu) {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container') return false;
  if (!isPromptlessSelectableMenu(menu)) return false;
  const choreography = currentTransferChoreographyState({ kind: 'container' });
  // NetHack's inventory overview is promptless.  During container right-pane
  // loading, public inventory snapshot effects can mark the pane loaded before
  // shim_select_menu flips the same menu to awaitingSelection.  Keep ownership
  // for that just-requested inventory probe instead of reopening the global
  // Equipment / Inventory overlay over the transfer panel.
  const graceUntil = Number(transferPresentation.inventoryProbeGraceUntil || 0);
  const graceWindow = transferPresentation.inventoryProbeMenuWindow;
  const menuWindow = menu?.window;
  const graceMatches = Date.now() < graceUntil
    && (graceWindow == null || menuWindow == null || Number(graceWindow) === Number(menuWindow));
  return Boolean(graceMatches
    || inventoryOverviewRequestActive()
    || choreography.autoInventoryLoadPending
    || transferPresentation.autoInventoryLoadPending
    || transferPresentation.loadingSides?.right);
}

function isContainerExpectedPutInMenu(menu) {
  return isContainerPutInMenu(menu) || (isPromptlessSelectableMenu(menu) && (expectedContainerLoadingSide() === 'right' || currentPendingContainerTransferSelection()?.action === 'in' || isContainerInventoryProbeMenu(menu)));
}

function isContainerCategoryMenu(menu) {
  return Boolean(menu?.awaitingSelection) && /^\s*(?:Take out|Put in) what type of objects\?/i.test(String(menu?.prompt || ''));
}

function containerActionRow(menu, action) {
  const wanted = action === 'out' ? /take .* out/i : /put .* in|stash .* into/i;
  return (menu?.items || []).find((item) => item.selector && wanted.test(String(item.text || '')) && !/both|reversed|then/i.test(String(item.text || '')));
}

function containerActionSelector(menu, action) {
  const row = containerActionRow(menu, action);
  return row?.selector ? String.fromCharCode(row.selector) : (action === 'out' ? 'o' : 'i');
}

function markContainerPaneLoading(side, loading = true) {
  if (!transferPresentation) return;
  transferPresentation.loadingSides = { ...(transferPresentation.loadingSides || {}), [side]: Boolean(loading) };
}

function markContainerPaneLoaded(side) {
  if (!transferPresentation) return;
  transferPresentation.loadedSides = { ...(transferPresentation.loadedSides || {}), [side]: true };
  markContainerPaneLoading(side, false);
}

function containerPaneLoaded(side) {
  return Boolean(transferPresentation?.loadedSides?.[side]);
}

function containerPaneNeedsLoad(side) {
  return Boolean(transferPresentation?.active && transferPresentation.sessionKind === 'container' && !containerPaneLoaded(side));
}

function isEmptyContainerContentsMessage(text = '') {
  const normalized = String(text || '').trim();
  const match = normalized.match(/^(?:The\s+)?(.+?)\s+is\s+empty\.$/i);
  if (!match) return false;
  return /^(?:it|the\s+)?(?:bag(?: of holding)?|sack|chest|box|large box|ice box|container)$/i.test(match[1].trim());
}

function emptyContainerContentsMessageFromPrompt(prompt = '') {
  const normalized = String(prompt || '').trim();
  const match = normalized.match(/^((?:The\s+)?(?:bag(?: of holding)?|sack|chest|box|large box|ice box|container|it)\s+is\s+empty\.)\s*Do what/i);
  if (!match) return '';
  const sentence = match[1].replace(/^the\s+/i, 'The ').trim();
  return isEmptyContainerContentsMessage(sentence) ? sentence : '';
}

function maybeFinishEmptyContainerPaneFromMessage(text = '') {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container') return false;
  if (!isEmptyContainerContentsMessage(text)) return false;
  transferPresentation.autoLoadingSide = transferPresentation.autoLoadingSide === 'left' ? '' : transferPresentation.autoLoadingSide;
  markContainerPaneLoaded('left');
  applyTransferChoreographyPatch({ autoLoadingSide: transferPresentation.autoLoadingSide, refreshIntent: { kind: 'container-empty-left-pane', side: 'left', reason: 'empty container message' } }, 'empty container pane loaded');
  rememberContainerContentsFromVisibleRows([], { layer: 'renderer', reason: 'empty-container-message' });
  dispatchTransferSessionEvent({ type: 'pane', side: 'left', rows: [] });
  const hydratedRight = hydrateContainerRightPaneFromInventoryCache({ preserveExisting: true });
  if (containerPaneLoaded('right')) {
    transferPresentation.feedback = 'Both panes loaded. Drag items between container and inventory.';
  } else {
    transferPresentation.feedback = hydratedRight
      ? 'Container is empty. Using cached inventory while NetHack catches up…'
      : 'Container is empty. Loading your inventory…';
  }
  renderContainerTransferPanel();
  if (containerPaneNeedsLoad('right')) window.setTimeout(() => scheduleContainerAutoAction('right'), 0);
  return true;
}

function containerInventoryCacheKnown() {
  return Boolean(gameViewSnapshot.inventory?.revision || gameViewSnapshot.cachedInventoryChoices.length);
}

function hydrateContainerRightPaneFromInventoryCache({ preserveExisting = true } = {}) {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container') return false;
  const existingRows = containerMenuItems('right');
  if (preserveExisting && existingRows.length) {
    transferPresentation.autoInventoryLoadPending = false;
    markContainerPaneLoaded('right');
    return true;
  }
  const rows = currentInventoryTransferRows();
  if (!rows.length && !containerInventoryCacheKnown()) return false;
  transferPresentation.autoInventoryLoadPending = false;
  markContainerPaneLoaded('right');
  dispatchTransferSessionEvent({ type: 'inventory', rows });
  return true;
}

function scheduleContainerAutoAction(side) {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container') return;
  const actionMenu = gameViewSnapshot.currentMenu;
  if (!isContainerActionMenu(actionMenu)) return;
  const action = side === 'left' ? 'out' : 'in';
  if (!containerActionRow(actionMenu, action)) {
    markContainerPaneLoaded(side);
    if (side === 'left') rememberContainerContentsFromVisibleRows([], { layer: 'renderer', reason: 'no-takeout-action' });
    if (side === 'right') hydrateContainerRightPaneFromInventoryCache({ preserveExisting: true });
    transferPresentation.feedback = side === 'left'
      ? 'Container has no take-out action; showing the container side as empty.'
      : 'NetHack has no put-in action for this container; showing inventory side as empty.';
    const nextSide = side === 'left' ? 'right' : 'left';
    if (nextSide === 'right') hydrateContainerRightPaneFromInventoryCache({ preserveExisting: true });
    renderContainerTransferPanel();
    if (containerPaneNeedsLoad(nextSide)) window.setTimeout(() => scheduleContainerAutoAction(nextSide), 0);
    return;
  }
  if (side === 'right') hydrateContainerRightPaneFromInventoryCache({ preserveExisting: true });
  transferPresentation.autoLoadingSide = side;
  if (!containerPaneLoaded(side)) markContainerPaneLoading(side, true);
  transferPresentation.feedback = side === 'left' ? 'Loading container contents…' : (containerPaneLoaded('right') ? 'Refreshing inventory candidates…' : 'Loading your inventory…');
  applyTransferChoreographyPatch({ autoLoadingSide: side, autoNextSide: '', refreshIntent: { kind: 'container-auto-load-pane', side, command: containerActionSelector(actionMenu, action), reason: transferPresentation.feedback } }, 'container pane auto-load scheduled');
  renderContainerTransferPanel();
  const scheduledWindow = actionMenu?.window;
  const scheduledRequestId = String(actionMenu?.requestId || actionMenu?.menuRequestId || '').trim();
  window.setTimeout(() => {
    if (!transferPresentation?.active || transferPresentation.autoLoadingSide !== side) return;
    // The side flag is shared choreography state and can legitimately be reused
    // by a later delayed category/item-menu transfer. Do not let an older
    // action-menu auto-load timer wake up in that later phase and send a second
    // `o`/`i` into the real Take out/Put in choreography.
    if (!isContainerActionMenu(gameViewSnapshot.currentMenu)) return;
    const currentWindow = gameViewSnapshot.currentMenu?.window;
    const currentRequestId = String(gameViewSnapshot.currentMenu?.requestId || gameViewSnapshot.currentMenu?.menuRequestId || '').trim();
    if (scheduledWindow != null && currentWindow != null && Number(currentWindow) !== Number(scheduledWindow)) return;
    if (scheduledRequestId && currentRequestId && scheduledRequestId !== currentRequestId) return;
    sendPlayableText(containerActionSelector(actionMenu, action));
  }, 0);
}

function maybeStartContainerAutoLoadFromActionMenu(menu) {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container') return;
  if (transferPresentation.autoLoadingSide) return;
  const choreography = currentTransferChoreographyState({ kind: 'container' });
  if (choreography.autoNextSide || transferPresentation.autoNextSide) {
    const side = choreography.autoNextSide || transferPresentation.autoNextSide;
    transferPresentation.autoNextSide = '';
    applyTransferChoreographyPatch({ autoNextSide: '' }, 'container queued auto-load side consumed');
    scheduleContainerAutoAction(side);
    return;
  }
  if (containerPaneNeedsLoad('left')) scheduleContainerAutoAction('left');
  else if (containerPaneNeedsLoad('right')) scheduleContainerAutoAction('right');
}

function reopenContainerActionMenuForAuto(side) {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container') return;
  transferPresentation.autoNextSide = '';
  markContainerPaneLoading(side, true);
  transferPresentation.feedback = side === 'right' ? 'Refreshing inventory…' : 'Refreshing container contents…';
  applyTransferChoreographyPatch({ autoNextSide: '', autoLoadingSide: '', refreshIntent: { kind: 'container-direct-refresh-for-auto-load', side, command: '', delayMs: 0, reason: transferPresentation.feedback } }, 'container direct refresh scheduled');
  renderContainerTransferPanel();
  if (side === 'right') hydrateContainerRightPaneFromInventoryCache({ preserveExisting: false });
  else requestDirectContainerSnapshotRefresh('auto-load');
}

function loadContainerRightPaneFromInventoryOverview() {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container') return;
  const hydratedFromCache = hydrateContainerRightPaneFromInventoryCache({ preserveExisting: true });
  transferPresentation.autoInventoryLoadPending = !hydratedFromCache;
  if (!hydratedFromCache) markContainerPaneLoading('right', true);
  transferPresentation.feedback = hydratedFromCache ? 'Container contents loaded. Using cached inventory while NetHack catches up…' : 'Container contents loaded. Loading your inventory…';
  applyTransferChoreographyPatch({ autoInventoryLoadPending: !hydratedFromCache, refreshIntent: { kind: hydratedFromCache ? 'container-inventory-cache-hydrated' : 'container-inventory-overview-requested', side: 'right', command: hydratedFromCache ? '' : 'i', delayMs: hydratedFromCache ? 0 : 250, reason: transferPresentation.feedback } }, 'container inventory pane refresh intent');
  renderContainerTransferPanel();
  sendPlayableText('\u001b');
  if (hydratedFromCache) return;
  window.setTimeout(() => {
    if (!transferPresentation?.active || !transferPresentation.autoInventoryLoadPending || containerPaneLoaded('right')) return;
    if (!gameViewSnapshot.currentMenu?.awaitingSelection && !gameViewSnapshot.activePrompt) sendPlayableText('i');
  }, 250);
}

function containerDisplayName(menu) {
  if (transferPresentation?.sessionKind === 'ground-pickup') return 'ground pickup';
  const prompts = [
    gameViewSnapshot.currentMenu?.prompt,
    menu?.prompt,
    transferPresentation?.prompt,
  ].map((prompt) => String(prompt || '').trim()).filter(Boolean);
  let fallback = '';
  for (const prompt of prompts) {
    const match = prompt.match(/(.+?)\s+is empty\.\s*Do what/i) || prompt.match(/Do what with\s+(.+?)\?/i);
    const name = match ? match[1].replace(/^the\s+/i, '').trim() : '';
    if (name && !/^it$/i.test(name)) return name;
    if (name && !fallback) fallback = name;
  }
  return fallback || 'container';
}


function keepContainerTransferOpenThroughRefresh(durationMs = 3000) {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container') return;
  containerTransferRefreshGraceUntil = Math.max(containerTransferRefreshGraceUntil, Date.now() + durationMs);
  dispatchTransferSessionEvent({ type: 'refresh', side: 'left', reason: 'classic container choreography refresh' });
}

function containerTransferInRefreshGrace() {
  return Boolean(transferPresentation?.active && transferPresentation.sessionKind === 'container' && Date.now() < containerTransferRefreshGraceUntil);
}

function shouldKeepContainerPanelBehindVisiblePrompt() {
  if (!containerTransferInRefreshGrace()) return false;
  if (transferPresentation.interrupted) return false;
  const hasStableRows = Boolean(containerMenuItems('left').length || containerMenuItems('right').length);
  if (!hasStableRows) return false;
  return Boolean(interactionDialog?.open || gameViewSnapshot.activePrompt?.owner?.kind === 'container');
}

function clearTransferRefreshGrace() {
  containerTransferRefreshGraceUntil = 0;
}

function updateContainerTransferStateFromMenu(menu) {
  if (!menu) return false;
  dispatchTransferSessionEvent({
    type: 'menu',
    menu,
    sessionId: transferPresentation?.transferSessionId || '',
    kind: transferPresentation?.sessionKind || '',
    groundCoord: groundPileCoordHere(),
    container: containerSnapshotIdentity(),
    inventoryRows: currentInventoryTransferRows(),
  });
  if (isGroundPickupMenu(menu)) {
    const inventoryRows = currentInventoryTransferRows();
    const groundRows = menu.items.filter((item) => item.selector);
    const feedback = inventoryRows.length
      ? 'Select items to pick up, then choose Take selected. Press the shown letters to toggle rows, or drag one item between lists.'
      : 'Select items to pick up with the shown letters, then choose Take selected. Open Inventory once to populate the carried-item list.';
    transferPresentation = {
      ...(transferPresentation || {}),
      active: true,
      sessionKind: 'ground-pickup',
      presentationMode: 'ground-pickup',
      prompt: menu.prompt || 'Pick up what?',
      interrupted: false,
      feedback,
    };
    rememberGroundPileFromVisibleRows(groundRows, { layer: 'renderer', window: menu.window });
    renderContainerTransferPanel();
    return true;
  }
  if (isContainerActionMenu(menu)) {
    clearContainerUnlockContinuation();
    containerTransferRefreshGraceUntil = 0;
    const menuPrompt = menu.prompt || transferPresentation?.prompt || 'Container inventory';
    const previous = transferPresentation?.sessionKind === 'container' ? transferPresentation : {};
    const firstOpen = !previous.active;
    transferPresentation = {
      ...previous,
      active: true,
      sessionKind: 'container',
      presentationMode: 'action',
      prompt: menuPrompt || previous.prompt || 'Container inventory',
      interrupted: false,
      loadedSides: firstOpen ? { left: false, right: false } : { ...(previous.loadedSides || {}) },
      loadingSides: firstOpen ? { left: true, right: true } : { ...(previous.loadingSides || {}) },
      feedback: previous.feedback || 'Loading container contents and your inventory…',
    };
    const emptyPromptMessage = emptyContainerContentsMessageFromPrompt(menuPrompt);
    if (emptyPromptMessage) {
      appendMessage(emptyPromptMessage, { logPrompt: false });
      // Do not rely on appendMessage side effects: the same empty sentence may
      // have arrived before the container state became active, causing message
      // de-duplication to suppress the append path.
      maybeFinishEmptyContainerPaneFromMessage(emptyPromptMessage);
    }
    renderContainerTransferPanel();
    maybeStartContainerAutoLoadFromActionMenu(menu);
    return true;
  }
  if (isContainerCategoryMenu(menu) && transferPresentation?.active) {
    const allTypes = (menu.items || []).find((item) => item.selector && /^\s*(?:[a-zA-Z]\s*[-+]\s*)?All types\b/i.test(String(item.text || '')))
      || (menu.items || []).find((item) => item.selector && /^\s*All types\b/i.test(String(item.text || '')))
      || (menu.items || []).find((item) => item.selector && /\bAll types\b/i.test(String(item.text || '')) && !/auto-select/i.test(String(item.text || '')));
    if (!allTypes) {
      closeContainerTransferPanel('Container category menu needs manual selection because no All types row was available.');
      return false;
    }
    const loadingSide = transferPresentation.autoLoadingSide || (/^\s*Put in/i.test(String(menu.prompt || '')) ? 'right' : 'left');
    const pending = currentPendingContainerTransferSelection();
    const pendingMatchesCategory = Boolean(pending && ((pending.action === 'out' && loadingSide === 'left') || (pending.action === 'in' && loadingSide === 'right')));
    markContainerPaneLoading(loadingSide, true);
    transferPresentation.autoLoadingSide = loadingSide;
    transferPresentation.feedback = pendingMatchesCategory
      ? 'Choosing all object types, then applying the dragged item selector when NetHack opens the item menu.'
      : 'Choosing all object types so the container panel can show item names, not category rows.';
    applyTransferChoreographyPatch({ autoLoadingSide: loadingSide, refreshIntent: { kind: 'container-category-all-types', side: loadingSide, command: 'all-types', reason: transferPresentation.feedback } }, 'container category all-types selection scheduled');
    renderContainerTransferPanel();
    return true;
  }
  if (isContainerExpectedTakeOutMenu(menu)) {
    clearContainerUnlockContinuation();
    const rows = menu.items.filter((item) => item.selector);
    transferPresentation = {
      ...(transferPresentation || { active: true }),
      active: true,
      sessionKind: 'container',
      presentationMode: 'takeout',
      interrupted: false,
      autoLoadingSide: '',
      feedback: containerPaneLoaded('right') ? 'Both panes loaded. Drag items between container and inventory.' : 'Container contents loaded. Loading your inventory…',
    };
    applyTransferChoreographyPatch({ autoLoadingSide: '', refreshIntent: { kind: 'container-left-pane-loaded', side: 'left', reason: 'take-out item menu visible' } }, 'container left pane loaded');
    markContainerPaneLoaded('left');
    rememberContainerContentsFromVisibleRows(rows, { layer: 'renderer', window: menu.window });
    renderContainerTransferPanel();
    if (containerPaneNeedsLoad('right')) {
      const scheduledWindow = menu?.window;
      const scheduledRequestId = String(menu?.requestId || menu?.menuRequestId || '').trim();
      window.setTimeout(() => {
        if (!transferPresentation?.active || !containerPaneNeedsLoad('right')) return;
        if (!isContainerExpectedTakeOutMenu(gameViewSnapshot.currentMenu)) return;
        const currentWindow = gameViewSnapshot.currentMenu?.window;
        const currentRequestId = String(gameViewSnapshot.currentMenu?.requestId || gameViewSnapshot.currentMenu?.menuRequestId || '').trim();
        if (scheduledWindow != null && currentWindow != null && Number(currentWindow) !== Number(scheduledWindow)) return;
        if (scheduledRequestId && currentRequestId && scheduledRequestId !== currentRequestId) return;
        loadContainerRightPaneFromInventoryOverview();
      }, 0);
    }
    return true;
  }
  if (isContainerExpectedPutInMenu(menu)) {
    clearContainerUnlockContinuation();
    const rows = menu.items.filter((item) => item.selector);
    transferPresentation = {
      ...(transferPresentation || { active: true }),
      active: true,
      sessionKind: 'container',
      presentationMode: 'putin',
      interrupted: false,
      autoLoadingSide: '',
      inventoryProbeGraceUntil: 0,
      inventoryProbeMenuWindow: undefined,
      feedback: containerPaneLoaded('left') ? 'Both panes loaded. Drag items between container and inventory.' : 'Inventory loaded. Loading container contents…',
    };
    applyTransferChoreographyPatch({ autoLoadingSide: '', refreshIntent: { kind: 'container-right-pane-loaded', side: 'right', reason: 'put-in item menu visible' } }, 'container right pane loaded');
    markContainerPaneLoaded('right');
    renderContainerTransferPanel();
    if (containerPaneNeedsLoad('left')) {
      const scheduledWindow = menu?.window;
      const scheduledRequestId = String(menu?.requestId || menu?.menuRequestId || '').trim();
      window.setTimeout(() => {
        if (!transferPresentation?.active || !containerPaneNeedsLoad('left')) return;
        if (!isContainerExpectedPutInMenu(gameViewSnapshot.currentMenu)) return;
        const currentWindow = gameViewSnapshot.currentMenu?.window;
        const currentRequestId = String(gameViewSnapshot.currentMenu?.requestId || gameViewSnapshot.currentMenu?.menuRequestId || '').trim();
        if (scheduledWindow != null && currentWindow != null && Number(currentWindow) !== Number(scheduledWindow)) return;
        if (scheduledRequestId && currentRequestId && scheduledRequestId !== currentRequestId) return;
        reopenContainerActionMenuForAuto('left');
      }, 0);
    }
    return true;
  }
  if (transferPresentation?.active && isInventoryOverviewMenu(menu)) {
    if (transferPresentation.sessionKind === 'container') {
      transferPresentation.autoInventoryLoadPending = false;
      transferPresentation.inventoryProbeGraceUntil = menu?.awaitingSelection ? 0 : Date.now() + 5000;
      transferPresentation.inventoryProbeMenuWindow = menu?.awaitingSelection ? undefined : menu?.window;
      transferPresentation.feedback = containerPaneLoaded('left') ? 'Both panes loaded. Drag items between container and inventory.' : 'Inventory loaded. Loading container contents…';
      markContainerPaneLoaded('right');
      applyTransferChoreographyPatch({ autoInventoryLoadPending: false, autoLoadingSide: '', refreshIntent: { kind: 'container-inventory-overview-loaded', side: 'right', reason: 'inventory overview menu visible' } }, 'container inventory overview loaded');
      renderContainerTransferPanel();
      if (interactionDialog.open) closeInteractionDialog();
      return true;
    }
    renderContainerTransferPanel();
    return false;
  }
  return false;
}



function transferSessionKindForState() {
  return transferPresentation?.sessionKind === 'ground-pickup' ? 'ground-pickup' : 'container';
}

function transferProtocolEvent(eventType, payload = {}) {
  transferEventSequence += 1;
  return {
    protocol: sharedModules.uiProtocolV2?.protocol || 'nethack-electron-ui/v2',
    sequence: transferEventSequence,
    eventId: `renderer-transfer-${transferEventSequence}-${eventType.replace(/[^A-Za-z0-9_.:-]+/g, '-')}`,
    eventType,
    turn: 0,
    source: { layer: 'renderer' },
    payload,
  };
}

function effectAsTransferModelResult(item) {
  if (!item || !/^transfer-/.test(String(item.type || ''))) return null;
  return { state: gameViewSnapshot.transferTransactions, session: item.session || null, transfer: item.transfer || null, rejected: item.rejection || item.rejected || null, effect: item };
}

function processSharedTransferEvent(eventType, payload = {}) {
  const event = transferProtocolEvent(eventType, payload);
  const checked = sharedModules.uiProtocolV2?.validateEventEnvelope ? sharedModules.uiProtocolV2.validateEventEnvelope(event) : { ok: true, errors: [] };
  if (!checked.ok) {
    const rejected = { type: 'transfer-transaction-rejected', reason: 'transfer protocol validation failed', errors: checked.errors.slice(), eventType, payload };
    diagnosticEvent('transaction', 'transfer.shared-event.rejected', rejected);
    return { rejected, effect: rejected };
  }
  const result = gameView.process(event);
  refreshGameViewPresentation();
  applyGameViewEffects(result.effects);
  refreshGameViewPresentation();
  const transferEffect = (result.effects || []).find((item) => /^transfer-/.test(String(item.type || '')));
  return effectAsTransferModelResult(transferEffect);
}
function syncTransferPresentationFromSession(snapshot = transferSession.snapshot()) {
  if (!snapshot.active) {
    if (transferPresentation) {
      transferPresentation = {
        ...transferPresentation,
        active: false,
        transferSessionId: '',
        feedback: snapshot.closedReason || transferPresentation.feedback || 'Transfer Session closed.',
        selectedItemIds: { left: [], right: [] },
      };
    }
    return snapshot;
  }
  transferPresentation = {
    ...(transferPresentation || {}),
    active: true,
    sessionKind: snapshot.kind,
    transferSessionId: snapshot.sessionId,
    feedback: snapshot.feedback,
    loadedSides: { ...snapshot.loadedSides },
    loadingSides: { ...snapshot.loadingSides },
    selectedItemIds: {
      left: snapshot.selection.left.slice(),
      right: snapshot.selection.right.slice(),
    },
  };
  return snapshot;
}

function dispatchTransferSessionEvent(event = {}) {
  const result = transferSession.dispatch(event);
  for (const effect of result.effects) {
    if (effect.type === 'publish-transfer-lifecycle') {
      processSharedTransferEvent(effect.eventType, effect.payload);
      continue;
    }
    if (effect.type === 'dispatch-direct') {
      const transfer = {
        transferId: effect.transferId,
        sessionId: effect.sessionId,
        direction: effect.direction,
        selector: effect.row.inventoryLetter || effect.row.selector || '',
        itemName: effect.row.displayName || effect.row.text || 'item',
      };
      const itemName = transfer.itemName;
      const sent = effect.direction === 'ground-to-inventory' || effect.direction === 'inventory-to-ground'
        ? sendDirectGroundTransfer(effect.row, transfer, itemName, effect.direction)
        : sendDirectContainerTransfer(effect.row, transfer, itemName, effect.direction);
      Promise.resolve(sent).then((ack) => {
        if (!ack?.ok) setStatus(`transfer rejected: ${ack?.reason || 'command was not accepted'}`);
      });
      continue;
    }
    if (effect.type === 'dispatch-classic') {
      const transfer = effect.transferId ? (gameViewSnapshot.transferTransactions.transfersById?.get?.(effect.transferId) || {
        transferId: effect.transferId,
        sessionId: effect.sessionId,
        direction: effect.direction,
        expectedRequestId: effect.expectedRequestId || '',
      }) : null;
      sendTransferText(effect.text, transfer, { expectedRequestId: effect.expectedRequestId || '', source: 'transfer-session-classic-adapter' });
      continue;
    }
    if (effect.type === 'request-classic-menu') {
      const command = effect.direction === 'container-to-inventory' ? 'o' : (effect.direction === 'inventory-to-container' ? 'i' : (effect.direction === 'ground-to-inventory' ? ',' : 'd'));
      sendTransferText(command, gameViewSnapshot.transferTransactions.transfersById?.get?.(effect.transferId) || null, { source: 'transfer-session-classic-adapter' });
      continue;
    }
    if (effect.type === 'refresh-direct') {
      if (effect.kind === 'container' && effect.side === 'left') requestDirectContainerSnapshotRefresh('transfer-session-refresh', { sessionOwnsLoading: true });
      else if (effect.side === 'right') sendPlayableText('i');
      continue;
    }
    if (effect.type === 'refresh-classic') {
      const command = effect.kind === 'container' ? (effect.side === 'left' ? 'o' : 'i') : (effect.side === 'left' ? ',' : 'i');
      sendPlayableText(command);
    }
  }
  syncTransferPresentationFromSession(result.snapshot);
  if (!result.snapshot.active && containerTransferPanel && !containerTransferPanel.hidden) renderContainerTransferPanel();
  return result;
}


function currentTransferCommandState(options = {}) {
  const snapshot = transferSession.snapshot();
  const requestedSessionId = Object.prototype.hasOwnProperty.call(options, 'sessionId') ? String(options.sessionId || '') : '';
  const requestedTransferId = Object.prototype.hasOwnProperty.call(options, 'transferId') ? String(options.transferId || '') : '';
  const sessionMatches = !requestedSessionId || requestedSessionId === snapshot.sessionId;
  const transferMatches = !requestedTransferId || requestedTransferId === snapshot.pending?.transferId;
  return {
    source: 'transfer-session',
    sessionId: sessionMatches ? snapshot.sessionId : '',
    session: sessionMatches && snapshot.active ? { sessionId: snapshot.sessionId, kind: snapshot.kind, status: snapshot.status, ownerRequestId: snapshot.owner?.requestId || '', panes: snapshot.panes, loadedSides: snapshot.loadedSides } : null,
    transferId: sessionMatches && transferMatches ? snapshot.pending?.transferId || '' : '',
    transfer: sessionMatches && transferMatches ? snapshot.pending : null,
    pendingTransferEvidence: null,
  };
}

function currentTransferChoreographyState() {
  const snapshot = transferSession.snapshot();
  const pending = currentPendingContainerTransferSelection();
  return {
    source: 'transfer-session',
    pendingSelection: pending,
    autoLoadingSide: transferPresentation?.autoLoadingSide || '',
    autoNextSide: transferPresentation?.autoNextSide || '',
    reopenPending: Boolean(transferPresentation?.reopenPending),
    autoInventoryLoadPending: Boolean(transferPresentation?.autoInventoryLoadPending),
    refreshIntent: snapshot.refresh ? { ...snapshot.refresh } : (transferPresentation?.refreshIntent || null),
  };
}

function applyTransferChoreographyPatch(patch = {}) {
  if (!transferPresentation?.active) return null;
  if (Object.prototype.hasOwnProperty.call(patch, 'autoLoadingSide')) transferPresentation.autoLoadingSide = patch.autoLoadingSide || '';
  if (Object.prototype.hasOwnProperty.call(patch, 'autoNextSide')) transferPresentation.autoNextSide = patch.autoNextSide || '';
  if (Object.prototype.hasOwnProperty.call(patch, 'reopenPending')) transferPresentation.reopenPending = Boolean(patch.reopenPending);
  if (Object.prototype.hasOwnProperty.call(patch, 'autoInventoryLoadPending')) transferPresentation.autoInventoryLoadPending = Boolean(patch.autoInventoryLoadPending);
  if (patch.clearRefreshIntent) transferPresentation.refreshIntent = null;
  else if (Object.prototype.hasOwnProperty.call(patch, 'refreshIntent')) transferPresentation.refreshIntent = patch.refreshIntent || null;
  return currentTransferChoreographyState();
}

function transferChoreographyReopenPending() {
  const shared = currentTransferChoreographyState();
  return Boolean(shared.reopenPending || transferPresentation?.reopenPending);
}






function transferActionPayload(transfer = {}, index = 0, length = 1, options = {}) {
  return {
    guiActionId: `transfer.${transfer.direction || 'items'}`,
    actionId: `transfer.${transfer.direction || 'items'}`,
    actionLabel: transfer.direction || 'Transfer item',
    targetSelector: String(transfer.selector || '').slice(0, 1),
    targetText: String(transfer.itemName || '').slice(0, 240),
    followupPlan: 'confirm-transfer>refresh-panes',
    expectedRequestId: String(Object.prototype.hasOwnProperty.call(options, 'expectedRequestId') ? options.expectedRequestId : (transfer.expectedRequestId || '')).trim(),
    transactionId: options.inputTransactionId || transfer.transferId || '',
    actionTransactionId: transfer.transferId || '',
    commandPosition: index + 1,
    commandLength: length,
  };
}

function sendTransferText(text, transfer = null, options = {}) {
  if (!transfer) {
    sendPlayableText(text);
    return;
  }
  noteContainerUnlockAnswer(text);
  const command = sharedModules.commandGateway?.normalizeTextInput ? sharedModules.commandGateway.normalizeTextInput(text) : String(text || '');
  const expectedRequestId = String(Object.prototype.hasOwnProperty.call(options, 'expectedRequestId') ? options.expectedRequestId : (transfer.expectedRequestId || '')).trim();
  const ownerInput = [gameViewSnapshot.currentMenu, gameViewSnapshot.activePrompt]
    .find((owner) => String(owner?.requestId || owner?.menuRequestId || owner?.promptId || '').trim() === expectedRequestId);
  const ownerRequestId = String(ownerInput?.requestId || ownerInput?.menuRequestId || ownerInput?.promptId || '').trim();
  const inputTransactionId = expectedRequestId && expectedRequestId === ownerRequestId
    ? String(ownerInput?.transactionId || '')
    : '';
  const actionOptions = inputTransactionId ? { ...options, inputTransactionId } : options;
  [...command].forEach((key, index) => {
    if (key.length === 1 && isSupportedPlayableKey(key)) sendRecordedShimInput({ type: 'keycode', keycode: key.charCodeAt(0), ...transferActionPayload(transfer, index, command.length, actionOptions) }, options.source || 'transfer-action');
  });
  lastSentKey = { key: undefined, at: 0 };
  setStatus(`sent transfer action: ${command.replace(/\n/g, '↵')}`);
}

function closeContainerTransferPanel(reason = '') {
  if (!transferPresentation && containerTransferPanel?.hidden) return false;
  if (transferSession.snapshot().pending?.route === 'direct') {
    transferPresentation.feedback = `Waiting for NetHack to confirm the current direct transfer before closing${reason ? ` (${reason.replace(/[.!]+$/, '')})` : ''}.`;
    renderContainerTransferPanel();
    return false;
  }
  applyTransferChoreographyPatch({ autoLoadingSide: '', autoNextSide: '', reopenPending: false, autoInventoryLoadPending: false, clearRefreshIntent: true });
  if (transferPresentation?.sessionKind === 'container') closePublicContainerSnapshotSession(reason || 'transfer panel closed');
  dispatchTransferSessionEvent({ type: 'close', reason: reason || 'Transfer Session closed.' });
  clearTransferRefreshGrace();
  refreshGameViewPresentation();
  transferPresentation = reason ? { active: false, feedback: reason } : null;
  if (containerTransferPanel) {
    containerTransferPanel.hidden = true;
    containerTransferPanel.replaceChildren();
  }
  lastContainerTransferInteractionSnapshot = null;
  pendingTransferFailureRestore = null;
  return true;
}

function cancelContainerTransferPanel() {
  if (transferSession.snapshot().pending?.route === 'direct') {
    closeContainerTransferPanel(transferPresentation.sessionKind === 'ground-pickup' ? 'Ground pickup panel close requested.' : 'Container panel close requested.');
    return;
  }
  const isGroundPickup = transferPresentation?.sessionKind === 'ground-pickup';
  const groundReleaseAlreadyRequested = false;
  if (!isGroundPickup || (gameViewSnapshot.currentMenu?.awaitingSelection && !groundReleaseAlreadyRequested)) {
    if (gameViewSnapshot.currentMenu?.awaitingSelection) sendActivePromptCancellation(null, { forceMenu: gameViewSnapshot.currentMenu, transactionId: gameViewSnapshot.currentMenu.transactionId });
    else sendPlayableText('\u001b');
  }
  if (!isGroundPickup) clearPromptOwnerState({ clearWorkflow: true, clearMenu: true });
  closeContainerTransferPanel(isGroundPickup ? 'Ground pickup panel closed.' : 'Container panel closed.');
  setStatus(isGroundPickup ? 'Ground items closed.' : 'container transfer panel closed');
  gameGrid?.focus?.({ preventScroll: true });
}


function containerMenuItems(side) {
  const transferView = transferSession.snapshot();
  return transferView.active ? panelItemsFromTransferRows(transferView.panes?.[side] || [], side) : [];
}

function itemHasNetHackSelector(item) {
  return Number.isFinite(Number(item?.selector)) && Number(item.selector) > 0;
}

function transferItemKey(item) {
  if (itemHasNetHackSelector(item)) return String.fromCharCode(Number(item.selector));
  return String(item?.syntheticSelector || '');
}

function findContainerTransferItem(side, selector) {
  const wanted = String(selector || '');
  return containerMenuItems(side).find((item) => transferItemKey(item) === wanted) || null;
}


function containerTransferDisplayName(item) {
  const publicLabel = sharedModules.publicItemKnowledge?.publicDisplayLabel?.(item, { neutral: '' });
  if (publicLabel) return sharedModules.interactionModel.menuItemName(publicLabel);
  const textName = sharedModules.interactionModel.menuItemName(item?.text || '');
  const displayName = sharedModules.interactionModel.menuItemName(item?.displayName || '');
  if (!textName || /^(?:item|object|unknown)$/i.test(textName)) return displayName || 'item';
  return textName;
}

function transferSelectionId(item = {}, side = '') {
  return Number(item.objectId) > 0 ? `${side || 'item'}-object-${Number(item.objectId)}` : transferItemKey(item);
}

function selectedTransferIds(side) {
  return transferSession.snapshot().selection?.[side] || [];
}

function transferItemIsSelected(item, side) {
  return selectedTransferIds(side).includes(transferSelectionId(item, side));
}

function setTransferItemSelected(item, side, selected) {
  dispatchTransferSessionEvent({ type: 'toggle', side, selector: transferItemKey(item), selected });
}

function toggleTransferItemSelection(item, side) {
  setTransferItemSelected(item, side, !transferItemIsSelected(item, side));
  renderContainerTransferPanel();
}

function selectAllEligibleContainerItems() {
  const snapshot = transferSession.snapshot();
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container' || snapshot.pending || !snapshot.loadedSides?.left) return;
  const eligible = containerMenuItems('left').filter((item) => Boolean(transferItemKey(item)));
  if (!eligible.length) return;
  dispatchTransferSessionEvent({
    type: 'select-all',
    side: 'left',
    rowKeys: eligible.map((item) => transferSelectionId(item, 'left')),
  });
  renderContainerTransferPanel();
}

function transferRowGlyph(item = {}) {
  const glyphCode = Number(item.glyphChar);
  if (typeof item.objectClass === 'string' && item.objectClass.length) return item.objectClass[0];
  return Number.isInteger(glyphCode) && glyphCode > 0 && glyphCode < 128 ? String.fromCharCode(glyphCode) : '';
}

function renderContainerItemRow(item, side) {
  const button = document.createElement('button');
  const key = transferItemKey(item);
  const displayKey = String(item?.displaySelector || '').trim();
  const isGroundPickup = transferPresentation?.sessionKind === 'ground-pickup';
  const draggable = Boolean(key) && (isGroundPickup ? (side === 'left' || itemHasNetHackSelector(item)) : true);
  const cleanName = containerTransferDisplayName(item);
  const keycap = itemHasNetHackSelector(item) ? key : (displayKey || '—');
  const selected = transferItemIsSelected(item, side);
  const glyph = transferRowGlyph(item);
  const assetId = mappedAssetIdForCell({ ...item, ch: glyph, semanticKind: item.semanticKind || 'object' });
  const tile = assetId ? tileAssetsById.get(assetId) : undefined;
  const sourceLabel = isGroundPickup && side === 'left' ? 'Ground item' : (side === 'left' ? 'Container item' : 'Inventory item');
  const targetLabel = isGroundPickup ? (side === 'left' ? 'inventory' : 'ground') : (side === 'left' ? 'inventory' : 'container');

  button.type = 'button';
  button.className = `container-item-row${selected ? ' is-selected' : ''}`;
  button.draggable = draggable;
  button.dataset.containerSide = side;
  button.dataset.selector = key;
  button.dataset.shortcut = keycap.length === 1 ? keycap : '';
  button.dataset.filterText = `${item.text || ''} ${menuItemSemanticFilterText(item)}`.toLowerCase();
  button.dataset.itemName = cleanName;
  button.dataset.stableId = transferSelectionId(item, side);
  button.setAttribute('role', 'checkbox');
  button.setAttribute('aria-checked', String(selected));
  button.setAttribute('aria-label', `${selected ? 'Selected' : 'Not selected'} ${sourceLabel} ${cleanName}; shortcut ${keycap}; press Enter to move selected items; ${draggable ? `drag to ${targetLabel}; ` : ''}${isGroundPickup && side === 'left' ? 'actions available with right click or Shift+F10' : ''}`.replace(/;\s*$/, ''));
  button.innerHTML = `<span class="transfer-checkbox" aria-hidden="true">${selected ? '☑' : '☐'}</span>${renderInventoryOption({ ...item, text: cleanName }, keycap, tile, assetId, { showSemantic: true })}${selected ? '<span class="transfer-selected-label" aria-hidden="true">Selected</span>' : ''}`;
  button.addEventListener('click', () => toggleTransferItemSelection(item, side));
  button.addEventListener('dragstart', (event) => {
    if (!draggable) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('application/x-nethack-container-transfer', JSON.stringify({ side, selector: key, itemName: cleanName, hasSelector: itemHasNetHackSelector(item) }));
    event.dataTransfer?.setData('application/x-nethack-selector', key);
    event.dataTransfer?.setData('text/plain', key);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer?.setDragImage?.(button, 12, 12);
    button.classList.add('dragging');
    if (transferPresentation?.active) {
      transferPresentation.feedback = `Dragging ${cleanName} to ${targetLabel}. Release over the highlighted area to move the item.`;
      const feedbackLine = containerTransferPanel?.querySelector('.container-transfer-heading span');
      if (feedbackLine) feedbackLine.textContent = transferPresentation.feedback;
    }
  });
  button.addEventListener('dragend', () => {
    button.classList.remove('dragging');
    containerTransferPanel?.querySelectorAll('.container-pane.drag-over').forEach((pane) => pane.classList.remove('drag-over'));
  });
  if (isGroundPickup && side === 'left') {
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showGroundItemContextMenu(item, event);
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'F10' && event.shiftKey) {
        event.preventDefault();
        showGroundItemContextMenu(item, button);
      }
    });
  }
  if (draggable) button.addEventListener('dblclick', () => {
    setTransferItemSelected(item, side, false);
    transferContainerItem(side, key);
  });
  return button;
}

function normalizedItemMatchText(text) {
  return sharedModules.interactionModel.menuItemName(String(text || '')).toLowerCase().replace(/\b(?:a|an|the|some|uncursed|blessed|cursed)\b/g, ' ').replace(/[^a-z0-9$]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveContainerTransferMenuSelector(menu, requestedSelector, requestedItemName = '') {
  const rows = (menu?.items || []).filter((item) => item.selector);
  const wantedSelector = String(requestedSelector || '');
  const wantedName = normalizedItemMatchText(requestedItemName || '');
  const rowSelector = (item) => item?.selector ? String.fromCharCode(item.selector) : '';
  const rowMatchesName = (item) => {
    if (!wantedName) return true;
    const rowName = normalizedItemMatchText(item?.text || '');
    return Boolean(rowName && (rowName === wantedName || rowName.includes(wantedName) || wantedName.includes(rowName)));
  };
  const exactRow = rows.find((item) => rowSelector(item) === wantedSelector) || null;
  if (exactRow && rowMatchesName(exactRow)) return { selector: rowSelector(exactRow), row: exactRow, remapped: false, reason: 'exact selector matched current NetHack menu' };
  const nameMatches = wantedName ? rows.filter(rowMatchesName) : [];
  if (nameMatches.length === 1) {
    const selector = rowSelector(nameMatches[0]);
    return { selector, row: nameMatches[0], remapped: Boolean(wantedSelector && selector !== wantedSelector), reason: 'display name matched current NetHack menu after selector relettering' };
  }
  if (exactRow && !wantedName) return { selector: rowSelector(exactRow), row: exactRow, remapped: false, reason: 'exact selector matched current NetHack menu without item-name guard' };
  return { selector: '', row: null, remapped: false, reason: nameMatches.length > 1 ? 'multiple current NetHack rows matched the dragged item name' : 'dragged selector is not available in the current NetHack menu' };
}


function sendDropInventorySelector(selector) {
  const drop = () => {
    sendPlayableText('d');
    window.setTimeout(() => sendPlayableText(selector), 90);
  };
  if (gameViewSnapshot.currentMenu?.awaitingSelection) {
    sendPlayableText('\u001b');
    window.setTimeout(drop, 120);
  } else drop();
}

function inputOwnerDiagnostic(ownerPrompt = gameViewSnapshot.activePrompt, ownerMenu = gameViewSnapshot.currentMenu) {
  if (ownerPrompt && !activePromptIsOrphaned()) return {
    kind: 'prompt',
    requestId: ownerPrompt.requestId || ownerPrompt.promptId || '',
    transactionId: ownerPrompt.transactionId || '',
    label: ownerPrompt.query || ownerPrompt.promptPurpose || '',
    lifecycle: ownerPrompt.lifecycle || '',
  };
  if (ownerMenu?.awaitingSelection) return {
    kind: 'menu',
    requestId: ownerMenu.requestId || ownerMenu.menuRequestId || '',
    transactionId: ownerMenu.transactionId || '',
    window: ownerMenu.window,
    label: ownerMenu.prompt || ownerMenu.menuPurpose || '',
    lifecycle: ownerMenu.lifecycle || '',
  };
  return null;
}

function panelOwnedGroundPickupMenu(menu = gameViewSnapshot.currentMenu) {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'ground-pickup' || !isGroundPickupMenu(menu)) return false;
  const session = currentTransferCommandState({ kind: 'ground-pickup', transferId: '' }).session;
  const menuRequestId = String(menu?.requestId || menu?.menuRequestId || '').trim();
  const ownerRequestId = String(session?.ownerRequestId || '').trim();
  if (menuRequestId || ownerRequestId) return Boolean(menuRequestId && ownerRequestId && menuRequestId === ownerRequestId);
  return Boolean(transferSession.snapshot().owner?.ownsMenu);
}



function panelItemsFromTransferRows(rows = [], side = 'left') {
  return (rows || []).map((row, index) => {
    const selector = String(row?.selector || '').trim();
    const item = {
      ...row,
      text: row?.text || row?.displayName || 'item',
      displayName: row?.displayName || row?.text || 'item',
      objectId: Number.isInteger(row?.objectId) ? row.objectId : undefined,
      quantity: Number.isInteger(row?.quantity) ? row.quantity : undefined,
    };
    if (side === 'right' && selector.length === 1) item.selector = selector.charCodeAt(0);
    else item.syntheticSelector = selector || `restored-${side}-${index}`;
    return item;
  });
}

function stableContainerItemDisplayKeys(items = []) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const previous = transferPresentation?.containerItemKeysByObjectId || {};
  const used = new Set();
  const next = {};
  for (const item of items || []) {
    if (!Number.isInteger(item?.objectId) || item.objectId <= 0) continue;
    const id = String(item.objectId);
    const previousKey = String(previous[id] || '').trim();
    if (previousKey && !used.has(previousKey)) {
      next[id] = previousKey;
      used.add(previousKey);
    }
  }
  for (const item of items || []) {
    if (!Number.isInteger(item?.objectId) || item.objectId <= 0) continue;
    const id = String(item.objectId);
    if (next[id]) continue;
    const key = alphabet.split('').find((candidate) => !used.has(candidate)) || `#${used.size + 1}`;
    next[id] = key;
    used.add(key);
  }
  if (transferPresentation) transferPresentation.containerItemKeysByObjectId = next;
  return next;
}

function panelItemsFromContainerSnapshot(snapshot = null) {
  const items = snapshot?.items || [];
  const displayKeys = stableContainerItemDisplayKeys(items);
  return items.map((item, index) => ({
    text: item.displayName || item.text || 'item',
    displayName: item.displayName || item.text || 'item',
    objectId: Number.isInteger(item.objectId) ? item.objectId : undefined,
    quantity: Number.isInteger(item.quantity) ? item.quantity : undefined,
    glyph: item.glyph,
    glyphChar: item.glyphChar,
    semanticKind: item.semanticKind,
    semanticName: item.semanticName,
    semanticAppearance: item.semanticAppearance,
    semanticKnown: item.semanticKnown,
    publicClass: item.publicClass,
    known: item.known ? { ...item.known } : undefined,
    knownFields: item.knownFields ? { ...item.knownFields } : undefined,
    ownership: item.ownership ? { ...item.ownership } : undefined,
    filterGroups: Array.isArray(item.filterGroups) ? item.filterGroups.slice() : undefined,
    actionAffordances: Array.isArray(item.actionAffordances) ? item.actionAffordances.slice() : undefined,
    displaySelector: Number.isInteger(item.objectId) && item.objectId > 0 ? displayKeys[String(item.objectId)] : '',
    syntheticSelector: `container-object-${Number.isInteger(item.objectId) ? item.objectId : index}`,
  }));
}


function dispatchUiCommand(command) {
  if (typeof testUiCommandHandler === 'function') return testUiCommandHandler(command);
  return netHackAPI.uiCommand?.(command);
}

function setDirectTransferPending(pending = null) {
  if (directTransferPendingTimeout) {
    window.clearTimeout(directTransferPendingTimeout);
    directTransferPendingTimeout = null;
  }
  if (pending?.transferId) {
    const expectedTransferId = pending.transferId;
    directTransferPendingTimeout = window.setTimeout(() => {
      directTransferPendingTimeout = null;
      if (transferSession.snapshot().pending?.transferId !== expectedTransferId) return;
      diagnosticEvent('transaction', `${pending.kind || 'direct'}-transfer.direct.timed-out`, { pending: { ...pending } }, { transactionId: expectedTransferId });
      dispatchTransferSessionEvent({ type: 'tick' });
      renderContainerTransferPanel();
    }, 5000);
  }
}

function clearDirectTransferPending(transferId = '') {
  const pendingId = transferSession.snapshot().pending?.transferId || '';
  if (!transferId || !pendingId || pendingId === transferId) setDirectTransferPending(null);
}




function publicCommandItemFields(item = {}, displayName = '') {
  const knowledge = sharedModules.publicItemKnowledge;
  const source = { ...item, displayName };
  const publicDisplayName = knowledge?.publicLabel ? knowledge.publicLabel(source, { neutral: 'item' }) : 'item';
  const semanticKnown = knowledge?.identityIsPublic ? knowledge.identityIsPublic(source) : false;
  const known = knowledge?.publicKnownFlags ? { ...knowledge.publicKnownFlags(source) } : { identity: semanticKnown, appearance: false };
  const semanticAppearance = knowledge?.explicitAppearance?.(source);
  return { displayName: publicDisplayName, semanticKnown, known, ...(semanticAppearance ? { semanticAppearance } : {}) };
}

async function sendDirectGroundTransfer(item, transfer, itemName, direction) {
  const coord = groundPileCoordHere();
  const sourceLocation = direction === 'inventory-to-ground' ? 'inventory' : 'ground';
  const targetLocation = direction === 'inventory-to-ground' ? 'ground' : 'inventory';
  const transferId = transfer?.transferId || `ground-transfer-${Date.now()}`;
  const command = {
    protocol: sharedModules.uiProtocolV2?.protocol || 'nethack-electron-ui/v2',
    commandId: transferId,
    commandType: 'ground.transfer',
    transactionId: transferId,
    // The menu-release ownership handoff may itself cause an inventory refresh.
    // Ground transfer is object-id/coordinate targeted and the main gateway
    // explicitly permits this slice to omit expected revisions, avoiding a
    // false stale-revision race between bridge_menu_answer and direct dispatch.
    expectedRevision: undefined,
    targets: { itemId: item.objectId, location: { kind: sourceLocation }, ...publicCommandItemFields(item, itemName), coord },
    payload: {
      direction,
      transferId,
      coord,
      itemId: item.objectId,
      count: 'all',
    },
  };
  if (transferPresentation?.active) setDirectTransferPending({ kind: 'ground', transferId, itemId: item.objectId, direction, coord });
  diagnosticEvent('transaction', 'ground-transfer.direct.requested', { command }, { transactionId: command.transactionId });
  const ack = await Promise.resolve(dispatchUiCommand(command)).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
  if (!ack?.ok && transferSession.snapshot().active) {
    const reason = ack?.reason || 'direct ground transfer was not accepted by the bridge';
    diagnosticEvent('transaction', 'ground-transfer.direct.rejected', { command, ack }, { transactionId: command.transactionId });
    clearDirectTransferPending(transferId);
    dispatchTransferSessionEvent({
      type: 'rejected',
      transferId,
      sessionId: transfer?.sessionId || transferSession.snapshot().sessionId,
      direction,
      itemId: item.objectId,
      reason,
      failureKind: ack?.blockerToken || 'rejected',
    });
    renderContainerTransferPanel();
  }
  return ack;
}

async function sendDirectContainerTransfer(item, transfer, itemName, direction) {
  const identity = containerSnapshotIdentity();
  const sourceLocation = direction === 'inventory-to-container' ? 'inventory' : 'container';
  const transferId = transfer?.transferId || `container-transfer-${Date.now()}`;
  const command = {
    protocol: sharedModules.uiProtocolV2?.protocol || 'nethack-electron-ui/v2',
    commandId: transferId,
    commandType: 'container.transfer',
    transactionId: transferId,
    expectedRevision: undefined,
    targets: { containerId: identity.objectId, itemId: item.objectId, location: { kind: sourceLocation }, ...publicCommandItemFields(item, itemName) },
    payload: {
      direction,
      transferId,
      sessionId: transfer?.sessionId || transferPresentation?.transferSessionId || '',
      containerId: identity.objectId,
      itemId: item.objectId,
      item: { objectId: item.objectId, ...publicCommandItemFields(item, itemName), quantity: Number.isInteger(item.quantity) ? item.quantity : undefined, location: { kind: sourceLocation } },
    },
  };
  if (transferPresentation?.active) setDirectTransferPending({ kind: 'container', transferId, itemId: item.objectId, containerId: identity.objectId, direction });
  diagnosticEvent('transaction', 'container-transfer.direct.requested', { command }, { transactionId: command.transactionId });
  const ack = await Promise.resolve(dispatchUiCommand(command)).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
  if (!ack?.ok && transferSession.snapshot().active) {
    const reason = ack?.reason || 'direct transfer was not accepted by the bridge';
    clearDirectTransferPending(transferId);
    dispatchTransferSessionEvent({
      type: 'rejected',
      transferId,
      sessionId: command.payload.sessionId || transferSession.snapshot().sessionId,
      direction,
      itemId: item.objectId,
      reason,
      failureKind: ack?.blockerToken || 'rejected',
    });
    renderContainerTransferPanel();
  }
  return ack;
}

async function sendDirectContainerToInventoryTransfer(item, transfer, itemName) {
  return sendDirectContainerTransfer(item, transfer, itemName, 'container-to-inventory');
}

async function sendDirectInventoryToContainerTransfer(item, transfer, itemName) {
  return sendDirectContainerTransfer(item, transfer, itemName, 'inventory-to-container');
}




function currentPendingContainerTransferSelection() {
  const pending = transferSession.snapshot().pending;
  if (!pending || !/^container-/.test(String(pending.direction || ''))) return null;
  return {
    action: pending.direction === 'container-to-inventory' ? 'out' : 'in',
    selector: pending.rowKey || pending.row?.inventoryLetter || pending.row?.selector || '',
    sourceSide: pending.sourceSide,
    itemName: pending.row?.displayName || pending.row?.text || '',
    transferId: pending.transferId,
  };
}


function selectedTransferEntries(sides = ['left', 'right']) {
  const snapshot = transferSession.snapshot();
  return sides.flatMap((side) => {
    const selected = new Set(snapshot.selection?.[side] || []);
    return containerMenuItems(side)
      .filter((item) => selected.has(transferSelectionId(item, side)))
      .map((item) => ({ side, itemId: item.objectId, selector: transferItemKey(item) }));
  });
}

function cancelQueuedTransfers() {
  dispatchTransferSessionEvent({ type: 'clear-selection' });
}

function processNextQueuedTransfer() {
  const snapshot = syncTransferPresentationFromSession();
  if (snapshot.active) renderContainerTransferPanel();
  return snapshot.pending;
}

function submitSelectedTransfers(options = {}) {
  if (!transferSession.snapshot().active) return false;
  const sides = options.groundOnly ? ['left'] : ['left', 'right'];
  if (!selectedTransferEntries(sides).length) {
    transferPresentation.feedback = 'Select one or more items, then press Enter.';
    renderContainerTransferPanel();
    return false;
  }
  dispatchTransferSessionEvent({ type: 'submit', sides });
  renderContainerTransferPanel();
  return true;
}

function takeAllGroundItems() {
  if (transferSession.snapshot().kind !== 'ground-pickup') return false;
  dispatchTransferSessionEvent({ type: 'select-all', side: 'left' });
  renderContainerTransferPanel();
  return submitSelectedTransfers({ groundOnly: true });
}

function transferContainerItem(sourceSide, selector) {
  if (!transferSession.snapshot().active || !selector) return;
  const item = findContainerTransferItem(sourceSide, selector);
  if (!item) {
    transferPresentation.feedback = 'That item moved. Refresh the list and try again.';
    renderContainerTransferPanel();
    return;
  }
  dispatchTransferSessionEvent({
    type: 'move',
    sourceSide,
    selector,
    objectId: Number.isInteger(item.objectId) ? item.objectId : undefined,
  });
  renderContainerTransferPanel();
}

function requestContainerPaneRefresh(side) {
  if (!transferPresentation?.active) return;
  const failureState = clearFailureSurfaceLock(containerTransferPanel, { restore: false });
  if (failureState) {
    actionableFailureHoldUntil = 0;
    actionableFailureNotice = null;
    uxNoticeService?.stateChanged?.();
    pendingTransferFailureRestore = { preserved: failureState.preserved, remainingRenders: 4, expiresAt: Date.now() + 5000 };
    diagnosticEvent('failure-presentation', 'failure.explicit-refresh', { surface: 'transfer', side, retryDispatched: false, stableId: failureState.preserved.stableId });
  }
  if (transferPresentation.sessionKind === 'ground-pickup') {
    if (side === 'right') {
      transferPresentation.feedback = 'Refreshing inventory by opening the Inventory overview.';
      renderContainerTransferPanel();
      sendPlayableText(`${gameViewSnapshot.currentMenu?.awaitingSelection ? '\u001b' : ''}i`);
    } else {
      const rows = groundPanelItemsFromPublicSnapshot(groundPileCoordHere());
      if (rows.length) {
        dispatchTransferSessionEvent({ type: 'pane', side: 'left', rows });
        transferPresentation.feedback = 'Select items to pick up, then choose Take selected, or choose Pick up all.';
      } else {
        transferPresentation.feedback = 'Ground items cannot be refreshed yet.';
      }
      renderContainerTransferPanel();
    }
    return;
  }
  transferPresentation.feedback = side === 'left' ? 'Refreshing container contents…' : 'Refreshing inventory…';
  renderContainerTransferPanel();
  if (side === 'left') requestDirectContainerSnapshotRefresh('pane-refresh');
  else {
    hydrateContainerRightPaneFromInventoryCache({ preserveExisting: false });
    renderContainerTransferPanel();
  }
}

function handleContainerTransferPanelKeydown(event) {
  if (!transferPresentation?.active || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target?.matches?.('input, textarea, select')) return;
  if (event.key === 'Enter') {
    if (target?.matches?.('button') && !target.classList.contains('container-item-row')) return;
    event.preventDefault();
    event.stopPropagation();
    submitSelectedTransfers();
    return;
  }
  if (!/^[A-Za-z]$/.test(event.key)) return;
  const focusedPane = target?.closest?.('[data-container-pane]')?.dataset?.containerPane || 'left';
  const rows = Array.from(containerTransferPanel.querySelectorAll(`[data-container-pane="${focusedPane}"] .container-item-row`));
  const row = rows.find((candidate) => candidate.dataset.shortcut === event.key);
  if (!row) return;
  event.preventDefault();
  event.stopPropagation();
  row.focus({ preventScroll: true });
  row.click();
}

function renderContainerTransferPanel() {
  if (!containerTransferPanel) return;
  if (containerTransferPanel.hidden && transferPresentation?.active) lastContainerTransferInteractionSnapshot = null;
  if (!containerTransferPanel.hidden && containerTransferPanel.childElementCount) {
    const previousInteraction = snapshotFailureSurface(containerTransferPanel);
    if (previousInteraction.stableId) lastContainerTransferInteractionSnapshot = previousInteraction;
  }
  if (transferPresentation?.active && transferPresentation.sessionKind === 'container' && itemEquipmentOwner?.ownership?.().active) {
    itemEquipmentOwner.close({ reason: 'transfer-session', cancelNative: false });
  }
  if (!transferPresentation?.active) {
    uxFocusLayer?.close?.(containerTransferPanel);
    containerTransferPanel.hidden = true;
    containerTransferPanel.replaceChildren();
    return;
  }
  containerTransferPanel.hidden = false;
  clearTransferPanelOwnerChrome();
  const state = transferPresentation;
  const isGroundPickup = state.sessionKind === 'ground-pickup';
  const lockedFailure = failureSurfaceState.get(containerTransferPanel);
  const bothContainerPanesLoaded = !isGroundPickup && containerPaneLoaded('left') && containerPaneLoaded('right');
  const priorityFeedback = transferSession.snapshot().status !== 'ready'
    || /rejected|timed out|could not|failed|item changed|another choice|no longer available|\bselected items? moved\b|continuing selected items/i.test(String(state.feedback || ''));
  const displayFeedback = bothContainerPanesLoaded && !priorityFeedback
    ? 'Select items to move, then choose Move selected. Press the shown letters to toggle rows, or drag one item between lists.'
    : (state.feedback || 'Select items to move, then choose Move selected.');
  if (bothContainerPanesLoaded && !priorityFeedback) {
    state.feedback = displayFeedback;
    setStatus('container transfer panel ready');
  }
  const titleText = isGroundPickup ? 'Pick up from ground' : `Open ${containerDisplayName(state.actionMenu || gameViewSnapshot.currentMenu)}`;
  const title = document.createElement('div');
  title.className = 'container-transfer-heading';
  title.innerHTML = `<div><strong id="container-transfer-title">${escapeHtml(titleText)}</strong><span id="container-transfer-description">${escapeHtml(displayFeedback)}</span></div>`;
  containerTransferPanel.removeAttribute('aria-label');
  containerTransferPanel.setAttribute('aria-labelledby', 'container-transfer-title');
  containerTransferPanel.setAttribute('aria-describedby', 'container-transfer-description');
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.dataset.transferRefresh = 'true';
  refresh.textContent = 'Refresh list';
  refresh.hidden = !lockedFailure?.presentation?.refreshRequired;
  refresh.addEventListener('click', () => requestContainerPaneRefresh(lockedFailure?.preserved?.focusedPane === 'right' ? 'right' : 'left'));
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => cancelContainerTransferPanel());
  title.append(close, refresh);
  const grid = document.createElement('div');
  grid.className = 'container-transfer-grid';
  const paneSpecs = isGroundPickup
    ? [['left', 'Ground items', 'No ground item rows loaded yet.'], ['right', 'Your inventory', 'Waiting for NetHack live inventory data.']]
    : [['left', 'Container inventory', 'This container is empty.'], ['right', 'Your inventory', 'No carried item rows available.']];
  for (const [side, label, empty] of paneSpecs) {
    const pane = document.createElement('section');
    pane.className = `container-pane ${side}-pane`;
    pane.dataset.containerPane = side;
    const loading = !isGroundPickup && Boolean(state.loadingSides?.[side]) && !state.loadedSides?.[side];
    const blockedMessage = !isGroundPickup && side === 'left' && state.directSnapshotFailure?.message ? state.directSnapshotFailure.message : '';
    pane.setAttribute('aria-busy', loading ? 'true' : 'false');
    pane.innerHTML = `<div class="container-pane-title"><strong>${label}</strong></div>`;
    const list = document.createElement('div');
    list.className = 'container-item-list';
    const items = containerMenuItems(side);
    if (isGroundPickup && side === 'left' && items.length) {
      const takeAll = document.createElement('button');
      takeAll.type = 'button';
      takeAll.dataset.takeAllGround = 'true';
      takeAll.textContent = `Pick up all (${items.length})`;
      takeAll.disabled = Boolean(transferSession.snapshot().pending);
      takeAll.addEventListener('click', takeAllGroundItems);
      pane.querySelector('.container-pane-title')?.appendChild(takeAll);
    }
    if (!isGroundPickup && side === 'left') {
      const eligible = items.filter((item) => Boolean(transferItemKey(item)));
      const selected = new Set(selectedTransferIds('left'));
      const allSelected = eligible.length > 0 && eligible.every((item) => selected.has(transferSelectionId(item, 'left')));
      const selectAll = document.createElement('button');
      selectAll.type = 'button';
      selectAll.dataset.selectAllContainer = 'true';
      selectAll.textContent = 'Select all';
      selectAll.disabled = loading || !state.loadedSides?.left || !eligible.length || allSelected || Boolean(transferSession.snapshot().pending);
      selectAll.addEventListener('click', selectAllEligibleContainerItems);
      pane.querySelector('.container-pane-title')?.appendChild(selectAll);
    }
    if (items.length) items.forEach((item) => list.appendChild(renderContainerItemRow(item, side)));
    else {
      const note = document.createElement('p');
      note.className = loading ? 'container-empty-note container-loading-note' : (blockedMessage ? 'container-empty-note container-blocked-note' : 'container-empty-note');
      note.textContent = loading ? (side === 'left' ? 'Loading container contents…' : 'Loading your inventory…') : (blockedMessage || empty);
      list.appendChild(note);
    }
    pane.appendChild(list);
    pane.addEventListener('dragover', (event) => {
      const types = Array.from(event.dataTransfer?.types || []);
      const hasTransferPayload = types.includes('application/x-nethack-container-transfer') || types.includes('application/x-nethack-selector') || types.includes('text/plain');
      if (!hasTransferPayload) return;
      const raw = event.dataTransfer?.getData('application/x-nethack-container-transfer') || '';
      if (raw) {
        let payload = null;
        try { payload = JSON.parse(raw); } catch { payload = null; }
        if (payload?.side === side) return;
      }
      const draggingSide = containerTransferPanel?.querySelector('.container-item-row.dragging')?.dataset?.containerSide;
      if (draggingSide === side) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      pane.classList.add('drag-over');
    });
    pane.addEventListener('dragleave', () => pane.classList.remove('drag-over'));
    pane.addEventListener('drop', (event) => {
      pane.classList.remove('drag-over');
      let payload = null;
      try { payload = JSON.parse(event.dataTransfer?.getData('application/x-nethack-container-transfer') || 'null'); } catch { payload = null; }
      if (!payload || payload.side === side) return;
      event.preventDefault();
      transferContainerItem(payload.side, payload.selector);
    });
    grid.appendChild(pane);
  }
  const selectedLeft = selectedTransferIds('left').length;
  const selectedRight = selectedTransferIds('right').length;
  const selectedCount = selectedLeft + selectedRight;
  const selectedVerb = isGroundPickup
    ? (selectedRight === 0 ? 'Take' : (selectedLeft === 0 ? 'Drop' : 'Move'))
    : (selectedLeft > 0 && selectedRight === 0 ? 'Take' : 'Move');
  const footer = document.createElement('div');
  footer.className = 'container-transfer-footer';
  footer.innerHTML = `<span class="container-transfer-selected-count" aria-live="polite">${selectedCount} selected</span>`;
  const moveSelected = document.createElement('button');
  moveSelected.type = 'button';
  moveSelected.className = 'container-transfer-selected-action primary';
  moveSelected.dataset.transferSelected = 'true';
  const previousSelectedCount = Number(containerTransferPanel.dataset.selectedCount || 0);
  moveSelected.disabled = selectedCount === 0 || Boolean(transferSession.snapshot().pending);
  moveSelected.innerHTML = `${selectedVerb} ${selectedCount || ''} selected <kbd>Enter</kbd>`;
  moveSelected.addEventListener('click', () => submitSelectedTransfers());
  footer.appendChild(moveSelected);
  containerTransferPanel.replaceChildren(title, grid, footer);
  containerTransferPanel.dataset.selectedCount = String(selectedCount);
  if (selectedCount > 0 && previousSelectedCount === 0 && !moveSelected.disabled) {
    globalThis.NetHackUxFeedback?.animateEnablePop?.(moveSelected);
  }
  const previousSelectedIds = new Set(String(containerTransferPanel.dataset.selectedIds || '').split('|').filter(Boolean));
  const nextSelectedIds = [];
  for (const row of containerTransferPanel.querySelectorAll('.container-item-row[aria-checked="true"], .container-item-row.is-selected')) {
    const id = row.dataset.stableId || `${row.dataset.containerSide}:${row.dataset.selector}`;
    nextSelectedIds.push(id);
    if (!previousSelectedIds.has(id)) globalThis.NetHackUxFeedback?.pulse?.(row, 'ux-motion-select', { durationMs: 140 });
  }
  containerTransferPanel.dataset.selectedIds = nextSelectedIds.join('|');
  containerTransferPanel.onkeydown = handleContainerTransferPanelKeydown;
  const firstTransferItem = containerTransferPanel.querySelector('.container-item-row');
  const transferCloseButton = containerTransferPanel.querySelector('.container-transfer-heading button');
  const firstTransferControl = firstTransferItem || transferCloseButton;
  if (!uxFocusLayer?.snapshot?.().some((layer) => layer.id === (isGroundPickup ? 'ground-transfer' : 'container-transfer'))) {
    containerTransferPanel.dataset.initialFocusSettled = 'false';
    containerTransferPanel.tabIndex = -1;
    uxFocusLayer?.open?.({ id: isGroundPickup ? 'ground-transfer' : 'container-transfer', element: containerTransferPanel, domain: 'transfer', initialFocus: firstTransferControl, returnFocus: 'invoker', domainFallback: () => gameGrid, escapePolicy: 'close', focusDelayMs: 160 });
  } else {
    uxFocusLayer?.open?.({ id: isGroundPickup ? 'ground-transfer' : 'container-transfer', element: containerTransferPanel, domain: 'transfer', initialFocus: firstTransferControl, returnFocus: 'invoker', domainFallback: () => gameGrid, escapePolicy: 'close', focusDelayMs: 0 });
    if (!containerTransferPanel.contains(document.activeElement) || (firstTransferItem && containerTransferPanel.dataset.initialFocusSettled !== 'true' && document.activeElement === transferCloseButton)) firstTransferControl?.focus?.({ preventScroll: true });
    if (firstTransferItem) containerTransferPanel.dataset.initialFocusSettled = 'true';
  }
  if (lockedFailure) applyFailureSurfaceLock(containerTransferPanel, lockedFailure.presentation, lockedFailure.preserved);
  const pendingRestore = pendingTransferFailureRestore;
  if (pendingRestore && pendingRestore.expiresAt > Date.now() && pendingRestore.remainingRenders > 0) {
    pendingRestore.remainingRenders -= 1;
    window.setTimeout(() => restoreFailureSurfaceState(containerTransferPanel, pendingRestore.preserved), 0);
  } else if (pendingRestore) pendingTransferFailureRestore = null;
}

function maybeHandleContainerInterruption(text) {
  if (!transferPresentation?.active) return;
  if (/\b(?:You (?:are hit|stop|hear|feel|can't|cannot|are attacked|die)|hits?|misses?|bites?|stings?|kicks?|claws?|engulfs?|interrupt|paralyz|faint|hunger|confused|stunned|afraid|scared)\b/i.test(String(text || ''))) {
    showFailureNotice({ id: `transfer:interrupted:${shimEventCount}`, kind: 'interrupted', reason: text, surface: containerTransferPanel });
    closeContainerTransferPanel('Transfer Session interrupted by NetHack.');
  }
}

function transferSelectionSummary(menu, selectedParts) {
  const parts = Array.from(selectedParts.values());
  const selectedKeys = new Set(parts.map((part) => part.key));
  const byKey = new Map((menu?.items || []).filter((item) => item.selector).map((item) => [String.fromCharCode(item.selector), item]));
  let price = 0;
  let pricedRows = 0;
  const model = transferMenuModel(menu);
  for (const part of parts) {
    const transfer = parseTransferMenuText(byKey.get(part.key)?.text || '');
    if (transfer.price) {
      pricedRows += 1;
      price += (Number(transfer.price) || 0) * (model.shop ? 1 : (part.count || 1));
    }
  }
  const totalHint = model.totalPrice ? ` · visible total ${model.totalPrice} zm` : '';
  const priceHint = price ? ` · selected ${price} zm` : (model.shop && selectedKeys.size ? ` · ${pricedRows ? 'priced items selected' : 'price unavailable for selected items'}` : '');
  if (model.shop) {
    const selectedPrice = price ? ` · selected total ${price} zm` : (selectedKeys.size ? ` · ${pricedRows ? 'priced items selected' : 'price unavailable'}` : '');
    return `${selectedKeys.size} selected${selectedPrice}.`;
  }
  return `${model.source} → ${model.destination}: ${selectedKeys.size} selected${priceHint}${totalHint}.`;
}

function renderStructuredMenuOption(kind, item, key, tile, assetId) {
  if (kind === 'transfer') {
    const transfer = parseTransferMenuText(item.text);
    const shopPayment = transfer.unpaid || /pay|bill|shop/i.test(String(gameViewSnapshot.currentMenu?.prompt || ''));
    const base = renderInventoryOption({ ...item, text: transfer.name || item.text }, key, tile, assetId);
    const price = transfer.price ? `<span class="menu-meta price-meta">${escapeHtml(transfer.price)} zm</span>` : '';
    const mode = shopPayment ? '<span class="item-badge shop-badge">shop bill</span>' : '<span class="item-badge transfer-badge">transfer</span>';
    return `${base}<span class="row-action-pill">${shopPayment ? 'Pay' : 'Transfer'}</span>${mode}${price}`;
  }
  if (kind === 'spell') {
    const prompt = String(gameViewSnapshot.currentMenu?.prompt || '');
    const publicRows = gameViewSnapshot.currentMenu?.publicRows;
    const source = publicRows?.classificationConfidence === 'typed' ? 'typed' : 'fallback';
    const publicRow = Array.isArray(publicRows?.rows) ? publicRows.rows.find((row) => String(row.selector || '') === key) : null;
    if (source === 'typed' && !publicRow) {
      const controlLabel = sharedModules.interactionModel.menuTextWithoutSelector(item.text) || item.text || 'Menu action';
      return `<span class="selector-keycap" aria-hidden="true">${key}</span><span class="row-action-pill">Choose</span><span class="menu-item-main"><span class="menu-item-name">${escapeHtml(controlLabel)}</span></span>`;
    }
    const skillMenu = publicRows?.kind === 'skill' || /skill|enhance|advance/i.test(`${gameViewSnapshot.currentMenu?.menuPurpose || ''} ${prompt}`);
    if (skillMenu) {
      const skill = publicRow
        ? sharedModules.uxHelpCenter?.normalizeSkillRow?.(publicRow, source)
        : { ...parseSkillMenuText(item.text), classificationConfidence: 'fallback', currentRank: parseSkillMenuText(item.text).rank };
      const rank = skill.currentRank || skill.rank;
      const cost = skill.nextCost || skill.cost;
      const badges = `${rank ? `<span class="item-badge skill-rank">${escapeHtml(rank)}</span>` : ''}${skill.nextRank ? `<span class="menu-meta">next ${escapeHtml(skill.nextRank)}</span>` : ''}${cost != null && cost !== '' ? `<span class="menu-meta">cost ${escapeHtml(cost)}</span>` : ''}${skill.canAdvance === true ? '<span class="item-badge advance-badge">can advance</span>' : ''}`;
      const action = skill.canAdvance === true ? '<span class="row-action-pill">Advance</span>' : '';
      return `<span class="selector-keycap" aria-hidden="true">${key}</span>${action}<span class="menu-item-main" data-classification-confidence="${escapeHtml(skill.classificationConfidence || 'fallback')}"><span class="menu-item-name">${escapeHtml(skill.name)}</span><span class="menu-badges">${badges}</span></span>`;
    }
    const spell = publicRow
      ? sharedModules.uxHelpCenter?.normalizeSpellRow?.(publicRow, source)
      : { ...parseSpellMenuText(item.text), classificationConfidence: 'fallback' };
    const level = spell.level;
    const power = spell.pwCost == null ? spell.power : spell.pwCost;
    const failure = spell.failure == null ? spell.fail : spell.failure;
    const badges = `${level != null && level !== '' ? `<span class="item-badge spell-level">Lvl ${escapeHtml(level)}</span>` : ''}${power != null && power !== '' ? `<span class="menu-meta">Pw ${escapeHtml(power)}</span>` : ''}${failure != null && failure !== '' ? `<span class="menu-meta ${parseInt(failure, 10) >= 50 ? 'danger-meta' : ''}">Fail ${escapeHtml(failure)}</span>` : ''}${spell.status ? `<span class="menu-meta">${escapeHtml(spell.status)}</span>` : ''}`;
    const action = /cast|which spell/i.test(prompt) ? '<span class="row-action-pill">Cast</span>' : '';
    return `<span class="selector-keycap" aria-hidden="true">${key}</span>${action}<span class="menu-item-main" data-classification-confidence="${escapeHtml(spell.classificationConfidence || 'fallback')}"><span class="menu-item-name">${escapeHtml(spell.name)}</span><span class="menu-badges">${badges}</span></span>`;
  }
  if (kind === 'options') {
    const option = parseOptionMenuText(item.text);
    return `<span class="selector-keycap" aria-hidden="true">${key}</span><span class="row-action-pill">${option.isToggle ? 'Toggle' : 'Change'}</span><span class="menu-item-main"><span class="menu-item-name">${escapeHtml(option.name)}</span><span class="menu-badges">${option.value ? `<span class="menu-meta option-value">${escapeHtml(option.value)}</span>` : ''}</span></span>`;
  }
  if (kind === 'context') {
    const clean = sharedModules.interactionModel.menuTextWithoutSelector(item.text).replace(/^#/, '').trim();
    const verb = clean.match(/^(open|close|kick|pickup|pick up|loot|chat|talk|look|travel|attack|fire|untrap|search|sit|pray|offer|pay)\b/i)?.[0] || 'Do';
    const target = clean.replace(new RegExp(`^${verb}\\s*`, 'i'), '').trim();
    return `<span class="selector-keycap" aria-hidden="true">${key}</span><span class="row-action-pill">${escapeHtml(verb.replace(/^./, (c) => c.toUpperCase()))}</span><span class="menu-item-main"><span class="menu-item-name">${escapeHtml(target || clean || 'Context action')}</span></span>`;
  }
  return `<span class="selector-keycap">${key}</span><span class="menu-item-main"><span class="menu-item-name">${escapeHtml(item.text)}</span></span>`;
}

function typedMagicReadOnlyPanel(menu) {
  const publicRows = menu?.publicRows;
  if (publicRows?.classificationConfidence !== 'typed' || !Array.isArray(publicRows.rows)) return null;
  const panel = document.createElement('div');
  panel.className = 'typed-magic-read-only';
  panel.setAttribute('role', 'list');
  for (const row of publicRows.rows) {
    const normalized = publicRows.kind === 'skill'
      ? sharedModules.uxHelpCenter?.normalizeSkillRow?.(row, 'typed')
      : sharedModules.uxHelpCenter?.normalizeSpellRow?.(row, 'typed');
    if (!normalized?.name) continue;
    const item = document.createElement('div');
    item.className = 'typed-magic-read-only-row';
    item.dataset.classificationConfidence = 'typed';
    item.setAttribute('role', 'listitem');
    if (publicRows.kind === 'skill') {
      item.innerHTML = `<strong>${escapeHtml(normalized.name)}</strong><span class="item-badge skill-rank">${escapeHtml(normalized.currentRank || '')}</span>${normalized.nextRank ? `<span class="menu-meta">next ${escapeHtml(normalized.nextRank)}</span>` : ''}${normalized.nextCost != null ? `<span class="menu-meta">cost ${escapeHtml(normalized.nextCost)}</span>` : ''}${normalized.canAdvance === true ? '<span class="item-badge advance-badge">can advance</span>' : ''}`;
    } else {
      item.innerHTML = `<strong>${escapeHtml(normalized.name)}</strong>${normalized.level != null ? `<span class="item-badge spell-level">Lvl ${escapeHtml(normalized.level)}</span>` : ''}${normalized.pwCost != null ? `<span class="menu-meta">Pw ${escapeHtml(normalized.pwCost)}</span>` : ''}${normalized.failure != null ? `<span class="menu-meta">Fail ${escapeHtml(normalized.failure)}</span>` : ''}${normalized.status ? `<span class="menu-meta">${escapeHtml(normalized.status)}</span>` : ''}`;
    }
    panel.appendChild(item);
  }
  return panel.childElementCount ? panel : null;
}

function continueReadOnlyMenu(menu = gameViewSnapshot.currentMenu) {
  if (!menu?.awaitingSelection || Number(menu.how || 0)) return false;
  const requestId = String(menu.requestId || menu.menuRequestId || '');
  const transactionId = String(menu.transactionId || '');
  if (!requestId || !transactionId) {
    setStatus('information menu is missing its input owner');
    diagnosticEvent('user-action', 'user-action.blocked', {
      source: 'read-only-menu-continue',
      reason: 'missing menu request or transaction owner',
    });
    return false;
  }
  return sendRecordedShimInput({
    type: 'keycode',
    keycode: ' '.charCodeAt(0),
    transactionId,
    expectedRequestId: requestId,
    guiActionId: 'interaction.continue',
    actionLabel: 'Continue',
    followupPlan: 'continue',
  }, 'read-only-menu-continue');
}

function renderMenuPanel() {
  if (updateContainerTransferStateFromMenu(gameViewSnapshot.currentMenu)) {
    clearTransferPanelOwnerChrome();
    if (interactionDialog.open) closeInteractionDialog();
    return;
  }
  if (transferPresentation?.active && gameViewSnapshot.currentMenu?.awaitingSelection && !isGroundPickupMenu(gameViewSnapshot.currentMenu) && !isContainerActionMenu(gameViewSnapshot.currentMenu) && !isContainerExpectedTakeOutMenu(gameViewSnapshot.currentMenu) && !isContainerExpectedPutInMenu(gameViewSnapshot.currentMenu) && !isContainerCategoryMenu(gameViewSnapshot.currentMenu)) {
    closeContainerTransferPanel('Transfer panel closed for a different NetHack prompt.');
  }
  if (!gameViewSnapshot.currentMenu || !gameViewSnapshot.currentMenu.items.length || gameViewSnapshot.currentMenu.suppressPicker) {
    menuPanel.hidden = !gameViewSnapshot.currentMenu?.suppressPicker;
    menuPanel.textContent = gameViewSnapshot.currentMenu?.suppressPicker ? `${gameViewSnapshot.currentMenu.prompt || 'Ground items'} ${gameViewSnapshot.currentMenu.items.map((item) => item.text).filter(Boolean).join('; ')}` : 'No active menu.';
    return;
  }
  if (isCanceledInventoryLazyLoadMenu(gameViewSnapshot.currentMenu)) {
    gameViewSnapshot.currentMenu.__canceledInventoryLazyLoadMenu = true;
    menuPanel.hidden = true;
    menuPanel.textContent = 'No active menu.';
    closeInteractionDialog();
    return;
  }
  if (isStaleTransferPlaceholderMenu(gameViewSnapshot.currentMenu)) {
    const shouldAnswerReadOnlyMenu = gameViewSnapshot.activePrompt?.kind === 'read-only menu' || gameViewSnapshot.currentMenu?.awaitingSelection;
    clearPromptOwnerState({ clearWorkflow: true, clearMenu: true });
    closeInteractionDialog({ force: true });
    if (shouldAnswerReadOnlyMenu) sendRecordedShimInput({ type: 'keycode', keycode: ' '.charCodeAt(0) }, 'stale-placeholder-menu-continue');
    stalePlaceholderStatusSuppressUntil = Date.now() + 1000;
    setStatus('information menu suppressed');
    return;
  }
  if (shouldSuppressMonsterSenseFarlookTip(gameViewSnapshot.currentMenu)) {
    suppressMonsterSenseFarlookTipMenu();
    return;
  }
  reconcileItemEquipmentOwner({ interactionId: '', owner: Object.freeze({ kind: 'gameplay' }), prompt: Object.freeze({}), menu: Object.freeze({}) });
  const decision = interactionDecision('render-menu');
  const menuPlan = decision.menu;
  const kind = menuPlan.kind;
  reconcileItemEquipmentOwner(decision);
  const itemOwnership = itemEquipmentOwner?.ownership?.() || {};
  if (itemOwnership.ownsMenu || itemOwnership.ownsPrompt) {
    menuPanel.hidden = true;
    menuPanel.textContent = 'Item/equipment owner has the active native follow-up.';
    if (interactionDialog?.open) closeInteractionDialog({ force: true });
    return;
  }
  menuPanel.hidden = false;
  const selectableCount = menuPlan.selectable.length;
  menuPanel.textContent = `${workflowPromptText(menuPlan.title || 'Menu')}: ${workflowPromptText(menuPlan.prompt || `${selectableCount} item${selectableCount === 1 ? '' : 's'}`)}`;
  if (isInventoryOverviewMenu(gameViewSnapshot.currentMenu)) {
    if (openItemEquipmentOwner(decision)) {
      menuPanel.hidden = true;
      menuPanel.textContent = 'Inventory and equipment shown in the item/equipment workspace.';
      if (interactionDialog?.open) closeInteractionDialog({ force: true });
    }
    return;
  }
  if (!gameViewSnapshot.currentMenu.awaitingSelection && !Number(gameViewSnapshot.currentMenu.how || 0)) {
    menuPanel.hidden = true;
    menuPanel.textContent = 'No active menu.';
    return;
  }
  if (gameViewSnapshot.currentMenu.awaitingSelection) {
    const selectable = menuPlan.selectable.slice(0, 80);
    const noticeMessage = !Number(gameViewSnapshot.currentMenu.how || 0)
      ? 'Review information'
      : (kind === 'inventory' || kind === 'transfer' ? 'Choose an item' : (kind === 'spell' ? 'Choose an option' : 'Choose an option'));
    showPlayerNotice({
      id: `menu:${kind}:${gameViewSnapshot.currentMenu.requestId || gameViewSnapshot.currentMenu.lifecycleRevision || gameViewSnapshot.currentMenu.window || shimEventCount}`,
      kind: 'info',
      message: noticeMessage,
      source: 'prompt',
      persistence: 'until-state-change',
    });
    const multi = menuPlan.multi;
    const hasSelection = menuPlan.hasSelection;
    if (!hasSelection) {
      promptPanel.hidden = true;
      promptPanel.textContent = 'No active prompt.';
      menuPanel.hidden = true;
      menuPanel.textContent = 'Menu shown in dialog.';
      showInteractionDialog({
        title: workflowPromptText(menuPlan.title),
        prompt: workflowPromptText(menuPlan.prompt),
        dialogClass: 'read-only-menu-dialog',
        cancelText: 'Cancel',
        panelControls: kind === 'spell' ? (typedMagicReadOnlyPanel(gameViewSnapshot.currentMenu) || readOnlyMenuPanelControls(gameViewSnapshot.currentMenu)) : readOnlyMenuPanelControls(gameViewSnapshot.currentMenu),
        options: [{
          key: ' ',
          className: 'context-choice primary-context read-only-continue',
          label: 'Continue',
          text: 'Close this NetHack menu and return to the map.',
          onClick: (button) => {
            button.disabled = true;
            if (continueReadOnlyMenu(gameViewSnapshot.currentMenu) === false) button.disabled = false;
          },
        }],
      });
      return;
    }
    if (!selectable.length) {
      menuPanel.hidden = false;
      menuPanel.textContent = 'Menu is waiting for selectable NetHack rows.';
      closeInteractionDialog();
      return;
    }
    const prompt = workflowPromptText(menuPlan.prompt);
    const selectedMenuParts = new Map(menuSelectionPartsFromExpression(interactionText.value).map((part) => [part.key, part]));
    const selectedMenuKeys = new Set(selectedMenuParts.keys());
    const shopPaymentMenu = kind === 'transfer' && menuPlan.shopPayment;
    const syncMenuSelectionText = () => {
      interactionText.value = serializeMenuSelection(selectedMenuParts);
      interactionText.dispatchEvent(new Event('input'));
      if (multi && kind === 'transfer') interactionFeedback.textContent = transferSelectionSummary(gameViewSnapshot.currentMenu, selectedMenuParts);
      if (shopPaymentMenu && interactionConfirm) interactionConfirm.disabled = selectedMenuParts.size === 0;
    };
    const setRowSelected = (button, key, selected) => {
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', String(selected));
      const chip = button.querySelector('.selection-chip');
      if (chip) chip.textContent = selected ? '☑' : '☐';
      const qty = button.querySelector('.quantity-control');
      if (qty) qty.hidden = !selected;
    };
    const appendSelection = (key, count = null) => {
      if (multi) {
        if (selectedMenuParts.has(key) && count == null) selectedMenuParts.delete(key);
        else selectedMenuParts.set(key, { key, count });
        selectedMenuKeys.clear();
        for (const selectedKey of selectedMenuParts.keys()) selectedMenuKeys.add(selectedKey);
        syncMenuSelectionText();
      } else {
        interactionText.value = key;
        interactionText.dispatchEvent(new Event('input'));
      }
      if (interactionTextRow.hidden) document.querySelector(`#interaction-options .choice-button[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
      else interactionText.focus({ preventScroll: true });
    };
    const confirmSelection = () => {
      if (shopPaymentMenu && !selectedMenuParts.size) return;
      if (shopPaymentMenu) {
        shopPaymentUiStatus = { phase: 'processing', text: 'Processing payment…', until: 0 };
        setStatus(shopPaymentUiStatus.text);
      }
      sendPlayableText(`${interactionText.value}\n`);
    };
    const showMenuFilter = hasSelection && selectable.length > smallFixedOptionLimit;
    const selectVisibleRows = multi ? (() => {
      for (const button of visibleInteractionChoices()) {
        const key = button.dataset.key;
        if (!key) continue;
        selectedMenuParts.set(key, { key, count: null });
        setRowSelected(button, key, true);
      }
      selectedMenuKeys.clear();
      for (const selectedKey of selectedMenuParts.keys()) selectedMenuKeys.add(selectedKey);
      syncMenuSelectionText();
      const [firstChoice] = visibleInteractionChoices();
      if (firstChoice) firstChoice.focus({ preventScroll: true });
    }) : null;
    const clearMenuSelection = multi ? (() => {
      selectedMenuParts.clear();
      selectedMenuKeys.clear();
      interactionOptions.querySelectorAll('.choice-button').forEach((button) => setRowSelected(button, button.dataset.key, false));
      syncMenuSelectionText();
      if (showMenuFilter) {
        interactionText.value = '';
        interactionText.dispatchEvent(new Event('input'));
        interactionText.focus({ preventScroll: true });
      }
    }) : (showMenuFilter ? (() => { interactionText.value = ''; interactionText.dispatchEvent(new Event('input')); interactionText.focus({ preventScroll: true }); }) : null);
    const transferModel = kind === 'transfer' ? transferMenuModel(gameViewSnapshot.currentMenu) : null;
    const groundPickupMenu = kind === 'inventory' && isGroundPickupMenu(gameViewSnapshot.currentMenu);
    const chooserPrompt = prompt;
    if (shopPaymentMenu) shopPaymentUiStatus = { phase: 'choosing', text: 'Choose items to pay for', until: 0 };
    showInteractionDialog({
      title: workflowPromptText(menuPlan.title),
      prompt: chooserPrompt,
      dialogClass: kind === 'inventory' ? `inventory-dialog${multi ? ' multi-select-menu-dialog' : ''}` : (kind === 'transfer' ? `transfer-dialog${multi ? ' multi-select-menu-dialog' : ''}` : (kind === 'context' ? 'context-menu-dialog' : (kind === 'spell' ? 'spell-dialog' : (kind === 'options' ? 'options-dialog' : (multi ? 'multi-select-menu-dialog' : ''))))),
      textEntry: showMenuFilter,
      textLabel: kind === 'inventory' ? 'Filter items' : (kind === 'transfer' ? 'Filter items' : (kind === 'spell' ? 'Filter spells or skills' : (kind === 'options' ? 'Filter options' : 'Filter choices'))),
      textPlaceholder: kind === 'inventory' ? 'Filter items…' : (kind === 'transfer' ? 'Filter items…' : (kind === 'spell' ? 'Filter spells or skills…' : (kind === 'options' ? 'Filter options…' : 'Filter choices…'))),
      cancelText: hasSelection ? 'Cancel' : 'Close',
      confirmText: multi ? (kind === 'transfer' ? (transferModel?.shop ? 'Pay selected' : 'Transfer selected') : 'Confirm selection') : 'Confirm',
      selectAllText: 'Select shown',
      clearText: 'Clear selection',
      onConfirm: hasSelection ? confirmSelection : null,
      onSelectAll: multi ? selectVisibleRows : null,
      onClear: clearMenuSelection,
      feedback: kind === 'transfer' ? (() => transferSelectionSummary(gameViewSnapshot.currentMenu, selectedMenuParts)) : (kind === 'inventory' && showMenuFilter ? ((value, visible) => menuSelectionFeedback(value, visible, selectable, multi)) : undefined),
      panelControls: kind === 'transfer' ? transferPanelControls(gameViewSnapshot.currentMenu, transferModel) : specializedMenuPanelControls(menuPlan),
      options: selectable.map((item) => {
        const key = String.fromCharCode(item.selector);
        const glyph = item.glyphChar && item.glyphChar > 0 && item.glyphChar < 128 ? String.fromCharCode(item.glyphChar) : '';
        const assetId = mappedAssetIdForCell({ ch: glyph, glyph: item.glyph, semanticKind: item.semanticKind, semanticName: item.semanticName, semanticAppearance: item.semanticAppearance, semanticKnown: item.semanticKnown, cmapIndex: item.cmapIndex });
        const tile = assetId ? tileAssetsById.get(assetId) : undefined;
        const category = sharedModules.interactionModel.menuItemClass(item);
        const maxCount = menuItemMaxCount(item);
        const quantityControl = multi && !shopPaymentMenu && maxCount > 1 ? `<span class="quantity-control" hidden><span class="quantity-label">Qty</span><button type="button" class="quantity-step" data-step="-1" aria-label="Decrease ${sharedModules.interactionModel.menuItemName(item.text)} quantity">−</button><input class="quantity-input" type="number" min="1" max="${maxCount}" value="${maxCount}" aria-label="Quantity for ${sharedModules.interactionModel.menuItemName(item.text)}" /><button type="button" class="quantity-step" data-step="1" aria-label="Increase ${sharedModules.interactionModel.menuItemName(item.text)} quantity">+</button><button type="button" class="quantity-max" aria-label="Select all ${maxCount}">All</button></span>` : '';
        return {
          key,
          text: item.text,
          className: kind === 'inventory' ? `inventory-row${quantityControl ? ' has-quantity-control' : ''}` : (kind === 'transfer' ? `transfer-row${quantityControl ? ' has-quantity-control' : ''}` : (kind === 'context' ? 'context-command-row' : (kind === 'spell' ? 'spell-row' : (kind === 'options' ? 'option-row' : '')))),
          filterText: `${category} ${menuItemSemanticFilterText(item)}`,
          role: multi ? 'checkbox' : 'option',
          stableId: Number.isInteger(item.objectId) ? `object:${item.objectId}` : key,
          ariaLabel: `${multi ? 'Toggle' : 'Choose'} ${sharedModules.interactionModel.menuItemName(item.text)}${sharedModules.interactionModel.menuItemState(item.text) ? `, ${sharedModules.interactionModel.menuItemState(item.text)}` : ''}; ${groundPickupMenu ? 'Ground item actions available with right click or Shift+F10; ' : ''}shortcut ${key}${!shopPaymentMenu && maxCount > 1 ? `; quantity 1 to ${maxCount}` : ''}`,
          html: kind === 'inventory'
            ? `${multi ? '<span class="selection-chip" aria-hidden="true">☐</span>' : ''}${renderInventoryOption(item, key, tile, assetId)}${quantityControl}`
            : `${multi ? '<span class="selection-chip" aria-hidden="true">☐</span>' : ''}${renderStructuredMenuOption(kind, item, key, tile, assetId)}${quantityControl}`,
          onContextMenu: groundPickupMenu ? ((event) => showGroundItemContextMenu(item, event)) : undefined,
          onKeyContextMenu: groundPickupMenu ? ((button) => showGroundItemContextMenu(item, button)) : undefined,
          onClick: multi ? ((button) => {
            const input = button.querySelector('.quantity-input');
            const count = input ? Number(input.value) : null;
            appendSelection(key, count && count < maxCount ? count : null);
            setRowSelected(button, key, selectedMenuKeys.has(key));
            if (input && selectedMenuParts.has(key)) input.value = selectedMenuParts.get(key).count || maxCount;
          }) : undefined,
          onQuantityChange: multi ? ((button, detail) => {
            const count = detail?.count || maxCount;
            selectedMenuParts.set(key, { key, count: count < maxCount ? count : null });
            selectedMenuKeys.clear();
            for (const selectedKey of selectedMenuParts.keys()) selectedMenuKeys.add(selectedKey);
            syncMenuSelectionText();
            setRowSelected(button, key, true);
          }) : undefined,
        };
      }),
    });
    if (shopPaymentMenu && interactionConfirm) {
      interactionConfirm.disabled = selectedMenuParts.size === 0;
      setStatus(shopPaymentUiStatus.text);
    }
  }
}

function normalizeMapCoord(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max - 1, n));
}

function directionKeyForMapDelta(dx, dy) {
  const table = new Map([
    ['-1,-1', 'y'], ['0,-1', 'k'], ['1,-1', 'u'],
    ['-1,0', 'h'], ['1,0', 'l'],
    ['-1,1', 'b'], ['0,1', 'j'], ['1,1', 'n'],
  ]);
  return table.get(`${Math.sign(dx)},${Math.sign(dy)}`) && Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ? table.get(`${Math.sign(dx)},${Math.sign(dy)}`) : '';
}

function mapCellDirectionFromCursor(cellEl) {
  const x = Number(cellEl?.dataset?.mapX);
  const y = Number(cellEl?.dataset?.mapY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
  return directionKeyForMapDelta(x - gameViewSnapshot.cursor.x, y - gameViewSnapshot.cursor.y);
}

function directionKeyForStep(dx, dy) {
  return new Map([
    ['-1,-1', 'y'], ['0,-1', 'k'], ['1,-1', 'u'],
    ['-1,0', 'h'], ['0,0', '.'], ['1,0', 'l'],
    ['-1,1', 'b'], ['0,1', 'j'], ['1,1', 'n'],
  ]).get(`${Math.sign(dx)},${Math.sign(dy)}`) || '';
}

function mapTargetPathFromCursor(cellEl) {
  const x = Number(cellEl?.dataset?.mapX);
  const y = Number(cellEl?.dataset?.mapY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
  let dx = x - gameViewSnapshot.cursor.x;
  let dy = y - gameViewSnapshot.cursor.y;
  if (!dx && !dy) return '.';
  const keys = [];
  const limit = Math.max(mapWidth, mapHeight) + 8;
  while ((dx || dy) && keys.length < limit) {
    const key = directionKeyForStep(dx, dy);
    if (!key || key === '.') break;
    keys.push(key);
    dx -= Math.sign(dx);
    dy -= Math.sign(dy);
  }
  return keys.join('');
}


function summarizeTransferTransactions() {
  const state = gameViewSnapshot.transferTransactions || {};
  return {
    revision: state.revision || 0,
    activeSessionId: state.activeSessionId || '',
    activeTransferId: state.activeTransferId || '',
    sessions: Array.from(state.sessionsById || []).map(([, session]) => ({ ...session })),
    transfers: Array.from(state.transfersById || []).map(([, tx]) => ({ ...tx })),
    lastCompleted: state.lastCompleted ? { ...state.lastCompleted } : null,
    lastRejected: state.lastRejected ? { ...state.lastRejected } : null,
  };
}

function refreshGameViewPresentation() {
  refreshGameViewSnapshot();
  if (gameViewSnapshot.currentMenu && inventoryOverviewRequestActive() && isInventoryOverviewMenu(gameViewSnapshot.currentMenu) && gameViewSnapshot.activePrompt && sharedModules.interactionModel.isInventoryActionPrompt(gameViewSnapshot.activePrompt.query, gameViewSnapshot.activePrompt.choices)) {
    clearPromptOwnerState({ clearWorkflow: true });
  }
  const completedInventoryLazyLoad = isCanceledInventoryLazyLoadMenu(gameViewSnapshot.currentMenu) ? false : maybeCompleteInventoryLazyLoadFromMenu();
  if (completedInventoryLazyLoad) publishRendererGameViewEvent({ name: 'renderer_publish_inventory_choices', items: inventoryLazyLoad.rows });
  if (completedInventoryLazyLoad && gameViewSnapshot.activePrompt?.kind === 'question') window.setTimeout(renderPromptPanel, 0);
}

function diagnosticCategoryForEffect(effect = {}) {
  if (/prompt/.test(effect.type || '')) return 'prompt';
  if (/menu/.test(effect.type || '')) return 'menu';
  if (/command-transaction|transfer-/.test(effect.type || '')) return 'transaction';
  if (/inventory|equipment|status|map/.test(effect.type || '')) return 'state';
  return 'state';
}

let uxPublicStatePublishScheduled = false;
const pendingUxPublicStateReasons = new Set();
const pendingUxPublicStateEffectTypes = new Set();
const pendingUxPublicStateDomains = new Set();
const allUxPublicStateDomains = Object.freeze(['interaction', 'shell', 'discovery', 'map', 'items', 'transfer', 'run-lifecycle', 'conformance']);
function uxPublicStateDomainsForEffect(effect = {}) {
  const type = String(effect.type || 'unknown');
  if (/^(?:dirty-map-|render-map$|map-reset$|flush-map$|ground-pile-)/.test(type)) return ['map'];
  if (type === 'status') return [];
  if (type === 'render-status') return ['shell'];
  if (/message|milestone/.test(type)) return ['shell', 'discovery'];
  if (/inventory|equipment/.test(type)) return ['items', 'transfer', 'discovery'];
  if (/transfer|container/.test(type)) return ['transfer', 'items'];
  if (/prompt|menu|interaction|document|command-/.test(type)) return ['interaction', 'shell', 'discovery'];
  return allUxPublicStateDomains;
}
function publishUxPublicState() {
  uxPublicStatePublishScheduled = false;
  if (!uxRuntime?.publishPublicState) return;
  const reasons = Array.from(pendingUxPublicStateReasons);
  const effectTypes = Array.from(pendingUxPublicStateEffectTypes);
  const domains = Array.from(pendingUxPublicStateDomains);
  pendingUxPublicStateReasons.clear();
  pendingUxPublicStateEffectTypes.clear();
  pendingUxPublicStateDomains.clear();
  try {
    uxRuntime.publishPublicState({
      game: gameViewSnapshot,
      presentationSettings: userSettings,
      session: {
        restored: currentRunConfig?.runKind === 'continue',
        replay: Boolean(currentRunConfig?.replay),
        onboardingSuppressed: currentRunConfig?.runKind === 'continue' || Boolean(currentRunConfig?.replay),
      },
    }, { reasons, effectTypes, domains });
  } catch (error) {
    diagnosticEvent('ux-runtime', 'public-state.publish-failed', { reasons, domains, message: String(error?.message || error) });
  }
}

function scheduleUxPublicStatePublish(reason, effects = []) {
  const domains = new Set();
  for (const effect of effects || []) {
    pendingUxPublicStateEffectTypes.add(String(effect?.type || 'unknown'));
    for (const domain of uxPublicStateDomainsForEffect(effect)) domains.add(domain);
  }
  if (!domains.size) return;
  pendingUxPublicStateReasons.add(String(reason || 'state-change'));
  for (const domain of domains) pendingUxPublicStateDomains.add(domain);
  if (uxPublicStatePublishScheduled) return;
  uxPublicStatePublishScheduled = true;
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(publishUxPublicState);
  else window.setTimeout(publishUxPublicState, 0);
}

function applyGameViewEffects(effects) {
  for (const item of effects || []) {
    diagnosticEvent(diagnosticCategoryForEffect(item), `view-effect.${item.type || 'unknown'}`, item, { transactionId: item.transaction?.transactionId || item.transactionId || '', requestId: item.prompt?.requestId || item.menu?.requestId || item.requestId || '' });
    if (item.type === 'ground-pile-snapshot') {
      hydrateGroundTransferPanelFromPublicSnapshot(item.snapshot);
      renderContextActionBar();
    }
    else if (item.type === 'ground-pile-snapshot-rejected') {
      diagnosticEvent('state', 'ground-pile.snapshot.rejected', item);
    }
    else if (item.type === 'container-session-opened' || item.type === 'container-session-closed') {
    }
    else if (item.type === 'container-contents-snapshot') {
      hydrateDirectContainerPanelFromSnapshot(item.snapshot?.sessionId || item.sessionId || '');
    }
    else if (item.type === 'container-contents-snapshot-rejected') {
      diagnosticEvent('state', 'container-contents.snapshot.rejected', item);
    }
    else if (item.type === 'container-snapshot-rejected') {
      handleDirectContainerSnapshotRejected(item);
    }
    else if (/^transfer-/.test(String(item.type || ''))) {
      if (item.type === 'transfer-transaction-rejected' || item.type === 'transfer-transaction-followup-rejected') {
        const transferId = item.transfer?.transferId || item.rejection?.transferId || '';
        diagnosticEvent('transaction', 'transfer.rejected', item, { transactionId: transferId, requestId: item.transfer?.expectedRequestId || '' });
        showFailureNotice({ id: `transfer:${transferId || shimEventCount}:rejected`, kind: /stale|revision|moved/i.test(String(item.reason || item.rejection?.reason || '')) ? 'stale-revision' : 'rejected', reason: item.reason || item.rejection?.reason || '', blockerToken: item.rejection?.blockerToken || '', transactionId: transferId });
      }
    }
    else if (item.type === 'command-protocol-ack-recorded') {
      const ack = item.ack || {};
      if (ack.eventType === 'command.rejected' || ack.eventType === 'transaction.interrupted') {
        showFailureNotice({
          id: `command:${ack.commandId || ack.transactionId || shimEventCount}:${ack.eventType}`,
          kind: ack.eventType === 'transaction.interrupted' ? 'interrupted' : (/stale/i.test(String(ack.blockerToken || ack.reason || '')) ? 'stale-revision' : 'rejected'),
          reason: ack.reason || ack.eventType,
          blockerToken: ack.blockerToken || '',
          transactionId: ack.transactionId || ack.commandId || '',
        });
      }
    }
    else if (item.type === 'dirty-map-cell') markMapCellDirty(item.x, item.y);
    else if (item.type === 'dirty-map-neighborhood') markMapCellNeighborhoodDirty(item.x, item.y);
    else if (item.type === 'render-map') scheduleMapRender({ full: Boolean(item.full) });
    else if (item.type === 'map-reset') {
      publicTerrainLabelsByCoord.clear();
      publicTerrainLabelsDirty = true;
      if (gameGrid.childElementCount === mapWidth * mapHeight && mapCellElements.length === mapHeight) {
        if (Array.isArray(item.dirtyCells)) {
          for (const coord of item.dirtyCells) markMapCellNeighborhoodDirty(Number(coord?.x), Number(coord?.y));
        } else markAllMapCellsDirty();
        mapNeedsFullRender = false;
      } else {
        dirtyMapCells.clear();
        mapNeedsFullRender = true;
      }
    }
    else if (item.type === 'flush-map') {
      for (const coord of item.dirtyCells || []) markMapCellNeighborhoodDirty(Number(coord?.x), Number(coord?.y));
      flushMapRenderNow();
    }
    else if (item.type === 'message') {
      appendMessage(item.text, { logPrompt: item.logPrompt !== false, alreadyPublished: true, appended: item.appended });
      reconcileItemEquipmentOwner();
      rememberDeathCauseCandidate(item.text);
      if (isGameOverMessage(item.text)) {
        ensureGameOverState(deathCauseFromText(item.text));
        scheduleGameOverModal(900);
      }
    } else if (gameOverState?.active && (item.type === 'render-menu' || item.type === 'menu-changed' || item.type === 'render-prompt' || item.type === 'close-interaction' || item.type === 'open-document')) {
      if (item.type === 'open-document') appendGameOverSection(item.document?.title || 'NetHack statistics', item.document?.lines || []);
    } else if (item.type === 'render-menu' || item.type === 'menu-changed') {
      if (gameViewSnapshot.currentMenu?.suppressPicker && sharedModules.interactionModel.isGroundLookMenu(gameViewSnapshot.currentMenu)) rememberGroundItemsHere('passive-menu', gameViewSnapshot.currentMenu.items.map((menuItem) => `${menuItem.text || ''} ${menuItemSemanticDisplayName(menuItem) || ''}`.trim()).filter(Boolean));
      renderMenuPanel(); renderContextActionBar();
    }
    else if (item.type === 'render-prompt') {
      const ownedPrompt = gameViewSnapshot.activePrompt;
      if (ownedPrompt?.kind === 'question' && pendingContainerUnlockOpen?.phase === 'awaiting-unlock-target' && /\b(?:what|which).*(?:direction|way)|in what direction/i.test(String(ownedPrompt.query || ''))) {
        answerOwnedContainerUnlockPrompt(ownedPrompt, '.', 'awaiting-unlock-confirmation');
        continue;
      }
      if (ownedPrompt?.kind === 'question' && pendingContainerUnlockOpen?.phase === 'awaiting-unlock-confirmation' && isContainerUnlockPrompt(ownedPrompt.query)) {
        answerOwnedContainerUnlockPrompt(ownedPrompt, 'y', 'awaiting-unlock-result');
        continue;
      }
      if (ownedPrompt?.kind === 'extended command' && uxCommandPalette?.element?.open) {
        closeInteractionDialog({ force: true });
        if (promptPanel) {
          promptPanel.hidden = false;
          promptPanel.textContent = 'Choose an extended command';
        }
        continue;
      }
      const suppressedExtendedPromptReason = activeExtendedPromptSuppressionReason();
      if (suppressedExtendedPromptReason) {
        publishRendererGameViewEvent({ name: 'renderer_dismiss_interaction', expectedRequestId: gameViewSnapshot.activePrompt?.requestId || '', clearMenu: false });
        containerTransferSuppressedExtendedPrompt = null;
        closeInteractionDialog({ force: true });
        if (promptPanel) {
          promptPanel.hidden = true;
          promptPanel.textContent = 'No active prompt.';
        }
        setStatus(suppressedExtendedPromptReason);
      } else renderPromptPanel();
    }
    else if (item.type === 'render-status') { renderRawStatusLines(); reconcileItemEquipmentOwner(); renderContextActionBar(); }
    else if (item.type === 'inventory-snapshot' || item.type === 'equipment-snapshot') {
      reconcileItemEquipmentOwner();
      renderContextActionBar();
    }
    else if (item.type === 'command-transaction-started' || item.type === 'command-transaction-updated') {
      diagnosticEvent('transaction', 'command.awaiting-core', { transactionId: item.transaction?.transactionId || '', semanticAction: item.transaction?.semanticAction || '' }, { transactionId: item.transaction?.transactionId || '' });
    }
    else if (item.type === 'command-transaction-completed') {
      const uiProtocolCommand = item.transaction?.guiAction?.uiProtocol;
      if (uiProtocolCommand?.commandId) createAndRecordCommandAck('command.completed', {
        commandId: uiProtocolCommand.commandId,
        commandType: uiProtocolCommand.commandType || 'action.execute',
        actionId: uiProtocolCommand.actionId || item.result?.actionId || item.transaction?.semanticActionId || '',
        transactionId: item.transaction?.transactionId || '',
      }, {
        status: item.result?.status || item.transaction?.status || 'completed',
        result: item.result || {},
        executionSource: 'public-state-transaction',
        replayBehavior: 'replay executes recorded input events only',
      }, 'command-transaction');
      const transactionId = item.transaction?.transactionId || item.result?.transactionId || `revision-${gameViewSnapshot.commandTransactions?.revision || shimEventCount}`;
      const semanticAction = String(item.transaction?.semanticAction || item.result?.action || 'command');
      const semanticActionId = String(item.result?.actionId || item.transaction?.semanticActionId || item.transaction?.guiAction?.actionId || '');
      const failed = item.result?.status === 'failure' || item.transaction?.status === 'rejected';
      itemEquipmentOwner?.settle?.({
        intentId: transactionId,
        status: failed ? 'rejected' : 'completed',
        reason: item.result?.reason || item.transaction?.reason || '',
      });
      const benignCancellation = failed && sharedModules.uxFailurePresentation?.isBenignCancellationRejection?.(item);
      if (benignCancellation) {
        diagnosticEvent('transaction', 'command.cancellation-rejection-suppressed', { reason: item.result?.reason || item.transaction?.reason || '', transactionId });
      } else if (failed) {
        if (semanticActionId === 'run.save-and-exit') pendingConfirmedSaveAction = null;
        showFailureNotice({ id: `command:${transactionId}:failure`, dedupeKey: semanticActionId === 'run.save-and-exit' ? `save:${transactionId}:failure` : '', kind: semanticActionId === 'run.save-and-exit' ? 'save-rejected' : 'rejected', reason: item.result?.reason || item.transaction?.reason || '', blockerToken: item.result?.blockerToken || item.transaction?.blockerToken || '', transactionId });
      } else if (semanticActionId === 'run.save-and-exit') {
        diagnosticEvent('transaction', 'save.awaiting-process-ack', { transactionId, semanticActionId });
      } else if (/pick.?up/i.test(semanticAction)) {
        showPlayerNotice({ id: `command:${transactionId}:pickup`, kind: 'success', message: 'Item picked up', source: 'result', persistence: 'transient' });
      } else {
        showReadyNotice(`command:${transactionId}:complete`);
      }
    }
    else if (item.type === 'command-transaction-completion-rejected') {
      itemEquipmentOwner?.settle?.({ intentId: item.transactionId || '', status: 'rejected', reason: item.reason || '' });
      if (pendingConfirmedSaveAction && (!item.transactionId || item.transactionId === pendingConfirmedSaveAction.transactionId)) pendingConfirmedSaveAction = null;
      const transferId = String(item.transactionId || item.event?.transactionId || item.rejection?.event?.transactionId || '');
      const transferOwned = Boolean(transferId && (
        transferSession.snapshot().pending?.transferId === transferId
        || gameViewSnapshot.transferTransactions?.transfersById?.has?.(transferId)
      ));
      const benignCancellation = sharedModules.uxFailurePresentation?.isBenignCancellationRejection?.(item);
      if (transferOwned) diagnosticEvent('transaction', 'command.transfer-completion-rejection-suppressed', { transferId, reason: item.reason || '' });
      else if (benignCancellation) diagnosticEvent('transaction', 'command.cancellation-rejection-suppressed', { reason: item.reason || '', event: item.event || item.rejection?.event || null });
      else if (!/already completed/i.test(String(item.reason || ''))) showFailureNotice({ id: `command-completion:${item.transactionId || shimEventCount}`, kind: 'rejected', reason: item.reason || '', transactionId: item.transactionId || '' });
    }
    else if (item.type === 'inventory-updated') {
      if (transferPresentation?.active) {
        const inventoryProbeRows = (gameViewSnapshot.currentMenu?.items || []).filter((row) => row.selector);
        const inventoryProbePrompt = String(gameViewSnapshot.currentMenu?.prompt || '').trim();
        const inventoryProbeMenuLooksPromptless = (!inventoryProbePrompt || /^Menu$/i.test(inventoryProbePrompt))
          && inventoryProbeRows.length > 0
          && inventoryProbeRows.every((row) => rowLooksLikePublicInventoryItem(row));
        if (transferPresentation.sessionKind === 'container' && (inventoryOverviewRequestActive() || inventoryProbeMenuLooksPromptless)) {
          transferPresentation.inventoryProbeGraceUntil = Date.now() + 5000;
          transferPresentation.inventoryProbeMenuWindow = gameViewSnapshot.currentMenu?.window;
        }
        const incomingInventoryRows = currentInventoryTransferRows();
        const rightRows = incomingInventoryRows;
        if (transferPresentation.sessionKind === 'container' && (currentTransferChoreographyState({ kind: 'container' }).autoInventoryLoadPending || transferPresentation.autoInventoryLoadPending || transferPresentation.loadingSides?.right || !containerPaneLoaded('right'))) {
          transferPresentation.autoInventoryLoadPending = false;
          transferPresentation.inventoryProbeGraceUntil = Date.now() + 5000;
          transferPresentation.inventoryProbeMenuWindow = gameViewSnapshot.currentMenu?.window;
          markContainerPaneLoaded('right');
          transferPresentation.feedback = containerPaneLoaded('left') ? 'Both panes loaded. Drag items between container and inventory.' : 'Inventory loaded. Loading container contents…';
          applyTransferChoreographyPatch({ autoInventoryLoadPending: false, autoLoadingSide: '', refreshIntent: { kind: 'container-inventory-snapshot-loaded', side: 'right', reason: 'inventory snapshot updated container pane' } }, 'container inventory snapshot loaded');
        }
        dispatchTransferSessionEvent({ type: 'inventory', rows: rightRows });
        renderContainerTransferPanel();
      }
      reconcileItemEquipmentOwner();
      renderContextActionBar();
      if (gameViewSnapshot.activePrompt?.kind === 'question') renderPromptPanel();
    }
    else if (item.type === 'close-interaction') closeInteractionDialog();
    else if (item.type === 'hide-direction-helper') hideDirectionHelper();
    else if (item.type === 'open-document') openDocumentWindow(item.document);
    else if (item.type === 'status') {
      setStatus(item.text);
      if (/dungeon map ready|loading dungeon map|updating dungeon map/.test(String(item.text || ''))) recordPerformanceEvent('renderer.map.status', { text: item.text });
    }
    else if (item.type === 'record-milestone') recordMilestone(item.milestone.type, item.milestone.data);
  }
  scheduleUxPublicStatePublish('game-view-effects', effects || []);
}

function processShimGameEvent(event) {
  const result = gameView.process(event);
  if (deferredGameViewEffects) {
    deferredGameViewEffects.push(...(result.effects || []));
    return;
  }
  refreshGameViewPresentation();
  const preRenderSuppressedExtendedPromptReason = activeExtendedPromptSuppressionReason();
  if (preRenderSuppressedExtendedPromptReason) {
    publishRendererGameViewEvent({ name: 'renderer_dismiss_interaction', expectedRequestId: gameViewSnapshot.activePrompt?.requestId || '', clearMenu: false });
    containerTransferSuppressedExtendedPrompt = null;
    closeInteractionDialog({ force: true });
    setStatus(preRenderSuppressedExtendedPromptReason);
  }
  applyGameViewEffects(result.effects);
  refreshGameViewPresentation();
}

function flushDeferredGameViewEffects() {
  if (!deferredGameViewEffects) return;
  const effects = deferredGameViewEffects;
  deferredGameViewEffects = null;
  refreshGameViewPresentation();
  applyGameViewEffects(effects);
  refreshGameViewPresentation();
}

function publishTestMap(cells = [], cursor = { x: 0, y: 0 }) {
  processShimGameEvent({ name: 'shim_create_nhwindow', return: 1, windowType: 3 });
  processShimGameEvent({ name: 'shim_clear_nhwindow', window: 1 });
  for (const entry of cells) {
    processShimGameEvent({
      name: 'shim_print_glyph',
      window: 1,
      ...entry,
      x: normalizeMapCoord(entry.x, mapWidth),
      y: normalizeMapCoord(entry.y, mapHeight),
      char: entry.ch || entry.char || ' ',
    });
  }
  processShimGameEvent({ name: 'shim_curs', window: 1, x: normalizeMapCoord(cursor.x, mapWidth), y: normalizeMapCoord(cursor.y, mapHeight) });
}

async function runVersion() {
  setStatus('running version check');
  output.textContent = 'Running src/nethack --version…\n';
  const result = await netHackAPI.runVersion();
  output.textContent += result.output || '(no output)';
  output.dataset.ok = String(Boolean(result.ok));
  diagnosticEvent('smoke-check', result.ok ? 'version-check.passed' : 'version-check.failed', { ok: Boolean(result.ok) });
}

async function loadTileManifest() {
  try {
    const [manifestResponse, mapResponse] = await Promise.all([
      fetch('../assets/tiles/manifest.json', { cache: 'no-store' }),
      fetch('../assets/tiles/tile-map.json', { cache: 'no-store' }).catch(() => null),
    ]);
    tileManifest = sharedModules.tileAssets?.normalizeManifest ? sharedModules.tileAssets.normalizeManifest(await manifestResponse.json()) : await manifestResponse.json();
    if (mapResponse?.ok) tileMapConfig = { ...defaultTileMapConfig, ...(await mapResponse.json()) };
    tileAssetsById = sharedModules.tileAssets?.assetsById ? sharedModules.tileAssets.assetsById(tileManifest) : new Map((tileManifest.assets || []).filter((asset) => asset.installedPath).map((asset) => [asset.id, asset]));
    renderGameGrid({ full: true });
    updatePaths();
    syncCharacterSelects();
  } catch (error) {
    console.warn('Tile manifest unavailable; using ASCII fallback', error);
    if (isBrowserPreview) {
      // file:// browser previews cannot always fetch local JSON, but can still
      // display installed image URLs for screenshot verification.
      const previewAssets = [
        ['room-floor', 'Room floor', 'terrain-features'],
        ['vertical-wall', 'Vertical wall', 'terrain-features'],
        ['horizontal-wall', 'Horizontal wall', 'terrain-features'],
        ['closed-door', 'Closed door', 'terrain-features'],
        ['open-vertical-door', 'Open vertical door', 'terrain-features'],
        ['hero-avatar', 'Hero avatar', 'player-pets-identity'],
        ['kitten-pet', 'Kitten pet', 'player-pets-identity'],
        ['boulder', 'Boulder', 'objects-inventory'],
        ['fountain', 'Fountain', 'terrain-features'],
      ];
      tileAssetsById = new Map(previewAssets.map(([id, name, category]) => [id, { id, name, installedPath: `electron-poc/assets/tiles/generated/${category}/${id}.png` }]));
      renderGameGrid({ full: true });
      updatePaths();
      syncCharacterSelects();
    }
  }
}

netHackAPI.info().then((info) => {
  projectInfo = info;
  updatePaths();
});

loadTileManifest();

netHackAPI.onData((data) => term.write(data));
netHackAPI.onExit((exit) => {
  term.writeln(`\r\n[NetHack exited: ${JSON.stringify(exit)}]`);
  shimOutput.textContent += `[exit] ${JSON.stringify(exit)}\n`;
  setRunningState({ running: false });
  if (activeRecording) saveActiveRecording(exit.expected ? 'stopped' : 'process-exit');
  const confirmedSave = pendingConfirmedSaveAction?.actionId === 'run.save-and-exit'
    && Date.now() - Number(pendingConfirmedSaveAction.confirmedAt || 0) <= 15_000;
  const saveAcknowledgement = pendingConfirmedSaveAction;
  pendingConfirmedSaveAction = null;
  if (confirmedSave && exit.ok === true && Number(exit.code) === 0) {
    showPlayerNotice({ id: `command:${saveAcknowledgement.transactionId || Date.now()}:saved`, kind: 'success', message: 'Game saved', source: 'result', persistence: 'sticky' });
    diagnosticEvent('transaction', 'save.core-acknowledged', { ...saveAcknowledgement, exit });
  } else if (gameOverState?.active) showGameOverModal();
  else if (exit.expected) showPlayerNotice({ id: `process:stopped:${Date.now()}`, kind: 'info', message: 'Game stopped', source: 'result', persistence: 'transient' });
  else {
    showFailureNotice({ id: `process:exit:${Date.now()}`, kind: 'process-exit', reason: exit.reason || exit.message || 'unexpected process exit', diagnosticRef: exit.runId || '' });
  }
});

netHackAPI.onState((state) => {
  setRunningState(state);
  if (state.running) showReadyNotice(`process:running:${state.runId || state.startedAt || 'current'}`);
});

function flushShimEvents() {
  shimFlushScheduled = false;
  if (!pendingShimEvents.length) return;
  shimLines.push(...pendingShimEvents);
  pendingShimEvents = [];
  if (shimLines.length > maxShimLines) shimLines = shimLines.slice(-maxShimLines);
  const omitted = shimEventCount > shimLines.length ? `[showing latest ${shimLines.length} of ${shimEventCount} shim events]\n` : '';
  const summary = `[seen: ${Array.from(seenShimEventNames).sort().join(', ')}]\n`;
  shimOutput.dataset.seen = Array.from(seenShimEventNames).sort().join(',');
  shimOutput.dataset.count = String(shimEventCount);
  shimOutput.textContent = `${summary}${omitted}${shimLines.join('\n')}\n`; 
  shimOutput.scrollTop = shimOutput.scrollHeight;
}

function handleShimEvent(event) {
  const sourceEvent = event?.event || event?.raw || event || {};
  const appEvent = sharedModules.shimProtocol?.normalizeRawShimEvent ? sharedModules.shimProtocol.normalizeRawShimEvent(sourceEvent) : { event: sourceEvent, name: sourceEvent?.name };
  const rawEvent = appEvent.event || appEvent.raw || sourceEvent;
  if (pendingPromptCancellation && cancellationAnswerTransports.has(rawEvent?.name)) {
    // Match only the authoritative normalized public event. Production ingress
    // has already passed through game-process normalization and the preload
    // JSON clone; renderer-local raw objects must not bypass that boundary.
    const responseEvent = rawEvent;
    const pending = pendingPromptCancellation;
    const expectedRequestId = String(pending.requestId || '').trim();
    const exposedRequestIds = ['requestId', 'menuRequestId', 'promptId']
      .filter((key) => Object.prototype.hasOwnProperty.call(responseEvent, key))
      .map((key) => String(responseEvent[key] ?? '').trim());
    const actualRequestId = exposedRequestIds[0] || '';
    const expectedTransactionId = String(pending.transactionId || '').trim();
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(responseEvent, key);
    const exposedTransactionIds = ['transactionId', 'inputTransactionId']
      .filter(hasOwn)
      .map((key) => String(responseEvent[key] ?? '').trim());
    const transportMatches = rawEvent.name === pending.acknowledgementEvent;
    const requestMatches = Boolean(expectedRequestId
      && hasOwn('requestId') && typeof responseEvent.requestId === 'string' && responseEvent.requestId === expectedRequestId
      && exposedRequestIds.every((requestId) => requestId && expectedRequestId === requestId));
    const transactionMatches = rawEvent.name === 'bridge_menu_answer'
      ? Boolean(expectedTransactionId
        && hasOwn('transactionId') && typeof responseEvent.transactionId === 'string' && responseEvent.transactionId === expectedTransactionId
        && hasOwn('inputTransactionId') && typeof responseEvent.inputTransactionId === 'string' && responseEvent.inputTransactionId === expectedTransactionId
        && exposedTransactionIds.every((transactionId) => Boolean(transactionId && expectedTransactionId === transactionId)))
      : exposedTransactionIds.every((transactionId) => Boolean(transactionId && expectedTransactionId && expectedTransactionId === transactionId));
    const exactOwnedMenuIdentity = rawEvent.name !== 'bridge_menu_answer' || Boolean(
      hasOwn('menuRequestId') && typeof responseEvent.menuRequestId === 'string' && responseEvent.menuRequestId === expectedRequestId
      && hasOwn('window') && typeof responseEvent.window === 'number' && Number.isSafeInteger(responseEvent.window) && Object.is(responseEvent.window, pending.window)
      && hasOwn('menuId') && typeof responseEvent.menuId === 'string' && responseEvent.menuId === pending.menuId
      && hasOwn('lifecycleRevision') && typeof responseEvent.lifecycleRevision === 'number' && Number.isSafeInteger(responseEvent.lifecycleRevision) && Object.is(responseEvent.lifecycleRevision, pending.lifecycleRevision)
      && hasOwn('lifecycle') && responseEvent.lifecycle === 'answered'
      && hasOwn('menuPurpose') && typeof responseEvent.menuPurpose === 'string' && responseEvent.menuPurpose === pending.menuPurpose
      && hasOwn('owner') && responseEvent.owner && typeof responseEvent.owner === 'object' && !Array.isArray(responseEvent.owner)
      && Object.prototype.hasOwnProperty.call(responseEvent.owner, 'kind') && responseEvent.owner.kind === pending.ownerKind
      && Object.prototype.hasOwnProperty.call(responseEvent.owner, 'window') && typeof responseEvent.owner.window === 'number' && Number.isSafeInteger(responseEvent.owner.window) && Object.is(responseEvent.owner.window, pending.window)
      && hasOwn('requestSource') && responseEvent.requestSource && typeof responseEvent.requestSource === 'object' && !Array.isArray(responseEvent.requestSource)
      && Object.prototype.hasOwnProperty.call(responseEvent.requestSource, 'layer') && responseEvent.requestSource.layer === pending.requestSourceLayer
      && Object.prototype.hasOwnProperty.call(responseEvent.requestSource, 'window') && typeof responseEvent.requestSource.window === 'number' && Number.isSafeInteger(responseEvent.requestSource.window) && Object.is(responseEvent.requestSource.window, pending.window)
      && hasOwn('activeRequestMatch') && responseEvent.activeRequestMatch === true
      && hasOwn('inputMatchesMenuTransaction') && responseEvent.inputMatchesMenuTransaction === true
      && [['activeRequestId', expectedRequestId], ['activeMenuRequestId', expectedRequestId], ['activePromptRequestId', expectedRequestId], ['expectedRequestId', expectedRequestId], ['activeRequestKind', pending.ownerKind], ['activeMenuTransactionId', expectedTransactionId], ['activeRequestTransactionId', expectedTransactionId], ['activeTransactionId', expectedTransactionId]]
        .every(([key, expected]) => !hasOwn(key) || (typeof responseEvent[key] === 'string' && responseEvent[key] === expected))
    );
    let actualKey = '';
    let responseIsExplicit = false;
    let responseFieldsAgree = true;
    if (rawEvent.name === 'bridge_prompt_answer') {
      const responseValues = [];
      if (hasOwn('keycode')) {
        if (typeof responseEvent.keycode === 'number' && Number.isInteger(responseEvent.keycode) && responseEvent.keycode > 0 && responseEvent.keycode <= 255) responseValues.push(String.fromCharCode(responseEvent.keycode));
        else responseFieldsAgree = false;
      }
      for (const field of ['value', 'key', 'answer']) {
        if (!hasOwn(field)) continue;
        if (typeof responseEvent[field] === 'string') responseValues.push(responseEvent[field]);
        else responseFieldsAgree = false;
      }
      responseIsExplicit = responseValues.length > 0;
      actualKey = responseValues[0] || '';
      if (responseValues.some((value) => value !== actualKey)) responseFieldsAgree = false;
    } else if (rawEvent.name === 'bridge_line_answer') {
      responseIsExplicit = hasOwn('value') && typeof responseEvent.value === 'string';
      responseFieldsAgree = responseIsExplicit && ['answer', 'key'].every((field) => !hasOwn(field) || responseEvent[field] === responseEvent.value);
      if (responseIsExplicit) actualKey = responseEvent.value === '' ? '\u001b' : responseEvent.value;
    } else if (rawEvent.name === 'bridge_menu_answer') {
      responseIsExplicit = hasOwn('return') && typeof responseEvent.return === 'number' && Number.isSafeInteger(responseEvent.return) && Object.is(responseEvent.return, 0)
        && hasOwn('selector') && typeof responseEvent.selector === 'number' && Number.isSafeInteger(responseEvent.selector) && Object.is(responseEvent.selector, 0)
        && hasOwn('selectors') && typeof responseEvent.selectors === 'string' && responseEvent.selectors === '';
      responseFieldsAgree = responseIsExplicit
        && ['answer', 'value', 'key', 'selection'].every((field) => !hasOwn(field) || (typeof responseEvent[field] === 'string' && responseEvent[field] === ''));
      if (responseEvent.return === 0) actualKey = '\u001b';
      else if (hasOwn('return')) actualKey = String(responseEvent.return ?? '');
    } else if (rawEvent.name === 'bridge_extcmd_answer') {
      responseIsExplicit = hasOwn('value') && typeof responseEvent.value === 'string';
      responseFieldsAgree = responseIsExplicit && responseEvent.value === ''
        && (!hasOwn('return') || responseEvent.return === -1)
        && ['command', 'answer', 'key'].every((field) => !hasOwn(field) || responseEvent[field] === '');
      if (responseEvent.value === '') actualKey = '\u001b';
      else if (hasOwn('value')) actualKey = String(responseEvent.value ?? '');
    }
    const keyMatches = responseIsExplicit && responseFieldsAgree && actualKey === pending.responseKey;
    if (transportMatches && requestMatches && transactionMatches && exactOwnedMenuIdentity && keyMatches) {
      lastPromptCancellationAcknowledgement = Object.freeze({
        status: 'acknowledged',
        intent: 'cancel',
        promptFamily: pending.promptFamily,
        requestId: actualRequestId,
        responseKey: actualKey,
        transportEvent: rawEvent.name,
        canonicalChoice: pending.canonicalChoice,
      });
      diagnosticEvent('prompt', 'prompt.cancellation.acknowledged', lastPromptCancellationAcknowledgement, { transactionId: expectedTransactionId, requestId: actualRequestId });
    } else {
      const unowned = !requestMatches;
      const diagnostic = {
        type: unowned ? 'prompt.cancellation.acknowledgement-unowned' : 'prompt.cancellation.acknowledgement-mismatch',
        payload: {
          expectedRequestId: expectedRequestId.slice(0, 160),
          actualRequestId: actualRequestId.slice(0, 160),
          expectedTransport: pending.acknowledgementEvent,
          actualTransport: rawEvent.name,
          expectedKey: pending.responseKey,
          actualKey: actualKey.slice(0, 8),
          responseIsExplicit,
          responseFieldsAgree,
          transactionMetadataMatches: transactionMatches,
          exactOwnedMenuIdentity,
        },
      };
      testPromptCancellationDiagnostics.push(diagnostic);
      if (testPromptCancellationDiagnostics.length > 16) testPromptCancellationDiagnostics = testPromptCancellationDiagnostics.slice(-16);
      diagnosticEvent('prompt', diagnostic.type, diagnostic.payload, { transactionId: expectedTransactionId, requestId: actualRequestId });
    }
    // Every bridge answer consumes this one-shot record. A malformed, foreign,
    // or wrong-family answer must not leave stale ownership for a later event.
    pendingPromptCancellation = null;
  }
  if (rawEvent?.name === 'bridge_prompt_answer' && Number(rawEvent.keycode) === 121 && /really save/i.test(String(gameViewSnapshot.activePrompt?.query || ''))) {
    const transactionId = String(rawEvent.transactionId || gameViewSnapshot.activePrompt?.transactionId || gameViewSnapshot.activeTransactionId || '');
    const transaction = transactionId ? gameViewSnapshot.commandTransactions.byId?.get?.(transactionId) : null;
    const actionId = String(transaction?.semanticActionId || transaction?.guiAction?.actionId || '');
    if (actionId === 'run.save-and-exit') pendingConfirmedSaveAction = { actionId, transactionId, confirmedAt: Date.now() };
  }
  if (pendingConfirmedSaveAction && ['shim_raw_print', 'shim_putstr'].includes(rawEvent?.name) && /(?:cannot|can't|unable to|failed to) (?:open )?save/i.test(String(rawEvent.text || rawEvent.message || ''))) {
    const rejectedSave = pendingConfirmedSaveAction;
    const reason = rawEvent.text || rawEvent.message || 'NetHack could not save the game.';
    diagnosticEvent('transaction', 'save.core-rejected', { ...rejectedSave, message: reason });
    pendingConfirmedSaveAction = null;
    showFailureNotice({ id: `command:${rejectedSave.transactionId || shimEventCount}:save-failed`, dedupeKey: `save:${rejectedSave.transactionId || shimEventCount}:failure`, kind: 'save-rejected', reason, transactionId: rejectedSave.transactionId || '' });
  }
  shimEventCount += 1;
  const suppressVerboseRendererShimDiagnostic = shimEventBatchDepth > 0 && ['shim_print_glyph', 'shim_clear_nhwindow', 'shim_display_nhwindow'].includes(rawEvent?.name);
  if (!suppressVerboseRendererShimDiagnostic) diagnosticEvent('shim-event', 'shim.event.renderer.received', { protocol: appEvent.protocol, kind: appEvent.kind, known: appEvent.known, name: rawEvent?.name || null, event: rawEvent });
  if (rawEvent.name) seenShimEventNames.add(rawEvent.name);
  if (rawEvent.name === 'shim_ground_pile_snapshot') {
    publicGroundPileShimEvidence.push(JSON.parse(JSON.stringify(rawEvent)));
    if (publicGroundPileShimEvidence.length > 32) publicGroundPileShimEvidence = publicGroundPileShimEvidence.slice(-32);
  }
  handleBridgeUiCommandEvent(rawEvent);
  handleBridgeDirectEquipmentEvent(rawEvent);
  if (rawEvent.name === 'shim_native_end_diagnostic' && rawEvent.finalFlow) {
    const nativeCause = deathCauseFromNativeEnd(rawEvent);
    const authoritativeNativeCause = rawEvent.phase === 'really_done.final_killer' ? nativeCause : '';
    diagnosticEvent('game-over', authoritativeNativeCause ? 'game-over.native-end.candidate' : 'game-over.native-end.ignored', { phase: rawEvent.phase || '', how: rawEvent.how, reason: rawEvent.reason || '', killer: rawEvent.killer || '', killerName: rawEvent.killerName || '', killerFormat: rawEvent.killerFormat, nativeCause, authoritativeNativeCause });
    if (authoritativeNativeCause) {
      ensureGameOverState(authoritativeNativeCause, { source: 'native-end' });
      scheduleGameOverModal(500);
    }
  }
  if (rawEvent.name === 'shim_putstr' || rawEvent.name === 'shim_raw_print' || rawEvent.name === 'shim_raw_print_bold') {
    rememberDeathCauseCandidate(rawEvent.text);
    const gameOverCandidate = isGameOverMessage(rawEvent.text);
    diagnosticEvent('game-over', gameOverCandidate ? 'game-over.message.candidate' : 'game-over.message.ignored', { name: rawEvent.name, text: rawEvent.text, candidate: gameOverCandidate, deathCause: gameOverCandidate ? deathCauseFromText(rawEvent.text) : '' });
    if (gameOverCandidate) ensureGameOverState(deathCauseFromText(rawEvent.text));
  }
  if (rawEvent.name === 'shim_yn_function' && /^Really quit(?: without saving)?\??$/i.test(String(rawEvent.query || '').trim())) {
    pendingQuitConfirmation = { requestId: rawEvent.requestId || rawEvent.promptId || '', active: true };
  } else if (rawEvent.name === 'bridge_prompt_answer' && pendingQuitConfirmation?.active) {
    const answer = String(rawEvent.answer || rawEvent.key || (Number(rawEvent.keycode) > 0 ? String.fromCharCode(Number(rawEvent.keycode)) : '')).toLowerCase();
    const requestId = rawEvent.requestId || rawEvent.promptId || '';
    if (!pendingQuitConfirmation.requestId || !requestId || requestId === pendingQuitConfirmation.requestId) {
      if (answer === 'y') ensureGameOverState('Quit without saving', { source: 'quit-confirmation' });
      pendingQuitConfirmation = null;
    }
  }
  const autoDisclosurePrompt = Boolean(gameOverState?.active && isGameOverDisclosurePrompt(rawEvent));
  if (rawEvent.name === 'bridge_seed' && rawEvent.seed != null) {
    diagnosticEvent('seed', 'seed.bridge.observed.renderer', { seed: String(rawEvent.seed), source: rawEvent.source || 'bridge_seed', requestedSeed: currentRunConfig?.requestedSeed || '', chosenSeed: currentRunConfig?.seed || '' });
    if (activeRecording) {
      activeRecording.seed = String(rawEvent.seed);
      activeRecording.seedSource = rawEvent.source || activeRecording.seedSource || 'bridge_seed';
      activeRecording.metadata = { ...(activeRecording.metadata || {}), effectiveSeedCapturedAt: Math.round(performance.now()) };
      updateRecordingStatus(`Recording deterministic seed: ${rawEvent.seed}`);
    }
    if (currentRunConfig) currentRunConfig.effectiveSeed = String(rawEvent.seed);
  }
  if (autoDisclosurePrompt) {
    gameOverState.prompts.push(rawEvent.query || 'game-over disclosure prompt');
    diagnosticEvent('game-over', 'game-over.disclosure.prompt.auto-answer', { query: rawEvent.query || '', requestId: rawEvent.requestId || rawEvent.promptId || '', answer: 'y' }, { requestId: rawEvent.requestId || rawEvent.promptId || '' });
    sendRecordedShimInput({ type: 'keycode', keycode: 'y'.charCodeAt(0) }, 'auto-disclosure');
    setStatus('collecting final NetHack statistics');
  }
  const onboardingCursorBefore = { x: gameViewSnapshot.cursor.x, y: gameViewSnapshot.cursor.y, window: gameViewSnapshot.cursor.window };
  processShimGameEvent(appEvent);
  if (rawEvent.name === 'bridge_extcmd_answer' && uxCommandPalette?.element?.open && uxCommandPalette.model.snapshot().mode === 'core') {
    uxCommandPalette.close('core-answered');
  }
  if (rawEvent.name === 'shim_curs' && introLoreShown && !introDialog?.open && (gameViewSnapshot.cursor.x !== onboardingCursorBefore.x || gameViewSnapshot.cursor.y !== onboardingCursorBefore.y) && gameViewSnapshot.cursor.window === gameViewSnapshot.mapWindowId) {
    uxOnboarding?.observe?.({ type: 'movement-confirmed', confirmed: true });
  }
  if (['shim_yn_function', 'shim_getlin', 'shim_get_ext_cmd', 'shim_select_menu'].includes(rawEvent.name) && !rawEvent.autoAnswered) {
    uxOnboarding?.observe?.({ type: 'core-prompt-opened', ownerId: String(rawEvent.requestId || rawEvent.menuRequestId || rawEvent.promptId || `core:${rawEvent.name}`) });
  }
  if (['bridge_prompt_answer', 'bridge_line_answer', 'bridge_extcmd_answer', 'bridge_menu_answer'].includes(rawEvent.name)) {
    uxOnboarding?.observe?.({ type: 'core-prompt-closed', ownerId: String(rawEvent.requestId || rawEvent.menuRequestId || rawEvent.promptId || `core:${rawEvent.name.replace('bridge_', 'shim_')}`) });
    if (rawEvent.name === 'bridge_menu_answer') uxOnboarding?.observe?.({ type: 'inventory-closed', confirmed: true });
  }
  if (['bridge_extcmd_catalog', 'shim_get_ext_cmd'].includes(rawEvent.name) && gameViewSnapshot.activePrompt?.kind === 'extended command' && !pendingPromptCancellation && !uxCommandPalette?.element?.open) {
    closeInteractionDialog({ force: true });
    uxCommandPalette?.open?.({ mode: 'core', publicState: discoveryPublicState(), invoker: gameGrid });
  }
  if ((rawEvent.name === 'shim_putstr' || rawEvent.name === 'shim_raw_print' || rawEvent.name === 'shim_raw_print_bold')) {
    maybeHandleContainerInterruption(rawEvent.text);
    maybeContinueContainerOpenAfterUnlock(rawEvent.text);
  }
  maybeDispatchContainerOpenAfterUnlock();
  if (transferPresentation?.active && gameViewSnapshot.activePrompt && gameViewSnapshot.activePrompt.kind !== 'menu selection' && !transferPresentation.dropPending && !transferPresentation.textWindowGroundItems && !currentPendingContainerTransferSelection()) {
    const pendingTransfer = transferSession.snapshot().pending;
    const groundDropPrompt = pendingTransfer?.direction === 'inventory-to-ground'
      && /\bWhat do you want to drop\?/i.test(String(gameViewSnapshot.activePrompt.query || gameViewSnapshot.activePrompt.question || ''));
    const suppressedExtendedPromptReason = activeExtendedPromptSuppressionReason();
    if (groundDropPrompt) {
      dispatchTransferSessionEvent({
        type: 'menu',
        menu: {
          ...gameViewSnapshot.activePrompt,
          prompt: gameViewSnapshot.activePrompt.query || gameViewSnapshot.activePrompt.question || 'What do you want to drop?',
          awaitingSelection: true,
          how: 1,
          items: currentInventoryTransferRows(),
        },
        inventoryRows: currentInventoryTransferRows(),
      });
      closeInteractionDialog({ force: true });
      renderContainerTransferPanel();
    } else if (suppressedExtendedPromptReason) {
      clearTransferPanelOwnerChrome();
      closeInteractionDialog({ force: true });
      setStatus(suppressedExtendedPromptReason);
    } else if (shouldKeepContainerPanelBehindVisiblePrompt()) {
      transferPresentation.feedback = 'NetHack needs an answer before the container refresh can continue.';
      renderContainerTransferPanel();
    } else closeContainerTransferPanel('Transfer panel closed because NetHack opened a different prompt.');
  }
  if (transferSession.snapshot().pending && rawEvent.name === 'bridge_semantic_followup_rejected') {
    dispatchTransferSessionEvent({
      type: 'rejected',
      transferId: rawEvent.transferId || rawEvent.transactionId || transferSession.snapshot().pending.transferId,
      sessionId: transferSession.snapshot().sessionId,
      requestId: rawEvent.requestId || rawEvent.menuRequestId || rawEvent.promptId || '',
      reason: rawEvent.reason || 'semantic transfer follow-up rejected before NetHack consumed it',
    });
  }
  if (transferSession.snapshot().active && [
    'shim_ground_transfer_confirmed',
    'shim_ground_transfer_rejected',
    'shim_container_transfer_confirmed',
    'shim_container_transfer_rejected',
  ].includes(rawEvent.name)) {
    const accepted = rawEvent.name.endsWith('_confirmed');
    const transferId = rawEvent.transferId || rawEvent.transactionId || '';
    const result = dispatchTransferSessionEvent({
      type: accepted ? 'confirmed' : 'rejected',
      transferId,
      transactionId: rawEvent.transactionId || transferId,
      sessionId: rawEvent.sessionId || transferSession.snapshot().sessionId,
      direction: rawEvent.direction,
      itemId: rawEvent.itemId,
      requestId: rawEvent.requestId || rawEvent.menuRequestId || '',
      reason: rawEvent.reason || (accepted ? 'authoritative NetHack transfer confirmation' : 'NetHack rejected the transfer'),
      failureKind: rawEvent.failureKind || '',
    });
    const ignored = result.effects.find((effect) => effect.type === 'ignored-followup');
    if (ignored) {
      diagnosticEvent('transaction', 'transfer-session.followup-ignored', { transferId, reason: ignored.reason, event: rawEvent }, { transactionId: transferId });
    } else {
      clearDirectTransferPending(transferId);
      if (accepted) {
        const migrateSelector = String(rawEvent.selector || rawEvent.itemSelector || '');
        const migrateSide = rawEvent.direction === 'to-container' || rawEvent.direction === 'drop' ? 'right' : 'left';
        const migrateRow = migrateSelector
          ? containerTransferPanel?.querySelector(`.container-item-row[data-container-side="${migrateSide}"][data-selector="${CSS.escape(migrateSelector)}"]`)
          : containerTransferPanel?.querySelector('.container-item-row.is-selected, .container-item-row[aria-checked="true"]');
        if (migrateRow) globalThis.NetHackUxFeedback?.animateTransferMigrate?.(migrateRow);
        window.setTimeout(() => {
          renderContainerTransferPanel();
          const insertSide = migrateSide === 'left' ? 'right' : 'left';
          const inserted = containerTransferPanel?.querySelector(`.container-item-row[data-container-side="${insertSide}"]`);
          if (inserted) globalThis.NetHackUxFeedback?.animateTransferInsert?.(inserted);
        }, 140);
      } else {
        const failed = containerTransferPanel?.querySelector('.container-item-row.is-selected, .container-item-row[aria-checked="true"], .container-item-row.dragging');
        if (failed) globalThis.NetHackUxFeedback?.animateBlocked?.(failed);
        renderContainerTransferPanel();
        showFailureNotice({
          id: `transfer-session:${transferId || shimEventCount}:rejected`,
          kind: /stale|revision|moved/i.test(String(rawEvent.reason || '')) ? 'stale-revision' : 'rejected',
          reason: rawEvent.reason || '',
          transactionId: transferId,
        });
      }
    }
  } else if (rawEvent.name === 'shim_terrain_action_rejected') {
    const reason = rawEvent.reason || 'direct terrain action rejected';
    setStatus(reason);
    showFailureNotice({ id: `terrain:${rawEvent.transactionId || shimEventCount}:rejected`, kind: 'rejected', reason, transactionId: rawEvent.transactionId || '' });
    appendMessage(reason, { allowConsecutiveDuplicate: true, logPrompt: false });
  } else if (rawEvent.name === 'shim_terrain_action_confirmed') {
    if (rawEvent.reason) setStatus(rawEvent.reason);
  }
  const activePanelTransfer = transferSession.snapshot().pending;
  if (activePanelTransfer && ['bridge_menu_answer', 'bridge_prompt_answer', 'bridge_line_answer'].includes(rawEvent.name)) {
    const cancelled = (rawEvent.name === 'bridge_menu_answer' && !Number(rawEvent.return || 0) && !rawEvent.answer && !rawEvent.selection)
      || Number(rawEvent.keycode) === 27
      || rawEvent.answer === '\u001b'
      || rawEvent.key === '\u001b';
    const requestId = rawEvent.requestId || rawEvent.menuRequestId || rawEvent.promptId || '';
    dispatchTransferSessionEvent({
      type: cancelled ? 'rejected' : 'confirmed',
      transferId: rawEvent.transferId || activePanelTransfer.transferId,
      sessionId: activePanelTransfer.sessionId,
      requestId,
      direction: activePanelTransfer.direction,
      reason: cancelled ? 'cancelled by player' : 'confirmed by NetHack prompt/menu answer',
    });
    renderContainerTransferPanel();
  }
  if (transferPresentation?.active && transferPresentation.dropPending && (rawEvent.name === 'bridge_prompt_answer' || rawEvent.name === 'bridge_menu_answer')) {
    transferPresentation.dropPending = false;
  }
  if (transferPresentation?.active && transferChoreographyReopenPending() && rawEvent.name === 'bridge_menu_answer') {
    const shouldReopen = !transferPresentation.interrupted;
    const choreography = currentTransferChoreographyState();
    const reopenCommand = choreography.refreshIntent?.command || (transferPresentation.sessionKind === 'ground-pickup' ? ',' : '');
    if (transferPresentation.sessionKind === 'container') keepContainerTransferOpenThroughRefresh();
    transferPresentation.reopenPending = false;
    applyTransferChoreographyPatch({ reopenPending: false, clearRefreshIntent: true }, 'transfer refresh intent consumed after menu answer');
    if (shouldReopen) window.setTimeout(() => {
      if (!transferPresentation?.active) return;
      if (transferPresentation.sessionKind === 'ground-pickup') sendPlayableText(reopenCommand);
      else if (!gameViewSnapshot.activePrompt && !gameViewSnapshot.currentMenu?.awaitingSelection) requestDirectContainerSnapshotRefresh('post-transfer-menu-answer');
    }, 80);
  }
  if (gameOverState?.active && rawEvent.name === 'shim_end_menu') appendGameOverSection(rawEvent.prompt || gameViewSnapshot.currentMenu?.prompt || 'NetHack statistics', (gameViewSnapshot.currentMenu?.items || []).map((item) => item.text || ''));
  if (gameOverState?.active && rawEvent.name === 'shim_select_menu' && Number(rawEvent.how || 0) === 0) {
    diagnosticEvent('game-over', 'game-over.disclosure.menu.auto-space', { prompt: rawEvent.prompt || gameViewSnapshot.currentMenu?.prompt || '', requestId: rawEvent.requestId || gameViewSnapshot.currentMenu?.requestId || '' }, { requestId: rawEvent.requestId || gameViewSnapshot.currentMenu?.requestId || '' });
    sendRecordedShimInput({ type: 'keycode', keycode: ' '.charCodeAt(0) }, 'auto-menu-space');
  }
  if (gameOverState?.active && rawEvent.name === 'shim_display_nhwindow' && documentWindow?.lines?.length) appendGameOverSection(documentWindow.title || 'NetHack statistics', documentWindow.lines);
  if (gameOverState?.active) scheduleGameOverModal(rawEvent.name === 'shim_yn_function' ? 1200 : 500);
  pendingShimEvents.push(JSON.stringify({ protocol: appEvent.protocol, kind: appEvent.kind, known: appEvent.known, event: rawEvent, autoAnswered: autoDisclosurePrompt ? 'y' : undefined }));
  if (!shimFlushScheduled) {
    shimFlushScheduled = true;
    window.requestAnimationFrame(flushShimEvents);
  }
  if (rawEvent.name === 'shim_yn_function') {
    if (rawEvent.autoAnswered) {
      // Auto-answered shim prompts (currently GUI ring-finger selection) are
      // evidence, not active UI ownership; do not treat them as visible item prompts.
    } else if (sharedModules.interactionModel.isInventoryActionPrompt(rawEvent.query, rawEvent.choices)) lastInventoryActionQuery = rawEvent.query || '';
    else lastInventoryActionQuery = '';
  }
  if (rawEvent.name === 'bridge_extcmd_answer' && activeWorkflowContext) delete activeWorkflowContext.submittedExtendedCommand;
  if (rawEvent.name === 'bridge_prompt_answer') {
    const answeredWithEsc = Number(rawEvent.keycode) === 27 || rawEvent.answer === '\u001b' || rawEvent.key === '\u001b';
    if (answeredWithEsc) clearPromptOwnerState({ clearWorkflow: true });
  }
  if (rawEvent.name === 'bridge_menu_answer' && !Number(rawEvent.return || 0)) clearWorkflowContext();
  if (rawEvent.name === 'bridge_command' && shopPaymentUiStatus.phase === 'idle') setStatus('command accepted');
  if (rawEvent.name === 'shim_raw_print' || rawEvent.name === 'shim_putstr') {
    const message = String(rawEvent.text || '').trim();
    const paymentStatusActive = shopPaymentUiStatus.phase !== 'idle' && (!shopPaymentUiStatus.until || Date.now() < shopPaymentUiStatus.until);
    if (paymentStatusActive && /no gold or credit/i.test(message)) {
      shopPaymentUiStatus = { phase: 'result', text: message || 'You have no gold or credit.', until: Date.now() + 5000 };
      setStatus(shopPaymentUiStatus.text);
    } else if (paymentStatusActive && /thank you for shopping/i.test(message)) {
      shopPaymentUiStatus = { phase: 'result', text: 'Payment complete', until: Date.now() + 5000 };
      setStatus(shopPaymentUiStatus.text);
    } else if (paymentStatusActive) setStatus(shopPaymentUiStatus.text);
    else setStatus('Ready.');
  }
  if (Date.now() < stalePlaceholderStatusSuppressUntil) setStatus('information menu suppressed');
  if (Date.now() < monsterSenseFarlookStatusUntil) setStatus('monster-sense map browse active');
  settleTransferPanelOwnership();
}

function handleShimEvents(payload) {
  const events = Array.isArray(payload) ? payload : [payload];
  const batchStartedAt = typeof performance !== 'undefined' ? performance.now() : 0;
  if (events.length > 1) {
    const counts = {};
    for (const item of events) {
      const event = item?.event || item?.raw || item;
      const name = event?.name || event?.protocol || 'unknown';
      counts[name] = (counts[name] || 0) + 1;
    }
    diagnosticEvent('shim-event', 'shim.event.renderer.batch.received', { count: events.length, counts });
  }
  shimEventBatchDepth += events.length > 1 ? 1 : 0;
  try {
    for (let index = 0; index < events.length;) {
      const source = events[index]?.event || events[index]?.raw || events[index] || {};
      if (!['shim_clear_nhwindow', 'shim_print_glyph', 'shim_display_nhwindow'].includes(source.name)) {
        handleShimEvent(events[index]);
        index += 1;
        continue;
      }
      deferredGameViewEffects = [];
      try {
        do {
          handleShimEvent(events[index]);
          index += 1;
          const next = events[index]?.event || events[index]?.raw || events[index] || {};
          if (!['shim_clear_nhwindow', 'shim_print_glyph', 'shim_display_nhwindow'].includes(next.name)) break;
        } while (index < events.length);
      } finally {
        flushDeferredGameViewEffects();
      }
    }
  } finally {
    if (events.length > 1) shimEventBatchDepth -= 1;
    if (events.length > 1 && typeof performance !== 'undefined') {
      const durationMs = Math.round((performance.now() - batchStartedAt) * 1000) / 1000;
      recordPerformanceEvent('renderer.shimBatch.processed', { count: events.length, durationMs });
    }
  }
}

netHackAPI.onShimEvent(handleShimEvents);

term.onData((data) => netHackAPI.input(data));

document.getElementById('version').addEventListener('click', runVersion);
document.getElementById('start').addEventListener('click', async () => {
  term.clear();
  setStatus('starting game');
  const result = await netHackAPI.startGame({ cols: term.cols, rows: term.rows });
  if (result.alreadyRunning) setStatus(`${result.mode} already running (pid ${result.pid})`);
  else setStatus(result.ok ? `game running (pid ${result.pid})` : 'game failed to start');
});
const characterFieldIds = Object.freeze({ role: 'player-role', race: 'player-race', gender: 'player-gender', alignment: 'player-align' });
const characterOptionFields = Object.freeze(['role', 'race', 'gender', 'alignment']);

function characterSelectionFromForm() {
  return {
    role: document.getElementById('player-role').value,
    race: document.getElementById('player-race').value,
    gender: document.getElementById('player-gender').value,
    alignment: document.getElementById('player-align').value,
  };
}

function replaceSelectOptions(select, options, selectedValue) {
  select.replaceChildren(...options.map((option) => {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    node.selected = option.value === selectedValue;
    return node;
  }));
  select.value = selectedValue;
}

function syncCharacterSelects(priority = [], requestedSelection = null) {
  const options = sharedModules.characterOptions;
  if (!options?.resolveSelection) return;
  const resolved = options.resolveSelection(requestedSelection || characterSelectionFromForm(), priority);
  for (const field of characterOptionFields) {
    const select = document.getElementById(characterFieldIds[field]);
    replaceSelectOptions(select, options.optionsFor(field, resolved), resolved[field]);
  }
  const comboId = options.comboAvatarId?.(resolved);
  const comboAvailable = comboId && tileAssetsById?.has?.(comboId);
  const hint = comboAvailable ? `Valid NetHack character; generated avatar ${comboId} is available.` : 'Valid NetHack character. Generated avatar will be used when its asset is available.';
  characterDialog.dataset.comboAvatarId = comboId || '';
  characterDialog.dataset.comboAvatarAvailable = String(Boolean(comboAvailable));
  document.getElementById('confirm-character').title = hint;
}

function randomizeCharacter() {
  const names = ['Ada', 'Boulder', 'Cobalt', 'Delver', 'Ember', 'Rune', 'Sable', 'Torch'];
  const options = sharedModules.characterOptions;
  const combo = options?.validCombos?.[Math.floor(Math.random() * options.validCombos.length)];
  const alignmentChoices = combo ? options.comboAlignmentOptions(combo) : ['Law', 'Neu', 'Cha'];
  const randomized = combo ? {
    ...combo,
    alignment: alignmentChoices[Math.floor(Math.random() * alignmentChoices.length)],
  } : null;
  document.getElementById('player-name').value = `${names[Math.floor(Math.random() * names.length)]}${Math.floor(Math.random() * 90) + 10}`;
  if (randomized) {
    syncCharacterSelects(['role', 'race', 'gender'], randomized);
  } else {
    for (const field of characterOptionFields) {
      const select = document.getElementById(characterFieldIds[field]);
      if (!select?.options?.length) continue;
      select.selectedIndex = Math.floor(Math.random() * select.options.length);
    }
    syncCharacterSelects();
  }
  const feedback = globalThis.NetHackUxFeedback;
  for (const id of ['player-name', 'player-role', 'player-race', 'player-gender', 'player-align']) {
    feedback?.pulse?.(document.getElementById(id), 'ux-motion-value-up', { durationMs: 150 });
  }
}

function selectedCharacter() {
  syncCharacterSelects();
  return {
    name: String(document.getElementById('player-name').value || '').trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 24),
    ...characterSelectionFromForm(),
  };
}

function playerSpecFromCharacter(character) {
  return `-u${character.name}-${character.role}-${character.race}-${character.gender}-${character.alignment}`;
}

function selectedPlayerSpec() {
  return playerSpecFromCharacter(selectedCharacter());
}

function selectedSeed() {
  const raw = String(document.getElementById('game-seed').value || '').trim();
  return /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(raw) ? String(BigInt(raw)) : '';
}

function generateRecordingSeed() {
  return String((Math.floor(Math.random() * 0x7fff_ffff) ^ (Date.now() & 0x7fff_ffff)) >>> 0 || 1);
}

function updateRecordingStatus(text) {
  const node = document.getElementById('recording-status');
  const isRecording = Boolean(activeRecording);
  if (recordingToolbar) recordingToolbar.hidden = !isRecording;
  if (recordCheckpointButton) recordCheckpointButton.hidden = !isRecording;
  if (recordCheckpointPrimaryButton) recordCheckpointPrimaryButton.disabled = !isRecording;
  if (saveRecordingPrimaryButton) saveRecordingPrimaryButton.disabled = !isRecording;
  const inputCount = activeRecording?.inputs?.length || 0;
  const checkpointCount = activeRecording?.events?.filter((event) => event.type === 'checkpoint').length || 0;
  const countText = isRecording ? `${inputCount} input(s), ${checkpointCount} checkpoint(s) recorded.` : 'No active recording.';
  const statusText = text || countText;
  if (recordingToolbarStatus) recordingToolbarStatus.textContent = statusText;
  if (node) node.textContent = statusText;
}

function startInputRecording(config) {
  recordingProtocolSequence = 0;
  activeRecording = {
    schema: 'nethack-electron-input-recording/v2',
    startedAt: new Date().toISOString(),
    seed: config.seed || null,
    seedSource: config.seed ? 'NETHACK_SEED' : 'pending-bridge-seed',
    character: config.character,
    playerSpec: config.playerSpec,
    options: { NETHACKOPTIONS: buildNethackOptions(userSettings) },
    settings: { ...userSettings },
    window: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 },
    metadata: { recorder: 'electron-poc-renderer', contract: netHackAPI.version || 'preview', caveats: ['Renderer-only UI state is recorded as checkpoint metadata for review; gameplay replay is driven by the captured deterministic seed, options/settings, and complete keycode input stream.'] },
    events: [],
    inputs: [],
    milestones: [],
  };
  updateRecordingStatus('Recording started: 0 inputs, 0 checkpoints.');
}

function recordInput(key, source = 'ui') {
  if (!activeRecording) return;
  const input = { t: Math.round(performance.now()), key, keycode: key.charCodeAt(0), source };
  activeRecording.inputs.push(input);
  if (Array.isArray(activeRecording.events)) activeRecording.events.push({ type: 'input', ...input });
  updateRecordingStatus();
}

function sendRecordedShimInput(payload, source = 'shim-input') {
  if (!payload || typeof payload !== 'object') {
    diagnosticEvent('shim-send', 'shim-send.dropped', { source, reason: 'invalid payload', payload });
    return false;
  }
  if (uxNoticeService?.current?.()?.kind === 'error' || uxNoticeService?.current?.()?.kind === 'warning') {
    actionableFailureHoldUntil = 0;
    actionableFailureNotice = null;
  }
  uxNoticeService?.stateChanged?.();
  diagnosticEvent('user-action', 'user-action.input.requested', { source, payload, activePrompt: gameViewSnapshot.activePrompt ? { kind: gameViewSnapshot.activePrompt.kind, requestId: gameViewSnapshot.activePrompt.requestId, query: gameViewSnapshot.activePrompt.query } : null, currentMenu: gameViewSnapshot.currentMenu ? { prompt: gameViewSnapshot.currentMenu.prompt, requestId: gameViewSnapshot.currentMenu.requestId, awaitingSelection: gameViewSnapshot.currentMenu.awaitingSelection } : null }, { transactionId: payload.transactionId || payload.actionTransactionId || '', requestId: payload.expectedRequestId || gameViewSnapshot.activePrompt?.requestId || gameViewSnapshot.currentMenu?.requestId || '' });
  if (payload.type !== 'keycode' && activeRecording) {
    activeRecording.unsupportedShimInputs = activeRecording.unsupportedShimInputs || [];
    activeRecording.unsupportedShimInputs.push({ t: Math.round(performance.now()), source, payload });
    updateRecordingStatus(`Recording blocked unsupported shim input from ${source}.`);
    diagnosticEvent('shim-send', 'shim-send.dropped', { source, reason: 'recording blocks unsupported shim input', payload });
    return false;
  }
  const sent = netHackAPI.shimInput(payload);
  diagnosticEvent('shim-send', sent === false ? 'shim-send.rejected' : 'shim-send.sent', { source, payload, sent }, { transactionId: payload.transactionId || payload.actionTransactionId || '', requestId: payload.expectedRequestId || gameViewSnapshot.activePrompt?.requestId || gameViewSnapshot.currentMenu?.requestId || '' });
  if (payload.type === 'keycode') {
    const code = Number(payload.keycode);
    if (Number.isFinite(code) && code > 0 && code <= 126) {
      const key = String.fromCharCode(code);
      testSentInputs.push(key);
      testSentPayloads.push(JSON.parse(JSON.stringify(payload)));
      rememberWorldKey(key);
      recordInput(key, source);
    }
  }
  return sent;
}

function recordCheckpoint(name = '') {
  if (!activeRecording || !Array.isArray(activeRecording.events)) return { ok: false, message: 'no active v2 recording' };
  const index = activeRecording.events.filter((event) => event.type === 'checkpoint').length + 1;
  const checkpointName = (String(name || '').trim() || `checkpoint-${index}`).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-|-$/g, '') || `checkpoint-${index}`;
  activeRecording.events.push({ type: 'checkpoint', t: Math.round(performance.now()), name: checkpointName });
  updateRecordingStatus(`Checkpoint recorded: ${checkpointName}`);
  return { ok: true, name: checkpointName };
}

function recordMilestone(type, data = {}) {
  if (!activeRecording) return;
  const milestone = { t: Math.round(performance.now()), type, ...data };
  const signature = `${type}:${data.text || data.depth || data.x || ''}:${data.y || ''}`;
  if (activeRecording.milestones.some((item) => item.signature === signature)) return;
  activeRecording.milestones.push({ ...milestone, signature });
}

async function saveActiveRecording(reason = 'manual') {
  if (!activeRecording) {
    updateRecordingStatus('No active recording to save.');
    return { ok: false };
  }
  if (activeRecording.unsupportedShimInputs?.length) {
    updateRecordingStatus('Recording save blocked: unsupported non-keycode shim input was attempted.');
    return { ok: false, message: 'unsupported non-keycode shim input was attempted during recording' };
  }
  activeRecording.stoppedAt = new Date().toISOString();
  activeRecording.durationMs = Math.max(0, Date.parse(activeRecording.stoppedAt) - Date.parse(activeRecording.startedAt));
  const result = await netHackAPI.saveRecording(activeRecording);
  updateRecordingStatus(result.ok ? `Recording saved: ${result.path}` : `Recording save failed: ${result.message || 'unknown error'}`);
  return result;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function describeRecoveryCandidate(candidate) {
  if (!candidate) return 'No previous game was found in the local NetHack playground.';
  if (candidate.kind === 'save') return `Saved game for ${candidate.playerName || 'your hero'}.`;
  if (candidate.kind === 'checkpoint') return `Recoverable crash checkpoint ${candidate.base || ''}. Recovery will run before play resumes.`;
  return 'A previous game is available.';
}

function renderStartupChoice(state = startupRecoveryState) {
  const candidate = state?.primaryCandidate || null;
  const hasContinue = Boolean(state?.hasContinue && candidate);
  if (startupChoiceSummary) startupChoiceSummary.textContent = hasContinue ? 'Continue your previous run or begin again with a new hero.' : 'No saved or recoverable game was found. Start a new hero to enter the dungeon.';
  if (startupContinueCard) startupContinueCard.hidden = !hasContinue;
  if (startupContinueGame) {
    startupContinueGame.hidden = !hasContinue;
    startupContinueGame.classList.toggle('primary', hasContinue);
  }
  if (startupNewGame) startupNewGame.classList.toggle('primary', !hasContinue);
  if (startupContinueTitle) startupContinueTitle.textContent = candidate?.kind === 'checkpoint' ? 'Recover and continue' : 'Continue previous game';
  if (startupContinueDetail) startupContinueDetail.textContent = describeRecoveryCandidate(candidate);
}

async function refreshStartupRecoveryState() {
  try {
    startupRecoveryState = await netHackAPI.startupRecoveryState();
  } catch (error) {
    startupRecoveryState = { ok: false, hasContinue: false, candidates: [], message: String(error?.message || error) };
  }
  renderStartupChoice(startupRecoveryState);
  return startupRecoveryState;
}

async function showStartupChoiceIfAppropriate({ force = false } = {}) {
  if (!startupChoiceDialog || runningState.running || startupChoiceDialog.open) return;
  if (startupChoiceShown && !force) return;
  startupChoiceShown = true;
  await refreshStartupRecoveryState();
  if (!startupChoiceDialog.open) { uxFocusLayer?.prepareOpen?.(startupChoiceDialog, document.getElementById('start-shim')); startupChoiceDialog.showModal(); }
  (startupRecoveryState?.hasContinue ? startupContinueGame : startupNewGame)?.focus?.({ preventScroll: true });
}

function openCharacterDialogFromStartup() {
  const invoker = startupNewGame || document.getElementById('start-shim');
  if (startupChoiceDialog?.open) startupChoiceDialog.close('new-game');
  if (uxCharacterCreation) {
    uxCharacterCreation.open({ invoker });
    return;
  }
  syncCharacterSelects();
  if (!characterDialog.open) { uxFocusLayer?.prepareOpen?.(characterDialog, invoker); characterDialog.showModal(); }
  document.getElementById('player-name')?.focus?.({ preventScroll: true });
}

async function stopRunningGameBeforeNewRun(timeoutMs = 2500) {
  if (!runningState.running) return true;
  setStatus('stopping previous dungeon before new game');
  const stopResult = await netHackAPI.stop();
  if (stopResult && stopResult.running === false) setRunningState({ running: false });
  const started = performance.now();
  while (runningState.running && performance.now() - started < timeoutMs) await delay(50);
  return !runningState.running;
}

async function startShimRun({ playerSpec, character = null, seed = '', recordingEnabled = false, runKind = 'new', recovery = null } = {}) {
  if (!(await stopRunningGameBeforeNewRun())) {
    setStatus('previous dungeon is still exiting; try again in a moment');
    return { ok: false, message: 'previous dungeon is still exiting' };
  }
  if (startupChoiceDialog?.open) startupChoiceDialog.close(runKind);
  shimOutput.textContent = '';
  shimLines = [];
  pendingShimEvents = [];
  shimEventCount = 0;
  publicGroundPileShimEvidence = [];
  seenShimEventNames.clear();
  resetGameView();
  const runIdentity = `run-${++noticeRunGeneration}`;
  uxNoticeService?.beginRun?.(runIdentity);
  uxRuntime?.domain?.('shell')?.resetForRun?.(runIdentity);
  actionableFailureHoldUntil = 0;
  actionableFailureNotice = null;
  pendingNativeUiCommands = new Map();
  pendingNativeUiCommandBridgeOutcomes = new Map();
  lastSentKey = { key: undefined, at: 0 };
  delete shimOutput.dataset.seen;
  delete shimOutput.dataset.count;
  derivedPlayerCharacter = {};
  currentRunConfig = { character, playerSpec, seed, requestedSeed: seed, runKind, recovery };
  uxOnboarding?.begin?.({ runKind: runKind === 'continue' ? 'restored' : runKind });
  if (recordingEnabled) startInputRecording(currentRunConfig);
  else { activeRecording = null; updateRecordingStatus(runKind === 'continue' ? 'Recording disabled while continuing a saved game.' : 'Recording disabled for this run.'); }
  const startingText = runKind === 'continue' ? 'restoring previous game' : (seed ? `starting seeded tile game (${seed})` : 'starting playable tile game');
  setStatus(startingText);
  const result = await netHackAPI.startShimBridge({ playerSpec, seed, nethackOptions: buildNethackOptions(userSettings) });
  if (result?.diagnostic?.seed?.chosen) {
    currentRunConfig.seed = String(result.diagnostic.seed.chosen);
    currentRunConfig.seedSource = result.diagnostic.seed.source;
    const seedField = document.getElementById('game-seed');
    if (seedField && !seedField.value.trim() && runKind !== 'continue') seedField.placeholder = `Random seed chosen: ${currentRunConfig.seed}`;
    diagnosticEvent('seed', 'seed.main.chosen.renderer', { requestedSeed: seed || '', chosenSeed: currentRunConfig.seed, source: currentRunConfig.seedSource, runId: result.diagnostic.runId });
  }
  if (result.alreadyRunning) {
    setStatus('previous dungeon is still running; no new game was started');
    showFailureNotice({ id: 'run:already-running', kind: 'prompt-conflict', reason: 'A game is already running.', actionControl: document.getElementById('start-shim'), surface: null });
    return result;
  }
  setStatus(result.ok ? (runKind === 'continue' ? 'previous game restored' : `dungeon running${currentRunConfig?.seed ? ` (seed ${currentRunConfig.seed})` : ''}`) : 'tile game failed to start');
  if (result.ok) {
    gameGrid.focus();
    showReadyNotice(`run:${result.diagnostic?.runId || Date.now()}:ready`);
  } else showFailureNotice({ id: `run:start:${Date.now()}`, kind: 'recovery-failed', reason: result.message || 'game failed to start', diagnosticRef: result.diagnostic?.runId || '' });
  return result;
}

async function startDiscoveryCharacter(result) {
  const character = result.character;
  const recoveryState = await refreshStartupRecoveryState();
  const sameNameSave = (recoveryState?.candidates || []).find((candidate) => candidate.kind === 'save' && candidate.playerName === character.name && candidate.canContinue);
  if (sameNameSave) return { ok: false, message: 'A saved game already uses that hero name. Choose Continue or use a different name.' };
  let seed = result.seed || '';
  if (result.recordingEnabled && !seed) seed = generateRecordingSeed();
  return startShimRun({ character, playerSpec: result.playerSpec, seed, recordingEnabled: result.recordingEnabled, runKind: 'new' });
}

async function startShimWithCurrentCharacter() {
  const character = selectedCharacter();
  if (!character.name) {
    showFailureNotice({ id: 'character:name-required', kind: 'rejected', reason: 'Enter a hero name before entering the dungeon.' });
    openCharacterDialogFromStartup();
    return { ok: false, message: 'hero name required' };
  }
  const recoveryState = await refreshStartupRecoveryState();
  const sameNameSave = (recoveryState?.candidates || []).find((candidate) => candidate.kind === 'save' && candidate.playerName === character.name && candidate.canContinue);
  if (sameNameSave) {
    setStatus(`saved game exists for ${character.name}; use Continue or choose a different name`);
    showFailureNotice({ id: 'character:saved-name-conflict', kind: 'rejected', reason: 'A saved game already uses that hero name.' });
    if (!characterDialog.open) { uxFocusLayer?.prepareOpen?.(characterDialog, document.getElementById('start-shim')); characterDialog.showModal(); }
    return { ok: false, message: 'saved game exists for selected name' };
  }
  const playerSpec = playerSpecFromCharacter(character);
  const recordingEnabled = document.getElementById('record-inputs').checked;
  let seed = selectedSeed();
  if (recordingEnabled && !seed) {
    seed = generateRecordingSeed();
    const seedField = document.getElementById('game-seed');
    if (seedField) seedField.value = seed;
  }
  return startShimRun({ character, playerSpec, seed, recordingEnabled, runKind: 'new' });
}

function characterFromPreparedContinue(prepared = {}) {
  const character = { ...(prepared.character || {}) };
  if (prepared.playerName) character.name = prepared.playerName;
  return Object.keys(character).length ? character : null;
}

async function continuePreviousGame() {
  if (runningState.running) {
    setStatus(`${runningState.mode || 'game'} already running; stop it before continuing another game`);
    return;
  }
  if (startupContinueGame) startupContinueGame.disabled = true;
  setStatus('preparing previous game');
  const state = startupRecoveryState?.hasContinue ? startupRecoveryState : await refreshStartupRecoveryState();
  const candidateId = state?.primaryCandidate?.id || '';
  let prepared;
  try {
    prepared = await netHackAPI.prepareContinueGame(candidateId);
  } catch (error) {
    prepared = { ok: false, message: String(error?.message || error), recovery: await refreshStartupRecoveryState() };
  } finally {
    if (startupContinueGame) startupContinueGame.disabled = false;
  }
  if (!prepared?.ok) {
    startupRecoveryState = prepared?.recovery || await refreshStartupRecoveryState();
    renderStartupChoice(startupRecoveryState);
    setStatus(prepared?.message || 'no previous game could be continued');
    showFailureNotice({ id: `recovery:${candidateId || 'current'}:failed`, kind: 'recovery-failed', reason: prepared?.message || 'No previous game could be continued.', diagnosticRef: candidateId });
    if (startupChoiceSummary) startupChoiceSummary.textContent = prepared?.message || 'No previous game could be continued. Start a new hero instead.';
    return;
  }
  const character = characterFromPreparedContinue(prepared);
  await startShimRun({ playerSpec: prepared.playerSpec, character, runKind: 'continue', recovery: prepared });
}

gameOverDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  gameOverNew.focus({ preventScroll: true });
});
gameOverNew.addEventListener('click', () => {
  resetGameOverState();
  openCharacterDialogFromStartup();
});
gameOverExit.addEventListener('click', () => {
  netHackAPI.stop();
  window.close();
  setStatus('exit requested');
});

document.getElementById('settings-button').addEventListener('click', () => {
  syncSettingsForm();
  if (!settingsDialog.open) { uxFocusLayer?.prepareOpen?.(settingsDialog, document.getElementById('settings-button')); settingsDialog.showModal(); }
});
document.getElementById('settings-reset').addEventListener('click', resetSettings);
settingsForm.addEventListener('submit', (event) => {
  if (event.submitter?.id === 'settings-save') saveSettings(settingsFromForm());
});
syncSettingsForm();
if (!uxCharacterCreation) {
  syncCharacterSelects();
  for (const [field, selectId] of Object.entries(characterFieldIds)) {
    document.getElementById(selectId).addEventListener('change', () => syncCharacterSelects([field]));
  }
  document.getElementById('randomize-character').addEventListener('click', randomizeCharacter);
}
document.getElementById('start-random-character')?.addEventListener('click', () => {
  randomizeCharacter();
  characterDialog.returnValue = 'start';
  characterDialog.close('start');
});
startupNewGame?.addEventListener('click', openCharacterDialogFromStartup);
startupContinueGame?.addEventListener('click', () => continuePreviousGame());
startupChoiceDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  startupNewGame?.focus?.({ preventScroll: true });
});

document.getElementById('start-shim').addEventListener('click', () => {
  if (runningState.running) {
    setStatus(`${runningState.mode || 'game'} already running; stop it before starting another`);
    return;
  }
  openCharacterDialogFromStartup();
});

characterDialog.addEventListener('close', () => {
  if (characterDialog.returnValue === 'start') startShimWithCurrentCharacter();
});
characterForm.addEventListener('submit', (event) => {
  if (event.submitter?.id === 'confirm-character') characterDialog.returnValue = 'start';
});

const commandGroups = [
  ['Movement', 'hjklyubn / arrows'], ['Visible item actions', 'Eat, Quaff, Read, Apply, Zap, Throw/Fire, Cast spell buttons start these workflows; raw letters are optional shortcuts'],
  ['Visible equipment', 'Wield, Swap, Wear armor, Take off armor, Put on, Remove, Set quiver buttons plus body-slot cards'],
  ['Panels/transfers', 'Spellbook, Skills, Options, Loot, Tip, Pay, Dip, Invoke, Offer, Chat, Untrap buttons send # commands internally'],
  ['Lifecycle/info', 'Save game, Quit game, Attributes, Conduct, Message history, History, and Version are visible buttons; serious confirmations use safe focused choices'],
  ['World', 'o open, c close, Ctrl-D kick door/object, , pickup, < > stairs, . wait'], ['Meta', '? help, / what is, # extended, Esc cancel'],
];
commandHelp.textContent = commandGroups.map(([name, keys]) => `${name}: ${keys}`).join('\n');

const blockedCommands = new Set(['\u0018', '\u001a']);

function describeDirectionRequest() {
  const labels = new Map([
    ['\u0004', 'the Kick door/object command'], ['o', 'the Open command'], ['c', 'the Close command'], [',', 'the Pick up command'], ['s', 'Search'], ['<', 'up stairs'], ['>', 'down stairs'],
  ]);
  if (labels.has(lastWorldCommand)) return labels.get(lastWorldCommand);
  if (/^[hjklyubn]$/.test(lastWorldCommand)) return `movement toward ${lastWorldCommand.toUpperCase()}`;
  return 'the current NetHack action';
}

function describePlayableKey(key) {
  if (key === '.') return 'wait (.)';
  if (key === ',') return 'pickup (,)';
  if ('hjkl yubn'.replace(' ', '').includes(key)) return `move (${key})`;
  if (key === '\u001b') return 'cancel (Esc)';
  if (key === '\u0004') return 'kick (Ctrl-D; choose direction when prompted)';
  if (key === '\n' || key === '\r') return 'enter';
  if (key === ' ') return 'space/wait';
  return key;
}

function isSupportedPlayableKey(key) {
  if (blockedCommands.has(key)) return false;
  if (sharedModules.commandGateway?.supportedPlayableKey && sharedModules.commandGateway.supportedPlayableKey(key)) return true;
  const code = key.charCodeAt(0);
  return code === 4 || code === 27 || code === 8 || code === 9 || code === 13 || code === 10 || (code >= 32 && code <= 126);
}

function rememberWorldKey(key) {
  if (/^[hjklyubn]$/.test(key)) lastDirectionKey = key;
  if (key === 'i') markInventoryOverviewRequest();
  else if (key !== '\u001b' && key !== '\n' && key !== '\r') {
    lastInventoryOverviewRequestAt = 0;
    if (activeWorkflowContext?.command === 'i') clearWorkflowContext();
  }
  if (key !== '\u001b' && key !== '\n' && key !== '\r') {
    lastWorldCommand = key;
    pendingExplicitGroundLookUntil = key === ':' ? Date.now() + 2500 : 0;
  }
}

function sendPlayableKey(key) {
  noteContainerUnlockAnswer(key);
  if (!runningState.running && status.dataset.status !== 'playable tile game running') {
    setStatus('start the playable tile game before sending keys');
    diagnosticEvent('user-action', 'user-action.blocked', { source: 'key', key, reason: 'game not running' });
    return;
  }
  if (activePromptIsOrphaned() && (key === '\u001b' || key === 'i')) {
    clearPromptOwnerState({ clearWorkflow: true });
    closeInteractionDialog({ force: true });
    renderPromptPanel();
    renderMenuPanel();
    if (key === 'i') sendRecordedShimInput({ type: 'keycode', keycode: 27 }, 'stale-prompt-cancel');
  }
  if (typeof key !== 'string' || key.length !== 1) {
    diagnosticEvent('user-action', 'user-action.blocked', { source: 'key', key, reason: 'invalid key' });
    return;
  }
  if (!isSupportedPlayableKey(key)) {
    setStatus(`unsupported control command ignored: ${key === ' ' ? 'Space' : key}.`);
    appendMessage(`Unsupported control command ignored: ${key === ' ' ? 'Space' : key}.`);
    diagnosticEvent('user-action', 'user-action.blocked', { source: 'key', key, reason: 'unsupported control command' });
    return;
  }
  const now = performance.now();
  if (lastSentKey.key === key && now - lastSentKey.at < 75) {
    setStatus(`ignored duplicate key path: ${describePlayableKey(key)}`);
    diagnosticEvent('user-action', 'user-action.duplicate-suppressed', { source: 'key', key, ageMs: now - lastSentKey.at });
    return;
  }
  lastSentKey = { key, at: now };
  sendRecordedShimInput({ type: 'keycode', keycode: key.charCodeAt(0) }, 'key');
  setStatus(`sent key: ${describePlayableKey(key)}`);
}

function sendPlayableText(text) {
  noteContainerUnlockAnswer(text);
  if (typeof text !== 'string' || !text.length) return;
  const playableText = sharedModules.commandGateway?.normalizeTextInput ? sharedModules.commandGateway.normalizeTextInput(text) : text;
  if (containerTransferInternalSendDepth <= 0 && playableText.includes('#') && containerTransferExtendedPromptSuppressTokens.some((token) => !token.consumed && token.expiresAt > performance.now())) {
    containerTransferExtendedPromptSuppressTokens = [];
    containerTransferSuppressedExtendedPrompt = null;
    diagnosticEvent('prompt', 'container-transfer.extended-command-suppression-cancelled', { reason: 'player-owned extended command text sent while container transfer is active' });
  }
  for (const key of playableText) {
    if (key.length === 1 && isSupportedPlayableKey(key)) {
      sendRecordedShimInput({ type: 'keycode', keycode: key.charCodeAt(0) }, 'text');
    }
  }
  lastSentKey = { key: undefined, at: 0 };
  setStatus(`sent text: ${text.replace(/\n/g, '↵')}`);
}

function selectorForInventoryItem(item = {}) {
  if (typeof item.inventoryLetter === 'string' && item.inventoryLetter.length === 1) return item.inventoryLetter;
  if (typeof item.selector === 'number' && item.selector > 0 && item.selector < 128) return String.fromCharCode(item.selector);
  return '';
}

function semanticActionPayload(action = {}, item = {}, route = {}, index = 0, length = 1, transactionId = '', options = {}) {
  const targetSelector = String(route.selector || selectorForInventoryItem(item) || '').slice(0, 1);
  const actionId = String(route.actionId || action.id || action.actionId || '').trim();
  const actionLabel = String(route.label || action.label || actionId || '').replace(/…/g, '').trim();
  return {
    guiActionId: actionId,
    actionId,
    actionLabel,
    targetSelector,
    targetText: String(item?.text || route.targetText || '').slice(0, 240),
    followupPlan: Array.isArray(action.promptPlan) ? action.promptPlan.join('>') : String(route.followupPlan || ''),
    expectedRequestId: String(options.expectedRequestId || route.expectedRequestId || '').trim(),
    transactionId,
    actionTransactionId: transactionId,
    commandPosition: index + 1,
    commandLength: length,
  };
}

function recordUiProtocolCommand(command, source = 'semantic-action') {
  const normalized = sharedModules.uiProtocolV2?.normalizeCommandEnvelope?.(command);
  if (activeRecording && normalized?.valid && Array.isArray(activeRecording.events)) {
    activeRecording.events.push({ type: 'ui-protocol-command', t: Math.round(performance.now()), command: normalized.command });
    updateRecordingStatus();
  }
  if (normalized?.valid && normalized.command) testSentUiProtocolCommands.push(JSON.parse(JSON.stringify(normalized.command)));
  diagnosticEvent('ui-protocol-v2', normalized?.valid ? 'ui-protocol-command.accepted' : 'ui-protocol-command.rejected', { source, commandType: command?.commandType || '', commandId: command?.commandId || '', actionId: command?.actionId || command?.payload?.actionId || '', errors: normalized?.errors || [] }, { transactionId: command?.transactionId || command?.commandId || '', requestId: command?.payload?.expectedRequestId || '' });
  return normalized;
}

function nextRecordingProtocolSequence() {
  recordingProtocolSequence += 1;
  return recordingProtocolSequence;
}

function recordUiProtocolAck(event, source = 'semantic-action') {
  const normalized = sharedModules.uiProtocolV2?.normalizeEventEnvelope?.(event);
  if (activeRecording && normalized?.valid && Array.isArray(activeRecording.events)) {
    activeRecording.events.push({ type: 'ui-protocol-ack', t: Math.round(performance.now()), event: normalized.event });
    updateRecordingStatus();
  }
  if (normalized?.valid && normalized.event) {
    testSentUiProtocolAcks.push(JSON.parse(JSON.stringify(normalized.event)));
    if (gameView?.process) {
      const result = gameView.process(normalized.event);
      refreshGameViewPresentation();
      applyGameViewEffects(result.effects);
      refreshGameViewPresentation();
    }
  }
  diagnosticEvent('ui-protocol-v2', normalized?.valid ? `ui-protocol-ack.${event?.eventType || 'accepted'}` : 'ui-protocol-ack.rejected', { source, eventType: event?.eventType || '', commandId: event?.payload?.commandId || '', actionId: event?.payload?.actionId || '', reason: event?.payload?.reason || '', blockerToken: event?.payload?.blockerToken || '', errors: normalized?.errors || [] }, { transactionId: event?.transactionId || event?.payload?.transactionId || '', requestId: '' });
  return normalized;
}

function createAndRecordCommandAck(eventType, command, details = {}, source = 'semantic-action') {
  const event = sharedModules.uiProtocolV2?.createCommandAckEvent?.({
    sequence: nextRecordingProtocolSequence(),
    eventType,
    command,
    source: { layer: 'renderer' },
    ...details,
  });
  return event ? recordUiProtocolAck(event, source) : null;
}

function commandFromBridgeUiEvent(event = {}) {
  return {
    commandId: String(event.commandId || '').trim(),
    commandType: 'action.execute',
    transactionId: String(event.transactionId || event.commandId || '').trim() || undefined,
    actionId: String(event.actionId || '').trim(),
    payload: { actionId: String(event.actionId || '').trim(), route: { actionId: String(event.actionId || '').trim(), command: String(event.command || '') } },
  };
}

function recordNativeUiCommandInputsFromPlan(plan = {}) {
  const command = String(plan.keys || '');
  const protocolMeta = { uiProtocolCommandId: plan.commandId, uiProtocolCommandType: 'action.execute', uiProtocolActionId: plan.actionId, nativeUiCommand: true };
  [...command].forEach((key, index) => {
    if (key.length === 1 && isSupportedPlayableKey(key)) {
      const payload = { type: 'ui-command-key', keycode: key.charCodeAt(0), ...semanticActionPayload(plan.action, plan.item, plan.route, index, command.length, plan.transactionId, plan.options), ...protocolMeta };
      testSentInputs.push(key);
      testSentPayloads.push(JSON.parse(JSON.stringify(payload)));
      rememberWorldKey(key);
      recordInput(key, plan.options?.source || 'semantic-action');
    }
  });
}

function handleBridgeDirectEquipmentEvent(event = {}) {
  if (!/^shim_equipment_change_(?:accepted|queued|confirmed|rejected)$/.test(String(event.name || ''))) return;
  const commandId = String(event.commandId || '').trim();
  const plan = commandId ? pendingNativeUiCommands.get(commandId) : null;
  const command = plan?.command || { protocol: 'nethack-electron-ui/v2', commandType: 'equipment.change', commandId, transactionId: event.transactionId || commandId, payload: { action: event.action || '', ...(event.itemId ? { itemId: event.itemId } : {}), ...(event.slotId ? { slotId: event.slotId } : {}), ...(event.hand ? { hand: event.hand } : {}) } };
  const source = plan?.options?.source || 'equipment-change';
  if (event.name === 'shim_equipment_change_accepted' || event.name === 'shim_equipment_change_queued') {
    createAndRecordCommandAck('command.accepted', command, { status: event.name.endsWith('_queued') ? 'queued' : 'accepted', supported: true, executionSource: 'bridge-ui-command', replayBehavior: 'preserved evidence only; no raw fallback input sent' }, source);
    setStatus(`bridge ${event.name.endsWith('_queued') ? 'queued' : 'accepted'} equipment.change ${event.action || ''}`);
    return;
  }
  if (event.name === 'shim_equipment_change_confirmed') {
    createAndRecordCommandAck('command.completed', command, { status: 'success', result: { status: 'success', reason: event.reason || 'equipment change completed', action: event.action || '', itemId: event.itemId }, executionSource: 'bridge-ui-command', replayBehavior: 'preserved evidence only; no raw fallback input sent' }, source);
    if (commandId) pendingNativeUiCommands.delete(commandId);
    itemEquipmentOwner?.settle?.({ intentId: command.transactionId || event.transactionId || '', status: 'completed', message: event.reason || 'Equipment updated.' });
    setStatus(`equipment.change completed: ${event.action || 'equipment'}`);
    return;
  }
  const reason = event.reason || 'equipment change rejected';
  createAndRecordCommandAck('command.rejected', command, { reason, blockerToken: sharedModules.uiProtocolV2?.commandBlockerTokenForReason?.(reason, { blockerToken: event.blockerToken }) || 'blocked.public.tryInNetHack', supported: true, executionSource: 'bridge-ui-command', replayBehavior: 'preserved evidence only; no raw fallback input sent' }, source);
  if (commandId) pendingNativeUiCommands.delete(commandId);
  itemEquipmentOwner?.settle?.({ intentId: command.transactionId || event.transactionId || '', status: 'rejected', reason });
  setStatus(`blocked equipment.change: ${reason}`);
  showFailureNotice({ id: `equipment:${commandId || event.transactionId || shimEventCount}:rejected`, kind: event.blockerToken === 'blocked.input.staleRevision' ? 'stale-revision' : 'rejected', reason, blockerToken: event.blockerToken || '', transactionId: event.transactionId || commandId });
}

function handleBridgeUiCommandEvent(event = {}) {
  if (event.name !== 'bridge_ui_command_accepted' && event.name !== 'bridge_ui_command_rejected') return;
  const commandId = String(event.commandId || '').trim();
  const plan = commandId ? pendingNativeUiCommands.get(commandId) : null;
  const command = plan?.command || commandFromBridgeUiEvent(event);
  const source = plan?.options?.source || 'semantic-action';
  if (event.name === 'bridge_ui_command_accepted') {
    if (commandId && plan && !plan.mainAckSettled) pendingNativeUiCommandBridgeOutcomes.set(commandId, { status: 'accepted', actionId: event.actionId || plan.actionId || '', event });
    createAndRecordCommandAck('command.accepted', command, {
      supported: true,
      executionSource: 'bridge-ui-command',
      replayBehavior: 'replay executes recorded input events only',
    }, source);
    if (plan) recordNativeUiCommandInputsFromPlan(plan);
    setStatus(`bridge accepted v2 action.execute ${event.actionId || plan?.actionId || 'command'}`);
  } else {
    const reason = event.reason || 'bridge rejected native ui command';
    if (commandId && plan && !plan.mainAckSettled) pendingNativeUiCommandBridgeOutcomes.set(commandId, { status: 'rejected', actionId: event.actionId || plan.actionId || '', reason, blockerToken: event.blockerToken || '', event });
    createAndRecordCommandAck('command.rejected', command, {
      reason,
      blockerToken: sharedModules.uiProtocolV2?.commandBlockerTokenForReason?.(reason, { blockerToken: event.blockerToken }) || 'blocked.public.tryInNetHack',
      supported: true,
      executionSource: 'bridge-ui-command',
      replayBehavior: 'preserved evidence only; no raw fallback input sent',
    }, source);
    itemEquipmentOwner?.settle?.({ intentId: command?.transactionId || event.transactionId || '', status: 'rejected', reason });
    setStatus(`blocked ${event.actionId || plan?.actionId || 'v2 command'}: ${reason}`);
    showFailureNotice({ id: `ui-command:${commandId || event.transactionId || shimEventCount}:rejected`, kind: event.blockerToken === 'blocked.input.staleRevision' ? 'stale-revision' : 'rejected', reason, blockerToken: event.blockerToken || '', transactionId: event.transactionId || commandId });
  }
  if (commandId) pendingNativeUiCommands.delete(commandId);
}

function currentActionExpectedRevision() {
  const revision = {};
  const inventory = gameViewSnapshot.inventory?.revision || 0;
  const equipment = gameViewSnapshot.equipment?.revision || 0;
  const ground = gameViewSnapshot.groundPiles?.revision || 0;
  if (inventory > 0) revision.inventory = inventory;
  if (equipment > 0) revision.equipment = equipment;
  if (ground > 0) revision.ground = ground;
  if (gameViewSnapshot.mapRevision > 0) revision.map = gameViewSnapshot.mapRevision;
  return revision;
}

function buildActionExecuteContext() {
  return {
    uiProtocol: sharedModules.uiProtocolV2,
    inventoryRevision: gameViewSnapshot.inventory?.revision || 0,
    equipmentRevision: gameViewSnapshot.equipment?.revision || 0,
    groundRevision: gameViewSnapshot.groundPiles?.revision || 0,
    mapRevision: gameViewSnapshot.mapRevision,
    inventoryItems: (gameViewSnapshot.inventory?.orderedItems?.length ? gameViewSnapshot.inventory.orderedItems : gameViewSnapshot.cachedInventoryChoices) || [],
    groundItems: [...groundItemTextsHere(), ...(Array.isArray(currentCell()?.groundTexts) ? currentCell().groundTexts : [])],
    // GUI inventory/equipment dialogs are the source of these actions, not a
    // NetHack input owner. Block only live NetHack prompt/menu/transfer owners.
    activeInputOwner: semanticActionActiveInputOwner(),
  };
}

function selectorShapedSemanticCommand(command, item = {}) {
  const selector = selectorForInventoryItem(item);
  return Boolean(selector && /^[A-Za-z][\x21-\x7e]/.test(command) && command[1] === selector);
}

function sendGroundContainerExtendedAction(commandKeys, actionId, defaultLabel, action = {}, item = {}) {
  const rawTargetText = item?.text || groundItemTextsHere().join(', ') || currentGroundContainerTargetText() || currentGroundContainerActionLabel();
  const targetText = cleanEquipmentText(rawTargetText).replace(/^\s*(?:open|loot|tip|force|untrap)\s+/i, '').trim();
  return sendSemanticActionCommand(commandKeys, { id: actionId, label: action.label || defaultLabel }, item || {}, {
    actionId,
    label: action.label || defaultLabel,
    targetText,
  }, {
    source: 'ground-context',
    target: {
      location: { kind: 'ground' },
      ...(Number.isInteger(item?.objectId) && item.objectId >= 0 ? { objectId: item.objectId } : {}),
      ...(targetText ? { displayName: targetText } : {}),
      semanticKnown: item?.semanticKnown === true || item?.known?.identity === true,
      known: item?.known ? { ...item.known } : { identity: item?.semanticKnown === true, appearance: Boolean(item?.semanticAppearance || item?.appearanceName || targetText) },
      ...(item?.semanticAppearance ? { semanticAppearance: item.semanticAppearance } : {}),
      ...(item?.appearanceName ? { appearanceName: item.appearanceName } : {}),
    },
    payload: { promptPolicy: 'netHack-owned-followup', publicGroundEvidence: 'visible-current-square-container' },
  });
}

function startDirectContainerSnapshotPanel(item = {}, sessionId = '') {
  const displayName = cleanEquipmentText(item?.displayName || item?.text || item?.name || currentGroundContainerTargetText() || 'container');
  const inventoryRows = currentInventoryTransferRows();
  transferPresentation = {
    ...(transferPresentation || {}),
    active: true,
    sessionKind: 'container',
    presentationMode: 'direct-snapshot',
    prompt: `Open ${displayName}`,
    interrupted: false,
    loadedSides: { left: false, right: true },
    loadingSides: { left: true, right: false },
    feedback: 'Loading container contents from NetHack…',
  };
  renderContainerTransferPanel();
  dispatchTransferSessionEvent({
    type: 'open',
    kind: 'container',
    route: 'direct',
    sessionId,
    prompt: transferPresentation.prompt,
    container: {
      publicId: `container-${item.objectId}`,
      objectId: item.objectId,
      displayName,
      semanticKnown: item.semanticKnown !== false,
      known: item.known || { identity: true, quantity: true },
    },
    leftRows: [],
    rightRows: inventoryRows,
    loadedSides: transferPresentation.loadedSides,
    loadingSides: transferPresentation.loadingSides,
    loading: true,
    feedback: transferPresentation.feedback,
  });
  ensurePublicContainerSnapshotSession();
}

function hydrateDirectContainerPanelFromSnapshot(sessionId = '') {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container') return false;
  const wantedSession = sessionId || transferSession.snapshot().sessionId || gameViewSnapshot.containerContents?.activeSessionId || '';
  const snapshot = containerContentsSnapshotForSession(wantedSession);
  if (!snapshot?.items) return false;
  const leftRows = panelItemsFromContainerSnapshot(snapshot);
  const rightRows = currentInventoryTransferRows();
  clearDirectContainerSnapshotTimeout();
  markContainerPaneLoaded('left');
  markContainerPaneLoaded('right');
  transferPresentation.feedback = 'Both panes loaded. Drag items between container and inventory.';
  transferPresentation.loadingSides = { ...(transferPresentation.loadingSides || {}), left: false, right: false };
  clearContainerUnlockContinuation();
  dispatchTransferSessionEvent({ type: 'pane', side: 'left', rows: leftRows });
  dispatchTransferSessionEvent({ type: 'inventory', rows: rightRows });
  renderContainerTransferPanel();
  return true;
}

function directContainerSnapshotFailureMessage(event = {}) {
  const reason = String(event.reason || 'container snapshot rejected').trim();
  const kind = String(event.failureKind || event.status || '').trim();
  if (kind === 'locked' || /\blocked\b/i.test(reason)) return 'This container is locked. Use Force lock or unlock it before opening.';
  if (kind === 'trapped' || /\btrapped\b/i.test(reason)) return 'This container is trapped. Untrap it before opening.';
  if (kind === 'stale-target' || /\b(?:stale|no longer)\b/i.test(reason)) return 'The container moved or is no longer at your square. Recheck the ground before opening.';
  if (kind === 'capacity' || /\b(?:capacity|carrying too much)\b/i.test(reason)) return 'You are carrying too much to open this container directly.';
  if (['prompt-conflict', 'menu-conflict', 'transfer-conflict'].includes(kind) || /\b(?:prompt|menu) owns input\b/i.test(reason)) return 'Finish the current NetHack choice, then open the container again.';
  if (kind === 'netHack-owned-flow-required') return `${reason}. Use the normal NetHack flow for this container.`;
  return reason || 'NetHack could not open this container.';
}

function clearDirectContainerSnapshotTimeout() {
  if (directContainerSnapshotTimeout) window.clearTimeout(directContainerSnapshotTimeout);
  directContainerSnapshotTimeout = null;
}

function scheduleDirectContainerSnapshotTimeout(sessionId = '', timeoutMs = 12000) {
  clearDirectContainerSnapshotTimeout();
  directContainerSnapshotTimeout = window.setTimeout(() => {
    if (!transferSession.snapshot().active || String(transferSession.snapshot().sessionId || '') !== String(sessionId || '')) return;
    handleDirectContainerSnapshotRejected({
      status: 'timeout',
      failureKind: 'timeout',
      reason: 'NetHack did not finish opening this container. Try again or use the normal NetHack flow.',
      sessionId,
      transactionId: sessionId,
      containerId: transferSession.snapshot().container?.objectId,
    });
  }, timeoutMs);
}

function handleDirectContainerSnapshotRejected(event = {}) {
  clearDirectContainerSnapshotTimeout();
  const message = directContainerSnapshotFailureMessage(event);
  const sessionId = String(event.sessionId || event.transactionId || '');
  const pendingSessionId = String(transferSession.snapshot().sessionId || '');
  const matchesContainer = Number(event.containerId) > 0 && Number(event.containerId) === Number(transferSession.snapshot().container?.objectId);
  const matchesPanel = transferPresentation?.active && transferPresentation.sessionKind === 'container' && (!sessionId || !pendingSessionId || sessionId === pendingSessionId || String(event.transactionId || '') === pendingSessionId || matchesContainer);
  const locked = String(event.failureKind || event.status || '').trim() === 'locked' || /\blocked\b/i.test(String(event.reason || ''));
  const inputConflict = ['prompt-conflict', 'menu-conflict', 'transfer-conflict'].includes(String(event.failureKind || event.status || event.blockerToken || '').trim()) || /\b(?:prompt|menu) owns input\b/i.test(String(event.reason || ''));
  if (matchesPanel && inputConflict) {
    closeContainerTransferPanel(message);
    showFailureNotice({ id: `container-snapshot:${sessionId || shimEventCount}:input-conflict`, kind: 'rejected', reason: message, blockerToken: event.blockerToken || event.failureKind || '', transactionId: event.transactionId || sessionId });
    setStatus(message);
    appendMessage(message, { allowConsecutiveDuplicate: true, logPrompt: false });
    diagnosticEvent('transaction', 'container-snapshot.direct.input-conflict', { ...event, message, matchesPanel }, { transactionId: event.transactionId || sessionId });
    return true;
  }
  if (matchesPanel && locked && showLockedContainerActionSheet(event)) {
    setStatus(message);
    appendMessage(message, { allowConsecutiveDuplicate: true, logPrompt: false });
    diagnosticEvent('transaction', 'container-snapshot.direct.locked-actions', { ...event, message, matchesPanel }, { transactionId: event.transactionId || sessionId });
    return true;
  }
  if (matchesPanel) {
    dispatchTransferSessionEvent({ type: 'load-rejected', side: 'left', reason: message });
    dispatchTransferSessionEvent({ type: 'inventory', rows: currentInventoryTransferRows() });
    renderContainerTransferPanel();
  }
  setStatus(message);
  showFailureNotice({ id: `container-snapshot:${sessionId || shimEventCount}:rejected`, kind: /stale|moved|no longer/i.test(message) ? 'stale-revision' : (/timeout/i.test(String(event.failureKind || event.status || '')) ? 'timeout' : 'rejected'), reason: message, transactionId: event.transactionId || sessionId });
  appendMessage(message, { allowConsecutiveDuplicate: true, logPrompt: false });
  diagnosticEvent('transaction', 'container-snapshot.direct.rejected', { ...event, message, matchesPanel }, { transactionId: event.transactionId || sessionId });
  return matchesPanel;
}

function directContainerIdentityForRefresh() {
  const identity = containerSnapshotIdentity();
  if (Number.isInteger(identity.objectId) && identity.objectId > 0) return { objectId: identity.objectId, text: identity.displayName || transferPresentation?.prompt || 'container', semanticKnown: false, known: { identity: false, appearance: true } };
  const sessionContainer = transferSession.snapshot().container || {};
  if (Number.isInteger(sessionContainer.objectId) && sessionContainer.objectId > 0) return { objectId: sessionContainer.objectId, text: sessionContainer.displayName || 'container', semanticKnown: false, known: { identity: false, appearance: true } };
  return currentGroundContainerItemForDirectOpen({});
}

async function requestDirectContainerSnapshotRefresh(reason = 'manual-refresh', { sessionOwnsLoading = false } = {}) {
  if (!transferPresentation?.active || transferPresentation.sessionKind !== 'container') return { ok: false, reason: 'no active container panel' };
  const item = directContainerIdentityForRefresh();
  if (!Number.isInteger(item?.objectId) || item.objectId <= 0) {
    transferPresentation.feedback = 'Cannot refresh this container without a public container object id; no hidden menu fallback was attempted.';
    renderContainerTransferPanel();
    return { ok: false, reason: 'direct container refresh requires a public container objectId' };
  }
  const sessionId = transferSession.snapshot().sessionId || `container-${item.objectId}-${Date.now()}`;
  if (!sessionOwnsLoading) dispatchTransferSessionEvent({ type: 'refresh', side: 'left', reason: 'Refreshing container contents from NetHack…' });
  markContainerPaneLoading('left', true);
  renderContainerTransferPanel();
  const command = {
    protocol: sharedModules.uiProtocolV2?.protocol || 'nethack-electron-ui/v2',
    commandId: `container-snapshot-${item.objectId}-${Date.now()}`,
    commandType: 'container.snapshot',
    transactionId: sessionId,
    targets: { containerId: item.objectId, location: { kind: 'ground' }, ...publicCommandItemFields(item, cleanEquipmentText(item.text || item.displayName || 'container')) },
    payload: { sessionId, containerId: item.objectId },
  };
  recordUiProtocolCommand(command, 'container-direct-refresh');
  diagnosticEvent('transaction', 'container-snapshot.direct.refresh-requested', { command, reason }, { transactionId: command.transactionId });
  scheduleDirectContainerSnapshotTimeout(sessionId);
  const ack = await Promise.resolve(dispatchUiCommand(command)).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
  if (!ack?.ok && transferPresentation?.active) {
    clearDirectContainerSnapshotTimeout();
    transferPresentation.feedback = `Container refresh failed: ${ack?.reason || 'the action was not accepted'}.`;
    renderContainerTransferPanel();
  }
  return ack;
}

async function sendDirectContainerSnapshotCommand(action = {}, item = {}) {
  if (!Number.isInteger(item?.objectId) || item.objectId <= 0) return { ok: false, reason: 'direct container snapshot requires a public container objectId' };
  const sessionId = `container-${item.objectId}-${Date.now()}`;
  startDirectContainerSnapshotPanel(item, sessionId);
  const command = {
    protocol: sharedModules.uiProtocolV2?.protocol || 'nethack-electron-ui/v2',
    commandId: `container-snapshot-${item.objectId}-${Date.now()}`,
    commandType: 'container.snapshot',
    transactionId: sessionId,
    targets: { containerId: item.objectId, location: { kind: 'ground' }, ...publicCommandItemFields(item, cleanEquipmentText(item?.text || item?.displayName || 'container')) },
    payload: { sessionId, containerId: item.objectId },
  };
  recordUiProtocolCommand(command, 'container-direct-open');
  diagnosticEvent('transaction', 'container-snapshot.direct.requested', { command }, { transactionId: command.transactionId });
  const ack = await Promise.resolve(dispatchUiCommand(command)).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
  if (!ack?.ok || ack?.accepted === false) {
    handleDirectContainerSnapshotRejected({ ...ack, status: ack?.blockerToken || 'rejected', failureKind: ack?.blockerToken || 'rejected', sessionId, transactionId: sessionId, containerId: item.objectId });
    return ack;
  }
  setStatus(`container snapshot command accepted for ${item?.text || 'container'}`);
  scheduleDirectContainerSnapshotTimeout(sessionId);
  return ack;
}

function sendGroundOpenContainerAction(action = {}, item = {}) {
  const groundContainer = currentGroundContainerItemForDirectOpen(item);
  if (Number.isInteger(groundContainer?.objectId) && groundContainer.objectId > 0) {
    return sendDirectContainerSnapshotCommand(action, groundContainer);
  }
  setStatus('container open needs a public object id; no hidden classic fallback was attempted');
  return { ok: false, reason: 'container open needs a public object id' };
}
function sendGroundTipContainerAction(action = {}, item = {}) {
  return sendGroundContainerExtendedAction('#tip\n', 'ground.tipContainer', 'Tip contents here', action, item);
}

function sendGroundForceContainerAction(action = {}, item = {}) {
  return sendGroundContainerExtendedAction('#force\n', 'ground.forceContainer', 'Force lock here', action, item);
}

function sendGroundUntrapContainerAction(action = {}, item = {}) {
  return sendGroundContainerExtendedAction('#untrap\n', 'ground.untrapContainer', 'Untrap container here', action, item);
}

async function sendDirectTerrainAction(action = {}, item = {}) {
  const terrainAction = String(action.action || '').trim();
  const terrain = String(action.terrain || action.targetDisplayName || currentDipTerrainTargetLabel() || '').trim();
  const transactionId = `terrain-action-${++semanticActionCommandRevision}`;
  const command = {
    protocol: sharedModules.uiProtocolV2?.protocol || 'nethack-electron-ui/v2',
    commandId: `cmd-${transactionId}`,
    commandType: 'terrain.action',
    transactionId,
    expectedRevision: currentActionExpectedRevision(),
    payload: {
      action: terrainAction,
      coord: { x: gameViewSnapshot.cursor.x, y: gameViewSnapshot.cursor.y },
      terrain,
      ...(Number.isInteger(item?.objectId) && item.objectId > 0 ? { itemId: item.objectId } : {}),
    },
  };
  const context = buildActionExecuteContext();
  const plan = sharedModules.commandGateway?.validateDirectCommandEnvelope?.(command, context);
  recordUiProtocolCommand(command, 'terrain-context');
  if (!plan?.ok) {
    createAndRecordCommandAck('command.rejected', command, {
      reason: plan?.reason || 'terrain.action rejected before dispatch',
      blockerToken: plan?.blockerToken || 'blocked.input.malformedCommand',
      supported: Boolean(plan?.supported),
      executionSource: 'none',
      replayBehavior: 'preserved evidence only; no raw fallback input sent',
    }, 'terrain-context');
    setStatus(`blocked terrain action: ${plan?.reason || 'invalid direct terrain command'}`);
    showFailureNotice({ id: `terrain:${transactionId}:validation`, kind: plan?.blockerToken === 'blocked.input.staleRevision' ? 'stale-revision' : 'rejected', reason: plan?.reason || 'That terrain action is not available.', blockerToken: plan?.blockerToken || '', transactionId });
    return false;
  }
  const ack = await Promise.resolve(dispatchUiCommand(command)).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
  if (!ack?.ok) {
    createAndRecordCommandAck('command.rejected', command, {
      reason: ack?.reason || 'main process rejected terrain.action',
      blockerToken: ack?.blockerToken || 'blocked.public.tryInNetHack',
      supported: true,
      executionSource: 'native-ui-command',
      replayBehavior: 'preserved evidence only; no raw fallback input sent',
    }, 'terrain-context');
    setStatus(`blocked terrain action: ${ack?.reason || 'main process rejected command'}`);
    showFailureNotice({ id: `terrain:${transactionId}:dispatch`, kind: ack?.blockerToken === 'blocked.input.staleRevision' ? 'stale-revision' : 'rejected', reason: ack?.reason || 'NetHack did not accept that action.', blockerToken: ack?.blockerToken || '', transactionId });
    return false;
  }
  createAndRecordCommandAck('command.accepted', command, {
    supported: true,
    executionSource: 'native-ui-command',
    replayBehavior: 'preserved evidence only; no raw fallback input sent',
  }, 'terrain-context');
  setStatus(`sent direct terrain.action ${terrainAction} at ${gameViewSnapshot.cursor.x},${gameViewSnapshot.cursor.y}`);
  return true;
}

function terrainDipInventoryCandidates() {
  const rows = gameViewSnapshot.inventory?.orderedItems?.length ? gameViewSnapshot.inventory.orderedItems : [];
  return rows.filter((item) => Number.isInteger(item?.objectId) && item.objectId > 0 && !/gold piece|zorkmid/i.test(String(item.displayName || item.text || '')));
}

function showTerrainDipItemChooser(action = {}) {
  const candidates = terrainDipInventoryCandidates();
  if (!candidates.length) {
    setStatus('direct terrain dip needs a public inventory snapshot with object ids; no #dip fallback was attempted');
    return false;
  }
  return new Promise((resolve) => {
    const terrain = action.targetDisplayName || action.terrain || currentDipTerrainTargetLabel() || 'terrain';
    const options = candidates.slice(0, 12).map((item) => ({
      key: '',
      className: 'context-choice',
      label: cleanEquipmentText(item.displayName || item.text || 'item'),
      text: `Dip this visible inventory item in ${terrain}.`,
      onClick: async () => {
        closeInteractionDialog();
        const result = await sendDirectTerrainAction(action, item);
        resolve(result);
      },
    }));
    options.push({ key: '', className: 'context-choice', label: 'Cancel', text: 'Keep inventory unchanged.', onClick: () => { closeInteractionDialog(); resolve(false); } });
    showInteractionDialog({
      title: `Dip item in ${terrain}`,
      prompt: 'Choose the visible inventory item to dip. NetHack will reveal only normal dip results.',
      options,
      cancelText: 'Cancel',
      dialogClass: 'context-dialog terrain-dip-dialog',
    });
  });
}

function normalizedEquipmentSlotId(value) {
  const slot = String(value || '').trim();
  return {
    'main-hand': 'mainHand', mainHand: 'mainHand', quiver: 'quiver',
    'left-ring': 'ring.left', 'right-ring': 'ring.right', 'ring.left': 'ring.left', 'ring.right': 'ring.right',
    'armor-suit': 'armor.body', body: 'armor.body', 'armor.body': 'armor.body', cloak: 'armor.cloak', 'armor.cloak': 'armor.cloak', shirt: 'armor.shirt', 'armor.shirt': 'armor.shirt', helmet: 'armor.helm', helm: 'armor.helm', 'armor.helm': 'armor.helm', gloves: 'armor.gloves', 'armor.gloves': 'armor.gloves', boots: 'armor.boots', 'armor.boots': 'armor.boots', shield: 'armor.shield', 'armor.shield': 'armor.shield', amulet: 'amulet', eyes: 'eyes',
  }[slot] || '';
}

function equipmentChangePayloadForAction(action = {}, item = {}, route = {}) {
  const actionId = String(action?.id || action?.actionId || route?.actionId || route?.id || '').trim();
  const itemId = Number(item?.objectId ?? route?.itemId);
  const requestedSlotId = normalizedEquipmentSlotId(route?.slotId || route?.slot || route?.params?.slotId || route?.params?.slot || '');
  const wornMask = Number(item?.wornMask || 0);
  const occupiedSlotId = Number.isSafeInteger(wornMask) && wornMask > 0
    ? Object.entries(sharedModules.equipmentSnapshotAdapter?.wornMasks || {}).find(([, mask]) => (wornMask & mask) !== 0)?.[0] || ''
    : '';
  const slotId = requestedSlotId || occupiedSlotId;
  if (actionId === 'item.takeOff' && ['armor.body', 'armor.cloak', 'armor.shirt'].includes(slotId)) return null;
  if (actionId === 'item.takeOff') return Number.isInteger(itemId) && itemId > 0 ? { action: 'takeOff', itemId, ...(slotId ? { slotId } : {}) } : null;
  if (actionId === 'item.remove.accessory') return Number.isInteger(itemId) && itemId > 0 ? { action: 'removeAccessory', itemId, ...(slotId ? { slotId } : {}) } : null;
  if (actionId === 'item.wield.mainHand') return Number.isInteger(itemId) && itemId > 0 ? { action: 'wieldMain', itemId, slotId: 'mainHand' } : null;
  if (actionId === 'item.quiver') return Number.isInteger(itemId) && itemId > 0 ? { action: 'quiver', itemId, slotId: 'quiver' } : null;
  if (actionId === 'slot.clear.quiver') return { action: 'clearQuiver', slotId: 'quiver', ...(Number.isInteger(itemId) && itemId > 0 ? { itemId } : {}) };
  if (actionId === 'item.putOn.ring') {
    const handShort = String(route?.ringHand || route?.targetRingHand || route?.params?.ringHand || '').toLowerCase();
    const hand = handShort === 'l' || handShort === 'left' ? 'left' : (handShort === 'r' || handShort === 'right' ? 'right' : '');
    if (!Number.isInteger(itemId) || itemId <= 0 || !hand) return null;
    return { action: 'putOnRing', itemId, hand, slotId: hand === 'left' ? 'ring.left' : 'ring.right' };
  }
  return null;
}

function createEquipmentChangeCommand(action = {}, item = {}, route = {}, options = {}, transactionId = '') {
  const payload = equipmentChangePayloadForAction(action, item, route);
  if (!payload) return null;
  const expectedRevision = options.expectedRevision || currentActionExpectedRevision();
  return {
    protocol: 'nethack-electron-ui/v2',
    commandType: 'equipment.change',
    commandId: `cmd-${transactionId || `equipment-change-${Date.now()}`}`.slice(0, 96),
    transactionId: String(transactionId || `equipment-change-${Date.now()}`).slice(0, 96),
    expectedRevision: { inventory: Number.isInteger(expectedRevision.inventory) ? expectedRevision.inventory : 0, equipment: Number.isInteger(expectedRevision.equipment) ? expectedRevision.equipment : 0 },
    payload,
  };
}

async function sendDirectEquipmentChangeCommand(command, action = {}, item = {}, route = {}, options = {}) {
  const validationContext = buildActionExecuteContext();
  const plan = sharedModules.commandGateway?.validateDirectCommandEnvelope?.(command, validationContext);
  const source = options.source || 'semantic-action';
  recordUiProtocolCommand(command, source);
  if (!plan?.ok) {
    createAndRecordCommandAck('command.rejected', command, { reason: plan?.reason || 'equipment.change rejected', blockerToken: plan?.blockerToken || 'blocked.input.malformedCommand', supported: Boolean(plan?.supported), executionSource: 'none', replayBehavior: 'preserved evidence only; no raw fallback input sent' }, source);
    itemEquipmentOwner?.settle?.({ intentId: command.transactionId, status: 'rejected', reason: plan?.reason || 'equipment.change rejected' });
    setStatus(`blocked equipment.change: ${plan?.reason || 'validation failed'}`);
    showFailureNotice({ id: `equipment:${command.commandId}:validation`, kind: plan?.blockerToken === 'blocked.input.staleRevision' ? 'stale-revision' : 'rejected', reason: plan?.reason || 'Equipment change was not accepted.', blockerToken: plan?.blockerToken || '', transactionId: command.transactionId });
    return false;
  }
  pendingNativeUiCommands.set(plan.commandId, { command: plan.command, commandId: plan.commandId, transactionId: plan.transactionId, actionId: action?.id || route?.actionId || 'equipment.change', keys: '', action, item, route, options, mainAckSettled: false });
  const sent = await Promise.resolve(dispatchUiCommand(plan.command)).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
  const pendingPlan = pendingNativeUiCommands.get(plan.commandId);
  if (pendingPlan) pendingPlan.mainAckSettled = true;
  if (sent === false || sent?.ok === false) {
    pendingNativeUiCommands.delete(plan.commandId);
    const reason = sent?.reason || sent?.message || 'main process rejected equipment.change';
    createAndRecordCommandAck('command.rejected', command, { reason, blockerToken: sent?.blockerToken || 'blocked.public.tryInNetHack', supported: true, executionSource: 'native-ui-command', replayBehavior: 'preserved evidence only; no raw fallback input sent' }, source);
    itemEquipmentOwner?.settle?.({ intentId: command.transactionId, status: 'rejected', reason });
    setStatus(`blocked equipment.change: ${reason}`);
    showFailureNotice({ id: `equipment:${command.commandId}:dispatch`, kind: sent?.blockerToken === 'blocked.input.staleRevision' ? 'stale-revision' : 'rejected', reason, blockerToken: sent?.blockerToken || '', transactionId: command.transactionId });
    return false;
  }
  createAndRecordCommandAck('command.accepted', command, { supported: true, executionSource: 'native-ui-command', replayBehavior: 'preserved evidence only; no raw fallback input sent' }, source);
  setStatus(`sent equipment.change ${command.payload.action}`);
  return true;
}

async function sendSemanticActionCommand(keys, action = {}, item = {}, route = {}, options = {}) {
  noteContainerUnlockAnswer(keys);
  const transactionId = String(options.transactionId || route.transactionId || `renderer-gui-action-${++semanticActionCommandRevision}`).slice(0, 80);
  const equipmentChangeCommand = createEquipmentChangeCommand(action, item, route, options, transactionId);
  if (equipmentChangeCommand) return sendDirectEquipmentChangeCommand(equipmentChangeCommand, action, item, route, options);
  const command = sharedModules.commandGateway?.normalizeTextInput ? sharedModules.commandGateway.normalizeTextInput(keys) : String(keys || '');
  if (!command) return;
  const actionContext = buildActionExecuteContext();
  const contextRevision = {};
  if (actionContext.inventoryRevision > 0) contextRevision.inventory = actionContext.inventoryRevision;
  if (actionContext.equipmentRevision > 0) contextRevision.equipment = actionContext.equipmentRevision;
  if (actionContext.groundRevision > 0) contextRevision.ground = actionContext.groundRevision;
  const expectedRevision = options.expectedRevision || contextRevision;
  const v2Command = sharedModules.commandGateway?.createActionExecuteCommand?.({
    commandId: `cmd-${transactionId}`,
    transactionId,
    action,
    item,
    route: { ...route, command },
    expectedRevision,
    source: options.source || 'semantic-action',
    surface: options.source || 'semantic-action',
    target: options.target,
    payload: options.payload,
  });
  let validationContext = actionContext;
  const ownerState = itemEquipmentOwner?.snapshot?.();
  if (String(options.source || '').startsWith('item-equipment-')
    && Number(expectedRevision.inventory) > Number(actionContext.inventoryRevision)
    && Number(expectedRevision.inventory) === Number(ownerState?.inventoryRevision)) {
    validationContext = { ...validationContext, inventoryRevision: expectedRevision.inventory };
    diagnosticEvent('items', 'action-validation.owner-inventory-revision', { intentId: transactionId, ownerRevision: expectedRevision.inventory, gameViewRevision: actionContext.inventoryRevision });
  }
  if (String(options.source || '').startsWith('item-equipment-')
    && Number(expectedRevision.equipment) > Number(actionContext.equipmentRevision)
    && Number(expectedRevision.equipment) === Number(ownerState?.equipmentRevision)) {
    validationContext = { ...validationContext, equipmentRevision: expectedRevision.equipment };
    diagnosticEvent('items', 'action-validation.owner-equipment-revision', { intentId: transactionId, ownerRevision: expectedRevision.equipment, gameViewRevision: actionContext.equipmentRevision });
  }
  if (options.source === 'ground-context' && options.target?.location?.kind === 'ground' && options.target?.displayName && Array.isArray(actionContext.groundItems)) {
    const targetEvidence = String(options.target.displayName).split(/\s*,\s*/).filter(Boolean).map((displayName) => ({ displayName, location: { kind: 'ground' }, source: 'command-public-ground-target' }));
    validationContext = { ...actionContext, groundItems: [...actionContext.groundItems, ...targetEvidence] };
  }
  const v2Plan = v2Command && sharedModules.commandGateway?.validateActionExecuteCommand?.(v2Command, validationContext);
  const unsafeMissedV2Route = v2Plan && !v2Plan.supported && selectorShapedSemanticCommand(command, item) && !/^[#\/]/.test(command);
  if ((v2Plan?.supported && !v2Plan.ok) || unsafeMissedV2Route) {
    recordUiProtocolCommand(v2Command, options.source || 'semantic-action');
    const reason = unsafeMissedV2Route ? (v2Plan.reason || 'selector-shaped inventory/equipment action is not in the v2 execution allowlist') : (v2Plan.reason || 'v2 action execution rejected');
    createAndRecordCommandAck('command.rejected', v2Command, {
      reason,
      blockerToken: unsafeMissedV2Route ? 'blocked.public.tryInNetHack' : (v2Plan.blockerToken || undefined),
      supported: Boolean(v2Plan?.supported && !unsafeMissedV2Route),
      executionSource: 'none',
      replayBehavior: 'preserved evidence only; no raw fallback input sent',
    }, options.source || 'semantic-action');
    itemEquipmentOwner?.settle?.({ intentId: transactionId, status: 'rejected', reason });
    setStatus(`blocked ${action?.id || route?.actionId || 'GUI action'}: ${reason}`);
    showFailureNotice({ id: `action:${transactionId}:validation`, kind: v2Plan?.blockerToken === 'blocked.input.staleRevision' ? 'stale-revision' : 'rejected', reason, blockerToken: v2Plan?.blockerToken || '', transactionId });
    diagnosticEvent('ui-protocol-v2', 'action-execute.blocked', { reason, actionId: v2Plan.actionId || action?.id || route?.actionId || '', keys: command, expectedRevision: v2Plan?.expectedRevision, actualRevision: v2Plan?.actualRevision }, { transactionId });
    return false;
  }
  if (v2Plan?.ok) {
    recordUiProtocolCommand(v2Command, options.source || 'semantic-action');
    pendingNativeUiCommands.set(v2Plan.commandId, { command: v2Plan.command, commandId: v2Plan.commandId, transactionId, actionId: v2Plan.actionId, keys: command, action, item, route, options, mainAckSettled: false });
    const sent = await Promise.resolve(dispatchUiCommand(v2Plan.command)).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
    const pendingPlan = pendingNativeUiCommands.get(v2Plan.commandId);
    if (pendingPlan) pendingPlan.mainAckSettled = true;
    const fastBridgeOutcome = pendingNativeUiCommandBridgeOutcomes.get(v2Plan.commandId);
    pendingNativeUiCommandBridgeOutcomes.delete(v2Plan.commandId);
    if (sent === false || sent?.ok === false) {
      pendingNativeUiCommands.delete(v2Plan.commandId);
      const reason = sent?.reason || sent?.message || 'main process rejected native ui command';
      createAndRecordCommandAck('command.rejected', v2Plan.command, {
        reason,
        blockerToken: sent?.blockerToken || 'blocked.public.tryInNetHack',
        supported: true,
        executionSource: 'native-ui-command',
        replayBehavior: 'preserved evidence only; no raw fallback input sent',
      }, options.source || 'semantic-action');
      itemEquipmentOwner?.settle?.({ intentId: transactionId, status: 'rejected', reason });
      setStatus(`blocked ${action?.id || route?.actionId || 'GUI action'}: ${reason}`);
      showFailureNotice({ id: `action:${transactionId}:dispatch`, kind: sent?.blockerToken === 'blocked.input.staleRevision' ? 'stale-revision' : 'rejected', reason, blockerToken: sent?.blockerToken || '', transactionId });
      diagnosticEvent('ui-protocol-v2', 'ui-command.rejected', { actionId: v2Plan.actionId, commandId: v2Plan.commandId, sent }, { transactionId });
      return false;
    }
    if (fastBridgeOutcome?.status === 'rejected') {
      const reason = fastBridgeOutcome.reason || 'bridge rejected native ui command';
      showFailureNotice({ id: `action:${transactionId}:bridge`, kind: fastBridgeOutcome.blockerToken === 'blocked.input.staleRevision' ? 'stale-revision' : 'rejected', reason, blockerToken: fastBridgeOutcome.blockerToken || '', transactionId });
      diagnosticEvent('ui-protocol-v2', 'ui-command.bridge-rejected-before-main-ack', { actionId: v2Plan.actionId, commandId: v2Plan.commandId, reason }, { transactionId });
      return false;
    }
    diagnosticEvent('ui-protocol-v2', fastBridgeOutcome?.status === 'accepted' ? 'ui-command.bridge-accepted-before-main-ack' : 'ui-command.sent', { actionId: v2Plan.actionId, commandId: v2Plan.commandId, sent }, { transactionId });
    lastSentKey = { key: undefined, at: 0 };
    if (fastBridgeOutcome?.status !== 'accepted') setStatus(`sent native v2 action.execute ${action?.id || route?.actionId || 'GUI action'}: ${keys.replace(/\n/g, '↵')}`);
    return true;
  }
  const protocolMeta = {};
  [...command].forEach((key, index) => {
    if (key.length === 1 && isSupportedPlayableKey(key)) {
      sendRecordedShimInput({ type: 'keycode', keycode: key.charCodeAt(0), ...semanticActionPayload(action, item, route, index, command.length, transactionId, options), ...protocolMeta }, options.source || 'semantic-action');
    }
  });
  lastSentKey = { key: undefined, at: 0 };
  setStatus(`sent compat action ${action?.id || route?.actionId || 'GUI action'}: ${keys.replace(/\n/g, '↵')}`);
  return true;
}

function normalizedRepeatCount() {
  const raw = Number(repeatCountInput?.value || 1);
  return Math.max(1, Math.min(999, Number.isFinite(raw) ? Math.floor(raw) : 1));
}

function sendRepeatedCommand(commandKey) {
  if (!commandKey || hasActiveUiInputOwner()) return;
  const count = normalizedRepeatCount();
  repeatCountInput.value = String(count);
  sendPlayableText(`${count}${commandKey}`);
  appendMessage(`${count} × ${commandKey === '.' ? 'wait/rest' : commandKey === 's' ? 'search' : describePlayableKey(commandKey)}.`);
  gameGrid.focus({ preventScroll: true });
}

function movementPrefixForMode(mode = movementMode) {
  if (mode === 'run') return '';
  if (mode === 'fight') return 'F';
  return '';
}

function updateMovementModeButtons() {
  movementActions?.querySelectorAll('button[data-movement-mode]').forEach((button) => {
    const selected = button.dataset.movementMode === movementMode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function setMovementMode(mode) {
  movementMode = ['walk', 'run', 'fight'].includes(mode) ? mode : 'walk';
  updateMovementModeButtons();
  setStatus(`movement mode: ${movementMode}`);
}

function sendMovementCommand(directionKey) {
  if (!/^[hjklyubn]$/.test(String(directionKey || '')) || hasActiveUiInputOwner()) return;
  const count = normalizedRepeatCount();
  const countPrefix = count > 1 ? String(count) : '';
  const prefix = movementPrefixForMode();
  const movementCommand = movementMode === 'run' ? directionKey.toUpperCase() : `${prefix}${directionKey}`;
  repeatCountInput.value = String(count);
  sendPlayableText(`${countPrefix}${movementCommand}`);
  appendMessage(`${count > 1 ? `${count} × ` : ''}${movementMode} ${directionKey.toUpperCase()}.`);
  gameGrid.focus({ preventScroll: true });
}

function updateCompassRunButton() {
  const runButton = directionHelper?.querySelector('[data-compass-run]');
  if (!runButton) return;
  runButton.classList.toggle('selected', compassRunArmed);
  runButton.setAttribute('aria-pressed', String(compassRunArmed));
  runButton.setAttribute('aria-label', compassRunArmed ? 'Run armed; press again to cancel' : 'Arm run mode');
  runButton.textContent = compassRunArmed ? 'Go' : 'Run';
  if (['Move', 'Run armed'].includes(directionHelperTitle?.textContent || '')) directionHelperTitle.textContent = compassRunArmed ? 'Run armed' : 'Move';
}

function sendCompassMovement(directionKey) {
  if (!/^[hjklyubn]$/.test(String(directionKey || ''))) return false;
  if (hasActiveUiInputOwner()) {
    setStatus('Finish the current choice before moving.');
    return false;
  }
  const mode = compassRunArmed ? 'run' : 'walk';
  sendPlayableText(mode === 'run' ? directionKey.toUpperCase() : directionKey);
  appendMessage(`${mode} ${directionKey.toUpperCase()} from the movement compass.`);
  compassRunArmed = false;
  updateCompassRunButton();
  gameGrid.focus({ preventScroll: true });
  return true;
}

function promptForReplayCheckpoint() {
  const nextIndex = (activeRecording?.events?.filter((event) => event.type === 'checkpoint').length || 0) + 1;
  const suggested = `checkpoint-${nextIndex}`;
  const name = window.prompt('Checkpoint name for replay screenshot', suggested);
  if (name !== null) recordCheckpoint(name || suggested);
}

recordCheckpointButton?.addEventListener('click', promptForReplayCheckpoint);
recordCheckpointPrimaryButton?.addEventListener('click', promptForReplayCheckpoint);
document.getElementById('save-recording').addEventListener('click', () => saveActiveRecording('manual'));
saveRecordingPrimaryButton?.addEventListener('click', () => saveActiveRecording('manual'));
document.getElementById('shim-wait').addEventListener('click', () => sendPlayableKey('.'));
document.getElementById('shim-esc').addEventListener('click', () => sendPlayableKey('\u001b'));
document.getElementById('stop').addEventListener('click', () => netHackAPI.stop());
repeatActions?.addEventListener('click', (event) => {
  const preset = event.target.closest('button[data-repeat-count]');
  if (preset) {
    repeatCountInput.value = String(Math.max(1, Math.min(999, Number(preset.dataset.repeatCount) || 1)));
    repeatCountInput.focus();
    repeatCountInput.select();
    return;
  }
  const command = event.target.closest('button[data-repeat-command]')?.dataset.repeatCommand;
  if (command) {
    closeActionDialog({ refocusGame: false });
    sendRepeatedCommand(command);
  }
});
repeatCountInput?.addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.key === 'Enter') {
    event.preventDefault();
    repeatActions.querySelector('button[data-repeat-command="."]')?.focus();
  }
});
movementActions?.addEventListener('click', (event) => {
  const mode = event.target.closest('button[data-movement-mode]')?.dataset.movementMode;
  if (mode) {
    setMovementMode(mode);
    return;
  }
  const direction = event.target.closest('button[data-move-direction]')?.dataset.moveDirection;
  if (direction) {
    closeActionDialog({ refocusGame: false });
    sendMovementCommand(direction);
  }
});
directionHelper?.addEventListener('keydown', (event) => {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Spacebar', 'Escape'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape' && compassRunArmed) {
    compassRunArmed = false;
    updateCompassRunButton();
    setStatus('Run cancelled — compass will walk.');
  } else if (event.key === 'Escape') cancelActiveInteraction();
  else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') document.activeElement?.click?.();
  else focusDirectionHelperButton(event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1);
});

movementActions?.addEventListener('keydown', (event) => {
  // Movement controls are a visible UI owner while focused: arrows move among
  // controls and Enter/Space activates them, instead of leaking to map movement.
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Spacebar'].includes(event.key)) return;
  event.stopPropagation();
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') return;
  event.preventDefault();
  const buttons = Array.from(movementActions.querySelectorAll('button'));
  const index = buttons.indexOf(document.activeElement);
  const next = buttons[(index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length];
  next?.focus({ preventScroll: true });
});
function sendExtendedCommandButton(button) {
  if (!button) return;
  const command = String(button.dataset.extCommand || '').trim().replace(/^#/, '');
  if (!command || hasActiveUiInputOwner()) return;
  setWorkflowContextFromButton(button, button.textContent.trim());
  if (activeWorkflowContext) activeWorkflowContext.submittedExtendedCommand = command;
  sendPlayableText(`#${command}\n`);
  appendMessage(`${button.textContent.trim()}.`);
  gameGrid.focus({ preventScroll: true });
}


function sendCommandButton(button) {
  if (!button) return;
  if (transferPanelOwnsUiInput() && !button.closest?.('#container-transfer-panel')) {
    setStatus('transfer panel active; close it before using other commands');
    return;
  }
  if (button.dataset.extCommand) {
    sendExtendedCommandButton(button);
    return;
  }
  const key = button.dataset.commandCode ? String.fromCharCode(Number(button.dataset.commandCode)) : (button.dataset.commandKey || '');
  if (key === '?') pendingDocumentReturnFocus = button.closest?.('#action-dialog') ? openActionsButton : button;
  if (key === 'i' && activePromptIsOrphaned()) {
    markInventoryOverviewRequest();
    clearPromptOwnerState({ clearWorkflow: true });
    closeInteractionDialog({ force: true });
    renderPromptPanel();
    renderMenuPanel();
    sendPlayableText('\u001bi');
    gameGrid.focus({ preventScroll: true });
    return;
  }
  setWorkflowContextFromButton(button, button.textContent.trim());
  if (key === 'S') sendSemanticActionCommand('S', { id: 'run.save-and-exit', label: 'Save and exit' }, {}, { actionId: 'run.save-and-exit', label: 'Save and exit', command: 'S' }, { source: 'lifecycle-action', payload: { promptPolicy: 'core-owned' } });
  else sendPlayableKey(key);
  if (key === '\u0004') appendMessage('Kick: choose a direction when NetHack asks (h/j/k/l/y/u/b/n or arrows).');
  if ('aezqrtwWTRPxQZ'.includes(key)) appendMessage(`${button.textContent.trim()}${'aeqrztwWTPRQZ'.includes(key) ? '; choose from the visible picker if NetHack asks.' : '.'}`);
  if ('SQ'.includes(key)) appendMessage(`${button.textContent.trim()}; confirm using the visible safe/danger buttons.`);
  gameGrid.focus({ preventScroll: true });
}

function openActionDialog() {
  if (hasActiveUiInputOwner() && !uxCommandPalette?.element?.open) return false;
  if (uxCommandPalette) {
    const invoker = document.activeElement && document.activeElement !== document.body ? document.activeElement : openActionsButton;
    uxCommandPalette.open({ publicState: discoveryPublicState(), invoker });
    return true;
  }
  return false;
}

function closeActionDialog({ refocusGame = false } = {}) {
  if (uxCommandPalette?.element?.open) uxCommandPalette.close('close');
  if (actionDialog.open) actionDialog.close();
  if (refocusGame) gameGrid.focus({ preventScroll: true });
}

function sendActionDialogCommand(button) {
  if (!button) return;
  closeActionDialog({ refocusGame: false });
  sendCommandButton(button);
}

document.getElementById('quick-actions').addEventListener('click', (event) => {
  if (event.target.closest('#open-actions')) {
    openActionDialog();
    return;
  }
  sendCommandButton(event.target.closest('button[data-command-key], button[data-command-code]'));
});
actionDialogClose?.addEventListener('click', () => closeActionDialog());
actionDialog?.addEventListener('keydown', (event) => {
  // The collapsed action modal owns keyboard focus. Movement/raw command keys
  // must not leak to the map while the Boss is browsing action buttons.
  event.stopPropagation();
});
itemActions?.addEventListener('click', (event) => {
  sendActionDialogCommand(event.target.closest('button[data-command-key], button[data-command-code]'));
});
systemActions?.addEventListener('click', (event) => {
  sendActionDialogCommand(event.target.closest('button[data-ext-command], button[data-command-key], button[data-command-code]'));
});
systemActions?.addEventListener('keydown', (event) => {
  // System/action-panel focus owns navigation keys; arrows move across visible
  // buttons and Enter/Space activates the focused button instead of leaking to
  // map movement or raw command input.
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Spacebar'].includes(event.key)) return;
  event.stopPropagation();
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') return;
  event.preventDefault();
  const buttons = Array.from(systemActions.querySelectorAll('button'));
  const index = buttons.indexOf(document.activeElement);
  const next = buttons[(index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length];
  next?.focus({ preventScroll: true });
});
function sendActivePromptCancellation(prompt, options = {}) {
  const menuOwner = options.forceMenu || gameViewSnapshot.currentMenu;
  const menuOwnsCancellation = Boolean(menuOwner?.awaitingSelection && (options.forceMenu || ['menu selection', 'read-only menu'].includes(String(prompt?.kind || ''))));
  const plan = menuOwnsCancellation
    ? sharedModules.interactionModel.cancellationPlanForMenu(menuOwner)
    : sharedModules.interactionModel.cancellationPlanForPrompt(prompt);
  const responseKey = String(plan.key).slice(0, 1);
  const requestId = omitNextPromptCancellationOwnershipForTest ? '' : String((menuOwnsCancellation ? (menuOwner?.requestId || menuOwner?.menuRequestId) : prompt?.requestId) || prompt?.promptId || '');
  const transactionId = String(options.transactionId || (menuOwnsCancellation ? menuOwner?.transactionId : prompt?.transactionId) || gameViewSnapshot.activeTransactionId || `prompt-cancel:${requestId || shimEventCount + 1}`);
  pendingPromptCancellation = {
    requestId,
    transactionId,
    responseKey,
    promptFamily: plan.kind,
    acknowledgementEvent: plan.acknowledgementEvent,
    canonicalChoice: Boolean(plan.canonicalChoice),
    ...(menuOwnsCancellation ? {
      window: menuOwner?.window,
      menuId: String(menuOwner?.menuId || ''),
      menuPurpose: String(menuOwner?.menuPurpose || menuOwner?.purpose || ''),
      ownerKind: String(menuOwner?.owner?.kind || ''),
      requestSourceLayer: String(menuOwner?.requestSource?.layer || ''),
      lifecycleRevision: menuOwner?.lifecycleRevision,
    } : {}),
  };
  omitNextPromptCancellationOwnershipForTest = false;
  lastPromptCancellationAcknowledgement = null;
  const payload = {
    type: 'keycode',
    keycode: responseKey.charCodeAt(0),
    transactionId,
    guiActionId: 'interaction.cancel',
    actionLabel: 'Cancel',
    followupPlan: 'cancel',
  };
  if (requestId) payload.expectedRequestId = requestId;
  const previousWorldCommand = lastWorldCommand;
  const sent = sendRecordedShimInput(payload, 'prompt-cancel');
  lastWorldCommand = previousWorldCommand;
  lastSentKey = { key: undefined, at: 0 };
  diagnosticEvent('prompt', 'prompt.cancellation.sent', { ...pendingPromptCancellation, sent }, { transactionId, requestId });
  setStatus(`prompt cancellation sent as ${plan.canonicalChoice ? responseKey : 'Escape'}`);
  return sent;
}

function cancelActiveInteraction() {
  const cancelingShopPayment = Boolean(gameViewSnapshot.currentMenu && sharedModules.interactionModel.isShopPaymentMenu(gameViewSnapshot.currentMenu));
  if (cancelingShopPayment) {
    shopPaymentUiStatus = { phase: 'cancelled', text: 'Payment cancelled', until: Date.now() + 3000 };
    setStatus(shopPaymentUiStatus.text);
  }
  if (activeContextualPrompt) {
    dismissContextualPrompt();
    return;
  }
  if (gameViewSnapshot.activePrompt) {
    const canceledLazyInventory = rememberCanceledInventoryLazyLoad();
    const cancelingReadOnlyMenu = gameViewSnapshot.activePrompt.kind === 'read-only menu';
    sendActivePromptCancellation(gameViewSnapshot.activePrompt);
      const menu = gameViewSnapshot.currentMenu
        ? { ...gameViewSnapshot.currentMenu, awaitingSelection: false }
        : null;
      publishRendererGameViewEvent({ name: 'renderer_dismiss_interaction', expectedRequestId: gameViewSnapshot.activePrompt?.requestId || '', clearMenu: cancelingReadOnlyMenu });
      if (menu && !cancelingReadOnlyMenu) publishRendererGameViewEvent({ name: 'renderer_publish_menu', menu });
    if (canceledLazyInventory) suppressInventoryLazyLoadUntil = Date.now() + 600;
    closeInteractionDialog({ force: true });
    clearWorkflowContext();
    renderPromptPanel();
    renderMenuPanel();
    updateModalOverlayLayoutLock();
    return;
  }
  if (itemEquipmentOwner?.ownership?.().active) {
    itemEquipmentOwner.close({ reason: 'cancel', cancelNative: true });
  }
  closeInteractionDialog({ force: true });
  clearWorkflowContext();
  updateModalOverlayLayoutLock();
}

interactionCancel.addEventListener('click', (event) => {
  event.preventDefault();
  cancelActiveInteraction();
});
interactionDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  if (closeGroundItemContextMenu()) return;
  cancelActiveInteraction();
});
interactionText.addEventListener('keydown', (event) => {
  // Keep modal text editing inside the input. Without stopping propagation for
  // printable keys, the document-level NetHack key forwarder can consume input
  // in some dialog/focus paths before the browser updates the field value.
  if (handleSingleSelectMenuHotkey(event) || handleFixedChoicePromptHotkey(event)) return;
  event.stopPropagation();
  if (event.key === 'Enter') {
    event.preventDefault();
    sendPlayableText(`${interactionText.value}\n`);
  }
});
interactionDialog.addEventListener('keydown', (event) => {
  if (handleSingleSelectMenuHotkey(event) || handleFixedChoicePromptHotkey(event)) return;
  if (event.key === 'Escape' && closeGroundItemContextMenu()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (activeContextualPrompt?.kind === 'locked-door') {
    const key = keyToNetHackCommand(event);
    if (key === '\n' || key === '\r' || /^y$/i.test(key)) {
      event.preventDefault();
      event.stopPropagation();
      kickLockedDoorFromContext();
      return;
    }
    if (key === '\u001b' || /^n$/i.test(key)) {
      event.preventDefault();
      event.stopPropagation();
      dismissContextualPrompt();
      return;
    }
  }
  if (event.target === interactionText) return;
  handleInteractionNavigationKeydown(event);
});

const movementKeys = new Map([
  ['ArrowLeft', 'h'],
  ['ArrowDown', 'j'],
  ['ArrowUp', 'k'],
  ['ArrowRight', 'l'],
]);

function keyToNetHackCommand(event) {
  if (event.repeat || event.isComposing || event.metaKey || event.altKey) return undefined;
  if (event.ctrlKey) return String(event.key || '').toLowerCase() === 'd' ? '\u0004' : undefined;
  if (movementKeys.has(event.key)) return movementKeys.get(event.key);
  if (event.key === 'Escape') return '\u001b';
  if (event.key === 'Enter') return '\n';
  if (event.key === 'Backspace') return '\b';
  if (event.key === 'Tab') return '\t';
  if (event.key === ' ' || event.key === 'Spacebar') return gameViewSnapshot.activePrompt ? ' ' : '.';
  if (event.key && event.key.length === 1) return event.key;
  return undefined;
}

function isActiveDirectionPrompt() {
  return Boolean(gameViewSnapshot.activePrompt?.kind === 'question' && sharedModules.interactionModel.isDirectionPrompt(gameViewSnapshot.activePrompt.query || ''));
}

function activePromptOwnsUiInput() {
  // The shim currently reports the normal NetHack command loop via
  // bridge_direction_prompt because it is implemented through nh_poskey.  That
  // is not a renderer/UI input owner for ordinary keyboard play: movement and
  // prompt answers must still reach NetHack.  Semantic v2 actions use the
  // stricter semanticActionActiveInputOwner() below so a second action cannot
  // be launched while NetHack owns a direction follow-up.
  return Boolean(gameViewSnapshot.activePrompt && !isActiveDirectionPrompt() && !activePromptIsOrphaned());
}

function semanticActionActiveInputOwner() {
  if (gameViewSnapshot.activePrompt && !activePromptIsOrphaned()) return { kind: 'prompt', requestId: gameViewSnapshot.activePrompt.requestId || '', label: gameViewSnapshot.activePrompt.query || '' };
  if (gameViewSnapshot.currentMenu && gameViewSnapshot.currentMenu.awaitingSelection) return { kind: 'menu', requestId: gameViewSnapshot.currentMenu.requestId || '', label: gameViewSnapshot.currentMenu.prompt || '' };
  if (transferPanelOwnsUiInput()) return { kind: 'transfer', label: 'container transfer panel' };
  return null;
}

function transferPanelOwnsUiInput() {
  // The two-pane container panel is a modal owner: while it is open, raw
  // keyboard/toolbar commands would compete with direct snapshot/transfer
  // refresh ownership. Passive ground views remain non-modal so
  // Inventory/Equipment can still be opened from a ground item note before the
  // player chooses to pick up or drop anything.
  return Boolean(transferPresentation?.active && transferPresentation.sessionKind === 'container' && containerTransferPanel && !containerTransferPanel.hidden);
}

function hasActiveUiInputOwner() {
  return Boolean(
    interactionDialog.open
    || documentDialog.open
    || startupChoiceDialog.open
    || introDialog.open
    || characterDialog.open
    || actionDialog.open
    || uxCommandPalette?.element?.open
    || uxHelpCenter?.element?.open
    || uxCharacterCreation?.element?.open
    || settingsDialog.open
    || gameOverDialog.open
    || transferPanelOwnsUiInput()
    || activePromptOwnsUiInput()
    || (gameViewSnapshot.currentMenu && gameViewSnapshot.currentMenu.awaitingSelection)
    || (focusMode !== 'game' && !activePromptIsOrphaned())
  );
}

function handlePlayableKeydown(event) {
  const key = keyToNetHackCommand(event);
  if (!key) return;
  event.preventDefault();
  event.stopPropagation();
  sendPlayableKey(key);
}

function handleActiveDirectionPromptKeydown(event) {
  if (!isActiveDirectionPrompt()) return false;
  if (interactionDialog.open || documentDialog.open || startupChoiceDialog.open || introDialog.open || characterDialog.open || actionDialog.open || settingsDialog.open || gameOverDialog.open || (gameViewSnapshot.currentMenu && gameViewSnapshot.currentMenu.awaitingSelection) || focusMode !== 'game') return false;
  const key = keyToNetHackCommand(event);
  if (!key || !isSupportedPlayableKey(key)) return false;
  event.preventDefault();
  event.stopPropagation();
  sendPlayableKey(key);
  return true;
}

gameGrid.tabIndex = 0;
gameGrid.addEventListener('click', (event) => {
  const cellEl = event.target?.closest?.('.tile-cell');
  const direction = cellEl && gameGrid.contains(cellEl) ? mapCellDirectionFromCursor(cellEl) : '';
  if (direction && runningState.running && !hasActiveUiInputOwner()) {
    sendMovementCommand(direction);
    return;
  }
  gameGrid.focus();
  setStatus(runningState.running ? 'tile map focused; click adjacent cells or use visible movement controls; prompts require explicit controls' : 'tile map focused; start playable tile game');
});
gameGrid.addEventListener('contextmenu', (event) => {
  const cellEl = event.target?.closest?.('.tile-cell');
  if (!cellEl || !gameGrid.contains(cellEl)) return;
  event.preventDefault();
  event.stopPropagation();
  showMapContextActionSheet(cellEl);
});
gameGrid.addEventListener('mousemove', updateMapTooltipFromPointer, { passive: true });
gameGrid.addEventListener('mouseleave', hideMapTooltip);
gameGrid.addEventListener('blur', hideMapTooltip);
document.addEventListener('pointerdown', (event) => {
  if (!event.target?.closest?.('.ground-item-context-menu')) closeGroundItemContextMenu();
});

/* Escape is routed once, during capture, before focused controls, native dialog
 * cancellation, or the dungeon key forwarder can observe it.  The layer
 * descriptor always invokes the same visible Close/Done/Cancel control so
 * cleanup semantics do not diverge between mouse and keyboard paths. */
let escapeDismissalKeyHeld = false;
function clearActiveDragPresentation() {
  const activeDragElements = Array.from(document.querySelectorAll('.dragging, .drag-over'));
  activeDragElements.forEach((element) => element.classList.remove('dragging', 'drag-over'));
}
function dialogEscapeLayer(dialog) {
  const layers = new Map([
    [startupChoiceDialog, { id: 'startup-choice', dismissible: false, blocked: () => startupNewGame?.focus?.({ preventScroll: true }) }],
    [gameOverDialog, { id: 'game-over', dismissible: false, blocked: () => { setStatus('final chronicle remains open; choose New game or Exit'); gameOverNew?.focus?.({ preventScroll: true }); } }],
    [interactionDialog, { id: 'interaction', dismissible: true, dismiss: () => interactionCancel?.click() }],
    [documentDialog, { id: 'document', dismissible: true, dismiss: () => documentClose?.click() }],
    [introDialog, { id: 'intro', dismissible: true, dismiss: () => introContinue?.click() }],
    [characterDialog, { id: 'character', dismissible: true, dismiss: () => characterDialog.querySelector('button[value="cancel"]')?.click() }],
    [actionDialog, { id: 'actions', dismissible: true, dismiss: () => actionDialogClose?.click() }],
    [settingsDialog, { id: 'settings', dismissible: true, dismiss: () => settingsDialog.querySelector('button[value="cancel"]')?.click() }],
    [uxCommandPalette?.element, { id: 'command-palette', dismissible: true, dismiss: () => uxCommandPalette.close('escape') }],
    [uxHelpCenter?.element, { id: 'help-center', dismissible: true, dismiss: () => uxHelpCenter.close('escape') }],
    [uxCharacterCreation?.element, { id: 'character', dismissible: true, dismiss: () => uxCharacterCreation.close('escape') }],
  ]);
  const layer = layers.get(dialog);
  return layer ? { ...layer, element: dialog, order: overlayLayerOpenOrder.get(dialog) || 0 } : null;
}
function visibleGroundItemContextMenu() {
  const menu = document.querySelector('.ground-item-context-menu');
  if (!menu?.isConnected || menu.getClientRects().length === 0) return null;
  const ownerDialog = menu.closest('dialog');
  return ownerDialog && !ownerDialog.open ? null : menu;
}
function topmostEscapeLayer() {
  const discoveryDialogs = [uxCommandPalette?.element, uxHelpCenter?.element].filter(Boolean);
  const openDialogLayers = [...new Set([...modalOverlayDialogs, ...discoveryDialogs])]
    .filter((dialog) => dialog.open)
    .map(dialogEscapeLayer)
    .filter(Boolean)
    .sort((left, right) => right.order - left.order);
  const topDialogLayer = openDialogLayers[0] || null;
  const contextMenu = visibleGroundItemContextMenu();
  const contextOwnerDialog = contextMenu?.closest('dialog') || null;
  // A context menu is above its own dialog, but a newer native modal is in a
  // higher browser top layer. Body-owned ground menus likewise sit below any
  // open modal regardless of their numeric z-index.
  if (contextMenu && (!topDialogLayer || contextOwnerDialog === topDialogLayer.element)) {
    return { id: 'ground-item-context-menu', dismissible: true, order: Number.MAX_SAFE_INTEGER, dismiss: closeGroundItemContextMenu };
  }
  if (topDialogLayer) return topDialogLayer;
  if (transferPresentation?.active && containerTransferPanel && !containerTransferPanel.hidden) {
    return {
      id: transferPresentation.sessionKind === 'ground-pickup' ? 'ground-transfer' : 'container-transfer',
      dismissible: true,
      order: overlayLayerOpenOrder.get(containerTransferPanel) || 0,
      dismiss: () => containerTransferPanel.querySelector('.container-transfer-heading button')?.click(),
    };
  }
  return null;
}
function handleTopmostEscapeKeydown(event) {
  if (event.key !== 'Escape') return false;
  if (event.repeat && escapeDismissalKeyHeld) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }
  const layer = topmostEscapeLayer();
  if (!layer) return false;
  escapeDismissalKeyHeld = true;
  event.preventDefault();
  event.stopImmediatePropagation();
  clearActiveDragPresentation();
  if (layer.dismissible) layer.dismiss?.();
  else layer.blocked?.();
  return true;
}
document.addEventListener('keydown', handleTopmostEscapeKeydown, true);
document.addEventListener('keyup', (event) => {
  if (event.key !== 'Escape' || !escapeDismissalKeyHeld) return;
  escapeDismissalKeyHeld = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

/* One global bubbling keydown path only. A previous grid keydown listener plus
 * this listener sent two shim commands for a focused map cell. */
function isTextEditingEvent(event) {
  const target = event.target;
  const active = document.activeElement;
  const isEditable = (element) => Boolean(element && (
    element === term.textarea
    || element.isContentEditable
    || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName || '')
  ));
  return isEditable(target) || isEditable(active) || event.composedPath?.().some(isEditable);
}

document.addEventListener('keydown', (event) => {
  if (isTextEditingEvent(event)) return;
  if (handleActiveDirectionPromptKeydown(event)) return;
  if (transferPresentation?.active) {
    handleContainerTransferPanelKeydown(event);
    if (event.defaultPrevented) return;
  }
  if (hasActiveUiInputOwner()) {
    if (interactionDialog.open && !handleFixedChoicePromptHotkey(event)) handleInteractionNavigationKeydown(event);
    return;
  }
  if (activeContextualPrompt?.kind === 'locked-door') {
    const key = keyToNetHackCommand(event);
    if (key === '\n' || key === '\r' || /^y$/i.test(key)) {
      event.preventDefault();
      event.stopPropagation();
      kickLockedDoorFromContext();
      return;
    }
    if (/^s$/i.test(key)) {
      event.preventDefault();
      event.stopPropagation();
      dismissContextualPrompt();
      sendPlayableKey('s');
      return;
    }
    if (key === '\u001b' || /^n$/i.test(key)) {
      event.preventDefault();
      event.stopPropagation();
      dismissContextualPrompt();
      return;
    }
  }
  // Non-text controls no longer trap gameplay keys after a click.  Modal/text
  // owners are filtered above; otherwise route normal movement/commands to the
  // game even if focus is still on a toolbar button.
  handlePlayableKeydown(event);
});

if (typeof window !== 'undefined') {
  window.__nethackAutomation = {
    version: 'nethack-test-adapter/v1',
    async startReplay(config = {}) {
      if (startupChoiceDialog?.open) startupChoiceDialog.close('automation-replay');
      startupChoiceShown = true;
      shimOutput.textContent = '';
      shimLines = [];
      pendingShimEvents = [];
      shimEventCount = 0;
      publicGroundPileShimEvidence = [];
      seenShimEventNames.clear();
      resetGameView();
      lastSentKey = { key: undefined, at: 0 };
      testSentInputs = [];
      testSentPayloads = [];
      testSentUiProtocolCommands = [];
      testSentUiProtocolAcks = [];
      pendingNativeUiCommands = new Map();
      pendingNativeUiCommandBridgeOutcomes = new Map();
      activeRecording = null;
      updateRecordingStatus('Recording disabled during replay.');
      if (config.settings && typeof config.settings === 'object') saveSettings(config.settings);
      currentRunConfig = { playerSpec: config.playerSpec || '', seed: config.seed || '', scenarioId: config.scenarioId || '', replay: true };
      setStatus(config.seed ? `starting replay seed ${config.seed}` : 'starting replay');
      const nethackOptions = typeof config.nethackOptions === 'string' && config.nethackOptions ? config.nethackOptions : buildNethackOptions(userSettings);
      const result = await netHackAPI.startShimBridge({ playerSpec: config.playerSpec || '', seed: config.seed || '', scenarioId: config.scenarioId || '', nethackOptions });
      setStatus(result.ok ? `replay running (pid ${result.pid})` : 'replay bridge failed');
      gameGrid.focus();
      return { ...result, state: automationState() };
    },
    dismissReplayIntro() {
      if (introDialog?.open) introDialog.close('replay-dismiss-intro');
      return { ok: true, state: automationState() };
    },
    sendKeycode(keycode) {
      const code = Number(keycode);
      if (!Number.isFinite(code) || code < 1 || code > 126) return { ok: false, message: 'unsupported keycode' };
      const key = String.fromCharCode(code);
      if (!isSupportedPlayableKey(key)) return { ok: false, message: 'blocked keycode' };
      sendRecordedShimInput({ type: 'keycode', keycode: code }, 'automation');
      lastSentKey = { key: undefined, at: 0 };
      setStatus(`replay sent key: ${describePlayableKey(key)}`);
      return { ok: true, state: automationState() };
    },
    state: automationState,
    recordCheckpoint,
    saveRecording: saveActiveRecording,
    currentRecording: () => (activeRecording ? JSON.parse(JSON.stringify(activeRecording)) : null),
    recoveryState: () => JSON.parse(JSON.stringify(startupRecoveryState || {})),
    refreshRecoveryState: refreshStartupRecoveryState,
    stop: () => netHackAPI.stop(),
  };
  window.__nethackPromptTest = {
    reset() {
      resetGameView();
      transferSession.dispatch({ type: 'reset' });
      testSentInputs = [];
      testSentPayloads = [];
      testSentUiProtocolCommands = [];
      testSentUiProtocolAcks = [];
      pendingNativeUiCommands = new Map();
      pendingNativeUiCommandBridgeOutcomes = new Map();
      lastSentKey = { key: undefined, at: 0 };
      pendingPromptCancellation = null;
      lastPromptCancellationAcknowledgement = null;
      testPromptCancellationDiagnostics = [];
      if (directTransferPendingTimeout) window.clearTimeout(directTransferPendingTimeout);
      directTransferPendingTimeout = null;
      clearDirectContainerSnapshotTimeout();
      containerTransferExtendedPromptSuppressTokens = [];
      containerTransferSuppressedExtendedPrompt = null;
      containerTransferLastExtendedPromptSuppressionAt = 0;
      containerTransferInternalSendDepth = 0;
      testUiCommandHandler = null;
      clearTransferRefreshGrace();
      publicGroundPileShimEvidence = [];
      gameViewSnapshot.mapRevision = 0;
    },
    clearSentInputs() { testSentInputs = []; testSentPayloads = []; testSentUiProtocolCommands = []; testSentUiProtocolAcks = []; pendingNativeUiCommands = new Map(); pendingNativeUiCommandBridgeOutcomes = new Map(); lastSentKey = { key: undefined, at: 0 }; },
    event: handleShimEvent,
    envelopedEvent: (event) => handleShimEvent(sharedModules.shimProtocol?.normalizeRawShimEvent ? sharedModules.shimProtocol.normalizeRawShimEvent(event) : event),
    messages: () => gameViewSnapshot.messages.slice(),
    shimEvents: () => { flushShimEvents(); return shimLines.map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean); },
    publicGroundPileShimEvidence: () => publicGroundPileShimEvidence.map((event) => JSON.parse(JSON.stringify(event))),
    sentInputs: () => testSentInputs.slice(),
    sentPayloads: () => testSentPayloads.map((payload) => ({ ...payload })),
    sentUiProtocolCommands: () => testSentUiProtocolCommands.map((command) => JSON.parse(JSON.stringify(command))),
    sentUiProtocolAcks: () => testSentUiProtocolAcks.map((event) => JSON.parse(JSON.stringify(event))),
    cancellationAcknowledgement: () => lastPromptCancellationAcknowledgement ? { ...lastPromptCancellationAcknowledgement } : null,
    cancellationPending: () => pendingPromptCancellation ? { ...pendingPromptCancellation } : null,
    cancellationDiagnostics: () => testPromptCancellationDiagnostics.map((entry) => ({ type: entry.type, payload: { ...entry.payload } })),
    clearActivePromptRequestOwnershipForTest() {
      omitNextPromptCancellationOwnershipForTest = true;
      return gameViewSnapshot.activePrompt ? { ...gameViewSnapshot.activePrompt, requestId: '', promptId: '' } : null;
    },
    nativeUiCommand(command) { return netHackAPI.uiCommand(command); },
    setUiCommandHandlerForTest(handler = null) { testUiCommandHandler = typeof handler === 'function' ? handler : null; return { active: Boolean(testUiCommandHandler) }; },
    nativeRawUiCommand(command) { return netHackAPI.shimInput({ type: 'ui-command', command }); },
    async recordAndSendNativeUiCommandForTest(command, source = 'test-ui-command') {
      const normalized = recordUiProtocolCommand(command, source);
      const sent = await Promise.resolve(netHackAPI.uiCommand(command)).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
      if (sent === false || sent?.ok === false) {
        const reason = sent?.reason || sent?.message || 'main process rejected native ui command';
        const blockerToken = sent?.blockerToken || 'blocked.public.tryInNetHack';
        createAndRecordCommandAck('command.rejected', command, {
          reason,
          blockerToken,
          supported: Boolean(sent?.supported),
          executionSource: 'native-ui-command',
          replayBehavior: 'preserved evidence only; no raw fallback input sent',
        }, source);
        showFailureNotice({ id: `test-directed-real-command:${command?.transactionId || command?.commandId || shimEventCount}`, dedupeKey: `command:${command?.transactionId || command?.commandId || shimEventCount}:rejected`, kind: blockerToken === 'blocked.input.staleRevision' ? 'stale-revision' : 'rejected', reason, blockerToken, transactionId: command?.transactionId || command?.commandId || '', surface: currentFailureSurface() });
      }
      return { sent, valid: Boolean(normalized?.valid), errors: normalized?.errors || [], commandId: command?.commandId || '' };
    },
    sendSemanticActionForTest(keys, action = {}, route = {}, options = {}) {
      return sendSemanticActionCommand(keys, action, {}, route, options);
    },
    helper: () => ({ hidden: directionHelper.hidden, bodyActive: document.body.classList.contains('direction-helper-active'), title: directionHelperTitle.textContent, text: directionHelper.innerText }),
    prompt: () => (gameViewSnapshot.activePrompt ? { ...gameViewSnapshot.activePrompt } : null),
    dialog: () => ({
      interactionOpen: interactionDialog.open,
      title: interactionTitle.textContent,
      prompt: interactionPrompt.textContent,
      context: interactionContext?.textContent || '',
      textEntry: !interactionTextRow.hidden,
      textLabel: interactionTextLabel.textContent,
      textValue: interactionText.value,
      feedback: interactionFeedback.textContent,
      selectAllVisible: !interactionSelectAll.hidden,
      clearVisible: !interactionClear.hidden,
      confirmText: interactionConfirm.textContent,
      options: Array.from(interactionOptions.querySelectorAll('.choice-button')).map((button) => ({ key: button.dataset.key, text: button.innerText, className: button.className, hidden: button.hidden })),
      panelControls: interactionPanelControls ? { hidden: interactionPanelControls.hidden, text: interactionPanelControls.innerText, buttons: Array.from(interactionPanelControls.querySelectorAll('button')).map((button) => ({ text: button.textContent, filter: button.dataset.panelFilter || button.dataset.objectFilter || '', pressed: button.getAttribute('aria-pressed') })) } : null,
      documentOpen: documentDialog.open,
      documentTitle: documentTitle.textContent,
      documentBody: documentBody.textContent,
    }),
    setText(value) { interactionText.value = String(value || ''); interactionText.dispatchEvent(new Event('input')); },
    presentFailureForTest(input = {}) { return showFailureNotice({ ...input, surface: Object.prototype.hasOwnProperty.call(input, 'surface') ? input.surface : currentFailureSurface() }); },
    failureState() {
      const surface = currentFailureSurface();
      const state = surface ? failureSurfaceState.get(surface) : null;
      return {
        surface: surface?.id || '',
        kind: state?.presentation?.kind || '',
        stableId: state?.preserved?.stableId || '',
        refreshRequired: surface?.dataset?.refreshRequired || '',
        refreshVisible: surface === interactionDialog ? Boolean(interactionRefresh && !interactionRefresh.hidden) : Boolean(surface?.querySelector?.('[data-transfer-refresh]:not([hidden])')),
        focusedPane: state?.preserved?.focusedPane || '',
        scroll: (state?.preserved?.lists || []).map((entry) => ({ key: entry.key, top: entry.top, stableId: entry.stableId, index: entry.index })),
        disabledStableIds: Array.from(surface?.querySelectorAll?.('[data-stable-id]:disabled') || []).map((node) => node.dataset.stableId),
        activeId: document.activeElement?.id || '',
        activeStableId: document.activeElement?.dataset?.stableId || '',
        sent: testSentInputs.join(''),
      };
    },
    refreshFailureForTest() { refreshFailedInteractionSurface(); return this.failureState(); },
    clearFailureForTest() { const surface = currentFailureSurface(); if (surface) clearFailureSurfaceLock(surface); actionableFailureHoldUntil = 0; actionableFailureNotice = null; uxNoticeService?.stateChanged?.(); return this.failureState(); },
    confirm() { interactionConfirm.click(); },
    cancel: cancelActiveInteraction,
    setRunning(running = true) {
      const isRunning = Boolean(running);
      if (isRunning) {
        if (startupChoiceDialog?.open) startupChoiceDialog.close('test-running');
        startupChoiceShown = true;
        if (characterDialog?.open) characterDialog.close('test-running');
        if (introDialog?.open) introDialog.close('test-running');
      }
      setRunningState({ running: isRunning, mode: 'test' });
    },
    statusHud: () => ({ text: statsPanel?.innerText || '', groups: Array.from(statsPanel?.querySelectorAll('.status-group') || []).map((group) => ({ label: group.querySelector('.status-group-label')?.textContent || '', text: group.innerText, fields: Array.from(group.querySelectorAll('.stat-chip')).map((chip) => ({ field: chip.dataset.statusField || '', label: chip.querySelector('span')?.textContent || '', value: chip.querySelector('strong')?.textContent || '', className: chip.className || '' })) })) }),
    setCursor(x = 10, y = 10) {
      processShimGameEvent({ name: 'shim_create_nhwindow', return: 1, windowType: 3 });
      processShimGameEvent({ name: 'shim_curs', window: 1, x: normalizeMapCoord(x, mapWidth), y: normalizeMapCoord(y, mapHeight) });
      renderGameGrid({ full: true });
      renderContextActionBar();
      return { ...gameViewSnapshot.cursor };
    },
    inventory: () => ({ revision: gameViewSnapshot.inventory?.revision || 0, items: (gameViewSnapshot.inventory?.orderedItems || []).map((item) => ({ objectId: item.objectId, inventoryLetter: item.inventoryLetter || '', displayName: item.displayName || '', known: item.known ? { ...item.known } : undefined, semanticName: item.semanticName, semanticAppearance: item.semanticAppearance, calledName: item.calledName, individualName: item.individualName, actionAffordances: Array.isArray(item.actionAffordances) ? item.actionAffordances.slice() : [] })), unpaidItemCount: (gameViewSnapshot.inventory?.orderedItems || []).filter((item) => item.actionAffordances?.includes('shop.unpaid')).reduce((total, item) => total + (Number.isSafeInteger(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1), 0) }),
    setAuthoritativeInventoryForTest(items = [], revision = 1) {
      const normalizedRevision = Number(revision) || 1;
      const publicItems = (Array.isArray(items) ? items : []).map((item) => {
        const inventoryLetter = item.inventoryLetter || sharedModules.inventorySnapshotAdapter?.selectorToLetter?.(item.selector) || '';
        return { ...item, selector: item.selector || inventoryLetter.charCodeAt(0), inventoryLetter, text: item.text || `${inventoryLetter ? `${inventoryLetter} - ` : ''}${item.displayName || item.semanticName || 'item'}` };
      });
      handleShimEvent({ name: 'shim_update_inventory', revision: normalizedRevision, inventoryRevision: normalizedRevision, equipmentRevision: Math.max(normalizedRevision, gameViewSnapshot.equipment?.revision || 0), reason: 'renderer test public inventory', items: publicItems });
      return { revision: gameViewSnapshot.inventory.revision, count: gameViewSnapshot.inventory.orderedItems.length };
    },
    equipmentSnapshot: () => ({ revision: gameViewSnapshot.equipment?.revision || 0, inventoryRevision: gameViewSnapshot.equipment?.inventoryRevision || 0, slots: (gameViewSnapshot.equipment?.orderedSlots || []).map((slot) => ({ slotId: slot.slotId, rendererSlotId: slot.rendererSlotId || '', label: slot.label || '', objectId: slot.objectId, publicStatus: slot.publicStatus, blockedBy: Array.isArray(slot.blockedBy) ? slot.blockedBy.slice() : [], item: slot.item ? { objectId: slot.item.objectId, inventoryLetter: slot.item.inventoryLetter || '', displayName: slot.item.displayName || '', known: slot.item.known ? { ...slot.item.known } : undefined, semanticName: slot.item.semanticName, semanticAppearance: slot.item.semanticAppearance, calledName: slot.item.calledName, individualName: slot.item.individualName } : null })) }),
    itemEquipment: () => itemEquipmentOwner?.snapshot?.() || null,
    groundSnapshots: () => ({ revision: gameViewSnapshot.groundPiles?.revision || 0, piles: Array.from(gameViewSnapshot.groundPiles?.pilesByCoord || []).map(([key, pile]) => ({ key, revision: pile.revision || 0, coord: { ...(pile.coord || {}) }, items: (pile.items || []).map((item) => ({ objectId: item.objectId, displayName: item.displayName || '', quantity: item.quantity, known: item.known ? { ...item.known } : undefined, semanticName: item.semanticName, semanticAppearance: item.semanticAppearance, semanticKnown: item.semanticKnown, objectClass: item.objectClass, actionAffordances: Array.isArray(item.actionAffordances) ? item.actionAffordances.slice() : undefined, location: item.location ? { ...item.location } : undefined })) })), pendingEvidence: gameViewSnapshot.pendingTransferEvidence.ground ? { transferId: gameViewSnapshot.pendingTransferEvidence.ground.transferId, direction: gameViewSnapshot.pendingTransferEvidence.ground.direction, coord: { ...gameViewSnapshot.pendingTransferEvidence.ground.coord }, delta: gameViewSnapshot.pendingTransferEvidence.ground.delta || null, attached: Boolean(gameViewSnapshot.pendingTransferEvidence.ground.attached) } : null }),
    setGroundPileSnapshotForTest(items = [], coord = groundPileCoordHere()) { return applyPublicGroundPileSnapshot(items, { layer: 'test' }, coord); },
    containerSnapshots: () => ({ revision: gameViewSnapshot.containerContents?.revision || 0, activeSessionId: gameViewSnapshot.containerContents?.activeSessionId || '', sessions: Array.from(gameViewSnapshot.containerContents?.sessionsById || []).map(([, session]) => ({ ...session, container: { ...(session.container || {}) } })), snapshots: Array.from(gameViewSnapshot.containerContents?.contentsBySessionId || []).map(([sessionId, snapshot]) => ({ sessionId, revision: snapshot.revision || 0, container: { ...(snapshot.container || {}) }, items: (snapshot.items || []).map((item) => ({ objectId: item.objectId, inventoryLetter: item.inventoryLetter || '', displayName: item.displayName || '', quantity: item.quantity, known: item.known ? { ...item.known } : undefined, semanticName: item.semanticName, semanticAppearance: item.semanticAppearance, location: item.location ? { ...item.location } : undefined })) })), pendingEvidence: gameViewSnapshot.pendingTransferEvidence.container ? { transferId: gameViewSnapshot.pendingTransferEvidence.container.transferId, direction: gameViewSnapshot.pendingTransferEvidence.container.direction, sessionId: gameViewSnapshot.pendingTransferEvidence.container.sessionId, delta: gameViewSnapshot.pendingTransferEvidence.container.delta || null } : null }),
    commandTransactions: summarizeCommandTransactions,
    transferTransactions: summarizeTransferTransactions,
    transferPanelCommandState: () => currentTransferCommandState(),
    clearLocalTransferPanelTransferForTest() {
      if (transferSession.snapshot().pending) dispatchTransferSessionEvent({ type: 'cancel', reason: 'test cleared pending transfer' });
      return this.transferPanelCommandState();
    },
    equipment: () => itemEquipmentOwner?.snapshot?.() || null,
    movement: () => ({ mode: movementMode, text: movementActions?.innerText || '', buttons: Array.from(movementActions?.querySelectorAll('button') || []).map((button) => ({ text: button.textContent, pressed: button.getAttribute('aria-pressed'), direction: button.dataset.moveDirection || '', mode: button.dataset.movementMode || '' })) }),
    contextActions: () => ({ text: contextActionBar?.innerText || '', buttons: Array.from(contextActionBar?.querySelectorAll('button') || []).map((button) => ({ id: button.dataset.contextActionId, text: button.textContent, className: button.className, title: button.title })) }),
    currentCell: () => ({ ...normalizeCell(currentCell()), groundLooksLikeContainer: currentGroundLooksLikeContainer(), visibleNonContainerGroundObject: currentMapCellHasVisibleNonContainerGroundObject(), groundTexts: publicGroundItemTextsHere(), visibleMessageGroundTexts: visibleMessageGroundTextDetailsHere() }),
    clickContextAction(idOrLabel) { const needle = String(idOrLabel || ''); const button = Array.from(contextActionBar?.querySelectorAll('button') || []).find((candidate) => candidate.dataset.contextActionId === needle || candidate.textContent === needle); button?.click(); return { clicked: Boolean(button), sent: testSentInputs.slice(), actions: this.contextActions() }; },
    target: () => ({ active: false, prompt: null, selection: null, controls: '', selectedCells: [], bodyActive: false, gridLabel: gameGrid.getAttribute('aria-label') }),
    context: () => (activeContextualPrompt ? { ...activeContextualPrompt } : null),
    pendingContainerUnlockOpen: () => (pendingContainerUnlockOpen ? { ...pendingContainerUnlockOpen } : null),
    setContainerStateForTest(state = null) {
      clearTransferRefreshGrace();
      const { leftItems = [], rightItems = [], ...presentationState } = state || {};
      transferPresentation = state ? presentationState : null;
      if (transferPresentation?.active) {
        dispatchTransferSessionEvent({
          type: 'open',
          kind: transferSessionKindForState(),
          route: presentationState.route || (presentationState.presentationMode === 'classic' ? 'classic' : 'direct'),
          sessionId: presentationState.transferSessionId || '',
          prompt: transferPresentation.prompt,
          groundCoord: groundPileCoordHere(),
          container: { publicId: presentationState.containerId ? `container-${presentationState.containerId}` : 'container', ...(Number.isInteger(presentationState.containerId) ? { objectId: presentationState.containerId } : {}), displayName: String(presentationState.prompt || 'container').replace(/^Open\s+/i, '') },
          leftRows: leftItems,
          rightRows: rightItems,
          loadedSides: transferPresentation.loadedSides,
          loadingSides: transferPresentation.loadingSides,
          loading: Boolean(transferPresentation.loadingSides?.left || transferPresentation.loadingSides?.right),
          feedback: transferPresentation.feedback,
        });
      } else {
        transferSession.dispatch({ type: 'reset' });
      }
      renderContainerTransferPanel();
      return this.container();
    },
    container: () => ({
      active: Boolean(transferPresentation?.active),
      extendedPromptSuppressionTokens: containerTransferExtendedPromptSuppressTokens.map((token) => ({ id: token.id, reason: token.reason, command: token.command, consumed: Boolean(token.consumed), expiresInMs: Math.max(0, Math.round(token.expiresAt - performance.now())) })),
      hidden: Boolean(containerTransferPanel?.hidden),
      text: containerTransferPanel?.innerText || '',
      status: transferSession.snapshot().status,
      left: Array.from(containerTransferPanel?.querySelectorAll('[data-container-pane="left"] .container-item-row') || []).map((row) => ({ selector: row.dataset.selector, text: row.innerText })),
      right: Array.from(containerTransferPanel?.querySelectorAll('[data-container-pane="right"] .container-item-row') || []).map((row) => ({ selector: row.dataset.selector, text: row.innerText })),
      menu: gameViewSnapshot.currentMenu ? { prompt: gameViewSnapshot.currentMenu.prompt || '', awaitingSelection: Boolean(gameViewSnapshot.currentMenu.awaitingSelection), how: gameViewSnapshot.currentMenu.how, items: (gameViewSnapshot.currentMenu.items || []).map((item) => ({ selector: item.selector ? String.fromCharCode(item.selector) : '', text: item.text || '' })) } : null,
      pendingTransfer: currentPendingContainerTransferSelection(),
      transferSessionId: transferPresentation?.transferSessionId || '',
      pendingTransferId: transferSession.snapshot().pending?.transferId || '',
      directTransferPendingId: transferSession.snapshot().pending?.route === 'direct' ? transferSession.snapshot().pending.transferId : '',
    }),
    transferContainerItem,
    refreshTransferPane: requestContainerPaneRefresh,
  };
  window.__nethackTooltipTest = {
    setCells(cells = []) {
      if (startupChoiceDialog?.open) startupChoiceDialog.close('tooltip-test');
      startupChoiceShown = true;
      publishTestMap(cells, { x: 0, y: 0 });
      renderGameGrid({ full: true });
      hideMapTooltip();
      return automationState();
    },
    tooltipInfoFor(x, y) { return mapTooltipInfoForCell(gameViewSnapshot.mapCells[y]?.[x], x, y); },
    showFor(x, y) {
      const cellEl = mapCellElements[y]?.[x];
      showMapTooltipForCell(cellEl);
      const rect = mapTooltip.getBoundingClientRect();
      const titleStyle = getComputedStyle(mapTooltipTitle);
      const descriptionStyle = getComputedStyle(mapTooltipDescription);
      return { hidden: mapTooltip.hidden, text: mapTooltip.innerText, title: mapTooltipTitle.textContent, description: mapTooltipDescription.textContent, contents: Array.from(mapTooltipContents?.querySelectorAll('li') || []).map((row) => ({ label: row.querySelector('.map-tooltip-content-label')?.textContent || '', kind: row.querySelector('.map-tooltip-content-kind')?.textContent || '' })), tooltipClass: mapTooltip.className || '', titleColor: titleStyle.color, descriptionColor: descriptionStyle.color, iconClass: mapTooltipIcon.className || '', iconImage: mapTooltipIcon.style.backgroundImage || '', assetId: mapTooltipIcon.dataset.tileId || '', rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }, viewport: { width: innerWidth, height: innerHeight } };
    },
    hide: hideMapTooltip,
  };
}

resetGameView();
setRunningState({ running: false });
if (isBrowserPreview) {
  const sample = [
    '       ----------        ',
    '       +.....`..|        ',
    '       |..{....f|        ',
    '       |....@.../        ',
    '       |........|        ',
    '       ----+-----        ',
    '           #             ',
    '           #             ',
    '          ---.--         ',
    '          |....|         ',
    '          |....|         ',
    '          ------         ',
  ];
  const previewCells = [];
  sample.forEach((line, y) => line.split('').forEach((ch, x) => previewCells.push({ x: x + 4, y: y + 2, ch, assetId: mappedAssetIdForCell({ ch }) })));
  publishTestMap(previewCells, { x: 17, y: 5 });
  renderGameGrid({ full: true });
}
runVersion();
showPlayerNotice({ id: 'startup:choose-path', kind: 'info', message: 'Choose how to begin', source: 'prompt', persistence: 'until-state-change' });
window.setTimeout(() => showStartupChoiceIfAppropriate(), 0);
