import { ApiError, sendApiError } from './_apiError.js';
import { requirePersonalAccess } from './_personalAccess.js';
import { enforceUserRateLimit } from './_rateLimit.js';
import { requireFirebaseAuth } from './_serverAuth.js';

const TEXT_MODEL = 'gemini-3-flash-preview';

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
    throw new ApiError(503, 'AI_CHAT_NOT_CONFIGURED', 'Taurus AI is temporarily unavailable.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    config: {
      systemInstruction: `You are Taurus AI inside a live music creation chat. Remember and address the user by name: ${userName}. Reply in ${languageHint}; if the user mixes languages, follow the user's dominant language. Reply concisely unless the user asks for lyrics. If the user asks to write a song, write a complete full song with Title, Style, Tempo/Mood, Intro, Verse 1, Pre-Chorus, Chorus, Verse 2, Bridge, Final Chorus, and Outro. Make lyrics fully singable, not a short sample. If the user asks about subscribe, payment, premium, pro, prime, or upgrade, explain that they can request a plan and wait for admin approval. Do not use abusive language.`,
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
    const user = await requireFirebaseAuth(req);
    requirePersonalAccess(user);
    await enforceUserRateLimit(user, 'ai-chat', 20);
    const { sourceText, userName, languageHint, recentContext } = req.body || {};
    if (!sourceText || typeof sourceText !== 'string') {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const reply = await generateChatReply({
      sourceText: sourceText.slice(0, 1000),
      userName: typeof userName === 'string' && userName ? userName.slice(0, 80) : 'friend',
      languageHint: typeof languageHint === 'string' ? languageHint.slice(0, 40) : 'English',
      recentContext: typeof recentContext === 'string' ? recentContext.slice(0, 2000) : '',
    });

    return res.status(200).json({ reply });
  } catch (error: unknown) {
    return sendApiError(res, error, 'AI chat API failed');
  }
}
