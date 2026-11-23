import { registerPlugin } from '@capacitor/core';
import { desktop, isAndroid } from './platform';
import { getSettings, setSettings } from './settings';

/* Google sign-in for Drive sync.
 * Windows: browser sign-in (loopback + PKCE) in the main process, refresh token kept on this PC.
 * Android: Google Play Services account picker; tokens are re-issued silently. */

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

interface GoogleDrivePlugin { authorize(o: { scopes: string[]; interactive: boolean }): Promise<{ accessToken: string }> }
const GoogleDrive = registerPlugin<GoogleDrivePlugin>('GoogleDrive');

let cached = { token: '', exp: 0 };

export function driveConnected(): boolean {
  const s = getSettings();
  return isAndroid() ? s.driveAndroid : !!s.driveRefreshToken;
}

export function googleClient() {
  const s = getSettings();
  return { clientId: s.googleClientId.trim(), clientSecret: s.googleClientSecret.trim() };
}

/** Interactive sign-in. Returns the account email when known. */
export async function connectDrive(): Promise<string> {
  if (isAndroid()) {
    const r = await GoogleDrive.authorize({ scopes: DRIVE_SCOPES, interactive: true });
    cached = { token: r.accessToken, exp: Date.now() + 50 * 60_000 };
    setSettings({ driveAndroid: true });
    return '';
  }
  const d = desktop();
  if (!d) throw new Error('Google Drive sync works in the Windows and Android apps.');
  const { clientId, clientSecret } = googleClient();
  if (!clientId) throw new Error('Add the Google client ID first (Settings → Google Drive → Setup).');
  const t = await d.googleAuth({ clientId, clientSecret, scopes: [...DRIVE_SCOPES, 'openid', 'email'] });
  if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove Orbit at myaccount.google.com/permissions and try again.');
  cached = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
  let email = '';
  try { if (t.id_token) email = JSON.parse(atob(t.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? ''; } catch { /* ignore */ }
  setSettings({ driveRefreshToken: t.refresh_token, driveEmail: email });
  return email;
}

export function disconnectDrive() {
  cached = { token: '', exp: 0 };
  setSettings({ driveRefreshToken: '', driveEmail: '', driveAndroid: false });
}

/** A valid access token, refreshed when needed. `force` skips the cache (after a 401). */
export async function driveToken(force = false): Promise<string> {
  if (!force && cached.token && Date.now() < cached.exp) return cached.token;
  if (isAndroid()) {
    try {
      const r = await GoogleDrive.authorize({ scopes: DRIVE_SCOPES, interactive: false });
      cached = { token: r.accessToken, exp: Date.now() + 50 * 60_000 };
      return cached.token;
    } catch (e) {
      throw new Error(String(e).includes('needs-consent') ? 'Google Drive needs you to sign in again (Settings → Google Drive).' : String((e as Error)?.message ?? e));
    }
  }
  const d = desktop();
  const s = getSettings();
  if (!d || !s.driveRefreshToken) throw new Error('Google Drive is not connected.');
  const { clientId, clientSecret } = googleClient();
  const t = await d.googleRefresh({ clientId, clientSecret, refreshToken: s.driveRefreshToken });
  cached = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
  return cached.token;
}
