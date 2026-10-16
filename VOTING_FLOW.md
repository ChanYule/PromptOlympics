# Current story and voting flow

The generated-story screen contains the title, story, AI judging status and **Continue to Read and Vote**. It has no rating stars or self-rating form.

On `/vote`, every card displays the complete story and its own 1-to-5-star controls and Submit Vote button. Participants can read and rate directly without opening a separate story view. Draft ratings are independent between cards, radio groups are unique per story, and successful votes are confirmed on their own cards. Existing organiser self-voting and one-use-code settings still apply there. The shared-device **Finish and Start Next Participant** control now lives on that voting page. It retains pending-vote protection, reset reconciliation and server-issued identity boundaries.

Voting opens automatically with submissions and stays available after submissions close, while AI judging completes. No separate **Open public voting** action or booth-mode checkbox is required. Publishing final results closes voting and freezes the final snapshot. Waiting rounds have not started and cannot receive new votes. Stopping story submissions alone does not stop voting.

## Deploy this update

1. Back up and rehearse the normalized database as described in SUPABASE_SETUP.md.
2. If migration 004 is already installed, run the entire `supabase/migrations/005_always_open_voting.sql` in Supabase SQL Editor. For a fresh project, run migrations 001 through 005 in numeric order. Do not install an older RPC migration after a newer one.
3. Deploy the matching server/browser code to Render. `/api/ready` checks for database schema version 5 and rejects an older schema with a migration-005 error.
4. Start/open submissions once in `/admin`. Participants can then create stories and use **Read and Vote** without further voting-phase controls.
5. Use **Close submissions** when story creation should end. Voting remains open. **Close voting & Publish results** ends voting once every story has a valid AI score and no jobs remain pending. Existing results and vote uniqueness protections are preserved.

No production database or deployment was modified by this local change.

## Verification

The three-participant browser scenario now follows the voting-page handoff. It verifies no rating controls on the generated-story screen, confirmed votes on the voting page, secure participant resets, separate participant records, and correct results after refresh/restart. Lost generation, vote and reset responses are also tested. A database regression verifies that voting works with the old booth setting disabled, during submissions and after submissions close, then rejects new votes after final publication.

Current results are recorded in `reports/open-voting-tests.txt`, `reports/open-voting-e2e.txt` and `reports/open-voting-load.txt`. Earlier inline-voting instructions in BOOTH_REPORT.md describe the prior workflow and are superseded by this guide.

Final verification: 37 automated tests passed (0 failed, 0 skipped); six browser workflows passed (0 failed, 0 skipped). Production build, formatting and the 334-entry translation audit passed. The disposable mocked load test completed 100 generation requests and 500 votes with zero lost confirmed votes or duplicate records. No hosted deployment or live Gemini capacity claim is made.

Inline-card verification: 37 automated tests and seven browser workflows passed, including independent ratings across two cards, English/Chinese switching, complete unclipped stories at 375/768/1366px, no premature vote confirmation, double-click protection and persisted votes after reload. This presentation change adds no new database migration beyond the previously required migration 005.

## Main-screen leaderboard stories

The normal leaderboard includes all full story texts below the ranking list. For the shared big screen, open /leaderboard, choose English or Chinese, then click **Present fullscreen**. A large full-story spotlight appears beside the rankings and advances every 45 seconds. Use Pause/Resume and Previous/Next story to control it; manual navigation gives the next story a fresh reading interval. The current story stays selected when ranking order changes during a background refresh. Reduced-motion preferences suppress automatic rotation. Fullscreen can be exited normally with Escape or Exit presentation.

The iPads continue using /booth or /play and /vote separately. The big-screen page has no voting controls and does not reset participant identities. Rankings refresh every 60 seconds; on failure the last confirmed rankings and stories remain visible. Historical leaderboard scores and snapshots are not rewritten. The server retrieves only id/story fields for the leaderboard entry IDs in bounded Supabase reads, under the existing server credential and short leaderboard cache. No additional database migration is introduced by the story-display change. Deploy the matching frontend and server together.
