import crypto from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/_apiError.js';
import {
  verifySharedSecret,
  verifyTimestampedHmac,
} from '../api/_webhookSecurity.js';

test('accepts a valid timestamped HMAC', () => {
  const rawBody = Buffer.from('{"event":"payment"}');
  const timestamp = '1782756000';
  const secret = 'test-secret';
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  assert.doesNotThrow(() => verifyTimestampedHmac({
    rawBody,
    timestamp,
    signature: `sha256=${signature}`,
    secret,
    nowSeconds: Number(timestamp),
  }));
});

test('rejects tampered and stale webhook signatures', () => {
  const rawBody = Buffer.from('{"event":"payment"}');
  assert.throws(
    () => verifyTimestampedHmac({
      rawBody,
      timestamp: '1782756000',
      signature: 'sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      secret: 'test-secret',
      nowSeconds: 1782756000,
    }),
    (error) => error instanceof ApiError && error.status === 401,
  );
  assert.throws(
    () => verifyTimestampedHmac({
      rawBody,
      timestamp: '1782750000',
      signature: 'sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      secret: 'test-secret',
      nowSeconds: 1782756000,
    }),
    (error) => error instanceof ApiError && error.status === 401,
  );
});

test('compares webhook shared secrets without ordinary string equality', () => {
  assert.doesNotThrow(() => verifySharedSecret('expected-secret', 'expected-secret'));
  assert.throws(
    () => verifySharedSecret('wrong-secret', 'expected-secret'),
    (error) => error instanceof ApiError && error.status === 401,
  );
});
