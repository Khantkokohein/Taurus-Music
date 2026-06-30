import { ApiError, sendApiError } from './_apiError.js';
import { parseTrustedAudioUrl } from './_audioSource.js';
import { getAdminDb } from './_firebaseAdmin.js';
import { requirePersonalAccess } from './_personalAccess.js';
import { enforceUserRateLimit } from './_rateLimit.js';
import { requireFirebaseAuth } from './_serverAuth.js';

const AUDIO_TOOLS_URL = (process.env.AUDIO_TOOLS_URL || '').replace(/\/$/, '');
const AUDIO_TOOLS_SECRET = process.env.AUDIO_TOOLS_SECRET || '';
const OPERATIONS = new Set(['crop', 'fade', 'split', 'export', 'selected-range-export']);
const FORMATS = new Set(['mp3', 'wav']);
const SONG_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '16kb',
    },
  },
};

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
      throw new ApiError(503, 'AUDIO_EDITOR_NOT_CONFIGURED', 'Audio editing is temporarily unavailable.');
    }

    const user = await requireFirebaseAuth(req);
    requirePersonalAccess(user);
    await enforceUserRateLimit(user, 'audio-edit', 10);
    const body = req.body || {};
    const songId = String(body.songId || '').trim();
    const operation = String(body.operation || '').trim();
    const format = String(body.format || 'mp3').trim().toLowerCase();
    if (!SONG_ID_PATTERN.test(songId)) return res.status(400).json({ error: 'Invalid songId.' });
    if (!OPERATIONS.has(operation)) return res.status(400).json({ error: 'Invalid audio edit operation.' });
    if (!FORMATS.has(format)) return res.status(400).json({ error: 'Invalid export format.' });

    const db = getAdminDb();
    const songSnap = await db.collection('users').doc(user.uid).collection('songs').doc(songId).get();
    if (!songSnap.exists) return res.status(404).json({ error: 'Song not found.' });
    const song = songSnap.data() || {};
    const expectedStoragePrefix = `users/${user.uid}/songs/${songId}/`;
    if (
      song.userId !== user.uid
      || typeof song.storagePath !== 'string'
      || !song.storagePath.startsWith(expectedStoragePrefix)
    ) {
      throw new ApiError(403, 'SONG_OWNERSHIP_INVALID', 'This song cannot be edited.');
    }
    const audioUrl = parseTrustedAudioUrl(song.audioUrl).toString();

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
      throw new ApiError(502, 'AUDIO_EDITOR_FAILED', 'Audio processing failed. Please try again.');
    }

    return res.status(200).json(payload);
  } catch (error: unknown) {
    return sendApiError(res, error, 'Audio edit API failed');
  }
}
