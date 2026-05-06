import { getAdminDb } from './_firebaseAdmin.js';
import { requireFirebaseAuth } from './_serverAuth.js';
import type { VerifiedFirebaseUser } from './_serverAuth.js';

type LyriaModelId = 'lyria-3-clip-preview' | 'lyria-3-pro-preview';

const FREE_LYRIA_MODEL: LyriaModelId = 'lyria-3-clip-preview';
const PRO_LYRIA_MODEL: LyriaModelId = 'lyria-3-pro-preview';
const OWNER_EMAIL = 'koheinkhantko51@gmail.com';
const ALLOWED_LYRIA_MODELS = new Set<LyriaModelId>([FREE_LYRIA_MODEL, PRO_LYRIA_MODEL]);

const isOwnerEmail = (email?: string | null) => (email || '').trim().toLowerCase() === OWNER_EMAIL;

const getTimestampMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  return 0;
};

const isPremiumPlanActive = (profile: any) => {
  const tier = String(profile?.tier || 'free');
  if (tier !== 'premium') return false;
  const expiresAt = getTimestampMillis(profile?.subscriptionExpiresAt);
  return expiresAt === 0 || expiresAt > Date.now();
};

const resolveLyriaModel = async (user: VerifiedFirebaseUser, requestedModel: unknown): Promise<LyriaModelId> => {
  const requested = ALLOWED_LYRIA_MODELS.has(requestedModel as LyriaModelId)
    ? requestedModel as LyriaModelId
    : PRO_LYRIA_MODEL;
  if (isOwnerEmail(user.email)) return requested;

  const snap = await getAdminDb().collection('users').doc(user.uid).get();
  const profile = snap.data() || {};
  if (isPremiumPlanActive(profile)) return requested;
  return FREE_LYRIA_MODEL;
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
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const isClipModel = lyriaModel === FREE_LYRIA_MODEL;
  const durationInstruction = isClipModel
    ? 'Target duration must be 30 seconds. This is a free trial Lyria 3 Clip preview, not a full song.'
    : durationMode === 'preview'
    ? 'Target duration must be about 60 seconds. This is a premium preview, so make it feel exciting but end cleanly at the preview point.'
    : 'Target duration must be at least 2 minutes 50 seconds and no longer than 3 minutes 30 seconds. Do not make a short sample.';
  const shapeInstruction = isClipModel
    ? `Create a polished 30-second ${genreDescription} preview clip as an MP3 with high-end studio music platform quality.`
    : `Create a complete, fully arranged ${genreDescription} song as an MP3 with high-end studio music platform quality.`;
  const fullPrompt = [
    shapeInstruction,
    durationInstruction,
    `Theme: ${prompt}.`,
    `Variation: ${variantLabel}.`,
    `Model profile: ${modelProfile}.`,
    `Style tags: ${styleText || genreDescription}.`,
    `Artist/vibe reference: ${artistName || 'none'}. Use only broad genre, mood, vocal energy, arrangement, and production texture. Do not imitate or clone the exact artist voice, melody, lyrics, identity, or copyrighted song; create an original Taurus performance.`,
    `Song section map: ${sectionMap || 'intro, verse, pre-hook, hook, verse 2, hook 2, bridge, final hook, outro'}.`,
    `Vocal direction: ${voice}. ${vocalProduction || 'Upfront studio vocal, natural emotion, clean diction, strong hook stacks, tasteful ad-libs, no robotic delivery.'}`,
    `Instrumental direction: ${instrumentalProduction || arrangementDescription}.`,
    `Mix/master direction: ${masteringProfile || 'Clear lead vocal, deep controlled low end, wide chorus, glue compression, limiter, release-ready loudness.'}`,
    `Lyrics mode: ${lyricsMode}. ${instrumental ? 'Create an instrumental track with no vocals.' : lyricsText ? `Use and adapt these lyrics naturally: ${lyricsText}.` : 'Write original lyrics when needed.'}`,
    `Creative controls: weirdness ${weirdness}%, style influence ${styleInfluence}%.`,
    `Arrangement must follow these selected sounds: ${arrangementDescription}.`,
    'Production must feel studio-recorded: polished lead vocal, tight timing, rich stereo instrumental, clear low end, balanced drums, strong hook, radio-ready loudness, and mastered final mix.',
    isClipModel
      ? 'Write and perform a short preview with intro impact, hook highlight, strong selected instruments, and a clean 30-second ending.'
      : durationMode === 'preview'
      ? 'Write and perform a compact premium preview with intro, hook, verse/chorus highlight, and a clean teaser ending.'
      : 'Write and perform the full prompt from start to finish. Include intro, verse 1, pre-chorus, chorus, verse 2, bridge, final chorus, and outro. The ending must feel complete, not cut off.',
    `Avoid these production failures: ${negativeProductionRules || 'thin demo, karaoke feel, weak drums, muddy bass, buried vocal, off-key vocal, random mumbling, abrupt cutoff, copyrighted imitation.'}`,
    'Lyrics must be complete, natural to sing, and match the user language when clear. Return the full lyrics/structure text and the MP3 audio.',
  ].join(' ');

  const result = await ai.models.generateContent({
    model: lyriaModel,
    contents: fullPrompt,
  });

  const lyrics: string[] = [];
  let audioBase64 = '';
  let mimeType = 'audio/mpeg';

  const parts = result.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.text) {
      lyrics.push(part.text);
    } else if (part.inlineData?.data) {
      audioBase64 = part.inlineData.data;
      mimeType = part.inlineData.mimeType || mimeType;
    }
  }

  if (!audioBase64) {
    throw new Error('Lyria did not return audio. Check that the API key has Lyria 3 access and try a safer prompt.');
  }

  return {
    audioBase64,
    mimeType,
    lyrics: lyrics.join('\n\n') || 'Lyrics not generated for this track.',
    model: lyriaModel,
  };
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireFirebaseAuth(req);
    const { prompt, genreDescription, arrangementDescription, modelProfile, lyricsText, lyricsMode, instrumental, styleText, artistName, weirdness, styleInfluence, durationMode, variantLabel, voice, vocalProduction, instrumentalProduction, masteringProfile, negativeProductionRules, sectionMap, lyriaModel } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

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
      lyriaModel: await resolveLyriaModel(user, lyriaModel),
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Generate song API error:', error);
    const message = error?.message || 'Failed to generate song.';
    const status = message.includes('login') || message.includes('session') ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
