import { ApiError, sendApiError } from './_apiError.js';
import { requirePersonalAccess } from './_personalAccess.js';
import { enforceUserRateLimit } from './_rateLimit.js';
import { requireFirebaseAuth } from './_serverAuth.js';

const VOICE_MODEL = process.env.GEMINI_VOICE_MODEL || 'gemini-2.5-flash';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '16mb',
    },
  },
};

const cleanPrompt = (value: string) => (
  value
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
);

const analyzeVoiceReference = async ({
  audioBase64,
  mimeType,
  idea,
  lyricsText,
  lyricsMode,
  instrumental,
  styleText,
  artistName,
  genreDescription,
  arrangementDescription,
  modelProfile,
  weirdness,
  styleInfluence,
  voice,
}: {
  audioBase64: string;
  mimeType: string;
  idea: string;
  lyricsText: string;
  lyricsMode: string;
  instrumental: boolean;
  styleText: string;
  artistName: string;
  genreDescription: string;
  arrangementDescription: string;
  modelProfile: string;
  weirdness: number;
  styleInfluence: number;
  voice: string;
}) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) {
    throw new ApiError(503, 'VOICE_ANALYSIS_NOT_CONFIGURED', 'Voice analysis is temporarily unavailable.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: VOICE_MODEL,
    config: {
      systemInstruction: [
        'You are a senior studio producer turning rough vocal or humming references into music-generation prompts.',
        'Analyze melody contour, phrasing, language, emotional tone, tempo feel, vocal energy, and hook shape.',
        'Do not claim to clone the singer voice. Create a polished commercial studio arrangement direction.',
        'Return ONLY one complete prompt under 900 characters.',
      ].join(' '),
    },
    contents: [{
      role: 'user',
      parts: [
        {
          text: [
            `User idea: ${idea || 'No typed idea. Use the voice reference as the main melody seed.'}`,
            `Lyrics: ${instrumental ? 'Instrumental only.' : lyricsText || 'Write original lyrics.'}`,
            `Lyrics mode: ${lyricsMode}.`,
            `Model profile: ${modelProfile}.`,
            `Target style: ${genreDescription || 'modern pop'}.`,
            `Style tags: ${styleText || 'match the audio reference and selected genre'}.`,
            `Artist/vibe reference: ${artistName || 'none'}. Use broad mood, genre, arrangement, and vocal energy only. Do not imitate or clone the exact artist voice, melody, lyrics, identity, or copyrighted song.`,
            `Selected arrangement: ${arrangementDescription || 'full-band studio arrangement'}.`,
            `Vocal choice: ${voice || 'Duet/Pair'}.`,
            `Creative controls: weirdness ${weirdness}%, style influence ${styleInfluence}%.`,
            'Create a prompt for a high-fidelity, radio-ready 2:50 to 3:30 full song with polished vocals, full instrumental production, clear hook, verse/chorus structure, and mastered mix. Make it perform the whole idea from start to final outro.',
          ].join('\n'),
        },
        {
          inlineData: {
            mimeType,
            data: audioBase64,
          },
        },
      ],
    }],
  } as any);

  return cleanPrompt(response.text || '');
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireFirebaseAuth(req);
    requirePersonalAccess(user);
    await enforceUserRateLimit(user, 'voice-analysis', 5);
    const {
      audioBase64,
      mimeType,
      idea,
      lyricsText,
      lyricsMode,
      instrumental,
      styleText,
      artistName,
      genreDescription,
      arrangementDescription,
      modelProfile,
      weirdness,
      styleInfluence,
      voice,
    } = req.body || {};

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'Voice audio is required.' });
    }

    if (audioBase64.length > 16_000_000) {
      return res.status(413).json({ error: 'Voice reference is too large. Keep it under 12 MB.' });
    }

    const safeMimeType = typeof mimeType === 'string' && mimeType.startsWith('audio/')
      ? mimeType.slice(0, 80)
      : 'audio/webm';

    const prompt = await analyzeVoiceReference({
      audioBase64,
      mimeType: safeMimeType,
      idea: typeof idea === 'string' ? idea.slice(0, 1000) : '',
      lyricsText: typeof lyricsText === 'string' ? lyricsText.slice(0, 2000) : '',
      lyricsMode: lyricsMode === 'auto' ? 'auto' : 'manual',
      instrumental: instrumental === true,
      styleText: typeof styleText === 'string' ? styleText.slice(0, 500) : '',
      artistName: typeof artistName === 'string' ? artistName.slice(0, 80) : '',
      genreDescription: typeof genreDescription === 'string' ? genreDescription.slice(0, 240) : 'modern pop',
      arrangementDescription: typeof arrangementDescription === 'string' ? arrangementDescription.slice(0, 500) : 'full-band studio arrangement',
      modelProfile: typeof modelProfile === 'string' ? modelProfile.slice(0, 300) : 'Taurus Apex L5 free-start profile with flagship vocal and studio master quality',
      weirdness: typeof weirdness === 'number' ? Math.max(0, Math.min(100, weirdness)) : 50,
      styleInfluence: typeof styleInfluence === 'number' ? Math.max(0, Math.min(100, styleInfluence)) : 50,
      voice: typeof voice === 'string' ? voice.slice(0, 120) : 'Duet/Pair',
    });

    if (!prompt) {
      throw new ApiError(502, 'VOICE_ANALYSIS_EMPTY', 'Voice analysis did not return a prompt.');
    }

    return res.status(200).json({ prompt, model: VOICE_MODEL });
  } catch (error: unknown) {
    return sendApiError(res, error, 'Analyze voice API failed');
  }
}
