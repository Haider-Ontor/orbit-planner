import { z } from 'zod';
import { CapacitorHttp } from '@capacitor/core';
import { getSettings } from './settings';
import { desktop, isAndroid } from './platform';

/* Which AI service powers "Paste & extract", "Organise note" and "Suggest steps".
 * AI features stay hidden until a service is connected in Settings.
 *  - Claude (Anthropic): see ai.ts
 *  - any OpenAI-compatible service: OpenAI, Google Gemini, Groq, OpenRouter,
 *    or a local Ollama — some of these have free tiers. */

export function aiReady(): boolean {
  const s = getSettings();
  if (!s.aiEnabled) return false;
  if (s.aiProvider === 'compatible') return !!(s.compatBaseUrl.trim() && s.compatModel.trim());
  return !!s.anthropicKey.trim();
}

export const COMPAT_PRESETS: { name: string; url: string; note: string }[] = [
  { name: 'OpenAI', url: 'https://api.openai.com/v1', note: 'Key from platform.openai.com' },
  { name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', note: 'Free key from aistudio.google.com' },
  { name: 'Groq', url: 'https://api.groq.com/openai/v1', note: 'Free key from console.groq.com' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', note: 'Key from openrouter.ai (has free models)' },
  { name: 'Ollama (on this PC)', url: 'http://localhost:11434/v1', note: 'Runs locally, no key needed' },
];

interface HttpResult { status: number; text: string }

/** POST JSON without browser CORS limits: desktop goes through the main process,
 *  Android through the native HTTP client. */
async function postJSON(url: string, headers: Record<string, string>, body: unknown): Promise<HttpResult> {
  const d = desktop();
  if (d?.httpPost) return d.httpPost(url, headers, JSON.stringify(body));
  if (isAndroid()) {
    const r = await CapacitorHttp.post({ url, headers, data: body, responseType: 'text' });
    return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) };
  }
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
}

export async function compatStructured<T>(system: string, prompt: string, schema: z.ZodType<T>): Promise<T> {
  const s = getSettings();
  const url = s.compatBaseUrl.trim().replace(/\/+$/, '') + '/chat/completions';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (s.compatKey.trim()) headers.Authorization = `Bearer ${s.compatKey.trim()}`;
  const shape = JSON.stringify(z.toJSONSchema(schema));
  const body: Record<string, unknown> = {
    model: s.compatModel.trim(),
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${system}\n\nReply with ONE JSON object and nothing else. It must match this JSON Schema:\n${shape}` },
      { role: 'user', content: prompt },
    ],
  };

  let r: HttpResult;
  try {
    r = await postJSON(url, headers, body);
    if (r.status === 400 && /response_format/i.test(r.text)) { delete body.response_format; r = await postJSON(url, headers, body); }
  } catch {
    throw new Error('Could not reach the AI service. Check the address and your internet.');
  }
  let j: { error?: { message?: string } | string; choices?: { message?: { content?: string } }[] } = {};
  try { j = JSON.parse(r.text); } catch { /* not JSON */ }
  if (r.status === 401 || r.status === 403) throw new Error('The AI service rejected the API key. Check Settings → AI.');
  if (r.status === 404) throw new Error('Model or address not found. Check the model name in Settings → AI.');
  if (r.status === 429) throw new Error('The AI service is limiting requests. Wait a minute and try again.');
  if (r.status >= 400) throw new Error(`AI service error (${r.status}): ${typeof j.error === 'string' ? j.error : j.error?.message ?? r.text.slice(0, 160)}`);

  const content = j.choices?.[0]?.message?.content ?? '';
  let data: unknown;
  try {
    const m = content.match(/\{[\s\S]*\}/);
    data = JSON.parse(m ? m[0] : content);
  } catch {
    throw new Error('The AI did not return usable data. Try again, or pick a stronger model.');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error('The AI answer was incomplete. Try again, or pick a stronger model.');
  return parsed.data;
}
