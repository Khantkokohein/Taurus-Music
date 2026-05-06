import { getAdminDb } from './_firebaseAdmin.js';
import { requireFirebaseAuth } from './_serverAuth.js';

const AUDIO_TOOLS_URL = (process.env.AUDIO_TOOLS_URL || '').replace(/\/$/, '');
const AUDIO_TOOLS_SECRET = process.env.AUDIO_TOOLS_SECRET || '';
const OPERATIONS = new Set(['crop', 'fade', 'split', 'export', 'selected-range-export']);
const FORMATS = new Set(['mp3', 'wav']);

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!AUDIO_TOOLS_URL || !AUDIO_TOOLS_SECRET) {
      throw new Error('Audio editor service is not configured.');
    }

    const user = await requireFirebaseAuth(req);
    const body = req.body || {};
    const songId = String(body.songId || '').trim();
    const operation = String(body.operation || '').trim();
    const format = String(body.format || 'mp3').trim().toLowerCase();
    if (!songId) return res.status(400).json({ error: 'songId is required.' });
    if (!OPERATIONS.has(operation)) return res.status(400).json({ error: 'Invalid audio edit operation.' });
    if (!FORMATS.has(format)) return res.status(400).json({ error: 'Invalid export format.' });

    const db = getAdminDb();
    const songSnap = await db.collection('users').doc(user.uid).collection('songs').doc(songId).get();
    if (!songSnap.exists) return res.status(404).json({ error: 'Song not found.' });
    const song = songSnap.data() || {};
    const audioUrl = String(song.audioUrl || '');
    if (!audioUrl.startsWith('http')) return res.status(400).json({ error: 'Song audio URL is missing.' });

    const response = await fetch(`${AUDIO_TOOLS_URL}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-taurus-audio-secret': AUDIO_TOOLS_SECRET,
      },
      body: JSON.stringify({
        audioUrl,
        operation,
        format,
        start: toNumber(body.start),
        end: toNumber(body.end, 30),
        splitAt: toNumber(body.splitAt, 30),
        fadeIn: toNumber(body.fadeIn, 2),
        fadeOut: toNumber(body.fadeOut, 2),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Audio editor failed: ${response.status}`);
    }

    return res.status(200).json(payload);
  } catch (error: any) {
    const message = error?.message || 'Audio edit failed.';
    const status = message.includes('login') || message.includes('session') ? 401 : 500;
    if (status === 401) console.warn('Audio edit auth required:', message);
    else console.error('Audio edit API error:', error);
    return res.status(status).json({ error: message });
  }
}
