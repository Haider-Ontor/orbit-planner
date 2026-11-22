import { useEffect, useRef, useState } from 'react';
import { useNotes, useProjects } from '../lib/hooks';
import { db, save, remove } from '../lib/db';
import { newNote } from '../lib/models';
import { startVoice, transcribe, type VoiceSession } from '../lib/voice';
import { organizeNote, type Extraction } from '../lib/ai';
import { isAndroid } from '../lib/platform';
import { ExtractReview } from '../components/ExtractReview';
import { Modal, ViewHead, errMsg, toast } from '../components/ui';
import { Icon } from '../components/icons';
import type { Note } from '../lib/types';

export function Notes() {
  const notes = useNotes();
  const projects = useProjects();
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [rec, setRec] = useState<VoiceSession | null>(null);
  const [live, setLive] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ note: Note; result: Extraction } | null>(null);
  const [mobileList, setMobileList] = useState(true);

  const current = notes.find((n) => n.id === sel) ?? null;
  const shown = notes.filter((n) => !q || (n.title + ' ' + n.body).toLowerCase().includes(q.toLowerCase()));

  const create = async () => {
    const n = await save('notes', newNote({ title: '' }));
    setSel(n.id); setMobileList(false);
  };

  const startRec = async () => {
    try {
      setLive(''); setStatus('Starting…');
      const s = await startVoice({ onPartial: setLive, onStatus: setStatus });
      setRec(s);
    } catch (e) { setStatus(''); toast(errMsg(e), true); }
  };
  const stopRec = async () => {
    if (!rec) return;
    const s = rec; setRec(null); setBusy(true);
    try {
      const { text, audio } = await s.stop();
      const stamp = new Date().toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const n = newNote({ title: `Voice note · ${stamp}`, body: text || '(no speech recognised)', kind: 'voice', hasAudio: !!audio });
      await save('notes', n);
      if (audio) await db.audio.put({ id: n.id, blob: audio, mime: audio.type });
      setSel(n.id); setMobileList(false);
      toast(text ? 'Voice note saved' : 'Saved, but no speech was recognised', !text);
    } catch (e) { toast(errMsg(e), true); }
    finally { setBusy(false); setStatus(''); setLive(''); }
  };

  const organize = async (n: Note) => {
    if (!n.body.trim()) return;
    setBusy(true); setStatus('Claude is organising this note…');
    try {
      const result = await organizeNote(n.title, n.body, projects.map((p) => p.name));
      setReview({ note: n, result });
    } catch (e) { toast(errMsg(e), true); }
    finally { setBusy(false); setStatus(''); }
  };

  return (
    <div className="view" style={{ maxWidth: 1240 }}>
      <ViewHead title="Notes" sub="Write or speak. Voice notes are transcribed, then Claude can turn them into tasks.">
        {rec ? <button className="btn rec" onClick={stopRec}><span className="pulse" /> Stop & save</button>
          : <button className="btn" onClick={startRec} disabled={busy}><Icon name="mic" size={16} /> Voice note</button>}
        <button className="btn primary" onClick={create}><Icon name="plus" size={16} /> Note</button>
      </ViewHead>

      {(rec || status) && (
        <div className="voice-live" style={{ marginBottom: 14 }}>
          <div className="row">{rec && <span className="pulse" />}<b>{status}</b></div>
          {live && <div style={{ marginTop: 6 }}>{live}</div>}
          {rec && !isAndroid() && <div className="small muted" style={{ marginTop: 4 }}>Speak freely. Transcription runs on this computer when you stop.</div>}
        </div>
      )}

      <div className="notes-layout">
        <div className={'card note-list' + (current && !mobileList ? ' hide-on-sm' : '')} style={{ padding: 8 }}>
          <input className="input" placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />
          {shown.map((n) => (
            <div key={n.id} className={'note-item' + (n.id === sel ? ' on' : '')} onClick={() => { setSel(n.id); setMobileList(false); }}>
              <div className="ttl">{n.kind === 'voice' ? '🎙 ' : ''}{n.title || 'Untitled'}</div>
              <div className="pv">{n.body || 'Empty note'}</div>
              <div className="small muted">{new Date(n.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{n.organized ? ' · ✓ organised' : ''}</div>
            </div>
          ))}
          {!shown.length && <div className="empty">No notes yet.</div>}
        </div>
        {current ? (
          <NoteEditor key={current.id} note={current} projects={projects} busy={busy}
            onOrganize={() => organize(current)} onBack={() => setMobileList(true)}
            onDelete={async () => { await remove('notes', current.id); setSel(null); setMobileList(true); }} />
        ) : (
          <div className="card"><div className="empty" style={{ padding: 30 }}>Select a note, write a new one, or record a voice note.</div></div>
        )}
      </div>

      {review && (
        <Modal title="Tasks from your note" onClose={() => setReview(null)}>
          <ExtractReview result={review.result} projects={projects} source="voice"
            onDone={async () => { await save('notes', { ...review.note, organized: true }); setReview(null); }} />
        </Modal>
      )}
      <style>{`@media (max-width:760px){ .hide-on-sm{display:none} }`}</style>
    </div>
  );
}

function NoteEditor({ note, projects, busy, onOrganize, onDelete, onBack }: {
  note: Note; projects: { id: string; name: string }[]; busy: boolean; onOrganize: () => void; onDelete: () => void; onBack: () => void;
}) {
  const [n, setN] = useState(note);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [retrans, setRetrans] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Note | null>(null); // unsaved edit, flushed on unmount

  useEffect(() => {
    let url: string | null = null;
    if (note.hasAudio) db.audio.get(note.id).then((a) => { if (a) { url = URL.createObjectURL(a.blob); setAudioUrl(url); } });
    return () => {
      if (url) URL.revokeObjectURL(url);
      clearTimeout(timer.current);
      if (pending.current) save('notes', pending.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const up = (p: Partial<Note>) => {
    const next = { ...n, ...p };
    setN(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { pending.current = null; save('notes', next); }, 600);
  };
  const del = () => { clearTimeout(timer.current); pending.current = null; onDelete(); };

  const redo = async () => {
    const a = await db.audio.get(note.id);
    if (!a) return;
    try { const text = await transcribe(a.blob, { onStatus: setRetrans }); up({ body: text }); }
    catch (e) { toast(errMsg(e), true); }
    finally { setRetrans(''); }
  };

  return (
    <div className="card note-editor">
      <div className="row wrap">
        <button className="btn ghost sm only-sm" onClick={onBack}><Icon name="back" size={14} /> Notes</button>
        <select className="select" style={{ width: 'auto' }} value={n.projectId ?? ''} onChange={(e) => up({ projectId: e.target.value || null })}>
          <option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button className="btn" disabled={busy || !n.body.trim()} onClick={onOrganize}><Icon name="capture" size={15} /> Organise into tasks</button>
        <button className="btn ghost danger" onClick={del} aria-label="Delete note"><Icon name="trash" size={15} /></button>
      </div>
      <input className="title-in" placeholder="Title" autoFocus={!note.title && !note.body} value={n.title} onChange={(e) => up({ title: e.target.value })} />
      {audioUrl && (
        <div className="row wrap">
          <audio controls src={audioUrl} style={{ height: 36, maxWidth: '100%' }} />
          <button className="btn sm" onClick={redo} disabled={!!retrans}>{retrans || 'Re-transcribe'}</button>
        </div>
      )}
      <textarea className="body-in" placeholder="Start writing…" value={n.body} onChange={(e) => up({ body: e.target.value })} />
    </div>
  );
}
