/**
 * Logiciel de bureau « Vœux enseignants ».
 *
 * - Démarre le serveur de l'application sur ce poste (port 4310), accessible aussi depuis le réseau
 *   local : les enseignants ouvrent leur lien personnel depuis leur navigateur pendant que le logiciel tourne.
 * - Données : dossier utilisateur du système (jamais dans le dossier d'installation), avec une sauvegarde
 *   automatique à chaque lancement (10 dernières conservées).
 * - Mises à jour : téléchargées automatiquement depuis les « Releases » GitHub du projet,
 *   installées au prochain redémarrage.
 */
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { pathToFileURL } = require('node:url');

const PREFERRED_PORT = 4310;
const RELEASES_URL = 'https://github.com/Geld237/voeux-enseignants/releases/latest';
let mainWindow = null;
let serverUrl = null;
let updateState = { status: 'idle' };

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(boot).catch(fatal);
}

function fatal(err) {
  dialog.showErrorBox('Vœux enseignants', `Le logiciel n'a pas pu démarrer.\n\n${err?.stack || err}`);
  app.quit();
}

/** Port libre : 4310 de préférence (les liens envoyés aux enseignants en dépendent). */
function freePort(preferred) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => {
      const t = net.createServer();
      t.listen(0, () => {
        const { port } = t.address();
        t.close(() => resolve(port));
      });
    });
    s.listen(preferred, '0.0.0.0', () => s.close(() => resolve(preferred)));
  });
}

/**
 * Sauvegarde cohérente de la base au lancement, y compris ce qui était encore dans le journal (WAL)
 * après un arrêt brutal : SQLite intègre le journal puis écrit une copie complète (VACUUM INTO).
 */
function backupDatabase(dbFile) {
  if (!fs.existsSync(dbFile)) return;
  const dir = path.join(path.dirname(dbFile), 'sauvegardes');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T.]/g, '-').slice(0, 23);
  const dest = path.join(dir, `voeux-${stamp}.db`);
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbFile);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    db.close();
  } catch (e) {
    console.error('Sauvegarde impossible :', e.message);
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 10))) fs.rmSync(path.join(dir, f), { force: true });
}

/** Même origine que le serveur local (comparaison stricte, pas de simple préfixe). */
const isAppUrl = (url) => {
  try {
    return new URL(url).origin === new URL(serverUrl).origin;
  } catch {
    return false;
  }
};
/** Liens externes : seulement le web et les e-mails, jamais file:, javascript:, etc. */
const openExternalSafe = (url) => {
  try {
    if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) shell.openExternal(url);
  } catch {
    /* lien invalide ignoré */
  }
};

async function boot() {
  const dataDir = app.getPath('userData');
  const dbFile = path.join(dataDir, 'voeux.db');
  fs.mkdirSync(dataDir, { recursive: true });
  backupDatabase(dbFile);

  const port = await freePort(PREFERRED_PORT);
  process.env.APP_MODE = 'desktop';
  process.env.DB_PATH = dbFile;
  process.env.PORT = String(port);

  const { startServer } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.js')).href);
  await startServer({ port, host: '0.0.0.0' });
  serverUrl = `http://127.0.0.1:${port}`;

  buildMenu(dataDir);
  createWindow();
  if (port !== PREFERRED_PORT) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      message: `Le port ${PREFERRED_PORT} est déjà utilisé : le logiciel utilise le port ${port}.`,
      detail: 'Les liens déjà envoyés aux enseignants ne fonctionneront pas tant que ce port est différent. Fermez l’autre programme puis relancez le logiciel.',
    });
  }
  setupUpdates();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 420,
    minHeight: 600,
    title: 'Vœux enseignants',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#F2F2F7',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(`${serverUrl}/admin`);

  // Liens externes (aide, GitHub…) : navigateur du système. Liens internes : dans la fenêtre.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: 'allow' };
    openExternalSafe(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault();
      openExternalSafe(url);
    }
  });
  // Exports CSV / JSON : boîte « Enregistrer sous ».
  mainWindow.webContents.session.on('will-download', (_e, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
  });
}

