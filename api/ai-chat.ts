export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { requireFirebaseAuth } = await import('../src/lib/serverAuth');
    const { generateChatReply } = await import('../src/lib/gemini');

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
    return res.status(500).json({ error: error?.message || 'Failed to generate chat reply.' });
  }
}
