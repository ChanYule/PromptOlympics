import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMPETITION_STATES = [
  'WAITING',
  'SUBMISSIONS_OPEN',
  'SUBMISSIONS_CLOSED',
  'VOTING',
  'RESULTS'
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_DIR = path.join(__dirname, 'data');
const STORAGE_PATH = path.join(STORAGE_DIR, 'competition.json');

function makeId(prefix = 'item') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function normalizeState(value) {
  return COMPETITION_STATES.includes(value) ? value : 'WAITING';
}

function clampRating(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(5, Math.max(1, Math.round(number)));
}

function sanitizeText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function createRound(roundNumber = 1, title = 'Prompt Olympics') {
  return {
    id: makeId('round'),
    title: sanitizeText(title, 'Prompt Olympics') || 'Prompt Olympics',
    roundNumber,
    state: 'WAITING',
    submissions: [],
    votes: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function createCompetition(initial = {}) {
  const safeStore = {
    id: 'prompt-olympics',
    name: 'Prompt Olympics',
    currentRoundIndex: 0,
    rounds: [createRound(1, initial.name || 'Prompt Olympics')],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...initial
  };

  if (!Array.isArray(safeStore.rounds) || safeStore.rounds.length === 0) {
    safeStore.rounds = [createRound(1, safeStore.name || 'Prompt Olympics')];
  }

  safeStore.rounds = safeStore.rounds.map((round, index) => ({
    ...createRound(index + 1, round.title || safeStore.name || 'Prompt Olympics'),
    ...round,
    state: normalizeState(round.state),
    submissions: Array.isArray(round.submissions) ? round.submissions : [],
    votes: Array.isArray(round.votes) ? round.votes : [],
    roundNumber: typeof round.roundNumber === 'number' ? round.roundNumber : index + 1,
    title: sanitizeText(round.title, safeStore.name || 'Prompt Olympics') || (safeStore.name || 'Prompt Olympics'),
    createdAt: typeof round.createdAt === 'number' ? round.createdAt : Date.now(),
    updatedAt: typeof round.updatedAt === 'number' ? round.updatedAt : Date.now()
  }));

  if (typeof safeStore.currentRoundIndex !== 'number' || safeStore.currentRoundIndex < 0) {
    safeStore.currentRoundIndex = 0;
  }
  if (safeStore.currentRoundIndex >= safeStore.rounds.length) {
    safeStore.currentRoundIndex = safeStore.rounds.length - 1;
  }

  return safeStore;
}

export function getCurrentRound(store) {
  const nextStore = store || createCompetition();
  if (!Array.isArray(nextStore.rounds) || nextStore.rounds.length === 0) {
    nextStore.rounds = [createRound(1, nextStore.name || 'Prompt Olympics')];
    nextStore.currentRoundIndex = 0;
  }
  const index = Number.isInteger(nextStore.currentRoundIndex) ? nextStore.currentRoundIndex : 0;
  const safeIndex = Math.min(Math.max(index, 0), nextStore.rounds.length - 1);
  nextStore.currentRoundIndex = safeIndex;
  return nextStore.rounds[safeIndex];
}

export function setCompetitionState(store, state) {
  const normalized = normalizeState(state);
  const round = getCurrentRound(store);
  round.state = normalized;
  round.updatedAt = Date.now();
  store.updatedAt = Date.now();
  return round;
}

export function createSubmission(store, { participantName, prompt, resultText }) {
  const round = getCurrentRound(store);
  const allowedStates = ['WAITING', 'SUBMISSIONS_OPEN'];
  if (!allowedStates.includes(round.state)) {
    throw new Error('Submissions are currently closed.');
  }

  const cleanedName = sanitizeText(participantName, '');
  const cleanedPrompt = sanitizeText(prompt, '');
  const cleanedResult = sanitizeText(resultText, '');

  if (!cleanedName || !cleanedPrompt || !cleanedResult) {
    throw new Error('Participant name, prompt, and generated result are required.');
  }
  if (cleanedName.length > 40 || cleanedPrompt.length > 700 || cleanedResult.length > 4000) {
    throw new Error('Submission data is too long.');
  }

  const submission = {
    id: makeId('submission'),
    participantName: cleanedName,
    prompt: cleanedPrompt,
    resultText: cleanedResult,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    roundId: round.id
  };

  round.submissions.push(submission);
  round.updatedAt = Date.now();
  store.updatedAt = Date.now();
  return submission;
}

export function createVote(store, { submissionId, voterSession, ratings, participantName }) {
  const round = getCurrentRound(store);
  if (round.state !== 'VOTING') {
    throw new Error('Voting is not open.');
  }

  const cleanedSession = sanitizeText(voterSession, '');
  if (!cleanedSession) {
    throw new Error('A voter session is required.');
  }

  const submission = round.submissions.find((entry) => entry.id === submissionId);
  if (!submission) {
    throw new Error('Submission not found.');
  }

  const normalizedParticipant = sanitizeText(participantName, '') || cleanedSession;
  const selfVoteName = submission.participantName.toLowerCase();
  if (normalizedParticipant.toLowerCase() === selfVoteName) {
    throw new Error('You may not vote for your own submission.');
  }

  const duplicateVote = round.votes.find(
    (vote) => vote.submissionId === submissionId && vote.voterSession.toLowerCase() === cleanedSession.toLowerCase()
  );
  if (duplicateVote) {
    throw new Error('Duplicate vote prevented for this voter and submission.');
  }

  const nextRatings = {
    funniest: clampRating(ratings?.funniest ?? 0),
    mostCreative: clampRating(ratings?.mostCreative ?? 0),
    bestPrompt: clampRating(ratings?.bestPrompt ?? 0),
    overall: clampRating(ratings?.overall ?? ratings?.overallScore ?? 0)
  };

  if (!nextRatings.overall || nextRatings.overall < 1 || nextRatings.overall > 5) {
    throw new Error('Overall rating must be between 1 and 5.');
  }

  const vote = {
    id: makeId('vote'),
    submissionId,
    voterSession: cleanedSession,
    participantName: normalizedParticipant,
    ratings: nextRatings,
    overall: nextRatings.overall,
    createdAt: Date.now(),
    roundId: round.id
  };

  round.votes.push(vote);
  round.updatedAt = Date.now();
  store.updatedAt = Date.now();
  return vote;
}

export function deleteSubmission(store, submissionId) {
  const round = getCurrentRound(store);
  const beforeCount = round.submissions.length;
  round.submissions = round.submissions.filter((submission) => submission.id !== submissionId);
  round.votes = round.votes.filter((vote) => vote.submissionId !== submissionId);
  if (beforeCount !== round.submissions.length) {
    round.updatedAt = Date.now();
    store.updatedAt = Date.now();
    return true;
  }
  return false;
}

export function deleteAllSubmissions(store) {
  const round = getCurrentRound(store);
  round.submissions = [];
  round.votes = [];
  round.updatedAt = Date.now();
  store.updatedAt = Date.now();
  return round;
}

export function resetVotes(store) {
  const round = getCurrentRound(store);
  round.votes = [];
  round.updatedAt = Date.now();
  store.updatedAt = Date.now();
  return round;
}

export function resetCompetition(store) {
  const baseName = store.name || 'Prompt Olympics';
  const cleared = createCompetition({ name: baseName, currentRoundIndex: 0, rounds: [createRound(1, baseName)] });
  Object.assign(store, cleared);
  return getCurrentRound(store);
}

export function startNewRound(store, title = 'Prompt Olympics') {
  const currentRound = getCurrentRound(store);
  const nextRound = createRound((currentRound.roundNumber || 1) + 1, title || currentRound.title || 'Prompt Olympics');
  store.rounds.push(nextRound);
  store.currentRoundIndex = store.rounds.length - 1;
  store.updatedAt = Date.now();
  return nextRound;
}

export function getAverageScore(round, submissionId) {
  const votes = round.votes.filter((vote) => vote.submissionId === submissionId);
  if (votes.length === 0) return 0;
  const total = votes.reduce((sum, vote) => sum + Number(vote.overall ?? (vote.ratings && vote.ratings.overall) ?? 0), 0);
  return Number((total / votes.length).toFixed(2));
}

export function buildLeaderboard(round) {
  return round.submissions
    .map((submission) => {
      const votes = round.votes.filter((vote) => vote.submissionId === submission.id);
      const averageScore = votes.length
        ? Number((votes.reduce((sum, vote) => sum + Number(vote.overall ?? vote.ratings?.overall ?? 0), 0) / votes.length).toFixed(2))
        : 0;

      return {
        submissionId: submission.id,
        participantName: submission.participantName,
        prompt: submission.prompt,
        resultText: submission.resultText,
        averageScore,
        voteCount: votes.length,
        createdAt: submission.createdAt
      };
    })
    .sort((a, b) => {
      // Tie-break rule: higher average wins; if tied, more votes wins; if still tied, alphabetical name for a stable order.
      if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
      if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
      return a.participantName.localeCompare(b.participantName);
    });
}

export function readCompetitionStore() {
  try {
    if (!fs.existsSync(STORAGE_PATH)) {
      const store = createCompetition();
      persistCompetitionStore(store);
      return store;
    }
    const raw = fs.readFileSync(STORAGE_PATH, 'utf8');
    if (!raw.trim()) {
      const created = createCompetition();
      persistCompetitionStore(created);
      return created;
    }
    const parsed = JSON.parse(raw);
    return createCompetition(parsed);
  } catch (error) {
    console.warn('Competition store load failed, resetting.', error);
    const fallback = createCompetition();
    persistCompetitionStore(fallback);
    return fallback;
  }
}

export function persistCompetitionStore(store) {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(store, null, 2));
    return store;
  } catch (error) {
    console.error('Unable to persist competition state.', error);
    return store;
  }
}
