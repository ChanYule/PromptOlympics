import fs from "node:fs";
import { prepareMigration } from "./migrationData.js";
const args = process.argv.slice(2),
  filename = args.find((a) => !a.startsWith("--"));
try {
  if (!filename)
    throw new Error(
      "Usage: node scripts/import-supabase.js backup.json --dry-run [--legacy-open-state=VOTING]",
    );
  const raw = JSON.parse(
    fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, ""),
  );
  fs.mkdirSync("backups", { recursive: true });
  const backup = `backups/migration-${Date.now()}.json`;
  fs.copyFileSync(filename, backup, fs.constants.COPYFILE_EXCL);
  const data = prepareMigration(raw, {
    legacyOpenState: args
      .find((a) => a.startsWith("--legacy-open-state="))
      ?.split("=")[1],
  });
  console.log(
    JSON.stringify(
      { backup, counts: data.counts, warnings: data.warnings },
      null,
      2,
    ),
  );
  if (!args.includes("--apply")) {
    console.log("Dry run only. No database writes.");
    process.exit(0);
  }
  if (!args.includes("--maintenance-confirmed"))
    throw new Error(
      "Stop ALL old app instances and workers, disable auto-deploy, then pass --maintenance-confirmed.",
    );
  const url = process.env.SUPABASE_URL,
    key =
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || new URL(url).protocol !== "https:")
    throw new Error("Configure server Supabase credentials securely.");
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(new URL("/rest/v1/rpc/po_import", url), {
    method: "POST",
    headers,
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(
      "Import refused or failed. No partial transaction is committed. Check database logs privately.",
    );
  const counts = await response.json();
  if (
    JSON.stringify(Object.entries(counts).sort()) !==
    JSON.stringify(Object.entries(data.counts).sort())
  )
    throw new Error("Count mismatch. Keep maintenance enabled.");
  console.log("Import confirmed:", counts);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
