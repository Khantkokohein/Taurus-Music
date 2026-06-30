import { GoogleGenAI } from '@google/genai';
import { ApiError } from './_apiError.js';

const DEFAULT_GEMINI_MUSIC_MODEL = 'lyria-3-pro-preview';
const MODEL_PATTERN = /^lyria-3-[a-z0-9._-]{1,64}$/;
const MAX_AUDIO_BYTES = 80 * 1024 * 1024;

export const getGeminiMusicModel = () => {
  const configured = String(
    process.env.GEMINI_MUSIC_MODEL || DEFAULT_GEMINI_MUSIC_MODEL,
  ).trim();
  if (!MODEL_PATTERN.test(configured)) {
    throw new ApiError(
      503,
      'GEMINI_MUSIC_MODEL_INVALID',
      'The configured Gemini music model is not allowed.',
    );
  }
  return configured;
};

export const hasGeminiMusicConfig = () => (
  Boolean(String(process.env.GEMINI_API_KEY || '').trim())
  && MODEL_PATTERN.test(String(
    process.env.GEMINI_MUSIC_MODEL || DEFAULT_GEMINI_MUSIC_MODEL,
  ).trim())
);

export const generateGeminiFullSong = async ({
  prompt,
}: {
  prompt: string;
}) => {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new ApiError(
      503,
      'GEMINI_MUSIC_NOT_CONFIGURED',
      'Gemini music generation is not configured.',
    );
  }

  const model = getGeminiMusicModel();
  try {
    const client = new GoogleGenAI({ apiKey });
    const result = await client.models.generateContent({
      model,
      contents: prompt.slice(0, 12_000),
    });

    const textParts: string[] = [];
    let audio: Buffer | null = null;
    let mimeType = 'audio/mpeg';
    for (const part of result.candidates?.[0]?.content?.parts || []) {
      if (typeof part.text === 'string' && part.text.trim()) {
        textParts.push(part.text.trim());
      }
      if (part.inlineData?.data) {
        const candidate = Buffer.from(part.inlineData.data, 'base64');
        const candidateMimeType = String(part.inlineData.mimeType || '');
        if (
          candidate.byteLength > 0
          && candidate.byteLength <= MAX_AUDIO_BYTES
          && candidateMimeType.startsWith('audio/')
        ) {
          audio = candidate;
          mimeType = candidateMimeType;
        }
      }
    }

    if (!audio) {
      throw new ApiError(
        502,
        'GEMINI_MUSIC_NO_AUDIO',
        'Lyria 3 Pro did not return an audio track.',
      );
    }

    return {
      audio,
      mimeType,
      lyrics: textParts.join('\n\n'),
      model,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      'GEMINI_MUSIC_FAILED',
      'Lyria 3 Pro generation failed. Confirm model access and try again.',
    );
  }
};
