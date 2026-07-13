const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.NH_UXM05_EVIDENCE_DIR || path.join(root, 'test-output', 'uxm05-real-electron');
const playground = path.join(evidenceRoot, 'isolated-playground');
const port = Number(process.env.NH_UXM05_CDP_PORT || 19905);
const profiles = Object.freeze([
  Object.freeze({ id: '1360x920', windowWidth: 1360, windowHeight: 920, cssWidth: 1360, cssHeight: 920, dpr: 1, zoom: 100 }),
  Object.freeze({ id: '960x720', windowWidth: 960, windowHeight: 720, cssWidth: 960, cssHeight: 720, dpr: 1, zoom: 100 }),
  Object.freeze({ id: '200pct', windowWidth: 1360, windowHeight: 920, cssWidth: 680, cssHeight: 460, dpr: 2, zoom: 200 }),
]);

function preparePlayground() {
  fs.rmSync(evidenceRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(playground, 'save'), { recursive: true });
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license']) fs.copyFileSync(path.join(root, '..', 'playground', name), path.join(playground, name));
  for (const name of ['perm', 'record', 'logfile', 'xlogfile', 'livelog', 'paniclog']) fs.writeFileSync(path.join(playground, name), '');
}
function assert(name, condition, detail = '') { if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function setupCompositeExpression() {
  return `(() => {
    const icon=(name)=>new URL('../assets/tiles/generated/objects-inventory/'+name+'.png',location.href).href;
    const items=[
      {objectId:501,inventoryLetter:'a',displayName:'a blessed +1 bow named Oath of the Northern Watch',quantity:1,glyphChar:41,wornMask:256,semanticKnown:true,semanticName:'bow',publicClass:'weapon',filterGroups:['equipped','weapons'],equipmentSlots:['mainHand','offHand'],knownFields:{beatitude:'blessed',enchantment:1},ownership:{state:'owned'},actionAffordances:['wield','wielded','engrave'] ,iconSrc:icon('bow')},
      {objectId:502,inventoryLetter:'b',displayName:'an uncursed cloak',quantity:1,glyphChar:91,wornMask:2,semanticKnown:true,semanticName:'cloak',publicClass:'armor',filterGroups:['equipped','armor'],equipmentSlots:['armor.cloak'],knownFields:{beatitude:'uncursed',enchantment:0},ownership:{state:'owned'},actionAffordances:['takeOff'],iconSrc:icon('cloak')},
      {objectId:503,inventoryLetter:'c',displayName:'an uncursed +1 chain mail',quantity:1,glyphChar:91,wornMask:1,semanticKnown:true,semanticName:'chain mail',publicClass:'armor',filterGroups:['equipped','armor'],equipmentSlots:['armor.body'],knownFields:{beatitude:'uncursed',enchantment:1},ownership:{state:'owned'},actionAffordances:['takeOff'],iconSrc:icon('chain-mail')},
      {objectId:504,inventoryLetter:'d',displayName:'a T-shirt called first layer',calledName:'first layer',quantity:1,glyphChar:91,wornMask:64,semanticKnown:true,semanticName:'T-shirt',known:{naming:true},publicClass:'armor',filterGroups:['equipped','armor'],equipmentSlots:['armor.shirt'],knownFields:{},ownership:{state:'owned'},actionAffordances:['takeOff'],iconSrc:new URL('../assets/tiles/generated/full-source-objects/t-shirt.png',location.href).href},
      {objectId:505,inventoryLetter:'e',displayName:'a ring of protection',quantity:1,glyphChar:61,wornMask:131072,semanticKnown:true,semanticName:'ring of protection',publicClass:'ring',filterGroups:['equipped','magic'],equipmentSlots:['ring.left','ring.right'],knownFields:{enchantment:1},ownership:{state:'owned'},actionAffordances:['remove']},
      {objectId:506,inventoryLetter:'f',displayName:'a ring of adornment',quantity:1,glyphChar:61,wornMask:262144,semanticKnown:true,semanticName:'ring of adornment',publicClass:'ring',filterGroups:['equipped','magic'],equipmentSlots:['ring.left','ring.right'],knownFields:{enchantment:2},ownership:{state:'owned'},actionAffordances:['remove']},
      {objectId:507,inventoryLetter:'g',displayName:'17 uncursed arrows',quantity:17,glyphChar:41,wornMask:512,semanticKnown:true,semanticName:'arrow',publicClass:'weapon',filterGroups:['equipped','weapons'],equipmentSlots:['mainHand','offHand','quiver'],knownFields:{beatitude:'uncursed'},ownership:{state:'owned'},actionAffordances:['quiver','fire','throw']},
      {objectId:508,inventoryLetter:'h',displayName:'a blessed rustproof +3 long sword of the Last Queen of the Dungeons of Doom',individualName:'Dawnbringer',quantity:1,glyphChar:41,semanticKnown:true,semanticName:'long sword',known:{naming:true},publicClass:'weapon',filterGroups:['weapons'],equipmentSlots:['mainHand','offHand'],knownFields:{beatitude:'blessed',enchantment:3},ownership:{state:'owned'},actionAffordances:['wield','engrave','drop'],iconSrc:icon('long-sword')},
      {objectId:509,inventoryLetter:'i',displayName:'an uncursed milky potion called sunrise',calledName:'sunrise',quantity:1,glyphChar:33,semanticKnown:false,semanticAppearance:'milky potion',known:{identity:false,appearance:true,quantity:true,naming:true},publicClass:'potion',filterGroups:['consumables','magic'],equipmentSlots:[],knownFields:{beatitude:'uncursed'},ownership:{state:'owned'},actionAffordances:['quaff','drop'],iconSrc:icon('potion-class-icon')},
      {objectId:510,inventoryLetter:'j',displayName:'an unpaid scroll labeled XOR OTA',quantity:1,glyphChar:63,semanticKnown:false,semanticAppearance:'scroll labeled XOR OTA',known:{identity:false,appearance:true,quantity:true},publicClass:'scroll',filterGroups:['consumables','magic'],equipmentSlots:[],knownFields:{},ownership:{state:'unpaid',price:120,currency:'zm'},actionAffordances:['read','pay','drop'],iconSrc:icon('scroll-class-icon')},
      {objectId:511,inventoryLetter:'k',displayName:'a wand of digging',quantity:1,glyphChar:47,semanticKnown:true,semanticName:'wand of digging',publicClass:'wand',filterGroups:['magic'],equipmentSlots:[],knownFields:{charges:3},ownership:{state:'owned'},actionAffordances:['zap','apply','engrave','drop'],iconSrc:icon('wand-class-icon')}
    ];
    const byId=new Map(items.map(item=>[item.objectId,item]));
    const iconById=new Map(items.map(item=>[item.objectId,item.iconSrc||'']));
    const slot=(slotId,objectId,extra={})=>({slotId,objectId,item:objectId?byId.get(objectId):undefined,publicStatus:objectId?'equipped':(extra.blockedBy?.length?'blocked':'empty'),blockedBy:extra.blockedBy||[],actions:extra.actions||[]});
    const slots=[slot('armor.helm'),slot('eyes'),slot('amulet'),slot('armor.cloak',502),slot('armor.body',503),slot('armor.shirt',504),slot('armor.gloves'),slot('armor.boots'),slot('armor.shield'),slot('mainHand',501),slot('offHand',null,{blockedBy:['blocked.hands.twoHandedWeapon']}),slot('ring.left',505),slot('ring.right',506),slot('quiver',507)];
    window.__uxm05Dispatches=[];
    const controller=window.NetHackUxEquipmentScreen.controller;
    controller.open({documentRoot:document,mount:document.getElementById('ux-items-root'),inventory:{revision:90,orderedItems:items},equipment:{revision:90,inventoryRevision:90,orderedSlots:slots},avatar:{src:new URL('../assets/tiles/generated/player-combo-avatars/human-valkyrie-female-avatar.png',location.href).href,alt:'Valkyrie full character'},iconResolver:(item)=>iconById.get(item.objectId)||'',onDispatch:({action,item})=>new Promise(resolve=>{window.__uxm05Dispatches.push({actionId:action.id,stableId:item.stableId});setTimeout(()=>resolve(true),180);})});
    return controller.snapshot();
  })()`;
}
function emptyExpression() {
  return `(() => { const slots=window.NetHackUxEquipmentScreen.GROUPS.flatMap(group=>group.slots).map(slotId=>({slotId,publicStatus:'empty',blockedBy:[],actions:[]})); window.NetHackUxEquipmentScreen.controller.update({inventory:{revision:91,orderedItems:[]},equipment:{revision:91,inventoryRevision:91,orderedSlots:slots}}); document.querySelector('[data-item-tab="inventory"]')?.click(); return window.NetHackUxEquipmentScreen.controller.snapshot(); })()`;
}
function largeExpression() {
  return `(() => { const classes=['weapon','armor','food','potion','scroll','spellbook','wand','ring','amulet','tool','gem','coin']; const groups={weapon:['weapons'],armor:['armor'],food:['consumables'],potion:['consumables','magic'],scroll:['consumables','magic'],spellbook:['magic'],wand:['magic'],ring:['magic'],amulet:['magic'],tool:[],gem:[],coin:[]}; const glyph={weapon:41,armor:91,food:37,potion:33,scroll:63,spellbook:43,wand:47,ring:61,amulet:34,tool:40,gem:42,coin:36}; const rows=Array.from({length:120},(_,index)=>{const publicClass=classes[index%classes.length];return {objectId:9000+index,inventoryLetter:String.fromCharCode(33+(index%90)),displayName:(index+1)+' representative carried item with distinguishing archive suffix '+String(index+1).padStart(3,'0'),quantity:(index%7)+1,glyphChar:glyph[publicClass],semanticKnown:index%5!==0,semanticAppearance:index%5===0?'unidentified appearance':'',publicClass,filterGroups:groups[publicClass],equipmentSlots:[],knownFields:{},ownership:{state:'owned'},actionAffordances:['inspect']};}); window.NetHackUxEquipmentScreen.controller.update({inventory:{revision:92,orderedItems:rows}}); document.querySelector('[data-item-tab="inventory"]')?.click(); return window.NetHackUxEquipmentScreen.controller.snapshot(); })()`;
}
function layoutExpression() {
  return `(() => {
    const root=document.getElementById('ux-items-root'), safe=root.querySelector('.uxm-character-safe-area'), image=root.querySelector('.uxm-full-character img'), content=root.querySelector('.uxm-items-content');
    const rect=(el)=>{const r=el?.getBoundingClientRect();return r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null;};
    const overlaps=(a,b)=>a&&b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    const groups=Array.from(root.querySelectorAll('.uxm-slot-group')).map(el=>({id:el.dataset.group,box:rect(el),text:el.innerText}));
    const safeBox=rect(safe), imageBox=rect(image), workspace=rect(root.querySelector('.uxm-items-workspace'));
    const rows=Array.from(root.querySelectorAll('.uxm-item-row')).map(el=>{const name=el.querySelector('.uxm-item-name'),style=getComputedStyle(name);return {text:name?.textContent||'',lineClamp:style.webkitLineClamp,nameClipped:Boolean(name&&(name.scrollHeight>name.clientHeight+1||name.scrollWidth>name.clientWidth+1)),box:rect(el),nameBox:rect(name),rowText:el.innerText};});
    const actions=Array.from(root.querySelectorAll('.uxm-detail-actions button')).map(el=>({text:el.innerText,disabled:el.disabled,box:rect(el)}));
    const detailTitle=root.querySelector('.uxm-inventory-details .uxm-detail-title');
    return {snapshot:window.NetHackUxEquipmentScreen.controller.snapshot(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},workspace,safeBox,imageBox,contentBox:rect(content),groups,groupsOverlapSafe:groups.some(group=>overlaps(group.box,safeBox)),groupsOverlapEachOther:groups.some((group,index)=>groups.slice(index+1).some(other=>overlaps(group.box,other.box))),rows:rows.slice(0,130),actions,detailTitle:detailTitle?.textContent||'',detailTitleClipped:Boolean(detailTitle&&(detailTitle.scrollHeight>detailTitle.clientHeight+1||detailTitle.scrollWidth>detailTitle.clientWidth+1)),bodyHorizontal:document.documentElement.scrollWidth>document.documentElement.clientWidth,rootHorizontal:root.scrollWidth>root.clientWidth,figureShare:safeBox&&content? safeBox.height/Math.max(1,content.clientHeight):0,contextBox:rect(root.querySelector('.uxm-item-context-menu')),activeText:document.activeElement?.innerText||document.activeElement?.value||'',dispatches:window.__uxm05Dispatches||[]};
  })()`;
}

async function applyProfile(page, profile) {
  await page.send('Emulation.clearDeviceMetricsOverride');
  const nativeProfile = await page.evalCheckedValue(`window.netHackPOC.setTestCaptureProfile(${JSON.stringify({ width: profile.windowWidth, height: profile.windowHeight, zoomPercent: profile.zoom })})`, { awaitPromise: true });
  assert(`${profile.id} native BrowserWindow capture profile applied`, nativeProfile?.ok, JSON.stringify(nativeProfile));
  const applied = await page.evalCheckedValue(`(async () => {
    const root=document.getElementById('ux-items-root');
    root.removeAttribute('style');
    document.documentElement.style.removeProperty('font-size');
    window.scrollTo(0,0);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {innerWidth,innerHeight,dpr:devicePixelRatio,physicalWidth:Math.round(innerWidth*devicePixelRatio),physicalHeight:Math.round(innerHeight*devicePixelRatio),fontSize:getComputedStyle(document.documentElement).fontSize};
  })()`, { awaitPromise: true });
  return { ...applied, nativeProfile };
}

function requiredLandmarks(id) {
  const base = [['workspace-topbar', '.uxm-items-topbar'], ['workspace-title', '#uxm-items-title'], ['close', '.uxm-items-close']];
  if (id.includes('equipment') || id.startsWith('real-scenario')) return [...base, ['equipment-heading', '.uxm-equipment-heading'], ['character-art', '.uxm-full-character'], ['paper-doll-stage', '.uxm-paper-doll-stage']];
  if (id.includes('context-menu')) return [...base, ['inventory-list', '.uxm-inventory-list-wrap'], ['selected-row', '[data-stable-id="object:509"]'], ['context-menu', '.uxm-item-context-menu']];
  if (id.includes('actions')) return [...base, ['tabs', '.uxm-items-tabs'], ['details', '.uxm-inventory-details'], ['actions', '.uxm-inventory-pane .uxm-detail-actions']];
  if (id.includes('empty')) return [...base, ['inventory-tools', '.uxm-inventory-tools'], ['filters', '.uxm-item-filters'], ['empty-state', '.uxm-item-empty']];
  return [...base, ['inventory-tools', '.uxm-inventory-tools'], ['search', '.uxm-item-search'], ['filters', '.uxm-item-filters'], ['inventory-list', '.uxm-inventory-list-wrap']];
}

async function settledLandmarks(page, id) {
  const selectors = requiredLandmarks(id);
  return page.evalCheckedValue(`(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    const images=Array.from(document.images);
    await Promise.all(images.map(image=>image.complete ? image.decode?.().catch(()=>{}) : new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});})));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const selectors=${JSON.stringify(selectors)};
    const regions=selectors.map(([id,selector])=>{const element=document.querySelector(selector);const rect=element?.getBoundingClientRect();const style=element?getComputedStyle(element):null;return {id,selector,text:(element?.innerText||element?.value||'').trim().slice(0,200),box:rect?{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height}:null,visible:Boolean(rect&&rect.width>=8&&rect.height>=8&&rect.bottom>0&&rect.right>0&&rect.top<innerHeight&&rect.left<innerWidth&&style?.display!=='none'&&style?.visibility!=='hidden')};});
    return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},regions,allImagesComplete:images.every(image=>image.complete&&image.naturalWidth>0)};
  })()`, { awaitPromise: true });
}

async function capture(page, qc, id, profile, state) {
  const landmarks = await settledLandmarks(page, id);
  assert(`${id} images are fully decoded before native capture`, landmarks.allImagesComplete, JSON.stringify(landmarks));
  for (const region of landmarks.regions) assert(`${id} required landmark ${region.id} is visibly laid out`, region.visible, JSON.stringify(region));
  const native = await page.evalCheckedValue(`window.netHackPOC.captureTestScreenshot(${JSON.stringify(id)})`, { awaitPromise: true });
  assert(`${id} uses native settled Electron capture`, native?.ok && native.method === 'BrowserWindow.webContents.capturePage', JSON.stringify(native));
  const canonicalRaw = qc.rawPath(id);
  fs.copyFileSync(native.path, canonicalRaw);
  const canonicalMetadata = Harness.screenshotQc.imageMetadata(canonicalRaw);
  assert(`${id} canonical raw preserves native capture dimensions`, canonicalMetadata.width === native.width && canonicalMetadata.height === native.height, JSON.stringify({ native, canonicalMetadata }));
  const sx = canonicalMetadata.width / landmarks.viewport.width;
  const sy = canonicalMetadata.height / landmarks.viewport.height;
  assert(`${id} native capture has one consistent CSS-to-pixel scale`, Math.abs(sx - sy) < 0.001, JSON.stringify({ canonicalMetadata, viewport: landmarks.viewport, sx, sy }));
  const paintedRegions = landmarks.regions.map((region) => ({ id: region.id, box: { left: region.box.left * sx, top: region.box.top * sy, right: region.box.right * sx, bottom: region.box.bottom * sy } }));
  const paint = Harness.screenshotQc.paintedRegionStats(canonicalRaw, paintedRegions);
  for (const region of paint) {
    assert(`${id} required landmark ${region.id} occupies a nontrivial native-painted region`, region.width >= 8 && region.height >= 8 && region.uniqueColors >= 4 && region.nearBlackRatio < 0.98, JSON.stringify(region));
  }
  const recorded = qc.recordCapture(id, canonicalRaw, {
    viewSafeFormat: 'PNG',
    viewSafeScale: 0.5,
    viewport: { width: landmarks.viewport.width, height: landmarks.viewport.height, devicePixelRatio: sx, cssWidth: landmarks.viewport.width, cssHeight: landmarks.viewport.height, actualDevicePixelRatio: landmarks.viewport.dpr, zoomPercent: profile.zoom },
    state,
    captureMethod: `${native.method}; lossless native PNG copied byte-for-byte as the canonical accepted raw frame`,
    captureSource: Harness.screenshotQc.fileRecord(native.path),
  });
  return { recorded, landmarks, paint, native };
}

async function main() {
  preparePlayground();
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: path.join(evidenceRoot, 'screenshots') });
  const driver = await Harness.createElectronBrowserDriver({
    root,
    port,
    width: 1360,
    height: 920,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_ELECTRON_WINDOW_CONTENT_SIZE: '1',
      NH_TEST_SCENARIO_ID: 'identity/valkyrie-equipped-inventory',
      NH_TEST_PLAYGROUND: playground,
      NH_DIAGNOSTIC_LOG_DIR: path.join(evidenceRoot, 'diagnostics'),
      NH_TEST_CAPTURE_DIR: path.join(evidenceRoot, 'screenshots', 'native-captures'),
      NETHACK_SEED: '50520260711',
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
  });
  const page = driver.page;
  const result = { port, evidenceRoot, playground, profiles: {}, semantics: {}, interactions: {}, captures: {} };
  try {
    await driver.waitForRendererReady({ startButton: true });
    await driver.startDefaultGame({ playerName: `UXM05${Date.now().toString(36).slice(-5)}` });
    await driver.dismissIntroDialogs();
    await page.waitForCheckedValue("document.getElementById('shim-output')?.dataset?.seen?.includes('bridge_test_scenario_loaded')", 15000);
    await page.waitForCheckedValue("document.getElementById('intro-dialog')?.open", 2500).catch(() => false);
    if (await page.evalCheckedValue("Boolean(document.getElementById('intro-dialog')?.open)")) await page.click('#intro-continue');
    await page.waitForCheckedValue("!document.getElementById('intro-dialog')?.open", 5000);
    await page.evalCheckedValue("document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs(); true");
    await page.click('#inventory-equipment-button');
    await page.waitForCheckedValue("window.NetHackUxRuntime.runtime.latestPublicState()?.snapshot?.game?.inventory?.orderedItems?.length >= 5", 10000);
    assert('visible Inventory / Equipment control used authoritative real-game inventory state', await page.evalCheckedValue("window.NetHackUxRuntime.runtime.latestPublicState().snapshot.game.inventory.orderedItems.length >= 5"));
    const actualProtocol = await page.evalCheckedValue(`(() => { const game=window.NetHackUxRuntime.runtime.latestPublicState().snapshot.game; return {inventoryCount:game.inventory.orderedItems.length,slotCount:game.equipment.orderedSlots.length,unknownIdentityLeak:game.inventory.orderedItems.some(item=>item.semanticKnown===false&&item.semanticName),itemFields:game.inventory.orderedItems.map(item=>({name:item.displayName,publicClass:item.publicClass,filterGroups:item.filterGroups,knownFields:item.knownFields,ownership:item.ownership,equipmentSlots:item.equipmentSlots}))}; })()`);
    assert('real native inventory carries slot 1 fields', actualProtocol.inventoryCount >= 5 && actualProtocol.itemFields.every((item) => item.publicClass && Array.isArray(item.filterGroups) && (item.knownFields == null || typeof item.knownFields === 'object') && item.ownership), JSON.stringify(actualProtocol));
    assert('real native unknown identities remain omitted', !actualProtocol.unknownIdentityLeak, JSON.stringify(actualProtocol));
    await page.evalCheckedValue("window.__nethackPromptTest.prompt() || document.getElementById('interaction-dialog')?.open ? (window.__nethackPromptTest.cancel(), true) : true");
    await page.waitForCheckedValue("!document.getElementById('interaction-dialog')?.open", 8000).catch(() => true);
    const actualOpen = await page.evalCheckedValue(`(() => { const game=window.NetHackUxRuntime.runtime.latestPublicState().snapshot.game; return window.NetHackUxEquipmentScreen.controller.open({documentRoot:document,mount:document.getElementById('ux-items-root'),inventory:game.inventory,equipment:game.equipment,avatar:{src:new URL('../assets/tiles/generated/player-combo-avatars/human-valkyrie-female-avatar.png',location.href).href,alt:'Valkyrie full character'},onDispatch:()=>true}).snapshot(); })()`);
    assert('real scenario candidate workspace opens', actualOpen.open && actualOpen.inventoryCount >= 5, JSON.stringify(actualOpen));
    result.realScenarioProfile = await applyProfile(page, profiles[0]);
    result.captures['real-scenario-loaded-1360x920'] = await capture(page, qc, 'real-scenario-loaded-1360x920', profiles[0], 'real identity/valkyrie-equipped-inventory after actual i command');
    result.actualProtocol = actualProtocol;
    result.actualLoadedLayout = await page.evalCheckedValue(layoutExpression());
    const windowClose = await page.evalCheckedValue("window.NetHackUxEquipmentScreen.controller.close()");
    assert('candidate close restores one layer', windowClose === true);
    await page.evalCheckedValue("window.NetHackUxEquipmentScreen.controller.destroy(); true");

    for (const profile of profiles) {
      const appliedProfile = await applyProfile(page, profile);
      await page.evalCheckedValue(setupCompositeExpression());
      await new Promise((resolve) => setTimeout(resolve, 120));
      const compactApplied = await page.evalCheckedValue("getComputedStyle(document.querySelector('.uxm-items-tabs')).display !== 'none'");
      if (profile.id === '1360x920') assert('full profile uses full layout', !compactApplied, JSON.stringify(appliedProfile));
      else assert(`${profile.id} uses compact structural layout`, compactApplied, JSON.stringify(appliedProfile));
      if (profile.zoom === 200) assert('200 percent profile uses Electron native zoom factor 2', appliedProfile.nativeProfile.zoomFactor === 2, JSON.stringify(appliedProfile));
      const equipmentLayout = await page.evalCheckedValue(layoutExpression());
      assert(`${profile.id} has no horizontal overflow`, !equipmentLayout.bodyHorizontal && !equipmentLayout.rootHorizontal && !equipmentLayout.snapshot.horizontalOverflow, JSON.stringify(equipmentLayout));
      assert(`${profile.id} callouts never overlap the character-safe area`, !equipmentLayout.groupsOverlapSafe, JSON.stringify(equipmentLayout.groups));
      assert(`${profile.id} callouts never overlap each other`, !equipmentLayout.groupsOverlapEachOther, JSON.stringify(equipmentLayout.groups));
      assert(`${profile.id} full character has visible area`, equipmentLayout.imageBox?.width > 80 && equipmentLayout.imageBox?.height * equipmentLayout.viewport.dpr > 200, JSON.stringify(equipmentLayout.imageBox));
      if (profile.id !== '1360x920') assert(`${profile.id} figure is leading and substantial`, equipmentLayout.figureShare >= 0.35, String(equipmentLayout.figureShare));
      result.captures[`${profile.id}-equipment-composite`] = await capture(page, qc, `${profile.id}-equipment-composite`, profile, 'layered armor, two rings, two-handed offhand blocker, prominent full character');

      await page.evalCheckedValue("document.querySelector('[data-item-tab=\"inventory\"]')?.click(); true");
      await page.waitForCheckedValue("document.querySelector('.uxm-inventory-pane') && getComputedStyle(document.querySelector('.uxm-inventory-pane')).display !== 'none'");
      await page.evalCheckedValue(`(() => {
        document.querySelector('[data-stable-id="object:508"]')?.click();
        const wrap=document.querySelector('.uxm-inventory-list-wrap');
        const row=document.querySelector('[data-stable-id="object:508"]');
        if (wrap&&row) wrap.scrollTop=Math.max(0,row.offsetTop-wrap.offsetTop-8);
        const content=document.querySelector('.uxm-items-content'); if(content) content.scrollTop=0;
        return true;
      })()`);
      const beforeSelectDispatch = await page.evalCheckedValue("window.__uxm05Dispatches.length");
      await page.pressKey('Enter', '');
      const afterEnterDispatch = await page.evalCheckedValue("window.__uxm05Dispatches.length");
      assert(`${profile.id} click and Enter select only`, beforeSelectDispatch === 0 && afterEnterDispatch === 0);
      const inventoryLayout = await page.evalCheckedValue(layoutExpression());
      assert(`${profile.id} long distinguishing name including Dawnbringer is complete and visibly unclipped`, inventoryLayout.rows.some((row) => row.text.includes('Dawnbringer') && row.text.includes('Last Queen of the Dungeons of Doom') && !row.nameClipped), JSON.stringify(inventoryLayout.rows.map((row) => ({text:row.text,nameClipped:row.nameClipped,nameBox:row.nameBox}))));
      assert(`${profile.id} called-name suffix remains visibly complete`, inventoryLayout.rows.some((row) => row.text.includes('T-shirt called first layer') && !row.nameClipped), JSON.stringify(inventoryLayout.rows));
      assert(`${profile.id} rows use at most two lines`, inventoryLayout.rows.every((row) => row.lineClamp === '2'));
      assert(`${profile.id} details preserve the complete selected name`, inventoryLayout.detailTitle.includes('Dawnbringer') && inventoryLayout.detailTitle.includes('Last Queen of the Dungeons of Doom') && !inventoryLayout.detailTitleClipped, JSON.stringify({ title: inventoryLayout.detailTitle, clipped: inventoryLayout.detailTitleClipped }));
      assert(`${profile.id} selected details expose actions`, inventoryLayout.actions.length > 0, JSON.stringify(inventoryLayout.actions));
      result.captures[`${profile.id}-inventory-details`] = await capture(page, qc, `${profile.id}-inventory-details`, profile, 'loaded, long-name, unidentified, unpaid shop ownership, filters, and selected details');
      if (profile.id !== '1360x920') {
        await page.evalCheckedValue("document.querySelector('.uxm-inventory-details')?.scrollIntoView({block:'end'}); true");
        await new Promise((resolve) => setTimeout(resolve, 80));
        const visibleActions = await page.evalCheckedValue("Array.from(document.querySelectorAll('.uxm-inventory-details .uxm-detail-actions button')).filter(button=>{const r=button.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}).map(button=>button.innerText)");
        assert(`${profile.id} explicit actions are reachable without horizontal scrolling`, visibleActions.length > 0, JSON.stringify(visibleActions));
        result.captures[`${profile.id}-inventory-actions`] = await capture(page, qc, `${profile.id}-inventory-actions`, profile, 'selected-item known details and explicit named actions reached by vertical scrolling');
      }

      if (profile.id === '1360x920') {
        await page.evalCheckedValue(`(() => { const row=document.querySelector('[data-stable-id="object:509"]'); const rect=row.getBoundingClientRect(); row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:rect.left+16,clientY:rect.top+16,button:2})); return true; })()`);
        await page.waitForCheckedValue("!!document.querySelector('.uxm-item-context-menu')");
        const context = await page.evalCheckedValue(layoutExpression());
        const pointerContextLabels = await page.evalCheckedValue("Array.from(document.querySelectorAll('.uxm-item-context-menu button')).map(button=>button.innerText)");
        assert('right-click context menu is bounded', context.contextBox.left >= 0 && context.contextBox.top >= 0 && context.contextBox.right <= context.viewport.width && context.contextBox.bottom <= context.viewport.height, JSON.stringify(context.contextBox));
        result.captures['1360x920-bounded-context-menu'] = await capture(page, qc, '1360x920-bounded-context-menu', profile, 'right-click action menu for unidentified item');
        await page.pressKey('Escape', '');
        assert('first Escape closes only context menu', await page.evalCheckedValue("!document.querySelector('.uxm-item-context-menu') && !document.getElementById('ux-items-root').hidden"));
        await page.evalCheckedValue("document.querySelector('[data-stable-id=\"object:509\"]').focus(); true");
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F10', code: 'F10', modifiers: 8, windowsVirtualKeyCode: 121, nativeVirtualKeyCode: 121 });
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F10', code: 'F10', modifiers: 8, windowsVirtualKeyCode: 121, nativeVirtualKeyCode: 121 });
        assert('Shift+F10 opens the same bounded context menu', await page.waitForCheckedValue("!!document.querySelector('.uxm-item-context-menu')"));
        const keyboardContextLabels = await page.evalCheckedValue("Array.from(document.querySelectorAll('.uxm-item-context-menu button')).map(button=>button.innerText)");
        assert('right-click and Shift+F10 expose identical actions', JSON.stringify(pointerContextLabels) === JSON.stringify(keyboardContextLabels), JSON.stringify({ pointerContextLabels, keyboardContextLabels }));
        result.interactions.contextActionLabels = pointerContextLabels;
        await page.pressKey('Escape', '');
      }

      await page.evalCheckedValue(emptyExpression());
      await page.evalCheckedValue("document.querySelector('.uxm-items-content').scrollTop=0; true");
      const emptyLayout = await page.evalCheckedValue(layoutExpression());
      assert(`${profile.id} empty state is explicit`, await page.evalCheckedValue("/inventory is empty/i.test(document.querySelector('.uxm-item-empty')?.textContent || '')"));
      assert(`${profile.id} empty has no horizontal overflow`, !emptyLayout.bodyHorizontal && !emptyLayout.rootHorizontal);
      result.captures[`${profile.id}-inventory-empty`] = await capture(page, qc, `${profile.id}-inventory-empty`, profile, 'authoritative empty inventory state');

      await page.evalCheckedValue(largeExpression());
      await page.evalCheckedValue("document.querySelector('.uxm-items-content').scrollTop=0; document.querySelector('.uxm-inventory-list-wrap').scrollTop=0; true");
      const largeLayout = await page.evalCheckedValue(layoutExpression());
      assert(`${profile.id} large inventory keeps 120 rows`, largeLayout.snapshot.inventoryCount === 120 && largeLayout.rows.length === 120, JSON.stringify(largeLayout.snapshot));
      assert(`${profile.id} large inventory has no horizontal overflow`, !largeLayout.bodyHorizontal && !largeLayout.rootHorizontal);
      result.captures[`${profile.id}-inventory-120-rows`] = await capture(page, qc, `${profile.id}-inventory-120-rows`, profile, 'large 120-row presentation contract and scroll region');
      result.profiles[profile.id] = { appliedProfile, equipmentLayout, inventoryLayout, emptyLayout, largeLayout };
      await page.evalCheckedValue("window.NetHackUxEquipmentScreen.controller.close()");
    }

    await applyProfile(page, profiles[0]);
    await page.evalCheckedValue("document.getElementById('game-grid').focus(); true");
    await page.evalCheckedValue(setupCompositeExpression());
    await page.evalCheckedValue("document.querySelector('[data-stable-id=\"object:508\"]')?.click(); true");
    const beforeImplicit = await page.evalCheckedValue("window.__uxm05Dispatches.length");
    const longRowBox = await page.visibleBox('[data-stable-id="object:508"]');
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: longRowBox.x, y: longRowBox.y, button: 'left', clickCount: 2 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: longRowBox.x, y: longRowBox.y, button: 'left', clickCount: 2 });
    await page.pressKey('h', 'h');
    const afterImplicit = await page.evalCheckedValue("window.__uxm05Dispatches.length");
    assert('double-click and selector acceleration select without dispatch', beforeImplicit === 0 && afterImplicit === 0);
    const beforeExplicit = await page.evalCheckedValue("window.__uxm05Dispatches.length");
    await page.click('.uxm-inventory-details .uxm-detail-actions button[data-action-id]:not([disabled])');
    await new Promise((resolve) => setTimeout(resolve, 30));
    const pendingDisabled = await page.evalCheckedValue("Array.from(document.querySelectorAll('.uxm-detail-actions button')).every(button=>button.disabled)");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const afterExplicit = await page.evalCheckedValue("window.__uxm05Dispatches.length");
    assert('explicit named action dispatches once and pending locks duplicates', beforeExplicit === 0 && pendingDisabled && afterExplicit === 1, JSON.stringify({ beforeExplicit, pendingDisabled, afterExplicit }));
    await page.pressKey('Escape', '');
    const closedFocus = await page.evalCheckedValue("({hidden:document.getElementById('ux-items-root').hidden, activeId:document.activeElement?.id||''})");
    assert('workspace Escape closes one layer and restores its invoker', closedFocus.hidden && closedFocus.activeId === 'game-grid', JSON.stringify(closedFocus));
    result.interactions = { ...result.interactions, clickEnterSelectOnly: true, selectorSelectionTurnless: true, rightClickShiftF10Parity: true, oneEscapeOneLayer: true, workspaceEscapeFocusReturn: closedFocus, explicitDispatchCount: afterExplicit, pendingDuplicateLock: pendingDisabled };
    result.semantics = { actualCommand: 'i opened the authoritative core inventory menu before the candidate was mounted', presentationSelectionTurnsSpent: 0, candidateDispatchProof: 'test integration callback invoked exactly once; UXM-09 owns production renderer wiring', cancellation: 'Escape cancelled the core inventory menu, then one Escape closed context only and the next closes workspace', publicSources: ['shim_update_inventory', 'inventory.snapshot', 'equipment.snapshot', 'public item slot 1 fields'], deliberatelyOmitted: ['unknown semanticName', 'hidden object type', 'unemitted weight', 'damage and AC predictions', 'best-item recommendations'] };
    result.controllerDiagnostics = await page.evalCheckedValue("window.NetHackUxEquipmentScreen.controller.diagnostics()");
    result.runtimeDiagnostics = await page.evalCheckedValue("window.NetHackUxRuntime.runtime.diagnostics().filter(entry=>entry.detail?.domainId==='items'||String(entry.type).includes('subscriber'))");
    const output = driver.output();
    fs.writeFileSync(path.join(evidenceRoot, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(evidenceRoot, 'electron-stderr.log'), output.stderr);
    fs.writeFileSync(path.join(evidenceRoot, 'uxm05-evidence.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`UXM-05 real Electron evidence captured at ${evidenceRoot}`);
    console.log(`QC manifest pending manual inspection: ${qc.manifestFile}`);
  } finally {
    await driver.close().catch(() => {});
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
