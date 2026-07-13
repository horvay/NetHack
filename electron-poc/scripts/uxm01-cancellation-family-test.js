const path = require('node:path');
const Harness = require('./lib/electron-test-harness.js');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.NH_UXM01_CANCEL_FAMILY_PORT || 20128);
const { waitFor } = Harness;

function assert(condition, message, detail) {
  if (!condition) throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
}

async function snapshot(page) {
  return page.evalCheckedValue(`(() => ({
    prompt: window.__nethackPromptTest.prompt(),
    dialog: window.__nethackPromptTest.dialog(),
    sent: window.__nethackPromptTest.sentInputs().join(''),
    payloads: window.__nethackPromptTest.sentPayloads(),
    pending: window.__nethackPromptTest.cancellationPending(),
    acknowledgement: window.__nethackPromptTest.cancellationAcknowledgement(),
    cancellationDiagnostics: window.__nethackPromptTest.cancellationDiagnostics(),
    openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
    activeId: document.activeElement?.id || '',
  }))()`);
}

async function setup(page, expression) {
  await page.evalCheckedValue(`(() => { const t=window.__nethackPromptTest; t.reset(); t.event=t.envelopedEvent; t.setRunning(true); ${expression}; t.clearSentInputs(); return true; })()`);
}

async function escape(page) {
  await page.pressKey('Escape');
  const escaped = await snapshot(page);
  assert(escaped.payloads.length === 1 && escaped.payloads[0].guiActionId === 'interaction.cancel', 'Escape must send one typed cancellation input', escaped);
  assert(escaped.pending != null, 'typed cancellation must await a bridge acknowledgement', escaped);
  return escaped;
}

async function acknowledge(page, expression) {
  await page.evalCheckedValue(`(() => { ${expression}; return true; })()`);
  const acknowledged = await waitFor(async () => (await snapshot(page)).acknowledgement || null, 3000).catch(() => null);
  return { acknowledged, settled: await snapshot(page) };
}

async function rejectAndProveStale(page, rejectedExpression, laterExpression) {
  await page.evalCheckedValue(`(() => { ${rejectedExpression}; return true; })()`);
  const rejected = await snapshot(page);
  assert(rejected.acknowledgement == null, 'unowned or mismatched answer must not acknowledge cancellation', rejected);
  assert(rejected.pending == null, 'unowned or mismatched answer must invalidate one-shot pending cancellation', rejected);
  assert(rejected.cancellationDiagnostics.length === 1, 'rejected answer must emit exactly one bounded cancellation diagnostic', rejected.cancellationDiagnostics);
  await page.evalCheckedValue(`(() => { ${laterExpression}; return true; })()`);
  const stale = await snapshot(page);
  assert(stale.acknowledgement == null && stale.pending == null, 'later answer must not satisfy invalidated cancellation state', stale);
  assert(stale.cancellationDiagnostics.length === 1, 'later stale answer must not emit another cancellation diagnostic', stale.cancellationDiagnostics);
  return { rejected, stale };
}

