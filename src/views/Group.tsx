import { useState, type CSSProperties } from 'react';
import { useProjects } from '../lib/hooks';
import { save } from '../lib/db';
import { removeWithUndo, saveWithUndo } from '../lib/undo';
import { newGroup, newMember, memberStats, projectProgress, deadlinesOf, MEMBER_COLORS, type MemberStats } from '../lib/models';
import { deadlineText, countdown } from '../lib/deadline';
import { PlanEditor } from '../components/Plan';
import { Avatar } from '../components/StepBits';
import { ViewHead, Progress, Modal, Info } from '../components/ui';
import { Icon } from '../components/icons';
import type { Member, Project } from '../lib/types';

/* Group work: share out a project between people, give each piece of work a
 * deadline, a timeline and a progress bar, and see how everyone is doing. */

export function Group({ groupId: id, setGroupId: setId }: { groupId: string | null; setGroupId: (id: string | null) => void }) {
  const projects = useProjects();
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const groups = projects.filter((p) => p.kind === 'group');
  const current = groups.find((g) => g.id === id);
  if (current) return <GroupDetail p={current} back={() => setId(null)} />;

  const shown = groups.filter((g) => !!g.archived === archived);
  return (
    <div className="view">
      <ViewHead title="Group work" sub="Share out the work, give each part a deadline, and track everyone's progress.">
        <div className="seg">
          <button className={!archived ? 'on' : ''} onClick={() => setArchived(false)}>Active</button>
          <button className={archived ? 'on' : ''} onClick={() => setArchived(true)} data-tip="Groups you archived when the work was over.">Archived</button>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> New group</button>
      </ViewHead>

      <div className="proj-grid">
        {shown.map((g) => <GroupCard key={g.id} g={g} onOpen={() => setId(g.id)} />)}
        {!shown.length && (
          <div className="card"><div className="empty" style={{ padding: 24 }}>
            {archived ? 'No archived groups.' : <>
              <b>No group work yet.</b><br />
              Make a group for a team project or lab report, add the people in it, then give each person their part with a deadline. You'll see everyone's progress in one place.
              <div style={{ marginTop: 12 }}><button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> New group</button></div>
            </>}
          </div></div>
        )}
      </div>
      {creating && <NewGroup onClose={(newId) => { setCreating(false); if (newId) setId(newId); }} />}
      <button className="fab" aria-label="New group" onClick={() => setCreating(true)}>+</button>
    </div>
  );
}

function AvatarStack({ members }: { members: Member[] }) {
  const show = members.slice(0, 5);
  return (
    <span className="avatar-stack" aria-label={members.map((m) => m.name).join(', ')}>
      {show.map((m) => <span key={m.id} data-tip={m.name + (m.role ? ` · ${m.role}` : '')}><Avatar m={m} size={26} /></span>)}
      {members.length > show.length && <span className="avatar more" style={{ width: 26, height: 26 }}>+{members.length - show.length}</span>}
    </span>
  );
}

function GroupCard({ g, onOpen }: { g: Project; onOpen: () => void }) {
  const pr = projectProgress(g);
  const total = g.plan.length, done = g.plan.filter((t) => t.done).length;
  const now = Date.now();
  const dl = deadlinesOf([g]);
  const late = dl.filter((d) => d.at < now).length;
  const next = dl.find((d) => d.at >= now);
  return (
    <div className="card proj" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      <div className="row"><AvatarStack members={g.members ?? []} /><span style={{ flex: 1 }} />
        {late > 0 && <span className="chip over" data-tip="Pieces of work (or sub-tasks) whose deadline has passed and aren't done.">{late} overdue</span>}
        {total > 0 && done === total && <span className="chip ok">Complete</span>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 16 }}>{g.name}</div>
      <Progress value={pr} />
      <div className="row small muted"><span>{total ? `${done} of ${total} parts done · ${pr}%` : 'No work shared out yet'}</span></div>
      {next && <div className="small ellipsis">Next: <b>{next.name}</b>{next.who ? ` (${next.who})` : ''} · {deadlineText(next.due, next.dueTime)}</div>}
    </div>
  );
}

