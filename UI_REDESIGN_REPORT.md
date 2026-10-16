# Prompt Olympics interface update

The existing React application, Express routes, Supabase repository, Gemini generation/judging workflow, participant sessions and competition rules were retained. No UI framework or new runtime dependency was added. This is a local implementation; the hosted Render service and production database were not modified.

## What changed

- Shared forest/sage/cream/gold tokens, consistent card surfaces, restrained shadows, clear typography, touch targets and focus states. Language and accessibility controls share a compact utility bar.
- A creation form with approximately 730px of usable desktop input width, a three-state step indicator, secondary name suggestions, and inspiration chips. A confirmation protects existing ideas from being overwritten. Generation preserves entered values and disables submission while showing a compact, real job status. No numerical progress is invented.
- Full generated stories retain AI judging status and now have voting directly underneath, as requested in the latest brief. Booth handoff and secure reset are available here. Unknown vote outcomes retain their idempotency key and retry action across reloads.
- Compact discovery cards replace the full-story gallery. An in-page reader presents the complete story at approximately 19px with generous line height. It moves keyboard focus to the reader heading and returns focus to the originating card on Back. It avoids modal focus traps and body-scroll issues on iPads.
- Shared `RatingStars` uses native radios for arrow-key operation, outlined stars, gold hover/selection, translated labels and selected-rating text. Submit controls distinguish unavailable, ready, saving and server-confirmed states. Server duplicate-vote protection, self-voting settings and event-code checks remain authoritative.
- Only award-eligible entries appear on the gold/silver/bronze podium. Provisional entries and stories remain visible in a separate section without trophy ranks. Missing scores remain a dash. The configured vote threshold is unchanged. Tie breakers and qualification details sit in an expandable section.
- Ranking rows have separate participant/story columns, stronger combined scores and phone-friendly card layouts. Presentation mode includes a full-story spotlight, eligible podium and standings. It supports fullscreen and a fixed-layout fallback; hidden navigation cannot receive keyboard focus. Reduced-motion preferences suppress automatic story rotation.
- Leaderboard polling remains silent, approximately every 60 seconds, with last-valid-data retention, ETags and cleanup. `/api/leaderboard` now omits story bodies. `/api/leaderboard/story/:id` verifies membership in the requested leaderboard and returns only the selected public story. The page caches selected bodies and preserves selection across score reordering. Historical snapshots are unchanged.

## Verification

- Production TypeScript/Vite build passed.
- 39 automated server, repository, scoring, security, migration and database tests passed.
- Nine Chromium browser workflows passed, covering English/Chinese switching, generated-story voting, compact gallery reading, independent draft ratings, keyboard radios, confirmation timing, duplicate clicks, lost generation/vote/reset responses, reload recovery, three-participant handoff, backend restart, scoring, publication, refresh failures, story rotation and fullscreen fallback.
- Layout checks covered 360, 390, 768, 1024, 1440 and 1920px, including 1024×768 tablet landscape, large text and 1920×1080 presentation. Screenshots were visually reviewed. Automated axe checks found no violations in the tested WCAG A/AA flows; these do not replace a human accessibility assessment.
- The 393-entry translation audit passed, including placeholder matching and coverage of the new interface labels. New Chinese copy was reviewed against the English meaning.
- The disposable mocked load run completed 100 generation jobs, 500 concurrent voting operations and 200 leaderboard requests, with zero lost confirmed votes, duplicate vote records or unexpected errors. This used loopback HTTP, PGlite and mocked Gemini; it does not establish real Render, Supabase or Gemini capacity.

Evidence: `reports/redesign-tests.txt`, `reports/redesign-e2e.txt`, `reports/redesign-load.txt` and `reports/redesign-*.png`. The projector screenshot is `reports/leaderboard-big-screen.png`.

## Deployment and remaining event checks

Deploy the frontend and server together. This UI update requires no additional Supabase migration; the previously required migrations through 005 still apply. See `VOTING_FLOW.md` for the current participant journey.

Browser checks used local Chromium and a disposable backend. Actual iPad Safari touch/keyboard behavior, the event projector, hosted latency and real Gemini quotas still need an event rehearsal. Use the existing `/api/ready` check after deployment and verify one real story and confirmed vote before the booth opens.
