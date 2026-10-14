import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { database } from "./database.mjs";
import { prepareMigration } from "../scripts/migrationData.js";
import { validateJudgement } from "../aiService.js";
function legacy() {
  return {
    currentRoundIndex: 0,
    rounds: [
      {
        id: "legacy-round",
        title: "Legacy",
        roundNumber: 1,
        state: "VOTING",
        createdAt: 1000,
        submissions: [
          {
            id: "legacy-story",
            participantName: "Alice",
            participantSession: "old-author",
            prompt: "Robot",
            resultText: "Robot soup.",
            createdAt: 2000,
            aiScore: {
              funny: 3.2,
              creativity: 3.8,
              relevance: 4.4,
              overall: 3.8,
              max: 5,
              gradingVersion: 2,
            },
          },
        ],
        votes: [
          {
            id: "legacy-vote",
            submissionId: "legacy-story",
            voterSession: "old-reader",
            overall: 5,
            createdAt: 3000,
          },
        ],
      },
    ],
  };
}
test("legacy migration preserves IDs, votes, scores and counts; exact rerun is safe", async () => {
  const repo = await database();
  try {
    await repo.db.exec(
      fs.readFileSync(
        new URL(
          "../supabase/migrations/002_legacy_import.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const raw = legacy(),
      data = prepareMigration(raw);
    const query = () =>
      repo.db.query("select po_import($1::jsonb) counts", [
        JSON.stringify(data),
      ]);
    const first = await query();
    assert.deepEqual(first.rows[0].counts, data.counts);
    assert.deepEqual((await query()).rows[0].counts, data.counts);
    const row = (await repo.call("leaderboard")).entries[0];
    assert.equal(row.submissionId, "legacy-story");
    assert.equal(row.aiScore, 3.8);
    assert.equal(row.voteCount, 1);
    assert.equal(row.finalScore, 4.4);
    const changed = prepareMigration({ ...raw, extra: "different" });
    await assert.rejects(
      repo.db.query("select po_import($1::jsonb)", [JSON.stringify(changed)]),
      /different backup/,
    );
    assert.equal(
      (await repo.db.query("select count(*) n from po_votes")).rows[0].n,
      1,
    );
  } finally {
    await repo.db.close();
  }
});
test("ambiguous OPEN, duplicates, orphaned votes and invalid scales stop migration", () => {
  let raw = legacy();
  raw.rounds[0].state = "OPEN";
  assert.throws(() => prepareMigration(raw), /ambiguous/);
  assert.equal(
    prepareMigration(raw, { legacyOpenState: "VOTING" }).records.rounds[0]
      .state,
    "VOTING",
  );
  raw = legacy();
  raw.rounds[0].votes.push({ ...raw.rounds[0].votes[0], id: "another" });
  assert.throws(() => prepareMigration(raw), /Duplicate voter/);
  raw = legacy();
  raw.rounds[0].votes[0].submissionId = "missing";
  assert.throws(() => prepareMigration(raw), /orphaned/);
  raw = legacy();
  raw.rounds[0].submissions[0].aiScore.max = 100;
  assert.throws(() => prepareMigration(raw), /scale/);
  raw = legacy();
  raw.rounds[0].submissions[0].aiScore = { overall: 8, max: 10 };
  assert.equal(prepareMigration(raw).records.judgements[0].overall, 4);
});
test("unscored historical judging requires an explicit audited operation and preserves completed scores", async () => {
  const repo = await database();
  try {
    await repo.db.exec(
      fs.readFileSync(
        new URL(
          "../supabase/migrations/002_legacy_import.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const raw = legacy();
    delete raw.rounds[0].submissions[0].aiScore;
    const data = prepareMigration(raw);
    await repo.db.query("select po_import($1::jsonb)", [JSON.stringify(data)]);
    assert.equal((await repo.call("leaderboard")).entries[0].aiScore, null);
    await assert.rejects(
      repo.call("transition", { state: "RESULTS", actor: "admin" }),
      /Resolve/,
    );
    await repo.call("judge-historical", {
      submissionId: "legacy-story",
      actor: "admin",
    });
    const job = await repo.call("claim", {
      token: "historical",
      leaseSeconds: 120,
      concurrency: 4,
    });
    assert.equal(job.status, "judging");
    assert.equal(job.submission.resultText, "Robot soup.");
    const score = validateJudgement(
      {
        humour: 4,
        originality: 3,
        relevance: 5,
        explanation: "Judged after explicit authorisation.",
      },
      "mock",
    );
    await repo.call("judged", { jobId: job.id, token: "historical", score });
    assert.equal((await repo.call("leaderboard")).entries[0].aiScore, 4);
    await assert.rejects(
      repo.call("judge-historical", {
        submissionId: "legacy-story",
        actor: "admin",
      }),
      /unscored/,
    );
    assert.equal(
      Number(
        (
          await repo.db.query(
            "select count(*) n from po_audit where action='judge-historical'",
          )
        ).rows[0].n,
      ),
      1,
    );
  } finally {
    await repo.db.close();
  }
});
