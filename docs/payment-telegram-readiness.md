# Payment and Telegram Readiness

Payments are intentionally disabled until plan prices, credit quantities, refund terms, and provider contracts are approved.

## Payment channels

- Digital plans sold inside a Telegram bot or Mini App must use Telegram Stars (`XTR`).
- TON or USDT checkout must remain an external website flow. Do not use it as an in-Telegram substitute for Stars.
- A connected TON wallet address is not proof of ownership. Before TON or USDT checkout is enabled, the backend must verify a short-lived `ton_proof` containing a server nonce, the exact application domain, timestamp, network, address, and signature.

## Current fail-closed controls

- `PAYMENTS_ENABLED` defaults to `false`.
- No price is accepted from the browser.
- TaurusPay products must be configured server-side before invoice creation can work.
- TaurusPay webhook fulfillment requires a raw-body HMAC, a timestamp within five minutes, exact invoice values, and a unique provider payment ID.
- Payment fulfillment is a Firestore transaction and cannot credit the same provider payment twice.
- Raw provider payloads are not returned to browsers or stored as payment records.

## Telegram webhook controls

- Validate `X-Telegram-Bot-Api-Secret-Token` with the server-only webhook secret.
- Store and deduplicate every `update_id`.
- Keep the bot token and webhook secret in Vercel Sensitive Environment Variables.
- Subscribe only to the update types the bot needs.
- Do not place a browser challenge on `/api/telegram-webhook`; Telegram cannot complete it.
- Apply an IP rate limit that denies excess requests instead of presenting a JavaScript challenge.
- Never identify an account by Telegram username. Use numeric Telegram user ID and a short-lived, one-time account-link code.

## Before enabling Telegram Stars

1. Finalize plan IDs, Star prices, credit amounts, and subscription behavior.
2. Add `/terms`, `/paysupport`, and refund handling.
3. Issue invoices only from the server with currency `XTR`.
4. Grant credits only after a verified `successful_payment` update.
5. Store the Telegram payment charge ID and enforce idempotency.
6. Test duplicate updates, delayed updates, refunds, cancellation, and account-link takeover attempts.

## Before enabling TON or USDT

1. Implement and test backend `ton_proof` verification.
2. Verify recipient, token/Jetton contract, amount, network, memo/order ID, and final on-chain transaction state.
3. Never trust a screenshot, browser-supplied transaction hash, connected address alone, or unconfirmed transaction.
4. Keep a low-balance receiving wallet separate from treasury storage. Never store a seed phrase or private key in this repository or Vercel.
