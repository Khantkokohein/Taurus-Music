import { applyTaurusPayment, failInvoice } from './_taurusPay.js';

const PASSIVE_STATUSES = new Set(['created', 'pending', 'processing', 'confirming']);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expectedSecret = process.env.TAURUSPAY_WEBHOOK_SECRET || '';
  const receivedSecret = req.headers?.['x-tauruspay-secret'] || req.headers?.['X-Tauruspay-Secret'];
  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid webhook secret.' });
  }

  const payload = req.body || {};
  const invoiceId = String(payload.invoiceId || '');

  try {
    if (payload.status !== 'completed') {
      if (PASSIVE_STATUSES.has(String(payload.status || '').toLowerCase())) {
        return res.status(200).json({ ok: true, pending: true });
      }
      await failInvoice(invoiceId, `payment_${payload.status || 'not_completed'}`, payload);
      return res.status(200).json({ ok: true, ignored: true });
    }

    const result = await applyTaurusPayment(payload);
    return res.status(200).json({ ok: true, ...result });
  } catch (error: any) {
    const message = error?.message || 'Webhook processing failed.';
    await failInvoice(invoiceId, message, payload);
    if (!invoiceId) console.warn('TaurusPay webhook ignored:', message);
    else console.error('TaurusPay webhook error:', error);
    return res.status(200).json({ ok: false, error: message });
  }
}
