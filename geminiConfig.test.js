import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelName } from './geminiConfig.js';

test('normalizeModelName maps unsupported 3.6 model to the working default', () => {
  assert.equal(normalizeModelName(' gemini-3.6-flash '), 'gemini-2.5-flash');
  assert.equal(normalizeModelName('gemini-2.5-flash'), 'gemini-2.5-flash');
  assert.equal(normalizeModelName('   '), 'gemini-2.5-flash');
});
