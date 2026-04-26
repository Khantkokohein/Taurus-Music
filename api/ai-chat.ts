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

const generateChatReply = async ({
  sourceText,
  userName,
  languageHint,
  recentContext,
}: {
  sourceText: string;
  userName: string;
  languageHint: string;
  recentContext: string;
}) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    config: {
      systemInstruction: `You are Taurus AI inside a live music creation chat. Remember and address the user by name: ${userName}. Reply in ${languageHint}; if the user mixes languages, follow the user's dominant language. Reply concisely unless the user asks for lyrics. If the user asks to write a song or lyrics, provide usable song lyrics with verse and chorus sections. If the user asks about subscribe, payment, premium, pro, prime, or upgrade, explain that they can request a plan and wait for admin approval. Do not use abusive language.`,
    },
    contents: `Recent chat:\n${recentContext || 'No recent messages.'}\n\nCurrent message from ${userName}:\n${sourceText.replace(/@ai|@taurus/gi, '').trim()}`,
  });

  return response.text?.trim() || '';
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireFirebaseAuth(req);
    const { sourceText, userName, languageHint, recentContext } = req.body || {};
    if (!sourceText || typeof sourceText !== 'string') {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const reply = await generateChatReply({
      sourceText: sourceText.slice(0, 500),
      userName: typeof userName === 'string' && userName ? userName.slice(0, 80) : 'friend',
      languageHint: typeof languageHint === 'string' ? languageHint.slice(0, 40) : 'English',
      recentContext: typeof recentContext === 'string' ? recentContext.slice(0, 2000) : '',
    });

    return res.status(200).json({ reply });
  } catch (error: any) {
    console.error('AI chat API error:', error);
    const message = error?.message || 'Failed to generate chat reply.';
    const status = message.includes('login') || message.includes('session') ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
