import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGeminiError,
  usesDeprecatedSampling,
} from "../geminiErrors.js";
import { errorZh } from "../src/locales/zh.ts";
import { startWorker } from "../aiService.js";
test("Gemini failures identify the actionable cause, retry only transient failures and never expose provider details", () => {
  for (const [status, code, retryable] of [
    [400, "INVALID_CONFIGURATION", false],
    [401, "AUTHENTICATION", false],
    [402, "CREDITS_EXHAUSTED", false],
    [403, "AUTHENTICATION", false],
    [404, "MODEL_NOT_FOUND", false],
    [429, "RATE_LIMITED", true],
    [500, "UPSTREAM_ERROR", true],
    [503, "UPSTREAM_UNAVAILABLE", true],
    [504, "TIMEOUT", true],
  ]) {
    const result = classifyGeminiError({
      status,
      message: "secret-key-and-private-story",
      name: "Error",
    });
    assert.equal(result.code, code);
    assert.equal(result.retryable, retryable);
    assert.ok(errorZh[result.message]);
    assert.equal(
      JSON.stringify(result).includes("secret-key-and-private-story"),
      false,
    );
  }
  assert.equal(classifyGeminiError({ name: "TimeoutError" }).code, "TIMEOUT");
  assert.equal(classifyGeminiError({ name: "TypeError" }).code, "NETWORK");
  assert.equal(
    classifyGeminiError({ status: "503" }).code,
    "UPSTREAM_UNAVAILABLE",
  );
  assert.equal(
    classifyGeminiError({
      status: 400,
      message: "API key not valid. Please pass a valid API key.",
    }).code,
    "AUTHENTICATION",
  );
  assert.equal(
    classifyGeminiError({ code: "MISSING_API_KEY" }).retryable,
    false,
  );
  assert.equal(
    classifyGeminiError(new SyntaxError("private response")).code,
    "INVALID_RESPONSE",
  );
});
test("deprecated sampling parameters are omitted for Gemini 3.6 and subsequent model families", () => {
  for (const model of [
    "gemini-3.6-flash",
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-4-argon",
  ])
    assert.equal(usesDeprecatedSampling(model), true);
  for (const model of [
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.5-flash",
  ])
    assert.equal(usesDeprecatedSampling(model), false);
});
test("worker records a distinct safe failure and sanitized diagnostic for upstream 503", async () => {
  const diagnostics = [],
    writes = [];
  let claimed = false;
  const repository = {
    async call(action, payload) {
      if (action === "leaderboard") return { entries: [] };
      if (action === "claim") {
        if (claimed) return null;
        claimed = true;
        return {
          id: "test-job",
          leaseToken: "token",
          attempts: 1,
          judgeAttempts: 0,
          input: { prompt: "private prompt" },
        };
      }
      writes.push({ action, payload });
      return {};
    },
  };
  const ai = {
    model: "gemini-3.6-flash",
    async generate() {
      throw Object.assign(new Error("secret key and private provider body"), {
        status: 503,
      });
    },
  };
  const worker = startWorker(repository, ai, {
    onDiagnostic: (details) => diagnostics.push(details),
  });
  try {
    const deadline = Date.now() + 2000;
    while (!writes.length && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(writes[0].action, "fail");
    assert.equal(writes[0].payload.retryable, true);
    assert.equal(
      writes[0].payload.error,
      "Gemini is temporarily unavailable. Please try again shortly.",
    );
    assert.equal(diagnostics[0].status, 503);
    assert.equal(diagnostics[0].code, "UPSTREAM_UNAVAILABLE");
    assert.equal(JSON.stringify(diagnostics).includes("secret key"), false);
    assert.equal(JSON.stringify(diagnostics).includes("private prompt"), false);
  } finally {
    worker.stop();
  }
});

test("worker logs allowlisted response diagnostics without the provider body", async () => {
  const diagnostics = [];
  let claimed = false,
    finish;
  const failed = new Promise((resolve) => {
    finish = resolve;
  });
  const repository = {
    async call(action, payload) {
      if (action === "leaderboard") return { entries: [] };
      if (action === "claim") {
        if (claimed) return null;
        claimed = true;
        return {
          id: "response-job",
          leaseToken: "token",
          input: { prompt: "private prompt" },
          attempts: 1,
          judgeAttempts: 0,
        };
      }
      if (action === "fail") finish(payload);
      return {};
    },
  };
  const worker = startWorker(
    repository,
    {
      model: "gemini-3.6-flash",
      async generate() {
        throw Object.assign(
          new Error("The AI response was blocked or incomplete."),
          {
            aiFinishReason: "MAX_TOKENS",
            privateBody: "private provider output",
          },
        );
      },
    },
    { onDiagnostic: (details) => diagnostics.push(details) },
  );
  try {
    const failure = await failed;
    assert.equal(failure.retryable, true);
    assert.equal(diagnostics[0].reason, "OUTPUT_TOKEN_LIMIT");
    assert.equal(diagnostics[0].finishReason, "MAX_TOKENS");
    assert.equal(diagnostics[0].attempt, 1);
    assert.equal(JSON.stringify(diagnostics).includes("private"), false);
  } finally {
    worker.stop();
  }
});
