# Prompt Olympics upgrade — verified implementation report

14 October 2026. Status: **ready for local rehearsal; additional deployment-specific testing required before a live competition**.

## A. Implemented changes

- Independent home, `/play`, `/vote`, `/leaderboard` and `/admin` routes, with readable responsive layouts, large controls, prompt examples/coaching, regeneration, larger-text/high-contrast/reduced-motion settings and read-aloud support.
- Official story generation, validation and saving happen on the server through a durable operation-keyed job. Browser reload/lost-response recovery retains the idea and reconciles the same job. Participants read saved stories while judging proceeds independently.
- Genuine structured Gemini judging with the fixed 50/25/25 rubric, range validation, model/rubric provenance, precise scores, pending/failed status, bounded transient retries and organiser retry controls. Completed historical scores are preserved; missing historical scores require an explicit audited judging operation.
- One accessible 1–5-star public rating, server-derived identity/ownership, duplicate and self-vote restrictions, exact idempotent retries, and private voter-specific story status. Voting order rotates by session and prioritizes unvoted stories without displaying rankings before rating.
- Precise 50% AI / 50% public scoring, provisional eligibility below the configurable five-vote threshold, deterministic tie-breakers and immutable published result snapshots.
- Silent approximately 60-second leaderboard polling with jitter, request cancellation, visibility handling, ETags/caching, preserved results on failure, last-checked time and fullscreen/projector layout.
- Organiser sign-in/logout, lifecycle/rule controls, new-round history preservation, story review/removal, judging retries, one-use code issuance, result CSV and database JSON exports, operational metrics and readiness checks.
- Shared queue concurrency/admission caps, expiring worker leases, persisted generated output, per-session limits and a daily accepted-job allowance. No database outage fallback to local files.

## B. Major changed and new files

| Files                                                                                 | Purpose                                                                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `server.js`, `security.js`                                                            | Validated API routes, signed voter identity, revocable organiser sessions, CSRF, limits, cache, exports and metrics |
| `competitionRepository.js`, `localRepository.js`                                      | Normalized Supabase RPC adapter; explicit one-process development storage                                           |
| `competitionStore.js`, `src/scoring.ts`, `src/types.ts`                               | Lifecycle, local domain behavior and shared numeric/data contracts                                                  |
| `aiService.js`, `geminiConfig.js`                                                     | Structured generation/judging and durable queue worker; existing default model retained                             |
| `src/main.tsx`, `src/styles.css`, `src/api.ts`, `src/useFeed.ts`                      | Separate pages, cohesive accessible UI, recovery and silent polling                                                 |
| `supabase/migrations/001_normalized.sql`                                              | Tables, keys/constraints, indexes, transactional API, queue leases, permissions and aggregates                      |
| `supabase/migrations/002_legacy_import.sql`, `supabase/maintenance/freeze-legacy.sql` | Atomic verified import and enforcement of a legacy write freeze                                                     |
| `scripts/export-legacy.mjs`, `scripts/import-supabase.js`, `scripts/migrationData.js` | Backup, dry-run validation, exact-rerun-safe import                                                                 |
| `tests/`, domain/repository tests, `playwright.config.ts`                             | PostgreSQL, HTTP, browser, accessibility and recovery verification                                                  |
| `scripts/load-test.mjs`, `scripts/postgresLoadDatabase.mjs`                           | Repeatable isolated load/fault runner and optional real PostgreSQL connections                                      |
| `render.yaml`, `.env.example`, `package.json`, lockfile                               | Safe deployment defaults, explicit environment settings, test scripts and audited dependencies                      |
| README, setup/troubleshooting/audit documents and live-event checklist                | Exact local, migration, deployment, recovery and organiser procedures                                               |

Generated `node_modules/` and `dist/` were removed from Git tracking and remain on disk. Deployment installs the audited lockfile and builds from source. No application data was removed. The old offline story experiment is retained but is not used for official scores.

## C. Database and migration

The production schema has independent competitions, rounds, participants, submissions, judgements, votes, jobs, idempotency/import records, audit entries, codes, rate-limit buckets and organiser sessions. Public roles cannot read the tables or execute sensitive functions. Every vote is an independent insert with database uniqueness and round/story foreign keys. Round state is checked in the voting transaction and protected by row locks.

