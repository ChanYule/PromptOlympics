import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "./database.mjs";
test("expired leases preserve generated output; stale workers and public roles cannot write", async () => {
  const repo = await database();
  try {
    await repo.call("transition", {
      state: "SUBMISSIONS_OPEN",
      actor: "admin",
    });
    const id = randomUUID();
    await repo.call("enqueue", {
      sessionId: "author",
      idempotencyKey: "lease",
      id,
      input: { participantName: "Alice", prompt: "Robot" },
      maxQueue: 10,
      maxPerParticipant: 5,
      dailyBudget: 100,
    });
    await repo.call("claim", {
      token: "old",
      concurrency: 1,
      leaseSeconds: 120,
    });
    await repo.call("generated", {
      jobId: id,
      token: "old",
      generated: { title: "Saved output", text: "A complete story." },
    });
    await repo.db.query(
      "update po_jobs set lease_until=now()-interval '1 second' where id=$1",
      [id],
    );
    const next = await repo.call("claim", {
      token: "new",
      concurrency: 1,
      leaseSeconds: 120,
    });
    assert.equal(next.status, "saving");
    assert.equal(next.attempts, 1);
    await assert.rejects(
      repo.call("save", { jobId: id, token: "old" }),
      /expired/,
    );
    await repo.call("save", { jobId: id, token: "new" });
    assert.equal(
      (await repo.call("job", { jobId: id, sessionId: "author" })).submission
        .resultText,
      "A complete story.",
    );
    await assert.rejects(
      repo.call("transition", { state: "VOTING", actor: "admin" }),
      /not allowed/,
    );
    await repo.db.exec("set role anon");
    await assert.rejects(
      repo.db.query("select po_api('health','{}')"),
      /permission denied/,
    );
    await assert.rejects(
      repo.db.query("select * from po_votes"),
      /permission denied/,
    );
    await repo.db.exec("reset role");
  } finally {
    await repo.db.close();
  }
});
test("same-identity vote races enforce uniqueness and exact operation races reconcile", async () => {
  const repo = await database();
  try {
    await repo.call("transition", {
      state: "SUBMISSIONS_OPEN",
      actor: "admin",
    });
    await repo.db.query(
      "insert into po_participants(id,name,session_id,round_id) values('p','Alice','author','initial-round')",
    );
    await repo.db.query(
      "insert into po_submissions(id,round_id,participant_id,title,prompt,story) values('s','initial-round','p','Soup','Robot','A robot made soup.')",
    );
    await repo.call("transition", {
      state: "SUBMISSIONS_CLOSED",
      actor: "admin",
    });
    await repo.call("transition", { state: "VOTING", actor: "admin" });
    const input = {
      sessionId: "racing-reader",
      submissionId: "s",
      rating: 5,
      id: randomUUID(),
      idempotencyKey: "same",
    };
    const exact = await Promise.all([
      repo.call("vote", input),
      repo.call("vote", { ...input, id: randomUUID() }),
    ]);
    assert.equal(exact[0].id, exact[1].id);
    const different = await Promise.allSettled([
      repo.call("vote", {
        ...input,
        sessionId: "other",
        id: randomUUID(),
        idempotencyKey: "one",
      }),
      repo.call("vote", {
        ...input,
        sessionId: "other",
        id: randomUUID(),
        idempotencyKey: "two",
      }),
    ]);
    assert.equal(different.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (await repo.db.query("select count(*) n from po_votes")).rows[0].n,
      2,
    );
  } finally {
    await repo.db.close();
  }
});
