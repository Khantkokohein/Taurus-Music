import { ApiError, sendApiError } from './_apiError.js';
import { applyTaurusPayment, assertPaymentsEnabled, failInvoice } from './_taurusPay.js';
import { readRawBody, verifyTimestampedHmac } from './_webhookSecurity.js';

const PASSIVE_STATUSES = new Set(['created', 'pending', 'processing', 'confirming']);

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    assertPaymentsEnabled();
    const rawBody = await readRawBody(req);
    verifyTimestampedHmac({
      rawBody,
      timestamp: String(req.headers?.['x-tauruspay-timestamp'] || ''),
      signature: String(req.headers?.['x-tauruspay-signature'] || ''),
      secret: String(process.env.TAURUSPAY_WEBHOOK_SECRET || ''),
    });
    const payload = JSON.parse(rawBody.toString('utf8'));
    const invoiceId = String(payload.invoiceId || '');
    if (payload.status !== 'completed') {
      if (PASSIVE_STATUSES.has(String(payload.status || '').toLowerCase())) {
        return res.status(200).json({ ok: true, pending: true });
      }
      await failInvoice(invoiceId, `payment_${payload.status || 'not_completed'}`);
      return res.status(200).json({ ok: true, ignored: true });
    }

    const result = await applyTaurusPayment(payload);
    return res.status(200).json({ ok: true, ...result });
  } catch (error: unknown) {
    const safeError = error instanceof SyntaxError
      ? new ApiError(400, 'WEBHOOK_JSON_INVALID', 'Invalid webhook payload.')
      : error;
    return sendApiError(res, safeError, 'TaurusPay webhook failed');
  }
}
