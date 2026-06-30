import crypto from 'node:crypto';
import { ApiError, sendApiError } from './_apiError.js';
import { adminTimestamp, getAdminDb } from './_firebaseAdmin.js';
import { verifySharedSecret } from './_webhookSecurity.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '64kb',
    },
  },
};

const telegramApi = async (method: string, body: Record<string, unknown>) => {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '');
  if (!token) throw new ApiError(503, 'TELEGRAM_NOT_CONFIGURED', 'Telegram bot is not configured.');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new ApiError(502, 'TELEGRAM_API_FAILED', 'Telegram bot request failed.');
  }
};

const claimUpdate = async (updateId: number) => {
  const ref = getAdminDb().collection('telegramWebhookUpdates').doc(String(updateId));
  return getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    if (data.status === 'completed') return { claimed: false, ref };
    const processingAt = data.processingAt?.toMillis?.() || 0;
    if (data.status === 'processing' && Date.now() - processingAt < 5 * 60 * 1000) {
      return { claimed: false, ref };
    }
    transaction.set(ref, {
      updateId,
      status: 'processing',
      processingAt: adminTimestamp.now(),
      attempts: Math.max(Number(data.attempts || 0), 0) + 1,
    }, { merge: true });
    return { claimed: true, ref };
  });
};

const commandReply = (command: string) => {
  switch (command) {
    case '/start':
      return 'Taurus Music bot security setup is ready. Account linking and paid plans are not enabled yet.';
    case '/link':
      return 'Secure account linking is not enabled yet. Never send passwords, tokens, or wallet seed phrases to this bot.';
    case '/balance':
      return 'Balance lookup will be available after secure account linking is enabled.';
    case '/paysupport':
    case '/support':
      return 'Payment support is not enabled yet. Please use the official Taurus Music website support channel.';
    case '/terms':
      return 'Paid-plan terms will be published before payments are enabled.';
    default:
      return '';
  }
};

const recordUnmatchedStarsPayment = async (update: any) => {
  const payment = update?.message?.successful_payment;
  if (!payment || payment.currency !== 'XTR') return;
  const chargeId = String(payment.telegram_payment_charge_id || '');
  if (!chargeId) throw new ApiError(400, 'TELEGRAM_PAYMENT_INVALID', 'Telegram payment identifier is missing.');
  const recordId = crypto.createHash('sha256').update(chargeId).digest('hex');
  await getAdminDb().collection('telegramPaymentEvents').doc(recordId).set({
    provider: 'telegram_stars',
    status: 'unmatched',
    currency: 'XTR',
    totalAmount: Number(payment.total_amount || 0),
    telegramPaymentChargeId: chargeId,
    providerPaymentChargeId: String(payment.provider_payment_charge_id || '').slice(0, 200),
    telegramUserId: String(update?.message?.from?.id || ''),
    receivedAt: adminTimestamp.now(),
  }, { merge: false });
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let updateRef: any = null;
  try {
    verifySharedSecret(
      req.headers?.['x-telegram-bot-api-secret-token'],
      String(process.env.TELEGRAM_WEBHOOK_SECRET || ''),
    );
    const update = req.body || {};
    const updateId = Number(update.update_id);
    if (!Number.isSafeInteger(updateId) || updateId < 0) {
      throw new ApiError(400, 'TELEGRAM_UPDATE_INVALID', 'Invalid Telegram update.');
    }
    const claim = await claimUpdate(updateId);
    updateRef = claim.ref;
    if (!claim.claimed) return res.status(200).json({ ok: true, duplicate: true });

    await recordUnmatchedStarsPayment(update);
    const text = String(update?.message?.text || '').trim();
    const command = text.split(/\s+/, 1)[0]?.toLowerCase().split('@', 1)[0] || '';
    const reply = commandReply(command);
    const chatId = update?.message?.chat?.id;
    if (reply && (typeof chatId === 'number' || typeof chatId === 'string')) {
      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: reply,
        disable_web_page_preview: true,
      });
    }

    await updateRef.set({
      status: 'completed',
      completedAt: adminTimestamp.now(),
    }, { merge: true });
    return res.status(200).json({ ok: true });
  } catch (error: unknown) {
    if (updateRef) {
      await updateRef.set({
        status: 'failed',
        failedAt: adminTimestamp.now(),
      }, { merge: true }).catch(() => undefined);
    }
    return sendApiError(res, error, 'Telegram webhook failed');
  }
}
