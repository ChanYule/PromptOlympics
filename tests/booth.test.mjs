import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { database } from "./database.mjs";

async function saved(repo, session = "author") {
  const id = randomUUID();
  await repo.call("enqueue", {
    sessionId: session,
    id,
    idempotencyKey: id,
    input: { participantName: session, prompt: "Cat principal" },
    maxQueue: 150,
    maxPerParticipant: 5,
    dailyBudget: 1000,
  });
  const j = await repo.call("claim", {
    concurrency: 6,
    leaseSeconds: 120,
    token: randomUUID(),
  });
  await repo.call("generated", {
    jobId: j.id,
    token: j.leaseToken,
    generated: {
      title: "Principal Paws",
      text: "A cat rang the lunch bell for tuna.",
    },
  });
  await repo.call("save", { jobId: j.id, token: j.leaseToken });
  return id;
}
test("booth voting before judging, independent mode, closure and safe participant boundaries", async () => {
  const repo = await database();
  try {
    await repo.call("settings", {
      minVotes: 1,
      strictCodes: false,
      boothMode: true,
      allowSelfVotes: true,
      actor: "admin",
    });
    await repo.call("transition", {
      state: "SUBMISSIONS_OPEN",
      actor: "admin",
    });
    const id = await saved(repo);
    await assert.rejects(
      repo.call("session-end", {
        sessionId: "author",
        jobId: id,
        voteKey: "uncertain",
        resetHash: "secret",
        nextId: "next",
      }),
      /Confirm the pending vote/,
    );
    const payload = {
      sessionId: "author",
      authorId: "author",
      submissionId: id,
      id: randomUUID(),
      idempotencyKey: "v",
      rating: 5,
    };
    const votes = await Promise.all([
      repo.call("vote", payload),
      repo.call("vote", payload),
    ]);
    assert.equal(votes[0].id, votes[1].id);
    assert.equal((await repo.call("leaderboard")).entries[0].finalScore, null);
    const j = await repo.call("claim", {
      concurrency: 6,
      leaseSeconds: 120,
      token: "judge",
    });
    await repo.call("judged", {
      jobId: j.id,
      token: j.leaseToken,
      score: {
        humour: 4.4,
        originality: 4.4,
        relevance: 4.4,
        model: "test",
        rubric: "v2",
        explanation: "Test",
      },
    });
    assert.equal(
      (
        await repo.call("participant-score", {
          sessionId: "author",
          submissionId: id,
        })
      ).entry.finalScore,
      4.7,
    );
    const end = {
      sessionId: "author",
      jobId: id,
      voteKey: "v",
      resetHash: "secret",
      nextId: "next",
    };
    assert.equal((await repo.call("session-end", end)).nextId, "next");
    assert.equal(
      (await repo.call("session-end", { ...end, nextId: "wrong" })).nextId,
      "next",
    );
    await assert.rejects(
      repo.call("session-end", { ...end, resetHash: "wrong" }),
      /session has ended/,
    );
    await assert.rejects(
      repo.call("job", { sessionId: "author", jobId: id }),
      /session has ended/,
    );
    await assert.rejects(
      repo.call("vote", { ...payload, idempotencyKey: "another" }),
      /session has ended/,
    );
    await assert.rejects(
      repo.call("job", { sessionId: "next", jobId: id }),
      /not found/,
    );
    assert.equal((await repo.call("leaderboard")).entries[0].voteCount, 1);
    await repo.call("settings", {
      minVotes: 1,
      strictCodes: false,
      boothMode: true,
      allowSelfVotes: false,
      actor: "admin",
    });
    const other = await saved(repo, "second");
    await assert.rejects(
      repo.call("vote", {
        ...payload,
        sessionId: "second",
        authorId: "second",
        submissionId: other,
        idempotencyKey: "independent",
      }),
      /Independent voting/,
    );
    await repo.call("transition", {
      state: "SUBMISSIONS_CLOSED",
      actor: "admin",
    });
    const continuedVote = await repo.call("vote", {
      ...payload,
      sessionId: "third",
      authorId: "third",
      submissionId: other,
      id: randomUUID(),
      idempotencyKey: "after-submissions-close",
    });
    assert.equal(continuedVote.recorded, true);
  } finally {
    await repo.db.close();
  }
});
test("reset cannot race accepted generation; ended identities cannot enqueue", async () => {
  const repo = await database();
  try {
    await repo.call("transition", {
      state: "SUBMISSIONS_OPEN",
      actor: "admin",
    });
    const input = {
      sessionId: "a",
      id: randomUUID(),
      idempotencyKey: "new",
      input: { participantName: "A", prompt: "Robot" },
      maxQueue: 150,
      maxPerParticipant: 5,
      dailyBudget: 1000,
    };
    await repo.call("enqueue", input);
    await assert.rejects(
      repo.call("session-end", {
        sessionId: "a",
        nextId: "b",
        resetHash: "secret",
      }),
      /finish saving/,
    );
    await repo.call("session-end", {
      sessionId: "empty",
      nextId: "fresh",
      resetHash: "secret",
    });
    await assert.rejects(
      repo.call("enqueue", { ...input, sessionId: "empty" }),
      /session has ended/,
    );
    // Migration is repeatable and preserves records and retired-session protections.
    await repo.db.exec(
      fs.readFileSync(
        new URL(
          "../supabase/migrations/004_booth_sessions.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.equal(
      Number((await repo.db.query("select count(*) n from po_jobs")).rows[0].n),
      1,
    );
    await assert.rejects(
      repo.call("enqueue", { ...input, sessionId: "empty" }),
      /session has ended/,
    );
  } finally {
    await repo.db.close();
  }
});

test("judging timeout preserves the saved story and vote and participant retry repairs only its own job", async () => {
  const repo = await database();
  try {
    await repo.call("settings", {
      minVotes: 1,
      strictCodes: false,
      boothMode: true,
      allowSelfVotes: true,
      actor: "admin",
    });
    await repo.call("transition", {
      state: "SUBMISSIONS_OPEN",
      actor: "admin",
    });
    const id = await saved(repo, "a");
    await repo.call("vote", {
      sessionId: "a",
      submissionId: id,
      id: randomUUID(),
      idempotencyKey: "vote",
      rating: 5,
    });
    for (let i = 0; i < 3; i++) {
      const claim = await repo.call("claim", {
        concurrency: 6,
        leaseSeconds: 120,
        token: randomUUID(),
      });
      await repo.call("fail", {
        jobId: id,
        token: claim.leaseToken,
        error: "Gemini took too long to respond. Please try again shortly.",
        retryable: true,
        delay: 0,
      });
    }
    assert.equal(
      (await repo.call("job", { sessionId: "a", jobId: id })).status,
      "failed",
    );
    let entry = (await repo.call("leaderboard")).entries[0];
    assert.equal(entry.aiScore, null);
    assert.equal(entry.voteCount, 1);
    assert.equal(entry.finalScore, null);
    await assert.rejects(
      repo.call("participant-retry", { sessionId: "other", jobId: id }),
      /not found/,
    );
    await repo.call("participant-retry", { sessionId: "a", jobId: id });
    const claim = await repo.call("claim", {
      concurrency: 6,
      leaseSeconds: 120,
      token: "retry",
    });
    await repo.call("judged", {
      jobId: id,
      token: claim.leaseToken,
      score: {
        humour: 4,
        originality: 4,
        relevance: 4,
        model: "test",
        rubric: "v2",
        explanation: "Test",
      },
    });
    entry = (await repo.call("leaderboard")).entries[0];
    assert.equal(entry.aiScore, 4);
    assert.equal(entry.voteCount, 1);
    assert.equal(entry.finalScore, 4.5);
  } finally {
    await repo.db.close();
  }
});

test("voting is always open during creation and after submissions close, without booth settings or a voting transition", async () => {
  const repo = await database();
  try {
    await repo.call("settings", {
      minVotes: 1,
      strictCodes: false,
      boothMode: false,
      allowSelfVotes: true,
      actor: "admin",
    });
    await repo.call("transition", {
      state: "SUBMISSIONS_OPEN",
      actor: "admin",
    });
    const id = await saved(repo, "author");
    await repo.call("vote", {
      sessionId: "reader-a",
      id: randomUUID(),
      submissionId: id,
      rating: 5,
      idempotencyKey: "during-creation",
    });
    await repo.call("transition", {
      state: "SUBMISSIONS_CLOSED",
      actor: "admin",
    });
    await repo.call("vote", {
      sessionId: "reader-b",
      id: randomUUID(),
      submissionId: id,
      rating: 4,
      idempotencyKey: "after-creation",
    });
    const claim = await repo.call("claim", {
      concurrency: 6,
      leaseSeconds: 120,
      token: "judge",
    });
    await repo.call("judged", {
      jobId: id,
      token: claim.leaseToken,
      score: {
        humour: 4,
        originality: 4,
        relevance: 4,
        model: "test",
        rubric: "v2",
        explanation: "Test",
      },
    });
    await repo.call("transition", { state: "RESULTS", actor: "admin" });
    assert.equal((await repo.call("leaderboard")).entries[0].voteCount, 2);
    await assert.rejects(
      repo.call("vote", {
        sessionId: "reader-c",
        id: randomUUID(),
        submissionId: id,
        rating: 3,
        idempotencyKey: "after-results",
      }),
      /Voting is closed/,
    );
  } finally {
    await repo.db.close();
  }
});
