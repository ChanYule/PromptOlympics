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
  const repo = await database({ alwaysOpen: false });
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
  const repo = await database({ alwaysOpen: false });
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
    await repo.db.exec(
      fs.readFileSync(
        new URL(
          "../supabase/migrations/006_always_open_event.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.equal((await repo.call("leaderboard")).entries[0].aiScore, null);
    await assert.rejects(
      repo.call("transition", { state: "RESULTS", actor: "admin" }),
      /always open/,
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

test("always-open upgrade reopens unfinished rounds and preserves published snapshots on rerun", async () => {
  const repo = await database({ alwaysOpen: false });
  const upgrade = fs.readFileSync(
    new URL(
      "../supabase/migrations/006_always_open_event.sql",
      import.meta.url,
    ),
    "utf8",
  );
  try {
    for (const state of [
      "WAITING",
      "SUBMISSIONS_CLOSED",
      "VOTING",
      "SUBMISSIONS_OPEN",
    ]) {
      await repo.db.query(
        "update po_rounds set state=$1 where id='initial-round'",
        [state],
      );
      await repo.db.exec(upgrade);
      assert.equal((await repo.call("competition")).id, "initial-round");
      assert.equal((await repo.call("competition")).state, "SUBMISSIONS_OPEN");
    }
    await repo.db.exec(
      "insert into po_participants(id,name,session_id,round_id) values('p','Alice','author','initial-round'); insert into po_submissions(id,round_id,participant_id,title,prompt,story) values('s','initial-round','p','Soup','Robot','Robot soup.'); insert into po_votes(id,round_id,submission_id,voter_id,rating,operation_id) values('v','initial-round','s','reader',5,'original'); update po_rounds set state='RESULTS',snapshot=po_leaderboard(id) where id='initial-round';",
    );
    const before = await repo.call("leaderboard");
    await repo.db.exec(upgrade);
    const current = await repo.call("competition");
    assert.notEqual(current.id, "initial-round");
    assert.equal(current.state, "SUBMISSIONS_OPEN");
    assert.deepEqual(
      await repo.call("leaderboard", { roundId: "initial-round" }),
      before,
    );
    await repo.db.exec(upgrade);
    assert.equal((await repo.call("competition")).id, current.id);
    assert.equal(
      (await repo.db.query("select count(*) n from po_rounds")).rows[0].n,
      2,
    );
    assert.equal(
      (await repo.db.query("select count(*) n from po_votes")).rows[0].n,
      1,
    );
    assert.equal((await repo.call("health")).schemaVersion, 6);
  } finally {
    await repo.db.close();
  }
});
