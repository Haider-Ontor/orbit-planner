import { save, remove, restore } from './db';
import { toast } from '../components/ui';
import type { Base, SyncKind } from './types';

/* Every change a stray tap can cause (finishing, unticking, deleting) goes
 * through here and shows an Undo button for 10 seconds. Undo writes the
 * record back exactly as it was. */

const short = (s: string) => (s.length > 40 ? s.slice(0, 38) + '…' : s);

/** Save `next`, and offer Undo back to `before`. */
export async function saveWithUndo<T extends Base>(kind: SyncKind, before: T, next: T, msg: string) {
  await save(kind, next);
  toast(msg, false, { label: 'Undo', run: () => save(kind, before) });
}

/** Soft-delete with Undo (also restorable later from Done & history → Recently deleted). */
export async function removeWithUndo(kind: SyncKind, id: string, what: string) {
  const before = await remove(kind, id);
  if (!before) return;
  toast(`Deleted ${short(what)}`, false, { label: 'Undo', run: () => restore(kind, id) });
}

export const doneMsg = (title: string, done: boolean) => (done ? `Done: ${short(title)}` : `Reopened: ${short(title)}`);
