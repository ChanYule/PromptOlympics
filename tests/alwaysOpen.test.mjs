import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createCompetition,
  getCurrentRound,
  buildLeaderboard,
} from "../competitionStore.js";
import { createLocalRepository } from "../localRepository.js";

test("local upgrade keeps unfinished entries and votes and preserves published history across restarts", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "po-always-open-"));
  const file = path.join(directory, "state.json");
  try {
    for (const state of [
      "WAITING",
      "SUBMISSIONS_CLOSED",
      "VOTING",
      "RESULTS",
    ]) {
      const store = createCompetition({ schemaVersion: 2 });
      const round = getCurrentRound(store);
      round.state = state;
      round.minVotes = 1;
      round.strictCodes = true;
      round.submissions.push({
        id: "story",
        participantName: "Alice",
        participantSession: "author",
        resultText: "Robot soup.",
        aiScore: { overall: 4 },
      });
      round.votes.push({
        id: "vote",
        submissionId: "story",
        voterSession: "reader",
        overall: 5,
        idempotencyKey: "original",
      });
      if (state === "RESULTS") round.snapshot = buildLeaderboard(round);
      const expected = buildLeaderboard(round);
      fs.writeFileSync(file, JSON.stringify(store));
      const repo = createLocalRepository(file);
      const current = await repo.call("competition");
      assert.equal(current.state, "SUBMISSIONS_OPEN");
      assert.equal(current.strictCodes, true);
      assert.equal(current.minVotes, 1);
      assert.equal(current.id === round.id, state !== "RESULTS");
      assert.deepEqual(
        (await repo.call("leaderboard", { roundId: round.id })).entries,
        expected,
      );
      for (const action of ["transition", "new-round"])
        await assert.rejects(
          repo.call(action, { state: "RESULTS" }),
          /always open/,
        );
      const restarted = createLocalRepository(file);
      assert.equal((await restarted.call("competition")).id, current.id);
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.equal(saved.rounds.length, state === "RESULTS" ? 2 : 1);
      assert.equal(saved.rounds[0].votes.length, 1);
    }
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
