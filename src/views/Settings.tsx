import { useEffect, useState } from 'react';
import { useSettings, setSettings } from '../lib/settings';
import { useSync, signIn, signOut, initSync, syncNow } from '../lib/sync';
import { syncCalendar, calendarSoon } from '../lib/gcal';
import { desktop, isDesktop, isAndroid, platformName, openLink } from '../lib/platform';
import { exportAll, restoreFrom, dailySnapshot } from '../lib/backup';
import { aiReady, COMPAT_PRESETS } from '../lib/aiProvider';
import { connectGoogle, disconnectGoogle, driveConnected, calendarGranted, APK_SHA1 } from '../lib/google';
import { useDriveSync, syncDrive, syncSoon, listDriveBackups, downloadDriveFile, resetDriveCache } from '../lib/driveSync';


import { testAI } from '../lib/ai';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { SYNC_TABLES } from '../lib/types';
import { ViewHead, toast, errMsg, Progress } from '../components/ui';
import { APP_VERSION, RELEASES_URL, checkForUpdate, installUpdate, type UpdateInfo } from '../lib/update';

function Snapshots({ onRestored }: { onRestored: () => void }) {
  const snaps = useLiveQuery(() => db.snapshots.orderBy('createdAt').reverse().toArray(), [], []);
  const [open, setOpen] = useState(false);
  if (!snaps.length) return <p>The first daily backup is taken a few seconds after Orbit starts.</p>;
  const label = (c: Record<string, number>) => [`${c.tasks ?? 0} to-dos`, `${c.goals ?? 0} goals`, `${c.projects ?? 0} plans`, `${c.notes ?? 0} notes`, `${c.routines ?? 0} routines`].join(' · ');
  const list = open ? snaps : snaps.slice(0, 3);
  return (
    <div className="snaps">
      {list.map((s) => (
        <div key={s.id} className="snap-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{new Date(s.createdAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b>
            <div className="small muted">{label(s.counts)}</div>
          </div>
          <button className="btn sm" onClick={async () => {
            if (!confirm('Bring back everything as it was in this backup? Items you created since are kept.')) return;
            try { const n = await restoreFrom(s.data); onRestored(); toast(`Restored ${n} records from the backup`); } catch (e) { toast(errMsg(e), true); }
          }}>Restore</button>
        </div>
      ))}
      {snaps.length > 3 && <button className="linkish small" onClick={() => setOpen(!open)}>{open ? 'Show fewer' : `Show all ${snaps.length} daily backups`}</button>}
    </div>
  );
}

const THEMES: { id: 'system' | 'light' | 'dark' | 'paper' | 'sage' | 'circuit'; name: string; note: string; bg: string; side: string; card: string; accent: string; hi: string }[] = [
  { id: 'system', name: 'Automatic', note: 'Ivory by day, Graphite at night', bg: 'linear-gradient(135deg, #F7F5F0 50%, #20252B 50%)', side: 'linear-gradient(135deg, #F1EEE7 50%, #252C35 50%)', card: 'rgba(255,255,255,.55)', accent: '#23364D', hi: '#D77A42' },
  { id: 'light', name: 'Ivory', note: 'Warm and professional', bg: '#F7F5F0', side: '#F1EEE7', card: '#FFFFFF', accent: '#23364D', hi: '#D77A42' },
  { id: 'dark', name: 'Graphite', note: 'Dark, easy on the eyes', bg: '#20252B', side: '#252C35', card: '#2D3540', accent: '#8299B4', hi: '#DB8B57' },
  { id: 'paper', name: 'Paper', note: 'Crisp white, blue and coral', bg: '#F6F8FA', side: '#FFFFFF', card: '#FFFFFF', accent: '#2563A8', hi: '#E8664A' },
  { id: 'sage', name: 'Sage', note: 'Calm green and ochre', bg: '#F4F6F1', side: '#ECF0E8', card: '#FFFFFF', accent: '#2F5D50', hi: '#C9853B' },
  { id: 'circuit', name: 'Circuit', note: 'Dark board, mint and amber', bg: '#0E161B', side: '#101B21', card: '#142027', accent: '#3DD9A0', hi: '#E9C46A' },
];

