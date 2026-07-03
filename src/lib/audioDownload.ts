const TRUSTED_AUDIO_DOWNLOAD_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

export const getTrustedAudioDownloadUrl = (
  downloadUrl: string | undefined,
  audioUrl: string,
) => {
  for (const value of [downloadUrl, audioUrl]) {
    if (!value) continue;
    if (value.startsWith('blob:')) return value;

    try {
      const parsed = new URL(value);
      if (
        parsed.protocol === 'https:'
        && TRUSTED_AUDIO_DOWNLOAD_HOSTS.has(parsed.hostname)
      ) {
        return parsed.toString();
      }
    } catch {
      // Ignore malformed or untrusted values.
    }
  }

  throw new Error('This song does not have a safe download link.');
};

export const buildAudioDownloadFileName = (
  title: string,
  mimeType = 'audio/mpeg',
) => {
  const extension = mimeType.includes('wav')
    ? 'wav'
    : mimeType.includes('ogg')
      ? 'ogg'
      : mimeType.includes('webm')
        ? 'webm'
        : mimeType.includes('m4a') || mimeType.includes('mp4')
          ? 'm4a'
          : 'mp3';
  const safeTitle = title
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${safeTitle || 'taurus-song'}.${extension}`;
};
