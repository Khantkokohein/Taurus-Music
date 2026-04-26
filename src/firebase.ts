import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, query, orderBy, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export interface UserProfile {
  uid: string;
  email: string;
  dailyGenerationCount: number;
  lastGenerationDate: string; // ISO Date YYYY-MM-DD
  credits: number;
  tier: 'free' | 'pro' | 'prime' | 'premium';
  pendingPayment?: boolean;
  role: 'user' | 'admin';
  weeklyLimit: number;
  songsUsedThisWeek: number;
  lastRefillDate: string; // ISO Date YYYY-MM-DD
  chatBannedUntil?: Timestamp;
  chatBanReason?: string;
  chatBannedAt?: Timestamp;
  chatLastViolation?: string;
  chatBanCount?: number;
}

export interface Song {
  id: string;
  userId: string;
  idea: string;
  prompt: string;
  audioUrl: string;
  storagePath?: string;
  mimeType?: string;
  lyrics: string;
  createdAt: any;
}

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (userDoc.exists()) {
    return userDoc.data() as UserProfile;
  }
  return null;
};

export const createUserProfile = async (uid: string, email: string) => {
  const userRef = doc(db, 'users', uid);
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  const profile: UserProfile = {
    uid,
    email,
    dailyGenerationCount: 0,
    lastGenerationDate: today,
    credits: 0,
    tier: 'free',
    role: email === 'koheinkhantko51@gmail.com' ? 'admin' : 'user',
    weeklyLimit: 0,
    songsUsedThisWeek: 0,
    lastRefillDate: today
  };
  await setDoc(userRef, profile);
  return profile;
};

export const approvePayment = async (userId: string, tierId: string) => {
  const tierConfig = {
    pro: { limit: 20, tier: 'pro' as const },
    prime: { limit: 50, tier: 'prime' as const },
    premium: { limit: 200, tier: 'premium' as const }
  }[tierId as 'pro' | 'prime' | 'premium'];

  if (!tierConfig) return;

  const userRef = doc(db, 'users', userId);
  const today = new Date().toISOString().split('T')[0];
  
  await updateDoc(userRef, {
    tier: tierConfig.tier,
    weeklyLimit: tierConfig.limit,
    songsUsedThisWeek: 0,
    lastRefillDate: today,
    pendingPayment: false
  });
};

export const requestManualPayment = async (uid: string) => {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, { pendingPayment: true });
};

export const checkAndUpdateUsage = async (uid: string): Promise<{ allowed: boolean; mode: 'free' | 'tier'; remaining: number }> => {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) return { allowed: false, mode: 'free', remaining: 0 };
  
  const data = userSnap.data() as UserProfile;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // Weekly Refill Logic for Tier users
  if (data.tier !== 'free') {
    // Ensure fields exist for old accounts
    const weeklyLimit = data.weeklyLimit || (data.tier === 'premium' ? 200 : data.tier === 'prime' ? 50 : 20);
    const songsUsedThisWeek = data.songsUsedThisWeek || 0;

    const refillDateString = data.lastRefillDate || '2000-01-01';
    const refillDate = new Date(refillDateString);
    const diffTime = Math.abs(now.getTime() - refillDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 7) {
      // It's been a week or more, refill
      await updateDoc(userRef, {
        songsUsedThisWeek: 1,
        lastRefillDate: today,
        weeklyLimit: weeklyLimit // Sync the field if it was missing
      });
      return { allowed: true, mode: 'tier', remaining: weeklyLimit - 1 };
    }

    if (songsUsedThisWeek < weeklyLimit) {
      await updateDoc(userRef, {
        songsUsedThisWeek: increment(1),
        weeklyLimit: weeklyLimit // Sync the field if it was missing
      });
      return { allowed: true, mode: 'tier', remaining: weeklyLimit - (songsUsedThisWeek + 1) };
    }
  }

  // Daily Free Logic (also available to paid users if they use it up? No, usually separate)
  // Let's keep the 2/day free as a fallback or base
  if (data.lastGenerationDate !== today) {
    await updateDoc(userRef, {
      dailyGenerationCount: 1,
      lastGenerationDate: today
    });
    return { allowed: true, mode: 'free', remaining: 1 };
  }
  
  if (data.dailyGenerationCount < 2) {
    await updateDoc(userRef, {
      dailyGenerationCount: increment(1)
    });
    return { allowed: true, mode: 'free', remaining: 1 - data.dailyGenerationCount };
  }
  
  return { allowed: false, mode: 'free', remaining: 0 };
};

export const saveSong = async (userId: string, song: Omit<Song, 'userId' | 'createdAt'>) => {
  const songRef = doc(db, 'users', userId, 'songs', song.id);
  const fullSong: Song = {
    ...song,
    userId,
    createdAt: serverTimestamp()
  };
  await setDoc(songRef, fullSong);
  return fullSong;
};

export const manualUpdateUser = async (userId: string, data: Partial<UserProfile>) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, data);
};

export const uploadSongAudio = async (userId: string, songId: string, blob: Blob) => {
  const contentType = blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'audio/mpeg';
  const extension = contentType.includes('wav') ? 'wav' : contentType.includes('ogg') ? 'ogg' : 'mp3';
  const storagePath = `users/${userId}/songs/${songId}/audio.${extension}`;
  const audioRef = ref(storage, storagePath);

  await uploadBytes(audioRef, blob, {
    contentType,
    customMetadata: {
      userId,
      songId,
    },
  });

  return {
    audioUrl: await getDownloadURL(audioRef),
    storagePath,
    mimeType: contentType,
  };
};
