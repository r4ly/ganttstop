-- =============================================================================
-- COLLABORATION MIGRATION  (safe to re-run)
-- Run this in your Supabase project → SQL Editor
-- =============================================================================

-- 1. Drop and recreate gantt_chart_collaborators with the correct schema
--    (the table was scaffolded earlier with different column names)
-- =============================================================================
drop table if exists gantt_chart_collaborators cascade;

create table gantt_chart_collaborators (
  id          uuid primary key default gen_random_uuid(),
  chart_id    uuid not null references gantt_charts(id) on delete cascade,
  user_id     uuid not null references profiles(id)     on delete cascade,
  role        text not null default 'viewer' check (role in ('viewer', 'editor')),
  invited_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  unique(chart_id, user_id)
);

alter table gantt_chart_collaborators enable row level security;

-- 2. RLS on gantt_chart_collaborators
-- =============================================================================
-- Drop any stale policies first
drop policy if exists "Owner manages collaborators"     on gantt_chart_collaborators;
drop policy if exists "Collaborators view own row"      on gantt_chart_collaborators;

-- Chart owner can INSERT / UPDATE / DELETE collaborators for their own charts
create policy "Owner manages collaborators"
  on gantt_chart_collaborators
  for all
  using (
    exists (
      select 1 from gantt_charts
      where gantt_charts.id  = gantt_chart_collaborators.chart_id
        and gantt_charts.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from gantt_charts
      where gantt_charts.id  = gantt_chart_collaborators.chart_id
        and gantt_charts.owner_id = auth.uid()
    )
  );

-- Each collaborator can see their own row (needed to verify access from client)
create policy "Collaborators view own row"
  on gantt_chart_collaborators
  for select
  using (user_id = auth.uid());

-- 3. Update RLS on gantt_charts
-- =============================================================================
-- Drop ALL existing policies on gantt_charts regardless of name,
-- then recreate exactly what we need.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies where tablename = 'gantt_charts'
  loop
    execute format('drop policy if exists %I on gantt_charts', pol.policyname);
  end loop;
end $$;

-- Make sure RLS is enabled
alter table gantt_charts enable row level security;

-- SELECT: owner OR any collaborator
create policy "select_own_or_shared"
  on gantt_charts for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from gantt_chart_collaborators gcc
      where gcc.chart_id = gantt_charts.id
        and gcc.user_id  = auth.uid()
    )
  );

-- INSERT: only the row's own owner
create policy "insert_own"
  on gantt_charts for insert
  with check (owner_id = auth.uid());

-- UPDATE: owner OR editor collaborator
create policy "update_own_or_editor"
  on gantt_charts for update
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from gantt_chart_collaborators gcc
      where gcc.chart_id = gantt_charts.id
        and gcc.user_id  = auth.uid()
        and gcc.role     = 'editor'
    )
  );

-- DELETE: owner only
create policy "delete_own"
  on gantt_charts for delete
  using (owner_id = auth.uid());

-- 4. Enable Realtime on gantt_charts
-- =============================================================================
-- Supabase Realtime needs REPLICA IDENTITY FULL to broadcast full row data
-- on UPDATE events (so clients can read the new chart_data in the payload).
alter table gantt_charts replica identity full;

-- Add gantt_charts to the realtime publication only if not already a member
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename = 'gantt_charts'
  ) then
    alter publication supabase_realtime add table gantt_charts;
  end if;
end $$;

-- =============================================================================
-- DONE. Verify with:
--   select * from pg_policies where tablename in ('gantt_charts','gantt_chart_collaborators');
-- =============================================================================