function DriveSection() {
  const st = useDriveSync();
  const s = useSettings();
  const [busy, setBusy] = useState('');
  const [setup, setSetup] = useState(false);
  const [backups, setBackups] = useState<{ id: string; name: string }[] | null>(null);
  const [err, setErr] = useState('');
  const connected = driveConnected();
  const calOk = calendarGranted();
  const needsClient = isDesktop() && !s.googleClientId.trim();

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setErr('');
    try { const r = await fn(); if (typeof r === 'string' && r) toast(r); } catch (e) { setErr(errMsg(e)); toast('Google: something went wrong (details below)', true); }
    finally { setBusy(''); }
  };
  const connect = () => run('connect', async () => {
    const email = await connectGoogle(); resetDriveCache();
    const m = await syncDrive();
    const c = await syncCalendar().catch((e) => { setErr(errMsg(e)); return ''; });
    return `Google connected${email ? ` (${email})` : ''}. ${m}${c ? ' · ' + c : ''}`;
  });
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

  return (
    <div className="card" id="sec-drive" style={{ marginBottom: 16, scrollMarginTop: 16 }}>
      <div className="settings-sec">
        <h3>Google: sync, backup & calendar</h3>
        <p>One Google sign-in does three things: keeps your phone and computer in sync, backs everything up to a folder called <b>Orbit</b> in your Google Drive (Orbit can only see the files it creates there), and puts your tasks in Google Calendar.</p>
        {connected ? (<>
          <div className="row wrap">
            <span className={st.status === 'error' ? 'small' : 'ok-line'} style={st.status === 'error' ? { color: 'var(--danger)' } : undefined}>
              {st.status === 'error' ? `⚠ ${st.message}` : `● Connected${s.driveEmail ? ` as ${s.driveEmail}` : ''}`}
            </span>
            <span className="small muted">{st.status === 'syncing' ? 'Syncing…' : st.lastSync ? `Last synced ${ago(st.lastSync)}${st.message && st.status !== 'error' ? ` · ${st.message}` : ''}` : ''}</span>
          </div>
          <div className="row wrap">
            <button className="btn primary" disabled={!!busy || st.status === 'syncing'} onClick={() => run('sync', async () => { const m = await syncDrive(); const c = calOk ? await syncCalendar() : ''; return m + (c ? ' · ' + c : ''); })}>{st.status === 'syncing' || busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
            <button className="btn" disabled={!!busy} onClick={() => run('list', async () => { setBackups(await listDriveBackups()); return ''; })}>Restore from Drive…</button>
            <button className="btn ghost" onClick={() => { if (confirm('Stop syncing this device with Google? Your data stays on this device, in Drive and in your calendar.')) { disconnectGoogle(); resetDriveCache(); toast('Google disconnected'); } }}>Disconnect</button>
          </div>
          {calOk ? (
            <div className="cal-opts">
              <label className="switch"><input type="checkbox" checked={s.calendarPush} onChange={(e) => { setSettings({ calendarPush: e.target.checked }); calendarSoon(500); }} /><span>Add my tasks to Google Calendar <span className="muted small">(tasks with a date; repeating tasks as recurring events)</span></span></label>
              <label className="switch"><input type="checkbox" checked={s.calendarPull} onChange={(e) => { setSettings({ calendarPull: e.target.checked }); calendarSoon(500); }} /><span>Show my Google Calendar events in Orbit</span></label>
            </div>
          ) : (
            <div className="row wrap"><span className="small muted">Calendar isn't connected yet on this device.</span><button className="btn sm" disabled={!!busy} onClick={connect}>Connect calendar too</button></div>
          )}
          {backups && (
            <div className="snaps">
              {backups.length ? backups.map((b) => (
                <div key={b.id} className="snap-row">
                  <div style={{ flex: 1 }}><b>{b.name.replace('orbit-backup-', '').replace('.json', '')}</b><div className="small muted">Daily backup in Google Drive</div></div>
                  <button className="btn sm" onClick={() => run('restore', async () => {
                    if (!confirm('Bring back everything as it was in this backup? Items created since are kept.')) return '';
                    const n = await restoreFrom(await downloadDriveFile(b.id));
                    syncSoon(500);
                    return `Restored ${n} records from Google Drive`;
                  })}>Restore</button>
                </div>
              )) : <p>No backups in Drive yet; the first one is made at the next sync.</p>}
            </div>
          )}
        </>) : (<>
          <div className="row wrap">
            <button className="btn primary" disabled={!!busy || needsClient} onClick={connect}>
              {busy === 'connect' ? 'Waiting for Google…' : 'Connect Google'}
            </button>
            {needsClient && <span className="small muted">Needs a one-time setup first (below)</span>}
          </div>
          <p>Connect on <b>each</b> device with the <b>same Google account</b>. The first device uploads your data; the others merge with it.</p>
        </>)}
        {err && <div className="err-box" role="alert"><b>Google sign-in problem</b><span>{err}</span></div>}
        {(isDesktop() || isAndroid()) && (
          <details open={setup || needsClient} onToggle={(e) => setSetup((e.target as HTMLDetailsElement).open)}>
            <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>One-time Google setup (about 5 minutes)</summary>
            <ol className="small setup-steps">
              <li>Open <a href="#" onClick={(e) => { e.preventDefault(); openLink('https://console.cloud.google.com/projectcreate'); }}>console.cloud.google.com</a> and create a project called <b>Orbit</b>.</li>
              <li>In <b>APIs &amp; Services → Library</b>, enable <b>Google Drive API</b> and <b>Google Calendar API</b>.</li>
              <li>In <b>OAuth consent screen</b>: choose <b>External</b>, fill in the app name, and add your Gmail under <b>Test users</b>.</li>
              <li>In <b>Credentials → Create credentials → OAuth client ID</b>, choose <b>Desktop app</b>. Copy the client ID and secret into the boxes below (on the computer).</li>
              <li>For the phone, create one more <b>OAuth client ID</b> of type <b>Android</b>: package name <code>com.orbit.planner</code>, SHA-1 <code style={{ overflowWrap: 'anywhere' }}>{APK_SHA1}</code>. Nothing needs to be typed on the phone.</li>
            </ol>
            {isDesktop() && (
              <div className="grid2">
                <label className="field">Client ID<input className="input" value={s.googleClientId} placeholder="….apps.googleusercontent.com" onChange={(e) => setSettings({ googleClientId: e.target.value.trim() })} /></label>
                <label className="field">Client secret<input className="input" type="password" value={s.googleClientSecret} onChange={(e) => setSettings({ googleClientSecret: e.target.value.trim() })} /></label>
              </div>
            )}
          </details>
        )}
      </div>
    </div>
  );
}

