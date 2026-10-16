# Safe database migration and deployment

Use a separate Supabase test project first. These operations have not been applied to any hosted database by this upgrade.

## Prepare credentials locally

Use Node 22.18 or newer. In PowerShell from the repository, set `SUPABASE_URL`. Read your **server secret key** from Supabase Settings → API Keys into the terminal, never chat or source files:

```powershell
$env:SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co'
$secret = Read-Host 'Server secret key' -AsSecureString
$env:SUPABASE_SECRET_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
```

Modern `sb_secret_...` keys and legacy `service_role` JWTs are supported. Publishable/anon keys are rejected by the runtime. Never prefix server credentials with `VITE_`.

## Back up and rehearse

1. Export the raw legacy database before changing anything:

   ```powershell
   node scripts/export-legacy.mjs backups/legacy-before-maintenance.json
   ```

   For file storage, copy the original `data/competition.json` instead. The public endpoint is no longer a database-backup endpoint.

2. Keep a second encrypted/private copy off the application server. Backups include participant nicknames and historical voting identifiers.
3. In the **test project SQL Editor**, run the complete files in order:
   - `supabase/migrations/001_normalized.sql`
   - `supabase/migrations/002_legacy_import.sql`
4. Dry-run the backup locally:

   ```powershell
   node scripts/import-supabase.js backups/legacy-before-maintenance.json --dry-run
   ```

   If a round is `OPEN`, rerun with an explicit phase, for example `--legacy-open-state=VOTING`. `OPEN` formerly allowed simultaneous submissions and voting; the new lifecycle does not. Decide with the organiser when both features were in use.

5. The script detects duplicate/missing IDs, orphaned or malformed votes, conflicting identities, unknown score scales, invalid timestamps and missing final snapshots. Resolve inconsistencies in a **copy** of the backup and retain the untouched original. It does not discard votes to make an import pass. Historical `RESULTS` requires a verified snapshot; importing an unverified final ranking is intentionally blocked.
6. Review the counts and warnings. A missing historical AI score remains pending and cannot be treated as an official completed judging result. No historical story is silently judged.

## Production cutover with no legacy writes

1. Disable Render automatic deploys. Choose a maintenance period and announce it. Take the preliminary backup above.
2. If the old server uses Supabase, run `supabase/maintenance/freeze-legacy.sql` in its SQL Editor. The trigger rejects old writes from **every** running instance. Do not remove the old table.
3. Stop/suspend all old app instances and workers. For file storage, stop the process before taking the final file copy. A backup while people are still voting is not a safe cutover.
4. Export again to a new filename after the freeze:

   ```powershell
   node scripts/export-legacy.mjs backups/legacy-final.json
   node scripts/import-supabase.js backups/legacy-final.json --dry-run
   ```

5. In the target project SQL Editor, run migrations `001_normalized.sql` then `002_legacy_import.sql`. They are additive and never rewrite/delete the legacy table. All new tables have RLS enabled and no browser permissions; only server service-role access is granted. The public RPCs are explicitly denied to `anon`, `authenticated` and `PUBLIC`.
6. Import the frozen backup:

   ```powershell
   node scripts/import-supabase.js backups/legacy-final.json --apply --maintenance-confirmed
   ```

   Include the same `--legacy-open-state=...` option if required. Each run first copies its input into `backups/`. The import runs in one transaction, validates database counts, refuses occupied targets, and returns the existing result when the exact backup is rerun. A different backup after a completed import is rejected.

7. Verify SQL counts match the dry run:

   ```sql
   select 'rounds' as records, count(*) from public.po_rounds
   union all select 'participants', count(*) from public.po_participants
   union all select 'submissions', count(*) from public.po_submissions
   union all select 'judgements', count(*) from public.po_judgements
   union all select 'votes', count(*) from public.po_votes;
   select current_round_id from public.po_competitions;
   ```

8. Deploy the new code and configure Render variables from `.env.example`. `NODE_ENV=production` requires Supabase, a private organiser password and session secret. Start with one paid, always-on service for the event. `render.yaml` disables auto-deploy and provides a readiness health path.
9. Check `/api/ready`: HTTP 200, `storage: "supabase"`, `storageConnected: true`. `/api/health` only confirms that the app process is alive and reports AI configuration; it is not a provider/quota check.
10. Verify round phase, old stories, historic numeric scores, vote counts, then complete `LIVE_EVENT_CHECKLIST.md` before reopening access. Keep the legacy write-block trigger in place after cutover.

