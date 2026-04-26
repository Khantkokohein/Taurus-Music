const LYRIA_MODEL = 'lyria-3-pro-preview';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAg7tK7sGW6FYssUMCQzUizfgCPeJJ-4qo';

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
  voice,
}: {
  prompt: string;
  genreDescription: string;
  voice: string;
}) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const fullPrompt = [
    `Create a polished 90-second ${genreDescription} song as an MP3.`,
    `Theme: ${prompt}.`,
    `Vocal direction: ${voice}.`,
    'Include a clear intro, verse, chorus, and outro. Return the generated lyrics or structure text and the MP3 audio.',
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
    const { prompt, genreDescription, voice } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const result = await generateSongAudio({
      prompt: prompt.slice(0, 1200),
      genreDescription: typeof genreDescription === 'string' ? genreDescription.slice(0, 240) : 'modern pop',
      voice: typeof voice === 'string' ? voice.slice(0, 120) : 'Duet/Pair',
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Generate song API error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to generate song.' });
  }
}
