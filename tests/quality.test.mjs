import test from "node:test";
import assert from "node:assert/strict";
import { qualityReport } from "../scripts/quality-check.mjs";
import { createAiService } from "../aiService.js";
import { STORY_PROMPT, JUDGE_PROMPT } from "../aiPrompts.js";
import { classifyGeminiError } from "../geminiErrors.js";

test("bounded output headroom and safe diagnostics distinguish truncation, empty JSON and invalid story length", async () => {
  const cases = [
    {
      finishReason: "MAX_TOKENS",
      text: '{"story":"unfinished',
      reason: "OUTPUT_TOKEN_LIMIT",
    },
    {
      finishReason: "SAFETY",
      text: "private response",
      reason: "INCOMPLETE_RESPONSE",
    },
    {
      finishReason: "secret-key-and-story",
      text: "private response",
      reason: "INCOMPLETE_RESPONSE",
    },
    { finishReason: "STOP", text: "", reason: "EMPTY_RESPONSE" },
    {
      finishReason: "STOP",
      text: "{private invalid JSON",
      reason: "MALFORMED_JSON",
    },
    {
      finishReason: "STOP",
      text: JSON.stringify({ title: "Title", story: "word ".repeat(111) }),
      reason: "STORY_LENGTH_OR_LANGUAGE",
    },
    {
      finishReason: "STOP",
      text: JSON.stringify({ story: "No title" }),
      reason: "STORY_SCHEMA",
    },
  ];
  for (const sample of cases) {
    const ai = createAiService(
      { GEMINI_MODEL: "gemini-3.6-flash" },
      {
        client: {
          models: {
            async generateContent(request) {
              assert.equal(request.config.maxOutputTokens, 2048);
              return {
                candidates: [{ finishReason: sample.finishReason }],
                text: sample.text,
              };
            },
          },
        },
      },
    );
    await assert.rejects(ai.generate({ prompt: "private prompt" }), (error) => {
      const failure = classifyGeminiError(error);
      assert.equal(failure.code, "INVALID_RESPONSE");
      assert.equal(failure.reason, sample.reason);
      assert.equal(
        failure.finishReason,
        ["MAX_TOKENS", "SAFETY"].includes(sample.finishReason)
          ? sample.finishReason
          : null,
      );
      assert.equal(JSON.stringify(failure).includes("private"), false);
      assert.equal(
        JSON.stringify(failure).includes("secret-key-and-story"),
        false,
      );
      return true;
    });
  }
  const judge = createAiService(
    { GEMINI_MODEL: "gemini-3.6-flash" },
    {
      client: {
        models: {
          async generateContent(request) {
            assert.equal(request.config.maxOutputTokens, 1024);
            return {
              candidates: [{ finishReason: "STOP" }],
              text: JSON.stringify({
                humour: 3,
                creativity: 4,
                relevance: 4,
                overall: 5,
                reason: "Clear setup, ordinary payoff.",
              }),
            };
          },
        },
      },
    },
  );
  assert.equal((await judge.judge({})).overall, 3.5);
});
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
