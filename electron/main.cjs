// Orbit desktop shell (Electron main process).
// - Serves the built UI from a private orbit:// origin (stable IndexedDB, module workers)
// - Grants microphone access for voice notes
// - Runs Google OAuth (loopback + PKCE) for Calendar sync
// - Lives in the tray so reminders keep firing when the window is closed
const { app, BrowserWindow, protocol, net, session, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const DEV = process.argv.includes('--dev');
const DEV_URL = 'http://127.0.0.1:5199';
const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'orbit', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win = null;
let tray = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: 'Orbit',
    backgroundColor: '#f5f5f2',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL(DEV ? DEV_URL : 'orbit://app/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  let img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) img = nativeImage.createEmpty();
  tray = new Tray(img.resize({ width: 16, height: 16 }));
  tray.setToolTip('Orbit');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Orbit', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { win.isVisible() ? win.focus() : win.show(); });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.orbit.planner'); // Windows toast notifications need this

  protocol.handle('orbit', (req) => {
    const { pathname } = new URL(req.url);
    let rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // Microphone for voice notes; notifications for reminders. Nothing else.
  const allowed = new Set(['media', 'notifications', 'clipboard-sanitized-write', 'clipboard-read']);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => allowed.has(perm));

  createWindow();
  createTray();
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* stay in tray */ });

/* ------------------------------------------------------------------ *
 *  Google OAuth for installed apps: loopback redirect + PKCE
 * ------------------------------------------------------------------ */
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email'];
const ALLOWED_SCOPES = new Set([...CALENDAR_SCOPES, 'https://www.googleapis.com/auth/drive.file']);

ipcMain.handle('google-auth', async (_e, { clientId, clientSecret, scopes }) => {
  const SCOPES = Array.isArray(scopes) && scopes.length ? scopes.filter((s) => ALLOWED_SCOPES.has(s)) : CALENDAR_SCOPES;
  if (!clientId) throw new Error('Google client ID is not set (Settings → Google Calendar).');
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const { code, redirectUri } = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:sans-serif;padding:40px">
        <h2>${ok ? 'Orbit is connected to Google Calendar.' : 'Sign-in was cancelled.'}</h2>
        <p>You can close this tab and return to Orbit.</p></body></html>`);
      server.close();
      if (ok) resolve({ code: u.searchParams.get('code'), redirectUri });
      else reject(new Error(u.searchParams.get('error') || 'Google sign-in failed'));
    });
    let redirectUri = '';
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${server.address().port}`;
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      auth.search = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
        scope: SCOPES.join(' '), code_challenge: challenge, code_challenge_method: 'S256',
        state, access_type: 'offline', prompt: 'consent',
      }).toString();
      shell.openExternal(auth.toString());
    });
    setTimeout(() => { server.close(); reject(new Error('Timed out waiting for Google sign-in')); }, 5 * 60 * 1000);
  });

  const body = new URLSearchParams({
    code, client_id: clientId, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri,
  });
  if (clientSecret) body.set('client_secret', clientSecret);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const j = await r.json();
  if (!r.ok) throw new Error([j.error, j.error_description].filter(Boolean).join(': ') || 'Token exchange failed');
  if (win) { win.show(); win.focus(); }
  return j; // { access_token, refresh_token, expires_in, ... }
});

ipcMain.handle('google-refresh', async (_e, { clientId, clientSecret, refreshToken }) => {
  const body = new URLSearchParams({ client_id: clientId, refresh_token: refreshToken, grant_type: 'refresh_token' });
  if (clientSecret) body.set('client_secret', clientSecret);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const j = await r.json();
  if (!r.ok) throw new Error([j.error, j.error_description].filter(Boolean).join(': ') || 'Token refresh failed');
  return j;
});

/* ------------------------------------------------------------------ *
 *  In-app update: download Orbit-Setup.exe from GitHub and run it.
 *  The one-click installer replaces this app and reopens it.
 * ------------------------------------------------------------------ */
ipcMain.handle('update-install', async (e, url) => {
  const u = new URL(url);
  const okHost = u.protocol === 'https:' && (u.hostname === 'github.com' || u.hostname.endsWith('.githubusercontent.com'));
  if (!okHost) throw new Error('Refusing to download an update from ' + u.hostname);
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok || !r.body) throw new Error('Download failed (' + r.status + ')');
  const total = Number(r.headers.get('content-length')) || 0;
  const file = path.join(app.getPath('temp'), 'Orbit-Setup-update.exe');
  const out = require('node:fs').createWriteStream(file);
  let loaded = 0, last = 0;
  for await (const chunk of r.body) {
    out.write(chunk);
    loaded += chunk.length;
    if (Date.now() - last > 250) { last = Date.now(); e.sender.send('update-progress', { loaded, total }); }
  }
  await new Promise((res, rej) => out.end((err) => (err ? rej(err) : res())));
  e.sender.send('update-progress', { loaded, total: total || loaded });
  if (total && loaded !== total) throw new Error('Download was incomplete. Try again.');
  const { spawn } = require('node:child_process');
  spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => { quitting = true; app.quit(); }, 800);
  return true;
});

/* ------------------------------------------------------------------ *
 *  Daily backup files: Documents\Orbit Backups\orbit-YYYY-MM-DD.json
 * ------------------------------------------------------------------ */
const backupDir = () => path.join(app.getPath('documents'), 'Orbit Backups');
ipcMain.handle('backup-write', async (_e, name, json) => {
  if (!/^orbit-\d{4}-\d{2}-\d{2}\.json$/.test(name) || typeof json !== 'string') throw new Error('bad backup name');
  const fs = require('node:fs/promises');
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  await fs.writeFile(file + '.tmp', json, 'utf8');
  await fs.rename(file + '.tmp', file);
  const files = (await fs.readdir(dir)).filter((f) => /^orbit-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 30))) await fs.unlink(path.join(dir, f)).catch(() => {});
  return file;
});
ipcMain.handle('backup-open-folder', async () => {
  await require('node:fs/promises').mkdir(backupDir(), { recursive: true });
  await shell.openPath(backupDir());
});

/* AI services that don't allow browser (CORS) calls are reached from here.
 * Only https, or http to this computer (e.g. a local Ollama). */
ipcMain.handle('http-request', async (_e, method, url, headers, body) => {
  const u = new URL(url);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) throw new Error('Only https addresses are allowed');
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) throw new Error('Bad method');
  const r = await fetch(url, { method, headers, body: body ?? undefined });
  return { status: r.status, text: await r.text() };
});
ipcMain.handle('http-post', async (_e, url, headers, body) => {
  const u = new URL(url);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) throw new Error('Only https addresses are allowed');
  const r = await fetch(url, { method: 'POST', headers, body });
  return { status: r.status, text: await r.text() };
});

ipcMain.handle('launch-at-login', (_e, on) => { app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] }); return true; });
ipcMain.handle('get-launch-at-login', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('open-external', (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('set-badge', (_e, n) => { if (win) win.setOverlayIcon(null, ''); if (tray) tray.setToolTip(n ? `Orbit — ${n} due` : 'Orbit'); });
