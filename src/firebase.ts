import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, runTransaction } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const DAILY_POINT_GRANT = 10;
export const SONG_POINT_COST = 100;
export const CHAT_BAN_THRESHOLD = 3;
export const CHAT_BAN_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const LYRIA_SONG_API_COST_USD = 0.08;

export type UserTier = 'free' | 'personal' | 'pro' | 'prime' | 'premium';

export type PlanConfig = {
  id: UserTier;
  name: string;
  price: number;
  weeklyLimit: number;
  monthlyLimit: number;
  weeklyApiCost: number;
  monthlyApiCost: number;
  monthlyGrossMargin: number;
};

const createPlan = (id: UserTier, name: string, price: number, weeklyLimit: number, monthlyLimit: number): PlanConfig => ({
  id,
  name,
  price,
  weeklyLimit,
  monthlyLimit,
  weeklyApiCost: weeklyLimit * LYRIA_SONG_API_COST_USD,
  monthlyApiCost: monthlyLimit * LYRIA_SONG_API_COST_USD,
  monthlyGrossMargin: price - (monthlyLimit * LYRIA_SONG_API_COST_USD),
});

const createPaidPlan = (id: UserTier, name: string, price: number): PlanConfig => {
  const monthlyLimit = Math.floor((price * 0.8) / LYRIA_SONG_API_COST_USD);
  return createPlan(id, name, price, Math.ceil(monthlyLimit / 4), monthlyLimit);
};

export const PLAN_CONFIGS: Record<UserTier, PlanConfig> = {
  free: createPlan('free', 'Free', 0, 2, 8),
  personal: createPaidPlan('personal', 'Personal', 5),
  pro: createPaidPlan('pro', 'Pro', 15),
  prime: createPaidPlan('prime', 'Prime', 40),
  premium: createPaidPlan('premium', 'Premium', 200),
};

export const getPlanConfig = (tier?: string | null) => (
  PLAN_CONFIGS[(tier as UserTier) || 'free'] || PLAN_CONFIGS.free
);

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  dailyGenerationCount: number;
  lastGenerationDate: string; // ISO Date YYYY-MM-DD
  credits: number;
  points: number;
  lastPointGrantDate: string; // ISO Date YYYY-MM-DD
  totalPointsEarned: number;
  tier: UserTier;
  requestedTier?: UserTier | null;
  pendingPayment?: boolean;
  paymentStatus?: 'pending' | 'approved' | 'rejected' | null;
  paymentProofUrl?: string;
  paymentProofPath?: string;
  paymentProofName?: string;
  paymentSubmittedAt?: Timestamp;
  paymentApprovedAt?: Timestamp;
  paymentRejectedAt?: Timestamp;
  paymentRejectReason?: string;
  role: 'user' | 'admin';
  weeklyLimit: number;
  songsUsedThisWeek: number;
  lastRefillDate: string; // ISO Date YYYY-MM-DD
  monthlyLimit: number;
  songsUsedThisMonth: number;
  lastMonthlyRefillDate: string; // ISO Month YYYY-MM
  chatBannedUntil?: Timestamp;
  chatBanReason?: string;
  chatBannedAt?: Timestamp;
  chatLastViolation?: string;
  chatLastViolationAt?: Timestamp;
  chatBanCount?: number;
  chatViolationCount?: number;
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

const getTodayKey = () => new Date().toISOString().split('T')[0];
const getMonthKey = () => new Date().toISOString().slice(0, 7);

export const getBanUntilMillis = (profile?: Pick<UserProfile, 'chatBannedUntil'> | null) => (
  profile?.chatBannedUntil?.toMillis ? profile.chatBannedUntil.toMillis() : 0
);

export const isUserBanned = (profile?: Pick<UserProfile, 'chatBannedUntil'> | null) => (
  getBanUntilMillis(profile) > Date.now()
);

export const createUserProfile = async (uid: string, email: string, displayName = '') => {
  const userRef = doc(db, 'users', uid);
  const today = getTodayKey();
  const month = getMonthKey();
  const freePlan = PLAN_CONFIGS.free;
  
  const profile: UserProfile = {
    uid,
    email,
    displayName,
    dailyGenerationCount: 0,
    lastGenerationDate: today,
    credits: 0,
    points: DAILY_POINT_GRANT,
    lastPointGrantDate: today,
    totalPointsEarned: DAILY_POINT_GRANT,
    tier: 'free',
    role: email === 'koheinkhantko51@gmail.com' ? 'admin' : 'user',
    weeklyLimit: freePlan.weeklyLimit,
    songsUsedThisWeek: 0,
    lastRefillDate: today,
    monthlyLimit: freePlan.monthlyLimit,
    songsUsedThisMonth: 0,
    lastMonthlyRefillDate: month,
    chatViolationCount: 0,
    chatBanCount: 0
  };
  await setDoc(userRef, profile);
  return profile;
};

