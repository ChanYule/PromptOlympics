import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelName } from './geminiConfig.js';

test('normalizeModelName preserves configured model names and uses the default when empty', () => {
  assert.equal(normalizeModelName(' gemini-3.6-flash '), 'gemini-3.6-flash');
  assert.equal(normalizeModelName('gemini-2.5-flash'), 'gemini-2.5-flash');
  assert.equal(normalizeModelName('   '), 'gemini-3.6-flash');
});
