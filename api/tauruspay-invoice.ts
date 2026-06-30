import { ApiError, sendApiError } from './_apiError.js';
import { requirePersonalAccess } from './_personalAccess.js';
import { requireFirebaseAuth } from './_serverAuth.js';
import { getAdminDb, adminFieldValue } from './_firebaseAdmin.js';
import { enforceUserRateLimit } from './_rateLimit.js';
import { getProduct, getTaurusPayConfig, TAURUS_SERVICE, taurusPayFetch } from './_taurusPay.js';

const WALLET_PATTERN = /^[a-zA-Z0-9_:-]{20,128}$/;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireFirebaseAuth(req);
    requirePersonalAccess(user);
    await enforceUserRateLimit(user, 'payment-invoice', 5);
    const { productId, wallet } = req.body || {};
    const product = getProduct(String(productId || ''));
    const safeWallet = String(wallet || '').trim();
    if (!WALLET_PATTERN.test(safeWallet)) {
      throw new ApiError(400, 'PAYMENT_WALLET_INVALID', 'A valid TON wallet address is required.');
    }
    if (!user.email) return res.status(400).json({ error: 'Email is required.' });
    const config = getTaurusPayConfig();

    const invoice = await taurusPayFetch('/api/payment?action=create-invoice', {
      method: 'POST',
      body: JSON.stringify({
        service: TAURUS_SERVICE,
        productId: product.id,
        asset: product.asset,
        wallet: safeWallet,
        email: user.email,
        callbackUrl: config.callbackUrl.toString(),
      }),
    });

    const invoiceId = String(invoice.invoiceId || invoice.id || '');
    if (!invoiceId) throw new ApiError(502, 'PAYMENT_INVOICE_INVALID', 'Payment provider did not return an invoice.');

    const db = getAdminDb();
    await db.collection('taurusPayInvoices').doc(invoiceId).set({
      invoiceId,
      userId: user.uid,
      email: user.email,
      wallet: safeWallet,
      service: TAURUS_SERVICE,
      productId: product.id,
      type: product.type,
      plan: product.plan,
      credits: product.credits,
      amount: product.amount,
      asset: product.asset,
      recipient: invoice.recipient || config.recipient,
      memo: invoice.memo || invoice.reference || '',
      reference: invoice.reference || '',
      status: invoice.status || 'pending',
      createdAt: adminFieldValue.serverTimestamp(),
      updatedAt: adminFieldValue.serverTimestamp(),
    }, { merge: true });

    return res.status(200).json({
      invoiceId,
      status: invoice.status || 'pending',
      productId: product.id,
      credits: product.credits,
      amount: product.amount,
      asset: product.asset,
      network: 'TON',
      recipient: invoice.recipient || config.recipient,
      memo: invoice.memo || invoice.reference || '',
      reference: invoice.reference || '',
      expiresAt: invoice.expiresAt || null,
    });
  } catch (error: unknown) {
    return sendApiError(res, error, 'TaurusPay invoice API failed');
  }
}
