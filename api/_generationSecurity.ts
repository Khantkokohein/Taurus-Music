import crypto from 'node:crypto';
import { ApiError } from './_apiError.js';
import { adminTimestamp, getAdminDb } from './_firebaseAdmin.js';
import { isPersonalAccessUser } from './_personalAccess.js';
import { isPrivatePersonalPreview } from './_telegramMiniAppAuth.js';
import type { VerifiedFirebaseUser } from './_serverAuth.js';

const FREE_PERIOD_LIMIT = 60;
const FREE_DAILY_LIMIT = 60;
const DEFAULT_CREDIT_COST = 5;
const DEFAULT_RATE_LIMIT = 4;
const RATE_WINDOW_MS = 60_000;
const personalPreviewRateWindows = new Map<string, { startedAt: number; count: number }>();

const boundedInteger = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

export const getGenerationCreditCost = () => boundedInteger(
  process.env.GENERATION_CREDIT_COST,
  DEFAULT_CREDIT_COST,
  1,
  100,
);

const getGenerationRateLimit = () => boundedInteger(
  process.env.GENERATION_RATE_LIMIT_PER_MINUTE,
  DEFAULT_RATE_LIMIT,
  1,
  60,
);

const timestampMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  return 0;
};

const dateKey = (now: Date) => now.toISOString().slice(0, 10);
const monthKey = (now: Date) => now.toISOString().slice(0, 7);

const daysSince = (value: unknown, nowMs: number) => {
  if (typeof value !== 'string') return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? Math.floor(Math.abs(nowMs - parsed) / 86_400_000) : Number.POSITIVE_INFINITY;
};

const isSubscriptionActive = (profile: any, nowMs: number) => {
  if (String(profile?.tier || 'free') !== 'premium') return false;
  const expiresAt = timestampMillis(profile?.subscriptionExpiresAt);
  return expiresAt > nowMs;
};

const isBanned = (profile: any, nowMs: number) => (
  timestampMillis(profile?.chatBannedUntil) > nowMs
);

type ReservationUsage = {
  creditCost: number;
  pointsRemaining: number;
  weeklyRemaining: number;
  monthlyRemaining: number;
  dailyRemaining: number;
};

export type GenerationReservation = {
  jobId: string;
  uid: string;
  profile: Record<string, any>;
  usage: ReservationUsage;
  personalPreview?: boolean;
};

const reservePersonalPreviewGeneration = (
  user: VerifiedFirebaseUser,
  jobId: string,
  nowMs: number,
): GenerationReservation => {
  const rateLimit = getGenerationRateLimit();
  const current = personalPreviewRateWindows.get(user.uid);
  const sameWindow = !!current && nowMs - current.startedAt < RATE_WINDOW_MS;
  const count = sameWindow ? current.count : 0;
  if (count >= rateLimit) {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many generation requests. Please wait and try again.');
  }
  personalPreviewRateWindows.set(user.uid, {
    startedAt: sameWindow ? current.startedAt : nowMs,
    count: count + 1,
  });
  return {
    jobId,
    uid: user.uid,
    personalPreview: true,
    profile: {
      uid: user.uid,
      tier: 'personal',
      role: user.admin ? 'admin' : 'user',
      premiumActive: true,
    },
    usage: {
      creditCost: 0,
      pointsRemaining: Number.MAX_SAFE_INTEGER,
      weeklyRemaining: Number.MAX_SAFE_INTEGER,
      monthlyRemaining: Number.MAX_SAFE_INTEGER,
      dailyRemaining: Number.MAX_SAFE_INTEGER,
    },
  };
};

