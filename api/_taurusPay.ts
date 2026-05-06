import { getAdminDb, adminFieldValue, adminTimestamp } from './_firebaseAdmin.js';

export type TaurusProductId = 'credits_50' | 'credits_100' | 'credits_300' | 'premium_150_month';

export const TAURUS_SERVICE = 'taurus_studio_music';
export const TAURUSPAY_BASE_URL = process.env.TAURUSPAY_BASE_URL || 'https://tauruspay.site';
export const TAURUSPAY_RECIPIENT = process.env.TAURUSPAY_USDT_ADDRESS || '';
export const CALLBACK_URL = process.env.TAURUSPAY_CALLBACK_URL || 'https://taurus-music.vercel.app/api/tauruspay-webhook';

export const PRODUCT_MAP: Record<TaurusProductId, {
  id: TaurusProductId;
  amount: number;
  asset: 'USDT';
  credits: number;
  type: 'credits' | 'premium';
  plan: '' | 'premium';
  tier?: 'premium';
}> = {
  credits_50: { id: 'credits_50', amount: 3.75, asset: 'USDT', credits: 50, type: 'credits', plan: '' },
  credits_100: { id: 'credits_100', amount: 6.75, asset: 'USDT', credits: 100, type: 'credits', plan: '' },
  credits_300: { id: 'credits_300', amount: 17.25, asset: 'USDT', credits: 300, type: 'credits', plan: '' },
  premium_150_month: { id: 'premium_150_month', amount: 12.25, asset: 'USDT', credits: 150, type: 'premium', plan: 'premium', tier: 'premium' },
};

export const getProduct = (productId: string) => {
  const product = PRODUCT_MAP[productId as TaurusProductId];
  if (!product) throw new Error('Invalid TaurusPay product.');
  return product;
};

export const assertExactPayment = (payload: any, product = getProduct(payload?.productId || '')) => {
  if (payload?.service !== TAURUS_SERVICE) throw new Error('Wrong payment service.');
  if (payload?.status !== 'completed') throw new Error('Payment is not completed.');
  if (payload?.asset !== product.asset) throw new Error('Wrong payment asset.');
  const paidAmount = Number(payload?.amount);
  if (paidAmount < product.amount) throw new Error('underpay_exact_amount_required');
  if (paidAmount > product.amount) throw new Error('overpay_manual_review');
  if (paidAmount !== product.amount) throw new Error('Payment amount mismatch.');
  if (payload?.type !== product.type) throw new Error('Payment type mismatch.');
  if (Number(payload?.credits) !== product.credits) throw new Error('Payment credits mismatch.');
};

export const taurusPayFetch = async (url: string, init?: RequestInit) => {
  const apiKey = process.env.TAURUSPAY_API_KEY || '';
  if (!apiKey) throw new Error('TAURUSPAY_API_KEY is not configured.');

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'x-taurus-api-key': apiKey,
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `TaurusPay request failed: ${response.status}`);
  }

  return payload;
};

export const applyTaurusPayment = async (payload: any) => {
  const product = getProduct(payload.productId);
  assertExactPayment(payload, product);

  const db = getAdminDb();
  const invoiceId = String(payload.invoiceId || '');
  const paymentId = String(payload.paymentId || '');
  if (!invoiceId || !paymentId) throw new Error('Missing payment identifiers.');

  const invoiceRef = db.collection('taurusPayInvoices').doc(invoiceId);
  const paymentRef = db.collection('taurusPayPayments').doc(paymentId);

  return db.runTransaction(async (transaction) => {
    const invoiceSnap = await transaction.get(invoiceRef);
    if (!invoiceSnap.exists) {
      throw new Error('Invoice not found.');
    }

    const invoice = invoiceSnap.data() || {};
    const paymentSnap = await transaction.get(paymentRef);
    if (invoice.status === 'completed') {
      if (invoice.paymentId === paymentId || paymentSnap.exists) {
        return { userId: invoice.userId, credits: product.credits, plan: product.plan, invoiceId, paymentId, alreadyApplied: true };
      }
      throw new Error('Invoice already completed.');
    }
    if (paymentSnap.exists) {
      throw new Error('Duplicate payment.');
    }
    if (invoice.productId !== product.id) throw new Error('Invoice product mismatch.');
    if (invoice.email !== payload.email) throw new Error('Invoice email mismatch.');
    if (Number(invoice.amount) !== product.amount) throw new Error('Invoice amount mismatch.');
    if (invoice.asset !== product.asset) throw new Error('Invoice asset mismatch.');

    const userId = String(invoice.userId || '');
    if (!userId) throw new Error('Invoice user missing.');

    const userRef = db.collection('users').doc(userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new Error('User not found.');
    const user = userSnap.data() || {};

    const now = adminTimestamp.now();
    const updates: Record<string, any> = {
      monthlyLimit: Number(user.monthlyLimit || 0) + product.credits,
      points: Number(user.points || 0) + product.credits,
      pendingPayment: false,
      paymentStatus: 'approved',
      paymentApprovedAt: now,
      requestedTier: null,
      lastMonthlyRefillDate: new Date().toISOString().slice(0, 7),
    };

    if (product.type === 'premium') {
      updates.tier = 'premium';
      updates.weeklyLimit = product.credits;
      updates.monthlyLimit = product.credits;
      updates.subscriptionStartedAt = now;
      updates.subscriptionExpiresAt = adminTimestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      updates.subscriptionDurationDays = 30;
      updates.subscriptionDurationLabel = '1 month';
      updates.subscriptionPlanName = 'Premium';
    }

    transaction.set(paymentRef, {
      ...payload,
      productId: product.id,
      userId,
      createdAt: now,
    });
    transaction.update(invoiceRef, {
      status: 'completed',
      paymentId,
      paidAt: now,
      updatedAt: now,
      rawWebhook: payload,
    });
    transaction.set(userRef.collection('payments').doc(invoiceId), {
      ...payload,
      productId: product.id,
      paymentId,
      status: 'completed',
      createdAt: now,
    });
    transaction.update(userRef, updates);

    return { userId, credits: product.credits, plan: product.plan, invoiceId, paymentId };
  });
};

export const failInvoice = async (invoiceId: string, reason: string, raw?: any) => {
  if (!invoiceId) return;
  const db = getAdminDb();
  await db.collection('taurusPayInvoices').doc(invoiceId).set({
    status: reason.includes('overpay') ? 'manual_review' : 'failed',
    failureReason: reason,
    rawWebhook: raw || null,
    updatedAt: adminFieldValue.serverTimestamp(),
  }, { merge: true });
};
