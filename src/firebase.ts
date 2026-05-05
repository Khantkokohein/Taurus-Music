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

export const FREE_STARTER_CREDITS = 10;
export const FREE_DAILY_CREDIT_CAP = 5;
export const PREMIUM_MONTHLY_CREDITS = 150;
export const GENERATE_TWO_SONGS_COST = 2;
export const CHAT_BAN_THRESHOLD = 3;
export const CHAT_BAN_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const LYRIA_SONG_API_COST_USD = 0.08;
export const OWNER_EMAIL = 'koheinkhantko51@gmail.com';
export const UNLIMITED_REMAINING = Number.MAX_SAFE_INTEGER;
export const TAURUS_COIN_PER_USDT = 100;
export const SONG_CREDIT_COST = 100;
export const DEFAULT_API_RATE_LIMIT_PER_MINUTE = 60;

export const isOwnerEmail = (email?: string | null) => (
  (email || '').trim().toLowerCase() === OWNER_EMAIL
);

export const isOwnerProfile = (profile?: { email?: string | null } | null) => (
  isOwnerEmail(profile?.email)
);

export const buildTaurusAccountCode = (uid: string) => {
  let hash = 0;
  for (let index = 0; index < uid.length; index += 1) {
    hash = ((hash << 5) - hash + uid.charCodeAt(index)) >>> 0;
  }
  return `TRS-${hash.toString(36).toUpperCase().padStart(7, '0').slice(0, 7)}`;
};

export type UserTier = 'free' | 'personal' | 'pro' | 'prime' | 'premium';

export type PlanConfig = {
  id: UserTier;
  name: string;
  price: number;
  durationDays: number;
  durationLabel: string;
  weeklyLimit: number;
  monthlyLimit: number;
  weeklyApiCost: number;
  monthlyApiCost: number;
  monthlyGrossMargin: number;
};

const createPlan = (
  id: UserTier,
  name: string,
  price: number,
  weeklyLimit: number,
  monthlyLimit: number,
  durationDays = 0,
  durationLabel = 'Free'
): PlanConfig => ({
  id,
  name,
  price,
  durationDays,
  durationLabel,
  weeklyLimit,
  monthlyLimit,
  weeklyApiCost: weeklyLimit * LYRIA_SONG_API_COST_USD,
  monthlyApiCost: monthlyLimit * LYRIA_SONG_API_COST_USD,
  monthlyGrossMargin: price - (monthlyLimit * LYRIA_SONG_API_COST_USD),
});

export const PLAN_CONFIGS: Record<UserTier, PlanConfig> = {
  free: createPlan('free', 'Free Starter', 0, FREE_DAILY_CREDIT_CAP, FREE_STARTER_CREDITS),
  personal: createPlan('personal', 'Top Up 50', 3.75, 50, 50, 0, 'Credits top-up'),
  pro: createPlan('pro', 'Top Up 100', 6.75, 100, 100, 0, 'Credits top-up'),
  prime: createPlan('prime', 'Top Up 300', 17.25, 300, 300, 0, 'Credits top-up'),
  premium: createPlan('premium', 'Premium', 12.25, PREMIUM_MONTHLY_CREDITS, PREMIUM_MONTHLY_CREDITS, 30, '1 month'),
};

export const getPlanConfig = (tier?: string | null) => (
  PLAN_CONFIGS[(tier as UserTier) || 'free'] || PLAN_CONFIGS.free
);

export const getTimestampMillis = (timestamp?: Pick<Timestamp, 'toMillis'> | null) => (
  timestamp?.toMillis ? timestamp.toMillis() : 0
);

export const isSubscriptionExpired = (profile?: Pick<UserProfile, 'tier' | 'subscriptionExpiresAt'> | null) => {
  const expiresAt = getTimestampMillis(profile?.subscriptionExpiresAt);
  return !!profile && profile.tier !== 'free' && expiresAt > 0 && expiresAt <= Date.now();
};

