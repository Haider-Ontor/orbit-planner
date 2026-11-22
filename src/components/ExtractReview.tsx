import { useState } from 'react';
import type { Extraction, ExtractedTask } from '../lib/ai';
import { saveExtracted } from '../lib/models';
import type { Project } from '../lib/types';
import { QUADRANTS, quadrantOf } from '../lib/priority';
import { newTask } from '../lib/models';
import { niceDate, niceTime } from '../lib/dates';
import { toast } from './ui';

/** Shows what Claude extracted; the user unticks or edits before anything is saved. */
export function ExtractReview({ result, projects, source, onDone }: { result: Extraction; projects: Project[]; source: 'ai' | 'voice'; onDone: (n: number) => void }) {
  const [items, setItems] = useState(result.tasks.map((t) => ({ t, on: true })));
  const up = (i: number, p: Partial<ExtractedTask>) => setItems((cur) => cur.map((x, j) => (j === i ? { ...x, t: { ...x.t, ...p } } : x)));
  const chosen = items.filter((x) => x.on);

  const add = async () => {
    const map = new Map(projects.map((p) => [p.name.toLowerCase(), p.id]));
    const n = await saveExtracted(chosen.map((x) => x.t), map, source);
    toast(`Added ${n} item${n === 1 ? '' : 's'}`);
    onDone(n);
  };

  if (!items.length) return <div className="empty">Nothing actionable found. {result.summary}</div>;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="small muted">{result.summary}</div>
      {items.map(({ t, on }, i) => {
        const q = QUADRANTS[quadrantOf(newTask({ impact: t.impact, urgency: t.urgency, due: t.due_date }))];
        return (
          <div key={i} className={'card xcard' + (on ? '' : ' off')}>
            <div className="row">
              <input type="checkbox" checked={on} onChange={(e) => setItems((cur) => cur.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} aria-label="Include" />
              <input className="input" style={{ fontWeight: 600 }} value={t.title} onChange={(e) => up(i, { title: e.target.value })} />
            </div>
            {t.details && <div className="small muted">{t.details}</div>}
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="chip"><i className="qdot" style={{ background: q.color }} />{q.label}</span>
              {t.repeat && <span className="chip ok">↻ {t.repeat}</span>}
              {t.start_datetime && <span className="chip">📅 {niceDate(t.start_datetime.slice(0, 10))} {niceTime(t.start_datetime.slice(11, 16))}</span>}
              {t.project_hint && <span className="chip">{t.project_hint}</span>}
            </div>
            {!t.repeat && !t.start_datetime && (
              <div className="grid2">
                <label className="field">Due<input className="input" type="date" value={t.due_date ?? ''} onChange={(e) => up(i, { due_date: e.target.value || null })} /></label>
                <label className="field">Time<input className="input" type="time" value={t.due_time ?? ''} onChange={(e) => up(i, { due_time: e.target.value || null })} /></label>
              </div>
            )}
            {t.requirements.length > 0 && (
              <div>
                <div className="small" style={{ fontWeight: 700, color: 'var(--ink-2)', marginBottom: 2 }}>You'll need</div>
                {t.requirements.map((r, k) => <div className="req" key={k}>☐ {r}</div>)}
              </div>
            )}
            {t.links.length > 0 && <div className="small muted" style={{ overflowWrap: 'anywhere' }}>{t.links.join(' · ')}</div>}
          </div>
        );
      })}
      <div className="row"><span className="grow" style={{ flex: 1 }} />
        <button className="btn primary" disabled={!chosen.length} onClick={add}>Add {chosen.length} to Orbit</button>
      </div>
    </div>
  );
}