function buildMenu(dataDir) {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu', label: app.name }] : []),
    {
      label: 'Fichier',
      submenu: [
        { label: 'Ouvrir le dossier des données et sauvegardes', click: () => shell.openPath(dataDir) },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Fermer' } : { role: 'quit', label: 'Quitter' },
      ],
    },
    { label: 'Édition', submenu: [
      { role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }, { type: 'separator' },
      { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' },
    ] },
    { label: 'Affichage', submenu: [
      { role: 'reload', label: 'Actualiser' }, { type: 'separator' },
      { role: 'resetZoom', label: 'Taille réelle' }, { role: 'zoomIn', label: 'Agrandir' }, { role: 'zoomOut', label: 'Réduire' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Plein écran' },
    ] },
    { label: 'Aide', submenu: [
      { label: 'Rechercher des mises à jour…', click: () => checkUpdates(true) },
      { label: 'Ouvrir l’application dans le navigateur', click: () => shell.openExternal(`${serverUrl}/admin`) },
      { label: 'Télécharger la dernière version', click: () => shell.openExternal(RELEASES_URL) },
      { label: 'Page du projet', click: () => shell.openExternal('https://github.com/Geld237/voeux-enseignants') },
      { type: 'separator' },
      { label: `Version ${app.getVersion()}`, enabled: false },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- mises à jour automatiques ---------- */

let autoUpdater = null;
function sendUpdateState(state) {
  updateState = state;
  mainWindow?.webContents.send('update-state', state);
}

function setupUpdates() {
  if (!app.isPackaged) return; // pas de mise à jour en développement
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  // macOS n'installe que des mises à jour signées par un compte développeur Apple : sans signature,
  // on signale la nouvelle version et on propose de la télécharger depuis la page des versions.
  const manual = process.platform === 'darwin' && !process.env.CSC_SIGNED;
  autoUpdater.autoDownload = !manual;
  autoUpdater.autoInstallOnAppQuit = !manual;
  autoUpdater.on('checking-for-update', () => sendUpdateState({ status: 'checking' }));
  autoUpdater.on('update-available', (i) =>
    sendUpdateState(manual ? { status: 'manual', version: i.version, url: RELEASES_URL } : { status: 'downloading', version: i.version }));
  autoUpdater.on('update-not-available', () => sendUpdateState({ status: 'up-to-date' }));
  autoUpdater.on('download-progress', (p) => sendUpdateState({ status: 'downloading', version: updateState.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => sendUpdateState({ status: 'ready', version: i.version, notes: typeof i.releaseNotes === 'string' ? i.releaseNotes : '' }));
  autoUpdater.on('error', (e) => sendUpdateState({ status: 'error', message: String(e?.message || e) }));
  checkUpdates(false);
  setInterval(() => checkUpdates(false), 6 * 3600_000);
}

async function checkUpdates(interactive) {
  if (!autoUpdater) {
    if (interactive) dialog.showMessageBox(mainWindow, { message: 'Les mises à jour automatiques fonctionnent dans la version installée du logiciel.' });
    return;
  }
  try {
    const r = await autoUpdater.checkForUpdates();
    if (interactive && (!r || !r.updateInfo || r.updateInfo.version === app.getVersion())) {
      dialog.showMessageBox(mainWindow, { message: `Vous avez la dernière version (${app.getVersion()}).` });
    }
  } catch (e) {
    if (interactive) dialog.showMessageBox(mainWindow, { type: 'warning', message: 'Impossible de vérifier les mises à jour.', detail: String(e?.message || e) });
  }
}

ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, update: updateState }));
ipcMain.handle('update:install', () => autoUpdater?.quitAndInstall());
ipcMain.handle('update:check', () => checkUpdates(true));
ipcMain.handle('update:download-page', () => shell.openExternal(RELEASES_URL));

app.on('window-all-closed', () => app.quit());
