import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/_apiError.js';
import {
  getGeminiMusicModel,
  hasGeminiMusicConfig,
} from '../api/_geminiMusic.js';

const keys = ['GEMINI_API_KEY', 'GEMINI_MUSIC_MODEL'] as const;
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));

after(() => {
  for (const key of keys) {
    const value = original[key];
    if (typeof value === 'string') process.env[key] = value;
    else delete process.env[key];
  }
});

test('Gemini music configuration fails closed without a server key', { concurrency: false }, () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MUSIC_MODEL;
  assert.equal(getGeminiMusicModel(), 'lyria-3-pro-preview');
  assert.equal(hasGeminiMusicConfig(), false);
});

test('Gemini music model is restricted to a Lyria 3 identifier', { concurrency: false }, () => {
  process.env.GEMINI_API_KEY = 'test-only-placeholder';
  process.env.GEMINI_MUSIC_MODEL = 'untrusted-model';
  assert.equal(hasGeminiMusicConfig(), false);
  assert.throws(
    () => getGeminiMusicModel(),
    (error) => error instanceof ApiError && error.status === 503,
  );
});

test('accepts the server-configured Lyria 3 Pro model', { concurrency: false }, () => {
  process.env.GEMINI_API_KEY = 'test-only-placeholder';
  process.env.GEMINI_MUSIC_MODEL = 'lyria-3-pro-preview';
  assert.equal(hasGeminiMusicConfig(), true);
  assert.equal(getGeminiMusicModel(), 'lyria-3-pro-preview');
});
