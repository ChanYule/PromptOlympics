import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompetitionRepository, StorageError } from './competitionRepository.js';
import { createSubmission, createVote, getCurrentRound, deleteSubmission } from './competitionStore.js';

function database() {
  let row;
  let fail = false;
  let failWrites = false;
  const calls = [];
  return {
    calls,
    fail() { fail = true; },
    failWrites() { failWrites = true; },
    async fetch(url, options) {
      calls.push({ url, options });
      if (fail) return new Response('private database diagnostics', { status: 500 });
      const method = options.method ?? 'GET';
      if (failWrites && method === 'PATCH') return new Response('Write failed', { status: 503 });
      let result;
      if (method === 'GET') result = row ? [structuredClone(row)] : [];
      if (method === 'POST') {
        row ??= JSON.parse(options.body);
        result = [structuredClone(row)];
      }
      if (method === 'PATCH') {
        const expected = Number(new URL(url).searchParams.get('version').slice(3));
        if (row.version !== expected) result = [];
        else { row = { ...row, ...JSON.parse(options.body) }; result = [{ version: row.version }]; }
      }
      return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  };
}
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' };

test('stories survive repository restarts; votes and deletion persist', async () => {
  const db = database();
  const repo = createCompetitionRepository({ env, fetchImpl: db.fetch });
  const entry = await repo.update(store => createSubmission(store, { participantName: 'Writer', prompt: 'Robot', resultText: 'A silly robot story.' }));
  const next = createCompetitionRepository({ env, fetchImpl: db.fetch });
  assert.equal(getCurrentRound(await next.read()).submissions[0].id, entry.id);
  await next.update(store => createVote(store, { submissionId: entry.id, voterSession: 'reader', ratings: { overall: 5 } }));
  assert.equal(getCurrentRound(await repo.read()).votes.length, 1);
  await next.update(store => deleteSubmission(store, entry.id));
  assert.equal(getCurrentRound(await repo.read()).votes.length, 0);
  assert.equal(getCurrentRound(await repo.read()).submissions.length, 0);
  assert.equal(db.calls[0].options.headers.apikey, 'sb_secret_test');
  assert.equal(db.calls[0].options.headers.Authorization, undefined);
});

test('concurrent writers retry instead of losing stories', async () => {
  const db = database();
  const a = createCompetitionRepository({ env, fetchImpl: db.fetch });
  const b = createCompetitionRepository({ env, fetchImpl: db.fetch });
  await a.read();
  await Promise.all([a, b].map((repo, i) => repo.update(store => createSubmission(store, {
    participantName: `Writer ${i}`, prompt: 'Idea', resultText: 'Story'
  }))));
  assert.equal(getCurrentRound(await a.read()).submissions.length, 2);
  assert.ok(db.calls.filter(call => call.options.method === 'PATCH').length >= 3);
});

test('concurrent duplicate votes stay rejected', async () => {
  const db = database();
  const repo = createCompetitionRepository({ env, fetchImpl: db.fetch });
  const entry = await repo.update(store => createSubmission(store, { participantName: 'Writer', prompt: 'Idea', resultText: 'Story' }));
  const vote = () => repo.update(store => createVote(store, { submissionId: entry.id, voterSession: 'same-reader', ratings: { overall: 4 } }));
  const results = await Promise.allSettled([vote(), vote()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(getCurrentRound(await repo.read()).votes.length, 1);
});

test('database failures never report success or fall back to local storage', async () => {
  const db = database();
  const repo = createCompetitionRepository({ env, fetchImpl: db.fetch });
  await repo.read();
  db.fail();
  await assert.rejects(repo.read(), StorageError);
  await assert.rejects(repo.update(() => 'success'), StorageError);
});

test('incomplete configuration fails immediately', () => {
  assert.throws(() => createCompetitionRepository({ env: { SUPABASE_URL: env.SUPABASE_URL } }), /Set both/);
  assert.equal(createCompetitionRepository({ env: {} }).kind, 'local');
});

test('failed writes do not acknowledge or persist a new story', async () => {
  const db = database();
  const repo = createCompetitionRepository({ env, fetchImpl: db.fetch });
  await repo.read();
  db.failWrites();
  await assert.rejects(repo.update(store => createSubmission(store, {
    participantName: 'Writer', prompt: 'Idea', resultText: 'Story'
  })), StorageError);
  assert.equal(getCurrentRound(await repo.read()).submissions.length, 0);
});
