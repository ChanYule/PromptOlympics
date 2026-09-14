import assert from 'node:assert/strict';
import test from 'node:test';
import { finalScore, humanScore, aiScore } from '../src/scoring.ts';

const vote = value => ({ funny: value, creative: value, surprise: value, fit: value });

test('saved AI scores convert to a five-point scale', () => {
  assert.equal(aiScore(0), 0);
  assert.equal(aiScore(6), 3);
  assert.equal(aiScore(10), 5);
});
test('AI and humans each contribute exactly half', () => {
  assert.equal(finalScore({ ai: { overall: 8 }, votes: [vote(3)] }), 3.5);
  assert.equal(finalScore({ ai: { overall: 10 }, votes: [vote(1)] }), 3);
  assert.equal(finalScore({ ai: { overall: 0 }, votes: [vote(5)] }), 2.5);
});
test('vote count never increases the human share', () => {
  assert.equal(finalScore({ ai: { overall: 8 }, votes: Array(20).fill(vote(3)) }), 3.5);
  assert.equal(humanScore({ ai: { overall: 8 }, votes: [vote(1), vote(5)] }), 3);
});
test('unvoted stories retain an AI preview with no human score', () => {
  const story = { ai: { overall: 8 }, votes: [] };
  assert.equal(humanScore(story), null);
  assert.equal(finalScore(story), 4);
});
