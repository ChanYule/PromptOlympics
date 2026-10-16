import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../server.js";
import { createCompetitionRepository } from "../competitionRepository.js";
import { validateStory, validateJudgement } from "../aiService.js";
const env = {
  NODE_ENV: "test",
  STORAGE_MODE: "local",
  AI_MODE: "mock",
  SESSION_SECRET: "test-only-secret-with-at-least-32-characters",
  ADMIN_PASSWORD: "test-only-password-long-enough",
};
export async function client(base) {
  let cookie = "",
    csrf = "";
  async function request(url, body, key, override = {}) {
    const response = await fetch(base + url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        ...(key ? { "Idempotency-Key": key } : {}),
        ...override,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const set of response.headers.getSetCookie()) {
      const name = set.split("=")[0];
      cookie = cookie
        .split("; ")
        .filter((c) => !c.startsWith(name + "="))
        .concat(set.split(";")[0])
        .filter(Boolean)
        .join("; ");
    }
    const data = await response.json().catch(() => null);
    return { status: response.status, data, headers: response.headers };
  }
  csrf = (await request("/api/session")).data.csrf;
  return {
    request,
    async login() {
      const result = await request("/api/admin/login", {
        password: env.ADMIN_PASSWORD,
      });
      assert.equal(result.status, 200);
      csrf = result.data.csrf;
    },
    get cookie() {
      return cookie;
    },
  };
}
test("HTTP sessions, CSRF, official generation, polling, voting and admin logout", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "po-api-"));
  const e = {
    ...env,
    LOCAL_DATA_PATH: path.join(directory, "competition.json"),
  };
  const service = createApp({ env: e });
  const server = service.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const admin = await client(base),
      author = await client(base),
      reader = await client(base);
    assert.equal((await author.request("/api/admin/competition")).status, 401);
    assert.equal(
      (await author.request("/api/admin/login", { password: "wrong" })).status,
      401,
    );
    await admin.login();
    assert.equal(
      (
        await admin.request("/api/admin/transition", {
          state: "SUBMISSIONS_OPEN",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await admin.request("/api/admin/transition", {
          state: "SUBMISSIONS_OPEN",
          confirm: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await author.request(
          "/api/generate-story",
          { participantName: "Alice", prompt: "Robot" },
          "operation",
          { "X-CSRF-Token": "invalid" },
        )
      ).status,
      403,
    );
    const generated = await author.request(
      "/api/generate-story",
      { participantName: "Alice", prompt: "Robot" },
      "generation-one",
    );
    assert.equal(generated.status, 202);
    assert.equal(
      (
        await author.request(
          "/api/generate-story",
          { participantName: "Alice", prompt: "Robot" },
          "generation-one",
        )
      ).data.id,
      generated.data.id,
    );
    assert.equal(
      (
        await author.request(
          "/api/generate-story",
          { participantName: "Alice", prompt: "Other" },
          "generation-one",
        )
      ).status,
      409,
    );
    let job;
    for (let i = 0; i < 40; i++) {
      job = (await author.request("/api/jobs/" + generated.data.id)).data;
      if (job.status === "ready") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(job.status, "ready");
    assert.ok(job.submission.aiScore);
    assert.equal(job.submission.aiScore.overall, 4.375);
    const chineseInput = {
      participantName: "中文参赛者",
      prompt: "一个机器人开面摊。",
      language: "zh",
    };
    const chinese = await author.request(
      "/api/generate-story",
      chineseInput,
      "chinese-generation",
    );
    assert.equal(chinese.status, 202);
    assert.equal(
      (
        await author.request(
          "/api/generate-story",
          chineseInput,
          "chinese-generation",
        )
      ).data.id,
      chinese.data.id,
    );
    let chineseJob;
    for (let i = 0; i < 40; i++) {
      chineseJob = (await author.request("/api/jobs/" + chinese.data.id)).data;
      if (chineseJob.status === "ready") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(chineseJob.status, "ready");
    assert.match(chineseJob.submission.title, /\p{Script=Han}/u);
    assert.match(chineseJob.submission.resultText, /\p{Script=Han}/u);
    assert.equal(
      (
        await author.request(
          "/api/generate-story",
          { ...chineseInput, language: "fr" },
          "unsupported-language",
        )
      ).status,
      400,
    );
    assert.equal((await reader.request("/api/jobs/" + job.id)).status, 404);
    assert.equal(
      (await author.request("/api/submissions", { resultText: "Fabricated" }))
        .status,
      404,
    );
    await admin.request("/api/admin/transition", {
      state: "SUBMISSIONS_CLOSED",
      confirm: true,
    });
    await admin.request("/api/admin/transition", {
      state: "VOTING",
      confirm: true,
    });
    assert.equal(
      (
        await author.request(
          "/api/votes",
          { submissionId: job.id, rating: 5 },
          "own",
        )
      ).status,
      201,
    );
    const vote = await reader.request(
      "/api/votes",
      { submissionId: job.id, rating: 5, voterSession: "forged" },
      "vote-one",
    );
    assert.equal(vote.status, 201);
    assert.equal(
      (
        await reader.request(
          "/api/votes",
          { submissionId: job.id, rating: 5 },
          "vote-one",
        )
      ).data.id,
      vote.data.id,
    );
    assert.equal(
      (
        await reader.request(
          "/api/votes",
          { submissionId: job.id, rating: 1 },
          "vote-one",
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await reader.request(
          "/api/votes",
          { submissionId: job.id, rating: 4 },
          "vote-two",
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await reader.request(
          "/api/votes",
          { submissionId: "missing", rating: 5 },
          "vote-three",
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await reader.request("/api/next-voter", {}, undefined, {
          "X-CSRF-Token": "",
        })
      ).status,
      403,
    );
    assert.equal((await reader.request("/api/next-voter", {})).status, 200);
    const afterReset = await reader.request("/api/stories");
    assert.equal(
      afterReset.data.items.find((s) => s.id === job.id).voted,
      false,
    );
    assert.equal(
      (
        await reader.request(
          "/api/votes",
          { submissionId: job.id, rating: 5 },
          "next-voter-vote",
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await reader.request(
          "/api/votes",
          { submissionId: job.id, rating: 5 },
          "next-voter-vote",
        )
      ).status,
      201,
    );
    assert.equal((await author.request("/api/next-voter", {})).status, 200);
    assert.equal((await author.request("/api/jobs/" + job.id)).status, 200);
    const leaderboard = await reader.request("/api/leaderboard");
    assert.equal(leaderboard.data.entries[0].finalScore, 4.6875);
    assert.equal(
      (
        await reader.request("/api/leaderboard", undefined, undefined, {
          "If-None-Match": leaderboard.headers.get("etag"),
        })
      ).status,
      304,
    );
    const retiredCookie = author.cookie;
    assert.equal(
      (
        await author.request("/api/finish-participant", {
          jobId: job.id,
          resetKey: "reset-intent",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await author.request("/api/jobs/" + job.id, undefined, undefined, {
          cookie: retiredCookie,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await author.request(
          "/api/finish-participant",
          { jobId: job.id, resetKey: "wrong-intent" },
          undefined,
          { cookie: retiredCookie },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await author.request(
          "/api/finish-participant",
          { jobId: job.id, resetKey: "reset-intent" },
          undefined,
          { cookie: retiredCookie },
        )
      ).status,
      200,
    );
    const publicData = JSON.stringify(
      (await reader.request("/api/competition")).data,
    );
    assert.equal(publicData.includes("voterSession"), false);
    await admin.request("/api/admin/transition", {
      state: "RESULTS",
      confirm: true,
    });
    assert.equal(
      (
        await reader.request(
          "/api/votes",
          { submissionId: job.id, rating: 5 },
          "late",
        )
      ).status,
      409,
    );
    assert.equal((await admin.request("/api/admin/export")).status, 200);
    await admin.request("/api/admin/logout", {});
    assert.equal((await admin.request("/api/admin/competition")).status, 401);
    const restart = createCompetitionRepository({ env: e });
    assert.equal((await restart.call("leaderboard")).entries[0].voteCount, 3);
  } finally {
    service.stop();
    await new Promise((r) => server.close(r));
    fs.rmSync(directory, { recursive: true });
  }
});
test("AI validation rejects unsafe, malformed, excessive and invalid results", () => {
  for (const v of [
    {},
    { title: "Title", text: "", safeForPublic: true },
    {
      title: "One two three four five six seven",
      text: "Story.",
      safeForPublic: true,
    },
    { title: "Title", text: "word ".repeat(111), safeForPublic: true },
    { title: "Title", text: "Story.", safeForPublic: false },
  ])
    assert.throws(() => validateStory(v));
  for (const humour of [0, 6, NaN, Infinity, "5", null])
    assert.throws(() =>
      validateJudgement(
        { humour, originality: 4, relevance: 4, explanation: "Test" },
        "mock",
      ),
    );
  assert.equal(
    validateJudgement(
      { humour: 4.5, originality: 4, relevance: 4.5, explanation: "Good" },
      "mock",
    ).overall,
    4.375,
  );
});

test("readiness rejects a production database missing the booth migration", async () => {
  const service = createApp({
    env,
    worker: false,
    repository: {
      kind: "supabase",
      async call() {
        return { ok: true };
      },
    },
  });
  const server = service.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    assert.equal((await fetch(base + "/api/health")).status, 200);
    const ready = await fetch(base + "/api/ready");
    assert.equal(ready.status, 503);
    assert.match((await ready.json()).error, /migration 005/);
  } finally {
    service.stop();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("leaderboard polling excludes story bodies; selected stories are fetched separately, including historic rounds", async () => {
  const calls = [];
  const service = createApp({
    env,
    worker: false,
    repository: {
      kind: "supabase",
      async call(action, payload) {
        calls.push({ action, payload });
        return action === "session-info"
          ? { ended: false }
          : {
              round: { id: payload?.roundId || "current", state: "RESULTS" },
              final: true,
              entries: [
                {
                  submissionId: "official-id",
                  participantName: "Alice",
                  title: "A Story",
                  finalScore: 4.5,
                },
              ],
            };
      },
      async leaderboardStories(ids) {
        assert.deepEqual(ids, ["official-id"]);
        return new Map([["official-id", "The complete official story."]]);
      },
    },
  });
  const server = service.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const c = await client("http://127.0.0.1:" + server.address().port);
    for (const url of [
      "/api/leaderboard",
      "/api/leaderboard?roundId=historic",
    ]) {
      const response = await c.request(url);
      assert.equal(response.status, 200);
      assert.equal(response.data.entries[0].story, undefined);
      const body = await c.request(
        "/api/leaderboard/story/official-id" +
          (url.includes("?") ? "?roundId=historic" : ""),
      );
      assert.equal(body.data.story, "The complete official story.");
      const missing = await c.request("/api/leaderboard/story/not-public");
      assert.equal(missing.status, 404);
      assert.equal(JSON.stringify(response.data).includes("sessionId"), false);
    }
    assert.ok(
      calls.some(
        (c) => c.action === "leaderboard" && c.payload.roundId === "historic",
      ),
    );
  } finally {
    service.stop();
    await new Promise((resolve) => server.close(resolve));
  }
});
