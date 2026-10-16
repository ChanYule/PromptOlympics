import path from "node:path";
import { createLocalRepository } from "./localRepository.js";
import { DomainError } from "./competitionStore.js";
export class StorageError extends Error {
  constructor() {
    super(
      "Saved competition data is temporarily unavailable. Please try again.",
    );
    this.status = 503;
  }
}
export function createCompetitionRepository({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const url = env.SUPABASE_URL,
    key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if ((url || key) && !(url && key))
    throw new Error("Set both SUPABASE_URL and SUPABASE_SECRET_KEY.");
  if (!url) {
    if (env.NODE_ENV === "production" || env.STORAGE_MODE !== "local")
      throw new Error(
        "Production requires Supabase. Set STORAGE_MODE=local explicitly for development only.",
      );
    return createLocalRepository(
      path.resolve(env.LOCAL_DATA_PATH || "data/development-v2.json"),
    );
  }
  const base = new URL(url);
  if (base.protocol !== "https:")
    throw new Error("SUPABASE_URL must use HTTPS.");
  if (key.startsWith("sb_publishable_"))
    throw new Error("Use a server secret key.");
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) {
    try {
      const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url"));
      if (claims.role !== "service_role") throw new Error();
    } catch {
      throw new Error("Use a server secret or service_role key.");
    }
    headers.Authorization = `Bearer ${key}`;
  }
  return {
    kind: "supabase",
    async leaderboardStories(ids) {
      const stories = new Map();
      try {
        // Only published leaderboard entry IDs; bounded GET batches and public fields.
        const unique = [...new Set(ids)];
        for (let start = 0; start < unique.length; start += 40) {
          const batch = unique.slice(start, start + 40);
          const url = new URL(base.origin + "/rest/v1/po_submissions");
          url.searchParams.set("select", "id,story");
          url.searchParams.set(
            "id",
            "in.(" + batch.map((id) => JSON.stringify(id)).join(",") + ")",
          );
          url.searchParams.set("limit", String(batch.length));
          const response = await fetchImpl(url.toString(), {
            headers,
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new StorageError();
          const rows = await response.json();
          if (!Array.isArray(rows)) throw new StorageError();
          for (const row of rows)
            if (batch.includes(row.id) && typeof row.story === "string")
              stories.set(row.id, row.story);
        }
        return stories;
      } catch {
        throw new StorageError();
      }
    },
    async call(action, payload = {}) {
      let data;
      try {
        const response = await fetchImpl(`${base.origin}/rest/v1/rpc/po_api`, {
          method: "POST",
          headers,
          body: JSON.stringify({ action, payload }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new StorageError();
        data = await response.json();
      } catch {
        throw new StorageError();
      }
      if (data?.error && typeof data.status === "number")
        throw new DomainError(data.error, data.status);
      return data;
    },
  };
}
