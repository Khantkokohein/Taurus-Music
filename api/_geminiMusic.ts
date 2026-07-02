import { GoogleGenAI } from '@google/genai';
import { ApiError } from './_apiError.js';

const DEFAULT_GEMINI_MUSIC_MODEL = 'lyria-3-pro-preview';
const MODEL_PATTERN = /^lyria-3-[a-z0-9._-]{1,64}$/;
const MAX_AUDIO_BYTES = 80 * 1024 * 1024;

type LyriaContent = {
  type?: string;
  data?: string;
  mime_type?: string;
  text?: string;
};

type LyriaInteraction = {
  output_audio?: LyriaContent;
  output_text?: string;
  outputs?: LyriaContent[];
  steps?: Array<{
    type?: string;
    content?: LyriaContent[];
  }>;
};

const readAudioContent = (content: LyriaContent | undefined) => {
  if (
    content?.type !== 'audio'
    || typeof content.data !== 'string'
    || !content.data
  ) {
    return null;
  }

  const audio = Buffer.from(content.data, 'base64');
  const mimeType = String(content.mime_type || 'audio/mpeg').toLowerCase();
  if (
    audio.byteLength === 0
    || audio.byteLength > MAX_AUDIO_BYTES
    || !mimeType.startsWith('audio/')
  ) {
    return null;
  }

  return { audio, mimeType };
};

export const parseGeminiMusicInteraction = (result: LyriaInteraction) => {
  const textParts: string[] = [];
  if (typeof result.output_text === 'string' && result.output_text.trim()) {
    textParts.push(result.output_text.trim());
  }

  let parsedAudio = readAudioContent(result.output_audio);
  for (const content of result.outputs || []) {
    if (
      content.type === 'text'
      && typeof content.text === 'string'
      && content.text.trim()
      && !textParts.includes(content.text.trim())
    ) {
      textParts.push(content.text.trim());
    }
    parsedAudio ||= readAudioContent(content);
  }
  for (const step of result.steps || []) {
    if (step.type !== 'model_output') continue;
    for (const content of step.content || []) {
      if (
        content.type === 'text'
        && typeof content.text === 'string'
        && content.text.trim()
        && !textParts.includes(content.text.trim())
      ) {
        textParts.push(content.text.trim());
      }
      parsedAudio ||= readAudioContent(content);
    }
  }

  if (!parsedAudio) {
    throw new ApiError(
      502,
      'GEMINI_MUSIC_NO_AUDIO',
      'Lyria 3 Pro did not return an audio track.',
    );
  }

  return {
    ...parsedAudio,
    lyrics: textParts.join('\n\n'),
  };
};

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
    const result = await client.interactions.create({
      model,
      input: prompt.slice(0, 12_000),
    });
    const parsed = parseGeminiMusicInteraction(result);

    return {
      ...parsed,
      model,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const providerStatus = Number(
      (error as { status?: unknown; statusCode?: unknown })?.status
      || (error as { statusCode?: unknown })?.statusCode
      || 0,
    );
    if (providerStatus === 429) {
      throw new ApiError(
        429,
        'GEMINI_MUSIC_RATE_LIMITED',
        'Lyria 3 Pro is busy. Please wait briefly and try again.',
      );
    }
    if (providerStatus === 403 || providerStatus === 404) {
      throw new ApiError(
        502,
        'GEMINI_MUSIC_MODEL_UNAVAILABLE',
        'Lyria 3 Pro access is not enabled for this Gemini API key.',
      );
    }
    throw new ApiError(
      502,
      'GEMINI_MUSIC_FAILED',
      'Lyria 3 Pro generation failed. Confirm model access and try again.',
    );
  }
};
