import { ApiError, sendApiError } from './_apiError.js';
import {
  completeGeneration,
  refundGeneration,
  reserveGeneration,
  type GenerationReservation,
} from './_generationSecurity.js';
import { generateGeminiFullSong, getGeminiMusicModel } from './_geminiMusic.js';
import {
  generateVertexLyriaFullSong,
  hasGoogleOidcConfig,
  uploadGeneratedAudio,
} from './_googleCloud.js';
import { requirePersonalAccess } from './_personalAccess.js';
import { requireFirebaseAuth } from './_serverAuth.js';

export const config = {
  maxDuration: 300,
  api: {
    bodyParser: {
      sizeLimit: '64kb',
    },
  },
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
}) => {
  const fullPrompt = [
    `Create one original, release-ready ${genreDescription} full song.`,
    'The finished audio must be at least 3 minutes and target 3 minutes 10 seconds to 3 minutes 30 seconds.',
    `Theme: ${prompt}.`,
    `Variation: ${variantLabel}.`,
    `Model profile: ${modelProfile}.`,
    `Style tags: ${styleText || genreDescription}.`,
    `Artist/vibe reference: ${artistName || 'none'}. Use only broad genre, mood, vocal energy, arrangement, and production texture. Do not imitate or clone the exact artist voice, melody, lyrics, identity, or copyrighted song; create an original Taurus performance.`,
    `Song section map: ${sectionMap || 'intro, verse 1, pre-chorus, chorus, verse 2, chorus, bridge, final chorus, complete outro'}.`,
    `Vocal direction: ${voice}. ${vocalProduction || 'Natural lead singing, clear pronunciation, emotional phrasing, strong hook stacks, and no robotic delivery.'}`,
    `Instrumental direction: ${instrumentalProduction || arrangementDescription}.`,
    `Mix/master direction: ${masteringProfile || 'Clear lead vocal, deep controlled low end, wide hook, glue compression, limiter, and release-ready loudness.'}`,
    `Lyrics mode: ${lyricsMode}. ${instrumental ? 'Create an instrumental track with no vocals.' : lyricsText ? `Sing these lyrics naturally and completely: ${lyricsText}.` : 'Write and sing original lyrics in the requested language.'}`,
    `Creative controls: weirdness ${weirdness}%, style influence ${styleInfluence}%.`,
    `Arrangement must follow these selected sounds: ${arrangementDescription}.`,
    'Perform the whole song from the first intro through a complete outro. Do not return a short sample, preview, spoken narration, or instrumental-only clip unless instrumental was explicitly requested.',
    'Production must feel studio-recorded: musical singing voice, tight timing, rich stereo instrumental, clear low end, balanced drums, strong hook, and mastered final mix.',
    `Avoid these production failures: ${negativeProductionRules || 'short preview, spoken narration, thin demo, weak drums, muddy bass, abrupt cutoff, copyrighted imitation'}.`,
  ].join(' ');

  const generated = hasGoogleOidcConfig()
    ? await generateVertexLyriaFullSong({ prompt: fullPrompt })
    : await generateGeminiFullSong({ prompt: fullPrompt });

  return {
    ...generated,
    lyrics: instrumental
      ? 'Instrumental track.'
      : generated.lyrics || lyricsText || 'Lyrics were generated with this Lyria 3 Pro track.',
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
    requirePersonalAccess(user);
    const { prompt, genreDescription, arrangementDescription, modelProfile, lyricsText, lyricsMode, instrumental, styleText, artistName, weirdness, styleInfluence, durationMode, variantLabel, voice, vocalProduction, instrumentalProduction, masteringProfile, negativeProductionRules, sectionMap, lyriaModel } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      throw new ApiError(400, 'PROMPT_REQUIRED', 'Prompt is required.');
    }

    reservation = await reserveGeneration(
      user,
      getGeminiMusicModel(),
    );
    const result = await generateSongAudio({
      prompt: prompt.slice(0, 1200),
      genreDescription: typeof genreDescription === 'string' ? genreDescription.slice(0, 240) : 'modern pop',
      arrangementDescription: typeof arrangementDescription === 'string' ? arrangementDescription.slice(0, 500) : 'balanced full-band arrangement',
      modelProfile: typeof modelProfile === 'string' ? modelProfile.slice(0, 300) : 'Taurus Apex L5 free-start profile with flagship vocal and studio master quality',
      lyricsText: typeof lyricsText === 'string' ? lyricsText.slice(0, 5000) : '',
      lyricsMode: lyricsMode === 'auto' ? 'auto' : 'manual',
      instrumental: instrumental === true,
      styleText: typeof styleText === 'string' ? styleText.slice(0, 500) : '',
      artistName: typeof artistName === 'string' ? artistName.slice(0, 80) : '',
      weirdness: typeof weirdness === 'number' ? Math.max(0, Math.min(100, weirdness)) : 50,
      styleInfluence: typeof styleInfluence === 'number' ? Math.max(0, Math.min(100, styleInfluence)) : 50,
      durationMode: 'full',
      variantLabel: typeof variantLabel === 'string' ? variantLabel.slice(0, 120) : 'main version',
      voice: typeof voice === 'string' ? voice.slice(0, 120) : 'Duet/Pair',
      vocalProduction: typeof vocalProduction === 'string' ? vocalProduction.slice(0, 900) : '',
      instrumentalProduction: typeof instrumentalProduction === 'string' ? instrumentalProduction.slice(0, 900) : '',
      masteringProfile: typeof masteringProfile === 'string' ? masteringProfile.slice(0, 700) : '',
      negativeProductionRules: typeof negativeProductionRules === 'string' ? negativeProductionRules.slice(0, 600) : '',
      sectionMap: typeof sectionMap === 'string' ? sectionMap.slice(0, 700) : '',
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
