import { useState } from 'react';
import { extractTasks, type Extraction } from '../lib/ai';
import { useProjects } from '../lib/hooks';
import { useSettings } from '../lib/settings';
import { ExtractReview } from '../components/ExtractReview';
import { ViewHead, errMsg, toast } from '../components/ui';
import { Icon } from '../components/icons';
import type { View } from '../lib/viewTypes';

export function Capture({ go }: { go: (v: View) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Extraction | null>(null);
  const projects = useProjects();
  const s = useSettings();

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true); setResult(null);
    try { setResult(await extractTasks(text, projects.map((p) => p.name))); }
    catch (e) { toast(errMsg(e), true); }
    finally { setBusy(false); }
  };
  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) setText(t); } catch { toast('Clipboard not available. Paste with Ctrl+V.', true); }
  };

  return (
    <div className="view">
      <ViewHead title="Smart capture" sub="Paste an email, message, notice or web page. Claude pulls out the tasks, deadlines, times and everything you need to have ready." />
      {!s.anthropicKey && (
        <div className="card" style={{ padding: 14, marginBottom: 14, borderColor: 'var(--warn)' }}>
          Add your Claude API key first. <button className="btn sm" onClick={() => go('settings')}>Open Settings</button>
        </div>
      )}
      <div className="cap-grid">
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea className="textarea" style={{ minHeight: 320 }} placeholder={'e.g.\n\nDear applicant, please complete the enrolment form by 5 Dec 2026, 23:59 GMT. You will need a scanned passport, your offer letter and the £50 fee. Induction is on 8 Dec at 10:00 in Room 2.14…'}
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); }} />
          <div className="row">
            <button className="btn" onClick={paste}>Paste</button>
            <button className="btn ghost" onClick={() => { setText(''); setResult(null); }}>Clear</button>
            <span style={{ flex: 1 }} />
            <button className="btn primary" disabled={busy || !text.trim()} onClick={run}><Icon name="capture" size={16} /> {busy ? 'Reading…' : 'Extract tasks'}</button>
          </div>
          <div className="small muted">Ctrl+Enter to run · model: {s.aiModel}</div>
        </div>
        <div>
          {busy && <div className="card"><div className="empty" style={{ padding: 20 }}>Claude is reading the text…</div></div>}
          {result && <ExtractReview result={result} projects={projects} source="ai" onDone={() => { setResult(null); setText(''); go('today'); }} />}
          {!busy && !result && <div className="card"><div className="empty" style={{ padding: 20 }}>Extracted tasks show up here for you to check before they are added. Recurring items become routines; meetings become calendar entries.</div></div>}
        </div>
      </div>
    </div>
  );
}
