import { ApiError } from './_apiError.js';

const TRUSTED_AUDIO_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

export const parseTrustedAudioUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 1000) {
    throw new ApiError(400, 'INVALID_AUDIO_SOURCE', 'Song audio source is invalid.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, 'INVALID_AUDIO_SOURCE', 'Song audio source is invalid.');
  }

  if (
    url.protocol !== 'https:'
    || !TRUSTED_AUDIO_HOSTS.has(url.hostname.toLowerCase())
    || url.username
    || url.password
  ) {
    throw new ApiError(400, 'UNTRUSTED_AUDIO_SOURCE', 'Song audio source is not trusted.');
  }

  return url;
};
