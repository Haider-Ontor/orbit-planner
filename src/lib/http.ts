import { CapacitorHttp } from '@capacitor/core';
import { desktop, isAndroid } from './platform';

/* HTTP that is not blocked by browser CORS rules:
 * desktop → Electron main process, Android → native HTTP client, web → fetch. */

export interface HttpResult { status: number; text: string }

export async function http(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, headers: Record<string, string> = {}, body: string | null = null): Promise<HttpResult> {
  const d = desktop();
  if (d?.httpRequest) return d.httpRequest(method, url, headers, body);
  if (isAndroid()) {
    const r = await CapacitorHttp.request({ method, url, headers, data: body ?? undefined, responseType: 'text' });
    return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) };
  }
  const r = await fetch(url, { method, headers, body: body ?? undefined });
  return { status: r.status, text: await r.text() };
}