export const getEffectivePlanConfig = (profile?: Pick<UserProfile, 'tier' | 'subscriptionExpiresAt'> | null) => (
  getPlanConfig(isSubscriptionExpired(profile) ? 'free' : profile?.tier)
);

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  taurusId?: string;
  taurusNumber?: string;
  taurusCoinBalance?: number;
  songCreditBalance?: number;
  apiAccessEnabled?: boolean;
  dailyGenerationCount: number;
  lastGenerationDate: string;
  credits: number;
  points: number;
  lastPointGrantDate: string;
  totalPointsEarned: number;
  tier: UserTier;
  requestedTier?: UserTier | null;
  pendingPayment?: boolean;
  paymentStatus?: 'pending' | 'approved' | 'rejected' | 'expired' | null;
  paymentProofUrl?: string;
  paymentProofPath?: string;
  paymentProofName?: string;
  paymentSubmittedAt?: Timestamp;
  paymentApprovedAt?: Timestamp;
  paymentRejectedAt?: Timestamp;
  paymentRejectReason?: string;
  subscriptionStartedAt?: Timestamp | null;
  subscriptionExpiresAt?: Timestamp | null;
  subscriptionDurationDays?: number;
  subscriptionDurationLabel?: string;
  subscriptionPlanName?: string;
  role: 'user' | 'admin';
  weeklyLimit: number;
  songsUsedThisWeek: number;
  lastRefillDate: string;
  monthlyLimit: number;
  songsUsedThisMonth: number;
  lastMonthlyRefillDate: string;
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
  return userDoc.exists() ? userDoc.data() as UserProfile : null;
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
  const taurusId = buildTaurusAccountCode(uid);
  const profile: UserProfile = {
    uid,
    email,
    displayName,
    taurusId,
    taurusNumber: taurusId,
    taurusCoinBalance: 0,
    songCreditBalance: 0,
    apiAccessEnabled: true,
    dailyGenerationCount: 0,
    lastGenerationDate: today,
    credits: 0,
    points: FREE_STARTER_CREDITS,
    lastPointGrantDate: today,
    totalPointsEarned: FREE_STARTER_CREDITS,
    tier: 'free',
    role: isOwnerEmail(email) ? 'admin' : 'user',
    weeklyLimit: freePlan.weeklyLimit,
    songsUsedThisWeek: 0,
    lastRefillDate: today,
    monthlyLimit: freePlan.monthlyLimit,
    songsUsedThisMonth: 0,
    lastMonthlyRefillDate: month,
    chatViolationCount: 0,
    chatBanCount: 0,
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
    const plan = getEffectivePlanConfig(data);
    const updates: Partial<UserProfile> = {};
    if (!data.displayName && displayName) updates.displayName = displayName;
    if (!data.taurusId) {
      updates.taurusId = buildTaurusAccountCode(uid);
      updates.taurusNumber = updates.taurusId;
    }
    if (typeof data.taurusCoinBalance !== 'number') updates.taurusCoinBalance = 0;
    if (typeof data.songCreditBalance !== 'number') updates.songCreditBalance = 0;
    if (typeof data.apiAccessEnabled !== 'boolean') updates.apiAccessEnabled = true;
    if (!data.lastPointGrantDate) updates.lastPointGrantDate = today;
    if (typeof data.points !== 'number') updates.points = FREE_STARTER_CREDITS;
    if (typeof data.totalPointsEarned !== 'number') updates.totalPointsEarned = FREE_STARTER_CREDITS;
    if (data.weeklyLimit !== plan.weeklyLimit) updates.weeklyLimit = plan.weeklyLimit;
    if (data.monthlyLimit !== plan.monthlyLimit) updates.monthlyLimit = plan.monthlyLimit;
    if (typeof data.dailyGenerationCount !== 'number' || data.lastGenerationDate !== today) {
      updates.dailyGenerationCount = data.lastGenerationDate === today ? (data.dailyGenerationCount || 0) : 0;
      updates.lastGenerationDate = today;
    }
    if (typeof data.songsUsedThisMonth !== 'number' || data.lastMonthlyRefillDate !== month) {
      updates.songsUsedThisMonth = data.lastMonthlyRefillDate === month ? (data.songsUsedThisMonth || 0) : 0;
      updates.lastMonthlyRefillDate = month;
    }
    if (Object.keys(updates).length > 0) transaction.update(userRef, updates);
    return { ...data, ...updates, dailyRewardClaimed: false } as UserProfile & { dailyRewardClaimed: boolean };
  });
};

