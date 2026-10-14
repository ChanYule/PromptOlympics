-- Apply only as the migration guide directs, after an initial backup.
-- Stops every legacy instance from accepting writes during migration/cutover.
begin;
create or replace function public.po_block_legacy_writes() returns trigger language plpgsql as $$
begin raise exception 'Legacy competition is in migration maintenance'; end $$;
drop trigger if exists po_legacy_maintenance on public.prompt_olympics_state;
create trigger po_legacy_maintenance before insert or update or delete on public.prompt_olympics_state
for each row execute function public.po_block_legacy_writes();
commit;
