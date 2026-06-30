import { ApiError, sendApiError } from './_apiError.js';
import {
  adminTimestamp,
  getAdminAuth,
  getAdminDb,
} from './_firebaseAdmin.js';
import {
  buildTelegramFirebaseUid,
  buildTelegramReplayId,
  getAllowedTelegramUserIds,
  requireAllowedTelegramUser,
  verifyTelegramMiniAppData,
} from './_telegramMiniAppAuth.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '24kb',
    },
  },
};

const claimTelegramLogin = async ({
  replayId,
  uid,
  telegramUserId,
}: {
  replayId: string;
  uid: string;
  telegramUserId: string;
}) => {
  const ref = getAdminDb().collection('telegramAuthSessions').doc(replayId);
  await getAdminDb().runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      throw new ApiError(
        409,
        'TELEGRAM_AUTH_REPLAYED',
        'Telegram authentication was already used. Reopen Taurus from Telegram.',
      );
    }
    transaction.create(ref, {
      uid,
      telegramUserId,
      usedAt: adminTimestamp.now(),
      expiresAt: adminTimestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
    });
  });
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  try {
    const initData = typeof req.body?.initData === 'string'
      ? req.body.initData
      : '';
    const telegramUser = verifyTelegramMiniAppData({ initData });
    const allowedTelegramUserIds = getAllowedTelegramUserIds();
    if (allowedTelegramUserIds.size === 0) {
      return res.status(428).json({
        error: 'Private family setup is required.',
        code: 'TELEGRAM_FAMILY_SETUP_REQUIRED',
        telegramUserId: telegramUser.id,
      });
    }
    if (!allowedTelegramUserIds.has(telegramUser.id)) {
      return res.status(403).json({
        error: 'This Telegram account is not in the private family list.',
        code: 'TELEGRAM_FAMILY_ACCESS_REQUIRED',
        telegramUserId: telegramUser.id,
      });
    }
    const { isOwner } = requireAllowedTelegramUser(telegramUser.id);
    const uid = buildTelegramFirebaseUid(telegramUser.id);
    await claimTelegramLogin({
      replayId: buildTelegramReplayId(initData),
      uid,
      telegramUserId: telegramUser.id,
    });

    const customToken = await getAdminAuth().createCustomToken(uid, {
      telegram: true,
      telegramUserId: telegramUser.id,
      privateFamily: true,
      admin: isOwner,
    });

    return res.status(200).json({
      customToken,
      displayName: telegramUser.displayName,
      isOwner,
    });
  } catch (error: unknown) {
    return sendApiError(res, error, 'Telegram authentication failed');
  }
}
