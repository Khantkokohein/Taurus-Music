import { ApiError } from './_apiError.js';
import type { VerifiedFirebaseUser } from './_serverAuth.js';

const UID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

const getAllowedUids = () => new Set(
  String(process.env.PERSONAL_ALLOWED_UIDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => UID_PATTERN.test(value)),
);

export const isPersonalMode = () => process.env.APP_MODE === 'personal';

export const isPersonalAccessUser = (uid: string) => (
  isPersonalMode() && getAllowedUids().has(uid)
);

export const requirePersonalAccess = (user: VerifiedFirebaseUser) => {
  if (!isPersonalMode()) return;
  const allowedUids = getAllowedUids();
  if (allowedUids.size === 0) {
    throw new ApiError(
      503,
      'PERSONAL_ACCESS_NOT_CONFIGURED',
      'Personal access is not configured.',
    );
  }
  if (!allowedUids.has(user.uid)) {
    throw new ApiError(
      403,
      'PERSONAL_ACCESS_REQUIRED',
      'This preview is restricted to its owner.',
    );
  }
};
