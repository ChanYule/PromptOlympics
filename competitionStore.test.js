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
  scoreSubmission,
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

test('scoreSubmission rewards funny, creative and on-topic text', () => {
  const bland = scoreSubmission('A robot cooks noodles', 'It happened.', 'Creative Story');
  const strong = scoreSubmission(
    'A robot cooks noodles at a hawker centre',
    'The hilarious robot noodles took an unexpected, creative twist that surprised everyone at the hawker centre.',
    'Creative Story'
  );

  assert.ok(strong.funny > bland.funny);
  assert.ok(strong.creativity > bland.creativity);
  assert.ok(strong.relevance > bland.relevance);
  assert.ok(strong.overall > bland.overall);
});

test('scores a submission on funny, creativity and relevance as soon as it is created', () => {
  const store = createCompetition();
  const submission = createSubmission(store, {
    participantName: 'Alice',
    prompt: 'A robot cooks noodles at a hawker centre',
    resultText: 'The absurd, hilarious robot improvised a twist ending with the noodles.'
  });

  assert.ok(submission.aiScore);
  for (const key of ['funny', 'creativity', 'relevance', 'overall']) {
    assert.ok(submission.aiScore[key] >= 0 && submission.aiScore[key] <= 10);
  }

  const leaderboard = buildLeaderboard(getCurrentRound(store));
  assert.equal(leaderboard[0].voteCount, 0);
  assert.equal(leaderboard[0].finalScore, submission.aiScore.overall);
});

test('adds the public rating to the AI score once votes exist', () => {
  const store = createCompetition();
  const submission = createSubmission(store, {
    participantName: 'Alice',
    prompt: 'A robot cooks noodles at a hawker centre',
    resultText: 'Funny story.'
  });
  createVote(store, { submissionId: submission.id, voterSession: 'Voter 1', ratings: { overall: 5 } });

  const leaderboard = buildLeaderboard(getCurrentRound(store));
  const entry = leaderboard[0];
  const expectedFinal = Number((entry.aiScore.overall + entry.averageScore).toFixed(2));
  assert.equal(entry.finalScore, expectedFinal);
  assert.equal(entry.scoreMax, 15);
});

test('keeps submissions and voting open at the same time', () => {
  const store = createCompetition();
  const submission = createSubmission(store, {
    participantName: 'Alice',
    prompt: 'A robot cooks noodles at a hawker centre',
    resultText: 'Funny story.'
  });

  const vote = createVote(store, {
    submissionId: submission.id,
    voterSession: 'Voter 1',
    ratings: { overall: 5 }
  });

  assert.equal(getCurrentRound(store).state, 'OPEN');
  assert.equal(vote.overall, 5);
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

test('rejects invalid overall ratings without recording a vote', () => {
  for (const overall of [undefined, null, 0, -1, 6, 2.5, NaN, Infinity, '5', true]) {
    const store = createCompetition();
    const entry = createSubmission(store, { participantName: 'Alice', prompt: 'A', resultText: 'A' });
    assert.throws(() => createVote(store, { submissionId: entry.id, voterSession: 'visitor', ratings: { overall } }), /ratings/i);
    assert.equal(getCurrentRound(store).votes.length, 0);
  }
});

test('keeps skipped optional ratings unrated and rejects malformed optional ratings', () => {
  const store = createCompetition();
  const entry = createSubmission(store, { participantName: 'Alice', prompt: 'A', resultText: 'A' });
  const vote = createVote(store, { submissionId: entry.id, voterSession: 'visitor', ratings: { overall: 4, funniest: 0 } });
  assert.deepEqual(vote.ratings, { overall: 4, funniest: 0, mostCreative: 0, bestPrompt: 0 });
  assert.throws(() => createVote(store, { submissionId: entry.id, voterSession: 'another', ratings: { overall: 4, bestPrompt: 8 } }), /ratings/i);
  assert.equal(getCurrentRound(store).votes.length, 1);
});

test('ties self-vote prevention to the submitting session even after a name change', () => {
  const store = createCompetition();
  const entry = createSubmission(store, { participantName: 'Alice', participantSession: 'browser-a', prompt: 'A', resultText: 'A' });
  assert.throws(() => createVote(store, { submissionId: entry.id, voterSession: 'BROWSER-A', participantName: 'Different name', ratings: { overall: 5 } }), /own submission/i);
  assert.equal(getCurrentRound(store).votes.length, 0);
});

test('different browser sessions can vote independently but changing a name cannot bypass duplicates', () => {
  const store = createCompetition();
  const entry = createSubmission(store, { participantName: 'Alice', prompt: 'A', resultText: 'A' });
  for (const voterSession of ['browser-a', 'browser-b']) createVote(store, { submissionId: entry.id, voterSession, ratings: { overall: 4 } });
  assert.throws(() => createVote(store, { submissionId: entry.id, voterSession: ' BROWSER-A ', participantName: 'New name', ratings: { overall: 5 } }), /duplicate/i);
  assert.equal(getCurrentRound(store).votes.length, 2);
});
