import crypto from 'node:crypto';
import { ApiError } from './_apiError.js';

const TELEGRAM_ID_PATTERN = /^[1-9][0-9]{0,15}$/;
const TELEGRAM_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const TELEGRAM_HASH_PATTERN = /^[a-f0-9]{64}$/;
const TELEGRAM_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{80,90}={0,2}$/;
const TELEGRAM_PRODUCTION_PUBLIC_KEY_HEX = 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const MAX_INIT_DATA_BYTES = 16 * 1024;
const MAX_AUTH_AGE_SECONDS = 5 * 60;
const MAX_FUTURE_SKEW_SECONDS = 30;

export type VerifiedTelegramMiniAppUser = {
  id: string;
  displayName: string;
  username?: string;
  languageCode?: string;
};

const parseTelegramIdSet = (name: string) => new Set(
  String(process.env[name] || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => TELEGRAM_ID_PATTERN.test(value)),
);

export const getAllowedTelegramUserIds = () => (
  parseTelegramIdSet('TELEGRAM_ALLOWED_USER_IDS')
);

export const getTelegramOwnerUserIds = () => (
  parseTelegramIdSet('TELEGRAM_OWNER_USER_IDS')
);

export const buildTelegramFirebaseUid = (telegramUserId: string) => {
  if (!TELEGRAM_ID_PATTERN.test(telegramUserId)) {
    throw new ApiError(401, 'TELEGRAM_USER_INVALID', 'Telegram identity is invalid.');
  }
  return `telegram:${telegramUserId}`;
};

const safeEqualHex = (left: string, right: string) => {
  if (!TELEGRAM_HASH_PATTERN.test(left) || !TELEGRAM_HASH_PATTERN.test(right)) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
};

const sanitizeDisplayName = (value: unknown) => (
  String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 80)
);

const verifyTelegramPublicSignature = ({
  signatureValue,
  dataCheckString,
  botId,
  publicKeyHex,
}: {
  signatureValue: string;
  dataCheckString: string;
  botId: string;
  publicKeyHex: string;
}) => {
  if (
    !TELEGRAM_ID_PATTERN.test(botId)
    || !TELEGRAM_SIGNATURE_PATTERN.test(signatureValue)
    || !TELEGRAM_HASH_PATTERN.test(publicKeyHex)
  ) {
    return false;
  }
  try {
    const signature = Buffer.from(signatureValue, 'base64url');
    const publicKeyBytes = Buffer.from(publicKeyHex, 'hex');
    if (signature.length !== 64 || publicKeyBytes.length !== 32) return false;
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(
      null,
      Buffer.from(`${botId}:WebAppData\n${dataCheckString}`, 'utf8'),
      publicKey,
      signature,
    );
  } catch {
    return false;
  }
};

export const verifyTelegramMiniAppData = ({
  initData,
  botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  nowSeconds = Math.floor(Date.now() / 1000),
  telegramPublicKeyHex = TELEGRAM_PRODUCTION_PUBLIC_KEY_HEX,
}: {
  initData: string;
  botToken?: string;
  nowSeconds?: number;
  telegramPublicKeyHex?: string;
}): VerifiedTelegramMiniAppUser => {
  if (!botToken) {
    throw new ApiError(
      503,
      'TELEGRAM_NOT_CONFIGURED',
      'Telegram authentication is not configured.',
    );
  }
  if (
    typeof initData !== 'string'
    || initData.length === 0
    || Buffer.byteLength(initData, 'utf8') > MAX_INIT_DATA_BYTES
  ) {
    throw new ApiError(401, 'TELEGRAM_AUTH_INVALID', 'Telegram authentication is invalid.');
  }

  const params = new URLSearchParams(initData);
  const seen = new Set<string>();
  for (const [key] of params) {
    if (seen.has(key)) {
      throw new ApiError(401, 'TELEGRAM_AUTH_INVALID', 'Telegram authentication is invalid.');
    }
    seen.add(key);
  }

  const receivedHash = String(params.get('hash') || '').toLowerCase();
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  const botId = String(botToken.split(':', 1)[0] || '');
  const publicSignatureValid = verifyTelegramPublicSignature({
    signatureValue: String(params.get('signature') || ''),
    dataCheckString,
    botId,
    publicKeyHex: telegramPublicKeyHex,
  });

  if (!publicSignatureValid && !safeEqualHex(receivedHash, expectedHash)) {
    throw new ApiError(401, 'TELEGRAM_AUTH_INVALID', 'Telegram authentication is invalid.');
  }

  const authDate = Number(params.get('auth_date'));
  if (
    !Number.isSafeInteger(authDate)
    || authDate < nowSeconds - MAX_AUTH_AGE_SECONDS
    || authDate > nowSeconds + MAX_FUTURE_SKEW_SECONDS
  ) {
    throw new ApiError(401, 'TELEGRAM_AUTH_EXPIRED', 'Telegram authentication expired.');
  }

  let telegramUser: Record<string, unknown>;
  try {
    telegramUser = JSON.parse(String(params.get('user') || ''));
  } catch {
    throw new ApiError(401, 'TELEGRAM_USER_INVALID', 'Telegram identity is invalid.');
  }

  const id = String(telegramUser.id || '');
  if (
    !TELEGRAM_ID_PATTERN.test(id)
    || telegramUser.is_bot === true
    || !Number.isSafeInteger(Number(id))
  ) {
    throw new ApiError(401, 'TELEGRAM_USER_INVALID', 'Telegram identity is invalid.');
  }

  const firstName = sanitizeDisplayName(telegramUser.first_name);
  const lastName = sanitizeDisplayName(telegramUser.last_name);
  const displayName = `${firstName} ${lastName}`.trim() || 'Taurus Family';
  const rawUsername = String(telegramUser.username || '');
  const username = TELEGRAM_USERNAME_PATTERN.test(rawUsername)
    ? rawUsername
    : undefined;
  const rawLanguageCode = String(telegramUser.language_code || '');
  const languageCode = /^[A-Za-z0-9-]{2,16}$/.test(rawLanguageCode)
    ? rawLanguageCode
    : undefined;

  return {
    id,
    displayName,
    ...(username ? { username } : {}),
    ...(languageCode ? { languageCode } : {}),
  };
};

export const requireAllowedTelegramUser = (telegramUserId: string) => {
  const allowed = getAllowedTelegramUserIds();
  if (allowed.size === 0) {
    throw new ApiError(
      503,
      'TELEGRAM_FAMILY_NOT_CONFIGURED',
      'Private family access is not configured.',
    );
  }
  if (!allowed.has(telegramUserId)) {
    throw new ApiError(
      403,
      'TELEGRAM_FAMILY_ACCESS_REQUIRED',
      'This Telegram account is not in the private family list.',
    );
  }
  return {
    isOwner: getTelegramOwnerUserIds().has(telegramUserId),
  };
};

export const buildTelegramReplayId = (initData: string) => (
  crypto.createHash('sha256').update(initData).digest('hex')
);
