import pg from "pg";
import fs from "node:fs";
import { DomainError } from "../competitionStore.js";
export async function postgresLoadDatabase() {
  if (process.env.ISOLATED_LOAD_TEST !== "YES")
    throw new Error(
      "Set ISOLATED_LOAD_TEST=YES only for a dedicated empty test database.",
    );
  const pool = new pg.Pool({
    connectionString: process.env.LOAD_TEST_DATABASE_URL,
    max: 20,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
  });
  try {
    const occupied = await pool.query(
      "select exists(select 1 from pg_tables where schemaname='public') occupied",
    );
    if (occupied.rows[0].occupied)
      throw new Error(
        "Load test database already contains Prompt Olympics tables. Use a fresh disposable test database.",
      );
    await pool.query(
      fs.readFileSync(
        new URL("../supabase/migrations/001_normalized.sql", import.meta.url),
        "utf8",
      ),
    );
    for (const file of [
      "003_shared_device_voting.sql",
      "004_booth_sessions.sql",
      "005_always_open_voting.sql",
      "006_always_open_event.sql",
    ])
      await pool.query(
        fs.readFileSync(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
  } catch (e) {
    await pool.end();
    throw e;
  }
  return {
    kind: "postgres-isolated-load",
    db: { query: (...args) => pool.query(...args), close: () => pool.end() },
    async call(action, payload = {}) {
      const { rows } = await pool.query(
        "select public.po_api($1,$2::jsonb) result",
        [action, JSON.stringify(payload)],
      );
      const result = rows[0].result;
      if (result?.error && typeof result.status === "number")
        throw new DomainError(result.error, result.status);
      return result;
    },
  };
}
