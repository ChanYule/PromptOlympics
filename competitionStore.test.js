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
  setCompetitionState(store, "SUBMISSIONS_OPEN");
  const story = createSubmission(store, {
    participantName: "Alice",
    participantSession: "author",
    prompt: "Robot",
    resultText: "Robot soup.",
    title: "Soup",
  });
  return { store, story };
}
function open(store) {
  setCompetitionState(store, "SUBMISSIONS_CLOSED");
  setCompetitionState(store, "VOTING");
}
test("round lifecycle preserves supplied state and rejects invalid transitions", () => {
  const s = createCompetition();
  assert.equal(getCurrentRound(s).state, "WAITING");
  assert.throws(() => setCompetitionState(s, "VOTING"), /not allowed/);
  setCompetitionState(s, "SUBMISSIONS_OPEN");
  assert.equal(getCurrentRound(s).state, "SUBMISSIONS_OPEN");
});
test("new stories remain pending without fabricated judging scores", () => {
  const { store, story } = setup();
  assert.equal(story.aiScore, null);
  assert.equal(buildLeaderboard(getCurrentRound(store))[0].finalScore, null);
});
test("precise equal weighting, provisional eligibility, duplicate retries and self voting", () => {
  const { store, story } = setup();
  story.aiScore = { overall: 4.375 };
  open(store);
  assert.throws(
    () =>
      createVote(store, {
        submissionId: story.id,
        voterSession: "author",
        rating: 5,
        idempotencyKey: "own",
      }),
    /own/,
  );
  for (let i = 0; i < 5; i++)
    createVote(store, {
      submissionId: story.id,
      voterSession: "reader" + i,
      rating: [5, 4, 5, 3, 4][i],
      idempotencyKey: "vote" + i,
    });
  const row = buildLeaderboard(getCurrentRound(store))[0];
  assert.equal(row.averageScore, 4.2);
  assert.equal(row.finalScore, 4.2875);
  assert.equal(row.eligible, true);
  const retry = createVote(store, {
    submissionId: story.id,
    voterSession: "reader0",
    rating: 5,
    idempotencyKey: "vote0",
  });
  assert.equal(retry.recorded, true);
  assert.equal(getCurrentRound(store).votes.length, 5);
  assert.throws(
    () =>
      createVote(store, {
        submissionId: story.id,
        voterSession: "reader0",
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
    open(store);
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
test("final snapshots and round history remain immutable", () => {
  const { store, story } = setup();
  story.aiScore = { overall: 4 };
  open(store);
  createVote(store, {
    submissionId: story.id,
    voterSession: "reader",
    rating: 5,
    idempotencyKey: "v",
  });
  setCompetitionState(store, "RESULTS");
  const before = buildLeaderboard(getCurrentRound(store));
  story.aiScore.overall = 1;
  assert.deepEqual(buildLeaderboard(getCurrentRound(store)), before);
  assert.throws(() => setCompetitionState(store, "VOTING"));
  startNewRound(store, "Next");
  assert.equal(store.rounds.length, 2);
  assert.equal(store.rounds[0].votes.length, 1);
});
