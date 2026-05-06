import { requireFirebaseAuth } from './_serverAuth.js';
import { getAdminDb, adminFieldValue } from './_firebaseAdmin.js';
import { TAURUSPAY_BASE_URL, applyTaurusPayment, taurusPayFetch } from './_taurusPay.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireFirebaseAuth(req);
    const invoiceId = String(req.query?.invoiceId || req.body?.invoiceId || '').trim();
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required.' });

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

    const statusPayload = await taurusPayFetch(`${TAURUSPAY_BASE_URL}/api/payment?action=status&invoiceId=${encodeURIComponent(invoiceId)}`);
    await invoiceRef.set({
      status: statusPayload.status || invoice.status || 'pending',
      rawStatus: statusPayload,
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
        paymentId: statusPayload.paymentId || statusPayload.id || `manual_${invoiceId}`,
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
      raw: statusPayload,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to check TaurusPay status.';
    const statusCode = message.toLowerCase().includes('login') || message.toLowerCase().includes('session') ? 401 : 500;
    if (statusCode === 401) console.warn('TaurusPay status auth required:', message);
    else console.error('TaurusPay status API error:', error);
    return res.status(statusCode).json({ error: message });
  }
}