The importer makes a backup, detects inconsistencies, preserves IDs/raw records, leaves stored five-point scores unchanged, converts explicit/legacy ten-point scores once, validates counts inside its transaction, refuses occupied targets and safely returns the result for an identical rerun. Ambiguous `OPEN` requires an explicit phase mapping. Legacy data/table is retained. The maintenance trigger prevents old instances from accepting writes during cutover.

The current local file dry-run contains **1 round, 2 stories, 2 participant records, 2 pending judgement records and 0 votes**. Both stories lack saved historical AI scores; warnings are explicit. The original file and pre-upgrade backup have identical SHA-256 hashes:

`0FBFF79F6F140187B1A54F7B6C8C7ED3B9933A282239576BB7795EE22AEE8DED`.

No hosted database import, schema change or cutover was performed.

## D. Verification results

| Check                                                         | Result                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type checking (`npm run typecheck`)                           | Passed                                                                                                                                                                                           |
| Production build (`npm run build`)                            | Passed; React bundle approximately 223 KB / 70 KB gzip, CSS 12 KB / 3.5 KB gzip                                                                                                                  |
| Unit/HTTP/PostgreSQL/migration tests (`npm test`)             | **22 passed, 0 failed, 0 skipped**                                                                                                                                                               |
| Chromium event end-to-end test                                | **1 passed**; multiple independent contexts and a complete event lifecycle                                                                                                                       |
| Automated accessibility                                       | No WCAG A/AA violations in tested home, create, selected voting and leaderboard screens; does not substitute for human/device accessibility testing                                              |
| Phone/tablet/laptop layout                                    | No horizontal overflow at 375, 768 and 1366 px; tested larger text; screenshots generated and phone/home views inspected                                                                         |
| Touch/keyboard                                                | Touch story/star selection and radio arrow-key navigation passed                                                                                                                                 |
| Recovery                                                      | Generation/vote responses lost after server acceptance recovered with the same key; restart persistence, queue lease expiry, stale workers, quota retries and refresh outage preservation passed |
| Security                                                      | Public SQL role access denied; organiser auth/confirmation/CSRF, self/duplicate/closed votes and production configuration checks passed                                                          |
| Dependency audit                                              | **0 reported vulnerabilities**, including full/dev dependencies                                                                                                                                  |
| Code formatting                                               | Passed                                                                                                                                                                                           |
| Current-file migration dry run                                | Passed with two missing-score warnings; no writes                                                                                                                                                |
| Hosted Supabase / Render / real Gemini / actual venue devices | **Not run**; requires a configured dedicated rehearsal deployment and provider access                                                                                                            |

Actual load-test output is in `reports/load-test.json`. Latest reviewed local run:

| Measurement                   | Actual                                      | Threshold / result                                                  |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| Accepted/completed story jobs | 100 / 100                                   | All completed despite 4 injected provider 429 errors                |
| Distinct initial voters       | 500                                         | All 500 acknowledged                                                |
| Exact duplicate retries       | 100                                         | 0 extra vote records                                                |
| Leaderboard reads             | 200, plus restart check                     | All completed                                                       |
| Database outage               | 1 rejected attempt, then 1 recovered commit | No false acknowledgement                                            |
| App/worker restart            | 501 votes retained                          | Passed                                                              |
| Closure race / late attempts  | 51 rejected                                 | No post-close votes accepted in this serialized SQL run             |
| Vote mean / p95               | 355 ms / **498 ms**                         | p95 < 2,000 ms: passed                                              |
| Leaderboard mean / p95        | 90 ms / **142 ms**                          | p95 < 2,000 ms: passed                                              |
| Measured requests/second      | **87.1**                                    | Informational                                                       |
| Lost confirmed votes          | **0**                                       | Must be 0: passed                                                   |
| Duplicate records             | **0**                                       | Must be 0: passed                                                   |
| Unexpected errors             | **0**                                       | Must be 0: passed                                                   |
| Outstanding queue at end      | **0**                                       | Passed                                                              |
| Peak RSS / process CPU        | 481 MB / 2.86 CPU seconds                   | Includes embedded PostgreSQL test engine; not production app memory |
| Elapsed run                   | 10.96 seconds                               | Includes mocked generation/retries/setup workflow                   |

