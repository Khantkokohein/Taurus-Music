import { GoogleGenAI } from '@google/genai';

const TEXT_MODEL = 'gemini-3-flash-preview';
const LYRIA_MODEL = 'lyria-3-pro-preview';

const getGeminiApiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

const getClient = () => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({ apiKey });
};

export const optimizeMusicPrompt = async (idea: string) => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    config: {
      systemInstruction: 'You are a professional music producer. Expand music ideas into detailed prompts. Keep it under 200 chars. Return ONLY the enhanced prompt text.',
    },
    contents: idea,
  });

  return response.text?.replace(/^["']|["']$/g, '').trim() || '';
};

export const generateChatReply = async ({
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
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    config: {
      systemInstruction: `You are Taurus AI inside a live music creation chat. Remember and address the user by name: ${userName}. Reply in ${languageHint}; if the user mixes languages, follow the user's dominant language. Reply concisely unless the user asks for lyrics. If the user asks to write a song or lyrics, provide usable song lyrics with verse and chorus sections. If the user asks about subscribe, payment, premium, pro, prime, or upgrade, explain that they can request a plan and wait for admin approval. Do not use abusive language.`,
    },
    contents: `Recent chat:\n${recentContext || 'No recent messages.'}\n\nCurrent message from ${userName}:\n${sourceText.replace(/@ai|@taurus/gi, '').trim()}`,
  });

  return response.text?.trim() || '';
};

export const generateSongAudio = async ({
  prompt,
  genreDescription,
  voice,
}: {
  prompt: string;
  genreDescription: string;
  voice: string;
}) => {
  const ai = getClient();
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
