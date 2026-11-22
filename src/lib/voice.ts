import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { isAndroid } from './platform';
import { getSettings } from './settings';

/* Two engines behind one interface:
 *  - Android: the phone's own speech recogniser, live text as you speak
 *  - Desktop/web: record audio, then transcribe on-device with Whisper */

export interface VoiceSession {
  stop(): Promise<{ text: string; audio: Blob | null }>;
  cancel(): void;
}

export interface VoiceCallbacks {
  onPartial?(text: string): void;
  onStatus?(msg: string): void;
}

const LANG_CODES: Record<string, string> = { english: 'en-US', bengali: 'bn-BD', hindi: 'hi-IN', arabic: 'ar-SA', '': 'en-US' };

export async function startVoice(cb: VoiceCallbacks = {}): Promise<VoiceSession> {
  return isAndroid() ? startAndroid(cb) : startRecorder(cb);
}

/* ---------------- Android: native recogniser ---------------- */
async function startAndroid(cb: VoiceCallbacks): Promise<VoiceSession> {
  const { available } = await SpeechRecognition.available();
  if (!available) throw new Error('Speech recognition is not available on this phone.');
  const perm = await SpeechRecognition.requestPermissions();
  if (perm.speechRecognition !== 'granted') throw new Error('Microphone permission was denied.');

  const language = LANG_CODES[getSettings().voiceLanguage] ?? 'en-US';
  let committed = '';
  let partial = '';
  let active = true;

  const partialL = await SpeechRecognition.addListener('partialResults', (d: { matches: string[] }) => {
    partial = d.matches?.[0] ?? '';
    cb.onPartial?.((committed + ' ' + partial).trim());
  });
  // The recogniser stops after a pause; keep restarting until the user taps stop.
  const stateL = await SpeechRecognition.addListener('listeningState', async (d: { status: 'started' | 'stopped' }) => {
    if (d.status === 'stopped') {
      if (partial) { committed = (committed + ' ' + partial).trim(); partial = ''; }
      if (active) { try { await begin(); } catch { /* ignore */ } }
    }
  });
  const begin = () => SpeechRecognition.start({ language, partialResults: true, popup: false, maxResults: 1 });
  await begin();
  cb.onStatus?.('Listening…');

  const cleanup = async () => { active = false; await partialL.remove(); await stateL.remove(); };
  return {
    async stop() {
      active = false;
      try { await SpeechRecognition.stop(); } catch { /* already stopped */ }
      await new Promise((r) => setTimeout(r, 350));
      await cleanup();
      return { text: (committed + ' ' + partial).trim(), audio: null };
    },
    cancel() { active = false; SpeechRecognition.stop().catch(() => {}); cleanup(); },
  };
}

/* ---------------- Desktop: record, then Whisper ---------------- */
async function startRecorder(cb: VoiceCallbacks): Promise<VoiceSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('No microphone access in this environment.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(1000);
  cb.onStatus?.('Recording…');
  const started = Date.now();
  const tick = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    cb.onStatus?.(`Recording… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  }, 500);

  const finish = () => new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
    rec.stop();
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(tick);
  });

  return {
    async stop() {
      const blob = await finish();
      const text = await transcribe(blob, cb);
      return { text, audio: blob };
    },
    cancel() { finish(); },
  };
}

let worker: Worker | null = null;

export async function transcribe(blob: Blob, cb: VoiceCallbacks = {}): Promise<string> {
  cb.onStatus?.('Preparing audio…');
  const buf = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  const audio = await ctx.decodeAudioData(buf);
  const pcm = audio.getChannelData(0).slice();
  ctx.close();

  worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  const s = getSettings();
  return new Promise((resolve, reject) => {
    const files: Record<string, number> = {};
    worker!.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'progress' && m.p?.status === 'progress' && m.p.total) {
        files[m.p.file] = m.p.progress;
        const vals = Object.values(files);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        cb.onStatus?.(`Downloading speech model (first time only)… ${Math.round(avg)}%`);
      } else if (m.type === 'status') cb.onStatus?.(m.message);
      else if (m.type === 'done') resolve(m.text);
      else if (m.type === 'error') reject(new Error('Transcription failed: ' + m.message));
    };
    worker!.postMessage({ audio: pcm, model: s.whisperModel, language: s.voiceLanguage }, [pcm.buffer]);
  });
}
