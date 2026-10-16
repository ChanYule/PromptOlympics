# Prompt Olympics booth audit and verification

Assessment: **Ready for rehearsal**. Production deployment, live Gemini quality/latency, and an event rehearsal are still required before opening to the public. This work did not deploy code, migrate a hosted database, or modify live competition records.

## A. Actual defects found

| Defect                                                                      | Effect on the participant journey                                                                                            | Correction                                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Creation and voting were separate phases only                               | Authors could create a story but could not immediately rate it                                                               | Configurable booth mode permits voting during SUBMISSIONS_OPEN; phase-based events retain their original rules |
| Saved-story screen linked to a gallery rather than providing a rating       | Participants had to find their own entry                                                                                     | Inline story rating, confirmed-vote status and server-calculated combined score                                |
| Next voter rotated only the ballot cookie                                   | New creators inherited drafts, job state and the permanent author identity; Supabase grouped same-session nicknames together | Full participant boundary with retired server identities and selective browser-state clearing                  |
| Real Gemini judge omitted the model argument                                | Valid scores could fail database validation                                                                                  | Model and rubric recorded through the real response path; PostgreSQL regression test                           |
| Generic timing logs hid AI error details                                    | Organisers could not distinguish provider, validation and persistence failures                                               | Sanitized diagnostic codes retained alongside timing metrics; no provider bodies or secrets logged             |
| Invalid structured output was treated as a permanent failure                | A malformed response could strand an otherwise valid idea                                                                    | Bounded durable retries and an owner-authorized retry of the same job                                          |
| Generation prompt and length checks used the older 100-word/five-word rules | Instructions did not match the new booth specification                                                                       | Server prompts with 110-word/six-word maxima; Chinese character limits retained                                |
| Unused offline keyword-scoring code remained in src                         | Risk of confusing heuristic scores with official AI judging                                                                  | Removed src/storyGeneration.ts and its obsolete experimental test; historical documentation clearly marked     |
| Background polling added jitter beyond the configured minute                | Separate screens could update after the requested interval                                                                   | Exact configured 60-second active-page polling, cached data retained on failure                                |
| Readiness only checked a generic database operation                         | An old schema could appear ready for incompatible booth code                                                                 | Required schema version 4, with an actionable readiness error                                                  |

## B. Implemented participant journey

1. Open `/booth`. The welcome screen offers **Start Creating My Story**. `/play` remains personal-device mode; gallery, leaderboard and organiser routes remain available.
2. A generated nickname is provided. Participants can edit it or leave the nickname blank to use the generated fallback. The prompt field retains its 700-character server/browser limit and inspiration examples.
3. **Generate My Story** submits a server-validated idea using an idempotency key. The loading view describes queued, writing and saving states without invented percentages.
4. The official story is generated on the backend and saved automatically. Browser-supplied story text or AI scores cannot create official entries.
5. The saved story appears immediately. A separate durable judging operation runs automatically; participants can read and vote while it is pending. Failed judging preserves the story and any votes and offers a safe retry.
6. **How funny was your story?** provides large 1–5-star controls. **Submit My Vote** confirms success only following a successful server operation or a server read confirming the existing vote. Unknown results retain the operation key for reconciliation.
7. The server aggregates confirmed ratings and AI scores. The combined score updates in this screen after the vote. Other visible leaderboard screens poll every 60 seconds and retain their last confirmed results on failure.
8. **Finish and Start Next Participant** is unavailable while a vote is pending. The backend serializes reset against accepted generation/vote operations, checks pending generation and supplied vote confirmation, records the old identity as ended, then issues new signed author and ballot cookies. Only after confirmation are nickname, prompt, story, rating, pending operations and messages cleared. Stories, scores, votes and history remain in the database.

The optional inactivity setting is off by default. At two minutes of inactivity it warns for 30 seconds, then resets only an idle booth. In-progress generation, uncertain votes and pending resets suspend automatic clearing. Personal-device mode has no automatic booth reset. Explicit booth resets affect that browser's participant cookies; do not run two independent booth participants simultaneously in tabs sharing those cookies.

## C. Files and responsibilities

