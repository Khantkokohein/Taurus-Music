import { GoogleGenAI } from '@google/genai';

const TEXT_MODEL = 'gemini-3-flash-preview';
const LYRIA_MODEL = 'lyria-3-pro-preview';
const VOICE_MODEL = process.env.GEMINI_VOICE_MODEL || 'gemini-2.5-flash';

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
  arrangementDescription,
  voice,
}: {
  prompt: string;
  genreDescription: string;
  arrangementDescription: string;
  voice: string;
}) => {
  const ai = getClient();
  const fullPrompt = [
    `Create a complete, fully arranged 90-second ${genreDescription} song as an MP3 with commercial AI music platform quality.`,
    `Theme: ${prompt}.`,
    `Vocal direction: ${voice}.`,
    `Arrangement must follow these selected sounds: ${arrangementDescription}.`,
    'Production must feel studio-recorded: polished lead vocal, tight timing, rich stereo instrumental, clear low end, balanced drums, strong hook, radio-ready loudness, and mastered final mix.',
    'Write and perform a full singable song, not a short sample. Include intro, verse 1, pre-chorus, chorus, verse 2, bridge, final chorus, and outro where musically possible.',
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

export const analyzeVoiceReference = async ({
  audioBase64,
  mimeType,
  idea,
  genreDescription,
  arrangementDescription,
  voice,
}: {
  audioBase64: string;
  mimeType: string;
  idea: string;
  genreDescription: string;
  arrangementDescription: string;
  voice: string;
}) => {
  const ai = getClient();
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
            `Target style: ${genreDescription || 'modern pop'}.`,
            `Selected arrangement: ${arrangementDescription || 'full-band studio arrangement'}.`,
            `Vocal choice: ${voice || 'Duet/Pair'}.`,
            'Create a prompt for a high-fidelity, radio-ready 90-second song with polished vocals, full instrumental production, clear hook, verse/chorus structure, and mastered mix.',
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

  return response.text?.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim() || '';
};
