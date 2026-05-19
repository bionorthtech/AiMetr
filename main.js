'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const { store, getProviderConfig, setProviderConfig, getHistory } = require('./src/store');
const poller = require('./src/poller');
const tracker = require('./src/tracker');
const ble     = require('./src/ble');
const secrets = require('./src/secrets');

const isDev = process.env.NODE_ENV === 'development';

const PROVIDER_IDS = ['claude', 'openai', 'deepseek', 'ollama', 'lmstudio'];

let dashboardWin = null;
let petWin       = null;
let tray         = null;

function syncProviderEnabled() {
  PROVIDER_IDS.forEach(id => {
    const enabled = store.get(`providers.${id}.enabled`, true);
    poller.setEnabled(id, enabled !== false);
  });
}

function getPollIntervalMs() {
  const sec = store.get('ui.pollInterval', 30) || 30;
  const clamped = Math.max(10, Math.min(300, sec));
  return isDev ? Math.min(clamped * 1000, 10000) : clamped * 1000;
}

function restartPoller() {
  poller.stop();
  syncProviderEnabled();
  poller.start(getPollIntervalMs());
}

// ─── Window Creation ────────────────────────────────────────────────────────

function createDashboard() {
  const bounds = store.get('ui.dashboardBounds', { width: 1050, height: 720 });

  dashboardWin = new BrowserWindow({
    width:  bounds.width  || 1050,
    height: bounds.height || 720,
    x: bounds.x,
    y: bounds.y,
    minWidth:  900,
    minHeight: 600,
    title: 'AIMetr',
    show: false,
    backgroundColor: '#1a1a2e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  dashboardWin.loadFile(path.join(__dirname, 'ui', 'dashboard', 'index.html'));

  dashboardWin.webContents.once('did-finish-load', () => {
    if (!store.get('ui.hasCompletedSetup', false)) {
      dashboardWin.webContents.send('open-settings');
    }
  });

  dashboardWin.once('ready-to-show', () => {
    dashboardWin.show();
    if (isDev) dashboardWin.webContents.openDevTools();
  });

  dashboardWin.on('close', e => {
    if (process.platform === 'darwin' && !app.isQuitting) {
      e.preventDefault();
      store.set('ui.dashboardBounds', dashboardWin.getBounds());
      dashboardWin.hide();
    } else {
      store.set('ui.dashboardBounds', dashboardWin.getBounds());
    }
  });

  dashboardWin.on('resize', () => {
    store.set('ui.dashboardBounds', dashboardWin.getBounds());
  });
}

function createPetWindow() {
  const pos = store.get('pet.position', { x: 100, y: 100 });

  petWin = new BrowserWindow({
    width:  160,
    height: 200,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    focusable: true, // need focus for right-click menu
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  petWin.loadFile(path.join(__dirname, 'ui', 'pet', 'pet.html'));

  if (process.platform === 'darwin') {
    petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    petWin.setAlwaysOnTop(true, 'screen-saver');
  }

  if (!store.get('pet.enabled', true)) petWin.hide();
}

// ─── Tray ────────────────────────────────────────────────────────────────────

function createTray() {
  // Use a simple placeholder icon (white square) if no icon file exists
  const iconPath = path.join(__dirname, 'assets', 'icons', 'tray.png');
  const icon = require('fs').existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon.isEmpty() ? buildFallbackIcon() : icon);
  tray.setToolTip('AIMetr — AI Usage Monitor');
  updateTrayMenu({});

  tray.on('click', () => {
    if (dashboardWin) {
      dashboardWin.isVisible() ? dashboardWin.focus() : dashboardWin.show();
    }
  });
}

function buildFallbackIcon() {
  // 16×16 blue square as fallback tray icon
  const img = nativeImage.createFromBuffer(
    Buffer.from([
      0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, // PNG header
      // Minimal 1x1 blue PNG – will be scaled by the OS
      0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
      0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
      0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53,
      0xde,0x00,0x00,0x00,0x0c,0x49,0x44,0x41,
      0x54,0x08,0xd7,0x63,0x60,0x60,0xf8,0x0f,
      0x00,0x00,0x01,0x01,0x00,0x05,0x18,0xd8,
      0x4b,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,
      0x44,0xae,0x42,0x60,0x82,
    ])
  );
  return img;
}

function updateTrayMenu(state) {
  const providerItems = PROVIDER_IDS
    .filter(id => store.get(`providers.${id}.enabled`, true) !== false)
    .map(id => {
      const s = state[id];
      return {
        label: s
          ? `${id}: ${s.connected ? `${s.session?.pct || 0}%` : '⚠ offline'}`
          : `${id}: loading…`,
        enabled: false,
      };
    });

  const menu = Menu.buildFromTemplate([
    { label: 'AIMetr', enabled: false },
    { type: 'separator' },
    ...providerItems,
    { type: 'separator' },
    {
      label: 'Show Dashboard',
      click: () => {
        if (dashboardWin) { dashboardWin.show(); dashboardWin.focus(); }
        else createDashboard();
      },
    },
    {
      label: store.get('pet.enabled', true) ? 'Hide Pet' : 'Show Pet',
      click: () => togglePet(),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
}

function togglePet() {
  if (!petWin) return;
  const enabled = !store.get('pet.enabled', true);
  store.set('pet.enabled', enabled);
  if (enabled) petWin.show();
  else petWin.hide();
  updateTrayMenu(poller.getState());
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  ipcMain.handle('get-all-usage', () => poller.getState());

  ipcMain.handle('get-tasks', () => tracker.getTasks());

  ipcMain.handle('get-config', () => {
    const cfg = store.store;
    const masked = JSON.parse(JSON.stringify(cfg));
    if (!masked.providers) masked.providers = {};

    ['claude', 'openai', 'deepseek'].forEach(id => {
      if (!masked.providers[id]) masked.providers[id] = {};
      // Never expose raw keys to the renderer
      delete masked.providers[id].apiKey;

      if (secrets.hasStoredKey(id)) {
        masked.providers[id].hasStoredKey = true;
        masked.providers[id].apiKey = '••••••••••••';
      }
    });
    return masked;
  });

  ipcMain.handle('set-config', (_event, patch) => {
    // Only allow setting known top-level provider config keys
    if (patch.providers) {
      Object.entries(patch.providers).forEach(([id, data]) => {
        setProviderConfig(id, data);
      });
    }
    if (patch.pet)    store.set('pet', { ...store.get('pet', {}), ...patch.pet });
    if (patch.ui)     store.set('ui',  { ...store.get('ui',  {}), ...patch.ui  });
    syncProviderEnabled();
    if (patch.providers || patch.ui) restartPoller();
    return true;
  });

  ipcMain.handle('validate-credentials', async (_event, { providerId, creds }) => {
    const providers = {
      claude:   require('./src/providers/claude'),
      openai:   require('./src/providers/openai'),
      deepseek: require('./src/providers/deepseek'),
      ollama:   require('./src/providers/ollama'),
      lmstudio: require('./src/providers/lmstudio'),
    };
    const p = providers[providerId];
    if (!p) return false;
    return p.validateCredentials(creds);
  });

  ipcMain.handle('force-refresh', () => poller.forceRefresh());

  ipcMain.handle('get-history', (_event, { providerId, hoursBack }) => {
    return getHistory(providerId, hoursBack || 24);
  });

  ipcMain.handle('toggle-pet', () => togglePet());

  ipcMain.on('pet-drag', (_event, pos) => {
    if (petWin && pos) {
      petWin.setPosition(Math.round(pos.x), Math.round(pos.y));
      store.set('pet.position', { x: Math.round(pos.x), y: Math.round(pos.y) });
    }
  });

  ipcMain.on('show-pet-menu', (_event) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open Dashboard', click: () => {
        if (dashboardWin) { dashboardWin.show(); dashboardWin.focus(); }
      }},
      { label: 'Hide Pet', click: () => togglePet() },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    menu.popup({ window: petWin });
  });
}

// ─── Broadcast helpers ───────────────────────────────────────────────────────

function broadcast(channel, data) {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  registerIpcHandlers();
  secrets.migratePlaintextKeys();
  createDashboard();
  createPetWindow();
  createTray();

  tracker.start();

  // Push task updates to dashboard on a 10-second interval
  setInterval(() => {
    broadcast('task-update', tracker.getTasks());
  }, 10000);

  // Wire poller events → broadcast
  poller.on('usage-update', state => {
    broadcast('usage-update', state);
    updateTrayMenu(state);

    // Forward full multi-provider state to BLE device if connected
    if (ble.isAvailable()) ble.sendUsageUpdate(state, tracker.getTasks());
  });

  poller.on('pet-state', petState => {
    broadcast('pet-state', petState);
  });

  syncProviderEnabled();
  poller.start(getPollIntervalMs());

  // Start BLE if available
  if (ble.isAvailable()) {
    ble.start(
      () => console.log('[BLE] Connected to Clawdmeter device'),
      () => console.log('[BLE] Disconnected from Clawdmeter device')
    );
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createDashboard();
  } else if (dashboardWin) {
    dashboardWin.show();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  tracker.stop();
  poller.stop();
  if (dashboardWin) store.set('ui.dashboardBounds', dashboardWin.getBounds());
});
