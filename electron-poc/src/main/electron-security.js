function configureCommandLine({ app, env = process.env, isPackaged } = {}) {
  if (!app?.commandLine) return;
  const packaged = isPackaged ?? Boolean(app.isPackaged);
  const cdpPort = env.AI_ORG_ELECTRON_CDP_PORT || env.PI_ELECTRON_CDP_PORT;
  if (cdpPort && !packaged) {
    app.commandLine.appendSwitch('remote-debugging-port', String(cdpPort));
    app.commandLine.appendSwitch('remote-allow-origins', 'http://127.0.0.1:*');
  }
  app.commandLine.appendSwitch('disable-gpu');
}

function hardenWindow(win, { allowFileNavigation = false } = {}) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (allowFileNavigation && String(url || '').startsWith('file://')) return;
    event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
}

function secureWebPreferences({ preload }) {
  return Object.freeze({
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  });
}

module.exports = { configureCommandLine, hardenWindow, secureWebPreferences };
