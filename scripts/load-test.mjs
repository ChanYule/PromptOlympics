// Always starts its own disposable database and loopback server. Never targets a supplied URL.
import { database } from "../tests/database.mjs";
import { createApp } from "../server.js";
import { createAiService } from "../aiService.js";
import { once } from "node:events";
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { postgresLoadDatabase } from "./postgresLoadDatabase.mjs";
console.log("Starting disposable PostgreSQL database");
const repo = process.env.LOAD_TEST_DATABASE_URL
  ? await postgresLoadDatabase()
  : await database();
console.log("Database ready");
const env = {
  NODE_ENV: "test",
  AI_MODE: "mock",
  SESSION_SECRET: "load-test-secret-with-at-least-32-characters",
  ADMIN_PASSWORD: "load-test-admin-password-long",
  AI_CONCURRENCY: "6",
  MAX_QUEUE: "150",
};
const ai = createAiService(env);
let quotaErrors = 4,
  dbOutage = false;
const resilient = {
  kind: repo.kind,
  call(action, payload) {
    if (dbOutage)
      throw Object.assign(new Error("Simulated database outage"), {
        status: 503,
      });
    return repo.call(action, payload);
  },
};
const provider = {
  ...ai,
  async generate(input) {
    if (quotaErrors-- > 0)
      throw Object.assign(new Error("Mock quota"), { status: 429 });
    return ai.generate(input);
  },
};
let service = createApp({ env, repository: resilient, ai: provider });
let server = service.app.listen(0, "127.0.0.1");
await once(server, "listening");
let base = "http://127.0.0.1:" + server.address().port;
const records = [],
  failures = [];
const started = performance.now(),
  cpuStart = process.cpuUsage();
