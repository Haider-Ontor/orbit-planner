import { useEffect, useState } from 'react';
import { useSettings, setSettings } from '../lib/settings';
import { useSync, signIn, signOut, initSync, syncNow } from '../lib/sync';
import { connectGoogle, disconnectGoogle, gcalAvailable, syncCalendar } from '../lib/gcal';
import { desktop, isDesktop, isAndroid, platformName, openLink } from '../lib/platform';
import { exportAll, restoreFrom, dailySnapshot } from '../lib/backup';
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
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="settings-sec">
        <div className="row wrap">
          <h3 style={{ flex: 1 }}>⬆ Updates</h3>
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

export function Settings() {
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
          <h3>✨ AI (Claude)</h3>
          <p>Used for smart capture and for organising notes. Get a key at console.anthropic.com → API keys.</p>
          <label className="field">Claude API key
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
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="settings-sec">
          <h3>☁ Cloud sync (Supabase)</h3>
          <p>Keeps the Windows app and the Android app in sync. Create a free project at supabase.com, run <code>supabase/schema.sql</code> in its SQL editor, then paste the project URL and anon key here on both devices and sign in with the same account.</p>
          <div className="grid2">
            <label className="field">Project URL<input className="input" value={s.supabaseUrl} placeholder="https://xxxx.supabase.co" onChange={(e) => setSettings({ supabaseUrl: e.target.value.trim(), lastPull: '' })} /></label>
            <label className="field">Anon (public) key<input className="input" type="password" value={s.supabaseAnonKey} onChange={(e) => setSettings({ supabaseAnonKey: e.target.value.trim(), lastPull: '' })} /></label>
          </div>
          {s.supabaseUrl && s.supabaseAnonKey && sync.status === 'off' && <button className="btn" onClick={() => initSync()}>Connect</button>}
          {sync.email ? (
            <div className="row wrap">
              <span className="ok-line">Signed in as {sync.email}</span>
              <span className="muted small">{sync.message}{sync.lastSync ? ` · ${new Date(sync.lastSync).toLocaleTimeString()}` : ''}</span>
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={() => syncNow()}>Sync now</button>
              <button className="btn" onClick={() => act('out', signOut)}>Sign out</button>
            </div>
          ) : sync.status !== 'off' && (
            <div className="grid2">
              <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="input" placeholder="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button className="btn primary" disabled={!!busy} onClick={() => act('in', () => signIn(email, pw, false))}>Sign in</button>
              <button className="btn" disabled={!!busy} onClick={() => act('up', () => signIn(email, pw, true))}>Create account</button>
            </div>
          )}
          {sync.status === 'error' && <div className="small" style={{ color: 'var(--danger)' }}>{sync.message}</div>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="settings-sec">
          <h3>📅 Google Calendar</h3>
          <p>Timed tasks are added to your Google Calendar and your events show up in Today and Agenda. Connect from the Windows app; the phone gets events through cloud sync.</p>
          {gcalAvailable() ? (<>
            <div className="grid2">
              <label className="field">OAuth client ID (Desktop app)<input className="input" value={s.googleClientId} placeholder="…apps.googleusercontent.com" onChange={(e) => setSettings({ googleClientId: e.target.value.trim() })} /></label>
              <label className="field">Client secret<input className="input" type="password" value={s.googleClientSecret} onChange={(e) => setSettings({ googleClientSecret: e.target.value.trim() })} /></label>
            </div>
            <p>Create these at console.cloud.google.com → APIs & Services: enable “Google Calendar API”, then Credentials → Create OAuth client ID → Application type “Desktop app”. Full steps are in README.md.</p>
            {s.googleRefreshToken ? (
              <div className="row wrap">
                <span className="ok-line">Connected{s.googleEmail ? ` as ${s.googleEmail}` : ''}</span><span style={{ flex: 1 }} />
                <button className="btn" disabled={!!busy} onClick={() => act('cal', syncCalendar)}>{busy === 'cal' ? 'Syncing…' : 'Sync now'}</button>
                <button className="btn" onClick={() => disconnectGoogle()}>Disconnect</button>
              </div>
            ) : <div><button className="btn primary" disabled={!s.googleClientId || !!busy} onClick={() => act('g', async () => { await connectGoogle(); await syncCalendar(); return 'Google Calendar connected'; })}>{busy === 'g' ? 'Waiting for browser…' : 'Connect Google Calendar'}</button></div>}
          </>) : <div className="small muted">Open Orbit on Windows to connect. Events already synced from there appear here automatically.</div>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="settings-sec">
          <h3>🎙 Voice notes</h3>
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
          <h3>🔔 Reminders</h3>
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

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="settings-sec">
          <h3>💾 Your data & backups</h3>
          <p>Everything is saved on this device the moment you change it. Finished items are never removed: they move to <b>Done & history</b>, and deleted items stay restorable for 30 days. Orbit also keeps a copy of all your data once a day{isDesktop() ? ', both inside the app and as a file in Documents\Orbit Backups' : ''}. Turn on cloud sync to also keep a copy online and on your other device.</p>
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
          <h3>Appearance</h3>
          <div className="seg" style={{ alignSelf: 'flex-start' }}>
            {(['system', 'light', 'dark'] as const).map((t) => <button key={t} className={s.theme === t ? 'on' : ''} onClick={() => setSettings({ theme: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
          <div><button className="btn ghost" onClick={() => openLink('https://console.anthropic.com/settings/keys')}>Get a Claude key ↗</button></div>
        </div>
      </div>
    </div>
  );
}
