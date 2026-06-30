import crypto from 'node:crypto';
import { ApiError } from './_apiError.js';

const MAX_WEBHOOK_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const readRawBody = async (req: any) => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_WEBHOOK_BYTES) {
      throw new ApiError(413, 'WEBHOOK_TOO_LARGE', 'Webhook payload is too large.');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

export const verifyTimestampedHmac = ({
  rawBody,
  timestamp,
  signature,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  rawBody: Buffer;
  timestamp: string;
  signature: string;
  secret: string;
  nowSeconds?: number;
}) => {
  const timestampNumber = Number(timestamp);
  if (
    !secret
    || !Number.isInteger(timestampNumber)
    || Math.abs(nowSeconds - timestampNumber) > MAX_CLOCK_SKEW_SECONDS
  ) {
    throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Invalid webhook signature.');
  }

  const normalizedSignature = signature.startsWith('sha256=')
    ? signature.slice('sha256='.length)
    : signature;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(normalizedSignature) || !safeEqual(expected, normalizedSignature.toLowerCase())) {
    throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Invalid webhook signature.');
  }
};

export const verifySharedSecret = (received: unknown, expected: string) => {
  const receivedValue = typeof received === 'string' ? received : '';
  if (!expected || !safeEqual(receivedValue, expected)) {
    throw new ApiError(401, 'WEBHOOK_SECRET_INVALID', 'Invalid webhook secret.');
  }
};
