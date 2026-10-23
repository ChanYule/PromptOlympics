import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "./database.mjs";
import { createAiService, startWorker } from "../aiService.js";

test("real Gemini response path persists judging model and score in PostgreSQL", async () => {
  const repo = await database();
  let worker;
  const requests = [];
  const client = {
    models: {
      async generateContent(request) {
        requests.push(request);
        const judging = JSON.parse(request.contents).story !== undefined;
        return {
          candidates: [{ finishReason: "STOP" }],
          text: JSON.stringify(
            judging
              ? {
                  humour: 4.5,
                  creativity: 4,
                  relevance: 4.5,
                  overall: 5,
                  reason: "A strong ending.",
                }
              : {
                  title: "Robot Soup",
                  story: "The robot made soup with a torch.",
                },
          ),
        };
      },
    },
  };
  try {
    const queued = await repo.call("enqueue", {
      sessionId: "author",
      idempotencyKey: randomUUID(),
      id: randomUUID(),
      input: { participantName: "Alice", prompt: "Robot" },
      maxQueue: 150,
      maxPerParticipant: 5,
      dailyBudget: 1000,
    });
    const ai = createAiService(
      { GEMINI_MODEL: "gemini-3.6-flash" },
      { client },
    );
    const direct = await ai.judge({
      prompt: "Robot",
      title: "Soup",
      resultText: "Funny soup.",
    });
    assert.equal(direct.model, "gemini-3.6-flash");
    worker = startWorker(repo, ai);
    const deadline = Date.now() + 8000;
    let job;
    do {
      job = await repo.call("job", { sessionId: "author", jobId: queued.id });
      if (["ready", "failed"].includes(job.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    } while (Date.now() < deadline);
    assert.equal(job.status, "ready", job.error);
    const score = (await repo.db.query("select * from po_judgements")).rows[0];
    assert.equal(score.model, "gemini-3.6-flash");
    assert.equal(Number(score.overall), 4.375);
    assert.equal(requests.length, 3);
  } finally {
    worker?.stop();
    while (worker?.active)
      await new Promise((resolve) => setTimeout(resolve, 10));
    await repo.db.close();
  }
});
