# Prompt Olympics

A React 19 / TypeScript / Vite frontend with Express, Supabase PostgreSQL and server-side Google Gemini. Designed for simple story creation, independent public voting, and a silently refreshing competition leaderboard.

Routes: `/`, `/play`, `/vote`, `/leaderboard`, `/admin`.

The **English / 中文** switch covers all pages and organiser controls. It remembers your preference while preserving drafts, selected ratings and active requests. New stories use the selected language; existing competition entries remain as submitted. See [LOCALIZATION.md](LOCALIZATION.md) for translation coverage and checks.

## Start locally

Install Node **22.18 or newer**. In PowerShell:

```powershell
npm.cmd ci
Copy-Item .env.example .env
```

Edit `.env` privately. For an isolated local demonstration, remove the Supabase placeholder variables and set `NODE_ENV=development`, `STORAGE_MODE=local`, `AI_MODE=mock`, a private `ADMIN_PASSWORD` of at least 16 characters, and `SESSION_SECRET` of at least 32 characters. Generate a secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Keep the result local. Mock AI is rejected in production. The existing legacy `data/competition.json` is never used or modified by the new development server; it uses `data/development-v2.json` by default.

```powershell
npm.cmd run build
node --env-file=.env server.js
```

Visit `http://localhost:10000`. Sign in at `/admin` using the configured organiser password and select **Start / Open submissions**. For development with hot reload, keep the Express server running, start `npm.cmd run dev` in another terminal, and open Vite's URL. Vite proxies `/api` to port 10000.

## Production installation

Read [SUPABASE_SETUP.md](SUPABASE_SETUP.md) before deploying an existing event. It includes backups, SQL files, migration validation, write freeze, cutover and rollback. Apply migrations 001 and 002, configure secrets in Render, and deploy with `npm ci --include=dev && npm run build` / `npm start`. The production server refuses local-storage fallback and known/default organiser credentials. Use an always-on paid service for a live competition.

The old API that accepted browser-generated stories and browser-selected voter IDs is intentionally removed. All official stories are generated and saved by the server. Existing legacy data is migrated through a separate, reviewed process.

## Environment reference

| Variable                      | Purpose / default                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `production` on Render; development/test elsewhere                                            |
| `SUPABASE_URL`                | Required HTTPS project URL in production                                                      |
| `SUPABASE_SECRET_KEY`         | Required server secret; never use `VITE_`                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`   | Legacy service-role JWT alternative                                                           |
| `ADMIN_PASSWORD`              | Required private password, at least 16 characters; no fallback                                |
| `SESSION_SECRET`              | Required random secret, at least 32 characters; same across instances/restarts                |
| `APP_ORIGIN`                  | Canonical deployed HTTPS origin for CSRF checks                                               |
| `GEMINI_API_KEY`              | Server-only Google AI key; never stored in frontend                                           |
| `GEMINI_MODEL`                | Existing default `gemini-3.6-flash`; benchmark before changing                                |
| `AI_TIMEOUT_MS`               | 20,000; bounded to 5,000–30,000                                                               |
| `AI_CONCURRENCY`              | 6 shared active leases; bounded 1–20; use same setting on every instance                      |
| `MAX_QUEUE`                   | 150 unfinished generation/judging jobs                                                        |
| `MAX_STORIES_PER_PARTICIPANT` | 5 accepted requests per session per round, including new versions/failures                    |
| `DAILY_GENERATION_BUDGET`     | 1,000 accepted jobs per UTC database day, each with at most 3 generation and 3 judge attempts |
| `PORT`                        | 10000, or Render-provided port                                                                |
| `STORAGE_MODE`                | `local` only for explicit development/test                                                    |
| `LOCAL_DATA_PATH`             | New v2 development file; one process only                                                     |
| `AI_MODE`                     | `mock` only for development/test; default uses Gemini                                         |
| `LOAD_TEST_DATABASE_URL`      | Optional connection to a dedicated empty test PostgreSQL database                             |
| `ISOLATED_LOAD_TEST`          | Must be `YES` to permit the optional external database load test                              |

Supabase is the authoritative store. A database outage produces a retryable failure; it never switches to local files. `/api/health` is liveness/configuration, `/api/ready` verifies database access. A configured Gemini key does not prove model access or available quota.

## Scoring and lifecycle

`WAITING → SUBMISSIONS_OPEN → SUBMISSIONS_CLOSED → VOTING → RESULTS`.

Accepted generation jobs may finish after submissions close. Voting must be explicitly opened. Closing voting returns to `SUBMISSIONS_CLOSED`; it can be reopened with an audited organiser action before publication. Publishing closes voting and stores an immutable snapshot. Pending/failed judging must be resolved (or the affected story removed from public competition) first. **Create a new round** retains all prior data.

New Gemini rubric v2: humour 50%, creativity 25%, relevance 25%, each criterion from 1 to 5 in one decimal place. Creativity is stored in the existing originality column for schema compatibility; historical scores and rubric versions are retained. The server validates and stores the model, rubric and precise weighted score. No fallback/keyword score is fabricated.

Public score = sum of valid ratings / vote count. Combined score = 50% AI + 50% public average. No public votes means no combined score; the AI value remains provisional. Missing AI means no final score. The default award threshold is five public votes, configurable before voting. All stories remain visible regardless of eligibility.

Eligible entries rank first, then precise combined score, public average, AI score, vote count, and byte-stable story ID. Scores are rounded only for display. Stories are ranked individually, including explicitly requested regenerated versions; each version receives its own operation/submission ID and consumes the configured story allowance.

## Identity and privacy

Voters use signed persistent HttpOnly / SameSite sessions; production cookies are Secure. Organiser sessions expire after one hour and are revoked on logout. CSRF tokens protect mutations. Voter IDs/ownership are derived from verified cookies, never browser request fields.

Anonymous sessions cannot prove one person across different devices or cleared cookies. Optional event voting codes can be issued once per voter per round; distribute one code per attendee. Self-voting is enforced for the submitting session. Cross-device ownership cannot be proven without a stronger participant registration process, which this app does not require.

Collect only nicknames and story ideas. Avoid personal/sensitive details in prompts. Backups are private. Retain competition data for the agreed event-retention period, then archive/encrypt or remove it through a reviewed database procedure after awards/appeals; the app has no automatic destructive retention job. Rate-limit records are pruned automatically; expired organiser sessions are pruned on login.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
npm.cmd run test:load
npm.cmd audit
```

