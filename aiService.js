import { GoogleGenAI } from "@google/genai";
import { DEFAULT_MODEL, normalizeModelName } from "./geminiConfig.js";
import { classifyGeminiError, usesDeprecatedSampling } from "./geminiErrors.js";
import {
  storyInstruction,
  JUDGE_PROMPT,
  STORY_SCHEMA,
  JUDGE_SCHEMA,
} from "./aiPrompts.js";
export const RUBRIC = "humour-50-creativity-25-relevance-25-v3";
export function validateStory(value, language = "en") {
  if (
    !value ||
    typeof value.title !== "string" ||
    typeof value.text !== "string"
  )
    throw new Error("Invalid story response.");
  const title = value.title.trim(),
    text = value.text.trim();
  if (
    !title ||
    title.length > 100 ||
    title.split(/\s+/).length > 6 ||
    !text ||
    text.length > 2000 ||
    text.split(/\s+/).length > 110 ||
    (language === "zh" &&
      (Array.from(title).length > 12 ||
        Array.from(text).length > 400 ||
        !/\p{Script=Han}/u.test(title) ||
        !/\p{Script=Han}/u.test(text)))
  )
    throw new Error("The story did not meet the length requirements.");
  if (value.safeForPublic !== true)
    throw new Error(
      "This idea could not produce a story suitable for a public event.",
    );
  return { title, text };
}
export function validateJudgement(value, model) {
  for (const key of ["humour", "originality", "relevance"])
    if (
      typeof value?.[key] !== "number" ||
      !Number.isFinite(value[key]) ||
      value[key] < 1 ||
      value[key] > 5
    )
      throw new Error("Invalid judging response.");
  if (
    typeof value.explanation !== "string" ||
    !value.explanation.trim() ||
    value.explanation.length > 1000
  )
    throw new Error("Incomplete judging response.");
  return {
    ...value,
    overall:
      value.humour * 0.5 + value.originality * 0.25 + value.relevance * 0.25,
    max: 5,
    model,
    rubric: RUBRIC,
  };
}
export function createAiService(
  env = process.env,
  { client: providedClient } = {},
) {
  const model = normalizeModelName(env.GEMINI_MODEL || DEFAULT_MODEL);
  const client =
    providedClient ||
    (env.GEMINI_API_KEY
      ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
      : null);
  const mock = env.AI_MODE === "mock";
  if (mock && env.NODE_ENV === "production")
    throw new Error("Mock AI is forbidden in production.");
  async function request(contents, systemInstruction, schema, temperature) {
    if (!client)
      throw Object.assign(new Error("AI is not configured."), {
        code: "MISSING_API_KEY",
      });
    const timeout = Math.min(
      30000,
      Math.max(5000, Number(env.AI_TIMEOUT_MS) || 20000),
    );
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          ...(usesDeprecatedSampling(model) ? {} : { temperature }),
          maxOutputTokens: 768,
          ...(model.startsWith("gemini-3")
            ? { thinkingConfig: { thinkingLevel: "minimal" } }
            : {}),
          abortSignal: controller.signal,
        },
      });
      if (response.candidates?.[0]?.finishReason !== "STOP")
        throw new Error("The AI response was blocked or incomplete.");
      return JSON.parse(response.text || "");
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    model,
    configured: !!client || mock,
    async generate(input) {
      if (mock && input.language === "zh")
        return validateStory(
          {
            title: "清淡到关灯",
            text: "机器人开了间面摊。第一位顾客说：“我要清淡一点。”机器人立刻关了灯。阿姨递给它一把汤勺，解释清淡不是昏暗。收摊时，机器人终于学会一件事：做饭需要好点子，但也不能忘了汤。",
            safeForPublic: true,
          },
          "zh",
        );
      if (mock)
        return validateStory({
          title: "Bright Ideas Need Soup",
          text: "The robot opened a noodle stall. Its first customer asked for something light, so it served a bowl with a torch. The auntie sighed, handed it a ladle, and explained lunch. By closing time, the robot had learned one useful lesson: bright ideas still need soup.",
          safeForPublic: true,
        });
      const output = await request(
        JSON.stringify({
          idea: input.prompt,
          challenge: input.theme || "Creative Story",
          newVersion: !!input.regenerate,
          avoidTitles: (input.avoidTitles || []).slice(0, 80),
        }),
        storyInstruction(input.language),
        STORY_SCHEMA,
        1,
      );
      if (!output || Object.keys(output).sort().join(",") !== "story,title")
        throw new Error("Invalid story response.");
      return validateStory(
        { title: output.title, text: output.story, safeForPublic: true },
        input.language,
      );
    },
    async judge(submission) {
      if (mock)
        return validateJudgement(
          {
            humour: 4.5,
            originality: 4,
            relevance: 4.5,
            explanation: "Mock judging for local testing only.",
          },
          "mock",
        );
      const output = await request(
        JSON.stringify({
          originalIdea: submission.prompt,
          title: submission.title,
          story: submission.resultText,
        }),
        JUDGE_PROMPT,
        JUDGE_SCHEMA,
        0,
      );
      if (
        !output ||
        Object.keys(output).sort().join(",") !==
          "creativity,humour,overall,reason,relevance"
      )
        throw new Error("Invalid judging response.");
      for (const key of ["humour", "creativity", "relevance", "overall"]) {
        if (
          typeof output[key] !== "number" ||
          !Number.isFinite(output[key]) ||
          output[key] < 1 ||
          output[key] > 5 ||
          (key !== "overall" &&
            Math.abs(output[key] * 100 - Math.round(output[key] * 100)) > 1e-8)
        )
          throw new Error("Invalid judging response.");
      }
      return validateJudgement(
        {
          humour: output.humour,
          originality: output.creativity,
          relevance: output.relevance,
          explanation: output.reason,
        },
        model,
      );
    },
  };
}
export function startWorker(
  repository,
  ai,
  {
    concurrency = 6,
    onMetric = () => {},
    onDiagnostic = (details) => console.error(JSON.stringify(details)),
  } = {},
) {
  let stopped = false,
    active = 0,
    timer = null;
  async function work(job) {
    const start = Date.now();
    try {
      if (job.submissionId) {
        const score = await ai.judge(job.submission);
        await repository.call("judged", {
          jobId: job.id,
          token: job.leaseToken,
          score,
        });
      } else {
        if (!job.generated) {
          const leaderboard = await repository.call("leaderboard", {
            roundId: job.roundId,
          });
          const generated = await ai.generate({
            ...job.input,
            avoidTitles: leaderboard.entries.map((entry) => entry.title),
          });
          await repository.call("generated", {
            jobId: job.id,
            token: job.leaseToken,
            generated,
          });
        }
        await repository.call("save", { jobId: job.id, token: job.leaseToken });
      }
      onMetric("aiSuccess", Date.now() - start);
    } catch (error) {
      onMetric("aiFailure", Date.now() - start);
      // Never log provider error text: it can contain credentials or participant text.
      const failure = classifyGeminiError(error);
      onDiagnostic({
        event: "gemini_request_failed",
        stage: job.submissionId ? "judging" : "generation",
        code: failure.code,
        status: failure.status,
        retryable: failure.retryable,
        attempt: job.submissionId ? job.judgeAttempts : job.attempts,
        model: /^gemini-[a-z0-9._-]{1,100}$/i.test(ai.model || "")
          ? ai.model
          : "custom-model",
      });
      try {
        await repository.call("fail", {
          jobId: job.id,
          token: job.leaseToken,
          retryable: failure.retryable,
          error: failure.message,
          delay:
            Math.min(30, 2 ** Math.max(job.attempts, job.judgeAttempts || 0)) +
            Math.floor(Math.random() * 3),
        });
      } catch {
        /* Durable lease recovery retries after database/network outage. */
      }
    } finally {
      active--;
    }
  }
  async function tick() {
    if (stopped) return;
    try {
      while (active < concurrency && !stopped) {
        const job = await repository.call("claim", {
          concurrency,
          leaseSeconds: 120,
          token: crypto.randomUUID(),
        });
        if (!job) break;
        active++;
        void work(job);
      }
    } catch {
      onMetric("databaseFailure", 0);
    }
    if (!stopped) timer = setTimeout(tick, 500);
  }
  void tick();
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
    get active() {
      return active;
    },
  };
}
