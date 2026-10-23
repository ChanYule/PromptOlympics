import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompetition,
  createSubmission,
  createVote,
  getCurrentRound,
  setCompetitionState,
  buildLeaderboard,
  startNewRound,
} from "./competitionStore.js";
function setup() {
  const store = createCompetition();
  const story = createSubmission(store, {
    participantName: "Alice",
    participantSession: "author",
    prompt: "Robot",
    resultText: "Robot soup.",
    title: "Soup",
  });
  return { store, story };
}
test("rounds start open and cannot be closed or replaced", () => {
  const store = createCompetition();
  assert.equal(getCurrentRound(store).state, "SUBMISSIONS_OPEN");
  for (const state of ["WAITING", "SUBMISSIONS_CLOSED", "VOTING", "RESULTS"]) {
    assert.throws(() => setCompetitionState(store, state), /always open/);
  }
  assert.throws(() => startNewRound(store, "Next"), /always open/);
});
test("new stories remain pending without fabricated judging scores", () => {
  const { store, story } = setup();
  assert.equal(story.aiScore, null);
  assert.equal(buildLeaderboard(getCurrentRound(store))[0].finalScore, null);
});
test("precise equal weighting, provisional eligibility, duplicate retries and self voting", () => {
  const { store, story } = setup();
  story.aiScore = { overall: 4.375 };
  for (let i = 0; i < 5; i++)
    createVote(store, {
      submissionId: story.id,
      voterSession: i === 0 ? "author" : "reader" + i,
      rating: [5, 4, 5, 3, 4][i],
      idempotencyKey: "vote" + i,
    });
  const row = buildLeaderboard(getCurrentRound(store))[0];
  assert.equal(row.averageScore, 4.2);
  assert.equal(row.finalScore, 4.2875);
  assert.equal(row.eligible, true);
  const retry = createVote(store, {
    submissionId: story.id,
    voterSession: "author",
    rating: 5,
    idempotencyKey: "vote0",
  });
  assert.equal(retry.recorded, true);
  assert.equal(getCurrentRound(store).votes.length, 5);
  assert.throws(
    () =>
      createVote(store, {
        submissionId: story.id,
        voterSession: "author",
        rating: 1,
        idempotencyKey: "vote0",
      }),
    /different/,
  );
});
test("invalid ratings never record a vote", () => {
  for (const rating of [
    undefined,
    null,
    0,
    -1,
    6,
    2.5,
    NaN,
    Infinity,
    "5",
    true,
  ]) {
    const { store, story } = setup();
      assert.throws(() =>
      createVote(store, {
        submissionId: story.id,
        voterSession: "reader",
        rating,
        idempotencyKey: "v",
      }),
    );
    assert.equal(getCurrentRound(store).votes.length, 0);
  }
});
test("historical snapshots remain fixed", () => {
  const { store, story } = setup();
  story.aiScore = { overall: 4 };
  const round = getCurrentRound(store);
  round.snapshot = buildLeaderboard(round);
  round.state = "RESULTS";
  const before = buildLeaderboard(round);
  story.aiScore.overall = 1;
  assert.deepEqual(buildLeaderboard(round), before);
});