If Chromium is not installed: `npx.cmd playwright install chromium`.

Unit/integration tests use explicit local files and embedded PostgreSQL, with mocked AI. The browser test runs a temporary server on loopback port 10001 and uses isolated browser contexts. It tests generation, judging, response-loss recovery, votes, keyboard/touch controls, polling, failure preservation, fullscreen, final publication, responsive widths and automated WCAG checks. Screenshots/traces are generated under `test-results/`.

The load harness always starts its own loopback app, defaults to a disposable PGlite database, and makes **no real Gemini requests**. It runs 100 creators, 500 voters, 100 exact retries, 200 leaderboard reads, provider quota faults, a database outage, a restart and a closing-vote race. Metrics/thresholds are in `reports/load-test.json`. PGlite serializes SQL; these tests do not demonstrate multi-connection hosted database performance.

For real PostgreSQL lock/concurrency validation, create a **fresh dedicated Supabase test project**, set its direct/pooler PostgreSQL connection string privately as `LOAD_TEST_DATABASE_URL`, set `ISOLATED_LOAD_TEST=YES`, then run `npm.cmd run test:load`. The runner uses 20 independent connections and refuses an occupied target. It leaves the disposable test tables for inspection; destroy the dedicated test project afterward. Never use production credentials or a production database. This still measures loopback HTTP and mocked Gemini, so a deployed HTTP/AI rehearsal remains necessary.

See [LIVE_EVENT_CHECKLIST.md](LIVE_EVENT_CHECKLIST.md), [GEMINI_SETUP.md](GEMINI_SETUP.md), [TROUBLESHOOTING.md](TROUBLESHOOTING.md), [AUDIT.md](AUDIT.md) and [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md).

### Six simultaneous participants

Set `AI_CONCURRENCY=6` in Render and redeploy; an existing Render variable overrides the code default. Keep this setting consistent across instances. Six participants can submit from separate browser sessions. Extra work waits in the durable queue. Each successful story normally uses one generation call and one judging call, so budget at least 12 provider requests for six stories, plus retries. Check Google AI Studio request/token limits and rehearse on the deployed service before the event. One participant has one in-flight request per browser tab to avoid accidental duplicate submissions.

While generation is pending, the creation page shows a dedicated bilingual loading view with queue, writing and saving messages. Reloading restores the pending request rather than submitting a new story. Saved stories appear immediately, with judging status displayed separately.

### Shared-device voting and judging repair

Apply `supabase/migrations/003_shared_device_voting.sql` in Supabase SQL Editor before deploying this update. It replaces the vote API function without deleting competition data and allows ratings of stories created on the same device. One rating per story per voter remains enforced. On Read and Vote, select **Next voter** before handing over the device. This starts a separate signed ballot identity while preserving author jobs and organiser login. With strict event codes enabled, each new voter still needs their own code. This is an organiser-supervised shared-device workflow; the app does not verify that a different person pressed Next voter.

The real Gemini judging path now includes the model name when saving a score, as required by the database. Deploy the fix, then use **Retry AI judging** on failed saved stories. Existing stories are retained and do not need to be regenerated. Render logs from this version include the sanitized `gemini_request_failed` diagnostic as well as timing metrics.

See BOOTH_REPORT.md for the continuous booth workflow, migration 004, participant-session reset, verification evidence and deployment limits. Trusted AI instructions are maintained in aiPrompts.js. The unused offline keyword-scoring experiment was removed from src; STORY_GENERATION_REFACTOR.md is historical documentation only.