/* ---------- one group ---------- */
function GroupDetail({ p, back }: { p: Project; back: () => void }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const members = p.members ?? [];
  const stats = memberStats(p);
  const pr = projectProgress(p);
  const total = p.plan.length, done = p.plan.filter((t) => t.done).length;
  const now = Date.now();
  const late = deadlinesOf([p]).filter((d) => d.at < now).length;
  const filterName = filter === 'none' ? 'work nobody has yet' : members.find((m) => m.id === filter)?.name + "'s work";

  const saveMember = async (m: Member) => {
    const exists = members.some((x) => x.id === m.id);
    await save('projects', { ...p, members: exists ? members.map((x) => (x.id === m.id ? m : x)) : [...members, m] });
  };
  const removeMember = async (m: Member) => {
    const n = p.plan.filter((t) => t.assignee === m.id).length;
    if (filter === m.id) setFilter(null);
    await saveWithUndo('projects', p, { ...p, members: members.filter((x) => x.id !== m.id), plan: p.plan.map((t) => (t.assignee === m.id ? { ...t, assignee: null } : t)) },
      `Removed ${m.name}${n ? `; their ${n} part${n === 1 ? ' is' : 's are'} now unassigned` : ''}`);
  };

  return (
    <div className="view" style={{ maxWidth: 1000 }}>
      <div className="view-head">
        <button className="btn ghost" onClick={back}><Icon name="back" size={16} /> Group work</button>
        <div className="grow" />
        <button className="btn sm" onClick={() => setRenaming(true)} data-tip="Rename the group, or archive it when the work is over.">Edit</button>
        <button className="btn sm danger" data-tip="Delete the group and its work. You can undo, or restore it from Done & history → Recently deleted."
          onClick={async () => { if (confirm(`Delete "${p.name}"? You can restore it from Done & history → Recently deleted.`)) { await removeWithUndo('projects', p.id, p.name); back(); } }}>Delete</button>
      </div>
      <h1 style={{ margin: '0 0 14px', fontSize: 22, overflowWrap: 'anywhere' }}>{p.name}</h1>

      <div className="card group-sum">
        <div data-tip="Average progress of all the work in this group."><div className="n">{pr}%</div><div className="l">Overall</div></div>
        <div style={{ flex: 1, minWidth: 150 }}><Progress value={pr} /><div className="small muted" style={{ marginTop: 6 }}>{total ? `${done} of ${total} parts done` : 'Add the work below'}</div></div>
        <div data-tip="How many people are in the group."><div className="n">{members.length}</div><div className="l">People</div></div>
        <div className={late ? 'warn' : ''} data-tip="Pieces of work (or sub-tasks) past their deadline and not done."><div className="n">{late}</div><div className="l">Overdue</div></div>
      </div>

      <div className="group-grid">
        <div className="card">
          <div className="card-h">
            <span>People <Info tip="Everyone in the group and how far along their part is. Tap a person to see only their work; tap again to see everyone." /></span>
            <span className="grow" />
            <button className="btn sm" onClick={() => setEditing('new')}><Icon name="plus" size={14} /> Add person</button>
          </div>
          <div className="card-b people">
            {stats.map((st) => (
              <PersonRow key={st.member?.id ?? 'none'} st={st} on={filter === (st.member?.id ?? 'none')}
                onPick={() => setFilter(filter === (st.member?.id ?? 'none') ? null : st.member?.id ?? 'none')}
                onEdit={st.member ? () => setEditing(st.member!) : undefined} />
            ))}
            {!members.length && <div className="empty">No one in this group yet. Tap <b>Add person</b>.</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <span>Work <Info tip="Each piece of work has who does it, a deadline, an optional start date (for the timeline), a priority and a progress bar. Open one to change it, or add sub-tasks to track it step by step." /></span>
            <span className="grow" />
            {filter && <button className="btn sm ghost" onClick={() => setFilter(null)}><Icon name="x" size={14} /> Show everyone</button>}
          </div>
          <div className="card-b" style={{ padding: 14 }}>
            {filter && <div className="filter-note small">Showing {filterName}</div>}
            <PlanEditor project={p} onChange={(next) => save('projects', next)} members={members} filter={filter} />
          </div>
        </div>
      </div>

      {editing && <MemberEditor m={editing === 'new' ? newMember({ color: (members.length) % MEMBER_COLORS }) : editing} isNew={editing === 'new'}
        onSave={saveMember} onRemove={editing !== 'new' ? () => removeMember(editing) : undefined} onClose={() => setEditing(null)} />}
      {renaming && <EditGroup p={p} onClose={() => setRenaming(false)} />}
    </div>
  );
}

function PersonRow({ st, on, onPick, onEdit }: { st: MemberStats; on: boolean; onPick: () => void; onEdit?: () => void }) {
  const m = st.member;
  const cd = st.next ? countdown(st.next.due, st.next.dueTime) : null;
  return (
    <div className={'person' + (on ? ' on' : '')}>
      <button className="person-main" onClick={onPick} aria-pressed={on}
        data-tip={on ? 'Showing only their work. Tap again to show everyone.' : `Show only ${m ? `${m.name}'s` : 'unassigned'} work.`}>
        <Avatar m={m} size={34} />
        <span className="person-text">
          <span className="person-name">{m ? m.name : 'Not assigned yet'}{m?.role && <span className="muted"> · {m.role}</span>}</span>
          <span className="person-bar" style={{ '--pc': m ? `var(--m${m.color % 8})` : 'var(--ink-3)' } as CSSProperties}><i style={{ width: `${st.progress}%` }} /></span>
          <span className="person-meta small">
            <b className="tnum">{st.progress}%</b>
            <span>{st.total ? `${st.done}/${st.total} done` : 'No work yet'}</span>
            {st.overdue > 0 && <span className="late-text">{st.overdue} overdue</span>}
            {st.next && <span className="ellipsis">Next: {st.next.name} · {deadlineText(st.next.due, st.next.dueTime)}{cd?.text && !cd.text.startsWith('Due') ? ` · ${cd.text}` : ''}</span>}
          </span>
        </span>
      </button>
      {onEdit && <button className="icon-btn" onClick={onEdit} aria-label={`Edit ${m?.name}`} data-tip="Change their name, role or colour, or remove them."><Icon name="pen" size={15} /></button>}
    </div>
  );
}

function MemberEditor({ m, isNew, onSave, onRemove, onClose }: { m: Member; isNew: boolean; onSave: (m: Member) => void; onRemove?: () => void; onClose: () => void }) {
  const [name, setName] = useState(m.name);
  const [role, setRole] = useState(m.role);
  const [color, setColor] = useState(m.color);
  const ok = () => { if (!name.trim()) return; onSave({ ...m, name: name.trim(), role: role.trim(), color }); onClose(); };
  return (
    <Modal title={isNew ? 'Add a person' : `Edit ${m.name}`} onClose={onClose} footer={<>
      {onRemove && <button className="btn ghost danger" onClick={() => { onRemove(); onClose(); }} data-tip="Take them out of the group. Their work stays, marked 'Not assigned'. You can undo.">Remove from group</button>}
      <div className="grow" />
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!name.trim()} onClick={ok}>{isNew ? 'Add' : 'Save'}</button>
    </>}>
      <label className="field">Name<input className="input" autoFocus value={name} placeholder="e.g. Rahim" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} /></label>
      <label className="field">Role (optional)<input className="input" value={role} placeholder="e.g. Writes the introduction" onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} /></label>
      <div className="field"><span>Colour</span>
        <div className="swatches" role="radiogroup" aria-label="Colour">
          {Array.from({ length: MEMBER_COLORS }, (_, i) => (
            <button key={i} role="radio" aria-checked={color === i} aria-label={`Colour ${i + 1}`} className={'swatch' + (color === i ? ' on' : '')} style={{ background: `var(--m${i})` }} onClick={() => setColor(i)} />
          ))}
        </div>
      </div>
      <div className="row" style={{ gap: 10 }}><Avatar m={{ ...m, name: name || '?', color }} size={34} /><span className="small muted">This is how they'll show next to their work.</span></div>
    </Modal>
  );
}