- `src/Booth.tsx`: welcome flow, optional inactivity warning/reset and participant transitions.
- `src/BoothVote.tsx`: inline rating, persisted pending vote, authoritative score refresh, reset gating and recovery.
- `src/main.tsx`: booth route, combined story display, optional generated nickname, owner retry, configurable organiser rules; existing routes retained.
- `src/api.ts`: session context checks, durable reset intent, new-cookie/lost-response reconciliation and selective state clearing.
- `src/types.ts`, `src/useFeed.ts`, `src/styles.css`, `src/locales/zh.ts`: booth settings, polling, accessible layouts and reviewed Simplified Chinese text.
- `server.js`, `security.js`: protected participant endpoints, signed identities, CSRF, server-issued reset, schema-aware readiness and ownership checks.
- `competitionStore.js`, `localRepository.js`: equivalent development behavior and durable local restart tests; production still requires Supabase.
- `supabase/migrations/004_booth_sessions.sql`: additive round settings, ended-session records and transactional RPC updates. No stored stories, scores or votes are deleted. Migration 003 is also required if not yet installed.
- `aiPrompts.js`, `aiService.js`, `geminiErrors.js`: trusted prompt/schema definitions, genuine separate judging request, server score calculation, model/rubric metadata and bounded retry classification.
- `tests/booth.test.mjs`, `tests/judging.test.mjs`, `tests/quality.test.mjs`, `tests/concurrency.test.mjs`, updated API/database tests: session boundaries, pending-judge votes, recovery, real response adapter and six independent jobs.
- `tests/e2e/booth.spec.ts`, updated event test and test server: three-person flow, uncertain operations, inactivity behavior, application/worker recreation and record verification.
- `scripts/i18n-audit.mjs`: audits every TSX component and SQL migration; `scripts/quality-check.mjs`: 20-case mock contract report and an explicitly opted-in live quality check.
- `scripts/load-test.mjs`, `scripts/postgresLoadDatabase.mjs`: 100 simultaneous generation requests, six leases, voting bursts, latency/queue metrics and current migration setup for an isolated PostgreSQL test.
- Removed `src/storyGeneration.ts` and `src/storyGeneration.test.ts`: unused offline heuristic experiment, unrelated to official Gemini output. Competition data was not removed.

## D. Final backend prompts and scoring

The complete verbatim prompts are in `BACKEND_AI_PROMPTS.md`, generated from the current `aiPrompts.js` constants. Ideas and story text are JSON data separate from system instructions.

English generation aims for 80–100 words with a strict 110-word maximum and six-word title maximum. Chinese generation overrides only the language/length rules: natural Singapore Simplified Chinese, target 250–350 characters, maximum 400 characters, title maximum 12 characters. Output is exactly `{title, story}`. Empty, excessive, malformed or extra-field responses fail validation.

Judging returns `{humour, creativity, relevance, overall, reason}` with individual criteria in one decimal place from 1 to 5. The server rejects invalid fields, ignores the model's claimed overall when calculating the official result, and stores:

`AI = humour * 0.5 + creativity * 0.25 + relevance * 0.25`

Creativity is mapped to the existing `originality` database field for compatibility. New rubric: `humour-50-creativity-25-relevance-25-v2`. Historical scores and rubric versions are unchanged. Completed official scores are not overwritten by retries.

`Public average = sum(valid ratings) / count(valid ratings)`

`Combined = AI * 0.5 + Public average * 0.5`

Without both components, there is no fabricated combined score. Precise values are stored/calculated; the UI rounds to two decimal places. Minimum votes affect award eligibility separately from whether a combined score exists.

## E. Verification and evidence

See `reports/booth-tests.txt`, `reports/booth-e2e.txt`, `reports/load-test.json` and `reports/story-quality.json` for recorded output. Final results: **36 automated tests passed, 0 failed, 0 skipped** in the final full run (43.2 seconds); **6 browser workflows passed, 0 failed, 0 skipped** (41.4 seconds). The production build, standalone TypeScript check, formatting check and 330-entry translation audit passed. Earlier failures exposed the response-adapter test contract change, a missing translation and an uncertain-vote finish-control state; each was corrected and rerun successfully.