let peakRss = process.memoryUsage().rss;
const memoryTimer = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 200);
async function client() {
  const response = await fetch(base + "/api/session", {
    signal: AbortSignal.timeout(20000),
  });
  const cookie = response.headers.getSetCookie()[0].split(";")[0],
    { csrf } = await response.json();
  return { cookie, csrf };
}
async function request(client, url, body, key) {
  const begin = performance.now();
  const response = await fetch(base + url, {
    signal: AbortSignal.timeout(20000),
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: client.cookie,
      "X-CSRF-Token": client.csrf,
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  records.push({ url, status: response.status, ms: performance.now() - begin });
  return { status: response.status, data };
}
async function pool(items, limit, fn) {
  let index = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (index < items.length) {
        const i = index++;
        await fn(items[i], i);
      }
    }),
  );
}
const report = {
  environment:
    repo.kind === "postgres-isolated-load"
      ? "Dedicated PostgreSQL with 20 independent connections, loopback HTTP and mocked Gemini. Not deployed HTTP or Gemini capacity evidence."
      : "Disposable PGlite PostgreSQL, loopback HTTP, mocked Gemini. PGlite serializes SQL; this is not Supabase/Render multi-connection capacity evidence.",
  thresholds: {
    voteP95Ms: 2000,
    leaderboardP95Ms: 2000,
    lostConfirmedVotes: 0,
    duplicateVoteRecords: 0,
    unexpectedErrors: 0,
  },
  scenarios: {},
};
try {
  console.log("Opening submissions");
  await repo.call("transition", { state: "SUBMISSIONS_OPEN", actor: "test" });
  const creators = await Promise.all(
    Array.from({ length: 100 }, () => client()),
  );
  const jobs = [];
  console.log("Submitting 100 generation jobs");
  await pool(creators, 100, async (c, i) => {
    const result = await request(
      c,
      "/api/generate-story",
      { participantName: "Writer " + i, prompt: "A robot cooks noodles" },
      "generate-" + i,
    );
    assert.equal(result.status, 202);
    jobs.push(result.data.id);
  });
  report.scenarios.generation100 = {
    accepted: jobs.length,
    quotaFailuresInjected: 4,
  };
  console.log("Generation accepted", jobs.length);
  let maximumObservedQueue = 0;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const counts = await repo.db.query(
      "select count(*) filter(where status='ready') ready,count(*) filter(where status='failed') failed from po_jobs",
    );
    maximumObservedQueue = Math.max(
      maximumObservedQueue,
      100 - Number(counts.rows[0].ready) - Number(counts.rows[0].failed),
    );
    if (Number(counts.rows[0].ready) === 100) break;
    if (Number(counts.rows[0].failed))
      throw new Error("Generation queue failed");
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(
    Number(
      (
        await repo.db.query(
          "select count(*) n from po_jobs where status='ready'",
        )
      ).rows[0].n,
    ),
    100,
  );
  console.log("Generation and judging completed");
  report.scenarios.generation100.completed = 100;
  report.scenarios.generation100.maximumObservedQueue = maximumObservedQueue;
  const generationTimes = (
    await repo.db.query(
      "select extract(epoch from (updated_at-created_at))*1000 ms from po_jobs where status='ready' order by ms",
    )
  ).rows.map((r) => Number(r.ms));
  report.scenarios.generation100.endToEndMockedMs = {
    p50: generationTimes[Math.floor(generationTimes.length * 0.5)],
    p95: generationTimes[Math.floor(generationTimes.length * 0.95)],
    max: generationTimes.at(-1),
  };
  await repo.call("transition", { state: "SUBMISSIONS_CLOSED", actor: "test" });
  await repo.call("transition", { state: "VOTING", actor: "test" });
  const voters = [];
  await pool(Array.from({ length: 500 }), 30, async () =>
    voters.push(await client()),
  );
  const confirmed = [];
  const voteBegin = performance.now();
  await pool(voters, 60, async (c, i) => {
    const result = await request(
      c,
      "/api/votes",
      { submissionId: jobs[i % jobs.length], rating: (i % 5) + 1 },
      "vote-" + i,
    );
    assert.equal(result.status, 201);
    confirmed.push(result.data.id);
  });
  report.scenarios.voting500 = {
    acknowledged: confirmed.length,
    durationMs: performance.now() - voteBegin,
  };
  await pool(voters.slice(0, 100), 30, async (c, i) => {
    const result = await request(
      c,
      "/api/votes",
      { submissionId: jobs[i % jobs.length], rating: (i % 5) + 1 },
      "vote-" + i,
    );
    assert.equal(result.status, 201);
    assert.ok(confirmed.includes(result.data.id));
  });
  const reads = Array.from(
    { length: 200 },
    (_, i) => voters[i % voters.length],
  );
  await pool(reads, 40, async (c) =>
    assert.equal((await request(c, "/api/leaderboard")).status, 200),
  );
  const counts = await repo.db.query(
    "select count(*) n,count(distinct id) unique_ids from po_votes",
  );
  assert.equal(Number(counts.rows[0].n), 500);
  assert.equal(Number(counts.rows[0].unique_ids), 500);
  report.scenarios.duplicate100 = { additionalRecords: 0 };
  report.scenarios.leaderboard200 = { completed: 200 };
  // Database outage returns a failure, never an acknowledgement. Restore and retry safely.
  dbOutage = true;
  const interrupted = await request(
    voters[0],
    "/api/votes",
    { submissionId: jobs[1], rating: 4 },
    "outage-vote",
  );
  assert.equal(interrupted.status, 503);
  dbOutage = false;
  const recovered = await request(
    voters[0],
    "/api/votes",
    { submissionId: jobs[1], rating: 4 },
    "outage-vote",
  );
  assert.equal(recovered.status, 201);
  confirmed.push(recovered.data.id);
  report.scenarios.databaseOutage = { rejected: 1, recovered: 1 };
  // Restart app and worker, preserving database and session signing secret.
  service.stop();
  await new Promise((r) => server.close(r));
  service = createApp({ env, repository: resilient, ai });
  server = service.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = "http://127.0.0.1:" + server.address().port;
  assert.equal((await request(voters[0], "/api/leaderboard")).status, 200);
  report.scenarios.restart = {
    confirmedVotesRetained: Number(
      (await repo.db.query("select count(*) n from po_votes")).rows[0].n,
    ),
  };
  // Closing while requests arrive: successful commits precede close; all subsequent attempts reject.
  const racers = await Promise.all(Array.from({ length: 50 }, () => client()));
  let closeAccepted = 0;
  await Promise.all([
    pool(racers, 20, async (c, i) => {
      const result = await request(
        c,
        "/api/votes",
        { submissionId: jobs[0], rating: 5 },
        "closing-" + i,
      );
      if (result.status === 201) {
        closeAccepted++;
        confirmed.push(result.data.id);
      } else assert.equal(result.status, 409);
    }),
    repo.call("transition", { state: "SUBMISSIONS_CLOSED", actor: "test" }),
  ]);
  const late = await request(
    await client(),
    "/api/votes",
    { submissionId: jobs[0], rating: 5 },
    "late",
  );
  assert.equal(late.status, 409);
  report.scenarios.closeDuringVoting = {
    acceptedBeforeClose: closeAccepted,
    rejected: 51 - closeAccepted,
  };
  const stored = await repo.db.query("select id from po_votes");
  const ids = new Set(stored.rows.map((r) => r.id));
  report.successfulVoteCount = ids.size;
  report.lostConfirmedVotes = confirmed.filter((id) => !ids.has(id)).length;
  report.duplicateVoteRecords = stored.rows.length - ids.size;
  const summary = (rows) => {
    const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
    return {
      requests: rows.length,
      averageMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)],
    };
  };
  report.voteLatency = summary(records.filter((r) => r.url === "/api/votes"));
  report.leaderboardLatency = summary(
    records.filter((r) => r.url === "/api/leaderboard"),
  );
  report.elapsedSeconds = (performance.now() - started) / 1000;
  report.requestsPerSecond = records.length / report.elapsedSeconds;
  report.expectedRejectionRate =
    records.filter((r) => r.status >= 400).length / records.length;
  report.unexpectedErrors = failures.length;
  report.peakRssMB = peakRss / 1024 / 1024;
  report.cpuMs =
    Object.values(process.cpuUsage(cpuStart)).reduce((a, b) => a + b, 0) / 1000;
  report.queueRemaining = Number(
    (
      await repo.db.query(
        "select count(*) n from po_jobs where status not in ('ready','failed')",
      )
    ).rows[0].n,
  );
  report.passed =
    report.voteLatency.p95Ms < 2000 &&
    report.leaderboardLatency.p95Ms < 2000 &&
    report.lostConfirmedVotes === 0 &&
    report.duplicateVoteRecords === 0 &&
    report.queueRemaining === 0;
  if (!report.passed) process.exitCode = 1;
} catch (e) {
  report.passed = false;
  report.failure = e.message;
  report.failureCode = e.cause?.code;
  report.unfinishedJobs = (
    await repo.db.query(
      "select status,attempts,judge_attempts,available_at,lease_until,error from po_jobs where status <> 'ready'",
    )
  ).rows;
  process.exitCode = 1;
} finally {
  clearInterval(memoryTimer);
  service.stop();
  await new Promise((r) => server.close(r));
  await repo.db.close();
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync("reports/load-test.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
