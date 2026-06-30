import { ApiError } from './_apiError.js';
import { adminTimestamp, getAdminDb } from './_firebaseAdmin.js';
import type { VerifiedFirebaseUser } from './_serverAuth.js';

const WINDOW_MS = 60_000;
const SAFE_BUCKET = /^[a-z0-9-]{1,40}$/;

const timestampMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  return 0;
};

export const enforceUserRateLimit = async (
  user: VerifiedFirebaseUser,
  bucket: string,
  limitPerMinute: number,
  now = Date.now(),
) => {
  if (!SAFE_BUCKET.test(bucket)) {
    throw new ApiError(500, 'RATE_LIMIT_CONFIG_INVALID', 'The request could not be completed.', false);
  }

  const safeLimit = Math.max(1, Math.min(user.admin ? Math.max(limitPerMinute, 60) : limitPerMinute, 120));
  const ref = getAdminDb()
    .collection('users')
    .doc(user.uid)
    .collection('security')
    .doc(`rate-${bucket}`);

  await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    const startedAt = timestampMillis(data.windowStartedAt);
    const sameWindow = startedAt > 0 && now - startedAt < WINDOW_MS;
    const count = sameWindow ? Math.max(Number(data.requestCount || 0), 0) : 0;
    if (count >= safeLimit) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please wait and try again.');
    }
    transaction.set(ref, {
      windowStartedAt: adminTimestamp.fromMillis(sameWindow ? startedAt : now),
      requestCount: count + 1,
      updatedAt: adminTimestamp.fromMillis(now),
    });
  });
};
