import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/_apiError.js';
import {
  getGeminiMusicModel,
  hasGeminiMusicConfig,
  parseGeminiMusicInteraction,
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

test('parses Lyria audio and lyrics from SDK convenience fields', () => {
  const parsed = parseGeminiMusicInteraction({
    output_audio: {
      type: 'audio',
      data: Buffer.from('test-audio').toString('base64'),
      mime_type: 'audio/mp3',
    },
    output_text: 'Original lyrics',
  });

  assert.equal(parsed.audio.toString(), 'test-audio');
  assert.equal(parsed.mimeType, 'audio/mp3');
  assert.equal(parsed.lyrics, 'Original lyrics');
});

test('parses Lyria audio and lyrics from model output steps', () => {
  const parsed = parseGeminiMusicInteraction({
    steps: [{
      type: 'model_output',
      content: [
        { type: 'text', text: 'Step lyrics' },
        {
          type: 'audio',
          data: Buffer.from('step-audio').toString('base64'),
          mime_type: 'audio/mpeg',
        },
      ],
    }],
  });

  assert.equal(parsed.audio.toString(), 'step-audio');
  assert.equal(parsed.mimeType, 'audio/mpeg');
  assert.equal(parsed.lyrics, 'Step lyrics');
});

test('parses Vertex Lyria audio and lyrics from interaction outputs', () => {
  const parsed = parseGeminiMusicInteraction({
    outputs: [
      { type: 'text', text: 'Vertex lyrics' },
      {
        type: 'audio',
        data: Buffer.from('vertex-audio').toString('base64'),
        mime_type: 'audio/mpeg',
      },
    ],
  });

  assert.equal(parsed.audio.toString(), 'vertex-audio');
  assert.equal(parsed.mimeType, 'audio/mpeg');
  assert.equal(parsed.lyrics, 'Vertex lyrics');
});

test('fails closed when Lyria returns no inline audio', () => {
  assert.throws(
    () => parseGeminiMusicInteraction({
      steps: [{
        type: 'model_output',
        content: [{ type: 'text', text: 'Lyrics only' }],
      }],
    }),
    (error) => (
      error instanceof ApiError
      && error.code === 'GEMINI_MUSIC_NO_AUDIO'
      && error.status === 502
    ),
  );
});
