const LYRIA_MODEL = 'lyria-3-pro-preview';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDjowhLt-pq5DKd-phnS1Hwx7tdRomJCNQ';

const requireFirebaseAuth = async (req: any) => {
  const authorization = req.headers?.authorization || req.headers?.Authorization || '';
  const idToken = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!idToken) {
    throw new Error('Please login again to use Taurus AI.');
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.users?.[0]?.localId) {
    throw new Error('Login session expired. Please sign in again.');
  }
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
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const durationInstruction = durationMode === 'preview'
    ? 'Target duration must be about 60 seconds. This is a premium preview, so make it feel exciting but end cleanly at the preview point.'
    : 'Target duration must be at least 2 minutes 50 seconds and no longer than 3 minutes 30 seconds. Do not make a short sample.';
  const fullPrompt = [
    `Create a complete, fully arranged ${genreDescription} song as an MP3 with high-end studio music platform quality.`,
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
    durationMode === 'preview'
      ? 'Write and perform a compact premium preview with intro, hook, verse/chorus highlight, and a clean teaser ending.'
      : 'Write and perform the full prompt from start to finish. Include intro, verse 1, pre-chorus, chorus, verse 2, bridge, final chorus, and outro. The ending must feel complete, not cut off.',
    `Avoid these production failures: ${negativeProductionRules || 'thin demo, karaoke feel, weak drums, muddy bass, buried vocal, off-key vocal, random mumbling, abrupt cutoff, copyrighted imitation.'}`,
    'Lyrics must be complete, natural to sing, and match the user language when clear. Return the full lyrics/structure text and the MP3 audio.',
  ].join(' ');

  const result = await ai.models.generateContent({
    model: LYRIA_MODEL,
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
    model: LYRIA_MODEL,
  };
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireFirebaseAuth(req);
    const { prompt, genreDescription, arrangementDescription, modelProfile, lyricsText, lyricsMode, instrumental, styleText, artistName, weirdness, styleInfluence, durationMode, variantLabel, voice, vocalProduction, instrumentalProduction, masteringProfile, negativeProductionRules, sectionMap } = req.body || {};
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
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Generate song API error:', error);
    const message = error?.message || 'Failed to generate song.';
    const status = message.includes('login') || message.includes('session') ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
