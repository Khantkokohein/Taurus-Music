import { ApiError } from './_apiError.js';
import { getAdminAuth } from './_firebaseAdmin.js';

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  admin: boolean;
}

export const requireFirebaseAuth = async (req: any): Promise<VerifiedFirebaseUser> => {
  const authorization = req.headers?.authorization || req.headers?.Authorization || '';
  const idToken = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!idToken) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    return {
      uid: decoded.uid,
      email: decoded.email,
      admin: decoded.admin === true,
    };
  } catch {
    throw new ApiError(401, 'AUTH_INVALID', 'Login session expired. Please sign in again.');
  }
};
