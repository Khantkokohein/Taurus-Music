import crypto from 'node:crypto';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/_apiError.js';
import {
  buildTelegramFirebaseUid,
  requireAllowedTelegramUser,
  verifyTelegramMiniAppData,
} from '../api/_telegramMiniAppAuth.js';

const originalAllowed = process.env.TELEGRAM_ALLOWED_USER_IDS;
const originalOwners = process.env.TELEGRAM_OWNER_USER_IDS;

after(() => {
  if (typeof originalAllowed === 'string') {
    process.env.TELEGRAM_ALLOWED_USER_IDS = originalAllowed;
  } else {
    delete process.env.TELEGRAM_ALLOWED_USER_IDS;
  }
  if (typeof originalOwners === 'string') {
    process.env.TELEGRAM_OWNER_USER_IDS = originalOwners;
  } else {
    delete process.env.TELEGRAM_OWNER_USER_IDS;
  }
});

const signInitData = ({
  botToken,
  authDate,
  telegramUserId = '123456789',
}: {
  botToken: string;
  authDate: number;
  telegramUserId?: string;
}) => {
  const values = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAEAA-test-query',
    user: JSON.stringify({
      id: Number(telegramUserId),
      first_name: 'Taurus',
      last_name: 'Family',
      username: 'taurus_family',
      language_code: 'en',
    }),
  });
  const dataCheckString = [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  values.set('hash', hash);
  return values.toString();
};

test('verifies current Telegram Mini App data and builds a stable Firebase UID', () => {
  const nowSeconds = 1782831600;
  const verified = verifyTelegramMiniAppData({
    initData: signInitData({
      botToken: '123456:test-bot-token',
      authDate: nowSeconds,
    }),
    botToken: '123456:test-bot-token',
    nowSeconds,
  });
  assert.equal(verified.id, '123456789');
  assert.equal(verified.displayName, 'Taurus Family');
  assert.equal(buildTelegramFirebaseUid(verified.id), 'telegram:123456789');
});

test('rejects tampered and stale Telegram Mini App data', () => {
  const nowSeconds = 1782831600;
  const valid = signInitData({
    botToken: '123456:test-bot-token',
    authDate: nowSeconds,
  });
  assert.throws(
    () => verifyTelegramMiniAppData({
      initData: valid.replace('Taurus', 'Attacker'),
      botToken: '123456:test-bot-token',
      nowSeconds,
    }),
    (error) => error instanceof ApiError && error.status === 401,
  );
  assert.throws(
    () => verifyTelegramMiniAppData({
      initData: signInitData({
        botToken: '123456:test-bot-token',
        authDate: nowSeconds - 301,
      }),
      botToken: '123456:test-bot-token',
      nowSeconds,
    }),
    (error) => error instanceof ApiError && error.code === 'TELEGRAM_AUTH_EXPIRED',
  );
});

test('family allowlist is exact and owner status is separate', { concurrency: false }, () => {
  process.env.TELEGRAM_ALLOWED_USER_IDS = '123456789,987654321';
  process.env.TELEGRAM_OWNER_USER_IDS = '123456789';
  assert.deepEqual(requireAllowedTelegramUser('123456789'), { isOwner: true });
  assert.deepEqual(requireAllowedTelegramUser('987654321'), { isOwner: false });
  assert.throws(
    () => requireAllowedTelegramUser('123456780'),
    (error) => error instanceof ApiError && error.status === 403,
  );
});

test('family allowlist fails closed when no Telegram IDs are configured', { concurrency: false }, () => {
  delete process.env.TELEGRAM_ALLOWED_USER_IDS;
  delete process.env.TELEGRAM_OWNER_USER_IDS;
  assert.throws(
    () => requireAllowedTelegramUser('123456789'),
    (error) => error instanceof ApiError && error.status === 503,
  );
});
