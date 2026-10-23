# Current story and voting flow

The creation page uses one name-and-idea form with a progress indicator and inspiration chips. Choosing an example requires confirmation before replacing existing text. During generation the form values remain on the page, disabled to prevent duplicate requests. Job reconciliation and retry keys survive reloads.

The generated-story screen displays the complete saved story, AI judging status and **How funny was this story?** rating controls directly beneath it. **Read Another Story** opens the public gallery. Booth participants can choose **Finish and Start Next Participant** here or in the gallery; this preserves server-issued identity boundaries, pending-vote protection and reset reconciliation.

The public `/vote` gallery shows compact title/nickname/excerpt cards with **Read and Vote**. Selecting a card opens an in-page reader with the entire story and rating controls. The reader heading receives focus; **Back to stories** returns focus to the selected gallery button. Ratings remain independent between stories. Votes appear recorded only after server confirmation. A lost response retains its request key and a retry action, including after reloading the generated-story screen. Existing self-voting and event-code rules still apply.

Story creation and public voting are always available in the active round. There are no opening, closing or final-publication controls. The leaderboard stays live, and CSV/backup downloads capture standings at the time of export. The configured public-vote eligibility threshold is unchanged.

## Leaderboard and main screen

Open `/leaderboard` on the separate main screen and select **Presentation Mode**. The interface uses browser fullscreen when available and a clean presentation layout otherwise. Choose **Exit Presentation** to leave; native fullscreen also supports Escape. Navigation is hidden and removed from keyboard navigation during presentation.

Only eligible entries appear on the gold/silver/bronze podium. Other entries remain in **Provisional standings**, with missing public and combined scores shown as a dash. **How rankings work** explains the configured minimum public-vote requirement and tie breakers.

A story spotlight shows one full story at a time. Previous/Next work in either view. Presentation mode rotates stories every 45 seconds, with Pause/Resume controls. Reduced-motion preferences stop automatic rotation. The selected story survives score reordering. Rankings refresh silently every 60 seconds; failed requests keep the last valid results visible. Polling returns ranking metadata only. Story bodies are fetched individually when selected and cached in the page. Historical snapshots are not rewritten.

## Deployment

Deploy the matching frontend and server together after applying migrations 001 through 006 in order (complete any legacy import before 006), as documented in SUPABASE_SETUP.md. `/api/ready` checks schema version 6. The active round stays open for story creation and voting, with no open/close, publish or new-round buttons. Existing published snapshots remain fixed; a published current round is preserved and followed by a fresh open round. No hosted deployment or production database was modified during this local work.

## Validation

See UI_REDESIGN_REPORT.md for implementation scope, browser checks and current limitations. Earlier workflow descriptions in BOOTH_REPORT.md are historical and superseded by this guide.
