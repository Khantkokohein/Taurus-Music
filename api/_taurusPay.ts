import { ApiError } from './_apiError.js';
import { adminFieldValue, adminTimestamp, getAdminDb } from './_firebaseAdmin.js';

export type TaurusProductId = 'credits_50' | 'credits_100' | 'credits_300' | 'premium_150_month';

type TaurusProduct = {
  id: TaurusProductId;
  amount: number;
  asset: 'USDT';
  credits: number;
  type: 'credits' | 'premium';
  plan: '' | 'premium';
  tier?: 'premium';
};

export const TAURUS_SERVICE = 'taurus_studio_music';
const SAFE_ID = /^[a-zA-Z0-9_-]{6,160}$/;
const KNOWN_PRODUCT_IDS = new Set<TaurusProductId>([
  'credits_50',
  'credits_100',
  'credits_300',
  'premium_150_month',
]);

export const assertPaymentsEnabled = () => {
  if (process.env.PAYMENTS_ENABLED !== 'true') {
    throw new ApiError(503, 'PAYMENTS_DISABLED', 'Payments are not available yet.');
  }
};

const httpsUrl = (name: string) => {
  const value = String(process.env[name] || '').trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(503, 'PAYMENT_CONFIG_INVALID', 'Payment service is not configured.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new ApiError(503, 'PAYMENT_CONFIG_INVALID', 'Payment service is not configured.');
  }
  return url;
};

export const getTaurusPayConfig = () => {
  assertPaymentsEnabled();
  const recipient = String(process.env.TAURUSPAY_USDT_ADDRESS || '').trim();
  if (!recipient) {
    throw new ApiError(503, 'PAYMENT_CONFIG_INVALID', 'Payment service is not configured.');
  }
  return {
    baseUrl: httpsUrl('TAURUSPAY_BASE_URL'),
    callbackUrl: httpsUrl('TAURUSPAY_CALLBACK_URL'),
    recipient,
  };
};

const readProducts = (): Record<string, TaurusProduct> => {
  assertPaymentsEnabled();
  const raw = String(process.env.TAURUSPAY_PRODUCTS_JSON || '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(503, 'PAYMENT_PRODUCTS_NOT_CONFIGURED', 'Payment plans are not configured yet.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(503, 'PAYMENT_PRODUCTS_NOT_CONFIGURED', 'Payment plans are not configured yet.');
  }

  const products: Record<string, TaurusProduct> = {};
  for (const [id, value] of Object.entries(parsed as Record<string, any>)) {
    if (!KNOWN_PRODUCT_IDS.has(id as TaurusProductId)) continue;
    const amount = Number(value?.amount);
    const credits = Number(value?.credits);
    const type = value?.type === 'premium' ? 'premium' : 'credits';
    if (
      !Number.isFinite(amount)
      || amount <= 0
      || !Number.isInteger(credits)
      || credits <= 0
      || credits > 100_000
      || value?.asset !== 'USDT'
    ) {
      throw new ApiError(503, 'PAYMENT_PRODUCTS_INVALID', 'Payment plans are not configured correctly.');
    }
    products[id] = {
      id: id as TaurusProductId,
      amount,
      asset: 'USDT',
      credits,
      type,
      plan: type === 'premium' ? 'premium' : '',
      ...(type === 'premium' ? { tier: 'premium' as const } : {}),
    };
  }
  return products;
};

export const getProduct = (productId: string) => {
  const product = readProducts()[productId];
  if (!product) throw new ApiError(400, 'PAYMENT_PRODUCT_INVALID', 'Invalid payment product.');
  return product;
};

const usdtMicros = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 1_000_000) : -1;
};

export const assertExactPayment = (payload: any, product = getProduct(payload?.productId || '')) => {
  if (payload?.service !== TAURUS_SERVICE) throw new ApiError(400, 'PAYMENT_SERVICE_MISMATCH', 'Wrong payment service.');
  if (payload?.status !== 'completed') throw new ApiError(409, 'PAYMENT_NOT_COMPLETED', 'Payment is not completed.');
  if (payload?.asset !== product.asset) throw new ApiError(400, 'PAYMENT_ASSET_MISMATCH', 'Wrong payment asset.');
  if (usdtMicros(payload?.amount) !== usdtMicros(product.amount)) {
    throw new ApiError(400, 'PAYMENT_AMOUNT_MISMATCH', 'Payment amount does not match the invoice.');
  }
  if (payload?.type !== product.type) throw new ApiError(400, 'PAYMENT_TYPE_MISMATCH', 'Payment type does not match.');
  if (Number(payload?.credits) !== product.credits) throw new ApiError(400, 'PAYMENT_CREDITS_MISMATCH', 'Payment credits do not match.');
};