async function main() {
  const page = await Harness.createElectronBrowserDriver({ root, port, width: 1200, height: 800 });
  const results = { positive: {}, negative: {} };
  try {
    await page.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true });

    await setup(page, `t.event({name:'shim_yn_function',query:'Really step into that web?',choices:'yn',requestId:'cancel-web'});`);
    const ynSent = await escape(page);
    const ynAck = await acknowledge(page, `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'cancel-web',transactionId:'v1-transaction-cancel-web',inputTransactionId:'v1-transaction-cancel-web'})`);
    results.positive.yn = { sent: ynSent, ...ynAck };
    assert(ynSent.sent === 'n', 'y/n Escape must send canonical n once', results.positive.yn);
    assert(ynAck.acknowledged?.responseKey === 'n' && ynAck.acknowledged?.canonicalChoice, 'y/n exact request/key/transport must acknowledge', results.positive.yn);

    await setup(page, `t.event({name:'shim_yn_function',query:'Drink from the fountain?',choices:'ynq',requestId:'cancel-ynq'});`);
    const ynqSent = await escape(page);
    const ynqAck = await acknowledge(page, `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:113,requestId:'cancel-ynq',transactionId:'v1-transaction-cancel-ynq'})`);
    results.positive.ynq = { sent: ynqSent, ...ynqAck };
    assert(ynqSent.sent === 'q', 'ynq Escape must send canonical q once', results.positive.ynq);
    assert(ynqAck.acknowledged?.responseKey === 'q' && ynqAck.acknowledged?.canonicalChoice, 'ynq exact request/key/transport must acknowledge', results.positive.ynq);

    await setup(page, `t.event({name:'shim_getlin',query:'What do you want to engrave?',requestId:'cancel-text'});`);
    const lineSent = await escape(page);
    const lineAck = await acknowledge(page, `window.__nethackPromptTest.event({name:'bridge_line_answer',value:'',requestId:'cancel-text',transactionId:'v1-transaction-cancel-text'})`);
    results.positive.line = { sent: lineSent, ...lineAck };
    assert(lineSent.sent === '\u001b', 'line-input Escape remains raw Escape exactly once', results.positive.line);
    assert(lineAck.acknowledged?.promptFamily === 'line-input-cancel' && lineAck.acknowledged?.transportEvent === 'bridge_line_answer', 'line exact request/key/transport must acknowledge', results.positive.line);

    await setup(page, `t.event({name:'shim_start_menu',window:700}); t.event({name:'shim_add_menu',window:700,selector:0,text:'Tip: Escape closes this information.'}); t.event({name:'shim_end_menu',window:700,prompt:'Tip'}); t.event({name:'shim_select_menu',window:700,how:0});`);
    const menuBefore = await snapshot(page);
    const menuRequestId = menuBefore.prompt?.requestId;
    assert(Boolean(menuRequestId), 'menu fixture must expose request ownership', menuBefore);
    const menuSent = await escape(page);
    const menuAck = await acknowledge(page, `(() => { const p=window.__nethackPromptTest.cancellationPending(); window.__nethackPromptTest.event({name:'bridge_menu_answer',window:p.window,menuId:p.menuId,requestId:p.requestId,menuRequestId:p.requestId,transactionId:p.transactionId,inputTransactionId:p.transactionId,lifecycleRevision:p.lifecycleRevision,lifecycle:'answered',menuPurpose:p.menuPurpose,owner:{kind:p.ownerKind,window:p.window},requestSource:{layer:p.requestSourceLayer,window:p.window},activeRequestMatch:true,inputMatchesMenuTransaction:true,return:0,selector:0,selectors:''}); })()`);
    results.positive.menu = { sent: menuSent, ...menuAck };
    assert(menuSent.sent === '\u001b', 'menu Escape remains raw Escape exactly once', results.positive.menu);
    assert(/^menu-(?:cancel|close)$/.test(menuAck.acknowledged?.promptFamily || '') && menuAck.acknowledged?.transportEvent === 'bridge_menu_answer', 'menu exact request/key/transport must acknowledge', results.positive.menu);

    await setup(page, `t.event({name:'shim_get_ext_cmd',requestId:'cancel-extcmd'});`);
    const extcmdSent = await escape(page);
    const extcmdAck = await acknowledge(page, `window.__nethackPromptTest.event({name:'bridge_extcmd_answer',return:-1,value:'',requestId:'cancel-extcmd',transactionId:'v1-transaction-cancel-extcmd'})`);
    results.positive.extcmd = { sent: extcmdSent, ...extcmdAck };
    assert(extcmdSent.sent === '\u001b', 'extended-command Escape remains raw Escape exactly once', results.positive.extcmd);
    assert(extcmdAck.acknowledged?.promptFamily === 'extended-command-cancel' && extcmdAck.acknowledged?.transportEvent === 'bridge_extcmd_answer', 'extended-command exact request/key/transport must acknowledge', results.positive.extcmd);

    // Missing expected ownership is fail-closed even if transport and key match.
    await setup(page, `t.event({name:'shim_yn_function',query:'Legacy confirmation?',choices:'yn',requestId:'will-be-removed'}); t.clearActivePromptRequestOwnershipForTest();`);
    const noExpectedSent = await escape(page);
    assert(noExpectedSent.pending?.requestId === '', 'legacy prompt fixture must lack expected request ownership', noExpectedSent);
    results.negative.noExpectedRequest = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'unowned-answer'})`,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'unowned-answer'})`);

    await setup(page, `t.event({name:'shim_yn_function',query:'Missing answer owner?',choices:'yn',requestId:'missing-answer-owner'});`);
    await escape(page);
    results.negative.noActualRequest = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110})`,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'missing-answer-owner'})`);

    await setup(page, `t.event({name:'shim_yn_function',query:'Foreign answer owner?',choices:'yn',requestId:'owned-request'});`);
    await escape(page);
    results.negative.foreignRequest = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'foreign-request'})`,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'owned-request'})`);

    await setup(page, `t.event({name:'shim_yn_function',query:'Conflicting owner alias?',choices:'yn',requestId:'owned-alias'});`);
    await escape(page);
    results.negative.conflictingRequestAliases = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'owned-alias',promptId:'foreign-alias'})`,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'owned-alias',promptId:'owned-alias'})`);

    await setup(page, `t.event({name:'shim_yn_function',query:'Wrong transport?',choices:'yn',requestId:'wrong-transport'});`);
    await escape(page);
    results.negative.wrongTransport = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_line_answer',value:'n',requestId:'wrong-transport'})`,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'wrong-transport'})`);

    await setup(page, `t.event({name:'shim_yn_function',query:'Wrong response?',choices:'yn',requestId:'wrong-key'});`);
    await escape(page);
    results.negative.wrongKey = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:121,requestId:'wrong-key'})`,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'wrong-key'})`);

    await setup(page, `t.event({name:'shim_getlin',query:'Missing line response?',requestId:'missing-line-response'});`);
    await escape(page);
    results.negative.missingLineResponse = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_line_answer',requestId:'missing-line-response'})`,
      `window.__nethackPromptTest.event({name:'bridge_line_answer',value:'',requestId:'missing-line-response'})`);

    await setup(page, `t.event({name:'shim_start_menu',window:701,requestId:'missing-menu-response'}); t.event({name:'shim_add_menu',window:701,selector:0,text:'Tip'}); t.event({name:'shim_end_menu',window:701,prompt:'Tip'}); t.event({name:'shim_select_menu',window:701,how:0});`);
    await escape(page);
    results.negative.missingMenuResponse = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_menu_answer',window:701,requestId:'missing-menu-response'})`,
      `window.__nethackPromptTest.event({name:'bridge_menu_answer',window:701,return:0,requestId:'missing-menu-response'})`);

    await setup(page, `t.event({name:'shim_start_menu',window:702,requestId:'malformed-menu-response'}); t.event({name:'shim_add_menu',window:702,selector:0,text:'Tip'}); t.event({name:'shim_end_menu',window:702,prompt:'Tip'}); t.event({name:'shim_select_menu',window:702,how:0});`);
    await escape(page);
    results.negative.malformedMenuResponse = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_menu_answer',window:702,return:'0',requestId:'malformed-menu-response'})`,
      `window.__nethackPromptTest.event({name:'bridge_menu_answer',window:702,return:0,requestId:'malformed-menu-response'})`);

    await setup(page, `t.event({name:'shim_start_menu',window:703,requestId:'conflicting-menu-response'}); t.event({name:'shim_add_menu',window:703,selector:0,text:'Tip'}); t.event({name:'shim_end_menu',window:703,prompt:'Tip'}); t.event({name:'shim_select_menu',window:703,how:0});`);
    await escape(page);
    results.negative.conflictingMenuResponse = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_menu_answer',window:703,return:0,selector:97,selectors:'a',requestId:'conflicting-menu-response'})`,
      `window.__nethackPromptTest.event({name:'bridge_menu_answer',window:703,return:0,selector:0,selectors:'',requestId:'conflicting-menu-response'})`);

    await setup(page, `t.event({name:'shim_start_menu',window:704,requestId:'conflicting-menu-answer'}); t.event({name:'shim_add_menu',window:704,selector:0,text:'Tip'}); t.event({name:'shim_end_menu',window:704,prompt:'Tip'}); t.event({name:'shim_select_menu',window:704,how:0});`);
    await escape(page);
    results.negative.conflictingMenuAnswerAlias = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_menu_answer',window:704,return:0,selector:0,selectors:'',answer:'a',requestId:'conflicting-menu-answer'})`,
      `window.__nethackPromptTest.event({name:'bridge_menu_answer',window:704,return:0,selector:0,selectors:'',requestId:'conflicting-menu-answer'})`);

    await setup(page, `t.event({name:'shim_get_ext_cmd',requestId:'wrong-extcmd-response'});`);
    await escape(page);
    results.negative.wrongExtendedCommandResponse = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_extcmd_answer',return:1,value:'pray',requestId:'wrong-extcmd-response'})`,
      `window.__nethackPromptTest.event({name:'bridge_extcmd_answer',return:-1,value:'',requestId:'wrong-extcmd-response'})`);

    await setup(page, `t.event({name:'shim_get_ext_cmd',requestId:'conflicting-extcmd-response'});`);
    await escape(page);
    results.negative.conflictingExtendedCommandResponse = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_extcmd_answer',return:1,value:'',requestId:'conflicting-extcmd-response'})`,
      `window.__nethackPromptTest.event({name:'bridge_extcmd_answer',return:-1,value:'',requestId:'conflicting-extcmd-response'})`);

    await setup(page, `t.event({name:'shim_get_ext_cmd',requestId:'conflicting-extcmd-command'});`);
    await escape(page);
    results.negative.conflictingExtendedCommandAlias = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_extcmd_answer',return:-1,value:'',command:'pray',requestId:'conflicting-extcmd-command'})`,
      `window.__nethackPromptTest.event({name:'bridge_extcmd_answer',return:-1,value:'',requestId:'conflicting-extcmd-command'})`);

    await setup(page, `t.event({name:'shim_yn_function',query:'Wrong transaction?',choices:'yn',requestId:'wrong-transaction',transactionId:'expected-transaction'});`);
    await escape(page);
    results.negative.wrongTransaction = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'wrong-transaction',transactionId:'foreign-transaction'})`,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'wrong-transaction',transactionId:'expected-transaction'})`);

    await setup(page, `t.event({name:'shim_yn_function',query:'Conflicting transaction?',choices:'yn',requestId:'conflicting-transaction',transactionId:'expected-transaction'});`);
    await escape(page);
    results.negative.conflictingTransactions = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'conflicting-transaction',transactionId:'expected-transaction',inputTransactionId:'foreign-transaction'})`,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'conflicting-transaction',transactionId:'expected-transaction'})`);

    await setup(page, `t.event({name:'shim_yn_function',query:'Empty transaction?',choices:'yn',requestId:'empty-transaction',transactionId:'expected-transaction'});`);
    await escape(page);
    results.negative.emptyTransaction = await rejectAndProveStale(page,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'empty-transaction',transactionId:''})`,
      `window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'empty-transaction',transactionId:'expected-transaction'})`);

    await setup(page, `t.event({name:'shim_yn_function',query:'Reset pending?',choices:'yn',requestId:'reset-owner'});`);
    await escape(page);
    await page.evalCheckedValue(`(() => { window.__nethackPromptTest.reset(); window.__nethackPromptTest.event({name:'bridge_prompt_answer',keycode:110,requestId:'reset-owner'}); return true; })()`);
    results.negative.staleAfterReset = await snapshot(page);
    assert(results.negative.staleAfterReset.acknowledgement == null && results.negative.staleAfterReset.pending == null, 'answer after pending cancellation reset must stay stale', results.negative.staleAfterReset);

    await setup(page, `t.event({name:'shim_yn_function',query:'In what direction?',choices:'hjklyubn.\\u001b',requestId:'cancel-direction'}); document.getElementById('game-grid').focus();`);
    await page.pressKey('Escape');
    results.direction = await snapshot(page);
    assert(results.direction.sent === '\u001b', 'direction Escape remains core-owned raw Escape exactly once', results.direction);
    assert(!results.direction.openDialogs.includes('interaction-dialog'), 'direction prompt does not gain a coercing renderer modal', results.direction);

    console.log(JSON.stringify({
      checks: {
        positiveExactYn: true,
        positiveExactYnq: true,
        positiveExactMenu: true,
        positiveExactLine: true,
        positiveExactExtendedCommand: true,
        noExpectedRequestRejected: true,
        noActualRequestRejected: true,
        foreignRequestRejected: true,
        conflictingRequestAliasesRejected: true,
        wrongTransportRejected: true,
        wrongKeyRejected: true,
        missingResponseDataRejected: true,
        malformedResponseDataRejected: true,
        conflictingMenuResponseRejected: true,
        conflictingMenuAnswerAliasRejected: true,
        wrongExtendedCommandResponseRejected: true,
        conflictingExtendedCommandResponseRejected: true,
        conflictingExtendedCommandAliasRejected: true,
        wrongTransactionRejectedWhenExposed: true,
        conflictingTransactionMetadataRejected: true,
        emptyExposedTransactionRejected: true,
        bothMatchingTransactionFieldsAccepted: Boolean(results.positive.yn.acknowledged),
        exactlyOneBoundedDiagnosticPerRejection: true,
        legacyMissingTransactionAccepted: Boolean(results.positive.ynq.acknowledged && results.positive.menu.acknowledged && results.positive.line.acknowledged && results.positive.extcmd.acknowledged),
        staleAfterInvalidationRejected: true,
        staleAfterResetRejected: true,
        directionRawEscape: true,
      },
      results,
    }, null, 2));
  } finally {
    await page.close().catch(() => {});
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
