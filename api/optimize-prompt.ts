import { ApiError, sendApiError } from './_apiError.js';
import { enforceUserRateLimit } from './_rateLimit.js';
import { requireFirebaseAuth } from './_serverAuth.js';

const TEXT_MODEL = 'gemini-3-flash-preview';

const optimizeMusicPrompt = async (idea: string) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) {
    throw new ApiError(503, 'PROMPT_OPTIMIZER_NOT_CONFIGURED', 'Prompt optimization is temporarily unavailable.');
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
    const user = await requireFirebaseAuth(req);
    await enforceUserRateLimit(user, 'prompt-optimizer', 10);
    const { idea } = req.body || {};
    if (!idea || typeof idea !== 'string') {
      return res.status(400).json({ error: 'Idea is required.' });
    }

    const prompt = await optimizeMusicPrompt(idea.slice(0, 1000));
    return res.status(200).json({ prompt });
  } catch (error: unknown) {
    return sendApiError(res, error, 'Optimize prompt API failed');
  }
}
