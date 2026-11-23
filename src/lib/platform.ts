import { Capacitor } from '@capacitor/core';

export interface DesktopBridge {
  isDesktop: true;
  googleAuth(cfg: { clientId: string; clientSecret: string; scopes?: string[] }): Promise<GoogleTokens>;
  googleRefresh(cfg: { clientId: string; clientSecret: string; refreshToken: string }): Promise<GoogleTokens>;
  setLaunchAtLogin(on: boolean): Promise<boolean>;
  getLaunchAtLogin(): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  setBadge(n: number): Promise<void>;
  installUpdate?(url: string): Promise<void>;
  writeBackup?(name: string, json: string): Promise<string>;
  httpPost?(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; text: string }>;
  httpRequest?(method: string, url: string, headers: Record<string, string>, body: string | null): Promise<{ status: number; text: string }>;
  openBackupFolder?(): Promise<void>;
  onUpdateProgress(cb: (p: { loaded: number; total: number }) => void): () => void;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

declare global {
  interface Window { orbitDesktop?: DesktopBridge }
}

export const desktop = (): DesktopBridge | undefined => window.orbitDesktop;
export const isDesktop = () => !!window.orbitDesktop;
export const isAndroid = () => Capacitor.getPlatform() === 'android';
export const platformName = () => (isDesktop() ? 'Windows' : isAndroid() ? 'Android' : 'Web');

export function openLink(url: string) {
  const d = desktop();
  if (d) d.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}
