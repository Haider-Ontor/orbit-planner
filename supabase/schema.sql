-- Orbit cloud sync. Run once in Supabase → SQL Editor.
-- One table holds every record (tasks, routines, projects, notes, calendar events) as JSON.
-- Row Level Security keeps each user's rows private.

create table if not exists public.items (
  id          text primary key,            -- "<kind>:<uuid>"
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind        text not null,
  data        jsonb not null,
  updated_at  bigint not null,             -- client clock, ms (last write wins)
  deleted     boolean not null default false,
  synced_at   timestamptz not null default now()  -- server clock, pull cursor
);

create index if not exists items_user_synced on public.items (user_id, synced_at);

alter table public.items enable row level security;

drop policy if exists "own rows" on public.items;
create policy "own rows" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Refuse writes older than what is stored; stamp the server time on accepted writes.
create or replace function public.items_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'cannot change owner';
    end if;
    if new.updated_at < old.updated_at then
      return null;  -- keep the newer stored version
    end if;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists items_guard on public.items;
create trigger items_guard before insert or update on public.items
  for each row execute function public.items_guard();

-- Realtime: lets the other device pull immediately after a change.
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;
