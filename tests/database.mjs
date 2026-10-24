import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { DomainError } from "../competitionStore.js";
export async function database({ alwaysOpen = true } = {}) {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role;",
  );
  await db.exec(
    fs.readFileSync(
      new URL("../supabase/migrations/001_normalized.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      new URL(
        "../supabase/migrations/003_shared_device_voting.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      new URL("../supabase/migrations/004_booth_sessions.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      new URL(
        "../supabase/migrations/005_always_open_voting.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  if (alwaysOpen)
    await db.exec(
      fs.readFileSync(
        new URL(
          "../supabase/migrations/006_always_open_event.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  if (alwaysOpen)
    await db.exec(
      fs.readFileSync(
        new URL(
          "../supabase/migrations/007_story_title_guard.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  return {
    db,
    kind: "postgres-test",
    async call(action, payload = {}) {
      const { rows } = await db.query(
        "select public.po_api($1,$2::jsonb) result",
        [action, JSON.stringify(payload)],
      );
      const data = rows[0].result;
      if (data?.error && typeof data.status === "number")
        throw new DomainError(data.error, data.status);
      return data;
    },
  };
}