Verified checks include TypeScript/production build, source formatting, translation/placeholder coverage, unit/API/security tests, embedded PostgreSQL constraints and migration repeatability, six concurrent generation jobs, browser keyboard/accessibility/mobile checks, same-operation retry, voting before judging, judging-timeout recovery, closed-round rejection, owner isolation and ended-identity rejection.

The browser suite includes response-loss recovery for generation, voting and reset, reload after a confirmed vote, two independent leaderboard screens, background polling/failure retention, fullscreen layout, 375/768/1366px layouts, and inactivity-reset suppression during generation. A test-only loopback endpoint recreates the application, worker and file repository; it is not present in production. The load runner additionally closes/reopens its HTTP server against the same database.

External checks not executed: live Gemini quality/latency (no API key), hosted Render acceptance, hosted Supabase migration/permissions and independent-connection PostgreSQL stress testing (no safe test connection supplied). No live Gemini load test was run.

## F. Three consecutive participants

The browser used authored mock Gemini responses, actual HTTP API calls, actual application/worker behavior and the isolated local repository. Each generated a distinct story, received mock AI score 4.375, and submitted exactly one rating:

| Participant   | Story             | Public rating | Exact combined score | Display |
| ------------- | ----------------- | ------------: | -------------------: | ------: |
| Happy Panda   | Principal Paws    |             5 |               4.6875 |    4.69 |
| Funny Uncle   | The Dancing Uncle |             4 |               4.1875 |    4.19 |
| Super Chicken | Chef Chicken      |             3 |               3.6875 |    3.69 |

The next participant had an empty prompt, fresh server identity and no prior receipt/rating. After reload and application/worker restart, both leaderboard screens contained all three correct entries, each with one vote. Separate PostgreSQL tests verify the same ownership/score/uniqueness rules at the production SQL boundary. This is not a claim that live Gemini wrote those sample stories.

## G. Performance and quality findings

The disposable PGlite/loopback run with mocked Gemini completed:

- 100 simultaneously submitted generation requests, all accepted and completed, including four injected quota failures.
- 500 confirmed ratings in approximately 2.69 seconds, plus a recovered outage vote; 501 confirmed votes retained across HTTP server restart.
- 100 repeated vote operations added zero records.
- 200 leaderboard reads, plus the restart read.
- Vote latency p95 approximately 359ms; leaderboard p95 approximately 151ms.
- Mocked job creation-through-judging p50 420ms, p95 1,036ms, maximum 4,919ms. These numbers do not measure live Gemini generation time.
- Maximum queue observed by the post-enqueue sampler: 10. This is a sampled value, not a proven instantaneous peak.
- Zero lost confirmed votes, zero duplicate vote records, zero unexpected HTTP errors; no jobs remained queued.
- Process RSS peak approximately 469MB, including the embedded PostgreSQL engine; this is not a Render application memory measurement.

The 20-case quality corpus covers short/detailed/long ideas, Singapore contexts, absurdity, misspellings, Chinese/Malay/mixed-language input, repeated ideas and instruction-injection attempts. All 20 mocked response contracts passed. Authored fixtures establish parsing, separation and length behavior; they do not demonstrate Gemini humour, relevance, readability or coherence. Those four review dimensions remain explicitly marked for human review in the report. Real typical generation latency of 5–10 seconds has not been established.

To finish live quality testing in an isolated environment, supply `GEMINI_API_KEY` privately, set `RUN_LIVE_AI_QUALITY=YES`, then run `node scripts/quality-check.mjs --live`. This runs 20 generation and 20 judging requests, with no competition database writes. Review `reports/story-quality.json` manually for humour, relevance, readability and coherence; record timing and failures before declaring the prompt consistent. Never use live provider credentials for mocked load tests.

## H. Deployment procedure

