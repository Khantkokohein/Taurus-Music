import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/_apiError.js';
import {
  isPersonalAccessUser,
  isPersonalMode,
  requirePersonalAccess,
} from '../api/_personalAccess.js';

const originalMode = process.env.APP_MODE;
const originalAllowedUids = process.env.PERSONAL_ALLOWED_UIDS;
const originalTelegramAllowed = process.env.TELEGRAM_ALLOWED_USER_IDS;

after(() => {
  if (typeof originalMode === 'string') process.env.APP_MODE = originalMode;
  else delete process.env.APP_MODE;
  if (typeof originalAllowedUids === 'string') {
    process.env.PERSONAL_ALLOWED_UIDS = originalAllowedUids;
  } else {
    delete process.env.PERSONAL_ALLOWED_UIDS;
  }
  if (typeof originalTelegramAllowed === 'string') {
    process.env.TELEGRAM_ALLOWED_USER_IDS = originalTelegramAllowed;
  } else {
    delete process.env.TELEGRAM_ALLOWED_USER_IDS;
  }
});

const user = { uid: 'owner-test-uid', email: 'owner@example.invalid', admin: false };

test('personal mode fails closed when no UID is configured', { concurrency: false }, () => {
  process.env.APP_MODE = 'personal';
  delete process.env.PERSONAL_ALLOWED_UIDS;
  delete process.env.TELEGRAM_ALLOWED_USER_IDS;
  assert.throws(
    () => requirePersonalAccess(user),
    (error) => error instanceof ApiError && error.status === 503,
  );
});

test('personal mode returns 403 for an authenticated non-owner', { concurrency: false }, () => {
  process.env.APP_MODE = 'personal';
  process.env.PERSONAL_ALLOWED_UIDS = 'different-owner';
  delete process.env.TELEGRAM_ALLOWED_USER_IDS;
  assert.throws(
    () => requirePersonalAccess(user),
    (error) => error instanceof ApiError && error.status === 403,
  );
});

test('personal mode accepts only an exact verified UID match', { concurrency: false }, () => {
  process.env.APP_MODE = 'personal';
  process.env.PERSONAL_ALLOWED_UIDS = `different-owner, ${user.uid}`;
  delete process.env.TELEGRAM_ALLOWED_USER_IDS;
  assert.doesNotThrow(() => requirePersonalAccess(user));
  assert.equal(isPersonalMode(), true);
  assert.equal(isPersonalAccessUser(user.uid), true);
  assert.equal(isPersonalAccessUser('owner-test-uid-extra'), false);
});

test('personal mode accepts an exact allowlisted Telegram Firebase UID', { concurrency: false }, () => {
  process.env.APP_MODE = 'personal';
  delete process.env.PERSONAL_ALLOWED_UIDS;
  process.env.TELEGRAM_ALLOWED_USER_IDS = '123456789';
  assert.doesNotThrow(() => requirePersonalAccess({
    uid: 'telegram:123456789',
    admin: false,
  }));
  assert.equal(isPersonalAccessUser('telegram:123456789'), true);
  assert.equal(isPersonalAccessUser('telegram:123456780'), false);
});

test('production mode does not apply the personal preview allowlist', { concurrency: false }, () => {
  process.env.APP_MODE = 'production';
  delete process.env.PERSONAL_ALLOWED_UIDS;
  delete process.env.TELEGRAM_ALLOWED_USER_IDS;
  assert.doesNotThrow(() => requirePersonalAccess(user));
  assert.equal(isPersonalAccessUser(user.uid), false);
});