## New tables

`po_competitions`, `po_rounds`, `po_participants`, `po_submissions`, `po_judgements`, `po_votes`, `po_jobs`, `po_idempotency`, `po_audit`, `po_codes`, `po_limits`, `po_admin_sessions`. Votes have independent IDs, foreign keys to their round/story and unique story/identity and operation/identity constraints. Indexed PostgreSQL aggregation returns scores without downloading voter records. Final snapshots live on rounds.

Legacy participant/session strings are hashed into a separate legacy identity namespace for integrity and privacy. Old browser credentials cannot be trusted as signed sessions. The untouched raw record is also retained in `legacy` columns for traceability. Returning anonymous visitors receive a new server-issued identity; prior anonymous ownership/vote identity cannot be proven automatically. For strict events, use distributed one-use codes and rehearse their use.

## Backups and recovery

The organiser dashboard's **Download database backup** exports all normalized competition, job, vote, score, audit and code records. Keep it private and encrypted. This JSON is for inspection/reconciliation; it is not accepted by the legacy importer. For a restorable PostgreSQL backup, use your Supabase project's database backup facility or a secured `pg_dump` connection:

```powershell
pg_dump --dbname=$env:DATABASE_URL --format=custom --file=prompt-olympics-private.dump
```

Do not print `DATABASE_URL` or commit the dump. Restore first to a **new, dedicated** project using `pg_restore --dbname=$env:RESTORE_DATABASE_URL --no-owner --no-acl prompt-olympics-private.dump`, then reapply role grants from migration 001 and verify counts. Role availability and Supabase-managed schemas require an operator to review the restore output; test this procedure before the event.

## Rollback

Keep maintenance on. Take a fresh normalized backup first. Before returning to the legacy release, run:

```sql
select count(*) as new_votes from public.po_votes where legacy is null;
select count(*) as new_stories from public.po_submissions where legacy is null;
select count(*) as new_jobs from public.po_jobs;
```

Only when all three are zero and no new round/rule/score changes need preservation may you redeploy the previous release, restore its old environment configuration, and unfreeze legacy writes:

```sql
drop trigger if exists po_legacy_maintenance on public.prompt_olympics_state;
```

Verify the old application's stories/counts before reopening. Leave all new tables intact for investigation. If the new app accepted any stories/votes, **do not downgrade to the stale legacy JSON**. Keep maintenance active and repair the new release or restore its PostgreSQL backup to a dedicated project. Backporting new records requires reviewed reconciliation to avoid losing confirmed votes.

## Shared-device voting update

After migrations 001 and 002, run the complete `supabase/migrations/003_shared_device_voting.sql` in SQL Editor. Existing installations only need this new migration for shared-device voting. It replaces the server RPC function and retains all existing data, vote uniqueness, closed-round checks and strict-code requirements. Deploy the updated server and browser together after applying it.

## Continuous booth workflow (migration 004)

Run migrations 001, 002, 003 and 004 in numeric order for a fresh project. Existing normalized installations apply any missing 003 then 004 after backing up and rehearsing privately. Migration 004 adds round booth/self-vote settings and durable ended participant identities. It does not delete stories, scores, votes or legacy data. Never apply 003 after 004. Deploy matching API version 3 code, check /api/ready, then enable booth mode in the organiser rules before opening submissions. Detailed rollout and rollback restrictions are in BOOTH_REPORT.md.

## Always-open voting update (migration 005)

The current release removes rating controls from the generated-story screen and sends participants to /vote. Apply `supabase/migrations/005_always_open_voting.sql` after 004, then deploy matching server/browser code. Readiness requires schema version 5. All story, score, vote, session-boundary and final-snapshot records are retained. Voting is automatic during SUBMISSIONS_OPEN and SUBMISSIONS_CLOSED; no booth-mode setting or separate voting-opening action is needed. Publish final results to end voting. See VOTING_FLOW.md for current operator instructions.
