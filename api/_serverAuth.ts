export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
}

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDjowhLt-pq5DKd-phnS1Hwx7tdRomJCNQ';

export const requireFirebaseAuth = async (req: any): Promise<VerifiedFirebaseUser> => {
  const authorization = req.headers?.authorization || req.headers?.Authorization || '';
  const idToken = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!idToken) {
    throw new Error('Please login again to use Taurus AI.');
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
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
