import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { DomainError } from "../competitionStore.js";
export async function database() {
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
