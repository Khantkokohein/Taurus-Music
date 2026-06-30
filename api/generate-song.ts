import { ApiError, sendApiError } from './_apiError.js';
import {
  completeGeneration,
  refundGeneration,
  reserveGeneration,
  type GenerationReservation,
} from './_generationSecurity.js';
import { generateLyriaAudio, uploadGeneratedAudio } from './_googleCloud.js';
import { requireFirebaseAuth } from './_serverAuth.js';

type LyriaModelId = 'lyria-002';
const LYRIA_MODEL: LyriaModelId = 'lyria-002';
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '32kb',
    },
  },
};

const resolveLyriaModel = (
  _requestedModel: unknown,
  _reservation: GenerationReservation,
  _isAdmin: boolean,
): LyriaModelId => {
  return LYRIA_MODEL;
};

const generateSongAudio = async ({
  prompt,
  genreDescription,
  arrangementDescription,
  modelProfile,
  lyricsText,
  lyricsMode,
  instrumental,
  styleText,
  artistName,
  weirdness,
  styleInfluence,
  durationMode,
  variantLabel,
  voice,
  vocalProduction,
  instrumentalProduction,
  masteringProfile,
  negativeProductionRules,
  sectionMap,
  lyriaModel,
}: {
  prompt: string;
  genreDescription: string;
  arrangementDescription: string;
  modelProfile: string;
  lyricsText: string;
  lyricsMode: string;
  instrumental: boolean;
  styleText: string;
  artistName: string;
  weirdness: number;
  styleInfluence: number;
  durationMode: string;
  variantLabel: string;
  voice: string;
  vocalProduction: string;
  instrumentalProduction: string;
  masteringProfile: string;
  negativeProductionRules: string;
  sectionMap: string;
  lyriaModel: LyriaModelId;
}) => {
  const fullPrompt = [
    `Create an original, polished instrumental ${genreDescription} music clip.`,
    'Target a concise 30-second arrangement with a clean ending.',
    `Theme: ${prompt}.`,
    `Variation: ${variantLabel}.`,
    `Model profile: ${modelProfile}.`,
    `Style tags: ${styleText || genreDescription}.`,
    `Artist/vibe reference: ${artistName || 'none'}. Use only broad genre, mood, vocal energy, arrangement, and production texture. Do not imitate or clone the exact artist voice, melody, lyrics, identity, or copyrighted song; create an original Taurus performance.`,
    `Song section map: ${sectionMap || 'intro impact, main motif, hook lift, clean ending'}.`,
    `Instrumental direction: ${instrumentalProduction || arrangementDescription}.`,
    `Mix/master direction: ${masteringProfile || 'Clear lead instruments, deep controlled low end, wide hook, glue compression, limiter, release-ready loudness.'}`,
    'Create instrumental audio only; do not synthesize vocals.',
    `Creative controls: weirdness ${weirdness}%, style influence ${styleInfluence}%.`,
    `Arrangement must follow these selected sounds: ${arrangementDescription}.`,
    'Production must feel studio-recorded: tight timing, rich stereo instrumental, clear low end, balanced drums, strong hook, and mastered final mix.',
  ].join(' ');

  const generated = await generateLyriaAudio({
    prompt: fullPrompt,
    negativePrompt: negativeProductionRules || 'vocals, thin demo, weak drums, muddy bass, abrupt cutoff, copyrighted imitation',
  });

  return {
    ...generated,
    lyrics: instrumental
      ? 'Instrumental track.'
      : lyricsText || 'Lyria 2 currently generated an instrumental music clip.',
  };
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let reservation: GenerationReservation | null = null;
  try {
    const user = await requireFirebaseAuth(req);
    const { prompt, genreDescription, arrangementDescription, modelProfile, lyricsText, lyricsMode, instrumental, styleText, artistName, weirdness, styleInfluence, durationMode, variantLabel, voice, vocalProduction, instrumentalProduction, masteringProfile, negativeProductionRules, sectionMap, lyriaModel } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      throw new ApiError(400, 'PROMPT_REQUIRED', 'Prompt is required.');
    }

    reservation = await reserveGeneration(
      user,
      typeof lyriaModel === 'string' ? lyriaModel : '',
    );
    const authorizedModel = resolveLyriaModel(lyriaModel, reservation, user.admin);
    const result = await generateSongAudio({
      prompt: prompt.slice(0, 1200),
      genreDescription: typeof genreDescription === 'string' ? genreDescription.slice(0, 240) : 'modern pop',
      arrangementDescription: typeof arrangementDescription === 'string' ? arrangementDescription.slice(0, 500) : 'balanced full-band arrangement',
      modelProfile: typeof modelProfile === 'string' ? modelProfile.slice(0, 300) : 'Taurus Apex L5 free-start profile with flagship vocal and studio master quality',
      lyricsText: typeof lyricsText === 'string' ? lyricsText.slice(0, 2000) : '',
      lyricsMode: lyricsMode === 'auto' ? 'auto' : 'manual',
      instrumental: instrumental === true,
      styleText: typeof styleText === 'string' ? styleText.slice(0, 500) : '',
      artistName: typeof artistName === 'string' ? artistName.slice(0, 80) : '',
      weirdness: typeof weirdness === 'number' ? Math.max(0, Math.min(100, weirdness)) : 50,
      styleInfluence: typeof styleInfluence === 'number' ? Math.max(0, Math.min(100, styleInfluence)) : 50,
      durationMode: durationMode === 'preview' ? 'preview' : 'full',
      variantLabel: typeof variantLabel === 'string' ? variantLabel.slice(0, 120) : 'main version',
      voice: typeof voice === 'string' ? voice.slice(0, 120) : 'Duet/Pair',
      vocalProduction: typeof vocalProduction === 'string' ? vocalProduction.slice(0, 900) : '',
      instrumentalProduction: typeof instrumentalProduction === 'string' ? instrumentalProduction.slice(0, 900) : '',
      masteringProfile: typeof masteringProfile === 'string' ? masteringProfile.slice(0, 700) : '',
      negativeProductionRules: typeof negativeProductionRules === 'string' ? negativeProductionRules.slice(0, 600) : '',
      sectionMap: typeof sectionMap === 'string' ? sectionMap.slice(0, 500) : '',
      lyriaModel: authorizedModel,
    });

    const stored = await uploadGeneratedAudio({
      uid: user.uid,
      jobId: reservation.jobId,
      audio: result.audio,
      mimeType: result.mimeType,
    });
    await completeGeneration(reservation, {
      model: result.model,
      storageObject: stored.objectName,
      mimeType: result.mimeType,
    });
    return res.status(200).json({
      downloadUrl: stored.downloadUrl,
      mimeType: result.mimeType,
      lyrics: result.lyrics,
      model: result.model,
      usage: reservation.usage,
    });
  } catch (error: unknown) {
    if (reservation) {
      await refundGeneration(reservation).catch(() => undefined);
    }
    const safeError = error instanceof ApiError
      ? error
      : new ApiError(502, 'GENERATION_PROVIDER_FAILED', 'Music generation failed. Please try again.');
    return sendApiError(res, safeError, 'Generate song API failed');
  }
}