function UpdateSection() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [state, setState] = useState<'idle' | 'checking' | 'downloading' | 'done'>('idle');
  const [msg, setMsg] = useState('');
  const [frac, setFrac] = useState<number | null>(null);

  const check = async () => {
    setState('checking'); setMsg('');
    try {
      const i = await checkForUpdate();
      setInfo(i);
      setMsg(i.newer ? '' : `You have the latest version (${APP_VERSION}).`);
    } catch (e) { setMsg(errMsg(e)); }
    finally { setState('idle'); }
  };
  const install = async () => {
    if (!info) return;
    setState('downloading'); setFrac(null); setMsg('Starting download…');
    try {
      const m = await installUpdate(info, (f, text) => { setFrac(f); setMsg(text + (f !== null ? ` ${Math.round(f * 100)}%` : '')); });
      setMsg(m); setState('done');
    } catch (e) { setMsg(errMsg(e)); setState('idle'); }
  };

  return (
    <div className="card" id="sec-updates" style={{ marginBottom: 16, scrollMarginTop: 16 }}>
      <div className="settings-sec">
        <div className="row wrap">
          <h3 style={{ flex: 1 }}>Updates</h3>
          <span className="chip">Orbit {APP_VERSION}</span>
        </div>
        {info?.newer ? (
          <>
            <div className="ok-line">Version {info.version} is available.</div>
            {info.notes && <p style={{ whiteSpace: 'pre-wrap' }}>{info.notes.slice(0, 600)}</p>}
            <div className="row wrap">
              <button className="btn primary" disabled={state === 'downloading' || state === 'done'} onClick={install}>
                {state === 'downloading' ? 'Downloading…' : `Update to ${info.version}`}
              </button>
              <button className="btn ghost" onClick={() => openLink(info.pageUrl)}>What's new ↗</button>
            </div>
            {state === 'downloading' && frac !== null && <Progress value={Math.round(frac * 100)} />}
          </>
        ) : (
          <div className="row wrap">
            <button className="btn" disabled={state === 'checking'} onClick={check}>{state === 'checking' ? 'Checking…' : 'Check for updates'}</button>
            <button className="btn ghost" onClick={() => openLink(RELEASES_URL)}>All releases ↗</button>
          </div>
        )}
        {msg && <p>{msg}</p>}
        <p>Updating keeps your tasks, goals, notes and settings.</p>
      </div>
    </div>
  );
}