export const approvePayment = async (userId: string, tierId: string) => {
  const tierConfig = PLAN_CONFIGS[tierId as UserTier];
  if (!tierConfig) return;
  const userRef = doc(db, 'users', userId);
  const today = getTodayKey();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(tierConfig.durationDays, 30) * 24 * 60 * 60 * 1000);
  const isTopUp = tierConfig.durationDays === 0;
  const current = await getDoc(userRef);
  const currentData = current.exists() ? current.data() as UserProfile : null;
  await updateDoc(userRef, {
    tier: isTopUp ? (currentData?.tier || 'free') : tierConfig.id,
    weeklyLimit: isTopUp ? (currentData?.weeklyLimit || PLAN_CONFIGS.free.weeklyLimit) : tierConfig.weeklyLimit,
    monthlyLimit: isTopUp ? ((currentData?.monthlyLimit || 0) + tierConfig.monthlyLimit) : tierConfig.monthlyLimit,
    songsUsedThisWeek: currentData?.songsUsedThisWeek || 0,
    songsUsedThisMonth: currentData?.songsUsedThisMonth || 0,
    points: (currentData?.points || 0) + (isTopUp ? tierConfig.monthlyLimit : 0),
    lastRefillDate: today,
    lastMonthlyRefillDate: getMonthKey(),
    pendingPayment: false,
    paymentStatus: 'approved',
    paymentApprovedAt: serverTimestamp(),
    paymentRejectedAt: null,
    paymentRejectReason: '',
    subscriptionStartedAt: isTopUp ? (currentData?.subscriptionStartedAt || null) : serverTimestamp(),
    subscriptionExpiresAt: isTopUp ? (currentData?.subscriptionExpiresAt || null) : Timestamp.fromDate(expiresAt),
    subscriptionDurationDays: tierConfig.durationDays,
    subscriptionDurationLabel: tierConfig.durationLabel,
    subscriptionPlanName: tierConfig.name,
    requestedTier: null,
  });
};

export const requestManualPayment = async (
  uid: string,
  requestedTier: UserTier = 'premium',
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
    ...(proof ? { paymentProofUrl: proof.url, paymentProofPath: proof.path, paymentProofName: proof.name } : {}),
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
  mode: 'points' | 'tier' | 'banned' | 'owner';
  remaining: number;
  weeklyRemaining?: number;
  monthlyRemaining?: number;
  dailyRemaining?: number;
};

const getDaysSince = (dateString?: string) => {
  const now = new Date();
  const refillDate = new Date(dateString || '2000-01-01');
  return Math.ceil(Math.abs(now.getTime() - refillDate.getTime()) / (1000 * 60 * 60 * 24));
};

const getQuotaState = (data: UserProfile) => {
  const plan = getEffectivePlanConfig(data);
  const today = getTodayKey();
  const month = getMonthKey();
  const resetWeekly = getDaysSince(data.lastRefillDate) >= 7;
  const resetMonthly = data.lastMonthlyRefillDate !== month;
  const resetDaily = data.lastGenerationDate !== today;
  const weeklyLimit = plan.weeklyLimit;
  const monthlyLimit = plan.monthlyLimit;
  const songsUsedThisWeek = resetWeekly ? 0 : (data.songsUsedThisWeek || 0);
  const songsUsedThisMonth = resetMonthly ? 0 : (data.songsUsedThisMonth || 0);
  const dailyUsed = resetDaily ? 0 : (data.dailyGenerationCount || 0);
  const isFree = plan.id === 'free';
  const weeklyRemaining = Math.max(weeklyLimit - songsUsedThisWeek, 0);
  const monthlyRemaining = Math.max(monthlyLimit - songsUsedThisMonth, 0);
  const dailyRemaining = isFree ? Math.max(FREE_DAILY_CREDIT_CAP - dailyUsed, 0) : UNLIMITED_REMAINING;
  const remaining = Math.min(weeklyRemaining, monthlyRemaining, dailyRemaining);
  return { plan, weeklyLimit, monthlyLimit, songsUsedThisWeek, songsUsedThisMonth, dailyUsed, resetWeekly, resetMonthly, resetDaily, weeklyRemaining, monthlyRemaining, dailyRemaining, remaining };
};

