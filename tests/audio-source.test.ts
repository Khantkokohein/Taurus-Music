import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/_apiError.js';
import { parseTrustedAudioUrl } from '../api/_audioSource.js';

test('accepts official Firebase and Google Cloud Storage audio URLs', () => {
  assert.equal(
    parseTrustedAudioUrl('https://firebasestorage.googleapis.com/v0/b/example/o/audio.wav').hostname,
    'firebasestorage.googleapis.com',
  );
  assert.equal(
    parseTrustedAudioUrl('https://storage.googleapis.com/example/audio.wav').hostname,
    'storage.googleapis.com',
  );
});

for (const value of [
  'http://storage.googleapis.com/example/audio.wav',
  'https://127.0.0.1/internal',
  'https://metadata.google.internal/computeMetadata/v1/',
  'https://storage.googleapis.com@example.invalid/audio.wav',
  'not-a-url',
]) {
  test(`rejects an untrusted audio URL: ${value}`, () => {
    assert.throws(
      () => parseTrustedAudioUrl(value),
      (error) => error instanceof ApiError && error.status === 400,
    );
  });
}
