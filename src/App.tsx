import { useCallback, useEffect, useState } from 'react';
import { useTasks, useProjects } from './lib/hooks';
import { useSettings } from './lib/settings';
import { useDriveSync } from './lib/driveSync';
import { daysLeft } from './lib/priority';
import { Icon } from './components/icons';
import { Toaster, toast } from './components/ui';
import { backgroundCheck } from './lib/update';
import { TaskEditor } from './components/TaskEditor';
import { QuickAddHost, openQuickAdd } from './components/QuickAdd';
import { aiReady } from './lib/aiProvider';
import { Today } from './views/Today';
import { Matrix } from './views/Matrix';
import { Goals } from './views/Goals';
import { History } from './views/History';
import { Tasks } from './views/Tasks';
import { Routines } from './views/Routines';
import { Projects } from './views/Projects';
import { Notes } from './views/Notes';
import { Calendar } from './views/Calendar';
import { Capture } from './views/Capture';
import { Settings } from './views/Settings';
import type { Task } from './lib/types';
import type { View } from './lib/viewTypes';

const NAV_ALL: { id: View; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'goals', label: 'Weekly Goals', icon: 'goals' },
  { id: 'matrix', label: 'Priorities', icon: 'matrix' },
  { id: 'tasks', label: 'All Tasks', icon: 'tasks' },
  { id: 'routines', label: 'Repeating Tasks', icon: 'routine' },
  { id: 'projects', label: 'Projects', icon: 'projects' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'notes', label: 'Notes & Voice', icon: 'notes' },
  { id: 'history', label: 'Done & History', icon: 'history' },
  { id: 'capture', label: 'Paste & Extract (AI)', icon: 'capture' },
];
/** Kept apart at the bottom of the sidebar; the first two open Settings at that section. */
const NAV_BOTTOM: { id: View; label: string; icon: string; section?: string }[] = [
  { id: 'settings', label: 'Sync & Backup', icon: 'cloud', section: 'sec-drive' },
  { id: 'settings', label: 'Updates', icon: 'update', section: 'sec-updates' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
const TABS: { id: View; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'goals', label: 'Goals', icon: 'goals' },
  { id: 'projects', label: 'Projects', icon: 'projects' },
  { id: 'matrix', label: 'Priorities', icon: 'matrix' },
  { id: 'notes', label: 'Notes', icon: 'notes' },
];

export default function App() {
  const [view, setView] = useState<View>(() => (localStorage.getItem('orbit.view') as View) || 'today');
  const [editing, setEditing] = useState<{ t: Task; isNew: boolean } | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [focus, setFocus] = useState<{ section: string; at: number } | null>(null);
  const tasks = useTasks();
  const projects = useProjects();
  const settings = useSettings();
  const NAV = NAV_ALL.filter((n) => n.id !== 'capture' || aiReady());
  const sync = useDriveSync();

  useEffect(() => { try { localStorage.setItem('orbit.view', view); } catch { /* ignore */ } }, [view]);
  useEffect(() => {
    const t = setTimeout(() => backgroundCheck().then((u) => { if (u) toast(`Orbit ${u.version} is available. Open Settings → Updates.`); }), 5000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (settings.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const go = useCallback((v: View, section?: string) => {
    setView(v); setMoreOpen(false); if (v !== 'projects') setProjectId(null);
    setFocus(section ? { section, at: Date.now() } : null);
    if (!section) document.querySelector('.main')?.scrollTo(0, 0);
  }, []);
  const open = useCallback((t: Task) => setEditing({ t, isNew: !tasks.some((x) => x.id === t.id) }), [tasks]);

  // Keyboard: N = new task, / = capture
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editing) return;
      if (e.key === 'n') { e.preventDefault(); openQuickAdd(); }
      if (e.key === '/') { e.preventDefault(); go('capture'); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [editing, open, go]);

  const urgent = tasks.filter((t) => t.status !== 'done' && (daysLeft(t) ?? 99) <= 0).length;
  const dot = sync.status === 'idle' ? 'ok' : sync.status === 'syncing' ? 'busy' : sync.status === 'error' ? 'err' : '';

  return (
    <div className="app">
      <nav className="nav" aria-label="Main">
        <div className="brand"><span className="brand-mark">◎</span>Orbit</div>
        {NAV.map((n) => (
          <button key={n.id} className={view === n.id ? 'on' : ''} onClick={() => go(n.id)}>
            <Icon name={n.icon} />{n.label}
            {n.id === 'today' && urgent > 0 && <span className="count">{urgent}</span>}
          </button>
        ))}
        <div className="spacer" />
        <div className="nav-bottom">
          {NAV_BOTTOM.map((n) => (
            <button key={n.label} className={view === 'settings' && (focus?.section ?? '') === (n.section ?? '') ? 'on' : ''} onClick={() => go(n.id, n.section)}><Icon name={n.icon} />{n.label}</button>
          ))}
        </div>
        <button className="sync" onClick={() => go('settings', 'sec-drive')} title="Google Drive sync">
          <span className={'dot ' + dot} />{sync.status === 'off' ? 'On this device only' : sync.status === 'syncing' ? 'Syncing…' : sync.status === 'error' ? 'Sync problem' : 'Synced with Drive'}
        </button>
      </nav>

      <main className="main">
        {view === 'today' && <Today open={open} go={go} />}
        {view === 'goals' && <Goals />}
        {view === 'history' && <History open={open} />}
        {view === 'matrix' && <Matrix open={open} />}
        {view === 'tasks' && <Tasks open={open} />}
        {view === 'routines' && <Routines />}
        {view === 'projects' && <Projects open={open} projectId={projectId} setProjectId={setProjectId} />}
        {view === 'notes' && <Notes />}
        {view === 'calendar' && <Calendar open={open} go={go} />}
        {view === 'capture' && <Capture go={go} />}
        {view === 'settings' && <Settings focus={focus} />}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} className={view === t.id ? 'on' : ''} onClick={() => go(t.id)}><Icon name={t.icon} size={21} />{t.label}</button>
        ))}
      </nav>
      <button className="only-sm more-btn" aria-label="More" onClick={() => setMoreOpen(true)}>
        <Icon name="list" />
      </button>
      {moreOpen && (
        <div className="backdrop" onClick={() => setMoreOpen(false)} style={{ placeItems: 'start end' }}>
          <div className="card" style={{ padding: 8, minWidth: 220, marginTop: 40 }} onClick={(e) => e.stopPropagation()}>
            {NAV.map((n) => (
              <button key={n.id} className="trow" style={{ width: '100%', border: 0, background: view === n.id ? 'var(--accent-soft)' : 'none', alignItems: 'center' }} onClick={() => go(n.id)}>
                <Icon name={n.icon} /> {n.label}
              </button>
            ))}
            <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
            {NAV_BOTTOM.map((n) => (
              <button key={n.label} className="trow" style={{ width: '100%', border: 0, background: 'none', alignItems: 'center' }} onClick={() => go(n.id, n.section)}>
                <Icon name={n.icon} /> {n.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && <TaskEditor task={editing.t} isNew={editing.isNew} projects={projects} onClose={() => setEditing(null)} />}
      <QuickAddHost onMore={(t) => setEditing({ t, isNew: true })} />
      <Toaster />
    </div>
  );
}

function emptyTask(): Task {
  return {
    id: crypto.randomUUID(), updated_at: Date.now(), deleted: 0, title: '', details: '', due: null, dueTime: null, start: null, durationMin: null,
    impact: 3, urgency: 2, status: 'todo', doneAt: null, projectId: null, requirements: [], links: [], tags: [], source: 'manual', gcalEventId: null, createdAt: Date.now(),
  };
}
