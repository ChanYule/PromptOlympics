import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCompetition,
  createSubmission,
  createVote,
  deleteSubmission,
  resetCompetition,
  startNewRound,
  getCurrentRound,
  buildLeaderboard,
  getAverageScore,
  setCompetitionState,
  COMPETITION_STATES
} from './competitionStore.js';

test('creates submissions and tracks round state', () => {
  const store = createCompetition();
  const submission = createSubmission(store, {
    participantName: 'Alice',
    prompt: 'A robot cooks noodles at a hawker centre',
    resultText: 'The noodles were so dramatic they got compliments from the auntie.'
  });

  assert.equal(submission.participantName, 'Alice');
  assert.equal(getCurrentRound(store).submissions.length, 1);
  assert.ok(COMPETITION_STATES.includes(getCurrentRound(store).state));
});

test('creates a valid vote and prevents duplicates', () => {
  const store = createCompetition();
  setCompetitionState(store, 'SUBMISSIONS_OPEN');
  createSubmission(store, {
    participantName: 'Alice',
    prompt: 'A robot cooks noodles at a hawker centre',
    resultText: 'Funny story.'
  });
  setCompetitionState(store, 'VOTING');

  const vote = createVote(store, {
    submissionId: getCurrentRound(store).submissions[0].id,
    voterSession: 'Voter 1',
    ratings: { overall: 5, funniest: 4, mostCreative: 3, bestPrompt: 5, overallScore: 5 }
  });

  assert.equal(vote.overall, 5);
  assert.equal(getCurrentRound(store).votes.length, 1);

  assert.throws(() => {
    createVote(store, {
      submissionId: getCurrentRound(store).submissions[0].id,
      voterSession: 'Voter 1',
      ratings: { overall: 3 }
    });
  }, /duplicate/i);
});

test('rejects invalid votes and self-votes', () => {
  const store = createCompetition();
  setCompetitionState(store, 'SUBMISSIONS_OPEN');
  createSubmission(store, {
    participantName: 'Alice',
    prompt: 'A robot cooks noodles at a hawker centre',
    resultText: 'Funny story.'
  });
  setCompetitionState(store, 'VOTING');

  assert.throws(() => {
    createVote(store, {
      submissionId: getCurrentRound(store).submissions[0].id,
      voterSession: 'Alice',
      ratings: { overall: 4 }
    });
  }, /own submission/i);

  assert.throws(() => {
    createVote(store, {
      submissionId: 'missing-id',
      voterSession: 'Voter 2',
      ratings: { overall: 6 }
    });
  }, /submission/i);
});

test('calculates average scores and leaderboard ordering', () => {
  const store = createCompetition();
  setCompetitionState(store, 'SUBMISSIONS_OPEN');
  const a = createSubmission(store, { participantName: 'Alice', prompt: 'A', resultText: 'A' });
  const b = createSubmission(store, { participantName: 'Bob', prompt: 'B', resultText: 'B' });
  setCompetitionState(store, 'VOTING');

  createVote(store, {
    submissionId: a.id,
    voterSession: 'Voter 1',
    ratings: { overall: 5 }
  });
  createVote(store, {
    submissionId: a.id,
    voterSession: 'Voter 2',
    ratings: { overall: 3 }
  });
  createVote(store, {
    submissionId: b.id,
    voterSession: 'Voter 3',
    ratings: { overall: 4 }
  });

  const leaderboard = buildLeaderboard(getCurrentRound(store));
  assert.equal(getAverageScore(getCurrentRound(store), a.id), 4);
  assert.equal(leaderboard[0].participantName, 'Alice');
  assert.equal(leaderboard[0].averageScore, 4);
  assert.equal(leaderboard[1].participantName, 'Bob');
});

test('deletes submissions and associated votes', () => {
  const store = createCompetition();
  setCompetitionState(store, 'SUBMISSIONS_OPEN');
  const a = createSubmission(store, { participantName: 'Alice', prompt: 'A', resultText: 'A' });
  const b = createSubmission(store, { participantName: 'Bob', prompt: 'B', resultText: 'B' });
  setCompetitionState(store, 'VOTING');

  createVote(store, {
    submissionId: a.id,
    voterSession: 'Voter 1',
    ratings: { overall: 5 }
  });
  createVote(store, {
    submissionId: b.id,
    voterSession: 'Voter 2',
    ratings: { overall: 3 }
  });

  deleteSubmission(store, a.id);
  assert.equal(getCurrentRound(store).submissions.length, 1);
  assert.equal(getCurrentRound(store).votes.filter((vote) => vote.submissionId === a.id).length, 0);
});

test('reset competition starts a fresh round', () => {
  const store = createCompetition();
  setCompetitionState(store, 'SUBMISSIONS_OPEN');
  createSubmission(store, { participantName: 'Alice', prompt: 'A', resultText: 'A' });
  setCompetitionState(store, 'RESULTS');

  resetCompetition(store);
  assert.equal(getCurrentRound(store).roundNumber, 1);
  assert.equal(getCurrentRound(store).submissions.length, 0);
  assert.equal(getCurrentRound(store).votes.length, 0);
});

test('startNewRound creates a new round without losing history', () => {
  const store = createCompetition();
  setCompetitionState(store, 'SUBMISSIONS_OPEN');
  createSubmission(store, { participantName: 'Alice', prompt: 'A', resultText: 'A' });
  setCompetitionState(store, 'RESULTS');

  const newRound = startNewRound(store, 'Prompt Olympics');
  assert.equal(newRound.roundNumber, 2);
  assert.equal(store.rounds.length, 2);
  assert.equal(getCurrentRound(store).submissions.length, 0);
});
