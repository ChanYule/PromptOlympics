# Live-event checklist

Use a test/rehearsal round before inviting the audience. Do not declare the event ready from a build alone.

## Before the day

- [ ] Database operator followed `SUPABASE_SETUP.md`, retained both preliminary/frozen backups and verified import counts. The legacy table remains intact and write-blocked.
- [ ] Hosting uses an always-on paid service. Disable Render auto-deploy during the event. Rehearse a server restart and confirm stories/votes remain saved.
- [ ] `/api/ready` returns HTTP 200 and `storageConnected: true`, `storage: "supabase"`. No local storage is permitted for the live deployment.
- [ ] `ADMIN_PASSWORD`, `SESSION_SECRET`, Supabase and Gemini credentials are set privately in Render Environment. Do not share them on slides or chat. `APP_ORIGIN` matches the site URL.
- [ ] Google AI Studio shows enough provider requests/tokens for the expected attendees. Include judging, regenerated versions and bounded retries in the allowance. `AI_CONCURRENCY`, `MAX_QUEUE` and the daily job cap fit the actual quota.
- [ ] Run the dedicated PostgreSQL concurrency test and a deployed rehearsal. Review lost/duplicate votes, response times, CPU/memory and provider errors. Local mocked metrics are not hosted capacity guarantees.
- [ ] Test Android/iPhone and tablets on the actual venue Wi-Fi; anonymous session rate limits do not penalize a shared venue IP.
- [ ] Keep a private database backup off the server and rehearse restore to a dedicated test project.

## Rehearsal workflow

1. Open `/admin`, sign in and check **Always open**. Story creation and voting need no start or close action.
2. At `/play`, enter a nickname and idea. Check **Saved to the competition** appears, followed by a genuine AI score. The story must appear before judging completes.
3. Refresh the browser and confirm the saved story/input survives. Never submit an extra version just because a connection failed; use **Check and retry the same request**.
4. In `/admin`, inspect pending jobs and failed requests. Test **Retry AI judging** on a simulated failure in the test environment. Missing historical scores require the explicit **Judge unscored historical story** action and confirmation; completed historical scores remain intact.
5. Set minimum award votes (default five). If strict voting is needed, select **Require a one-use event voting code**, save the rules, create codes and distribute one per attendee. Save new code output privately before navigating away.
6. Story creation and voting remain available together throughout the event. There are no phase controls.
7. Use a separate browser/device at `/vote`; read a full story, pick one star rating and submit. Check confirmation. Retry a lost-response vote with **Check and confirm my vote**; do not create a new identity.
8. Confirm the author cannot vote for their own story from their submitting browser. Explain that anonymous cross-device identities are not a full person-verification system.
9. Keep `/leaderboard` open in another browser. Within about 60 seconds plus a small polling offset, its rankings must update without a page reload, blank screen or lost scroll position. Check AI/public/combined scores and vote count.
10. Select **Present fullscreen** on the actual projector. Verify the top three and all score columns are legible. If browser fullscreen is blocked, the clean presentation layout still appears.
11. Confirm the dashboard has no opening, closing, publication or new-round controls. Vote from another device and confirm the live count increases.
12. Resolve pending/failed judging before announcing standings. Restart the rehearsal server and confirm entries/votes survive and participation remains open.
13. Download **Export results CSV** and **Download database backup** at the announcement time. Check the files privately. Live rankings continue changing; there is no final publication lock.

## During the event

- [ ] Keep an organiser signed in; sessions last one hour. Have the private password available without displaying it.
- [ ] Watch pending/failed jobs, database failures and successful leaderboard refresh time in the dashboard.
- [ ] If story creation is busy, keep ideas in the browser and wait for the same job. Avoid repeated new-version clicks, which consume quota.
- [ ] If Gemini fails, stories already saved remain readable and public voting can continue. Do not assign substitute AI scores.
- [ ] If the database is unavailable, announce a pause. No failed vote response means “recorded.” Once recovered, retry the same operation key.
- [ ] A worker restart recovers durable queue leases; allow up to two minutes for an interrupted lease to expire. Do not reset data or queues to speed it up.
- [ ] Explain that participation stays open and rankings are live; exported results represent the download time.

## Recovery and final announcement

Take a fresh backup before any recovery. Follow the rollback restrictions in `SUPABASE_SETUP.md`; never return to stale legacy data after new votes were accepted. Keep the event paused until `/api/ready`, vote reconciliation and leaderboard checks succeed.

Announce **eligible** standings only. Entries below the minimum vote threshold remain visible as provisional, but cannot receive official awards under the configured rule. Preserve the CSV and database snapshot for review. Historical published snapshots remain fixed. The active round has no publication lock.

## Continuous booth rehearsal

- [ ] Apply and rehearse migrations 004 through 006; /api/ready must reject an older schema. Retain private database backups.
- [ ] Apply migration 006 and choose author-rating/code rules and the award minimum. Voting opens automatically with submissions.
- [ ] On /booth, complete Happy Panda (5 stars), Funny Uncle (4 stars) and Super Chicken (3 stars), using Finish and Start Next Participant between each. Verify prompts/nicknames clear and every prior entry remains.
- [ ] Disconnect during generation, vote and participant reset; reconcile each operation and verify exactly one story/vote.
- [ ] If using inactivity reset, verify the warning and that active generation/uncertain votes are retained.
- [ ] Check /play separately on personal phones and /leaderboard on two screens, including the projector. Confirm background updates, larger text, keyboard/touch use and network recovery.
- [ ] Run the isolated live 20-case prompt quality check described in BOOTH_REPORT.md and measure actual generation latency; mocks cannot establish humour or a 5-to-10-second target.
