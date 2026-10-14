import fs from "node:fs";
const url = process.env.SUPABASE_URL,
  key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
try {
  if (!url || !key || new URL(url).protocol !== "https:")
    throw new Error(
      "Configure Supabase server credentials in your local environment.",
    );
  const headers = { apikey: key };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(
    new URL(
      "/rest/v1/prompt_olympics_state?id=eq.prompt-olympics&select=state,version",
      url,
    ),
    { headers, signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok)
    throw new Error(
      "Legacy export failed. Check the database connection privately.",
    );
  const [row] = await response.json();
  if (!Array.isArray(row?.state?.rounds))
    throw new Error("No valid legacy state found.");
  fs.mkdirSync("backups", { recursive: true });
  const file = process.argv[2] || `backups/legacy-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(row.state, null, 2), { flag: "wx" });
  console.log(
    JSON.stringify({
      file,
      legacyVersion: row.version,
      rounds: row.state.rounds.length,
      stories: row.state.rounds.reduce((n, r) => n + r.submissions.length, 0),
      votes: row.state.rounds.reduce((n, r) => n + r.votes.length, 0),
    }),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
