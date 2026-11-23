import { registerPlugin } from '@capacitor/core';
import { desktop, isAndroid } from './platform';
import { getSettings, setSettings } from './settings';

/* One Google connection for Drive (sync + backup) and Calendar.
 * Windows: browser sign-in (loopback + PKCE) in the main process, refresh token kept on this PC.
 * Android: Google Play Services account picker; tokens are re-issued silently. */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const GOOGLE_SCOPES = [DRIVE_SCOPE, CALENDAR_SCOPE];
/** SHA-1 of the certificate released APKs are signed with (needed for the Android OAuth client). */
export const APK_SHA1 = 'D7:AB:96:D3:23:A1:F0:7A:2F:7D:89:AD:07:41:8F:A7:7F:8E:6E:27';

interface GoogleDrivePlugin { authorize(o: { scopes: string[]; interactive: boolean }): Promise<{ accessToken: string }> }
const GoogleDrive = registerPlugin<GoogleDrivePlugin>('GoogleDrive');

let cached = { token: '', exp: 0 };

export function driveConnected(): boolean {
  const s = getSettings();
  return isAndroid() ? s.driveAndroid : !!s.driveRefreshToken;
}
export const googleConnected = driveConnected;
/** Was this connection made with Calendar access? (Connections from v0.6 only had Drive.) */
export const calendarGranted = () => googleConnected() && getSettings().googleScopes.includes(CALENDAR_SCOPE);

export function googleClient() {
  const s = getSettings();
  return { clientId: s.googleClientId.trim(), clientSecret: s.googleClientSecret.trim() };
}

/** Turn Google's error codes into something a person can act on. */
export function explainGoogleError(e: unknown): string {
  const raw = String((e as { message?: string })?.message ?? e);
  const setup = isAndroid()
    ? `Orbit isn't registered with Google for this phone yet. In Google Cloud (the same project as the Windows app): enable the Google Drive and Google Calendar APIs, add your Gmail under OAuth consent screen → Test users, and create an OAuth client of type Android with package com.orbit.planner and SHA-1 ${APK_SHA1}. Then try again.`
    : 'Check the one-time Google setup: client type must be "Desktop app", the Google Drive and Calendar APIs must be enabled, and your Gmail must be listed under OAuth consent screen → Test users.';
  if (/code:10\b|DEVELOPER_ERROR/i.test(raw)) return setup;
  if (/code:(cancelled|16|12501)\b/i.test(raw)) return `Google sign-in didn't finish. If you closed the Google screen, just try again. If it closed by itself: ${setup}`;
  if (/code:7\b|network/i.test(raw)) return 'No internet connection. Connect and try again.';
  if (/access_denied/i.test(raw)) return 'Google blocked the sign-in. In Google Cloud → OAuth consent screen, add this Gmail under Test users (or publish the app), then try again.';
  if (/invalid_client|unauthorized_client/i.test(raw)) return 'Google did not accept the client ID or secret. Copy them again from Google Cloud → Credentials (type "Desktop app").';
  if (/redirect_uri_mismatch/i.test(raw)) return 'The Google client is the wrong type. Create an OAuth client ID of type "Desktop app" and use that one.';
  if (/insufficient.*(scope|permission)|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(raw)) return 'Orbit needs your permission for Google Calendar too. Disconnect Google in Settings and connect again.';
  return raw.replace(/^code:[^:]*:?/, '').trim() || 'Google sign-in failed.';
}

/** Interactive sign-in. Returns the account email when known. */
export async function connectGoogle(): Promise<string> {
  try {
    if (isAndroid()) {
      const r = await GoogleDrive.authorize({ scopes: GOOGLE_SCOPES, interactive: true });
      cached = { token: r.accessToken, exp: Date.now() + 50 * 60_000 };
      setSettings({ driveAndroid: true, googleScopes: GOOGLE_SCOPES.join(' ') });
      return '';
    }
    const d = desktop();
    if (!d) throw new Error('Google sync works in the Windows and Android apps.');
    const { clientId, clientSecret } = googleClient();
    if (!clientId) throw new Error('Add the Google client ID first (Settings → Google → One-time setup).');
    const t = await d.googleAuth({ clientId, clientSecret, scopes: [...GOOGLE_SCOPES, 'openid', 'email'] });
    if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove Orbit at myaccount.google.com/permissions and try again.');
    cached = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
    let email = '';
    try { if (t.id_token) email = JSON.parse(atob(t.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? ''; } catch { /* ignore */ }
    setSettings({ driveRefreshToken: t.refresh_token, driveEmail: email, googleScopes: GOOGLE_SCOPES.join(' ') });
    return email;
  } catch (e) {
    throw new Error(explainGoogleError(e));
  }
}
export const connectDrive = connectGoogle;

export function disconnectGoogle() {
  cached = { token: '', exp: 0 };
  setSettings({ driveRefreshToken: '', driveEmail: '', driveAndroid: false, googleScopes: '' });
}
export const disconnectDrive = disconnectGoogle;

/** A valid access token, refreshed when needed. `force` skips the cache (after a 401). */
export async function googleToken(force = false): Promise<string> {
  if (!force && cached.token && Date.now() < cached.exp) return cached.token;
  if (isAndroid()) {
    try {
      const scopes = getSettings().googleScopes ? getSettings().googleScopes.split(' ') : [DRIVE_SCOPE];
      const r = await GoogleDrive.authorize({ scopes, interactive: false });
      cached = { token: r.accessToken, exp: Date.now() + 50 * 60_000 };
      return cached.token;
    } catch (e) {
      throw new Error(String(e).includes('needs-consent') ? 'Google needs you to sign in again (Settings → Google).' : explainGoogleError(e));
    }
  }
  const d = desktop();
  const s = getSettings();
  if (!d || !s.driveRefreshToken) throw new Error('Google is not connected.');
  const { clientId, clientSecret } = googleClient();
  try {
    const t = await d.googleRefresh({ clientId, clientSecret, refreshToken: s.driveRefreshToken });
    cached = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
    return cached.token;
  } catch (e) {
    throw new Error(/invalid_grant/i.test(String(e)) ? 'Google sign-in expired. Connect Google again in Settings.' : explainGoogleError(e));
  }
}
export const driveToken = googleToken;