export const reserveGeneration = async (
  user: VerifiedFirebaseUser,
  requestedModel: string,
  now = new Date(),
): Promise<GenerationReservation> => {
  const jobId = crypto.randomUUID();
  const nowMs = now.getTime();
  const trustedPersonalUser = isPersonalAccessUser(user.uid);
  if (trustedPersonalUser && isPrivatePersonalPreview()) {
    return reservePersonalPreviewGeneration(user, jobId, nowMs);
  }

  const db = getAdminDb();
  const userRef = db.collection('users').doc(user.uid);
  const rateRef = userRef.collection('security').doc('generation');
  const jobRef = userRef.collection('generationJobs').doc(jobId);
  const today = dateKey(now);
  const month = monthKey(now);
  const creditCost = user.admin || trustedPersonalUser ? 0 : getGenerationCreditCost();
  const rateLimit = user.admin || trustedPersonalUser
    ? Math.max(getGenerationRateLimit(), 20)
    : getGenerationRateLimit();

  return db.runTransaction(async (transaction) => {
    const [userSnap, rateSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(rateRef),
    ]);

    if (!userSnap.exists) {
      throw new ApiError(403, 'PROFILE_REQUIRED', 'A user profile is required before generating music.');
    }

    const profile = userSnap.data() || {};
    if (isBanned(profile, nowMs)) {
      throw new ApiError(403, 'ACCOUNT_RESTRICTED', 'This account is not allowed to generate music.');
    }

    const rate = rateSnap.data() || {};
    const windowStartedAt = timestampMillis(rate.windowStartedAt);
    const sameWindow = windowStartedAt > 0 && nowMs - windowStartedAt < RATE_WINDOW_MS;
    const requestCount = sameWindow ? Number(rate.requestCount || 0) : 0;
    if (requestCount >= rateLimit) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many generation requests. Please wait and try again.');
    }

    const premiumActive = isSubscriptionActive(profile, nowMs);
    const weeklyReset = daysSince(profile.lastRefillDate, nowMs) >= 7;
    const monthlyReset = profile.lastMonthlyRefillDate !== month;
    const dailyReset = profile.lastGenerationDate !== today;
    const weeklyLimit = premiumActive
      ? Math.max(Number(profile.weeklyLimit || 0), FREE_PERIOD_LIMIT)
      : Math.min(Math.max(Number(profile.weeklyLimit || FREE_PERIOD_LIMIT), 1), FREE_PERIOD_LIMIT);
    const monthlyLimit = premiumActive
      ? Math.max(Number(profile.monthlyLimit || 0), FREE_PERIOD_LIMIT)
      : Math.min(Math.max(Number(profile.monthlyLimit || FREE_PERIOD_LIMIT), 1), FREE_PERIOD_LIMIT);
    const weeklyUsed = weeklyReset ? 0 : Math.max(Number(profile.songsUsedThisWeek || 0), 0);
    const monthlyUsed = monthlyReset ? 0 : Math.max(Number(profile.songsUsedThisMonth || 0), 0);
    const dailyUsed = dailyReset ? 0 : Math.max(Number(profile.dailyGenerationCount || 0), 0);
    const availablePoints = monthlyReset && !premiumActive
      ? Math.max(Number(profile.points || 0), FREE_PERIOD_LIMIT)
      : Math.max(Number(profile.points || 0), 0);
    const dailyLimit = premiumActive ? Number.MAX_SAFE_INTEGER : FREE_DAILY_LIMIT;

    if (creditCost > 0 && availablePoints < creditCost) {
      throw new ApiError(403, 'CREDITS_REQUIRED', 'Not enough generation credits.');
    }
    if (weeklyUsed + creditCost > weeklyLimit) {
      throw new ApiError(403, 'WEEKLY_LIMIT_REACHED', 'The weekly generation limit has been reached.');
    }
    if (monthlyUsed + creditCost > monthlyLimit) {
      throw new ApiError(403, 'MONTHLY_LIMIT_REACHED', 'The monthly generation limit has been reached.');
    }
    if (dailyUsed + creditCost > dailyLimit) {
      throw new ApiError(403, 'DAILY_LIMIT_REACHED', 'The daily generation limit has been reached.');
    }

    const nextWeeklyUsed = weeklyUsed + creditCost;
    const nextMonthlyUsed = monthlyUsed + creditCost;
    const nextDailyUsed = dailyUsed + creditCost;
    const nextPoints = availablePoints - creditCost;
    const usage: ReservationUsage = {
      creditCost,
      pointsRemaining: nextPoints,
      weeklyRemaining: Math.max(weeklyLimit - nextWeeklyUsed, 0),
      monthlyRemaining: Math.max(monthlyLimit - nextMonthlyUsed, 0),
      dailyRemaining: premiumActive ? Number.MAX_SAFE_INTEGER : Math.max(dailyLimit - nextDailyUsed, 0),
    };

    transaction.set(rateRef, {
      windowStartedAt: adminTimestamp.fromMillis(sameWindow ? windowStartedAt : nowMs),
      requestCount: requestCount + 1,
      updatedAt: adminTimestamp.fromMillis(nowMs),
    });

    if (creditCost > 0) {
      transaction.update(userRef, {
        points: nextPoints,
        weeklyLimit,
        monthlyLimit,
        songsUsedThisWeek: nextWeeklyUsed,
        songsUsedThisMonth: nextMonthlyUsed,
        dailyGenerationCount: nextDailyUsed,
        lastGenerationDate: today,
        lastRefillDate: weeklyReset ? today : (profile.lastRefillDate || today),
        lastMonthlyRefillDate: month,
      });
    }

    transaction.create(jobRef, {
      uid: user.uid,
      status: 'reserved',
      creditCost,
      requestedModel: requestedModel.slice(0, 80),
      dayKey: today,
      monthKey: month,
      reservedAt: adminTimestamp.fromMillis(nowMs),
    });

    return {
      jobId,
      uid: user.uid,
      profile: { ...profile, premiumActive },
      usage,
    };
  });
};

