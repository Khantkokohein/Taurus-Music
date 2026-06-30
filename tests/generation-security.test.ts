import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/_apiError.js';
import { getAdminDb } from '../api/_firebaseAdmin.js';
import {
  refundGeneration,
  reserveGeneration,
} from '../api/_generationSecurity.js';

const now = new Date('2026-06-29T12:00:00.000Z');
const defaultProfile = {
  uid: 'placeholder',
  email: 'user@example.test',
  tier: 'free',
  role: 'user',
  points: 20,
  weeklyLimit: 60,
  monthlyLimit: 60,
  songsUsedThisWeek: 0,
  songsUsedThisMonth: 0,
  dailyGenerationCount: 0,
  lastGenerationDate: '2026-06-29',
  lastRefillDate: '2026-06-29',
  lastMonthlyRefillDate: '2026-06',
};

const seedProfile = async (uid: string, overrides: Record<string, unknown> = {}) => {
  await getAdminDb().collection('users').doc(uid).set({
    ...defaultProfile,
    uid,
    email: `${uid}@example.test`,
    ...overrides,
  });
};

const user = (uid: string) => ({ uid, email: `${uid}@example.test`, admin: false });

beforeEach(() => {
  process.env.GENERATION_CREDIT_COST = '5';
  process.env.GENERATION_RATE_LIMIT_PER_MINUTE = '4';
});

test('atomically reserves credits and usage counters', { concurrency: false }, async () => {
  const uid = 'reserve-user';
  await seedProfile(uid);

  const reservation = await reserveGeneration(user(uid), 'lyria-test', now);
  const profile = (await getAdminDb().collection('users').doc(uid).get()).data();
  const job = (
    await getAdminDb().collection('users').doc(uid).collection('generationJobs').doc(reservation.jobId).get()
  ).data();

  assert.equal(profile?.points, 15);
  assert.equal(profile?.songsUsedThisWeek, 5);
  assert.equal(profile?.songsUsedThisMonth, 5);
  assert.equal(profile?.dailyGenerationCount, 5);
  assert.equal(job?.status, 'reserved');
});

test('refunds a failed generation exactly once', { concurrency: false }, async () => {
  const uid = 'refund-user';
  await seedProfile(uid);

  const reservation = await reserveGeneration(user(uid), 'lyria-test', now);
  await refundGeneration(reservation);
  await refundGeneration(reservation);

  const profile = (await getAdminDb().collection('users').doc(uid).get()).data();
  const job = (
    await getAdminDb().collection('users').doc(uid).collection('generationJobs').doc(reservation.jobId).get()
  ).data();

  assert.equal(profile?.points, 20);
  assert.equal(profile?.songsUsedThisWeek, 0);
  assert.equal(profile?.songsUsedThisMonth, 0);
  assert.equal(profile?.dailyGenerationCount, 0);
  assert.equal(job?.status, 'refunded');
});

test('rejects insufficient credits without making the balance negative', { concurrency: false }, async () => {
  const uid = 'no-credit-user';
  await seedProfile(uid, { points: 4 });

  await assert.rejects(
    reserveGeneration(user(uid), 'lyria-test', now),
    (error) => error instanceof ApiError && error.code === 'CREDITS_REQUIRED',
  );

  const profile = (await getAdminDb().collection('users').doc(uid).get()).data();
  assert.equal(profile?.points, 4);
  assert.equal(profile?.songsUsedThisMonth, 0);
});

test('prevents concurrent reservations from overspending', { concurrency: false }, async () => {
  const uid = 'concurrent-user';
  await seedProfile(uid, { points: 5 });

  const results = await Promise.allSettled([
    reserveGeneration(user(uid), 'lyria-test-a', now),
    reserveGeneration(user(uid), 'lyria-test-b', now),
  ]);
  const fulfilled = results.filter(result => result.status === 'fulfilled');
  const rejected = results.filter(result => result.status === 'rejected');
  const profile = (await getAdminDb().collection('users').doc(uid).get()).data();

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(profile?.points, 0);
});

test('enforces the per-user generation rate limit', { concurrency: false }, async () => {
  const uid = 'rate-user';
  process.env.GENERATION_CREDIT_COST = '1';
  process.env.GENERATION_RATE_LIMIT_PER_MINUTE = '2';
  await seedProfile(uid, { points: 20 });

  await reserveGeneration(user(uid), 'lyria-test-a', now);
  await reserveGeneration(user(uid), 'lyria-test-b', now);
  await assert.rejects(
    reserveGeneration(user(uid), 'lyria-test-c', now),
    (error) => error instanceof ApiError && error.status === 429,
  );
});
