const TEXT_MODEL = 'gemini-3-flash-preview';
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

const optimizeMusicPrompt = async (idea: string) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    config: {
      systemInstruction: 'You are a professional music producer. Expand music ideas into complete song generation prompts. Include full song structure, arrangement, vocal mood, and mix direction. Keep it under 500 chars. Return ONLY the enhanced prompt text.',
    },
    contents: idea,
  });

  return response.text?.replace(/^["']|["']$/g, '').trim() || '';
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireFirebaseAuth(req);
    const { idea } = req.body || {};
    if (!idea || typeof idea !== 'string') {
      return res.status(400).json({ error: 'Idea is required.' });
    }

    const prompt = await optimizeMusicPrompt(idea.slice(0, 1000));
    return res.status(200).json({ prompt });
  } catch (error: any) {
    console.error('Optimize prompt API error:', error);
    const message = error?.message || 'Failed to enhance prompt.';
    const status = message.includes('login') || message.includes('session') ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
