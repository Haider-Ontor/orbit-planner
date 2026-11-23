import { useSyncExternalStore } from 'react';

// Device-local settings (keys and tokens never leave this device).
export interface Settings {
  aiEnabled: boolean;
  aiProvider: 'anthropic' | 'compatible';
  anthropicKey: string;
  aiModel: string;
  compatBaseUrl: string;
  compatKey: string;
  compatModel: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  googleClientId: string;   // one Google Cloud OAuth client (Desktop app) for Drive + Calendar
  googleClientSecret: string;
  googleRefreshToken: string;
  googleEmail: string;
  driveRefreshToken: string; // Windows: Google Drive sync
  driveEmail: string;
  driveAndroid: boolean;     // Android: connected through Play Services
  googleScopes: string;      // permissions granted at the last Google sign-in
  calendarPush: boolean;     // add Orbit tasks to Google Calendar
  calendarPull: boolean;     // show Google Calendar events in Orbit
  whisperModel: string;
  voiceLanguage: string; // '' = auto, 'english', 'bengali', ...
  remindersOn: boolean;
  remindMinutesBefore: number;
  dailyDigestTime: string; // HH:MM
  theme: 'system' | 'light' | 'dark' | 'paper' | 'sage' | 'circuit';
  lastPull: string;        // ISO timestamp cursor for cloud pulls
}

const DEFAULTS: Settings = {
  aiEnabled: true,
  aiProvider: 'anthropic',
  anthropicKey: '',
  aiModel: 'claude-opus-5-5',
  compatBaseUrl: '',
  compatKey: '',
  compatModel: '',
  supabaseUrl: '',
  supabaseAnonKey: '',
  // Defaults can be baked into a build with VITE_GOOGLE_CLIENT_ID / VITE_GOOGLE_CLIENT_SECRET.
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '',
  googleClientSecret: (import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined) ?? '',
  googleRefreshToken: '',
  googleEmail: '',
  driveRefreshToken: '',
  driveEmail: '',
  driveAndroid: false,
  googleScopes: '',
  calendarPush: true,
  calendarPull: true,
  whisperModel: 'onnx-community/whisper-base',
  voiceLanguage: '',
  remindersOn: true,
  remindMinutesBefore: 30,
  dailyDigestTime: '08:00',
  theme: 'system',
  lastPull: '',
};

const KEY = 'orbit.settings.v1';
let current: Settings = load();
const subs = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = { ...DEFAULTS, ...JSON.parse(raw) } as Settings;
      // an empty saved value should not hide a client ID built into the app
      if (!saved.googleClientId) { saved.googleClientId = DEFAULTS.googleClientId; saved.googleClientSecret = saved.googleClientSecret || DEFAULTS.googleClientSecret; }
      return saved;
    }
  } catch { /* private mode etc. */ }
  return { ...DEFAULTS };
}

export function getSettings() { return current; }

export function setSettings(p: Partial<Settings>) {
  current = { ...current, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
  subs.forEach((f) => f());
}

export function useSettings(): Settings {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => current);
}