export function Settings({ focus }: { focus?: { section: string; at: number } | null } = {}) {
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(focus.section);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.remove('anchor-flash'); void el.offsetWidth; el.classList.add('anchor-flash');
  }, [focus]);
  const s = useSettings();
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState('');
  const [login, setLogin] = useState<boolean | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => { desktop()?.getLaunchAtLogin().then(setLogin); }, []);

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    try { const r = await fn(); if (typeof r === 'string' && r) toast(r); } catch (e) { toast(errMsg(e), true); }
    finally { setBusy(''); }
  };

  const exportJSON = async () => {
    const { json } = await exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `orbit-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  const importJSON = (file: File) => act('import', async () => {
    if (!confirm('Bring back everything in this backup file? Items you created since are kept.')) return '';
    const n = await restoreFrom(await file.text());
    syncNow();
    return `Restored ${n} records`;
  });

  return (
    <div className="view" style={{ maxWidth: 820 }}>
      <ViewHead title="Settings" sub={`Running on ${platformName()}. Keys and tokens are stored only on this device.`} />

      <UpdateSection />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="settings-sec">
          <div className="row wrap">
            <h3 style={{ flex: 1 }}>AI helper (optional)</h3>
            <label className="switch"><input type="checkbox" checked={s.aiEnabled} onChange={(e) => setSettings({ aiEnabled: e.target.checked })} /><span>{s.aiEnabled ? 'On' : 'Off'}</span></label>
          </div>
          <p>Connect an AI service to turn on <b>Paste & extract</b> (turn an email or message into tasks), <b>Organise note</b> and <b>Suggest steps</b> for goals. These buttons stay hidden until a service is connected. Everything else works without AI.</p>
          {s.aiEnabled && (<>
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
              <button className={s.aiProvider === 'anthropic' ? 'on' : ''} onClick={() => setSettings({ aiProvider: 'anthropic' })}>Claude</button>
              <button className={s.aiProvider === 'compatible' ? 'on' : ''} onClick={() => setSettings({ aiProvider: 'compatible' })}>Other service</button>
            </div>
            {s.aiProvider === 'anthropic' ? (<>
              <label className="field">Claude API key <span className="muted" style={{ fontWeight: 400 }}>(from console.anthropic.com → API keys)</span>
                <div className="row"><input className="input" type={showKey ? 'text' : 'password'} value={s.anthropicKey} placeholder="sk-ant-…" onChange={(e) => setSettings({ anthropicKey: e.target.value.trim() })} />
                  <button className="btn" onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide' : 'Show'}</button></div>
              </label>
              <label className="field">Model
                <select className="select" value={s.aiModel} onChange={(e) => setSettings({ aiModel: e.target.value })}>
                  <option value="claude-opus-5-5">Claude Opus 5.5 (best)</option>
                  <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (faster, cheaper)</option>
                  <option value="claude-haiku-5-5">Claude Haiku 5.5 (cheapest)</option>
                </select>
              </label>
            </>) : (<>
              <p>Works with any service that speaks the OpenAI chat format. Tap one to fill in its address, then paste your key and a model name from that service.</p>
              <div className="row wrap" style={{ gap: 6 }}>
                {COMPAT_PRESETS.map((pr) => <button key={pr.name} className={'btn sm' + (s.compatBaseUrl === pr.url ? ' primary' : '')} title={pr.note} onClick={() => setSettings({ compatBaseUrl: pr.url })}>{pr.name}</button>)}
              </div>
              {COMPAT_PRESETS.find((pr) => pr.url === s.compatBaseUrl) && <p>{COMPAT_PRESETS.find((pr) => pr.url === s.compatBaseUrl)!.note}.</p>}
              <label className="field">Service address<input className="input" value={s.compatBaseUrl} placeholder="https://…/v1" onChange={(e) => setSettings({ compatBaseUrl: e.target.value.trim() })} /></label>
              <div className="grid2">
                <label className="field">API key<input className="input" type="password" value={s.compatKey} placeholder="(not needed for Ollama)" onChange={(e) => setSettings({ compatKey: e.target.value.trim() })} /></label>
                <label className="field">Model name<input className="input" value={s.compatModel} placeholder="model id from the service's list" onChange={(e) => setSettings({ compatModel: e.target.value.trim() })} /></label>
              </div>
            </>)}
            <div className="row wrap">
              <button className="btn" disabled={!aiReady() || !!busy} onClick={() => act('ai', testAI)}>{busy === 'ai' ? 'Testing…' : 'Test connection'}</button>
              <span className={aiReady() ? 'ok-line' : 'small muted'}>{aiReady() ? '● Connected: AI buttons are visible' : 'Not connected yet'}</span>
            </div>
          </>)}
        </div>
      </div>

      <DriveSection />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="settings-sec">
          <h3>Voice notes</h3>
          <p>{isDesktop() || platformName() === 'Web' ? 'On Windows, speech is transcribed on your computer with Whisper. The model downloads once (base ≈ 80 MB, small ≈ 250 MB).' : 'On Android, the phone’s built-in speech recognition is used.'}</p>
          <div className="grid2">
            <label className="field">Language
              <select className="select" value={s.voiceLanguage} onChange={(e) => setSettings({ voiceLanguage: e.target.value })}>
                <option value="">Auto-detect</option><option value="english">English</option><option value="bengali">Bangla</option><option value="hindi">Hindi</option><option value="arabic">Arabic</option>
              </select>
            </label>
            {platformName() !== 'Android' && (
              <label className="field">Whisper model (desktop)
                <select className="select" value={s.whisperModel} onChange={(e) => setSettings({ whisperModel: e.target.value })}>
                  <option value="onnx-community/whisper-tiny">Tiny: fastest, rough</option>
                  <option value="onnx-community/whisper-base">Base: balanced</option>
                  <option value="onnx-community/whisper-small">Small: most accurate, slower</option>
                </select>
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="settings-sec">
          <h3>Reminders</h3>
          <label className="row"><input type="checkbox" checked={s.remindersOn} onChange={(e) => setSettings({ remindersOn: e.target.checked })} /> Notify me before timed tasks and routines</label>
          <div className="grid2">
            <label className="field">Remind me (minutes before)<input className="input" type="number" min={0} step={5} value={s.remindMinutesBefore} onChange={(e) => setSettings({ remindMinutesBefore: Math.max(0, +e.target.value || 0) })} /></label>
            <label className="field">Morning digest<input className="input" type="time" value={s.dailyDigestTime} onChange={(e) => setSettings({ dailyDigestTime: e.target.value || '08:00' })} /></label>
          </div>
          {isDesktop() && login !== null && (
            <label className="row"><input type="checkbox" checked={login} onChange={async (e) => { await desktop()!.setLaunchAtLogin(e.target.checked); setLogin(e.target.checked); }} /> Start Orbit when Windows starts (runs in the tray)</label>
          )}
        </div>
      </div>

      <div className="card" id="sec-backups" style={{ marginBottom: 16, scrollMarginTop: 16 }}>
        <div className="settings-sec">
          <h3>Your data & backups</h3>
          <p>Everything is saved on this device the moment you change it. Finished items are never removed: they move to <b>Done & history</b>, and deleted items stay restorable for 30 days. Orbit also keeps a copy of all your data once a day{isDesktop() ? ', both inside the app and as a file in Documents › Orbit Backups' : ''}. Connect Google Drive to also keep a copy online and use Orbit on your phone and computer together.</p>
          <Snapshots onRestored={() => syncNow()} />
          <div className="row wrap">
            <button className="btn" onClick={() => act('snap', async () => { await dailySnapshot(true); return 'Backup saved'; })}>Back up now</button>
            {isDesktop() && <button className="btn" onClick={() => desktop()?.openBackupFolder?.()}>Open backup folder</button>}
            {!isAndroid() && <button className="btn" onClick={exportJSON}>Save backup file…</button>}
            <label className="btn">Restore from file…<input type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importJSON(f); }} /></label>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="settings-sec">
          <h3>Theme</h3>
          <div className="theme-grid" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.id} role="radio" aria-checked={s.theme === t.id} className={'theme-card' + (s.theme === t.id ? ' on' : '')} onClick={() => setSettings({ theme: t.id })}>
                <span className="theme-prev" style={{ background: t.bg }}>
                  <span className="side" style={{ background: t.side }} />
                  <span className="body">
                    <span className="bar" style={{ background: t.accent, width: '55%' }} />
                    <span className="card-mini" style={{ background: t.card }}><span className="dot2" style={{ background: t.accent }} /><span className="dot2" style={{ background: t.hi }} /></span>
                  </span>
                </span>
                <b>{t.name}</b><span>{t.note}</span>
              </button>
            ))}
          </div>
          <div><button className="btn ghost" onClick={() => openLink('https://console.anthropic.com/settings/keys')}>Get a Claude key ↗</button></div>
        </div>
      </div>
    </div>
  );
}
