import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Icon } from './icons';

/* ---------- toast ---------- */
let toastState: { msg: string; err: boolean; id: number } | null = null;
const toastSubs = new Set<() => void>();
export function toast(msg: string, err = false) {
  const id = Date.now();
  toastState = { msg, err, id };
  toastSubs.forEach((f) => f());
  setTimeout(() => { if (toastState?.id === id) { toastState = null; toastSubs.forEach((f) => f()); } }, err ? 6000 : 2800);
}
export function Toaster() {
  const t = useSyncExternalStore((cb) => { toastSubs.add(cb); return () => toastSubs.delete(cb); }, () => toastState);
  return t ? <div className={'toast' + (t.err ? ' err' : '')} role="status">{t.msg}</div> : null;
}
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-h"><span style={{ flex: 1 }}>{title}</span>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Check({ on, onClick, round, label }: { on: boolean; onClick: () => void; round?: boolean; label?: string }) {
  return (
    <button className={'check' + (on ? ' on' : '') + (round ? ' round' : '')} aria-pressed={on} aria-label={label || 'Toggle done'}
      onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {on && <Icon name="check" size={13} stroke={3} />}
    </button>
  );
}

export function ViewHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="view-head">
      <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
      <div className="grow" />
      {children}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return <div className="prog" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${value}%` }} /></div>;
}
