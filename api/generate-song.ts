export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { requireFirebaseAuth } = await import('../src/lib/serverAuth');
    const { generateSongAudio } = await import('../src/lib/gemini');

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
