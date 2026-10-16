import { randomUUID } from "node:crypto";
export const COMPETITION_STATES = [
  "WAITING",
  "SUBMISSIONS_OPEN",
  "SUBMISSIONS_CLOSED",
  "VOTING",
  "RESULTS",
];
export const TRANSITIONS = {
  WAITING: ["SUBMISSIONS_OPEN"],
  SUBMISSIONS_OPEN: ["SUBMISSIONS_CLOSED"],
  SUBMISSIONS_CLOSED: ["VOTING"],
  VOTING: ["SUBMISSIONS_CLOSED", "RESULTS"],
  RESULTS: [],
};
export class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function createRound(number = 1, title = "Prompt Olympics") {
  return {
    id: randomUUID(),
    title,
    roundNumber: number,
    state: "WAITING",
    minVotes: 5,
    submissions: [],
    votes: [],
    createdAt: Date.now(),
  };
}
export function createCompetition(initial = {}) {
  return {
    id: "prompt-olympics",
    name: "Prompt Olympics",
    currentRoundIndex: 0,
    rounds: [createRound()],
    jobs: [],
    audit: [],
    codes: [],
    limits: [],
    ...initial,
  };
}
export function getCurrentRound(store) {
  return store.rounds[store.currentRoundIndex];
}
export function setCompetitionState(store, state) {
  const round = getCurrentRound(store);
  if (!TRANSITIONS[round.state]?.includes(state))
    throw new DomainError("This round change is not allowed.", 409);
  if (state === "RESULTS") {
    if (
      store.jobs.some(
        (j) =>
          j.roundId === round.id && !["ready", "failed"].includes(j.status),
      )
    )
      throw new DomainError(
        "Wait for generation and judging to finish before publishing.",
        409,
      );
    if (round.submissions.some((s) => !s.deleted && !s.aiScore))
      throw new DomainError(
        "Resolve failed AI judging before publishing.",
        409,
      );
    round.snapshot = buildLeaderboard(round);
  }
  round.state = state;
  return round;
}
export function createSubmission(store, input) {
  const round =
    store.rounds.find((r) => r.id === input.roundId) || getCurrentRound(store);
  if (round.state === "RESULTS")
    throw new DomainError("Results have already been published.", 409);
  const submission = {
    id: input.id || randomUUID(),
    ...input,
    aiScore: input.aiScore ?? null,
    judgingStatus: input.aiScore ? "ready" : "pending",
    createdAt: Date.now(),
    roundId: round.id,
  };
  round.submissions.push(submission);
  return submission;
}
export function createVote(
  store,
  { submissionId, voterSession, authorId, rating, idempotencyKey },
) {
  const round = getCurrentRound(store);
  const retry = store.rounds
    .flatMap((r) => r.votes)
    .find(
      (v) =>
        v.voterSession === voterSession && v.idempotencyKey === idempotencyKey,
    );
  if (retry) {
    if (retry.submissionId !== submissionId || retry.overall !== rating)
      throw new DomainError(
        "That request key was already used for a different vote.",
        409,
      );
    return { id: retry.id, submissionId, rating, recorded: true };
  }
  if (
    round.state !== "VOTING" &&
    !(round.boothMode && round.state === "SUBMISSIONS_OPEN")
  )
    throw new DomainError("Voting is closed.", 409);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new DomainError("Choose a rating from 1 to 5.");
  const story = round.submissions.find(
    (s) => s.id === submissionId && !s.deleted,
  );
  if (!story) throw new DomainError("Story not found.", 404);
  if (
    round.allowSelfVotes === false &&
    story.participantSession === (authorId || voterSession)
  )
    throw new DomainError(
      "Independent voting mode does not allow ratings of your own story.",
      403,
    );
  if (
    round.votes.some(
      (v) => v.submissionId === submissionId && v.voterSession === voterSession,
    )
  )
    throw new DomainError("Your vote for this story is already recorded.", 409);
  const vote = {
    id: randomUUID(),
    submissionId,
    voterSession,
    overall: rating,
    idempotencyKey,
    roundId: round.id,
    createdAt: Date.now(),
  };
  round.votes.push(vote);
  return { id: vote.id, submissionId, rating, recorded: true };
}
export function getAverageScore(round, id) {
  const votes = round.votes.filter((v) => v.submissionId === id);
  return votes.length
    ? votes.reduce((sum, v) => sum + v.overall, 0) / votes.length
    : null;
}
export function buildLeaderboard(round) {
  if (round.snapshot) return structuredClone(round.snapshot);
  const totals = new Map();
  for (const v of round.votes) {
    const t = totals.get(v.submissionId) || [0, 0];
    t[0] += v.overall;
    t[1]++;
    totals.set(v.submissionId, t);
  }
  return round.submissions
    .filter((s) => !s.deleted)
    .map((s) => {
      const [sum, count] = totals.get(s.id) || [0, 0];
      const ai = s.aiScore?.overall ?? null;
      const average = count ? sum / count : null;
      return {
        submissionId: s.id,
        participantName: s.participantName,
        title: s.title || "Untitled story",
        aiScore: ai,
        averageScore: average,
        voteCount: count,
        finalScore: ai === null || average === null ? null : (ai + average) / 2,
        eligible: ai !== null && count >= (round.minVotes ?? 5),
        judgingStatus: s.judgingStatus || (ai === null ? "pending" : "ready"),
      };
    })
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        (b.finalScore ?? -1) - (a.finalScore ?? -1) ||
        (b.averageScore ?? -1) - (a.averageScore ?? -1) ||
        (b.aiScore ?? -1) - (a.aiScore ?? -1) ||
        b.voteCount - a.voteCount ||
        (a.submissionId < b.submissionId
          ? -1
          : a.submissionId > b.submissionId
            ? 1
            : 0),
    );
}
export function startNewRound(store, title) {
  if (getCurrentRound(store).state !== "RESULTS")
    throw new DomainError(
      "Publish the current results before starting a new round.",
      409,
    );
  const next = createRound(store.rounds.length + 1, title || "Prompt Olympics");
  store.rounds.push(next);
  store.currentRoundIndex++;
  return next;
}
