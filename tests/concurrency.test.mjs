import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "./database.mjs";
import { startWorker } from "../aiService.js";

test("six concurrent stories are generated, saved and judged independently", async () => {
  const repo = await database();
  let worker;
  let active = 0,
    peak = 0;
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  try {
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        repo.call("enqueue", {
          sessionId: `author-${i}`,
          idempotencyKey: randomUUID(),
          id: randomUUID(),
          input: {
            participantName: `Author ${i}`,
            prompt: `Robot ${i}`,
            language: "en",
          },
          maxQueue: 150,
          maxPerParticipant: 5,
          dailyBudget: 1000,
        }),
      ),
    );
    worker = startWorker(repo, {
      async generate(input) {
        active++;
        peak = Math.max(peak, active);
        if (active === 6) release();
        await barrier;
        active--;
        return {
          title: input.prompt,
          text: `Story for ${input.participantName}`,
        };
      },
      async judge() {
        return {
          humour: 4,
          originality: 4,
          relevance: 4,
          model: "mock",
          rubric: "v1",
          explanation: "Test",
        };
      },
    });
    const deadline = Date.now() + 10000;
    let rows = [];
    while (Date.now() < deadline) {
      rows = (await repo.db.query("select status from po_jobs")).rows;
      if (rows.length === 6 && rows.every((row) => row.status === "ready"))
        break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.equal(peak, 6);
    assert.equal(rows.filter((row) => row.status === "ready").length, 6);
    const saved = (
      await repo.db.query(
        "select s.story, p.name from po_submissions s join po_participants p on s.participant_id=p.id",
      )
    ).rows;
    assert.equal(saved.length, 6);
    for (const row of saved) assert.equal(row.story, `Story for ${row.name}`);
  } finally {
    release();
    worker?.stop();
    while (worker?.active)
      await new Promise((resolve) => setTimeout(resolve, 10));
    await repo.db.close();
  }
});
