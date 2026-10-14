-- Legacy schema retained for rollback/reference only.
-- New installations: run migrations/001_normalized.sql and 002_legacy_import.sql.
create table if not exists public.prompt_olympics_state (
  id text primary key check (id = 'prompt-olympics'),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  version integer not null default 0 check (version >= 0)
);

alter table public.prompt_olympics_state enable row level security;
revoke all on public.prompt_olympics_state from anon, authenticated;
grant select, insert, update on public.prompt_olympics_state to service_role;

-- No public policies: only the trusted Express server accesses this table.
