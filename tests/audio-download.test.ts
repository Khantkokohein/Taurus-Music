import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAudioDownloadFileName,
  getTrustedAudioDownloadUrl,
} from '../src/lib/audioDownload.js';

test('prefers the short-lived generated audio download URL', () => {
  const generated = 'https://storage.googleapis.com/example/generated.wav?signature=safe';
  const stored = 'blob:https://example.com/local-audio';

  assert.equal(getTrustedAudioDownloadUrl(generated, stored), generated);
});

test('accepts trusted stored and in-memory audio URLs', () => {
  assert.equal(
    getTrustedAudioDownloadUrl(
      undefined,
      'https://firebasestorage.googleapis.com/v0/b/example/o/audio.mp3',
    ),
    'https://firebasestorage.googleapis.com/v0/b/example/o/audio.mp3',
  );
  assert.equal(
    getTrustedAudioDownloadUrl(undefined, 'blob:https://example.com/local-audio'),
    'blob:https://example.com/local-audio',
  );
});

test('rejects malformed, insecure, and untrusted audio URLs', () => {
  for (const value of [
    'http://storage.googleapis.com/example/audio.wav',
    'https://example.invalid/audio.wav',
    'javascript:alert(1)',
    'not-a-url',
  ]) {
    assert.throws(
      () => getTrustedAudioDownloadUrl(undefined, value),
      /safe download link/,
    );
  }
});

test('builds a safe filename with the real audio extension', () => {
  assert.equal(
    buildAudioDownloadFileName('My New Song!', 'audio/wav'),
    'My-New-Song.wav',
  );
  assert.equal(
    buildAudioDownloadFileName('မြန်မာသီချင်း', 'audio/mpeg'),
    'taurus-song.mp3',
  );
});