export const completeGeneration = async (
  reservation: GenerationReservation,
  output: { model?: string; storageObject?: string; mimeType?: string } = {},
) => {
  if (reservation.personalPreview) return;
  const db = getAdminDb();
  const jobRef = db.collection('users').doc(reservation.uid).collection('generationJobs').doc(reservation.jobId);
  await db.runTransaction(async (transaction) => {
    const jobSnap = await transaction.get(jobRef);
    if (!jobSnap.exists || jobSnap.data()?.status !== 'reserved') return;
    transaction.update(jobRef, {
      status: 'completed',
      ...(output.model ? { model: output.model.slice(0, 80) } : {}),
      ...(output.storageObject ? { storageObject: output.storageObject.slice(0, 500) } : {}),
      ...(output.mimeType ? { mimeType: output.mimeType.slice(0, 80) } : {}),
      completedAt: adminTimestamp.now(),
    });
  });
};

export const refundGeneration = async (reservation: GenerationReservation) => {
  if (reservation.personalPreview) return;
  const db = getAdminDb();
  const userRef = db.collection('users').doc(reservation.uid);
  const jobRef = userRef.collection('generationJobs').doc(reservation.jobId);

  await db.runTransaction(async (transaction) => {
    const [jobSnap, userSnap] = await Promise.all([
      transaction.get(jobRef),
      transaction.get(userRef),
    ]);
    if (!jobSnap.exists || jobSnap.data()?.status !== 'reserved') return;
    if (!userSnap.exists) {
      transaction.update(jobRef, {
        status: 'refund_failed',
        updatedAt: adminTimestamp.now(),
      });
      return;
    }

    const job = jobSnap.data() || {};
    const profile = userSnap.data() || {};
    const creditCost = Math.max(Number(job.creditCost || 0), 0);
    if (creditCost > 0) {
      transaction.update(userRef, {
        points: Math.max(Number(profile.points || 0), 0) + creditCost,
        songsUsedThisWeek: Math.max(Number(profile.songsUsedThisWeek || 0) - creditCost, 0),
        songsUsedThisMonth: Math.max(Number(profile.songsUsedThisMonth || 0) - creditCost, 0),
        dailyGenerationCount: Math.max(Number(profile.dailyGenerationCount || 0) - creditCost, 0),
      });
    }
    transaction.update(jobRef, {
      status: 'refunded',
      refundedAt: adminTimestamp.now(),
    });
  });
};
