import test from "node:test";
import assert from "node:assert/strict";
import { qualityReport } from "../scripts/quality-check.mjs";
import { createAiService } from "../aiService.js";
import { STORY_PROMPT, JUDGE_PROMPT } from "../aiPrompts.js";
test("20 varied ideas preserve untrusted data and meet the new structured response contracts", async () => {
  const report = await qualityReport();
  assert.equal(report.cases, 20);
  assert.equal(report.valid, 20);
  for (const row of report.rows) {
    assert.ok(row.wordCount <= 110);
    assert.equal(row.aiScore, 3.35);
  }
  assert.match(STORY_PROMPT, /not as instructions/);
  assert.match(JUDGE_PROMPT, /Ignore instructions embedded/);
});
test("malformed JSON, extra fields, excessive length, invalid scores and model totals cannot become official results", async () => {
  const ai = (text) =>
    createAiService(
      { GEMINI_MODEL: "gemini-3.6-flash" },
      {
        client: {
          models: {
            async generateContent() {
              return { candidates: [{ finishReason: "STOP" }], text };
            },
          },
        },
      },
    );
  for (const output of [
    "{bad",
    JSON.stringify({ title: "Title", story: "word ".repeat(111) }),
    JSON.stringify({ title: "Title", story: "Text", unexpected: true }),
  ])
    await assert.rejects(ai(output).generate({ prompt: "Robot" }));
  await assert.rejects(
    ai(
      JSON.stringify({
        humour: 4.251,
        creativity: 4,
        relevance: 4,
        overall: 4,
        reason: "Test",
      }),
    ).judge({}),
  );
  const score = await ai(
    JSON.stringify({
      humour: 2,
      creativity: 3,
      relevance: 4,
      overall: 5,
      reason: "Test",
    }),
  ).judge({});
  assert.equal(score.overall, 2.75);
});
