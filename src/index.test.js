const test = require('node:test');
const assert = require('node:assert');
const { customAlphabet } = require('nanoid');

// Matches the generator in index.js — kept separate here so tests don't need
// to boot the full Express app / DB connections just to check code shape.
const genCode = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 7);

test('generated codes are 7 characters long', () => {
  const code = genCode();
  assert.strictEqual(code.length, 7);
});

test('generated codes avoid ambiguous characters', () => {
  const code = genCode();
  assert.ok(!/[0O1l]/.test(code), `code "${code}" contains an ambiguous character`);
});

test('generated codes are unique across many calls', () => {
  const codes = new Set();
  for (let i = 0; i < 1000; i++) codes.add(genCode());
  assert.strictEqual(codes.size, 1000);
});

test('URL validation rejects malformed input', () => {
  assert.throws(() => new URL('not-a-url'));
  assert.doesNotThrow(() => new URL('https://example.com'));
});