export const checkGenerationAccess = async (uid: string): Promise<GenerationUsageResult> => {
  const userRef = doc(db, 'users', uid);
  await claimDailyPointsIfNeeded(uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return { allowed: false, mode: 'points', remaining: 0 };
  const data = userSnap.data() as UserProfile;
  if (!isOwnerProfile(data) && isUserBanned(data)) return { allowed: false, mode: 'banned', remaining: 0 };
  if (isOwnerProfile(data)) return { allowed: true, mode: 'owner', remaining: UNLIMITED_REMAINING, weeklyRemaining: UNLIMITED_REMAINING, monthlyRemaining: UNLIMITED_REMAINING, dailyRemaining: UNLIMITED_REMAINING };
  const quota = getQuotaState(data);
  await updateDoc(userRef, {
    weeklyLimit: quota.weeklyLimit,
    monthlyLimit: quota.monthlyLimit,
    songsUsedThisWeek: quota.songsUsedThisWeek,
    songsUsedThisMonth: quota.songsUsedThisMonth,
    dailyGenerationCount: quota.dailyUsed,
    lastGenerationDate: getTodayKey(),
    lastRefillDate: quota.resetWeekly ? getTodayKey() : (data.lastRefillDate || getTodayKey()),
    lastMonthlyRefillDate: quota.resetMonthly ? getMonthKey() : (data.lastMonthlyRefillDate || getMonthKey()),
  });
  return { allowed: quota.remaining > 0, mode: 'tier', remaining: quota.remaining, weeklyRemaining: quota.weeklyRemaining, monthlyRemaining: quota.monthlyRemaining, dailyRemaining: quota.dailyRemaining };
};

export const consumeGenerationCredit = async (uid: string, cost = GENERATE_TWO_SONGS_COST): Promise<GenerationUsageResult> => {
  const userRef = doc(db, 'users', uid);
  return runTransaction(db, async (transaction) => {
    const freshSnap = await transaction.get(userRef);
    if (!freshSnap.exists()) return { allowed: false, mode: 'points' as const, remaining: 0 };
    const data = freshSnap.data() as UserProfile;
    if (!isOwnerProfile(data) && isUserBanned(data)) return { allowed: false, mode: 'banned' as const, remaining: 0 };
    if (isOwnerProfile(data)) return { allowed: true, mode: 'owner' as const, remaining: UNLIMITED_REMAINING, weeklyRemaining: UNLIMITED_REMAINING, monthlyRemaining: UNLIMITED_REMAINING, dailyRemaining: UNLIMITED_REMAINING };
    const quota = getQuotaState(data);
    if (quota.remaining < cost) return { allowed: false, mode: 'tier' as const, remaining: quota.remaining, weeklyRemaining: quota.weeklyRemaining, monthlyRemaining: quota.monthlyRemaining, dailyRemaining: quota.dailyRemaining };
    const nextWeeklyUsed = quota.songsUsedThisWeek + cost;
    const nextMonthlyUsed = quota.songsUsedThisMonth + cost;
    const nextDailyUsed = quota.dailyUsed + cost;
    const weeklyRemaining = Math.max(quota.weeklyLimit - nextWeeklyUsed, 0);
    const monthlyRemaining = Math.max(quota.monthlyLimit - nextMonthlyUsed, 0);
    const dailyRemaining = quota.plan.id === 'free' ? Math.max(FREE_DAILY_CREDIT_CAP - nextDailyUsed, 0) : UNLIMITED_REMAINING;
    const remaining = Math.min(weeklyRemaining, monthlyRemaining, dailyRemaining);
    transaction.update(userRef, {
      weeklyLimit: quota.weeklyLimit,
      monthlyLimit: quota.monthlyLimit,
      songsUsedThisWeek: nextWeeklyUsed,
      songsUsedThisMonth: nextMonthlyUsed,
      dailyGenerationCount: nextDailyUsed,
      lastGenerationDate: getTodayKey(),
      lastRefillDate: quota.resetWeekly ? getTodayKey() : (data.lastRefillDate || getTodayKey()),
      lastMonthlyRefillDate: quota.resetMonthly ? getMonthKey() : (data.lastMonthlyRefillDate || getMonthKey()),
    });
    return { allowed: true, mode: 'tier' as const, remaining, weeklyRemaining, monthlyRemaining, dailyRemaining };
  });
};

export const checkAndUpdateUsage = consumeGenerationCredit;

export const saveSong = async (userId: string, song: Omit<Song, 'userId' | 'createdAt'>) => {
  const songRef = doc(db, 'users', userId, 'songs', song.id);
  const fullSong: Song = { ...song, userId, createdAt: serverTimestamp() };
  await setDoc(songRef, fullSong);
  return fullSong;
};

export const manualUpdateUser = async (userId: string, data: Partial<UserProfile>) => updateDoc(doc(db, 'users', userId), data);

export const unbanUser = async (userId: string) => updateDoc(doc(db, 'users', userId), {
  chatBannedUntil: null,
  chatBanReason: '',
  chatBannedAt: null,
  chatLastViolation: '',
  chatLastViolationAt: null,
  chatViolationCount: 0,
});

export const uploadSongAudio = async (userId: string, songId: string, blob: Blob) => {
  const contentType = blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'audio/mpeg';
  const extension = contentType.includes('wav') ? 'wav' : contentType.includes('ogg') ? 'ogg' : 'mp3';
  const storagePath = `users/${userId}/songs/${songId}/audio.${extension}`;
  const audioRef = ref(storage, storagePath);
  await uploadBytes(audioRef, blob, { contentType, customMetadata: { userId, songId } });
  return { audioUrl: await getDownloadURL(audioRef), storagePath, mimeType: contentType };
};

export const uploadPaymentProof = async (userId: string, file: File) => {
  const contentType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'payment-proof.jpg';
  const proofId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `users/${userId}/payment-proofs/${proofId}-${safeName}`;
  const proofRef = ref(storage, storagePath);
  await uploadBytes(proofRef, file, { contentType, customMetadata: { userId, originalName: file.name } });
  return { url: await getDownloadURL(proofRef), path: storagePath, name: file.name };
};
