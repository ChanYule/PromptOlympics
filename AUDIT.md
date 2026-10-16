# Repository audit and implementation decisions

Audited 14 October 2026 before editing: server routes, both repositories/domain modules, frontend, scoring and generation helpers, CSS, tests, SQL, import script, configuration and documentation. The working tree was initially clean. The original local `data/competition.json` was copied to `backups/competition-before-upgrade-2026-10-14.json` and remains unchanged.

| Confirmed finding                                                     | Implemented correction                                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Supabase reads/writes a single JSON row with eight optimistic retries | Normalized tables; independent vote inserts; transactional RPC; no production JSON repository   |
| Every round normalizes to OPEN                                        | Enforced five-state lifecycle with audited transitions                                          |
| Keyword judging plus competing frontend random/heuristic scores       | Structured Gemini judging; pending/failed states; fixed rubric; server calculation              |
| Public endpoint returns all rounds, raw votes, session identifiers    | Separate round metadata, private voter-specific story lists, compact leaderboard                |
| Browser can replace its voter ID and submit arbitrary story text      | Signed HttpOnly persistent voter session; server-only generation; optional one-use codes        |
| Generation and saving are separate browser requests                   | Durable job accepted with an operation key; server generates, validates, saves and judges       |
| No queue, provider budget or retry control                            | Shared PostgreSQL leases, concurrency and queue limits, participant/day caps, bounded retries   |
| Default organiser password and repeated bearer-password requests      | Required private password; expiring, revocable server-backed organiser sessions; CSRF           |
| Public Gemini diagnostic endpoint and 50 MB bodies                    | Diagnostic removed; 8 KB body cap; rate limits and generic errors                               |
| 5,000 output tokens for a 100-word story                              | Structured title/story, 768-token ceiling, minimal thinking on Gemini 3, strict word validation |
| Leaderboard only refreshes on user action, fetching all votes         | Cached aggregate endpoint, ETags, silent polling, abort/visibility cleanup                      |
| Rounded values used for ranking and no award eligibility              | Precise numeric aggregation; minimum votes; documented stable ties; final snapshot              |
| Inconsistent page state, sorting exposes scores before votes          | Dedicated routes; session-rotated order; unvoted stories first; single star rating              |
| Dependency audit reported critical/high issues                        | Lockfile updated; final audit rerun recorded in verification report                             |

The old permissive OPEN rule cannot coexist with the requested separate submission/voting phases. Migration therefore requires an explicit mapping instead of guessing. Stored five-point historical scores are preserved exactly, including any curve already applied. Ten-point values are divided once at the migration boundary, with original records retained in `legacy`. Missing scores remain pending; they are never fabricated.

Published results cannot be reopened or edited through the app. Organisers can close/reopen voting before publication with an audit trail. After publication, start a new round. A historical amendment would require a separately reviewed database procedure and preserved prior snapshot; no automatic amendment path is shipped.

The unused offline story-generation and keyword-scoring experiment was removed from src during the booth audit. Official stories and judging use the server Gemini path. See BOOTH_REPORT.md for current findings and verification.

## Architecture

React routes → Express session/validation boundary → normalized PostgreSQL RPC. The service role is the only application role with table/function access. Database checks are authoritative; disabled buttons are only guidance. Concurrent votes use shared round locks, an identity-specific advisory lock, and uniqueness constraints. State changes take an exclusive round lock, so votes cannot commit across a closing transition. Different voters do not compete to rewrite a common state row.

The queue uses shared admission/claim locks and expiring worker leases. A generated result is persisted before the submission-saving step. Expired workers cannot commit with an old lease token. Restart recovery may repeat a provider call if the process dies before its result is persisted; the official submission remains unique. The queue limit bounds both generation and judging backlog. A configurable accepted-job budget bounds attempts, though provider-specific token/currency quotas still need separate monitoring.

Development storage is explicitly selected and supports one Node process only. It is not capacity evidence for production. The repeatable local SQL/load tests use PGlite, which serializes database operations. An optional dedicated PostgreSQL load runner uses 20 real connections and refuses an occupied target.

The current continuous booth audit and additional migration/session tests are recorded in BOOTH_REPORT.md. Earlier statements about separate-only voting phases or blanket self-vote rejection are superseded by configurable booth/independent-voter settings.