export const taurusPayFetch = async (path: string, init?: RequestInit) => {
  const config = getTaurusPayConfig();
  const apiKey = String(process.env.TAURUSPAY_API_KEY || '');
  if (!apiKey) throw new ApiError(503, 'PAYMENT_CONFIG_INVALID', 'Payment service is not configured.');
  const url = new URL(path, config.baseUrl);
  if (url.origin !== config.baseUrl.origin) {
    throw new ApiError(500, 'PAYMENT_URL_BLOCKED', 'Payment request was blocked.', false);
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(502, 'PAYMENT_PROVIDER_FAILED', 'Payment provider request failed.');
  }
  return payload;
};

export const applyTaurusPayment = async (payload: any) => {
  const product = getProduct(payload.productId);
  assertExactPayment(payload, product);

  const db = getAdminDb();
  const invoiceId = String(payload.invoiceId || '');
  const paymentId = String(payload.paymentId || '');
  if (!SAFE_ID.test(invoiceId) || !SAFE_ID.test(paymentId)) {
    throw new ApiError(400, 'PAYMENT_IDENTIFIERS_INVALID', 'Payment identifiers are invalid.');
  }

  const invoiceRef = db.collection('taurusPayInvoices').doc(invoiceId);
  const paymentRef = db.collection('taurusPayPayments').doc(paymentId);

  return db.runTransaction(async (transaction) => {
    const [invoiceSnap, paymentSnap] = await Promise.all([
      transaction.get(invoiceRef),
      transaction.get(paymentRef),
    ]);
    if (!invoiceSnap.exists) throw new ApiError(404, 'PAYMENT_INVOICE_NOT_FOUND', 'Invoice not found.');

    const invoice = invoiceSnap.data() || {};
    if (invoice.status === 'completed') {
      if (invoice.paymentId === paymentId || paymentSnap.exists) {
        return { userId: invoice.userId, credits: product.credits, plan: product.plan, invoiceId, paymentId, alreadyApplied: true };
      }
      throw new ApiError(409, 'PAYMENT_INVOICE_ALREADY_USED', 'Invoice was already completed.');
    }
    if (paymentSnap.exists) throw new ApiError(409, 'PAYMENT_DUPLICATE', 'Duplicate payment.');
    if (invoice.productId !== product.id) throw new ApiError(400, 'PAYMENT_PRODUCT_MISMATCH', 'Invoice product does not match.');
    if (usdtMicros(invoice.amount) !== usdtMicros(product.amount)) throw new ApiError(400, 'PAYMENT_AMOUNT_MISMATCH', 'Invoice amount does not match.');
    if (invoice.asset !== product.asset) throw new ApiError(400, 'PAYMENT_ASSET_MISMATCH', 'Invoice asset does not match.');

    const userId = String(invoice.userId || '');
    if (!userId) throw new ApiError(400, 'PAYMENT_USER_MISSING', 'Invoice user is missing.');
    const userRef = db.collection('users').doc(userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new ApiError(404, 'PAYMENT_USER_NOT_FOUND', 'User not found.');
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

    const paymentRecord = {
      provider: 'tauruspay',
      invoiceId,
      paymentId,
      productId: product.id,
      userId,
      amount: product.amount,
      asset: product.asset,
      credits: product.credits,
      status: 'completed',
      createdAt: now,
    };
    transaction.create(paymentRef, paymentRecord);
    transaction.update(invoiceRef, {
      status: 'completed',
      paymentId,
      paidAt: now,
      updatedAt: now,
    });
    transaction.create(userRef.collection('payments').doc(invoiceId), paymentRecord);
    transaction.update(userRef, updates);

    return { userId, credits: product.credits, plan: product.plan, invoiceId, paymentId };
  });
};

export const failInvoice = async (invoiceId: string, reason: string) => {
  if (!SAFE_ID.test(invoiceId)) return;
  await getAdminDb().collection('taurusPayInvoices').doc(invoiceId).set({
    status: reason.includes('overpay') ? 'manual_review' : 'failed',
    failureReason: reason.slice(0, 160),
    updatedAt: adminFieldValue.serverTimestamp(),
  }, { merge: true });
};
