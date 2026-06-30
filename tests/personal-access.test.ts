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

after(() => {
  if (typeof originalMode === 'string') process.env.APP_MODE = originalMode;
  else delete process.env.APP_MODE;
  if (typeof originalAllowedUids === 'string') {
    process.env.PERSONAL_ALLOWED_UIDS = originalAllowedUids;
  } else {
    delete process.env.PERSONAL_ALLOWED_UIDS;
  }
});

const user = { uid: 'owner-test-uid', email: 'owner@example.invalid', admin: false };

test('personal mode fails closed when no UID is configured', { concurrency: false }, () => {
  process.env.APP_MODE = 'personal';
  delete process.env.PERSONAL_ALLOWED_UIDS;
  assert.throws(
    () => requirePersonalAccess(user),
    (error) => error instanceof ApiError && error.status === 503,
  );
});

test('personal mode returns 403 for an authenticated non-owner', { concurrency: false }, () => {
  process.env.APP_MODE = 'personal';
  process.env.PERSONAL_ALLOWED_UIDS = 'different-owner';
  assert.throws(
    () => requirePersonalAccess(user),
    (error) => error instanceof ApiError && error.status === 403,
  );
});

test('personal mode accepts only an exact verified UID match', { concurrency: false }, () => {
  process.env.APP_MODE = 'personal';
  process.env.PERSONAL_ALLOWED_UIDS = `different-owner, ${user.uid}`;
  assert.doesNotThrow(() => requirePersonalAccess(user));
  assert.equal(isPersonalMode(), true);
  assert.equal(isPersonalAccessUser(user.uid), true);
  assert.equal(isPersonalAccessUser('owner-test-uid-extra'), false);
});

test('production mode does not apply the personal preview allowlist', { concurrency: false }, () => {
  process.env.APP_MODE = 'production';
  delete process.env.PERSONAL_ALLOWED_UIDS;
  assert.doesNotThrow(() => requirePersonalAccess(user));
  assert.equal(isPersonalAccessUser(user.uid), false);
});
