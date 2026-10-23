import test from "node:test";
import assert from "node:assert/strict";
import { database } from "./database.mjs";
import { randomUUID } from "node:crypto";
import { createAiService, startWorker } from "../aiService.js";
async function story(repo, sessionId = "author") {
  const job = await repo.call("enqueue", {
    sessionId,
    idempotencyKey: randomUUID(),
    id: randomUUID(),
    input: { participantName: "Alice", prompt: "Robot", theme: "Story" },
    maxQueue: 150,
    maxPerParticipant: 5,
    dailyBudget: 1000,
  });
  const j = await repo.call("claim", {
    concurrency: 4,
    leaseSeconds: 120,
    token: "worker",
  });
  await repo.call("generated", {
    jobId: j.id,
    token: "worker",
    generated: { title: "Robot Soup", text: "A robot made soup." },
  });
  await repo.call("save", { jobId: j.id, token: "worker" });
  const judge = await repo.call("claim", {
    concurrency: 4,
    leaseSeconds: 120,
    token: "judge",
  });
  await repo.call("judged", {
    jobId: judge.id,
    token: "judge",
    score: {
      humour: 4.5,
      originality: 4,
      relevance: 4.5,
      model: "mock",
      rubric: "v1",
      explanation: "Good",
    },
  });
  return job.id;
}
test("PostgreSQL always-open generation, voting, retries and privacy", async () => {
  const repo = await database();
  try {
    assert.equal((await repo.call("competition")).state, "SUBMISSIONS_OPEN");
    const id = await story(repo);
    assert.equal((await repo.call("leaderboard")).entries[0].aiScore, 4.375);
    assert.equal((await repo.call("leaderboard")).entries[0].finalScore, null);
    const votes = Array.from({ length: 50 }, (_, i) => ({
      sessionId: i === 0 ? "author" : "reader-" + i,
      submissionId: id,
      rating: i % 2 ? 3 : 5,
      idempotencyKey: "op-" + i,
      id: randomUUID(),
    }));
    await Promise.all(votes.map((v) => repo.call("vote", v)));
    const retried = await repo.call("vote", votes[0]);
    assert.equal(retried.id, votes[0].id);
    await assert.rejects(
      repo.call("vote", { ...votes[0], rating: 2 }),
      /another vote/,
    );
    await assert.rejects(
      repo.call("vote", { ...votes[0], idempotencyKey: "new" }),
      /already/,
    );
    const leader = await repo.call("leaderboard");
    assert.equal(leader.entries[0].voteCount, 50);
    assert.equal(leader.entries[0].averageScore, 4);
    assert.equal(leader.entries[0].finalScore, 4.1875);
    assert.equal(leader.entries[0].eligible, true);
    const browse = await repo.call("stories", { sessionId: "author" });
    assert.equal(browse.items[0].voted, true);
    assert.equal(JSON.stringify(browse).includes("reader-1"), false);
    for (const state of [
      "WAITING",
      "SUBMISSIONS_CLOSED",
      "VOTING",
      "RESULTS",
    ]) {
      await assert.rejects(
        repo.call("transition", { state, actor: "admin" }),
        /always open/,
      );
    }
    await assert.rejects(
      repo.call("new-round", { id: "next", title: "Next", actor: "admin" }),
      /always open/,
    );
    await repo.call("vote", {
      ...votes[0],
      id: randomUUID(),
      sessionId: "late",
      idempotencyKey: "late",
    });
    assert.equal((await repo.call("leaderboard")).entries[0].voteCount, 51);
    assert.equal((await repo.call("leaderboard")).final, false);
    await story(repo, "another-author");
    assert.equal(
      (await repo.call("stories", { sessionId: "reader" })).items.length,
      2,
    );
  } finally {
    await repo.db.close();
  }
});
test("queue lease recovery and one-use voting codes", async () => {
  const repo = await database();
  try {
    const id = await story(repo);
    await repo.call("settings", {
      minVotes: 5,
      strictCodes: true,
      actor: "admin",
    });
    await repo.call("codes", { hashes: ["code"], actor: "admin" });
    await repo.call("redeem", { codeHash: "code", sessionId: "reader" });
    await assert.rejects(
      repo.call("redeem", { codeHash: "code", sessionId: "other" }),
      /already used/,
    );
    await assert.rejects(
      repo.call("vote", {
        sessionId: "other",
        submissionId: id,
        rating: 5,
        idempotencyKey: "x",
        id: "x",
      }),
      /code/,
    );
    await repo.call("vote", {
      sessionId: "reader",
      submissionId: id,
      rating: 5,
      idempotencyKey: "x",
      id: "x",
    });
  } finally {
    await repo.db.close();
  }
});
test("Gemini quota failure recovers through durable queue without losing job or creating duplicate story", async () => {
  const repo = await database();
  let worker;
  try {
    const id = randomUUID();
    await repo.call("enqueue", {
      sessionId: "author",
      idempotencyKey: "recover",
      id,
      input: { participantName: "Alice", prompt: "Robot" },
      maxQueue: 20,
      maxPerParticipant: 5,
      dailyBudget: 100,
    });
    const ai = createAiService({ AI_MODE: "mock" });
    let first = true;
    worker = startWorker(repo, {
      ...ai,
      async generate(input) {
        if (first) {
          first = false;
          throw Object.assign(new Error("Mock quota"), { status: 429 });
        }
        return ai.generate(input);
      },
    });
    const deadline = Date.now() + 15000;
    let job;
    while (Date.now() < deadline) {
      job = await repo.call("job", { jobId: id, sessionId: "author" });
      if (job.status === "ready") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.equal(job.status, "ready");
    assert.equal(job.attempts, 2);
    assert.equal(
      (await repo.db.query("select count(*) n from po_submissions")).rows[0].n,
      1,
    );
  } finally {
    worker?.stop();
    await repo.db.close();
  }
});