The measured expected rejection rate was 5.45%, comprising deliberately injected outage/closed-vote attempts. PGlite **serializes SQL**. This is real SQL/HTTP integrity evidence, not a multi-connection Supabase or deployed Render capacity benchmark. The separate PostgreSQL runner supports 20 actual connections but was not executed against an external database. Mocked generation time is not Gemini latency; the 5–10-second real-provider target is unverified.

Failures found during implementation were investigated and corrected: ambiguous SQL aliases; retry jobs incorrectly interpreted as API errors; a browser clock installed after polling timers; excessive simultaneous test-client connection setup; and deferred-constraint trigger ordering during SQL installation. The final checks above use the corrected implementation. Early failing run logs are retained locally and are not presented as passing evidence.

## E. Security improvements

No fallback organiser password; required session secret; signed HttpOnly/SameSite/Secure production cookies; expiring/revocable organiser sessions; timing-safe credential comparison; CSRF and origin checks; server-only provider/database credentials; limited request bodies; database-backed limits; generic visitor errors; security headers/CSP; CSV formula protection; raw voter identities absent from public responses; no public Gemini diagnostics; trusted server-only story/score submission.

Voting codes strengthen attendee control without mandatory accounts. They do not prove cross-device ownership of a submission or stop someone obtaining multiple distributed codes. Organisers must distribute one code per attendee. Anonymous-session multi-browser/device abuse remains a documented limitation.

## F. Exact deployment steps

1. Follow the preliminary backup and test-project rehearsal in `SUPABASE_SETUP.md`.
2. Freeze legacy writes with `supabase/maintenance/freeze-legacy.sql`, stop all old instances, and take the final backup.
3. Apply `001_normalized.sql`, then `002_legacy_import.sql` in the target SQL Editor.
4. Run `node scripts/import-supabase.js backups/legacy-final.json --dry-run`, review counts/warnings and any explicit OPEN mapping, then run the same command with `--apply --maintenance-confirmed`.
5. Set private Render environment variables from `.env.example`. Review the paid plan, preserved session secret, provider quotas and shared concurrency settings. The Blueprint uses current [Render configuration fields](https://render.com/docs/blueprint-spec), disables automatic deployment and checks `/api/ready`.
6. Build with `npm ci --include=dev && npm run build`; start with `npm start`.
7. Verify HTTP 200 database readiness, migrated history/counts, real generation/judging, vote retries, leaderboard and actual projector behavior.
8. Complete `LIVE_EVENT_CHECKLIST.md` and keep rollback/backups available before public access.

No secrets should be submitted in chat. No paid hosting deployment, real provider calls, or hosted migration was performed by this implementation.

## G. Remaining risks and limits

- Hosted schema/grants, network latency, provider model access/quota, paid-instance resources and actual multi-connection contention need rehearsal verification.
- The application preserves published results but does not expose a final-result amendment/reopening tool. A reviewed amendment procedure must preserve the previous snapshot and audit trail.
- Missing historic scores remain pending until explicitly authorised judging or removal; migrated final rounds require verified compatible snapshots.
- Cross-device anonymous identity and historical browser ownership cannot be proven automatically. Retention/deletion and code distribution require an organiser policy.
- A crash before persisting a provider response may repeat a paid request. Expiring leases and stable submission IDs prevent duplicate official stories, but cannot guarantee provider billing exactly once.
- PostgreSQL backup restore to a dedicated project, hosted failure/restart tests and actual iOS/Android/projector behavior are documented but not independently verified here.
- Queue concurrency must fit actual provider quota. Accepting 100 jobs does not imply 100 simultaneous Gemini calls or a guaranteed per-participant generation latency.

## H. Event readiness

**Ready for local rehearsal. Requires hosted migration, real PostgreSQL concurrency/load verification, real Gemini generation/judging and a venue-device/projector rehearsal before production use.** The repository build and local integrity checks pass; deployment-specific acceptance remains open rather than assumed.