function NewGroup({ onClose }: { onClose: (id?: string) => void }) {
  const [name, setName] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [person, setPerson] = useState('');
  const addPerson = () => { const n = person.trim(); if (!n) return; setPeople([...people, n]); setPerson(''); };
  const create = async () => {
    if (!name.trim()) return;
    const extra = person.trim() ? [...people, person.trim()] : people; // a name typed but not added yet still counts
    const g = newGroup(name.trim(), extra);
    await save('projects', g);
    onClose(g.id);
  };
  return (
    <Modal title="New group" onClose={() => onClose()} footer={<><div className="grow" /><button className="btn" onClick={() => onClose()}>Cancel</button><button className="btn primary" disabled={!name.trim()} onClick={create}>Create</button></>}>
      <label className="field">What's the group work?<input className="input big-in" autoFocus placeholder="e.g. Robotics lab report" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="field"><span>Who's in the group? <span className="muted">(you can add more later)</span></span>
        <div className="people-chips">
          <span className="chip ok" data-tip="You're in every group, so you can give yourself work too. You can rename yourself later.">You</span>
          {people.map((n, i) => (
            <span key={i} className="chip">{n}<button className="chip-x" aria-label={`Remove ${n}`} onClick={() => setPeople(people.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button></span>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" placeholder="Add a name, then Enter" value={person} onChange={(e) => setPerson(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }} />
          <button className="btn" onClick={addPerson} disabled={!person.trim()}>Add</button>
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Next you'll add the pieces of work, choose who does each one, and give it a deadline.</p>
    </Modal>
  );
}

function EditGroup({ p, onClose }: { p: Project; onClose: () => void }) {
  const [name, setName] = useState(p.name);
  const ok = async () => { await save('projects', { ...p, name: name.trim() || p.name }); onClose(); };
  return (
    <Modal title="Edit group" onClose={onClose} footer={<>
      <button className="btn" onClick={async () => { await saveWithUndo('projects', p, { ...p, archived: !p.archived }, p.archived ? `Back in active groups: ${p.name}` : `Archived: ${p.name} (see Group work → Archived)`); onClose(); }}
        data-tip={p.archived ? 'Move it back to your active groups.' : 'Put it away when the work is over. It keeps everything and can be brought back.'}>{p.archived ? 'Unarchive' : 'Archive'}</button>
      <div className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={ok}>Save</button></>}>
      <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} /></label>
    </Modal>
  );
}
