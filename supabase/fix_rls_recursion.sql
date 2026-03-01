-- Fix: infinite recursion in gantt_charts RLS policies
-- Root cause: gantt_charts SELECT policy queries gantt_chart_collaborators,
-- which has its own RLS policy that queries gantt_charts → loop.
-- Solution: use SECURITY DEFINER functions that bypass RLS for the lookup.

-- ─── 1. Helper functions (run as definer, bypasses RLS) ──────────────────────

create or replace function is_chart_collaborator(p_chart_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from gantt_chart_collaborators
    where chart_id = p_chart_id and user_id = p_user_id
  );
$$;

create or replace function is_chart_editor(p_chart_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from gantt_chart_collaborators
    where chart_id = p_chart_id and user_id = p_user_id and role = 'editor'
  );
$$;

-- ─── 2. Drop all existing gantt_charts policies ───────────────────────────────

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies where tablename = 'gantt_charts'
  loop
    execute format('drop policy if exists %I on gantt_charts', pol.policyname);
  end loop;
end $$;

-- ─── 3. Re-create policies using the helper functions ─────────────────────────

alter table gantt_charts enable row level security;

create policy "select_own_or_shared" on gantt_charts
  for select using (
    owner_id = auth.uid()
    or is_chart_collaborator(id, auth.uid())
  );

create policy "insert_own" on gantt_charts
  for insert with check (owner_id = auth.uid());

create policy "update_own_or_editor" on gantt_charts
  for update using (
    owner_id = auth.uid()
    or is_chart_editor(id, auth.uid())
  );

create policy "delete_own" on gantt_charts
  for delete using (owner_id = auth.uid());
