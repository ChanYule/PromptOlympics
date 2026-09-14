# Save Prompt Olympics stories in Supabase

The integration is ready in the code. Complete these steps to connect your own Supabase project. No extra npm package is required: the Express server uses Supabase's REST API.

## 1. Back up existing stories before redeploying Render

If you want to keep the current stories, run this in PowerShell now:

```powershell
Invoke-RestMethod 'https://promptolympics.onrender.com/api/competition' |
  ConvertTo-Json -Depth 100 |
  Set-Content -Encoding UTF8 'prompt-olympics-backup.json'
```

Check that the file contains your stories under `competition.rounds`. Keep this file private: it includes voting records. Do this before a redeploy because the current local JSON file may disappear when Render replaces the server. If you want to start empty, skip this step and step 5.

## 2. Create your Supabase project

1. Sign in at https://supabase.com/dashboard.
2. Choose **New project**, select your organization, and name it `Prompt Olympics`.
3. Set a strong database password and choose a region near your audience, such as Singapore when available.
4. Wait for the project to finish setting up.

## 3. Create the database table

1. In the project dashboard, open **SQL Editor** and create a new query.
2. Open [supabase/schema.sql](supabase/schema.sql) in this project.
3. Copy the entire file into the SQL Editor and select **Run**.
4. Open **Table Editor** and confirm that `prompt_olympics_state` exists.

The SQL enables Row Level Security and prevents browser users from accessing the table directly. Keep these protections enabled. All reads and writes go through your Express server.

## 4. Get the connection details

Use the project's **Connect** dialog or API settings to find the **Project URL**. It looks like `https://YOUR_PROJECT_REF.supabase.co`.

In **Settings → API Keys**, create or copy a **secret key** (`sb_secret_...`). Use the secret key, not the publishable/anon key and not the database password. A legacy `service_role` key is also supported through `SUPABASE_SERVICE_ROLE_KEY`.

Never put the secret key in `src/`, a `VITE_` variable, a Git commit, or a message. Only the server should receive it.

## 5. Optional: import your existing stories

Before directing the live site to Supabase, import the backup from step 1 from your computer. In PowerShell, from this project folder:

```powershell
$env:SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co'
$env:SUPABASE_SECRET_KEY = Read-Host 'Paste your Supabase secret key' -MaskInput
node scripts/import-supabase.js prompt-olympics-backup.json
```

`-MaskInput` requires PowerShell 7.1+. On Windows PowerShell 5, use this instead of the second line:

```powershell
$secret = Read-Host 'Paste your Supabase secret key' -AsSecureString
$env:SUPABASE_SECRET_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
```

The import accepts either the API backup above or an existing `data/competition.json`. It preserves stories, votes, scores, and round history. It refuses to overwrite an occupied database or repeat a completed import. Close the terminal when finished to clear the session variables.

Keep voting/submissions paused during the final backup and import, or do this when nobody is using the site. New votes made on the old server after your backup are not automatically copied.

## 6. Configure Render

Open your Render web service, then **Environment**, and add:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase Project URL |
| `SUPABASE_SECRET_KEY` | Your `sb_secret_...` server key |
| `ADMIN_PASSWORD` | A private password for the app's `/admin` page |

Keep your existing `GEMINI_API_KEY` and any `GEMINI_MODEL` setting. Supabase stores stories; Gemini still writes them.

Save the settings and deploy the updated code. The build command stays `npm install --include=dev && npm run build`, and the start command stays `npm start`. For a Blueprint setup, the variables are also listed in `render.yaml` for you to fill in.

## 7. Confirm the connection

1. Open `https://promptolympics.onrender.com/api/health`.
2. Look for `"storage": "supabase"` and `"storageConnected": true`.
3. Create a story in the app and confirm it appears in Read stories.
4. Open Supabase's Table Editor. There should be one `prompt-olympics` row in `prompt_olympics_state`. Its `state` JSON contains `rounds`, each with `submissions` and `votes`.
5. Restart/redeploy the Render service, then refresh the app. The story should remain.

If health says `"storage": "local"`, the running server has no Supabase configuration. If it returns HTTP 503, check the project URL, secret key, table setup, and whether your Supabase project is running. A Supabase failure never silently switches the app back to local storage.

## Local development

Use Node.js 22.18+ for all the project's tests. Set the environment variables as above, then run `npm run build` and `npm start`. For Gemini generation, also set `GEMINI_API_KEY` in that terminal. Visit `http://localhost:10000`.

`.env.example` documents the variables. `npm start` does not automatically load `.env`; either set the variables in your terminal or run `node --env-file=.env server.js` on Node.js 22.18+. The Vite development server alone does not run the Express API.

With no Supabase variables, the app still uses `data/competition.json` for local development. Setting only one of the two required variables causes startup to fail with a configuration message.

## Storage design and checks

This version stores the whole competition in one JSONB row, preserving the existing app's data model and round/admin features. Each save checks a version number; if another visitor saves first, the server reloads and retries rather than overwriting their story or vote. The row is created automatically when first accessed.

This is suited to a small event. The complete competition is read and written for each change, so a large or high-traffic service should move to separate submissions/votes tables and database transactions. Stories are in the database, not Supabase Storage (which is for files).

Run `node --test competitionRepository.test.js competitionStore.test.js geminiConfig.test.js`. These tests use a simulated Supabase API to check persistence, concurrent saves, duplicate votes, and failure handling. A real-project connection must still be verified with step 7.

Official references: [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [SQL Editor and tables](https://supabase.com/docs/guides/database/tables), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
