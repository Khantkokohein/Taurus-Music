import firebaseConfig from '../../firebase-applet-config.json';

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
}

export const requireFirebaseAuth = async (req: any): Promise<VerifiedFirebaseUser> => {
  const authorization = req.headers?.authorization || req.headers?.Authorization || '';
  const idToken = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!idToken) {
    throw new Error('Please login again to use Taurus AI.');
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.users?.[0]?.localId) {
    throw new Error('Login session expired. Please sign in again.');
  }

  return {
    uid: payload.users[0].localId,
    email: payload.users[0].email,
  };
};
