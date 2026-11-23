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
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  googleEmail: string;
  whisperModel: string;
  voiceLanguage: string; // '' = auto, 'english', 'bengali', ...
  remindersOn: boolean;
  remindMinutesBefore: number;
  dailyDigestTime: string; // HH:MM
  theme: 'system' | 'light' | 'dark';
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
  googleClientId: '',
  googleClientSecret: '',
  googleRefreshToken: '',
  googleEmail: '',
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
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
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
