import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const projectId = 'taurus-music-security-test';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
let testEnv;

const baseProfile = (uid) => ({
  uid,
  email: `${uid}@example.test`,
  displayName: uid,
  taurusId: 'TRS-ABC1234',
  taurusNumber: 'TRS-ABC1234',
  taurusCoinBalance: 0,
  songCreditBalance: 0,
  apiAccessEnabled: false,
  dailyGenerationCount: 0,
  lastGenerationDate: '2026-06-29',
  credits: 0,
  points: 60,
  lastPointGrantDate: '2026-06-29',
  totalPointsEarned: 60,
  tier: 'free',
  role: 'user',
  weeklyLimit: 60,
  songsUsedThisWeek: 0,
  lastRefillDate: '2026-06-29',
  monthlyLimit: 60,
  songsUsedThisMonth: 0,
  lastMonthlyRefillDate: '2026-06',
  chatViolationCount: 0,
  chatBanCount: 0,
});

const userDb = (uid, claims = {}) => testEnv
  .authenticatedContext(uid, { email: `${uid}@example.test`, ...claims })
  .firestore();

const seedProfile = async (uid, overrides = {}) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      ...baseProfile(uid),
      ...overrides,
    });
  });
};

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

test('denies unauthenticated and cross-user profile reads', async () => {
  await seedProfile('alice');
  const publicDb = testEnv.unauthenticatedContext().firestore();

  await assertFails(getDoc(doc(publicDb, 'users', 'alice')));
  await assertFails(getDoc(doc(userDb('bob'), 'users', 'alice')));
  await assertSucceeds(getDoc(doc(userDb('alice'), 'users', 'alice')));
});

test('allows only the fixed free profile on self-registration', async () => {
  await assertSucceeds(setDoc(
    doc(userDb('alice'), 'users', 'alice'),
    baseProfile('alice'),
  ));

  await assertFails(setDoc(
    doc(userDb('bob'), 'users', 'bob'),
    { ...baseProfile('bob'), role: 'admin' },
  ));
});

test('allows an owner to update displayName only', async () => {
  await seedProfile('alice');
  const profileRef = doc(userDb('alice'), 'users', 'alice');

  await assertSucceeds(updateDoc(profileRef, { displayName: 'Alice Music' }));
  const snapshot = await assertSucceeds(getDoc(profileRef));
  assert.equal(snapshot.data().displayName, 'Alice Music');
});

for (const [field, value] of [
  ['points', 999999],
  ['tier', 'premium'],
  ['weeklyLimit', 999999],
  ['monthlyLimit', 999999],
  ['songsUsedThisMonth', 0],
  ['pendingPayment', false],
  ['paymentStatus', 'approved'],
  ['apiAccessEnabled', true],
  ['chatBannedUntil', null],
  ['challengeGenerateUsed', 0],
]) {
  test(`denies an owner mutation of server-controlled field: ${field}`, async () => {
    await seedProfile('alice', {
      songsUsedThisMonth: 4,
      pendingPayment: true,
      paymentStatus: 'pending',
      challengeGenerateUsed: 3,
    });
    await assertFails(updateDoc(
      doc(userDb('alice'), 'users', 'alice'),
      { [field]: value },
    ));
  });
}

test('allows a verified admin claim to update server-controlled fields', async () => {
  await seedProfile('alice');
  await assertSucceeds(updateDoc(
    doc(userDb('admin', { admin: true }), 'users', 'alice'),
    { points: 120, tier: 'premium', monthlyLimit: 120 },
  ));
});

test('denies client-side challenge score and counter updates', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'challengeEntries', 'entry-1'), {
      userId: 'alice',
      sourceSongId: 'song-1',
      challengeId: 'taurus-music-studio-challenge-2026-05',
      title: 'Song',
      prompt: 'Prompt',
      audioUrl: 'https://storage.googleapis.com/example/audio.wav',
      mimeType: 'audio/wav',
      lyrics: '',
      authorName: 'Alice',
      visibility: 'public',
      originalOnly: true,
      likeCount: 0,
      commentCount: 0,
      saveCount: 0,
      score: 0,
    });
  });

  await assertFails(updateDoc(
    doc(userDb('alice'), 'challengeEntries', 'entry-1'),
    { likeCount: 1000, score: 1000, updatedAt: serverTimestamp() },
  ));
});

test('accepts only trusted storage URLs for user songs', async () => {
  await seedProfile('alice');
  const aliceDb = userDb('alice');

  await assertSucceeds(setDoc(doc(aliceDb, 'users', 'alice', 'songs', 'song-1'), {
    id: 'song-1',
    userId: 'alice',
    idea: 'Safe song',
    prompt: 'Safe prompt',
    audioUrl: 'https://storage.googleapis.com/example/audio.wav',
    storagePath: 'users/alice/songs/song-1/audio.wav',
    lyrics: '',
    createdAt: serverTimestamp(),
  }));

  await assertFails(setDoc(doc(aliceDb, 'users', 'alice', 'songs', 'song-2'), {
    id: 'song-2',
    userId: 'alice',
    idea: 'Unsafe song',
    prompt: 'Unsafe prompt',
    audioUrl: 'http://127.0.0.1/internal',
    storagePath: 'users/alice/songs/song-2/audio.wav',
    lyrics: '',
    createdAt: serverTimestamp(),
  }));
});