1. Choose a maintenance window. Export a fresh private normalized database backup and obtain a restorable PostgreSQL backup. If upgrading the legacy JSON application, follow `SUPABASE_SETUP.md` freeze/export/dry-run/import procedure first. A verified local copy of `data/competition.json` was also retained under ignored `backups/` during this work; it is not a hosted database backup.
2. Rehearse in a separate Supabase project. Fresh projects run migrations **001, 002, 003, 004** in order. Existing normalized installations run any unapplied 003, then **004_booth_sessions.sql**. Migration 004 is repeatable and preserves all competition rows. Never rerun migration 003 after 004, because it would replace the newer RPC.
3. Deploy the matching server/browser code together. Keep `NODE_ENV=production`, `SUPABASE_URL`, server `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, existing `SESSION_SECRET`, private `ADMIN_PASSWORD` and correct HTTPS `APP_ORIGIN`. Do not prefix secrets with VITE_. Keep `AI_CONCURRENCY=6`, `MAX_QUEUE=150` and a realistic daily budget. Existing Render variables override defaults.
4. `render.yaml` retains the paid `0.5c-512mb` compute plan and disabled automatic deploys; no infrastructure purchase/change was made. Use an always-on service for the event. Free Render services sleep after inactivity; see [Render free-service documentation](https://render.com/docs/free). Review actual Render CPU/RSS during rehearsal before choosing a larger plan. [Current blueprint plan reference](https://render.com/docs/blueprint-spec).
5. `/api/health` should show API version 3 and booth-session support. `/api/ready` must return HTTP 200 with Supabase connected and schema version 4 installed. This is not a Gemini quota check.
6. In `/admin`, while the round is waiting or paused, enable **Booth mode: allow voting while story creation is open** and **Allow participants to rate their own stories**. Save rules, then **Start / Open submissions**. Choose minimum votes appropriate to the event: use 1 if the author's initial vote should immediately confer eligibility; use a higher threshold if desired. This does not change the 50/50 formula.
7. Open `/booth` on the shared device, `/play` on personal devices and `/leaderboard` on the projector. Use optional one-use event voting codes for stronger organiser-controlled identity checks. A new booth session requires a new code when strict codes are enabled.
8. Retry existing failed saved stories through **Retry AI judging**; do not regenerate them to repair a missing score. Verify sample stories, votes and historical round counts before reopening access.
9. Repeat the three-person journey on deployed phones/tablets/projector with the real Gemini model, including a network interruption and restart. Verify provider requests/tokens/credits in [Google AI Studio quota documentation](https://ai.google.dev/gemini-api/docs/rate-limits). Six successful stories normally require 12 provider calls plus retry allowance.

For isolated multi-connection load testing, create a fresh empty Supabase test project, supply its connection string privately as `LOAD_TEST_DATABASE_URL`, set `ISOLATED_LOAD_TEST=YES`, then run `npm.cmd run test:load`. The runner refuses occupied targets and creates current migrations. Do not point this at production. Review the resulting report before destroying the disposable project.

## I. Rollback and remaining risks

Keep maintenance active and take a fresh backup before rollback. Prefer fixing forward. Disabling booth mode while paused returns to phase-based voting without removing data. Keep the version-4 server/database protections when reverting only the presentation. Do not install an older RPC over migration 004 after using participant resets: old code would ignore retired identities. Never roll back to stale legacy JSON after any new stories or votes were accepted. Use the existing PostgreSQL restore-to-a-new-project procedure and reconcile counts before reopening.

Anonymous reset does not prove a different human arrived. The booth is an organiser-supervised workflow; optional one-use codes strengthen control. HttpOnly signed cookies and retired identities block forged or ended sessions, but a currently valid stolen bearer credential cannot be distinguished from its owner without additional authentication. Do not display credentials on the shared device.

The service uses Supabase REST RPC rather than opening one direct PostgreSQL connection per visitor; the database still has finite PostgREST/transaction capacity. Embedded tests serialize SQL and do not validate hosted pool saturation or cross-machine lock behavior. Provider capacity, billing, network conditions, real touch devices and projector behavior must be rehearsed. Hidden browser tabs defer polling until visible; visible projector screens refresh at the configured interval. Restarted workers may wait for an outstanding lease to expire before recovery.

## J. Event readiness

**Ready for rehearsal.** Local verified workflows satisfy the booth journey. Public-event readiness remains conditional on an approved deployment, successful migration/backup verification, live 20-case quality review, real Gemini timing/quota checks, hosted concurrency/restart checks and the event-device rehearsal checklist. No production success or capacity guarantee is inferred from mocks.