export const claimDailyPointsIfNeeded = async (uid: string, displayName = '') => {
  const userRef = doc(db, 'users', uid);
  const today = getTodayKey();
  const month = getMonthKey();

  return runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) return null;

    const data = userSnap.data() as UserProfile;
    const updates: Partial<UserProfile> = {};
    const plan = getPlanConfig(data.tier);
    let dailyRewardClaimed = false;

    if (!data.displayName && displayName) {
      updates.displayName = displayName;
    }

    if (data.lastPointGrantDate !== today) {
      updates.points = (data.points || 0) + DAILY_POINT_GRANT;
      updates.lastPointGrantDate = today;
      updates.totalPointsEarned = (data.totalPointsEarned || 0) + DAILY_POINT_GRANT;
      dailyRewardClaimed = true;
    }

    if (data.weeklyLimit !== plan.weeklyLimit) {
      updates.weeklyLimit = plan.weeklyLimit;
    }

    if (data.monthlyLimit !== plan.monthlyLimit) {
      updates.monthlyLimit = plan.monthlyLimit;
    }

    if (typeof data.songsUsedThisMonth !== 'number') {
      updates.songsUsedThisMonth = 0;
    }

    if (!data.lastMonthlyRefillDate) {
      updates.lastMonthlyRefillDate = month;
    }

    if (Object.keys(updates).length > 0) {
      transaction.update(userRef, updates);
    }

    return {
      ...data,
      ...updates,
      dailyRewardClaimed,
    } as UserProfile & { dailyRewardClaimed: boolean };
  });
};

export const approvePayment = async (userId: string, tierId: string) => {
  const tierConfig = PLAN_CONFIGS[tierId as UserTier];

  if (!tierConfig) return;

  const userRef = doc(db, 'users', userId);
  const today = getTodayKey();
  
  await updateDoc(userRef, {
    tier: tierConfig.id,
    weeklyLimit: tierConfig.weeklyLimit,
    monthlyLimit: tierConfig.monthlyLimit,
    songsUsedThisWeek: 0,
    songsUsedThisMonth: 0,
    lastRefillDate: today,
    lastMonthlyRefillDate: getMonthKey(),
    pendingPayment: false,
    paymentStatus: 'approved',
    paymentApprovedAt: serverTimestamp(),
    paymentRejectedAt: null,
    paymentRejectReason: '',
    requestedTier: null
  });
};

export const requestManualPayment = async (
  uid: string,
  requestedTier: UserTier = 'personal',
  proof?: { url: string; path: string; name: string }
) => {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    pendingPayment: true,
    requestedTier,
    paymentStatus: 'pending',
    paymentSubmittedAt: serverTimestamp(),
    paymentRejectedAt: null,
    paymentRejectReason: '',
    ...(proof ? {
      paymentProofUrl: proof.url,
      paymentProofPath: proof.path,
      paymentProofName: proof.name,
    } : {}),
  });
};

export const rejectPayment = async (userId: string, reason = 'Rejected by admin') => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    pendingPayment: false,
    requestedTier: null,
    paymentStatus: 'rejected',
    paymentRejectedAt: serverTimestamp(),
    paymentRejectReason: reason,
  });
};

export type GenerationUsageResult = {
  allowed: boolean;
  mode: 'points' | 'tier' | 'banned';
  remaining: number;
  weeklyRemaining?: number;
  monthlyRemaining?: number;
};

