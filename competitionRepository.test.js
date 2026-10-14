import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompetitionRepository,
  StorageError,
} from "./competitionRepository.js";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test",
};
test("production fails closed and local storage requires explicit opt-in", () => {
  assert.throws(
    () => createCompetitionRepository({ env: {} }),
    /requires Supabase/,
  );
  assert.throws(
    () =>
      createCompetitionRepository({
        env: { NODE_ENV: "production", STORAGE_MODE: "local" },
      }),
    /requires Supabase/,
  );
  assert.throws(
    () =>
      createCompetitionRepository({ env: { SUPABASE_URL: env.SUPABASE_URL } }),
    /Set both/,
  );
  assert.throws(
    () =>
      createCompetitionRepository({
        env: { ...env, SUPABASE_SECRET_KEY: "sb_publishable_bad" },
      }),
    /server secret/,
  );
});
test("Supabase calls normalized RPC without downloading or rewriting JSON state", async () => {
  const calls = [];
  const repo = createCompetitionRepository({
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ recorded: true }), { status: 200 });
    },
  });
  assert.equal((await repo.call("vote", { rating: 5 })).recorded, true);
  assert.ok(calls[0].url.endsWith("/rpc/po_api"));
  assert.equal(JSON.parse(calls[0].options.body).action, "vote");
  assert.equal(calls[0].options.headers.Authorization, undefined);
});
test("database diagnostics are private and no local fallback occurs", async () => {
  const repo = createCompetitionRepository({
    env,
    fetchImpl: async () => new Response("private credentials", { status: 503 }),
  });
  await assert.rejects(
    repo.call("vote", {}),
    (e) => e instanceof StorageError && !e.message.includes("credentials"),
  );
});
test("domain rejections are distinguished from storage failure", async () => {
  const repo = createCompetitionRepository({
    env,
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: "Voting is closed.", status: 409 })),
  });
  await assert.rejects(repo.call("vote"), (e) => e.status === 409);
});
