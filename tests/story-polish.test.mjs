import test from "node:test";
import assert from "node:assert/strict";
import { createAiService, RUBRIC, validateStory } from "../aiService.js";
import { uniqueStoryTitle } from "../storyTitles.js";
import { database } from "./database.mjs";

test("two-decimal judging preserves weighted scoring and valid ties without trusting model totals", async () => {
  const requests = [];
  const ai = createAiService(
    { GEMINI_MODEL: "gemini-3.6-flash" },
    {
      client: {
        models: {
          async generateContent(request) {
            requests.push(request);
            const input = JSON.parse(request.contents);
            return {
              candidates: [{ finishReason: "STOP" }],
              text: JSON.stringify(
                input.idea !== undefined
                  ? {
                      story:
                        "The horse ordered hay. The bartender brought a microphone: it was neigh night.",
                      title: "Neigh Night",
                    }
                  : {
                      humour: 3.68,
                      creativity: 3.92,
                      relevance: 4.08,
                      overall: 5,
                      reason:
                        "The neigh detail connects to the bar, but the wordplay is familiar.",
                    },
              ),
            };
          },
        },
      },
    },
  );
  const generated = await ai.generate({
    prompt: "A horse in a bar",
    avoidTitles: ["Hay Happy Hour"],
  });
  assert.equal(generated.title, "Neigh Night");
  assert.deepEqual(JSON.parse(requests[0].contents).avoidTitles, [
    "Hay Happy Hour",
  ]);
  const submission = {
    prompt: "A horse in a bar",
    title: generated.title,
    resultText: generated.text,
  };
  const first = await ai.judge(submission),
    second = await ai.judge(submission);
  assert.ok(Math.abs(first.overall - 3.84) < 1e-10);
  assert.equal(first.overall, second.overall);
  assert.equal(first.rubric, RUBRIC);
});

test("title collisions handle case, whitespace, suffix collisions and Chinese length", () => {
  assert.equal(
    uniqueStoryTitle("Neigh Night", [" neigh   NIGHT ", "Neigh Night (2)"]),
    "Neigh Night (3)",
  );
  const title = "机器人面摊清淡到关灯";
  const unique = uniqueStoryTitle(title, [title]);
  assert.ok(Array.from(unique).length <= 12);
  validateStory(
    { title: unique, text: "机器人关灯了。", safeForPublic: true },
    "zh",
  );
  const english = "One Two Three Four Five Six";
  validateStory({
    title: uniqueStoryTitle(english, [english]),
    text: "The story.",
    safeForPublic: true,
  });
});

test("PostgreSQL saves distinct titles and preserves the title on an idempotent retry", async () => {
  const repo = await database();
  try {
    const round = (await repo.call("competition")).id;
    await repo.db.query(
      "insert into po_participants(id,name,session_id,round_id) values('title-author','Author','title-session',$1)",
      [round],
    );
    const titles = [
      "Neigh Night",
      " neigh   NIGHT ",
      "Neigh Night",
      "机器人面摊清淡到关灯",
      "机器人面摊清淡到关灯",
    ];
    const results = await Promise.all(
      titles.map((title, index) =>
        repo.db.query(
          "insert into po_submissions(id,round_id,participant_id,title,prompt,story) values($1,$2,'title-author',$3,'Horse','A horse ordered hay.') returning title",
          [`title-${index}`, round, title],
        ),
      ),
    );
    const saved = results.map((result) => result.rows[0].title);
    assert.equal(
      new Set(
        saved.map((title) => title.trim().replace(/\s+/gu, " ").toLowerCase()),
      ).size,
      titles.length,
    );
    assert.equal(saved[0], titles[0]);
    assert.equal(saved[2], "Neigh Night (3)");
    assert.equal(saved[4], uniqueStoryTitle(titles[4], [titles[3]]));
    await repo.db.query(
      "insert into po_submissions select * from po_submissions where id='title-0' on conflict do nothing",
    );
    assert.equal(
      (
        await repo.db.query(
          "select title from po_submissions where id='title-0'",
        )
      ).rows[0].title,
      titles[0],
    );
  } finally {
    await repo.db.close();
  }
});