const getDaysSince = (dateString?: string) => {
  const now = new Date();
  const refillDate = new Date(dateString || '2000-01-01');
  const diffTime = Math.abs(now.getTime() - refillDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getQuotaState = (data: UserProfile) => {
  const plan = getPlanConfig(data.tier);
  const resetWeekly = getDaysSince(data.lastRefillDate) >= 7;
  const resetMonthly = data.lastMonthlyRefillDate !== getMonthKey();
  const weeklyLimit = plan.weeklyLimit;
  const monthlyLimit = plan.monthlyLimit;
  const songsUsedThisWeek = resetWeekly ? 0 : (data.songsUsedThisWeek || 0);
  const songsUsedThisMonth = resetMonthly ? 0 : (data.songsUsedThisMonth || 0);
  const weeklyRemaining = Math.max(weeklyLimit - songsUsedThisWeek, 0);
  const monthlyRemaining = Math.max(monthlyLimit - songsUsedThisMonth, 0);

  return {
    plan,
    weeklyLimit,
    monthlyLimit,
    songsUsedThisWeek,
    songsUsedThisMonth,
    resetWeekly,
    resetMonthly,
    weeklyRemaining,
    monthlyRemaining,
    remaining: Math.min(weeklyRemaining, monthlyRemaining),
  };
};

export const checkGenerationAccess = async (uid: string): Promise<GenerationUsageResult> => {
  const userRef = doc(db, 'users', uid);
  await claimDailyPointsIfNeeded(uid);
  
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return { allowed: false, mode: 'points', remaining: 0 };
  
  const data = userSnap.data() as UserProfile;
  if (isUserBanned(data)) return { allowed: false, mode: 'banned', remaining: 0 };

  const quota = getQuotaState(data);
  if (quota.resetWeekly || quota.resetMonthly || data.weeklyLimit !== quota.weeklyLimit || data.monthlyLimit !== quota.monthlyLimit) {
    await updateDoc(userRef, {
      weeklyLimit: quota.weeklyLimit,
      monthlyLimit: quota.monthlyLimit,
      songsUsedThisWeek: quota.songsUsedThisWeek,
      songsUsedThisMonth: quota.songsUsedThisMonth,
      lastRefillDate: quota.resetWeekly ? getTodayKey() : (data.lastRefillDate || getTodayKey()),
      lastMonthlyRefillDate: quota.resetMonthly ? getMonthKey() : (data.lastMonthlyRefillDate || getMonthKey()),
    });
  }

  return {
    allowed: quota.remaining > 0,
    mode: 'tier',
    remaining: quota.remaining,
    weeklyRemaining: quota.weeklyRemaining,
    monthlyRemaining: quota.monthlyRemaining,
  };
};

export const consumeGenerationCredit = async (uid: string): Promise<GenerationUsageResult> => {
  const userRef = doc(db, 'users', uid);
  const today = getTodayKey();

  return runTransaction(db, async (transaction) => {
    const freshSnap = await transaction.get(userRef);
    if (!freshSnap.exists()) return { allowed: false, mode: 'points' as const, remaining: 0 };

    const data = freshSnap.data() as UserProfile;
    if (isUserBanned(data)) return { allowed: false, mode: 'banned' as const, remaining: 0 };

    const quota = getQuotaState(data);
    if (quota.remaining <= 0) {
      return {
        allowed: false,
        mode: 'tier' as const,
        remaining: 0,
        weeklyRemaining: quota.weeklyRemaining,
        monthlyRemaining: quota.monthlyRemaining,
      };
    }

    const nextWeeklyUsed = quota.songsUsedThisWeek + 1;
    const nextMonthlyUsed = quota.songsUsedThisMonth + 1;
    const weeklyRemaining = Math.max(quota.weeklyLimit - nextWeeklyUsed, 0);
    const monthlyRemaining = Math.max(quota.monthlyLimit - nextMonthlyUsed, 0);
    const remaining = Math.min(weeklyRemaining, monthlyRemaining);

    transaction.update(userRef, {
      weeklyLimit: quota.weeklyLimit,
      monthlyLimit: quota.monthlyLimit,
      songsUsedThisWeek: nextWeeklyUsed,
      songsUsedThisMonth: nextMonthlyUsed,
      lastRefillDate: quota.resetWeekly ? today : (data.lastRefillDate || today),
      lastMonthlyRefillDate: quota.resetMonthly ? getMonthKey() : (data.lastMonthlyRefillDate || getMonthKey()),
    });

    return {
      allowed: true,
      mode: 'tier' as const,
      remaining,
      weeklyRemaining,
      monthlyRemaining,
    };
  });
};

export const checkAndUpdateUsage = consumeGenerationCredit;

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

export const unbanUser = async (userId: string) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    chatBannedUntil: null,
    chatBanReason: '',
    chatBannedAt: null,
    chatLastViolation: '',
    chatLastViolationAt: null,
    chatViolationCount: 0,
  });
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

export const uploadPaymentProof = async (userId: string, file: File) => {
  const contentType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'payment-proof.jpg';
  const proofId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `users/${userId}/payment-proofs/${proofId}-${safeName}`;
  const proofRef = ref(storage, storagePath);

  await uploadBytes(proofRef, file, {
    contentType,
    customMetadata: {
      userId,
      originalName: file.name,
    },
  });

  return {
    url: await getDownloadURL(proofRef),
    path: storagePath,
    name: file.name,
  };
};
