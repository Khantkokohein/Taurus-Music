const TRUSTED_GENERATED_AUDIO_HOSTS = new Set([
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
]);

export type GeneratedAudioPayload = {
  audioBase64?: string;
  downloadUrl?: string;
  mimeType?: string;
};

const base64ToBlob = (value: string, mimeType?: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], {
    type: mimeType && mimeType !== 'application/octet-stream' ? mimeType : 'audio/wav',
  });
};

export const getGeneratedAudioBlob = async (payload: GeneratedAudioPayload) => {
  if (payload.downloadUrl) {
    const url = new URL(payload.downloadUrl);
    if (
      url.protocol !== 'https:'
      || !TRUSTED_GENERATED_AUDIO_HOSTS.has(url.hostname.toLowerCase())
      || url.username
      || url.password
    ) {
      throw new Error('Generated audio download URL is invalid.');
    }
    const response = await fetch(url, { referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Generated audio download expired. Please generate again.');
    const blob = await response.blob();
    if (blob.size > 80 * 1024 * 1024) throw new Error('Generated audio is too large.');
    if (blob.type && !blob.type.startsWith('audio/')) throw new Error('Generated file is not audio.');
    return blob;
  }

  if (payload.audioBase64) {
    return base64ToBlob(payload.audioBase64, payload.mimeType);
  }

  throw new Error('Music provider returned no downloadable audio.');
};
