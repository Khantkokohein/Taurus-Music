import { ApiError, sendApiError } from './_apiError.js';
import { requirePersonalAccess } from './_personalAccess.js';
import { requireFirebaseAuth } from './_serverAuth.js';
import { getAdminDb, adminFieldValue } from './_firebaseAdmin.js';
import { enforceUserRateLimit } from './_rateLimit.js';
import { applyTaurusPayment, taurusPayFetch } from './_taurusPay.js';

const SAFE_ID = /^[a-zA-Z0-9_-]{6,160}$/;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireFirebaseAuth(req);
    requirePersonalAccess(user);
    await enforceUserRateLimit(user, 'payment-status', 10);
    const invoiceId = String(req.query?.invoiceId || req.body?.invoiceId || '').trim();
    if (!SAFE_ID.test(invoiceId)) throw new ApiError(400, 'PAYMENT_INVOICE_INVALID', 'Invalid invoiceId.');

    const db = getAdminDb();
    const invoiceRef = db.collection('taurusPayInvoices').doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();
    if (!invoiceSnap.exists) return res.status(404).json({ error: 'Invoice not found.' });
    const invoice = invoiceSnap.data() || {};
    if (invoice.userId !== user.uid) return res.status(403).json({ error: 'Invoice belongs to another user.' });
    if (invoice.status === 'completed') {
      return res.status(200).json({
        invoiceId,
        status: 'completed',
        applied: true,
        productId: invoice.productId,
        credits: invoice.credits,
        amount: invoice.amount,
        asset: invoice.asset,
      });
    }

    const statusPayload = await taurusPayFetch(`/api/payment?action=status&invoiceId=${encodeURIComponent(invoiceId)}`);
    await invoiceRef.set({
      status: statusPayload.status || invoice.status || 'pending',
      updatedAt: adminFieldValue.serverTimestamp(),
    }, { merge: true });

    let applied = false;
    if (statusPayload.status === 'completed') {
      await applyTaurusPayment({
        ...statusPayload,
        invoiceId,
        productId: statusPayload.productId || invoice.productId,
        service: statusPayload.service || invoice.service,
        type: statusPayload.type || invoice.type,
        credits: statusPayload.credits || invoice.credits,
        amount: statusPayload.amount || invoice.amount,
        asset: statusPayload.asset || invoice.asset,
        email: statusPayload.email || invoice.email,
        wallet: statusPayload.wallet || invoice.wallet,
        paymentId: statusPayload.paymentId || statusPayload.id,
      });
      applied = true;
    }

    return res.status(200).json({
      invoiceId,
      status: statusPayload.status || invoice.status || 'pending',
      applied,
      productId: invoice.productId,
      credits: invoice.credits,
      amount: invoice.amount,
      asset: invoice.asset,
    });
  } catch (error: unknown) {
    return sendApiError(res, error, 'TaurusPay status API failed');
  }
}
