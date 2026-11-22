/// <reference lib="webworker" />
// Speech-to-text on the desktop, fully on-device (Whisper via transformers.js).
// The model downloads once from huggingface.co and is cached by the browser.
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

type ASR = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
let asr: ASR | null = null;
let loaded = '';

self.onmessage = async (e: MessageEvent<{ audio: Float32Array; model: string; language: string }>) => {
  const { audio, model, language } = e.data;
  try {
    if (!asr || loaded !== model) {
      const gpu = 'gpu' in navigator && !!(navigator as unknown as { gpu?: unknown }).gpu;
      asr = (await pipeline('automatic-speech-recognition', model, {
        device: gpu ? 'webgpu' : 'wasm',
        dtype: gpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: (p: unknown) => self.postMessage({ type: 'progress', p }),
      } as never)) as unknown as ASR;
      loaded = model;
    }
    self.postMessage({ type: 'status', message: 'Transcribing…' });
    const opts: Record<string, unknown> = { chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' };
    if (language && !model.endsWith('.en')) opts.language = language;
    const out = await asr(audio, opts);
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
    self.postMessage({ type: 'done', text: text.trim() });
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
