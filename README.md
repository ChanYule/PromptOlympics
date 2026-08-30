# Prompt Olympics

A self-contained React + TypeScript + Vite implementation based on the uploaded Prompt Olympics master build prompt.

## Run locally

1. Install Node.js 18+.
2. Extract the ZIP.
3. Open a terminal in the project folder.
4. Run:
   npm install
   npm run dev
5. Open the local URL shown by Vite.

## Notes

- This version is fully functional in the browser with localStorage persistence.
- Story generation and AI judging are mock/template based, so it needs no API key.
- Voting, leaderboard and gallery work locally on the same browser.
- The Admin button is a lightweight demo control panel, not a production password/authentication system.
- For a true multi-device/public deployment, replace localStorage with a server/database and add server-side moderation, Zod validation, vote constraints and a password-protected admin API as specified in the master prompt.
