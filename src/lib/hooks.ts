import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, alive } from './db';
import { normalizeProject } from './models';
import type { Task, Routine, Project, Note, CalEvent } from './types';

export const useTasks = () => useLiveQuery(async () => alive(await db.tasks.toArray()), [], [] as Task[]);
export const useRoutines = () => useLiveQuery(async () => alive(await db.routines.toArray()), [], [] as Routine[]);
export const useProjects = () => useLiveQuery(async () => alive(await db.projects.toArray()).map(normalizeProject).sort((a, b) => a.createdAt - b.createdAt), [], [] as Project[]);
export const useNotes = () => useLiveQuery(async () => alive(await db.notes.toArray()).sort((a, b) => b.updated_at - a.updated_at), [], [] as Note[]);
export const useEvents = () => useLiveQuery(async () => alive(await db.events.toArray()).sort((a, b) => a.start.localeCompare(b.start)), [], [] as CalEvent[]);

export function useProjectMap() {
  const projects = useProjects();
  return useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
}

export const useGoals = () => useLiveQuery(async () => alive(await db.goals.toArray()).sort((a, b) => a.createdAt - b.createdAt), [], [] as import('./types').Goal[]);
