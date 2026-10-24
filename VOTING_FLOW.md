# Current story and voting flow

The creation page uses a two-column story studio on desktop and a single column on phones. Idea suggestions collapse behind **Need an idea?** on smaller screens and remain keyboard accessible. A progress strip shows the current step; the draft stays on the device. Choosing an example requires confirmation before replacing existing text. During generation a dedicated progress view replaces the editor, retaining the original draft and operation key. Job reconciliation and retry keys survive reloads.

The saved-story heading receives focus when the story arrives. The reading view displays the complete story, a read-aloud button where supported, AI judging status and **How funny was this story?** rating controls directly beneath it. **Read Another Story** opens the public gallery. Booth participants can choose **Finish and Start Next Participant** here or in the gallery; this preserves server-issued identity boundaries, pending-vote protection and reset reconciliation.

The public `/vote` gallery shows compact title/nickname/excerpt cards with **Read and Vote**. Selecting a card opens an in-page reader with the entire story and rating controls. The reader heading receives focus; **Back to stories** returns focus to the selected gallery button. Ratings remain independent between stories. Votes appear recorded only after server confirmation. A lost response retains its request key and a retry action, including after reloading the generated-story screen. Rating buttons show a number, star and plain-language description. Choosing a rating does not submit it. Existing self-voting and event-code rules still apply.

Story creation and public voting are always available in the active round. There are no opening, closing or final-publication controls. The leaderboard stays live, and CSV/backup downloads capture standings at the time of export. The configured public-vote eligibility threshold is unchanged.

## Leaderboard and main screen

Open `/leaderboard` on the separate main screen and select **Presentation Mode**. The interface uses browser fullscreen when available and a clean presentation layout otherwise. Choose **Exit Presentation** to leave; native fullscreen also supports Escape. Navigation is hidden and removed from keyboard navigation during presentation.

The compact leaderboard highlights the top three eligible stories with gold/silver/bronze rank badges. Other entries remain in **Provisional standings**, with no rank and missing public and combined scores shown as a dash. **How rankings work** explains the configured minimum public-vote requirement and tie breakers.

Desktop and landscape tablets show the scores and selected story side by side, at approximately 38% / 62% width, making the story the main stage. Both panels fill the remaining viewport below the navigation and header. Scores scroll inside the left panel with sticky column headings; the story body scrolls inside the right panel while its title, author, rank/status, scores, votes and navigation stay visible. Phones and portrait tablets use **Leaderboard** / **Read Story** tabs. Select a row (or focus its story button and press Enter) to read it; Previous/Next keep the selection highlighted. Arrow keys, Home and End navigate the tabs. **How rankings work** opens a compact scrollable explanation without pushing the panels down.

A story spotlight shows one full story at a time. Previous/Next work in either view. Stories automatically rotate every 8 seconds in both normal and presentation views. **Previous**, **Pause / Play** and **Next** stay visible under the full story. **Change story every** offers 8, 12, 20, 30, 45 or 60 seconds; the interval and pause choice are retained in this browser tab. Clicking a row or using Previous/Next restarts a complete interval, including when selecting the same story; manual navigation does not cancel a chosen pause. A subtle progress line indicates the current interval. Hidden tabs and reduced-motion / Less movement settings suspend playback, and returning resumes a fresh interval. Score-only polling does not reset the slide timer. Timers and listeners are cleaned up when leaving the page. The selected story survives score reordering. Rankings refresh silently every 60 seconds; failed requests keep the last valid results visible. Polling returns ranking metadata only. Story bodies are fetched individually when selected and cached in the page. Historical snapshots are not rewritten.

## Deployment

Deploy the matching frontend and server together after applying migrations 001 through 006 in order (complete any legacy import before 006), as documented in SUPABASE_SETUP.md. `/api/ready` checks schema version 6. The active round stays open for story creation and voting, with no open/close, publish or new-round buttons. Existing published snapshots remain fixed; a published current round is preserved and followed by a fresh open round. No hosted deployment or production database was modified during this local work.

## Validation

See UI_REDESIGN_REPORT.md for implementation scope, browser checks and current limitations. Earlier workflow descriptions in BOOTH_REPORT.md are historical and superseded by this guide.
