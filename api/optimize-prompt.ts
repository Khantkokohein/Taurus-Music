export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { requireFirebaseAuth } = await import('../src/lib/serverAuth');
    const { optimizeMusicPrompt } = await import('../src/lib/gemini');

    await requireFirebaseAuth(req);
    const { idea } = req.body || {};
    if (!idea || typeof idea !== 'string') {
      return res.status(400).json({ error: 'Idea is required.' });
    }

    const prompt = await optimizeMusicPrompt(idea.slice(0, 1000));
    return res.status(200).json({ prompt });
  } catch (error: any) {
    console.error('Optimize prompt API error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to enhance prompt.' });
  }
}
