import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { desktop, isAndroid, openLink } from './platform';

/* In-app updates from GitHub Releases.
 * Windows: download Orbit-Setup.exe and run it (the one-click installer replaces the app and reopens it).
 * Android: download Orbit.apk and hand it to the system installer. */

declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const REPO = 'Haider-Ontor/orbit-planner';
export const RELEASES_URL = `https://github.com/${REPO}/releases`;

export interface UpdateInfo {
  version: string;
  notes: string;
  pageUrl: string;
  exeUrl: string | null;
  apkUrl: string | null;
  newer: boolean;
}

/** -1 / 0 / 1 for semantic versions like 0.3.0 */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  let r: Response;
  try {
    r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  } catch {
    throw new Error('Could not reach GitHub. Check your internet connection.');
  }
  if (r.status === 404) throw new Error('No published release found.');
  if (r.status === 403) throw new Error('GitHub is limiting requests right now. Try again in a few minutes.');
  if (!r.ok) throw new Error(`Update check failed (${r.status}).`);
  const j = await r.json();
  const assets: { name: string; browser_download_url: string }[] = j.assets ?? [];
  const find = (re: RegExp) => assets.find((a) => re.test(a.name))?.browser_download_url ?? null;
  const version = String(j.tag_name || '').replace(/^v/, '');
  try { localStorage.setItem('orbit.update.lastCheck', String(Date.now())); } catch { /* ignore */ }
  return {
    version,
    notes: String(j.body || '').trim(),
    pageUrl: j.html_url || RELEASES_URL,
    exeUrl: find(/^Orbit-Setup\.exe$/i) ?? find(/\.exe$/i),
    apkUrl: find(/^Orbit\.apk$/i) ?? find(/\.apk$/i),
    newer: compareVersions(version, APP_VERSION) > 0,
  };
}

/* ---------- Android native helper (android/app/src/main/java/.../ApkUpdaterPlugin.java) ---------- */
interface ApkUpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(o: { url: string }): Promise<void>;
  addListener(ev: 'progress', cb: (p: { loaded: number; total: number }) => void): Promise<PluginListenerHandle>;
}
const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');

export type Progress = (fraction: number | null, msg: string) => void;

/** Returns a message to show, or throws. On Windows the app closes when the installer starts. */
export async function installUpdate(info: UpdateInfo, onProgress: Progress): Promise<string> {
  const d = desktop();
  if (d?.installUpdate) {
    if (!info.exeUrl) throw new Error('This release has no Windows installer.');
    const off = d.onUpdateProgress((p) => onProgress(p.total ? p.loaded / p.total : null, 'Downloading update…'));
    try {
      await d.installUpdate(info.exeUrl);
      return 'Installing… Orbit will reopen in a moment.';
    } finally { off(); }
  }
  if (isAndroid()) {
    if (!info.apkUrl) throw new Error('This release has no Android APK.');
    const { allowed } = await ApkUpdater.canInstall();
    if (!allowed) {
      await ApkUpdater.openInstallSettings();
      return 'Allow "Install unknown apps" for Orbit, then come back and tap Update again.';
    }
    const h = await ApkUpdater.addListener('progress', (p) => onProgress(p.total > 0 ? p.loaded / p.total : null, 'Downloading update…'));
    try {
      await ApkUpdater.downloadAndInstall({ url: info.apkUrl });
      return 'Tap Install on the next screen. Your data is kept.';
    } finally { h.remove(); }
  }
  openLink(info.pageUrl);
  return 'Opened the download page.';
}

/** Quiet check at most twice a day; resolves with info only when a newer version exists. */
export async function backgroundCheck(): Promise<UpdateInfo | null> {
  try {
    const last = Number(localStorage.getItem('orbit.update.lastCheck') || 0);
    if (Date.now() - last < 12 * 3600_000) return null;
    const info = await checkForUpdate();
    return info.newer ? info : null;
  } catch { return null; }
}
