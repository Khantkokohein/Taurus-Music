import { requireFirebaseAuth } from './_serverAuth.js';
import { getAdminDb, adminFieldValue } from './_firebaseAdmin.js';
import { CALLBACK_URL, TAURUS_SERVICE, TAURUSPAY_BASE_URL, TAURUSPAY_RECIPIENT, getProduct, taurusPayFetch } from './_taurusPay.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireFirebaseAuth(req);
    const { productId, wallet } = req.body || {};
    const product = getProduct(String(productId || ''));
    const safeWallet = String(wallet || '').trim();
    if (!safeWallet) return res.status(400).json({ error: 'Telegram/TON wallet address is required.' });
    if (!user.email) return res.status(400).json({ error: 'Email is required.' });

    const invoice = await taurusPayFetch(`${TAURUSPAY_BASE_URL}/api/payment?action=create-invoice`, {
      method: 'POST',
      body: JSON.stringify({
        service: TAURUS_SERVICE,
        productId: product.id,
        asset: product.asset,
        wallet: safeWallet,
        email: user.email,
        callbackUrl: CALLBACK_URL,
      }),
    });

    const invoiceId = String(invoice.invoiceId || invoice.id || '');
    if (!invoiceId) throw new Error('TaurusPay did not return invoiceId.');

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
      recipient: invoice.recipient || TAURUSPAY_RECIPIENT,
      memo: invoice.memo || invoice.reference || '',
      reference: invoice.reference || '',
      status: invoice.status || 'pending',
      rawInvoice: invoice,
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
      recipient: invoice.recipient || TAURUSPAY_RECIPIENT,
      memo: invoice.memo || invoice.reference || '',
      reference: invoice.reference || '',
      expiresAt: invoice.expiresAt || null,
      raw: invoice,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to create TaurusPay invoice.';
    const statusCode = message.toLowerCase().includes('login') || message.toLowerCase().includes('session') ? 401 : 500;
    if (statusCode === 401) console.warn('TaurusPay invoice auth required:', message);
    else console.error('TaurusPay invoice API error:', error);
    return res.status(statusCode).json({ error: message });
  }
}
