// Default: mocked contract checks. Live mode requires explicit opt-in and incurs up to 40 AI calls plus retries.
import fs from "node:fs";
import { createAiService } from "../aiService.js";
import { qualityCases, fixtureStory } from "../tests/quality-cases.mjs";
export async function qualityReport(live = false) {
  if (
    live &&
    (!process.env.GEMINI_API_KEY || process.env.RUN_LIVE_AI_QUALITY !== "YES")
  )
    throw Error(
      "Live quality checks require GEMINI_API_KEY and RUN_LIVE_AI_QUALITY=YES in a safe test environment.",
    );
  const rows = [];
  for (const [index, sample] of qualityCases.entries()) {
    const client = {
      models: {
        async generateContent(request) {
          const input = JSON.parse(request.contents);
          if (input.idea !== undefined && input.idea !== sample.prompt)
            throw Error("Prompt data was changed");
          return {
            candidates: [{ finishReason: "STOP" }],
            text: JSON.stringify(
              input.story === undefined
                ? fixtureStory(sample, index)
                : {
                    humour: 3.2,
                    creativity: 3.4,
                    relevance: 3.6,
                    overall: 1,
                    reason: "Mock scores only; not a quality assessment.",
                  },
            ),
          };
        },
      },
    };
    const ai = live
      ? createAiService(process.env)
      : createAiService({ GEMINI_MODEL: "gemini-3.6-flash" }, { client });
    const start = performance.now();
    try {
      const generated = await ai.generate({
        prompt: sample.prompt,
        language: "en",
      });
      const generationMs = performance.now() - start;
      const judged = await ai.judge({
        prompt: sample.prompt,
        title: generated.title,
        resultText: generated.text,
      });
      rows.push({
        ...sample,
        title: generated.title,
        story: generated.text,
        wordCount: generated.text.split(/\s+/).length,
        generationMs,
        aiScore: judged.overall,
        valid: true,
        review: {
          humour: "Human review required",
          relevance: "Human review required",
          readability: "Human review required",
          coherence: "Human review required",
        },
      });
    } catch (error) {
      rows.push({
        category: sample.category,
        prompt: sample.prompt,
        valid: false,
        error: error.message,
      });
    }
  }
  return {
    mode: live
      ? "live Gemini, isolated quality review"
      : "mocked structured-response contracts; outputs are authored fixtures, not Gemini quality evidence",
    cases: rows.length,
    valid: rows.filter((r) => r.valid).length,
    rows,
  };
}
if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/quality-check.mjs")
) {
  const report = await qualityReport(process.argv.includes("--live"));
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(
    "reports/story-quality.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      mode: report.mode,
      cases: report.cases,
      valid: report.valid,
    }),
  );
  if (report.valid !== 20) process.exitCode = 1;
}
