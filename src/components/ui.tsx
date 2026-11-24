import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon } from './icons';

/* ---------- toast (with optional Undo) ---------- */
export interface ToastAction { label: string; run: () => unknown }
let toastState: { msg: string; err: boolean; id: number; action?: ToastAction } | null = null;
const toastSubs = new Set<() => void>();
const notify = () => toastSubs.forEach((f) => f());
export function toast(msg: string, err = false, action?: ToastAction) {
  const id = Date.now() + Math.random();
  toastState = { msg, err, id, action };
  notify();
  setTimeout(() => { if (toastState?.id === id) { toastState = null; notify(); } }, action ? 10000 : err ? 6000 : 2800);
}
export function Toaster() {
  const t = useSyncExternalStore((cb) => { toastSubs.add(cb); return () => toastSubs.delete(cb); }, () => toastState);
  if (!t) return null;
  return (
    <div className={'toast' + (t.err ? ' err' : '')} role="status">
      <span>{t.msg}</span>
      {t.action && (
        <button className="toast-btn" onClick={async () => {
          const a = t.action!;
          toastState = null; notify();
          try { await a.run(); toast('Undone'); } catch (e) { toast(errMsg(e), true); }
        }}>{t.action.label}</button>
      )}
    </div>
  );
}
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------- explanations on hover ----------
 * Any element with data-tip="…" explains itself: after a short hover with a
 * mouse, on keyboard focus, or on a long-press on a touch screen. One shared
 * bubble, placed above (or below) the element and kept on screen. */
interface TipState { text: string; r: DOMRect }
export function TipHost() {
  const [tip, setTip] = useState<TipState | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);

  useEffect(() => {
    let cur: Element | null = null;
    let timer = 0, press = 0;
    const find = (t: EventTarget | null) => (t instanceof Element ? t.closest('[data-tip]') : null);
    const show = (el: Element) => { const text = el.getAttribute('data-tip'); if (text && el.isConnected) { cur = el; setTip({ text, r: el.getBoundingClientRect() }); } };
    const hide = () => { clearTimeout(timer); clearTimeout(press); cur = null; setTip(null); };
    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = find(e.target);
      if (el === cur) return;
      hide();
      if (el) { cur = el; timer = window.setTimeout(() => show(el), 400); }
    };
    const leave = (e: PointerEvent) => { if (e.pointerType === 'mouse' && !e.relatedTarget) hide(); };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') { hide(); return; }
      const el = find(e.target);
      hide();
      if (!el) return;
      press = window.setTimeout(() => {
        show(el);
        // the finger lifting after a long-press should not also press the button
        const stop = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
        window.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 900);
      }, 550);
    };
    const up = () => clearTimeout(press);
    const focus = (e: FocusEvent) => { const t = e.target as Element; const el = find(t); if (el && t.matches(':focus-visible')) show(el); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    const menu = (e: Event) => { if (cur && find(e.target)) e.preventDefault(); }; // no long-press menu over a tip
    window.addEventListener('pointerover', over);
    window.addEventListener('pointerout', leave);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('contextmenu', menu);
    window.addEventListener('focusin', focus);
    window.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', hide);
    return () => {
      hide();
      window.removeEventListener('pointerover', over);
      window.removeEventListener('pointerout', leave);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('contextmenu', menu);
      window.removeEventListener('focusin', focus);
      window.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', hide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tip || !box.current) { setPos(null); return; }
    const w = box.current.offsetWidth, h = box.current.offsetHeight, m = 10;
    const below = tip.r.top - h - 8 < m;
    const left = Math.min(Math.max(tip.r.left + tip.r.width / 2 - w / 2, m), window.innerWidth - w - m);
    setPos({ left, top: below ? tip.r.bottom + 8 : tip.r.top - h - 8, below });
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={box} className={'tip' + (pos?.below ? ' below' : '')} role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}>{tip.text}</div>
  );
}

/** A small "i" that explains the thing next to it (hover, focus or long-press). */
export function Info({ tip }: { tip: string }) {
  return <span className="info-i" tabIndex={0} role="img" aria-label={tip} data-tip={tip}>i</span>;
}

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
