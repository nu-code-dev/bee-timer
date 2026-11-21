'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const os = require('node:os');
const { app, BrowserWindow, ipcMain, Notification, screen, shell, clipboard } = require('electron');
const { DEFAULTS, loadConfig, saveConfig } = require('./config-store');

// --- Hyprland / Linux windowing strategy -------------------------------------
// Always-on-top on Wayland has no toplevel protocol; running as an XWayland
// client lets Hyprland honor _NET_WM_STATE_ABOVE. Opt into native Wayland with
// BEE_TIMER_OZONE=wayland if you prefer (top-most then depends on compositor).
try {
  app.commandLine.appendSwitch('class', 'bee-timer');
  const ozoneHint = process.env.BEE_TIMER_OZONE || (process.env.DISPLAY ? 'x11' : 'wayland');
  app.commandLine.appendSwitch('ozone-platform-hint', ozoneHint === 'wayland' ? 'wayland' : 'x11');
} catch {
  /* noop */
}
app.setName('BEE Timer');

const MODE_SIZES = {
  wizard: { width: 660, height: 880 },
  widget: { width: 400, height: 320 },
  settings: { width: 480, height: 740 },
};

/** @type {BrowserWindow | null} */
let mainWindow = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  const config = loadConfig();
  const size = MODE_SIZES.widget;
  const opts = {
    width: size.width,
    height: size.height,
    minWidth: 360,
    minHeight: 220,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: config.window.alwaysOnTop,
    title: 'BEE Timer',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  };

  mainWindow = new BrowserWindow(opts);
  mainWindow.setAlwaysOnTop(config.window.alwaysOnTop, 'screen-saver');

  if (Number.isFinite(config.window.x) && Number.isFinite(config.window.y)) {
    mainWindow.setPosition(config.window.x, config.window.y);
  } else {
    const { workArea } = screen.getPrimaryDisplay();
    mainWindow.setPosition(
      Math.round(workArea.x + workArea.width - size.width - 24),
      Math.round(workArea.y + 24),
    );
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (!config.onboarded) setMode('wizard');
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function setMode(mode) {
  if (!mainWindow) return null;
  const size = MODE_SIZES[mode] || MODE_SIZES.widget;
  mainWindow.setResizable(true);
  mainWindow.setSize(size.width, size.height, false);
  if (mode === 'wizard') mainWindow.center();
  return size;
}


// --- desktop integration helpers --------------------------------------------

const NOTIFIER_NAMES = [
  'mako', 'dunst', 'swaync', 'fnott', 'notify-osd', 'xfce4-notifyd',
  'gnome-shell', 'plasmashell', 'hyprnotification',
];

function findProcess(names) {
  return new Promise((resolve) => {
    execFile('ps', ['-eo', 'comm='], { timeout: 1500 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const running = new Set(
        stdout.split('\n').map((line) => line.trim().toLowerCase()).filter(Boolean),
      );
      resolve(names.find((name) => running.has(name)) || null);
    });
  });
}

function dbusNotificationsAvailable() {
  return new Promise((resolve) => {
    execFile(
      'dbus-send',
      [
        '--session', '--print-reply', '--dest=org.freedesktop.DBus',
        '/org/freedesktop/DBus', 'org.freedesktop.DBus.NameHasOwner',
        'string:org.freedesktop.Notifications',
      ],
      { timeout: 1500 },
      (err, stdout) => resolve(!err && /boolean\s+true/.test(stdout || '')),
    );
  });
}

async function notifyStatus() {
  const [processName, dbus] = await Promise.all([
    findProcess(NOTIFIER_NAMES),
    dbusNotificationsAvailable(),
  ]);
  return {
    available: Boolean(processName) || dbus,
    daemon: processName || (dbus ? 'notification daemon' : null),
    dbus,
  };
}

// --- IPC ---------------------------------------------------------------------

ipcMain.handle('config:get', () => loadConfig());

ipcMain.handle('config:save', (_event, patch) => {
  const current = loadConfig();
  const merged = { ...current, ...(patch || {}) };
  if (patch && patch.features) {
    merged.features = { ...current.features };
    for (const [key, value] of Object.entries(patch.features)) {
      merged.features[key] = { ...current.features[key], ...value };
    }
  }
  if (patch && patch.appearance) merged.appearance = { ...current.appearance, ...patch.appearance };
  if (patch && patch.window) merged.window = { ...current.window, ...patch.window };
  return saveConfig(merged);
});

ipcMain.handle('config:defaults', () => DEFAULTS);

ipcMain.handle('window:set-mode', (_event, mode) => setMode(mode));

ipcMain.handle('window:set-always-on-top', (_event, value) => {
  if (!mainWindow) return false;
  mainWindow.setAlwaysOnTop(Boolean(value), 'screen-saver');
  return mainWindow.isAlwaysOnTop();
});

ipcMain.handle('window:chaos-move', (_event, marginPx = 40) => {
  if (!mainWindow) return null;
  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const wa = display.workArea;
  const margin = Math.max(0, Math.min(Number(marginPx) || 40, 200));
  const maxX = Math.max(wa.x, wa.x + wa.width - bounds.width - margin);
  const maxY = Math.max(wa.y, wa.y + wa.height - bounds.height - margin);
  const pos = {
    x: Math.round(wa.x + margin + Math.random() * Math.max(1, maxX - wa.x - margin)),
    y: Math.round(wa.y + margin + Math.random() * Math.max(1, maxY - wa.y - margin)),
  };
  mainWindow.setPosition(pos.x, pos.y, false);
  return pos;
});

ipcMain.handle('notify:show', (_event, { title, body } = {}) => {
  try {
    if (!Notification.isSupported()) return false;
    const n = new Notification({
      title: String(title || 'BEE Timer'),
      body: String(body || ''),
      silent: false,
      icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    });
    n.show();
    return true;
  } catch (err) {
    console.error('[bee-timer] notification failed:', err.message);
    return false;
  }
});


ipcMain.handle('app:integration-info', async () => {
  const home = os.homedir();
  const hyprDir = path.join(home, '.config', 'hypr');
  const luaConfig = path.join(hyprDir, 'hyprland.lua');
  const confConfig = path.join(hyprDir, 'hyprland.conf');
  const desktopEntry = path.join(home, '.local', 'share', 'applications', 'bee-timer.desktop');
  const launcher = path.join(home, '.local', 'bin', 'bee-timer');
  const installedApp = path.join(home, '.local', 'opt', 'bee-timer', 'app');
  return {
    platform: process.platform,
    execPath: process.execPath,
    appImage: process.env.APPIMAGE || null,
    userDataPath: app.getPath('userData'),
    home,
    notification: await notifyStatus(),
    hyprland: {
      luaConfig: fs.existsSync(luaConfig) ? luaConfig : null,
      confConfig: fs.existsSync(confConfig) ? confConfig : null,
      running: Boolean(process.env.HYPRLAND_INSTANCE_SIGNATURE),
    },
    files: {
      launcher: fs.existsSync(launcher) ? launcher : null,
      installedApp: fs.existsSync(installedApp) ? installedApp : null,
      desktopEntry: fs.existsSync(desktopEntry) ? desktopEntry : null,
    },
  };
});

ipcMain.handle('clipboard:write', (_event, text) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});

ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('app:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('app:version', () => app.getVersion());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
